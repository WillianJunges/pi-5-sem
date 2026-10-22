import { z } from 'zod';

// Normalizar UUID evita que variações de maiúsculas sejam tratadas como outra operação.
const operationId = z.uuid('Identificador de conclusão inválido').transform(value => value.toLowerCase());

export const assignDeliverySchema = z.object({
  courierId: z.uuid('Motoboy inválido').transform(value => value.toLowerCase()),
}).strict();

export const completeDeliverySchema = z.object({
  operationId,
  completedAt: z.iso.datetime({ offset: true, message: 'Informe a data com fuso horário' }).transform(value => new Date(value)),
}).strict();

/** Sem filtro, lista as entregas atribuídas e em andamento; false abre o histórico. */
export const listDeliveriesSchema = z.object({
  active: z.enum(['true', 'false']).default('true').transform(value => value === 'true'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
