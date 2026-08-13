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

const schemaName = `itest_csrf_${process.pid}_${Date.now()}`
const testDatabaseUrl = new URL(baseDatabaseUrl)
testDatabaseUrl.searchParams.set('schema', schemaName)

process.env.DATABASE_URL = testDatabaseUrl.toString()
process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-secret'

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

test('Double-Submit Cookie CSRF validation on billing routes', async () => {
  // 1. Registrar clinica e obter cookies de resposta
  const registerRes = await fetch(baseUrl + '/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'csrf.test@lappui.local',
      password: 'Aa!@246813579246',
      clinicName: 'Clinica CSRF Test',
    }),
  })

  assert.equal(registerRes.status, 201)
  const registerData = await registerRes.json()
  const token = registerData.token

  // Extrair o cookie XSRF-TOKEN
  const rawCookies = registerRes.headers.get('set-cookie') || ''
  const xsrfCookieMatch = rawCookies.match(/XSRF-TOKEN=([^;]+)/)
  const xsrfTokenValue = xsrfCookieMatch ? xsrfCookieMatch[1] : null

  assert.ok(xsrfTokenValue, 'Cookie XSRF-TOKEN deve ser retornado no registro')

  // 2. Tentar POST /billing/bills sem o cabecalho X-XSRF-TOKEN (enforcando CSRF nos testes com header customizado)
  const failResNoHeader = await fetch(baseUrl + '/billing/bills', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'x-enforce-csrf-test': 'true',
    },
    body: JSON.stringify({
      dueAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      amount: 150.00,
      title: 'Teste sem cabecalho CSRF',
    }),
  })

  assert.equal(failResNoHeader.status, 403)
  const failDataNoHeader = await failResNoHeader.json()
  assert.match(failDataNoHeader.error, /CSRF token inválido ou ausente/)

  // 3. Tentar POST com cabecalho X-XSRF-TOKEN incorreto
  const failResBadHeader = await fetch(baseUrl + '/billing/bills', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'x-enforce-csrf-test': 'true',
      'Cookie': `XSRF-TOKEN=${xsrfTokenValue}`,
      'X-XSRF-TOKEN': 'token-incorreto',
    },
    body: JSON.stringify({
      dueAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      amount: 150.00,
      title: 'Teste com cabecalho CSRF incorreto',
    }),
  })

  assert.equal(failResBadHeader.status, 403)

  // 4. Tentar POST com cookies e cabecalho correto -> Deve passar pela validacao CSRF
  // (Pode dar erro de validacao normal de payload se dueDate/amount forem invalidos, mas nao 403 CSRF)
  const successRes = await fetch(baseUrl + '/billing/bills', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'x-enforce-csrf-test': 'true',
      'Cookie': `XSRF-TOKEN=${xsrfTokenValue}`,
      'X-XSRF-TOKEN': xsrfTokenValue,
    },
    body: JSON.stringify({
      dueAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      amount: 150.00,
      title: 'Teste com cabecalho CSRF correto',
    }),
  })

  // Nao deve ser 403 Forbidden!
  assert.notEqual(successRes.status, 403)
  // Como enviamos dados validos, deve ser 201 Created
  assert.equal(successRes.status, 201)
})
