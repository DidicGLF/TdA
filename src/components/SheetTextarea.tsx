import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import type { RefObject } from 'react'

const BASE_FONT = 1.15
const MIN_FONT  = 0.45

interface Props {
  top: number
  left: number
  width: number
  height: number
  value: string
  onChange: (val: string) => void
  calibrate?: boolean
  autoShrink?: boolean
  // Alignement sur les lignes de la fiche (optionnel)
  containerRef?: RefObject<HTMLDivElement | null>
  lineHeightPct?: number  // espacement entre lignes, en % de la hauteur du conteneur
  paddingTopPct?: number  // décalage depuis le haut de la zone jusqu'à la 1re ligne, en % de la hauteur du conteneur
}

export default function SheetTextarea({
  top, left, width, height, value, onChange, calibrate = false,
  autoShrink = false, containerRef, lineHeightPct, paddingTopPct = 0,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [lhPx, setLhPx] = useState<number | null>(null)
  const [ptPx, setPtPx] = useState<number>(2)

  useLayoutEffect(() => {
    if (!autoShrink) return
    const el = ref.current
    if (!el) return
    el.style.fontSize = `${BASE_FONT}vw`
    if (el.clientHeight === 0) return
    let size = BASE_FONT
    while (el.scrollHeight > el.clientHeight + 1 && size > MIN_FONT) {
      size = +(size - 0.05).toFixed(2)
      el.style.fontSize = `${size}vw`
    }
  }, [value, autoShrink])

  useEffect(() => {
    if (!containerRef?.current || !lineHeightPct) return
    const update = () => {
      if (!containerRef.current) return
      const h = containerRef.current.getBoundingClientRect().height
      if (!h) return
      setLhPx(lineHeightPct / 100 * h)
      setPtPx(paddingTopPct / 100 * h)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [containerRef, lineHeightPct, paddingTopPct])

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={e => onChange(e.target.value)}
      className="tdr-field"
      data-lh-pct={lineHeightPct}
      data-pt-pct={paddingTopPct}
      style={{
        position: 'absolute',
        top: `${top}%`,
        left: `${left}%`,
        width: `${width}%`,
        height: `${height}%`,
        transform: 'translate(-50%, -50%)',
        fontSize: '1.15vw',
        fontFamily: "'Crimson Text', Georgia, serif",
        background: 'transparent',
        border: calibrate ? '1px dashed rgba(201,168,76,0.5)' : '1px solid transparent',
        borderRadius: '2px',
        color: '#1a1510',
        padding: `${ptPx}px 3px 0`,
        outline: 'none',
        resize: 'none',
        lineHeight: lhPx ? `${lhPx}px` : 1.4,
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
      onFocus={e => {
        e.target.style.background = 'rgba(201,168,76,0.1)'
        e.target.style.border = '1px solid rgba(201,168,76,0.6)'
        e.target.style.overflow = 'auto'
      }}
      onBlur={e => {
        e.target.style.background = 'transparent'
        e.target.style.border = calibrate ? '1px dashed rgba(201,168,76,0.5)' : '1px solid transparent'
        e.target.style.overflow = 'hidden'
      }}
    />
  )
}
