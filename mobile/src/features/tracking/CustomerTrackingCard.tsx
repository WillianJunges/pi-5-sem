import { useMemo } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { colors, spacing } from '../../theme';
import { DeliveryMap } from './DeliveryMap';
import { formatDistance, type MapPoint, type MapState, straightDistance, validPoint } from './mapHtml';
import { freshPosition } from './policy';
import { useDeliveryTracking } from './useDeliveryTracking';

/**
 * Acompanhamento do motoboy para o cliente (ponto 8b): mapa interno com a posição ao vivo
 * e o endereço do pedido. O contrato do rastreamento continua no hook useDeliveryTracking.
 */
export function CustomerTrackingCard({ orderId, destination }: { orderId: string; destination?: Partial<MapPoint> | null }) {
  const { view, connected, message, now } = useDeliveryTracking(orderId);
  const point = view?.position;
  const fresh = freshPosition(point ?? null, now);
  const target = validPoint(destination) ? destination : null;

  // Objeto estável: o mapa só recebe um script novo quando a posição realmente muda.
  const mapState = useMemo<MapState>(() => ({
    destination: target ? { latitude: target.latitude, longitude: target.longitude } : null,
    courier: point ? { latitude: point.latitude, longitude: point.longitude, accuracy: point.accuracy, fresh } : null,
  }), [target?.latitude, target?.longitude, point?.latitude, point?.longitude, point?.accuracy, fresh]);

  const distance = point && target ? straightDistance(point, target) : null;
  const ended = view && !view.active;

  return <View style={styles.card}>
    <Text style={styles.title}>Acompanhe o motoboy</Text>
    {!ended ? <DeliveryMap state={mapState} /> : null}
    <Text style={styles.headline}>{ended ? 'Rastreamento encerrado.' : !point ? 'Aguardando a localização do motoboy.'
      : distance !== null ? `Motoboy a cerca de ${formatDistance(distance)} (em linha reta)` : 'Motoboy a caminho.'}</Text>
    {point && !ended ? <>
      <Text style={styles.text}>
        {fresh ? 'Atualizada às' : 'Sem atualização recente · última às'} {new Date(point.capturedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        {' '}· precisão de {Math.round(point.accuracy)} m
      </Text>
      <Button title="Abrir no Google Maps" variant="outline" onPress={() => {
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
  headline: { color: colors.text, fontSize: 15, fontWeight: '600' },
  text: { color: colors.muted, fontSize: 13 },
});
