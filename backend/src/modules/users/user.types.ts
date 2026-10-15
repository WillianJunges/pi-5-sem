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
  createdAt: Date;
  updatedAt: Date;
}

/** Dados do usuário que podem ser enviados ao app (sem a senha). */
export type PublicUser = Omit<User, 'passwordHash'>;

export function toPublicUser(user: User): PublicUser {
  const { passwordHash: _, ...publicUser } = user;
  return publicUser;
}

export interface CreateUserData {
  name: string;
  email: string;
  phone?: string | null;
  passwordHash: string;
  role: Role;
}
