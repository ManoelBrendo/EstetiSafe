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

const schemaName = `itest_facial_${process.pid}_${Date.now()}`
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

test('Facial Points mapping CRUD and locking via API v2', async () => {
  // 1. Registrar clinica e obter token
  const registerRes = await request('POST', '/auth/register', {
    body: {
      email: 'facial.points.test@lappui.local',
      password: 'Aa!@246813579246',
      clinicName: 'Clinica Facial Test',
    },
  })

  assert.equal(registerRes.status, 201)
  const token = registerRes.data.token
  const clinicUserId = registerRes.data.user.id

  // 2. Criar um cliente
  const clientRes = await request('POST', '/clients', {
    token,
    body: {
      name: 'Paciente Facial Test',
      phone: '11999999999',
      email: 'paciente.facial@teste.local',
      birthDate: '1995-05-15',
      cpf: '38192847291',
    },
  })
  assert.equal(clientRes.status, 201)
  const clientId = clientRes.data.id

  // 3. Obter pontos faciais iniciais (deve vir vazio)
  const pointsGetInit = await request('GET', `/api/v2/clients/${clientId}/facial-points`, { token })
  assert.equal(pointsGetInit.status, 200)
  assert.ok(Array.isArray(pointsGetInit.data))
  assert.equal(pointsGetInit.data.length, 0)

  // 4. Salvar pontos faciais
  const initialPoints = [
    { id: 'point-1', x: 25.5, y: 30.1, type: 'botox', amount: 4 },
    { id: 'point-2', x: 50.2, y: 60.8, type: 'filler', amount: 1.5 },
  ]
  const savePointsRes = await request('PUT', `/api/v2/clients/${clientId}/facial-points`, {
    token,
    body: initialPoints,
  })

  assert.equal(savePointsRes.status, 200)
  assert.equal(savePointsRes.data.length, 2)
  assert.equal(savePointsRes.data[0].id, 'point-1')
  assert.equal(savePointsRes.data[0].type, 'botox')
  assert.equal(savePointsRes.data[0].amount, 4)

  // 5. Obter pontos novamente e verificar persistencia
  const pointsGetSaved = await request('GET', `/api/v2/clients/${clientId}/facial-points`, { token })
  assert.equal(pointsGetSaved.status, 200)
  assert.equal(pointsGetSaved.data.length, 2)

  // 6. Atualizar para novos pontos (substituindo point-2 por point-3)
  const nextPoints = [
    { id: 'point-1', x: 25.5, y: 30.1, type: 'botox', amount: 5 },
    { id: 'point-3', x: 75.0, y: 15.2, type: 'botox', amount: 2 },
  ]
  const updatePointsRes = await request('PUT', `/api/v2/clients/${clientId}/facial-points`, {
    token,
    body: nextPoints,
  })

  assert.equal(updatePointsRes.status, 200)
  assert.equal(updatePointsRes.data.length, 2)
  assert.equal(updatePointsRes.data[0].amount, 5) // Atualizado de 4 para 5
  assert.equal(updatePointsRes.data[1].id, 'point-3') // Substituto criado

  // 7. Bloquear o cliente (editando isLocked diretamente no banco de dados para simplificar)
  await prisma.client.update({
    where: { id: clientId },
    data: { isLocked: true },
  })

  // 8. Tentar atualizar pontos faciais em cliente bloqueado -> Deve falhar com 423
  const failUpdateRes = await request('PUT', `/api/v2/clients/${clientId}/facial-points`, {
    token,
    body: [],
  })

  assert.equal(failUpdateRes.status, 423)

  // 9. Verificar que pontos nao foram alterados no banco
  const pointsGetFinal = await request('GET', `/api/v2/clients/${clientId}/facial-points`, { token })
  assert.equal(pointsGetFinal.status, 200)
  assert.equal(pointsGetFinal.data.length, 2)
  assert.equal(pointsGetFinal.data[1].id, 'point-3')
})
