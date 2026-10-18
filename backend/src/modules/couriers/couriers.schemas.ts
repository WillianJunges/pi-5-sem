import { z } from 'zod';
import type { UserSummary } from '../users/user.types';

const name = z.string().trim().min(2, 'Informe o nome').max(120);
// trim antes de validar: o teclado do celular costuma deixar espaço no fim do e-mail
const email = z.string().trim().toLowerCase().pipe(z.email('E-mail inválido'));
const phone = z
  .string()
  .trim()
  .max(20)
  .nullish()
  .transform((v) => v || null);

/** POST /owner/couriers — a proprietária cria a conta do motoboy (escopo, seção 3). */
export const createCourierSchema = z.object({
  name,
  email,
  phone,
  password: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres').max(72),
});

/** PUT /owner/couriers/:id — dados do motoboy (a senha não muda por aqui). */
export const updateCourierSchema = z.object({ name, email, phone });

export const courierActiveSchema = z.object({ active: z.boolean({ error: 'active deve ser true ou false' }) });

export type CreateCourierInput = z.infer<typeof createCourierSchema>;
export type UpdateCourierInput = z.infer<typeof updateCourierSchema>;

/** Motoboy como o app recebe (sem senha). */
export function presentCourier(c: UserSummary) {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    active: c.active,
    activeSessions: c.activeSessions,
    createdAt: c.createdAt,
  };
}
