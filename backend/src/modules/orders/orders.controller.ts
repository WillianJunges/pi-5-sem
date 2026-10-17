import type { Request, Response } from 'express';
import { fromCents } from '../../shared/utils/money';
import { idParam } from '../../shared/utils/params';
import type { Order, OrderQuote, OrderSummary } from './order.types';
import { createOrderSchema, listOrdersSchema, quoteOrderSchema } from './orders.schemas';
import { ordersService } from './orders.service';

/** Pedido como o app recebe: valores em reais, sem o id do cliente. */
export function toOrderResponse(order: Order) {
  const { customerId: _, changeForCents, subtotalCents, deliveryFeeCents, totalCents, items, ...rest } = order;
  return {
    ...rest,
    changeFor: changeForCents === null ? null : fromCents(changeForCents),
    subtotal: fromCents(subtotalCents),
    deliveryFee: fromCents(deliveryFeeCents),
    total: fromCents(totalCents),
    items: items.map(({ unitPriceCents, subtotalCents: itemSubtotal, ...item }) => ({
      ...item,
      unitPrice: fromCents(unitPriceCents),
      subtotal: fromCents(itemSubtotal),
    })),
  };
}

/** Prévia como o app recebe: valores em reais. */
export function toQuoteResponse(quote: OrderQuote) {
  return {
    items: quote.items.map(({ unitPriceCents, subtotalCents, ...item }) => ({
      ...item,
      unitPrice: fromCents(unitPriceCents),
      subtotal: fromCents(subtotalCents),
    })),
    unavailableVariantIds: quote.unavailableVariantIds,
    distanceMeters: quote.distanceMeters,
    subtotal: fromCents(quote.subtotalCents),
    deliveryFee: fromCents(quote.deliveryFeeCents),
    total: fromCents(quote.totalCents),
  };
}

/** Linha do histórico como o app recebe: total em reais. */
export function toSummaryResponse({ totalCents, ...summary }: OrderSummary) {
  return { ...summary, total: fromCents(totalCents) };
}

export const ordersController = {
  /** GET /orders?limit=20&offset=0 — histórico do cliente logado, mais novos primeiro. */
  async list(req: Request, res: Response) {
    const { orders, hasMore } = await ordersService.list(req.user!.id, listOrdersSchema.parse(req.query));
    res.json({ orders: orders.map(toSummaryResponse), hasMore });
  },

  /** POST /orders/quote — prévia dos valores no checkout (não grava nada). */
  async quote(req: Request, res: Response) {
    const input = quoteOrderSchema.parse(req.body);
    res.json(toQuoteResponse(await ordersService.quote(req.user!.id, input)));
  },

  /** POST /orders — finaliza o carrinho. */
  async create(req: Request, res: Response) {
    const input = createOrderSchema.parse(req.body);
    res.status(201).json(toOrderResponse(await ordersService.create(req.user!.id, input)));
  },

  /** GET /orders/:id — pedido do cliente logado. */
  async get(req: Request, res: Response) {
    res.json(toOrderResponse(await ordersService.get(req.user!.id, idParam(req))));
  },
};
