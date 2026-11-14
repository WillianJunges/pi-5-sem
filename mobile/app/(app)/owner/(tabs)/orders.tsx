import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '../../../../src/components/Button';
import { EmptyState } from '../../../../src/components/EmptyState';
import { type OrderStatus, orderStatusLabel } from '../../../../src/services/orders.service';
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
          {orderStatusLabel(order.status, order.fulfillment)}
        </Text>
      </View>
      <Text style={styles.items} numberOfLines={2}>
        {order.itemsSummary}
      </Text>
      <View style={styles.cardFooter}>
        <Text style={styles.muted}>
          #{order.id.slice(0, 8).toUpperCase()} · {formatWhen(order.createdAt)}
          {order.fulfillment === 'PICKUP' ? ' · Retirada no local' : ''}
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
const STATUS_FILTERS: { value: OrderStatus | undefined; label: string }[] = [
  { value: undefined, label: 'Todos' }, { value: 'PENDING', label: 'Aguardando' },
  { value: 'CONFIRMED', label: 'Confirmado' }, { value: 'PREPARING', label: 'Preparo' },
  { value: 'READY', label: 'Pronto' }, { value: 'OUT_FOR_DELIVERY', label: 'Em entrega' },
  { value: 'DELIVERED', label: 'Entregue' }, { value: 'CANCELLED', label: 'Cancelado' },
];

/** Aba "Pedidos" (item 5): pedidos em andamento e finalizados de todos os clientes. */
export default function OwnerOrdersScreen() {
  const [active, setActive] = useState(true);
  const [orders, setOrders] = useState<OwnerOrderSummary[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [date, setDate] = useState('');
  const [status, setStatus] = useState<OrderStatus | undefined>();
  const [applied, setApplied] = useState<{ search?: string; date?: string; status?: OrderStatus }>({});
  const [dashboard, setDashboard] = useState<Awaited<ReturnType<typeof ownerService.orders.dashboard>> | null>(null);

  const load = useCallback(async (filter: boolean) => {
    try {
      const page = await ownerService.orders.list(filter, 0, 20, applied);
      setOrders(page.orders);
      setHasMore(page.hasMore);
      setError(null);
      ownerService.orders.dashboard().then(setDashboard).catch(() => setDashboard(null));
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, [applied]);

  // recarrega ao voltar para a aba (ex.: depois de confirmar um pedido)
  useFocusEffect(
    useCallback(() => {
      load(active);
    }, [load, active]),
  );

  function changeFilter(filter: boolean) {
    if (filter === active) return;
    setActive(filter);
    if (applied.status) { setStatus(undefined); setApplied(current => ({ ...current, status: undefined })); }
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
      const page = await ownerService.orders.list(active, orders.length, 20, applied);
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
      {dashboard ? <View style={styles.dashboard}><Text style={styles.customer}>Resumo de hoje</Text>
        <Text style={styles.items}>{dashboard.orderCount} pedidos · {dashboard.completedCount} entregues ou retirados</Text>
        <Text style={styles.items}>Vendas dos pedidos de hoje já concluídos: {formatCurrency(dashboard.sales)} · Ticket médio: {formatCurrency(dashboard.average)}</Text>
      </View> : null}
      <View style={styles.searchBox}>
        <TextInput style={styles.input} placeholder="Buscar cliente ou número do pedido" value={search} onChangeText={setSearch} />
        <TextInput style={styles.input} placeholder="Data: AAAA-MM-DD (opcional)" value={date} onChangeText={setDate} maxLength={10} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}><View style={styles.filters}>
          {STATUS_FILTERS.map(option => <Pressable key={option.label} onPress={() => setStatus(option.value)} style={[styles.filter, status === option.value && styles.filterSelected]}><Text style={[styles.filterText, status === option.value && styles.filterTextSelected]}>{option.label}</Text></Pressable>)}
        </View></ScrollView>
        <Button title="Aplicar filtros" onPress={() => {
          if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) { setError('Informe a data no formato AAAA-MM-DD.'); setOrders(null); return; }
          if (status) setActive(status !== 'DELIVERED' && status !== 'CANCELLED');
          setOrders(null); setApplied({ search: search.trim() || undefined, date: date || undefined, status });
        }} />
      </View>
      {filterBar}
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  dashboard: { backgroundColor: colors.surface, padding: spacing.md, gap: spacing.xs },
  searchBox: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.xs },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: spacing.sm, color: colors.text },
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
