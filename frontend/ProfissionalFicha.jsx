import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import api, { getApiErrorMessage } from './api'
import { Icon } from './Icon'

const weekdays = [
  { value: 'MONDAY', label: 'Segunda' },
  { value: 'TUESDAY', label: 'Terça' },
  { value: 'WEDNESDAY', label: 'Quarta' },
  { value: 'THURSDAY', label: 'Quinta' },
  { value: 'FRIDAY', label: 'Sexta' },
  { value: 'SATURDAY', label: 'Sábado' },
  { value: 'SUNDAY', label: 'Domingo' },
]

const contractTypeOptions = [
  { value: 'CLT', label: 'CLT' },
  { value: 'PJ', label: 'PJ' },
  { value: 'AUTONOMA', label: 'Autônoma' },
  { value: 'COMISSIONADA', label: 'Comissionada' },
  { value: 'PARCERIA', label: 'Parceria' },
]

const paymentModelOptions = [
  { value: 'FIXED', label: 'Fixo' },
  { value: 'COMMISSION', label: 'Comissão' },
  { value: 'HYBRID', label: 'Híbrido' },
  { value: 'DAILY', label: 'Diária' },
]

function normalizeAvailability(availability) {
  const base = weekdays.map((weekday, index) => ({
    day: weekday.value,
    label: weekday.label,
    enabled: index < 5,
    start: '09:00',
    end: '18:00',
  }))

  if (!Array.isArray(availability)) return base

  return base.map(item => {
    const current = availability.find(slot => slot.day === item.day)

    return {
      ...item,
      enabled: current?.enabled ?? item.enabled,
      start: current?.start || item.start,
      end: current?.end || item.end,
    }
  })
}

function createFormFromProfessional(professional) {
  return {
    name: professional?.name || '',
    specialty: professional?.specialty || '',
    phone: professional?.phone || '',
    notes: professional?.notes || '',
    photoDataUrl: professional?.photoDataUrl || null,
    availability: normalizeAvailability(professional?.availability),
    contractType: professional?.contractType || '',
    paymentModel: professional?.paymentModel || '',
    salaryAmount: professional?.salaryAmount != null ? String(professional.salaryAmount) : '',
    commissionRate: professional?.commissionRate != null ? String(professional.commissionRate) : '',
    paymentDay: professional?.paymentDay != null ? String(professional.paymentDay) : '',
    payrollNotes: professional?.payrollNotes || '',
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem selecionada'))
    reader.readAsDataURL(file)
  })
}

function formatDateTime(value) {
  if (!value) return 'Não informado'

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

function formatCurrency(value) {
  if (value == null || value === '') return 'Não definido'

  return Number(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function getInitials(name) {
  return (
    name
      ?.split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map(word => word[0])
      .join('')
      .toUpperCase() || 'LA'
  )
}

function getWeekdayLabel(day) {
  return weekdays.find(item => item.value === day)?.label || day
}

function ReadonlyField({ label, value }) {
  return (
    <div className="prontuario-field">
      <span>{label}</span>
      <strong>{value || 'Não informado'}</strong>
    </div>
  )
}

export default function ProfissionalFicha() {
  const navigate = useNavigate()
  const { professionalId } = useParams()
  const [loading, setLoading] = useState(true)
  const [professional, setProfessional] = useState(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(createFormFromProfessional())

  const load = useCallback(async () => {
    setLoading(true)

    try {
      const { data } = await api.get(`/professionals/${professionalId}`)
      setProfessional(data)
      setForm(createFormFromProfessional(data))
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Não foi possível abrir a ficha desta profissional'))
      navigate('/profissionais', { replace: true })
    } finally {
      setLoading(false)
    }
  }, [navigate, professionalId])

  useEffect(() => {
    load()
  }, [load])

  const activeAvailability = useMemo(
    () => (professional?.availability || []).filter(slot => slot.enabled),
    [professional]
  )

  const payrollPeriodLabel = useMemo(() => {
    const periodStart = professional?.payroll?.periodStart
    if (!periodStart) return 'competência atual'

    return new Intl.DateTimeFormat('pt-BR', {
      month: 'long',
      year: 'numeric',
    }).format(new Date(periodStart))
  }, [professional])

  function setField(key) {
    return event => {
      setForm(current => ({ ...current, [key]: event.target.value }))
    }
  }

  function updateAvailability(day, key, value) {
    setForm(current => ({
      ...current,
      availability: current.availability.map(slot => (
        slot.day === day
           ? { ...slot, [key]: value }
          : slot
      )),
    }))
  }

  async function handlePhotoChange(event) {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const dataUrl = await readFileAsDataUrl(file)
      setForm(current => ({ ...current, photoDataUrl: dataUrl }))
    } catch (error) {
      toast.error(error.message || 'Não foi possível carregar a foto')
    } finally {
      event.target.value = ''
    }
  }

  async function handleSave() {
    if (!form.name || !form.specialty) {
      toast.error('Nome e especialidade são obrigatórios')
      return
    }

    setSaving(true)

    try {
      await api.put(`/professionals/${professionalId}`, {
        name: form.name,
        specialty: form.specialty,
        phone: form.phone,
        notes: form.notes,
        photoDataUrl: form.photoDataUrl,
        availability: form.availability.map(({ day, enabled, start, end }) => ({ day, enabled, start, end })),
        contractType: form.contractType || undefined,
        paymentModel: form.paymentModel || undefined,
        salaryAmount: form.salaryAmount ? Number(form.salaryAmount) : null,
        commissionRate: form.commissionRate ? Number(form.commissionRate) : null,
        paymentDay: form.paymentDay ? Number(form.paymentDay) : null,
        payrollNotes: form.payrollNotes,
      })

      toast.success('Profissional atualizada com sucesso')
      setEditing(false)
      await load()
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Não foi possível salvar a profissional'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="page">
        <div className="loading-page">
          <span className="spinner" />
          Abrindo a ficha da profissional...
        </div>
      </div>
    )
  }

  if (!professional) return null

  return (
    <div className="page professional-detail-page">
      <div className="page-header">
        <div>
          <button type="button" className="btn btn-ghost consent-back" onClick={() => navigate('/profissionais')}>
            <Icon name="back" /> Voltar para profissionais
          </button>
          <h1 className="page-title">{professional.name}</h1>
          <p className="page-subtitle">
            Ficha individual com apresentação profissional, agenda semanal, folha de pagamento e histórico recente.
          </p>
        </div>

        <div className="billing-actions">
          <button type="button" className="btn btn-outline" onClick={() => setEditing(true)}>
            <Icon name="edit" /> Editar profissional
          </button>
          <span className="badge badge-green">Equipe ativa</span>
        </div>
      </div>

      <section className="card brand-plaque professional-hero-card">
        <div className="brand-plaque-logo professional-hero-logo">
          {professional.photoDataUrl ? (
            <img src={professional.photoDataUrl} alt={`Foto de ${professional.name}`} className="professional-detail-photo" />
          ) : (
            <div className="professional-detail-fallback">{getInitials(professional.name)}</div>
          )}
        </div>

        <div>
          <span className="eyebrow">Ficha da profissional</span>
          <h2 className="section-title">{professional.specialty}</h2>
          <p className="section-copy">{professional.availabilitySummary}</p>
          <p className="section-copy">{professional.compensationSummary}</p>
        </div>
      </section>

      <div className="overview-grid">
        <section className="card section-card">
          <div className="section-head">
            <div>
              <h2 className="section-title">Cadastro profissional</h2>
              <p className="section-copy">Leitura rápida do perfil operacional e financeiro.</p>
            </div>
          </div>

          <div className="prontuario-grid">
            <ReadonlyField label="Telefone" value={professional.phone} />
            <ReadonlyField label="Especialidade" value={professional.specialty} />
            <ReadonlyField label="Regime" value={professional.contractTypeLabel} />
            <ReadonlyField label="Modelo de pagamento" value={professional.paymentModelLabel} />
            <ReadonlyField label="Base fixa" value={formatCurrency(professional.salaryAmount)} />
            <ReadonlyField label="Comissão" value={professional.commissionRate != null ? `${professional.commissionRate}%` : ''} />
            <ReadonlyField label="Dia do repasse" value={professional.paymentDay != null ? `Dia ${professional.paymentDay}` : ''} />
            <ReadonlyField label="Cadastro" value={formatDateTime(professional.createdAt)} />
          </div>
        </section>

        <section className="card section-card">
          <div className="section-head">
            <div>
              <h2 className="section-title">Visão da operação</h2>
              <p className="section-copy">Indicadores úteis para gestão da equipe.</p>
            </div>
          </div>

          <div className="prontuario-grid">
            <ReadonlyField label="Atendimentos totais" value={String(professional.metrics?.totalAppointments ?? 0)} />
            <ReadonlyField label="Concluídos" value={String(professional.metrics?.completedAppointments ?? 0)} />
            <ReadonlyField label="Próximos" value={String(professional.metrics?.upcomingAppointments ?? 0)} />
            <ReadonlyField label="Disponibilidade" value={activeAvailability.length ? `${activeAvailability.length} dia(s) ativo(s)` : 'Não configurada'} />
          </div>
        </section>
      </div>

      <div className="professional-detail-layout">
        <section className="professional-detail-main">
          <section className="card section-card professional-payroll-card">
            <div className="section-head">
              <div>
                <h2 className="section-title">Folha de pagamento</h2>
                <p className="section-copy">Cálculo automático com base nos atendimentos pagos de {payrollPeriodLabel}.</p>
              </div>
            </div>

            <div className="prontuario-grid">
              <ReadonlyField label="Receita paga" value={formatCurrency(professional.payroll?.paidRevenue)} />
              <ReadonlyField label="Comissão calculada" value={formatCurrency(professional.payroll?.commissionAmount)} />
              <ReadonlyField label="Repasse projetado" value={formatCurrency(professional.payroll?.projectedPayout)} />
              <ReadonlyField label="Atendimentos pagos" value={String(professional.payroll?.paidAppointments ?? 0)} />
              <ReadonlyField label="Dias trabalhados" value={String(professional.payroll?.workedDays ?? 0)} />
              <ReadonlyField label="Último pagamento" value={formatDateTime(professional.payroll?.lastPaidAt)} />
            </div>

            <div className="team-card-note">
              <strong>Configuração da folha</strong>
              <span>{professional.payrollNotes || 'Nenhuma observação financeira registrada até o momento.'}</span>
            </div>
          </section>

          <section className="card section-card">
            <div className="section-head">
              <div>
                <h2 className="section-title">Observações da profissional</h2>
                <p className="section-copy">Contexto operacional, perfil de atendimento e observações livres.</p>
              </div>
            </div>

            <div className="team-card-note">
              <strong>Notas internas</strong>
              <span>{professional.notes || 'Nenhuma observação registrada.'}</span>
            </div>
          </section>
        </section>

        <aside className="professional-detail-aside">
          <section className="card documents-side-card">
            <div className="eyebrow">Agenda semanal</div>
            {!activeAvailability.length ? (
              <p className="text-muted">Disponibilidade ainda não configurada.</p>
            ) : (
              <div className="anamnese-history-list">
                {activeAvailability.map(slot => (
                  <div className="anamnese-history-item" key={slot.day}>
                    <strong>{getWeekdayLabel(slot.day)}</strong>
                    <span>{slot.start} às {slot.end}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card documents-side-card">
            <div className="eyebrow">Atendimentos recentes</div>
            {!professional.appointments?.length ? (
              <p className="text-muted">Nenhum atendimento recente vinculado a esta profissional.</p>
            ) : (
              <div className="anamnese-history-list">
                {professional.appointments.map(appointment => (
                  <div className="anamnese-history-item" key={appointment.id}>
                    <strong>{appointment.service?.name || 'Serviço'}</strong>
                    <span>{appointment.client?.name || 'Cliente não informado'}</span>
                    <small>
                      {formatDateTime(appointment.startAt)} • {appointment.status} • {formatCurrency(appointment.price)}
                    </small>
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>

      {editing ? (
        <div className="modal-backdrop" onClick={event => event.target === event.currentTarget && setEditing(false)}>
          <div className="modal modal-lg">
            <h2 className="modal-title">Editar profissional</h2>

            <div className="professional-form-layout">
              <section className="professional-form-section">
                <div className="section-head section-head-inline">
                  <div>
                    <h3 className="section-title section-title-sm">Dados principais</h3>
                    <p className="section-copy">Identificação, especialidade e apresentação da profissional.</p>
                  </div>
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Nome completo *</label>
                    <input className="form-input" value={form.name} onChange={setField('name')} placeholder="Ex: Ana Paula" />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Especialidade *</label>
                    <input className="form-input" value={form.specialty} onChange={setField('specialty')} placeholder="Ex: Esteticista, Biomédica" />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Telefone</label>
                    <input className="form-input" value={form.phone} onChange={setField('phone')} placeholder="(11) 99999-9999" />
                  </div>

                  <div className="form-group form-full">
                    <label className="form-label">Observações</label>
                    <textarea
                      className="form-textarea"
                      value={form.notes}
                      onChange={setField('notes')}
                      placeholder="Informações relevantes sobre atendimento, perfil técnico, preferência de agenda ou estilo de cuidado."
                    />
                  </div>
                </div>
              </section>

              <section className="professional-form-section">
                <div className="section-head section-head-inline">
                  <div>
                    <h3 className="section-title section-title-sm">Foto e disponibilidade</h3>
                    <p className="section-copy">Imagem de perfil e agenda semanal para leitura rápida em qualquer dispositivo.</p>
                  </div>
                </div>

                <div className="media-upload-card">
                  <div className="media-upload-preview">
                    {form.photoDataUrl ? (
                      <img src={form.photoDataUrl} alt="Pré-visualização da profissional" className="media-upload-image" />
                    ) : (
                      <div className="media-upload-fallback">{getInitials(form.name)}</div>
                    )}
                  </div>

                  <div className="media-upload-actions">
                    <label className="btn btn-outline btn-sm photo-upload-btn">
                      <Icon name="camera" /> Escolher foto
                      <input type="file" accept="image/*" hidden onChange={handlePhotoChange} />
                    </label>

                    {form.photoDataUrl ? (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm(current => ({ ...current, photoDataUrl: null }))}>
                        Remover foto
                      </button>
                    ) : null}

                    <p className="text-muted media-upload-copy">Use uma foto clara para facilitar identificação em desktop, tablet e celular.</p>
                  </div>
                </div>

                <div className="availability-editor-grid">
                  {form.availability.map(slot => (
                    <article className={`availability-slot-card ${slot.enabled ? 'active' : ''}`} key={slot.day}>
                      <div className="availability-slot-head">
                        <strong>{slot.label}</strong>
                        <label className="availability-toggle">
                          <input
                            type="checkbox"
                            checked={slot.enabled}
                            onChange={event => updateAvailability(slot.day, 'enabled', event.target.checked)}
                          />
                          <span>{slot.enabled ? 'Ativa' : 'Pausada'}</span>
                        </label>
                      </div>

                      <div className="availability-time-grid">
                        <div className="form-group">
                          <label className="form-label">Início</label>
                          <input
                            className="form-input"
                            type="time"
                            value={slot.start}
                            disabled={!slot.enabled}
                            onChange={event => updateAvailability(slot.day, 'start', event.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Fim</label>
                          <input
                            className="form-input"
                            type="time"
                            value={slot.end}
                            disabled={!slot.enabled}
                            onChange={event => updateAvailability(slot.day, 'end', event.target.value)}
                          />
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="professional-form-section professional-form-section-full">
                <div className="section-head section-head-inline">
                  <div>
                    <h3 className="section-title section-title-sm">Folha de pagamento</h3>
                    <p className="section-copy">Defina regime, modelo de repasse e observações financeiras da profissional.</p>
                  </div>
                </div>

                <div className="form-grid payroll-grid">
                  <div className="form-group">
                    <label className="form-label">Regime de contratação</label>
                    <select className="form-select" value={form.contractType} onChange={setField('contractType')}>
                      <option value="">Selecione</option>
                      {contractTypeOptions.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Modelo de pagamento</label>
                    <select className="form-select" value={form.paymentModel} onChange={setField('paymentModel')}>
                      <option value="">Selecione</option>
                      {paymentModelOptions.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Base fixa mensal</label>
                    <input className="form-input" type="number" min="0" step="0.01" value={form.salaryAmount} onChange={setField('salaryAmount')} placeholder="0,00" />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Comissão (%)</label>
                    <input className="form-input" type="number" min="0" max="100" step="0.01" value={form.commissionRate} onChange={setField('commissionRate')} placeholder="0" />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Dia do repasse</label>
                    <input className="form-input" type="number" min="1" max="31" value={form.paymentDay} onChange={setField('paymentDay')} placeholder="Ex: 5" />
                  </div>

                  <div className="form-group form-full">
                    <label className="form-label">Observações da folha</label>
                    <textarea
                      className="form-textarea"
                      value={form.payrollNotes}
                      onChange={setField('payrollNotes')}
                      placeholder="Ex: comissão sobre procedimentos específicos, ajuda de custo, bonificação ou política de repasse."
                    />
                  </div>
                </div>
              </section>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setEditing(false)}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? <span className="spinner" /> : 'Salvar alterações'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
