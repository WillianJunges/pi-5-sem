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
import { ORDER_STATUS_LABEL, type Order, ordersService, PAYMENT_LABEL } from '../../../../src/services/orders.service';
import { colors, spacing } from '../../../../src/theme';
import { getErrorMessage } from '../../../../src/utils/errors';
import { formatCurrency } from '../../../../src/utils/format';

const formatTime = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

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
 * O acompanhamento em tempo real (status e localização do motoboy) entra no ponto 8.
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

  const load = useCallback(async () => {
    try {
      setOrder(await ordersService.get(id));
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err));
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
          <Text style={styles.status}>{ORDER_STATUS_LABEL[order.status]}</Text>
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
          <Row
            label={`Entrega (${(order.distanceMeters / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km)`}
            value={formatCurrency(order.deliveryFee)}
          />
          <Row label="Total" value={formatCurrency(order.total)} bold />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Entrega em</Text>
          <Text style={styles.text}>{addressLine(order.address)}</Text>
          <Text style={styles.muted}>
            {order.address.district} · {order.address.city}/{order.address.state} · {formatCep(order.address.cep)}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Pagamento na entrega</Text>
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

        {!finished ? <Text style={[styles.muted, styles.centerText]}>Puxe para baixo para atualizar o status.</Text> : null}
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
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.xs },
});
