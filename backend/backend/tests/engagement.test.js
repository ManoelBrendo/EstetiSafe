const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildEngagementDashboard,
  buildReactivationCandidates,
  buildReactivationMessage,
  normalizePhoneNumber,
} = require('../src/legacy/engagement')

const now = new Date('2026-04-28T12:00:00.000Z')

function daysAgo(days) {
  const date = new Date(now)
  date.setDate(date.getDate() - days)
  return date.toISOString()
}

function daysFromNow(days) {
  const date = new Date(now)
  date.setDate(date.getDate() + days)
  return date.toISOString()
}

test('normalizePhoneNumber keeps only digits for campaign delivery', () => {
  assert.equal(normalizePhoneNumber('(11) 99999-0000'), '11999990000')
})

test('buildReactivationCandidates selects inactive clients and skips upcoming appointments', () => {
  const candidates = buildReactivationCandidates([
    {
      id: 1,
      name: 'Ana Paula',
      phone: '(11) 99999-0000',
      createdAt: daysAgo(400),
      appointments: [{ status: 'COMPLETED', startAt: daysAgo(200) }],
    },
    {
      id: 2,
      name: 'Cliente com agenda',
      phone: '(11) 98888-0000',
      createdAt: daysAgo(200),
      appointments: [
        { status: 'COMPLETED', startAt: daysAgo(150) },
        { status: 'SCHEDULED', startAt: daysFromNow(2) },
      ],
    },
    {
      id: 3,
      name: 'Sem telefone',
      phone: '',
      createdAt: daysAgo(200),
      appointments: [{ status: 'COMPLETED', startAt: daysAgo(160) }],
    },
  ], { now, clinicName: 'Clinica Aurora' })

  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].clientId, 1)
  assert.equal(candidates[0].priority, 'HIGH')
  assert.equal(candidates[0].reason, 'NO_RECENT_APPOINTMENT')
  assert.match(candidates[0].suggestedMessage, /Ana/)
  assert.match(candidates[0].suggestedMessage, /Clinica Aurora/)
})

test('buildReactivationCandidates includes older clients without appointments as low priority', () => {
  const candidates = buildReactivationCandidates([
    {
      id: 10,
      name: 'Marina Costa',
      phone: '81999990000',
      createdAt: daysAgo(45),
      appointments: [],
    },
  ], { now })

  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].priority, 'LOW')
  assert.equal(candidates[0].reason, 'NO_APPOINTMENT_CREATED')
  assert.equal(candidates[0].daysSinceLastAppointment, null)
})

test('buildReactivationCandidates respects opt-out flags', () => {
  const candidates = buildReactivationCandidates([
    {
      id: 20,
      name: 'Opt Out',
      phone: '81999990000',
      marketingOptOut: true,
      createdAt: daysAgo(400),
      appointments: [{ status: 'COMPLETED', startAt: daysAgo(200) }],
    },
  ], { now })

  assert.equal(candidates.length, 0)
})

test('buildReactivationMessage produces a clear reviewable WhatsApp draft', () => {
  const message = buildReactivationMessage({ name: 'Beatriz Lima' }, 'LAppui Clinic')

  assert.equal(
    message,
    'Ola, Beatriz. Sentimos sua falta na LAppui Clinic. Podemos te ajudar a agendar uma nova avaliacao? Responda SIM para continuar.'
  )
})

test('buildEngagementDashboard never enables automatic sending in this phase', () => {
  const dashboard = buildEngagementDashboard([
    {
      id: 30,
      name: 'Paula',
      phone: '81999990000',
      createdAt: daysAgo(300),
      appointments: [{ status: 'COMPLETED', startAt: daysAgo(120) }],
    },
  ], { now })

  assert.equal(dashboard.mode, 'selection_only')
  assert.equal(dashboard.autoSendEnabled, false)
  assert.equal(dashboard.eligibleCount, 1)
})