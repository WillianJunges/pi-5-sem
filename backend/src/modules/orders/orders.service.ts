import { AppError } from '../../shared/errors/AppError';
import { todayISODate } from '../../shared/utils/date';
import { type AddressesRepository, addressesRepository } from '../addresses/addresses.repository';
import { type DeliveryFeesService, deliveryFeesService } from '../delivery-fees/deliveryFees.service';
import { type Coordinates, geoService, STORE_LOCATION } from '../geo/geo.service';
import type { MenuItemDetail } from '../menus/menu.types';
import { menusRepository } from '../menus/menus.repository';
import { isBusinessOpen } from '../owner/businessHours';
import type { NewOrder, Order, OrderAddress, OrderQuote, OrderSummary } from './order.types';
import { type OrdersRepository, ordersRepository } from './orders.repository';
import {
  type CancelOrderInput,
  type CreateOrderInput,
  type ListOrdersInput,
  MAX_ITEM_QUANTITY,
  type QuoteOrderInput,
} from './orders.schemas';

/** Cardápio ativo de hoje com os itens (nomes e preços já resolvidos pela view vw_menu_items). */
export interface TodayMenu {
  menuId: string;
  items: MenuItemDetail[];
}

/**
 * Mesma regra de menusService.priceForOrder (módulo da Proprietária): só vale o cardápio
 * ATIVO cuja data é hoje. Lido uma vez só para o pedido inteiro, em vez de uma consulta
 * por item, e já traz os nomes que o pedido copia.
 */
async function loadTodayMenu(): Promise<TodayMenu | null> {
  if (!await isBusinessOpen()) return null;
  const active = await menusRepository.findActive();
  if (!active || active.menuDate !== todayISODate()) return null;
  return { menuId: active.id, items: await menusRepository.itemDetails(active.id) };
}

const km = (meters: number) => `${(meters / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`;
const brl = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\s/g, ' ');

/**
 * Pedidos do cliente (escopo, seções 9, 10, 11, 18 e 19).
 * Regra principal: o app manda só variação + quantidade. Preço, distância, taxa e total
 * são SEMPRE calculados aqui; o app não é fonte confiável de valores (seção 10).
 */
export class OrdersService {
  constructor(
    private readonly orders: OrdersRepository,
    private readonly addresses: Pick<AddressesRepository, 'findById'>,
    private readonly fees: Pick<DeliveryFeesService, 'quote'>,
    private readonly todayMenu: () => Promise<TodayMenu | null> = loadTodayMenu,
    private readonly drivingDistance: (from: Coordinates, to: Coordinates) => Promise<number> = (from, to) =>
      geoService.drivingDistanceMeters(from, to),
    private readonly store: Coordinates = STORE_LOCATION,
  ) {}

  async get(customerId: string, id: string): Promise<Order> {
    const order = await this.orders.findByCustomer(customerId, id);
    if (!order) throw new AppError('Pedido não encontrado', 404);
    return order;
  }

  /** Histórico (GET /orders): pede um a mais para saber se existe próxima página. */
  async list(customerId: string, { limit, offset }: ListOrdersInput): Promise<{ orders: OrderSummary[]; hasMore: boolean }> {
    const rows = await this.orders.listByCustomer(customerId, limit + 1, offset);
    return { orders: rows.slice(0, limit), hasMore: rows.length > limit };
  }

  /**
   * Cancelamento pelo cliente (POST /orders/:id/cancel). Escopo, seção 11: só enquanto
   * o pedido aguarda confirmação (PENDING); depois disso, só a marmitaria cancela.
   */
  async cancel(customerId: string, id: string, { reason }: CancelOrderInput): Promise<Order> {
    const order = await this.get(customerId, id);
    if (order.status === 'CANCELLED') throw new AppError('Este pedido já foi cancelado.', 409);
    if (order.status !== 'PENDING') {
      throw new AppError(
        'A marmitaria já confirmou este pedido, então ele não pode mais ser cancelado pelo app. Fale com a marmitaria.',
        409,
      );
    }
    const changed = await this.orders.cancelByCustomer(customerId, id, reason);
    // A proprietária confirmou (ou cancelou) entre a leitura e a gravação.
    if (!changed) throw new AppError('O pedido acabou de ser atualizado pela marmitaria. Confira o status.', 409);

    // INTEGRAÇÃO [Lucas · Proprietária] Notificar "Pedido cancelado pelo cliente" (escopo,
    //   seção 22, item 8 do Lucas). O pedido já fica com cancelled_by = 'CUSTOMER' e o
    //   motivo em cancellation_reason, e os dois aparecem em GET /owner/orders/:id.
    return this.get(customerId, id);
  }

  /**
   * Prévia do pedido (POST /orders/quote): preços de hoje, distância, taxa e total, sem gravar.
   * Itens que saíram do cardápio NÃO dão erro aqui: voltam em `unavailableVariantIds` para o
   * app mostrar quais são; o subtotal considera só os disponíveis.
   * Endereço sem localização, fora da área ou dia sem cardápio dão erro (não há o que calcular).
   * Retirada no local: sem endereço, sem distância e sem taxa (total = subtotal).
   */
  async quote(customerId: string, input: QuoteOrderInput): Promise<OrderQuote> {
    // 1. Endereço do próprio cliente, localizado no mapa (só na entrega)
    const address = input.fulfillment === 'DELIVERY' ? await this.deliveryAddress(customerId, input.addressId) : null;

    // 2. Itens com o preço que vale hoje (já com preço especial), direto do cardápio
    const menu = await this.todayMenu();
    if (!menu) throw new AppError('A marmitaria não está recebendo pedidos agora: não há cardápio para hoje.', 409);

    // a mesma variação repetida no carrinho vira um item só
    const quantities = new Map<string, number>();
    for (const { variantId, quantity } of input.items) {
      quantities.set(variantId, (quantities.get(variantId) ?? 0) + quantity);
    }

    const items: NewOrder['items'] = [];
    const unavailableVariantIds: string[] = [];
    for (const [variantId, quantity] of quantities) {
      if (quantity > MAX_ITEM_QUANTITY) {
        throw new AppError(`No máximo ${MAX_ITEM_QUANTITY} unidades por item`, 400);
      }
      const item = menu.items.find((i) => i.variantId === variantId && i.available && i.availability !== 'SOLD_OUT');
      if (!item) {
        unavailableVariantIds.push(variantId);
        continue;
      }
      items.push({
        productId: item.productId,
        variantId,
        productName: item.productName,
        variantName: item.variantName,
        quantity,
        unitPriceCents: item.effectivePriceCents,
        subtotalCents: item.effectivePriceCents * quantity,
      });
    }

    // 3. Distância pelas ruas e taxa da faixa cadastrada pela proprietária (só na entrega)
    let distanceMeters: number | null = null;
    let deliveryFeeCents = 0;
    if (address) {
      distanceMeters = await this.drivingDistance(this.store, {
        latitude: address.latitude,
        longitude: address.longitude,
      });
      const fee = await this.fees.quote(distanceMeters);
      if (!fee.covered) {
        throw new AppError(`Esse endereço está fora da área de entrega (${km(distanceMeters)} da marmitaria).`, 422);
      }
      deliveryFeeCents = fee.feeCents;
    }

    // 4. Valores (em centavos, sem erro de arredondamento)
    const subtotalCents = items.reduce((sum, i) => sum + i.subtotalCents, 0);
    return {
      menuId: menu.menuId,
      fulfillment: input.fulfillment,
      address,
      items,
      unavailableVariantIds,
      distanceMeters,
      subtotalCents,
      deliveryFeeCents,
      totalCents: subtotalCents + deliveryFeeCents,
    };
  }

  /** Cópia do endereço de entrega do próprio cliente; recusa se não foi localizado no mapa. */
  private async deliveryAddress(customerId: string, addressId: string | null): Promise<OrderAddress> {
    const address = addressId ? await this.addresses.findById(customerId, addressId) : null;
    if (!address) throw new AppError('Endereço não encontrado', 404);
    if (address.latitude === null || address.longitude === null) {
      throw new AppError(
        'Não conseguimos localizar esse endereço no mapa. Confira a rua e o número em "Meus endereços".',
        422,
      );
    }
    return {
      addressId: address.id,
      label: address.label,
      cep: address.cep,
      street: address.street,
      number: address.number,
      complement: address.complement,
      district: address.district,
      city: address.city,
      state: address.state,
      latitude: address.latitude,
      longitude: address.longitude,
    };
  }

  /** Finaliza o carrinho: recalcula tudo (como na prévia), valida e grava o pedido como PENDING. */
  async create(customerId: string, input: CreateOrderInput): Promise<Order> {
    const quote = await this.quote(customerId, input);

    const missing = quote.unavailableVariantIds.length;
    if (missing > 0) {
      throw new AppError(
        missing === 1
          ? 'Um item do carrinho saiu do cardápio de hoje. Volte ao carrinho para revisar.'
          : `${missing} itens do carrinho saíram do cardápio de hoje. Volte ao carrinho para revisar.`,
        409,
      );
    }

    // o preço (ou a taxa) mudou entre a prévia e a confirmação: o cliente precisa ver o novo total
    if (input.expectedTotal !== undefined && input.expectedTotal !== quote.totalCents) {
      throw new AppError(
        `O total do pedido mudou para ${brl(quote.totalCents)}. Confira os valores antes de confirmar.`,
        409,
      );
    }

    // Pagamento: troco só para dinheiro, e precisa cobrir o total
    let changeForCents: number | null = null;
    if (input.paymentMethod === 'CASH' && input.changeFor !== null) {
      if (input.changeFor < quote.totalCents) {
        throw new AppError(`O troco precisa ser para pelo menos ${brl(quote.totalCents)} (o total do pedido).`, 400);
      }
      changeForCents = input.changeFor;
    }

    const id = await this.orders.create(customerId, {
      menuId: quote.menuId,
      fulfillment: quote.fulfillment,
      paymentMethod: input.paymentMethod,
      changeForCents,
      notes: input.notes,
      address: quote.address,
      distanceMeters: quote.distanceMeters,
      subtotalCents: quote.subtotalCents,
      deliveryFeeCents: quote.deliveryFeeCents,
      totalCents: quote.totalCents,
      items: quote.items.map(item => ({ ...item, notes: input.items.find(i => i.variantId === item.variantId)?.notes || null })),
    });

    // ------------------------------------------------------------------------------------
    // INTEGRAÇÃO COM OS OUTROS MÓDULOS — ainda não feita, combinar com a equipe:
    //
    // [Lucas · Proprietária] Notificar a proprietária de "Novo pedido" (escopo, seção 22).
    //   O pedido já está gravado como PENDING; a tela/rota de administração de pedidos
    //   (GET /owner/orders, confirmar, preparar, pronto, cancelar) lê da tabela `orders`.
    //   Basta fazer UPDATE orders SET status = ...: o trigger trg_orders_before_update
    //   (database/schema/019) recusa transições fora do fluxo da seção 11 e preenche
    //   sozinho o horário (confirmed_at, preparing_at...). Valores e itens não mudam.
    //
    // [Yuri · Entregas] A migration 026 cria a Delivery quando a proprietária confirma
    //   um pedido DELIVERY. O trigger copia este endereço e participa da confirmação.
    //   Pedidos PICKUP não geram entrega e continuam usando a ação de retirada.
    //
    // [Opcional · MongoDB] docs/banco-nao-relacional.md propõe a coleção `orders`
    //   desnormalizada; dá para gravar a cópia aqui, seguindo o padrão de access-logs.
    // ------------------------------------------------------------------------------------

    return this.get(customerId, id);
  }
}

export const ordersService = new OrdersService(ordersRepository, addressesRepository, deliveryFeesService);
