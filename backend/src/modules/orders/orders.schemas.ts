import { z } from 'zod';
import { reaisSchema } from '../../shared/utils/money';
import { PAYMENT_METHODS } from './order.types';

/** Maior quantidade de um mesmo item num pedido (limite de bom senso). */
export const MAX_ITEM_QUANTITY = 50;

/**
 * Corpo de POST /orders. O app manda só O QUE o cliente quer (variação + quantidade);
 * preços, taxa e total são calculados no backend (escopo, seção 10).
 */
export const createOrderSchema = z.object({
  addressId: z.uuid('Endereço inválido'),
  paymentMethod: z.enum(PAYMENT_METHODS, 'Forma de pagamento inválida'),
  /** Troco para quanto (só dinheiro). Em reais; vira centavos. */
  changeFor: reaisSchema('Troco').nullish().transform((v) => v ?? null),
  notes: z
    .string()
    .trim()
    .max(300, 'Observação deve ter no máximo 300 caracteres')
    .nullish()
    .transform((v) => v || null),
  items: z
    .array(
      z.object({
        variantId: z.uuid('Item inválido'),
        quantity: z
          .number()
          .int('Quantidade inválida')
          .min(1, 'Quantidade inválida')
          .max(MAX_ITEM_QUANTITY, `No máximo ${MAX_ITEM_QUANTITY} unidades por item`),
      }),
    )
    .min(1, 'O carrinho está vazio')
    .max(30, 'Itens demais no pedido'),
  /**
   * Total que o cliente viu na prévia (opcional). Não é usado no cálculo: serve só para
   * recusar o pedido se o valor mudou entre a prévia e a confirmação.
   */
  expectedTotal: reaisSchema('Total').optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

/** Corpo de POST /orders/quote: prévia dos valores, sem gravar nada. */
export const quoteOrderSchema = createOrderSchema.pick({ addressId: true, items: true });

export type QuoteOrderInput = z.infer<typeof quoteOrderSchema>;

/** Query de GET /orders: página do histórico (mais novos primeiro). */
export const listOrdersSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListOrdersInput = z.infer<typeof listOrdersSchema>;
