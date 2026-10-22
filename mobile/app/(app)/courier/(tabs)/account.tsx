import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text } from 'react-native';
import { Button } from '../../../../src/components/Button';
import { useAuth } from '../../../../src/contexts/AuthContext';
import { courierStyles as styles } from '../../../../src/features/courier/components';
import { getErrorMessage } from '../../../../src/utils/errors';

export default function CourierAccount() {
  const { user, signOut } = useAuth();
  const [leaving, setLeaving] = useState(false);
  if (!user) return null;

  async function leave() {
    if (leaving) return;
    setLeaving(true);
    try { await signOut(); }
    catch (error) { Alert.alert('Não foi possível sair', getErrorMessage(error)); }
    finally { setLeaving(false); }
  }

  return <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
    <Text style={styles.title}>{user.name}</Text>
    <Text style={styles.text}>{user.email}</Text>
    <Text style={styles.muted}>Motoboy</Text>
    <Pressable accessibilityRole="button" onPress={() => router.push('/profile')} style={styles.card}>
      <Text style={styles.link}>Meu perfil ›</Text>
    </Pressable>
    <Button title="Sair" variant="outline" onPress={() => void leave()} loading={leaving} />
  </ScrollView>;
}
