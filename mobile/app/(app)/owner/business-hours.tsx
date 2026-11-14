import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '../../../src/components/Button';
import { businessHoursService, type BusinessDay } from '../../../src/services/businessHours.service';
import { colors, spacing } from '../../../src/theme';
import { getErrorMessage } from '../../../src/utils/errors';

const DAYS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const validTime = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

export default function BusinessHoursScreen() {
  const [days, setDays] = useState<BusinessDay[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { businessHoursService.get().then(result => setDays(result.days)).catch(err => setError(getErrorMessage(err))); }, []);
  function update(weekday: number, patch: Partial<BusinessDay>) { setDays(current => current?.map(day => day.weekday === weekday ? { ...day, ...patch } : day) ?? null); }
  async function save() {
    if (!days) return;
    if (days.some(day => day.opensAt !== null && (!validTime(day.opensAt) || !day.closesAt || !validTime(day.closesAt) || day.opensAt >= day.closesAt))) {
      Alert.alert('Horário inválido', 'Informe abertura e fechamento no formato HH:MM, dentro do mesmo dia.'); return;
    }
    setSaving(true);
    try { await businessHoursService.save(days); Alert.alert('Salvo', 'Horários atualizados. A abertura do cardápio continua manual.'); }
    catch (err) { Alert.alert('Não foi possível salvar', getErrorMessage(err)); }
    finally { setSaving(false); }
  }
  if (!days) return <View style={styles.container}>{error ? <Text>{error}</Text> : <ActivityIndicator color={colors.primary} />}</View>;
  return <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
    <Text style={styles.note}>Informe os horários habituais. Eles não abrem o cardápio automaticamente.</Text>
    {days.map(day => <View key={day.weekday} style={styles.card}>
      <View style={styles.row}><Text style={styles.title}>{DAYS[day.weekday]}</Text>
        <Pressable onPress={() => update(day.weekday, day.opensAt === null ? { opensAt: '11:00', closesAt: '14:00' } : { opensAt: null, closesAt: null })}>
          <Text style={styles.toggle}>{day.opensAt === null ? 'Fechado · alterar' : 'Aberto · alterar'}</Text>
        </Pressable></View>
      {day.opensAt !== null ? <View style={styles.row}>
        <TextInput accessibilityLabel={`Abertura ${DAYS[day.weekday]}`} style={styles.input} value={day.opensAt} onChangeText={value => update(day.weekday, { opensAt: value })} placeholder="11:00" maxLength={5} />
        <Text>até</Text>
        <TextInput accessibilityLabel={`Fechamento ${DAYS[day.weekday]}`} style={styles.input} value={day.closesAt ?? ''} onChangeText={value => update(day.weekday, { closesAt: value })} placeholder="14:00" maxLength={5} />
      </View> : null}
    </View>)}
    <Button title="Salvar horários" onPress={save} loading={saving} />
  </ScrollView>;
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background }, container: { padding: spacing.md, gap: spacing.md },
  note: { color: colors.muted }, card: { backgroundColor: colors.surface, padding: spacing.md, borderRadius: 10, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  title: { color: colors.text, fontWeight: '600' }, toggle: { color: colors.primary },
  input: { flex: 1, borderColor: colors.border, borderWidth: 1, borderRadius: 8, padding: spacing.sm, color: colors.text },
});
