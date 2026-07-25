import { useState, useEffect, useRef } from 'react'
import { majusculeInitiale } from '../utils/texte'
import type { RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useContext } from 'react'
import { ModeImpressionContext } from '../hooks/modeImpression'
import PastilleImpression from './PastilleImpression'
import SheetField from './SheetField'

interface Props {
  top: number
  left: number
  width: number
  height?: number
  value: string | number
  onChange: (val: string) => void
  type?: 'text' | 'number'
  align?: 'left' | 'center' | 'right'
  active?: boolean
  calibrate: boolean
  label: string
  containerRef: RefObject<HTMLDivElement | null>
  onMoved: (label: string, top: number, left: number, width?: number) => void
  title?: string
  readOnly?: boolean
  temporaire?: boolean
  // Décision d'impression pour ce champ, et bascule associée (mode « préparer l'impression »).
  imprime?: boolean
  onToggleImpression?: () => void
  // Réserve de calibrage (option A) : un champ "reserved" n'est pas affiché sur la feuille (aucune
  // position réelle n'a de sens) mais listé dans reservePortalTarget, un conteneur DOM neutre affiché
  // à la place du wizard en mode calibrage. Cliquer dessus le replace sur la feuille (onReserveToggle).
  reserved?: boolean
  onReserveToggle?: (reserved: boolean) => void
  reservePortalTarget?: HTMLElement | null
}

export default function DraggableField({
  top, left, width: initWidth, height, value, onChange, type, align, active,
  calibrate, label, containerRef, onMoved, title, readOnly, temporaire,
  reserved, onReserveToggle, reservePortalTarget, imprime = true, onToggleImpression,
}: Props) {
  const [pos, setPos] = useState({ top, left })
  const [width, setWidth] = useState(initWidth)
  const dragging = useRef(false)
  const modeImpression = useContext(ModeImpressionContext)

  useEffect(() => { if (!dragging.current) setPos({ top, left }) }, [top, left])
  useEffect(() => { if (!dragging.current) setWidth(initWidth) }, [initWidth])

  const handleDragMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragging.current = true
    const startX = e.clientX
    const startY = e.clientY
    const startTop = pos.top
    const startLeft = pos.left

    const onMove = (ev: MouseEvent) => {
      const rect = containerRef.current!.getBoundingClientRect()
      setPos({
        top:  +(startTop  + (ev.clientY - startY) / rect.height * 100).toFixed(1),
        left: +(startLeft + (ev.clientX - startX) / rect.width  * 100).toFixed(1),
      })
    }
    const onUp = (ev: MouseEvent) => {
      const rect = containerRef.current!.getBoundingClientRect()
      const newTop  = +(startTop  + (ev.clientY - startY) / rect.height * 100).toFixed(1)
      const newLeft = +(startLeft + (ev.clientX - startX) / rect.width  * 100).toFixed(1)
      setPos({ top: newTop, left: newLeft })
      dragging.current = false
      onMoved(label, newTop, newLeft, width)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragging.current = true
    const startX = e.clientX
    const startWidth = width

    const onMove = (ev: MouseEvent) => {
      const rect = containerRef.current!.getBoundingClientRect()
      const w = Math.max(1, +(startWidth + (ev.clientX - startX) / rect.width * 100).toFixed(1))
      setWidth(w)
    }
    const onUp = (ev: MouseEvent) => {
      const rect = containerRef.current!.getBoundingClientRect()
      const w = Math.max(1, +(startWidth + (ev.clientX - startX) / rect.width * 100).toFixed(1))
      setWidth(w)
      dragging.current = false
      onMoved(label, pos.top, pos.left, w)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  if (reserved) {
    // Un champ "en réserve" n'a pas de position réelle : jamais affiché sur la feuille (calibrage ou
    // non) — seulement listé dans la réserve, en mode calibrage, tant qu'il n'a pas été replacé.
    if (!calibrate || !reservePortalTarget) return null
    return createPortal(
      <div
        onClick={() => onReserveToggle?.(false)}
        title="Placer sur la feuille"
        style={{
          display: 'inline-flex', alignItems: 'center',
          background: 'rgba(160,90,230,0.18)',
          border: '1px solid rgba(160,90,230,0.6)',
          color: 'rgba(225,205,255,0.95)',
          fontSize: 12, fontFamily: 'monospace', fontWeight: 700,
          padding: '4px 9px', borderRadius: 4,
          userSelect: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        {label}
      </div>,
      reservePortalTarget,
    )
  }

  return (
    <>
      <SheetField
        top={pos.top} left={pos.left} width={width} height={height}
        value={value} onChange={onChange} type={type} align={align} active={active}
        calibrate={calibrate} title={title} readOnly={readOnly} temporaire={temporaire}
        placeholder={calibrate && String(value ?? '') === '' ? majusculeInitiale(label) : undefined}
      />
      {modeImpression && onToggleImpression && (
        <PastilleImpression imprime={imprime} onToggle={onToggleImpression} top={pos.top} left={pos.left} />
      )}
      {calibrate && (
        <div
          onMouseDown={handleDragMouseDown}
          style={{
            position: 'absolute',
            top: `${pos.top}%`,
            left: `${pos.left}%`,
            transform: 'translate(-50%, -50%)',
            cursor: 'grab',
            background: 'rgba(160,90,230,0.92)',
            color: '#fff',
            fontSize: 8,
            fontFamily: 'monospace',
            fontWeight: 700,
            padding: '1px 3px',
            borderRadius: 2,
            userSelect: 'none',
            zIndex: 40,
            whiteSpace: 'nowrap',
            lineHeight: '14px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            gap: 2,
          }}
        >
          {label}
          <span
            onMouseDown={handleResizeMouseDown}
            style={{
              cursor: 'ew-resize',
              fontSize: 10,
              paddingLeft: 3,
              borderLeft: '1px solid rgba(255,255,255,0.35)',
              lineHeight: 1,
            }}
            title="Redimensionner"
          >↔</span>
          {onReserveToggle && (
            <span
              onMouseDown={e => { e.preventDefault(); e.stopPropagation(); onReserveToggle(true) }}
              style={{
                cursor: 'pointer',
                fontSize: 10,
                paddingLeft: 3,
                borderLeft: '1px solid rgba(255,255,255,0.35)',
                lineHeight: 1,
              }}
              title="Envoyer à la réserve"
            >📥</span>
          )}
        </div>
      )}
    </>
  )
}
