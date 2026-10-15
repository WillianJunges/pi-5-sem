import type { Request, Response } from 'express';
import { addressSchema } from './addresses.schemas';
import { addressesService } from './addresses.service';

/** Endereços do cliente logado. Um cliente nunca enxerga endereço de outro (user_id em todas as consultas). */
export const addressesController = {
  async list(req: Request, res: Response) {
    res.json(await addressesService.list(req.user!.id));
  },

  async get(req: Request<{ id: string }>, res: Response) {
    res.json(await addressesService.get(req.user!.id, req.params.id));
  },

  async create(req: Request, res: Response) {
    const input = addressSchema.parse(req.body);
    res.status(201).json(await addressesService.create(req.user!.id, input));
  },

  async update(req: Request<{ id: string }>, res: Response) {
    const input = addressSchema.parse(req.body);
    res.json(await addressesService.update(req.user!.id, req.params.id, input));
  },

  async setDefault(req: Request<{ id: string }>, res: Response) {
    await addressesService.setDefault(req.user!.id, req.params.id);
    res.status(204).send();
  },

  async delete(req: Request<{ id: string }>, res: Response) {
    await addressesService.delete(req.user!.id, req.params.id);
    res.status(204).send();
  },
};
