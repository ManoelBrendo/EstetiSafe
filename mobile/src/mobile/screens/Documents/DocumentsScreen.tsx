import { useCallback, useEffect, useMemo, useState } from 'react'
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { documentsApi } from '../../../shared/api/documents'
import { Card } from '../../../shared/components/Card'
import { ConnectionNotice } from '../../../shared/components/ConnectionNotice'
import { EmptyState } from '../../../shared/components/EmptyState'
import { ListSummary } from '../../../shared/components/ListSummary'
import { MetricPill } from '../../../shared/components/MetricPill'
import { SearchField } from '../../../shared/components/SearchField'
import { ScreenHeader } from '../../../shared/components/ScreenHeader'
import { StatusBadge } from '../../../shared/components/StatusBadge'
import { demoDocuments, demoDocumentsSummary } from '../../../shared/data/demoData'
import { colors, radius, spacing, typography } from '../../../shared/theme/theme'
import type { ClinicDocumentSummary, DocumentCategory, DocumentsSummaryResponse, DocumentStatus } from '../../../shared/types/operations'
import { formatDate } from '../../../shared/utils/formatters'

const statusTone: Record<DocumentStatus, 'success' | 'warning' | 'danger' | 'info'> = {
  VALID: 'success',
  EXPIRING: 'warning',
  EXPIRED: 'danger',
  WITHOUT_EXPIRY: 'info',
}

const categoryOptions: Array<{ value: DocumentCategory; label: string }> = [
  { value: 'SANITARY', label: 'Sanitario' },
  { value: 'LEGAL', label: 'Legal' },
  { value: 'CLIENTS', label: 'Clientes' },
  { value: 'WASTE', label: 'Residuos' },
]

const documentFilterOptions: Array<{ value: 'ALL' | 'CRITICAL' | DocumentCategory; label: string }> = [
  { value: 'ALL', label: 'Todos' },
  { value: 'CRITICAL', label: 'Criticos' },
  ...categoryOptions,
]

interface DocumentFormState {
  category: DocumentCategory
  documentType: string
  title: string
  expiresAt: string
  notes: string
}

const emptyDocumentForm: DocumentFormState = {
  category: 'SANITARY' as DocumentCategory,
  documentType: '',
  title: '',
  expiresAt: '',
  notes: '',
}

export function DocumentsScreen() {
  const [documents, setDocuments] = useState<ClinicDocumentSummary[]>(demoDocuments)
  const [summary, setSummary] = useState<DocumentsSummaryResponse>(demoDocumentsSummary)
  const [loading, setLoading] = useState(false)
  const [offline, setOffline] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(emptyDocumentForm)
  const [saving, setSaving] = useState(false)
  const [formMessage, setFormMessage] = useState('')
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'CRITICAL' | DocumentCategory>('ALL')
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [nextSummary, nextDocuments] = await Promise.all([documentsApi.summary(), documentsApi.list()])
      setSummary(nextSummary)
      setDocuments(nextDocuments)
      setOffline(false)
    } catch {
      setSummary(demoDocumentsSummary)
      setDocuments(demoDocuments)
      setOffline(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const criticalCount = useMemo(
    () => documents.filter(document => document.status === 'EXPIRED' || document.status === 'EXPIRING').length,
    [documents]
  )

  const visibleDocuments = useMemo(() => {
    const filteredDocuments =
      activeFilter === 'ALL'
        ? documents
        : activeFilter === 'CRITICAL'
          ? documents.filter(document => document.status === 'EXPIRED' || document.status === 'EXPIRING')
          : documents.filter(document => document.category === activeFilter)

    const query = searchTerm.trim().toLowerCase()
    if (!query) return filteredDocuments

    return filteredDocuments.filter(document =>
      [
        document.title,
        document.category,
        document.categoryLabel,
        document.documentType,
        document.statusLabel,
        document.notes,
        document.fileName,
      ]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(query))
    )
  }, [activeFilter, documents, searchTerm])

  const listCopy = useMemo(() => {
    if (searchTerm.trim()) return 'Resultado refinado pela busca atual.'
    if (activeFilter === 'CRITICAL') return 'Pendencias e vencimentos para revisar primeiro.'
    if (activeFilter !== 'ALL') return 'Documentos filtrados pela categoria selecionada.'
    return 'Lista operacional com documentos principais da clinica.'
  }, [activeFilter, searchTerm])

  function setFormField(field: Exclude<keyof DocumentFormState, 'category'>, value: string) {
    setForm(current => ({ ...current, [field]: value }))
  }

  function resetForm() {
    setForm(emptyDocumentForm)
    setFormMessage('')
    setFormOpen(false)
  }

  async function handleCreateDocument() {
    if (!form.title.trim() || !form.documentType.trim()) {
      setFormMessage('Informe titulo e tipo do documento.')
      return
    }

    setSaving(true)
    setFormMessage('')

    const localDocument: ClinicDocumentSummary = {
      id: `local-doc-${Date.now()}`,
      category: form.category,
      categoryLabel: categoryOptions.find(option => option.value === form.category)?.label || form.category,
      documentType: form.documentType.trim(),
      title: form.title.trim(),
      notes: form.notes.trim(),
      expiresAt: form.expiresAt.trim() || null,
      status: form.expiresAt.trim() ? 'VALID' : 'WITHOUT_EXPIRY',
      statusLabel: form.expiresAt.trim() ? 'Em dia' : 'Sem vencimento',
      updatedAt: new Date().toISOString(),
      fileName: `${form.title.trim().replace(/\s+/g, '-').toLowerCase() || 'documento'}.txt`,
    }

    try {
      if (offline) {
        setDocuments(current => [localDocument, ...current])
        setSummary(current => ({ ...current, total: current.total + 1, valid: current.valid + (localDocument.status === 'VALID' ? 1 : 0) }))
      } else {
        const created = await documentsApi.create({
          category: form.category,
          documentType: form.documentType.trim(),
          title: form.title.trim(),
          expiresAt: form.expiresAt.trim(),
          notes: form.notes.trim(),
          fileName: localDocument.fileName || 'documento.txt',
          fileMimeType: 'text/plain',
          fileDataUrl: `data:text/plain,${encodeURIComponent(`Documento criado pelo app mobile: ${form.title.trim()}`)}`,
        })
        setDocuments(current => [created, ...current])
        await load()
      }
      resetForm()
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : 'Nao foi possivel cadastrar o documento.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        eyebrow="Controle documental"
        title="Documentos"
        copy="Consulta rapida de arquivos, vencimentos e pendencias essenciais da clinica."
      />

      {offline ? (
        <ConnectionNotice copy="Conecte um token mobile para trocar estes dados demo pela API real." />
      ) : null}

      <View style={styles.metrics}>
        <MetricPill label="Score" value={`${summary.complianceScore || 0}%`} />
        <MetricPill label="Em dia" value={summary.valid} />
        <MetricPill label="Criticos" value={criticalCount} />
      </View>

      <SearchField
        accessibilityLabel="Buscar documentos"
        placeholder="Buscar por titulo, tipo ou status"
        value={searchTerm}
        onChangeText={setSearchTerm}
      />

      <View style={styles.filterRow}>
        {documentFilterOptions.map(option => {
          const selected = activeFilter === option.value
          return (
            <TouchableOpacity key={option.value} onPress={() => setActiveFilter(option.value)} style={[styles.filterButton, selected && styles.filterButtonActive]}>
              <Text style={[styles.filterButtonText, selected && styles.filterButtonTextActive]}>{option.label}</Text>
            </TouchableOpacity>
          )
        })}
      </View>

      <TouchableOpacity activeOpacity={0.82} onPress={() => setFormOpen(current => !current)} style={styles.primaryAction}>
        <Text style={styles.primaryActionText}>Cadastrar documento</Text>
        <Text style={styles.primaryActionCopy}>Base pronta para formulario e upload seguro.</Text>
      </TouchableOpacity>

      {formOpen ? (
        <Card>
          <View style={styles.form}>
            <Text style={styles.formTitle}>Novo documento</Text>
            <View style={styles.categoryRow}>
              {categoryOptions.map(option => {
                const selected = form.category === option.value
                return (
                  <TouchableOpacity key={option.value} onPress={() => setForm(current => ({ ...current, category: option.value }))} style={[styles.categoryButton, selected && styles.categoryButtonActive]}>
                    <Text style={[styles.categoryButtonText, selected && styles.categoryButtonTextActive]}>{option.label}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
            <TextInput placeholder="Titulo" placeholderTextColor={colors.muted} style={styles.input} value={form.title} onChangeText={value => setFormField('title', value)} />
            <TextInput placeholder="Tipo de documento" placeholderTextColor={colors.muted} style={styles.input} value={form.documentType} onChangeText={value => setFormField('documentType', value)} />
            <TextInput placeholder="Vencimento AAAA-MM-DD" placeholderTextColor={colors.muted} style={styles.input} value={form.expiresAt} onChangeText={value => setFormField('expiresAt', value)} />
            <TextInput multiline placeholder="Observacoes" placeholderTextColor={colors.muted} style={[styles.input, styles.textarea]} value={form.notes} onChangeText={value => setFormField('notes', value)} />
            {formMessage ? <Text style={styles.formMessage}>{formMessage}</Text> : null}
            <View style={styles.formActions}>
              <TouchableOpacity activeOpacity={0.82} onPress={resetForm} style={styles.cancelButton}>
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.82} disabled={saving} onPress={handleCreateDocument} style={styles.saveButton}>
                <Text style={styles.saveButtonText}>{saving ? 'Salvando...' : 'Salvar'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Card>
      ) : null}

      <TouchableOpacity activeOpacity={0.82} onPress={load} style={styles.secondaryAction}>
        <Text style={styles.secondaryActionText}>{loading ? 'Atualizando...' : 'Atualizar documentos'}</Text>
      </TouchableOpacity>

      <ListSummary label="Documentos visiveis" value={visibleDocuments.length} copy={listCopy} />

      <View style={styles.list}>
        {visibleDocuments.length ? (
          visibleDocuments.map(document => {
            const selected = selectedDocumentId === String(document.id)
            return (
              <TouchableOpacity key={String(document.id)} activeOpacity={0.86} onPress={() => setSelectedDocumentId(selected ? null : String(document.id))}>
                <Card tone={document.status === 'EXPIRED' ? 'alert' : 'default'}>
                  <View style={styles.cardHead}>
                    <View style={styles.cardTitleBlock}>
                      <Text style={styles.itemEyebrow}>{document.categoryLabel || document.category}</Text>
                      <Text style={styles.itemTitle}>{document.title}</Text>
                    </View>
                    <StatusBadge label={document.statusLabel || document.status} tone={statusTone[document.status]} />
                  </View>
                  <View style={styles.metaRow}>
                    <Text style={styles.metaText}>{document.documentType || 'Documento'}</Text>
                    <Text style={styles.metaText}>Vencimento: {formatDate(document.expiresAt)}</Text>
                  </View>
                  {selected ? (
                    <View style={styles.detailBox}>
                      <Text style={styles.detailLabel}>Detalhes</Text>
                      <Text style={styles.detailText}>Arquivo: {document.fileName || 'Ainda nao anexado'}</Text>
                      <Text style={styles.detailText}>Atualizacao: {formatDate(document.updatedAt)}</Text>
                      <Text style={styles.detailText}>{document.notes || 'Sem observacoes registradas.'}</Text>
                    </View>
                  ) : null}
                </Card>
              </TouchableOpacity>
            )
          })
        ) : (
          <EmptyState title="Nenhum documento" copy="Ajuste os filtros ou cadastre um documento para esta categoria." />
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
  primaryAction: {
    backgroundColor: colors.ink,
    borderRadius: radius.md,
    gap: spacing.xs,
    padding: spacing.lg,
  },
  primaryActionText: {
    color: colors.surface,
    fontSize: typography.body,
    fontWeight: '900',
  },
  primaryActionCopy: {
    color: 'rgba(255, 250, 243, 0.72)',
    fontSize: typography.small,
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
  list: {
    gap: spacing.md,
  },
  form: {
    gap: spacing.md,
  },
  formTitle: {
    color: colors.ink,
    fontSize: typography.section,
    fontWeight: '900',
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  categoryButton: {
    borderColor: colors.line,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  categoryButtonActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  categoryButtonText: {
    color: colors.ink,
    fontSize: typography.small,
    fontWeight: '900',
  },
  categoryButtonTextActive: {
    color: colors.surface,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderColor: colors.line,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.ink,
    fontSize: typography.body,
    minHeight: 46,
    paddingHorizontal: spacing.md,
  },
  textarea: {
    minHeight: 90,
    paddingTop: spacing.md,
    textAlignVertical: 'top',
  },
  formMessage: {
    color: colors.danger,
    fontSize: typography.small,
    fontWeight: '800',
  },
  formActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  cancelButton: {
    alignItems: 'center',
    borderColor: colors.line,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    padding: spacing.md,
  },
  cancelButtonText: {
    color: colors.ink,
    fontSize: typography.body,
    fontWeight: '900',
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderRadius: radius.md,
    flex: 1,
    padding: spacing.md,
  },
  saveButtonText: {
    color: colors.surface,
    fontSize: typography.body,
    fontWeight: '900',
  },
  cardHead: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  cardTitleBlock: {
    flex: 1,
    gap: spacing.xs,
  },
  itemEyebrow: {
    color: colors.goldDeep,
    fontSize: typography.micro,
    fontWeight: '900',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  itemTitle: {
    color: colors.ink,
    fontSize: typography.section,
    fontWeight: '900',
  },
  metaRow: {
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  metaText: {
    color: colors.muted,
    fontSize: typography.small,
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
