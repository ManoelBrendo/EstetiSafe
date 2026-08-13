const test = require('node:test')
const assert = require('node:assert/strict')

const {
  hasForbiddenDigitSequence,
  passwordMeetsPolicy,
  passwordPolicyMessage,
  safeEqualText,
} = require('../lib/security')

test('safeEqualText compares equal strings without false positives', () => {
  assert.equal(safeEqualText('abc87630294', 'abc87630294'), true)
  assert.equal(safeEqualText('abc87630294', 'abc87630295'), false)
})

test('hasForbiddenDigitSequence detects unsafe numeric runs and alphabetical runs', () => {
  assert.equal(hasForbiddenDigitSequence('A!@123456789012'), true)
  assert.equal(hasForbiddenDigitSequence('A!@987612345678'), true)
  assert.equal(hasForbiddenDigitSequence('A!@111156789012'), true)
  assert.equal(hasForbiddenDigitSequence('A!@abcd56789012'), true)
  assert.equal(hasForbiddenDigitSequence('A!@dcba56789012'), true)
  assert.equal(hasForbiddenDigitSequence('A!@aaaa56789012'), true)
  assert.equal(hasForbiddenDigitSequence('A!@246813579246'), false)
})

test('passwordMeetsPolicy validates the support password rules', () => {
  assert.equal(passwordMeetsPolicy('Aa!@246813579246'), true)
  assert.equal(passwordMeetsPolicy('abcdef123456'), false)
  assert.match(passwordPolicyMessage, /8 números/)
})
