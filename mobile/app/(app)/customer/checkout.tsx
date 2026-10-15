import { EmptyState } from '../../../src/components/EmptyState';

/** Finalizar pedido — checkout e criação do pedido entram nos itens 5 e 6. */
export default function CheckoutScreen() {
  return (
    <EmptyState
      icon="✅"
      title="Finalizar pedido"
      message="Aqui você vai revisar o carrinho, escolher o endereço e confirmar o pedido."
    />
  );
}
