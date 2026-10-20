import type { Fulfillment, Order, OrderStatus, OrderSummary } from '../orders/order.types';

/** Quem fez o pedido (a proprietária precisa saber para quem entregar e com quem falar). */
export interface OrderCustomer {
  name: string;
  phone: string | null;
}

/** Linha da lista de pedidos da proprietária. */
export interface OwnerOrderSummary extends OrderSummary {
  customer: OrderCustomer;
}

/** Pedido completo para a proprietária. */
export interface OwnerOrder extends Order {
  customer: OrderCustomer;
}

/** Ações da proprietária sobre o pedido (item 5 da divisão de atividades). */
export const OWNER_ACTIONS = ['confirm', 'prepare', 'ready', 'pickup', 'cancel'] as const;
export type OwnerAction = (typeof OWNER_ACTIONS)[number];

/**
 * De onde cada ação pode partir e para onde leva. Segue o fluxo da seção 11 do escopo,
 * o mesmo que o banco confere em fn_order_status_allowed (script 019):
 *   PENDING → CONFIRMED → PREPARING → READY; cancelar de PENDING até READY.
 * "Saiu para entrega" e "Entregue" pertencem às entregas (motoboy), não a estas ações.
 * Exceção: na retirada no local (script 022) não há motoboy, então a proprietária marca
 * "retirado" quando o cliente busca o pedido (READY → DELIVERED). `only` limita a ação
 * a um tipo de pedido.
 */
export const ACTION_FLOW: Record<OwnerAction, { from: OrderStatus[]; to: OrderStatus; only?: Fulfillment }> = {
  confirm: { from: ['PENDING'], to: 'CONFIRMED' },
  prepare: { from: ['CONFIRMED'], to: 'PREPARING' },
  ready: { from: ['PREPARING'], to: 'READY' },
  pickup: { from: ['READY'], to: 'DELIVERED', only: 'PICKUP' },
  cancel: { from: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY'], to: 'CANCELLED' },
};
