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

const professionalsSeed = [
  { name: 'Marina Leal', specialty: 'Biomedica esteta', phone: '(11) 97777-8801' },
  { name: 'Ana Clara Rocha', specialty: 'Esteticista facial', phone: '(11) 97777-8802' },
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
    name: 'Design de Sobrancelhas Luxe',
    description: 'Desenho com acabamento delicado e consultoria de manutencao.',
    duration: 45,
    price: 120,
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
    serviceName: 'Design de Sobrancelhas Luxe',
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

function makeDate(dayOffset, hour, minute) {
  const date = new Date()
  date.setDate(date.getDate() + dayOffset)
  date.setHours(hour, minute, 0, 0)
  return date
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

async function ensureByName(path, token, payload) {
  const list = await request(path, { token })
  const existing = list.find(item => item.name === payload.name)
  if (existing) return existing
  return request(path, { method: 'POST', token, body: payload })
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

async function ensureAppointment(token, definition, related) {
  const existingList = await request('/appointments', { token })
  const match = findAppointment(existingList, definition, related)
  const startAt = makeDate(definition.dayOffset, definition.hour, definition.minute)
  const endAt = addMinutes(startAt, related.service.duration)

  if (match) {
    return match
  }

  return request('/appointments', {
    method: 'POST',
    token,
    body: {
      clientId: related.client.id,
      serviceId: related.service.id,
      professionalId: related.professional.id,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      notes: definition.notes,
      price: Number(related.service.price),
      status: definition.status,
    },
  })
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

  const clients = {}
  for (const client of clientsSeed) {
    clients[client.name] = await ensureByName('/clients', token, client)
  }

  const professionals = {}
  for (const professional of professionalsSeed) {
    professionals[professional.name] = await ensureByName('/professionals', token, professional)
  }

  const services = {}
  for (const service of servicesSeed) {
    services[service.name] = await ensureByName('/services', token, service)
  }

  await ensureAnamnesis(clientsSeed[0] ? clients[clientsSeed[0].name].id : null, token, clientsSeed[0])

  const seededAppointments = []
  for (const definition of appointmentSeed) {
    const related = {
      client: clients[definition.clientName],
      service: services[definition.serviceName],
      professional: professionals[definition.professionalName],
    }

    const appointment = await ensureAppointment(token, definition, related)
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
