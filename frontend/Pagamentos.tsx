import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
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
  ACTIVE: { label: 'OperaÃ§Ã£o ativa', className: 'badge badge-green' },
  SUSPENDED: { label: 'OperaÃ§Ã£o suspensa', className: 'badge badge-gold' },
  ARCHIVED: { label: 'ClÃ­nica arquivada', className: 'badge badge-muted' },
}

const auditActionMeta: Record<string, { label: string; icon: IconName }> = {
  AUTH_REGISTER: { label: 'Cadastro inicial', icon: 'sparkles' },
  SUPPORT_ASSUME_CLINIC: { label: 'Acesso do suporte', icon: 'dashboard' },
  BILLING_CONFIG_UPDATED: { label: 'Assinatura ajustada', icon: 'edit' },
  BILLING_MARKED_PAID: { label: 'Pagamento confirmado', icon: 'check' },
}

const billCategories = [
  'Aluguel',
  'Folha',
  'Insumos',
  'Impostos',
  'Marketing',
  'Ãgua e luz',
  'ManutenÃ§Ã£o',
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
  if (!value) return 'NÃ£o definido'

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

  return { label: 'AÃ§Ã£o registrada', icon: 'clipboard' }
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
  if (log.actorRole === 'SUPPORT') return 'Suporte tÃ©cnico'
  return log.actorEmail || 'Sistema'
}

function describeAuditLog(log: AuditLogItem): string {
  const metadata = getMetadataRecord(log)

  if (log.action === 'AUTH_REGISTER') {
    const clinicLabel = getMetadataString(metadata, 'clinicName') || 'a clÃ­nica'
    const emailValue = getMetadataString(metadata, 'email')
    const emailLabel = emailValue ? ` com o e-mail ${emailValue}` : ''
    return `Cadastro inicial de ${clinicLabel}${emailLabel}.`
  }

  if (log.action === 'SUPPORT_ASSUME_CLINIC') {
    const clinicEmail = getMetadataString(metadata, 'clinicEmail')
    const emailLabel = clinicEmail ? ` da conta ${clinicEmail}` : ''
    return `Ambiente assumido pelo suporte para manutenÃ§Ã£o e diagnÃ³stico${emailLabel}.`
  }

  if (log.action === 'BILLING_CONFIG_UPDATED') {
    const parts: string[] = []
    const amount = getMetadataNumber(metadata, 'amount')
    const nextDueAt = getMetadataString(metadata, 'nextDueAt')
    const reference = getMetadataString(metadata, 'reference')

    if (amount != null) parts.push(`valor ${formatCurrency(amount)}`)
    if (nextDueAt) parts.push(`prÃ³ximo vencimento em ${formatDate(nextDueAt)}`)
    if (reference) parts.push(`referÃªncia ${reference}`)

    return parts.length
      ? `ConfiguraÃ§Ã£o da assinatura atualizada com ${parts.join(', ')}.`
      : 'ConfiguraÃ§Ã£o da assinatura atualizada.'
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

  return 'Evento registrado para rastreabilidade do mÃ³dulo financeiro.'
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
          <span className="billing-bill-category">{bill.category || 'Conta operacional da clÃ­nica'}</span>
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
          <strong>ObservaÃ§Ãµes</strong>
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
          {log.entityType ? ` â€¢ ${log.entityType}` : ''}
        </small>
      </div>
    </li>
  )
}

export default function Pagamentos() {
  const { user, refreshUser } = useAuth()
  const [loading, setLoading] = useState(true)
  const [savingConfig, setSavingConfig] = useState(false)
  const [markingPaid, setMarkingPaid] = useState(false)
  const [savingBill, setSavingBill] = useState(false)
  const [summary, setSummary] = useState<BillingSummaryResponse | null>(null)
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([])
  const [billsData, setBillsData] = useState<ClinicBillsResponse>(emptyBillsDashboard)
  const [billModal, setBillModal] = useState<BillModalMode>(null)
  const [selectedBill, setSelectedBill] = useState<ClinicBillItem | null>(null)
  const [billForm, setBillForm] = useState<BillFormState>(emptyBillForm)
  const [form, setForm] = useState<BillingConfigFormState>(emptyBillingConfigForm)
  const { clinicName, brandLogo } = getClinicBranding(user)

  async function load(): Promise<void> {
    setLoading(true)

    try {
      const [{ data: summaryData }, { data: billsResponse }, { data: auditResponse }] = await Promise.all([
        api.get<BillingSummaryResponse>('/billing/summary'),
        api.get<ClinicBillsResponse>('/billing/bills'),
        api.get<AuditLogsResponse>('/clinic/audit-logs?limit=8'),
      ])

      setSummary(summaryData)
      setBillsData(billsResponse)
      setAuditLogs(auditResponse.logs || [])
      setForm({
        amount: summaryData.billing.amount != null ? String(summaryData.billing.amount) : '',
        nextDueAt: summaryData.billing.nextDueAt ? String(summaryData.billing.nextDueAt).slice(0, 10) : '',
        reference: summaryData.billing.reference || '',
        notes: summaryData.billing.notes || '',
      })
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'NÃ£o foi possÃ­vel carregar a central financeira'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const statusMeta = useMemo(() => getBillingStatus(summary?.billing?.effectiveStatus), [summary?.billing?.effectiveStatus])
  const clinicStatus = useMemo(() => getClinicStatus(user?.clinicStatus), [user?.clinicStatus])
  const canManageSubscription = Boolean(summary?.permissions?.canManageSubscription || isImpersonating(user))
  const clinicIdentifier = summary?.clinicId ?? user?.clinicId ?? 'NÃ£o definido'

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
      toast.success('ConfiguraÃ§Ã£o da assinatura atualizada')
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'NÃ£o foi possÃ­vel atualizar a assinatura da plataforma'))
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
      toast.error(getApiErrorMessage(error, 'NÃ£o foi possÃ­vel registrar o pagamento da assinatura'))
    } finally {
      setMarkingPaid(false)
    }
  }

  async function handleSaveBill(): Promise<void> {
    if (!billForm.title.trim() || !billForm.amount || !billForm.dueAt) {
      toast.error('TÃ­tulo, valor e vencimento sÃ£o obrigatÃ³rios')
      return
    }

    const parsedAmount = Number(billForm.amount)

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error('Informe um valor vÃ¡lido para continuar')
      return
    }

    if (billModal === 'edit' && !selectedBill) {
      toast.error('Selecione uma conta vÃ¡lida para continuar')
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
      toast.error(getApiErrorMessage(error, 'NÃ£o foi possÃ­vel salvar esta conta'))
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
      toast.error(getApiErrorMessage(error, 'NÃ£o foi possÃ­vel registrar esta baixa'))
    }
  }

  async function handleDeleteBill(billId: Identifier): Promise<void> {
    if (!window.confirm('Deseja remover esta conta da clÃ­nica?')) return

    try {
      await api.delete<{ ok: boolean }>(`/billing/bills/${billId}`)
      toast.success('Conta removida com sucesso')
      await load()
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'NÃ£o foi possÃ­vel remover esta conta'))
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

  if (!summary) return null

  return (
    <div className="page billing-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Assinatura e contas</h1>
          <p className="page-subtitle">
            Centralize a assinatura do sistema, as despesas operacionais e as baixas financeiras da clÃ­nica em um Ãºnico painel.
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
            Contas da clÃ­nica, assinatura do sistema e rastreabilidade das aÃ§Ãµes organizadas com leitura rÃ¡pida e controle centralizado.
          </p>
          <div className="billing-brand-meta">
            <span className={statusMeta.className}>{statusMeta.label}</span>
            <span className={clinicStatus.className}>{clinicStatus.label}</span>
            <span className="badge badge-muted">ID da clÃ­nica {clinicIdentifier}</span>
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
          helper={billsData.overdueCount ? `${billsData.overdueCount} pendÃªncia(s) vencida(s).` : 'Nenhuma conta vencida agora.'}
          tone="rose"
        />
        <BillingOverviewMetric
          label="Pago no mÃªs"
          value={formatCurrency(billsData.paidThisMonthAmount)}
          helper={`${billsData.paidCount} conta(s) jÃ¡ baixadas nesta competÃªncia.`}
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
              <h2 className="section-title">GestÃ£o do acesso da clÃ­nica</h2>
              <p className="section-copy">Acompanhe valor, vencimento, carÃªncia e regularizaÃ§Ã£o do acesso da clÃ­nica sem sair deste mÃ³dulo.</p>
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
              <div className="stat-label">PrÃ³ximo vencimento</div>
              <div className="stat-value billing-stat-value">{formatDate(summary.billing.nextDueAt || summary.billing.graceEndsAt)}</div>
              <div className="stat-sub">Depois do vencimento, hÃ¡ 7 dias antes do bloqueio.</div>
            </div>

            <div className="stat-card rose">
              <div className="stat-label">Bloqueio</div>
              <div className="stat-value billing-stat-value">{formatDate(summary.billing.blockAt)}</div>
              <div className="stat-sub">Sem regularizaÃ§Ã£o, o acesso fica suspenso atÃ© o pagamento.</div>
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
                <span>SituaÃ§Ã£o da clÃ­nica</span>
                <strong>{clinicStatus.label}</strong>
              </div>
              <div className="detail-row">
                <span>ID da clÃ­nica</span>
                <strong>{clinicIdentifier}</strong>
              </div>
              <div className="detail-row">
                <span>Dias restantes</span>
                <strong>{summary.billing.daysRemaining ?? 'NÃ£o definido'}</strong>
              </div>
              <div className="detail-row">
                <span>Ãšltimo pagamento</span>
                <strong>{formatDate(summary.billing.lastPaidAt)}</strong>
              </div>
            </div>
          </section>

          <section className="card billing-side-card">
            <div className="eyebrow">Contas da clÃ­nica</div>
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
              <h2 className="section-title">ConfiguraÃ§Ã£o da assinatura</h2>
              <p className="section-copy">
                {canManageSubscription
                  ? 'Defina valor, prÃ³ximo vencimento e observaÃ§Ãµes internas da assinatura da clÃ­nica.'
                  : 'A clÃ­nica acompanha aqui o status da assinatura. AlteraÃ§Ãµes de valor e confirmaÃ§Ã£o de pagamento ficam restritas ao suporte.'}
              </p>
            </div>
            {!canManageSubscription ? <span className="badge badge-muted">EdiÃ§Ã£o restrita ao suporte</span> : null}
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
              <label className="form-label">PrÃ³ximo vencimento</label>
              <input className="form-input" type="date" value={form.nextDueAt} onChange={setField('nextDueAt')} disabled={!canManageSubscription} />
            </div>

            <div className="form-group form-full">
              <label className="form-label">ReferÃªncia</label>
              <input
                className="form-input"
                value={form.reference}
                onChange={setField('reference')}
                placeholder="Ex: Plano Premium Maio 2026"
                readOnly={!canManageSubscription}
              />
            </div>

            <div className="form-group form-full">
              <label className="form-label">ObservaÃ§Ãµes</label>
              <textarea
                className="form-textarea"
                value={form.notes}
                onChange={setField('notes')}
                placeholder="AnotaÃ§Ãµes internas sobre negociaÃ§Ã£o, condiÃ§Ã£o comercial ou forma de cobranÃ§a."
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
              <strong>AlteraÃ§Ãµes protegidas</strong>
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
              <p className="section-copy">Toda alteraÃ§Ã£o importante do acesso da clÃ­nica fica registrada para consulta rÃ¡pida e suporte auditÃ¡vel.</p>
            </div>
            <span className="badge badge-muted">Ãšltimos {auditLogs.length}</span>
          </div>

          {!auditLogs.length ? (
            <div className="empty empty-tight">
              <div className="empty-icon">
                <Icon name="clipboard" size={24} />
              </div>
              <h3>Nenhum log disponÃ­vel</h3>
              <p>Quando houver mudanÃ§as relevantes na assinatura ou no acesso da clÃ­nica, elas aparecerÃ£o aqui.</p>
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
            <h2 className="section-title">Contas da clÃ­nica</h2>
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
            <p>Adicione as despesas da clÃ­nica para acompanhar vencimentos, atrasos e baixas no mesmo painel.</p>
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
            <h2 className="modal-title">{billModal === 'create' ? 'Nova conta da clÃ­nica' : 'Editar conta da clÃ­nica'}</h2>

            <div className="form-grid">
              <div className="form-group form-full">
                <label className="form-label">TÃ­tulo *</label>
                <input className="form-input" value={billForm.title} onChange={setBillField('title')} placeholder="Ex: Aluguel da clÃ­nica" />
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
                <label className="form-label">ObservaÃ§Ãµes</label>
                <textarea
                  className="form-textarea"
                  value={billForm.notes}
                  onChange={setBillField('notes')}
                  placeholder="Ex: contrato mensal, fornecedor principal, observaÃ§Ãµes sobre a cobranÃ§a."
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



