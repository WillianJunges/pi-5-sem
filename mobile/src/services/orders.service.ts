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

/** Linha do histórico (GET /orders). */
export interface OrderSummary {
  id: string;
  status: OrderStatus;
  /** true enquanto não foi entregue nem cancelado. */
  isActive: boolean;
  paymentMethod: PaymentMethod;
  addressLabel: string | null;
  addressStreet: string;
  addressNumber: string;
  itemCount: number;
  /** "2x Marmita de Frango (Média), 1x Coca-Cola (Lata 350 ml)" */
  itemsSummary: string;
  total: number;
  createdAt: string;
}

/** O app manda só o que o cliente escolheu; preços e total são calculados no backend. */
export interface CreateOrderInput {
  addressId: string;
  paymentMethod: PaymentMethod;
  changeFor: number | null;
  notes: string | null;
  items: { variantId: string; quantity: number }[];
  /** Total que o cliente viu na prévia: se mudou, o backend recusa em vez de cobrar outro valor. */
  expectedTotal: number;
}

/** Resposta de POST /orders/quote: valores calculados pelo backend, sem gravar o pedido. */
export interface OrderQuote {
  /** Só os itens disponíveis hoje, com o preço que vale. */
  items: Omit<OrderItem, 'id'>[];
  /** Variações do carrinho que saíram do cardápio de hoje. */
  unavailableVariantIds: string[];
  distanceMeters: number;
  subtotal: number;
  deliveryFee: number;
  total: number;
}

export const ordersService = {
  list: (offset = 0, limit = 20) =>
    api<{ orders: OrderSummary[]; hasMore: boolean }>(`/orders?limit=${limit}&offset=${offset}`),
  quote: (data: Pick<CreateOrderInput, 'addressId' | 'items'>) =>
    api<OrderQuote>('/orders/quote', { method: 'POST', body: data }),
  create: (data: CreateOrderInput) => api<Order>('/orders', { method: 'POST', body: data }),
  get: (id: string) => api<Order>(`/orders/${id}`),
};
