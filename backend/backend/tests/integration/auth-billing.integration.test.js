const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')
const { execFileSync } = require('child_process')
const dotenv = require('dotenv')
const { PrismaClient } = require('@prisma/client')

const backendRoot = path.resolve(__dirname, '..', '..')
dotenv.config({ path: path.join(backendRoot, '.env') })

const baseDatabaseUrl = process.env.DATABASE_URL
if (!baseDatabaseUrl) {
  throw new Error('DATABASE_URL nao definido para os testes de integracao')
}

const schemaName = `itest_${process.pid}_${Date.now()}`
const testDatabaseUrl = new URL(baseDatabaseUrl)
testDatabaseUrl.searchParams.set('schema', schemaName)

process.env.DATABASE_URL = testDatabaseUrl.toString()
process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-secret'
process.env.SUPPORT_ADMIN_EMAIL = 'support.integration@lappui.local'
process.env.SUPPORT_ADMIN_PASSWORD = 'Aa!@246813579246'
process.env.SUPPORT_ADMIN_NAME = 'Central de suporte teste'
process.env.SUPPORT_CONTACT_EMAIL = 'support.integration@lappui.local'
process.env.SUPPORT_CONTACT_PHONE = '5511999999999'

const prismaCliPath = require.resolve('prisma/build/index.js')
execFileSync(
  process.execPath,
  [prismaCliPath, 'db', 'push', '--schema', path.join(backendRoot, 'prisma', 'schema.prisma'), '--skip-generate'],
  {
    cwd: backendRoot,
    env: { ...process.env, DATABASE_URL: testDatabaseUrl.toString() },
    stdio: 'pipe',
  }
)

const { app, prisma } = require('../../server')

let server
let baseUrl
let adminPrisma
let clinicToken
let clinicUserId
let clinicAggregateId
let supportToken
let assumedClinicToken

async function request(method, route, options = {}) {
  const headers = { Accept: 'application/json' }

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`
  }

  const response = await fetch(baseUrl + route, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })

  const contentType = response.headers.get('content-type') || ''
  let data

  if (options.expectBinary) {
    data = Buffer.from(await response.arrayBuffer())
  } else {
    data = contentType.includes('application/json')
      ? await response.json()
      : await response.text()
  }

  return {
    status: response.status,
    data,
    contentType,
  }
}

test.before(async () => {
  server = app.listen(0)
  await new Promise(resolve => server.once('listening', resolve))

  const address = server.address()
  baseUrl = `http://127.0.0.1:${address.port}`
  adminPrisma = new PrismaClient({
    datasources: {
      db: {
        url: baseDatabaseUrl,
      },
    },
  })
})

test.after(async () => {
  await prisma.$disconnect()

  if (server) {
    await new Promise((resolve, reject) => {
      server.close(error => {
        if (error) reject(error)
        else resolve()
      })
    })
  }

  if (adminPrisma) {
    await adminPrisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`)
    await adminPrisma.$disconnect()
  }
})

test('clinic registration creates aggregate records and register audit log', async () => {
  const registerResponse = await request('POST', '/auth/register', {
    body: {
      email: 'clinica.integration@lappui.local',
      password: 'Aa!@246813579246',
      clinicName: 'Clinica Integracao',
    },
  })

  assert.equal(registerResponse.status, 201)
  assert.equal(registerResponse.data.user.clinicName, 'Clinica Integracao')
  assert.equal(registerResponse.data.user.billing.status, 'TRIAL')
  assert.equal(registerResponse.data.user.clinicStatus, 'ACTIVE')
  assert.ok(registerResponse.data.user.clinicId)

  clinicToken = registerResponse.data.token
  clinicUserId = registerResponse.data.user.id
  clinicAggregateId = registerResponse.data.user.clinicId

  const storedUser = await prisma.user.findUnique({
    where: { id: clinicUserId },
    include: {
      ownedClinic: {
        include: {
          subscription: true,
        },
      },
    },
  })

  assert.ok(storedUser?.ownedClinic)
  assert.equal(storedUser.ownedClinic.id, clinicAggregateId)
  assert.ok(storedUser.ownedClinic.subscription)
  assert.equal(storedUser.ownedClinic.subscription.status, 'TRIAL')

  const registerLog = await prisma.auditLog.findFirst({
    where: {
      clinicId: clinicAggregateId,
      action: 'AUTH_REGISTER',
    },
  })

  assert.ok(registerLog)

  const summaryResponse = await request('GET', '/billing/summary', { token: clinicToken })
  assert.equal(summaryResponse.status, 200)
  assert.equal(summaryResponse.data.permissions.canManageSubscription, false)

  const deniedResponse = await request('PUT', '/billing/config', {
    token: clinicToken,
    body: {
      amount: 299,
      nextDueAt: '2026-05-17',
      reference: 'Plano Pro',
    },
  })

  assert.equal(deniedResponse.status, 403)
})

test('clinic login rejects unknown email and wrong password', async () => {
  const unknownEmailResponse = await request('POST', '/auth/login', {
    body: {
      email: 'desconhecido@lappui.local',
      password: 'Aa!@246813579246',
    },
  })

  assert.equal(unknownEmailResponse.status, 404)

  const wrongPasswordResponse = await request('POST', '/auth/login', {
    body: {
      email: 'clinica.integration@lappui.local',
      password: 'Aa!@246813579247',
    },
  })

  assert.equal(wrongPasswordResponse.status, 401)
})

test('support can authenticate, list clinics, and assume a clinic session', async () => {
  const supportLoginResponse = await request('POST', '/auth/login', {
    body: {
      email: 'support.integration@lappui.local',
      password: 'Aa!@246813579246',
    },
  })

  assert.equal(supportLoginResponse.status, 200)
  assert.equal(supportLoginResponse.data.user.role, 'SUPPORT')

  supportToken = supportLoginResponse.data.token

  const clinicsResponse = await request('GET', '/support/clinics', { token: supportToken })
  assert.equal(clinicsResponse.status, 200)
  assert.ok(
    clinicsResponse.data.clinics.some(clinic => clinic.id === clinicUserId && clinic.clinicId === clinicAggregateId)
  )

  const directConfigResponse = await request('PUT', '/billing/config', {
    token: supportToken,
    body: {
      amount: 399,
    },
  })

  assert.equal(directConfigResponse.status, 409)

  const assumeResponse = await request('POST', '/support/assume', {
    token: supportToken,
    body: { userId: clinicUserId },
  })

  assert.equal(assumeResponse.status, 200)
  assert.equal(assumeResponse.data.user.supportContext.active, true)
  assert.equal(assumeResponse.data.user.clinicId, clinicAggregateId)

  assumedClinicToken = assumeResponse.data.token

  const assumeLog = await prisma.auditLog.findFirst({
    where: {
      clinicId: clinicAggregateId,
      action: 'SUPPORT_ASSUME_CLINIC',
    },
  })

  assert.ok(assumeLog)

  const assumedSummary = await request('GET', '/billing/summary', { token: assumedClinicToken })
  assert.equal(assumedSummary.status, 200)
  assert.equal(assumedSummary.data.permissions.canManageSubscription, true)
})

test('assumed support can configure billing, mark payment, and consult audit logs', async () => {
  const configResponse = await request('PUT', '/billing/config', {
    token: assumedClinicToken,
    body: {
      amount: 349.9,
      nextDueAt: '2026-05-17',
      reference: 'Plano Signature',
      notes: 'Teste de integracao da assinatura',
    },
  })

  assert.equal(configResponse.status, 200)
  assert.equal(configResponse.data.billing.reference, 'Plano Signature')
  assert.equal(String(configResponse.data.billing.amount), '349.9')

  const configuredSubscription = await prisma.clinicSubscription.findUnique({
    where: { clinicId: clinicAggregateId },
  })

  assert.ok(configuredSubscription)
  assert.equal(configuredSubscription.reference, 'Plano Signature')

  const configLog = await prisma.auditLog.findFirst({
    where: {
      clinicId: clinicAggregateId,
      action: 'BILLING_CONFIG_UPDATED',
    },
  })

  assert.ok(configLog)

  const markPaidResponse = await request('POST', '/billing/mark-paid', {
    token: assumedClinicToken,
    body: {
      amount: 349.9,
      nextDueAt: '2026-07-21',
    },
  })

  assert.equal(markPaidResponse.status, 200)
  assert.equal(markPaidResponse.data.billing.effectiveStatus, 'ACTIVE')
  assert.equal(markPaidResponse.data.billing.blocked, false)

  const paidSubscription = await prisma.clinicSubscription.findUnique({
    where: { clinicId: clinicAggregateId },
  })

  assert.ok(paidSubscription)
  assert.equal(paidSubscription.status, 'ACTIVE')

  const paidLog = await prisma.auditLog.findFirst({
    where: {
      clinicId: clinicAggregateId,
      action: 'BILLING_MARKED_PAID',
    },
  })

  assert.ok(paidLog)

  const summaryResponse = await request('GET', '/billing/summary', { token: assumedClinicToken })
  assert.equal(summaryResponse.status, 200)
  assert.equal(summaryResponse.data.billing.effectiveStatus, 'ACTIVE')
  assert.equal(String(summaryResponse.data.billing.amount), '349.9')

  const auditLogsResponse = await request('GET', '/clinic/audit-logs?limit=10', { token: assumedClinicToken })
  assert.equal(auditLogsResponse.status, 200)

  const actions = auditLogsResponse.data.logs.map(log => log.action)
  assert.ok(actions.includes('AUTH_REGISTER'))
  assert.ok(actions.includes('SUPPORT_ASSUME_CLINIC'))
  assert.ok(actions.includes('BILLING_CONFIG_UPDATED'))
  assert.ok(actions.includes('BILLING_MARKED_PAID'))
})

test('clinic can save and retrieve the structured anamnesis with classified evaluation and protocol services', async () => {
  const clientResponse = await request('POST', '/clients', {
    token: clinicToken,
    body: {
      name: 'Paciente Estruturada',
      phone: '11995554433',
      email: 'paciente.estruturada@lappui.local',
      birthDate: '1992-08-12',
      cpf: '21455598010',
    },
  })

  assert.equal(clientResponse.status, 201)

  const clientId = clientResponse.data.id
  const signatureDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAoMBgNf8Ap8AAAAASUVORK5CYII='

  const saveResponse = await request('POST', `/clients/${clientId}/anamnesis`, {
    token: clinicToken,
    body: {
      answers: {
        identification: {
          fullName: 'Paciente Estruturada',
          cpf: '21455598010',
          birthDate: '1992-08-12',
          age: 33,
          sex: 'FEMININO',
          maritalStatus: 'SOLTEIRO',
          profession: 'Arquiteta',
          phone: '11995554433',
          email: 'paciente.estruturada@lappui.local',
          addressFull: 'Rua das Flores, 210 - São Paulo/SP',
        },
        chiefComplaint: {
          desiredProcedure: 'Microagulhamento facial',
          currentDiscomfort: 'Textura irregular e manchas pós-inflamatórias em região facial.',
          complaintDuration: 'Há aproximadamente 10 meses',
          previousTreatment: 'Já realizou limpeza de pele e peeling superficial.',
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
            otherConditions: 'Acompanhamento hormonal regular.',
          },
          surgeries: {
            hadSurgeries: false,
            surgeryDetails: '',
            approximateDate: '',
            hadComplications: false,
          },
          medications: {
            continuousMedication: true,
            medicationDetails: 'Anticoncepcional oral.',
            anticoagulants: false,
            corticosteroids: false,
            recentAntibiotics: false,
          },
          allergies: {
            hasAllergies: true,
            medicationAllergy: false,
            cosmeticsAllergy: true,
            anestheticsAllergy: false,
            notes: 'Sensibilidade a cosméticos com fragrância.',
          },
          dermatologicalHistory: {
            activeAcne: true,
            rosacea: false,
            melasma: true,
            skinSensitivity: true,
            keloidTendency: false,
          },
          aestheticHistory: [
            {
              id: 'hist-1',
              procedureName: 'Peeling químico superficial',
              procedureDate: '2025-11-08',
              notes: 'Melhora parcial de textura.',
              intercurrences: '',
            },
          ],
        },
        lifestyle: {
          smoking: false,
          alcoholConsumption: true,
          alcoholFrequency: 'SOCIAL',
          dailyWaterIntake: '2 litros ao dia',
          diet: 'Equilibrada',
          physicalActivity: true,
          workoutsPerWeek: 4,
          sleepQuality: 'BOA',
        },
        aestheticEvaluation: {
          skinType: 'MISTA',
          fitzpatrick: 'III',
          conditions: [
            {
              type: 'acne',
              label: 'Acne',
              present: true,
              classification: 'Grau II',
              notes: 'Predomínio em região mandibular.',
            },
            {
              type: 'melasma',
              label: 'Melasma',
              present: true,
              classification: 'Moderado',
              notes: 'Maior intensidade em região malar.',
            },
          ],
        },
        contraindications: {
          pregnancy: false,
          lactation: false,
          activeInfections: false,
          recentIsotretinoin: false,
          activeDermatologicalDiseases: false,
          metallicImplants: false,
          additionalNotes: 'Fotoproteção reforçada entre as sessões.',
        },
        expectations: {
          treatmentExpectations: 'Reduzir a aparência das manchas e uniformizar a pele.',
          expectedResultTimeline: 'Até 12 semanas',
          awareOfLimitations: true,
        },
        treatmentObjective: 'Atenuar melasma e reduzir acne inflamatória em região facial.',
        photoRecord: {
          photos: [],
          imageUseAuthorized: true,
        },
        treatmentPlan: {
          recommendedProcedure: 'Protocolo combinado de microagulhamento e peeling sequencial.',
          sessionCount: 6,
          sessionInterval: 'Quinzenal',
          productsUsed: 'Sérum antioxidante e máscara calmante.',
          equipmentsUsed: 'Caneta de microagulhamento.',
          services: [
            {
              id: 'service-1',
              name: 'Microagulhamento facial',
              sessions: 4,
              description: 'Sessões focadas em textura, cicatrizes leves e estímulo dérmico.',
              adverseEffects: 'Vermelhidão transitória, leve sensibilidade e descamação controlada.',
            },
            {
              id: 'service-2',
              name: 'Peeling iluminador',
              sessions: 2,
              description: 'Complemento para uniformização do tom e controle das manchas.',
              adverseEffects: 'Ardor leve, hiperemia discreta e fotossensibilidade temporária.',
            },
          ],
        },
        scienceTerm: {
          informedHistoryAccurately: true,
          awareOfRisks: true,
          receivedPreAndPostGuidance: true,
        },
        signatures: {
          patientSignatureDataUrl: signatureDataUrl,
          professionalSignatureDataUrl: signatureDataUrl,
          professionalName: 'Profissional Integração',
          signedAt: '2026-04-18',
        },
      },
    },
  })

  assert.equal(saveResponse.status, 201)

  const historyResponse = await request('GET', `/clients/${clientId}/anamnesis`, { token: clinicToken })
  assert.equal(historyResponse.status, 200)
  assert.equal(historyResponse.data.length, 1)

  const storedAnswers = historyResponse.data[0].answers
  assert.equal(storedAnswers.lifestyle.workoutsPerWeek, 4)
  assert.equal(storedAnswers.healthHistory.aestheticHistory.length, 1)
  assert.equal(storedAnswers.aestheticEvaluation.conditions.length >= 2, true)
  assert.equal(storedAnswers.aestheticEvaluation.conditions.find(item => item.type === 'acne').classification, 'Grau II')
  assert.equal(storedAnswers.aestheticEvaluation.conditions.find(item => item.type === 'melasma').classification, 'Moderado')
  assert.equal(storedAnswers.treatmentObjective, 'Atenuar melasma e reduzir acne inflamatória em região facial.')
  assert.equal(storedAnswers.treatmentPlan.services.length, 2)
  assert.equal(storedAnswers.treatmentPlan.services[0].sessions, 4)
  assert.match(storedAnswers.treatmentPlan.services[0].adverseEffects, /Vermelhidão transitória/i)

  const storedClient = await prisma.client.findUnique({ where: { id: clientId } })
  assert.ok(storedClient)
  assert.equal(storedClient.profession, 'Arquiteta')
  assert.equal(storedClient.addressFull, 'Rua das Flores, 210 - São Paulo/SP')
})

test('paid payment locks the prontuario and blocks sensitive edits while keeping PDF download available', async () => {
  const clientResponse = await request('POST', '/clients', {
    token: clinicToken,
    body: {
      name: 'Paciente Bloqueio',
      phone: '11998887766',
      email: 'paciente.bloqueio@lappui.local',
      birthDate: '1991-03-09',
      cpf: '52998224725',
    },
  })

  assert.equal(clientResponse.status, 201)

  const clientId = clientResponse.data.id
  const signatureDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAoMBgNf8Ap8AAAAASUVORK5CYII='
  const anamnesisPayload = {
    answers: {
      identification: {
        fullName: 'Paciente Bloqueio',
        cpf: '52998224725',
        birthDate: '1991-03-09',
        phone: '11998887766',
        email: 'paciente.bloqueio@lappui.local',
      },
      chiefComplaint: {
        currentDiscomfort: 'Busca controle de oleosidade e melhora de textura.',
      },
      healthHistory: {
        preExistingConditions: {},
        surgeries: {},
        medications: {},
        allergies: {},
        dermatologicalHistory: {},
        aestheticHistory: [],
      },
      lifestyle: {
        workoutsPerWeek: 2,
      },
      aestheticEvaluation: {
        conditions: [],
      },
      contraindications: {},
      expectations: {},
      photoRecord: {
        photos: [],
        imageUseAuthorized: false,
      },
      treatmentPlan: {
        services: [
          {
            id: 'service-lock-1',
            name: 'Peeling renovador',
            sessions: 3,
            description: 'Protocolo com foco em vico e textura.',
            adverseEffects: 'Ardencia leve e sensibilidade transitoria.',
          },
        ],
      },
      scienceTerm: {
        informedHistoryAccurately: true,
        awareOfRisks: true,
        receivedPreAndPostGuidance: true,
      },
      signatures: {
        patientSignatureDataUrl: signatureDataUrl,
        professionalSignatureDataUrl: signatureDataUrl,
        professionalName: 'Profissional Bloqueio',
        signedAt: '2026-04-19',
      },
    },
  }

  const saveResponse = await request('POST', `/clients/${clientId}/anamnesis`, {
    token: clinicToken,
    body: anamnesisPayload,
  })

  assert.equal(saveResponse.status, 201)

  const service = await prisma.service.create({
    data: {
      userId: clinicUserId,
      name: 'Peeling renovador',
      duration: 60,
      price: 280,
    },
  })

  const professional = await prisma.professional.create({
    data: {
      userId: clinicUserId,
      name: 'Profissional Bloqueio',
      specialty: 'Estetica facial',
      active: true,
    },
  })

  const appointmentResponse = await request('POST', '/appointments', {
    token: clinicToken,
    body: {
      clientId,
      serviceId: service.id,
      professionalId: professional.id,
      startAt: '2026-04-19T13:00:00.000Z',
      endAt: '2026-04-19T14:00:00.000Z',
      price: 280,
      status: 'CONFIRMED',
    },
  })

  assert.equal(appointmentResponse.status, 201)

  const paymentResponse = await request('POST', '/payments', {
    token: clinicToken,
    body: {
      appointmentId: appointmentResponse.data.id,
      amount: 280,
      method: 'PIX',
      status: 'PAID',
    },
  })

  assert.equal(paymentResponse.status, 201)

  const lockedClient = await prisma.client.findUnique({ where: { id: clientId } })
  assert.equal(lockedClient.isPaid, true)
  assert.equal(lockedClient.isLocked, true)
  assert.ok(lockedClient.lockedAt)

  const lockedClientResponse = await request('GET', `/clients/${clientId}`, { token: clinicToken })
  assert.equal(lockedClientResponse.status, 200)
  assert.equal(lockedClientResponse.data.isLocked, true)

  const updateClientResponse = await request('PUT', `/clients/${clientId}`, {
    token: clinicToken,
    body: {
      notes: 'Tentativa de alteracao apos pagamento.',
    },
  })
  assert.equal(updateClientResponse.status, 423)

  const updateAnamnesisResponse = await request('POST', `/clients/${clientId}/anamnesis`, {
    token: clinicToken,
    body: anamnesisPayload,
  })
  assert.equal(updateAnamnesisResponse.status, 423)

  const updateAppointmentResponse = await request('PUT', `/appointments/${appointmentResponse.data.id}`, {
    token: clinicToken,
    body: {
      notes: 'Nao deveria editar apos pagamento.',
    },
  })
  assert.equal(updateAppointmentResponse.status, 423)

  const deleteAppointmentResponse = await request('DELETE', `/appointments/${appointmentResponse.data.id}`, {
    token: clinicToken,
  })
  assert.equal(deleteAppointmentResponse.status, 423)

  const consentResponse = await request('POST', `/clients/${clientId}/consent-records/generate-default`, {
    token: clinicToken,
    body: {},
  })
  assert.equal(consentResponse.status, 423)

  const pdfResponse = await request('GET', `/clients/${clientId}/prontuario/pdf`, {
    token: clinicToken,
    expectBinary: true,
  })

  assert.equal(pdfResponse.status, 200)
  assert.match(pdfResponse.contentType, /application\/pdf/i)
  assert.ok(pdfResponse.data.length > 100)
  assert.equal(pdfResponse.data.subarray(0, 4).toString('ascii'), '%PDF')
})

test('Stripe billing integration flow generates intent and processes checkout webhook successfully', async () => {
  const prevProvider = process.env.BILLING_GATEWAY_PROVIDER
  const prevStripeKey = process.env.STRIPE_SECRET_KEY
  const prevWebhookSecret = process.env.BILLING_WEBHOOK_SECRET

  process.env.BILLING_GATEWAY_PROVIDER = 'STRIPE'
  process.env.STRIPE_SECRET_KEY = 'sk_test_integration'
  process.env.BILLING_WEBHOOK_SECRET = 'whsec_test_integration'

  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith('https://api.stripe.com')) {
      return {
        ok: true,
        text: async () => '',
        json: async () => ({
          id: 'cs_test_session_123',
          url: 'https://checkout.stripe.com/pay/cs_test_session_123',
        }),
      }
    }
    return originalFetch(url, options)
  }

  try {
    const intentResponse = await request('POST', '/billing/gateway/intents', {
      token: clinicToken,
      body: {
        method: 'CREDIT_CARD',
        amount: 199.90,
        dueAt: '2026-07-01',
      },
    })

    assert.equal(intentResponse.status, 201)
    const intent = intentResponse.data.intent
    assert.equal(intent.provider, 'STRIPE')
    assert.equal(intent.providerPaymentId, 'cs_test_session_123')
    assert.equal(intent.checkoutUrl, 'https://checkout.stripe.com/pay/cs_test_session_123')

    const eventBody = {
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_session_123',
          amount_total: 19990,
          metadata: {
            reference: intent.reference,
          },
        },
      },
    }

    const rawBodyText = JSON.stringify(eventBody)
    const timestamp = Math.floor(Date.now() / 1000)
    const signaturePayload = timestamp + '.' + rawBodyText

    const crypto = require('crypto')
    const computedSig = crypto
      .createHmac('sha256', 'whsec_test_integration')
      .update(signaturePayload)
      .digest('hex')

    const stripeHeader = 't=' + timestamp + ',v1=' + computedSig

    const webhookRes = await fetch(baseUrl + '/webhooks/billing', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Stripe-Signature': stripeHeader,
      },
      body: rawBodyText,
    })

    assert.equal(webhookRes.status, 200)
    const webhookData = await webhookRes.json()
    assert.equal(webhookData.ok, true)
    assert.equal(webhookData.intent.status, 'PAID')
    assert.equal(webhookData.billing.effectiveStatus, 'ACTIVE')

    const clinicSub = await prisma.clinicSubscription.findUnique({
      where: { clinicId: clinicAggregateId },
    })
    assert.equal(clinicSub.status, 'ACTIVE')
    assert.equal(clinicSub.reference, intent.reference)
  } finally {
    globalThis.fetch = originalFetch
    process.env.BILLING_GATEWAY_PROVIDER = prevProvider
    process.env.STRIPE_SECRET_KEY = prevStripeKey
    process.env.BILLING_WEBHOOK_SECRET = prevWebhookSecret
  }
})

