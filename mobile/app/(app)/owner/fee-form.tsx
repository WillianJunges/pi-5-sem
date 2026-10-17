import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button } from '../../../src/components/Button';
import { TextField } from '../../../src/components/TextField';
import { kmToText, moneyToText, ownerService, parseDecimal } from '../../../src/services/owner.service';
import { colors, spacing } from '../../../src/theme';
import { getErrorMessage } from '../../../src/utils/errors';

/**
 * Cadastro e edição de faixa de taxa de entrega (item 7).
 * Ex.: de 0 até 5 km, R$ 6,00. Remover só desativa (os pedidos guardam a taxa aplicada).
 */
export default function FeeFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const navigation = useNavigation();
  const editing = !!id;

  const [minKm, setMinKm] = useState('');
  const [maxKm, setMaxKm] = useState('');
  const [fee, setFee] = useState('');
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: editing ? 'Editar faixa' : 'Nova faixa' });
  }, [navigation, editing]);

  // não existe GET de uma faixa só: procura na lista
  useEffect(() => {
    if (!id) return;
    ownerService.fees
      .list()
      .then((ranges) => {
        const range = ranges.find((r) => r.id === id);
        if (!range) return setError('Faixa não encontrada.');
        setMinKm(kmToText(range.minKm));
        setMaxKm(kmToText(range.maxKm));
        setFee(moneyToText(range.fee));
      })
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleSave() {
    setError(null);
    const data = { minKm: parseDecimal(minKm), maxKm: parseDecimal(maxKm), fee: parseDecimal(fee) };
    if (!Number.isFinite(data.minKm) || data.minKm < 0) return setError('Informe a distância inicial em km (ex.: 0).');
    if (!Number.isFinite(data.maxKm) || data.maxKm <= data.minKm) {
      return setError('A distância final precisa ser maior que a inicial.');
    }
    if (!Number.isFinite(data.fee) || data.fee < 0) return setError('Informe a taxa em reais (ex.: 6,00).');

    setSaving(true);
    try {
      if (id) await ownerService.fees.update(id, data);
      else await ownerService.fees.create(data);
      router.back();
    } catch (err) {
      setError(getErrorMessage(err));
      setSaving(false);
    }
  }

  function confirmRemove() {
    if (!id) return;
    Alert.alert('Remover faixa?', 'Endereços nessa distância passam a ficar fora da área atendida.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          try {
            await ownerService.fees.remove(id);
            router.back();
          } catch (err) {
            Alert.alert('Ops', getErrorMessage(err));
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.row}>
          <View style={styles.flex}>
            <TextField label="De (km)" placeholder="0" keyboardType="decimal-pad" value={minKm} onChangeText={setMinKm} />
          </View>
          <View style={styles.flex}>
            <TextField label="Até (km)" placeholder="5" keyboardType="decimal-pad" value={maxKm} onChangeText={setMaxKm} />
          </View>
        </View>
        <TextField label="Taxa (R$)" placeholder="6,00" keyboardType="decimal-pad" value={fee} onChangeText={setFee} />
        <Text style={styles.muted}>
          A faixa vale para distâncias maiores que o início e até o fim. Faixas não podem se sobrepor, mas podem se
          encostar (ex.: 0 a 5 km e 5 a 10 km).
        </Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button title={editing ? 'Salvar' : 'Cadastrar faixa'} onPress={handleSave} loading={saving} />
        {editing ? (
          <Pressable onPress={confirmRemove} hitSlop={8} style={styles.remove}>
            <Text style={styles.removeText}>Remover faixa</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  container: { padding: spacing.md, gap: spacing.lg },
  row: { flexDirection: 'row', gap: spacing.md },
  muted: { fontSize: 13, color: colors.muted },
  error: { fontSize: 14, color: colors.danger },
  remove: { alignItems: 'center', paddingVertical: spacing.sm },
  removeText: { fontSize: 15, fontWeight: '600', color: colors.danger },
});
