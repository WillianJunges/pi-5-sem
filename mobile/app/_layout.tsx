import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { AuthProvider, useAuth } from '../src/contexts/AuthContext';
import { CourierOfflineProvider } from '../src/features/courier/offline/CourierOfflineProvider';
import { CourierTrackingProvider } from '../src/features/tracking/CourierTrackingProvider';
import { colors } from '../src/theme';
import { NotificationsProvider } from '../src/features/notifications/NotificationsProvider';

function RootNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Sem sessão só as telas de (auth) existem; com sessão, só as de (app).
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!user}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={!!user}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <CourierOfflineProvider>
        <CourierTrackingProvider>
          <StatusBar style="dark" />
          <RootNavigator />
          <NotificationsProvider>{null}</NotificationsProvider>
        </CourierTrackingProvider>
      </CourierOfflineProvider>
    </AuthProvider>
  );
}
