import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  type TextInput,
  View,
} from 'react-native';
import { Button } from '../../../src/components/Button';
import { TextField } from '../../../src/components/TextField';
import {
  type AddressInput,
  type AddressSuggestion,
  addressesService,
  formatCep,
} from '../../../src/services/addresses.service';
import { colors, spacing } from '../../../src/theme';
import { getErrorMessage } from '../../../src/utils/errors';

const LABELS = ['Casa', 'Trabalho', 'Outro'];

const EMPTY: AddressInput = {
  label: 'Casa',
  cep: '',
  street: '',
  number: '',
  complement: null,
  district: '',
  city: '',
  state: '',
  isDefault: false,
};

/** Busca por nome da rua (Photon) para quem não sabe o CEP. */
function StreetSearch({ onPick }: { onPick(s: AddressSuggestion): void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AddressSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const lastRequest = useRef(0);

  // espera o cliente parar de digitar (400 ms) antes de buscar
  useEffect(() => {
    const text = query.trim();
    if (text.length < 3) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const request = ++lastRequest.current;
      setSearching(true);
      try {
        const found = await addressesService.search(text);
        // ignora respostas atrasadas de buscas antigas
        if (request === lastRequest.current) setResults(found);
      } catch {
        if (request === lastRequest.current) setResults([]);
      } finally {
        if (request === lastRequest.current) setSearching(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <View style={styles.search}>
      <TextField
        label="Não sabe o CEP? Busque pela rua"
        placeholder="Ex.: Rua Dom Pedro I, Indaiatuba"
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
      />
      {searching ? <ActivityIndicator color={colors.primary} style={styles.searchSpinner} /> : null}
      {results.map((s, i) => (
        <Pressable
          key={`${s.street}-${s.district}-${s.cep}-${i}`}
          onPress={() => {
            onPick(s);
            setQuery('');
            setResults([]);
          }}
          style={({ pressed }) => [styles.suggestion, pressed && { backgroundColor: colors.surface }]}
        >
          <Text style={styles.suggestionTitle}>
            {s.street}
            {s.number ? `, ${s.number}` : ''}
          </Text>
          <Text style={styles.suggestionSubtitle}>
            {[s.district, s.city && s.state ? `${s.city}/${s.state}` : s.city, s.cep && formatCep(s.cep)]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Cadastro (sem id) e edição (?id=...) de endereço. */
export default function AddressFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = Boolean(id);
  const [form, setForm] = useState<AddressInput>(EMPTY);
  const [loading, setLoading] = useState(editing);
  const [cepStatus, setCepStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const numberRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!id) return;
    addressesService
      .get(id)
      .then((a) =>
        setForm({
          label: a.label,
          cep: a.cep,
          street: a.street,
          number: a.number,
          complement: a.complement,
          district: a.district,
          city: a.city,
          state: a.state,
          isDefault: a.isDefault,
        }),
      )
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [id]);

  function set<K extends keyof AddressInput>(key: K, value: AddressInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleCepChange(text: string) {
    const digits = text.replace(/\D/g, '').slice(0, 8);
    set('cep', digits);
    setCepStatus('idle');
    if (digits.length !== 8) return;

    setCepStatus('loading');
    try {
      const found = await addressesService.lookupCep(digits);
      setForm((f) => ({
        ...f,
        // CEP de cidade pequena vem sem rua/bairro: mantém o que o cliente já digitou
        street: found.street || f.street,
        district: found.district || f.district,
        city: found.city,
        state: found.state,
      }));
      setCepStatus('idle');
      numberRef.current?.focus();
    } catch {
      setCepStatus('error');
    }
  }

  function handlePick(s: AddressSuggestion) {
    setForm((f) => ({
      ...f,
      street: s.street,
      number: s.number ?? f.number,
      district: s.district ?? f.district,
      city: s.city ?? f.city,
      state: s.state ?? f.state,
      cep: s.cep ?? f.cep,
    }));
    setCepStatus('idle');
    numberRef.current?.focus();
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      if (id) await addressesService.update(id, form);
      else await addressesService.create(form);
      router.back();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
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
      <Stack.Screen options={{ title: editing ? 'Editar endereço' : 'Novo endereço' }} />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View>
          <TextField
            label="CEP"
            placeholder="00000-000"
            keyboardType="number-pad"
            value={formatCep(form.cep)}
            onChangeText={handleCepChange}
            maxLength={9}
          />
          {cepStatus === 'loading' ? <Text style={styles.hint}>Buscando CEP...</Text> : null}
          {cepStatus === 'error' ? (
            <Text style={styles.error}>CEP não encontrado. Confira ou preencha os campos abaixo.</Text>
          ) : null}
        </View>

        <StreetSearch onPick={handlePick} />

        <View style={styles.divider} />

        <TextField label="Rua" value={form.street} onChangeText={(v) => set('street', v)} />
        <View style={styles.row}>
          <View style={styles.numberField}>
            <TextField
              ref={numberRef}
              label="Número"
              placeholder="ou S/N"
              value={form.number}
              onChangeText={(v) => set('number', v)}
            />
          </View>
          <View style={styles.flex}>
            <TextField
              label="Complemento"
              placeholder="Apto, bloco..."
              value={form.complement ?? ''}
              onChangeText={(v) => set('complement', v)}
            />
          </View>
        </View>
        <TextField label="Bairro" value={form.district} onChangeText={(v) => set('district', v)} />
        <View style={styles.row}>
          <View style={styles.flex}>
            <TextField label="Cidade" value={form.city} onChangeText={(v) => set('city', v)} />
          </View>
          <View style={styles.ufField}>
            <TextField
              label="UF"
              value={form.state}
              onChangeText={(v) => set('state', v.toUpperCase())}
              autoCapitalize="characters"
              maxLength={2}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Identificação</Text>
          <View style={styles.chips}>
            {LABELS.map((label) => {
              const selected = form.label === label;
              return (
                <Pressable
                  key={label}
                  onPress={() => set('label', label)}
                  style={[styles.chip, selected && styles.chipSelected]}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.switchRow}>
          <Text style={styles.sectionTitle}>Usar como endereço principal</Text>
          <Switch
            value={form.isDefault ?? false}
            onValueChange={(v) => set('isDefault', v)}
            trackColor={{ true: colors.primary }}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button title="Salvar endereço" onPress={handleSave} loading={saving} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  container: { padding: spacing.lg, gap: spacing.md, backgroundColor: colors.background },
  hint: { fontSize: 13, color: colors.muted, marginTop: spacing.xs },
  error: { fontSize: 13, color: colors.danger, marginTop: spacing.xs },
  search: { gap: spacing.xs },
  searchSpinner: { alignSelf: 'flex-start' },
  suggestion: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  suggestionTitle: { fontSize: 15, color: colors.text },
  suggestionSubtitle: { fontSize: 13, color: colors.muted },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.md },
  numberField: { width: 110 },
  ufField: { width: 70 },
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  chips: { flexDirection: 'row', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  chipText: { color: colors.text },
  chipTextSelected: { color: colors.primaryText, fontWeight: '600' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
