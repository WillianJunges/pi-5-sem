import { expect, it, vi } from 'vitest';
import { OwnerOrdersService } from '../../src/modules/owner-orders/ownerOrders.service';
import type { OwnerOrdersRepository } from '../../src/modules/owner-orders/ownerOrders.repository';
import { ACTION_FLOW } from '../../src/modules/owner-orders/ownerOrders.types';

it('encaminha o motivo junto à atualização condicional do cancelamento', async () => {
  const findById = vi.fn().mockResolvedValueOnce({ id: 'pedido', status: 'PENDING', fulfillment: 'DELIVERY' })
    .mockResolvedValueOnce({ id: 'pedido', status: 'CANCELLED', cancellationReason: 'Produto indisponível' });
  const updateStatus = vi.fn().mockResolvedValue(true);
  const repo = { findById, updateStatus, list: vi.fn() } as OwnerOrdersRepository;
  const result = await new OwnerOrdersService(repo).apply('pedido', 'cancel', 'Produto indisponível');
  expect(updateStatus).toHaveBeenCalledWith('pedido', ACTION_FLOW.cancel.from, 'CANCELLED', 'Produto indisponível');
  expect(result.cancellationReason).toBe('Produto indisponível');
});
