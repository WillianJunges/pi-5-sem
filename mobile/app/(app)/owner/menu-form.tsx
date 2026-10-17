import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../../src/components/Button';
import { TextField } from '../../../src/components/TextField';
import { ownerService } from '../../../src/services/owner.service';
import { colors, spacing } from '../../../src/theme';
import { todayISODate } from '../../../src/utils/date';
import { getErrorMessage } from '../../../src/utils/errors';
import { formatLongDate } from '../../../src/utils/format';

/** Confere se "AAAA-MM-DD" é uma data que existe (ex.: recusa 2026-02-30). */
function isValidDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [y, m, d] = text.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

/**
 * Cadastro e edição de cardápio (item 3): nome e dia.
 * Depois de criar, abre o cardápio para adicionar os itens.
 */
export default function MenuFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const navigation = useNavigation();
  const editing = !!id;

  const [name, setName] = useState('');
  const [menuDate, setMenuDate] = useState(todayISODate());
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: editing ? 'Editar cardápio' : 'Novo cardápio' });
  }, [navigation, editing]);

  useEffect(() => {
    if (!id) return;
    ownerService.menus
      .get(id)
      .then((menu) => {
        setName(menu.name);
        setMenuDate(menu.menuDate);
      })
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleSave() {
    setError(null);
    if (name.trim().length < 2) return setError('Informe o nome do cardápio.');
    if (!isValidDate(menuDate.trim())) return setError('Informe a data no formato AAAA-MM-DD (ex.: 2026-10-20).');

    const data = { name: name.trim(), menuDate: menuDate.trim() };
    setSaving(true);
    try {
      if (id) {
        await ownerService.menus.update(id, data);
        router.back();
      } else {
        const menu = await ownerService.menus.create(data);
        router.replace(`/owner/menu/${menu.id}`);
      }
    } catch (err) {
      setError(getErrorMessage(err));
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const dateOk = isValidDate(menuDate.trim());

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <TextField
          label="Nome"
          placeholder="Ex.: Cardápio de segunda"
          value={name}
          onChangeText={setName}
          maxLength={120}
        />
        <View style={styles.dateField}>
          <TextField
            label="Dia (AAAA-MM-DD)"
            placeholder="2026-10-20"
            value={menuDate}
            onChangeText={setMenuDate}
            keyboardType="numbers-and-punctuation"
            maxLength={10}
          />
          {dateOk ? <Text style={styles.datePreview}>{formatLongDate(menuDate.trim())}</Text> : null}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button title={editing ? 'Salvar' : 'Criar e adicionar itens'} onPress={handleSave} loading={saving} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  container: { padding: spacing.md, gap: spacing.lg },
  dateField: { gap: spacing.xs },
  datePreview: { fontSize: 13, color: colors.muted, textTransform: 'capitalize' },
  error: { fontSize: 14, color: colors.danger },
});
