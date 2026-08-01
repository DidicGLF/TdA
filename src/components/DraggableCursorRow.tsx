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
  const handleMarkerMouseDown = (e: React.MouseEvent) => {
    if (calibrate) return
    e.preventDefault()
    e.stopPropagation()
    const stepLenSq = stepX * stepX + stepY * stepY || 1

    const snapFromEvent = (ev: MouseEvent) => {
      const rect = containerRef.current!.getBoundingClientRect()
      const mouseTop  = (ev.clientY - rect.top)  / rect.height * 100
      const mouseLeft = (ev.clientX - rect.left) / rect.width  * 100
      const dx = mouseLeft - pos.left
      const dy = mouseTop  - pos.top
      const t = (dx * stepX + dy * stepY) / stepLenSq
      return Math.max(0, Math.min(count - 1, Math.round(t)))
    }
    const onMove = (ev: MouseEvent) => {
      const idx = snapFromEvent(ev)
      if (idx !== lastValue.current) { lastValue.current = idx; onValueChange(idx) }
    }
    const onUp = (ev: MouseEvent) => {
      const idx = snapFromEvent(ev)
      if (idx !== lastValue.current) { lastValue.current = idx; onValueChange(idx) }
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
        onMouseDown={handleMarkerMouseDown}
        style={{
          position: 'absolute',
          top: `${markerTop}%`, left: `${markerLeft}%`,
          transform: `translate(-50%, -50%) rotate(${angleDeg}deg)`,
          // Même taille que le curseur du wizard (14x24px) pour commencer — à revoir si besoin d'un
          // comportement qui suit le zoom de la fiche comme les autres champs (calc(vw * --zoom-scale)).
          width: 14, height: 24,
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
