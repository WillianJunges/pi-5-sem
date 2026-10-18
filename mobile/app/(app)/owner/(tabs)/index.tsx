import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../../../src/components/Button';
import { EmptyState } from '../../../../src/components/EmptyState';
import { ownerService, type Product } from '../../../../src/services/owner.service';
import { colors, spacing } from '../../../../src/theme';
import { getErrorMessage } from '../../../../src/utils/errors';
import { formatCurrency } from '../../../../src/utils/format';

/** "marmitas" → "Marmitas"; sem categoria → "Sem categoria". */
function categoryTitle(category: string | null): string {
  return category ? category.charAt(0).toUpperCase() + category.slice(1) : 'Sem categoria';
}

/** Agrupa por categoria; os desativados ficam numa seção própria no fim. */
function groupProducts(products: Product[]) {
  const sections: { title: string; data: Product[] }[] = [];
  for (const product of products.filter((p) => p.active)) {
    const title = categoryTitle(product.category);
    const section = sections.find((s) => s.title === title);
    if (section) section.data.push(product);
    else sections.push({ title, data: [product] });
  }
  const inactive = products.filter((p) => !p.active);
  if (inactive.length > 0) sections.push({ title: 'Desativados', data: inactive });
  return sections;
}

function ProductCard({ product }: { product: Product }) {
  const variants = product.variants.filter((v) => v.active);
  return (
    <Pressable
      onPress={() => router.push(`/owner/product-form?id=${product.id}`)}
      style={({ pressed }) => [styles.card, !product.active && styles.cardInactive, pressed && styles.pressed]}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.name}>{product.name}</Text>
        {!product.active ? <Text style={styles.badge}>Desativado</Text> : null}
      </View>
      {product.description ? <Text style={styles.muted}>{product.description}</Text> : null}
      <View style={styles.chips}>
        {variants.map((v) => (
          <Text key={v.id} style={styles.chip}>
            {v.name} · {formatCurrency(v.price)}
          </Text>
        ))}
        {variants.length === 0 ? <Text style={styles.muted}>Nenhuma variação ativa</Text> : null}
      </View>
    </Pressable>
  );
}

/** Aba "Produtos": catálogo da marmitaria (item 2). */
export default function ProductsScreen() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setProducts(await ownerService.products.list());
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, []);

  // recarrega ao voltar do formulário
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

  const addButton = <Button title="Novo produto" onPress={() => router.push('/owner/product-form')} />;

  if (products === null) {
    if (error) {
      return (
        <EmptyState icon="⚠️" title="Não foi possível carregar os produtos" message={error}>
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

  if (products.length === 0) {
    return (
      <EmptyState icon="🍱" title="Nenhum produto cadastrado" message="Cadastre as marmitas, assados e bebidas com seus tamanhos e preços.">
        {addButton}
      </EmptyState>
    );
  }

  return (
    <View style={styles.container}>
      <SectionList
        sections={groupProducts(products)}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => <ProductCard product={item} />}
        renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
      />
      <View style={styles.footer}>{addButton}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  container: { flex: 1, backgroundColor: colors.background },
  listContent: { padding: spacing.md, gap: spacing.sm },
  sectionTitle: { fontSize: 17, fontWeight: 'bold', color: colors.text, marginTop: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: spacing.md, gap: spacing.xs },
  cardInactive: { opacity: 0.6 },
  pressed: { opacity: 0.7 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  name: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
  badge: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: 'hidden',
  },
  muted: { fontSize: 13, color: colors.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 13,
  },
  footer: { padding: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
