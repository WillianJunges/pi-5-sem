import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { db } from '../../config/database';
import { translateDatabaseError } from '../../shared/errors/databaseErrors';
import { centsToDecimal, decimalToCents } from '../../shared/utils/money';
import type { Product, ProductData, ProductVariant, VariantData } from './product.types';

export interface ProductsRepository {
  list(includeInactive: boolean): Promise<Product[]>;
  findById(id: string): Promise<Product | null>;
  /** Busca ignorando maiúsculas e acentos. */
  findByName(name: string): Promise<Product | null>;
  create(data: ProductData & { variants: VariantData[] }): Promise<Product>;
  update(id: string, data: ProductData): Promise<void>;
  setActive(id: string, active: boolean): Promise<void>;
  delete(id: string): Promise<void>;

  findVariantById(id: string): Promise<ProductVariant | null>;
  addVariant(productId: string, data: VariantData): Promise<ProductVariant>;
  updateVariant(id: string, data: VariantData): Promise<void>;
  setVariantActive(id: string, active: boolean): Promise<void>;
  deleteVariant(id: string): Promise<void>;

  /** Alguma variação deste produto já foi usada em pedido? */
  isProductUsedInOrders(productId: string): Promise<boolean>;
  isVariantUsedInOrders(variantId: string): Promise<boolean>;
  /** Alguma variação deste produto está em algum cardápio? */
  isProductInAnyMenu(productId: string): Promise<boolean>;
  isVariantInAnyMenu(variantId: string): Promise<boolean>;
}

interface ProductRow extends RowDataPacket {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  active: number;
}

interface VariantRow extends RowDataPacket {
  id: string;
  product_id: string;
  name: string;
  price: string;
  active: number;
}

function mapVariant(r: VariantRow): ProductVariant {
  return { id: r.id, productId: r.product_id, name: r.name, priceCents: decimalToCents(r.price), active: Boolean(r.active) };
}

/**
 * A tabela order_items é do módulo do Cliente (Willian). Enquanto ela não existir,
 * nenhum produto conta como "usado em pedido".
 */
const ORDER_ITEMS_TABLE = 'order_items';

export class MySqlProductsRepository implements ProductsRepository {
  private async withVariants(rows: ProductRow[], onlyActiveVariants = false): Promise<Product[]> {
    if (rows.length === 0) return [];
    const [variants] = await db.query<VariantRow[]>(
      `SELECT * FROM product_variants WHERE product_id IN (?) ${onlyActiveVariants ? 'AND active = TRUE' : ''}
        ORDER BY price, created_at`,
      [rows.map((r) => r.id)],
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      category: r.category,
      active: Boolean(r.active),
      variants: variants.filter((v) => v.product_id === r.id).map(mapVariant),
    }));
  }

  async list(includeInactive: boolean) {
    const [rows] = await db.query<ProductRow[]>(
      `SELECT * FROM products ${includeInactive ? '' : 'WHERE active = TRUE'} ORDER BY name`,
    );
    return this.withVariants(rows, !includeInactive);
  }

  async findById(id: string) {
    const [rows] = await db.query<ProductRow[]>('SELECT * FROM products WHERE id = ?', [id]);
    return (await this.withVariants(rows))[0] ?? null;
  }

  async findByName(name: string) {
    // a collation utf8mb4_unicode_ci já compara sem diferenciar maiúsculas e acentos
    const [rows] = await db.query<ProductRow[]>('SELECT * FROM products WHERE name = ?', [name]);
    return (await this.withVariants(rows))[0] ?? null;
  }

  /** Produto e variações gravados juntos: ou tudo, ou nada (transação). */
  async create(data: ProductData & { variants: VariantData[] }) {
    const id = randomUUID();
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('INSERT INTO products (id, name, description, category) VALUES (?, ?, ?, ?)', [
        id,
        data.name,
        data.description,
        data.category,
      ]);
      for (const v of data.variants) {
        await conn.query('INSERT INTO product_variants (id, product_id, name, price) VALUES (?, ?, ?, ?)', [
          randomUUID(),
          id,
          v.name,
          centsToDecimal(v.priceCents),
        ]);
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw translateDatabaseError(err);
    } finally {
      conn.release();
    }
    return (await this.findById(id))!;
  }

  async update(id: string, data: ProductData) {
    try {
      await db.query('UPDATE products SET name = ?, description = ?, category = ? WHERE id = ?', [
        data.name,
        data.description,
        data.category,
        id,
      ]);
    } catch (err) {
      throw translateDatabaseError(err);
    }
  }

  async setActive(id: string, active: boolean) {
    await db.query('UPDATE products SET active = ? WHERE id = ?', [active, id]);
  }

  async delete(id: string) {
    await db.query('DELETE FROM products WHERE id = ?', [id]); // variações saem em cascata
  }

  async findVariantById(id: string) {
    const [rows] = await db.query<VariantRow[]>('SELECT * FROM product_variants WHERE id = ?', [id]);
    return rows[0] ? mapVariant(rows[0]) : null;
  }

  async addVariant(productId: string, data: VariantData) {
    const id = randomUUID();
    try {
      await db.query('INSERT INTO product_variants (id, product_id, name, price) VALUES (?, ?, ?, ?)', [
        id,
        productId,
        data.name,
        centsToDecimal(data.priceCents),
      ]);
    } catch (err) {
      throw translateDatabaseError(err);
    }
    return (await this.findVariantById(id))!;
  }

  async updateVariant(id: string, data: VariantData) {
    try {
      await db.query('UPDATE product_variants SET name = ?, price = ? WHERE id = ?', [
        data.name,
        centsToDecimal(data.priceCents),
        id,
      ]);
    } catch (err) {
      throw translateDatabaseError(err);
    }
  }

  async setVariantActive(id: string, active: boolean) {
    await db.query('UPDATE product_variants SET active = ? WHERE id = ?', [active, id]);
  }

  async deleteVariant(id: string) {
    await db.query('DELETE FROM product_variants WHERE id = ?', [id]);
  }

  private async orderItemsExists(): Promise<boolean> {
    const [rows] = await db.query<RowDataPacket[]>(
      'SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
      [ORDER_ITEMS_TABLE],
    );
    return rows.length > 0;
  }

  async isProductUsedInOrders(productId: string) {
    if (!(await this.orderItemsExists())) return false;
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT 1 FROM ${ORDER_ITEMS_TABLE} oi JOIN product_variants v ON v.id = oi.variant_id
        WHERE v.product_id = ? LIMIT 1`,
      [productId],
    );
    return rows.length > 0;
  }

  async isVariantUsedInOrders(variantId: string) {
    if (!(await this.orderItemsExists())) return false;
    const [rows] = await db.query<RowDataPacket[]>(`SELECT 1 FROM ${ORDER_ITEMS_TABLE} WHERE variant_id = ? LIMIT 1`, [
      variantId,
    ]);
    return rows.length > 0;
  }

  async isProductInAnyMenu(productId: string) {
    const [rows] = await db.query<RowDataPacket[]>('SELECT 1 FROM vw_menu_items WHERE product_id = ? LIMIT 1', [
      productId,
    ]);
    return rows.length > 0;
  }

  async isVariantInAnyMenu(variantId: string) {
    const [rows] = await db.query<RowDataPacket[]>('SELECT 1 FROM menu_items WHERE variant_id = ? LIMIT 1', [variantId]);
    return rows.length > 0;
  }
}

export const productsRepository: ProductsRepository = new MySqlProductsRepository();
