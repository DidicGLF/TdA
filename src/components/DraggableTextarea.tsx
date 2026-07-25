import { useState, useEffect, useRef } from 'react'
import { majusculeInitiale } from '../utils/texte'
import type { RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useContext } from 'react'
import { ModeImpressionContext } from '../hooks/modeImpression'
import PastilleImpression from './PastilleImpression'
import SheetTextarea from './SheetTextarea'

interface Props {
  top: number
  left: number
  width: number
  height: number
  value: string
  onChange: (val: string) => void
  calibrate: boolean
  label: string
  containerRef: RefObject<HTMLDivElement | null>
  onMoved: (label: string, top: number, left: number, width?: number, height?: number) => void
  lineHeightPct?: number
  paddingTopPct?: number
  autoShrink?: boolean
  temporaire?: boolean
  // Décision d'impression pour ce champ, et bascule associée (mode « préparer l'impression »).
  imprime?: boolean
  onToggleImpression?: () => void
  // Réserve de calibrage — voir DraggableField.
  reserved?: boolean
  onReserveToggle?: (reserved: boolean) => void
  reservePortalTarget?: HTMLElement | null
}

export default function DraggableTextarea({
  top, left, width: initWidth, height: initHeight, value, onChange,
  calibrate, label, containerRef, onMoved, lineHeightPct, paddingTopPct, autoShrink, temporaire,
  reserved, onReserveToggle, reservePortalTarget, imprime = true, onToggleImpression,
}: Props) {
  const [pos, setPos] = useState({ top, left })
  const [width, setWidth] = useState(initWidth)
  const [height, setHeight] = useState(initHeight)
  const dragging = useRef(false)
  const modeImpression = useContext(ModeImpressionContext)

  useEffect(() => { if (!dragging.current) setPos({ top, left }) }, [top, left])
  useEffect(() => { if (!dragging.current) setWidth(initWidth) }, [initWidth])
  useEffect(() => { if (!dragging.current) setHeight(initHeight) }, [initHeight])

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
      onMoved(label, newTop, newLeft, width, height)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const handleResizeWidthMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragging.current = true
    const startX = e.clientX
    const startWidth = width

    const onMove = (ev: MouseEvent) => {
      const rect = containerRef.current!.getBoundingClientRect()
      setWidth(Math.max(1, +(startWidth + (ev.clientX - startX) / rect.width * 100).toFixed(1)))
    }
    const onUp = (ev: MouseEvent) => {
      const rect = containerRef.current!.getBoundingClientRect()
      const w = Math.max(1, +(startWidth + (ev.clientX - startX) / rect.width * 100).toFixed(1))
      setWidth(w)
      dragging.current = false
      onMoved(label, pos.top, pos.left, w, height)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const handleResizeHeightMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragging.current = true
    const startY = e.clientY
    const startHeight = height

    const onMove = (ev: MouseEvent) => {
      const rect = containerRef.current!.getBoundingClientRect()
      setHeight(Math.max(1, +(startHeight + (ev.clientY - startY) / rect.height * 100).toFixed(1)))
    }
    const onUp = (ev: MouseEvent) => {
      const rect = containerRef.current!.getBoundingClientRect()
      const h = Math.max(1, +(startHeight + (ev.clientY - startY) / rect.height * 100).toFixed(1))
      setHeight(h)
      dragging.current = false
      onMoved(label, pos.top, pos.left, width, h)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  if (reserved) {
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
      <SheetTextarea
        top={pos.top} left={pos.left} width={width} height={height}
        value={value} onChange={onChange} calibrate={calibrate} temporaire={temporaire}
        placeholder={calibrate && value === '' ? majusculeInitiale(label) : undefined}
        containerRef={containerRef} lineHeightPct={lineHeightPct} paddingTopPct={paddingTopPct}
        autoShrink={autoShrink}
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
            background: 'rgba(100,180,255,0.92)',
            color: '#0a1520',
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
          <span onMouseDown={handleResizeWidthMouseDown}
            style={{ cursor: 'ew-resize', paddingLeft: 3, borderLeft: '1px solid rgba(10,21,32,0.35)', fontSize: 10, lineHeight: 1 }}
            title="Largeur">↔</span>
          <span onMouseDown={handleResizeHeightMouseDown}
            style={{ cursor: 'ns-resize', paddingLeft: 2, fontSize: 10, lineHeight: 1 }}
            title="Hauteur">↕</span>
          {onReserveToggle && (
            <span
              onMouseDown={e => { e.preventDefault(); e.stopPropagation(); onReserveToggle(true) }}
              style={{ cursor: 'pointer', fontSize: 10, paddingLeft: 3, borderLeft: '1px solid rgba(10,21,32,0.35)', lineHeight: 1 }}
              title="Envoyer à la réserve"
            >📥</span>
          )}
        </div>
      )}
    </>
  )
}
