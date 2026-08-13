import { useState } from 'react'
import { Icon } from '../Icon'

interface Photo {
  id: string
  dataUrl: string
  caption?: string
  date: string
}

interface BeforeAfterSliderProps {
  photos: Photo[]
  onClose: () => void
}

function formatDate(value: string | number | null | undefined) {
  if (!value) return 'Não informado'
  const normalizedValue = String(value).length <= 10 ? String(value).slice(0, 10) + 'T12:00:00.000Z' : value
  const parsedDate = new Date(normalizedValue)
  if (Number.isNaN(parsedDate.getTime())) return 'Data inválida'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(parsedDate)
}

export function BeforeAfterSlider({ photos, onClose }: BeforeAfterSliderProps) {
  const [beforePhotoId, setBeforePhotoId] = useState<string>('')
  const [afterPhotoId, setAfterPhotoId] = useState<string>('')
  const [sliderPosition, setSliderPosition] = useState<number>(50)

  const beforePhoto = photos.find(p => p.id === beforePhotoId)
  const afterPhoto = photos.find(p => p.id === afterPhotoId)

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: '750px', width: '90%', padding: '24px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '12px' }}>
          <h2 className="modal-title" style={{ margin: 0 }}>Comparador de Fotos Antes/Depois</h2>
          <button type="button" className="btn btn-ghost" onClick={onClose} style={{ padding: '4px', minWidth: 'auto' }}>
            <Icon name="x" size={20} />
          </button>
        </div>

        {photos.length === 0 ? (
          <div style={{ padding: '36px', textAlign: 'center', color: 'var(--ink-soft)' }}>
            Nenhuma foto cadastrada no prontuário para comparação.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>

            {/* Seletores */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label className="form-label" style={{ fontWeight: 'bold' }}>Foto "Antes" (Esquerda)</label>
                <select className="form-select" value={beforePhotoId} onChange={e => setBeforePhotoId(e.target.value)}>
                  <option value="">Selecione</option>
                  {photos.map((p, idx) => (
                    <option key={p.id} value={p.id}>
                      Foto #{idx + 1} - {formatDate(p.date)} {p.caption ? `(${p.caption})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label className="form-label" style={{ fontWeight: 'bold' }}>Foto "Depois" (Direita)</label>
                <select className="form-select" value={afterPhotoId} onChange={e => setAfterPhotoId(e.target.value)}>
                  <option value="">Selecione</option>
                  {photos.map((p, idx) => (
                    <option key={p.id} value={p.id}>
                      Foto #{idx + 1} - {formatDate(p.date)} {p.caption ? `(${p.caption})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Área do Comparador */}
            {!beforePhoto || !afterPhoto ? (
              <div style={{ padding: '48px', textAlign: 'center', background: 'rgba(0,0,0,0.1)', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.06)', color: 'var(--ink-soft)' }}>
                Selecione as fotos de "Antes" e "Depois" acima para iniciar a comparação deslizante.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
                <div style={{ position: 'relative', width: '100%', maxWidth: '450px', aspectRatio: '4 / 5', background: 'rgba(0,0,0,0.3)', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255, 255, 255, 0.08)', boxShadow: '0 8px 32px rgba(0,0,0,0.3)', userSelect: 'none' }}>

                  {/* Imagem "Depois" (base) */}
                  <img src={afterPhoto.dataUrl} style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} alt="Depois" />

                  {/* Imagem "Antes" (sobreposta com clip) */}
                  <img
                    src={beforePhoto.dataUrl}
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none', clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
                    alt="Antes"
                  />

                  {/* Rótulo Antes */}
                  <span style={{ position: 'absolute', bottom: '12px', left: '12px', background: 'rgba(0,0,0,0.7)', color: 'var(--gold-light)', padding: '4px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 'bold', zIndex: 10, border: '1px solid rgba(182, 137, 77, 0.2)' }}>
                    ANTES ({formatDate(beforePhoto.date)})
                  </span>

                  {/* Rótulo Depois */}
                  <span style={{ position: 'absolute', bottom: '12px', right: '12px', background: 'rgba(0,0,0,0.7)', color: '#fff', padding: '4px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 'bold', zIndex: 10, border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                    DEPOIS ({formatDate(afterPhoto.date)})
                  </span>

                  {/* Range invisible cobrindo tudo */}
                  <input
                    type="range" min="0" max="100" value={sliderPosition}
                    onChange={e => setSliderPosition(Number(e.target.value))}
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'ew-resize', zIndex: 30, margin: 0 }}
                  />

                  {/* Linha divisória */}
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${sliderPosition}%`, width: '2px', background: 'var(--gold)', boxShadow: '0 0 10px rgba(182, 137, 77, 0.8)', pointerEvents: 'none', zIndex: 20 }}>
                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '36px', height: '36px', borderRadius: '50%', background: 'var(--gold-deep)', border: '2px solid var(--gold-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.4)', color: '#fff', fontWeight: 'bold', fontSize: '1rem', userSelect: 'none' }}>
                      ↔
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', background: 'rgba(182, 137, 77, 0.06)', border: '1px solid rgba(182, 137, 77, 0.12)', borderRadius: '12px', marginTop: '4px' }}>
                  <Icon name="sparkles" size={14} style={{ color: 'var(--gold)', flexShrink: 0 }} />
                  <span style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', fontWeight: 500 }}>
                    <strong>Dica de uso:</strong> Arraste a linha divisória horizontalmente para comparar o antes e depois.
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
