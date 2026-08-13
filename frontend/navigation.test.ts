import { describe, expect, it } from 'vitest'
import { resolveNavigation, resolveBillingBadge, CLINIC_NAV, SUPPORT_NAV, BILLING_META } from './navigation'
import type { AuthUser } from './types'

function createTestUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 10,
    email: 'test@lappui.com',
    clinicName: 'Clínica de Teste',
    ...overrides,
  }
}

describe('navigation and billing layout resolvers', () => {
  it('resolves correct navigation array based on user role', () => {
    // Technical Support role
    const supportUser = createTestUser({ role: 'SUPPORT' })
    expect(resolveNavigation(supportUser)).toBe(SUPPORT_NAV)

    // Standard Client Clinic roles
    const adminUser = createTestUser({ role: 'ADMIN' })
    expect(resolveNavigation(adminUser)).toBe(CLINIC_NAV)

    const memberUser = createTestUser({ role: 'MEMBER' })
    expect(resolveNavigation(memberUser)).toBe(CLINIC_NAV)

    // Null/Undefined fallbacks
    expect(resolveNavigation(null)).toBe(CLINIC_NAV)
    expect(resolveNavigation(undefined)).toBe(CLINIC_NAV)
  })

  it('resolves correct billing badge status and styles', () => {
    // Technical Support role overrides status
    const supportUser = createTestUser({ role: 'SUPPORT' })
    expect(resolveBillingBadge(supportUser)).toEqual({
      label: 'Operação técnica',
      className: 'badge badge-gold',
    })

    // Active billing status
    const activeUser = createTestUser({
      role: 'ADMIN',
      billing: { effectiveStatus: 'ACTIVE' },
    })
    expect(resolveBillingBadge(activeUser)).toBe(BILLING_META.ACTIVE)

    // Overdue billing status
    const overdueUser = createTestUser({
      role: 'ADMIN',
      billing: { effectiveStatus: 'OVERDUE' },
    })
    expect(resolveBillingBadge(overdueUser)).toBe(BILLING_META.OVERDUE)

    // Blocked billing status
    const blockedUser = createTestUser({
      role: 'ADMIN',
      billing: { effectiveStatus: 'BLOCKED' },
    })
    expect(resolveBillingBadge(blockedUser)).toBe(BILLING_META.BLOCKED)

    // Fallback status
    const fallbackUser = createTestUser({
      role: 'ADMIN',
      billing: { effectiveStatus: null },
    })
    expect(resolveBillingBadge(fallbackUser)).toBe(BILLING_META.TRIAL)

    const unknownUser = createTestUser({
      role: 'ADMIN',
      billing: { effectiveStatus: 'UNKNOWN_STATUS' },
    })
    expect(resolveBillingBadge(unknownUser)).toBe(BILLING_META.TRIAL)
  })
})
