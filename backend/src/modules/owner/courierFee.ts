import { Router } from 'express';
import type { RowDataPacket } from 'mysql2/promise';
import { db } from '../../config/database';
import { centsToDecimal, decimalToCents, fromCents, reaisSchema } from '../../shared/utils/money';
import { z } from 'zod';

export const ownerCourierFeeRoutes = Router();
ownerCourierFeeRoutes.get('/', async (_req, res) => {
  const [rows] = await db.query<RowDataPacket[]>('SELECT free_delivery_courier_fee FROM store_preferences WHERE id = 1');
  res.json({ fee: fromCents(decimalToCents(rows[0].free_delivery_courier_fee)) });
});
ownerCourierFeeRoutes.put('/', async (req, res) => {
  const { fee } = z.object({ fee: reaisSchema('Valor fixo', { min: 0 }) }).parse(req.body);
  await db.query('UPDATE store_preferences SET free_delivery_courier_fee = ? WHERE id = 1', [centsToDecimal(fee)]);
  res.json({ fee: fromCents(fee) });
});
