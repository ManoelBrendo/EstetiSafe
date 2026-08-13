import { StyleSheet, Text, View } from 'react-native'
import { colors, radius, spacing, typography } from '../theme/theme'

interface EmptyStateProps {
  title: string
  copy: string
}

export function EmptyState({ title, copy }: EmptyStateProps) {
  return (
    <View style={styles.empty}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.copy}>{copy}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  empty: {
    backgroundColor: 'rgba(255, 255, 255, 0.58)',
    borderColor: colors.line,
    borderRadius: radius.md,
    borderStyle: 'dashed',
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.xl,
  },
  title: {
    color: colors.ink,
    fontSize: typography.section,
    fontWeight: '800',
  },
  copy: {
    color: colors.muted,
    fontSize: typography.body,
    lineHeight: 21,
  },
})
