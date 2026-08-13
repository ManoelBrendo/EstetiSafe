import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import api, { getApiErrorMessage } from './api'
import { generateClientImageConsentRecord, getClientMedicalRecord, saveClientAnamnesis } from './clientRecordsApi'
import { Icon } from './Icon'
import { useAuth } from './useAuth'
import { getClinicBranding } from './branding'
import { SignaturePad } from './SignaturePad'
import {
  ANAMNESIS_ALCOHOL_FREQUENCY_OPTIONS,
  ANAMNESIS_FITZPATRICK_OPTIONS,
  ANAMNESIS_MARITAL_STATUS_OPTIONS,
  ANAMNESIS_SEX_OPTIONS,
  ANAMNESIS_SKIN_TYPE_OPTIONS,
  ANAMNESIS_SLEEP_QUALITY_OPTIONS,
  DERMATOLOGICAL_HISTORY_FIELDS,
  PRE_EXISTING_CONDITION_FIELDS,
  WORKOUTS_PER_WEEK_OPTIONS,
  applyDateInputMask,
  calculateAgeFromBirthDate,
  createEmptyAestheticHistoryEntry,
  createEmptyAnamnesisForm,
  createEmptyTreatmentService,
  formatDateInputDisplay,
  getAestheticConditionMeta,
  getAnamnesisHistorySummary,
  normalizeAnamnesisRecord,
  parseDateInputDisplay,
  todayDateInput,
  updateFormValue,
} from './anamnesis'
import { ServiceModal } from './ServiceModal'
import { TreatmentServiceItem } from './TreatmentServiceItem'
import type {
  AestheticCondition,
  AestheticHistoryEntry,
  AnamnesisForm,
  AnamnesisRecordVersion,
  ClientRecord,
  ConsentRecordSummary,
  Identifier,
  TreatmentService,
} from './clinicalTypes'

const IMAGE_CONSENT_TITLE_FRAGMENT = 'uso de imagem'
const MAX_ANAMNESIS_PHOTO_SIZE_BYTES = 8 * 1024 * 1024
const ALLOWED_ANAMNESIS_PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const ALLOWED_ANAMNESIS_PHOTO_EXTENSION = /\.(jpe?g|png|webp)$/i

function isImageConsentRecord(record: ConsentRecordSummary | null | undefined) {
  const title = typeof record?.title === 'string' ? record.title : ''
  return title.toLowerCase().includes(IMAGE_CONSENT_TITLE_FRAGMENT)
}

interface ProfessionalSummary {
  id: Identifier
  name: string
  specialty?: string | null
  [key: string]: unknown
}

type FormPath = Array<string | number>
type PhotoFieldKey = 'caption' | 'dataUrl' | 'fileName'
type PhotoConsentField = 'clinicalUseAuthorized' | 'marketingUseAuthorized' | 'consentAwarenessConfirmed'

interface SectionCardProps {
  eyebrow?: string
  title: string
  description?: string
  children: ReactNode
  actions?: ReactNode
}

interface SubsectionCardProps {
  title: string
  description?: string
  children: ReactNode
  compact?: boolean
  actions?: ReactNode
  className?: string
}

interface ToggleFieldProps {
  label: string
  checked: boolean
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
}

interface DateFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  required?: boolean
  className?: string
}

interface AestheticConditionCardProps {
  condition: AestheticCondition
  onToggle: () => void
  onClassificationChange: (event: ChangeEvent<HTMLSelectElement>) => void
  onNotesChange: (event: ChangeEvent<HTMLTextAreaElement>) => void
}

interface AestheticHistoryEntryCardProps {
  entry: AestheticHistoryEntry
  onChange: (key: keyof AestheticHistoryEntry, value: string) => void
  onRemove: () => void
}

function formatDateTime(value: string | number | null | undefined) {
  if (!value) return 'Sem registro'

  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.getTime())) return 'Data inválida'

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(parsedDate)
}

function validatePhotoFile(file: File) {
  const hasAllowedType = ALLOWED_ANAMNESIS_PHOTO_TYPES.has(file.type.toLowerCase())
  const hasAllowedExtension = ALLOWED_ANAMNESIS_PHOTO_EXTENSION.test(file.name)

  if (!hasAllowedType && !hasAllowedExtension) {
    return `A foto "${file.name}" precisa estar em JPG, PNG ou WebP.`
  }

  if (file.size > MAX_ANAMNESIS_PHOTO_SIZE_BYTES) {
    return `A foto "${file.name}" tem mais de 8 MB. Envie uma imagem menor.`
  }

  return null
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem selecionada'))
    reader.readAsDataURL(file)
  })
}

async function compressImage(file: File): Promise<string> {
  const dataUrl = await readFileAsDataUrl(file)
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Não foi possível processar a imagem selecionada'))
    img.src = dataUrl
  })

  const maxDimension = 1400
  const ratio = Math.min(maxDimension / image.width, maxDimension / image.height, 1)
  const width = Math.max(1, Math.round(image.width * ratio))
  const height = Math.max(1, Math.round(image.height * ratio))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Não foi possível preparar a imagem selecionada')
  }

  context.fillStyle = '#fffaf4'
  context.fillRect(0, 0, width, height)
  context.drawImage(image, 0, 0, width, height)

  return canvas.toDataURL('image/webp', 0.80)
}

function SectionCard({ eyebrow, title, description, children, actions }: SectionCardProps) {
  return (
    <section className="card anamnesis-panel">
      <div className="section-head consent-panel-head">
        <div>
          {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
          <h2 className="section-title">{title}</h2>
          {description ? <p className="section-copy">{description}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}

function SubsectionCard({ title, description = '', children, compact = false, actions = null, className = '' }: SubsectionCardProps) {
  const classes = ['anamnesis-subsection-card', compact ? 'anamnesis-subsection-card-compact' : '', className]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes}>
      <div className="anamnesis-subsection-head">
        <h3 className="section-title section-title-sm">{title}</h3>
        {actions}
      </div>
      {description ? <p className="anamnesis-subsection-description">{description}</p> : null}
      <div className="form-grid">{children}</div>
    </div>
  )
}

function ToggleField({ label, checked, onChange }: ToggleFieldProps) {
  return (
    <label className={`checkbox-card ${checked ? 'checked' : ''}`}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span>{label}</span>
    </label>
  )
}

function DateField({ label, value, onChange, required = false, className = 'form-group' }: DateFieldProps) {
  const [displayValue, setDisplayValue] = useState(() => formatDateInputDisplay(value))

  useEffect(() => {
    setDisplayValue(formatDateInputDisplay(value))
  }, [value])

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const maskedValue = applyDateInputMask(event.target.value)
    setDisplayValue(maskedValue)

    if (!maskedValue) {
      onChange('')
      return
    }

    const parsedValue = parseDateInputDisplay(maskedValue)
    if (parsedValue) {
      onChange(parsedValue)
      return
    }

    if (maskedValue.length === 10) {
      onChange('')
    }
  }

  function handleBlur() {
    if (!displayValue) {
      onChange('')
      return
    }

    const parsedValue = parseDateInputDisplay(displayValue)
    if (parsedValue) {
      setDisplayValue(formatDateInputDisplay(parsedValue))
      onChange(parsedValue)
      return
    }

    onChange('')
  }

  return (
    <div className={className}>
      <label className="form-label">{label}{required ? ' *' : ''}</label>
      <input
        className="form-input"
        inputMode="numeric"
        autoComplete="off"
        placeholder="DD/MM/AAAA"
        value={displayValue}
        onChange={handleChange}
        onBlur={handleBlur}
      />
    </div>
  )
}

function AestheticConditionCard({ condition, onToggle, onClassificationChange, onNotesChange }: AestheticConditionCardProps) {
  const meta = getAestheticConditionMeta(condition.type)

  return (
    <article className={`aesthetic-condition-card ${condition.present ? 'is-active' : ''}`}>
      <div className="aesthetic-condition-head">
        <div>
          <span className="eyebrow">{meta.classificationLabel}</span>
          <h3 className="section-title section-title-sm">{condition.label || meta.label}</h3>
        </div>

        <button type="button" className={`switch-pill ${condition.present ? 'active' : ''}`} onClick={onToggle}>
          {condition.present ? 'Ativo' : 'Não observado'}
        </button>
      </div>

      <div className="form-grid">
        <div className="form-group">
          <label className="form-label">{meta.classificationLabel}</label>
          <select className="form-select" value={condition.classification || ''} onChange={onClassificationChange}>
            <option value="">Selecione</option>
            {meta.classificationOptions.map(option => <option key={option} value={option}>{option}</option>)}
          </select>
        </div>

        <div className="form-group form-full">
          <label className="form-label">Observações</label>
          <textarea
            className="form-textarea"
            rows={3}
            value={condition.notes || ''}
            onChange={onNotesChange}
            placeholder="Descreva localização, padrão clínico, intensidade percebida ou pontos importantes."
          />
        </div>
      </div>
    </article>
  )
}

function AestheticHistoryEntryCard({ entry, onChange, onRemove }: AestheticHistoryEntryCardProps) {
  return (
    <div className="anamnesis-inline-card">
      <div className="anamnesis-subsection-head">
        <h4 className="section-title section-title-sm">{entry.procedureName || 'Novo histórico estético'}</h4>
        <button type="button" className="btn btn-ghost btn-sm danger-ghost" onClick={onRemove}>
          <Icon name="trash" /> Remover
        </button>
      </div>

      <div className="form-grid">
        <div className="form-group">
          <label className="form-label">Procedimento realizado</label>
          <input
            className="form-input"
            value={entry.procedureName}
            onChange={event => onChange('procedureName', event.target.value)}
            placeholder="Ex: Peeling químico, microagulhamento, laser."
          />
        </div>

        <div className="form-group">
          <label className="form-label">Data do procedimento</label>
          <input
            className="form-input"
            value={entry.procedureDate}
            onChange={event => onChange('procedureDate', event.target.value)}
            placeholder="Opcional"
          />
        </div>

        <div className="form-group form-full">
          <label className="form-label">Observações</label>
          <textarea
            className="form-textarea"
            rows={3}
            value={entry.notes}
            onChange={event => onChange('notes', event.target.value)}
            placeholder="Conduta adotada, resposta percebida, resultados anteriores ou contexto relevante."
          />
        </div>

        <div className="form-group form-full">
          <label className="form-label">Intercorrências anteriores</label>
          <textarea
            className="form-textarea"
            rows={3}
            value={entry.intercurrences}
            onChange={event => onChange('intercurrences', event.target.value)}
            placeholder="Ex: sensibilidade intensa, edema prolongado, hiperpigmentação, nenhuma intercorrência."
          />
        </div>
      </div>
    </div>
  )
}

export default function ClienteAnamnese() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { clientId } = useParams<{ clientId: string }>()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [generatingImageConsent, setGeneratingImageConsent] = useState(false)
  const [client, setClient] = useState<ClientRecord | null>(null)
  const [history, setHistory] = useState<AnamnesisRecordVersion[]>([])
  const [professionals, setProfessionals] = useState<ProfessionalSummary[]>([])
  const [useManualProfessional, setUseManualProfessional] = useState(false)
  const [activeServiceId, setActiveServiceId] = useState<string | null>(null)
  const [form, setForm] = useState<AnamnesisForm>(createEmptyAnamnesisForm())
  const { clinicName, brandLogo } = getClinicBranding(user)

  const load = useCallback(async () => {
    setLoading(true)

    if (!clientId) {
      setLoading(false)
      navigate('/clientes', { replace: true })
      return
    }

    try {
      const [medicalRecord, { data: professionalsData }] = await Promise.all([
        getClientMedicalRecord(clientId),
        api.get<ProfessionalSummary[]>('/professionals'),
      ])

      const clientData = medicalRecord.client
      const historyData = medicalRecord.anamnesisHistory || []
      const latestBase = historyData[0]
        ? normalizeAnamnesisRecord(historyData[0], clientData)
        : createEmptyAnamnesisForm(clientData)
      const matchedProfessional = professionalsData.find(item => String(item.id) === String(latestBase.signatures.professionalId || '')) || null
      const latest = {
        ...latestBase,
        signatures: {
          ...latestBase.signatures,
          professionalId: matchedProfessional ? matchedProfessional.id : null,
          professionalName: matchedProfessional ? matchedProfessional.name : (latestBase.signatures.professionalName || ''),
          signedAt: latestBase.signatures.signedAt || todayDateInput(),
        },
      }

      setClient(clientData)
      setHistory(historyData)
      setProfessionals(professionalsData)
      setUseManualProfessional(!professionalsData.length || Boolean(latest.signatures.professionalName && !matchedProfessional))
      setForm(latest)
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Não foi possível abrir a anamnese do cliente'))
      navigate('/clientes', { replace: true })
    } finally {
      setLoading(false)
    }
  }, [clientId, navigate])

  useEffect(() => {
    load()
  }, [load])

  const latestRecord = useMemo<AnamnesisRecordVersion | null>(
    () => (history[0] ? normalizeAnamnesisRecord(history[0], client || {}) : null),
    [client, history]
  )

  const requiredChecklist = useMemo(() => {
    const cpfDigits = (form.identification.cpf || '').replace(/\D/g, '')
    const hasProfessionalResponsible = Boolean(form.signatures.professionalId) || Boolean(form.signatures.professionalName.trim())

    return [
      { label: 'Nome completo', complete: Boolean(form.identification.fullName.trim()) },
      { label: 'CPF', complete: cpfDigits.length === 11 },
      { label: 'Data de nascimento', complete: Boolean(form.identification.birthDate) },
      { label: 'Telefone', complete: Boolean(form.identification.phone.trim()) },
      { label: 'Queixa principal', complete: Boolean(form.chiefComplaint.currentDiscomfort.trim()) },
      { label: 'Profissional responsável', complete: hasProfessionalResponsible },
      { label: 'Assinatura do paciente', complete: Boolean(form.signatures.patientSignatureDataUrl) },
      { label: 'Assinatura do profissional', complete: Boolean(form.signatures.professionalSignatureDataUrl) },
      { label: 'Data', complete: Boolean(form.signatures.signedAt) },
    ]
  }, [form])

  const completedRequiredFields = requiredChecklist.filter(item => item.complete).length
  const selectedProfessional = professionals.find(item => String(item.id) === String(form.signatures.professionalId || '')) || null
  const activeService = form.treatmentPlan.services.find(service => service.id === activeServiceId) || null
  const isLocked = Boolean(client?.isLocked)
  const lockedAt = client?.lockedAt || null
  const clinicalPhotoConsent = Boolean(form.photoRecord.clinicalUseAuthorized || form.photoRecord.imageUseAuthorized)
  const marketingPhotoConsent = Boolean(form.photoRecord.marketingUseAuthorized || form.photoRecord.imageUseAuthorized)
  const imageConsentRecord = (client?.consentRecords || []).find(isImageConsentRecord) || null
  const imageConsentStatusLabel = imageConsentRecord?.status === 'SIGNED' ? 'Termo assinado' : imageConsentRecord?.status === 'PENDING' ? 'Aguardando assinatura' : imageConsentRecord?.status === 'REVOKED' ? 'Termo revogado' : 'Sem termo formal'
  const imageConsentButtonLabel = imageConsentRecord?.id ? (imageConsentRecord.status === 'SIGNED' ? 'Ver termo de imagem' : imageConsentRecord.status === 'REVOKED' ? 'Gerar novo termo' : 'Assinar termo de imagem') : 'Gerar termo de imagem'
  const imageConsentButtonDisabled = generatingImageConsent || ((!imageConsentRecord?.id || imageConsentRecord.status === 'REVOKED') && (isLocked || !clinicalPhotoConsent))
  const photoConsentConfirmed = Boolean(form.photoRecord.consentAwarenessConfirmed)
  const photoUploadReady = clinicalPhotoConsent && photoConsentConfirmed
  const photoUploadDisabled = isLocked || uploading || !photoUploadReady

  function setTextField(path: FormPath) {
    return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      if (isLocked) return
      setForm(current => updateFormValue(current, path, event.target.value))
    }
  }

  function setDateField(path: FormPath) {
    return (value: string) => {
      if (isLocked) return
      setForm(current => updateFormValue(current, path, value))
    }
  }

  function setCheckboxField(path: FormPath) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      if (isLocked) return
      setForm(current => updateFormValue(current, path, event.target.checked))
    }
  }

  function setPhotoConsentField(field: PhotoConsentField) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      if (isLocked) return

      const checked = event.target.checked
      setForm(current => {
        const nextPhotoRecord: AnamnesisForm['photoRecord'] = {
          ...current.photoRecord,
          [field]: checked,
        }

        if (field === 'clinicalUseAuthorized') {
          nextPhotoRecord.consentAcceptedAt = checked
            ? (current.photoRecord.consentAcceptedAt || new Date().toISOString())
            : null

          if (!checked) {
            nextPhotoRecord.marketingUseAuthorized = false
            nextPhotoRecord.imageUseAuthorized = false
            nextPhotoRecord.consentAwarenessConfirmed = false
          }
        }

        if (field === 'marketingUseAuthorized') {
          nextPhotoRecord.imageUseAuthorized = checked

          if (checked && !nextPhotoRecord.clinicalUseAuthorized) {
            nextPhotoRecord.clinicalUseAuthorized = true
            nextPhotoRecord.consentAcceptedAt = current.photoRecord.consentAcceptedAt || new Date().toISOString()
          }
        }

        if (field === 'consentAwarenessConfirmed') {
          if (checked && !nextPhotoRecord.clinicalUseAuthorized) {
            nextPhotoRecord.clinicalUseAuthorized = true
            nextPhotoRecord.consentAcceptedAt = current.photoRecord.consentAcceptedAt || new Date().toISOString()
          }

          nextPhotoRecord.consentAwarenessConfirmed = checked
        }

        return {
          ...current,
          photoRecord: nextPhotoRecord,
        }
      })
    }
  }

  function setSignatureField(path: FormPath, value: string) {
    if (isLocked) return
    setForm(current => updateFormValue(current, path, value))
  }

  async function handleImageConsentTerm() {
    if (!client?.id) return

    if (imageConsentRecord?.id && imageConsentRecord.status !== 'REVOKED') {
      navigate('/clientes/' + client.id + '/consentimentos/' + imageConsentRecord.id + '/assinar')
      return
    }

    if (!clinicalPhotoConsent) {
      toast.error('Marque o aceite clínico de imagem antes de gerar o termo formal')
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
  function handleProfessionalSelect(event: ChangeEvent<HTMLSelectElement>) {
    if (isLocked) return

    const value = event.target.value

    if (value === 'MANUAL') {
      setUseManualProfessional(true)
      setForm(current => {
        const next = updateFormValue(current, ['signatures', 'professionalId'], null)
        return updateFormValue(next, ['signatures', 'professionalName'], '')
      })
      return
    }

    const nextProfessional = professionals.find(item => String(item.id) === String(value)) || null
    setUseManualProfessional(false)
    setForm(current => {
      const next = updateFormValue(current, ['signatures', 'professionalId'], nextProfessional ? nextProfessional.id : null)
      return updateFormValue(next, ['signatures', 'professionalName'], nextProfessional ? nextProfessional.name : '')
    })
  }

  function handleManualProfessionalName(event: ChangeEvent<HTMLInputElement>) {
    if (isLocked) return

    const nextValue = event.target.value
    setUseManualProfessional(true)
    setForm(current => {
      const next = updateFormValue(current, ['signatures', 'professionalId'], null)
      return updateFormValue(next, ['signatures', 'professionalName'], nextValue)
    })
  }

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || [])
    event.target.value = ''

    if (isLocked) return
    if (!files.length) return
    if (!clinicalPhotoConsent) {
      toast.error('Registre o consentimento clínico antes de anexar fotos ao prontuário')
      return
    }
    if (!photoConsentConfirmed) {
      toast.error('Confirme que a autorização de imagem foi explicada e registrada antes de anexar fotos')
      return
    }
    if ((form.photoRecord.photos?.length || 0) + files.length > 8) {
      toast.error('Adicione no máximo 8 fotos por anamnese')
      return
    }

    const invalidFileMessage = files.reduce<string | null>((message, file) => message || validatePhotoFile(file), null)
    if (invalidFileMessage) {
      toast.error(invalidFileMessage)
      return
    }

    setUploading(true)

    try {
      const newPhotos = await Promise.all(files.map(async file => ({
        id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        caption: '',
        fileName: file.name,
        dataUrl: await compressImage(file),
      })))

      setForm(current => ({
        ...current,
        photoRecord: {
          ...current.photoRecord,
          photos: [...(current.photoRecord.photos || []), ...newPhotos],
        },
      }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível preparar as fotos da anamnese')
    } finally {
      setUploading(false)
    }
  }

  function updatePhoto(id: string, key: PhotoFieldKey, value: string) {
    if (isLocked) return

    setForm(current => ({
      ...current,
      photoRecord: {
        ...current.photoRecord,
        photos: current.photoRecord.photos.map(photo => (photo.id === id ? { ...photo, [key]: value } : photo)),
      },
    }))
  }

  function removePhoto(id: string) {
    if (isLocked) return

    setForm(current => ({
      ...current,
      photoRecord: {
        ...current.photoRecord,
        photos: current.photoRecord.photos.filter(photo => photo.id !== id),
      },
    }))
  }

  function updateAestheticHistoryEntry(id: string, key: keyof AestheticHistoryEntry, value: string) {
    if (isLocked) return

    setForm(current => ({
      ...current,
      healthHistory: {
        ...current.healthHistory,
        aestheticHistory: current.healthHistory.aestheticHistory.map(entry => (
          entry.id === id ? { ...entry, [key]: value } : entry
        )),
      },
    }))
  }

  function addAestheticHistoryEntry() {
    if (isLocked) return

    setForm(current => ({
      ...current,
      healthHistory: {
        ...current.healthHistory,
        aestheticHistory: [...current.healthHistory.aestheticHistory, createEmptyAestheticHistoryEntry()],
      },
    }))
  }

  function removeAestheticHistoryEntry(id: string) {
    if (isLocked) return

    setForm(current => ({
      ...current,
      healthHistory: {
        ...current.healthHistory,
        aestheticHistory: current.healthHistory.aestheticHistory.filter(entry => entry.id !== id),
      },
    }))
  }

  function updateAestheticCondition(type: string, patch: Partial<AestheticCondition>) {
    if (isLocked) return

    setForm(current => ({
      ...current,
      aestheticEvaluation: {
        ...current.aestheticEvaluation,
        conditions: current.aestheticEvaluation.conditions.map(condition => (
          condition.type === type ? { ...condition, ...patch } : condition
        )),
      },
    }))
  }

  function addTreatmentService() {
    if (isLocked) return

    const nextService = createEmptyTreatmentService()

    setForm(current => ({
      ...current,
      treatmentPlan: {
        ...current.treatmentPlan,
        services: [...current.treatmentPlan.services, nextService],
      },
    }))
    setActiveServiceId(nextService.id)
  }

  function openServiceModal(service: TreatmentService) {
    if (isLocked) return
    setActiveServiceId(service.id)
  }

  function closeServiceModal() {
    setActiveServiceId(null)
  }

  function saveServiceModal(updatedService: TreatmentService) {
    if (isLocked) return

    setForm(current => ({
      ...current,
      treatmentPlan: {
        ...current.treatmentPlan,
        services: current.treatmentPlan.services.map(service => (
          service.id === updatedService.id
            ? createEmptyTreatmentService({ ...service, ...updatedService })
            : service
        )),
      },
    }))
    setActiveServiceId(null)
  }

  function removeTreatmentService(id: string) {
    if (isLocked) return

    setForm(current => ({
      ...current,
      treatmentPlan: {
        ...current.treatmentPlan,
        services: current.treatmentPlan.services.filter(service => service.id !== id),
      },
    }))

    if (activeServiceId === id) {
      setActiveServiceId(null)
    }
  }

  async function handleSave() {
    if (!clientId) {
      toast.error('Não foi possível identificar o cliente da anamnese')
      return
    }

    if (isLocked) {
      toast.error('Prontuário bloqueado após confirmação de pagamento')
      return
    }

    const cpfDigits = (form.identification.cpf || '').replace(/\D/g, '')

    if (!form.identification.fullName.trim()) {
      toast.error('Informe o nome completo do paciente')
      return
    }

    if (cpfDigits.length !== 11) {
      toast.error('Informe um CPF válido para o paciente')
      return
    }

    if (!form.identification.birthDate) {
      toast.error('Informe a data de nascimento do paciente')
      return
    }

    if (!form.identification.phone.trim()) {
      toast.error('Informe o telefone do paciente')
      return
    }

    if (!form.chiefComplaint.currentDiscomfort.trim()) {
      toast.error('Preencha a queixa principal do paciente')
      return
    }

    const invalidService = form.treatmentPlan.services.find(service => (
      !service.name.trim()
      || Number(service.sessions) < 1
      || !service.adverseEffects.trim()
    ))

    if (invalidService) {
      toast.error('Revise os serviços do protocolo. Cada item precisa de nome, sessões e efeitos adversos.')
      setActiveServiceId(invalidService.id)
      return
    }

    const professionalResponsibleName = useManualProfessional
      ? form.signatures.professionalName.trim()
      : (selectedProfessional?.name || '')

    if (!form.signatures.patientSignatureDataUrl || !form.signatures.professionalSignatureDataUrl) {
      toast.error('As assinaturas do paciente e do profissional são obrigatórias')
      return
    }

    if (!selectedProfessional && !professionalResponsibleName) {
      toast.error('Selecione ou informe o profissional responsável')
      return
    }

    if (!form.signatures.signedAt) {
      toast.error('Informe a data da assinatura')
      return
    }

    if ((form.photoRecord.photos?.length || 0) > 0 && !clinicalPhotoConsent) {
      toast.error('As fotos do prontuário precisam do aceite de uso clínico de imagem')
      return
    }

    if ((form.photoRecord.photos?.length || 0) > 0 && !photoConsentConfirmed) {
      toast.error('Confirme a ciência da autorização de imagem antes de salvar fotos no prontuário')
      return
    }

    setSaving(true)

    try {
      await saveClientAnamnesis(clientId, form)
      toast.success('Nova versão da anamnese salva com sucesso')
      await load()
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Não foi possível salvar a anamnese'))
    } finally {
      setSaving(false)
    }
  }

  const activeClinicalAlerts: string[] = []
  if (form) {
    if (form.contraindications?.pregnancy) activeClinicalAlerts.push('Gravidez ativa')
    if (form.healthHistory?.medications?.anticoagulants) activeClinicalAlerts.push('Uso de anticoagulantes')
    if (form.healthHistory?.allergies?.medicationAllergy) activeClinicalAlerts.push('Alergia a medicamentos')
    if (form.healthHistory?.allergies?.cosmeticsAllergy) activeClinicalAlerts.push('Alergia a cosméticos')
    if (form.healthHistory?.allergies?.anestheticsAllergy) activeClinicalAlerts.push('Alergia a anestésicos')
  }

  if (loading) {
    return (
      <div className="page">
        <div className="loading-page">
          <span className="spinner" />
          Preparando a anamnese do cliente...
        </div>
      </div>
    )
  }

  if (!client) return null

  return (
    <div className="page anamnesis-page">
      <div className="page-header consent-page-header">
        <div>
          <button type="button" className="btn btn-ghost consent-back" onClick={() => navigate(`/clientes/${clientId}`)}>
            <Icon name="back" /> Voltar para prontuário
          </button>
          <h1 className="page-title">Anamnese completa do paciente</h1>
          <p className="page-subtitle">
            Estrutura clínica detalhada, organizada por seções e pronta para acompanhamento profissional de {client.name}.
          </p>
        </div>

        <button type="button" className="btn btn-gold" onClick={handleSave} disabled={saving || uploading || isLocked}>
          {saving ? <span className="spinner" /> : <><Icon name="clipboard" /> Salvar nova versão</>}
        </button>
      </div>

      {activeClinicalAlerts.length > 0 && (
        <section
          className="card"
          style={{
            borderLeft: '4px solid var(--danger)',
            background: 'rgba(239, 68, 68, 0.04)',
            padding: '16px 20px',
            marginBottom: '20px',
            boxShadow: '0 4px 12px rgba(239, 68, 68, 0.05)',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            borderRadius: '8px'
          }}
        >
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', width: '38px', height: '38px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="shield" size={20} />
          </div>
          <div>
            <strong style={{ color: 'var(--ink)', fontSize: '14px', display: 'block', marginBottom: '4px' }}>
              🚨 ALERTA CLÍNICO: Risco ou Contraindicação Selecionada
            </strong>
            <p className="section-copy" style={{ fontSize: '13px', margin: '0 0 10px 0', color: 'var(--ink-light)' }}>
              Esta versão da anamnese contém condições clínicas de risco indicadas abaixo. Certifique-se de que os procedimentos planejados estão de acordo com essas restrições:
            </p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {activeClinicalAlerts.map(alert => (
                <span key={alert} className="badge badge-red" style={{ fontWeight: '700', textTransform: 'uppercase', fontSize: '10px' }}>
                  {alert}
                </span>
              ))}
            </div>
          </div>
        </section>
      )}

      {isLocked ? (
        <section className="card prontuario-lock-banner" aria-live="polite">
          <div>
            <strong>Prontuário bloqueado após confirmação de pagamento</strong>
            <p className="prontuario-lock-meta">
              A anamnese permanece visível para consulta, mas novas edições ficam desabilitadas para preservar rastreabilidade e integridade do prontuário.
            </p>
          </div>
          {lockedAt ? <span className="badge badge-red">Bloqueado em {formatDateTime(lockedAt)}</span> : null}
        </section>
      ) : null}

      <fieldset className="form-fieldset-reset" disabled={isLocked}>
      <div className="anamnesis-layout">
        <div className="anamnesis-main anamnesis-section-stack">
          <SectionCard
            eyebrow="1. Identificação"
            title="Identificação do paciente"
            description="Esses dados alimentam o prontuário e ajudam a manter a ficha principal da clínica sempre coerente."
            actions={(
              <span className={latestRecord ? 'badge badge-green' : 'badge badge-muted'}>
                {latestRecord ? 'Nova versão sobre a base atual' : 'Primeira versão'}
              </span>
            )}
          >
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Nome completo *</label>
                <input className="form-input" value={form.identification.fullName} onChange={setTextField(['identification', 'fullName'])} />
              </div>
              <div className="form-group">
                <label className="form-label">CPF *</label>
                <input className="form-input" value={form.identification.cpf} onChange={setTextField(['identification', 'cpf'])} placeholder="000.000.000-00" />
              </div>
              <DateField
                label="Data de nascimento"
                required
                value={form.identification.birthDate}
                onChange={setDateField(['identification', 'birthDate'])}
              />
              <div className="form-group">
                <label className="form-label">Idade</label>
                <input className="form-input" value={form.identification.age || calculateAgeFromBirthDate(form.identification.birthDate)} readOnly />
              </div>
              <div className="form-group">
                <label className="form-label">Sexo</label>
                <select className="form-select" value={form.identification.sex} onChange={setTextField(['identification', 'sex'])}>
                  <option value="">Selecione</option>
                  {ANAMNESIS_SEX_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Estado civil</label>
                <select className="form-select" value={form.identification.maritalStatus} onChange={setTextField(['identification', 'maritalStatus'])}>
                  <option value="">Selecione</option>
                  {ANAMNESIS_MARITAL_STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Profissão</label>
                <input className="form-input" value={form.identification.profession} onChange={setTextField(['identification', 'profession'])} />
              </div>
              <div className="form-group">
                <label className="form-label">Telefone *</label>
                <input className="form-input" value={form.identification.phone} onChange={setTextField(['identification', 'phone'])} />
              </div>
              <div className="form-group form-full">
                <label className="form-label">E-mail</label>
                <input className="form-input" value={form.identification.email} onChange={setTextField(['identification', 'email'])} />
              </div>
              <div className="form-group form-full">
                <label className="form-label">Endereço completo</label>
                <textarea className="form-textarea" value={form.identification.addressFull} onChange={setTextField(['identification', 'addressFull'])} placeholder="Rua, número, complemento, bairro, cidade e UF." />
              </div>
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="2. Queixa principal"
            title="Queixa principal"
            description="Registre o que o paciente procura tratar e o contexto atual da demanda."
          >
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Qual procedimento deseja realizar</label>
                <input className="form-input" value={form.chiefComplaint.desiredProcedure} onChange={setTextField(['chiefComplaint', 'desiredProcedure'])} placeholder="Ex: limpeza de pele, bioestimulador, drenagem." />
              </div>
              <div className="form-group">
                <label className="form-label">Há quanto tempo percebe essa queixa</label>
                <input className="form-input" value={form.chiefComplaint.complaintDuration} onChange={setTextField(['chiefComplaint', 'complaintDuration'])} placeholder="Ex: 6 meses, desde a gestação, há alguns anos." />
              </div>
              <div className="form-group form-full">
                <label className="form-label">O que mais incomoda atualmente *</label>
                <textarea className="form-textarea" value={form.chiefComplaint.currentDiscomfort} onChange={setTextField(['chiefComplaint', 'currentDiscomfort'])} placeholder="Descreva a percepção principal que motivou a busca pelo tratamento." />
              </div>
              <div className="form-group form-full">
                <label className="form-label">Já realizou algum tratamento anterior para isso</label>
                <textarea className="form-textarea" value={form.chiefComplaint.previousTreatment} onChange={setTextField(['chiefComplaint', 'previousTreatment'])} placeholder="Informe procedimentos prévios, resposta, tempo e intercorrências relevantes." />
              </div>
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="3. Histórico de saúde"
            title="Histórico de saúde"
            description="Organize condições clínicas, cirúrgicas e dermatológicas que influenciam segurança e indicação."
          >
            <div className="anamnesis-health-note">
              <strong>Leitura clínica mais objetiva</strong>
              <span>Condições, alergias, cirurgias, medicamentos e histórico estético ficam organizados em cartões mais enxutos para acelerar a análise antes da indicação.</span>
            </div>

            <div className="anamnesis-health-layout">
              <SubsectionCard
                title="3.1 Doenças pré-existentes"
                description="Selecione condições que exigem cuidado clínico adicional na conduta estética."
                className="anamnesis-health-card anamnesis-health-card-primary"
                compact
              >
                <div className="checkbox-grid checkbox-grid-compact checkbox-grid-health form-full">
                  {PRE_EXISTING_CONDITION_FIELDS.map(field => (
                    <ToggleField
                      key={field.key}
                      label={field.label}
                      checked={form.healthHistory.preExistingConditions[field.key]}
                      onChange={setCheckboxField(['healthHistory', 'preExistingConditions', field.key])}
                    />
                  ))}
                </div>
                <div className="form-group form-full">
                  <label className="form-label">Outros</label>
                  <textarea className="form-textarea" value={form.healthHistory.preExistingConditions.otherConditions} onChange={setTextField(['healthHistory', 'preExistingConditions', 'otherConditions'])} placeholder="Descreva outras condições clínicas importantes." />
                </div>
              </SubsectionCard>

              <SubsectionCard
                title="3.2 Cirurgias anteriores"
                description="Concentre datas aproximadas, procedimentos prévios e possíveis intercorrências."
                className="anamnesis-health-card"
                compact
              >
                <div className="checkbox-grid checkbox-grid-compact checkbox-grid-health form-full">
                  <ToggleField label="Já realizou cirurgias" checked={form.healthHistory.surgeries.hadSurgeries} onChange={setCheckboxField(['healthHistory', 'surgeries', 'hadSurgeries'])} />
                  <ToggleField label="Houve complicações" checked={form.healthHistory.surgeries.hadComplications} onChange={setCheckboxField(['healthHistory', 'surgeries', 'hadComplications'])} />
                </div>
                <div className="form-group">
                  <label className="form-label">Data aproximada</label>
                  <input className="form-input" value={form.healthHistory.surgeries.approximateDate} onChange={setTextField(['healthHistory', 'surgeries', 'approximateDate'])} placeholder="Ex: 2022, março/2024." />
                </div>
                <div className="form-group form-full">
                  <label className="form-label">Quais cirurgias</label>
                  <textarea className="form-textarea" value={form.healthHistory.surgeries.surgeryDetails} onChange={setTextField(['healthHistory', 'surgeries', 'surgeryDetails'])} placeholder="Liste procedimentos, regiões tratadas e condutas relevantes." />
                </div>
              </SubsectionCard>

              <SubsectionCard
                title="3.3 Uso de medicamentos"
                description="Registre medicações em uso para apoiar avaliação de risco e indicação do protocolo."
                className="anamnesis-health-card"
                compact
              >
                <div className="checkbox-grid checkbox-grid-compact checkbox-grid-health form-full">
                  <ToggleField label="Usa medicamento contínuo" checked={form.healthHistory.medications.continuousMedication} onChange={setCheckboxField(['healthHistory', 'medications', 'continuousMedication'])} />
                  <ToggleField label="Anticoagulantes" checked={form.healthHistory.medications.anticoagulants} onChange={setCheckboxField(['healthHistory', 'medications', 'anticoagulants'])} />
                  <ToggleField label="Corticoides" checked={form.healthHistory.medications.corticosteroids} onChange={setCheckboxField(['healthHistory', 'medications', 'corticosteroids'])} />
                  <ToggleField label="Antibióticos recentes" checked={form.healthHistory.medications.recentAntibiotics} onChange={setCheckboxField(['healthHistory', 'medications', 'recentAntibiotics'])} />
                </div>
                <div className="form-group form-full">
                  <label className="form-label">Quais medicamentos</label>
                  <textarea className="form-textarea" value={form.healthHistory.medications.medicationDetails} onChange={setTextField(['healthHistory', 'medications', 'medicationDetails'])} placeholder="Informe nomes, dosagens ou observações relevantes." />
                </div>
              </SubsectionCard>

              <SubsectionCard
                title="3.4 Alergias"
                description="Documente sensibilidades relevantes para substâncias, medicamentos e anestésicos."
                className="anamnesis-health-card"
                compact
              >
                <div className="checkbox-grid checkbox-grid-compact checkbox-grid-health form-full">
                  <ToggleField label="Possui alergias" checked={form.healthHistory.allergies.hasAllergies} onChange={setCheckboxField(['healthHistory', 'allergies', 'hasAllergies'])} />
                  <ToggleField label="Alergia a medicamentos" checked={form.healthHistory.allergies.medicationAllergy} onChange={setCheckboxField(['healthHistory', 'allergies', 'medicationAllergy'])} />
                  <ToggleField label="Alergia a cosméticos" checked={form.healthHistory.allergies.cosmeticsAllergy} onChange={setCheckboxField(['healthHistory', 'allergies', 'cosmeticsAllergy'])} />
                  <ToggleField label="Alergia a anestésicos" checked={form.healthHistory.allergies.anestheticsAllergy} onChange={setCheckboxField(['healthHistory', 'allergies', 'anestheticsAllergy'])} />
                </div>
                <div className="form-group form-full">
                  <label className="form-label">Descrição complementar</label>
                  <textarea className="form-textarea" value={form.healthHistory.allergies.notes} onChange={setTextField(['healthHistory', 'allergies', 'notes'])} placeholder="Descreva agentes, reações e observações importantes." />
                </div>
              </SubsectionCard>

              <SubsectionCard
                title="3.5 Histórico dermatológico"
                description="Marque alterações cutâneas que interferem em indicação, resposta e segurança."
                className="anamnesis-health-card"
                compact
              >
                <div className="checkbox-grid checkbox-grid-compact checkbox-grid-health form-full">
                  {DERMATOLOGICAL_HISTORY_FIELDS.map(field => (
                    <ToggleField
                      key={field.key}
                      label={field.label}
                      checked={form.healthHistory.dermatologicalHistory[field.key]}
                      onChange={setCheckboxField(['healthHistory', 'dermatologicalHistory', field.key])}
                    />
                  ))}
                </div>
              </SubsectionCard>

              <SubsectionCard
                title="3.6 Histórico estético"
                description="Centralize procedimentos prévios, reações e observações úteis para a nova proposta terapêutica."
                className="anamnesis-health-card anamnesis-health-card-highlight"
                compact
                actions={(
                  <button type="button" className="btn btn-outline btn-sm" onClick={addAestheticHistoryEntry}>
                    <Icon name="plus" /> Adicionar item
                  </button>
                )}
              >
                {!form.healthHistory.aestheticHistory.length ? (
                  <div className="empty empty-tight form-full">
                    <div className="empty-icon">
                      <Icon name="sparkles" size={22} />
                    </div>
                    <h3>Sem histórico estético registrado</h3>
                    <p>Adicione procedimentos anteriores, observações e intercorrências quando isso fizer sentido para a avaliação.</p>
                  </div>
                ) : (
                  <div className="anamnesis-inline-stack form-full">
                    {form.healthHistory.aestheticHistory.map(entry => (
                      <AestheticHistoryEntryCard
                        key={entry.id}
                        entry={entry}
                        onChange={(field, value) => updateAestheticHistoryEntry(entry.id, field, value)}
                        onRemove={() => removeAestheticHistoryEntry(entry.id)}
                      />
                    ))}
                  </div>
                )}
              </SubsectionCard>
            </div>
          </SectionCard>
          <SectionCard eyebrow="4. Hábitos de vida" title="Hábitos de vida" description="Registre fatores comportamentais que interferem em resposta clínica, cicatrização e adesão.">
            <div className="anamnesis-lifestyle-layout">
              <SubsectionCard title="4.1 Rotina e fatores de resposta" description="Mapeie hábitos que impactam inflamação, recuperação, constância do tratamento e evolução clínica." compact>
                <div className="checkbox-grid checkbox-grid-compact checkbox-grid-health form-full">
                  <ToggleField label="Fuma" checked={form.lifestyle.smoking} onChange={setCheckboxField(['lifestyle', 'smoking'])} />
                  <ToggleField label="Consome álcool" checked={form.lifestyle.alcoholConsumption} onChange={setCheckboxField(['lifestyle', 'alcoholConsumption'])} />
                  <ToggleField label="Pratica atividade física" checked={form.lifestyle.physicalActivity} onChange={setCheckboxField(['lifestyle', 'physicalActivity'])} />
                </div>
              </SubsectionCard>

              <div className="anamnesis-lifestyle-side">
                <SubsectionCard title="4.2 Frequências e indicadores" description="Consolide recorrência, hidratação e qualidade do sono em uma leitura mais objetiva." compact>
                  <div className="form-group">
                    <label className="form-label">Frequência do consumo de álcool</label>
                    <select className="form-select" value={form.lifestyle.alcoholFrequency} onChange={setTextField(['lifestyle', 'alcoholFrequency'])}>
                      <option value="">Selecione</option>
                      {ANAMNESIS_ALCOHOL_FREQUENCY_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Qualidade do sono</label>
                    <select className="form-select" value={form.lifestyle.sleepQuality} onChange={setTextField(['lifestyle', 'sleepQuality'])}>
                      <option value="">Selecione</option>
                      {ANAMNESIS_SLEEP_QUALITY_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Frequência de atividade física por semana</label>
                    <select className="form-select" value={String(form.lifestyle.workoutsPerWeek || '')} onChange={setTextField(['lifestyle', 'workoutsPerWeek'])}>
                      <option value="">Selecione</option>
                      {WORKOUTS_PER_WEEK_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Ingestão de água diária</label>
                    <input className="form-input" value={form.lifestyle.dailyWaterIntake} onChange={setTextField(['lifestyle', 'dailyWaterIntake'])} placeholder="Ex: 2 litros, menos de 1 litro." />
                  </div>
                </SubsectionCard>

                <SubsectionCard title="4.3 Alimentação e contexto" description="Use este campo para registrar padrão alimentar, restrições e aspectos de adesão ao cuidado." compact>
                  <div className="form-group form-full">
                    <label className="form-label">Alimentação</label>
                    <textarea className="form-textarea" value={form.lifestyle.diet} onChange={setTextField(['lifestyle', 'diet'])} placeholder="Relate padrão alimentar, restrições, ingestão de açúcar e rotina." />
                  </div>
                </SubsectionCard>
              </div>
            </div>
          </SectionCard>

          <SectionCard eyebrow="5. Avaliação estética" title="Avaliação estética" description="Defina perfil cutâneo e principais condições observadas para orientar indicação.">
            <div className="anamnesis-evaluation-layout">
              <SubsectionCard title="5.1 Perfil cutâneo" description="Registre base de leitura clínica para apoiar indicação, comunicação de riscos e acompanhamento de resposta." compact>
                <div className="form-group">
                  <label className="form-label">Tipo de pele</label>
                  <select className="form-select" value={form.aestheticEvaluation.skinType} onChange={setTextField(['aestheticEvaluation', 'skinType'])}>
                    <option value="">Selecione</option>
                    {ANAMNESIS_SKIN_TYPE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Fototipo de Fitzpatrick</label>
                  <select className="form-select" value={form.aestheticEvaluation.fitzpatrick} onChange={setTextField(['aestheticEvaluation', 'fitzpatrick'])}>
                    <option value="">Selecione</option>
                    {ANAMNESIS_FITZPATRICK_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
              </SubsectionCard>

              <SubsectionCard title="5.2 Condições observadas e classificáveis" description="Acne, melasma e demais achados podem ser classificados com estrutura, intensidade e observações clínicas." compact>
                <div className="anamnesis-section-note form-full">
                  Classifique as condições observadas de forma estruturada para manter um histórico mais útil, comparável e clínico ao longo da evolução do caso.
                </div>

                <div className="aesthetic-condition-grid-list form-full">
                  {form.aestheticEvaluation.conditions.map(condition => (
                    <AestheticConditionCard
                      key={condition.type}
                      condition={condition}
                      onToggle={() => updateAestheticCondition(condition.type, { present: !condition.present })}
                      onClassificationChange={event => updateAestheticCondition(condition.type, { classification: event.target.value })}
                      onNotesChange={event => updateAestheticCondition(condition.type, { notes: event.target.value })}
                    />
                  ))}
                </div>
              </SubsectionCard>
            </div>
          </SectionCard>

          <SectionCard eyebrow="6. Contraindicações" title="Contraindicações" description="Checklist essencial para triagem antes de indicar o procedimento.">
            <div className="form-grid anamnesis-contraindications-layout">
              <div className="checkbox-grid form-full anamnesis-toggle-grid">
                <ToggleField label="Gravidez" checked={form.contraindications.pregnancy} onChange={setCheckboxField(['contraindications', 'pregnancy'])} />
                <ToggleField label="Lactação" checked={form.contraindications.lactation} onChange={setCheckboxField(['contraindications', 'lactation'])} />
                <ToggleField label="Infecções ativas" checked={form.contraindications.activeInfections} onChange={setCheckboxField(['contraindications', 'activeInfections'])} />
                <ToggleField label="Uso recente de isotretinoína" checked={form.contraindications.recentIsotretinoin} onChange={setCheckboxField(['contraindications', 'recentIsotretinoin'])} />
                <ToggleField label="Doenças dermatológicas ativas" checked={form.contraindications.activeDermatologicalDiseases} onChange={setCheckboxField(['contraindications', 'activeDermatologicalDiseases'])} />
                <ToggleField label="Implantes metálicos" checked={form.contraindications.metallicImplants} onChange={setCheckboxField(['contraindications', 'metallicImplants'])} />
              </div>
              <div className="form-group form-full">
                <label className="form-label">Observações adicionais</label>
                <textarea className="form-textarea" value={form.contraindications.additionalNotes} onChange={setTextField(['contraindications', 'additionalNotes'])} placeholder="Inclua cuidados extras, achados relevantes ou motivos de atenção." />
              </div>
            </div>
          </SectionCard>

          <SectionCard eyebrow="7. Expectativas" title="Expectativas do paciente" description="Alinhe objetivo, prazo esperado e percepção de limitação para reduzir ruído de expectativa.">
            <div className="form-grid anamnesis-expectations-layout">
              <div className="form-group form-full">
                <label className="form-label">O que espera do tratamento</label>
                <textarea className="form-textarea" value={form.expectations.treatmentExpectations} onChange={setTextField(['expectations', 'treatmentExpectations'])} />
              </div>
              <div className="form-group">
                <label className="form-label">Em quanto tempo espera resultados</label>
                <input className="form-input" value={form.expectations.expectedResultTimeline} onChange={setTextField(['expectations', 'expectedResultTimeline'])} />
              </div>
              <div className="checkbox-grid form-full anamnesis-single-toggle-grid">
                <ToggleField label="Está ciente das limitações do procedimento" checked={form.expectations.awareOfLimitations} onChange={setCheckboxField(['expectations', 'awareOfLimitations'])} />
              </div>
            </div>
          </SectionCard>

          <SectionCard eyebrow="8. Objetivo do tratamento" title="Objetivo do tratamento" description="Registre a meta clínica definida pela profissional para orientar o protocolo e acompanhar a evolução.">
            <div className="form-grid">
              <div className="form-group form-full">
                <label className="form-label">Objetivo do tratamento</label>
                <textarea
                  className="form-textarea"
                  rows={4}
                  value={form.treatmentObjective}
                  onChange={setTextField(['treatmentObjective'])}
                  placeholder="Ex: reduzir acne inflamatória em região facial, atenuar melasma malar, melhorar textura e viço cutâneo."
                />
              </div>
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="9. Registro fotográfico"
            title="Registro fotográfico"
            description="Fotos antes do procedimento com legenda curta e autorização vinculada ao prontuário. Aceita JPG, PNG ou WebP até 8 MB cada."
            actions={(
              <label className={['btn btn-outline photo-upload-btn', photoUploadDisabled ? 'is-disabled' : ''].filter(Boolean).join(' ')}>
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handleFiles} hidden disabled={photoUploadDisabled} />
                {uploading ? <span className="spinner" /> : <><Icon name="camera" /> Adicionar fotos</>}
              </label>
            )}
          >
            <div className="anamnesis-photo-layout">
              <div className="photo-consent-panel">
                <div className="photo-consent-head">
                  <div>
                    <strong>Consentimento de imagem</strong>
                    <p>Separe o registro clínico do uso de marketing para reduzir risco e deixar a decisão clara para a cliente.</p>
                  </div>
                  <span className={clinicalPhotoConsent ? 'badge badge-green' : 'badge badge-muted'}>
                    {photoUploadReady ? 'Fotos liberadas' : clinicalPhotoConsent ? 'Falta confirmação' : 'Aguardando aceite'}
                  </span>
                </div>

                <div className="checkbox-grid form-full anamnesis-photo-consent-grid">
                  <ToggleField
                    label="Autorizo registrar fotos para acompanhamento clínico no prontuário"
                    checked={clinicalPhotoConsent}
                    onChange={setPhotoConsentField('clinicalUseAuthorized')}
                  />
                  <ToggleField
                    label="Autorizo uso de imagem em divulgação e marketing"
                    checked={Boolean(form.photoRecord.marketingUseAuthorized || form.photoRecord.imageUseAuthorized)}
                    onChange={setPhotoConsentField('marketingUseAuthorized')}
                  />
                  <ToggleField
                    label="Confirmo que a autorização de imagem foi explicada e registrada antes do envio das fotos"
                    checked={photoConsentConfirmed}
                    onChange={setPhotoConsentField('consentAwarenessConfirmed')}
                  />
                </div>

                <p className="photo-consent-guidance">
                  O aceite clínico permite anexar fotos ao prontuário para evolução do tratamento. A confirmação operacional registra que a autorização foi explicada antes do anexo. O aceite de marketing continua separado e deve ser usado apenas quando a cliente concordar com divulgação externa.
                </p>

                {!clinicalPhotoConsent ? (
                  <p className="photo-consent-warning">O envio de fotos fica bloqueado até o consentimento clínico ser marcado.</p>
                ) : !photoConsentConfirmed ? (
                  <p className="photo-consent-warning">Marque a confirmação de ciência para liberar o envio de fotos.</p>
                ) : null}
              </div>

              {!form.photoRecord.photos?.length ? (
                <div className="empty empty-tight">
                  <div className="empty-icon">
                    <Icon name="camera" size={24} />
                  </div>
                  <h3>Nenhuma foto adicionada</h3>
                  <p>As fotos são opcionais, mas ajudam bastante no acompanhamento da evolução e na rastreabilidade clínica.</p>
                </div>
              ) : (
                <div className="anamnese-photo-grid">
                  {form.photoRecord.photos.map(photo => (
                    <div className="anamnese-photo-card" key={photo.id}>
                      <div className="anamnese-photo-wrap">
                        <img src={photo.dataUrl} alt={photo.caption || 'Registro da anamnese'} className="anamnese-photo" loading="lazy" />
                      </div>
                      <textarea
                        className="form-textarea anamnese-photo-caption"
                        value={photo.caption || ''}
                        onChange={event => updatePhoto(photo.id, 'caption', event.target.value)}
                        placeholder="Legenda clínica: região, momento, observação importante."
                      />
                      <div className="anamnese-photo-actions">
                        <span className="text-sm text-muted">{photo.fileName || 'Imagem da anamnese'}</span>
                        <button type="button" className="btn btn-ghost btn-sm danger-ghost" onClick={() => removePhoto(photo.id)}>
                          <Icon name="trash" /> Remover
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard eyebrow="10. Plano de tratamento" title="Plano de tratamento" description="Monte um protocolo real com múltiplos serviços, sessões previstas e detalhes clínicos por item.">
            <div className="anamnesis-treatment-layout">
              <SubsectionCard title="10.1 Estrutura do protocolo" description="Concentre proposta principal, número de sessões, intervalo e recursos envolvidos na condução do caso." compact>
                <div className="form-group form-full">
                  <label className="form-label">Procedimento indicado</label>
                  <textarea className="form-textarea" value={form.treatmentPlan.recommendedProcedure} onChange={setTextField(['treatmentPlan', 'recommendedProcedure'])} placeholder="Descreva a linha principal do protocolo e o racional clínico da indicação." />
                </div>
                <div className="form-group">
                  <label className="form-label">Número de sessões</label>
                  <input className="form-input" type="number" min="1" max="99" value={form.treatmentPlan.sessionCount ?? ''} onChange={setTextField(['treatmentPlan', 'sessionCount'])} />
                </div>
                <div className="form-group">
                  <label className="form-label">Intervalo entre sessões</label>
                  <input className="form-input" value={form.treatmentPlan.sessionInterval} onChange={setTextField(['treatmentPlan', 'sessionInterval'])} placeholder="Ex: semanal, quinzenal, a cada 30 dias." />
                </div>
                <div className="form-group form-full">
                  <label className="form-label">Produtos utilizados</label>
                  <textarea className="form-textarea" value={form.treatmentPlan.productsUsed} onChange={setTextField(['treatmentPlan', 'productsUsed'])} placeholder="Liste ativos, cosméticos, concentrações ou insumos relevantes." />
                </div>
                <div className="form-group form-full">
                  <label className="form-label">Equipamentos utilizados</label>
                  <textarea className="form-textarea" value={form.treatmentPlan.equipmentsUsed} onChange={setTextField(['treatmentPlan', 'equipmentsUsed'])} placeholder="Informe equipamentos, ponteiras, parâmetros ou observações técnicas." />
                </div>
              </SubsectionCard>

              <SubsectionCard
                title="10.2 Serviços do protocolo"
                description="Cada item do protocolo pode ter sessões, descrição e efeitos adversos próprios. Clique no card para abrir o modal e editar os detalhes."
                compact
                actions={(
                  <button type="button" className="btn btn-gold btn-sm" onClick={addTreatmentService}>
                    <Icon name="plus" /> Adicionar serviço
                  </button>
                )}
              >
                {!form.treatmentPlan.services.length ? (
                  <div className="empty empty-tight form-full">
                    <div className="empty-icon">
                      <Icon name="clipboard" size={24} />
                    </div>
                    <h3>Nenhum serviço no protocolo</h3>
                    <p>Adicione os serviços que compõem o plano terapêutico e use o modal para detalhar sessões, descrição e efeitos adversos.</p>
                  </div>
                ) : (
                  <div className="treatment-service-list form-full">
                    {form.treatmentPlan.services.map(service => (
                      <TreatmentServiceItem
                        key={service.id}
                        service={service}
                        readOnly={isLocked}
                        onOpen={openServiceModal}
                        onRemove={removeTreatmentService}
                      />
                    ))}
                  </div>
                )}
              </SubsectionCard>
            </div>
          </SectionCard>

          <SectionCard eyebrow="11. Termo de ciência" title="Termo de ciência" description="Confirmações internas da anamnese para amarrar histórico, risco e orientações prestadas.">
            <div className="checkbox-grid form-full anamnesis-science-grid">
              <ToggleField label="O paciente declarou que informou corretamente o histórico" checked={form.scienceTerm.informedHistoryAccurately} onChange={setCheckboxField(['scienceTerm', 'informedHistoryAccurately'])} />
              <ToggleField label="O paciente está ciente dos riscos" checked={form.scienceTerm.awareOfRisks} onChange={setCheckboxField(['scienceTerm', 'awareOfRisks'])} />
              <ToggleField label="O paciente recebeu orientações pré e pós-procedimento" checked={form.scienceTerm.receivedPreAndPostGuidance} onChange={setCheckboxField(['scienceTerm', 'receivedPreAndPostGuidance'])} />
            </div>
          </SectionCard>

          <SectionCard eyebrow="12. Assinaturas" title="Assinaturas e data" description="Capture as assinaturas no próprio prontuário e vincule quem foi o profissional responsável por esta validação.">
            <div className="form-grid anamnesis-signature-meta">
              <DateField
                label="Data"
                required
                value={form.signatures.signedAt}
                onChange={setDateField(['signatures', 'signedAt'])}
              />

              {professionals.length ? (
                <div className="form-group">
                  <label className="form-label">Profissional responsável *</label>
                  <select
                    className="form-select"
                    value={useManualProfessional ? 'MANUAL' : String(form.signatures.professionalId || '')}
                    onChange={handleProfessionalSelect}
                  >
                    <option value="">Selecione</option>
                    {professionals.map(professional => <option key={professional.id} value={professional.id}>{professional.name}</option>)}
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
                    Nenhum profissional ativo cadastrado. Informe manualmente para concluir a validação da anamnese.
                  </p>
                </div>
              )}

              {useManualProfessional || !professionals.length ? (
                <div className="form-group">
                  <label className="form-label">Nome do profissional *</label>
                  <input
                    className="form-input"
                    value={form.signatures.professionalName}
                    onChange={handleManualProfessionalName}
                    placeholder="Quem validou a conduta"
                  />
                </div>
              ) : null}
            </div>

            <div className="anamnesis-signature-grid anamnesis-signature-grid-polished">
              <SignaturePad
                label="Assinatura do paciente *"
                description="Assinatura vinculada ao paciente atendido."
                value={form.signatures.patientSignatureDataUrl}
                disabled={isLocked}
                onChange={value => setSignatureField(['signatures', 'patientSignatureDataUrl'], value)}
              />
              <SignaturePad
                label="Assinatura do profissional *"
                description="Assinatura de quem realizou a avaliação e validou a conduta."
                value={form.signatures.professionalSignatureDataUrl}
                disabled={isLocked}
                onChange={value => setSignatureField(['signatures', 'professionalSignatureDataUrl'], value)}
              />
            </div>
          </SectionCard>
        </div>

        <aside className="anamnesis-sidebar">
          <section className="card anamnesis-side-card brand-plaque">
            <div className="brand-plaque-logo">
              <img src={brandLogo} alt={`Logo de ${clinicName}`} />
            </div>
            <div>
              <div className="eyebrow">Prontuário da clínica</div>
              <h2 className="section-title">{clinicName}</h2>
              <p className="section-copy">
                Estrutura profissional de anamnese com foco em rastreabilidade, clareza e decisão clínica.
              </p>
            </div>
          </section>

          <section className="card anamnesis-side-card">
            <div className="eyebrow">Paciente</div>
            <h2 className="section-title">{form.identification.fullName || client.name}</h2>
            <div className="detail-list">
              <div className="detail-row">
                <span>Telefone</span>
                <strong>{form.identification.phone || 'Não informado'}</strong>
              </div>
              <div className="detail-row">
                <span>CPF</span>
                <strong>{form.identification.cpf || 'Não informado'}</strong>
              </div>
              <div className="detail-row">
                <span>Idade</span>
                <strong>{form.identification.age || 'Não calculada'}</strong>
              </div>
              <div className="detail-row">
                <span>Consentimento</span>
                <strong>{client.consentRecords?.[0]?.status === 'SIGNED' ? 'Assinado' : 'Pendente'}</strong>
              </div>
            </div>
          </section>

          <section className="card anamnesis-side-card prontuario-security-card">
            <div className="eyebrow">Segurança do prontuário</div>
            <h2 className="section-title">Controle de imagem</h2>
            <p className="section-copy">Fotos so ficam liberadas quando ha aceite clínico e confirmação de ciência no formulário.</p>
            <div className="detail-list">
              <div className="detail-row">
                <span>Uso clínico</span>
                <strong>{clinicalPhotoConsent ? 'Autorizado' : 'Pendente'}</strong>
              </div>
              <div className="detail-row">
                <span>Confirmação</span>
                <strong>{photoConsentConfirmed ? 'Registrada' : 'Pendente'}</strong>
              </div>
              <div className="detail-row">
                <span>Status das fotos</span>
                <strong>{photoUploadReady ? 'Liberado' : 'Bloqueado'}</strong>
              </div>
            </div>
            <div className="anamnesis-security-actions">
              <button type="button" className="btn btn-outline btn-block" onClick={handleImageConsentTerm} disabled={imageConsentButtonDisabled}>
                {generatingImageConsent ? <span className="spinner" /> : <Icon name="signature" />}
                {imageConsentButtonLabel}
              </button>
              <p><strong>{imageConsentStatusLabel}.</strong> O checkbox libera o registro operacional; o termo formal registra a assinatura digital da cliente.</p>
            </div>
          </section>

          <section className="card anamnesis-side-card">
            <div className="section-head consent-panel-head">
              <div>
                <div className="eyebrow">Checklist</div>
                <h2 className="section-title">Campos obrigatórios</h2>
              </div>
              <span className={`badge ${completedRequiredFields === requiredChecklist.length ? 'badge-green' : 'badge-gold'}`}>
                {completedRequiredFields}/{requiredChecklist.length}
              </span>
            </div>

            <div className="anamnese-history-list">
              {requiredChecklist.map(item => (
                <div className="anamnese-history-item" key={item.label}>
                  <strong>{item.label}</strong>
                  <span>{item.complete ? 'Preenchido' : 'Pendente'}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="card anamnesis-side-card">
            <div className="section-head consent-panel-head">
              <div>
                <div className="eyebrow">Histórico</div>
                <h2 className="section-title">Versões da anamnese</h2>
              </div>
            </div>

            {!history.length ? (
              <p className="text-muted">Ainda não há versões salvas para este cliente.</p>
            ) : (
              <div className="anamnese-history-list">
                {history.slice(0, 6).map(entry => {
                  const normalized = normalizeAnamnesisRecord(entry, client || {})

                  return (
                    <div className="anamnese-history-item" key={entry.id}>
                      <strong>{formatDateTime(entry.filledAt)}</strong>
                      <span>{getAnamnesisHistorySummary(normalized)}</span>
                      <small>{normalized.photoRecord.photos.length} foto(s) anexada(s)</small>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </aside>
      </div>
      </fieldset>

      <ServiceModal
        open={Boolean(activeService)}
        service={activeService}
        saving={saving}
        readOnly={isLocked}
        onClose={closeServiceModal}
        onSave={saveServiceModal}
      />
    </div>
  )
}
