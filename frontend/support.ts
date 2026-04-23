import type { AuthUser, SupportContact } from './types'

export function getSupportContact(fallback: Partial<SupportContact> = {}): SupportContact {
  return {
    name: fallback.name || import.meta.env.VITE_SUPPORT_NAME || "Suporte L'Appui",
    email: fallback.email || import.meta.env.VITE_SUPPORT_EMAIL || '',
    phone: fallback.phone || import.meta.env.VITE_SUPPORT_PHONE || '',
  }
}

export function hasSupportContact(fallback: Partial<SupportContact> = {}): boolean {
  const contact = getSupportContact(fallback)
  return Boolean(contact.email || contact.phone)
}

export function buildMailtoLink(email?: string | null): string | null {
  return email ? `mailto:${email}` : null
}

export function buildPhoneLink(phone?: string | null): string | null {
  const digits = String(phone || '').replace(/\D/g, '')
  return digits ? `tel:${digits}` : null
}

export function isSupportUser(user?: AuthUser | null): boolean {
  return user?.role === 'SUPPORT'
}

export function isImpersonating(user?: AuthUser | null): boolean {
  return Boolean(user?.supportContext?.active)
}
