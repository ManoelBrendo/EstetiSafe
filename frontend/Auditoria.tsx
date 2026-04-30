import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import api, { getApiErrorMessage } from './api'
import { Icon } from './Icon'
import brandLogo from './lappui-mark.svg'
import type {
  AuditLogItem,
  AuditLogSummary,
  AuditLogsResponse,
  AuditSeverity,
  ClinicDocumentFileResponse,
  ClinicDocumentSummary,
  DocumentCategory,
  DocumentStatus,
  DocumentsSummaryResponse,
  MissingDocumentRequirement,
} from './operationsTypes'

type Importance = 'CRITICAL' | 'IMPORTANT' | 'RECOMMENDED'
type AuditDocStatus = DocumentStatus | 'MISSING'
type StatusFilter = 'ALL' | 'EXISTING' | 'MISSING' | 'PENDING_UPDATE' | DocumentStatus

type DocFilters = {
  search: string
  category: 'ALL' | DocumentCategory
  status: StatusFilter
  importance: 'ALL' | Importance
}

type AuditDocRow = {
  id: string
  title: string
  type: string
  category: DocumentCategory
  categoryLabel: string
  status: AuditDocStatus
  group: 'EXISTING' | 'MISSING'
  statusLabel: string
  importance: Importance
  description: string
  updatedAt?: string | null
  expiresAt?: string | null
  fileName?: string | null
  document?: ClinicDocumentSummary
}

const emptyAuditSummary: AuditLogSummary = { total: 0, highRiskCount: 0, byAction: [], byCategory: [] }
const emptyDocsSummary: DocumentsSummaryResponse = {
  total: 0,
  valid: 0,
  expiring: 0,
  expired: 0,
  alerts: [],
  complianceScore: 0,
  recommendedRequiredCount: 0,
  recommendedCoveredCount: 0,
  missingCount: 0,
  missingDocuments: [],
  categories: [],
  windows: { next7Days: 0, next15Days: 0, next30Days: 0 },
  lastUpdatedAt: null,
}

const emptyFilters: DocFilters = { search: '', category: 'ALL', status: 'ALL', importance: 'ALL' }

const categoryOptions: Array<{ value: 'ALL' | DocumentCategory; label: string }> = [
  { value: 'ALL', label: 'Todas as categorias' },
  { value: 'LEGAL', label: 'Legal' },
  { value: 'SANITARY', label: 'Sanitário' },
  { value: 'CLIENTS', label: 'Clientes' },
  { value: 'WASTE', label: 'Resíduos' },
]

const statusOptions: Array<{ value: StatusFilter; label: string }> = [
  { value: 'ALL', label: 'Todos os status' },
  { value: 'EXISTING', label: 'Documentos existentes' },
  { value: 'MISSING', label: 'Documentos ausentes' },
  { value: 'PENDING_UPDATE', label: 'Pendentes de atualização' },
  { value: 'EXPIRING', label: 'Próximos do vencimento' },
  { value: 'EXPIRED', label: 'Vencidos' },
  { value: 'VALID', label: 'Em dia' },
  { value: 'WITHOUT_EXPIRY', label: 'Sem vencimento' },
]

const importanceOptions: Array<{ value: 'ALL' | Importance; label: string }> = [
  { value: 'ALL', label: 'Todos os níveis' },
  { value: 'CRITICAL', label: 'Crítico' },
  { value: 'IMPORTANT', label: 'Importante' },
  { value: 'RECOMMENDED', label: 'Recomendado' },
]

const severityLabels: Record<AuditSeverity, string> = { LOW: 'Rotina', MEDIUM: 'Atenção', HIGH: 'Sensível' }
const metadataLabels: Record<string, string> = {
  title: 'Documento',
  documentType: 'Tipo',
  categoryLabel: 'Categoria',
  fileName: 'Arquivo',
  statusLabel: 'Status',
  daysUntilExpiry: 'Prazo',
  expiresAt: 'Vencimento',
  action: 'Ação',
  path: 'Rota',
  amount: 'Valor',
  paidAt: 'Baixa',
  clientName: 'Cliente',
  procedureName: 'Procedimento',
  professionalName: 'Profissional',
  occurredAt: 'Ocorrência',
  name: 'Nome',
  assetType: 'Tipo operacional',
  brand: 'Marca',
  batch: 'Lote',
  quantity: 'Quantidade',
  unit: 'Unidade',
  entryMode: 'Origem',
  maintenanceDueAt: 'Manutenção',
  warrantyUntil: 'Garantia',
  duration: 'Duração',
  price: 'Valor',
  hasPop: 'POP',
  active: 'Ativo',
  serialNumber: 'Série',
  model: 'Modelo',
}

const statusMeta: Record<AuditDocStatus, { label: string; className: string; tone: string; order: number }> = {
  EXPIRED: { label: 'Vencido', className: 'badge badge-red', tone: 'expired', order: 0 },
  EXPIRING: { label: 'Vencendo', className: 'badge badge-gold', tone: 'expiring', order: 1 },
  MISSING: { label: 'Ausente', className: 'badge badge-red', tone: 'missing', order: 2 },
  WITHOUT_EXPIRY: { label: 'Sem vencimento', className: 'badge badge-blue', tone: 'without-expiry', order: 3 },
  VALID: { label: 'Em dia', className: 'badge badge-green', tone: 'valid', order: 4 },
}
const importanceMeta: Record<Importance, { label: string; className: string; order: number }> = {
  CRITICAL: { label: 'Crítico', className: 'badge badge-red', order: 0 },
  IMPORTANT: { label: 'Importante', className: 'badge badge-gold', order: 1 },
  RECOMMENDED: { label: 'Recomendado', className: 'badge badge-muted', order: 2 },
}

const sensitiveCatalog = [
  { id: 'consent', title: 'Termos de consentimento', category: 'CLIENTS' as DocumentCategory, keys: ['termo de consentimento', 'consentimento', 'autorizacao de imagem'], audit: 'Consentimento', importance: 'CRITICAL' as Importance, priority: true, description: 'Documento essencial para registrar ciência, autorização de procedimentos e uso clínico de imagem.' },
  { id: 'anamnesis', title: 'Anamnese', category: 'CLIENTS' as DocumentCategory, keys: ['anamnese', 'modelo de anamnese'], audit: 'Prontuario', importance: 'CRITICAL' as Importance, description: 'Base clínica inicial para reduzir riscos antes de qualquer procedimento.' },
  { id: 'records', title: 'Prontuários', category: 'CLIENTS' as DocumentCategory, keys: ['prontuario', 'prontuário', 'evolucao'], audit: 'Prontuario', importance: 'CRITICAL' as Importance, description: 'Histórico clínico, evolução, fotos e registros do atendimento.' },
  { id: 'contracts', title: 'Contratos e políticas', category: 'LEGAL' as DocumentCategory, keys: ['contrato', 'politica de privacidade'], importance: 'IMPORTANT' as Importance, description: 'Define responsabilidades, aceite de políticas e organização jurídica da clínica.' },
  { id: 'authorizations', title: 'Autorizações e fichas clínicas', category: 'CLIENTS' as DocumentCategory, keys: ['autorizacao', 'ficha clinica'], importance: 'IMPORTANT' as Importance, description: 'Evidências de autorização específica para procedimentos, imagens e acompanhamento.' },
  { id: 'sanitary', title: 'Documentos sanitários', category: 'SANITARY' as DocumentCategory, keys: ['alvara sanitario', 'licenca', 'responsavel tecnico'], importance: 'CRITICAL' as Importance, description: 'Comprova regularidade sanitária, responsável técnico e preparo para fiscalização.' },
  { id: 'admin', title: 'Documentos administrativos', category: 'LEGAL' as DocumentCategory, keys: ['cnpj', 'contrato social', 'alvara de funcionamento'], importance: 'IMPORTANT' as Importance, description: 'Organiza a base administrativa e legal de funcionamento da clínica.' },
]

const dateFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

function formatDate(value?: string | number | null) {
  if (!value) return 'Sem data'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Data inválida' : dateFormatter.format(date)
}

function formatDateTime(value?: string | number | null) {
  if (!value) return 'Sem atualização'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Data inválida' : dateTimeFormatter.format(date)
}

function pluralize(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`
}

function normalize(value?: string | null) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function categoryLabel(category: DocumentCategory) {
  return categoryOptions.find(option => option.value === category)?.label || category
}

function getCategoryCount(summary: AuditLogSummary, category: string) {
  return summary.byCategory.find(item => item.category === category)?.count || 0
}

function friendlyRequirement(value: string) {
  const dictionary: Record<string, string> = {
    'alvara sanitario': 'Alvará sanitário',
    'alvara de funcionamento': 'Alvará de funcionamento',
    cnpj: 'CNPJ',
    'contrato social': 'Contrato social',
    'responsavel tecnico': 'Responsável técnico',
    'manual de biosseguranca': 'Manual de biossegurança',
    'licenca da visa': 'Licença da VISA',
    'termo de consentimento padrao': 'Termo de consentimento padrão',
    'politica de privacidade': 'Política de privacidade',
    'modelo de anamnese': 'Modelo de anamnese',
    pgrss: 'PGRSS',
    'manifesto de residuos': 'Manifesto de resíduos',
  }
  return dictionary[normalize(value)] || value
}

function importanceFor(text: string, category: DocumentCategory, status?: AuditDocStatus): Importance {
  const clean = normalize(text)
  if (status === 'EXPIRED' || status === 'EXPIRING') return 'CRITICAL'
  if (['alvara', 'licenca', 'responsavel tecnico', 'termo de consentimento', 'consentimento', 'anamnese', 'prontuario'].some(key => clean.includes(key))) return 'CRITICAL'
  if (category === 'LEGAL' || category === 'SANITARY' || ['contrato', 'politica', 'pgrss', 'autorizacao', 'ficha clinica'].some(key => clean.includes(key))) return 'IMPORTANT'
  return 'RECOMMENDED'
}

function missingReason(title: string, category: DocumentCategory) {
  const clean = normalize(title)
  if (clean.includes('termo de consentimento')) return 'Protege a clínica e a cliente ao documentar ciência, autorização e limites do procedimento.'
  if (clean.includes('anamnese')) return 'Ajuda a identificar riscos clínicos antes do atendimento e fortalece o prontuário.'
  if (clean.includes('alvara') || clean.includes('licenca') || clean.includes('responsavel tecnico')) return 'Documento sensível para regularidade sanitária e preparo para fiscalização.'
  if (clean.includes('pgrss') || clean.includes('residuo') || category === 'WASTE') return 'Comprova descarte correto, rastreabilidade ambiental e rotina segura de resíduos.'
  if (clean.includes('cnpj') || clean.includes('contrato')) return 'Organiza a base jurídica e administrativa da operação.'
  return 'Melhora a organização documental e reduz dependência de controles manuais.'
}

function existingDescription(document: ClinicDocumentSummary) {
  if (document.notes) return document.notes
  if (document.status === 'EXPIRED') return 'Documento vencido. Requer substituição ou atualização para reduzir risco operacional.'
  if (document.status === 'EXPIRING') return 'Documento próximo do vencimento. Priorize atualização antes do prazo.'
  if (document.status === 'WITHOUT_EXPIRY') return 'Documento sem vencimento cadastrado. Mantenha revisão periódica interna.'
  return 'Documento existente no acervo da clínica e disponível para consulta.'
}

function existingRow(document: ClinicDocumentSummary): AuditDocRow {
  const title = document.title || document.documentType
  const importance = importanceFor(`${title} ${document.documentType}`, document.category, document.status)
  return {
    id: `existing-${document.id}`,
    title,
    type: document.documentType,
    category: document.category,
    categoryLabel: categoryLabel(document.category),
    status: document.status,
    group: 'EXISTING',
    statusLabel: document.status === 'EXPIRING' ? document.statusLabel : statusMeta[document.status].label,
    importance,
    description: existingDescription(document),
    updatedAt: document.updatedAt,
    expiresAt: document.expiresAt,
    fileName: document.fileName,
    document,
  }
}

function missingRow(item: MissingDocumentRequirement): AuditDocRow {
  const title = friendlyRequirement(item.requirement)
  const importance = importanceFor(title, item.category, 'MISSING')
  return {
    id: `missing-${item.id}`,
    title,
    type: title,
    category: item.category,
    categoryLabel: categoryLabel(item.category),
    status: 'MISSING',
    group: 'MISSING',
    statusLabel: statusMeta.MISSING.label,
    importance,
    description: missingReason(title, item.category),
    updatedAt: null,
    expiresAt: null,
    fileName: null,
  }
}

function rowMatches(row: AuditDocRow, filters: DocFilters) {
  const query = normalize(filters.search)
  const searchable = normalize(`${row.title} ${row.type} ${row.categoryLabel} ${row.description} ${row.fileName || ''}`)
  return (!query || searchable.includes(query))
    && (filters.category === 'ALL' || row.category === filters.category)
    && (filters.importance === 'ALL' || row.importance === filters.importance)
    && (
      filters.status === 'ALL'
      || (filters.status === 'EXISTING' && row.group === 'EXISTING')
      || (filters.status === 'MISSING' && row.status === 'MISSING')
      || (filters.status === 'PENDING_UPDATE' && (row.status === 'EXPIRING' || row.status === 'EXPIRED'))
      || row.status === filters.status
    )
}

function sortRows(left: AuditDocRow, right: AuditDocRow) {
  const byImportance = importanceMeta[left.importance].order - importanceMeta[right.importance].order
  return byImportance || statusMeta[left.status].order - statusMeta[right.status].order
}

function formatAuditCategory(category?: string | null) {
  if (category === 'Prontuario') return 'Prontuário'
  if (category === 'Consentimento') return 'Consentimentos'
  return category || 'Sistema'
}

function formatAuditText(value?: string | null) {
  if (!value) return ''
  return value
    .replace(/Prontuario/g, 'Prontuário')
    .replace(/prontuario/g, 'prontuário')
    .replace(/Clinica/g, 'Clínica')
    .replace(/clinica/g, 'clínica')
    .replace(/Cobranca/g, 'Cobrança')
    .replace(/cobranca/g, 'cobrança')
    .replace(/Versao/g, 'Versão')
    .replace(/versao/g, 'versão')
    .replace(/Tecnico/g, 'Técnico')
    .replace(/tecnico/g, 'técnico')
    .replace(/Codigo/g, 'Código')
    .replace(/codigo/g, 'código')
}

function formatActor(log: AuditLogItem) {
  if (log.actorRole === 'SUPPORT') return 'Suporte técnico'
  if (log.actorEmail) return log.actorEmail
  return 'Sistema'
}

function formatMetadataValue(key: string, value: unknown) {
  if (['expiresAt', 'paidAt', 'createdAt', 'updatedAt', 'occurredAt', 'maintenanceDueAt', 'warrantyUntil'].includes(key) && typeof value === 'string') return formatDateTime(value)
  if ((key === 'daysUntilExpiry' || key === 'daysUntilDue') && typeof value === 'number') return value < 0 ? `Vencido há ${Math.abs(value)} dia(s)` : `${value} dia(s)`

  if (key === 'price' && typeof value === 'number') {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  if (typeof value === 'boolean') return value ? 'Sim' : 'Não'

  return String(value)
}

function getMetadataPreview(log: AuditLogItem) {
  const metadata = log.metadata && typeof log.metadata === 'object' && !Array.isArray(log.metadata) ? log.metadata : {}
  return Object.entries(metadata)
    .filter(([, value]) => value !== null && value !== undefined && ['string', 'number', 'boolean'].includes(typeof value))
    .slice(0, 4)
    .map(([key, value]) => ({ key: metadataLabels[key] || key, value: formatMetadataValue(key, value) }))
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

function buildSensitiveCards(documents: ClinicDocumentSummary[], missing: AuditDocRow[], auditSummary: AuditLogSummary) {
  return sensitiveCatalog.map(item => {
    const matchedDocument = documents.find(document => {
      const candidate = normalize(`${document.title} ${document.documentType} ${document.fileName}`)
      return item.keys.some(key => candidate.includes(normalize(key)))
    })
    const missingMatch = missing.find(row => item.keys.some(key => normalize(`${row.title} ${row.type}`).includes(normalize(key))))
    const eventCount = item.audit ? getCategoryCount(auditSummary, item.audit) : 0

    if (matchedDocument) {
      return {
        ...item,
        status: matchedDocument.status as AuditDocStatus,
        statusLabel: matchedDocument.status === 'EXPIRING' ? matchedDocument.statusLabel : statusMeta[matchedDocument.status].label,
        evidence: `Arquivo no acervo: ${matchedDocument.title}`,
      }
    }

    if (eventCount > 0) {
      return {
        ...item,
        status: 'WITHOUT_EXPIRY' as AuditDocStatus,
        statusLabel: 'Rastreado',
        evidence: `${eventCount} evento(s) de auditoria vinculados ao fluxo clínico.`,
      }
    }

    return {
      ...item,
      status: 'MISSING' as AuditDocStatus,
      statusLabel: missingMatch ? 'Ausente no acervo' : 'Requer evidência',
      evidence: missingMatch?.description || 'Inclua ou vincule evidências para fortalecer a auditoria documental.',
    }
  })
}

function Metric({ label, value, copy, tone = 'neutral' }: { label: string; value: string | number; copy: string; tone?: string }) {
  return (
    <article className={`audit-overview-metric audit-overview-metric-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{copy}</small>
    </article>
  )
}

function AuditEvent({ log }: { log: AuditLogItem }) {
  const metadata = getMetadataPreview(log)
  const severity = log.severity || 'LOW'
  return (
    <article className="audit-event-card">
      <div className="audit-event-icon"><Icon name={severity === 'HIGH' ? 'shield' : 'clipboard'} size={20} /></div>
      <div className="audit-event-body">
        <div className="audit-event-head">
          <div>
            <span className="audit-event-category">{formatAuditCategory(log.category)}</span>
            <h3>{formatAuditText(log.actionLabel) || 'Ação registrada'}</h3>
          </div>
          <span className={`audit-severity audit-severity-${severity.toLowerCase()}`}>{severityLabels[severity]}</span>
        </div>
        <p>{formatAuditText(log.description) || 'Registro auditável criado para rastreabilidade da operação.'}</p>
        <div className="audit-event-meta">
          <span><Icon name="person" size={14} /> {formatActor(log)}</span>
          <span><Icon name="clock" size={14} /> {formatDateTime(log.createdAt)}</span>
          <span><Icon name="fileText" size={14} /> {log.entityType || 'Sistema'}{log.entityId ? ` #${log.entityId}` : ''}</span>
        </div>
        {metadata.length ? (
          <div className="audit-metadata-grid">
            {metadata.map(item => <span key={`${log.id}-${item.key}`}><strong>{item.key}</strong>{item.value}</span>)}
          </div>
        ) : null}
      </div>
    </article>
  )
}

function DocumentRow({ row, loadingFileId, onDownload }: {
  row: AuditDocRow
  loadingFileId: ClinicDocumentSummary['id'] | null
  onDownload: (document: ClinicDocumentSummary) => void | Promise<void>
}) {
  const status = statusMeta[row.status]
  const importance = importanceMeta[row.importance]
  return (
    <article className={`audit-document-row audit-document-row-${status.tone}`}>
      <div className="audit-document-icon"><Icon name={row.status === 'MISSING' ? 'clipboard' : 'fileText'} size={18} /></div>
      <div className="audit-document-row-main">
        <div className="audit-document-row-head">
          <div>
            <span className="audit-document-category">{row.categoryLabel}</span>
            <h3>{row.title}</h3>
          </div>
          <div className="audit-document-badges">
            <span className={status.className}>{row.statusLabel}</span>
            <span className={importance.className}>{importance.label}</span>
          </div>
        </div>
        <p>{row.description}</p>
        <div className="audit-document-meta">
          <span><Icon name="clock" size={14} /> Atualizado: {formatDateTime(row.updatedAt)}</span>
          <span><Icon name="calendar" size={14} /> Vencimento: {formatDate(row.expiresAt)}</span>
          {row.fileName ? <span><Icon name="clip" size={14} /> {row.fileName}</span> : null}
        </div>
      </div>
      <div className="audit-document-actions">
        {row.document ? (
          <button type="button" className="btn btn-outline btn-sm" onClick={() => onDownload(row.document as ClinicDocumentSummary)} disabled={loadingFileId === row.document.id}>
            {loadingFileId === row.document.id ? <span className="spinner" /> : <><Icon name="download" /> Abrir</>}
          </button>
        ) : (
          <Link className="btn btn-outline btn-sm" to="/documentos"><Icon name="plus" /> Anexar</Link>
        )}
        <Link className="btn btn-ghost btn-sm" to="/documentos">{row.document ? 'Substituir' : 'Ir para Documentos'}</Link>
      </div>
    </article>
  )
}

function SensitiveCard({ item }: { item: ReturnType<typeof buildSensitiveCards>[number] }) {
  const status = statusMeta[item.status]
  const importance = importanceMeta[item.importance]
  return (
    <article className={`audit-sensitive-card ${item.priority ? 'is-priority' : ''} audit-sensitive-${status.tone}`}>
      <div className="audit-sensitive-head">
        <div className="audit-sensitive-icon"><Icon name={item.priority ? 'signature' : 'shield'} size={18} /></div>
        <div><span>{categoryLabel(item.category)}</span><h3>{item.title}</h3></div>
      </div>
      <p>{item.description}</p>
      <div className="audit-sensitive-meta">
        <span className={status.className}>{item.statusLabel}</span>
        <span className={importance.className}>{importance.label}</span>
      </div>
      <small>{item.evidence}</small>
    </article>
  )
}

export default function Auditoria() {
  const [filters, setFilters] = useState<DocFilters>(emptyFilters)
  const [logs, setLogs] = useState<AuditLogItem[]>([])
  const [auditSummary, setAuditSummary] = useState<AuditLogSummary>(emptyAuditSummary)
  const [documents, setDocuments] = useState<ClinicDocumentSummary[]>([])
  const [docsSummary, setDocsSummary] = useState<DocumentsSummaryResponse>(emptyDocsSummary)
  const [loading, setLoading] = useState(true)
  const [loadingFileId, setLoadingFileId] = useState<ClinicDocumentSummary['id'] | null>(null)

  const loadAuditData = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: documentList }, { data: documentDashboard }, { data: auditData }] = await Promise.all([
        api.get<ClinicDocumentSummary[]>('/documents'),
        api.get<DocumentsSummaryResponse>('/documents/summary'),
        api.get<AuditLogsResponse>('/api/v2/audit-logs?limit=40'),
      ])
      setDocuments(documentList || [])
      setDocsSummary(documentDashboard || emptyDocsSummary)
      setLogs(auditData.logs || auditData.items || [])
      setAuditSummary(auditData.summary || emptyAuditSummary)
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Não foi possível carregar a auditoria documental.'))
      setDocuments([])
      setDocsSummary(emptyDocsSummary)
      setLogs([])
      setAuditSummary(emptyAuditSummary)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAuditData()
  }, [loadAuditData])

  const existingRows = useMemo(() => documents.map(existingRow), [documents])
  const missingRows = useMemo(() => (docsSummary.missingDocuments || []).map(missingRow), [docsSummary.missingDocuments])
  const allRows = useMemo(() => [...existingRows, ...missingRows].sort(sortRows), [existingRows, missingRows])
  const filteredRows = useMemo(() => allRows.filter(row => rowMatches(row, filters)), [allRows, filters])
  const filteredExisting = filteredRows.filter(row => row.group === 'EXISTING')
  const filteredMissing = filteredRows.filter(row => row.group === 'MISSING')
  const sensitiveCards = useMemo(() => buildSensitiveCards(documents, missingRows, auditSummary), [documents, missingRows, auditSummary])
  const criticalRows = allRows.filter(row => row.status === 'EXPIRED' || row.status === 'EXPIRING' || (row.status === 'MISSING' && row.importance === 'CRITICAL'))
  const lastUpdate = docsSummary.lastUpdatedAt || logs[0]?.createdAt || null
  const pendingUpdateCount = (docsSummary.expiring || 0) + (docsSummary.expired || 0)
  const hasFilters = Boolean(filters.search.trim() || filters.category !== 'ALL' || filters.status !== 'ALL' || filters.importance !== 'ALL')

  const metrics = [
    { label: 'Conformidade', value: `${docsSummary.complianceScore || 0}%`, copy: 'Score documental por presença, vencimentos e cobertura recomendada.', tone: 'gold' },
    { label: 'Existentes', value: docsSummary.total, copy: 'Arquivos já cadastrados no acervo da clínica.', tone: 'green' },
    { label: 'Ausentes', value: docsSummary.missingCount, copy: 'Itens obrigatórios ou recomendados ainda não anexados.', tone: 'neutral' },
    { label: 'Críticos', value: criticalRows.length, copy: 'Vencidos, próximos do vencimento ou essenciais ausentes.', tone: 'rose' },
    { label: 'Última atualização', value: formatDate(lastUpdate), copy: lastUpdate ? 'Último movimento documental/auditável.' : 'Aguardando o primeiro evento.', tone: 'blue' },
  ]

  function handleFilter(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = event.target
    setFilters(current => ({ ...current, [name]: value }))
  }

  async function handleDownload(document: ClinicDocumentSummary) {
    setLoadingFileId(document.id)
    try {
      const { data } = await api.get<ClinicDocumentFileResponse>(`/documents/${document.id}`)
      triggerDownload(data.fileName, data.fileDataUrl)
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Não foi possível abrir este documento.'))
    } finally {
      setLoadingFileId(null)
    }
  }

  return (
    <div className="audit-page">
      <section className="audit-hero-card audit-document-hero">
        <div className="audit-hero-copy">
          <span className="eyebrow">Auditoria documental da clínica</span>
          <h1>Um painel estratégico para regularidade, segurança e prontidão operacional.</h1>
          <p>Veja rapidamente quais documentos existem, o que está faltando, quais itens precisam de atualização e onde os termos de consentimento entram como evidência essencial da operação clínica.</p>
          <div className="audit-hero-actions">
            <Link className="btn btn-primary" to="/documentos"><Icon name="fileText" /> Gerenciar documentos</Link>
            <button className="btn btn-secondary" type="button" onClick={() => void loadAuditData()} disabled={loading}>{loading ? <span className="spinner" /> : <Icon name="refresh" size={16} />} Atualizar auditoria</button>
          </div>
        </div>
        <div className="audit-hero-status audit-hero-visual audit-hero-score-card audit-control-panel" aria-label="Resumo visual da auditoria documental">
          <div className="audit-control-topline">
            <div className="audit-control-brand">
              <span className="audit-control-brand-mark"><img src={brandLogo} alt="Selo L'Appui" /></span>
              <span>Controle documental</span>
            </div>
            <span className={criticalRows.length ? 'audit-control-state is-warning' : 'audit-control-state is-safe'}>
              {loading ? 'Sincronizando' : criticalRows.length ? 'Revisar' : 'Em ordem'}
            </span>
          </div>

          <div className="audit-control-main">
            <span>Conformidade atual</span>
            <strong>{docsSummary.complianceScore || 0}%</strong>
            <p>{loading ? 'Buscando documentos, faltantes e eventos...' : pluralize(pendingUpdateCount, 'item pede atualização ou revisão.', 'itens pedem atualização ou revisão.')}</p>
          </div>

          <div className="audit-control-progress" aria-hidden="true">
            <span style={{ width: `${docsSummary.complianceScore || 0}%` }} />
          </div>

          <div className="audit-control-stats" aria-label="Indicadores documentais rápidos">
            <div><strong>{docsSummary.total}</strong><span>Existentes</span></div>
            <div><strong>{docsSummary.missingCount}</strong><span>Ausentes</span></div>
            <div><strong>{pendingUpdateCount}</strong><span>Revisar</span></div>
          </div>

          <div className="audit-control-footer">
            <Icon name="shield" size={16} />
            <span>{criticalRows.length ? 'Pendências críticas priorizadas abaixo.' : 'Sem urgências documentais no momento.'}</span>
          </div>
        </div>
      </section>

      <section className="audit-overview-strip audit-document-overview" aria-label="Resumo geral da auditoria">
        {metrics.map(metric => <Metric key={metric.label} {...metric} />)}
      </section>

      <section className="audit-document-command-card card">
        <div className="section-head">
          <div><h2 className="section-title">Filtros da análise documental</h2><p className="section-copy">Refine por categoria, status, importância ou nome do documento sem perder a visão geral.</p></div>
          {hasFilters ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFilters(emptyFilters)}>Limpar filtros</button> : null}
        </div>
        <div className="audit-document-filter-grid">
          <label className="form-field audit-document-search"><span>Buscar documento</span><input name="search" value={filters.search} onChange={handleFilter} placeholder="Ex: consentimento, alvará, anamnese" autoComplete="off" /></label>
          <label className="form-field"><span>Categoria</span><select name="category" value={filters.category} onChange={handleFilter}>{categoryOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label className="form-field"><span>Status</span><select name="status" value={filters.status} onChange={handleFilter}>{statusOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label className="form-field"><span>Importância</span><select name="importance" value={filters.importance} onChange={handleFilter}>{importanceOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        </div>
        <div className="audit-filter-feedback" aria-live="polite"><span>{pluralize(filteredRows.length, 'item encontrado', 'itens encontrados')}</span><span>{filteredExisting.length} existentes</span><span>{filteredMissing.length} ausentes</span></div>
      </section>

      <section className="audit-alert-panel card">
        <div className="section-head">
          <div><span className="eyebrow">Alertas e pendências</span><h2 className="section-title">Prioridade crítica no topo</h2><p className="section-copy">A auditoria destaca primeiro vencidos, próximos do vencimento e obrigatórios ainda não enviados.</p></div>
          <span className={criticalRows.length ? 'badge badge-red' : 'badge badge-green'}>{criticalRows.length ? `${criticalRows.length} pendência(s)` : 'Sem urgências'}</span>
        </div>
        {loading ? <div className="loading-page loading-page-inline"><span className="spinner" /> Carregando pendências...</div> : criticalRows.length ? (
          <div className="audit-alert-grid">
            {criticalRows.slice(0, 5).map(row => <article className="audit-alert-item" key={row.id}><span className={statusMeta[row.status].className}>{row.statusLabel}</span><strong>{row.title}</strong><p>{row.description}</p><small>{row.categoryLabel} · {importanceMeta[row.importance].label}</small></article>)}
          </div>
        ) : <div className="audit-safe-state"><Icon name="shield" size={22} /><div><strong>Nenhuma pendência crítica agora</strong><p>Documentos vencidos, próximos do vencimento ou essenciais ausentes aparecerão aqui automaticamente.</p></div></div>}
      </section>

      <section className="audit-sensitive-section card">
        <div className="section-head"><div><span className="eyebrow">Documentos sensíveis e essenciais</span><h2 className="section-title">Consentimento integrado à auditoria</h2><p className="section-copy">Termos, anamnese, prontuários, contratos, autorizações e documentos sanitários aparecem juntos na leitura de risco documental.</p></div></div>
        <div className="audit-sensitive-grid">{sensitiveCards.map(item => <SensitiveCard key={item.id} item={item} />)}</div>
      </section>

      <div className="audit-document-layout">
        <section className="audit-document-card card">
          <div className="section-head"><div><span className="eyebrow">Documentos existentes</span><h2 className="section-title">Acervo atual da clínica</h2><p className="section-copy">Lista dos arquivos já cadastrados, com categoria, atualização, vencimento e ações rápidas.</p></div><span className="badge badge-muted">{filteredExisting.length} exibidos</span></div>
          {loading ? <div className="loading-page loading-page-inline"><span className="spinner" /> Carregando documentos...</div> : filteredExisting.length ? <div className="audit-document-list">{filteredExisting.map(row => <DocumentRow key={row.id} row={row} loadingFileId={loadingFileId} onDownload={handleDownload} />)}</div> : <div className="audit-empty-panel"><Icon name="fileText" size={22} /><strong>Nenhum documento existente encontrado</strong><p>Adicione documentos ou ajuste os filtros para visualizar o acervo da clínica.</p><Link className="btn btn-outline btn-sm" to="/documentos">Abrir Documentos</Link></div>}
        </section>

        <aside className="audit-document-card card">
          <div className="section-head"><div><span className="eyebrow">Documentos ausentes</span><h2 className="section-title">Faltantes para regularidade</h2><p className="section-copy">Itens que fortalecem segurança operacional, organização e prontidão para fiscalização.</p></div><span className="badge badge-muted">{filteredMissing.length} faltantes</span></div>
          {loading ? <div className="loading-page loading-page-inline"><span className="spinner" /> Carregando faltantes...</div> : filteredMissing.length ? <div className="audit-document-list audit-document-list-compact">{filteredMissing.map(row => <DocumentRow key={row.id} row={row} loadingFileId={loadingFileId} onDownload={handleDownload} />)}</div> : <div className="audit-empty-panel"><Icon name="check" size={22} /><strong>Cobertura base completa</strong><p>Os documentos recomendados desta visão já estão representados no acervo ou nos filtros atuais.</p></div>}
        </aside>
      </div>

      <section className="audit-event-list" aria-live="polite">
        <div className="section-head"><div><span className="eyebrow">Rastreabilidade</span><h2 className="section-title">Eventos recentes da auditoria</h2><p className="section-copy">Histórico técnico permanece disponível para comprovar acessos, geração de PDFs, consentimentos e ações sensíveis.</p></div><span className="badge badge-muted">{logs.length} exibidos</span></div>
        {loading ? <div className="loading-page loading-page-inline"><span className="spinner" /> Carregando eventos...</div> : logs.length ? logs.map(log => <AuditEvent key={log.id} log={log} />) : <div className="empty empty-tight"><div className="empty-icon"><Icon name="shield" size={24} /></div><h3>Nenhum evento encontrado</h3><p>Novas ações sensíveis serão registradas automaticamente para rastreabilidade da clínica.</p></div>}
      </section>
    </div>
  )
}
