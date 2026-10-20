import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button } from '../../../../src/components/Button';
import { EmptyState } from '../../../../src/components/EmptyState';
import { TextField } from '../../../../src/components/TextField';
import { addressLine, formatCep } from '../../../../src/services/addresses.service';
import { useOrderPolling } from '../../../../src/hooks/useOrderPolling';
import {
  type Order,
  type OrderStatus,
  orderStatusLabel,
  ordersService,
  PAYMENT_LABEL,
  STORE_PICKUP_ADDRESS,
} from '../../../../src/services/orders.service';
import { colors, spacing } from '../../../../src/theme';
import { getErrorMessage } from '../../../../src/utils/errors';
import { formatCurrency } from '../../../../src/utils/format';

const formatTime = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

type TimelineStep = { status: OrderStatus; label: string; at: (o: Order) => string | null };

/** Passos do pedido, na ordem do escopo (seção 11). O cancelamento aparece à parte. */
const TIMELINE: TimelineStep[] = [
  { status: 'PENDING', label: 'Pedido enviado', at: (o) => o.createdAt },
  { status: 'CONFIRMED', label: 'Confirmado pela marmitaria', at: (o) => o.confirmedAt },
  { status: 'PREPARING', label: 'Em preparo', at: (o) => o.preparingAt },
  { status: 'READY', label: 'Pronto', at: (o) => o.readyAt },
  { status: 'OUT_FOR_DELIVERY', label: 'Saiu para entrega', at: (o) => o.outForDeliveryAt },
  { status: 'DELIVERED', label: 'Entregue', at: (o) => o.deliveredAt },
];

/** Retirada no local: não sai para entrega; a marmitaria marca quando o cliente busca. */
const PICKUP_TIMELINE: TimelineStep[] = [
  ...TIMELINE.slice(0, 3),
  { status: 'READY', label: 'Pronto para retirada', at: (o) => o.readyAt },
  { status: 'DELIVERED', label: 'Retirado', at: (o) => o.deliveredAt },
];

/** Linha do tempo do status: passos já alcançados em destaque, os próximos acinzentados. */
function StatusTimeline({ order }: { order: Order }) {
  const steps = order.fulfillment === 'PICKUP' ? PICKUP_TIMELINE : TIMELINE;
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Acompanhamento</Text>
      {steps.map((step, i) => {
        const at = step.at(order);
        const done = at !== null;
        const last = i === steps.length - 1;
        return (
          <View key={step.status} style={styles.step}>
            <View style={styles.stepMarker}>
              <View style={[styles.dot, done ? styles.dotDone : styles.dotPending]} />
              {!last ? <View style={[styles.stepLine, done && styles.stepLineDone]} /> : null}
            </View>
            <View style={styles.stepBody}>
              <Text style={[styles.stepLabel, !done && styles.stepLabelPending]}>{step.label}</Text>
              {at ? <Text style={styles.muted}>{formatTime(at)}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.text, bold && styles.bold]}>{label}</Text>
      <Text style={[styles.text, bold && styles.bold]}>{value}</Text>
    </View>
  );
}

/**
 * Detalhes do pedido. Aberta logo depois do checkout.
 * Enquanto a marmitaria não confirma (PENDING), o cliente pode cancelar (ponto 9).
 * A linha do tempo do status atualiza sozinha a cada ~60s enquanto a tela está aberta
 * (ponto 8a). O mapa do motoboy em tempo real depende do Socket.IO (ponto 8b, Yuri).
 */
export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  /** Cancelamento: o cartão de confirmação abre ao tocar em "Cancelar pedido". */
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [reason, setReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  /** Horário da última leitura do backend, para o aviso discreto "atualizado às...". */
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      setOrder(await ordersService.get(id));
      setUpdatedAt(new Date());
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, [id]);

  /** Atualização em segundo plano: só troca o pedido; um erro de rede é ignorado até o próximo ciclo. */
  const silentRefresh = useCallback(async () => {
    try {
      setOrder(await ordersService.get(id));
      setUpdatedAt(new Date());
    } catch {
      // sem conexão por um instante: mantém o que está na tela e tenta no próximo ciclo
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCancel() {
    setCancelling(true);
    setCancelError(null);
    try {
      setOrder(await ordersService.cancel(id, reason.trim() || null));
      setConfirmingCancel(false);
    } catch (err) {
      setCancelError(getErrorMessage(err));
      // a marmitaria pode ter confirmado nesse meio-tempo: mostra o status atual
      await load();
    } finally {
      setCancelling(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  // pergunta ao backend a cada ~60s enquanto o pedido não terminou (ponto 8a)
  const stillOpen = order !== null && order.status !== 'DELIVERED' && order.status !== 'CANCELLED';
  useOrderPolling(silentRefresh, stillOpen);

  if (error && !order) {
    return (
      <EmptyState icon="⚠️" title="Não foi possível carregar o pedido" message={error}>
        <Button title="Tentar de novo" onPress={load} />
      </EmptyState>
    );
  }

  if (!order) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const finished = order.status === 'CANCELLED' || order.status === 'DELIVERED';

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
      >
        <View style={styles.header}>
          {order.status === 'PENDING' ? <Text style={styles.icon}>✅</Text> : null}
          <Text style={styles.title}>{order.status === 'PENDING' ? 'Pedido enviado!' : 'Seu pedido'}</Text>
          <Text style={styles.status}>{orderStatusLabel(order.status, order.fulfillment)}</Text>
          <Text style={styles.muted}>
            Pedido #{order.id.slice(0, 8).toUpperCase()} · {formatTime(order.createdAt)}
          </Text>
        </View>

        {order.status === 'CANCELLED' ? (
          <View style={[styles.card, styles.cancelledCard]}>
            <Text style={styles.cardTitle}>Pedido cancelado</Text>
            <Text style={styles.text}>
              {order.cancelledBy === 'CUSTOMER' ? 'Cancelado por você' : 'Cancelado pela marmitaria'}
              {order.cancelledAt ? ` às ${formatTime(order.cancelledAt)}` : ''}.
            </Text>
            {order.cancellationReason ? <Text style={styles.muted}>Motivo: {order.cancellationReason}</Text> : null}
          </View>
        ) : null}

        <StatusTimeline order={order} />

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Itens</Text>
          {order.items.map((item) => (
            <Row
              key={item.id}
              label={`${item.quantity}x ${item.productName} · ${item.variantName}`}
              value={formatCurrency(item.subtotal)}
            />
          ))}
          <View style={styles.divider} />
          <Row label="Subtotal" value={formatCurrency(order.subtotal)} />
          {order.distanceMeters === null ? (
            <Row label="Retirada no local" value="Grátis" />
          ) : (
            <Row
              label={`Entrega (${(order.distanceMeters / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km)`}
              value={formatCurrency(order.deliveryFee)}
            />
          )}
          <Row label="Total" value={formatCurrency(order.total)} bold />
        </View>

        {order.address ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Entrega em</Text>
            <Text style={styles.text}>{addressLine(order.address)}</Text>
            <Text style={styles.muted}>
              {order.address.district} · {order.address.city}/{order.address.state} · {formatCep(order.address.cep)}
            </Text>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Retirar em</Text>
            <Text style={styles.text}>{STORE_PICKUP_ADDRESS.name}</Text>
            <Text style={styles.muted}>{STORE_PICKUP_ADDRESS.line}</Text>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{order.fulfillment === 'PICKUP' ? 'Pagamento na retirada' : 'Pagamento na entrega'}</Text>
          <Text style={styles.text}>{PAYMENT_LABEL[order.paymentMethod]}</Text>
          {order.changeFor !== null ? (
            <Text style={styles.muted}>
              Troco para {formatCurrency(order.changeFor)} (levar {formatCurrency(order.changeFor - order.total)})
            </Text>
          ) : null}
        </View>

        {order.notes ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Observações</Text>
            <Text style={styles.text}>{order.notes}</Text>
          </View>
        ) : null}

        {order.status === 'PENDING' && !confirmingCancel ? (
          <Button title="Cancelar pedido" variant="outline" onPress={() => setConfirmingCancel(true)} />
        ) : null}

        {order.status === 'PENDING' && confirmingCancel ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Cancelar este pedido?</Text>
            <Text style={styles.muted}>
              A marmitaria ainda não confirmou, então dá para cancelar. Depois de confirmado, só pela marmitaria.
            </Text>
            <TextField
              label="Motivo (opcional)"
              value={reason}
              onChangeText={setReason}
              placeholder="Ex.: pedi o endereço errado"
              maxLength={200}
            />
            {cancelError ? <Text style={styles.error}>{cancelError}</Text> : null}
            <Button title="Confirmar cancelamento" onPress={handleCancel} loading={cancelling} />
            <Button
              title="Voltar"
              variant="outline"
              disabled={cancelling}
              onPress={() => {
                setConfirmingCancel(false);
                setCancelError(null);
              }}
            />
          </View>
        ) : null}

        {/* erro de quando o pedido mudou de status enquanto o cliente tentava cancelar */}
        {order.status !== 'PENDING' && cancelError ? <Text style={styles.error}>{cancelError}</Text> : null}

        {updatedAt ? (
        <Text style={[styles.muted, styles.centerText]}>
          Atualizado às {formatTime(updatedAt.toISOString())}
          {!finished ? ' · atualiza sozinho e ao puxar para baixo' : ''}
        </Text>
      ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  container: { padding: spacing.md, gap: spacing.md },
  header: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.md },
  icon: { fontSize: 48 },
  title: { fontSize: 24, fontWeight: 'bold', color: colors.text },
  status: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#FFF7ED',
    color: colors.primary,
    fontWeight: '600',
  },
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: spacing.md, gap: spacing.xs },
  cardTitle: { fontSize: 15, fontWeight: 'bold', color: colors.text, marginBottom: spacing.xs },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  text: { fontSize: 15, color: colors.text, flexShrink: 1 },
  bold: { fontWeight: 'bold', fontSize: 16 },
  muted: { fontSize: 13, color: colors.muted },
  centerText: { textAlign: 'center' },
  error: { fontSize: 14, color: colors.danger },
  cancelledCard: { borderLeftWidth: 4, borderLeftColor: colors.danger },
  step: { flexDirection: 'row', gap: spacing.sm },
  stepMarker: { alignItems: 'center', width: 16 },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 3 },
  dotDone: { backgroundColor: colors.primary },
  dotPending: { backgroundColor: colors.border },
  stepLine: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 2 },
  stepLineDone: { backgroundColor: colors.primary },
  stepBody: { flex: 1, paddingBottom: spacing.md },
  stepLabel: { fontSize: 15, color: colors.text, fontWeight: '600' },
  stepLabelPending: { color: colors.muted, fontWeight: '400' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.xs },
});
