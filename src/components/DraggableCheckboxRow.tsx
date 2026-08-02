import { useState, useEffect, useRef, useContext } from 'react'
import CroixCase from './CroixCase'
import type { RefObject } from 'react'
import { createPortal } from 'react-dom'
import { ModeImpressionContext } from '../hooks/modeImpression'
import PastilleImpression from './PastilleImpression'

interface Props {
  top: number
  left: number
  // Grille calibrée pour matcher exactement les cases imprimées sur la feuille : perRow cases par
  // ligne, stepX/stepY l'espacement (en % du conteneur) entre le centre d'une case et la suivante
  // (horizontalement) / la ligne suivante (verticalement) — pas une simple largeur qui enroule au
  // hasard selon la place disponible.
  perRow: number
  stepX: number
  stepY: number
  // Nombre total de cases (ex: PM total du perso — variable d'un perso à l'autre) et nombre de cases
  // actuellement cochées (ex: PM restants). Les cases cochées sont toujours les count premières —
  // cliquer une case coche/décoche jusqu'à elle (comportement séquentiel, comme les rangs de voie).
  count: number
  checkedCount: number
  onValueChange: (checkedCount: number) => void
  calibrate: boolean
  label: string
  containerRef: RefObject<HTMLDivElement | null>
  onGridChange: (label: string, top: number, left: number, perRow: number, stepX: number, stepY: number) => void
  // Données de session : les cases cochées ne s'impriment pas (le joueur les coche au crayon).
  temporaire?: boolean
  reserved?: boolean
  onReserveToggle?: (reserved: boolean) => void
  reservePortalTarget?: HTMLElement | null
  // Décision d'impression pour toute la rangée (une seule pastille, pas une par case), et bascule
  // associée (mode « préparer l'impression ») — même motif que DraggableField/DraggableTextarea.
  imprime?: boolean
  onToggleImpression?: () => void
  // Si défini, l'ORDRE de remplissage suit des paquets verticaux de blocTaille colonnes (N cases sur la
  // ligne du haut, puis les N mêmes colonnes sur la ligne du bas, puis le paquet suivant...) au lieu de
  // remplir toute la ligne du haut avant de passer à celle du bas — pour matcher une grille imprimée en
  // paquets (ex. PM : 5 cases hautes + 5 basses par paquet, voir ChampsRecto.tsx). Suppose exactement 2
  // lignes (haut/bas) ; sans ce prop, comportement inchangé (remplissage ligne par ligne complète).
  blocTaille?: number
}

// Champ "rangée de cases à cocher" — une seule calibration (position + grille perRow/stepX/stepY,
// réglable pour matcher exactement l'espacement imprimé sur la feuille) au lieu de placer une case par
// point à la main. Pensé pour des jauges dynamiques type PM restants, où le nombre de cases dépend du
// personnage.
export default function DraggableCheckboxRow({
  top, left, perRow: initPerRow, stepX: initStepX, stepY: initStepY, count, checkedCount, onValueChange,
  calibrate, label, containerRef, onGridChange, temporaire,
  reserved, onReserveToggle, reservePortalTarget, imprime = true, onToggleImpression, blocTaille,
}: Props) {
  const modeImpression = useContext(ModeImpressionContext)
  const [pos, setPos] = useState({ top, left })
  const [perRow, setPerRow] = useState(initPerRow)
  const [stepX, setStepX] = useState(initStepX)
  const [stepY, setStepY] = useState(initStepY)
  const dragging = useRef(false)

  useEffect(() => { if (!dragging.current) setPos({ top, left }) }, [top, left])
  useEffect(() => { if (!dragging.current) setPerRow(initPerRow) }, [initPerRow])
  useEffect(() => { if (!dragging.current) setStepX(initStepX) }, [initStepX])
  useEffect(() => { if (!dragging.current) setStepY(initStepY) }, [initStepY])

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
      onGridChange(label, newTop, newLeft, perRow, stepX, stepY)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const commitGrid = (nextPerRow: number, nextStepX: number, nextStepY: number) => {
    setPerRow(nextPerRow); setStepX(nextStepX); setStepY(nextStepY)
    onGridChange(label, pos.top, pos.left, nextPerRow, nextStepX, nextStepY)
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

  const boxes = Array.from({ length: Math.max(0, count) }, (_, i) => i)
  const inputStyle: React.CSSProperties = {
    width: 26, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.35)',
    borderRadius: 2, color: '#fff', fontSize: 9, fontFamily: 'monospace', textAlign: 'center',
    padding: '0 1px',
  }

  return (
    <>
      {boxes.map(i => {
        // Remplissage par paquets (voir la note sur blocTaille) : paquet i/(2*blocTaille), les
        // blocTaille premières cases du paquet sur la ligne du haut, les blocTaille suivantes sur celle
        // du bas — sinon (blocTaille absent) ligne par ligne complète, comportement d'origine.
        const row = blocTaille
          ? Math.floor(i / blocTaille) % 2
          : Math.floor(i / Math.max(1, perRow))
        const col = blocTaille
          ? Math.floor(i / (blocTaille * 2)) * blocTaille + (i % blocTaille)
          : i % Math.max(1, perRow)
        const checked = i < checkedCount
        return (
          <div
            key={i}
            className={temporaire ? 'tdr-temporaire' : undefined}
            onClick={() => !calibrate && onValueChange(checked ? i : i + 1)}
            style={{
              position: 'absolute',
              top: `${pos.top + row * stepY}%`,
              left: `${pos.left + col * stepX}%`,
              transform: 'translate(-50%, -50%)',
              // calc(...) — voir la note sur --zoom-scale dans App.tsx/SheetField.tsx.
              width: 'calc(0.85vw * var(--zoom-scale, 1))', height: 'calc(0.85vw * var(--zoom-scale, 1))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: calibrate ? 'default' : 'pointer',
              background: 'transparent',
            }}
          >
            <CroixCase coche={checked} calibrate={calibrate} epaisseur={2} taille="85%" />
          </div>
        )
      })}
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
          <span title="Cases par ligne" style={{ display: 'flex', alignItems: 'center', gap: 1, paddingLeft: 3, borderLeft: '1px solid rgba(255,255,255,0.35)' }}>
            ×
            <input type="number" min={1} value={perRow}
              onMouseDown={e => e.stopPropagation()}
              onChange={e => commitGrid(Math.max(1, parseInt(e.target.value) || 1), stepX, stepY)}
              style={inputStyle} />
          </span>
          <span title="Espacement horizontal (%)" style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            ↔
            <input type="number" step={0.1} value={stepX}
              onMouseDown={e => e.stopPropagation()}
              onChange={e => commitGrid(perRow, parseFloat(e.target.value) || 0.1, stepY)}
              style={inputStyle} />
          </span>
          <span title="Espacement vertical (%)" style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            ↕
            <input type="number" step={0.1} value={stepY}
              onMouseDown={e => e.stopPropagation()}
              onChange={e => commitGrid(perRow, stepX, parseFloat(e.target.value) || 0.1)}
              style={inputStyle} />
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
