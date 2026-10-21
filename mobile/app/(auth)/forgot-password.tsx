import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../src/components/Button';
import { TextField } from '../../src/components/TextField';
import { authService, type ForgotPasswordResult } from '../../src/services/auth.service';
import { colors, spacing } from '../../src/theme';
import { getErrorMessage } from '../../src/utils/errors';

/**
 * Esqueci minha senha, em dois passos:
 *   1. informa o e-mail e recebe um código de 6 números (vale 15 min)
 *   2. digita o código e a senha nova
 * SIMULAÇÃO: o projeto não tem serviço de e-mail, então o código aparece aqui na tela,
 * como se tivesse chegado por e-mail (o backend só devolve o código fora de produção).
 */
export default function ForgotPasswordScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? '');
  const [sent, setSent] = useState<ForgotPasswordResult | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSendCode() {
    if (!email.trim()) {
      setError('Informe o e-mail da sua conta.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      setSent(await authService.forgotPassword(email.trim()));
      setCode('');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReset() {
    if (!/^\d{6}$/.test(code.trim())) return setError('O código tem 6 números.');
    if (password.length < 6) return setError('A senha deve ter pelo menos 6 caracteres.');
    if (password !== confirm) return setError('As senhas não conferem.');
    setError(null);
    setSubmitting(true);
    try {
      await authService.resetPassword(email.trim(), code.trim(), password);
      router.replace({ pathname: '/login', params: { reset: '1', email: email.trim() } });
    } catch (err) {
      setError(getErrorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>
          {sent
            ? 'Digite o código e escolha uma senha nova.'
            : 'Informe o e-mail da sua conta. Vamos gerar um código para você criar uma senha nova.'}
        </Text>

        <TextField
          label="E-mail"
          value={email}
          onChangeText={setEmail}
          placeholder="seu@email.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          editable={!sent}
        />

        {!sent ? (
          <>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button title="Enviar código" onPress={handleSendCode} loading={submitting} />
          </>
        ) : (
          <>
            {sent.code ? (
              <View style={styles.mailBox}>
                <Text style={styles.mailTitle}>📧 E-mail (simulado)</Text>
                <Text style={styles.mailText}>Seu código para criar uma senha nova é:</Text>
                <Text style={styles.code} selectable>
                  {sent.code}
                </Text>
                <Text style={styles.muted}>
                  Vale por {sent.expiresInMinutes} minutos. {sent.message}
                </Text>
              </View>
            ) : (
              <Text style={styles.muted}>{sent.message}</Text>
            )}

            <TextField
              label="Código"
              value={code}
              onChangeText={setCode}
              placeholder="000000"
              keyboardType="number-pad"
              maxLength={6}
            />
            <TextField label="Senha nova" value={password} onChangeText={setPassword} secureTextEntry />
            <TextField label="Confirmar senha nova" value={confirm} onChangeText={setConfirm} secureTextEntry />

            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button title="Trocar senha" onPress={handleReset} loading={submitting} />
            <Button title="Pedir outro código" variant="outline" onPress={handleSendCode} disabled={submitting} />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, gap: spacing.md },
  intro: { fontSize: 15, color: colors.text },
  error: { color: colors.danger },
  muted: { fontSize: 13, color: colors.muted, textAlign: 'center' },
  mailBox: { gap: spacing.xs, padding: spacing.md, borderRadius: 10, backgroundColor: '#FFF7ED', alignItems: 'center' },
  mailTitle: { fontSize: 15, fontWeight: 'bold', color: colors.text },
  mailText: { fontSize: 14, color: colors.text },
  code: { fontSize: 32, fontWeight: 'bold', letterSpacing: 6, color: colors.primary },
});
