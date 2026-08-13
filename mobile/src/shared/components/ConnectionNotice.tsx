import { StyleSheet, Text, View } from 'react-native'
import { Card } from './Card'
import { StatusBadge } from './StatusBadge'
import { colors, spacing, typography } from '../theme/theme'

interface ConnectionNoticeProps {
  copy: string
  title?: string
}

export function ConnectionNotice({ copy, title = 'Previa local ativa' }: ConnectionNoticeProps) {
  return (
    <Card tone="warm">
      <View style={styles.head}>
        <Text style={styles.title}>{title}</Text>
        <StatusBadge label="Demo" tone="warning" />
      </View>
      <Text style={styles.copy}>{copy}</Text>
    </Card>
  )
}

const styles = StyleSheet.create({
  head: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  title: {
    color: colors.ink,
    flex: 1,
    fontSize: typography.body,
    fontWeight: '900',
  },
  copy: {
    color: colors.muted,
    fontSize: typography.small,
    lineHeight: 18,
    marginTop: spacing.sm,
  },
})
