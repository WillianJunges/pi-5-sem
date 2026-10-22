import { describe, expect, it, vi } from 'vitest';
import { freshPosition, mergeTracking, PositionSender, trackingTargets, usableFix, type PositionFix, type TrackingView } from '../src/features/tracking/policy';
import type { Delivery } from '../src/services/deliveries.service';

const now = Date.parse('2026-10-22T14:30:00Z');
const fix = (overrides: Partial<PositionFix> = {}): PositionFix => ({ latitude: -23.088, longitude: -47.216, accuracy: 12, timestamp: now, ...overrides });
const row = (id: string, overrides: Partial<Delivery> = {}) => ({ id, status: 'IN_PROGRESS', orderStatus: 'OUT_FOR_DELIVERY', ...overrides }) as Delivery;
function view(offset = 0, active = true): TrackingView {
  return { deliveryId: 'a', active, stale: false, position: active ? { deliveryId: 'a', sampleId: 's', latitude: 0, longitude: 0, accuracy: 10,
    capturedAt: new Date(now + offset).toISOString(), receivedAt: new Date(now).toISOString() } : null };
}
describe('Política do rastreamento', () => {
  it('rastreia várias entregas, removendo apenas a concluída localmente', () => {
    expect(trackingTargets([row('a'), row('b'), row('c', { status: 'ASSIGNED' }), row('d', { status: 'COMPLETED' })], ['a'])).toEqual(['b']);
    expect(trackingTargets([row('a', { localCompletion: { status: 'conflict', completedAt: '', message: null } })], [])).toEqual([]);
  });
  it.each([{ accuracy: null }, { accuracy: -1 }, { accuracy: 101 }, { latitude: 91 }, { longitude: -181 }, { latitude: NaN },
    { timestamp: now - 121_000 }, { timestamp: now + 31_000 }, { mocked: true }])('descarta coleta inválida %j', overrides => {
    expect(usableFix(fix(overrides), now)).toBe(false);
  });
  it('aceita posição atual e identifica quando ela deixa de ser recente', () => {
    expect(usableFix(fix(), now)).toBe(true);
    expect(freshPosition(view().position, now)).toBe(true);
    expect(freshPosition(view().position, now + 121_000)).toBe(false);
    expect(freshPosition(null, now)).toBe(false);
  });
  it('resposta REST atrasada não reabre canal encerrado nem retrocede marcador', () => {
    const current = view(); expect(mergeTracking(current, view(-1000))).toBe(current);
    const ended = view(0, false); expect(mergeTracking(ended, view(1000))).toBe(ended);
    expect(mergeTracking(current, ended)).toBe(ended);
  });
  it('limita frequência e nunca envia coletas simultâneas', async () => {
    let release!: () => void;
    const send = vi.fn(() => new Promise<void>(resolve => { release = resolve; }));
    const sender = new PositionSender(async () => ['a'], send, () => 'uuid', () => now);
    const first = sender.update(fix());
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(await sender.update(fix())).toBe(0); release(); expect(await first).toBe(1);
    expect(await sender.update(fix())).toBe(0);
  });
  it('revalida alvos entre envios se houve conclusão ou troca de conta', async () => {
    let ids = ['a', 'b'];
    const send = vi.fn(async () => { ids = []; });
    const sender = new PositionSender(async () => ids, send, () => 'uuid', () => now);
    expect(await sender.update(fix())).toBe(1); expect(send).toHaveBeenCalledTimes(1);
  });
  it('não reenvia trajeto antigo depois de perder a conexão', async () => {
    let clock = now;
    const send = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const sender = new PositionSender(async () => ['a'], send, () => 'uuid', () => clock);
    await expect(sender.update(fix())).rejects.toThrow('offline');
    clock += 130_000;
    expect(await sender.update(fix())).toBe(0);
    expect(await sender.update(fix({ timestamp: clock, latitude: -23.09 }))).toBe(1);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][1]).toMatchObject({ latitude: -23.09, capturedAt: new Date(clock).toISOString() });
  });
});
