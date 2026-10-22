import { Linking, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { colors, spacing } from '../../theme';
import { freshPosition } from './policy';
import { useDeliveryTracking } from './useDeliveryTracking';

/** O mapa do cliente pode consumir o mesmo hook sem mudar o contrato do rastreamento. */
export function CustomerTrackingCard({ orderId }: { orderId: string }) {
  const { view, connected, message, now } = useDeliveryTracking(orderId);
  const point = view?.position;
  const fresh = freshPosition(point ?? null, now);
  return <View style={styles.card}>
    <Text style={styles.title}>Localização do motoboy</Text>
    <Text style={styles.text}>{view && !view.active ? 'Rastreamento encerrado.' : !point ? 'Aguardando localização do motoboy.'
      : fresh ? 'Última posição recebida.' : 'Localização sem atualização recente.'}</Text>
    {point ? <>
      <Text style={styles.text}>Atualizada às {new Date(point.capturedAt).toLocaleTimeString('pt-BR')} · precisão de {Math.round(point.accuracy)} m</Text>
      <Button title="Ver última posição no mapa" variant="outline" onPress={() => {
        void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${point.latitude},${point.longitude}`).catch(() => undefined);
      }} />
    </> : null}
    {message ? <Text accessibilityRole="alert" style={styles.text}>{message}</Text> : null}
    {view?.active ? <Text style={styles.text}>{connected ? 'Atualização automática conectada.' : 'Consultando atualizações quando houver conexão.'}</Text> : null}
  </View>;
}
const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, padding: spacing.md, borderRadius: 12, gap: spacing.sm },
  title: { color: colors.text, fontWeight: 'bold', fontSize: 15 },
  text: { color: colors.muted, fontSize: 13 },
});
