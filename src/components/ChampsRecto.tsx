import React, { useState, useContext } from 'react'
import CroixCase from './CroixCase'
import { useTranslation } from 'react-i18next'
import type { Character, Famille } from '../types/character'
import { getMod } from '../types/character'
import { useVoieName, usePeupleName, useProfilName, useTranslatedDescriptions, useTraitRacialName, useTraitRacialDesc } from '../hooks/useContentTranslation'
import cristauxData from '../data/cristaux.json'
import DraggableTextarea from './DraggableTextarea'
import DraggableCheckboxRow from './DraggableCheckboxRow'
import type { ArmesData, ArmuresData, FieldPositions, SheetPage } from '../context/GameDataContext'
import { findCulture, findTrait } from '../data/peuples'
import { useGameData } from '../context/GameDataContext'
import { computeEffectsWithCristaux, computeDiceEffects, sumStat, activeBoostContributions, computeAvantages } from '../utils/computeEffects'
import SheetTooltip from './SheetTooltip'
import type { TooltipData, TooltipLine } from './SheetTooltip'
import { useChampsFiche } from '../hooks/useChampsFiche'
import { ModeImpressionContext } from '../hooks/modeImpression'
import PastilleImpression from './PastilleImpression'
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
  // Réserve de calibrage (option A) — voir DraggableField. Conteneur DOM neutre (affiché à la place du
  // wizard) où portaler les champs "reserved", et callback pour faire transiter un champ vers/hors la
  // réserve sans toucher au reste de fieldPositions.
  reservePortalTarget?: HTMLElement | null
  onReserveToggle?: (label: string, reserved: boolean, pos: { top: number; left: number; width?: number; height?: number; perRow?: number; page?: SheetPage }) => void
  // Champs "rangée de cases à cocher" (DraggableCheckboxRow) uniquement — voir FieldPosition.perRow.
  onCheckboxRowMoved?: (label: string, top: number, left: number, perRow: number, stepX: number, stepY: number) => void
}

// Positions des 3 emplacements de fiche (ficheArme1/2/3) — 1 et 2 reprennent les coordonnées
// historiques des anciens champs de main (déjà calibrées de longue date sur l'image de la feuille) ;
// 3 est nouveau, sans position connue (voir reserveByDefault plus bas).
const FICHE_ARME_POS = [
  { top: 22.1, left: 85.7, width: 20.0, attTop: 24.6, attLeft: 79.1, dmTop: 24.7, dmLeft: 90.9, dmWidth: 9.0 },
  { top: 29.3, left: 85.8, width: 19.9, attTop: 31.9, attLeft: 79.2, dmTop: 31.9, dmLeft: 91.1, dmWidth: 9.1 },
  { top: 36.5, left: 85.8, width: 19.9, attTop: 39.1, attLeft: 79.2, dmTop: 39.1, dmLeft: 91.1, dmWidth: 9.1 },
]

const PR_CHECKBOXES = [
  { nom: 'PR 1', top: 58.2, left: 21.1 },
  { nom: 'PR 2', top: 58.2, left: 23.4 },
  { nom: 'PR 3', top: 58.2, left: 25.7 },
  { nom: 'PR 4', top: 58.2, left: 28.0 },
  { nom: 'PR 5', top: 58.2, left: 30.3 },
  { nom: 'PR 6', top: 58.2, left: 32.6 },
]

// Cases "Héroïque (2d)" : cochées automatiquement (jamais par clic) quand un grant AVANTAGE est actif
// pour la caractéristique — cf. computeAvantages. Nouveau champ, sans position d'origine sur la
// maquette : démarre en réserve de calibrage (voir le rendu plus bas), le top/left ci-dessous ne sert
// que de valeur nominale tant que l'utilisateur ne l'a pas sortie de la réserve.
const HEROIQUE_CHECKBOXES: { nom: string; key: 'FOR' | 'DEX' | 'CON' | 'INT' | 'SAG' | 'CHA' }[] = [
  { nom: 'Héroïque FOR', key: 'FOR' },
  { nom: 'Héroïque DEX', key: 'DEX' },
  { nom: 'Héroïque CON', key: 'CON' },
  { nom: 'Héroïque INT', key: 'INT' },
  { nom: 'Héroïque SAG', key: 'SAG' },
  { nom: 'Héroïque CHA', key: 'CHA' },
]



const CARAC_ROWS = [
  { key: 'FOR', top: 19.7, wVal: 6.4 },
  { key: 'DEX', top: 22.5, wVal: 6.5 },
  { key: 'CON', top: 25.3, wVal: 6.4 },
  { key: 'INT', top: 28.2, wVal: 6.4 },
  { key: 'SAG', top: 31.0, wVal: 6.3 },
  { key: 'CHA', top: 33.7, wVal: 6.3 },
] as const


interface Props {
  character: Character
  onChange: (patch: Partial<Character>) => void
  activeStep: number
  containerRef: React.RefObject<HTMLDivElement | null>
  // Fiche affichée, et fiche d'origine de ces champs (le recto) tant qu'ils n'ont pas été déplacés.
  page: SheetPage
  defaultPage: SheetPage
  calibrate?: boolean
  locked?: boolean
  onFieldMoved?: (label: string, top: number, left: number, width?: number, height?: number) => void
  fieldPositions?: FieldPositions
  reservePortalTarget?: HTMLElement | null
  onReserveToggle?: (label: string, reserved: boolean, pos: { top: number; left: number; width?: number; height?: number; perRow?: number; page?: SheetPage }) => void
  onCheckboxRowMoved?: (label: string, top: number, left: number, perRow: number, stepX: number, stepY: number) => void
}

// Bloc autonome regroupant les champs dont le recto est la fiche d'origine (identité, caractéristiques,
// attaques, défense, PV/PM/PC, points de récupération…). Monté par les DEUX fiches : chaque champ n'est
// dessiné que sur celle à laquelle il est assigné, ce qui permet de les déplacer de l'une à l'autre.
export default function ChampsRecto({
  character, onChange, activeStep, containerRef, page, defaultPage,
  calibrate = false, locked = true, onFieldMoved, fieldPositions,
  reservePortalTarget, onReserveToggle, onCheckboxRowMoved,
}: Props) {
  const { t } = useTranslation()
  const modeImpression = useContext(ModeImpressionContext)
  const cb = onFieldMoved ?? (() => {})
  const { peuples, data: rawData, armes, armures, objetsMagiques } = useGameData()
  const data = useTranslatedDescriptions(rawData)

  const [cbPos, setCbPos] = useState<Record<string, { top: number; left: number }>>(
    Object.fromEntries(PR_CHECKBOXES.map(f => [f.nom, fieldPositions?.[f.nom] ?? { top: f.top, left: f.left }]))
  )
  // fieldPositions n'était jusqu'ici lu qu'à l'initialisation (useState) — jamais resynchronisé après,
  // contrairement à CharacterSheetVerso. Sans ce useEffect, les positions calibrées des cases à cocher
  // ne survivaient pas à un redémarrage de l'app (retour aux positions par défaut).
  React.useEffect(() => {
    setCbPos(Object.fromEntries(PR_CHECKBOXES.map(f => [f.nom, fieldPositions?.[f.nom] ?? { top: f.top, left: f.left }])))
  }, [fieldPositions])

  const [heroPos, setHeroPos] = useState<Record<string, { top: number; left: number }>>(
    Object.fromEntries(HEROIQUE_CHECKBOXES.map(f => [f.nom, fieldPositions?.[f.nom] ?? { top: CARAC_ROWS.find(r => r.key === f.key)!.top, left: 30 }]))
  )
  React.useEffect(() => {
    setHeroPos(Object.fromEntries(HEROIQUE_CHECKBOXES.map(f => [f.nom, fieldPositions?.[f.nom] ?? { top: CARAC_ROWS.find(r => r.key === f.key)!.top, left: 30 }])))
  }, [fieldPositions])
  const voieName = useVoieName()
  const peupleName = usePeupleName()
  const profilName = useProfilName()
  const traitRacialName = useTraitRacialName()
  const traitRacialDesc = useTraitRacialDesc()
  const [tooltip, setTooltip] = useState<TooltipData | null>(null)
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

  const startHeroDrag = (nom: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startY = e.clientY
    const { top: startTop, left: startLeft } = heroPos[nom]

    const onMove = (ev: MouseEvent) => {
      const rect = containerRef.current!.getBoundingClientRect()
      setHeroPos(prev => ({
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
      setHeroPos(prev => ({ ...prev, [nom]: { top: newTop, left: newLeft } }))
      cb(nom, newTop, newLeft)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }



  // Tuyauterie des champs (position calibrée, appartenance à une fiche, réserve, infobulles) :
  // partagée avec le verso et les blocs autonomes, cf. useChampsFiche.
  const { f, cbReserve, reserveChip, surCettePage } = useChampsFiche({
    page, defaultPage, calibrate, fieldPositions, containerRef, setTooltip,
    onFieldMoved, reservePortalTarget, onReserveToggle,
  })

  const effects = computeEffectsWithCristaux(character, data, objetsMagiques)
  const diceEffects = computeDiceEffects(character, data)
  const heroiqueStats = new Set(computeAvantages(character, data).map(a => a.stat))

  const activeTooltip = tooltip

  const SUP: Record<number, string> = { 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵' }
  const groupContribs = (contribs: { nom: string; rang: number; triggerRang: number; value: number; voie: string }[]) => {
    const map = new Map<string, { nom: string; rang: number; maxTrigger: number; total: number; voie: string }>()
    for (let ci = 0; ci < contribs.length; ci++) {
      const c = contribs[ci]
      const key = c.voie === 'cristaux'
        ? `${c.voie}||${c.nom}||${c.rang}||${ci}`
        : `${c.voie}||${c.nom}||${c.rang}`
      const entry = map.get(key)
      if (entry) { entry.total += c.value; entry.maxTrigger = Math.max(entry.maxTrigger, c.triggerRang) }
      else map.set(key, { nom: c.nom, rang: c.rang, maxTrigger: c.triggerRang, total: c.value, voie: c.voie })
    }
    return [...map.values()].map(g => ({
      label: g.rang < 0
        ? voieName(g.nom)
        : g.maxTrigger === g.rang
          ? `${voieName(g.nom)} ${t('recto.rangLabel', { n: g.rang })}`
          : `${voieName(g.nom)} ${t('recto.rangLabel', { n: g.rang })}${SUP[g.maxTrigger] ?? String(g.maxTrigger)}`,
      value: `+${g.total}`,
      cristal: g.voie === 'cristaux' ? cristauxData.find(c => c.nom === g.nom) : undefined,
    }))
  }

  return (
    <>
      {/* === IDENTITÉ === */}
      {f({ label: "Nom joueur",  top: 10.1, left: 52.8, width: 18.3, height: 2.0, value: character.nomJoueur,     onChange: v => onChange({ nomJoueur: v }),                        active: activeStep === 0 })}
      {f({ label: "Profil",      top: 10.1, left: 76.3, width: 16.5, height: 2.0, value: profilName(character.profil),        onChange: locked ? () => {} : v => onChange({ profil: v }),      active: activeStep === 3, readOnly: locked })}
      {f({ label: "Genre",       top: 10.1, left: 92.3, width: 6.7,  height: 2.0, value: character.genre,         onChange: v => onChange({ genre: v }),                            active: activeStep === 0 })}
      {f({ label: "Famille",     top: 12.2, left: 76.3, width: 16.6, height: 2.0, value: profilName(character.famille ? character.famille[0].toUpperCase() + character.famille.slice(1) : ''), onChange: locked ? () => {} : v => onChange({ famille: v as Famille }), active: activeStep === 3, readOnly: locked })}
      {f({ label: "Âge",         top: 12.2, left: 92.1, width: 6.4,  height: 2.0, value: character.age,           onChange: v => onChange({ age: v }),                              active: activeStep === 0 })}
      {f({ label: "Nom perso",   top: 14.4, left: 51.9, width: 20.7, height: 2.0, value: character.nomPersonnage,  onChange: v => onChange({ nomPersonnage: v }),                   active: activeStep === 0 })}
      {f({ label: "Peuple",      top: 14.4, left: 76.3, width: 16.6, height: 2.0, value: locked ? peupleName(character.peuple) : character.peuple,   onChange: locked ? () => {} : v => onChange({ peuple: v }),      active: activeStep === 1, readOnly: locked })}
      {f({ label: "Taille",      top: 14.3, left: 91.7, width: 5.7,  height: 2.0, value: character.taille,        onChange: v => onChange({ taille: v }),                           active: activeStep === 0 })}
      {f({ label: "Niveau",      top: 16.5, left: 41.8, width: 4.9,  height: 2.0, value: character.niveau,        onChange: () => {}, readOnly: locked, align: "center" })}
      {f({ label: "Culture",     top: 16.5, left: 76.3, width: 16.6, height: 2.0, value: locked ? peupleName(character.culture) : character.culture,  onChange: locked ? () => {} : v => onChange({ culture: v }),     active: activeStep === 1, readOnly: locked })}
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
          if (racialMod !== 0) lines.push({ label: peupleName(character.peuple), value: racialMod > 0 ? `+${racialMod}` : `${racialMod}` })
          if (voieBonus !== 0) lines.push(...groupContribs(voieContribs))
          const caracFormula: { lines: TooltipLine[]; total: string | number } = { lines, total: effectiveVal }
          // Fiche déverrouillée : la Valeur devient éditable directement (dépasse le cadre du point-buy
          // du wizard — ex. ajuster un score après création, ou une valeur hors norme comme 66). Le champ
          // affiche effectiveVal (base + bonus de voie temporaires) : on retranche voieBonus de la saisie
          // pour que la valeur RÉELLEMENT tapée reste ce qui s'affiche ensuite, pas base+bonus en trop.
          // Mod. recalculé et stocké avec la même formule que le wizard (getMod, sans plafond haut — voir
          // types/character.ts) : n'importe quelle valeur donne un modificateur, y compris hors norme.
          const setValeur = (v: string) => {
            const finalVal = (parseInt(v) || 0) - voieBonus
            onChange({ caracteristiques: { ...character.caracteristiques, [key]: { valeur: finalVal, mod: getMod(finalVal) } } })
          }
          return (
            <React.Fragment key={key}>
              {f({ label: `${key} val`, tooltipTitle: t(`stats.${key}`), top, left: 16.3, width: wVal, height: 2.0, value: effectiveVal, onChange: setValeur, readOnly: locked, type: "number", align: "center", active: activeStep === 2, formula: caracFormula })}
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
        // Total PM identique à celui du mode de jeu (cf. computeEffects/GameModePanel) : les bonus de PM
        // accordés par les voies doivent être comptés, sinon la fiche affiche moins de PM que le perso
        // n'en a réellement — et la rangée de cases à cocher en manque d'autant.
        const pmContribs = effects['PM'] ?? []
        const pmNiveau = Math.max(0, character.famille === 'mystiques' ? 2 * pmBase : pmBase)
        const pm = pmNiveau + sumStat(pmContribs)
        // character.pm est le total réellement possédé : il est cumulé à chaque montée de niveau
        // (cf. LevelUpModal) et ne se redéduit pas de niveau+SAG. C'est donc lui qui fait foi quand il
        // existe — la formule ci-dessus ne sert que de repli. Le champ PM et la rangée de cases à
        // cocher doivent afficher CETTE valeur, sans quoi le nombre de cases contredit le total affiché.
        const pmAffiche = character.pm || pm
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
        const attContactTotal  = character.niveau + FOR.mod + famContact - malusEquip - malusArmesContact + attContactVoies
        const attDistTotal     = character.niveau + DEX.mod + famContact - malusAtkDist - malusEquip - malusArmesDist + sumStat(effects['ATT_DISTANCE'] ?? [])
        const attMagTotal      = character.niveau + INT.mod + famMagique - armorDef - malusEquip - malusArmesMag + sumStat(effects['ATT_MAGIQUE'] ?? [])

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
            { label: t('recto.tlAttDistance'), value: fmt(character.niveau + DEX.mod + famContact) },
            ...(malusAtkDist      > 0 ? [{ label: t('recto.tlEncombrement2'),   value: `-${malusAtkDist}`,      neg: true }] : []),
            ...(malusEquip        > 0 ? [{ label: t('recto.tlEquipSansForm'),   value: `-${malusEquip}`,        neg: true }] : []),
            ...(malusArmesDist    > 0 ? [{ label: t('recto.tlArmeSansForm'),    value: `-${malusArmesDist}`,    neg: true }] : []),
          ], total: fmt(attDistTotal) }
          if (type === 'INT') return { lines: [
            { label: t('recto.tlAttMagique'), value: fmt(character.niveau + INT.mod + famMagique) },
            ...(armorDef          > 0 ? [{ label: t('recto.tlEncombrement'),    value: `-${armorDef}`,          neg: true }] : []),
            ...(malusEquip        > 0 ? [{ label: t('recto.tlEquipSansForm'),   value: `-${malusEquip}`,        neg: true }] : []),
            ...(malusArmesMag     > 0 ? [{ label: t('recto.tlArmeSansForm'),    value: `-${malusArmesMag}`,     neg: true }] : []),
          ], total: fmt(attMagTotal) }
          return { lines: [
            { label: t('recto.tlAttContact'), value: fmt(character.niveau + FOR.mod + famContact) },
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
          {/* Nouveau champ (voir feedback_nouveaux_champs_en_reserve) : reprend initBonus, déjà calculé
              pour "Initiative totale" ci-dessous (même somme, effects['INIT']) mais affiché à part —
              certains bonus (ex. rang 1 de la voie de la divination) sont comptés dans le total sans
              qu'on puisse voir d'où ils viennent sur la fiche papier (pas de survol possible), demandé
              par Didic. */}
          {f({ label: "Bonus Init", tooltipTitle: t('recto.bonusInit'), top: 25.0, left: 62.2, width: 5.0, height: 2.0,
            value: fmt(initBonus), onChange: () => {}, readOnly: locked, align: "center",
            reserveByDefault: true,
            formula: { lines: groupContribs(initContribs), total: fmt(initBonus) } })}
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
          {f({ label: "Déf armure", top: 38.1, left: 66.2, width: 5.0, height: 2.0, value: armorDef > 0 ? `+${armorDef}` : '', onChange: () => {}, readOnly: locked, align: "center" })}
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
          {f({ label: "Déf bouclier", top: 38.1, left: 78.8, width: 5.0, height: 2.0, value: shieldDef > 0 ? `+${shieldDef}` : '', onChange: () => {}, readOnly: locked, align: "center" })}
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

          {/* Nom de l'armure/du bouclier actuellement équipé (un seul possible à la fois, cf.
              equipeArmure/equipeBouclier dans EquipementModal) — dérivé, pas de position d'origine sur
              la maquette : part en réserve de calibrage tant qu'il n'a pas été placé. */}
          {f({ label: "Nom armure", top: 34.0, left: 66.2, width: 12.0, height: 2.0,
            value: character.armuresEquipees.find(a => !isBouclier(a.nom) && a.equipe)?.nom ?? '',
            onChange: () => {}, readOnly: locked, reserveByDefault: true })}
          {f({ label: "Nom bouclier", top: 34.0, left: 78.8, width: 12.0, height: 2.0,
            value: character.armuresEquipees.find(a => isBouclier(a.nom) && a.equipe)?.nom ?? '',
            onChange: () => {}, readOnly: locked, reserveByDefault: true })}

          {/* Défense : décomposition — remplace l'ancien champ combiné "Bonus DEF" (jamais utilisé pour la
              saisie manuelle en pratique, cf. bonusDefense ci-dessous) par le détail par source demandé :
              Objet 1/2 = les 2 objets magiques équipés (objetsMagiquesEquipes, max 2 — voir
              CreationWizard.tsx MAX_OBJETS_MAGIQUES_EQUIPES), Capacité 1/2 = jusqu'à 2 contributions DEF
              de voies/rangs (hors cristaux et objets magiques, qui ont leurs propres sources). Chaque
              paire NOM + DEF suit la même convention que Arme N / ATT Arme N / DM Arme N plus haut : le
              champ "Objet N"/"Capacité N" affiche le NOM, un champ "DEF Objet N"/"DEF Capacité N" séparé
              affiche le score chiffré. "DEF total" ci-dessous reste inchangé, toujours correct :
              bonusDefense (résiduel, non affiché nulle part sur la fiche mais toujours compté) +
              defFromVoies. Nouveaux champs → réserve de calibrage par défaut. */}
          {(() => {
            const defObjet = (id: string | undefined) => {
              const objet = id ? objetsMagiques.find(o => o.id === id) : undefined
              if (!objet) return null
              let total = 0
              for (const ench of objet.enchantements) for (const ef of ench.effets ?? []) if (ef.stat === 'DEF') total += parseInt(ef.valeur) || 0
              return { nom: objet.nom, total }
            }
            const objetsEquipesIds = character.objetsMagiquesEquipes ?? []
            const objet1 = defObjet(objetsEquipesIds[0])
            const objet2 = defObjet(objetsEquipesIds[1])
            return <React.Fragment>
              {f({ label: "Objet 1", top: 38.1, left: 61.5, width: 10.0, height: 2.0,
                value: objet1?.nom ?? '', onChange: () => {}, readOnly: locked, reserveByDefault: true })}
              {(calibrate || objet1) && f({ label: "DEF Objet 1", top: 38.1, left: 72.0, width: 4.0, height: 2.0,
                value: objet1 ? fmt(objet1.total) : '—', onChange: () => {}, readOnly: locked, align: "center", reserveByDefault: true })}
              {f({ label: "Objet 2", top: 40.5, left: 61.5, width: 10.0, height: 2.0,
                value: objet2?.nom ?? '', onChange: () => {}, readOnly: locked, reserveByDefault: true })}
              {(calibrate || objet2) && f({ label: "DEF Objet 2", top: 40.5, left: 72.0, width: 4.0, height: 2.0,
                value: objet2 ? fmt(objet2.total) : '—', onChange: () => {}, readOnly: locked, align: "center", reserveByDefault: true })}
            </React.Fragment>
          })()}
          {(() => {
            const capaciteContribs = (effects['DEF'] ?? []).filter(c => c.voie !== 'cristaux' && c.voie !== 'objets-magiques')
            const capaciteLines = groupContribs(capaciteContribs)
            const cap1 = capaciteLines[0]
            const cap2 = capaciteLines[1]
            return <React.Fragment>
              {f({ label: "Capacité 1", top: 38.1, left: 77.0, width: 10.0, height: 2.0,
                value: cap1?.label ?? '', onChange: () => {}, readOnly: locked, reserveByDefault: true })}
              {(calibrate || cap1) && f({ label: "DEF Capacité 1", top: 38.1, left: 87.5, width: 4.0, height: 2.0,
                value: cap1 ? cap1.value : '—', onChange: () => {}, readOnly: locked, align: "center", reserveByDefault: true })}
              {f({ label: "Capacité 2", top: 40.5, left: 77.0, width: 10.0, height: 2.0,
                value: cap2?.label ?? '', onChange: () => {}, readOnly: locked, reserveByDefault: true })}
              {(calibrate || cap2) && f({ label: "DEF Capacité 2", top: 40.5, left: 87.5, width: 4.0, height: 2.0,
                value: cap2 ? cap2.value : '—', onChange: () => {}, readOnly: locked, align: "center", reserveByDefault: true })}
            </React.Fragment>
          })()}

          {/* Défense : total */}
          {(() => {
            const defContribs = [...(effects['DEF'] ?? []), ...activeBoostContributions(character, 'DEF')]
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
          {f({ label: "Bonus fam. contact", tooltipTitle: t('recto.bonusFamilleContact'), top: 28.1, left: 62.2, width: 5.0, height: 2.0, value: fmt(famContact), onChange: () => {}, readOnly: locked, align: "center",
            tooltipDesc: t('recto.bonusFamilleAttDisp') })}
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
          {f({ label: "Bonus fam. distance", tooltipTitle: t('recto.bonusFamilleDistance'), top: 30.9, left: 62.2, width: 5.0, height: 2.0, value: fmt(famContact), onChange: () => {}, readOnly: locked, align: "center",
            tooltipDesc: t('recto.bonusFamilleAttDisp') })}
          {f({ label: "ATT dist total",      tooltipTitle: t('recto.attDistTotal'), top: 30.9, left: 68.3, width: 5.0, height: 2.0,
            value: fmt(attDistTotal), onChange: () => {}, readOnly: locked, align: "center",
            formula: { lines: [
              { label: t('recto.tlNiveau'), value: niv },
              { label: t('stats.modDEX'), value: fmt(DEX.mod) },
              { label: t('recto.tlFamille', { fam: character.famille ?? '—' }), value: fmt(famContact) },
              { label: t('recto.tlEncombrement2'), value: malusAtkDist > 0 ? `-${malusAtkDist}` : '0', neg: malusAtkDist > 0 },
              ...(malusEquip     > 0 ? [{ label: t('recto.tlEquipSansForm'), value: `-${malusEquip}`,     neg: true }] : []),
              ...(malusArmesDist > 0 ? [{ label: t('recto.tlArmeSansForm'), value: `-${malusArmesDist}`, neg: true }] : []),
              ...groupContribs(effects['ATT_DISTANCE'] ?? []),
            ], total: fmt(attDistTotal) } })}

          {/* ATT magique */}
          {f({ label: "ATT mag mod",        top: 33.7, left: 50,   width: 5.1, height: 2.0, value: fmt(INT.mod), onChange: () => {}, readOnly: locked, align: "center" })}
          {f({ label: "ATT mag niv",        top: 33.7, left: 56.2, width: 5.0, height: 2.0, value: niv, onChange: () => {}, readOnly: locked,  align: "center" })}
          {f({ label: "Bonus fam. magique", tooltipTitle: t('recto.bonusFamilleMagique'), top: 33.7, left: 62.2, width: 5.0, height: 2.0, value: fmt(famMagique), onChange: () => {}, readOnly: locked, align: "center",
            tooltipDesc: t('recto.bonusFamilleMagiqueDisp') })}
          {f({ label: "ATT mag total",      tooltipTitle: t('recto.attMagTotal'), top: 33.7, left: 68.3, width: 5.0, height: 2.0,
            value: fmt(attMagTotal), onChange: () => {}, readOnly: locked, align: "center",
            formula: { lines: [
              { label: t('recto.tlNiveau'), value: niv },
              { label: t('stats.modINT'), value: fmt(INT.mod) },
              { label: t('recto.tlMystiques'), value: fmt(famMagique) },
              { label: t('recto.tlEncombrement'), value: armorDef > 0 ? `-${armorDef}` : '0', neg: armorDef > 0 },
              ...(malusEquip    > 0 ? [{ label: t('recto.tlEquipSansForm'), value: `-${malusEquip}`,    neg: true }] : []),
              ...(malusArmesMag > 0 ? [{ label: t('recto.tlArmeSansForm'), value: `-${malusArmesMag}`, neg: true }] : []),
              ...groupContribs(effects['ATT_MAGIQUE'] ?? []),
            ], total: fmt(attMagTotal) } })}

          {/* Armes — emplacements de la FICHE (character.ficheArme1/2/3), distincts des mains
              (character.arme1/arme2) : toujours choisis dans la modale Équipement parmi les armes
              possédées (jamais de saisie libre ici), donc toujours résolvables via le catalogue ou
              character.armes. Arme 1 et Arme 2 gardent leurs positions déjà calibrées de longue date
              (c'était les anciens champs de main) ; Arme 3 reste en réserve de calibrage (nouveau,
              jamais positionné). Pas de repère si aussi équipée en main — essayé (point, emoji, texte),
              abandonné : décision explicite de l'utilisateur, aucune marque affichée. */}
          {([1, 2, 3] as const).map(n => {
            const pos = FICHE_ARME_POS[n - 1]
            const nom = n === 1 ? character.ficheArme1 : n === 2 ? character.ficheArme2 : character.ficheArme3
            const e = nom ? findArmeEntry(armes, nom) : null
            const modVal = e?.mod === 'FOR' ? FOR.mod : e?.mod === 'DEX' ? DEX.mod : null
            const bonusContribs = nom ? dmArmeBonusContribs(nom) : []
            const bonus = sumStat(bonusContribs)
            const invEntry = !e && nom ? character.armes.find(a => a.nom === nom) : null
            const invModVal = invEntry?.attaque === 'FOR' ? FOR.mod : invEntry?.attaque === 'DEX' ? DEX.mod : null
            const dmBase = e
              ? `${e.dm}${modVal !== null ? ' ' + fmt(modVal) : ''}`
              : invEntry ? `${invEntry.dm}${invModVal !== null ? ' ' + fmt(invModVal) : ''}` : ''
            const dm = bonus !== 0 ? `${dmBase} ${fmt(bonus)}` : dmBase
            const formula = e ? { lines: [
              { label: t('recto.tlDes'), value: e.dm },
              ...(modVal !== null ? [{ label: t(`stats.mod${e.mod}`), value: fmt(modVal) }] : []),
              ...groupContribs(bonusContribs),
            ], total: dm } : invEntry ? { lines: [
              { label: t('recto.tlDes'), value: invEntry.dm },
              ...(invModVal !== null ? [{ label: t(`stats.mod${invEntry.attaque}`), value: fmt(invModVal) }] : []),
              ...groupContribs(bonusContribs),
            ], total: dm } : undefined
            const ficheKey = n === 1 ? 'ficheArme1' : n === 2 ? 'ficheArme2' : 'ficheArme3'
            return <React.Fragment key={n}>
              {f({ label: `Arme ${n}`, top: pos.top, left: pos.left, width: pos.width, height: 2.0,
                value: nom, onChange: v => onChange({ [ficheKey]: v }), readOnly: locked,
                reserveByDefault: n === 3 })}
              {(calibrate || nom) && f({ label: `ATT Arme ${n}`, tooltipTitle: t('recto.attArme', { arme: nom || String(n) }), top: pos.attTop, left: pos.attLeft, width: 5.0, height: 2.0,
                value: nom ? attTotalPourArme(nom) : '—', onChange: () => {}, readOnly: locked, align: "center",
                formula: nom ? formulaArme(nom) : undefined, reserveByDefault: n === 3 })}
              {(calibrate || nom) && f({ label: `DM Arme ${n}`, tooltipTitle: t('recto.dmArme', { arme: nom || String(n) }), top: pos.dmTop, left: pos.dmLeft, width: pos.dmWidth, height: 2.0,
                value: dm, onChange: () => {}, readOnly: locked, align: "center", formula, reserveByDefault: n === 3 })}
            </React.Fragment>
          })}
          {!calibrate && !character.arme1 && diceEffects['DM_MAINS_NUES'] && (() => {
            const { diceStr } = diceEffects['DM_MAINS_NUES']
            const forMod = getMod(FOR.valeur)
            const dm = `${diceStr} ${forMod >= 0 ? '+' : ''}${forMod}`
            return f({ label: "DM mains nues", tooltipTitle: t('recto.dmMainsNues'), top: 24.3, left: 91.4, width: 9.0, height: 2.0,
              value: dm, onChange: () => {}, readOnly: locked, align: "center",
              formula: { lines: [{ label: t('recto.tlDes'), value: diceStr }, { label: t('stats.modFOR'), value: fmt(forMod) }], total: dm } })
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
            const pvActuels = character.pvRestants ?? pvTotal
            return <>
              {f({ label: "pvRestants", tooltipTitle: t('recto.pvRestants'), top: 38.1, left: 22.8, width: 5.1, height: 2.0,
                value: pvActuels,
                onChange: v => onChange({ pvRestants: parseInt(v) || 0 }),
                type: "number", align: "center", active: activeStep === 4 , temporaire: true})}
              {f({ label: "PV total", tooltipTitle: t('recto.pvTotal'), top: 38.1, left: 28.8, width: 5.1, height: 2.0,
                value: locked ? pvTotal : (character.pvRestants ?? pvTotal),
                onChange: locked ? () => {} : v => onChange({ pvRestants: parseInt(v) || 0 }),
                readOnly: locked, align: "center", active: activeStep === 4,
                formula: locked ? { lines: pvLines, total: pvTotal } : undefined })}
            </>
          })()}
          {(() => {
            const label = 'pmRestants'
            const fp = fieldPositions?.[label]
            const rTop = fp?.top ?? 46.1, rLeft = fp?.left ?? 22.8
            const rPerRow = fp?.perRow ?? 10, rStepX = fp?.width ?? 1.0, rStepY = fp?.height ?? 1.3
            const cbRowMoved = onCheckboxRowMoved ?? (() => {})
            if (fp?.reserved === true) return reserveChip(label, { top: rTop, left: rLeft, width: rStepX, height: rStepY })
            if (!surCettePage(label)) return null
            // Donnée de session (cases cochées au crayon) : imprime ET temporaire (qui pilote la classe
            // CSS tdr-temporaire) doivent dépendre de LA MÊME décision, sinon la pastille peut afficher
            // "imprime" alors que le champ reste masqué par CSS — imprime par défaut à false ici (pas
            // true comme avant), cohérent avec « une donnée de session ne s'imprime pas par défaut ».
            const imprimePm = fp?.imprimer ?? false
            return (
              <DraggableCheckboxRow
                label={label} top={rTop} left={rLeft} perRow={rPerRow} stepX={rStepX} stepY={rStepY}
                count={pmAffiche} checkedCount={character.pmRestants ?? pmAffiche} temporaire={!imprimePm}
                onValueChange={v => onChange({ pmRestants: v })}
                // Les PM sont imprimés par paquets de 5 colonnes (5 cases en haut, 5 en bas, voir la
                // note sur blocTaille dans DraggableCheckboxRow.tsx) — pas ligne haute de 25 puis ligne
                // basse de 25, demandé par Didic pour que le remplissage suive l'ordre visuel imprimé.
                blocTaille={5}
                calibrate={calibrate} containerRef={containerRef}
                onGridChange={(l, t, lf, pr, sx, sy) => cbRowMoved(l, t, lf, pr, sx, sy)}
                onReserveToggle={r => cbReserve(label, r, { top: rTop, left: rLeft, width: rStepX, height: rStepY, perRow: rPerRow })}
                imprime={imprimePm}
                onToggleImpression={() => cbReserve(label, fp?.reserved === true, { imprimer: !imprimePm } as never)}
              />
            )
          })()}
          {f({ label: "PM", tooltipTitle: t('recto.pm'), top: 46.1, left: 28.9, width: 5.0, height: 2.0,
            value: pmAffiche,
            onChange: locked ? () => {} : v => onChange({ pm: parseInt(v) || 0 }),
            readOnly: locked, type: "number", align: "center", active: activeStep === 4,
            formula: { lines: [
              { label: t('recto.tlNiveau'), value: niv },
              { label: t('stats.modSAG'), value: fmt(SAG.mod) },
              ...(character.famille === 'mystiques' ? [{ label: t('recto.tlX2Mystiques'), value: '' }] : []),
              ...groupContribs(pmContribs),
            ], total: pmAffiche } })}
          {f({ label: "pcRestants", tooltipTitle: t('recto.pcRestants'), top: 50.6, left: 22.8, width: 5.2, height: 2.0,
            value: character.pcRestants || character.pc,
            onChange: v => onChange({ pcRestants: parseInt(v) || 0 }), type: "number", align: "center", active: activeStep === 4 , temporaire: true})}
          {(() => {
            // "PC" suivait un chemin à part, jamais readOnly même verrouillée : contrairement à "PV
            // total"/"PM" (mêmes readOnly: locked + formula), sa formule ne s'affichait donc jamais en
            // infobulle (voir la condition `formula && !calibrate && p.readOnly` dans useChampsFiche).
            // Alignée ici sur le même principe : total calculé et infobulle quand verrouillée, saisie
            // manuelle libre (comme avant) quand déverrouillée.
            // effects['PC'] : bonus des objets magiques équipés (ex. arme traditionnelle gobeline) — voir
            // computeEffectsWithCristaux. Aucune voie n'accorde de bonus de PC à ce jour, donc ce terme
            // était absent jusqu'ici ; son ajout ne change rien pour un personnage sans objet magique.
            const pcContribs = effects['PC'] ?? []
            const pcAffiche = CHA.mod + (character.famille === 'aventuriers' ? 4 : 2) + sumStat(pcContribs)
            const pcLines = [
              { label: t('recto.tlBase'), value: '+2' },
              { label: t('stats.modCHA'), value: fmt(CHA.mod) },
              ...(character.famille === 'aventuriers' ? [{ label: t('recto.tlAventuriers'), value: '+2' }] : []),
              ...groupContribs(pcContribs),
            ]
            return f({ label: "PC", tooltipTitle: t('recto.pc'), top: 50.6, left: 28.8, width: 5.2, height: 2.0,
              value: locked ? pcAffiche : character.pc,
              onChange: locked ? () => {} : v => onChange({ pc: parseInt(v) || 0 }),
              readOnly: locked, type: "number", align: "center", active: activeStep === 4,
              formula: { lines: pcLines, total: pcAffiche } })
          })()}
          {/* Bonus de CHA : PAS un bonus indépendant — un second affichage du champ "CHA mod" (bloc
              caractéristiques), reproduit à l'identique (même valeur, même comportement figé/déverrouillé)
              pour apparaître aussi dans l'encart points de chance de la nouvelle maquette. Nouveau champ,
              sans position d'origine : part en réserve de calibrage. */}
          {f({ label: "Bonus de CHA", top: 50.6, left: 35, width: 5.2, height: 2.0,
            value: fmt(CHA.mod),
            onChange: () => {}, readOnly: locked, align: "center",
            reserveByDefault: true })}
          {/* Bonus de famille (PC) : dérivé de la famille Aventuriers (+2), jamais de saisie manuelle —
              même principe que "ATT contact mod"/"Nom armure" (champ purement affiché). Nouveau champ,
              sans position d'origine sur la maquette : part en réserve de calibrage. */}
          {f({ label: "Bonus famille PC", tooltipTitle: t('recto.bonusFamillePc'), top: 50.6, left: 41.2, width: 5.2, height: 2.0,
            value: character.famille === 'aventuriers' ? '+2' : '+0',
            onChange: () => {}, readOnly: locked, align: "center",
            tooltipDesc: t('recto.bonusFamillePcDisp'),
            reserveByDefault: true })}
          {f({ label: "Dé de vie", tooltipTitle: t('recto.deVie'), top: 55.2, left: 25.8, width: 11.1, height: 2.0, value: character.deVie, onChange: v => onChange({ deVie: v }), align: "center", active: activeStep === 4,
            formula: { lines: [{ label: t('recto.tlCombattants'), value: 'd10' }, { label: t('recto.tlAventuriers'), value: 'd8' }, { label: t('recto.tlMystiques'), value: 'd6' }], total: character.deVie } })}
        </>
      })()}

      {/* === POINTS DE RÉCUPÉRATION === */}
      {PR_CHECKBOXES.map(({ nom }, idx) => {
        const { top, left } = cbPos[nom]
        if (fieldPositions?.[nom]?.reserved === true) return reserveChip(nom, { top, left })
        if (!surCettePage(nom)) return null
        return (
          <div key={nom}>
            <div
              className="tdr-temporaire"
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
              <CroixCase coche={character.prUtilises[idx]} calibrate={calibrate} />
            </div>
            {modeImpression && onReserveToggle && (
              <PastilleImpression
                imprime={fieldPositions?.[nom]?.imprimer ?? true}
                onToggle={() => onReserveToggle(nom, fieldPositions?.[nom]?.reserved === true, { top, left, imprimer: !(fieldPositions?.[nom]?.imprimer ?? true) } as never)}
                top={top} left={left}
              />
            )}
            {calibrate && (
              <div
                onMouseDown={e => startPRDrag(nom, e)}
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
                {nom}
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

      {/* === HÉROÏQUE (2D) === : cases purement dérivées (jamais de clic), cochées automatiquement
          par computeAvantages. Nouveau champ sans position d'origine : reste en réserve tant que
          fieldPositions n'a pas d'entrée pour lui (voir feedback_nouveaux_champs_en_reserve). */}
      {HEROIQUE_CHECKBOXES.map(({ nom, key }) => {
        const { top, left } = heroPos[nom]
        const fp = fieldPositions?.[nom]
        if (fp?.reserved === true || !fp) return reserveChip(nom, { top, left })
        if (!surCettePage(nom)) return null
        return (
          <div key={nom}>
            <div
              className="tdr-temporaire"
              style={{
                position: 'absolute',
                top: `${top}%`, left: `${left}%`,
                width: '1.6%', height: '1.1%',
                transform: 'translate(-50%, -50%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <CroixCase coche={heroiqueStats.has(key)} calibrate={calibrate} />
            </div>
            {modeImpression && onReserveToggle && (
              <PastilleImpression
                imprime={fp?.imprimer ?? true}
                onToggle={() => onReserveToggle(nom, fp?.reserved === true, { top, left, imprimer: !(fp?.imprimer ?? true) } as never)}
                top={top} left={left}
              />
            )}
            {calibrate && (
              <div
                onMouseDown={e => startHeroDrag(nom, e)}
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
                {nom}
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

      {/* Trait de peuple */}
      {f({ label: "Trait peuple", top: 61.1, left: 25.7, width: 16.5, height: 2.0, value: traitRacialName(character.traitPeuple), onChange: v => onChange({ traitPeuple: v }), active: activeStep === 1 })}
      {(() => {
        const label = 'Trait peuple desc'
        const fpTrait = fieldPositions?.[label]
        const tTop = fpTrait?.top ?? 65.2, tLeft = fpTrait?.left ?? 19.3, tWidth = fpTrait?.width ?? 29.3, tHeight = fpTrait?.height ?? 5.6
        if (fpTrait?.reserved === true) return reserveChip(label, { top: tTop, left: tLeft, width: tWidth, height: tHeight })
        if (!surCettePage(label)) return null
        return (
          <DraggableTextarea
            top={tTop} left={tLeft} width={tWidth} height={tHeight}
            value={traitRacialDesc(character.traitPeuple, character.traitPeupleDesc)}
            onChange={v => onChange({ traitPeupleDesc: v })}
            calibrate={calibrate} label={label}
            containerRef={containerRef} onMoved={cb}
            lineHeightPct={1.3} paddingTopPct={0.15}
            autoShrink
            onReserveToggle={r => cbReserve(label, r, { top: tTop, left: tLeft, width: tWidth, height: tHeight })}
            imprime={fpTrait?.imprimer ?? true}
            onToggleImpression={() => cbReserve(label, fpTrait?.reserved === true, { imprimer: !(fpTrait?.imprimer ?? true) } as never)}
          />
        )
      })()}
      {(() => {
        const trait = findTrait(peuples, character.peuple, character.culture)
        if (!trait || !surCettePage('Trait peuple')) return null
        return (
          <div style={{ position: 'absolute', top: '61.1%', left: '25.7%', width: '16.5%', height: '2%',
            transform: 'translate(-50%, -50%)', zIndex: 20, cursor: 'help' }}
            onMouseEnter={e => {
              const rect = containerRef.current?.getBoundingClientRect()
              if (!rect) return
              setTooltip({ nom: traitRacialName(trait.nom), desc: traitRacialDesc(trait.nom, trait.desc), x: (e.clientX - rect.left) / rect.width * 100, y: (e.clientY - rect.top) / rect.height * 100 })
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


      {activeTooltip && <SheetTooltip tooltip={activeTooltip} character={character} descriptions={data} />}
    </>
  )
}
