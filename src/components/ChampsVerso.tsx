import React, { useState } from 'react'
import CroixCase from './CroixCase'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { Character } from '../types/character'
import DraggableField from './DraggableField'
import DraggableTextarea from './DraggableTextarea'
import DraggableImageField from './DraggableImageField'
import { useGameData } from '../context/GameDataContext'
import type { FieldPositions, SheetPage } from '../context/GameDataContext'
import { useTranslatedDescriptions } from '../hooks/useContentTranslation'
import SheetTooltip from './SheetTooltip'
import type { TooltipData } from './SheetTooltip'


const FORMATION_CHECKBOXES: { nom: string; top: number; left: number }[] = [
  { nom: 'Armures légères',         top: 12.0, left: 54.5 },
  { nom: 'Armures lourdes',         top: 13.3, left: 54.4 },
  { nom: 'Armes de jet',            top: 14.7, left: 54.3 },
  { nom: 'Armes de trait',          top: 16.0, left: 54.4 },
  { nom: 'Armes de tir',            top: 17.3, left: 54.3 },
  { nom: 'Armes de guerre',         top: 13.3, left: 66.8 },
  { nom: 'Armes de guerre lourdes', top: 14.7, left: 66.7 },
  { nom: 'Armes de duel',           top: 16.0, left: 66.8 },
  { nom: "Armes d'hast",            top: 17.3, left: 66.7 },
]

interface Props {
  character: Character
  onChange: (patch: Partial<Character>) => void
  activeStep: number
  containerRef: React.RefObject<HTMLDivElement | null>
  // Fiche affichée, et fiche d'origine de ces champs (le verso) tant qu'ils n'ont pas été déplacés.
  page: SheetPage
  defaultPage: SheetPage
  calibrate?: boolean
  locked?: boolean
  onFieldMoved?: (label: string, top: number, left: number, width?: number, height?: number) => void
  fieldPositions?: FieldPositions
  reservePortalTarget?: HTMLElement | null
  onReserveToggle?: (label: string, reserved: boolean, pos: { top: number; left: number; width?: number; height?: number; page?: SheetPage }) => void
}

// Bloc autonome regroupant les champs dont le verso est la fiche d'origine (portrait, description,
// inventaire, formations martiales, talent magique, trésorerie…). Monté par les DEUX fiches.
export default function ChampsVerso({
  character, onChange, activeStep, containerRef, page, defaultPage,
  calibrate = false, onFieldMoved, fieldPositions,
  reservePortalTarget, onReserveToggle,
}: Props) {
  const { t } = useTranslation()
  const cb = onFieldMoved ?? (() => {})
  const cbReserve = onReserveToggle ?? (() => {})
  // Point de passage unique pour (quasi) tous les champs de cette page : en plus de la position, fournit
  // reserved/reservePortalTarget/onReserveToggle, propagés par simple spread {...fp(...)} sur chaque
  // DraggableField/DraggableTextarea sans avoir à toucher individuellement chaque site d'appel.
  const pageDe = (id: string) => fieldPositions?.[id]?.page ?? defaultPage
  // Un champ est rendu ici s'il est assigné à cette fiche, ou s'il est en réserve (sa pastille doit
  // rester accessible depuis n'importe quelle fiche pour pouvoir le récupérer).
  const visible = (id: string) => fieldPositions?.[id]?.reserved === true || pageDe(id) === page
  const fp = (label: string, t: number, l: number, w: number, h: number) => {
    const ov = fieldPositions?.[label]
    const top = ov?.top ?? t, left = ov?.left ?? l, width = ov?.width ?? w, height = ov?.height ?? h
    return {
      top, left, width, height,
      reserved: ov?.reserved === true,
      reservePortalTarget,
      // Reposer un champ depuis la réserve l'assigne à la fiche EN COURS (geste de changement de page).
      onReserveToggle: (r: boolean) => cbReserve(label, r, r ? { top, left, width, height } : { top, left, width, height, page }),
    }
  }
  const { data: rawData } = useGameData()
  const data = useTranslatedDescriptions(rawData)
  const [cbPos, setCbPos] = useState<Record<string, { top: number; left: number }>>(
    Object.fromEntries(FORMATION_CHECKBOXES.map(f => [f.nom, fieldPositions?.[f.nom] ?? { top: f.top, left: f.left }]))
  )
  const [tooltip, setTooltip] = useState<TooltipData | null>(null)
  const [togglePos, setTogglePos] = useState(fieldPositions?.['Toggle image/description'] ?? { top: 17.5, left: 3.3 })

  React.useEffect(() => {
    setCbPos(Object.fromEntries(FORMATION_CHECKBOXES.map(f => [f.nom, fieldPositions?.[f.nom] ?? { top: f.top, left: f.left }])))
    if (fieldPositions?.['Toggle image/description']) setTogglePos(fieldPositions['Toggle image/description'])
  }, [fieldPositions])

  const startToggleDrag = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    const startX = e.clientX, startY = e.clientY
    const { top: startTop, left: startLeft } = togglePos
    const onMove = (ev: MouseEvent) => {
      const rect = containerRef.current!.getBoundingClientRect()
      setTogglePos({
        top:  +(startTop  + (ev.clientY - startY) / rect.height * 100).toFixed(1),
        left: +(startLeft + (ev.clientX - startX) / rect.width  * 100).toFixed(1),
      })
    }
    const onUp = (ev: MouseEvent) => {
      const rect = containerRef.current!.getBoundingClientRect()
      const newTop  = +(startTop  + (ev.clientY - startY) / rect.height * 100).toFixed(1)
      const newLeft = +(startLeft + (ev.clientX - startX) / rect.width  * 100).toFixed(1)
      setTogglePos({ top: newTop, left: newLeft })
      cb('Toggle image/description', newTop, newLeft)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const maxFormations = character.famille === 'combattants' ? 3 : character.famille === 'aventuriers' ? 2 : 1
  const countFormations = character.formationsMartiales.filter(f =>
    FORMATION_CHECKBOXES.some(cb => cb.nom === f)
  ).length

  const toggleFormation = (nom: string) => {
    if (calibrate) return
    const current = character.formationsMartiales
    const isChecked = current.includes(nom)
    if (!isChecked && countFormations >= maxFormations) return
    onChange({ formationsMartiales: isChecked ? current.filter(f => f !== nom) : [...current, nom] })
  }

  const startCheckboxDrag = (nom: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startY = e.clientY
    const { top: startTop, left: startLeft } = cbPos[nom]

    const onMove = (ev: MouseEvent) => {
      const rect = containerRef.current!.getBoundingClientRect()
      setCbPos(prev => ({
        ...prev,
        [nom]: {
          top:  +(startTop  + (ev.clientY - startY) / rect.height * 100).toFixed(1),
          left: +(startLeft + (ev.clientX - startX) / rect.width  * 100).toFixed(1),
        },
      }))
    }

    const onUp = (ev: MouseEvent) => {
      const rect = containerRef.current!.getBoundingClientRect()
      const newTop  = +(startTop  + (ev.clientY - startY) / rect.height * 100).toFixed(1)
      const newLeft = +(startLeft + (ev.clientX - startX) / rect.width  * 100).toFixed(1)
      setCbPos(prev => ({ ...prev, [nom]: { top: newTop, left: newLeft } }))
      cb(nom, newTop, newLeft)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }


  return (
    <>

      {/* === TOGGLE IMAGE / DESCRIPTION === */}
      {visible('Toggle image/description') && <div className="no-print" style={{
        position: 'absolute',
        top: `${togglePos.top}%`, left: `${togglePos.left}%`,
        transform: 'translate(-50%, -50%) rotate(-90deg) translateZ(0)',
        backfaceVisibility: 'hidden',
        WebkitFontSmoothing: 'antialiased',
        display: 'flex', gap: 2, zIndex: 30,
        cursor: calibrate ? 'grab' : 'default',
      }}
        onMouseDown={calibrate ? startToggleDrag : undefined}
      >
        {calibrate ? (
          <span style={{
            background: 'rgba(160,90,230,0.92)', color: '#fff',
            fontSize: 7, fontFamily: 'monospace', fontWeight: 700,
            padding: '1px 4px', borderRadius: 2, userSelect: 'none',
            whiteSpace: 'nowrap', lineHeight: '13px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
          }}>
            Toggle image/description
          </span>
        ) : (
          (['description', 'image'] as const).map(mode => {
            const active = (character.versoMode ?? 'description') === mode
            return (
              <button key={mode} onClick={() => onChange({ versoMode: mode })} style={{
                padding: '2px 8px', borderRadius: 3, fontSize: '0.6vw',
                fontFamily: 'inherit', cursor: 'pointer', letterSpacing: '0.06em',
                border: '1px solid rgba(201,168,76,0.7)',
                background: active ? 'rgba(201,168,76,0.85)' : 'rgba(30,20,10,0.75)',
                color: active ? '#1a1208' : 'rgba(201,168,76,0.9)',
                fontWeight: active ? 700 : 400,
              }}>
                {mode === 'description' ? t('fiche.modeTexte') : t('fiche.modeImage')}
              </button>
            )
          })
        )}
      </div>}

      {/* === PORTRAIT (mode image, ou calibrage) === */}
      {((character.versoMode ?? 'description') === 'image' || calibrate) && visible('Portrait') && (
        <>
          {(character.versoMode ?? 'description') === 'image' && !calibrate && (
            <div style={{
              position: 'absolute',
              top: '30.6%', left: '26.5%',
              width: '44%', height: '37%',
              transform: 'translate(-50%, -50%)',
              background: '#fff',
            }} />
          )}
          <DraggableImageField
            {...(({ top, left, width, height }) => ({ top, left, width, height }))(fp('Portrait', 30.6, 26.5, 44, 37))}
            value={character.portrait}
            scale={character.portraitScale} tx={character.portraitTx} ty={character.portraitTy}
            fit={character.portraitFit ?? 'cover'}
            locked={character.portraitLocked ?? false}
            onChange={v => onChange({ portrait: v })}
            onPanZoomChange={(scale, tx, ty) => onChange({ portraitScale: scale, portraitTx: tx, portraitTy: ty })}
            onFitChange={f => onChange({ portraitFit: f })}
            onLockedChange={l => onChange({ portraitLocked: l })}
            calibrate={calibrate} label="Portrait"
            containerRef={containerRef} onMoved={cb}
          />
        </>
      )}

      {/* === DESCRIPTION (mode texte, ou calibrage) === */}
      {((character.versoMode ?? 'description') === 'description' || calibrate) && visible("Description") && (
        <DraggableTextarea
          {...fp("Description", 32.2, 26.6, 44.2, 35.1)}
          value={character.description}
          onChange={v => onChange({ description: v })}
          calibrate={calibrate} label="Description"
          containerRef={containerRef} onMoved={cb}
          lineHeightPct={1.315} paddingTopPct={0.16}
        />
      )}

      {/* === INVENTAIRE === */}
      {visible("Inventaire") && <DraggableTextarea
        {...fp("Inventaire", 40.9, 73.3, 44.2, 15.5)}
        value={character.inventaire}
        onChange={v => onChange({ inventaire: v })}
        calibrate={calibrate} label="Inventaire"
        containerRef={containerRef} onMoved={cb}
        lineHeightPct={1.315} paddingTopPct={0.15}
      />}

      {/* === FORMATIONS MARTIALES === */}
      {FORMATION_CHECKBOXES.map(({ nom }) => {
        const { top, left } = cbPos[nom]
        const chipLabel = nom.replace('Armes de ', '').replace('Armures ', '')
        if (fieldPositions?.[nom]?.reserved === true) {
          if (!calibrate || !reservePortalTarget) return null
          const venuDAilleurs = pageDe(nom) !== page
          return createPortal(
            <div key={nom} onClick={() => cbReserve(nom, false, { top, left, page })}
              title={venuDAilleurs ? `Placer sur cette fiche (vient du ${pageDe(nom)})` : 'Placer sur la feuille'}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: 'rgba(160,90,230,0.18)', border: '1px solid rgba(160,90,230,0.6)',
                color: 'rgba(225,205,255,0.95)', fontSize: 12, fontFamily: 'monospace', fontWeight: 700,
                padding: '4px 9px', borderRadius: 4, userSelect: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
              }}>
              {chipLabel}
              {venuDAilleurs && <span style={{ opacity: 0.6, fontSize: 10 }}>({pageDe(nom) === 'recto' ? 'R' : 'V'})</span>}
            </div>,
            reservePortalTarget,
          )
        }
        if (pageDe(nom) !== page) return null
        return (
          <div key={nom}>
            {/* Case à cocher */}
            <div
              onClick={() => toggleFormation(nom)}
              style={{
                position: 'absolute',
                top: `${top}%`, left: `${left}%`,
                width: '1.6%', height: '1.1%',
                transform: 'translate(-50%, -50%)',
                cursor: calibrate ? 'default' : (!character.formationsMartiales.includes(nom) && countFormations >= maxFormations) ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <CroixCase coche={character.formationsMartiales.includes(nom)} calibrate={calibrate} />
            </div>
            {/* Tag draggable en mode calibrage */}
            {calibrate && (
              <div
                onMouseDown={e => startCheckboxDrag(nom, e)}
                style={{
                  position: 'absolute',
                  top: `${top}%`, left: `${left}%`,
                  // Décalée au-dessus de la case : centrée dessus, elle masquerait la croix-repère.
                  transform: 'translate(-50%, calc(-100% - 3px))',
                  cursor: 'grab',
                  background: 'rgba(160,90,230,0.92)',
                  color: '#fff',
                  fontSize: 7,
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  padding: '1px 4px',
                  borderRadius: 2,
                  userSelect: 'none',
                  zIndex: 40,
                  whiteSpace: 'nowrap',
                  lineHeight: '13px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
                  display: 'flex', alignItems: 'center', gap: 2,
                }}
              >
                {chipLabel}
                {onReserveToggle && (
                  <span
                    onMouseDown={e => { e.preventDefault(); e.stopPropagation(); onReserveToggle(nom, true, { top, left }) }}
                    style={{ cursor: 'pointer', fontSize: 9, paddingLeft: 3, borderLeft: '1px solid rgba(255,255,255,0.35)', lineHeight: 1 }}
                    title="Envoyer à la réserve"
                  >📥</span>
                )}
              </div>
            )}
          </div>
        )
      })}


      {/* === TALENT MAGIQUE === */}
      {visible("Talent magique") && <DraggableField
        {...fp("Talent magique", 23.8, 79.6, 29.6, 2.0)}
        value={character.talentMagique.nom} onChange={v => onChange({ talentMagique: { ...character.talentMagique, nom: v } })}
        calibrate={calibrate} label="Talent magique"
        containerRef={containerRef} onMoved={cb}
        active={activeStep === 5}
      />}
      {/* Zone de survol du talent magique : elle doit suivre la position calibrée du champ et n'exister
          que sur la fiche où il est réellement posé. */}
      {!calibrate && character.talentMagique.desc && visible('Talent magique')
        && pageDe('Talent magique') === page && !fieldPositions?.['Talent magique']?.reserved && (
        <div
          style={{
            position: 'absolute',
            top: `${fp('Talent magique', 23.8, 79.6, 29.6, 2.0).top}%`,
            left: `${fp('Talent magique', 23.8, 79.6, 29.6, 2.0).left}%`,
            width: `${fp('Talent magique', 23.8, 79.6, 29.6, 2.0).width}%`, height: '2%',
            transform: 'translate(-50%, -50%)',
            zIndex: 20, cursor: 'help',
          }}
          onMouseEnter={e => {
            const rect = containerRef.current!.getBoundingClientRect()
            setTooltip({ nom: character.talentMagique.nom, desc: character.talentMagique.desc, x: (e.clientX - rect.left) / rect.width * 100, y: (e.clientY - rect.top) / rect.height * 100 })
          }}
          onMouseMove={e => {
            const rect = containerRef.current!.getBoundingClientRect()
            setTooltip(prev => prev ? { ...prev, x: (e.clientX - rect.left) / rect.width * 100, y: (e.clientY - rect.top) / rect.height * 100 } : null)
          }}
          onMouseLeave={() => setTooltip(null)}
        />
      )}

      {/* === TALENT MAGIQUE DESC === */}
      {visible("Talent magique desc") && <DraggableTextarea
        {...fp("Talent magique desc", 27.3, 73.2, 44.4, 5.4)}
        value={character.talentMagique.desc}
        onChange={v => onChange({ talentMagique: { ...character.talentMagique, desc: v } })}
        calibrate={calibrate} label="Talent magique desc"
        containerRef={containerRef} onMoved={cb}
        lineHeightPct={1.315} paddingTopPct={0.15}
        autoShrink
      />}

      {/* === TRÉSORERIE === */}
      {visible("Trésorerie") && <DraggableField
        {...fp("Trésorerie", 72.2, 49.9, 29.2, 2.0)}
        value={character.tresorerie} onChange={v => onChange({ tresorerie: v })}
        calibrate={calibrate} label="Trésorerie"
        containerRef={containerRef} onMoved={cb}
        active={activeStep === 6}
      />}

      {/* === NOM DU JOUEUR === */}
      {visible("Nom du joueur") && <DraggableField
        {...fp("Nom du joueur", 9.1, 37, 22.8, 2.0)}
        value={character.nomJoueur} onChange={() => {}}
        calibrate={calibrate} label="Nom du joueur"
        containerRef={containerRef} onMoved={cb}
      />}

      {/* === CAPACITÉS SUPPLÉMENTAIRES === */}
      {visible("Capacités supp.") && <DraggableTextarea
        {...fp("Capacités supp.", 82, 80.7, 29.1, 21.1)}
        value={character.capacitesSupplementaires}
        onChange={v => onChange({ capacitesSupplementaires: v })}
        calibrate={calibrate} label="Capacités supp."
        containerRef={containerRef} onMoved={cb}
      />}

      {tooltip && <SheetTooltip tooltip={tooltip} character={character} descriptions={data} />}
    </>
  )
}
