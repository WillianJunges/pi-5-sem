import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { Button } from '../../src/components/Button';
import { TextField } from '../../src/components/TextField';
import { useAuth } from '../../src/contexts/AuthContext';
import { colors, spacing } from '../../src/theme';
import { getErrorMessage } from '../../src/utils/errors';
import { isValidPhone, maskPhone } from '../../src/utils/format';

export default function RegisterScreen() {
  const { signUp } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirm: '' });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (field: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [field]: value }));

  function validate(): string | null {
    if (form.name.trim().length < 2) return 'Informe seu nome.';
    if (!form.email.trim()) return 'Informe seu e-mail.';
    if (!isValidPhone(form.phone)) return 'Informe seu telefone com DDD.';
    if (form.password.length < 6) return 'A senha deve ter pelo menos 6 caracteres.';
    if (form.password !== form.confirm) return 'As senhas não conferem.';
    return null;
  }

  async function handleSubmit() {
    const invalid = validate();
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await signUp({
        name: form.name,
        email: form.email,
        phone: form.phone,
        password: form.password,
      });
    } catch (err) {
      setError(getErrorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <TextField label="Nome" value={form.name} onChangeText={set('name')} autoComplete="name" />
        <TextField
          label="E-mail"
          value={form.email}
          onChangeText={set('email')}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />
        <TextField
          label="Telefone (com DDD)"
          value={form.phone}
          onChangeText={(text) => set('phone')(maskPhone(text))}
          placeholder="(19) 99999-8888"
          keyboardType="phone-pad"
          autoComplete="tel"
        />
        <TextField label="Senha" value={form.password} onChangeText={set('password')} secureTextEntry />
        <TextField label="Confirmar senha" value={form.confirm} onChangeText={set('confirm')} secureTextEntry />

        {error && <Text style={styles.error}>{error}</Text>}

        <Button title="Criar conta" onPress={handleSubmit} loading={submitting} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, gap: spacing.md },
  error: { color: colors.danger },
});
