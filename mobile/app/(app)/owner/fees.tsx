import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button } from '../../../src/components/Button';
import { EmptyState } from '../../../src/components/EmptyState';
import { TextField } from '../../../src/components/TextField';
import { type FeeQuote, type FeeRange, formatKm, ownerService, parseDecimal } from '../../../src/services/owner.service';
import { colors, spacing } from '../../../src/theme';
import { getErrorMessage } from '../../../src/utils/errors';
import { formatCurrency } from '../../../src/utils/format';

/** Simula a taxa para uma distância (GET /owner/delivery-fees/quote). */
function QuoteBox() {
  const [distance, setDistance] = useState('');
  const [quote, setQuote] = useState<FeeQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleQuote() {
    setError(null);
    setQuote(null);
    const km = parseDecimal(distance);
    if (!Number.isFinite(km) || km < 0) return setError('Informe a distância em km (ex.: 3,2).');
    setLoading(true);
    try {
      setQuote(await ownerService.fees.quote(km));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.quote}>
      <Text style={styles.sectionTitle}>Simular taxa</Text>
      <View style={styles.quoteRow}>
        <View style={styles.flex}>
          <TextField
            label="Distância (km)"
            placeholder="Ex.: 3,2"
            keyboardType="decimal-pad"
            value={distance}
            onChangeText={setDistance}
          />
        </View>
        <View style={styles.quoteButton}>
          <Button title="Simular" variant="outline" onPress={handleQuote} loading={loading} />
        </View>
      </View>
      {quote ? (
        <Text style={styles.quoteResult}>
          {quote.covered
            ? `${formatKm(quote.distanceKm)}: taxa de ${formatCurrency(quote.fee)}`
            : `${formatKm(quote.distanceKm)}: fora da área atendida`}
        </Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

/** Aba "Taxas": faixas de distância e taxas de entrega (item 7). */
export default function FeesScreen() {
  const [ranges, setRanges] = useState<FeeRange[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setRanges(await ownerService.fees.list());
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

  if (ranges === null) {
    if (error) {
      return (
        <EmptyState icon="⚠️" title="Não foi possível carregar as taxas" message={error}>
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

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Faixas de entrega</Text>
          <Text style={styles.muted}>
            Cada faixa vale para distâncias maiores que o início e até o fim. Fora das faixas, o endereço fica fora da
            área atendida.
          </Text>
          {ranges.length === 0 ? (
            <Text style={styles.empty}>Nenhuma faixa cadastrada: nenhum endereço será atendido.</Text>
          ) : (
            ranges.map((r) => (
              <Pressable
                key={r.id}
                onPress={() => router.push(`/owner/fee-form?id=${r.id}`)}
                style={({ pressed }) => [styles.card, pressed && styles.pressed]}
              >
                <Text style={styles.range}>
                  {formatKm(r.minKm)} até {formatKm(r.maxKm)}
                </Text>
                <Text style={styles.fee}>{formatCurrency(r.fee)}</Text>
              </Pressable>
            ))
          )}
          <Button title="Nova faixa" onPress={() => router.push('/owner/fee-form')} />
        </View>

        <QuoteBox />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.xl },
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: 17, fontWeight: 'bold', color: colors.text },
  muted: { fontSize: 13, color: colors.muted },
  empty: { fontSize: 14, color: colors.danger },
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
  },
  pressed: { opacity: 0.7 },
  range: { fontSize: 15, color: colors.text },
  fee: { fontSize: 16, fontWeight: 'bold', color: colors.primary },
  quote: { gap: spacing.sm, padding: spacing.md, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  quoteRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  quoteButton: { width: 110 },
  quoteResult: { fontSize: 15, fontWeight: '600', color: colors.text },
  error: { fontSize: 14, color: colors.danger },
});
