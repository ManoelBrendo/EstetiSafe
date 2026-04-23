import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import api, { getApiErrorMessage } from './api'
import type { ClientRecord, Identifier, ServiceReference } from './clinicalTypes'
import type {
  AppointmentRecord,
  AppointmentStatus,
  PaymentMethod,
  ProfessionalSummary,
} from './operationsTypes'
import { Icon } from './Icon'

const STATUS_MAP: Record<string, [string, string]> = {
  SCHEDULED: ['badge-blue', 'Agendado'],
  CONFIRMED: ['badge-green', 'Confirmado'],
  IN_PROGRESS: ['badge-gold', 'Em andamento'],
  COMPLETED: ['badge-muted', 'Concluido'],
  CANCELLED: ['badge-red', 'Cancelado'],
  NO_SHOW: ['badge-rose', 'Nao compareceu'],
}

const STATUSES = Object.entries(STATUS_MAP).map(([value, [, label]]) => ({ value, label }))

const PAYMENT_METHODS: Array<{ value: PaymentMethod; label: string }> = [
  { value: 'PIX', label: 'Pix' },
  { value: 'CASH', label: 'Dinheiro' },
  { value: 'CREDIT_CARD', label: 'Cartao de credito' },
  { value: 'DEBIT_CARD', label: 'Cartao de debito' },
  { value: 'BANK_TRANSFER', label: 'Transferencia' },
]

interface AppointmentFormState {
  clientId: string
  serviceId: string
  professionalId: string
  startAt: string
  endAt: string
  notes: string
  price: string
  status: AppointmentStatus
}

interface PaymentFormState {
  method: PaymentMethod
  amount: string
}

interface AppointmentFilterState {
  from: string
  to: string
  status: string
  professionalId: string
}

type AppointmentModalMode = 'create' | 'edit' | null

const emptyForm: AppointmentFormState = {
  clientId: '',
  serviceId: '',
  professionalId: '',
  startAt: '',
  endAt: '',
  notes: '',
  price: '',
  status: 'SCHEDULED',
}

function toCurrency(value: number | string | null | undefined) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function toInputDateTime(value?: string | null) {
  if (!value) return ''

  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function localInputToIso(value: string) {
  if (!value) return ''
  return new Date(value).toISOString()
}

function addMinutesToInputDateTime(value: string, minutes: number) {
  if (!value) return ''

  const date = new Date(value)
  date.setMinutes(date.getMinutes() + minutes)
  return toInputDateTime(date.toISOString())
}

function getNextSlot() {
  const date = new Date()
  const minutes = date.getMinutes()
  const increment = 30 - (minutes % 30 || 30)

  date.setMinutes(date.getMinutes() + increment)
  date.setSeconds(0, 0)

  return toInputDateTime(date.toISOString())
}

function dateFilterStart(value: string) {
  return value ? new Date(`${value}T00:00:00`).toISOString() : undefined
}

function dateFilterEnd(value: string) {
  return value ? new Date(`${value}T23:59:59`).toISOString() : undefined
}

interface AppointmentCardProps {
  appointment: AppointmentRecord
  onEdit: (appointment: AppointmentRecord) => void
  onPay: (appointment: AppointmentRecord) => void
  onCancel: (id: Identifier) => void
}

function AppointmentCard({ appointment, onEdit, onPay, onCancel }: AppointmentCardProps) {
  const [badgeClass, label] = STATUS_MAP[appointment.status] || ['badge-muted', appointment.status]
  const paymentStatus = appointment.payment?.status === 'PAID'

  return (
    <article className="appointment-card">
      <div className="appointment-card-head">
        <div>
          <h3 className="appointment-card-title">{appointment.client?.name}</h3>
          <p className="appointment-card-subtitle">
            {format(new Date(appointment.startAt), 'dd/MM/yyyy')} - {format(new Date(appointment.startAt), 'HH:mm')} as {format(new Date(appointment.endAt), 'HH:mm')}
          </p>
        </div>

        <div className="appointment-badge-stack">
          <span className={`badge ${badgeClass}`}>{label}</span>
          {paymentStatus ? <span className="badge badge-green">Pago</span> : <span className="badge badge-muted">Pagamento pendente</span>}
        </div>
      </div>

      <div className="appointment-meta-grid">
        <div className="appointment-meta-item">
          <span>Servico</span>
          <strong>{appointment.service?.name || 'Nao informado'}</strong>
        </div>
        <div className="appointment-meta-item">
          <span>Profissional</span>
          <strong>{appointment.professional?.name || 'Nao informado'}</strong>
        </div>
        <div className="appointment-meta-item">
          <span>Valor</span>
          <strong>{toCurrency(appointment.price)}</strong>
        </div>
      </div>

      {appointment.notes ? <div className="appointment-card-note">{appointment.notes}</div> : null}

      <div className="appointment-card-actions">
        <button type="button" className="btn btn-outline btn-sm" onClick={() => onEdit(appointment)}>
          <Icon name="edit" /> Editar
        </button>

        {!paymentStatus && appointment.status !== 'CANCELLED' ? (
          <button type="button" className="btn btn-outline btn-sm" onClick={() => onPay(appointment)}>
            <Icon name="dollar" /> Registrar pagamento
          </button>
        ) : null}

        {appointment.status !== 'CANCELLED' ? (
          <button type="button" className="btn btn-ghost btn-sm danger-ghost" onClick={() => onCancel(appointment.id)}>
            <Icon name="x" /> Cancelar
          </button>
        ) : null}
      </div>
    </article>
  )
}

export default function Agendamentos() {
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([])
  const [clients, setClients] = useState<ClientRecord[]>([])
  const [services, setServices] = useState<ServiceReference[]>([])
  const [professionals, setProfessionals] = useState<ProfessionalSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<AppointmentModalMode>(null)
  const [form, setForm] = useState<AppointmentFormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState<AppointmentRecord | null>(null)
  const [payModal, setPayModal] = useState(false)
  const [payForm, setPayForm] = useState<PaymentFormState>({ method: 'PIX', amount: '' })
  const [filter, setFilter] = useState<AppointmentFilterState>({ from: '', to: '', status: '', professionalId: '' })

  const scheduledCount = useMemo(
    () => appointments.filter(appointment => ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'].includes(appointment.status)).length,
    [appointments]
  )

  const paidCount = useMemo(
    () => appointments.filter(appointment => appointment.payment?.status === 'PAID').length,
    [appointments]
  )

  const load = useCallback(async () => {
    setLoading(true)

    try {
      const params: Record<string, string | number | undefined> = {}
      if (filter.from) params.from = dateFilterStart(filter.from)
      if (filter.to) params.to = dateFilterEnd(filter.to)
      if (filter.status) params.status = filter.status
      if (filter.professionalId) params.professionalId = Number(filter.professionalId)

      const { data } = await api.get<AppointmentRecord[]>('/appointments', { params })
      setAppointments(data)
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Nao foi possivel carregar os agendamentos'))
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    Promise.all([
      api.get<ClientRecord[]>('/clients'),
      api.get<ServiceReference[]>('/services'),
      api.get<ProfessionalSummary[]>('/professionals'),
    ])
      .then(([clientsResponse, servicesResponse, professionalsResponse]) => {
        setClients(clientsResponse.data)
        setServices(servicesResponse.data)
        setProfessionals(professionalsResponse.data)
      })
      .catch(error => {
        toast.error(getApiErrorMessage(error, 'Nao foi possivel carregar as listas de apoio'))
      })
  }, [])

  function openCreate() {
    const startAt = getNextSlot()

    setForm({
      ...emptyForm,
      startAt,
      endAt: addMinutesToInputDateTime(startAt, 60),
    })
    setSelected(null)
    setModal('create')
  }

  function openEdit(appointment: AppointmentRecord) {
    setForm({
      clientId: String(appointment.clientId),
      serviceId: String(appointment.serviceId),
      professionalId: String(appointment.professionalId),
      startAt: toInputDateTime(appointment.startAt),
      endAt: toInputDateTime(appointment.endAt),
      notes: appointment.notes || '',
      price: String(appointment.price ?? ''),
      status: (appointment.status as AppointmentStatus) || 'SCHEDULED',
    })
    setSelected(appointment)
    setModal('edit')
  }

  function openPay(appointment: AppointmentRecord) {
    setSelected(appointment)
    setPayForm({
      method: (appointment.payment?.method as PaymentMethod) || 'PIX',
      amount: String(appointment.payment?.amount ?? appointment.price ?? ''),
    })
    setPayModal(true)
  }

  function setField<Key extends keyof AppointmentFormState>(key: Key) {
    return (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const value = event.target.value
      setForm(current => ({ ...current, [key]: value }))
    }
  }

  function handleServiceChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextServiceId = event.target.value
    const service = services.find(item => Number(item.id) === Number(nextServiceId))

    setForm(current => ({
      ...current,
      serviceId: nextServiceId,
      price: service?.price != null ? String(service.price) : current.price,
      endAt: current.startAt && service?.duration
        ? addMinutesToInputDateTime(current.startAt, service.duration)
        : current.endAt,
    }))
  }

  function handleStartChange(event: ChangeEvent<HTMLInputElement>) {
    const nextStartAt = event.target.value
    const service = services.find(item => Number(item.id) === Number(form.serviceId))

    setForm(current => ({
      ...current,
      startAt: nextStartAt,
      endAt: service?.duration
        ? addMinutesToInputDateTime(nextStartAt, service.duration)
        : current.endAt || addMinutesToInputDateTime(nextStartAt, 60),
    }))
  }

  async function handleSave() {
    if (!form.clientId || !form.serviceId || !form.professionalId || !form.startAt || !form.endAt) {
      toast.error('Preencha todos os campos obrigatorios')
      return
    }

    if (new Date(form.endAt) <= new Date(form.startAt)) {
      toast.error('O horario final deve ser posterior ao horario inicial')
      return
    }

    setSaving(true)

    try {
      const body = {
        clientId: Number(form.clientId),
        serviceId: Number(form.serviceId),
        professionalId: Number(form.professionalId),
        startAt: localInputToIso(form.startAt),
        endAt: localInputToIso(form.endAt),
        notes: form.notes,
        price: Number(form.price || 0),
        status: form.status,
      }

      if (modal === 'create') {
        await api.post('/appointments', body)
        toast.success('Agendamento criado com sucesso')
      } else if (selected) {
        await api.put(`/appointments/${selected.id}`, body)
        toast.success('Agendamento atualizado com sucesso')
      }

      setModal(null)
      setSelected(null)
      load()
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Nao foi possivel salvar o agendamento'))
    } finally {
      setSaving(false)
    }
  }

  async function handleCancel(id: Identifier) {
    if (!window.confirm('Deseja cancelar este agendamento?')) return

    try {
      await api.delete(`/appointments/${id}`)
      toast.success('Agendamento cancelado')
      load()
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Nao foi possivel cancelar o agendamento'))
    }
  }

  async function handlePay() {
    if (!selected) {
      toast.error('Selecione um atendimento antes de registrar o pagamento')
      return
    }

    if (!payForm.amount || Number(payForm.amount) <= 0) {
      toast.error('Informe um valor valido para continuar')
      return
    }

    setSaving(true)

    try {
      await api.post('/payments', {
        appointmentId: selected.id,
        amount: Number(payForm.amount),
        method: payForm.method,
        status: 'PAID',
      })

      toast.success('Pagamento registrado com sucesso')
      setPayModal(false)
      setSelected(null)
      load()
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Nao foi possivel registrar o pagamento'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Agendamentos</h1>
          <p className="page-subtitle">Organize a agenda com mais seguranca, contexto e clareza visual.</p>
        </div>

        <button type="button" className="btn btn-primary" onClick={openCreate}>
          <Icon name="plus" /> Novo agendamento
        </button>
      </div>

      <div className="stats-grid compact-stats">
        <div className="stat-card">
          <div className="stat-label">Na agenda</div>
          <div className="stat-value">{appointments.length}</div>
          <div className="stat-sub">Resultados do filtro atual.</div>
        </div>
        <div className="stat-card green">
          <div className="stat-label">Em andamento</div>
          <div className="stat-value">{scheduledCount}</div>
          <div className="stat-sub">Agendados, confirmados e em atendimento.</div>
        </div>
        <div className="stat-card gold">
          <div className="stat-label">Pagos</div>
          <div className="stat-value">{paidCount}</div>
          <div className="stat-sub">Atendimentos ja liquidados.</div>
        </div>
      </div>

      <div className="card card-sm toolbar-card">
        <div className="filters-grid">
          <div className="form-group inline-field">
            <label className="form-label">De</label>
            <input className="form-input" type="date" value={filter.from} onChange={event => setFilter(current => ({ ...current, from: event.target.value }))} />
          </div>

          <div className="form-group inline-field">
            <label className="form-label">Ate</label>
            <input className="form-input" type="date" value={filter.to} onChange={event => setFilter(current => ({ ...current, to: event.target.value }))} />
          </div>

          <div className="form-group">
            <label className="form-label">Status</label>
            <select className="form-select" value={filter.status} onChange={event => setFilter(current => ({ ...current, status: event.target.value }))}>
              <option value="">Todos os status</option>
              {STATUSES.map(status => (
                <option key={status.value} value={status.value}>{status.label}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Profissional</label>
            <select className="form-select" value={filter.professionalId} onChange={event => setFilter(current => ({ ...current, professionalId: event.target.value }))}>
              <option value="">Todas</option>
              {professionals.map(professional => (
                <option key={professional.id} value={String(professional.id)}>{professional.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="toolbar-meta">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFilter({ from: '', to: '', status: '', professionalId: '' })}>
            Limpar filtros
          </button>
        </div>
      </div>

      <div className="card section-card">
        {loading ? (
          <div className="loading-page">
            <span className="spinner" />
          </div>
        ) : appointments.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">
              <Icon name="calendar" size={24} />
            </div>
            <h3>Nenhum agendamento encontrado</h3>
            <p>Use os filtros ou crie um novo atendimento para preencher a agenda.</p>
          </div>
        ) : (
          <div className="appointment-card-list">
            {appointments.map(appointment => (
              <AppointmentCard
                key={appointment.id}
                appointment={appointment}
                onEdit={openEdit}
                onPay={openPay}
                onCancel={handleCancel}
              />
            ))}
          </div>
        )}
      </div>

      {modal ? (
        <div className="modal-backdrop" onClick={event => event.target === event.currentTarget && setModal(null)}>
          <div className="modal">
            <h2 className="modal-title">{modal === 'create' ? 'Novo agendamento' : 'Editar agendamento'}</h2>

            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Cliente *</label>
                <select className="form-select" value={form.clientId} onChange={setField('clientId')}>
                  <option value="">Selecione</option>
                  {clients.map(client => (
                    <option key={client.id} value={String(client.id)}>{client.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Servico *</label>
                <select className="form-select" value={form.serviceId} onChange={handleServiceChange}>
                  <option value="">Selecione</option>
                  {services.map(service => (
                    <option key={service.id} value={String(service.id)}>{service.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Profissional *</label>
                <select className="form-select" value={form.professionalId} onChange={setField('professionalId')}>
                  <option value="">Selecione</option>
                  {professionals.map(professional => (
                    <option key={professional.id} value={String(professional.id)}>{professional.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Valor (R$)</label>
                <input className="form-input" type="number" step="0.01" min="0" value={form.price} onChange={setField('price')} />
              </div>

              <div className="form-group">
                <label className="form-label">Inicio *</label>
                <input className="form-input" type="datetime-local" value={form.startAt} onChange={handleStartChange} />
              </div>

              <div className="form-group">
                <label className="form-label">Fim *</label>
                <input className="form-input" type="datetime-local" value={form.endAt} onChange={setField('endAt')} />
              </div>

              {modal === 'edit' ? (
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select className="form-select" value={form.status} onChange={setField('status')}>
                    {STATUSES.map(status => (
                      <option key={status.value} value={status.value}>{status.label}</option>
                    ))}
                  </select>
                </div>
              ) : null}

              <div className="form-group form-full">
                <label className="form-label">Observacoes</label>
                <textarea className="form-textarea" value={form.notes} onChange={setField('notes')} placeholder="Detalhes importantes para a equipe e recepcao." />
              </div>
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

      {payModal ? (
        <div className="modal-backdrop" onClick={event => event.target === event.currentTarget && setPayModal(false)}>
          <div className="modal modal-compact">
            <h2 className="modal-title">Registrar pagamento</h2>
            <p className="text-sm text-muted mb-16">
              Atendimento de <strong>{selected?.client?.name}</strong>
            </p>

            <div className="form-group mb-16">
              <label className="form-label">Valor (R$)</label>
              <input className="form-input" type="number" step="0.01" min="0" value={payForm.amount} onChange={event => setPayForm(current => ({ ...current, amount: event.target.value }))} />
            </div>

            <div className="form-group">
              <label className="form-label">Forma de pagamento</label>
              <select className="form-select" value={payForm.method} onChange={event => setPayForm(current => ({ ...current, method: event.target.value as PaymentMethod }))}>
                {PAYMENT_METHODS.map(method => (
                  <option key={method.value} value={method.value}>{method.label}</option>
                ))}
              </select>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setPayModal(false)}>
                Cancelar
              </button>
              <button type="button" className="btn btn-gold" onClick={handlePay} disabled={saving}>
                {saving ? <span className="spinner" /> : 'Confirmar pagamento'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
