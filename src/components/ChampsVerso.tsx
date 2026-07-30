import React, { useState, useContext } from 'react'
import CroixCase from './CroixCase'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { Character } from '../types/character'
import { normaliserTresorerie } from '../types/character'
import DraggableField from './DraggableField'
import DraggableTextarea from './DraggableTextarea'
import DraggableImageField from './DraggableImageField'
import DraggableCursorRow from './DraggableCursorRow'
import { useGameData } from '../context/GameDataContext'
import type { FieldPositions, SheetPage } from '../context/GameDataContext'
import { useTranslatedDescriptions } from '../hooks/useContentTranslation'
import SheetTooltip from './SheetTooltip'
import type { TooltipData } from './SheetTooltip'
import { TRAITS_PSYCHOLOGIE, labelProfilPsychologie } from '../data/psychologieTraits'
import { ModeImpressionContext } from '../hooks/modeImpression'
import PastilleImpression from './PastilleImpression'


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
  // Champs "rangée de cases à cocher" ou "curseur" (DraggableCheckboxRow/DraggableCursorRow) — voir
  // FieldPosition.perRow (stepX/stepY réutilisent width/height).
  onCheckboxRowMoved?: (label: string, top: number, left: number, perRow: number, stepX: number, stepY: number) => void
}

// Bloc autonome regroupant les champs dont le verso est la fiche d'origine (portrait, description,
// inventaire, formations martiales, talent magique, trésorerie…). Monté par les DEUX fiches.
export default function ChampsVerso({
  character, onChange, activeStep, containerRef, page, defaultPage,
  calibrate = false, onFieldMoved, fieldPositions,
  reservePortalTarget, onReserveToggle, onCheckboxRowMoved,
}: Props) {
  const { t } = useTranslation()
  const modeImpression = useContext(ModeImpressionContext)
  const cb = onFieldMoved ?? (() => {})
  const cbReserve = onReserveToggle ?? (() => {})
  // Point de passage unique pour (quasi) tous les champs de cette page : en plus de la position, fournit
  // reserved/reservePortalTarget/onReserveToggle, propagés par simple spread {...fp(...)} sur chaque
  // DraggableField/DraggableTextarea sans avoir à toucher individuellement chaque site d'appel.
  const pageDe = (id: string) => fieldPositions?.[id]?.page ?? defaultPage
  // Un champ est rendu ici s'il est assigné à cette fiche, ou s'il est en réserve (sa pastille doit
  // rester accessible depuis n'importe quelle fiche pour pouvoir le récupérer).
  const visible = (id: string) => fieldPositions?.[id]?.reserved === true || pageDe(id) === page
  // reserveByDefault (comme f() dans ChampsRecto/useChampsFiche) : un champ tout neuf, sans encore
  // d'entrée dans fieldPositions, part directement en réserve plutôt qu'à une position devinée — voir
  // feedback_nouveaux_champs_en_reserve. Les appels existants l'omettent (false), comportement inchangé.
  const fp = (label: string, t: number, l: number, w: number, h: number, reserveByDefault = false) => {
    const ov = fieldPositions?.[label]
    const top = ov?.top ?? t, left = ov?.left ?? l, width = ov?.width ?? w, height = ov?.height ?? h
    return {
      top, left, width, height,
      reserved: ov?.reserved === true || (!ov && reserveByDefault),
      reservePortalTarget,
      // Reposer un champ depuis la réserve l'assigne à la fiche EN COURS (geste de changement de page).
      onReserveToggle: (r: boolean) => cbReserve(label, r, r ? { top, left, width, height } : { top, left, width, height, page }),
      // Décision d'impression : par défaut le champ figure sur le papier (cf. FieldPosition.imprimer).
      imprime: ov?.imprimer ?? true,
      onToggleImpression: () => cbReserve(label, ov?.reserved === true, { imprimer: !(ov?.imprimer ?? true) } as never),
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
          {(character.versoMode ?? 'description') === 'image' && !calibrate && (() => {
            // Fond blanc sous le portrait (mode image) — même position calibrée que le champ Portrait
            // juste en dessous (fp('Portrait', ...)) : sans ça, recalibrer le portrait ne déplaçait pas
            // ce fond, resté sur ses anciennes coordonnées par défaut (rapporté par Didic).
            const { top, left, width, height } = fp('Portrait', 30.6, 26.5, 44, 37)
            return (
              <div style={{
                position: 'absolute',
                top: `${top}%`, left: `${left}%`,
                width: `${width}%`, height: `${height}%`,
                transform: 'translate(-50%, -50%)',
                background: '#fff',
              }} />
            )
          })()}
          <DraggableImageField
            {...(({ top, left, width, height, imprime, onToggleImpression }) => ({ top, left, width, height, imprime, onToggleImpression }))(fp('Portrait', 30.6, 26.5, 44, 37))}
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
        temporaire
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
            {modeImpression && onReserveToggle && (
              <PastilleImpression
                imprime={fieldPositions?.[nom]?.imprimer ?? true}
                onToggle={() => cbReserve(nom, fieldPositions?.[nom]?.reserved === true, { top, left, imprimer: !(fieldPositions?.[nom]?.imprimer ?? true) } as never)}
                top={top} left={left}
              />
            )}
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

      {/* === PSYCHOLOGIE (curseurs sur graduation imprimée) === : nouveaux champs, réservés par défaut
          (jamais de position devinée — voir feedback_nouveaux_champs_en_reserve), contrairement à
          pmRestants ci-dessus qui a une vraie position par défaut héritée d'avant cette règle. */}
      {TRAITS_PSYCHOLOGIE.map(trait => {
        const label = `Psychologie ${trait.nom}`
        const cfp = fieldPositions?.[label]
        const rTop = cfp?.top ?? 50, rLeft = cfp?.left ?? 50
        const rStepX = cfp?.width ?? 1.0, rStepY = cfp?.height ?? 0
        const cbRowMoved = onCheckboxRowMoved ?? (() => {})
        if (cfp?.reserved === true || !cfp) {
          if (!calibrate || !reservePortalTarget) return null
          const venuDAilleurs = pageDe(label) !== page
          return createPortal(
            <div key={label} onClick={() => cbReserve(label, false, { top: rTop, left: rLeft, width: rStepX, height: rStepY, page })}
              title={venuDAilleurs ? `Placer sur cette fiche (vient du ${pageDe(label)})` : 'Placer sur la feuille'}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: 'rgba(160,90,230,0.18)', border: '1px solid rgba(160,90,230,0.6)',
                color: 'rgba(225,205,255,0.95)', fontSize: 12, fontFamily: 'monospace', fontWeight: 700,
                padding: '4px 9px', borderRadius: 4, userSelect: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
              }}>
              {label}
              {venuDAilleurs && <span style={{ opacity: 0.6, fontSize: 10 }}>({pageDe(label) === 'recto' ? 'R' : 'V'})</span>}
            </div>,
            reservePortalTarget,
          )
        }
        if (pageDe(label) !== page) return null
        return (
          <DraggableCursorRow
            key={label}
            label={label} top={rTop} left={rLeft} stepX={rStepX} stepY={rStepY} count={11}
            value={character.psychologie?.[trait.cle] ?? 5}
            onValueChange={v => onChange({ psychologie: { ...character.psychologie, [trait.cle]: v } })}
            calibrate={calibrate} containerRef={containerRef}
            onGridChange={(l, t, lf, pr, sx, sy) => cbRowMoved(l, t, lf, pr, sx, sy)}
            onReserveToggle={r => cbReserve(label, r, { top: rTop, left: rLeft, width: rStepX, height: rStepY })}
            imprime={cfp?.imprimer ?? true}
            onToggleImpression={() => cbReserve(label, cfp?.reserved === true, { imprimer: !(cfp?.imprimer ?? true) } as never)}
          />
        )
      })}

      {/* === PSYCHOLOGIE (texte du profil, au-dessus de chaque graduation) === : champ séparé du
          curseur (position/forme différente — un large rectangle de texte plutôt qu'un axe), en lecture
          seule, réservé par défaut comme les curseurs ci-dessus. */}
      {TRAITS_PSYCHOLOGIE.map(trait => {
        const label = `Psychologie ${trait.nom} texte`
        const tfp = fieldPositions?.[label]
        const rTop = tfp?.top ?? 50, rLeft = tfp?.left ?? 50, rWidth = tfp?.width ?? 20, rHeight = tfp?.height ?? 2
        if (tfp?.reserved === true || !tfp) {
          if (!calibrate || !reservePortalTarget) return null
          const venuDAilleurs = pageDe(label) !== page
          return createPortal(
            <div key={label} onClick={() => cbReserve(label, false, { top: rTop, left: rLeft, width: rWidth, height: rHeight, page })}
              title={venuDAilleurs ? `Placer sur cette fiche (vient du ${pageDe(label)})` : 'Placer sur la feuille'}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: 'rgba(160,90,230,0.18)', border: '1px solid rgba(160,90,230,0.6)',
                color: 'rgba(225,205,255,0.95)', fontSize: 12, fontFamily: 'monospace', fontWeight: 700,
                padding: '4px 9px', borderRadius: 4, userSelect: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
              }}>
              {label}
              {venuDAilleurs && <span style={{ opacity: 0.6, fontSize: 10 }}>({pageDe(label) === 'recto' ? 'R' : 'V'})</span>}
            </div>,
            reservePortalTarget,
          )
        }
        if (pageDe(label) !== page) return null
        return (
          <DraggableField
            key={label}
            top={rTop} left={rLeft} width={rWidth} height={rHeight}
            value={labelProfilPsychologie(trait, character.psychologie?.[trait.cle] ?? 5)}
            onChange={() => {}} readOnly align="center"
            calibrate={calibrate} label={label} containerRef={containerRef} onMoved={cb}
            imprime={tfp?.imprimer ?? true}
            onToggleImpression={() => cbReserve(label, tfp?.reserved === true, { imprimer: !(tfp?.imprimer ?? true) } as never)}
          />
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

      {/* === TRÉSORERIE (or/argent/cuivre/gemmes) === : "Trésorerie" garde sa clé de calibrage
          d'origine (réutilise la position déjà calée par Didic) mais affiche désormais l'or — d'où le
          `title="Or"` (texte affiché partout : infobulle, réserve, poignée) sans toucher à `label`
          (l'identifiant de calibrage). Argent/Cuivre/Gemmes sont de nouveaux champs, réservés par
          défaut (voir fp reserveByDefault). */}
      {visible("Trésorerie") && <DraggableField
        {...fp("Trésorerie", 72.2, 49.9, 29.2, 2.0)}
        temporaire type="number"
        value={character.piecesOr}
        onChange={v => onChange(normaliserTresorerie(parseInt(v) || 0, character.piecesArgent, character.piecesCuivre))}
        calibrate={calibrate} label="Trésorerie" title={t('wizard.step7.or')}
        containerRef={containerRef} onMoved={cb}
        active={activeStep === 6}
      />}
      {visible("Argent") && <DraggableField
        {...fp("Argent", 72.2, 49.9, 29.2, 2.0, true)}
        temporaire type="number"
        value={character.piecesArgent}
        onChange={v => onChange(normaliserTresorerie(character.piecesOr, parseInt(v) || 0, character.piecesCuivre))}
        calibrate={calibrate} label="Argent"
        containerRef={containerRef} onMoved={cb}
      />}
      {visible("Cuivre") && <DraggableField
        {...fp("Cuivre", 72.2, 49.9, 29.2, 2.0, true)}
        temporaire type="number"
        value={character.piecesCuivre}
        onChange={v => onChange(normaliserTresorerie(character.piecesOr, character.piecesArgent, parseInt(v) || 0))}
        calibrate={calibrate} label="Cuivre"
        containerRef={containerRef} onMoved={cb}
      />}
      {visible("Gemmes") && <DraggableTextarea
        {...fp("Gemmes", 72.2, 49.9, 29.2, 6.0, true)}
        temporaire
        value={character.gemmes} onChange={v => onChange({ gemmes: v })}
        calibrate={calibrate} label="Gemmes"
        containerRef={containerRef} onMoved={cb}
      />}

      {/* === NOM DU PERSONNAGE (répété depuis le recto) === : ancien champ "Nom du joueur", absent de la
          nouvelle maquette verso (déjà en réserve dans src/data/field-positions.json) — repris tel quel
          pour afficher le nom du personnage à la place, en réserve tant qu'il n'a pas été recalibré sur
          la nouvelle fiche. */}
      {visible("Nom du personnage") && <DraggableField
        {...fp("Nom du personnage", 9.1, 37, 22.8, 2.0, true)}
        value={character.nomPersonnage} onChange={() => {}}
        calibrate={calibrate} label="Nom du personnage"
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
