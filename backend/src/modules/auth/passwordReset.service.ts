import { randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { env } from '../../config/env';
import { AppError } from '../../shared/errors/AppError';
import { type UsersRepository, usersRepository } from '../users/users.repository';
import type { ForgotPasswordInput, ResetPasswordInput } from './auth.schemas';
import { type PasswordResetsRepository, passwordResetsRepository } from './passwordResets.repository';
import { hashToken } from './tokens';

/** Por quanto tempo o código vale. */
export const RESET_CODE_MINUTES = 15;
/** Códigos errados aceitos antes de o código deixar de valer. */
export const MAX_RESET_ATTEMPTS = 5;

export interface ForgotPasswordResult {
  message: string;
  expiresInMinutes: number;
  /** SIMULAÇÃO do e-mail: o código só volta fora de produção (env.auth.showResetCode). */
  code?: string;
}

/**
 * "Esqueci minha senha" (database/schema/024). O projeto não tem serviço de e-mail, então
 * o código de 6 dígitos volta na resposta e o app mostra na tela, como se tivesse chegado
 * por e-mail. Para mandar por e-mail de verdade, basta enviar `code` aqui em requestCode
 * e não devolver mais na resposta.
 */
export class PasswordResetService {
  constructor(
    private readonly users: Pick<UsersRepository, 'findByEmail'>,
    private readonly resets: PasswordResetsRepository,
    private readonly showCode: boolean = env.auth.showResetCode,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** POST /auth/forgot-password: gera o código (e invalida os anteriores). */
  async requestCode({ email }: ForgotPasswordInput): Promise<ForgotPasswordResult> {
    const user = await this.users.findByEmail(email);
    if (!user || !user.active) {
      throw new AppError('Não encontramos uma conta ativa com esse e-mail.', 404);
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const expiresAt = new Date(this.now().getTime() + RESET_CODE_MINUTES * 60_000);
    await this.resets.create(user.id, hashToken(code), expiresAt);

    return {
      message: this.showCode
        ? 'Simulação: em um app publicado, este código chegaria no seu e-mail.'
        : 'Enviamos um código para o seu e-mail.',
      expiresInMinutes: RESET_CODE_MINUTES,
      ...(this.showCode ? { code } : {}),
    };
  }

  /**
   * POST /auth/reset-password: confere o código e troca a senha. Depois disso o login
   * fica desbloqueado e todas as sessões abertas são encerradas (sp_complete_password_reset).
   */
  async resetPassword({ email, code, password }: ResetPasswordInput): Promise<void> {
    const user = await this.users.findByEmail(email);
    const reset = user ? await this.resets.findValid(user.id) : null;
    if (!user || !reset || reset.attempts >= MAX_RESET_ATTEMPTS) {
      throw new AppError('Código expirado ou inválido. Peça um novo código.', 400);
    }

    if (hashToken(code) !== reset.codeHash) {
      const attempts = await this.resets.registerAttempt(reset.id);
      const left = MAX_RESET_ATTEMPTS - attempts;
      throw new AppError(
        left <= 0
          ? 'Código incorreto. Ele deixou de valer: peça um novo código.'
          : `Código incorreto. ${left === 1 ? 'Resta 1 tentativa' : `Restam ${left} tentativas`}.`,
        400,
      );
    }

    await this.resets.complete(user.id, reset.id, await bcrypt.hash(password, 10));
  }
}

export const passwordResetService = new PasswordResetService(usersRepository, passwordResetsRepository);
