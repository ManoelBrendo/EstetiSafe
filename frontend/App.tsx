import { Suspense, lazy, useEffect } from 'react'
import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './useAuth'
import MarketingSite from './MarketingSite'
import { authStorage } from './api'
import type { AuthUser } from './types'

const Layout = lazy(() => import('./Layout').then(module => ({ default: module.Layout })))
const Login = lazy(() => import('./Login'))
const Register = lazy(() => import('./Register'))
const Dashboard = lazy(() => import('./Dashboard'))
const Clientes = lazy(() => import('./Clientes'))
const ClienteProntuario = lazy(() => import('./ClienteProntuario'))
const ClienteConsentimentoAssinatura = lazy(() => import('./ClienteConsentimentoAssinatura'))
const ClienteAnamnese = lazy(() => import('./ClienteAnamnese'))
const Documentos = lazy(() => import('./Documentos'))
const Auditoria = lazy(() => import('./Auditoria'))
const Intercorrencias = lazy(() => import('./Intercorrencias'))
const ProdutosEquipamentos = lazy(() => import('./ProdutosEquipamentos'))
const Agendamentos = lazy(() => import('./Agendamentos'))
const Assinatura = lazy(() => import('./Pagamentos'))
const Configuracoes = lazy(() => import('./Configuracoes'))
const Servicos = lazy(() => import('./Servicos'))
const Profissionais = lazy(() => import('./Profissionais'))
const ProfissionalFicha = lazy(() => import('./ProfissionalFicha'))
const SupportHub = lazy(() => import('./SupportHub'))
const SupportContato = lazy(() => import('./SupportContato'))

interface RouteLoaderProps {
  label?: string
}

function RouteLoader({ label = "Preparando sua experiÃªncia L'Appui..." }: RouteLoaderProps) {
  return (
    <div className="loading-page loading-page-full">
      <span className="spinner" />
      {label}
    </div>
  )
}

interface ScreenWrapperProps {
  children: ReactNode
  label?: string
}

function LazyScreen({ children, label }: ScreenWrapperProps) {
  return (
    <Suspense fallback={<RouteLoader label={label} />}>
      {children}
    </Suspense>
  )
}

function LayoutScreen({ children, label }: ScreenWrapperProps) {
  return (
    <LazyScreen label={label}>
      <Layout>{children}</Layout>
    </LazyScreen>
  )
}

function getAuthenticatedHome(user?: AuthUser | null) {
  return user?.role === 'SUPPORT' ? '/suporte' : '/painel'
}

function PrivateRoute({ children }: { children: ReactNode }) {
  const { isAuth, isReady } = useAuth()
  if (!isReady) return <RouteLoader />
  return isAuth ? <>{children}</> : <Navigate to="/login" replace />
}

function ClinicRoute({ children }: { children: ReactNode }) {
  const { isAuth, isReady, user } = useAuth()
  if (!isReady) return <RouteLoader />
  if (!isAuth) return <Navigate to="/login" replace />
  if (user?.role === 'SUPPORT') return <Navigate to="/suporte" replace />
  return <>{children}</>
}

function SupportOnlyRoute({ children }: { children: ReactNode }) {
  const { isAuth, isReady, user } = useAuth()
  if (!isReady) return <RouteLoader label="Validando acesso tÃ©cnico..." />
  if (!isAuth) return <Navigate to="/login" replace />
  if (user?.role !== 'SUPPORT') return <Navigate to="/painel" replace />
  return <>{children}</>
}

function PublicRoute({ children }: { children: ReactNode }) {
  const { isAuth, isReady, user } = useAuth()
  if (!isReady) return <RouteLoader label="Verificando seu acesso..." />
  return isAuth ? <Navigate to={getAuthenticatedHome(user)} replace /> : <>{children}</>
}

function LandingRoute() {
  const { isAuth, isReady, user } = useAuth()
  if (!isReady) return <RouteLoader label="Preparando o site..." />
  if (isAuth) return <Navigate to={getAuthenticatedHome(user)} replace />
  return <MarketingSite />
}

function HomeRoute() {
  const { user } = useAuth()
  if (user?.role === 'SUPPORT') return <Navigate to="/suporte" replace />

  return (
    <LayoutScreen label="Carregando o painel clÃ­nico...">
      <Dashboard />
    </LayoutScreen>
  )
}

function LocalDemoLogin() {
  useEffect(() => {
    const allowedHosts = new Set(['localhost', '127.0.0.1', '10.0.2.2'])

    if (!allowedHosts.has(window.location.hostname)) {
      window.location.replace('/')
      return
    }

    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    const redirect = params.get('redirect') || '/painel'

    if (!token) return

    const host = window.location.hostname === '127.0.0.1' ? 'localhost' : window.location.hostname
    const apiBase = `${window.location.protocol}//${host}:3000`

    fetch(`${apiBase}/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
      .then(response => {
        if (!response.ok) {
          throw new Error('Falha ao buscar a sessÃ£o da demo local')
        }
        return response.json()
      })
      .then((user: AuthUser) => {
        authStorage.setSession(token, user)
        authStorage.clearSupportSession()
        window.location.replace(redirect)
      })
      .catch(error => {
        console.error('NÃ£o foi possÃ­vel preparar a demo local', error)
      })
  }, [])

  return <RouteLoader label="Ativando demo local..." />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingRoute />} />
      <Route path="/site" element={<MarketingSite />} />
      <Route path="/login" element={<PublicRoute><LazyScreen label="Abrindo acesso da clÃ­nica..."><Login /></LazyScreen></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><LazyScreen label="Preparando o cadastro da clÃ­nica..."><Register /></LazyScreen></PublicRoute>} />
      <Route path="/local-demo-login" element={<LocalDemoLogin />} />
      <Route path="/painel" element={<PrivateRoute><HomeRoute /></PrivateRoute>} />
      <Route path="/suporte" element={<SupportOnlyRoute><LayoutScreen label="Carregando central de suporte..."><SupportHub /></LayoutScreen></SupportOnlyRoute>} />
      <Route path="/contatar-suporte" element={<PrivateRoute><LayoutScreen label="Abrindo canais de suporte..."><SupportContato /></LayoutScreen></PrivateRoute>} />
      <Route path="/documentos" element={<ClinicRoute><LayoutScreen label="Abrindo documentos sanitÃ¡rios..."><Documentos /></LayoutScreen></ClinicRoute>} />
      <Route path="/auditoria" element={<ClinicRoute><LayoutScreen label="Carregando auditoria da clÃ­nica..."><Auditoria /></LayoutScreen></ClinicRoute>} />
      <Route path="/produtos-e-equipamentos" element={<ClinicRoute><LayoutScreen label="Carregando produtos e equipamentos..."><ProdutosEquipamentos /></LayoutScreen></ClinicRoute>} />
      <Route path="/clientes" element={<ClinicRoute><LayoutScreen label="Carregando clientes e prontuÃ¡rios..."><Clientes /></LayoutScreen></ClinicRoute>} />
      <Route path="/intercorrencias" element={<ClinicRoute><LayoutScreen label="Carregando intercorrÃªncias da clÃ­nica..."><Intercorrencias /></LayoutScreen></ClinicRoute>} />
      <Route path="/clientes/:clientId" element={<ClinicRoute><LayoutScreen label="Abrindo prontuÃ¡rio do cliente..."><ClienteProntuario /></LayoutScreen></ClinicRoute>} />
      <Route path="/assinatura" element={<ClinicRoute><LayoutScreen label="Carregando assinatura da clÃ­nica..."><Assinatura /></LayoutScreen></ClinicRoute>} />
      <Route path="/pagamentos" element={<Navigate to="/assinatura" replace />} />
      <Route path="/configuracoes" element={<ClinicRoute><LayoutScreen label="Abrindo configuracoes da clinica..."><Configuracoes /></LayoutScreen></ClinicRoute>} />
      <Route path="/clientes/:clientId/anamnese" element={<ClinicRoute><LayoutScreen label="Abrindo anamnese do cliente..."><ClienteAnamnese /></LayoutScreen></ClinicRoute>} />
      <Route path="/clientes/:clientId/consentimentos/:consentRecordId/assinar" element={<ClinicRoute><LayoutScreen label="Preparando assinatura do consentimento..."><ClienteConsentimentoAssinatura /></LayoutScreen></ClinicRoute>} />
      <Route path="/agendamentos" element={<ClinicRoute><LayoutScreen label="Carregando agenda da clÃ­nica..."><Agendamentos /></LayoutScreen></ClinicRoute>} />
      <Route path="/servicos" element={<ClinicRoute><LayoutScreen label="Abrindo catÃ¡logo de serviÃ§os..."><Servicos /></LayoutScreen></ClinicRoute>} />
      <Route path="/profissionais" element={<ClinicRoute><LayoutScreen label="Carregando equipe profissional..."><Profissionais /></LayoutScreen></ClinicRoute>} />
      <Route path="/profissionais/:professionalId" element={<ClinicRoute><LayoutScreen label="Abrindo ficha da profissional..."><ProfissionalFicha /></LayoutScreen></ClinicRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3500,
            style: {
              fontFamily: 'Manrope, sans-serif',
              fontSize: 14,
              borderRadius: 18,
              background: '#fffaf3',
              color: '#2a1f17',
              border: '1px solid rgba(145, 101, 49, 0.18)',
              boxShadow: '0 18px 38px rgba(58, 39, 19, 0.12)',
            },
            success: {
              iconTheme: {
                primary: '#3f7c67',
                secondary: '#fffaf3',
              },
            },
          }}
        />
      </BrowserRouter>
    </AuthProvider>
  )
}


