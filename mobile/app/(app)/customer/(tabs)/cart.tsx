import { router } from 'expo-router';
import { Button } from '../../../../src/components/Button';
import { EmptyState } from '../../../../src/components/EmptyState';

/** Carrinho — o armazenamento local (SQLite) entra no item 3. */
export default function CartScreen() {
  return (
    <EmptyState icon="🛒" title="Seu carrinho está vazio" message="Escolha uma marmita no cardápio.">
      <Button title="Ver cardápio" onPress={() => router.navigate('/customer')} />
    </EmptyState>
  );
}
