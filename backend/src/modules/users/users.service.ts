import bcrypt from 'bcryptjs';
import { AppError } from '../../shared/errors/AppError';
import { type PublicUser, toPublicUser, type User } from './user.types';
import { type UsersRepository, usersRepository } from './users.repository';
import type { ChangePasswordInput, UpdateProfileInput } from './users.schemas';

/** Perfil do usuário logado (tela "Meu perfil"): ver, editar nome e telefone, trocar a senha. */
export class UsersService {
  constructor(private readonly users: UsersRepository) {}

  async me(id: string): Promise<PublicUser> {
    return toPublicUser(await this.activeUser(id));
  }

  /** PUT /users/me — nome e telefone. A auditoria fica no trigger (script 025). */
  async updateProfile(id: string, input: UpdateProfileInput): Promise<PublicUser> {
    await this.activeUser(id);
    await this.users.updateProfile(id, input);
    return this.me(id);
  }

  /** PUT /users/me/password — exige a senha atual (quem pegou o celular desbloqueado não troca). */
  async changePassword(id: string, { currentPassword, newPassword }: ChangePasswordInput): Promise<void> {
    const user = await this.activeUser(id);
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new AppError('Senha atual incorreta', 400);
    }
    if (currentPassword === newPassword) {
      throw new AppError('A senha nova precisa ser diferente da atual', 400);
    }
    await this.users.changePassword(id, await bcrypt.hash(newPassword, 10));
  }

  private async activeUser(id: string): Promise<User> {
    const user = await this.users.findById(id);
    if (!user || !user.active) throw new AppError('Usuário não encontrado', 404);
    return user;
  }
}

export const usersService = new UsersService(usersRepository);
