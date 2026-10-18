import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button } from '../../../src/components/Button';
import { TextField } from '../../../src/components/TextField';
import { type Courier, ownerService } from '../../../src/services/owner.service';
import { colors, spacing } from '../../../src/theme';
import { getErrorMessage } from '../../../src/utils/errors';

/**
 * Cadastro e edição de motoboy (item 4).
 * Novo: nome, e-mail, telefone e senha inicial (o motoboy entra no app com eles).
 * Edição (?id=): nome, e-mail e telefone, além de ativar/desativar a conta.
 */
export default function CourierFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const navigation = useNavigation();
  const editing = !!id;

  const [courier, setCourier] = useState<Courier | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: editing ? 'Editar motoboy' : 'Novo motoboy' });
  }, [navigation, editing]);

  useEffect(() => {
    if (!id) return;
    ownerService.couriers
      .get(id)
      .then((c) => {
        setCourier(c);
        setName(c.name);
        setEmail(c.email);
        setPhone(c.phone ?? '');
      })
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleSave() {
    setError(null);
    if (name.trim().length < 2) return setError('Informe o nome do motoboy.');
    if (!email.trim()) return setError('Informe o e-mail que ele vai usar para entrar.');
    if (!editing && password.length < 6) return setError('A senha deve ter pelo menos 6 caracteres.');

    const data = { name: name.trim(), email: email.trim(), phone: phone.trim() || null };
    setSaving(true);
    try {
      if (id) await ownerService.couriers.update(id, data);
      else await ownerService.couriers.create({ ...data, password });
      router.back();
    } catch (err) {
      setError(getErrorMessage(err));
      setSaving(false);
    }
  }

  function confirmToggle() {
    if (!courier) return;
    const deactivating = courier.active;
    Alert.alert(
      deactivating ? 'Desativar motoboy?' : 'Reativar motoboy?',
      deactivating
        ? `${courier.name} não vai mais conseguir entrar no app e as sessões abertas serão encerradas.`
        : `${courier.name} volta a poder entrar no app.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: deactivating ? 'Desativar' : 'Reativar',
          style: deactivating ? 'destructive' : 'default',
          onPress: async () => {
            try {
              setCourier(await ownerService.couriers.setActive(courier.id, !deactivating));
            } catch (err) {
              Alert.alert('Ops', getErrorMessage(err));
            }
          },
        },
      ],
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {courier && !courier.active ? (
          <Text style={styles.notice}>Conta desativada: este motoboy não consegue entrar no app.</Text>
        ) : null}

        <TextField label="Nome" placeholder="Ex.: João da Silva" value={name} onChangeText={setName} maxLength={120} />
        <TextField
          label="E-mail (usado para entrar no app)"
          placeholder="joao@email.com"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={160}
        />
        <TextField
          label="Telefone (opcional)"
          placeholder="(19) 99999-0000"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          maxLength={20}
        />
        {!editing ? (
          <View style={styles.field}>
            <TextField
              label="Senha inicial"
              placeholder="Pelo menos 6 caracteres"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              maxLength={72}
            />
            <Text style={styles.muted}>Passe o e-mail e a senha para o motoboy entrar no app.</Text>
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button title={editing ? 'Salvar' : 'Cadastrar motoboy'} onPress={handleSave} loading={saving} />

        {courier ? (
          <Pressable onPress={confirmToggle} hitSlop={8} style={styles.toggle}>
            <Text style={[styles.toggleText, courier.active && { color: colors.danger }]}>
              {courier.active ? 'Desativar motoboy' : 'Reativar motoboy'}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  container: { padding: spacing.md, gap: spacing.lg },
  field: { gap: spacing.xs },
  muted: { fontSize: 13, color: colors.muted },
  notice: { fontSize: 14, color: colors.text, backgroundColor: '#FFF7ED', padding: spacing.sm, borderRadius: 8 },
  error: { fontSize: 14, color: colors.danger },
  toggle: { alignItems: 'center', paddingVertical: spacing.sm },
  toggleText: { fontSize: 15, fontWeight: '600', color: colors.primary },
});
