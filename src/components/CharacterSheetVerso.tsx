import React, { useRef, useState } from 'react'
import type { Character, VoiePersonnage } from '../types/character'
import { parseDesc } from '../utils/parseDesc'
import DraggableField from './DraggableField'
import DraggableTextarea from './DraggableTextarea'
import DraggableImageField from './DraggableImageField'
import { useGameData } from '../context/GameDataContext'

interface Props {
  character: Character
  onChange: (patch: Partial<Character>) => void
  activeStep: number
  calibrate?: boolean
  onFieldMoved?: (label: string, top: number, left: number, width?: number, height?: number) => void
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

const FORMATION_CHECKBOXES: { nom: string; top: number; left: number }[] = [
  { nom: 'Armures légères',         top: 50.0, left: 54.2 },
  { nom: 'Armures lourdes',         top: 51.3, left: 54.2 },
  { nom: 'Armes de jet',            top: 52.7, left: 54.2 },
  { nom: 'Armes de trait',          top: 54.0, left: 54.2 },
  { nom: 'Armes de tir',            top: 55.3, left: 54.2 },
  { nom: 'Armes de guerre',         top: 51.3, left: 66.6 },
  { nom: 'Armes de guerre lourdes', top: 52.6, left: 66.6 },
  { nom: 'Armes de duel',           top: 54.0, left: 66.6 },
  { nom: "Armes d'hast",            top: 55.3, left: 66.7 },
]


export default function CharacterSheetVerso({ character, onChange, activeStep, calibrate = false, onFieldMoved }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cb = onFieldMoved ?? (() => {})
  const { data } = useGameData()
  const [cbPos, setCbPos] = useState<Record<string, { top: number; left: number }>>(
    Object.fromEntries(FORMATION_CHECKBOXES.map(f => [f.nom, { top: f.top, left: f.left }]))
  )
  const [prestigeRangPos, setPrestigeRangPos] = useState<Record<string, { top: number; left: number }>>(
    Object.fromEntries(VOIE_PRESTIGE_RANG_CHECKBOXES.map(c => [c.id, { top: c.top, left: c.left }]))
  )
  const [tooltip, setTooltip] = useState<{ nom: string; desc: string; rang?: number; x: number; y: number } | null>(null)

  const togglePrestigeRang = (rang: number) => {
    if (calibrate) return
    const v = character.voiePrestige as VoiePersonnage
    const newRangs = [...v.rangs]
    newRangs[rang] = !newRangs[rang]
    onChange({ voiePrestige: { ...v, rangs: newRangs } })
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
      <img src={`${import.meta.env.BASE_URL}feuille-verso.png`} alt="Feuille de personnage verso"
        className="sheet-bg" style={{ width: '100%', display: 'block' }} draggable={false} />

      {/* === PORTRAIT === */}
      <DraggableImageField
        top={30.4} left={26.5} width={42.2} height={37.2}
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

      {/* === DESCRIPTION === */}
      <DraggableTextarea
        top={17.7} left={73.2} width={44.2} height={14.7}
        value={character.description}
        onChange={v => onChange({ description: v })}
        calibrate={calibrate} label="Description"
        containerRef={containerRef} onMoved={cb}
        lineHeightPct={1.315} paddingTopPct={0.16}
      />

      {/* === INVENTAIRE === */}
      <DraggableTextarea
        top={36.7} left={73.2} width={44.4} height={17.5}
        value={character.inventaire}
        onChange={v => onChange({ inventaire: v })}
        calibrate={calibrate} label="Inventaire"
        containerRef={containerRef} onMoved={cb}
        lineHeightPct={1.315} paddingTopPct={0.15}
      />

      {/* === FORMATIONS MARTIALES : COMPTEUR === */}
      <div style={{
        position: 'absolute', top: '48.3%', left: '54%',
        transform: 'translateY(-100%)',
        fontSize: '0.72em', fontWeight: 700, letterSpacing: '0.05em',
        color: countFormations >= maxFormations ? '#c97a4c' : 'rgba(201,168,76,0.75)',
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
      }}>
        {countFormations} / {maxFormations}
      </div>

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
              title={character.niveau < 8 ? 'Déblocable au niveau 8' : undefined}
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
        return (
          <React.Fragment key={`${id}-cap`}>
            <DraggableField
              label={`prestige-cap-${idx}`}
              top={top} left={left} width={width} height={2.0}
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
                  top: `${top}%`, left: `${left}%`,
                  width: `${width}%`, height: '2%',
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
          left: `${Math.min(tooltip.x, 42)}%`,
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
        top={61.8} left={79} width={29.6} height={2.0}
        value={character.talentMagique.nom} onChange={v => onChange({ talentMagique: { ...character.talentMagique, nom: v } })}
        calibrate={calibrate} label="Talent magique"
        containerRef={containerRef} onMoved={cb}
        active={activeStep === 5}
      />
      {!calibrate && character.talentMagique.desc && (
        <div
          style={{
            position: 'absolute', top: '61.8%', left: '79%',
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
        top={65.5} left={72.9} width={44.4} height={5.4}
        value={character.talentMagique.desc}
        onChange={v => onChange({ talentMagique: { ...character.talentMagique, desc: v } })}
        calibrate={calibrate} label="Talent magique desc"
        containerRef={containerRef} onMoved={cb}
        lineHeightPct={1.315} paddingTopPct={0.15}
        autoShrink
      />

      {/* === VOIE DE PRESTIGE === */}
      <DraggableField
        top={70} left={25.9} width={16.4} height={2.0}
        value={character.voiePrestige.nom}
        onChange={v => onChange({ voiePrestige: { ...character.voiePrestige, nom: v } })}
        calibrate={calibrate} label="Voie prestige"
        containerRef={containerRef} onMoved={cb}
      />

      {/* === VOIE DE SANG-MÊLÉ === */}
      <DraggableField
        top={78.8} left={57.6} width={14} height={2.0}
        value={character.voieSangMele.nom}
        onChange={v => onChange({ voieSangMele: { ...character.voieSangMele, nom: v } })}
        calibrate={calibrate} label="Voie sang-mêlé"
        containerRef={containerRef} onMoved={cb}
      />

      {/* === TRÉSORERIE === */}
      <DraggableField
        top={72.2} left={49.9} width={29.2} height={2.0}
        value={character.tresorerie} onChange={v => onChange({ tresorerie: v })}
        calibrate={calibrate} label="Trésorerie"
        containerRef={containerRef} onMoved={cb}
        active={activeStep === 6}
      />

      {/* === NOM DU JOUEUR === */}
      <DraggableField
        top={9.1} left={37} width={22.8} height={2.0}
        value={character.nomJoueur} onChange={() => {}}
        calibrate={calibrate} label="Nom du joueur"
        containerRef={containerRef} onMoved={cb}
      />

      {/* === CAPACITÉS SUPPLÉMENTAIRES === */}
      <DraggableTextarea
        top={82} left={80.7} width={29.1} height={21.1}
        value={character.capacitesSupplementaires}
        onChange={v => onChange({ capacitesSupplementaires: v })}
        calibrate={calibrate} label="Capacités supp."
        containerRef={containerRef} onMoved={cb}
      />
    </div>
  )
}
