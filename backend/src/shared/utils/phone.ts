import { z } from 'zod';

/**
 * Telefone brasileiro com DDD: aceita com ou sem máscara ("19999998888", "(19) 99999-8888")
 * e guarda sempre no mesmo formato, "(19) 99999-8888" (celular) ou "(19) 3333-4444" (fixo),
 * para aparecer igual em todas as telas (ex.: a proprietária vendo o pedido).
 */
export function formatPhone(digits: string): string {
  const ddd = digits.slice(0, 2);
  const rest = digits.slice(2);
  const split = rest.length === 9 ? 5 : 4;
  return `(${ddd}) ${rest.slice(0, split)}-${rest.slice(split)}`;
}

export const phoneSchema = z
  .string('Informe o telefone')
  .transform((value) => value.replace(/\D/g, ''))
  .refine((digits) => digits.length > 0, 'Informe o telefone')
  .refine((digits) => digits.length === 10 || digits.length === 11, 'Telefone inválido: informe o DDD e o número')
  .transform(formatPhone);
