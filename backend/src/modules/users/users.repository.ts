import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { db } from '../../config/database';
import { translateDatabaseError } from '../../shared/errors/databaseErrors';
import type { CreateUserData, Role, User, UserSummary } from './user.types';

/**
 * Contrato de acesso aos usuários. Services dependem só desta interface;
 * para trocar de banco basta criar outra implementação.
 */
export interface UsersRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  create(data: CreateUserData): Promise<User>;
  list(filter?: { role?: Role }): Promise<UserSummary[]>;
}

interface UserRow extends RowDataPacket {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  password_hash: string;
  role: Role;
  active: number;
  created_at: Date;
  updated_at: Date;
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
}

export const usersRepository: UsersRepository = new MySqlUsersRepository();
