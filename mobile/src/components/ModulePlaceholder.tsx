import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { colors, spacing } from '../theme';
import { Button } from './Button';

/** Tela provisória de cada perfil, até o módulo correspondente ser desenvolvido. */
export function ModulePlaceholder({ area, responsible }: { area: string; responsible: string }) {
  const { user } = useAuth();
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.greeting}>Olá, {user?.name.split(' ')[0]}!</Text>
        <Text style={styles.title}>{area}</Text>
        <Text style={styles.muted}>Módulo em desenvolvimento ({responsible}).</Text>
      </View>
      <Button title="Meu perfil" variant="outline" onPress={() => router.push('/profile')} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.lg, backgroundColor: colors.background },
  content: { flex: 1, justifyContent: 'center', gap: spacing.sm },
  greeting: { fontSize: 16, color: colors.muted },
  title: { fontSize: 28, fontWeight: 'bold', color: colors.text },
  muted: { color: colors.muted },
});
