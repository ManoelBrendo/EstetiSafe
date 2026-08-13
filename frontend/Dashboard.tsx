import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import api, { getApiErrorMessage } from './api'
import { useAuth } from './useAuth'
import { Icon } from './Icon'
import { getClinicBranding, prepareClinicLogoDataUrl } from './branding'
import type { DashboardResponse, DashboardUpcomingAppointment, InventoryAlert } from './operationsTypes'

interface BrandingFormState {
  clinicName: string
  clinicLogoDataUrl: string | null
}

interface AlertCardProps {
  title: string
  subtitle: string
  statusLabel: string
  badgeClass: string
  dateLabel: string
}

interface UpcomingCardProps {
  appointment: DashboardUpcomingAppointment
}

interface BrandSurfaceProps {
  label: string
  tone?: string
  clinicName: string
  brandLogo: string
  badgeLabel: string
  badgeClass: string
  helper: string
}

interface BrandPreviewPanelProps {
  clinicName: string
  brandLogo: string
  hasCustomLogo: boolean
  billingLabel: string
}

function fmtBRL(value: number | string | null | undefined) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

const statusBadge: Record<string, [string, string]> = {
  SCHEDULED: ['badge-blue', 'Agendado'],
  CONFIRMED: ['badge-green', 'Confirmado'],
  COMPLETED: ['badge-muted', 'Concluído'],
  CANCELLED: ['badge-red', 'Cancelado'],
  NO_SHOW: ['badge-rose', 'Faltou'],
  IN_PROGRESS: ['badge-gold', 'Em andamento'],
}

const billingMeta: Record<string, { label: string; className: string }> = {
  TRIAL: { label: 'Cortesia ativa', className: 'badge badge-blue' },
  ACTIVE: { label: 'Pagamento em dia', className: 'badge badge-green' },
  OVERDUE: { label: 'Pagamento pendente', className: 'badge badge-gold' },
  BLOCKED: { label: 'Acesso bloqueado', className: 'badge badge-red' },
}

const clinicStatusMeta: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: 'Operação ativa', className: 'badge badge-green' },
  SUSPENDED: { label: 'Operação suspensa', className: 'badge badge-gold' },
  ARCHIVED: { label: 'Clínica arquivada', className: 'badge badge-muted' },
}

function getGreeting(): string {
  const hour = new Date().getHours()

  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

function capitalize(text?: string | null): string {
  if (!text) return ''
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function formatDate(value: string | number | null | undefined) {
  if (!value) return 'Sem vencimento'

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
  }).format(new Date(value))
}

function getInsightBadgeClass(priority?: string | null): string {
  if (priority === 'CRITICAL') return 'badge-red'
  if (priority === 'WARNING') return 'badge-gold'
  return 'badge-blue'
}

function getInsightPriorityLabel(priority?: string | null): string {
  if (priority === 'CRITICAL') return 'Critico'
  if (priority === 'WARNING') return 'Atencao'
  return 'Informativo'
}

function AlertCard({ title, subtitle, statusLabel, badgeClass, dateLabel }: AlertCardProps) {
  return (
    <article className="snapshot-card">
      <div>
        <h3 className="snapshot-card-title">{title}</h3>
        <p className="snapshot-card-subtitle">{subtitle}</p>
      </div>

      <div className="snapshot-card-foot">
        <span className={`badge ${badgeClass}`}>{statusLabel}</span>
        <small>{dateLabel}</small>
      </div>
    </article>
  )
}

function UpcomingCard({ appointment }: UpcomingCardProps) {
  const [badgeClass, label] = statusBadge[appointment.status] || ['badge-muted', appointment.status]

  return (
    <article className="snapshot-card upcoming-snapshot-card">
      <div className="snapshot-card-head">
        <div>
          <h3 className="snapshot-card-title">{appointment.client?.name}</h3>
          <p className="snapshot-card-subtitle">{appointment.service?.name}</p>
        </div>
        <span className={`badge ${badgeClass}`}>{label}</span>
      </div>

      <div className="snapshot-meta-grid">
        <div className="snapshot-meta-item">
          <span>Horário</span>
          <strong>{format(new Date(appointment.startAt), 'HH:mm')}</strong>
        </div>
        <div className="snapshot-meta-item">
          <span>Data</span>
          <strong>{format(new Date(appointment.startAt), 'dd/MM')}</strong>
        </div>
      </div>
    </article>
  )
}

function BrandSurface({ label, tone = 'light', clinicName, brandLogo, badgeLabel, badgeClass, helper }: BrandSurfaceProps) {
  return (
    <article className={`brand-surface brand-surface-${tone}`}>
      <div className="brand-surface-label-row">
        <span className="brand-surface-label">{label}</span>
        <span className={`badge ${badgeClass}`}>{badgeLabel}</span>
      </div>

      <div className="brand-surface-shell">
        <div className="brand-surface-brand">
          <div className="brand-surface-mark">
            <img src={brandLogo} alt={`Logo de ${clinicName}`} />
          </div>
          <div>
            <strong>{clinicName}</strong>
            <small>Painel da clínica</small>
          </div>
        </div>

        <div className="brand-surface-pill-row">
          <span className="brand-surface-pill">Documentos</span>
          <span className="brand-surface-pill">Clientes</span>
          <span className="brand-surface-pill">Financeiro</span>
        </div>
      </div>

      <p className="brand-surface-helper">{helper}</p>
    </article>
  )
}

function BrandPreviewPanel({ clinicName, brandLogo, hasCustomLogo, billingLabel }: BrandPreviewPanelProps) {
  return (
    <aside className="dashboard-brand-preview">
      <div className="dashboard-brand-preview-head">
        <span className="eyebrow">Prévia da identidade</span>
        <p className="section-copy">
          A mesma marca acompanha menu lateral, topo móvel e módulos internos para que cada clínica reconheça o próprio ambiente.
        </p>
      </div>

      <div className="brand-preview-pill-row">
        <span className={`badge ${hasCustomLogo ? 'badge-green' : 'badge-muted'}`}>
          {hasCustomLogo ? 'Logo própria da clínica' : 'Marca padrão da plataforma'}
        </span>
        <span className="badge badge-gold">{billingLabel}</span>
      </div>

      <div className="brand-surface-grid">
        <BrandSurface
          label="Menu lateral"
          tone="dark"
          clinicName={clinicName}
          brandLogo={brandLogo}
          badgeLabel="Desktop"
          badgeClass="badge-gold"
          helper="Identidade visível logo na entrada do painel, com leitura elegante e imediata."
        />
        <BrandSurface
          label="Topo móvel"
          clinicName={clinicName}
          brandLogo={brandLogo}
          badgeLabel="Mobile"
          badgeClass="badge-blue"
          helper="A logo continua clara em tablet e celular, sem apertar o nome da clínica."
        />
        <BrandSurface
          label="Centro financeiro"
          clinicName={clinicName}
          brandLogo={brandLogo}
          badgeLabel="Financeiro"
          badgeClass="badge-green"
          helper="A assinatura e as contas da clínica permanecem alinhadas à mesma identidade visual."
        />
      </div>
    </aside>
  )
}

export default function Dashboard() {
  const { user, refreshUser } = useAuth()
  const [data, setData] = useState<DashboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [brandingOpen, setBrandingOpen] = useState(false)
  const [savingBranding, setSavingBranding] = useState(false)
  const [brandingForm, setBrandingForm] = useState<BrandingFormState>({
    clinicName: user?.clinicName || '',
    clinicLogoDataUrl: user?.clinicLogoDataUrl || null,
  })

  useEffect(() => {
    let active = true

    api.get<DashboardResponse>('/dashboard')
      .then(({ data: response }) => {
        if (active) setData(response)
      })
      .catch(error => {
        toast.error(getApiErrorMessage(error, 'Não foi possível carregar o painel clínico'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    setBrandingForm({
      clinicName: user?.clinicName || '',
      clinicLogoDataUrl: user?.clinicLogoDataUrl || null,
    })
  }, [user?.clinicLogoDataUrl, user?.clinicName])

  const monthName = useMemo(
    () => capitalize(format(new Date(), "MMMM 'de' yyyy", { locale: ptBR })),
    []
  )

  const { clinicName: authenticatedClinicName, brandLogo: clinicBrandLogo } = useMemo(
    () => getClinicBranding(user),
    [user]
  )

  const previewClinicName = brandingForm.clinicName.trim() || authenticatedClinicName
  const previewBrandLogo = brandingForm.clinicLogoDataUrl || clinicBrandLogo
  const previewHasCustomLogo = Boolean(brandingForm.clinicLogoDataUrl)
  const nextAppointment = data?.upcoming?.[0]
  const billingSnapshot = data?.billing || user?.billing
  const billing = billingMeta[billingSnapshot?.effectiveStatus || 'TRIAL'] || billingMeta.TRIAL
  const clinicStatus = clinicStatusMeta[user?.clinicStatus || 'ACTIVE'] || clinicStatusMeta.ACTIVE
  const documents = data?.documents
  const criticalAlerts: DashboardResponse['documents']['alerts'] = documents?.alerts || []
  const criticalDocumentsCount = (documents?.expiring ?? 0) + (documents?.expired ?? 0)
  const inventory = data?.inventory
  const inventoryAlerts: InventoryAlert[] = inventory?.alerts || []
  const clinicalInsights = data?.clinicalInsights
  const clinicalInsightItems = clinicalInsights?.insights || []
  const clinicalCriticalCount = clinicalInsights?.countsByPriority?.CRITICAL ?? 0

  async function handleBrandLogoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const clinicLogoDataUrl = await prepareClinicLogoDataUrl(file)
      setBrandingForm(current => ({ ...current, clinicLogoDataUrl }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível carregar a logo da clínica')
    } finally {
      event.target.value = ''
    }
  }

  async function handleSaveBranding() {
    if (!brandingForm.clinicName.trim()) {
      toast.error('Informe o nome da clínica para salvar a identidade visual')
      return
    }

    setSavingBranding(true)

    try {
      await api.put('/clinic/profile', {
        clinicName: brandingForm.clinicName.trim(),
        clinicLogoDataUrl: brandingForm.clinicLogoDataUrl || null,
      })

      await refreshUser()
      toast.success('Identidade da clínica atualizada com sucesso')
      setBrandingOpen(false)
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Não foi possível atualizar a identidade da clínica'))
    } finally {
      setSavingBranding(false)
    }
  }

  function openBrandingEditor() {
    setBrandingForm({
      clinicName: user?.clinicName || '',
      clinicLogoDataUrl: user?.clinicLogoDataUrl || null,
    })
    setBrandingOpen(true)
  }

  function handleRestorePlatformBrand() {
    setBrandingForm(current => ({
      ...current,
      clinicLogoDataUrl: null,
    }))
  }

  if (loading) {
    return (
      <div className="loading-page">
        <span className="spinner" />
        Carregando Painel Clínico...
      </div>
    )
  }

  return (
    <div className="page dashboard-page">
      <section className="card dashboard-brand-card">
        <div className="dashboard-brand-copy">
          <div className="dashboard-brand-head">
            <div className="brand-plaque-logo dashboard-brand-logo">
              <img src={clinicBrandLogo} alt={`Logo de ${authenticatedClinicName}`} />
            </div>

            <div>
              <span className="eyebrow">Painel da clínica</span>
              <h1 className="page-title">{getGreeting()}</h1>
              <p className="page-subtitle">{authenticatedClinicName} • {monthName}</p>
            </div>
          </div>

          <p className="section-copy dashboard-brand-copy-text">
            Comece pelo que mais impacta a operação: agenda, documentos críticos e assinatura. O restante continua acessível, mas sem disputar atenção no primeiro olhar.
          </p>

          <div className="dashboard-brand-meta">
            <span className={billing.className}>{billing.label}</span>
            <span className={clinicStatus.className}>{clinicStatus.label}</span>
            {criticalDocumentsCount ? (
              <span className="badge badge-gold">{criticalDocumentsCount} alerta(s) documental(is)</span>
            ) : null}
          </div>

          <div className="dashboard-brand-actions">
            <button type="button" className="btn btn-outline btn-sm" onClick={openBrandingEditor}>
              <Icon name="camera" /> Personalizar marca
            </button>
            <Link to="/assinatura" className="btn btn-ghost btn-sm">
              <Icon name="dollar" /> Abrir assinatura
            </Link>
          </div>
        </div>
      </section>

      <div className="stats-grid stats-grid-adaptive">
        <div className="stat-card gold">
          <div className="stat-content-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div className="stat-label">Receita do mês</div>
              <div className="stat-value">{fmtBRL(data?.month?.revenue)}</div>
              <div className="stat-sub">Somente pagamentos confirmados.</div>
            </div>
            <div className="stat-ring-container" style={{ position: 'relative', width: '60px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg className="progress-ring" width="60" height="60">
                <circle className="progress-ring__circle-bg" stroke="rgba(182, 137, 77, 0.1)" strokeWidth="4" fill="transparent" r="22" cx="30" cy="30" />
                <circle
                  className="progress-ring__circle"
                  stroke="var(--gold)"
                  strokeWidth="4"
                  fill="transparent"
                  r="22"
                  cx="30"
                  cy="30"
                  style={{
                    strokeDasharray: `${2 * Math.PI * 22}`,
                    strokeDashoffset: `${2 * Math.PI * 22 * (1 - Math.min(1, (data?.month?.revenue || 0) / 50000))}`,
                    transition: 'stroke-dashoffset 0.8s ease-in-out',
                  }}
                />
              </svg>
              <span className="stat-ring-percentage" style={{ position: 'absolute', fontSize: '0.72rem', fontWeight: '800', color: 'var(--ink)' }}>
                {Math.round(Math.min(100, ((data?.month?.revenue || 0) / 50000) * 100))}%
              </span>
            </div>
          </div>
          <div className="stat-sparkline" style={{ marginTop: '14px', height: '28px', opacity: 0.85 }}>
            <svg viewBox="0 0 100 25" width="100%" height="25" preserveAspectRatio="none" style={{ display: 'block' }}>
              <defs>
                <linearGradient id="gold-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="var(--gold)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d="M 0 20 Q 20 5, 40 18 T 80 8 T 100 12 L 100 25 L 0 25 Z" fill="url(#gold-gradient)" />
              <path d="M 0 20 Q 20 5, 40 18 T 80 8 T 100 12" fill="none" stroke="var(--gold)" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        <div className="stat-card green">
          <div className="stat-content-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div className="stat-label">Atendimentos</div>
              <div className="stat-value">{data?.month?.totalAppointments ?? 0}</div>
              <div className="stat-sub">Concluídos no mês vigente.</div>
            </div>
            <div className="stat-ring-container" style={{ position: 'relative', width: '60px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg className="progress-ring" width="60" height="60">
                <circle className="progress-ring__circle-bg" stroke="rgba(63, 124, 103, 0.1)" strokeWidth="4" fill="transparent" r="22" cx="30" cy="30" />
                <circle
                  className="progress-ring__circle"
                  stroke="var(--success)"
                  strokeWidth="4"
                  fill="transparent"
                  r="22"
                  cx="30"
                  cy="30"
                  style={{
                    strokeDasharray: `${2 * Math.PI * 22}`,
                    strokeDashoffset: `${2 * Math.PI * 22 * (1 - Math.min(1, (data?.month?.totalAppointments || 0) / 100))}`,
                    transition: 'stroke-dashoffset 0.8s ease-in-out',
                  }}
                />
              </svg>
              <span className="stat-ring-percentage" style={{ position: 'absolute', fontSize: '0.72rem', fontWeight: '800', color: 'var(--ink)' }}>
                {Math.round(Math.min(100, ((data?.month?.totalAppointments || 0) / 100) * 100))}%
              </span>
            </div>
          </div>
          <div className="stat-sparkline" style={{ marginTop: '14px', height: '28px', opacity: 0.85 }}>
            <svg viewBox="0 0 100 25" width="100%" height="25" preserveAspectRatio="none" style={{ display: 'block' }}>
              <defs>
                <linearGradient id="green-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--success)" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="var(--success)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d="M 0 15 Q 15 22, 35 10 T 70 18 T 100 5 L 100 25 L 0 25 Z" fill="url(#green-gradient)" />
              <path d="M 0 15 Q 15 22, 35 10 T 70 18 T 100 5" fill="none" stroke="var(--success)" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        <div className="stat-card rose">
          <div className="stat-content-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div className="stat-label">Clientes</div>
              <div className="stat-value">{data?.month?.totalClients ?? 0}</div>
              <div className="stat-sub">Base ativa e organizada.</div>
            </div>
            <div className="stat-ring-container" style={{ position: 'relative', width: '60px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg className="progress-ring" width="60" height="60">
                <circle className="progress-ring__circle-bg" stroke="rgba(172, 118, 109, 0.1)" strokeWidth="4" fill="transparent" r="22" cx="30" cy="30" />
                <circle
                  className="progress-ring__circle"
                  stroke="var(--rose)"
                  strokeWidth="4"
                  fill="transparent"
                  r="22"
                  cx="30"
                  cy="30"
                  style={{
                    strokeDasharray: `${2 * Math.PI * 22}`,
                    strokeDashoffset: `${2 * Math.PI * 22 * (1 - Math.min(1, (data?.month?.totalClients || 0) / 200))}`,
                    transition: 'stroke-dashoffset 0.8s ease-in-out',
                  }}
                />
              </svg>
              <span className="stat-ring-percentage" style={{ position: 'absolute', fontSize: '0.72rem', fontWeight: '800', color: 'var(--ink)' }}>
                {Math.round(Math.min(100, ((data?.month?.totalClients || 0) / 200) * 100))}%
              </span>
            </div>
          </div>
          <div className="stat-sparkline" style={{ marginTop: '14px', height: '28px', opacity: 0.85 }}>
            <svg viewBox="0 0 100 25" width="100%" height="25" preserveAspectRatio="none" style={{ display: 'block' }}>
              <defs>
                <linearGradient id="rose-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--rose)" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="var(--rose)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d="M 0 22 Q 25 12, 50 18 T 85 5 T 100 10 L 100 25 L 0 25 Z" fill="url(#rose-gradient)" />
              <path d="M 0 22 Q 25 12, 50 18 T 85 5 T 100 10" fill="none" stroke="var(--rose)" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      </div>

      <section className="dashboard-focus-row" aria-label="Ações principais do painel clínico">
        <Link to="/agendamentos" className="dashboard-focus-card">
          <Icon name="calendar" />
          <span>
            <strong>Agenda</strong>
            <p>Veja a próxima rotina da clínica.</p>
          </span>
        </Link>
        <Link to="/documentos" className={`dashboard-focus-card ${criticalDocumentsCount ? 'attention' : ''}`}>
          <Icon name="fileText" />
          <span>
            <strong>Documentos</strong>
            <p>{criticalDocumentsCount ? `${criticalDocumentsCount} alerta(s) para revisar.` : 'Tudo visivel para auditoria.'}</p>
          </span>
        </Link>
        <Link to="/assinatura" className="dashboard-focus-card finance">
          <Icon name="dollar" />
          <span>
            <strong>Assinatura e contas</strong>
            <p>Status, vencimentos e despesas em um lugar.</p>
          </span>
        </Link>
      </section>

      <div className="overview-grid dashboard-overview-grid">
        <section className="card section-card dashboard-section-card">
          <div className="section-head">
            <div>
              <h2 className="section-title">Conformidade documental</h2>
              <p className="section-copy">Veja o que está em dia e o que precisa de ação imediata.</p>
            </div>

            <Link to="/documentos" className="btn btn-ghost btn-sm">
              Abrir documentos
            </Link>
          </div>

          <div className="documents-summary-grid compact-docs-grid">
            <div className="mini-stat-card">
              <span>Total</span>
              <strong>{documents?.total ?? 0}</strong>
            </div>
            <div className="mini-stat-card">
              <span>Em dia</span>
              <strong>{documents?.valid ?? 0}</strong>
            </div>
            <div className="mini-stat-card mini-stat-card-alert">
              <span>Críticos</span>
              <strong>{criticalDocumentsCount}</strong>
            </div>
          </div>

          {!criticalAlerts.length ? (
            <div className="empty empty-tight">
              <div className="empty-icon">
                <Icon name="fileText" size={24} />
              </div>
              <h3>Nenhum documento crítico agora</h3>
              <p>Quando um anexo vencer ou estiver perto de vencer, o alerta aparece aqui.</p>
            </div>
          ) : (
            <div className="snapshot-card-list">
              {criticalAlerts.map(alert => (
                <AlertCard
                  key={alert.id}
                  title={alert.title}
                  subtitle={alert.documentType}
                  statusLabel={alert.statusLabel}
                  badgeClass={alert.status === 'EXPIRED' ? 'badge-red' : 'badge-gold'}
                  dateLabel={formatDate(alert.expiresAt)}
                />
              ))}
            </div>
          )}
        </section>

        <section className="card section-card dashboard-section-card">
          <div className="section-head">
            <div>
              <h2 className="section-title">Assinatura e financeiro</h2>
              <p className="section-copy">Controle simples da fase de cortesia, vencimento e bloqueio.</p>
            </div>

            <Link to="/assinatura" className="btn btn-ghost btn-sm">
              Abrir assinatura
            </Link>
          </div>

          <div className="detail-list">
            <div className="detail-row">
              <span>Status atual</span>
              <strong>{billing.label}</strong>
            </div>
            <div className="detail-row">
              <span>Situação da clínica</span>
              <strong>{clinicStatus.label}</strong>
            </div>
            <div className="detail-row">
              <span>ID da clínica</span>
              <strong>{user?.clinicId || 'Não definido'}</strong>
            </div>
            <div className="detail-row">
              <span>Mensagem</span>
              <strong>{billingSnapshot?.message || 'Configure a cobrança quando desejar.'}</strong>
            </div>
            <div className="detail-row">
              <span>Bloqueio previsto</span>
              <strong>{formatDate(billingSnapshot?.blockAt)}</strong>
            </div>
          </div>

          <div className="inline-tip inline-tip-gold">
            <Icon name="clock" />
            {nextAppointment
              ? `Próximo atendimento às ${format(new Date(nextAppointment.startAt), 'HH:mm')}.`
              : 'Nenhum atendimento próximo agendado.'}
          </div>
        </section>
      </div>

      <div className="overview-grid dashboard-overview-grid">
        <section className="card section-card dashboard-section-card">
          <div className="section-head">
            <div>
              <h2 className="section-title">Produtos e equipamentos</h2>
              <p className="section-copy">Acompanhe validade de produtos e manutenção de equipamentos com alertas antes do vencimento.</p>
            </div>

            <Link to="/produtos-e-equipamentos" className="btn btn-ghost btn-sm">
              Abrir módulo
            </Link>
          </div>

          <div className="documents-summary-grid compact-docs-grid">
            <div className="mini-stat-card">
              <span>Produtos</span>
              <strong>{inventory?.totalProducts ?? 0}</strong>
            </div>
            <div className="mini-stat-card">
              <span>Equipamentos</span>
              <strong>{inventory?.totalEquipment ?? 0}</strong>
            </div>
            <div className="mini-stat-card mini-stat-card-alert">
              <span>Alertas</span>
              <strong>{inventoryAlerts.length}</strong>
            </div>
          </div>

          {!inventoryAlerts.length ? (
            <div className="empty empty-tight">
              <div className="empty-icon">
                <Icon name="box" size={24} />
              </div>
              <h3>Nenhum alerta de estoque ou equipamento</h3>
              <p>Quando um produto ou equipamento se aproximar do vencimento, o aviso aparece aqui.</p>
            </div>
          ) : (
            <div className="snapshot-card-list">
              {inventoryAlerts.map(item => (
                <AlertCard
                  key={`${item.assetType}-${item.id}`}
                  title={item.name}
                  subtitle={item.assetType === 'PRODUCT' ? 'Produto' : 'Equipamento'}
                  statusLabel={item.statusLabel}
                  badgeClass={item.status === 'OVERDUE' ? 'badge-red' : 'badge-gold'}
                  dateLabel={item.assetType === 'PRODUCT'
                    ? `Validade: ${formatDate(item.expiresAt)}`
                    : `Manutenção: ${formatDate(item.maintenanceDueAt)}`}
                />
              ))}
            </div>
          )}
        </section>

        <section className="card section-card dashboard-section-card">
          <div className="section-head">
            <div>
              <h2 className="section-title">Inteligencia operacional</h2>
              <p className="section-copy">Sinais de estoque, equipamentos e anamnese gerados por regras auditaveis.</p>
            </div>

            <span className={clinicalInsights?.externalAiEnabled ? 'badge badge-green' : 'badge badge-muted'}>
              {clinicalInsights?.externalAiEnabled ? 'IA externa ativa' : 'Regras auditaveis'}
            </span>
          </div>

          <div className="documents-summary-grid compact-docs-grid">
            <div className="mini-stat-card">
              <span>Sinais</span>
              <strong>{clinicalInsights?.total ?? 0}</strong>
            </div>
            <div className="mini-stat-card mini-stat-card-alert">
              <span>Criticos</span>
              <strong>{clinicalCriticalCount}</strong>
            </div>
            <div className="mini-stat-card">
              <span>Modo</span>
              <strong>{clinicalInsights?.externalAiEnabled ? 'IA' : 'Regras'}</strong>
            </div>
          </div>

          {!clinicalInsightItems.length ? (
            <div className="empty empty-tight">
              <div className="empty-icon">
                <Icon name="sparkles" size={24} />
              </div>
              <h3>Nenhum sinal operacional agora</h3>
              <p>Quando houver risco em anamnese, estoque ou equipamento, o painel destaca aqui sem gerar diagnostico automatico.</p>
            </div>
          ) : (
            <div className="snapshot-card-list">
              {clinicalInsightItems.slice(0, 3).map(insight => (
                <AlertCard
                  key={insight.id}
                  title={insight.title}
                  subtitle={insight.description}
                  statusLabel={getInsightPriorityLabel(insight.priority)}
                  badgeClass={getInsightBadgeClass(insight.priority)}
                  dateLabel={insight.actionLabel}
                />
              ))}
            </div>
          )}

          <div className="inline-tip inline-tip-gold">
            <Icon name="shield" />
            {clinicalInsights?.readiness?.message || 'Leitura de apoio, sempre com revisao da profissional.'}
          </div>
        </section>

        <section className="card section-card dashboard-section-card">
          <div className="section-head">
            <div>
              <h2 className="section-title">Próximos agendamentos</h2>
              <p className="section-copy">Acompanhe os atendimentos mais próximos com leitura rápida.</p>
            </div>

            <Link to="/agendamentos" className="btn btn-ghost btn-sm">
              Ver agenda completa
            </Link>
          </div>

          {!data?.upcoming?.length ? (
            <div className="empty empty-tight">
              <div className="empty-icon">
                <Icon name="calendar" size={24} />
              </div>
              <h3>Nenhum agendamento próximo</h3>
              <p>Quando sua agenda receber novos atendimentos, eles aparecerão aqui.</p>
            </div>
          ) : (
            <div className="snapshot-card-list">
              {data.upcoming.slice(0, 4).map(appointment => (
                <UpcomingCard key={appointment.id} appointment={appointment} />
              ))}
            </div>
          )}
        </section>
      </div>

      {brandingOpen ? (
        <div className="modal-backdrop" onClick={event => event.target === event.currentTarget && setBrandingOpen(false)}>
          <div className="modal modal-lg">
            <h2 className="modal-title">Personalizar identidade da clínica</h2>

            <div className="branding-editor-grid">
              <section className="professional-form-section">
                <div className="section-head section-head-inline">
                  <div>
                    <h3 className="section-title section-title-sm">Marca exibida no painel</h3>
                    <p className="section-copy">
                      A logo salva aqui substitui a marca padrão da plataforma no menu lateral, no topo móvel e nos módulos internos autenticados.
                    </p>
                  </div>
                </div>

                <div className="form-grid">
                  <div className="form-group form-full">
                    <label className="form-label">Nome da clínica</label>
                    <input
                      className="form-input"
                      value={brandingForm.clinicName}
                      onChange={event => setBrandingForm(current => ({ ...current, clinicName: event.target.value }))}
                      placeholder="Ex: Le Visage Maison"
                    />
                  </div>
                </div>

                <div className="media-upload-card">
                  <div className="media-upload-preview branding-media-preview">
                    <img src={previewBrandLogo} alt={`Pré-visualização da logo de ${previewClinicName}`} className="media-upload-image" />
                  </div>

                  <div className="media-upload-actions branding-media-actions">
                    <div className="branding-action-row">
                      <label className="btn btn-outline btn-sm photo-upload-btn">
                        <Icon name="camera" /> Escolher logo
                        <input type="file" accept="image/*" hidden onChange={handleBrandLogoChange} />
                      </label>

                      <button type="button" className="btn btn-ghost btn-sm" onClick={handleRestorePlatformBrand}>
                        Usar marca da plataforma
                      </button>
                    </div>

                    <p className="text-muted media-upload-copy">
                      A imagem é redimensionada automaticamente para um quadro quadrado, preservando a leitura da marca em mobile, tablet e desktop.
                    </p>
                  </div>
                </div>
              </section>

              <aside className="branding-preview-card">
                <div className="branding-preview-head">
                  <h3 className="section-title section-title-sm">Como a clínica vai aparecer</h3>
                  <p className="section-copy">Confira a visualização antes de salvar para evitar logos apertadas ou com pouco contraste.</p>
                </div>

                <BrandPreviewPanel
                  clinicName={previewClinicName}
                  brandLogo={previewBrandLogo}
                  hasCustomLogo={previewHasCustomLogo}
                  billingLabel={billing.label}
                />
              </aside>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-ghost" onClick={() => setBrandingOpen(false)} disabled={savingBranding}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" onClick={handleSaveBranding} disabled={savingBranding}>
                {savingBranding ? <span className="spinner" /> : 'Salvar identidade'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
