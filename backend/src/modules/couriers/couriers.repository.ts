import type { ResultSetHeader } from 'mysql2/promise';
import { db } from '../../config/database';
import { AppError } from '../../shared/errors/AppError';
import { translateDatabaseError } from '../../shared/errors/databaseErrors';
import type { UserSummary } from '../users/user.types';
import { usersRepository } from '../users/users.repository';
import type { UpdateCourierInput } from './couriers.schemas';

/**
 * Motoboys são usuários com perfil COURIER (tabela users do módulo base).
 * Criar usa sp_create_user; listar usa a view vw_users. Aqui ficam só as alterações,
 * sempre restritas a role = 'COURIER' (a proprietária não mexe em clientes por esta rota).
 * O trigger trg_users_before_update (script 004) registra a auditoria e, ao desativar,
 * revoga as sessões do motoboy.
 */
export interface CouriersRepository {
  list(): Promise<UserSummary[]>;
  findById(id: string): Promise<UserSummary | null>;
  update(id: string, data: UpdateCourierInput): Promise<boolean>;
  setActive(id: string, active: boolean): Promise<boolean>;
}

export class MySqlCouriersRepository implements CouriersRepository {
  list() {
    return usersRepository.list({ role: 'COURIER' });
  }

  async findById(id: string) {
    return (await this.list()).find((c) => c.id === id) ?? null;
  }

  async update(id: string, { name, email, phone }: UpdateCourierInput) {
    try {
      const [result] = await db.query<ResultSetHeader>(
        "UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ? AND role = 'COURIER'",
        [name, email, phone, id],
      );
      return result.affectedRows > 0;
    } catch (err) {
      // o índice UNIQUE de users.email devolve uma mensagem técnica; esta é mais clara
      if ((err as { errno?: number }).errno === 1062) throw new AppError('E-mail já cadastrado', 409);
      throw translateDatabaseError(err);
    }
  }

  async setActive(id: string, active: boolean) {
    const [result] = await db.query<ResultSetHeader>(
      "UPDATE users SET active = ? WHERE id = ? AND role = 'COURIER'",
      [active, id],
    );
    return result.affectedRows > 0;
  }
}

export const couriersRepository: CouriersRepository = new MySqlCouriersRepository();
