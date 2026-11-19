import { Tabs } from 'expo-router/js-tabs';
import { Platform, Text } from 'react-native';
import { colors } from '../../../../src/theme';

/** Área COURIER protegida pelo layout autenticado; detalhes ficam fora das abas. */
export default function CourierTabsLayout() {
  return <Tabs safeAreaInsets={Platform.OS === 'android' ? { bottom: 0 } : undefined} screenOptions={{ tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.muted, headerTitleStyle: { color: colors.text } }}>
    <Tabs.Screen name="index" options={{ title: 'Entregas', tabBarIcon: () => <Text style={{ fontSize: 22 }}>🛵</Text> }} />
    <Tabs.Screen name="history" options={{ title: 'Histórico', tabBarIcon: () => <Text style={{ fontSize: 22 }}>📋</Text> }} />
    <Tabs.Screen name="pending" options={{ title: 'Pendências', tabBarIcon: () => <Text style={{ fontSize: 22 }}>↻</Text> }} />
    <Tabs.Screen name="account" options={{ title: 'Conta', tabBarIcon: () => <Text style={{ fontSize: 22 }}>👤</Text> }} />
  </Tabs>;
}
