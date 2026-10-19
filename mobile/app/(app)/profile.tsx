import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../src/components/Button';
import { useAuth } from '../../src/contexts/AuthContext';
import type { Role } from '../../src/services/auth.service';
import { colors, spacing } from '../../src/theme';

const ROLE_LABEL: Record<Role, string> = {
  CUSTOMER: 'Cliente',
  OWNER: 'Proprietária',
  COURIER: 'Motoboy',
};

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.info}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

export default function ProfileScreen() {
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
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{user.name.charAt(0).toUpperCase()}</Text>
      </View>
      <Text style={styles.name}>{user.name}</Text>
      <Text style={styles.role}>{ROLE_LABEL[user.role]}</Text>

      <View style={styles.card}>
        <Info label="E-mail" value={user.email} />
        <Info label="Telefone" value={user.phone ?? 'Não informado'} />
        <Info label="Membro desde" value={new Date(user.createdAt).toLocaleDateString('pt-BR')} />
      </View>

      <Button title="Sair" variant="outline" onPress={handleSignOut} loading={leaving} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, gap: spacing.md, alignItems: 'stretch' },
  avatar: {
    alignSelf: 'center',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.primaryText, fontSize: 32, fontWeight: 'bold' },
  name: { textAlign: 'center', fontSize: 22, fontWeight: 'bold', color: colors.text },
  role: { textAlign: 'center', color: colors.muted, marginTop: -spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: spacing.md, gap: spacing.md },
  info: { gap: 2 },
  label: { fontSize: 12, color: colors.muted, textTransform: 'uppercase' },
  value: { fontSize: 16, color: colors.text },
});
