/** Ponte de notificações simulada + SQLite real. Não comprova entrega pelo Android/iOS. */
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SqliteCourierStorage } from '../src/features/courier/offline/sqliteStorage';
import { TestCourierDatabase } from './support/courierDatabase';
import type { Delivery } from '../src/services/deliveries.service';
import type * as Native from '../src/features/notifications/nativeNotifications';

const h = vi.hoisted(() => ({
  values: new Map<string, string>(),
  user: '',
  epoch: 0,
  granted: true,
  projectId: null as string | null,
  store: null as unknown as SqliteCourierStorage,
  handler: null as null | { handleNotification: (notification: unknown) => Promise<{ shouldShowBanner: boolean }> },
  schedule: vi.fn(),
  api: vi.fn(),
  token: vi.fn(),
  request: vi.fn(),
  channel: vi.fn(),
  cancel: vi.fn(),
  dismiss: vi.fn(),
  sequence: 0,
}));
vi.mock('expo-constants', () => ({
  default: {
    get easConfig() {
      return h.projectId ? { projectId: h.projectId } : null;
    },
    expoConfig: {},
  },
}));
vi.mock('expo-crypto', () => ({
  randomUUID: () => `00000000-0000-4000-8000-${String(++h.sequence).padStart(12, '0')}`,
  getRandomBytes: () => new Uint8Array(32).fill(5),
}));
vi.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 4,
  getItemAsync: async (key: string) => h.values.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    h.values.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    h.values.delete(key);
  },
}));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('../src/services/api', () => ({ api: h.api }));
vi.mock('../src/services/sessionTokens', () => ({ accessTokenUserId: (token: string) => token }));
vi.mock('../src/services/tokenStorage', () => ({
  tokenStorage: { get: async () => (h.user ? { accessToken: h.user } : null), getSessionEpoch: () => h.epoch },
}));
vi.mock('../src/features/courier/offline/nativeStorage', () => ({
  get courierStorage() {
    return h.store;
  },
}));
vi.mock('expo-notifications', () => ({
  AndroidImportance: { HIGH: 4 },
  AndroidNotificationVisibility: { PRIVATE: 0 },
  IosAuthorizationStatus: { PROVISIONAL: 3 },
  setNotificationHandler: (handler: typeof h.handler) => {
    h.handler = handler;
  },
  getPermissionsAsync: async () => ({ granted: h.granted }),
  requestPermissionsAsync: h.request,
  setNotificationChannelAsync: h.channel,
  getExpoPushTokenAsync: h.token,
  scheduleNotificationAsync: h.schedule,
  getAllScheduledNotificationsAsync: async () => [],
  getPresentedNotificationsAsync: async () => [],
  cancelScheduledNotificationAsync: h.cancel,
  dismissNotificationAsync: h.dismiss,
  dismissAllNotificationsAsync: async () => {},
}));
let native: typeof Native;
let db: TestCourierDatabase;
let row: Delivery;
let clock: number;
beforeEach(async () => {
  vi.resetModules();
  h.values.clear();
  h.user = randomUUID();
  h.epoch = 0;
  h.granted = true;
  h.projectId = null;
  h.sequence = 0;
  clock = Date.parse('2026-10-22T15:00:00Z');
  vi.spyOn(Date, 'now').mockImplementation(() => clock);
  h.api.mockReset().mockResolvedValue({});
  h.token.mockReset().mockResolvedValue({ data: 'ExpoPushToken[synthetic-test-token]' });
  h.schedule.mockReset().mockImplementation(async (input: { identifier: string }) => input.identifier);
  h.channel.mockReset().mockResolvedValue(undefined);
  h.cancel.mockReset().mockResolvedValue(undefined);
  h.dismiss.mockReset().mockResolvedValue(undefined);
  h.request.mockReset().mockImplementation(async () => ({ granted: h.granted }));
  db = new TestCourierDatabase();
  h.store = new SqliteCourierStorage(async () => db);
  row = {
    id: randomUUID(),
    orderId: randomUUID(),
    courierId: h.user,
    courierName: 'Teste',
    status: 'IN_PROGRESS',
    orderStatus: 'OUT_FOR_DELIVERY',
    customer: { name: 'Ana', phone: null },
    address: {
      latitude: -23.088,
      longitude: -47.216,
      label: null,
      street: 'Rua',
      number: '1',
      complement: null,
      district: 'Centro',
      city: 'Indaiatuba',
      state: 'SP',
      cep: '13330000',
    },
    notes: null,
    paymentMethod: 'PIX',
    total: 20,
    changeFor: null,
    createdAt: new Date(clock).toISOString(),
    assignedAt: new Date(clock).toISOString(),
    startedAt: new Date(clock).toISOString(),
    completedAt: null,
    completionReceivedAt: null,
    cancelledAt: null,
  };
  await h.store.save(h.user, [row]);
  native = await import('../src/features/notifications/nativeNotifications');
});
afterEach(() => {
  db.close();
  vi.restoreAllMocks();
});
const fix = () => ({
  latitude: row.address.latitude,
  longitude: row.address.longitude,
  accuracy: 10,
  timestamp: clock,
});
async function twoFixes() {
  await native.processArrival(h.user, fix());
  clock += 10_000;
  await native.processArrival(h.user, fix());
}
describe('Integração de alertas locais e registro push', () => {
  it('sem escolha explícita não pede permissão nem agenda aviso', async () => {
    await twoFixes();
    expect(h.request).not.toHaveBeenCalled();
    expect(h.schedule).not.toHaveBeenCalled();
  });
  it('permissão recusada não cria alerta e não registra dispositivo', async () => {
    h.granted = false;
    await expect(native.enableArrivalAlerts(h.user, true)).rejects.toThrow('Permita');
    await twoFixes();
    expect(h.schedule).not.toHaveBeenCalled();
    expect(h.api).not.toHaveBeenCalled();
  });
  it('sem internet agenda chegada uma vez e não chama conclusão nem API', async () => {
    await native.enableArrivalAlerts(h.user, true);
    await twoFixes();
    clock += 10_000;
    await native.processArrival(h.user, fix());
    expect(h.schedule).toHaveBeenCalledTimes(1);
    expect(h.api).not.toHaveBeenCalled();
    expect(h.schedule.mock.calls[0][0].content.data).toMatchObject({
      type: 'ARRIVAL',
      deliveryId: row.id,
      userId: h.user,
    });
    expect(JSON.stringify(h.schedule.mock.calls[0][0])).not.toMatch(/latitude|longitude|street|phone/);
  });
  it('conclusão offline antes da segunda coleta impede notificação', async () => {
    await native.enableArrivalAlerts(h.user, true);
    await native.processArrival(h.user, fix());
    await h.store.enqueue(h.user, row.id, { operationId: randomUUID(), completedAt: new Date(clock).toISOString() });
    clock += 10_000;
    await native.processArrival(h.user, fix());
    expect(h.schedule).not.toHaveBeenCalled();
  });
  it('logout com tokens ainda em limpeza suprime alerta e apresentação', async () => {
    await native.enableArrivalAlerts(h.user, true);
    await native.processArrival(h.user, fix());
    await native.stopSessionNotifications();
    clock += 10_000;
    await native.processArrival(h.user, fix());
    expect(h.schedule).not.toHaveBeenCalled();
  });
  it('falha de agendamento permite nova tentativa com mesmo eventId', async () => {
    await native.enableArrivalAlerts(h.user, true);
    h.schedule.mockRejectedValueOnce(new Error('falha nativa'));
    await twoFixes();
    clock += 10_000;
    await native.processArrival(h.user, fix());
    expect(h.schedule).toHaveBeenCalledTimes(2);
    expect(h.schedule.mock.calls[0][0].content.data.eventId).toBe(h.schedule.mock.calls[1][0].content.data.eventId);
  });
  it('falta de projeto Expo não pede permissão push e não impede alerta local', async () => {
    await expect(native.enablePushAlerts(h.user)).rejects.toThrow('nesta versão');
    expect(h.token).not.toHaveBeenCalled();
    expect(h.request).not.toHaveBeenCalled();
    await native.enableArrivalAlerts(h.user, true);
    await twoFixes();
    expect(h.schedule).toHaveBeenCalledTimes(1);
  });
  it('registro autorizado usa identidade da instalação e vínculo da conta', async () => {
    h.projectId = randomUUID();
    await native.enablePushAlerts(h.user);
    expect(h.api).toHaveBeenCalledWith(
      '/notifications/device',
      expect.objectContaining({
        expectedUserId: h.user,
        method: 'PUT',
        body: expect.objectContaining({ bindingVersion: 1, platform: 'android' }),
      }),
    );
    expect(native.notificationSnapshot()).toMatchObject({ push: true, registered: true });
  });
  it('apresentação em foreground é deduplicada e outra conta é recusada', async () => {
    const payload = {
      version: 1,
      eventId: randomUUID(),
      userId: h.user,
      deliveryId: row.id,
      orderId: row.orderId,
      type: 'ASSIGNED',
    };
    const notification = { request: { content: { data: payload } } };
    expect((await h.handler!.handleNotification(notification)).shouldShowBanner).toBe(true);
    expect((await h.handler!.handleNotification(notification)).shouldShowBanner).toBe(false);
    h.user = randomUUID();
    h.epoch++;
    expect((await h.handler!.handleNotification(notification)).shouldShowBanner).toBe(false);
  });
});
