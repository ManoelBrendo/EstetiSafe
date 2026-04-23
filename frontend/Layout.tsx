import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from './useAuth'
import { Icon, type IconName } from './Icon'
import { getClinicBranding } from './branding'
import { isImpersonating, isSupportUser } from './support'
import type { AuthUser } from './types'
import type { BillingStatusKey } from './operationsTypes'

interface NavigationItem {
  to: string
  icon: IconName
  label: string
}

const clinicNav: NavigationItem[] = [
  { to: '/', icon: 'dashboard', label: 'Painel Clinico' },
  { to: '/documentos', icon: 'fileText', label: 'Documentos' },
  { to: '/produtos-e-equipamentos', icon: 'box', label: 'Produtos e Equipamentos' },
  { to: '/clientes', icon: 'users', label: 'Clientes' },
  { to: '/agendamentos', icon: 'calendar', label: 'Agendamentos' },
  { to: '/servicos', icon: 'scissors', label: 'Servicos' },
  { to: '/profissionais', icon: 'person', label: 'Profissionais' },
  { to: '/assinatura', icon: 'dollar', label: 'Assinatura e contas' },
]

const supportNav: NavigationItem[] = [
  { to: '/suporte', icon: 'dashboard', label: 'Central de suporte' },
]

const billingMeta: Record<BillingStatusKey, { label: string; className: string }> = {
  TRIAL: { label: 'Cortesia ativa', className: 'badge badge-blue' },
  ACTIVE: { label: 'Pagamento em dia', className: 'badge badge-green' },
  OVERDUE: { label: 'Pagamento pendente', className: 'badge badge-gold' },
  BLOCKED: { label: 'Acesso bloqueado', className: 'badge badge-red' },
}

interface LayoutProps {
  children: ReactNode
}

export function Layout({ children }: LayoutProps) {
  const { user, logout, returnToSupport, hasSupportSession } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const mainContentRef = useRef<HTMLElement | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    setMenuOpen(false)
    mainContentRef.current?.scrollTo({ top: 0, behavior: 'auto' })
  }, [location.pathname])

  useEffect(() => {
    if (!menuOpen) return undefined

    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
      }
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen])

  const supportUser = isSupportUser(user)
  const impersonationActive = isImpersonating(user)
  const { clinicName, brandLogo, brandSubtitle, initials } = useMemo(
    () => getClinicBranding(user as AuthUser | null | undefined),
    [user]
  )

  const billing = supportUser
    ? { label: 'Operacao tecnica', className: 'badge badge-gold' }
    : (billingMeta[(user?.billing?.effectiveStatus as BillingStatusKey) || 'TRIAL'] || billingMeta.TRIAL)

  const navigation = supportUser ? supportNav : clinicNav

  async function handleReturnToSupport() {
    try {
      await returnToSupport()
      navigate('/suporte')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nao foi possivel restaurar a sessao de suporte'
      toast.error(message)
    }
  }

  function handleLogout() {
    logout()
    navigate('/login')
  }

  function closeMenu() {
    setMenuOpen(false)
  }

  return (
    <div className={`app-shell ${menuOpen ? 'menu-open' : ''}`}>
      <a className="skip-link" href="#main-content">
        Ir para o conteudo principal
      </a>

      {menuOpen ? (
        <button
          type="button"
          className="shell-overlay visible"
          aria-label="Fechar menu lateral"
          onClick={closeMenu}
        />
      ) : null}

      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="sidebar-mobile-head">
          <div className="sidebar-logo">
            <div className="sidebar-brand-mark">
              <img src={brandLogo} alt={`Logo de ${clinicName}`} />
            </div>
            <div>
              <h1>{clinicName}</h1>
              <span>{brandSubtitle}</span>
            </div>
          </div>

          <button
            type="button"
            className="icon-btn sidebar-close-btn"
            aria-label="Fechar menu"
            onClick={closeMenu}
          >
            <Icon name="x" />
          </button>
        </div>

        <div className="sidebar-clinic">
          <div className="sidebar-clinic-label">{supportUser ? 'Acesso tecnico' : 'Clinica ativa'}</div>
          <strong>{clinicName}</strong>
          <p>
            {supportUser
              ? 'Localize a conta correta e assuma uma sessao de manutencao com rastreabilidade antes de editar qualquer dado da clinica.'
              : impersonationActive
                ? 'Sessao de manutencao ativa. Voce esta navegando como a clinica para realizar ajustes, suporte ou atualizacao.'
                : 'Agenda, atendimento, POPs e prontuario com identidade visual da propria clinica.'}
          </p>
          <div className="sidebar-clinic-status">
            <span className={billing.className}>{billing.label}</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section">{supportUser ? 'Suporte' : 'Navegacao'}</div>
          {navigation.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/' || item.to === '/suporte'}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              onClick={closeMenu}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <NavLink
            to="/contatar-suporte"
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            onClick={closeMenu}
          >
            <Icon name="mail" />
            <span>Contatar suporte</span>
          </NavLink>

          {impersonationActive && hasSupportSession ? (
            <button type="button" className="nav-item" onClick={() => void handleReturnToSupport()}>
              <Icon name="back" />
              <span>Voltar ao suporte</span>
            </button>
          ) : null}

          <div className="user-chip">
            <div className="user-avatar">{initials}</div>
            <div className="user-info">
              <div className="user-name">{clinicName}</div>
              <div className="user-role">
                {supportUser
                  ? 'Operacao tecnica'
                  : impersonationActive
                    ? 'Sessao de manutencao'
                    : (user?.email || "Equipe L'Appui")}
              </div>
            </div>
          </div>

          <button type="button" className="nav-item nav-item-logout" onClick={handleLogout}>
            <Icon name="logout" />
            <span>Sair</span>
          </button>
        </div>
      </aside>

      <div className="content-shell">
        <header className="mobile-bar">
          <button
            type="button"
            className="icon-btn"
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menu"
          >
            <Icon name="menu" />
          </button>

          <div className="mobile-brand">
            <img src={brandLogo} alt={`Logo de ${clinicName}`} />
            <div>
              <strong>{clinicName}</strong>
              <span>{brandSubtitle}</span>
            </div>
          </div>
        </header>

        {impersonationActive ? (
          <div className="support-session-banner">
            <div>
              <strong>Modo manutencao ativo</strong>
              <span>Voce esta no ambiente de {clinicName}. A navegacao segue rastreada ate o retorno ao suporte.</span>
            </div>
            {hasSupportSession ? (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => void handleReturnToSupport()}>
                <Icon name="back" /> Voltar ao suporte
              </button>
            ) : null}
          </div>
        ) : null}

        <main id="main-content" className="main-content" ref={mainContentRef} tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  )
}


