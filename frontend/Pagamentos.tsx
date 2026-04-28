import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import api, { getApiErrorMessage } from './api'
import { useAuth } from './useAuth'
import { Icon, type IconName } from './Icon'
import { getClinicBranding } from './branding'
import { isImpersonating } from './support'
import type { Identifier } from './clinicalTypes'
import type {
  AuditLogItem,
  AuditLogsResponse,
  BillingStatusKey,
  BillingGatewayIntentResponse,
  BillingGatewayStatusResponse,
  BillingSummaryResponse,
  ClinicBillItem,
  ClinicBillsResponse,
  ClinicStatusKey,
} from './operationsTypes'

type BillingTone = 'default' | 'gold' | 'rose' | 'green'
type BillModalMode = 'create' | 'edit' | null

interface BadgeMeta {
  label: string
  className: string
}

interface BillingOverviewMetricProps {
  label: string
  value: string
  helper: string
  tone?: BillingTone
}

interface BillCardProps {
  bill: ClinicBillItem
  onEdit: (bill: ClinicBillItem) => void
  onMarkPaid: (billId: Identifier) => void
  onDelete: (billId: Identifier) => void
}

interface AuditTimelineItemProps {
  log: AuditLogItem
}

interface BillingConfigFormState {
  amount: string
  nextDueAt: string
  reference: string
  notes: string
}

interface BillFormState {
  title: string
  category: string
  amount: string
  dueAt: string
  notes: string
}

const billingMeta: Record<BillingStatusKey, BadgeMeta> = {
  TRIAL: { label: 'Cortesia ativa', className: 'badge badge-blue' },
  ACTIVE: { label: 'Pagamento em dia', className: 'badge badge-green' },
  OVERDUE: { label: 'Pagamento pendente', className: 'badge badge-gold' },
  BLOCKED: { label: 'Acesso bloqueado', className: 'badge badge-red' },
}

const clinicStatusMeta: Record<ClinicStatusKey, BadgeMeta> = {
  ACTIVE: { label: 'Operacao ativa', className: 'badge badge-green' },
  SUSPENDED: { label: 'Operacao suspensa', className: 'badge badge-gold' },
  ARCHIVED: { label: 'Clinica arquivada', className: 'badge badge-muted' },
}

const auditActionMeta: Record<string, { label: string; icon: IconName }> = {
  AUTH_REGISTER: { label: 'Cadastro inicial', icon: 'sparkles' },
  SUPPORT_ASSUME_CLINIC: { label: 'Acesso do suporte', icon: 'dashboard' },
  BILLING_CONFIG_UPDATED: { label: 'Assinatura ajustada', icon: 'edit' },
  BILLING_MARKED_PAID: { label: 'Pagamento confirmado', icon: 'check' },
  BILLING_GATEWAY_INTENT_CREATED: { label: 'Cobranca preparada', icon: 'dollar' },
  BILLING_GATEWAY_PAYMENT_CONFIRMED: { label: 'Gateway confirmado', icon: 'check' },
  BILLING_GATEWAY_WEBHOOK_RECEIVED: { label: 'Webhook financeiro', icon: 'refresh' },
}

const billCategories = [
  'Aluguel',
  'Folha',
  'Insumos',
  'Impostos',
  'Marketing',
  'Agua e luz',
  'Manutencao',
  'Fornecedores',
  'Outros',
]

const emptyBillForm: BillFormState = {
  title: '',
  category: '',
  amount: '',
  dueAt: '',
  notes: '',
}

const emptyBillingSnapshot: BillingSummaryResponse['billing'] = {
  status: 'TRIAL',
  effectiveStatus: 'TRIAL',
  blocked: false,
  amount: null,
  reference: null,
  notes: null,
  graceEndsAt: null,
  lastPaidAt: null,
  nextDueAt: null,
  blockAt: null,
  daysRemaining: null,
  message: 'Dados de assinatura parcialmente indisponiveis. A central financeira continua acessivel para regularizacao.',
}

type BillingSnapshotLike = Partial<BillingSummaryResponse['billing']> | null | undefined

function normalizeBillingSnapshot(primary: BillingSnapshotLike, fallback: BillingSnapshotLike = null): BillingSummaryResponse['billing'] {
  return {
    ...emptyBillingSnapshot,
    ...(fallback || {}),
    ...(primary || {}),
  }
}

function normalizeBillingSummary(
  data: Partial<BillingSummaryResponse> | null | undefined,
  userBilling: BillingSnapshotLike
): BillingSummaryResponse {
  return {
    clinicId: data?.clinicId ?? null,
    clinicName: data?.clinicName || '',
    email: data?.email || '',
    billing: normalizeBillingSnapshot(data?.billing, userBilling),
    permissions: {
      canManageSubscription: Boolean(data?.permissions?.canManageSubscription),
    },
  }
}

const emptyBillingConfigForm: BillingConfigFormState = {
  amount: '',
  nextDueAt: '',
  reference: '',
  notes: '',
}

const emptyBillsDashboard: ClinicBillsResponse = {
  openCount: 0,
  overdueCount: 0,
  paidCount: 0,
  totalOpenAmount: 0,
  overdueAmount: 0,
  paidThisMonthAmount: 0,
  bills: [],
}

function formatCurrency(value: number | string | null | undefined): string {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function formatDate(value?: string | Date | null): string {
  if (!value) return 'Nao definido'

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
  }).format(new Date(value))
}

function formatDateTime(value?: string | Date | null): string {
  if (!value) return 'Sem registro'

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

function getBillingStatus(status?: string | null): BadgeMeta {
  if (status && status in billingMeta) {
    return billingMeta[status as BillingStatusKey]
  }

  return billingMeta.TRIAL
}

function getClinicStatus(status?: string | null): BadgeMeta {
  if (status && status in clinicStatusMeta) {
    return clinicStatusMeta[status as ClinicStatusKey]
  }

  return clinicStatusMeta.ACTIVE
}

function getAuditAction(action?: string | null): { label: string; icon: IconName } {
  if (action && action in auditActionMeta) {
    return auditActionMeta[action]
  }

  return { label: 'Acao registrada', icon: 'clipboard' }
}

function getMetadataRecord(log: AuditLogItem): Record<string, unknown> {
  return log.metadata && typeof log.metadata === 'object' ? log.metadata : {}
}

function getMetadataString(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key]
  return typeof value === 'string' && value.trim() ? value : null
}

function getMetadataNumber(metadata: Record<string, unknown>, key: string): number | null {
  const value = metadata[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function formatAuditActor(log: AuditLogItem): string {
  if (log.actorRole === 'SUPPORT') return 'Suporte tecnico'
  return log.actorEmail || 'Sistema'
}

function describeAuditLog(log: AuditLogItem): string {
  const metadata = getMetadataRecord(log)

  if (log.action === 'AUTH_REGISTER') {
    const clinicLabel = getMetadataString(metadata, 'clinicName') || 'a clinica'
    const emailValue = getMetadataString(metadata, 'email')
    const emailLabel = emailValue ? ` com o e-mail ${emailValue}` : ''
    return `Cadastro inicial de ${clinicLabel}${emailLabel}.`
  }

  if (log.action === 'SUPPORT_ASSUME_CLINIC') {
    const clinicEmail = getMetadataString(metadata, 'clinicEmail')
    const emailLabel = clinicEmail ? ` da conta ${clinicEmail}` : ''
    return `Ambiente assumido pelo suporte para manutencao e diagnostico${emailLabel}.`
  }

  if (log.action === 'BILLING_CONFIG_UPDATED') {
    const parts: string[] = []
    const amount = getMetadataNumber(metadata, 'amount')
    const nextDueAt = getMetadataString(metadata, 'nextDueAt')
    const reference = getMetadataString(metadata, 'reference')

    if (amount != null) parts.push(`valor ${formatCurrency(amount)}`)
    if (nextDueAt) parts.push(`proximo vencimento em ${formatDate(nextDueAt)}`)
    if (reference) parts.push(`referencia ${reference}`)

    return parts.length
      ? `Configuracao da assinatura atualizada com ${parts.join(', ')}.`
      : 'Configuracao da assinatura atualizada.'
  }

  if (log.action === 'BILLING_MARKED_PAID') {
    const parts: string[] = []
    const amount = getMetadataNumber(metadata, 'amount')
    const nextDueAt = getMetadataString(metadata, 'nextDueAt')
    const paidAt = getMetadataString(metadata, 'paidAt')

    if (amount != null) parts.push(`valor ${formatCurrency(amount)}`)
    if (nextDueAt) parts.push(`novo vencimento em ${formatDate(nextDueAt)}`)
    if (paidAt) parts.push(`baixa registrada em ${formatDateTime(paidAt)}`)

    return parts.length
      ? `Pagamento confirmado com ${parts.join(', ')}.`
      : 'Pagamento da assinatura confirmado.'
  }

  if (log.action === 'BILLING_GATEWAY_INTENT_CREATED' || log.action === 'BILLING_GATEWAY_PAYMENT_CONFIRMED' || log.action === 'BILLING_GATEWAY_WEBHOOK_RECEIVED') {
    const intent = metadata.intent && typeof metadata.intent === 'object' ? metadata.intent as Record<string, unknown> : metadata
    const reference = getMetadataString(intent, 'reference')
    const amount = getMetadataNumber(intent, 'amount')
    const status = getMetadataString(intent, 'status')
    const provider = getMetadataString(intent, 'provider')
    const parts: string[] = []

    if (reference) parts.push(`referencia ${reference}`)
    if (amount != null) parts.push(`valor ${formatCurrency(amount)}`)
    if (status) parts.push(`status ${status}`)
    if (provider) parts.push(`provedor ${provider}`)

    return parts.length
      ? `Evento de gateway financeiro com ${parts.join(', ')}.`
      : 'Evento de gateway financeiro registrado.'
  }

  return 'Evento registrado para rastreabilidade do modulo financeiro.'
}

function BillingOverviewMetric({ label, value, helper, tone = 'default' }: BillingOverviewMetricProps) {
  return (
    <article className={`billing-overview-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{helper}</small>
    </article>
  )
}

function BillCard({ bill, onEdit, onMarkPaid, onDelete }: BillCardProps) {
  const badgeClass = bill.status === 'PAID' ? 'badge-green' : bill.status === 'OVERDUE' ? 'badge-red' : 'badge-gold'

  return (
    <article className="billing-bill-card">
      <div className="billing-bill-head">
        <div>
          <span className="billing-bill-category">{bill.category || 'Conta operacional da clinica'}</span>
          <h3 className="billing-bill-title">{bill.title}</h3>
        </div>

        <div className="document-badge-stack">
          <span className={`badge ${badgeClass}`}>{bill.statusLabel}</span>
        </div>
      </div>

      <div className="billing-bill-grid">
        <div className="billing-bill-metric">
          <span>Valor</span>
          <strong>{formatCurrency(bill.amount)}</strong>
        </div>
        <div className="billing-bill-metric">
          <span>Vencimento</span>
          <strong>{formatDate(bill.dueAt)}</strong>
        </div>
        <div className="billing-bill-metric">
          <span>Pagamento</span>
          <strong>{bill.paidAt ? formatDate(bill.paidAt) : 'Pendente'}</strong>
        </div>
      </div>

      {bill.notes ? (
        <div className="billing-bill-note">
          <strong>Observacoes</strong>
          <p>{bill.notes}</p>
        </div>
      ) : null}

      <div className="billing-bill-actions">
        <button type="button" className="btn btn-outline btn-sm" onClick={() => onEdit(bill)}>
          <Icon name="edit" /> Editar
        </button>
        {bill.status !== 'PAID' ? (
          <button type="button" className="btn btn-gold btn-sm" onClick={() => onMarkPaid(bill.id)}>
            <Icon name="check" /> Marcar como paga
          </button>
        ) : null}
        <button type="button" className="btn btn-ghost btn-sm danger-ghost" onClick={() => onDelete(bill.id)}>
          <Icon name="trash" /> Remover
        </button>
      </div>
    </article>
  )
}

function AuditTimelineItem({ log }: AuditTimelineItemProps) {
  const action = getAuditAction(log.action)

  return (
    <li className="audit-timeline-item">
      <div className="audit-timeline-icon">
        <Icon name={action.icon} size={18} />
      </div>

      <div className="audit-timeline-copy">
        <div className="audit-timeline-head">
          <strong>{action.label}</strong>
          <span>{formatDateTime(log.createdAt)}</span>
        </div>

        <p>{describeAuditLog(log)}</p>
        <small>
          {formatAuditActor(log)}
          {log.entityType ? ` Ã¢â‚¬Â¢ ${log.entityType}` : ''}
        </small>
      </div>
    </li>
  )
}

export default function Pagamentos() {
  const { user, refreshUser } = useAuth()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [savingConfig, setSavingConfig] = useState(false)
  const [markingPaid, setMarkingPaid] = useState(false)
  const [creatingGatewayIntent, setCreatingGatewayIntent] = useState(false)
  const [simulatingGatewayPayment, setSimulatingGatewayPayment] = useState(false)
  const [savingBill, setSavingBill] = useState(false)
  const [summary, setSummary] = useState<BillingSummaryResponse | null>(null)
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([])
  const [billsData, setBillsData] = useState<ClinicBillsResponse>(emptyBillsDashboard)
  const [gatewayStatus, setGatewayStatus] = useState<BillingGatewayStatusResponse | null>(null)
  const [billModal, setBillModal] = useState<BillModalMode>(null)
  const [selectedBill, setSelectedBill] = useState<ClinicBillItem | null>(null)
  const [billForm, setBillForm] = useState<BillFormState>(emptyBillForm)
  const [form, setForm] = useState<BillingConfigFormState>(emptyBillingConfigForm)
  const { clinicName, brandLogo } = getClinicBranding(user)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setLoadError(null)

    try {
      const [{ data: summaryData }, { data: billsResponse }] = await Promise.all([
        api.get<BillingSummaryResponse>('/billing/summary'),
        api.get<ClinicBillsResponse>('/billing/bills'),
      ])

      let nextAuditLogs: AuditLogItem[] = []
      try {
        const { data: auditResponse } = await api.get<AuditLogsResponse>('/clinic/audit-logs?limit=8')
        nextAuditLogs = auditResponse.logs || []
      } catch {
        nextAuditLogs = []
      }

      let nextGatewayStatus: BillingGatewayStatusResponse | null = null
      try {
        const { data: gatewayResponse } = await api.get<BillingGatewayStatusResponse>('/billing/gateway/status')
        nextGatewayStatus = gatewayResponse
      } catch {
        nextGatewayStatus = null
      }

      const normalizedSummary = normalizeBillingSummary(summaryData, user?.billing)
      const billing = normalizedSummary.billing

      setSummary(normalizedSummary)
      setBillsData(billsResponse)
      setGatewayStatus(nextGatewayStatus)
      setAuditLogs(nextAuditLogs)
      setForm({
        amount: billing.amount != null ? String(billing.amount) : '',
        nextDueAt: billing.nextDueAt ? String(billing.nextDueAt).slice(0, 10) : '',
        reference: billing.reference || '',
        notes: billing.notes || '',
      })
    } catch (error) {
      const message = getApiErrorMessage(error, 'Nao foi possivel carregar a central financeira')
      setLoadError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [user?.billing])

  useEffect(() => {
    void load()
  }, [load])

  const statusMeta = useMemo(() => getBillingStatus(summary?.billing?.effectiveStatus), [summary?.billing?.effectiveStatus])
  const clinicStatus = useMemo(() => getClinicStatus(user?.clinicStatus), [user?.clinicStatus])
  const canManageSubscription = Boolean(summary?.permissions?.canManageSubscription || isImpersonating(user))
  const clinicIdentifier = summary?.clinicId ?? user?.clinicId ?? 'Nao definido'
  const latestGatewayIntent = gatewayStatus?.latestIntent || null
  const latestGatewayIntentStatus = latestGatewayIntent?.status || null
  const gatewayStatusLabel = latestGatewayIntentStatus === 'PAID'
    ? 'Pagamento confirmado'
    : latestGatewayIntentStatus === 'PENDING'
      ? 'Cobranca pendente'
      : latestGatewayIntentStatus === 'FAILED'
        ? 'Falha no pagamento'
        : latestGatewayIntentStatus === 'CANCELLED'
          ? 'Cobranca cancelada'
          : latestGatewayIntentStatus === 'EXPIRED'
            ? 'Cobranca expirada'
            : 'Pronto para gateway'
  const gatewayBadgeClass = latestGatewayIntentStatus === 'PAID'
    ? 'badge badge-green'
    : latestGatewayIntentStatus === 'PENDING'
      ? 'badge badge-gold'
      : latestGatewayIntentStatus === 'FAILED' || latestGatewayIntentStatus === 'CANCELLED' || latestGatewayIntentStatus === 'EXPIRED'
        ? 'badge badge-red'
        : 'badge badge-muted'

  function setField(key: keyof BillingConfigFormState) {
    return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm(current => ({ ...current, [key]: event.target.value }))
    }
  }

  function setBillField(key: keyof BillFormState) {
    return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setBillForm(current => ({ ...current, [key]: event.target.value }))
    }
  }

  function openCreateBill() {
    setSelectedBill(null)
    setBillForm(emptyBillForm)
    setBillModal('create')
  }

  function openEditBill(bill: ClinicBillItem) {
    setSelectedBill(bill)
    setBillForm({
      title: bill.title || '',
      category: bill.category || '',
      amount: bill.amount != null ? String(bill.amount) : '',
      dueAt: bill.dueAt ? String(bill.dueAt).slice(0, 10) : '',
      notes: bill.notes || '',
    })
    setBillModal('edit')
  }

  async function handleSaveConfig(): Promise<void> {
    if (!canManageSubscription) {
      toast.error('Somente o suporte pode alterar a assinatura da plataforma')
      return
    }

    setSavingConfig(true)

    try {
      await api.put<BillingSummaryResponse>('/billing/config', {
        amount: form.amount ? Number(form.amount) : null,
        nextDueAt: form.nextDueAt || undefined,
        reference: form.reference,
        notes: form.notes,
      })

      await Promise.all([load(), refreshUser()])
      toast.success('Configuracao da assinatura atualizada')
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Nao foi possivel atualizar a assinatura da plataforma'))
    } finally {
      setSavingConfig(false)
    }
  }

  async function handleMarkPaid(): Promise<void> {
    if (!canManageSubscription) {
      toast.error('Somente o suporte pode confirmar o pagamento da assinatura')
      return
    }

    setMarkingPaid(true)

    try {
      await api.post<BillingSummaryResponse>('/billing/mark-paid', {
        amount: form.amount ? Number(form.amount) : undefined,
        nextDueAt: form.nextDueAt || undefined,
      })

      await Promise.all([load(), refreshUser()])
      toast.success('Assinatura marcada como paga e acesso reativado')
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Nao foi possivel registrar o pagamento da assinatura'))
    } finally {
      setMarkingPaid(false)
    }
  }

  async function handleCreateGatewayIntent(): Promise<void> {
    const parsedAmount = form.amount ? Number(form.amount) : Number(summary?.billing?.amount || 0)

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error('Defina o valor da assinatura antes de gerar a cobranca')
      return
    }

    setCreatingGatewayIntent(true)

    try {
      const { data } = await api.post<BillingGatewayIntentResponse>('/billing/gateway/intents', {
        method: 'PIX',
        amount: parsedAmount,
        dueAt: form.nextDueAt || undefined,
      })

      setGatewayStatus(current => ({
        provider: current?.provider || data.intent.provider || 'MANUAL_READY',
        mode: current?.mode || 'provider_agnostic',
        configured: Boolean(current?.configured),
        webhookConfigured: Boolean(current?.webhookConfigured),
        latestIntent: data.intent,
        message: current?.message || 'Cobranca preparada para gateway financeiro.',
      }))
      await Promise.all([load(), refreshUser()])
      toast.success('Cobranca da assinatura preparada')
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Nao foi possivel preparar a cobranca da assinatura'))
    } finally {
      setCreatingGatewayIntent(false)
    }
  }

  async function handleSimulateGatewayPayment(): Promise<void> {
    if (!canManageSubscription) {
      toast.error('Somente o suporte pode simular recebimento de gateway')
      return
    }

    if (!latestGatewayIntent?.reference) {
      toast.error('Gere uma cobranca antes de simular o recebimento')
      return
    }

    if (!window.confirm('Simular recebimento desta cobranca e reativar a assinatura?')) return

    setSimulatingGatewayPayment(true)

    try {
      await api.post<BillingGatewayIntentResponse>('/billing/gateway/intents/' + latestGatewayIntent.reference + '/simulate-paid', {
        amount: latestGatewayIntent.amount || (form.amount ? Number(form.amount) : undefined),
        nextDueAt: form.nextDueAt || undefined,
      })

      await Promise.all([load(), refreshUser()])
      toast.success('Recebimento simulado e assinatura atualizada')
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Nao foi possivel simular o recebimento'))
    } finally {
      setSimulatingGatewayPayment(false)
    }
  }

  async function handleSaveBill(): Promise<void> {
    if (!billForm.title.trim() || !billForm.amount || !billForm.dueAt) {
      toast.error('Titulo, valor e vencimento sao obrigatorios')
      return
    }

    const parsedAmount = Number(billForm.amount)

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error('Informe um valor valido para continuar')
      return
    }

    if (billModal === 'edit' && !selectedBill) {
      toast.error('Selecione uma conta valida para continuar')
      return
    }

    setSavingBill(true)

    try {
      const payload = {
        title: billForm.title.trim(),
        category: billForm.category,
        amount: parsedAmount,
        dueAt: billForm.dueAt,
        notes: billForm.notes.trim(),
      }

      if (billModal === 'create') {
        await api.post<ClinicBillItem>('/billing/bills', payload)
        toast.success('Conta cadastrada com sucesso')
      } else if (selectedBill) {
        await api.put<ClinicBillItem>(`/billing/bills/${selectedBill.id}`, payload)
        toast.success('Conta atualizada com sucesso')
      }

      setBillModal(null)
      setSelectedBill(null)
      setBillForm(emptyBillForm)
      await load()
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Nao foi possivel salvar esta conta'))
    } finally {
      setSavingBill(false)
    }
  }

  async function handleMarkBillPaid(billId: Identifier): Promise<void> {
    try {
      await api.post<ClinicBillItem>(`/billing/bills/${billId}/mark-paid`)
      toast.success('Conta marcada como paga')
      await load()
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Nao foi possivel registrar esta baixa'))
    }
  }

  async function handleDeleteBill(billId: Identifier): Promise<void> {
    if (!window.confirm('Deseja remover esta conta da clinica?')) return

    try {
      await api.delete<{ ok: boolean }>(`/billing/bills/${billId}`)
      toast.success('Conta removida com sucesso')
      await load()
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Nao foi possivel remover esta conta'))
    }
  }

  if (loading) {
    return (
      <div className="page">
        <div className="loading-page">
          <span className="spinner" />
          Preparando a central financeira...
        </div>
      </div>
    )
  }

  if (loadError || !summary) {
    return (
      <div className="page billing-page">
        <section className="card section-card billing-empty-state">
          <div className="empty-icon">
            <Icon name="dollar" size={24} />
          </div>
          <span className="eyebrow">Assinatura e contas</span>
          <h1 className="section-title">Nao conseguimos abrir a central financeira</h1>
          <p className="section-copy">
            {loadError || 'A resposta da API veio vazia. Tente carregar novamente antes de acionar o suporte.'}
          </p>
          <div className="billing-empty-actions">
            <button type="button" className="btn btn-primary" onClick={() => void load()}>
              <Icon name="refresh" /> Tentar novamente
            </button>
            <Link to="/contatar-suporte" className="btn btn-outline">
              <Icon name="mail" /> Falar com suporte
            </Link>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="page billing-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Assinatura e contas</h1>
          <p className="page-subtitle">
            Centralize assinatura, despesas operacionais e baixas financeiras da clinica em um unico painel.
          </p>
        </div>

        <div className="document-badge-stack">
          <span className={statusMeta.className}>{statusMeta.label}</span>
          <span className={clinicStatus.className}>{clinicStatus.label}</span>
        </div>
      </div>

      <section className="card brand-plaque billing-brand-card">
        <div className="brand-plaque-logo">
          <img src={brandLogo} alt={`Logo de ${clinicName}`} />
        </div>
        <div>
          <span className="eyebrow">Centro financeiro</span>
          <h2 className="section-title">{clinicName}</h2>
          <p className="section-copy">
            Contas da clinica, assinatura do sistema e rastreabilidade das acoes organizadas com leitura rapida e controle centralizado.
          </p>
          <div className="billing-brand-meta">
            <span className={statusMeta.className}>{statusMeta.label}</span>
            <span className={clinicStatus.className}>{clinicStatus.label}</span>
            <span className="badge badge-muted">ID da clinica {clinicIdentifier}</span>
          </div>
        </div>
      </section>

      <section className="billing-overview-strip" aria-label="Resumo financeiro">
        <BillingOverviewMetric
          label="Contas em aberto"
          value={formatCurrency(billsData.totalOpenAmount)}
          helper={`${billsData.openCount} conta(s) aguardando baixa financeira.`}
          tone="gold"
        />
        <BillingOverviewMetric
          label="Contas em atraso"
          value={formatCurrency(billsData.overdueAmount)}
          helper={billsData.overdueCount ? `${billsData.overdueCount} pendencia(s) vencida(s).` : 'Nenhuma conta vencida agora.'}
          tone="rose"
        />
        <BillingOverviewMetric
          label="Pago no mes"
          value={formatCurrency(billsData.paidThisMonthAmount)}
          helper={`${billsData.paidCount} conta(s) ja baixadas nesta competencia.`}
          tone="green"
        />
        <BillingOverviewMetric
          label="Assinatura do sistema"
          value={summary.billing.amount != null ? formatCurrency(summary.billing.amount) : 'A definir'}
          helper={`Status atual: ${statusMeta.label}.`}
        />
      </section>

      <div className="billing-grid">
        <section className="card billing-hero-card">
          <div className="billing-alert-head">
            <div>
              <span className="eyebrow">Assinatura do sistema</span>
              <h2 className="section-title">Gestao do acesso da clinica</h2>
              <p className="section-copy">Acompanhe valor, vencimento, carencia e regularizacao do acesso da clinica sem sair deste modulo.</p>
            </div>
            <div className="billing-alert-badge">
              <Icon name="dollar" size={22} />
            </div>
          </div>

          <div className="billing-stat-grid compact-stats">
            <div className="stat-card gold">
              <div className="stat-label">Valor atual</div>
              <div className="stat-value billing-stat-value">
                {summary.billing.amount != null ? formatCurrency(summary.billing.amount) : 'A definir'}
              </div>
              <div className="stat-sub">Defina o plano comercial quando desejar.</div>
            </div>

            <div className="stat-card green">
              <div className="stat-label">Proximo vencimento</div>
              <div className="stat-value billing-stat-value">{formatDate(summary.billing.nextDueAt || summary.billing.graceEndsAt)}</div>
              <div className="stat-sub">Depois do vencimento, ha 7 dias antes do bloqueio.</div>
            </div>

            <div className="stat-card rose">
              <div className="stat-label">Bloqueio</div>
              <div className="stat-value billing-stat-value">{formatDate(summary.billing.blockAt)}</div>
              <div className="stat-sub">Sem regularizacao, o acesso fica suspenso ate o pagamento.</div>
            </div>
          </div>
        </section>

        <aside className="billing-side-stack">
          <section className="card billing-side-card">
            <div className="eyebrow">Resumo da assinatura</div>
            <div className="detail-list">
              <div className="detail-row">
                <span>Status efetivo</span>
                <strong>{statusMeta.label}</strong>
              </div>
              <div className="detail-row">
                <span>Situacao da clinica</span>
                <strong>{clinicStatus.label}</strong>
              </div>
              <div className="detail-row">
                <span>ID da clinica</span>
                <strong>{clinicIdentifier}</strong>
              </div>
              <div className="detail-row">
                <span>Dias restantes</span>
                <strong>{summary.billing.daysRemaining ?? 'Nao definido'}</strong>
              </div>
              <div className="detail-row">
                <span>Ultimo pagamento</span>
                <strong>{formatDate(summary.billing.lastPaidAt)}</strong>
              </div>
            </div>
          </section>

          <section className="card billing-side-card billing-gateway-card">
            <div className="eyebrow">Gateway financeiro</div>
            <div className="billing-gateway-head">
              <strong>{gatewayStatusLabel}</strong>
              <span className={gatewayBadgeClass}>
                {gatewayStatus?.configured ? gatewayStatus.provider : 'Provider agnostic'}
              </span>
            </div>
            <p className="billing-gateway-copy">
              {gatewayStatus?.message || 'Camada preparada para conectar Pix dinamico, cartao e recorrencia sem mudar a experiencia da clinica.'}
            </p>
            {latestGatewayIntent ? (
              <div className="detail-list billing-gateway-details">
                <div className="detail-row">
                  <span>Referencia</span>
                  <strong>{latestGatewayIntent.reference || 'Nao gerada'}</strong>
                </div>
                <div className="detail-row">
                  <span>Valor</span>
                  <strong>{formatCurrency(latestGatewayIntent.amount)}</strong>
                </div>
                <div className="detail-row">
                  <span>Vencimento</span>
                  <strong>{formatDate(latestGatewayIntent.dueAt)}</strong>
                </div>
              </div>
            ) : null}
            <div className="billing-gateway-actions">
              <button type="button" className="btn btn-outline btn-sm" onClick={handleCreateGatewayIntent} disabled={creatingGatewayIntent}>
                {creatingGatewayIntent ? <span className="spinner" /> : <><Icon name="dollar" /> Gerar cobranca</>}
              </button>
              {canManageSubscription && latestGatewayIntent?.status === 'PENDING' ? (
                <button type="button" className="btn btn-gold btn-sm" onClick={handleSimulateGatewayPayment} disabled={simulatingGatewayPayment}>
                  {simulatingGatewayPayment ? <span className="spinner" /> : <><Icon name="check" /> Simular recebimento</>}
                </button>
              ) : null}
            </div>
          </section>

          <section className="card billing-side-card">
            <div className="eyebrow">Contas da clinica</div>
            <div className="detail-list">
              <div className="detail-row">
                <span>Em aberto</span>
                <strong>{billsData.openCount}</strong>
              </div>
              <div className="detail-row">
                <span>Em atraso</span>
                <strong>{billsData.overdueCount}</strong>
              </div>
              <div className="detail-row">
                <span>Pagas</span>
                <strong>{billsData.paidCount}</strong>
              </div>
            </div>
          </section>
        </aside>
      </div>

      <div className="billing-grid billing-grid-secondary billing-audit-layout">
        <section className="card section-card billing-config-card">
          <div className="section-head">
            <div>
              <h2 className="section-title">Configuracao da assinatura</h2>
              <p className="section-copy">
                {canManageSubscription
                  ? 'Defina valor, proximo vencimento e observacoes internas da assinatura da clinica.'
                  : 'A clinica acompanha aqui o status da assinatura. Alteracoes de valor e confirmacao de pagamento ficam restritas ao suporte.'}
              </p>
            </div>
            {!canManageSubscription ? <span className="badge badge-muted">Edicao restrita ao suporte</span> : null}
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Valor do plano</label>
              <input
                className="form-input"
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={setField('amount')}
                placeholder="0,00"
                readOnly={!canManageSubscription}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Proximo vencimento</label>
              <input className="form-input" type="date" value={form.nextDueAt} onChange={setField('nextDueAt')} disabled={!canManageSubscription} />
            </div>

            <div className="form-group form-full">
              <label className="form-label">Referencia</label>
              <input
                className="form-input"
                value={form.reference}
                onChange={setField('reference')}
                placeholder="Ex: Plano Premium Maio 2026"
                readOnly={!canManageSubscription}
              />
            </div>

            <div className="form-group form-full">
              <label className="form-label">Observacoes</label>
              <textarea
                className="form-textarea"
                value={form.notes}
                onChange={setField('notes')}
                placeholder="Anotacoes internas sobre negociacao, condicao comercial ou forma de cobranca."
                readOnly={!canManageSubscription}
              />
            </div>
          </div>

          {canManageSubscription ? (
            <div className="billing-actions">
              <button type="button" className="btn btn-outline" onClick={handleSaveConfig} disabled={savingConfig}>
                {savingConfig ? (
                  <span className="spinner" />
                ) : (
                  <>
                    <Icon name="edit" /> Salvar assinatura
                  </>
                )}
              </button>
              <button type="button" className="btn btn-gold" onClick={handleMarkPaid} disabled={markingPaid}>
                {markingPaid ? (
                  <span className="spinner" />
                ) : (
                  <>
                    <Icon name="check" /> Confirmar pagamento
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="billing-readonly-note">
              <strong>Alteracoes protegidas</strong>
              <p>Somente o login de suporte pode atualizar o valor da assinatura e confirmar o pagamento da plataforma.</p>
              <Link to="/contatar-suporte" className="btn btn-outline btn-sm">
                <Icon name="mail" /> Falar com o suporte
              </Link>
            </div>
          )}
        </section>

        <section className="card section-card audit-card">
          <div className="section-head">
            <div>
              <h2 className="section-title">Rastreabilidade da assinatura</h2>
              <p className="section-copy">Toda alteracao importante do acesso da clinica fica registrada para consulta rapida e suporte auditavel.</p>
            </div>
            <span className="badge badge-muted">Ultimos {auditLogs.length}</span>
          </div>

          {!auditLogs.length ? (
            <div className="empty empty-tight">
              <div className="empty-icon">
                <Icon name="clipboard" size={24} />
              </div>
              <h3>Nenhum log disponivel</h3>
              <p>Quando houver mudancas relevantes na assinatura ou no acesso da clinica, elas aparecerao aqui.</p>
            </div>
          ) : (
            <ol className="audit-timeline">
              {auditLogs.map(log => (
                <AuditTimelineItem key={log.id} log={log} />
              ))}
            </ol>
          )}
        </section>
      </div>

      <section className="card section-card documents-main-card billing-bills-card">
        <div className="section-head">
          <div>
            <h2 className="section-title">Contas da clinica</h2>
            <p className="section-copy">Cadastre aluguel, folha, fornecedores, impostos e outras despesas operacionais.</p>
          </div>

          <button type="button" className="btn btn-primary" onClick={openCreateBill}>
            <Icon name="plus" /> Nova conta
          </button>
        </div>

        {!billsData.bills.length ? (
          <div className="empty empty-tight">
            <div className="empty-icon">
              <Icon name="dollar" size={24} />
            </div>
            <h3>Nenhuma conta cadastrada</h3>
            <p>Adicione as despesas da clinica para acompanhar vencimentos, atrasos e baixas no mesmo painel.</p>
          </div>
        ) : (
          <div className="billing-bill-list">
            {billsData.bills.map(bill => (
              <BillCard key={bill.id} bill={bill} onEdit={openEditBill} onMarkPaid={handleMarkBillPaid} onDelete={handleDeleteBill} />
            ))}
          </div>
        )}
      </section>

      {billModal ? (
        <div className="modal-backdrop" onClick={event => event.target === event.currentTarget && setBillModal(null)}>
          <div className="modal">
            <h2 className="modal-title">{billModal === 'create' ? 'Nova conta da clinica' : 'Editar conta da clinica'}</h2>

            <div className="form-grid">
              <div className="form-group form-full">
                <label className="form-label">Titulo *</label>
                <input className="form-input" value={billForm.title} onChange={setBillField('title')} placeholder="Ex: Aluguel da clinica" />
              </div>

              <div className="form-group">
                <label className="form-label">Categoria</label>
                <select className="form-select" value={billForm.category} onChange={setBillField('category')}>
                  <option value="">Selecione</option>
                  {billCategories.map(category => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Valor *</label>
                <input className="form-input" type="number" min="0" step="0.01" value={billForm.amount} onChange={setBillField('amount')} placeholder="0,00" />
              </div>

              <div className="form-group">
                <label className="form-label">Vencimento *</label>
                <input className="form-input" type="date" value={billForm.dueAt} onChange={setBillField('dueAt')} />
              </div>

              <div className="form-group form-full">
                <label className="form-label">Observacoes</label>
                <textarea
                  className="form-textarea"
                  value={billForm.notes}
                  onChange={setBillField('notes')}
                  placeholder="Ex: contrato mensal, fornecedor principal, observacoes sobre a cobranca."
                />
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setBillModal(null)}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" onClick={handleSaveBill} disabled={savingBill}>
                {savingBill ? <span className="spinner" /> : 'Salvar conta'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
