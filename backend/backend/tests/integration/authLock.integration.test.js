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

const schemaName = `itest_authlock_${process.pid}_${Date.now()}`
const testDatabaseUrl = new URL(baseDatabaseUrl)
testDatabaseUrl.searchParams.set('schema', schemaName)

process.env.DATABASE_URL = testDatabaseUrl.toString()
process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-secret'

// Configurações de suporte para teste
process.env.SUPPORT_ADMIN_EMAIL = 'support.lock.test@lappui.local'
process.env.SUPPORT_ADMIN_PASSWORD = 'SupportLockPassword123!'
process.env.SUPPORT_ADMIN_NAME = 'Suporte Lock Teste'

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

test('Session Lock Password Verification and Audit Logging', async () => {
  const testPassword = 'Aa!@246813579246'
  
  // 1. Registrar clinica e obter token
  const registerRes = await request('POST', '/auth/register', {
    body: {
      email: 'lock.test@lappui.local',
      password: testPassword,
      clinicName: 'Clinica Lock Test',
    },
  })

  assert.equal(registerRes.status, 201)
  const token = registerRes.data.token
  const userId = registerRes.data.user.id

  // 2. Testar POST /api/v2/auth/verify-password sem senha -> Deve retornar 400
  const missingPwRes = await request('POST', '/api/v2/auth/verify-password', {
    token,
    body: {},
  })
  assert.equal(missingPwRes.status, 400)

  // 3. Testar POST /api/v2/auth/verify-password com senha incorreta -> Deve retornar 401 e auditar falha
  const wrongPwRes = await request('POST', '/api/v2/auth/verify-password', {
    token,
    body: { password: 'WrongPassword123!' },
  })
  assert.equal(wrongPwRes.status, 401)
  assert.equal(wrongPwRes.data.error, 'Senha incorreta.')

  // Verificar auditoria de falha no banco
  const failAudit = await prisma.auditLog.findFirst({
    where: {
      action: 'API_V2_AUTH_LOCK_UNLOCK_FAILED',
      actorUserId: userId,
    },
  })
  assert.ok(failAudit, 'Deve registrar um log de auditoria para falha de desbloqueio')
  assert.equal(failAudit.metadata.email, 'lock.test@lappui.local')

  // 4. Testar POST /api/v2/auth/verify-password com senha correta -> Deve retornar 200 e auditar sucesso
  const correctPwRes = await request('POST', '/api/v2/auth/verify-password', {
    token,
    body: { password: testPassword },
  })
  assert.equal(correctPwRes.status, 200)
  assert.ok(correctPwRes.data.success)

  // Verificar auditoria de sucesso no banco
  const successAudit = await prisma.auditLog.findFirst({
    where: {
      action: 'API_V2_AUTH_LOCK_UNLOCK_SUCCESS',
      actorUserId: userId,
    },
  })
  assert.ok(successAudit, 'Deve registrar um log de auditoria para sucesso de desbloqueio')
  assert.equal(successAudit.metadata.email, 'lock.test@lappui.local')

  // 5. Testar desbloqueio com usuário de suporte
  const supportLoginRes = await request('POST', '/auth/login', {
    body: {
      email: process.env.SUPPORT_ADMIN_EMAIL,
      password: process.env.SUPPORT_ADMIN_PASSWORD,
    },
  })
  assert.equal(supportLoginRes.status, 200)
  const supportToken = supportLoginRes.data.token

  // Desbloquear suporte com senha correta
  const supportCorrectRes = await request('POST', '/api/v2/auth/verify-password', {
    token: supportToken,
    body: { password: process.env.SUPPORT_ADMIN_PASSWORD },
  })
  assert.equal(supportCorrectRes.status, 200)
  assert.ok(supportCorrectRes.data.success)

  // Desbloquear suporte com senha incorreta
  const supportWrongRes = await request('POST', '/api/v2/auth/verify-password', {
    token: supportToken,
    body: { password: 'WrongSupportPassword!' },
  })
  assert.equal(supportWrongRes.status, 401)
})
