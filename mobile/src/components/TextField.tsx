import { type Ref, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, type TextInputProps, View } from 'react-native';
import { colors, radius, spacing } from '../theme';

interface TextFieldProps extends TextInputProps {
  label: string;
  /** Permite focar o campo pelo código (ex.: pular para o próximo campo). */
  ref?: Ref<TextInput>;
}

export function TextField({
  label,
  style,
  ref,
  secureTextEntry,
  onFocus,
  onBlur,
  ...props
}: TextFieldProps) {
  // Campos de senha ganham um olhinho discreto no canto direito para mostrar/esconder o texto.
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);
  const isPassword = Boolean(secureTextEntry);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View>
        <TextInput
          ref={ref}
          placeholderTextColor={colors.muted}
          style={[
            styles.input,
            focused && styles.inputFocused,
            isPassword && styles.inputWithEye,
            style,
          ]}
          secureTextEntry={isPassword && !visible}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          {...props}
        />
        {isPassword ? (
          <Pressable
            onPress={() => setVisible((v) => !v)}
            hitSlop={12}
            style={styles.eyeButton}
            accessibilityRole="button"
            accessibilityLabel={visible ? 'Ocultar senha' : 'Mostrar senha'}
          >
            <View style={[styles.eyeWrap, !visible && styles.eyeDim]}>
              <View style={styles.eyeOutline}>
                <View style={styles.pupil} />
              </View>
              {!visible ? <View style={styles.slash} /> : null}
            </View>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: colors.text },
  input: {
    height: 50,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.field,
  },
  inputFocused: { borderColor: colors.brand, backgroundColor: colors.surface },
  inputWithEye: { paddingRight: 44 },
  eyeButton: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyeWrap: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  eyeDim: { opacity: 0.7 },
  // Olho desenhado só com contorno: discreto e na cor cinza do tema.
  eyeOutline: {
    width: 18,
    height: 11,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pupil: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.muted },
  // Risquinho diagonal sobre o olho quando a senha está escondida.
  slash: {
    position: 'absolute',
    width: 22,
    height: 1.5,
    borderRadius: 1,
    backgroundColor: colors.muted,
    transform: [{ rotate: '-45deg' }],
  },
});
