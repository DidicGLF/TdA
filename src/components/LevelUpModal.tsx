import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useModalBackButton } from '../hooks/useModalBackButton'
import type { Character, VoiePersonnage } from '../types/character'
import { getMod, getGolemVoieRang } from '../types/character'
import {
  VOIE_KEYS,
  coutRangPourVoie, prochainRang, recalcAttaques, parseDeVie, rollDie,
} from '../utils/levelUp'
import type { VoieKey } from '../utils/levelUp'
import VoieCombobox from './VoieCombobox'
import { computeEffects, sumStat } from '../utils/computeEffects'
import { getEffectChoixGrants } from '../utils/effectsChoix'
import { useGameData } from '../context/GameDataContext'

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
  useModalBackButton(onClose)
  const { t } = useTranslation()
  const maxNiveau = 20
  const { data, voies, hiddenVoies, showHidden } = useGameData()
  const conBonus = sumStat(computeEffects(character, data)['CON'] ?? [])
  const deFaces = parseDeVie(character.deVie)
  const usedNoms = new Set(VOIE_KEYS.map(k => (character[k] as VoiePersonnage).nom).filter(Boolean))
  const voiesDisponibles = voies.filter(v => !usedNoms.has(v.nom) && (showHidden || !hiddenVoies.includes(v.nom)))
  const pmGainParNiveau = character.famille === 'mystiques' ? 2 : 1

  const [levelsGained, setLevelsGained] = useState(1)
  const [jets, setJets] = useState<(number | null)[]>([null])
  const [selections, setSelections] = useState<Partial<Record<VoieKey, number>>>({})
  const [formationsAchetées, setFormationsAchetées] = useState<string[]>([])
  const [avancesAchetées, setAvancesAchetées] = useState<Partial<Record<VoieKey, number[]>>>({})
  const [prestigeNom, setPrestigeNom] = useState((character.voiePrestige as VoiePersonnage).nom)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [pendingEffectsChoix, setPendingEffectsChoix] = useState<Record<string, string>>({})

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
        for (const effect of data[nomVoie]?.[rankIdx]?.effects ?? []) {
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

  const currentGolemRang = getGolemVoieRang(character)
  const golemVoieKey = VOIE_KEYS.find(k => (character[k] as VoiePersonnage).nom === 'Voie des golems')
  const newGolemRang = currentGolemRang + (golemVoieKey ? (selections[golemVoieKey] ?? 0) : 0)
  const golemNotifs: string[] = []
  if (currentGolemRang < 2 && newGolemRang >= 2) golemNotifs.push(t('levelUp.golemRang2'))
  if (currentGolemRang < 3 && newGolemRang >= 3) golemNotifs.push(t('levelUp.golemRang3'))
  if (currentGolemRang < 4 && newGolemRang >= 4) golemNotifs.push(t('levelUp.golemRang4'))
  if (newGolemRang >= 1 && character.niveau < 9  && newNiveau >= 9)  golemNotifs.push(t('levelUp.golemNiveau9'))
  if (newGolemRang >= 1 && character.niveau < 13 && newNiveau >= 13) golemNotifs.push(t('levelUp.golemNiveau13'))
  if (newGolemRang >= 1 && character.niveau < 17 && newNiveau >= 17) golemNotifs.push(t('levelUp.golemNiveau17'))

  const ethereeVoieKey = VOIE_KEYS.find(k => (character[k] as VoiePersonnage).nom === 'Voie éthérée')
  const currentEthereeRang = ethereeVoieKey ? (character[ethereeVoieKey] as VoiePersonnage).rangs.filter(Boolean).length : 0
  const newEthereeRang = currentEthereeRang + (ethereeVoieKey ? (selections[ethereeVoieKey] ?? 0) : 0)
  const runesNotifs: string[] = []
  if (currentEthereeRang < 1 && newEthereeRang >= 1) runesNotifs.push(t('levelUp.ethereeRang1'))
  if (currentEthereeRang < 2 && newEthereeRang >= 2) runesNotifs.push(t('levelUp.ethereeRang2'))
  if (currentEthereeRang < 3 && newEthereeRang >= 3) runesNotifs.push(t('levelUp.ethereeRang3'))
  if (currentEthereeRang < 4 && newEthereeRang >= 4) runesNotifs.push(t('levelUp.ethereeRang4'))
  if (currentEthereeRang < 5 && newEthereeRang >= 5) runesNotifs.push(t('levelUp.ethereeRang5'))

  const divinesVoieKey = VOIE_KEYS.find(k => (character[k] as VoiePersonnage).nom === 'Voie des runes divines')
  const currentDivinesRang = divinesVoieKey ? (character[divinesVoieKey] as VoiePersonnage).rangs.filter(Boolean).length : 0
  const newDivinesRang = currentDivinesRang + (divinesVoieKey ? (selections[divinesVoieKey] ?? 0) : 0)
  if (currentDivinesRang < 1 && newDivinesRang >= 1) runesNotifs.push(t('levelUp.divinesRang1'))
  if (currentDivinesRang < 2 && newDivinesRang >= 2) runesNotifs.push(t('levelUp.divinesRang2'))
  if (currentDivinesRang < 3 && newDivinesRang >= 3) runesNotifs.push(t('levelUp.divinesRang3'))
  if (currentDivinesRang < 4 && newDivinesRang >= 4) runesNotifs.push(t('levelUp.divinesRang4'))
  if (currentDivinesRang < 5 && newDivinesRang >= 5) runesNotifs.push(t('levelUp.divinesRang5'))
  const ptsTotal = 2 * levelsGained
  const pmGain = pmGainParNiveau * levelsGained

  React.useEffect(() => {
    setJets(Array(levelsGained).fill(null))
    setSelections({})
    setFormationsAchetées([])
    setAvancesAchetées({})
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

  const hasCapaciteAvancee = (nomVoie: string, rangIdx: number) =>
    data[nomVoie]?.[rangIdx]?.desc?.includes('Capacité avancée') ?? false

  const toggleAvancee = (key: VoieKey, rangIdx: number) => {
    setAvancesAchetées(prev => {
      const current = prev[key] ?? []
      const has = current.includes(rangIdx)
      const next = has ? current.filter(i => i !== rangIdx) : [...current, rangIdx]
      if (next.length === 0) { const c = { ...prev }; delete c[key]; return c }
      return { ...prev, [key]: next }
    })
  }

  // Calcul des points dépensés en tenant compte des rangs multiples par voie
  const ptsDépensés = (Object.entries(selections) as [VoieKey, number][]).reduce((sum, [key, count]) => {
    if (!count) return sum
    const voie = character[key] as VoiePersonnage
    const firstNext = prochainRang(voie) ?? voie.rangs.length
    let cost = 0
    for (let i = 0; i < count; i++) cost += coutRangPourVoie(key, firstNext + i)
    return sum + cost
  }, 0) + formationsAchetées.length
    + Object.values(avancesAchetées).reduce((sum, idxs) => sum + (idxs?.length ?? 0) * 2, 0)
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

  const isSangMele = character.peuple === 'Sang-mêlé'
  const maxRangForKey = (key: VoieKey) =>
    isSangMele && (key === 'voiePeuple' || key === 'voieSangMele') ? 3 : 5

  const voiesActives = VOIE_KEYS.filter(k => {
    if (k === 'voiePrestige') return newNiveau >= 8 && (!!(character.voiePrestige as VoiePersonnage).nom || !!prestigeNom)
    return !!(character[k] as VoiePersonnage).nom
  })

  const canConfirm = pvGagnes !== null && ptsRestants === 0

  const base = character.niveau1Base
  const handleReset = () => {
    const emptyRangs: [boolean, boolean, boolean, boolean, boolean] = [false, false, false, false, false]
    const voiesPatch = Object.fromEntries(
      VOIE_KEYS.map(k => [k, { ...(character[k] as VoiePersonnage), rangs: [...emptyRangs], rangsAvances: [...emptyRangs] }])
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
      const avances = avancesAchetées[key]
      if (!count && (!avances || avances.length === 0)) continue
      const voie = character[key] as VoiePersonnage
      const nom = key === 'voiePrestige' ? prestigeNom : voie.nom
      const newRangs = [...voie.rangs]
      if (count) {
        const firstNext = prochainRang(voie)!
        for (let i = 0; i < count; i++) newRangs[firstNext + i] = true
      }
      const newRangsAvances = [...(voie.rangsAvances ?? [false, false, false, false, false])]
      for (const idx of avances ?? []) newRangsAvances[idx] = true
      voiesPatch[key] = { ...voie, nom, rangs: newRangs, rangsAvances: newRangsAvances }
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
    const mergedEffectsChoix = Object.keys(pendingEffectsChoix).length > 0
      ? { ...(character.effectsChoix ?? {}), ...pendingEffectsChoix }
      : character.effectsChoix
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
      ...(mergedEffectsChoix !== undefined ? { effectsChoix: mergedEffectsChoix } : {}),
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
              ? t('levelUp.titreSimple', { n: newNiveau })
              : t('levelUp.titreMultiple', { de: character.niveau, a: newNiveau })}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(245,236,215,0.45)', fontSize: 22, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: '18px 20px 22px', display: 'flex', flexDirection: 'column', gap: 22 }}>

          {/* ── Niveau maximum : contenu simplifié ── */}
          {character.niveau >= maxNiveau && (
            <div style={{ fontSize: 14, color: 'rgba(201,168,76,0.6)', fontStyle: 'italic' }}>
              {t('levelUp.niveauMaxAtteint')}
            </div>
          )}

          {/* ── Sections level-up (masquées au niveau max) ── */}
          {character.niveau < maxNiveau && <><section>
            <div style={SECTION_LABEL}>{t('levelUp.niveauxGagnes')}</div>
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
                {t('levelUp.progressionNiveau', { de: character.niveau, a: newNiveau })}
              </span>
            </div>
          </section>

          {/* ── Attaques ── */}
          <section>
            <div style={SECTION_LABEL}>{t('levelUp.scoresAttaque')}</div>
            <div style={{ fontSize: 16, color: 'rgba(245,236,215,0.8)' }}>
              {t('levelUp.attaquesDetails')}{' '}
              <span style={{ color: 'var(--tdr-gold)', fontWeight: 600 }}>{t('levelUp.chacun', { n: levelsGained })}</span>
              <span style={{ fontSize: 13, color: 'rgba(245,236,215,0.4)', marginLeft: 8 }}>{t('levelUp.attaquesAuto')}</span>
            </div>
          </section>

          {/* ── Points de magie ── */}
          <section>
            <div style={SECTION_LABEL}>{t('levelUp.pointsMagie')}</div>
            <div style={{ fontSize: 16, color: 'rgba(245,236,215,0.8)' }}>
              <span style={{ color: 'var(--tdr-gold)', fontWeight: 600 }}>+{pmGain} PM</span>
              <span style={{ fontSize: 13, color: 'rgba(245,236,215,0.4)', marginLeft: 8 }}>
                {character.famille === 'mystiques'
                  ? t('levelUp.pmParNiveauMystique', { count: levelsGained })
                  : t('levelUp.pmParNiveau')}
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
                {t('levelUp.nouvelleVoieTitre')}
              </div>
              <p style={{ fontSize: 14, color: 'rgba(245,236,215,0.6)', margin: '0 0 12px' }}>
                {t('levelUp.nouvelleVoieDesc')}
              </p>
              {!character.voiePrestige.nom && (
                <div>
                  <div style={{ fontSize: 12, color: 'rgba(245,236,215,0.4)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{t('levelUp.choisirVoie')}</div>
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
                      >{t('levelUp.annuler')}</button>
                    )}
                  </div>
                  {prestigeNom && (
                    <p style={{ fontSize: 13, color: 'rgba(245,236,215,0.4)', margin: '6px 0 0' }}>
                      {t('levelUp.voieApparaitra')}
                    </p>
                  )}
                </div>
              )}
            </section>
          )}

          {/* ── Points de capacité ── */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={SECTION_LABEL}>{t('levelUp.pointsCapacite')}</div>
              <div style={{
                fontSize: 14, fontWeight: 700,
                color: ptsRestants === 0 ? 'rgba(120,210,120,0.9)' : 'var(--tdr-gold)',
                background: 'rgba(201,168,76,0.1)', borderRadius: 4, padding: '3px 12px',
              }}>
                {t('levelUp.ptsRestants', { restants: ptsRestants, total: ptsTotal })}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {voiesActives.map(key => {
                const voie = character[key] as VoiePersonnage
                const maxRangs = maxRangForKey(key)
                const firstNext = prochainRang(voie)
                const bought = selections[key] ?? 0
                const maxed = firstNext === null || firstNext >= maxRangs
                const nextIdx = !maxed && firstNext !== null ? firstNext + bought : null
                const canAdd = nextIdx !== null && nextIdx < maxRangs && nextIdx < voie.rangs.length && coutRangPourVoie(key, nextIdx) <= ptsRestants
                const costNext = nextIdx !== null ? coutRangPourVoie(key, nextIdx) : 0

                // Rangs affichés : acquis + sélectionnés (limités à maxRangs)
                const rangsDisplay = voie.rangs.slice(0, maxRangs).map((acquis, i) => {
                  if (acquis) return 'acquis'
                  if (firstNext !== null && i >= firstNext && i < firstNext + bought) return 'nouveau'
                  if (firstNext !== null && i === firstNext + bought && i < maxRangs) return 'prochain'
                  return 'vide'
                })

                const nomVoie = key === 'voiePrestige' ? (prestigeNom || voie.nom) : voie.nom
                const avancesDisponibles = nomVoie ? [0, 1].filter(ri => {
                  if (!hasCapaciteAvancee(nomVoie, ri)) return false
                  if (voie.rangsAvances?.[ri]) return false
                  const rangAcquis = voie.rangs[ri] || (firstNext !== null && ri >= firstNext && ri < firstNext + bought)
                  return rangAcquis
                }) : []

                return (
                  <div key={key} style={{
                    border: `1px solid ${bought > 0 || (avancesAchetées[key]?.length ?? 0) > 0 ? 'rgba(201,168,76,0.55)' : 'rgba(201,168,76,0.15)'}`,
                    borderRadius: 6, padding: '10px 14px',
                    background: bought > 0 || (avancesAchetées[key]?.length ?? 0) > 0 ? 'rgba(201,168,76,0.07)' : 'transparent',
                    opacity: maxed && bought === 0 && avancesDisponibles.length === 0 ? 0.4 : 1,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      <div>
                        <div style={{ fontSize: 16, color: 'var(--tdr-parchment)', fontWeight: 500 }}>{nomVoie}</div>
                        <div style={{ fontSize: 12, color: 'rgba(245,236,215,0.4)', marginTop: 3 }}>
                          {maxed && bought === 0
                            ? t('levelUp.tousRangsAcquis')
                            : bought > 0
                            ? `${t('levelUp.rangsSelectionnes', { count: bought })} · ${t('levelUp.ptsDepenses', { count: ptsDépensés })}`
                            : t('levelUp.rangDisponible', { rang: (firstNext ?? 0) + 1, count: costNext })}
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

                    {/* Capacités avancées disponibles */}
                    {avancesDisponibles.map(ri => {
                      const isSelected = avancesAchetées[key]?.includes(ri) ?? false
                      const canAfford = isSelected || ptsRestants >= 2
                      return (
                        <div key={ri} style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(201,168,76,0.12)' }}>
                          <button
                            disabled={!canAfford}
                            onClick={() => toggleAvancee(key, ri)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 8, background: 'none',
                              border: 'none', cursor: canAfford ? 'pointer' : 'not-allowed',
                              padding: 0, width: '100%', textAlign: 'left', fontFamily: 'inherit',
                            }}
                          >
                            <div style={{
                              width: 15, height: 15, borderRadius: 3, flexShrink: 0,
                              border: `1px solid ${isSelected ? 'rgba(120,210,120,0.7)' : canAfford ? 'rgba(201,168,76,0.5)' : 'rgba(201,168,76,0.2)'}`,
                              background: isSelected ? 'rgba(120,210,120,0.25)' : 'transparent',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              {isSelected && <span style={{ fontSize: 10, color: 'rgba(120,210,120,0.9)', lineHeight: 1 }}>✓</span>}
                            </div>
                            <span style={{ fontSize: 12, color: isSelected ? 'rgba(120,210,120,0.9)' : canAfford ? 'rgba(245,236,215,0.65)' : 'rgba(245,236,215,0.25)' }}>
                              {t('levelUp.capaciteAvancee', { rang: ri + 1 })}
                              <span style={{ opacity: 0.5, marginLeft: 5 }}>· 2 pts</span>
                            </span>
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )
              })}

              {voiesActives.length === 0 && (
                <div style={{ fontSize: 14, color: 'rgba(245,236,215,0.4)', fontStyle: 'italic' }}>
                  {t('levelUp.aucuneVoie')}
                </div>
              )}

              {/* Formations martiales supplémentaires */}
              {(() => {
                const disponibles = FORMATIONS_MARTIALES.filter(f => !character.formationsMartiales.includes(f))
                if (disponibles.length === 0) return null
                return (
                  <div style={{ marginTop: 4, borderTop: '1px solid rgba(201,168,76,0.12)', paddingTop: 14 }}>
                    <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(201,168,76,0.5)', marginBottom: 8 }}>
                      {t('levelUp.formationsMartiales')}
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
                        {t('levelUp.prestigeVerrouille')}
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
                {t('levelUp.pointsVie')} · {levelsGained > 1 ? `${levelsGained}×` : ''}{character.deVie} + Mod.CON{(() => { const unique = [...new Set(conModPerLevel)]; return unique.length === 1 ? ` (${unique[0] >= 0 ? '+' : ''}${unique[0]})` : ` (${t('levelUp.variable')})` })()} {t('levelUp.parNiveau')}
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
                >{t('levelUp.lancerTous')}</button>
              )}
            </div>
            {!canRoll && (
              <div style={{ fontSize: 12, color: 'rgba(201,168,76,0.5)', marginBottom: 8, fontStyle: 'italic' }}>
                {t('levelUp.depenseAvantLancer')}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {jets.map((jet, i) => {
                const niv = character.niveau + 1 + i
                const lvlConMod = conModPerLevel[i]
                const pvCeNiveau = jet !== null ? jet + lvlConMod : null
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 13, color: 'rgba(201,168,76,0.6)', minWidth: 52, flexShrink: 0 }}>{t('levelUp.nivLabel', { n: niv })}</span>
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
                {t('levelUp.totalPV')} <span style={{ color: 'var(--tdr-gold)', fontWeight: 700, fontSize: 17 }}>+{pvGagnes} PV</span>
              </div>
            )}
          </section>

          {/* ── Choix d'effets ── */}
          {(() => {
            // Simuler le personnage après level-up pour trouver les nouveaux grants EFFECT_CHOIX
            const virtualVoies: Partial<Character> = {}
            for (const key of VOIE_KEYS) {
              const count = selections[key]
              if (!count) continue
              const voie = character[key] as VoiePersonnage
              const firstNext = prochainRang(voie) ?? voie.rangs.length
              const newRangs = [...voie.rangs]
              for (let i = 0; i < count; i++) newRangs[firstNext + i] = true
              virtualVoies[key] = { ...voie, rangs: newRangs }
            }
            const virtualCharacter = { ...character, ...virtualVoies, effectsChoix: { ...(character.effectsChoix ?? {}), ...pendingEffectsChoix } }
            const effectGrants = getEffectChoixGrants(virtualCharacter, data)
            if (effectGrants.length === 0) return null
            const pending = effectGrants.filter(g => !g.choixFait)
            const done = effectGrants.filter(g => !!g.choixFait)
            return (
              <section style={{ border: '1px solid rgba(120,180,255,0.35)', borderRadius: 8, padding: '14px 16px', background: 'rgba(120,180,255,0.05)' }}>
                <div style={{ ...SECTION_LABEL, color: 'rgba(120,180,255,0.85)', marginBottom: 10 }}>
                  {t('levelUp.bonusAuChoix')}
                </div>
                {pending.map(({ grant, grantKey }) => (
                  <div key={grantKey} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 13, color: 'rgba(200,220,255,0.75)', marginBottom: 6 }}>
                      {t('wizard.step3.choisirStat', { bonus: grant.value !== undefined ? (grant.value > 0 ? `+${grant.value}` : String(grant.value)) : grant.formula ?? '' })}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {grant.stats.map(stat => (
                        <button key={stat}
                          onClick={() => setPendingEffectsChoix(prev => ({ ...prev, [grantKey]: stat }))}
                          style={{ padding: '5px 14px', borderRadius: 4, border: '1px solid rgba(120,180,255,0.5)', background: 'transparent', color: 'rgba(200,220,255,0.9)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                          {stat}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {done.map(({ grant, grantKey, choixFait }) => (
                  <div key={grantKey} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: 'rgba(200,220,255,0.6)' }}>
                      {grant.value !== undefined ? (grant.value > 0 ? `+${grant.value}` : String(grant.value)) : grant.formula ?? ''} →
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(200,220,255,0.9)' }}>{choixFait}</span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {grant.stats.filter(s => s !== choixFait).map(stat => (
                        <button key={stat}
                          onClick={() => setPendingEffectsChoix(prev => ({ ...prev, [grantKey]: stat }))}
                          style={{ padding: '2px 8px', borderRadius: 3, border: '1px solid rgba(120,180,255,0.3)', background: 'transparent', color: 'rgba(200,220,255,0.45)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                          {stat}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            )
          })()}

          {/* ── Notifications Golem ── */}
          {golemNotifs.length > 0 && (
            <section style={{
              border: '1px solid rgba(130,200,180,0.35)',
              borderRadius: 8, padding: '14px 16px',
              background: 'rgba(130,200,180,0.05)',
            }}>
              <div style={{ ...SECTION_LABEL, color: 'rgba(130,200,180,0.85)', marginBottom: 10 }}>
                {t('levelUp.golemMaj')}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {golemNotifs.map((msg, i) => (
                  <div key={i} style={{ fontSize: 14, color: 'rgba(185,235,220,0.85)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{ color: 'rgba(130,200,180,0.7)', flexShrink: 0, marginTop: 1 }}>▸</span>
                    {msg}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Notifications Runes ── */}
          {runesNotifs.length > 0 && (
            <section style={{
              border: '1px solid rgba(201,168,76,0.35)',
              borderRadius: 8, padding: '14px 16px',
              background: 'rgba(201,168,76,0.05)',
            }}>
              <div style={{ ...SECTION_LABEL, color: 'rgba(201,168,76,0.85)', marginBottom: 10 }}>
                {t('levelUp.runesMaj')}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {runesNotifs.map((msg, i) => (
                  <div key={i} style={{ fontSize: 14, color: 'rgba(245,225,175,0.85)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{ color: 'rgba(201,168,76,0.7)', flexShrink: 0, marginTop: 1 }}>▸</span>
                    {msg}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Fin sections level-up ── */}
          </>}

          {/* ── Reset niveau 1 ── */}
          {showResetConfirm ? (
            <div style={{
              border: '1px solid rgba(200,80,80,0.4)', borderRadius: 6,
              padding: '14px 16px', background: 'rgba(200,80,80,0.06)',
            }}>
              <div style={{ fontSize: 14, color: 'rgba(245,200,200,0.9)', marginBottom: 8 }}>
                {t('levelUp.resetDesc')}
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
                    {t('levelUp.resetSnapshotManquant')}<br />
                    {t('levelUp.resetSnapshotAstuce')}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setShowResetConfirm(false)}
                  style={{ ...BTN_BASE, border: '1px solid rgba(245,236,215,0.2)', background: 'transparent', color: 'rgba(245,236,215,0.5)' }}
                >{t('levelUp.annuler')}</button>
                <button
                  onClick={handleReset}
                  style={{ ...BTN_BASE, fontWeight: 600, border: '1px solid rgba(200,80,80,0.6)', background: 'rgba(200,80,80,0.15)', color: 'rgba(240,120,120,0.95)' }}
                >{t('levelUp.confirmerReinit')}</button>
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
              {t('levelUp.reinitialiser')}
            </button>
          )}

          {/* ── Historique PV ── */}
          {character.pvHistorique && character.pvHistorique.length > 0 && (
            <div style={{ borderTop: '1px solid rgba(201,168,76,0.15)', paddingTop: 12 }}>
              <div style={{ ...SECTION_LABEL, marginBottom: 6 }}>{t('levelUp.historiquePV')}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {character.pvHistorique.map((entry, i) => (
                  <div key={i} style={{
                    fontSize: 12, padding: '3px 8px', borderRadius: 3,
                    background: 'rgba(201,168,76,0.07)', border: '1px solid rgba(201,168,76,0.2)',
                    color: 'rgba(245,236,215,0.7)', whiteSpace: 'nowrap',
                  }}>
                    <span style={{ color: 'rgba(201,168,76,0.6)', marginRight: 4 }}>{t('levelUp.nivLabel', { n: entry.niveauDe })}</span>
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
              {t('levelUp.annuler')}
            </button>
            <button
              disabled={!canConfirm}
              onClick={handleConfirm}
              title={!canConfirm ? (!allRolled ? t('levelUp.lancerDeVie') : t('levelUp.depensezPts')) : ''}
              style={{
                ...BTN_BASE, fontWeight: 600,
                border: `1px solid ${canConfirm ? 'rgba(201,168,76,0.65)' : 'rgba(201,168,76,0.2)'}`,
                background: canConfirm ? 'rgba(201,168,76,0.2)' : 'transparent',
                color: canConfirm ? 'var(--tdr-gold)' : 'rgba(201,168,76,0.3)',
                cursor: canConfirm ? 'pointer' : 'not-allowed',
              }}
            >
              {t('levelUp.confirmerNiveau', { n: newNiveau })}
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}
