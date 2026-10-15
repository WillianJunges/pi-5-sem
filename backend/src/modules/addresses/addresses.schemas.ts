import { z } from 'zod';

const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;

/** Texto opcional: string vazia vira null. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

export const addressSchema = z.object({
  label: optionalText(40),
  // aceita "13334-100" ou "13334100"; grava só os dígitos
  cep: z
    .string()
    .transform((v) => v.replace(/\D/g, ''))
    .pipe(z.string().length(8, 'CEP deve ter 8 dígitos')),
  street: z.string().trim().min(2, 'Informe a rua').max(160),
  number: z.string().trim().min(1, 'Informe o número (ou S/N)').max(20),
  complement: optionalText(80),
  district: z.string().trim().min(2, 'Informe o bairro').max(100),
  city: z.string().trim().min(2, 'Informe a cidade').max(100),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .pipe(z.enum(UFS, 'UF inválida')),
  /** Marcar como endereço principal. */
  isDefault: z.boolean().optional(),
});

export type AddressInput = z.infer<typeof addressSchema>;
