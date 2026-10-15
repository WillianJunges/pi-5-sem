import { Tabs } from 'expo-router/js-tabs';
import { Text } from 'react-native';
import { colors } from '../../../../src/theme';

function TabIcon({ icon, focused }: { icon: string; focused: boolean }) {
  return <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>{icon}</Text>;
}

/** Abas principais do Cliente. */
export default function CustomerTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        headerTitleStyle: { color: colors.text },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Cardápio',
          tabBarIcon: ({ focused }) => <TabIcon icon="🍱" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: 'Carrinho',
          tabBarIcon: ({ focused }) => <TabIcon icon="🛒" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Pedidos',
          tabBarIcon: ({ focused }) => <TabIcon icon="🧾" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Conta',
          tabBarIcon: ({ focused }) => <TabIcon icon="👤" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
