import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../../../src/components/Button';
import { EmptyState } from '../../../../src/components/EmptyState';
import {
  MENU_STATUS_COLORS,
  MENU_STATUS_LABEL,
  type MenuStatus,
  type MenuSummary,
  ownerService,
} from '../../../../src/services/owner.service';
import { colors, spacing } from '../../../../src/theme';
import { getErrorMessage } from '../../../../src/utils/errors';
import { formatLongDate } from '../../../../src/utils/format';
import { businessHoursService } from '../../../../src/services/businessHours.service';

const SECTIONS: { status: MenuStatus; title: string }[] = [
  { status: 'ACTIVE', title: 'Ativo' },
  { status: 'DRAFT', title: 'Rascunhos' },
  { status: 'CLOSED', title: 'Encerrados' },
];
const DAYS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

function MenuCard({ menu }: { menu: MenuSummary }) {
  const status = MENU_STATUS_COLORS[menu.status];
  return (
    <Pressable
      onPress={() => router.push(`/owner/menu/${menu.id}`)}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.name}>{menu.name}</Text>
        <Text style={[styles.badge, { backgroundColor: status.bg, color: status.fg }]}>
          {MENU_STATUS_LABEL[menu.status]}
        </Text>
      </View>
      <Text style={styles.date}>{menu.weekday != null ? `Modelo semanal · ${DAYS[menu.weekday]}` : formatLongDate(menu.menuDate)}</Text>
      <Text style={styles.muted}>
        {menu.itemCount === 1 ? '1 item' : `${menu.itemCount} itens`}
      </Text>
    </Pressable>
  );
}

/** Aba "Cardápios": rascunhos, o ativo e os encerrados (item 3). */
export default function MenusScreen() {
  const [menus, setMenus] = useState<MenuSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<'daily' | 'weekly'>('daily');
  const [todayWeekday, setTodayWeekday] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, hours] = await Promise.all([ownerService.menus.list(), businessHoursService.public().catch(() => null)]);
      setMenus(list);
      setTodayWeekday(hours?.todayWeekday ?? null);
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const addButton = <Button title="Novo cardápio" onPress={() => router.push('/owner/menu-form')} />;

  if (menus === null) {
    if (error) {
      return (
        <EmptyState icon="⚠️" title="Não foi possível carregar os cardápios" message={error}>
          <Button title="Tentar de novo" onPress={load} />
        </EmptyState>
      );
    }
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (menus.length === 0) {
    return (
      <EmptyState icon="📋" title="Nenhum cardápio ainda" message="Monte o cardápio do dia com os produtos cadastrados.">
        {addButton}
      </EmptyState>
    );
  }

  const sections = SECTIONS.map((s) => ({
    title: s.title,
    // mais recentes primeiro
    data: menus.filter((m) => m.status === s.status && m.weekday == null).sort((a, b) => b.menuDate.localeCompare(a.menuDate)),
  })).filter((s) => s.data.length > 0);
  const templates = menus.filter((m) => m.weekday != null).sort((a, b) => a.weekday! - b.weekday!);
  const visibleSections = view === 'weekly' ? [{ title: 'Cardápio semanal', data: templates }] : sections;
  const today = todayWeekday ?? new Date().getDay();
  const todayTemplate = templates.find((m) => m.weekday === today);

  return (
    <View style={styles.container}>
      <SectionList
        sections={visibleSections}
        ListHeaderComponent={<View style={styles.tabs}>
          <View style={styles.tabRow}>
            <Pressable onPress={() => setView('daily')} style={[styles.tab, view === 'daily' && styles.tabSelected]}><Text style={view === 'daily' ? styles.tabSelectedText : styles.tabText}>Do dia e especiais</Text></Pressable>
            <Pressable onPress={() => setView('weekly')} style={[styles.tab, view === 'weekly' && styles.tabSelected]}><Text style={view === 'weekly' ? styles.tabSelectedText : styles.tabText}>Cardápio semanal</Text></Pressable>
          </View>
          <Text style={styles.muted}>{view === 'weekly' ? 'Monte um modelo para cada dia da semana.' : todayTemplate ? 'O modelo semanal de hoje aparece abaixo. Revise e ative o escolhido.' : 'Sem modelo semanal para hoje. Você pode criar um cardápio especial.'}</Text>
          {view === 'daily' && todayTemplate ? <Pressable style={styles.card} onPress={() => router.push(`/owner/menu/${todayTemplate.id}`)}><Text style={styles.name}>Semanal de hoje: {todayTemplate.name}</Text><Text style={styles.muted}>Toque para revisar ou ativar.</Text></Pressable> : null}
        </View>}
        ListEmptyComponent={<Text style={styles.muted}>Nenhum cardápio nesta seção.</Text>}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => <MenuCard menu={item} />}
        renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
      />
      <View style={styles.footer}>{addButton}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  container: { flex: 1, backgroundColor: colors.background },
  listContent: { padding: spacing.md, gap: spacing.sm },
  sectionTitle: { fontSize: 17, fontWeight: 'bold', color: colors.text, marginTop: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: spacing.md, gap: 2 },
  pressed: { opacity: 0.7 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  name: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
  badge: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: 'hidden',
  },
  date: { fontSize: 14, color: colors.text, textTransform: 'capitalize' },
  muted: { fontSize: 13, color: colors.muted },
  tabs: { gap: spacing.sm },
  tabRow: { flexDirection: 'row', gap: spacing.sm },
  tab: { flex: 1, padding: spacing.sm, backgroundColor: colors.surface, borderRadius: 8, alignItems: 'center' },
  tabSelected: { backgroundColor: colors.primary },
  tabText: { color: colors.text, fontWeight: '600' },
  tabSelectedText: { color: '#fff', fontWeight: '600' },
  footer: { padding: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
