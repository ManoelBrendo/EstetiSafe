import { useState } from 'react'
import toast from 'react-hot-toast'
import { getApiErrorMessage } from '../api'
import { saveClientFacialPoints } from '../clientRecordsApi'
import { Icon } from '../Icon'
import type { FacialPoint } from '../types'

interface FacialMarkingMapProps {
  clientId: string
  initialPoints: FacialPoint[]
  isLocked: boolean
}

export function FacialMarkingMap({ clientId, initialPoints, isLocked }: FacialMarkingMapProps) {
  const [facialPoints, setFacialPoints] = useState<FacialPoint[]>(initialPoints)
  const [selectedType, setSelectedType] = useState<'botox' | 'filler'>('botox')
  const [selectedAmount, setSelectedAmount] = useState<number>(4)

  const totalBotox = facialPoints.filter(p => p.type === 'botox').reduce((sum, p) => sum + p.amount, 0)
  const totalFiller = facialPoints.filter(p => p.type === 'filler').reduce((sum, p) => sum + p.amount, 0)

  const handleRemovePoint = async (id: string) => {
    if (isLocked) { toast.error('Prontuário protegido contra alterações críticas.'); return }
    const updated = facialPoints.filter(p => p.id !== id)
    try {
      const saved = await saveClientFacialPoints(clientId, updated)
      setFacialPoints(saved)
      toast.success('Marcação removida.')
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Erro ao salvar alteração.'))
    }
  }

  const handleClearAll = async () => {
    if (isLocked) { toast.error('Prontuário protegido contra alterações críticas.'); return }
    if (window.confirm('Deseja realmente limpar todas as marcações deste cliente?')) {
      try {
        const saved = await saveClientFacialPoints(clientId, [])
        setFacialPoints(saved)
        toast.success('Todas as marcações foram limpas.')
      } catch (err) {
        toast.error(getApiErrorMessage(err, 'Erro ao limpar marcações.'))
      }
    }
  }

  const handleMapClick = async (e: React.MouseEvent<SVGSVGElement>) => {
    if (isLocked) { toast.error('Prontuário protegido contra alterações críticas.'); return }
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100

    const newPoint: FacialPoint = {
      id: Math.random().toString(36).substring(2, 9),
      x: parseFloat(x.toFixed(1)),
      y: parseFloat(y.toFixed(1)),
      type: selectedType,
      amount: selectedAmount,
    }

    const updated = [...facialPoints, newPoint]
    try {
      const saved = await saveClientFacialPoints(clientId, updated)
      setFacialPoints(saved)
      toast.success('Ponto marcado no mapa facial!')
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Erro ao marcar ponto no mapa facial.'))
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px', alignItems: 'start' }} className="facial-map-grid-responsive">

      {/* Controles */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', background: 'rgba(255, 255, 255, 0.02)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className={`btn ${selectedType === 'botox' ? 'btn-gold' : 'btn-outline'}`}
              onClick={() => { setSelectedType('botox'); setSelectedAmount(4) }}
            >
              <Icon name="sparkles" size={14} style={{ marginRight: '6px' }} />
              Toxina Botulínica (U)
            </button>
            <button
              type="button"
              className={`btn ${selectedType === 'filler' ? 'btn-rose' : 'btn-outline'}`}
              onClick={() => { setSelectedType('filler'); setSelectedAmount(1.0) }}
              style={{
                borderColor: selectedType === 'filler' ? 'var(--rose)' : undefined,
                background: selectedType === 'filler' ? 'var(--rose)' : undefined,
                color: selectedType === 'filler' ? '#fff' : undefined,
              }}
            >
              <Icon name="procedure" size={14} style={{ marginRight: '6px' }} />
              Preenchedor Dérmico (ml)
            </button>
          </div>

          {facialPoints.length > 0 && (
            <button type="button" className="btn btn-outline" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }} onClick={handleClearAll} disabled={isLocked}>
              <Icon name="trash" size={14} style={{ marginRight: '6px' }} />
              Limpar Tudo
            </button>
          )}
        </div>

        {/* Totais */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', background: 'rgba(182, 137, 77, 0.05)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(182, 137, 77, 0.1)' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--gold)' }}>Total Toxina (Botox)</span>
            <strong style={{ fontSize: '1.25rem', color: 'var(--gold)' }}>{totalBotox} U</strong>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', background: 'rgba(172, 118, 109, 0.05)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(172, 118, 109, 0.1)' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--rose)' }}>Total Preenchedores</span>
            <strong style={{ fontSize: '1.25rem', color: 'var(--rose)' }}>{totalFiller.toFixed(1)} ml</strong>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', background: 'rgba(255, 255, 255, 0.03)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--ink-soft)' }}>Pontos Marcados</span>
            <strong style={{ fontSize: '1.25rem', color: 'var(--ink)' }}>{facialPoints.length}</strong>
          </div>
        </div>

        {/* Ajuste de Dose */}
        <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: '600' }}>
            Dose para o próximo ponto:{' '}
            <span style={{ color: selectedType === 'botox' ? 'var(--gold)' : 'var(--rose)', fontSize: '0.95rem' }}>
              {selectedAmount}{selectedType === 'botox' ? ' U' : ' ml'}
            </span>
          </span>

          {/* Presets rápidos */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {selectedType === 'botox'
              ? [2, 4, 6, 8].map(val => (
                  <button key={val} type="button"
                    className={`btn btn-sm ${selectedAmount === val ? 'btn-gold' : 'btn-outline'}`}
                    onClick={() => setSelectedAmount(val)}
                    style={{ padding: '4px 10px', fontSize: '0.8rem', borderRadius: '8px' }}
                  >
                    {val}U
                  </button>
                ))
              : [0.5, 1.0, 1.5, 2.0].map(val => (
                  <button key={val} type="button"
                    className={`btn btn-sm ${selectedAmount === val ? 'btn-rose' : 'btn-outline'}`}
                    onClick={() => setSelectedAmount(val)}
                    style={{
                      padding: '4px 10px', fontSize: '0.8rem', borderRadius: '8px',
                      borderColor: selectedAmount === val ? 'var(--rose)' : undefined,
                      background: selectedAmount === val ? 'var(--rose)' : undefined,
                      color: selectedAmount === val ? '#fff' : undefined,
                    }}
                  >
                    {val}ml
                  </button>
                ))}
          </div>

          {/* Slider customizado */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px' }}>
            <input
              type="range"
              min={selectedType === 'botox' ? 1 : 0.1}
              max={selectedType === 'botox' ? 20 : 5.0}
              step={selectedType === 'botox' ? 1 : 0.1}
              value={selectedAmount}
              onChange={e => setSelectedAmount(parseFloat(e.target.value))}
              disabled={isLocked}
              style={{ flex: 1, accentColor: selectedType === 'botox' ? 'var(--gold)' : 'var(--rose)' }}
            />
          </div>
        </div>
      </div>

      {/* Área Visual do Mapa e Lista Lateral */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', width: '100%' }}>

        {/* SVG do Mapa */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--ink-soft)' }}>
            {isLocked ? 'Visualização protegida' : 'Clique no rosto abaixo para inserir um ponto com a dose selecionada.'}
          </span>
          <div style={{ width: '100%', maxWidth: '340px', aspectRatio: '4 / 5', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', overflow: 'hidden', position: 'relative', boxShadow: 'inset 0 4px 20px rgba(0,0,0,0.4)' }}>
            <svg
              viewBox="0 0 400 500"
              width="100%"
              height="100%"
              onClick={handleMapClick}
              style={{ cursor: isLocked ? 'not-allowed' : 'crosshair', userSelect: 'none' }}
            >
              <defs>
                <radialGradient id="faceGlow" cx="50%" cy="40%" r="50%">
                  <stop offset="0%" stopColor="rgba(182, 137, 77, 0.08)" />
                  <stop offset="100%" stopColor="rgba(0, 0, 0, 0)" />
                </radialGradient>
              </defs>
              <rect x="0" y="0" width="400" height="500" fill="url(#faceGlow)" />
              <path d="M 120 80 C 120 40, 280 40, 280 80 C 280 140, 310 240, 290 320 C 270 400, 240 440, 200 440 C 160 440, 130 400, 110 320 C 90 240, 120 140, 120 80 Z" fill="none" stroke="var(--ink-soft)" strokeWidth="2.5" opacity="0.3" strokeDasharray="4 2" />
              <path d="M 120 80 C 120 45, 280 45, 280 80 C 280 140, 305 240, 285 320 C 265 395, 235 435, 200 435 C 165 435, 135 395, 115 320 C 95 240, 120 140, 120 80 Z" fill="none" stroke="var(--ink)" strokeWidth="1.5" opacity="0.75" />
              <path d="M 116 190 C 95 190, 95 260, 112 270" fill="none" stroke="var(--ink)" strokeWidth="1.5" opacity="0.6" />
              <path d="M 284 190 C 305 190, 305 260, 288 270" fill="none" stroke="var(--ink)" strokeWidth="1.5" opacity="0.6" />
              <path d="M 135 155 C 145 145, 170 145, 180 155" fill="none" stroke="var(--gold)" strokeWidth="2.5" opacity="0.8" />
              <path d="M 220 155 C 230 145, 255 145, 265 155" fill="none" stroke="var(--gold)" strokeWidth="2.5" opacity="0.8" />
              <path d="M 140 170 C 150 162, 165 162, 175 170 C 165 178, 150 178, 140 170 Z" fill="none" stroke="var(--ink)" strokeWidth="1.5" opacity="0.7" />
              <circle cx="157.5" cy="170" r="3.5" fill="var(--ink)" opacity="0.6" />
              <path d="M 225 170 C 235 162, 250 162, 260 170 C 250 178, 235 178, 225 170 Z" fill="none" stroke="var(--ink)" strokeWidth="1.5" opacity="0.7" />
              <circle cx="242.5" cy="170" r="3.5" fill="var(--ink)" opacity="0.6" />
              <path d="M 200 165 L 200 245 C 200 255, 185 260, 200 260 C 215 260, 200 255, 200 245" fill="none" stroke="var(--ink)" strokeWidth="1.5" opacity="0.7" />
              <path d="M 190 252 C 195 256, 205 256, 210 252" fill="none" stroke="var(--ink)" strokeWidth="1.2" opacity="0.6" />
              <path d="M 175 315 C 185 307, 215 307, 225 315 C 215 323, 185 323, 175 315 Z" fill="none" stroke="var(--rose)" strokeWidth="1.5" opacity="0.8" />
              <line x1="175" y1="315" x2="225" y2="315" stroke="var(--rose)" strokeWidth="1.2" opacity="0.6" />
              <path d="M 130 230 Q 165 240 180 270" fill="none" stroke="var(--ink-soft)" strokeWidth="1" opacity="0.35" strokeDasharray="3 3" />
              <path d="M 270 230 Q 235 240 220 270" fill="none" stroke="var(--ink-soft)" strokeWidth="1" opacity="0.35" strokeDasharray="3 3" />
              <text x="200" y="85" fontSize="9" textAnchor="middle" fill="var(--ink-soft)" opacity="0.4" pointerEvents="none" style={{ letterSpacing: 1 }}>TESTA (FRONTAL)</text>
              <text x="200" y="135" fontSize="9" textAnchor="middle" fill="var(--ink-soft)" opacity="0.4" pointerEvents="none" style={{ letterSpacing: 1 }}>GLABELA</text>
              <text x="130" y="195" fontSize="8" textAnchor="middle" fill="var(--ink-soft)" opacity="0.4" pointerEvents="none" style={{ letterSpacing: 1 }}>ORBICULAR</text>
              <text x="270" y="195" fontSize="8" textAnchor="middle" fill="var(--ink-soft)" opacity="0.4" pointerEvents="none" style={{ letterSpacing: 1 }}>ORBICULAR</text>
              <text x="155" y="280" fontSize="7.5" textAnchor="middle" fill="var(--ink-soft)" opacity="0.4" pointerEvents="none" style={{ letterSpacing: 0.5 }}>S. NASOLABIAL</text>
              <text x="245" y="280" fontSize="7.5" textAnchor="middle" fill="var(--ink-soft)" opacity="0.4" pointerEvents="none" style={{ letterSpacing: 0.5 }}>S. NASOLABIAL</text>
              <text x="200" y="415" fontSize="8.5" textAnchor="middle" fill="var(--ink-soft)" opacity="0.4" pointerEvents="none" style={{ letterSpacing: 1 }}>MENTO / MANDÍBULA</text>

              {facialPoints.map(point => (
                <g
                  key={point.id}
                  transform={`translate(${(point.x * 400) / 100}, ${(point.y * 500) / 100})`}
                  style={{ cursor: isLocked ? 'not-allowed' : 'pointer' }}
                  onClick={e => { e.stopPropagation(); handleRemovePoint(point.id) }}
                >
                  <circle r="12" fill={point.type === 'botox' ? 'rgba(182, 137, 77, 0.3)' : 'rgba(172, 118, 109, 0.3)'} style={{ transformOrigin: 'center', animation: 'skeleton-loading 2s infinite' }} />
                  <circle r="8" fill={point.type === 'botox' ? 'var(--gold)' : 'var(--rose)'} stroke="#fff" strokeWidth="1.2" />
                  <text y="2.8" fontSize="8" fontWeight="bold" textAnchor="middle" fill="#fff" pointerEvents="none">
                    {point.amount}
                  </text>
                </g>
              ))}
            </svg>
          </div>
        </div>

        {/* Lista Lateral de Pontos */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--ink)' }}>
            Lista de Pontos ({facialPoints.length})
          </span>
          <div style={{ maxHeight: '340px', overflowY: 'auto', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '12px', background: 'rgba(0, 0, 0, 0.1)' }} className="prontuario-scroll">
            {facialPoints.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--ink-soft)', fontSize: '0.85rem' }}>
                Nenhum ponto marcado no mapa facial deste cliente.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {facialPoints.map((point, index) => (
                  <div key={point.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: index < facialPoints.length - 1 ? '1px solid rgba(255, 255, 255, 0.04)' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: point.type === 'botox' ? 'var(--gold)' : 'var(--rose)' }} />
                      <span style={{ fontSize: '0.85rem', fontWeight: '600' }}>
                        Ponto #{index + 1}: {point.type === 'botox' ? 'Toxina' : 'Preenchedor'}
                      </span>
                      <span className={point.type === 'botox' ? 'badge badge-gold' : 'badge badge-rose'} style={{ fontSize: '0.7rem', padding: '2px 6px' }}>
                        {point.amount}{point.type === 'botox' ? ' U' : ' ml'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', fontFamily: 'monospace' }}>
                        X:{point.x}% Y:{point.y}%
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemovePoint(point.id)}
                        disabled={isLocked}
                        style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: isLocked ? 'not-allowed' : 'pointer', padding: '4px' }}
                        title="Remover ponto"
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
