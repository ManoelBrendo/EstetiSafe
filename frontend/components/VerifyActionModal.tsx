import { useState, useEffect, useRef } from 'react'
import { Icon } from '../Icon'
import api from '../api'
import toast from 'react-hot-toast'

interface VerifyActionModalProps {
  isOpen: boolean
  title?: string
  description?: string
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}

export function VerifyActionModal({
  isOpen,
  title = 'Confirmação de Segurança',
  description = 'Para confirmar esta ação crítica, por favor digite a sua senha de acesso.',
  onConfirm,
  onCancel
}: VerifyActionModalProps) {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      setPassword('')
      setTimeout(() => {
        inputRef.current?.focus()
      }, 100)
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password) {
      toast.error('Por favor, digite a sua senha.')
      return
    }

    setLoading(true)
    try {
      await api.post('/auth/verify-password', { password })
      await onConfirm()
      setPassword('')
    } catch (err) {
      toast.error('Senha incorreta. Confirmação negada.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 10000 }}>
      <div className="modal" style={{ maxWidth: '400px', width: '100%', padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div style={{ background: 'rgba(178, 74, 72, 0.1)', color: 'var(--danger)', width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="shield" size={20} />
          </div>
          <h3 className="section-title" style={{ margin: 0, fontSize: '1.2rem' }}>{title}</h3>
        </div>
        
        <p className="section-copy" style={{ fontSize: '0.88rem', marginBottom: '20px', lineHeight: '1.5' }}>
          {description}
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group">
            <label className="form-label">Senha de Acesso *</label>
            <input
              ref={inputRef}
              type="password"
              className="form-input"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Digite sua senha"
              disabled={loading}
              autoComplete="current-password"
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onCancel}
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn btn-gold"
              disabled={loading || !password}
            >
              {loading ? 'Confirmando...' : 'Confirmar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
