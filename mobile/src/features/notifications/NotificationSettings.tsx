import { useState, useSyncExternalStore } from 'react';
import { Alert, Text, View } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/Button';
import { courierStyles as styles } from '../courier/components';
import {
  subscribeNotifications,
  notificationSnapshot,
  enableArrivalAlerts,
  enablePushAlerts,
  disablePushAlerts,
} from './nativeNotifications';

export function NotificationSettings() {
  const { user } = useAuth();
  const snapshot = useSyncExternalStore(subscribeNotifications, notificationSnapshot);
  const [busy, setBusy] = useState(false);
  if (!user || !['COURIER', 'CUSTOMER'].includes(user.role)) return null;
  const state =
    snapshot.userId === user.id
      ? snapshot
      : { arrivals: false, push: false, registered: false, pending: 0, message: null };
  async function action(task: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await task();
    } catch (error) {
      Alert.alert('Notificações', error instanceof Error ? error.message : 'Não foi possível atualizar os avisos.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Notificações</Text>
      {user.role === 'COURIER' ? (
        <>
          <Text style={styles.muted}>
            Chegada ao destino: {state.arrivals ? 'ativada' : 'desativada'}. Usa o GPS durante entregas e pede sua
            confirmação.
          </Text>
          <Button
            title={state.arrivals ? 'Desativar alertas de chegada' : 'Ativar alertas de chegada'}
            variant="outline"
            disabled={busy}
            onPress={() => void action(() => enableArrivalAlerts(user.id, !state.arrivals))}
          />
        </>
      ) : null}
      <Text style={styles.muted}>
        Avisos de pedidos:{' '}
        {state.push ? (state.registered ? 'dispositivo registrado' : 'registro pendente') : 'desativados'}.
      </Text>
      <Button
        title={state.push ? 'Desativar avisos de pedidos' : 'Ativar avisos de pedidos'}
        variant="outline"
        disabled={busy}
        onPress={() => void action(() => (state.push ? disablePushAlerts(user.id) : enablePushAlerts(user.id)))}
      />
      {state.pending ? <Text style={styles.muted}>Há desvinculação pendente de conexão.</Text> : null}
      {state.message ? (
        <Text accessibilityRole="alert" style={styles.text}>
          {state.message}
        </Text>
      ) : null}
    </View>
  );
}
