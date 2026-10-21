import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { db } from '../../config/database';
import { translateDatabaseError } from '../../shared/errors/databaseErrors';
import type { CreateUserData, LoginFailure, ProfileData, Role, User, UserSummary } from './user.types';

/**
 * Contrato de acesso aos usuários. Services dependem só desta interface;
 * para trocar de banco basta criar outra implementação.
 */
export interface UsersRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  create(data: CreateUserData): Promise<User>;
  list(filter?: { role?: Role }): Promise<UserSummary[]>;
  /** Soma uma senha errada; no limite, bloqueia por `lockMinutes` (sp_register_login_failure). */
  registerLoginFailure(id: string, maxAttempts: number, lockMinutes: number): Promise<LoginFailure>;
  /** Login certo: zera o contador e tira o bloqueio. */
  resetLoginFailures(id: string): Promise<void>;
  /** Nome e telefone (o trigger do script 025 registra na auditoria). */
  updateProfile(id: string, data: ProfileData): Promise<void>;
  /** Troca a senha pelo perfil (sp_change_password). */
  changePassword(id: string, passwordHash: string): Promise<void>;
}

interface UserRow extends RowDataPacket {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  password_hash: string;
  role: Role;
  active: number;
  failed_login_attempts: number;
  locked_until: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface LoginFailureRow extends RowDataPacket {
  failed_login_attempts: number;
  locked_until: Date | null;
}

interface UserSummaryRow extends RowDataPacket {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  role_label: string;
  active: number;
  active_sessions: number;
  created_at: Date;
  updated_at: Date;
}

function mapRow(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    passwordHash: row.password_hash,
    role: row.role,
    active: Boolean(row.active),
    failedLoginAttempts: row.failed_login_attempts,
    lockedUntil: row.locked_until,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSummaryRow(row: UserSummaryRow): UserSummary {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    roleLabel: row.role_label,
    active: Boolean(row.active),
    activeSessions: Number(row.active_sessions),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class MySqlUsersRepository implements UsersRepository {
  async findById(id: string): Promise<User | null> {
    const [rows] = await db.query<UserRow[]>('SELECT * FROM users WHERE id = ?', [id]);
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const [rows] = await db.query<UserRow[]>('SELECT * FROM users WHERE email = ?', [email]);
    return rows[0] ? mapRow(rows[0]) : null;
  }

  /** Usa a procedure sp_create_user (validações + auditoria em transação). */
  async create(data: CreateUserData): Promise<User> {
    const id = randomUUID();
    try {
      await db.query('CALL sp_create_user(?, ?, ?, ?, ?, ?)', [
        id,
        data.name,
        data.email,
        data.phone ?? null,
        data.passwordHash,
        data.role,
      ]);
    } catch (err) {
      throw translateDatabaseError(err);
    }
    const user = await this.findById(id);
    if (!user) throw new Error('Falha ao criar usuário');
    return user;
  }

  /** Usa a view vw_users (sem senha, com nome do perfil e sessões ativas). */
  async list(filter: { role?: Role } = {}): Promise<UserSummary[]> {
    const [rows] = filter.role
      ? await db.query<UserSummaryRow[]>('SELECT * FROM vw_users WHERE role = ? ORDER BY name', [filter.role])
      : await db.query<UserSummaryRow[]>('SELECT * FROM vw_users ORDER BY name');
    return rows.map(mapSummaryRow);
  }

  async registerLoginFailure(id: string, maxAttempts: number, lockMinutes: number): Promise<LoginFailure> {
    // CALL devolve [resultado do SELECT, cabeçalho]; o SELECT final da procedure vem em [0]
    const [results] = await db.query<LoginFailureRow[][]>('CALL sp_register_login_failure(?, ?, ?)', [
      id,
      maxAttempts,
      lockMinutes,
    ]);
    const row = results[0][0];
    return { failedLoginAttempts: row.failed_login_attempts, lockedUntil: row.locked_until };
  }

  async resetLoginFailures(id: string): Promise<void> {
    await db.query('CALL sp_reset_login_failures(?)', [id]);
  }

  async updateProfile(id: string, data: ProfileData): Promise<void> {
    try {
      await db.query('UPDATE users SET name = ?, phone = ? WHERE id = ?', [data.name, data.phone, id]);
    } catch (err) {
      throw translateDatabaseError(err);
    }
  }

  async changePassword(id: string, passwordHash: string): Promise<void> {
    try {
      await db.query('CALL sp_change_password(?, ?)', [id, passwordHash]);
    } catch (err) {
      throw translateDatabaseError(err);
    }
  }
}

export const usersRepository: UsersRepository = new MySqlUsersRepository();
