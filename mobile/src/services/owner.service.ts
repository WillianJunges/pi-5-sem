import { api } from './api';

/**
 * Chamadas da área da Proprietária (rotas /owner, perfil OWNER).
 * Formatos em docs/modulo-proprietaria.md. Valores em reais e distâncias em km.
 */

// ---------- Produtos e variações (item 2) ----------

export interface Variant {
  id: string;
  name: string;
  price: number;
  active: boolean;
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  active: boolean;
  variants: Variant[];
}

export interface ProductInput {
  name: string;
  description: string | null;
  category: string | null;
}

export interface VariantInput {
  name: string;
  price: number;
}

// ---------- Cardápios (item 3) ----------

export type MenuStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED';

export const MENU_STATUS_LABEL: Record<MenuStatus, string> = {
  DRAFT: 'Rascunho',
  ACTIVE: 'Ativo',
  CLOSED: 'Encerrado',
};

/** Cores do selo de estado (mesmo estilo dos selos de status do pedido no app do Cliente). */
export const MENU_STATUS_COLORS: Record<MenuStatus, { bg: string; fg: string }> = {
  DRAFT: { bg: '#FFF7ED', fg: '#C2410C' },
  ACTIVE: { bg: '#F0FDF4', fg: '#15803D' },
  CLOSED: { bg: '#F3F4F6', fg: '#6B7280' },
};

export interface MenuSummary {
  id: string;
  name: string;
  /** AAAA-MM-DD */
  menuDate: string;
  status: MenuStatus;
  activatedAt: string | null;
  closedAt: string | null;
  itemCount: number;
}

export interface MenuItemDetail {
  itemId: string;
  productId: string;
  productName: string;
  category: string | null;
  variantId: string;
  variantName: string;
  standardPrice: number;
  specialPrice: number | null;
  /** Preço que vale (o especial, se houver). */
  price: number;
  /** false se o produto ou a variação foi desativado depois de entrar no cardápio. */
  available: boolean;
}

export interface MenuDetail extends MenuSummary {
  items: MenuItemDetail[];
}

export interface MenuInput {
  name: string;
  menuDate: string;
}

// ---------- Faixas de taxa de entrega (item 7) ----------

export interface FeeRange {
  id: string;
  minKm: number;
  maxKm: number;
  fee: number;
}

export interface FeeRangeInput {
  minKm: number;
  maxKm: number;
  fee: number;
}

export type FeeQuote =
  | { covered: true; distanceKm: number; fee: number; rangeId: string }
  | { covered: false; distanceKm: number };

// ---------- Auxiliares ----------

/** "22,50" / "22.5" / " 22 " → 22.5; texto vazio ou inválido → NaN */
export function parseDecimal(text: string): number {
  const clean = text.replace(/\s/g, '').replace(',', '.');
  return clean === '' ? Number.NaN : Number(clean);
}

/** 22.5 → "22,50" (para preencher campos de preço) */
export function moneyToText(value: number): string {
  return value.toFixed(2).replace('.', ',');
}

/** 5.5 → "5,5" (para preencher campos de km) */
export function kmToText(value: number): string {
  return String(value).replace('.', ',');
}

/** 5.5 → "5,5 km" */
export function formatKm(value: number): string {
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} km`;
}

// ---------- API ----------

export const ownerService = {
  products: {
    list: () => api<Product[]>('/owner/products'),
    get: (id: string) => api<Product>(`/owner/products/${id}`),
    create: (data: ProductInput & { variants: VariantInput[] }) =>
      api<Product>('/owner/products', { method: 'POST', body: data }),
    update: (id: string, data: ProductInput) => api<Product>(`/owner/products/${id}`, { method: 'PUT', body: data }),
    setActive: (id: string, active: boolean) =>
      api<Product>(`/owner/products/${id}/active`, { method: 'PATCH', body: { active } }),
    remove: (id: string) => api<void>(`/owner/products/${id}`, { method: 'DELETE' }),
    addVariant: (productId: string, data: VariantInput) =>
      api<Variant>(`/owner/products/${productId}/variants`, { method: 'POST', body: data }),
    updateVariant: (id: string, data: VariantInput) =>
      api<Variant>(`/owner/variants/${id}`, { method: 'PUT', body: data }),
    setVariantActive: (id: string, active: boolean) =>
      api<Variant>(`/owner/variants/${id}/active`, { method: 'PATCH', body: { active } }),
    removeVariant: (id: string) => api<void>(`/owner/variants/${id}`, { method: 'DELETE' }),
  },

  menus: {
    list: (status?: MenuStatus) => api<MenuSummary[]>(`/owner/menus${status ? `?status=${status}` : ''}`),
    get: (id: string) => api<MenuDetail>(`/owner/menus/${id}`),
    create: (data: MenuInput) => api<MenuSummary>('/owner/menus', { method: 'POST', body: data }),
    update: (id: string, data: MenuInput) => api<MenuSummary>(`/owner/menus/${id}`, { method: 'PUT', body: data }),
    remove: (id: string) => api<void>(`/owner/menus/${id}`, { method: 'DELETE' }),
    activate: (id: string) => api<MenuSummary>(`/owner/menus/${id}/activate`, { method: 'POST' }),
    close: (id: string) => api<MenuSummary>(`/owner/menus/${id}/close`, { method: 'POST' }),
    addItem: (id: string, variantId: string, specialPrice: number | null) =>
      api<unknown>(`/owner/menus/${id}/items`, { method: 'POST', body: { variantId, specialPrice } }),
    setSpecialPrice: (id: string, itemId: string, specialPrice: number | null) =>
      api<unknown>(`/owner/menus/${id}/items/${itemId}`, { method: 'PATCH', body: { specialPrice } }),
    removeItem: (id: string, itemId: string) => api<void>(`/owner/menus/${id}/items/${itemId}`, { method: 'DELETE' }),
  },

  fees: {
    list: () => api<FeeRange[]>('/owner/delivery-fees'),
    create: (data: FeeRangeInput) => api<FeeRange>('/owner/delivery-fees', { method: 'POST', body: data }),
    update: (id: string, data: FeeRangeInput) =>
      api<FeeRange>(`/owner/delivery-fees/${id}`, { method: 'PUT', body: data }),
    remove: (id: string) => api<void>(`/owner/delivery-fees/${id}`, { method: 'DELETE' }),
    quote: (distanceKm: number) => api<FeeQuote>(`/owner/delivery-fees/quote?distanceKm=${distanceKm}`),
  },
};
