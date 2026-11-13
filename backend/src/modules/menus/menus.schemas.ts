import { z } from 'zod';
import { fromCents, reaisSchema } from '../../shared/utils/money';
import { MENU_STATUSES, type Menu, type MenuDetail, type MenuItem } from './menu.types';

const isoDate = z.iso.date('Data deve estar no formato AAAA-MM-DD');

export const menuSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome do cardápio').max(120),
  menuDate: isoDate,
  weekday: z.number().int().min(0).max(6).nullable().optional(),
});

export const listQuerySchema = z.object({ status: z.enum(MENU_STATUSES).optional() });

export const addItemSchema = z.object({
  variantId: z.uuid('Variação inválida'),
  specialPrice: reaisSchema('Preço especial').nullish().transform((v) => v ?? null),
});

export const specialPriceSchema = z.object({
  specialPrice: reaisSchema('Preço especial').nullable(),
});

const money = (cents: number | null) => (cents === null ? null : fromCents(cents));

export function presentMenu(m: Menu) {
  return {
    id: m.id,
    name: m.name,
    menuDate: m.menuDate,
    weekday: m.weekday ?? null,
    status: m.status,
    activatedAt: m.activatedAt,
    closedAt: m.closedAt,
    itemCount: m.items.length,
  };
}

export function presentMenuDetail(m: MenuDetail) {
  return {
    ...presentMenu({ ...m, items: [] }),
    itemCount: m.items.length,
    items: m.items.map((i) => ({
      itemId: i.itemId,
      productId: i.productId,
      productName: i.productName,
      category: i.category,
      variantId: i.variantId,
      variantName: i.variantName,
      standardPrice: fromCents(i.standardPriceCents),
      specialPrice: money(i.specialPriceCents),
      price: fromCents(i.effectivePriceCents),
      available: i.available,
    })),
  };
}

export function presentItem(i: MenuItem) {
  return { itemId: i.id, menuId: i.menuId, variantId: i.variantId, specialPrice: money(i.specialPriceCents) };
}
