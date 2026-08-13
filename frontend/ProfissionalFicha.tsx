import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import api, { getApiErrorMessage } from './api'
import type {
  ProfessionalAvailabilitySlot,
  ProfessionalContractType,
  ProfessionalDetail,
  ProfessionalDocumentCategory,
  ProfessionalDocumentFileResponse,
  ProfessionalDocumentRequirement,
  ProfessionalDocumentSummary,
  ProfessionalPaymentModel,
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
  { value: 'COMMISSION', label: 'Comissão' },
  { value: 'HYBRID', label: 'Hibrido' },
  { value: 'DAILY', label: 'Diaria' },
]

const professionalDocumentCategoryOptions: Array<{ value: ProfessionalDocumentCategory; label: string }> = [
  { value: 'CONTRACT', label: 'Vinculo' },
  { value: 'CERTIFICATION', label: 'Certificacao' },
  { value: 'COUNCIL', label: 'Registro profissional' },
  { value: 'TRAINING', label: 'Treinamento' },
  { value: 'PERMISSION', label: 'Permissoes e dados' },
]

const MAX_PROFESSIONAL_DOCUMENT_SIZE_BYTES = 5 * 1024 * 1024

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
  payrollBonusAmount: string
  payrollDiscountAmount: string
  paymentDay: string
  payrollNotes: string
}

interface ProfessionalDocumentFormState {
  category: ProfessionalDocumentCategory
  documentType: string
  title: string
  expiresAt: string
  notes: string
  fileName: string
  fileMimeType: string
  fileDataUrl: string
}

function createEmptyProfessionalDocumentForm(requirement?: ProfessionalDocumentRequirement | null): ProfessionalDocumentFormState {
  const category = professionalDocumentCategoryOptions.some(option => option.value === requirement?.category)
    ? requirement?.category as ProfessionalDocumentCategory
    : 'CONTRACT'
  const title = requirement?.requirement || ''

  return {
    category,
    documentType: title,
    title,
    expiresAt: '',
    notes: '',
    fileName: '',
    fileMimeType: '',
    fileDataUrl: '',
  }
}

function normalizeAvailability(availability?: ProfessionalAvailabilitySlot[] | null) {
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

function createFormFromProfessional(professional?: ProfessionalDetail | null): ProfessionalFormState {
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
    payrollBonusAmount: professional?.payrollBonusAmount != null ? String(professional.payrollBonusAmount) : '',
    payrollDiscountAmount: professional?.payrollDiscountAmount != null ? String(professional.payrollDiscountAmount) : '',
    paymentDay: professional?.paymentDay != null ? String(professional.paymentDay) : '',
    payrollNotes: professional?.payrollNotes || '',
  }
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo selecionado'))
    reader.readAsDataURL(file)
  })
}

function triggerDownload(fileName: string, dataUrl: string) {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = fileName || 'documento-profissional'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

function formatDate(value?: string | null) {
  if (!value) return 'Sem vencimento'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Data inválida'

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
  }).format(date)
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Não informado'

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

function formatCurrency(value?: number | string | null) {
  if (value == null || value === '') return 'Não definido'

  return Number(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
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

function getWeekdayLabel(day: WeekdayValue) {
  return weekdays.find(item => item.value === day)?.label || day
}

function getProfessionalDocumentBadgeClass(status?: ProfessionalDocumentSummary['status'] | 'MISSING') {
  if (status === 'VALID' || status === 'WITHOUT_EXPIRY') return 'badge badge-green'
  if (status === 'EXPIRING') return 'badge badge-warning'
  if (status === 'EXPIRED' || status === 'MISSING') return 'badge badge-danger'
  return 'badge badge-muted'
}

interface ReadonlyFieldProps {
  label: string
  value?: string | number | null
}

function ReadonlyField({ label, value }: ReadonlyFieldProps) {
  return (
    <div className="prontuario-field">
      <span>{label}</span>
      <strong>{value || 'Não informado'}</strong>
    </div>
  )
}

export default function ProfissionalFicha() {
  const navigate = useNavigate()
  const { professionalId } = useParams<{ professionalId: string }>()
  const [loading, setLoading] = useState(true)
  const [professional, setProfessional] = useState<ProfessionalDetail | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<ProfessionalFormState>(createFormFromProfessional())
  const [documentModalOpen, setDocumentModalOpen] = useState(false)
  const [documentForm, setDocumentForm] = useState<ProfessionalDocumentFormState>(createEmptyProfessionalDocumentForm())
  const [savingDocument, setSavingDocument] = useState(false)
  const [loadingDocumentId, setLoadingDocumentId] = useState<ProfessionalDocumentSummary['id'] | null>(null)
  const [deletingDocumentId, setDeletingDocumentId] = useState<ProfessionalDocumentSummary['id'] | null>(null)
  const [showCommissionModal, setShowCommissionModal] = useState(false)

  const load = useCallback(async () => {
    if (!professionalId) {
      toast.error('Não foi possível identificar a profissional selecionada')
      navigate('/profissionais', { replace: true })
      return
    }

    setLoading(true)

    try {
      const { data } = await api.get<ProfessionalDetail>(`/professionals/${professionalId}`)
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
  const documentCoverage = professional?.documentCoverage || professional?.documentsDashboard?.byProfessional?.[0] || null
  const professionalDocuments = professional?.documents || documentCoverage?.documents || []
  const missingProfessionalDocuments = documentCoverage?.missingRequirements || []
  const documentComplianceScore = documentCoverage?.score ?? (professionalDocuments.length ? 100 : 0)

  const payrollPeriodLabel = useMemo(() => {
    const periodStart = professional?.payroll?.periodStart
    if (!periodStart) return 'competencia atual'

    return new Intl.DateTimeFormat('pt-BR', {
      month: 'long',
      year: 'numeric',
    }).format(new Date(periodStart))
  }, [professional])

  function setField<Key extends keyof ProfessionalFormState>(key: Key) {
    return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setForm(current => ({ ...current, [key]: event.target.value }))
    }
  }

  function setDocumentField<Key extends keyof ProfessionalDocumentFormState>(key: Key) {
    return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setDocumentForm(current => ({ ...current, [key]: event.target.value }))
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
      toast.error(error instanceof Error ? error.message : 'Não foi possível carregar a foto')
    } finally {
      event.target.value = ''
    }
  }

  function openDocumentModal(requirement?: ProfessionalDocumentRequirement | null) {
    setDocumentForm(createEmptyProfessionalDocumentForm(requirement))
    setDocumentModalOpen(true)
  }

  function closeDocumentModal() {
    setDocumentModalOpen(false)
    setDocumentForm(createEmptyProfessionalDocumentForm())
  }

  async function handleProfessionalDocumentFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    if (file.size > MAX_PROFESSIONAL_DOCUMENT_SIZE_BYTES) {
      toast.error('Arquivo muito grande. Use documentos de até 5 MB.')
      event.target.value = ''
      return
    }

    try {
      const fileDataUrl = await readFileAsDataUrl(file)
      setDocumentForm(current => ({
        ...current,
        fileName: file.name,
        fileMimeType: file.type || 'application/octet-stream',
        fileDataUrl,
        title: current.title || file.name.replace(/\.[^.]+$/, ''),
      }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível carregar o documento')
    } finally {
      event.target.value = ''
    }
  }

  async function handleSaveProfessionalDocument() {
    if (!professionalId) return

    if (!documentForm.title.trim() || !documentForm.documentType.trim()) {
      toast.error('Informe o tipo e o título do documento.')
      return
    }

    if (!documentForm.fileDataUrl || !documentForm.fileName) {
      toast.error('Anexe o arquivo antes de salvar.')
      return
    }

    setSavingDocument(true)

    try {
      await api.post(`/professionals/${professionalId}/documents`, {
        category: documentForm.category,
        documentType: documentForm.documentType,
        title: documentForm.title,
        expiresAt: documentForm.expiresAt || null,
        notes: documentForm.notes,
        fileName: documentForm.fileName,
        fileMimeType: documentForm.fileMimeType,
        fileDataUrl: documentForm.fileDataUrl,
      })

      toast.success('Documento da profissional anexado.')
      closeDocumentModal()
      await load()
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Não foi possível anexar o documento da profissional'))
    } finally {
      setSavingDocument(false)
    }
  }

  async function handleDownloadProfessionalDocument(document: ProfessionalDocumentSummary) {
    setLoadingDocumentId(document.id)

    try {
      const { data } = await api.get<ProfessionalDocumentFileResponse>(`/professional-documents/${document.id}`)
      triggerDownload(data.fileName, data.fileDataUrl)
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Não foi possível abrir este documento'))
    } finally {
      setLoadingDocumentId(null)
    }
  }

  async function handleDeleteProfessionalDocument(document: ProfessionalDocumentSummary) {
    if (!window.confirm('Remover este documento da profissional?')) return

    setDeletingDocumentId(document.id)

    try {
      await api.delete(`/professional-documents/${document.id}`)
      toast.success('Documento removido da ficha profissional.')
      await load()
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Não foi possível remover este documento'))
    } finally {
      setDeletingDocumentId(null)
    }
  }

  async function handleSave() {
    if (!professionalId) return

    if (!form.name.trim() || !form.specialty.trim()) {
      toast.error('Nome e especialidade sao obrigatorios')
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
        payrollBonusAmount: form.payrollBonusAmount ? Number(form.payrollBonusAmount) : null,
        payrollDiscountAmount: form.payrollDiscountAmount ? Number(form.payrollDiscountAmount) : null,
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

  const handlePrintCommissionReport = () => {
    if (!professional) return
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      toast.error('Não foi possível abrir a janela de impressão. Verifique se o bloqueador de pop-ups está ativo.')
      return
    }
    const professionalName = professional.name
    const periodLabel = payrollPeriodLabel
    const commissionRate = professional.commissionRate || 0
    const payroll = professional.payroll
    const paidAppointments = professional.appointments?.filter(app => app.payment?.status === 'PAID') || []

    const tableRows = paidAppointments.map((app, idx) => {
      const val = app.payment?.amount || app.price || 0
      const comm = (val * commissionRate) / 100
      return `
        <tr>
          <td>${idx + 1}</td>
          <td>${app.startAt ? new Date(app.startAt).toLocaleDateString('pt-BR') : ''}</td>
          <td>${app.client?.name || 'Cliente'}</td>
          <td>${app.service?.name || 'Serviço'}</td>
          <td>R$ ${val.toFixed(2).replace('.', ',')}</td>
          <td>R$ ${comm.toFixed(2).replace('.', ',')}</td>
        </tr>
      `
    }).join('')

    printWindow.document.write(`
      <html>
        <head>
          <title>Extrato de Repasse - ${professionalName}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #2a1f17; padding: 40px; margin: 0; }
            .header { border-bottom: 2px solid #b6894d; padding-bottom: 20px; margin-bottom: 30px; }
            .header h1 { font-size: 22px; color: #2a1f17; margin: 0; }
            .meta-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-bottom: 30px; background: #fdfaf5; padding: 15px; border: 1px solid #f4e8d6; border-radius: 8px; font-size: 13px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
            th { background: #f4e8d6; text-align: left; padding: 10px; border-bottom: 2px solid #e3d2bd; }
            td { padding: 10px; border-bottom: 1px solid #f4e8d6; }
            .total-row { font-weight: bold; background: #fdfaf5; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Extrato de Repasse Profissional</h1>
            <p>Profissional: <strong>${professionalName}</strong> | Período: ${periodLabel}</p>
          </div>
          <div class="meta-grid">
            <div>
              <p><strong>Modelo de Contratação:</strong> ${professional.paymentModel || 'Comissionada'}</p>
              <p><strong>Taxa de Comissão:</strong> ${commissionRate}%</p>
              <p><strong>Atendimentos Pagos:</strong> ${payroll?.paidAppointments || 0}</p>
            </div>
            <div>
              <p><strong>Total Comissão:</strong> R$ ${(payroll?.commissionAmount || 0).toFixed(2).replace('.', ',')}</p>
              <p><strong>Bônus / Adicionais:</strong> R$ ${(payroll?.bonusAmount || 0).toFixed(2).replace('.', ',')}</p>
              <p><strong>Descontos:</strong> R$ ${(payroll?.discountAmount || 0).toFixed(2).replace('.', ',')}</p>
              <p style="font-size: 16px; color: #8a5b24;"><strong>Líquido a Receber:</strong> R$ ${(payroll?.projectedPayout || 0).toFixed(2).replace('.', ',')}</p>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th style="width: 5%;">#</th>
                <th style="width: 15%;">Data</th>
                <th style="width: 25%;">Cliente</th>
                <th style="width: 25%;">Serviço</th>
                <th style="width: 15%;">Valor Pago</th>
                <th style="width: 15%;">Repasse (${commissionRate}%)</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `)
    printWindow.document.close()
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
            <img src={professional.photoDataUrl} alt={`Foto de ${professional.name}`} className="professional-detail-photo" loading="lazy" />
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
            <ReadonlyField label="Bônus" value={formatCurrency(professional.payrollBonusAmount)} />
            <ReadonlyField label="Desconto" value={formatCurrency(professional.payrollDiscountAmount)} />
            <ReadonlyField label="Dia do repasse" value={professional.paymentDay != null ? `Dia ${professional.paymentDay}` : ''} />
            <ReadonlyField label="Cadastro" value={formatDateTime(professional.createdAt)} />
          </div>
        </section>

        <section className="card section-card">
          <div className="section-head">
            <div>
              <h2 className="section-title">Visao da operação</h2>
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
          <section className="card section-card professional-documents-card">
            <div className="section-head">
              <div>
                <h2 className="section-title">Documentação obrigatória</h2>
                <p className="section-copy">Vínculo, formação, registros, treinamentos e permissões reunidos na ficha da profissional.</p>
              </div>
              <button type="button" className="btn btn-outline" onClick={() => openDocumentModal()}>
                <Icon name="plus" /> Anexar documento
              </button>
            </div>

            <div className="professional-document-summary-grid">
              <div>
                <span>Conformidade</span>
                <strong>{documentComplianceScore}%</strong>
              </div>
              <div>
                <span>Cobertura</span>
                <strong>{documentCoverage?.coveredCount ?? professionalDocuments.length}/{documentCoverage?.requiredCount ?? 5}</strong>
              </div>
              <div>
                <span>Pendências</span>
                <strong>{documentCoverage?.missingCount ?? missingProfessionalDocuments.length}</strong>
              </div>
              <div>
                <span>Alertas</span>
                <strong>{(documentCoverage?.expiredCount || 0) + (documentCoverage?.expiringCount || 0)}</strong>
              </div>
            </div>

            {missingProfessionalDocuments.length ? (
              <div className="professional-document-missing-list" aria-label="Documentos obrigatórios pendentes">
                {missingProfessionalDocuments.map(requirement => (
                  <article className="professional-document-missing-item" key={requirement.id}>
                    <div>
                      <span>{requirement.categoryLabel}</span>
                      <strong>{requirement.requirement}</strong>
                    </div>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => openDocumentModal(requirement)}>
                      <Icon name="plus" /> Anexar
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <div className="professional-document-empty-state">
                <Icon name="check" size={18} />
                <span>Documentação obrigatória coberta para a auditoria atual.</span>
              </div>
            )}

            <div className="professional-document-list">
              {professionalDocuments.length ? professionalDocuments.map(document => (
                <article className="professional-document-item" key={document.id}>
                  <div>
                    <span>{document.categoryLabel}</span>
                    <strong>{document.title}</strong>
                    <small>{document.fileName} · Vencimento: {formatDate(document.expiresAt)}</small>
                  </div>
                  <div className="professional-document-actions">
                    <span className={getProfessionalDocumentBadgeClass(document.status)}>{document.statusLabel}</span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => void handleDownloadProfessionalDocument(document)}
                      disabled={loadingDocumentId === document.id || deletingDocumentId === document.id}
                    >
                      {loadingDocumentId === document.id ? <span className="spinner" /> : <Icon name="download" />}
                      Abrir
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => void handleDeleteProfessionalDocument(document)}
                      disabled={loadingDocumentId === document.id || deletingDocumentId === document.id}
                    >
                      {deletingDocumentId === document.id ? <span className="spinner" /> : <Icon name="trash" />}
                      Remover
                    </button>
                  </div>
                </article>
              )) : (
                <p className="text-muted professional-document-list-empty">Nenhum arquivo anexado a esta profissional ainda.</p>
              )}
            </div>
          </section>

          <section className="card section-card professional-payroll-card">
            <div className="section-head section-head-inline" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 className="section-title">Folha de pagamento</h2>
                <p className="section-copy">Calculo automatico com base nos atendimentos pagos de {payrollPeriodLabel}.</p>
              </div>
              {Number(professional.payroll?.paidAppointments || 0) > 0 && (
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowCommissionModal(true)}>
                  <Icon name="fileText" /> Detalhar repasses
                </button>
              )}
            </div>

            <div className="prontuario-grid">
              <ReadonlyField label="Receita paga" value={formatCurrency(professional.payroll?.paidRevenue)} />
              <ReadonlyField label="Comissão calculada" value={formatCurrency(professional.payroll?.commissionAmount)} />
              <ReadonlyField label="Bruto do fechamento" value={formatCurrency(professional.payroll?.grossPayout)} />
              <ReadonlyField label="Bônus" value={formatCurrency(professional.payroll?.bonusAmount)} />
              <ReadonlyField label="Descontos" value={formatCurrency(professional.payroll?.discountAmount)} />
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
                    <span>{slot.start} as {slot.end}</span>
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
                      {formatDateTime(appointment.startAt)} - {appointment.status} - {formatCurrency(appointment.price)}
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
                    <input className="form-input" value={form.specialty} onChange={setField('specialty')} placeholder="Ex: Esteticista, Biomedica" />
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
                    <label className="form-label">Bônus do fechamento</label>
                    <input className="form-input" type="number" min="0" step="0.01" value={form.payrollBonusAmount} onChange={setField('payrollBonusAmount')} placeholder="0,00" />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Desconto do fechamento</label>
                    <input className="form-input" type="number" min="0" step="0.01" value={form.payrollDiscountAmount} onChange={setField('payrollDiscountAmount')} placeholder="0,00" />
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

      {documentModalOpen ? (
        <div className="modal-backdrop" onClick={event => event.target === event.currentTarget && !savingDocument && closeDocumentModal()}>
          <div className="modal modal-lg professional-document-modal">
            <h2 className="modal-title">Anexar documento da profissional</h2>
            <p className="section-copy">O arquivo fica vinculado à ficha e passa a compor a auditoria da equipe.</p>

            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Categoria</label>
                <select className="form-select" value={documentForm.category} onChange={setDocumentField('category')}>
                  {professionalDocumentCategoryOptions.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Vencimento</label>
                <input className="form-input" type="date" value={documentForm.expiresAt} onChange={setDocumentField('expiresAt')} />
              </div>

              <div className="form-group">
                <label className="form-label">Tipo do documento *</label>
                <input
                  className="form-input"
                  value={documentForm.documentType}
                  onChange={setDocumentField('documentType')}
                  placeholder="Ex: Contrato, certificado, treinamento"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Título *</label>
                <input
                  className="form-input"
                  value={documentForm.title}
                  onChange={setDocumentField('title')}
                  placeholder="Ex: Certificado de biossegurança"
                />
              </div>

              <div className="form-group form-full">
                <label className="form-label">Observações</label>
                <textarea
                  className="form-textarea"
                  value={documentForm.notes}
                  onChange={setDocumentField('notes')}
                  placeholder="Use para validade operacional, escopo do treinamento, conselho vinculado ou observações internas."
                />
              </div>
            </div>

            <div className="professional-document-upload">
              <label className="btn btn-outline">
                <Icon name="clip" /> Selecionar arquivo
                <input type="file" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx" onChange={handleProfessionalDocumentFileChange} />
              </label>
              <div>
                <strong>{documentForm.fileName || 'Nenhum arquivo selecionado'}</strong>
                <span>PDF, imagem, Word ou planilha até 5 MB.</span>
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-outline" onClick={closeDocumentModal} disabled={savingDocument}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void handleSaveProfessionalDocument()} disabled={savingDocument}>
                {savingDocument ? <span className="spinner" /> : 'Salvar documento'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showCommissionModal ? (
        <div className="modal-backdrop" onClick={event => event.target === event.currentTarget && setShowCommissionModal(false)}>
          <div className="modal modal-lg" style={{ maxWidth: '800px' }}>
            <h2 className="modal-title">Extrato de Repasse de Comissão</h2>
            <p className="section-copy">
              Detalhamento de comissões calculadas sobre atendimentos pagos no período de {payrollPeriodLabel}.
            </p>

            <div className="prontuario-grid" style={{ marginBottom: '24px', background: '#fdfaf5', padding: '16px', borderRadius: '16px', border: '1px solid #f4e8d6' }}>
              <ReadonlyField label="Profissional" value={professional.name} />
              <ReadonlyField label="Especialidade" value={professional.specialty} />
              <ReadonlyField label="Taxa de Comissão" value={professional.commissionRate != null ? `${professional.commissionRate}%` : 'N/A'} />
              <ReadonlyField label="Receita Paga" value={formatCurrency(professional.payroll?.paidRevenue)} />
              <ReadonlyField label="Comissão Total" value={formatCurrency(professional.payroll?.commissionAmount)} />
              <ReadonlyField label="Total Líquido" value={formatCurrency(professional.payroll?.projectedPayout)} />
            </div>

            <div className="commission-modal-table-wrapper">
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '12px 16px' }}>Data</th>
                    <th style={{ padding: '12px 16px' }}>Cliente</th>
                    <th style={{ padding: '12px 16px' }}>Serviço</th>
                    <th style={{ padding: '12px 16px' }}>Valor</th>
                    <th style={{ padding: '12px 16px' }}>Comissão</th>
                  </tr>
                </thead>
                <tbody>
                  {(professional.appointments?.filter(app => app.payment?.status === 'PAID') || []).map(app => {
                    const price = app.payment?.amount || app.price || 0
                    const commission = (price * (professional.commissionRate || 0)) / 100
                    return (
                      <tr key={app.id}>
                        <td style={{ padding: '12px 16px' }}>{app.startAt ? new Date(app.startAt).toLocaleDateString('pt-BR') : ''}</td>
                        <td style={{ padding: '12px 16px' }}>{app.client?.name || 'Cliente'}</td>
                        <td style={{ padding: '12px 16px' }}>{app.service?.name || 'Serviço'}</td>
                        <td style={{ padding: '12px 16px' }}>{formatCurrency(price)}</td>
                        <td className="commission-value" style={{ padding: '12px 16px', fontWeight: 600 }}>{formatCurrency(commission)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setShowCommissionModal(false)}>
                Fechar
              </button>
              
              <button type="button" className="btn btn-secondary" onClick={handlePrintCommissionReport}>
                <Icon name="download" /> Imprimir extrato
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
