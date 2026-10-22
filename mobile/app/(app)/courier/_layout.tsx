import { Stack } from 'expo-router';

/** As abas compartilham a área COURIER; detalhes mantêm o botão de voltar. */
export default function CourierLayout() {
  return <Stack>
    <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    <Stack.Screen name="delivery/[id]" options={{ title: 'Detalhes da entrega', headerBackTitle: 'Voltar' }} />
  </Stack>;
}
