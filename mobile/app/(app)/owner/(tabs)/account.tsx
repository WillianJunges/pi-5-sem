import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../../../src/components/Button';
import { useAuth } from '../../../../src/contexts/AuthContext';
import { colors, spacing } from '../../../../src/theme';

/** Aba "Conta": perfil e sair (mesmo padrão da aba Conta do Cliente). */
export default function OwnerAccountScreen() {
  const { user, signOut } = useAuth();
  const [leaving, setLeaving] = useState(false);

  if (!user) return null;

  async function handleSignOut() {
    setLeaving(true);
    await signOut();
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <View>
        <Text style={styles.name}>{user.name}</Text>
        <Text style={styles.email}>{user.email}</Text>
        <Text style={styles.role}>Proprietária</Text>
      </View>

      <View style={styles.card}>
        <Pressable
          onPress={() => router.push('/profile')}
          style={({ pressed }) => [styles.item, pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.itemText}>Meu perfil</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
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
  role: { color: colors.primary, fontWeight: '600', marginTop: spacing.xs },
  card: { backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: spacing.md },
  item: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.md },
  itemText: { fontSize: 16, color: colors.text },
  chevron: { fontSize: 22, color: colors.muted },
});
