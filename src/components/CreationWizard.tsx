import React from 'react'
import { useTranslation, Trans } from 'react-i18next'
import type { Character, Caracteristique, VoiePersonnage } from '../types/character'
import { getMod, getGolemVoieRang } from '../types/character'
import { findCulture, findTrait } from '../data/peuples'
import PROFILS_RAW from '../data/profils.json'
import { useGameData } from '../context/GameDataContext'

type ProfilEntry = { nom: string; peuplePrivilégie: string; voies: string[]; formationsMartiales: string[]; talentMagique?: string; description: string; famille: string }
const PROFILS_FLAT: ProfilEntry[] = (PROFILS_RAW as { famille: string; profils: Omit<ProfilEntry, 'famille'>[] }[]).flatMap(g => g.profils.map(p => ({ ...p, famille: g.famille })))
const PROFILS_GROUPED = PROFILS_RAW as { famille: string; profils: Omit<ProfilEntry, 'famille'>[] }[]

const VOIE_PREFIX_RE = /^voie (du |de la |de l['']|des |de )/i
const findVoieByShort = (voies: { nom: string; famille: string; categorie: string }[], shortNom: string) => {
  const normalized = shortNom.toLowerCase()
  return voies.find(v => v.categorie === 'profil' && v.nom.toLowerCase().replace(VOIE_PREFIX_RE, '') === normalized) ?? null
}
import VoieCombobox from './VoieCombobox'
import EquipementModal from './EquipementModal'
import { calcPointsCapacite, coutRangPourVoie, prochainRang } from '../utils/levelUp'
import type { VoieKey } from '../utils/levelUp'
import { parseDesc } from '../utils/parseDesc'
import { getCompagnonsDisponibles, autoAssignCompagnons, getCompagnonChoixGrants, applyChoixCompagnon } from '../utils/compagnons'
import { getEffectChoixGrants, applyChoixEffect } from '../utils/effectsChoix'

type TraitEntry = { nom: string; desc: string }

interface Props {
  step: number
  maxStep: number
  character: Character
  onChange: (patch: Partial<Character>) => void
  onNext: () => void
  onPrev: () => void
  onGoTo: (step: number) => void
  onSave?: () => void
  onPrint?: () => void
}

const STEP_COUNT = 8

const DISTRIBUTION = [10, 11, 12, 13, 14, 16]

const INPUT_STYLE = {
  background: 'rgba(15,12,8,0.92)',
  borderColor: 'rgba(201,168,76,0.35)',
  color: 'var(--tdr-parchment)',
}

const CARACS: { key: Caracteristique }[] = [
  { key: 'FOR' },
  { key: 'DEX' },
  { key: 'CON' },
  { key: 'INT' },
  { key: 'SAG' },
  { key: 'CHA' },
]

const BTN_RANG: React.CSSProperties = {
  padding: '2px 8px', borderRadius: 4, fontSize: 14, lineHeight: 1,
  fontFamily: 'inherit', cursor: 'pointer', transition: 'background 0.15s',
}

function VoieRangBar({ voie, voieKey, disponibles, onChange, capsDesc, onAvanceeChange, maxRangs = 5 }: {
  voie: VoiePersonnage
  voieKey: VoieKey
  disponibles: number
  onChange: (newRangs: boolean[]) => void
  capsDesc?: { desc?: string }[]
  onAvanceeChange?: (newRangsAvances: boolean[]) => void
  maxRangs?: number
}) {
  const { t } = useTranslation()
  const firstNext = prochainRang(voie)
  const maxed = firstNext === null || firstNext >= maxRangs
  const costNext = !maxed && firstNext !== null ? coutRangPourVoie(voieKey, firstNext) : 0
  const canAdd = !maxed && costNext <= disponibles
  const canRemove = firstNext !== null && firstNext > 0 && firstNext <= maxRangs

  const add = () => {
    if (!canAdd || firstNext === null) return
    const r = [...voie.rangs]; r[firstNext] = true; onChange(r)
  }
  const remove = () => {
    if (!canRemove || firstNext === null) return
    const r = [...voie.rangs]; r[firstNext - 1] = false; onChange(r)
  }

  const acquired = voie.rangs.filter(Boolean).length

  const avanceesRangs = capsDesc ? [0, 1].filter(ri =>
    voie.rangs[ri] &&
    capsDesc[ri]?.desc?.includes('Capacité avancée')
  ) : []

  return (
    <div style={{ marginTop: 6, marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ display: 'flex', gap: 3 }}>
          {voie.rangs.slice(0, maxRangs).map((acquis, i) => (
            <div key={i} style={{
              width: 12, height: 12, borderRadius: 3,
              background: acquis ? 'var(--tdr-gold)' : 'rgba(255,255,255,0.06)',
              border: acquis
                ? '1px solid rgba(201,168,76,0.8)'
                : i === firstNext
                  ? '1px solid rgba(201,168,76,0.35)'
                  : '1px solid rgba(255,255,255,0.1)',
              transition: 'background 0.15s',
            }} />
          ))}
        </div>
        <span style={{ fontSize: 11, color: 'rgba(245,236,215,0.35)', flex: 1 }}>
          {maxed
            ? t('wizard.voieRangBar.tousAcquis')
            : acquired === 0
              ? t('wizard.voieRangBar.rang1', { count: costNext })
              : t('wizard.voieRangBar.rangAcquis', { acquired, count: costNext })}
        </span>
        <button
          onClick={remove} disabled={!canRemove}
          style={{
            ...BTN_RANG,
            border: `1px solid ${canRemove ? 'rgba(201,168,76,0.35)' : 'rgba(201,168,76,0.12)'}`,
            background: canRemove ? 'rgba(201,168,76,0.1)' : 'transparent',
            color: canRemove ? 'var(--tdr-gold)' : 'rgba(201,168,76,0.2)',
          }}
        >−</button>
        <button
          onClick={add} disabled={!canAdd}
          style={{
            ...BTN_RANG,
            border: `1px solid ${canAdd ? 'rgba(201,168,76,0.5)' : 'rgba(201,168,76,0.12)'}`,
            background: canAdd ? 'rgba(201,168,76,0.12)' : 'transparent',
            color: canAdd ? 'var(--tdr-gold)' : 'rgba(201,168,76,0.2)',
          }}
        >+</button>
      </div>
      {avanceesRangs.map(ri => {
        const taken = voie.rangsAvances?.[ri] === true
        const canAfford = disponibles >= 2
        const disabled = !taken && !canAfford
        const toggle = () => {
          if (!onAvanceeChange) return
          const ra = [...(voie.rangsAvances ?? [false, false, false, false, false])]
          ra[ri] = !ra[ri]
          onAvanceeChange(ra)
        }
        return (
          <button
            key={ri}
            disabled={disabled}
            onClick={toggle}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, marginTop: 8,
              background: 'none', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
              padding: 0, fontFamily: 'inherit',
            }}
          >
            <div style={{
              width: 13, height: 13, borderRadius: 3, flexShrink: 0,
              border: `1px solid ${taken ? 'rgba(201,168,76,0.8)' : canAfford ? 'rgba(201,168,76,0.45)' : 'rgba(201,168,76,0.18)'}`,
              background: taken ? 'rgba(201,168,76,0.85)' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {taken && (
                <svg viewBox="0 0 10 8" style={{ width: 9, height: 7 }}>
                  <polyline points="1,4 4,7 9,1" fill="none" stroke="#1a1510" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            <span style={{ fontSize: 11, color: taken ? 'var(--tdr-gold)' : canAfford ? 'rgba(245,236,215,0.55)' : 'rgba(245,236,215,0.2)' }}>
              {t('levelUp.capaciteAvancee', { rang: ri + 1 })}
              {!taken && <span style={{ opacity: 0.5, marginLeft: 4 }}>· 2 pts</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function StepIndicator({ current, maxStep, total, stepOk, onGoTo }: {
  current: number; maxStep: number; total: number; stepOk: boolean[]; onGoTo: (i: number) => void
}) {
  const { t } = useTranslation()
  const [hovered, setHovered] = React.useState<number | null>(null)
  return (
    <div className="flex gap-1 mb-4" style={{ position: 'relative' }}>
      {Array.from({ length: total }).map((_, i) => {
        const filled = i <= maxStep
        const ok     = stepOk[i] ?? true
        const isCurrent = i === current
        return (
          <div
            key={i}
            onClick={() => onGoTo(i)}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            className="h-1 flex-1 rounded-full transition-all"
            style={{
              background: filled
                ? ok ? 'var(--tdr-gold)' : 'rgba(200,80,60,0.85)'
                : 'rgba(201,168,76,0.2)',
              cursor: 'pointer',
              opacity: isCurrent ? 1 : filled ? 0.75 : 0.4,
              transform: isCurrent ? 'scaleY(2)' : 'scaleY(1)',
              transformOrigin: 'center',
            }}
          />
        )
      })}
      {hovered !== null && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: `${(hovered + 0.5) / total * 100}%`,
          transform: 'translateX(-50%)',
          marginTop: 6,
          background: 'rgba(20,15,8,0.97)',
          color: '#e8dfc0',
          border: '1px solid #c9a84c',
          borderRadius: 4,
          padding: '3px 10px',
          fontSize: '0.85em',
          whiteSpace: 'nowrap',
          zIndex: 100,
          pointerEvents: 'none',
        }}>
          {t(`wizard.stepNames.${hovered}`)}
        </div>
      )}
    </div>
  )
}

function Step0({ character, onChange }: Pick<Props, 'character' | 'onChange'>) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3">
      <p className="text-base opacity-70 italic">{t('wizard.step0.intro')}</p>
      {[
        { labelKey: 'wizard.step0.nomJoueur', field: 'nomJoueur' },
        { labelKey: 'wizard.step0.nomPersonnage', field: 'nomPersonnage' },
        { labelKey: 'wizard.step0.genre', field: 'genre' },
        { labelKey: 'wizard.step0.age', field: 'age' },
        { labelKey: 'wizard.step0.taille', field: 'taille' },
        { labelKey: 'wizard.step0.poids', field: 'poids' },
      ].map(({ labelKey, field }) => (
        <div key={field}>
          <label className="block text-base uppercase tracking-widest mb-1" style={{ color: 'var(--tdr-gold)' }}>
            {t(labelKey)}
          </label>
          <input
            className="w-full border rounded px-3 py-1.5 text-base"
            style={INPUT_STYLE}
            value={(character as any)[field]}
            onChange={e => onChange({ [field]: e.target.value })}
          />
        </div>
      ))}
    </div>
  )
}

function Step1({ character, onChange }: Pick<Props, 'character' | 'onChange'>) {
  const { t } = useTranslation()
  const { peuples, hiddenPeuples, hiddenCultures, showHidden } = useGameData()
  const cultureKey = (pl: string, cl: string) => `${pl}::${cl}`
  const visiblePeuples = peuples.filter(p => showHidden || !hiddenPeuples.includes(p.label))
  const selectedPeuple = peuples.find(p => p.label === character.peuple) ?? null
  const cultures = (selectedPeuple?.cultures ?? []).filter(c => showHidden || !hiddenCultures.includes(cultureKey(selectedPeuple?.label ?? '', c.label)))

  const onPeupleChange = (peupleLabel: string) => {
    const peuple = peuples.find(p => p.label === peupleLabel)
    const firstCulture = peuple?.cultures[0]
    const trait = firstCulture ? findTrait(peuples, peupleLabel, firstCulture.label) : null
    const isSangMele = peupleLabel === 'Sang-mêlé'
    const emptyRangs: [boolean,boolean,boolean,boolean,boolean] = [false,false,false,false,false]
    onChange({
      peuple: peupleLabel,
      culture: firstCulture?.label ?? '',
      voiePeuple: isSangMele ? { nom: '', rangs: emptyRangs } : { ...character.voiePeuple, nom: firstCulture?.voiePeuple ?? '' },
      voieCulturelle: isSangMele ? { nom: '', rangs: emptyRangs } : { ...character.voieCulturelle, nom: firstCulture?.voieCulturelle ?? '' },
      voieSangMele: isSangMele ? { nom: '', rangs: emptyRangs } : character.voieSangMele,
      traitPeuple: trait?.nom ?? '',
      traitPeupleDesc: trait?.desc ?? '',
    })
  }

  const onCultureChange = (cultureLabel: string) => {
    const culture = findCulture(peuples, character.peuple, cultureLabel)
    const trait = findTrait(peuples, character.peuple, cultureLabel)
    onChange({
      culture: cultureLabel,
      voiePeuple: { ...character.voiePeuple, nom: culture?.voiePeuple ?? character.voiePeuple.nom },
      voieCulturelle: { ...character.voieCulturelle, nom: culture?.voieCulturelle ?? character.voieCulturelle.nom },
      traitPeuple: trait?.nom ?? '',
      traitPeupleDesc: trait?.desc ?? '',
    })
  }

  const modCaracs = findCulture(peuples, character.peuple, character.culture)?.modCaracs ?? {}
  const modText = Object.entries(modCaracs)
    .map(([k, v]) => `${k} ${(v as number) >= 0 ? '+' : ''}${v}`)
    .join(', ')

  return (
    <div className="space-y-3">
      <p className="text-base opacity-70 italic">
        {t('wizard.step1.intro')}
      </p>

      <div>
        <label className="block text-base uppercase tracking-widest mb-1" style={{ color: 'var(--tdr-gold)' }}>
          {t('wizard.step1.peuple')}
        </label>
        <select
          className="w-full border rounded px-3 py-1.5 text-base"
          style={INPUT_STYLE}
          value={character.peuple}
          onChange={e => onPeupleChange(e.target.value)}
        >
          <option value="">{t('wizard.step1.choisir')}</option>
          {visiblePeuples.map(p => <option key={p.label} value={p.label}>{p.label}</option>)}
        </select>
      </div>

      {cultures.length > 1 && (
        <div>
          <label className="block text-base uppercase tracking-widest mb-1" style={{ color: 'var(--tdr-gold)' }}>
            {t('wizard.step1.culture')}
          </label>
          <select
            className="w-full border rounded px-3 py-1.5 text-base"
            style={INPUT_STYLE}
            value={character.culture}
            onChange={e => onCultureChange(e.target.value)}
          >
            <option value="">{t('wizard.step1.choisir')}</option>
            {cultures.map(c => <option key={c.label} value={c.label}>{c.label}</option>)}
          </select>
        </div>
      )}

      {modText && (
        <p className="text-base px-2 py-1 rounded" style={{ background: 'rgba(201,168,76,0.1)', color: 'var(--tdr-gold)' }}>
          {t('wizard.step1.modificateurs', { mods: modText })}
        </p>
      )}

      {character.peuple && (
        <p className="text-base px-2 py-1 rounded" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(201,168,76,0.15)', color: 'rgba(245,236,215,0.5)', fontStyle: 'italic' }}>
          <Trans i18nKey="wizard.step1.voiesInfo" components={{ strong: <strong style={{ color: 'rgba(245,236,215,0.7)' }} /> }} />
        </p>
      )}

      {(() => {
        const trait = findTrait(peuples, character.peuple, character.culture)
        const sansTrait = character.peuple === 'Humain' || character.peuple === 'Sang-mêlé'
        return (
          <div style={{ opacity: sansTrait ? 0.35 : 1, pointerEvents: sansTrait ? 'none' : 'auto' }}>
            <label className="block text-base uppercase tracking-widest mb-1" style={{ color: 'var(--tdr-gold)' }}>
              {t('wizard.step1.traitPeuple')}
            </label>
            {trait ? (
              <div style={{ padding: '10px 14px', borderRadius: 6, background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.25)' }}>
                <div style={{ fontWeight: 600, color: 'var(--tdr-gold)', marginBottom: 5 }}>{trait.nom}</div>
                <div style={{ fontSize: 13, color: 'rgba(245,236,215,0.65)', lineHeight: 1.6, fontStyle: 'italic' }}>{trait.desc}</div>
              </div>
            ) : (
              <input
                className="w-full border rounded px-3 py-1.5 text-base"
                style={INPUT_STYLE}
                placeholder={t('wizard.step1.aucun')}
                value={character.traitPeuple}
                onChange={e => onChange({ traitPeuple: e.target.value })}
              />
            )}
          </div>
        )
      })()}
    </div>
  )
}

function Step2({ character, onChange }: Pick<Props, 'character' | 'onChange'>) {
  const { t } = useTranslation()
  const { peuples } = useGameData()
  const modCaracs = findCulture(peuples, character.peuple, character.culture)?.modCaracs ?? {}

  const [method, setMethod] = React.useState<'distribution' | 'aleatoire'>('distribution')
  // Les caracs sont "non assignées" si toutes sont encore à la valeur par défaut (10)
  const isUnassigned = CARACS.every(({ key }) => character.caracteristiques[key].valeur === 10)

  const [assigned, setAssigned] = React.useState<Record<Caracteristique, number | null>>(() => {
    if (isUnassigned) return { FOR: null, DEX: null, CON: null, INT: null, SAG: null, CHA: null }
    const result: Record<Caracteristique, number | null> = { FOR: null, DEX: null, CON: null, INT: null, SAG: null, CHA: null }
    for (const { key } of CARACS) {
      const racialMod = ((modCaracs as Record<string, number>)[key]) ?? 0
      result[key] = character.caracteristiques[key].valeur - racialMod
    }
    return result
  })
  const [pool, setPool] = React.useState<number[]>(() => {
    if (isUnassigned) return [...DISTRIBUTION]
    const remaining = [...DISTRIBUTION]
    for (const { key } of CARACS) {
      const racialMod = ((modCaracs as Record<string, number>)[key]) ?? 0
      const base = character.caracteristiques[key].valeur - racialMod
      const idx = remaining.indexOf(base)
      if (idx >= 0) remaining.splice(idx, 1)
    }
    return remaining
  })

  const assign = (carac: Caracteristique, val: number) => {
    const prev = assigned[carac]
    const newAssigned = { ...assigned, [carac]: val }
    const idx = pool.indexOf(val)
    const newPool = pool.filter((_, i) => i !== idx)
    if (prev !== null) newPool.push(prev)
    newPool.sort((a, b) => a - b)
    setAssigned(newAssigned)
    setPool(newPool)
    const racialMod = ((modCaracs as Record<string, number>)[carac]) ?? 0
    const finalVal = val + racialMod
    onChange({
      caracteristiques: {
        ...character.caracteristiques,
        [carac]: { valeur: finalVal, mod: getMod(finalVal) },
      },
    })
  }

  const rollDice = () => {
    const rolls = Array.from({ length: 6 }, () => {
      const dice = Array.from({ length: 4 }, () => Math.floor(Math.random() * 6) + 1)
      dice.sort((a, b) => a - b)
      return dice.slice(1).reduce((a, b) => a + b, 0)
    }).sort((a, b) => a - b)
    setPool(rolls)
    setAssigned({ FOR: null, DEX: null, CON: null, INT: null, SAG: null, CHA: null })
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {(['distribution', 'aleatoire'] as const).map(m => (
          <button
            key={m}
            onClick={() => { setMethod(m); if (m === 'distribution') setPool(DISTRIBUTION) }}
            className="flex-1 py-1 rounded text-base border transition-all"
            style={{
              background: method === m ? 'var(--tdr-gold)' : 'transparent',
              color: method === m ? 'var(--tdr-dark)' : 'var(--tdr-parchment)',
              borderColor: 'var(--tdr-gold)',
              fontWeight: method === m ? 700 : 400,
            }}
          >
            {m === 'distribution' ? t('wizard.step2.distribution') : t('wizard.step2.aleatoire')}
          </button>
        ))}
      </div>

      {method === 'aleatoire' && (
        <button
          onClick={rollDice}
          className="w-full py-1.5 rounded text-base border"
          style={{ borderColor: 'rgba(201,168,76,0.5)', color: 'var(--tdr-parchment)' }}
        >
          {t('wizard.step2.lancerDes')}
        </button>
      )}

      <div className="flex flex-wrap gap-1 min-h-8">
        {pool.map((v, i) => (
          <span key={i} className="px-2 py-0.5 rounded text-base font-bold"
            style={{ background: 'rgba(201,168,76,0.2)', color: 'var(--tdr-gold)' }}>
            {v}
          </span>
        ))}
        {pool.length === 0 && <span className="text-base opacity-50 italic">{t('wizard.step2.tousAssignes')}</span>}
      </div>

      {Object.keys(modCaracs).length > 0 && (
        <div style={{ padding: '6px 10px', borderRadius: 5, background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.2)', fontSize: 13 }}>
          <span style={{ color: 'rgba(201,168,76,0.6)', marginRight: 6 }}>{t('wizard.step2.modRaciaux')}</span>
          <span style={{ color: 'var(--tdr-gold)', fontWeight: 600, marginRight: 8 }}>
            {(() => {
              const peupleData = peuples.find(p => p.label === character.peuple)
              const modStrings = peupleData?.cultures.map(c => JSON.stringify(c.modCaracs ?? {})) ?? []
              const cultureVarie = new Set(modStrings).size > 1
              return character.peuple + (cultureVarie && character.culture ? ` · ${character.culture}` : '') + ' :'
            })()}
          </span>
          {Object.entries(modCaracs).map(([k, v]) => (
            <span key={k} style={{ marginRight: 8, fontWeight: 700, color: (v as number) > 0 ? 'rgba(120,210,120,0.9)' : 'rgba(220,100,80,0.9)' }}>
              {k} {(v as number) > 0 ? '+' : ''}{v as number}
            </span>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {CARACS.map(({ key }) => {
          const base = assigned[key]
          const racialMod = ((modCaracs as Record<string, number>)[key]) ?? 0
          const finalVal = base !== null ? base + racialMod : null
          const finalMod = finalVal !== null ? getMod(finalVal) : null
          return (
            <div key={key} className="flex items-center gap-2">
              <div className="w-10 text-center font-bold text-base" style={{ color: 'var(--tdr-gold)' }}>{t(`stats.${key}`)}</div>
              <select
                className="flex-1 border rounded px-2 py-1 text-base"
                style={{ ...INPUT_STYLE, cursor: 'pointer' }}
                value={base ?? ''}
                onChange={e => {
                  const raw = e.target.value
                  if (!raw) {
                    const prev = assigned[key]
                    if (prev !== null) {
                      setPool(p => [...p, prev].sort((a, b) => a - b))
                      setAssigned(a => ({ ...a, [key]: null }))
                      const racialMod = ((modCaracs as Record<string, number>)[key]) ?? 0
                      onChange({ caracteristiques: { ...character.caracteristiques, [key]: { valeur: 10 + racialMod, mod: getMod(10 + racialMod) } } })
                    }
                  } else {
                    assign(key, parseInt(raw))
                  }
                }}
              >
                <option value="">--</option>
                {base !== null && <option value={base}>{base}</option>}
                {pool.map((v, i) => <option key={i} value={v}>{v}</option>)}
              </select>
              <span style={{
                fontSize: 12, fontWeight: 700, minWidth: 28, textAlign: 'center',
                color: racialMod > 0 ? 'rgba(120,210,120,0.9)' : 'rgba(220,100,80,0.9)',
                visibility: racialMod !== 0 ? 'visible' : 'hidden',
              }}>
                {racialMod > 0 ? '+' : ''}{racialMod}
              </span>
              <div style={{ minWidth: 26, textAlign: 'center', fontSize: 15, fontWeight: 700, color: 'var(--tdr-parchment)', visibility: racialMod !== 0 && finalVal !== null ? 'visible' : 'hidden' }}>
                {finalVal ?? ''}
              </div>
              <div className="w-10 text-center text-base" style={{ color: 'var(--tdr-gold)' }}>
                {finalMod !== null ? (finalMod >= 0 ? `+${finalMod}` : finalMod) : '—'}
              </div>
              <div className="text-base opacity-50 hidden xl:block" style={{ width: '8rem' }}>{t(`wizard.caracs.${key}.desc`).split('.')[0]}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function renderDesc(text: string, character?: Character): React.ReactNode {
  return parseDesc(text, character)
}

function CarteVoieModal({ nom, onClose, character }: { nom: string; onClose: () => void; character?: Character }) {
  const { t } = useTranslation()
  const { data } = useGameData()
  const capacites = data[nom] ?? data[nom.toLowerCase()] ?? []

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

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
        borderRadius: 8,
        maxWidth: 560,
        width: '100%',
        maxHeight: '85vh',
        overflowY: 'auto',
        boxShadow: '0 12px 64px rgba(0,0,0,0.9)',
      }}>
        {/* En-tête */}
        <div style={{
          padding: '16px 20px 12px',
          borderBottom: '1px solid rgba(201,168,76,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <h2 style={{
            margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: '0.04em',
            color: 'var(--tdr-gold)',
          }}>{nom}</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(245,236,215,0.5)', fontSize: 20, lineHeight: 1, padding: '0 2px',
            }}
            aria-label="Fermer"
          >×</button>
        </div>

        {/* Capacités */}
        <div style={{ padding: '12px 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {capacites.map((cap, i) => (
            <div key={i} style={{
              borderLeft: '2px solid rgba(201,168,76,0.4)',
              paddingLeft: 12,
            }}>
              <div style={{
                fontSize: 17, fontWeight: 600, letterSpacing: '0.06em',
                color: 'rgba(201,168,76,0.7)', marginBottom: 5,
                textTransform: 'uppercase',
              }}>
                {t('wizard.step3.rangCarteTitre', { rang: i + 1, nom: cap.nom })}
              </div>
              <div style={{
                fontSize: 18, lineHeight: 1.6,
                color: 'rgba(245,236,215,0.85)',
              }}>
                {renderDesc(cap.desc, character)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function TraitCombobox({ value, onChange }: { value: string; onChange: (val: string) => void }) {
  const { t } = useTranslation()
  const { traits } = useGameData()
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState(value)
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => { setQuery(value) }, [value])

  React.useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const filtered = traits.filter(t => t.nom.toLowerCase().includes(query.toLowerCase()))

  return (
    <div ref={ref} style={{ position: 'relative', flex: 1 }}>
      <input
        type="text"
        value={query}
        placeholder={open && !query && value ? value : t('wizard.step5.rechercherTrait')}
        onFocus={() => { setQuery(''); setOpen(true) }}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onBlur={() => setTimeout(() => { setOpen(false); setQuery(value) }, 150)}
        className="w-full border rounded px-3 py-1.5 text-base"
        style={{
          background: 'rgba(15,12,8,0.92)',
          borderColor: open ? 'rgba(201,168,76,0.8)' : 'rgba(201,168,76,0.35)',
          color: 'var(--tdr-parchment)', outline: 'none',
        }}
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
          background: 'rgba(18,14,9,0.98)', border: '1px solid rgba(201,168,76,0.4)',
          borderRadius: 4, maxHeight: 200, overflowY: 'auto',
          boxShadow: '0 4px 20px rgba(0,0,0,0.7)', marginTop: 2,
        }}>
          {filtered.map(t => (
            <TraitOption key={t.nom} entry={t} onSelect={nom => { onChange(nom); setQuery(nom); setOpen(false) }} />
          ))}
        </div>
      )}
    </div>
  )
}

function TraitOption({ entry, onSelect }: { entry: TraitEntry; onSelect: (nom: string) => void }) {
  const [hovered, setHovered] = React.useState(false)
  return (
    <div
      onMouseDown={() => onSelect(entry.nom)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '6px 12px', fontSize: 15, cursor: 'pointer',
        color: 'var(--tdr-parchment)',
        background: hovered ? 'rgba(201,168,76,0.12)' : 'transparent',
      }}
    >{entry.nom}</div>
  )
}

function TraitMagiqueModal({ nom, desc, onChange, onClose }: {
  nom: string; desc: string
  onChange: (nom: string, desc: string) => void
  onClose: () => void
}) {
  const [localNom, setLocalNom] = React.useState(nom)
  const [localDesc, setLocalDesc] = React.useState(desc)

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') { onChange(localNom, localDesc); onClose() } }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [localNom, localDesc, onChange, onClose])

  const handleClose = () => { onChange(localNom, localDesc); onClose() }

  const fieldStyle: React.CSSProperties = {
    width: '100%', background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(201,168,76,0.3)', borderRadius: 4,
    color: 'var(--tdr-parchment)', fontSize: 16, lineHeight: 1.6,
    padding: '8px 12px', outline: 'none',
    fontFamily: "'Crimson Text', Georgia, serif",
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.88)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px 16px',
      }}
      onClick={e => { if (e.target === e.currentTarget) handleClose() }}
    >
      <div style={{
        background: 'rgba(18,14,9,0.98)', border: '1px solid rgba(201,168,76,0.45)',
        borderRadius: 8, maxWidth: 520, width: '100%',
        boxShadow: '0 12px 64px rgba(0,0,0,0.9)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          padding: '16px 20px 12px',
          borderBottom: '1px solid rgba(201,168,76,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <input
            value={localNom}
            onChange={e => setLocalNom(e.target.value)}
            style={{ ...fieldStyle, fontWeight: 700, fontSize: 17, flex: 1, lineHeight: 1.2 }}
          />
          <button
            onClick={handleClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(245,236,215,0.5)', fontSize: 20, lineHeight: 1, padding: '0 2px', flexShrink: 0 }}
            aria-label="Fermer"
          >×</button>
        </div>
        <div style={{ padding: '16px 20px 20px' }}>
          <textarea
            value={localDesc}
            onChange={e => setLocalDesc(e.target.value)}
            rows={6}
            style={{ ...fieldStyle, resize: 'vertical' }}
          />
        </div>
      </div>
    </div>
  )
}

function deriveFamille(voies: { nom: string; famille: string; categorie: string }[], v1: string, v2: string, v3: string): 'combattants' | 'aventuriers' | 'mystiques' | null {
  const noms = [v1, v2, v3].filter(Boolean)
  const counts = { combattants: 0, aventuriers: 0, mystiques: 0 }
  for (const nom of noms) {
    const voie = voies.find(v => v.nom === nom && v.categorie === 'profil')
    if (voie?.famille) counts[voie.famille as keyof typeof counts]++
  }
  if (counts.combattants >= 2) return 'combattants'
  if (counts.mystiques >= 2) return 'mystiques'
  if (counts.aventuriers >= 2) return 'aventuriers'
  if (noms.length === 3) return 'aventuriers'
  return null
}

const FAMILLE_KEYS = ['combattants', 'aventuriers', 'mystiques'] as const

function Step3({ character, onChange, modeVoies, setModeVoies }: Pick<Props, 'character' | 'onChange'> & { modeVoies: 'libre' | 'profil'; setModeVoies: (m: 'libre' | 'profil') => void }) {
  const { t } = useTranslation()
  const [previewVoie, setPreviewVoie] = React.useState<string | null>(null)
  const { disponibles } = calcPointsCapacite(character)
  const { data: dynamicDescriptions, peuples, voies, hiddenVoies, showHidden } = useGameData()

  const voiesPrestige = voies.filter(v => v.categorie === 'prestige' && (showHidden || !hiddenVoies.includes(v.nom)))
  const nomPrestige = character.voiePrestige.nom
  const hasPrestigeDesc = !!nomPrestige && !!dynamicDescriptions[nomPrestige]

  const allProfilVoies = (() => {
    const profilVoies = voies.filter(v => v.categorie === 'profil' && (showHidden || !hiddenVoies.includes(v.nom)))
    const voieNoms = new Set(voies.map(v => v.nom))
    const peupleVoieNoms = new Set<string>()
    for (const p of peuples) {
      for (const c of p.cultures) {
        if (c.voiePeuple) peupleVoieNoms.add(c.voiePeuple)
        if (c.voieCulturelle) peupleVoieNoms.add(c.voieCulturelle)
      }
    }
    // Fallback : voies présentes dans descriptions mais pas encore dans voies.json
    const fallbackVoies = Object.keys(dynamicDescriptions)
      .filter(nom => !voieNoms.has(nom) && !peupleVoieNoms.has(nom) && (showHidden || !hiddenVoies.includes(nom)))
      .map(nom => ({ nom, categorie: 'profil', famille: '' }))
    return fallbackVoies.length ? [...profilVoies, ...fallbackVoies] : profilVoies
  })()

  const profilActuel = PROFILS_FLAT.find(p => p.nom === character.profil) ?? null
  const isSangMele = character.peuple === 'Sang-mêlé'
  const voiesDePeuple = isSangMele
    ? [...new Set(peuples.filter(p => p.label !== 'Sang-mêlé').flatMap(p => p.cultures.map(c => c.voiePeuple).filter((v): v is string => !!v)))]
    : []
  const voiesCulturellesSangMele = isSangMele
    ? [...new Set(
        peuples.filter(p => p.label !== 'Sang-mêlé')
          .flatMap(p => p.cultures)
          .filter(c => c.voiePeuple === character.voiePeuple.nom || c.voiePeuple === character.voieSangMele.nom)
          .map(c => c.voieCulturelle)
          .filter((v): v is string => !!v)
      )]
    : []

  const applyPeupleRecommandé = (peuplePrivilégie: string) => {
    const rec = peuplePrivilégie.toLowerCase()
    for (const peuple of peuples) {
      for (const culture of peuple.cultures) {
        if (rec.includes(culture.label.toLowerCase())) {
          const trait = findTrait(peuples, peuple.label, culture.label)
          onChange({
            peuple: peuple.label,
            culture: culture.label,
            voiePeuple: { ...character.voiePeuple, nom: culture.voiePeuple },
            voieCulturelle: { ...character.voieCulturelle, nom: culture.voieCulturelle },
            traitPeuple: trait?.nom ?? '',
            traitPeupleDesc: trait?.desc ?? '',
          })
          return
        }
      }
    }
  }

  const applyProfil = (profilNom: string) => {
    const profil = PROFILS_FLAT.find(p => p.nom === profilNom)
    if (!profil) return
    const v1 = findVoieByShort(voies, profil.voies[0])
    const v2 = findVoieByShort(voies, profil.voies[1])
    const v3 = findVoieByShort(voies, profil.voies[2])
    const familleMap: Record<string, 'combattants' | 'aventuriers' | 'mystiques'> = {
      'Combattants': 'combattants', 'Aventuriers': 'aventuriers', 'Mystiques': 'mystiques',
    }
    const famille = familleMap[profil.famille]
    const vide: VoiePersonnage = { nom: '', rangs: [false, false, false, false, false] }
    onChange({
      profil: profil.nom,
      voie1: { ...vide, nom: v1?.nom ?? '' },
      voie2: { ...vide, nom: v2?.nom ?? '' },
      voie3: { ...vide, nom: v3?.nom ?? '' },
      famille,
      deVie: famille === 'combattants' ? 'd10' : famille === 'aventuriers' ? 'd8' : 'd6',
      formationsMartiales: ['Armes de paysan (gratuit)', ...profil.formationsMartiales],
    })
  }

  const setVoie = (field: 'voie1' | 'voie2' | 'voie3', nom: string) => {
    const v1 = field === 'voie1' ? nom : character.voie1.nom
    const v2 = field === 'voie2' ? nom : character.voie2.nom
    const v3 = field === 'voie3' ? nom : character.voie3.nom
    const famille = deriveFamille(voies, v1, v2, v3)
    const patch: Partial<Character> = { [field]: { ...character[field], nom } }
    if (famille) {
      patch.famille = famille
      patch.deVie = famille === 'combattants' ? 'd10' : famille === 'aventuriers' ? 'd8' : 'd6'
    }
    onChange(patch)
  }

  const clearVoie = (field: 'voie1' | 'voie2' | 'voie3') => {
    const v1 = field === 'voie1' ? '' : character.voie1.nom
    const v2 = field === 'voie2' ? '' : character.voie2.nom
    const v3 = field === 'voie3' ? '' : character.voie3.nom
    const famille = deriveFamille(voies, v1, v2, v3)
    const patch: Partial<Character> = { [field]: { nom: '', rangs: [false, false, false, false, false] } }
    if (famille) {
      patch.famille = famille
      patch.deVie = famille === 'combattants' ? 'd10' : famille === 'aventuriers' ? 'd8' : 'd6'
    }
    onChange(patch)
  }

  const familleDérivée = deriveFamille(voies, character.voie1.nom, character.voie2.nom, character.voie3.nom)

  // Compteur de points — affiché en ligne près des voies
  const ptsBadge = (
    <span style={{
      marginLeft: 'auto',
      fontSize: 12, fontWeight: 700,
      padding: '2px 10px', borderRadius: 4,
      background: disponibles === 0 ? 'rgba(120,210,120,0.12)' : 'rgba(201,168,76,0.12)',
      border: `1px solid ${disponibles === 0 ? 'rgba(120,210,120,0.35)' : 'rgba(201,168,76,0.35)'}`,
      color: disponibles === 0 ? 'rgba(120,210,120,0.9)' : 'var(--tdr-gold)',
    }}>
      {disponibles === 0 ? t('wizard.step3.pointsDistribues') : t('wizard.step3.ptsRestant', { count: disponibles })}
    </span>
  )

  return (
    <div className="space-y-3">
      <p className="text-base opacity-70 italic">
        {modeVoies === 'libre' ? t('wizard.step3.introLibre') : t('wizard.step3.introProfil')}
      </p>

      {/* ── Profil ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          {modeVoies === 'profil' && (
            <label className="text-base uppercase tracking-widest" style={{ color: 'var(--tdr-gold)' }}>
              {t('wizard.step3.profil')}
            </label>
          )}
          <div style={{ display: 'flex', gap: 2, marginLeft: 'auto' }}>
            {(['libre', 'profil'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setModeVoies(mode)}
                style={{
                  padding: '3px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer',
                  fontFamily: 'inherit', border: '1px solid',
                  borderColor: modeVoies === mode ? 'var(--tdr-gold)' : 'rgba(201,168,76,0.3)',
                  background: modeVoies === mode ? 'rgba(201,168,76,0.15)' : 'transparent',
                  color: modeVoies === mode ? 'var(--tdr-gold)' : 'rgba(201,168,76,0.5)',
                }}
              >
                {mode === 'libre' ? t('wizard.step3.voiesLibres') : t('wizard.step3.parProfil')}
              </button>
            ))}
          </div>
        </div>
        {modeVoies === 'profil' && (
          <>
            <select
              className="w-full border rounded px-3 py-1.5 text-base"
              style={{ ...INPUT_STYLE, cursor: 'pointer' }}
              value={character.profil}
              onChange={e => applyProfil(e.target.value)}
            >
              <option value="">{t('wizard.step3.choisirProfil')}</option>
              {PROFILS_GROUPED.map(group => (
                <optgroup key={group.famille} label={group.famille}>
                  {group.profils.map(p => (
                    <option key={p.nom} value={p.nom}>{p.nom}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            {profilActuel && (() => {
              const rec = profilActuel.peuplePrivilégie
              const match = character.culture && rec.toLowerCase().includes(character.culture.toLowerCase())
              return (
                <div style={{ marginTop: 6, fontSize: 13, color: 'rgba(201,168,76,0.65)', fontStyle: 'italic' }}>
                  {t('wizard.step3.peupleRecommande')}{' '}
                  <button
                    onClick={() => !match && applyPeupleRecommandé(rec)}
                    disabled={!!match}
                    title={match ? t('wizard.step3.peupleDejaOk') : t('wizard.step3.appliquerPeuple', { peuple: rec })}
                    style={{
                      fontFamily: 'inherit', fontSize: 13, fontStyle: 'italic', fontWeight: 700,
                      background: 'none', border: 'none', padding: 0,
                      cursor: match ? 'default' : 'pointer',
                      color: match ? 'rgba(120,210,120,0.9)' : 'rgba(230,140,60,0.95)',
                      textDecoration: match ? 'none' : 'underline dotted',
                    }}
                  >
                    {match ? '✓ ' : '⚠ '}{rec}
                  </button>
                  {profilActuel.talentMagique && (
                    <> · {t('wizard.step3.talentSuggere')} <strong style={{ color: 'rgba(201,168,76,0.85)' }}>{profilActuel.talentMagique}</strong></>
                  )}
                </div>
              )
            })()}
          </>
        )}
      </div>

      {/* ── Compteur de points ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4 }}>
        <span className="text-base uppercase tracking-widest" style={{ color: 'rgba(201,168,76,0.6)', fontSize: 11 }}>
          {t('wizard.step3.rangsVoie')}
        </span>
        {ptsBadge}
      </div>

      {/* ── Voies de peuple & culturelle ── */}
      <div style={{ padding: '10px 12px', borderRadius: 6, border: '1px solid rgba(201,168,76,0.2)', background: 'rgba(201,168,76,0.04)' }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(201,168,76,0.5)', marginBottom: 8 }}>
          {isSangMele ? t('wizard.step3.voiesDePeupleSangMele') : t('wizard.step3.voiesPeuplesCulture')}
        </div>
        {isSangMele && (
          <p style={{ fontSize: 12, color: 'rgba(245,236,215,0.45)', fontStyle: 'italic', marginBottom: 8, lineHeight: 1.5 }}>
            {t('wizard.step3.sangMeleInfo')}
          </p>
        )}
        {(isSangMele
          ? (['voiePeuple', 'voieSangMele'] as const)
          : (['voiePeuple', 'voieCulturelle'] as const)
        ).map((field, fi) => {
          const label = isSangMele
            ? t('wizard.step3.voieDePeuple_n', { n: fi + 1 })
            : field === 'voiePeuple' ? t('wizard.step3.voiePeuple') : t('wizard.step3.voieCulturelle')
          const nom = (character[field] as VoiePersonnage).nom
          const hasDesc = !!nom && !!dynamicDescriptions[nom]
          const autreField = field === 'voiePeuple' ? 'voieSangMele' : 'voiePeuple'
          const autreNom = isSangMele ? (character[autreField] as VoiePersonnage).nom : ''
          return (
            <div key={field} style={{ marginBottom: 8 }}>
              <label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--tdr-gold)', marginBottom: 4 }}>
                {label}
              </label>
              <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                {isSangMele ? (
                  <select
                    className="flex-1 border rounded px-3 py-1.5 text-base"
                    style={{ ...INPUT_STYLE, cursor: 'pointer' }}
                    value={nom}
                    onChange={e => {
                      const newNom = e.target.value
                      const autreVoieNom = field === 'voiePeuple' ? character.voieSangMele.nom : character.voiePeuple.nom
                      const newCults = [...new Set(
                        peuples.filter(p => p.label !== 'Sang-mêlé')
                          .flatMap(p => p.cultures)
                          .filter(c => c.voiePeuple === newNom || c.voiePeuple === autreVoieNom)
                          .map(c => c.voieCulturelle)
                          .filter((v): v is string => !!v)
                      )]
                      const patch: Partial<Character> = { [field]: { nom: newNom, rangs: [false,false,false,false,false] } }
                      if (character.voieCulturelle.nom && !newCults.includes(character.voieCulturelle.nom)) {
                        patch.voieCulturelle = { nom: '', rangs: [false,false,false,false,false] }
                      }
                      onChange(patch)
                    }}
                  >
                    <option value="">{t('wizard.step3.choisirVoiePeuple')}</option>
                    {voiesDePeuple.map(v => (
                      <option key={v} value={v} disabled={v === autreNom}>{v}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="flex-1 border rounded px-3 py-1.5 text-base"
                    style={{ ...INPUT_STYLE, opacity: 0.75 }}
                    value={nom}
                    readOnly
                    title={t('wizard.step3.determinePeupleEtape')}
                  />
                )}
                <button
                  onClick={() => hasDesc && setPreviewVoie(nom)}
                  disabled={!hasDesc}
                  title={hasDesc ? t('wizard.step3.voirVoie', { nom }) : t('wizard.step3.selectionnerPeuple')}
                  style={{
                    padding: '6px 10px', borderRadius: 4,
                    border: '1px solid rgba(201,168,76,0.4)',
                    background: hasDesc ? 'rgba(201,168,76,0.1)' : 'transparent',
                    color: hasDesc ? 'var(--tdr-gold)' : 'rgba(201,168,76,0.25)',
                    cursor: hasDesc ? 'pointer' : 'default',
                    fontSize: 16, lineHeight: 1, flexShrink: 0,
                  }}
                >▤</button>
              </div>
              {nom && (
                <VoieRangBar
                  voie={character[field] as VoiePersonnage}
                  voieKey={field as VoieKey}
                  disponibles={disponibles}
                  onChange={rangs => onChange({ [field]: { ...(character[field] as VoiePersonnage), rangs } })}
                  capsDesc={dynamicDescriptions[nom]}
                  onAvanceeChange={ra => onChange({ [field]: { ...(character[field] as VoiePersonnage), rangsAvances: ra } })}
                  maxRangs={isSangMele ? 3 : 5}
                />
              )}
            </div>
          )
        })}

        {isSangMele && (() => {
          const nomCult = character.voieCulturelle.nom
          const hasDescCult = !!nomCult && !!dynamicDescriptions[nomCult]
          return (
            <div style={{ marginTop: 8 }}>
              <label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--tdr-gold)', marginBottom: 4 }}>
                {t('wizard.step3.voieCulturelle')}
              </label>
              <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                <select
                  className="flex-1 border rounded px-3 py-1.5 text-base"
                  style={{ ...INPUT_STYLE, cursor: voiesCulturellesSangMele.length ? 'pointer' : 'not-allowed', opacity: voiesCulturellesSangMele.length ? 1 : 0.5 }}
                  value={nomCult}
                  disabled={voiesCulturellesSangMele.length === 0}
                  onChange={e => onChange({ voieCulturelle: { nom: e.target.value, rangs: [false,false,false,false,false] } })}
                >
                  <option value="">{t('wizard.step3.choisirVoieCulturelle')}</option>
                  {voiesCulturellesSangMele.map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
                <button
                  onClick={() => hasDescCult && setPreviewVoie(nomCult)}
                  disabled={!hasDescCult}
                  title={hasDescCult ? t('wizard.step3.voirVoie', { nom: nomCult }) : t('wizard.step3.selectionnerPeuple')}
                  style={{
                    padding: '6px 10px', borderRadius: 4,
                    border: '1px solid rgba(201,168,76,0.4)',
                    background: hasDescCult ? 'rgba(201,168,76,0.1)' : 'transparent',
                    color: hasDescCult ? 'var(--tdr-gold)' : 'rgba(201,168,76,0.25)',
                    cursor: hasDescCult ? 'pointer' : 'default',
                    fontSize: 16, lineHeight: 1, flexShrink: 0,
                  }}
                >▤</button>
              </div>
              {nomCult && (
                <VoieRangBar
                  voie={character.voieCulturelle}
                  voieKey="voieCulturelle"
                  disponibles={disponibles}
                  onChange={rangs => onChange({ voieCulturelle: { ...character.voieCulturelle, rangs } })}
                  capsDesc={dynamicDescriptions[nomCult]}
                  onAvanceeChange={ra => onChange({ voieCulturelle: { ...character.voieCulturelle, rangsAvances: ra } })}
                  maxRangs={5}
                />
              )}
            </div>
          )
        })()}
      </div>

      {/* ── Voies de profil ── */}
      <div style={{ padding: '10px 12px', borderRadius: 6, border: '1px solid rgba(201,168,76,0.2)', background: 'rgba(201,168,76,0.04)' }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(201,168,76,0.5)', marginBottom: 8 }}>
          {t('wizard.step3.voiesDeProfil')}
        </div>
      {(['voie1', 'voie2', 'voie3'] as const).map((v, i) => {
        const nomVoie = character[v].nom
        const hasDesc = !!nomVoie && !!dynamicDescriptions[nomVoie]
        const autresVoies = (['voie1', 'voie2', 'voie3'] as const)
          .filter(k => k !== v)
          .map(k => character[k].nom)
          .filter(Boolean)
        return (
          <div key={v} style={{ marginBottom: 12 }}>
            <label className="block text-base uppercase tracking-widest mb-1" style={{ color: 'var(--tdr-gold)' }}>
              {t('wizard.step3.voie_n', { n: i + 1 })}
            </label>
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              {modeVoies === 'profil' ? (
                <input
                  className="flex-1 border rounded px-3 py-1.5 text-base"
                  style={{ ...INPUT_STYLE, opacity: 0.75 }}
                  value={nomVoie}
                  readOnly
                  title={t('wizard.step3.fixeeParProfil')}
                />
              ) : (
                <div style={{ flex: 1 }}>
                  <VoieCombobox
                    value={nomVoie}
                    onChange={nom => setVoie(v, nom)}
                    options={allProfilVoies}
                    alreadyChosen={autresVoies}
                    placeholder={t('wizard.step3.rechercherVoie')}
                  />
                </div>
              )}
              {modeVoies === 'libre' && (
                <button
                  onClick={() => nomVoie && clearVoie(v)}
                  disabled={!nomVoie}
                  title={t('wizard.step3.effacerVoie')}
                  style={{
                    padding: '6px 10px', borderRadius: 4,
                    border: '1px solid rgba(180,60,60,0.35)',
                    background: nomVoie ? 'rgba(180,60,60,0.1)' : 'transparent',
                    color: nomVoie ? 'rgba(200,80,80,0.9)' : 'rgba(180,60,60,0.2)',
                    cursor: nomVoie ? 'pointer' : 'default',
                    fontSize: 16, lineHeight: 1, flexShrink: 0,
                  }}
                >×</button>
              )}
              <button
                onClick={() => hasDesc && setPreviewVoie(nomVoie)}
                disabled={!hasDesc}
                title={hasDesc ? t('wizard.step3.voirVoie', { nom: nomVoie }) : t('wizard.step3.selectionnerVoie')}
                style={{
                  padding: '6px 10px', borderRadius: 4,
                  border: '1px solid rgba(201,168,76,0.4)',
                  background: hasDesc ? 'rgba(201,168,76,0.1)' : 'transparent',
                  color: hasDesc ? 'var(--tdr-gold)' : 'rgba(201,168,76,0.25)',
                  cursor: hasDesc ? 'pointer' : 'default',
                  fontSize: 16, lineHeight: 1, flexShrink: 0,
                  transition: 'background 0.15s',
                }}
              >▤</button>
            </div>
            {nomVoie && (
              <VoieRangBar
                voie={character[v]}
                voieKey={v}
                disponibles={disponibles}
                onChange={rangs => onChange({ [v]: { ...character[v], rangs } })}
                capsDesc={dynamicDescriptions[nomVoie]}
                onAvanceeChange={ra => onChange({ [v]: { ...character[v], rangsAvances: ra } })}
              />
            )}
          </div>
        )
      })}
      </div>

      {/* ── Famille (dérivée des voies) ── */}
      <div>
        <label className="block text-base uppercase tracking-widest mb-2" style={{ color: 'var(--tdr-gold)' }}>
          {t('wizard.step3.famille')}
        </label>
        <div className="space-y-2">
          {FAMILLE_KEYS.map(key => (
            <div
              key={key}
              className="w-full text-left p-2 rounded border"
              style={{
                background: familleDérivée === key ? 'rgba(201,168,76,0.15)' : 'transparent',
                borderColor: familleDérivée === key ? 'var(--tdr-gold)' : 'rgba(201,168,76,0.2)',
                opacity: familleDérivée && familleDérivée !== key ? 0.45 : 1,
              }}
            >
              <div className="font-bold text-base" style={{ color: 'var(--tdr-gold)' }}>{t(`wizard.famille.${key}.label`)}</div>
              <div className="text-base opacity-60">{t(`wizard.famille.${key}.bonus`)}</div>
            </div>
          ))}
        </div>
        {!familleDérivée && (
          <div className="text-base opacity-50 italic mt-2">
            {t('wizard.step3.choisir2Voies')}
          </div>
        )}
      </div>

      {/* ── Voie de prestige ── */}
      {character.niveau >= 8 ? (
        <div>
          <label className="block text-base uppercase tracking-widest mb-1" style={{ color: 'var(--tdr-gold)' }}>
            {t('wizard.step3.voiePrestige')}
          </label>
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <VoieCombobox
                value={nomPrestige}
                onChange={nom => onChange({ voiePrestige: { ...character.voiePrestige, nom } })}
                options={voiesPrestige}
                placeholder={t('wizard.step3.rechercherPrestige')}
              />
            </div>
            <button
              onClick={() => nomPrestige && onChange({ voiePrestige: { nom: '', rangs: [false, false, false, false, false] } })}
              disabled={!nomPrestige}
              title={t('wizard.step3.effacerVoie')}
              style={{
                padding: '6px 10px', borderRadius: 4,
                border: '1px solid rgba(180,60,60,0.35)',
                background: nomPrestige ? 'rgba(180,60,60,0.1)' : 'transparent',
                color: nomPrestige ? 'rgba(200,80,80,0.9)' : 'rgba(180,60,60,0.2)',
                cursor: nomPrestige ? 'pointer' : 'default',
                fontSize: 16, lineHeight: 1, flexShrink: 0,
              }}
            >×</button>
            <button
              onClick={() => hasPrestigeDesc && setPreviewVoie(nomPrestige)}
              disabled={!hasPrestigeDesc}
              title={hasPrestigeDesc ? t('wizard.step3.voirVoie', { nom: nomPrestige }) : t('wizard.step3.selectionnerVoie')}
              style={{
                padding: '6px 10px', borderRadius: 4,
                border: '1px solid rgba(201,168,76,0.4)',
                background: hasPrestigeDesc ? 'rgba(201,168,76,0.1)' : 'transparent',
                color: hasPrestigeDesc ? 'var(--tdr-gold)' : 'rgba(201,168,76,0.25)',
                cursor: hasPrestigeDesc ? 'pointer' : 'default',
                fontSize: 16, lineHeight: 1, flexShrink: 0,
              }}
            >
              ▤
            </button>
          </div>
          {nomPrestige && (
            <VoieRangBar
              voie={character.voiePrestige}
              voieKey="voiePrestige"
              disponibles={disponibles}
              onChange={rangs => onChange({ voiePrestige: { ...character.voiePrestige, rangs } })}
              capsDesc={dynamicDescriptions[nomPrestige]}
              onAvanceeChange={ra => onChange({ voiePrestige: { ...character.voiePrestige, rangsAvances: ra } })}
            />
          )}
        </div>
      ) : (
        <div>
          <label className="block text-base uppercase tracking-widest mb-1" style={{ color: 'rgba(201,168,76,0.3)' }}>
            {t('wizard.step3.voiePrestige')}
          </label>
          <p style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(201,168,76,0.12)',
            borderRadius: 4, padding: '8px 12px',
            fontSize: 13, color: 'rgba(245,236,215,0.35)', fontStyle: 'italic',
          }}>
            🔒 {t('levelUp.prestigeVerrouille')}
          </p>
        </div>
      )}

      {/* ── Choix d'effets ── */}
      {(() => {
        const effectGrants = getEffectChoixGrants(character, dynamicDescriptions)
        const pending = effectGrants.filter(g => !g.choixFait)
        const done = effectGrants.filter(g => !!g.choixFait)
        if (effectGrants.length === 0) return null
        return (
          <div style={{ border: '1px solid rgba(120,180,255,0.35)', borderRadius: 8, padding: '14px 16px', background: 'rgba(120,180,255,0.05)' }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(120,180,255,0.85)', marginBottom: 10 }}>
              {t('wizard.step3.bonusAuChoix')}
            </div>
            {pending.map(({ grant, grantKey }) => (
              <div key={grantKey} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 13, color: 'rgba(200,220,255,0.75)', marginBottom: 6 }}>
                  {t('wizard.step3.choisirStat', { bonus: grant.value !== undefined ? (grant.value > 0 ? `+${grant.value}` : String(grant.value)) : grant.formula ?? '' })}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {grant.stats.map(stat => (
                    <button key={stat} onClick={() => onChange({ effectsChoix: applyChoixEffect(character, grantKey, stat) })}
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
                    <button key={stat} onClick={() => onChange({ effectsChoix: applyChoixEffect(character, grantKey, stat) })}
                      style={{ padding: '2px 8px', borderRadius: 3, border: '1px solid rgba(120,180,255,0.3)', background: 'transparent', color: 'rgba(200,220,255,0.45)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {stat}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      })()}

      {/* ── Notifications Golem ── */}
      {(() => {
        const golemRang = getGolemVoieRang(character)
        if (golemRang < 2) return null
        const notifs: string[] = []
        if (golemRang >= 2) notifs.push(t('levelUp.golemRang2'))
        if (golemRang >= 3) notifs.push(t('levelUp.golemRang3'))
        if (golemRang >= 4) notifs.push(t('levelUp.golemRang4'))
        return (
          <div style={{
            border: '1px solid rgba(130,200,180,0.35)',
            borderRadius: 8, padding: '14px 16px',
            background: 'rgba(130,200,180,0.05)',
          }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(130,200,180,0.85)', marginBottom: 10 }}>
              {t('levelUp.golemMaj')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {notifs.map((msg, i) => (
                <div key={i} style={{ fontSize: 14, color: 'rgba(185,235,220,0.85)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ color: 'rgba(130,200,180,0.7)', flexShrink: 0, marginTop: 1 }}>▸</span>
                  {msg}
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* ── Notifications Runes ── */}
      {(() => {
        const VOIE_KEYS_ALL: VoieKey[] = ['voiePeuple', 'voieCulturelle', 'voie1', 'voie2', 'voie3', 'voiePrestige', 'voieSangMele']
        const ethereeRang = VOIE_KEYS_ALL.reduce((acc, k) => {
          const v = character[k] as VoiePersonnage
          return v.nom === 'Voie éthérée' ? v.rangs.filter(Boolean).length : acc
        }, 0)
        const divinesRang = character.voiePrestige.nom === 'Voie des runes divines'
          ? character.voiePrestige.rangs.filter(Boolean).length : 0
        if (ethereeRang < 1 && divinesRang < 1) return null
        const notifs: string[] = []
        if (ethereeRang >= 1) notifs.push(t('levelUp.ethereeRang1'))
        if (ethereeRang >= 2) notifs.push(t('levelUp.ethereeRang2'))
        if (ethereeRang >= 3) notifs.push(t('levelUp.ethereeRang3'))
        if (ethereeRang >= 4) notifs.push(t('levelUp.ethereeRang4'))
        if (ethereeRang >= 5) notifs.push(t('levelUp.ethereeRang5'))
        if (divinesRang >= 1) notifs.push(t('levelUp.divinesRang1'))
        if (divinesRang >= 2) notifs.push(t('levelUp.divinesRang2'))
        if (divinesRang >= 3) notifs.push(t('levelUp.divinesRang3'))
        if (divinesRang >= 4) notifs.push(t('levelUp.divinesRang4'))
        if (divinesRang >= 5) notifs.push(t('levelUp.divinesRang5'))
        return (
          <div style={{
            border: '1px solid rgba(201,168,76,0.35)',
            borderRadius: 8, padding: '14px 16px',
            background: 'rgba(201,168,76,0.05)',
          }}>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(201,168,76,0.85)', marginBottom: 10 }}>
              {t('levelUp.runesMaj')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {notifs.map((msg, i) => (
                <div key={i} style={{ fontSize: 14, color: 'rgba(245,225,175,0.85)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ color: 'rgba(201,168,76,0.7)', flexShrink: 0, marginTop: 1 }}>▸</span>
                  {msg}
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* ── Compagnons accordés ── */}
      {(() => {
        const compagnonsNoms = getCompagnonsDisponibles(character, dynamicDescriptions)
        const choixPendants = getCompagnonChoixGrants(character, dynamicDescriptions)
        if (compagnonsNoms.length === 0 && choixPendants.length === 0) return null
        const count = compagnonsNoms.length + choixPendants.length
        return (
          <p className="text-base px-2 py-1 rounded" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(201,168,76,0.15)', color: 'rgba(245,236,215,0.5)', fontStyle: 'italic' }}>
            {t('wizard.step3.compagnonsAccordes', { count })}{' '}
            <Trans i18nKey="wizard.step3.compagnonsEtape" components={{ strong: <strong style={{ color: 'rgba(245,236,215,0.7)' }} /> }} />
          </p>
        )
      })()}

      {previewVoie && <CarteVoieModal nom={previewVoie} onClose={() => setPreviewVoie(null)} character={character} />}
    </div>
  )
}

function Step4({ character, onChange }: Pick<Props, 'character' | 'onChange'>) {
  const { FOR, DEX, CON, INT, SAG, CHA } = character.caracteristiques
  const famille = character.famille

  const niv = character.niveau
  const deVie = famille === 'combattants' ? 10 : famille === 'aventuriers' ? 8 : 6
  const pvTotal = deVie + CON.mod
  const pmBase = niv + SAG.mod
  const pm = famille === 'mystiques' ? 2 * pmBase : pmBase
  const pc = CHA.mod + 2 + (famille === 'aventuriers' ? 2 : 0)
  const pr = character.peuple.toLowerCase().includes('ogre') ? 6 : 5
  const defense = 10 + DEX.mod
  const initiative = DEX.valeur
  const attaqueContact  = niv + FOR.mod + (famille === 'combattants' ? 2 : famille === 'aventuriers' ? 1 : 0)
  const attaqueDistance = niv + DEX.mod + (famille === 'combattants' ? 2 : famille === 'aventuriers' ? 1 : 0)
  const attaqueMagique  = niv + INT.mod + (famille === 'mystiques'   ? 2 : 0)

  const { t } = useTranslation()

  React.useEffect(() => {
    onChange({ pvTotal, pvRestants: pvTotal, pm: Math.max(0, pm), pc, pr, prUtilises: Array(pr).fill(true), defense, initiative, attaqueContact, attaqueDistance, attaqueMagique })
  }, [famille, character.peuple, character.niveau, FOR.mod, DEX.mod, CON.mod, INT.mod, SAG.mod, CHA.mod])

  const cellStyle: React.CSSProperties = {
    borderBottom: '1px solid rgba(201,168,76,0.1)',
    padding: '4px 0',
    alignSelf: 'baseline',
  }

  const row = (label: string, value: string | number, formula: React.ReactNode) => (
    <React.Fragment key={label}>
      <span className="text-base" style={{ ...cellStyle, color: 'var(--tdr-gold)' }}>{label}</span>
      <span className="font-bold text-lg" style={{ ...cellStyle, textAlign: 'center' }}>{value}</span>
      <span className="text-base font-mono" style={{ ...cellStyle, textAlign: 'right', color: 'rgba(245,236,215,0.4)' }}>{formula}</span>
    </React.Fragment>
  )

  const V = (v: string | number) => (
    <span style={{ color: '#c9a84c', fontWeight: 700, opacity: 1 }}>{v}</span>
  )
  const fmt = (n: number) => n >= 0 ? `+${n}` : `${n}`

  const bonusContact = famille === 'combattants' ? 2 : famille === 'aventuriers' ? 1 : 0
  const bonusMagique = famille === 'mystiques' ? 2 : 0
  const deVieFamille = famille === 'combattants' ? 'd10' : famille === 'aventuriers' ? 'd8' : 'd6'

  return (
    <div>
      <p className="text-base opacity-70 italic mb-3">{t('wizard.step4.intro')}</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 3rem 1.6fr', columnGap: 12 }}>
        {row(t('wizard.step4.pointsVie'), pvTotal, <>{deVieFamille} ({V(deVie)}) + {t('stats.modCON')} ({V(fmt(CON.mod))})</>)}
        {row(t('wizard.step4.pointsRecup'), pr, character.peuple.toLowerCase().includes('ogre') ? <>Ogre ({V(6)})</> : <>{t('wizard.step4.fixe')} ({V(5)})</>)}
        {row(t('wizard.step4.pointsMagie'), Math.max(0, pm), famille === 'mystiques'
          ? <>({t('wizard.step4.niv')} ({V(niv)}) + {t('stats.modSAG')} ({V(fmt(SAG.mod))})) × 2</>
          : <>{t('wizard.step4.niv')} ({V(niv)}) + {t('stats.modSAG')} ({V(fmt(SAG.mod))})</>)}
        {row(t('wizard.step4.pointsChance'), pc, famille === 'aventuriers'
          ? <>{t('stats.modCHA')} ({V(fmt(CHA.mod))}) + {t('recto.tlBase')} ({V('+2')}) + {t('recto.tlAventuriers')} ({V('+2')})</>
          : <>{t('stats.modCHA')} ({V(fmt(CHA.mod))}) + {t('recto.tlBase')} ({V('+2')})</>)}
        {row(t('wizard.step4.defense'), defense, <>{t('recto.tlBase')} ({V(10)}) + {t('stats.modDEX')} ({V(fmt(DEX.mod))})</>)}
        {row(t('wizard.step4.initiative'), initiative, <>{t('stats.valDEX')} ({V(DEX.valeur)})</>)}
        {row(t('wizard.step4.attaqueContact'), attaqueContact >= 0 ? `+${attaqueContact}` : attaqueContact,
          <>{t('wizard.step4.niv')} ({V(niv)}) + {t('stats.modFOR')} ({V(fmt(FOR.mod))}) + {t('wizard.step4.famille')} ({V(fmt(bonusContact))})</>)}
        {row(t('wizard.step4.attaqueDistance'), attaqueDistance >= 0 ? `+${attaqueDistance}` : attaqueDistance,
          <>{t('wizard.step4.niv')} ({V(niv)}) + {t('stats.modDEX')} ({V(fmt(DEX.mod))}) + {t('wizard.step4.famille')} ({V(fmt(bonusContact))})</>)}
        {row(t('wizard.step4.attaqueMagique'), attaqueMagique >= 0 ? `+${attaqueMagique}` : attaqueMagique,
          <>{t('wizard.step4.niv')} ({V(niv)}) + {t('stats.modINT')} ({V(fmt(INT.mod))}) + {t('wizard.step4.famille')} ({V(fmt(bonusMagique))})</>)}
        {row(t('wizard.step4.deVie'), `1${deVieFamille}`, <>{t('wizard.step4.famille')} ({V(deVieFamille)})</>)}
      </div>
    </div>
  )
}

type EqTooltip = { lines: string[]; x: number; y: number }

function Step5({ character, onChange }: Pick<Props, 'character' | 'onChange'>) {
  const { traits, data: descriptions } = useGameData()
  const [showTraitModal, setShowTraitModal] = React.useState(false)
  const [dragOverSlot, setDragOverSlot] = React.useState<0 | 1 | null>(null)
  const [mobileCompagnonPicker, setMobileCompagnonPicker] = React.useState<0 | 1 | null>(null)

  const disponiblesNoms = getCompagnonsDisponibles(character, descriptions)
  const actifs = character.compagnonsActifs ?? [null, null]
  const reserve = disponiblesNoms.filter(n => !actifs.includes(n))
  const choixGrants = getCompagnonChoixGrants(character, descriptions)

  const handleChoixCompagnon = (nom: string) => {
    const newChoix = applyChoixCompagnon(character, nom, choixGrants)
    const newChar = { ...character, compagnonsChoix: newChoix }
    const newActifs = autoAssignCompagnons(newChar, descriptions)
    onChange({ compagnonsChoix: newChoix, compagnonsActifs: newActifs })
  }
  const handleCompagnonDragStart = (e: React.DragEvent, nom: string) => {
    e.dataTransfer.setData('compagnon', nom)
  }
  const handleCompagnonDrop = (e: React.DragEvent, slotIdx: 0 | 1) => {
    e.preventDefault()
    const nom = e.dataTransfer.getData('compagnon')
    if (!nom || !disponiblesNoms.includes(nom)) { setDragOverSlot(null); return }
    const newActifs: [string | null, string | null] = [actifs[0] ?? null, actifs[1] ?? null]
    const otherSlot = slotIdx === 0 ? 1 : 0
    if (newActifs[otherSlot] === nom) newActifs[otherSlot] = newActifs[slotIdx]
    newActifs[slotIdx] = nom
    onChange({ compagnonsActifs: newActifs })
    setDragOverSlot(null)
  }
  const clearCompagnonSlot = (slotIdx: 0 | 1) => {
    const newActifs: [string | null, string | null] = [actifs[0] ?? null, actifs[1] ?? null]
    newActifs[slotIdx] = null
    onChange({ compagnonsActifs: newActifs })
  }
  const assignCompagnonToSlot = (slotIdx: 0 | 1, nom: string) => {
    const newActifs: [string | null, string | null] = [actifs[0] ?? null, actifs[1] ?? null]
    const otherSlot = slotIdx === 0 ? 1 : 0
    if (newActifs[otherSlot] === nom) newActifs[otherSlot] = newActifs[slotIdx]
    newActifs[slotIdx] = nom
    onChange({ compagnonsActifs: newActifs })
    setMobileCompagnonPicker(null)
  }
  const { t } = useTranslation()
  const [showEquipement, setShowEquipement] = React.useState(false)
  const [eqTip, setEqTip] = React.useState<EqTooltip | null>(null)
  const [dragOver, setDragOver] = React.useState<'mainD' | 'mainG' | 'corps' | null>(null)
  const isMobile = window.innerWidth < 700
  const [mobileSlotPicker, setMobileSlotPicker] = React.useState<null | 'mainD' | 'mainG' | 'corps'>(null)
  const totalArmes = character.armes.length + character.armuresEquipees.length

  const showTip = (lines: string[], e: React.MouseEvent) => {
    setEqTip({ lines, x: e.clientX + 14, y: e.clientY + 14 })
  }
  const moveTip = (e: React.MouseEvent) => {
    if (eqTip) setEqTip(t => t ? { ...t, x: e.clientX + 14, y: e.clientY + 14 } : null)
  }
  const is2H = (nom: string) => { const n = nom.toLowerCase(); return n.includes('deux mains') || n.includes('arc') }
  const handleDragStart = (e: React.DragEvent, cat: 'arme' | 'armure', nom: string) => {
    e.dataTransfer.setData('cat', cat)
    e.dataTransfer.setData('nom', nom)
  }
  const assignToSlot = (slot: 'mainD' | 'mainG' | 'corps', nom: string, cat: 'arme' | 'armure') => {
    if ((slot === 'mainD' || slot === 'mainG') && cat === 'arme') {
      if (is2H(nom)) {
        onChange({ arme1: nom, arme2: '' })
      } else if (slot === 'mainD') {
        onChange({ arme1: nom })
      } else {
        if (character.arme1 && is2H(character.arme1)) return
        onChange({ arme2: nom })
      }
    } else if (slot === 'corps' && cat === 'armure') {
      onChange({ armuresEquipees: character.armuresEquipees.map(a => a.nom === nom ? { ...a, equipe: true } : a) })
    }
    setMobileSlotPicker(null)
  }
  const handleSlotDrop = (e: React.DragEvent, slot: 'mainD' | 'mainG' | 'corps') => {
    e.preventDefault()
    const cat = e.dataTransfer.getData('cat')
    const nom = e.dataTransfer.getData('nom')
    if ((slot === 'mainD' || slot === 'mainG') && cat === 'arme') {
      if (is2H(nom)) {
        onChange({ arme1: nom, arme2: '' })
      } else if (slot === 'mainD') {
        onChange({ arme1: nom })
      } else {
        if (character.arme1 && is2H(character.arme1)) { setDragOver(null); return }
        onChange({ arme2: nom })
      }
    } else if (slot === 'corps' && cat === 'armure') {
      onChange({ armuresEquipees: character.armuresEquipees.map(a => a.nom === nom ? { ...a, equipe: true } : a) })
    }
    setDragOver(null)
  }
  const clearSlot = (slot: 'mainD' | 'mainG' | 'corps', nom?: string) => {
    if (slot === 'mainD') onChange({ arme1: '', ...(character.arme1 && is2H(character.arme1) ? { arme2: '' } : {}) })
    else if (slot === 'mainG') onChange({ arme2: '' })
    else if (slot === 'corps' && nom) onChange({ armuresEquipees: character.armuresEquipees.map(a => a.nom === nom ? { ...a, equipe: false } : a) })
  }

  const FORMATIONS = [
    'Armes de paysan (gratuit)', 'Armes de guerre', 'Armes de guerre lourdes',
    'Armes de duel', 'Armes d\'hast', 'Armes de trait', 'Armes de tir',
    'Armes de jet', 'Armures légères', 'Armures lourdes',
  ]
  const maxFormations = character.famille === 'combattants' ? 3 : character.famille === 'aventuriers' ? 2 : 1
  const countFormations = character.formationsMartiales.filter(f => f !== 'Armes de paysan (gratuit)').length

  const toggle = (f: string) => {
    if (f === 'Armes de paysan (gratuit)') return
    const isChecked = character.formationsMartiales.includes(f)
    if (!isChecked && countFormations >= maxFormations) return
    const next = isChecked
      ? character.formationsMartiales.filter(x => x !== f)
      : [...character.formationsMartiales, f]
    onChange({ formationsMartiales: next })
  }
  return (
    <div className="space-y-3">
      <p className="text-base opacity-70 italic">
        <Trans
          i18nKey="wizard.step5.introFormations"
          count={character.famille === 'combattants' ? 3 : character.famille === 'aventuriers' ? 2 : 1}
          values={{ count: character.famille === 'combattants' ? 3 : character.famille === 'aventuriers' ? 2 : 1 }}
          components={{ strong: <strong style={{ color: 'var(--tdr-gold)' }} /> }}
        />
      </p>
      <div className="space-y-1.5">
        {FORMATIONS.map(f => {
          const isPaysan = f === 'Armes de paysan (gratuit)'
          const isChecked = isPaysan || character.formationsMartiales.includes(f)
          const isDisabled = isPaysan || (!isChecked && countFormations >= maxFormations)
          return (
            <label key={f} className="flex items-center gap-2" style={{ cursor: isDisabled ? 'default' : 'pointer', opacity: isDisabled && !isPaysan ? 0.45 : 1 }}>
              <input
                type="checkbox"
                checked={isChecked}
                disabled={isDisabled}
                onChange={() => toggle(f)}
                className="accent-yellow-500"
              />
              <span className="text-base">{f}</span>
            </label>
          )
        })}
      </div>

      {/* Armes & Armures */}
      <div>
        <label className="block text-base uppercase tracking-widest mb-1" style={{ color: 'var(--tdr-gold)' }}>
          {t('wizard.step5.armesArmures')}
        </label>
        <button
          onClick={() => setShowEquipement(true)}
          style={{
            width: '100%', padding: '7px 14px', borderRadius: 4, fontSize: 14,
            border: '1px solid rgba(201,168,76,0.4)', background: 'rgba(201,168,76,0.07)',
            color: 'var(--tdr-gold)', cursor: 'pointer', textAlign: 'left',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}
        >
          <span>{t('wizard.step5.choisirArmes')}</span>
          {totalArmes > 0 && (
            <span style={{ fontSize: 12, opacity: 0.7 }}>
              {t('wizard.step5.elementsChoisis', { count: totalArmes })}
            </span>
          )}
        </button>
        {(character.armes.length > 0 || character.armuresEquipees.length > 0) && (
          <div style={{ marginTop: 8 }}>
            {/* Slots */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              {(['mainG', 'corps', 'mainD'] as const).map(slot => {
                const LABELS = { mainG: t('wizard.step5.mainGauche'), corps: t('wizard.step5.corps'), mainD: t('wizard.step5.mainDroite') }
                const mainGBlocked = slot === 'mainG' && !!character.arme1 && is2H(character.arme1)
                const isOver = dragOver === slot && !mainGBlocked
                type SlotItem = { nom: string; sub?: string; ghost?: boolean }
                let items: SlotItem[] = []
                if (slot === 'mainD' && character.arme1) {
                  const a = character.armes.find(x => x.nom === character.arme1)
                  const two = is2H(character.arme1)
                  items = [{ nom: character.arme1, sub: a ? `DM ${a.dm}${two ? ` — ${t('wizard.step5.deuxMains')}` : ''}` : undefined }]
                } else if (slot === 'mainG') {
                  if (mainGBlocked) {
                    items = [{ nom: character.arme1, sub: t('wizard.step5.deuxMains'), ghost: true }]
                  } else if (character.arme2) {
                    const a = character.armes.find(x => x.nom === character.arme2)
                    items = [{ nom: character.arme2, sub: a ? `DM ${a.dm}` : undefined }]
                  }
                } else if (slot === 'corps') {
                  items = character.armuresEquipees.filter(a => a.equipe).map(a => ({ nom: a.nom, sub: `DEF +${a.def}` }))
                }
                return (
                  <div key={slot}
                    onDragOver={e => { e.preventDefault(); if (!mainGBlocked) setDragOver(slot) }}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={e => handleSlotDrop(e, slot)}
                    onClick={() => isMobile && !mainGBlocked && setMobileSlotPicker(slot)}
                    style={{
                      flex: slot === 'corps' ? 2 : 1, minHeight: 72,
                      border: `1px dashed ${isOver ? '#c9a84c' : 'rgba(201,168,76,0.25)'}`,
                      borderRadius: 6,
                      background: isOver ? 'rgba(201,168,76,0.1)' : 'rgba(201,168,76,0.04)',
                      padding: '6px 8px', transition: 'border-color 0.15s, background 0.15s',
                      cursor: isMobile && !mainGBlocked ? 'pointer' : 'default',
                    }}
                  >
                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, opacity: 0.45, marginBottom: 5 }}>
                      {LABELS[slot]}
                    </div>
                    {items.length === 0 ? (
                      <div style={{ opacity: 0.2, fontSize: 12, fontStyle: 'italic' }}>{isMobile ? t('wizard.step5.appuyer') : t('wizard.step5.glisserIci')}</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {items.map((item, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, opacity: item.ghost ? 0.35 : 1 }}>
                            <div>
                              <div style={{ fontSize: 12, color: 'var(--tdr-parchment)', fontStyle: item.ghost ? 'italic' : 'normal' }}>{item.nom}</div>
                              {item.sub && <div style={{ fontSize: 10, opacity: 0.5 }}>{item.sub}</div>}
                            </div>
                            {!item.ghost && (
                              <button onClick={() => clearSlot(slot, item.nom)}
                                style={{ background: 'none', border: 'none', color: 'rgba(201,168,76,0.45)', cursor: 'pointer', fontSize: 16, padding: '0 2px', lineHeight: 1, flexShrink: 0 }}
                              >×</button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {/* Items draggables */}
            {character.armes.length > 0 && (
              <>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, opacity: 0.4, marginBottom: 4 }}>{t('wizard.step5.armesLabel')}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                  {character.armes.map((a, i) => (
                    <span key={i}
                      draggable
                      onDragStart={e => handleDragStart(e, 'arme', a.nom)}
                      onMouseEnter={e => showTip([a.nom, `DM : ${a.dm}`, ...(a.attaque ? [`Mod : ${a.attaque}`] : []), ...(a.portee ? [`Portée : ${a.portee}`] : []), ...(a.special ? [a.special] : [])], e)}
                      onMouseMove={moveTip}
                      onMouseLeave={() => setEqTip(null)}
                      style={{
                        padding: '2px 8px', borderRadius: 3, fontSize: 12, cursor: 'grab',
                        background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.25)',
                        color: 'var(--tdr-parchment)', userSelect: 'none',
                        opacity: (a.nom === character.arme1 || a.nom === character.arme2) ? 0.4 : 1,
                      }}>{a.nom}</span>
                  ))}
                </div>
              </>
            )}
            {character.armuresEquipees.length > 0 && (
              <>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, opacity: 0.4, marginBottom: 4 }}>{t('wizard.step5.armuresLabel')}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {character.armuresEquipees.map((a, i) => (
                    <span key={i}
                      draggable
                      onDragStart={e => handleDragStart(e, 'armure', a.nom)}
                      onMouseEnter={e => showTip([a.nom, `DEF : +${a.def}`, ...(a.prix ? [`Prix : ${a.prix}`] : [])], e)}
                      onMouseMove={moveTip}
                      onMouseLeave={() => setEqTip(null)}
                      style={{
                        padding: '2px 8px', borderRadius: 3, fontSize: 12, cursor: 'grab',
                        background: 'rgba(100,160,255,0.1)', border: '1px solid rgba(100,160,255,0.25)',
                        color: 'var(--tdr-parchment)', userSelect: 'none',
                        opacity: a.equipe ? 0.4 : 1,
                      }}>{a.nom}</span>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Picker mobile slots équipement */}
        {isMobile && mobileCompagnonPicker !== null && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.5)' }}
            onClick={() => setMobileCompagnonPicker(null)}>
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
              background: 'rgba(18,14,9,0.99)', borderTop: '1px solid rgba(201,168,76,0.3)',
              borderRadius: '12px 12px 0 0', paddingBottom: 'env(safe-area-inset-bottom)',
              maxHeight: '65vh', display: 'flex', flexDirection: 'column' }}
              onClick={e => e.stopPropagation()}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(201,168,76,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <span style={{ fontSize: 16, fontFamily: "'Cinzel', serif", color: 'var(--tdr-gold)', fontWeight: 600 }}>
                  {t('wizard.step5.compagnonPicker', { n: mobileCompagnonPicker + 1 })}
                </span>
                <button onClick={() => setMobileCompagnonPicker(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--tdr-parchment)', opacity: 0.5, fontSize: 22, cursor: 'pointer' }}>✕</button>
              </div>
              <div style={{ overflowY: 'auto', flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px',
                  borderBottom: '1px solid rgba(201,168,76,0.08)', cursor: 'pointer' }}
                  onClick={() => { clearCompagnonSlot(mobileCompagnonPicker); setMobileCompagnonPicker(null) }}>
                  <input type="radio" readOnly checked={!actifs[mobileCompagnonPicker]}
                    style={{ width: 20, height: 20, accentColor: 'var(--tdr-gold)', flexShrink: 0 }} />
                  <span style={{ fontSize: 16, color: 'var(--tdr-parchment)' }}>{t('wizard.step5.aucun')}</span>
                </div>
                {disponiblesNoms.map(nom => {
                  const isCurrent = actifs[mobileCompagnonPicker] === nom
                  const inOtherSlot = actifs[mobileCompagnonPicker === 0 ? 1 : 0] === nom
                  return (
                    <div key={nom} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px',
                      borderBottom: '1px solid rgba(201,168,76,0.08)', cursor: 'pointer',
                      opacity: inOtherSlot && !isCurrent ? 0.5 : 1 }}
                      onClick={() => assignCompagnonToSlot(mobileCompagnonPicker, nom)}>
                      <input type="radio" readOnly checked={isCurrent}
                        style={{ width: 20, height: 20, accentColor: 'var(--tdr-gold)', flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: 16, color: 'var(--tdr-parchment)' }}>{nom}</div>
                        {inOtherSlot && !isCurrent && (
                          <div style={{ fontSize: 12, color: 'rgba(245,236,215,0.4)' }}>
                            {t('wizard.step5.seraDeplace', { slot: mobileCompagnonPicker === 0 ? 2 : 1 })}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {isMobile && mobileSlotPicker && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.5)' }}
            onClick={() => setMobileSlotPicker(null)}>
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
              background: 'rgba(18,14,9,0.99)', borderTop: '1px solid rgba(201,168,76,0.3)',
              borderRadius: '12px 12px 0 0', paddingBottom: 'env(safe-area-inset-bottom)',
              maxHeight: '65vh', display: 'flex', flexDirection: 'column' }}
              onClick={e => e.stopPropagation()}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(201,168,76,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <span style={{ fontSize: 16, fontFamily: "'Cinzel', serif", color: 'var(--tdr-gold)', fontWeight: 600 }}>
                  {{ mainD: t('wizard.step5.mainDroite'), mainG: t('wizard.step5.mainGauche'), corps: t('wizard.step5.corps') }[mobileSlotPicker]}
                </span>
                <button onClick={() => setMobileSlotPicker(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--tdr-parchment)', opacity: 0.5, fontSize: 22, cursor: 'pointer' }}>✕</button>
              </div>
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {/* Option Aucune */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px',
                  borderBottom: '1px solid rgba(201,168,76,0.08)', cursor: 'pointer' }}
                  onClick={() => { clearSlot(mobileSlotPicker); setMobileSlotPicker(null) }}>
                  <input type="radio" readOnly checked={
                    mobileSlotPicker === 'mainD' ? !character.arme1 :
                    mobileSlotPicker === 'mainG' ? !character.arme2 :
                    character.armuresEquipees.every(a => !a.equipe)
                  } style={{ width: 20, height: 20, accentColor: 'var(--tdr-gold)', flexShrink: 0 }} />
                  <span style={{ fontSize: 16, color: 'var(--tdr-parchment)' }}>{t('wizard.step5.aucune')}</span>
                </div>
                {/* Armes pour mainD/mainG */}
                {(mobileSlotPicker === 'mainD' || mobileSlotPicker === 'mainG') && character.armes.map((a, i) => {
                  const isAssigned = a.nom === character.arme1 || a.nom === character.arme2
                  const isCurrent = mobileSlotPicker === 'mainD' ? a.nom === character.arme1 : a.nom === character.arme2
                  const blockedByOther = !isCurrent && isAssigned
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px',
                      borderBottom: '1px solid rgba(201,168,76,0.08)',
                      cursor: blockedByOther ? 'not-allowed' : 'pointer', opacity: blockedByOther ? 0.4 : 1 }}
                      onClick={() => !blockedByOther && assignToSlot(mobileSlotPicker, a.nom, 'arme')}>
                      <input type="radio" readOnly checked={isCurrent}
                        style={{ width: 20, height: 20, accentColor: 'var(--tdr-gold)', flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: 16, color: 'var(--tdr-parchment)' }}>{a.nom}</div>
                        <div style={{ fontSize: 13, color: 'rgba(245,236,215,0.5)' }}>
                          DM {a.dm}{is2H(a.nom) ? ` — ${t('wizard.step5.deuxMains')}` : ''}
                        </div>
                      </div>
                    </div>
                  )
                })}
                {/* Armures pour corps */}
                {mobileSlotPicker === 'corps' && character.armuresEquipees.map((a, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px',
                    borderBottom: '1px solid rgba(201,168,76,0.08)', cursor: 'pointer' }}
                    onClick={() => assignToSlot('corps', a.nom, 'armure')}>
                    <input type="radio" readOnly checked={a.equipe}
                      style={{ width: 20, height: 20, accentColor: 'rgba(100,160,255,0.8)', flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 16, color: 'var(--tdr-parchment)' }}>{a.nom}</div>
                      <div style={{ fontSize: 13, color: 'rgba(245,236,215,0.5)' }}>DEF +{a.def}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {eqTip && (
          <div style={{
            position: 'fixed', zIndex: 9999, pointerEvents: 'none',
            left: eqTip.x, top: eqTip.y,
            background: 'rgba(12,9,5,0.97)', border: '1px solid rgba(201,168,76,0.35)',
            borderRadius: 5, padding: '7px 12px', minWidth: 120,
            boxShadow: '0 4px 20px rgba(0,0,0,0.7)',
          }}>
            {eqTip.lines.map((line, i) => (
              <div key={i} style={{
                fontSize: i === 0 ? 13 : 12,
                fontWeight: i === 0 ? 700 : 400,
                color: i === 0 ? 'var(--tdr-gold)' : 'var(--tdr-parchment)',
                opacity: i === 0 ? 1 : 0.85,
                marginTop: i > 0 ? 3 : 0,
              }}>{line}</div>
            ))}
          </div>
        )}
      </div>

      {showEquipement && (
        <EquipementModal character={character} onChange={onChange} onClose={() => setShowEquipement(false)} />
      )}

      {/* ── Compagnons ── */}
      {(disponiblesNoms.length > 0 || choixGrants.length > 0) && (
        <div>
          <label className="block text-base uppercase tracking-widest mb-1" style={{ color: 'var(--tdr-gold)' }}>
            {t('wizard.step5.compagnons')}
          </label>
          {/* Choix en attente */}
          {choixGrants.filter(({ choixFait }) => !choixFait).map(({ grant }, idx) => (
            <div key={idx} style={{ marginBottom: 8, padding: '8px 10px', borderRadius: 5, background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.2)' }}>
              <div style={{ fontSize: 12, color: 'rgba(201,168,76,0.7)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {t('wizard.step5.choisirCompagnon')}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {grant.noms.map(nom => (
                  <button
                    key={nom}
                    onClick={() => handleChoixCompagnon(nom)}
                    style={{
                      padding: '4px 12px', borderRadius: 4, fontSize: 13, cursor: 'pointer',
                      border: '1px solid rgba(201,168,76,0.4)', background: 'rgba(201,168,76,0.1)',
                      color: 'var(--tdr-parchment)', fontFamily: 'inherit',
                    }}
                  >
                    {nom}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* Choix faits (modifiables) */}
          {choixGrants.filter(({ choixFait }) => !!choixFait).map(({ grant, choixFait }, idx) => (
            <div key={idx} style={{ marginBottom: 8, padding: '6px 10px', borderRadius: 5, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(201,168,76,0.15)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'rgba(201,168,76,0.5)', flexShrink: 0 }}>{t('wizard.step5.compagnonChoisi')}</span>
              <span style={{ fontSize: 13, color: 'var(--tdr-parchment)', fontWeight: 600 }}>{choixFait}</span>
              <span style={{ fontSize: 11, color: 'rgba(201,168,76,0.4)', marginLeft: 'auto' }}>{t('wizard.step5.changer')}</span>
              {grant.noms.filter(n => n !== choixFait).map(nom => (
                <button
                  key={nom}
                  onClick={() => handleChoixCompagnon(nom)}
                  style={{
                    padding: '2px 8px', borderRadius: 4, fontSize: 12, cursor: 'pointer',
                    border: '1px solid rgba(201,168,76,0.25)', background: 'transparent',
                    color: 'rgba(245,236,215,0.55)', fontFamily: 'inherit',
                  }}
                >
                  {nom}
                </button>
              ))}
            </div>
          ))}

          {/* 2 slots actifs */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            {([0, 1] as const).map(slotIdx => {
              const nom = actifs[slotIdx] ?? null
              const isOver = dragOverSlot === slotIdx
              return (
                <div key={slotIdx}
                  onDragOver={e => { e.preventDefault(); setDragOverSlot(slotIdx) }}
                  onDragLeave={() => setDragOverSlot(null)}
                  onDrop={e => handleCompagnonDrop(e, slotIdx)}
                  onClick={() => isMobile && disponiblesNoms.length > 0 && setMobileCompagnonPicker(slotIdx)}
                  style={{
                    flex: 1, minHeight: 40, borderRadius: 5,
                    border: `1px dashed ${isOver ? 'var(--tdr-gold)' : 'rgba(201,168,76,0.3)'}`,
                    background: isOver ? 'rgba(201,168,76,0.08)' : 'rgba(255,255,255,0.02)',
                    display: 'flex', alignItems: 'center', padding: '6px 10px', gap: 6,
                    transition: 'border-color 0.15s, background 0.15s',
                    cursor: isMobile ? 'pointer' : 'default',
                  }}
                >
                  {nom ? (
                    <>
                      <span
                        draggable={!isMobile}
                        onDragStart={e => handleCompagnonDragStart(e, nom)}
                        style={{
                          flex: 1, fontSize: 13, color: 'var(--tdr-parchment)', cursor: isMobile ? 'pointer' : 'grab',
                          padding: '2px 6px', borderRadius: 3, background: 'rgba(201,168,76,0.1)',
                          border: '1px solid rgba(201,168,76,0.3)',
                        }}
                      >
                        {nom}
                      </span>
                      <button
                        onClick={e => { e.stopPropagation(); clearCompagnonSlot(slotIdx) }}
                        style={{ background: 'none', border: 'none', color: 'rgba(220,100,100,0.7)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '0 2px' }}
                      >✕</button>
                    </>
                  ) : (
                    <span style={{ fontSize: 12, color: 'rgba(245,236,215,0.25)', fontStyle: 'italic' }}>
                      {isMobile ? t('wizard.step5.toucherPourChoisir') : t('wizard.step5.glisserCompagnon')}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
          {/* Réserve */}
          {reserve.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {reserve.map(nom => (
                <span
                  key={nom}
                  draggable
                  onDragStart={e => handleCompagnonDragStart(e, nom)}
                  style={{
                    fontSize: 13, color: 'rgba(245,236,215,0.7)', cursor: 'grab',
                    padding: '3px 10px', borderRadius: 12,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(201,168,76,0.25)',
                    userSelect: 'none',
                  }}
                >
                  {nom}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ opacity: character.famille === 'mystiques' ? 1 : 0.35, pointerEvents: character.famille === 'mystiques' ? 'auto' : 'none' }}>
        <label className="block text-base uppercase tracking-widest mb-1" style={{ color: 'var(--tdr-gold)' }}>
          {t('wizard.step5.talentMagique')}
        </label>
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          <TraitCombobox
            value={character.talentMagique.nom}
            onChange={nom => {
              const traitEntry = traits.find(t => t.nom === nom)
              onChange({ talentMagique: { nom, desc: traitEntry?.desc ?? character.talentMagique.desc } })
            }}
          />
          <button
            onClick={() => character.talentMagique.nom && onChange({ talentMagique: { nom: '', desc: '' } })}
            disabled={!character.talentMagique.nom}
            title={t('wizard.step5.effacerTrait')}
            style={{
              padding: '6px 10px', borderRadius: 4,
              border: '1px solid rgba(180,60,60,0.35)',
              background: character.talentMagique.nom ? 'rgba(180,60,60,0.1)' : 'transparent',
              color: character.talentMagique.nom ? 'rgba(200,80,80,0.9)' : 'rgba(180,60,60,0.2)',
              cursor: character.talentMagique.nom ? 'pointer' : 'default',
              fontSize: 16, lineHeight: 1, flexShrink: 0,
            }}
          >×</button>
          <button
            onClick={() => character.talentMagique.nom && setShowTraitModal(true)}
            disabled={!character.talentMagique.nom}
            title={character.talentMagique.nom ? t('wizard.step5.voirTrait', { nom: character.talentMagique.nom }) : t('wizard.step5.selectionnerTrait')}
            style={{
              padding: '6px 10px', borderRadius: 4,
              border: '1px solid rgba(201,168,76,0.4)',
              background: character.talentMagique.nom ? 'rgba(201,168,76,0.1)' : 'transparent',
              color: character.talentMagique.nom ? 'var(--tdr-gold)' : 'rgba(201,168,76,0.25)',
              cursor: character.talentMagique.nom ? 'pointer' : 'default',
              fontSize: 16, lineHeight: 1, flexShrink: 0,
            }}
          >▤</button>
        </div>
      </div>

      {showTraitModal && (
        <TraitMagiqueModal
          nom={character.talentMagique.nom}
          desc={character.talentMagique.desc}
          onChange={(nom, desc) => onChange({ talentMagique: { nom, desc } })}
          onClose={() => setShowTraitModal(false)}
        />
      )}
    </div>
  )
}

function Step6({ character, onChange }: Pick<Props, 'character' | 'onChange'>) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3">
      <p className="text-base opacity-70 italic">{t('wizard.step6.intro')}</p>

      <div>
        <label className="block text-base uppercase tracking-widest mb-1" style={{ color: 'var(--tdr-gold)' }}>
          {t('wizard.step6.description')}
        </label>
        <textarea
          className="w-full border rounded px-3 py-2 text-base"
          style={{ ...INPUT_STYLE, minHeight: '6rem' }}
          value={character.description}
          onChange={e => onChange({ description: e.target.value })}
        />
      </div>
      <div>
        <label className="block text-base uppercase tracking-widest mb-1" style={{ color: 'var(--tdr-gold)' }}>
          {t('wizard.step6.inventaire')}
        </label>
        <textarea
          className="w-full border rounded px-3 py-2 text-base"
          style={{ ...INPUT_STYLE, minHeight: '4rem' }}
          value={character.inventaire}
          onChange={e => onChange({ inventaire: e.target.value })}
        />
        <p className="text-base italic mt-1" style={{ color: 'rgba(245,236,215,0.5)', fontSize: '0.9em' }}>
          {t('wizard.step6.inventaireHint')}
        </p>
      </div>
      <div>
        <label className="block text-base uppercase tracking-widest mb-1" style={{ color: 'var(--tdr-gold)' }}>
          {t('wizard.step6.tresorerie')}
        </label>
        <input
          className="w-full border rounded px-3 py-1.5 text-base"
          style={INPUT_STYLE}
          value={character.tresorerie}
          onChange={e => onChange({ tresorerie: e.target.value })}
        />
      </div>

    </div>
  )
}

function Step7({ character, modeVoies, onSave, onPrint }: Pick<Props, 'character'> & { modeVoies: 'libre' | 'profil'; onSave?: () => void; onPrint?: () => void }) {
  const { t } = useTranslation()
  const { disponibles: ptsDisponibles } = calcPointsCapacite(character)
  const maxFormations = character.famille === 'combattants' ? 3 : character.famille === 'aventuriers' ? 2 : 1
  const nbFormationsChoisies = character.formationsMartiales.filter(f => f !== 'Armes de paysan (gratuit)').length
  const totalArmes = character.armes.length + character.armuresEquipees.length

  type CheckItem = { label: string; ok: boolean; niveau: 'requis' | 'conseille' }
  const checks: CheckItem[] = [
    { label: t('wizard.step7.checks.nomJoueur'),       ok: !!character.nomJoueur.trim(),          niveau: 'requis' },
    { label: t('wizard.step7.checks.nomPersonnage'),   ok: !!character.nomPersonnage.trim(),       niveau: 'requis' },
    { label: t('wizard.step7.checks.peupleRenseigne'), ok: !!character.peuple,                     niveau: 'requis' },
    { label: t('wizard.step7.checks.cultureRenseignee'), ok: !!character.culture,                  niveau: 'requis' },
    { label: t('wizard.step7.checks.profilRenseigne'), ok: modeVoies === 'libre' || !!character.profil, niveau: 'requis' },
    { label: t('wizard.step7.checks.familleDeterminee'), ok: !!character.famille,                  niveau: 'requis' },
    { label: t('wizard.step7.checks.voie1'),           ok: !!character.voie1.nom,                  niveau: 'requis' },
    { label: t('wizard.step7.checks.voie2'),           ok: !!character.voie2.nom,                  niveau: 'requis' },
    { label: t('wizard.step7.checks.voie3'),           ok: !!character.voie3.nom,                  niveau: 'requis' },
    { label: t('wizard.step7.checks.pointsCapacite', { count: ptsDisponibles }),
                                                  ok: ptsDisponibles === 0,                   niveau: 'requis' },
    { label: t('wizard.step7.checks.pointsVieCalcules'), ok: character.pvTotal > 0,               niveau: 'requis' },
    { label: t('wizard.step7.checks.formations', { nb: nbFormationsChoisies, max: maxFormations }),
                                                  ok: nbFormationsChoisies >= maxFormations,  niveau: 'requis' },
    { label: t('wizard.step7.checks.armesChoisis'),    ok: totalArmes > 0,                         niveau: 'conseille' },
    { label: t('wizard.step7.checks.talentMagique'),
      ok: character.famille !== 'mystiques' || !!character.talentMagique.nom,                 niveau: 'conseille' },
    { label: t('wizard.step7.checks.portrait'),        ok: !!character.portrait,                   niveau: 'conseille' },
  ]
  const manquants  = checks.filter(c => !c.ok && c.niveau === 'requis')
  const conseilles = checks.filter(c => !c.ok && c.niveau === 'conseille')
  const toutOk     = manquants.length === 0 && conseilles.length === 0

  return (
    <div className="space-y-4">
      {toutOk ? (
        <div style={{
          borderRadius: 10, padding: '24px 20px',
          background: 'rgba(120,200,120,0.07)',
          border: '1px solid rgba(120,200,120,0.35)',
          display: 'flex', flexDirection: 'column', gap: 20,
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontFamily: "'Cinzel', serif", fontWeight: 700, color: 'rgba(120,200,120,0.95)', marginBottom: 8 }}>
              {t('wizard.step7.bonneAventure')}
            </div>
            <p style={{ fontSize: 14, color: 'rgba(120,200,120,0.7)', margin: 0, fontStyle: 'italic' }}>
              {t('wizard.step7.personnagePret')}
            </p>
          </div>

          {/* Sauvegarde */}
          <div style={{
            background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.25)',
            borderRadius: 7, padding: '14px 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
          }}>
            <div>
              <div style={{ fontSize: 13, color: 'var(--tdr-gold)', fontWeight: 600, marginBottom: 3 }}>{t('wizard.step7.sauvegarder')}</div>
              <div style={{ fontSize: 12, color: 'rgba(245,236,215,0.5)', lineHeight: 1.5 }}>
                {t('wizard.step7.sauvegarderDesc')}
              </div>
            </div>
            {onSave && (
              <button onClick={onSave} style={{
                flexShrink: 0, padding: '7px 16px', borderRadius: 5, fontSize: 13, cursor: 'pointer',
                border: '1px solid rgba(201,168,76,0.5)', background: 'rgba(201,168,76,0.15)',
                color: 'var(--tdr-gold)', fontWeight: 600, whiteSpace: 'nowrap',
              }}>
                {t('wizard.step7.btnSauvegarder')}
              </button>
            )}
          </div>

          {/* Impression */}
          <div style={{
            background: 'rgba(120,180,255,0.04)', border: '1px solid rgba(120,180,255,0.2)',
            borderRadius: 7, padding: '14px 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
          }}>
            <div>
              <div style={{ fontSize: 13, color: 'rgba(140,190,255,0.85)', fontWeight: 600, marginBottom: 3 }}>{t('wizard.step7.imprimer')}</div>
              <div style={{ fontSize: 12, color: 'rgba(245,236,215,0.5)', lineHeight: 1.5 }}>
                {t('wizard.step7.imprimerDesc')}
              </div>
            </div>
            {onPrint && (
              <button onClick={onPrint} style={{
                flexShrink: 0, padding: '7px 16px', borderRadius: 5, fontSize: 13, cursor: 'pointer',
                border: '1px solid rgba(120,180,255,0.35)', background: 'rgba(120,180,255,0.08)',
                color: 'rgba(140,190,255,0.85)', fontWeight: 600, whiteSpace: 'nowrap',
              }}>
                {t('wizard.step7.btnImprimer')}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div style={{
          border: `1px solid ${manquants.length > 0 ? 'rgba(200,100,80,0.4)' : 'rgba(201,168,76,0.35)'}`,
          borderRadius: 8, padding: '12px 16px',
          background: manquants.length > 0 ? 'rgba(200,80,60,0.04)' : 'rgba(201,168,76,0.04)',
        }}>
          <div style={{
            fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, marginBottom: 10,
            color: manquants.length > 0 ? '#c97a4c' : 'var(--tdr-gold)',
          }}>
            {t('wizard.step7.recap', { count: manquants.length + conseilles.length })}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {[...manquants, ...conseilles].map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <span style={{
                  flexShrink: 0, width: 18, height: 18, borderRadius: 3,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700,
                  background: c.niveau === 'requis' ? 'rgba(200,80,60,0.2)' : 'rgba(201,168,76,0.12)',
                  color: c.niveau === 'requis' ? '#c97a4c' : 'rgba(201,168,76,0.8)',
                  border: `1px solid ${c.niveau === 'requis' ? 'rgba(200,80,60,0.35)' : 'rgba(201,168,76,0.25)'}`,
                }}>
                  {c.niveau === 'requis' ? '✕' : '!'}
                </span>
                <span style={{ color: c.niveau === 'requis' ? 'rgba(245,236,215,0.85)' : 'rgba(245,236,215,0.55)' }}>
                  {c.label}
                </span>
                {c.niveau === 'conseille' && (
                  <span style={{ fontSize: 11, color: 'rgba(245,236,215,0.3)', fontStyle: 'italic' }}>{t('wizard.step7.conseille')}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function CreationWizard({ step, maxStep, character, onChange, onNext, onPrev, onGoTo, onSave, onPrint }: Props) {
  const { t } = useTranslation()
  const [modeVoies, setModeVoies] = React.useState<'libre' | 'profil'>('libre')
  const ptsDisp = calcPointsCapacite(character).disponibles
  const maxForms = character.famille === 'combattants' ? 3 : character.famille === 'aventuriers' ? 2 : 1
  const nbForms  = character.formationsMartiales.filter(f => f !== 'Armes de paysan (gratuit)').length
  const personnageComplet = !!(
    character.nomJoueur.trim() && character.nomPersonnage.trim() &&
    character.peuple && character.culture && (modeVoies === 'libre' || character.profil) && character.famille &&
    character.voie1.nom && character.voie2.nom && character.voie3.nom &&
    ptsDisp === 0 && character.pvTotal > 0 && nbForms >= maxForms
  )
  const stepOk: boolean[] = [
    !!(character.nomJoueur.trim() && character.nomPersonnage.trim()),
    !!(character.peuple && character.culture),
    Object.values(character.caracteristiques).some(c => c.valeur !== 10),
    !!((modeVoies === 'libre' || character.profil) && character.famille && character.voie1.nom && character.voie2.nom && character.voie3.nom && ptsDisp === 0),
    character.pvTotal > 0,
    true,
    true,
    personnageComplet,
  ]

  const stepComponents = [
    <Step0 character={character} onChange={onChange} />,
    <Step1 character={character} onChange={onChange} />,
    <Step2 character={character} onChange={onChange} />,
    <Step3 character={character} onChange={onChange} modeVoies={modeVoies} setModeVoies={setModeVoies} />,
    <Step4 character={character} onChange={onChange} />,
    <Step5 character={character} onChange={onChange} />,
    <Step6 character={character} onChange={onChange} />,
    <Step7 character={character} modeVoies={modeVoies} onSave={onSave} onPrint={onPrint} />,
  ]

  return (
    <div className="flex flex-col h-full" style={{ fontFamily: "'Crimson Text', Georgia, serif" }}>
      {/* Header */}
      <div className="px-4 pt-4 pb-2 border-b" style={{ borderColor: 'rgba(201,168,76,0.2)' }}>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-base uppercase tracking-widest opacity-50">{t('wizard.etape', { current: step + 1, total: STEP_COUNT })}</span>
        </div>
        <StepIndicator current={step} maxStep={maxStep} total={STEP_COUNT} stepOk={stepOk} onGoTo={onGoTo} />
        <h2 className="text-2xl font-bold" style={{ color: 'var(--tdr-gold)', fontFamily: "'Cinzel', serif" }}>
          {t(`wizard.stepNames.${step}`)}
        </h2>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {stepComponents[step]}
      </div>

      {/* Navigation */}
      <div className="px-4 pb-4 pt-2 border-t flex gap-2" style={{ borderColor: 'rgba(201,168,76,0.2)' }}>
        <button
          onClick={onPrev}
          disabled={step === 0}
          className="flex-1 py-2 rounded border text-base transition-all disabled:opacity-30"
          style={{ borderColor: 'rgba(201,168,76,0.4)', color: 'var(--tdr-parchment)' }}
        >
          {t('wizard.nav.precedent')}
        </button>
        {step < STEP_COUNT - 1 && (
          <button
            onClick={onNext}
            className="flex-1 py-2 rounded text-base font-bold transition-all"
            style={{ background: 'var(--tdr-gold)', color: 'var(--tdr-dark)' }}
          >
            {t('wizard.nav.suivant')}
          </button>
        )}
        {step === STEP_COUNT - 1 && (
          <button
            onClick={onNext}
            disabled={!personnageComplet}
            className="flex-1 py-2 rounded text-base font-bold transition-all"
            style={{
              background: personnageComplet ? 'var(--tdr-gold)' : 'rgba(201,168,76,0.15)',
              color: personnageComplet ? 'var(--tdr-dark)' : 'rgba(201,168,76,0.35)',
              cursor: personnageComplet ? 'pointer' : 'not-allowed',
              border: personnageComplet ? 'none' : '1px solid rgba(201,168,76,0.25)',
            }}
            title={!personnageComplet ? t('wizard.nav.terminerTitle') : ''}
          >
            {t('wizard.nav.terminer')}
          </button>
        )}
      </div>
    </div>
  )
}
