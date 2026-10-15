import type { Request, Response } from 'express';
import type { RequestContext } from '../access-logs/accessLog.types';
import { loginSchema, refreshSchema, registerSchema } from './auth.schemas';
import { authService } from './auth.service';

function requestContext(req: Request): RequestContext {
  return { ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null };
}

export const authController = {
  async register(req: Request, res: Response) {
    const input = registerSchema.parse(req.body);
    res.status(201).json(await authService.register(input, requestContext(req)));
  },

  async login(req: Request, res: Response) {
    const input = loginSchema.parse(req.body);
    res.json(await authService.login(input, requestContext(req)));
  },

  async refresh(req: Request, res: Response) {
    const { refreshToken } = refreshSchema.parse(req.body);
    res.json(await authService.refresh(refreshToken));
  },

  async logout(req: Request, res: Response) {
    const { refreshToken } = refreshSchema.parse(req.body);
    await authService.logout(refreshToken, requestContext(req));
    res.status(204).send();
  },
};
