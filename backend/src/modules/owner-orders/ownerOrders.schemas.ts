import { z } from 'zod';
import { ORDER_STATUSES } from '../orders/order.types';

/** GET /owner/orders?active=true&status=PENDING&limit=20&offset=0 */
export const ownerOrdersQuerySchema = z.object({
  active: z
    .enum(['true', 'false'], 'active deve ser true ou false')
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  status: z.enum(ORDER_STATUSES, 'Status inválido').optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
