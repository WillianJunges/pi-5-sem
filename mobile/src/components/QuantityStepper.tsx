import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme';

interface QuantityStepperProps {
  value: number;
  onChange(value: number): void;
  /** Menor valor permitido no botão "−" (padrão: 1). Use 0 para permitir remover. */
  min?: number;
  max?: number;
}

/** Botões − e + com a quantidade no meio. */
export function QuantityStepper({ value, onChange, min = 1, max = 99 }: QuantityStepperProps) {
  return (
    <View style={styles.container}>
      <StepButton label="−" disabled={value <= min} onPress={() => onChange(value - 1)} />
      <Text style={styles.value}>{value}</Text>
      <StepButton label="+" disabled={value >= max} onPress={() => onChange(value + 1)} />
    </View>
  );
}

function StepButton({ label, disabled, onPress }: { label: string; disabled: boolean; onPress(): void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={({ pressed }) => [styles.button, (pressed || disabled) && { opacity: 0.4 }]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  button: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontSize: 18, fontWeight: '600', color: colors.primary, lineHeight: 20 },
  value: { minWidth: 24, textAlign: 'center', fontSize: 16, fontWeight: '600', color: colors.text },
});
