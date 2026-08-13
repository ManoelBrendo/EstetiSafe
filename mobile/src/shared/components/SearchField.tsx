import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { colors, radius, spacing, typography } from '../theme/theme'

interface SearchFieldProps {
  accessibilityLabel?: string
  onChangeText: (value: string) => void
  placeholder: string
  value: string
}

export function SearchField({ accessibilityLabel, onChangeText, placeholder, value }: SearchFieldProps) {
  return (
    <View style={styles.search}>
      <View style={styles.searchHeader}>
        <Text style={styles.searchLabel}>Busca</Text>
        {value ? (
          <TouchableOpacity accessibilityRole="button" activeOpacity={0.82} onPress={() => onChangeText('')} style={styles.clearButton}>
            <Text style={styles.clearButtonText}>Limpar</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <TextInput
        accessibilityLabel={accessibilityLabel || placeholder}
        autoCapitalize="none"
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        returnKeyType="search"
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  search: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  searchHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  searchLabel: {
    color: colors.goldDeep,
    fontSize: typography.micro,
    fontWeight: '900',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  clearButton: {
    borderColor: colors.line,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  clearButtonText: {
    color: colors.inkSoft,
    fontSize: typography.small,
    fontWeight: '900',
  },
  input: {
    backgroundColor: colors.bgSoft,
    borderColor: colors.line,
    borderRadius: radius.sm,
    borderWidth: 1,
    color: colors.ink,
    fontSize: typography.body,
    minHeight: 46,
    paddingHorizontal: spacing.md,
  },
})
