import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { db } from '../../config/database';
import { translateDatabaseError } from '../../shared/errors/databaseErrors';

/** Código de "Esqueci minha senha" (database/schema/024). Só o hash é guardado. */
export interface PasswordReset {
  id: string;
  userId: string;
  codeHash: string;
  attempts: number;
  expiresAt: Date;
}

export interface PasswordResetsRepository {
  /** Grava um código novo e invalida os anteriores ainda não usados do mesmo usuário. */
  create(userId: string, codeHash: string, expiresAt: Date): Promise<void>;
  /** Último código do usuário que ainda vale (não usado e não expirado), ou null. */
  findValid(userId: string): Promise<PasswordReset | null>;
  /** Soma um código errado; devolve o total de tentativas. */
  registerAttempt(id: string): Promise<number>;
  /** Troca a senha e fecha o código (sp_complete_password_reset, em transação). */
  complete(userId: string, resetId: string, passwordHash: string): Promise<void>;
}

interface PasswordResetRow extends RowDataPacket {
  id: string;
  user_id: string;
  code_hash: string;
  attempts: number;
  expires_at: Date;
}

export class MySqlPasswordResetsRepository implements PasswordResetsRepository {
  async create(userId: string, codeHash: string, expiresAt: Date): Promise<void> {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('UPDATE password_resets SET used_at = UTC_TIMESTAMP() WHERE user_id = ? AND used_at IS NULL', [
        userId,
      ]);
      await conn.query('INSERT INTO password_resets (id, user_id, code_hash, expires_at) VALUES (?, ?, ?, ?)', [
        randomUUID(),
        userId,
        codeHash,
        expiresAt,
      ]);
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw translateDatabaseError(err);
    } finally {
      conn.release();
    }
  }

  async findValid(userId: string): Promise<PasswordReset | null> {
    const [rows] = await db.query<PasswordResetRow[]>(
      `SELECT id, user_id, code_hash, attempts, expires_at FROM password_resets
        WHERE user_id = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()
        ORDER BY created_at DESC LIMIT 1`,
      [userId],
    );
    const row = rows[0];
    return row
      ? { id: row.id, userId: row.user_id, codeHash: row.code_hash, attempts: row.attempts, expiresAt: row.expires_at }
      : null;
  }

  async registerAttempt(id: string): Promise<number> {
    await db.query('UPDATE password_resets SET attempts = attempts + 1 WHERE id = ?', [id]);
    const [rows] = await db.query<PasswordResetRow[]>('SELECT attempts FROM password_resets WHERE id = ?', [id]);
    return rows[0]?.attempts ?? 0;
  }

  async complete(userId: string, resetId: string, passwordHash: string): Promise<void> {
    try {
      await db.query('CALL sp_complete_password_reset(?, ?, ?)', [userId, resetId, passwordHash]);
    } catch (err) {
      throw translateDatabaseError(err);
    }
  }
}

export const passwordResetsRepository: PasswordResetsRepository = new MySqlPasswordResetsRepository();
