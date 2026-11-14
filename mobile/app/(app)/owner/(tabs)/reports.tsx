import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../../../src/components/Button';
import { ownerService, type OwnerOrderSummary } from '../../../../src/services/owner.service';
import { orderStatusLabel } from '../../../../src/services/orders.service';
import { colors, spacing } from '../../../../src/theme';
import { getErrorMessage } from '../../../../src/utils/errors';
import { formatCurrency, formatLongDate } from '../../../../src/utils/format';

type Period = 'day' | 'week' | 'month';
type Summary = Awaited<ReturnType<typeof ownerService.orders.dashboard>>;
const PERIODS: { value: Period; label: string }[] = [{ value: 'day', label: 'Diário' }, { value: 'week', label: 'Semanal' }, { value: 'month', label: 'Mensal' }];

export default function ReportsScreen() {
  const [period, setPeriod] = useState<Period>('day');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [orders, setOrders] = useState<OwnerOrderSummary[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const requestId = useRef(0);
  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    try {
      const data = await ownerService.orders.dashboard(period);
      const page = await ownerService.orders.list(undefined, 0, 20, { from: data.startDate, to: data.endDate });
      if (requestId.current === currentRequest) { setSummary(data); setOrders(page.orders); setHasMore(page.hasMore); setError(null); }
    } catch (err) { if (requestId.current === currentRequest) setError(getErrorMessage(err)); }
    finally { if (requestId.current === currentRequest) setLoading(false); }
  }, [period]);
  useFocusEffect(useCallback(() => { setLoading(true); setSummary(null); setOrders([]); setError(null); void load(); return () => { requestId.current++; }; }, [load]));
  async function loadMore() {
    if (!summary || !hasMore || more) return;
    setMore(true);
    const currentRequest = requestId.current;
    try {
      const page = await ownerService.orders.list(undefined, orders.length, 20, { from: summary.startDate, to: summary.endDate });
      if (requestId.current === currentRequest) {
        setOrders(current => { const ids = new Set(current.map(item => item.id)); return [...current, ...page.orders.filter(item => !ids.has(item.id))]; });
        setHasMore(page.hasMore);
      }
    } catch (err) { if (requestId.current === currentRequest) setError(getErrorMessage(err)); }
    finally { setMore(false); }
  }
  return <View style={styles.container}>
    <View style={styles.tabs}>{PERIODS.map(option => <Pressable key={option.value} onPress={() => setPeriod(option.value)} style={[styles.tab, period === option.value && styles.selected]}><Text style={period === option.value ? styles.selectedText : styles.tabText}>{option.label}</Text></Pressable>)}</View>
    {loading ? <ActivityIndicator color={colors.primary} /> : error && !summary ? <View style={styles.body}><Text style={styles.text}>{error}</Text><Button title="Tentar de novo" onPress={load} /></View> : summary ?
      <FlatList data={orders} keyExtractor={item => item.id} contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />}
        ListHeaderComponent={<View style={styles.card}>
          <Text style={styles.title}>{formatLongDate(summary.startDate)} até {formatLongDate(summary.endDate)}</Text>
          <Text style={styles.text}>Pedidos: {summary.orderCount} · Cancelados: {summary.cancelledCount}</Text>
          <Text style={styles.text}>Entregues ou retirados: {summary.completedCount}</Text>
          <Text style={styles.text}>Total vendido: {formatCurrency(summary.sales)}</Text>
          <Text style={styles.text}>Ticket médio: {formatCurrency(summary.average)}</Text>
          <Text style={styles.muted}>Pedidos feitos no período. Vendas e ticket incluem somente os entregues ou retirados, com taxa de entrega. Semana de segunda a domingo.</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>}
        renderItem={({ item }) => <Pressable style={styles.card} onPress={() => router.push(`/owner/order/${item.id}`)}>
          <Text style={styles.title}>{item.customer.name} · #{item.id.slice(0, 8).toUpperCase()}</Text>
          <Text style={styles.text}>{orderStatusLabel(item.status, item.fulfillment)} · {formatCurrency(item.total)}</Text>
          <Text style={styles.muted}>{new Date(item.createdAt).toLocaleString('pt-BR')}</Text>
        </Pressable>}
        ListEmptyComponent={<Text style={styles.muted}>Nenhum pedido neste período.</Text>}
        ListFooterComponent={more ? <ActivityIndicator color={colors.primary} /> : null} onEndReached={loadMore} onEndReachedThreshold={0.3} /> : null}
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background }, body: { padding: spacing.md, gap: spacing.sm },
  tabs: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md }, tab: { flex: 1, padding: spacing.sm, borderColor: colors.border, borderWidth: 1, borderRadius: 8, alignItems: 'center' },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary }, tabText: { color: colors.text }, selectedText: { color: '#fff', fontWeight: '600' },
  card: { backgroundColor: colors.surface, padding: spacing.md, borderRadius: 10, gap: spacing.xs }, title: { color: colors.text, fontWeight: '600', fontSize: 16 },
  text: { color: colors.text, fontSize: 14 }, muted: { color: colors.muted, fontSize: 13 }, error: { color: colors.danger },
});
