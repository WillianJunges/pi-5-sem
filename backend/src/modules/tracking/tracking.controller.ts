import type { Request, Response } from 'express';
import { idParam } from '../../shared/utils/params';
import { trackingService } from './tracking.service';
import { positionSchema } from './tracking.schemas';

export const trackingController = {
  async get(req: Request, res: Response) { res.json(await trackingService.get(idParam(req), req.user!)); },
  async update(req: Request, res: Response) {
    const id = idParam(req);
    const result = await trackingService.update(id, req.user!, positionSchema.parse(req.body));
    res.json(result);
  },
};
