import type { Request, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../../shared/errors/AppError';
import { geoService } from './geo.service';

const cepSchema = z.string().transform((v) => v.replace(/\D/g, '')).pipe(z.string().length(8, 'CEP deve ter 8 dígitos'));
const searchSchema = z.object({
  q: z.string().trim().min(3, 'Digite pelo menos 3 letras').max(120),
});

export const geoController = {
  /** GET /geo/cep/:cep */
  async cep(req: Request, res: Response) {
    const cep = cepSchema.parse(req.params.cep);
    const result = await geoService.lookupCep(cep);
    if (!result) throw new AppError('CEP não encontrado', 404);
    res.json(result);
  },

  /** GET /geo/search?q=rua dom pedro indaiatuba */
  async search(req: Request, res: Response) {
    const { q } = searchSchema.parse(req.query);
    res.json(await geoService.search(q));
  },
};
