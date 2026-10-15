import type { Request, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../../shared/errors/AppError';
import { accessLogsRepository } from '../access-logs/accessLogs.repository';
import { ROLES, toPublicUser } from './user.types';
import { usersRepository } from './users.repository';

const listQuerySchema = z.object({
  role: z.enum(ROLES).optional(),
});

export const usersController = {
  /** Perfil do usuário logado. */
  async me(req: Request, res: Response) {
    const user = await usersRepository.findById(req.user!.id);
    if (!user || !user.active) {
      throw new AppError('Usuário não encontrado', 404);
    }
    res.json(toPublicUser(user));
  },

  /** Últimos acessos do usuário logado (MongoDB). */
  async myAccessLogs(req: Request, res: Response) {
    res.json(await accessLogsRepository.listByUser(req.user!.id));
  },

  /** Listagem de usuários para a proprietária (view vw_users). Filtro opcional: ?role=COURIER */
  async list(req: Request, res: Response) {
    const { role } = listQuerySchema.parse(req.query);
    res.json(await usersRepository.list({ role }));
  },
};
