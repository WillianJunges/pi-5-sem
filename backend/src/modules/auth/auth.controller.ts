import type { Request, Response } from 'express';
import type { RequestContext } from '../access-logs/accessLog.types';
import { forgotPasswordSchema, loginSchema, refreshSchema, registerSchema, resetPasswordSchema } from './auth.schemas';
import { authService } from './auth.service';
import { passwordResetService } from './passwordReset.service';

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

  /** Esqueci minha senha: gera o código (simulação: volta na resposta fora de produção). */
  async forgotPassword(req: Request, res: Response) {
    res.json(await passwordResetService.requestCode(forgotPasswordSchema.parse(req.body)));
  },

  /** Troca a senha com o código. Depois disso, é só entrar com a senha nova. */
  async resetPassword(req: Request, res: Response) {
    await passwordResetService.resetPassword(resetPasswordSchema.parse(req.body));
    res.status(204).send();
  },

  async logout(req: Request, res: Response) {
    const { refreshToken } = refreshSchema.parse(req.body);
    await authService.logout(refreshToken, requestContext(req));
    res.status(204).send();
  },
};
