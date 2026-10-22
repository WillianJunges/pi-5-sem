import type { Delivery, DeliveryAddress, DeliveryStatus } from '../../services/deliveries.service';

export const DELIVERY_LABELS: Record<DeliveryStatus, string> = {
  WAITING_ASSIGNMENT: 'Aguardando motoboy',
  ASSIGNED: 'Atribuída',
  IN_PROGRESS: 'Em andamento',
  COMPLETED: 'Concluída',
  CANCELLED: 'Cancelada',
};

export const canStartDelivery = (delivery: Delivery) => delivery.status === 'ASSIGNED' && delivery.orderStatus === 'READY';
export const canCompleteDelivery = (delivery: Delivery) => delivery.status === 'IN_PROGRESS' && delivery.orderStatus === 'OUT_FOR_DELIVERY';
export const isDeliveryActive = (delivery: Delivery) => delivery.status === 'ASSIGNED' || delivery.status === 'IN_PROGRESS';

/** O mesmo texto é exibido e copiado, incluindo complemento/referência do endereço. */
export function formatDeliveryAddress(address: DeliveryAddress): string {
  const cep = address.cep.replace(/\D/g, '').replace(/^(\d{5})(\d{3})$/, '$1-$2');
  return [
    `${address.street}, ${address.number}`,
    address.complement,
    `${address.district} — ${address.city}/${address.state}`,
    `CEP ${cep}`,
  ].filter(Boolean).join('\n');
}

export function deliveryInstruction(delivery: Delivery): string {
  if (delivery.status === 'CANCELLED') return 'Esta entrega foi cancelada pela marmitaria.';
  if (delivery.status === 'COMPLETED') return 'Conclusão confirmada pela marmitaria.';
  if (canStartDelivery(delivery)) return 'O pedido está pronto. Inicie a entrega ao sair da marmitaria.';
  if (canCompleteDelivery(delivery)) return 'Confirme a conclusão somente depois de entregar o pedido ao cliente.';
  return 'Aguarde a marmitaria deixar o pedido pronto para iniciar a entrega.';
}
