import { useState, useRef, useEffect, useMemo } from 'react'
import DESCRIPTIONS_RAW from '../data/descriptions.json'
import TRAITS_RAW from '../data/traits-magiques.json'
import PEUPLES_RAW from '../data/peuples.json'
import ARMES_RAW from '../data/armes.json'
import { useGameData } from '../context/GameDataContext'

const ARMES_LIST: string[] = (ARMES_RAW as { groupes: { categories: { entrees: { nom: string }[] }[] }[] })
  .groupes.flatMap(g => g.categories.flatMap(c => c.entrees.map(e => e.nom.replace(/[¹²³⁴⁵⁶⁷*]\s*/g, '').trim())))
  .filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a.localeCompare(b, 'fr'))

const VOIES_INIT = Object.keys(DESCRIPTIONS_RAW as Record<string, unknown[]>).sort((a, b) => a.localeCompare(b, 'fr'))

const STATS = ['PV', 'DEF', 'INIT', 'PR', 'PM', 'PC', 'ATT_CONTACT', 'ATT_DISTANCE', 'ATT_MAGIQUE', 'DM_ARME', 'DM_MAINS_NUES', 'FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA'] as const
const FORMULAS = ['MOD_FOR', 'MOD_DEX', 'MOD_CON', 'MOD_INT', 'MOD_SAG', 'MOD_CHA'] as const

const FORMATIONS = [
  'Armes de duel', 'Armes de guerre', 'Armes de guerre lourdes', 'Armes de jet',
  'Armes de tir', 'Armes de trait', "Armes d'hast", 'Armes de paysan (gratuit)',
  'Armures légères', 'Armures lourdes',
]

type EffectCondition =
  | { type: 'hasBouclier' }
  | { type: 'hasArme'; armes: string[] }
  | { type: 'noArme' }
type Effect = { stat: string; value?: number; formula?: string; diceStr?: string; minRang?: number; avancee?: boolean; condition?: EffectCondition }
type Grant =
  | { type: 'FORMATION'; value: string; minRang?: number; avancee?: boolean }
  | { type: 'VOIE_RANG'; voie: string; rang: number; minRang?: number; avancee?: boolean }
  | { type: 'VOIE_RANG_CHOIX'; voies: string[]; rangMax: number; minRang?: number; avancee?: boolean }
type RangEntry = { nom: string; desc: string; effects?: Effect[]; grants?: Grant[] }
type DescMap = Record<string, RangEntry[]>
type TraitEntry = { nom: string; desc: string }
type Culture = {
  label: string
  voiePeuple: string
  voieCulturelle: string
  modCaracs: Record<string, number>
  trait?: { nom: string; desc: string }
}
type PeupleEntry = { label: string; cultures: Culture[] }

type PendingItem =
  | { id: string; type: 'voie'; nom: string; data: RangEntry[]; expanded: boolean }
  | { id: string; type: 'trait'; data: TraitEntry; expanded: boolean }
  | { id: string; type: 'peuple'; data: PeupleEntry; expanded: boolean }

export default function DescriptionsEditor({ onClose }: { onClose: () => void }) {
  const { data, setData, traits, setTraits, peuples, setPeuples, openDataDir } = useGameData()

  const [section, setSection] = useState<'voies' | 'traits' | 'peuples'>('voies')
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null)
  const askConfirm = (message: string, onConfirm: () => void) => setConfirmDialog({ message, onConfirm })

  // Voies
  const [selected, setSelected] = useState(VOIES_INIT[0])
  const [query, setQuery] = useState('')
  const [exported, setExported] = useState(false)
  const textareaRefs = useRef<(HTMLTextAreaElement | null)[]>([])

  // Traits magiques
  const [selectedTrait, setSelectedTrait] = useState(0)
  const [traitsExported, setTraitsExported] = useState(false)
  const traitDescRef = useRef<HTMLTextAreaElement | null>(null)

  // Peuples
  const [selectedPeuple, setSelectedPeuple] = useState(0)
  const [_selectedCulture, setSelectedCulture] = useState(0)
  const [peuplesExported, setPeuplesExported] = useState(false)

  // Zone en attente (imports individuels)
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([])
  const [previewPendingId, setPreviewPendingId] = useState<string | null>(null)
  const [mergeSelectedRangs, setMergeSelectedRangs] = useState<Set<number>>(new Set())
  const pendingFileRef = useRef<HTMLInputElement>(null)

  const voiesList = useMemo(() =>
    Object.keys(data).sort((a, b) => a.localeCompare(b, 'fr'))
  , [data])

  const allTraits = useMemo(() => {
    const seen = new Map<string, string>()
    for (const p of peuples) {
      for (const c of p.cultures) {
        if (c.trait?.nom) seen.set(c.trait.nom, c.trait.desc ?? '')
      }
    }
    return Array.from(seen.entries()).map(([nom, desc]) => ({ nom, desc })).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
  }, [peuples])


  const filtered = query
    ? voiesList.filter(v => v.toLowerCase().includes(query.toLowerCase()))
    : voiesList

  const getDesc = (voie: string, rang: number) =>
    (data[voie]?.[rang]?.desc) ?? ''

  const getNom = (voie: string, rang: number) =>
    data[voie]?.[rang]?.nom ?? ''

  const emptyRangs = (): RangEntry[] => Array(5).fill(null).map(() => ({ nom: '', desc: '' }))

  const updateRang = (voie: string, rang: number, patch: Partial<{ nom: string; desc: string }>) => {
    setData(prev => {
      const voieData = prev[voie] ? [...prev[voie]] : emptyRangs()
      voieData[rang] = { ...voieData[rang], nom: getNom(voie, rang), desc: getDesc(voie, rang), ...patch }
      return { ...prev, [voie]: voieData }
    })
    setExported(false)
  }

  const getEffects = (voie: string, rang: number): Effect[] =>
    data[voie]?.[rang]?.effects ?? []

  const addEffect = (voie: string, rang: number, avancee?: boolean) => {
    setData(prev => {
      const voieData: RangEntry[] = prev[voie] ? [...prev[voie]] : emptyRangs()
      const entry: RangEntry = voieData[rang] ?? { nom: getNom(voie, rang), desc: '' }
      const newEffect: Effect = avancee ? { stat: 'PV', value: 1, avancee: true } : { stat: 'PV', value: 1 }
      voieData[rang] = { ...entry, effects: [...(entry.effects ?? []), newEffect] }
      return { ...prev, [voie]: voieData }
    })
    setExported(false)
  }

  const removeEffect = (voie: string, rang: number, effIdx: number) => {
    setData(prev => {
      const voieData = [...prev[voie]]
      const entry = voieData[rang]
      voieData[rang] = { ...entry, effects: (entry.effects ?? []).filter((_, i) => i !== effIdx) }
      return { ...prev, [voie]: voieData }
    })
    setExported(false)
  }

  const updateEffect = (voie: string, rang: number, effIdx: number, patch: { stat?: string; value?: number | null; formula?: string | null; minRang?: number | null; avancee?: boolean; condition?: EffectCondition | null }) => {
    setData(prev => {
      const voieData = [...prev[voie]]
      const entry = voieData[rang]
      const effects = [...(entry.effects ?? [])]
      let merged = { ...effects[effIdx], ...patch }
      if (patch.minRang === null)   { const { minRang: _, ...r } = merged; merged = r }
      if (patch.value === null)     { const { value: _, ...r } = merged; merged = r }
      if (patch.formula === null)   { const { formula: _, ...r } = merged; merged = r }
      if (patch.condition === null) { const { condition: _, ...r } = merged; merged = r }
      effects[effIdx] = merged as Effect
      voieData[rang] = { ...entry, effects }
      return { ...prev, [voie]: voieData }
    })
    setExported(false)
  }

  const getGrants = (voie: string, rang: number): Grant[] =>
    data[voie]?.[rang]?.grants ?? []

  const addGrant = (voie: string, rang: number, avancee?: boolean) => {
    setData(prev => {
      const voieData: RangEntry[] = prev[voie] ? [...prev[voie]] : emptyRangs()
      const entry: RangEntry = voieData[rang] ?? { nom: getNom(voie, rang), desc: '' }
      const newGrant: Grant = avancee
        ? { type: 'FORMATION', value: FORMATIONS[0], avancee: true }
        : { type: 'FORMATION', value: FORMATIONS[0] }

      voieData[rang] = { ...entry, grants: [...(entry.grants ?? []), newGrant] }
      return { ...prev, [voie]: voieData }
    })
    setExported(false)
  }

  const removeGrant = (voie: string, rang: number, gIdx: number) => {
    setData(prev => {
      const voieData = [...prev[voie]]
      const entry = voieData[rang]
      voieData[rang] = { ...entry, grants: (entry.grants ?? []).filter((_, i) => i !== gIdx) }
      return { ...prev, [voie]: voieData }
    })
    setExported(false)
  }

  const updateGrant = (voie: string, rang: number, gIdx: number, patch: { type?: Grant['type']; value?: string; voie?: string; rang?: number; voies?: string[]; rangMax?: number; minRang?: number | null; avancee?: boolean | null }) => {
    setData(prev => {
      const voieData = [...prev[voie]]
      const entry = voieData[rang]
      const grants = [...(entry.grants ?? [])]
      const current = grants[gIdx]
      if (patch.avancee === null && patch.minRang === null) {
        const { avancee: _a, minRang: _m, ...rest } = { ...current, ...patch } as Grant & { avancee?: boolean; minRang?: number }
        grants[gIdx] = rest as Grant
      } else if (patch.avancee === null) {
        const { avancee: _drop, ...rest } = { ...current, ...patch } as Grant & { avancee?: boolean }
        grants[gIdx] = rest as Grant
      } else if (patch.minRang === null) {
        const { minRang: _drop, ...rest } = { ...current, ...patch } as Grant & { minRang?: number }
        grants[gIdx] = rest as Grant
      } else if ('type' in patch && patch.type !== current.type) {
        const av = current.avancee ? { avancee: true as const } : {}
        grants[gIdx] = patch.type === 'FORMATION'
          ? { type: 'FORMATION', value: FORMATIONS[0], ...av }
          : patch.type === 'VOIE_RANG'
            ? { type: 'VOIE_RANG', voie: VOIES_INIT[0], rang: 1, ...av }
            : { type: 'VOIE_RANG_CHOIX', voies: [], rangMax: 2, ...av }
      } else {
        grants[gIdx] = { ...current, ...patch } as Grant
      }
      voieData[rang] = { ...entry, grants }
      return { ...prev, [voie]: voieData }
    })
    setExported(false)
  }

  const wrap = (rang: number, before: string, after: string) => {
    const ta = textareaRefs.current[rang]
    if (!ta) return
    const s = ta.selectionStart, e = ta.selectionEnd
    const current = getDesc(selected, rang)
    const newVal = current.slice(0, s) + before + current.slice(s, e) + after + current.slice(e)
    updateRang(selected, rang, { desc: newVal })
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(s + before.length, e + before.length)
    })
  }

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'descriptions.json'
    a.click()
    URL.revokeObjectURL(url)
    setExported(true)
  }

  const updateTrait = (idx: number, patch: Partial<TraitEntry>) => {
    setTraits(prev => prev.map((t, i) => i === idx ? { ...t, ...patch } : t))
    setTraitsExported(false)
  }

  const addTrait = () => {
    setTraits(prev => [...prev, { nom: 'Nouveau trait', desc: '' }])
    setSelectedTrait(traits.length)
    setTraitsExported(false)
  }

  const removeTrait = (idx: number) => {
    setTraits(prev => prev.filter((_, i) => i !== idx))
    setSelectedTrait(i => Math.min(i, traits.length - 2))
    setTraitsExported(false)
  }

  const exportTraits = () => {
    const blob = new Blob([JSON.stringify(traits, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'traits-magiques.json'
    a.click()
    URL.revokeObjectURL(url)
    setTraitsExported(true)
  }

  const wrapTrait = (before: string, after: string) => {
    const ta = traitDescRef.current
    if (!ta) return
    const s = ta.selectionStart, e = ta.selectionEnd
    const current = traits[selectedTrait]?.desc ?? ''
    const newVal = current.slice(0, s) + before + current.slice(s, e) + after + current.slice(e)
    updateTrait(selectedTrait, { desc: newVal })
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(s + before.length, e + before.length)
    })
  }

  // Fonctions voies
  const addVoie = () => {
    let nom = 'Nouvelle voie'
    let n = 1
    while (data[nom]) { nom = `Nouvelle voie ${++n}` }
    setData(prev => ({ ...prev, [nom]: emptyRangs() }))
    setSelected(nom)
    setExported(false)
  }

  const removeVoie = (nom: string) => {
    setData(prev => { const { [nom]: _, ...rest } = prev; return rest })
    setSelected(voiesList.find(v => v !== nom) ?? '')
    setExported(false)
  }

  const renameVoie = (oldNom: string, newNom: string) => {
    if (!newNom.trim() || newNom === oldNom || data[newNom]) return
    setData(prev => {
      const { [oldNom]: voieData, ...rest } = prev
      return { ...rest, [newNom]: voieData ?? emptyRangs() }
    })
    setSelected(newNom)
    setExported(false)
  }

  // Fonctions peuples
  const addPeuple = () => {
    setPeuples(prev => [...prev, { label: 'Nouveau peuple', cultures: [] }])
    setSelectedPeuple(peuples.length)
    setSelectedCulture(0)
    setPeuplesExported(false)
  }

  const removePeuple = (idx: number) => {
    setPeuples(prev => prev.filter((_, i) => i !== idx))
    setSelectedPeuple(i => Math.min(i, peuples.length - 2))
    setPeuplesExported(false)
  }

  const updatePeuple = (idx: number, patch: Partial<PeupleEntry>) => {
    setPeuples(prev => prev.map((p, i) => i === idx ? { ...p, ...patch } : p))
    setPeuplesExported(false)
  }

  const addCulture = (pIdx: number) => {
    setPeuples(prev => prev.map((p, i) => i === pIdx
      ? { ...p, cultures: [...p.cultures, { label: 'Nouvelle culture', voiePeuple: '', voieCulturelle: '', modCaracs: {} }] }
      : p
    ))
    setSelectedCulture(peuples[pIdx]?.cultures.length ?? 0)
    setPeuplesExported(false)
  }

  const removeCulture = (pIdx: number, cIdx: number) => {
    setPeuples(prev => prev.map((p, i) => i === pIdx
      ? { ...p, cultures: p.cultures.filter((_, j) => j !== cIdx) }
      : p
    ))
    setSelectedCulture(c => Math.min(c, (peuples[pIdx]?.cultures.length ?? 1) - 2))
    setPeuplesExported(false)
  }

  const updateCulture = (pIdx: number, cIdx: number, patch: Partial<Culture>) => {
    setPeuples(prev => prev.map((p, i) => i === pIdx
      ? { ...p, cultures: p.cultures.map((c, j) => j === cIdx ? { ...c, ...patch } : c) }
      : p
    ))
    setPeuplesExported(false)
  }

  const exportPeuples = () => {
    const blob = new Blob([JSON.stringify(peuples, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'peuples.json'; a.click()
    URL.revokeObjectURL(url)
    setPeuplesExported(true)
  }

  const exportSingleItem = (payload: unknown, filename: string) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  const safeName = (s: string) => s.replace(/[^a-zA-Z0-9À-ÿ _-]/g, '').trim().replace(/\s+/g, '-')

  const openPreview = (id: string) => {
    const item = pendingItems.find(p => p.id === id)
    if (item?.type === 'voie' && data[item.nom]) {
      const existing = data[item.nom]
      const diffs = new Set(
        item.data
          .map((r, i) => (r.nom !== existing[i]?.nom || r.desc !== existing[i]?.desc) ? i : -1)
          .filter(i => i >= 0)
      )
      setMergeSelectedRangs(diffs)
    } else if (item?.type === 'peuple') {
      const existing = peuples.find(p => p.label === item.data.label)
      if (existing) {
        const diffs = new Set(
          item.data.cultures.map((c, i) => {
            const ex = existing.cultures[i]
            return (!ex || JSON.stringify(c) !== JSON.stringify(ex)) ? i : -1
          }).filter(i => i >= 0)
        )
        setMergeSelectedRangs(diffs)
      } else {
        setMergeSelectedRangs(new Set())
      }
    } else {
      setMergeSelectedRangs(new Set())
    }
    setPreviewPendingId(id)
  }

  const importPending = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const raw = JSON.parse(ev.target?.result as string)
        if (raw.type === 'voie' && raw.nom && Array.isArray(raw.data)) {
          setPendingItems(prev => [...prev, { id: crypto.randomUUID(), type: 'voie', nom: raw.nom, data: raw.data, expanded: false }])
        } else if (raw.type === 'trait' && raw.data?.nom !== undefined) {
          setPendingItems(prev => [...prev, { id: crypto.randomUUID(), type: 'trait', data: raw.data, expanded: false }])
        } else if (raw.type === 'peuple' && raw.data?.label !== undefined) {
          setPendingItems(prev => [...prev, { id: crypto.randomUUID(), type: 'peuple', data: raw.data, expanded: false }])
        } else {
          alert('Format non reconnu. Utilisez les fichiers exportés depuis cet éditeur.')
        }
      } catch {
        alert('Fichier invalide.')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const CARACS = ['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA']

  const S = {
    gold: 'var(--tdr-gold)',
    parchment: 'var(--tdr-parchment)',
    border: 'rgba(201,168,76,0.25)',
    bg: 'rgba(15,12,8,0.92)',
  }

  return (
    <>
    <input ref={pendingFileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={importPending} />

    {/* Modal de prévisualisation / comparaison d'un élément en attente */}
    {previewPendingId && (() => {
      const item = pendingItems.find(p => p.id === previewPendingId)
      if (!item) return null
      const isDoublon = item.type === 'voie' ? !!data[item.nom]
        : item.type === 'trait' ? traits.some(t => t.nom === item.data.nom)
        : peuples.some(p => p.label === item.data.label)
      const nomAffiche = item.type === 'voie' ? item.nom : item.type === 'trait' ? item.data.nom : item.data.label

      const incorporer = () => {
        if (item.type === 'voie') {
          setData(prev => ({ ...prev, [item.nom]: item.data })); setSelected(item.nom); setExported(false)
        } else if (item.type === 'trait') {
          if (isDoublon) setTraits(prev => prev.map(t => t.nom === item.data.nom ? item.data : t))
          else { setTraits(prev => [...prev, item.data]); setSelectedTrait(traits.length) }
          setTraitsExported(false)
        } else {
          if (isDoublon) setPeuples(prev => prev.map(p => p.label === item.data.label ? item.data : p))
          else { setPeuples(prev => [...prev, item.data]); setSelectedPeuple(peuples.length) }
          setPeuplesExported(false)
        }
        setPendingItems(prev => prev.filter(p => p.id !== item.id))
        setPreviewPendingId(null)
      }

      const garderDeux = () => {
        if (item.type === 'voie') {
          let n = `${item.nom} (2)`; let i = 3; while (data[n]) n = `${item.nom} (${i++})`
          setData(prev => ({ ...prev, [n]: item.data })); setSelected(n); setExported(false)
        } else if (item.type === 'trait') {
          let n = `${item.data.nom} (2)`; let i = 3; while (traits.some(t => t.nom === n)) n = `${item.data.nom} (${i++})`
          setTraits(prev => [...prev, { ...item.data, nom: n }]); setSelectedTrait(traits.length); setTraitsExported(false)
        } else {
          let n = `${item.data.label} (2)`; let i = 3; while (peuples.some(p => p.label === n)) n = `${item.data.label} (${i++})`
          setPeuples(prev => [...prev, { ...item.data, label: n }]); setSelectedPeuple(peuples.length); setPeuplesExported(false)
        }
        setPendingItems(prev => prev.filter(p => p.id !== item.id))
        setPreviewPendingId(null)
      }

      const ignorer = () => { setPendingItems(prev => prev.filter(p => p.id !== item.id)); setPreviewPendingId(null) }

      const renderCultureCard = (c: Culture) => {
        const modStr = Object.entries(c.modCaracs ?? {})
          .filter(([, v]) => v !== 0)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`)
          .join('  ')
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {c.voiePeuple && (
              <div style={{ display: 'flex', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'rgba(245,236,215,0.4)', minWidth: 110, flexShrink: 0 }}>Voie du peuple</span>
                <span style={{ fontSize: 13, color: 'rgba(245,236,215,0.75)' }}>{c.voiePeuple}</span>
              </div>
            )}
            {c.voieCulturelle && (
              <div style={{ display: 'flex', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'rgba(245,236,215,0.4)', minWidth: 110, flexShrink: 0 }}>Voie culturelle</span>
                <span style={{ fontSize: 13, color: 'rgba(245,236,215,0.75)' }}>{c.voieCulturelle}</span>
              </div>
            )}
            {c.trait?.nom && (
              <div style={{ display: 'flex', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'rgba(245,236,215,0.4)', minWidth: 110, flexShrink: 0 }}>Trait racial</span>
                <span style={{ fontSize: 13, color: 'rgba(245,236,215,0.75)' }}>{c.trait.nom}</span>
              </div>
            )}
            {modStr && (
              <div style={{ display: 'flex', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'rgba(245,236,215,0.4)', minWidth: 110, flexShrink: 0 }}>Caractéristiques</span>
                <span style={{ fontSize: 13, color: 'var(--tdr-gold)', fontWeight: 600 }}>{modStr}</span>
              </div>
            )}
            {!c.voiePeuple && !c.voieCulturelle && !c.trait?.nom && !modStr && (
              <span style={{ fontSize: 12, color: 'rgba(245,236,215,0.3)' }}>—</span>
            )}
          </div>
        )
      }

      const renderCulturesPreview = (p: PeupleEntry) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {p.cultures.map((c, ci) => (
            <div key={ci} style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid rgba(201,168,76,0.2)`, borderRadius: 4, padding: '8px 10px' }}>
              <div style={{ fontSize: 14, color: S.gold, fontWeight: 600, marginBottom: 6 }}>{c.label}</div>
              {renderCultureCard(c)}
            </div>
          ))}
          {p.cultures.length === 0 && <div style={{ fontSize: 13, color: 'rgba(245,236,215,0.3)' }}>Aucune culture</div>}
        </div>
      )

      return (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 700,
          background: 'rgba(0,0,0,0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setPreviewPendingId(null)}>
          <div style={{
            background: 'rgba(18,14,9,0.99)', border: `1px solid ${S.border}`,
            borderRadius: 8, maxWidth: isDoublon ? 900 : 620, maxHeight: '90vh',
            width: '92vw', display: 'flex', flexDirection: 'column',
            boxShadow: '0 8px 40px rgba(0,0,0,0.9)', overflow: 'hidden',
          }} onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div style={{ padding: '16px 22px', borderBottom: `1px solid ${S.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: "'Cinzel', serif", fontSize: 17, color: S.gold, fontWeight: 700 }}>{nomAffiche}</span>
                {isDoublon && <span style={{ fontSize: 12, background: 'rgba(230,140,40,0.2)', color: 'rgba(230,160,60,0.9)', border: '1px solid rgba(230,140,40,0.4)', borderRadius: 3, padding: '2px 7px' }}>DOUBLON</span>}
              </div>
              <button onClick={() => setPreviewPendingId(null)} style={{ background: 'none', border: 'none', color: S.parchment, opacity: 0.5, cursor: 'pointer', fontSize: 22, lineHeight: 1 }}>✕</button>
            </div>

            {/* Corps comparaison */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'grid', gridTemplateColumns: isDoublon ? '1fr 1fr' : '1fr', gap: 20 }}>
              {/* Colonne "Actuelle" si doublon */}
              {isDoublon && (
                <div>
                  <div style={{ fontSize: 13, color: S.gold, opacity: 0.7, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10, fontWeight: 600 }}>Actuelle</div>
                  {item.type === 'voie' && data[item.nom]?.map((r, i) => (
                    <div key={i} style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 14, color: S.gold, fontWeight: 600 }}>Rang {i+1}{r.nom ? ` — ${r.nom}` : ''}</div>
                      <div style={{ fontSize: 13, color: 'rgba(245,236,215,0.65)', whiteSpace: 'pre-wrap', marginTop: 3, lineHeight: 1.6 }}>{r.desc || '—'}</div>
                    </div>
                  ))}
                  {item.type === 'trait' && <div style={{ fontSize: 14, color: S.parchment, whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{traits.find(t => t.nom === item.data.nom)?.desc || '—'}</div>}
                  {item.type === 'peuple' && renderCulturesPreview(peuples.find(p => p.label === item.data.label) ?? { label: '', cultures: [] })}
                </div>
              )}

              {/* Colonne "Importée" */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ fontSize: 13, color: isDoublon ? 'rgba(100,210,130,0.9)' : S.gold, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>
                    {isDoublon ? 'Importée' : 'Contenu'}
                  </div>
                  {isDoublon && (item.type === 'voie' || item.type === 'peuple') && (() => {
                    const total = item.type === 'voie' ? item.data.length : item.data.cultures.length
                    return (
                      <button
                        onClick={() => setMergeSelectedRangs(mergeSelectedRangs.size === total ? new Set() : new Set(Array.from({ length: total }, (_, i) => i)))}
                        style={{ fontSize: 11, background: 'none', border: `1px solid rgba(100,210,130,0.35)`, borderRadius: 3, color: 'rgba(100,210,130,0.75)', cursor: 'pointer', padding: '2px 8px' }}
                      >
                        {mergeSelectedRangs.size === total ? 'Tout désélectionner' : 'Tout sélectionner'}
                      </button>
                    )
                  })()}
                </div>
                {item.type === 'voie' && item.data.map((r, i) => {
                  const isSelected = mergeSelectedRangs.has(i)
                  const existingRang = isDoublon ? data[item.nom]?.[i] : null
                  const isDiff = existingRang && (r.nom !== existingRang.nom || r.desc !== existingRang.desc)
                  return (
                    <div key={i} style={{
                      marginBottom: 10, borderRadius: 5, padding: '8px 10px',
                      border: isSelected ? '1px solid rgba(100,210,130,0.5)' : '1px solid rgba(255,255,255,0.06)',
                      background: isSelected ? 'rgba(100,210,130,0.06)' : 'transparent',
                      transition: 'all 0.15s',
                    }}>
                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: isDoublon ? 'pointer' : 'default' }}>
                        {isDoublon && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              const next = new Set(mergeSelectedRangs)
                              if (isSelected) next.delete(i); else next.add(i)
                              setMergeSelectedRangs(next)
                            }}
                            style={{ marginTop: 3, accentColor: 'rgba(100,210,130,0.9)', cursor: 'pointer', flexShrink: 0 }}
                          />
                        )}
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, color: S.gold, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                            Rang {i+1}{r.nom ? ` — ${r.nom}` : ''}
                            {isDiff && <span style={{ fontSize: 10, background: 'rgba(100,210,130,0.15)', color: 'rgba(100,210,130,0.8)', border: '1px solid rgba(100,210,130,0.3)', borderRadius: 3, padding: '1px 5px', letterSpacing: '0.04em' }}>modifié</span>}
                          </div>
                          <div style={{ fontSize: 13, color: 'rgba(245,236,215,0.65)', whiteSpace: 'pre-wrap', marginTop: 3, lineHeight: 1.6 }}>{r.desc || '—'}</div>
                        </div>
                      </label>
                    </div>
                  )
                })}
                {item.type === 'trait' && <div style={{ fontSize: 14, color: S.parchment, whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{item.data.desc || '—'}</div>}
                {item.type === 'peuple' && (() => {
                  const existingPeuple = isDoublon ? peuples.find(p => p.label === item.data.label) : null
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {item.data.cultures.map((c, ci) => {
                        const isSelected = mergeSelectedRangs.has(ci)
                        const exC = existingPeuple?.cultures[ci]
                        const isDiff = !exC || JSON.stringify(c) !== JSON.stringify(exC)
                        return (
                          <div key={ci} style={{
                            borderRadius: 5, padding: '7px 10px',
                            border: isSelected ? '1px solid rgba(100,210,130,0.5)' : '1px solid rgba(255,255,255,0.06)',
                            background: isSelected ? 'rgba(100,210,130,0.06)' : 'transparent',
                            transition: 'all 0.15s',
                          }}>
                            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: isDoublon ? 'pointer' : 'default' }}>
                              {isDoublon && (
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {
                                    const next = new Set(mergeSelectedRangs)
                                    if (isSelected) next.delete(ci); else next.add(ci)
                                    setMergeSelectedRangs(next)
                                  }}
                                  style={{ marginTop: 3, accentColor: 'rgba(100,210,130,0.9)', cursor: 'pointer', flexShrink: 0 }}
                                />
                              )}
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 14, color: S.gold, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                                  {c.label}
                                  {isDiff && <span style={{ fontSize: 10, background: 'rgba(100,210,130,0.15)', color: 'rgba(100,210,130,0.8)', border: '1px solid rgba(100,210,130,0.3)', borderRadius: 3, padding: '1px 5px' }}>{exC ? 'modifiée' : 'nouvelle'}</span>}
                                </div>
                                <div style={{ marginTop: 4 }}>
                                  {renderCultureCard(c)}
                                </div>
                              </div>
                            </label>
                          </div>
                        )
                      })}
                      {item.data.cultures.length === 0 && <div style={{ fontSize: 13, color: 'rgba(245,236,215,0.3)' }}>Aucune culture</div>}
                    </div>
                  )
                })()}
              </div>
            </div>

            {/* Pied — actions */}
            <div style={{ padding: '14px 22px', borderTop: `1px solid ${S.border}`, display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0, flexWrap: 'wrap' }}>
              {isDoublon && (
                <button onClick={garderDeux} style={{ padding: '7px 18px', borderRadius: 4, fontSize: 14, cursor: 'pointer', border: `1px solid rgba(201,168,76,0.3)`, background: 'transparent', color: S.parchment }}>
                  Garder les deux
                </button>
              )}
              {isDoublon && (item.type === 'voie' || item.type === 'peuple') && (() => {
                const count = mergeSelectedRangs.size
                const label = item.type === 'voie'
                  ? `rang${count > 1 ? 's' : ''}`
                  : `culture${count > 1 ? 's' : ''}`
                return (
                  <button
                    onClick={() => {
                      if (count === 0) return
                      if (item.type === 'voie') {
                        const base = [...(data[item.nom] ?? item.data.map(() => ({ nom: '', desc: '' })))]
                        mergeSelectedRangs.forEach(i => { base[i] = item.data[i] })
                        setData(prev => ({ ...prev, [item.nom]: base }))
                        setSelected(item.nom); setExported(false)
                      } else {
                        const existing = peuples.find(p => p.label === item.data.label)
                        if (!existing) return
                        const base = [...existing.cultures]
                        mergeSelectedRangs.forEach(i => { base[i] = item.data.cultures[i] })
                        setPeuples(prev => prev.map(p => p.label === item.data.label ? { ...p, cultures: base } : p))
                        setSelectedPeuple(peuples.findIndex(p => p.label === item.data.label))
                        setPeuplesExported(false)
                      }
                      setPendingItems(prev => prev.filter(p => p.id !== item.id))
                      setPreviewPendingId(null)
                    }}
                    disabled={count === 0}
                    style={{
                      padding: '7px 18px', borderRadius: 4, fontSize: 14, cursor: count === 0 ? 'not-allowed' : 'pointer',
                      border: `1px solid rgba(100,210,130,0.5)`, background: 'rgba(100,210,130,0.1)',
                      color: count === 0 ? 'rgba(100,210,130,0.3)' : 'rgba(100,210,130,0.9)', fontWeight: 600,
                    }}
                  >
                    Fusionner{count > 0 ? ` (${count} ${label})` : ''}
                  </button>
                )
              })()}
              <button onClick={incorporer} style={{ padding: '7px 18px', borderRadius: 4, fontSize: 14, cursor: 'pointer', border: `1px solid rgba(201,168,76,0.5)`, background: 'rgba(201,168,76,0.15)', color: S.gold, fontWeight: 600 }}>
                {isDoublon ? 'Tout remplacer' : 'Incorporer'}
              </button>
              <button onClick={ignorer} style={{ padding: '7px 18px', borderRadius: 4, fontSize: 14, cursor: 'pointer', border: '1px solid rgba(220,80,80,0.3)', background: 'transparent', color: '#e05555' }}>
                Ignorer
              </button>
            </div>
          </div>
        </div>
      )
    })()}

    {confirmDialog && (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          background: 'rgba(22,17,11,0.99)', border: '1px solid rgba(201,168,76,0.5)',
          borderRadius: 8, padding: '24px 28px', maxWidth: 420, width: '90vw',
          boxShadow: '0 8px 40px rgba(0,0,0,0.9)',
          display: 'flex', flexDirection: 'column', gap: 20,
        }}>
          <div style={{ fontSize: 15, color: '#f5ecd7', lineHeight: 1.5 }}>{confirmDialog.message}</div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              onClick={() => setConfirmDialog(null)}
              style={{
                padding: '6px 18px', borderRadius: 5, cursor: 'pointer', fontSize: 14,
                border: '1px solid rgba(245,236,215,0.2)', background: 'transparent',
                color: 'rgba(245,236,215,0.55)', fontFamily: 'inherit',
              }}
            >Annuler</button>
            <button
              onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(null) }}
              style={{
                padding: '6px 18px', borderRadius: 5, cursor: 'pointer', fontSize: 14, fontWeight: 600,
                border: '1px solid rgba(200,80,80,0.6)', background: 'rgba(200,80,80,0.15)',
                color: 'rgba(240,120,120,0.95)', fontFamily: 'inherit',
              }}
            >Supprimer</button>
          </div>
        </div>
      </div>
    )}
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'stretch', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: 'rgba(18,14,9,0.99)',
        border: `1px solid ${S.border}`,
        borderRadius: 8,
        margin: '24px auto',
        width: '90vw', maxWidth: 1200,
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 40px rgba(0,0,0,0.9)',
        overflow: 'hidden',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px',
          borderBottom: `1px solid ${S.border}`,
          flexShrink: 0, gap: 12,
        }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['voies', 'traits', 'peuples'] as const).map(s => (
              <button key={s} onClick={() => setSection(s)} style={{
                padding: '4px 14px', borderRadius: 4, fontSize: 17, cursor: 'pointer',
                border: `1px solid ${S.gold}`,
                background: section === s ? 'rgba(201,168,76,0.2)' : 'transparent',
                color: S.gold, fontWeight: section === s ? 700 : 400,
              }}>
                {s === 'voies' ? 'Voies' : s === 'traits' ? 'Traits magiques' : 'Peuples'}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {!import.meta.env.DEV && section === 'voies' && <>
              <button onClick={exportJson} style={{
                padding: '5px 14px', borderRadius: 4, fontSize: 15, cursor: 'pointer',
                border: `1px solid ${S.gold}`,
                background: exported ? 'rgba(201,168,76,0.2)' : 'rgba(201,168,76,0.1)',
                color: S.gold, fontWeight: 600,
              }}>
                {exported ? '✓ Exporté' : '↓ descriptions.json'}
              </button>
            </>}
            {!import.meta.env.DEV && section === 'traits' && (
              <button onClick={exportTraits} style={{
                padding: '5px 14px', borderRadius: 4, fontSize: 15, cursor: 'pointer',
                border: `1px solid ${S.gold}`,
                background: traitsExported ? 'rgba(201,168,76,0.2)' : 'rgba(201,168,76,0.1)',
                color: S.gold, fontWeight: 600,
              }}>
                {traitsExported ? '✓ Exporté' : '↓ traits-magiques.json'}
              </button>
            )}
            {!import.meta.env.DEV && section === 'peuples' && (
              <button onClick={exportPeuples} style={{
                padding: '5px 14px', borderRadius: 4, fontSize: 15, cursor: 'pointer',
                border: `1px solid ${S.gold}`,
                background: peuplesExported ? 'rgba(201,168,76,0.2)' : 'rgba(201,168,76,0.1)',
                color: S.gold, fontWeight: 600,
              }}>
                {peuplesExported ? '✓ Exporté' : '↓ peuples.json'}
              </button>
            )}
            <button onClick={openDataDir} title="Ouvrir le dossier Documents/TdR/" style={{
              padding: '5px 10px', borderRadius: 4, fontSize: 14, cursor: 'pointer',
              border: `1px solid ${S.border}`, background: 'transparent',
              color: 'rgba(245,236,215,0.55)',
            }}>📁 Données</button>
            <button onClick={onClose} style={{
              background: 'none', border: 'none', color: S.parchment,
              opacity: 0.5, cursor: 'pointer', fontSize: 20, lineHeight: 1,
            }}>✕</button>
          </div>
        </div>

        {/* Corps */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {section === 'voies' ? (<>
            {/* Colonne voies */}
            <div style={{
              width: 'max-content', minWidth: 380, flexShrink: 0,
              borderRight: `1px solid ${S.border}`,
              display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ padding: '10px 12px', borderBottom: `1px solid ${S.border}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input
                  type="text"
                  placeholder="Rechercher…"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  style={{
                    width: '100%', background: S.bg, border: `1px solid ${S.border}`,
                    borderRadius: 4, padding: '5px 8px', fontSize: 17,
                    color: S.parchment, outline: 'none', boxSizing: 'border-box',
                  }}
                />
                <button onClick={addVoie} style={{
                  width: '100%', padding: '5px 8px', borderRadius: 4, fontSize: 14, cursor: 'pointer',
                  border: `1px solid ${S.border}`, background: 'rgba(201,168,76,0.07)',
                  color: S.gold, boxSizing: 'border-box',
                }}>+ Nouvelle voie</button>
                <button onClick={() => pendingFileRef.current?.click()} style={{
                  width: '100%', padding: '5px 8px', borderRadius: 4, fontSize: 14, cursor: 'pointer',
                  border: `1px solid ${S.border}`, background: 'transparent',
                  color: 'rgba(201,168,76,0.6)', boxSizing: 'border-box',
                }}>↑ Importer une voie</button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {filtered.map(voie => (
                  <div key={voie} onClick={() => setSelected(voie)} className="voie-list-item" style={{
                    padding: '7px 12px', fontSize: 17, cursor: 'pointer',
                    color: selected === voie ? S.gold : S.parchment,
                    background: selected === voie ? 'rgba(201,168,76,0.1)' : 'transparent',
                    borderLeft: selected === voie ? `3px solid ${S.gold}` : '3px solid transparent',
                    transition: 'all 0.1s', whiteSpace: 'nowrap',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
                  }}>
                    <span style={{ flex: 1 }}>{voie}</span>
                    <button
                      className="voie-delete-btn"
                      onClick={e => { e.stopPropagation(); exportSingleItem({ type: 'voie', nom: voie, data: data[voie] }, `voie-${safeName(voie)}.json`) }}
                      style={{
                        background: 'none', border: 'none', color: 'rgba(201,168,76,0.9)', cursor: 'pointer',
                        fontSize: 15, fontWeight: 700, padding: '0 3px', lineHeight: 1, opacity: 0, transition: 'opacity 0.15s',
                      }}
                      title="Exporter cette voie"
                    >↓</button>
                    <button
                      className="voie-delete-btn"
                      onClick={e => { e.stopPropagation(); askConfirm(`Supprimer la voie "${voie}" ?`, () => removeVoie(voie)) }}
                      style={{
                        background: 'none', border: 'none', color: '#c05050', cursor: 'pointer',
                        fontSize: 14, padding: '0 2px', lineHeight: 1, opacity: 0, transition: 'opacity 0.15s',
                      }}
                      title="Supprimer cette voie"
                    >✕</button>
                  </div>
                ))}
              </div>
              {/* Zone en attente — voies */}
              {pendingItems.some(p => p.type === 'voie') && (
                <div style={{ borderTop: `2px solid rgba(201,168,76,0.4)`, flexShrink: 0 }}>
                  <div style={{ padding: '6px 14px', fontSize: 12, color: S.gold, opacity: 0.8, letterSpacing: '0.1em', textTransform: 'uppercase', background: 'rgba(201,168,76,0.07)', fontWeight: 600 }}>
                    En attente ({pendingItems.filter(p => p.type === 'voie').length})
                  </div>
                  <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                    {pendingItems.filter(p => p.type === 'voie').map(item => {
                      if (item.type !== 'voie') return null
                      const isDoublon = !!data[item.nom]
                      return (
                        <div key={item.id} style={{ padding: '8px 12px', borderBottom: `1px solid rgba(201,168,76,0.1)` }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                            {isDoublon && <span style={{ fontSize: 11, background: 'rgba(230,140,40,0.2)', color: 'rgba(230,160,60,0.9)', border: '1px solid rgba(230,140,40,0.4)', borderRadius: 3, padding: '1px 5px', letterSpacing: '0.04em', flexShrink: 0 }}>doublon</span>}
                            <span style={{ fontSize: 14, color: S.parchment, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.nom}</span>
                            <button onClick={() => openPreview(item.id)} style={{ background: 'none', border: 'none', color: S.gold, cursor: 'pointer', fontSize: 15, padding: '0 3px', opacity: 0.8, flexShrink: 0 }} title="Aperçu et comparaison">🔍</button>
                          </div>
                          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                            <button onClick={() => { setData(prev => ({ ...prev, [item.nom]: item.data })); setPendingItems(prev => prev.filter(p => p.id !== item.id)); setSelected(item.nom); setExported(false) }}
                              style={{ padding: '3px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer', border: `1px solid rgba(201,168,76,0.4)`, background: 'rgba(201,168,76,0.12)', color: S.gold }}>
                              {isDoublon ? 'Remplacer' : 'Incorporer'}
                            </button>
                            {isDoublon && <button onClick={() => { let n = `${item.nom} (2)`; let i = 3; while (data[n]) n = `${item.nom} (${i++})`; setData(prev => ({ ...prev, [n]: item.data })); setPendingItems(prev => prev.filter(p => p.id !== item.id)); setSelected(n); setExported(false) }}
                              style={{ padding: '3px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer', border: `1px solid rgba(201,168,76,0.25)`, background: 'transparent', color: 'rgba(245,236,215,0.65)' }}>
                              +copie
                            </button>}
                            <button onClick={() => setPendingItems(prev => prev.filter(p => p.id !== item.id))}
                              style={{ padding: '3px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer', border: '1px solid rgba(220,80,80,0.3)', background: 'transparent', color: '#e05555' }}>
                              Ignorer
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Éditeur rangs */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <input
                type="text"
                value={selected}
                onChange={e => renameVoie(selected, e.target.value)}
                style={{
                  fontSize: 17, fontFamily: "'Cinzel', serif", color: S.gold,
                  background: S.bg, border: `1px solid ${S.border}`, borderRadius: 4,
                  padding: '4px 10px', outline: 'none', width: '100%', boxSizing: 'border-box',
                }}
                onFocus={e => (e.target.style.borderColor = 'rgba(201,168,76,0.6)')}
                onBlur={e => (e.target.style.borderColor = S.border)}
              />
              {[0,1,2,3,4].map(i => (
                <div key={i} style={{ borderTop: i === 0 ? 'none' : '1px dashed rgba(201,168,76,0.35)', paddingTop: i === 0 ? 0 : 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 14, color: S.gold, opacity: 0.7, letterSpacing: '0.08em', flexShrink: 0 }}>
                      Rang {i + 1} —
                    </span>
                    <input
                      type="text"
                      value={data[selected]?.[i]?.nom ?? ''}
                      onChange={e => updateRang(selected, i, { nom: e.target.value })}
                      style={{
                        flex: 1, background: S.bg, border: `1px solid ${S.border}`,
                        borderRadius: 3, padding: '2px 6px', fontSize: 14,
                        color: S.gold, outline: 'none',
                      }}
                      onFocus={e => (e.target.style.borderColor = 'rgba(201,168,76,0.6)')}
                      onBlur={e => (e.target.style.borderColor = S.border)}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                    {[
                      { label: 'G', title: 'Gras (**texte**)', before: '**', after: '**', style: { fontWeight: 700 } },
                      { label: 'I', title: 'Italique (*texte*)', before: '*', after: '*', style: { fontStyle: 'italic' } },
                      { label: '◆', title: 'Couleur dorée (==texte==)', before: '==', after: '==', style: { color: 'var(--tdr-gold)' } },
                    ].map(btn => (
                      <button
                        key={btn.label}
                        title={btn.title}
                        onMouseDown={e => { e.preventDefault(); wrap(i, btn.before, btn.after) }}
                        style={{
                          ...btn.style,
                          padding: '2px 8px', borderRadius: 3, fontSize: 14, cursor: 'pointer',
                          border: `1px solid ${S.border}`, background: 'rgba(201,168,76,0.07)',
                          color: btn.style.color ?? S.parchment,
                        }}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    ref={el => { textareaRefs.current[i] = el }}
                    value={getDesc(selected, i)}
                    onChange={e => updateRang(selected, i, { desc: e.target.value })}
                    rows={4}
                    style={{
                      width: '100%', background: S.bg, border: `1px solid ${S.border}`,
                      borderRadius: 4, padding: '8px 10px',
                      fontSize: 17, color: S.parchment,
                      resize: 'vertical', outline: 'none',
                      fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box',
                    }}
                    onFocus={e => (e.target.style.borderColor = 'rgba(201,168,76,0.6)')}
                    onBlur={e => (e.target.style.borderColor = S.border)}
                  />

                  {/* Effets */}
                  {(() => {
                    const effects = getEffects(selected, i)
                    const normaux = effects.map((e, idx) => ({ e, idx })).filter(({ e }) => !e.avancee)
                    const avances = effects.map((e, idx) => ({ e, idx })).filter(({ e }) => !!e.avancee)

                    const renderLigne = (eff: Effect, ei: number) => (
                      <div key={ei}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                        <select
                          value={eff.stat}
                          onChange={e => updateEffect(selected, i, ei, { stat: e.target.value })}
                          style={{
                            background: S.bg, border: `1px solid ${S.border}`, borderRadius: 3,
                            padding: '2px 4px', fontSize: 13, color: S.gold, outline: 'none', cursor: 'pointer',
                          }}
                        >
                          {STATS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: S.parchment, cursor: 'pointer', userSelect: 'none' }}>
                          <input
                            type="checkbox"
                            checked={eff.formula !== undefined}
                            onChange={e => {
                              if (e.target.checked) updateEffect(selected, i, ei, { formula: FORMULAS[0], value: null })
                              else updateEffect(selected, i, ei, { value: 1, formula: null })
                            }}
                            style={{ accentColor: S.gold, cursor: 'pointer' }}
                          />
                          Formule
                        </label>
                        {eff.formula !== undefined ? (
                          <select
                            value={eff.formula}
                            onChange={e => updateEffect(selected, i, ei, { formula: e.target.value })}
                            style={{
                              background: S.bg, border: `1px solid ${S.border}`, borderRadius: 3,
                              padding: '2px 4px', fontSize: 13, color: S.gold, outline: 'none', cursor: 'pointer',
                            }}
                          >
                            {FORMULAS.map(f => <option key={f} value={f}>{f}</option>)}
                          </select>
                        ) : (
                          <>
                            <span style={{ fontSize: 13, color: S.parchment, opacity: 0.5 }}>Valeur :</span>
                            <input
                              type="number"
                              value={eff.value ?? 0}
                              onChange={e => updateEffect(selected, i, ei, { value: parseInt(e.target.value) || 0 })}
                              style={{
                                width: 52, background: S.bg, border: `1px solid ${S.border}`, borderRadius: 3,
                                padding: '2px 4px', fontSize: 13, color: S.parchment, outline: 'none', textAlign: 'center',
                              }}
                            />
                          </>
                        )}
                        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: S.parchment, cursor: 'pointer', userSelect: 'none' }}>
                          <input
                            type="checkbox"
                            checked={eff.minRang !== undefined}
                            onChange={e => updateEffect(selected, i, ei, { minRang: e.target.checked ? (i + 1) : null })}
                            style={{ accentColor: S.gold, cursor: 'pointer' }}
                          />
                          Actif seulement au rang :
                        </label>
                        {eff.minRang !== undefined && (
                          <input
                            type="number"
                            min={1} max={5}
                            value={eff.minRang}
                            onChange={e => updateEffect(selected, i, ei, { minRang: Math.min(5, Math.max(1, parseInt(e.target.value) || 1)) })}
                            style={{
                              width: 40, background: S.bg, border: `1px solid ${S.border}`, borderRadius: 3,
                              padding: '2px 4px', fontSize: 13, color: S.gold, outline: 'none', textAlign: 'center',
                            }}
                          />
                        )}
                        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: S.gold, cursor: 'pointer', userSelect: 'none' }}>
                          <input
                            type="checkbox"
                            checked={!!eff.avancee}
                            onChange={e => updateEffect(selected, i, ei, { avancee: e.target.checked || undefined })}
                            style={{ accentColor: S.gold, cursor: 'pointer' }}
                          />
                          Avancée
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'rgba(100,180,255,0.85)', cursor: 'pointer', userSelect: 'none' }}>
                          <input
                            type="checkbox"
                            checked={!!eff.condition}
                            onChange={e => {
                              if (e.target.checked) updateEffect(selected, i, ei, { condition: { type: 'hasBouclier' } })
                              else updateEffect(selected, i, ei, { condition: null })
                            }}
                            style={{ accentColor: 'rgba(100,180,255,0.85)', cursor: 'pointer' }}
                          />
                          Si…
                        </label>
                        {eff.condition && (
                          <select
                            value={eff.condition.type}
                            onChange={e => {
                              const t = e.target.value as EffectCondition['type']
                              if (t === 'hasArme') updateEffect(selected, i, ei, { condition: { type: 'hasArme', armes: [] } })
                              else if (t === 'hasBouclier') updateEffect(selected, i, ei, { condition: { type: 'hasBouclier' } })
                              else updateEffect(selected, i, ei, { condition: { type: 'noArme' } })
                            }}
                            style={{
                              background: S.bg, border: '1px solid rgba(100,180,255,0.4)', borderRadius: 3,
                              padding: '2px 4px', fontSize: 13, color: 'rgba(100,180,255,0.85)', outline: 'none', cursor: 'pointer',
                            }}
                          >
                            <option value="hasBouclier">bouclier équipé</option>
                            <option value="hasArme">manie une arme</option>
                            <option value="noArme">sans arme</option>
                          </select>
                        )}
                        <button
                          onClick={() => removeEffect(selected, i, ei)}
                          title="Supprimer cet effet"
                          style={{
                            padding: '2px 7px', borderRadius: 3, fontSize: 13, cursor: 'pointer',
                            border: '1px solid rgba(220,80,80,0.35)', background: 'transparent', color: '#e05555',
                          }}
                        >🗑</button>
                      </div>
                      {eff.condition?.type === 'hasArme' && (() => {

                        const cond = eff.condition as { type: 'hasArme'; armes: string[] }
                        return (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', marginLeft: 16, marginBottom: 4 }}>
                            {cond.armes.map((a, ai) => (
                              <span key={ai} style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'rgba(100,180,255,0.1)', border: '1px solid rgba(100,180,255,0.3)', borderRadius: 3, padding: '1px 6px', fontSize: 12, color: 'rgba(100,180,255,0.85)' }}>
                                {a}
                                <button
                                  onClick={() => updateEffect(selected, i, ei, { condition: { type: 'hasArme', armes: cond.armes.filter((_, j) => j !== ai) } })}
                                  style={{ background: 'none', border: 'none', color: '#e05555', cursor: 'pointer', padding: '0 2px', fontSize: 11, lineHeight: 1 }}
                                >✕</button>
                              </span>
                            ))}
                            <select
                              value=""
                              onChange={e => {
                                if (!e.target.value || cond.armes.includes(e.target.value)) return
                                updateEffect(selected, i, ei, { condition: { type: 'hasArme', armes: [...cond.armes, e.target.value] } })
                              }}
                              style={{ background: S.bg, border: '1px solid rgba(100,180,255,0.3)', borderRadius: 3, padding: '1px 4px', fontSize: 12, color: 'rgba(100,180,255,0.85)', outline: 'none', cursor: 'pointer' }}
                            >
                              <option value="">+ Arme…</option>
                              {ARMES_LIST.filter(a => !cond.armes.includes(a)).map(a => <option key={a} value={a}>{a}</option>)}
                            </select>
                          </div>
                        )
                      })()}
                      </div>
                    )

                    const grants = getGrants(selected, i)
                    const grantsNormaux = grants.map((g, idx) => ({ g, idx })).filter(({ g }) => !g.avancee)
                    const grantsAvances = grants.map((g, idx) => ({ g, idx })).filter(({ g }) => !!g.avancee)

                    const renderGrant = (grant: Grant, gi: number) => (
                      <div key={gi} style={{ marginBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <select
                            value={grant.type}
                            onChange={e => updateGrant(selected, i, gi, { type: e.target.value as Grant['type'] })}
                            style={{
                              background: S.bg, border: `1px solid ${S.border}`, borderRadius: 3,
                              padding: '2px 4px', fontSize: 13, color: S.gold, outline: 'none', cursor: 'pointer',
                            }}
                          >
                            <option value="FORMATION">Formation</option>
                            <option value="VOIE_RANG">Voie (rang fixe)</option>
                            <option value="VOIE_RANG_CHOIX">Voie (rang au choix)</option>
                          </select>

                          {grant.type === 'FORMATION' && (
                            <select
                              value={grant.value}
                              onChange={e => updateGrant(selected, i, gi, { type: 'FORMATION', value: e.target.value })}
                              style={{
                                background: S.bg, border: `1px solid ${S.border}`, borderRadius: 3,
                                padding: '2px 4px', fontSize: 13, color: S.parchment, outline: 'none', cursor: 'pointer',
                              }}
                            >
                              {FORMATIONS.map(f => <option key={f} value={f}>{f}</option>)}
                            </select>
                          )}

                          {grant.type === 'VOIE_RANG' && (
                            <>
                              <select
                                value={grant.voie}
                                onChange={e => updateGrant(selected, i, gi, { type: 'VOIE_RANG', voie: e.target.value, rang: grant.rang })}
                                style={{
                                  background: S.bg, border: `1px solid ${S.border}`, borderRadius: 3,
                                  padding: '2px 4px', fontSize: 13, color: S.parchment, outline: 'none', cursor: 'pointer', maxWidth: 200,
                                }}
                              >
                                {voiesList.map(v => <option key={v} value={v}>{v}</option>)}
                              </select>
                              <span style={{ fontSize: 13, color: S.parchment, opacity: 0.5 }}>Rang :</span>
                              <input
                                type="number" min={1} max={5} value={grant.rang}
                                onChange={e => updateGrant(selected, i, gi, { type: 'VOIE_RANG', voie: grant.voie, rang: Math.min(5, Math.max(1, parseInt(e.target.value) || 1)) })}
                                style={{ width: 40, background: S.bg, border: `1px solid ${S.border}`, borderRadius: 3, padding: '2px 4px', fontSize: 13, color: S.gold, outline: 'none', textAlign: 'center' }}
                              />
                            </>
                          )}

                          {grant.type === 'VOIE_RANG_CHOIX' && (
                            <>
                              <span style={{ fontSize: 13, color: S.parchment, opacity: 0.5 }}>Rang max :</span>
                              <input
                                type="number" min={1} max={5} value={grant.rangMax}
                                onChange={e => updateGrant(selected, i, gi, { type: 'VOIE_RANG_CHOIX', voies: grant.voies, rangMax: Math.min(5, Math.max(1, parseInt(e.target.value) || 1)) })}
                                style={{ width: 40, background: S.bg, border: `1px solid ${S.border}`, borderRadius: 3, padding: '2px 4px', fontSize: 13, color: S.gold, outline: 'none', textAlign: 'center' }}
                              />
                            </>
                          )}

                          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: S.parchment, cursor: 'pointer', userSelect: 'none' }}>
                            <input
                              type="checkbox"
                              checked={grant.minRang !== undefined}
                              onChange={e => updateGrant(selected, i, gi, { minRang: e.target.checked ? (i + 1) : null })}
                              style={{ accentColor: S.gold, cursor: 'pointer' }}
                            />
                            Actif seulement au rang :
                          </label>
                          {grant.minRang !== undefined && (
                            <input
                              type="number" min={1} max={5} value={grant.minRang}
                              onChange={e => updateGrant(selected, i, gi, { minRang: Math.min(5, Math.max(1, parseInt(e.target.value) || 1)) })}
                              style={{ width: 40, background: S.bg, border: `1px solid ${S.border}`, borderRadius: 3, padding: '2px 4px', fontSize: 13, color: S.gold, outline: 'none', textAlign: 'center' }}
                            />
                          )}
                          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: S.gold, cursor: 'pointer', userSelect: 'none' }}>
                            <input
                              type="checkbox"
                              checked={!!grant.avancee}
                              onChange={e => updateGrant(selected, i, gi, { avancee: e.target.checked ? true : null })}
                              style={{ accentColor: S.gold, cursor: 'pointer' }}
                            />
                            Avancée
                          </label>
                          <button
                            onClick={() => removeGrant(selected, i, gi)}
                            title="Supprimer cet accès"
                            style={{ padding: '2px 7px', borderRadius: 3, fontSize: 13, cursor: 'pointer', border: '1px solid rgba(220,80,80,0.35)', background: 'transparent', color: '#e05555' }}
                          >🗑</button>
                        </div>

                        {/* Liste des voies pour VOIE_RANG_CHOIX */}
                        {grant.type === 'VOIE_RANG_CHOIX' && (
                          <div style={{ marginTop: 4, marginLeft: 16, display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                            {grant.voies.map((v, vi) => (
                              <span key={vi} style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'rgba(201,168,76,0.12)', border: `1px solid ${S.border}`, borderRadius: 3, padding: '1px 6px', fontSize: 12, color: S.parchment }}>
                                {v}
                                <button
                                  onClick={() => updateGrant(selected, i, gi, { type: 'VOIE_RANG_CHOIX', voies: grant.voies.filter((_, j) => j !== vi), rangMax: grant.rangMax })}
                                  style={{ background: 'none', border: 'none', color: '#e05555', cursor: 'pointer', padding: '0 2px', fontSize: 11, lineHeight: 1 }}
                                >✕</button>
                              </span>
                            ))}
                            <select
                              value=""
                              onChange={e => {
                                if (!e.target.value || grant.voies.includes(e.target.value)) return
                                updateGrant(selected, i, gi, { type: 'VOIE_RANG_CHOIX', voies: [...grant.voies, e.target.value], rangMax: grant.rangMax })
                              }}
                              style={{ background: S.bg, border: `1px solid ${S.border}`, borderRadius: 3, padding: '1px 4px', fontSize: 12, color: S.gold, outline: 'none', cursor: 'pointer' }}
                            >
                              <option value="">+ Voie…</option>
                              {VOIES_INIT.filter(v => !grant.voies.includes(v)).map(v => <option key={v} value={v}>{v}</option>)}
                            </select>
                          </div>
                        )}
                      </div>
                    )

                    return (
                      <div style={{ marginTop: 8, border: `1px solid rgba(201,168,76,0.45)`, borderRadius: 5, padding: '8px 10px' }}>
                        <div style={{ fontSize: 12, color: S.gold, opacity: 0.6, letterSpacing: '0.08em', marginBottom: 5, textTransform: 'uppercase' }}>
                          Effets &amp; Accès
                        </div>
                        {normaux.map(({ e, idx }) => renderLigne(e, idx))}
                        {grantsNormaux.map(({ g, idx }) => renderGrant(g, idx))}
                        <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                          <button
                            onClick={() => addEffect(selected, i)}
                            style={{
                              padding: '3px 10px', borderRadius: 3, fontSize: 13, cursor: 'pointer',
                              border: `1px solid ${S.border}`, background: 'transparent', color: S.gold,
                            }}
                          >+ Ajouter un effet</button>
                          <button
                            onClick={() => addGrant(selected, i)}
                            style={{
                              padding: '3px 10px', borderRadius: 3, fontSize: 13, cursor: 'pointer',
                              border: `1px solid ${S.border}`, background: 'transparent', color: S.gold,
                            }}
                          >+ Ajouter un accès</button>
                        </div>
                        <div style={{ marginTop: 10, borderRadius: 4, padding: '8px 10px', background: 'rgba(201,168,76,0.07)' }}>
                          <div style={{ fontSize: 12, color: S.gold, letterSpacing: '0.08em', marginBottom: 6, textTransform: 'uppercase' }}>
                            Capacité avancée
                          </div>
                          {avances.map(({ e, idx }) => renderLigne(e, idx))}
                          {grantsAvances.map(({ g, idx }) => renderGrant(g, idx))}
                          <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                            <button
                              onClick={() => addEffect(selected, i, true)}
                              style={{
                                padding: '3px 10px', borderRadius: 3, fontSize: 13, cursor: 'pointer',
                                border: `1px solid ${S.border}`, background: 'transparent', color: S.gold,
                              }}
                            >+ Ajouter un effet avancé</button>
                            <button
                              onClick={() => addGrant(selected, i, true)}
                              style={{
                                padding: '3px 10px', borderRadius: 3, fontSize: 13, cursor: 'pointer',
                                border: `1px solid ${S.border}`, background: 'transparent', color: S.gold,
                              }}
                            >+ Ajouter un accès avancé</button>
                          </div>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              ))}
            </div>
          </>) : section === 'traits' ? (<>
            {/* Colonne traits */}
            <div style={{
              width: 280, flexShrink: 0,
              borderRight: `1px solid ${S.border}`,
              display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ padding: '10px 12px', borderBottom: `1px solid ${S.border}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button onClick={addTrait} style={{
                  width: '100%', padding: '5px 8px', borderRadius: 4, fontSize: 17, cursor: 'pointer',
                  border: `1px solid ${S.border}`, background: 'rgba(201,168,76,0.07)',
                  color: S.gold, boxSizing: 'border-box',
                }}>
                  + Nouveau trait
                </button>
                <button onClick={() => pendingFileRef.current?.click()} style={{
                  width: '100%', padding: '5px 8px', borderRadius: 4, fontSize: 14, cursor: 'pointer',
                  border: `1px solid ${S.border}`, background: 'transparent',
                  color: 'rgba(201,168,76,0.6)', boxSizing: 'border-box',
                }}>↑ Importer un trait</button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {traits.map((t, i) => (
                  <div key={i} onClick={() => setSelectedTrait(i)} className="voie-list-item" style={{
                    padding: '7px 12px', fontSize: 17, cursor: 'pointer',
                    color: selectedTrait === i ? S.gold : S.parchment,
                    background: selectedTrait === i ? 'rgba(201,168,76,0.1)' : 'transparent',
                    borderLeft: selectedTrait === i ? `3px solid ${S.gold}` : '3px solid transparent',
                    transition: 'all 0.1s',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4,
                  }}>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.nom}</span>
                    <button
                      onClick={e => { e.stopPropagation(); exportSingleItem({ type: 'trait', data: t }, `trait-${safeName(t.nom)}.json`) }}
                      style={{ background: 'none', border: 'none', color: 'rgba(201,168,76,0.9)', cursor: 'pointer', fontSize: 15, fontWeight: 700, padding: '0 3px', opacity: 0, transition: 'opacity 0.15s', flexShrink: 0 }}
                      className="voie-delete-btn"
                      title="Exporter ce trait"
                    >↓</button>
                  </div>
                ))}
              </div>
              {/* Zone en attente — traits */}
              {pendingItems.some(p => p.type === 'trait') && (
                <div style={{ borderTop: `2px solid rgba(201,168,76,0.4)`, flexShrink: 0 }}>
                  <div style={{ padding: '6px 14px', fontSize: 12, color: S.gold, opacity: 0.8, letterSpacing: '0.1em', textTransform: 'uppercase', background: 'rgba(201,168,76,0.07)', fontWeight: 600 }}>
                    En attente ({pendingItems.filter(p => p.type === 'trait').length})
                  </div>
                  <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                    {pendingItems.filter(p => p.type === 'trait').map(item => {
                      if (item.type !== 'trait') return null
                      const isDoublon = traits.some(t => t.nom === item.data.nom)
                      return (
                        <div key={item.id} style={{ padding: '8px 12px', borderBottom: `1px solid rgba(201,168,76,0.1)` }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                            {isDoublon && <span style={{ fontSize: 11, background: 'rgba(230,140,40,0.2)', color: 'rgba(230,160,60,0.9)', border: '1px solid rgba(230,140,40,0.4)', borderRadius: 3, padding: '1px 5px', flexShrink: 0 }}>doublon</span>}
                            <span style={{ fontSize: 14, color: S.parchment, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.data.nom}</span>
                            <button onClick={() => openPreview(item.id)} style={{ background: 'none', border: 'none', color: S.gold, cursor: 'pointer', fontSize: 15, padding: '0 3px', opacity: 0.8, flexShrink: 0 }} title="Aperçu">🔍</button>
                          </div>
                          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                            <button onClick={() => {
                              if (isDoublon) setTraits(prev => prev.map(t => t.nom === item.data.nom ? item.data : t))
                              else { setTraits(prev => [...prev, item.data]); setSelectedTrait(traits.length) }
                              setPendingItems(prev => prev.filter(p => p.id !== item.id)); setTraitsExported(false)
                            }} style={{ padding: '3px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer', border: `1px solid rgba(201,168,76,0.4)`, background: 'rgba(201,168,76,0.12)', color: S.gold }}>
                              {isDoublon ? 'Remplacer' : 'Incorporer'}
                            </button>
                            {isDoublon && <button onClick={() => {
                              let n = `${item.data.nom} (2)`; let i = 3; while (traits.some(t => t.nom === n)) n = `${item.data.nom} (${i++})`
                              setTraits(prev => [...prev, { ...item.data, nom: n }]); setSelectedTrait(traits.length)
                              setPendingItems(prev => prev.filter(p => p.id !== item.id)); setTraitsExported(false)
                            }} style={{ padding: '3px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer', border: `1px solid rgba(201,168,76,0.25)`, background: 'transparent', color: 'rgba(245,236,215,0.65)' }}>+copie</button>}
                            <button onClick={() => setPendingItems(prev => prev.filter(p => p.id !== item.id))}
                              style={{ padding: '3px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer', border: '1px solid rgba(220,80,80,0.3)', background: 'transparent', color: '#e05555' }}>Ignorer</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Éditeur trait */}
            {traits[selectedTrait] && (
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="text"
                    value={traits[selectedTrait].nom}
                    onChange={e => updateTrait(selectedTrait, { nom: e.target.value })}
                    style={{
                      flex: 1, background: S.bg, border: `1px solid ${S.border}`,
                      borderRadius: 4, padding: '5px 10px', fontSize: 17,
                      color: S.gold, fontWeight: 700, outline: 'none',
                      fontFamily: "'Cinzel', serif",
                    }}
                    onFocus={e => (e.target.style.borderColor = 'rgba(201,168,76,0.6)')}
                    onBlur={e => (e.target.style.borderColor = S.border)}
                  />
                  <button
                    onClick={() => askConfirm(`Supprimer le trait "${traits[selectedTrait]?.nom}" ?`, () => removeTrait(selectedTrait))}
                    title="Supprimer ce trait"
                    style={{
                      padding: '4px 10px', borderRadius: 4, fontSize: 17, cursor: 'pointer',
                      border: '1px solid rgba(220,80,80,0.4)', background: 'transparent',
                      color: '#e05555', flexShrink: 0,
                    }}
                  >Supprimer</button>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[
                    { label: 'G', title: 'Gras (**texte**)', before: '**', after: '**', style: { fontWeight: 700 } },
                    { label: 'I', title: 'Italique (*texte*)', before: '*', after: '*', style: { fontStyle: 'italic' } },
                    { label: '◆', title: 'Couleur dorée (==texte==)', before: '==', after: '==', style: { color: 'var(--tdr-gold)' } },
                  ].map(btn => (
                    <button
                      key={btn.label}
                      title={btn.title}
                      onMouseDown={e => { e.preventDefault(); wrapTrait(btn.before, btn.after) }}
                      style={{
                        ...btn.style,
                        padding: '2px 8px', borderRadius: 3, fontSize: 14, cursor: 'pointer',
                        border: `1px solid ${S.border}`, background: 'rgba(201,168,76,0.07)',
                        color: btn.style.color ?? S.parchment,
                      }}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
                <textarea
                  ref={traitDescRef}
                  value={traits[selectedTrait].desc}
                  onChange={e => updateTrait(selectedTrait, { desc: e.target.value })}
                  rows={8}
                  style={{
                    width: '100%', background: S.bg, border: `1px solid ${S.border}`,
                    borderRadius: 4, padding: '8px 10px',
                    fontSize: 17, color: S.parchment,
                    resize: 'vertical', outline: 'none',
                    fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box',
                  }}
                  onFocus={e => (e.target.style.borderColor = 'rgba(201,168,76,0.6)')}
                  onBlur={e => (e.target.style.borderColor = S.border)}
                />
              </div>
            )}
          </>) : (<>
            {/* Colonne peuples */}
            <div style={{ width: 240, flexShrink: 0, borderRight: `1px solid ${S.border}`, display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '10px 12px', borderBottom: `1px solid ${S.border}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button onClick={addPeuple} style={{
                  width: '100%', padding: '5px 8px', borderRadius: 4, fontSize: 14, cursor: 'pointer',
                  border: `1px solid ${S.border}`, background: 'rgba(201,168,76,0.07)',
                  color: S.gold, boxSizing: 'border-box',
                }}>+ Nouveau peuple</button>
                <button onClick={() => pendingFileRef.current?.click()} style={{
                  width: '100%', padding: '5px 8px', borderRadius: 4, fontSize: 14, cursor: 'pointer',
                  border: `1px solid ${S.border}`, background: 'transparent',
                  color: 'rgba(201,168,76,0.6)', boxSizing: 'border-box',
                }}>↑ Importer un peuple</button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {peuples.map((p, i) => (
                  <div key={i} onClick={() => { setSelectedPeuple(i); setSelectedCulture(0) }} className="voie-list-item" style={{
                    padding: '7px 12px', fontSize: 15, cursor: 'pointer',
                    color: selectedPeuple === i ? S.gold : S.parchment,
                    background: selectedPeuple === i ? 'rgba(201,168,76,0.1)' : 'transparent',
                    borderLeft: selectedPeuple === i ? `3px solid ${S.gold}` : '3px solid transparent',
                    transition: 'all 0.1s',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4,
                  }}>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label}</span>
                    <button
                      onClick={e => { e.stopPropagation(); exportSingleItem({ type: 'peuple', data: p }, `peuple-${safeName(p.label)}.json`) }}
                      style={{ background: 'none', border: 'none', color: 'rgba(201,168,76,0.9)', cursor: 'pointer', fontSize: 15, fontWeight: 700, padding: '0 3px', opacity: 0, transition: 'opacity 0.15s', flexShrink: 0 }}
                      className="voie-delete-btn"
                      title="Exporter ce peuple"
                    >↓</button>
                  </div>
                ))}
              </div>
              {/* Zone en attente — peuples */}
              {pendingItems.some(p => p.type === 'peuple') && (
                <div style={{ borderTop: `2px solid rgba(201,168,76,0.4)`, flexShrink: 0 }}>
                  <div style={{ padding: '6px 14px', fontSize: 12, color: S.gold, opacity: 0.8, letterSpacing: '0.1em', textTransform: 'uppercase', background: 'rgba(201,168,76,0.07)', fontWeight: 600 }}>
                    En attente ({pendingItems.filter(p => p.type === 'peuple').length})
                  </div>
                  <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                    {pendingItems.filter(p => p.type === 'peuple').map(item => {
                      if (item.type !== 'peuple') return null
                      const isDoublon = peuples.some(p => p.label === item.data.label)
                      return (
                        <div key={item.id} style={{ padding: '8px 12px', borderBottom: `1px solid rgba(201,168,76,0.1)` }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                            {isDoublon && <span style={{ fontSize: 11, background: 'rgba(230,140,40,0.2)', color: 'rgba(230,160,60,0.9)', border: '1px solid rgba(230,140,40,0.4)', borderRadius: 3, padding: '1px 5px', flexShrink: 0 }}>doublon</span>}
                            <span style={{ fontSize: 14, color: S.parchment, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.data.label}</span>
                            <button onClick={() => openPreview(item.id)} style={{ background: 'none', border: 'none', color: S.gold, cursor: 'pointer', fontSize: 15, padding: '0 3px', opacity: 0.8, flexShrink: 0 }} title="Aperçu">🔍</button>
                          </div>
                          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                            <button onClick={() => {
                              if (isDoublon) setPeuples(prev => prev.map(p => p.label === item.data.label ? item.data : p))
                              else { setPeuples(prev => [...prev, item.data]); setSelectedPeuple(peuples.length) }
                              setPendingItems(prev => prev.filter(p => p.id !== item.id)); setPeuplesExported(false)
                            }} style={{ padding: '3px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer', border: `1px solid rgba(201,168,76,0.4)`, background: 'rgba(201,168,76,0.12)', color: S.gold }}>
                              {isDoublon ? 'Remplacer' : 'Incorporer'}
                            </button>
                            {isDoublon && <button onClick={() => {
                              let n = `${item.data.label} (2)`; let i = 3; while (peuples.some(p => p.label === n)) n = `${item.data.label} (${i++})`
                              setPeuples(prev => [...prev, { ...item.data, label: n }]); setSelectedPeuple(peuples.length)
                              setPendingItems(prev => prev.filter(p => p.id !== item.id)); setPeuplesExported(false)
                            }} style={{ padding: '3px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer', border: `1px solid rgba(201,168,76,0.25)`, background: 'transparent', color: 'rgba(245,236,215,0.65)' }}>+copie</button>}
                            <button onClick={() => setPendingItems(prev => prev.filter(p => p.id !== item.id))}
                              style={{ padding: '3px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer', border: '1px solid rgba(220,80,80,0.3)', background: 'transparent', color: '#e05555' }}>Ignorer</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Éditeur peuple */}
            {peuples[selectedPeuple] && (() => {
              const peuple = peuples[selectedPeuple]
              return (
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Nom du peuple */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="text"
                      value={peuple.label}
                      onChange={e => updatePeuple(selectedPeuple, { label: e.target.value })}
                      style={{
                        flex: 1, background: S.bg, border: `1px solid ${S.border}`,
                        borderRadius: 4, padding: '5px 10px', fontSize: 17,
                        color: S.gold, fontWeight: 700, outline: 'none', fontFamily: "'Cinzel', serif",
                      }}
                      onFocus={e => (e.target.style.borderColor = 'rgba(201,168,76,0.6)')}
                      onBlur={e => (e.target.style.borderColor = S.border)}
                    />
                    <button onClick={() => askConfirm(`Supprimer le peuple "${peuple.label}" et toutes ses cultures ?`, () => removePeuple(selectedPeuple))} style={{
                      padding: '4px 10px', borderRadius: 4, fontSize: 14, cursor: 'pointer',
                      border: '1px solid rgba(220,80,80,0.4)', background: 'transparent', color: '#e05555', flexShrink: 0,
                    }}>Supprimer</button>
                  </div>

                  {/* Cultures */}
                  {peuple.cultures.map((culture, ci) => {
                    // Voies du peuple utilisées par d'autres peuples (pas le peuple courant)
                    const usedVoiesPeuple = new Set(
                      peuples.flatMap((p, pi) => pi === selectedPeuple ? [] : p.cultures.map(c => c.voiePeuple)).filter(Boolean)
                    )
                    // Voies culturelles utilisées par d'autres cultures (pas la culture courante)
                    const usedVoiesCulturelles = new Set(
                      peuples.flatMap((p, pi) => p.cultures.flatMap((c, cj) =>
                        pi === selectedPeuple && cj === ci ? [] : [c.voieCulturelle]
                      )).filter(Boolean)
                    )
                    return (
                    <div key={ci} style={{ border: `1px solid rgba(201,168,76,0.45)`, borderRadius: 5, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12, color: S.gold, opacity: 0.6, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Culture</span>
                        <input
                          type="text"
                          value={culture.label}
                          onChange={e => updateCulture(selectedPeuple, ci, { label: e.target.value })}
                          style={{ flex: 1, background: S.bg, border: `1px solid ${S.border}`, borderRadius: 3, padding: '2px 8px', fontSize: 15, color: S.gold, fontWeight: 600, outline: 'none' }}
                          onFocus={e => (e.target.style.borderColor = 'rgba(201,168,76,0.6)')}
                          onBlur={e => (e.target.style.borderColor = S.border)}
                        />
                        <button onClick={() => askConfirm(`Supprimer la culture "${culture.label}" ?`, () => removeCulture(selectedPeuple, ci))} style={{
                          padding: '2px 8px', borderRadius: 3, fontSize: 13, cursor: 'pointer',
                          border: '1px solid rgba(220,80,80,0.35)', background: 'transparent', color: '#e05555',
                        }}>🗑</button>
                      </div>

                      <div style={{ display: 'flex', gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, color: S.parchment, opacity: 0.5, marginBottom: 3 }}>Voie du peuple</div>
                          <VoieSelectCombobox
                            value={culture.voiePeuple}
                            voiesList={voiesList.filter(v => v.toLowerCase().includes('peuple'))}
                            usedVoies={usedVoiesPeuple}
                            onChange={v => updateCulture(selectedPeuple, ci, { voiePeuple: v })}
                            onCreateVoie={() => { addVoie(); setSection('voies') }}
                          />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, color: S.parchment, opacity: 0.5, marginBottom: 3 }}>Voie culturelle</div>
                          <VoieSelectCombobox
                            value={culture.voieCulturelle}
                            voiesList={voiesList.filter(v => v.toLowerCase().includes('culturelle'))}
                            usedVoies={usedVoiesCulturelles}
                            onChange={v => updateCulture(selectedPeuple, ci, { voieCulturelle: v })}
                            onCreateVoie={() => { addVoie(); setSection('voies') }}
                          />
                        </div>
                      </div>

                      {/* Modificateurs de caractéristiques */}
                      <div>
                        <div style={{ fontSize: 12, color: S.parchment, opacity: 0.5, marginBottom: 4 }}>Modificateurs de caractéristiques</div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {CARACS.map(car => (
                            <label key={car} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 13, color: S.parchment }}>
                              <span style={{ color: S.gold, fontWeight: 600, minWidth: 28 }}>{car}</span>
                              <input
                                type="number"
                                value={culture.modCaracs[car] ?? 0}
                                onChange={e => {
                                  const val = parseInt(e.target.value) || 0
                                  const newMod = { ...culture.modCaracs }
                                  if (val === 0) delete newMod[car]
                                  else newMod[car] = val
                                  updateCulture(selectedPeuple, ci, { modCaracs: newMod })
                                }}
                                style={{ width: 48, background: S.bg, border: `1px solid ${S.border}`, borderRadius: 3, padding: '2px 4px', fontSize: 13, color: S.parchment, outline: 'none', textAlign: 'center' }}
                              />
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* Trait */}
                      <div>
                        <div style={{ fontSize: 12, color: S.parchment, opacity: 0.5, marginBottom: 4 }}>Trait racial</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <TraitNomCombobox
                            value={culture.trait?.nom ?? ''}
                            allTraits={allTraits}
                            onChange={(nom, desc) => updateCulture(selectedPeuple, ci, {
                              trait: { nom, desc: desc ?? culture.trait?.desc ?? '' }
                            })}
                          />
                          <textarea
                            placeholder="Description du trait"
                            value={culture.trait?.desc ?? ''}
                            onChange={e => updateCulture(selectedPeuple, ci, { trait: { nom: culture.trait?.nom ?? '', desc: e.target.value } })}
                            rows={3}
                            style={{ width: '100%', background: S.bg, border: `1px solid ${S.border}`, borderRadius: 3, padding: '4px 6px', fontSize: 13, color: S.parchment, outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box' }}
                            onFocus={e => (e.target.style.borderColor = 'rgba(201,168,76,0.6)')}
                            onBlur={e => (e.target.style.borderColor = S.border)}
                          />
                        </div>
                      </div>
                    </div>
                  )})}


                  <button onClick={() => addCulture(selectedPeuple)} style={{
                    padding: '5px 14px', borderRadius: 4, fontSize: 14, cursor: 'pointer',
                    border: `1px solid ${S.border}`, background: 'rgba(201,168,76,0.07)', color: S.gold,
                  }}>+ Nouvelle culture</button>
                </div>
              )
            })()}
          </>)}

        </div>


        {/* Footer */}
        <div style={{
          padding: '8px 20px', borderTop: `1px solid ${S.border}`,
          fontSize: 13, color: 'rgba(245,236,215,0.4)', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        }}>
          <span>Les modifications sont <strong style={{ color: 'rgba(201,168,76,0.6)' }}>sauvegardées automatiquement</strong> dans <em>Documents/TdR/</em>.</span>
          <button
            onClick={() => askConfirm(
              'Réinitialiser toutes les données vers les valeurs par défaut du jeu ?',
              () => {
                setData(JSON.parse(JSON.stringify(DESCRIPTIONS_RAW)))
                setTraits(JSON.parse(JSON.stringify(TRAITS_RAW)))
                setPeuples(JSON.parse(JSON.stringify(PEUPLES_RAW)))
              }
            )}
            style={{
              flexShrink: 0, padding: '4px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 12,
              border: '1px solid rgba(200,80,80,0.3)', background: 'transparent',
              color: 'rgba(200,100,100,0.6)', fontFamily: 'inherit', whiteSpace: 'nowrap',
            }}
          >↺ Réinitialiser depuis les fichiers</button>
        </div>
      </div>
    </div>
    </>
  )
}

function TraitNomCombobox({
  value, allTraits, onChange, style,
}: {
  value: string
  allTraits: { nom: string; desc: string }[]
  onChange: (nom: string, desc: string | null) => void
  style?: React.CSSProperties
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => { setQuery(value) }, [value])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const S2 = { bg: 'rgba(15,12,8,0.92)', border: 'rgba(201,168,76,0.35)', gold: '#c9a84c', parchment: '#f5ecd7' }
  const filtered = allTraits.filter(t => t.nom.toLowerCase().includes(query.toLowerCase()))

  return (
    <div ref={ref} style={{ position: 'relative', ...style }}>
      <input
        type="text"
        value={query}
        placeholder="Nom du trait"
        onFocus={() => { setQuery(''); setOpen(true) }}
        onChange={e => { setQuery(e.target.value); onChange(e.target.value, null); setOpen(true) }}
        onBlur={() => setTimeout(() => { setOpen(false); setQuery(value) }, 150)}
        style={{
          width: '100%', background: S2.bg, border: `1px solid ${open ? 'rgba(201,168,76,0.6)' : S2.border}`,
          borderRadius: 3, padding: '3px 6px', fontSize: 13, color: S2.gold, outline: 'none', boxSizing: 'border-box',
        }}
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 60,
          background: 'rgba(18,14,9,0.98)', border: `1px solid rgba(201,168,76,0.4)`,
          borderRadius: 4, maxHeight: 200, overflowY: 'auto',
          boxShadow: '0 4px 20px rgba(0,0,0,0.7)', marginTop: 2,
        }}>
          {filtered.map(t => (
            <TraitOption key={t.nom} trait={t} onSelect={() => { onChange(t.nom, t.desc); setQuery(t.nom); setOpen(false) }} />
          ))}
        </div>
      )}
    </div>
  )
}

function TraitOption({ trait, onSelect }: { trait: { nom: string; desc: string }; onSelect: () => void }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onMouseDown={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '6px 10px', fontSize: 13, cursor: 'pointer',
        background: hovered ? 'rgba(201,168,76,0.12)' : 'transparent',
        color: '#f5ecd7',
      }}
    >
      <div style={{ fontWeight: 600, color: '#c9a84c' }}>{trait.nom}</div>
      {trait.desc && <div style={{ fontSize: 11, opacity: 0.5, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{trait.desc}</div>}
    </div>
  )
}

function VoieSelectCombobox({
  value, voiesList, usedVoies, onChange, onCreateVoie,
}: {
  value: string
  voiesList: string[]
  usedVoies: Set<string>
  onChange: (val: string) => void
  onCreateVoie?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => { setQuery(value) }, [value])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const filtered = voiesList.filter(v => v.toLowerCase().includes(query.toLowerCase()))
  const available = filtered.filter(v => !usedVoies.has(v) || v === value)
  const used = filtered.filter(v => usedVoies.has(v) && v !== value)

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        type="text"
        value={query}
        onFocus={() => { setQuery(''); setOpen(true) }}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onBlur={() => setTimeout(() => { setOpen(false); setQuery(value) }, 150)}
        style={{
          width: '100%', background: 'rgba(15,12,8,0.92)',
          border: `1px solid ${open ? 'rgba(201,168,76,0.6)' : 'rgba(201,168,76,0.35)'}`,
          borderRadius: 3, padding: '3px 6px', fontSize: 13, color: '#f5ecd7', outline: 'none', boxSizing: 'border-box',
        }}
      />
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 60,
          background: 'rgba(18,14,9,0.98)', border: '1px solid rgba(201,168,76,0.4)',
          borderRadius: 4, maxHeight: 220, overflowY: 'auto',
          boxShadow: '0 4px 20px rgba(0,0,0,0.7)', marginTop: 2,
        }}>
          {onCreateVoie && (
            <div
              onMouseDown={() => { setOpen(false); onCreateVoie() }}
              style={{
                padding: '6px 10px', fontSize: 13, cursor: 'pointer',
                color: '#c9a84c', borderBottom: '1px solid rgba(201,168,76,0.2)',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(201,168,76,0.12)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ fontSize: 15 }}>+</span> Créer une nouvelle voie
            </div>
          )}
          {available.map(v => (
            <VoieSelectOption key={v} nom={v} dimmed={false} onSelect={() => { onChange(v); setQuery(v); setOpen(false) }} />
          ))}
          {used.length > 0 && (
            <>
              {available.length > 0 && <div style={{ borderTop: '1px solid rgba(201,168,76,0.15)', margin: '2px 0' }} />}
              <div style={{ padding: '3px 10px', fontSize: 11, color: 'rgba(201,168,76,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Déjà utilisées</div>
              {used.map(v => (
                <VoieSelectOption key={v} nom={v} dimmed onSelect={() => { onChange(v); setQuery(v); setOpen(false) }} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function VoieSelectOption({ nom, dimmed, onSelect }: { nom: string; dimmed: boolean; onSelect: () => void }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onMouseDown={dimmed ? undefined : onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '6px 10px', fontSize: 13, cursor: dimmed ? 'not-allowed' : 'pointer',
        background: !dimmed && hovered ? 'rgba(201,168,76,0.1)' : 'transparent',
        color: dimmed ? 'rgba(245,236,215,0.35)' : '#f5ecd7',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
      }}
    >
      <span>{nom}</span>
      {dimmed && <span style={{ fontSize: 11, color: 'rgba(201,168,76,0.35)', flexShrink: 0 }}>déjà utilisée</span>}
    </div>
  )
}
