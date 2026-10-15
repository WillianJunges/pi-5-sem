import { randomUUID } from 'node:crypto';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { db } from '../../config/database';
import { translateDatabaseError } from '../../shared/errors/databaseErrors';
import type { Address, SaveAddressData } from './address.types';

export interface AddressesRepository {
  listByUser(userId: string): Promise<Address[]>;
  findById(userId: string, id: string): Promise<Address | null>;
  create(userId: string, data: SaveAddressData): Promise<string>;
  /** Devolve false se o endereço não existir/não for do cliente. */
  update(userId: string, id: string, data: SaveAddressData): Promise<boolean>;
  setDefault(userId: string, id: string): Promise<void>;
  delete(userId: string, id: string): Promise<void>;
  hasDefault(userId: string): Promise<boolean>;
}

interface AddressRow extends RowDataPacket {
  id: string;
  user_id: string;
  label: string | null;
  cep: string;
  street: string;
  number: string;
  complement: string | null;
  district: string;
  city: string;
  state: string;
  latitude: string | null; // DECIMAL vem como string do mysql2
  longitude: string | null;
  is_default: number;
  created_at: Date;
  updated_at: Date;
}

function mapRow(row: AddressRow): Address {
  return {
    id: row.id,
    userId: row.user_id,
    label: row.label,
    cep: row.cep,
    street: row.street,
    number: row.number,
    complement: row.complement,
    district: row.district,
    city: row.city,
    state: row.state,
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
    isDefault: Boolean(row.is_default),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const ACTIVE = 'user_id = ? AND deleted_at IS NULL';

export class MySqlAddressesRepository implements AddressesRepository {
  async listByUser(userId: string): Promise<Address[]> {
    const [rows] = await db.query<AddressRow[]>(
      `SELECT * FROM addresses WHERE ${ACTIVE} ORDER BY is_default DESC, created_at DESC`,
      [userId],
    );
    return rows.map(mapRow);
  }

  async findById(userId: string, id: string): Promise<Address | null> {
    const [rows] = await db.query<AddressRow[]>(`SELECT * FROM addresses WHERE id = ? AND ${ACTIVE}`, [id, userId]);
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async create(userId: string, data: SaveAddressData): Promise<string> {
    const id = randomUUID();
    await db.query(
      `INSERT INTO addresses
         (id, user_id, label, cep, street, number, complement, district, city, state, latitude, longitude)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        userId,
        data.label,
        data.cep,
        data.street,
        data.number,
        data.complement,
        data.district,
        data.city,
        data.state,
        data.latitude,
        data.longitude,
      ],
    );
    return id;
  }

  async update(userId: string, id: string, data: SaveAddressData): Promise<boolean> {
    const [result] = await db.query<ResultSetHeader>(
      `UPDATE addresses
          SET label = ?, cep = ?, street = ?, number = ?, complement = ?, district = ?,
              city = ?, state = ?, latitude = ?, longitude = ?
        WHERE id = ? AND ${ACTIVE}`,
      [
        data.label,
        data.cep,
        data.street,
        data.number,
        data.complement,
        data.district,
        data.city,
        data.state,
        data.latitude,
        data.longitude,
        id,
        userId,
      ],
    );
    return result.affectedRows > 0;
  }

  /** Procedure sp_set_default_address (troca o principal em transação). */
  async setDefault(userId: string, id: string): Promise<void> {
    try {
      await db.query('CALL sp_set_default_address(?, ?)', [userId, id]);
    } catch (err) {
      throw translateDatabaseError(err);
    }
  }

  /** Procedure sp_delete_address (exclusão lógica + promove outro principal). */
  async delete(userId: string, id: string): Promise<void> {
    try {
      await db.query('CALL sp_delete_address(?, ?)', [userId, id]);
    } catch (err) {
      throw translateDatabaseError(err);
    }
  }

  async hasDefault(userId: string): Promise<boolean> {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT 1 FROM addresses WHERE ${ACTIVE} AND is_default = TRUE LIMIT 1`,
      [userId],
    );
    return rows.length > 0;
  }
}

export const addressesRepository: AddressesRepository = new MySqlAddressesRepository();
