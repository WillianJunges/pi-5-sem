import type { Delivery } from '../../services/deliveries.service';
import { parseDeliveryNotification, notificationForUser } from './payload';

interface Dependencies {
  user: { id: string; role: string };
  current(): boolean;
  get(id: string): Promise<Delivery>;
  offlineArrival(id: string): Promise<Delivery | null>;
  rejected(id: string, status: 403 | 404): Promise<void>;
  claim(eventId: string): Promise<boolean>;
  navigate(delivery: Delivery): void;
}
/** Nunca conclui pedidos; só resolve uma entrega autorizada e abre sua tela. */
export class NotificationOpener {
  private inFlight = new Set<string>();
  constructor(private deps: Dependencies) {}
  async open(data: unknown): Promise<boolean> {
    const p = parseDeliveryNotification(data),
      d = this.deps;
    if (!p || !d.current() || !notificationForUser(p, d.user) || this.inFlight.has(p.eventId)) return false;
    this.inFlight.add(p.eventId);
    try {
      let delivery: Delivery;
      try {
        delivery = await d.get(p.deliveryId);
      } catch (error) {
        const status = (error as { status?: number })?.status;
        if (d.user.role === 'COURIER' && (status === 403 || status === 404)) await d.rejected(p.deliveryId, status);
        if (p.type !== 'ARRIVAL' || (status !== 0 && (status ?? 0) < 500)) throw error;
        const cached = await d.offlineArrival(p.deliveryId);
        if (!cached) throw error;
        delivery = cached;
      }
      if (
        !d.current() ||
        delivery.id !== p.deliveryId ||
        delivery.orderId !== p.orderId ||
        (d.user.role === 'COURIER' && delivery.courierId !== d.user.id)
      )
        return false;
      if (!(await d.claim(p.eventId)) || !d.current()) return false;
      d.navigate(delivery);
      return true;
    } finally {
      this.inFlight.delete(p.eventId);
    }
  }
}
