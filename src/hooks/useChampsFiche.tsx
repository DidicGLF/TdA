import React from 'react'
import { createPortal } from 'react-dom'
import type { FieldPositions, SheetPage } from '../context/GameDataContext'
import DraggableField from '../components/DraggableField'
import type { TooltipData, TooltipLine } from '../components/SheetTooltip'

export type ChampsFicheOptions = {
  // Fiche actuellement affichée, et fiche d'origine des champs de ce bloc (celle où ils se trouvent
  // tant que l'utilisateur ne les a pas déplacés).
  page: SheetPage
  defaultPage: SheetPage
  calibrate: boolean
  fieldPositions?: FieldPositions
  containerRef: React.RefObject<HTMLDivElement | null>
  setTooltip: React.Dispatch<React.SetStateAction<TooltipData | null>>
  onFieldMoved?: (label: string, top: number, left: number, width?: number, height?: number) => void
  reservePortalTarget?: HTMLElement | null
  onReserveToggle?: (label: string, reserved: boolean, pos: { top: number; left: number; width?: number; height?: number; perRow?: number; page?: SheetPage }) => void
}

type FProps = Omit<React.ComponentProps<typeof DraggableField>, 'calibrate' | 'containerRef' | 'onMoved' | 'reserved' | 'onReserveToggle' | 'reservePortalTarget'> & {
  formula?: { lines: TooltipLine[]; total: string | number }
  tooltipDesc?: string
  tooltipTitle?: string
  // Un champ tout neuf (pas encore d'entrée dans fieldPositions) part directement dans la réserve
  // plutôt que sur la feuille à une position devinée.
  reserveByDefault?: boolean
}

// Tuyauterie commune à tous les champs de fiche : résolution de la position calibrée, appartenance à
// une fiche (recto/verso), pastille de réserve, glisser-déposer et zones d'infobulle. Centralisée ici
// pour qu'un bloc de champs puisse être affiché indifféremment par n'importe quelle fiche — c'est ce
// qui rend les champs déplaçables d'une fiche à l'autre sans toucher au code.
export function useChampsFiche({
  page, defaultPage, calibrate, fieldPositions, containerRef, setTooltip,
  onFieldMoved, reservePortalTarget, onReserveToggle,
}: ChampsFicheOptions) {
  const cb = onFieldMoved ?? (() => {})
  const cbReserve = onReserveToggle ?? (() => {})

  const pageDe = (id: string) => fieldPositions?.[id]?.page ?? defaultPage
  const surCettePage = (id: string) => pageDe(id) === page

  const moveTooltip = (e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    setTooltip(prev => prev ? { ...prev,
      x: (e.clientX - rect.left) / rect.width * 100,
      y: (e.clientY - rect.top)  / rect.height * 100 } : null)
  }

  const showFormula = (nom: string, formula: { lines: TooltipLine[]; total: string | number }, e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    setTooltip({ nom, lines: formula.lines, total: formula.total,
      x: (e.clientX - rect.left) / rect.width * 100,
      y: (e.clientY - rect.top)  / rect.height * 100 })
  }

  // Pastille de réserve : affichée quelle que soit la fiche ouverte (réserve commune), pour pouvoir
  // récupérer depuis une fiche un champ mis de côté depuis l'autre. Le clic le pose sur la fiche EN
  // COURS — c'est donc le geste qui fait changer un champ de fiche.
  const reserveChip = (id: string, pos: { top: number; left: number; width?: number; height?: number }) => {
    if (!calibrate || !reservePortalTarget) return null
    const venuDAilleurs = pageDe(id) !== page
    return createPortal(
      <div key={id} onClick={() => cbReserve(id, false, { ...pos, page })}
        title={venuDAilleurs ? `Placer sur cette fiche (vient du ${pageDe(id)})` : 'Placer sur la feuille'}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          background: 'rgba(160,90,230,0.18)', border: '1px solid rgba(160,90,230,0.6)',
          color: 'rgba(225,205,255,0.95)', fontSize: 12, fontFamily: 'monospace', fontWeight: 700,
          padding: '4px 9px', borderRadius: 4, userSelect: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
        }}>
        {id}
        {venuDAilleurs && <span style={{ opacity: 0.6, fontSize: 10 }}>({pageDe(id) === 'recto' ? 'R' : 'V'})</span>}
      </div>,
      reservePortalTarget,
    )
  }

  // Position calibrée d'un champ (utile aux blocs qui dessinent autre chose qu'un DraggableField).
  const resoudre = <T extends { top: number; left: number; width?: number; height?: number }>(id: string, defauts: T) => {
    const fp = fieldPositions?.[id]
    return fp ? { ...defauts, top: fp.top, left: fp.left,
      ...(fp.width !== undefined ? { width: fp.width } : {}),
      ...(fp.height !== undefined ? { height: fp.height } : {}) } : defauts
  }

  // Rendu d'un champ. Renvoie null si le champ appartient à l'autre fiche, la pastille s'il est en
  // réserve, sinon le champ complet (avec ses zones d'infobulle formule/description).
  const f = ({ formula, tooltipDesc, title, tooltipTitle, reserveByDefault, ...p }: FProps) => {
    const fp = fieldPositions?.[p.label]
    if (fp?.reserved === true || (!fp && reserveByDefault === true)) {
      return reserveChip(p.label, { top: p.top, left: p.left, width: p.width, height: p.height })
    }
    if (!surCettePage(p.label)) return null
    const ep = resoudre(p.label, p)
    const ttitle = tooltipTitle ?? ep.label
    const zoneStyle: React.CSSProperties = {
      position: 'absolute', top: `${ep.top}%`, left: `${ep.left}%`,
      width: `${ep.width}%`, height: `${ep.height ?? 2.2}%`,
      transform: 'translate(-50%, -50%)', zIndex: 20, cursor: 'help',
    }
    return (
      <React.Fragment key={ep.label}>
        <DraggableField {...ep} title={formula || tooltipDesc ? undefined : title} calibrate={calibrate} containerRef={containerRef} onMoved={cb}
          onReserveToggle={r => cbReserve(p.label, r, { top: ep.top, left: ep.left, width: ep.width, height: ep.height })} />
        {formula && !calibrate && p.readOnly && (
          <div style={zoneStyle}
            onMouseEnter={e => showFormula(ttitle, formula, e)}
            onMouseMove={moveTooltip}
            onMouseLeave={() => setTooltip(null)}
            onTouchStart={e => {
              const touch = e.touches[0]
              const rect = containerRef.current?.getBoundingClientRect()
              if (!rect) return
              setTooltip({ nom: ttitle, lines: formula.lines, total: formula.total,
                x: (touch.clientX - rect.left) / rect.width * 100,
                y: (touch.clientY - rect.top)  / rect.height * 100 })
            }}
            onTouchEnd={() => setTimeout(() => setTooltip(null), 2500)}
          />
        )}
        {tooltipDesc && !formula && !calibrate && (
          <div style={zoneStyle}
            onMouseEnter={e => {
              const rect = containerRef.current?.getBoundingClientRect()
              if (!rect) return
              setTooltip({ nom: ttitle, desc: tooltipDesc, x: (e.clientX - rect.left) / rect.width * 100, y: (e.clientY - rect.top) / rect.height * 100 })
            }}
            onMouseMove={moveTooltip}
            onMouseLeave={() => setTooltip(null)}
            onTouchStart={e => {
              const touch = e.touches[0]
              const rect = containerRef.current?.getBoundingClientRect()
              if (!rect) return
              setTooltip({ nom: ttitle, desc: tooltipDesc,
                x: (touch.clientX - rect.left) / rect.width * 100,
                y: (touch.clientY - rect.top)  / rect.height * 100 })
            }}
            onTouchEnd={() => setTimeout(() => setTooltip(null), 2500)}
          />
        )}
      </React.Fragment>
    )
  }

  return { f, moveTooltip, showFormula, reserveChip, resoudre, surCettePage, pageDe, cb, cbReserve }
}
