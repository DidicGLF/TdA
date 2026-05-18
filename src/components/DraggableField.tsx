import { useState } from 'react'
import type { RefObject } from 'react'
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
}

export default function DraggableField({
  top, left, width: initWidth, height, value, onChange, type, align, active,
  calibrate, label, containerRef, onMoved,
}: Props) {
  const [pos, setPos] = useState({ top, left })
  const [width, setWidth] = useState(initWidth)

  const handleDragMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
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
      onMoved(label, pos.top, pos.left, w)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  return (
    <>
      <SheetField
        top={pos.top} left={pos.left} width={width} height={height}
        value={value} onChange={onChange} type={type} align={align} active={active}
        calibrate={calibrate}
      />
      {calibrate && (
        <div
          onMouseDown={handleDragMouseDown}
          style={{
            position: 'absolute',
            top: `${pos.top}%`,
            left: `${pos.left}%`,
            transform: 'translate(-50%, -50%)',
            cursor: 'grab',
            background: 'rgba(201,168,76,0.92)',
            color: '#1a1510',
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
              borderLeft: '1px solid rgba(26,21,16,0.35)',
              lineHeight: 1,
            }}
            title="Redimensionner"
          >↔</span>
        </div>
      )}
    </>
  )
}
