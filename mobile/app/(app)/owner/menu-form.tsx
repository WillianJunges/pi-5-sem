import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../../src/components/Button';
import { TextField } from '../../../src/components/TextField';
import { ownerService } from '../../../src/services/owner.service';
import { colors, spacing } from '../../../src/theme';
import { todayISODate } from '../../../src/utils/date';
import { getErrorMessage } from '../../../src/utils/errors';
import { formatLongDate } from '../../../src/utils/format';

const DAYS = ['Domingo', 'Segunda-Feira', 'Terça-Feira', 'Quarta-Feira', 'Quinta-Feira', 'Sexta-Feira', 'Sábado'];

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
  const { id, copyId } = useLocalSearchParams<{ id?: string; copyId?: string }>();
  const navigation = useNavigation();
  const editing = !!id;

  const [name, setName] = useState('');
  const [nameEdited, setNameEdited] = useState(false);
  const [menuDate, setMenuDate] = useState(todayISODate());
  const [weekday, setWeekday] = useState<number | null>(null);
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: editing ? 'Editar cardápio' : copyId ? 'Duplicar cardápio' : 'Novo cardápio' });
  }, [navigation, editing, copyId]);

  useEffect(() => {
    if (!id) return;
    ownerService.menus
      .get(id)
      .then((menu) => {
        setName(menu.name);
        setMenuDate(menu.menuDate);
        setWeekday(menu.weekday ?? null);
      })
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleSave() {
    setError(null);
    if (name.trim().length < 2) return setError('Informe o nome do cardápio.');
    if (!isValidDate(menuDate.trim())) return setError('Informe a data no formato AAAA-MM-DD (ex.: 2026-10-20).');

    const data = { name: name.trim(), menuDate: menuDate.trim(), weekday };
    setSaving(true);
    try {
      if (id) {
        await ownerService.menus.update(id, data);
        router.back();
      } else {
        const menu = copyId ? await ownerService.menus.duplicate(copyId, data) : await ownerService.menus.create(data);
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
          onChangeText={value => { setName(value); setNameEdited(true); }}
          maxLength={120}
        />
        <Text>Tipo de cardápio</Text>
        <View style={styles.choices}>
          <Pressable onPress={() => { setWeekday(null); if (!nameEdited && !editing) setName('Cardápio especial'); }}><Text style={weekday === null ? styles.selected : styles.choice}>Especial por data</Text></Pressable>
          {DAYS.map((day, i) => <Pressable key={day} onPress={() => { setWeekday(i); if (!nameEdited && !editing) setName(`Cardápio de ${day}`); }}><Text style={weekday === i ? styles.selected : styles.choice}>{day}</Text></Pressable>)}
        </View>
        {weekday === null ? <View style={styles.dateField}>
          <TextField
            label="Dia (AAAA-MM-DD)"
            placeholder="2026-10-20"
            value={menuDate}
            onChangeText={setMenuDate}
            keyboardType="numbers-and-punctuation"
            maxLength={10}
          />
          {dateOk ? <Text style={styles.datePreview}>{formatLongDate(menuDate.trim())}</Text> : null}
        </View> : <Text>Este modelo será sugerido toda {DAYS[weekday].toLowerCase()}. A abertura exige aprovação no dia.</Text>}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button title={editing ? 'Salvar' : copyId ? 'Duplicar e editar itens' : 'Criar e adicionar itens'} onPress={handleSave} loading={saving} />
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
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  choice: { padding: spacing.sm, color: colors.text, backgroundColor: colors.surface, borderRadius: 8 },
  selected: { padding: spacing.sm, color: '#fff', backgroundColor: colors.primary, borderRadius: 8 },
});
