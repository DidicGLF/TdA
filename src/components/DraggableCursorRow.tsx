import { useState, useEffect, useRef, useContext } from 'react'
import type { RefObject } from 'react'
import { createPortal } from 'react-dom'
import { CURSEUR_ICON_SVG } from '../utils/curseurMarker'
import { ModeImpressionContext } from '../hooks/modeImpression'
import PastilleImpression from './PastilleImpression'

interface Props {
  top: number
  left: number
  // Un seul axe (pas de grille perRow comme DraggableCheckboxRow) : top/left = position de la valeur 0,
  // stepX/stepY = déplacement (en % du conteneur) d'une valeur à la suivante — peut être horizontal,
  // vertical ou en biais selon l'orientation réelle de la graduation imprimée.
  stepX: number
  stepY: number
  count: number
  value: number
  onValueChange: (value: number) => void
  calibrate: boolean
  label: string
  containerRef: RefObject<HTMLDivElement | null>
  // Même signature que DraggableCheckboxRow.onGridChange (perRow toujours égal à count ici, jamais
  // utilisé pour un retour à la ligne) — réutilise tel quel le câblage onCheckboxRowMoved existant.
  onGridChange: (label: string, top: number, left: number, perRow: number, stepX: number, stepY: number) => void
  reserved?: boolean
  onReserveToggle?: (reserved: boolean) => void
  reservePortalTarget?: HTMLElement | null
  // Décision d'impression pour ce champ (mode « préparer l'impression ») — même motif que DraggableField/
  // DraggableTextarea, absent de DraggableCheckboxRow (cases cochées au crayon, jamais un choix par
  // champ) mais demandé explicitement par Didic pour ce curseur-ci.
  imprime?: boolean
  onToggleImpression?: () => void
}

// Champ "curseur glissant sur une graduation imprimée" (voir data/psychologieTraits.ts) — un seul repère
// que le joueur attrape et fait glisser le long d'un axe calibré, qui s'accroche à la position la plus
// proche parmi `count` valeurs. Calibration calquée sur DraggableCheckboxRow (origine + espacement),
// mais l'interaction hors calibrage est un vrai glisser-déposer avec accroche continue, pas un clic
// direct sur une case — demandé explicitement par Didic pour ce champ précis.
export default function DraggableCursorRow({
  top, left, stepX: initStepX, stepY: initStepY, count, value, onValueChange,
  calibrate, label, containerRef, onGridChange,
  reserved, onReserveToggle, reservePortalTarget, imprime = true, onToggleImpression,
}: Props) {
  const modeImpression = useContext(ModeImpressionContext)
  const [pos, setPos] = useState({ top, left })
  const [stepX, setStepX] = useState(initStepX)
  const [stepY, setStepY] = useState(initStepY)
  const dragging = useRef(false)

  useEffect(() => { if (!dragging.current) setPos({ top, left }) }, [top, left])
  useEffect(() => { if (!dragging.current) setStepX(initStepX) }, [initStepX])
  useEffect(() => { if (!dragging.current) setStepY(initStepY) }, [initStepY])

  // Glisser l'origine de l'axe (mode calibrage), comme DraggableCheckboxRow.
  const handleAxisMouseDown = (e: React.MouseEvent) => {
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
      onGridChange(label, newTop, newLeft, count, stepX, stepY)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const commitAxis = (nextStepX: number, nextStepY: number) => {
    setStepX(nextStepX); setStepY(nextStepY)
    onGridChange(label, pos.top, pos.left, count, nextStepX, nextStepY)
  }

  // Glisser le repère lui-même (hors calibrage) : projette la position de la souris sur le vecteur
  // d'axe (stepX, stepY) pour trouver l'index le plus proche parmi `count` valeurs — accroche continue
  // pendant le déplacement, pas seulement au relâchement.
  const lastValue = useRef(value)
  useEffect(() => { lastValue.current = value }, [value])
  // Glisser le repère à la souris ET au doigt (tactile) — le marqueur est utilisé en jeu normal, pas
  // seulement en calibrage, donc doit fonctionner sur mobile. addEventListener('mousemove'/'mouseup') ne
  // suffit pas : un navigateur mobile ne synthétise fiablement qu'un mousedown initial à partir d'un
  // touchstart, jamais les mousemove/mouseup continus pendant le geste — d'où le marqueur figé au doigt
  // constaté sur Android. touchmove/touchend en plus, avec { passive: false } pour pouvoir preventDefault
  // (sinon la page défile au lieu de faire glisser le repère).
  const handleMarkerStart = (e: React.MouseEvent | React.TouchEvent) => {
    if (calibrate) return
    e.preventDefault()
    e.stopPropagation()
    const stepLenSq = stepX * stepX + stepY * stepY || 1

    const snapFromPoint = (clientX: number, clientY: number) => {
      const rect = containerRef.current!.getBoundingClientRect()
      const pointTop  = (clientY - rect.top)  / rect.height * 100
      const pointLeft = (clientX - rect.left) / rect.width  * 100
      const dx = pointLeft - pos.left
      const dy = pointTop  - pos.top
      const t = (dx * stepX + dy * stepY) / stepLenSq
      return Math.max(0, Math.min(count - 1, Math.round(t)))
    }
    const applyPoint = (clientX: number, clientY: number) => {
      const idx = snapFromPoint(clientX, clientY)
      if (idx !== lastValue.current) { lastValue.current = idx; onValueChange(idx) }
    }
    const onMouseMove = (ev: MouseEvent) => applyPoint(ev.clientX, ev.clientY)
    const onMouseUp = (ev: MouseEvent) => {
      applyPoint(ev.clientX, ev.clientY)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
    const onTouchMove = (ev: TouchEvent) => {
      ev.preventDefault()
      const t = ev.touches[0]
      if (t) applyPoint(t.clientX, t.clientY)
    }
    const onTouchEnd = (ev: TouchEvent) => {
      const t = ev.changedTouches[0]
      if (t) applyPoint(t.clientX, t.clientY)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
    }
    if ('touches' in e) {
      document.addEventListener('touchmove', onTouchMove, { passive: false })
      document.addEventListener('touchend', onTouchEnd)
    } else {
      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    }
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

  const markerTop = pos.top + value * stepY
  const markerLeft = pos.left + value * stepX
  // Pointe vers le bas par défaut (axe horizontal, angle 0°) — pivote pour rester perpendiculaire à un
  // axe orienté différemment, sans réglage de calibrage séparé pour la rotation.
  const angleDeg = Math.atan2(stepY, stepX) * 180 / Math.PI

  return (
    <>
      {/* Repères des count positions, uniquement en calibrage : le marqueur seul (à la valeur courante)
          ne suffit pas à vérifier que l'axe entier (origine + espacement) tombe bien sur chaque
          graduation imprimée, du premier au dernier cran — demandé par Didic (calibrer sans ce repère
          obligeait à deviner où tombe le cran 10 sans pouvoir le voir). */}
      {calibrate && Array.from({ length: count }, (_, i) => (
        <div key={i} style={{
          position: 'absolute',
          top: `${pos.top + i * stepY}%`, left: `${pos.left + i * stepX}%`,
          transform: 'translate(-50%, -50%)',
          width: 'calc(0.35vw * var(--zoom-scale, 1))', height: 'calc(0.35vw * var(--zoom-scale, 1))',
          borderRadius: '50%',
          background: i === value ? 'rgba(160,90,230,0.9)' : 'rgba(160,90,230,0.35)',
          pointerEvents: 'none',
        }} />
      ))}
      <div
        onMouseDown={handleMarkerStart}
        onTouchStart={handleMarkerStart}
        style={{
          position: 'absolute',
          top: `${markerTop}%`, left: `${markerLeft}%`,
          transform: `translate(-50%, -50%) rotate(${angleDeg}deg)`,
          // Suit désormais le zoom de la fiche (calc(vw * --zoom-scale), même technique que les cases à
          // cocher voisines à 0.85vw) au lieu d'une taille fixe en pixels — un repère à taille fixe
          // devenait disproportionné une fois la fiche réduite pour tenir sur un petit écran mobile.
          // Ratio ~14:24 conservé (marqueur d'origine).
          width: 'calc(0.85vw * var(--zoom-scale, 1))', height: 'calc(1.45vw * var(--zoom-scale, 1))',
          backgroundImage: `url("${CURSEUR_ICON_SVG}")`,
          backgroundRepeat: 'no-repeat', backgroundPosition: 'center', backgroundSize: 'contain',
          cursor: calibrate ? 'default' : 'grab',
          // Les navigateurs n'impriment pas les images/couleurs de fond CSS par défaut (case "Graphiques
          // d'arrière-plan" du dialogue d'impression, décochée par défaut) — sans ceci, ce repère (une
          // image de fond, pas un <img>) disparaissait à l'impression alors qu'il s'affiche à l'écran.
          WebkitPrintColorAdjust: 'exact',
          printColorAdjust: 'exact',
        } as React.CSSProperties}
      />
      {modeImpression && onToggleImpression && (
        <PastilleImpression imprime={imprime} onToggle={onToggleImpression} top={pos.top} left={pos.left} />
      )}
      {calibrate && (
        <div
          onMouseDown={handleAxisMouseDown}
          style={{
            position: 'absolute',
            top: `${pos.top}%`, left: `${pos.left}%`,
            transform: 'translate(-50%, calc(-100% - 4px))',
            cursor: 'grab',
            background: 'rgba(160,90,230,0.92)',
            color: '#fff',
            fontSize: 8,
            fontFamily: 'monospace',
            fontWeight: 700,
            padding: '2px 4px',
            borderRadius: 2,
            userSelect: 'none',
            zIndex: 40,
            whiteSpace: 'nowrap',
            lineHeight: '14px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            gap: 3,
          }}
        >
          {label}
          <span title="Espacement horizontal (%)" style={{ display: 'flex', alignItems: 'center', gap: 1, paddingLeft: 3, borderLeft: '1px solid rgba(255,255,255,0.35)' }}>
            ↔
            <input type="number" step={0.1} value={stepX}
              onMouseDown={e => e.stopPropagation()}
              onChange={e => commitAxis(parseFloat(e.target.value) || 0.1, stepY)}
              style={{ width: 34, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.35)', borderRadius: 2, color: '#fff', fontSize: 9, fontFamily: 'monospace', textAlign: 'center', padding: '0 1px' }} />
          </span>
          <span title="Espacement vertical (%)" style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            ↕
            <input type="number" step={0.1} value={stepY}
              onMouseDown={e => e.stopPropagation()}
              onChange={e => commitAxis(stepX, parseFloat(e.target.value) || 0.1)}
              style={{ width: 34, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.35)', borderRadius: 2, color: '#fff', fontSize: 9, fontFamily: 'monospace', textAlign: 'center', padding: '0 1px' }} />
          </span>
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
