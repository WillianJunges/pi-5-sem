import { useLocalSearchParams } from 'expo-router';
import { EmptyState } from '../../../../src/components/EmptyState';

/** Acompanhamento de um pedido (status e motoboy) — entra no item 8. */
export default function OrderTrackingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <EmptyState
      icon="🛵"
      title={`Pedido #${id}`}
      message="O status do pedido e a localização do motoboy vão aparecer aqui."
    />
  );
}
