import { Link, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../src/components/Button';
import { GradientView } from '../../src/components/GradientView';
import { TextField } from '../../src/components/TextField';
import { useAuth } from '../../src/contexts/AuthContext';
import { ApiError } from '../../src/services/api';
import { colors, radius, shadows, spacing } from '../../src/theme';
import { getErrorMessage } from '../../src/utils/errors';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const insets = useSafeAreaInsets();
  /** Voltando da troca de senha: mostra o aviso e já preenche o e-mail. */
  const params = useLocalSearchParams<{ reset?: string; email?: string }>();
  const [email, setEmail] = useState(params.email ?? '');
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
    <KeyboardAvoidingView
      style={styles.safe}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + spacing.lg }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.hero, { paddingTop: insets.top + spacing.xl }]}>
          <GradientView from={colors.brand} to={colors.brandEnd} />
          <View style={styles.logo}>
            <Text style={styles.logoEmoji}>🍱</Text>
          </View>
          <Text style={styles.title}>Marmitaria</Text>
          <Text style={styles.subtitle}>Comida caseira, feita com carinho</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Entre na sua conta</Text>

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

          <Link href={{ pathname: '/forgot-password', params: { email } }} style={styles.forgot}>
            Esqueci minha senha
          </Link>

          {params.reset && !error ? (
            <View style={styles.successBox}>
              <Text style={styles.lockedText}>✅ Senha alterada! Entre com a senha nova.</Text>
            </View>
          ) : null}

          {error && locked ? (
            <View style={styles.lockedBox}>
              <Text style={styles.lockedTitle}>🔒 Login bloqueado</Text>
              <Text style={styles.lockedText}>{error}</Text>
            </View>
          ) : error ? (
            <Text style={styles.error}>{error}</Text>
          ) : null}

          <Button title="Entrar" onPress={handleSubmit} loading={submitting} />
        </View>

        <Link href="/register" style={styles.link}>
          Não tem conta? <Text style={styles.linkStrong}>Cadastre-se</Text>
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flexGrow: 1 },
  hero: {
    alignItems: 'center',
    paddingBottom: spacing.xl + spacing.lg,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    overflow: 'hidden',
    gap: spacing.xs,
  },
  logo: {
    width: 76,
    height: 76,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
    ...shadows.card,
  },
  logoEmoji: { fontSize: 38 },
  title: { fontSize: 34, fontWeight: '800', color: colors.primaryText },
  subtitle: { fontSize: 15, color: colors.primaryText, opacity: 0.92 },
  card: {
    marginHorizontal: spacing.lg,
    marginTop: -spacing.lg,
    padding: spacing.lg,
    gap: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  cardTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
  error: { color: colors.danger },
  forgot: { alignSelf: 'flex-end', color: colors.primary, fontWeight: '600' },
  successBox: { padding: spacing.md, borderRadius: radius.sm, backgroundColor: colors.successSoft },
  lockedBox: { gap: spacing.xs, padding: spacing.md, borderRadius: radius.sm, backgroundColor: colors.primarySoft },
  lockedTitle: { fontSize: 15, fontWeight: 'bold', color: colors.text },
  lockedText: { fontSize: 14, color: colors.text },
  link: { textAlign: 'center', color: colors.muted, marginTop: spacing.lg },
  linkStrong: { color: colors.primary, fontWeight: '700' },
});
