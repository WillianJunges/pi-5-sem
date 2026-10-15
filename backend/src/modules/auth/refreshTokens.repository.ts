import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { db } from '../../config/database';
import { translateDatabaseError } from '../../shared/errors/databaseErrors';

export interface RefreshToken {
  id: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface RefreshTokensRepository {
  create(userId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  findByHash(tokenHash: string): Promise<RefreshToken | null>;
  revoke(id: string): Promise<void>;
  /**
   * Troca o token antigo por um novo de forma atômica e devolve o id do usuário.
   * Lança AppError 401 se o token for inválido, expirado ou já usado.
   */
  rotate(oldHash: string, newHash: string, expiresAt: Date): Promise<string>;
}

interface RefreshTokenRow extends RowDataPacket {
  id: string;
  user_id: string;
  expires_at: Date;
  revoked_at: Date | null;
}

export class MySqlRefreshTokensRepository implements RefreshTokensRepository {
  async create(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await db.query(
      'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
      [randomUUID(), userId, tokenHash, expiresAt],
    );
  }

  async findByHash(tokenHash: string): Promise<RefreshToken | null> {
    const [rows] = await db.query<RefreshTokenRow[]>(
      'SELECT id, user_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = ?',
      [tokenHash],
    );
    const row = rows[0];
    if (!row) return null;
    return { id: row.id, userId: row.user_id, expiresAt: row.expires_at, revokedAt: row.revoked_at };
  }

  async revoke(id: string): Promise<void> {
    await db.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = ? AND revoked_at IS NULL', [id]);
  }

  /** Usa a procedure sp_rotate_refresh_token (transação com bloqueio da linha). */
  async rotate(oldHash: string, newHash: string, expiresAt: Date): Promise<string> {
    try {
      const [result] = await db.query<RowDataPacket[][]>('CALL sp_rotate_refresh_token(?, ?, ?, ?)', [
        oldHash,
        randomUUID(),
        newHash,
        expiresAt,
      ]);
      return result[0][0].user_id as string;
    } catch (err) {
      throw translateDatabaseError(err);
    }
  }
}

export const refreshTokensRepository: RefreshTokensRepository = new MySqlRefreshTokensRepository();
