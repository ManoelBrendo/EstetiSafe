import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import api, { getApiErrorMessage } from './api'
import { useAuth } from './useAuth'
import type { BillingStatusKey, ClinicStatusKey, SupportClinicRecord, SupportClinicsResponse } from './operationsTypes'
import { Icon } from './Icon'
import { getClinicInitials } from './branding'

const billingMeta: Record<BillingStatusKey, { label: string; className: string }> = {
  TRIAL: { label: 'Cortesia ativa', className: 'badge badge-blue' },
  ACTIVE: { label: 'Pagamento em dia', className: 'badge badge-green' },
  OVERDUE: { label: 'Pagamento pendente', className: 'badge badge-gold' },
  BLOCKED: { label: 'Acesso bloqueado', className: 'badge badge-red' },
}

const clinicStatusMeta: Record<ClinicStatusKey, { label: string }> = {
  ACTIVE: { label: 'Operação ativa' },
  SUSPENDED: { label: 'Operação suspensa' },
  ARCHIVED: { label: 'Clínica arquivada' },
}

function formatDate(value?: string | null) {
  if (!value) return 'Não informado'

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
  }).format(new Date(value))
}

function formatCurrency(value?: number | null) {
  if (value == null) return 'A definir'

  return Number(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

const initialData: SupportClinicsResponse = {
  totalClinics: 0,
  blockedCount: 0,
  overdueCount: 0,
  clinics: [],
}

export default function SupportHub() {
  const navigate = useNavigate()
  const { assumeClinic, user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [assumingClinicId, setAssumingClinicId] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [data, setData] = useState<SupportClinicsResponse>(initialData)

  useEffect(() => {
    let active = true

    api.get<SupportClinicsResponse>('/support/clinics')
      .then(({ data: response }) => {
        if (active) setData(response)
      })
      .catch(error => {
        toast.error(getApiErrorMessage(error, 'Não foi possível carregar as clínicas disponiveis para suporte'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const filteredClinics = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return data.clinics

    return data.clinics.filter((clinic: SupportClinicRecord) => (
      clinic.clinicName?.toLowerCase().includes(normalizedQuery)
      || clinic.email?.toLowerCase().includes(normalizedQuery)
      || String(clinic.clinicId || '').toLowerCase().includes(normalizedQuery)
      || String(clinic.clinicStatus || '').toLowerCase().includes(normalizedQuery)
    ))
  }, [data.clinics, query])

  const hasQuery = Boolean(query.trim())

  async function handleAssumeClinic(clinicId: number) {
    setAssumingClinicId(clinicId)

    try {
      await assumeClinic(clinicId)
      toast.success('Sessão da clínica carregada para manutenção')
      navigate('/')
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Não foi possível assumir esta clínica'))
    } finally {
      setAssumingClinicId(null)
    }
  }

  if (loading) {
    return (
      <div className="loading-page">
        <span className="spinner" />
        Carregando central de suporte...
      </div>
    )
  }

  return (
    <div className="page support-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Central de suporte</h1>
          <p className="page-subtitle">
            {user?.clinicName || 'Central de suporte'} - selecione a clínica correta para manutenção, ajustes e acompanhamento.
          </p>
        </div>

        <span className="badge badge-gold">Operação técnica</span>
      </div>

      <div className="stats-grid compact-stats stats-grid-adaptive">
        <div className="stat-card gold">
          <div className="stat-label">Clínicas</div>
          <div className="stat-value">{data.totalClinics}</div>
          <div className="stat-sub">Base disponível para suporte e manutenção.</div>
        </div>
        <div className="stat-card rose">
          <div className="stat-label">Bloqueadas</div>
          <div className="stat-value">{data.blockedCount}</div>
          <div className="stat-sub">Acessos suspensos aguardando regularização.</div>
        </div>
        <div className="stat-card green">
          <div className="stat-label">Pendentes</div>
          <div className="stat-value">{data.overdueCount}</div>
          <div className="stat-sub">Clínicas com cobrança em atraso e risco de bloqueio.</div>
        </div>
      </div>

      <section className="card section-card support-toolbar">
        <div>
          <h2 className="section-title">Localizar clínica</h2>
          <p className="section-copy">Filtre por nome da clínica, e-mail, ID interno ou situacao operacional para entrar no ambiente correto sem confusao.</p>
        </div>

        <div className="form-group support-search-group">
          <label className="form-label">Busca rápida</label>
          <div className="toolbar-card clientes-search-row">
            <input
              className="form-input"
              type="search"
              value={query}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
              placeholder="Ex: Le Visage, contato@cliente.com, cln_123"
            />
            {hasQuery ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setQuery('')}>
                Limpar busca
              </button>
            ) : null}
          </div>
          <p className="filter-helper-text" aria-live="polite">
            {hasQuery
              ? `${filteredClinics.length} clínica(s) correspondem aos criterios atuais.`
              : 'Use busca por nome, e-mail, ID ou situacao operacional para chegar a conta correta com menos risco de erro.'}
          </p>
        </div>
      </section>

      {filteredClinics.length ? (
        <section className="support-clinic-grid">
          {filteredClinics.map(clinic => {
            const status = billingMeta[(clinic.billing?.effectiveStatus as BillingStatusKey) || 'TRIAL'] || billingMeta.TRIAL
            const clinicStatus = clinicStatusMeta[(clinic.clinicStatus as ClinicStatusKey) || 'ACTIVE'] || clinicStatusMeta.ACTIVE

            return (
              <article key={clinic.id} className="card support-clinic-card">
                <div className="support-clinic-head">
                  <div className="support-clinic-brand">
                    <div className="support-clinic-logo">
                      {clinic.clinicLogoDataUrl ? (
                        <img src={clinic.clinicLogoDataUrl} alt={`Logo de ${clinic.clinicName}`} />
                      ) : (
                        <span>{getClinicInitials(clinic.clinicName)}</span>
                      )}
                    </div>

                    <div className="support-clinic-copy-block">
                      <h3 className="section-title support-clinic-title">{clinic.clinicName}</h3>
                      <p className="section-copy support-clinic-copy">{clinic.email}</p>
                    </div>
                  </div>

                  <span className={`${status.className} support-clinic-status`}>{status.label}</span>
                </div>

                <div className="support-clinic-meta">
                  <div className="document-meta-item support-clinic-meta-item">
                    <span>Cadastro</span>
                    <strong>{formatDate(clinic.createdAt)}</strong>
                  </div>
                  <div className="document-meta-item support-clinic-meta-item">
                    <span>ID da clínica</span>
                    <strong>{clinic.clinicId || 'Não definido'}</strong>
                  </div>
                  <div className="document-meta-item support-clinic-meta-item">
                    <span>Próximo vencimento</span>
                    <strong>{formatDate(clinic.billing?.nextDueAt || clinic.billing?.graceEndsAt)}</strong>
                  </div>
                  <div className="document-meta-item support-clinic-meta-item">
                    <span>Plano atual</span>
                    <strong>{formatCurrency(clinic.billing?.amount)}</strong>
                  </div>
                </div>

                <p className="support-clinic-note"><strong>{clinicStatus.label}</strong> - {clinic.billing?.message || 'Sem observações de cobrança no momento.'}</p>

                <div className="support-card-actions">
                  <button
                    type="button"
                    className="btn btn-gold"
                    onClick={() => void handleAssumeClinic(clinic.id)}
                    disabled={assumingClinicId === clinic.id}
                  >
                    {assumingClinicId === clinic.id ? <span className="spinner" /> : <><Icon name="dashboard" /> Assumir acesso</>}
                  </button>
                </div>
              </article>
            )
          })}
        </section>
      ) : (
        <section className="card section-card support-empty-state">
          <h2 className="section-title">Nenhuma clínica encontrada</h2>
          <p className="section-copy">Ajuste ou limpe a busca para localizar a conta certa antes de iniciar a manutenção.</p>
          {hasQuery ? (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setQuery('')}>
              Limpar busca
            </button>
          ) : null}
        </section>
      )}
    </div>
  )
}
