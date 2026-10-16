import { z } from 'zod';
import { fromCents, reaisSchema } from '../../shared/utils/money';
import type { Product, ProductVariant } from './product.types';

/** Texto opcional: vazio vira null. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const variantSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome da variação').max(80),
  price: reaisSchema('Preço'),
});

export const productSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome do produto').max(120),
  description: optionalText(500),
  category: optionalText(60).transform((v) => v?.toLowerCase() ?? null),
});

export const createProductSchema = productSchema.extend({
  variants: z.array(variantSchema).min(1, 'Informe ao menos uma variação (ex.: Média, R$ 22,00)').max(20),
});

export const activeSchema = z.object({ active: z.boolean({ error: 'active deve ser true ou false' }) });

export function presentVariant(v: ProductVariant) {
  return { id: v.id, name: v.name, price: fromCents(v.priceCents), active: v.active };
}

export function presentProduct(p: Product) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    category: p.category,
    active: p.active,
    variants: p.variants.map(presentVariant),
  };
}
