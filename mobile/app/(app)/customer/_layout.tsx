import { Stack } from 'expo-router';

/**
 * Navegação do perfil Cliente (Willian).
 *   (tabs)/      → abas principais: Cardápio, Carrinho, Pedidos e Conta
 *   addresses    → endereços do cliente
 *   checkout     → finalizar pedido
 *   order/[id]   → acompanhamento de um pedido
 */
export default function CustomerLayout() {
  return (
    <Stack screenOptions={{ headerBackTitle: 'Voltar' }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="addresses" options={{ title: 'Meus endereços' }} />
      <Stack.Screen name="checkout" options={{ title: 'Finalizar pedido' }} />
      <Stack.Screen name="order/[id]" options={{ title: 'Acompanhar pedido' }} />
    </Stack>
  );
}
