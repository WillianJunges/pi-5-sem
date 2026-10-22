import { z } from 'zod';
const installation = {
  installationId: z.uuid().transform((v) => v.toLowerCase()),
  installationKey: z.string().regex(/^[a-f0-9]{64}$/),
  bindingVersion: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
};
export const registerDeviceSchema = z
  .object({
    ...installation,
    token: z.string().regex(/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$/),
    platform: z.enum(['android', 'ios']),
  })
  .strict();
export const revokeDeviceSchema = z.object(installation).strict();
export type RegisterDevice = z.infer<typeof registerDeviceSchema>;
export type RevokeDevice = z.infer<typeof revokeDeviceSchema>;
