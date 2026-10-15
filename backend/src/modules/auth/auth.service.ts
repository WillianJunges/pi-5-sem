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

  async login(input: LoginInput, ctx: RequestContext = {}): Promise<AuthResult> {
    const user = await this.users.findByEmail(input.email);
    const passwordOk = user ? await bcrypt.compare(input.password, user.passwordHash) : false;

    if (!user || !passwordOk) {
      await this.logAccess('LOGIN_FAILED', false, input.email, user, ctx);
      throw new AppError('E-mail ou senha inválidos', 401);
    }
    if (!user.active) {
      await this.logAccess('LOGIN_FAILED', false, input.email, user, ctx);
      throw new AppError('Usuário desativado', 403);
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
