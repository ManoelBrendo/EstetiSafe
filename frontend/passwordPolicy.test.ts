import { describe, expect, it } from 'vitest'
import { getPasswordPolicyStatus, hasForbiddenDigitSequence, passwordPolicyHint } from './passwordPolicy'

describe('password policy', () => {
  it('accepts a password that matches the current support policy', () => {
    const result = getPasswordPolicyStatus('Aa!24681357')

    expect(result.isValid).toBe(true)
    expect(result.hasUppercase).toBe(true)
    expect(result.hasLowercase).toBe(true)
    expect(result.hasSpecial).toBe(true)
    expect(result.has8Digits).toBe(true)
    expect(result.sequenceOk).toBe(true)
  })

  it('rejects ascending, descending, and repeated digit and letter sequences', () => {
    expect(hasForbiddenDigitSequence('A!@12345678')).toBe(true)
    expect(hasForbiddenDigitSequence('A!@98765432')).toBe(true)
    expect(hasForbiddenDigitSequence('A!@11115678')).toBe(true)
    expect(hasForbiddenDigitSequence('A!@abcd5678')).toBe(true)
    expect(hasForbiddenDigitSequence('A!@dcba5678')).toBe(true)
  })

  it('rejects passwords that do not satisfy the full policy', () => {
    const result = getPasswordPolicyStatus('abcdef123456')

    expect(result.isValid).toBe(false)
    expect(result.hasSpecial).toBe(false)
  })

  it('keeps a user-facing hint aligned with the implemented rule', () => {
    expect(passwordPolicyHint).toContain('8 números')
    expect(passwordPolicyHint).toContain('1 caractere especial')
  })
})
