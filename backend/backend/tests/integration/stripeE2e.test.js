const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')
const { execFileSync } = require('child_process')
const dotenv = require('dotenv')
const { PrismaClient } = require('@prisma/client')
const crypto = require('crypto')

const backendRoot = path.resolve(__dirname, '..', '..')
dotenv.config({ path: path.join(backendRoot, '.env') })

const baseDatabaseUrl = process.env.DATABASE_URL
if (!baseDatabaseUrl) {
  throw new Error('DATABASE_URL nao definido para os testes de integracao')
}

const schemaName = `itest_stripe_${process.pid}_${Date.now()}`
const testDatabaseUrl = new URL(baseDatabaseUrl)
testDatabaseUrl.searchParams.set('schema', schemaName)

process.env.DATABASE_URL = testDatabaseUrl.toString()
process.env.JWT_SECRET = 'stripe-integration-test-secret'
process.env.BILLING_WEBHOOK_SECRET = 'whsec_stripe_integration_secret_test_32_chars'
process.env.BILLING_GATEWAY_PROVIDER = 'STRIPE'
process.env.STRIPE_SECRET_KEY = 'sk_test_stripe_integration'

// Inicializa o esquema de teste no banco
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
const { buildMetaSignature } = require('../../src/legacy/billingGateway')

let server
let baseUrl
let adminPrisma
let clinicToken
let clinicUserId
let clinicId

async function request(method, route, options = {}) {
  const headers = { Accept: 'application/json' }

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`
  }

  if (options.headers) {
    Object.assign(headers, options.headers)
  }

  const response = await fetch(baseUrl + route, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })

  const contentType = response.headers.get('content-type') || ''
  let data

  if (contentType.includes('application/json')) {
    data = await response.json()
  } else {
    data = await response.text()
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

test('Stripe E2E flow: creates checkout session, processes completed webhook and activates subscription', async () => {
  // 1. Registrar nova clínica
  const registerRes = await request('POST', '/auth/register', {
    body: {
      email: 'clinica.stripe.e2e@lappui.local',
      password: 'Aa!@246813579246',
      clinicName: 'Clínica Stripe E2E',
    },
  })

  assert.equal(registerRes.status, 201)
  clinicToken = registerRes.data.token
  clinicUserId = registerRes.data.user.id
  clinicId = registerRes.data.user.clinicId

  // Mock global fetch para interceptar chamada da API do Stripe
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith('https://api.stripe.com')) {
      return {
        ok: true,
        text: async () => '',
        json: async () => ({
          id: 'cs_test_session_stripe_e2e_456',
          url: 'https://checkout.stripe.com/pay/cs_test_session_stripe_e2e_456',
        }),
      }
    }
    return originalFetch(url, options)
  }

  // 2. Criar intenção de faturamento (Simula o clique em "Gerar cobrança")
  const intentRes = await request('POST', '/billing/gateway/intents', {
    token: clinicToken,
    body: {
      method: 'CREDIT_CARD',
      amount: 199.90,
      dueAt: '2026-07-01',
    },
  })

  // Restaura o fetch global
  globalThis.fetch = originalFetch

  assert.equal(intentRes.status, 201)
  const reference = intentRes.data.intent.reference
  assert.ok(reference)
  assert.equal(intentRes.data.intent.provider, 'STRIPE')
  assert.equal(intentRes.data.intent.checkoutUrl, 'https://checkout.stripe.com/pay/cs_test_session_stripe_e2e_456')

  // 3. Simular evento de checkout concluído vindo do Stripe no webhook
  const rawWebhookBody = JSON.stringify({
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_session_stripe_e2e_456',
        amount_total: 19990, // centavos
        metadata: {
          reference: reference,
          clinicId: String(clinicId),
        },
      },
    },
  })

  // Gerar assinatura digital legítima do Stripe
  const timestamp = Math.floor(Date.now() / 1000)
  const signaturePayload = timestamp + '.' + rawWebhookBody
  const secret = process.env.BILLING_WEBHOOK_SECRET
  const computedSig = crypto
    .createHmac('sha256', secret)
    .update(signaturePayload)
    .digest('hex')
  const stripeHeader = 't=' + timestamp + ',v1=' + computedSig

  const webhookRes = await request('POST', '/webhooks/billing', {
    headers: {
      'Stripe-Signature': stripeHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.parse(rawWebhookBody),
  })

  assert.equal(webhookRes.status, 200)
  assert.equal(webhookRes.data.ok, true)
  assert.equal(webhookRes.data.intent.status, 'PAID')

  // 4. Verificar no banco de dados se a assinatura foi ativada
  const updatedSubscription = await prisma.clinicSubscription.findUnique({
    where: { clinicId: clinicId },
  })
  assert.ok(updatedSubscription)
  assert.equal(updatedSubscription.status, 'ACTIVE')
  assert.equal(updatedSubscription.reference, reference)

  // 5. Verificar se o log de auditoria foi gravado corretamente
  const auditLog = await prisma.auditLog.findFirst({
    where: {
      clinicId: clinicId,
      action: 'SUPPORT_ASSUME_CLINIC', // do assume anterior ou checkout
    },
  })
  const billingLog = await prisma.auditLog.findFirst({
    where: {
      clinicId: clinicId,
      action: 'BILLING_GATEWAY_PAYMENT_CONFIRMED',
    },
  })
  assert.ok(billingLog)
  assert.equal(billingLog.actorEmail, 'stripe-webhook')
  assert.equal(billingLog.actorRole, 'GATEWAY')
})
