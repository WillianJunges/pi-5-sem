import { z } from 'zod';
import { phoneSchema } from '../../shared/utils/phone';

// trim antes de validar: o teclado do celular costuma deixar espaço no fim do e-mail
const email = z.string().trim().toLowerCase().pipe(z.email('E-mail inválido'));
const password = z.string().min(6, 'A senha deve ter pelo menos 6 caracteres').max(72);

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome').max(120),
  email,
  /** Obrigatório: a marmitaria e o motoboy precisam conseguir falar com o cliente. */
  phone: phoneSchema,
  password,
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Informe a senha'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

/** POST /auth/forgot-password */
export const forgotPasswordSchema = z.object({ email });

/** POST /auth/reset-password */
export const resetPasswordSchema = z.object({
  email,
  code: z.string().trim().regex(/^\d{6}$/, 'O código tem 6 números'),
  password,
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
