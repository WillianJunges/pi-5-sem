/** Variação de um produto (ex.: Média), com preço padrão em centavos. */
export interface ProductVariant {
  id: string;
  productId: string;
  name: string;
  priceCents: number;
  active: boolean;
}

/** Produto do catálogo (ex.: Marmita de Frango). */
export interface Product {
  id: string;
  name: string;
  description: string | null;
  /** Agrupa o cardápio no app. Ex.: marmitas, assados, bebidas. */
  category: string | null;
  active: boolean;
  variants: ProductVariant[];
}

export interface ProductData {
  name: string;
  description: string | null;
  category: string | null;
}

export interface VariantData {
  name: string;
  priceCents: number;
}
