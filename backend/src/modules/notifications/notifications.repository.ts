import type { RowDataPacket } from 'mysql2/promise';
import { db } from '../../config/database';
import type { AttemptResult, NotificationsRepository, PushAttempt } from './notifications.types';

export const notificationsRepository: NotificationsRepository = {
  async materialize() {
    // Não envia retroativamente eventos anteriores ao vínculo deste aparelho.
    await db.query(`INSERT IGNORE INTO push_notification_attempts (id,event_id,device_id,binding_version)
      SELECT UUID(),e.id,p.id,p.binding_version FROM delivery_notification_events e
      JOIN push_devices p ON p.user_id=e.user_id AND p.active=1
      JOIN users u ON u.id=e.user_id AND u.active=1
      WHERE e.created_at >= p.bound_at AND e.created_at >= DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 DAY)`);
  },
  async claim(now, leaseId) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT a.*,e.user_id,e.delivery_id,e.kind,e.created_at,d.order_id,p.token
        FROM push_notification_attempts a JOIN delivery_notification_events e ON e.id=a.event_id
        JOIN deliveries d ON d.id=e.delivery_id JOIN push_devices p ON p.id=a.device_id
        WHERE a.status IN ('PENDING','SENDING','TICKET','CHECKING') AND a.next_attempt_at<=?
        AND (a.lease_until IS NULL OR a.lease_until<=?) ORDER BY a.next_attempt_at,a.id LIMIT 1 FOR UPDATE SKIP LOCKED`,
        [now, now],
      );
      const row = rows[0];
      if (!row) {
        await conn.commit();
        return null;
      }
      const receipt = row.status === 'TICKET' || row.status === 'CHECKING';
      await conn.query(
        `UPDATE push_notification_attempts SET status=?,lease_id=?,lease_until=?,
        attempts=attempts+?,receipt_attempts=receipt_attempts+?,updated_at=? WHERE id=?`,
        [
          receipt ? 'CHECKING' : 'SENDING',
          leaseId,
          new Date(now.getTime() + 60_000),
          receipt ? 0 : 1,
          receipt ? 1 : 0,
          now,
          row.id,
        ],
      );
      await conn.commit();
      return {
        id: row.id,
        eventId: row.event_id,
        deviceId: row.device_id,
        bindingVersion: Number(row.binding_version),
        userId: row.user_id,
        deliveryId: row.delivery_id,
        orderId: row.order_id,
        kind: row.kind,
        token: row.token,
        attempts: row.attempts + (receipt ? 0 : 1),
        receiptAttempts: row.receipt_attempts + (receipt ? 1 : 0),
        leaseId,
        ticketId: row.ticket_id,
        phase: receipt ? 'receipt' : 'send',
        createdAt: row.created_at,
      } as PushAttempt;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  },
  async eligible(a) {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT e.kind,e.user_id,d.status,d.courier_id,o.customer_id,o.status AS order_status,u.role
      FROM delivery_notification_events e JOIN deliveries d ON d.id=e.delivery_id JOIN orders o ON o.id=d.order_id
      JOIN users u ON u.id=e.user_id AND u.active=1
      JOIN push_devices p ON p.id=? AND p.user_id=e.user_id AND p.active=1 AND p.binding_version=? AND p.token=?
      WHERE e.id=? AND e.created_at>=p.bound_at AND e.created_at>=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 DAY)
      AND NOT EXISTS (SELECT 1 FROM delivery_notification_events newer WHERE newer.delivery_id=e.delivery_id AND newer.user_id=e.user_id AND newer.event_seq>e.event_seq)`,
      [a.deviceId, a.bindingVersion, a.token, a.eventId],
    );
    const row = rows[0];
    if (!row) return false;
    if (row.kind === 'OUT_FOR_DELIVERY')
      return (
        row.role === 'CUSTOMER' &&
        row.user_id === row.customer_id &&
        row.status === 'IN_PROGRESS' &&
        row.order_status === 'OUT_FOR_DELIVERY'
      );
    if (row.role !== 'COURIER') return false;
    if (row.kind === 'UNASSIGNED')
      return row.courier_id !== row.user_id && ['ASSIGNED', 'IN_PROGRESS'].includes(row.status);
    if (row.kind === 'CANCELLED') return row.courier_id === row.user_id && row.status === 'CANCELLED';
    return row.courier_id === row.user_id && row.status === 'ASSIGNED';
  },
  async finish(a, r: AttemptResult) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query<RowDataPacket[]>(
        'SELECT id FROM push_notification_attempts WHERE id=? AND lease_id=? FOR UPDATE',
        [a.id, a.leaseId],
      );
      if (rows.length) {
        await conn.query(
          `UPDATE push_notification_attempts SET status=?,next_attempt_at=?,ticket_id=COALESCE(?,ticket_id),error_code=?,
          lease_id=NULL,lease_until=NULL,updated_at=UTC_TIMESTAMP(3) WHERE id=?`,
          [r.status, r.nextAt, r.ticketId ?? null, r.errorCode ?? null, a.id],
        );
        if (r.disableDevice)
          await conn.query(
            'UPDATE push_devices SET active=0,updated_at=UTC_TIMESTAMP(3) WHERE id=? AND binding_version=? AND token=?',
            [a.deviceId, a.bindingVersion, a.token],
          );
      }
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  },
};
