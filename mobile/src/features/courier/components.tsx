import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import type { Delivery } from '../../services/deliveries.service';
import { colors, spacing } from '../../theme';
import { getErrorMessage, isConnectionError } from '../../utils/errors';
import { canStartDelivery, DELIVERY_LABELS } from './presentation';

export function DeliveryBadge({ delivery }: { delivery: Delivery }) {
  const backgroundColor = delivery.status === 'CANCELLED' ? '#F3F4F6' : delivery.status === 'COMPLETED' ? '#F0FDF4'
    : delivery.status === 'IN_PROGRESS' ? '#F5F3FF' : '#FFF7ED';
  return <Text style={[styles.badge, { backgroundColor }]}>
    {canStartDelivery(delivery) ? 'Pronta para saída' : DELIVERY_LABELS[delivery.status]}
  </Text>;
}

/** Mantém o erro visível quando há dados antigos, em vez de mostrá-los como atualizados. */
export function CourierErrorNotice({ error, stale = false, onRetry, disabled = false }: {
  error: unknown; stale?: boolean; onRetry(): void; disabled?: boolean;
}) {
  return <View style={styles.notice} accessibilityRole="alert">
    <Text style={styles.noticeTitle}>{isConnectionError(error) ? 'Sem conexão com o servidor' : 'Não foi possível atualizar'}</Text>
    <Text style={styles.text}>{getErrorMessage(error)}</Text>
    {stale ? <Text style={styles.text}>Os dados exibidos podem estar desatualizados. Atualize antes de executar uma ação.</Text> : null}
    <Button title="Tentar novamente" variant="outline" onPress={onRetry} disabled={disabled} />
  </View>;
}

export const courierStyles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: spacing.md, gap: spacing.sm },
  title: { fontSize: 18, fontWeight: '600', color: colors.text },
  text: { fontSize: 15, color: colors.text },
  muted: { fontSize: 13, color: colors.muted },
  link: { fontSize: 16, color: colors.primary, fontWeight: '600' },
});
const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', paddingVertical: spacing.xs, paddingHorizontal: spacing.sm, borderRadius: 12, overflow: 'hidden', color: colors.text, fontSize: 13, fontWeight: '600' },
  notice: { gap: spacing.sm, backgroundColor: '#FFF7ED', padding: spacing.md, borderRadius: 8 },
  noticeTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  text: { fontSize: 14, color: colors.text },
});
