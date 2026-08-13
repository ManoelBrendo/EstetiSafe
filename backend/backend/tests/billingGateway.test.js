const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildBillingGatewayReadiness,
  buildIntentPayload,
  createGatewayReference,
  getLatestGatewayIntent,
  verifyStripeSignature,
  createStripeCheckoutSession,
} = require('../src/legacy/billingGateway')

function withGatewayProvider(provider, callback) {
  const previousProvider = process.env.BILLING_GATEWAY_PROVIDER
  process.env.BILLING_GATEWAY_PROVIDER = provider

  try {
    return callback()
  } finally {
    if (previousProvider === undefined) {
      delete process.env.BILLING_GATEWAY_PROVIDER
    } else {
      process.env.BILLING_GATEWAY_PROVIDER = previousProvider
    }
  }
}

test('createGatewayReference builds traceable billing references', () => {
  const reference = createGatewayReference(42)

  assert.match(reference, /^LAPPUI-42-[A-Z0-9]+-[A-F0-9]{6}$/)
})

test('buildIntentPayload creates a pending Pix intent with safe defaults', () => {
  withGatewayProvider('TEST_GATEWAY', () => {
    const dueAt = new Date('2026-05-10T12:00:00.000Z')
    const intent = buildIntentPayload({
      clinicId: 7,
      amount: 123.456,
      dueAt,
      reference: 'LAPPUI-7-ABC-123456',
    })

    assert.equal(intent.provider, 'TEST_GATEWAY')
    assert.equal(intent.clinicId, 7)
    assert.equal(intent.amount, 123.46)
    assert.equal(intent.currency, 'BRL')
    assert.equal(intent.status, 'PENDING')
    assert.equal(intent.paymentMethod, 'PIX')
    assert.equal(intent.dueAt, '2026-05-10T12:00:00.000Z')
    assert.equal(intent.expiresAt, '2026-05-11T12:00:00.000Z')
    assert.equal(intent.pixCopyPaste, 'COBRANCA_PENDENTE_GATEWAY_REAL_LAPPUI-7-ABC-123456')
    assert.equal(intent.checkoutUrl, null)
  })
})

test('buildIntentPayload does not create Pix copy-paste data for card intents', () => {
  const intent = buildIntentPayload({
    clinicId: 8,
    amount: 250,
    dueAt: '2026-05-12T09:30:00.000Z',
    method: 'CREDIT_CARD',
    reference: 'LAPPUI-8-DEF-654321',
  })

  assert.equal(intent.paymentMethod, 'CREDIT_CARD')
  assert.equal(intent.pixCopyPaste, null)
})

test('getLatestGatewayIntent prefers persisted gateway intent records', async () => {
  let findFirstArgs = null
  const createdAt = new Date('2026-05-01T10:00:00.000Z')
  const dueAt = new Date('2026-05-05T10:00:00.000Z')

  const prisma = {
    billingGatewayIntent: {
      findFirst: async (args) => {
        findFirstArgs = args
        return {
          id: 99,
          provider: 'TEST_GATEWAY',
          reference: 'LAPPUI-9-PERSISTED-ABC123',
          clinicId: 9,
          amount: '199.90',
          currency: 'BRL',
          status: 'PAID',
          method: 'PIX',
          dueAt,
          expiresAt: new Date('2026-05-06T10:00:00.000Z'),
          checkoutUrl: null,
          pixCopyPaste: 'PIX_DATA',
          providerPaymentId: 'PAY_123',
          paidAt: new Date('2026-05-04T10:00:00.000Z'),
          createdAt,
          payload: { message: 'Persisted intent' },
          events: [{ id: 1 }, { id: 2 }],
        }
      },
    },
    auditLog: {
      findFirst: async () => {
        throw new Error('audit log fallback should not be used when a record exists')
      },
    },
  }

  const result = await getLatestGatewayIntent({ prisma, clinicId: 9 })

  assert.deepEqual(findFirstArgs.where, { clinicId: 9 })
  assert.deepEqual(findFirstArgs.include, { events: true })
  assert.deepEqual(findFirstArgs.orderBy, { createdAt: 'desc' })
  assert.equal(result.reference, 'LAPPUI-9-PERSISTED-ABC123')
  assert.equal(result.amount, 199.9)
  assert.equal(result.status, 'PAID')
  assert.equal(result.paymentMethod, 'PIX')
  assert.equal(result.message, 'Persisted intent')
  assert.equal(result.eventCount, 2)
})

test('getLatestGatewayIntent falls back to audit logs when gateway tables are missing', async () => {
  let auditLogArgs = null
  const missingTableError = new Error('billing_gateway_intents table does not exist')
  missingTableError.code = 'P2021'

  const prisma = {
    billingGatewayIntent: {
      findFirst: async () => {
        throw missingTableError
      },
    },
    auditLog: {
      findFirst: async (args) => {
        auditLogArgs = args
        return {
          clinicId: 11,
          entityId: 'LAPPUI-11-AUDIT-ABC123',
          createdAt: new Date('2026-05-02T10:00:00.000Z'),
          metadata: {
            intent: {
              provider: 'AUDIT_GATEWAY',
              reference: 'LAPPUI-11-AUDIT-ABC123',
              clinicId: 11,
              amount: '89.90',
              currency: 'BRL',
              status: 'FAILED',
              paymentMethod: 'BANK_TRANSFER',
              dueAt: '2026-05-03T10:00:00.000Z',
              expiresAt: '2026-05-04T10:00:00.000Z',
              providerPaymentId: 'AUDIT_PAY_1',
            },
          },
        }
      },
    },
  }

  const result = await getLatestGatewayIntent({ prisma, clinicId: 11 })

  assert.equal(auditLogArgs.where.clinicId, 11)
  assert.deepEqual(auditLogArgs.orderBy, { createdAt: 'desc' })
  assert.equal(result.provider, 'AUDIT_GATEWAY')
  assert.equal(result.reference, 'LAPPUI-11-AUDIT-ABC123')
  assert.equal(result.amount, 89.9)
  assert.equal(result.status, 'FAILED')
  assert.equal(result.paymentMethod, 'BANK_TRANSFER')
  assert.equal(result.providerPaymentId, 'AUDIT_PAY_1')
})

test('getLatestGatewayIntent returns null without a clinic id', async () => {
  const result = await getLatestGatewayIntent({
    prisma: {
      billingGatewayIntent: {
        findFirst: async () => {
          throw new Error('should not query without clinic id')
        },
      },
    },
    clinicId: null,
  })

  assert.equal(result, null)
})

test('buildBillingGatewayReadiness exposes missing live-provider requirements safely', () => {
  const readiness = buildBillingGatewayReadiness({
    env: {},
    persistence: 'audit_log_fallback',
  })

  assert.equal(readiness.status, 'SIMULATION')
  assert.equal(readiness.configured, false)
  assert.equal(readiness.readyForLiveProvider, false)
  assert.deepEqual(readiness.supportedMethods, ['PIX', 'CREDIT_CARD', 'BANK_TRANSFER'])
  assert.ok(readiness.missing.includes('BILLING_GATEWAY_PROVIDER'))
  assert.ok(readiness.missing.includes('BILLING_WEBHOOK_SECRET'))
  assert.ok(readiness.missing.includes('billing_gateway_intents/billing_gateway_events'))
})

test('buildBillingGatewayReadiness marks live provider as ready when critical pieces exist', () => {
  const readiness = buildBillingGatewayReadiness({
    env: {
      BILLING_GATEWAY_PROVIDER: 'STRIPE',
      BILLING_WEBHOOK_SECRET: 'secret',
      BILLING_AUTOMATION_ENABLED: 'true',
    },
    persistence: 'database',
  })

  assert.equal(readiness.status, 'READY')
  assert.equal(readiness.configured, true)
  assert.equal(readiness.readyForLiveProvider, true)
  assert.equal(readiness.webhookConfigured, true)
  assert.equal(readiness.automaticBillingEnabled, true)
  assert.deepEqual(readiness.missing, [])
})

test('verifyStripeSignature returns true for valid signatures and false otherwise', () => {
  const secret = 'whsec_test_secret'
  const rawBody = Buffer.from('{"id":"evt_123"}', 'utf8')
  const timestamp = Math.floor(Date.now() / 1000)
  
  const signaturePayload = timestamp + '.' + rawBody.toString('utf8')
  const crypto = require('crypto')
  const computed = crypto
    .createHmac('sha256', secret)
    .update(signaturePayload)
    .digest('hex')

  const validHeader = 't=' + timestamp + ',v1=' + computed
  
  assert.equal(verifyStripeSignature(rawBody, validHeader, secret), true)
  assert.equal(verifyStripeSignature(rawBody, validHeader, 'wrong_secret'), false)
  assert.equal(verifyStripeSignature(rawBody, 't=' + timestamp + ',v1=wrong_sig', secret), false)
  assert.equal(verifyStripeSignature(null, validHeader, secret), false)
})

test('createStripeCheckoutSession rejects when key is missing', async () => {
  await assert.rejects(
    createStripeCheckoutSession({
      amount: 100,
      dueAt: new Date(),
      reference: 'REF',
      clinicId: 1,
      env: {},
    }),
    /STRIPE_SECRET_KEY/
  )
})

test('createStripeCheckoutSession performs a mock fetch call and returns session details when successful', async () => {
  const originalFetch = globalThis.fetch
  let fetchedUrl = null
  let fetchedOptions = null

  globalThis.fetch = async (url, options) => {
    fetchedUrl = url
    fetchedOptions = options
    return {
      ok: true,
      text: async () => '',
      json: async () => ({
        id: 'cs_test_123',
        url: 'https://checkout.stripe.com/c/pay/cs_test_123',
      }),
    }
  }

  try {
    const res = await createStripeCheckoutSession({
      amount: 150.5,
      dueAt: new Date('2026-06-10T00:00:00.000Z'),
      reference: 'LAPPUI-7-TEST-REF',
      clinicId: 7,
      env: {
        STRIPE_SECRET_KEY: 'sk_test_key',
        FRONTEND_URL: 'http://localhost:5173',
      },
    })

    assert.equal(fetchedUrl, 'https://api.stripe.com/v1/checkout/sessions')
    assert.equal(fetchedOptions.method, 'POST')
    assert.equal(fetchedOptions.headers.Authorization, 'Bearer sk_test_key')
    assert.match(fetchedOptions.body, /metadata%5Breference%5D=LAPPUI-7-TEST-REF/)
    assert.match(fetchedOptions.body, /line_items%5B0%5D%5Bprice_data%5D%5Bunit_amount%5D=15050/)

    assert.equal(res.providerPaymentId, 'cs_test_123')
    assert.equal(res.checkoutUrl, 'https://checkout.stripe.com/c/pay/cs_test_123')
    assert.equal(res.status, 'PENDING')
  } finally {
    globalThis.fetch = originalFetch
  }
})