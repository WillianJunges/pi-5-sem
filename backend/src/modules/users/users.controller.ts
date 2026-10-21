import type { Request, Response } from 'express';
import { z } from 'zod';
import { accessLogsRepository } from '../access-logs/accessLogs.repository';
import { ROLES } from './user.types';
import { usersRepository } from './users.repository';
import { changePasswordSchema, updateProfileSchema } from './users.schemas';
import { usersService } from './users.service';

const listQuerySchema = z.object({
  role: z.enum(ROLES).optional(),
});

export const usersController = {
  /** Perfil do usuário logado. */
  async me(req: Request, res: Response) {
    res.json(await usersService.me(req.user!.id));
  },

  /** Edita o próprio nome e telefone. Corpo: { name, phone } */
  async updateMe(req: Request, res: Response) {
    res.json(await usersService.updateProfile(req.user!.id, updateProfileSchema.parse(req.body)));
  },

  /** Troca a própria senha. Corpo: { currentPassword, newPassword } */
  async changePassword(req: Request, res: Response) {
    await usersService.changePassword(req.user!.id, changePasswordSchema.parse(req.body));
    res.status(204).send();
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
