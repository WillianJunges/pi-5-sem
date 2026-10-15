import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import type { Role } from '../users/user.types';

/** Dados que vão dentro do access token. */
export interface AccessTokenPayload {
  sub: string; // id do usuário
  role: Role;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.auth.accessTokenSecret, { expiresIn: env.auth.accessTokenTtl });
}

/** Lança erro se o token for inválido ou estiver expirado. */
export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.auth.accessTokenSecret);
  if (typeof decoded === 'string' || !decoded.sub || !decoded.role) {
    throw new Error('Token malformado');
  }
  return { sub: decoded.sub, role: decoded.role as Role };
}

/** Refresh token é um valor aleatório (não JWT); no banco guardamos só o hash. */
export function generateRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
