import api, { downloadApiFile } from './api'
import type {
  AccessState,
  AnamnesisForm,
  AnamnesisHistoryBundle,
  ClientListResponse,
  ClientRecord,
  ConsentRecordSummary,
  ClientSeed,
  ClientUpsertPayload,
  MedicalRecordBundle,
  PaymentItem,
  PaymentsBundle,
  ProtocolEntry,
  ProtocolService,
  ProtocolsBundle,
} from './clinicalTypes'
import { buildAnamnesisPayload } from './anamnesis'

function toNumber(value, fallback = 0) {
  const parsedValue = Number(value)
  return Number.isFinite(parsedValue) ? parsedValue : fallback
}

function slugifyFilePart(value) {
  return (
    String(value || 'cliente')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      || 'cliente'
  )
}

function normalizeAccessState(accessState: Partial<AccessState> = {}): AccessState {
  const allowedActions: Partial<AccessState['allowedActions']> = accessState.allowedActions || {}

  return {
    isPaid: Boolean(accessState.isPaid),
    isLocked: Boolean(accessState.isLocked),
    lockedAt: accessState.lockedAt || null,
    lockMessage: accessState.lockMessage || null,
    readOnly: Boolean(accessState.readOnly),
    allowedActions: {
      view: allowedActions.view !== false,
      downloadPdf: allowedActions.downloadPdf !== false,
      editAnamnesis: allowedActions.editAnamnesis !== false,
      editProtocols: allowedActions.editProtocols !== false,
      editEvaluations: allowedActions.editEvaluations !== false,
      editRecommendations: allowedActions.editRecommendations !== false,
    },
  }
}

function normalizeClientRecord(client: Partial<ClientRecord> = {}): ClientRecord {
  const accessState = normalizeAccessState(client.prontuarioStatus || client.accessState)
  const appointments = Array.isArray(client.appointments) ? client.appointments : []
  const consentRecords = Array.isArray(client.consentRecords) ? client.consentRecords : []
  const anamneses = Array.isArray(client.anamneses) ? client.anamneses : []
  const payments = Array.isArray(client.payments) ? client.payments : []

  return {
    ...client,
    id: client.id || '',
    fullName: client.fullName || client.name || '',
    name: client.name || client.fullName || '',
    latestAnamnesis: client.latestAnamnesis || anamneses[0] || null,
    latestConsentRecord: client.latestConsentRecord || consentRecords[0] || null,
    latestAppointment: client.latestAppointment || appointments[0] || null,
    appointments,
    consentRecords,
    anamneses,
    payments,
    isPaid: accessState.isPaid,
    isLocked: accessState.isLocked,
    lockedAt: accessState.lockedAt,
    lockMessage: accessState.lockMessage,
    readOnly: accessState.readOnly,
    allowedActions: accessState.allowedActions,
    prontuarioStatus: accessState,
  }
}

function buildClientUpsertPayload(payload: Partial<ClientSeed> = {}): ClientUpsertPayload {
  return {
    fullName: String(payload.fullName || payload.name || '').trim(),
    phone: String(payload.phone || '').trim(),
    email: String(payload.email || '').trim(),
    birthDate: payload.birthDate ? String(payload.birthDate).slice(0, 10) : '',
    cpf: String(payload.cpf || '').trim(),
    sex: String(payload.sex || '').trim(),
    maritalStatus: String(payload.maritalStatus || '').trim(),
    profession: String(payload.profession || '').trim(),
    addressFull: String(payload.addressFull || '').trim(),
    notes: String(payload.notes || '').trim(),
  }
}

function buildAnamnesisUpsertPayload(form: AnamnesisForm): { client: ClientUpsertPayload; answers: Record<string, unknown> } {
  const answers = buildAnamnesisPayload(form) as any

  return {
    client: {
      fullName: answers.identification.fullName || '',
      email: answers.identification.email || '',
      phone: answers.identification.phone || '',
      birthDate: answers.identification.birthDate || '',
      cpf: answers.identification.cpf || '',
      sex: answers.identification.sex || '',
      maritalStatus: answers.identification.maritalStatus || '',
      profession: answers.identification.profession || '',
      addressFull: answers.identification.addressFull || '',
      notes: '',
    },
    answers,
  }
}

function normalizeMedicalRecordBundle(data: Partial<MedicalRecordBundle> = {}): MedicalRecordBundle {
  const client = normalizeClientRecord(data.client || {})
  const accessState = normalizeAccessState(data.accessState || client.prontuarioStatus)

  return {
    ...data,
    client: {
      ...client,
      isPaid: accessState.isPaid,
      isLocked: accessState.isLocked,
      lockedAt: accessState.lockedAt,
      lockMessage: accessState.lockMessage,
      readOnly: accessState.readOnly,
      allowedActions: accessState.allowedActions,
      prontuarioStatus: accessState,
    },
    accessState,
    latestAnamnesis: data.latestAnamnesis || client.latestAnamnesis || null,
    anamnesisHistory: Array.isArray(data.anamnesisHistory) ? data.anamnesisHistory : client.anamneses,
    appointments: Array.isArray(data.appointments) ? data.appointments : client.appointments,
    payments: Array.isArray(data.payments) ? data.payments : client.payments,
    consentRecords: Array.isArray(data.consentRecords) ? data.consentRecords : client.consentRecords,
    timeline: Array.isArray(data.timeline) ? data.timeline : [],
    pdf: data.pdf || { available: false, legacyPath: null },
  }
}

function normalizeProtocolService(service: Partial<ProtocolService> = {}): ProtocolService {
  return {
    ...service,
    sessions: toNumber(service.sessions, 1),
    sortOrder: toNumber(service.sortOrder, 0),
    linkedService: service.linkedService || null,
  }
}

function normalizeProtocolEntry(protocol: Partial<ProtocolEntry> = {}): ProtocolEntry {
  return {
    ...protocol,
    sessionCount: protocol.sessionCount === null || protocol.sessionCount === undefined || protocol.sessionCount === ''
      ? ''
      : toNumber(protocol.sessionCount),
    services: Array.isArray(protocol.services) ? protocol.services.map(normalizeProtocolService) : [],
  }
}

function normalizeProtocolsBundle(data: Partial<ProtocolsBundle> = {}): ProtocolsBundle {
  return {
    ...data,
    current: data.current ? normalizeProtocolEntry(data.current) : null,
    history: Array.isArray(data.history) ? data.history.map(normalizeProtocolEntry) : [],
    accessState: normalizeAccessState(data.accessState),
    availableActions: data.availableActions || {
      view: true,
      edit: true,
      downloadPdf: true,
    },
  }
}

function normalizePaymentItem(item: Partial<PaymentItem> = {}): PaymentItem {
  return {
    ...item,
    amount: toNumber(item.amount),
    appointment: item.appointment || null,
  }
}

function normalizePaymentsBundle(data: Partial<PaymentsBundle> = {}): PaymentsBundle {
  const summary: Partial<PaymentsBundle['summary']> = data.summary || {}

  return {
    ...data,
    accessState: normalizeAccessState(data.accessState),
    items: Array.isArray(data.items) ? data.items.map(normalizePaymentItem) : [],
    unpaidAppointments: Array.isArray(data.unpaidAppointments) ? data.unpaidAppointments : [],
    summary: {
      totalPayments: toNumber(summary.totalPayments),
      paidCount: toNumber(summary.paidCount),
      pendingCount: toNumber(summary.pendingCount),
      paidAmount: toNumber(summary.paidAmount),
      pendingAmount: toNumber(summary.pendingAmount),
      unpaidAppointments: toNumber(summary.unpaidAppointments),
    },
  }
}

export async function listClientRecords({ search }: { search?: string } = {}): Promise<ClientListResponse> {
  const { data } = await api.get('/api/v2/clients', {
    params: {
      search: search || undefined,
    },
  })

  return {
    ...data,
    items: Array.isArray(data.items) ? data.items.map(normalizeClientRecord) : [],
  }
}

export async function getClientRecord(clientId: string | number): Promise<ClientRecord> {
  const { data } = await api.get(`/api/v2/clients/${clientId}`)
  return normalizeClientRecord(data)
}

export async function createClientRecord(payload: Partial<ClientSeed>): Promise<ClientRecord> {
  const { data } = await api.post('/api/v2/clients', buildClientUpsertPayload(payload))
  return normalizeClientRecord(data)
}

export async function updateClientRecord(clientId: string | number, payload: Partial<ClientSeed>): Promise<ClientRecord> {
  const { data } = await api.patch(`/api/v2/clients/${clientId}`, buildClientUpsertPayload(payload))
  return normalizeClientRecord(data)
}

export async function getClientMedicalRecord(clientId: string | number): Promise<MedicalRecordBundle> {
  const { data } = await api.get(`/api/v2/medical-records/by-client/${clientId}`)
  return normalizeMedicalRecordBundle(data)
}

export async function getClientAnamnesisHistory(clientId: string | number): Promise<AnamnesisHistoryBundle> {
  const { data } = await api.get(`/api/v2/medical-records/by-client/${clientId}/anamnesis`)

  return {
    clientId: data.clientId,
    latest: data.latest || null,
    history: Array.isArray(data.history) ? data.history : [],
    accessState: normalizeAccessState(data.accessState),
  }
}

export async function saveClientAnamnesis(clientId: string | number, form: AnamnesisForm): Promise<MedicalRecordBundle> {
  const { data } = await api.put(
    `/api/v2/medical-records/by-client/${clientId}/anamnesis`,
    buildAnamnesisUpsertPayload(form)
  )

  return normalizeMedicalRecordBundle(data)
}

export async function getClientProtocols(clientId: string | number): Promise<ProtocolsBundle> {
  const { data } = await api.get(`/api/v2/protocols/by-client/${clientId}`)
  return normalizeProtocolsBundle(data)
}

export async function getClientPayments(clientId: string | number): Promise<PaymentsBundle> {
  const { data } = await api.get(`/api/v2/payments/by-client/${clientId}`)
  return normalizePaymentsBundle(data)
}

export async function generateClientImageConsentRecord(
  clientId: string | number,
  payload: { clinicalUseAuthorized?: boolean; marketingUseAuthorized?: boolean } = {}
): Promise<ConsentRecordSummary> {
  const { data } = await api.post(`/clients/${clientId}/consent-records/generate-image-use`, payload)
  return data
}

export async function downloadClientMedicalRecordPdf(clientId: string | number, clientName: string): Promise<void> {
  await downloadApiFile(
    `/api/v2/pdf/medical-records/by-client/${clientId}`,
    `prontuario-${slugifyFilePart(clientName)}.pdf`
  )
}
