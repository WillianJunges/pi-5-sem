import bcrypt from 'bcryptjs';
import { env } from '../../config/env';
import { AppError } from '../../shared/errors/AppError';
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
  ) {}

  /** Cadastro público: sempre cria um CLIENTE. Motoboys são cadastrados pela proprietária. */
  async register(input: RegisterInput): Promise<AuthResult> {
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

    return this.createSession(user);
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const user = await this.users.findByEmail(input.email);
    const passwordOk = user ? await bcrypt.compare(input.password, user.passwordHash) : false;

    if (!user || !passwordOk) {
      throw new AppError('E-mail ou senha inválidos', 401);
    }
    if (!user.active) {
      throw new AppError('Usuário desativado', 403);
    }

    return this.createSession(user);
  }

  /** Troca um refresh token válido por um novo par de tokens (o antigo deixa de valer). */
  async refresh(refreshToken: string): Promise<AuthResult> {
    const stored = await this.refreshTokens.findByHash(hashToken(refreshToken));

    if (!stored) {
      throw new AppError('Sessão inválida', 401);
    }
    if (stored.revokedAt) {
      // Token já usado sendo reutilizado: possível roubo. Encerra todas as sessões do usuário.
      await this.refreshTokens.revokeAllFromUser(stored.userId);
      throw new AppError('Sessão inválida', 401);
    }
    if (stored.expiresAt.getTime() < Date.now()) {
      throw new AppError('Sessão expirada', 401);
    }

    const user = await this.users.findById(stored.userId);
    if (!user || !user.active) {
      throw new AppError('Sessão inválida', 401);
    }

    await this.refreshTokens.revoke(stored.id);
    return this.createSession(user);
  }

  async logout(refreshToken: string): Promise<void> {
    const stored = await this.refreshTokens.findByHash(hashToken(refreshToken));
    if (stored) {
      await this.refreshTokens.revoke(stored.id);
    }
  }

  private async createSession(user: User): Promise<AuthResult> {
    const refreshToken = generateRefreshToken();
    const expiresAt = new Date(Date.now() + env.auth.refreshTokenTtlDays * 24 * 60 * 60 * 1000);
    await this.refreshTokens.create(user.id, hashToken(refreshToken), expiresAt);

    return {
      user: toPublicUser(user),
      accessToken: signAccessToken({ sub: user.id, role: user.role }),
      refreshToken,
    };
  }
}

export const authService = new AuthService(usersRepository, refreshTokensRepository);
