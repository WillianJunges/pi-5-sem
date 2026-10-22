import { AppError } from '../../shared/errors/AppError';
import { type UsersRepository, usersRepository } from '../users/users.repository';
import type { CompleteDeliveryInput, DeliveriesFilter, Delivery, DeliveryActor, LockedDeliveryState } from './delivery.types';
import { type DeliveriesRepository, deliveriesRepository } from './deliveries.repository';

/** Regras de acesso compartilhadas entre consulta, atribuição e ações do motoboy. */
export class DeliveriesService {
  constructor(
    private readonly repo: DeliveriesRepository,
    private readonly users: Pick<UsersRepository, 'findById'>,
  ) {}

  private async authorize(actor: DeliveryActor, role?: DeliveryActor['role']): Promise<void> {
    const user = await this.users.findById(actor.id);
    if (!user?.active || user.role !== actor.role) throw new AppError('Sessão sem permissão. Entre novamente.', 403);
    if (role && actor.role !== role) throw new AppError('Perfil sem permissão para esta operação', 403);
  }

  private readable(delivery: Delivery | null, actor: DeliveryActor): Delivery {
    const allowed = delivery && (actor.role === 'OWNER'
      || (actor.role === 'COURIER' && delivery.courierId === actor.id)
      || (actor.role === 'CUSTOMER' && delivery.customerId === actor.id));
    // Não revela se o UUID existe quando a entrega pertence a outra pessoa.
    if (!allowed) throw new AppError('Entrega não encontrada', 404);
    return delivery;
  }

  async get(actor: DeliveryActor, id: string): Promise<Delivery> {
    await this.authorize(actor);
    return this.readable(await this.repo.findById(id), actor);
  }

  async forOrder(actor: DeliveryActor, orderId: string): Promise<Delivery> {
    await this.authorize(actor);
    return this.readable(await this.repo.findByOrder(orderId), actor);
  }

  async list(actor: DeliveryActor, filter: DeliveriesFilter): Promise<{ deliveries: Delivery[]; hasMore: boolean }> {
    await this.authorize(actor, 'COURIER');
    const rows = await this.repo.listByCourier(actor.id, { ...filter, limit: filter.limit + 1 });
    return { deliveries: rows.slice(0, filter.limit), hasMore: rows.length > filter.limit };
  }

  async assign(actor: DeliveryActor, id: string, courierId: string): Promise<Delivery> {
    await this.authorize(actor, 'OWNER');
    return this.repo.change(id, actor, { type: 'assign', courierId }, current => {
      if (!['WAITING_ASSIGNMENT', 'ASSIGNED'].includes(current.status) || !['CONFIRMED', 'PREPARING', 'READY'].includes(current.orderStatus)) {
        throw new AppError('Só é possível atribuir ou trocar o motoboy antes do início da entrega.', 409);
      }
      if (!current.candidateCourierEligible) throw new AppError('Motoboy indisponível', 409);
      return current.courierId !== courierId; // Repetir a atribuição mantém o horário original.
    });
  }

  async start(actor: DeliveryActor, id: string): Promise<Delivery> {
    await this.authorize(actor, 'COURIER');
    return this.repo.change(id, actor, { type: 'start' }, current => {
      this.requireCourier(current, actor);
      if (current.status === 'IN_PROGRESS' && current.orderStatus === 'OUT_FOR_DELIVERY') return false;
      if (current.status !== 'ASSIGNED' || current.orderStatus !== 'READY') {
        throw new AppError('O pedido precisa estar pronto e a entrega atribuída a você.', 409);
      }
      return true;
    });
  }

  async complete(actor: DeliveryActor, id: string, input: CompleteDeliveryInput): Promise<Delivery> {
    await this.authorize(actor, 'COURIER');
    return this.repo.change(id, actor, { type: 'complete', input }, current => {
      this.requireCourier(current, actor);
      // A resposta perdida só pode ser repetida com a mesma chave e o mesmo conteúdo.
      if (current.status === 'COMPLETED' && current.orderStatus === 'DELIVERED'
        && current.completionKey === input.operationId && current.completedAt?.getTime() === input.completedAt.getTime()) return false;
      if (current.status !== 'IN_PROGRESS' || current.orderStatus !== 'OUT_FOR_DELIVERY') {
        throw new AppError('A entrega já mudou de estado. Consulte o estado atual antes de concluir.', 409);
      }
      // Tolerância de 60s entre relógios; não limita o tempo offline desde o início.
      const timestamp = input.completedAt.getTime();
      if (timestamp > current.serverNow.getTime() + 60_000 || timestamp < current.startedAt!.getTime() - 60_000) {
        throw new AppError('Horário da conclusão incompatível com a entrega. Confira o relógio do aparelho.', 409);
      }
      return true;
    });
  }

  private requireCourier(current: LockedDeliveryState, actor: DeliveryActor): void {
    if (current.courierId !== actor.id) throw new AppError('Entrega não encontrada', 404);
  }
}

export const deliveriesService = new DeliveriesService(deliveriesRepository, usersRepository);
