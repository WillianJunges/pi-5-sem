import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '../../../src/components/Button';
import { businessHoursService, type BusinessDay } from '../../../src/services/businessHours.service';
import { colors, spacing } from '../../../src/theme';
import { getErrorMessage } from '../../../src/utils/errors';
import { completeBusinessTime, maskBusinessTime, validBusinessTime } from '../../../src/utils/businessTime';

const DAYS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
export default function BusinessHoursScreen() {
  const [days, setDays] = useState<BusinessDay[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const positions = useRef<Record<number, number>>({});
  const focused = useRef<number | null>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showFocused() {
    if (focused.current !== null) scroll.current?.scrollTo({ y: Math.max(0, (positions.current[focused.current] ?? 0) - spacing.md), animated: true });
  }
  function focusDay(weekday: number) {
    focused.current = weekday;
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(showFocused, 350);
  }
  useEffect(() => {
    const listener = Keyboard.addListener('keyboardDidShow', showFocused);
    return () => { listener.remove(); if (scrollTimer.current) clearTimeout(scrollTimer.current); };
  }, []);
  useEffect(() => { businessHoursService.get().then(result => setDays(result.days)).catch(err => setError(getErrorMessage(err))); }, []);
  function update(weekday: number, patch: Partial<BusinessDay>) { setDays(current => current?.map(day => day.weekday === weekday ? { ...day, ...patch } : day) ?? null); }
  async function save() {
    if (!days) return;
    const completed = days.map(day => day.opensAt === null ? day : { ...day, opensAt: completeBusinessTime(day.opensAt), closesAt: completeBusinessTime(day.closesAt ?? '') });
    if (completed.some(day => day.opensAt !== null && (!validBusinessTime(day.opensAt) || !day.closesAt || !validBusinessTime(day.closesAt) || day.opensAt >= day.closesAt))) {
      Alert.alert('Horário inválido', 'Informe abertura e fechamento no formato HH:MM, dentro do mesmo dia.'); return;
    }
    setDays(completed);
    setSaving(true);
    try { await businessHoursService.save(completed); Alert.alert('Salvo', 'Horários atualizados. A abertura do cardápio continua manual.'); }
    catch (err) { Alert.alert('Não foi possível salvar', getErrorMessage(err)); }
    finally { setSaving(false); }
  }
  if (!days) return <View style={styles.container}>{error ? <Text>{error}</Text> : <ActivityIndicator color={colors.primary} />}</View>;
  return <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
  <ScrollView ref={scroll} style={styles.flex} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
    <Text style={styles.note}>Informe os horários habituais. Eles não abrem o cardápio automaticamente.</Text>
    {days.map(day => <View key={day.weekday} style={styles.card} onLayout={event => { positions.current[day.weekday] = event.nativeEvent.layout.y; }}>
      <View style={styles.row}><Text style={styles.title}>{DAYS[day.weekday]}</Text>
        <Pressable onPress={() => update(day.weekday, day.opensAt === null ? { opensAt: '11:00', closesAt: '14:00' } : { opensAt: null, closesAt: null })}>
          <Text style={styles.toggle}>{day.opensAt === null ? 'Fechado · alterar' : 'Aberto · alterar'}</Text>
        </Pressable></View>
      {day.opensAt !== null ? <View style={styles.row}>
        <TextInput accessibilityLabel={`Abertura ${DAYS[day.weekday]}`} style={styles.input} value={day.opensAt} onChangeText={value => update(day.weekday, { opensAt: maskBusinessTime(value) })} onFocus={() => focusDay(day.weekday)} onBlur={() => { focused.current = null; update(day.weekday, { opensAt: completeBusinessTime(day.opensAt ?? '') }); }} keyboardType="number-pad" placeholder="11:00" maxLength={5} />
        <Text>até</Text>
        <TextInput accessibilityLabel={`Fechamento ${DAYS[day.weekday]}`} style={styles.input} value={day.closesAt ?? ''} onChangeText={value => update(day.weekday, { closesAt: maskBusinessTime(value) })} onFocus={() => focusDay(day.weekday)} onBlur={() => { focused.current = null; update(day.weekday, { closesAt: completeBusinessTime(day.closesAt ?? '') }); }} keyboardType="number-pad" placeholder="14:00" maxLength={5} />
      </View> : null}
    </View>)}
    <Button title="Salvar horários" onPress={save} loading={saving} />
  </ScrollView></KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background }, container: { padding: spacing.md, gap: spacing.md },
  note: { color: colors.muted }, card: { backgroundColor: colors.surface, padding: spacing.md, borderRadius: 10, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  title: { color: colors.text, fontWeight: '600' }, toggle: { color: colors.primary },
  input: { flex: 1, borderColor: colors.border, borderWidth: 1, borderRadius: 8, padding: spacing.sm, color: colors.text },
});
