import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../../../src/components/Button';
import { useAuth } from '../../../../src/contexts/AuthContext';
import { colors, spacing } from '../../../../src/theme';

const MENU: { label: string; href: Href }[] = [
  { label: 'Meus endereços', href: '/customer/addresses' },
  { label: 'Meu perfil', href: '/profile' },
];

/** Aba "Conta": atalhos para endereços, perfil e sair. */
export default function AccountScreen() {
  const { user, signOut } = useAuth();
  const [leaving, setLeaving] = useState(false);

  if (!user) return null;

  function handleSignOut() {
    Alert.alert('Sair da conta', 'Tem certeza que deseja sair?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: async () => {
          setLeaving(true);
          await signOut();
        },
      },
    ]);
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <View>
        <Text style={styles.name}>{user.name}</Text>
        <Text style={styles.email}>{user.email}</Text>
      </View>

      <View style={styles.card}>
        {MENU.map((item, i) => (
          <Pressable
            key={item.label}
            onPress={() => router.push(item.href)}
            style={({ pressed }) => [styles.item, i > 0 && styles.divider, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.itemText}>{item.label}</Text>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ))}
      </View>

      <Button title="Sair" variant="outline" onPress={handleSignOut} loading={leaving} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, gap: spacing.lg },
  name: { fontSize: 22, fontWeight: 'bold', color: colors.text },
  email: { color: colors.muted },
  card: { backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: spacing.md },
  item: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.md },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  itemText: { fontSize: 16, color: colors.text },
  chevron: { fontSize: 22, color: colors.muted },
});
