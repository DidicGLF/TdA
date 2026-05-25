import React, { useState } from 'react'
import type { Character, VoiePersonnage } from '../types/character'
import { getMod } from '../types/character'
import {
  VOIE_KEYS,
  coutRangPourVoie, prochainRang, recalcAttaques, parseDeVie, rollDie,
} from '../utils/levelUp'
import type { VoieKey } from '../utils/levelUp'
import VoieCombobox from './VoieCombobox'
import { VOIES } from '../data/voies'
import { computeEffects, sumStat } from '../utils/computeEffects'
import DESCRIPTIONS_RAW from '../data/descriptions.json'

type DescEffectSimple = { stat: string; value?: number; minRang?: number; avancee?: boolean }
type DescEntrySimple = { nom: string; desc: string; effects?: DescEffectSimple[] }
const DESCRIPTIONS = DESCRIPTIONS_RAW as Record<string, DescEntrySimple[]>

interface Props {
  character: Character
  onConfirm: (patch: Partial<Character>) => void
  onClose: () => void
}

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.12em',
  color: 'rgba(201,168,76,0.55)', marginBottom: 10,
}

const BTN_BASE: React.CSSProperties = {
  padding: '7px 18px', borderRadius: 6, cursor: 'pointer', fontSize: 15,
  fontFamily: 'inherit', transition: 'background 0.15s',
}

const FORMATIONS_MARTIALES = [
  'Armes de guerre', 'Armes de guerre lourdes', 'Armes de duel',
  "Armes d'hast", 'Armes de trait', 'Armes de tir', 'Armes de jet',
  'Armures légères', 'Armures lourdes',
]

export default function LevelUpModal({ character, onClose, onConfirm }: Props) {
  const maxNiveau = 20
  const conBonus = sumStat(computeEffects(character)['CON'] ?? [])
  const deFaces = parseDeVie(character.deVie)
  const usedNoms = new Set(VOIE_KEYS.map(k => (character[k] as VoiePersonnage).nom).filter(Boolean))
  const voiesDisponibles = VOIES.filter(v => !usedNoms.has(v.nom))
  const pmGainParNiveau = character.famille === 'mystiques' ? 2 : 1

  const [levelsGained, setLevelsGained] = useState(1)
  const [jets, setJets] = useState<(number | null)[]>([null])
  const [selections, setSelections] = useState<Partial<Record<VoieKey, number>>>({})
  const [formationsAchetées, setFormationsAchetées] = useState<string[]>([])
  const [prestigeNom, setPrestigeNom] = useState((character.voiePrestige as VoiePersonnage).nom)
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  // Per-level conMod: ranks from selections are allocated greedily (2 pts/level),
  // and any CON bonus gained mid-batch applies to subsequent levels.
  const conModPerLevel: number[] = (() => {
    const rankSteps: Array<{ nomVoie: string; rankIdx: number; cost: number }> = []
    for (const [key, count] of Object.entries(selections) as [VoieKey, number][]) {
      if (!count) continue
      const voie = character[key] as VoiePersonnage
      const nom = key === 'voiePrestige' ? prestigeNom : voie.nom
      if (!nom) continue
      const firstNext = prochainRang(voie)
      if (firstNext === null) continue
      for (let i = 0; i < count; i++)
        rankSteps.push({ nomVoie: nom, rankIdx: firstNext + i, cost: coutRangPourVoie(key, firstNext + i) })
    }
    let bonusFromSelections = 0
    let stepIdx = 0
    let ptsBudget = 0
    return Array.from({ length: levelsGained }, () => {
      ptsBudget += 2
      while (stepIdx < rankSteps.length && rankSteps[stepIdx].cost <= ptsBudget) {
        const { nomVoie, rankIdx } = rankSteps[stepIdx]
        for (const effect of DESCRIPTIONS[nomVoie]?.[rankIdx]?.effects ?? []) {
          if (!effect.avancee && effect.stat === 'CON' && effect.value !== undefined && !effect.minRang)
            bonusFromSelections += effect.value
        }
        ptsBudget -= rankSteps[stepIdx].cost
        stepIdx++
      }
      return getMod(character.caracteristiques.CON.valeur + conBonus + bonusFromSelections)
    })
  })()

  const newNiveau = character.niveau + levelsGained
  const atLevel8Unlock = character.niveau < 8 && newNiveau >= 8
  const ptsTotal = 2 * levelsGained
  const pmGain = pmGainParNiveau * levelsGained

  React.useEffect(() => {
    setJets(Array(levelsGained).fill(null))
    setSelections({})
    setFormationsAchetées([])
  }, [levelsGained])

  // Si les sélections changent après un lancer, remettre les dés à zéro
  React.useEffect(() => {
    setJets(prev => prev.some(j => j !== null) ? Array(prev.length).fill(null) : prev)
  }, [selections])

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const rollAll = () => setJets(Array.from({ length: levelsGained }, () => rollDie(deFaces)))
  const rollOne = (i: number) => setJets(prev => { const n = [...prev]; n[i] = rollDie(deFaces); return n })
  const setJet = (i: number, val: number | null) => setJets(prev => { const n = [...prev]; n[i] = val; return n })

  const allRolled = jets.every(j => j !== null)
  const pvGagnes = allRolled ? jets.reduce<number>((sum, jet, i) => sum + jet! + conModPerLevel[i], 0) : null

  // Calcul des points dépensés en tenant compte des rangs multiples par voie
  const ptsDépensés = (Object.entries(selections) as [VoieKey, number][]).reduce((sum, [key, count]) => {
    if (!count) return sum
    const voie = character[key] as VoiePersonnage
    const firstNext = prochainRang(voie) ?? voie.rangs.length
    let cost = 0
    for (let i = 0; i < count; i++) cost += coutRangPourVoie(key, firstNext + i)
    return sum + cost
  }, 0) + formationsAchetées.length
  const ptsRestants = ptsTotal - ptsDépensés
  const canRoll = ptsRestants === 0

  const toggleFormation = (nom: string) =>
    setFormationsAchetées(prev => prev.includes(nom) ? prev.filter(f => f !== nom) : [...prev, nom])

  const addRang = (key: VoieKey) => {
    const voie = character[key] as VoiePersonnage
    const firstNext = prochainRang(voie)
    if (firstNext === null) return
    const current = selections[key] ?? 0
    const nextIdx = firstNext + current
    if (nextIdx >= voie.rangs.length) return
    if (coutRangPourVoie(key, nextIdx) > ptsRestants) return
    setSelections(prev => ({ ...prev, [key]: current + 1 }))
  }

  const removeRang = (key: VoieKey) => {
    const current = selections[key] ?? 0
    if (current === 0) return
    setSelections(prev => {
      if (current === 1) { const c = { ...prev }; delete c[key]; return c }
      return { ...prev, [key]: current - 1 }
    })
  }

  const voiesActives = VOIE_KEYS.filter(k => {
    if (k === 'voiePrestige') return newNiveau >= 8 && (!!(character.voiePrestige as VoiePersonnage).nom || !!prestigeNom)
    return !!(character[k] as VoiePersonnage).nom
  })

  const canConfirm = pvGagnes !== null && ptsRestants === 0

  const base = character.niveau1Base
  const handleReset = () => {
    const emptyRangs: [boolean, boolean, boolean, boolean, boolean] = [false, false, false, false, false]
    const voiesPatch = Object.fromEntries(
      VOIE_KEYS.map(k => [k, { ...(character[k] as VoiePersonnage), rangs: [...emptyRangs] }])
    )
    onConfirm({
      niveau: 1,
      pvTotal: base?.pvTotal ?? 0,
      pvRestants: base?.pvTotal ?? 0,
      pm: base?.pm ?? 0,
      attaqueContact: base?.attaqueContact ?? recalcAttaques(character, 1).attaqueContact,
      attaqueDistance: base?.attaqueDistance ?? recalcAttaques(character, 1).attaqueDistance,
      attaqueMagique: base?.attaqueMagique ?? recalcAttaques(character, 1).attaqueMagique,
      pvHistorique: [],
      ...voiesPatch,
    })
    onClose()
  }

  const handleConfirm = () => {
    if (!canConfirm) return
    const voiesPatch: Partial<Character> = {}
    for (const key of VOIE_KEYS) {
      const count = selections[key]
      if (!count) continue
      const voie = character[key] as VoiePersonnage
      const nom = key === 'voiePrestige' ? prestigeNom : voie.nom
      const firstNext = prochainRang(voie)!
      const newRangs = [...voie.rangs]
      for (let i = 0; i < count; i++) newRangs[firstNext + i] = true
      voiesPatch[key] = { ...voie, nom, rangs: newRangs }
    }
    if (prestigeNom && !(character.voiePrestige as VoiePersonnage).nom && !selections.voiePrestige) {
      voiesPatch.voiePrestige = { ...(character.voiePrestige as VoiePersonnage), nom: prestigeNom }
    }
    // Capturer le snapshot niveau 1 lors du premier level-up depuis le niveau 1
    const niveau1BasePatch = character.niveau === 1 && !character.niveau1Base ? {
      niveau1Base: {
        pvTotal: character.pvTotal,
        pm: character.pm,
        attaqueContact: character.attaqueContact,
        attaqueDistance: character.attaqueDistance,
        attaqueMagique: character.attaqueMagique,
      }
    } : {}
    const nouvellesEntrees = jets.map((jet, i) => ({
      niveauDe: character.niveau + 1 + i,
      niveauA: character.niveau + 1 + i,
      jet: jet!,
      conMod: conModPerLevel[i],
      total: jet! + conModPerLevel[i],
    }))
    onConfirm({
      niveau: newNiveau,
      pvTotal: character.pvTotal + pvGagnes!,
      pvRestants: character.pvRestants + pvGagnes!,
      pm: character.pm + pmGain,
      ...recalcAttaques(character, newNiveau),
      ...voiesPatch,
      ...(formationsAchetées.length > 0 ? { formationsMartiales: [...character.formationsMartiales, ...formationsAchetées] } : {}),
      ...niveau1BasePatch,
      pvHistorique: [...(character.pvHistorique ?? []), ...nouvellesEntrees],
    })
    onClose()
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.88)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px 16px',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'rgba(18,14,9,0.98)',
        border: '1px solid rgba(201,168,76,0.45)',
        borderRadius: 8, maxWidth: 560, width: '100%',
        maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 12px 64px rgba(0,0,0,0.9)',
      }}>

        {/* En-tête */}
        <div style={{
          padding: '16px 20px 12px',
          borderBottom: '1px solid rgba(201,168,76,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <h2 style={{
            margin: 0, fontSize: 20, fontWeight: 700,
            color: 'var(--tdr-gold)', fontFamily: "'Cinzel', serif", letterSpacing: '0.05em',
          }}>
            {levelsGained === 1
              ? `Passage au niveau ${newNiveau}`
              : `Passage du niveau ${character.niveau} au niveau ${newNiveau}`}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(245,236,215,0.45)', fontSize: 22, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '18px 20px 22px', display: 'flex', flexDirection: 'column', gap: 22 }}>

          {/* ── Niveaux gagnés ── */}
          <section>
            <div style={SECTION_LABEL}>Niveaux gagnés</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                onClick={() => setLevelsGained(l => Math.max(1, l - 1))}
                disabled={levelsGained <= 1}
                style={{
                  ...BTN_BASE, padding: '4px 14px', fontSize: 18,
                  border: '1px solid rgba(201,168,76,0.35)',
                  background: 'transparent',
                  color: levelsGained <= 1 ? 'rgba(201,168,76,0.25)' : 'var(--tdr-gold)',
                  cursor: levelsGained <= 1 ? 'not-allowed' : 'pointer',
                }}
              >−</button>
              <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--tdr-gold)', minWidth: 32, textAlign: 'center' }}>
                {levelsGained}
              </span>
              <button
                onClick={() => setLevelsGained(l => Math.min(maxNiveau - character.niveau, l + 1))}
                disabled={newNiveau >= maxNiveau}
                style={{
                  ...BTN_BASE, padding: '4px 14px', fontSize: 18,
                  border: '1px solid rgba(201,168,76,0.35)',
                  background: 'transparent',
                  color: newNiveau >= maxNiveau ? 'rgba(201,168,76,0.25)' : 'var(--tdr-gold)',
                  cursor: newNiveau >= maxNiveau ? 'not-allowed' : 'pointer',
                }}
              >+</button>
              <span style={{ fontSize: 14, color: 'rgba(245,236,215,0.4)' }}>
                Niveau {character.niveau} → {newNiveau}
              </span>
            </div>
          </section>

          {/* ── Attaques ── */}
          <section>
            <div style={SECTION_LABEL}>Scores d'attaque</div>
            <div style={{ fontSize: 16, color: 'rgba(245,236,215,0.8)' }}>
              Contact, distance et magique :{' '}
              <span style={{ color: 'var(--tdr-gold)', fontWeight: 600 }}>+{levelsGained} chacun</span>
              <span style={{ fontSize: 13, color: 'rgba(245,236,215,0.4)', marginLeft: 8 }}>(automatique)</span>
            </div>
          </section>

          {/* ── Points de magie ── */}
          <section>
            <div style={SECTION_LABEL}>Points de magie</div>
            <div style={{ fontSize: 16, color: 'rgba(245,236,215,0.8)' }}>
              <span style={{ color: 'var(--tdr-gold)', fontWeight: 600 }}>+{pmGain} PM</span>
              <span style={{ fontSize: 13, color: 'rgba(245,236,215,0.4)', marginLeft: 8 }}>
                {character.famille === 'mystiques' ? `2 × ${levelsGained} niveau${levelsGained > 1 ? 'x' : ''}` : `+1 par niveau`}
              </span>
            </div>
            <div style={{ fontSize: 13, color: 'rgba(245,236,215,0.35)', marginTop: 4 }}>
              {character.pm} → <span style={{ color: 'var(--tdr-gold)' }}>{character.pm + pmGain}</span>
            </div>
          </section>

          {/* ── Nouvelle voie (facultatif au niveau 8) ── */}
          {atLevel8Unlock && (
            <section style={{
              border: '1px solid rgba(201,168,76,0.3)',
              borderRadius: 8, padding: '14px 16px',
              background: 'rgba(201,168,76,0.04)',
            }}>
              <div style={{ ...SECTION_LABEL, color: 'rgba(201,168,76,0.75)', marginBottom: 8 }}>
                ✦ Nouvelle voie (facultatif) — niveau 8
              </div>
              <p style={{ fontSize: 14, color: 'rgba(245,236,215,0.6)', margin: '0 0 12px' }}>
                En atteignant le niveau 8, vous pouvez débloquer une voie de prestige ou une quatrième voie. C'est facultatif — vous pouvez aussi ne rien choisir.
              </p>
              {!character.voiePrestige.nom && (
                <div>
                  <div style={{ fontSize: 12, color: 'rgba(245,236,215,0.4)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Choisir une voie (facultatif)</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <VoieCombobox
                        value={prestigeNom}
                        onChange={nom => {
                          setPrestigeNom(nom)
                          if (!nom) setSelections(prev => { const c = { ...prev }; delete c.voiePrestige; return c })
                        }}
                        options={voiesDisponibles}
                        alreadyChosen={[...usedNoms]}
                      />
                    </div>
                    {prestigeNom && (
                      <button
                        onClick={() => {
                          setPrestigeNom('')
                          setSelections(prev => { const c = { ...prev }; delete c.voiePrestige; return c })
                        }}
                        style={{
                          ...BTN_BASE, padding: '5px 12px', fontSize: 13,
                          border: '1px solid rgba(201,168,76,0.25)',
                          background: 'transparent', color: 'rgba(245,236,215,0.4)',
                        }}
                      >Annuler</button>
                    )}
                  </div>
                  {prestigeNom && (
                    <p style={{ fontSize: 13, color: 'rgba(245,236,215,0.4)', margin: '6px 0 0' }}>
                      La voie apparaît ci-dessous pour y dépenser des points.
                    </p>
                  )}
                </div>
              )}
            </section>
          )}

          {/* ── Points de capacité ── */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={SECTION_LABEL}>Points de capacité</div>
              <div style={{
                fontSize: 14, fontWeight: 700,
                color: ptsRestants === 0 ? 'rgba(120,210,120,0.9)' : 'var(--tdr-gold)',
                background: 'rgba(201,168,76,0.1)', borderRadius: 4, padding: '3px 12px',
              }}>
                {ptsRestants} / {ptsTotal} restants
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {voiesActives.map(key => {
                const voie = character[key] as VoiePersonnage
                const firstNext = prochainRang(voie)
                const bought = selections[key] ?? 0
                const maxed = firstNext === null
                const nextIdx = firstNext !== null ? firstNext + bought : null
                const canAdd = nextIdx !== null && nextIdx < voie.rangs.length && coutRangPourVoie(key, nextIdx) <= ptsRestants
                const costNext = nextIdx !== null ? coutRangPourVoie(key, nextIdx) : 0

                // Rangs affichés : acquis + sélectionnés
                const rangsDisplay = voie.rangs.map((acquis, i) => {
                  if (acquis) return 'acquis'
                  if (firstNext !== null && i >= firstNext && i < firstNext + bought) return 'nouveau'
                  if (firstNext !== null && i === firstNext + bought) return 'prochain'
                  return 'vide'
                })

                return (
                  <div key={key} style={{
                    border: `1px solid ${bought > 0 ? 'rgba(201,168,76,0.55)' : 'rgba(201,168,76,0.15)'}`,
                    borderRadius: 6, padding: '10px 14px',
                    background: bought > 0 ? 'rgba(201,168,76,0.07)' : 'transparent',
                    opacity: maxed && bought === 0 ? 0.4 : 1,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      <div>
                        <div style={{ fontSize: 16, color: 'var(--tdr-parchment)', fontWeight: 500 }}>{key === 'voiePrestige' ? (prestigeNom || voie.nom) : voie.nom}</div>
                        <div style={{ fontSize: 12, color: 'rgba(245,236,215,0.4)', marginTop: 3 }}>
                          {maxed && bought === 0
                            ? 'Tous les rangs acquis'
                            : bought > 0
                            ? `${bought} rang${bought > 1 ? 's' : ''} sélectionné${bought > 1 ? 's' : ''} · ${ptsDépensés} pt${ptsDépensés > 1 ? 's' : ''} dépensé${ptsDépensés > 1 ? 's' : ''}`
                            : `Rang ${(firstNext ?? 0) + 1} disponible · ${costNext} pt${costNext > 1 ? 's' : ''}`}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        {/* Indicateurs de rang */}
                        <div style={{ display: 'flex', gap: 3 }}>
                          {rangsDisplay.map((état, i) => (
                            <div key={i} style={{
                              width: 13, height: 13, borderRadius: 3,
                              background: état === 'acquis' ? 'var(--tdr-gold)'
                                : état === 'nouveau' ? 'rgba(120,210,120,0.7)'
                                : état === 'prochain' && canAdd ? 'rgba(201,168,76,0.22)'
                                : 'rgba(255,255,255,0.07)',
                              border: état === 'prochain' || état === 'nouveau'
                                ? '1px solid rgba(201,168,76,0.55)'
                                : '1px solid rgba(255,255,255,0.1)',
                              transition: 'background 0.15s',
                            }} />
                          ))}
                        </div>

                        {/* Boutons +/- */}
                        {!maxed && (
                          <div style={{ display: 'flex', gap: 3, marginLeft: 4 }}>
                            <button
                              disabled={bought === 0}
                              onClick={() => removeRang(key)}
                              style={{
                                ...BTN_BASE, padding: '3px 9px', fontSize: 14,
                                border: '1px solid rgba(201,168,76,0.35)',
                                background: bought > 0 ? 'rgba(201,168,76,0.12)' : 'transparent',
                                color: bought > 0 ? 'var(--tdr-gold)' : 'rgba(201,168,76,0.25)',
                                cursor: bought > 0 ? 'pointer' : 'not-allowed',
                              }}
                            >−</button>
                            <button
                              disabled={!canAdd}
                              onClick={() => addRang(key)}
                              style={{
                                ...BTN_BASE, padding: '3px 9px', fontSize: 14,
                                border: `1px solid ${canAdd ? 'rgba(201,168,76,0.5)' : 'rgba(201,168,76,0.2)'}`,
                                background: canAdd ? 'rgba(201,168,76,0.12)' : 'transparent',
                                color: canAdd ? 'var(--tdr-gold)' : 'rgba(201,168,76,0.25)',
                                cursor: canAdd ? 'pointer' : 'not-allowed',
                              }}
                            >+</button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}

              {voiesActives.length === 0 && (
                <div style={{ fontSize: 14, color: 'rgba(245,236,215,0.4)', fontStyle: 'italic' }}>
                  Aucune voie assignée.
                </div>
              )}

              {/* Formations martiales supplémentaires */}
              {(() => {
                const disponibles = FORMATIONS_MARTIALES.filter(f => !character.formationsMartiales.includes(f))
                if (disponibles.length === 0) return null
                return (
                  <div style={{ marginTop: 4, borderTop: '1px solid rgba(201,168,76,0.12)', paddingTop: 14 }}>
                    <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(201,168,76,0.5)', marginBottom: 8 }}>
                      Formations martiales — 1 pt chacune
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {disponibles.map(f => {
                        const isSelected = formationsAchetées.includes(f)
                        const canAfford = isSelected || ptsRestants >= 1
                        return (
                          <button
                            key={f}
                            disabled={!canAfford}
                            onClick={() => toggleFormation(f)}
                            style={{
                              ...BTN_BASE, padding: '4px 12px', fontSize: 13,
                              border: `1px solid ${isSelected ? 'rgba(120,210,120,0.6)' : canAfford ? 'rgba(201,168,76,0.35)' : 'rgba(201,168,76,0.12)'}`,
                              background: isSelected ? 'rgba(120,210,120,0.1)' : 'transparent',
                              color: isSelected ? 'rgba(120,210,120,0.9)' : canAfford ? 'var(--tdr-parchment)' : 'rgba(245,236,215,0.25)',
                              cursor: canAfford ? 'pointer' : 'not-allowed',
                            }}
                          >
                            {isSelected && <span style={{ marginRight: 4 }}>✓</span>}{f}
                            <span style={{ opacity: 0.5, fontSize: 11, marginLeft: 5 }}>· 1 pt</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}

              {/* Voie de prestige verrouillée si niveau cible < 8 */}
              {newNiveau < 8 && !!(character.voiePrestige as VoiePersonnage).nom && (
                <div style={{
                  border: '1px solid rgba(201,168,76,0.1)', borderRadius: 6, padding: '10px 14px',
                  opacity: 0.4,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: 16, color: 'var(--tdr-parchment)', fontWeight: 500 }}>
                        {(character.voiePrestige as VoiePersonnage).nom}
                      </div>
                      <div style={{ fontSize: 12, color: 'rgba(245,236,215,0.4)', marginTop: 3 }}>
                        Voie de prestige · disponible à partir du niveau 8
                      </div>
                    </div>
                    <span style={{ fontSize: 18, color: 'rgba(245,236,215,0.3)' }}>🔒</span>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* ── Points de vie ── */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={SECTION_LABEL}>
                Points de vie · {levelsGained > 1 ? `${levelsGained}×` : ''}{character.deVie} + Mod.CON{(() => { const unique = [...new Set(conModPerLevel)]; return unique.length === 1 ? ` (${unique[0] >= 0 ? '+' : ''}${unique[0]})` : ` (variable)` })()} par niveau
              </div>
              {levelsGained > 1 && (
                <button
                  onClick={rollAll}
                  disabled={!canRoll}
                  style={{
                    ...BTN_BASE, padding: '4px 12px', fontSize: 13,
                    border: `1px solid ${canRoll ? 'rgba(201,168,76,0.5)' : 'rgba(201,168,76,0.2)'}`,
                    background: allRolled ? 'rgba(201,168,76,0.18)' : 'rgba(201,168,76,0.06)',
                    color: canRoll ? 'var(--tdr-gold)' : 'rgba(201,168,76,0.3)', fontWeight: 600,
                    cursor: canRoll ? 'pointer' : 'not-allowed',
                  }}
                >Lancer tous</button>
              )}
            </div>
            {!canRoll && (
              <div style={{ fontSize: 12, color: 'rgba(201,168,76,0.5)', marginBottom: 8, fontStyle: 'italic' }}>
                Dépense tous tes points de voies avant de lancer les dés.
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {jets.map((jet, i) => {
                const niv = character.niveau + 1 + i
                const lvlConMod = conModPerLevel[i]
                const pvCeNiveau = jet !== null ? jet + lvlConMod : null
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 13, color: 'rgba(201,168,76,0.6)', minWidth: 52, flexShrink: 0 }}>Niv.{niv}</span>
                    <button
                      onClick={() => rollOne(i)}
                      disabled={!canRoll}
                      style={{
                        ...BTN_BASE, padding: '3px 12px', fontSize: 13,
                        border: `1px solid ${canRoll ? 'rgba(201,168,76,0.4)' : 'rgba(201,168,76,0.18)'}`,
                        background: jet !== null ? 'rgba(201,168,76,0.15)' : 'rgba(201,168,76,0.05)',
                        color: canRoll ? 'var(--tdr-gold)' : 'rgba(201,168,76,0.3)', fontWeight: 600, flexShrink: 0,
                        cursor: canRoll ? 'pointer' : 'not-allowed',
                      }}
                    >{character.deVie}</button>
                    <input
                      type="number" min={1} max={deFaces}
                      placeholder={`1–${deFaces}`}
                      value={jet ?? ''}
                      onChange={e => {
                        const v = parseInt(e.target.value)
                        setJet(i, isNaN(v) ? null : Math.max(1, Math.min(deFaces, v)))
                      }}
                      style={{
                        width: 70, padding: '4px 8px', borderRadius: 4,
                        border: `1px solid ${jet !== null ? 'rgba(201,168,76,0.5)' : 'rgba(201,168,76,0.25)'}`,
                        background: 'rgba(15,12,8,0.92)', color: 'var(--tdr-parchment)',
                        fontSize: 15, outline: 'none', fontFamily: 'inherit', textAlign: 'center',
                      }}
                    />
                    {pvCeNiveau !== null && (
                      <span style={{ fontSize: 14, color: 'rgba(245,236,215,0.6)' }}>
                        {lvlConMod !== 0 && <span style={{ opacity: 0.5 }}>{jet} {lvlConMod >= 0 ? '+' : '−'} {Math.abs(lvlConMod)} = </span>}
                        <span style={{ color: 'var(--tdr-gold)', fontWeight: 700 }}>+{pvCeNiveau} PV</span>
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
            {pvGagnes !== null && levelsGained > 1 && (
              <div style={{ marginTop: 10, fontSize: 15, color: 'rgba(245,236,215,0.7)', borderTop: '1px solid rgba(201,168,76,0.15)', paddingTop: 8 }}>
                Total : <span style={{ color: 'var(--tdr-gold)', fontWeight: 700, fontSize: 17 }}>+{pvGagnes} PV</span>
              </div>
            )}
          </section>

          {/* ── Reset niveau 1 ── */}
          {showResetConfirm ? (
            <div style={{
              border: '1px solid rgba(200,80,80,0.4)', borderRadius: 6,
              padding: '14px 16px', background: 'rgba(200,80,80,0.06)',
            }}>
              <div style={{ fontSize: 14, color: 'rgba(245,200,200,0.9)', marginBottom: 8 }}>
                Tous les rangs de voies seront effacés. Les scores seront restaurés à :
              </div>
              <div style={{ fontSize: 13, color: 'rgba(245,236,215,0.6)', marginBottom: 12, lineHeight: 1.8 }}>
                {base ? (
                  <>
                    PV : <strong style={{ color: 'var(--tdr-gold)' }}>{base.pvTotal}</strong>
                    {' · '}PM : <strong style={{ color: 'var(--tdr-gold)' }}>{base.pm}</strong>
                    {' · '}Attaques : <strong style={{ color: 'var(--tdr-gold)' }}>+{base.attaqueContact} / +{base.attaqueDistance} / +{base.attaqueMagique}</strong>
                  </>
                ) : (
                  <span style={{ color: 'rgba(245,200,200,0.55)', fontStyle: 'italic' }}>
                    Snapshot niveau 1 non disponible — PV, PM et attaques seront remis à 0.<br />
                    Astuce : faites une montée de niveau depuis le niveau 1 pour l'enregistrer.
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setShowResetConfirm(false)}
                  style={{ ...BTN_BASE, border: '1px solid rgba(245,236,215,0.2)', background: 'transparent', color: 'rgba(245,236,215,0.5)' }}
                >Annuler</button>
                <button
                  onClick={handleReset}
                  style={{ ...BTN_BASE, fontWeight: 600, border: '1px solid rgba(200,80,80,0.6)', background: 'rgba(200,80,80,0.15)', color: 'rgba(240,120,120,0.95)' }}
                >Confirmer la réinitialisation</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowResetConfirm(true)}
              style={{
                ...BTN_BASE, fontSize: 13, alignSelf: 'flex-start',
                border: '1px solid rgba(200,80,80,0.3)', background: 'transparent',
                color: 'rgba(200,100,100,0.7)',
              }}
            >
              Réinitialiser au niveau 1…
            </button>
          )}

          {/* ── Historique PV ── */}
          {character.pvHistorique && character.pvHistorique.length > 0 && (
            <div style={{ borderTop: '1px solid rgba(201,168,76,0.15)', paddingTop: 12 }}>
              <div style={{ ...SECTION_LABEL, marginBottom: 6 }}>Historique des points de vie</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {character.pvHistorique.map((entry, i) => (
                  <div key={i} style={{
                    fontSize: 12, padding: '3px 8px', borderRadius: 3,
                    background: 'rgba(201,168,76,0.07)', border: '1px solid rgba(201,168,76,0.2)',
                    color: 'rgba(245,236,215,0.7)', whiteSpace: 'nowrap',
                  }}>
                    <span style={{ color: 'rgba(201,168,76,0.6)', marginRight: 4 }}>Niv.{entry.niveauDe}</span>
                    <span style={{ color: 'var(--tdr-parchment)', fontWeight: 600 }}>+{entry.total} PV</span>
                    {entry.conMod !== 0 && (
                      <span style={{ opacity: 0.45, marginLeft: 4 }}>
                        ({entry.jet} {entry.conMod >= 0 ? '+' : '−'} {Math.abs(entry.conMod)} CON)
                      </span>
                    )}
                    {entry.conMod === 0 && (
                      <span style={{ opacity: 0.45, marginLeft: 4 }}>({entry.jet})</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Boutons principaux ── */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4, borderTop: '1px solid rgba(201,168,76,0.15)' }}>
            <button onClick={onClose} style={{ ...BTN_BASE, border: '1px solid rgba(201,168,76,0.25)', background: 'transparent', color: 'rgba(245,236,215,0.55)' }}>
              Annuler
            </button>
            <button
              disabled={!canConfirm}
              onClick={handleConfirm}
              title={!canConfirm ? (!allRolled ? 'Lancez le dé de vie' : 'Dépensez tous les points de capacité') : ''}
              style={{
                ...BTN_BASE, fontWeight: 600,
                border: `1px solid ${canConfirm ? 'rgba(201,168,76,0.65)' : 'rgba(201,168,76,0.2)'}`,
                background: canConfirm ? 'rgba(201,168,76,0.2)' : 'transparent',
                color: canConfirm ? 'var(--tdr-gold)' : 'rgba(201,168,76,0.3)',
                cursor: canConfirm ? 'pointer' : 'not-allowed',
              }}
            >
              Confirmer niveau {newNiveau}
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}
