import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import api, { getApiErrorMessage } from './api'
import { createClientRecord, listClientRecords, updateClientRecord } from './clientRecordsApi'
import { ClientAvatar } from './ClientAvatar'
import { Icon } from './Icon'
import { VerifyActionModal } from './components/VerifyActionModal'
import type { ClientRecord, ConsentRecordSummary, Identifier } from './clinicalTypes'

type ClientModalMode = 'create' | 'edit' | null
const CLIENT_PHOTO_MAX_BYTES = 5 * 1024 * 1024

interface ClientFormState {
  name: string
  phone: string
  email: string
  birthDate: string
  cpf: string
  photoDataUrl: string | null
  notes: string
}

interface ModalProps {
  title: string
  onClose: () => void
  onSave: () => void
  loading: boolean
  children: ReactNode
}

interface ClientesOverviewMetricProps {
  label: string
  value: string
  helper: string
}

interface ClientCardProps {
  client: ClientRecord
  consentLoadingId: Identifier | null
  onOpenProntuário: (clientId: Identifier) => void
  onConsent: (client: ClientRecord) => void | Promise<void>
  onEdit: (client: ClientRecord) => void
  onDelete: (id: Identifier) => void | Promise<void>
}

function Modal({ title, onClose, onSave, loading, children }: ModalProps) {
  return (
    <div className="modal-backdrop" onClick={event => event.target === event.currentTarget && onClose()}>
      <div className="modal">
        <h2 className="modal-title">{title}</h2>
        {children}

        <div className="modal-footer">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={onSave} disabled={loading}>
            {loading ? <span className="spinner" /> : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

const emptyForm: ClientFormState = {
  name: '',
  phone: '',
  email: '',
  birthDate: '',
  cpf: '',
  photoDataUrl: null,
  notes: '',
}

const consentStatusMeta: Record<string, { label: string; className: string }> = {
  none: { label: 'Sem termo', className: 'badge badge-muted' },
  PENDING: { label: 'Pendente', className: 'badge badge-gold' },
  SIGNED: { label: 'Assinado', className: 'badge badge-green' },
  REVOKED: { label: 'Revogado', className: 'badge badge-red' },
}

const anamnesisStatusMeta = {
  none: { label: 'Anamnese pendente', className: 'badge badge-muted' },
  filled: { label: 'Anamnese atualizada', className: 'badge badge-blue' },
}

function isImageConsentRecord(record: ConsentRecordSummary | null | undefined) {
  const title = typeof record?.title === 'string' ? record.title : ''
  return title.toLowerCase().includes('uso de imagem')
}

function getGeneralConsentRecord(client: ClientRecord) {
  const consentRecords = client.consentRecords || []
  return consentRecords.find(record => !isImageConsentRecord(record))
    || (!isImageConsentRecord(client.latestConsentRecord) ? client.latestConsentRecord : null)
}

function getConsentStatusMeta(client: ClientRecord) {
  const status = getGeneralConsentRecord(client)?.status
  return consentStatusMeta[status || 'none'] || consentStatusMeta.none
}

function getAnamnesisStatusMeta(client: ClientRecord) {
  return client.latestAnamnesis ? anamnesisStatusMeta.filled : anamnesisStatusMeta.none
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Não foi possível processar a imagem selecionada.'))
    image.src = dataUrl
  })
}

async function readClientPhotoAsDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Selecione um arquivo de imagem válido.')
  }

  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem selecionada.'))
    reader.readAsDataURL(file)
  })

  try {
    const image = await loadImage(rawDataUrl)
    const maxDimension = 400
    const scale = Math.min(maxDimension / image.width, maxDimension / image.height, 1)
    const width = Math.max(1, Math.round(image.width * scale))
    const height = Math.max(1, Math.round(image.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')
    if (!context) {
      return rawDataUrl
    }

    context.clearRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)

    return canvas.toDataURL('image/webp', 0.85)
  } catch (err) {
    console.warn('Falha ao comprimir imagem de avatar, enviando no formato original:', err)
    return rawDataUrl
  }
}

function ClientesOverviewMetric({ label, value, helper }: ClientesOverviewMetricProps) {
  return (
    <article className="clientes-overview-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{helper}</small>
    </article>
  )
}

function getClientWorkflowMeta(client: ClientRecord) {
  if (client.isLocked) {
    return {
      label: 'Status do prontuário',
      value: 'Leitura protegida',
      helper: 'Consulta e download em PDF continuam liberados para a clínica.',
    }
  }

  if (!client.latestAnamnesis) {
    return {
      label: 'Próximo passo',
      value: 'Preencher anamnese',
      helper: 'A ficha clínica inicial ainda não foi concluída.',
    }
  }

  if (getGeneralConsentRecord(client)?.status !== 'SIGNED') {
    return {
      label: 'Próximo passo',
      value: 'Coletar consentimento',
      helper: 'O termo digital ainda precisa de assinatura ou renovação.',
    }
  }

  return {
    label: 'Jornada clínica',
    value: 'Acompanhamento ativo',
    helper: 'Cliente pronto para evolução, fotos clínicas e novas condutas.',
  }
}

function ClientCard({ client, consentLoadingId, onOpenProntuário, onConsent, onEdit, onDelete }: ClientCardProps) {
  const consentMeta = getConsentStatusMeta(client)
  const anamnesisMeta = getAnamnesisStatusMeta(client)
  const workflowMeta = getClientWorkflowMeta(client)
  const generalConsent = getGeneralConsentRecord(client)
  const consentDate = generalConsent?.signedAt
    ? format(new Date(generalConsent.signedAt), 'dd/MM/yyyy')
    : 'Pendente'
  const anamnesisDate = client.latestAnamnesis?.filledAt
    ? format(new Date(client.latestAnamnesis.filledAt), 'dd/MM/yyyy')
    : ''
  const birthDateLabel = client.birthDate ? format(new Date(client.birthDate), 'dd/MM/yyyy') : ''
  const createdDate = client.createdAt ? format(new Date(client.createdAt), 'dd/MM/yyyy') : 'Cadastro recente'
  const isLocked = Boolean(client.isLocked)

  const hasClinicalAlerts = client.latestAnamnesis && (
    client.latestAnamnesis.contraindications?.pregnancy ||
    client.latestAnamnesis.healthHistory?.medications?.anticoagulants ||
    client.latestAnamnesis.healthHistory?.allergies?.medicationAllergy ||
    client.latestAnamnesis.healthHistory?.allergies?.cosmeticsAllergy ||
    client.latestAnamnesis.healthHistory?.allergies?.anestheticsAllergy
  )

  return (
    <article className="client-list-item client-list-item-compact">
      <div className="client-list-main">
        <div className="client-list-head">
          <div className="client-list-profile">
            <ClientAvatar name={client.name} photoDataUrl={client.photoDataUrl} size="lg" />
            <div className="client-list-head-main">
              <span className="eyebrow">Base clínica organizada</span>
              <button 
                type="button" 
                className="client-name-link client-list-title" 
                onClick={() => onOpenProntuário(client.id)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                {client.name}
                {hasClinicalAlerts && (
                  <span title="Aviso Clínico Importante (Contraindicação / Risco)" style={{ color: 'var(--danger)', display: 'inline-flex', alignItems: 'center' }}>
                    <Icon name="shield" size={14} />
                  </span>
                )}
              </button>
              <div className="client-compact-contact">
                <span>{client.phone || 'Telefone nao informado'}</span>
                {client.email ? <span>{client.email}</span> : null}
              </div>
              <p className="client-list-subtitle">
                Acesso direto ao prontuário, consentimento e histórico clínico em uma leitura contínua.
              </p>
            </div>
          </div>

          <div className="client-badge-stack client-list-badges">
            <span className={consentMeta.className}>{consentMeta.label}</span>
            <span className={anamnesisMeta.className}>{anamnesisMeta.label}</span>
            {isLocked ? <span className="badge badge-red">Prontuário bloqueado</span> : null}
          </div>
        </div>

        <div className="client-list-grid">
          <div className="client-list-column client-list-column-primary">
            <span>Contato principal</span>
            <strong>{client.phone || 'Telefone não informado'}</strong>
            <small>{client.email || 'E-mail não informado'}</small>
          </div>

          <div className="client-list-column">
            <span>Consentimento</span>
            <strong>{consentMeta.label}</strong>
            <small>{consentDate === 'Pendente' ? 'Aguardando assinatura digital.' : 'Última assinatura em ' + consentDate}</small>
          </div>

          <div className="client-list-column">
            <span>Prontuário</span>
            <strong>{anamnesisMeta.label}</strong>
            <small>{anamnesisDate ? 'Última anamnese em ' + anamnesisDate : 'Sem anamnese registrada ainda.'}</small>
          </div>

          <div className="client-list-column client-list-column-accent">
            <span>{workflowMeta.label}</span>
            <strong>{workflowMeta.value}</strong>
            <small>{workflowMeta.helper}</small>
          </div>
        </div>

        <div className="client-list-meta">
          <span>{client.cpf ? 'CPF ' + client.cpf : 'CPF não informado'}</span>
          <span>{birthDateLabel ? 'Nascimento ' + birthDateLabel : 'Nascimento não informado'}</span>
          <span>{'Cadastro em ' + createdDate}</span>
        </div>

        {client.notes ? (
          <div className="client-list-note">
            <strong>Observações clínicas</strong>
            <span>{client.notes}</span>
          </div>
        ) : null}

        {isLocked ? (
          <div className="client-list-note client-list-note-alert">
            <strong>Leitura protegida</strong>
            <span>Após a confirmação do pagamento, este prontuário fica disponível apenas para consulta e download em PDF.</span>
          </div>
        ) : null}
      </div>

      <div className="client-list-actions client-list-actions-compact">
        <button type="button" className="btn btn-gold btn-sm" onClick={() => onOpenProntuário(client.id)}>
          <Icon name="clipboard" /> Ver prontuário
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() => onConsent(client)}
          disabled={consentLoadingId === client.id || isLocked}
        >
          {consentLoadingId === client.id ? <span className="spinner" /> : <><Icon name="signature" /> Consentimento</>}
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => onEdit(client)} disabled={isLocked}>
          <Icon name="edit" /> Editar
        </button>
        <button type="button" className="btn btn-ghost btn-sm danger-ghost" onClick={() => onDelete(client.id)} disabled={isLocked}>
          <Icon name="trash" /> Remover
        </button>
      </div>
    </article>
  )
}

export default function Clientes() {
  const navigate = useNavigate()
  const [clients, setClients] = useState<ClientRecord[]>([])
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<ClientModalMode>(null)
  const [form, setForm] = useState<ClientFormState>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState<ClientRecord | null>(null)
  const [consentLoadingId, setConsentLoadingId] = useState<Identifier | null>(null)
  const [deleteTargetId, setDeleteTargetId] = useState<Identifier | null>(null)
  const hasSearch = Boolean(search.trim())

  const clientOverview = useMemo(() => {
    const total = clients.length
    const anamnesisReady = clients.filter(client => Boolean(client.latestAnamnesis)).length
    const consentPending = clients.filter(client => getGeneralConsentRecord(client)?.status !== 'SIGNED').length
    const locked = clients.filter(client => Boolean(client.isLocked)).length

    return {
      total,
      anamnesisReady,
      consentPending,
      locked,
    }
  }, [clients])

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search)
    }, 300)

    return () => {
      clearTimeout(handler)
    }
  }, [search])

  const load = useCallback(async () => {
    setLoading(true)

    try {
      const { items } = await listClientRecords({
        search: debouncedSearch,
      })

      setClients(items)
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Não foi possível carregar os clientes'))
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('action') === 'new') {
      openCreate()
      navigate('/clientes', { replace: true })
    }
  }, [navigate])

  function openCreate() {
    setForm(emptyForm)
    setSelected(null)
    setModal('create')
  }

  function openEdit(client: ClientRecord) {
    setForm({
      name: client.name || client.fullName || '',
      phone: client.phone || '',
      email: client.email || '',
      birthDate: client.birthDate ? client.birthDate.slice(0, 10) : '',
      cpf: client.cpf || '',
      photoDataUrl: client.photoDataUrl || null,
      notes: client.notes || '',
    })
    setSelected(client)
    setModal('edit')
  }

  function openProntuário(clientId: Identifier) {
    navigate('/clientes/' + clientId)
  }

  async function handleSave() {
    const normalizedName = form.name.trim()
    const normalizedPhone = form.phone.trim()
    const normalizedEmail = form.email.trim().toLowerCase()

    if (!normalizedName || !normalizedPhone) {
      toast.error('Nome e telefone são obrigatórios')
      return
    }

    if (normalizedEmail && !isValidEmail(normalizedEmail)) {
      toast.error('Informe um e-mail válido para continuar')
      return
    }

    setSaving(true)

    try {
      const payload = {
        ...form,
        name: normalizedName,
        phone: normalizedPhone,
        email: normalizedEmail,
        notes: form.notes.trim(),
        cpf: form.cpf.trim(),
        photoDataUrl: form.photoDataUrl,
      }

      if (modal === 'create') {
        const client = await createClientRecord(payload)
        toast.success('Cliente cadastrado. Próximo passo: preencher a anamnese.')
        setModal(null)
        await load()
        navigate('/clientes/' + client.id + '/anamnese')
        return
      }

      if (!selected?.id) {
        toast.error('Selecione um cliente valido para continuar')
        return
      }

      await updateClientRecord(selected.id, payload)
      toast.success('Cliente atualizado com sucesso')
      setModal(null)
      await load()
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Não foi possível salvar o cliente'))
    } finally {
      setSaving(false)
    }
  }

  async function handleConsent(client: ClientRecord) {
    setConsentLoadingId(client.id)

    try {
      const generalConsent = getGeneralConsentRecord(client)
      let recordId = generalConsent?.id

      if (!recordId || generalConsent?.status === 'REVOKED') {
        const { data } = await api.post<{ id: Identifier }>('/clients/' + client.id + '/consent-records/generate-default')
        recordId = data.id
      }

      navigate('/clientes/' + client.id + '/consentimentos/' + recordId + '/assinar')
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Não foi possível abrir o termo de consentimento'))
    } finally {
      setConsentLoadingId(null)
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTargetId) return

    try {
      await api.delete('/clients/' + deleteTargetId)
      toast.success('Cliente removido')
      setDeleteTargetId(null)
      await load()
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Não foi possível excluir o cliente'))
    }
  }

  function handleDelete(id: Identifier) {
    setDeleteTargetId(id)
  }

  const setField = (key: keyof ClientFormState) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm(current => ({ ...current, [key]: event.target.value }))
  }

  async function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const photoDataUrl = await readClientPhotoAsDataUrl(file)
      setForm(current => ({ ...current, photoDataUrl }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível carregar a foto')
    } finally {
      event.target.value = ''
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Clientes</h1>
          <p className="page-subtitle">Cadastro mais limpo, leitura mais rápida e acesso direto ao prontuário, anamnese e histórico do cliente.</p>
        </div>

        <button type="button" className="btn btn-primary" onClick={openCreate}>
          <Icon name="plus" /> Novo cliente
        </button>
      </div>

      <section className="card filter-card">
        <div className="form-group">
          <label className="form-label">Buscar cliente</label>
          <div className="toolbar-card clientes-search-row">
            <div className="input-with-icon-wrapper" style={{ position: 'relative', flex: 1 }}>
              <input
                className="form-input"
                type="search"
                placeholder="Pesquise por nome, telefone ou e-mail"
                value={search}
                onChange={event => setSearch(event.target.value)}
                style={{ paddingLeft: '38px', width: '100%' }}
              />
              <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--gold-deep)', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
                <Icon name="search" size={16} />
              </span>
            </div>
            {hasSearch ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSearch('')}>
                Limpar busca
              </button>
            ) : null}
          </div>
          <p className="filter-helper-text" aria-live="polite">
            {hasSearch
              ? `${clientOverview.total} cliente(s) correspondem à busca atual.`
              : 'Busque por nome, telefone ou e-mail para localizar a ficha correta com mais rapidez.'}
          </p>
        </div>
      </section>

      <section className="clientes-overview-strip" aria-label="Resumo da base de clientes">
        <ClientesOverviewMetric
          label="Clientes visíveis"
          value={String(clientOverview.total)}
          helper={search ? 'Total calculado com base no filtro atual.' : 'Leitura rápida da carteira ativa visível na tela.'}
        />
        <ClientesOverviewMetric
          label="Anamnese em dia"
          value={String(clientOverview.anamnesisReady)}
          helper="Clientes com anamnese mais recente já registrada no prontuário."
        />
        <ClientesOverviewMetric
          label="Consentimento pendente"
          value={String(clientOverview.consentPending)}
          helper="Clientes que ainda precisam assinar ou renovar o termo digital."
        />
        <ClientesOverviewMetric
          label="Prontuário bloqueado"
          value={String(clientOverview.locked)}
          helper="Registros já protegidos após confirmação de pagamento."
        />
      </section>

      {loading ? (
        <div className="client-list">
          {[1, 2, 3].map(i => (
            <article key={i} className="client-list-item client-list-item-compact skeleton-card" style={{ gap: '16px', minHeight: 'auto', padding: '24px' }}>
              <div className="client-list-head" style={{ borderBottom: 'none', paddingBottom: 0 }}>
                <div className="client-list-profile" style={{ display: 'flex', gap: '16px', width: '100%', alignItems: 'center' }}>
                  <div className="skeleton-circle skeleton-shimmer" style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div className="skeleton-line title skeleton-shimmer" style={{ width: '40%', height: '18px' }} />
                    <div className="skeleton-line subtitle skeleton-shimmer" style={{ width: '60%', height: '12px', margin: '6px 0' }} />
                    <div className="skeleton-line paragraph skeleton-shimmer" style={{ width: '80%', height: '10px' }} />
                  </div>
                </div>
              </div>
              <div className="client-list-grid" style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px' }}>
                <div className="client-list-column">
                  <div className="skeleton-line short skeleton-shimmer" style={{ width: '50%', height: '10px', marginBottom: '6px' }} />
                  <div className="skeleton-line short skeleton-shimmer" style={{ width: '80%', height: '12px' }} />
                </div>
                <div className="client-list-column">
                  <div className="skeleton-line short skeleton-shimmer" style={{ width: '50%', height: '10px', marginBottom: '6px' }} />
                  <div className="skeleton-line short skeleton-shimmer" style={{ width: '80%', height: '12px' }} />
                </div>
                <div className="client-list-column">
                  <div className="skeleton-line short skeleton-shimmer" style={{ width: '50%', height: '10px', marginBottom: '6px' }} />
                  <div className="skeleton-line short skeleton-shimmer" style={{ width: '80%', height: '12px' }} />
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : clients.length ? (
        <div className="client-list">
          {clients.map(client => (
            <ClientCard
              key={client.id}
              client={client}
              consentLoadingId={consentLoadingId}
              onOpenProntuário={openProntuário}
              onConsent={handleConsent}
              onEdit={openEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <Icon name="users" />
          <h3>Nenhum cliente encontrado</h3>
          <p>Cadastre o primeiro cliente para começar a organizar prontuário, consentimento e histórico clínico.</p>
        </div>
      )}

      {modal ? (
        <Modal
          title={modal === 'create' ? 'Novo cliente' : 'Editar cliente'}
          onClose={() => setModal(null)}
          onSave={handleSave}
          loading={saving}
        >
          <div className="form-grid">
            <div className="form-group form-full">
              <label className="form-label">Foto de identificação</label>
              <div className="client-photo-upload">
                <ClientAvatar name={form.name || selected?.name} photoDataUrl={form.photoDataUrl} size="hero" />
                <div className="client-photo-upload-actions">
                  <label className="btn btn-outline btn-sm photo-upload-btn">
                    <Icon name="camera" /> Escolher foto
                    <input type="file" accept="image/*" hidden onChange={handlePhotoChange} />
                  </label>
                  {form.photoDataUrl ? (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm(current => ({ ...current, photoDataUrl: null }))}>
                      Remover foto
                    </button>
                  ) : null}
                  <p className="text-muted media-upload-copy">Use uma imagem frontal e clara. Ela aparece no prontuário para reduzir risco de abrir a ficha errada.</p>
                </div>
              </div>
            </div>

            <div className="form-group form-full">
              <label className="form-label">Nome completo *</label>
              <input className="form-input" value={form.name} onChange={setField('name')} />
            </div>
            <div className="form-group">
              <label className="form-label">Telefone *</label>
              <input className="form-input" type="tel" inputMode="tel" value={form.phone} onChange={setField('phone')} />
            </div>
            <div className="form-group">
              <label className="form-label">CPF</label>
              <input className="form-input" value={form.cpf} onChange={setField('cpf')} />
            </div>
            <div className="form-group">
              <label className="form-label">Nascimento</label>
              <input className="form-input" type="date" value={form.birthDate || ''} onChange={setField('birthDate')} />
            </div>
            <div className="form-group form-full">
              <label className="form-label">E-mail</label>
              <input className="form-input" type="email" inputMode="email" value={form.email || ''} onChange={setField('email')} />
            </div>
            <div className="form-group form-full">
              <label className="form-label">Observações</label>
              <textarea className="form-textarea" value={form.notes || ''} onChange={setField('notes')} rows={4} />
            </div>
          </div>

          {modal === 'create' ? (
            <p className="form-helper-text">Ao salvar um novo cliente, o sistema direciona automaticamente para a anamnese.</p>
          ) : null}
        </Modal>
      ) : null}

      <VerifyActionModal
        isOpen={deleteTargetId !== null}
        title="Excluir Cliente"
        description="Esta ação é crítica e removerá permanentemente a ficha do cliente de sua base ativa. Para confirmar, digite sua senha."
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTargetId(null)}
      />
    </div>
  )
}
