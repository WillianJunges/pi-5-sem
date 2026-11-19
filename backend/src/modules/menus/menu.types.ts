export const MENU_STATUSES = ['DRAFT', 'ACTIVE', 'CLOSED'] as const;
export type MenuStatus = (typeof MENU_STATUSES)[number];

export interface MenuItem {
  id: string;
  menuId: string;
  variantId: string;
  specialPriceCents: number | null;
}

export interface Menu {
  id: string;
  name: string;
  /** AAAA-MM-DD */
  menuDate: string;
  /** Modelo semanal, de domingo (0) a sábado (6); null para cardápio por data. */
  weekday?: number | null;
  status: MenuStatus;
  activatedAt: Date | null;
  closedAt: Date | null;
  items: MenuItem[];
}

/** Linha da view vw_menu_items: item com nomes e preços já resolvidos. */
export interface MenuItemDetail {
  itemId: string;
  productId: string;
  productName: string;
  productDescription: string | null;
  category: string | null;
  variantId: string;
  variantName: string;
  standardPriceCents: number;
  specialPriceCents: number | null;
  /** Preço que vale no pedido: o especial, se houver; senão, o padrão. */
  effectivePriceCents: number;
  /** false se o produto ou a variação foi desativado depois de entrar no cardápio. */
  available: boolean;
  availability?: 'AVAILABLE' | 'LOW' | 'SOLD_OUT';
}

export interface MenuDetail extends Omit<Menu, 'items'> {
  items: MenuItemDetail[];
}

/**
 * Cardápio do dia como o app do cliente recebe (GET /menus/today) e como fica
 * gravado no MongoDB (coleção "menus", desnormalizada). Valores em reais.
 */
export interface PublicMenu {
  menuId: string;
  date: string;
  status: MenuStatus;
  items: PublicMenuProduct[];
}

export interface PublicMenuProduct {
  productId: string;
  name: string;
  description: string | null;
  category: string | null;
  /** Menor preço entre as variações ("a partir de"). */
  price: number;
  variations: PublicMenuVariation[];
}

export interface PublicMenuVariation {
  variantId: string;
  name: string;
  /** Preço que vale (já com o preço especial, se houver). */
  price: number;
  /** Preço padrão, para o app mostrar "de R$ 22,00 por R$ 19,90". */
  standardPrice: number;
  availability?: 'AVAILABLE' | 'LOW' | 'SOLD_OUT';
}
