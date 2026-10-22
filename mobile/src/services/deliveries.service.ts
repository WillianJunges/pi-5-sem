import { api } from './api';
import type { OrderStatus, PaymentMethod } from './orders.service';

export type DeliveryStatus = 'WAITING_ASSIGNMENT' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface DeliveryAddress {
  label: string | null;
  street: string;
  number: string;
  complement: string | null;
  district: string;
  city: string;
  state: string;
  cep: string;
  latitude: number;
  longitude: number;
}

/** Contrato da etapa 2 do backend; valores monetários chegam em reais. */
export interface Delivery {
  id: string;
  orderId: string;
  courierId: string | null;
  courierName: string | null;
  status: DeliveryStatus;
  orderStatus: OrderStatus;
  customer: { name: string; phone: string | null };
  address: DeliveryAddress;
  notes: string | null;
  paymentMethod: PaymentMethod;
  total: number;
  changeFor: number | null;
  createdAt: string;
  assignedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  completionReceivedAt: string | null;
  cancelledAt: string | null;
}

export interface DeliveryPage { deliveries: Delivery[]; hasMore: boolean }
export interface DeliveryCompletion { operationId: string; completedAt: string }

export interface DeliveriesGateway {
  list(active: boolean, offset?: number): Promise<DeliveryPage>;
  get(id: string): Promise<Delivery>;
  start(id: string): Promise<Delivery>;
  complete(id: string, input: DeliveryCompletion): Promise<Delivery>;
}

/** A identidade do motoboy vem do token; nenhum método aceita um courierId livre. */
export const deliveriesService: DeliveriesGateway = {
  list: (active, offset = 0) => api<DeliveryPage>(`/deliveries/me?active=${active}&limit=20&offset=${offset}`),
  get: id => api<Delivery>(`/deliveries/${encodeURIComponent(id)}`),
  start: id => api<Delivery>(`/deliveries/${encodeURIComponent(id)}/start`, { method: 'PATCH' }),
  complete: (id, input) => api<Delivery>(`/deliveries/${encodeURIComponent(id)}/complete`, { method: 'POST', body: input }),
};
