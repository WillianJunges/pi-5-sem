import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../theme';

interface EmptyStateProps {
  icon: string;
  title: string;
  message?: string;
  /** Ação opcional exibida abaixo do texto (ex.: um <Button>). */
  children?: ReactNode;
}

/** Mensagem centralizada para telas sem conteúdo (lista vazia, módulo ainda não feito...). */
export function EmptyState({ icon, title, message, children }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <Text style={styles.icon}>{icon}</Text>
      </View>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {children ? <View style={styles.action}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
    backgroundColor: colors.background,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  icon: { fontSize: 44 },
  title: { fontSize: 20, fontWeight: '800', color: colors.text, textAlign: 'center' },
  message: { color: colors.muted, textAlign: 'center', lineHeight: 21 },
  action: { alignSelf: 'stretch', marginTop: spacing.md },
});
