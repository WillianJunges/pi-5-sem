import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { db } from '../../config/database';
import { AppError } from '../../shared/errors/AppError';
import type { DeliveryActor } from '../deliveries/delivery.types';
import type { PositionInput, TrackingPosition, TrackingView } from './tracking.schemas';

interface State extends RowDataPacket { status: string; order_status: string; courier_id: string | null; customer_id: string; server_now: Date }
interface PositionRow extends RowDataPacket { sample_id: string; latitude: string; longitude: string; accuracy: number; captured_at: Date; received_at: Date }

/** Mesmo lock Order → Delivery das transições; uma conclusão concorrente encerra a escrita GPS. */
async function locked<T>(id: string, actor: DeliveryActor, write: boolean, task: (conn: PoolConnection, state: State) => Promise<T>): Promise<T> {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [ids] = await conn.query<RowDataPacket[]>('SELECT order_id FROM deliveries WHERE id = ?', [id]);
    if (!ids[0]) throw new AppError('Entrega não encontrada', 404);
    await conn.query(`SELECT id FROM orders WHERE id = ? ${write ? 'FOR UPDATE' : 'FOR SHARE'}`, [ids[0].order_id]);
    const [rows] = await conn.query<State[]>(`SELECT d.status, d.courier_id, o.customer_id, o.status AS order_status,
      UTC_TIMESTAMP(3) AS server_now FROM deliveries d JOIN orders o ON o.id = d.order_id WHERE d.id = ? ${write ? 'FOR UPDATE' : 'FOR SHARE'}`, [id]);
    const [users] = await conn.query<RowDataPacket[]>('SELECT active, role FROM users WHERE id = ? FOR SHARE', [actor.id]);
    if (!users[0]?.active || users[0].role !== actor.role) throw new AppError('Sessão sem permissão. Entre novamente.', 403);
    const state = rows[0];
    const allowed = state && (actor.role === 'OWNER' || (actor.role === 'CUSTOMER' && state.customer_id === actor.id)
      || (actor.role === 'COURIER' && state.courier_id === actor.id));
    if (!allowed) throw new AppError('Entrega não encontrada', 404);
    if (write && actor.role !== 'COURIER') throw new AppError('Somente o motoboy pode enviar a posição.', 403);
    const result = await task(conn, state);
    await conn.commit();
    return result;
  } catch (error) { await conn.rollback(); throw error; }
  finally { conn.release(); }
}

async function position(conn: PoolConnection, id: string): Promise<TrackingPosition | null> {
  // Leitura corrente após esperar pelo lock; o snapshot inicial pode ser anterior a outro envio.
  const [rows] = await conn.query<PositionRow[]>('SELECT * FROM delivery_last_locations WHERE delivery_id = ? FOR SHARE', [id]);
  const row = rows[0];
  return row ? { deliveryId: id, sampleId: row.sample_id, latitude: Number(row.latitude), longitude: Number(row.longitude),
    accuracy: row.accuracy, capturedAt: row.captured_at.toISOString(), receivedAt: row.received_at.toISOString() } : null;
}
const isActive = (state: State) => state.status === 'IN_PROGRESS' && state.order_status === 'OUT_FOR_DELIVERY';

export const trackingRepository = {
  read(id: string, actor: DeliveryActor): Promise<TrackingView> {
    return locked(id, actor, false, async (conn, state) => {
      // Não expõe nem a última coordenada quando a entrega encerra.
      const current = isActive(state) ? await position(conn, id) : null;
      return { deliveryId: id, active: isActive(state), position: current,
        stale: !current || state.server_now.getTime() - Date.parse(current.capturedAt) > 120_000 };
    });
  },
  write(id: string, actor: DeliveryActor, input: PositionInput): Promise<TrackingView> {
    return locked(id, actor, true, async (conn, state) => {
      if (!isActive(state)) throw new AppError('O rastreamento exige uma entrega em andamento.', 409);
      const age = state.server_now.getTime() - input.capturedAt.getTime();
      if (age > 120_000 || age < -30_000) throw new AppError('Posição antiga ou relógio incompatível.', 422);
      const previous = await position(conn, id);
      // Reenvios e respostas fora de ordem nunca fazem o marcador voltar no tempo.
      if (previous && input.capturedAt.getTime() <= Date.parse(previous.capturedAt)) {
        return { deliveryId: id, active: true, position: previous, stale: false };
      }
      if (previous && state.server_now.getTime() - Date.parse(previous.receivedAt) < 3_000) {
        throw new AppError('Aguarde alguns segundos para enviar outra posição.', 429);
      }
      await conn.query(`INSERT INTO delivery_last_locations (delivery_id, sample_id, latitude, longitude, accuracy, captured_at, received_at)
        VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE sample_id = VALUES(sample_id), latitude = VALUES(latitude),
        longitude = VALUES(longitude), accuracy = VALUES(accuracy), captured_at = VALUES(captured_at), received_at = VALUES(received_at)`,
      [id, input.sampleId, input.latitude, input.longitude, input.accuracy, input.capturedAt, state.server_now]);
      return { deliveryId: id, active: true, position: (await position(conn, id))!, stale: false };
    });
  },
};
