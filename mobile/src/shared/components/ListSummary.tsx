import { StyleSheet, Text, View } from 'react-native'
import { colors, radius, spacing, typography } from '../theme/theme'

interface ListSummaryProps {
  copy: string
  label: string
  value: string | number
}

export function ListSummary({ copy, label, value }: ListSummaryProps) {
  return (
    <View style={styles.summary}>
      <View style={styles.copyBlock}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.copy}>{copy}</Text>
      </View>
      <Text style={styles.value}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  summary: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.58)',
    borderColor: colors.line,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  copyBlock: {
    flex: 1,
    gap: spacing.xs,
  },
  label: {
    color: colors.goldDeep,
    fontSize: typography.micro,
    fontWeight: '900',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  copy: {
    color: colors.muted,
    fontSize: typography.small,
    lineHeight: 18,
  },
  value: {
    color: colors.ink,
    fontSize: typography.title,
    fontWeight: '900',
  },
})
