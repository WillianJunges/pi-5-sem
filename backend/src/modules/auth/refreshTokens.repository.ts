import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { db } from '../../config/database';

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
  revokeAllFromUser(userId: string): Promise<void>;
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

  async revokeAllFromUser(userId: string): Promise<void> {
    await db.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [
      userId,
    ]);
  }
}

export const refreshTokensRepository: RefreshTokensRepository = new MySqlRefreshTokensRepository();
