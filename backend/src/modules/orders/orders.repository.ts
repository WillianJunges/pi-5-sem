import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { db } from '../../config/database';
import { translateDatabaseError } from '../../shared/errors/databaseErrors';
import { centsToDecimal, decimalToCents } from '../../shared/utils/money';
import type { NewOrder, Order, OrderItem, OrderStatus, OrderSummary, PaymentMethod } from './order.types';

export interface OrdersRepository {
  /** Grava o pedido e os itens numa transação. Devolve o id. */
  create(customerId: string, order: NewOrder): Promise<string>;
  /** Pedido do cliente (null se não existir ou for de outro cliente). */
  findByCustomer(customerId: string, id: string): Promise<Order | null>;
  /** Histórico do cliente, mais novos primeiro. */
  listByCustomer(customerId: string, limit: number, offset: number): Promise<OrderSummary[]>;
}

interface OrderSummaryRow extends RowDataPacket {
  id: string;
  status: OrderStatus;
  is_active: number;
  payment_method: PaymentMethod;
  address_label: string | null;
  address_street: string;
  address_number: string;
  total: string;
  item_count: string | number;
  items_summary: string;
  created_at: Date;
}

interface OrderRow extends RowDataPacket {
  id: string;
  customer_id: string;
  menu_id: string;
  status: OrderStatus;
  payment_method: PaymentMethod;
  change_for: string | null;
  notes: string | null;
  address_id: string;
  address_label: string | null;
  address_cep: string;
  address_street: string;
  address_number: string;
  address_complement: string | null;
  address_district: string;
  address_city: string;
  address_state: string;
  address_latitude: string;
  address_longitude: string;
  distance_meters: number;
  subtotal: string;
  delivery_fee: string;
  total: string;
  created_at: Date;
  confirmed_at: Date | null;
  preparing_at: Date | null;
  ready_at: Date | null;
  out_for_delivery_at: Date | null;
  delivered_at: Date | null;
  cancelled_at: Date | null;
}

interface OrderItemRow extends RowDataPacket {
  id: string;
  product_id: string;
  variant_id: string;
  product_name: string;
  variant_name: string;
  quantity: number;
  unit_price: string;
  subtotal: string;
}

function mapItem(row: OrderItemRow): OrderItem {
  return {
    id: row.id,
    productId: row.product_id,
    variantId: row.variant_id,
    productName: row.product_name,
    variantName: row.variant_name,
    quantity: row.quantity,
    unitPriceCents: decimalToCents(row.unit_price),
    subtotalCents: decimalToCents(row.subtotal),
  };
}

function mapOrder(row: OrderRow, items: OrderItem[]): Order {
  return {
    id: row.id,
    customerId: row.customer_id,
    menuId: row.menu_id,
    status: row.status,
    paymentMethod: row.payment_method,
    changeForCents: row.change_for === null ? null : decimalToCents(row.change_for),
    notes: row.notes,
    address: {
      addressId: row.address_id,
      label: row.address_label,
      cep: row.address_cep,
      street: row.address_street,
      number: row.address_number,
      complement: row.address_complement,
      district: row.address_district,
      city: row.address_city,
      state: row.address_state,
      latitude: Number(row.address_latitude),
      longitude: Number(row.address_longitude),
    },
    distanceMeters: row.distance_meters,
    subtotalCents: decimalToCents(row.subtotal),
    deliveryFeeCents: decimalToCents(row.delivery_fee),
    totalCents: decimalToCents(row.total),
    items,
    createdAt: row.created_at,
    confirmedAt: row.confirmed_at,
    preparingAt: row.preparing_at,
    readyAt: row.ready_at,
    outForDeliveryAt: row.out_for_delivery_at,
    deliveredAt: row.delivered_at,
    cancelledAt: row.cancelled_at,
  };
}

export class MySqlOrdersRepository implements OrdersRepository {
  async create(customerId: string, order: NewOrder): Promise<string> {
    const id = randomUUID();
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const a = order.address;
      await conn.query(
        `INSERT INTO orders
           (id, customer_id, menu_id, payment_method, change_for, notes,
            address_id, address_label, address_cep, address_street, address_number, address_complement,
            address_district, address_city, address_state, address_latitude, address_longitude,
            distance_meters, subtotal, delivery_fee, total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          customerId,
          order.menuId,
          order.paymentMethod,
          order.changeForCents === null ? null : centsToDecimal(order.changeForCents),
          order.notes,
          a.addressId,
          a.label,
          a.cep,
          a.street,
          a.number,
          a.complement,
          a.district,
          a.city,
          a.state,
          a.latitude,
          a.longitude,
          order.distanceMeters,
          centsToDecimal(order.subtotalCents),
          centsToDecimal(order.deliveryFeeCents),
          centsToDecimal(order.totalCents),
        ],
      );
      for (const item of order.items) {
        await conn.query(
          `INSERT INTO order_items
             (id, order_id, product_id, variant_id, product_name, variant_name, quantity, unit_price, subtotal)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            randomUUID(),
            id,
            item.productId,
            item.variantId,
            item.productName,
            item.variantName,
            item.quantity,
            centsToDecimal(item.unitPriceCents),
            centsToDecimal(item.subtotalCents),
          ],
        );
      }
      await conn.commit();
      return id;
    } catch (err) {
      await conn.rollback();
      throw translateDatabaseError(err);
    } finally {
      conn.release();
    }
  }

  async findByCustomer(customerId: string, id: string): Promise<Order | null> {
    const [rows] = await db.query<OrderRow[]>('SELECT * FROM orders WHERE id = ? AND customer_id = ?', [
      id,
      customerId,
    ]);
    if (!rows[0]) return null;
    const [items] = await db.query<OrderItemRow[]>(
      'SELECT * FROM order_items WHERE order_id = ? ORDER BY product_name, variant_name',
      [id],
    );
    return mapOrder(rows[0], items.map(mapItem));
  }

  async listByCustomer(customerId: string, limit: number, offset: number): Promise<OrderSummary[]> {
    const [rows] = await db.query<OrderSummaryRow[]>(
      `SELECT * FROM vw_customer_orders WHERE customer_id = ?
        ORDER BY created_at DESC, id LIMIT ? OFFSET ?`,
      [customerId, limit, offset],
    );
    return rows.map(mapSummary);
  }
}

export function mapSummary(row: OrderSummaryRow): OrderSummary {
  return {
    id: row.id,
    status: row.status,
    isActive: Boolean(row.is_active),
    paymentMethod: row.payment_method,
    addressLabel: row.address_label,
    addressStreet: row.address_street,
    addressNumber: row.address_number,
    totalCents: decimalToCents(row.total),
    itemCount: Number(row.item_count),
    itemsSummary: row.items_summary,
    createdAt: row.created_at,
  };
}

export const ordersRepository: OrdersRepository = new MySqlOrdersRepository();
