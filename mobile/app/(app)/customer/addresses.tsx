import { EmptyState } from '../../../src/components/EmptyState';

/** Endereços do cliente — cadastro com autocomplete entra no item 4. */
export default function AddressesScreen() {
  return (
    <EmptyState
      icon="📍"
      title="Nenhum endereço cadastrado"
      message="Cadastre onde você quer receber suas marmitas."
    />
  );
}
