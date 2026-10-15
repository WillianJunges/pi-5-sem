import { EmptyState } from '../../../../src/components/EmptyState';

/** Pedidos e histórico do cliente — a listagem entra no item 7. */
export default function OrdersScreen() {
  return (
    <EmptyState
      icon="🧾"
      title="Nenhum pedido ainda"
      message="Seus pedidos e o histórico vão aparecer aqui."
    />
  );
}
