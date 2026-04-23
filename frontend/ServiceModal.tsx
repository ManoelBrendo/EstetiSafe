import { useEffect, useState, type ChangeEvent } from 'react'
import { Icon } from './Icon'
import type { TreatmentService } from './clinicalTypes'

interface ServiceModalProps {
  service: TreatmentService | null
  open: boolean
  saving?: boolean
  readOnly?: boolean
  onClose: () => void
  onSave: (service: TreatmentService) => void
}

const emptyDraft: TreatmentService = {
  id: '',
  name: '',
  sessions: 1,
  description: '',
  adverseEffects: '',
}

export function ServiceModal({ service, open, saving = false, readOnly = false, onClose, onSave }: ServiceModalProps) {
  const [draft, setDraft] = useState<TreatmentService>(emptyDraft)

  useEffect(() => {
    if (!open || !service) {
      setDraft(emptyDraft)
      return
    }

    setDraft({
      id: service.id,
      name: service.name || '',
      sessions: service.sessions || 1,
      description: service.description || '',
      adverseEffects: service.adverseEffects || '',
    })
  }, [open, service])

  if (!open || !service) return null

  const setField = (key: keyof TreatmentService) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (readOnly) return

    setDraft(current => ({
      ...current,
      [key]: key === 'sessions' ? Number(event.target.value || 1) : event.target.value,
    }))
  }

  function handleSave() {
    if (readOnly) {
      onClose()
      return
    }

    onSave({
      ...draft,
      sessions: Number.isFinite(Number(draft.sessions)) ? Math.max(1, Number(draft.sessions)) : 1,
    })
  }

  return (
    <div className="modal-backdrop" onClick={event => event.target === event.currentTarget && onClose()}>
      <div className="modal service-modal" role="dialog" aria-modal="true" aria-labelledby="service-modal-title">
        <div className="service-modal-head">
          <div>
            <div className="eyebrow">Detalhes do serviço</div>
            <h2 className="modal-title" id="service-modal-title">Configurar item do protocolo</h2>
            <p className="section-copy">
              {readOnly
                ? 'Consulta em modo de leitura. O prontuário deste cliente está bloqueado para edição.'
                : 'Ajuste nome, sessões, descrição clínica e efeitos adversos específicos deste procedimento.'}
            </p>
          </div>

          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Fechar modal do serviço">
            <Icon name="x" />
          </button>
        </div>

        <div className="form-grid">
          <div className="form-group form-full">
            <label className="form-label">Nome do serviço *</label>
            <input className="form-input" value={draft.name} onChange={setField('name')} placeholder="Ex: Microagulhamento facial" disabled={readOnly} />
          </div>

          <div className="form-group">
            <label className="form-label">Número de sessões *</label>
            <input className="form-input" type="number" min="1" max="99" value={draft.sessions} onChange={setField('sessions')} disabled={readOnly} />
          </div>

          <div className="form-group form-full">
            <label className="form-label">Descrição do serviço</label>
            <textarea
              className="form-textarea"
              rows={5}
              value={draft.description}
              onChange={setField('description')}
              placeholder="Detalhe a lógica do atendimento, foco clínico, técnica ou observações úteis para o protocolo."
              disabled={readOnly}
            />
          </div>

          <div className="form-group form-full">
            <label className="form-label">Efeitos adversos do procedimento *</label>
            <textarea
              className="form-textarea"
              rows={5}
              value={draft.adverseEffects}
              onChange={setField('adverseEffects')}
              placeholder="Ex: vermelhidão transitória, sensibilidade leve, descamação controlada."
              disabled={readOnly}
            />
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            {readOnly ? 'Fechar' : 'Cancelar'}
          </button>
          {!readOnly ? (
            <button type="button" className="btn btn-gold" onClick={handleSave} disabled={saving}>
              {saving ? <span className="spinner" /> : 'Salvar serviço'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
