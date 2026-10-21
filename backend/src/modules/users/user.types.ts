export const ROLES = ['CUSTOMER', 'OWNER', 'COURIER'] as const;
export type Role = (typeof ROLES)[number];

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  passwordHash: string;
  role: Role;
  active: boolean;
  /** Senhas erradas seguidas (database/schema/023). */
  failedLoginAttempts: number;
  /** Login bloqueado até esta data (null = liberado). */
  lockedUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Dados do usuário que podem ser enviados ao app (sem a senha e sem o controle de tentativas). */
export type PublicUser = Omit<User, 'passwordHash' | 'failedLoginAttempts' | 'lockedUntil'>;

export function toPublicUser(user: User): PublicUser {
  const { passwordHash: _, failedLoginAttempts: __, lockedUntil: ___, ...publicUser } = user;
  return publicUser;
}

/** Resultado de uma senha errada: o contador atualizado e, se bloqueou, até quando. */
export interface LoginFailure {
  failedLoginAttempts: number;
  lockedUntil: Date | null;
}

/** Linha da view vw_users (listagem). */
export interface UserSummary extends PublicUser {
  roleLabel: string;
  activeSessions: number;
}

/** O que o próprio usuário pode mudar no perfil (o e-mail não: é o login). */
export interface ProfileData {
  name: string;
  phone: string;
}

export interface CreateUserData {
  name: string;
  email: string;
  phone?: string | null;
  passwordHash: string;
  role: Role;
}
