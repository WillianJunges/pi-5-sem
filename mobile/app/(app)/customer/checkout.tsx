import { router, useFocusEffect } from 'expo-router';
import { type ReactNode, useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Button } from '../../../src/components/Button';
import { EmptyState } from '../../../src/components/EmptyState';
import { TextField } from '../../../src/components/TextField';
import { useCart } from '../../../src/contexts/CartContext';
import { type Address, addressesService, addressLine } from '../../../src/services/addresses.service';
import { ordersService, PAYMENT_LABEL, type PaymentMethod } from '../../../src/services/orders.service';
import { colors, spacing } from '../../../src/theme';
import { getErrorMessage } from '../../../src/utils/errors';
import { formatCurrency } from '../../../src/utils/format';

const PAYMENT_METHODS: PaymentMethod[] = ['PIX', 'CASH', 'CREDIT_CARD', 'DEBIT_CARD'];

/** "50" / "50,00" / "50.5" → 50.5; texto inválido → NaN */
function parseMoney(text: string): number {
  return Number(text.replace(/\s/g, '').replace(',', '.'));
}

function Radio({ selected }: { selected: boolean }) {
  return <View style={[styles.radio, selected && styles.radioSelected]} />;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

/**
 * Finalizar pedido: revisar itens, escolher endereço e forma de pagamento (na entrega).
 * O app só envia variação + quantidade; preços, taxa e total vêm do backend.
 */
export default function CheckoutScreen() {
  const { items, subtotal, clear } = useCart();
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [payment, setPayment] = useState<PaymentMethod>('PIX');
  const [needsChange, setNeedsChange] = useState(false);
  const [changeFor, setChangeFor] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // recarrega os endereços ao voltar da tela de cadastro
  useFocusEffect(
    useCallback(() => {
      addressesService
        .list()
        .then((list) => {
          setAddresses(list);
          // mantém a escolha; se não houver (ou foi excluída), usa o principal
          setAddressId((current) =>
            current && list.some((a) => a.id === current) ? current : (list.find((a) => a.isDefault) ?? list[0])?.id ?? null,
          );
        })
        .catch((err) => setError(getErrorMessage(err)));
    }, []),
  );

  if (items.length === 0) {
    return (
      <EmptyState icon="🛒" title="Seu carrinho está vazio" message="Escolha uma marmita no cardápio.">
        <Button title="Ver cardápio" onPress={() => router.navigate('/customer')} />
      </EmptyState>
    );
  }

  async function handleConfirm() {
    setError(null);
    if (!addressId) {
      setError('Escolha um endereço de entrega.');
      return;
    }
    let change: number | null = null;
    if (payment === 'CASH' && needsChange) {
      change = parseMoney(changeFor);
      if (!Number.isFinite(change) || change <= subtotal) {
        setError(`Informe um valor para troco maior que ${formatCurrency(subtotal)}.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const order = await ordersService.create({
        addressId,
        paymentMethod: payment,
        changeFor: change,
        notes: notes.trim() || null,
        items: items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
      });
      // troca de tela antes de limpar, para não piscar a tela de "carrinho vazio"
      router.replace(`/customer/order/${order.id}`);
      await clear();
    } catch (err) {
      setError(getErrorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Section title="Endereço de entrega">
          {addresses === null ? (
            <ActivityIndicator color={colors.primary} />
          ) : addresses.length === 0 ? (
            <Button title="Cadastrar endereço" variant="outline" onPress={() => router.push('/customer/address-form')} />
          ) : (
            <>
              {addresses.map((a) => (
                <Pressable
                  key={a.id}
                  onPress={() => setAddressId(a.id)}
                  style={[styles.option, a.id === addressId && styles.optionSelected]}
                >
                  <Radio selected={a.id === addressId} />
                  <View style={styles.flex}>
                    <Text style={styles.optionTitle}>{a.label ?? 'Endereço'}</Text>
                    <Text style={styles.optionText}>{addressLine(a)}</Text>
                    <Text style={styles.muted}>
                      {a.district} · {a.city}/{a.state}
                    </Text>
                    {a.latitude === null ? (
                      <Text style={styles.warning}>Não localizado no mapa: edite o endereço antes de pedir.</Text>
                    ) : null}
                  </View>
                </Pressable>
              ))}
              <Pressable onPress={() => router.push('/customer/addresses')} hitSlop={8}>
                <Text style={styles.link}>Gerenciar endereços</Text>
              </Pressable>
            </>
          )}
        </Section>

        <Section title="Pagamento na entrega">
          {PAYMENT_METHODS.map((method) => (
            <Pressable
              key={method}
              onPress={() => setPayment(method)}
              style={[styles.option, method === payment && styles.optionSelected]}
            >
              <Radio selected={method === payment} />
              <Text style={styles.optionTitle}>{PAYMENT_LABEL[method]}</Text>
            </Pressable>
          ))}
          {payment === 'CASH' ? (
            <View style={styles.changeBox}>
              <View style={styles.switchRow}>
                <Text style={styles.optionText}>Precisa de troco?</Text>
                <Switch value={needsChange} onValueChange={setNeedsChange} trackColor={{ true: colors.primary }} />
              </View>
              {needsChange ? (
                <TextField
                  label="Troco para quanto?"
                  placeholder="Ex.: 100"
                  keyboardType="decimal-pad"
                  value={changeFor}
                  onChangeText={setChangeFor}
                />
              ) : null}
            </View>
          ) : null}
        </Section>

        <Section title="Observações">
          <TextField
            label="Algum pedido especial? (opcional)"
            placeholder="Ex.: sem cebola, interfone quebrado..."
            value={notes}
            onChangeText={setNotes}
            maxLength={300}
            multiline
            style={styles.notes}
          />
        </Section>

        <Section title="Resumo">
          {items.map((item) => (
            <View key={item.id} style={styles.summaryRow}>
              <Text style={styles.summaryItem}>
                {item.quantity}x {item.name} · {item.variation}
              </Text>
              <Text style={styles.optionText}>{formatCurrency(item.unitPrice * item.quantity)}</Text>
            </View>
          ))}
          <View style={[styles.summaryRow, styles.summaryDivider]}>
            <Text style={styles.optionText}>Subtotal</Text>
            <Text style={styles.optionText}>{formatCurrency(subtotal)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.optionText}>Taxa de entrega</Text>
            <Text style={styles.muted}>calculada ao confirmar</Text>
          </View>
          <Text style={styles.muted}>
            Os preços são conferidos pela marmitaria na hora do pedido. O total final aparece na próxima tela.
          </Text>
        </Section>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button title="Confirmar pedido" onPress={handleConfirm} loading={submitting} disabled={!addressId} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: spacing.md, gap: spacing.lg, backgroundColor: colors.background },
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: 17, fontWeight: 'bold', color: colors.text },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionSelected: { borderColor: colors.primary, backgroundColor: '#FFF7ED' },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.border },
  radioSelected: { borderColor: colors.primary, borderWidth: 6 },
  optionTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  optionText: { fontSize: 15, color: colors.text },
  muted: { fontSize: 13, color: colors.muted },
  warning: { fontSize: 13, color: colors.danger, marginTop: 2 },
  link: { fontSize: 14, fontWeight: '600', color: colors.primary },
  changeBox: { gap: spacing.sm, paddingHorizontal: spacing.xs },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  notes: { height: 80, paddingTop: spacing.sm, textAlignVertical: 'top' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  summaryItem: { flex: 1, fontSize: 15, color: colors.text },
  summaryDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  error: { fontSize: 14, color: colors.danger },
});
