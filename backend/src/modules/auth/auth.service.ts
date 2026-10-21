import bcrypt from 'bcryptjs';
import { env } from '../../config/env';
import { AppError } from '../../shared/errors/AppError';
import type { AccessLogEvent, RequestContext } from '../access-logs/accessLog.types';
import { type AccessLogsRepository, accessLogsRepository } from '../access-logs/accessLogs.repository';
import { type PublicUser, toPublicUser, type User } from '../users/user.types';
import { type UsersRepository, usersRepository } from '../users/users.repository';
import type { LoginInput, RegisterInput } from './auth.schemas';
import { type RefreshTokensRepository, refreshTokensRepository } from './refreshTokens.repository';
import { generateRefreshToken, hashToken, signAccessToken } from './tokens';

/** Limite de senhas erradas seguidas: na 10ª a conta fica bloqueada (database/schema/023). */
export const MAX_LOGIN_ATTEMPTS = 10;
/** A partir de quantas senhas erradas o app começa a avisar quantas tentativas restam. */
export const WARN_AFTER_ATTEMPTS = 5;
/** Tempo do bloqueio, em minutos. */
export const LOCK_MINUTES = 10;

/** "1 minuto" / "7 minutos" (arredonda para cima: 30 s restantes = 1 minuto). */
function minutesLeft(until: Date, now: Date): string {
  const minutes = Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 60_000));
  return minutes === 1 ? '1 minuto' : `${minutes} minutos`;
}

export interface AuthResult {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}

export class AuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly refreshTokens: RefreshTokensRepository,
    private readonly accessLogs: AccessLogsRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Cadastro público: sempre cria um CLIENTE. Motoboys são cadastrados pela proprietária. */
  async register(input: RegisterInput, ctx: RequestContext = {}): Promise<AuthResult> {
    const existing = await this.users.findByEmail(input.email);
    if (existing) {
      throw new AppError('E-mail já cadastrado', 409);
    }

    const user = await this.users.create({
      name: input.name,
      email: input.email,
      phone: input.phone ?? null,
      passwordHash: await bcrypt.hash(input.password, 10),
      role: 'CUSTOMER',
    });

    await this.logAccess('REGISTER', true, user.email, user, ctx);
    return this.createSession(user);
  }

  /**
   * Login com limite de tentativas (script 023): da 6ª senha errada seguida em diante a
   * mensagem diz quantas restam; na 10ª a conta fica bloqueada por 10 minutos. Durante o
   * bloqueio nem a senha certa entra (a senha nem é conferida). Acertar zera o contador.
   */
  async login(input: LoginInput, ctx: RequestContext = {}): Promise<AuthResult> {
    const user = await this.users.findByEmail(input.email);
    if (!user) {
      await this.logAccess('LOGIN_FAILED', false, input.email, null, ctx);
      throw new AppError('E-mail ou senha inválidos', 401);
    }

    const now = this.now();
    if (user.lockedUntil && user.lockedUntil > now) {
      await this.logAccess('LOGIN_LOCKED', false, input.email, user, ctx);
      throw new AppError(
        `Muitas tentativas com a senha errada. Por segurança, o login está bloqueado. Tente de novo em ${minutesLeft(user.lockedUntil, now)}.`,
        429,
      );
    }

    if (!(await bcrypt.compare(input.password, user.passwordHash))) {
      await this.logAccess('LOGIN_FAILED', false, input.email, user, ctx);
      const failure = await this.users.registerLoginFailure(user.id, MAX_LOGIN_ATTEMPTS, LOCK_MINUTES);
      if (failure.lockedUntil && failure.lockedUntil > now) {
        throw new AppError(
          `Você errou a senha ${MAX_LOGIN_ATTEMPTS} vezes. Por segurança, o login ficou bloqueado por ${LOCK_MINUTES} minutos.`,
          429,
        );
      }
      if (failure.failedLoginAttempts > WARN_AFTER_ATTEMPTS) {
        const left = MAX_LOGIN_ATTEMPTS - failure.failedLoginAttempts;
        throw new AppError(
          `E-mail ou senha inválidos. ${left === 1 ? 'Resta 1 tentativa' : `Restam ${left} tentativas`} antes do bloqueio de ${LOCK_MINUTES} minutos.`,
          401,
        );
      }
      throw new AppError('E-mail ou senha inválidos', 401);
    }

    if (!user.active) {
      await this.logAccess('LOGIN_FAILED', false, input.email, user, ctx);
      throw new AppError('Usuário desativado', 403);
    }

    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await this.users.resetLoginFailures(user.id);
    }
    await this.logAccess('LOGIN', true, user.email, user, ctx);
    return this.createSession(user);
  }

  /**
   * Troca um refresh token válido por um novo par de tokens. A validação e a troca
   * acontecem na procedure sp_rotate_refresh_token (transação no banco).
   */
  async refresh(refreshToken: string): Promise<AuthResult> {
    const newRefreshToken = generateRefreshToken();
    const userId = await this.refreshTokens.rotate(
      hashToken(refreshToken),
      hashToken(newRefreshToken),
      this.refreshTokenExpiration(),
    );

    const user = await this.users.findById(userId);
    if (!user) {
      throw new AppError('Sessão inválida', 401);
    }

    return {
      user: toPublicUser(user),
      accessToken: signAccessToken({ sub: user.id, role: user.role }),
      refreshToken: newRefreshToken,
    };
  }

  async logout(refreshToken: string, ctx: RequestContext = {}): Promise<void> {
    const stored = await this.refreshTokens.findByHash(hashToken(refreshToken));
    if (stored) {
      await this.refreshTokens.revoke(stored.id);
      const user = await this.users.findById(stored.userId);
      if (user) await this.logAccess('LOGOUT', true, user.email, user, ctx);
    }
  }

  private refreshTokenExpiration(): Date {
    return new Date(Date.now() + env.auth.refreshTokenTtlDays * 24 * 60 * 60 * 1000);
  }

  private async createSession(user: User): Promise<AuthResult> {
    const refreshToken = generateRefreshToken();
    await this.refreshTokens.create(user.id, hashToken(refreshToken), this.refreshTokenExpiration());

    return {
      user: toPublicUser(user),
      accessToken: signAccessToken({ sub: user.id, role: user.role }),
      refreshToken,
    };
  }

  /** Grava no histórico (MongoDB). Uma falha aqui nunca impede o login. */
  private async logAccess(
    event: AccessLogEvent,
    success: boolean,
    email: string,
    user: User | null,
    ctx: RequestContext,
  ): Promise<void> {
    try {
      await this.accessLogs.record({
        event,
        success,
        email,
        user: user ? { id: user.id, name: user.name, email: user.email, role: user.role } : null,
        device: { ip: ctx.ip ?? null, userAgent: ctx.userAgent ?? null },
        createdAt: new Date(),
      });
    } catch (err) {
      console.warn('Não foi possível gravar o histórico de acesso:', (err as Error).message);
    }
  }
}

export const authService = new AuthService(usersRepository, refreshTokensRepository, accessLogsRepository);
