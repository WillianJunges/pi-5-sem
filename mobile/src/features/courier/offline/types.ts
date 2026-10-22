import type { Delivery, DeliveryCompletion } from '../../../services/deliveries.service';

export class CourierLocalError extends Error {
  constructor(message: string, public status = 0, public code?: 'access_changed') { super(message); this.name = 'CourierLocalError'; }
}
export interface PendingCompletion extends DeliveryCompletion {
  userId: string;
  deliveryId: string;
  orderId: string;
  status: 'pending' | 'conflict';
  attempts: number;
  nextAttemptAt: number;
  leaseId: string | null;
  leaseUntil: number;
  message: string | null;
}
export interface CourierLocalStorage {
  get(userId: string, id: string): Promise<Delivery | null>;
  list(userId: string): Promise<Delivery[]>;
  save(userId: string, deliveries: Delivery[]): Promise<void>;
  revoke(userId: string, id: string): Promise<void>;
  isBlocked(userId: string): Promise<boolean>;
  block(userId: string, blocked: boolean): Promise<void>;
  pending(userId: string): Promise<PendingCompletion[]>;
  enqueue(userId: string, id: string, input: DeliveryCompletion): Promise<PendingCompletion>;
  claim(userId: string, now: number, leaseId: string): Promise<PendingCompletion | null>;
  acknowledge(userId: string, operationId: string, delivery: Delivery): Promise<void>;
  fail(item: PendingCompletion, message: string, conflict: boolean, nextAttemptAt: number): Promise<void>;
  retry(userId: string, id?: string): Promise<void>;
}

/** Porta SQL compartilhada pelo Expo SQLite e pelos testes com SQLite real no Node. */
export type SqlValue = string | number | null;
export interface CourierDatabase {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: SqlValue[]): Promise<{ changes: number }>;
  getFirstAsync<T>(sql: string, ...params: SqlValue[]): Promise<T | null>;
  getAllAsync<T>(sql: string, ...params: SqlValue[]): Promise<T[]>;
  withExclusiveTransactionAsync(task: (tx: CourierDatabase) => Promise<void>): Promise<void>;
}
