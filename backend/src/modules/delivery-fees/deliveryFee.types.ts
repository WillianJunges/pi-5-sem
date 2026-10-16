/** Faixa de distância e taxa. Internamente: metros e centavos. */
export interface DeliveryFeeRange {
  id: string;
  minMeters: number;
  maxMeters: number;
  feeCents: number;
  active: boolean;
}

export type FeeRangeData = Pick<DeliveryFeeRange, 'minMeters' | 'maxMeters' | 'feeCents'>;

/** Resultado da escolha da taxa para uma distância. */
export type FeeQuote =
  | { covered: true; rangeId: string; distanceMeters: number; feeCents: number }
  | { covered: false; distanceMeters: number };
