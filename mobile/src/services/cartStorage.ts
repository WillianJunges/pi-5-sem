import * as SQLite from 'expo-sqlite';

/** Item do carrinho como fica salvo no aparelho. */
export interface CartItem {
  /** productId + variação: o mesmo produto com variações diferentes são itens separados. */
  id: string;
  productId: string;
  name: string;
  variation: string | null;
  /** Preço no momento em que foi adicionado. O backend confere de novo no checkout. */
  unitPrice: number;
  quantity: number;
  /** Data do cardápio (AAAA-MM-DD) de onde o item veio. */
  menuDate: string;
}

export type NewCartItem = Omit<CartItem, 'id' | 'quantity'>;

interface CartRow {
  id: string;
  product_id: string;
  name: string;
  variation: string | null;
  unit_price: number;
  quantity: number;
  menu_date: string;
}

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDb() {
  dbPromise ??= (async () => {
    const db = await SQLite.openDatabaseAsync('cart.db');
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS cart_items (
        user_id    TEXT    NOT NULL,
        id         TEXT    NOT NULL,
        product_id TEXT    NOT NULL,
        name       TEXT    NOT NULL,
        variation  TEXT,
        unit_price REAL    NOT NULL,
        quantity   INTEGER NOT NULL CHECK (quantity > 0),
        menu_date  TEXT    NOT NULL,
        added_at   TEXT    NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (user_id, id)
      );
    `);
    return db;
  })();
  return dbPromise;
}

export function cartItemId(productId: string, variation: string | null) {
  return variation ? `${productId}:${variation}` : productId;
}

/**
 * Carrinho salvo no SQLite do aparelho, separado por usuário
 * (se duas pessoas usarem o mesmo celular, cada uma vê o seu).
 */
export const cartStorage = {
  /** Itens do carrinho. Itens de cardápios de outros dias são descartados. */
  async getItems(userId: string, today: string): Promise<CartItem[]> {
    const db = await getDb();
    await db.runAsync('DELETE FROM cart_items WHERE user_id = ? AND menu_date <> ?', userId, today);
    const rows = await db.getAllAsync<CartRow>(
      'SELECT * FROM cart_items WHERE user_id = ? ORDER BY added_at',
      userId,
    );
    return rows.map((row) => ({
      id: row.id,
      productId: row.product_id,
      name: row.name,
      variation: row.variation,
      unitPrice: row.unit_price,
      quantity: row.quantity,
      menuDate: row.menu_date,
    }));
  },

  /** Adiciona o item; se já estiver no carrinho, soma a quantidade. */
  async add(userId: string, item: NewCartItem, quantity: number): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      `INSERT INTO cart_items (user_id, id, product_id, name, variation, unit_price, quantity, menu_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, id) DO UPDATE SET
         quantity   = quantity + excluded.quantity,
         unit_price = excluded.unit_price`,
      userId,
      cartItemId(item.productId, item.variation),
      item.productId,
      item.name,
      item.variation,
      item.unitPrice,
      quantity,
      item.menuDate,
    );
  },

  async setQuantity(userId: string, id: string, quantity: number): Promise<void> {
    const db = await getDb();
    if (quantity <= 0) {
      await db.runAsync('DELETE FROM cart_items WHERE user_id = ? AND id = ?', userId, id);
    } else {
      await db.runAsync('UPDATE cart_items SET quantity = ? WHERE user_id = ? AND id = ?', quantity, userId, id);
    }
  },

  async clear(userId: string): Promise<void> {
    const db = await getDb();
    await db.runAsync('DELETE FROM cart_items WHERE user_id = ?', userId);
  },
};
