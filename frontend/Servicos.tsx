import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import toast from 'react-hot-toast'
import api, { downloadApiFile, getApiErrorMessage } from './api'
import type { Identifier } from './clinicalTypes'
import type { ServicePopSummary, ServiceRecord } from './operationsTypes'
import { Icon } from './Icon'

interface ServiceFormState {
  name: string
  description: string
  duration: number
  price: string
  active: boolean
}

type ServiceModalMode = 'create' | 'edit' | null

const emptyForm: ServiceFormState = {
  name: '',
  description: '',
  duration: 60,
  price: '',
  active: true,
}

function formatPrice(value: number | string | null | undefined) {
  const amount = Number(value || 0)

  if (!Number.isFinite(amount)) return 'R$ 0,00'

  return amount.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(href)
}

function buildPopModalFromService(service?: ServiceRecord | null): ServicePopSummary | null {
  if (!service?.id || !service.servicePop) return null

  return {
    ...service.servicePop,
    content: service.servicePop.content || '',
    service: service.servicePop.service || {
      id: service.id,
      name: service.name,
      duration: service.duration,
    },
  }
}

interface ServiceCardProps {
  service: ServiceRecord
  loadingPopId: Identifier | null
  onOpenPop: (serviceId: Identifier) => Promise<void>
  onEdit: (service: ServiceRecord) => void
  onDelete: (serviceId: Identifier) => Promise<void>
}

function ServiceCard({ service, loadingPopId, onOpenPop, onEdit, onDelete }: ServiceCardProps) {
  const hasPop = Boolean(service.servicePop)

  return (
    <article className="service-card">
      <div className="service-card-head">
        <div>
          <h3 className="service-card-title">{service.name}</h3>
          <p className="service-card-description">
            {service.description || 'Serviço com descrição enxuta e operação pronta para a agenda.'}
          </p>
        </div>
        <span className={hasPop ? 'badge badge-green' : 'badge badge-muted'}>
          {hasPop ? 'POP pronto' : 'POP pendente'}
        </span>
      </div>

      <div className="service-meta-grid">
        <div className="service-meta-item">
          <span>Duração</span>
          <strong>{service.duration} min</strong>
        </div>
        <div className="service-meta-item">
          <span>Valor</span>
          <strong>{formatPrice(service.price)}</strong>
        </div>
      </div>

      <div className="service-card-actions">
        <button type="button" className="btn btn-outline btn-sm" onClick={() => void onOpenPop(service.id)} disabled={loadingPopId === service.id}>
          {loadingPopId === service.id ? <span className="spinner" /> : <><Icon name="fileText" /> {hasPop ? 'Abrir POP' : 'Gerar POP'}</>}
        </button>

        {!hasPop ? (
          <span className="service-inline-note">Se o POP ainda não aparecer no card, você pode gerar agora sem sair da lista.</span>
        ) : null}

        <button type="button" className="btn btn-outline btn-sm" onClick={() => onEdit(service)}>
          <Icon name="edit" /> Editar
        </button>
        <button type="button" className="btn btn-ghost btn-sm danger-ghost" onClick={() => void onDelete(service.id)}>
          <Icon name="trash" /> Arquivar
        </button>
      </div>
    </article>
  )
}

export default function Serviços() {
  const [services, setServices] = useState<ServiceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<ServiceModalMode>(null)
  const [popModal, setPopModal] = useState<ServicePopSummary | null>(null)
  const [form, setForm] = useState<ServiceFormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [loadingPopId, setLoadingPopId] = useState<Identifier | null>(null)
  const [downloadingPopPdf, setDownloadingPopPdf] = useState(false)
  const [selected, setSelected] = useState<ServiceRecord | null>(null)
  const serviceMetrics = useMemo(() => {
    const activeServices = services.filter(service => service.active !== false)
    const popReady = services.filter(service => service.servicePop).length
    const averageDuration = services.length
      ? Math.round(services.reduce((total, service) => total + Number(service.duration || 0), 0) / services.length)
      : 0
    const averagePrice = services.length
      ? services.reduce((total, service) => total + Number(service.price || 0), 0) / services.length
      : 0

    return {
      total: services.length,
      active: activeServices.length,
      popReady,
      averageDuration,
      averagePrice,
    }
  }, [services])

  const load = useCallback(async () => {
    setLoading(true)

    try {
      const { data } = await api.get<ServiceRecord[]>('/services')
      setServices(data)
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Não foi possível carregar os serviços'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function openCreate() {
    setForm(emptyForm)
    setSelected(null)
    setModal('create')
  }

  function openEdit(service: ServiceRecord) {
    setForm({
      name: service.name,
      description: service.description || '',
      duration: service.duration,
      price: String(service.price),
      active: service.active ?? true,
    })
    setSelected(service)
    setModal('edit')
  }

  function setField<Key extends keyof ServiceFormState>(key: Key) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const value = key === 'duration' ? Number(event.target.value) : event.target.value
      setForm(current => ({ ...current, [key]: value }))
    }
  }

  async function openPop(serviceId: Identifier) {
    setLoadingPopId(serviceId)

    try {
      const { data } = await api.get<ServicePopSummary>(`/services/${serviceId}/pop`)
      setPopModal(data)
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Não foi possível abrir o POP deste serviço'))
    } finally {
      setLoadingPopId(null)
    }
  }

  async function handleSave() {
    if (!form.name.trim() || !form.price) {
      toast.error('Nome e valor são obrigatórios')
      return
    }

    const parsedDuration = Number(form.duration)
    const parsedPrice = Number(form.price)

    if (!Number.isFinite(parsedDuration) || parsedDuration < 5) {
      toast.error('Informe uma duração válida, a partir de 5 minutos')
      return
    }

    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      toast.error('Informe um valor válido para o serviço')
      return
    }

    setSaving(true)

    try {
      const payload = {
        ...form,
        duration: parsedDuration,
        price: parsedPrice,
      }

      if (modal === 'create') {
        const { data } = await api.post<ServiceRecord>('/services', payload)
        const nextPopModal = buildPopModalFromService(data)
        toast.success('Serviço criado com POP automático')
        setModal(null)
        setSelected(null)
        setForm(emptyForm)
        await load()

        if (nextPopModal?.content) {
          setPopModal(nextPopModal)
        } else if (data?.id) {
          await openPop(data.id)
        } else {
          toast.error('O serviço foi salvo, mas o POP não retornou com um identificador válido.')
        }
      } else if (selected) {
        await api.put(`/services/${selected.id}`, payload)
        toast.success('Serviço atualizado com sucesso')
        setModal(null)
        setSelected(null)
        setForm(emptyForm)
        await load()
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Não foi possível salvar o serviço'))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: Identifier) {
    if (!window.confirm('Deseja desativar este serviço?')) return

    try {
      await api.delete(`/services/${id}`)
      toast.success('Serviço desativado')
      await load()
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Não foi possível desativar o serviço'))
    }
  }

  async function handleCopyPop() {
    if (!popModal?.content) return

    try {
      await navigator.clipboard.writeText(popModal.content)
      toast.success('POP copiado para a área de transferência')
    } catch {
      toast.error('Não foi possível copiar o POP')
    }
  }

  async function handleDownloadPopPdf() {
    if (!popModal?.service?.id) return

    setDownloadingPopPdf(true)

    try {
      await downloadApiFile(
        `/services/${popModal.service.id}/pop/pdf`,
        `${(popModal.title || 'pop').toLowerCase().replace(/[^a-z0-9]+/gi, '-')}.pdf`
      )
      toast.success('PDF do POP baixado com sucesso')
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Não foi possível baixar o PDF do POP'))
    } finally {
      setDownloadingPopPdf(false)
    }
  }

  return (
    <div className="page services-page ux-compact-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Serviços</h1>
          <p className="page-subtitle">Monte um catálogo claro, elegante e pronto para a agenda.</p>
        </div>

        <button type="button" className="btn btn-primary" onClick={openCreate}>
          <Icon name="plus" /> Novo serviço
        </button>
      </div>

      <div className="agenda-summary-strip services-summary-strip" aria-label="Resumo operacional dos servicos">
        <div className="agenda-summary-item">
          <span>Total</span>
          <strong>{serviceMetrics.total}</strong>
        </div>
        <div className="agenda-summary-item">
          <span>Ativos</span>
          <strong>{serviceMetrics.active}</strong>
        </div>
        <div className={['agenda-summary-item', serviceMetrics.popReady < serviceMetrics.total ? 'is-alert' : ''].join(' ')}>
          <span>POP</span>
          <strong>{serviceMetrics.popReady}/{serviceMetrics.total}</strong>
        </div>
        <div className="agenda-summary-item">
          <span>Duração média</span>
          <strong>{serviceMetrics.averageDuration || 0} min</strong>
        </div>
        <div className="agenda-summary-item">
          <span>Ticket médio</span>
          <strong>{formatPrice(serviceMetrics.averagePrice)}</strong>
        </div>
      </div>

      <div className="card section-card services-list-card">
        {loading ? (
          <div className="loading-page">
            <span className="spinner" />
          </div>
        ) : services.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">
              <Icon name="procedure" size={24} />
            </div>
            <h3>Nenhum serviço cadastrado</h3>
            <p>Cadastre os tratamentos disponíveis para facilitar a montagem da agenda.</p>
          </div>
        ) : (
          <div className="service-card-list">
            {services.map(service => (
              <ServiceCard
                key={service.id}
                service={service}
                loadingPopId={loadingPopId}
                onOpenPop={openPop}
                onEdit={openEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {modal ? (
        <div className="modal-backdrop" onClick={event => event.target === event.currentTarget && setModal(null)}>
          <div className="modal">
            <h2 className="modal-title">{modal === 'create' ? 'Novo serviço' : 'Editar serviço'}</h2>

            <div className="form-grid">
              <div className="form-group form-full">
                <label className="form-label">Nome *</label>
                <input className="form-input" value={form.name} onChange={setField('name')} placeholder="Ex: Limpeza de pele premium" />
              </div>

              <div className="form-group form-full">
                <label className="form-label">Descrição</label>
                <input className="form-input" value={form.description} onChange={setField('description')} placeholder="Breve descrição do procedimento" />
              </div>

              <div className="form-group">
                <label className="form-label">Duração (min)</label>
                <input className="form-input" type="number" min="5" value={form.duration} onChange={setField('duration')} />
              </div>

              <div className="form-group">
                <label className="form-label">Valor (R$) *</label>
                <input className="form-input" type="number" min="0" step="0.01" value={form.price} onChange={setField('price')} placeholder="0,00" />
              </div>
            </div>

            {modal === 'create' ? (
              <div className="inline-tip inline-tip-gold">
                <Icon name="fileText" />
                Ao salvar, o sistema gera automaticamente um POP com opção de baixar em `.txt` ou PDF.
              </div>
            ) : null}

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

      {popModal ? (
        <div className="modal-backdrop" onClick={event => event.target === event.currentTarget && setPopModal(null)}>
          <div className="modal pop-modal">
            <h2 className="modal-title">{popModal.title}</h2>
            <p className="section-copy">
              POP gerado automaticamente para o procedimento {popModal.service?.name || 'selecionado'}.
            </p>

            <pre className="pop-content">{popModal.content}</pre>

            <div className="modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setPopModal(null)}>
                Fechar
              </button>
              <button type="button" className="btn btn-outline" onClick={handleCopyPop}>
                <Icon name="clip" /> Copiar texto
              </button>
              <button type="button" className="btn btn-outline" onClick={() => downloadTextFile(popModal.downloadName || 'pop.txt', popModal.content || '')}>
                <Icon name="download" /> Baixar TXT
              </button>
              <button type="button" className="btn btn-gold" onClick={handleDownloadPopPdf} disabled={downloadingPopPdf}>
                {downloadingPopPdf ? <span className="spinner" /> : <><Icon name="download" /> Baixar PDF</>}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
