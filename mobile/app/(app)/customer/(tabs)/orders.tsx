import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../../../src/components/Button';
import { EmptyState } from '../../../../src/components/EmptyState';
import { useAuth } from '../../../../src/contexts/AuthContext';
import { ordersCache } from '../../../../src/services/ordersCache';
import { ORDER_STATUS_LABEL, type OrderStatus, type OrderSummary, ordersService } from '../../../../src/services/orders.service';
import { colors, spacing } from '../../../../src/theme';
import { getErrorMessage, isConnectionError } from '../../../../src/utils/errors';
import { formatCurrency } from '../../../../src/utils/format';

const STATUS_COLORS: Record<OrderStatus, { bg: string; fg: string }> = {
  PENDING: { bg: '#FFF7ED', fg: '#C2410C' },
  CONFIRMED: { bg: '#EFF6FF', fg: '#1D4ED8' },
  PREPARING: { bg: '#EFF6FF', fg: '#1D4ED8' },
  READY: { bg: '#EFF6FF', fg: '#1D4ED8' },
  OUT_FOR_DELIVERY: { bg: '#F5F3FF', fg: '#6D28D9' },
  DELIVERED: { bg: '#F0FDF4', fg: '#15803D' },
  CANCELLED: { bg: '#F3F4F6', fg: '#6B7280' },
};

/** "16/10 às 17:40" (no fuso do aparelho) */
function formatWhen(iso: string) {
  const d = new Date(iso);
  const day = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${day} às ${time}`;
}

function OrderCard({ order }: { order: OrderSummary }) {
  const status = STATUS_COLORS[order.status];
  return (
    <Pressable
      onPress={() => router.push(`/customer/order/${order.id}`)}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.when}>{formatWhen(order.createdAt)}</Text>
        <Text style={[styles.badge, { backgroundColor: status.bg, color: status.fg }]}>
          {ORDER_STATUS_LABEL[order.status]}
        </Text>
      </View>
      <Text style={styles.items} numberOfLines={2}>
        {order.itemsSummary}
      </Text>
      <View style={styles.cardFooter}>
        <Text style={styles.muted} numberOfLines={1}>
          {order.addressLabel ?? 'Entrega'} · {order.addressStreet}, {order.addressNumber}
        </Text>
        <Text style={styles.total}>{formatCurrency(order.total)}</Text>
      </View>
    </Pressable>
  );
}

/** Pedidos e histórico do cliente: em andamento no topo, depois os anteriores. */
export default function OrdersScreen() {
  const { user } = useAuth();
  const userId = user?.id;
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Sem conexão: mostrando a cópia salva no aparelho. */
  const [offlineSince, setOfflineSince] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const hasData = useRef(false);

  const loadFirstPage = useCallback(async () => {
    if (!userId) return;
    try {
      const page = await ordersService.list(0);
      setOrders(page.orders);
      setHasMore(page.hasMore);
      setError(null);
      setOfflineSince(null);
      hasData.current = true;
      await ordersCache.save(userId, page.orders);
    } catch (err) {
      // Erro de verdade (ex.: 500): mostra a mensagem em vez de fingir que está sem conexão.
      if (!isConnectionError(err)) {
        if (!hasData.current) setError(getErrorMessage(err));
        return;
      }
      const cached = hasData.current ? null : await ordersCache.get(userId);
      if (cached) {
        setOrders(cached.orders);
        setHasMore(false);
        setOfflineSince(cached.savedAt);
        hasData.current = true;
      } else if (hasData.current) {
        setOfflineSince((current) => current ?? new Date().toISOString());
      } else {
        setError(getErrorMessage(err));
      }
    }
  }, [userId]);

  // recarrega ao voltar para a aba (ex.: depois de fazer um pedido)
  useFocusEffect(
    useCallback(() => {
      loadFirstPage();
    }, [loadFirstPage]),
  );

  async function handleRefresh() {
    setRefreshing(true);
    await loadFirstPage();
    setRefreshing(false);
  }

  async function handleEndReached() {
    if (!orders || !hasMore || loadingMore || offlineSince) return;
    setLoadingMore(true);
    try {
      const page = await ordersService.list(orders.length);
      // evita repetir um pedido se a lista mudou entre uma página e outra
      setOrders((current) => {
        const ids = new Set(current?.map((o) => o.id));
        return [...(current ?? []), ...page.orders.filter((o) => !ids.has(o.id))];
      });
      setHasMore(page.hasMore);
    } catch {
      // a próxima rolagem tenta de novo
    } finally {
      setLoadingMore(false);
    }
  }

  if (orders === null) {
    if (error) {
      return (
        <EmptyState icon="⚠️" title="Não foi possível carregar seus pedidos" message={error}>
          <Button title="Tentar de novo" onPress={loadFirstPage} />
        </EmptyState>
      );
    }
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (orders.length === 0) {
    return (
      <EmptyState icon="🧾" title="Nenhum pedido ainda" message="Quando você fizer um pedido, ele aparece aqui.">
        <Button title="Ver cardápio" onPress={() => router.navigate('/customer')} />
      </EmptyState>
    );
  }

  const sections = [
    { title: 'Em andamento', data: orders.filter((o) => o.isActive) },
    { title: 'Anteriores', data: orders.filter((o) => !o.isActive) },
  ].filter((s) => s.data.length > 0);

  return (
    <SectionList
      style={styles.list}
      contentContainerStyle={styles.listContent}
      sections={sections}
      keyExtractor={(o) => o.id}
      renderItem={({ item }) => <OrderCard order={item} />}
      renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={
        offlineSince ? (
          <Text style={styles.offline}>
            Sem conexão. Mostrando os pedidos salvos em {formatWhen(offlineSince)}.
          </Text>
        ) : null
      }
      ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} /> : null}
      onEndReached={handleEndReached}
      onEndReachedThreshold={0.3}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  list: { flex: 1, backgroundColor: colors.background },
  listContent: { padding: spacing.md, gap: spacing.sm },
  sectionTitle: { fontSize: 17, fontWeight: 'bold', color: colors.text, marginTop: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: spacing.md, gap: spacing.xs },
  pressed: { opacity: 0.7 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  when: { fontSize: 14, fontWeight: '600', color: colors.text },
  badge: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: 'hidden',
  },
  items: { fontSize: 15, color: colors.text },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  muted: { flex: 1, fontSize: 13, color: colors.muted },
  total: { fontSize: 15, fontWeight: 'bold', color: colors.text },
  offline: {
    fontSize: 13,
    color: colors.text,
    backgroundColor: '#FFF7ED',
    padding: spacing.sm,
    borderRadius: 8,
    marginBottom: spacing.sm,
  },
});
