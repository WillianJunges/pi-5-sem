import { beforeEach, describe, expect, it } from 'vitest';
import type { Address } from '../../src/modules/addresses/address.types';
import { DeliveryFeesService } from '../../src/modules/delivery-fees/deliveryFees.service';
import type { MenuItemDetail } from '../../src/modules/menus/menu.types';
import type { CancelledBy, NewOrder, Order, OrderStatus, OrderSummary } from '../../src/modules/orders/order.types';
import type { OrdersRepository } from '../../src/modules/orders/orders.repository';
import { cancelOrderSchema, createOrderSchema, listOrdersSchema } from '../../src/modules/orders/orders.schemas';
import { OrdersService, type TodayMenu } from '../../src/modules/orders/orders.service';
import { expectAppError } from '../support/expectError';
import { MemoryDeliveryFeesRepository } from '../support/memoryRepositories';

const CUSTOMER = 'c1';
const STORE = { latitude: -23.085755, longitude: -47.202467 };

function address(overrides: Partial<Address> = {}): Address {
  return {
    id: 'a1',
    userId: CUSTOMER,
    label: 'Casa',
    cep: '13330010',
    street: 'Rua Prudente de Moraes',
    number: '100',
    complement: null,
    district: 'Centro',
    city: 'Indaiatuba',
    state: 'SP',
    latitude: -23.088,
    longitude: -47.216,
    isDefault: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function menuItem(variantId: string, standard: number, special: number | null = null, available = true): MenuItemDetail {
  return {
    itemId: `i-${variantId}`,
    productId: `p-${variantId}`,
    productName: `Produto ${variantId}`,
    productDescription: null,
    category: null,
    variantId,
    variantName: 'Média',
    standardPriceCents: standard,
    specialPriceCents: special,
    effectivePriceCents: special ?? standard,
    available,
  };
}

/** Guarda o que seria gravado no MySQL. */
class MemoryOrdersRepository implements OrdersRepository {
  saved: (NewOrder & {
    customerId: string;
    id: string;
    status: OrderStatus;
    cancelledBy: CancelledBy | null;
    cancellationReason: string | null;
  })[] = [];
  async create(customerId: string, order: NewOrder) {
    const id = `o${this.saved.length + 1}`;
    this.saved.push({ ...order, customerId, id, status: 'PENDING', cancelledBy: null, cancellationReason: null });
    return id;
  }
  /** Mesmo WHERE do MySQL: só do cliente e só se ainda estiver PENDING. */
  async cancelByCustomer(customerId: string, id: string, reason: string | null) {
    const o = this.saved.find((s) => s.id === id && s.customerId === customerId && s.status === 'PENDING');
    if (!o) return false;
    Object.assign(o, { status: 'CANCELLED', cancelledBy: 'CUSTOMER', cancellationReason: reason });
    return true;
  }
  async findByCustomer(customerId: string, id: string) {
    const o = this.saved.find((s) => s.id === id && s.customerId === customerId);
    if (!o) return null;
    return {
      ...o,
      items: o.items.map((i, n) => ({ ...i, id: `oi${n}` })),
      createdAt: new Date(),
      confirmedAt: null,
      preparingAt: null,
      readyAt: null,
      outForDeliveryAt: null,
      deliveredAt: null,
      cancelledAt: null,
    } satisfies Order;
  }
  async listByCustomer(customerId: string, limit: number, offset: number): Promise<OrderSummary[]> {
    return this.saved
      .filter((o) => o.customerId === customerId)
      .reverse() // mais novos primeiro
      .slice(offset, offset + limit)
      .map((o) => ({
        id: o.id,
        status: 'PENDING',
        isActive: true,
        paymentMethod: o.paymentMethod,
        addressLabel: o.address.label,
        addressStreet: o.address.street,
        addressNumber: o.address.number,
        totalCents: o.totalCents,
        itemCount: o.items.reduce((sum, i) => sum + i.quantity, 0),
        itemsSummary: '',
        createdAt: new Date(),
      }));
  }
}

/** Corpo do POST /orders passando pelo schema (como faz o controller). */
const body = (data: Record<string, unknown>) =>
  createOrderSchema.parse({ addressId: '6f1c2a10-0000-4000-8000-000000000001', paymentMethod: 'PIX', ...data });
const V1 = '6f1c2a10-0000-4000-8000-0000000000a1';
const V2 = '6f1c2a10-0000-4000-8000-0000000000a2';
const GONE = '6f1c2a10-0000-4000-8000-0000000000ff';

describe('Pedidos — cálculo e validação', () => {
  let orders: MemoryOrdersRepository;
  let addresses: Address[];
  let menu: TodayMenu | null;
  let distance: number;
  let service: OrdersService;

  beforeEach(async () => {
    orders = new MemoryOrdersRepository();
    addresses = [address({ id: '6f1c2a10-0000-4000-8000-000000000001' })];
    // V1: R$ 22,00 com preço do dia R$ 19,90 (exemplo do escopo); V2: R$ 5,00
    menu = { menuId: 'm1', items: [menuItem(V1, 2200, 1990), menuItem(V2, 500), menuItem(GONE, 900, null, false)] };
    distance = 3200;
    const fees = new DeliveryFeesService(new MemoryDeliveryFeesRepository());
    await fees.create({ minMeters: 0, maxMeters: 5000, feeCents: 600 });
    await fees.create({ minMeters: 5000, maxMeters: 10000, feeCents: 1000 });
    service = new OrdersService(
      orders,
      { findById: async (userId, id) => addresses.find((a) => a.id === id && a.userId === userId) ?? null },
      fees,
      async () => menu,
      async () => distance,
      STORE,
    );
  });

  it('usa o preço especial, soma subtotal + taxa e grava em centavos', async () => {
    const order = await service.create(CUSTOMER, body({ items: [{ variantId: V1, quantity: 2 }, { variantId: V2, quantity: 1 }] }));
    // 2 × 19,90 + 5,00 = 44,80; 3,2 km → R$ 6,00
    expect(order).toMatchObject({ subtotalCents: 4480, deliveryFeeCents: 600, totalCents: 5080, distanceMeters: 3200 });
    expect(order.items.find((i) => i.variantId === V1)).toMatchObject({ unitPriceCents: 1990, subtotalCents: 3980 });
  });

  it('ignora preços enviados pelo app', async () => {
    const input = body({ items: [{ variantId: V2, quantity: 1, unitPrice: 0.01 }], total: 0.01 });
    expect((await service.create(CUSTOMER, input)).totalCents).toBe(1100);
  });

  it('junta a mesma variação repetida num item só', async () => {
    const order = await service.create(CUSTOMER, body({ items: [{ variantId: V2, quantity: 2 }, { variantId: V2, quantity: 3 }] }));
    expect(order.items).toHaveLength(1);
    expect(order.items[0]).toMatchObject({ quantity: 5, subtotalCents: 2500 });
  });

  it('quantidade somada acima do limite é recusada', async () => {
    const input = body({ items: [{ variantId: V2, quantity: 30 }, { variantId: V2, quantity: 30 }] });
    await expectAppError(service.create(CUSTOMER, input), 400, /50 unidades/);
  });

  it('faixa de taxa pela distância por vias (limite de 5 km fica na primeira)', async () => {
    distance = 5000;
    expect((await service.quote(CUSTOMER, body({ items: [{ variantId: V2, quantity: 1 }] }))).deliveryFeeCents).toBe(600);
    distance = 5001;
    expect((await service.quote(CUSTOMER, body({ items: [{ variantId: V2, quantity: 1 }] }))).deliveryFeeCents).toBe(1000);
  });

  it('fora da área de entrega: recusa com a distância na mensagem', async () => {
    distance = 10001;
    await expectAppError(service.quote(CUSTOMER, body({ items: [{ variantId: V2, quantity: 1 }] })), 422, /fora da área.*10 km/);
  });

  it('prévia lista os itens que saíram do cardápio sem dar erro', async () => {
    const quote = await service.quote(CUSTOMER, body({ items: [{ variantId: V2, quantity: 1 }, { variantId: GONE, quantity: 1 }] }));
    expect(quote.unavailableVariantIds).toEqual([GONE]);
    expect(quote.subtotalCents).toBe(500);
  });

  it('confirmar com item fora do cardápio é recusado e não grava nada', async () => {
    const input = body({ items: [{ variantId: V2, quantity: 1 }, { variantId: GONE, quantity: 1 }] });
    await expectAppError(service.create(CUSTOMER, input), 409, /saiu do cardápio/);
    expect(orders.saved).toHaveLength(0);
  });

  it('sem cardápio hoje: recusa', async () => {
    menu = null;
    await expectAppError(service.quote(CUSTOMER, body({ items: [{ variantId: V2, quantity: 1 }] })), 409, /não há cardápio/);
  });

  it('total diferente do que o cliente viu na prévia: recusa', async () => {
    const input = body({ items: [{ variantId: V2, quantity: 1 }], expectedTotal: 10 });
    await expectAppError(service.create(CUSTOMER, input), 409, /mudou para R\$ 11,00/);
    expect(orders.saved).toHaveLength(0);
  });

  it('total igual ao da prévia: aceita', async () => {
    const input = body({ items: [{ variantId: V2, quantity: 1 }], expectedTotal: 11 });
    expect((await service.create(CUSTOMER, input)).totalCents).toBe(1100);
  });

  describe('troco', () => {
    const items = [{ variantId: V2, quantity: 1 }]; // total R$ 11,00

    it('troco menor que o total: recusa', async () => {
      await expectAppError(service.create(CUSTOMER, body({ paymentMethod: 'CASH', changeFor: 10.99, items })), 400, /troco/);
    });

    it('troco igual ao total: aceita', async () => {
      expect((await service.create(CUSTOMER, body({ paymentMethod: 'CASH', changeFor: 11, items }))).changeForCents).toBe(1100);
    });

    it('troco em outra forma de pagamento é descartado', async () => {
      expect((await service.create(CUSTOMER, body({ paymentMethod: 'PIX', changeFor: 50, items }))).changeForCents).toBeNull();
    });
  });

  describe('endereço', () => {
    const items = [{ variantId: V2, quantity: 1 }];

    it('de outro cliente: não encontrado', async () => {
      addresses[0] = { ...addresses[0], userId: 'outro' };
      await expectAppError(service.create(CUSTOMER, body({ items })), 404);
    });

    it('sem localização no mapa: recusa', async () => {
      addresses[0] = { ...addresses[0], latitude: null, longitude: null };
      await expectAppError(service.create(CUSTOMER, body({ items })), 422, /localizar/);
    });

    it('o pedido guarda uma cópia do endereço', async () => {
      const order = await service.create(CUSTOMER, body({ items }));
      expect(order.address).toMatchObject({ street: 'Rua Prudente de Moraes', number: '100', latitude: -23.088 });
    });
  });

  describe('histórico (GET /orders)', () => {
    const items = [{ variantId: V2, quantity: 1 }];

    it('lista só os pedidos do próprio cliente, mais novos primeiro', async () => {
      await service.create(CUSTOMER, body({ items }));
      await service.create(CUSTOMER, body({ items: [{ variantId: V2, quantity: 2 }] }));
      await orders.create('outro', (await service.quote(CUSTOMER, body({ items }))) as unknown as NewOrder);
      const { orders: list, hasMore } = await service.list(CUSTOMER, listOrdersSchema.parse({}));
      expect(list.map((o) => o.id)).toEqual(['o2', 'o1']);
      expect(list[0].itemCount).toBe(2);
      expect(hasMore).toBe(false);
    });

    it('pagina e avisa quando há mais pedidos', async () => {
      for (let i = 0; i < 3; i++) await service.create(CUSTOMER, body({ items }));
      const first = await service.list(CUSTOMER, listOrdersSchema.parse({ limit: '2' }));
      expect(first.orders.map((o) => o.id)).toEqual(['o3', 'o2']);
      expect(first.hasMore).toBe(true);
      const second = await service.list(CUSTOMER, listOrdersSchema.parse({ limit: '2', offset: '2' }));
      expect(second.orders.map((o) => o.id)).toEqual(['o1']);
      expect(second.hasMore).toBe(false);
    });

    it.each([{ limit: '0' }, { limit: '51' }, { offset: '-1' }, { limit: 'abc' }])('query inválida %o', (query) => {
      expect(() => listOrdersSchema.parse(query)).toThrow();
    });
  });

  describe('cancelamento pelo cliente (POST /orders/:id/cancel)', () => {
    const cancelBody = (data: unknown) => cancelOrderSchema.parse(data);
    let id: string;

    beforeEach(async () => {
      ({ id } = await service.create(CUSTOMER, body({ items: [{ variantId: V1, quantity: 1 }] })));
    });

    it('cancela pedido PENDING e guarda quem cancelou e o motivo', async () => {
      const order = await service.cancel(CUSTOMER, id, cancelBody({ reason: '  Pedi errado  ' }));
      expect(order.status).toBe('CANCELLED');
      expect(order.cancelledBy).toBe('CUSTOMER');
      expect(order.cancellationReason).toBe('Pedi errado');
    });

    it('motivo é opcional (corpo vazio ou só espaços)', async () => {
      expect(cancelBody(undefined)).toEqual({ reason: null });
      expect(cancelBody({ reason: '   ' })).toEqual({ reason: null });
      const order = await service.cancel(CUSTOMER, id, cancelBody(undefined));
      expect(order.cancellationReason).toBeNull();
    });

    it('motivo com mais de 200 caracteres é recusado', () => {
      expect(() => cancelBody({ reason: 'x'.repeat(201) })).toThrow();
    });

    it('pedido já confirmado pela marmitaria: recusa', async () => {
      orders.saved[0].status = 'CONFIRMED';
      await expectAppError(service.cancel(CUSTOMER, id, cancelBody({})), 409, /já confirmou/);
      expect(orders.saved[0].status).toBe('CONFIRMED');
    });

    it('cancelar duas vezes: recusa a segunda', async () => {
      await service.cancel(CUSTOMER, id, cancelBody({}));
      await expectAppError(service.cancel(CUSTOMER, id, cancelBody({})), 409, /já foi cancelado/);
    });

    it('pedido de outro cliente: 404, sem cancelar', async () => {
      await expectAppError(service.cancel('outro-cliente', id, cancelBody({})), 404);
      expect(orders.saved[0].status).toBe('PENDING');
    });

    it('proprietária confirma no mesmo instante: recusa sem cancelar', async () => {
      // a leitura vê PENDING, mas na hora do UPDATE o pedido já está CONFIRMED
      const read = orders.findByCustomer.bind(orders);
      orders.findByCustomer = async (c, i) => {
        const order = await read(c, i);
        orders.saved[0].status = 'CONFIRMED';
        return order;
      };
      await expectAppError(service.cancel(CUSTOMER, id, cancelBody({})), 409, /acabou de ser atualizado/);
      expect(orders.saved[0].status).toBe('CONFIRMED');
    });
  });

  describe('schema do POST /orders', () => {
    it.each([
      ['carrinho vazio', { items: [] }],
      ['quantidade zero', { items: [{ variantId: V1, quantity: 0 }] }],
      ['quantidade fracionada', { items: [{ variantId: V1, quantity: 1.5 }] }],
      ['forma de pagamento desconhecida', { paymentMethod: 'BOLETO', items: [{ variantId: V1, quantity: 1 }] }],
      ['troco com 3 casas decimais', { changeFor: 50.123, items: [{ variantId: V1, quantity: 1 }] }],
    ])('%s: inválido', (_, data) => {
      expect(() => body(data)).toThrow();
    });
  });
});
