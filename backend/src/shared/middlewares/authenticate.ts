import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../../modules/auth/tokens';
import { AppError } from '../errors/AppError';

/** Exige um access token válido e preenche `req.user` com id e perfil. */
export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const [scheme, token] = req.headers.authorization?.split(' ') ?? [];

  if (scheme !== 'Bearer' || !token) {
    throw new AppError('Token não informado', 401);
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role };
  } catch {
    throw new AppError('Token inválido ou expirado', 401);
  }

  next();
}
