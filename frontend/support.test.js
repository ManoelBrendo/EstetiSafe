import { describe, expect, it } from 'vitest'
import { buildMailtoLink, buildPhoneLink, getSupportContact, hasSupportContact, isImpersonating, isSupportUser } from './support'

describe('support helpers', () => {
  it('prefers explicit fallback contact data when provided', () => {
    expect(getSupportContact({
      name: 'Equipe Premium',
      email: 'suporte@clinica.com',
      phone: '(11) 98888-7777',
    })).toEqual({
      name: 'Equipe Premium',
      email: 'suporte@clinica.com',
      phone: '(11) 98888-7777',
    })
  })

  it('builds contact links in a browser-safe way', () => {
    expect(buildMailtoLink('suporte@clinica.com')).toBe('mailto:suporte@clinica.com')
    expect(buildMailtoLink('')).toBeNull()
    expect(buildPhoneLink('(11) 98888-7777')).toBe('tel:11988887777')
    expect(buildPhoneLink('')).toBeNull()
  })

  it('detects support availability and impersonation state', () => {
    expect(hasSupportContact({ email: 'suporte@clinica.com' })).toBe(true)
    expect(hasSupportContact({})).toBe(false)
    expect(isSupportUser({ role: 'SUPPORT' })).toBe(true)
    expect(isSupportUser({ role: 'ADMIN' })).toBe(false)
    expect(isImpersonating({ supportContext: { active: true } })).toBe(true)
    expect(isImpersonating({})).toBe(false)
  })
})
