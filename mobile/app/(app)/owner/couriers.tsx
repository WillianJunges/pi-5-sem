import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../../src/components/Button';
import { EmptyState } from '../../../src/components/EmptyState';
import { type Courier, ownerService } from '../../../src/services/owner.service';
import { colors, spacing } from '../../../src/theme';
import { getErrorMessage } from '../../../src/utils/errors';

function CourierCard({ courier }: { courier: Courier }) {
  return (
    <Pressable
      onPress={() => router.push(`/owner/courier-form?id=${courier.id}`)}
      style={({ pressed }) => [styles.card, !courier.active && styles.inactive, pressed && styles.pressed]}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.name}>{courier.name}</Text>
        {!courier.active ? <Text style={styles.badge}>Desativado</Text> : null}
      </View>
      <Text style={styles.muted}>{courier.email}</Text>
      {courier.phone ? <Text style={styles.muted}>{courier.phone}</Text> : null}
    </Pressable>
  );
}

/** Motoboys da marmitaria (item 4): a proprietária cria as contas e pode desativá-las. */
export default function CouriersScreen() {
  const [couriers, setCouriers] = useState<Courier[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setCouriers(await ownerService.couriers.list());
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, []);

  // recarrega ao voltar do formulário
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

  const addButton = <Button title="Novo motoboy" onPress={() => router.push('/owner/courier-form')} />;

  if (couriers === null) {
    return error ? (
      <EmptyState icon="⚠️" title="Não foi possível carregar os motoboys" message={error}>
        <Button title="Tentar de novo" onPress={load} />
      </EmptyState>
    ) : (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (couriers.length === 0) {
    return (
      <EmptyState icon="🛵" title="Nenhum motoboy cadastrado" message="Crie a conta de cada motoboy para ele entrar no app.">
        {addButton}
      </EmptyState>
    );
  }

  // ativos primeiro; dentro de cada grupo, a ordem por nome que vem da API
  const sorted = [...couriers].sort((a, b) => Number(b.active) - Number(a.active));

  return (
    <View style={styles.container}>
      <FlatList
        data={sorted}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => <CourierCard courier={item} />}
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
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: spacing.md, gap: 2 },
  inactive: { opacity: 0.6 },
  pressed: { opacity: 0.7 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  name: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
  badge: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: 'hidden',
  },
  muted: { fontSize: 14, color: colors.muted },
  footer: { padding: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
