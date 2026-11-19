import { api } from '../../../src/services/api';
import { router, useFocusEffect } from 'expo-router';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
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
import {
  type Fulfillment,
  type OrderQuote,
  ordersService,
  PAYMENT_LABEL,
  type PaymentMethod,
  STORE_PICKUP_ADDRESS,
} from '../../../src/services/orders.service';
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
 * Finalizar pedido: revisar itens, escolher entrega (com endereço) ou retirada no local
 * (sem taxa) e a forma de pagamento (na entrega ou no balcão).
 * O app só envia variação + quantidade; preços, taxa e total vêm do backend.
 */
export default function CheckoutScreen() {
  const { items, clear, remove, updatePrices } = useCart();
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [quote, setQuote] = useState<OrderQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [priceChanges, setPriceChanges] = useState<string[]>([]);
  const [quoteRequest, setQuoteRequest] = useState(0);
  const [fulfillment, setFulfillment] = useState<Fulfillment>('DELIVERY');
  const [addressId, setAddressId] = useState<string | null>(null);
  const [payment, setPayment] = useState<PaymentMethod>('PIX');
  const [needsChange, setNeedsChange] = useState(false);
  const [changeFor, setChangeFor] = useState('');
  const [estimate, setEstimate] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [itemNotes, setItemNotes] = useState<Record<string, string>>({});
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

  useEffect(() => { api<{ estimatedMinutes: number }>('/estimate', { auth: false }).then(value => setEstimate(value.estimatedMinutes)).catch(() => setEstimate(null)); }, []);

  const pickup = fulfillment === 'PICKUP';

  // o que muda a prévia: entrega/retirada, endereço e variação/quantidade (não o preço, que vem do backend)
  const cartKey = items.map((i) => `${i.variantId}:${i.quantity}`).join(',');

  // prévia (POST /orders/quote): preços de hoje, distância, taxa e total calculados no backend
  useEffect(() => {
    if ((!pickup && !addressId) || items.length === 0) {
      setQuote(null); // ex.: voltou da retirada para a entrega sem endereço cadastrado
      return;
    }
    let stale = false;
    setQuoting(true);
    setQuoteError(null);
    ordersService
      .quote({
        fulfillment,
        addressId: pickup ? null : addressId,
        items: items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
      })
      .then(async (result) => {
        if (stale) return;
        setQuote(result);
        // o preço guardado no carrinho é o do momento em que o item foi adicionado
        const changed: string[] = [];
        const prices: Record<string, number> = {};
        for (const q of result.items) {
          const item = items.find((i) => i.variantId === q.variantId);
          if (item && Math.abs(item.unitPrice - q.unitPrice) > 0.001) {
            changed.push(
              `${item.name} · ${item.variation}: de ${formatCurrency(item.unitPrice)} para ${formatCurrency(q.unitPrice)}`,
            );
            prices[q.variantId] = q.unitPrice;
          }
        }
        if (changed.length > 0) {
          setPriceChanges((current) => [...new Set([...current, ...changed])]);
          await updatePrices(prices);
        }
      })
      .catch((err) => {
        if (stale) return;
        setQuote(null);
        setQuoteError(getErrorMessage(err));
      })
      .finally(() => {
        if (!stale) setQuoting(false);
      });
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recalcula só quando entrega/retirada, endereço ou itens mudam
  }, [fulfillment, addressId, cartKey, quoteRequest]);

  if (items.length === 0) {
    return (
      <EmptyState icon="🛒" title="Seu carrinho está vazio" message="Escolha uma marmita no cardápio.">
        <Button title="Ver cardápio" onPress={() => router.navigate('/customer')} />
      </EmptyState>
    );
  }

  async function handleConfirm() {
    setError(null);
    if (!pickup && !addressId) {
      setError('Escolha um endereço de entrega.');
      return;
    }
    if (!quote) return;
    let change: number | null = null;
    if (payment === 'CASH' && needsChange) {
      change = parseMoney(changeFor);
      if (!Number.isFinite(change) || change < quote.total) {
        setError(`O troco precisa ser para pelo menos ${formatCurrency(quote.total)} (o total do pedido).`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const order = await ordersService.create({
        fulfillment,
        addressId: pickup ? null : addressId,
        paymentMethod: payment,
        changeFor: change,
        notes: notes.trim() || null,
        items: items.map((i) => ({ variantId: i.variantId, quantity: i.quantity, notes: itemNotes[i.variantId]?.trim() || null })),
        expectedTotal: quote.total,
      });
      // troca de tela antes de limpar, para não piscar a tela de "carrinho vazio"
      router.replace(`/customer/order/${order.id}`);
      await clear();
    } catch (err) {
      setError(getErrorMessage(err));
      setSubmitting(false);
      // algo mudou (preço, cardápio, taxa): refaz a prévia para mostrar os valores atuais
      setQuoteRequest((n) => n + 1);
    }
  }

  const unavailable = items.filter((i) => quote?.unavailableVariantIds.includes(i.variantId));
  const canConfirm = (pickup || !!addressId) && !!quote && !quoting && unavailable.length === 0;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Section title="Como você quer receber?">
          {(
            [
              { value: 'DELIVERY', title: 'Entrega', text: 'No seu endereço, com taxa pela distância' },
              { value: 'PICKUP', title: 'Retirar no local', text: 'Você busca na marmitaria, sem taxa' },
            ] as const
          ).map((option) => (
            <Pressable
              key={option.value}
              onPress={() => setFulfillment(option.value)}
              style={[styles.option, option.value === fulfillment && styles.optionSelected]}
            >
              <Radio selected={option.value === fulfillment} />
              <View style={styles.flex}>
                <Text style={styles.optionTitle}>{option.title}</Text>
                <Text style={styles.muted}>{option.text}</Text>
              </View>
            </Pressable>
          ))}
        </Section>

        {pickup ? (
          <Section title="Retirar em">
            <View style={styles.notice}>
              <Text style={styles.optionTitle}>{STORE_PICKUP_ADDRESS.name}</Text>
              <Text style={styles.optionText}>{STORE_PICKUP_ADDRESS.line}</Text>
              <Text style={styles.muted}>Acompanhe pela tela do pedido: ele aparece como "Pronto para retirada" quando puder buscar.</Text>
            </View>
          </Section>
        ) : (
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
        )}

        <Section title={pickup ? 'Pagamento na retirada' : 'Pagamento na entrega'}>
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

        <Section title="Observações por item">
          {items.map(item => <TextField key={item.id} label={`${item.name} · ${item.variation} (opcional)`} value={itemNotes[item.variantId] ?? ''} onChangeText={value => setItemNotes(current => ({ ...current, [item.variantId]: value }))} maxLength={200} placeholder="Ex.: sem cebola" />)}
        </Section>

        <Section title="Resumo">
          {estimate !== null ? <Text style={styles.optionText}>Tempo médio estimado: {estimate} min. Seu pedido pode ficar pronto antes.</Text> : null}
          <Text style={styles.optionText}>{pickup ? `Retirada: ${STORE_PICKUP_ADDRESS.line}` : `Entrega: ${addresses?.find(a => a.id === addressId) ? addressLine(addresses.find(a => a.id === addressId)!) : 'endereço não selecionado'}`}</Text>
          <Text style={styles.optionText}>Pagamento: {PAYMENT_LABEL[payment]}{payment === 'CASH' && needsChange ? ` · troco para R$ ${changeFor}` : ''}</Text>
          {unavailable.length > 0 ? (
            <View style={[styles.notice, styles.noticeDanger]}>
              <Text style={styles.noticeTitle}>
                {unavailable.length === 1 ? 'Este item saiu' : 'Estes itens saíram'} do cardápio de hoje:
              </Text>
              {unavailable.map((i) => (
                <Text key={i.id} style={styles.optionText}>
                  • {i.name} · {i.variation}
                </Text>
              ))}
              <Button
                title="Remover do carrinho"
                variant="outline"
                onPress={async () => {
                  for (const i of unavailable) await remove(i.id);
                }}
              />
            </View>
          ) : null}

          {priceChanges.length > 0 ? (
            <View style={styles.notice}>
              <Text style={styles.noticeTitle}>Alguns preços mudaram desde que você montou o carrinho:</Text>
              {priceChanges.map((change) => (
                <Text key={change} style={styles.optionText}>
                  • {change}
                </Text>
              ))}
            </View>
          ) : null}

          {items
            .filter((item) => !unavailable.includes(item))
            .map((item) => (
              <View key={item.id} style={styles.summaryRow}>
                <Text style={styles.summaryItem}>
                  {item.quantity}x {item.name} · {item.variation}
                </Text>
                <Text style={styles.optionText}>{formatCurrency(item.unitPrice * item.quantity)}</Text>
              </View>
            ))}

          <View style={[styles.summaryRow, styles.summaryDivider]}>
            <Text style={styles.optionText}>Subtotal</Text>
            <Text style={styles.optionText}>{quote ? formatCurrency(quote.subtotal) : '—'}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.optionText}>
              {pickup ? 'Retirada no local' : 'Taxa de entrega'}
              {quote?.distanceMeters != null
                ? ` (${(quote.distanceMeters / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km)`
                : ''}
            </Text>
            {quoting ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={styles.optionText}>{pickup ? 'Grátis' : quote ? formatCurrency(quote.deliveryFee) : '—'}</Text>
            )}
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.total}>Total</Text>
            <Text style={styles.total}>{quote && !quoting ? formatCurrency(quote.total) : '—'}</Text>
          </View>
          {quoteError ? (
            <View style={[styles.notice, styles.noticeDanger]}>
              <Text style={styles.optionText}>{quoteError}</Text>
              <Pressable onPress={() => setQuoteRequest((n) => n + 1)} hitSlop={8}>
                <Text style={styles.link}>Tentar de novo</Text>
              </Pressable>
            </View>
          ) : null}
        </Section>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button title="Confirmar pedido" onPress={handleConfirm} loading={submitting} disabled={!canConfirm} />
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
  total: { fontSize: 17, fontWeight: 'bold', color: colors.text },
  notice: { gap: spacing.xs, padding: spacing.md, borderRadius: 10, backgroundColor: '#FFF7ED' },
  noticeDanger: { backgroundColor: '#FEF2F2' },
  noticeTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
});
