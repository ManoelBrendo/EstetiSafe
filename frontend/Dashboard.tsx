import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import api, { getApiErrorMessage } from './api'
import { useAuth } from './useAuth'
import { Icon, type IconName } from './Icon'
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

interface EssentialMetricProps {
  label: string
  value: string | number
  helper: string
  tone?: 'neutral' | 'attention'
}

interface ModuleStatProps {
  label: string
  value: string | number
  tone?: 'neutral' | 'attention'
}

interface DashboardDisclosureProps {
  title: string
  value: string | number
  defaultOpen?: boolean
  children: ReactNode
}

interface CommandLinkProps {
  to: string
  icon: IconName
  label: string
  emphasis?: 'primary' | 'attention' | 'quiet'
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

function EssentialMetric({ label, value, helper, tone = 'neutral' }: EssentialMetricProps) {
  return (
    <article className={`dashboard-essential-metric dashboard-essential-metric-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{helper}</small>
    </article>
  )
}

function ModuleStat({ label, value, tone = 'neutral' }: ModuleStatProps) {
  return (
    <div className={`dashboard-module-stat dashboard-module-stat-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function DashboardDisclosure({ title, value, defaultOpen = false, children }: DashboardDisclosureProps) {
  return (
    <details open={defaultOpen}>
      <summary>
        <span>{title}</span>
        <strong>{value}</strong>
      </summary>
      <div className="dashboard-detail-body">
        {children}
      </div>
    </details>
  )
}

function CommandLink({ to, icon, label, emphasis = 'quiet' }: CommandLinkProps) {
  const className = emphasis === 'primary'
    ? 'btn btn-primary btn-sm'
    : emphasis === 'attention'
      ? 'btn btn-gold btn-sm'
      : 'btn btn-outline btn-sm'

  return (
    <Link to={to} className={className}>
      <Icon name={icon} /> {label}
    </Link>
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
  const pendingActionCount = criticalDocumentsCount + inventoryAlerts.length + clinicalCriticalCount

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

          <div className="dashboard-brand-actions">
            <button type="button" className="btn btn-outline btn-sm" onClick={openBrandingEditor}>
              <Icon name="camera" /> Personalizar marca
            </button>
          </div>
        </div>
      </section>

      <section className="dashboard-command-panel" aria-label="Resumo essencial do painel clínico">
        <div className={`dashboard-command-main ${pendingActionCount ? 'has-alerts' : 'is-clear'}`}>
          <div className="dashboard-command-kicker">
            <span className="dashboard-command-icon" aria-hidden="true">
              <Icon name={pendingActionCount ? 'sparkles' : 'shield'} size={18} />
            </span>
            <span className="eyebrow">Agora</span>
            <span className={`dashboard-status-pill ${pendingActionCount ? 'is-alert' : 'is-clear'}`}>
              {pendingActionCount ? 'Prioridade' : 'Estável'}
            </span>
          </div>
          <h2>{pendingActionCount ? `${pendingActionCount} ponto(s) precisam de revisão` : 'Operação sem alerta crítico'}</h2>
          <p>
            {pendingActionCount
              ? 'Priorize os itens abaixo antes de abrir módulos secundários.'
              : 'Agenda, documentos e operação estão sem sinal crítico no momento.'}
          </p>

          <div className="dashboard-command-actions">
            <CommandLink to="/agendamentos" icon="calendar" label="Agenda" emphasis="primary" />
            <CommandLink to="/documentos" icon="fileText" label="Documentos" emphasis={criticalDocumentsCount ? 'attention' : 'quiet'} />
            <CommandLink to="/produtos-e-equipamentos" icon="box" label="Operação" emphasis={inventoryAlerts.length ? 'attention' : 'quiet'} />
          </div>
        </div>
      </section>

      <section className="dashboard-minimal-details" aria-label="Detalhes operacionais recolhidos">
        <DashboardDisclosure title="Indicadores" value={`${pendingActionCount} pendência(s)`}>
          <section className="dashboard-essential-strip" aria-label="Indicadores essenciais">
            <EssentialMetric label="Receita" value={fmtBRL(data?.month?.revenue)} helper="Mês atual" />
            <EssentialMetric label="Atendimentos" value={data?.month?.totalAppointments ?? 0} helper="Concluídos" />
            <EssentialMetric label="Clientes" value={data?.month?.totalClients ?? 0} helper="Base ativa" />
            <EssentialMetric
              label="Pendências"
              value={pendingActionCount}
              helper="Documentos, operação e sinais"
              tone={pendingActionCount ? 'attention' : 'neutral'}
            />
          </section>
        </DashboardDisclosure>

        <DashboardDisclosure
          title="Itens para revisar"
          value={pendingActionCount || 'Nenhum alerta'}
        >
          {!pendingActionCount ? (
            <p className="text-muted">Nada crítico agora. Use os atalhos principais apenas quando precisar aprofundar.</p>
          ) : null}

          {criticalAlerts.slice(0, 3).map(alert => (
            <AlertCard
              key={alert.id}
              title={alert.title}
              subtitle={alert.documentType}
              statusLabel={alert.statusLabel}
              badgeClass={alert.status === 'EXPIRED' ? 'badge-red' : 'badge-gold'}
              dateLabel={formatDate(alert.expiresAt)}
            />
          ))}

          {inventoryAlerts.slice(0, 3).map(item => (
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

          {clinicalInsightItems.slice(0, 2).map(insight => (
            <AlertCard
              key={insight.id}
              title={insight.title}
              subtitle={insight.description}
              statusLabel={getInsightPriorityLabel(insight.priority)}
              badgeClass={getInsightBadgeClass(insight.priority)}
              dateLabel={insight.actionLabel}
            />
          ))}
        </DashboardDisclosure>

        <DashboardDisclosure title="Agenda" value={data?.upcoming?.length || 0}>
          {!data?.upcoming?.length ? (
            <p className="text-muted">Nenhum atendimento próximo agendado.</p>
          ) : (
            data.upcoming.slice(0, 4).map(appointment => (
              <UpcomingCard key={appointment.id} appointment={appointment} />
            ))
          )}
          <Link to="/agendamentos" className="btn btn-ghost btn-sm">Ver agenda completa</Link>
        </DashboardDisclosure>

        <DashboardDisclosure title="Documentos" value={criticalDocumentsCount ? `${criticalDocumentsCount} crítico(s)` : 'Em dia'}>
          <div className="dashboard-module-stat-grid">
            <ModuleStat label="Total" value={documents?.total ?? 0} />
            <ModuleStat label="Em dia" value={documents?.valid ?? 0} />
            <ModuleStat label="Críticos" value={criticalDocumentsCount} tone={criticalDocumentsCount ? 'attention' : 'neutral'} />
          </div>

          {!criticalAlerts.length ? (
            <p className="text-muted">Nenhum documento crítico agora.</p>
          ) : (
            criticalAlerts.map(alert => (
              <AlertCard
                key={alert.id}
                title={alert.title}
                subtitle={alert.documentType}
                statusLabel={alert.statusLabel}
                badgeClass={alert.status === 'EXPIRED' ? 'badge-red' : 'badge-gold'}
                dateLabel={formatDate(alert.expiresAt)}
              />
            ))
          )}

          <Link to="/documentos" className="btn btn-ghost btn-sm">Abrir documentos</Link>
        </DashboardDisclosure>

        <DashboardDisclosure title="Operação" value={inventoryAlerts.length ? `${inventoryAlerts.length} alerta(s)` : 'Estável'}>
          <div className="dashboard-module-stat-grid">
            <ModuleStat label="Produtos" value={inventory?.totalProducts ?? 0} />
            <ModuleStat label="Equipamentos" value={inventory?.totalEquipment ?? 0} />
            <ModuleStat label="Alertas" value={inventoryAlerts.length} tone={inventoryAlerts.length ? 'attention' : 'neutral'} />
          </div>

          {!inventoryAlerts.length ? (
            <p className="text-muted">Nenhum alerta de estoque ou equipamento.</p>
          ) : (
            inventoryAlerts.map(item => (
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
            ))
          )}

          <Link to="/produtos-e-equipamentos" className="btn btn-ghost btn-sm">Abrir módulo</Link>
        </DashboardDisclosure>

        <DashboardDisclosure title="Inteligência operacional" value={clinicalCriticalCount ? `${clinicalCriticalCount} crítico(s)` : 'Sem crítico'}>
          <div className="dashboard-module-stat-grid">
            <ModuleStat label="Sinais" value={clinicalInsights?.total ?? 0} />
            <ModuleStat label="Críticos" value={clinicalCriticalCount} tone={clinicalCriticalCount ? 'attention' : 'neutral'} />
            <ModuleStat label="Modo" value={clinicalInsights?.externalAiEnabled ? 'IA' : 'Regras'} />
          </div>

          {!clinicalInsightItems.length ? (
            <p className="text-muted">Nenhum sinal operacional agora.</p>
          ) : (
            clinicalInsightItems.slice(0, 3).map(insight => (
              <AlertCard
                key={insight.id}
                title={insight.title}
                subtitle={insight.description}
                statusLabel={getInsightPriorityLabel(insight.priority)}
                badgeClass={getInsightBadgeClass(insight.priority)}
                dateLabel={insight.actionLabel}
              />
            ))
          )}

          <div className="inline-tip inline-tip-gold">
            <Icon name="shield" />
            {clinicalInsights?.readiness?.message || 'Leitura de apoio, sempre com revisão da profissional.'}
          </div>
        </DashboardDisclosure>

        <DashboardDisclosure title="Financeiro" value={billing.label}>
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
        </DashboardDisclosure>
      </section>

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
