/** Ciclo de vida do pedido (escopo, seção 11). */
export const ORDER_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Pagamento na entrega (decisão da equipe: o escopo não define). */
export const PAYMENT_METHODS = ['CASH', 'PIX', 'CREDIT_CARD', 'DEBIT_CARD'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Cópia do endereço no momento do pedido (escopo, seção 18). */
export interface OrderAddress {
  addressId: string;
  label: string | null;
  cep: string;
  street: string;
  number: string;
  complement: string | null;
  district: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
}

/** Valores em CENTAVOS dentro do backend (ver shared/utils/money.ts). */
export interface OrderItem {
  id: string;
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
}

export interface Order {
  id: string;
  customerId: string;
  menuId: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  changeForCents: number | null;
  notes: string | null;
  address: OrderAddress;
  distanceMeters: number;
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  items: OrderItem[];
  createdAt: Date;
  confirmedAt: Date | null;
  preparingAt: Date | null;
  readyAt: Date | null;
  outForDeliveryAt: Date | null;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
}

/** O que o service entrega ao repository para gravar (tudo já calculado e validado). */
export type NewOrder = Omit<Order, 'id' | 'customerId' | 'status' | 'items' | `${string}At`> & {
  items: Omit<OrderItem, 'id'>[];
};

/** Prévia dos valores (POST /orders/quote). Também é a base do pedido gravado. */
export interface OrderQuote {
  menuId: string;
  address: OrderAddress;
  /** Só os itens disponíveis hoje, com o preço aplicado. */
  items: Omit<OrderItem, 'id'>[];
  /** Variações do carrinho que saíram do cardápio de hoje. */
  unavailableVariantIds: string[];
  distanceMeters: number;
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
}
