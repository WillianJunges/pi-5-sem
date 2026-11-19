import { Stack } from 'expo-router';
import { requireOptionalNativeModule } from 'expo';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    // Builds anteriores podem não conter o módulo; nesse caso o app abre normalmente.
    try {
      const navigationBar = requireOptionalNativeModule<{ setStyle(style: string): Promise<void> }>('ExpoNavigationBar');
      void navigationBar?.setStyle('dark').catch(() => undefined);
    } catch {
      // A cor poderá ser configurada após instalar uma build com o módulo nativo.
    }
  }, []);
  return (
    <AuthProvider>
      <CourierOfflineProvider>
        <CourierTrackingProvider>
          <StatusBar style="dark" />
          <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={Platform.OS === 'android' ? ['bottom'] : []}>
            <RootNavigator />
          </SafeAreaView>
          <NotificationsProvider>{null}</NotificationsProvider>
        </CourierTrackingProvider>
      </CourierOfflineProvider>
    </AuthProvider>
  );
}
