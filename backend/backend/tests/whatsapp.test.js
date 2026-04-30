const assert = require('node:assert/strict')
const test = require('node:test')
const {
  WhatsAppProvider,
  buildMetaSignature,
  buildTemplateComponents,
  buildWhatsAppReadiness,
  extractWebhookEvents,
  isMetaSignatureValid,
  normalizePhoneNumber,
  normalizeReplyIntent,
  processWhatsAppWebhook,
} = require('../src/legacy/whatsapp')

test('normalizePhoneNumber keeps only digits', () => {
  assert.equal(normalizePhoneNumber('+55 (85) 99999-0000'), '5585999990000')
})

test('normalizeReplyIntent identifies Portuguese confirmations', () => {
  assert.equal(normalizeReplyIntent('sim'), 'YES')
  assert.equal(normalizeReplyIntent('N\u00C3O'), 'NO')
  assert.equal(normalizeReplyIntent('talvez'), null)
})

test('buildTemplateComponents creates body parameters for Meta templates', () => {
  assert.deepEqual(buildTemplateComponents({ bodyParams: ['Ana', 'Limpeza de pele'] }), [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: 'Ana' },
        { type: 'text', text: 'Limpeza de pele' },
      ],
    },
  ])
})

test('WhatsAppProvider sends template payload with bearer token', async () => {
  let receivedUrl = ''
  let receivedOptions = null
  const provider = new WhatsAppProvider({
    accessToken: 'token-test',
    phoneNumberId: '1234567890',
    fetchImpl: async (url, options) => {
      receivedUrl = url
      receivedOptions = options
      return {
        ok: true,
        status: 200,
        json: async () => ({ messages: [{ id: 'wamid.123' }] }),
      }
    },
  })

  const response = await provider.sendTemplateMessage({
    to: '+55 85 99999-0000',
    templateName: 'appointment_confirmation',
    bodyParams: ['Ana'],
  })

  const body = JSON.parse(receivedOptions.body)
  assert.match(receivedUrl, /\/v\d+\.\d+\/1234567890\/messages$/)
  assert.equal(receivedOptions.headers.Authorization, 'Bearer token-test')
  assert.equal(body.messaging_product, 'whatsapp')
  assert.equal(body.to, '5585999990000')
  assert.equal(body.template.name, 'appointment_confirmation')
  assert.equal(response.messages[0].id, 'wamid.123')
})

test('extractWebhookEvents returns statuses and messages from Meta payload', () => {
  const payload = {
    entry: [{
      changes: [{
        value: {
          metadata: { phone_number_id: '123' },
          statuses: [{ id: 'wamid.1', status: 'delivered' }],
          messages: [{ id: 'wamid.2', from: '5585999990000', type: 'text', text: { body: 'SIM' } }],
        },
      }],
    }],
  }

  const events = extractWebhookEvents(payload)
  assert.equal(events.statuses.length, 1)
  assert.equal(events.messages.length, 1)
  assert.equal(events.statuses[0].phoneNumberId, '123')
})

test('processWhatsAppWebhook confirms appointment when client replies SIM', async () => {
  const updates = []
  const logs = []
  const prisma = {
    whatsappClinicConfig: {
      findFirst: async () => ({
        id: 7,
        userId: 2,
        phoneNumberId: '123',
        active: true,
      }),
    },
    whatsappLog: {
      findFirst: async () => ({ appointmentId: 10 }),
      create: async ({ data }) => {
        logs.push(data)
        return data
      },
      updateMany: async () => ({ count: 0 }),
    },
    appointment: {
      findFirst: async () => ({ id: 10, userId: 2, client: { phone: '+55 85 99999-0000' } }),
      findMany: async () => [],
      update: async ({ where, data }) => {
        updates.push({ where, data })
        return { id: where.id, ...data }
      },
    },
  }

  const result = await processWhatsAppWebhook({
    prisma,
    payload: {
      entry: [{
        changes: [{
          value: {
            metadata: { phone_number_id: '123' },
            messages: [{
              id: 'wamid.reply',
              from: '5585999990000',
              type: 'text',
              text: { body: 'SIM' },
              context: { id: 'wamid.original' },
            }],
          },
        }],
      }],
    },
    logger: { warn() {}, error() {} },
  })

  assert.equal(result.messages[0].appointmentId, 10)
  assert.deepEqual(updates[0], { where: { id: 10 }, data: { status: 'CONFIRMED' } })
  assert.equal(logs[0].status, 'CONFIRMED')
})

test('validates Meta webhook HMAC signature when app secret is configured', () => {
  const rawBody = Buffer.from(JSON.stringify({ object: 'whatsapp_business_account' }))
  const signature = buildMetaSignature(rawBody, 'app-secret')

  assert.equal(isMetaSignatureValid({ signature, rawBody, appSecret: 'app-secret' }), true)
  assert.equal(isMetaSignatureValid({ signature: 'sha256=invalid', rawBody, appSecret: 'app-secret' }), false)
  assert.equal(isMetaSignatureValid({ signature: null, rawBody, appSecret: undefined }), true)
})
test('buildWhatsAppReadiness separates configured code from live readiness', () => {
  const readiness = buildWhatsAppReadiness({
    env: {
      WHATSAPP_APP_SECRET: 'app-secret',
      WHATSAPP_CONFIRMATION_JOB_ENABLED: 'true',
    },
    activeConfigCount: 1,
    outboundLast24h: 3,
    inboundLast24h: 2,
    failedLast24h: 1,
  })

  assert.equal(readiness.status, 'READY')
  assert.equal(readiness.readyForLive, true)
  assert.equal(readiness.webhookConfigured, true)
  assert.equal(readiness.confirmationWindowHours, 24)
  assert.equal(readiness.outboundLast24h, 3)
  assert.deepEqual(readiness.missing, [])
})

test('buildWhatsAppReadiness reports missing production controls without exposing secrets', () => {
  const readiness = buildWhatsAppReadiness({ env: {}, activeConfigCount: 0 })

  assert.equal(readiness.status, 'NOT_CONFIGURED')
  assert.equal(readiness.readyForLive, false)
  assert.ok(readiness.missing.includes('whatsappClinicConfig ativa'))
  assert.ok(readiness.missing.includes('WHATSAPP_APP_SECRET'))
})