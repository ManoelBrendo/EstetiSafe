const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildSupportUser,
  createSupportLoginResponse,
  getSupportBillingSnapshot,
  getSupportContact,
  hasSupportCredentials,
  isSupportPayload,
  registerSupportRoutes,
} = require('../src/legacy/support')

test('hasSupportCredentials validates configured support access', () => {
  assert.equal(hasSupportCredentials({
    supportAdminEmail: 'suporte@empresa.com',
    supportAdminPassword: 'segredo',
  }), true)

  assert.equal(hasSupportCredentials({
    supportAdminEmail: '',
    supportAdminPassword: 'segredo',
  }), false)
})

test('getSupportContact returns configured support channels', () => {
  assert.deepEqual(getSupportContact({
    supportContactName: 'Central',
    supportContactEmail: 'suporte@empresa.com',
    supportContactPhone: '11999999999',
  }), {
    name: 'Central',
    email: 'suporte@empresa.com',
    phone: '11999999999',
  })
})

test('getSupportBillingSnapshot returns unrestricted support billing access', () => {
  const snapshot = getSupportBillingSnapshot()
  assert.equal(snapshot.blocked, false)
  assert.equal(snapshot.effectiveStatus, 'ACTIVE')
})

test('buildSupportUser creates a synthetic support account payload', () => {
  const user = buildSupportUser({
    supportAdminEmail: 'suporte@empresa.com',
    supportAdminName: 'Central de suporte',
  })

  assert.equal(user.role, 'SUPPORT')
  assert.equal(user.email, 'suporte@empresa.com')
})

test('isSupportPayload checks for the expected support token shape', () => {
  assert.equal(isSupportPayload({
    support: true,
    role: 'SUPPORT',
    email: 'suporte@empresa.com',
  }, 'suporte@empresa.com'), true)

  assert.equal(isSupportPayload({
    support: true,
    role: 'SUPPORT',
    email: 'outra@empresa.com',
  }, 'suporte@empresa.com'), false)
})

test('createSupportLoginResponse authenticates configured support login', () => {
  const response = createSupportLoginResponse({
    email: 'suporte@empresa.com',
    password: 'senha-segura',
    supportAdminEmail: 'suporte@empresa.com',
    supportAdminPassword: 'senha-segura',
    supportAdminName: 'Central de suporte',
    safeEqualText: (left, right) => left === right,
    signToken: payload => `token:${payload.email}`,
    serializeSupportUser: () => ({ role: 'SUPPORT', support: true }),
  })

  assert.equal(response.status, 200)
  assert.equal(response.body.token, 'token:suporte@empresa.com')
  assert.equal(response.body.user.role, 'SUPPORT')
})

test('createSupportLoginResponse rejects wrong support password', () => {
  const response = createSupportLoginResponse({
    email: 'suporte@empresa.com',
    password: 'senha-incorreta',
    supportAdminEmail: 'suporte@empresa.com',
    supportAdminPassword: 'senha-segura',
    supportAdminName: 'Central de suporte',
    safeEqualText: (left, right) => left === right,
    signToken: payload => `token:${payload.email}`,
    serializeSupportUser: () => ({ role: 'SUPPORT', support: true }),
  })

  assert.equal(response.status, 401)
  assert.equal(response.body.error, 'Credenciais invalidas.')
})
test('registerSupportRoutes accepts missing optional phone contact', () => {
  const routes = []
  const app = {
    get(path) {
      routes.push(['GET', path])
    },
    post(path) {
      routes.push(['POST', path])
    },
  }

  assert.doesNotThrow(() => registerSupportRoutes({
    app,
    prisma: {},
    authMiddleware() {},
    handle: handler => handler,
    requireSupport() {},
    ensureClinicAggregate() {},
    userAggregateInclude: {},
    mergeLegacyUserAggregate: user => user,
    serializeUser: user => user,
    createAuditLogFromRequest() {},
    signToken: payload => payload,
    supportAdminEmail: 'suporte@empresa.com',
    supportAdminName: 'Central de suporte',
    supportContactName: 'Central',
    supportContactEmail: 'suporte@empresa.com',
    supportContactPhone: '',
  }))

  assert.deepEqual(routes, [
    ['GET', '/public/support-contact'],
    ['GET', '/support/clinics'],
    ['POST', '/support/assume'],
  ])
})

