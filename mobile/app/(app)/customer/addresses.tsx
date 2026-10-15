import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../../src/components/Button';
import { EmptyState } from '../../../src/components/EmptyState';
import { type Address, addressesService, addressLine, formatCep } from '../../../src/services/addresses.service';
import { colors, spacing } from '../../../src/theme';
import { getErrorMessage } from '../../../src/utils/errors';

function AddressCard({
  address,
  onSetDefault,
  onDelete,
}: {
  address: Address;
  onSetDefault(): void;
  onDelete(): void;
}) {
  return (
    <View style={[styles.card, address.isDefault && styles.cardDefault]}>
      <View style={styles.cardHeader}>
        <Text style={styles.label}>{address.label ?? 'Endereço'}</Text>
        {address.isDefault ? <Text style={styles.defaultBadge}>Principal</Text> : null}
      </View>
      <Text style={styles.line}>{addressLine(address)}</Text>
      <Text style={styles.muted}>
        {address.district} · {address.city}/{address.state} · {formatCep(address.cep)}
      </Text>
      {address.latitude === null ? (
        <Text style={styles.warning}>Não encontramos no mapa. Confira rua e número.</Text>
      ) : null}

      <View style={styles.actions}>
        {!address.isDefault ? <Action label="Tornar principal" onPress={onSetDefault} /> : null}
        <Action label="Editar" onPress={() => router.push(`/customer/address-form?id=${address.id}`)} />
        <Action label="Excluir" danger onPress={onDelete} />
      </View>
    </View>
  );
}

function Action({ label, danger, onPress }: { label: string; danger?: boolean; onPress(): void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8}>
      <Text style={[styles.action, danger && { color: colors.danger }]}>{label}</Text>
    </Pressable>
  );
}

/** Endereços de entrega do cliente. */
export default function AddressesScreen() {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setAddresses(await addressesService.list());
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // recarrega sempre que a tela aparece (ex.: voltando do formulário)
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function run(action: () => Promise<void>) {
    try {
      await action();
      await load();
    } catch (err) {
      Alert.alert('Ops', getErrorMessage(err));
    }
  }

  function confirmDelete(address: Address) {
    Alert.alert('Excluir endereço?', addressLine(address), [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: () => run(() => addressesService.remove(address.id)) },
    ]);
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
      <EmptyState icon="⚠️" title="Não foi possível carregar os endereços" message={error}>
        <Button title="Tentar de novo" onPress={() => { setLoading(true); load(); }} />
      </EmptyState>
    );
  }

  const addButton = <Button title="Adicionar endereço" onPress={() => router.push('/customer/address-form')} />;

  if (addresses.length === 0) {
    return (
      <EmptyState icon="📍" title="Nenhum endereço cadastrado" message="Cadastre onde você quer receber suas marmitas.">
        {addButton}
      </EmptyState>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={addresses}
        keyExtractor={(a) => a.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <AddressCard
            address={item}
            onSetDefault={() => run(() => addressesService.setDefault(item.id))}
            onDelete={() => confirmDelete(item)}
          />
        )}
      />
      <View style={styles.footer}>{addButton}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  container: { flex: 1, backgroundColor: colors.background },
  listContent: { padding: spacing.md, gap: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    gap: 2,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  cardDefault: { borderColor: colors.primary },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  label: { fontSize: 16, fontWeight: 'bold', color: colors.text },
  defaultBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: colors.primary,
    color: colors.primaryText,
    fontSize: 12,
    fontWeight: '600',
  },
  line: { color: colors.text },
  muted: { fontSize: 13, color: colors.muted },
  warning: { fontSize: 13, color: colors.danger, marginTop: spacing.xs },
  actions: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.sm },
  action: { fontSize: 14, fontWeight: '600', color: colors.primary },
  footer: {
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
