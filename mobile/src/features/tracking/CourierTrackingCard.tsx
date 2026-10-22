import { useState, useSyncExternalStore } from 'react';
import { Alert, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { useAuth } from '../../contexts/AuthContext';
import { courierStyles as styles } from '../courier/components';
import { enableCourierTracking, stopCourierTracking, subscribeTracking, trackingSnapshot, type TrackingMode } from './nativeTracking';

export function CourierTrackingCard() {
  const { user } = useAuth();
  const state = useSyncExternalStore(subscribeTracking, trackingSnapshot);
  const [busy, setBusy] = useState(false);
  async function enable(mode: TrackingMode) {
    if (!user || busy) return;
    setBusy(true);
    try { await enableCourierTracking(user.id, mode); }
    catch (error) { Alert.alert('Localização', error instanceof Error ? error.message : 'Não foi possível ativar.'); }
    finally { setBusy(false); }
  }
  function background() {
    Alert.alert('Localização em segundo plano', 'Durante entregas em andamento, sua posição será compartilhada com os clientes mesmo com a tela bloqueada. Na próxima tela, permita o acesso em segundo plano.', [
      { text: 'Voltar', style: 'cancel' }, { text: 'Continuar', onPress: () => void enable('background') },
    ]);
  }
  return <View style={styles.card}>
    <Text style={styles.title}>Compartilhamento de localização</Text>
    <Text style={styles.text}>{state.collecting ? `Ativo para ${state.targets} entrega(s).` : state.mode ? 'Aguardando entrega em andamento ou permissão.' : 'Desativado.'}</Text>
    <Text style={styles.muted}>Sua localização é compartilhada somente durante entregas em andamento. Concluir uma entrega encerra o compartilhamento dela.</Text>
    {state.mode ? <Text style={styles.muted}>{state.mode === 'background' ? 'Com suporte a segundo plano e tela bloqueada.' : 'Somente enquanto o aplicativo estiver aberto.'}</Text> : null}
    {state.message ? <Text accessibilityRole="alert" style={styles.text}>{state.message}</Text> : null}
    <Button title="Ativar com app aberto" variant="outline" disabled={busy} onPress={() => void enable('foreground')} />
    <Button title="Permitir também em segundo plano" variant="outline" disabled={busy} onPress={background} />
    {state.mode ? <Button title="Desativar localização" variant="outline" disabled={busy} onPress={() => {
      setBusy(true); void stopCourierTracking().catch(() => Alert.alert('Localização', 'Não foi possível desativar. Tente novamente.')).finally(() => setBusy(false));
    }} /> : null}
  </View>;
}
