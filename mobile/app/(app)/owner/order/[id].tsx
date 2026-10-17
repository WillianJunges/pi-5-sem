import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../../../src/components/Button';
import { EmptyState } from '../../../../src/components/EmptyState';
import { addressLine, formatCep } from '../../../../src/services/addresses.service';
import { ORDER_STATUS_LABEL, PAYMENT_LABEL } from '../../../../src/services/orders.service';
import {
  CANCELLABLE,
  NEXT_ACTION,
  type OwnerOrder,
  type OwnerOrderAction,
  ownerService,
} from '../../../../src/services/owner.service';
import { colors, spacing } from '../../../../src/theme';
import { getErrorMessage } from '../../../../src/utils/errors';
import { formatCurrency } from '../../../../src/utils/format';

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.text, bold && styles.bold]}>{label}</Text>
      <Text style={[styles.text, bold && styles.bold]}>{value}</Text>
    </View>
  );
}

const time = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/**
 * Pedido para a proprietária (item 5): itens, cliente, entrega, pagamento e as ações
 * confirmar → iniciar preparo → marcar como pronto, além de cancelar (até "pronto").
 */
export default function OwnerOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [order, setOrder] = useState<OwnerOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setOrder(await ownerService.orders.get(id));
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function apply(action: OwnerOrderAction) {
    setBusy(true);
    try {
      setOrder(await ownerService.orders.apply(id, action));
    } catch (err) {
      Alert.alert('Ops', getErrorMessage(err));
      await load(); // mostra o status atual
    } finally {
      setBusy(false);
    }
  }

  function confirmCancel() {
    Alert.alert('Cancelar pedido?', 'O cliente verá o pedido como cancelado. Isso não pode ser desfeito.', [
      { text: 'Voltar', style: 'cancel' },
      { text: 'Cancelar pedido', style: 'destructive', onPress: () => apply('cancel') },
    ]);
  }

  if (!order) {
    return error ? (
      <EmptyState icon="⚠️" title="Não foi possível carregar o pedido" message={error}>
        <Button title="Tentar de novo" onPress={load} />
      </EmptyState>
    ) : (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const next = NEXT_ACTION[order.status];
  const canCancel = CANCELLABLE.includes(order.status);

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
    >
      <View style={styles.header}>
        <Text style={styles.status}>{ORDER_STATUS_LABEL[order.status]}</Text>
        <Text style={styles.muted}>
          Pedido #{order.id.slice(0, 8).toUpperCase()} · feito às {time(order.createdAt)}
        </Text>
      </View>

      {next || canCancel ? (
        <View style={styles.actions}>
          {next ? <Button title={next.label} onPress={() => apply(next.action)} loading={busy} /> : null}
          {canCancel ? (
            <Pressable onPress={confirmCancel} disabled={busy} hitSlop={8} style={styles.cancel}>
              <Text style={styles.cancelText}>Cancelar pedido</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {order.status === 'READY' ? (
        <Text style={styles.notice}>Pronto: aguardando a saída para entrega.</Text>
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

      {order.notes ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Observações do cliente</Text>
          <Text style={styles.text}>{order.notes}</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Cliente</Text>
        <Text style={styles.text}>{order.customer.name}</Text>
        {order.customer.phone ? <Text style={styles.muted}>{order.customer.phone}</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Entregar em</Text>
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  container: { padding: spacing.md, gap: spacing.md },
  header: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.sm },
  status: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#FFF7ED',
    color: colors.primary,
    fontWeight: '600',
    fontSize: 16,
  },
  actions: { gap: spacing.sm },
  cancel: { alignItems: 'center', paddingVertical: spacing.sm },
  cancelText: { fontSize: 15, fontWeight: '600', color: colors.danger },
  notice: { fontSize: 14, color: colors.text, backgroundColor: '#FFF7ED', padding: spacing.sm, borderRadius: 8 },
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: spacing.md, gap: spacing.xs },
  cardTitle: { fontSize: 15, fontWeight: 'bold', color: colors.text, marginBottom: spacing.xs },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  text: { fontSize: 15, color: colors.text, flexShrink: 1 },
  bold: { fontWeight: 'bold', fontSize: 16 },
  muted: { fontSize: 13, color: colors.muted },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.xs },
});
