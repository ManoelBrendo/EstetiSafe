import type { IconName } from './Icon'
import type { AuthUser } from './types'
import type { BillingStatusKey } from './operationsTypes'

export interface NavigationItem {
  to: string
  icon: IconName
  label: string
}

export const CLINIC_NAV: NavigationItem[] = [
  { to: '/painel', icon: 'dashboard', label: 'Painel Clínico' },
  { to: '/clientes', icon: 'users', label: 'Clientes' },
  { to: '/agendamentos', icon: 'calendar', label: 'Agendamentos' },
  { to: '/servicos', icon: 'procedure', label: 'Serviços' },
  { to: '/profissionais', icon: 'person', label: 'Profissionais' },
  { to: '/documentos', icon: 'fileText', label: 'Documentos' },
  { to: '/produtos-e-equipamentos', icon: 'box', label: 'Produtos e Equipamentos' },
  { to: '/intercorrencias', icon: 'clipboard', label: 'Intercorrências' },
  { to: '/auditoria', icon: 'shield', label: 'Auditoria' },
  { to: '/pagamentos', icon: 'dollar', label: 'Pagamentos' },
]

export const SUPPORT_NAV: NavigationItem[] = [
  { to: '/suporte', icon: 'dashboard', label: 'Central de suporte' },
]

export const BILLING_META: Record<BillingStatusKey, { label: string; className: string }> = {
  TRIAL: { label: 'Cortesia ativa', className: 'badge badge-blue' },
  ACTIVE: { label: 'Pagamento em dia', className: 'badge badge-green' },
  OVERDUE: { label: 'Pagamento pendente', className: 'badge badge-gold' },
  BLOCKED: { label: 'Acesso bloqueado', className: 'badge badge-red' },
}

/**
 * Resolves the navigation items list based on user role.
 */
export function resolveNavigation(user: AuthUser | null | undefined): NavigationItem[] {
  if (user?.role === 'SUPPORT') {
    return SUPPORT_NAV
  }
  return CLINIC_NAV
}

/**
 * Resolves the billing badge details based on user status and metadata.
 */
export function resolveBillingBadge(user: AuthUser | null | undefined): { label: string; className: string } {
  if (user?.role === 'SUPPORT') {
    return { label: 'Operação técnica', className: 'badge badge-gold' }
  }
  const status = (user?.billing?.effectiveStatus as BillingStatusKey) || 'TRIAL'
  return BILLING_META[status] || BILLING_META.TRIAL
}
