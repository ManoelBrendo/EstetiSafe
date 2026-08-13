import { useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { authApi } from '../../../shared/api/auth'
import { Card } from '../../../shared/components/Card'
import { ScreenHeader } from '../../../shared/components/ScreenHeader'
import { colors, radius, spacing, typography } from '../../../shared/theme/theme'
import type { AuthUser } from '../../../shared/types/auth'

interface LoginScreenProps {
  onAuthenticated: (user: AuthUser) => void
  onPreview: () => void
}

export function LoginScreen({ onAuthenticated, onPreview }: LoginScreenProps) {
  const [email, setEmail] = useState('demo@lappui.local')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin() {
    setError('')
    setLoading(true)

    try {
      const session = await authApi.login(email.trim(), password)
      onAuthenticated(session.user)
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : 'Nao foi possivel entrar no app.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.safe}>
      <View style={styles.screen}>
        <View style={styles.brandMark}>
          <Text style={styles.brandMarkText}>LA</Text>
        </View>

        <ScreenHeader
          eyebrow="Acesso mobile"
          title="Entrar no L'Appui"
          copy="Use sua sessao da clinica para consultar Documentos, Auditoria e Profissionais no Android."
        />

        <Card>
          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                autoCapitalize="none"
                keyboardType="email-address"
                onChangeText={setEmail}
                placeholder="clinica@email.com"
                placeholderTextColor={colors.muted}
                style={styles.input}
                value={email}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Senha</Text>
              <TextInput
                onChangeText={setPassword}
                placeholder="Sua senha"
                placeholderTextColor={colors.muted}
                secureTextEntry
                style={styles.input}
                value={password}
              />
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity activeOpacity={0.84} disabled={loading} onPress={handleLogin} style={styles.primaryButton}>
              {loading ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.primaryButtonText}>Entrar</Text>}
            </TouchableOpacity>

            <TouchableOpacity activeOpacity={0.84} disabled={loading} onPress={onPreview} style={styles.previewButton}>
              <Text style={styles.previewButtonText}>Usar previa sem login</Text>
            </TouchableOpacity>
          </View>
        </Card>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: colors.bg,
    flex: 1,
  },
  screen: {
    flex: 1,
    gap: spacing.xl,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  brandMark: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.ink,
    borderRadius: radius.lg,
    height: 62,
    justifyContent: 'center',
    width: 62,
  },
  brandMarkText: {
    color: colors.goldLight,
    fontSize: typography.section,
    fontWeight: '900',
  },
  form: {
    gap: spacing.lg,
  },
  field: {
    gap: spacing.sm,
  },
  label: {
    color: colors.inkSoft,
    fontSize: typography.small,
    fontWeight: '900',
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderColor: colors.line,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.ink,
    fontSize: typography.body,
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  error: {
    color: colors.danger,
    fontSize: typography.small,
    fontWeight: '800',
    lineHeight: 18,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderRadius: radius.md,
    minHeight: 50,
    justifyContent: 'center',
    padding: spacing.md,
  },
  primaryButtonText: {
    color: colors.surface,
    fontSize: typography.body,
    fontWeight: '900',
  },
  previewButton: {
    alignItems: 'center',
    borderColor: colors.line,
    borderRadius: radius.md,
    borderWidth: 1,
    minHeight: 48,
    justifyContent: 'center',
    padding: spacing.md,
  },
  previewButtonText: {
    color: colors.ink,
    fontSize: typography.body,
    fontWeight: '900',
  },
})
