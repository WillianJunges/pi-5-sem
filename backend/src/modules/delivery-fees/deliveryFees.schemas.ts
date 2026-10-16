import { z } from 'zod';
import { fromCents, reaisSchema } from '../../shared/utils/money';
import type { DeliveryFeeRange, FeeQuote } from './deliveryFee.types';

/** A API usa km e reais; internamente, metros e centavos. */
const kmSchema = (label: string) =>
  z
    .number({ error: `${label} deve ser um número` })
    .min(0, `${label} não pode ser negativa`)
    .max(1000, `${label} deve ser no máximo 1000 km`)
    .transform((v) => Math.round(v * 1000));

export const feeRangeSchema = z.object({
  minKm: kmSchema('Distância inicial'),
  maxKm: kmSchema('Distância final'),
  fee: reaisSchema('Taxa', { min: 0 }),
});

export const quoteQuerySchema = z.object({
  distanceKm: z.coerce.number({ error: 'Informe distanceKm' }).pipe(kmSchema('Distância')),
});

export function presentRange(r: DeliveryFeeRange) {
  return { id: r.id, minKm: r.minMeters / 1000, maxKm: r.maxMeters / 1000, fee: fromCents(r.feeCents) };
}

export function presentQuote(q: FeeQuote) {
  return q.covered
    ? { covered: true, distanceKm: q.distanceMeters / 1000, fee: fromCents(q.feeCents), rangeId: q.rangeId }
    : { covered: false, distanceKm: q.distanceMeters / 1000 };
}
