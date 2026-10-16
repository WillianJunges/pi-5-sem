import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { db } from '../../config/database';
import { translateDatabaseError } from '../../shared/errors/databaseErrors';
import { centsToDecimal, decimalToCents } from '../../shared/utils/money';
import type { DeliveryFeeRange, FeeRangeData } from './deliveryFee.types';

export interface DeliveryFeesRepository {
  listActive(): Promise<DeliveryFeeRange[]>;
  findById(id: string): Promise<DeliveryFeeRange | null>;
  create(data: FeeRangeData): Promise<DeliveryFeeRange>;
  update(id: string, data: FeeRangeData): Promise<void>;
  deactivate(id: string): Promise<void>;
}

interface Row extends RowDataPacket {
  id: string;
  min_meters: number;
  max_meters: number;
  fee: string;
  active: number;
}

function mapRow(r: Row): DeliveryFeeRange {
  return {
    id: r.id,
    minMeters: r.min_meters,
    maxMeters: r.max_meters,
    feeCents: decimalToCents(r.fee),
    active: Boolean(r.active),
  };
}

export class MySqlDeliveryFeesRepository implements DeliveryFeesRepository {
  async listActive() {
    const [rows] = await db.query<Row[]>('SELECT * FROM delivery_fee_ranges WHERE active = TRUE ORDER BY min_meters');
    return rows.map(mapRow);
  }

  async findById(id: string) {
    const [rows] = await db.query<Row[]>('SELECT * FROM delivery_fee_ranges WHERE id = ?', [id]);
    return rows[0] ? mapRow(rows[0]) : null;
  }

  /** O trigger trg_fee_ranges_before_insert também barra sobreposição. */
  async create(data: FeeRangeData) {
    const id = randomUUID();
    try {
      await db.query('INSERT INTO delivery_fee_ranges (id, min_meters, max_meters, fee) VALUES (?, ?, ?, ?)', [
        id,
        data.minMeters,
        data.maxMeters,
        centsToDecimal(data.feeCents),
      ]);
    } catch (err) {
      throw translateDatabaseError(err);
    }
    return (await this.findById(id))!;
  }

  async update(id: string, data: FeeRangeData) {
    try {
      await db.query('UPDATE delivery_fee_ranges SET min_meters = ?, max_meters = ?, fee = ? WHERE id = ?', [
        data.minMeters,
        data.maxMeters,
        centsToDecimal(data.feeCents),
        id,
      ]);
    } catch (err) {
      throw translateDatabaseError(err);
    }
  }

  async deactivate(id: string) {
    await db.query('UPDATE delivery_fee_ranges SET active = FALSE WHERE id = ?', [id]);
  }
}

export const deliveryFeesRepository: DeliveryFeesRepository = new MySqlDeliveryFeesRepository();
