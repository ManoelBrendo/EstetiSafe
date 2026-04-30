import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { getApiErrorMessage } from './api'
import {
  downloadClientMedicalRecordPdf,
  generateClientImageConsentRecord,
  getClientMedicalRecord,
  getClientPayments,
  getClientProtocols,
} from './clientRecordsApi'
import { ClientAvatar } from './ClientAvatar'
import { Icon } from './Icon'
import {
  ANAMNESIS_ALCOHOL_FREQUENCY_OPTIONS,
  ANAMNESIS_FITZPATRICK_OPTIONS,
  ANAMNESIS_MARITAL_STATUS_OPTIONS,
  ANAMNESIS_SEX_OPTIONS,
  ANAMNESIS_SKIN_TYPE_OPTIONS,
  ANAMNESIS_SLEEP_QUALITY_OPTIONS,
  WORKOUTS_PER_WEEK_OPTIONS,
  formatBooleanAnswer,
  formatOptionLabel,
  getAnamnesisHistorySummary,
  normalizeAnamnesisRecord,
} from './anamnesis'
import type {
  AestheticCondition,
  AnamnesisRecordVersion,
  ClientRecord,
  ConsentRecordSummary,
  MedicalRecordBundle,
  PaymentsBundle,
  ProtocolsBundle,
} from './clinicalTypes'

interface ReadonlyFieldProps {
  label: string
  value: string | number | null | undefined
}

interface SummaryMetricProps {
  label: string
  value: string
  helper: string
}

interface SectionCardProps {
  id: string
  title: string
  description?: string
  className?: string
  children: ReactNode
}

interface CollapsibleSectionCardProps {
  id: string
  title: string
  description?: string
  summaryItems?: string[]
  defaultOpen?: boolean
  children: ReactNode
}

interface DetailGroupProps {
  title: string
  description?: string
  className?: string
  children: ReactNode
}

function formatDate(value: string | number | null | undefined) {
  if (!value) return 'Não informado'

  const normalizedValue = String(value).length <= 10
    ? String(value).slice(0, 10) + 'T12:00:00.000Z'
    : value
  const parsedDate = new Date(normalizedValue)

  if (Number.isNaN(parsedDate.getTime())) return 'Data inválida'

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
  }).format(parsedDate)
}

function formatDateTime(value: string | number | null | undefined) {
  if (!value) return 'Não informado'

  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.getTime())) return 'Data inválida'

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(parsedDate)
}

function formatReadableStatus(status: string | null | undefined) {
  if (!status) return 'Não informado'

  const labels: Record<string, string> = {
    ACTIVE: 'Ativo',
    CANCELLED: 'Cancelado',
    COMPLETED: 'Concluído',
    CONFIRMED: 'Confirmado',
    DRAFT: 'Rascunho',
    EDITABLE: 'Editável',
    PAID: 'Pago',
    PENDING: 'Pendente',
    REFUNDED: 'Reembolsado',
    REVOKED: 'Revogado',
    SCHEDULED: 'Agendado',
    SIGNED: 'Assinado',
  }

  const normalizedStatus = String(status).toUpperCase()
  return labels[normalizedStatus] || normalizedStatus.replace(/_/g, ' ').toLowerCase()
}

function formatConsentStatus(status: string | null | undefined) {
  if (!status) return 'Sem termo'
  return formatReadableStatus(status)
}

const IMAGE_CONSENT_TITLE_FRAGMENT = 'uso de imagem'

function isImageConsentRecord(record: ConsentRecordSummary | null | undefined) {
  const title = typeof record?.title === 'string' ? record.title : ''
  return title.toLowerCase().includes(IMAGE_CONSENT_TITLE_FRAGMENT)
}

function formatImageConsentHelper(record: ConsentRecordSummary | null, isLocked: boolean) {
  if (record?.status === 'SIGNED') return 'Termo formal assinado e vinculado ao prontuário.'
  if (record?.status === 'PENDING') return 'Termo gerado e aguardando assinatura da cliente.'
  if (record?.status === 'REVOKED') return 'Autorizacao revogada. Gere um novo termo antes de usar imagens.'
  if (isLocked) return 'Prontuário bloqueado: consulte registros existentes ou retorne ao suporte antes de gerar novo termo.'
  return 'Gere um termo separado para registrar a autorização formal de uso de imagem.'
}

function formatProtocolStatus(status: string | null | undefined) {
  return status ? formatReadableStatus(status) : 'Sem protocolo estruturado'
}

function formatPaymentStatus(status: string | null | undefined) {
  return formatReadableStatus(status)
}

function formatCurrency(value: number | string | null | undefined) {
  const parsedValue = Number(value || 0)

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number.isFinite(parsedValue) ? parsedValue : 0)
}

function buildSummaryItem(label: string, value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return ''
  return label + ': ' + value
}

function joinConditionSummaries(conditions: Array<Partial<AestheticCondition>> = []) {
  const visibleConditions = Array.isArray(conditions)
    ? conditions.filter(condition => condition.present)
    : []

  if (!visibleConditions.length) return ''

  return visibleConditions
    .map(condition => condition.classification ? `${condition.label} (${condition.classification})` : condition.label)
    .join(', ')
}

function ReadonlyField({ label, value }: ReadonlyFieldProps) {
  const hasValue = value !== null && value !== undefined && value !== ''

  return (
    <div className="prontuario-field">
      <span>{label}</span>
      <strong>{hasValue ? value : 'Não informado'}</strong>
    </div>
  )
}

function SummaryMetric({ label, value, helper }: SummaryMetricProps) {
  return (
    <article className="prontuario-summary-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{helper}</small>
    </article>
  )
}

function SectionCard({ id, title, description, className = '', children }: SectionCardProps) {
  return (
    <section id={id} className={['card section-card', className].filter(Boolean).join(' ')}>
      <div className="section-head">
        <div>
          <h2 className="section-title">{title}</h2>
          {description ? <p className="section-copy">{description}</p> : null}
        </div>
      </div>
      {children}
    </section>
  )
}

function CollapsibleSectionCard({ id, title, description, summaryItems = [], defaultOpen = false, children }: CollapsibleSectionCardProps) {
  const [open, setOpen] = useState(defaultOpen)
  const visibleSummary = summaryItems.filter(Boolean).slice(0, 3)

  return (
    <section id={id} className="card section-card prontuario-collapsible-card">
      <button type="button" className="prontuario-collapsible-summary" onClick={() => setOpen(current => !current)} aria-expanded={open}>
        <div className="prontuario-collapsible-copy">
          <h2 className="section-title">{title}</h2>
          {description ? <p className="section-copy">{description}</p> : null}
        </div>
        <div className="prontuario-collapsible-aside">
          {visibleSummary.length ? (
            <div className="prontuario-collapsible-pills">
              {visibleSummary.map(item => <span className="prontuario-pill" key={item}>{item}</span>)}
            </div>
          ) : null}
          <span className="prontuario-collapsible-indicator">{open ? 'Ocultar detalhes' : 'Expandir detalhes'}</span>
        </div>
      </button>

      {open ? <div className="prontuario-collapsible-body">{children}</div> : null}
    </section>
  )
}

function DetailGroup({ title, description, className = '', children }: DetailGroupProps) {
  return (
    <article className={['prontuario-detail-group', className].filter(Boolean).join(' ')}>
      <div className="prontuario-detail-group-head">
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
      </div>
      {children}
    </article>
  )
}

export default function ClienteProntuario() {
  const navigate = useNavigate()
  const { clientId } = useParams<{ clientId: string }>()
  const [loading, setLoading] = useState(true)
  const [client, setClient] = useState<ClientRecord | null>(null)
  const [medicalRecord, setMedicalRecord] = useState<MedicalRecordBundle | null>(null)
  const [protocolBundle, setProtocolBundle] = useState<ProtocolsBundle | null>(null)
  const [paymentsBundle, setPaymentsBundle] = useState<PaymentsBundle | null>(null)
  const [anamnesisHistory, setAnamnesisHistory] = useState<AnamnesisRecordVersion[]>([])
  const [generatingImageConsent, setGeneratingImageConsent] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)

    if (!clientId) {
      setLoading(false)
      navigate('/clientes', { replace: true })
      return
    }

    try {
      const [medicalRecordData, protocolData, paymentsData] = await Promise.all([
        getClientMedicalRecord(clientId),
        getClientProtocols(clientId),
        getClientPayments(clientId),
      ])

      setMedicalRecord(medicalRecordData)
      setClient(medicalRecordData.client)
      setAnamnesisHistory(medicalRecordData.anamnesisHistory)
      setProtocolBundle(protocolData)
      setPaymentsBundle(paymentsData)
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Não foi possível abrir o prontuário deste cliente'))
      navigate('/clientes', { replace: true })
    } finally {
      setLoading(false)
    }
  }, [clientId, navigate])

  useEffect(() => {
    load()
  }, [load])

  const latestAnamnesis = useMemo<AnamnesisRecordVersion | null>(
    () => (anamnesisHistory[0] ? normalizeAnamnesisRecord(anamnesisHistory[0], client || {}) : null),
    [anamnesisHistory, client]
  )

  const consentRecords = client?.consentRecords || []
  const imageConsentRecord = consentRecords.find(isImageConsentRecord)
    || (isImageConsentRecord(client?.latestConsentRecord) ? client?.latestConsentRecord || null : null)
  const latestConsent = consentRecords.find(record => !isImageConsentRecord(record))
    || (!isImageConsentRecord(client?.latestConsentRecord) ? client?.latestConsentRecord || null : null)
  const consentStatusLabel = formatConsentStatus(latestConsent?.status)
  const consentProfessionalName = latestConsent?.professionalName || ''
  const anamnesisProfessionalName = latestAnamnesis?.signatures?.professionalName || ''
  const photoCount = latestAnamnesis?.photoRecord?.photos?.length || 0
  const clinicalPhotoConsent = Boolean(latestAnamnesis?.photoRecord?.clinicalUseAuthorized || latestAnamnesis?.photoRecord?.imageUseAuthorized)
  const marketingPhotoConsent = Boolean(latestAnamnesis?.photoRecord?.marketingUseAuthorized || latestAnamnesis?.photoRecord?.imageUseAuthorized)
  const photoConsentAcknowledged = Boolean(latestAnamnesis?.photoRecord?.consentAwarenessConfirmed)
  const photoConsentAcceptedAt = latestAnamnesis?.photoRecord?.consentAcceptedAt || null
  const appointmentCount = medicalRecord?.appointments?.length || client?.appointments?.length || 0
  const isLocked = Boolean(medicalRecord?.accessState?.isLocked ?? client?.isLocked)
  const lockedAt = medicalRecord?.accessState?.lockedAt || client?.lockedAt || null
  const imageConsentStatusLabel = formatConsentStatus(imageConsentRecord?.status)
  const imageConsentButtonLabel = imageConsentRecord?.id
    ? imageConsentRecord.status === 'SIGNED'
      ? 'Ver termo assinado'
      : imageConsentRecord.status === 'REVOKED'
        ? 'Gerar novo termo'
        : 'Assinar termo de imagem'
    : 'Gerar termo de imagem'
  const imageConsentButtonDisabled = generatingImageConsent || ((!imageConsentRecord?.id || imageConsentRecord?.status === 'REVOKED') && isLocked)
  const imageConsentHelper = formatImageConsentHelper(imageConsentRecord || null, isLocked)
  const currentProtocol = protocolBundle?.current || null
  const protocolServices = currentProtocol?.services || []
  const paymentsSummary = paymentsBundle?.summary || {
    totalPayments: 0,
    paidCount: 0,
    pendingCount: 0,
    paidAmount: 0,
    pendingAmount: 0,
    unpaidAppointments: 0,
  }
  const recentPayments = paymentsBundle?.items || []
  const unpaidAppointments = paymentsBundle?.unpaidAppointments || []
  const timelineItems = medicalRecord?.timeline || []
  const securitySummary = medicalRecord?.security || null
  const photoSecurity = securitySummary?.photoConsent || null
  const auditTrailEnabled = securitySummary?.auditTrail?.enabled !== false
  const photoSecurityNeedsAttention = Boolean(photoSecurity?.needsAttention || (photoCount > 0 && (!clinicalPhotoConsent || !photoConsentAcknowledged || imageConsentRecord?.status !== 'SIGNED')))
  const photoSecurityMessage = photoSecurity?.message || (photoSecurityNeedsAttention
    ? 'Revise o consentimento antes de usar ou divulgar imagens deste prontuário.'
    : 'Sem alerta adicional de segurança para este prontuário.')

  async function handleDownloadPdf() {
    if (!client?.id) return

    try {
      await downloadClientMedicalRecordPdf(client.id, client.name)
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Não foi possível baixar o PDF do prontuário'))
    }
  }

  async function handleImageConsent() {
    if (!client?.id) return

    if (imageConsentRecord?.id && imageConsentRecord.status !== 'REVOKED') {
      navigate('/clientes/' + client.id + '/consentimentos/' + imageConsentRecord.id + '/assinar')
      return
    }

    setGeneratingImageConsent(true)

    try {
      const record = await generateClientImageConsentRecord(client.id, {
        clinicalUseAuthorized: clinicalPhotoConsent,
        marketingUseAuthorized: marketingPhotoConsent,
      })

      if (!record.id) {
        throw new Error('Termo gerado sem identificador')
      }

      toast.success('Termo de uso de imagem gerado para assinatura')
      navigate('/clientes/' + client.id + '/consentimentos/' + record.id + '/assinar')
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Não foi possível gerar o termo de uso de imagem'))
    } finally {
      setGeneratingImageConsent(false)
    }
  }

  const quickNavItems = [
    { id: 'cadastro', label: 'Cadastro' },
    { id: 'visao-clínica', label: 'Resumo clínico' },
    { id: 'seguranca-prontuario', label: 'Segurança' },
    ...(latestAnamnesis ? [
      { id: 'identificacao', label: 'Identificação' },
      { id: 'queixa-expectativas', label: 'Queixa e expectativas' },
      { id: 'historico-saude', label: 'Histórico de saúde' },
      { id: 'avaliação-estilo', label: 'Avaliação estética' },
      { id: 'conduta-plano', label: 'Plano e ciência' },
      { id: 'protocolo-financeiro', label: 'Protocolo e pagamentos' },
      { id: 'registro-fotografico', label: 'Fotos e assinaturas' },
    ] : []),
    { id: 'historico-versoes', label: 'Histórico' },
    { id: 'atendimentos', label: 'Atendimentos' },
  ]

  if (loading) {
    return (
      <div className="page">
        <div className="loading-page">
          <span className="spinner" />
          Abrindo o prontuário do cliente...
        </div>
      </div>
    )
  }

  if (!client) return null

  return (
    <div className="page prontuario-page">
      <div className="page-header">
        <div>
          <button type="button" className="btn btn-ghost consent-back" onClick={() => navigate('/clientes')}>
            <Icon name="back" /> Voltar para clientes
          </button>
          <h1 className="page-title">{client.name}</h1>
          <p className="page-subtitle">
            Resumo clínico, anamnese, assinatura e histórico organizados para uma leitura mais leve e uma tomada de decisão mais rápida.
          </p>
        </div>

        <div className="billing-actions prontuario-header-actions">
          <button type="button" className="btn btn-outline" onClick={handleDownloadPdf}>
            <Icon name="download" /> Baixar PDF
          </button>
          <button type="button" className="btn btn-outline" onClick={() => navigate('/clientes/' + client.id + '/anamnese')} disabled={isLocked}>
            <Icon name="clipboard" /> Editar anamnese
          </button>
          <button
            type="button"
            className="btn btn-gold"
            onClick={() => navigate('/clientes/' + client.id + '/consentimentos/' + (latestConsent?.id || '') + '/assinar')}
            disabled={!latestConsent?.id || isLocked}
          >
            <Icon name="signature" /> Abrir consentimento
          </button>
        </div>
      </div>

      {isLocked ? (
        <section className="card prontuario-lock-banner" aria-live="polite">
          <div>
            <strong>Prontuário bloqueado após confirmação de pagamento</strong>
            <p className="prontuario-lock-meta">
              As informações seguem disponíveis para consulta e download em PDF. Edições críticas ficam desabilitadas para preservar integridade, segurança jurídica e rastreabilidade.
            </p>
          </div>
          {lockedAt ? <span className="badge badge-red">Bloqueado em {formatDateTime(lockedAt)}</span> : null}
        </section>
      ) : null}

      <section className="card prontuario-summary-card">
        <div className="prontuario-summary-head">
          <div className="prontuario-client-identity">
            <ClientAvatar name={client.name} photoDataUrl={client.photoDataUrl} size="hero" />
            <div>
              <span className="eyebrow">Leitura rápida do prontuário</span>
              <h2 className="section-title">Panorama clínico do cliente</h2>
              <p className="section-copy">
                Cadastro, anamnese, termo e evidências organizados para consulta objetiva, sem excesso visual no topo da tela.
              </p>
            </div>
          </div>

          <div className="prontuario-summary-state">
            <span>Estado atual</span>
            <strong>{isLocked ? 'Consulta protegida' : 'Fluxo assistencial ativo'}</strong>
            <small>
              {isLocked
                ? 'A edição crítica está desabilitada, mas o histórico continua acessível para consulta e PDF.'
                : 'A clínica pode revisar cadastro, anamnese, consentimento e evidências em um fluxo único.'}
            </small>
          </div>
        </div>

        <div className="prontuario-summary-grid">
          <SummaryMetric
            label="Anamnese"
            value={latestAnamnesis ? 'Atualizada' : 'Pendente'}
            helper={latestAnamnesis?.filledAt ? formatDateTime(latestAnamnesis.filledAt) : 'Preencha a ficha clínica para iniciar o prontuário.'}
          />
          <SummaryMetric
            label="Consentimento"
            value={consentStatusLabel}
            helper={latestConsent?.signedAt ? formatDateTime(latestConsent.signedAt) : 'Sem assinatura registrada até o momento.'}
          />
          <SummaryMetric
            label="Fotos clínicas"
            value={String(photoCount)}
            helper={imageConsentRecord?.status === 'SIGNED' ? 'Termo formal de imagem assinado.' : photoCount ? (clinicalPhotoConsent && photoConsentAcknowledged ? 'Registros com aceite e confirmação vinculados.' : 'Registros exigem revisão de consentimento.') : 'Nenhuma evidência fotográfica anexada.'}
          />
          <SummaryMetric
            label="Atendimentos"
            value={String(appointmentCount)}
            helper={appointmentCount ? 'Procedimentos recentes vinculados a este cliente.' : 'Ainda sem procedimentos vinculados.'}
          />
        </div>

        <div id="seguranca-prontuario-status" className="prontuario-security-strip" aria-label="Camada de segurança do prontuário">
          <article className={['prontuario-security-item', auditTrailEnabled ? 'is-ok' : 'is-alert'].join(' ')}>
            <span>Auditoria</span>
            <strong>{auditTrailEnabled ? 'Acesso auditado' : 'Auditoria indisponível'}</strong>
            <small>{auditTrailEnabled ? 'Abertura, alteração sensível, tentativa bloqueada e PDF ficam registrados para rastreabilidade.' : 'Revise a configuração de auditoria antes de operar prontuários.'}</small>
          </article>
          <article className={['prontuario-security-item', isLocked ? 'is-locked' : 'is-ok'].join(' ')}>
            <span>Controle</span>
            <strong>{isLocked ? 'Somente consulta' : 'Edição controlada'}</strong>
            <small>{isLocked ? 'O prontuário está protegido contra alterações críticas.' : 'A anamnese pode ser atualizada enquanto o prontuário estiver liberado.'}</small>
          </article>
          <article className={['prontuario-security-item', photoSecurityNeedsAttention ? 'is-alert' : 'is-ok'].join(' ')}>
            <span>Imagem</span>
            <strong>{photoSecurityNeedsAttention ? 'Revisar consentimento' : 'Consentimento acompanhado'}</strong>
            <small>{photoSecurityMessage}</small>
          </article>
        </div>

        <div className="prontuario-summary-foot">
          <div className="prontuario-quick-nav-copy">
            <span className="eyebrow">Atalhos do prontuário</span>
            <p>Salte direto para o bloco clínico que precisa revisar agora e mantenha a leitura da página mais leve.</p>
          </div>

          <div className="prontuario-quick-nav">
            {quickNavItems.map(item => (
              <a key={item.id} className="btn btn-outline btn-sm prontuario-anchor-btn" href={'#' + item.id}>
                {item.label}
              </a>
            ))}
          </div>
        </div>
      </section>

      <div className="overview-grid">
        <SectionCard id="cadastro" className="prontuario-overview-card" title="Cadastro do cliente" description="Leitura rápida dos dados principais do prontuário.">
          <div className="prontuario-grid">
            <ReadonlyField label="Telefone" value={client.phone} />
            <ReadonlyField label="E-mail" value={client.email} />
            <ReadonlyField label="CPF" value={client.cpf} />
            <ReadonlyField label="Nascimento" value={client.birthDate ? formatDate(client.birthDate) : ''} />
            <ReadonlyField label="Profissão" value={client.profession} />
            <ReadonlyField label="Endereço" value={client.addressFull} />
          </div>
        </SectionCard>

        <SectionCard id="visao-clínica" className="prontuario-overview-card" title="Visão clínica" description="Resumo do status assistencial e da rastreabilidade mais recente.">
          <div className="prontuario-grid">
            <ReadonlyField label="Consentimento" value={consentStatusLabel} />
            <ReadonlyField label="Assinado em" value={latestConsent?.signedAt ? formatDateTime(latestConsent.signedAt) : ''} />
            <ReadonlyField label="Profissional no termo" value={consentProfessionalName} />
            <ReadonlyField label="Anamnese" value={latestAnamnesis ? 'Atualizada' : 'Pendente'} />
            <ReadonlyField label="Última anamnese" value={latestAnamnesis?.filledAt ? formatDateTime(latestAnamnesis.filledAt) : ''} />
            <ReadonlyField label="Profissional na anamnese" value={anamnesisProfessionalName} />
          </div>
        </SectionCard>

        <SectionCard id="seguranca-prontuario" className="prontuario-overview-card prontuario-security-overview" title="Segurança do prontuário" description="Resumo objetivo de bloqueio, consentimento e uso de imagem.">
          <div className="prontuario-grid">
            <ReadonlyField label="Edição do prontuário" value={isLocked ? 'Bloqueada' : 'Liberada'} />
            <ReadonlyField label="Uso clínico de imagem" value={formatBooleanAnswer(clinicalPhotoConsent)} />
            <ReadonlyField label="Confirmação de ciência" value={formatBooleanAnswer(photoConsentAcknowledged)} />
            <ReadonlyField label="Termo formal de imagem" value={imageConsentStatusLabel} />
            <ReadonlyField label="Fotos anexadas" value={String(photoCount)} />
            <ReadonlyField label="Último aceite" value={photoConsentAcceptedAt ? formatDateTime(photoConsentAcceptedAt) : ''} />
          </div>
        </SectionCard>
      </div>

      <div className="prontuario-layout">
        <div className="prontuario-stack">
          {!latestAnamnesis ? (
            <section className="card section-card">
              <div className="empty empty-tight">
                <div className="empty-icon">
                  <Icon name="clipboard" size={24} />
                </div>
                <h3>Nenhuma anamnese registrada</h3>
                <p>Abra o formulário de anamnese para preencher a nova estrutura clínica completa deste paciente.</p>
              </div>
            </section>
          ) : (
            <>
              <CollapsibleSectionCard
                id="identificacao"
                title="Identificação do paciente"
                description="Dados cadastrais usados na versão mais recente da anamnese."
                defaultOpen
                summaryItems={[
                  buildSummaryItem('Telefone', latestAnamnesis.identification.phone),
                  buildSummaryItem('CPF', latestAnamnesis.identification.cpf),
                  buildSummaryItem('Profissão', latestAnamnesis.identification.profession),
                ]}
              >
                <div className="prontuario-grid">
                  <ReadonlyField label="Nome completo" value={latestAnamnesis.identification.fullName} />
                  <ReadonlyField label="CPF" value={latestAnamnesis.identification.cpf} />
                  <ReadonlyField label="Data de nascimento" value={latestAnamnesis.identification.birthDate ? formatDate(latestAnamnesis.identification.birthDate) : ''} />
                  <ReadonlyField label="Idade" value={latestAnamnesis.identification.age} />
                  <ReadonlyField label="Sexo" value={formatOptionLabel(ANAMNESIS_SEX_OPTIONS, latestAnamnesis.identification.sex)} />
                  <ReadonlyField label="Estado civil" value={formatOptionLabel(ANAMNESIS_MARITAL_STATUS_OPTIONS, latestAnamnesis.identification.maritalStatus)} />
                  <ReadonlyField label="Profissão" value={latestAnamnesis.identification.profession} />
                  <ReadonlyField label="Telefone" value={latestAnamnesis.identification.phone} />
                  <ReadonlyField label="E-mail" value={latestAnamnesis.identification.email} />
                  <ReadonlyField label="Endereço completo" value={latestAnamnesis.identification.addressFull} />
                </div>
              </CollapsibleSectionCard>

              <CollapsibleSectionCard
                id="queixa-expectativas"
                title="Queixa principal e expectativas"
                description="Resumo da motivação do paciente e do alinhamento de expectativa."
                defaultOpen
                summaryItems={[
                  buildSummaryItem('Procedimento desejado', latestAnamnesis.chiefComplaint.desiredProcedure),
                  buildSummaryItem('Objetivo clínico', latestAnamnesis.treatmentObjective),
                  buildSummaryItem('Prazo esperado', latestAnamnesis.expectations.expectedResultTimeline),
                  buildSummaryItem('Limitações', formatBooleanAnswer(latestAnamnesis.expectations.awareOfLimitations)),
                ]}
              >
                <div className="prontuario-grid">
                  <ReadonlyField label="Procedimento desejado" value={latestAnamnesis.chiefComplaint.desiredProcedure} />
                  <ReadonlyField label="Queixa atual" value={latestAnamnesis.chiefComplaint.currentDiscomfort} />
                  <ReadonlyField label="Tempo de percepção" value={latestAnamnesis.chiefComplaint.complaintDuration} />
                  <ReadonlyField label="Tratamento anterior" value={latestAnamnesis.chiefComplaint.previousTreatment} />
                  <ReadonlyField label="Expectativa" value={latestAnamnesis.expectations.treatmentExpectations} />
                  <ReadonlyField label="Objetivo do tratamento" value={latestAnamnesis.treatmentObjective} />
                  <ReadonlyField label="Prazo esperado" value={latestAnamnesis.expectations.expectedResultTimeline} />
                  <ReadonlyField label="Ciente das limitações" value={formatBooleanAnswer(latestAnamnesis.expectations.awareOfLimitations)} />
                </div>
              </CollapsibleSectionCard>

              <CollapsibleSectionCard
                id="historico-saude"
                title="Histórico de saúde"
                description="Condições clínicas que impactam triagem, segurança e indicação."
                summaryItems={[
                  buildSummaryItem('Alergias', formatBooleanAnswer(latestAnamnesis.healthHistory.allergies.hasAllergies)),
                  buildSummaryItem('Cirurgias', formatBooleanAnswer(latestAnamnesis.healthHistory.surgeries.hadSurgeries)),
                  buildSummaryItem('Medicação contínua', formatBooleanAnswer(latestAnamnesis.healthHistory.medications.continuousMedication)),
                ]}
              >
                <div className="prontuario-detail-groups">
                  <DetailGroup
                    title="Condições clínicas de base"
                    description="Visão rápida das comorbidades e fatores sistêmicos que influenciam segurança e indicação."
                    className="prontuario-detail-group-emphasis"
                  >
                    <div className="prontuario-grid">
                      <ReadonlyField label="Hipertensão" value={formatBooleanAnswer(latestAnamnesis.healthHistory.preExistingConditions.hypertension)} />
                      <ReadonlyField label="Diabetes" value={formatBooleanAnswer(latestAnamnesis.healthHistory.preExistingConditions.diabetes)} />
                      <ReadonlyField label="Doenças cardíacas" value={formatBooleanAnswer(latestAnamnesis.healthHistory.preExistingConditions.heartDisease)} />
                      <ReadonlyField label="Doenças autoimunes" value={formatBooleanAnswer(latestAnamnesis.healthHistory.preExistingConditions.autoimmuneDisease)} />
                      <ReadonlyField label="Problemas hormonais" value={formatBooleanAnswer(latestAnamnesis.healthHistory.preExistingConditions.hormonalIssues)} />
                      <ReadonlyField label="Problemas renais" value={formatBooleanAnswer(latestAnamnesis.healthHistory.preExistingConditions.kidneyIssues)} />
                      <ReadonlyField label="Problemas hepáticos" value={formatBooleanAnswer(latestAnamnesis.healthHistory.preExistingConditions.liverIssues)} />
                      <ReadonlyField label="Outros achados" value={latestAnamnesis.healthHistory.preExistingConditions.otherConditions} />
                    </div>
                  </DetailGroup>

                  <DetailGroup
                    title="Cirurgias e intercorrências"
                    description="Organização do histórico cirúrgico para leitura mais objetiva durante a avaliação."
                  >
                    <div className="prontuario-grid">
                      <ReadonlyField label="Já realizou cirurgias" value={formatBooleanAnswer(latestAnamnesis.healthHistory.surgeries.hadSurgeries)} />
                      <ReadonlyField label="Quais cirurgias" value={latestAnamnesis.healthHistory.surgeries.surgeryDetails} />
                      <ReadonlyField label="Data aproximada" value={latestAnamnesis.healthHistory.surgeries.approximateDate} />
                      <ReadonlyField label="Houve complicações" value={formatBooleanAnswer(latestAnamnesis.healthHistory.surgeries.hadComplications)} />
                    </div>
                  </DetailGroup>

                  <DetailGroup
                    title="Medicações em uso"
                    description="Informações que ajudam a antecipar risco, sensibilidade e necessidade de adaptação do protocolo."
                  >
                    <div className="prontuario-grid">
                      <ReadonlyField label="Medicamento contínuo" value={formatBooleanAnswer(latestAnamnesis.healthHistory.medications.continuousMedication)} />
                      <ReadonlyField label="Quais medicamentos" value={latestAnamnesis.healthHistory.medications.medicationDetails} />
                      <ReadonlyField label="Anticoagulantes" value={formatBooleanAnswer(latestAnamnesis.healthHistory.medications.anticoagulants)} />
                      <ReadonlyField label="Corticoides" value={formatBooleanAnswer(latestAnamnesis.healthHistory.medications.corticosteroids)} />
                      <ReadonlyField label="Antibióticos recentes" value={formatBooleanAnswer(latestAnamnesis.healthHistory.medications.recentAntibiotics)} />
                    </div>
                  </DetailGroup>

                  <DetailGroup
                    title="Alergias e histórico dermatológico"
                    description="Sensibilidades e condições cutâneas reunidas no mesmo bloco para reduzir leitura fragmentada."
                  >
                    <div className="prontuario-grid">
                      <ReadonlyField label="Possui alergias" value={formatBooleanAnswer(latestAnamnesis.healthHistory.allergies.hasAllergies)} />
                      <ReadonlyField label="Descrição de alergias" value={latestAnamnesis.healthHistory.allergies.notes} />
                      <ReadonlyField label="Acne ativa" value={formatBooleanAnswer(latestAnamnesis.healthHistory.dermatologicalHistory.activeAcne)} />
                      <ReadonlyField label="Rosácea" value={formatBooleanAnswer(latestAnamnesis.healthHistory.dermatologicalHistory.rosacea)} />
                      <ReadonlyField label="Melasma" value={formatBooleanAnswer(latestAnamnesis.healthHistory.dermatologicalHistory.melasma)} />
                      <ReadonlyField label="Sensibilidade cutânea" value={formatBooleanAnswer(latestAnamnesis.healthHistory.dermatologicalHistory.skinSensitivity)} />
                      <ReadonlyField label="Tendência a queloide" value={formatBooleanAnswer(latestAnamnesis.healthHistory.dermatologicalHistory.keloidTendency)} />
                    </div>
                  </DetailGroup>
                </div>

                {latestAnamnesis.healthHistory.aestheticHistory?.length ? (
                  <DetailGroup
                    title="Histórico estético anterior"
                    description="Procedimentos prévios e observações clínicas relevantes para a nova conduta."
                    className="prontuario-detail-group-full"
                  >
                    <div className="anamnese-history-list prontuario-inline-list">
                      {latestAnamnesis.healthHistory.aestheticHistory.map(entry => (
                        <div className="anamnese-history-item" key={entry.id}>
                          <strong>{entry.procedureName || 'Histórico estético'}</strong>
                          <span>{entry.procedureDate || 'Data não informada'}</span>
                          <small>{entry.notes || entry.intercurrences || 'Sem observações complementares.'}</small>
                        </div>
                      ))}
                    </div>
                  </DetailGroup>
                ) : null}
              </CollapsibleSectionCard>

              <CollapsibleSectionCard
                id="avaliação-estilo"
                title="Avaliação estética e estilo de vida"
                description="Leitura consolidada do perfil do paciente e do contexto de tratamento."
                summaryItems={[
                  buildSummaryItem('Tipo de pele', formatOptionLabel(ANAMNESIS_SKIN_TYPE_OPTIONS, latestAnamnesis.aestheticEvaluation.skinType)),
                  buildSummaryItem('Fitzpatrick', formatOptionLabel(ANAMNESIS_FITZPATRICK_OPTIONS, latestAnamnesis.aestheticEvaluation.fitzpatrick)),
                  buildSummaryItem('Condições', joinConditionSummaries(latestAnamnesis.aestheticEvaluation.conditions)),
                  buildSummaryItem('Qualidade do sono', formatOptionLabel(ANAMNESIS_SLEEP_QUALITY_OPTIONS, latestAnamnesis.lifestyle.sleepQuality)),
                ]}
              >
                <div className="prontuario-detail-groups">
                  <DetailGroup
                    title="Perfil estético"
                    description="Base clínica de pele, fototipo e resumo dos achados observados."
                    className="prontuario-detail-group-emphasis"
                  >
                    <div className="prontuario-grid">
                      <ReadonlyField label="Tipo de pele" value={formatOptionLabel(ANAMNESIS_SKIN_TYPE_OPTIONS, latestAnamnesis.aestheticEvaluation.skinType)} />
                      <ReadonlyField label="Fitzpatrick" value={formatOptionLabel(ANAMNESIS_FITZPATRICK_OPTIONS, latestAnamnesis.aestheticEvaluation.fitzpatrick)} />
                      <ReadonlyField label="Condições observadas" value={joinConditionSummaries(latestAnamnesis.aestheticEvaluation.conditions)} />
                    </div>
                  </DetailGroup>

                  <DetailGroup
                    title="Hábitos de vida"
                    description="Contexto comportamental que interfere em resposta clínica, adesão e recuperação."
                  >
                    <div className="prontuario-grid">
                      <ReadonlyField label="Consome álcool" value={formatBooleanAnswer(latestAnamnesis.lifestyle.alcoholConsumption)} />
                      <ReadonlyField label="Frequência do álcool" value={formatOptionLabel(ANAMNESIS_ALCOHOL_FREQUENCY_OPTIONS, latestAnamnesis.lifestyle.alcoholFrequency)} />
                      <ReadonlyField label="Fuma" value={formatBooleanAnswer(latestAnamnesis.lifestyle.smoking)} />
                      <ReadonlyField label="Água diária" value={latestAnamnesis.lifestyle.dailyWaterIntake} />
                      <ReadonlyField label="Alimentação" value={latestAnamnesis.lifestyle.diet} />
                      <ReadonlyField label="Atividade física" value={formatBooleanAnswer(latestAnamnesis.lifestyle.physicalActivity)} />
                      <ReadonlyField label="Frequência por semana" value={formatOptionLabel(WORKOUTS_PER_WEEK_OPTIONS, String(latestAnamnesis.lifestyle.workoutsPerWeek || ''))} />
                      <ReadonlyField label="Qualidade do sono" value={formatOptionLabel(ANAMNESIS_SLEEP_QUALITY_OPTIONS, latestAnamnesis.lifestyle.sleepQuality)} />
                    </div>
                  </DetailGroup>
                </div>

                {latestAnamnesis.aestheticEvaluation.conditions?.length ? (
                  <DetailGroup
                    title="Condições classificadas"
                    description="Itens estruturados para acompanhamento evolutivo e comparação clínica."
                    className="prontuario-detail-group-full"
                  >
                    <div className="anamnese-history-list prontuario-inline-list">
                      {latestAnamnesis.aestheticEvaluation.conditions
                        .filter(condition => condition.present || condition.classification || condition.notes)
                        .map(condition => (
                          <div className="anamnese-history-item" key={condition.type}>
                            <strong>{condition.label}</strong>
                            <span>{condition.classification || (condition.present ? 'Observada' : 'Sem classificação')}</span>
                            <small>{condition.notes || 'Sem observações adicionais.'}</small>
                          </div>
                        ))}
                    </div>
                  </DetailGroup>
                ) : null}
              </CollapsibleSectionCard>

              <CollapsibleSectionCard
                id="conduta-plano"
                title="Contraindicações, plano e ciência"
                description="Elementos que sustentam conduta, segurança e aceite informado do paciente."
                summaryItems={[
                  buildSummaryItem('Procedimento indicado', latestAnamnesis.treatmentPlan.recommendedProcedure),
                  buildSummaryItem('Serviços do protocolo', latestAnamnesis.treatmentPlan.services?.length),
                  buildSummaryItem('Ciente dos riscos', formatBooleanAnswer(latestAnamnesis.scienceTerm.awareOfRisks)),
                ]}
              >
                <div className="prontuario-detail-groups">
                  <DetailGroup
                    title="Contraindicações"
                    description="Checklist de segurança para triagem e definição da conduta."
                  >
                    <div className="prontuario-grid">
                      <ReadonlyField label="Gravidez" value={formatBooleanAnswer(latestAnamnesis.contraindications.pregnancy)} />
                      <ReadonlyField label="Lactação" value={formatBooleanAnswer(latestAnamnesis.contraindications.lactation)} />
                      <ReadonlyField label="Infecções ativas" value={formatBooleanAnswer(latestAnamnesis.contraindications.activeInfections)} />
                      <ReadonlyField label="Uso recente de isotretinoína" value={formatBooleanAnswer(latestAnamnesis.contraindications.recentIsotretinoin)} />
                      <ReadonlyField label="Doenças dermatológicas ativas" value={formatBooleanAnswer(latestAnamnesis.contraindications.activeDermatologicalDiseases)} />
                      <ReadonlyField label="Implantes metálicos" value={formatBooleanAnswer(latestAnamnesis.contraindications.metallicImplants)} />
                      <ReadonlyField label="Observações adicionais" value={latestAnamnesis.contraindications.additionalNotes} />
                    </div>
                  </DetailGroup>

                  <DetailGroup
                    title="Plano terapêutico"
                    description="Estrutura do protocolo proposto, objetivo clínico e recursos previstos."
                    className="prontuario-detail-group-emphasis"
                  >
                    <div className="prontuario-grid">
                      <ReadonlyField label="Procedimento indicado" value={latestAnamnesis.treatmentPlan.recommendedProcedure} />
                      <ReadonlyField label="Número de sessões" value={latestAnamnesis.treatmentPlan.sessionCount} />
                      <ReadonlyField label="Intervalo entre sessões" value={latestAnamnesis.treatmentPlan.sessionInterval} />
                      <ReadonlyField label="Produtos utilizados" value={latestAnamnesis.treatmentPlan.productsUsed} />
                      <ReadonlyField label="Equipamentos utilizados" value={latestAnamnesis.treatmentPlan.equipmentsUsed} />
                      <ReadonlyField label="Objetivo do tratamento" value={latestAnamnesis.treatmentObjective} />
                    </div>
                  </DetailGroup>

                  <DetailGroup
                    title="Ciência do paciente"
                    description="Declarações de veracidade, ciência dos riscos e recebimento de orientações."
                  >
                    <div className="prontuario-grid">
                      <ReadonlyField label="Histórico informado corretamente" value={formatBooleanAnswer(latestAnamnesis.scienceTerm.informedHistoryAccurately)} />
                      <ReadonlyField label="Ciente dos riscos" value={formatBooleanAnswer(latestAnamnesis.scienceTerm.awareOfRisks)} />
                      <ReadonlyField label="Recebeu orientações pré/pós" value={formatBooleanAnswer(latestAnamnesis.scienceTerm.receivedPreAndPostGuidance)} />
                    </div>
                  </DetailGroup>
                </div>

                {latestAnamnesis.treatmentPlan.services?.length ? (
                  <DetailGroup
                    title="Serviços do protocolo"
                    description="Lista operacional dos serviços previstos com sessões e observações por item."
                    className="prontuario-detail-group-full"
                  >
                    <div className="anamnese-history-list prontuario-inline-list">
                      {latestAnamnesis.treatmentPlan.services.map(service => (
                        <div className="anamnese-history-item" key={service.id}>
                          <strong>{service.name || 'Serviço do protocolo'}</strong>
                          <span>{service.sessions} sessão(ões)</span>
                          <small>{service.description || service.adverseEffects || 'Sem detalhes adicionais.'}</small>
                        </div>
                      ))}
                    </div>
                  </DetailGroup>
                ) : null}
              </CollapsibleSectionCard>

              <CollapsibleSectionCard
                id="protocolo-financeiro"
                title="Protocolo e pagamentos"
                description="Visualize o protocolo atual, os serviços vinculados e a trilha financeira do atendimento sem sair do prontuário."
                summaryItems={[
                  buildSummaryItem('Protocolo', currentProtocol?.protocolName || currentProtocol?.recommendedProcedure),
                  buildSummaryItem('Status', formatProtocolStatus(currentProtocol?.status)),
                  buildSummaryItem('Pagamentos', String(paymentsSummary.totalPayments || 0)),
                  buildSummaryItem('Recebido', formatCurrency(paymentsSummary.paidAmount)),
                ]}
              >
                <div className="prontuario-detail-groups">
                  <DetailGroup
                    title="Protocolo vigente"
                    description="Camada operacional consolidada da API v2 para apoiar leitura clínica, revisão de conduta e continuidade do atendimento."
                    className="prontuario-detail-group-emphasis"
                  >
                    <div className="prontuario-grid">
                      <ReadonlyField label="Nome do protocolo" value={currentProtocol?.protocolName || currentProtocol?.recommendedProcedure || latestAnamnesis?.treatmentPlan?.recommendedProcedure} />
                      <ReadonlyField label="Status" value={formatProtocolStatus(currentProtocol?.status)} />
                      <ReadonlyField label="Objetivo do tratamento" value={currentProtocol?.treatmentObjective || latestAnamnesis?.treatmentObjective} />
                      <ReadonlyField label="Número de sessões" value={currentProtocol?.sessionCount || latestAnamnesis?.treatmentPlan?.sessionCount} />
                      <ReadonlyField label="Intervalo entre sessões" value={currentProtocol?.sessionInterval || latestAnamnesis?.treatmentPlan?.sessionInterval} />
                      <ReadonlyField label="Produtos utilizados" value={currentProtocol?.productsUsed || latestAnamnesis?.treatmentPlan?.productsUsed} />
                      <ReadonlyField label="Equipamentos utilizados" value={currentProtocol?.equipmentsUsed || latestAnamnesis?.treatmentPlan?.equipmentsUsed} />
                      <ReadonlyField label="Recomendações" value={currentProtocol?.recommendations} />
                      <ReadonlyField label="Orientações" value={currentProtocol?.guidelines} />
                      <ReadonlyField label="Observações" value={currentProtocol?.notes} />
                    </div>
                  </DetailGroup>

                  {protocolServices.length ? (
                    <DetailGroup
                      title="Serviços vinculados ao protocolo"
                      description="Itens estruturados na API v2 com sessões, efeitos adversos e contexto operacional por serviço."
                      className="prontuario-detail-group-full"
                    >
                      <div className="anamnese-history-list prontuario-inline-list">
                        {protocolServices.map(service => (
                          <div className="anamnese-history-item" key={service.id}>
                            <strong>{service.customServiceName || service.name || service.linkedService?.name || 'Serviço do protocolo'}</strong>
                            <span>
                              {service.sessions} sessão(ões)
                              {service.linkedService?.duration ? ' • ' + service.linkedService.duration + ' min' : ''}
                            </span>
                            <small>{service.description || service.adverseEffects || service.linkedService?.description || 'Sem observações complementares.'}</small>
                          </div>
                        ))}
                      </div>
                    </DetailGroup>
                  ) : null}

                  <DetailGroup
                    title="Resumo financeiro"
                    description="Pagamentos concluídos, pendências e visão rápida da receita já vinculada a este prontuário."
                  >
                    <div className="prontuario-grid">
                      <ReadonlyField label="Pagamentos registrados" value={String(paymentsSummary.totalPayments)} />
                      <ReadonlyField label="Pagamentos concluídos" value={String(paymentsSummary.paidCount)} />
                      <ReadonlyField label="Pagamentos pendentes" value={String(paymentsSummary.pendingCount)} />
                      <ReadonlyField label="Valor recebido" value={formatCurrency(paymentsSummary.paidAmount)} />
                      <ReadonlyField label="Valor pendente" value={formatCurrency(paymentsSummary.pendingAmount)} />
                      <ReadonlyField label="Atendimentos sem pagamento" value={String(paymentsSummary.unpaidAppointments)} />
                    </div>
                  </DetailGroup>

                  {recentPayments.length ? (
                    <DetailGroup
                      title="Pagamentos mais recentes"
                      description="Últimos lançamentos financeiros conectados aos atendimentos da cliente."
                      className="prontuario-detail-group-full"
                    >
                      <div className="anamnese-history-list prontuario-inline-list">
                        {recentPayments.map(payment => (
                          <div className="anamnese-history-item" key={payment.id}>
                            <strong>{formatCurrency(payment.amount)}</strong>
                            <span>{formatPaymentStatus(payment.status)} • {payment.method || 'Método não informado'}</span>
                            <small>
                              {(payment.appointment?.service?.name || 'Atendimento sem serviço vinculado')}
                              {payment.paidAt ? ' • ' + formatDateTime(payment.paidAt) : ''}
                            </small>
                          </div>
                        ))}
                      </div>
                    </DetailGroup>
                  ) : null}

                  {unpaidAppointments.length ? (
                    <DetailGroup
                      title="Atendimentos ainda sem baixa financeira"
                      description="Itens operacionais que continuam abertos no fluxo de pagamento."
                      className="prontuario-detail-group-full"
                    >
                      <div className="anamnese-history-list prontuario-inline-list">
                        {unpaidAppointments.map(appointment => (
                          <div className="anamnese-history-item" key={appointment.id}>
                            <strong>{appointment.service?.name || 'Serviço não informado'}</strong>
                            <span>{formatDateTime(appointment.startAt)}</span>
                            <small>
                              {appointment.professional?.name || 'Profissional não informado'}
                              {appointment.price ? ' • ' + formatCurrency(appointment.price) : ''}
                            </small>
                          </div>
                        ))}
                      </div>
                    </DetailGroup>
                  ) : null}
                </div>
              </CollapsibleSectionCard>

              <CollapsibleSectionCard
                id="registro-fotografico"
                title="Registro fotográfico e assinaturas"
                description="Evidências visuais e aceite capturado na versão mais recente do prontuário."
                defaultOpen
                summaryItems={[
                  buildSummaryItem('Fotos', String(photoCount)),
                  buildSummaryItem('Uso clínico autorizado', formatBooleanAnswer(clinicalPhotoConsent)),
                  buildSummaryItem('Marketing autorizado', formatBooleanAnswer(marketingPhotoConsent)),
                  buildSummaryItem('Confirmação de ciência', formatBooleanAnswer(photoConsentAcknowledged)),
                  buildSummaryItem('Profissional', anamnesisProfessionalName),
                ]}
              >
                <div className="prontuario-grid">
                  <ReadonlyField label="Uso clínico de imagem" value={formatBooleanAnswer(clinicalPhotoConsent)} />
                  <ReadonlyField label="Uso em marketing" value={formatBooleanAnswer(marketingPhotoConsent)} />
                  <ReadonlyField label="Termo formal de imagem" value={imageConsentStatusLabel} />
                  <ReadonlyField label="Confirmação de ciência" value={formatBooleanAnswer(photoConsentAcknowledged)} />
                  <ReadonlyField label="Aceite de imagem" value={photoConsentAcceptedAt ? formatDateTime(photoConsentAcceptedAt) : ''} />
                  <ReadonlyField label="Fotos anexadas" value={String(photoCount)} />
                  <ReadonlyField label="Data da assinatura" value={latestAnamnesis.signatures.signedAt ? formatDate(latestAnamnesis.signatures.signedAt) : ''} />
                  <ReadonlyField label="Profissional responsável" value={anamnesisProfessionalName} />
                </div>

                {photoCount && (!clinicalPhotoConsent || !photoConsentAcknowledged) ? (
                  <div className="prontuario-consent-alert">
                    Este prontuário possui fotos que precisam de revisão de consentimento. Antes de usar novas imagens, atualize a anamnese, registre o aceite clínico e confirme a ciência da autorização.
                  </div>
                ) : null}

                <div className="image-consent-card" aria-live="polite">
                  <div className="image-consent-copy">
                    <span className="eyebrow">Segurança jurídica de imagem</span>
                    <strong>Termo formal de uso de imagem</strong>
                    <p>{imageConsentHelper}</p>
                    {imageConsentRecord?.signedAt ? <small>Assinado em {formatDateTime(imageConsentRecord.signedAt)}</small> : null}
                  </div>

                  <div className="image-consent-actions">
                    <span className={imageConsentRecord?.status === 'SIGNED' ? 'badge badge-green' : imageConsentRecord?.status === 'PENDING' ? 'badge badge-gold' : 'badge badge-muted'}>
                      {imageConsentStatusLabel}
                    </span>
                    <button type="button" className="btn btn-outline" onClick={handleImageConsent} disabled={imageConsentButtonDisabled}>
                      {generatingImageConsent ? <span className="spinner" /> : <Icon name="signature" />}
                      {imageConsentButtonLabel}
                    </button>
                  </div>
                </div>

                {!photoCount ? null : (
                  <div className="anamnese-photo-grid">
                    {latestAnamnesis.photoRecord.photos.map(photo => (
                      <div className="anamnese-photo-card" key={photo.id}>
                        <div className="anamnese-photo-wrap">
                          <img src={photo.dataUrl} alt={photo.caption || 'Registro do prontuário'} className="anamnese-photo" />
                        </div>
                        <div className="text-sm text-muted">{photo.caption || 'Sem legenda clínica'}</div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="anamnesis-signature-grid">
                  <div className="signature-preview-card">
                    <div className="signature-preview-wrap">
                      {latestAnamnesis.signatures.patientSignatureDataUrl ? (
                        <img src={latestAnamnesis.signatures.patientSignatureDataUrl} alt="Assinatura do paciente" className="signature-preview" />
                      ) : null}
                    </div>
                    <div className="signature-meta">
                      <strong>Assinatura do paciente</strong>
                      <span>{latestAnamnesis.signatures.patientSignatureDataUrl ? 'Registrada' : 'Não informada'}</span>
                    </div>
                  </div>

                  <div className="signature-preview-card">
                    <div className="signature-preview-wrap">
                      {latestAnamnesis.signatures.professionalSignatureDataUrl ? (
                        <img src={latestAnamnesis.signatures.professionalSignatureDataUrl} alt="Assinatura do profissional" className="signature-preview" />
                      ) : null}
                    </div>
                    <div className="signature-meta">
                      <strong>Assinatura do profissional</strong>
                      <span>{latestAnamnesis.signatures.professionalSignatureDataUrl ? 'Registrada' : 'Não informada'}</span>
                      <span>{anamnesisProfessionalName || 'Profissional não informado'}</span>
                    </div>
                  </div>
                </div>
              </CollapsibleSectionCard>
            </>
          )}
        </div>

        <aside className="documents-side-stack prontuario-side-stack">
          <section id="historico-versoes" className="card documents-side-card prontuario-side-card">
            <div className="eyebrow">Histórico de anamnese</div>
            {!anamnesisHistory.length ? (
              <p className="text-muted">Ainda não há versões salvas.</p>
            ) : (
              <div className="anamnese-history-list">
                {anamnesisHistory.map(record => {
                  const normalized = normalizeAnamnesisRecord(record, client)

                  return (
                    <div className="anamnese-history-item" key={record.id}>
                      <strong>{formatDateTime(record.filledAt)}</strong>
                      <span>{getAnamnesisHistorySummary(normalized)}</span>
                      <small>{normalized.photoRecord.photos.length} foto(s) anexada(s)</small>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          <section id="atendimentos" className="card documents-side-card prontuario-side-card">
            <div className="eyebrow">Atendimentos recentes</div>
            {!client.appointments?.length ? (
              <p className="text-muted">Nenhum procedimento recente vinculado a este cliente.</p>
            ) : (
              <div className="anamnese-history-list">
                {client.appointments.map(appointment => (
                  <div className="anamnese-history-item" key={appointment.id}>
                    <strong>{appointment.service?.name || 'Serviço'}</strong>
                    <span>{formatDateTime(appointment.startAt)}</span>
                    <small>
                      {appointment.professional?.name || 'Profissional não informado'} • {appointment.status}
                    </small>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card documents-side-card prontuario-side-card">
            <div className="eyebrow">Linha do prontuário</div>
            {!timelineItems.length ? (
              <p className="text-muted">A linha do tempo será preenchida conforme novas versões, atendimentos e pagamentos forem sendo registrados.</p>
            ) : (
              <div className="anamnese-history-list">
                {timelineItems.slice(0, 10).map(item => (
                  <div className="anamnese-history-item" key={item.type + '-' + item.entityId + '-' + item.occurredAt}>
                    <strong>{item.label}</strong>
                    <span>{formatDateTime(item.occurredAt)}</span>
                    <small>{formatReadableStatus(item.status)}</small>
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  )
}
