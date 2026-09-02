import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import api, { getApiErrorMessage } from './api'
import { Icon, type IconName } from './Icon'
import {
  clampScore,
  riskLevelFromScore,
  calculateClinicalScore,
  calculateProductScore,
  calculateEquipmentScore,
  calculateProfessionalProfileScore,
  calculateServicesScore,
  calculateBillingScore,
} from './complianceResolver'
import brandLogo from './lappui-mark.svg'
import { createDocumentTemplateFile } from './documentTemplates'
import { useAuth } from './useAuth'
import type {
  AuditCorrectiveAction,
  AuditCorrectiveActionAttachment,
  AuditCorrectiveActionAttachmentFileResponse,
  AuditCorrectiveActionStatus,
  AuditCorrectiveActionsResponse,
  AuditLogItem,
  AuditLogSummary,
  AuditLogsResponse,
  AuditSeverity,
  BillingSummaryResponse,
  ClinicBillsResponse,
  ClinicDocumentFileResponse,
  ClinicDocumentSummary,
  DocumentCategory,
  DocumentStatus,
  DocumentsSummaryResponse,
  InventoryDashboard,
  MissingDocumentRequirement,
  ProfessionalDocumentCoverage,
  ProfessionalDocumentRequirement,
  ProfessionalDocumentsDashboard,
  ProfessionalSummary,
  ServiceRecord,
} from './operationsTypes'

type Importance = 'CRITICAL' | 'IMPORTANT' | 'RECOMMENDED'
type AuditDocStatus = DocumentStatus | 'MISSING'
type StatusFilter = 'ALL' | 'EXISTING' | 'MISSING' | 'PENDING_UPDATE' | DocumentStatus
type AuditRiskLevel = 'CRITICAL' | 'WARNING' | 'OK'
type CorrectiveStatusFilter = 'ALL' | AuditCorrectiveActionStatus

type CorrectiveEditForm = {
  owner: string
  dueLabel: string
  dueAt: string
  evidence: string
}

type AuditDomainTask = {
  label: string
  owner: string
  due: string
  evidence: string
}

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

type AuditDomain = {
  id: string
  title: string
  label: string
  icon: IconName
  level: AuditRiskLevel
  score: number
  metric: string
  description: string
  nextAction: string
  ownerLabel: string
  dueLabel: string
  actionLabel: string
  to: string
  evidence: string[]
  tasks: AuditDomainTask[]
  history: string[]
}

type AuditCorrectiveTask = AuditDomainTask & {
  id: string
  taskKey: string
  domainId: string
  domainTitle: string
  level: AuditRiskLevel
  to: string
  dueAt?: string | null
  templateRequirement?: string
  templateCategory?: DocumentCategory
  templateCategoryLabel?: string
  templateSourceScopeLabels?: string[]
  persistedAction?: AuditCorrectiveAction
  attachments: AuditCorrectiveActionAttachment[]
  status: AuditCorrectiveActionStatus
}

const emptyAuditSummary: AuditLogSummary = { total: 0, highRiskCount: 0, byAction: [], byCategory: [] }
const emptyInventorySummary: InventoryDashboard = {
  totalProducts: 0,
  totalEquipment: 0,
  expiringProducts: 0,
  expiredProducts: 0,
  dueEquipment: 0,
  overdueEquipment: 0,
  alerts: [],
}
const emptyBillsSummary: ClinicBillsResponse = {
  openCount: 0,
  overdueCount: 0,
  paidCount: 0,
  totalOpenAmount: 0,
  overdueAmount: 0,
  paidThisMonthAmount: 0,
  bills: [],
}
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
const emptyProfessionalDocsSummary: ProfessionalDocumentsDashboard = {
  activeProfessionals: 0,
  totalDocuments: 0,
  requiredCount: 0,
  coveredCount: 0,
  missingCount: 0,
  expiring: 0,
  expired: 0,
  complianceScore: 100,
  alerts: [],
  missingRequirements: [],
  byProfessional: [],
  requirementCatalog: [],
}

const emptyFilters: DocFilters = { search: '', category: 'ALL', status: 'ALL', importance: 'ALL' }
const MAX_CORRECTIVE_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024

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

const riskMeta: Record<AuditRiskLevel, { label: string; className: string; tone: string }> = {
  CRITICAL: { label: 'Crítico', className: 'badge badge-red', tone: 'critical' },
  WARNING: { label: 'Atenção', className: 'badge badge-gold', tone: 'warning' },
  OK: { label: 'Em dia', className: 'badge badge-green', tone: 'ok' },
}

const correctiveStatusMeta: Record<AuditCorrectiveActionStatus, { label: string; tone: string; actionLabel: string; nextStatus: AuditCorrectiveActionStatus }> = {
  OPEN: { label: 'Pendente', tone: 'open', actionLabel: 'Iniciar', nextStatus: 'IN_PROGRESS' },
  IN_PROGRESS: { label: 'Em andamento', tone: 'progress', actionLabel: 'Concluir', nextStatus: 'DONE' },
  DONE: { label: 'Concluída', tone: 'done', actionLabel: 'Reabrir', nextStatus: 'OPEN' },
  DISMISSED: { label: 'Arquivada', tone: 'dismissed', actionLabel: 'Reabrir', nextStatus: 'OPEN' },
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

function formatDateInput(value?: string | number | null) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
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

function slugifyAuditKey(value: string) {
  return normalize(value).replace(/\s+/g, '-').slice(0, 120) || 'item'
}

function categoryLabel(category: DocumentCategory) {
  return categoryOptions.find(option => option.value === category)?.label || category
}

function ownerForMissingDocument(category: DocumentCategory) {
  if (category === 'SANITARY') return 'Responsável técnico'
  if (category === 'CLIENTS') return 'Equipe clínica'
  return 'Administrativo'
}

function dueForMissingDocument(category: DocumentCategory, sourceScopeLabels: string[] = [], importance: Importance) {
  if (importance === 'CRITICAL') return category === 'CLIENTS' || sourceScopeLabels.length ? 'Antes do próximo atendimento' : '48h'
  if (category === 'SANITARY') return '7 dias'
  return '15 dias'
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
  const sourceContext = item.sourceScopeLabels?.length ? ` Perfil: ${item.sourceScopeLabels.join(', ')}.` : ''
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
    description: `${missingReason(title, item.category)}${sourceContext}`,
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

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Não foi possível preparar o arquivo.'))
    reader.readAsDataURL(file)
  })
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

async function optionalData<T>(request: Promise<{ data: T }>, fallback: T): Promise<T> {
  try {
    const { data } = await request
    return data ?? fallback
  } catch {
    return fallback
  }
}

function getAuditLogItems(response: AuditLogsResponse) {
  return response.logs || response.items || []
}

function getLogMetadataText(log: AuditLogItem, key: string) {
  const value = log.metadata?.[key]
  return typeof value === 'string' ? value : null
}

function formatCorrectiveHistoryLabel(log: AuditLogItem) {
  const status = getLogMetadataText(log, 'status') as AuditCorrectiveActionStatus | null
  const changedFields = Array.isArray(log.metadata?.changedFields)
    ? log.metadata.changedFields.filter((item): item is string => typeof item === 'string')
    : []

  if (log.action === 'AUDIT_CORRECTIVE_ACTION_UPDATE' || changedFields.some(field => ['owner', 'dueLabel', 'dueAt'].includes(field))) {
    return 'Responsável ou prazo ajustado'
  }

  if (status === 'IN_PROGRESS') return 'Ação iniciada'
  if (status === 'DONE') return 'Ação concluída'
  if (status === 'DISMISSED') return 'Ação arquivada'
  if (status === 'OPEN') return 'Ação registrada ou reaberta'

  return 'Ação corretiva atualizada'
}

async function fetchCorrectiveLogData() {
  return optionalData(api.get<AuditLogsResponse>('/api/v2/audit-logs?entityType=AuditCorrectiveAction&limit=100'), {
    logs: [],
    items: [],
  } as AuditLogsResponse)
}

function hasEnabledAvailability(professional: ProfessionalSummary) {
  return (professional.availability || []).some(slot => slot.enabled)
}

function formatBillingStatus(value?: string | null) {
  const status = String(value || '').toUpperCase()
  if (status === 'ACTIVE') return 'Ativa'
  if (status === 'TRIAL') return 'Teste'
  if (status === 'OVERDUE') return 'Em atraso'
  if (status === 'BLOCKED') return 'Bloqueada'
  return status || 'Não informado'
}

function buildAuditDomains({
  docsSummary,
  criticalRows,
  sensitiveCards,
  auditSummary,
  inventorySummary,
  billingSummary,
  billsSummary,
  professionals,
  professionalDocsSummary,
  services,
}: {
  docsSummary: DocumentsSummaryResponse
  criticalRows: AuditDocRow[]
  sensitiveCards: ReturnType<typeof buildSensitiveCards>
  auditSummary: AuditLogSummary
  inventorySummary: InventoryDashboard
  billingSummary: BillingSummaryResponse | null
  billsSummary: ClinicBillsResponse
  professionals: ProfessionalSummary[]
  professionalDocsSummary: ProfessionalDocumentsDashboard
  services: ServiceRecord[]
}): AuditDomain[] {
  const criticalMissingDocs = criticalRows.filter(row => row.status === 'MISSING').length
  const docUrgencies = (docsSummary.expired || 0) + (docsSummary.expiring || 0) + criticalMissingDocs
  const docsScore = clampScore(docsSummary.complianceScore || 0)

  const clinicalSensitiveGaps = sensitiveCards.filter(item => item.importance === 'CRITICAL' && (item.status === 'MISSING' || item.status === 'EXPIRED' || item.status === 'EXPIRING')).length
  const clinicalEvents = getCategoryCount(auditSummary, 'Prontuario') + getCategoryCount(auditSummary, 'Consentimento')
  const clinicalScore = calculateClinicalScore(clinicalSensitiveGaps, Boolean(clinicalEvents))

  const expiredProducts = inventorySummary.expiredProducts || 0
  const expiringProducts = inventorySummary.expiringProducts || 0
  const productScore = calculateProductScore(expiredProducts, expiringProducts, inventorySummary.totalProducts || 0)

  const overdueEquipment = inventorySummary.overdueEquipment || 0
  const dueEquipment = inventorySummary.dueEquipment || 0
  const equipmentScore = calculateEquipmentScore(overdueEquipment, dueEquipment, inventorySummary.totalEquipment || 0)

  const activeProfessionals = professionals.filter(professional => professional.active !== false)
  const professionalsWithGaps = activeProfessionals.filter(professional => !professional.specialty?.trim() || !professional.contractType || !professional.paymentModel || !hasEnabledAvailability(professional)).length
  const professionalDocumentScore = professionalDocsSummary.requiredCount ? clampScore(professionalDocsSummary.complianceScore || 0) : 100
  const professionalDocumentGaps = professionalDocsSummary.missingCount || 0
  const professionalDocumentAlerts = (professionalDocsSummary.expired || 0) + (professionalDocsSummary.expiring || 0)
  const professionalProfileScore = calculateProfessionalProfileScore(activeProfessionals.length, professionalsWithGaps)
  const professionalsScore = activeProfessionals.length
    ? clampScore((professionalProfileScore * 0.55) + (professionalDocumentScore * 0.45))
    : 72

  const activeServices = services.filter(service => service.active !== false)
  const servicesWithoutPop = activeServices.filter(service => !service.servicePop).length
  const servicesScore = calculateServicesScore(activeServices.length, servicesWithoutPop)

  const billingSnapshot = billingSummary?.billing
  const billingStatus = String(billingSnapshot?.effectiveStatus || billingSnapshot?.status || '').toUpperCase()
  const billingBlocked = Boolean(billingSnapshot?.blocked || billingStatus === 'BLOCKED')
  const overdueBills = billsSummary.overdueCount || 0
  const openBills = billsSummary.openCount || 0
  const billingScore = calculateBillingScore(billingBlocked, overdueBills, billingStatus, openBills)

  return [
    {
      id: 'documents',
      title: 'Documentos obrigatórios',
      label: 'Base regulatória',
      icon: 'fileText',
      level: riskLevelFromScore(docsScore, docUrgencies > 0),
      score: docsScore,
      metric: pluralize(docUrgencies, 'urgência', 'urgências'),
      description: 'Vencimentos, ausências e cobertura recomendada ficam consolidados como primeiro eixo de conformidade.',
      nextAction: docUrgencies ? 'Regularizar pendências críticas do acervo' : 'Manter revisão documental mensal',
      ownerLabel: 'Administrativo + responsável técnico',
      dueLabel: docUrgencies ? '48h' : '30 dias',
      actionLabel: 'Abrir documentos',
      to: '/documentos',
      evidence: [
        `${docsSummary.total || 0} arquivo(s) no acervo`,
        `${docsSummary.missingCount || 0} faltante(s)`,
        `${pendingText(docsSummary.expiring || 0, docsSummary.expired || 0)} para revisar`,
      ],
      tasks: [
        {
          label: docUrgencies ? 'Anexar ou substituir documentos vencidos, vencendo ou ausentes.' : 'Conferir se novos documentos obrigatórios foram adicionados à rotina.',
          owner: 'Administrativo',
          due: docUrgencies ? '48h' : '30 dias',
          evidence: `${docsSummary.missingCount || 0} faltante(s), ${docsSummary.expired || 0} vencido(s), ${docsSummary.expiring || 0} vencendo.`,
        },
        {
          label: 'Registrar comprovante atualizado no acervo da clínica.',
          owner: 'Responsável técnico',
          due: docUrgencies ? 'Antes do próximo atendimento crítico' : 'Rotina mensal',
          evidence: `${docsSummary.recommendedCoveredCount || 0}/${docsSummary.recommendedRequiredCount || 0} documentos recomendados cobertos.`,
        },
      ],
      history: [
        `Score documental atual: ${docsScore}%.`,
        `${docsSummary.windows?.next30Days || 0} vencimento(s) nos próximos 30 dias.`,
      ],
    },
    {
      id: 'clinical',
      title: 'Prontuário e consentimento',
      label: 'Risco clínico',
      icon: 'signature',
      level: riskLevelFromScore(clinicalScore, clinicalSensitiveGaps > 0),
      score: clinicalScore,
      metric: pluralize(clinicalSensitiveGaps, 'lacuna sensível', 'lacunas sensíveis'),
      description: 'Termos, anamnese e registros sensíveis aparecem como evidência auditável da rotina assistencial.',
      nextAction: clinicalSensitiveGaps ? 'Revisar prontuários e consentimentos pendentes' : 'Auditar amostra de prontuários assinados',
      ownerLabel: 'Equipe clínica',
      dueLabel: clinicalSensitiveGaps ? 'Antes do atendimento' : 'Semanal',
      actionLabel: 'Ver clientes',
      to: '/clientes',
      evidence: [
        `${clinicalEvents} evento(s) clínico(s) rastreados`,
        `${clinicalSensitiveGaps} documento(s) sensíveis em atenção`,
        'Consentimento permanece dentro da leitura de risco',
      ],
      tasks: [
        {
          label: 'Validar anamnese, termo e autorização de imagem dos clientes com pendência.',
          owner: 'Profissional responsável',
          due: clinicalSensitiveGaps ? 'Antes do procedimento' : 'Semanal',
          evidence: `${clinicalSensitiveGaps} lacuna(s) sensível(is) detectada(s).`,
        },
        {
          label: 'Conferir se registros recentes possuem evidência, data e responsável.',
          owner: 'Coordenação clínica',
          due: 'Semanal',
          evidence: `${clinicalEvents} evento(s) de prontuário/consentimento registrados.`,
        },
      ],
      history: [
        `Score clínico atual: ${clinicalScore}%.`,
        clinicalEvents ? 'Há rastreabilidade recente de prontuário/consentimento.' : 'Sem evento clínico recente na auditoria.',
      ],
    },
    {
      id: 'products',
      title: 'Produtos e validade',
      label: 'Estoque seguro',
      icon: 'box',
      level: riskLevelFromScore(productScore, expiredProducts > 0),
      score: productScore,
      metric: pluralize(expiredProducts + expiringProducts, 'alerta', 'alertas'),
      description: 'Produtos vencidos ou próximos do vencimento entram na auditoria como risco operacional visível.',
      nextAction: expiredProducts ? 'Bloquear uso de produtos vencidos' : expiringProducts ? 'Planejar consumo ou substituição de produtos vencendo' : 'Manter conferência de validade',
      ownerLabel: 'Estoque',
      dueLabel: expiredProducts ? 'Hoje' : expiringProducts ? '7 dias' : '30 dias',
      actionLabel: 'Abrir estoque',
      to: '/produtos-e-equipamentos',
      evidence: [
        `${inventorySummary.totalProducts || 0} produto(s) cadastrados`,
        `${expiredProducts} vencido(s)`,
        `${expiringProducts} próximo(s) do vencimento`,
      ],
      tasks: [
        {
          label: expiredProducts ? 'Retirar produtos vencidos da rotina de atendimento.' : 'Conferir validade dos produtos de maior uso.',
          owner: 'Responsável pelo estoque',
          due: expiredProducts ? 'Hoje' : '30 dias',
          evidence: `${expiredProducts} produto(s) vencido(s).`,
        },
        {
          label: 'Atualizar lote, quantidade e data de validade dos itens em atenção.',
          owner: 'Recepção/estoque',
          due: expiringProducts ? '7 dias' : 'Rotina mensal',
          evidence: `${expiringProducts} produto(s) próximo(s) do vencimento.`,
        },
      ],
      history: [
        `Score de produtos atual: ${productScore}%.`,
        `${inventorySummary.totalProducts || 0} produto(s) ativos monitorados.`,
      ],
    },
    {
      id: 'equipment',
      title: 'Equipamentos e manutenção',
      label: 'Operação técnica',
      icon: 'procedure',
      level: riskLevelFromScore(equipmentScore, overdueEquipment > 0),
      score: equipmentScore,
      metric: pluralize(overdueEquipment + dueEquipment, 'manutenção', 'manutenções'),
      description: 'Manutenções vencidas ou próximas recebem prioridade para reduzir risco técnico no atendimento.',
      nextAction: overdueEquipment ? 'Agendar manutenção vencida' : dueEquipment ? 'Confirmar manutenção próxima' : 'Manter calendário técnico',
      ownerLabel: 'Responsável técnico',
      dueLabel: overdueEquipment ? 'Hoje' : dueEquipment ? '15 dias' : '30 dias',
      actionLabel: 'Ver equipamentos',
      to: '/produtos-e-equipamentos',
      evidence: [
        `${inventorySummary.totalEquipment || 0} equipamento(s) cadastrados`,
        `${overdueEquipment} manutenção(ões) vencida(s)`,
        `${dueEquipment} próxima(s) do prazo`,
      ],
      tasks: [
        {
          label: overdueEquipment ? 'Suspender uso de equipamento com manutenção vencida até regularização.' : 'Revisar agenda de manutenção preventiva.',
          owner: 'Responsável técnico',
          due: overdueEquipment ? 'Hoje' : '30 dias',
          evidence: `${overdueEquipment} equipamento(s) com manutenção vencida.`,
        },
        {
          label: 'Anexar ou registrar comprovante de manutenção no cadastro do equipamento.',
          owner: 'Administrativo',
          due: dueEquipment ? '15 dias' : 'Próxima revisão',
          evidence: `${dueEquipment} manutenção(ões) próxima(s).`,
        },
      ],
      history: [
        `Score técnico atual: ${equipmentScore}%.`,
        `${inventorySummary.totalEquipment || 0} equipamento(s) monitorados.`,
      ],
    },
    {
      id: 'professionals',
      title: 'Equipe e vínculo operacional',
      label: 'Profissionais',
      icon: 'users',
      level: activeProfessionals.length ? riskLevelFromScore(professionalsScore, professionalDocumentGaps > 0 || professionalDocumentAlerts > 0) : 'WARNING',
      score: professionalsScore,
      metric: `${pluralize(professionalsWithGaps, 'cadastro incompleto', 'cadastros incompletos')} · ${pluralize(professionalDocumentGaps, 'documento faltante', 'documentos faltantes')}`,
      description: 'Especialidade, agenda, contrato, folha e documentos da equipe ajudam a provar organização da rotina da clínica.',
      nextAction: professionalsWithGaps || professionalDocumentGaps ? 'Completar cadastros e documentos obrigatórios da equipe' : 'Revisar agenda, folha e documentos da equipe',
      ownerLabel: 'Gestão da clínica',
      dueLabel: professionalsWithGaps || professionalDocumentGaps ? '7 dias' : 'Mensal',
      actionLabel: 'Revisar equipe',
      to: '/profissionais',
      evidence: [
        `${activeProfessionals.length} profissional(is) ativo(s)`,
        `${professionalsWithGaps} com dados essenciais pendentes`,
        `${professionalDocsSummary.coveredCount || 0}/${professionalDocsSummary.requiredCount || 0} documento(s) obrigatório(s) da equipe coberto(s)`,
      ],
      tasks: [
        {
          label: 'Preencher especialidade, vínculo, modelo de pagamento e disponibilidade.',
          owner: 'Gestão da clínica',
          due: professionalsWithGaps ? '7 dias' : 'Mensal',
          evidence: `${professionalsWithGaps} cadastro(s) incompleto(s).`,
        },
        {
          label: professionalDocumentGaps ? 'Anexar documentos obrigatórios pendentes por profissional.' : 'Revisar documentos da equipe no fechamento mensal.',
          owner: 'Gestão da clínica',
          due: professionalDocumentGaps ? '7 dias' : 'Fechamento do mês',
          evidence: `${professionalDocumentGaps} documento(s) faltante(s), ${professionalDocumentAlerts} alerta(s) de validade.`,
        },
      ],
      history: [
        `Score da equipe atual: ${professionalsScore}%.`,
        activeProfessionals.length ? `Documentos da equipe: ${professionalDocumentScore}% de cobertura.` : 'Nenhum profissional ativo cadastrado.',
      ],
    },
    {
      id: 'services',
      title: 'Serviços e POP',
      label: 'Procedimentos',
      icon: 'clipboard',
      level: activeServices.length && servicesWithoutPop === activeServices.length ? 'CRITICAL' : riskLevelFromScore(servicesScore, false),
      score: servicesScore,
      metric: pluralize(servicesWithoutPop, 'POP pendente', 'POPs pendentes'),
      description: 'Procedimentos com POP fortalecem padronização, treinamento e defesa operacional da clínica.',
      nextAction: servicesWithoutPop ? 'Revisar POPs dos serviços ativos' : 'Validar POPs após mudanças de protocolo',
      ownerLabel: 'Coordenação clínica',
      dueLabel: servicesWithoutPop ? '7 dias' : 'Trimestral',
      actionLabel: 'Abrir serviços',
      to: '/servicos',
      evidence: [
        `${activeServices.length} serviço(s) ativo(s)`,
        `${servicesWithoutPop} sem POP vinculado`,
        'POP automático pode ser revisado por procedimento',
      ],
      tasks: [
        {
          label: 'Conferir POP, contraindicações, materiais e orientações de cada serviço ativo.',
          owner: 'Coordenação clínica',
          due: servicesWithoutPop ? '7 dias' : 'Trimestral',
          evidence: `${servicesWithoutPop} POP(s) pendente(s) entre ${activeServices.length} serviço(s).`,
        },
        {
          label: 'Revisar serviços após alteração de preço, duração ou protocolo.',
          owner: 'Responsável técnico',
          due: 'A cada alteração',
          evidence: `${activeServices.length} serviço(s) ativo(s) na operação.`,
        },
      ],
      history: [
        `Score de serviços atual: ${servicesScore}%.`,
        servicesWithoutPop ? 'Há POP pendente para revisar.' : 'POPs estão representados nos serviços ativos.',
      ],
    },
    {
      id: 'billing',
      title: 'Pagamentos da clínica',
      label: 'Financeiro',
      icon: 'dollar',
      level: billingBlocked || overdueBills > 0 || billingStatus === 'OVERDUE' ? 'CRITICAL' : openBills > 0 || billingStatus === 'TRIAL' ? 'WARNING' : 'OK',
      score: billingScore,
      metric: pluralize(overdueBills, 'conta vencida', 'contas vencidas'),
      description: 'Assinatura e contas da clínica ficam juntas para evitar risco de bloqueio ou perda de previsibilidade.',
      nextAction: overdueBills || billingStatus === 'OVERDUE' ? 'Regularizar pagamento vencido' : openBills ? 'Acompanhar contas em aberto' : 'Manter fechamento financeiro',
      ownerLabel: 'Financeiro',
      dueLabel: overdueBills || billingStatus === 'OVERDUE' ? 'Hoje' : openBills ? 'Até o vencimento' : 'Mensal',
      actionLabel: 'Ver pagamentos',
      to: '/pagamentos',
      evidence: [
        `Status da assinatura: ${formatBillingStatus(billingStatus)}`,
        `${openBills} conta(s) em aberto`,
        `${overdueBills} vencida(s)`,
      ],
      tasks: [
        {
          label: overdueBills || billingStatus === 'OVERDUE' ? 'Baixar ou negociar conta vencida e conferir risco de bloqueio.' : 'Conferir vencimentos abertos antes do fechamento.',
          owner: 'Financeiro',
          due: overdueBills || billingStatus === 'OVERDUE' ? 'Hoje' : 'Até o vencimento',
          evidence: `${overdueBills} conta(s) vencida(s), ${openBills} aberta(s).`,
        },
        {
          label: 'Manter assinatura e contas da clínica visíveis no mesmo painel.',
          owner: 'Gestão da clínica',
          due: 'Mensal',
          evidence: `Status atual da assinatura: ${formatBillingStatus(billingStatus)}.`,
        },
      ],
      history: [
        `Score financeiro atual: ${billingScore}%.`,
        `${billsSummary.paidCount || 0} conta(s) pagas no histórico carregado.`,
      ],
    },
  ]
}

function pendingText(expiring: number, expired: number) {
  const total = expiring + expired
  if (!total) return '0 item'
  if (expired && expiring) return `${expired} vencido(s) e ${expiring} vencendo`
  if (expired) return `${expired} vencido(s)`
  return `${expiring} vencendo`
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

function AuditProgressiveSection({
  eyebrow,
  title,
  copy,
  badge,
  badgeClass = 'badge badge-muted',
  children,
  defaultOpen = false,
  className = '',
  id,
}: {
  eyebrow: string
  title: string
  copy: string
  badge?: string
  badgeClass?: string
  children: ReactNode
  defaultOpen?: boolean
  className?: string
  id?: string
}) {
  return (
    <details className={`audit-progressive-section ${className}`.trim()} id={id} open={defaultOpen}>
      <summary className="audit-progressive-summary">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h2 className="section-title">{title}</h2>
          <p className="section-copy">{copy}</p>
        </div>
        <div className="audit-progressive-summary-meta">
          {badge ? <span className={badgeClass}>{badge}</span> : null}
          <span className="audit-progressive-action">
            <span className="audit-progressive-action-text" aria-hidden="true" />
            <span className="audit-progressive-toggle"><Icon name="chevron" size={16} /></span>
          </span>
        </div>
      </summary>
      <div className="audit-progressive-body">
        {children}
      </div>
    </details>
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
        <div className="audit-event-meta">
          <span><Icon name="person" size={14} /> {formatActor(log)}</span>
          <span><Icon name="clock" size={14} /> {formatDateTime(log.createdAt)}</span>
          <span><Icon name="fileText" size={14} /> {log.entityType || 'Sistema'}{log.entityId ? ` #${log.entityId}` : ''}</span>
        </div>
        <details className="audit-inline-details">
          <summary>
            <span>Ver contexto auditável</span>
            <Icon name="chevron" size={14} />
          </summary>
          <p>{formatAuditText(log.description) || 'Registro auditável criado para rastreabilidade da operação.'}</p>
          {metadata.length ? (
            <div className="audit-metadata-grid">
              {metadata.map(item => <span key={`${log.id}-${item.key}`}><strong>{item.key}</strong>{item.value}</span>)}
            </div>
          ) : null}
        </details>
      </div>
    </article>
  )
}

function buildMissingDocumentCorrectiveTasks(
  missingDocuments: MissingDocumentRequirement[],
  savedActions: Map<string, AuditCorrectiveAction>,
): AuditCorrectiveTask[] {
  return missingDocuments
    .map((item): AuditCorrectiveTask => {
      const title = friendlyRequirement(item.requirement)
      const sourceScopeLabels = item.sourceScopeLabels || []
      const importance = importanceFor(title, item.category, 'MISSING')
      const level: AuditRiskLevel = importance === 'CRITICAL' ? 'CRITICAL' : 'WARNING'
      const taskKey = `doc-missing-${slugifyAuditKey(item.id)}`
      const savedAction = savedActions.get(taskKey)
      const owner = ownerForMissingDocument(item.category)
      const due = dueForMissingDocument(item.category, sourceScopeLabels, importance)
      const scopeText = sourceScopeLabels.length ? ` Perfil: ${sourceScopeLabels.join(', ')}.` : ''
      const evidence = `${item.categoryLabel} ausente.${scopeText} Gere o modelo, preencha e anexe a versão final em Documentos.`

      return {
        id: taskKey,
        taskKey,
        domainId: 'documents',
        domainTitle: savedAction?.domainTitle || 'Documento obrigatório',
        label: savedAction?.title || `Anexar ${title}`,
        owner: savedAction?.owner || owner,
        due: savedAction?.dueLabel || due,
        dueAt: savedAction?.dueAt || null,
        evidence: savedAction?.evidence || evidence,
        level: (savedAction?.riskLevel === 'CRITICAL' || savedAction?.riskLevel === 'WARNING' || savedAction?.riskLevel === 'OK') ? savedAction.riskLevel : level,
        to: savedAction?.actionUrl || '/documentos',
        templateRequirement: item.requirement,
        templateCategory: item.category,
        templateCategoryLabel: item.categoryLabel,
        templateSourceScopeLabels: sourceScopeLabels,
        persistedAction: savedAction,
        attachments: savedAction?.attachments || [],
        status: savedAction?.status || 'OPEN',
      }
    })
}

function buildProfessionalDocumentCorrectiveTasks(
  missingRequirements: ProfessionalDocumentRequirement[],
  savedActions: Map<string, AuditCorrectiveAction>,
): AuditCorrectiveTask[] {
  return missingRequirements
    .map((item): AuditCorrectiveTask => {
      const taskKey = `professional-doc-missing-${slugifyAuditKey(`${item.professionalId}-${item.category}-${item.requirement}`)}`
      const savedAction = savedActions.get(taskKey)
      const isCritical = ['CONTRACT', 'CERTIFICATION', 'PERMISSION'].includes(String(item.category))
      const level: AuditRiskLevel = isCritical ? 'CRITICAL' : 'WARNING'
      const professionalName = item.professionalName || 'profissional'

      return {
        id: taskKey,
        taskKey,
        domainId: 'professionals',
        domainTitle: savedAction?.domainTitle || 'Documentos da equipe',
        label: savedAction?.title || `Anexar ${item.requirement} de ${professionalName}`,
        owner: savedAction?.owner || 'Gestão da clínica',
        due: savedAction?.dueLabel || (isCritical ? '7 dias' : '15 dias'),
        dueAt: savedAction?.dueAt || null,
        evidence: savedAction?.evidence || `${item.categoryLabel} ausente na ficha de ${professionalName}. Anexe o arquivo na ficha profissional para fechar a evidência.`,
        level: (savedAction?.riskLevel === 'CRITICAL' || savedAction?.riskLevel === 'WARNING' || savedAction?.riskLevel === 'OK') ? savedAction.riskLevel : level,
        to: savedAction?.actionUrl || `/profissionais/${item.professionalId}`,
        persistedAction: savedAction,
        attachments: savedAction?.attachments || [],
        status: savedAction?.status || 'OPEN',
      }
    })
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
        <details className="audit-inline-details audit-document-inline-details">
          <summary>
            <span>Detalhes e validade</span>
            <Icon name="chevron" size={14} />
          </summary>
          <p>{row.description}</p>
          <div className="audit-document-meta">
            <span><Icon name="clock" size={14} /> Atualizado: {formatDateTime(row.updatedAt)}</span>
            <span><Icon name="calendar" size={14} /> Vencimento: {formatDate(row.expiresAt)}</span>
            {row.fileName ? <span><Icon name="clip" size={14} /> {row.fileName}</span> : null}
          </div>
        </details>
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
      <div className="audit-sensitive-meta">
        <span className={status.className}>{item.statusLabel}</span>
        <span className={importance.className}>{importance.label}</span>
      </div>
      <details className="audit-inline-details">
        <summary>
          <span>Ver evidência</span>
          <Icon name="chevron" size={14} />
        </summary>
        <p>{item.description}</p>
        <small>{item.evidence}</small>
      </details>
    </article>
  )
}

function AuditDomainCard({ domain }: { domain: AuditDomain }) {
  const risk = riskMeta[domain.level]
  return (
    <article className={`audit-domain-card audit-domain-${risk.tone}`}>
      <div className="audit-domain-head">
        <span className="audit-domain-icon"><Icon name={domain.icon} size={18} /></span>
        <div>
          <span>{domain.label}</span>
          <h3>{domain.title}</h3>
        </div>
        <span className={risk.className}>{risk.label}</span>
      </div>
      <div className="audit-domain-score">
        <strong>{domain.score}%</strong>
        <span>{domain.metric}</span>
      </div>
      <p>{domain.description}</p>
      <div className="audit-domain-evidence">
        {domain.evidence.map(item => <span key={`${domain.id}-${item}`}>{item}</span>)}
      </div>
      <div className="audit-domain-next-action">
        <span>Próxima ação</span>
        <strong>{domain.nextAction}</strong>
        <small>{domain.ownerLabel} · {domain.dueLabel}</small>
      </div>
      <details className="audit-domain-disclosure">
        <summary>
          <span>Plano corretivo e evidências</span>
          <Icon name="chevron" size={15} />
        </summary>
        <div className="audit-domain-plan">
          {domain.tasks.map(task => (
            <article className="audit-domain-task" key={`${domain.id}-${task.label}`}>
              <div>
                <strong>{task.label}</strong>
                <small>{task.evidence}</small>
              </div>
              <div className="audit-domain-task-meta">
                <span><Icon name="person" size={13} /> {task.owner}</span>
                <span><Icon name="clock" size={13} /> {task.due}</span>
              </div>
            </article>
          ))}
        </div>
        <div className="audit-domain-history" aria-label="Histórico resumido do risco">
          {domain.history.map(item => <span key={`${domain.id}-history-${item}`}>{item}</span>)}
        </div>
      </details>
      <Link className="btn btn-ghost btn-sm" to={domain.to}>{domain.actionLabel}</Link>
    </article>
  )
}

function AuditCorrectiveTaskCard({
  task,
  saving,
  uploading,
  loadingAttachmentId,
  deletingAttachmentId,
  onStatusChange,
  onEdit,
  onAttach,
  onDownloadTemplate,
  onDownloadAttachment,
  onDeleteAttachment,
  history,
}: {
  task: AuditCorrectiveTask
  saving: boolean
  uploading: boolean
  loadingAttachmentId: AuditCorrectiveActionAttachment['id'] | null
  deletingAttachmentId: AuditCorrectiveActionAttachment['id'] | null
  onStatusChange: (task: AuditCorrectiveTask, status: AuditCorrectiveActionStatus) => void | Promise<void>
  onEdit: (task: AuditCorrectiveTask) => void
  onAttach: (task: AuditCorrectiveTask, file: File) => void | Promise<void>
  onDownloadTemplate: (task: AuditCorrectiveTask) => void
  onDownloadAttachment: (attachment: AuditCorrectiveActionAttachment) => void | Promise<void>
  onDeleteAttachment: (task: AuditCorrectiveTask, attachment: AuditCorrectiveActionAttachment) => void | Promise<void>
  history: AuditLogItem[]
}) {
  const risk = riskMeta[task.level]
  const status = correctiveStatusMeta[task.status]
  const attachments = task.attachments || []

  function handleAttachmentChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) void onAttach(task, file)
  }

  return (
    <article className={`audit-corrective-item audit-corrective-${risk.tone} audit-corrective-status-${status.tone}`}>
      <div className="audit-corrective-main">
        <span>{task.domainTitle}</span>
        <strong>{task.label}</strong>
      </div>
      <div className="audit-corrective-meta">
        <span><Icon name="person" size={14} /> {task.owner}</span>
        <span><Icon name="clock" size={14} /> {task.due}</span>
        <span className={attachments.length ? 'audit-corrective-evidence-state is-attached' : 'audit-corrective-evidence-state'}>
          <Icon name="clip" size={14} /> {pluralize(attachments.length, 'evidência', 'evidências')}
        </span>
        <span className="audit-corrective-state"><Icon name={task.status === 'DONE' ? 'check' : 'clock'} size={14} /> {status.label}</span>
      </div>
      <details className="audit-inline-details audit-corrective-evidence-details">
        <summary>
          <span>Justificativa e evidência esperada</span>
          <Icon name="chevron" size={14} />
        </summary>
        <p>{task.evidence}</p>
      </details>
      <div className="audit-corrective-actions">
        <button
          className="btn btn-outline btn-sm"
          type="button"
          onClick={() => void onStatusChange(task, status.nextStatus)}
          disabled={saving}
        >
          {saving ? <span className="spinner" /> : <Icon name={task.status === 'DONE' ? 'refresh' : 'check'} />}
          {status.actionLabel}
        </button>
        <button
          className="btn btn-ghost btn-sm"
          type="button"
          onClick={() => onEdit(task)}
          disabled={saving}
        >
          <Icon name="edit" />
          Ajustar
        </button>
        {task.status !== 'DONE' && task.status !== 'DISMISSED' ? (
          <button
            className="btn btn-ghost btn-sm audit-corrective-archive-btn"
            type="button"
            onClick={() => void onStatusChange(task, 'DISMISSED')}
            disabled={saving}
          >
            <Icon name="x" />
            Arquivar
          </button>
        ) : null}
        <Link className="btn btn-ghost btn-sm" to={task.to}>Corrigir</Link>
        {task.templateRequirement ? (
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={() => onDownloadTemplate(task)}
          >
            <Icon name="download" />
            Modelo
          </button>
        ) : null}
      </div>
      <details className="audit-corrective-attachments">
        <summary>
          <span>Evidências</span>
          <strong>{attachments.length}</strong>
          <Icon name="chevron" size={14} />
        </summary>
        <div className="audit-corrective-attachment-panel">
          <div className="audit-corrective-attachment-tools">
            <label className={`btn btn-outline btn-sm audit-corrective-upload ${uploading ? 'is-loading' : ''}`}>
              {uploading ? <span className="spinner" /> : <Icon name="clip" />}
              Anexar evidência
              <input
                type="file"
                accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
                onChange={handleAttachmentChange}
                disabled={saving || uploading}
              />
            </label>
            <span>PDF, imagem ou planilha até 5 MB.</span>
          </div>
          {attachments.length ? (
            <div className="audit-corrective-attachment-list">
              {attachments.map(attachment => {
                const loadingAttachment = loadingAttachmentId === attachment.id
                const deletingAttachment = deletingAttachmentId === attachment.id

                return (
                  <div className="audit-corrective-attachment-item" key={attachment.id}>
                    <div>
                      <strong>{attachment.fileName}</strong>
                      <small>{attachment.notes || formatDateTime(attachment.createdAt)}</small>
                    </div>
                    <div className="audit-corrective-attachment-actions">
                      <button
                        className="btn btn-ghost btn-sm"
                        type="button"
                        onClick={() => void onDownloadAttachment(attachment)}
                        disabled={loadingAttachment || deletingAttachment}
                      >
                        {loadingAttachment ? <span className="spinner" /> : <Icon name="download" />}
                        Abrir
                      </button>
                      <button
                        className="btn btn-ghost btn-sm audit-corrective-delete-attachment"
                        type="button"
                        onClick={() => void onDeleteAttachment(task, attachment)}
                        disabled={loadingAttachment || deletingAttachment}
                      >
                        {deletingAttachment ? <span className="spinner" /> : <Icon name="trash" />}
                        Remover
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="audit-corrective-attachment-empty">Nenhuma evidência anexada nesta ação.</p>
          )}
        </div>
      </details>
      {history.length ? (
        <details className="audit-corrective-history">
          <summary>
            <span>Histórico</span>
            <strong>{history.length}</strong>
            <Icon name="chevron" size={14} />
          </summary>
          <div className="audit-corrective-history-list">
            {history.slice(0, 5).map(log => (
              <div className="audit-corrective-history-item" key={log.id}>
                <span>{formatCorrectiveHistoryLabel(log)}</span>
                <strong>{formatDateTime(log.createdAt)}</strong>
                <small>{log.actorRole === 'SUPPORT' ? 'Suporte' : log.actorEmail || 'Sistema'}</small>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </article>
  )
}

export function buildExpiredDocumentCorrectiveTasks(
  documents: ClinicDocumentSummary[],
  savedActions: Map<string, AuditCorrectiveAction>
): AuditCorrectiveTask[] {
  return documents
    .filter(doc => doc.status === 'EXPIRED' || doc.status === 'EXPIRING')
    .map((doc): AuditCorrectiveTask => {
      const taskKey = `doc-expired-${doc.id}`
      const savedAction = savedActions.get(taskKey)
      const isExpired = doc.status === 'EXPIRED'
      const title = doc.title || doc.documentType
      const label = isExpired ? `Substituir ${title} (Vencido)` : `Renovar ${title} (Vencendo)`
      const level: AuditRiskLevel = isExpired ? 'CRITICAL' : 'WARNING'
      const evidence = isExpired 
        ? `O documento '${title}' está vencido desde ${formatDate(doc.expiresAt)}. Anexe um arquivo atualizado.`
        : `O documento '${title}' vence em ${formatDate(doc.expiresAt)}. Planeje a renovação e anexe o novo arquivo.`

      return {
        id: taskKey,
        taskKey,
        domainId: 'documents',
        domainTitle: savedAction?.domainTitle || 'Documentos da clínica',
        label: savedAction?.title || label,
        owner: savedAction?.owner || 'Administrativo',
        due: savedAction?.dueLabel || (isExpired ? '48h' : '15 dias'),
        dueAt: savedAction?.dueAt || null,
        evidence: savedAction?.evidence || evidence,
        level: (savedAction?.riskLevel === 'CRITICAL' || savedAction?.riskLevel === 'WARNING' || savedAction?.riskLevel === 'OK') ? savedAction.riskLevel : level,
        to: savedAction?.actionUrl || '/documentos',
        persistedAction: savedAction,
        attachments: savedAction?.attachments || [],
        status: savedAction?.status || 'OPEN',
      }
    })
}

interface ChecklistItem {
  id: string
  category: string
  title: string
  description: string
  recommendation: string
}

export const anvisaChecklistItems: ChecklistItem[] = [
  {
    id: 'anvisa-descarte-perfurocortantes',
    category: 'Descarte de Resíduos',
    title: 'Descarte de perfurocortantes em coletor rígido',
    description: 'Agulhas, lâminas e outros perfurocortantes devem ser descartados em caixas amarelas rígidas específicas (tipo Descarpack), sem ultrapassar o limite de preenchimento.',
    recommendation: 'Substituir coletor rígido e garantir que esteja posicionado corretamente na bancada de atendimento.'
  },
  {
    id: 'anvisa-descarte-infectante',
    category: 'Descarte de Resíduos',
    title: 'Uso de sacos infectantes vermelhos/brancos',
    description: 'Algodões sujos de sangue, gases e outros materiais contaminados com fluidos biológicos devem ir para a lixeira de pedal com saco plástico apropriado para resíduo infectante (Grupo A).',
    recommendation: 'Trocar sacos de lixo de resíduo infectante das salas clínicas e assegurar lixeiras com tampa acionada por pedal.'
  },
  {
    id: 'anvisa-manifesto-residuos',
    category: 'Descarte de Resíduos',
    title: 'Manifesto de Transporte de Resíduos (MTR)',
    description: 'A clínica deve possuir o MTR ou contrato vigente com empresa credenciada para coleta de resíduos biológicos perigosos e os comprovantes de coleta atualizados.',
    recommendation: 'Atualizar manifesto de descarte de resíduos e solicitar comprovantes à empresa terceirizada.'
  },
  {
    id: 'anvisa-desinfeccao-macas',
    category: 'Higienização de Cabines',
    title: 'Desinfecção de macas e superfícies entre atendimentos',
    description: 'Todas as macas de procedimentos, carrinhos auxiliares e superfícies de contato devem ser limpos e desinfetados com álcool 70% ou desinfetante hospitalar entre cada cliente.',
    recommendation: 'Realizar desinfecção completa das macas e cabines auxiliares com álcool 70%.'
  },
  {
    id: 'anvisa-lencois-descartaveis',
    category: 'Higienização de Cabines',
    title: 'Uso de lençóis descartáveis e EPIs',
    description: 'Uso obrigatório de lençol de papel descartável para cada maca, além de EPIs do profissional (máscaras, toucas, luvas e jaleco limpo).',
    recommendation: 'Abastecer salas com lençóis descartáveis e EPIs regulamentares.'
  },
  {
    id: 'anvisa-registro-limpeza',
    category: 'Higienização de Cabines',
    title: 'Planilha de controle diário de limpeza',
    description: 'As cabines de atendimento clínico devem possuir planilha de controle de limpeza diária visível e assinada pelos responsáveis.',
    recommendation: 'Imprimir e preencher planilha física de registro diário de limpeza nas salas clínicas.'
  },
  {
    id: 'anvisa-teste-autoclave',
    category: 'Rotina de Esterilização',
    title: 'Registro diário de testes químicos e físicos',
    description: 'Caso a clínica realize esterilização local de instrumentais, é obrigatório realizar testes indicadores biológicos/químicos diários na autoclave e manter registros organizados.',
    recommendation: 'Executar teste de indicador biológico na autoclave e registrar o resultado no diário de esterilização.'
  },
  {
    id: 'anvisa-envelopes-selados',
    category: 'Rotina de Esterilização',
    title: 'Selas e integridade dos envelopes de esterilização',
    description: 'Os materiais cirúrgicos e pinças esterilizados devem estar em envelopes lacrados, contendo indicador químico de processo integrado, data de esterilização e prazo de validade visíveis.',
    recommendation: 'Verificar validade das embalagens e re-esterilizar envelopes com integridade comprometida.'
  },
  {
    id: 'anvisa-autoclave-manutencao',
    category: 'Rotina de Esterilização',
    title: 'Manutenção preventiva da autoclave',
    description: 'A autoclave deve possuir registros de calibração periódica e manutenção preventiva anual ou semestral.',
    recommendation: 'Agendar calibração anual da autoclave com assistência autorizada.'
  }
]

export default function Auditoria() {
  const { user } = useAuth()
  const [filters, setFilters] = useState<DocFilters>(emptyFilters)
  const [logs, setLogs] = useState<AuditLogItem[]>([])
  const [searchInput, setSearchInput] = useState('')
  const [fromInput, setFromInput] = useState('')
  const [toInput, setToInput] = useState('')
  const [logsSearch, setLogsSearch] = useState('')
  const [logsFrom, setLogsFrom] = useState('')
  const [logsTo, setLogsTo] = useState('')
  const [logsPage, setLogsPage] = useState(1)
  const [logsTotal, setLogsTotal] = useState(0)
  const [logsLoading, setLogsLoading] = useState(false)
  const [auditSummary, setAuditSummary] = useState<AuditLogSummary>(emptyAuditSummary)
  const [documents, setDocuments] = useState<ClinicDocumentSummary[]>([])
  const [docsSummary, setDocsSummary] = useState<DocumentsSummaryResponse>(emptyDocsSummary)
  const [inventorySummary, setInventorySummary] = useState<InventoryDashboard>(emptyInventorySummary)
  const [billingSummary, setBillingSummary] = useState<BillingSummaryResponse | null>(null)
  const [billsSummary, setBillsSummary] = useState<ClinicBillsResponse>(emptyBillsSummary)
  const [professionals, setProfessionals] = useState<ProfessionalSummary[]>([])
  const [professionalDocsSummary, setProfessionalDocsSummary] = useState<ProfessionalDocumentsDashboard>(emptyProfessionalDocsSummary)
  const [services, setServices] = useState<ServiceRecord[]>([])
  const [auditCorrectiveActions, setAuditCorrectiveActions] = useState<AuditCorrectiveAction[]>([])
  const [correctiveLogs, setCorrectiveLogs] = useState<AuditLogItem[]>([])
  const [correctiveStatusFilter, setCorrectiveStatusFilter] = useState<CorrectiveStatusFilter>('ALL')
  const [loading, setLoading] = useState(true)
  const [loadingFileId, setLoadingFileId] = useState<ClinicDocumentSummary['id'] | null>(null)
  const [savingCorrectiveTaskKey, setSavingCorrectiveTaskKey] = useState<string | null>(null)
  const [uploadingCorrectiveTaskKey, setUploadingCorrectiveTaskKey] = useState<string | null>(null)
  const [loadingCorrectiveAttachmentId, setLoadingCorrectiveAttachmentId] = useState<AuditCorrectiveActionAttachment['id'] | null>(null)
  const [deletingCorrectiveAttachmentId, setDeletingCorrectiveAttachmentId] = useState<AuditCorrectiveActionAttachment['id'] | null>(null)
  const [editingCorrectiveTask, setEditingCorrectiveTask] = useState<AuditCorrectiveTask | null>(null)
  const [correctiveEditForm, setCorrectiveEditForm] = useState<CorrectiveEditForm>({
    owner: '',
    dueLabel: '',
    dueAt: '',
    evidence: '',
  })
  const [savingCorrectiveDetails, setSavingCorrectiveDetails] = useState(false)
  const [updatingChecklistItemId, setUpdatingChecklistItemId] = useState<string | null>(null)

  async function handleChecklistStatusChange(itemId: string, makeCompliant: boolean) {
    setUpdatingChecklistItemId(itemId)
    const item = anvisaChecklistItems.find(x => x.id === itemId)
    if (!item) return

    try {
      const savedAction = auditCorrectiveActionByKey.get(itemId)

      if (makeCompliant) {
        if (savedAction) {
          const { data } = await api.post<AuditCorrectiveAction>('/audit-corrective-actions', {
            taskKey: itemId,
            domainId: 'clinical',
            domainTitle: 'Compliance ANVISA',
            title: item.title,
            owner: 'Equipe clínica',
            dueLabel: 'Imediato (24h)',
            evidence: `Evidência de correção: ${item.recommendation}`,
            actionUrl: '/auditoria',
            riskLevel: 'CRITICAL',
            status: 'DONE',
          })
          mergeAuditCorrectiveAction(data)
          toast.success(`Item '${item.title}' marcado como conforme.`)
        } else {
          toast.success(`Item '${item.title}' já está em conformidade.`)
        }
      } else {
        const { data } = await api.post<AuditCorrectiveAction>('/audit-corrective-actions', {
          taskKey: itemId,
          domainId: 'clinical',
          domainTitle: 'Compliance ANVISA',
          title: item.title,
          owner: 'Equipe clínica',
          dueLabel: 'Imediato (24h)',
          evidence: `Falha constatada no checklist: ${item.description}`,
          actionUrl: '/auditoria',
          riskLevel: 'CRITICAL',
          status: 'OPEN',
        })
        mergeAuditCorrectiveAction(data)
        toast.error(`Falha registrada. Ação corretiva criada no plano.`)
      }
      void refreshCorrectiveLogs()
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Não foi possível atualizar o checklist.'))
    } finally {
      setUpdatingChecklistItemId(null)
    }
  }

  const loadAuditData = useCallback(async () => {
    setLoading(true)
    try {
      const [
        { data: documentList },
        { data: documentDashboard },
        { data: auditData },
        inventoryDashboard,
        billingDashboard,
        billsDashboard,
        professionalList,
        professionalDocumentDashboard,
        serviceList,
        correctiveActions,
        correctiveLogData,
      ] = await Promise.all([
        api.get<ClinicDocumentSummary[]>('/documents'),
        api.get<DocumentsSummaryResponse>('/documents/summary'),
        api.get<AuditLogsResponse>('/api/v2/audit-logs?limit=40'),
        optionalData(api.get<InventoryDashboard>('/inventory/summary'), emptyInventorySummary),
        optionalData(api.get<BillingSummaryResponse>('/billing/summary'), null as BillingSummaryResponse | null),
        optionalData(api.get<ClinicBillsResponse>('/billing/bills'), emptyBillsSummary),
        optionalData(api.get<ProfessionalSummary[]>('/professionals'), []),
        optionalData(api.get<ProfessionalDocumentsDashboard>('/professionals/documents/summary'), emptyProfessionalDocsSummary),
        optionalData(api.get<ServiceRecord[]>('/services'), []),
        optionalData(api.get<AuditCorrectiveActionsResponse>('/audit-corrective-actions'), { total: 0, items: [] }),
        fetchCorrectiveLogData(),
      ])
      setDocuments(documentList || [])
      setDocsSummary(documentDashboard || emptyDocsSummary)
      setLogs(auditData.logs || auditData.items || [])
      setLogsTotal(auditData.total || (auditData.logs || auditData.items || []).length)
      setLogsPage(1)
      setAuditSummary(auditData.summary || emptyAuditSummary)
      setInventorySummary(inventoryDashboard || emptyInventorySummary)
      setBillingSummary(billingDashboard)
      setBillsSummary(billsDashboard || emptyBillsSummary)
      setProfessionals(professionalList || [])
      setProfessionalDocsSummary(professionalDocumentDashboard || emptyProfessionalDocsSummary)
      setServices(serviceList || [])
      setAuditCorrectiveActions(correctiveActions.items || [])
      setCorrectiveLogs(getAuditLogItems(correctiveLogData))
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Não foi possível carregar a auditoria documental.'))
      setDocuments([])
      setDocsSummary(emptyDocsSummary)
      setLogs([])
      setAuditSummary(emptyAuditSummary)
      setInventorySummary(emptyInventorySummary)
      setBillingSummary(null)
      setBillsSummary(emptyBillsSummary)
      setProfessionals([])
      setProfessionalDocsSummary(emptyProfessionalDocsSummary)
      setServices([])
      setAuditCorrectiveActions([])
      setCorrectiveLogs([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAuditData()
  }, [loadAuditData])

  const loadFilteredLogs = useCallback(async (search: string, from: string, to: string, page: number, append: boolean) => {
    setLogsLoading(true)
    try {
      let url = `/api/v2/audit-logs?limit=40&page=${page}`
      if (search.trim()) url += `&search=${encodeURIComponent(search.trim())}`
      if (from) url += `&from=${from}`
      if (to) url += `&to=${to}`

      const res = await api.get<AuditLogsResponse>(url)
      const fetchedLogs = res.data.logs || res.data.items || []
      
      if (append) {
        setLogs(prev => [...prev, ...fetchedLogs])
      } else {
        setLogs(fetchedLogs)
      }
      setLogsTotal(res.data.total || 0)
      if (res.data.summary) {
        setAuditSummary(res.data.summary)
      }
    } catch (error) {
      toast.error('Não foi possível carregar os registros de auditoria filtrados.')
    } finally {
      setLogsLoading(false)
    }
  }, [])

  const handleApplyFilters = useCallback(() => {
    setLogsSearch(searchInput)
    setLogsFrom(fromInput)
    setLogsTo(toInput)
    setLogsPage(1)
    void loadFilteredLogs(searchInput, fromInput, toInput, 1, false)
  }, [searchInput, fromInput, toInput, loadFilteredLogs])

  const handleClearFilters = useCallback(() => {
    setSearchInput('')
    setFromInput('')
    setToInput('')
    setLogsSearch('')
    setLogsFrom('')
    setLogsTo('')
    setLogsPage(1)
    void loadFilteredLogs('', '', '', 1, false)
  }, [loadFilteredLogs])

  const handleLoadMore = useCallback(() => {
    const nextPage = logsPage + 1
    setLogsPage(nextPage)
    void loadFilteredLogs(logsSearch, logsFrom, logsTo, nextPage, true)
  }, [logsPage, logsSearch, logsFrom, logsTo, loadFilteredLogs])

  const exportToCSV = useCallback(() => {
    const headers = ['ID', 'Data/Hora', 'Usuário (E-mail)', 'Papel', 'Categoria', 'Ação', 'Gravidade', 'Descrição']
    const csvContent = [
      headers.join(';'),
      ...logs.map(log => {
        const row = [
          log.id,
          log.createdAt ? new Date(log.createdAt).toLocaleString('pt-BR') : '',
          log.actorEmail || 'Sistema',
          log.actorRole || 'N/A',
          log.category || '',
          log.actionLabel || log.action || '',
          log.severity || 'LOW',
          `"${(log.description || '').replace(/"/g, '""')}"`
        ]
        return row.join(';')
      })
    ].join('\n')

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `trilha-auditoria-${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }, [logs])

  const exportToPDF = useCallback(() => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      toast.error('Não foi possível abrir a janela de impressão. Verifique se o bloqueador de pop-ups está ativo.')
      return
    }
    const clinicName = user?.clinicName || 'Clínica L\'Appui'
    const filterText = [
      logsSearch ? `Busca: "${logsSearch}"` : null,
      logsFrom ? `De: ${logsFrom}` : null,
      logsTo ? `Até: ${logsTo}` : null,
    ].filter(Boolean).join(' | ') || 'Sem filtros aplicados'

    const logRowsHtml = logs.map((log, index) => {
      const severityClass = `severity-${(log.severity || 'LOW').toLowerCase()}`
      const severityLabel = log.severity === 'HIGH' ? 'Alta' : log.severity === 'MEDIUM' ? 'Média' : 'Baixa'
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${log.createdAt ? new Date(log.createdAt).toLocaleString('pt-BR') : ''}</td>
          <td>${log.actorEmail || 'Sistema'} (${log.actorRole || 'N/A'})</td>
          <td><span class="badge ${severityClass}">${severityLabel}</span></td>
          <td><strong>${log.actionLabel || log.action}</strong><br/><small>${log.description}</small></td>
        </tr>
      `
    }).join('')

    printWindow.document.write(`
      <html>
        <head>
          <title>Relatório de Auditoria - ${clinicName}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #2a1f17; padding: 40px; margin: 0; }
            .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #b6894d; padding-bottom: 20px; margin-bottom: 30px; }
            .header h1 { font-size: 24px; color: #2a1f17; margin: 0; }
            .header p { margin: 5px 0 0; color: #79695d; font-size: 14px; }
            .meta-info { background: #fdfaf5; border: 1px solid #f4e8d6; padding: 15px; border-radius: 12px; margin-bottom: 30px; font-size: 13px; color: #6d5c51; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
            th { background: #f4e8d6; color: #2a1f17; text-align: left; padding: 12px 10px; font-weight: bold; border-bottom: 2px solid #e3d2bd; }
            td { padding: 12px 10px; border-bottom: 1px solid #f4e8d6; vertical-align: top; }
            .badge { display: inline-block; padding: 3px 8px; border-radius: 999px; font-size: 10px; font-weight: bold; text-transform: uppercase; }
            .severity-high { background: #fbeee9; color: #8b362a; }
            .severity-medium { background: #fdf5ea; color: #95611f; }
            .severity-low { background: #ebf5f1; color: #2f725d; }
            @media print {
              body { padding: 0; }
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1>Relatório de Trilha de Auditoria</h1>
              <p>${clinicName}</p>
            </div>
            <div style="text-align: right;">
              <p>Gerado em: ${new Date().toLocaleString('pt-BR')}</p>
              <p>Total de Registros: ${logs.length}</p>
            </div>
          </div>
          <div class="meta-info">
            <strong>Filtros aplicados:</strong> ${filterText}
          </div>
          <table>
            <thead>
              <tr>
                <th style="width: 5%;">#</th>
                <th style="width: 20%;">Data/Hora</th>
                <th style="width: 25%;">Usuário (Papel)</th>
                <th style="width: 10%;">Gravidade</th>
                <th style="width: 40%;">Ação & Detalhes</th>
              </tr>
            </thead>
            <tbody>
              ${logRowsHtml}
            </tbody>
          </table>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `)
    printWindow.document.close()
  }, [logs, user, logsSearch, logsFrom, logsTo])

  const refreshCorrectiveLogs = useCallback(async () => {
    const correctiveLogData = await fetchCorrectiveLogData()
    setCorrectiveLogs(getAuditLogItems(correctiveLogData))
  }, [])

  const existingRows = useMemo(() => documents.map(existingRow), [documents])
  const missingRows = useMemo(() => (docsSummary.missingDocuments || []).map(missingRow), [docsSummary.missingDocuments])
  const allRows = useMemo(() => [...existingRows, ...missingRows].sort(sortRows), [existingRows, missingRows])
  const filteredRows = useMemo(() => allRows.filter(row => rowMatches(row, filters)), [allRows, filters])
  const filteredExisting = filteredRows.filter(row => row.group === 'EXISTING')
  const filteredMissing = filteredRows.filter(row => row.group === 'MISSING')
  const sensitiveCards = useMemo(() => buildSensitiveCards(documents, missingRows, auditSummary), [documents, missingRows, auditSummary])
  const criticalRows = useMemo(() => allRows.filter(row => row.status === 'EXPIRED' || row.status === 'EXPIRING' || (row.status === 'MISSING' && row.importance === 'CRITICAL')), [allRows])
  const operationalDomains = useMemo(() => buildAuditDomains({
    docsSummary,
    criticalRows,
    sensitiveCards,
    auditSummary,
    inventorySummary,
    billingSummary,
    billsSummary,
    professionals,
    professionalDocsSummary,
    services,
  }), [auditSummary, billingSummary, billsSummary, criticalRows, docsSummary, inventorySummary, professionalDocsSummary, professionals, sensitiveCards, services])
  const executiveScore = operationalDomains.length ? clampScore(operationalDomains.reduce((total, domain) => total + domain.score, 0) / operationalDomains.length) : docsSummary.complianceScore || 0
  const criticalDomainCount = operationalDomains.filter(domain => domain.level === 'CRITICAL').length
  const warningDomainCount = operationalDomains.filter(domain => domain.level === 'WARNING').length
  const okDomainCount = operationalDomains.filter(domain => domain.level === 'OK').length
  const priorityDomain = operationalDomains.find(domain => domain.level === 'CRITICAL') || operationalDomains.find(domain => domain.level === 'WARNING') || operationalDomains[0]
  const lastUpdate = docsSummary.lastUpdatedAt || logs[0]?.createdAt || null
  const documentProfileLabels = docsSummary.profile?.scopeLabels || []
  const documentProfileName = documentProfileLabels.length ? documentProfileLabels.join(', ') : 'Perfil base'
  const auditClinicName = user?.clinicName || 'Clínica'
  const hasFilters = Boolean(filters.search.trim() || filters.category !== 'ALL' || filters.status !== 'ALL' || filters.importance !== 'ALL')
  const auditCorrectiveActionByKey = useMemo(() => new Map(auditCorrectiveActions.map(action => [action.taskKey, action])), [auditCorrectiveActions])
  const correctiveTasks = useMemo(() => {
    const riskOrder: Record<AuditRiskLevel, number> = { CRITICAL: 0, WARNING: 1, OK: 2 }

    const domainTasks = operationalDomains
      .flatMap(domain => domain.tasks.map((task, index): AuditCorrectiveTask => {
        const taskKey = `${domain.id}-${index}`
        const savedAction = auditCorrectiveActionByKey.get(taskKey)

        return {
          ...task,
          id: taskKey,
          taskKey,
          domainId: domain.id,
          domainTitle: savedAction?.domainTitle || domain.title,
          label: savedAction?.title || task.label,
          owner: savedAction?.owner || task.owner,
          due: savedAction?.dueLabel || task.due,
          dueAt: savedAction?.dueAt || null,
          evidence: savedAction?.evidence || task.evidence,
          level: (savedAction?.riskLevel === 'CRITICAL' || savedAction?.riskLevel === 'WARNING' || savedAction?.riskLevel === 'OK') ? savedAction.riskLevel : domain.level,
          to: savedAction?.actionUrl || domain.to,
          persistedAction: savedAction,
          attachments: savedAction?.attachments || [],
          status: savedAction?.status || 'OPEN',
        }
      }))

    const missingDocumentTasks = buildMissingDocumentCorrectiveTasks(
      docsSummary.missingDocuments || [],
      auditCorrectiveActionByKey,
    )
    const professionalDocumentTasks = buildProfessionalDocumentCorrectiveTasks(
      professionalDocsSummary.missingRequirements || [],
      auditCorrectiveActionByKey,
    )

    const expiredDocumentTasks = buildExpiredDocumentCorrectiveTasks(
      documents,
      auditCorrectiveActionByKey,
    )

    const checklistTasks: AuditCorrectiveTask[] = anvisaChecklistItems
      .map((item): AuditCorrectiveTask | null => {
        const savedAction = auditCorrectiveActionByKey.get(item.id)
        if (!savedAction) return null

        const taskKey = item.id
        return {
          id: taskKey,
          taskKey,
          domainId: 'clinical',
          domainTitle: savedAction.domainTitle || 'Compliance ANVISA',
          label: savedAction.title || item.title,
          owner: savedAction.owner || 'Equipe clínica',
          due: savedAction.dueLabel || 'Imediato (24h)',
          dueAt: savedAction.dueAt || null,
          evidence: savedAction.evidence || item.description,
          level: 'CRITICAL',
          to: savedAction.actionUrl || '/auditoria',
          persistedAction: savedAction,
          attachments: savedAction.attachments || [],
          status: savedAction.status || 'OPEN',
        }
      })
      .filter((t): t is AuditCorrectiveTask => t !== null)

    const handledKeys = new Set<string>()
    domainTasks.forEach(t => handledKeys.add(t.taskKey))
    missingDocumentTasks.forEach(t => handledKeys.add(t.taskKey))
    professionalDocumentTasks.forEach(t => handledKeys.add(t.taskKey))
    expiredDocumentTasks.forEach(t => handledKeys.add(t.taskKey))
    checklistTasks.forEach(t => handledKeys.add(t.taskKey))

    const customTasks: AuditCorrectiveTask[] = auditCorrectiveActions
      .filter(action => !handledKeys.has(action.taskKey))
      .map(action => ({
        id: action.taskKey,
        taskKey: action.taskKey,
        domainId: action.domainId || 'clinical',
        domainTitle: action.domainTitle || 'Ação customizada',
        label: action.title,
        owner: action.owner,
        due: action.dueLabel || 'Sem prazo',
        dueAt: action.dueAt || null,
        evidence: action.evidence || 'Nenhuma evidência descrita.',
        level: (action.riskLevel === 'CRITICAL' || action.riskLevel === 'WARNING' || action.riskLevel === 'OK') ? action.riskLevel : 'WARNING',
        to: action.actionUrl || '/auditoria',
        persistedAction: action,
        attachments: action.attachments || [],
        status: action.status,
      }))

    return [
      ...missingDocumentTasks,
      ...professionalDocumentTasks,
      ...expiredDocumentTasks,
      ...checklistTasks,
      ...domainTasks,
      ...customTasks
    ]
      .sort((left, right) => riskOrder[left.level] - riskOrder[right.level])
      .slice(0, 30)
  }, [auditCorrectiveActionByKey, auditCorrectiveActions, docsSummary.missingDocuments, documents, operationalDomains, professionalDocsSummary.missingRequirements])
  const openCorrectiveCount = correctiveTasks.filter(task => task.status === 'OPEN').length
  const inProgressCorrectiveCount = correctiveTasks.filter(task => task.status === 'IN_PROGRESS').length
  const completedCorrectiveCount = correctiveTasks.filter(task => task.status === 'DONE').length
  const dismissedCorrectiveCount = correctiveTasks.filter(task => task.status === 'DISMISSED').length
  const activeCorrectiveTasks = correctiveTasks.filter(task => task.status !== 'DONE' && task.status !== 'DISMISSED')
  const criticalCorrectiveTasks = activeCorrectiveTasks.filter(task => task.level === 'CRITICAL')
  const nextExecutiveTask = criticalCorrectiveTasks[0] || activeCorrectiveTasks[0] || correctiveTasks[0]
  const correctiveAttachmentCount = correctiveTasks.reduce((total, task) => total + task.attachments.length, 0)
  const traceabilityEventCount = logs.length + correctiveLogs.length
  const executiveDossierStatus = criticalDomainCount ? 'Ação prioritária' : warningDomainCount ? 'Em acompanhamento' : 'Pronto para revisão'
  const executiveDossierCopy = criticalDomainCount
    ? 'Há frentes críticas abertas; trate primeiro o plano corretivo e anexe evidências.'
    : warningDomainCount
      ? 'A operação não tem bloqueio crítico, mas ainda pede revisão documentada.'
      : 'A clínica está sem alerta executivo relevante no momento.'
  const visibleCorrectiveTasks = useMemo(
    () => correctiveStatusFilter === 'ALL'
      ? correctiveTasks
      : correctiveTasks.filter(task => task.status === correctiveStatusFilter),
    [correctiveStatusFilter, correctiveTasks],
  )
  const correctiveHistoryByTaskKey = useMemo(() => {
    const next = new Map<string, AuditLogItem[]>()

    correctiveLogs.forEach(log => {
      const taskKey = getLogMetadataText(log, 'taskKey')
      if (!taskKey) return

      const current = next.get(taskKey) || []
      current.push(log)
      next.set(taskKey, current)
    })

    next.forEach(items => items.sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime()))

    return next
  }, [correctiveLogs])
  const primaryCorrectiveTasks = visibleCorrectiveTasks.slice(0, 2)
  const secondaryCorrectiveTasks = visibleCorrectiveTasks.slice(2)
  const correctiveFilterOptions: Array<{ value: CorrectiveStatusFilter; label: string; count: number }> = [
    { value: 'ALL', label: 'Todas', count: correctiveTasks.length },
    { value: 'OPEN', label: 'Pendentes', count: openCorrectiveCount },
    { value: 'IN_PROGRESS', label: 'Em andamento', count: inProgressCorrectiveCount },
    { value: 'DONE', label: 'Concluidas', count: completedCorrectiveCount },
    { value: 'DISMISSED', label: 'Arquivadas', count: dismissedCorrectiveCount },
  ]
  const professionalDocumentBuckets = useMemo(() => {
    const byRisk = [...professionalDocsSummary.byProfessional].sort((left, right) => (
      right.criticalCount - left.criticalCount
      || right.missingCount - left.missingCount
      || right.expiredCount - left.expiredCount
      || right.expiringCount - left.expiringCount
      || left.score - right.score
      || left.professionalName.localeCompare(right.professionalName)
    ))

    const critical = byRisk.filter(item => item.criticalCount > 0 || item.missingCount > 0 || item.expiredCount > 0)
    const attention = byRisk.filter(item => item.criticalCount === 0 && item.missingCount === 0 && item.expiredCount === 0 && item.expiringCount > 0)
    const ready = byRisk.filter(item => item.criticalCount === 0 && item.missingCount === 0 && item.expiredCount === 0 && item.expiringCount === 0)

    return { critical, attention, ready }
  }, [professionalDocsSummary.byProfessional])
  const priorityProfessionalDocuments: ProfessionalDocumentCoverage[] = useMemo(
    () => [...professionalDocumentBuckets.critical, ...professionalDocumentBuckets.attention].slice(0, 5),
    [professionalDocumentBuckets],
  )
  const professionalDocumentAlertList = useMemo(
    () => professionalDocsSummary.alerts.slice(0, 4),
    [professionalDocsSummary.alerts],
  )
  const anvisaConformeCount = anvisaChecklistItems.filter(item => {
    const action = auditCorrectiveActionByKey.get(item.id)
    return !action || action.status === 'DONE' || action.status === 'DISMISSED'
  }).length
  const anvisaNonConformeCount = anvisaChecklistItems.length - anvisaConformeCount

  const metrics = [
    { label: 'Conformidade', value: `${executiveScore}%`, copy: 'Score executivo cruzando documentos, operação, equipe e pagamentos.', tone: 'gold' },
    { label: 'Docs equipe', value: `${professionalDocsSummary.coveredCount || 0}/${professionalDocsSummary.requiredCount || 0}`, copy: `${professionalDocsSummary.missingCount || 0} pendência(s) por profissional.`, tone: professionalDocsSummary.missingCount ? 'rose' : 'green' },
    { label: 'Áreas críticas', value: criticalDomainCount, copy: 'Módulos com risco prioritário para ação imediata.', tone: criticalDomainCount ? 'rose' : 'green' },
    { label: 'Atenção', value: warningDomainCount, copy: 'Áreas que não bloqueiam, mas merecem revisão.', tone: 'neutral' },
    { label: 'Áreas em dia', value: okDomainCount, copy: 'Frentes sem pendência relevante no momento.', tone: 'green' },
    { label: 'Última atualização', value: formatDate(lastUpdate), copy: lastUpdate ? 'Último movimento documental/auditável.' : 'Aguardando o primeiro evento.', tone: 'blue' },
  ]
  const executiveDossierMetrics = [
    {
      label: 'Leitura atual',
      value: executiveDossierStatus,
      copy: executiveDossierCopy,
      icon: criticalDomainCount ? 'shield' : warningDomainCount ? 'clock' : 'check',
    },
    {
      label: 'Plano corretivo',
      value: `${completedCorrectiveCount}/${correctiveTasks.length}`,
      copy: `${activeCorrectiveTasks.length} ação(ões) ainda em aberto ou andamento.`,
      icon: 'clipboard',
    },
    {
      label: 'Evidências',
      value: correctiveAttachmentCount,
      copy: correctiveAttachmentCount ? 'Arquivo(s) anexado(s) ao plano corretivo.' : 'Anexe evidências para comprovar execução.',
      icon: 'clip',
    },
    {
      label: 'Trilha auditável',
      value: traceabilityEventCount,
      copy: 'Evento(s) recentes entre auditoria e plano corretivo.',
      icon: 'shield',
    },
  ] as Array<{ label: string; value: string | number; copy: string; icon: IconName }>
  const executiveDossierTasks = (criticalCorrectiveTasks.length ? criticalCorrectiveTasks : activeCorrectiveTasks).slice(0, 3)
  const printPriorityTasks = (criticalCorrectiveTasks.length ? criticalCorrectiveTasks : activeCorrectiveTasks).slice(0, 5)
  const printRiskSummary = [
    { label: 'Áreas críticas', value: criticalDomainCount, copy: `${criticalCorrectiveTasks.length} ação(ões) críticas no plano.` },
    { label: 'Em atenção', value: warningDomainCount, copy: 'Frentes que pedem revisão documentada.' },
    { label: 'Ações abertas', value: activeCorrectiveTasks.length, copy: `${inProgressCorrectiveCount} em andamento.` },
    { label: 'Evidências', value: correctiveAttachmentCount, copy: 'Anexadas ao plano corretivo.' },
  ]
  const printGovernanceChecklist = [
    {
      label: 'Base documental',
      copy: `${docsSummary.recommendedCoveredCount || 0}/${docsSummary.recommendedRequiredCount || 0} documento(s) da clínica coberto(s); ${docsSummary.missingCount || 0} faltante(s).`,
    },
    {
      label: 'Equipe profissional',
      copy: `${professionalDocsSummary.coveredCount || 0}/${professionalDocsSummary.requiredCount || 0} requisito(s) coberto(s); ${professionalDocsSummary.missingCount || 0} pendência(s).`,
    },
    {
      label: 'Plano corretivo',
      copy: `${completedCorrectiveCount}/${correctiveTasks.length} ação(ões) concluída(s); ${activeCorrectiveTasks.length} ainda ativa(s).`,
    },
    {
      label: 'Rastreabilidade',
      copy: `${traceabilityEventCount} evento(s) recentes disponíveis para consulta técnica.`,
    },
  ]
  const reportGeneratedAt = formatDateTime(new Date().toISOString())

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

  function handleDownloadCorrectiveTemplate(task: AuditCorrectiveTask) {
    if (!task.templateRequirement || !task.templateCategory) return

    const template = createDocumentTemplateFile({
      requirement: task.templateRequirement,
      category: task.templateCategory,
      categoryLabel: task.templateCategoryLabel || categoryLabel(task.templateCategory),
      clinicName: auditClinicName,
      sourceScopeLabels: task.templateSourceScopeLabels || [],
    })

    triggerDownload(template.fileName, template.fileDataUrl)
    toast.success('Modelo base baixado. Preencha e anexe a versão final como evidência ou documento.')
  }

  function mergeAuditCorrectiveAction(action: AuditCorrectiveAction) {
    setAuditCorrectiveActions(current => {
      const next = new Map(current.map(item => [item.taskKey, item]))
      next.set(action.taskKey, action)
      return Array.from(next.values())
    })
  }

  async function handleCorrectiveStatusChange(task: AuditCorrectiveTask, status: AuditCorrectiveActionStatus) {
    setSavingCorrectiveTaskKey(task.taskKey)
    try {
      const { data } = await api.post<AuditCorrectiveAction>('/audit-corrective-actions', {
        taskKey: task.taskKey,
        domainId: task.domainId,
        domainTitle: task.domainTitle,
        title: task.label,
        owner: task.owner,
        dueLabel: task.due,
        evidence: task.evidence,
        actionUrl: task.to,
        riskLevel: task.level,
        status,
      })

      mergeAuditCorrectiveAction(data)

      void refreshCorrectiveLogs()
      toast.success(`Plano corretivo marcado como ${correctiveStatusMeta[status].label.toLowerCase()}.`)
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Não foi possível atualizar esta ação corretiva.'))
    } finally {
      setSavingCorrectiveTaskKey(null)
    }
  }

  function openCorrectiveEdit(task: AuditCorrectiveTask) {
    setEditingCorrectiveTask(task)
    setCorrectiveEditForm({
      owner: task.owner,
      dueLabel: task.due,
      dueAt: formatDateInput(task.dueAt),
      evidence: task.evidence,
    })
  }

  function closeCorrectiveEdit() {
    setEditingCorrectiveTask(null)
    setCorrectiveEditForm({ owner: '', dueLabel: '', dueAt: '', evidence: '' })
  }

  async function handleSaveCorrectiveDetails() {
    if (!editingCorrectiveTask) return

    const owner = correctiveEditForm.owner.trim()
    const dueLabel = correctiveEditForm.dueLabel.trim()
    const evidence = correctiveEditForm.evidence.trim()

    if (!owner || !dueLabel) {
      toast.error('Informe responsável e prazo para manter o plano corretivo rastreável.')
      return
    }

    setSavingCorrectiveDetails(true)
    try {
      const { data } = await api.post<AuditCorrectiveAction>('/audit-corrective-actions', {
        taskKey: editingCorrectiveTask.taskKey,
        domainId: editingCorrectiveTask.domainId,
        domainTitle: editingCorrectiveTask.domainTitle,
        title: editingCorrectiveTask.label,
        owner,
        dueLabel,
        dueAt: correctiveEditForm.dueAt || null,
        evidence: evidence || editingCorrectiveTask.evidence,
        actionUrl: editingCorrectiveTask.to,
        riskLevel: editingCorrectiveTask.level,
        status: editingCorrectiveTask.status,
      })

      mergeAuditCorrectiveAction(data)

      void refreshCorrectiveLogs()
      toast.success('Responsável e prazo atualizados no plano corretivo.')
      closeCorrectiveEdit()
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Não foi possível ajustar esta ação corretiva.'))
    } finally {
      setSavingCorrectiveDetails(false)
    }
  }

  async function handleCorrectiveAttachmentUpload(task: AuditCorrectiveTask, file: File) {
    if (file.size > MAX_CORRECTIVE_ATTACHMENT_SIZE_BYTES) {
      toast.error('Arquivo muito grande. Use evidências de até 5 MB para manter a auditoria rápida.')
      return
    }

    setUploadingCorrectiveTaskKey(task.taskKey)
    try {
      const fileDataUrl = await readFileAsDataUrl(file)
      let action = task.persistedAction

      if (!action?.id) {
        const { data } = await api.post<AuditCorrectiveAction>('/audit-corrective-actions', {
          taskKey: task.taskKey,
          domainId: task.domainId,
          domainTitle: task.domainTitle,
          title: task.label,
          owner: task.owner,
          dueLabel: task.due,
          dueAt: formatDateInput(task.dueAt) || null,
          evidence: task.evidence,
          actionUrl: task.to,
          riskLevel: task.level,
          status: task.status,
        })

        action = data
        mergeAuditCorrectiveAction(data)
      }

      const { data: attachment } = await api.post<AuditCorrectiveActionAttachment>(`/audit-corrective-actions/${action.id}/attachments`, {
        fileName: file.name,
        fileMimeType: file.type || 'application/octet-stream',
        fileDataUrl,
        notes: 'Evidência anexada ao plano corretivo.',
      })

      setAuditCorrectiveActions(current => {
        const next = new Map(current.map(item => [item.taskKey, item]))
        const baseAction = next.get(action.taskKey) || action
        next.set(action.taskKey, {
          ...baseAction,
          attachments: [attachment, ...(baseAction.attachments || []).filter(item => item.id !== attachment.id)],
        })
        return Array.from(next.values())
      })

      void refreshCorrectiveLogs()
      toast.success('Evidência anexada ao plano corretivo.')
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Não foi possível anexar esta evidência.'))
    } finally {
      setUploadingCorrectiveTaskKey(null)
    }
  }

  async function handleDownloadCorrectiveAttachment(attachment: AuditCorrectiveActionAttachment) {
    setLoadingCorrectiveAttachmentId(attachment.id)
    try {
      const { data } = await api.get<AuditCorrectiveActionAttachmentFileResponse>(`/audit-corrective-actions/${attachment.actionId}/attachments/${attachment.id}`)
      triggerDownload(data.fileName, data.fileDataUrl)
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Não foi possível abrir esta evidência.'))
    } finally {
      setLoadingCorrectiveAttachmentId(null)
    }
  }

  async function handleDeleteCorrectiveAttachment(task: AuditCorrectiveTask, attachment: AuditCorrectiveActionAttachment) {
    if (!window.confirm('Remover esta evidência do plano corretivo?')) return

    setDeletingCorrectiveAttachmentId(attachment.id)
    try {
      await api.delete(`/audit-corrective-actions/${attachment.actionId}/attachments/${attachment.id}`)
      setAuditCorrectiveActions(current => current.map(action => (
        action.taskKey === task.taskKey
          ? { ...action, attachments: (action.attachments || []).filter(item => item.id !== attachment.id) }
          : action
      )))
      void refreshCorrectiveLogs()
      toast.success('Evidência removida do plano corretivo.')
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Não foi possível remover esta evidência.'))
    } finally {
      setDeletingCorrectiveAttachmentId(null)
    }
  }

  function handlePrintReport() {
    toast.success('Relatório pronto para imprimir ou salvar em PDF.')
    window.print()
  }

  return (
    <div className="audit-page ux-compact-page">
      <section className="audit-hero-card audit-document-hero">
        <div className="audit-hero-copy">
          <h1>Regularidade, risco e próxima ação.</h1>
          <div className="audit-hero-actions">
            <Link className="btn btn-primary" to="/documentos"><Icon name="fileText" /> Gerenciar documentos</Link>
            <button className="btn btn-secondary" type="button" onClick={() => void loadAuditData()} disabled={loading}>{loading ? <span className="spinner" /> : <Icon name="refresh" size={16} />} Atualizar auditoria</button>
            <button className="btn btn-outline" type="button" onClick={handlePrintReport}><Icon name="download" /> Exportar relatório</button>
          </div>
        </div>
        <aside className="audit-command-card" aria-label="Resumo executivo compacto da auditoria">
          <div>
            <span>Conformidade</span>
            <strong>{executiveScore}%</strong>
          </div>
          <span className={criticalDomainCount ? 'audit-control-state is-warning' : 'audit-control-state is-safe'}>
            {loading ? 'Sincronizando' : criticalDomainCount ? 'Priorizar' : 'Em ordem'}
          </span>
          <div className="audit-command-stats" aria-label="Indicadores executivos rápidos">
            <span><strong>{criticalDomainCount}</strong> Críticas</span>
            <span><strong>{warningDomainCount}</strong> Atenção</span>
            <span><strong>{okDomainCount}</strong> Em dia</span>
          </div>
        </aside>
      </section>

      <section className="audit-executive-dossier card" aria-label="Dossiê executivo da auditoria">
        <div className="audit-executive-dossier-main">
          <div className="section-head">
            <div>
              <h2 className="section-title">Essencial para decisão</h2>
            </div>
            <span className={criticalDomainCount ? 'badge badge-red' : warningDomainCount ? 'badge badge-gold' : 'badge badge-green'}>
              {executiveDossierStatus}
            </span>
          </div>

          <details className="audit-executive-metrics-details">
            <summary>
              <span>Indicadores do dossiê</span>
              <strong>{executiveDossierMetrics.length}</strong>
              <Icon name="chevron" size={14} />
            </summary>
            <div className="audit-executive-dossier-grid">
              {executiveDossierMetrics.map(item => (
                <article className="audit-executive-dossier-metric" key={item.label}>
                  <span className="audit-executive-dossier-icon"><Icon name={item.icon} size={16} /></span>
                  <div>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                    <small>{item.copy}</small>
                  </div>
                </article>
              ))}
            </div>
          </details>
        </div>

        <aside className="audit-executive-next-card">
          {nextExecutiveTask ? (
            <>
              <h3>{nextExecutiveTask.label}</h3>
              <details className="audit-inline-details">
                <summary>
                  <span>Por que agir</span>
                  <Icon name="chevron" size={14} />
                </summary>
                <p>{nextExecutiveTask.evidence}</p>
              </details>
              <div className="audit-executive-next-meta">
                <span><Icon name="person" size={14} /> {nextExecutiveTask.owner}</span>
                <span><Icon name="clock" size={14} /> {nextExecutiveTask.due}</span>
              </div>
              <div className="audit-executive-next-actions">
                <a className="btn btn-primary btn-sm" href="#audit-corrective-plan">Ver plano</a>
                <Link className="btn btn-outline btn-sm" to={nextExecutiveTask.to}>Abrir área</Link>
              </div>
            </>
          ) : (
            <>
              <h3>Nenhuma ação pendente</h3>
              <p>A auditoria não encontrou uma próxima ação executiva no momento.</p>
              <a className="btn btn-outline btn-sm" href="#audit-traceability">Ver rastreabilidade</a>
            </>
          )}
        </aside>

        {executiveDossierTasks.length ? (
          <details className="audit-executive-priority-details">
            <summary>
              <span>Ver prioridades executivas</span>
              <strong>{executiveDossierTasks.length}</strong>
              <Icon name="chevron" size={14} />
            </summary>
            <div className="audit-executive-action-strip" aria-label="Prioridades executivas">
            {executiveDossierTasks.map(task => (
              <a className="audit-executive-action-item" href="#audit-corrective-plan" key={`dossier-task-${task.id}`}>
                <span>{riskMeta[task.level].label}</span>
                <strong>{task.label}</strong>
                <small>{task.owner} · {task.due}</small>
              </a>
            ))}
            </div>
          </details>
        ) : null}
      </section>

      <section className="audit-print-report" aria-label="Relatório exportável da auditoria">
        <header className="audit-print-header">
          <div className="audit-print-brand">
            <img src={brandLogo} alt="L'Appui" />
            <div>
              <strong>L'Appui</strong>
              <span>Relatório executivo de auditoria</span>
            </div>
          </div>
          <div className="audit-print-meta">
            <span>Clínica</span>
            <strong>{auditClinicName}</strong>
            <span>Gerado em</span>
            <strong>{reportGeneratedAt}</strong>
          </div>
        </header>

        <section className="audit-print-cover">
          <div className="audit-print-cover-main">
            <span>Auditoria executiva</span>
            <h1>{auditClinicName}</h1>
            <p>{executiveDossierCopy}</p>
          </div>
          <div className="audit-print-score-card">
            <span>Conformidade executiva</span>
            <strong>{executiveScore}%</strong>
            <small>{executiveDossierStatus}</small>
          </div>
          <div className="audit-print-cover-grid">
            {printRiskSummary.map(item => (
              <div key={`print-risk-${item.label}`}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <small>{item.copy}</small>
              </div>
            ))}
          </div>
        </section>

        <section className="audit-print-section">
          <div className="audit-print-section-head">
            <h2>Resumo executivo</h2>
            <span>{executiveScore}% de conformidade</span>
          </div>
          <div className="audit-print-metrics">
            {metrics.map(metric => (
              <div key={`print-${metric.label}`}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
                <small>{metric.copy}</small>
              </div>
            ))}
          </div>
        </section>

        <section className="audit-print-section">
          <div className="audit-print-section-head">
            <h2>Dossiê executivo</h2>
            <span>{executiveDossierStatus}</span>
          </div>
          <div className="audit-print-critical-list">
            <div>
              <strong>Leitura atual</strong>
              <span>{executiveDossierCopy}</span>
            </div>
            <div>
              <strong>Próxima ação</strong>
              <span>{nextExecutiveTask ? `${nextExecutiveTask.label} · ${nextExecutiveTask.owner} · ${nextExecutiveTask.due}` : 'Nenhuma ação pendente no momento.'}</span>
            </div>
            <div>
              <strong>Evidências e trilha</strong>
              <span>{correctiveAttachmentCount} evidência(s) anexada(s) · {traceabilityEventCount} evento(s) recentes.</span>
            </div>
          </div>
        </section>

        <section className="audit-print-section">
          <div className="audit-print-section-head">
            <h2>Prioridades imediatas</h2>
            <span>{printPriorityTasks.length ? `${printPriorityTasks.length} ação(ões)` : 'Sem prioridade ativa'}</span>
          </div>
          {printPriorityTasks.length ? (
            <div className="audit-print-priority-list">
              {printPriorityTasks.map(task => (
                <article key={`print-priority-${task.id}`}>
                  <span>{riskMeta[task.level].label}</span>
                  <strong>{task.label}</strong>
                  <p>{task.evidence}</p>
                  <small>{task.owner} · {task.due} · {correctiveStatusMeta[task.status].label} · {task.attachments.length} evidência(s)</small>
                </article>
              ))}
            </div>
          ) : (
            <p className="audit-print-empty">Nenhuma prioridade ativa no plano corretivo no momento da geração.</p>
          )}
        </section>

        <section className="audit-print-section">
          <div className="audit-print-section-head">
            <h2>Perfil documental aplicado</h2>
            <span>{documentProfileName}</span>
          </div>
          <div className="audit-print-metrics">
            <div>
              <span>Acervo da clínica</span>
              <strong>{docsSummary.recommendedCoveredCount || 0}/{docsSummary.recommendedRequiredCount || 0}</strong>
              <small>{docsSummary.missingCount || 0} documento(s) recomendado(s) faltante(s).</small>
            </div>
            <div>
              <span>Equipe</span>
              <strong>{professionalDocsSummary.coveredCount || 0}/{professionalDocsSummary.requiredCount || 0}</strong>
              <small>{professionalDocsSummary.missingCount || 0} documento(s) por profissional faltante(s).</small>
            </div>
            <div>
              <span>Validade monitorada</span>
              <strong>{(docsSummary.expiring || 0) + (docsSummary.expired || 0) + (professionalDocsSummary.expiring || 0) + (professionalDocsSummary.expired || 0)}</strong>
              <small>Vencidos ou próximos do vencimento entre clínica e equipe.</small>
            </div>
          </div>
        </section>

        <section className="audit-print-section">
          <div className="audit-print-section-head">
            <h2>Plano corretivo</h2>
            <span>{completedCorrectiveCount}/{correctiveTasks.length} concluída(s)</span>
          </div>
          <div className="audit-print-table">
            <div className="audit-print-row audit-print-row-head">
              <span>Ação</span>
              <span>Responsável</span>
              <span>Prazo</span>
              <span>Status</span>
            </div>
            {correctiveTasks.map(task => (
              <div className="audit-print-row" key={`print-task-${task.id}`}>
                <span><strong>{task.label}</strong><small>{task.domainTitle} · {task.evidence}</small></span>
                <span>{task.owner}</span>
                <span>{task.due}</span>
                <span>{correctiveStatusMeta[task.status].label}<small>{task.attachments.length} evidência(s)</small></span>
              </div>
            ))}
          </div>
        </section>

        <section className="audit-print-section">
          <div className="audit-print-section-head">
            <h2>Documentos por profissional</h2>
            <span>{professionalDocsSummary.complianceScore || 0}% de cobertura</span>
          </div>
          {professionalDocsSummary.byProfessional.length ? (
            <div className="audit-print-critical-list">
              {professionalDocsSummary.byProfessional.slice(0, 10).map(item => (
                <div key={`print-professional-docs-${item.professionalId}`}>
                  <strong>{item.professionalName}</strong>
                  <span>{item.score}% · {item.coveredCount}/{item.requiredCount} cobertos · {item.missingCount} faltante(s) · {item.expiredCount + item.expiringCount} alerta(s)</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="audit-print-empty">Nenhum profissional ativo encontrado para leitura documental.</p>
          )}
        </section>

        <section className="audit-print-section">
          <div className="audit-print-section-head">
            <h2>Radar por área</h2>
            <span>{criticalDomainCount ? `${criticalDomainCount} crítica(s)` : 'Operação estável'}</span>
          </div>
          <div className="audit-print-domain-grid">
            {operationalDomains.map(domain => (
              <article key={`print-domain-${domain.id}`}>
                <span>{riskMeta[domain.level].label}</span>
                <strong>{domain.title}</strong>
                <p>{domain.metric}</p>
                <small>{domain.nextAction}</small>
              </article>
            ))}
          </div>
        </section>

        <section className="audit-print-section">
          <div className="audit-print-section-head">
            <h2>Pendências documentais críticas</h2>
            <span>{criticalRows.length ? `${criticalRows.length} pendência(s)` : 'Sem urgências'}</span>
          </div>
          {criticalRows.length ? (
            <div className="audit-print-critical-list">
              {criticalRows.slice(0, 10).map(row => (
                <div key={`print-critical-${row.id}`}>
                  <strong>{row.title}</strong>
                  <span>{row.statusLabel} · {row.categoryLabel} · {importanceMeta[row.importance].label}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="audit-print-empty">Nenhuma pendência crítica no momento da geração do relatório.</p>
          )}
        </section>

        <section className="audit-print-section audit-print-signoff">
          <div className="audit-print-section-head">
            <h2>Fechamento de governança</h2>
            <span>Revisão e evidências</span>
          </div>
          <div className="audit-print-evidence-grid">
            {printGovernanceChecklist.map(item => (
              <div key={`print-governance-${item.label}`}>
                <strong>{item.label}</strong>
                <span>{item.copy}</span>
              </div>
            ))}
          </div>
          <div className="audit-print-signature-grid">
            <div>
              <span>Responsável pela revisão</span>
              <strong>{auditClinicName}</strong>
            </div>
            <div>
              <span>Data de emissão</span>
              <strong>{reportGeneratedAt}</strong>
            </div>
          </div>
        </section>
      </section>

      <AuditProgressiveSection
        className="audit-team-documents-card"
        eyebrow="Equipe e conformidade"
        title="Documentos profissionais sob controle"
        copy="Leitura por profissional para priorizar contrato, certificação, conselho, treinamento e autorização sem abrir várias telas."
        badge={`${professionalDocsSummary.complianceScore || 0}% de cobertura`}
        badgeClass={professionalDocsSummary.missingCount || professionalDocsSummary.expired ? 'badge badge-rose' : 'badge badge-green'}
      >
        <div className="audit-team-document-status-grid">
          <div className={['audit-team-document-status', professionalDocumentBuckets.critical.length ? 'is-critical' : 'is-ok'].join(' ')}>
            <span>Prioridade alta</span>
            <strong>{professionalDocumentBuckets.critical.length}</strong>
            <small>Profissional(is) com documento crítico, faltante ou vencido.</small>
          </div>
          <div className={['audit-team-document-status', professionalDocumentBuckets.attention.length ? 'is-warning' : 'is-ok'].join(' ')}>
            <span>Atenção</span>
            <strong>{professionalDocumentBuckets.attention.length}</strong>
            <small>Profissional(is) com validade próxima do vencimento.</small>
          </div>
          <div className="audit-team-document-status is-ok">
            <span>Em dia</span>
            <strong>{professionalDocumentBuckets.ready.length}</strong>
            <small>Profissional(is) sem alerta documental no momento.</small>
          </div>
          <div className="audit-team-document-status">
            <span>Obrigatórios</span>
            <strong>{professionalDocsSummary.coveredCount || 0}/{professionalDocsSummary.requiredCount || 0}</strong>
            <small>{professionalDocsSummary.missingCount || 0} requisito(s) ainda sem documento anexado.</small>
          </div>
        </div>

        {priorityProfessionalDocuments.length ? (
          <div className="audit-team-document-list">
            {priorityProfessionalDocuments.map(item => (
              <article className="audit-team-document-row" key={`team-doc-${item.professionalId}`}>
                <div>
                  <strong>{item.professionalName}</strong>
                  <span>{item.professionalSpecialty || 'Profissional da clínica'}</span>
                </div>
                <div className="audit-team-document-row-metrics">
                  <span>{item.coveredCount}/{item.requiredCount} cobertos</span>
                  <span>{item.missingCount} faltante(s)</span>
                  <span>{item.expiredCount + item.expiringCount} alerta(s)</span>
                </div>
                <Link className="btn btn-outline btn-sm" to={`/profissionais/${item.professionalId}`}>
                  Revisar ficha
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <div className="audit-team-document-empty">
            <Icon name="shield" size={18} />
            <span>{professionalDocsSummary.activeProfessionals ? 'Equipe sem pendência documental prioritária.' : 'Cadastre profissionais para ativar a auditoria documental da equipe.'}</span>
          </div>
        )}

        {professionalDocumentAlertList.length ? (
          <div className="audit-team-document-alerts" aria-label="Alertas documentais profissionais">
            {professionalDocumentAlertList.map(document => (
              <div key={`professional-doc-alert-${document.id}`}>
                <span>{document.professionalName || 'Profissional'}</span>
                <strong>{document.title}</strong>
                <small>{document.statusLabel}{document.daysUntilExpiry != null ? ` · ${document.daysUntilExpiry} dia(s)` : ''}</small>
              </div>
            ))}
          </div>
        ) : null}
      </AuditProgressiveSection>

      <AuditProgressiveSection
        className="audit-checklist-card"
        id="audit-anvisa-checklist"
        eyebrow="Conformidade Sanitária"
        title="Checklist de Conformidade ANVISA"
        copy="Controle de descarte de resíduos, higienização de cabines e rotina de esterilização. Itens não conformes geram tarefas corretivas automaticamente."
        badge={`${anvisaConformeCount} de ${anvisaChecklistItems.length} conformes`}
        badgeClass={anvisaNonConformeCount ? 'badge badge-red' : 'badge badge-green'}
      >
        <div className="audit-checklist-grid">
          {['Descarte de Resíduos', 'Higienização de Cabines', 'Rotina de Esterilização'].map(category => {
            const items = anvisaChecklistItems.filter(x => x.category === category)
            return (
              <div key={category} className="audit-checklist-category-group">
                <h3 className="audit-checklist-category-title">{category}</h3>
                <div className="audit-checklist-items-list">
                  {items.map(item => {
                    const action = auditCorrectiveActionByKey.get(item.id)
                    const isConforme = !action || action.status === 'DONE' || action.status === 'DISMISSED'
                    const isUpdating = updatingChecklistItemId === item.id

                    return (
                      <div
                        key={item.id}
                        className={`audit-checklist-item-row ${isConforme ? 'is-conforme' : 'is-nao-conforme'}`}
                      >
                        <div className="audit-checklist-item-info">
                          <h4>
                            {item.title}
                            <span className={`badge ${isConforme ? 'badge-green' : 'badge-red'}`}>
                              {isConforme ? 'Conforme' : 'Não Conforme'}
                            </span>
                          </h4>
                          <p>{item.description}</p>
                          {!isConforme && action?.evidence ? (
                            <small className="audit-checklist-item-error">
                              <Icon name="shield" size={12} /> Ação corretiva ativa: {action.evidence}
                            </small>
                          ) : null}
                        </div>

                        <div className="audit-checklist-item-actions">
                          {isUpdating ? (
                            <span className="spinner" />
                          ) : (
                            <>
                              <button
                                type="button"
                                className={`btn btn-sm ${isConforme ? 'btn-primary' : 'btn-outline'}`}
                                onClick={() => void handleChecklistStatusChange(item.id, true)}
                                disabled={isConforme}
                              >
                                <Icon name="check" /> Conforme
                              </button>
                              <button
                                type="button"
                                className={`btn btn-sm ${!isConforme ? 'btn-primary btn-danger-action' : 'btn-outline'}`}
                                onClick={() => void handleChecklistStatusChange(item.id, false)}
                                disabled={!isConforme}
                              >
                                <Icon name="x" /> Não Conforme
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </AuditProgressiveSection>

      <AuditProgressiveSection
        className="audit-corrective-plan"
        id="audit-corrective-plan"
        eyebrow="Plano corretivo"
        title="Ações com responsável e prazo"
        copy="Resumo operacional das tarefas que nasceram do radar, priorizadas por risco e prontas para execução."
        badge={`${completedCorrectiveCount}/${correctiveTasks.length} concluída(s)`}
      >
        <div className="audit-corrective-toolbar" aria-label="Filtros do plano corretivo">
          {correctiveFilterOptions.map(option => (
            <button
              key={option.value}
              className={`audit-corrective-filter-btn ${correctiveStatusFilter === option.value ? 'is-active' : ''}`}
              type="button"
              onClick={() => setCorrectiveStatusFilter(option.value)}
            >
              <span>{option.label}</span>
              <strong>{option.count}</strong>
            </button>
          ))}
        </div>
        <div className="audit-corrective-list">
          {visibleCorrectiveTasks.length ? primaryCorrectiveTasks.map(task => (
            <AuditCorrectiveTaskCard
              key={task.id}
              task={task}
              saving={savingCorrectiveTaskKey === task.taskKey}
              uploading={uploadingCorrectiveTaskKey === task.taskKey}
              loadingAttachmentId={loadingCorrectiveAttachmentId}
              deletingAttachmentId={deletingCorrectiveAttachmentId}
              onStatusChange={handleCorrectiveStatusChange}
              onEdit={openCorrectiveEdit}
              onAttach={handleCorrectiveAttachmentUpload}
              onDownloadTemplate={handleDownloadCorrectiveTemplate}
              onDownloadAttachment={handleDownloadCorrectiveAttachment}
              onDeleteAttachment={handleDeleteCorrectiveAttachment}
              history={correctiveHistoryByTaskKey.get(task.taskKey) || []}
            />
          )) : (
            <div className="audit-corrective-empty">
              <Icon name="check" size={18} />
              <span>Nenhuma acao neste filtro.</span>
            </div>
          )}
          {secondaryCorrectiveTasks.length ? (
            <details className="audit-corrective-more">
              <summary>
                <span>Ver mais {secondaryCorrectiveTasks.length} ação(ões)</span>
                <Icon name="chevron" size={15} />
              </summary>
              <div className="audit-corrective-more-list">
                {secondaryCorrectiveTasks.map(task => (
                  <AuditCorrectiveTaskCard
                    key={task.id}
                    task={task}
                    saving={savingCorrectiveTaskKey === task.taskKey}
                    uploading={uploadingCorrectiveTaskKey === task.taskKey}
                    loadingAttachmentId={loadingCorrectiveAttachmentId}
                    deletingAttachmentId={deletingCorrectiveAttachmentId}
                    onStatusChange={handleCorrectiveStatusChange}
                    onEdit={openCorrectiveEdit}
                    onAttach={handleCorrectiveAttachmentUpload}
                    onDownloadTemplate={handleDownloadCorrectiveTemplate}
                    onDownloadAttachment={handleDownloadCorrectiveAttachment}
                    onDeleteAttachment={handleDeleteCorrectiveAttachment}
                    history={correctiveHistoryByTaskKey.get(task.taskKey) || []}
                  />
                ))}
              </div>
            </details>
          ) : null}
        </div>
      </AuditProgressiveSection>

      <AuditProgressiveSection
        className="audit-executive-radar"
        eyebrow="Radar de prioridades"
        title="Onde a clínica precisa agir primeiro"
        copy="Cada bloco resume uma frente do SaaS, mostra o motivo da classificação e leva direto para a área responsável pela correção."
        badge={criticalDomainCount ? `${criticalDomainCount} crítica(s)` : warningDomainCount ? `${warningDomainCount} em atenção` : 'Operação estável'}
        badgeClass={criticalDomainCount ? 'badge badge-red' : warningDomainCount ? 'badge badge-gold' : 'badge badge-green'}
      >
        <div className="audit-domain-grid">
          {operationalDomains.map(domain => <AuditDomainCard key={domain.id} domain={domain} />)}
        </div>
      </AuditProgressiveSection>

      <AuditProgressiveSection
        className="audit-document-evidence"
        id="audit-document-evidence"
        eyebrow="Evidências documentais"
        title="Documentos, alertas e consentimentos"
        copy="Filtros, pendências, documentos sensíveis e acervo completo continuam disponíveis para análise profunda."
        badge={`${filteredRows.length} item(ns)`}
      >
      <section className="audit-document-profile-card card">
        <div>
          <span className="eyebrow">Perfil documental aplicado</span>
          <h2 className="section-title">{documentProfileName}</h2>
          <p className="section-copy">
            A lista de ausentes considera a base geral e os procedimentos marcados no perfil da clínica.
          </p>
        </div>
        <div className="audit-document-profile-metrics">
          <span className="badge badge-muted">{docsSummary.profile?.requiredBaseCount ?? 0} base</span>
          <span className="badge badge-muted">{docsSummary.profile?.specializedRequirementCount ?? 0} específico(s)</span>
          <span className={docsSummary.missingCount ? 'badge badge-gold' : 'badge badge-green'}>
            {docsSummary.missingCount ? `${docsSummary.missingCount} faltante(s)` : 'Cobertura completa'}
          </span>
        </div>
        <Link className="btn btn-outline btn-sm" to="/documentos">
          <Icon name="clipboard" /> Ajustar perfil
        </Link>
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
      </AuditProgressiveSection>

      <AuditProgressiveSection
        className="audit-traceability-section"
        id="audit-traceability"
        eyebrow="Rastreabilidade"
        title="Eventos recentes da auditoria"
        copy="Histórico técnico permanece disponível para comprovar acessos, geração de PDFs, consentimentos e ações sensíveis."
        badge={`${logsTotal} eventos`}
      >
      <section className="audit-event-list" aria-live="polite">
        <div className="audit-logs-filter-bar card">
          <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', alignItems: 'end' }}>
            <div className="form-group">
              <label className="form-label">Buscar termos</label>
              <div className="input-with-icon-wrapper" style={{ position: 'relative' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ex: suporte, cliente, pdf..."
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  style={{ width: '100%', paddingLeft: '36px' }}
                />
                <span className="input-icon">
                  <Icon name="search" size={16} />
                </span>
              </div>
            </div>
            
            <div className="form-group">
              <label className="form-label">Data Inicial</label>
              <input
                type="date"
                className="form-input"
                value={fromInput}
                onChange={e => setFromInput(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Data Final</label>
              <input
                type="date"
                className="form-input"
                value={toInput}
                onChange={e => setToInput(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>

            <div className="form-group" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleApplyFilters}
                disabled={logsLoading || loading}
                style={{ flex: '1 1 auto', height: '42px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                {logsLoading ? <span className="spinner" /> : <Icon name="search" size={14} />}
                Filtrar
              </button>
              
              <button
                type="button"
                className="btn btn-outline"
                onClick={handleClearFilters}
                disabled={logsLoading || loading}
                style={{ flex: '1 1 auto', height: '42px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                <Icon name="x" size={14} />
                Limpar
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '16px', borderTop: '1px solid rgba(182, 137, 77, 0.1)', paddingTop: '16px', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="text-muted" style={{ fontSize: '0.85rem' }}>
              Mostrando <strong>{logs.length}</strong> de <strong>{logsTotal}</strong> eventos.
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={exportToCSV}
                disabled={logs.length === 0}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Icon name="download" size={14} />
                Exportar CSV
              </button>
              
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={exportToPDF}
                disabled={logs.length === 0}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Icon name="fileText" size={14} />
                Exportar PDF
              </button>
            </div>
          </div>
        </div>

        <div className="audit-timeline-container" style={{ position: 'relative', paddingLeft: '24px', margin: '20px 0' }}>
          <div className="audit-timeline-line" style={{ position: 'absolute', left: '7px', top: '24px', bottom: '24px', width: '2px', background: 'linear-gradient(180deg, #e3d2bd 0%, rgba(227, 210, 189, 0.1) 100%)' }} />
          
          {logsLoading && logs.length === 0 ? (
            <div className="loading-page loading-page-inline"><span className="spinner" /> Carregando eventos...</div>
          ) : logs.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {logs.map((log) => {
                const severity = log.severity || 'LOW'
                return (
                  <div key={log.id} className="audit-timeline-item" style={{ position: 'relative' }}>
                    <div className="audit-timeline-dot" style={{
                      position: 'absolute',
                      left: '-23px',
                      top: '24px',
                      width: '12px',
                      height: '12px',
                      borderRadius: '50%',
                      background: severity === 'HIGH' ? '#8b362a' : severity === 'MEDIUM' ? '#95611f' : '#2f725d',
                      border: '3px solid #fffdfa',
                      boxShadow: '0 0 0 2px rgba(182, 137, 77, 0.2)'
                    }} />
                    <AuditEvent log={log} />
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="empty empty-tight">
              <div className="empty-icon"><Icon name="shield" size={24} /></div>
              <h3>Nenhum evento encontrado</h3>
              <p>Não encontramos eventos com os filtros aplicados.</p>
            </div>
          )}
        </div>

        {logs.length < logsTotal && !logsLoading && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '24px' }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={handleLoadMore}
              style={{ minWidth: '200px' }}
            >
              Carregar mais
            </button>
          </div>
        )}
        {logsLoading && logs.length > 0 && (
          <div className="loading-page loading-page-inline" style={{ marginTop: '16px' }}>
            <span className="spinner" /> Carregando mais eventos...
          </div>
        )}
      </section>
      </AuditProgressiveSection>

      {editingCorrectiveTask ? (
        <div className="modal-backdrop" onClick={event => event.target === event.currentTarget && closeCorrectiveEdit()}>
          <div className="modal">
            <h2 className="modal-title">Ajustar ação corretiva</h2>
            <p className="section-copy">
              Atualize apenas o responsável e o prazo. O conteúdo da ação e a rastreabilidade continuam preservados na Auditoria.
            </p>

            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Responsável</label>
                <input
                  className="form-input"
                  value={correctiveEditForm.owner}
                  onChange={event => setCorrectiveEditForm(current => ({ ...current, owner: event.target.value }))}
                  placeholder="Ex: Responsável técnico"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Prazo exibido</label>
                <input
                  className="form-input"
                  value={correctiveEditForm.dueLabel}
                  onChange={event => setCorrectiveEditForm(current => ({ ...current, dueLabel: event.target.value }))}
                  placeholder="Ex: 48h, até sexta-feira"
                />
              </div>

              <div className="form-group form-full">
                <label className="form-label">Data limite opcional</label>
                <input
                  className="form-input"
                  type="date"
                  value={correctiveEditForm.dueAt}
                  onChange={event => setCorrectiveEditForm(current => ({ ...current, dueAt: event.target.value }))}
                />
              </div>

              <div className="form-group form-full">
                <label className="form-label">Evidência ou observação</label>
                <textarea
                  className="form-textarea"
                  value={correctiveEditForm.evidence}
                  onChange={event => setCorrectiveEditForm(current => ({ ...current, evidence: event.target.value }))}
                  placeholder="Ex: protocolo revisado, documento solicitado, comprovante em análise"
                  rows={3}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-outline" onClick={closeCorrectiveEdit} disabled={savingCorrectiveDetails}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void handleSaveCorrectiveDetails()} disabled={savingCorrectiveDetails}>
                {savingCorrectiveDetails ? <span className="spinner" /> : 'Salvar ajuste'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
