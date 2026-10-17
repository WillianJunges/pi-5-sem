import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { db } from '../../config/database';
import { translateDatabaseError } from '../../shared/errors/databaseErrors';
import type { OrderStatus } from '../orders/order.types';
import { mapSummary, ordersRepository } from '../orders/orders.repository';
import type { OrderCustomer, OwnerOrder, OwnerOrderSummary } from './ownerOrders.types';

export interface OwnerOrdersFilter {
  /** true = em andamento; false = entregues e cancelados; undefined = todos. */
  active?: boolean;
  status?: OrderStatus;
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
  updateStatus(id: string, from: OrderStatus[], to: OrderStatus): Promise<boolean>;
}

interface CustomerRow extends RowDataPacket {
  customer_id: string;
  customer_name: string;
  customer_phone: string | null;
}

const toCustomer = (row: CustomerRow): OrderCustomer => ({ name: row.customer_name, phone: row.customer_phone });

export class MySqlOwnerOrdersRepository implements OwnerOrdersRepository {
  async list({ active, status, limit, offset }: OwnerOrdersFilter): Promise<OwnerOrderSummary[]> {
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

  async updateStatus(id: string, from: OrderStatus[], to: OrderStatus): Promise<boolean> {
    try {
      const [result] = await db.query<ResultSetHeader>(
        `UPDATE orders SET status = ? WHERE id = ? AND status IN (${from.map(() => '?').join(', ')})`,
        [to, id, ...from],
      );
      return result.affectedRows > 0;
    } catch (err) {
      throw translateDatabaseError(err);
    }
  }
}

export const ownerOrdersRepository: OwnerOrdersRepository = new MySqlOwnerOrdersRepository();
