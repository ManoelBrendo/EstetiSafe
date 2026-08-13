import type { ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import { colors, radius, shadows, spacing } from '../theme/theme'

interface CardProps {
  children: ReactNode
  tone?: 'default' | 'warm' | 'alert'
}

export function Card({ children, tone = 'default' }: CardProps) {
  return <View style={[styles.card, tone === 'warm' && styles.warm, tone === 'alert' && styles.alert]}>{children}</View>
}

const styles = StyleSheet.create({
  card: {
    ...shadows.card,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.lg,
  },
  warm: {
    backgroundColor: colors.surfaceWarm,
  },
  alert: {
    backgroundColor: '#fff4ef',
    borderColor: 'rgba(178, 74, 72, 0.22)',
  },
})
