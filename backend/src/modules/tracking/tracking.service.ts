import type { DeliveryActor } from '../deliveries/delivery.types';
import { trackingRepository } from './tracking.repository';
import { trackingEvents } from './tracking.events';
import type { PositionInput } from './tracking.schemas';

/** Publica só depois do commit; identidade, estado e relógio são revalidados sob lock. */
export const trackingService = {
  get(id: string, actor: DeliveryActor) { return trackingRepository.read(id, actor); },
  async update(id: string, actor: DeliveryActor, input: PositionInput) {
    const result = await trackingRepository.write(id, actor, input);
    trackingEvents.changed(id);
    return result;
  },
};
