import * as SQLite from 'expo-sqlite';

/** Item do carrinho como fica salvo no aparelho. Cada variação é um item separado. */
export interface CartItem {
  /** = variantId (uma linha por variação). */
  id: string;
  productId: string;
  /** Id da variação no catálogo. É o que o pedido envia ao backend. */
  variantId: string;
  /** Nome do produto, ex.: "Marmita de Frango". */
  name: string;
  /** Nome da variação, ex.: "Média". */
  variation: string;
  /** Preço no momento em que foi adicionado. O backend recalcula no checkout. */
  unitPrice: number;
  quantity: number;
  /** Data do cardápio (AAAA-MM-DD) de onde o item veio. */
  menuDate: string;
}

export type NewCartItem = Omit<CartItem, 'id' | 'quantity'>;

interface CartRow {
  variant_id: string;
  product_id: string;
  name: string;
  variation: string;
  unit_price: number;
  quantity: number;
  menu_date: string;
}

/** Versão do formato da tabela. Ao mudar a tabela, suba o número e trate em migrate(). */
const SCHEMA_VERSION = 2;

async function migrate(db: SQLite.SQLiteDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;
  if (version >= SCHEMA_VERSION) return;

  // v1 (ponto 3) guardava o nome da variação, sem variant_id. O carrinho só vale para o
  // cardápio do dia, então dá para recriar a tabela em vez de converter os dados.
  await db.execAsync(`
    DROP TABLE IF EXISTS cart_items;
    CREATE TABLE cart_items (
      user_id    TEXT    NOT NULL,
      variant_id TEXT    NOT NULL,
      product_id TEXT    NOT NULL,
      name       TEXT    NOT NULL,
      variation  TEXT    NOT NULL,
      unit_price REAL    NOT NULL,
      quantity   INTEGER NOT NULL CHECK (quantity > 0),
      menu_date  TEXT    NOT NULL,
      added_at   TEXT    NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, variant_id)
    );
    PRAGMA user_version = ${SCHEMA_VERSION};
  `);
}

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDb() {
  dbPromise ??= (async () => {
    const db = await SQLite.openDatabaseAsync('cart.db');
    await migrate(db);
    return db;
  })();
  return dbPromise;
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
      id: row.variant_id,
      productId: row.product_id,
      variantId: row.variant_id,
      name: row.name,
      variation: row.variation,
      unitPrice: row.unit_price,
      quantity: row.quantity,
      menuDate: row.menu_date,
    }));
  },

  /** Adiciona o item; se a variação já estiver no carrinho, soma a quantidade. */
  async add(userId: string, item: NewCartItem, quantity: number): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      `INSERT INTO cart_items (user_id, variant_id, product_id, name, variation, unit_price, quantity, menu_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, variant_id) DO UPDATE SET
         quantity   = quantity + excluded.quantity,
         unit_price = excluded.unit_price`,
      userId,
      item.variantId,
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
      await db.runAsync('DELETE FROM cart_items WHERE user_id = ? AND variant_id = ?', userId, id);
    } else {
      await db.runAsync(
        'UPDATE cart_items SET quantity = ? WHERE user_id = ? AND variant_id = ?',
        quantity,
        userId,
        id,
      );
    }
  },

  async clear(userId: string): Promise<void> {
    const db = await getDb();
    await db.runAsync('DELETE FROM cart_items WHERE user_id = ?', userId);
  },
};
