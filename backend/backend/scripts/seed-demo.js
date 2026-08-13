const bcrypt = require('bcryptjs')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

const BASE_URL = process.env.SEED_API_URL || 'http://localhost:3000'
const DEMO_EMAIL = process.env.DEMO_EMAIL || 'demo@lappui.local'
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'L!@246813579135'
const DEMO_CLINIC_NAME = process.env.DEMO_CLINIC_NAME || "L'Appui Maison"

const clientsSeed = [
  {
    name: 'Sofia Almeida',
    phone: '(11) 99811-2201',
    email: 'sofia.almeida@cliente.local',
    birthDate: '1991-03-15',
    cpf: '214.555.980-10',
    notes: 'Prefere atendimentos pela manha e ambiente silencioso.',
  },
  {
    name: 'Camila Nogueira',
    phone: '(11) 99811-2202',
    email: 'camila.nogueira@cliente.local',
    birthDate: '1988-07-09',
    cpf: '335.612.940-08',
    notes: 'Costuma confirmar por WhatsApp no dia anterior.',
  },
  {
    name: 'Helena Duarte',
    phone: '(11) 99811-2203',
    email: 'helena.duarte@cliente.local',
    birthDate: '1995-11-23',
    cpf: '468.553.320-44',
    notes: 'Tem pele sensivel e prefere protocolos suaves.',
  },
  {
    name: 'Isabela Martins',
    phone: '(11) 99811-2204',
    email: 'isabela.martins@cliente.local',
    birthDate: '1993-05-17',
    cpf: '390.720.150-61',
    notes: 'Atendimento premium recorrente a cada 30 dias.',
  },
  {
    name: 'Patricia Melo',
    phone: '(11) 99811-2205',
    email: 'patricia.melo@cliente.local',
    birthDate: '1986-01-31',
    cpf: '129.730.540-19',
    notes: 'Gosta de sair com o próximo retorno já reservado.',
  },
]

const weekdaySchedule = [
  { day: 'MONDAY', enabled: true, start: '09:00', end: '18:00' },
  { day: 'TUESDAY', enabled: true, start: '09:00', end: '18:00' },
  { day: 'WEDNESDAY', enabled: true, start: '09:00', end: '18:00' },
  { day: 'THURSDAY', enabled: true, start: '09:00', end: '18:00' },
  { day: 'FRIDAY', enabled: true, start: '09:00', end: '17:00' },
  { day: 'SATURDAY', enabled: false, start: '09:00', end: '13:00' },
  { day: 'SUNDAY', enabled: false, start: '09:00', end: '13:00' },
]

const professionalsSeed = [
  {
    name: 'Marina Leal',
    specialty: 'Biomedica esteta',
    phone: '(11) 97777-8801',
    availability: weekdaySchedule,
    contractType: 'PJ',
    paymentModel: 'HYBRID',
    salaryAmount: 2800,
    commissionRate: 18,
    paymentDay: 5,
    payrollNotes: 'Demo: profissional completa para validar equipe, agenda semanal e folha de pagamento.',
  },
  {
    name: 'Ana Clara Rocha',
    specialty: 'Esteticista facial',
    phone: '(11) 97777-8802',
    availability: weekdaySchedule.map(slot => slot.day === 'SATURDAY' ? { ...slot, enabled: true } : slot),
    contractType: 'CLT',
    paymentModel: 'FIXED',
    salaryAmount: 3600,
    paymentDay: 7,
    payrollNotes: 'Demo: equipe fixa com agenda ativa e pagamento mensal.',
  },
  {
    name: 'Livia Torres',
    specialty: 'Dermaticista convidada',
    phone: '(11) 97777-8803',
    notes: 'Demo: cadastro propositalmente incompleto para aparecer em Auditoria como atencao.',
  },
]

const servicesSeed = [
  {
    name: 'Detox Facial Signature',
    description: 'Limpeza profunda com finalizacao calmante e acabamento luminoso.',
    duration: 90,
    price: 320,
  },
  {
    name: "Ritual Glow L'Appui",
    description: 'Protocolo de revitalizacao e viço para pele cansada.',
    duration: 75,
    price: 280,
  },
  {
    name: 'Microagulhamento Revitalizante',
    description: 'Protocolo de estimulo controlado para textura, viÃ§o e uniformidade cutanea.',
    duration: 60,
    price: 260,
  },
  {
    name: 'Bioestimulador Corporal Assistido',
    description: 'Procedimento avancado em preparo para POP, com triagem e orientacoes obrigatorias.',
    duration: 80,
    price: 690,
    demoWithoutPop: true,
  },
]

const appointmentSeed = [
  {
    clientName: 'Sofia Almeida',
    serviceName: 'Detox Facial Signature',
    professionalName: 'Marina Leal',
    dayOffset: -4,
    hour: 10,
    minute: 0,
    status: 'COMPLETED',
    notes: 'Seed demo: retorno realizado com venda de skincare.',
    payment: { amount: 320, method: 'PIX', status: 'PAID' },
  },
  {
    clientName: 'Camila Nogueira',
    serviceName: "Ritual Glow L'Appui",
    professionalName: 'Ana Clara Rocha',
    dayOffset: -1,
    hour: 15,
    minute: 30,
    status: 'COMPLETED',
    notes: 'Seed demo: atendimento concluido e pago no checkout.',
    payment: { amount: 280, method: 'CREDIT_CARD', status: 'PAID' },
  },
  {
    clientName: 'Helena Duarte',
    serviceName: 'Microagulhamento Revitalizante',
    professionalName: 'Ana Clara Rocha',
    dayOffset: 1,
    hour: 9,
    minute: 30,
    status: 'CONFIRMED',
    notes: 'Seed demo: cliente confirmou presenca pela manha.',
  },
  {
    clientName: 'Isabela Martins',
    serviceName: "Ritual Glow L'Appui",
    professionalName: 'Marina Leal',
    dayOffset: 2,
    hour: 14,
    minute: 0,
    status: 'SCHEDULED',
    notes: 'Seed demo: primeiro atendimento do pacote mensal.',
  },
  {
    clientName: 'Patricia Melo',
    serviceName: 'Detox Facial Signature',
    professionalName: 'Marina Leal',
    dayOffset: 3,
    hour: 11,
    minute: 0,
    status: 'CONFIRMED',
    notes: 'Seed demo: horario reservado via recepcao.',
  },
]

const DEMO_FILE_DATA_URL = 'data:application/pdf;base64,JVBERi0xLjQKJcTl8uXrp/Og0MTGCjEgMCBvYmoKPDwvVHlwZSAvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+CmVuZG9iagp0cmFpbGVyCjw8L1Jvb3QgMSAwIFI+PgpFT0Y='
const DEMO_SIGNATURE_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAAAoCAQAAABWcDlRAAAAOUlEQVR42u3BAQ0AAADCIPunNsNwYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgH8GJQABz7m6xwAAAABJRU5ErkJggg=='

const documentsSeed = [
  {
    category: 'LEGAL',
    documentType: 'CNPJ',
    title: 'CNPJ da clinica',
    notes: 'Demo: documento administrativo sem vencimento.',
    fileName: 'cnpj-lappui-demo.pdf',
  },
  {
    category: 'LEGAL',
    documentType: 'Alvara sanitario',
    title: 'Alvara sanitario municipal',
    notes: 'Demo: vencimento proximo para validar alerta de auditoria.',
    expiresOffsetDays: 9,
    fileName: 'alvara-sanitario-demo.pdf',
  },
  {
    category: 'SANITARY',
    documentType: 'Responsavel tecnico',
    title: 'Responsavel tecnico - termo vigente',
    notes: 'Demo: documento tecnico vigente.',
    expiresOffsetDays: 55,
    fileName: 'responsavel-tecnico-demo.pdf',
  },
  {
    category: 'SANITARY',
    documentType: 'Licenca da VISA',
    title: 'Licenca da VISA vencida',
    notes: 'Demo: documento vencido para prioridade critica.',
    expiresOffsetDays: -18,
    fileName: 'licenca-visa-vencida-demo.pdf',
  },
  {
    category: 'CLIENTS',
    documentType: 'Termo de consentimento padrao',
    title: 'Termo de consentimento padrao',
    notes: 'Demo: base documental para procedimentos esteticos.',
    fileName: 'termo-consentimento-padrao-demo.pdf',
  },
  {
    category: 'CLIENTS',
    documentType: 'Modelo de anamnese',
    title: 'Modelo de anamnese clinica',
    notes: 'Demo: modelo base usado nos prontuarios.',
    fileName: 'modelo-anamnese-demo.pdf',
  },
  {
    category: 'WASTE',
    documentType: 'PGRSS',
    title: 'PGRSS vigente',
    notes: 'Demo: plano de residuos em dia.',
    expiresOffsetDays: 120,
    fileName: 'pgrss-demo.pdf',
  },
]

const professionalDocumentsSeed = [
  {
    professionalName: 'Marina Leal',
    category: 'CONTRACT',
    documentType: 'Contrato de prestacao de servicos',
    title: 'Contrato PJ - Marina Leal',
    notes: 'Demo: vinculo profissional em dia para auditoria da equipe.',
    fileName: 'contrato-pj-marina-demo.pdf',
  },
  {
    professionalName: 'Marina Leal',
    category: 'CERTIFICATION',
    documentType: 'Certificado de formacao estetica',
    title: 'Certificado de formacao - Marina Leal',
    notes: 'Demo: certificado vigente.',
    expiresOffsetDays: 360,
    fileName: 'certificado-formacao-marina-demo.pdf',
  },
  {
    professionalName: 'Marina Leal',
    category: 'COUNCIL',
    documentType: 'Registro CRBM ativo',
    title: 'Registro profissional CRBM - Marina Leal',
    notes: 'Demo: registro profissional aplicavel.',
    expiresOffsetDays: 220,
    fileName: 'registro-crbm-marina-demo.pdf',
  },
  {
    professionalName: 'Marina Leal',
    category: 'TRAINING',
    documentType: 'Treinamento interno de biosseguranca',
    title: 'Treinamento biosseguranca - Marina Leal',
    notes: 'Demo: treinamento proximo de reciclagem.',
    expiresOffsetDays: 45,
    fileName: 'treinamento-biosseguranca-marina-demo.pdf',
  },
  {
    professionalName: 'Marina Leal',
    category: 'PERMISSION',
    documentType: 'Termo LGPD e acesso a dados',
    title: 'Termo de confidencialidade LGPD - Marina Leal',
    notes: 'Demo: permissao de acesso documentada.',
    fileName: 'termo-lgpd-marina-demo.pdf',
  },
  {
    professionalName: 'Ana Clara Rocha',
    category: 'CONTRACT',
    documentType: 'Contrato CLT e vinculo',
    title: 'Contrato CLT - Ana Clara Rocha',
    notes: 'Demo: vinculo profissional em dia.',
    fileName: 'contrato-clt-ana-demo.pdf',
  },
  {
    professionalName: 'Ana Clara Rocha',
    category: 'CERTIFICATION',
    documentType: 'Certificado de especializacao facial',
    title: 'Certificado facial - Ana Clara Rocha',
    notes: 'Demo: certificado vigente.',
    expiresOffsetDays: 120,
    fileName: 'certificado-facial-ana-demo.pdf',
  },
  {
    professionalName: 'Ana Clara Rocha',
    category: 'TRAINING',
    documentType: 'Treinamento interno de biosseguranca',
    title: 'Treinamento biosseguranca vencido - Ana Clara Rocha',
    notes: 'Demo: reciclagem vencida para aparecer como prioridade na Auditoria.',
    expiresOffsetDays: -12,
    fileName: 'treinamento-vencido-ana-demo.pdf',
  },
  {
    professionalName: 'Livia Torres',
    category: 'PERMISSION',
    documentType: 'Termo de confidencialidade LGPD e acesso a dados',
    title: 'Termo LGPD provisorio - Livia Torres',
    notes: 'Demo: profissional convidada com pendencias restantes propositalmente abertas.',
    expiresOffsetDays: 8,
    fileName: 'termo-lgpd-livia-demo.pdf',
  },
]

const productsSeed = [
  {
    name: 'Acido hialuronico skinbooster',
    category: 'Injetavel',
    brand: 'Demo Pharma',
    batch: 'AH-2404',
    quantity: 2,
    unit: 'seringa',
    entryMode: 'EXISTING',
    purchasedOffsetDays: -80,
    expiresOffsetDays: -4,
    notes: 'Demo: lote vencido para testar bloqueio operacional.',
  },
  {
    name: 'Peeling mandelico 10%',
    category: 'Cosmetico profissional',
    brand: 'Derma Demo',
    batch: 'PM-1026',
    quantity: 4,
    unit: 'frasco',
    entryMode: 'NEW',
    purchasedOffsetDays: -35,
    expiresOffsetDays: 12,
    notes: 'Demo: produto proximo do vencimento.',
  },
  {
    name: 'Mascara calmante pos-procedimento',
    category: 'Cosmetico profissional',
    brand: 'LAppui Lab',
    batch: 'MC-2211',
    quantity: 8,
    unit: 'unidade',
    entryMode: 'NEW',
    purchasedOffsetDays: -14,
    expiresOffsetDays: 160,
    notes: 'Demo: item em dia.',
  },
]

const equipmentSeed = [
  {
    name: 'Autoclave Cristofoli 21L',
    category: 'Esterilizacao',
    brand: 'Cristofoli',
    model: 'Vitale 21',
    serialNumber: 'AUTO-DEMO-2104',
    anvisaRegistration: 'ANVISA-DEMO-001',
    entryMode: 'EXISTING',
    acquiredOffsetDays: -620,
    maintenanceOffsetDays: -10,
    warrantyOffsetDays: 120,
    notes: 'Demo: manutencao vencida para aparecer na Auditoria.',
  },
  {
    name: 'LED facial fotobiomodulacao',
    category: 'Tecnologia estetica',
    brand: 'Light Demo',
    model: 'LD Pro',
    serialNumber: 'LED-DEMO-8821',
    entryMode: 'EXISTING',
    acquiredOffsetDays: -260,
    maintenanceOffsetDays: 18,
    warrantyOffsetDays: 240,
    notes: 'Demo: manutencao proxima.',
  },
  {
    name: 'Vapor de ozonio facial',
    category: 'Apoio estetico',
    brand: 'Clean Skin',
    model: 'OZ-12',
    serialNumber: 'OZ-DEMO-1299',
    entryMode: 'NEW',
    acquiredOffsetDays: -40,
    maintenanceOffsetDays: 95,
    warrantyOffsetDays: 320,
    notes: 'Demo: equipamento em dia.',
  },
]

const clinicBillsSeed = [
  {
    title: "Assinatura L'Appui - plano clinica",
    category: 'SaaS',
    amount: 349,
    dueOffsetDays: 7,
    notes: 'Demo: assinatura da clinica junto aos pagamentos.',
  },
  {
    title: 'Coleta de residuos infectantes',
    category: 'Operacional',
    amount: 420,
    dueOffsetDays: -3,
    notes: 'Demo: conta vencida para validar Financeiro na Auditoria.',
  },
  {
    title: 'Manutencao preventiva da autoclave',
    category: 'Equipamentos',
    amount: 680,
    dueOffsetDays: 5,
    notes: 'Demo: conta operacional proxima.',
  },
  {
    title: 'Repasse profissional - mes anterior',
    category: 'Folha de pagamento',
    amount: 2860,
    dueOffsetDays: -12,
    paidOffsetDays: -8,
    notes: 'Demo: conta paga para historico financeiro.',
  },
]

function makeDate(dayOffset, hour, minute) {
  const date = new Date()
  date.setDate(date.getDate() + dayOffset)
  date.setHours(hour, minute, 0, 0)
  return date
}

function dateOnlyFromOffset(dayOffset) {
  const date = new Date()
  date.setDate(date.getDate() + dayOffset)
  date.setHours(12, 0, 0, 0)
  return date.toISOString().slice(0, 10)
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000)
}

async function request(path, { method = 'GET', token, body } = {}) {
  const headers = {}
  if (body) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  const text = await response.text()
  const data = text ? JSON.parse(text) : null

  if (!response.ok) {
    const error = new Error(data?.error || `Request failed with status ${response.status}`)
    error.status = response.status
    error.payload = data
    throw error
  }

  return data
}

async function repairExistingDemoCredentials() {
  const email = String(DEMO_EMAIL || '').trim().toLowerCase()
  if (!email) return false

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      ownedClinic: {
        select: { id: true },
      },
    },
  })

  if (!existingUser) {
    return false
  }

  const hashedPassword = await bcrypt.hash(DEMO_PASSWORD, 12)
  const now = new Date()
  const nextDueAt = new Date(now)
  nextDueAt.setDate(nextDueAt.getDate() + 30)

  await prisma.user.update({
    where: { id: existingUser.id },
    data: {
      hashedPassword,
      clinicName: DEMO_CLINIC_NAME,
      billingStatus: 'ACTIVE',
      billingAmount: 349,
      billingGraceEndsAt: nextDueAt,
      billingLastPaidAt: now,
      billingNextDueAt: nextDueAt,
      billingNotes: 'Conta demo reativada automaticamente para seed local.',
    },
  })

  if (existingUser.ownedClinic?.id) {
    await prisma.clinic.update({
      where: { id: existingUser.ownedClinic.id },
      data: { status: 'ACTIVE' },
    })

    await prisma.clinicSubscription.upsert({
      where: { clinicId: existingUser.ownedClinic.id },
      create: {
        clinicId: existingUser.ownedClinic.id,
        status: 'ACTIVE',
        amount: 349,
        graceEndsAt: nextDueAt,
        lastPaidAt: now,
        nextDueAt,
        notes: 'Conta demo reativada automaticamente para seed local.',
      },
      update: {
        status: 'ACTIVE',
        amount: 349,
        graceEndsAt: nextDueAt,
        lastPaidAt: now,
        nextDueAt,
        notes: 'Conta demo reativada automaticamente para seed local.',
      },
    })
  }

  return true
}

async function ensureSession() {
  try {
    const data = await request('/auth/register', {
      method: 'POST',
      body: { email: DEMO_EMAIL, password: DEMO_PASSWORD, clinicName: DEMO_CLINIC_NAME },
    })
    return data
  } catch (error) {
    if (error.status !== 409) throw error

    await repairExistingDemoCredentials()

    return request('/auth/login', {
      method: 'POST',
      body: { email: DEMO_EMAIL, password: DEMO_PASSWORD },
    })
  }
}

async function ensureByName(path, token, payload, { updateExisting = false } = {}) {
  const list = await request(path, { token })
  const existing = list.find(item => item.name === payload.name)
  if (existing) {
    if (!updateExisting) return existing
    return request(`${path}/${existing.id}`, { method: 'PUT', token, body: payload })
  }
  return request(path, { method: 'POST', token, body: payload })
}

async function ensureDocument(token, payload) {
  const list = await request('/documents', { token })
  const existing = list.find(item => item.title === payload.title || item.documentType === payload.documentType)
  const body = {
    ...payload,
    expiresAt: typeof payload.expiresOffsetDays === 'number' ? dateOnlyFromOffset(payload.expiresOffsetDays) : undefined,
    fileMimeType: payload.fileMimeType || 'application/pdf',
    fileDataUrl: payload.fileDataUrl || DEMO_FILE_DATA_URL,
  }
  delete body.expiresOffsetDays

  if (existing) {
    return request(`/documents/${existing.id}`, { method: 'PUT', token, body })
  }

  return request('/documents', { method: 'POST', token, body })
}

async function ensureProfessionalDocument(token, professional, payload) {
  const list = await request(`/professionals/${professional.id}/documents`, { token })
  const existing = list.find(item => item.title === payload.title || item.documentType === payload.documentType)
  const body = {
    category: payload.category,
    documentType: payload.documentType,
    title: payload.title,
    notes: payload.notes,
    expiresAt: typeof payload.expiresOffsetDays === 'number' ? dateOnlyFromOffset(payload.expiresOffsetDays) : null,
    fileName: payload.fileName,
    fileMimeType: payload.fileMimeType || 'application/pdf',
    fileDataUrl: payload.fileDataUrl || DEMO_FILE_DATA_URL,
  }

  if (existing) {
    return request(`/professional-documents/${existing.id}`, { method: 'PUT', token, body })
  }

  return request(`/professionals/${professional.id}/documents`, { method: 'POST', token, body })
}

async function ensureInventoryItem(path, token, payload) {
  const list = await request(path, { token })
  const existing = list.find(item => item.name === payload.name)
  const body = {
    ...payload,
    purchasedAt: typeof payload.purchasedOffsetDays === 'number' ? dateOnlyFromOffset(payload.purchasedOffsetDays) : undefined,
    acquiredAt: typeof payload.acquiredOffsetDays === 'number' ? dateOnlyFromOffset(payload.acquiredOffsetDays) : undefined,
    expiresAt: typeof payload.expiresOffsetDays === 'number' ? dateOnlyFromOffset(payload.expiresOffsetDays) : undefined,
    maintenanceDueAt: typeof payload.maintenanceOffsetDays === 'number' ? dateOnlyFromOffset(payload.maintenanceOffsetDays) : undefined,
    warrantyUntil: typeof payload.warrantyOffsetDays === 'number' ? dateOnlyFromOffset(payload.warrantyOffsetDays) : undefined,
  }
  delete body.purchasedOffsetDays
  delete body.acquiredOffsetDays
  delete body.expiresOffsetDays
  delete body.maintenanceOffsetDays
  delete body.warrantyOffsetDays

  if (existing) {
    return request(`${path}/${existing.id}`, { method: 'PUT', token, body })
  }

  return request(path, { method: 'POST', token, body })
}

async function ensureClinicBill(token, payload) {
  const summary = await request('/billing/bills', { token })
  const bills = Array.isArray(summary?.bills) ? summary.bills : []
  const existing = bills.find(item => item.title === payload.title)
  const body = {
    ...payload,
    dueAt: dateOnlyFromOffset(payload.dueOffsetDays),
    paidAt: typeof payload.paidOffsetDays === 'number' ? dateOnlyFromOffset(payload.paidOffsetDays) : undefined,
  }
  delete body.dueOffsetDays
  delete body.paidOffsetDays

  if (existing) {
    return request(`/billing/bills/${existing.id}`, { method: 'PUT', token, body })
  }

  return request('/billing/bills', { method: 'POST', token, body })
}

async function ensureConsentRecord({ token, userId, client, professional, type = 'default', signed = false }) {
  const records = await prisma.consentRecord.findMany({
    where: { userId, clientId: client.id },
    orderBy: { createdAt: 'desc' },
  })
  const existing = records.find(record => {
    const title = String(record.title || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    const isImage = title.includes('uso de imagem') || title.includes('imagem')
    return type === 'image' ? isImage : !isImage
  })

  if (existing && (!signed || existing.status === 'SIGNED')) {
    return existing
  }

  let record = existing
  if (!record) {
    try {
      record = await request(
        type === 'image'
          ? `/clients/${client.id}/consent-records/generate-image-use`
          : `/clients/${client.id}/consent-records/generate-default`,
        {
          method: 'POST',
          token,
          body: type === 'image'
            ? { clinicalUseAuthorized: true, marketingUseAuthorized: false }
            : { versionLabel: 'demo-v1' },
        }
      )
    } catch (error) {
      if (error.status !== 423) throw error

      record = await prisma.consentRecord.create({
        data: {
          userId,
          clientId: client.id,
          professionalId: professional?.id || null,
          title: type === 'image' ? 'Termo de autorizacao de uso de imagem' : 'Termo de consentimento para procedimentos esteticos',
          versionLabel: type === 'image' ? 'imagem-demo-v1' : 'demo-v1',
          termText: type === 'image'
            ? 'Demo: autorizacao de uso de imagem para acompanhamento clinico, prontuario e documentacao tecnica interna.'
            : 'Demo: consentimento livre e esclarecido para procedimento estetico, cuidados, riscos esperados e registro em prontuario.',
          status: signed ? 'SIGNED' : 'PENDING',
          signerName: signed ? client.name : null,
          signerDocument: signed ? (client.cpf || '000.000.000-00') : null,
          professionalName: professional?.name || null,
          signatureDataUrl: signed ? DEMO_SIGNATURE_DATA_URL : null,
          signedAt: signed ? new Date() : null,
          signedIp: signed ? '127.0.0.1' : null,
          signedUserAgent: signed ? 'seed-demo' : null,
        },
      })
    }
  }

  if (!signed || record.status === 'SIGNED') {
    return record
  }

  const signaturePayload = {
    signerName: client.name,
    signerDocument: client.cpf || '000.000.000-00',
    professionalId: professional?.id || null,
    professionalName: professional?.name || 'Responsavel tecnico demo',
    signatureDataUrl: DEMO_SIGNATURE_DATA_URL,
    accepted: true,
    status: 'SIGNED',
  }

  try {
    return await request(`/consent-records/${record.id}/sign`, {
      method: 'POST',
      token,
      body: signaturePayload,
    })
  } catch (error) {
    if (error.status !== 423) throw error

    return prisma.consentRecord.update({
      where: { id: record.id },
      data: {
        status: 'SIGNED',
        signerName: signaturePayload.signerName,
        signerDocument: signaturePayload.signerDocument,
        professionalId: signaturePayload.professionalId,
        professionalName: signaturePayload.professionalName,
        signatureDataUrl: signaturePayload.signatureDataUrl,
        signedAt: new Date(),
        signedIp: '127.0.0.1',
        signedUserAgent: 'seed-demo',
      },
    })
  }
}

async function ensureServicePopGap(userId, service) {
  if (!service?.id) return

  await prisma.servicePop.deleteMany({
    where: { userId, serviceId: service.id },
  })
}

async function cleanupLegacyDemoArtifacts(userId) {
  const legacyServices = await prisma.service.findMany({
    where: {
      userId,
      name: { in: ['Design de Sobrancelhas Luxe'] },
    },
  })

  if (legacyServices.length) {
    const replacementService = await prisma.service.findFirst({
      where: {
        userId,
        name: 'Microagulhamento Revitalizante',
      },
    })

    if (replacementService) {
      await prisma.appointment.updateMany({
        where: {
          userId,
          serviceId: { in: legacyServices.map(service => service.id) },
        },
        data: {
          serviceId: replacementService.id,
          price: replacementService.price,
          notes: 'Seed demo atualizado: atendimento migrado para protocolo estético avançado.',
        },
      })
    }

    await prisma.service.updateMany({
      where: {
        id: { in: legacyServices.map(service => service.id) },
      },
      data: { active: false },
    })
  }

  await prisma.productItem.updateMany({
    where: {
      userId,
      name: { in: ['Serum Vitamina C 20%', 'Acido hialuronico sterile'] },
    },
    data: { active: false },
  })

  await prisma.equipmentItem.updateMany({
    where: {
      userId,
      name: { in: ['Laser Lavieen', 'Autoclave Cristofoli'] },
    },
    data: { active: false },
  })

  await prisma.clinicDocument.deleteMany({
    where: {
      userId,
      title: { in: ['Manual de biosseguranca - sala facial'] },
    },
  })
}

function hasStructuredAnamnesis(record) {
  return Boolean(
    record?.answers?.identification &&
    record?.answers?.chiefComplaint &&
    record?.answers?.healthHistory &&
    record?.answers?.signatures
  )
}

async function ensureAnamnesis(clientId, token, clientSeed) {
  const list = await request(`/clients/${clientId}/anamnesis`, { token })
  const structuredRecord = list.find(hasStructuredAnamnesis)
  if (structuredRecord) return structuredRecord

  return request(`/clients/${clientId}/anamnesis`, {
    method: 'POST',
    token,
    body: {
      answers: {
        identification: {
          fullName: clientSeed.name,
          cpf: clientSeed.cpf,
          birthDate: clientSeed.birthDate,
          age: 35,
          sex: 'FEMININO',
          maritalStatus: 'SOLTEIRO',
          profession: 'Analista de marketing',
          phone: clientSeed.phone,
          email: clientSeed.email,
          addressFull: 'Rua das Camélias, 145 - Vila Mariana - São Paulo/SP',
        },
        chiefComplaint: {
          desiredProcedure: 'Limpeza de pele com protocolo de luminosidade',
          currentDiscomfort: 'Manchas leves e textura irregular após rotina intensa de trabalho.',
          complaintDuration: 'Há cerca de 8 meses',
          previousTreatment: 'Fez limpeza de pele há mais de 1 ano, com pouca regularidade desde então.',
        },
        healthHistory: {
          preExistingConditions: {
            hypertension: false,
            diabetes: false,
            heartDisease: false,
            autoimmuneDisease: false,
            hormonalIssues: true,
            kidneyIssues: false,
            liverIssues: false,
            otherConditions: 'Tireoide acompanhada clinicamente.',
          },
          surgeries: {
            hadSurgeries: false,
            surgeryDetails: '',
            approximateDate: '',
            hadComplications: false,
          },
          medications: {
            continuousMedication: true,
            medicationDetails: 'Reposição hormonal prescrita pelo endocrinologista.',
            anticoagulants: false,
            corticosteroids: false,
            recentAntibiotics: false,
          },
          allergies: {
            hasAllergies: true,
            medicationAllergy: false,
            cosmeticsAllergy: true,
            anestheticsAllergy: false,
            notes: 'Sensibilidade a fragrâncias muito intensas.',
          },
          dermatologicalHistory: {
            activeAcne: false,
            rosacea: false,
            melasma: true,
            skinSensitivity: true,
            keloidTendency: false,
          },
          aestheticHistory: [
            {
              id: 'seed-aesthetic-history-1',
              procedureName: 'Peeling superficial',
              procedureDate: '2026-01-18',
              notes: 'Boa resposta clínica com melhora de viço e textura.',
              intercurrences: '',
            },
          ],
        },
        lifestyle: {
          smoking: false,
          alcoholConsumption: true,
          alcoholFrequency: 'SOCIAL',
          dailyWaterIntake: 'Cerca de 2 litros por dia',
          diet: 'Alimentação equilibrada, com ingestão moderada de açúcar.',
          physicalActivity: true,
          workoutsPerWeek: 3,
          sleepQuality: 'REGULAR',
        },
        aestheticEvaluation: {
          skinType: 'MISTA',
          fitzpatrick: 'III',
          conditions: [
            {
              type: 'melasma',
              label: 'Melasma',
              present: true,
              classification: 'Moderado',
              notes: 'Maior concentração em região malar, com recorrência após exposição solar.',
            },
            {
              type: 'spots',
              label: 'Manchas',
              present: true,
              classification: 'Moderada',
              notes: 'Pigmentação irregular associada à rotina solar.',
            },
            {
              type: 'acne',
              label: 'Acne',
              present: false,
              classification: '',
              notes: '',
            },
          ],
          observedConditions: {
            wrinkles: false,
            sagging: false,
            spots: true,
            scars: false,
            localizedFat: false,
            cellulite: false,
            stretchMarks: false,
          },
        },
        contraindications: {
          pregnancy: false,
          lactation: false,
          activeInfections: false,
          recentIsotretinoin: false,
          activeDermatologicalDiseases: false,
          metallicImplants: false,
          additionalNotes: 'Evitar ativos muito sensibilizantes na primeira sessão.',
        },
        expectations: {
          treatmentExpectations: 'Uniformizar o viço da pele e reduzir aspecto opaco nas próximas semanas.',
          expectedResultTimeline: 'Em até 30 dias',
          awareOfLimitations: true,
        },
        treatmentObjective: 'Atenuar melasma em região malar e melhorar a textura global da pele.',
        photoRecord: {
          imageUseAuthorized: true,
          photos: [],
        },
        treatmentPlan: {
          recommendedProcedure: 'Limpeza de pele com etapa calmante e protocolo iluminador.',
          sessionCount: 3,
          sessionInterval: 'A cada 30 dias',
          productsUsed: 'Espuma de limpeza suave, máscara calmante, sérum antioxidante.',
          equipmentsUsed: 'Vapor de ozônio e alta frequência.',
          services: [
            {
              id: 'seed-treatment-service-1',
              name: 'Detox Facial Signature',
              sessions: 3,
              description: 'Etapa principal para higienização profunda, preparo cutâneo e controle da oleosidade.',
              adverseEffects: 'Vermelhidão leve e sensibilidade transitória nas primeiras horas.',
            },
            {
              id: 'seed-treatment-service-2',
              name: 'Peeling iluminador',
              sessions: 2,
              description: 'Complemento focado em viço, textura e uniformização de manchas superficiais.',
              adverseEffects: 'Descamação fina, ardor discreto e maior fotossensibilidade temporária.',
            },
          ],
        },
        scienceTerm: {
          informedHistoryAccurately: true,
          awareOfRisks: true,
          receivedPreAndPostGuidance: true,
        },
        signatures: {
          patientSignatureDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAoMBgNf8Ap8AAAAASUVORK5CYII=',
          professionalSignatureDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAoMBgNf8Ap8AAAAASUVORK5CYII=',
          professionalName: 'Marina Leal',
          signedAt: '2026-04-13',
        },
      },
    },
  })
}

function findAppointment(list, definition, related) {
  const startAt = makeDate(definition.dayOffset, definition.hour, definition.minute).toISOString()
  return list.find(appointment => (
    appointment.clientId === related.client.id &&
    appointment.serviceId === related.service.id &&
    appointment.professionalId === related.professional.id &&
    appointment.startAt === startAt
  ))
}

function appointmentKey(definition, related) {
  return [
    related.client.id,
    related.service.id,
    related.professional.id,
    makeDate(definition.dayOffset, definition.hour, definition.minute).toISOString(),
  ].join(':')
}

async function cleanupStaleDemoAppointments(userId, definitions, lookup) {
  const plannedKeys = new Set(definitions.map(definition => {
    const related = {
      client: lookup.clients[definition.clientName],
      service: lookup.services[definition.serviceName],
      professional: lookup.professionals[definition.professionalName],
    }

    return appointmentKey(definition, related)
  }))

  const existingDemoAppointments = await prisma.appointment.findMany({
    where: {
      userId,
      notes: { startsWith: 'Seed demo' },
    },
    select: {
      id: true,
      clientId: true,
      serviceId: true,
      professionalId: true,
      startAt: true,
    },
  })

  const staleAppointmentIds = existingDemoAppointments
    .filter(appointment => !plannedKeys.has([
      appointment.clientId,
      appointment.serviceId,
      appointment.professionalId,
      appointment.startAt.toISOString(),
    ].join(':')))
    .map(appointment => appointment.id)

  if (!staleAppointmentIds.length) return

  await prisma.payment.deleteMany({
    where: { appointmentId: { in: staleAppointmentIds } },
  })
  await prisma.whatsappLog.deleteMany({
    where: { appointmentId: { in: staleAppointmentIds } },
  })
  await prisma.appointment.deleteMany({
    where: { id: { in: staleAppointmentIds } },
  })
}

async function ensureAppointment(token, userId, definition, related) {
  const existingList = await request('/appointments', { token })
  const match = findAppointment(existingList, definition, related)
  const startAt = makeDate(definition.dayOffset, definition.hour, definition.minute)
  const endAt = addMinutes(startAt, related.service.duration)

  if (match) {
    return match
  }

  const body = {
    clientId: related.client.id,
    serviceId: related.service.id,
    professionalId: related.professional.id,
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    notes: definition.notes,
    price: Number(related.service.price),
    status: definition.status,
  }

  try {
    return await request('/appointments', {
      method: 'POST',
      token,
      body,
    })
  } catch (error) {
    if (error.status !== 423) throw error

    return prisma.appointment.create({
      data: {
        ...body,
        userId,
        startAt,
        endAt,
      },
    })
  }
}

async function ensurePayment(token, appointment, payment) {
  if (!payment) return null
  if (appointment.payment?.status === 'PAID') return appointment.payment

  return request('/payments', {
    method: 'POST',
    token,
    body: {
      appointmentId: appointment.id,
      amount: payment.amount,
      method: payment.method,
      status: payment.status,
    },
  })
}

async function main() {
  const session = await ensureSession()
  const token = session.token
  const userId = session.user.id
  await cleanupLegacyDemoArtifacts(userId)

  const clients = {}
  for (const client of clientsSeed) {
    clients[client.name] = await ensureByName('/clients', token, client)
  }

  const professionals = {}
  for (const professional of professionalsSeed) {
    professionals[professional.name] = await ensureByName('/professionals', token, professional, { updateExisting: true })
  }

  const services = {}
  for (const service of servicesSeed) {
    const { demoWithoutPop, ...servicePayload } = service
    services[service.name] = await ensureByName('/services', token, servicePayload, { updateExisting: true })
    if (demoWithoutPop) {
      await ensureServicePopGap(userId, services[service.name])
    }
  }
  await cleanupLegacyDemoArtifacts(userId)
  await cleanupStaleDemoAppointments(userId, appointmentSeed, { clients, services, professionals })

  for (const client of clientsSeed.slice(0, 3)) {
    await ensureAnamnesis(clients[client.name].id, token, client)
  }

  await ensureConsentRecord({
    token,
    userId,
    client: clients['Sofia Almeida'],
    professional: professionals['Marina Leal'],
    signed: true,
  })
  await ensureConsentRecord({
    token,
    userId,
    client: clients['Sofia Almeida'],
    professional: professionals['Marina Leal'],
    type: 'image',
    signed: true,
  })
  await ensureConsentRecord({
    token,
    userId,
    client: clients['Camila Nogueira'],
    professional: professionals['Ana Clara Rocha'],
    signed: false,
  })
  await ensureConsentRecord({
    token,
    userId,
    client: clients['Helena Duarte'],
    professional: professionals['Ana Clara Rocha'],
    type: 'image',
    signed: false,
  })

  const seededDocuments = []
  for (const document of documentsSeed) {
    seededDocuments.push(await ensureDocument(token, document))
  }

  const seededProfessionalDocuments = []
  for (const document of professionalDocumentsSeed) {
    const professional = professionals[document.professionalName]
    if (professional) {
      seededProfessionalDocuments.push(await ensureProfessionalDocument(token, professional, document))
    }
  }

  const seededProducts = []
  for (const product of productsSeed) {
    seededProducts.push(await ensureInventoryItem('/products', token, product))
  }

  const seededEquipment = []
  for (const equipment of equipmentSeed) {
    seededEquipment.push(await ensureInventoryItem('/equipment', token, equipment))
  }

  const seededBills = []
  for (const bill of clinicBillsSeed) {
    seededBills.push(await ensureClinicBill(token, bill))
  }

  const seededAppointments = []
  for (const definition of appointmentSeed) {
    const related = {
      client: clients[definition.clientName],
      service: services[definition.serviceName],
      professional: professionals[definition.professionalName],
    }

    const appointment = await ensureAppointment(token, userId, definition, related)
    await ensurePayment(token, appointment, definition.payment)
    seededAppointments.push(appointment)
  }

  const dashboard = await request('/dashboard', { token })

  console.log(JSON.stringify({
    baseUrl: BASE_URL,
    credentials: {
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      clinicName: DEMO_CLINIC_NAME,
    },
    seeded: {
      clients: Object.keys(clients).length,
      professionals: Object.keys(professionals).length,
      services: Object.keys(services).length,
      documents: seededDocuments.length,
      professionalDocuments: seededProfessionalDocuments.length,
      products: seededProducts.length,
      equipment: seededEquipment.length,
      bills: seededBills.length,
      appointments: seededAppointments.length,
    },
    dashboard,
  }, null, 2))
}

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
