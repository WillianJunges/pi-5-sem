import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCart } from '../contexts/CartContext';
import { isOnSale, type MenuItem, type MenuVariation } from '../services/customerMenu.service';
import { colors, spacing } from '../theme';
import { formatCurrency } from '../utils/format';
import { Button } from './Button';
import { getErrorMessage } from '../utils/errors';
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
  const [variation, setVariation] = useState<MenuVariation | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [saving, setSaving] = useState(false);

  // a cada item aberto, começa do zero (com uma variação só, ela já vem marcada)
  useEffect(() => {
    setVariation(item?.variations.length === 1 ? item.variations[0] : null);
    setQuantity(1);
  }, [item]);

  if (!item) return null;

  const samePrice = item.variations.every((v) => v.price === item.price);

  async function handleAdd() {
    if (!item || !variation) return;
    setSaving(true);
    try {
      await add(
        {
          productId: item.productId,
          variantId: variation.variantId,
          name: item.name,
          variation: variation.name,
          unitPrice: variation.price,
          menuDate,
        },
        quantity,
      );
      onClose();
    } catch (error) {
      Alert.alert('Não foi possível adicionar', getErrorMessage(error));
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
          <Text style={styles.price}>
            {!variation && !samePrice ? 'a partir de ' : ''}
            {formatCurrency(variation?.price ?? item.price)}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {item.variations.length > 1 ? 'Escolha uma opção' : 'Opção'}
          </Text>
          {item.variations.map((option) => {
            const selected = option.variantId === variation?.variantId;
            return (
              <Pressable
                key={option.variantId}
                onPress={() => setVariation(option)}
                style={[styles.option, selected && styles.optionSelected]}
              >
                <View style={[styles.radio, selected && styles.radioSelected]} />
                <Text style={styles.optionName}>{option.name}</Text>
                {isOnSale(option) ? (
                  <Text style={styles.standardPrice}>{formatCurrency(option.standardPrice)}</Text>
                ) : null}
                <Text style={styles.optionPrice}>{formatCurrency(option.price)}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.quantityRow}>
          <Text style={styles.sectionTitle}>Quantidade</Text>
          <QuantityStepper value={quantity} onChange={setQuantity} />
        </View>

        <Button
          title={variation ? `Adicionar · ${formatCurrency(variation.price * quantity)}` : 'Escolha uma opção'}
          onPress={handleAdd}
          disabled={!variation}
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
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionSelected: { borderColor: colors.primary, backgroundColor: '#FFF7ED' },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.border },
  radioSelected: { borderColor: colors.primary, borderWidth: 6 },
  optionName: { flex: 1, fontSize: 15, color: colors.text },
  standardPrice: { fontSize: 13, color: colors.muted, textDecorationLine: 'line-through' },
  optionPrice: { fontSize: 15, fontWeight: '600', color: colors.text },
  quantityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
