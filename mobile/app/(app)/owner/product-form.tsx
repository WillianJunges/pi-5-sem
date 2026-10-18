import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Button } from '../../../src/components/Button';
import { EmptyState } from '../../../src/components/EmptyState';
import { TextField } from '../../../src/components/TextField';
import {
  moneyToText,
  ownerService,
  parseDecimal,
  type Product,
  type Variant,
} from '../../../src/services/owner.service';
import { colors, spacing } from '../../../src/theme';
import { getErrorMessage } from '../../../src/utils/errors';

/** Linha de variação sendo digitada (ainda como texto). */
interface VariantDraft {
  key: string;
  name: string;
  price: string;
}

let draftCounter = 0;
const newDraft = (): VariantDraft => ({ key: `d${++draftCounter}`, name: '', price: '' });

/** Valida uma linha de variação; devolve a mensagem de erro ou os dados prontos. */
function readVariant(name: string, price: string): { error: string } | { name: string; price: number } {
  const value = parseDecimal(price);
  if (!name.trim()) return { error: 'Informe o nome de cada variação (ex.: Média).' };
  if (!Number.isFinite(value) || value <= 0) return { error: `Informe um preço válido para "${name.trim()}".` };
  return { name: name.trim(), price: value };
}

function Action({ label, danger, onPress }: { label: string; danger?: boolean; onPress(): void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8}>
      <Text style={[styles.action, danger && { color: colors.danger }]}>{label}</Text>
    </Pressable>
  );
}

/** Variação já cadastrada: editar nome/preço, ativar/desativar ou excluir. */
function VariantRow({ variant, onChanged }: { variant: Variant; onChanged(): Promise<void> }) {
  const [name, setName] = useState(variant.name);
  const [price, setPrice] = useState(moneyToText(variant.price));
  const changed = name.trim() !== variant.name || parseDecimal(price) !== variant.price;

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      await onChanged();
    } catch (err) {
      Alert.alert('Ops', getErrorMessage(err));
    }
  }

  function save() {
    const data = readVariant(name, price);
    if ('error' in data) return Alert.alert('Confira a variação', data.error);
    run(() => ownerService.products.updateVariant(variant.id, data));
  }

  function confirmRemove() {
    Alert.alert(
      'Excluir variação?',
      `${variant.name}. Se ela já foi vendida, não pode ser excluída: desative em vez disso.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Excluir', style: 'destructive', onPress: () => run(() => ownerService.products.removeVariant(variant.id)) },
      ],
    );
  }

  return (
    <View style={[styles.variant, !variant.active && styles.inactive]}>
      <View style={styles.variantInputs}>
        <TextInput style={[styles.input, styles.flex]} value={name} onChangeText={setName} placeholder="Nome" />
        <TextInput
          style={[styles.input, styles.priceInput]}
          value={price}
          onChangeText={setPrice}
          placeholder="0,00"
          keyboardType="decimal-pad"
        />
      </View>
      <View style={styles.actions}>
        {!variant.active ? <Text style={styles.muted}>Desativada</Text> : null}
        {changed ? <Action label="Salvar" onPress={save} /> : null}
        <Action
          label={variant.active ? 'Desativar' : 'Ativar'}
          onPress={() => run(() => ownerService.products.setVariantActive(variant.id, !variant.active))}
        />
        <Action label="Excluir" danger onPress={confirmRemove} />
      </View>
    </View>
  );
}

/**
 * Cadastro e edição de produto (item 2).
 * Novo: nome, descrição, categoria e ao menos uma variação com preço.
 * Edição (?id=): dados do produto, variações uma a uma, ativar/desativar e excluir.
 */
export default function ProductFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const navigation = useNavigation();
  const editing = !!id;

  const [product, setProduct] = useState<Product | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [drafts, setDrafts] = useState<VariantDraft[]>([newDraft()]);
  const [newVariant, setNewVariant] = useState<VariantDraft>(newDraft());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: editing ? 'Editar produto' : 'Novo produto' });
  }, [navigation, editing]);

  const reload = useCallback(async () => {
    if (!id) return;
    try {
      const p = await ownerService.products.get(id);
      setProduct(p);
      setLoadError(null);
    } catch (err) {
      setLoadError(getErrorMessage(err));
    }
  }, [id]);

  // preenche os campos uma vez, ao abrir para editar
  useEffect(() => {
    if (!id) return;
    ownerService.products
      .get(id)
      .then((p) => {
        setProduct(p);
        setName(p.name);
        setDescription(p.description ?? '');
        setCategory(p.category ?? '');
      })
      .catch((err) => setLoadError(getErrorMessage(err)));
  }, [id]);

  const productData = () => ({
    name: name.trim(),
    description: description.trim() || null,
    category: category.trim() || null,
  });

  async function handleCreate() {
    setError(null);
    if (name.trim().length < 2) return setError('Informe o nome do produto.');
    const variants = [];
    for (const d of drafts) {
      const v = readVariant(d.name, d.price);
      if ('error' in v) return setError(v.error);
      variants.push(v);
    }
    setSaving(true);
    try {
      await ownerService.products.create({ ...productData(), variants });
      router.back();
    } catch (err) {
      setError(getErrorMessage(err));
      setSaving(false);
    }
  }

  async function handleUpdate() {
    if (!id) return;
    setError(null);
    if (name.trim().length < 2) return setError('Informe o nome do produto.');
    setSaving(true);
    try {
      setProduct(await ownerService.products.update(id, productData()));
      Alert.alert('Pronto', 'Dados do produto salvos.');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleAddVariant() {
    if (!id) return;
    const v = readVariant(newVariant.name, newVariant.price);
    if ('error' in v) return Alert.alert('Confira a variação', v.error);
    try {
      await ownerService.products.addVariant(id, v);
      setNewVariant(newDraft());
      await reload();
    } catch (err) {
      Alert.alert('Ops', getErrorMessage(err));
    }
  }

  async function toggleActive() {
    if (!product) return;
    try {
      setProduct(await ownerService.products.setActive(product.id, !product.active));
    } catch (err) {
      Alert.alert('Ops', getErrorMessage(err));
    }
  }

  function confirmRemove() {
    if (!product) return;
    Alert.alert(
      'Excluir produto?',
      `${product.name}. Se ele já foi vendido, não pode ser excluído: desative em vez disso.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              await ownerService.products.remove(product.id);
              router.back();
            } catch (err) {
              Alert.alert('Ops', getErrorMessage(err));
            }
          },
        },
      ],
    );
  }

  if (editing && !product) {
    return loadError ? (
      <EmptyState icon="⚠️" title="Não foi possível carregar o produto" message={loadError}>
        <Button title="Voltar" variant="outline" onPress={() => router.back()} />
      </EmptyState>
    ) : (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {product && !product.active ? (
          <Text style={styles.notice}>Produto desativado: não aparece para os clientes.</Text>
        ) : null}

        <View style={styles.section}>
          <TextField label="Nome" placeholder="Ex.: Marmita de Frango" value={name} onChangeText={setName} maxLength={120} />
          <TextField
            label="Descrição (opcional)"
            placeholder="Ex.: Frango grelhado com arroz, feijão e salada"
            value={description}
            onChangeText={setDescription}
            maxLength={500}
            multiline
            style={styles.multiline}
          />
          <TextField
            label="Categoria (opcional)"
            placeholder="Ex.: marmitas, assados, bebidas"
            value={category}
            onChangeText={setCategory}
            maxLength={60}
            autoCapitalize="none"
          />
          {editing ? <Button title="Salvar dados do produto" onPress={handleUpdate} loading={saving} /> : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Variações e preços</Text>
          <Text style={styles.muted}>Cada tamanho ou opção tem o seu preço padrão.</Text>

          {editing && product
            ? product.variants.map((v) => <VariantRow key={`${v.id}:${v.name}:${v.price}`} variant={v} onChanged={reload} />)
            : drafts.map((d, i) => (
                <View key={d.key} style={styles.variant}>
                  <View style={styles.variantInputs}>
                    <TextInput
                      style={[styles.input, styles.flex]}
                      value={d.name}
                      onChangeText={(text) => setDrafts((all) => all.map((x) => (x.key === d.key ? { ...x, name: text } : x)))}
                      placeholder="Nome (ex.: Média)"
                    />
                    <TextInput
                      style={[styles.input, styles.priceInput]}
                      value={d.price}
                      onChangeText={(text) => setDrafts((all) => all.map((x) => (x.key === d.key ? { ...x, price: text } : x)))}
                      placeholder="0,00"
                      keyboardType="decimal-pad"
                    />
                  </View>
                  {drafts.length > 1 ? (
                    <View style={styles.actions}>
                      <Action label="Remover" danger onPress={() => setDrafts((all) => all.filter((_, n) => n !== i))} />
                    </View>
                  ) : null}
                </View>
              ))}

          {editing ? (
            <View style={styles.variant}>
              <Text style={styles.label}>Nova variação</Text>
              <View style={styles.variantInputs}>
                <TextInput
                  style={[styles.input, styles.flex]}
                  value={newVariant.name}
                  onChangeText={(text) => setNewVariant((v) => ({ ...v, name: text }))}
                  placeholder="Nome (ex.: Grande)"
                />
                <TextInput
                  style={[styles.input, styles.priceInput]}
                  value={newVariant.price}
                  onChangeText={(text) => setNewVariant((v) => ({ ...v, price: text }))}
                  placeholder="0,00"
                  keyboardType="decimal-pad"
                />
              </View>
              <Button title="Adicionar variação" variant="outline" onPress={handleAddVariant} />
            </View>
          ) : (
            <Button title="+ Outra variação" variant="outline" onPress={() => setDrafts((all) => [...all, newDraft()])} />
          )}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {editing && product ? (
          <View style={styles.section}>
            <Button
              title={product.active ? 'Desativar produto' : 'Ativar produto'}
              variant="outline"
              onPress={toggleActive}
            />
            <Pressable onPress={confirmRemove} hitSlop={8} style={styles.remove}>
              <Text style={styles.removeText}>Excluir produto</Text>
            </Pressable>
          </View>
        ) : (
          <Button title="Cadastrar produto" onPress={handleCreate} loading={saving} />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  container: { padding: spacing.md, gap: spacing.lg, backgroundColor: colors.background },
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: 17, fontWeight: 'bold', color: colors.text },
  label: { fontSize: 14, fontWeight: '500', color: colors.text },
  muted: { fontSize: 13, color: colors.muted },
  multiline: { height: 80, paddingTop: spacing.sm, textAlignVertical: 'top' },
  variant: { backgroundColor: colors.surface, borderRadius: 10, padding: spacing.sm, gap: spacing.sm },
  inactive: { opacity: 0.6 },
  variantInputs: { flexDirection: 'row', gap: spacing.sm },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.background,
  },
  priceInput: { width: 100, textAlign: 'right' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: spacing.md },
  action: { fontSize: 14, fontWeight: '600', color: colors.primary },
  notice: { fontSize: 14, color: colors.text, backgroundColor: '#FFF7ED', padding: spacing.sm, borderRadius: 8 },
  error: { fontSize: 14, color: colors.danger },
  remove: { alignItems: 'center', paddingVertical: spacing.sm },
  removeText: { fontSize: 15, fontWeight: '600', color: colors.danger },
});
