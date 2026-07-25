import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import type { RefObject } from 'react'

const BASE_FONT = 1.15
const MIN_FONT  = 0.45
// Plafond quand la police peut grandir pour occuper la place disponible : au-delà, le texte devient
// disproportionné par rapport au reste de la fiche même s'il tiendrait encore dans le cadre.
const MAX_FONT  = 1.6
// Part de l'interligne qu'une lettre peut occuper au maximum. Les zones alignées sur les lignes
// imprimées de la feuille (lineHeightPct) ont un interligne imposé : une police plus grande que ça
// ferait chevaucher les lettres sur la réglure.
const RATIO_INTERLIGNE = 0.78

interface Props {
  top: number
  left: number
  width: number
  height: number
  value: string
  onChange: (val: string) => void
  calibrate?: boolean
  placeholder?: string
  autoShrink?: boolean
  // Alignement sur les lignes de la fiche (optionnel)
  containerRef?: RefObject<HTMLDivElement | null>
  lineHeightPct?: number  // espacement entre lignes, en % de la hauteur du conteneur
  paddingTopPct?: number  // décalage depuis le haut de la zone jusqu'à la 1re ligne, en % de la hauteur du conteneur
}

export default function SheetTextarea({
  top, left, width, height, value, onChange, calibrate = false,
  autoShrink = false, containerRef, lineHeightPct, paddingTopPct = 0, placeholder,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [lhPx, setLhPx] = useState<number | null>(null)
  const [ptPx, setPtPx] = useState<number>(2)

  useLayoutEffect(() => {
    if (!autoShrink) return
    const el = ref.current
    if (!el) return
    if (el.clientHeight === 0) return
    // On part du plus grand corps autorisé puis on réduit jusqu'à ce que le texte tienne : ainsi la
    // police occupe la place disponible au lieu d'être bloquée à BASE_FONT quand le cadre est large.
    const vwEnPx = window.innerWidth / 100
    const plafond = lhPx
      ? Math.max(MIN_FONT, Math.min(MAX_FONT, (lhPx * RATIO_INTERLIGNE) / vwEnPx))
      : BASE_FONT
    let size = plafond
    el.style.fontSize = `${size}vw`
    while (el.scrollHeight > el.clientHeight + 1 && size > MIN_FONT) {
      size = +(size - 0.05).toFixed(2)
      el.style.fontSize = `${size}vw`
    }
  }, [value, autoShrink, width, height, lhPx])

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
      placeholder={placeholder}
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
        border: calibrate ? '2px dashed rgba(160,90,230,0.95)' : '1px solid transparent',
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
        e.target.style.border = calibrate ? '2px dashed rgba(160,90,230,0.95)' : '1px solid transparent'
        e.target.style.overflow = 'hidden'
      }}
    />
  )
}
