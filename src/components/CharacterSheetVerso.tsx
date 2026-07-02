import React, { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Character, VoiePersonnage, CompagnonOverride } from '../types/character'
import { parseDesc } from '../utils/parseDesc'
import DraggableField from './DraggableField'
import DraggableTextarea from './DraggableTextarea'
import DraggableImageField from './DraggableImageField'
import { useGameData } from '../context/GameDataContext'
import type { FieldPositions } from '../context/GameDataContext'
import { resolveCompagnon } from '../utils/compagnons'
import { calcPointsCapacite, coutRangPourVoie } from '../utils/levelUp'
import { useCompagnonName, useTranslatedDescriptions } from '../hooks/useContentTranslation'

interface Props {
  character: Character
  onChange: (patch: Partial<Character>) => void
  activeStep: number
  calibrate?: boolean
  locked?: boolean
  onFieldMoved?: (label: string, top: number, left: number, width?: number, height?: number) => void
  fieldPositions?: FieldPositions
  sheetImage?: string
}

const PRESTIGE_RANG_TOPS = [72.0, 76.3, 80.7, 85.1, 89.4]
const PRESTIGE_CB_LEFT = 5.7
const PRESTIGE_NOM_LEFT = 21.8
const PRESTIGE_NOM_WIDTH = 23.6

const VOIE_PRESTIGE_RANG_CHECKBOXES = PRESTIGE_RANG_TOPS.map((top, rang) => ({
  id: `prestige-${rang}`, rang, top, left: PRESTIGE_CB_LEFT,
}))

const VOIE_PRESTIGE_RANG_NOM_POS = PRESTIGE_RANG_TOPS.map((top, rang) => ({
  id: `prestige-${rang}`, top, left: PRESTIGE_NOM_LEFT, width: PRESTIGE_NOM_WIDTH,
}))

const SANG_MELE_RANG_TOPS = [83.0, 87.0, 91.0]
const SANG_MELE_CB_LEFT = 58.5
const SANG_MELE_NOM_LEFT = 65.0
const SANG_MELE_NOM_WIDTH = 19.0

const VOIE_SANG_MELE_RANG_CHECKBOXES = SANG_MELE_RANG_TOPS.map((top, rang) => ({
  id: `sangmele-${rang}`, rang, top, left: SANG_MELE_CB_LEFT,
}))

const VOIE_SANG_MELE_RANG_NOM_POS = SANG_MELE_RANG_TOPS.map((top, rang) => ({
  id: `sangmele-${rang}`, top, left: SANG_MELE_NOM_LEFT, width: SANG_MELE_NOM_WIDTH,
}))

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


export default function CharacterSheetVerso({ character, onChange, activeStep, calibrate = false, locked = true, onFieldMoved, fieldPositions, sheetImage }: Props) {
  const { t } = useTranslation()
  const compagnonName = useCompagnonName()
  const containerRef = useRef<HTMLDivElement>(null)
  const cb = onFieldMoved ?? (() => {})
  const fp = (label: string, t: number, l: number, w: number, h: number) => {
    const ov = fieldPositions?.[label]
    return { top: ov?.top ?? t, left: ov?.left ?? l, width: ov?.width ?? w, height: ov?.height ?? h }
  }
  const { data: rawData, compagnons: compagnonsCatalogue } = useGameData()
  const data = useTranslatedDescriptions(rawData)
  const [cbPos, setCbPos] = useState<Record<string, { top: number; left: number }>>(
    Object.fromEntries(FORMATION_CHECKBOXES.map(f => [f.nom, fieldPositions?.[f.nom] ?? { top: f.top, left: f.left }]))
  )
  const [prestigeRangPos, setPrestigeRangPos] = useState<Record<string, { top: number; left: number }>>(
    Object.fromEntries(VOIE_PRESTIGE_RANG_CHECKBOXES.map(c => [c.id, fieldPositions?.[c.id] ?? { top: c.top, left: c.left }]))
  )
  const [sangMeleRangPos, setSangMeleRangPos] = useState<Record<string, { top: number; left: number }>>(
    Object.fromEntries(VOIE_SANG_MELE_RANG_CHECKBOXES.map(c => [c.id, fieldPositions?.[c.id] ?? { top: c.top, left: c.left }]))
  )
  const [tooltip, setTooltip] = useState<{ nom: string; desc: string; rang?: number; x: number; y: number } | null>(null)
  const [togglePos, setTogglePos] = useState(fieldPositions?.['Toggle image/description'] ?? { top: 17.5, left: 3.3 })

  React.useEffect(() => {
    setCbPos(Object.fromEntries(FORMATION_CHECKBOXES.map(f => [f.nom, fieldPositions?.[f.nom] ?? { top: f.top, left: f.left }])))
    setPrestigeRangPos(Object.fromEntries(VOIE_PRESTIGE_RANG_CHECKBOXES.map(c => [c.id, fieldPositions?.[c.id] ?? { top: c.top, left: c.left }])))
    setSangMeleRangPos(Object.fromEntries(VOIE_SANG_MELE_RANG_CHECKBOXES.map(c => [c.id, fieldPositions?.[c.id] ?? { top: c.top, left: c.left }])))
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

  const togglePrestigeRang = (rang: number) => {
    if (calibrate) return
    const v = character.voiePrestige as VoiePersonnage
    const estCoché = v.rangs[rang]
    const newRangs = [...v.rangs]
    if (estCoché) {
      for (let i = rang; i < newRangs.length; i++) newRangs[i] = false
    } else {
      let { disponibles } = calcPointsCapacite(character)
      for (let i = 0; i <= rang; i++) {
        if (newRangs[i]) continue
        const cout = coutRangPourVoie('voiePrestige', i)
        if (cout > disponibles) break
        newRangs[i] = true
        disponibles -= cout
      }
      if (!newRangs[rang]) return
    }
    onChange({ voiePrestige: { ...v, rangs: newRangs } })
  }

  const toggleSangMeleRang = (rang: number) => {
    if (calibrate) return
    const v = character.voieSangMele as VoiePersonnage
    const estCoché = v.rangs[rang]
    const newRangs = [...v.rangs]
    if (estCoché) {
      for (let i = rang; i < newRangs.length; i++) newRangs[i] = false
    } else {
      let { disponibles } = calcPointsCapacite(character)
      for (let i = 0; i <= rang; i++) {
        if (newRangs[i]) continue
        const cout = coutRangPourVoie('voieSangMele', i)
        if (cout > disponibles) break
        newRangs[i] = true
        disponibles -= cout
      }
      if (!newRangs[rang]) return
    }
    onChange({ voieSangMele: { ...v, rangs: newRangs } })
  }

  const startSangMeleRangDrag = (id: string, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    const startX = e.clientX, startY = e.clientY
    const { top: startTop, left: startLeft } = sangMeleRangPos[id]
    const onMove = (ev: MouseEvent) => {
      const rect = containerRef.current!.getBoundingClientRect()
      setSangMeleRangPos(prev => ({ ...prev, [id]: {
        top:  +(startTop  + (ev.clientY - startY) / rect.height * 100).toFixed(1),
        left: +(startLeft + (ev.clientX - startX) / rect.width  * 100).toFixed(1),
      }}))
    }
    const onUp = (ev: MouseEvent) => {
      const rect = containerRef.current!.getBoundingClientRect()
      const newTop  = +(startTop  + (ev.clientY - startY) / rect.height * 100).toFixed(1)
      const newLeft = +(startLeft + (ev.clientX - startX) / rect.width  * 100).toFixed(1)
      setSangMeleRangPos(prev => ({ ...prev, [id]: { top: newTop, left: newLeft } }))
      cb(id, newTop, newLeft)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const startPrestigeRangDrag = (id: string, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    const startX = e.clientX, startY = e.clientY
    const { top: startTop, left: startLeft } = prestigeRangPos[id]
    const onMove = (ev: MouseEvent) => {
      const rect = containerRef.current!.getBoundingClientRect()
      setPrestigeRangPos(prev => ({ ...prev, [id]: {
        top:  +(startTop  + (ev.clientY - startY) / rect.height * 100).toFixed(1),
        left: +(startLeft + (ev.clientX - startX) / rect.width  * 100).toFixed(1),
      }}))
    }
    const onUp = (ev: MouseEvent) => {
      const rect = containerRef.current!.getBoundingClientRect()
      const newTop  = +(startTop  + (ev.clientY - startY) / rect.height * 100).toFixed(1)
      const newLeft = +(startLeft + (ev.clientX - startX) / rect.width  * 100).toFixed(1)
      setPrestigeRangPos(prev => ({ ...prev, [id]: { top: newTop, left: newLeft } }))
      cb(id, newTop, newLeft)
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
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <img src={sheetImage || `${import.meta.env.BASE_URL}feuille-verso.png`} alt="Feuille de personnage verso"
        className="sheet-bg" style={{ width: '100%', display: 'block' }} draggable={false} />

      {/* === TOGGLE IMAGE / DESCRIPTION === */}
      <div className="no-print" style={{
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
            background: 'rgba(201,168,76,0.92)', color: '#1a1510',
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
      </div>

      {/* === PORTRAIT (mode image, ou calibrage) === */}
      {((character.versoMode ?? 'description') === 'image' || calibrate) && (
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
            top={30.6} left={26.5} width={44} height={37}
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
      {((character.versoMode ?? 'description') === 'description' || calibrate) && (
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
      <DraggableTextarea
        {...fp("Inventaire", 40.9, 73.3, 44.2, 15.5)}
        value={character.inventaire}
        onChange={v => onChange({ inventaire: v })}
        calibrate={calibrate} label="Inventaire"
        containerRef={containerRef} onMoved={cb}
        lineHeightPct={1.315} paddingTopPct={0.15}
      />

      {/* === FORMATIONS MARTIALES === */}
      {FORMATION_CHECKBOXES.map(({ nom }) => {
        const { top, left } = cbPos[nom]
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
              {character.formationsMartiales.includes(nom) && (
                <svg viewBox="0 0 14 11" style={{ width: '100%', height: '100%' }} overflow="visible">
                  <line x1="2" y1="1" x2="12" y2="10" stroke="#1a1510" strokeWidth="1.5" strokeLinecap="round" />
                  <line x1="12" y1="1" x2="2" y2="10" stroke="#1a1510" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              )}
            </div>
            {/* Tag draggable en mode calibrage */}
            {calibrate && (
              <div
                onMouseDown={e => startCheckboxDrag(nom, e)}
                style={{
                  position: 'absolute',
                  top: `${top}%`, left: `${left}%`,
                  transform: 'translate(-50%, -50%)',
                  cursor: 'grab',
                  background: 'rgba(201,168,76,0.92)',
                  color: '#1a1510',
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
                }}
              >
                {nom.replace('Armes de ', '').replace('Armures ', '')}
              </div>
            )}
          </div>
        )
      })}

      {/* === VOIE PRESTIGE : RANGS (COCHES) === */}
      {VOIE_PRESTIGE_RANG_CHECKBOXES.map(({ id, rang }) => {
        const { top, left } = prestigeRangPos[id]
        const acquis = character.voiePrestige.rangs[rang]
        return (
          <div key={id}>
            <div
              data-voie="true"
              onClick={() => character.niveau >= 8 && togglePrestigeRang(rang)}
              title={character.niveau < 8 ? t('fiche.deblocableNiveau', { n: 8 }) : undefined}
              style={{
                position: 'absolute', top: `${top}%`, left: `${left}%`,
                width: '1.6%', height: '1.1%', transform: 'translate(-50%, -50%)',
                cursor: calibrate ? 'default' : character.niveau >= 8 ? 'pointer' : 'not-allowed',
                opacity: character.niveau >= 8 ? 1 : 0.35,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {acquis && (
                <svg viewBox="0 0 14 11" style={{ width: '100%', height: '100%' }} overflow="visible">
                  <line x1="2" y1="1" x2="12" y2="10" stroke="#1a1510" strokeWidth="1.5" strokeLinecap="round" />
                  <line x1="12" y1="1" x2="2" y2="10" stroke="#1a1510" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              )}
            </div>
            {calibrate && (
              <div onMouseDown={e => startPrestigeRangDrag(id, e)} style={{
                position: 'absolute', top: `${top}%`, left: `${left}%`,
                transform: 'translate(-50%, -50%)', cursor: 'grab',
                background: 'rgba(201,168,76,0.92)', color: '#1a1510',
                fontSize: 7, fontFamily: 'monospace', fontWeight: 700,
                padding: '1px 4px', borderRadius: 2, userSelect: 'none',
                zIndex: 40, whiteSpace: 'nowrap', lineHeight: '13px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
              }}>
                Prestige R{rang + 1}
              </div>
            )}
          </div>
        )
      })}

      {/* === VOIE PRESTIGE : NOMS DES CAPACITÉS === */}
      {VOIE_PRESTIGE_RANG_NOM_POS.map(({ id, top, left, width }, idx) => {
        const nomVoie = character.voiePrestige.nom
        const nomCap = data[nomVoie]?.[idx]?.nom || ''
        const desc = data[nomVoie]?.[idx]?.desc ?? ''
        const label = `prestige-cap-${idx}`
        const efp = fp(label, top, left, width, 2.0)
        return (
          <React.Fragment key={`${id}-cap`}>
            <DraggableField
              label={label}
              {...efp}
              value={nomCap}
              onChange={() => {}}
              calibrate={calibrate}
              containerRef={containerRef}
              onMoved={cb}
            />
            {desc && (
              <div
                style={{
                  position: 'absolute',
                  top: `${efp.top}%`, left: `${efp.left}%`,
                  width: `${efp.width}%`, height: '2%',
                  transform: 'translate(-50%, -50%)',
                  zIndex: 20,
                  cursor: 'help',
                }}
                onMouseEnter={e => {
                  const rect = containerRef.current!.getBoundingClientRect()
                  setTooltip({ nom: nomCap, desc, rang: idx + 1, x: (e.clientX - rect.left) / rect.width * 100, y: (e.clientY - rect.top) / rect.height * 100 })
                }}
                onMouseMove={e => {
                  const rect = containerRef.current!.getBoundingClientRect()
                  setTooltip(prev => prev ? { ...prev, x: (e.clientX - rect.left) / rect.width * 100, y: (e.clientY - rect.top) / rect.height * 100 } : null)
                }}
                onMouseLeave={() => setTooltip(null)}
              />
            )}
          </React.Fragment>
        )
      })}

      {/* === VOIE SANG-MÊLÉ : RANGS (COCHES) === */}
      {VOIE_SANG_MELE_RANG_CHECKBOXES.map(({ id, rang }) => {
        const { top, left } = sangMeleRangPos[id]
        const acquis = character.voieSangMele.rangs[rang]
        return (
          <div key={id}>
            <div
              data-voie="true"
              onClick={() => toggleSangMeleRang(rang)}
              style={{
                position: 'absolute', top: `${top}%`, left: `${left}%`,
                width: '1.6%', height: '1.1%', transform: 'translate(-50%, -50%)',
                cursor: calibrate ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {acquis && (
                <svg viewBox="0 0 14 11" style={{ width: '100%', height: '100%' }} overflow="visible">
                  <line x1="2" y1="1" x2="12" y2="10" stroke="#1a1510" strokeWidth="1.5" strokeLinecap="round" />
                  <line x1="12" y1="1" x2="2" y2="10" stroke="#1a1510" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              )}
            </div>
            {calibrate && (
              <div onMouseDown={e => startSangMeleRangDrag(id, e)} style={{
                position: 'absolute', top: `${top}%`, left: `${left}%`,
                transform: 'translate(-50%, -50%)', cursor: 'grab',
                background: 'rgba(201,168,76,0.92)', color: '#1a1510',
                fontSize: 7, fontFamily: 'monospace', fontWeight: 700,
                padding: '1px 4px', borderRadius: 2, userSelect: 'none',
                zIndex: 40, whiteSpace: 'nowrap', lineHeight: '13px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
              }}>
                Sang-mêlé R{rang + 1}
              </div>
            )}
          </div>
        )
      })}

      {/* === VOIE SANG-MÊLÉ : NOMS DES CAPACITÉS === */}
      {VOIE_SANG_MELE_RANG_NOM_POS.map(({ id, top, left, width }, idx) => {
        const nomVoie = character.voieSangMele.nom
        const nomCap = data[nomVoie]?.[idx]?.nom || ''
        const desc = data[nomVoie]?.[idx]?.desc ?? ''
        const label = `sangmele-cap-${idx}`
        const efp = fp(label, top, left, width, 2.0)
        return (
          <React.Fragment key={`${id}-cap`}>
            <DraggableField
              label={label}
              {...efp}
              value={nomCap}
              onChange={() => {}}
              calibrate={calibrate}
              containerRef={containerRef}
              onMoved={cb}
            />
            {desc && (
              <div
                style={{
                  position: 'absolute',
                  top: `${efp.top}%`, left: `${efp.left}%`,
                  width: `${efp.width}%`, height: '2%',
                  transform: 'translate(-50%, -50%)',
                  zIndex: 20,
                  cursor: 'help',
                }}
                onMouseEnter={e => {
                  const rect = containerRef.current!.getBoundingClientRect()
                  setTooltip({ nom: nomCap, desc, rang: idx + 1, x: (e.clientX - rect.left) / rect.width * 100, y: (e.clientY - rect.top) / rect.height * 100 })
                }}
                onMouseMove={e => {
                  const rect = containerRef.current!.getBoundingClientRect()
                  setTooltip(prev => prev ? { ...prev, x: (e.clientX - rect.left) / rect.width * 100, y: (e.clientY - rect.top) / rect.height * 100 } : null)
                }}
                onMouseLeave={() => setTooltip(null)}
              />
            )}
          </React.Fragment>
        )
      })}

      {/* === TOOLTIP DESCRIPTION === */}
      {tooltip && (
        <div style={{
          position: 'absolute',
          ...(tooltip.x > 65
            ? { right: `${100 - tooltip.x}%` }
            : { left: `${tooltip.x + 1}%` }),
          ...(tooltip.y > 72
            ? { bottom: `${100 - tooltip.y + 1.5}%` }
            : { top: `${tooltip.y + 1.5}%` }),
          maxWidth: '55%',
          background: 'rgba(20,15,8,0.97)',
          color: '#e8dfc0',
          border: '1px solid #c9a84c',
          borderRadius: 4,
          padding: '8px 10px',
          fontSize: '1em',
          lineHeight: 1.5,
          zIndex: 100,
          pointerEvents: 'none',
          boxShadow: '0 2px 8px rgba(0,0,0,0.7)',
        }}>
          <div style={{ fontWeight: 700, color: '#c9a84c', marginBottom: 4, fontSize: '1.05em' }}>{tooltip.nom}</div>
          <div>{parseDesc(tooltip.desc, character, data, tooltip.rang)}</div>
        </div>
      )}

      {/* === TALENT MAGIQUE === */}
      <DraggableField
        {...fp("Talent magique", 23.8, 79.6, 29.6, 2.0)}
        value={character.talentMagique.nom} onChange={v => onChange({ talentMagique: { ...character.talentMagique, nom: v } })}
        calibrate={calibrate} label="Talent magique"
        containerRef={containerRef} onMoved={cb}
        active={activeStep === 5}
      />
      {!calibrate && character.talentMagique.desc && (
        <div
          style={{
            position: 'absolute', top: '23.8%', left: '79.6%',
            width: '29.6%', height: '2%',
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
      <DraggableTextarea
        {...fp("Talent magique desc", 27.3, 73.2, 44.4, 5.4)}
        value={character.talentMagique.desc}
        onChange={v => onChange({ talentMagique: { ...character.talentMagique, desc: v } })}
        calibrate={calibrate} label="Talent magique desc"
        containerRef={containerRef} onMoved={cb}
        lineHeightPct={1.315} paddingTopPct={0.15}
        autoShrink
      />

      {/* === VOIE DE PRESTIGE === */}
      <DraggableField
        {...fp("Voie prestige", 70, 25.9, 16.4, 2.0)}
        value={character.voiePrestige.nom}
        onChange={v => onChange({ voiePrestige: { ...character.voiePrestige, nom: v } })}
        calibrate={calibrate} label="Voie prestige"
        containerRef={containerRef} onMoved={cb}
      />

      {/* === VOIE DE SANG-MÊLÉ === */}
      <DraggableField
        {...fp("Voie sang-mêlé", 78.8, 57.6, 14, 2.0)}
        value={character.voieSangMele.nom}
        onChange={v => onChange({ voieSangMele: { ...character.voieSangMele, nom: v } })}
        calibrate={calibrate} label="Voie sang-mêlé"
        containerRef={containerRef} onMoved={cb}
      />

      {/* === TRÉSORERIE === */}
      <DraggableField
        {...fp("Trésorerie", 72.2, 49.9, 29.2, 2.0)}
        value={character.tresorerie} onChange={v => onChange({ tresorerie: v })}
        calibrate={calibrate} label="Trésorerie"
        containerRef={containerRef} onMoved={cb}
        active={activeStep === 6}
      />

      {/* === NOM DU JOUEUR === */}
      <DraggableField
        {...fp("Nom du joueur", 9.1, 37, 22.8, 2.0)}
        value={character.nomJoueur} onChange={() => {}}
        calibrate={calibrate} label="Nom du joueur"
        containerRef={containerRef} onMoved={cb}
      />

      {/* === CAPACITÉS SUPPLÉMENTAIRES === */}
      <DraggableTextarea
        {...fp("Capacités supp.", 82, 80.7, 29.1, 21.1)}
        value={character.capacitesSupplementaires}
        onChange={v => onChange({ capacitesSupplementaires: v })}
        calibrate={calibrate} label="Capacités supp."
        containerRef={containerRef} onMoved={cb}
      />

      {/* === COMPAGNONS (champs calibrables) === */}
      {(() => {
        const fmtMod = (n: number) => n >= 0 ? `+${n}` : `${n}`

        type Pos = { top: number; left: number; width: number }
        type SlotPositions = {
          nom: Pos
          for: Pos; dex: Pos; con: Pos; int: Pos; sag: Pos; cha: Pos
          init: Pos; def: Pos; pv: Pos
          atk1nom: Pos; atk1bonus: Pos; atk1dm: Pos
        }

        const POS: SlotPositions[] = [
          // C1 — calibré
          {
            nom:      { top: 51.5, left: 33.4, width: 28   },
            for:      { top: 54.2, left: 15.2, width: 5.9 },
            dex:      { top: 56.9, left: 15.2, width: 5.8 },
            con:      { top: 59.8, left: 15.2, width: 6.1 },
            int:      { top: 54.1, left: 30,   width: 5.7 },
            sag:      { top: 57,   left: 30,   width: 5.8 },
            cha:      { top: 59.8, left: 30,   width: 5.8 },
            init:     { top: 54.2, left: 45,   width: 6.5 },
            def:      { top: 57,   left: 45,   width: 6.5 },
            pv:       { top: 59.7, left: 45,   width: 6.7 },
            atk1nom:  { top: 62.5, left: 16.5, width: 17.1},
            atk1bonus:{ top: 62.6, left: 35.2, width: 7.1 },
            atk1dm:   { top: 62.7, left: 45,   width: 6.6 },
          },
          // C2 — calibré
          {
            nom:      { top: 51.4, left: 79.8, width: 28.3 },
            for:      { top: 54.1, left: 61.7, width: 5.9  },
            dex:      { top: 56.9, left: 61.8, width: 5.8  },
            con:      { top: 59.8, left: 61.9, width: 6.1  },
            int:      { top: 54.1, left: 76.6, width: 5.7  },
            sag:      { top: 56.9, left: 76.5, width: 5.8  },
            cha:      { top: 59.7, left: 76.4, width: 5.8  },
            init:     { top: 54.2, left: 91.6, width: 6.5  },
            def:      { top: 57,   left: 91.5, width: 6.5  },
            pv:       { top: 59.8, left: 91.6, width: 6.7  },
            atk1nom:  { top: 62.6, left: 63,   width: 17.1 },
            atk1bonus:{ top: 62.6, left: 81.8, width: 7.1  },
            atk1dm:   { top: 62.7, left: 91.4, width: 6.6  },
          },
        ]

        const VOIE_KEYS_ALL = ['voiePeuple', 'voieCulturelle', 'voie1', 'voie2', 'voie3', 'voiePrestige', 'voieSangMele'] as const
        const findRangCompagnon = (nomCompagnon: string): number => {
          for (const key of VOIE_KEYS_ALL) {
            const voie = character[key]
            if (!voie?.nom) continue
            const rangsData = data[voie.nom]
            if (!rangsData) continue
            const granted = rangsData.some(r => r?.grants?.some(g =>
              (g.type === 'COMPAGNON' && g.nom === nomCompagnon) ||
              (g.type === 'COMPAGNON_CHOIX' && g.noms?.includes(nomCompagnon))
            ))
            if (granted) return voie.rangs.filter(Boolean).length
          }
          return 1
        }

        return ([0, 1] as const).map(slot => {
          const nomActif = character.compagnonsActifs?.[slot] ?? null
          const entry = nomActif ? compagnonsCatalogue.find(c => c.nom === nomActif) : null
          const rang = nomActif ? findRangCompagnon(nomActif) : 1
          const att = { contact: character.attaqueContact, distance: character.attaqueDistance, magique: character.attaqueMagique }
          const c = entry ? resolveCompagnon(entry, character.niveau, rang, att) : null
          const Q = POS[slot]
          const pre = `C${slot + 1} `
          const ov = character.compagnonsOverrides?.[slot] ?? {}
          const setOv = (field: keyof CompagnonOverride, val: string) => {
            const cur = character.compagnonsOverrides ?? [null, null]
            const next: [CompagnonOverride | null, CompagnonOverride | null] = [cur[0], cur[1]]
            next[slot] = { ...(cur[slot] ?? {}), [field]: val }
            onChange({ compagnonsOverrides: next })
          }
          // Champ éditable par le joueur (stocké dans compagnonsOverrides)
          const f = (pos: Pos, field: keyof CompagnonOverride, computed: string, label: string, align?: 'left'|'center'|'right') => (
            <DraggableField key={label} {...fp(pre + label, pos.top, pos.left, pos.width, 2)}
              value={ov[field] ?? computed} onChange={v => setOv(field, v)} readOnly={locked} align={align} label={pre + label}
              calibrate={calibrate} containerRef={containerRef} onMoved={cb} />
          )
          // Champ catalogue — éditable uniquement si déverrouillé
          const fRO = (pos: Pos, field: keyof CompagnonOverride, value: string, label: string, align?: 'left'|'center'|'right') => (
            <DraggableField key={label} {...fp(pre + label, pos.top, pos.left, pos.width, 2)}
              value={locked ? value : (ov[field] ?? value)} onChange={v => !locked && setOv(field, v)} readOnly={locked} align={align} label={pre + label}
              calibrate={calibrate} containerRef={containerRef} onMoved={cb} />
          )
          return (
            <React.Fragment key={slot}>
              {fRO(Q.nom,      'nom', c ? compagnonName(c.nom) : '',  'nom')}
              {f(Q.for,       'for', c ? fmtMod(c.for)  : '',   t('stats.FOR'),  'center')}
              {f(Q.dex,       'dex', c ? fmtMod(c.dex)  : '',   t('stats.DEX'),  'center')}
              {f(Q.con,       'con', c ? fmtMod(c.con)  : '',   t('stats.CON'),  'center')}
              {f(Q.int,       'int', c ? fmtMod(c.int)  : '',   t('stats.INT'),  'center')}
              {f(Q.sag,       'sag', c ? fmtMod(c.sag)  : '',   t('stats.SAG'),  'center')}
              {f(Q.cha,       'cha', c ? fmtMod(c.cha)  : '',   t('stats.CHA'),  'center')}
              {f(Q.init,      'init', c?.initValue ?? '',        'Init', 'center')}
              {c && !ov.init && c.initDisplay !== c.initValue && (
                <div style={{ position: 'absolute', top: `${Q.init.top}%`, left: `${Q.init.left}%`, width: `${Q.init.width}%`, height: '2%', zIndex: 50, cursor: 'help' }}
                  onMouseEnter={e => { const r = containerRef.current!.getBoundingClientRect(); setTooltip({ nom: t('recto.initiative'), desc: c.initDisplay, x: (e.clientX - r.left) / r.width * 100, y: (e.clientY - r.top) / r.height * 100 }) }}
                  onMouseMove={e => { const r = containerRef.current!.getBoundingClientRect(); setTooltip(p => p ? { ...p, x: (e.clientX - r.left) / r.width * 100, y: (e.clientY - r.top) / r.height * 100 } : null) }}
                  onMouseLeave={() => setTooltip(null)}
                />
              )}
              {f(Q.def,       'def', c ? String(c.def)  : '',   'DEF',  'center')}
              {f(Q.pv,        'pv',  c?.pvValue ?? '',           'PV',   'center')}
              {c && !ov.pv && c.pvDisplay !== c.pvValue && (
                <div style={{ position: 'absolute', top: `${Q.pv.top}%`, left: `${Q.pv.left}%`, width: `${Q.pv.width}%`, height: '2%', zIndex: 50, cursor: 'help' }}
                  onMouseEnter={e => { const r = containerRef.current!.getBoundingClientRect(); setTooltip({ nom: t('recto.pv'), desc: c.pvDisplay, x: (e.clientX - r.left) / r.width * 100, y: (e.clientY - r.top) / r.height * 100 }) }}
                  onMouseMove={e => { const r = containerRef.current!.getBoundingClientRect(); setTooltip(p => p ? { ...p, x: (e.clientX - r.left) / r.width * 100, y: (e.clientY - r.top) / r.height * 100 } : null) }}
                  onMouseLeave={() => setTooltip(null)}
                />
              )}
              {fRO(Q.atk1nom,   'atk1nom',   c?.attaque1?.nom ?? '',    'Atk1 nom')}
              {fRO(Q.atk1bonus, 'atk1bonus', c?.atk1Display ?? '',      'Atk1 bonus', 'center')}
              {fRO(Q.atk1dm,    'atk1dm',    c?.atk1dmDisplay ?? c?.attaque1?.dm ?? '', 'Atk1 DM', 'center')}
            </React.Fragment>
          )
        })
      })()}
    </div>
  )
}
