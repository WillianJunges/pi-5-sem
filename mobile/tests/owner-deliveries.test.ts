import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Delivery } from '../src/services/deliveries.service';

const api = vi.hoisted(() => vi.fn());
vi.mock('../src/services/api', () => ({ api }));

const { canAssignCourier, ownerService } = await import('../src/services/owner.service');

function delivery(overrides: Partial<Delivery> = {}): Delivery {
  return {
    id: 'd1', orderId: 'o1', courierId: null, courierName: null, status: 'WAITING_ASSIGNMENT', orderStatus: 'CONFIRMED',
    customer: { name: 'Ana', phone: null },
    address: { label: null, street: 'Rua Teste', number: '10', complement: null, district: 'Centro',
      city: 'Indaiatuba', state: 'SP', cep: '13330010', latitude: -23.088, longitude: -47.216 },
    notes: null, paymentMethod: 'PIX', total: 26, changeFor: null,
    createdAt: '2026-11-09T14:00:00.000Z', assignedAt: null,
    startedAt: null, completedAt: null, completionReceivedAt: null, cancelledAt: null,
    ...overrides,
  };
}

describe('canAssignCourier', () => {
  it('permite atribuir enquanto o pedido é confirmado, preparado ou fica pronto', () => {
    for (const orderStatus of ['CONFIRMED', 'PREPARING', 'READY'] as const) {
      expect(canAssignCourier(delivery({ orderStatus }))).toBe(true);
    }
  });

  it('permite trocar o motoboy antes da saída', () => {
    expect(canAssignCourier(delivery({ status: 'ASSIGNED', courierId: 'c1', orderStatus: 'READY' }))).toBe(true);
  });

  it('bloqueia depois da saída, na conclusão e no cancelamento', () => {
    expect(canAssignCourier(delivery({ status: 'IN_PROGRESS', courierId: 'c1', orderStatus: 'OUT_FOR_DELIVERY' }))).toBe(false);
    expect(canAssignCourier(delivery({ status: 'COMPLETED', courierId: 'c1', orderStatus: 'DELIVERED' }))).toBe(false);
    expect(canAssignCourier(delivery({ status: 'CANCELLED', orderStatus: 'CANCELLED' }))).toBe(false);
  });
});

describe('ownerService.deliveries', () => {
  beforeEach(() => api.mockReset());

  it('busca a entrega pelo pedido', async () => {
    api.mockResolvedValue(delivery());
    await ownerService.deliveries.forOrder('o1');
    expect(api).toHaveBeenCalledWith('/deliveries/order/o1');
  });

  it('atribui pela rota da proprietária, enviando só o motoboy', async () => {
    api.mockResolvedValue(delivery({ status: 'ASSIGNED', courierId: 'c1' }));
    await ownerService.deliveries.assign('d1', 'c1');
    expect(api).toHaveBeenCalledWith('/owner/deliveries/d1/assign', { method: 'POST', body: { courierId: 'c1' } });
  });
});
