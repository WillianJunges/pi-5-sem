import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../../../src/components/Button';
import { EmptyState } from '../../../../src/components/EmptyState';
import {
  MENU_STATUS_COLORS,
  MENU_STATUS_LABEL,
  type MenuDetail,
  type MenuItemDetail,
  moneyToText,
  ownerService,
  parseDecimal,
  type Product,
} from '../../../../src/services/owner.service';
import { colors, spacing } from '../../../../src/theme';
import { todayISODate } from '../../../../src/utils/date';
import { getErrorMessage } from '../../../../src/utils/errors';
import { formatCurrency, formatLongDate } from '../../../../src/utils/format';

const DAYS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

function Action({ label, danger, onPress }: { label: string; danger?: boolean; onPress(): void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8}>
      <Text style={[styles.action, danger && { color: colors.danger }]}>{label}</Text>
    </Pressable>
  );
}

/** Item do cardápio: preço que vale, preço especial e retirar. */
function ItemRow({
  item,
  editable,
  onSetSpecial,
  onRemove,
}: {
  item: MenuItemDetail;
  editable: boolean;
  onSetSpecial(price: number | null): Promise<void>;
  onRemove(): void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.specialPrice !== null ? moneyToText(item.specialPrice) : '');

  async function save() {
    const value = parseDecimal(text);
    if (!Number.isFinite(value) || value <= 0) {
      Alert.alert('Preço especial', 'Informe um preço válido (ex.: 19,90).');
      return;
    }
    await onSetSpecial(value);
    setEditing(false);
  }

  return (
    <View style={[styles.item, !item.available && styles.itemUnavailable]}>
      <View style={styles.itemHeader}>
        <Text style={styles.itemName}>{item.variantName}</Text>
        <View style={styles.priceBox}>
          {item.specialPrice !== null ? <Text style={styles.standardPrice}>{formatCurrency(item.standardPrice)}</Text> : null}
          <Text style={styles.price}>{formatCurrency(item.price)}</Text>
        </View>
      </View>
      {!item.available ? (
        <Text style={styles.warning}>Desativado no catálogo: não aparece para o cliente.</Text>
      ) : null}

      {editable && editing ? (
        <View style={styles.specialRow}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="0,00"
            keyboardType="decimal-pad"
            autoFocus
          />
          <Action label="Salvar" onPress={save} />
          {item.specialPrice !== null ? (
            <Action
              label="Tirar"
              onPress={async () => {
                await onSetSpecial(null);
                setText('');
                setEditing(false);
              }}
            />
          ) : null}
          <Action label="Cancelar" onPress={() => setEditing(false)} />
        </View>
      ) : editable ? (
        <View style={styles.actions}>
          <Action label={item.specialPrice !== null ? 'Mudar preço especial' : 'Preço especial'} onPress={() => setEditing(true)} />
          <Action label="Retirar" danger onPress={onRemove} />
        </View>
      ) : null}
    </View>
  );
}

/** Lista para escolher o que entra no cardápio: variações ativas que ainda não estão nele. */
function AddItemSheet({
  visible,
  products,
  menu,
  onAdd,
  onClose,
}: {
  visible: boolean;
  products: Product[] | null;
  menu: MenuDetail;
  onAdd(variantId: string): Promise<void>;
  onClose(): void;
}) {
  const insets = useSafeAreaInsets();
  const inMenu = new Set(menu.items.map((i) => i.variantId));
  const options = (products ?? [])
    .filter((p) => p.active)
    .map((p) => ({ product: p, variants: p.variants.filter((v) => v.active && !inMenu.has(v.id)) }))
    .filter((o) => o.variants.length > 0);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
        <Text style={styles.sheetTitle}>Adicionar ao cardápio</Text>
        {products === null ? (
          <ActivityIndicator color={colors.primary} />
        ) : options.length === 0 ? (
          <Text style={styles.muted}>Todas as variações ativas do catálogo já estão neste cardápio.</Text>
        ) : (
          <ScrollView style={styles.sheetList} contentContainerStyle={{ gap: spacing.md }}>
            {options.map(({ product, variants }) => (
              <View key={product.id} style={{ gap: spacing.xs }}>
                <Text style={styles.productName}>{product.name}</Text>
                {variants.map((v) => (
                  <Pressable
                    key={v.id}
                    onPress={() => onAdd(v.id)}
                    style={({ pressed }) => [styles.option, pressed && { opacity: 0.6 }]}
                  >
                    <Text style={styles.optionName}>{v.name}</Text>
                    <Text style={styles.optionPrice}>{formatCurrency(v.price)}</Text>
                    <Text style={styles.plus}>＋</Text>
                  </Pressable>
                ))}
              </View>
            ))}
          </ScrollView>
        )}
        <Button title="Fechar" variant="outline" onPress={onClose} />
      </View>
    </Modal>
  );
}

/** Agrupa os itens pelo produto, na ordem em que vêm da API. */
function groupByProduct(items: MenuItemDetail[]) {
  const groups: { productId: string; name: string; items: MenuItemDetail[] }[] = [];
  for (const item of items) {
    const group = groups.find((g) => g.productId === item.productId);
    if (group) group.items.push(item);
    else groups.push({ productId: item.productId, name: item.productName, items: [item] });
  }
  return groups;
}

/**
 * Cardápio (item 3): itens, preço especial, ativar, encerrar e excluir.
 * Rascunho e ativo podem ser alterados; encerrado fica só para consulta.
 */
export default function MenuScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [menu, setMenu] = useState<MenuDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [products, setProducts] = useState<Product[] | null>(null);

  const load = useCallback(async () => {
    try {
      setMenu(await ownerService.menus.get(id));
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, [id]);

  // recarrega ao voltar da edição
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

  /** Executa uma ação na API e recarrega; mostra o erro do backend se houver. */
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      await load();
    } catch (err) {
      Alert.alert('Ops', getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function openAdd() {
    setAdding(true);
    setProducts(null);
    ownerService.products
      .list()
      .then(setProducts)
      .catch((err) => {
        setAdding(false);
        Alert.alert('Ops', getErrorMessage(err));
      });
  }

  if (!menu) {
    return error ? (
      <EmptyState icon="⚠️" title="Não foi possível carregar o cardápio" message={error}>
        <Button title="Tentar de novo" onPress={load} />
      </EmptyState>
    ) : (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const editable = menu.status !== 'CLOSED';
  const status = MENU_STATUS_COLORS[menu.status];
  const isToday = menu.menuDate === todayISODate();

  function confirm(title: string, message: string, label: string, action: () => Promise<unknown>, destructive = false) {
    Alert.alert(title, message, [
      { text: 'Cancelar', style: 'cancel' },
      { text: label, style: destructive ? 'destructive' : 'default', onPress: () => run(action) },
    ]);
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
      >
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>{menu.name}</Text>
            <Text style={[styles.badge, { backgroundColor: status.bg, color: status.fg }]}>
              {MENU_STATUS_LABEL[menu.status]}
            </Text>
          </View>
          <Text style={styles.date}>{menu.weekday != null ? `Modelo semanal · ${DAYS[menu.weekday]}` : formatLongDate(menu.menuDate)}</Text>
          {menu.weekday != null ? <Text style={styles.notice}>Este modelo não abre a marmitaria sozinho. Prepare a cópia de hoje e aprove-a.</Text> : null}
          {menu.status === 'ACTIVE' && isToday ? (
            <Text style={styles.notice}>Este é o cardápio que os clientes estão vendo hoje.</Text>
          ) : null}
          {menu.status === 'ACTIVE' && !isToday ? (
            <Text style={styles.notice}>Ativo, mas com outra data: os clientes só veem o cardápio ativo de hoje.</Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Itens ({menu.items.length})</Text>
          {menu.items.length === 0 ? (
            <Text style={styles.muted}>Nenhum item ainda. Adicione as variações que serão vendidas neste dia.</Text>
          ) : (
            groupByProduct(menu.items).map((group) => (
              <View key={group.productId} style={styles.group}>
                <Text style={styles.productName}>{group.name}</Text>
                {group.items.map((item) => (
                  <ItemRow
                    key={`${item.itemId}:${item.specialPrice}`}
                    item={item}
                    editable={editable}
                    onSetSpecial={(price) => run(() => ownerService.menus.setSpecialPrice(menu.id, item.itemId, price))}
                    onRemove={() =>
                      confirm(
                        'Retirar do cardápio?',
                        `${item.productName} · ${item.variantName}`,
                        'Retirar',
                        () => ownerService.menus.removeItem(menu.id, item.itemId),
                        true,
                      )
                    }
                  />
                ))}
              </View>
            ))
          )}
          {editable ? <Button title="Adicionar item" variant="outline" onPress={openAdd} /> : null}
        </View>

        {menu.status === 'DRAFT' ? (
          <View style={styles.section}>
            {menu.weekday != null ? <Button
              title="Preparar cardápio de hoje"
              loading={busy}
              onPress={() => run(async () => {
                const prepared = await ownerService.menus.prepare(menu.id);
                router.push(`/owner/menu/${prepared.id}`);
              })}
            /> : <Button
              title="Ativar cardápio"
              loading={busy}
              onPress={() =>
                confirm('Ativar cardápio?', 'Se a data for hoje, os clientes passam a ver este cardápio.', 'Ativar', () =>
                  ownerService.menus.activate(menu.id),
                )
              }
            />}
            <Button title="Editar nome ou data" variant="outline" onPress={() => router.push(`/owner/menu-form?id=${menu.id}`)} />
            <Pressable
              onPress={() =>
                confirm('Excluir rascunho?', menu.name, 'Excluir', async () => {
                  await ownerService.menus.remove(menu.id);
                  router.back();
                }, true)
              }
              hitSlop={8}
              style={styles.remove}
            >
              <Text style={styles.removeText}>Excluir rascunho</Text>
            </Pressable>
          </View>
        ) : null}

        {menu.status === 'ACTIVE' ? (
          <View style={styles.section}>
            <Button
              title="Encerrar cardápio"
              variant="outline"
              loading={busy}
              onPress={() =>
                confirm(
                  'Encerrar cardápio?',
                  'Os clientes deixam de ver este cardápio e ele não pode mais ser alterado.',
                  'Encerrar',
                  () => ownerService.menus.close(menu.id),
                  true,
                )
              }
            />
          </View>
        ) : null}

        {menu.status === 'CLOSED' ? (
          <Text style={[styles.muted, styles.centerText]}>Cardápio encerrado: fica só para consulta.</Text>
        ) : null}
      </ScrollView>

      <AddItemSheet
        visible={adding}
        products={products}
        menu={menu}
        onAdd={(variantId) => run(() => ownerService.menus.addItem(menu.id, variantId, null))}
        onClose={() => setAdding(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  container: { padding: spacing.md, gap: spacing.lg },
  header: { gap: spacing.xs },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  title: { flex: 1, fontSize: 22, fontWeight: 'bold', color: colors.text },
  badge: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: 'hidden',
  },
  date: { fontSize: 15, color: colors.muted, textTransform: 'capitalize' },
  notice: { fontSize: 14, color: colors.text, backgroundColor: '#FFF7ED', padding: spacing.sm, borderRadius: 8 },
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: 17, fontWeight: 'bold', color: colors.text },
  group: { gap: spacing.xs },
  productName: { fontSize: 15, fontWeight: '600', color: colors.text },
  item: { backgroundColor: colors.surface, borderRadius: 10, padding: spacing.sm, gap: spacing.xs },
  itemUnavailable: { opacity: 0.6 },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  itemName: { flex: 1, fontSize: 15, color: colors.text },
  priceBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  standardPrice: { fontSize: 13, color: colors.muted, textDecorationLine: 'line-through' },
  price: { fontSize: 15, fontWeight: '600', color: colors.text },
  warning: { fontSize: 13, color: colors.danger },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.md },
  action: { fontSize: 14, fontWeight: '600', color: colors.primary },
  specialRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  input: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.background,
  },
  muted: { fontSize: 14, color: colors.muted },
  centerText: { textAlign: 'center' },
  remove: { alignItems: 'center', paddingVertical: spacing.sm },
  removeText: { fontSize: 15, fontWeight: '600', color: colors.danger },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    maxHeight: '75%',
    backgroundColor: colors.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: spacing.md,
    gap: spacing.md,
  },
  sheetTitle: { fontSize: 18, fontWeight: 'bold', color: colors.text },
  sheetList: { flexGrow: 0 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionName: { flex: 1, fontSize: 15, color: colors.text },
  optionPrice: { fontSize: 15, color: colors.muted },
  plus: { fontSize: 18, fontWeight: 'bold', color: colors.primary },
});
