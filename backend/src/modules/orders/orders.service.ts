import { AppError } from '../../shared/errors/AppError';
import { todayISODate } from '../../shared/utils/date';
import { type AddressesRepository, addressesRepository } from '../addresses/addresses.repository';
import { type DeliveryFeesService, deliveryFeesService } from '../delivery-fees/deliveryFees.service';
import { type Coordinates, geoService, STORE_LOCATION } from '../geo/geo.service';
import type { MenuItemDetail } from '../menus/menu.types';
import { menusRepository } from '../menus/menus.repository';
import type { NewOrder, Order } from './order.types';
import { type OrdersRepository, ordersRepository } from './orders.repository';
import type { CreateOrderInput } from './orders.schemas';

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
  const active = await menusRepository.findActive();
  if (!active || active.menuDate !== todayISODate()) return null;
  return { menuId: active.id, items: await menusRepository.itemDetails(active.id) };
}

const km = (meters: number) => `${(meters / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`;

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

  /** Finaliza o carrinho: valida, calcula os valores e grava o pedido como PENDING. */
  async create(customerId: string, input: CreateOrderInput): Promise<Order> {
    // 1. Endereço do próprio cliente, localizado no mapa
    const address = await this.addresses.findById(customerId, input.addressId);
    if (!address) throw new AppError('Endereço não encontrado', 404);
    if (address.latitude === null || address.longitude === null) {
      throw new AppError(
        'Não conseguimos localizar esse endereço no mapa. Confira a rua e o número em "Meus endereços".',
        422,
      );
    }
    const destination = { latitude: address.latitude, longitude: address.longitude };

    // 2. Itens com o preço que vale hoje (já com preço especial), direto do cardápio
    const menu = await this.todayMenu();
    if (!menu) throw new AppError('Não há cardápio disponível hoje', 409);

    // a mesma variação repetida no carrinho vira um item só
    const quantities = new Map<string, number>();
    for (const { variantId, quantity } of input.items) {
      quantities.set(variantId, (quantities.get(variantId) ?? 0) + quantity);
    }

    const items: NewOrder['items'] = [];
    for (const [variantId, quantity] of quantities) {
      const item = menu.items.find((i) => i.variantId === variantId && i.available);
      if (!item) throw new AppError('Um dos itens do carrinho não está mais disponível no cardápio de hoje', 409);
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

    // 3. Distância pelas ruas e taxa da faixa cadastrada pela proprietária
    const distanceMeters = await this.drivingDistance(this.store, destination);
    const fee = await this.fees.quote(distanceMeters);
    if (!fee.covered) {
      throw new AppError(`Esse endereço está fora da área de entrega (${km(distanceMeters)} da marmitaria).`, 422);
    }

    // 4. Valores (em centavos, sem erro de arredondamento)
    const subtotalCents = items.reduce((sum, i) => sum + i.subtotalCents, 0);
    const totalCents = subtotalCents + fee.feeCents;

    // 5. Pagamento: troco só para dinheiro, e precisa cobrir o total
    let changeForCents: number | null = null;
    if (input.paymentMethod === 'CASH' && input.changeFor !== null) {
      if (input.changeFor < totalCents) {
        throw new AppError('O valor para troco precisa ser maior ou igual ao total do pedido', 400);
      }
      changeForCents = input.changeFor;
    }

    const id = await this.orders.create(customerId, {
      menuId: menu.menuId,
      paymentMethod: input.paymentMethod,
      changeForCents,
      notes: input.notes,
      address: {
        addressId: address.id,
        label: address.label,
        cep: address.cep,
        street: address.street,
        number: address.number,
        complement: address.complement,
        district: address.district,
        city: address.city,
        state: address.state,
        ...destination,
      },
      distanceMeters,
      subtotalCents,
      deliveryFeeCents: fee.feeCents,
      totalCents,
      items,
    });

    // ------------------------------------------------------------------------------------
    // INTEGRAÇÃO COM OS OUTROS MÓDULOS — ainda não feita, combinar com a equipe:
    //
    // [Lucas · Proprietária] Notificar a proprietária de "Novo pedido" (escopo, seção 22).
    //   O pedido já está gravado como PENDING; a tela/rota de administração de pedidos
    //   (GET /owner/orders, confirmar, preparar, pronto, cancelar) lê da tabela `orders`.
    //   Ao mudar o status, preencher a coluna de horário correspondente (confirmed_at,
    //   preparing_at, ready_at...). Valores e itens do pedido não devem ser alterados.
    //
    // [Lucas + Yuri · Entregas] O escopo (seção 12) separa pedido e entrega (tabela
    //   `deliveries`, estados WAITING_ASSIGNMENT → ASSIGNED → IN_PROGRESS → COMPLETED).
    //   Falta decidir QUEM cria a entrega: aqui, logo após criar o pedido (como
    //   WAITING_ASSIGNMENT), ou quando a proprietária confirma/atribui o motoboy.
    //   O endereço da entrega já está copiado no pedido (colunas address_*, com latitude e
    //   longitude) e a distância calculada fica em `orders.distance_meters`.
    //   Para distâncias/rotas no rastreamento, reutilizar geoService.drivingDistanceMeters.
    //
    // [Opcional · MongoDB] docs/banco-nao-relacional.md propõe a coleção `orders`
    //   desnormalizada; dá para gravar a cópia aqui, seguindo o padrão de access-logs.
    // ------------------------------------------------------------------------------------

    return this.get(customerId, id);
  }
}

export const ordersService = new OrdersService(ordersRepository, addressesRepository, deliveryFeesService);
