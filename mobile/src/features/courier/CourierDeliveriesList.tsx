import { router } from 'expo-router';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { useAuth } from '../../contexts/AuthContext';
import { type Delivery } from '../../services/deliveries.service';
import { useCourierOffline } from './offline/CourierOfflineProvider';
import { orderStatusLabel } from '../../services/orders.service';
import { colors, spacing } from '../../theme';
import { formatCurrency } from '../../utils/format';
import { CourierErrorNotice, courierStyles as styles, DeliveryBadge } from './components';
import { DeliveriesListModel } from './models';
import { useCourierRefresh } from './useCourierRefresh';

function DeliveryCard({ delivery }: { delivery: Delivery }) {
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={`Abrir entrega do pedido ${delivery.orderId.slice(0, 8)}, cliente ${delivery.customer.name}`}
    onPress={() => router.push(`/courier/delivery/${delivery.id}`)}
    style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}
  >
    <DeliveryBadge delivery={delivery} />
    <Text style={styles.title}>{delivery.customer.name}</Text>
    <Text style={styles.text}>{delivery.address.street}, {delivery.address.number}</Text>
    <Text style={styles.muted}>{delivery.address.district} · {delivery.address.city}/{delivery.address.state}</Text>
    <Text style={styles.muted}>Pedido: {orderStatusLabel(delivery.orderStatus)}</Text>
    <Text style={styles.text}>{formatCurrency(delivery.total)}</Text>
    <Text style={styles.muted}>#{delivery.orderId.slice(0, 8).toUpperCase()} · {new Date(delivery.createdAt).toLocaleDateString('pt-BR')}</Text>
    <Text style={styles.link}>Ver entrega ›</Text>
  </Pressable>;
}

function List({ active }: { active: boolean }) {
  const service = useCourierOffline();
  const [model] = useState(() => new DeliveriesListModel(service, active));
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot);
  useEffect(() => service.subscribeLocal(() => void model.refreshLocal()), [service, model]);
  useCourierRefresh(() => model.reload(), () => model.cancelReads(), active);

  if (!state.deliveries) {
    return state.error ? <View style={styles.content}>
      <CourierErrorNotice error={state.error} onRetry={() => void model.reload()} disabled={state.loading} />
    </View> : <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return <FlatList
    style={styles.flex}
    data={state.deliveries}
    keyExtractor={delivery => delivery.id}
    renderItem={({ item }) => <DeliveryCard delivery={item} />}
    contentContainerStyle={[styles.content, local.list]}
    refreshControl={<RefreshControl refreshing={state.loading} onRefresh={() => void model.reload()} tintColor={colors.primary} />}
    ListHeaderComponent={<View style={local.header}>
      <Text style={styles.muted}>{active ? 'Entregas atribuídas a você. Puxe para baixo para atualizar.' : 'Entregas concluídas, canceladas e confirmações locais pendentes.'}</Text>
      {state.fromCache ? <Text style={styles.muted}>Exibindo dados salvos neste aparelho.</Text> : null}
      {state.error ? <CourierErrorNotice error={state.error} stale onRetry={() => void model.reload()} disabled={state.loading} /> : null}
    </View>}
    ListEmptyComponent={<EmptyState icon={active ? '🛵' : '📋'} title={state.fromCache ? 'Nenhuma entrega salva nesta lista' : active ? 'Nenhuma entrega atribuída' : 'Histórico vazio'}
      message={state.fromCache ? 'Abra as entregas com conexão para guardá-las neste aparelho.' : active ? 'As entregas aparecerão aqui quando a proprietária atribuí-las a você.' : 'As entregas concluídas ou canceladas aparecerão aqui.'} />}
    ListFooterComponent={<View style={local.footer}>
      {state.pageError ? <CourierErrorNotice error={state.pageError} onRetry={() => void model.loadMore()} disabled={state.loadingMore} />
        : state.hasMore ? <Button title="Carregar mais" variant="outline" loading={state.loadingMore} disabled={state.loading} onPress={() => void model.loadMore()} /> : null}
    </View>}
  />;
}

/** A chave descarta dados da conta anterior se outra pessoa entrar no mesmo aparelho. */
export function CourierDeliveriesList({ active }: { active: boolean }) {
  const { user } = useAuth();
  return user?.role === 'COURIER' ? <List key={`${user.id}:${active}`} active={active} /> : null;
}

const local = StyleSheet.create({ list: { flexGrow: 1 }, header: { gap: spacing.md }, footer: { paddingTop: spacing.sm } });
