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

const schemaName = `itest_medrec_${process.pid}_${Date.now()}`
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

test('Medical Records v2 endpoints integration test', async () => {
  // 1. Registrar clinica e obter token
  const registerRes = await request('POST', '/auth/register', {
    body: {
      email: 'medrecords.test@lappui.local',
      password: 'Aa!@246813579246',
      clinicName: 'Clinica Medical Records Test',
    },
  })

  assert.equal(registerRes.status, 201)
  const token = registerRes.data.token

  // 2. Criar um cliente
  const clientRes = await request('POST', '/clients', {
    token,
    body: {
      name: 'Paciente Prontuario Test',
      phone: '11999999999',
      email: 'paciente.prontuario@teste.local',
      birthDate: '1990-01-01',
      cpf: '38192847291',
    },
  })
  assert.equal(clientRes.status, 201)
  const clientId = clientRes.data.id

  // 3. GET /by-client/:clientId -> Deve carregar prontuario completo
  const recordGet = await request('GET', `/api/v2/medical-records/by-client/${clientId}`, { token })
  assert.equal(recordGet.status, 200)
  assert.equal(recordGet.data.client.fullName, 'Paciente Prontuario Test')
  assert.equal(recordGet.data.accessState.readOnly, false)

  // 4. GET /by-client/:clientId/summary -> Deve carregar sumario
  const summaryGet = await request('GET', `/api/v2/medical-records/by-client/${clientId}/summary`, { token })
  assert.equal(summaryGet.status, 200)
  assert.equal(summaryGet.data.client.name, 'Paciente Prontuario Test')
  assert.equal(summaryGet.data.counts.anamneses, 0)

  // 5. GET /by-client/:clientId/access-state -> Deve retornar access state
  const stateGet = await request('GET', `/api/v2/medical-records/by-client/${clientId}/access-state`, { token })
  assert.equal(stateGet.status, 200)
  assert.equal(stateGet.data.readOnly, false)

  // 6. PUT /by-client/:clientId/anamnesis -> Enviar uma anamnese
  const anamnesisPayload = {
    answers: {
      identification: {
        fullName: 'Paciente Prontuario Alterado',
        email: 'paciente.prontuario@teste.local',
        phone: '11999999999',
        birthDate: '1990-01-01',
        cpf: '38192847291',
      },
      chiefComplaint: {
        desiredProcedure: 'Botox',
        currentDiscomfort: 'Rugas',
      },
      photoRecord: {
        clinicalUseAuthorized: true,
        consentAwarenessConfirmed: true,
        photos: [],
      },
    },
  }

  const putAnamnesisRes = await request('PUT', `/api/v2/medical-records/by-client/${clientId}/anamnesis`, {
    token,
    body: anamnesisPayload,
  })

  assert.equal(putAnamnesisRes.status, 200)
  assert.equal(putAnamnesisRes.data.client.fullName, 'Paciente Prontuario Alterado')
  assert.equal(putAnamnesisRes.data.anamnesisHistory.length, 1)

  // 7. GET /by-client/:clientId/anamnesis -> Obter historico
  const historyGet = await request('GET', `/api/v2/medical-records/by-client/${clientId}/anamnesis`, { token })
  assert.equal(historyGet.status, 200)
  assert.equal(historyGet.data.history.length, 1)
  assert.equal(historyGet.data.latest.summary.fullName, 'Paciente Prontuario Alterado')

  // 8. Bloquear o cliente (isLocked = true)
  await prisma.client.update({
    where: { id: clientId },
    data: { isLocked: true },
  })

  // 9. PUT /by-client/:clientId/anamnesis em cliente bloqueado -> Deve falhar com 423
  const failPutRes = await request('PUT', `/api/v2/medical-records/by-client/${clientId}/anamnesis`, {
    token,
    body: anamnesisPayload,
  })
  assert.equal(failPutRes.status, 423)
})
