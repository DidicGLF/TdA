import { useState, useCallback, useMemo } from 'react'
import { DiceIcon } from './DiceIcon'
import type { Character, Caracteristique } from '../../types/character'
type CharacterPatch = Partial<Character>
import type { DescMap } from '../../types/gameData'
import { computeEffects, sumStat, computeAttaquesTotaux } from '../../utils/computeEffects'
import { useGameData } from '../../context/GameDataContext'

const GOLD = '#c9a84c'
const PARCHMENT = '#f5ecd7'
const BG = '#1a1410'
const SECTION_BORDER = 'rgba(201,168,76,0.2)'

const STATS: Caracteristique[] = ['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA']
const BARE_DICE = [4, 6, 8, 10, 12, 20]


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
  costType?: 'PV' | 'PM'
  rollDisplay?: string
  flash: boolean
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
  cibles: string[]
  choix?: boolean
  cout_pv?: string
  usage?: string
  post_jet?: boolean
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
  const { armes, armures } = useGameData()
  const isMobile = !inline && screenWidth < 700
  const [minimized, setMinimized] = useState(false)
  const [result, setResult] = useState<RollResult | null>(null)
  const [history, setHistory] = useState<RollResult[]>([])
  const [effectCounters, setEffectCounters] = useState<Record<string, number>>({})
  const [activeBoosts, setActiveBoosts] = useState<ActiveBoost[]>([])
  const [pendingStatPick, setPendingStatPick] = useState<{ abIdx: number } | null>(null)
  const [currentPV, setCurrentPV] = useState<number | null>(null)
  const [resultInHistory, setResultInHistory] = useState(false)


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
          if ((grant.minRang ?? 1) > voie.rangs.filter(Boolean).length) continue
          out.push({ voieNom: voie.nom, rangIdx: idx, rangNom: rang.nom, label: grant.label, bonus: grant.bonus, cibles: grant.cibles, choix: grant.choix, cout_pv: grant.cout_pv, usage: grant.usage, post_jet: grant.post_jet })
        }
      })
    }
    return out
  }, [voiesPerso, descriptions])

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
          if ((grant.minRang ?? 1) > voie.rangs.filter(Boolean).length) continue
          out.push({ voieNom: voie.nom, rangIdx: idx, rangNom: rang.nom, label: grant.label, de: grant.de, dm: grant.dm, attType: grant.attType, activable: grant.activable })
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
    return map
  }, [voiesPerso, descriptions])

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
    const mod = action.attType === 'contact' ? attaques.contact : action.attType === 'distance' ? attaques.distance : action.attType === 'magique' ? attaques.magique : null
    const r = Math.floor(Math.random() * action.de) + 1
    const total = mod !== null ? r + mod : r
    const modStr = mod !== null ? (mod >= 0 ? `+${mod}` : String(mod)) : ''
    pushResult({ label: `⚔️ ${action.label} — ATT`, formula: `1d${action.de}${modStr}`, sides: action.de, roll: r, modifier: mod, total, flash: false })
  }

  const handleActionDegats = (action: AvailableAction) => {
    const { formula, total: dm, display: dmDisplay } = rollDmFormula(action.dm)
    pushResult({ label: `💥 ${action.label} — DM`, formula, sides: 6, roll: dm, modifier: null, total: dm, rollDisplay: dmDisplay, flash: false })
  }

  const activateDuration = (ab: AvailableBonus, key: string) => {
    if (!ab.usage) return
    const diceMatch = ab.usage.match(/^(\d*)d(\d+)$/i)
    let duration: number
    if (diceMatch) {
      duration = rollDiceStr(ab.usage)
      const sides = parseInt(diceMatch[2])
      pushHistory({ label: `${ab.label} — durée`, formula: ab.usage, sides, roll: duration, modifier: null, total: duration, flash: false })
    } else {
      duration = parseInt(ab.usage) || 0
    }
    if (duration > 0) setEffectCounters(prev => ({ ...prev, [key]: duration }))
  }

  const handleActivateClick = (ab: AvailableBonus, idx: number) => {
    const key = `ab-${ab.voieNom}-${ab.rangIdx}`
    if (ab.cout_pv) {
      const cost = rollDiceStr(ab.cout_pv)
      const m = ab.cout_pv.match(/^(\d*)d(\d+)$/i)
      const sides = m ? parseInt(m[2]) : 4
      const entry: RollResult = { label: `${ab.label} — coût PV`, formula: ab.cout_pv, sides, roll: cost, modifier: null, total: cost, costType: 'PV', flash: false }
      if (ab.post_jet) {
        // Ne pas écraser le résultat principal, ajouter uniquement à l'historique
        pushHistory(entry)
      } else {
        pushResult(entry)
      }
      const newPV = Math.max(0, pvActuels - cost)
      setCurrentPV(newPV)
      onChange({ pvRestants: newPV })
    }
    activateDuration(ab, key)
    if (ab.choix) {
      setPendingStatPick({ abIdx: idx })
    } else {
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

  const panelStyle: React.CSSProperties = inline
    ? { display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', background: BG }
    : isMobile
      ? { position: 'fixed', bottom: 0, left: 0, right: 0, height: minimized ? 44 : '60vh', zIndex: 8000, display: 'flex', flexDirection: 'column', background: BG, borderTop: `2px solid ${GOLD}`, boxShadow: '0 -4px 24px rgba(0,0,0,0.7)', transition: 'height 0.2s' }
      : { position: 'fixed', top: 0, right: 0, bottom: 0, width: minimized ? 36 : 320, zIndex: 8000, display: 'flex', flexDirection: 'column', background: BG, borderLeft: `2px solid ${GOLD}`, boxShadow: '-4px 0 24px rgba(0,0,0,0.7)', transition: 'width 0.2s' }

  if (!inline && minimized) {
    return (
      <div style={panelStyle} onClick={() => setMinimized(false)}>
        {isMobile ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8, cursor: 'pointer', color: GOLD, fontSize: 16, fontWeight: 700 }}>Mode Jeu</div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', cursor: 'pointer', writingMode: 'vertical-rl', color: GOLD, fontSize: 15, fontWeight: 700, letterSpacing: '0.08em' }}>Mode Jeu</div>
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

  const attaques = useMemo(() => computeAttaquesTotaux(character, descriptions, armes, armures), [character, descriptions, armes, armures])
  const pvFromVoies = useMemo(() => sumStat(computeEffects(character, descriptions)['PV'] ?? []), [character, descriptions])
  const pvTotalEffectif = character.pvTotal + pvFromVoies
  // currentPV est null au premier render → on initialise au max effectif
  const pvActuels = currentPV ?? pvTotalEffectif
  const pvPct = pvTotalEffectif > 0 ? pvActuels / pvTotalEffectif : 0
  const pvColor = pvPct > 0.5 ? '#5cb85c' : pvPct > 0.25 ? '#e8a838' : '#d9534f'

  const formatUsage = (usage: string) => {
    const n = Number(usage)
    return Number.isFinite(n) && usage.trim() !== '' ? `${n} tour${n > 1 ? 's' : ''}` : usage
  }

  const postJetBoosts = result?.stat ? activeBoosts.filter(b => b.stat === result.stat && b.post_jet) : []

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: `1px solid ${SECTION_BORDER}`, flexShrink: 0, gap: 8 }}>
        <span style={{ fontSize: 17, fontWeight: 700, color: GOLD, flex: 1, fontFamily: "'Cinzel', serif" }}>Mode Jeu</span>
        {!inline && <button onClick={() => setMinimized(true)} style={{ background: 'transparent', border: 'none', color: `rgba(245,236,215,0.5)`, cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 4px' }}>—</button>}
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: `rgba(245,236,215,0.5)`, cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 4px' }}>✕</button>
      </div>

      {/* Barre PV / PM */}
      <div style={{ display: 'flex', gap: 16, padding: '8px 14px', borderBottom: `1px solid ${SECTION_BORDER}`, flexShrink: 0, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 26 }}>❤️</span>
          <span style={{ fontSize: 30, fontWeight: 700, color: pvColor }}>{pvActuels}</span>
          <span style={{ fontSize: 20, color: 'rgba(245,236,215,0.3)' }}>/ {pvTotalEffectif}</span>
          <button onClick={() => { setCurrentPV(pvTotalEffectif); onChange({ pvRestants: pvTotalEffectif }) }}
            title="Remettre à plein"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, opacity: pvActuels < pvTotalEffectif ? 0.8 : 0.25, padding: '0 2px', lineHeight: 1 }}>↺</button>
        </div>
        {character.pm > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 26 }}>✨</span>
            <span style={{ fontSize: 30, fontWeight: 700, color: '#7baae8' }}>{character.pm}</span>
          </div>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {activeBoosts.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {activeBoosts.map(b => (
                <span key={b.id} style={{ fontSize: 11, background: 'rgba(201,168,76,0.15)', border: `1px solid rgba(201,168,76,0.4)`, borderRadius: 3, padding: '1px 5px', color: GOLD }}>
                  +{b.bonus} {b.stat}{b.post_jet ? ' (après)' : ''}
                  <button onClick={() => setActiveBoosts(prev => prev.filter(x => x.id !== b.id))} style={{ background: 'none', border: 'none', color: 'rgba(245,236,215,0.4)', cursor: 'pointer', padding: '0 0 0 3px', fontSize: 10, lineHeight: 1 }}>✕</button>
                </span>
              ))}
            </div>
          )}
          <button onClick={handleEndTurn} style={{ ...btnStyle(), padding: '6px 12px', fontSize: 13, whiteSpace: 'nowrap', flexShrink: 0 }}>
            ⏭ Passer le tour
          </button>
        </div>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── Section 1 : Jets rapides ── */}
        <div>
          <div style={{ fontSize: 13, color: `rgba(201,168,76,0.85)`, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Jets rapides</div>

          <div style={{ fontSize: 13, color: `rgba(245,236,215,0.4)`, marginBottom: 4 }}>Attaques</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
            {[
              { label: 'ATT contact', val: attaques.contact },
              { label: 'ATT distance', val: attaques.distance },
              { label: 'ATT magique', val: attaques.magique },
            ].map(({ label, val }) => (
              <button key={label} style={{ ...btnStyle(), flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, padding: '4px 2px' }} onClick={() => roll(20, label, val)}>
                <span style={{ fontSize: 11, color: `rgba(245,236,215,0.5)` }}>{label}</span>
                <span style={{ color: GOLD, fontSize: 22, fontWeight: 700 }}>{val >= 0 ? '+' : ''}{val}</span>
              </button>
            ))}
          </div>

          <div style={{ fontSize: 13, color: `rgba(245,236,215,0.4)`, marginBottom: 4 }}>Caractéristiques</div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 32 }}>
            {STATS.map(stat => {
              const mod = character.caracteristiques[stat]?.mod ?? 0
              const boost = activeBoosts.find(b => b.stat === stat)
              const boostedMod = boost ? mod + boost.bonus : mod
              return (
                <button key={stat} style={{ ...btnStyle(!!boost), flex: 1, padding: '4px 2px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }} onClick={() => roll(20, stat, mod, stat)}>
                  <span style={{ fontSize: 11, color: boost ? '#ffe94d' : `rgba(245,236,215,0.5)`, display: 'flex', alignItems: 'center', gap: 2 }}>
                    {stat}{boost && <span style={{ fontSize: 10 }}>+{boost.bonus}</span>}
                  </span>
                  <span style={{ color: boost ? '#ffe94d' : GOLD, fontSize: 22, fontWeight: 700 }}>{boostedMod >= 0 ? '+' : ''}{boostedMod}</span>
                </button>
              )
            })}
          </div>

          {/* 2 colonnes : [dés + résultat] | [historique] */}
          <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'stretch' }}>

            {/* Colonne 1 : dés (ligne 1) + résultat (ligne 2) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
              {/* Ligne 1 : boutons dés */}
              <div style={{ flex: 1, display: 'flex', gap: 4 }}>
                {BARE_DICE.map(d => (
                  <button key={d} style={{ ...btnStyle(), flex: 1, padding: '2px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }} onClick={() => roll(d, `d${d}`, null)}>
                    <DiceIcon sides={d} size={52} />
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
                return (
                  <div style={{ flex: 1, padding: '10px 12px 42px', background: bgColor, borderRadius: 6, border: `1px solid ${borderColor}`, textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative' }}>
                    {!result && <div style={{ color: `rgba(245,236,215,0.2)`, fontSize: 14 }}>—</div>}
                    {result && <>
                      {isCritSuccess && <div style={{ fontSize: 12, fontWeight: 700, color: '#ffe94d', letterSpacing: '0.1em', marginBottom: 4 }}>✨ SUCCÈS CRITIQUE ✨</div>}
                      {isCritFail    && <div style={{ fontSize: 12, fontWeight: 700, color: '#ff5555', letterSpacing: '0.1em', marginBottom: 4 }}>💀 ÉCHEC CRITIQUE 💀</div>}
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
                          Appliquer {b.label} (+{b.bonus})
                        </button>
                      ))}
                      {result.stat && (() => {
                        const effs = effectsByStatMap.get(result.stat)
                        if (!effs || effs.length === 0) return null
                        return (
                          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', flexDirection: 'column', gap: 2, padding: '4px 8px', background: 'rgba(20,14,30,0.92)', borderTop: '1px solid rgba(160,120,255,0.3)', borderRadius: '0 0 6px 6px' }}>
                            {effs.map((e, i) => (
                              <div key={i} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(140,100,255,0.15)', border: '1px solid rgba(160,120,255,0.3)', borderRadius: 4, padding: '3px 8px' }}>
                                <span style={{ color: `rgba(245,236,215,0.85)`, fontWeight: 600 }}>{e.rangNom}</span>
                                <span style={{ color: `rgba(245,236,215,0.35)`, marginLeft: 'auto', fontSize: 11 }}>rang {e.rangIdx + 1} · {e.voieNom}</span>
                              </div>
                            ))}
                          </div>
                        )
                      })()}
                    </>}
                  </div>
                )
              })()}
            </div>

            {/* Colonne 2 : historique */}
            {(() => {
              const histDisplay = resultInHistory ? history.slice(1) : history
              return (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontSize: 13, color: `rgba(201,168,76,0.85)`, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Historique</div>
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
                                {cs ? '✨ ' : cf ? '💀 ' : ''}{h.costType === 'PV' ? '❤️ ' : h.costType === 'PM' ? '✨ ' : ''}{h.label} ({h.formula})
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
          <div style={{ fontSize: 13, color: `rgba(201,168,76,0.85)`, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Effets en jeu</div>
          {availableBonuses.length === 0 && availableAvantages.length === 0 && availableActions.length === 0 ? (
            <div style={{ padding: '12px 0', textAlign: 'center' }}>
              <div style={{ fontSize: 20, marginBottom: 6 }}>✦</div>
              <div style={{ fontSize: 14, color: `rgba(245,236,215,0.3)`, lineHeight: 1.5 }}>Aucun effet en jeu<br />disponible pour ce personnage</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {availableActions.map((action, i) => (
                <div key={`action-${i}`} style={{ padding: '8px 10px', borderRadius: 5, background: 'rgba(140,100,255,0.08)', border: `1px ${action.activable ? 'solid' : 'dashed'} rgba(160,120,255,0.35)` }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'rgba(200,170,255,0.95)' }}>{action.rangNom}</span>
                    <span style={{ fontSize: 12, color: `rgba(245,236,215,0.3)` }}>rang {action.rangIdx + 1} · {action.voieNom}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(200,170,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>⚔️</span> Action
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: action.activable ? 8 : 0, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, color: PARCHMENT, opacity: 0.6 }}>Attaque : d{action.de} · Dégâts : {action.dm}</span>
                    {!action.activable && (
                      <span style={{ fontSize: 12, background: 'rgba(140,100,255,0.15)', border: '1px solid rgba(160,120,255,0.4)', borderRadius: 3, padding: '1px 7px', color: 'rgba(200,170,255,0.8)', fontWeight: 600 }}>Automatique</span>
                    )}
                  </div>
                  {action.activable && (
                    <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                      <button onClick={() => handleActionAttaque(action)} style={{ flex: 1, fontSize: 14, padding: '6px 10px', borderRadius: 4, cursor: 'pointer', fontWeight: 600, border: '1px solid rgba(160,120,255,0.5)', background: 'rgba(140,100,255,0.15)', color: 'rgba(200,170,255,0.9)' }}>
                        ⚔️ Attaque (d{action.de}{action.attType ? ` + ATT ${action.attType}` : ''})
                      </button>
                      <button onClick={() => handleActionDegats(action)} style={{ flex: 1, fontSize: 14, padding: '6px 10px', borderRadius: 4, cursor: 'pointer', fontWeight: 600, border: '1px solid rgba(160,120,255,0.35)', background: 'rgba(140,100,255,0.08)', color: 'rgba(200,170,255,0.7)' }}>
                        💥 Dégâts ({action.dm})
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {availableAvantages.map((av, i) => (
                <div key={`av-${i}`} style={{ padding: '8px 10px', borderRadius: 5, background: 'rgba(140,100,255,0.08)', border: '1px dashed rgba(160,120,255,0.35)' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'rgba(200,170,255,0.95)' }}>{av.rangNom}</span>
                    <span style={{ fontSize: 12, color: `rgba(245,236,215,0.3)` }}>rang {av.rangIdx + 1} · {av.voieNom}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(200,170,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>🎲</span> Garder le meilleur jet — {av.stat}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                    <span style={{ fontSize: 14, color: PARCHMENT }}>Lancer {av.lancer} dés, garder {av.garder} meilleur{av.garder > 1 ? 's' : ''}</span>
                    <span style={{ fontSize: 12, background: 'rgba(140,100,255,0.15)', border: '1px solid rgba(160,120,255,0.4)', borderRadius: 3, padding: '1px 7px', color: 'rgba(200,170,255,0.8)', fontWeight: 600 }}>Automatique</span>
                  </div>
                </div>
              ))}
              {availableBonuses.map((ab, i) => {
                const isPending = pendingStatPick?.abIdx === i
                return (
                  <div key={i} style={{ padding: '8px 10px', borderRadius: 5, background: isPending ? 'rgba(140,100,255,0.14)' : 'rgba(140,100,255,0.08)', border: `1px solid ${isPending ? 'rgba(160,120,255,0.6)' : 'rgba(160,120,255,0.35)'}` }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: 'rgba(200,170,255,0.95)' }}>{ab.rangNom}</span>
                      <span style={{ fontSize: 12, color: `rgba(245,236,215,0.3)` }}>rang {ab.rangIdx + 1} · {ab.voieNom}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(200,170,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span>⚡</span> Bonus temporaire
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: 14, color: PARCHMENT }}>+{ab.bonus} {ab.cibles.join(ab.choix ? ' ou ' : ' + ')}</span>
                      {ab.cout_pv && <span style={{ fontSize: 13, color: 'rgba(220,80,80,0.9)', background: 'rgba(220,50,50,0.1)', border: '1px solid rgba(220,50,50,0.3)', borderRadius: 3, padding: '1px 6px' }}>{ab.cout_pv} PV</span>}
                      {ab.usage && <span style={{ fontSize: 13, color: `rgba(245,236,215,0.5)`, background: 'rgba(0,0,0,0.3)', border: `1px solid rgba(160,120,255,0.25)`, borderRadius: 3, padding: '1px 6px' }}>{formatUsage(ab.usage)}</span>}
                      {ab.post_jet && <span style={{ fontSize: 13, color: 'rgba(200,170,255,0.6)', fontStyle: 'italic' }}>après jet</span>}
                    </div>
                    {!isPending ? (
                      <button onClick={() => handleActivateClick(ab, i)} style={{ width: '100%', fontSize: 14, padding: '6px 10px', borderRadius: 4, cursor: 'pointer', fontWeight: 600, border: '1px solid rgba(160,120,255,0.5)', background: 'rgba(140,100,255,0.15)', color: 'rgba(200,170,255,0.9)', marginBottom: 6 }}>
                        ⚡ Activer
                      </button>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 6 }}>
                        <span style={{ fontSize: 12, color: `rgba(245,236,215,0.6)` }}>Choisir la stat à booster :</span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {ab.cibles.map(stat => (
                            <button key={stat} onClick={() => handleStatPick(ab, stat)} style={{ flex: 1, fontSize: 13, padding: '6px 10px', borderRadius: 4, cursor: 'pointer', fontWeight: 600, border: '1px solid rgba(160,120,255,0.7)', background: 'rgba(140,100,255,0.25)', color: 'rgba(220,200,255,0.95)' }}>
                              +{ab.bonus} {stat}
                            </button>
                          ))}
                          <button onClick={() => setPendingStatPick(null)} style={{ ...btnStyle(false), padding: '6px 10px', fontSize: 13 }}>✕</button>
                        </div>
                      </div>
                    )}
                    {(() => {
                      const key = `ab-${ab.voieNom}-${ab.rangIdx}`
                      const val = effectCounters[key] ?? 0
                      if (val <= 0) return null
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, borderTop: '1px solid rgba(160,120,255,0.15)', paddingTop: 6 }}>
                          <span style={{ flex: 1, fontSize: 11, color: 'rgba(245,236,215,0.3)' }}>Effet actif</span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: GOLD }}>{val} tour{val > 1 ? 's' : ''}</span>
                        </div>
                      )
                    })()}
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
