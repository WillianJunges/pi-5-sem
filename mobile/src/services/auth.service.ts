import { api } from './api';
import { tokenStorage } from './tokenStorage';

export type Role = 'CUSTOMER' | 'OWNER' | 'COURIER';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface RegisterData {
  name: string;
  email: string;
  /** Obrigatório, com DDD. */
  phone: string;
  password: string;
}

/** Resposta de POST /auth/forgot-password. */
export interface ForgotPasswordResult {
  message: string;
  expiresInMinutes: number;
  /** Simulação do e-mail: o código só vem fora de produção. */
  code?: string;
}

async function startSession(response: AuthResponse): Promise<User> {
  await tokenStorage.save({ accessToken: response.accessToken, refreshToken: response.refreshToken });
  return response.user;
}

export const authService = {
  async register(data: RegisterData): Promise<User> {
    return startSession(await api<AuthResponse>('/auth/register', { method: 'POST', body: data, auth: false }));
  },

  async login(email: string, password: string): Promise<User> {
    return startSession(
      await api<AuthResponse>('/auth/login', { method: 'POST', body: { email, password }, auth: false }),
    );
  },

  /** Esqueci minha senha: gera o código de 6 números. */
  forgotPassword(email: string): Promise<ForgotPasswordResult> {
    return api<ForgotPasswordResult>('/auth/forgot-password', { method: 'POST', body: { email }, auth: false });
  },

  /** Troca a senha com o código. Depois é só entrar com a senha nova. */
  async resetPassword(email: string, code: string, password: string): Promise<void> {
    await api('/auth/reset-password', { method: 'POST', body: { email, code, password }, auth: false });
  },

  async logout(): Promise<void> {
    const tokens = await tokenStorage.get();
    await tokenStorage.clear();
    if (tokens) {
      // Se falhar (sem internet), o token expira sozinho no servidor.
      await api('/auth/logout', { method: 'POST', body: { refreshToken: tokens.refreshToken }, auth: false }).catch(
        () => undefined,
      );
    }
  },

  async hasSession(): Promise<boolean> {
    return (await tokenStorage.get()) !== null;
  },
};
