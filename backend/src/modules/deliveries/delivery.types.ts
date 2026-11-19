import type { OrderStatus, PaymentMethod } from '../orders/order.types';
import type { Role } from '../users/user.types';

export const DELIVERY_STATUSES = ['WAITING_ASSIGNMENT', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

/** A identidade vem da sessão validada, nunca do corpo enviado pelo aplicativo. */
export interface DeliveryActor {
  id: string;
  role: Role;
}

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

/** Dinheiro segue o padrão do backend: centavos internamente, reais na resposta HTTP. */
export interface Delivery {
  id: string;
  orderId: string;
  customerId: string;
  customer: { name: string; phone: string | null };
  courierId: string | null;
  courierName: string | null;
  status: DeliveryStatus;
  orderStatus: OrderStatus;
  address: DeliveryAddress;
  notes: string | null;
  paymentMethod: PaymentMethod;
  totalCents: number;
  courierEarningsCents?: number | null;
  changeForCents: number | null;
  createdAt: Date;
  assignedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  completionReceivedAt: Date | null;
  cancelledAt: Date | null;
}

export interface DeliveriesFilter {
  active: boolean;
  limit: number;
  offset: number;
}

export interface CompleteDeliveryInput {
  operationId: string;
  completedAt: Date;
}

/** Estado corrente lido com lock; as regras do service são avaliadas dentro da transação. */
export interface LockedDeliveryState {
  status: DeliveryStatus;
  orderStatus: OrderStatus;
  courierId: string | null;
  candidateCourierEligible: boolean;
  startedAt: Date | null;
  completedAt: Date | null;
  completionKey: string | null;
  serverNow: Date;
}

export type DeliveryCommand =
  | { type: 'assign'; courierId: string }
  | { type: 'start' }
  | { type: 'complete'; input: CompleteDeliveryInput };
