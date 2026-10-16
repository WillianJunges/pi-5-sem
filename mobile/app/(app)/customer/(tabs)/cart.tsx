import { router } from 'expo-router';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../../../src/components/Button';
import { EmptyState } from '../../../../src/components/EmptyState';
import { QuantityStepper } from '../../../../src/components/QuantityStepper';
import { useCart } from '../../../../src/contexts/CartContext';
import type { CartItem } from '../../../../src/services/cartStorage';
import { colors, spacing } from '../../../../src/theme';
import { formatCurrency } from '../../../../src/utils/format';

function CartRow({ item }: { item: CartItem }) {
  const { setQuantity, remove } = useCart();
  return (
    <View style={styles.row}>
      <View style={styles.rowInfo}>
        <Text style={styles.name}>{item.name}</Text>
        {item.variation ? <Text style={styles.variation}>{item.variation}</Text> : null}
        <Text style={styles.unitPrice}>{formatCurrency(item.unitPrice)} cada</Text>
      </View>
      <View style={styles.rowActions}>
        <Text style={styles.lineTotal}>{formatCurrency(item.unitPrice * item.quantity)}</Text>
        {/* min 0: tirar a última unidade remove o item */}
        <QuantityStepper value={item.quantity} min={0} onChange={(q) => setQuantity(item.id, q)} />
        <Pressable onPress={() => remove(item.id)} hitSlop={8}>
          <Text style={styles.remove}>Remover</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Carrinho salvo no aparelho (SQLite). Continua lá mesmo fechando o app. */
export default function CartScreen() {
  const { items, loading, subtotal, clear } = useCart();

  // apagar tudo por engano não tem volta: pede confirmação
  function confirmClear() {
    Alert.alert('Limpar carrinho?', 'Todos os itens serão removidos.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Limpar', style: 'destructive', onPress: () => clear() },
    ]);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState icon="🛒" title="Seu carrinho está vazio" message="Escolha uma marmita no cardápio.">
        <Button title="Ver cardápio" onPress={() => router.navigate('/customer')} />
      </EmptyState>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <CartRow item={item} />}
        contentContainerStyle={styles.listContent}
        ListFooterComponent={
          <Pressable onPress={confirmClear} hitSlop={8} style={styles.clear}>
            <Text style={styles.remove}>Limpar carrinho</Text>
          </Pressable>
        }
      />
      <View style={styles.footer}>
        <View style={styles.subtotalRow}>
          <Text style={styles.subtotalLabel}>Subtotal</Text>
          <Text style={styles.subtotalValue}>{formatCurrency(subtotal)}</Text>
        </View>
        <Text style={styles.feeHint}>A taxa de entrega é calculada no próximo passo.</Text>
        <Button title="Continuar" onPress={() => router.push('/customer/checkout')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  container: { flex: 1, backgroundColor: colors.background },
  listContent: { padding: spacing.md, gap: spacing.md },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
  },
  rowInfo: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: '600', color: colors.text },
  variation: { color: colors.text },
  unitPrice: { fontSize: 13, color: colors.muted },
  rowActions: { alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.sm },
  lineTotal: { fontSize: 16, fontWeight: 'bold', color: colors.text },
  remove: { fontSize: 13, color: colors.danger },
  clear: { alignSelf: 'center', paddingVertical: spacing.sm },
  footer: {
    padding: spacing.md,
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  subtotalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  subtotalLabel: { fontSize: 16, color: colors.text },
  subtotalValue: { fontSize: 18, fontWeight: 'bold', color: colors.text },
  feeHint: { fontSize: 13, color: colors.muted },
});
