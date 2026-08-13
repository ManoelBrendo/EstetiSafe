const test = require('node:test')
const assert = require('node:assert/strict')

// Configura o ambiente temporariamente para os testes
process.env.SUPPORT_ADMIN_EMAIL = 'support-admin-test@lappui.com'

const { getAuditActorData } = require('../lib/supportAudit')

test('getAuditActorData maps normal clinic user correctly', () => {
  const req = {
    currentUser: { id: 42, email: 'clinica@lappui.com', role: 'ADMIN' },
    user: { id: 42, email: 'clinica@lappui.com', role: 'ADMIN' },
  }

  const actor = getAuditActorData(req)
  assert.equal(actor.actorUserId, 42)
  assert.equal(actor.actorEmail, 'clinica@lappui.com')
  assert.equal(actor.actorRole, 'ADMIN')
})

test('getAuditActorData maps support user in impersonated clinic session', () => {
  const req = {
    currentUser: { id: 42, email: 'clinica@lappui.com', role: 'ADMIN' },
    user: {
      id: 42,
      email: 'clinica@lappui.com',
      role: 'ADMIN',
      impersonatedBySupport: true,
      supportEmail: 'agente.suporte@lappui.com',
    },
  }

  const actor = getAuditActorData(req)
  assert.equal(actor.actorUserId, null) // Nulo para preservar impessoalização/LGPD
  assert.equal(actor.actorEmail, 'agente.suporte@lappui.com')
  assert.equal(actor.actorRole, 'SUPPORT')
})

test('getAuditActorData maps direct support user request', () => {
  const req = {
    user: {
      id: 0,
      email: 'suporte-admin@lappui.com',
      role: 'SUPPORT',
      support: true,
    },
  }

  const actor = getAuditActorData(req)
  assert.equal(actor.actorUserId, null)
  assert.equal(actor.actorEmail, 'suporte-admin@lappui.com')
  assert.equal(actor.actorRole, 'SUPPORT')
})

test('getAuditActorData falls back to global support admin email if missing in session', () => {
  const req = {
    user: {
      support: true,
    },
  }

  const actor = getAuditActorData(req)
  assert.equal(actor.actorUserId, null)
  assert.equal(actor.actorEmail, 'support-admin-test@lappui.com')
  assert.equal(actor.actorRole, 'SUPPORT')
})
