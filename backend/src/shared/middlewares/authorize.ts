import type { NextFunction, Request, Response } from 'express';
import type { Role } from '../../modules/users/user.types';
import { AppError } from '../errors/AppError';

/**
 * Libera a rota só para os perfis informados. Use sempre depois de `authenticate`.
 *
 * @example
 * routes.use('/owner', authenticate, authorize('OWNER'), ownerRoutes);
 * router.get('/deliveries', authenticate, authorize('COURIER', 'OWNER'), controller.list);
 */
export function authorize(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError('Não autenticado', 401);
    }
    if (!roles.includes(req.user.role)) {
      throw new AppError('Acesso não permitido para este perfil', 403);
    }
    next();
  };
}
