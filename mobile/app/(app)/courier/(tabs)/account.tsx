import { router } from 'expo-router';
import { useState, useSyncExternalStore } from 'react';
import { Alert, Pressable, ScrollView, Text } from 'react-native';
import { Button } from '../../../../src/components/Button';
import { useAuth } from '../../../../src/contexts/AuthContext';
import { courierStyles as styles } from '../../../../src/features/courier/components';
import { getErrorMessage } from '../../../../src/utils/errors';
import { useCourierOffline } from '../../../../src/features/courier/offline/CourierOfflineProvider';
import { CourierTrackingCard } from '../../../../src/features/tracking/CourierTrackingCard';
import { NotificationSettings } from '../../../../src/features/notifications/NotificationSettings';

export default function CourierAccount() {
  const { user, signOut } = useAuth();
  const [leaving, setLeaving] = useState(false);
  const service = useCourierOffline();
  const sync = useSyncExternalStore(service.subscribe, service.getSnapshot);
  if (!user) return null;

  async function leave() {
    if (leaving) return;
    setLeaving(true);
    try { await signOut(); }
    catch (error) { Alert.alert('Não foi possível sair', getErrorMessage(error)); }
    finally { setLeaving(false); }
  }

  return <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
    <Text style={styles.title}>{user.name}</Text>
    <Text style={styles.text}>{user.email}</Text>
    <Text style={styles.muted}>Motoboy</Text>
    <CourierTrackingCard />
    <NotificationSettings />
    <Pressable accessibilityRole="button" onPress={() => router.push('/profile')} style={styles.card}>
      <Text style={styles.link}>Meu perfil ›</Text>
    </Pressable>
    {sync.pending.length ? <Text style={styles.text}>Você tem {sync.pending.length} confirmação(ões) pendente(s) neste aparelho.</Text> : null}
    <Button title="Sair" variant="outline" onPress={() => {
      if (!sync.pending.length) { void leave(); return; }
      Alert.alert('Sair com confirmações pendentes?', 'Elas continuarão salvas neste aparelho e só serão sincronizadas quando você entrar novamente nesta conta.', [
        { text: 'Voltar', style: 'cancel' }, { text: 'Sair', onPress: () => void leave() },
      ]);
    }} loading={leaving} />
  </ScrollView>;
}
