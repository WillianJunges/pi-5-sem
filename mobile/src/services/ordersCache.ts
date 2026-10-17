import * as SQLite from 'expo-sqlite';
import type { OrderSummary } from './orders.service';

/**
 * Cópia local da primeira página do histórico, para a aba Pedidos abrir sem internet
 * (escopo, seções 5 e 20). Os dados do backend sempre substituem a cópia.
 * Banco separado do carrinho (cart.db) para um não depender da migração do outro.
 */
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDb() {
  dbPromise ??= (async () => {
    const db = await SQLite.openDatabaseAsync('orders-cache.db');
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS orders_cache (
        user_id   TEXT NOT NULL PRIMARY KEY,
        data      TEXT NOT NULL,
        saved_at  TEXT NOT NULL
      );
    `);
    return db;
  })();
  return dbPromise;
}

export interface CachedOrders {
  orders: OrderSummary[];
  /** Quando a cópia foi salva (ISO). */
  savedAt: string;
}

export const ordersCache = {
  async get(userId: string): Promise<CachedOrders | null> {
    try {
      const db = await getDb();
      const row = await db.getFirstAsync<{ data: string; saved_at: string }>(
        'SELECT data, saved_at FROM orders_cache WHERE user_id = ?',
        userId,
      );
      return row ? { orders: JSON.parse(row.data) as OrderSummary[], savedAt: row.saved_at } : null;
    } catch {
      return null; // cache é só conveniência: se falhar, a tela segue sem ele
    }
  },

  async save(userId: string, orders: OrderSummary[]): Promise<void> {
    try {
      const db = await getDb();
      await db.runAsync(
        'INSERT OR REPLACE INTO orders_cache (user_id, data, saved_at) VALUES (?, ?, ?)',
        userId,
        JSON.stringify(orders),
        new Date().toISOString(),
      );
    } catch {
      // idem: não impede a tela de mostrar os dados que vieram do backend
    }
  },
};
