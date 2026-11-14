import { Router } from 'express';
import type { RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { db } from '../../config/database';
import { APP_TIMEZONE, todayISODate } from '../../shared/utils/date';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const daySchema = z.object({ weekday: z.number().int().min(0).max(6), opensAt: time.nullable(), closesAt: time.nullable() })
  .refine(day => (day.opensAt === null && day.closesAt === null) || (day.opensAt !== null && day.closesAt !== null && day.opensAt < day.closesAt), 'Informe abertura e fechamento no mesmo dia, ou marque como fechado');
export const businessHoursSchema = z.object({ days: z.array(daySchema).length(7).refine(days => new Set(days.map(d => d.weekday)).size === 7, 'Informe todos os dias') });

export async function getBusinessHours() {
  const [rows] = await db.query<RowDataPacket[]>("SELECT weekday, TIME_FORMAT(opens_at, '%H:%i') AS opensAt, TIME_FORMAT(closes_at, '%H:%i') AS closesAt FROM business_hours ORDER BY weekday");
  const days = Array.from({ length: 7 }, (_, weekday) => {
    const row = rows.find(r => r.weekday === weekday);
    return { weekday, opensAt: row?.opensAt ?? null, closesAt: row?.closesAt ?? null };
  });
  const todayWeekday = new Date(`${todayISODate()}T12:00:00Z`).getUTCDay();
  return { configured: rows.length === 7, todayWeekday, days };
}

export function isWithinBusinessHours(days: { weekday: number; opensAt: string | null; closesAt: string | null }[], now = new Date()): boolean {
  const date = todayISODate(now);
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const clock = new Intl.DateTimeFormat('en-GB', { timeZone: APP_TIMEZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  const day = days.find(item => item.weekday === weekday);
  return !!day?.opensAt && !!day.closesAt && clock >= day.opensAt && clock < day.closesAt;
}

export async function isBusinessOpen(now = new Date()): Promise<boolean> {
  const schedule = await getBusinessHours();
  return schedule.configured && isWithinBusinessHours(schedule.days, now);
}

export const businessHoursRoutes = Router();
businessHoursRoutes.get('/', async (_req, res) => { res.json(await getBusinessHours()); });

export const ownerBusinessHoursRoutes = Router();
ownerBusinessHoursRoutes.get('/', async (_req, res) => { res.json(await getBusinessHours()); });
ownerBusinessHoursRoutes.put('/', async (req, res) => {
  const { days } = businessHoursSchema.parse(req.body);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    for (const day of days) await conn.query('INSERT INTO business_hours (weekday, opens_at, closes_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE opens_at = VALUES(opens_at), closes_at = VALUES(closes_at)', [day.weekday, day.opensAt, day.closesAt]);
    await conn.commit();
  } catch (error) { await conn.rollback(); throw error; }
  finally { conn.release(); }
  res.json(await getBusinessHours());
});
