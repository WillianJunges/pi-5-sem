import type { Delivery, DeliveryCompletion } from '../../../services/deliveries.service';
import { CourierLocalError, type CourierDatabase, type CourierLocalStorage, type PendingCompletion } from './types';
import { nextArrival,type ArrivalState,type ArrivalClaim } from '../../notifications/arrivalPolicy';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS courier_cache (
    user_id TEXT NOT NULL, delivery_id TEXT NOT NULL, data TEXT NOT NULL,
    PRIMARY KEY (user_id, delivery_id)
  );
  CREATE TABLE IF NOT EXISTS courier_accounts (user_id TEXT NOT NULL PRIMARY KEY, blocked INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS courier_completions (
    user_id TEXT NOT NULL, delivery_id TEXT NOT NULL, order_id TEXT NOT NULL,
    operation_id TEXT NOT NULL UNIQUE, completed_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'conflict')),
    attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL DEFAULT 0,
    lease_id TEXT, lease_until INTEGER NOT NULL DEFAULT 0, message TEXT,
    PRIMARY KEY (user_id, delivery_id)
  );
  CREATE INDEX IF NOT EXISTS idx_courier_sync ON courier_completions(user_id, status, next_attempt_at);
  PRAGMA user_version = 1;
`;
interface CacheRow { data: string }
const NOTIFICATIONS_SCHEMA=`
  CREATE TABLE IF NOT EXISTS courier_arrivals (
    user_id TEXT NOT NULL,delivery_id TEXT NOT NULL,event_id TEXT NOT NULL,
    first_near_at INTEGER NOT NULL,last_sample_at INTEGER NOT NULL,near_count INTEGER NOT NULL,
    notified_at INTEGER,lease_id TEXT,lease_until INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(user_id,delivery_id)
  );
  CREATE TABLE IF NOT EXISTS notification_inbox (
    user_id TEXT NOT NULL,event_id TEXT NOT NULL,seen INTEGER NOT NULL DEFAULT 0,opened INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(user_id,event_id)
  );
  PRAGMA user_version=2;
`;
interface ArrivalRow { event_id:string;first_near_at:number;last_sample_at:number;near_count:number;notified_at:number|null;lease_id:string|null;lease_until:number }
interface PendingRow {
  user_id: string; delivery_id: string; order_id: string; operation_id: string; completed_at: string;
  status: PendingCompletion['status']; attempts: number; next_attempt_at: number;
  lease_id: string | null; lease_until: number; message: string | null;
}
function pending(row: PendingRow): PendingCompletion {
  return { userId: row.user_id, deliveryId: row.delivery_id, orderId: row.order_id, operationId: row.operation_id,
    completedAt: row.completed_at, status: row.status, attempts: row.attempts, nextAttemptAt: row.next_attempt_at,
    leaseId: row.lease_id, leaseUntil: row.lease_until, message: row.message };
}
const terminal = (delivery: Delivery) => delivery.status === 'COMPLETED' || delivery.status === 'CANCELLED';

/** Cache e intenção de conclusão são independentes: atualizar o cache nunca apaga a fila. */
export class SqliteCourierStorage implements CourierLocalStorage {
  private opening: Promise<CourierDatabase> | null = null;
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private open: () => Promise<CourierDatabase>) {}

  private database(): Promise<CourierDatabase> {
    this.opening ??= this.open().then(async db => {
      await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
      const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
      if ((row?.user_version ?? 0) > 2) throw new Error('Versão local incompatível');
      if ((row?.user_version ?? 0) < 1) await db.withExclusiveTransactionAsync(async tx => tx.execAsync(SCHEMA));
      if ((row?.user_version ?? 0) < 2) await db.withExclusiveTransactionAsync(async tx => tx.execAsync(NOTIFICATIONS_SCHEMA));
      return db;
    }).catch(error => { this.opening = null; throw error; });
    return this.opening;
  }

  private serial<T>(task: (db: CourierDatabase) => Promise<T>): Promise<T> {
    const result = this.tail.then(async () => {
      try { return await task(await this.database()); }
      catch (error) {
        if (error instanceof CourierLocalError) throw error;
        throw new CourierLocalError('Não foi possível acessar os dados salvos neste aparelho. Libere espaço e tente novamente.', 507);
      }
    });
    this.tail = result.catch(() => undefined);
    return result;
  }

  private decode(userId: string, row: CacheRow): Delivery {
    const value = JSON.parse(row.data) as Delivery;
    if (value.courierId !== userId || !value.id || !value.address || !value.status) throw new Error('Cache inválido');
    return value;
  }

  get(userId: string, id: string): Promise<Delivery | null> {
    return this.serial(async db => {
      const row = await db.getFirstAsync<CacheRow>('SELECT data FROM courier_cache WHERE user_id = ? AND delivery_id = ?', userId, id);
      return row ? this.decode(userId, row) : null;
    });
  }
  list(userId: string): Promise<Delivery[]> {
    return this.serial(async db => (await db.getAllAsync<CacheRow>('SELECT data FROM courier_cache WHERE user_id = ?', userId)).map(row => this.decode(userId, row)));
  }

  private async write(tx: CourierDatabase, userId: string, delivery: Delivery) {
    if (delivery.courierId !== userId) throw new CourierLocalError('Entrega sem acesso nesta conta.', 404);
    const existing = await tx.getFirstAsync<CacheRow>('SELECT data FROM courier_cache WHERE user_id = ? AND delivery_id = ?', userId, delivery.id);
    // Uma leitura de rede atrasada não reabre uma entrega já encerrada no servidor.
    if (existing && terminal(this.decode(userId, existing)) && !terminal(delivery)) return;
    // Só o DTO da entrega entra no SQLite; metadados de sessão/rede nunca são copiados.
    const serverData: Delivery = {
      id: delivery.id, orderId: delivery.orderId, courierId: delivery.courierId, courierName: delivery.courierName,
      status: delivery.status, orderStatus: delivery.orderStatus,
      customer: { name: delivery.customer.name, phone: delivery.customer.phone },
      address: {
        label: delivery.address.label, street: delivery.address.street, number: delivery.address.number,
        complement: delivery.address.complement, district: delivery.address.district, city: delivery.address.city,
        state: delivery.address.state, cep: delivery.address.cep, latitude: delivery.address.latitude, longitude: delivery.address.longitude,
      },
      notes: delivery.notes, paymentMethod: delivery.paymentMethod, total: delivery.total, changeFor: delivery.changeFor,
      createdAt: delivery.createdAt, assignedAt: delivery.assignedAt, startedAt: delivery.startedAt,
      completedAt: delivery.completedAt, completionReceivedAt: delivery.completionReceivedAt, cancelledAt: delivery.cancelledAt,
    };
    await tx.runAsync('INSERT INTO courier_cache (user_id, delivery_id, data) VALUES (?, ?, ?) ON CONFLICT(user_id, delivery_id) DO UPDATE SET data = excluded.data', userId, delivery.id, JSON.stringify(serverData));
  }
  save(userId: string, deliveries: Delivery[]): Promise<void> {
    return this.serial(db => db.withExclusiveTransactionAsync(async tx => {
      for (const delivery of deliveries) await this.write(tx, userId, delivery);
    }));
  }
  revoke(userId: string, id: string): Promise<void> {
    return this.serial(db => db.withExclusiveTransactionAsync(async tx => {
      await tx.runAsync('DELETE FROM courier_cache WHERE user_id = ? AND delivery_id = ?', userId, id);
      await tx.runAsync("UPDATE courier_completions SET status = 'conflict', message = ?, lease_id = NULL, lease_until = 0 WHERE user_id = ? AND delivery_id = ?",
        'Entrega não disponível para esta conta. Confira com a proprietária.', userId, id);
    }));
  }
  isBlocked(userId: string): Promise<boolean> {
    return this.serial(async db => !!(await db.getFirstAsync<{ blocked: number }>('SELECT blocked FROM courier_accounts WHERE user_id = ?', userId))?.blocked);
  }
  block(userId: string, blocked: boolean): Promise<void> {
    return this.serial(async db => { await db.runAsync('INSERT INTO courier_accounts (user_id, blocked) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET blocked = excluded.blocked', userId, blocked ? 1 : 0); });
  }
  pending(userId: string): Promise<PendingCompletion[]> {
    return this.serial(async db => (await db.getAllAsync<PendingRow>('SELECT * FROM courier_completions WHERE user_id = ? ORDER BY completed_at, delivery_id', userId)).map(pending));
  }

  enqueue(userId: string, id: string, input: DeliveryCompletion): Promise<PendingCompletion> {
    return this.serial(async db => {
      let result!: PendingCompletion;
      await db.withExclusiveTransactionAsync(async tx => {
        if (await tx.getFirstAsync('SELECT user_id FROM courier_accounts WHERE user_id = ? AND blocked = 1', userId)) {
          throw new CourierLocalError('Conta sem permissão. Entre novamente para conferir o acesso.', 403);
        }
        const existing = await tx.getFirstAsync<PendingRow>('SELECT * FROM courier_completions WHERE user_id = ? AND delivery_id = ?', userId, id);
        if (existing) { result = pending(existing); return; }
        if (!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(input.operationId) || !Number.isFinite(new Date(input.completedAt).getTime())) {
          throw new CourierLocalError('Identificador ou horário da confirmação inválido. Tente novamente.', 409);
        }
        const cached = await tx.getFirstAsync<CacheRow>('SELECT data FROM courier_cache WHERE user_id = ? AND delivery_id = ?', userId, id);
        if (!cached) throw new CourierLocalError('Abra a entrega com conexão antes de concluir neste aparelho.', 409);
        const delivery = this.decode(userId, cached);
        if (delivery.status !== 'IN_PROGRESS' || delivery.orderStatus !== 'OUT_FOR_DELIVERY') {
          throw new CourierLocalError('Somente uma entrega iniciada pode ser concluída offline.', 409);
        }
        await tx.runAsync('INSERT INTO courier_completions (user_id, delivery_id, order_id, operation_id, completed_at) VALUES (?, ?, ?, ?, ?)',
          userId, id, delivery.orderId, input.operationId.toLowerCase(), new Date(input.completedAt).toISOString());
        result = pending((await tx.getFirstAsync<PendingRow>('SELECT * FROM courier_completions WHERE user_id = ? AND delivery_id = ?', userId, id))!);
      });
      return result;
    });
  }

  claim(userId: string, now: number, leaseId: string): Promise<PendingCompletion | null> {
    return this.serial(async db => {
      let result: PendingCompletion | null = null;
      await db.withExclusiveTransactionAsync(async tx => {
        const row = await tx.getFirstAsync<PendingRow>(`SELECT * FROM courier_completions WHERE user_id = ? AND status = 'pending'
          AND next_attempt_at <= ? AND lease_until <= ? ORDER BY completed_at, delivery_id LIMIT 1`, userId, now, now);
        if (!row) return;
        await tx.runAsync(`UPDATE courier_completions SET attempts = attempts + 1, lease_id = ?, lease_until = ?
          WHERE user_id = ? AND delivery_id = ?`, leaseId, now + 60_000, userId, row.delivery_id);
        result = pending({ ...row, attempts: row.attempts + 1, lease_id: leaseId, lease_until: now + 60_000 });
      });
      return result;
    });
  }

  acknowledge(userId: string, operationId: string, delivery: Delivery): Promise<void> {
    return this.serial(db => db.withExclusiveTransactionAsync(async tx => {
      const row = await tx.getFirstAsync<PendingRow>('SELECT * FROM courier_completions WHERE user_id = ? AND operation_id = ?', userId, operationId);
      if (!row) return;
      if (row.delivery_id !== delivery.id || row.order_id !== delivery.orderId || delivery.status !== 'COMPLETED' || delivery.orderStatus !== 'DELIVERED'
        || new Date(row.completed_at).getTime() !== new Date(delivery.completedAt ?? '').getTime()) throw new Error('Confirmação divergente');
      await this.write(tx, userId, delivery);
      await tx.runAsync('DELETE FROM courier_completions WHERE user_id = ? AND operation_id = ?', userId, operationId);
    }));
  }
  fail(item: PendingCompletion, message: string, conflict: boolean, nextAttemptAt: number): Promise<void> {
    return this.serial(async db => { await db.runAsync(`UPDATE courier_completions SET status = ?, message = ?, next_attempt_at = ?, lease_id = NULL, lease_until = 0
      WHERE user_id = ? AND delivery_id = ? AND operation_id = ? AND lease_id = ?`, conflict ? 'conflict' : 'pending', message, nextAttemptAt,
      item.userId, item.deliveryId, item.operationId, item.leaseId); });
  }
  retry(userId: string, id?: string): Promise<void> {
    return this.serial(async db => { await db.runAsync(`UPDATE courier_completions SET status = 'pending', next_attempt_at = 0, message = NULL
      WHERE user_id = ? ${id ? 'AND delivery_id = ?' : "AND status = 'pending'"}`, userId, ...(id ? [id] : [])); });
  }

  /** Reserva durável; a conclusão offline e a elegibilidade são verificadas na mesma transação. */
  recordArrival(userId:string,id:string,sampleAt:number,near:boolean,now:number,uuid:string):Promise<ArrivalClaim|null> {
    return this.serial(async db=>{
      let claim:ArrivalClaim|null=null;
      await db.withExclusiveTransactionAsync(async tx=>{
        if(await tx.getFirstAsync('SELECT user_id FROM courier_accounts WHERE user_id=? AND blocked=1',userId)) return;
        if(await tx.getFirstAsync('SELECT user_id FROM courier_completions WHERE user_id=? AND delivery_id=?',userId,id)) return;
        const cached=await tx.getFirstAsync<CacheRow>('SELECT data FROM courier_cache WHERE user_id=? AND delivery_id=?',userId,id);
        if(!cached) return;
        const delivery=this.decode(userId,cached);
        if(delivery.status!=='IN_PROGRESS'||delivery.orderStatus!=='OUT_FOR_DELIVERY') return;
        const row=await tx.getFirstAsync<ArrivalRow>('SELECT * FROM courier_arrivals WHERE user_id=? AND delivery_id=?',userId,id);
        const previous:ArrivalState|null=row?{eventId:row.event_id,firstNearAt:row.first_near_at,lastSampleAt:row.last_sample_at,nearCount:row.near_count,
          notifiedAt:row.notified_at,leaseId:row.lease_id,leaseUntil:row.lease_until}:null;
        const state=nextArrival(previous,sampleAt,near,uuid);
        if(near&&sampleAt> (previous?.lastSampleAt??0)&&state.nearCount>=2&&state.notifiedAt===null&&state.leaseUntil<=now) {
          state.leaseId=uuid;state.leaseUntil=now+30_000;
          claim={userId,deliveryId:id,orderId:delivery.orderId,eventId:state.eventId,leaseId:uuid};
        }
        await tx.runAsync(`INSERT INTO courier_arrivals (user_id,delivery_id,event_id,first_near_at,last_sample_at,near_count,notified_at,lease_id,lease_until)
          VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,delivery_id) DO UPDATE SET first_near_at=excluded.first_near_at,last_sample_at=excluded.last_sample_at,
          near_count=excluded.near_count,notified_at=excluded.notified_at,lease_id=excluded.lease_id,lease_until=excluded.lease_until`,
        userId,id,state.eventId,state.firstNearAt,state.lastSampleAt,state.nearCount,state.notifiedAt,state.leaseId,state.leaseUntil);
      });return claim;
    });
  }
  finishArrival(claim:ArrivalClaim,success:boolean,now:number):Promise<void> {
    return this.serial(async db=>{await db.runAsync(`UPDATE courier_arrivals SET notified_at=?,lease_id=NULL,lease_until=0
      WHERE user_id=? AND delivery_id=? AND lease_id=?`,success?now:null,claim.userId,claim.deliveryId,claim.leaseId);});
  }
  claimNotification(userId:string,eventId:string,column:'seen'|'opened'):Promise<boolean> {
    return this.serial(async db=>{
      let accepted=false;
      await db.withExclusiveTransactionAsync(async tx=>{
        await tx.runAsync('INSERT OR IGNORE INTO notification_inbox (user_id,event_id) VALUES (?,?)',userId,eventId);
        accepted=(await tx.runAsync(`UPDATE notification_inbox SET ${column}=1 WHERE user_id=? AND event_id=? AND ${column}=0`,userId,eventId)).changes>0;
      });return accepted;
    });
  }
}
