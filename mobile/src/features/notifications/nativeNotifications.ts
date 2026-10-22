import { isRunningInExpoGo } from 'expo';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import type * as NotificationsModule from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { api } from '../../services/api';
import { tokenStorage } from '../../services/tokenStorage';
import { accessTokenUserId } from '../../services/sessionTokens';
import { courierStorage } from '../courier/offline/nativeStorage';
import type { PositionFix } from '../tracking/policy';
import { trackingTargets, usableFix } from '../tracking/policy';
import { nearDestination } from './arrivalPolicy';
import { parseDeliveryNotification } from './payload';
import { PushBindings, type Installation } from './pushBindings';

/**
 * expo-notifications é carregado sob demanda: no Expo Go (Android, SDK 53+) faltam os módulos
 * nativos dele e um `import` direto derrubava o app inteiro ao abrir. No Expo Go o módulo nem
 * é carregado (o Metro acusa erro ao carregar, mesmo com catch): as notificações ficam
 * desligadas e o resto do app funciona. No APK/development build nada muda.
 */
const EXPO_GO_MESSAGE =
  'Notificações não funcionam no Expo Go. Use o APK de teste (docs/apk-android.md) para ativar os avisos.';
let loaded: Promise<typeof NotificationsModule | null> | null = null;
export function loadNotifications(): Promise<typeof NotificationsModule | null> {
  if (isRunningInExpoGo()) return Promise.resolve(null);
  loaded ??= import('expo-notifications')
    .then((module) => {
      registerForegroundHandler(module);
      return module;
    })
    .catch(() => null);
  return loaded;
}
/** Para quem precisa do módulo: no Expo Go avisa com uma mensagem clara em vez de quebrar. */
async function notificationsOrThrow() {
  const module = await loadNotifications();
  if (!module) throw new Error(EXPO_GO_MESSAGE);
  return module;
}

const INSTALLATION = 'notifications.installation.v1';
const prefsKey = (userId: string) => `notifications.preferences.${userId}`;
const secureOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };
let revision = 0;
let suppressedEpoch: number | null = null;
const listeners = new Set<() => void>();
let state = {
  userId: null as string | null,
  arrivals: false,
  push: false,
  registered: false,
  pending: 0,
  message: null as string | null,
};
export const notificationSnapshot = () => state;
export const subscribeNotifications = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
function update(patch: Partial<typeof state>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}
async function current(userId: string) {
  const epoch = tokenStorage.getSessionEpoch();
  const tokens = await tokenStorage.get();
  return (
    epoch !== suppressedEpoch &&
    epoch === tokenStorage.getSessionEpoch() &&
    !!tokens &&
    accessTokenUserId(tokens.accessToken) === userId
  );
}
export const pushBindings = new PushBindings(
  {
    async get() {
      const raw = await SecureStore.getItemAsync(INSTALLATION);
      if (!raw) return null;
      const value = JSON.parse(raw) as Installation;
      if (
        typeof value.installationId !== 'string' ||
        !/^[a-f0-9]{64}$/.test(value.installationKey) ||
        !Number.isSafeInteger(value.version) ||
        !Array.isArray(value.revocations)
      )
        throw new Error('Registro local de notificações inválido.');
      return value;
    },
    set: (value) => SecureStore.setItemAsync(INSTALLATION, JSON.stringify(value), secureOptions),
  },
  {
    register: (userId, body) => api('/notifications/device', { method: 'PUT', body, expectedUserId: userId }),
    revoke: (body) => api('/notifications/device/revoke', { method: 'POST', body, auth: false }),
  },
  () => ({
    installationId: Crypto.randomUUID(),
    installationKey: Array.from(Crypto.getRandomBytes(32), (b) => b.toString(16).padStart(2, '0')).join(''),
  }),
  current,
);

async function preferences(userId: string): Promise<{ arrivals: boolean }> {
  const raw = await SecureStore.getItemAsync(prefsKey(userId));
  if (!raw) return { arrivals: false };
  try {
    return { arrivals: JSON.parse(raw).arrivals === true };
  } catch {
    return { arrivals: false };
  }
}
async function channels() {
  const Notifications = await notificationsOrThrow();
  if (Platform.OS === 'android')
    await Notifications.setNotificationChannelAsync('deliveries', {
      name: 'Entregas',
      importance: Notifications.AndroidImportance.HIGH,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });
}
async function permit() {
  const Notifications = await notificationsOrThrow();
  await channels();
  const p = await Notifications.requestPermissionsAsync();
  if (!p.granted && p.ios?.status !== Notifications.IosAuthorizationStatus.PROVISIONAL)
    throw new Error('Permita notificações nas configurações do aparelho para receber os avisos.');
}
export async function enableArrivalAlerts(userId: string, enabled: boolean) {
  if (!enabled) revision++;
  const captured = revision,
    epoch = tokenStorage.getSessionEpoch();
  if (enabled) await permit();
  if (captured !== revision || epoch !== tokenStorage.getSessionEpoch() || !(await current(userId)))
    throw new Error('A sessão mudou. Tente novamente.');
  await SecureStore.setItemAsync(prefsKey(userId), JSON.stringify({ arrivals: enabled }), secureOptions);
  if (!enabled) await clearArrivalAlerts(userId);
  await refreshNotificationState(userId);
}
export async function enablePushAlerts(userId: string, askPermission = true) {
  const captured = revision,
    epoch = tokenStorage.getSessionEpoch();
  if (Platform.OS !== 'android' && Platform.OS !== 'ios')
    throw new Error('Use o aplicativo Android ou iOS para receber notificações.');
  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId)
    throw new Error(
      'Os avisos de pedidos ainda não estão disponíveis nesta versão. Você pode ativar os alertas locais de chegada separadamente.',
    );
  const Notifications = await loadNotifications();
  if (!Notifications) {
    // reativação silenciosa (ao abrir o app) não mostra erro; o pedido do usuário mostra
    if (askPermission) throw new Error(EXPO_GO_MESSAGE);
    return;
  }
  if (askPermission) await permit();
  else if (!(await Notifications.getPermissionsAsync()).granted) return;
  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  if (captured !== revision || epoch !== tokenStorage.getSessionEpoch() || !(await current(userId)))
    throw new Error('A sessão mudou. Tente novamente.');
  await pushBindings.enable(userId, token.data, Platform.OS);
  await refreshNotificationState(userId);
  try {
    await pushBindings.flush();
    await refreshNotificationState(userId);
  } catch {
    update({ message: 'Registro pendente. Será tentado novamente ao recuperar a conexão.' });
  }
}
export async function disablePushAlerts(userId: string) {
  revision++;
  await pushBindings.disable();
  await refreshNotificationState(userId);
  void pushBindings.flush().catch(() => undefined);
}
export async function refreshNotificationState(userId: string | null) {
  if (userId && !(await current(userId))) return;
  const value = await pushBindings.snapshot();
  const prefs = userId ? await preferences(userId) : { arrivals: false };
  if (!userId && value.binding && (await current(value.binding.userId))) return;
  update({
    userId,
    arrivals: prefs.arrivals,
    push: !!userId && value.binding?.userId === userId,
    registered: !!userId && value.binding?.userId === userId && value.binding.registered,
    pending: value.revocations.length,
    message: null,
  });
}
export async function reconcileNotifications(userId: string | null) {
  if (state.userId !== userId) revision++;
  try {
    await pushBindings.reconcile(userId);
    await refreshNotificationState(userId);
  } catch {
    await refreshNotificationState(userId);
    update({ message: 'Não foi possível sincronizar o registro de notificações. Tentaremos novamente.' });
  }
}
export async function stopSessionNotifications() {
  revision++;
  suppressedEpoch = tokenStorage.getSessionEpoch();
  await pushBindings.disable();
  const Notifications = await loadNotifications();
  if (Platform.OS !== 'web' && Notifications)
    await Promise.allSettled([Notifications.dismissAllNotificationsAsync(), clearArrivalAlerts()]);
  await refreshNotificationState(null);
  void pushBindings.flush().catch(() => undefined);
}
export async function clearArrivalAlerts(userId?: string) {
  const Notifications = await loadNotifications();
  if (!Notifications) return;
  const prefix = userId ? `arrival:${userId}:` : 'arrival:';
  for (const notification of await Notifications.getAllScheduledNotificationsAsync())
    if (notification.identifier.startsWith(prefix))
      await Notifications.cancelScheduledNotificationAsync(notification.identifier);
  for (const notification of await Notifications.getPresentedNotificationsAsync())
    if (notification.request.identifier.startsWith(prefix))
      await Notifications.dismissNotificationAsync(notification.request.identifier);
}
/** Executa antes da chamada HTTP de GPS: funciona mesmo quando o envio falha por falta de rede. */
export async function processArrival(userId: string, fix: PositionFix) {
  const captured = revision;
  if (!usableFix(fix, Date.now()) || Date.now() - fix.timestamp > 30_000) return;
  if (!(await current(userId)) || !(await preferences(userId)).arrivals || (await courierStorage.isBlocked(userId)))
    return;
  const Notifications = await loadNotifications();
  if (!Notifications) return;
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted && permission.ios?.status !== Notifications.IosAuthorizationStatus.PROVISIONAL) return;
  const pending = await courierStorage.pending(userId);
  const rows = await courierStorage.list(userId);
  const ids = trackingTargets(
    rows,
    pending.map((p) => p.deliveryId),
  );
  for (const delivery of rows.filter((d) => ids.includes(d.id))) {
    if (captured !== revision || !(await current(userId))) return;
    const claim = await courierStorage.recordArrival(
      userId,
      delivery.id,
      fix.timestamp,
      nearDestination(fix, delivery.address, Date.now()),
      Date.now(),
      Crypto.randomUUID(),
    );
    if (!claim) continue;
    try {
      const stillPending = await courierStorage.pending(userId),
        latest = await courierStorage.get(userId, delivery.id);
      if (
        captured !== revision ||
        !(await current(userId)) ||
        !latest ||
        !trackingTargets(
          [latest],
          stillPending.map((p) => p.deliveryId),
        ).length ||
        (await courierStorage.isBlocked(userId))
      ) {
        await courierStorage.finishArrival(claim, false, Date.now());
        continue;
      }
      await channels();
      if (
        captured !== revision ||
        !(await current(userId)) ||
        (await courierStorage.pending(userId)).some((p) => p.deliveryId === delivery.id)
      ) {
        await courierStorage.finishArrival(claim, false, Date.now());
        continue;
      }
      const identifier = `arrival:${userId}:${delivery.id}`;
      await Notifications.scheduleNotificationAsync({
        identifier,
        content: {
          title: 'Chegada ao destino',
          body: 'Você chegou ao destino. O pedido foi entregue?',
          data: {
            version: 1,
            eventId: claim.eventId,
            userId,
            deliveryId: delivery.id,
            orderId: delivery.orderId,
            type: 'ARRIVAL',
          },
        },
        trigger: Platform.OS === 'android' ? { channelId: 'deliveries' } : null,
      });
      if (
        captured !== revision ||
        !(await current(userId)) ||
        (await courierStorage.pending(userId)).some((p) => p.deliveryId === delivery.id)
      ) {
        await Promise.allSettled([
          Notifications.cancelScheduledNotificationAsync(identifier),
          Notifications.dismissNotificationAsync(identifier),
        ]);
        await courierStorage.finishArrival(claim, false, Date.now());
        continue;
      }
      await courierStorage.finishArrival(claim, true, Date.now());
    } catch {
      await courierStorage.finishArrival(claim, false, Date.now());
    }
  }
}

export async function reconcileArrivalAlerts(userId: string) {
  const Notifications = await loadNotifications();
  if (!Notifications) return;
  const pending = await courierStorage.pending(userId),
    rows = await courierStorage.list(userId);
  const ids = (await courierStorage.isBlocked(userId))
    ? []
    : trackingTargets(
        rows,
        pending.map((p) => p.deliveryId),
      );
  const prefix = `arrival:${userId}:`;
  for (const item of await Notifications.getAllScheduledNotificationsAsync())
    if (item.identifier.startsWith(prefix) && !ids.includes(item.identifier.slice(prefix.length)))
      await Notifications.cancelScheduledNotificationAsync(item.identifier);
  for (const item of await Notifications.getPresentedNotificationsAsync())
    if (item.request.identifier.startsWith(prefix) && !ids.includes(item.request.identifier.slice(prefix.length)))
      await Notifications.dismissNotificationAsync(item.request.identifier);
}

// Em foreground, recusa payload de outra conta e apresentações repetidas do mesmo evento.
function registerForegroundHandler(Notifications: typeof NotificationsModule) {
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const p = parseDeliveryNotification(notification.request.content.data);
    let show = false;
    try {
      show = !!p && (await current(p.userId));
      if (show && p?.type === 'ARRIVAL') {
        const delivery = await courierStorage.get(p.userId, p.deliveryId),
          pending = await courierStorage.pending(p.userId);
        show =
          (await preferences(p.userId)).arrivals &&
          !(await courierStorage.isBlocked(p.userId)) &&
          !!delivery &&
          trackingTargets(
            [delivery],
            pending.map((row) => row.deliveryId),
          ).length > 0;
      }
      show = show && !!p && (await courierStorage.claimNotification(p.userId, p.eventId, 'seen'));
    } catch {
      show = false;
    }
    return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: show, shouldSetBadge: false };
  },
});
}

// carrega já na abertura para registrar o handler acima (no Expo Go, só devolve null)
void loadNotifications();
