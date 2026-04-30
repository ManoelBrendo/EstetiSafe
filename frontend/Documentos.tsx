import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import api, { getApiErrorMessage } from './api'
import { Icon } from './Icon'
import { useAuth } from './useAuth'
import { getClinicBranding } from './branding'
import type { Identifier } from './clinicalTypes'
import type {
  ClinicDocumentFileResponse,
  ClinicDocumentSummary,
  DocumentCategory,
  DocumentCategoryCoverageItem,
  DocumentCategoryOption,
  DocumentsSummaryResponse,
  DocumentStatus,
} from './operationsTypes'

interface DocumentFormState {
  category: DocumentCategory
  documentType: string
  title: string
  expiresAt: string
  notes: string
  fileName: string
  fileMimeType: string
  fileDataUrl: string
}

interface DocumentsOverviewMetricProps {
  label: string
  value: string
  helper: string
  tone?: string
}

interface DocumentCardProps {
  document: ClinicDocumentSummary
  onDownload: (documentId: Identifier) => void | Promise<void>
  onEdit: (document: ClinicDocumentSummary) => void
  onDelete: (documentId: Identifier) => void | Promise<void>
  loadingFileId: Identifier | null
}

interface DocumentsCategoryCardProps {
  item: DocumentCategoryCoverageItem
  onSelectCategory: (category: DocumentCategory) => void
  onCreateMissing: (category: DocumentCategory, requirement?: string) => void
}

type DocumentModalMode = 'create' | 'edit' | null
type DocumentCategoryFilter = 'ALL' | DocumentCategory
type DocumentRiskFilter = 'ALL' | 'CRITICAL' | DocumentStatus

const MAX_DOCUMENT_FILE_SIZE_BYTES = 8 * 1024 * 1024

const categoryOptions: DocumentCategoryOption[] = [
  { value: 'LEGAL', label: 'Legal' },
  { value: 'SANITARY', label: 'Sanitário' },
  { value: 'CLIENTS', label: 'Clientes' },
  { value: 'WASTE', label: 'Resíduos' },
]

const categoryTypeSuggestions: Record<DocumentCategory, string[]> = {
  LEGAL: ['Alvará sanitário', 'Alvará de funcionamento', 'CNPJ', 'Contrato social'],
  SANITARY: ['Responsável técnico', 'Manual de biossegurança', 'Licença da VISA', 'Treinamento interno'],
  CLIENTS: ['Termo de consentimento padrão', 'Política de privacidade', 'Modelo de anamnese'],
  WASTE: ['PGRSS', 'Contrato da coletora', 'Comprovante de coleta', 'Manifesto de resíduos'],
}

const statusMeta: Record<DocumentStatus, { label: string; className: string; tone: string }> = {
  VALID: { label: 'Em dia', className: 'badge badge-green', tone: 'is-valid' },
  EXPIRING: { label: 'Vencendo', className: 'badge badge-gold', tone: 'is-expiring' },
  EXPIRED: { label: 'Vencido', className: 'badge badge-red', tone: 'is-expired' },
  WITHOUT_EXPIRY: { label: 'Sem vencimento', className: 'badge badge-blue', tone: 'is-without-expiry' },
}

const emptyForm: DocumentFormState = {
  category: 'SANITARY',
  documentType: '',
  title: '',
  expiresAt: '',
  notes: '',
  fileName: '',
  fileMimeType: '',
  fileDataUrl: '',
}

function formatDate(value: string | number | null | undefined) {
  if (!value) return 'Sem vencimento'

  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.getTime())) return 'Data inválida'

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
  }).format(parsedDate)
}

function formatDateTime(value: string | number | null | undefined) {
  if (!value) return 'Agora'

  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.getTime())) return 'Data inválida'

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(parsedDate)
}

function pluralize(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`
}

function normalizeSearchText(value: string | null | undefined) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Não foi possível preparar o arquivo'))
    reader.readAsDataURL(file)
  })
}

function triggerDownload(fileName: string, dataUrl: string) {
  const anchor = document.createElement('a')
  anchor.href = dataUrl
  anchor.download = fileName
  anchor.target = '_blank'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

function DocumentsOverviewMetric({ label, value, helper, tone = 'default' }: DocumentsOverviewMetricProps) {
  return (
    <article className={`documents-overview-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{helper}</small>
    </article>
  )
}

function getDocumentsStateSummary(summary: DocumentsSummaryResponse | null | undefined) {
  const expired = Number(summary?.expired || 0)
  const expiring = Number(summary?.expiring || 0)
  const critical = expired + expiring
  const missing = Number(summary?.missingCount || 0)

  if (critical > 0 || missing > 0) {
    return {
      tone: 'critical',
      title: 'Regularização documental pedindo atenção',
      description: `${critical} documento(s) estão vencidos ou próximos do vencimento e ${missing} item(ns) recomendados ainda não foram anexados. Priorize pendências críticas para manter a clínica pronta para fiscalização.`,
      badge: critical > 0 ? `${critical} crítico(s)` : `${missing} faltante(s)`,
      badgeClass: critical > 0 ? 'badge badge-gold' : 'badge badge-muted',
    }
  }

  return {
    tone: 'safe',
    title: 'Acervo regulatório sob controle',
    description: 'Os anexos cadastrados estão organizados, sem pendências urgentes e com boa cobertura dos documentos recomendados para rotina regulatória.',
    badge: 'Sem pendências urgentes',
    badgeClass: 'badge badge-green',
  }
}

function getDocumentUrgencyCopy(document: ClinicDocumentSummary) {
  if (document.status === 'EXPIRED') {
    const overdueDays = Math.abs(Number(document.daysUntilExpiry || 0))
    return `Vencido há ${overdueDays} dia(s)`
  }

  if (document.status === 'EXPIRING') {
    return document.statusLabel
  }

  if (document.status === 'WITHOUT_EXPIRY') {
    return 'Sem vencimento definido'
  }

  if (typeof document.daysUntilExpiry === 'number') {
    return `Em dia por mais ${document.daysUntilExpiry} dia(s)`
  }

  return 'Documento regular'
}

function DocumentCard({ document, onDownload, onEdit, onDelete, loadingFileId }: DocumentCardProps) {
  const meta = statusMeta[document.status] || statusMeta.VALID
  const category = categoryOptions.find(option => option.value === document.category)?.label || document.category
  const statusLabel = document.status === 'EXPIRING' ? document.statusLabel : meta.label

  return (
    <article className={`document-list-item ${meta.tone}`}>
      <div className="document-list-main">
        <div className="document-list-head">
          <div className="document-card-copy">
            <span className="document-card-category">{category}</span>
            <h3 className="document-card-title">{document.title}</h3>
            <p className="document-card-subtitle">{document.documentType}</p>
          </div>

          <div className="document-list-status">
            <span className={meta.className}>{statusLabel}</span>
            <small>{getDocumentUrgencyCopy(document)}</small>
          </div>
        </div>

        <div className="document-list-grid">
          <div className="document-list-metric">
            <span>Vencimento</span>
            <strong>{formatDate(document.expiresAt)}</strong>
          </div>
          <div className="document-list-metric">
            <span>Arquivo</span>
            <strong>{document.fileName}</strong>
          </div>
          <div className="document-list-metric">
            <span>Atualizado</span>
            <strong>{formatDateTime(document.updatedAt)}</strong>
          </div>
        </div>

        {document.notes ? (
          <div className="document-card-note">
            <strong>Observações</strong>
            <p>{document.notes}</p>
          </div>
        ) : null}
      </div>

      <div className="document-list-actions">
        <button type="button" className="btn btn-outline btn-sm" onClick={() => onDownload(document.id)} disabled={loadingFileId === document.id}>
          {loadingFileId === document.id ? <span className="spinner" /> : <><Icon name="download" /> Abrir anexo</>}
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => onEdit(document)}>
          <Icon name="edit" /> Editar
        </button>
        <button type="button" className="btn btn-ghost btn-sm danger-ghost" onClick={() => onDelete(document.id)}>
          <Icon name="trash" /> Remover
        </button>
      </div>
    </article>
  )
}

function DocumentsCategoryCard({ item, onSelectCategory, onCreateMissing }: DocumentsCategoryCardProps) {
  const completion = item.requiredCount ? Math.round((item.fulfilledCount / item.requiredCount) * 100) : 100
  const categoryStatusLabel = item.criticalCount
    ? pluralize(item.criticalCount, 'ponto de atenção', 'pontos de atenção')
    : 'Completo'
  const categoryStatusClass = item.criticalCount ? 'badge badge-gold' : 'badge badge-green'

  return (
    <article className="documents-category-card">
      <div className="documents-category-head">
        <div>
          <span className="documents-category-label">{item.categoryLabel}</span>
          <h3>{item.fulfilledCount}/{item.requiredCount} obrigatórios cobertos</h3>
        </div>
        <span className={categoryStatusClass}>{categoryStatusLabel}</span>
      </div>

      <div className="documents-progress-rail" aria-hidden="true">
        <span style={{ width: `${completion}%` }} />
      </div>

      <div className="documents-category-stats">
        <span>{pluralize(item.total, 'anexo na base', 'anexos na base')}</span>
        <span>{item.criticalCount ? pluralize(item.criticalCount, 'ponto de aten??o', 'pontos de aten??o') : 'Sem pontos de aten??o'}</span>
      </div>

      {item.missing?.length ? (
        <div className="documents-category-missing">
          <strong>Faltando nesta categoria</strong>
          <ul>
            {item.missing.slice(0, 3).map(entry => (
              <li key={entry}>{entry}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="documents-category-missing is-complete">
          <strong>Cobertura base completa</strong>
          <p>Os itens sugeridos desta categoria já estão representados no acervo.</p>
        </div>
      )}

      <div className="documents-category-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onSelectCategory(item.category)}>
          Ver categoria
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() => onCreateMissing(item.category, item.missing?.[0] || '')}
          disabled={!item.missing?.length}
        >
          Adicionar faltante
        </button>
      </div>
    </article>
  )
}

export default function Documentos() {
  const { user } = useAuth()
  const documentsListRef = useRef<HTMLElement | null>(null)
  const missingListRef = useRef<HTMLElement | null>(null)
  const [documents, setDocuments] = useState<ClinicDocumentSummary[]>([])
  const [summary, setSummary] = useState<DocumentsSummaryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<DocumentModalMode>(null)
  const [selected, setSelected] = useState<ClinicDocumentSummary | null>(null)
  const [form, setForm] = useState<DocumentFormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [loadingFileId, setLoadingFileId] = useState<Identifier | null>(null)
  const [filter, setFilter] = useState<DocumentCategoryFilter>('ALL')
  const [riskFilter, setRiskFilter] = useState<DocumentRiskFilter>('ALL')
  const [search, setSearch] = useState('')
  const { clinicName, brandLogo } = getClinicBranding(user)
  const hasActiveFilters = filter !== 'ALL' || riskFilter !== 'ALL' || Boolean(search.trim())
  const formCanSave = Boolean(form.title.trim() && form.documentType.trim() && (modal !== 'create' || form.fileDataUrl))

  const load = useCallback(async () => {
    setLoading(true)

    try {
      const category = filter === 'ALL' ? undefined : filter
      const [{ data: list }, { data: summaryData }] = await Promise.all([
        api.get<ClinicDocumentSummary[]>('/documents', {
          params: { category },
        }),
        api.get<DocumentsSummaryResponse>('/documents/summary'),
      ])

      setDocuments(list)
      setSummary(summaryData)
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Não foi possível carregar os documentos'))
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    load()
  }, [load])

  const currentSuggestions = useMemo(
    () => categoryTypeSuggestions[form.category] || [],
    [form.category]
  )

  const filteredDocuments = useMemo(() => {
    const query = normalizeSearchText(search)
    return documents.filter(document => {
      const searchable = normalizeSearchText(`${document.title} ${document.documentType} ${document.fileName}`)
      const matchesQuery = !query || searchable.includes(query)

      const matchesRisk = (
        riskFilter === 'ALL'
        || (riskFilter === 'CRITICAL' && (document.status === 'EXPIRING' || document.status === 'EXPIRED'))
        || document.status === riskFilter
      )

      return matchesQuery && matchesRisk
    })
  }, [documents, riskFilter, search])

  const documentsStateSummary = useMemo(
    () => getDocumentsStateSummary(summary),
    [summary]
  )

  const nextDocumentAction = useMemo(() => {
    const missing = summary?.missingCount ?? 0
    const critical = (summary?.expiring ?? 0) + (summary?.expired ?? 0)
    const next30Days = summary?.windows?.next30Days ?? 0

    if (critical > 0) {
      return {
        title: 'Atualizar documentos críticos',
        description: `${pluralize(critical, 'documento está vencido ou próximo do vencimento', 'documentos estão vencidos ou próximos do vencimento')}. Priorize a substituição dos anexos para manter a rotina segura.`,
        primary: pluralize(critical, 'crítico', 'críticos'),
        secondary: pluralize(next30Days, 'vence em até 30 dias', 'vencem em até 30 dias'),
        tone: 'warning',
      }
    }

    if (missing > 0) {
      return {
        title: 'Completar acervo recomendado',
        description: `${pluralize(missing, 'documento recomendado ainda não foi anexado', 'documentos recomendados ainda não foram anexados')}. Use esta área para anexar ou substituir arquivos.`,
        primary: pluralize(missing, 'faltante', 'faltantes'),
        secondary: `${summary?.recommendedCoveredCount ?? 0}/${summary?.recommendedRequiredCount ?? 0} itens cobertos`,
        tone: 'neutral',
      }
    }

    return {
      title: 'Acervo operacional em dia',
      description: 'Os principais documentos recomendados já estão representados. Continue usando esta tela para anexar, abrir e substituir arquivos.',
      primary: 'Sem urgências',
      secondary: pluralize(summary?.total ?? 0, 'documento cadastrado', 'documentos cadastrados'),
      tone: 'safe',
    }
  }, [summary])

  function openCreate() {
    setSelected(null)
    setForm(emptyForm)
    setModal('create')
  }

  function openRecommendedCreate(category: DocumentCategory, requirement = '') {
    setSelected(null)
    setForm({
      ...emptyForm,
      category: category || emptyForm.category,
      documentType: requirement,
      title: requirement,
    })
    setModal('create')
  }

  function scrollToDocumentsList() {
    documentsListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function scrollToMissingList() {
    missingListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function handleCategoryFilter(category: DocumentCategory) {
    setFilter(category)
    scrollToDocumentsList()
  }

  function resetFilters() {
    setFilter('ALL')
    setRiskFilter('ALL')
    setSearch('')
  }

  function openEdit(document: ClinicDocumentSummary) {
    setSelected(document)
    setForm({
      category: document.category,
      documentType: document.documentType,
      title: document.title,
      expiresAt: document.expiresAt ? String(document.expiresAt).slice(0, 10) : '',
      notes: document.notes || '',
      fileName: '',
      fileMimeType: '',
      fileDataUrl: '',
    })
    setModal('edit')
  }

  function setField(key: keyof DocumentFormState) {
    return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setForm(current => ({ ...current, [key]: event.target.value }))
    }
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) return

    if (file.size > MAX_DOCUMENT_FILE_SIZE_BYTES) {
      toast.error('Arquivo muito grande. Use anexos de até 8 MB para manter a tela rápida no navegador.')
      return
    }

    setUploading(true)

    try {
      const fileDataUrl = await readFileAsDataUrl(file)
      setForm(current => ({
        ...current,
        fileName: file.name,
        fileMimeType: file.type || 'application/octet-stream',
        fileDataUrl,
      }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível anexar o arquivo')
    } finally {
      setUploading(false)
    }
  }

  async function handleSave() {
    const normalizedTitle = form.title.trim()
    const normalizedType = form.documentType.trim()
    const normalizedNotes = form.notes.trim()

    if (!normalizedTitle || !normalizedType) {
      toast.error('Título e tipo do documento são obrigatórios')
      return
    }

    if (modal === 'create' && !form.fileDataUrl) {
      toast.error('Anexe o arquivo do documento antes de salvar')
      return
    }

    setSaving(true)

    try {
      const payload = {
        category: form.category,
        documentType: normalizedType,
        title: normalizedTitle,
        expiresAt: form.expiresAt || undefined,
        notes: normalizedNotes,
        ...(form.fileDataUrl ? {
          fileName: form.fileName,
          fileMimeType: form.fileMimeType,
          fileDataUrl: form.fileDataUrl,
        } : {}),
      }

      if (modal === 'create') {
        await api.post('/documents', payload)
        toast.success('Documento anexado com sucesso')
      } else {
        if (!selected?.id) {
          toast.error('Selecione um documento válido para continuar')
          return
        }

        await api.put(`/documents/${selected.id}`, payload)
        toast.success('Documento atualizado com sucesso')
      }

      setModal(null)
      await load()
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Não foi possível salvar este documento'))
    } finally {
      setSaving(false)
    }
  }

  async function handleDownload(documentId: Identifier) {
    setLoadingFileId(documentId)

    try {
      const { data } = await api.get<ClinicDocumentFileResponse>(`/documents/${documentId}`)
      triggerDownload(data.fileName, data.fileDataUrl)
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Não foi possível abrir este documento'))
    } finally {
      setLoadingFileId(null)
    }
  }

  async function handleDelete(documentId: Identifier) {
    if (!window.confirm('Deseja remover este documento da base da clínica?')) return

    try {
      await api.delete(`/documents/${documentId}`)
      toast.success('Documento removido')
      await load()
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Não foi possível remover este documento'))
    }
  }

  return (
    <div className="page documents-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Documentos</h1>
          <p className="page-subtitle">
            Centralize anexos exigidos pela rotina sanitária e acompanhe os vencimentos sem perder prazo.
          </p>
        </div>

        <div className="page-actions">
          <Link className="btn btn-outline" to="/auditoria">
            <Icon name="shield" /> Ver auditoria
          </Link>
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            <Icon name="plus" /> Novo documento
          </button>
        </div>
      </div>

      <section className="documents-hero-grid">
        <article className="card brand-plaque documents-hero-card">
          <div className="brand-plaque-logo">
            <img src={brandLogo} alt={`Logo de ${clinicName}`} />
          </div>
          <div className="documents-hero-copy">
            <span className="eyebrow">Central regulatória da clínica</span>
            <h2 className="section-title">{clinicName}</h2>
            <p className="section-copy">
              Estruture alvarás, licenças, resíduos, documentos internos e anexos críticos em uma única operação documental pensada para navegador e rotina administrativa.
            </p>
            <div className="documents-hero-meta">
              <span className="badge badge-muted">{summary?.recommendedCoveredCount ?? 0}/{summary?.recommendedRequiredCount ?? 0} itens base cobertos</span>
              <span className="badge badge-muted">{summary?.windows?.next30Days ?? 0} vencendo em até 30 dias</span>
              <span className="badge badge-muted">Última atualização {formatDateTime(summary?.lastUpdatedAt)}</span>
            </div>
          </div>
        </article>

        <aside className={`card documents-action-card ${nextDocumentAction.tone}`}>
          <span className="eyebrow">Próxima ação documental</span>
          <div className="documents-action-icon"><Icon name="clipboard" size={22} /></div>
          <h2>{nextDocumentAction.title}</h2>
          <p className="section-copy">{nextDocumentAction.description}</p>
          <div className="documents-action-meta">
            <div>
              <span>Prioridade</span>
              <strong>{nextDocumentAction.primary}</strong>
            </div>
            <div>
              <span>Contexto</span>
              <strong>{nextDocumentAction.secondary}</strong>
            </div>
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={nextDocumentAction.tone === 'neutral' ? scrollToMissingList : scrollToDocumentsList}>
            {nextDocumentAction.tone === 'safe' ? 'Ver acervo' : 'Resolver agora'}
          </button>
        </aside>
      </section>

      <section className="documents-overview-strip" aria-label="Resumo documental">
        <DocumentsOverviewMetric
          label="Documentos"
          value={String(summary?.total ?? 0)}
          helper="Base regulatória da clínica organizada em um único lugar."
          tone="gold"
        />
        <DocumentsOverviewMetric
          label="Em dia"
          value={String(summary?.valid ?? 0)}
          helper="Anexos válidos ou sem vencimento cadastrado."
          tone="green"
        />
        <DocumentsOverviewMetric
          label="Críticos"
          value={String((summary?.expiring ?? 0) + (summary?.expired ?? 0))}
          helper="Itens vencendo ou vencidos exigindo ação imediata."
          tone="rose"
        />
        <DocumentsOverviewMetric
          label="Faltando"
          value={String(summary?.missingCount ?? 0)}
          helper="Itens recomendados que ainda não aparecem no acervo."
          tone="default"
        />
      </section>

      <section className={`documents-state-banner ${documentsStateSummary.tone}`}>
        <div className="documents-state-banner-copy">
          <span className="eyebrow">Panorama regulatório</span>
          <h2 className="section-title">{documentsStateSummary.title}</h2>
          <p className="section-copy">{documentsStateSummary.description}</p>
          <div className="documents-state-banner-actions">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => { setRiskFilter('CRITICAL'); scrollToDocumentsList() }}>
              Ver críticos
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={scrollToMissingList}>
              Ver faltantes
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={openCreate}>
              Novo documento
            </button>
          </div>
        </div>

        <div className="documents-state-badges">
          <span className={documentsStateSummary.badgeClass}>{documentsStateSummary.badge}</span>
          <span className="badge badge-muted">{summary?.windows?.next7Days ?? 0} em até 7 dias</span>
          <span className="badge badge-muted">{summary?.windows?.next15Days ?? 0} em até 15 dias</span>
          <span className="badge badge-muted">{filteredDocuments.length} visíveis</span>
        </div>
      </section>

      <section className="documents-category-grid" aria-label="Cobertura por categoria">
        {(summary?.categories || []).map(item => (
          <DocumentsCategoryCard
            key={item.category}
            item={item}
            onSelectCategory={handleCategoryFilter}
            onCreateMissing={openRecommendedCreate}
          />
        ))}
      </section>

      <div className="documents-layout">
        <section className="card section-card documents-main-card" ref={documentsListRef}>
          <div className="documents-main-head">
            <div className="section-head documents-section-head">
              <div>
                <h2 className="section-title">Acervo documental</h2>
                <p className="section-copy">Anexe alvarás, contratos, responsável técnico, resíduos e documentos internos com leitura mais rápida para operação web.</p>
              </div>
            </div>

            <div className="documents-controls-card">
              <div className="documents-filter-row">
                <button type="button" className={`pill-btn ${filter === 'ALL' ? 'active' : ''}`} onClick={() => setFilter('ALL')}>
                  Todos
                </button>
                {categoryOptions.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    className={`pill-btn ${filter === option.value ? 'active' : ''}`}
                    onClick={() => setFilter(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="documents-risk-row">
                <button type="button" className={`pill-btn ${riskFilter === 'ALL' ? 'active' : ''}`} onClick={() => setRiskFilter('ALL')}>
                  Todos os estados
                </button>
                <button type="button" className={`pill-btn ${riskFilter === 'CRITICAL' ? 'active' : ''}`} onClick={() => setRiskFilter('CRITICAL')}>
                  Críticos
                </button>
                <button type="button" className={`pill-btn ${riskFilter === 'VALID' ? 'active' : ''}`} onClick={() => setRiskFilter('VALID')}>
                  Em dia
                </button>
                <button type="button" className={`pill-btn ${riskFilter === 'WITHOUT_EXPIRY' ? 'active' : ''}`} onClick={() => setRiskFilter('WITHOUT_EXPIRY')}>
                  Sem vencimento
                </button>
              </div>

              <div className="card card-sm toolbar-card documents-toolbar-card">
                <div className="search-bar">
                  <Icon name="search" />
                  <input
                    type="search"
                    placeholder="Buscar por título, tipo ou nome do arquivo..."
                    value={search}
                    onChange={event => setSearch(event.target.value)}
                  />
                </div>

                <div className="toolbar-meta">
                  <span className="badge badge-muted">{filteredDocuments.length} documentos visíveis</span>
                  {hasActiveFilters ? (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={resetFilters}>
                      Limpar filtros
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="filters-status-row" aria-live="polite">
                <span className="text-muted">
                  {hasActiveFilters
                    ? `${filteredDocuments.length} documento(s) correspondem aos filtros atuais.`
                    : `${filteredDocuments.length} documento(s) visíveis na base atual.`}
                </span>
                {!hasActiveFilters ? <span className="badge badge-muted">Busca por categoria, risco e texto</span> : null}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="loading-page">
              <span className="spinner" />
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">
                <Icon name="fileText" size={24} />
              </div>
              <h3>Nenhum documento nesta categoria</h3>
              <p>Adicione seus anexos agora para ativar alertas de vencimento e manter a clínica pronta para auditoria.</p>
            </div>
          ) : (
            <div className="document-card-list">
              {filteredDocuments.map(document => (
                <DocumentCard
                  key={document.id}
                  document={document}
                  onDownload={handleDownload}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  loadingFileId={loadingFileId}
                />
              ))}
            </div>
          )}
        </section>

        <aside className="documents-side-stack">
          <section className="card documents-side-card">
            <div className="eyebrow">Alertas críticos</div>
            {!summary?.alerts?.length ? (
              <>
                <h2 className="section-title">Nenhuma pendência urgente</h2>
                <p className="section-copy">Quando algum documento estiver vencido ou prestes a vencer, ele aparecerá aqui.</p>
              </>
            ) : (
              <div className="documents-alert-list">
                {summary.alerts.map(alert => (
                  <div className="documents-alert-item" key={alert.id}>
                    <div>
                      <strong>{alert.title}</strong>
                      <div className="text-sm text-muted">{alert.documentType}</div>
                    </div>
                    <span className={statusMeta[alert.status]?.className || 'badge badge-gold'}>
                      {alert.status === 'EXPIRING' ? alert.statusLabel : statusMeta[alert.status]?.label}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card documents-side-card" ref={missingListRef}>
            <div className="eyebrow">Faltantes prioritários</div>
            {!summary?.missingDocuments?.length ? (
              <>
                <h2 className="section-title">Cobertura base completa</h2>
                <p className="section-copy">Os principais documentos recomendados já aparecem no acervo da clínica.</p>
              </>
            ) : (
              <div className="documents-missing-list">
                {summary.missingDocuments.slice(0, 6).map(item => (
                  <div className="documents-missing-item" key={item.id}>
                    <div className="documents-missing-item-main">
                      <div className="documents-missing-icon">
                        <Icon name="clipboard" size={16} />
                      </div>
                      <div>
                        <strong>{item.requirement}</strong>
                        <div className="text-sm text-muted">{item.categoryLabel}</div>
                      </div>
                    </div>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => openRecommendedCreate(item.category, item.requirement)}>
                      Adicionar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card documents-side-card">
            <div className="eyebrow">Checklist sugerido</div>
            <ul className="documents-checklist">
              <li>Alvará sanitário e alvará de funcionamento</li>
              <li>CNPJ e contrato social</li>
              <li>Responsável técnico e biossegurança</li>
              <li>PGRSS, contratos e comprovantes de resíduos</li>
            </ul>
          </section>
        </aside>
      </div>

      {modal ? (
        <div className="modal-backdrop" onClick={event => event.target === event.currentTarget && setModal(null)}>
          <div className="modal modal-lg">
            <h2 className="modal-title">{modal === 'create' ? 'Novo documento' : 'Editar documento'}</h2>

            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Categoria</label>
                <select className="form-input" value={form.category} onChange={setField('category')}>
                  {categoryOptions.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Vencimento</label>
                <input className="form-input" type="date" value={form.expiresAt} onChange={setField('expiresAt')} />
              </div>

              <div className="form-group form-full">
                <label className="form-label">Tipo do documento</label>
                <input
                  className="form-input"
                  value={form.documentType}
                  onChange={setField('documentType')}
                  list="document-type-suggestions"
                  placeholder="Ex: Alvará sanitário"
                />
                <datalist id="document-type-suggestions">
                  {currentSuggestions.map(item => (
                    <option key={item} value={item} />
                  ))}
                </datalist>
              </div>

              <div className="form-group form-full">
                <label className="form-label">Título interno</label>
                <input className="form-input" value={form.title} onChange={setField('title')} placeholder="Ex: Alvará sanitário 2026" />
              </div>

              <div className="form-group form-full">
                <label className="form-label">Observações</label>
                <textarea className="form-textarea" value={form.notes} onChange={setField('notes')} placeholder="Dados complementares, órgão emissor, número do documento e observações internas." />
              </div>

              <div className="form-group form-full">
                <label className="form-label">Arquivo</label>
                <label className="file-picker">
                  <input type="file" onChange={handleFile} hidden disabled={uploading} />
                  <span className="btn btn-outline">
                    {uploading ? <span className="spinner" /> : <><Icon name="clip" /> Selecionar arquivo</>}
                  </span>
                  <span className="file-picker-name">
                    {form.fileName || (modal === 'edit' ? 'Manter arquivo atual' : 'Nenhum arquivo selecionado')}
                  </span>
                </label>
              </div>
            </div>

            <div className="inline-tip inline-tip-gold">
              <Icon name="clock" />
              O sistema acompanha vencimentos, faltantes prioritários e cobertura regulatória para apoiar a rotina da clínica.
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setModal(null)}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving || uploading || !formCanSave}>
                {saving ? <span className="spinner" /> : 'Salvar documento'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

