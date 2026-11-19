import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { db } from '../../config/database';
import { AppError } from '../../shared/errors/AppError';
import { translateDatabaseError } from '../../shared/errors/databaseErrors';
import { decimalToCents } from '../../shared/utils/money';
import { dayBounds } from '../../shared/utils/dayBounds';
import { todayISODate } from '../../shared/utils/date';
import type {
  DeliveriesFilter, Delivery, DeliveryActor, DeliveryAddress, DeliveryCommand, DeliveryStatus, LockedDeliveryState,
} from './delivery.types';

export interface DeliveriesRepository {
  findById(id: string): Promise<Delivery | null>;
  findByOrder(orderId: string): Promise<Delivery | null>;
  listByCourier(courierId: string, filter: DeliveriesFilter): Promise<Delivery[]>;
  summaryToday?(courierId: string): Promise<{ date: string; count: number; earningsCents: number; unknownCount: number }>;
  /** decide retorna false para reenvio idempotente; lançar um erro desfaz a transação. */
  change(id: string, actor: DeliveryActor, command: DeliveryCommand, decide: (state: LockedDeliveryState) => boolean): Promise<Delivery>;
}

interface DeliveryRow extends RowDataPacket {
  id: string;
  order_id: string;
  courier_id: string | null;
  status: DeliveryStatus;
  address_snapshot: DeliveryAddress | string;
  created_at: Date;
  assigned_at: Date | null;
  started_at: Date | null;
  completed_at: Date | null;
  completion_received_at: Date | null;
  completion_key: string | null;
  cancelled_at: Date | null;
  courier_earnings: string | null;
}

interface DeliveryDetailRow extends DeliveryRow {
  customer_id: string;
  customer_name: string;
  customer_phone: string | null;
  courier_name: string | null;
  order_status: Delivery['orderStatus'];
  notes: string | null;
  payment_method: Delivery['paymentMethod'];
  total: string;
  change_for: string | null;
}

interface LockedOrderRow extends RowDataPacket {
  status: Delivery['orderStatus'];
  server_now: Date;
  delivery_fee: string;
}

const SELECT_DETAILS = `SELECT d.*, o.customer_id, o.status AS order_status, o.notes,
  o.payment_method, o.total, o.change_for, u.name AS customer_name, u.phone AS customer_phone,
  c.name AS courier_name
  FROM deliveries d JOIN orders o ON o.id = d.order_id
  JOIN users u ON u.id = o.customer_id LEFT JOIN users c ON c.id = d.courier_id`;

function map(row: DeliveryDetailRow): Delivery {
  const address: DeliveryAddress = typeof row.address_snapshot === 'string'
    ? JSON.parse(row.address_snapshot) : row.address_snapshot;
  return {
    id: row.id, orderId: row.order_id, customerId: row.customer_id,
    customer: { name: row.customer_name, phone: row.customer_phone },
    courierId: row.courier_id, courierName: row.courier_name,
    status: row.status, orderStatus: row.order_status,
    address: { ...address, latitude: Number(address.latitude), longitude: Number(address.longitude) },
    notes: row.notes, paymentMethod: row.payment_method,
    totalCents: decimalToCents(row.total),
    courierEarningsCents: row.courier_earnings === null ? null : decimalToCents(row.courier_earnings),
    changeForCents: row.change_for === null ? null : decimalToCents(row.change_for),
    createdAt: row.created_at, assignedAt: row.assigned_at, startedAt: row.started_at,
    completedAt: row.completed_at, completionReceivedAt: row.completion_received_at, cancelledAt: row.cancelled_at,
  };
}

/** Revalida dentro da transação: uma conta desativada não pode continuar usando seu JWT. */
async function lockActor(conn: PoolConnection, actor: DeliveryActor): Promise<void> {
  const [rows] = await conn.query<RowDataPacket[]>('SELECT role, active FROM users WHERE id = ? FOR SHARE', [actor.id]);
  if (!rows[0]?.active || rows[0].role !== actor.role) throw new AppError('Sessão sem permissão. Entre novamente.', 403);
}

/**
 * Todos os caminhos bloqueiam Order → Delivery, como o trigger de cancelamento.
 * O lock faz start/complete/assign aguardarem operações concorrentes no mesmo pedido.
 */
async function changeDelivery(
  id: string,
  actor: DeliveryActor,
  change: (conn: PoolConnection, row: DeliveryRow, order: LockedOrderRow) => Promise<void>,
): Promise<Delivery> {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [ids] = await conn.query<RowDataPacket[]>('SELECT order_id FROM deliveries WHERE id = ?', [id]);
    if (!ids[0]) throw new AppError('Entrega não encontrada', 404);
    const [orders] = await conn.query<LockedOrderRow[]>(
      'SELECT status, delivery_fee, UTC_TIMESTAMP(3) AS server_now FROM orders WHERE id = ? FOR UPDATE', [ids[0].order_id],
    );
    const [deliveries] = await conn.query<DeliveryRow[]>('SELECT * FROM deliveries WHERE id = ? FOR UPDATE', [id]);
    if (!orders[0] || !deliveries[0]) throw new AppError('Entrega não encontrada', 404);
    await lockActor(conn, actor);
    await change(conn, deliveries[0], orders[0]);
    // Leitura corrente: também nos reenvios idempotentes, retorna o estado após o lock.
    const [details] = await conn.query<DeliveryDetailRow[]>(`${SELECT_DETAILS} WHERE d.id = ? FOR SHARE`, [id]);
    const result = map(details[0]);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw translateDatabaseError(error);
  } finally { conn.release(); }
}

export class MySqlDeliveriesRepository implements DeliveriesRepository {
  async findById(id: string): Promise<Delivery | null> {
    const [rows] = await db.query<DeliveryDetailRow[]>(`${SELECT_DETAILS} WHERE d.id = ?`, [id]);
    return rows[0] ? map(rows[0]) : null;
  }

  async findByOrder(orderId: string): Promise<Delivery | null> {
    const [rows] = await db.query<DeliveryDetailRow[]>(`${SELECT_DETAILS} WHERE d.order_id = ?`, [orderId]);
    return rows[0] ? map(rows[0]) : null;
  }

  async listByCourier(courierId: string, { active, limit, offset }: DeliveriesFilter): Promise<Delivery[]> {
    const [rows] = await db.query<DeliveryDetailRow[]>(`${SELECT_DETAILS} WHERE d.courier_id = ?
      AND d.status ${active ? 'IN' : 'NOT IN'} ('ASSIGNED', 'IN_PROGRESS')
      ORDER BY d.created_at DESC, d.id LIMIT ? OFFSET ?`, [courierId, limit, offset]);
    return rows.map(map);
  }

  async summaryToday(courierId: string) {
    const date = todayISODate();
    const { from, until } = dayBounds(date);
    const [rows] = await db.query<RowDataPacket[]>(`SELECT COUNT(*) AS count,
      COALESCE(SUM(courier_earnings), 0) AS earnings,
      SUM(CASE WHEN courier_earnings IS NULL THEN 1 ELSE 0 END) AS unknown_count
      FROM deliveries WHERE courier_id = ? AND status = 'COMPLETED'
      AND completed_at >= ? AND completed_at < ?`, [courierId, from, until]);
    return { date, count: Number(rows[0].count), earningsCents: decimalToCents(rows[0].earnings), unknownCount: Number(rows[0].unknown_count ?? 0) };
  }

  change(id: string, actor: DeliveryActor, command: DeliveryCommand, decide: (state: LockedDeliveryState) => boolean): Promise<Delivery> {
    return changeDelivery(id, actor, async (conn, row, order) => {
      let candidateCourierEligible = false;
      if (command.type === 'assign') {
        const [couriers] = await conn.query<RowDataPacket[]>(
          "SELECT id FROM users WHERE id = ? AND role = 'COURIER' AND active = 1 FOR SHARE", [command.courierId],
        );
        candidateCourierEligible = couriers.length > 0;
      }
      // O service decide usando o estado bloqueado, não uma leitura anterior que pode ter mudado.
      const apply = decide({
        status: row.status, orderStatus: order.status, courierId: row.courier_id, candidateCourierEligible,
        startedAt: row.started_at, completedAt: row.completed_at, completionKey: row.completion_key, serverNow: order.server_now,
      });
      if (!apply) return;
      if (command.type === 'assign') {
        let earnings = row.courier_earnings ?? order.delivery_fee;
        if (row.courier_earnings === null && decimalToCents(order.delivery_fee) === 0) {
          const [preferences] = await conn.query<RowDataPacket[]>('SELECT free_delivery_courier_fee FROM store_preferences WHERE id = 1 FOR SHARE');
          earnings = preferences[0].free_delivery_courier_fee;
        }
        await conn.query("UPDATE deliveries SET courier_id = ?, status = 'ASSIGNED', assigned_at = UTC_TIMESTAMP(3), courier_earnings = ? WHERE id = ?", [command.courierId, earnings, id]);
      } else if (command.type === 'start') {
        // Se qualquer UPDATE falhar, o rollback mantém os dois estados anteriores.
        await conn.query("UPDATE orders SET status = 'OUT_FOR_DELIVERY' WHERE id = ?", [row.order_id]);
        await conn.query("UPDATE deliveries SET status = 'IN_PROGRESS', started_at = UTC_TIMESTAMP(3) WHERE id = ?", [id]);
      } else {
        const { operationId, completedAt } = command.input;
        await conn.query("UPDATE orders SET status = 'DELIVERED' WHERE id = ?", [row.order_id]);
        // UNIQUE protege a chave até quando duas entregas diferentes concorrem.
        await conn.query(`UPDATE deliveries SET status = 'COMPLETED', completed_at = ?,
          completion_received_at = UTC_TIMESTAMP(3), completion_key = ? WHERE id = ?`, [completedAt, operationId, id]);
      }
    });
  }
}

export const deliveriesRepository = new MySqlDeliveriesRepository();
