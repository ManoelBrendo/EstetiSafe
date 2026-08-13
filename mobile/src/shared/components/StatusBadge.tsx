import { StyleSheet, Text, View } from 'react-native'
import { colors, radius, spacing, typography } from '../theme/theme'

type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

interface StatusBadgeProps {
  label: string
  tone?: BadgeTone
}

const toneStyles: Record<BadgeTone, { bg: string; color: string }> = {
  neutral: { bg: 'rgba(142, 129, 117, 0.14)', color: colors.inkSoft },
  success: { bg: 'rgba(63, 124, 103, 0.14)', color: colors.green },
  warning: { bg: 'rgba(230, 203, 159, 0.28)', color: colors.goldDeep },
  danger: { bg: 'rgba(178, 74, 72, 0.12)', color: colors.danger },
  info: { bg: 'rgba(95, 127, 168, 0.14)', color: colors.blue },
}

export function StatusBadge({ label, tone = 'neutral' }: StatusBadgeProps) {
  const current = toneStyles[tone]
  return (
    <View style={[styles.badge, { backgroundColor: current.bg }]}>
      <Text style={[styles.label, { color: current.color }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  label: {
    fontSize: typography.small,
    fontWeight: '800',
  },
})
