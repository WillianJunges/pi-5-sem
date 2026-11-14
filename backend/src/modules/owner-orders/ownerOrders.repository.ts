import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { db } from '../../config/database';
import { translateDatabaseError } from '../../shared/errors/databaseErrors';
import { dayBounds, periodDates } from '../../shared/utils/dayBounds';
import { todayISODate } from '../../shared/utils/date';
import { decimalToCents, fromCents } from '../../shared/utils/money';
import type { OrderStatus } from '../orders/order.types';
import { mapSummary, ordersRepository } from '../orders/orders.repository';
import type { OrderCustomer, OwnerOrder, OwnerOrderSummary } from './ownerOrders.types';

export interface OwnerOrdersFilter {
  /** true = em andamento; false = entregues e cancelados; undefined = todos. */
  active?: boolean;
  status?: OrderStatus;
  search?: string;
  date?: string;
  from?: string;
  to?: string;
  limit: number;
  offset: number;
}

export interface OwnerOrdersRepository {
  /** Pedidos de todos os clientes, mais novos primeiro. */
  list(filter: OwnerOrdersFilter): Promise<OwnerOrderSummary[]>;
  /** Pedido completo com os itens (null se não existir). */
  findById(id: string): Promise<OwnerOrder | null>;
  /**
   * Muda o status só se o pedido ainda estiver em um dos `from` (evita que duas telas
   * abertas mudem o mesmo pedido ao mesmo tempo). Devolve false se nada mudou.
   * O trigger trg_orders_before_update (script 019) confere o fluxo e grava o horário.
   */
  updateStatus(id: string, from: OrderStatus[], to: OrderStatus, reason?: string | null): Promise<boolean>;
  dashboard?(period?: 'day' | 'week' | 'month'): Promise<{ date: string; startDate: string; endDate: string; orderCount: number; completedCount: number; cancelledCount: number; sales: number; average: number }>;
}

interface CustomerRow extends RowDataPacket {
  customer_id: string;
  customer_name: string;
  customer_phone: string | null;
}

const toCustomer = (row: CustomerRow): OrderCustomer => ({ name: row.customer_name, phone: row.customer_phone });

export class MySqlOwnerOrdersRepository implements OwnerOrdersRepository {
  async list({ active, status, search, date, from: fromDate, to: toDate, limit, offset }: OwnerOrdersFilter): Promise<OwnerOrderSummary[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (active !== undefined) {
      where.push('v.is_active = ?');
      params.push(active);
    }
    if (status) {
      where.push('v.status = ?');
      params.push(status);
    }
    if (search) {
      where.push('(u.name LIKE ? OR v.id LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    if (date) {
      const { from, until } = dayBounds(date);
      where.push('v.created_at >= ? AND v.created_at < ?');
      params.push(from, until);
    }
    if (fromDate) { where.push('v.created_at >= ?'); params.push(dayBounds(fromDate).from); }
    if (toDate) { where.push('v.created_at < ?'); params.push(dayBounds(toDate).until); }
    // vw_customer_orders (script 020, módulo do Cliente) já traz o resumo dos itens
    const [rows] = await db.query<CustomerRow[]>(
      `SELECT v.*, u.name AS customer_name, u.phone AS customer_phone
         FROM vw_customer_orders v
         JOIN users u ON u.id = v.customer_id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY v.created_at DESC, v.id
        LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    return rows.map((row) => ({
      ...mapSummary(row as unknown as Parameters<typeof mapSummary>[0]),
      customer: toCustomer(row),
    }));
  }

  async dashboard(period: 'day' | 'week' | 'month' = 'day') {
    const date = todayISODate();
    const { startDate } = periodDates(date, period);
    const from = dayBounds(startDate).from;
    const until = dayBounds(date).until;
    const [rows] = await db.query<RowDataPacket[]>(`SELECT COUNT(*) AS order_count,
      SUM(CASE WHEN status = 'DELIVERED' THEN 1 ELSE 0 END) AS completed_count,
      SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled_count,
      COALESCE(SUM(CASE WHEN status = 'DELIVERED' THEN total ELSE 0 END), 0) AS sales
      FROM orders WHERE created_at >= ? AND created_at < ?`, [from, until]);
    const completedCount = Number(rows[0].completed_count ?? 0);
    const salesCents = decimalToCents(String(rows[0].sales));
    return { date, startDate, endDate: date, orderCount: Number(rows[0].order_count), completedCount, cancelledCount: Number(rows[0].cancelled_count ?? 0), sales: fromCents(salesCents), average: fromCents(completedCount ? Math.round(salesCents / completedCount) : 0) };
  }

  async findById(id: string): Promise<OwnerOrder | null> {
    const [rows] = await db.query<CustomerRow[]>(
      `SELECT o.customer_id, u.name AS customer_name, u.phone AS customer_phone
         FROM orders o JOIN users u ON u.id = o.customer_id
        WHERE o.id = ?`,
      [id],
    );
    if (!rows[0]) return null;
    // reaproveita a leitura completa do módulo do Cliente (pedido + itens)
    const order = await ordersRepository.findByCustomer(rows[0].customer_id, id);
    return order ? { ...order, customer: toCustomer(rows[0]) } : null;
  }

  async updateStatus(id: string, from: OrderStatus[], to: OrderStatus, reason?: string | null): Promise<boolean> {
    try {
      const [result] = await db.query<ResultSetHeader>(
        `UPDATE orders SET status = ?, cancellation_reason = CASE WHEN ? = 'CANCELLED' THEN ? ELSE cancellation_reason END WHERE id = ? AND status IN (${from.map(() => '?').join(', ')})`,
        [to, to, reason ?? null, id, ...from],
      );
      return result.affectedRows > 0;
    } catch (err) {
      throw translateDatabaseError(err);
    }
  }
}

export const ownerOrdersRepository: OwnerOrdersRepository = new MySqlOwnerOrdersRepository();
