import * as Clipboard from 'expo-clipboard';
import * as Crypto from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Button } from '../../../../src/components/Button';
import { EmptyState } from '../../../../src/components/EmptyState';
import { useAuth } from '../../../../src/contexts/AuthContext';
import { CourierErrorNotice, courierStyles as styles, DeliveryBadge } from '../../../../src/features/courier/components';
import { DeliveryDetailsModel } from '../../../../src/features/courier/models';
import { canCompleteDelivery, canStartDelivery, deliveryInstruction, formatDeliveryAddress, isDeliveryActive } from '../../../../src/features/courier/presentation';
import { useCourierRefresh } from '../../../../src/features/courier/useCourierRefresh';
import { useCourierOffline } from '../../../../src/features/courier/offline/CourierOfflineProvider';
import { orderStatusLabel, PAYMENT_LABEL } from '../../../../src/services/orders.service';
import { colors } from '../../../../src/theme';
import { getErrorMessage } from '../../../../src/utils/errors';
import { formatCurrency } from '../../../../src/utils/format';
import { CourierTrackingCard } from '../../../../src/features/tracking/CourierTrackingCard';

function Details({ id }: { id: string }) {
  const service = useCourierOffline();
  const [model] = useState(() => new DeliveryDetailsModel(service, id, () => ({
    operationId: Crypto.randomUUID(), completedAt: new Date().toISOString(),
  })));
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot);
  useEffect(() => service.subscribeLocal(() => void model.refreshLocal()), [service, model]);
  const [copying, setCopying] = useState(false);
  useCourierRefresh(() => model.reload(), () => model.cancelReads(), !!state.delivery && isDeliveryActive(state.delivery));

  const delivery = state.delivery;
  if (!delivery) {
    return state.error ? <View style={[styles.flex, styles.content]}>
      <CourierErrorNotice error={state.error} onRetry={() => void model.reload()} disabled={state.loading} />
      <Button title="Voltar às entregas" variant="outline" onPress={() => router.replace('/courier')} />
    </View> : <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  const address = formatDeliveryAddress(delivery.address);
  const startDisabled = state.stale || state.loading || state.busy !== null;

  async function copyAddress() {
    if (copying) return;
    setCopying(true);
    try {
      const copied = await Clipboard.setStringAsync(address);
      if (!copied) { Alert.alert('Não foi possível copiar', 'Você pode selecionar o endereço e copiá-lo manualmente.'); return; }
      Alert.alert('Endereço copiado', 'Cole o endereço no aplicativo de navegação de sua preferência.');
    } catch (error) { Alert.alert('Não foi possível copiar', getErrorMessage(error)); }
    finally { setCopying(false); }
  }

  function confirmStart() {
    Alert.alert('Iniciar entrega?', 'Confirme ao sair da marmitaria com o pedido.', [
      { text: 'Voltar', style: 'cancel' },
      { text: 'Iniciar entrega', onPress: () => void model.start() },
    ]);
  }
  function confirmCompletion() {
    Alert.alert('O pedido foi entregue?', 'Confirme somente depois de entregar o pedido ao cliente. Sem conexão, a confirmação ficará salva para sincronizar depois.', [
      { text: 'Voltar', style: 'cancel' },
      { text: 'Sim, concluir entrega', onPress: () => void model.complete() },
    ]);
  }

  return <ScrollView
    style={styles.flex}
    contentContainerStyle={styles.content}
    refreshControl={<RefreshControl refreshing={state.loading} onRefresh={() => void model.reload()} tintColor={colors.primary} enabled={!state.busy} />}
  >
    <View style={styles.card}>
      <DeliveryBadge delivery={delivery} />
      <Text style={styles.title}>Pedido #{delivery.orderId.slice(0, 8).toUpperCase()}</Text>
      <Text style={styles.text}>{deliveryInstruction(delivery)}</Text>
      <Text style={styles.muted}>Pedido: {orderStatusLabel(delivery.orderStatus)}</Text>
    </View>

    {state.error ? <CourierErrorNotice error={state.error} stale={state.stale} onRetry={() => void model.reload()} disabled={!!state.busy || state.loading} /> : null}
    {state.pendingCompletion ? <View style={styles.card} accessibilityRole="alert">
      <Text style={styles.text}>{delivery.localCompletion?.message ?? 'A conclusão está salva neste aparelho. A marmitaria será atualizada após a sincronização.'}</Text>
      <Button title="Ver pendências" variant="outline" onPress={() => router.push('/courier/pending')} />
    </View> : null}

    <View style={styles.card}>
      <Text style={styles.title}>Cliente</Text>
      <Text style={styles.text}>{delivery.customer.name}</Text>
      {delivery.customer.phone ? <Text selectable style={styles.text}>{delivery.customer.phone}</Text> : null}
    </View>
    <View style={styles.card}>
      <Text style={styles.title}>Endereço da entrega</Text>
      {delivery.address.label ? <Text style={styles.muted}>{delivery.address.label}</Text> : null}
      <Text selectable style={styles.text}>{address}</Text>
      <Button title="Copiar endereço" variant="outline" loading={copying} onPress={() => void copyAddress()} />
    </View>
    {delivery.notes ? <View style={styles.card}>
      <Text style={styles.title}>Observações do cliente</Text>
      <Text selectable style={styles.text}>{delivery.notes}</Text>
    </View> : null}
    {canCompleteDelivery(delivery) ? <CourierTrackingCard /> : null}
    <View style={styles.card}>
      <Text style={styles.title}>Pagamento na entrega</Text>
      <Text style={styles.text}>{PAYMENT_LABEL[delivery.paymentMethod]} · {formatCurrency(delivery.total)}</Text>
      {delivery.changeFor !== null ? <Text style={styles.text}>
        Troco para {formatCurrency(delivery.changeFor)}: levar {formatCurrency(delivery.changeFor - delivery.total)}.
      </Text> : null}
    </View>

    {canStartDelivery(delivery) ? <Button title="Iniciar entrega" disabled={startDisabled} loading={state.busy === 'start'} onPress={confirmStart} /> : null}
    {canCompleteDelivery(delivery) ? <Button title="Concluir entrega" disabled={state.busy !== null} loading={state.busy === 'complete'} onPress={confirmCompletion} /> : null}
    {isDeliveryActive(delivery) ? <Text style={styles.muted}>O início exige conexão. A conclusão pode ser salva neste aparelho e sincronizada depois.</Text> : null}
    {delivery.fromCache ? <Text style={styles.muted}>Exibindo dados salvos neste aparelho.</Text> : null}
    {delivery.startedAt ? <Text style={styles.muted}>Iniciada em {new Date(delivery.startedAt).toLocaleString('pt-BR')}</Text> : null}
    {delivery.completedAt ? <Text style={styles.muted}>Concluída em {new Date(delivery.completedAt).toLocaleString('pt-BR')}</Text> : null}
    {delivery.cancelledAt ? <Text style={styles.muted}>Cancelada em {new Date(delivery.cancelledAt).toLocaleString('pt-BR')}</Text> : null}
  </ScrollView>;
}

export default function CourierDeliveryScreen() {
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const { user } = useAuth();
  if (user?.role !== 'COURIER') return null;
  if (typeof id !== 'string' || !id) return <EmptyState icon="⚠️" title="Entrega não encontrada" />;
  // Remontar ao trocar usuário/entrega impede reaproveitar uma tentativa da sessão anterior.
  return <Details key={`${user.id}:${id}`} id={id} />;
}
