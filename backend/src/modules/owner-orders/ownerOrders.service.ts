import { AppError } from '../../shared/errors/AppError';
import type { OrderStatus } from '../orders/order.types';
import { type OwnerOrdersFilter, type OwnerOrdersRepository, ownerOrdersRepository } from './ownerOrders.repository';
import { ACTION_FLOW, type OwnerAction, type OwnerOrder, type OwnerOrderSummary } from './ownerOrders.types';

const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'aguardando confirmação',
  CONFIRMED: 'confirmado',
  PREPARING: 'em preparo',
  READY: 'pronto',
  OUT_FOR_DELIVERY: 'saiu para entrega',
  DELIVERED: 'entregue',
  CANCELLED: 'cancelado',
};

const ACTION_VERB: Record<OwnerAction, string> = {
  confirm: 'confirmar',
  prepare: 'iniciar o preparo de',
  ready: 'marcar como pronto',
  pickup: 'marcar como retirado',
  cancel: 'cancelar',
};

/**
 * Administração de pedidos pela proprietária (item 5): consultar, confirmar, iniciar
 * preparo, marcar como pronto e cancelar (escopo, seção 11). Na retirada no local,
 * também marcar como retirado.
 */
export class OwnerOrdersService {
  constructor(private readonly orders: OwnerOrdersRepository) {}

  /** Lista paginada: pede um a mais para saber se existe próxima página. */
  async list(filter: OwnerOrdersFilter): Promise<{ orders: OwnerOrderSummary[]; hasMore: boolean }> {
    const rows = await this.orders.list({ ...filter, limit: filter.limit + 1 });
    return { orders: rows.slice(0, filter.limit), hasMore: rows.length > filter.limit };
  }

  async get(id: string): Promise<OwnerOrder> {
    const order = await this.orders.findById(id);
    if (!order) throw new AppError('Pedido não encontrado', 404);
    return order;
  }

  /** Aplica uma ação; recusa com mensagem clara se o pedido não está no estado certo. */
  async apply(id: string, action: OwnerAction): Promise<OwnerOrder> {
    const order = await this.get(id);
    const { from, to, only } = ACTION_FLOW[action];
    if (only === 'PICKUP' && order.fulfillment !== 'PICKUP') {
      throw new AppError('Este pedido é para entrega: quem marca como entregue é o motoboy.', 409);
    }
    if (!from.includes(order.status)) {
      throw new AppError(
        `Não é possível ${ACTION_VERB[action]} um pedido ${STATUS_LABEL[order.status]}.`,
        409,
      );
    }
    const changed = await this.orders.updateStatus(id, from, to);
    if (!changed) {
      // outra tela mudou o pedido entre a leitura e a gravação
      const current = await this.get(id);
      throw new AppError(`O pedido foi atualizado e agora está ${STATUS_LABEL[current.status]}. Confira e tente de novo.`, 409);
    }
    return this.get(id);
  }
}

export const ownerOrdersService = new OwnerOrdersService(ownerOrdersRepository);
