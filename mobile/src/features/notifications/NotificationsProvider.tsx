import * as Notifications from 'expo-notifications';
import NetInfo from '@react-native-community/netinfo';
import { router, useRootNavigationState } from 'expo-router';
import { type ReactNode, useEffect } from 'react';
import { Alert, AppState } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../services/api';
import type { Delivery } from '../../services/deliveries.service';
import { tokenStorage } from '../../services/tokenStorage';
import { courierStorage } from '../courier/offline/nativeStorage';
import { courierAccessChanges } from '../courier/offline/accessChanges';
import { parseDeliveryNotification, notificationForUser } from './payload';
import { reconcileNotifications, enablePushAlerts, pushBindings } from './nativeNotifications';
import { notificationRefresh } from './refreshEvents';
import { NotificationOpener } from './openNotification';

/** A sessão e a entrega são relidas; conteúdo da notificação nunca autoriza uma ação. */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const navigation = useRootNavigationState();
  useEffect(() => {
    if (loading) return;
    let active = true;
    const sync = () => {
      if (AppState.currentState === 'active' || AppState.currentState === null)
        void reconcileNotifications(user?.id ?? null).catch(() => undefined);
    };
    sync();
    const online = NetInfo.addEventListener(sync);
    const app = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        sync();
        void refreshToken();
      }
    });
    async function refreshToken() {
      if (!user) return;
      const value = await pushBindings.snapshot();
      if (active && value.binding?.userId === user.id) await enablePushAlerts(user.id, false).catch(() => undefined);
    }
    void refreshToken();
    const token = Notifications.addPushTokenListener(() => {
      void refreshToken();
    });
    const received = Notifications.addNotificationReceivedListener((notification) => {
      const p = parseDeliveryNotification(notification.request.content.data);
      if (active && user && p && notificationForUser(p, user)) notificationRefresh.request(user.id);
    });
    const timer = setInterval(sync, 30_000);
    return () => {
      active = false;
      clearInterval(timer);
      online();
      app.remove();
      token.remove();
      received.remove();
    };
  }, [user?.id, loading]);

  useEffect(() => {
    if (!user || loading || !navigation?.key) return;
    const account = user;
    let active = true;
    const epoch = tokenStorage.getSessionEpoch();
    const current = () => active && epoch === tokenStorage.getSessionEpoch();
    const opener = new NotificationOpener({
      user: account,
      current,
      get: (id) => api<Delivery>(`/deliveries/${id}`, { expectedUserId: account.id }),
      offlineArrival: async (id) => {
        if (await courierStorage.isBlocked(account.id)) return null;
        const cached = await courierStorage.get(account.id, id);
        return cached?.status === 'IN_PROGRESS' &&
          cached.orderStatus === 'OUT_FOR_DELIVERY' &&
          !(await courierStorage.pending(account.id)).some((row) => row.deliveryId === id)
          ? cached
          : null;
      },
      rejected: (deliveryId, status) => courierAccessChanges.reject({ userId: account.id, deliveryId, status }),
      claim: (eventId) => courierStorage.claimNotification(account.id, eventId, 'opened'),
      navigate: (delivery) => {
        if (account.role === 'COURIER') router.push(`/courier/delivery/${delivery.id}`);
        else router.push(`/customer/order/${delivery.orderId}`);
      },
    });
    async function open(response: Notifications.NotificationResponse) {
      if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      try {
        await opener.open(response.notification.request.content.data);
      } catch {
        if (current())
          Alert.alert(
            'Aviso de entrega',
            'Não foi possível abrir esta entrega. Confira a conexão e atualize sua lista.',
          );
      }
    }
    const response = Notifications.addNotificationResponseReceivedListener((value) => {
      void open(value);
    });
    void Notifications.getLastNotificationResponseAsync()
      .then((value) => {
        if (value) void open(value);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      response.remove();
    };
  }, [user?.id, user?.role, loading, navigation?.key]);
  return children;
}
