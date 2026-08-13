import { StyleSheet, Text, View } from 'react-native'
import { colors, spacing, typography } from '../theme/theme'

interface ScreenHeaderProps {
  eyebrow: string
  title: string
  copy: string
}

export function ScreenHeader({ eyebrow, title, copy }: ScreenHeaderProps) {
  return (
    <View style={styles.header}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.copy}>{copy}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.xs,
  },
  eyebrow: {
    color: colors.goldDeep,
    fontSize: typography.micro,
    fontWeight: '900',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.ink,
    fontSize: typography.title,
    fontWeight: '800',
    lineHeight: 30,
  },
  copy: {
    color: colors.muted,
    fontSize: typography.body,
    lineHeight: 21,
  },
})
