export type NotificationKind = 'ASSIGNED' | 'UNASSIGNED' | 'CANCELLED' | 'OUT_FOR_DELIVERY';
export type AttemptStatus = 'PENDING' | 'SENDING' | 'TICKET' | 'CHECKING' | 'DELIVERED' | 'FAILED' | 'SKIPPED';
export interface PushAttempt {
  id: string;
  eventId: string;
  deviceId: string;
  bindingVersion: number;
  userId: string;
  deliveryId: string;
  orderId: string;
  kind: NotificationKind;
  token: string;
  attempts: number;
  receiptAttempts: number;
  leaseId: string;
  ticketId: string | null;
  phase: 'send' | 'receipt';
  createdAt: Date;
}
export interface PushResult {
  status: 'ok' | 'error';
  id?: string;
  code?: string;
}
export interface PushTransport {
  send(attempt: PushAttempt): Promise<PushResult>;
  receipt(ticketId: string): Promise<PushResult | null>;
}
export interface AttemptResult {
  status: AttemptStatus;
  nextAt: Date;
  ticketId?: string;
  errorCode?: string;
  disableDevice?: boolean;
}
export interface NotificationsRepository {
  materialize(): Promise<void>;
  claim(now: Date, leaseId: string): Promise<PushAttempt | null>;
  eligible(attempt: PushAttempt): Promise<boolean>;
  finish(attempt: PushAttempt, result: AttemptResult): Promise<void>;
}
