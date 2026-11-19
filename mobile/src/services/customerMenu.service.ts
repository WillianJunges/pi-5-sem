import { api, ApiError } from './api';

export type MenuStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED';

/** Formato de GET /menus/today (docs/modulo-proprietaria.md). Valores em reais. */
export interface MenuVariation {
  variantId: string;
  name: string;
  /** Preço que vale hoje (já com o preço especial, se houver). */
  price: number;
  /** Preço padrão: se for maior que `price`, a variação está em promoção. */
  standardPrice: number;
  availability?: 'AVAILABLE' | 'LOW' | 'SOLD_OUT';
}

export interface MenuItem {
  productId: string;
  name: string;
  description: string | null;
  category: string | null;
  /** Menor preço entre as variações ("a partir de"). */
  price: number;
  variations: MenuVariation[];
}

export interface Menu {
  menuId: string;
  /** Data do cardápio no formato AAAA-MM-DD. */
  date: string;
  status: MenuStatus;
  items: MenuItem[];
}

export function isOnSale(variation: MenuVariation): boolean {
  return variation.price < variation.standardPrice;
}

export const customerMenuService = {
  /** Cardápio do dia (GET /menus/today, rota pública). Devolve null se não houver cardápio hoje. */
  async getToday(): Promise<Menu | null> {
    try {
      return await api<Menu>('/menus/today', { auth: false });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  },
};
