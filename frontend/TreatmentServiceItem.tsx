import { Icon } from './Icon'
import type { TreatmentService } from './clinicalTypes'

interface TreatmentServiceItemProps {
  service: TreatmentService
  readOnly?: boolean
  onOpen: (service: TreatmentService) => void
  onRemove: (id: string) => void
}

function buildDescriptionPreview(service: TreatmentService) {
  const description = (service.description || '').trim()
  if (!description) return 'Clique para definir sessões, descrição clínica e efeitos adversos.'
  return description.length > 112 ? description.slice(0, 109) + '...' : description
}

export function TreatmentServiceItem({ service, readOnly = false, onOpen, onRemove }: TreatmentServiceItemProps) {
  return (
    <article className="treatment-service-item">
      <button type="button" className="treatment-service-button" onClick={() => onOpen(service)}>
        <div className="treatment-service-topline">
          <span className="badge badge-gold">{service.sessions} sessão(ões)</span>
          <span className="treatment-service-hint">{readOnly ? 'Visualizar detalhes' : 'Editar detalhes'}</span>
        </div>

        <div className="treatment-service-copy">
          <h3>{service.name || 'Novo serviço do protocolo'}</h3>
          <p>{buildDescriptionPreview(service)}</p>
        </div>

        <div className="treatment-service-footer">
          <span>
            {service.adverseEffects?.trim()
              ? 'Efeitos adversos registrados.'
              : 'Inclua efeitos adversos esperados no modal.'}
          </span>
          <strong>
            <Icon name="edit" size={14} /> {readOnly ? 'Abrir visualização' : 'Abrir modal'}
          </strong>
        </div>
      </button>

      {!readOnly ? (
        <button type="button" className="btn btn-ghost btn-sm danger-ghost treatment-service-remove" onClick={() => onRemove(service.id)}>
          <Icon name="trash" /> Remover
        </button>
      ) : null}
    </article>
  )
}
