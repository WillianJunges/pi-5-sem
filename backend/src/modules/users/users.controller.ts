import type { Request, Response } from 'express';
import { AppError } from '../../shared/errors/AppError';
import { toPublicUser } from './user.types';
import { usersRepository } from './users.repository';

export const usersController = {
  /** Perfil do usuário logado. */
  async me(req: Request, res: Response) {
    const user = await usersRepository.findById(req.user!.id);
    if (!user || !user.active) {
      throw new AppError('Usuário não encontrado', 404);
    }
    res.json(toPublicUser(user));
  },
};
