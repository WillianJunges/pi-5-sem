import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { colors, radius, shadows, spacing } from '../theme';
import { GradientView } from './GradientView';

interface ButtonProps {
  title: string;
  onPress(): void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'outline';
}

export function Button({ title, onPress, loading, disabled, variant = 'primary' }: ButtonProps) {
  const outline = variant === 'outline';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        outline ? styles.outline : styles.primary,
        (pressed || disabled) && { opacity: 0.75 },
      ]}
    >
      {outline ? null : <GradientView from={colors.brand} to={colors.brandEnd} />}
      {loading ? (
        <ActivityIndicator color={outline ? colors.primary : colors.primaryText} />
      ) : (
        <Text style={[styles.text, outline && { color: colors.primary }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    overflow: 'hidden',
  },
  primary: { backgroundColor: colors.brand, ...shadows.brand },
  outline: { borderWidth: 1.5, borderColor: colors.primary, backgroundColor: 'transparent' },
  text: { color: colors.primaryText, fontSize: 16, fontWeight: '700' },
});
