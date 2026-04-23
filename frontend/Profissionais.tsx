import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import api, { getApiErrorMessage } from './api'
import type {
  ProfessionalAvailabilitySlot,
  ProfessionalContractType,
  ProfessionalPaymentModel,
  ProfessionalSummary,
  WeekdayValue,
} from './operationsTypes'
import { Icon } from './Icon'

const weekdays: Array<{ value: WeekdayValue; label: string }> = [
  { value: 'MONDAY', label: 'Segunda' },
  { value: 'TUESDAY', label: 'Terca' },
  { value: 'WEDNESDAY', label: 'Quarta' },
  { value: 'THURSDAY', label: 'Quinta' },
  { value: 'FRIDAY', label: 'Sexta' },
  { value: 'SATURDAY', label: 'Sabado' },
  { value: 'SUNDAY', label: 'Domingo' },
]

const contractTypeOptions: Array<{ value: ProfessionalContractType; label: string }> = [
  { value: 'CLT', label: 'CLT' },
  { value: 'PJ', label: 'PJ' },
  { value: 'AUTONOMA', label: 'Autonoma' },
  { value: 'COMISSIONADA', label: 'Comissionada' },
  { value: 'PARCERIA', label: 'Parceria' },
]

const paymentModelOptions: Array<{ value: ProfessionalPaymentModel; label: string }> = [
  { value: 'FIXED', label: 'Fixo' },
  { value: 'COMMISSION', label: 'Comissao' },
  { value: 'HYBRID', label: 'Hibrido' },
  { value: 'DAILY', label: 'Diaria' },
]

type ProfessionalModalMode = 'create' | 'edit' | null

interface ProfessionalFormState {
  name: string
  specialty: string
  phone: string
  notes: string
  photoDataUrl: string | null
  availability: ProfessionalAvailabilitySlot[]
  contractType: string
  paymentModel: string
  salaryAmount: string
  commissionRate: string
  paymentDay: string
  payrollNotes: string
}

function createDefaultAvailability(): ProfessionalAvailabilitySlot[] {
  return weekdays.map((weekday, index) => ({
    day: weekday.value,
    label: weekday.label,
    enabled: index < 5,
    start: '09:00',
    end: '18:00',
  }))
}

function normalizeAvailability(availability?: ProfessionalAvailabilitySlot[] | null) {
  const fallback = createDefaultAvailability()
  if (!Array.isArray(availability)) return fallback

  return fallback.map(base => {
    const current = availability.find(slot => slot.day === base.day)
    return {
      ...base,
      enabled: current?.enabled ?? base.enabled,
      start: current?.start || base.start,
      end: current?.end || base.end,
    }
  })
}

function createEmptyForm(): ProfessionalFormState {
  return {
    name: '',
    specialty: '',
    phone: '',
    notes: '',
    photoDataUrl: null,
    availability: createDefaultAvailability(),
    contractType: '',
    paymentModel: '',
    salaryAmount: '',
    commissionRate: '',
    paymentDay: '',
    payrollNotes: '',
  }
}

function getInitials(name?: string | null) {
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

function formatCurrency(value?: number | string | null) {
  if (value == null || value === '') return 'Nao definido'

  return Number(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function formatAvailabilitySummary(professional: ProfessionalSummary) {
  return professional.availabilitySummary || 'Disponibilidade ainda nao configurada.'
}

function formatCompensationSummary(professional: ProfessionalSummary) {
  return professional.compensationSummary || 'Folha de pagamento ainda nao configurada.'
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Nao foi possivel ler a imagem selecionada'))
    reader.readAsDataURL(file)
  })
}

interface ProfessionalAvatarProps {
  professional: Pick<ProfessionalSummary, 'name' | 'photoDataUrl'>
  size?: 'default' | 'large'
}

function ProfessionalAvatar({ professional, size = 'default' }: ProfessionalAvatarProps) {
  const className = size === 'large'
    ? 'user-avatar professional-avatar professional-avatar-large'
    : 'user-avatar professional-avatar'

  if (professional.photoDataUrl) {
    return (
      <div className={className}>
        <img src={professional.photoDataUrl} alt={`Foto de ${professional.name}`} className="professional-avatar-image" />
      </div>
    )
  }

  return <div className={className}>{getInitials(professional.name)}</div>
}

interface ProfessionalCardProps {
  professional: ProfessionalSummary
  onEdit: (professional: ProfessionalSummary) => void
  onDelete: (id: number | string) => void
  onOpen: (id: number | string) => void
}

function ProfessionalCard({ professional, onEdit, onDelete, onOpen }: ProfessionalCardProps) {
  return (
    <article className="team-card team-card-rich">
      <div className="team-card-head">
        <div className="team-card-profile">
          <ProfessionalAvatar professional={professional} />

          <div>
            <h3 className="team-card-title">{professional.name}</h3>
            <p className="team-card-subtitle">{professional.specialty}</p>
          </div>
        </div>

        <span className={`badge ${professional.active === false ? 'badge-muted' : 'badge-green'}`}>
          {professional.active === false ? 'Inativa' : 'Ativa'}
        </span>
      </div>

      <div className="team-meta-grid team-meta-grid-rich">
        <div className="team-meta-item">
          <span>Telefone</span>
          <strong>{professional.phone || 'Nao informado'}</strong>
        </div>
        <div className="team-meta-item">
          <span>Regime</span>
          <strong>{professional.contractTypeLabel || 'Nao definido'}</strong>
        </div>
        <div className="team-meta-item">
          <span>Modelo</span>
          <strong>{professional.paymentModelLabel || 'Nao definido'}</strong>
        </div>
        <div className="team-meta-item">
          <span>Base fixa</span>
          <strong>{formatCurrency(professional.salaryAmount)}</strong>
        </div>
      </div>

      <div className="team-card-stack">
        <div className="team-card-note team-card-highlight">
          <strong>Agenda semanal</strong>
          <span>{formatAvailabilitySummary(professional)}</span>
        </div>

        <div className="team-card-note team-card-highlight">
          <strong>Folha de pagamento</strong>
          <span>{formatCompensationSummary(professional)}</span>
        </div>

        {professional.notes ? (
          <div className="team-card-note">
            <strong>Observacoes</strong>
            <span>{professional.notes}</span>
          </div>
        ) : null}
      </div>

      <div className="team-card-actions">
        <button type="button" className="btn btn-gold btn-sm" onClick={() => onOpen(professional.id)}>
          <Icon name="clipboard" /> Ficha
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => onEdit(professional)}>
          <Icon name="edit" /> Editar
        </button>
        <button type="button" className="btn btn-ghost btn-sm danger-ghost" onClick={() => onDelete(professional.id)}>
          <Icon name="trash" /> Desativar
        </button>
      </div>
    </article>
  )
}

export default function Profissionais() {
  const navigate = useNavigate()
  const [professionals, setProfessionals] = useState<ProfessionalSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<ProfessionalModalMode>(null)
  const [form, setForm] = useState<ProfessionalFormState>(createEmptyForm())
  const [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState<ProfessionalSummary | null>(null)
  const [search, setSearch] = useState('')

  const activeCount = useMemo(() => professionals.length, [professionals])
  const payrollConfiguredCount = useMemo(
    () => professionals.filter(professional => professional.paymentModel || professional.salaryAmount != null || professional.commissionRate != null).length,
    [professionals]
  )
  const agendaConfiguredCount = useMemo(
    () => professionals.filter(professional => Array.isArray(professional.availability) && professional.availability.some(slot => slot.enabled)).length,
    [professionals]
  )
  const specialtyCount = useMemo(
    () => new Set(professionals.map(professional => professional.specialty).filter(Boolean)).size,
    [professionals]
  )

  const filteredProfessionals = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return professionals

    return professionals.filter(professional => (
      professional.name.toLowerCase().includes(query)
      || professional.specialty.toLowerCase().includes(query)
      || (professional.phone || '').toLowerCase().includes(query)
      || (professional.notes || '').toLowerCase().includes(query)
      || (professional.contractTypeLabel || '').toLowerCase().includes(query)
      || (professional.paymentModelLabel || '').toLowerCase().includes(query)
      || formatAvailabilitySummary(professional).toLowerCase().includes(query)
      || formatCompensationSummary(professional).toLowerCase().includes(query)
    ))
  }, [professionals, search])

  const load = useCallback(async () => {
    setLoading(true)

    try {
      const { data } = await api.get<ProfessionalSummary[]>('/professionals')
      setProfessionals(data)
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Nao foi possivel carregar os profissionais'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function openCreate() {
    setForm(createEmptyForm())
    setSelected(null)
    setModal('create')
  }

  function openEdit(professional: ProfessionalSummary) {
    setForm({
      name: professional.name || '',
      specialty: professional.specialty || '',
      phone: professional.phone || '',
      notes: professional.notes || '',
      photoDataUrl: professional.photoDataUrl || null,
      availability: normalizeAvailability(professional.availability),
      contractType: professional.contractType || '',
      paymentModel: professional.paymentModel || '',
      salaryAmount: professional.salaryAmount != null ? String(professional.salaryAmount) : '',
      commissionRate: professional.commissionRate != null ? String(professional.commissionRate) : '',
      paymentDay: professional.paymentDay != null ? String(professional.paymentDay) : '',
      payrollNotes: professional.payrollNotes || '',
    })
    setSelected(professional)
    setModal('edit')
  }

  function setField<Key extends keyof ProfessionalFormState>(key: Key) {
    return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setForm(current => ({ ...current, [key]: event.target.value }))
    }
  }

  function updateAvailability(day: WeekdayValue, key: 'enabled' | 'start' | 'end', value: boolean | string) {
    setForm(current => ({
      ...current,
      availability: current.availability.map(slot => (
        slot.day === day
          ? { ...slot, [key]: value }
          : slot
      )),
    }))
  }

  async function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const dataUrl = await readFileAsDataUrl(file)
      setForm(current => ({ ...current, photoDataUrl: dataUrl }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nao foi possivel carregar a foto')
    } finally {
      event.target.value = ''
    }
  }

  async function handleSave() {
    if (!form.name.trim() || !form.specialty.trim()) {
      toast.error('Nome e especialidade sao obrigatorios')
      return
    }

    setSaving(true)

    const payload = {
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
    }

    try {
      if (modal === 'create') {
        await api.post('/professionals', payload)
        toast.success('Profissional cadastrada com sucesso')
      } else if (selected) {
        await api.put(`/professionals/${selected.id}`, payload)
        toast.success('Profissional atualizada com sucesso')
      }

      setModal(null)
      setSelected(null)
      setForm(createEmptyForm())
      load()
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Nao foi possivel salvar a profissional'))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number | string) {
    if (!window.confirm('Deseja desativar esta profissional?')) return

    try {
      await api.delete(`/professionals/${id}`)
      toast.success('Profissional desativada')
      load()
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Nao foi possivel desativar a profissional'))
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Profissionais</h1>
          <p className="page-subtitle">Equipe, agenda semanal e folha de pagamento reunidas em uma apresentacao elegante e funcional.</p>
        </div>

        <button type="button" className="btn btn-primary" onClick={openCreate}>
          <Icon name="plus" /> Nova profissional
        </button>
      </div>

      <div className="stats-grid compact-stats stats-grid-adaptive">
        <div className="stat-card">
          <div className="stat-label">Equipe ativa</div>
          <div className="stat-value">{activeCount}</div>
          <div className="stat-sub">Profissionais disponiveis para atendimento.</div>
        </div>
        <div className="stat-card gold">
          <div className="stat-label">Folha configurada</div>
          <div className="stat-value">{payrollConfiguredCount}</div>
          <div className="stat-sub">Com modelo de repasse ja cadastrado.</div>
        </div>
        <div className="stat-card green">
          <div className="stat-label">Agenda configurada</div>
          <div className="stat-value">{agendaConfiguredCount}</div>
          <div className="stat-sub">Com disponibilidade semanal pronta para consulta.</div>
        </div>
        <div className="stat-card rose">
          <div className="stat-label">Especialidades</div>
          <div className="stat-value">{specialtyCount}</div>
          <div className="stat-sub">Cobertura tecnica distribuida na clinica.</div>
        </div>
      </div>

      <div className="card card-sm toolbar-card professionals-toolbar-card">
        <div className="search-bar">
          <Icon name="search" />
          <input
            placeholder="Buscar nome, especialidade ou observacao..."
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
        </div>

        <div className="toolbar-meta">
          <span className="badge badge-muted">{filteredProfessionals.length} profissionais visiveis</span>
        </div>
      </div>

      {loading ? (
        <div className="loading-page">
          <span className="spinner" />
        </div>
      ) : filteredProfessionals.length === 0 ? (
        <div className="card section-card">
          <div className="empty">
            <div className="empty-icon">
              <Icon name="person" size={24} />
            </div>
            <h3>Nenhuma profissional cadastrada</h3>
            <p>Adicione a equipe da clinica para acompanhar agenda, repasse e observacoes com mais clareza.</p>
          </div>
        </div>
      ) : (
        <div className="team-card-list team-card-list-grid">
          {filteredProfessionals.map(professional => (
            <ProfessionalCard
              key={professional.id}
              professional={professional}
              onEdit={openEdit}
              onDelete={handleDelete}
              onOpen={professionalId => navigate(`/profissionais/${professionalId}`)}
            />
          ))}
        </div>
      )}

      {modal ? (
        <div className="modal-backdrop" onClick={event => event.target === event.currentTarget && setModal(null)}>
          <div className="modal modal-lg">
            <h2 className="modal-title">{modal === 'create' ? 'Nova profissional' : 'Editar profissional'}</h2>

            <div className="professional-form-layout">
              <section className="professional-form-section">
                <div className="section-head section-head-inline">
                  <div>
                    <h3 className="section-title section-title-sm">Dados principais</h3>
                    <p className="section-copy">Identificacao, especialidade e apresentacao da profissional.</p>
                  </div>
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Nome completo *</label>
                    <input className="form-input" value={form.name} onChange={setField('name')} placeholder="Ex: Ana Paula" />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Especialidade *</label>
                    <input className="form-input" value={form.specialty} onChange={setField('specialty')} placeholder="Ex: Esteticista, Biomedica" />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Telefone</label>
                    <input className="form-input" value={form.phone} onChange={setField('phone')} placeholder="(11) 99999-9999" />
                  </div>

                  <div className="form-group form-full">
                    <label className="form-label">Observacoes</label>
                    <textarea
                      className="form-textarea"
                      value={form.notes}
                      onChange={setField('notes')}
                      placeholder="Informacoes relevantes sobre atendimento, perfil tecnico, preferencia de agenda ou estilo de cuidado."
                    />
                  </div>
                </div>
              </section>

              <section className="professional-form-section">
                <div className="section-head section-head-inline">
                  <div>
                    <h3 className="section-title section-title-sm">Foto e disponibilidade</h3>
                    <p className="section-copy">Imagem de perfil e dias de atendimento para consulta rapida em qualquer tela.</p>
                  </div>
                </div>

                <div className="media-upload-card">
                  <div className="media-upload-preview">
                    {form.photoDataUrl ? (
                      <img src={form.photoDataUrl} alt="Pre-visualizacao da profissional" className="media-upload-image" />
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

                    <p className="text-muted media-upload-copy">Use uma foto clara para facilitar identificacao em desktop, tablet e celular.</p>
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
                          <label className="form-label">Inicio</label>
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
                    <p className="section-copy">Defina regime, modelo de repasse e observacoes financeiras da profissional.</p>
                  </div>
                </div>

                <div className="form-grid payroll-grid">
                  <div className="form-group">
                    <label className="form-label">Regime de contratacao</label>
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
                    <label className="form-label">Comissao (%)</label>
                    <input className="form-input" type="number" min="0" max="100" step="0.01" value={form.commissionRate} onChange={setField('commissionRate')} placeholder="0" />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Dia do repasse</label>
                    <input className="form-input" type="number" min="1" max="31" value={form.paymentDay} onChange={setField('paymentDay')} placeholder="Ex: 5" />
                  </div>

                  <div className="form-group form-full">
                    <label className="form-label">Observacoes da folha</label>
                    <textarea
                      className="form-textarea"
                      value={form.payrollNotes}
                      onChange={setField('payrollNotes')}
                      placeholder="Ex: comissao sobre procedimentos especificos, ajuda de custo, bonificacao ou politica de repasse."
                    />
                  </div>
                </div>
              </section>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setModal(null)}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? <span className="spinner" /> : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
