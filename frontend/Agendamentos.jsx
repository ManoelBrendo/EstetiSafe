import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import api, { getApiErrorMessage } from './api'
import { Icon } from './Icon'

const STATUS_MAP = {
  SCHEDULED: ['badge-blue', 'Agendado'],
  CONFIRMED: ['badge-green', 'Confirmado'],
  IN_PROGRESS: ['badge-gold', 'Em andamento'],
  COMPLETED: ['badge-muted', 'Concluído'],
  CANCELLED: ['badge-red', 'Cancelado'],
  NO_SHOW: ['badge-rose', 'Não compareceu'],
}

const STATUSES = Object.entries(STATUS_MAP).map(([value, [, label]]) => ({ value, label }))

const PAYMENT_METHODS = [
  { value: 'PIX', label: 'Pix' },
  { value: 'CASH', label: 'Dinheiro' },
  { value: 'CREDIT_CARD', label: 'Cartão de crédito' },
  { value: 'DEBIT_CARD', label: 'Cartão de débito' },
  { value: 'BANK_TRANSFER', label: 'Transferência' },
]

const emptyForm = {
  clientId: '',
  serviceId: '',
  professionalId: '',
  startAt: '',
  endAt: '',
  notes: '',
  price: '',
  status: 'SCHEDULED',
}

function toCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function toInputDateTime(value) {
  if (!value) return ''

  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function localInputToIso(value) {
  if (!value) return ''
  return new Date(value).toISOString()
}

function addMinutesToInputDateTime(value, minutes) {
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

function dateFilterStart(value) {
  return value ? new Date(`${value}T00:00:00`).toISOString() : undefined
}

function dateFilterEnd(value) {
  return value ? new Date(`${value}T23:59:59`).toISOString() : undefined
}

function AppointmentCard({ appointment, onEdit, onPay, onCancel }) {
  const [badgeClass, label] = STATUS_MAP[appointment.status] || ['badge-muted', appointment.status]
  const paymentStatus = appointment.payment?.status === 'PAID'

  return (
    <article className="appointment-card">
      <div className="appointment-card-head">
        <div>
          <h3 className="appointment-card-title">{appointment.client?.name}</h3>
          <p className="appointment-card-subtitle">
            {format(new Date(appointment.startAt), 'dd/MM/yyyy')} - {format(new Date(appointment.startAt), 'HH:mm')} às {format(new Date(appointment.endAt), 'HH:mm')}
          </p>
        </div>

        <div className="appointment-badge-stack">
          <span className={`badge ${badgeClass}`}>{label}</span>
          {paymentStatus ? <span className="badge badge-green">Pago</span> : <span className="badge badge-muted">Pagamento pendente</span>}
        </div>
      </div>

      <div className="appointment-meta-grid">
        <div className="appointment-meta-item">
          <span>Serviço</span>
          <strong>{appointment.service?.name || 'Não informado'}</strong>
        </div>
        <div className="appointment-meta-item">
          <span>Profissional</span>
          <strong>{appointment.professional?.name || 'Não informado'}</strong>
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
  const [appointments, setAppointments] = useState([])
  const [clients, setClients] = useState([])
  const [services, setServices] = useState([])
  const [professionals, setProfessionals] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState(null)
  const [payModal, setPayModal] = useState(false)
  const [payForm, setPayForm] = useState({ method: 'PIX', amount: '' })
  const [filter, setFilter] = useState({ from: '', to: '', status: '', professionalId: '' })

  const scheduledCount = useMemo(() => (
    appointments.filter(appointment => ['SCHEDULED', 'CONFIRMED', 'IN_PROGRESS'].includes(appointment.status)).length
  ), [appointments])

  const paidCount = useMemo(() => (
    appointments.filter(appointment => appointment.payment?.status === 'PAID').length
  ), [appointments])

  const load = useCallback(async () => {
    setLoading(true)

    try {
      const params = {}
      if (filter.from) params.from = dateFilterStart(filter.from)
      if (filter.to) params.to = dateFilterEnd(filter.to)
      if (filter.status) params.status = filter.status
      if (filter.professionalId) params.professionalId = Number(filter.professionalId)

      const { data } = await api.get('/appointments', { params })
      setAppointments(data)
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Não foi possível carregar os agendamentos'))
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    Promise.all([
      api.get('/clients'),
      api.get('/services'),
      api.get('/professionals'),
    ])
      .then(([clientsResponse, servicesResponse, professionalsResponse]) => {
        setClients(clientsResponse.data)
        setServices(servicesResponse.data)
        setProfessionals(professionalsResponse.data)
      })
      .catch(error => {
        toast.error(getApiErrorMessage(error, 'Não foi possível carregar as listas de apoio'))
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

  function openEdit(appointment) {
    setForm({
      clientId: String(appointment.clientId),
      serviceId: String(appointment.serviceId),
      professionalId: String(appointment.professionalId),
      startAt: toInputDateTime(appointment.startAt),
      endAt: toInputDateTime(appointment.endAt),
      notes: appointment.notes || '',
      price: String(appointment.price),
      status: appointment.status,
    })
    setSelected(appointment)
    setModal('edit')
  }

  function openPay(appointment) {
    setSelected(appointment)
    setPayForm({
      method: appointment.payment?.method || 'PIX',
      amount: String(appointment.payment?.amount ?? appointment.price ?? ''),
    })
    setPayModal(true)
  }

  function setField(key) {
    return event => {
      const value = event.target.value
      setForm(current => ({ ...current, [key]: value }))
    }
  }

  function handleServiceChange(event) {
    const nextServiceId = event.target.value
    const service = services.find(item => item.id === Number(nextServiceId))

    setForm(current => ({
      ...current,
      serviceId: nextServiceId,
      price: service?.price != null ? String(service.price) : current.price,
      endAt: current.startAt && service?.duration
         ? addMinutesToInputDateTime(current.startAt, service.duration)
        : current.endAt,
    }))
  }

  function handleStartChange(event) {
    const nextStartAt = event.target.value
    const service = services.find(item => item.id === Number(form.serviceId))

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
      toast.error('Preencha todos os campos obrigatórios')
      return
    }

    if (new Date(form.endAt) <= new Date(form.startAt)) {
      toast.error('O horário final deve ser posterior ao horário inicial')
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
        price: Number(form.price),
        status: form.status,
      }

      if (modal === 'create') {
        await api.post('/appointments', body)
        toast.success('Agendamento criado com sucesso')
      } else {
        await api.put(`/appointments/${selected.id}`, body)
        toast.success('Agendamento atualizado com sucesso')
      }

      setModal(null)
      load()
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Não foi possível salvar o agendamento'))
    } finally {
      setSaving(false)
    }
  }

  async function handleCancel(id) {
    if (!window.confirm('Deseja cancelar este agendamento?')) return

    try {
      await api.delete(`/appointments/${id}`)
      toast.success('Agendamento cancelado')
      load()
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Não foi possível cancelar o agendamento'))
    }
  }

  async function handlePay() {
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
      load()
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Não foi possível registrar o pagamento'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Agendamentos</h1>
          <p className="page-subtitle">Organize a agenda com mais segurança, contexto e clareza visual.</p>
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
          <div className="stat-sub">Atendimentos já liquidados.</div>
        </div>
      </div>

      <div className="card card-sm toolbar-card">
        <div className="filters-grid">
          <div className="form-group inline-field">
            <label className="form-label">De</label>
            <input className="form-input" type="date" value={filter.from} onChange={event => setFilter(current => ({ ...current, from: event.target.value }))} />
          </div>

          <div className="form-group inline-field">
            <label className="form-label">Até</label>
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
                <option key={professional.id} value={professional.id}>{professional.name}</option>
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
                    <option key={client.id} value={client.id}>{client.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Serviço *</label>
                <select className="form-select" value={form.serviceId} onChange={handleServiceChange}>
                  <option value="">Selecione</option>
                  {services.map(service => (
                    <option key={service.id} value={service.id}>{service.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Profissional *</label>
                <select className="form-select" value={form.professionalId} onChange={setField('professionalId')}>
                  <option value="">Selecione</option>
                  {professionals.map(professional => (
                    <option key={professional.id} value={professional.id}>{professional.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Valor (R$)</label>
                <input className="form-input" type="number" step="0.01" min="0" value={form.price} onChange={setField('price')} />
              </div>

              <div className="form-group">
                <label className="form-label">Início *</label>
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
                <label className="form-label">Observações</label>
                <textarea className="form-textarea" value={form.notes} onChange={setField('notes')} placeholder="Detalhes importantes para a equipe e recepção." />
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
              <select className="form-select" value={payForm.method} onChange={event => setPayForm(current => ({ ...current, method: event.target.value }))}>
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
