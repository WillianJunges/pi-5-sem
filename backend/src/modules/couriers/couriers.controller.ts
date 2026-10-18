import type { Request, Response } from 'express';
import { idParam } from '../../shared/utils/params';
import { courierActiveSchema, createCourierSchema, presentCourier, updateCourierSchema } from './couriers.schemas';
import { couriersService } from './couriers.service';

export const couriersController = {
  /** GET /owner/couriers — todos os motoboys (ativos e desativados), por nome. */
  async list(_req: Request, res: Response) {
    res.json((await couriersService.list()).map(presentCourier));
  },

  async get(req: Request, res: Response) {
    res.json(presentCourier(await couriersService.get(idParam(req))));
  },

  async create(req: Request, res: Response) {
    res.status(201).json(presentCourier(await couriersService.create(createCourierSchema.parse(req.body))));
  },

  async update(req: Request, res: Response) {
    res.json(presentCourier(await couriersService.update(idParam(req), updateCourierSchema.parse(req.body))));
  },

  async setActive(req: Request, res: Response) {
    const { active } = courierActiveSchema.parse(req.body);
    res.json(presentCourier(await couriersService.setActive(idParam(req), active)));
  },
};
