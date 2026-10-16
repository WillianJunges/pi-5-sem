import { api } from './api';

export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'READY'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED';

export type PaymentMethod = 'CASH' | 'PIX' | 'CREDIT_CARD' | 'DEBIT_CARD';

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'Aguardando confirmação',
  CONFIRMED: 'Confirmado',
  PREPARING: 'Em preparo',
  READY: 'Pronto',
  OUT_FOR_DELIVERY: 'Saiu para entrega',
  DELIVERED: 'Entregue',
  CANCELLED: 'Cancelado',
};

/** Pagamento na entrega. */
export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  CASH: 'Dinheiro',
  PIX: 'Pix',
  CREDIT_CARD: 'Cartão de crédito',
  DEBIT_CARD: 'Cartão de débito',
};

export interface OrderItem {
  id: string;
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

/** Resposta de GET/POST /orders (valores em reais). */
export interface Order {
  id: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  changeFor: number | null;
  notes: string | null;
  address: {
    label: string | null;
    cep: string;
    street: string;
    number: string;
    complement: string | null;
    district: string;
    city: string;
    state: string;
  };
  distanceMeters: number;
  subtotal: number;
  deliveryFee: number;
  total: number;
  items: OrderItem[];
  createdAt: string;
}

/** O app manda só o que o cliente escolheu; preços e total são calculados no backend. */
export interface CreateOrderInput {
  addressId: string;
  paymentMethod: PaymentMethod;
  changeFor: number | null;
  notes: string | null;
  items: { variantId: string; quantity: number }[];
}

export const ordersService = {
  create: (data: CreateOrderInput) => api<Order>('/orders', { method: 'POST', body: data }),
  get: (id: string) => api<Order>(`/orders/${id}`),
};
