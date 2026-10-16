import type { Request, Response } from 'express';
import { idParam } from '../../shared/utils/params';
import { feeRangeSchema, presentQuote, presentRange, quoteQuerySchema } from './deliveryFees.schemas';
import { deliveryFeesService } from './deliveryFees.service';

export const deliveryFeesController = {
  async list(_req: Request, res: Response) {
    res.json((await deliveryFeesService.list()).map(presentRange));
  },

  async create(req: Request, res: Response) {
    const { minKm, maxKm, fee } = feeRangeSchema.parse(req.body);
    const range = await deliveryFeesService.create({ minMeters: minKm, maxMeters: maxKm, feeCents: fee });
    res.status(201).json(presentRange(range));
  },

  async update(req: Request, res: Response) {
    const { minKm, maxKm, fee } = feeRangeSchema.parse(req.body);
    const range = await deliveryFeesService.update(idParam(req), { minMeters: minKm, maxMeters: maxKm, feeCents: fee });
    res.json(presentRange(range));
  },

  async remove(req: Request, res: Response) {
    await deliveryFeesService.remove(idParam(req));
    res.status(204).end();
  },

  /** Simulação para a proprietária: GET /owner/delivery-fees/quote?distanceKm=3.2 */
  async quote(req: Request, res: Response) {
    const { distanceKm } = quoteQuerySchema.parse(req.query);
    res.json(presentQuote(await deliveryFeesService.quote(distanceKm)));
  },
};
