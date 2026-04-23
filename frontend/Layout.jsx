import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from './useAuth'
import { Icon } from './Icon'
import { getClinicBranding } from './branding'
import { isImpersonating, isSupportUser } from './support'

const clinicNav = [
  { to: '/', icon: 'dashboard', label: 'Painel Clínico' },
  { to: '/documentos', icon: 'fileText', label: 'Documentos' },
  { to: '/produtos-e-equipamentos', icon: 'box', label: 'Produtos e Equipamentos' },
  { to: '/clientes', icon: 'users', label: 'Clientes' },
  { to: '/agendamentos', icon: 'calendar', label: 'Agendamentos' },
  { to: '/servicos', icon: 'scissors', label: 'Serviços' },
  { to: '/profissionais', icon: 'person', label: 'Profissionais' },
  { to: '/assinatura', icon: 'dollar', label: 'Assinatura e contas' },
]

const supportNav = [
  { to: '/suporte', icon: 'dashboard', label: 'Central de suporte' },
]

const billingMeta = {
  TRIAL: { label: 'Cortesia ativa', className: 'badge badge-blue' },
  ACTIVE: { label: 'Pagamento em dia', className: 'badge badge-green' },
  OVERDUE: { label: 'Pagamento pendente', className: 'badge badge-gold' },
  BLOCKED: { label: 'Acesso bloqueado', className: 'badge badge-red' },
}


export function Layout({ children }) {
  const { user, logout, returnToSupport, hasSupportSession } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const mainContentRef = useRef(null)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    setMenuOpen(false)
    mainContentRef.current?.scrollTo({ top: 0, behavior: 'auto' })
  }, [location.pathname])

  useEffect(() => {
    if (!menuOpen) return undefined

    const previousOverflow = document.body.style.overflow
    const handleKeyDown = event => {
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
    () => getClinicBranding(user),
    [user]
  )

  const billing = supportUser
    ? { label: 'Operação técnica', className: 'badge badge-gold' }
    : (billingMeta[user?.billing?.effectiveStatus] || billingMeta.TRIAL)

  const navigation = supportUser ? supportNav : clinicNav

  async function handleReturnToSupport() {
    try {
      await returnToSupport()
      navigate('/suporte')
    } catch (error) {
      toast.error(error.message || 'Não foi possível restaurar a sessão de suporte')
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
        Ir para o conteúdo principal
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
          <div className="sidebar-clinic-label">{supportUser ? 'Acesso técnico' : 'Clínica ativa'}</div>
          <strong>{clinicName}</strong>
          <p>
            {supportUser
              ? 'Localize a conta correta e assuma uma sessão de manutenção com rastreabilidade antes de editar qualquer dado da clínica.'
              : impersonationActive
                ? 'Sessão de manutenção ativa. Você está navegando como a clínica para realizar ajustes, suporte ou atualização.'
                : 'Agenda, atendimento, POPs e prontuário com identidade visual da própria clínica.'}
          </p>
          <div className="sidebar-clinic-status">
            <span className={billing.className}>{billing.label}</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section">{supportUser ? 'Suporte' : 'Navegação'}</div>
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
            <button type="button" className="nav-item" onClick={handleReturnToSupport}>
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
                  ? 'Operação técnica'
                  : impersonationActive
                    ? 'Sessão de manutenção'
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
              <strong>Modo manutenção ativo</strong>
              <span>Você está no ambiente de {clinicName}. A navegação segue rastreada até o retorno ao suporte.</span>
            </div>
            {hasSupportSession ? (
              <button type="button" className="btn btn-outline btn-sm" onClick={handleReturnToSupport}>
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

