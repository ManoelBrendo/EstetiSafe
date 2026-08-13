import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import toast from 'react-hot-toast'
import api, { getApiErrorMessage } from './api'
import { getClinicBranding, prepareClinicLogoDataUrl } from './branding'
import { Icon } from './Icon'
import type { BillingGatewayStatusResponse, ClinicOperationalScope } from './operationsTypes'
import type { AuthUser } from './types'
import { useAuth } from './useAuth'

interface PrivacyInventoryItem {
  key: string
  label: string
  count: number
  sensitivity: string
  retention: string
  description: string
}

interface PrivacyPolicyItem {
  key: string
  title: string
  retention: string
  reason: string
}

interface PrivacyControlItem {
  key: string
  title: string
  description: string
}

interface PrivacyEventItem {
  id?: number | string
  action: string
  actorEmail?: string | null
  actorRole?: string | null
  entityType?: string | null
  createdAt?: string | null
}

interface PrivacySummaryResponse {
  generatedAt: string
  counts: Record<string, number>
  inventory: PrivacyInventoryItem[]
  criticalAreas: string[]
  retentionPolicy: PrivacyPolicyItem[]
  securityControls: PrivacyControlItem[]
  dataSubjectRights: string[]
  recentEvents: PrivacyEventItem[]
  message: string
}

interface NotificationStatusResponse {
  generatedAt: string
  channels?: {
    whatsapp?: {
      status?: string
      readyForLive?: boolean
      activeConfigCount?: number
      outboundLast24h?: number
      inboundLast24h?: number
      failedLast24h?: number
      missing?: string[]
      message?: string
    }
  }
  message?: string
}

interface DeletionReviewForm {
  clientId: string
  reason: string
}

const emptyDeletionReviewForm: DeletionReviewForm = {
  clientId: '',
  reason: '',
}

const clinicOperationalScopeOptions: Array<{
  value: ClinicOperationalScope
  label: string
  helper: string
}> = [
  { value: 'FACIAL', label: 'Estética facial', helper: 'Fichas, imagem e higienização.' },
  { value: 'INJECTABLES', label: 'Injetáveis', helper: 'Termos específicos e intercorrências.' },
  { value: 'LASER', label: 'Laser e tecnologias', helper: 'Equipamentos, treinamento e consentimento.' },
  { value: 'BODY', label: 'Corporais', helper: 'Medidas, evolução e acessórios.' },
  { value: 'ADVANCED', label: 'Protocolos avançados', helper: 'Riscos, eventos adversos e emergência.' },
]

function normalizeOperationalScopes(scopes: unknown): ClinicOperationalScope[] {
  if (!Array.isArray(scopes)) return []

  const allowed = new Set(clinicOperationalScopeOptions.map(option => option.value))
  return Array.from(new Set(
    scopes
      .map(scope => String(scope || '').trim().toUpperCase() as ClinicOperationalScope)
      .filter(scope => allowed.has(scope))
  ))
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Ainda nao registrado'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Data invalida'

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

function readinessText(status?: string | null) {
  if (!status) return 'Indisponivel'
  if (status === 'READY') return 'Pronto'
  if (status === 'PARTIAL') return 'Parcial'
  if (status === 'SIMULATION') return 'Simulacao'
  if (status === 'NOT_CONFIGURED') return 'Nao configurado'
  return status
}

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = href
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(href)
}

function SettingsStatusCard({
  label,
  value,
  helper,
  tone = 'default',
}: {
  label: string
  value: string | number
  helper: string
  tone?: string
}) {
  return (
    <article className={`settings-status-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{helper}</small>
    </article>
  )
}

export default function Configuracoes() {
  const { user, refreshUser } = useAuth()
  const branding = useMemo(() => getClinicBranding(user), [user])
  const [clinicName, setClinicName] = useState(user?.clinicName || '')
  const [clinicLogoDataUrl, setClinicLogoDataUrl] = useState<string | null>(user?.clinicLogoDataUrl || null)
  const [clinicOperationalScopes, setClinicOperationalScopes] = useState<ClinicOperationalScope[]>(() => (
    normalizeOperationalScopes(user?.clinicOperationalScopes)
  ))
  const [privacy, setPrivacy] = useState<PrivacySummaryResponse | null>(null)
  const [gatewayStatus, setGatewayStatus] = useState<BillingGatewayStatusResponse | null>(null)
  const [notificationStatus, setNotificationStatus] = useState<NotificationStatusResponse | null>(null)
  const [deletionReviewForm, setDeletionReviewForm] = useState<DeletionReviewForm>(emptyDeletionReviewForm)
  const [loading, setLoading] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)
  const [preparingLogo, setPreparingLogo] = useState(false)
  const [exportingPrivacy, setExportingPrivacy] = useState(false)
  const [requestingReview, setRequestingReview] = useState(false)
  const [editingWhatsapp, setEditingWhatsapp] = useState(false)
  const [whatsappForm, setWhatsappForm] = useState({
    phoneNumberId: '',
    businessAccountId: '',
    accessToken: '',
    verifyToken: '',
    defaultLanguage: 'pt_BR',
    appointmentTemplateName: 'appointment_confirmation',
    consentTemplateName: 'consent_link',
    active: false
  })
  const [savingWhatsapp, setSavingWhatsapp] = useState(false)

  useEffect(() => {
    setClinicName(user?.clinicName || '')
    setClinicLogoDataUrl(user?.clinicLogoDataUrl || null)
    setClinicOperationalScopes(normalizeOperationalScopes(user?.clinicOperationalScopes))
  }, [user?.clinicLogoDataUrl, user?.clinicName, user?.clinicOperationalScopes])

  const loadSettings = useCallback(async () => {
    setLoading(true)

    const [profileResult, privacyResult, gatewayResult, notificationResult, whatsappConfigResult] = await Promise.allSettled([
      api.get<AuthUser>('/clinic/profile'),
      api.get<PrivacySummaryResponse>('/clinic/privacy/summary'),
      api.get<BillingGatewayStatusResponse>('/billing/gateway/status'),
      api.get<NotificationStatusResponse>('/notifications/status'),
      api.get('/notifications/config'),
    ])

    if (profileResult.status === 'fulfilled') {
      setClinicName(profileResult.value.data.clinicName || '')
      setClinicLogoDataUrl(profileResult.value.data.clinicLogoDataUrl || null)
      setClinicOperationalScopes(normalizeOperationalScopes(profileResult.value.data.clinicOperationalScopes))
    }

    if (privacyResult.status === 'fulfilled') {
      setPrivacy(privacyResult.value.data)
    } else {
      toast.error(getApiErrorMessage(privacyResult.reason, 'Nao foi possivel carregar o resumo LGPD'))
    }

    if (gatewayResult.status === 'fulfilled') {
      setGatewayStatus(gatewayResult.value.data)
    } else {
      setGatewayStatus(null)
    }

    if (notificationResult.status === 'fulfilled') {
      setNotificationStatus(notificationResult.value.data)
    } else {
      setNotificationStatus(null)
    }

    if (whatsappConfigResult.status === 'fulfilled') {
      setWhatsappForm({
        phoneNumberId: whatsappConfigResult.value.data.phoneNumberId || '',
        businessAccountId: whatsappConfigResult.value.data.businessAccountId || '',
        accessToken: whatsappConfigResult.value.data.accessToken || '',
        verifyToken: whatsappConfigResult.value.data.verifyToken || '',
        defaultLanguage: whatsappConfigResult.value.data.defaultLanguage || 'pt_BR',
        appointmentTemplateName: whatsappConfigResult.value.data.appointmentTemplateName || 'appointment_confirmation',
        consentTemplateName: whatsappConfigResult.value.data.consentTemplateName || 'consent_link',
        active: whatsappConfigResult.value.data.active || false
      })
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  async function handleLogoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setPreparingLogo(true)
    try {
      const preparedLogo = await prepareClinicLogoDataUrl(file)
      setClinicLogoDataUrl(preparedLogo)
      toast.success('Logo preparada. Salve para aplicar na clinica.')
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Nao foi possivel preparar a logo'))
    } finally {
      setPreparingLogo(false)
    }
  }

  function toggleOperationalScope(scope: ClinicOperationalScope) {
    setClinicOperationalScopes(current => (
      current.includes(scope)
        ? current.filter(item => item !== scope)
        : [...current, scope]
    ))
  }

  async function handleSaveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (clinicName.trim().length < 2) {
      toast.error('Informe um nome de clinica com pelo menos 2 caracteres')
      return
    }

    setSavingProfile(true)
    try {
      await api.put('/clinic/profile', {
        clinicName: clinicName.trim(),
        clinicLogoDataUrl,
        clinicOperationalScopes,
      })
      await refreshUser()
      toast.success('Identidade da clinica atualizada')
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Nao foi possivel salvar as configuracoes'))
    } finally {
      setSavingProfile(false)
    }
  }

  async function handleExportPrivacy() {
    setExportingPrivacy(true)
    try {
      const response = await api.post<{ export: unknown }>('/clinic/privacy/export')
      downloadJson(`inventario-lgpd-${new Date().toISOString().slice(0, 10)}.json`, response.data.export)
      toast.success('Inventario LGPD exportado com seguranca')
      void loadSettings()
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Nao foi possivel exportar o inventario LGPD'))
    } finally {
      setExportingPrivacy(false)
    }
  }

  async function handleDeletionReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (deletionReviewForm.reason.trim().length < 10) {
      toast.error('Explique o motivo da revisao antes de registrar')
      return
    }

    setRequestingReview(true)
    try {
      await api.post('/clinic/privacy/deletion-review', {
        clientId: deletionReviewForm.clientId.trim() || null,
        reason: deletionReviewForm.reason.trim(),
      })
      setDeletionReviewForm(emptyDeletionReviewForm)
      toast.success('Revisao registrada. Nenhum dado clinico foi apagado.')
      void loadSettings()
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Nao foi possivel registrar a revisao'))
    } finally {
      setRequestingReview(false)
    }
  }

  async function handleSaveWhatsapp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!whatsappForm.phoneNumberId.trim()) {
      toast.error('Informe o Phone Number ID')
      return
    }
    if (!whatsappForm.verifyToken.trim()) {
      toast.error('Informe o Token de Verificação')
      return
    }

    setSavingWhatsapp(true)
    try {
      await api.put('/notifications/config', whatsappForm)
      toast.success('Configuração de WhatsApp salva com sucesso')
      setEditingWhatsapp(false)
      void loadSettings()
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Não foi possível salvar a configuração de WhatsApp'))
    } finally {
      setSavingWhatsapp(false)
    }
  }

  const whatsapp = notificationStatus?.channels?.whatsapp
  const gatewayReadiness = gatewayStatus?.readiness
  const totalSensitiveRecords = useMemo(
    () => privacy?.inventory.reduce((total, item) => total + Number(item.count || 0), 0) || 0,
    [privacy]
  )

  return (
    <div className="page settings-page">
      <div className="page-header">
        <div>
          <span className="eyebrow">Governanca da clinica</span>
          <h1 className="page-title">Configuracoes</h1>
          <p className="page-subtitle">
            Centralize identidade, seguranca, LGPD e prontidao operacional sem misturar isso com o atendimento do dia a dia.
          </p>
        </div>

        <button className="btn btn-outline" type="button" onClick={loadSettings} disabled={loading}>
          <Icon name="refresh" /> {loading ? 'Atualizando...' : 'Atualizar'}
        </button>
      </div>

      <section className="section-card settings-identity-card">
        <div className="section-head">
          <div>
            <span className="eyebrow">Identidade visual</span>
            <h2>Clinica e marca</h2>
            <p className="section-subtitle">
              Ajustes leves que aparecem na navegacao, prontuarios e areas administrativas.
            </p>
          </div>
        </div>

        <form className="settings-identity-grid" onSubmit={handleSaveProfile}>
          <div className="settings-brand-preview">
            <img src={clinicLogoDataUrl || branding.brandLogo} alt={`Logo ${clinicName || branding.clinicName}`} />
            <div>
              <strong>{clinicName || branding.clinicName}</strong>
              <span>{branding.brandSubtitle}</span>
            </div>
          </div>

          <div className="form-grid settings-form-grid">
            <label className="form-group">
              <span className="form-label">Nome da clinica</span>
              <input
                className="form-input"
                value={clinicName}
                onChange={event => setClinicName(event.target.value)}
                placeholder="Clinica Aurora"
                maxLength={120}
              />
            </label>

            <div className="form-group">
              <span className="form-label">Logo do SaaS na clinica</span>
              <div className="settings-logo-actions">
                <label className={`btn btn-outline photo-upload-btn ${preparingLogo ? 'is-disabled' : ''}`}>
                  <Icon name="camera" /> {preparingLogo ? 'Preparando...' : 'Trocar logo'}
                  <input type="file" accept="image/*" hidden onChange={handleLogoChange} disabled={preparingLogo} />
                </label>

                <button className="btn btn-ghost" type="button" onClick={() => setClinicLogoDataUrl(null)}>
                  Remover logo
                </button>
              </div>
            </div>

            <div className="form-group form-full">
              <span className="form-label">Perfil operacional para documentos e auditoria</span>
              <div className="settings-scope-grid">
                {clinicOperationalScopeOptions.map(option => {
                  const selectedScope = clinicOperationalScopes.includes(option.value)

                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`settings-scope-option ${selectedScope ? 'is-selected' : ''}`}
                      aria-pressed={selectedScope}
                      onClick={() => toggleOperationalScope(option.value)}
                    >
                      <Icon name={selectedScope ? 'check' : 'plus'} size={16} />
                      <span>
                        <strong>{option.label}</strong>
                        <small>{option.helper}</small>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="settings-actions-row">
            <button className="btn btn-primary" type="submit" disabled={savingProfile || preparingLogo}>
              <Icon name="check" /> {savingProfile ? 'Salvando...' : 'Salvar identidade'}
            </button>
          </div>
        </form>
      </section>

      <section className="section-card">
        <div className="section-head">
          <div>
            <span className="eyebrow">Seguranca e LGPD</span>
            <h2>Mapa de dados sensiveis</h2>
            <p className="section-subtitle">
              Visao executiva do que a clinica guarda, sem abrir conteudo de prontuario ou documentos privados nesta tela.
            </p>
          </div>
          <span className="badge badge-blue">Atualizado {formatDateTime(privacy?.generatedAt)}</span>
        </div>

        <div className="settings-status-grid">
          <SettingsStatusCard
            label="Registros mapeados"
            value={totalSensitiveRecords}
            helper="Soma de cadastros, documentos, prontuarios, consentimentos e auditoria"
          />
          <SettingsStatusCard
            label="Areas criticas"
            value={privacy?.criticalAreas?.length || 0}
            helper="Itens com informacao clinica ou autorizacao sensivel"
            tone="is-alert"
          />
          <SettingsStatusCard
            label="Eventos recentes"
            value={privacy?.recentEvents?.length || 0}
            helper="Acoes rastreadas de privacidade, assinatura e acesso"
          />
        </div>

        <div className="settings-privacy-grid">
          {(privacy?.inventory || []).map(item => (
            <article className="settings-data-card" key={item.key}>
              <div>
                <span className="eyebrow">{item.sensitivity}</span>
                <strong>{item.label}</strong>
                <p>{item.description}</p>
              </div>
              <span className="settings-data-count">{item.count}</span>
              <small>{item.retention}</small>
            </article>
          ))}
        </div>

        {!privacy && !loading && (
          <div className="support-empty-state">
            <Icon name="shield" />
            <strong>Nao foi possivel carregar o resumo LGPD</strong>
            <span>Tente atualizar a tela ou verifique se o backend esta ativo.</span>
          </div>
        )}
      </section>

      <div className="settings-two-column">
        <section className="section-card">
          <div className="section-head">
            <div>
              <span className="eyebrow">Controles ativos</span>
              <h2>Barreiras de seguranca</h2>
            </div>
          </div>

          <div className="settings-check-list">
            {(privacy?.securityControls || []).map(control => (
              <article key={control.key}>
                <Icon name="check" />
                <div>
                  <strong>{control.title}</strong>
                  <span>{control.description}</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="section-card">
          <div className="section-head">
            <div>
              <span className="eyebrow">Retencao</span>
              <h2>Politica operacional</h2>
            </div>
          </div>

          <div className="settings-policy-list">
            {(privacy?.retentionPolicy || []).map(policy => (
              <article key={policy.key}>
                <strong>{policy.title}</strong>
                <span>{policy.retention}</span>
                <small>{policy.reason}</small>
              </article>
            ))}
          </div>
        </section>
      </div>

      <section className="section-card">
        <div className="section-head">
          <div>
            <span className="eyebrow">Direitos e solicitacoes</span>
            <h2>Exportacao e revisao de eliminacao</h2>
            <p className="section-subtitle">
              A exportacao gera inventario seguro. Pedidos de eliminacao viram auditoria e exigem revisao antes de qualquer acao destrutiva.
            </p>
          </div>
          <button className="btn btn-outline" type="button" onClick={handleExportPrivacy} disabled={exportingPrivacy}>
            <Icon name="download" /> {exportingPrivacy ? 'Exportando...' : 'Exportar inventario'}
          </button>
        </div>

        <form className="form-grid settings-review-form" onSubmit={handleDeletionReview}>
          <label className="form-group">
            <span className="form-label">ID da cliente (opcional)</span>
            <input
              className="form-input"
              inputMode="numeric"
              value={deletionReviewForm.clientId}
              onChange={event => setDeletionReviewForm(current => ({ ...current, clientId: event.target.value }))}
              placeholder="Ex: 12"
            />
          </label>

          <label className="form-group settings-review-reason">
            <span className="form-label">Motivo da revisao</span>
            <textarea
              className="form-input"
              value={deletionReviewForm.reason}
              onChange={event => setDeletionReviewForm(current => ({ ...current, reason: event.target.value }))}
              placeholder="Explique o motivo para revisao LGPD antes de qualquer eliminacao"
              rows={4}
            />
          </label>

          <div className="settings-actions-row">
            <button className="btn btn-primary" type="submit" disabled={requestingReview}>
              <Icon name="shield" /> {requestingReview ? 'Registrando...' : 'Registrar revisao'}
            </button>
          </div>
        </form>
      </section>

      <section className="section-card">
        <div className="section-head">
          <div>
            <span className="eyebrow">Prontidao operacional</span>
            <h2>Integracoes criticas</h2>
            <p className="section-subtitle">
              Estado resumido de notificacoes e cobranca, sem expor tokens, chaves ou credenciais.
            </p>
          </div>
        </div>

        <div className="settings-integration-grid">
          <article className="settings-integration-card">
            <Icon name="phone" />
            <div>
              <span>WhatsApp Business</span>
              <strong>{readinessText(whatsapp?.status)}</strong>
              <p>{whatsapp?.message || 'Status indisponivel no momento.'}</p>
              <small>
                Enviadas 24h: {whatsapp?.outboundLast24h || 0} | Recebidas 24h: {whatsapp?.inboundLast24h || 0}
              </small>
              <div style={{ marginTop: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-outline btn-xs"
                  onClick={() => setEditingWhatsapp(true)}
                >
                  <Icon name="edit" size={12} /> Configurar
                </button>
              </div>
            </div>
          </article>

          <article className="settings-integration-card">
            <Icon name="dollar" />
            <div>
              <span>Gateway de pagamento</span>
              <strong>{readinessText(gatewayReadiness?.status || gatewayStatus?.mode)}</strong>
              <p>{gatewayReadiness?.message || gatewayStatus?.message || 'Status indisponivel no momento.'}</p>
              <small>
                Provider: {gatewayStatus?.provider || 'nao definido'} | Webhook: {gatewayStatus?.webhookConfigured ? 'sim' : 'nao'}
              </small>
            </div>
          </article>
        </div>
      </section>

      {editingWhatsapp && (
        <div className="modal-backdrop" onClick={event => event.target === event.currentTarget && setEditingWhatsapp(false)}>
          <div className="modal">
            <h2 className="modal-title">Configurar WhatsApp</h2>
            <form onSubmit={handleSaveWhatsapp} className="form-grid">
              <label className="form-group form-full">
                <span className="form-label">Phone Number ID</span>
                <input
                  type="text"
                  className="form-input"
                  value={whatsappForm.phoneNumberId}
                  onChange={e => setWhatsappForm({ ...whatsappForm, phoneNumberId: e.target.value })}
                  placeholder="Ex: 104847294827"
                  required
                />
              </label>
              <label className="form-group form-full">
                <span className="form-label">Business Account ID (Opcional)</span>
                <input
                  type="text"
                  className="form-input"
                  value={whatsappForm.businessAccountId}
                  onChange={e => setWhatsappForm({ ...whatsappForm, businessAccountId: e.target.value })}
                  placeholder="Ex: 2948274928"
                />
              </label>
              <label className="form-group form-full">
                <span className="form-label">Access Token (Meta Developer)</span>
                <input
                  type="password"
                  className="form-input"
                  value={whatsappForm.accessToken}
                  onChange={e => setWhatsappForm({ ...whatsappForm, accessToken: e.target.value })}
                  placeholder={whatsappForm.accessToken ? '••••••••' : 'Insira o token permanente'}
                />
              </label>
              <label className="form-group form-full">
                <span className="form-label">Verify Token (Webhook validation)</span>
                <input
                  type="text"
                  className="form-input"
                  value={whatsappForm.verifyToken}
                  onChange={e => setWhatsappForm({ ...whatsappForm, verifyToken: e.target.value })}
                  placeholder="Ex: meu_token_seguro"
                  required
                />
              </label>
              <label className="form-group">
                <span className="form-label">Idioma Padrão</span>
                <input
                  type="text"
                  className="form-input"
                  value={whatsappForm.defaultLanguage}
                  onChange={e => setWhatsappForm({ ...whatsappForm, defaultLanguage: e.target.value })}
                  placeholder="pt_BR"
                />
              </label>
              <label className="form-group">
                <span className="form-label">Template de Confirmação</span>
                <input
                  type="text"
                  className="form-input"
                  value={whatsappForm.appointmentTemplateName}
                  onChange={e => setWhatsappForm({ ...whatsappForm, appointmentTemplateName: e.target.value })}
                  placeholder="appointment_confirmation"
                />
              </label>
              <label className="form-group form-full">
                <span className="form-label">Template do TCLE / Consentimento</span>
                <input
                  type="text"
                  className="form-input"
                  value={whatsappForm.consentTemplateName}
                  onChange={e => setWhatsappForm({ ...whatsappForm, consentTemplateName: e.target.value })}
                  placeholder="consent_link"
                />
              </label>
              <div className="form-group form-full" style={{ display: 'flex', alignItems: 'center', margin: '0.5rem 0' }}>
                <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={whatsappForm.active}
                    onChange={e => setWhatsappForm({ ...whatsappForm, active: e.target.checked })}
                  />
                  <span>Habilitar envio automático de lembretes</span>
                </label>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setEditingWhatsapp(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={savingWhatsapp}>
                  <Icon name="check" /> {savingWhatsapp ? 'Salvando...' : 'Salvar configurações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
