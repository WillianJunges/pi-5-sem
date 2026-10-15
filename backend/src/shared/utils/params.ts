import type { Request } from 'express';
import { z } from 'zod';
import { AppError } from '../errors/AppError';

const uuid = z.uuid();

/** Lê um id (UUID) da URL. Id malformado → 404, como se não existisse. */
export function idParam(req: Request, name = 'id'): string {
  const parsed = uuid.safeParse(req.params[name]);
  if (!parsed.success) throw new AppError('Registro não encontrado', 404);
  return parsed.data;
}
