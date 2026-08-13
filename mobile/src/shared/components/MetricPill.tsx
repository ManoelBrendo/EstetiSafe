import { StyleSheet, Text, View } from 'react-native'
import { colors, radius, spacing, typography } from '../theme/theme'

interface MetricPillProps {
  label: string
  value: string | number
}

export function MetricPill({ label, value }: MetricPillProps) {
  return (
    <View style={styles.metric}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  metric: {
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    borderColor: colors.line,
    borderRadius: radius.sm,
    borderWidth: 1,
    flex: 1,
    minWidth: 104,
    padding: spacing.md,
  },
  label: {
    color: colors.muted,
    fontSize: typography.micro,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  value: {
    color: colors.ink,
    fontSize: typography.section,
    fontWeight: '800',
  },
})
