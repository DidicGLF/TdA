import React, { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Character, VoiePersonnage } from '../types/character'
import { getMod } from '../types/character'
import DraggableField from './DraggableField'
import DraggableTextarea from './DraggableTextarea'
import type { ArmesData, ArmuresData, FieldPositions } from '../context/GameDataContext'
import { parseDesc } from '../utils/parseDesc'
import { findCulture, findTrait } from '../data/peuples'
import { useGameData } from '../context/GameDataContext'
import { computeEffects, computeDiceEffects, sumStat } from '../utils/computeEffects'
import { calcPointsCapacite, coutRangPourVoie } from '../utils/levelUp'

const normalizeFormation = (f: string) => f.replace(/\s*\(.*?\)/g, '').trim().toLowerCase()
const stripExposants = (s: string) => s.replace(/[¹²³⁴⁵⁶⁷*]\s*/g, '').trim()
const normalizeArmeName = (s: string) => s.replace(/[¹²³⁴⁵⁶⁷*]\s*/g, '').trim().toLowerCase()

const findArmeCategorie = (armes: ArmesData, nomArme: string): string | null => {
  const key = stripExposants(nomArme).toLowerCase()
  for (const groupe of armes.groupes) {
    for (const cat of groupe.categories) {
      if (cat.entrees.some(e => stripExposants(e.nom).toLowerCase() === key)) return cat.categorie
    }
  }
  return null
}

const findArmeEntry = (armes: ArmesData, nomArme: string) => {
  const key = stripExposants(nomArme).toLowerCase()
  for (const groupe of armes.groupes) {
    for (const cat of groupe.categories) {
      const entry = cat.entrees.find(e => stripExposants(e.nom).toLowerCase() === key)
      if (entry) return entry
    }
  }
  return null
}

const findArmureCategorie = (armures: ArmuresData, nomArmure: string): string | null => {
  for (const cat of armures.categories) {
    if (cat.entrees.some(e => e.nom === nomArmure)) return cat.categorie
  }
  return null
}

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

export default function CharacterSheetRecto({ character, onChange, activeStep, calibrate = false, locked = true, onFieldMoved, fieldPositions, sheetImage }: Props) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const cb = onFieldMoved ?? (() => {})
  const { peuples, data, armes, armures } = useGameData()

  const [cbPos, setCbPos] = useState<Record<string, { top: number; left: number }>>(
    Object.fromEntries(PR_CHECKBOXES.map(f => [f.nom, { top: f.top, left: f.left }]))
  )
  const [voieRangPos, setVoieRangPos] = useState<Record<string, { top: number; left: number }>>(
    Object.fromEntries(VOIE_RANG_CHECKBOXES.map(c => [c.id, { top: c.top, left: c.left }]))
  )
  type TooltipLine = { label: string; value: string | number; neg?: boolean }
  type TooltipData =
    | { nom: string; desc: string; rang?: number; lines?: never; total?: never; x: number; y: number }
    | { nom: string; lines: TooltipLine[]; total: string | number; rang?: never; desc?: never; x: number; y: number }
  const [tooltip, setTooltip] = useState<TooltipData | null>(null)
  const [hoveredRangInfo, setHoveredRangInfo] = useState<{ voie: VoieKey; rang: number; x: number; y: number } | null>(null)
  const toggleVoieRang = (voie: VoieKey, rang: number) => {
    if (calibrate) return
    const v = character[voie] as VoiePersonnage
    if (!v.nom) return
    const estCoché = v.rangs[rang]
    if (!estCoché) {
      if (rang > 0 && !v.rangs[rang - 1]) return
      const { disponibles } = calcPointsCapacite(character)
      if (disponibles < coutRangPourVoie(voie, rang)) return
    }
    const newRangs = [...v.rangs]
    newRangs[rang] = !newRangs[rang]

    const patch: Partial<Character> = { [voie]: { ...v, rangs: newRangs } }

    if (estCoché && character.pvHistorique?.length) {
      const oldConBonus = sumStat(effects['CON'] ?? [])
      const oldConMod = getMod(character.caracteristiques.CON.valeur + oldConBonus)
      const newEffects = computeEffects({ ...character, [voie]: { ...v, rangs: newRangs } } as Character, data)
      const newConMod = getMod(character.caracteristiques.CON.valeur + sumStat(newEffects['CON'] ?? []))
      if (newConMod !== oldConMod) {
        patch.pvHistorique = character.pvHistorique.map(entry =>
          entry.conMod === oldConMod
            ? { ...entry, conMod: newConMod, total: entry.jet + newConMod }
            : entry
        )
      }
    }

    onChange(patch)
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



// Appelé comme fonction (pas <F/>) pour éviter le remontage des DraggableField à chaque render
  type FProps = Omit<React.ComponentProps<typeof DraggableField>, 'calibrate' | 'containerRef' | 'onMoved'> & {
    formula?: { lines: TooltipLine[]; total: string | number }
    tooltipDesc?: string
    tooltipTitle?: string
  }
  const showFormula = (nom: string, formula: { lines: TooltipLine[]; total: string | number }, e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    setTooltip({ nom, lines: formula.lines, total: formula.total,
      x: (e.clientX - rect.left) / rect.width * 100,
      y: (e.clientY - rect.top)  / rect.height * 100 })
  }
  const moveTooltip = (e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    setTooltip(prev => prev ? { ...prev,
      x: (e.clientX - rect.left) / rect.width * 100,
      y: (e.clientY - rect.top)  / rect.height * 100 } : null)
  }
  const f = ({ formula, tooltipDesc, title, tooltipTitle, ...p }: FProps) => {
    const fp = fieldPositions?.[p.label]
    const ep = fp ? { ...p, top: fp.top, left: fp.left, ...(fp.width !== undefined ? { width: fp.width } : {}), ...(fp.height !== undefined ? { height: fp.height } : {}) } : p
    const ttitle = tooltipTitle ?? ep.label
    return (
    <React.Fragment key={ep.label}>
      <DraggableField {...ep} title={formula || tooltipDesc ? undefined : title} calibrate={calibrate} containerRef={containerRef} onMoved={cb} />
      {formula && !calibrate && (
        <div style={{ position: 'absolute', top: `${ep.top}%`, left: `${ep.left}%`,
          width: `${ep.width}%`, height: `${ep.height ?? 2.2}%`,
          transform: 'translate(-50%, -50%)', zIndex: 20, cursor: 'help' }}
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
        <div style={{ position: 'absolute', top: `${ep.top}%`, left: `${ep.left}%`,
          width: `${ep.width}%`, height: `${ep.height ?? 2.2}%`,
          transform: 'translate(-50%, -50%)', zIndex: 20, cursor: 'help' }}
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
  )}

  const effects = computeEffects(character, data)
  const diceEffects = computeDiceEffects(character, data)
  const { disponibles: ptsDisponibles } = calcPointsCapacite(character)

  const rangTooltip: TooltipData | null = hoveredRangInfo ? (() => {
    const { voie, rang, x, y } = hoveredRangInfo
    const voieData = character[voie] as VoiePersonnage
    const acquis = voieData.rangs[rang]
    const cout = coutRangPourVoie(voie, rang)
    const sequentialBlocked = !acquis && rang > 0 && !voieData.rangs[rang - 1]
    const pointsBlocked = !acquis && !sequentialBlocked && ptsDisponibles < cout
    if (sequentialBlocked)
      return { nom: t('recto.ordreRequis'), desc: t('recto.ordreRequisDesc', { rang }), x, y }
    if (pointsBlocked)
      return { nom: t('recto.pointsInsuffisants'), desc: t('recto.pointsInsuffisantsDesc', { count: cout - ptsDisponibles }), x, y }
    if (ptsDisponibles > 0)
      return { nom: t('recto.pointsCapacite'), desc: t('recto.pointsDisponiblesDesc', { count: ptsDisponibles }), x, y }
    if (ptsDisponibles < 0)
      return { nom: t('recto.pointsCapacite'), desc: t('recto.pointsEnTropDesc', { count: Math.abs(ptsDisponibles) }), x, y }
    return null
  })() : null

  const activeTooltip = rangTooltip ?? tooltip

  const SUP: Record<number, string> = { 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵' }
  const groupContribs = (contribs: { nom: string; rang: number; triggerRang: number; value: number; voie: string }[]) => {
    const map = new Map<string, { nom: string; rang: number; maxTrigger: number; total: number }>()
    for (const c of contribs) {
      const key = `${c.voie}||${c.nom}||${c.rang}`
      const entry = map.get(key)
      if (entry) { entry.total += c.value; entry.maxTrigger = Math.max(entry.maxTrigger, c.triggerRang) }
      else map.set(key, { nom: c.nom, rang: c.rang, maxTrigger: c.triggerRang, total: c.value })
    }
    return [...map.values()].map(g => ({
      label: g.maxTrigger === g.rang ? `${g.nom} ${t('recto.rangLabel', { n: g.rang })}` : `${g.nom} ${t('recto.rangLabel', { n: g.rang })}${SUP[g.maxTrigger] ?? String(g.maxTrigger)}`,
      value: `+${g.total}`,
    }))
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <img src={sheetImage || `${import.meta.env.BASE_URL}feuille-recto.png`} alt="Feuille de personnage recto"
        className="sheet-bg" style={{ width: '100%', display: 'block' }} draggable={false} />

      {/* === IDENTITÉ === */}
      {f({ label: "Nom joueur",  top: 10.1, left: 52.8, width: 18.3, height: 2.0, value: character.nomJoueur,     onChange: v => onChange({ nomJoueur: v }),                        active: activeStep === 0 })}
      {f({ label: "Profil",      top: 10.1, left: 76.3, width: 16.5, height: 2.0, value: character.profil,        onChange: locked ? () => {} : v => onChange({ profil: v }),      active: activeStep === 3, readOnly: locked })}
      {f({ label: "Genre",       top: 10.1, left: 92.3, width: 6.7,  height: 2.0, value: character.genre,         onChange: v => onChange({ genre: v }),                            active: activeStep === 0 })}
      {f({ label: "Famille",     top: 12.2, left: 76.3, width: 16.6, height: 2.0, value: character.famille ? character.famille[0].toUpperCase() + character.famille.slice(1) : '', onChange: locked ? () => {} : v => onChange({ famille: v as any }), active: activeStep === 3, readOnly: locked })}
      {f({ label: "Âge",         top: 12.2, left: 92.1, width: 6.4,  height: 2.0, value: character.age,           onChange: v => onChange({ age: v }),                              active: activeStep === 0 })}
      {f({ label: "Nom perso",   top: 14.4, left: 51.9, width: 20.7, height: 2.0, value: character.nomPersonnage,  onChange: v => onChange({ nomPersonnage: v }),                   active: activeStep === 0 })}
      {f({ label: "Peuple",      top: 14.4, left: 76.3, width: 16.6, height: 2.0, value: character.peuple,        onChange: locked ? () => {} : v => onChange({ peuple: v }),      active: activeStep === 1, readOnly: locked })}
      {f({ label: "Taille",      top: 14.3, left: 91.7, width: 5.7,  height: 2.0, value: character.taille,        onChange: v => onChange({ taille: v }),                           active: activeStep === 0 })}
      {f({ label: "Niveau",      top: 16.5, left: 41.8, width: 4.9,  height: 2.0, value: character.niveau,        onChange: () => {}, readOnly: locked, align: "center" })}
      {f({ label: "Culture",     top: 16.5, left: 76.3, width: 16.6, height: 2.0, value: character.culture,       onChange: locked ? () => {} : v => onChange({ culture: v }),     active: activeStep === 1, readOnly: locked })}
      {f({ label: "Poids",       top: 16.5, left: 91.6, width: 5.4,  height: 2.0, value: character.poids,         onChange: v => onChange({ poids: v }),                            active: activeStep === 0 })}

      {/* === CARACTÉRISTIQUES === */}
      {(() => {
        const modCaracs = findCulture(peuples, character.peuple, character.culture)?.modCaracs ?? {}
        return CARAC_ROWS.map(({ key, top, wVal }) => {
          const baseVal = character.caracteristiques[key].valeur
          const racialMod = (modCaracs[key as keyof typeof modCaracs] as number) ?? 0
          const voieContribs = effects[key] ?? []
          const voieBonus = sumStat(voieContribs)
          const effectiveVal = baseVal + voieBonus
          const effectiveMod = getMod(effectiveVal)
          const lines: TooltipLine[] = [{ label: t('recto.tlBase'), value: baseVal - racialMod }]
          if (racialMod !== 0) lines.push({ label: character.peuple, value: racialMod > 0 ? `+${racialMod}` : `${racialMod}` })
          if (voieBonus !== 0) lines.push(...groupContribs(voieContribs))
          const caracFormula: { lines: TooltipLine[]; total: string | number } = { lines, total: effectiveVal }
          return (
            <React.Fragment key={key}>
              {f({ label: `${key} val`, tooltipTitle: t(`stats.${key}`), top, left: 16.3, width: wVal, height: 2.0, value: effectiveVal, onChange: () => {}, readOnly: locked, type: "number", align: "center", active: activeStep === 2, formula: caracFormula })}
              {f({ label: `${key} mod`, top, left: 23, width: 5.1, height: 2.0, value: effectiveMod >= 0 ? `+${effectiveMod}` : `${effectiveMod}`, onChange: () => {}, readOnly: locked, align: "center" })}
            </React.Fragment>
          )
        })
      })()}

      {/* === COMBAT === */}
      {(() => {
        const effectiveStat = (key: 'FOR' | 'DEX' | 'CON' | 'INT' | 'SAG' | 'CHA') => {
          const bonus = sumStat(effects[key] ?? [])
          if (bonus === 0) return character.caracteristiques[key]
          const v = character.caracteristiques[key].valeur + bonus
          return { valeur: v, mod: getMod(v) }
        }
        const FOR = effectiveStat('FOR')
        const DEX = effectiveStat('DEX')
        const CON = effectiveStat('CON')
        const INT = effectiveStat('INT')
        const SAG = effectiveStat('SAG')
        const CHA = effectiveStat('CHA')
        const niv = character.niveau
        const fmt = (n: number) => n >= 0 ? `+${n}` : `${n}`
        const famContact = character.famille === 'combattants' ? 2 : character.famille === 'aventuriers' ? 1 : 0
        const famMagique = character.famille === 'mystiques' ? 2 : 0
        const deVieFaces = character.famille === 'combattants' ? 10 : character.famille === 'aventuriers' ? 8 : 6
        const pmBase = niv + SAG.mod
        const pm = character.famille === 'mystiques' ? 2 * pmBase : pmBase
        const isBouclier = (nom: string) => nom.toLowerCase().includes('bouclier')
        const armorDef   = character.armuresEquipees.filter(a => !isBouclier(a.nom) && a.equipe).reduce((sum, a) => sum + a.def, 0)
        const shieldDef  = character.armuresEquipees.filter(a =>  isBouclier(a.nom) && a.equipe).reduce((sum, a) => sum + a.def, 0)
        const enchantEnc        = character.enchantementEncombrement ?? 0
        const totalEncombrement = Math.max(0, armorDef - enchantEnc)
        const malusAtkDist      = Math.floor(armorDef / 2)

        const canUseFormation = (categorie: string) =>
          character.formationsMartiales.some(f => normalizeFormation(f) === categorie.trim().toLowerCase())

        const MALUS_SANS_FORM = 3
        const armureSansForm  = character.armuresEquipees.filter(a => !isBouclier(a.nom) && a.equipe)
          .some(a => { const cat = findArmureCategorie(armures, a.nom); return cat !== null && !canUseFormation(cat) })
        const bouclierSansForm = character.armuresEquipees.filter(a => isBouclier(a.nom) && a.equipe)
          .some(a => { const cat = findArmureCategorie(armures, a.nom); return cat !== null && !canUseFormation(cat) })
        const malusEquip = (armureSansForm ? MALUS_SANS_FORM : 0) + (bouclierSansForm ? MALUS_SANS_FORM : 0)

        const getArmeAttType = (nomArme: string) => {
          const key = stripExposants(nomArme).toLowerCase()
          const arme = character.armes.find(a => stripExposants(a.nom).toLowerCase() === key)
          const mod = arme?.attaque?.toUpperCase()
          return mod === 'DEX' ? 'DEX' : mod === 'INT' ? 'INT' : 'FOR'
        }
        const armeSansForm = (nomArme: string) => {
          const cat = findArmeCategorie(armes, nomArme)
          return cat !== null && !canUseFormation(cat)
        }
        const malusArmesContact = ((character.arme1 && armeSansForm(character.arme1) && getArmeAttType(character.arme1) === 'FOR')
          || (character.arme2 && armeSansForm(character.arme2) && getArmeAttType(character.arme2) === 'FOR')) ? MALUS_SANS_FORM : 0
        const malusArmesDist    = ((character.arme1 && armeSansForm(character.arme1) && getArmeAttType(character.arme1) === 'DEX')
          || (character.arme2 && armeSansForm(character.arme2) && getArmeAttType(character.arme2) === 'DEX')) ? MALUS_SANS_FORM : 0
        const malusArmesMag     = ((character.arme1 && armeSansForm(character.arme1) && getArmeAttType(character.arme1) === 'INT')
          || (character.arme2 && armeSansForm(character.arme2) && getArmeAttType(character.arme2) === 'INT')) ? MALUS_SANS_FORM : 0

        const initContribs = effects['INIT'] ?? []
        const initBonus = sumStat(initContribs)
        const initiativeTotal = DEX.valeur - totalEncombrement - malusEquip + initBonus

        const attContactVoies  = sumStat(effects['ATT_CONTACT'] ?? [])
        const attContactTotal  = character.attaqueContact  - malusEquip - malusArmesContact + attContactVoies
        const attDistTotal     = character.attaqueDistance - malusAtkDist - malusEquip - malusArmesDist
        const attMagTotal      = character.attaqueMagique  - armorDef - malusEquip - malusArmesMag

        const dmArmeBonusContribs = (nomArme: string) => {
          const key = normalizeArmeName(nomArme)
          return (effects['DM_ARME'] ?? []).filter(c =>
            !c.conditionArmes || c.conditionArmes.some(a => normalizeArmeName(a) === key)
          )
        }

        const attTotalPourArme = (nomArme: string): number => {
          const type = getArmeAttType(nomArme)
          if (type === 'DEX') return attDistTotal
          if (type === 'INT') return attMagTotal
          return attContactTotal
        }

        const formulaArme = (nomArme: string) => {
          const type = getArmeAttType(nomArme)
          if (type === 'DEX') return { lines: [
            { label: t('recto.tlAttDistance'), value: fmt(character.attaqueDistance) },
            ...(malusAtkDist      > 0 ? [{ label: t('recto.tlEncombrement2'),   value: `-${malusAtkDist}`,      neg: true }] : []),
            ...(malusEquip        > 0 ? [{ label: t('recto.tlEquipSansForm'),   value: `-${malusEquip}`,        neg: true }] : []),
            ...(malusArmesDist    > 0 ? [{ label: t('recto.tlArmeSansForm'),    value: `-${malusArmesDist}`,    neg: true }] : []),
          ], total: fmt(attDistTotal) }
          if (type === 'INT') return { lines: [
            { label: t('recto.tlAttMagique'), value: fmt(character.attaqueMagique) },
            ...(armorDef          > 0 ? [{ label: t('recto.tlEncombrement'),    value: `-${armorDef}`,          neg: true }] : []),
            ...(malusEquip        > 0 ? [{ label: t('recto.tlEquipSansForm'),   value: `-${malusEquip}`,        neg: true }] : []),
            ...(malusArmesMag     > 0 ? [{ label: t('recto.tlArmeSansForm'),    value: `-${malusArmesMag}`,     neg: true }] : []),
          ], total: fmt(attMagTotal) }
          return { lines: [
            { label: t('recto.tlAttContact'), value: fmt(character.attaqueContact) },
            ...(malusEquip        > 0 ? [{ label: t('recto.tlEquipSansForm'),   value: `-${malusEquip}`,        neg: true }] : []),
            ...(malusArmesContact > 0 ? [{ label: t('recto.tlArmeSansForm'),    value: `-${malusArmesContact}`, neg: true }] : []),
          ], total: fmt(attContactTotal) }
        }

        return <>
          {f({ label: "Initiative", top: 22.2, left: 50, width: 5.1, height: 2.0, value: DEX.valeur, onChange: () => {}, readOnly: locked, align: "center" })}
          {f({ label: "Enc. init.", tooltipTitle: t('recto.encInit'), top: 22.2, left: 62.2, width: 5.0, height: 2.0,
            value: totalEncombrement > 0 ? `-${totalEncombrement}` : '0',
            onChange: () => {}, readOnly: locked, align: "center",
            formula: { lines: [
              { label: t('recto.tlDefArmureEquipee'), value: armorDef },
              { label: t('recto.tlEnchantement'), value: enchantEnc > 0 ? `-${enchantEnc}` : '0', neg: enchantEnc > 0 },
            ], total: totalEncombrement > 0 ? `-${totalEncombrement}` : '0' } })}
          {f({ label: "Initiative totale", tooltipTitle: t('recto.initiativeTotale'), top: 22.2, left: 68.3, width: 5.0, height: 2.0,
            value: String(initiativeTotal),
            onChange: () => {}, readOnly: locked, align: "center",
            formula: { lines: [
              { label: t('stats.valDEX'), value: DEX.valeur },
              { label: t('recto.tlEncombrement'), value: totalEncombrement > 0 ? `-${totalEncombrement}` : '0', neg: totalEncombrement > 0 },
              ...(malusEquip > 0 ? [{ label: t('recto.tlEquipSansForm'), value: `-${malusEquip}`, neg: true }] : []),
              ...groupContribs(initContribs),
            ], total: initiativeTotal } })}

          {/* Défense : Mod.DEX */}
          {f({ label: "Déf mod DEX", top: 38.1, left: 56.1, width: 5.0, height: 2.0, value: fmt(DEX.mod), onChange: () => {}, readOnly: locked, align: "center" })}

          {/* Défense : armure */}
          {f({ label: "Déf armure", top: 38.1, left: 66.2, width: 5.0, height: 2.0, value: armorDef > 0 ? `+${armorDef}` : '0', onChange: () => {}, readOnly: locked, align: "center" })}
          {!calibrate && (
            <div style={{ position: 'absolute', top: '38.1%', left: '66.2%', width: '5%', height: '2%',
              transform: 'translate(-50%, -50%)', zIndex: 20, cursor: 'help' }}
              onMouseEnter={e => {
                const rect = containerRef.current?.getBoundingClientRect()
                if (!rect) return
                const armures = character.armuresEquipees.filter(a => !isBouclier(a.nom))
                const desc = armures.length > 0
                  ? armures.map(a => `${a.nom} : +${a.def}`).join('\n')
                  : t('recto.tlAucuneArmure')
                setTooltip({ nom: t('recto.defArmureTitre'), desc, x: (e.clientX - rect.left) / rect.width * 100, y: (e.clientY - rect.top) / rect.height * 100 })
              }}
              onMouseMove={e => {
                const rect = containerRef.current?.getBoundingClientRect()
                if (!rect) return
                setTooltip(prev => prev ? { ...prev, x: (e.clientX - rect.left) / rect.width * 100, y: (e.clientY - rect.top) / rect.height * 100 } : null)
              }}
              onMouseLeave={() => setTooltip(null)}
            />
          )}

          {/* Défense : bouclier */}
          {f({ label: "Déf bouclier", top: 38.1, left: 78.8, width: 5.0, height: 2.0, value: shieldDef > 0 ? `+${shieldDef}` : '0', onChange: () => {}, readOnly: locked, align: "center" })}
          {!calibrate && (
            <div style={{ position: 'absolute', top: '38.1%', left: '78.8%', width: '5%', height: '2%',
              transform: 'translate(-50%, -50%)', zIndex: 20, cursor: 'help' }}
              onMouseEnter={e => {
                const rect = containerRef.current?.getBoundingClientRect()
                if (!rect) return
                const boucliers = character.armuresEquipees.filter(a => isBouclier(a.nom))
                const desc = boucliers.length > 0
                  ? boucliers.map(a => `${a.nom} : +${a.def}`).join('\n')
                  : t('recto.tlAucuneArmure')
                setTooltip({ nom: t('recto.defBouclierTitre'), desc, x: (e.clientX - rect.left) / rect.width * 100, y: (e.clientY - rect.top) / rect.height * 100 })
              }}
              onMouseMove={e => {
                const rect = containerRef.current?.getBoundingClientRect()
                if (!rect) return
                setTooltip(prev => prev ? { ...prev, x: (e.clientX - rect.left) / rect.width * 100, y: (e.clientY - rect.top) / rect.height * 100 } : null)
              }}
              onMouseLeave={() => setTooltip(null)}
            />
          )}

          {/* Défense : bonus */}
          {f({ label: "Bonus DEF", tooltipTitle: t('recto.bonusDef'), top: 38.1, left: 87.2, width: 5.0, height: 2.0,
            value: (character.bonusDefense ?? 0) >= 0 ? `+${character.bonusDefense ?? 0}` : `${character.bonusDefense ?? 0}`,
            onChange: v => { const n = parseInt(v); onChange({ bonusDefense: isNaN(n) ? 0 : n }) },
            align: "center", tooltipDesc: t('recto.bonusDefDisp') })}

          {/* Défense : total */}
          {(() => {
            const defContribs = effects['DEF'] ?? []
            const defFromVoies = sumStat(defContribs)
            const defBase = 10 + DEX.mod + armorDef + shieldDef + (character.bonusDefense ?? 0)
            const defLines = [
              { label: t('recto.tlBase'), value: 10 },
              { label: t('stats.modDEX'), value: fmt(DEX.mod) },
              { label: t('recto.tlDefArmure'), value: `+${armorDef}` },
              { label: t('recto.tlDefBouclier'), value: `+${shieldDef}` },
              { label: t('recto.tlBonusDef'), value: fmt(character.bonusDefense ?? 0) },
              ...groupContribs(defContribs),
            ]
            return f({ label: "DEF total", tooltipTitle: t('recto.defTotal'), top: 38.1, left: 93.3, width: 5.0, height: 2.0,
              value: String(defBase + defFromVoies),
              onChange: () => {}, readOnly: locked, align: "center",
              formula: { lines: defLines, total: defBase + defFromVoies } })
          })()}

          {/* Encombrement (section défense) */}
          {f({ label: "Encombrement", tooltipTitle: t('recto.tlEncombrement'), top: 41.3, left: 77.3, width: 6.6, height: 2.0,
            value: armorDef > 0 ? `${armorDef}` : '0',
            onChange: () => {}, readOnly: locked, align: "center",
            formula: { lines: character.armuresEquipees.filter(a => !isBouclier(a.nom) && a.equipe).length > 0
              ? character.armuresEquipees.filter(a => !isBouclier(a.nom) && a.equipe).map(a => ({ label: a.nom, value: `+${a.def}` }))
              : [{ label: t('recto.tlAucuneArmure'), value: '0' }],
              total: armorDef } })}
          {f({ label: "Enchantement", tooltipTitle: t('recto.tlEnchantement'), top: 41.2, left: 85.6, width: 8.1, height: 2.0,
            value: String(enchantEnc),
            onChange: v => { const n = parseInt(v); onChange({ enchantementEncombrement: isNaN(n) ? 0 : n }) },
            align: "center", tooltipDesc: t('recto.reductionEnc') })}
          {f({ label: "Total encombrement", tooltipTitle: t('recto.totalEncombrement'), top: 41.1, left: 93.4, width: 5.0, height: 2.0,
            value: String(totalEncombrement),
            onChange: () => {}, readOnly: locked, align: "center",
            formula: { lines: [
              { label: t('recto.tlDefArmure'), value: armorDef },
              { label: t('recto.tlEnchantement'), value: enchantEnc > 0 ? `-${enchantEnc}` : '0', neg: enchantEnc > 0 },
            ], total: totalEncombrement } })}

          {/* ATT contact */}
          {f({ label: "ATT contact mod",    top: 28.1, left: 50,   width: 5.1, height: 2.0, value: fmt(FOR.mod), onChange: () => {}, readOnly: locked, align: "center" })}
          {f({ label: "ATT contact niv",    top: 28.1, left: 56.2, width: 5.0, height: 2.0, value: niv, onChange: () => {}, readOnly: locked, align: "center" })}
          {f({ label: "Bonus fam. contact", top: 28.1, left: 62.2, width: 5.0, height: 2.0, value: fmt(famContact), onChange: () => {}, readOnly: locked, align: "center" })}
          {f({ label: "ATT contact total",  tooltipTitle: t('recto.attContactTotal'), top: 28.1, left: 68.3, width: 5.0, height: 2.0, value: fmt(attContactTotal), onChange: () => {}, readOnly: locked, align: "center",
            formula: { lines: [
              { label: t('recto.tlNiveau'), value: niv },
              { label: t('stats.modFOR'), value: fmt(FOR.mod) },
              { label: t('recto.tlFamille', { fam: character.famille ?? '—' }), value: fmt(famContact) },
              ...(malusEquip        > 0 ? [{ label: t('recto.tlEquipSansForm'), value: `-${malusEquip}`,        neg: true }] : []),
              ...(malusArmesContact > 0 ? [{ label: t('recto.tlArmeSansForm'), value: `-${malusArmesContact}`, neg: true }] : []),
              ...groupContribs(effects['ATT_CONTACT'] ?? []),
            ], total: fmt(attContactTotal) } })}

          {/* ATT distance */}
          {f({ label: "ATT dist mod",        top: 30.9, left: 50,   width: 5.1, height: 2.0, value: fmt(DEX.mod), onChange: () => {}, readOnly: locked, align: "center" })}
          {f({ label: "ATT dist niv",        top: 30.9, left: 56.2, width: 5.0, height: 2.0, value: niv, onChange: () => {}, readOnly: locked, align: "center" })}
          {f({ label: "Bonus fam. distance", top: 30.9, left: 62.2, width: 5.0, height: 2.0, value: fmt(famContact), onChange: () => {}, readOnly: locked, align: "center" })}
          {f({ label: "ATT dist total",      tooltipTitle: t('recto.attDistTotal'), top: 30.9, left: 68.3, width: 5.0, height: 2.0,
            value: fmt(attDistTotal), onChange: () => {}, readOnly: locked, align: "center",
            formula: { lines: [
              { label: t('recto.tlNiveau'), value: niv },
              { label: t('stats.modDEX'), value: fmt(DEX.mod) },
              { label: t('recto.tlFamille', { fam: character.famille ?? '—' }), value: fmt(famContact) },
              { label: t('recto.tlEncombrement2'), value: malusAtkDist > 0 ? `-${malusAtkDist}` : '0', neg: malusAtkDist > 0 },
              ...(malusEquip     > 0 ? [{ label: t('recto.tlEquipSansForm'), value: `-${malusEquip}`,     neg: true }] : []),
              ...(malusArmesDist > 0 ? [{ label: t('recto.tlArmeSansForm'), value: `-${malusArmesDist}`, neg: true }] : []),
            ], total: fmt(attDistTotal) } })}

          {/* ATT magique */}
          {f({ label: "ATT mag mod",        top: 33.7, left: 50,   width: 5.1, height: 2.0, value: fmt(INT.mod), onChange: () => {}, readOnly: locked, align: "center" })}
          {f({ label: "ATT mag niv",        top: 33.7, left: 56.2, width: 5.0, height: 2.0, value: niv, onChange: () => {}, readOnly: locked,  align: "center" })}
          {f({ label: "Bonus fam. magique", top: 33.7, left: 62.2, width: 5.0, height: 2.0, value: fmt(famMagique), onChange: () => {}, readOnly: locked, align: "center" })}
          {f({ label: "ATT mag total",      tooltipTitle: t('recto.attMagTotal'), top: 33.7, left: 68.3, width: 5.0, height: 2.0,
            value: fmt(attMagTotal), onChange: () => {}, readOnly: locked, align: "center",
            formula: { lines: [
              { label: t('recto.tlNiveau'), value: niv },
              { label: t('stats.modINT'), value: fmt(INT.mod) },
              { label: t('recto.tlMystiques'), value: fmt(famMagique) },
              { label: t('recto.tlEncombrement'), value: armorDef > 0 ? `-${armorDef}` : '0', neg: armorDef > 0 },
              ...(malusEquip    > 0 ? [{ label: t('recto.tlEquipSansForm'), value: `-${malusEquip}`,    neg: true }] : []),
              ...(malusArmesMag > 0 ? [{ label: t('recto.tlArmeSansForm'), value: `-${malusArmesMag}`, neg: true }] : []),
            ], total: fmt(attMagTotal) } })}

          {/* Armes */}
          {f({ label: "Arme 1",    top: 22.1, left: 85.7, width: 20.0, height: 2.0, value: character.arme1,   onChange: v => onChange({ arme1: v }) })}
          {(calibrate || character.arme1) && f({ label: "ATT Arme 1", tooltipTitle: t('recto.attArme', { arme: character.arme1 ?? '1' }), top: 24.6, left: 79.1, width: 5.0, height: 2.0, value: character.arme1 ? attTotalPourArme(character.arme1) : '—', onChange: () => {}, readOnly: locked, align: "center",
            formula: character.arme1 ? formulaArme(character.arme1) : undefined })}
          {(calibrate || character.arme1) && (() => {
            const e1 = character.arme1 ? findArmeEntry(armes, character.arme1) : null
            const modVal1 = e1?.mod === 'FOR' ? FOR.mod : e1?.mod === 'DEX' ? DEX.mod : null
            const bonusContribs1 = character.arme1 ? dmArmeBonusContribs(character.arme1) : []
            const bonus1 = sumStat(bonusContribs1)
            const dm1base = e1 ? `${e1.dm}${modVal1 !== null ? ' ' + fmt(modVal1) : ''}` : character.dmArme1
            const dm1 = bonus1 !== 0 ? `${dm1base} ${fmt(bonus1)}` : dm1base
            const formula1 = e1 ? { lines: [
              { label: t('recto.tlDes'), value: e1.dm },
              ...(modVal1 !== null ? [{ label: t(`stats.mod${e1.mod}`), value: fmt(modVal1) }] : []),
              ...groupContribs(bonusContribs1),
            ], total: dm1 } : undefined
            return f({ label: "DM Arme 1", tooltipTitle: t('recto.dmArme', { arme: character.arme1 ?? '1' }), top: 24.7, left: 90.9, width: 9.0, height: 2.0, value: dm1, onChange: () => {}, readOnly: locked, align: "center", formula: formula1 })
          })()}
          {!calibrate && !character.arme1 && diceEffects['DM_MAINS_NUES'] && (() => {
            const { diceStr } = diceEffects['DM_MAINS_NUES']
            const forMod = getMod(FOR.valeur)
            const dm = `${diceStr} ${forMod >= 0 ? '+' : ''}${forMod}`
            return f({ label: "DM mains nues", tooltipTitle: t('recto.dmMainsNues'), top: 24.3, left: 91.4, width: 9.0, height: 2.0,
              value: dm, onChange: () => {}, readOnly: locked, align: "center",
              formula: { lines: [{ label: t('recto.tlDes'), value: diceStr }, { label: t('stats.modFOR'), value: fmt(forMod) }], total: dm } })
          })()}
          {f({ label: "Arme 2",    top: 29.3, left: 85.8, width: 19.9, height: 2.0, value: character.arme2,   onChange: v => onChange({ arme2: v }) })}
          {(calibrate || character.arme2) && f({ label: "ATT Arme 2", tooltipTitle: t('recto.attArme', { arme: character.arme2 ?? '2' }), top: 31.9, left: 79.2, width: 5.0, height: 2.0, value: character.arme2 ? attTotalPourArme(character.arme2) : '—', onChange: () => {}, readOnly: locked, align: "center",
            formula: character.arme2 ? formulaArme(character.arme2) : undefined })}
          {(calibrate || character.arme2) && (() => {
            const e2 = character.arme2 ? findArmeEntry(armes, character.arme2) : null
            const modVal2 = e2?.mod === 'FOR' ? FOR.mod : e2?.mod === 'DEX' ? DEX.mod : null
            const bonusContribs2 = character.arme2 ? dmArmeBonusContribs(character.arme2) : []
            const bonus2 = sumStat(bonusContribs2)
            const dm2base = e2 ? `${e2.dm}${modVal2 !== null ? ' ' + fmt(modVal2) : ''}` : character.dmArme2
            const dm2 = bonus2 !== 0 ? `${dm2base} ${fmt(bonus2)}` : dm2base
            const formula2 = e2 ? { lines: [
              { label: t('recto.tlDes'), value: e2.dm },
              ...(modVal2 !== null ? [{ label: t(`stats.mod${e2.mod}`), value: fmt(modVal2) }] : []),
              ...groupContribs(bonusContribs2),
            ], total: dm2 } : undefined
            return f({ label: "DM Arme 2", tooltipTitle: t('recto.dmArme', { arme: character.arme2 ?? '2' }), top: 31.9, left: 91.1, width: 9.1, height: 2.0, value: dm2, onChange: () => {}, readOnly: locked, align: "center", formula: formula2 })
          })()}

          {/* PV / PM / PC */}
          {(() => {
            const pvContribs = effects['PV'] ?? []
            const pvFromVoies = sumStat(pvContribs)
            const pvLines: { label: string; value: string | number }[] = []
            let pvBase: number
            if (character.niveau1Base) {
              pvLines.push({ label: t('recto.tlNiv1', { dv: character.deVie, mod: fmt(character.caracteristiques.CON.mod) }), value: `+${character.niveau1Base.pvTotal}` })
              pvBase = character.niveau1Base.pvTotal
            } else {
              pvLines.push({ label: t('recto.tlDeVie', { dv: character.deVie }), value: deVieFaces })
              pvLines.push({ label: t('stats.modCON'), value: fmt(CON.mod) })
              pvBase = deVieFaces + CON.mod
            }
            if (character.pvHistorique) {
              for (const e of character.pvHistorique) {
                const detail = e.conMod !== 0 ? ` (${e.jet} ${e.conMod >= 0 ? '+' : '−'} ${Math.abs(e.conMod)} CON)` : ` (${e.jet})`
                pvLines.push({ label: `${t('recto.tlNivDe', { n: e.niveauDe })}${detail}`, value: `+${e.total}` })
                pvBase += e.total
              }
            }
            pvLines.push(...groupContribs(pvContribs))
            const pvTotal = pvBase + pvFromVoies
            return f({ label: "PV total", tooltipTitle: t('recto.pvTotal'), top: 38.1, left: 28.8, width: 5.1, height: 2.0, value: pvTotal, onChange: () => {}, readOnly: locked, align: "center", active: activeStep === 4,
              formula: { lines: pvLines, total: pvTotal } })
          })()}
          {f({ label: "PM", tooltipTitle: t('recto.pm'), top: 46.1, left: 28.9, width: 5.0, height: 2.0, value: character.pm, onChange: v => onChange({ pm: parseInt(v) || 0 }), type: "number", align: "center", active: activeStep === 4,
            formula: character.famille === 'mystiques'
              ? { lines: [{ label: t('recto.tlNiveau'), value: niv }, { label: t('stats.modSAG'), value: fmt(SAG.mod) }, { label: t('recto.tlX2Mystiques'), value: '' }], total: pm }
              : { lines: [{ label: t('recto.tlNiveau'), value: niv }, { label: t('stats.modSAG'), value: fmt(SAG.mod) }], total: pm } })}
          {f({ label: "PC", tooltipTitle: t('recto.pc'), top: 50.6, left: 28.8, width: 5.2, height: 2.0, value: character.pc, onChange: v => onChange({ pc: parseInt(v) || 0 }), type: "number", align: "center", active: activeStep === 4,
            formula: character.famille === 'aventuriers'
              ? { lines: [{ label: t('stats.modCHA'), value: fmt(CHA.mod) }, { label: t('recto.tlBase'), value: '+2' }, { label: t('recto.tlAventuriers'), value: '+2' }], total: CHA.mod + 4 }
              : { lines: [{ label: t('stats.modCHA'), value: fmt(CHA.mod) }, { label: t('recto.tlBase'), value: '+2' }], total: CHA.mod + 2 } })}
          {f({ label: "Dé de vie", tooltipTitle: t('recto.deVie'), top: 55.2, left: 25.8, width: 11.1, height: 2.0, value: character.deVie, onChange: v => onChange({ deVie: v }), align: "center", active: activeStep === 4,
            formula: { lines: [{ label: t('recto.tlCombattants'), value: 'd10' }, { label: t('recto.tlAventuriers'), value: 'd8' }, { label: t('recto.tlMystiques'), value: 'd6' }], total: character.deVie } })}
        </>
      })()}

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
                  <line x1="2" y1="1" x2="12" y2="10" stroke="#1a1510" strokeWidth="1.5" strokeLinecap="round" />
                  <line x1="12" y1="1" x2="2" y2="10" stroke="#1a1510" strokeWidth="1.5" strokeLinecap="round" />
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
      <DraggableTextarea
        top={65.2} left={19.3} width={29.3} height={5.6}
        value={character.traitPeupleDesc}
        onChange={v => onChange({ traitPeupleDesc: v })}
        calibrate={calibrate} label="Trait peuple desc"
        containerRef={containerRef} onMoved={cb}
        lineHeightPct={1.3} paddingTopPct={0.15}
        autoShrink
      />
      {(() => {
        const trait = findTrait(peuples, character.peuple, character.culture)
        if (!trait) return null
        return (
          <div style={{ position: 'absolute', top: '61.1%', left: '25.7%', width: '16.5%', height: '2%',
            transform: 'translate(-50%, -50%)', zIndex: 20, cursor: 'help' }}
            onMouseEnter={e => {
              const rect = containerRef.current?.getBoundingClientRect()
              if (!rect) return
              setTooltip({ nom: trait.nom, desc: trait.desc, x: (e.clientX - rect.left) / rect.width * 100, y: (e.clientY - rect.top) / rect.height * 100 })
            }}
            onMouseMove={e => {
              const rect = containerRef.current?.getBoundingClientRect()
              if (!rect) return
              setTooltip(prev => prev ? { ...prev, x: (e.clientX - rect.left) / rect.width * 100, y: (e.clientY - rect.top) / rect.height * 100 } : null)
            }}
            onMouseLeave={() => setTooltip(null)}
          />
        )
      })()}

      {/* === NOMS DES CAPACITÉS + ZONES HOVER === */}
      {VOIE_RANG_CHECKBOXES.map(({ id, voie, rang }) => {
        const nomVoie = (character[voie] as VoiePersonnage).nom
        const nomCap = data[nomVoie]?.[rang]?.nom || ''
        const desc = data[nomVoie]?.[rang]?.desc ?? ''
        const pos = VOIE_RANG_NOM_POS.find(p => p.id === id)!
        return (
          <React.Fragment key={`${id}-cap`}>
            {f({ label: `${id} nom`, top: pos.top, left: pos.left, width: pos.width, height: 2.0, value: nomCap, onChange: () => {}, readOnly: locked, active: activeStep === 3 })}
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
                  setTooltip({ nom: nomCap, desc, rang: rang + 1, x: (e.clientX - rect.left) / rect.width * 100, y: (e.clientY - rect.top) / rect.height * 100 })
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
      {activeTooltip && (
        <div style={{
          position: 'absolute',
          ...(activeTooltip.x > 65
            ? { right: `${100 - activeTooltip.x}%` }
            : { left: `${activeTooltip.x + 1}%` }),
          ...(activeTooltip.y > 72
            ? { bottom: `${100 - activeTooltip.y + 1.5}%` }
            : { top: `${activeTooltip.y + 1.5}%` }),
          maxWidth: '28%',
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
          <div style={{ fontWeight: 700, color: '#c9a84c', marginBottom: 6, fontSize: '1.05em' }}>{activeTooltip.nom}</div>
          {activeTooltip.desc && <div style={{ lineHeight: 1.5 }}>{parseDesc(activeTooltip.desc, character, data, activeTooltip.rang)}</div>}
          {activeTooltip.lines && (
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <tbody>
                {activeTooltip.lines.map((line, i) => {
                  const isNeg = line.neg
                  const val = String(line.value)
                  const isPos = !isNeg && (val.startsWith('+') || (Number(val) > 0))
                  const color = isNeg ? '#c97a4c' : isPos ? '#7fb87f' : 'rgba(232,223,192,0.75)'
                  return (
                    <tr key={i}>
                      <td style={{ paddingRight: 14, paddingBottom: 3, color: 'rgba(232,223,192,0.6)', fontSize: '0.95em' }}>{line.label}</td>
                      <td style={{ textAlign: 'right', paddingBottom: 3, color, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{val}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '1px solid rgba(201,168,76,0.35)' }}>
                  <td style={{ paddingTop: 4, color: '#c9a84c', fontWeight: 700 }}>{t('fiche.total')}</td>
                  <td style={{ paddingTop: 4, textAlign: 'right', color: '#c9a84c', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{String(activeTooltip.total)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}

      {/* === RANGS DES VOIES === */}
      {VOIE_RANG_CHECKBOXES.map(({ id, voie, rang }) => {
        const { top, left } = voieRangPos[id]
        const voieData = character[voie] as VoiePersonnage
        const acquis = voieData.rangs[rang]
        const disabled = !voieData.nom
        const cout = coutRangPourVoie(voie, rang)
        const sequentialBlocked = !acquis && rang > 0 && !voieData.rangs[rang - 1]
        const pointsBlocked = !acquis && !sequentialBlocked && ptsDisponibles < cout
        const blocked = sequentialBlocked || pointsBlocked
        const showRangTooltip = !calibrate && !disabled && (blocked || ptsDisponibles !== 0)
        return (
          <div key={id}>
            <div
              onClick={() => toggleVoieRang(voie, rang)}
              {...(showRangTooltip && {
                onMouseEnter: e => {
                  const rect = containerRef.current?.getBoundingClientRect()
                  if (!rect) return
                  setHoveredRangInfo({ voie, rang, x: (e.clientX - rect.left) / rect.width * 100, y: (e.clientY - rect.top) / rect.height * 100 })
                },
                onMouseMove: e => {
                  const rect = containerRef.current?.getBoundingClientRect()
                  if (!rect) return
                  setHoveredRangInfo(prev => prev ? { ...prev, x: (e.clientX - rect.left) / rect.width * 100, y: (e.clientY - rect.top) / rect.height * 100 } : null)
                },
                onMouseLeave: () => setHoveredRangInfo(null),
              })}
              style={{
              position: 'absolute', top: `${top}%`, left: `${left}%`,
              width: '1.6%', height: '1.1%', transform: 'translate(-50%, -50%)',
              cursor: calibrate || disabled ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {acquis && (
                <svg viewBox="0 0 14 11" style={{ width: '100%', height: '100%' }} overflow="visible">
                  <line x1="2" y1="1" x2="12" y2="10" stroke="#1a1510" strokeWidth="1.5" strokeLinecap="round" />
                  <line x1="12" y1="1" x2="2" y2="10" stroke="#1a1510" strokeWidth="1.5" strokeLinecap="round" />
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
      {f({ label: "Voie peuple", top: 45.7, left: 56.2, width: 17.3, height: 2.0, value: character.peuple,   onChange: () => {}, readOnly: locked, active: activeStep === 1 })}
      {f({ label: "Voie cult.",  top: 45.7, left: 87.7, width: 16.3, height: 2.0, value: character.culture, onChange: () => {}, readOnly: locked, active: activeStep === 1 })}
      {f({ label: "Voie 1", top: 70.2, left: 22.2, width: 23.3, height: 2.0, value: character.voie1.nom, onChange: locked ? () => {} : v => onChange({ voie1: { ...character.voie1, nom: v } }), readOnly: locked, active: activeStep === 3 })}
      {f({ label: "Voie 2", top: 70.3, left: 53.1, width: 23.6, height: 2.0, value: character.voie2.nom, onChange: locked ? () => {} : v => onChange({ voie2: { ...character.voie2, nom: v } }), readOnly: locked, active: activeStep === 3 })}
      {f({ label: "Voie 3", top: 70.3, left: 84.1, width: 23.5, height: 2.0, value: character.voie3.nom, onChange: locked ? () => {} : v => onChange({ voie3: { ...character.voie3, nom: v } }), readOnly: locked, active: activeStep === 3 })}

    </div>
  )
}
