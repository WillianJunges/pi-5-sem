import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../../../src/components/Button';
import { EmptyState } from '../../../../src/components/EmptyState';
import { ORDER_STATUS_LABEL, type OrderStatus } from '../../../../src/services/orders.service';
import { ownerService, type OwnerOrderSummary } from '../../../../src/services/owner.service';
import { colors, spacing } from '../../../../src/theme';
import { getErrorMessage } from '../../../../src/utils/errors';
import { formatCurrency } from '../../../../src/utils/format';

/** Mesmas cores dos selos de status da aba Pedidos do Cliente. */
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

function OrderCard({ order }: { order: OwnerOrderSummary }) {
  const status = STATUS_COLORS[order.status];
  return (
    <Pressable
      onPress={() => router.push(`/owner/order/${order.id}`)}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.customer} numberOfLines={1}>
          {order.customer.name}
        </Text>
        <Text style={[styles.badge, { backgroundColor: status.bg, color: status.fg }]}>
          {ORDER_STATUS_LABEL[order.status]}
        </Text>
      </View>
      <Text style={styles.items} numberOfLines={2}>
        {order.itemsSummary}
      </Text>
      <View style={styles.cardFooter}>
        <Text style={styles.muted}>
          #{order.id.slice(0, 8).toUpperCase()} · {formatWhen(order.createdAt)}
        </Text>
        <Text style={styles.total}>{formatCurrency(order.total)}</Text>
      </View>
    </Pressable>
  );
}

const FILTERS = [
  { active: true, label: 'Em andamento' },
  { active: false, label: 'Finalizados' },
];

/** Aba "Pedidos" (item 5): pedidos em andamento e finalizados de todos os clientes. */
export default function OwnerOrdersScreen() {
  const [active, setActive] = useState(true);
  const [orders, setOrders] = useState<OwnerOrderSummary[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (filter: boolean) => {
    try {
      const page = await ownerService.orders.list(filter);
      setOrders(page.orders);
      setHasMore(page.hasMore);
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, []);

  // recarrega ao voltar para a aba (ex.: depois de confirmar um pedido)
  useFocusEffect(
    useCallback(() => {
      load(active);
    }, [load, active]),
  );

  function changeFilter(filter: boolean) {
    if (filter === active) return;
    setActive(filter);
    setOrders(null);
  }

  async function handleRefresh() {
    setRefreshing(true);
    await load(active);
    setRefreshing(false);
  }

  async function handleEndReached() {
    if (!orders || !hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await ownerService.orders.list(active, orders.length);
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

  const filterBar = (
    <View style={styles.filters}>
      {FILTERS.map((f) => (
        <Pressable
          key={f.label}
          onPress={() => changeFilter(f.active)}
          style={[styles.filter, f.active === active && styles.filterSelected]}
        >
          <Text style={[styles.filterText, f.active === active && styles.filterTextSelected]}>{f.label}</Text>
        </Pressable>
      ))}
    </View>
  );

  let content;
  if (orders === null && error) {
    content = (
      <EmptyState icon="⚠️" title="Não foi possível carregar os pedidos" message={error}>
        <Button title="Tentar de novo" onPress={() => load(active)} />
      </EmptyState>
    );
  } else if (orders === null) {
    content = (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  } else {
    content = (
      <FlatList
        data={orders}
        keyExtractor={(o) => o.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => <OrderCard order={item} />}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {active ? 'Nenhum pedido em andamento. Puxe para baixo para atualizar.' : 'Nenhum pedido finalizado ainda.'}
          </Text>
        }
        ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} /> : null}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.3}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
      />
    );
  }

  return (
    <View style={styles.container}>
      {filterBar}
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  filters: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.md },
  filter: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { fontSize: 14, color: colors.text },
  filterTextSelected: { color: colors.primaryText, fontWeight: '600' },
  listContent: { padding: spacing.md, gap: spacing.sm, flexGrow: 1 },
  empty: { fontSize: 14, color: colors.muted, textAlign: 'center', marginTop: spacing.xl },
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: spacing.md, gap: spacing.xs },
  pressed: { opacity: 0.7 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  customer: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
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
  muted: { fontSize: 13, color: colors.muted },
  total: { fontSize: 15, fontWeight: 'bold', color: colors.text },
});
