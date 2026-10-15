import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { db } from '../../config/database';
import type { CreateUserData, Role, User } from './user.types';

/**
 * Contrato de acesso aos usuários. Services dependem só desta interface;
 * para trocar de banco (ex.: MongoDB) basta criar outra implementação.
 */
export interface UsersRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  create(data: CreateUserData): Promise<User>;
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

export class MySqlUsersRepository implements UsersRepository {
  async findById(id: string): Promise<User | null> {
    const [rows] = await db.query<UserRow[]>('SELECT * FROM users WHERE id = ?', [id]);
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const [rows] = await db.query<UserRow[]>('SELECT * FROM users WHERE email = ?', [email]);
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async create(data: CreateUserData): Promise<User> {
    const id = randomUUID();
    await db.query(
      'INSERT INTO users (id, name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)',
      [id, data.name, data.email, data.phone ?? null, data.passwordHash, data.role],
    );
    const user = await this.findById(id);
    if (!user) throw new Error('Falha ao criar usuário');
    return user;
  }
}

export const usersRepository: UsersRepository = new MySqlUsersRepository();
