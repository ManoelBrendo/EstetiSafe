import { useState } from 'react'
import toast from 'react-hot-toast'
import api, { getApiErrorMessage } from '../api'
import { Icon } from '../Icon'

interface MaskedFieldProps {
  label: string
  maskedValue: string | null | undefined
  clientId: string | number
  fieldType: 'cpf' | 'phone'
}

export function MaskedField({ label, maskedValue, clientId, fieldType }: MaskedFieldProps) {
  const [isRevealed, setIsRevealed] = useState(false)
  const [revealedValue, setRevealedValue] = useState('')
  const [loading, setLoading] = useState(false)

  const handleReveal = async () => {
    if (isRevealed) {
      // Já está revelado, esconde de volta
      setIsRevealed(false)
      return
    }

    const reason = window.prompt(`Justificativa para visualizar o ${label} deste cliente:`)
    if (reason === null) return // Clicou em cancelar

    const trimmedReason = reason.trim()
    if (!trimmedReason) {
      toast.error('É necessário fornecer uma justificativa para visualizar dados confidenciais.')
      return
    }

    setLoading(true)
    try {
      const response = await api.post<{ cpf?: string; phone?: string }>(
        `/api/v2/clients/${clientId}/reveal`,
        { reason: trimmedReason }
      )
      
      const value = fieldType === 'cpf' ? response.data.cpf : response.data.phone
      if (value) {
        setRevealedValue(value)
        setIsRevealed(true)
        toast.success(`${label} revelado com sucesso! Ação registrada em auditoria.`)
      } else {
        throw new Error('Valor não retornado pelo servidor')
      }
    } catch (err) {
      toast.error(getApiErrorMessage(err, `Erro ao revelar ${label}`))
    } finally {
      setLoading(false)
    }
  }

  const hasValue = Boolean(maskedValue)

  return (
    <div className="prontuario-field">
      <span>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <strong>
          {hasValue ? (isRevealed ? revealedValue : maskedValue) : 'Não informado'}
        </strong>
        {hasValue && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleReveal}
            disabled={loading}
            style={{
              padding: '2px 6px',
              minWidth: 'auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isRevealed ? 'var(--gold)' : 'var(--ink-soft)',
            }}
            title={isRevealed ? 'Ocultar dado' : `Revelar ${label}`}
          >
            <Icon name={isRevealed ? 'eyeOff' : 'eye'} size={14} />
          </button>
        )}
      </div>
    </div>
  )
}
