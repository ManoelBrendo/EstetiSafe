const test = require('node:test')
const assert = require('node:assert/strict')

const { hasSupportBillingControl } = require('../lib/supportAccess')

test('hasSupportBillingControl accepts support and impersonated sessions', () => {
  assert.equal(hasSupportBillingControl({ support: true }), true)
  assert.equal(hasSupportBillingControl({ impersonatedBySupport: true }), true)
  assert.equal(hasSupportBillingControl({ support: false, impersonatedBySupport: false }), false)
})

test('hasSupportBillingControl also accepts express-style request objects', () => {
  assert.equal(hasSupportBillingControl({ user: { support: true } }), true)
  assert.equal(hasSupportBillingControl({ user: { impersonatedBySupport: true } }), true)
  assert.equal(hasSupportBillingControl({ user: { role: 'ADMIN' } }), false)
})
