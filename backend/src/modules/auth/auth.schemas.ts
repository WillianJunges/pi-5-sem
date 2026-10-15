import { z } from 'zod';

// trim antes de validar: o teclado do celular costuma deixar espaço no fim do e-mail
const email = z.string().trim().toLowerCase().pipe(z.email('E-mail inválido'));

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome').max(120),
  email,
  phone: z.string().trim().max(20).optional(),
  password: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres').max(72),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Informe a senha'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
