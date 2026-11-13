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

/** Entrega no endereço ou retirada no local (sem endereço e sem taxa). */
export type Fulfillment = 'DELIVERY' | 'PICKUP';

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'Aguardando confirmação',
  CONFIRMED: 'Confirmado',
  PREPARING: 'Em preparo',
  READY: 'Pronto',
  OUT_FOR_DELIVERY: 'Saiu para entrega',
  DELIVERED: 'Entregue',
  CANCELLED: 'Cancelado',
};

/**
 * Texto do status levando em conta o tipo do pedido: na retirada, "Pronto" vira
 * "Pronto para retirada" e "Entregue" vira "Retirado".
 * Pedidos guardados no aparelho antes da retirada existir vêm sem `fulfillment` (= entrega).
 */
export function orderStatusLabel(status: OrderStatus, fulfillment?: Fulfillment): string {
  if (fulfillment === 'PICKUP') {
    if (status === 'READY') return 'Pronto para retirada';
    if (status === 'DELIVERED') return 'Retirado';
  }
  return ORDER_STATUS_LABEL[status];
}

/**
 * Onde o cliente retira o pedido. É o mesmo ponto de onde saem as entregas
 * (STORE_LOCATION no backend: Fatec Indaiatuba, decisão da equipe).
 */
export const STORE_PICKUP_ADDRESS = {
  name: 'Marmitaria (Fatec Indaiatuba)',
  line: 'Rua Dom Pedro I, 65 · Cidade Nova I · Indaiatuba/SP',
};

/** Pagamento na entrega (ou no balcão, na retirada). */
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
  fulfillment: Fulfillment;
  paymentMethod: PaymentMethod;
  changeFor: number | null;
  notes: string | null;
  /** null na retirada no local. */
  address: {
    label: string | null;
    cep: string;
    street: string;
    number: string;
    complement: string | null;
    district: string;
    city: string;
    state: string;
    /** Coordenadas gravadas no pedido; o mapa da entrega usa como destino. */
    latitude: number;
    longitude: number;
  } | null;
  /** null na retirada no local. */
  distanceMeters: number | null;
  subtotal: number;
  deliveryFee: number;
  total: number;
  items: OrderItem[];
  createdAt: string;
  /** Horário de cada passo do status (null enquanto não aconteceu). */
  confirmedAt: string | null;
  preparingAt: string | null;
  readyAt: string | null;
  outForDeliveryAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  /** Quem cancelou: o próprio cliente ou a marmitaria. */
  cancelledBy: 'CUSTOMER' | 'OWNER' | null;
  cancellationReason: string | null;
}

/** Linha do histórico (GET /orders). */
export interface OrderSummary {
  id: string;
  status: OrderStatus;
  /** Opcional só por causa da cópia offline salva antes da retirada existir. */
  fulfillment?: Fulfillment;
  /** true enquanto não foi entregue nem cancelado. */
  isActive: boolean;
  paymentMethod: PaymentMethod;
  addressLabel: string | null;
  /** null na retirada no local. */
  addressStreet: string | null;
  addressNumber: string | null;
  itemCount: number;
  /** "2x Marmita de Frango (Média), 1x Coca-Cola (Lata 350 ml)" */
  itemsSummary: string;
  total: number;
  createdAt: string;
}

/** O app manda só o que o cliente escolheu; preços e total são calculados no backend. */
export interface CreateOrderInput {
  fulfillment: Fulfillment;
  /** Obrigatório na entrega; null na retirada. */
  addressId: string | null;
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
  /** null na retirada no local. */
  distanceMeters: number | null;
  subtotal: number;
  deliveryFee: number;
  total: number;
}

export const ordersService = {
  list: (offset = 0, limit = 20) =>
    api<{ orders: OrderSummary[]; hasMore: boolean }>(`/orders?limit=${limit}&offset=${offset}`),
  quote: (data: Pick<CreateOrderInput, 'fulfillment' | 'addressId' | 'items'>) =>
    api<OrderQuote>('/orders/quote', { method: 'POST', body: data }),
  create: (data: CreateOrderInput) => api<Order>('/orders', { method: 'POST', body: data }),
  get: (id: string) => api<Order>(`/orders/${id}`),
  /** Só funciona enquanto o pedido aguarda confirmação (PENDING). */
  cancel: (id: string, reason: string | null) =>
    api<Order>(`/orders/${id}/cancel`, { method: 'POST', body: { reason } }),
};
