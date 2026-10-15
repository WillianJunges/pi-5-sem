import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../../../src/components/Button';
import { EmptyState } from '../../../../src/components/EmptyState';
import { useAuth } from '../../../../src/contexts/AuthContext';
import {
  customerMenuService,
  type Menu,
  type MenuItem,
  USE_MENU_MOCK,
} from '../../../../src/services/customerMenu.service';
import { colors, spacing } from '../../../../src/theme';
import { getErrorMessage } from '../../../../src/utils/errors';
import { formatCurrency, formatLongDate } from '../../../../src/utils/format';

function MenuItemCard({ item }: { item: MenuItem }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.itemName}>{item.name}</Text>
        <Text style={styles.price}>{formatCurrency(item.price)}</Text>
      </View>
      {item.description ? <Text style={styles.description}>{item.description}</Text> : null}
      {item.variations.length > 0 ? (
        <View style={styles.chips}>
          {item.variations.map((variation) => (
            <Text key={variation} style={styles.chip}>
              {variation}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Cardápio do dia. Tocar no item para adicionar ao carrinho entra no item 3. */
export default function MenuScreen() {
  const { user } = useAuth();
  const [menu, setMenu] = useState<Menu | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setMenu(await customerMenuService.getToday());
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function handleRetry() {
    setLoading(true);
    await load();
    setLoading(false);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <EmptyState icon="⚠️" title="Não foi possível carregar o cardápio" message={error}>
        <Button title="Tentar de novo" onPress={handleRetry} />
      </EmptyState>
    );
  }

  const isOpen = menu?.status === 'ACTIVE' && menu.items.length > 0;

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.listContent}
      data={isOpen ? menu.items : []}
      keyExtractor={(item) => item.productId}
      renderItem={({ item }) => <MenuItemCard item={item} />}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
      }
      ListHeaderComponent={
        <View style={styles.header}>
          {USE_MENU_MOCK ? <Text style={styles.mockBadge}>Dados de exemplo</Text> : null}
          <Text style={styles.greeting}>Olá, {user?.name.split(' ')[0]}!</Text>
          <Text style={styles.title}>Cardápio de hoje</Text>
          {menu ? <Text style={styles.date}>{formatLongDate(menu.date)}</Text> : null}
        </View>
      }
      ListEmptyComponent={
        menu?.status === 'CLOSED' ? (
          <EmptyState icon="🔒" title="Pedidos encerrados" message="O cardápio de hoje já foi fechado. Volte amanhã!" />
        ) : (
          <EmptyState icon="🍱" title="Sem cardápio hoje" message="O cardápio ainda não foi publicado. Puxe para atualizar." />
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  list: { flex: 1, backgroundColor: colors.background },
  listContent: { flexGrow: 1, padding: spacing.md, gap: spacing.md },
  header: { gap: 2, marginBottom: spacing.xs },
  mockBadge: {
    alignSelf: 'flex-start',
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: '#FEF3C7',
    color: '#92400E',
    fontSize: 12,
    fontWeight: '600',
  },
  greeting: { fontSize: 16, color: colors.muted },
  title: { fontSize: 26, fontWeight: 'bold', color: colors.text },
  date: { color: colors.muted, textTransform: 'capitalize' },
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: spacing.md, gap: spacing.sm },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  itemName: { flex: 1, fontSize: 17, fontWeight: '600', color: colors.text },
  price: { fontSize: 17, fontWeight: 'bold', color: colors.primary },
  description: { color: colors.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 13,
  },
});
