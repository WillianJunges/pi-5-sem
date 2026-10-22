import type { Delivery } from '../../services/deliveries.service';

export interface PositionFix { latitude: number; longitude: number; accuracy: number | null; timestamp: number; mocked?: boolean }
export interface PositionInput { sampleId: string; latitude: number; longitude: number; accuracy: number; capturedAt: string }
export interface TrackingPosition extends PositionInput { deliveryId: string; receivedAt: string }
export interface TrackingView { deliveryId: string; active: boolean; position: TrackingPosition | null; stale: boolean }

/** Conclusão local encerra o GPS, mesmo enquanto o servidor aguarda sincronização. */
export function trackingTargets(deliveries: Delivery[], pendingIds: string[]): string[] {
  return deliveries.filter(d => d.status === 'IN_PROGRESS' && d.orderStatus === 'OUT_FOR_DELIVERY'
    && !d.localCompletion && !pendingIds.includes(d.id)).map(d => d.id);
}
export function usableFix(fix: PositionFix, now: number): boolean {
  return !fix.mocked && Number.isFinite(fix.timestamp) && now - fix.timestamp <= 120_000 && fix.timestamp - now <= 30_000
    && Number.isFinite(fix.latitude) && Math.abs(fix.latitude) <= 90 && Number.isFinite(fix.longitude) && Math.abs(fix.longitude) <= 180
    && fix.accuracy !== null && Number.isFinite(fix.accuracy) && fix.accuracy >= 0 && fix.accuracy <= 100;
}
export function freshPosition(position: TrackingPosition | null, now: number): boolean {
  return !!position && now - Date.parse(position.capturedAt) <= 120_000 && Date.parse(position.capturedAt) - now <= 30_000;
}
/** Um GET atrasado não recoloca uma coordenada anterior sobre uma atualização do socket. */
export function mergeTracking(current: TrackingView | null, next: TrackingView): TrackingView {
  if (current?.deliveryId === next.deliveryId && !current.active) return current;
  if (!next.active || !current?.position || current.deliveryId !== next.deliveryId) return next;
  if (!next.position || Date.parse(next.position.capturedAt) < Date.parse(current.position.capturedAt)) return current;
  return next;
}

/** Sem fila de trajetos: após perder a rede, apenas uma nova coleta pode ser enviada. */
export class PositionSender {
  private busy = false;
  private lastAttempt = -Infinity;
  constructor(private targets: () => Promise<string[]>, private send: (id: string, point: PositionInput) => Promise<unknown>,
    private uuid: () => string, private now: () => number = Date.now) {}
  async update(fix: PositionFix): Promise<number> {
    if (this.busy || this.now() - this.lastAttempt < 10_000 || !usableFix(fix, this.now())) return 0;
    this.busy = true;
    this.lastAttempt = this.now();
    try {
      const point: PositionInput = { sampleId: this.uuid(), latitude: fix.latitude, longitude: fix.longitude,
        accuracy: fix.accuracy!, capturedAt: new Date(fix.timestamp).toISOString() };
      let sent = 0;
      let failure: unknown;
      for (const id of await this.targets()) {
        // Reconsulta pendências e sessão entre os envios de duas entregas simultâneas.
        if (!(await this.targets()).includes(id) || !usableFix(fix, this.now())) continue;
        try { await this.send(id, point); sent++; }
        catch (error) { failure = error; }
      }
      if (failure) throw failure;
      return sent;
    } finally { this.busy = false; }
  }
}
