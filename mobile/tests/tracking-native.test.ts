/** Simula a ponte nativa; valida ciclo de vida, não o GPS real nem a execução do sistema operacional. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Tracking from '../src/features/tracking/nativeTracking';
vi.mock('../src/features/notifications/nativeNotifications',()=>({processArrival:async()=>{},reconcileArrivalAlerts:async()=>{},clearArrivalAlerts:async()=>{}}));

const native = vi.hoisted(() => ({
  values: new Map<string, string>(), user: 'a', epoch: 0, rows: [] as unknown[], pending: [] as { deliveryId: string }[],
  blocked: false, fg: true, bg: true, available: true, services: true, started: false,
  app: { currentState: 'active' }, task: null as null | ((event: unknown) => Promise<void>),
  callback: null as null | ((fix: unknown) => void), requestFg: vi.fn(), api: vi.fn(), start: vi.fn(), stop: vi.fn(), remove: vi.fn(),
}));
vi.mock('expo-crypto', () => ({ randomUUID: () => 'sample-uuid' }));
vi.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 4,
  getItemAsync: async (key: string) => native.values.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => { native.values.set(key, value); },
  deleteItemAsync: async (key: string) => { native.values.delete(key); },
}));
vi.mock('react-native', () => ({ AppState: native.app, Platform: { OS: 'android' } }));
vi.mock('expo-task-manager', () => ({ defineTask: (_: string, callback: typeof native.task) => { native.task = callback; }, isAvailableAsync: async () => native.available }));
vi.mock('expo-location', () => ({
  Accuracy: { High: 4 }, getForegroundPermissionsAsync: async () => ({ granted: native.fg }),
  requestForegroundPermissionsAsync: native.requestFg,
  getBackgroundPermissionsAsync: async () => ({ granted: native.bg }), requestBackgroundPermissionsAsync: async () => ({ granted: native.bg }),
  hasServicesEnabledAsync: async () => native.services, hasStartedLocationUpdatesAsync: async () => native.started,
  startLocationUpdatesAsync: native.start, stopLocationUpdatesAsync: native.stop,
  watchPositionAsync: async (_: unknown, callback: typeof native.callback) => { native.callback = callback; return { remove: native.remove }; },
}));
vi.mock('../src/services/api', () => ({ api: native.api }));
vi.mock('../src/services/tokenStorage', () => ({ tokenStorage: {
  get: async () => native.user ? { accessToken: native.user } : null, getSessionEpoch: () => native.epoch,
  replaceIfCurrent: async () => !!native.user,
} }));
vi.mock('../src/services/sessionTokens', () => ({ accessTokenUserId: (token: string) => token }));
vi.mock('../src/features/courier/offline/nativeStorage', () => ({ courierStorage: {
  list: async () => native.rows, pending: async () => native.pending, isBlocked: async () => native.blocked,
  block: async (_: string, value: boolean) => { native.blocked = value; },
  revoke: async (_: string, id: string) => { native.rows = native.rows.filter(row => (row as { id: string }).id !== id); },
  save: async (_: string, rows: unknown[]) => { native.rows = rows; },
} }));
let tracking: typeof Tracking;
const row = (id: string) => ({ id, status: 'IN_PROGRESS', orderStatus: 'OUT_FOR_DELIVERY' });
const fix = (offset = 0) => ({ timestamp: Date.now() + offset, coords: { latitude: -23.088, longitude: -47.216, accuracy: 10 }, mocked: false });
const collect = async (...locations: ReturnType<typeof fix>[]) => { await native.task!({ data: { locations } }); };
beforeEach(async () => {
  vi.resetModules(); native.values.clear(); native.user = 'a'; native.epoch = 0;
  native.rows = [row('d1')]; native.pending = []; native.blocked = false; native.fg = true; native.bg = true;
  native.available = true; native.services = true; native.started = false; native.app.currentState = 'active'; native.callback = null;
  native.api.mockReset().mockResolvedValue({}); native.start.mockReset().mockImplementation(async () => { native.started = true; });
  native.stop.mockReset().mockImplementation(async () => { native.started = false; }); native.remove.mockReset();
  native.requestFg.mockReset().mockImplementation(async () => ({ granted: native.fg }));
  tracking = await import('../src/features/tracking/nativeTracking');
});

describe('Coletor nativo com ponte simulada', () => {
  it('não pede permissão nem coleta antes da escolha do motoboy', async () => {
    await tracking.reconcileTracking(); expect(native.requestFg).not.toHaveBeenCalled(); expect(native.start).not.toHaveBeenCalled();
  });
  it('permissão recusada não salva autorização nem inicia o coletor', async () => {
    native.fg = false;
    await expect(tracking.enableCourierTracking('a', 'foreground')).rejects.toThrow('Permissão');
    expect(native.values.size).toBe(0); expect(native.start).not.toHaveBeenCalled();
  });
  it('não autoriza a conta que mudou enquanto o diálogo de permissão estava aberto', async () => {
    native.requestFg.mockImplementation(async () => { native.user = 'b'; native.epoch++; return { granted: true }; });
    await expect(tracking.enableCourierTracking('a', 'foreground')).rejects.toThrow('sessão');
    expect(native.values.size).toBe(0);
  });
  it('foreground interrompe o watcher ao minimizar e retoma ao voltar', async () => {
    await tracking.enableCourierTracking('a', 'foreground'); expect(tracking.trackingSnapshot().collecting).toBe(true);
    native.app.currentState = 'background'; await tracking.reconcileTracking(); expect(native.remove).toHaveBeenCalled();
    expect(tracking.trackingSnapshot().collecting).toBe(false);
    native.app.currentState = 'active'; await tracking.reconcileTracking(); expect(tracking.trackingSnapshot().collecting).toBe(true);
  });
  it('desativar enquanto a permissão está aberta impede uma autorização atrasada', async () => {
    let granted!: (value: { granted: boolean }) => void;
    native.requestFg.mockImplementation(() => new Promise(resolve => { granted = resolve; }));
    const enabling = tracking.enableCourierTracking('a', 'foreground');
    await tracking.stopCourierTracking(); granted({ granted: true });
    await expect(enabling).rejects.toThrow('autorização');
    expect(native.values.size).toBe(0); expect(native.started).toBe(false);
  });
  it('background exige suporte e permissão específica', async () => {
    native.bg = false; await expect(tracking.enableCourierTracking('a', 'background')).rejects.toThrow('segundo plano');
    expect(native.start).not.toHaveBeenCalled();
    native.bg = true; native.available = false;
    await expect(tracking.enableCourierTracking('a', 'background')).rejects.toThrow('versão instalada');
  });
  it('registra configuração nativa e envia apenas a posição mais recente de um lote', async () => {
    await tracking.enableCourierTracking('a', 'background');
    expect(native.start).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ timeInterval: 10_000, foregroundService: expect.any(Object) }));
    await collect(fix(-5000), fix());
    expect(native.api).toHaveBeenCalledTimes(1);
    expect(native.api).toHaveBeenCalledWith('/deliveries/d1/location', expect.objectContaining({ expectedUserId: 'a' }));
  });
  it('conclusão offline de uma entre duas mantém só o compartilhamento restante', async () => {
    native.rows = [row('d1'), row('d2')]; await tracking.enableCourierTracking('a', 'background');
    native.pending = [{ deliveryId: 'd1' }]; await tracking.reconcileTracking(); await collect(fix());
    expect(native.api).toHaveBeenCalledTimes(1); expect(native.api.mock.calls[0][0]).toBe('/deliveries/d2/location');
    expect(native.started).toBe(true);
    native.pending.push({ deliveryId: 'd2' }); await tracking.reconcileTracking(); expect(native.started).toBe(false);
  });
  it('logout ou troca de conta não envia posição usando a sessão seguinte', async () => {
    await tracking.enableCourierTracking('a', 'background'); native.user = 'b'; native.epoch++;
    await collect(fix()); expect(native.api).not.toHaveBeenCalled(); expect(native.started).toBe(false);
    expect(tracking.trackingSnapshot().mode).toBeNull();
  });
  it('retirar autorização para o rastreamento invalida callbacks já registrados', async () => {
    await tracking.enableCourierTracking('a', 'background'); await tracking.stopCourierTracking(); await collect(fix());
    expect(native.api).not.toHaveBeenCalled(); expect(native.values.size).toBe(0); expect(native.started).toBe(false);
  });
  it('recusa de acesso interrompe a coleta e bloqueia o cache', async () => {
    await tracking.enableCourierTracking('a', 'background'); native.api.mockRejectedValue({ status: 403 });
    await collect(fix()); await vi.waitFor(() => expect(native.started).toBe(false)); expect(native.blocked).toBe(true);
  });
  it('GPS desligado e permissão revogada interrompem uma tarefa antes ativa', async () => {
    await tracking.enableCourierTracking('a', 'background'); native.services = false;
    await tracking.reconcileTracking(); expect(native.started).toBe(false); expect(tracking.trackingSnapshot().message).toContain('GPS');
  });
});
