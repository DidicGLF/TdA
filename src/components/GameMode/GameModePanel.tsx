import { useState, useCallback, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { DiceIcon } from './DiceIcon'
import type { Character, Caracteristique } from '../../types/character'
type CharacterPatch = Partial<Character>
import type { DescMap, Grant } from '../../types/gameData'
import { computeEffectsWithCristaux, sumStat, computeAttaquesTotaux, resolveFormula } from '../../utils/computeEffects'
import { getMod } from '../../types/character'
import { useGameData } from '../../context/GameDataContext'
import { getRangsEmpruntes } from '../../utils/voieRangChoix'
import { parseDesc } from '../../utils/parseDesc'

const GOLD = '#c9a84c'
const PARCHMENT = '#f5ecd7'
const BG = '#1a1410'
const SECTION_BORDER = 'rgba(201,168,76,0.2)'
const SECTION_DIVIDER: React.CSSProperties = { borderTop: `1px dashed ${SECTION_BORDER}`, paddingTop: 12 }

const STATS: Caracteristique[] = ['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA']
const BARE_DICE = [4, 6, 8, 10, 12, 20]
// Types de dégâts sélectionnables pour le champ "Dégâts subis" — chaque type (hors générique) a sa propre
// stat de RD dédiée (RD_FEU, RD_FROID, ...), qui s'ajoute à la RD générique (stat "RD").
const DAMAGE_TYPES = ['FEU', 'FROID', 'FOUDRE', 'ACIDE', 'POISON', 'NECROTIQUE', 'TENEBRES', 'LUMIERE', 'MENTAL', 'TRANCHANT', 'PERFORANT', 'CONTONDANT']
// Icônes (non traduites, universelles) associées à chaque type de dégâts — '' = générique
const DAMAGE_TYPE_ICONS: Record<string, string> = {
  '': '🩸', FEU: '🔥', FROID: '❄️', FOUDRE: '⚡', ACIDE: '🧪', POISON: '☠️', NECROTIQUE: '🪦',
  TENEBRES: '🌑', LUMIERE: '☀️', MENTAL: '🧠', TRANCHANT: '🗡️', PERFORANT: '🏹', CONTONDANT: '🔨',
}


interface ContributingEffect {
  rangNom: string
  voieNom?: string
  rangIdx?: number
  temporaire?: boolean
}

interface RollResult {
  label: string
  formula: string
  sides: number
  roll: number
  modifier: number | null
  boost?: number
  boostLabel?: string
  total: number
  stat?: string
  costType?: 'PV' | 'PM' | 'PR'
  rollDisplay?: string
  flash: boolean
  contributingEffects?: ContributingEffect[]
}

interface ActiveBoost {
  id: number
  stat: string
  bonus: number
  label: string
  post_jet: boolean
  cout_pv?: string
  sourceKey?: string
  div2?: boolean
  immunite?: boolean
  // Nom de la capacité + rang, dupliqués ici (plutôt qu'une recherche dans availableBonuses) pour que ce soit
  // auto-suffisant une fois persisté sur le personnage et relu par la fiche.
  nom: string
  rang: number
}

// Dégâts sur la durée (poison, brûlure, etc.) : X points du type choisi, encaissés automatiquement (avec
// prise en compte de la RD/div2/immunité du type au moment de chaque application) à chaque fin de tour,
// pendant un nombre de tours donné.
interface ActiveDot {
  id: number
  type: string
  amount: number
  remainingTurns: number
  label: string
}

interface AvailableBonus {
  voieNom: string
  rangIdx: number
  grantIdx: number
  rangNom: string
  label: string
  bonus: number
  formula?: string
  deDegats?: string
  deDegatsParArme?: boolean
  temporaire?: boolean
  cibles: string[]
  choix?: boolean
  cout_pv?: string
  cout_pm?: string
  coutCaracStat?: string
  coutCaracValeur?: number
  usage?: string
  post_jet?: boolean
  precision?: string
  div2?: boolean
  immunite?: boolean
}

interface AvailableAvantage {
  voieNom: string
  rangIdx: number
  rangNom: string
  stat: string
  lancer: number
  garder: number
}

interface AvailableAction {
  voieNom: string
  rangIdx: number
  rangNom: string
  label: string
  de: number
  dm: string
  attType?: 'contact' | 'distance' | 'magique'
  activable?: boolean
  cout_pm?: string
}

interface Props {
  character: Character
  descriptions: DescMap
  onChange: (patch: CharacterPatch) => void
  onClose: () => void
  screenWidth: number
}

let nextId = 1

function rollDiceStr(diceStr: string): number {
  const m = diceStr.match(/^(\d*)d(\d+)$/i)
  if (!m) return 0
  const nb = parseInt(m[1] || '1')
  const sides = parseInt(m[2])
  let total = 0
  for (let k = 0; k < nb; k++) total += Math.floor(Math.random() * sides) + 1
  return total
}

// Clé unique par grant activable — doit inclure grantIdx : plusieurs Bonus temporaire peuvent coexister
// sur un même rang (ex: DEF+4, immunité au froid, ÷2 au feu), et ab-${voieNom}-${rangIdx} seul les confondrait.
function boostKey(ab: { voieNom: string; rangIdx: number; grantIdx: number }): string {
  return `ab-${ab.voieNom}-${ab.rangIdx}-${ab.grantIdx}`
}

export default function GameModePanel({ character, descriptions, onChange, onClose, screenWidth }: Props) {
  const { t } = useTranslation()
  const { armes, armures } = useGameData()
  const isMobile = screenWidth < 700
  const [result, setResult] = useState<RollResult | null>(null)
  const [history, setHistory] = useState<RollResult[]>([])
  // Le "character" reçu est déjà la copie de session créée par App.tsx à l'ouverture du Mode de jeu (jamais
  // l'original) — on peut donc écrire dessus librement via onChange, ça ne touche jamais la vraie fiche.
  const [effectCounters, setEffectCounters] = useState<Record<string, number>>(() => character.effectCounters ?? {})
  const [activeBoosts, setActiveBoosts] = useState<ActiveBoost[]>(() => (character.activeBoosts as ActiveBoost[] | undefined) ?? [])
  const [activeDots, setActiveDots] = useState<ActiveDot[]>(() => character.activeDots ?? [])
  useEffect(() => {
    onChange({ activeBoosts, effectCounters, activeDots })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBoosts, effectCounters, activeDots])
  // Voie culturelle des Ogres, rang 4 "Intuable" : le PJ peut choisir de résister à l'inconscience à 0 PV
  // et continuer à se battre, PV négatifs jusqu'à -CON, au-delà duquel il meurt.
  const [ogreResisting, setOgreResisting] = useState(false)
  const [pendingStatPick, setPendingStatPick] = useState<{ abIdx: number } | null>(null)
  const [deDegatsWeapon, setDeDegatsWeapon] = useState<Record<string, string>>({})
  const [currentPV, setCurrentPV] = useState<number | null>(() => character.pvRestants ?? null)
  const [currentPM, setCurrentPM] = useState<number | null>(() => character.pmRestants ?? null)
  const [resultInHistory, setResultInHistory] = useState(false)
  const [healInput, setHealInput] = useState('')
  const [dmInput, setDmInput] = useState('')
  const [dotAmountInput, setDotAmountInput] = useState('')
  const [dotDurationInput, setDotDurationInput] = useState('')
  const [dotTypeInput, setDotTypeInput] = useState('')
  const [gmTooltip, setGmTooltip] = useState<{ title: string; desc?: string; x: number; y: number; below: boolean } | null>(null)


  const voiesPerso = useMemo(() => [
    character.voiePeuple, character.voieCulturelle,
    character.voie1, character.voie2, character.voie3,
    character.voiePrestige, character.voieSangMele,
  ], [character])

  // Rangs obtenus via un grant VOIE_RANG/VOIE_RANG_CHOIX d'une des voies ci-dessus (ex : voie
  // culturelle de la Forge donnant un rang d'alchimie ou de magie runique, ou "Furie du Berserker"
  // donnant le rang 3 de la voie de la férocité) — mêmes capacités qu'un rang possédé en propre pour
  // les bonus/actions activables ci-dessous, mais sans notion de rang avancé ni de sous-choix en cascade.
  const rangsEmpruntes = useMemo(() => getRangsEmpruntes(character, descriptions), [character, descriptions])

  // Parmi les rangs empruntés, ceux qui n'ont aucun grant activable (BONUS_TEMP/ACTION/AVANTAGE) —
  // purement descriptifs (ex : Fortifiant, Feu grégeois de la voie d'alchimie) — n'apparaîtraient sinon
  // nulle part dans le Mode de jeu une fois la fiche fermée ; on les liste à part, en texte simple.
  const rangsEmpruntesTexte = useMemo(() =>
    rangsEmpruntes.filter(({ rangData }) =>
      !(rangData.grants ?? []).some(g => g.type === 'BONUS_TEMP' || g.type === 'ACTION' || g.type === 'AVANTAGE')
    ),
  [rangsEmpruntes])

  const availableBonuses = useMemo<AvailableBonus[]>(() => {
    const out: AvailableBonus[] = []
    for (const voie of voiesPerso) {
      if (!voie.nom) continue
      const rangsDesc = descriptions[voie.nom]
      if (!rangsDesc) continue
      voie.rangs.forEach((unlocked, idx) => {
        if (!unlocked) return
        const rang = rangsDesc[idx]
        if (!rang?.grants) return
        for (let gi = 0; gi < rang.grants.length; gi++) {
          const grant = rang.grants[gi]
          if (grant.type !== 'BONUS_TEMP') continue
          if (grant.avancee && !(voie.rangsAvances?.[idx])) continue
          if (grant.masqueSiAvancee && voie.rangsAvances?.[idx]) continue
          if ((grant.minRang ?? 1) > voie.rangs.filter(Boolean).length) continue
          const bonusValue = grant.formula ? (resolveFormula(grant.formula, character) ?? 0) : (grant.bonus ?? 0)
          out.push({ voieNom: voie.nom, rangIdx: idx, grantIdx: gi, rangNom: rang.nom, label: grant.label, bonus: bonusValue, formula: grant.formula, deDegats: grant.deDegats, deDegatsParArme: grant.deDegatsParArme, temporaire: grant.temporaire, cibles: grant.cibles, choix: grant.choix, cout_pv: grant.cout_pv, cout_pm: grant.cout_pm, coutCaracStat: grant.coutCaracStat, coutCaracValeur: grant.coutCaracValeur, usage: grant.usage, post_jet: grant.post_jet, precision: grant.precision, div2: grant.div2, immunite: grant.immunite })
        }
      })
    }
    // Rangs empruntés (VOIE_RANG/VOIE_RANG_CHOIX) : mêmes bonus temporaires activables. La case avancée
    // se raccroche à celle du rang qui porte le grant (avanceeAccordee), pas de minRang (pas de
    // progression dans la voie source). Cas limite non géré : si le perso possède déjà EN PROPRE le
    // même (voieNom, rangIdx) que celui emprunté (ex. Furie du Berserker empruntant un rang de férocité
    // que le perso a aussi pris directement), boostKey() produit la même clé pour les deux — le livre
    // les fusionne narrativement dans ce cas précis (voir description de la capacité), pas géré
    // mécaniquement ici.
    for (const { voieNom, rangIdx, rangData, avanceeAccordee } of rangsEmpruntes) {
      (rangData.grants ?? []).forEach((grant, gi) => {
        if (grant.type !== 'BONUS_TEMP' || (grant.avancee && !avanceeAccordee) || grant.minRang !== undefined) return
        const bonusValue = grant.formula ? (resolveFormula(grant.formula, character) ?? 0) : (grant.bonus ?? 0)
        out.push({ voieNom, rangIdx, grantIdx: gi, rangNom: rangData.nom, label: grant.label, bonus: bonusValue, formula: grant.formula, deDegats: grant.deDegats, deDegatsParArme: grant.deDegatsParArme, temporaire: grant.temporaire, cibles: grant.cibles, choix: grant.choix, cout_pv: grant.cout_pv, cout_pm: grant.cout_pm, coutCaracStat: grant.coutCaracStat, coutCaracValeur: grant.coutCaracValeur, usage: grant.usage, post_jet: grant.post_jet, precision: grant.precision, div2: grant.div2, immunite: grant.immunite })
      })
    }
    return out
  }, [voiesPerso, rangsEmpruntes, descriptions, character])

  const permanentBonusByStat = useMemo(() => {
    const map = new Map<string, number>()
    for (const ab of availableBonuses) {
      if (ab.temporaire) continue
      for (const cible of ab.cibles) map.set(cible, (map.get(cible) ?? 0) + ab.bonus)
    }
    return map
  }, [availableBonuses])

  // Bonus en dés (deDegats) actuellement actifs : permanents, ou temporaires en cours
  const activeDeDegats = useMemo(() => availableBonuses.filter(ab =>
    ab.deDegats && (!ab.temporaire || (effectCounters[boostKey(ab)] ?? 0) > 0)
  ), [availableBonuses, effectCounters])

  // Stats avec "garder le meilleur jet" : stat → { lancer, garder }
  const { statsAvantage, availableAvantages } = useMemo(() => {
    const map = new Map<string, { lancer: number; garder: number }>()
    const list: AvailableAvantage[] = []
    for (const voie of voiesPerso) {
      if (!voie.nom) continue
      const rangsDesc = descriptions[voie.nom]
      if (!rangsDesc) continue
      voie.rangs.forEach((unlocked, idx) => {
        if (!unlocked) return
        const rang = rangsDesc[idx]
        if (!rang?.grants) return
        for (const grant of rang.grants) {
          if (grant.type !== 'AVANTAGE') continue
          if (grant.avancee && !(voie.rangsAvances?.[idx])) continue
          if (grant.masqueSiAvancee && voie.rangsAvances?.[idx]) continue
          if ((grant.minRang ?? 1) > voie.rangs.filter(Boolean).length) continue
          const lancer = grant.lancer ?? 2
          const garder = grant.garder ?? 1
          map.set(grant.stat, { lancer, garder })
          list.push({ voieNom: voie.nom, rangIdx: idx, rangNom: rang.nom, stat: grant.stat, lancer, garder })
        }
      })
    }
    for (const { voieNom, rangIdx, rangData, avanceeAccordee } of rangsEmpruntes) {
      for (const grant of rangData.grants ?? []) {
        if (grant.type !== 'AVANTAGE' || (grant.avancee && !avanceeAccordee) || grant.minRang !== undefined) continue
        const lancer = grant.lancer ?? 2
        const garder = grant.garder ?? 1
        map.set(grant.stat, { lancer, garder })
        list.push({ voieNom, rangIdx, rangNom: rangData.nom, stat: grant.stat, lancer, garder })
      }
    }
    return { statsAvantage: map, availableAvantages: list }
  }, [voiesPerso, rangsEmpruntes, descriptions])

  const availableActions = useMemo<AvailableAction[]>(() => {
    const out: AvailableAction[] = []
    for (const voie of voiesPerso) {
      if (!voie.nom) continue
      const rangsDesc = descriptions[voie.nom]
      if (!rangsDesc) continue
      voie.rangs.forEach((unlocked, idx) => {
        if (!unlocked) return
        const rang = rangsDesc[idx]
        if (!rang?.grants) return
        const eligibles: Extract<Grant, { type: 'ACTION' }>[] = []
        for (const grant of rang.grants) {
          if (grant.type !== 'ACTION') continue
          if (grant.avancee && !(voie.rangsAvances?.[idx])) continue
          if (grant.masqueSiAvancee && voie.rangsAvances?.[idx]) continue
          if ((grant.minRang ?? 1) > voie.rangs.filter(Boolean).length) continue
          eligibles.push(grant)
        }
        // Une même capacité (label identique) peut monter en puissance avec le rang via plusieurs paliers
        // minRang successifs : ne garder que le palier le plus élevé actuellement atteint, pas tous à la fois.
        const meilleurParLabel = new Map<string, typeof eligibles[number]>()
        for (const grant of eligibles) {
          const actuel = meilleurParLabel.get(grant.label)
          if (!actuel || (grant.minRang ?? 1) > (actuel.minRang ?? 1)) meilleurParLabel.set(grant.label, grant)
        }
        for (const grant of meilleurParLabel.values()) {
          out.push({ voieNom: voie.nom, rangIdx: idx, rangNom: rang.nom, label: grant.label, de: grant.de, dm: grant.dm, attType: grant.attType, activable: grant.activable, cout_pm: grant.cout_pm })
        }
      })
    }
    for (const { voieNom, rangIdx, rangData, avanceeAccordee } of rangsEmpruntes) {
      for (const grant of rangData.grants ?? []) {
        if (grant.type !== 'ACTION' || (grant.avancee && !avanceeAccordee) || grant.minRang !== undefined) continue
        out.push({ voieNom, rangIdx, rangNom: rangData.nom, label: grant.label, de: grant.de, dm: grant.dm, attType: grant.attType, activable: grant.activable, cout_pm: grant.cout_pm })
      }
    }
    return out
  }, [voiesPerso, rangsEmpruntes, descriptions])

  // Effets de voie actifs par stat
  const effectsByStatMap = useMemo(() => {
    const map = new Map<string, { voieNom: string; rangIdx: number; rangNom: string; value?: number; formula?: string; diceStr?: string }[]>()
    for (const voie of voiesPerso) {
      if (!voie.nom) continue
      const rangsDesc = descriptions[voie.nom]
      if (!rangsDesc) continue
      voie.rangs.forEach((unlocked, idx) => {
        if (!unlocked) return
        const rang = rangsDesc[idx]
        if (!rang?.effects) return
        for (const eff of rang.effects) {
          if (!eff.stat) continue
          if (!map.has(eff.stat)) map.set(eff.stat, [])
          map.get(eff.stat)!.push({ voieNom: voie.nom, rangIdx: idx, rangNom: rang.nom, value: eff.value, formula: eff.formula, diceStr: eff.diceStr })
        }
      })
    }
    for (const { voieNom, rangIdx, rangData, avanceeAccordee } of rangsEmpruntes) {
      for (const eff of rangData.effects ?? []) {
        if (!eff.stat || (eff.avancee && !avanceeAccordee) || eff.minRang !== undefined) continue
        if (!map.has(eff.stat)) map.set(eff.stat, [])
        map.get(eff.stat)!.push({ voieNom, rangIdx, rangNom: rangData.nom, value: eff.value, formula: eff.formula, diceStr: eff.diceStr })
      }
    }
    for (const ab of availableBonuses) {
      if (ab.temporaire) continue
      for (const cible of ab.cibles) {
        if (!map.has(cible)) map.set(cible, [])
        map.get(cible)!.push({ voieNom: ab.voieNom, rangIdx: ab.rangIdx, rangNom: ab.rangNom, value: ab.bonus })
      }
    }
    return map
  }, [voiesPerso, rangsEmpruntes, descriptions, availableBonuses])

  const pushHistory = useCallback((entry: RollResult) => {
    setHistory(prev => [entry, ...prev].slice(0, 20))
    setResultInHistory(false)
  }, [])

  const pushResult = useCallback((entry: RollResult) => {
    setResult({ ...entry, flash: true })
    setHistory(prev => [entry, ...prev].slice(0, 20))
    setResultInHistory(true)
    setTimeout(() => setResult(prev => prev ? { ...prev, flash: false } : null), 300)
  }, [])

  const roll = useCallback((sides: number, label: string, modifier: number | null, stat?: string) => {
    const av = stat ? statsAvantage.get(stat) : undefined
    const nbLancer = av ? av.lancer : 1
    const nbGarder = av ? av.garder : 1

    const rolls = Array.from({ length: nbLancer }, () => Math.floor(Math.random() * sides) + 1)
    const sorted = [...rolls].sort((a, b) => b - a)
    const kept = sorted.slice(0, nbGarder)
    const r = kept.reduce((s, v) => s + v, 0)

    let boost: number | undefined
    let boostLabel: string | undefined
    // Un bonus ciblant "JET" s'applique au prochain jet de d20, quel qu'il soit (attaque, carac ou jet libre)
    const match = (stat ? activeBoosts.find(b => b.stat === stat) : undefined)
      ?? (sides === 20 ? activeBoosts.find(b => b.stat === 'JET') : undefined)
    if (match) {
      boost = match.bonus
      boostLabel = match.label
      setActiveBoosts(prev => prev.filter(b => b.id !== match.id))
    }
    const modStr = modifier !== null ? (modifier >= 0 ? `+${modifier}` : String(modifier)) : ''
    const boostStr = boost ? `+${boost}` : ''
    const formula = av ? `${nbLancer}d${sides}k${nbGarder}${modStr}${boostStr}` : `1d${sides}${modStr}${boostStr}`
    const total = (modifier !== null ? r + modifier : r) + (boost ?? 0)
    const rollDisplay = av ? `[${rolls.join(',')}]→${r}` : undefined
    pushResult({ label, formula, sides, roll: r, modifier, boost, boostLabel, total, stat, flash: false, rollDisplay })
  }, [activeBoosts, statsAvantage, pushResult])

  const rollDmFormula = (dm: string): { formula: string; total: number; display: string } => {
    const statValues: Record<string, number> = {
      FOR: character.caracteristiques['FOR']?.mod ?? 0,
      DEX: character.caracteristiques['DEX']?.mod ?? 0,
      CON: character.caracteristiques['CON']?.mod ?? 0,
      INT: character.caracteristiques['INT']?.mod ?? 0,
      SAG: character.caracteristiques['SAG']?.mod ?? 0,
      CHA: character.caracteristiques['CHA']?.mod ?? 0,
    }
    // Retire les crochets englobant toute la formule : [1d4+Mod.FOR] → 1d4+Mod.FOR
    let resolved = dm.trim()
    if (resolved.startsWith('[') && resolved.endsWith(']') && !resolved.slice(1, -1).includes('[')) {
      resolved = resolved.slice(1, -1)
    }
    // Remplace toutes les variantes de token stat : [Mod.FOR], [Mod. FOR], Mod.FOR, Mod. FOR
    let bonusMod = 0
    resolved = resolved.replace(/\[?Mod\.?\s*(FOR|DEX|CON|INT|SAG|CHA)\]?/gi, (_, stat) => {
      bonusMod += statValues[stat.toUpperCase()] ?? 0
      return ''
    })
    resolved = resolved.replace(/\s/g, '').replace(/[+-]+$/, '').replace(/^\+/, '')
    const diceMatch = resolved.match(/(\d*)d(\d+)/i)
    if (!diceMatch) {
      const flat = (parseInt(resolved) || 0) + bonusMod
      return { formula: dm, total: flat, display: String(flat) }
    }
    const nb = Math.max(1, parseInt(diceMatch[1] || '1'))
    const sides = parseInt(diceMatch[2])
    const rolls = Array.from({ length: nb }, () => Math.floor(Math.random() * sides) + 1)
    const diceTotal = rolls.reduce((s, v) => s + v, 0)
    const afterDice = resolved.replace(diceMatch[0], '').replace(/^\+/, '')
    const extraMod = afterDice ? (parseInt(afterDice) || 0) : 0
    const total = diceTotal + extraMod + bonusMod
    const totalMod = extraMod + bonusMod
    const modStr = totalMod !== 0 ? (totalMod > 0 ? `+${totalMod}` : String(totalMod)) : ''
    const display = nb > 1 ? `[${rolls.join('+')}]=${diceTotal}${modStr}` : `${diceTotal}${modStr}`
    return { formula: dm, total, display }
  }

  const handleActionAttaque = (action: AvailableAction) => {
    if (action.cout_pm) {
      const { formula, total: cost, display } = rollDmFormula(action.cout_pm)
      pushHistory({ label: `${action.label} — ${t('gameMode.sufCoutPm')}`, formula, sides: 6, roll: cost, modifier: null, total: cost, rollDisplay: display, costType: 'PM', flash: false })
      payPMCost(cost, action.label)
    }
    const mod = action.attType === 'contact' ? attaques.contact : action.attType === 'distance' ? attaques.distance : action.attType === 'magique' ? attaques.magique : null
    const statKey = action.attType === 'contact' ? 'ATT_CONTACT' : action.attType === 'distance' ? 'ATT_DISTANCE' : action.attType === 'magique' ? 'ATT_MAGIQUE' : undefined
    const r = Math.floor(Math.random() * action.de) + 1
    const total = mod !== null ? r + mod : r
    const modStr = mod !== null ? (mod >= 0 ? `+${mod}` : String(mod)) : ''
    pushResult({ label: `⚔️ ${action.label} — ${t('gameMode.sufAtt')}`, formula: `1d${action.de}${modStr}`, sides: action.de, roll: r, modifier: mod, total, stat: statKey, flash: false })
  }

  const handleActionDegats = (action: AvailableAction) => {
    const base = rollDmFormula(action.dm)
    let total = base.total
    const displayParts = [base.display]
    const formulaParts = [base.formula]
    const contributingEffects: ContributingEffect[] = []
    for (const ab of activeDeDegats) {
      if (ab.deDegatsParArme) continue
      const bonus = rollDmFormula(ab.deDegats!)
      total += bonus.total
      displayParts.push(`+ ${bonus.display} (${ab.label})`)
      formulaParts.push(ab.deDegats!)
      contributingEffects.push(ab.temporaire
        ? { rangNom: ab.rangNom, temporaire: true }
        : { rangNom: ab.rangNom, voieNom: ab.voieNom, rangIdx: ab.rangIdx })
    }
    pushResult({ label: `💥 ${action.label} — ${t('gameMode.sufDm')}`, formula: formulaParts.join(' + '), sides: 6, roll: total, modifier: null, total, rollDisplay: displayParts.join(' '), flash: false, contributingEffects })
  }

  const handleRollBonusDice = (ab: AvailableBonus) => {
    if (!ab.deDegats) return
    const { formula, total, display } = rollDmFormula(ab.deDegats)
    pushResult({ label: `💥 ${ab.label} — ${t('gameMode.sufDm')}`, formula, sides: 6, roll: total, modifier: null, total, rollDisplay: display, flash: false })
  }

  const stripExposants = (nom: string) => nom.replace(/[¹²³⁴⁵⁶⁷*]\s*/g, '').trim().toLowerCase()

  const findArmeEntry = (nomArme: string) => {
    const key = stripExposants(nomArme)
    for (const groupe of armes.groupes) {
      for (const cat of groupe.categories) {
        const entry = cat.entrees.find(e => stripExposants(e.nom) === key)
        if (entry) return entry
      }
    }
    return null
  }

  const getDeDegatsWeapon = (ab: AvailableBonus): string | undefined => {
    if (!ab.deDegatsParArme) return undefined
    const equipped = [character.arme1, character.arme2].filter(Boolean)
    if (equipped.length <= 1) return equipped[0]
    return deDegatsWeapon[boostKey(ab)]
  }

  const handleWeaponDegats = (nomArme: string, label: string, dmFallback: string) => {
    const entry = findArmeEntry(nomArme)
    const baseFormula = entry ? `${entry.dm} Mod.${entry.mod}` : dmFallback
    const base = rollDmFormula(baseFormula)
    let total = base.total
    const displayParts = [base.display]
    const formulaParts = [base.formula]
    const contributingEffects: ContributingEffect[] = []
    for (const ab of activeDeDegats) {
      if (ab.deDegatsParArme && getDeDegatsWeapon(ab) !== nomArme) continue
      const bonus = rollDmFormula(ab.deDegats!)
      total += bonus.total
      displayParts.push(`+ ${bonus.display} (${ab.label})`)
      formulaParts.push(ab.deDegats!)
      contributingEffects.push(ab.temporaire
        ? { rangNom: ab.rangNom, temporaire: true }
        : { rangNom: ab.rangNom, voieNom: ab.voieNom, rangIdx: ab.rangIdx })
    }
    pushResult({ label: `💥 ${label} — ${t('gameMode.sufDm')}`, formula: formulaParts.join(' + '), sides: 6, roll: total, modifier: null, total, rollDisplay: displayParts.join(' '), flash: false, contributingEffects })
  }

  const activateDuration = (ab: AvailableBonus, key: string) => {
    if (!ab.usage) return
    const { formula, total: duration, display } = rollDmFormula(ab.usage)
    if (/\d*d\d+/i.test(ab.usage)) {
      pushHistory({ label: `${ab.label} — ${t('gameMode.sufDuree')}`, formula, sides: 6, roll: duration, modifier: null, total: duration, rollDisplay: display, flash: false })
    }
    if (duration > 0) setEffectCounters(prev => ({ ...prev, [key]: duration }))
  }

  const handleActivateClick = (ab: AvailableBonus, idx: number) => {
    const key = boostKey(ab)
    if (ab.cout_pv) {
      const cost = rollDiceStr(ab.cout_pv)
      const m = ab.cout_pv.match(/^(\d*)d(\d+)$/i)
      const sides = m ? parseInt(m[2]) : 4
      const entry: RollResult = { label: `${ab.label} — ${t('gameMode.sufCoutPv')}`, formula: ab.cout_pv, sides, roll: cost, modifier: null, total: cost, costType: 'PV', flash: false }
      if (ab.post_jet) {
        // Ne pas écraser le résultat principal, ajouter uniquement à l'historique
        pushHistory(entry)
      } else {
        pushResult(entry)
      }
      applyPVLoss(clampPvLoss(pvActuels - cost))
    }
    if (ab.cout_pm) {
      const { formula, total: cost, display } = rollDmFormula(ab.cout_pm)
      const entry: RollResult = { label: `${ab.label} — ${t('gameMode.sufCoutPm')}`, formula, sides: 6, roll: cost, modifier: null, total: cost, rollDisplay: display, costType: 'PM', flash: false }
      if (ab.post_jet) {
        pushHistory(entry)
      } else {
        pushResult(entry)
      }
      payPMCost(cost, ab.label)
    }
    activateDuration(ab, key)
    if (ab.coutCaracStat && ab.coutCaracValeur) {
      setActiveBoosts(prev => [
        ...prev,
        { id: nextId++, stat: ab.coutCaracStat!, bonus: -ab.coutCaracValeur!, label: `${ab.label} — ${t('gameMode.sufCout')}`, post_jet: false, sourceKey: key, nom: ab.rangNom, rang: ab.rangIdx + 1 },
      ])
    }
    if (ab.deDegats) {
      const equipped = [character.arme1, character.arme2].filter(Boolean)
      if (equipped.length === 1) setDeDegatsWeapon(prev => ({ ...prev, [key]: equipped[0] }))
    }
    if (ab.choix) {
      setPendingStatPick({ abIdx: idx })
    } else if (!ab.deDegats) {
      setActiveBoosts(prev => [
        ...prev,
        ...ab.cibles.map(s => ({ id: nextId++, stat: s, bonus: ab.bonus, label: ab.label, post_jet: ab.post_jet ?? false, cout_pv: ab.cout_pv, sourceKey: key, div2: ab.div2, immunite: ab.immunite, nom: ab.rangNom, rang: ab.rangIdx + 1 })),
      ])
    }
  }

  const handleStatPick = (ab: AvailableBonus, stat: string) => {
    setPendingStatPick(null)
    const key = boostKey(ab)
    setActiveBoosts(prev => [...prev, { id: nextId++, stat, bonus: ab.bonus, label: ab.label, post_jet: ab.post_jet ?? false, cout_pv: ab.cout_pv, sourceKey: key, div2: ab.div2, immunite: ab.immunite, nom: ab.rangNom, rang: ab.rangIdx + 1 }])
  }

  const applyPostJetBoost = useCallback((boost: ActiveBoost) => {
    setActiveBoosts(prev => prev.filter(b => b.id !== boost.id))
    setResult(prev => {
      if (!prev) return null
      const newTotal = prev.total + boost.bonus
      return { ...prev, boost: (prev.boost ?? 0) + boost.bonus, boostLabel: boost.label, total: newTotal }
    })
  }, [])

  const attaques = useMemo(() => computeAttaquesTotaux(character, descriptions, armes, armures), [character, descriptions, armes, armures])
  const effectsAll = useMemo(() => computeEffectsWithCristaux(character, descriptions), [character, descriptions])

  const panelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', background: BG }

  const btnStyle = (active?: boolean): React.CSSProperties => ({
    padding: '6px 10px', borderRadius: 4, fontSize: 14, cursor: 'pointer', fontWeight: 600,
    border: `1px solid ${active ? GOLD : 'rgba(201,168,76,0.35)'}`,
    background: active ? 'rgba(201,168,76,0.15)' : 'rgba(0,0,0,0.3)',
    color: active ? GOLD : `rgba(245,236,215,0.7)`,
    textAlign: 'center' as const, whiteSpace: 'nowrap' as const,
  })

  // Tooltip au même design que celui de la fiche de personnage (fond sombre, bordure dorée), positionné
  // au-dessus de l'élément survolé plutôt que via le tooltip natif du navigateur — sauf si l'élément est trop
  // proche du haut de la fenêtre (ex. pastilles de dégâts sur la durée sur la carte PV), auquel cas on bascule
  // l'affichage en dessous pour éviter qu'il soit tronqué.
  const showGmTooltip = (e: React.MouseEvent, title: string, desc?: string) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const below = rect.top < 80
    setGmTooltip({ title, desc, x: rect.left + rect.width / 2, y: below ? rect.bottom : rect.top, below })
  }
  const hideGmTooltip = () => setGmTooltip(null)

  // Sur mobile/tactile, le tap déclenche onMouseEnter (affiche le tooltip) mais jamais onMouseLeave
  // (pas de vrai pointeur qui "quitte" l'élément), donc le tooltip reste bloqué à l'écran après l'action.
  useEffect(() => {
    document.addEventListener('touchend', hideGmTooltip)
    return () => document.removeEventListener('touchend', hideGmTooltip)
  }, [])

  const pvFromVoies = sumStat(effectsAll['PV'] ?? [])
  // Réplique le calcul de la fiche de personnage (CharacterSheetRecto) : base niveau 1 (snapshot ou dé de vie + Mod.CON) + historique de montées de niveau
  const deVieFaces = character.famille === 'combattants' ? 10 : character.famille === 'aventuriers' ? 8 : 6
  let pvBase = character.niveau1Base ? character.niveau1Base.pvTotal : deVieFaces + character.caracteristiques.CON.mod
  for (const e of character.pvHistorique ?? []) pvBase += e.total
  const pvTotalEffectif = pvBase + pvFromVoies
  // Mod. effectif d'une carac (base + bonus de voies/cristaux)
  const effectiveMod = (stat: Caracteristique): number => {
    const bonus = sumStat(effectsAll[stat] ?? [])
    return bonus === 0 ? character.caracteristiques[stat].mod : getMod(character.caracteristiques[stat].valeur + bonus)
  }
  // Détail des sources qui contribuent au score/mod affiché sur les boutons de Caractéristiques (pour le tooltip) :
  // les bonus de score permanents (Effects, ajoutés avant conversion en mod) et les bonus permanents de Mod (Bonus temporaire non-temporaire).
  const modSourcesPourStat = (stat: string): { nom: string; rang: number; value: number }[] => {
    const sources: { nom: string; rang: number; value: number }[] = []
    for (const c of effectsAll[stat] ?? []) sources.push({ nom: c.nom, rang: c.rang, value: c.value })
    for (const ab of availableBonuses) {
      if (ab.temporaire || !ab.cibles.includes(stat)) continue
      sources.push({ nom: ab.rangNom, rang: ab.rangIdx + 1, value: ab.bonus })
    }
    return sources
  }
  const pmFromVoies = sumStat(effectsAll['PM'] ?? [])
  // PM = Niveau + Mod.SAG (doublé pour les mystiques), recalculé en direct plutôt que de se fier à character.pm figé
  const pmBaseNiveau = character.niveau + effectiveMod('SAG')
  const pmNiveau = Math.max(0, character.famille === 'mystiques' ? 2 * pmBaseNiveau : pmBaseNiveau)
  const pmTotalEffectif = pmNiveau + pmFromVoies
  // Réduction des dégâts (RD) accordée par certaines voies — appliquée automatiquement sur les DM encaissés.
  // Additionne la RD permanente (Effects) et la RD des bonus temporaires actuellement activés (Effets en jeu),
  // tant que leur compteur de tours n'est pas retombé à 0 — pas seulement "au prochain jet". On garde le détail
  // (nom de la capacité + rang + éventuels flags "div2"/"immunite") pour pouvoir l'expliquer dans le tooltip.
  // Note : les bonus temporaires (choix ou non) finissent tous dans activeBoosts (cf. handleActivateClick /
  // handleStatPick) — ne parcourir que ce tableau évite de compter deux fois la même activation.
  type RdSource = { nom: string; rang: number; value: number; div2?: boolean; immunite?: boolean }
  const rdSourcesPourStat = (statKey: string): RdSource[] => {
    const sources: RdSource[] = []
    for (const c of effectsAll[statKey] ?? []) sources.push({ nom: c.nom, rang: c.rang, value: c.value, div2: c.div2, immunite: c.immunite })
    for (const boost of activeBoosts) {
      if (boost.stat !== statKey || !boost.sourceKey) continue
      // Un compteur absent (pas de "usage" renseigné sur le grant) signifie "actif tant qu'il n'est pas retiré
      // manuellement", pas "expiré" — ne l'exclure que si un compteur existe ET est retombé à 0.
      const compteur = effectCounters[boost.sourceKey]
      if (compteur !== undefined && compteur <= 0) continue
      sources.push({ nom: boost.nom, rang: boost.rang, value: boost.bonus, div2: boost.div2, immunite: boost.immunite })
    }
    return sources
  }
  // RD générique (s'applique à tous les types) + RD spécifique au type de dégâts, si renseigné
  const combinedRdSourcesPourType = (typeKey: string) => [...rdSourcesPourStat('RD'), ...(typeKey ? rdSourcesPourStat(`RD_${typeKey}`) : [])]
  const rdEffectifPourType = (typeKey: string): number => combinedRdSourcesPourType(typeKey).filter(s => !s.div2 && !s.immunite).reduce((s, c) => s + c.value, 0)
  const rdSourcesPourType = (typeKey: string) => combinedRdSourcesPourType(typeKey).filter(s => !s.div2 && !s.immunite)
  // Une source RD/RD_<TYPE> peut être marquée "div2" (résistance) : elle divise par 2 les DM au lieu de les
  // réduire à points fixes. Ne se cumule pas (une seule division, peu importe le nombre de sources actives)
  // et s'applique avant la RD à points fixes.
  const halfDamageSourcesPourType = (typeKey: string) => combinedRdSourcesPourType(typeKey).filter(s => s.div2 && !s.immunite)
  const isHalfDamage = (typeKey: string): boolean => halfDamageSourcesPourType(typeKey).length > 0
  // Une source marquée "immunite" ramène les DM correspondants à 0, prioritaire sur div2 et la RD à points fixes
  const immuniteSourcesPourType = (typeKey: string) => combinedRdSourcesPourType(typeKey).filter(s => s.immunite)
  const isImmune = (typeKey: string): boolean => immuniteSourcesPourType(typeKey).length > 0
  // DEF effective, live comme sur la fiche (10 + Mod.DEX + armure + bouclier + bonus manuel), mais en tenant compte
  // en plus des bonus temporaires actuellement actifs (Effets en jeu) — pas juste des effets permanents.
  const isBouclier = (nom: string) => nom.toLowerCase().includes('bouclier')
  const armorDef = character.armuresEquipees.filter(a => !isBouclier(a.nom) && a.equipe).reduce((s, a) => s + a.def, 0)
  const shieldDef = character.armuresEquipees.filter(a => isBouclier(a.nom) && a.equipe).reduce((s, a) => s + a.def, 0)
  const defSourcesTemporaireEtEffects = rdSourcesPourStat('DEF')
  const defBonusVoies = defSourcesTemporaireEtEffects.reduce((s, c) => s + c.value, 0) + (permanentBonusByStat.get('DEF') ?? 0)
  const defTotalEffectif = 10 + effectiveMod('DEX') + armorDef + shieldDef + (character.bonusDefense ?? 0) + defBonusVoies
  const defSources = [
    ...defSourcesTemporaireEtEffects,
    ...availableBonuses.filter(ab => !ab.temporaire && ab.cibles.includes('DEF')).map(ab => ({ nom: ab.rangNom, rang: ab.rangIdx + 1, value: ab.bonus })),
  ]
  // currentPV/currentPM sont null au premier render → on initialise au max effectif
  const pvActuels = currentPV ?? pvTotalEffectif
  const pvPct = pvTotalEffectif > 0 ? pvActuels / pvTotalEffectif : 0
  const pvColor = pvPct > 0.5 ? '#5cb85c' : pvPct > 0.25 ? '#e8a838' : '#d9534f'
  // Voie culturelle des Ogres rang 4 "Intuable" : possibilité de résister à l'inconscience à 0 PV
  const hasOgreResilience = character.voieCulturelle.nom === 'Voie culturelle des Ogres' && character.voieCulturelle.rangs[3] === true
  const conValeur = character.caracteristiques.CON.valeur
  const isResisting = hasOgreResilience && ogreResisting
  const isDead = isResisting && pvActuels <= -conValeur
  const isUnconscious = isDead || (pvActuels <= 0 && !isResisting)
  const isPvFull = pvActuels >= pvTotalEffectif
  const pmActuels = currentPM ?? pmTotalEffectif
  // Sous 0 PV, un PJ "Intuable" ne peut pas descendre plus bas que -CON (au-delà, il meurt)
  const clampPvLoss = (newPV: number) => isResisting ? Math.max(-conValeur, newPV) : Math.max(0, newPV)

  // Paie un coût en PM ; si les PM sont insuffisants, la différence est infligée en PV (brûlure de mana)
  // Applique une nouvelle valeur de PV et journalise le passage à l'inconscience (PV à 0) ou à la mort (Intuable)
  const applyPVLoss = (newPV: number) => {
    const wasConscious = pvActuels > 0
    const wasAlive = !isDead
    setCurrentPV(newPV)
    onChange({ pvRestants: newPV })
    if (wasAlive && isResisting && newPV <= -conValeur) {
      pushHistory({ label: t('gameMode.deathHistoryLabel'), formula: t('gameMode.pvZero'), sides: 6, roll: 0, modifier: null, total: 0, costType: 'PV', flash: false })
    } else if (wasConscious && newPV <= 0 && !isResisting) {
      pushHistory({ label: t('gameMode.unconsciousHistoryLabel'), formula: t('gameMode.pvZero'), sides: 6, roll: 0, modifier: null, total: 0, costType: 'PV', flash: false })
    }
  }

  // Applique un soin : augmente les PV (jamais au-delà du max) ; bloqué sous 0 PV sauf via la Récupération (1 PR),
  // et impossible sur un PJ mort (Intuable au-delà de -CON)
  const applyHeal = (amount: number, label: string, formula?: string, rollDisplay?: string, costType: 'PV' | 'PR' = 'PV') => {
    if (!Number.isFinite(amount) || amount <= 0) return
    if (isDead) return
    if (pvActuels < 0 && costType !== 'PR') return
    const newPV = Math.min(pvTotalEffectif, pvActuels + amount)
    const healed = newPV - pvActuels
    setCurrentPV(newPV)
    onChange({ pvRestants: newPV })
    if (newPV > 0) setOgreResisting(false)
    pushHistory({ label, formula: formula ?? `+${healed} ${t('gameMode.pv')}`, sides: 6, roll: healed, modifier: null, total: healed, costType, rollDisplay, flash: false })
  }

  const handleManualHeal = () => {
    const amount = parseInt(healInput, 10)
    applyHeal(amount, t('gameMode.healHistoryLabel'))
    setHealInput('')
  }

  // 1 PR dépensé = [1 dé de vie + Mod.CON + Niveau] PV récupérés (indisponible si inconscient)
  // prUtilises[idx] === true signifie que le PR est disponible (non dépensé) — cf. CreationWizard qui
  // initialise `Array(pr).fill(true)` pour un personnage neuf, donc "PR à fond" = tout à true.
  const prMax = character.pr || 5
  const prUtilisesActuels = character.prUtilises ?? []
  const prRemaining = prUtilisesActuels.slice(0, prMax).filter(Boolean).length

  const handleRecuperation = () => {
    if (isUnconscious || prRemaining <= 0) return
    const idx = prUtilisesActuels.findIndex((available, i) => i < prMax && available)
    if (idx === -1) return
    const next = [...prUtilisesActuels]
    next[idx] = false
    onChange({ prUtilises: next })
    const dieRoll = Math.floor(Math.random() * deVieFaces) + 1
    const conMod = effectiveMod('CON')
    const total = Math.max(0, dieRoll + conMod + character.niveau)
    const modStr = conMod >= 0 ? `+${conMod}` : `${conMod}`
    applyHeal(total, t('gameMode.recuperationHistoryLabel'), `1d${deVieFaces}${modStr}+${character.niveau}`, `[${dieRoll}]`, 'PR')
  }

  // Applique des DM reçus du type choisi : immunité totale en priorité, sinon division par 2 si applicable,
  // puis déduction de la RD (générique + spécifique au type) avant de retirer les PV. Factorisé pour être
  // réutilisé aussi bien par la saisie manuelle (handleTakeDamage) que par le tic automatique des dégâts sur
  // la durée (handleEndTurn), qui doivent appliquer exactement la même résolution RD/div2/immunité.
  const computeIncomingDamage = (type: string, amount: number) => {
    if (isImmune(type)) return { net: 0, apresDivision: amount, halved: false, rd: 0, immune: true }
    const halved = isHalfDamage(type)
    const apresDivision = halved ? Math.floor(amount / 2) : amount
    const rd = rdEffectifPourType(type)
    const net = Math.max(0, apresDivision - rd)
    return { net, apresDivision, halved, rd, immune: false }
  }
  const formatDamageFormula = (amount: number, calc: ReturnType<typeof computeIncomingDamage>) => {
    if (calc.immune) return `${amount} ${t('gameMode.sufImmunite')}`
    const parts = [String(amount)]
    if (calc.halved) parts.push(`÷2 = ${calc.apresDivision}`)
    if (calc.rd > 0) parts.push(`− ${calc.rd} ${t('gameMode.sufRD')}`)
    return parts.length > 1 ? parts.join(' ') : `${amount} ${t('gameMode.pv')}`
  }

  const handleTakeDamage = (type: string) => {
    const amount = parseInt(dmInput, 10)
    if (!Number.isFinite(amount) || amount <= 0) return
    const label = type ? `${t('gameMode.damageTakenHistoryLabel')} (${t(`gameMode.dmType${type}`)})` : t('gameMode.damageTakenHistoryLabel')
    const calc = computeIncomingDamage(type, amount)
    pushHistory({ label, formula: formatDamageFormula(amount, calc), sides: 6, roll: calc.net, modifier: null, total: calc.net, costType: 'PV', flash: false })
    if (!calc.immune) applyPVLoss(clampPvLoss(pvActuels - calc.net))
    setDmInput('')
  }

  // Enregistre un effet de dégâts sur la durée (poison, brûlure, ...) : X dégâts du type choisi, encaissés
  // automatiquement à chaque fin de tour (handleEndTurn) pendant N tours, puis retiré de lui-même.
  const handleAddDot = () => {
    const amount = parseInt(dotAmountInput, 10)
    const duration = parseInt(dotDurationInput, 10)
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(duration) || duration <= 0) return
    const type = dotTypeInput
    const typeLabel = type ? t(`gameMode.dmType${type}`) : t('gameMode.dmTypeGenerique')
    const label = `${t('gameMode.dotTickHistoryLabel')} (${typeLabel})`
    setActiveDots(prev => [...prev, { id: nextId++, type, amount, remainingTurns: duration, label }])
    pushHistory({
      label: t('gameMode.dotAddedHistoryLabel', { type: typeLabel }),
      formula: `${amount} ${t('gameMode.pv')} / ${t('gameMode.turn', { count: duration })}`,
      sides: 6, roll: 0, modifier: null, total: 0, flash: false,
    })
    setDotAmountInput('')
    setDotDurationInput('')
  }

  // Décompte les tours d'effets temporaires (Effets en jeu) ET applique le tic de chaque dégât sur la durée
  // actif (immunité/div2/RD résolus comme pour un dégât encaissé manuellement), en une seule perte de PV
  // groupée pour rester cohérent même avec plusieurs DoT actifs simultanément (poison + brûlure, etc.).
  const handleEndTurn = () => {
    setEffectCounters(prev => {
      const next: Record<string, number> = {}
      const expiredKeys: string[] = []
      for (const [key, val] of Object.entries(prev)) {
        const newVal = Math.max(0, val - 1)
        next[key] = newVal
        if (val > 0 && newVal === 0) expiredKeys.push(key)
      }
      if (expiredKeys.length > 0) {
        setActiveBoosts(prevBoosts => prevBoosts.filter(b => !b.sourceKey || !expiredKeys.includes(b.sourceKey)))
      }
      return next
    })
    if (!isDead && activeDots.length > 0) {
      let totalNet = 0
      for (const dot of activeDots) {
        const calc = computeIncomingDamage(dot.type, dot.amount)
        pushHistory({ label: dot.label, formula: formatDamageFormula(dot.amount, calc), sides: 6, roll: calc.net, modifier: null, total: calc.net, costType: 'PV', flash: false })
        totalNet += calc.net
      }
      if (totalNet > 0) applyPVLoss(clampPvLoss(pvActuels - totalNet))
    }
    setActiveDots(prev => prev
      .map(d => ({ ...d, remainingTurns: d.remainingTurns - 1 }))
      .filter(d => d.remainingTurns > 0))
  }

  const payPMCost = (cost: number, label: string) => {
    const pmSpent = Math.min(cost, pmActuels)
    const deficit = cost - pmSpent
    const newPM = pmActuels - pmSpent
    setCurrentPM(newPM)
    onChange({ pmRestants: newPM })
    if (deficit > 0) {
      pushHistory({ label: `${label} — ${t('gameMode.sufBruleMana')}`, formula: `${deficit} ${t('gameMode.pv')}`, sides: 6, roll: deficit, modifier: null, total: deficit, costType: 'PV', flash: false })
      applyPVLoss(clampPvLoss(pvActuels - deficit))
    }
  }

  const parseFlatCost = (cost: string): number | null => {
    const n = Number(cost)
    return Number.isFinite(n) ? n : null
  }

  const formatUsage = (usage: string) => {
    const n = Number(usage)
    return Number.isFinite(n) && usage.trim() !== '' ? t('gameMode.turn', { count: n }) : usage
  }

  const formatFormula = (formula: string) => `Mod.${formula.replace(/^MOD_/, '')}`
  // Pour un bonus RD/RD_<TYPE> marqué "immunite" ou "div2", il n'y a pas de valeur chiffrée à afficher (le +0 par
  // défaut n'a aucun sens) — on affiche plutôt ce que l'activation représente concrètement.
  const formatBonusLabel = (ab: AvailableBonus) => {
    if (ab.immunite) return t('gameMode.sufImmunite')
    if (ab.div2) return t('gameMode.sufDiv2')
    const signedBonus = `${ab.bonus >= 0 ? '+' : ''}${ab.bonus}`
    return ab.formula ? `${formatFormula(ab.formula)} (${signedBonus})` : signedBonus
  }

  const postJetBoosts = result?.stat ? activeBoosts.filter(b => b.stat === result.stat && b.post_jet) : []

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: `1px solid ${SECTION_BORDER}`, flexShrink: 0, gap: 8 }}>
        <span style={{ fontSize: 17, fontWeight: 700, color: GOLD, flex: 1, fontFamily: "'Cinzel', serif" }}>{t('gameMode.title')}</span>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: `rgba(245,236,215,0.5)`, cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 4px' }}>✕</button>
      </div>

      {/* Barre PV / PM */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 14px', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <div onClick={() => { setCurrentPV(pvTotalEffectif); onChange({ pvRestants: pvTotalEffectif }) }}
            title={t('gameMode.clickToFull')}
            style={{ position: 'relative', cursor: 'pointer', width: 130, height: 130, boxSizing: 'border-box', borderRadius: 10, border: `1px solid ${GOLD}`, background: 'linear-gradient(to right, rgba(74,222,128,0.28), transparent 10%, transparent 90%, rgba(74,222,128,0.28)), linear-gradient(to bottom, rgba(74,222,128,0.28), transparent 10%, transparent 90%, rgba(74,222,128,0.28)), rgba(0,0,0,0.4)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-evenly', width: '100%', height: '100%' }}>
              <span style={{ fontSize: 11, color: 'rgba(245,236,215,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('gameMode.pvCardTitle')}</span>
              <span style={{ fontSize: 24 }}>❤️</span>
              <span style={{ fontSize: 20, fontWeight: 700, color: pvColor }}>{pvActuels} / {pvTotalEffectif}</span>
            </div>
            {activeDots.map((d, i) => (
              <span
                key={d.id}
                onMouseEnter={e => { e.stopPropagation(); showGmTooltip(e, t('gameMode.dotBadgeTitle'), `${DAMAGE_TYPE_ICONS[d.type]} ${d.amount} ${t('gameMode.pv')} · ${t('gameMode.turn', { count: d.remainingTurns })}`) }}
                onMouseLeave={hideGmTooltip}
                onClick={e => e.stopPropagation()}
                style={{
                  position: 'absolute', top: -8 + i * 20, right: -13, width: 26, height: 26, borderRadius: '50%',
                  zIndex: i + 1,
                  background: BG, border: `2px solid ${GOLD}`, boxShadow: '0 2px 5px rgba(0,0,0,0.6)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, cursor: 'help',
                }}
              >
                {DAMAGE_TYPE_ICONS[d.type]}
              </span>
            ))}
          </div>
          {pmTotalEffectif > 0 && (
            <div onClick={() => { setCurrentPM(pmTotalEffectif); onChange({ pmRestants: pmTotalEffectif }) }}
              title={t('gameMode.clickToFull')}
              style={{ cursor: 'pointer', width: 130, height: 130, boxSizing: 'border-box', borderRadius: 10, border: `1px solid ${GOLD}`, background: 'linear-gradient(to right, rgba(123,170,232,0.28), transparent 10%, transparent 90%, rgba(123,170,232,0.28)), linear-gradient(to bottom, rgba(123,170,232,0.28), transparent 10%, transparent 90%, rgba(123,170,232,0.28)), rgba(0,0,0,0.4)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-evenly', width: '100%', height: '100%' }}>
                <span style={{ fontSize: 11, color: 'rgba(245,236,215,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('gameMode.pmCardTitle')}</span>
                <span style={{ fontSize: 24 }}>✨</span>
                <span style={{ fontSize: 20, fontWeight: 700, color: '#7baae8' }}>{pmActuels} / {pmTotalEffectif}</span>
              </div>
            </div>
          )}
        </div>
        <div style={{ textAlign: 'center', fontSize: 11, color: 'rgba(245,236,215,0.3)' }}>{t('gameMode.clickCardToFull')}</div>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <span
            onMouseEnter={e => showGmTooltip(e, t('gameMode.defCardTitle'), defSources.map(s => t('gameMode.bonusSourceLine', { nom: s.nom, rang: s.rang, value: s.value })).join('\n') || undefined)}
            onMouseLeave={hideGmTooltip}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 700, color: GOLD, background: 'rgba(201,168,76,0.1)', border: `1px solid ${GOLD}`, borderRadius: 12, padding: '3px 12px', cursor: 'help' }}
          >
            🛡️ {t('gameMode.defCardTitle')} {defTotalEffectif}
          </span>
        </div>
        {activeBoosts.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
            {activeBoosts.map(b => (
              <span key={b.id} style={{ fontSize: 11, background: 'rgba(201,168,76,0.15)', border: `1px solid rgba(201,168,76,0.4)`, borderRadius: 3, padding: '1px 5px', color: GOLD }}>
                {b.bonus >= 0 ? '+' : ''}{b.bonus} {b.stat}{b.post_jet ? ` (${t('gameMode.afterParen')})` : ''}
                <button onClick={() => setActiveBoosts(prev => prev.filter(x => x.id !== b.id))} style={{ background: 'none', border: 'none', color: 'rgba(245,236,215,0.4)', cursor: 'pointer', padding: '0 0 0 3px', fontSize: 10, lineHeight: 1 }}>✕</button>
              </span>
            ))}
          </div>
        )}
        <button onClick={handleEndTurn} style={{
          alignSelf: 'center', padding: '6px 12px', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0,
          borderRadius: 4, cursor: 'pointer', border: `1px solid ${GOLD}`,
          background: GOLD, color: BG,
        }}>
          {t('gameMode.endTurn')}
        </button>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {isDead ? (
          <div style={{ padding: '10px 12px', borderRadius: 6, background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(220,50,50,0.5)', textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#ff5555', letterSpacing: '0.05em' }}>{t('gameMode.deathTitle')}</div>
            <div style={{ fontSize: 12, color: 'rgba(245,236,215,0.5)', marginTop: 2 }}>{t('gameMode.deathDesc', { con: conValeur })}</div>
          </div>
        ) : isUnconscious ? (
          <div style={{ padding: '10px 12px', borderRadius: 6, background: 'rgba(180,30,30,0.15)', border: '1px solid rgba(220,50,50,0.5)', textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#ff5555', letterSpacing: '0.05em' }}>{t('gameMode.unconsciousTitle')}</div>
            <div style={{ fontSize: 12, color: 'rgba(245,236,215,0.5)', marginTop: 2 }}>{t('gameMode.unconsciousDesc')}</div>
            {hasOgreResilience && pvActuels <= 0 && (
              <button onClick={() => setOgreResisting(true)} style={{ ...btnStyle(), marginTop: 8, border: '1px solid rgba(220,50,50,0.6)', color: 'rgba(255,150,150,0.95)' }}>
                {t('gameMode.ogreResistButton')}
              </button>
            )}
          </div>
        ) : isResisting && pvActuels <= 0 && (
          <div style={{ padding: '10px 12px', borderRadius: 6, background: 'rgba(180,30,30,0.1)', border: '1px solid rgba(220,50,50,0.35)', textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#ff8888', letterSpacing: '0.05em' }}>{t('gameMode.ogreResistingTitle')}</div>
            <div style={{ fontSize: 12, color: 'rgba(245,236,215,0.5)', marginTop: 2 }}>{t('gameMode.ogreResistingDesc', { con: conValeur })}</div>
          </div>
        )}

        {/* ── Section : Soins ── */}
        <div style={SECTION_DIVIDER}>
          <div style={{ fontSize: 13, color: `rgba(201,168,76,0.85)`, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{t('gameMode.healSection')}</div>
          {pvActuels < 0 && !isDead && (
            <div style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,150,150,0.7)', marginBottom: 6 }}>{t('gameMode.ogreNoFreeHeal')}</div>
          )}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                type="number"
                min={1}
                value={healInput}
                onChange={e => setHealInput(e.target.value)}
                placeholder={t('gameMode.healPlaceholder')}
                disabled={isPvFull || pvActuels < 0 || isDead}
                style={{ width: 100, flexShrink: 0, boxSizing: 'border-box', padding: '6px 8px', borderRadius: 4, fontSize: 14, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(201,168,76,0.35)', color: PARCHMENT, outline: 'none', opacity: (isPvFull || pvActuels < 0 || isDead) ? 0.35 : 1 }}
              />
              <button onClick={handleManualHeal} disabled={isPvFull || pvActuels < 0 || isDead} style={{ ...btnStyle(), flexShrink: 0, opacity: (isPvFull || pvActuels < 0 || isDead) ? 0.35 : 1, cursor: (isPvFull || pvActuels < 0 || isDead) ? 'not-allowed' : 'pointer' }}>❤️ {t('gameMode.healButton')}</button>
            </div>
            <div style={{ width: 1, alignSelf: 'stretch', background: SECTION_BORDER }} />
            <button
              onClick={handleRecuperation}
              disabled={isUnconscious || prRemaining <= 0 || isPvFull}
              title={prRemaining > 0 ? t('gameMode.recuperationLabel', { count: prRemaining }) : t('gameMode.recuperationNone')}
              style={{ ...btnStyle(), flexShrink: 0, opacity: (isUnconscious || prRemaining <= 0 || isPvFull) ? 0.35 : 1, cursor: (isUnconscious || prRemaining <= 0 || isPvFull) ? 'not-allowed' : 'pointer' }}
            >
              🩹 {t('gameMode.recuperationButton')} ({prRemaining})
            </button>
          </div>
        </div>

        {/* ── Section : Dégâts subis ── */}
        <div style={SECTION_DIVIDER}>
          <div style={{ fontSize: 13, color: `rgba(201,168,76,0.85)`, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{t('gameMode.damageTakenSection')}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'flex-start', justifyContent: 'center' }}>
            <input
              type="number"
              min={1}
              value={dmInput}
              onChange={e => setDmInput(e.target.value)}
              placeholder={t('gameMode.damageTakenPlaceholder')}
              style={{ width: 100, height: 48, flexShrink: 0, boxSizing: 'border-box', padding: '6px 8px', borderRadius: 4, fontSize: 14, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(201,168,76,0.35)', color: PARCHMENT, outline: 'none' }}
            />
            {(() => {
              const amount = parseInt(dmInput, 10)
              const amountValide = Number.isFinite(amount) && amount > 0
              return (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {['', ...DAMAGE_TYPES].map(type => {
                    const immune = isImmune(type)
                    const rd = rdEffectifPourType(type)
                    const halved = isHalfDamage(type)
                    const label = type ? t(`gameMode.dmType${type}`) : t('gameMode.dmTypeGenerique')
                    const rdDesc = rd > 0
                      ? rdSourcesPourType(type).map(s => t('gameMode.bonusSourceLine', { nom: s.nom, rang: s.rang, value: s.value })).join('\n')
                      : undefined
                    const halfDesc = halved
                      ? halfDamageSourcesPourType(type).map(s => t('gameMode.halfDamageSourceLine', { nom: s.nom, rang: s.rang })).join('\n')
                      : undefined
                    const immuniteDesc = immune
                      ? immuniteSourcesPourType(type).map(s => t('gameMode.immuniteSourceLine', { nom: s.nom, rang: s.rang })).join('\n')
                      : undefined
                    const hintParts = immune
                      ? [t('gameMode.sufImmunite')]
                      : [halved ? t('gameMode.sufDiv2') : null, rd > 0 ? `${rd} ${t('gameMode.sufRD')}` : null].filter(Boolean)
                    const hintDesc = immune ? immuniteDesc : [halfDesc, rdDesc].filter(Boolean).join('\n')
                    return (
                      <div key={type || 'GENERIQUE'} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                        <button
                          disabled={!amountValide}
                          onClick={() => handleTakeDamage(type)}
                          onMouseEnter={e => showGmTooltip(e, label)}
                          onMouseLeave={hideGmTooltip}
                          style={{
                            ...btnStyle(),
                            border: immune ? `1px solid ${GOLD}` : btnStyle().border,
                            width: 48, height: 48, boxSizing: 'border-box', padding: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 22, opacity: amountValide ? 1 : 0.35, cursor: amountValide ? 'pointer' : 'not-allowed',
                          }}
                        >
                          {DAMAGE_TYPE_ICONS[type]}
                        </button>
                        <span
                          onMouseEnter={hintParts.length > 0 ? e => showGmTooltip(e, label, hintDesc) : undefined}
                          onMouseLeave={hintParts.length > 0 ? hideGmTooltip : undefined}
                          style={{ fontSize: 13, color: immune ? GOLD : 'rgba(245,236,215,0.45)', height: 16, lineHeight: '16px', cursor: hintParts.length > 0 ? 'help' : 'default' }}
                        >
                          {hintParts.length > 0 ? hintParts.join(' · ') : ' '}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>

          {/* Dégâts sur la durée (poison, brûlure, ...) : encaissés automatiquement à chaque fin de tour
              (RD/div2/immunité du type résolus à chaque tic, comme pour un dégât encaissé manuellement) */}
          <div style={{ fontSize: 11, color: 'rgba(245,236,215,0.35)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 12, marginBottom: 4, textAlign: 'center' }}>
            {t('gameMode.dotSectionTitle')}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
            <input
              type="number" min={1}
              value={dotAmountInput}
              onChange={e => setDotAmountInput(e.target.value)}
              placeholder={t('gameMode.dotAmountPlaceholder')}
              style={{ width: 90, height: 34, flexShrink: 0, boxSizing: 'border-box', padding: '4px 8px', borderRadius: 4, fontSize: 13, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(201,168,76,0.35)', color: PARCHMENT, outline: 'none' }}
            />
            <input
              type="number" min={1}
              value={dotDurationInput}
              onChange={e => setDotDurationInput(e.target.value)}
              placeholder={t('gameMode.dotDurationPlaceholder')}
              style={{ width: 70, height: 34, flexShrink: 0, boxSizing: 'border-box', padding: '4px 8px', borderRadius: 4, fontSize: 13, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(201,168,76,0.35)', color: PARCHMENT, outline: 'none' }}
            />
            <select
              value={dotTypeInput}
              onChange={e => setDotTypeInput(e.target.value)}
              style={{ height: 34, flexShrink: 0, boxSizing: 'border-box', padding: '4px 6px', borderRadius: 4, fontSize: 13, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(201,168,76,0.35)', color: PARCHMENT, outline: 'none' }}
            >
              {['', ...DAMAGE_TYPES].map(type => (
                <option key={type || 'GENERIQUE'} value={type}>{type ? t(`gameMode.dmType${type}`) : t('gameMode.dmTypeGenerique')}</option>
              ))}
            </select>
            {(() => {
              const dotValide = parseInt(dotAmountInput, 10) > 0 && parseInt(dotDurationInput, 10) > 0
              return (
                <button
                  disabled={!dotValide}
                  onClick={handleAddDot}
                  style={{ ...btnStyle(), height: 34, flexShrink: 0, opacity: dotValide ? 1 : 0.35, cursor: dotValide ? 'pointer' : 'not-allowed' }}
                >
                  ☠️ {t('gameMode.dotAddButton')}
                </button>
              )
            })()}
          </div>
          {activeDots.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
              {activeDots.map(dot => (
                <span key={dot.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, background: 'rgba(180,30,30,0.12)', border: '1px solid rgba(220,50,50,0.4)', borderRadius: 12, padding: '3px 8px', color: 'rgba(255,150,150,0.9)' }}>
                  {DAMAGE_TYPE_ICONS[dot.type]} {dot.amount} · {t('gameMode.turn', { count: dot.remainingTurns })}
                  <button onClick={() => setActiveDots(prev => prev.filter(d => d.id !== dot.id))} style={{ background: 'none', border: 'none', color: 'rgba(245,236,215,0.4)', cursor: 'pointer', padding: '0 0 0 3px', fontSize: 10, lineHeight: 1 }}>✕</button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* ── Section 1 : Jets rapides ── */}
        <div style={SECTION_DIVIDER}>
          <div style={{ fontSize: 13, color: `rgba(201,168,76,0.85)`, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{t('gameMode.quickRolls')}</div>

          <div style={{ fontSize: 13, color: `rgba(245,236,215,0.4)`, marginBottom: 4 }}>{t('gameMode.attacksSection')}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
            {[
              { label: t('gameMode.attContact'), val: attaques.contact },
              { label: t('gameMode.attDistance'), val: attaques.distance },
              { label: t('gameMode.attMagic'), val: attaques.magique },
            ].map(({ label, val }) => (
              <button key={label} disabled={isUnconscious} style={{ ...btnStyle(), flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, padding: '4px 2px', opacity: isUnconscious ? 0.35 : 1, cursor: isUnconscious ? 'not-allowed' : 'pointer' }} onClick={() => roll(20, label, val)}>
                <span style={{ fontSize: 11, color: `rgba(245,236,215,0.5)` }}>{label}</span>
                <span style={{ color: GOLD, fontSize: 22, fontWeight: 700 }}>{val >= 0 ? '+' : ''}{val}</span>
              </button>
            ))}
          </div>

          {(character.arme1 || character.arme2) && (
            <>
              <div style={{ fontSize: 13, color: `rgba(245,236,215,0.4)`, marginBottom: 4 }}>{t('gameMode.damageSection')}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                {[
                  ...(character.arme1 ? [{ label: character.arme1, nomArme: character.arme1, fallback: character.dmArme1 }] : []),
                  ...(character.arme2 ? [{ label: character.arme2, nomArme: character.arme2, fallback: character.dmArme2 }] : []),
                ].map(({ label, nomArme, fallback }) => {
                  const nbBonus = activeDeDegats.filter(ab => !ab.deDegatsParArme || getDeDegatsWeapon(ab) === nomArme).length
                  return (
                    <button key={label} disabled={isUnconscious} style={{ ...btnStyle(), flex: 1, padding: '6px 4px', opacity: isUnconscious ? 0.35 : 1, cursor: isUnconscious ? 'not-allowed' : 'pointer' }} onClick={() => handleWeaponDegats(nomArme, label, fallback)}>
                      💥 {label}{nbBonus > 0 ? ` (+${nbBonus})` : ''}
                    </button>
                  )
                })}
              </div>
            </>
          )}

          <div style={{ fontSize: 13, color: `rgba(245,236,215,0.4)`, marginBottom: 4 }}>{t('gameMode.characteristics')}</div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 32 }}>
            {STATS.map(stat => {
              const permBonus = permanentBonusByStat.get(stat) ?? 0
              const scoreBonus = sumStat(effectsAll[stat] ?? [])
              const mod = effectiveMod(stat) + permBonus
              const boost = activeBoosts.find(b => b.stat === stat)
              const boostedMod = boost ? mod + boost.bonus : mod
              const sources = modSourcesPourStat(stat)
              const tooltipDesc = [
                t('gameMode.bonusBaseLine', { value: character.caracteristiques[stat].mod }),
                ...sources.map(s => t('gameMode.bonusSourceLine', { nom: s.nom, rang: s.rang, value: s.value })),
                ...(boost ? [t('gameMode.bonusNextRollLine', { nom: boost.label, value: boost.bonus })] : []),
              ].join('\n')
              return (
                <button
                  key={stat} disabled={isUnconscious}
                  style={{ ...btnStyle(!!boost), flex: 1, padding: '4px 2px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, opacity: isUnconscious ? 0.35 : 1, cursor: isUnconscious ? 'not-allowed' : 'pointer' }}
                  onClick={() => roll(20, t(`stats.${stat}`), mod, stat)}
                  onMouseEnter={e => showGmTooltip(e, t(`stats.${stat}`), tooltipDesc)}
                  onMouseLeave={hideGmTooltip}
                >
                  <span style={{ fontSize: 11, color: boost ? '#ffe94d' : (permBonus || scoreBonus) ? GOLD : `rgba(245,236,215,0.5)`, display: 'flex', alignItems: 'center', gap: 2 }}>
                    {t(`stats.${stat}`)}{boost && <span style={{ fontSize: 10 }}>{boost.bonus >= 0 ? '+' : ''}{boost.bonus}</span>}
                  </span>
                  <span style={{ color: boost ? '#ffe94d' : GOLD, fontSize: 22, fontWeight: 700 }}>{boostedMod >= 0 ? '+' : ''}{boostedMod}</span>
                </button>
              )
            })}
          </div>

          {/* 2 colonnes : [dés + résultat] | [historique] — empilées verticalement sur mobile */}
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8, marginTop: 4, alignItems: 'stretch' }}>

            {/* Colonne 1 : dés (ligne 1) + résultat (ligne 2) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
              {/* Ligne 1 : boutons dés */}
              <div style={{ flexShrink: 0, display: 'flex', gap: 4 }}>
                {BARE_DICE.map(d => (
                  <button key={d} disabled={isUnconscious} style={{ ...btnStyle(), flex: 1, aspectRatio: '1', padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: isUnconscious ? 0.35 : 1, cursor: isUnconscious ? 'not-allowed' : 'pointer' }} onClick={() => roll(d, `d${d}`, null)}>
                    <DiceIcon sides={d} size={44} />
                  </button>
                ))}
              </div>

              {/* Ligne 2 : résultat */}
              {(() => {
                const isCritSuccess = !!result && result.sides === 20 && result.roll === 20
                const isCritFail    = !!result && result.sides === 20 && result.roll === 1
                const borderColor = isCritSuccess ? 'rgba(255,215,0,0.7)' : isCritFail ? 'rgba(220,50,50,0.7)' : SECTION_BORDER
                const bgColor     = isCritSuccess ? 'rgba(255,200,0,0.08)' : isCritFail ? 'rgba(180,30,30,0.12)' : 'rgba(0,0,0,0.4)'
                const totalColor  = isCritSuccess ? '#ffe94d' : isCritFail ? '#ff5555' : GOLD
                const effs: ContributingEffect[] = result ? [
                  ...(result.stat ? effectsByStatMap.get(result.stat) ?? [] : []),
                  ...(result.boost !== undefined ? [{ rangNom: result.boostLabel ?? 'Bonus', temporaire: true as const }] : []),
                  ...(result.contributingEffects ?? []),
                ] : []
                return (
                  <div style={{ flex: 1, padding: '4px 12px', background: bgColor, borderRadius: 6, border: `1px solid ${borderColor}`, textAlign: 'center', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 0 }}>
                      {!result && <div style={{ color: `rgba(245,236,215,0.2)`, fontSize: 14 }}>—</div>}
                      {result && <>
                        {isCritSuccess && <div style={{ fontSize: 12, fontWeight: 700, color: '#ffe94d', letterSpacing: '0.1em', marginBottom: 4 }}>{t('gameMode.critSuccess')}</div>}
                        {isCritFail    && <div style={{ fontSize: 12, fontWeight: 700, color: '#ff5555', letterSpacing: '0.1em', marginBottom: 4 }}>{t('gameMode.critFail')}</div>}
                        <div style={{ fontSize: 13, color: `rgba(245,236,215,0.45)`, marginBottom: 6 }}>
                          {result.label} <span style={{ color: `rgba(201,168,76,0.5)` }}>({result.formula})</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 24, color: result.flash ? '#fff' : PARCHMENT, transition: 'color 0.2s' }}>
                            <DiceIcon sides={result.sides} size={32} color={result.flash ? '#fff' : PARCHMENT} />
                            {result.rollDisplay ?? result.roll}
                          </span>
                          {result.modifier !== null && (
                            <span style={{ fontSize: 22, color: `rgba(245,236,215,0.55)` }}>{result.modifier >= 0 ? '+' : ''}{result.modifier}</span>
                          )}
                          {result.boost !== undefined && (
                            <span style={{ fontSize: 18, color: '#ffe94d' }} title={result.boostLabel}>+{result.boost}</span>
                          )}
                          <span style={{ fontSize: 22, color: `rgba(245,236,215,0.4)` }}>=</span>
                          <span style={{ fontSize: 36, fontWeight: 700, color: result.flash ? '#fff' : totalColor, transition: 'color 0.2s' }}>{result.total}</span>
                        </div>
                        {postJetBoosts.map(b => (
                          <button key={b.id} onClick={() => applyPostJetBoost(b)}
                            style={{ marginTop: 8, width: '100%', padding: '5px', borderRadius: 4, fontSize: 12, cursor: 'pointer', background: 'rgba(255,220,80,0.1)', border: '1px solid rgba(255,220,80,0.4)', color: '#ffe94d' }}>
                            {t('gameMode.applyBoost', { label: b.label, bonus: `${b.bonus >= 0 ? '+' : ''}${b.bonus}` })}
                          </button>
                        ))}
                      </>}
                    </div>
                    {effs.length > 0 && (
                      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 2, padding: '4px 8px', margin: '4px -12px -4px', background: 'rgba(20,14,30,0.92)', borderTop: '1px solid rgba(160,120,255,0.3)', borderRadius: '0 0 6px 6px' }}>
                        {effs.map((e, i) => (
                          <div key={i} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(140,100,255,0.15)', border: '1px solid rgba(160,120,255,0.3)', borderRadius: 4, padding: '3px 8px' }}>
                            <span style={{ color: `rgba(245,236,215,0.85)`, fontWeight: 600 }}>{e.rangNom}</span>
                            <span style={{ color: `rgba(245,236,215,0.35)`, marginLeft: 'auto', fontSize: 11 }}>
                              {'temporaire' in e ? t('gameMode.temporary') : t('gameMode.rangVoie', { rang: e.rangIdx! + 1, voie: e.voieNom })}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>

            {/* Colonne 2 : historique */}
            {(() => {
              const histDisplay = resultInHistory ? history.slice(1) : history
              return (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <div style={{ fontSize: 13, color: `rgba(201,168,76,0.85)`, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{t('gameMode.history')}</div>
                    {history.length > 0 && (
                      <button
                        onClick={() => setHistory([])}
                        style={{ fontSize: 11, color: 'rgba(245,236,215,0.4)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}
                      >
                        🗑️ {t('gameMode.clearHistory')}
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', minHeight: 230, maxHeight: 230, paddingRight: 6 }}>
                    {histDisplay.length === 0
                      ? <div style={{ color: `rgba(245,236,215,0.2)`, fontSize: 13, padding: '4px 6px' }}>—</div>
                      : histDisplay.map((h, i) => {
                          const cs = h.sides === 20 && h.roll === 20
                          const cf = h.sides === 20 && h.roll === 1
                          const color = cs ? '#ffe94d' : cf ? '#ff5555' : `rgba(245,236,215,0.85)`
                          const bg = cs ? 'rgba(255,200,0,0.1)' : cf ? 'rgba(180,30,30,0.15)' : 'rgba(0,0,0,0.25)'
                          const modStr = h.modifier !== null ? (h.modifier >= 0 ? ` +${h.modifier}` : ` ${h.modifier}`) : ''
                          const boostStr = h.boost ? ` +${h.boost}` : ''
                          return (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 6px', borderRadius: 3, background: bg, fontSize: 15 }}>
                              <span style={{ flex: 1, color: `rgba(245,236,215,0.75)`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {cs ? '✨ ' : cf ? '💀 ' : ''}{h.costType === 'PV' ? '❤️ ' : h.costType === 'PM' ? '✨ ' : h.costType === 'PR' ? '🩹 ' : ''}{h.label} ({h.formula})
                              </span>
                              <span style={{ color: `rgba(245,236,215,0.6)`, flexShrink: 0 }}>{h.rollDisplay ?? h.roll}{modStr}{boostStr} =</span>
                              <span style={{ fontWeight: 700, color, flexShrink: 0 }}>{h.total}</span>
                            </div>
                          )
                        })
                    }
                  </div>
                </div>
              )
            })()}
          </div>
        </div>

        {/* ── Section 2 : Effets actifs ── */}
        <div style={SECTION_DIVIDER}>
          <div style={{ fontSize: 13, color: `rgba(201,168,76,0.85)`, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{t('gameMode.activeEffects')}</div>
          {availableBonuses.length === 0 && availableAvantages.length === 0 && availableActions.length === 0 ? (
            <div style={{ padding: '12px 0', textAlign: 'center' }}>
              <div style={{ fontSize: 20, marginBottom: 6 }}>✦</div>
              <div style={{ fontSize: 14, color: `rgba(245,236,215,0.3)`, lineHeight: 1.5 }}>{t('gameMode.noEffectsTitle')}<br />{t('gameMode.noEffectsDesc')}</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {availableActions.map((action, i) => (
                <div key={`action-${i}`} style={{ padding: '8px 10px', borderRadius: 5, background: 'rgba(140,100,255,0.08)', border: `1px ${action.activable ? 'solid' : 'dashed'} rgba(160,120,255,0.35)` }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'rgba(200,170,255,0.95)' }}>{action.rangNom}</span>
                    <span style={{ fontSize: 12, color: `rgba(245,236,215,0.3)` }}>{t('gameMode.rangVoie', { rang: action.rangIdx + 1, voie: action.voieNom })}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(200,170,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>⚔️</span> {t('gameMode.actionType')}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: action.activable ? 8 : 0, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, color: PARCHMENT, opacity: 0.6 }}>{t('gameMode.actionSummary', { de: action.de, dm: action.dm })}</span>
                    {action.cout_pm && <span style={{ fontSize: 12, color: 'rgba(123,170,232,0.9)', background: 'rgba(123,170,232,0.1)', border: '1px solid rgba(123,170,232,0.3)', borderRadius: 3, padding: '1px 6px' }}>{action.cout_pm} {t('gameMode.pm')}</span>}
                    {(() => {
                      const flat = action.cout_pm ? parseFlatCost(action.cout_pm) : null
                      if (flat === null || pmActuels >= flat) return null
                      return <span style={{ fontSize: 12, color: '#ff8a5c', background: 'rgba(255,90,30,0.12)', border: '1px solid rgba(255,90,30,0.4)', borderRadius: 3, padding: '1px 6px', fontWeight: 600 }}>{t('gameMode.manaBurnWarning')}</span>
                    })()}
                    {!action.activable && (
                      <span style={{ fontSize: 12, background: 'rgba(140,100,255,0.15)', border: '1px solid rgba(160,120,255,0.4)', borderRadius: 3, padding: '1px 7px', color: 'rgba(200,170,255,0.8)', fontWeight: 600 }}>{t('gameMode.automatic')}</span>
                    )}
                  </div>
                  {action.activable && (
                    <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                      <button disabled={isUnconscious} onClick={() => handleActionAttaque(action)} style={{ flex: 1, fontSize: 14, padding: '6px 10px', borderRadius: 4, cursor: isUnconscious ? 'not-allowed' : 'pointer', fontWeight: 600, border: '1px solid rgba(160,120,255,0.5)', background: 'rgba(140,100,255,0.15)', color: 'rgba(200,170,255,0.9)', opacity: isUnconscious ? 0.35 : 1 }}>
                        {action.attType
                          ? t('gameMode.attackButtonTyped', { de: action.de, type: t(`gameMode.type${action.attType === 'contact' ? 'Contact' : action.attType === 'distance' ? 'Distance' : 'Magique'}`) })
                          : t('gameMode.attackButtonPlain', { de: action.de })}
                      </button>
                      <button disabled={isUnconscious} onClick={() => handleActionDegats(action)} style={{ flex: 1, fontSize: 14, padding: '6px 10px', borderRadius: 4, cursor: isUnconscious ? 'not-allowed' : 'pointer', fontWeight: 600, border: '1px solid rgba(160,120,255,0.35)', background: 'rgba(140,100,255,0.08)', color: 'rgba(200,170,255,0.7)', opacity: isUnconscious ? 0.35 : 1 }}>
                        {t('gameMode.damageButton', { dm: action.dm })}
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {availableAvantages.map((av, i) => (
                <div key={`av-${i}`} style={{ padding: '8px 10px', borderRadius: 5, background: 'rgba(140,100,255,0.08)', border: '1px dashed rgba(160,120,255,0.35)' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'rgba(200,170,255,0.95)' }}>{av.rangNom}</span>
                    <span style={{ fontSize: 12, color: `rgba(245,236,215,0.3)` }}>{t('gameMode.rangVoie', { rang: av.rangIdx + 1, voie: av.voieNom })}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(200,170,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>🎲</span> {t('gameMode.advantageTitle', { stat: av.stat })}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                    <span style={{ fontSize: 14, color: PARCHMENT }}>{t('gameMode.advantageDesc', { count: av.garder, lancer: av.lancer, garder: av.garder })}</span>
                    <span style={{ fontSize: 12, background: 'rgba(140,100,255,0.15)', border: '1px solid rgba(160,120,255,0.4)', borderRadius: 3, padding: '1px 7px', color: 'rgba(200,170,255,0.8)', fontWeight: 600 }}>{t('gameMode.automatic')}</span>
                  </div>
                </div>
              ))}
              {availableBonuses.map((ab, i) => {
                const equippedWeapons = [character.arme1, character.arme2].filter(Boolean)
                const weaponKey = boostKey(ab)
                const needsWeaponChoice = !!ab.deDegats && !!ab.deDegatsParArme && equippedWeapons.length >= 2
                const resolvedWeapon = ab.deDegats ? getDeDegatsWeapon(ab) : undefined
                const showStandaloneRoll = !!ab.deDegats && (ab.deDegatsParArme ? !resolvedWeapon : equippedWeapons.length === 0)
                const weaponPicker = needsWeaponChoice && (
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 6 }}>
                    <span style={{ fontSize: 11, color: 'rgba(245,236,215,0.4)' }}>{t('gameMode.weaponLabel')}</span>
                    {equippedWeapons.map(w => (
                      <button key={w} onClick={() => setDeDegatsWeapon(prev => ({ ...prev, [weaponKey]: w }))}
                        style={{ ...btnStyle(deDegatsWeapon[weaponKey] === w), flex: 1, fontSize: 12, padding: '4px 6px' }}>
                        {w}
                      </button>
                    ))}
                  </div>
                )
                if (!ab.temporaire) {
                  return (
                    <div key={i} style={{ padding: '8px 10px', borderRadius: 5, background: 'rgba(140,100,255,0.08)', border: '1px dashed rgba(160,120,255,0.35)' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: 'rgba(200,170,255,0.95)' }}>{ab.rangNom}</span>
                        <span style={{ fontSize: 12, color: `rgba(245,236,215,0.3)` }}>{t('gameMode.rangVoie', { rang: ab.rangIdx + 1, voie: ab.voieNom })}</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(200,170,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span>⚡</span> {t('gameMode.bonusPermanent')}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: ab.deDegats ? 8 : 0 }}>
                        <span style={{ fontSize: 14, color: PARCHMENT }}>{ab.deDegats ? `+${ab.deDegats}` : formatBonusLabel(ab)} {ab.cibles.join(' + ')}{ab.precision ? ` ${ab.precision}` : ''}</span>
                        <span style={{ fontSize: 12, background: 'rgba(140,100,255,0.15)', border: '1px solid rgba(160,120,255,0.4)', borderRadius: 3, padding: '1px 7px', color: 'rgba(200,170,255,0.8)', fontWeight: 600 }}>{t('gameMode.alwaysActive')}</span>
                      </div>
                      {weaponPicker}
                      {showStandaloneRoll && (
                        <button disabled={isUnconscious} onClick={() => handleRollBonusDice(ab)} style={{ width: '100%', fontSize: 14, padding: '6px 10px', borderRadius: 4, cursor: isUnconscious ? 'not-allowed' : 'pointer', fontWeight: 600, border: '1px solid rgba(255,150,80,0.5)', background: 'rgba(255,150,80,0.12)', color: 'rgba(255,180,120,0.95)', marginTop: needsWeaponChoice ? 6 : 0, opacity: isUnconscious ? 0.35 : 1 }}>
                          {t('gameMode.rollBonus', { dice: ab.deDegats })}
                        </button>
                      )}
                    </div>
                  )
                }
                const isPending = pendingStatPick?.abIdx === i
                const activationKey = boostKey(ab)
                const remainingTurns = effectCounters[activationKey] ?? 0
                const alreadyUsed = remainingTurns > 0
                return (
                  <div key={i} style={{ padding: '8px 10px', borderRadius: 5, background: isPending ? 'rgba(140,100,255,0.14)' : 'rgba(140,100,255,0.08)', border: `1px solid ${isPending ? 'rgba(160,120,255,0.6)' : 'rgba(160,120,255,0.35)'}` }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: 'rgba(200,170,255,0.95)' }}>{ab.rangNom}</span>
                      <span style={{ fontSize: 12, color: `rgba(245,236,215,0.3)` }}>{t('gameMode.rangVoie', { rang: ab.rangIdx + 1, voie: ab.voieNom })}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(200,170,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span>⚡</span> {t('gameMode.bonusTemporary')}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: 14, color: PARCHMENT }}>{ab.deDegats ? `+${ab.deDegats}` : formatBonusLabel(ab)} {ab.cibles.join(ab.choix ? ' ou ' : ' + ')}{ab.precision ? ` ${ab.precision}` : ''}</span>
                      {ab.cout_pv && <span style={{ fontSize: 13, color: 'rgba(220,80,80,0.9)', background: 'rgba(220,50,50,0.1)', border: '1px solid rgba(220,50,50,0.3)', borderRadius: 3, padding: '1px 6px' }}>{ab.cout_pv} {t('gameMode.pv')}</span>}
                      {ab.cout_pm && <span style={{ fontSize: 13, color: 'rgba(123,170,232,0.9)', background: 'rgba(123,170,232,0.1)', border: '1px solid rgba(123,170,232,0.3)', borderRadius: 3, padding: '1px 6px' }}>{ab.cout_pm} {t('gameMode.pm')}</span>}
                      {(() => {
                        const flat = ab.cout_pm ? parseFlatCost(ab.cout_pm) : null
                        if (flat === null || pmActuels >= flat) return null
                        return <span style={{ fontSize: 13, color: '#ff8a5c', background: 'rgba(255,90,30,0.12)', border: '1px solid rgba(255,90,30,0.4)', borderRadius: 3, padding: '1px 6px', fontWeight: 600 }}>{t('gameMode.manaBurnWarning')}</span>
                      })()}
                      {ab.coutCaracStat && ab.coutCaracValeur && <span style={{ fontSize: 13, color: 'rgba(220,80,80,0.9)', background: 'rgba(220,50,50,0.1)', border: '1px solid rgba(220,50,50,0.3)', borderRadius: 3, padding: '1px 6px' }}>-{ab.coutCaracValeur} {ab.coutCaracStat}</span>}
                      {ab.usage && <span style={{ fontSize: 13, color: `rgba(245,236,215,0.5)`, background: 'rgba(0,0,0,0.3)', border: `1px solid rgba(160,120,255,0.25)`, borderRadius: 3, padding: '1px 6px' }}>{formatUsage(ab.usage)}</span>}
                      {ab.post_jet && <span style={{ fontSize: 13, color: 'rgba(200,170,255,0.6)', fontStyle: 'italic' }}>{t('gameMode.afterRollTag')}</span>}
                    </div>
                    {!isPending ? (
                      <button
                        onClick={() => !alreadyUsed && !isUnconscious && handleActivateClick(ab, i)}
                        disabled={alreadyUsed || isUnconscious}
                        style={{
                          width: '100%', fontSize: 14, padding: '6px 10px', borderRadius: 4, fontWeight: 600, marginBottom: 6,
                          cursor: (alreadyUsed || isUnconscious) ? 'not-allowed' : 'pointer',
                          border: `1px solid ${alreadyUsed ? 'rgba(160,120,255,0.2)' : 'rgba(160,120,255,0.5)'}`,
                          background: alreadyUsed ? 'rgba(140,100,255,0.05)' : 'rgba(140,100,255,0.15)',
                          color: alreadyUsed ? 'rgba(200,170,255,0.35)' : 'rgba(200,170,255,0.9)',
                          opacity: isUnconscious ? 0.35 : 1,
                        }}>
                        {alreadyUsed ? t('gameMode.activeTurns', { count: remainingTurns }) : t('gameMode.activate')}
                      </button>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 6 }}>
                        <span style={{ fontSize: 12, color: `rgba(245,236,215,0.6)` }}>{t('gameMode.chooseStatToBoost')}</span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {ab.cibles.map(stat => (
                            <button key={stat} onClick={() => handleStatPick(ab, stat)} style={{ flex: 1, fontSize: 13, padding: '6px 10px', borderRadius: 4, cursor: 'pointer', fontWeight: 600, border: '1px solid rgba(160,120,255,0.7)', background: 'rgba(140,100,255,0.25)', color: 'rgba(220,200,255,0.95)' }}>
                              {formatBonusLabel(ab)} {stat}
                            </button>
                          ))}
                          <button onClick={() => setPendingStatPick(null)} style={{ ...btnStyle(false), padding: '6px 10px', fontSize: 13 }}>✕</button>
                        </div>
                      </div>
                    )}
                    {ab.deDegats && alreadyUsed && weaponPicker}
                    {ab.deDegats && alreadyUsed && showStandaloneRoll && (
                      <button disabled={isUnconscious} onClick={() => handleRollBonusDice(ab)} style={{ width: '100%', fontSize: 14, padding: '6px 10px', borderRadius: 4, cursor: isUnconscious ? 'not-allowed' : 'pointer', fontWeight: 600, border: '1px solid rgba(255,150,80,0.5)', background: 'rgba(255,150,80,0.12)', color: 'rgba(255,180,120,0.95)', marginTop: needsWeaponChoice ? 6 : 0, opacity: isUnconscious ? 0.35 : 1 }}>
                        {t('gameMode.rollBonus', { dice: ab.deDegats })}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Section : Capacités empruntées (texte) — voir rangsEmpruntesTexte ── */}
        {rangsEmpruntesTexte.length > 0 && (
          <div style={SECTION_DIVIDER}>
            <div style={{ fontSize: 13, color: `rgba(201,168,76,0.85)`, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              {t('gameMode.rangsEmpruntesTitre')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {rangsEmpruntesTexte.map(({ voieNom, rangIdx, rangData, grantKey }) => (
                <div key={grantKey} style={{ padding: '8px 10px', borderRadius: 5, background: 'rgba(201,168,76,0.05)', border: '1px dashed rgba(201,168,76,0.3)' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: GOLD }}>{rangData.nom}</span>
                    <span style={{ fontSize: 12, color: `rgba(245,236,215,0.3)` }}>{t('gameMode.rangVoie', { rang: rangIdx + 1, voie: voieNom })}</span>
                  </div>
                  {/* Même rendu que sur la fiche : le texte des capacités contient du balisage
                      (**gras**, ==surligné==, [formules]) qui doit être interprété, pas affiché brut. */}
                  <div style={{ fontSize: 13, color: 'rgba(245,236,215,0.6)', lineHeight: 1.4 }}>
                    {parseDesc(rangData.desc, character, descriptions, rangIdx + 1)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* Tooltip custom, même design que celui de la fiche de personnage (fond sombre, bordure dorée) */}
      {gmTooltip && (
        <div style={{
          position: 'fixed', left: gmTooltip.x, top: gmTooltip.y,
          transform: gmTooltip.below ? 'translate(-50%, 8px)' : 'translate(-50%, calc(-100% - 8px))',
          maxWidth: 220, background: 'rgba(20,15,8,0.97)', color: '#e8dfc0',
          border: `1px solid ${GOLD}`, borderRadius: 4, padding: '8px 10px',
          fontSize: 13, lineHeight: 1.5, zIndex: 9999, pointerEvents: 'none',
          boxShadow: '0 2px 8px rgba(0,0,0,0.7)', whiteSpace: 'pre-line',
        }}>
          <div style={{ fontWeight: 700, color: GOLD, marginBottom: gmTooltip.desc ? 6 : 0, fontSize: '1.05em' }}>{gmTooltip.title}</div>
          {gmTooltip.desc && <div>{gmTooltip.desc}</div>}
        </div>
      )}
    </div>
  )
}
