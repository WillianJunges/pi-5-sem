import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { AddToCartSheet } from '../../../../src/components/AddToCartSheet';
import { Button } from '../../../../src/components/Button';
import { EmptyState } from '../../../../src/components/EmptyState';
import { useAuth } from '../../../../src/contexts/AuthContext';
import { customerMenuService, isOnSale, type Menu, type MenuItem } from '../../../../src/services/customerMenu.service';
import { businessHoursService, type BusinessDay } from '../../../../src/services/businessHours.service';
import { colors, spacing } from '../../../../src/theme';
import { getErrorMessage } from '../../../../src/utils/errors';
import { formatCurrency, formatLongDate } from '../../../../src/utils/format';

/** "marmitas" → "Marmitas"; sem categoria → "Outros". */
function categoryTitle(category: string | null): string {
  return category ? category.charAt(0).toUpperCase() + category.slice(1) : 'Outros';
}

/** Agrupa os produtos por categoria, mantendo a ordem em que vêm da API. */
function groupByCategory(items: MenuItem[]) {
  const sections: { title: string; data: MenuItem[] }[] = [];
  for (const item of items) {
    const title = categoryTitle(item.category);
    const section = sections.find((s) => s.title === title);
    if (section) section.data.push(item);
    else sections.push({ title, data: [item] });
  }
  return sections;
}

function MenuItemCard({ item, onPress }: { item: MenuItem; onPress(): void }) {
  const samePrice = item.variations.every((v) => v.price === item.price);
  const onSale = item.variations.some(isOnSale);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}>
      <View style={styles.cardHeader}>
        <Text style={styles.itemName}>{item.name}</Text>
        <View style={styles.priceBox}>
          {!samePrice ? <Text style={styles.fromLabel}>a partir de</Text> : null}
          <Text style={styles.price}>{formatCurrency(item.price)}</Text>
        </View>
      </View>
      {item.description ? <Text style={styles.description}>{item.description}</Text> : null}
      {item.variations.length > 1 ? (
        <View style={styles.chips}>
          {item.variations.map((variation) => (
            <Text key={variation.variantId} style={[styles.chip, isOnSale(variation) && styles.chipSale]}>
              {variation.name} · {formatCurrency(variation.price)}
            </Text>
          ))}
        </View>
      ) : null}
      <View style={styles.cardFooter}>
        {onSale ? <Text style={styles.saleBadge}>Promoção</Text> : null}
        <Text style={styles.addHint}>Toque para adicionar</Text>
      </View>
    </Pressable>
  );
}

/** Cardápio do dia. Tocar num item abre a janela para adicionar ao carrinho. */
export default function MenuScreen() {
  const { user } = useAuth();
  const [menu, setMenu] = useState<Menu | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MenuItem | null>(null);
  const [todayHours, setTodayHours] = useState<BusinessDay | null>(null);

  const load = useCallback(async () => {
    try {
      const current = await customerMenuService.getToday();
      setMenu(current);
      if (!current) setSelected(null);
      businessHoursService.public().then(hours => setTodayHours(hours.configured ? hours.days.find(day => day.weekday === hours.todayWeekday) ?? null : null)).catch(() => setTodayHours(null));
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
    const timer = setInterval(() => { void load(); }, 30_000);
    return () => clearInterval(timer);
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
    <>
      <SectionList
        style={styles.list}
        contentContainerStyle={styles.listContent}
        sections={isOpen ? groupByCategory(menu.items) : []}
        keyExtractor={(item) => item.productId}
        renderItem={({ item }) => <MenuItemCard item={item} onPress={() => setSelected(item)} />}
        renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.greeting}>Olá, {user?.name.split(' ')[0]}!</Text>
            <Text style={styles.title}>Cardápio de hoje</Text>
            {menu ? <Text style={styles.date}>{formatLongDate(menu.date)}</Text> : null}
            {todayHours ? <Text style={styles.date}>{todayHours.opensAt ? `Horário habitual de hoje: ${todayHours.opensAt} às ${todayHours.closesAt}` : 'Horário habitual: fechado hoje'}</Text> : null}
          </View>
        }
        ListEmptyComponent={
          menu?.status === 'CLOSED' ? (
            <EmptyState icon="🔒" title="Pedidos encerrados" message="O cardápio de hoje já foi fechado. Volte amanhã!" />
          ) : (
            <EmptyState icon="🍱" title="Marmitaria fechada no momento" message="Não há cardápio disponível agora. Puxe para atualizar." />
          )
        }
      />
      {menu ? <AddToCartSheet item={selected} menuDate={menu.date} onClose={() => setSelected(null)} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  list: { flex: 1, backgroundColor: colors.background },
  listContent: { flexGrow: 1, padding: spacing.md, gap: spacing.md },
  header: { gap: 2, marginBottom: spacing.xs },
  greeting: { fontSize: 16, color: colors.muted },
  title: { fontSize: 26, fontWeight: 'bold', color: colors.text },
  date: { color: colors.muted, textTransform: 'capitalize' },
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: spacing.md, gap: spacing.sm },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  itemName: { flex: 1, fontSize: 17, fontWeight: '600', color: colors.text },
  priceBox: { alignItems: 'flex-end' },
  fromLabel: { fontSize: 11, color: colors.muted },
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
  chipSale: { borderColor: colors.primary, color: colors.primary },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: colors.text, marginTop: spacing.sm },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  saleBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: colors.primary,
    color: colors.primaryText,
    fontSize: 12,
    fontWeight: '600',
  },
  addHint: { fontSize: 13, fontWeight: '600', color: colors.primary },
});
