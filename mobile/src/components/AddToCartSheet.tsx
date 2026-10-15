import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCart } from '../contexts/CartContext';
import type { MenuItem } from '../services/customerMenu.service';
import { colors, spacing } from '../theme';
import { formatCurrency } from '../utils/format';
import { Button } from './Button';
import { QuantityStepper } from './QuantityStepper';

interface AddToCartSheetProps {
  /** Item escolhido no cardápio; null deixa a janela fechada. */
  item: MenuItem | null;
  menuDate: string;
  onClose(): void;
}

/** Janela que sobe de baixo para escolher variação e quantidade antes de adicionar ao carrinho. */
export function AddToCartSheet({ item, menuDate, onClose }: AddToCartSheetProps) {
  const { add } = useCart();
  const insets = useSafeAreaInsets();
  const [variation, setVariation] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [saving, setSaving] = useState(false);

  // a cada item aberto, começa do zero (com uma variação só, ela já vem marcada)
  useEffect(() => {
    setVariation(item?.variations.length === 1 ? item.variations[0] : null);
    setQuantity(1);
  }, [item]);

  if (!item) return null;

  const needsVariation = item.variations.length > 0;
  const canAdd = !needsVariation || variation !== null;

  async function handleAdd() {
    if (!item) return;
    setSaving(true);
    try {
      await add(
        { productId: item.productId, name: item.name, variation, unitPrice: item.price, menuDate },
        quantity,
      );
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: spacing.lg + insets.bottom }]}>
        <View>
          <Text style={styles.name}>{item.name}</Text>
          {item.description ? <Text style={styles.description}>{item.description}</Text> : null}
          <Text style={styles.price}>{formatCurrency(item.price)}</Text>
        </View>

        {needsVariation ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Escolha uma opção</Text>
            <View style={styles.options}>
              {item.variations.map((option) => {
                const selected = option === variation;
                return (
                  <Pressable
                    key={option}
                    onPress={() => setVariation(option)}
                    style={[styles.option, selected && styles.optionSelected]}
                  >
                    <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{option}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        <View style={styles.quantityRow}>
          <Text style={styles.sectionTitle}>Quantidade</Text>
          <QuantityStepper value={quantity} onChange={setQuantity} />
        </View>

        <Button
          title={canAdd ? `Adicionar · ${formatCurrency(item.price * quantity)}` : 'Escolha uma opção'}
          onPress={handleAdd}
          disabled={!canAdd}
          loading={saving}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.4)' },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  name: { fontSize: 22, fontWeight: 'bold', color: colors.text },
  description: { color: colors.muted, marginTop: spacing.xs },
  price: { fontSize: 18, fontWeight: 'bold', color: colors.primary, marginTop: spacing.sm },
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  option: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  optionText: { color: colors.text },
  optionTextSelected: { color: colors.primaryText, fontWeight: '600' },
  quantityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
