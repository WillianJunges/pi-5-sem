import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { db } from '../../config/database';
import { translateDatabaseError } from '../../shared/errors/databaseErrors';
import { centsToDecimal, decimalToCents } from '../../shared/utils/money';
import type { Menu, MenuItem, MenuItemDetail, MenuStatus } from './menu.types';

export interface MenusRepository {
  list(status?: MenuStatus): Promise<Menu[]>;
  findById(id: string): Promise<Menu | null>;
  findActive(): Promise<Menu | null>;
  /** Itens com nomes e preços (view vw_menu_items). */
  itemDetails(menuId: string): Promise<MenuItemDetail[]>;
  create(data: { name: string; menuDate: string }): Promise<Menu>;
  update(id: string, data: { name: string; menuDate: string }): Promise<void>;
  /** DRAFT → ACTIVE com as consistências e o bloqueio da procedure sp_activate_menu. */
  activate(id: string): Promise<void>;
  close(id: string): Promise<void>;
  delete(id: string): Promise<void>;

  addItem(menuId: string, variantId: string, specialPriceCents: number | null): Promise<MenuItem>;
  updateItemSpecialPrice(itemId: string, specialPriceCents: number | null): Promise<void>;
  removeItem(itemId: string): Promise<void>;
}

interface MenuRow extends RowDataPacket {
  id: string;
  name: string;
  menu_date: Date | string;
  status: MenuStatus;
  activated_at: Date | null;
  closed_at: Date | null;
}

interface ItemRow extends RowDataPacket {
  id: string;
  menu_id: string;
  variant_id: string;
  special_price: string | null;
}

interface DetailRow extends RowDataPacket {
  item_id: string;
  product_id: string;
  product_name: string;
  product_description: string | null;
  product_category: string | null;
  variant_id: string;
  variant_name: string;
  standard_price: string;
  special_price: string | null;
  effective_price: string;
  available: number;
}

/** DATE do MySQL → "AAAA-MM-DD" (a conexão usa UTC, então não há troca de dia). */
function toIsoDate(value: Date | string): string {
  return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

function mapItem(r: ItemRow): MenuItem {
  return {
    id: r.id,
    menuId: r.menu_id,
    variantId: r.variant_id,
    specialPriceCents: r.special_price === null ? null : decimalToCents(r.special_price),
  };
}

export class MySqlMenusRepository implements MenusRepository {
  private async withItems(rows: MenuRow[]): Promise<Menu[]> {
    if (rows.length === 0) return [];
    const [items] = await db.query<ItemRow[]>('SELECT * FROM menu_items WHERE menu_id IN (?) ORDER BY created_at, id', [
      rows.map((r) => r.id),
    ]);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      menuDate: toIsoDate(r.menu_date),
      status: r.status,
      activatedAt: r.activated_at,
      closedAt: r.closed_at,
      items: items.filter((i) => i.menu_id === r.id).map(mapItem),
    }));
  }

  async list(status?: MenuStatus) {
    const [rows] = status
      ? await db.query<MenuRow[]>('SELECT * FROM menus WHERE status = ? ORDER BY menu_date DESC, created_at DESC', [status])
      : await db.query<MenuRow[]>('SELECT * FROM menus ORDER BY menu_date DESC, created_at DESC');
    return this.withItems(rows);
  }

  async findById(id: string) {
    const [rows] = await db.query<MenuRow[]>('SELECT * FROM menus WHERE id = ?', [id]);
    return (await this.withItems(rows))[0] ?? null;
  }

  async findActive() {
    const [rows] = await db.query<MenuRow[]>("SELECT * FROM menus WHERE status = 'ACTIVE' LIMIT 1");
    return (await this.withItems(rows))[0] ?? null;
  }

  async itemDetails(menuId: string): Promise<MenuItemDetail[]> {
    const [rows] = await db.query<DetailRow[]>(
      'SELECT * FROM vw_menu_items WHERE menu_id = ? ORDER BY product_category, product_name, standard_price',
      [menuId],
    );
    return rows.map((r) => ({
      itemId: r.item_id,
      productId: r.product_id,
      productName: r.product_name,
      productDescription: r.product_description,
      category: r.product_category,
      variantId: r.variant_id,
      variantName: r.variant_name,
      standardPriceCents: decimalToCents(r.standard_price),
      specialPriceCents: r.special_price === null ? null : decimalToCents(r.special_price),
      effectivePriceCents: decimalToCents(r.effective_price),
      available: Boolean(r.available),
    }));
  }

  async create(data: { name: string; menuDate: string }) {
    const id = randomUUID();
    await db.query('INSERT INTO menus (id, name, menu_date) VALUES (?, ?, ?)', [id, data.name, data.menuDate]);
    return (await this.findById(id))!;
  }

  async update(id: string, data: { name: string; menuDate: string }) {
    await db.query('UPDATE menus SET name = ?, menu_date = ? WHERE id = ?', [data.name, data.menuDate, id]);
  }

  async activate(id: string) {
    try {
      await db.query('CALL sp_activate_menu(?)', [id]);
    } catch (err) {
      throw translateDatabaseError(err);
    }
  }

  async close(id: string) {
    await db.query("UPDATE menus SET status = 'CLOSED', closed_at = UTC_TIMESTAMP() WHERE id = ? AND status = 'ACTIVE'", [id]);
  }

  async delete(id: string) {
    await db.query('DELETE FROM menus WHERE id = ?', [id]); // itens saem em cascata
  }

  /** O trigger trg_menu_items_* barra alterações em cardápio encerrado. */
  async addItem(menuId: string, variantId: string, specialPriceCents: number | null) {
    const id = randomUUID();
    try {
      await db.query('INSERT INTO menu_items (id, menu_id, variant_id, special_price) VALUES (?, ?, ?, ?)', [
        id,
        menuId,
        variantId,
        specialPriceCents === null ? null : centsToDecimal(specialPriceCents),
      ]);
    } catch (err) {
      throw translateDatabaseError(err);
    }
    return { id, menuId, variantId, specialPriceCents };
  }

  async updateItemSpecialPrice(itemId: string, specialPriceCents: number | null) {
    try {
      await db.query('UPDATE menu_items SET special_price = ? WHERE id = ?', [
        specialPriceCents === null ? null : centsToDecimal(specialPriceCents),
        itemId,
      ]);
    } catch (err) {
      throw translateDatabaseError(err);
    }
  }

  async removeItem(itemId: string) {
    try {
      await db.query('DELETE FROM menu_items WHERE id = ?', [itemId]);
    } catch (err) {
      throw translateDatabaseError(err);
    }
  }
}

export const menusRepository: MenusRepository = new MySqlMenusRepository();
