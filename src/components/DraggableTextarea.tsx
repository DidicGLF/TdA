import { useState } from 'react'
import type { RefObject } from 'react'
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
}

export default function DraggableTextarea({
  top, left, width: initWidth, height: initHeight, value, onChange,
  calibrate, label, containerRef, onMoved,
}: Props) {
  const [pos, setPos] = useState({ top, left })
  const [width, setWidth] = useState(initWidth)
  const [height, setHeight] = useState(initHeight)

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
      onMoved(label, pos.top, pos.left, width, h)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  return (
    <>
      <SheetTextarea
        top={pos.top} left={pos.left} width={width} height={height}
        value={value} onChange={onChange} calibrate={calibrate}
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
        </div>
      )}
    </>
  )
}
