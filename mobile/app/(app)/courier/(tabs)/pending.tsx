import { router } from 'expo-router';
import { useSyncExternalStore } from 'react';
import { ActivityIndicator, Alert, FlatList, Text, View } from 'react-native';
import { Button } from '../../../../src/components/Button';
import { EmptyState } from '../../../../src/components/EmptyState';
import { CourierErrorNotice, courierStyles as styles } from '../../../../src/features/courier/components';
import { useCourierOffline } from '../../../../src/features/courier/offline/CourierOfflineProvider';
import { colors } from '../../../../src/theme';

/** Pendências não dependem de um endereço ainda autorizado: conflitos mostram só a referência. */
export default function CourierPending() {
  const service = useCourierOffline();
  const state = useSyncExternalStore(service.subscribe, service.getSnapshot);
  if (!state.ready && !state.error) return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;

  function review(id: string) {
    Alert.alert('Tentar confirmar novamente?', 'A confirmação será reenviada à marmitaria. Em caso de cancelamento ou troca de motoboy, confira a situação com a proprietária.', [
      { text: 'Voltar', style: 'cancel' },
      { text: 'Tentar novamente', onPress: () => void service.retry(id).catch(() => undefined) },
    ]);
  }

  return <FlatList style={styles.flex} contentContainerStyle={[styles.content, { flexGrow: 1 }]}
    data={state.pending} keyExtractor={item => item.deliveryId}
    ListHeaderComponent={<View style={styles.content}>
      <Text style={styles.text}>Estas confirmações ficam salvas neste aparelho até a marmitaria confirmá-las.</Text>
      <Text style={styles.muted}>{state.online ? 'A sincronização acontece com o aplicativo aberto.' : 'Sem conexão. As pendências serão preservadas.'}</Text>
      {state.error ? <CourierErrorNotice error={state.error} onRetry={() => void service.sync(true)} disabled={state.syncing} /> : null}
      <Button title="Sincronizar pendentes" variant="outline" loading={state.syncing} disabled={!state.online}
        onPress={() => void service.retry().catch(() => undefined)} />
    </View>}
    ListEmptyComponent={<EmptyState icon="✓" title="Nenhuma confirmação pendente" message="As entregas confirmadas aparecem no histórico." />}
    renderItem={({ item }) => <View style={styles.card}>
      <Text style={styles.title}>Pedido #{item.orderId.slice(0, 8).toUpperCase()}</Text>
      <Text style={styles.text}>{item.status === 'conflict' ? 'Confirmação precisa de revisão' : 'Concluída neste aparelho — aguardando sincronização'}</Text>
      <Text style={styles.muted}>Registrada em {new Date(item.completedAt).toLocaleString('pt-BR')}</Text>
      {item.message ? <Text style={styles.text}>{item.message}</Text> : null}
      <Button title="Consultar entrega" variant="outline" onPress={() => router.push(`/courier/delivery/${item.deliveryId}`)} />
      {item.status === 'conflict' ? <Button title="Revisar e tentar novamente" disabled={state.syncing || !state.online} onPress={() => review(item.deliveryId)} /> : null}
    </View>}
  />;
}
