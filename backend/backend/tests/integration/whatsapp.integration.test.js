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

const schemaName = `itest_wa_${process.pid}_${Date.now()}`
const testDatabaseUrl = new URL(baseDatabaseUrl)
testDatabaseUrl.searchParams.set('schema', schemaName)

process.env.DATABASE_URL = testDatabaseUrl.toString()
process.env.JWT_SECRET = 'whatsapp-integration-test-secret'
process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY = '12345678901234567890123456789012' // 32 chars
process.env.WHATSAPP_VERIFY_TOKEN = 'integration-verify-token'
process.env.WHATSAPP_APP_SECRET = 'integration-app-secret'

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
const { decryptToken, buildMetaSignature } = require('../../src/legacy/whatsapp')

let server
let baseUrl
let adminPrisma
let clinicToken
let clinicUserId

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

test('register clinic, manage WhatsApp settings, verify encryption and webhooks', async () => {
  // 1. Register a new user
  const registerResponse = await request('POST', '/auth/register', {
    body: {
      email: 'clinica.whatsapp.itest@lappui.local',
      password: 'Aa!@246813579246',
      clinicName: 'Clinica Whatsapp ITest',
    },
  })

  assert.equal(registerResponse.status, 201)
  clinicToken = registerResponse.data.token
  clinicUserId = registerResponse.data.user.id

  // 2. GET config should return blank config initially
  const getInitial = await request('GET', '/notifications/config', { token: clinicToken })
  assert.equal(getInitial.status, 200)
  assert.equal(getInitial.data.phoneNumberId, '')
  assert.equal(getInitial.data.accessToken, '')
  assert.equal(getInitial.data.active, false)

  // 3. PUT config should store, encrypt, and return config
  const putResponse = await request('PUT', '/notifications/config', {
    token: clinicToken,
    body: {
      phoneNumberId: '1234567890',
      businessAccountId: '987654321',
      accessToken: 'EAAGRealTokenValueSecret_123',
      verifyToken: 'my-custom-clinic-token',
      defaultLanguage: 'pt_BR',
      appointmentTemplateName: 'custom_confirmation',
      consentTemplateName: 'custom_consent',
      active: true,
    },
  })

  assert.equal(putResponse.status, 200)
  assert.equal(putResponse.data.phoneNumberId, '1234567890')
  assert.equal(putResponse.data.accessToken, '••••••••')
  assert.equal(putResponse.data.active, true)

  // 4. Verify DB direct record is encrypted
  const dbRecord = await prisma.whatsappClinicConfig.findUnique({
    where: { userId: clinicUserId },
  })
  assert.ok(dbRecord)
  assert.notEqual(dbRecord.accessTokenEncrypted, 'EAAGRealTokenValueSecret_123')
  assert.ok(dbRecord.accessTokenEncrypted.includes(':'))

  // 5. Decrypt using legacy module function and verify original value matches
  const decrypted = decryptToken(dbRecord.accessTokenEncrypted, process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY)
  assert.equal(decrypted, 'EAAGRealTokenValueSecret_123')

  // 6. GET config again should return masked fields
  const getSecond = await request('GET', '/notifications/config', { token: clinicToken })
  assert.equal(getSecond.status, 200)
  assert.equal(getSecond.data.phoneNumberId, '1234567890')
  assert.equal(getSecond.data.accessToken, '••••••••')

  // 7. PUT config again sending masked placeholder should NOT overwrite actual token
  const putMaskedResponse = await request('PUT', '/notifications/config', {
    token: clinicToken,
    body: {
      phoneNumberId: '1234567890',
      businessAccountId: '987654321',
      accessToken: '••••••••',
      verifyToken: 'my-custom-clinic-token',
      defaultLanguage: 'pt_BR',
      appointmentTemplateName: 'custom_confirmation',
      consentTemplateName: 'custom_consent',
      active: true,
    },
  })
  assert.equal(putMaskedResponse.status, 200)
  const dbRecordAfterMasked = await prisma.whatsappClinicConfig.findUnique({
    where: { userId: clinicUserId },
  })
  assert.equal(dbRecordAfterMasked.accessTokenEncrypted, dbRecord.accessTokenEncrypted)

  // 8. GET webhook verification should succeed
  const webhookGet = await request('GET', `/webhooks/whatsapp?hub.mode=subscribe&hub.challenge=test_challenge&hub.verify_token=integration-verify-token`)
  assert.equal(webhookGet.status, 200)
  assert.equal(webhookGet.data, 'test_challenge')

  // 9. POST webhook with signature validation
  const rawBody = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{
      changes: [{
        value: {
          metadata: { phone_number_id: '1234567890' },
          statuses: [{ id: 'wamid.123', status: 'delivered' }],
        },
      }],
    }],
  })
  const signature = buildMetaSignature(rawBody, 'integration-app-secret')

  const webhookPost = await request('POST', '/webhooks/whatsapp', {
    headers: {
      'x-hub-signature-256': signature,
      'Content-Type': 'application/json',
    },
    body: JSON.parse(rawBody),
  })
  assert.equal(webhookPost.status, 200)
  assert.equal(webhookPost.data.ok, true)
  assert.equal(webhookPost.data.statuses.length, 1)
  assert.equal(webhookPost.data.statuses[0].providerMessageId, 'wamid.123')
  assert.equal(webhookPost.data.statuses[0].status, 'DELIVERED')
})
