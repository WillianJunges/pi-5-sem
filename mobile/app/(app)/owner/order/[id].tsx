import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '../../../../src/components/Button';
import { EmptyState } from '../../../../src/components/EmptyState';
import { DELIVERY_LABELS } from '../../../../src/features/courier/presentation';
import { CourierPickerSheet } from '../../../../src/features/owner/CourierPickerSheet';
import { addressLine, formatCep } from '../../../../src/services/addresses.service';
import { ApiError } from '../../../../src/services/api';
import type { Delivery } from '../../../../src/services/deliveries.service';
import { orderStatusLabel, PAYMENT_LABEL } from '../../../../src/services/orders.service';
import {
  CANCELLABLE,
  canAssignCourier,
  type Courier,
  NEXT_ACTION,
  type OwnerOrder,
  PICKUP_ACTION,
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
const CANCEL_REASONS = ['Produto indisponível', 'Marmitaria fechada', 'Não podemos realizar a entrega', 'Outro'];

/**
 * Pedido para a proprietária (item 5): itens, cliente, entrega, pagamento e as ações
 * confirmar → iniciar preparo → marcar como pronto, além de cancelar (até "pronto").
 * Na retirada no local (módulo do Cliente), "pronto" → "marcar como retirado".
 * Na entrega, o card "Entrega" mostra o motoboy e permite atribuir/trocar até ele sair.
 */
export default function OwnerOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [order, setOrder] = useState<OwnerOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [otherReason, setOtherReason] = useState('');

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

  // A entrega só existe depois da confirmação; recarrega a cada mudança de status do pedido.
  const hasDelivery = order?.fulfillment === 'DELIVERY' && order.status !== 'PENDING';
  const loadDelivery = useCallback(async () => {
    if (!hasDelivery) {
      setDelivery(null);
      setDeliveryLoading(false);
      setDeliveryError(null);
      return;
    }
    setDeliveryLoading(true);
    try {
      setDelivery(await ownerService.deliveries.forOrder(id));
      setDeliveryError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) { setDelivery(null); setDeliveryError(null); }
      else setDeliveryError(getErrorMessage(err));
    } finally { setDeliveryLoading(false); }
  }, [id, hasDelivery]);

  useEffect(() => {
    loadDelivery();
  }, [loadDelivery, order?.status]);

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([load(), loadDelivery()]);
    setRefreshing(false);
  }

  async function apply(action: OwnerOrderAction, reason?: string) {
    setBusy(true);
    try {
      setOrder(await ownerService.orders.apply(id, action, reason));
    } catch (err) {
      Alert.alert('Ops', getErrorMessage(err));
      await load(); // mostra o status atual
    } finally {
      setBusy(false);
    }
  }

  async function assign(courier: Courier) {
    if (!delivery) return;
    setPickerOpen(false);
    setAssigning(true);
    try {
      setDelivery(await ownerService.deliveries.assign(delivery.id, courier.id));
      setDeliveryError(null);
    } catch (err) {
      Alert.alert('Não foi possível atribuir', getErrorMessage(err));
      await loadDelivery(); // ex.: o motoboy já saiu ou foi desativado
    } finally {
      setAssigning(false);
    }
  }

  function pickCourier(courier: Courier) {
    if (!delivery?.courierId) {
      assign(courier);
      return;
    }
    Alert.alert('Trocar motoboy?', `A entrega sai de ${delivery.courierName ?? 'outro motoboy'} e vai para ${courier.name}.`, [
      { text: 'Voltar', style: 'cancel' },
      { text: 'Trocar', onPress: () => assign(courier) },
    ]);
  }

  function confirmCancel() {
    setCancelReason('');
    setOtherReason('');
    setCancelOpen(true);
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

  const pickup = order.fulfillment === 'PICKUP';
  const next = pickup && order.status === 'READY' ? PICKUP_ACTION : NEXT_ACTION[order.status];
  const canCancel = CANCELLABLE.includes(order.status);

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
    >
      <View style={styles.header}>
        <Text style={styles.status}>{orderStatusLabel(order.status, order.fulfillment)}</Text>
        {pickup ? <Text style={styles.pickupBadge}>Retirada no local</Text> : null}
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
        <Text style={styles.notice}>
          {pickup
            ? 'Pronto: aguardando o cliente buscar.'
            : delivery && !delivery.courierId
              ? 'Pronto, mas ainda sem motoboy: atribua um para a entrega sair.'
              : 'Pronto: aguardando o motoboy sair para a entrega.'}
        </Text>
      ) : null}

      {hasDelivery ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Entrega</Text>
          {delivery ? (
            <>
              <Row label="Situação" value={DELIVERY_LABELS[delivery.status]} />
              <Row label="Motoboy" value={delivery.courierName ?? 'Nenhum ainda'} />
              {delivery.assignedAt ? <Row label="Atribuída às" value={time(delivery.assignedAt)} /> : null}
              {delivery.startedAt ? <Row label="Saiu às" value={time(delivery.startedAt)} /> : null}
              {delivery.completedAt ? <Row label="Entregue às" value={time(delivery.completedAt)} /> : null}
              {canAssignCourier(delivery) ? (
                <View style={styles.assign}>
                  <Button
                    title={delivery.courierId ? 'Trocar motoboy' : 'Atribuir motoboy'}
                    variant={delivery.courierId ? 'outline' : 'primary'}
                    onPress={() => setPickerOpen(true)}
                    loading={assigning}
                  />
                </View>
              ) : null}
            </>
          ) : deliveryError ? (
            <>
              <Text style={styles.error}>{deliveryError}</Text>
              <Pressable onPress={loadDelivery} hitSlop={8}>
                <Text style={styles.retry}>Tentar de novo</Text>
              </Pressable>
            </>
          ) : deliveryLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : <Text style={styles.muted}>Nenhuma entrega foi criada para este pedido.</Text>}
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Itens</Text>
        {order.items.map((item) => (
          <Row
            key={item.id}
            label={`${item.quantity}x ${item.productName} · ${item.variantName}${item.notes ? `\nObs.: ${item.notes}` : ''}`}
            value={formatCurrency(item.subtotal)}
          />
        ))}
        <View style={styles.divider} />
        <Row label="Subtotal" value={formatCurrency(order.subtotal)} />
        {order.distanceMeters === null ? (
          <Row label="Retirada no local" value="Sem taxa" />
        ) : (
          <Row
            label={`Entrega (${(order.distanceMeters / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km)`}
            value={formatCurrency(order.deliveryFee)}
          />
        )}
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

      {order.address ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Entregar em</Text>
          <Text style={styles.text}>{addressLine(order.address)}</Text>
          <Text style={styles.muted}>
            {order.address.district} · {order.address.city}/{order.address.state} · {formatCep(order.address.cep)}
          </Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{pickup ? 'Pagamento na retirada' : 'Pagamento na entrega'}</Text>
        <Text style={styles.text}>{PAYMENT_LABEL[order.paymentMethod]}</Text>
        {order.changeFor !== null ? (
          <Text style={styles.muted}>
            Troco para {formatCurrency(order.changeFor)} ({pickup ? 'separar' : 'levar'}{' '}
            {formatCurrency(order.changeFor - order.total)})
          </Text>
        ) : null}
      </View>

      <CourierPickerSheet
        visible={pickerOpen}
        currentCourierId={delivery?.courierId ?? null}
        onPick={pickCourier}
        onClose={() => setPickerOpen(false)}
      />
      <Modal visible={cancelOpen} transparent animationType="slide" onRequestClose={() => setCancelOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.cardTitle}>Por que cancelar o pedido?</Text>
            <Text style={styles.muted}>O cliente verá o motivo. O cancelamento não pode ser desfeito.</Text>
            {CANCEL_REASONS.map(reason => <Pressable key={reason} onPress={() => setCancelReason(reason)} style={styles.reasonOption}>
              <Text style={styles.text}>{cancelReason === reason ? '◉' : '○'} {reason}</Text>
            </Pressable>)}
            {cancelReason === 'Outro' ? <TextInput style={styles.reasonInput} placeholder="Descreva o motivo" value={otherReason} onChangeText={setOtherReason} maxLength={200} multiline /> : null}
            <Button title="Confirmar cancelamento" disabled={!cancelReason || (cancelReason === 'Outro' && !otherReason.trim()) || busy} onPress={() => {
              const reason = cancelReason === 'Outro' ? otherReason.trim() : cancelReason;
              setCancelOpen(false);
              void apply('cancel', reason);
            }} />
            <Button title="Voltar" variant="outline" onPress={() => setCancelOpen(false)} />
          </View>
        </View>
      </Modal>
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
  pickupBadge: { fontSize: 14, fontWeight: '600', color: colors.text },
  notice: { fontSize: 14, color: colors.text, backgroundColor: '#FFF7ED', padding: spacing.sm, borderRadius: 8 },
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: spacing.md, gap: spacing.xs },
  cardTitle: { fontSize: 15, fontWeight: 'bold', color: colors.text, marginBottom: spacing.xs },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  text: { fontSize: 15, color: colors.text, flexShrink: 1 },
  bold: { fontWeight: 'bold', fontSize: 16 },
  muted: { fontSize: 13, color: colors.muted },
  assign: { marginTop: spacing.sm },
  error: { fontSize: 14, color: colors.danger },
  retry: { fontSize: 15, fontWeight: '600', color: colors.primary },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.xs },
  modalBackdrop: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)', padding: spacing.md },
  modalCard: { backgroundColor: colors.background, borderRadius: 12, padding: spacing.md, gap: spacing.sm },
  reasonOption: { paddingVertical: spacing.sm },
  reasonInput: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: spacing.sm, color: colors.text },
});
