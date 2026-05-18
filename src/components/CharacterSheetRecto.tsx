import React, { useRef, useState } from 'react'
import type { Character, VoiePersonnage } from '../types/character'
import { getMod } from '../types/character'
import DraggableField from './DraggableField'
import CAPACITES from '../data/capacites.json'
import DESCRIPTIONS from '../data/descriptions.json'

interface Props {
  character: Character
  onChange: (patch: Partial<Character>) => void
  activeStep: number
  calibrate?: boolean
  onFieldMoved?: (label: string, top: number, left: number, width?: number, height?: number) => void
}

const PR_CHECKBOXES = [
  { nom: 'PR 1', top: 58.2, left: 21.1 },
  { nom: 'PR 2', top: 58.2, left: 23.4 },
  { nom: 'PR 3', top: 58.2, left: 25.7 },
  { nom: 'PR 4', top: 58.2, left: 28.0 },
  { nom: 'PR 5', top: 58.2, left: 30.3 },
  { nom: 'PR 6', top: 58.2, left: 32.6 },
]

type VoieKey = 'voiePeuple' | 'voieCulturelle' | 'voie1' | 'voie2' | 'voie3'

const VOIE_RANG_NOM_POS: { id: string; top: number; left: number; width: number }[] = [
  // Voie peuple
  { id: 'voiePeuple-0', top: 47.7, left: 52.8, width: 23.9 },
  { id: 'voiePeuple-1', top: 52.0, left: 52.9, width: 23.6 },
  { id: 'voiePeuple-2', top: 56.4, left: 52.9, width: 23.7 },
  { id: 'voiePeuple-3', top: 60.7, left: 52.9, width: 23.8 },
  { id: 'voiePeuple-4', top: 65.1, left: 53.0, width: 23.5 },
  // Voie culturelle
  { id: 'voieCult-0', top: 47.6, left: 83.8, width: 23.7 },
  { id: 'voieCult-1', top: 52.0, left: 83.7, width: 23.9 },
  { id: 'voieCult-2', top: 56.4, left: 83.7, width: 23.7 },
  { id: 'voieCult-3', top: 60.7, left: 83.8, width: 23.6 },
  { id: 'voieCult-4', top: 65.1, left: 83.8, width: 23.9 },
  // Voie 1
  { id: 'voie1-0', top: 72.2, left: 22.0, width: 24.0 },
  { id: 'voie1-1', top: 76.5, left: 22.1, width: 23.6 },
  { id: 'voie1-2', top: 80.9, left: 22.1, width: 23.6 },
  { id: 'voie1-3', top: 85.3, left: 22.1, width: 23.7 },
  { id: 'voie1-4', top: 89.7, left: 22.1, width: 23.8 },
  // Voie 2
  { id: 'voie2-0', top: 72.3, left: 52.7, width: 23.5 },
  { id: 'voie2-1', top: 76.5, left: 52.8, width: 23.5 },
  { id: 'voie2-2', top: 80.9, left: 52.8, width: 23.6 },
  { id: 'voie2-3', top: 85.3, left: 52.9, width: 23.9 },
  { id: 'voie2-4', top: 89.7, left: 52.9, width: 23.9 },
  // Voie 3
  { id: 'voie3-0', top: 72.2, left: 83.7, width: 24.1 },
  { id: 'voie3-1', top: 76.5, left: 83.9, width: 23.5 },
  { id: 'voie3-2', top: 81.0, left: 83.7, width: 23.8 },
  { id: 'voie3-3', top: 85.3, left: 83.8, width: 23.8 },
  { id: 'voie3-4', top: 89.7, left: 83.8, width: 23.8 },
]

const VOIE_RANG_CHECKBOXES: { id: string; voie: VoieKey; rang: number; top: number; left: number }[] = [
  // Voie peuple — colonne gauche, rangs en colonne
  { id: 'voiePeuple-0', voie: 'voiePeuple',    rang: 0, top: 47.6, left: 36.4 },
  { id: 'voiePeuple-1', voie: 'voiePeuple',    rang: 1, top: 52.0, left: 36.6 },
  { id: 'voiePeuple-2', voie: 'voiePeuple',    rang: 2, top: 56.3, left: 36.6 },
  { id: 'voiePeuple-3', voie: 'voiePeuple',    rang: 3, top: 60.7, left: 36.6 },
  { id: 'voiePeuple-4', voie: 'voiePeuple',    rang: 4, top: 65.0, left: 36.6 },
  // Voie culturelle — colonne droite, rangs en colonne
  { id: 'voieCult-0',   voie: 'voieCulturelle', rang: 0, top: 47.6, left: 67.5 },
  { id: 'voieCult-1',   voie: 'voieCulturelle', rang: 1, top: 52.0, left: 67.5 },
  { id: 'voieCult-2',   voie: 'voieCulturelle', rang: 2, top: 56.4, left: 67.4 },
  { id: 'voieCult-3',   voie: 'voieCulturelle', rang: 3, top: 60.7, left: 67.4 },
  { id: 'voieCult-4',   voie: 'voieCulturelle', rang: 4, top: 65.1, left: 67.5 },
  // Voie 1
  { id: 'voie1-0', voie: 'voie1', rang: 0, top: 72.2, left: 5.7 },
  { id: 'voie1-1', voie: 'voie1', rang: 1, top: 76.5, left: 5.8 },
  { id: 'voie1-2', voie: 'voie1', rang: 2, top: 80.9, left: 5.7 },
  { id: 'voie1-3', voie: 'voie1', rang: 3, top: 85.3, left: 5.7 },
  { id: 'voie1-4', voie: 'voie1', rang: 4, top: 89.6, left: 5.7 },
  // Voie 2
  { id: 'voie2-0', voie: 'voie2', rang: 0, top: 72.2, left: 36.5 },
  { id: 'voie2-1', voie: 'voie2', rang: 1, top: 76.5, left: 36.5 },
  { id: 'voie2-2', voie: 'voie2', rang: 2, top: 80.9, left: 36.5 },
  { id: 'voie2-3', voie: 'voie2', rang: 3, top: 85.3, left: 36.5 },
  { id: 'voie2-4', voie: 'voie2', rang: 4, top: 89.6, left: 36.6 },
  // Voie 3
  { id: 'voie3-0', voie: 'voie3', rang: 0, top: 72.2, left: 67.4 },
  { id: 'voie3-1', voie: 'voie3', rang: 1, top: 76.5, left: 67.4 },
  { id: 'voie3-2', voie: 'voie3', rang: 2, top: 80.9, left: 67.4 },
  { id: 'voie3-3', voie: 'voie3', rang: 3, top: 85.3, left: 67.5 },
  { id: 'voie3-4', voie: 'voie3', rang: 4, top: 89.7, left: 67.4 },
]

const CARAC_ROWS = [
  { key: 'FOR', top: 19.7, wVal: 6.4 },
  { key: 'DEX', top: 22.5, wVal: 6.5 },
  { key: 'CON', top: 25.3, wVal: 6.4 },
  { key: 'INT', top: 28.2, wVal: 6.4 },
  { key: 'SAG', top: 31.0, wVal: 6.3 },
  { key: 'CHA', top: 33.7, wVal: 6.3 },
] as const

export default function CharacterSheetRecto({ character, onChange, activeStep, calibrate = false, onFieldMoved }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cb = onFieldMoved ?? (() => {})

  const [cbPos, setCbPos] = useState<Record<string, { top: number; left: number }>>(
    Object.fromEntries(PR_CHECKBOXES.map(f => [f.nom, { top: f.top, left: f.left }]))
  )
  const [voieRangPos, setVoieRangPos] = useState<Record<string, { top: number; left: number }>>(
    Object.fromEntries(VOIE_RANG_CHECKBOXES.map(c => [c.id, { top: c.top, left: c.left }]))
  )
  const [tooltip, setTooltip] = useState<{ nom: string; desc: string; x: number; y: number } | null>(null)

  const toggleVoieRang = (voie: VoieKey, rang: number) => {
    if (calibrate) return
    const v = character[voie] as VoiePersonnage
    const newRangs = [...v.rangs]
    newRangs[rang] = !newRangs[rang]
    onChange({ [voie]: { ...v, rangs: newRangs } })
  }

  const startVoieRangDrag = (id: string, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    const startX = e.clientX, startY = e.clientY
    const { top: startTop, left: startLeft } = voieRangPos[id]
    const onMove = (ev: MouseEvent) => {
      const rect = containerRef.current!.getBoundingClientRect()
      setVoieRangPos(prev => ({ ...prev, [id]: {
        top:  +(startTop  + (ev.clientY - startY) / rect.height * 100).toFixed(1),
        left: +(startLeft + (ev.clientX - startX) / rect.width  * 100).toFixed(1),
      }}))
    }
    const onUp = (ev: MouseEvent) => {
      const rect = containerRef.current!.getBoundingClientRect()
      const newTop  = +(startTop  + (ev.clientY - startY) / rect.height * 100).toFixed(1)
      const newLeft = +(startLeft + (ev.clientX - startX) / rect.width  * 100).toFixed(1)
      setVoieRangPos(prev => ({ ...prev, [id]: { top: newTop, left: newLeft } }))
      cb(id, newTop, newLeft)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const togglePR = (_nom: string, idx: number) => {
    if (calibrate) return
    const next = [...character.prUtilises]
    next[idx] = !next[idx]
    onChange({ prUtilises: next })
  }

  const startPRDrag = (nom: string, e: React.MouseEvent) => {
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

  const setCarac = (key: typeof CARAC_ROWS[number]['key'], val: string) => {
    const valeur = parseInt(val) || 0
    onChange({ caracteristiques: { ...character.caracteristiques, [key]: { valeur, mod: getMod(valeur) } } })
  }

  const setVoieNom = (field: 'voiePeuple' | 'voieCulturelle' | 'voie1' | 'voie2' | 'voie3', nom: string) =>
    onChange({ [field]: { ...character[field], nom } })

  // Appelé comme fonction (pas <F/>) pour éviter le remontage des DraggableField à chaque render
  type FProps = Omit<React.ComponentProps<typeof DraggableField>, 'calibrate' | 'containerRef' | 'onMoved'>
  const f = (p: FProps) => <DraggableField key={p.label} {...p} calibrate={calibrate} containerRef={containerRef} onMoved={cb} />

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <img src="/feuille-recto.png" alt="Feuille de personnage recto"
        style={{ width: '100%', display: 'block' }} draggable={false} />

      {/* === IDENTITÉ === */}
      {f({ label: "Nom joueur",  top: 10.1, left: 52.8, width: 18.3, height: 2.0, value: character.nomJoueur,     onChange: v => onChange({ nomJoueur: v }),                        active: activeStep === 0 })}
      {f({ label: "Profil",      top: 10.1, left: 76.3, width: 16.5, height: 2.0, value: character.profil,        onChange: v => onChange({ profil: v }),                           active: activeStep === 3 })}
      {f({ label: "Genre",       top: 10.1, left: 91.4, width: 4.7,  height: 2.0, value: character.genre,         onChange: v => onChange({ genre: v }),                            active: activeStep === 0 })}
      {f({ label: "Famille",     top: 12.2, left: 76.3, width: 16.6, height: 2.0, value: character.famille ?? '', onChange: v => onChange({ famille: v as any }),                   active: activeStep === 3 })}
      {f({ label: "Âge",         top: 12.2, left: 91.3, width: 4.7,  height: 2.0, value: character.age,           onChange: v => onChange({ age: v }),                              active: activeStep === 0 })}
      {f({ label: "Nom perso",   top: 14.4, left: 51.9, width: 20.7, height: 2.0, value: character.nomPersonnage,  onChange: v => onChange({ nomPersonnage: v }),                   active: activeStep === 0 })}
      {f({ label: "Peuple",      top: 14.4, left: 76.3, width: 16.6, height: 2.0, value: character.peuple,        onChange: v => onChange({ peuple: v }),                           active: activeStep === 1 })}
      {f({ label: "Taille",      top: 14.3, left: 91.4, width: 4.8,  height: 2.0, value: character.taille,        onChange: v => onChange({ taille: v }),                           active: activeStep === 0 })}
      {f({ label: "Niveau",      top: 16.5, left: 41.8, width: 4.9,  height: 2.0, value: character.niveau,        onChange: v => onChange({ niveau: parseInt(v) || 1 }), type: "number", align: "center" })}
      {f({ label: "Culture",     top: 16.5, left: 76.3, width: 16.6, height: 2.0, value: character.culture,       onChange: v => onChange({ culture: v }),                          active: activeStep === 1 })}
      {f({ label: "Poids",       top: 16.5, left: 91.4, width: 4.8,  height: 2.0, value: character.poids,         onChange: v => onChange({ poids: v }),                            active: activeStep === 0 })}

      {/* === CARACTÉRISTIQUES === */}
      {CARAC_ROWS.map(({ key, top, wVal }) => (
        <React.Fragment key={key}>
          {f({ label: `${key} val`, top, left: 16.3, width: wVal, height: 2.0, value: character.caracteristiques[key].valeur, onChange: v => setCarac(key, v), type: "number", align: "center", active: activeStep === 2 })}
          {f({ label: `${key} mod`, top, left: 23, width: 5.1, height: 2.0, value: character.caracteristiques[key].mod >= 0 ? `+${character.caracteristiques[key].mod}` : `${character.caracteristiques[key].mod}`, onChange: () => {}, align: "center" })}
        </React.Fragment>
      ))}

      {/* === COMBAT === */}
      {f({ label: "Initiative",        top: 22.2, left: 50,   width: 5.1, height: 2.0, value: character.caracteristiques.DEX.valeur, onChange: () => {}, align: "center" })}

      {/* Défense : Mod.DEX */}
      {f({ label: "Déf mod DEX", top: 38.1, left: 56.1, width: 5.0, height: 2.0, value: character.caracteristiques.DEX.mod >= 0 ? `+${character.caracteristiques.DEX.mod}` : `${character.caracteristiques.DEX.mod}`, onChange: () => {}, align: "center" })}

      {/* Atk contact : Mod.FOR | Niveau | Bonus famille | Total */}
      {f({ label: "Atk contact mod",    top: 28.1, left: 50,   width: 5.1, height: 2.0, value: character.caracteristiques.FOR.mod >= 0 ? `+${character.caracteristiques.FOR.mod}` : `${character.caracteristiques.FOR.mod}`, onChange: () => {}, align: "center" })}
      {f({ label: "Atk contact niv",    top: 28.1, left: 56.2, width: 5.0, height: 2.0, value: character.niveau, onChange: () => {}, align: "center" })}
      {f({ label: "Bonus fam. contact", top: 28.1, left: 62.2, width: 5.0, height: 2.0, value: (() => { const b = character.famille === 'combattants' ? 2 : character.famille === 'aventuriers' ? 1 : 0; return b >= 0 ? `+${b}` : `${b}` })(), onChange: () => {}, align: "center" })}
      {f({ label: "Atk contact total",  top: 28.1, left: 68.3, width: 5.0, height: 2.0, value: character.attaqueContact  >= 0 ? `+${character.attaqueContact}`  : `${character.attaqueContact}`,  onChange: () => {}, align: "center" })}

      {/* Atk distance : Mod.DEX | Niveau | Bonus famille | Total */}
      {f({ label: "Atk dist mod",       top: 30.9, left: 50,   width: 5.1, height: 2.0, value: character.caracteristiques.DEX.mod >= 0 ? `+${character.caracteristiques.DEX.mod}` : `${character.caracteristiques.DEX.mod}`, onChange: () => {}, align: "center" })}
      {f({ label: "Atk dist niv",       top: 30.9, left: 56.2, width: 5.0, height: 2.0, value: character.niveau, onChange: () => {}, align: "center" })}
      {f({ label: "Bonus fam. distance", top: 30.9, left: 62.2, width: 5.0, height: 2.0, value: (() => { const b = character.famille === 'combattants' ? 2 : character.famille === 'aventuriers' ? 1 : 0; return b >= 0 ? `+${b}` : `${b}` })(), onChange: () => {}, align: "center" })}
      {f({ label: "Atk dist total",     top: 30.9, left: 68.3, width: 5.0, height: 2.0, value: character.attaqueDistance >= 0 ? `+${character.attaqueDistance}` : `${character.attaqueDistance}`, onChange: () => {}, align: "center" })}

      {/* Atk magique : Mod.INT | Niveau | Bonus famille | Total */}
      {f({ label: "Atk mag mod",        top: 33.7, left: 50,   width: 5.1, height: 2.0, value: character.caracteristiques.INT.mod >= 0 ? `+${character.caracteristiques.INT.mod}` : `${character.caracteristiques.INT.mod}`, onChange: () => {}, align: "center" })}
      {f({ label: "Atk mag niv",        top: 33.7, left: 56.2, width: 5.0, height: 2.0, value: character.niveau, onChange: () => {}, align: "center" })}
      {f({ label: "Bonus fam. magique",  top: 33.7, left: 62.2, width: 5.0, height: 2.0, value: (() => { const b = character.famille === 'mystiques' ? 2 : 0; return b >= 0 ? `+${b}` : `${b}` })(), onChange: () => {}, align: "center" })}
      {f({ label: "Atk mag total",      top: 33.7, left: 68.3, width: 5.0, height: 2.0, value: character.attaqueMagique  >= 0 ? `+${character.attaqueMagique}`  : `${character.attaqueMagique}`,  onChange: () => {}, align: "center" })}

      {/* === PV / PM / PC === */}
      {f({ label: "PV total",  top: 38.1, left: 28.8, width: 5.1,  height: 2.0, value: character.pvTotal,    onChange: v => onChange({ pvTotal:    parseInt(v) || 0 }), type: "number", align: "center", active: activeStep === 4 })}
{f({ label: "PM",        top: 46.1, left: 28.9, width: 5.0, height: 2.0, value: character.pm,         onChange: v => onChange({ pm:         parseInt(v) || 0 }), type: "number", align: "center", active: activeStep === 4 })}
      {f({ label: "PC",        top: 50.6, left: 28.8, width: 5.2, height: 2.0, value: character.pc,         onChange: v => onChange({ pc:         parseInt(v) || 0 }), type: "number", align: "center", active: activeStep === 4 })}
      {f({ label: "Dé de vie", top: 55.2, left: 25.8, width: 11.1, height: 2.0, value: character.deVie,      onChange: v => onChange({ deVie: v }), align: "center", active: activeStep === 4 })}

      {/* === POINTS DE RÉCUPÉRATION === */}
      {PR_CHECKBOXES.map(({ nom }, idx) => {
        const { top, left } = cbPos[nom]
        return (
          <div key={nom}>
            <div
              onClick={() => togglePR(nom, idx)}
              style={{
                position: 'absolute',
                top: `${top}%`, left: `${left}%`,
                width: '1.6%', height: '1.1%',
                transform: 'translate(-50%, -50%)',
                cursor: calibrate ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {character.prUtilises[idx] && (
                <svg viewBox="0 0 14 11" style={{ width: '100%', height: '100%' }} overflow="visible">
                  <polyline points="1,5.5 5,9.5 13,1" fill="none" stroke="#c9a84c"
                    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            {calibrate && (
              <div
                onMouseDown={e => startPRDrag(nom, e)}
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
                {nom}
              </div>
            )}
          </div>
        )
      })}

      {/* Trait de peuple */}
      {f({ label: "Trait peuple", top: 61.1, left: 25.7, width: 16.5, height: 2.0, value: character.traitPeuple, onChange: v => onChange({ traitPeuple: v }), active: activeStep === 1 })}

      {/* === NOMS DES CAPACITÉS + ZONES HOVER === */}
      {VOIE_RANG_CHECKBOXES.map(({ id, voie, rang }) => {
        const nomVoie = (character[voie] as VoiePersonnage).nom
        const nomCap = (CAPACITES as Record<string, string[]>)[nomVoie]?.[rang] ?? ''
        const desc = (DESCRIPTIONS as Record<string, { nom: string; desc: string }[]>)[nomVoie]?.[rang]?.desc ?? ''
        const pos = VOIE_RANG_NOM_POS.find(p => p.id === id)!
        return (
          <React.Fragment key={`${id}-cap`}>
            {f({ label: `${id} nom`, top: pos.top, left: pos.left, width: pos.width, height: 2.0, value: nomCap, onChange: () => {}, active: activeStep === 3 })}
            {desc && (
              <div
                style={{
                  position: 'absolute',
                  top: `${pos.top}%`, left: `${pos.left}%`,
                  width: `${pos.width}%`, height: '2%',
                  transform: 'translate(-50%, -50%)',
                  zIndex: 20,
                  cursor: 'help',
                }}
                onMouseEnter={e => {
                  const rect = containerRef.current!.getBoundingClientRect()
                  setTooltip({ nom: nomCap, desc, x: (e.clientX - rect.left) / rect.width * 100, y: (e.clientY - rect.top) / rect.height * 100 })
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
          left: `${Math.min(tooltip.x, 70)}%`,
          top: `${tooltip.y + 1.5}%`,
          maxWidth: '28%',
          background: 'rgba(20,15,8,0.97)',
          color: '#e8dfc0',
          border: '1px solid #c9a84c',
          borderRadius: 4,
          padding: '6px 8px',
          fontSize: '0.62em',
          lineHeight: 1.4,
          zIndex: 100,
          pointerEvents: 'none',
          boxShadow: '0 2px 8px rgba(0,0,0,0.7)',
        }}>
          <div style={{ fontWeight: 700, color: '#c9a84c', marginBottom: 3, fontSize: '0.95em' }}>{tooltip.nom}</div>
          <div>{tooltip.desc}</div>
        </div>
      )}

      {/* === RANGS DES VOIES === */}
      {VOIE_RANG_CHECKBOXES.map(({ id, voie, rang }) => {
        const { top, left } = voieRangPos[id]
        const acquis = (character[voie] as VoiePersonnage).rangs[rang]
        return (
          <div key={id}>
            <div onClick={() => toggleVoieRang(voie, rang)} style={{
              position: 'absolute', top: `${top}%`, left: `${left}%`,
              width: '1.6%', height: '1.1%', transform: 'translate(-50%, -50%)',
              cursor: calibrate ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {acquis && (
                <svg viewBox="0 0 14 11" style={{ width: '100%', height: '100%' }} overflow="visible">
                  <polyline points="1,5.5 5,9.5 13,1" fill="none" stroke="#c9a84c"
                    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            {calibrate && (
              <div onMouseDown={e => startVoieRangDrag(id, e)} style={{
                position: 'absolute', top: `${top}%`, left: `${left}%`,
                transform: 'translate(-50%, -50%)', cursor: 'grab',
                background: 'rgba(201,168,76,0.92)', color: '#1a1510',
                fontSize: 7, fontFamily: 'monospace', fontWeight: 700,
                padding: '1px 4px', borderRadius: 2, userSelect: 'none',
                zIndex: 40, whiteSpace: 'nowrap', lineHeight: '13px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
              }}>
                {voie.replace('voie', 'V').replace('Culturelle', 'cult').replace('Peuple', 'peuple')} R{rang + 1}
              </div>
            )}
          </div>
        )
      })}

      {/* === VOIES === */}
      {f({ label: "Voie peuple", top: 45.7, left: 56.2, width: 17.3, height: 2.0, value: character.voiePeuple.nom,     onChange: v => setVoieNom('voiePeuple', v),     active: activeStep === 1 })}
      {f({ label: "Voie cult.",  top: 45.7, left: 87.7, width: 16.3, height: 2.0, value: character.voieCulturelle.nom, onChange: v => setVoieNom('voieCulturelle', v), active: activeStep === 1 })}
      {f({ label: "Voie 1", top: 70.2, left: 22.2, width: 23.3, height: 2.0, value: character.voie1.nom, onChange: v => setVoieNom('voie1', v), active: activeStep === 3 })}
      {f({ label: "Voie 2", top: 70.3, left: 53.1, width: 23.6, height: 2.0, value: character.voie2.nom, onChange: v => setVoieNom('voie2', v), active: activeStep === 3 })}
      {f({ label: "Voie 3", top: 70.3, left: 84.1, width: 23.5, height: 2.0, value: character.voie3.nom, onChange: v => setVoieNom('voie3', v), active: activeStep === 3 })}
    </div>
  )
}
