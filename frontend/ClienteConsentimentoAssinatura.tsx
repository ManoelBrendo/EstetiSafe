import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, PointerEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import api, { downloadApiFile, getApiErrorMessage } from './api'
import { Icon } from './Icon'
import type { Identifier } from './clinicalTypes'
import type { ProfessionalSummary } from './operationsTypes'

const CANVAS_WIDTH = 960
const CANVAS_HEIGHT = 280
const PROFESSIONALS_LOAD_TIMEOUT_MS = 4500

type ConsentStatus = 'PENDING' | 'SIGNED' | 'REVOKED'

interface ConsentClientSummary {
  id: Identifier
  name: string
  phone?: string | null
  email?: string | null
  cpf?: string | null
}

interface ConsentRecordDetail {
  id: Identifier
  clientId: Identifier
  title: string
  versionLabel: string
  termText: string
  status: ConsentStatus | string
  createdAt?: string | null
  signedAt?: string | null
  updatedAt?: string | null
  signatureDataUrl?: string | null
  signerName?: string | null
  signerDocument?: string | null
  professionalId?: Identifier | null
  professionalName?: string | null
  client: ConsentClientSummary
}

const consentStatusMeta: Record<ConsentStatus, { label: string; className: string }> = {
  PENDING: { label: 'Pendente de assinatura', className: 'badge badge-gold' },
  SIGNED: { label: 'Assinado', className: 'badge badge-green' },
  REVOKED: { label: 'Revogado', className: 'badge badge-red' },
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Ainda não assinado'

  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.getTime())) return 'Data inválida'

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(parsedDate)
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)

    promise.then(
      value => {
        window.clearTimeout(timeout)
        resolve(value)
      },
      error => {
        window.clearTimeout(timeout)
        reject(error)
      }
    )
  })
}

function prepareCanvas(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d')
  if (!context) return

  context.fillStyle = '#fffaf4'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.strokeStyle = '#8e6333'
  context.lineWidth = 3.5
  context.lineCap = 'round'
  context.lineJoin = 'round'
}

function StatusBadge({ status }: { status?: string | null }) {
  const meta =
    status && status in consentStatusMeta
      ? consentStatusMeta[status as ConsentStatus]
      : { label: 'Sem status', className: 'badge badge-muted' }

  return <span className={meta.className}>{meta.label}</span>
}

export default function ClienteConsentimentoAssinatura() {
  const navigate = useNavigate()
  const { clientId = '', consentRecordId = '' } = useParams<{ clientId: string; consentRecordId: string }>()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawingRef = useRef(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [record, setRecord] = useState<ConsentRecordDetail | null>(null)
  const [professionals, setProfessionals] = useState<ProfessionalSummary[]>([])
  const [professionalsLoading, setProfessionalsLoading] = useState(false)
  const [professionalsLoadWarning, setProfessionalsLoadWarning] = useState('')
  const [signerName, setSignerName] = useState('')
  const [signerDocument, setSignerDocument] = useState('')
  const [professionalId, setProfessionalId] = useState('')
  const [professionalName, setProfessionalName] = useState('')
  const [useManualProfessional, setUseManualProfessional] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)

  const selectedProfessional = useMemo(
    () => professionals.find(item => String(item.id) === String(professionalId)) || null,
    [professionalId, professionals]
  )

  const resolvedProfessionalName =
    selectedProfessional?.name || professionalName.trim() || record?.professionalName || 'Não informado'

  const loadRecord = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    setProfessionals([])
    setProfessionalsLoadWarning('')
    setProfessionalsLoading(false)

    if (!clientId || !consentRecordId) {
      setRecord(null)
      setLoadError('Link do termo incompleto. Volte ao prontuário do cliente e abra o termo novamente.')
      setLoading(false)
      return
    }

    let consentData: ConsentRecordDetail

    try {
      const { data } = await api.get<ConsentRecordDetail>('/consent-records/' + consentRecordId)

      if (String(data.clientId) !== String(clientId)) {
        throw new Error('O termo informado não pertence a este cliente')
      }

      consentData = data
      setRecord(data)
      setSignerName(data.signerName || data.client?.name || '')
      setSignerDocument(data.signerDocument || data.client?.cpf || '')
      setAccepted(data.status === 'SIGNED')
      setHasSignature(data.status === 'SIGNED')
      setProfessionalId(data.professionalId ? String(data.professionalId) : '')
      setProfessionalName(data.professionalName || '')
      setUseManualProfessional(!data.professionalId || Boolean(data.professionalName))
    } catch (error) {
      const message = getApiErrorMessage(error, 'Não foi possível abrir o termo de consentimento')

      setRecord(null)
      setLoadError(message)
      toast.error(message)
      return
    } finally {
      setLoading(false)
    }

    setProfessionalsLoading(true)

    try {
      const { data: professionalsData } = await withTimeout(
        api.get<ProfessionalSummary[]>('/professionals'),
        PROFESSIONALS_LOAD_TIMEOUT_MS,
        'Tempo esgotado ao carregar profissionais'
      )
      const safeProfessionals = Array.isArray(professionalsData) ? professionalsData : []
      const matchedProfessional =
        safeProfessionals.find(item => String(item.id) === String(consentData.professionalId || '')) || null

      setProfessionals(safeProfessionals)
      setProfessionalId(matchedProfessional ? String(matchedProfessional.id) : '')
      setProfessionalName(matchedProfessional ? matchedProfessional.name : consentData.professionalName || '')
      setUseManualProfessional(!safeProfessionals.length || Boolean(consentData.professionalName && !matchedProfessional))
    } catch (error) {
      const message = getApiErrorMessage(
        error,
        'Termo aberto, mas não foi possível carregar profissionais. Informe manualmente.'
      )

      setProfessionals([])
      setProfessionalsLoadWarning(message)
      setProfessionalId('')
      setProfessionalName(consentData.professionalName || '')
      setUseManualProfessional(true)
      toast.error(message)
    } finally {
      setProfessionalsLoading(false)
    }
  }, [clientId, consentRecordId])

  useEffect(() => {
    void loadRecord()
  }, [loadRecord])

  useEffect(() => {
    if (loading || record?.status !== 'PENDING') return

    const canvas = canvasRef.current
    if (!canvas) return

    prepareCanvas(canvas)
    setHasSignature(false)
  }, [loading, record?.id, record?.status])

  const statusMeta = useMemo(() => {
    if (record?.status && record.status in consentStatusMeta) {
      return consentStatusMeta[record.status as ConsentStatus]
    }

    return consentStatusMeta.PENDING
  }, [record?.status])

  function getCanvasPoint(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return null

    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height

    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    }
  }

  function handlePointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (record?.status !== 'PENDING') return

    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    const point = getCanvasPoint(event)
    if (!point) return

    event.preventDefault()
    drawingRef.current = true
    canvas.setPointerCapture?.(event.pointerId)

    context.beginPath()
    context.moveTo(point.x, point.y)
    context.lineTo(point.x + 0.1, point.y + 0.1)
    context.stroke()
    setHasSignature(true)
  }

  function handlePointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || record?.status !== 'PENDING') return

    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    const point = getCanvasPoint(event)
    if (!point) return

    event.preventDefault()
    context.lineTo(point.x, point.y)
    context.stroke()
  }

  function handlePointerUp(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return

    drawingRef.current = false
    canvasRef.current?.releasePointerCapture?.(event.pointerId)
  }

  function clearSignature() {
    const canvas = canvasRef.current
    if (!canvas) return

    prepareCanvas(canvas)
    setHasSignature(false)
  }

  function handleProfessionalChange(event: ChangeEvent<HTMLSelectElement>) {
    const value = event.target.value

    if (value === 'MANUAL') {
      setUseManualProfessional(true)
      setProfessionalId('')
      return
    }

    setUseManualProfessional(false)
    setProfessionalId(value)

    const nextProfessional = professionals.find(item => String(item.id) === String(value)) || null
    setProfessionalName(nextProfessional ? nextProfessional.name : '')
  }

  async function handleSubmit() {
    if (!record) return

    if (!signerName.trim()) {
      toast.error('Informe o nome de quem esta assinando')
      return
    }

    const selectedName = useManualProfessional ? professionalName.trim() : selectedProfessional?.name || ''

    if (!selectedProfessional && !selectedName) {
      toast.error('Selecione ou informe o profissional responsável')
      return
    }

    if (!accepted) {
      toast.error('Confirme a leitura e concordancia com o termo')
      return
    }

    if (!hasSignature || !canvasRef.current) {
      toast.error('Faca a assinatura no campo indicado')
      return
    }

    setSaving(true)

    try {
      const signatureDataUrl = canvasRef.current.toDataURL('image/png')
      const { data } = await api.post<ConsentRecordDetail>('/consent-records/' + record.id + '/sign', {
        signerName: signerName.trim(),
        signerDocument: signerDocument.trim(),
        professionalId: useManualProfessional ? null : selectedProfessional ? selectedProfessional.id : null,
        professionalName: selectedName,
        signatureDataUrl,
        accepted: true,
      })

      setRecord(data)
      setAccepted(true)
      setHasSignature(true)
      setProfessionalId(data.professionalId ? String(data.professionalId) : '')
      setProfessionalName(data.professionalName || '')
      setUseManualProfessional(!data.professionalId && Boolean(data.professionalName))
      toast.success('Termo assinado e salvo no cadastro do cliente')
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Não foi possível salvar a assinatura'))
    } finally {
      setSaving(false)
    }
  }

  async function handleRevokeConsent() {
    if (!record?.id || record.status !== 'SIGNED') return

    const reason = window.prompt('Informe o motivo da revogação. Este texto ficara registrado na auditoria interna.')
    if (reason === null) return

    const confirmed = window.confirm('Confirmar revogação deste termo? A assinatura e o PDF permanecem preservados, mas o status passa a ser revogado.')
    if (!confirmed) return

    setRevoking(true)

    try {
      const { data } = await api.post<ConsentRecordDetail>('/consent-records/' + record.id + '/revoke', {
        reason: reason.trim() || undefined,
      })

      setRecord(data)
      setAccepted(false)
      toast.success('Termo revogado com rastreabilidade preservada')
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Não foi possível revogar o termo'))
    } finally {
      setRevoking(false)
    }
  }

  async function handleDownloadPdf() {
    if (!record?.id) return

    setDownloadingPdf(true)

    try {
      await downloadApiFile(
        '/consent-records/' + record.id + '/pdf',
        'termo-consentimento-' + (record.client?.name || record.id) + '.pdf'
      )
      toast.success('PDF do termo baixado com sucesso')
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Não foi possível baixar o PDF do termo'))
    } finally {
      setDownloadingPdf(false)
    }
  }

  if (loading) {
    return (
      <div className="page">
        <div className="loading-page">
          <span className="spinner" />
          Preparando o termo de consentimento...
        </div>
      </div>
    )
  }

  if (!record) {
    return (
      <div className="page consent-page">
        <section className="card consent-panel consent-load-error">
          <div className="empty-icon">
            <Icon name="clipboard" size={24} />
          </div>
          <div>
            <p className="eyebrow">Termo de consentimento</p>
            <h1 className="section-title">Não conseguimos abrir este termo</h1>
            <p className="section-copy">
              {loadError || 'O termo não retornou os dados esperados. Tente novamente ou volte ao prontuário do cliente.'}
            </p>
          </div>
          <div className="consent-actions consent-actions-start">
            <button type="button" className="btn btn-gold" onClick={() => void loadRecord()}>
              <Icon name="refresh" /> Tentar novamente
            </button>
            <button type="button" className="btn btn-outline" onClick={() => navigate('/clientes/' + clientId)}>
              <Icon name="back" /> Voltar ao prontuário
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => navigate('/clientes')}>
              Voltar para clientes
            </button>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="page consent-page">
      <div className="page-header consent-page-header">
        <div>
          <button type="button" className="btn btn-ghost consent-back" onClick={() => navigate('/clientes')}>
            <Icon name="back" /> Voltar para clientes
          </button>
          <h1 className="page-title">Termo de consentimento</h1>
          <p className="page-subtitle">
            Assinatura digital vinculada diretamente ao prontuário de {record.client.name}.
          </p>
        </div>

        <StatusBadge status={record.status} />
      </div>

      <div className="consent-layout">
        <div className="consent-main">
          <section className="card consent-panel">
            <div className="section-head consent-panel-head">
              <div>
                <h2 className="section-title">{record.title}</h2>
                <p className="section-copy">
                  Versao {record.versionLabel} gerada em {formatDateTime(record.createdAt)}.
                </p>
              </div>
              <span className={statusMeta.className}>{statusMeta.label}</span>
            </div>

            <div className="consent-scroll">
              {record.termText.split('\n').map((line, index) => (
                <p key={[record.id, index].join('-')}>{line || '\u00A0'}</p>
              ))}
            </div>
          </section>

          <section className="card consent-panel">
            <div className="section-head consent-panel-head">
              <div>
                <h2 className="section-title">Assinatura digital</h2>
                <p className="section-copy">
                  Capture a assinatura com o dedo, mouse ou caneta para arquivar a evidência deste termo.
                </p>
              </div>
            </div>

            <div className="form-grid consent-form-grid">
              <div className="form-group">
                <label className="form-label">Nome de quem assina</label>
                <input
                  className="form-input"
                  value={signerName}
                  onChange={event => setSignerName(event.target.value)}
                  disabled={record.status !== 'PENDING'}
                  placeholder="Nome completo"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Documento</label>
                <input
                  className="form-input"
                  value={signerDocument}
                  onChange={event => setSignerDocument(event.target.value)}
                  disabled={record.status !== 'PENDING'}
                  placeholder="CPF ou outro documento"
                />
              </div>

              {professionals.length ? (
                <div className="form-group">
                  <label className="form-label">Profissional responsável *</label>
                  <select
                    className="form-select"
                    value={useManualProfessional ? 'MANUAL' : professionalId}
                    onChange={handleProfessionalChange}
                    disabled={record.status !== 'PENDING'}
                  >
                    <option value="">Selecione</option>
                    {professionals.map(professional => (
                      <option key={professional.id} value={String(professional.id)}>
                        {professional.name}
                      </option>
                    ))}
                    <option value="MANUAL">Profissional não cadastrado</option>
                  </select>
                  {!useManualProfessional && selectedProfessional ? (
                    <p className="text-sm text-muted consent-professional-hint">
                      {selectedProfessional.specialty || 'Profissional ativo no cadastro da clínica.'}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="form-group form-full">
                  <label className="form-label">Profissional responsável *</label>
                  <p className="text-sm text-muted consent-professional-hint">
                    {professionalsLoading
                      ? 'Carregando profissionais. Você tambem pode informar manualmente se precisar concluir agora.'
                      : professionalsLoadWarning || 'Nenhum profissional ativo cadastrado. Informe manualmente para concluir o termo.'}
                  </p>
                </div>
              )}

              {useManualProfessional || !professionals.length ? (
                <div className="form-group">
                  <label className="form-label">Nome do profissional *</label>
                  <input
                    className="form-input"
                    value={professionalName}
                    onChange={event => setProfessionalName(event.target.value)}
                    disabled={record.status !== 'PENDING'}
                    placeholder="Quem validou este termo"
                  />
                </div>
              ) : null}
            </div>

            {record.status === 'REVOKED' ? (
              <div className="consent-revoked-card">
                <div className="empty-icon">
                  <Icon name="clipboard" size={24} />
                </div>
                <h3>Termo revogado</h3>
                <p>
                  Este termo permanece arquivado para consulta, PDF e auditoria, mas não deve mais ser usado como autorização ativa.
                </p>
                <div className="detail-list consent-revoked-details">
                  <div className="detail-row">
                    <span>Assinado em</span>
                    <strong>{formatDateTime(record.signedAt)}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Revogado em</span>
                    <strong>{formatDateTime(record.updatedAt)}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Profissional responsável</span>
                    <strong>{resolvedProfessionalName}</strong>
                  </div>
                </div>
                <div className="consent-actions consent-actions-start">
                  <button type="button" className="btn btn-outline" onClick={() => navigate('/clientes/' + record.client.id)}>
                    Voltar ao prontuário
                  </button>
                  <button type="button" className="btn btn-outline" onClick={handleDownloadPdf} disabled={downloadingPdf}>
                    {downloadingPdf ? <span className="spinner" /> : <><Icon name="download" /> Baixar PDF</>}
                  </button>
                </div>
              </div>
            ) : record.status === 'SIGNED' ? (
              <div className="signature-preview-card">
                <div className="signature-preview-wrap">
                  <img src={record.signatureDataUrl || ''} alt="Assinatura do cliente" className="signature-preview" />
                </div>
                <div className="signature-meta">
                  <strong>Assinatura concluida</strong>
                  <span>Registro salvo em {formatDateTime(record.signedAt)}</span>
                  <span>Profissional responsável: {resolvedProfessionalName}</span>
                </div>
                <div className="consent-actions consent-actions-start">
                  <button type="button" className="btn btn-outline" onClick={() => navigate('/clientes')}>
                    Voltar para clientes
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={handleDownloadPdf}
                    disabled={downloadingPdf}
                  >
                    {downloadingPdf ? <span className="spinner" /> : <><Icon name="download" /> Baixar PDF</>}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline danger-ghost"
                    onClick={handleRevokeConsent}
                    disabled={revoking}
                  >
                    {revoking ? <span className="spinner" /> : <><Icon name="x" /> Revogar termo</>}
                  </button>
                  <button
                    type="button"
                    className="btn btn-gold"
                    onClick={() => navigate('/clientes/' + record.client.id + '/anamnese')}
                  >
                    <Icon name="clipboard" /> Abrir anamnese
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="signature-pad">
                  <canvas
                    ref={canvasRef}
                    width={CANVAS_WIDTH}
                    height={CANVAS_HEIGHT}
                    className="signature-canvas"
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerLeave={handlePointerUp}
                  />
                </div>

                <div className="signature-toolbar">
                  <span className="signature-note">
                    Assine no campo acima. O sistema salva a evidência no cadastro do cliente junto do profissional
                    responsável.
                  </span>
                  <button type="button" className="btn btn-outline" onClick={clearSignature}>
                    <Icon name="x" /> Limpar assinatura
                  </button>
                </div>

                <label className="consent-checkbox">
                  <input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} />
                  <span>
                    Confirmo que o termo foi lido, compreendido e aceito pelo cliente antes da assinatura.
                  </span>
                </label>

                <div className="consent-actions">
                  <button type="button" className="btn btn-outline" onClick={() => navigate('/clientes')}>
                    Fazer depois
                  </button>
                  <button type="button" className="btn btn-gold" onClick={handleSubmit} disabled={saving}>
                    {saving ? <span className="spinner" /> : <><Icon name="signature" /> Assinar e salvar</>}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>

        <aside className="consent-sidebar">
          <section className="card consent-side-card">
            <div className="eyebrow">Cliente vinculado</div>
            <h2 className="section-title">{record.client.name}</h2>
            <div className="detail-list">
              <div className="detail-row">
                <span>Telefone</span>
                <strong>{record.client.phone || 'Não informado'}</strong>
              </div>
              <div className="detail-row">
                <span>E-mail</span>
                <strong>{record.client.email || 'Não informado'}</strong>
              </div>
              <div className="detail-row">
                <span>CPF</span>
                <strong>{record.client.cpf || 'Não informado'}</strong>
              </div>
            </div>
          </section>

          <section className="card consent-side-card">
            <div className="eyebrow">Rastreabilidade</div>
            <div className="detail-list">
              <div className="detail-row">
                <span>Status atual</span>
                <strong>{statusMeta.label}</strong>
              </div>
              <div className="detail-row">
                <span>Gerado em</span>
                <strong>{formatDateTime(record.createdAt)}</strong>
              </div>
              <div className="detail-row">
                <span>Assinado em</span>
                <strong>{formatDateTime(record.signedAt)}</strong>
              </div>
              <div className="detail-row">
                <span>Profissional responsável</span>
                <strong>{resolvedProfessionalName}</strong>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}
