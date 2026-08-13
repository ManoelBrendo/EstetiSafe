import { useMemo, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from './useAuth'
import { Icon } from './Icon'
import { getApiErrorMessage } from './api'
import logoPath from './lappui-mark.svg'
import { getPasswordPolicyStatus, passwordPolicyHint, generateStrongPassword } from './passwordPolicy'

interface RegisterFormState {
  email: string
  password: string
  clinicName: string
}

function validateRegisterForm(form: RegisterFormState, passwordStatus: { isValid: boolean }) {
  if (!form.clinicName.trim()) {
    return 'Informe o nome da clínica para continuar.'
  }

  const normalizedEmail = form.email.trim().toLowerCase()
  if (!normalizedEmail) {
    return 'Informe o e-mail oficial da clínica.'
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return 'Informe um e-mail valido para criar a conta.'
  }

  if (!passwordStatus.isValid) {
    return passwordPolicyHint
  }

  return ''
}

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState<RegisterFormState>({ email: '', password: '', clinicName: '' })
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState('')
  const passwordStatus = useMemo(() => getPasswordPolicyStatus(form.password), [form.password])

  function updateField(key: keyof RegisterFormState) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      if (formError) setFormError('')
      setForm(current => ({ ...current, [key]: event.target.value }))
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const validationError = validateRegisterForm(form, passwordStatus)
    if (validationError) {
      setFormError(validationError)
      toast.error(validationError)
      return
    }

    setLoading(true)

    try {
      await register(form.email.trim().toLowerCase(), form.password, form.clinicName.trim())
      toast.success('Conta criada com sucesso')
      navigate('/painel')
    } catch (error) {
      const message = getApiErrorMessage(error, 'Não foi possível criar sua conta')
      setFormError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }


  return (
    <main className="login-screen auth-register-screen">
      <div className="login-bg-blob login-bg-blob-1" />
      <div className="login-bg-blob login-bg-blob-2" />
      <div className="login-bg-blob login-bg-blob-3" />
      <section className="login-card register-card">
        <div className="login-brand">
          <div className="login-logo-shell">
            <img className="login-logo" src={logoPath} alt="Marca L'Appui" />
          </div>

          <div className="login-brand-copy">
            <span className="eyebrow">Cadastro da clínica</span>
            <strong className="login-brand-name">L'Appui</strong>
            <p className="login-brand-subtitle">
              Crie a conta da clínica com um fluxo direto, consistente e pronto para a operação web.
            </p>
          </div>
        </div>

        <form className="login-form register-form" onSubmit={handleSubmit} noValidate>
          <div className="login-heading register-heading">
            <h1>Criar conta</h1>
            <p>Preencha apenas o essencial para começar. Depois, seguimos para a configuração da operação.</p>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="register-clinic-name">Nome da clínica</label>
            <div className="input-with-icon-wrapper">
              <span className="input-icon-left">
                <Icon name="clipboard" size={20} />
              </span>
              <input
                id="register-clinic-name"
                className="form-input has-icon-left"
                placeholder="Ex: Clínica Aurora"
                value={form.clinicName}
                onChange={updateField('clinicName')}
                autoComplete="organization"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="register-email">E-mail oficial</label>
            <div className="input-with-icon-wrapper">
              <span className="input-icon-left">
                <Icon name="mail" size={20} />
              </span>
              <input
                id="register-email"
                className="form-input has-icon-left"
                type="email"
                placeholder="contato@clínica.com"
                value={form.email}
                onChange={updateField('email')}
                autoComplete="email"
                inputMode="email"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <div className="form-group-header">
              <label className="form-label" htmlFor="register-password">Senha</label>
              <button
                type="button"
                className="forgot-password-link suggest-password-btn"
                onClick={() => {
                  const suggested = generateStrongPassword()
                  setForm(current => ({ ...current, password: suggested }))
                  toast.success('Senha forte gerada!')
                }}
              >
                Sugerir senha segura
              </button>
            </div>
            <div className="input-with-icon-wrapper password-input-wrapper">
              <span className="input-icon-left">
                <Icon name="shield" size={20} />
              </span>
              <input
                id="register-password"
                className="form-input has-icon-left"
                type={showPassword ? 'text' : 'password'}
                placeholder="Ex: Aa!24681357"
                value={form.password}
                onChange={updateField('password')}
                autoComplete="new-password"
                autoCorrect="off"
                minLength={8}
                spellCheck={false}
                required
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword(current => !current)}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                <Icon name={showPassword ? 'eyeOff' : 'eye'} size={20} />
              </button>
            </div>

            {form.password && (
              <div className="password-strength-container">
                <div className="password-strength-bar-wrapper">
                  <div className={`password-strength-bar strength-${passwordStatus.score}`} />
                </div>
                <span className={`password-strength-text strength-${passwordStatus.score}`}>
                  Força da senha: {passwordStatus.score <= 2 ? 'Fraca' : passwordStatus.score <= 4 ? 'Média' : 'Forte!'}
                </span>
              </div>
            )}
          </div>

          {formError ? (
            <div className="login-feedback login-feedback-error" role="alert">
              {formError}
            </div>
          ) : null}

          <div className="register-password-panel" aria-live="polite">
            <strong>Critérios da senha</strong>
            <div className={`register-password-rule ${passwordStatus.hasUppercase ? 'ok' : ''}`}>
              <span className="rule-bullet"></span>
              Letra maiúscula
            </div>
            <div className={`register-password-rule ${passwordStatus.hasLowercase ? 'ok' : ''}`}>
              <span className="rule-bullet"></span>
              Letra minúscula
            </div>
            <div className={`register-password-rule ${passwordStatus.hasSpecial ? 'ok' : ''}`}>
              <span className="rule-bullet"></span>
              Caractere especial
            </div>
            <div className={`register-password-rule ${passwordStatus.has8Digits ? 'ok' : ''}`}>
              <span className="rule-bullet"></span>
              Pelo menos 8 números
            </div>
            <div className={`register-password-rule ${passwordStatus.sequenceOk ? 'ok' : ''}`}>
              <span className="rule-bullet"></span>
              Sem sequências de 4 letras/números
            </div>
          </div>

          <p className="register-helper-text">{passwordPolicyHint}</p>

          <button className="btn btn-gold btn-block login-submit" type="submit" disabled={loading}>
            {loading ? <><span className="spinner" /> Criando...</> : 'Criar minha conta'}
          </button>

          <p className="login-register-row">Já possui acesso? <Link className="login-register-link" to="/login">Entrar</Link></p>
        </form>
      </section>
    </main>
  )
}
