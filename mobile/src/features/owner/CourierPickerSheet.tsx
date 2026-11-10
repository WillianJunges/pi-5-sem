import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../../components/Button';
import { type Courier, ownerService } from '../../services/owner.service';
import { colors, spacing } from '../../theme';
import { getErrorMessage } from '../../utils/errors';

/**
 * Lista de motoboys ativos para atribuir (ou trocar) a entrega de um pedido.
 * Recarrega a cada abertura: um motoboy pode ter sido desativado enquanto a tela estava aberta.
 * O backend confere de novo se o motoboy está ativo, então a lista é só uma ajuda.
 */
export function CourierPickerSheet({
  visible,
  currentCourierId,
  onPick,
  onClose,
}: {
  visible: boolean;
  currentCourierId: string | null;
  onPick(courier: Courier): void;
  onClose(): void;
}) {
  const insets = useSafeAreaInsets();
  const [couriers, setCouriers] = useState<Courier[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setCouriers(null);
    setError(null);
    ownerService.couriers
      .list()
      .then((list) => !cancelled && setCouriers(list.filter((c) => c.active)))
      .catch((err) => !cancelled && setError(getErrorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
        <Text style={styles.sheetTitle}>Escolher motoboy</Text>
        {error ? (
          <Text style={styles.error}>{error}</Text>
        ) : couriers === null ? (
          <ActivityIndicator color={colors.primary} />
        ) : couriers.length === 0 ? (
          <Text style={styles.muted}>Nenhum motoboy ativo. Cadastre ou reative um em Conta → Motoboys.</Text>
        ) : (
          <ScrollView style={styles.sheetList} contentContainerStyle={{ gap: spacing.sm }}>
            {couriers.map((c) => {
              const current = c.id === currentCourierId;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => onPick(c)}
                  disabled={current}
                  style={({ pressed }) => [styles.option, current && styles.current, pressed && { opacity: 0.6 }]}
                >
                  <View style={styles.optionInfo}>
                    <Text style={styles.optionName}>{c.name}</Text>
                    {/* Sem sessão aberta o motoboy só vê a entrega quando entrar no app. */}
                    <Text style={styles.muted}>
                      {c.activeSessions > 0 ? 'Logado no app' : 'Não está logado no app'}
                      {c.phone ? ` · ${c.phone}` : ''}
                    </Text>
                  </View>
                  <Text style={current ? styles.currentTag : styles.pick}>{current ? 'Atual' : 'Escolher'}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
        <Button title="Fechar" variant="outline" onPress={onClose} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    maxHeight: '75%',
    backgroundColor: colors.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: spacing.md,
    gap: spacing.md,
  },
  sheetTitle: { fontSize: 18, fontWeight: 'bold', color: colors.text },
  sheetList: { flexGrow: 0 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  current: { borderColor: colors.primary, backgroundColor: '#FFF7ED' },
  optionInfo: { flex: 1, gap: 2 },
  optionName: { fontSize: 15, color: colors.text, fontWeight: '600' },
  pick: { fontSize: 15, fontWeight: '600', color: colors.primary },
  currentTag: { fontSize: 13, fontWeight: '600', color: colors.muted },
  muted: { fontSize: 13, color: colors.muted },
  error: { fontSize: 14, color: colors.danger },
});
