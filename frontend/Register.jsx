import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from './useAuth'
import { Icon } from './Icon'
import { getApiErrorMessage } from './api'
import logoPath from './lappui-mark.svg'
import { getPasswordPolicyStatus, passwordPolicyHint } from './passwordPolicy'

function validateRegisterForm(form, passwordStatus) {
  if (!form.clinicName.trim()) {
    return 'Informe o nome da clínica para continuar.'
  }

  const normalizedEmail = form.email.trim().toLowerCase()
  if (!normalizedEmail) {
    return 'Informe o e-mail oficial da clínica.'
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return 'Informe um e-mail válido para criar a conta.'
  }

  if (!passwordStatus.isValid) {
    return passwordPolicyHint
  }

  return ''
}

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '', clinicName: '' })
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState('')
  const passwordStatus = useMemo(() => getPasswordPolicyStatus(form.password), [form.password])

  function updateField(key) {
    return event => {
      if (formError) setFormError('')
      setForm(current => ({ ...current, [key]: event.target.value }))
    }
  }

  async function handleSubmit(event) {
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
            <input
              id="register-clinic-name"
              className="form-input"
              placeholder="Ex: Clínica Aurora"
              value={form.clinicName}
              onChange={updateField('clinicName')}
              autoComplete="organization"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="register-email">E-mail oficial</label>
            <input
              id="register-email"
              className="form-input"
              type="email"
              placeholder="contato@clinica.com"
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

          <div className="form-group">
            <label className="form-label" htmlFor="register-password">Senha</label>
            <div className="auth-input-shell">
              <input
                id="register-password"
                className="form-input"
                type={showPassword ? 'text' : 'password'}
                placeholder="Ex: A!@246813579246"
                value={form.password}
                onChange={updateField('password')}
                autoComplete="new-password"
                autoCorrect="off"
                minLength={15}
                spellCheck={false}
                required
              />
              <button
                type="button"
                className="auth-input-action"
                onClick={() => setShowPassword(current => !current)}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                <Icon name={showPassword ? 'eyeOff' : 'eye'} />
                {showPassword ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
          </div>

          {formError ? (
            <div className="login-feedback login-feedback-error" role="alert">
              {formError}
            </div>
          ) : null}

          <div className="register-password-panel" aria-live="polite">
            <strong>Critérios da senha</strong>
            <div className={`register-password-rule ${passwordStatus.lettersOk ? 'ok' : ''}`}>Pelo menos 1 letra</div>
            <div className={`register-password-rule ${passwordStatus.specialOk ? 'ok' : ''}`}>Pelo menos 2 caracteres especiais</div>
            <div className={`register-password-rule ${passwordStatus.digitsOk ? 'ok' : ''}`}>Pelo menos 12 números</div>
            <div className={`register-password-rule ${passwordStatus.sequenceOk ? 'ok' : ''}`}>Sem sequências como 1234, 4321 ou 1111</div>
          </div>

          <p className="register-helper-text">{passwordPolicyHint}</p>

          <button className="btn btn-gold btn-block login-submit" type="submit" disabled={loading}>
            {loading ? <span className="spinner" /> : 'Criar minha conta'}
          </button>

          <p className="login-register-row">Já possui acesso <Link className="login-register-link" to="/login">Entrar</Link></p>
        </form>
      </section>
    </main>
  )
}
