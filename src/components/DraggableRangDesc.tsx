import { useState, useEffect, useLayoutEffect, useRef, useCallback, useContext } from 'react'
import { majusculeInitiale } from '../utils/texte'
import type { RefObject, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ModeImpressionContext } from '../hooks/modeImpression'
import PastilleImpression from './PastilleImpression'

const BASE_FONT = 0.95
const MIN_FONT  = 0.35

interface Props {
  top: number
  left: number
  width: number
  height: number
  // Contenu déjà mis en forme (cf. parseDesc) : les descriptions de capacités contiennent du balisage
  // (**gras**, ==doré==, [formules]) qui doit être interprété, ce qu'une zone de texte ne permet pas.
  contenu: ReactNode
  // Texte brut correspondant — sert uniquement de déclencheur au réajustement de la police.
  texteBrut: string
  calibrate: boolean
  label: string
  containerRef: RefObject<HTMLDivElement | null>
  onMoved: (label: string, top: number, left: number, width?: number, height?: number) => void
  reserved?: boolean
  onReserveToggle?: (reserved: boolean) => void
  reservePortalTarget?: HTMLElement | null
  // Décision d'impression pour ce champ, et bascule associée (mode « préparer l'impression ») — même
  // motif que DraggableField/DraggableTextarea.
  imprime?: boolean
  onToggleImpression?: () => void
}

// Description d'un rang de voie : bloc en lecture seule, positionné et dimensionné comme les autres
// champs (donc calibrable, réservable et déplaçable d'une fiche à l'autre), dont la police se réduit
// automatiquement pour tenir dans le cadre alloué sur la feuille.
export default function DraggableRangDesc({
  top, left, width: initWidth, height: initHeight, contenu, texteBrut,
  calibrate, label, containerRef, onMoved,
  reserved, onReserveToggle, reservePortalTarget, imprime = true, onToggleImpression,
}: Props) {
  const modeImpression = useContext(ModeImpressionContext)
  const [pos, setPos] = useState({ top, left })
  const [width, setWidth] = useState(initWidth)
  const [height, setHeight] = useState(initHeight)
  const dragging = useRef(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => { if (!dragging.current) setPos({ top, left }) }, [top, left])
  useEffect(() => { if (!dragging.current) setWidth(initWidth) }, [initWidth])
  useEffect(() => { if (!dragging.current) setHeight(initHeight) }, [initHeight])

  const ajusterPolice = useCallback(() => {
    const el = ref.current
    if (!el || el.clientHeight === 0) return
    // calc(...vw * var(--zoom-scale, 1)) — voir la note dans App.tsx (conteneur zoomable) et SheetField.
    let size = BASE_FONT
    el.style.fontSize = `calc(${size}vw * var(--zoom-scale, 1))`
    while (el.scrollHeight > el.clientHeight + 1 && size > MIN_FONT) {
      size = +(size - 0.03).toFixed(2)
      el.style.fontSize = `calc(${size}vw * var(--zoom-scale, 1))`
    }
  }, [])

  useLayoutEffect(() => {
    ajusterPolice()
  }, [ajusterPolice, texteBrut, width, height])

  // Filet de sécurité (voir SheetField.tsx, même bug) : si la 1re mesure ci-dessus tombe avant que le
  // conteneur (image de fond) ait fini de se mettre en page, clientHeight vaut 0 et la réduction ne se
  // relance jamais pour un texte de rang déjà acquis au chargement (jamais réédité, donc aucune des
  // dépendances ci-dessus ne change plus ensuite) — constaté sur mobile, chargement d'image plus lent.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => ajusterPolice())
    ro.observe(el)
    return () => ro.disconnect()
  }, [ajusterPolice])

  const glisser = (e: React.MouseEvent, mode: 'pos' | 'largeur' | 'hauteur') => {
    e.preventDefault()
    e.stopPropagation()
    dragging.current = true
    const startX = e.clientX, startY = e.clientY
    const depart = { top: pos.top, left: pos.left, width, height }

    const calcule = (ev: MouseEvent) => {
      const rect = containerRef.current!.getBoundingClientRect()
      const dx = (ev.clientX - startX) / rect.width * 100
      const dy = (ev.clientY - startY) / rect.height * 100
      if (mode === 'pos') return { ...depart, top: +(depart.top + dy).toFixed(1), left: +(depart.left + dx).toFixed(1) }
      if (mode === 'largeur') return { ...depart, width: Math.max(1, +(depart.width + dx).toFixed(1)) }
      return { ...depart, height: Math.max(1, +(depart.height + dy).toFixed(1)) }
    }
    const appliquer = (v: typeof depart) => { setPos({ top: v.top, left: v.left }); setWidth(v.width); setHeight(v.height) }

    const onMove = (ev: MouseEvent) => appliquer(calcule(ev))
    const onUp = (ev: MouseEvent) => {
      const v = calcule(ev)
      appliquer(v)
      dragging.current = false
      onMoved(label, v.top, v.left, v.width, v.height)
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
          background: 'rgba(160,90,230,0.18)', border: '1px solid rgba(160,90,230,0.6)',
          color: 'rgba(225,205,255,0.95)', fontSize: 12, fontFamily: 'monospace', fontWeight: 700,
          padding: '4px 9px', borderRadius: 4, userSelect: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >{label}</div>,
      reservePortalTarget,
    )
  }

  return (
    <>
      <div
        ref={ref}
        style={{
          position: 'absolute',
          top: `${pos.top}%`, left: `${pos.left}%`,
          width: `${width}%`, height: `${height}%`,
          transform: 'translate(-50%, -50%)',
          fontFamily: "'Crimson Text', Georgia, serif",
          color: '#1a1510',
          lineHeight: 1.25,
          overflow: 'hidden',
          textAlign: 'justify',
          border: calibrate ? '2px dashed rgba(160,90,230,0.95)' : '1px solid transparent',
          borderRadius: 2,
          padding: '0 3px',
          boxSizing: 'border-box',
          pointerEvents: 'none',
        }}
      >
        {/* Cadre vide en calibrage : un texte-repère matérialise l'emplacement, sinon le bloc est
            invisible et impossible à positionner correctement. */}
        {texteBrut ? contenu : (calibrate && (
          <span style={{ color: 'rgba(160,90,230,0.55)' }}>{majusculeInitiale(label)}</span>
        ))}
      </div>
      {modeImpression && onToggleImpression && (
        <PastilleImpression imprime={imprime} onToggle={onToggleImpression} top={pos.top} left={pos.left} />
      )}
      {calibrate && (
        <div
          onMouseDown={e => glisser(e, 'pos')}
          style={{
            position: 'absolute',
            top: `${pos.top}%`, left: `${pos.left}%`,
            transform: 'translate(-50%, -50%)',
            cursor: 'grab',
            background: 'rgba(160,90,230,0.92)', color: '#fff',
            fontSize: 8, fontFamily: 'monospace', fontWeight: 700,
            padding: '1px 3px', borderRadius: 2, userSelect: 'none',
            zIndex: 40, whiteSpace: 'nowrap', lineHeight: '14px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', gap: 2,
          }}
        >
          {label}
          <span onMouseDown={e => glisser(e, 'largeur')}
            style={{ cursor: 'ew-resize', paddingLeft: 3, borderLeft: '1px solid rgba(255,255,255,0.35)', fontSize: 10, lineHeight: 1 }}
            title="Largeur">↔</span>
          <span onMouseDown={e => glisser(e, 'hauteur')}
            style={{ cursor: 'ns-resize', paddingLeft: 2, fontSize: 10, lineHeight: 1 }}
            title="Hauteur">↕</span>
          {onReserveToggle && (
            <span
              onMouseDown={e => { e.preventDefault(); e.stopPropagation(); onReserveToggle(true) }}
              style={{ cursor: 'pointer', fontSize: 10, paddingLeft: 3, borderLeft: '1px solid rgba(255,255,255,0.35)', lineHeight: 1 }}
              title="Envoyer à la réserve"
            >📥</span>
          )}
        </div>
      )}
    </>
  )
}
