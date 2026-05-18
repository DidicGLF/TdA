import React from 'react'
import type { Character, Caracteristique } from '../types/character'
import { getMod } from '../types/character'
import { PEUPLES as PEUPLES_DATA, findCulture } from '../data/peuples'
import { getVoiesForFamille } from '../data/voies'
import VoieCombobox from './VoieCombobox'

interface Props {
  step: number
  character: Character
  onChange: (patch: Partial<Character>) => void
  onNext: () => void
  onPrev: () => void
}

const STEPS = [
  'Identité',
  'Peuple & Culture',
  'Caractéristiques',
  'Profil & Voies',
  'Scores dérivés',
  'Équipement',
  'Finalisation',
]

const DISTRIBUTION = [10, 11, 12, 13, 14, 16]

const INPUT_STYLE = {
  background: 'rgba(15,12,8,0.92)',
  borderColor: 'rgba(201,168,76,0.35)',
  color: 'var(--tdr-parchment)',
}

const CARACS: { key: Caracteristique; label: string; desc: string }[] = [
  { key: 'FOR', label: 'Force', desc: 'Puissance physique. Attaques de contact et dommages.' },
  { key: 'DEX', label: 'Dextérité', desc: 'Agilité et réflexes. Initiative, attaques à distance, DEF.' },
  { key: 'CON', label: 'Constitution', desc: 'Endurance. Points de vie et résistance.' },
  { key: 'INT', label: 'Intelligence', desc: 'Raisonnement. Efficacité des sorts.' },
  { key: 'SAG', label: 'Sagesse', desc: 'Volonté et perception. Points de magie et durée des sorts.' },
  { key: 'CHA', label: 'Charisme', desc: 'Persuasion et présence. Points de chance.' },
]

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex gap-1 mb-4">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className="h-1 flex-1 rounded-full transition-all"
          style={{
            background: i <= current ? 'var(--tdr-gold)' : 'rgba(201,168,76,0.2)',
          }}
        />
      ))}
    </div>
  )
}

function Step0({ character, onChange }: Pick<Props, 'character' | 'onChange'>) {
  return (
    <div className="space-y-3">
      <p className="text-sm opacity-70 italic">Commençons par les informations de base sur votre personnage.</p>
      {[
        { label: 'Nom du joueur', field: 'nomJoueur' },
        { label: 'Nom du personnage', field: 'nomPersonnage' },
        { label: 'Genre', field: 'genre' },
        { label: 'Âge', field: 'age' },
        { label: 'Taille', field: 'taille' },
        { label: 'Poids', field: 'poids' },
      ].map(({ label, field }) => (
        <div key={field}>
          <label className="block text-xs uppercase tracking-widest mb-1" style={{ color: 'var(--tdr-gold)' }}>
            {label}
          </label>
          <input
            className="w-full border rounded px-3 py-1.5 text-sm"
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
  const selectedPeuple = PEUPLES_DATA.find(p => p.label === character.peuple) ?? null
  const cultures = selectedPeuple?.cultures ?? []

  const onPeupleChange = (peupleLabel: string) => {
    const peuple = PEUPLES_DATA.find(p => p.label === peupleLabel)
    const firstCulture = peuple?.cultures[0]
    onChange({
      peuple: peupleLabel,
      culture: firstCulture?.label ?? '',
      voiePeuple: { ...character.voiePeuple, nom: firstCulture?.voiePeuple ?? '' },
      voieCulturelle: { ...character.voieCulturelle, nom: firstCulture?.voieCulturelle ?? '' },
    })
  }

  const onCultureChange = (cultureLabel: string) => {
    const culture = findCulture(character.peuple, cultureLabel)
    onChange({
      culture: cultureLabel,
      voiePeuple: { ...character.voiePeuple, nom: culture?.voiePeuple ?? character.voiePeuple.nom },
      voieCulturelle: { ...character.voieCulturelle, nom: culture?.voieCulturelle ?? character.voieCulturelle.nom },
    })
  }

  const modCaracs = findCulture(character.peuple, character.culture)?.modCaracs ?? {}
  const modText = Object.entries(modCaracs)
    .map(([k, v]) => `${k} ${(v as number) >= 0 ? '+' : ''}${v}`)
    .join(', ')

  return (
    <div className="space-y-3">
      <p className="text-sm opacity-70 italic">
        Le peuple détermine vos modificateurs de caractéristiques, votre voie de peuple et votre voie culturelle.
      </p>

      <div>
        <label className="block text-xs uppercase tracking-widest mb-1" style={{ color: 'var(--tdr-gold)' }}>
          Peuple
        </label>
        <select
          className="w-full border rounded px-3 py-1.5 text-sm"
          style={INPUT_STYLE}
          value={character.peuple}
          onChange={e => onPeupleChange(e.target.value)}
        >
          <option value="">-- Choisir --</option>
          {PEUPLES_DATA.map(p => <option key={p.label} value={p.label}>{p.label}</option>)}
        </select>
      </div>

      {cultures.length > 1 && (
        <div>
          <label className="block text-xs uppercase tracking-widest mb-1" style={{ color: 'var(--tdr-gold)' }}>
            Culture
          </label>
          <select
            className="w-full border rounded px-3 py-1.5 text-sm"
            style={INPUT_STYLE}
            value={character.culture}
            onChange={e => onCultureChange(e.target.value)}
          >
            <option value="">-- Choisir --</option>
            {cultures.map(c => <option key={c.label} value={c.label}>{c.label}</option>)}
          </select>
        </div>
      )}

      {modText && (
        <p className="text-xs px-2 py-1 rounded" style={{ background: 'rgba(201,168,76,0.1)', color: 'var(--tdr-gold)' }}>
          Modificateurs : {modText}
        </p>
      )}

      <div>
        <label className="block text-xs uppercase tracking-widest mb-1" style={{ color: 'var(--tdr-gold)' }}>
          Voie de peuple
        </label>
        <input
          className="w-full border rounded px-3 py-1.5 text-sm"
          style={INPUT_STYLE}
          value={character.voiePeuple.nom}
          onChange={e => onChange({ voiePeuple: { ...character.voiePeuple, nom: e.target.value } })}
        />
      </div>

      <div>
        <label className="block text-xs uppercase tracking-widest mb-1" style={{ color: 'var(--tdr-gold)' }}>
          Voie culturelle
        </label>
        <input
          className="w-full border rounded px-3 py-1.5 text-sm"
          style={INPUT_STYLE}
          value={character.voieCulturelle.nom}
          onChange={e => onChange({ voieCulturelle: { ...character.voieCulturelle, nom: e.target.value } })}
        />
      </div>

      <div>
        <label className="block text-xs uppercase tracking-widest mb-1" style={{ color: 'var(--tdr-gold)' }}>
          Trait de peuple
        </label>
        <input
          className="w-full border rounded px-3 py-1.5 text-sm"
          style={INPUT_STYLE}
          value={character.traitPeuple}
          onChange={e => onChange({ traitPeuple: e.target.value })}
        />
      </div>
    </div>
  )
}

function Step2({ character, onChange }: Pick<Props, 'character' | 'onChange'>) {
  const [method, setMethod] = React.useState<'distribution' | 'aleatoire'>('distribution')
  const [pool, setPool] = React.useState<number[]>(DISTRIBUTION)
  const [assigned, setAssigned] = React.useState<Record<Caracteristique, number | null>>({
    FOR: null, DEX: null, CON: null, INT: null, SAG: null, CHA: null,
  })

  const assign = (carac: Caracteristique, val: number) => {
    const prev = assigned[carac]
    const newAssigned = { ...assigned, [carac]: val }
    const newPool = pool.filter(v => v !== val)
    if (prev !== null) newPool.push(prev)
    newPool.sort((a, b) => a - b)
    setAssigned(newAssigned)
    setPool(newPool)
    const mod = getMod(val)
    onChange({
      caracteristiques: {
        ...character.caracteristiques,
        [carac]: { valeur: val, mod },
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
            className="flex-1 py-1 rounded text-xs border transition-all"
            style={{
              background: method === m ? 'var(--tdr-gold)' : 'transparent',
              color: method === m ? 'var(--tdr-dark)' : 'var(--tdr-parchment)',
              borderColor: 'var(--tdr-gold)',
              fontWeight: method === m ? 700 : 400,
            }}
          >
            {m === 'distribution' ? 'Distribution' : 'Aléatoire'}
          </button>
        ))}
      </div>

      {method === 'aleatoire' && (
        <button
          onClick={rollDice}
          className="w-full py-1.5 rounded text-sm border"
          style={{ borderColor: 'rgba(201,168,76,0.5)', color: 'var(--tdr-parchment)' }}
        >
          Lancer les dés (4d6, garder 3)
        </button>
      )}

      <div className="flex flex-wrap gap-1 min-h-8">
        {pool.map((v, i) => (
          <span key={i} className="px-2 py-0.5 rounded text-sm font-bold"
            style={{ background: 'rgba(201,168,76,0.2)', color: 'var(--tdr-gold)' }}>
            {v}
          </span>
        ))}
        {pool.length === 0 && <span className="text-xs opacity-50 italic">Tous les scores sont assignés</span>}
      </div>

      <div className="space-y-2">
        {CARACS.map(({ key, desc }) => (
          <div key={key} className="flex items-center gap-2">
            <div className="w-10 text-center font-bold text-sm" style={{ color: 'var(--tdr-gold)' }}>{key}</div>
            <select
              className="flex-1 border rounded px-2 py-1 text-sm"
              style={INPUT_STYLE}
              value={assigned[key] ?? ''}
              onChange={e => assign(key, parseInt(e.target.value))}
            >
              <option value="">--</option>
              {assigned[key] !== null && <option value={assigned[key]!}>{assigned[key]}</option>}
              {pool.map((v, i) => <option key={i} value={v}>{v}</option>)}
            </select>
            <div className="w-10 text-center text-sm" style={{ color: 'var(--tdr-gold)' }}>
              {assigned[key] !== null
                ? (getMod(assigned[key]!) >= 0 ? `+${getMod(assigned[key]!)}` : getMod(assigned[key]!))
                : '—'}
            </div>
            <div className="text-xs opacity-50 hidden xl:block" style={{ width: '8rem' }}>{desc.split('.')[0]}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Step3({ character, onChange }: Pick<Props, 'character' | 'onChange'>) {
  const FAMILLES = [
    { key: 'combattants', label: 'Combattants', bonus: 'd10 PV · 3 formations · Contact+2 · Distance+2' },
    { key: 'aventuriers', label: 'Aventuriers', bonus: 'd8 PV · 2 formations · Contact+1 · Distance+1 · PC+2' },
    { key: 'mystiques', label: 'Mystiques', bonus: 'd6 PV · 1 formation · Magique+2 · PM×2 · Talent magique' },
  ] as const

  const setVoie = (field: 'voie1' | 'voie2' | 'voie3', nom: string) =>
    onChange({ [field]: { ...character[field], nom } })

  const voieOptions = getVoiesForFamille(character.famille ?? null)
  const chosenVoies = [character.voie1.nom, character.voie2.nom, character.voie3.nom].filter(Boolean)

  return (
    <div className="space-y-3">
      <p className="text-sm opacity-70 italic">Le profil définit 3 voies de profil et la famille du personnage.</p>

      <div>
        <label className="block text-xs uppercase tracking-widest mb-1" style={{ color: 'var(--tdr-gold)' }}>
          Profil
        </label>
        <input
          className="w-full border rounded px-3 py-1.5 text-sm"
          style={INPUT_STYLE}
          value={character.profil}
          onChange={e => onChange({ profil: e.target.value })}
        />
      </div>

      <div>
        <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--tdr-gold)' }}>
          Famille
        </label>
        <div className="space-y-2">
          {FAMILLES.map(f => (
            <button
              key={f.key}
              onClick={() => onChange({
                famille: f.key,
                deVie: f.key === 'combattants' ? 'd10' : f.key === 'aventuriers' ? 'd8' : 'd6',
              })}
              className="w-full text-left p-2 rounded border transition-all"
              style={{
                background: character.famille === f.key ? 'rgba(201,168,76,0.15)' : 'transparent',
                borderColor: character.famille === f.key ? 'var(--tdr-gold)' : 'rgba(201,168,76,0.2)',
              }}
            >
              <div className="font-bold text-sm" style={{ color: 'var(--tdr-gold)' }}>{f.label}</div>
              <div className="text-xs opacity-60">{f.bonus}</div>
            </button>
          ))}
        </div>
      </div>

      {(['voie1', 'voie2', 'voie3'] as const).map((v, i) => (
        <div key={v}>
          <label className="block text-xs uppercase tracking-widest mb-1" style={{ color: 'var(--tdr-gold)' }}>
            Voie {i + 1}
          </label>
          <VoieCombobox
            value={character[v].nom}
            onChange={nom => setVoie(v, nom)}
            options={voieOptions}
            alreadyChosen={chosenVoies.filter(n => n !== character[v].nom)}
            placeholder="Rechercher une voie…"
          />
        </div>
      ))}
    </div>
  )
}

function Step4({ character, onChange }: Pick<Props, 'character' | 'onChange'>) {
  const { FOR, DEX, CON, INT, SAG, CHA } = character.caracteristiques
  const famille = character.famille

  const deVie = famille === 'combattants' ? 10 : famille === 'aventuriers' ? 8 : 6
  const pvTotal = deVie + CON.mod
  const pm = (SAG.mod + INT.mod) * 2
  const pc = Math.max(1, CHA.mod)
  const pr = character.peuple.toLowerCase().includes('ogre') ? 6 : 5
  const defense = 10 + DEX.mod
  const initiative = DEX.valeur
  const niv = character.niveau
  const attaqueContact  = niv + FOR.mod + (famille === 'combattants' ? 2 : famille === 'aventuriers' ? 1 : 0)
  const attaqueDistance = niv + DEX.mod + (famille === 'combattants' ? 2 : famille === 'aventuriers' ? 1 : 0)
  const attaqueMagique  = niv + INT.mod + (famille === 'mystiques'   ? 2 : 0)

  React.useEffect(() => {
    onChange({ pvTotal, pvRestants: pvTotal, pm: Math.max(0, pm), pc, pr, prUtilises: Array(pr).fill(true), defense, initiative, attaqueContact, attaqueDistance, attaqueMagique })
  }, [famille, character.peuple, character.niveau, FOR.mod, DEX.mod, CON.mod, INT.mod, SAG.mod, CHA.mod])

  const row = (label: string, value: string | number, formula: string) => (
    <div className="flex items-baseline justify-between py-1 border-b" style={{ borderColor: 'rgba(201,168,76,0.1)' }}>
      <span className="text-sm" style={{ color: 'var(--tdr-gold)' }}>{label}</span>
      <span className="font-bold text-lg">{value}</span>
      <span className="text-xs opacity-40 font-mono">{formula}</span>
    </div>
  )

  return (
    <div className="space-y-1">
      <p className="text-sm opacity-70 italic mb-3">Scores calculés automatiquement d'après vos choix.</p>
      {row('Points de vie', pvTotal, `${deVie} + Mod.CON(${CON.mod})`)}
      {row('Points de récupération', pr, character.peuple.toLowerCase().includes('ogre') ? 'Ogre : 6' : '5 (fixe)')}
      {row('Points de magie', Math.max(0, pm), `(Mod.SAG + Mod.INT) × 2`)}
      {row('Points de chance', pc, `Mod.CHA`)}
      {row('Défense', defense, `10 + Mod.DEX`)}
      {row('Initiative', initiative, `Valeur DEX`)}
      {row('Attaque contact', attaqueContact >= 0 ? `+${attaqueContact}` : attaqueContact, `Niv + Mod.FOR + bonus famille`)}
      {row('Attaque distance', attaqueDistance >= 0 ? `+${attaqueDistance}` : attaqueDistance, `Niv + Mod.DEX + bonus famille`)}
      {row('Attaque magique', attaqueMagique >= 0 ? `+${attaqueMagique}` : attaqueMagique, `Niv + Mod.INT + bonus famille`)}
      {row('Dé de vie', `1${famille === 'combattants' ? 'd10' : famille === 'aventuriers' ? 'd8' : 'd6'}`, `selon famille`)}
    </div>
  )
}

function Step5({ character, onChange }: Pick<Props, 'character' | 'onChange'>) {
  const FORMATIONS = [
    'Armes de paysan (gratuit)', 'Armes de guerre', 'Armes de guerre lourdes',
    'Armes de duel', 'Armes d\'hast', 'Armes de trait', 'Armes de tir',
    'Armes de jet', 'Armures légères', 'Armures lourdes',
  ]
  const toggle = (f: string) => {
    const next = character.formationsMartiales.includes(f)
      ? character.formationsMartiales.filter(x => x !== f)
      : [...character.formationsMartiales, f]
    onChange({ formationsMartiales: next })
  }
  return (
    <div className="space-y-3">
      <p className="text-sm opacity-70 italic">
        Nombre de formations selon la famille :{' '}
        <strong style={{ color: 'var(--tdr-gold)' }}>
          {character.famille === 'combattants' ? 3 : character.famille === 'aventuriers' ? 2 : 1}
        </strong>
        {' '}(+ armes de paysan gratuit)
      </p>
      <div className="space-y-1.5">
        {FORMATIONS.map(f => (
          <label key={f} className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={character.formationsMartiales.includes(f)}
              onChange={() => toggle(f)}
              className="accent-yellow-500"
            />
            <span className="text-sm">{f}</span>
          </label>
        ))}
      </div>
      <div>
        <label className="block text-xs uppercase tracking-widest mb-1" style={{ color: 'var(--tdr-gold)' }}>
          Talent magique (mystiques)
        </label>
        <input
          className="w-full border rounded px-3 py-1.5 text-sm"
          style={INPUT_STYLE}
          value={character.talentMagique}
          onChange={e => onChange({ talentMagique: e.target.value })}
        />
      </div>
    </div>
  )
}

function Step6({ character, onChange }: Pick<Props, 'character' | 'onChange'>) {
  return (
    <div className="space-y-3">
      <p className="text-sm opacity-70 italic">Dernières touches avant de jouer !</p>
      <div>
        <label className="block text-xs uppercase tracking-widest mb-1" style={{ color: 'var(--tdr-gold)' }}>
          Description du personnage
        </label>
        <textarea
          className="w-full border rounded px-3 py-2 text-sm"
          style={{ ...INPUT_STYLE, minHeight: '6rem' }}
          value={character.description}
          onChange={e => onChange({ description: e.target.value })}
        />
      </div>
      <div>
        <label className="block text-xs uppercase tracking-widest mb-1" style={{ color: 'var(--tdr-gold)' }}>
          Inventaire de départ
        </label>
        <textarea
          className="w-full border rounded px-3 py-2 text-sm"
          style={{ ...INPUT_STYLE, minHeight: '4rem' }}
          value={character.inventaire}
          onChange={e => onChange({ inventaire: e.target.value })}
        />
      </div>
      <div>
        <label className="block text-xs uppercase tracking-widest mb-1" style={{ color: 'var(--tdr-gold)' }}>
          Trésorerie
        </label>
        <input
          className="w-full border rounded px-3 py-1.5 text-sm"
          style={INPUT_STYLE}
          value={character.tresorerie}
          onChange={e => onChange({ tresorerie: e.target.value })}
        />
      </div>
    </div>
  )
}

export default function CreationWizard({ step, character, onChange, onNext, onPrev }: Props) {
  const stepComponents = [
    <Step0 character={character} onChange={onChange} />,
    <Step1 character={character} onChange={onChange} />,
    <Step2 character={character} onChange={onChange} />,
    <Step3 character={character} onChange={onChange} />,
    <Step4 character={character} onChange={onChange} />,
    <Step5 character={character} onChange={onChange} />,
    <Step6 character={character} onChange={onChange} />,
  ]

  return (
    <div className="flex flex-col h-full" style={{ fontFamily: "'Crimson Text', Georgia, serif" }}>
      {/* Header */}
      <div className="px-4 pt-4 pb-2 border-b" style={{ borderColor: 'rgba(201,168,76,0.2)' }}>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs uppercase tracking-widest opacity-50">Étape {step + 1}/{STEPS.length}</span>
        </div>
        <StepIndicator current={step} total={STEPS.length} />
        <h2 className="text-xl font-bold" style={{ color: 'var(--tdr-gold)', fontFamily: "'Cinzel', serif" }}>
          {STEPS[step]}
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
          className="flex-1 py-2 rounded border text-sm transition-all disabled:opacity-30"
          style={{ borderColor: 'rgba(201,168,76,0.4)', color: 'var(--tdr-parchment)' }}
        >
          ← Précédent
        </button>
        <button
          onClick={onNext}
          disabled={step === STEPS.length - 1}
          className="flex-1 py-2 rounded text-sm font-bold transition-all disabled:opacity-30"
          style={{ background: 'var(--tdr-gold)', color: 'var(--tdr-dark)' }}
        >
          {step === STEPS.length - 2 ? 'Terminer ✓' : 'Suivant →'}
        </button>
      </div>
    </div>
  )
}
