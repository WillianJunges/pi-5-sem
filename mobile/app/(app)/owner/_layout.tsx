import { Stack } from 'expo-router';

/**
 * Navegação do perfil Proprietária (Lucas).
 *   (tabs)/       → abas principais: Produtos, Cardápios, Taxas e Conta
 *   product-form  → cadastro/edição de produto e variações (?id= para editar)
 *   menu-form     → cadastro/edição de cardápio (?id= para editar)
 *   menu/[id]     → itens do cardápio, preço especial, ativar e encerrar
 *   fee-form      → cadastro/edição de faixa de taxa (?id= para editar)
 */
export default function OwnerLayout() {
  return (
    <Stack screenOptions={{ headerBackTitle: 'Voltar' }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="product-form" options={{ title: 'Produto' }} />
      <Stack.Screen name="menu-form" options={{ title: 'Cardápio' }} />
      <Stack.Screen name="menu/[id]" options={{ title: 'Cardápio' }} />
      <Stack.Screen name="fee-form" options={{ title: 'Faixa de taxa' }} />
    </Stack>
  );
}
