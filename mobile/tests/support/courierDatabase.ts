import { DatabaseSync } from 'node:sqlite';
import type { CourierDatabase, SqlValue } from '../../src/features/courier/offline/types';

/** Mesmos comandos SQL da aplicação, executados por um SQLite real em arquivo temporário. */
export class TestCourierDatabase implements CourierDatabase {
  readonly raw: DatabaseSync;
  constructor(path = ':memory:') { this.raw = new DatabaseSync(path); }
  async execAsync(sql: string) { this.raw.exec(sql); }
  async runAsync(sql: string, ...params: SqlValue[]) { return { changes: Number(this.raw.prepare(sql).run(...params).changes) }; }
  async getFirstAsync<T>(sql: string, ...params: SqlValue[]) { return (this.raw.prepare(sql).get(...params) as T | undefined) ?? null; }
  async getAllAsync<T>(sql: string, ...params: SqlValue[]) { return this.raw.prepare(sql).all(...params) as T[]; }
  async withExclusiveTransactionAsync(task: (tx: CourierDatabase) => Promise<void>) {
    this.raw.exec('BEGIN IMMEDIATE');
    try { await task(this); this.raw.exec('COMMIT'); }
    catch (error) { this.raw.exec('ROLLBACK'); throw error; }
  }
  close() { this.raw.close(); }
}
