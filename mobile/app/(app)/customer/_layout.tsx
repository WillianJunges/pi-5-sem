import { Stack } from 'expo-router';
import { CartProvider } from '../../../src/contexts/CartContext';

/**
 * Navegação do perfil Cliente (Willian).
 *   (tabs)/      → abas principais: Cardápio, Carrinho, Pedidos e Conta
 *   addresses    → endereços do cliente
 *   address-form → cadastro/edição de endereço (?id= para editar)
 *   checkout     → finalizar pedido
 *   order/[id]   → acompanhamento de um pedido
 *
 * O CartProvider fica aqui para o carrinho existir só na área do Cliente.
 */
export default function CustomerLayout() {
  return (
    <CartProvider>
      <Stack screenOptions={{ headerBackTitle: 'Voltar' }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="addresses" options={{ title: 'Meus endereços' }} />
        <Stack.Screen name="address-form" options={{ title: 'Novo endereço' }} />
        <Stack.Screen name="checkout" options={{ title: 'Finalizar pedido' }} />
        <Stack.Screen name="order/[id]" options={{ title: 'Pedido' }} />
      </Stack>
    </CartProvider>
  );
}
