import { useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { DiceIcon } from './DiceIcon'
import type { Character, Caracteristique } from '../../types/character'
type CharacterPatch = Partial<Character>
import type { DescMap } from '../../types/gameData'
import { computeEffectsWithCristaux, sumStat, computeAttaquesTotaux, resolveFormula } from '../../utils/computeEffects'
import { getMod } from '../../types/character'
import { useGameData } from '../../context/GameDataContext'

const GOLD = '#c9a84c'
const PARCHMENT = '#f5ecd7'
const BG = '#1a1410'
const SECTION_BORDER = 'rgba(201,168,76,0.2)'

const STATS: Caracteristique[] = ['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA']
const BARE_DICE = [4, 6, 8, 10, 12, 20]


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
}

interface AvailableBonus {
  voieNom: string
  rangIdx: number
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
  inline?: boolean
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

export default function GameModePanel({ character, descriptions, onChange, onClose, screenWidth, inline = false }: Props) {
  const { t } = useTranslation()
  const { armes, armures } = useGameData()
  const isMobile = !inline && screenWidth < 700
  const [minimized, setMinimized] = useState(false)
  const [result, setResult] = useState<RollResult | null>(null)
  const [history, setHistory] = useState<RollResult[]>([])
  const [effectCounters, setEffectCounters] = useState<Record<string, number>>({})
  const [activeBoosts, setActiveBoosts] = useState<ActiveBoost[]>([])
  const [pendingStatPick, setPendingStatPick] = useState<{ abIdx: number } | null>(null)
  const [deDegatsWeapon, setDeDegatsWeapon] = useState<Record<string, string>>({})
  const [currentPV, setCurrentPV] = useState<number | null>(null)
  const [currentPM, setCurrentPM] = useState<number | null>(null)
  const [resultInHistory, setResultInHistory] = useState(false)
  const [healInput, setHealInput] = useState('')


  const voiesPerso = useMemo(() => [
    character.voiePeuple, character.voieCulturelle,
    character.voie1, character.voie2, character.voie3,
    character.voiePrestige, character.voieSangMele,
  ], [character])

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
        for (const grant of rang.grants) {
          if (grant.type !== 'BONUS_TEMP') continue
          if (grant.avancee && !(voie.rangsAvances?.[idx])) continue
          if (grant.masqueSiAvancee && voie.rangsAvances?.[idx]) continue
          if ((grant.minRang ?? 1) > voie.rangs.filter(Boolean).length) continue
          const bonusValue = grant.formula ? (resolveFormula(grant.formula, character) ?? 0) : (grant.bonus ?? 0)
          out.push({ voieNom: voie.nom, rangIdx: idx, rangNom: rang.nom, label: grant.label, bonus: bonusValue, formula: grant.formula, deDegats: grant.deDegats, deDegatsParArme: grant.deDegatsParArme, temporaire: grant.temporaire, cibles: grant.cibles, choix: grant.choix, cout_pv: grant.cout_pv, cout_pm: grant.cout_pm, coutCaracStat: grant.coutCaracStat, coutCaracValeur: grant.coutCaracValeur, usage: grant.usage, post_jet: grant.post_jet, precision: grant.precision })
        }
      })
    }
    return out
  }, [voiesPerso, descriptions, character])

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
    ab.deDegats && (!ab.temporaire || (effectCounters[`ab-${ab.voieNom}-${ab.rangIdx}`] ?? 0) > 0)
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
    return { statsAvantage: map, availableAvantages: list }
  }, [voiesPerso, descriptions])

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
        for (const grant of rang.grants) {
          if (grant.type !== 'ACTION') continue
          if (grant.avancee && !(voie.rangsAvances?.[idx])) continue
          if (grant.masqueSiAvancee && voie.rangsAvances?.[idx]) continue
          if ((grant.minRang ?? 1) > voie.rangs.filter(Boolean).length) continue
          out.push({ voieNom: voie.nom, rangIdx: idx, rangNom: rang.nom, label: grant.label, de: grant.de, dm: grant.dm, attType: grant.attType, activable: grant.activable, cout_pm: grant.cout_pm })
        }
      })
    }
    return out
  }, [voiesPerso, descriptions])

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
    for (const ab of availableBonuses) {
      if (ab.temporaire) continue
      for (const cible of ab.cibles) {
        if (!map.has(cible)) map.set(cible, [])
        map.get(cible)!.push({ voieNom: ab.voieNom, rangIdx: ab.rangIdx, rangNom: ab.rangNom, value: ab.bonus })
      }
    }
    return map
  }, [voiesPerso, descriptions, availableBonuses])

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
    if (stat) {
      const match = activeBoosts.find(b => b.stat === stat)
      if (match) {
        boost = match.bonus
        boostLabel = match.label
        setActiveBoosts(prev => prev.filter(b => b.id !== match.id))
      }
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
    return deDegatsWeapon[`ab-${ab.voieNom}-${ab.rangIdx}`]
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
    const key = `ab-${ab.voieNom}-${ab.rangIdx}`
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
      applyPVLoss(Math.max(0, pvActuels - cost))
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
        { id: nextId++, stat: ab.coutCaracStat!, bonus: -ab.coutCaracValeur!, label: `${ab.label} — ${t('gameMode.sufCout')}`, post_jet: false, sourceKey: key },
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
        ...ab.cibles.map(s => ({ id: nextId++, stat: s, bonus: ab.bonus, label: ab.label, post_jet: ab.post_jet ?? false, cout_pv: ab.cout_pv, sourceKey: key })),
      ])
    }
  }

  const handleStatPick = (ab: AvailableBonus, stat: string) => {
    setPendingStatPick(null)
    const key = `ab-${ab.voieNom}-${ab.rangIdx}`
    setActiveBoosts(prev => [...prev, { id: nextId++, stat, bonus: ab.bonus, label: ab.label, post_jet: ab.post_jet ?? false, cout_pv: ab.cout_pv, sourceKey: key }])
  }

  const applyPostJetBoost = useCallback((boost: ActiveBoost) => {
    setActiveBoosts(prev => prev.filter(b => b.id !== boost.id))
    setResult(prev => {
      if (!prev) return null
      const newTotal = prev.total + boost.bonus
      return { ...prev, boost: (prev.boost ?? 0) + boost.bonus, boostLabel: boost.label, total: newTotal }
    })
  }, [])

  const handleEndTurn = useCallback(() => {
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
  }, [])

  // Ces deux hooks doivent rester avant le `return` anticipé du mode minimisé ci-dessous :
  // les appeler après romprait les Rules of Hooks (nombre de hooks différent selon `minimized`).
  const attaques = useMemo(() => computeAttaquesTotaux(character, descriptions, armes, armures), [character, descriptions, armes, armures])
  const effectsAll = useMemo(() => computeEffectsWithCristaux(character, descriptions), [character, descriptions])

  const panelStyle: React.CSSProperties = inline
    ? { display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', background: BG }
    : isMobile
      ? (minimized
          ? { position: 'fixed', bottom: 0, left: 0, right: 0, height: 'calc(44px + env(safe-area-inset-bottom))', boxSizing: 'border-box', paddingBottom: 'env(safe-area-inset-bottom)', paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)', zIndex: 8000, display: 'flex', flexDirection: 'column', background: BG, borderTop: `2px solid ${GOLD}`, boxShadow: '0 -4px 24px rgba(0,0,0,0.7)' }
          : { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 8000, display: 'flex', flexDirection: 'column', background: BG, paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)', paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' })
      : { position: 'fixed', top: 0, right: 0, bottom: 0, width: minimized ? 36 : 320, zIndex: 8000, display: 'flex', flexDirection: 'column', background: BG, borderLeft: `2px solid ${GOLD}`, boxShadow: '-4px 0 24px rgba(0,0,0,0.7)', transition: 'width 0.2s' }

  if (!inline && minimized) {
    return (
      <div style={panelStyle} onClick={() => setMinimized(false)}>
        {isMobile ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8, cursor: 'pointer', color: GOLD, fontSize: 16, fontWeight: 700 }}>{t('gameMode.title')}</div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', cursor: 'pointer', writingMode: 'vertical-rl', color: GOLD, fontSize: 15, fontWeight: 700, letterSpacing: '0.08em' }}>{t('gameMode.title')}</div>
        )}
      </div>
    )
  }

  const btnStyle = (active?: boolean): React.CSSProperties => ({
    padding: '6px 10px', borderRadius: 4, fontSize: 14, cursor: 'pointer', fontWeight: 600,
    border: `1px solid ${active ? GOLD : 'rgba(201,168,76,0.35)'}`,
    background: active ? 'rgba(201,168,76,0.15)' : 'rgba(0,0,0,0.3)',
    color: active ? GOLD : `rgba(245,236,215,0.7)`,
    textAlign: 'center' as const, whiteSpace: 'nowrap' as const,
  })

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
  const pmFromVoies = sumStat(effectsAll['PM'] ?? [])
  // PM = Niveau + Mod.SAG (doublé pour les mystiques), recalculé en direct plutôt que de se fier à character.pm figé
  const pmBaseNiveau = character.niveau + effectiveMod('SAG')
  const pmNiveau = Math.max(0, character.famille === 'mystiques' ? 2 * pmBaseNiveau : pmBaseNiveau)
  const pmTotalEffectif = pmNiveau + pmFromVoies
  // currentPV/currentPM sont null au premier render → on initialise au max effectif
  const pvActuels = currentPV ?? pvTotalEffectif
  const pvPct = pvTotalEffectif > 0 ? pvActuels / pvTotalEffectif : 0
  const pvColor = pvPct > 0.5 ? '#5cb85c' : pvPct > 0.25 ? '#e8a838' : '#d9534f'
  const isUnconscious = pvActuels <= 0
  const isPvFull = pvActuels >= pvTotalEffectif
  const pmActuels = currentPM ?? pmTotalEffectif

  // Paie un coût en PM ; si les PM sont insuffisants, la différence est infligée en PV (brûlure de mana)
  // Applique une nouvelle valeur de PV et journalise le passage à l'inconscience (PV à 0)
  const applyPVLoss = (newPV: number) => {
    const wasConscious = pvActuels > 0
    setCurrentPV(newPV)
    onChange({ pvRestants: newPV })
    if (wasConscious && newPV <= 0) {
      pushHistory({ label: t('gameMode.unconsciousHistoryLabel'), formula: t('gameMode.pvZero'), sides: 6, roll: 0, modifier: null, total: 0, costType: 'PV', flash: false })
    }
  }

  // Applique un soin : augmente les PV (jamais au-delà du max), même si le PJ est inconscient
  const applyHeal = (amount: number, label: string, formula?: string, rollDisplay?: string, costType: 'PV' | 'PR' = 'PV') => {
    if (!Number.isFinite(amount) || amount <= 0) return
    const newPV = Math.min(pvTotalEffectif, pvActuels + amount)
    const healed = newPV - pvActuels
    setCurrentPV(newPV)
    onChange({ pvRestants: newPV })
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

  const payPMCost = (cost: number, label: string) => {
    const pmSpent = Math.min(cost, pmActuels)
    const deficit = cost - pmSpent
    const newPM = pmActuels - pmSpent
    setCurrentPM(newPM)
    onChange({ pmRestants: newPM })
    if (deficit > 0) {
      pushHistory({ label: `${label} — ${t('gameMode.sufBruleMana')}`, formula: `${deficit} ${t('gameMode.pv')}`, sides: 6, roll: deficit, modifier: null, total: deficit, costType: 'PV', flash: false })
      applyPVLoss(Math.max(0, pvActuels - deficit))
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
  const formatBonusLabel = (ab: AvailableBonus) => {
    const signedBonus = `${ab.bonus >= 0 ? '+' : ''}${ab.bonus}`
    return ab.formula ? `${formatFormula(ab.formula)} (${signedBonus})` : signedBonus
  }

  const postJetBoosts = result?.stat ? activeBoosts.filter(b => b.stat === result.stat && b.post_jet) : []

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: `1px solid ${SECTION_BORDER}`, flexShrink: 0, gap: 8 }}>
        <span style={{ fontSize: 17, fontWeight: 700, color: GOLD, flex: 1, fontFamily: "'Cinzel', serif" }}>{t('gameMode.title')}</span>
        {!inline && <button onClick={() => setMinimized(true)} style={{ background: 'transparent', border: 'none', color: `rgba(245,236,215,0.5)`, cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 4px' }}>—</button>}
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: `rgba(245,236,215,0.5)`, cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 4px' }}>✕</button>
      </div>

      {/* Barre PV / PM */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 14px', borderBottom: `1px solid ${SECTION_BORDER}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <div onClick={() => { setCurrentPV(pvTotalEffectif); onChange({ pvRestants: pvTotalEffectif }) }}
            title={t('gameMode.clickToFull')}
            style={{ cursor: 'pointer', width: 130, height: 130, boxSizing: 'border-box', borderRadius: 10, border: `1px solid ${GOLD}`, background: 'linear-gradient(to right, rgba(74,222,128,0.28), transparent 10%, transparent 90%, rgba(74,222,128,0.28)), linear-gradient(to bottom, rgba(74,222,128,0.28), transparent 10%, transparent 90%, rgba(74,222,128,0.28)), rgba(0,0,0,0.4)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-evenly', width: '100%', height: '100%' }}>
              <span style={{ fontSize: 11, color: 'rgba(245,236,215,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('gameMode.pvCardTitle')}</span>
              <span style={{ fontSize: 24 }}>❤️</span>
              <span style={{ fontSize: 20, fontWeight: 700, color: pvColor }}>{pvActuels} / {pvTotalEffectif}</span>
            </div>
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

        {isUnconscious && (
          <div style={{ padding: '10px 12px', borderRadius: 6, background: 'rgba(180,30,30,0.15)', border: '1px solid rgba(220,50,50,0.5)', textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#ff5555', letterSpacing: '0.05em' }}>{t('gameMode.unconsciousTitle')}</div>
            <div style={{ fontSize: 12, color: 'rgba(245,236,215,0.5)', marginTop: 2 }}>{t('gameMode.unconsciousDesc')}</div>
          </div>
        )}

        {/* ── Section : Soins ── */}
        <div>
          <div style={{ fontSize: 13, color: `rgba(201,168,76,0.85)`, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{t('gameMode.healSection')}</div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            <input
              type="number"
              min={1}
              value={healInput}
              onChange={e => setHealInput(e.target.value)}
              placeholder={t('gameMode.healPlaceholder')}
              disabled={isPvFull}
              style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', padding: '6px 10px', borderRadius: 4, fontSize: 14, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(201,168,76,0.35)', color: PARCHMENT, outline: 'none', opacity: isPvFull ? 0.35 : 1 }}
            />
            <button onClick={handleManualHeal} disabled={isPvFull} style={{ ...btnStyle(), flexShrink: 0, opacity: isPvFull ? 0.35 : 1, cursor: isPvFull ? 'not-allowed' : 'pointer' }}>❤️ {t('gameMode.healButton')}</button>
          </div>
          <button
            onClick={handleRecuperation}
            disabled={isUnconscious || prRemaining <= 0 || isPvFull}
            style={{ ...btnStyle(), width: '100%', boxSizing: 'border-box', opacity: (isUnconscious || prRemaining <= 0 || isPvFull) ? 0.35 : 1, cursor: (isUnconscious || prRemaining <= 0 || isPvFull) ? 'not-allowed' : 'pointer' }}
          >
            🩹 {t('gameMode.recuperationButton')} — {prRemaining > 0 ? t('gameMode.recuperationLabel', { count: prRemaining }) : t('gameMode.recuperationNone')}
          </button>
        </div>

        {/* ── Section 1 : Jets rapides ── */}
        <div>
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
              return (
                <button key={stat} disabled={isUnconscious} style={{ ...btnStyle(!!boost), flex: 1, padding: '4px 2px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, opacity: isUnconscious ? 0.35 : 1, cursor: isUnconscious ? 'not-allowed' : 'pointer' }} onClick={() => roll(20, t(`stats.${stat}`), mod, stat)}>
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
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4 }}>
                          <span style={{ fontSize: 24, color: result.flash ? '#fff' : PARCHMENT, transition: 'color 0.2s' }}>🎲 {result.rollDisplay ?? result.roll}</span>
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
                  <div style={{ fontSize: 13, color: `rgba(201,168,76,0.85)`, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{t('gameMode.history')}</div>
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
        <div style={{ borderTop: `1px solid ${SECTION_BORDER}`, paddingTop: 12 }}>
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
                const weaponKey = `ab-${ab.voieNom}-${ab.rangIdx}`
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
                const activationKey = `ab-${ab.voieNom}-${ab.rangIdx}`
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


      </div>
    </div>
  )
}
