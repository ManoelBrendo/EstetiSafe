import { useEffect, useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { AuditScreen } from '../screens/Audit/AuditScreen'
import { LoginScreen } from '../screens/Auth/LoginScreen'
import { DocumentsScreen } from '../screens/Documents/DocumentsScreen'
import { ProfessionalsScreen } from '../screens/Professionals/ProfessionalsScreen'
import { authApi } from '../../shared/api/auth'
import { setMobileAuthToken } from '../../shared/api/client'
import { mobileEnv } from '../../shared/env'
import { colors, radius, shadows, spacing, typography } from '../../shared/theme/theme'
import type { AuthUser } from '../../shared/types/auth'

type MobileRoute = 'documents' | 'audit' | 'professionals'

interface RouteConfig {
  id: MobileRoute
  label: string
  shortLabel: string
  priority: string
  summary: string
  metric: string
  render: () => ReactElement
}

const sidebarHighlights = [
  { label: 'Documentos criticos', value: '2', copy: 'Vencimentos e arquivos pendentes.' },
  { label: 'Auditoria', value: '1', copy: 'Evento sensivel pede revisao.' },
  { label: 'Equipe ativa', value: '2', copy: 'Agenda e folha em acompanhamento.' },
]

export function MobileNavigator() {
  const [activeRoute, setActiveRoute] = useState<MobileRoute>('documents')
  const [user, setUser] = useState<AuthUser | null>(null)
  const [previewMode, setPreviewMode] = useState(Boolean(mobileEnv.token))
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const routes = useMemo<RouteConfig[]>(
    () => [
      {
        id: 'documents',
        label: 'Documentos',
        shortLabel: 'DOC',
        priority: 'Prioridade alta',
        summary: 'Arquivos, vencimentos e obrigatorios da clinica.',
        metric: '72% score',
        render: () => <DocumentsScreen />,
      },
      {
        id: 'audit',
        label: 'Auditoria',
        shortLabel: 'AUD',
        priority: 'Controle',
        summary: 'Eventos sensiveis e rastreabilidade operacional.',
        metric: '1 risco alto',
        render: () => <AuditScreen />,
      },
      {
        id: 'professionals',
        label: 'Profissionais',
        shortLabel: 'PRO',
        priority: 'Equipe',
        summary: 'Cadastros, agenda semanal e folha de pagamento.',
        metric: '2 ativos',
        render: () => <ProfessionalsScreen />,
      },
    ],
    []
  )
  const active = routes.find(route => route.id === activeRoute) || routes[0]

  useEffect(() => {
    if (mobileEnv.token) {
      setMobileAuthToken(mobileEnv.token)
    }
  }, [])

  if (!user && !previewMode) {
    return <LoginScreen onAuthenticated={setUser} onPreview={() => setPreviewMode(true)} />
  }

  function handleLogout() {
    authApi.logout()
    setUser(null)
    setPreviewMode(false)
    setActiveRoute('documents')
    setSidebarOpen(false)
  }

  function handleRoutePress(routeId: MobileRoute) {
    setActiveRoute(routeId)
    setSidebarOpen(false)
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.shell}>
        <View style={styles.brandRow}>
          <TouchableOpacity accessibilityRole="button" onPress={() => setSidebarOpen(true)} style={styles.menuButton}>
            <Text style={styles.menuButtonText}>Menu</Text>
          </TouchableOpacity>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>LA</Text>
          </View>
          <View>
            <Text style={styles.brandName}>{user?.clinicName || "L'Appui Mobile"}</Text>
            <Text style={styles.brandCopy}>{previewMode ? 'Previa Android' : user?.email || 'Android operacional'}</Text>
          </View>
          <TouchableOpacity accessibilityRole="button" onPress={handleLogout} style={styles.logoutButton}>
            <Text style={styles.logoutText}>Sair</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {active.render()}
        </ScrollView>

        <TouchableOpacity
          accessibilityRole="button"
          activeOpacity={0.88}
          onPress={() => setSidebarOpen(true)}
          style={styles.pointsButton}
        >
          <View style={styles.pointsBadge}>
            <Text style={styles.pointsBadgeText}>IMP</Text>
          </View>
          <View style={styles.pointsCopy}>
            <Text style={styles.pointsTitle}>Pontos importantes</Text>
            <Text style={styles.pointsMeta}>2 docs criticos, 1 auditoria, 2 equipe</Text>
          </View>
          <Text style={styles.pointsAction}>Abrir</Text>
        </TouchableOpacity>

        <View style={styles.tabs}>
          {routes.map(route => {
            const selected = route.id === activeRoute
            return (
              <TouchableOpacity
                key={route.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setActiveRoute(route.id)}
                style={[styles.tab, selected && styles.tabActive]}
              >
                <Text style={[styles.tabShort, selected && styles.tabShortActive]}>{route.shortLabel}</Text>
                <Text style={[styles.tabLabel, selected && styles.tabLabelActive]}>{route.label}</Text>
              </TouchableOpacity>
            )
          })}
        </View>

        {sidebarOpen ? (
          <View style={styles.sidebarLayer}>
            <TouchableOpacity accessibilityRole="button" activeOpacity={1} onPress={() => setSidebarOpen(false)} style={styles.sidebarScrim} />
            <View style={styles.sidebar}>
              <View style={styles.sidebarHeader}>
                <View style={styles.sidebarMark}>
                  <Text style={styles.sidebarMarkText}>LA</Text>
                </View>
                <View style={styles.sidebarTitleBlock}>
                  <Text style={styles.sidebarEyebrow}>Painel mobile</Text>
                  <Text style={styles.sidebarTitle}>Pontos importantes</Text>
                </View>
                <TouchableOpacity accessibilityRole="button" onPress={() => setSidebarOpen(false)} style={styles.sidebarClose}>
                  <Text style={styles.sidebarCloseText}>Fechar</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.sidebarSection}>
                <Text style={styles.sidebarSectionLabel}>Navegacao</Text>
                {routes.map(route => {
                  const selected = activeRoute === route.id
                  return (
                    <TouchableOpacity
                      key={route.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      activeOpacity={0.86}
                      onPress={() => handleRoutePress(route.id)}
                      style={[styles.sidebarRoute, selected && styles.sidebarRouteActive]}
                    >
                      <View style={[styles.sidebarRouteCode, selected && styles.sidebarRouteCodeActive]}>
                        <Text style={[styles.sidebarRouteCodeText, selected && styles.sidebarRouteCodeTextActive]}>{route.shortLabel}</Text>
                      </View>
                      <View style={styles.sidebarRouteCopy}>
                        <View style={styles.sidebarRouteTopline}>
                          <Text style={[styles.sidebarRouteTitle, selected && styles.sidebarRouteTitleActive]}>{route.label}</Text>
                          <Text style={[styles.sidebarRouteMetric, selected && styles.sidebarRouteMetricActive]}>{route.metric}</Text>
                        </View>
                        <Text style={[styles.sidebarRoutePriority, selected && styles.sidebarRoutePriorityActive]}>{route.priority}</Text>
                        <Text style={[styles.sidebarRouteSummary, selected && styles.sidebarRouteSummaryActive]}>{route.summary}</Text>
                      </View>
                    </TouchableOpacity>
                  )
                })}
              </View>

              <View style={styles.sidebarSection}>
                <Text style={styles.sidebarSectionLabel}>Leitura rapida</Text>
                <View style={styles.highlightGrid}>
                  {sidebarHighlights.map(item => (
                    <View key={item.label} style={styles.highlightCard}>
                      <Text style={styles.highlightLabel}>{item.label}</Text>
                      <Text style={styles.highlightValue}>{item.value}</Text>
                      <Text style={styles.highlightCopy}>{item.copy}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <View style={styles.sidebarFooter}>
                <Text style={styles.sidebarFooterTitle}>Rotina operacional</Text>
                <Text style={styles.sidebarFooterCopy}>Documento, auditoria e equipe ficam acessiveis sem poluir a tela principal.</Text>
              </View>
            </View>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: colors.bg,
    flex: 1,
  },
  shell: {
    backgroundColor: colors.bg,
    flex: 1,
  },
  brandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  menuButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radius.pill,
    borderWidth: 1,
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  menuButtonText: {
    color: colors.ink,
    fontSize: typography.small,
    fontWeight: '900',
  },
  logoutButton: {
    borderColor: colors.line,
    borderRadius: radius.pill,
    borderWidth: 1,
    marginLeft: 'auto',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  logoutText: {
    color: colors.ink,
    fontSize: typography.small,
    fontWeight: '900',
  },
  brandMark: {
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderRadius: radius.lg,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  brandMarkText: {
    color: colors.goldLight,
    fontSize: typography.body,
    fontWeight: '900',
  },
  brandName: {
    color: colors.ink,
    fontSize: typography.section,
    fontWeight: '900',
  },
  brandCopy: {
    color: colors.muted,
    fontSize: typography.small,
    marginTop: 2,
  },
  content: {
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 188,
  },
  sidebarLayer: {
    bottom: 0,
    elevation: 30,
    flex: 1,
    flexDirection: 'row',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 60,
  },
  sidebarScrim: {
    backgroundColor: 'rgba(36, 26, 21, 0.34)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  sidebar: {
    ...shadows.card,
    backgroundColor: colors.bgSoft,
    borderRightColor: colors.line,
    borderRightWidth: 1,
    elevation: 31,
    gap: spacing.lg,
    maxWidth: 360,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    width: '86%',
  },
  sidebarHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  sidebarMark: {
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderRadius: radius.md,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  sidebarMarkText: {
    color: colors.goldLight,
    fontSize: typography.body,
    fontWeight: '900',
  },
  sidebarTitleBlock: {
    flex: 1,
  },
  sidebarEyebrow: {
    color: colors.goldDeep,
    fontSize: typography.micro,
    fontWeight: '900',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  sidebarTitle: {
    color: colors.ink,
    fontSize: typography.section,
    fontWeight: '900',
    marginTop: 2,
  },
  sidebarClose: {
    borderColor: colors.line,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  sidebarCloseText: {
    color: colors.inkSoft,
    fontSize: typography.small,
    fontWeight: '900',
  },
  sidebarSection: {
    gap: spacing.sm,
  },
  sidebarSectionLabel: {
    color: colors.muted,
    fontSize: typography.micro,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  sidebarRoute: {
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  sidebarRouteActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  sidebarRouteCode: {
    alignItems: 'center',
    backgroundColor: colors.surfaceWarm,
    borderColor: colors.line,
    borderRadius: radius.sm,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 48,
  },
  sidebarRouteCodeActive: {
    backgroundColor: 'rgba(230, 203, 159, 0.14)',
    borderColor: 'rgba(230, 203, 159, 0.28)',
  },
  sidebarRouteCodeText: {
    color: colors.goldDeep,
    fontSize: typography.micro,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  sidebarRouteCodeTextActive: {
    color: colors.goldLight,
  },
  sidebarRouteCopy: {
    flex: 1,
    gap: 3,
  },
  sidebarRouteTopline: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  sidebarRouteTitle: {
    color: colors.ink,
    fontSize: typography.body,
    fontWeight: '900',
  },
  sidebarRouteTitleActive: {
    color: colors.surface,
  },
  sidebarRouteMetric: {
    color: colors.goldDeep,
    fontSize: typography.micro,
    fontWeight: '900',
  },
  sidebarRouteMetricActive: {
    color: colors.goldLight,
  },
  sidebarRoutePriority: {
    color: colors.goldDeep,
    fontSize: typography.micro,
    fontWeight: '900',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  sidebarRoutePriorityActive: {
    color: colors.goldLight,
  },
  sidebarRouteSummary: {
    color: colors.muted,
    fontSize: typography.small,
    lineHeight: 17,
  },
  sidebarRouteSummaryActive: {
    color: 'rgba(255, 250, 243, 0.76)',
  },
  highlightGrid: {
    gap: spacing.sm,
  },
  highlightCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
  },
  highlightLabel: {
    color: colors.muted,
    fontSize: typography.micro,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  highlightValue: {
    color: colors.ink,
    fontSize: typography.title,
    fontWeight: '900',
    marginTop: spacing.xs,
  },
  highlightCopy: {
    color: colors.inkSoft,
    fontSize: typography.small,
    lineHeight: 17,
    marginTop: spacing.xs,
  },
  sidebarFooter: {
    backgroundColor: colors.surfaceWarm,
    borderColor: colors.line,
    borderRadius: radius.md,
    borderWidth: 1,
    marginTop: 'auto',
    padding: spacing.md,
  },
  sidebarFooterTitle: {
    color: colors.ink,
    fontSize: typography.body,
    fontWeight: '900',
  },
  sidebarFooterCopy: {
    color: colors.muted,
    fontSize: typography.small,
    lineHeight: 18,
    marginTop: spacing.xs,
  },
  pointsButton: {
    ...shadows.card,
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderColor: 'rgba(230, 203, 159, 0.3)',
    borderRadius: radius.lg,
    borderWidth: 1,
    bottom: 118,
    elevation: 18,
    flexDirection: 'row',
    gap: spacing.md,
    left: spacing.lg,
    minHeight: 70,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    position: 'absolute',
    right: spacing.lg,
    zIndex: 22,
  },
  pointsBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(230, 203, 159, 0.14)',
    borderColor: 'rgba(230, 203, 159, 0.26)',
    borderRadius: radius.md,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 52,
  },
  pointsBadgeText: {
    color: colors.goldLight,
    fontSize: typography.micro,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  pointsCopy: {
    flex: 1,
    gap: 2,
  },
  pointsTitle: {
    color: colors.surface,
    fontSize: typography.body,
    fontWeight: '900',
  },
  pointsMeta: {
    color: 'rgba(255, 250, 243, 0.72)',
    fontSize: typography.small,
    lineHeight: 17,
  },
  pointsAction: {
    color: colors.goldLight,
    fontSize: typography.small,
    fontWeight: '900',
  },
  tabs: {
    ...shadows.card,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radius.lg,
    borderWidth: 1,
    bottom: spacing.lg,
    flexDirection: 'row',
    gap: spacing.sm,
    left: spacing.lg,
    padding: spacing.sm,
    position: 'absolute',
    right: spacing.lg,
  },
  tab: {
    alignItems: 'center',
    borderRadius: radius.md,
    flex: 1,
    gap: 2,
    minHeight: 54,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  tabActive: {
    backgroundColor: colors.ink,
  },
  tabShort: {
    color: colors.muted,
    fontSize: typography.micro,
    fontWeight: '900',
    letterSpacing: 0.9,
  },
  tabShortActive: {
    color: colors.goldLight,
  },
  tabLabel: {
    color: colors.inkSoft,
    fontSize: typography.small,
    fontWeight: '800',
  },
  tabLabelActive: {
    color: colors.surface,
  },
})
