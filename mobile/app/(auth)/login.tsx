import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../src/components/Button';
import { TextField } from '../../src/components/TextField';
import { useAuth } from '../../src/contexts/AuthContext';
import { ApiError } from '../../src/services/api';
import { colors, spacing } from '../../src/theme';
import { getErrorMessage } from '../../src/utils/errors';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  /** Login bloqueado por senhas erradas (429): mostra o aviso em destaque. */
  const [locked, setLocked] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!email.trim() || !password) {
      setError('Informe e-mail e senha.');
      return;
    }
    setError(null);
    setLocked(false);
    setSubmitting(true);
    try {
      await signIn(email, password);
      // O layout raiz troca para a área logada automaticamente.
    } catch (err) {
      setLocked(err instanceof ApiError && err.status === 429);
      setError(getErrorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.title}>Marmitaria</Text>
            <Text style={styles.subtitle}>Entre na sua conta</Text>
          </View>

          <TextField
            label="E-mail"
            value={email}
            onChangeText={setEmail}
            placeholder="seu@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          <TextField
            label="Senha"
            value={password}
            onChangeText={setPassword}
            placeholder="Sua senha"
            secureTextEntry
            autoComplete="password"
            onSubmitEditing={handleSubmit}
          />

          {error && locked ? (
            <View style={styles.lockedBox}>
              <Text style={styles.lockedTitle}>🔒 Login bloqueado</Text>
              <Text style={styles.lockedText}>{error}</Text>
            </View>
          ) : error ? (
            <Text style={styles.error}>{error}</Text>
          ) : null}

          <Button title="Entrar" onPress={handleSubmit} loading={submitting} />

          <Link href="/register" style={styles.link}>
            Não tem conta? <Text style={styles.linkStrong}>Cadastre-se</Text>
          </Link>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
  header: { alignItems: 'center', marginBottom: spacing.lg, gap: spacing.xs },
  title: { fontSize: 32, fontWeight: 'bold', color: colors.primary },
  subtitle: { fontSize: 16, color: colors.muted },
  error: { color: colors.danger },
  lockedBox: { gap: spacing.xs, padding: spacing.md, borderRadius: 10, backgroundColor: '#FFF7ED' },
  lockedTitle: { fontSize: 15, fontWeight: 'bold', color: colors.text },
  lockedText: { fontSize: 14, color: colors.text },
  link: { textAlign: 'center', color: colors.muted, marginTop: spacing.sm },
  linkStrong: { color: colors.primary, fontWeight: '600' },
});
