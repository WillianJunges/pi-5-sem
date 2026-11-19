import type { Request, Response } from 'express';
import { idParam } from '../../shared/utils/params';
import { fromCents } from '../../shared/utils/money';
import type { Delivery } from './delivery.types';
import { assignDeliverySchema, completeDeliverySchema, listDeliveriesSchema } from './deliveries.schemas';
import { deliveriesService } from './deliveries.service';
import { trackingEvents } from '../tracking/tracking.events';

/** Identidade interna e chave de idempotência não fazem parte dos detalhes da entrega. */
export function toDeliveryResponse({ customerId: _, totalCents, changeForCents, courierEarningsCents, ...delivery }: Delivery, includeEarnings = false) {
  return {
    ...delivery,
    total: fromCents(totalCents),
    changeFor: changeForCents === null ? null : fromCents(changeForCents),
    ...(includeEarnings ? { courierEarnings: courierEarningsCents == null ? null : fromCents(courierEarningsCents) } : {}),
  };
}

export const deliveriesController = {
  async list(req: Request, res: Response) {
    const result = await deliveriesService.list(req.user!, listDeliveriesSchema.parse(req.query));
    res.json({ ...result, deliveries: result.deliveries.map(d => toDeliveryResponse(d, true)) });
  },
  async summary(req: Request, res: Response) {
    const { earningsCents, ...summary } = await deliveriesService.summaryToday(req.user!);
    res.json({ ...summary, earnings: fromCents(earningsCents) });
  },
  async get(req: Request, res: Response) {
    res.json(toDeliveryResponse(await deliveriesService.get(req.user!, idParam(req)), req.user!.role === 'COURIER'));
  },
  async forOrder(req: Request, res: Response) {
    res.json(toDeliveryResponse(await deliveriesService.forOrder(req.user!, idParam(req))));
  },
  async assign(req: Request, res: Response) {
    const { courierId } = assignDeliverySchema.parse(req.body);
    res.json(toDeliveryResponse(await deliveriesService.assign(req.user!, idParam(req), courierId)));
  },
  async start(req: Request, res: Response) {
    res.json(toDeliveryResponse(await deliveriesService.start(req.user!, idParam(req)), true));
  },
  async complete(req: Request, res: Response) {
    const input = completeDeliverySchema.parse(req.body);
    const id = idParam(req);
    const delivery = await deliveriesService.complete(req.user!, id, input);
    trackingEvents.changed(id);
    res.json(toDeliveryResponse(delivery, true));
  },
};
