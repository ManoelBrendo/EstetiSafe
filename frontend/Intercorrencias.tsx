import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import toast from 'react-hot-toast'
import api, { getApiErrorMessage } from './api'
import { Icon } from './Icon'
import type { ClientRecord, Identifier } from './clinicalTypes'
import type {
  ClinicalIntercurrencePayload,
  ClinicalIntercurrenceRecord,
  ClinicalIntercurrenceUpdatePayload,
  ClinicalIntercurrencesResponse,
  ProfessionalSummary,
  ServiceRecord,
} from './operationsTypes'

type ModalMode = 'create' | 'edit' | null

type IntercurrenceFormState = {
  clientId: string
  serviceId: string
  procedureName: string
  occurredDate: string
  occurredTime: string
  description: string
  conduct: string
  notes: string
  professionalId: string
  professionalName: string
  editReason: string
}

type IntercurrenceFilters = {
  search: string
  clientId: string
  professionalId: string
  procedure: string
  dateFrom: string
  dateTo: string
}

const emptyFilters: IntercurrenceFilters = {
  search: '',
  clientId: '',
  professionalId: '',
  procedure: '',
  dateFrom: '',
  dateTo: '',
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function toDateInput(value: Date) {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
}

function toTimeInput(value: Date) {
  return `${pad(value.getHours())}:${pad(value.getMinutes())}`
}

function createEmptyForm(): IntercurrenceFormState {
  const now = new Date()
  return {
    clientId: '',
    serviceId: '',
    procedureName: '',
    occurredDate: toDateInput(now),
    occurredTime: toTimeInput(now),
    description: '',
    conduct: '',
    notes: '',
    professionalId: '',
    professionalName: '',
    editReason: '',
  }
}

function createFormFromRecord(record: ClinicalIntercurrenceRecord): IntercurrenceFormState {
  const occurredAt = new Date(record.occurredAt)
  const safeDate = Number.isNaN(occurredAt.getTime()) ? new Date() : occurredAt

  return {
    clientId: String(record.clientId || ''),
    serviceId: record.serviceId ? String(record.serviceId) : '',
    procedureName: record.procedureName || '',
    occurredDate: toDateInput(safeDate),
    occurredTime: toTimeInput(safeDate),
    description: record.description || '',
    conduct: record.conduct || '',
    notes: record.notes || '',
    professionalId: record.professionalId ? String(record.professionalId) : '',
    professionalName: record.professionalName || '',
    editReason: '',
  }
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Sem data'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Data inválida'

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

function pluralize(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`
}

function compactParams(filters: IntercurrenceFilters) {
  return Object.entries(filters).reduce<Record<string, string>>((params, [key, value]) => {
    if (value.trim()) params[key] = value.trim()
    return params
  }, {})
}

function getClientName(record: ClinicalIntercurrenceRecord) {
  return record.client?.name || 'Cliente não informada'
}

function getFormError(form: IntercurrenceFormState, mode: ModalMode) {
  if (!form.clientId) return 'Selecione a cliente vinculada ao prontuário.'
  if (!form.procedureName.trim()) return 'Informe o procedimento relacionado.'
  if (!form.occurredDate || !form.occurredTime) return 'Informe data e hora da intercorrência.'
  if (form.description.trim().length < 10) return 'Descreva o que aconteceu com pelo menos 10 caracteres.'
  if (form.conduct.trim().length < 5) return 'Informe a conduta adotada pela profissional.'
  if (!form.professionalId && form.professionalName.trim().length < 2) return 'Selecione ou informe a profissional responsável.'
  if (mode === 'edit' && form.editReason.trim().length < 3) return 'Informe o motivo da edição para manter o histórico seguro.'
  return null
}

function buildCreatePayload(form: IntercurrenceFormState): ClinicalIntercurrencePayload {
  return {
    clientId: Number(form.clientId),
    serviceId: form.serviceId ? Number(form.serviceId) : null,
    procedureName: form.procedureName.trim(),
    occurredDate: form.occurredDate,
    occurredTime: form.occurredTime,
    description: form.description.trim(),
    conduct: form.conduct.trim(),
    notes: form.notes.trim(),
    professionalId: form.professionalId ? Number(form.professionalId) : null,
    professionalName: form.professionalName.trim(),
  }
}

function buildUpdatePayload(form: IntercurrenceFormState): ClinicalIntercurrenceUpdatePayload {
  return {
    ...buildCreatePayload(form),
    editReason: form.editReason.trim(),
  }
}

export default function Intercorrencias() {
  const [items, setItems] = useState<ClinicalIntercurrenceRecord[]>([])
  const [total, setTotal] = useState(0)
  const [clients, setClients] = useState<ClientRecord[]>([])
  const [services, setServices] = useState<ServiceRecord[]>([])
  const [professionals, setProfessionals] = useState<ProfessionalSummary[]>([])
  const [filters, setFilters] = useState<IntercurrenceFilters>(emptyFilters)
  const [appliedFilters, setAppliedFilters] = useState<IntercurrenceFilters>(emptyFilters)
  const [form, setForm] = useState<IntercurrenceFormState>(() => createEmptyForm())
  const [modalMode, setModalMode] = useState<ModalMode>(null)
  const [selected, setSelected] = useState<ClinicalIntercurrenceRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadingDetailId, setLoadingDetailId] = useState<Identifier | null>(null)

  const metrics = useMemo(() => {
    const withEdits = items.filter(item => Number(item.editsCount || 0) > 0).length
    const clientsCount = new Set(items.map(item => item.clientId)).size
    return [
      { label: 'Registros', value: total, helper: 'Intercorrências documentadas pela clínica.' },
      { label: 'Clientes com registro', value: clientsCount, helper: 'Prontuários com histórico de intercorrência.' },
      { label: 'Com edição', value: withEdits, helper: 'Registros com alteração controlada.' },
    ]
  }, [items, total])

  const hasActiveFilters = Boolean(
    appliedFilters.search || appliedFilters.clientId || appliedFilters.professionalId || appliedFilters.procedure || appliedFilters.dateFrom || appliedFilters.dateTo
  )

  const loadOptions = useCallback(async () => {
    try {
      const [{ data: clientList }, { data: serviceList }, { data: professionalList }] = await Promise.all([
        api.get<ClientRecord[]>('/clients'),
        api.get<ServiceRecord[]>('/services'),
        api.get<ProfessionalSummary[]>('/professionals'),
      ])
      setClients(clientList || [])
      setServices(serviceList || [])
      setProfessionals(professionalList || [])
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Não foi possível carregar clientes, serviços e profissionais.'))
    }
  }, [])

  const loadIntercurrences = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get<ClinicalIntercurrencesResponse>('/intercurrences', {
        params: compactParams(appliedFilters),
      })
      setItems(data.items || [])
      setTotal(data.total || 0)
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Não foi possível carregar as intercorrências.'))
      setItems([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [appliedFilters])

  useEffect(() => {
    void loadOptions()
  }, [loadOptions])

  useEffect(() => {
    void loadIntercurrences()
  }, [loadIntercurrences])

  function setField(key: keyof IntercurrenceFormState) {
    return (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const value = event.target.value
      setForm(current => ({ ...current, [key]: value }))
    }
  }

  function handleServiceChange(event: ChangeEvent<HTMLSelectElement>) {
    const serviceId = event.target.value
    const service = services.find(item => String(item.id) === serviceId)
    setForm(current => ({
      ...current,
      serviceId,
      procedureName: service?.name || current.procedureName,
    }))
  }

  function handleProfessionalChange(event: ChangeEvent<HTMLSelectElement>) {
    const professionalId = event.target.value
    const professional = professionals.find(item => String(item.id) === professionalId)
    setForm(current => ({
      ...current,
      professionalId,
      professionalName: professional?.name || current.professionalName,
    }))
  }

  function handleFilterChange(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = event.target
    setFilters(current => ({ ...current, [name]: value }))
  }

  function openCreate() {
    setSelected(null)
    setForm(createEmptyForm())
    setModalMode('create')
  }

  async function openEdit(record: ClinicalIntercurrenceRecord) {
    setLoadingDetailId(record.id)
    try {
      const { data } = await api.get<ClinicalIntercurrenceRecord>(`/intercurrences/${record.id}`)
      setSelected(data)
      setForm(createFormFromRecord(data))
      setModalMode('edit')
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Não foi possível abrir esta intercorrência.'))
    } finally {
      setLoadingDetailId(null)
    }
  }

  function closeModal() {
    setModalMode(null)
    setSelected(null)
    setForm(createEmptyForm())
  }

  async function handleSave() {
    const errorMessage = getFormError(form, modalMode)
    if (errorMessage) {
      toast.error(errorMessage)
      return
    }

    setSaving(true)
    try {
      if (modalMode === 'edit' && selected) {
        await api.put(`/intercurrences/${selected.id}`, buildUpdatePayload(form))
        toast.success('Intercorrência editada com histórico registrado.')
      } else {
        await api.post('/intercurrences', buildCreatePayload(form))
        toast.success('Intercorrência registrada com sucesso.')
      }

      closeModal()
      await loadIntercurrences()
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Não foi possível salvar a intercorrência.'))
    } finally {
      setSaving(false)
    }
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAppliedFilters(filters)
  }

  function clearFilters() {
    setFilters(emptyFilters)
    setAppliedFilters(emptyFilters)
  }

  return (
    <div className="page intercurrences-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Intercorrências</h1>
          <p className="page-subtitle">
            Registre ocorrências durante ou após procedimentos e mantenha um histórico profissional vinculado ao prontuário.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          <Icon name="plus" /> Nova intercorrência
        </button>
      </div>

      <section className="intercurrences-hero card">
        <div>
          <span className="eyebrow">Histórico profissional seguro</span>
          <h2 className="section-title">Registro clínico com rastreabilidade de edição.</h2>
          <p className="section-copy">
            Cada registro fica vinculado a cliente, procedimento e profissional responsável. Edições exigem justificativa e ficam salvas em histórico.
          </p>
        </div>
        <div className="intercurrences-hero-lock">
          <Icon name="shield" size={22} />
          <div>
            <strong>Sem exclusão rápida</strong>
            <span>Intercorrências são documentos de histórico clínico e não possuem ação de apagar nesta tela.</span>
          </div>
        </div>
      </section>

      <section className="intercurrences-overview" aria-label="Resumo de intercorrências">
        {metrics.map(metric => (
          <article className="intercurrence-metric" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.helper}</small>
          </article>
        ))}
      </section>

      <section className="card intercurrences-filter-card">
        <div className="section-head">
          <div>
            <h2 className="section-title">Consulta posterior</h2>
            <p className="section-copy">Busque por cliente, data, procedimento ou profissional responsável.</p>
          </div>
          {hasActiveFilters ? <button type="button" className="btn btn-ghost btn-sm" onClick={clearFilters}>Limpar filtros</button> : null}
        </div>

        <form className="intercurrences-filter-panel" onSubmit={applyFilters}>
          <div className="intercurrences-filter-primary">
            <label className="form-field intercurrences-search-field">
              <span>Busca geral</span>
              <input name="search" value={filters.search} onChange={handleFilterChange} placeholder="Cliente, descrição ou conduta" />
            </label>
            <button type="submit" className="btn btn-primary intercurrences-submit" disabled={loading}>
              <Icon name="search" /> Aplicar filtros
            </button>
          </div>

          <div className="intercurrences-filter-secondary" aria-label="Filtros refinados de intercorrências">
            <label className="form-field">
              <span>Cliente</span>
              <select name="clientId" value={filters.clientId} onChange={handleFilterChange}>
                <option value="">Todas</option>
                {clients.map(client => <option key={client.id} value={String(client.id)}>{client.name}</option>)}
              </select>
            </label>
            <label className="form-field">
              <span>Procedimento</span>
              <input name="procedure" value={filters.procedure} onChange={handleFilterChange} placeholder="Ex: peeling" />
            </label>
            <label className="form-field">
              <span>Profissional</span>
              <select name="professionalId" value={filters.professionalId} onChange={handleFilterChange}>
                <option value="">Todas</option>
                {professionals.map(professional => <option key={professional.id} value={String(professional.id)}>{professional.name}</option>)}
              </select>
            </label>
            <label className="form-field intercurrences-date-field">
              <span>De</span>
              <input type="date" name="dateFrom" value={filters.dateFrom} onChange={handleFilterChange} />
            </label>
            <label className="form-field intercurrences-date-field">
              <span>Até</span>
              <input type="date" name="dateTo" value={filters.dateTo} onChange={handleFilterChange} />
            </label>
          </div>
        </form>
      </section>

      <section className="intercurrences-list" aria-live="polite">
        <div className="section-head">
          <div>
            <h2 className="section-title">Intercorrências registradas</h2>
            <p className="section-copy">{hasActiveFilters ? 'Resultado filtrado do histórico clínico.' : 'Histórico mais recente registrado pela clínica.'}</p>
          </div>
          <span className="badge badge-muted">{pluralize(total, 'registro', 'registros')}</span>
        </div>

        {loading ? (
          <div className="loading-page loading-page-inline"><span className="spinner" /> Carregando intercorrências...</div>
        ) : items.length ? (
          <div className="intercurrence-card-list">
            {items.map(item => (
              <article className="intercurrence-card" key={item.id}>
                <div className="intercurrence-card-main">
                  <div className="intercurrence-card-head">
                    <div>
                      <span className="intercurrence-date">{formatDateTime(item.occurredAt)}</span>
                      <h3>{item.procedureName}</h3>
                    </div>
                    <span className={item.editsCount ? 'badge badge-gold' : 'badge badge-green'}>
                      {item.editsCount ? pluralize(item.editsCount, 'edição registrada', 'edições registradas') : 'Registro original'}
                    </span>
                  </div>
                  <div className="intercurrence-meta-row">
                    <span><Icon name="users" size={14} /> {getClientName(item)}</span>
                    <span><Icon name="person" size={14} /> {item.professionalName}</span>
                    <span><Icon name="clock" size={14} /> Criado em {formatDateTime(item.createdAt)}</span>
                  </div>
                  <p>{item.description}</p>
                  <div className="intercurrence-conduct">
                    <strong>Conduta adotada</strong>
                    <span>{item.conduct}</span>
                  </div>
                </div>
                <div className="intercurrence-card-actions">
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => void openEdit(item)} disabled={loadingDetailId === item.id}>
                    {loadingDetailId === item.id ? <span className="spinner" /> : <><Icon name="edit" /> Editar com histórico</>}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty empty-tight">
            <div className="empty-icon"><Icon name="clipboard" size={24} /></div>
            <h3>Nenhuma intercorrência encontrada</h3>
            <p>Registre a primeira intercorrência para manter o histórico clínico completo e rastreável.</p>
          </div>
        )}
      </section>

      {modalMode ? (
        <div className="modal-backdrop" onClick={event => event.target === event.currentTarget && closeModal()}>
          <div className="modal modal-lg intercurrence-modal">
            <div className="intercurrence-modal-head">
              <div>
                <h2 className="modal-title">{modalMode === 'edit' ? 'Editar intercorrência' : 'Nova intercorrência'}</h2>
                <p className="section-copy">
                  {modalMode === 'edit'
                    ? 'A edição exige justificativa e cria histórico de alteração.'
                    : 'Preencha o registro com objetividade, conduta adotada e profissional responsável.'}
                </p>
              </div>
              <span className="badge badge-muted">Histórico seguro</span>
            </div>

            <div className="form-grid">
              <div className="form-group form-full">
                <label className="form-label">Cliente vinculada ao prontuário</label>
                <select className="form-input" value={form.clientId} onChange={setField('clientId')}>
                  <option value="">Selecione a cliente</option>
                  {clients.map(client => <option key={client.id} value={String(client.id)}>{client.name}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Procedimento cadastrado</label>
                <select className="form-input" value={form.serviceId} onChange={handleServiceChange}>
                  <option value="">Informar manualmente</option>
                  {services.map(service => <option key={service.id} value={String(service.id)}>{service.name}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Nome do procedimento</label>
                <input className="form-input" value={form.procedureName} onChange={setField('procedureName')} placeholder="Ex: Limpeza de pele" />
              </div>

              <div className="form-group">
                <label className="form-label">Data da intercorrência</label>
                <input className="form-input" type="date" value={form.occurredDate} onChange={setField('occurredDate')} />
              </div>

              <div className="form-group">
                <label className="form-label">Hora da intercorrência</label>
                <input className="form-input" type="time" value={form.occurredTime} onChange={setField('occurredTime')} />
              </div>

              <div className="form-group">
                <label className="form-label">Profissional cadastrada</label>
                <select className="form-input" value={form.professionalId} onChange={handleProfessionalChange}>
                  <option value="">Informar manualmente</option>
                  {professionals.map(professional => <option key={professional.id} value={String(professional.id)}>{professional.name}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Profissional responsável</label>
                <input className="form-input" value={form.professionalName} onChange={setField('professionalName')} placeholder="Nome da profissional" />
              </div>

              <div className="form-group form-full">
                <label className="form-label">Descrição detalhada</label>
                <textarea className="form-textarea" value={form.description} onChange={setField('description')} placeholder="Descreva o que aconteceu, sinais observados, momento e evolução inicial." />
              </div>

              <div className="form-group form-full">
                <label className="form-label">Conduta adotada</label>
                <textarea className="form-textarea" value={form.conduct} onChange={setField('conduct')} placeholder="Informe a orientação dada, medidas realizadas e encaminhamentos." />
              </div>

              <div className="form-group form-full">
                <label className="form-label">Observações adicionais</label>
                <textarea className="form-textarea" value={form.notes} onChange={setField('notes')} placeholder="Campo opcional para complementos, retorno, contato posterior ou anexos futuros." />
              </div>

              {modalMode === 'edit' ? (
                <div className="form-group form-full">
                  <label className="form-label">Motivo da edição</label>
                  <input className="form-input" value={form.editReason} onChange={setField('editReason')} placeholder="Ex: Complemento de conduta após retorno da cliente" />
                </div>
              ) : null}
            </div>

            {modalMode === 'edit' && selected?.edits?.length ? (
              <div className="intercurrence-history-box">
                <strong>Histórico de edições</strong>
                {selected.edits.slice(0, 4).map(edit => (
                  <div className="intercurrence-history-item" key={edit.id}>
                    <span>{formatDateTime(edit.createdAt)} por {edit.editedByEmail || 'Sistema'}</span>
                    <p>{edit.editReason || 'Edição registrada sem observação complementar.'}</p>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="inline-tip inline-tip-gold">
              <Icon name="shield" />
              Intercorrências ficam vinculadas ao prontuário. Não há exclusão rápida, e edições exigem justificativa.
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-outline" onClick={closeModal}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={() => void handleSave()} disabled={saving}>
                {saving ? <span className="spinner" /> : modalMode === 'edit' ? 'Salvar com histórico' : 'Registrar intercorrência'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
