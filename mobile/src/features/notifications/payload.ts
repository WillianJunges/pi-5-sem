export const NOTIFICATION_TYPES = ['ARRIVAL', 'ASSIGNED', 'UNASSIGNED', 'CANCELLED', 'OUT_FOR_DELIVERY'] as const;
export interface DeliveryNotification {
  version: 1;
  eventId: string;
  userId: string;
  deliveryId: string;
  orderId: string;
  type: (typeof NOTIFICATION_TYPES)[number];
}
const uuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
/** Payload é entrada não confiável: nunca aceitar caminhos de navegação ou dados de endereço. */
export function parseDeliveryNotification(value: unknown): DeliveryNotification | null {
  const p = value as DeliveryNotification | null;
  return p?.version === 1 &&
    uuid(p.eventId) &&
    uuid(p.userId) &&
    uuid(p.deliveryId) &&
    uuid(p.orderId) &&
    NOTIFICATION_TYPES.includes(p.type)
    ? { version: 1, eventId: p.eventId, userId: p.userId, deliveryId: p.deliveryId, orderId: p.orderId, type: p.type }
    : null;
}
export function notificationForUser(p: DeliveryNotification, user: { id: string; role: string }): boolean {
  return p.userId === user.id && (p.type === 'OUT_FOR_DELIVERY' ? user.role === 'CUSTOMER' : user.role === 'COURIER');
}
