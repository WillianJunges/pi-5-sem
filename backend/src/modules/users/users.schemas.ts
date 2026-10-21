import { z } from 'zod';
import { phoneSchema } from '../../shared/utils/phone';

/** PUT /users/me — o e-mail não muda por aqui (é o login). */
export const updateProfileSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome').max(120),
  phone: phoneSchema,
});

/** PUT /users/me/password */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Informe a senha atual'),
  newPassword: z.string().min(6, 'A senha nova deve ter pelo menos 6 caracteres').max(72),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
