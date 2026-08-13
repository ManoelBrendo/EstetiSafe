import { useCallback, useEffect, useMemo, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { auditApi } from '../../../shared/api/audit'
import { Card } from '../../../shared/components/Card'
import { EmptyState } from '../../../shared/components/EmptyState'
import { ListSummary } from '../../../shared/components/ListSummary'
import { MetricPill } from '../../../shared/components/MetricPill'
import { SearchField } from '../../../shared/components/SearchField'
import { ScreenHeader } from '../../../shared/components/ScreenHeader'
import { StatusBadge } from '../../../shared/components/StatusBadge'
import { demoAuditLogs, demoDocumentsSummary, demoProfessionals } from '../../../shared/data/demoData'
import { colors, radius, spacing, typography } from '../../../shared/theme/theme'
import type { AuditLogItem } from '../../../shared/types/operations'
import { formatDate } from '../../../shared/utils/formatters'

type AuditFilter = 'ALL' | NonNullable<AuditLogItem['severity']>

const auditFilterOptions: Array<{ value: AuditFilter; label: string }> = [
  { value: 'ALL', label: 'Todos' },
  { value: 'HIGH', label: 'Sensiveis' },
  { value: 'MEDIUM', label: 'Atencao' },
  { value: 'LOW', label: 'Rotina' },
]

function getSeverityTone(severity?: AuditLogItem['severity']) {
  if (severity === 'HIGH') return 'danger'
  if (severity === 'MEDIUM') return 'warning'
  return 'success'
}

function getSeverityLabel(severity?: AuditLogItem['severity']) {
  if (severity === 'HIGH') return 'Sensivel'
  if (severity === 'MEDIUM') return 'Atencao'
  return 'Rotina'
}

export function AuditScreen() {
  const [logs, setLogs] = useState<AuditLogItem[]>(demoAuditLogs)
  const [loading, setLoading] = useState(false)
  const [offline, setOffline] = useState(true)
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<AuditFilter>('ALL')
  const [searchTerm, setSearchTerm] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const nextLogs = await auditApi.list()
      setLogs(nextLogs)
      setOffline(false)
    } catch {
      setLogs(demoAuditLogs)
      setOffline(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const highRiskCount = useMemo(() => logs.filter(log => log.severity === 'HIGH').length, [logs])

  const visibleLogs = useMemo(() => {
    const filteredLogs = activeFilter === 'ALL' ? logs : logs.filter(log => log.severity === activeFilter)
    const query = searchTerm.trim().toLowerCase()
    if (!query) return filteredLogs

    return filteredLogs.filter(log =>
      [log.action, log.category, log.description, log.entityType, log.entityId, log.severity]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(query))
    )
  }, [activeFilter, logs, searchTerm])

  const listCopy = useMemo(() => {
    if (searchTerm.trim()) return 'Eventos refinados pela busca atual.'
    if (activeFilter === 'HIGH') return 'Ocorrencias sensiveis para revisar antes da rotina.'
    if (activeFilter === 'MEDIUM') return 'Alertas intermediarios que merecem acompanhamento.'
    if (activeFilter === 'LOW') return 'Registros de rotina para rastreabilidade.'
    return 'Leitura geral dos eventos auditaveis recentes.'
  }, [activeFilter, searchTerm])

  return (
    <View style={styles.screen}>
      <ScreenHeader
        eyebrow="Conformidade"
        title="Auditoria"
        copy="Leitura limpa dos eventos, documentos criticos e sinais de conformidade operacional."
      />

      <View style={styles.metrics}>
        <MetricPill label="Eventos" value={logs.length} />
        <MetricPill label="Risco alto" value={highRiskCount} />
        <MetricPill label="Score docs" value={`${demoDocumentsSummary.complianceScore}%`} />
      </View>

      <Card tone={highRiskCount ? 'alert' : 'warm'}>
        <View style={styles.controlHead}>
          <View>
            <Text style={styles.controlEyebrow}>Estado atual</Text>
            <Text style={styles.controlTitle}>{highRiskCount ? 'Revisao recomendada' : 'Operacao acompanhada'}</Text>
          </View>
          <StatusBadge label={offline ? 'Demo' : 'API'} tone={offline ? 'warning' : 'success'} />
        </View>
        <Text style={styles.controlCopy}>
          {highRiskCount
            ? 'Priorize vencimentos, arquivos ausentes e eventos sensiveis.'
            : 'Sem sinal critico nesta leitura compacta.'}
        </Text>
      </Card>

      <SearchField
        accessibilityLabel="Buscar auditoria"
        placeholder="Buscar evento, categoria ou entidade"
        value={searchTerm}
        onChangeText={setSearchTerm}
      />

      <View style={styles.filterRow}>
        {auditFilterOptions.map(option => {
          const selected = activeFilter === option.value
          return (
            <TouchableOpacity key={option.value} onPress={() => setActiveFilter(option.value)} style={[styles.filterButton, selected && styles.filterButtonActive]}>
              <Text style={[styles.filterButtonText, selected && styles.filterButtonTextActive]}>{option.label}</Text>
            </TouchableOpacity>
          )
        })}
      </View>

      <TouchableOpacity activeOpacity={0.82} onPress={load} style={styles.secondaryAction}>
        <Text style={styles.secondaryActionText}>{loading ? 'Atualizando...' : 'Atualizar auditoria'}</Text>
      </TouchableOpacity>

      <View style={styles.grid}>
        <Card>
          <Text style={styles.panelNumber}>{demoProfessionals.length}</Text>
          <Text style={styles.panelLabel}>Profissionais monitorados</Text>
        </Card>
        <Card>
          <Text style={styles.panelNumber}>{demoDocumentsSummary.missingCount || 0}</Text>
          <Text style={styles.panelLabel}>Pendencias documentais</Text>
        </Card>
      </View>

      <ListSummary label="Eventos visiveis" value={visibleLogs.length} copy={listCopy} />

      <View style={styles.list}>
        {visibleLogs.length ? (
          visibleLogs.map(log => {
            const selected = selectedLogId === String(log.id)
            return (
              <TouchableOpacity key={String(log.id)} activeOpacity={0.86} onPress={() => setSelectedLogId(selected ? null : String(log.id))}>
                <Card tone={log.severity === 'HIGH' ? 'alert' : 'default'}>
                  <View style={styles.logHead}>
                    <View style={styles.logTitleBlock}>
                      <Text style={styles.logAction}>{log.action.replace(/_/g, ' ')}</Text>
                      <Text style={styles.logDate}>{formatDate(log.createdAt)}</Text>
                    </View>
                    <StatusBadge label={getSeverityLabel(log.severity)} tone={getSeverityTone(log.severity)} />
                  </View>
                  <Text style={styles.logCopy}>{log.description || 'Evento registrado para rastreabilidade.'}</Text>
                  {selected ? (
                    <View style={styles.detailBox}>
                      <Text style={styles.detailLabel}>Contexto auditavel</Text>
                      <Text style={styles.detailText}>Categoria: {log.category || 'Geral'}</Text>
                      <Text style={styles.detailText}>Entidade: {log.entityType || 'Nao informada'}</Text>
                      <Text style={styles.detailText}>Referencia: {log.entityId || 'Sem ID vinculado'}</Text>
                    </View>
                  ) : null}
                </Card>
              </TouchableOpacity>
            )
          })
        ) : (
          <EmptyState title="Nenhum evento" copy="Ajuste a busca ou o filtro para ver outros registros auditaveis." />
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    gap: spacing.lg,
  },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  controlHead: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  controlEyebrow: {
    color: colors.goldDeep,
    fontSize: typography.micro,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  controlTitle: {
    color: colors.ink,
    fontSize: typography.section,
    fontWeight: '900',
    marginTop: spacing.xs,
  },
  controlCopy: {
    color: colors.muted,
    fontSize: typography.small,
    lineHeight: 18,
    marginTop: spacing.md,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  filterButton: {
    backgroundColor: 'rgba(255,255,255,0.56)',
    borderColor: colors.line,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  filterButtonActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  filterButtonText: {
    color: colors.ink,
    fontSize: typography.small,
    fontWeight: '900',
  },
  filterButtonTextActive: {
    color: colors.surface,
  },
  secondaryAction: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
  },
  secondaryActionText: {
    color: colors.ink,
    fontSize: typography.body,
    fontWeight: '900',
  },
  grid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  panelNumber: {
    color: colors.ink,
    fontSize: 28,
    fontWeight: '900',
  },
  panelLabel: {
    color: colors.muted,
    fontSize: typography.small,
    lineHeight: 18,
    marginTop: spacing.xs,
  },
  list: {
    gap: spacing.md,
  },
  logHead: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  logTitleBlock: {
    flex: 1,
  },
  logAction: {
    color: colors.ink,
    fontSize: typography.body,
    fontWeight: '900',
    textTransform: 'capitalize',
  },
  logDate: {
    color: colors.muted,
    fontSize: typography.small,
    marginTop: spacing.xs,
  },
  logCopy: {
    color: colors.inkSoft,
    fontSize: typography.small,
    lineHeight: 18,
    marginTop: spacing.md,
  },
  detailBox: {
    backgroundColor: 'rgba(255,255,255,0.64)',
    borderColor: colors.line,
    borderRadius: radius.sm,
    borderWidth: 1,
    gap: spacing.xs,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  detailLabel: {
    color: colors.goldDeep,
    fontSize: typography.micro,
    fontWeight: '900',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  detailText: {
    color: colors.inkSoft,
    fontSize: typography.small,
    lineHeight: 18,
  },
})
