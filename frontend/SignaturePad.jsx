import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'

const CANVAS_WIDTH = 960
const CANVAS_HEIGHT = 280

function prepareCanvas(canvas) {
  const context = canvas.getContext('2d')
  if (!context) return

  context.fillStyle = '#fffaf4'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.strokeStyle = '#8e6333'
  context.lineWidth = 3.5
  context.lineCap = 'round'
  context.lineJoin = 'round'
}

export function SignaturePad({
  label,
  description,
  value,
  onChange,
  disabled = false,
}) {
  const canvasRef = useRef(null)
  const drawingRef = useRef(false)
  const [editing, setEditing] = useState(!value)
  const [hasSignature, setHasSignature] = useState(Boolean(value))

  useEffect(() => {
    setEditing(!value)
    setHasSignature(Boolean(value))
  }, [value])

  useEffect(() => {
    if (!editing || disabled) return

    const canvas = canvasRef.current
    if (!canvas) return

    prepareCanvas(canvas)
    setHasSignature(false)
  }, [disabled, editing])

  function getCanvasPoint(event) {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height

    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    }
  }

  function handlePointerDown(event) {
    if (disabled || !editing) return

    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    event.preventDefault()
    drawingRef.current = true
    canvas.setPointerCapture?.(event.pointerId)

    const point = getCanvasPoint(event)
    context.beginPath()
    context.moveTo(point.x, point.y)
    context.lineTo(point.x + 0.1, point.y + 0.1)
    context.stroke()
    setHasSignature(true)
  }

  function handlePointerMove(event) {
    if (!drawingRef.current || disabled || !editing) return

    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    event.preventDefault()
    const point = getCanvasPoint(event)
    context.lineTo(point.x, point.y)
    context.stroke()
  }

  function handlePointerUp(event) {
    if (!drawingRef.current || !editing) return

    drawingRef.current = false
    canvasRef.current?.releasePointerCapture?.(event.pointerId)

    if (canvasRef.current) {
      onChange(canvasRef.current.toDataURL('image/png'))
    }
  }

  function clearSignature() {
    const canvas = canvasRef.current
    if (!canvas) return

    prepareCanvas(canvas)
    setHasSignature(false)
    onChange('')
  }

  function redoSignature() {
    setEditing(true)
    onChange('')
  }

  return (
    <div className="signature-field">
      <div className="section-head consent-panel-head">
        <div>
          <h3 className="section-title section-title-sm">{label}</h3>
          {description ? <p className="section-copy">{description}</p> : null}
        </div>
      </div>

      {!editing && value ? (
        <div className="signature-preview-card">
          <div className="signature-preview-wrap">
            <img src={value} alt={label} className="signature-preview" />
          </div>
          <div className="signature-meta">
            <strong>Assinatura registrada</strong>
            <span>Você pode manter ou refazer antes de salvar a anamnese.</span>
          </div>
          {disabled ? null : (
            <div className="consent-actions consent-actions-start">
              <button type="button" className="btn btn-outline btn-sm" onClick={redoSignature}>
                <Icon name="edit" /> Refazer assinatura
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="signature-pad">
            <canvas
              ref={canvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              className="signature-canvas"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            />
          </div>

          <div className="signature-toolbar">
            <span className="signature-note">
              {hasSignature ? 'Assinatura capturada.' : 'Assine com dedo, mouse ou caneta.'}
            </span>
            {disabled ? null : (
              <button type="button" className="btn btn-ghost btn-sm" onClick={clearSignature}>
                Limpar assinatura
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
