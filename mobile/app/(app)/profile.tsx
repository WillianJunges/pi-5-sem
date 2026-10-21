import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../src/components/Button';
import { TextField } from '../../src/components/TextField';
import { useAuth } from '../../src/contexts/AuthContext';
import type { Role } from '../../src/services/auth.service';
import { usersService } from '../../src/services/users.service';
import { colors, spacing } from '../../src/theme';
import { getErrorMessage } from '../../src/utils/errors';
import { isValidPhone, maskPhone } from '../../src/utils/format';

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

/** O que está aberto na tela: só os dados, o formulário de edição ou o de troca de senha. */
type Mode = 'view' | 'edit' | 'password';

/**
 * Meu perfil (todos os perfis): ver os dados, editar nome e telefone e trocar a senha.
 * O e-mail não muda por aqui, porque é o login.
 */
export default function ProfileScreen() {
  const { user, signOut, reloadUser } = useAuth();
  const [mode, setMode] = useState<Mode>('view');
  const [leaving, setLeaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Aviso verde depois de salvar. */
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', phone: '' });
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' });

  if (!user) return null;

  function open(next: Mode) {
    setError(null);
    setNotice(null);
    if (next === 'edit') setForm({ name: user!.name, phone: user!.phone ?? '' });
    if (next === 'password') setPasswords({ current: '', next: '', confirm: '' });
    setMode(next);
  }

  async function handleSaveProfile() {
    if (form.name.trim().length < 2) return setError('Informe seu nome.');
    if (!isValidPhone(form.phone)) return setError('Informe seu telefone com DDD.');
    setError(null);
    setSaving(true);
    try {
      await usersService.updateMe({ name: form.name.trim(), phone: form.phone });
      await reloadUser();
      setMode('view');
      setNotice('Dados atualizados!');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword() {
    if (!passwords.current) return setError('Informe a senha atual.');
    if (passwords.next.length < 6) return setError('A senha nova deve ter pelo menos 6 caracteres.');
    if (passwords.next !== passwords.confirm) return setError('As senhas novas não conferem.');
    setError(null);
    setSaving(true);
    try {
      await usersService.changePassword(passwords.current, passwords.next);
      setMode('view');
      setNotice('Senha alterada!');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

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
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user.name.charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={styles.name}>{user.name}</Text>
        <Text style={styles.role}>{ROLE_LABEL[user.role]}</Text>

        {notice ? (
          <View style={styles.notice}>
            <Text style={styles.value}>✅ {notice}</Text>
          </View>
        ) : null}

        {mode === 'view' ? (
          <>
            <View style={styles.card}>
              <Info label="E-mail" value={user.email} />
              <Info label="Telefone" value={user.phone ?? 'Não informado'} />
              <Info label="Membro desde" value={new Date(user.createdAt).toLocaleDateString('pt-BR')} />
            </View>
            {!user.phone ? (
              <Text style={styles.warning}>Cadastre seu telefone para a marmitaria conseguir falar com você.</Text>
            ) : null}
            <Button title="Editar dados" onPress={() => open('edit')} />
            <Button title="Alterar senha" variant="outline" onPress={() => open('password')} />
            <Button title="Sair" variant="outline" onPress={handleSignOut} loading={leaving} />
          </>
        ) : null}

        {mode === 'edit' ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Editar dados</Text>
            <TextField
              label="Nome"
              value={form.name}
              onChangeText={(name) => setForm((f) => ({ ...f, name }))}
              autoComplete="name"
            />
            <TextField
              label="Telefone (com DDD)"
              value={form.phone}
              onChangeText={(text) => setForm((f) => ({ ...f, phone: maskPhone(text) }))}
              placeholder="(19) 99999-8888"
              keyboardType="phone-pad"
              autoComplete="tel"
            />
            <Info label="E-mail" value={user.email} />
            <Text style={styles.muted}>O e-mail é o seu login e não pode ser alterado.</Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button title="Salvar" onPress={handleSaveProfile} loading={saving} />
            <Button title="Cancelar" variant="outline" onPress={() => open('view')} disabled={saving} />
          </View>
        ) : null}

        {mode === 'password' ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Alterar senha</Text>
            <TextField
              label="Senha atual"
              value={passwords.current}
              onChangeText={(current) => setPasswords((p) => ({ ...p, current }))}
              secureTextEntry
            />
            <TextField
              label="Senha nova"
              value={passwords.next}
              onChangeText={(next) => setPasswords((p) => ({ ...p, next }))}
              secureTextEntry
            />
            <TextField
              label="Confirmar senha nova"
              value={passwords.confirm}
              onChangeText={(confirm) => setPasswords((p) => ({ ...p, confirm }))}
              secureTextEntry
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button title="Trocar senha" onPress={handleChangePassword} loading={saving} />
            <Button title="Cancelar" variant="outline" onPress={() => open('view')} disabled={saving} />
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
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
  cardTitle: { fontSize: 17, fontWeight: 'bold', color: colors.text },
  info: { gap: 2 },
  label: { fontSize: 12, color: colors.muted, textTransform: 'uppercase' },
  value: { fontSize: 16, color: colors.text },
  muted: { fontSize: 13, color: colors.muted, marginTop: -spacing.sm },
  warning: { fontSize: 14, color: colors.danger, textAlign: 'center' },
  error: { color: colors.danger },
  notice: { padding: spacing.md, borderRadius: 10, backgroundColor: '#F0FDF4' },
});
