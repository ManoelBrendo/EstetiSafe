import { describe, expect, it } from 'vitest'
import { getPasswordPolicyStatus, hasForbiddenDigitSequence, passwordPolicyHint } from './passwordPolicy'

describe('password policy', () => {
  it('accepts a password that matches the current support policy', () => {
    const result = getPasswordPolicyStatus('A!@246813579246')

    expect(result.isValid).toBe(true)
    expect(result.lettersOk).toBe(true)
    expect(result.specialOk).toBe(true)
    expect(result.digitsOk).toBe(true)
    expect(result.sequenceOk).toBe(true)
  })

  it('rejects ascending, descending, and repeated digit sequences', () => {
    expect(hasForbiddenDigitSequence('A!@123456789012')).toBe(true)
    expect(hasForbiddenDigitSequence('A!@987612345678')).toBe(true)
    expect(hasForbiddenDigitSequence('A!@111156789012')).toBe(true)
  })

  it('rejects passwords that do not satisfy the full policy', () => {
    const result = getPasswordPolicyStatus('abcdef123456')

    expect(result.isValid).toBe(false)
    expect(result.specialOk).toBe(false)
  })

  it('keeps a user-facing hint aligned with the implemented rule', () => {
    expect(passwordPolicyHint).toContain('12 números')
    expect(passwordPolicyHint).toContain('2 caracteres especiais')
  })
})
