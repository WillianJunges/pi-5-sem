import * as Crypto from 'expo-crypto';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import * as TaskManager from 'expo-task-manager';
import { AppState, Platform } from 'react-native';
import { api } from '../../services/api';
import type { Delivery } from '../../services/deliveries.service';
import { tokenStorage } from '../../services/tokenStorage';
import { accessTokenUserId } from '../../services/sessionTokens';
import { courierStorage } from '../courier/offline/nativeStorage';
import { courierAccessChanges } from '../courier/offline/accessChanges';
import { processArrival,reconcileArrivalAlerts,clearArrivalAlerts } from '../notifications/nativeNotifications';
import { PositionSender, trackingTargets, type PositionFix } from './policy';

const TASK = 'courier-active-delivery-location-v1';
const SETTINGS = 'courier.tracking.settings';
export type TrackingMode = 'foreground' | 'background';
interface Settings { userId: string; mode: TrackingMode }
export interface NativeTrackingState { mode: TrackingMode | null; collecting: boolean; targets: number; message: string | null }
let state: NativeTrackingState = { mode: null, collecting: false, targets: 0, message: null };
let watcher: Location.LocationSubscription | null = null;
let chain = Promise.resolve();
// Revogação síncrona bloqueia callbacks enquanto a fila de chamadas nativas ainda termina.
let authorizationRevision = 0;
let stopped = false;
const listeners = new Set<() => void>();
export const subscribeTracking = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const trackingSnapshot = () => state;
function update(patch: Partial<NativeTrackingState>) { state = { ...state, ...patch }; for (const listener of listeners) listener(); }
function serial<T>(task: () => Promise<T>): Promise<T> { const result = chain.then(task); chain = result.then(() => undefined, () => undefined); return result; }
async function settings(): Promise<Settings | null> {
  const raw = await SecureStore.getItemAsync(SETTINGS);
  if (!raw) return null;
  try { const value = JSON.parse(raw) as Settings;
    return typeof value.userId === 'string' && ['foreground', 'background'].includes(value.mode) ? value : null;
  } catch { return null; }
}
async function session(userId: string) {
  const tokens = await tokenStorage.get();
  return !!tokens && accessTokenUserId(tokens.accessToken) === userId;
}
async function targets(userId: string): Promise<string[]> {
  const revision = authorizationRevision;
  if (stopped) return [];
  const config = await settings();
  if (config?.userId !== userId || !await session(userId) || await courierStorage.isBlocked(userId)) return [];
  if (config.mode === 'foreground' && AppState.currentState !== 'active' && AppState.currentState !== null) return [];
  const rows = await courierStorage.list(userId);
  const pending = await courierStorage.pending(userId);
  if (stopped || revision !== authorizationRevision || !await session(userId)) return [];
  return trackingTargets(rows, pending.map(item => item.deliveryId));
}
let sender: { userId: string; sender: PositionSender } | null = null;
async function receive(locations: Location.LocationObject[]) {
  try {
    const config = await settings();
    if (!config) { await reconcileTracking(); return; }
    const latest = locations.reduce<Location.LocationObject | null>((a, b) => !a || b.timestamp > a.timestamp ? b : a, null);
    if (!latest) return;
    if (sender?.userId !== config.userId) sender = { userId: config.userId, sender: new PositionSender(
      () => targets(config.userId),
      async (id, body) => {
        const epoch = tokenStorage.getSessionEpoch();
        try { return await api(`/deliveries/${id}/location`, { method: 'POST', body, expectedUserId: config.userId }); }
        catch (error) {
          const status = (error as { status?: number })?.status;
          if (status === 403 || status === 404) await courierAccessChanges.reject({ userId: config.userId, deliveryId: id, status });
          if (status === 401 && epoch === tokenStorage.getSessionEpoch() && (await settings())?.userId === config.userId) {
            await SecureStore.deleteItemAsync(SETTINGS);
          }
          if (status === 403) await courierStorage.block(config.userId, true);
          if (status === 404) await courierStorage.revoke(config.userId, id);
          if (status === 409) {
            const delivery = await api<Delivery>(`/deliveries/${id}`, { expectedUserId: config.userId });
            await courierStorage.save(config.userId, [delivery]);
          }
          throw error;
        }
      },
      () => Crypto.randomUUID(),
    ) };
    const fix: PositionFix = { ...latest.coords, timestamp: latest.timestamp, mocked: latest.mocked };
    // Proximidade é local: falha de rede ou notificação não interrompe o compartilhamento GPS.
    try{await processArrival(config.userId,fix);}catch{/* Permissão/armazenamento serão conferidos na próxima coleta. */}
    const count = await sender.sender.update(fix);
    if (count) update({ message: null });
    if (!(await targets(config.userId)).length) await reconcileTracking();
  } catch {
    update({ message: 'Não foi possível atualizar a localização. Confira a conexão e as permissões.' });
    void reconcileTracking().catch(() => undefined);
  }
}

// Global: o sistema deve encontrar a tarefa mesmo sem uma tela React montada.
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TASK, async ({ data, error }) => {
  if (error) { update({ message: 'A localização foi interrompida pelo aparelho. Abra o app para conferir.' }); return; }
  if (data?.locations) await receive(data.locations);
});
async function stopCollectors() {
  watcher?.remove(); watcher = null;
  if (Platform.OS !== 'web' && await Location.hasStartedLocationUpdatesAsync(TASK)) await Location.stopLocationUpdatesAsync(TASK);
}
export function stopCourierTracking(): Promise<void> {
  stopped = true; authorizationRevision++;
  return serial(async () => {
    // Retira a autorização antes de aguardar chamadas nativas: callbacks em trânsito não enviam.
    await SecureStore.deleteItemAsync(SETTINGS);
    sender = null;
    await stopCollectors();
    await clearArrivalAlerts().catch(()=>undefined);
    update({ mode: null, collecting: false, targets: 0, message: null });
  });
}
export function reconcileTracking(): Promise<void> {
  return serial(async () => {
    let config = await settings();
    if (config && !await session(config.userId)) {
      await SecureStore.deleteItemAsync(SETTINGS); config = null; sender = null; authorizationRevision++;
    }
    const ids = config ? await targets(config.userId) : [];
    if(config)await reconcileArrivalAlerts(config.userId).catch(()=>undefined);
    if (!config || !ids.length) {
      await stopCollectors();
      update({ mode: config?.mode ?? null, collecting: false, targets: 0 });
      return;
    }
    const foreground = (await Location.getForegroundPermissionsAsync()).granted;
    const services = await Location.hasServicesEnabledAsync();
    if (!foreground || !services) {
      await stopCollectors();
      update({ mode: config.mode, collecting: false, targets: ids.length, message: 'Ative o GPS e permita a localização nas configurações do aparelho.' });
      return;
    }
    if (config.mode === 'background') {
      watcher?.remove(); watcher = null;
      if (!(await Location.getBackgroundPermissionsAsync()).granted || !await TaskManager.isAvailableAsync()) {
        await stopCollectors();
        update({ mode: config.mode, collecting: false, targets: ids.length, message: 'Permita localização em segundo plano e use uma versão instalada com suporte a esse recurso.' });
        return;
      }
      if (!await Location.hasStartedLocationUpdatesAsync(TASK)) await Location.startLocationUpdatesAsync(TASK, {
        accuracy: Location.Accuracy.High, distanceInterval: 15, timeInterval: 10_000,
        deferredUpdatesInterval: 10_000, pausesUpdatesAutomatically: false, showsBackgroundLocationIndicator: true,
        foregroundService: { notificationTitle: 'Entrega em andamento', notificationBody: 'Compartilhando sua localização durante as entregas.', killServiceOnDestroy: true },
      });
      update({ mode: config.mode, collecting: true, targets: ids.length, message: null });
    } else {
      if (await Location.hasStartedLocationUpdatesAsync(TASK)) await Location.stopLocationUpdatesAsync(TASK);
      if (AppState.currentState !== 'active' && AppState.currentState !== null) { watcher?.remove(); watcher = null; }
      else if (!watcher) watcher = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: 15, timeInterval: 10_000 },
        location => void receive([location]), () => update({ message: 'GPS indisponível. Confira as permissões e tente novamente.' }));
      update({ mode: config.mode, collecting: !!watcher, targets: ids.length, message: null });
    }
  });
}
export async function enableCourierTracking(userId: string, mode: TrackingMode): Promise<void> {
  if (Platform.OS === 'web') throw new Error('Use o aplicativo Android ou iOS para compartilhar a localização.');
  const epoch = tokenStorage.getSessionEpoch();
  const consentRevision = authorizationRevision;
  if (!(await Location.requestForegroundPermissionsAsync()).granted) throw new Error('Permissão de localização não concedida. Você pode habilitá-la nas configurações.');
  if (mode === 'background') {
    if (!await TaskManager.isAvailableAsync()) throw new Error('O segundo plano exige uma versão instalada com suporte a localização.');
    if (!(await Location.requestBackgroundPermissionsAsync()).granted) throw new Error('Permita localização em segundo plano nas configurações do aparelho.');
    // Migra também uma sessão criada antes desta etapa para acesso seguro com a tela bloqueada.
    const tokens = await tokenStorage.get();
    if (!tokens || !await tokenStorage.replaceIfCurrent(tokens, tokens)) throw new Error('A sessão mudou. Entre novamente.');
  }
  await serial(async () => {
    const stillAllowed = async () => epoch === tokenStorage.getSessionEpoch() && consentRevision === authorizationRevision && await session(userId);
    if (!await stillAllowed()) throw new Error('A sessão ou a autorização mudou. Tente novamente.');
    await stopCollectors(); sender = null;
    if (!await stillAllowed()) throw new Error('A sessão ou a autorização mudou. Tente novamente.');
    await SecureStore.setItemAsync(SETTINGS, JSON.stringify({ userId, mode }), {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
    if (!await stillAllowed()) { await SecureStore.deleteItemAsync(SETTINGS); throw new Error('A autorização mudou. Tente novamente.'); }
    stopped = false; authorizationRevision++;
  });
  await reconcileTracking();
}
