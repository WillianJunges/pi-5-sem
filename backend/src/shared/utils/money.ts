import { z } from 'zod';

/**
 * Dinheiro: a API e o banco usam reais (22.5 = R$ 22,50, DECIMAL(10,2) no MySQL).
 * As regras de negócio trabalham em CENTAVOS (2250), para não haver erro de
 * arredondamento em somas (0.1 + 0.2 !== 0.3 em JavaScript).
 */

/** 22.5 → 2250 */
export function toCents(reais: number): number {
  return Math.round(reais * 100);
}

/** 2250 → 22.5 */
export function fromCents(cents: number): number {
  return cents / 100;
}

/** Valor DECIMAL lido do MySQL ("22.50" ou 22.5) → 2250 */
export function decimalToCents(value: string | number): number {
  return toCents(Number(value));
}

/** 2250 → "22.50", para gravar em coluna DECIMAL sem passar por float. */
export function centsToDecimal(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Maior preço aceito: R$ 10.000,00 (limite de bom senso). */
export const MAX_PRICE_REAIS = 10_000;

/**
 * Campo de preço em reais (no máximo 2 casas decimais), já convertido para centavos.
 * Ex.: priceSchema('Preço') aceita 22 ou 22.5 e devolve 2200 / 2250.
 */
export function reaisSchema(label: string, { min = 0.01 }: { min?: number } = {}) {
  return z
    .number({ error: `${label} deve ser um número` })
    .min(min, `${label} deve ser no mínimo ${min.toFixed(2).replace('.', ',')}`)
    .max(MAX_PRICE_REAIS, `${label} deve ser no máximo ${MAX_PRICE_REAIS}`)
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, `${label} deve ter no máximo 2 casas decimais`)
    .transform(toCents);
}
