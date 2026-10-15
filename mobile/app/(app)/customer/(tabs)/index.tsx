import { EmptyState } from '../../../../src/components/EmptyState';
import { useAuth } from '../../../../src/contexts/AuthContext';

/** Cardápio do dia — a consulta ao backend entra no item 2 (consulta de cardápio). */
export default function MenuScreen() {
  const { user } = useAuth();
  return (
    <EmptyState
      icon="🍱"
      title={`Olá, ${user?.name.split(' ')[0]}!`}
      message="O cardápio do dia vai aparecer aqui."
    />
  );
}
