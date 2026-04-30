import { useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from './useAuth'
import { getApiErrorMessage } from './api'
import logoPath from './lappui-mark.svg'

interface LoginFormState {
  email: string
  password: string
}

function validateLoginForm({ email, password }: LoginFormState) {
  const normalizedEmail = email.trim()

  if (!normalizedEmail) {
    return 'Informe o e-mail da clínica.'
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return 'Informe um e-mail valido.'
  }

  if (!password.trim()) {
    return 'Informe sua senha.'
  }

  return ''
}

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState<LoginFormState>({ email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [authError, setAuthError] = useState('')

  function updateField(key: keyof LoginFormState) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value
      setAuthError('')
      setForm(current => ({ ...current, [key]: value }))
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const validationMessage = validateLoginForm(form)
    if (validationMessage) {
      setAuthError(validationMessage)
      toast.error(validationMessage)
      return
    }

    setLoading(true)
    setAuthError('')

    try {
      const authenticatedUser = await login(form.email.trim().toLowerCase(), form.password)
      toast.success('Sessão iniciada com sucesso')
      navigate(authenticatedUser?.role === 'SUPPORT' ? '/suporte' : '/painel')
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status
      const message = status === 404
        ? 'Nenhuma conta encontrada com este e-mail.'
        : getApiErrorMessage(error, 'Não foi possível entrar')

      setAuthError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-screen">
      <section className="login-card" aria-label="Acesso ao painel L'Appui">
        <div className="login-brand">
          <div className="login-logo-shell">
            <img className="login-logo" src={logoPath} alt="Logo L'Appui" />
          </div>
          <div className="login-brand-copy">
            <strong className="login-brand-name">L'Appui</strong>
            <p className="login-brand-subtitle">Acesso ao painel da clínica</p>
          </div>
        </div>

        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <div className="login-heading">
            <h1>Entrar</h1>
            <p>Use seu e-mail e senha para acessar a operação da clínica.</p>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="login-email">E-mail</label>
            <input
              id="login-email"
              className="form-input"
              type="email"
              placeholder="contato@clínica.com"
              value={form.email}
              onChange={updateField('email')}
              autoComplete="email"
              inputMode="email"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={Boolean(authError)}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="login-password">Senha</label>
            <input
              id="login-password"
              className="form-input"
              type="password"
              placeholder="Digite sua senha"
              value={form.password}
              onChange={updateField('password')}
              autoComplete="current-password"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={Boolean(authError)}
            />
          </div>

          {authError ? (
            <div className="login-feedback login-feedback-error" role="alert">
              {authError}
            </div>
          ) : null}

          <button className="btn btn-gold btn-block login-submit" type="submit" disabled={loading}>
            {loading ? <><span className="spinner" /> Entrando...</> : 'Entrar'}
          </button>

          <p className="login-register-row">
            Ainda não possui conta? <Link className="login-register-link" to="/register">Cadastrar</Link>
          </p>
        </form>
      </section>
    </main>
  )
}
