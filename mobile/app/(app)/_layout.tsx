import { Stack } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';

/**
 * Área logada. Cada perfil só enxerga a própria pasta:
 *   customer/ → Willian · owner/ → Lucas · courier/ → Yuri
 */
export default function AppLayout() {
  const { user } = useAuth();
  const role = user?.role;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />

      <Stack.Protected guard={role === 'CUSTOMER'}>
        <Stack.Screen name="customer" />
      </Stack.Protected>
      <Stack.Protected guard={role === 'OWNER'}>
        <Stack.Screen name="owner" />
      </Stack.Protected>
      <Stack.Protected guard={role === 'COURIER'}>
        <Stack.Screen name="courier" />
      </Stack.Protected>

      <Stack.Screen name="profile" options={{ headerShown: true, title: 'Meu perfil', headerBackTitle: 'Voltar' }} />
    </Stack>
  );
}
