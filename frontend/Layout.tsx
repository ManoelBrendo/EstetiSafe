import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from './useAuth'
import api from './api'
import { Icon } from './Icon'
import { getClinicBranding } from './branding'
import { isImpersonating, isSupportUser } from './support'
import type { AuthUser } from './types'
import lappuiLogo from './lappui-mark.svg'
import { useOfflineSyncStatus } from './offlineSync'
import { resolveNavigation, resolveBillingBadge } from './navigation'

interface LayoutProps {
  children: ReactNode
}

export function Layout({ children }: LayoutProps) {
  const { user, logout, returnToSupport, hasSupportSession } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const mainContentRef = useRef<HTMLElement | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const { isOnline, pendingCount } = useOfflineSyncStatus()

  const [isLocked, setIsLocked] = useState(() => sessionStorage.getItem('estetisafe-session-locked') === 'true')
  const [showPassword, setShowPassword] = useState(false)
  const [password, setPassword] = useState('')
  const [unlocking, setUnlocking] = useState(false)
  const [showBackToTop, setShowBackToTop] = useState(false)
  const pinInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    document.body.classList.remove('theme-dark')
    document.documentElement.classList.remove('theme-dark')
    localStorage.removeItem('estetisafe-theme')
  }, [])

  useEffect(() => {
    if (isLocked) {
      const t = setTimeout(() => {
        pinInputRef.current?.focus()
      }, 100)
      return () => clearTimeout(t)
    }
  }, [isLocked])

  useEffect(() => {
    const mainEl = mainContentRef.current
    if (!mainEl) return

    const handleScroll = () => {
      setShowBackToTop(mainEl.scrollTop > 300)
    }

    mainEl.addEventListener('scroll', handleScroll)
    return () => {
      mainEl.removeEventListener('scroll', handleScroll)
    }
  }, [])

  const scrollToTop = () => {
    mainContentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

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

  useEffect(() => {
    const handleGlobalShortcuts = (e: KeyboardEvent) => {
      // Ctrl + Alt + N (or Cmd + Alt + N) -> Novo Cliente
      if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        navigate('/clientes?action=new')
      }

      // Ctrl + Alt + F (or Cmd + Alt + F) -> Buscar
      if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        const input = document.getElementById('search-input') || 
                      document.querySelector('input[name="search"]') ||
                      document.querySelector('input[type="search"]')
        if (input) {
          (input as HTMLInputElement).focus();
          (input as HTMLInputElement).select();
        }
      }

      // Escape -> fechar modais
      if (e.key === 'Escape') {
        const closeBtn = document.querySelector('.btn-close') || 
                         document.querySelector('.modal-close-btn') || 
                         document.querySelector('.btn-ghost') ||
                         document.querySelector('.modal-overlay')
        if (closeBtn) {
          (closeBtn as HTMLElement).click()
        }
      }
    }

    window.addEventListener('keydown', handleGlobalShortcuts)
    return () => {
      window.removeEventListener('keydown', handleGlobalShortcuts)
    }
  }, [navigate])

  useEffect(() => {
    if (!user || isLocked) return

    const INACTIVITY_TIMEOUT = 5 * 60 * 1000 // 5 minutes
    let lastActivity = Date.now()

    const handleActivity = () => {
      const now = Date.now()
      if (now - lastActivity > 2000) {
        lastActivity = now
      }
    }

    window.addEventListener('mousemove', handleActivity)
    window.addEventListener('mousedown', handleActivity)
    window.addEventListener('keydown', handleActivity)
    window.addEventListener('touchstart', handleActivity)
    window.addEventListener('scroll', handleActivity)

    const interval = setInterval(() => {
      const now = Date.now()
      if (now - lastActivity >= INACTIVITY_TIMEOUT) {
        setIsLocked(true)
        sessionStorage.setItem('estetisafe-session-locked', 'true')
      }
    }, 10000)

    return () => {
      window.removeEventListener('mousemove', handleActivity)
      window.removeEventListener('mousedown', handleActivity)
      window.removeEventListener('keydown', handleActivity)
      window.removeEventListener('touchstart', handleActivity)
      window.removeEventListener('scroll', handleActivity)
      clearInterval(interval)
    }
  }, [user, isLocked])

  async function handleUnlock(e: FormEvent) {
    e.preventDefault()
    if (!password) return

    setUnlocking(true)
    try {
      await api.post('/auth/verify-password', { password })
      setIsLocked(false)
      sessionStorage.removeItem('estetisafe-session-locked')
      setPassword('')
      toast.success('Sessão desbloqueada com sucesso!')
    } catch (error) {
      toast.error('Senha incorreta.')
    } finally {
      setUnlocking(false)
    }
  }

  const supportUser = isSupportUser(user)
  const impersonationActive = isImpersonating(user)
  const { clinicName, brandLogo, brandSubtitle, initials } = useMemo(
    () => getClinicBranding(user as AuthUser | null | undefined),
    [user]
  )

  const billing = useMemo(() => resolveBillingBadge(user as AuthUser | null | undefined), [user])
  const navigation = useMemo(() => resolveNavigation(user as AuthUser | null | undefined), [user])

  async function handleReturnToSupport() {
    try {
      await returnToSupport()
      navigate('/suporte')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível restaurar a sessão de suporte'
      toast.error(message)
    }
  }

  function handleLogout() {
    sessionStorage.removeItem('estetisafe-session-locked')
    logout()
    navigate('/login')
  }

  function closeMenu() {
    setMenuOpen(false)
  }

  return (
    <div className={`app-shell ${menuOpen ? 'menu-open' : ''}`}>
      {isLocked ? (
        <div className="lock-screen-overlay">
          <div className="lock-screen-card" role="dialog" aria-modal="true" aria-labelledby="lock-title">
            <div className="lock-screen-logo-wrapper">
              <img src={brandLogo} alt={`Logo de ${clinicName}`} />
            </div>
            <div className="lock-screen-clinic-name">{clinicName}</div>
            <h2 id="lock-title" className="lock-screen-title">Sessão Suspensa</h2>
            <p className="lock-screen-desc">
              Para proteger as informações confidenciais dos pacientes, digite a sua senha de acesso para retomar a sessão.
            </p>
            <div className="lock-screen-user-badge">
              <Icon name="mail" style={{ marginRight: 8 }} />
              <span>{user?.email || "Profissional de Saúde"}</span>
            </div>
            
            <form onSubmit={handleUnlock} className="lock-screen-form">
              <div className="lock-screen-input-wrapper">
                <input
                  ref={pinInputRef}
                  type={showPassword ? 'text' : 'password'}
                  className="lock-screen-input"
                  placeholder="Digite sua senha..."
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  disabled={unlocking}
                  autoFocus
                  required
                />
                <button
                  type="button"
                  className="lock-screen-input-icon-btn"
                  onClick={() => setShowPassword(prev => !prev)}
                  aria-label={showPassword ? 'Esconder senha' : 'Mostrar senha'}
                >
                  <Icon name={showPassword ? 'eyeOff' : 'eye'} />
                </button>
              </div>
              
              <button
                type="submit"
                className="lock-screen-submit-btn"
                disabled={unlocking || !password}
              >
                {unlocking ? 'Desbloqueando...' : 'Desbloquear'}
              </button>
            </form>
            
            <button
              type="button"
              className="lock-screen-logout-btn"
              onClick={handleLogout}
            >
              Sair da conta
            </button>
          </div>
        </div>
      ) : null}

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
        <div className="sidebar-product-signature" aria-label="L'Appui">
          <img src={lappuiLogo} alt="Marca L'Appui" />
          <div>
            <strong>L'Appui</strong>
            <span>Gestão estética premium</span>
          </div>
        </div>

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
              ? 'Localize a conta e registre manutenções sem perder rastreabilidade.'
              : impersonationActive
                ? 'Sessão de manutenção ativa para ajustes pontuais da clínica.'
                : 'Agenda, clientes, documentos e financeiro em um fluxo único.'}
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
              end={item.to === '/painel' || item.to === '/suporte'}
              className={({ isActive }) => `nav-item ${item.to === '/pagamentos' ? 'nav-item-finance' : ''} ${isActive ? 'active' : ''}`}
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

          {!supportUser ? (
            <NavLink
              to="/configuracoes"
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              onClick={closeMenu}
            >
              <Icon name="edit" />
              <span>Configurações</span>
            </NavLink>
          ) : null}



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

          <div className="mobile-product-signature" aria-label="L'Appui">
            <img src={lappuiLogo} alt="" aria-hidden="true" />
            <span>L'Appui</span>
          </div>
        </header>

        {impersonationActive ? (
          <div className="support-session-banner">
            <div>
              <strong>Modo manutenção ativo</strong>
              <span>Você está no ambiente de {clinicName}. A navegação segue rastreada até o retorno ao suporte.</span>
            </div>
            {hasSupportSession ? (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => void handleReturnToSupport()}>
                <Icon name="back" /> Voltar ao suporte
              </button>
            ) : null}
          </div>
        ) : null}

        {!isOnline ? (
          <div className="offline-session-banner" role="alert">
            <div>
              <strong>Modo offline ativo</strong>
              <span>Você está desconectado. Alterações na anamnese ou assinaturas serão salvas localmente e sincronizadas quando a conexão retornar.</span>
            </div>
          </div>
        ) : pendingCount > 0 ? (
          <div className="offline-session-banner sync-pending" role="status">
            <div>
              <strong>Sincronização pendente</strong>
              <span>Existem {pendingCount} alteração(ões) pendente(s) salva(s) offline sendo enviadas ao servidor.</span>
            </div>
          </div>
        ) : null}

        <main id="main-content" className="main-content" ref={mainContentRef} tabIndex={-1}>
          {children}
        </main>

        {showBackToTop ? (
          <button
            type="button"
            className="back-to-top-btn"
            onClick={scrollToTop}
            aria-label="Voltar ao topo"
          >
            <Icon name="arrowUp" size={18} />
          </button>
        ) : null}
      </div>
    </div>
  )
}
