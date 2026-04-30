import { describe, expect, it } from 'vitest'
import { buildMailtoLink, buildPhoneLink, getSupportContact, hasSupportContact, isImpersonating, isSupportUser } from './support'
import type { AuthUser } from './types'

function createAuthUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 1,
    email: 'support@lappui.com',
    clinicName: 'Clínica Base',
    ...overrides,
  }
}

describe('support helpers', () => {
  it('prefers explicit fallback contact data when provided', () => {
    expect(getSupportContact({
      name: 'Equipe Premium',
      email: 'suporte@clínica.com',
      phone: '(11) 98888-7777',
    })).toEqual({
      name: 'Equipe Premium',
      email: 'suporte@clínica.com',
      phone: '(11) 98888-7777',
    })
  })

  it('builds contact links in a browser-safe way', () => {
    expect(buildMailtoLink('suporte@clínica.com')).toBe('mailto:suporte@clínica.com')
    expect(buildMailtoLink('')).toBeNull()
    expect(buildPhoneLink('(11) 98888-7777')).toBe('tel:11988887777')
    expect(buildPhoneLink('')).toBeNull()
  })

  it('detects support availability and impersonation state', () => {
    expect(hasSupportContact({ email: 'suporte@clínica.com' })).toBe(true)
    expect(hasSupportContact({})).toBe(false)
    expect(isSupportUser(createAuthUser({ role: 'SUPPORT' }))).toBe(true)
    expect(isSupportUser(createAuthUser({ role: 'ADMIN' }))).toBe(false)
    expect(isImpersonating(createAuthUser({ supportContext: { active: true } }))).toBe(true)
    expect(isImpersonating(createAuthUser({ supportContext: null }))).toBe(false)
  })
})
