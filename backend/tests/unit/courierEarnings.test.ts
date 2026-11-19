import { describe, expect, it, vi } from 'vitest';
import { DeliveriesService } from '../../src/modules/deliveries/deliveries.service';
import { toDeliveryResponse } from '../../src/modules/deliveries/deliveries.controller';
import type { DeliveriesRepository } from '../../src/modules/deliveries/deliveries.repository';
import type { Delivery } from '../../src/modules/deliveries/delivery.types';

describe('resumo de ganhos do motoboy', () => {
  it('usa somente a identidade do motoboy autenticado', async () => {
    const summaryToday = vi.fn().mockResolvedValue({ date: '2026-11-19', count: 2, earningsCents: 1400, unknownCount: 0 });
    const repo = { summaryToday } as unknown as DeliveriesRepository;
    const service = new DeliveriesService(repo, { findById: async () => ({ active: true, role: 'COURIER' } as never) });
    expect(await service.summaryToday({ id: 'courier-1', role: 'COURIER' })).toMatchObject({ count: 2, earningsCents: 1400 });
    expect(summaryToday).toHaveBeenCalledWith('courier-1');
  });

  it('recusa acesso de outro perfil', async () => {
    const summaryToday = vi.fn();
    const service = new DeliveriesService({ summaryToday } as unknown as DeliveriesRepository,
      { findById: async () => ({ active: true, role: 'CUSTOMER' } as never) });
    await expect(service.summaryToday({ id: 'customer-1', role: 'CUSTOMER' })).rejects.toMatchObject({ statusCode: 403 });
    expect(summaryToday).not.toHaveBeenCalled();
  });

  it('mostra ganho apenas quando solicitado para o motoboy', () => {
    const delivery = { totalCents: 2500, changeForCents: null, courierEarningsCents: 700 } as Delivery;
    expect(toDeliveryResponse(delivery, true)).toMatchObject({ total: 25, courierEarnings: 7 });
    expect(toDeliveryResponse(delivery)).not.toHaveProperty('courierEarnings');
    expect(toDeliveryResponse({ ...delivery, courierEarningsCents: null }, true).courierEarnings).toBeNull();
  });
});
