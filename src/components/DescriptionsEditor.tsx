import { useState, useRef, useEffect, useMemo } from 'react'
import { useTranslation, Trans } from 'react-i18next'
import { useVoieName, useCompagnonName, useTraitName, useTraitRacialName, usePeupleName } from '../hooks/useContentTranslation'
import DESCRIPTIONS_RAW from '../data/descriptions.json'
import TRAITS_RAW from '../data/traits-magiques.json'
import PEUPLES_RAW from '../data/peuples.json'
import { VOIES as VOIES_BUNDLE } from '../data/voies'
import { useGameData } from '../context/GameDataContext'
import { saveDataFileToBundle } from '../utils/tauriStorage'
import type { CompanionEntry } from '../types/gameData'

// descriptions.json peut être en format brut ou enveloppé { _type, data } — on unwrappe
const _descUnwrapped: Record<string, unknown[]> = (
  DESCRIPTIONS_RAW && '_type' in (DESCRIPTIONS_RAW as object) && 'data' in (DESCRIPTIONS_RAW as object)
    ? (DESCRIPTIONS_RAW as Record<string, unknown>).data
    : DESCRIPTIONS_RAW
) as Record<string, unknown[]>
const VOIES_INIT = Object.keys(_descUnwrapped).sort((a, b) => a.localeCompare(b, 'fr'))

const MASQUAGE_MOT_DE_PASSE = 'TdA-dev'

// ── Helpers de conversion Markdown → HTML (utilisés par aperçu et impression) ──

const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const inlineToHtml = (text: string): string =>
  escHtml(text)
    .replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*([^*]+)\*\*/g,     '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g,         '<em>$1</em>')
    .replace(/==([^=]+)==/g,         '<span class="tda-gold">$1</span>')
    .replace(/\[([^\]]*)\]/g,        '<span class="tda-bracket">$1</span>')

const blockToHtml = (text: string): string => {
  if (!text?.trim()) return '<p class="tda-empty">—</p>'
  const lines = text.split('\n')
  const blocks: string[] = []
  let i = 0
  while (i < lines.length) {
    if (lines[i].trimStart().startsWith('|')) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].trimStart().startsWith('|')) { tableLines.push(lines[i]); i++ }
      const rows = tableLines.map(l => l.split('|').slice(1, -1).map(c => c.trim()))
      const sepIdx = rows.findIndex(row => row.every(cell => /^[-:\s]+$/.test(cell)))
      const headers = sepIdx > 0 ? rows.slice(0, sepIdx) : []
      const body = sepIdx >= 0 ? rows.slice(sepIdx + 1) : rows
      let t = '<table class="tda-table">'
      if (headers.length > 0)
        t += `<thead>${headers.map(row => `<tr>${row.map(c => `<th>${inlineToHtml(c)}</th>`).join('')}</tr>`).join('')}</thead>`
      t += `<tbody>${body.map((row, ri) =>
        `<tr${ri % 2 === 1 ? ' class="tda-alt"' : ''}>${row.map(c => `<td>${inlineToHtml(c)}</td>`).join('')}</tr>`
      ).join('')}</tbody></table>`
      blocks.push(t)
    } else {
      const paraLines: string[] = []
      while (i < lines.length && !lines[i].trimStart().startsWith('|')) { paraLines.push(lines[i]); i++ }
      const content = paraLines.map(l => inlineToHtml(l)).join('<br>')
      if (content.trim()) blocks.push(`<p>${content}</p>`)
    }
  }
  return blocks.join('\n')
}

const PRINT_CSS = `
  * { box-sizing: border-box; }
  .tda-page {
    font-family: 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif;
    color: #1a1208; font-size: 11pt; line-height: 1.65;
  }
  .tda-page h1 {
    font-family: 'Cinzel', 'Trajan Pro', 'Times New Roman', serif;
    font-size: 22pt; font-weight: 700; margin: 0 0 3pt;
    color: #4a2e00; border-bottom: 1.5pt solid #a07030;
    padding-bottom: 5pt; letter-spacing: 0.05em;
  }
  .tda-famille {
    font-size: 9pt; color: #7a5010; margin: 3pt 0 18pt;
    letter-spacing: 0.14em; text-transform: uppercase;
    font-family: 'Cinzel', serif;
  }
  .tda-rang { margin-bottom: 14pt; break-inside: avoid; }
  .tda-h2 {
    font-family: 'Cinzel', 'Times New Roman', serif;
    font-size: 12.5pt; font-weight: 600; color: #4a2e00;
    margin: 0 0 4pt; border-bottom: 0.5pt solid rgba(160,112,48,0.35);
    padding-bottom: 2pt;
  }
  .tda-page p { margin: 0; text-align: justify; hyphens: auto; }
  .tda-empty { color: #999; font-style: italic; }
  .tda-gold { color: #7a4a00; font-weight: bold; }
  .tda-bracket { font-style: italic; color: #555; }
  .tda-table { border-collapse: collapse; font-size: 10pt; margin: 5pt 0; width: 100%; }
  .tda-table th { border: 0.5pt solid #a07030; padding: 3pt 8pt; background: rgba(160,112,48,0.12); color: #4a2e00; font-size: 9pt; text-align: left; }
  .tda-table td { border: 0.5pt solid rgba(160,112,48,0.35); padding: 2pt 8pt; }
  .tda-table .tda-alt td { background: rgba(160,112,48,0.05); }
`

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
type Effect = { stat: string; value?: number; formula?: string; diceStr?: string; minRang?: number; avancee?: boolean; rangMultiplier?: boolean; condition?: EffectCondition }
type Grant =
  | { type: 'FORMATION'; value: string; minRang?: number; avancee?: boolean }
  | { type: 'VOIE_RANG'; voie: string; rang: number; minRang?: number; avancee?: boolean }
  | { type: 'VOIE_RANG_CHOIX'; voies: string[]; rangMax: number; minRang?: number; avancee?: boolean }
  | { type: 'COMPAGNON'; nom: string; remplace?: string; minRang?: number; avancee?: boolean }
  | { type: 'COMPAGNON_CHOIX'; noms: string[]; minRang?: number; avancee?: boolean }
  | { type: 'EFFECT_CHOIX'; stats: string[]; value?: number; formula?: string; rangMultiplier?: boolean; minRang?: number; avancee?: boolean }
type RangEntry = { nom: string; desc: string; effects?: Effect[]; grants?: Grant[] }
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
  | { id: string; type: 'trait-racial'; data: TraitEntry; expanded: boolean }
  | { id: string; type: 'compagnon'; data: CompanionEntry; expanded: boolean }

export default function DescriptionsEditor({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const [showLangNotice, setShowLangNotice] = useState(() => {
    const lang = i18n.language.split('-')[0]
    if (lang === 'fr') return false
    return !sessionStorage.getItem(`descEditor_langNotice_${lang}`)
  })
  const voieName = useVoieName()
  const compagnonName = useCompagnonName()
  const traitName = useTraitName()
  const traitRacialName = useTraitRacialName()
  const peupleName = usePeupleName()
  const { data, setData, traits, setTraits, peuples, setPeuples, armes, voies, setVoies, compagnons, setCompagnons, traitsRaciaux, setTraitsRaciaux, hiddenVoies, setHiddenVoies, hiddenPeuples, setHiddenPeuples, hiddenCultures, setHiddenCultures, hiddenCompagnons, setHiddenCompagnons, showHidden, setShowHidden, openDataDir } = useGameData()

  const cultureKey = (peupleLabel: string, cultureLabel: string) => `${peupleLabel}::${cultureLabel}`

  const armesList = useMemo(() =>
    armes.groupes.flatMap(g => g.categories.flatMap(c => c.entrees.map(e => e.nom.replace(/[¹²³⁴⁵⁶⁷*]\s*/g, '').trim())))
      .filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a.localeCompare(b, 'fr'))
  , [armes])

  const [section, setSection] = useState<'voies' | 'traits' | 'traitsRaciaux' | 'peuples' | 'compagnons'>('peuples')
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void; label?: string; danger?: boolean } | null>(null)
  const askConfirm = (message: string, onConfirm: () => void) => setConfirmDialog({ message, onConfirm })
  const [promptDialog, setPromptDialog] = useState<{ message: string; defaultValue: string; onConfirm: (value: string) => void } | null>(null)
  const [promptValue, setPromptValue] = useState('')

  // Voies
  const [selected, setSelected] = useState(VOIES_INIT[0] ?? '')
  const [editingName, setEditingName] = useState(VOIES_INIT[0] ?? '')
  useEffect(() => { setEditingName(selected) }, [selected])
  const [printPreviewNom, setPrintPreviewNom] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [exported, setExported] = useState(false)
  const textareaRefs = useRef<(HTMLTextAreaElement | null)[]>([])

  // Traits magiques
  const [selectedTrait, setSelectedTrait] = useState(0)
  const [traitQuery, setTraitQuery] = useState('')
  const [traitsExported, setTraitsExported] = useState(false)
  const traitDescRef = useRef<HTMLTextAreaElement | null>(null)

  const [selectedTraitRacial, setSelectedTraitRacial] = useState(0)
  const [traitRacialQuery, setTraitRacialQuery] = useState('')
  const [traitsRaciauxExported, setTraitsRaciauxExported] = useState(false)
  const traitRacialDescRef = useRef<HTMLTextAreaElement | null>(null)
  const traitRacialImportRef = useRef<HTMLInputElement | null>(null)
  const compagnonImportRef = useRef<HTMLInputElement | null>(null)

  // Compagnons
  const [selectedCompagnon, setSelectedCompagnon] = useState(0)
  const [compagnonQuery, setCompagnonQuery] = useState('')
  const [compagnonsExported, setCompagnonsExported] = useState(false)

  // Peuples
  const [selectedPeuple, setSelectedPeuple] = useState(0)
  const [_selectedCulture, setSelectedCulture] = useState(0)
  const [peupleQuery, setPeupleQuery] = useState('')
  const [peuplesExported, setPeuplesExported] = useState(false)

  const [showEffectsHelp, setShowEffectsHelp] = useState(false)
  const [showCompagnonsHelp, setShowCompagnonsHelp] = useState(false)

  // Voies masquées — accès protégé par mot de passe
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [passwordInput, setPasswordInput] = useState('')
  const [passwordError, setPasswordError] = useState(false)
  const [showPasswordClear, setShowPasswordClear] = useState(false)
  const checkPassword = () => {
    if (passwordInput === MASQUAGE_MOT_DE_PASSE) {
      setShowHidden(true); setShowPasswordModal(false); setPasswordInput(''); setPasswordError(false); setShowPasswordClear(false)
    } else {
      setPasswordError(true)
    }
  }

  // Désélectionner les éléments masqués si on quitte le mode admin
  useEffect(() => {
    if (!showHidden && hiddenVoies.includes(selected)) {
      const visible = voiesList.find(v => !hiddenVoies.includes(v))
      if (visible) setSelected(visible)
    }
  }, [showHidden, hiddenVoies])
  useEffect(() => {
    if (!showHidden && hiddenPeuples.includes(peuples[selectedPeuple]?.label ?? '')) {
      const idx = peuples.findIndex(p => !hiddenPeuples.includes(p.label))
      if (idx >= 0) setSelectedPeuple(idx)
    }
  }, [showHidden, hiddenPeuples])
  useEffect(() => {
    if (!showHidden && hiddenCompagnons.includes(compagnons[selectedCompagnon]?.nom ?? '')) {
      const idx = compagnons.findIndex(c => !hiddenCompagnons.includes(c.nom))
      if (idx >= 0) setSelectedCompagnon(idx)
    }
  }, [showHidden, hiddenCompagnons])

  // Zone en attente (imports individuels)
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([])
  const [previewPendingId, setPreviewPendingId] = useState<string | null>(null)
  const [mergeSelectedRangs, setMergeSelectedRangs] = useState<Set<number>>(new Set())
  const pendingFileRef = useRef<HTMLInputElement>(null)

  // Mobile drawer
  const isMobile = window.innerWidth <= 700
  const [mobileListOpen, setMobileListOpen] = useState(true)
  const touchStartX = useRef<number | null>(null)
  const closeMobileList = () => { if (isMobile) setMobileListOpen(false) }
  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX }
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!isMobile || touchStartX.current === null) return
    if (e.changedTouches[0].clientX - touchStartX.current > 70) setMobileListOpen(true)
    touchStartX.current = null
  }

  const voiesList = useMemo(() =>
    Object.keys(data).sort((a, b) => a.localeCompare(b, 'fr'))
  , [data])

  // Synchronise `selected` si la liste des voies change (chargement async ou ajout/suppression)
  useEffect(() => {
    if (voiesList.length === 0) return
    if (!voiesList.includes(selected)) setSelected(voiesList[0])
  }, [voiesList])

  const allTraits = useMemo(() =>
    traitsRaciaux.map(t => ({ ...t, label: t.nom })).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
  , [traitsRaciaux])


  const filtered = (() => {
    const base = showHidden ? voiesList : voiesList.filter(v => !hiddenVoies.includes(v))
    return query ? base.filter(v => v.toLowerCase().includes(query.toLowerCase())) : base
  })()

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

  const updateEffect = (voie: string, rang: number, effIdx: number, patch: { stat?: string; value?: number | null; formula?: string | null; diceStr?: string | null; minRang?: number | null; avancee?: boolean; rangMultiplier?: boolean | null; condition?: EffectCondition | null }) => {
    setData(prev => {
      const voieData = [...prev[voie]]
      const entry = voieData[rang]
      const effects = [...(entry.effects ?? [])]
      let merged = { ...effects[effIdx], ...patch }
      if (patch.minRang === null)       { const { minRang: _, ...r } = merged; merged = r }
      if (patch.value === null)         { const { value: _, ...r } = merged; merged = r }
      if (patch.formula === null)       { const { formula: _, ...r } = merged; merged = r }
      if (patch.condition === null)      { const { condition: _, ...r } = merged; merged = r }
      if (patch.rangMultiplier === null) { const { rangMultiplier: _, ...r } = merged; merged = r }
      if (patch.diceStr === null)        { const { diceStr: _, ...r } = merged; merged = r }
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

  const updateGrant = (voie: string, rang: number, gIdx: number, patch: { type?: Grant['type']; value?: string | number; voie?: string; rang?: number; voies?: string[]; rangMax?: number; nom?: string; noms?: string[]; remplace?: string; stats?: string[]; formula?: string; rangMultiplier?: boolean; minRang?: number | null; avancee?: boolean | null }) => {
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
            : patch.type === 'VOIE_RANG_CHOIX'
              ? { type: 'VOIE_RANG_CHOIX', voies: [], rangMax: 2, ...av }
              : patch.type === 'COMPAGNON'
              ? { type: 'COMPAGNON', nom: compagnons[0]?.nom ?? '', ...av }
              : patch.type === 'COMPAGNON_CHOIX'
              ? { type: 'COMPAGNON_CHOIX', noms: [], ...av }
              : { type: 'EFFECT_CHOIX', stats: [], value: 1, ...av }
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

  const exportWithPrompt = (payload: unknown, type: 'descriptions' | 'peuples' | 'traits-magiques' | 'compagnons', defaultBase: string, onDone: () => void) => {
    setPromptValue(defaultBase)
    setPromptDialog({
      message: t('descEditor.nomFichierPrompt'),
      defaultValue: defaultBase,
      onConfirm: (input) => {
        const filename = (input.trim() || defaultBase) + '.json'
        const envelope = { _type: type, data: payload }
        const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = filename; a.click()
        URL.revokeObjectURL(url)
        onDone()
      },
    })
  }

  const importFile = (expectedType: 'descriptions' | 'peuples' | 'traits-magiques' | 'compagnons', onImport: (parsed: unknown) => void) => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = '.json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = ev => {
        try {
          const raw = JSON.parse(ev.target?.result as string)
          if (raw && typeof raw === 'object') {
            // Fichier d'élément individuel (voie, trait, peuple) — mauvais bouton
            if ('type' in raw && ['voie', 'trait', 'peuple'].includes((raw as Record<string,unknown>).type as string)) {
              const labelKey = (raw as Record<string,unknown>).type as string
              const labels: Record<string, string> = {
                voie: t('descEditor.importErrContientVoie'),
                trait: t('descEditor.importErrContientTrait'),
                peuple: t('descEditor.importErrContientPeuple'),
              }
              alert(t('descEditor.importErrContientMsg', { label: labels[labelKey] ?? labelKey }))
              return
            }
            if ('_type' in raw && 'data' in raw) {
              if (raw._type !== expectedType) {
                alert(t('descEditor.importErrMauvaisType', { got: raw._type, expected: expectedType }))
                return
              }
              onImport(raw.data)
            } else {
              onImport(raw)
            }
          }
        } catch {
          alert(t('descEditor.importErrJSON'))
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }

  const exportJson = () => exportWithPrompt(data, 'descriptions', 'descriptions', () => setExported(true))

  const updateTrait = (idx: number, patch: Partial<TraitEntry>) => {
    setTraits(prev => prev.map((t, i) => i === idx ? { ...t, ...patch } : t))
    setTraitsExported(false)
  }

  const addTrait = () => {
    setTraits(prev => [...prev, { nom: t('descEditor.nouveauTrait'), desc: '' }])
    setSelectedTrait(traits.length)
    setTraitsExported(false)
  }

  const removeTrait = (idx: number) => {
    setTraits(prev => prev.filter((_, i) => i !== idx))
    setSelectedTrait(i => Math.min(i, traits.length - 2))
    setTraitsExported(false)
  }

  const updateTraitRacial = (idx: number, patch: Partial<TraitEntry>) => {
    setTraitsRaciaux(prev => prev.map((t, i) => i === idx ? { ...t, ...patch } : t))
    setTraitsRaciauxExported(false)
  }
  const addTraitRacial = () => {
    setTraitsRaciaux(prev => [...prev, { nom: t('descEditor.nouveauTraitRacial'), desc: '' }])
    setSelectedTraitRacial(traitsRaciaux.length)
    setTraitsRaciauxExported(false)
  }
  const removeTraitRacial = (idx: number) => {
    setTraitsRaciaux(prev => prev.filter((_, i) => i !== idx))
    setSelectedTraitRacial(i => Math.min(i, traitsRaciaux.length - 2))
    setTraitsRaciauxExported(false)
  }

  const exportTraits = () => exportWithPrompt(traits, 'traits-magiques', 'traits-magiques', () => setTraitsExported(true))

  // Fonctions compagnons
  const updateCompagnon = (idx: number, patch: Partial<typeof compagnons[0]>) => {
    setCompagnons(prev => prev.map((c, i) => i === idx ? { ...c, ...patch } : c))
    setCompagnonsExported(false)
  }

  const addCompagnon = () => {
    setCompagnons(prev => [...prev, {
      nom: t('descEditor.nouveauCompagnon'), for: 0, dex: 0, con: 0, int: 0, sag: 0, cha: 0,
      init: 10, def: 10, pv: 10,
    }])
    setSelectedCompagnon(compagnons.length)
    setCompagnonsExported(false)
  }

  const removeCompagnon = (idx: number) => {
    setCompagnons(prev => prev.filter((_, i) => i !== idx))
    setSelectedCompagnon(i => Math.min(i, compagnons.length - 2))
    setCompagnonsExported(false)
  }

  const exportCompagnons = () => exportWithPrompt(compagnons, 'compagnons', 'compagnons', () => setCompagnonsExported(true))

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
    let nom = t('descEditor.nouvelleVoie')
    let n = 1
    while (data[nom]) { nom = `${t('descEditor.nouvelleVoie')} ${++n}` }
    setData(prev => ({ ...prev, [nom]: emptyRangs() }))
    setVoies(prev => [...prev, { nom, famille: '', categorie: 'profil' }])
    setSelected(nom)
    setExported(false)
  }

  const removeVoie = (nom: string) => {
    setData(prev => { const { [nom]: _, ...rest } = prev; return rest })
    setVoies(prev => prev.filter(v => v.nom !== nom))
    setSelected(voiesList.find(v => v !== nom) ?? '')
    setExported(false)
  }

  const renameVoie = (oldNom: string, newNom: string) => {
    if (!newNom.trim() || newNom === oldNom || data[newNom]) return
    setData(prev => {
      const { [oldNom]: voieData, ...rest } = prev
      return { ...rest, [newNom]: voieData ?? emptyRangs() }
    })
    setVoies(prev => prev.map(v => v.nom === oldNom ? { ...v, nom: newNom } : v))
    setSelected(newNom)
    setExported(false)
  }

  const setVoieFamille = (nom: string, famille: string) => {
    setVoies(prev => prev.map(v => v.nom === nom ? { ...v, famille } : v))
  }

  const setVoieCategorie = (nom: string, categorie: 'profil' | 'prestige') => {
    setVoies(prev => prev.map(v => v.nom === nom ? { ...v, categorie } : v))
    setExported(false)
  }

  // Fonctions peuples
  const addPeuple = () => {
    setPeuples(prev => [...prev, { label: t('descEditor.nouveauPeuple'), cultures: [] }])
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
      ? { ...p, cultures: [...p.cultures, { label: t('descEditor.nouvelleCulture'), voiePeuple: '', voieCulturelle: '', modCaracs: {} }] }
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

  const cloneVoie = () => {
    const base = `${selected} (copie)`
    let n = base; let i = 2; while (data[n]) n = `${base} ${i++}`
    setData(prev => ({ ...prev, [n]: JSON.parse(JSON.stringify(data[selected])) }))
    setVoies(prev => [...prev, { nom: n, famille: voies.find(v => v.nom === selected)?.famille ?? '', categorie: 'profil' as const }])
    setSelected(n)
    setExported(false)
  }

  const cloneTrait = () => {
    const base = `${traits[selectedTrait].nom} (copie)`
    let n = base; let i = 2; while (traits.some(t => t.nom === n)) n = `${base} ${i++}`
    setTraits(prev => [...prev, { ...traits[selectedTrait], nom: n }])
    setSelectedTrait(traits.length)
    setTraitsExported(false)
  }

  const cloneTraitRacial = () => {
    const base = `${traitsRaciaux[selectedTraitRacial].nom} (copie)`
    let n = base; let i = 2; while (traitsRaciaux.some(t => t.nom === n)) n = `${base} ${i++}`
    setTraitsRaciaux(prev => [...prev, { ...traitsRaciaux[selectedTraitRacial], nom: n }])
    setSelectedTraitRacial(traitsRaciaux.length)
    setTraitsRaciauxExported(false)
  }

  const cloneCompagnon = () => {
    const base = `${compagnons[selectedCompagnon].nom} (copie)`
    let n = base; let i = 2; while (compagnons.some(c => c.nom === n)) n = `${base} ${i++}`
    setCompagnons(prev => [...prev, { ...compagnons[selectedCompagnon], nom: n }])
    setSelectedCompagnon(compagnons.length)
    setCompagnonsExported(false)
  }

  const cloneCulture = (pIdx: number, cIdx: number) => {
    const src = peuples[pIdx].cultures[cIdx]
    const base = `${src.label} (copie)`
    let n = base; let i = 2
    while (peuples[pIdx].cultures.some(c => c.label === n)) n = `${base} ${i++}`
    const clone = { ...JSON.parse(JSON.stringify(src)), label: n, voiePeuple: '', voieCulturelle: '' }
    setPeuples(prev => prev.map((p, pi) => pi === pIdx
      ? { ...p, cultures: [...p.cultures, clone] }
      : p
    ))
    setSelectedCulture(peuples[pIdx].cultures.length)
    setPeuplesExported(false)
  }

  const exportPeuples = () => exportWithPrompt(peuples, 'peuples', 'peuples', () => setPeuplesExported(true))

  const exportSingleItem = (payload: unknown, filename: string) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  const safeName = (s: string) => s.replace(/[^a-zA-Z0-9À-ÿ _-]/g, '').trim().replace(/\s+/g, '-')

  const executePrint = (nom: string) => {
    const rangs = data[nom] ?? []
    const famille = voies.find(v => v.nom === nom)?.famille ?? ''
    const FAMILLE_LABELS_PRINT: Record<string, string> = {
      combattants: t('descEditor.familleCombattants'),
      aventuriers: t('descEditor.familleAventuriers'),
      mystiques: t('descEditor.familleMystiques'),
    }
    const familleLabel = famille ? (FAMILLE_LABELS_PRINT[famille] ?? famille) : ''
    const rangsHtml = rangs.map((r, i) =>
      `<div class="tda-rang"><h2 class="tda-h2">${t('descEditor.rangN', { n: i + 1 })}${r.nom ? ` — ${escHtml(r.nom)}` : ''}</h2>${blockToHtml(r.desc)}</div>`
    ).join('')

    const STYLE_ID = 'tda-print-style'
    const ROOT_ID  = 'tda-print-root'
    document.getElementById(STYLE_ID)?.remove()
    document.getElementById(ROOT_ID)?.remove()

    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = `
      @media print {
        body > *:not(#${ROOT_ID}) { display: none !important; }
        #${ROOT_ID} { display: block !important; }
        @page { size: A4; margin: 12mm 16mm; }
      }
      #${ROOT_ID} { display: none; }
      ${PRINT_CSS}
    `
    const root = document.createElement('div')
    root.id = ROOT_ID
    root.innerHTML = `<div class="tda-page"><h1>${escHtml(nom)}</h1>${familleLabel ? `<div class="tda-famille">${escHtml(familleLabel)}</div>` : ''}${rangsHtml}</div>`

    document.head.appendChild(style)
    document.body.appendChild(root)

    const cleanup = () => {
      document.getElementById(STYLE_ID)?.remove()
      document.getElementById(ROOT_ID)?.remove()
      window.removeEventListener('afterprint', cleanup)
    }
    window.addEventListener('afterprint', cleanup)
    window.print()
  }

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
          alert(t('descEditor.importErrFormatGeneral'))
        }
      } catch {
        alert(t('descEditor.importErrFichier'))
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const importSingleTraitRacial = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const raw = JSON.parse(ev.target?.result as string)
        if (raw.type === 'trait-racial' && raw.data?.nom !== undefined) {
          setPendingItems(prev => [...prev, { id: crypto.randomUUID(), type: 'trait-racial', data: raw.data, expanded: false }])
        } else { alert(t('descEditor.importErrFormatType', { type: 'trait-racial' })) }
      } catch { alert(t('descEditor.importErrJSON')) }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const importSingleCompagnon = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const raw = JSON.parse(ev.target?.result as string)
        if (raw.type === 'compagnon' && raw.data?.nom !== undefined) {
          setPendingItems(prev => [...prev, { id: crypto.randomUUID(), type: 'compagnon', data: raw.data, expanded: false }])
        } else { alert(t('descEditor.importErrFormatType', { type: 'compagnon' })) }
      } catch { alert(t('descEditor.importErrJSON')) }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const CARACS = ['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA']

  const renderCompagnonStats = (c: CompanionEntry) => {
    const fmtMod = (n: number) => n >= 0 ? `+${n}` : `${n}`
    const stats: [string, string][] = [
      ['FOR', fmtMod(c.for)], ['DEX', fmtMod(c.dex)], ['CON', fmtMod(c.con)],
      ['INT', fmtMod(c.int)], ['SAG', fmtMod(c.sag)], ['CHA', fmtMod(c.cha)],
      ['Init', String(c.init)], ['DEF', String(c.def)], ['PV', String(c.pv)],
    ]
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {stats.map(([label, val]) => (
            <span key={label} style={{ fontSize: 13, color: S.parchment }}>
              <span style={{ color: S.gold, fontWeight: 600, marginRight: 3 }}>{t(`stats.${label}`, label)}</span>{val}
            </span>
          ))}
        </div>
        {(c.attaque1 || c.attaque2) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {[c.attaque1, c.attaque2].filter(Boolean).map((a, i) => (
              <div key={i} style={{ fontSize: 13, color: S.parchment }}>
                <span style={{ color: S.gold, fontWeight: 600, marginRight: 4 }}>{a!.nom || t('descEditor.compAttaqueN', { n: i+1 })}</span>
                {a!.bonus} — {a!.dm}
              </div>
            ))}
          </div>
        )}
        {c.capacites && <div style={{ fontSize: 13, color: 'rgba(245,236,215,0.65)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{c.capacites}</div>}
      </div>
    )
  }

  const S = {
    gold: 'var(--tdr-gold)',
    parchment: 'var(--tdr-parchment)',
    border: 'rgba(201,168,76,0.25)',
    bg: 'rgba(15,12,8,0.92)',
  }

  return (
    <>
    <input ref={pendingFileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={importPending} />
    <input ref={traitRacialImportRef} type="file" accept=".json" style={{ display: 'none' }} onChange={importSingleTraitRacial} />
    <input ref={compagnonImportRef} type="file" accept=".json" style={{ display: 'none' }} onChange={importSingleCompagnon} />

    {/* Modal de prévisualisation / comparaison d'un élément en attente */}
    {previewPendingId && (() => {
      const item = pendingItems.find(p => p.id === previewPendingId)
      if (!item) return null
      const isDoublon = item.type === 'voie' ? !!data[item.nom]
        : item.type === 'trait' ? traits.some(t => t.nom === item.data.nom)
        : item.type === 'trait-racial' ? traitsRaciaux.some(t => t.nom === item.data.nom)
        : item.type === 'compagnon' ? compagnons.some(c => c.nom === item.data.nom)
        : peuples.some(p => p.label === item.data.label)
      const nomAffiche = item.type === 'voie' ? item.nom
        : item.type === 'peuple' ? item.data.label
        : item.data.nom

      const incorporer = () => {
        if (item.type === 'voie') {
          setData(prev => ({ ...prev, [item.nom]: item.data })); setSelected(item.nom); setExported(false)
        } else if (item.type === 'trait') {
          if (isDoublon) setTraits(prev => prev.map(t => t.nom === item.data.nom ? item.data : t))
          else { setTraits(prev => [...prev, item.data]); setSelectedTrait(traits.length) }
          setTraitsExported(false)
        } else if (item.type === 'trait-racial') {
          if (isDoublon) setTraitsRaciaux(prev => prev.map(t => t.nom === item.data.nom ? item.data : t))
          else { setTraitsRaciaux(prev => [...prev, item.data]); setSelectedTraitRacial(traitsRaciaux.length) }
          setTraitsRaciauxExported(false)
        } else if (item.type === 'compagnon') {
          if (isDoublon) setCompagnons(prev => prev.map(c => c.nom === item.data.nom ? item.data : c))
          else { setCompagnons(prev => [...prev, item.data]); setSelectedCompagnon(compagnons.length) }
          setCompagnonsExported(false)
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
        } else if (item.type === 'trait-racial') {
          let n = `${item.data.nom} (2)`; let i = 3; while (traitsRaciaux.some(t => t.nom === n)) n = `${item.data.nom} (${i++})`
          setTraitsRaciaux(prev => [...prev, { ...item.data, nom: n }]); setSelectedTraitRacial(traitsRaciaux.length); setTraitsRaciauxExported(false)
        } else if (item.type === 'compagnon') {
          let n = `${item.data.nom} (2)`; let i = 3; while (compagnons.some(c => c.nom === n)) n = `${item.data.nom} (${i++})`
          setCompagnons(prev => [...prev, { ...item.data, nom: n }]); setSelectedCompagnon(compagnons.length); setCompagnonsExported(false)
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
          .map(([k, v]) => `${t(`stats.${k}`, k)} ${v > 0 ? '+' : ''}${v}`)
          .join('  ')
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {c.voiePeuple && (
              <div style={{ display: 'flex', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'rgba(245,236,215,0.4)', minWidth: 110, flexShrink: 0 }}>{t('descEditor.voieDuPeuple')}</span>
                <span style={{ fontSize: 13, color: 'rgba(245,236,215,0.75)' }}>{voieName(c.voiePeuple)}</span>
              </div>
            )}
            {c.voieCulturelle && (
              <div style={{ display: 'flex', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'rgba(245,236,215,0.4)', minWidth: 110, flexShrink: 0 }}>{t('descEditor.voieCulturelle')}</span>
                <span style={{ fontSize: 13, color: 'rgba(245,236,215,0.75)' }}>{voieName(c.voieCulturelle)}</span>
              </div>
            )}
            {c.trait?.nom && (
              <div style={{ display: 'flex', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'rgba(245,236,215,0.4)', minWidth: 110, flexShrink: 0 }}>{t('descEditor.traitRacial')}</span>
                <span style={{ fontSize: 13, color: 'rgba(245,236,215,0.75)' }}>{traitRacialName(c.trait.nom)}</span>
              </div>
            )}
            {modStr && (
              <div style={{ display: 'flex', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'rgba(245,236,215,0.4)', minWidth: 110, flexShrink: 0 }}>{t('descEditor.modCaracs')}</span>
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
              <div style={{ fontSize: 14, color: S.gold, fontWeight: 600, marginBottom: 6 }}>{peupleName(c.label)}</div>
              {renderCultureCard(c)}
            </div>
          ))}
          {p.cultures.length === 0 && <div style={{ fontSize: 13, color: 'rgba(245,236,215,0.3)' }}>{t('descEditor.aucuneCulture')}</div>}
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
                {isDoublon && <span style={{ fontSize: 12, background: 'rgba(230,140,40,0.2)', color: 'rgba(230,160,60,0.9)', border: '1px solid rgba(230,140,40,0.4)', borderRadius: 3, padding: '2px 7px' }}>{t('descEditor.DOUBLON')}</span>}
              </div>
              <button onClick={() => setPreviewPendingId(null)} style={{ background: 'none', border: 'none', color: S.parchment, opacity: 0.5, cursor: 'pointer', fontSize: 22, lineHeight: 1 }}>✕</button>
            </div>

            {/* Corps comparaison */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'grid', gridTemplateColumns: isDoublon ? '1fr 1fr' : '1fr', gap: 20 }}>
              {/* Colonne "Actuelle" si doublon */}
              {isDoublon && (
                <div>
                  <div style={{ fontSize: 13, color: S.gold, opacity: 0.7, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10, fontWeight: 600 }}>{t('descEditor.dialogActuelle')}</div>
                  {item.type === 'voie' && data[item.nom]?.map((r, i) => (
                    <div key={i} style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 14, color: S.gold, fontWeight: 600 }}>{t('descEditor.rangN', { n: i+1 })}{r.nom ? ` — ${r.nom}` : ''}</div>
                      <div style={{ fontSize: 13, color: 'rgba(245,236,215,0.65)', whiteSpace: 'pre-wrap', marginTop: 3, lineHeight: 1.6 }}>{r.desc || '—'}</div>
                    </div>
                  ))}
                  {item.type === 'trait' && <div style={{ fontSize: 14, color: S.parchment, whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{traits.find(t => t.nom === item.data.nom)?.desc || '—'}</div>}
                  {item.type === 'trait-racial' && <div style={{ fontSize: 14, color: S.parchment, whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{traitsRaciaux.find(t => t.nom === item.data.nom)?.desc || '—'}</div>}
                  {item.type === 'compagnon' && (() => { const ex = compagnons.find(c => c.nom === item.data.nom); return ex ? renderCompagnonStats(ex) : null })()}
                  {item.type === 'peuple' && renderCulturesPreview(peuples.find(p => p.label === item.data.label) ?? { label: '', cultures: [] })}
                </div>
              )}

              {/* Colonne "Importée" */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ fontSize: 13, color: isDoublon ? 'rgba(100,210,130,0.9)' : S.gold, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>
                    {isDoublon ? t('descEditor.dialogImportee') : t('descEditor.dialogContenu')}
                  </div>
                  {isDoublon && (item.type === 'voie' || item.type === 'peuple') && (() => {
                    const total = item.type === 'voie' ? item.data.length : item.data.cultures.length
                    return (
                      <button
                        onClick={() => setMergeSelectedRangs(mergeSelectedRangs.size === total ? new Set() : new Set(Array.from({ length: total }, (_, i) => i)))}
                        style={{ fontSize: 11, background: 'none', border: `1px solid rgba(100,210,130,0.35)`, borderRadius: 3, color: 'rgba(100,210,130,0.75)', cursor: 'pointer', padding: '2px 8px' }}
                      >
                        {mergeSelectedRangs.size === total ? t('descEditor.toutDeselectionner') : t('descEditor.toutSelectionner')}
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
                            {t('descEditor.rangN', { n: i+1 })}{r.nom ? ` — ${r.nom}` : ''}
                            {isDiff && <span style={{ fontSize: 10, background: 'rgba(100,210,130,0.15)', color: 'rgba(100,210,130,0.8)', border: '1px solid rgba(100,210,130,0.3)', borderRadius: 3, padding: '1px 5px', letterSpacing: '0.04em' }}>{t('descEditor.modifie')}</span>}
                          </div>
                          <div style={{ fontSize: 13, color: 'rgba(245,236,215,0.65)', whiteSpace: 'pre-wrap', marginTop: 3, lineHeight: 1.6 }}>{r.desc || '—'}</div>
                        </div>
                      </label>
                    </div>
                  )
                })}
                {item.type === 'trait' && <div style={{ fontSize: 14, color: S.parchment, whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{item.data.desc || '—'}</div>}
                {item.type === 'trait-racial' && <div style={{ fontSize: 14, color: S.parchment, whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{item.data.desc || '—'}</div>}
                {item.type === 'compagnon' && renderCompagnonStats(item.data)}
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
                                  {peupleName(c.label)}
                                  {isDiff && <span style={{ fontSize: 10, background: 'rgba(100,210,130,0.15)', color: 'rgba(100,210,130,0.8)', border: '1px solid rgba(100,210,130,0.3)', borderRadius: 3, padding: '1px 5px' }}>{exC ? t('descEditor.modifiee') : t('descEditor.nouvelleItem')}</span>}
                                </div>
                                <div style={{ marginTop: 4 }}>
                                  {renderCultureCard(c)}
                                </div>
                              </div>
                            </label>
                          </div>
                        )
                      })}
                      {item.data.cultures.length === 0 && <div style={{ fontSize: 13, color: 'rgba(245,236,215,0.3)' }}>{t('descEditor.aucuneCulture')}</div>}
                    </div>
                  )
                })()}
              </div>
            </div>

            {/* Pied — actions */}
            <div style={{ padding: '14px 22px', borderTop: `1px solid ${S.border}`, display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0, flexWrap: 'wrap' }}>
              {isDoublon && (
                <button onClick={garderDeux} style={{ padding: '7px 18px', borderRadius: 4, fontSize: 14, cursor: 'pointer', border: `1px solid rgba(201,168,76,0.3)`, background: 'transparent', color: S.parchment }}>
                  {t('descEditor.garderLesDeux')}
                </button>
              )}
              {isDoublon && (item.type === 'voie' || item.type === 'peuple') && (() => {
                const count = mergeSelectedRangs.size
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
                    {count === 0 ? t('descEditor.fusionner') : (item.type === 'voie' ? t('descEditor.fusionnerRangs', { count }) : t('descEditor.fusionnerCultures', { count }))}
                  </button>
                )
              })()}
              <button onClick={incorporer} style={{ padding: '7px 18px', borderRadius: 4, fontSize: 14, cursor: 'pointer', border: `1px solid rgba(201,168,76,0.5)`, background: 'rgba(201,168,76,0.15)', color: S.gold, fontWeight: 600 }}>
                {isDoublon ? t('descEditor.toutRemplacer') : t('descEditor.incorporer')}
              </button>
              <button onClick={ignorer} style={{ padding: '7px 18px', borderRadius: 4, fontSize: 14, cursor: 'pointer', border: '1px solid rgba(220,80,80,0.3)', background: 'transparent', color: '#e05555' }}>
                {t('descEditor.ignorer')}
              </button>
            </div>
          </div>
        </div>
      )
    })()}

    {showPasswordModal && (
      <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: 'rgba(18,14,9,0.99)', border: '1px solid rgba(201,168,76,0.4)', borderRadius: 8, padding: '24px 28px', maxWidth: 360, width: '90vw', boxShadow: '0 8px 40px rgba(0,0,0,0.9)', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--tdr-gold)', fontFamily: "'Cinzel', serif" }}>🔒 {t('descEditor.accesVoiesMasquees')}</div>
          <div style={{ fontSize: 13, color: 'rgba(245,236,215,0.65)', lineHeight: 1.6 }}>{t('descEditor.accesVoiesMasqueesDesc')}</div>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              type={showPasswordClear ? 'text' : 'password'}
              value={passwordInput}
              autoFocus
              onChange={e => { setPasswordInput(e.target.value); setPasswordError(false) }}
              onKeyDown={e => e.key === 'Enter' && checkPassword()}
              placeholder={t('descEditor.motDePasse')}
              style={{ padding: '8px 36px 8px 12px', borderRadius: 4, border: `1px solid ${passwordError ? '#c05050' : 'rgba(201,168,76,0.3)'}`, background: 'rgba(255,255,255,0.05)', color: 'rgba(245,236,215,0.9)', fontSize: 14, outline: 'none', fontFamily: 'inherit', width: '100%' }}
            />
            <button
              type="button"
              onClick={() => setShowPasswordClear(v => !v)}
              style={{ position: 'absolute', right: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(245,236,215,0.45)', fontSize: 16, padding: '0 2px', lineHeight: 1 }}
            >
              {showPasswordClear ? '🙈' : '👁'}
            </button>
          </div>
          {passwordError && <div style={{ fontSize: 12, color: '#c05050', marginTop: -8 }}>{t('descEditor.motDePasseIncorrect')}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => { setShowPasswordModal(false); setPasswordInput(''); setPasswordError(false); setShowPasswordClear(false) }} style={{ padding: '7px 18px', borderRadius: 4, cursor: 'pointer', fontSize: 13, border: '1px solid rgba(245,236,215,0.15)', background: 'transparent', color: 'rgba(245,236,215,0.5)', fontFamily: 'inherit' }}>{t('descEditor.annuler')}</button>
            <button onClick={checkPassword} style={{ padding: '7px 18px', borderRadius: 4, cursor: 'pointer', fontSize: 13, fontWeight: 700, border: '1px solid rgba(201,168,76,0.5)', background: 'rgba(201,168,76,0.12)', color: 'var(--tdr-gold)', fontFamily: 'inherit' }}>{t('descEditor.confirmer')}</button>
          </div>
        </div>
      </div>
    )}

    {promptDialog && (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          background: 'rgba(22,17,11,0.99)', border: '1px solid rgba(201,168,76,0.5)',
          borderRadius: 8, padding: '24px 28px', maxWidth: 420, width: '90vw',
          boxShadow: '0 8px 40px rgba(0,0,0,0.9)',
          display: 'flex', flexDirection: 'column', gap: 16,
        }}>
          <div style={{ fontSize: 15, color: '#f5ecd7', lineHeight: 1.5 }}>{promptDialog.message}</div>
          <input
            autoFocus
            value={promptValue}
            onChange={e => setPromptValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { promptDialog.onConfirm(promptValue); setPromptDialog(null) }
              if (e.key === 'Escape') setPromptDialog(null)
            }}
            style={{
              width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(201,168,76,0.4)',
              borderRadius: 5, padding: '7px 10px', fontSize: 14, color: '#f5ecd7',
              outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
            }}
            onFocus={e => (e.target.style.borderColor = 'rgba(201,168,76,0.8)')}
            onBlur={e => (e.target.style.borderColor = 'rgba(201,168,76,0.4)')}
          />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              onClick={() => setPromptDialog(null)}
              style={{
                padding: '6px 18px', borderRadius: 5, cursor: 'pointer', fontSize: 14,
                border: '1px solid rgba(245,236,215,0.2)', background: 'transparent',
                color: 'rgba(245,236,215,0.55)', fontFamily: 'inherit',
              }}
            >{t('descEditor.annuler')}</button>
            <button
              onClick={() => { promptDialog.onConfirm(promptValue); setPromptDialog(null) }}
              style={{
                padding: '6px 18px', borderRadius: 5, cursor: 'pointer', fontSize: 14, fontWeight: 600,
                border: '1px solid rgba(100,200,120,0.6)', background: 'rgba(100,200,120,0.12)',
                color: 'rgba(120,220,140,0.95)', fontFamily: 'inherit',
              }}
            >{t('descEditor.exporter')}</button>
          </div>
        </div>
      </div>
    )}
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
            >{t('descEditor.annuler')}</button>
            <button
              onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(null) }}
              style={confirmDialog.danger === false ? {
                padding: '6px 18px', borderRadius: 5, cursor: 'pointer', fontSize: 14, fontWeight: 600,
                border: '1px solid rgba(100,200,120,0.6)', background: 'rgba(100,200,120,0.12)',
                color: 'rgba(120,220,140,0.95)', fontFamily: 'inherit',
              } : {
                padding: '6px 18px', borderRadius: 5, cursor: 'pointer', fontSize: 14, fontWeight: 600,
                border: '1px solid rgba(200,80,80,0.6)', background: 'rgba(200,80,80,0.15)',
                color: 'rgba(240,120,120,0.95)', fontFamily: 'inherit',
              }}
            >{confirmDialog.label ?? t('descEditor.supprimer')}</button>
          </div>
        </div>
      </div>
    )}
    {showLangNotice && (
      <div style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: 'rgba(18,14,9,0.99)', border: '1px solid rgba(201,168,76,0.5)', borderRadius: 8, padding: '24px 28px', maxWidth: 440, width: '90vw', boxShadow: '0 8px 40px rgba(0,0,0,0.9)', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--tdr-gold)', fontFamily: "'Cinzel', serif" }}>
            ℹ️ {t('descEditor.langNotice.titre')}
          </div>
          <div style={{ fontSize: 13, color: 'rgba(245,236,215,0.75)', lineHeight: 1.7 }}>
            {t('descEditor.langNotice.corps')}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={() => { sessionStorage.setItem(`descEditor_langNotice_${i18n.language.split('-')[0]}`, '1'); setShowLangNotice(false) }}
              style={{ padding: '7px 22px', borderRadius: 4, cursor: 'pointer', fontSize: 13, fontWeight: 700, border: '1px solid rgba(201,168,76,0.5)', background: 'rgba(201,168,76,0.12)', color: 'var(--tdr-gold)', fontFamily: 'inherit' }}
            >{t('descEditor.langNotice.bouton')}</button>
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
        border: isMobile ? 'none' : `1px solid ${S.border}`,
        borderRadius: isMobile ? 0 : 8,
        margin: isMobile ? 0 : '24px auto',
        width: isMobile ? '100%' : '90vw',
        maxWidth: isMobile ? '100%' : 1200,
        height: isMobile ? '100%' : undefined,
        display: 'flex', flexDirection: 'column',
        boxShadow: isMobile ? 'none' : '0 8px 40px rgba(0,0,0,0.9)',
        overflow: 'hidden',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          paddingTop: isMobile ? 'calc(10px + env(safe-area-inset-top))' : '14px',
          paddingBottom: isMobile ? '10px' : '14px',
          paddingLeft: isMobile ? 'calc(12px + env(safe-area-inset-left))' : '20px',
          paddingRight: isMobile ? 'calc(12px + env(safe-area-inset-right))' : '20px',
          borderBottom: `1px solid ${S.border}`,
          flexShrink: 0, gap: 8,
        }}>
          {isMobile && !mobileListOpen && (
            <button onClick={() => setMobileListOpen(true)} style={{
              flexShrink: 0, background: 'none', border: `1px solid ${S.border}`,
              borderRadius: 4, color: S.gold, fontSize: 20, padding: '2px 8px',
              cursor: 'pointer', lineHeight: 1,
            }}>☰</button>
          )}
          <div style={{ display: 'flex', gap: 6, overflowX: isMobile ? 'auto' : undefined, flex: isMobile ? 1 : undefined, WebkitOverflowScrolling: 'touch' }}>
            {(['peuples', 'traitsRaciaux', 'voies', 'traits', 'compagnons'] as const).map(s => (
              <button key={s} onClick={() => { setSection(s); setMobileListOpen(true) }} style={{
                flexShrink: 0,
                padding: isMobile ? '4px 10px' : '4px 14px', borderRadius: 4, fontSize: isMobile ? 14 : 17, cursor: 'pointer',
                border: `1px solid ${S.gold}`,
                background: section === s ? 'rgba(201,168,76,0.2)' : 'transparent',
                color: S.gold, fontWeight: section === s ? 700 : 400,
              }}>
                {s === 'voies' ? t('descEditor.sectionVoies') : s === 'traits' ? t('descEditor.sectionTraits') : s === 'traitsRaciaux' ? t('descEditor.sectionTraitsRaciaux') : s === 'compagnons' ? t('descEditor.sectionCompagnons') : t('descEditor.sectionPeuples')}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            {!isMobile && section === 'voies' && (<>
              <button onClick={exportJson} style={{
                padding: '5px 14px', borderRadius: 4, fontSize: 15, cursor: 'pointer',
                border: `1px solid ${S.gold}`,
                background: exported ? 'rgba(201,168,76,0.2)' : 'rgba(201,168,76,0.1)',
                color: S.gold, fontWeight: 600,
              }}>
                {exported ? t('descEditor.exporte') : t('descEditor.exporter')}
              </button>
              <button onClick={() => importFile('descriptions', v => { setData(v as typeof data); setExported(false) })} style={{
                padding: '5px 14px', borderRadius: 4, fontSize: 15, cursor: 'pointer',
                border: `1px solid ${S.border}`, background: 'transparent', color: S.parchment,
              }}>{t('descEditor.importer')}</button>
            </>)}
            {!isMobile && section === 'traits' && (<>
              <button onClick={exportTraits} style={{
                padding: '5px 14px', borderRadius: 4, fontSize: 15, cursor: 'pointer',
                border: `1px solid ${S.gold}`,
                background: traitsExported ? 'rgba(201,168,76,0.2)' : 'rgba(201,168,76,0.1)',
                color: S.gold, fontWeight: 600,
              }}>
                {traitsExported ? t('descEditor.exporte') : t('descEditor.exporter')}
              </button>
              <button onClick={() => importFile('traits-magiques', v => { setTraits(v as typeof traits); setTraitsExported(false) })} style={{
                padding: '5px 14px', borderRadius: 4, fontSize: 15, cursor: 'pointer',
                border: `1px solid ${S.border}`, background: 'transparent', color: S.parchment,
              }}>{t('descEditor.importer')}</button>
            </>)}
            {!isMobile && section === 'traitsRaciaux' && (<>
              <button onClick={() => exportWithPrompt(traitsRaciaux, 'traits-magiques', 'traits-raciaux', () => setTraitsRaciauxExported(true))} style={{
                padding: '5px 14px', borderRadius: 4, fontSize: 15, cursor: 'pointer',
                border: `1px solid ${S.gold}`,
                background: traitsRaciauxExported ? 'rgba(201,168,76,0.2)' : 'rgba(201,168,76,0.1)',
                color: S.gold, fontWeight: 600,
              }}>
                {traitsRaciauxExported ? t('descEditor.exporte') : t('descEditor.exporter')}
              </button>
              <button onClick={() => importFile('traits-magiques', v => { setTraitsRaciaux(v as typeof traitsRaciaux); setTraitsRaciauxExported(false) })} style={{
                padding: '5px 14px', borderRadius: 4, fontSize: 15, cursor: 'pointer',
                border: `1px solid ${S.border}`, background: 'transparent', color: S.parchment,
              }}>{t('descEditor.importer')}</button>
            </>)}
            {!isMobile && section === 'compagnons' && (<>
              <button onClick={exportCompagnons} style={{
                padding: '5px 14px', borderRadius: 4, fontSize: 15, cursor: 'pointer',
                border: `1px solid ${S.gold}`,
                background: compagnonsExported ? 'rgba(201,168,76,0.2)' : 'rgba(201,168,76,0.1)',
                color: S.gold, fontWeight: 600,
              }}>
                {compagnonsExported ? t('descEditor.exporte') : t('descEditor.exporter')}
              </button>
              <button onClick={() => importFile('compagnons', v => { setCompagnons(v as typeof compagnons); setCompagnonsExported(false) })} style={{
                padding: '5px 14px', borderRadius: 4, fontSize: 15, cursor: 'pointer',
                border: `1px solid ${S.border}`, background: 'transparent', color: S.parchment,
              }}>{t('descEditor.importer')}</button>
            </>)}
            {!isMobile && section === 'peuples' && (<>
              <button onClick={exportPeuples} style={{
                padding: '5px 14px', borderRadius: 4, fontSize: 15, cursor: 'pointer',
                border: `1px solid ${S.gold}`,
                background: peuplesExported ? 'rgba(201,168,76,0.2)' : 'rgba(201,168,76,0.1)',
                color: S.gold, fontWeight: 600,
              }}>
                {peuplesExported ? t('descEditor.exporte') : t('descEditor.exporter')}
              </button>
              <button onClick={() => importFile('peuples', v => { setPeuples(v as typeof peuples); setPeuplesExported(false) })} style={{
                padding: '5px 14px', borderRadius: 4, fontSize: 15, cursor: 'pointer',
                border: `1px solid ${S.border}`, background: 'transparent', color: S.parchment,
              }}>{t('descEditor.importer')}</button>
            </>)}
            {!isMobile && (
              <button onClick={openDataDir} title={t('descEditor.donneesTitle')} style={{
                padding: '5px 10px', borderRadius: 4, fontSize: 14, cursor: 'pointer',
                border: `1px solid ${S.border}`, background: 'transparent',
                color: 'rgba(245,236,215,0.55)',
              }}>{t('descEditor.donneesBtn')}</button>
            )}
            <button onClick={onClose} style={{
              background: 'none', border: 'none', color: S.parchment,
              opacity: 0.5, cursor: 'pointer', fontSize: 20, lineHeight: 1,
            }}>✕</button>
          </div>
        </div>

        {/* Corps */}
        <div
          style={{ display: 'flex', flex: 1, overflow: 'hidden', position: isMobile ? 'relative' : undefined }}
          onTouchStart={isMobile ? handleTouchStart : undefined}
          onTouchEnd={isMobile ? handleTouchEnd : undefined}
        >
          {/* Scrim mobile — ferme le drawer en tapant à côté */}
          {isMobile && mobileListOpen && (
            <div onClick={() => setMobileListOpen(false)} style={{
              position: 'absolute', inset: 0, zIndex: 4,
              background: 'rgba(0,0,0,0.45)',
            }} />
          )}

          {section === 'voies' ? (<>
            {/* Colonne voies */}
            <div style={isMobile ? {
              position: 'absolute', top: 0, left: 0, bottom: 0, zIndex: 5,
              width: 'min(85vw, 340px)', background: 'rgba(18,14,9,0.99)',
              borderRight: `1px solid ${S.border}`, display: 'flex', flexDirection: 'column',
              transform: mobileListOpen ? 'translateX(0)' : 'translateX(-100%)',
              transition: 'transform 0.25s ease',
              boxShadow: mobileListOpen ? '4px 0 24px rgba(0,0,0,0.7)' : 'none',
            } : {
              width: 'max-content', minWidth: 380, flexShrink: 0,
              borderRight: `1px solid ${S.border}`, display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ padding: '10px 12px', borderBottom: `1px solid ${S.border}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input
                  type="text"
                  placeholder={t('descEditor.rechercher')}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  style={{
                    width: '100%', background: S.bg, border: `1px solid ${S.border}`,
                    borderRadius: 4, padding: '5px 8px', fontSize: 17,
                    color: S.parchment, outline: 'none', boxSizing: 'border-box',
                  }}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={addVoie} style={{
                    flex: 1, padding: '5px 8px', borderRadius: 4, fontSize: 14, cursor: 'pointer',
                    border: `1px solid ${S.border}`, background: 'rgba(201,168,76,0.07)',
                    color: S.gold, boxSizing: 'border-box',
                  }}>{t('descEditor.btnNouvelleVoie')}</button>
                  <button onClick={() => pendingFileRef.current?.click()} style={{
                    flex: 1, padding: '5px 8px', borderRadius: 4, fontSize: 14, cursor: 'pointer',
                    border: `1px solid ${S.border}`, background: 'transparent',
                    color: 'rgba(201,168,76,0.6)', boxSizing: 'border-box',
                  }}>{t('descEditor.btnImporterVoie')}</button>
                </div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {filtered.map(voie => (
                  <div key={voie} onClick={() => { setSelected(voie); closeMobileList() }} className="voie-list-item" style={{
                    padding: '7px 12px', fontSize: 17, cursor: 'pointer',
                    color: selected === voie ? S.gold : S.parchment,
                    background: selected === voie ? 'rgba(201,168,76,0.1)' : 'transparent',
                    borderLeft: selected === voie ? `3px solid ${S.gold}` : '3px solid transparent',
                    transition: 'all 0.1s', whiteSpace: 'nowrap',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
                  }}>
                    <span style={{ flex: 1, opacity: hiddenVoies.includes(voie) ? 0.4 : 1 }}>
                      {voieName(voie)}
                      {voies.find(v => v.nom === voie)?.categorie === 'prestige' && (
                        <span style={{ color: 'rgba(210,170,255,0.7)', marginLeft: 5, fontSize: 13 }}>★</span>
                      )}
                    </span>
                    {hiddenVoies.includes(voie) && (
                      <span style={{ fontSize: 10, color: 'rgba(255,160,50,0.7)', background: 'rgba(255,160,50,0.1)', padding: '1px 5px', borderRadius: 3, whiteSpace: 'nowrap' }}>
                        {t('descEditor.masquee')}
                      </span>
                    )}
                    <button
                      className="voie-delete-btn"
                      onClick={e => { e.stopPropagation(); exportSingleItem({ type: 'voie', nom: voie, data: data[voie] }, `voie-${safeName(voie)}.json`) }}
                      style={{
                        background: 'none', border: 'none', color: 'rgba(201,168,76,0.9)', cursor: 'pointer',
                        fontSize: 15, fontWeight: 700, padding: '0 3px', lineHeight: 1, opacity: 0, transition: 'opacity 0.15s',
                      }}
                      title={t('descEditor.exporterVoieTitle')}
                    >↓</button>
                    <button
                      className="voie-delete-btn"
                      onClick={e => { e.stopPropagation(); askConfirm(t('descEditor.confirmSupprimerVoie', { nom: voie }), () => removeVoie(voie)) }}
                      style={{
                        background: 'none', border: 'none', color: '#c05050', cursor: 'pointer',
                        fontSize: 14, padding: '0 2px', lineHeight: 1, opacity: 0, transition: 'opacity 0.15s',
                      }}
                      title={t('descEditor.supprimerVoieTitle')}
                    >✕</button>
                  </div>
                ))}
              </div>
              {/* Bouton accès voies masquées */}
              <div style={{ borderTop: '1px solid rgba(201,168,76,0.1)', padding: '6px 10px', flexShrink: 0 }}>
                <button
                  onClick={() => showHidden ? setShowHidden(false) : setShowPasswordModal(true)}
                  style={{
                    width: '100%', padding: '5px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer',
                    border: `1px solid ${showHidden ? 'rgba(255,160,50,0.4)' : 'rgba(201,168,76,0.15)'}`,
                    background: showHidden ? 'rgba(255,160,50,0.08)' : 'transparent',
                    color: showHidden ? 'rgba(255,160,50,0.8)' : 'rgba(245,236,215,0.3)',
                    textAlign: 'left',
                  }}
                >
                  {showHidden
                    ? `🔓 ${t('descEditor.masquageActif')} (${hiddenVoies.length})`
                    : hiddenVoies.length > 0
                      ? `🔒 ${t('descEditor.voiesMasquees', { count: hiddenVoies.length })}`
                      : `🔒 ${t('descEditor.masquer')}`
                  }
                </button>
              </div>
              {/* Zone en attente — voies */}
              {pendingItems.some(p => p.type === 'voie') && (
                <div style={{ borderTop: `2px solid rgba(201,168,76,0.4)`, flexShrink: 0 }}>
                  <div style={{ padding: '6px 14px', fontSize: 12, color: S.gold, opacity: 0.8, letterSpacing: '0.1em', textTransform: 'uppercase', background: 'rgba(201,168,76,0.07)', fontWeight: 600 }}>
                    {t('descEditor.enAttente')} ({pendingItems.filter(p => p.type === 'voie').length})
                  </div>
                  <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                    {pendingItems.filter(p => p.type === 'voie').map(item => {
                      if (item.type !== 'voie') return null
                      const isDoublon = !!data[item.nom]
                      return (
                        <div key={item.id} style={{ padding: '8px 12px', borderBottom: `1px solid rgba(201,168,76,0.1)` }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                            {isDoublon && <span style={{ fontSize: 11, background: 'rgba(230,140,40,0.2)', color: 'rgba(230,160,60,0.9)', border: '1px solid rgba(230,140,40,0.4)', borderRadius: 3, padding: '1px 5px', letterSpacing: '0.04em', flexShrink: 0 }}>{t('descEditor.doublon')}</span>}
                            <span style={{ fontSize: 14, color: S.parchment, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.nom}</span>
                            <button onClick={() => openPreview(item.id)} style={{ background: 'none', border: 'none', color: S.gold, cursor: 'pointer', fontSize: 15, padding: '0 3px', opacity: 0.8, flexShrink: 0 }} title={t('descEditor.apercuComparaisonTitle')}>🔍</button>
                          </div>
                          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                            <button onClick={() => { setData(prev => ({ ...prev, [item.nom]: item.data })); setPendingItems(prev => prev.filter(p => p.id !== item.id)); setSelected(item.nom); setExported(false) }}
                              style={{ padding: '3px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer', border: `1px solid rgba(201,168,76,0.4)`, background: 'rgba(201,168,76,0.12)', color: S.gold }}>
                              {isDoublon ? t('descEditor.remplacer') : t('descEditor.incorporer')}
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
                value={editingName}
                onChange={e => setEditingName(e.target.value)}
                onBlur={e => {
                  if (editingName.trim() && editingName !== selected) renameVoie(selected, editingName)
                  else setEditingName(selected)
                  e.target.style.borderColor = S.border
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') { (e.target as HTMLInputElement).blur() }
                  if (e.key === 'Escape') { setEditingName(selected); (e.target as HTMLInputElement).blur() }
                }}
                style={{
                  fontSize: 17, fontFamily: "'Cinzel', serif", color: S.gold,
                  background: S.bg, border: `1px solid ${S.border}`, borderRadius: 4,
                  padding: '4px 10px', outline: 'none', width: '100%', boxSizing: 'border-box',
                }}
                onFocus={e => (e.target.style.borderColor = 'rgba(201,168,76,0.6)')}
              />
              {(() => {
                const famille = voies.find(v => v.nom === selected)?.famille ?? ''
                const categorie = voies.find(v => v.nom === selected)?.categorie ?? 'profil'
                const isPrestige = categorie === 'prestige'
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: S.gold, opacity: 0.7, letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0 }}>
                      {t('descEditor.famille')}
                    </span>
                    <select
                      value={famille}
                      onChange={e => setVoieFamille(selected, e.target.value)}
                      style={{
                        background: S.bg, border: `1px solid ${S.border}`, borderRadius: 4,
                        color: S.parchment, fontSize: 14, padding: '3px 8px', outline: 'none', cursor: 'pointer',
                      }}
                    >
                      <option value="">{t('descEditor.familleAucune')}</option>
                      <option value="combattants">{t('descEditor.familleCombattants')}</option>
                      <option value="aventuriers">{t('descEditor.familleAventuriers')}</option>
                      <option value="mystiques">{t('descEditor.familleMystiques')}</option>
                    </select>
                    <button
                      onClick={() => setVoieCategorie(selected, isPrestige ? 'profil' : 'prestige')}
                      title={isPrestige ? t('descEditor.categoriePrestige') : t('descEditor.categorieProfil')}
                      style={{
                        padding: '3px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer',
                        border: `1px solid ${isPrestige ? 'rgba(180,130,255,0.5)' : 'rgba(201,168,76,0.2)'}`,
                        background: isPrestige ? 'rgba(180,130,255,0.12)' : 'transparent',
                        color: isPrestige ? 'rgba(210,170,255,0.9)' : 'rgba(245,236,215,0.35)',
                        fontFamily: "'Cinzel', serif", letterSpacing: '0.06em', flexShrink: 0,
                      }}
                    >
                      {t('descEditor.categoriePrestige')} ★
                    </button>
                    <button
                      onClick={() => setHiddenVoies(prev =>
                        prev.includes(selected) ? prev.filter(v => v !== selected) : [...prev, selected]
                      )}
                      title={hiddenVoies.includes(selected) ? t('descEditor.rendreVisible') : t('descEditor.masquer')}
                      style={{
                        padding: '4px 10px', borderRadius: 4, fontSize: 15,
                        cursor: 'pointer',
                        border: '1px solid rgba(201,168,76,0.25)',
                        background: 'transparent',
                        color: hiddenVoies.includes(selected) ? 'rgba(255,160,50,0.55)' : 'rgba(245,236,215,0.85)',
                        flexShrink: 0,
                        position: 'relative', overflow: 'hidden',
                      }}
                    >
                      👁
                      {hiddenVoies.includes(selected) && (
                        <span style={{ position: 'absolute', top: '50%', left: '-8px', right: '-8px', height: '2px', background: 'currentColor', transform: 'rotate(-35deg)', transformOrigin: 'center', pointerEvents: 'none' }} />
                      )}
                    </button>
                    <button
                      onClick={cloneVoie}
                      title={t('descEditor.cloneVoieTitle')}
                      style={{
                        padding: '4px 10px', borderRadius: 4, fontSize: 15,
                        cursor: 'pointer', border: `1px solid rgba(201,168,76,0.35)`,
                        background: 'transparent', color: 'rgba(201,168,76,0.7)',
                        flexShrink: 0,
                      }}
                    >⎘</button>
                    <button
                      onClick={() => setPrintPreviewNom(selected)}
                      title={t('descEditor.imprimerTitle')}
                      style={{
                        padding: '4px 10px', borderRadius: 4, fontSize: 15,
                        cursor: 'pointer', border: `1px solid ${S.border}`,
                        background: 'transparent', color: 'rgba(245,236,215,0.55)',
                        flexShrink: 0,
                      }}
                    >🖨</button>
                  </div>
                )
              })()}
              {[0,1,2,3,4].map(i => (
                <div key={i} style={{ borderTop: i === 0 ? 'none' : '1px dashed rgba(201,168,76,0.35)', paddingTop: i === 0 ? 0 : 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 14, color: S.gold, opacity: 0.7, letterSpacing: '0.08em', flexShrink: 0 }}>
                      {t('descEditor.rang', { n: i + 1 })}
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
                      { label: 'G', title: t('descEditor.formatGras'), before: '**', after: '**', style: { fontWeight: 700 } },
                      { label: 'I', title: t('descEditor.formatItalique'), before: '*', after: '*', style: { fontStyle: 'italic' } },
                      { label: '◆', title: t('descEditor.formatOr'), before: '==', after: '==', style: { color: 'var(--tdr-gold)' } },
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
                      <div key={ei} style={{ marginBottom: 6, border: '1px solid rgba(201,168,76,0.18)', borderRadius: 4, padding: '6px 8px', background: 'rgba(201,168,76,0.03)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
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
                          {t('descEditor.formulaire')}
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
                            <span style={{ fontSize: 13, color: S.parchment, opacity: 0.5 }}>{t('descEditor.valeurLabel')}</span>
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
                        <span style={{ fontSize: 13, color: S.parchment, opacity: 0.5 }}>{t('descEditor.desLabel')}</span>
                        <input
                          type="text"
                          placeholder="ex: 1d6"
                          value={eff.diceStr ?? ''}
                          onChange={e => updateEffect(selected, i, ei, { diceStr: e.target.value || null })}
                          style={{
                            width: 56, background: S.bg, border: `1px solid ${S.border}`, borderRadius: 3,
                            padding: '2px 4px', fontSize: 13, color: S.parchment, outline: 'none', textAlign: 'center',
                          }}
                        />
                        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'rgba(180,220,140,0.85)', cursor: 'pointer', userSelect: 'none' }}>
                          <input
                            type="checkbox"
                            checked={!!eff.rangMultiplier}
                            onChange={e => updateEffect(selected, i, ei, { rangMultiplier: e.target.checked || null })}
                            style={{ accentColor: 'rgba(180,220,140,0.85)', cursor: 'pointer' }}
                          />
                          {t('descEditor.xRang')}
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: S.parchment, cursor: 'pointer', userSelect: 'none' }}>
                          <input
                            type="checkbox"
                            checked={eff.minRang !== undefined}
                            onChange={e => updateEffect(selected, i, ei, { minRang: e.target.checked ? (i + 1) : null })}
                            style={{ accentColor: S.gold, cursor: 'pointer' }}
                          />
                          {t('descEditor.actifRang')}
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
                          {t('descEditor.avancee')}
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
                          {t('descEditor.si')}
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
                            <option value="hasBouclier">{t('descEditor.condBouclier')}</option>
                            <option value="hasArme">{t('descEditor.condArme')}</option>
                            <option value="noArme">{t('descEditor.condSansArme')}</option>
                          </select>
                        )}
                        <button
                          onClick={() => removeEffect(selected, i, ei)}
                          title={t('descEditor.supprimerEffetTitle')}
                          style={{
                            padding: '2px 7px', borderRadius: 3, fontSize: 13, cursor: 'pointer',
                            border: '1px solid rgba(220,80,80,0.35)', background: 'transparent', color: '#e05555', marginLeft: 'auto',
                          }}
                        >🗑</button>
                      </div>
                      {eff.condition?.type === 'hasArme' && (() => {

                        const cond = eff.condition as { type: 'hasArme'; armes: string[] }
                        return (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', marginTop: 6 }}>
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
                              <option value="">{t('descEditor.ajouterArme')}</option>
                              {armesList.filter(a => !cond.armes.includes(a)).map(a => <option key={a} value={a}>{a}</option>)}
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
                      <div key={gi} style={{ marginBottom: 6, border: '1px solid rgba(201,168,76,0.18)', borderRadius: 4, padding: '6px 8px', background: 'rgba(201,168,76,0.03)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <select
                            value={grant.type}
                            onChange={e => updateGrant(selected, i, gi, { type: e.target.value as Grant['type'] })}
                            style={{
                              background: S.bg, border: `1px solid ${S.border}`, borderRadius: 3,
                              padding: '2px 4px', fontSize: 13, color: S.gold, outline: 'none', cursor: 'pointer',
                            }}
                          >
                            <option value="FORMATION">{t('descEditor.grantFormation')}</option>
                            <option value="VOIE_RANG">{t('descEditor.grantVoieRangFixe')}</option>
                            <option value="VOIE_RANG_CHOIX">{t('descEditor.grantVoieRangChoix')}</option>
                            <option value="COMPAGNON">{t('descEditor.grantCompagnonFixe')}</option>
                            <option value="COMPAGNON_CHOIX">{t('descEditor.grantCompagnonChoix')}</option>
                            <option value="EFFECT_CHOIX">{t('descEditor.grantEffectChoix')}</option>
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
                              {FORMATIONS.map(f => <option key={f} value={f}>{t(`descEditor.formationNames.${f}`, f)}</option>)}
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
                                {voiesList.map(v => <option key={v} value={v}>{voieName(v)}</option>)}
                              </select>
                              <span style={{ fontSize: 13, color: S.parchment, opacity: 0.5 }}>{t('descEditor.rangLabel')}</span>
                              <input
                                type="number" min={1} max={5} value={grant.rang}
                                onChange={e => updateGrant(selected, i, gi, { type: 'VOIE_RANG', voie: grant.voie, rang: Math.min(5, Math.max(1, parseInt(e.target.value) || 1)) })}
                                style={{ width: 40, background: S.bg, border: `1px solid ${S.border}`, borderRadius: 3, padding: '2px 4px', fontSize: 13, color: S.gold, outline: 'none', textAlign: 'center' }}
                              />
                            </>
                          )}

                          {grant.type === 'VOIE_RANG_CHOIX' && (
                            <>
                              <span style={{ fontSize: 13, color: S.parchment, opacity: 0.5 }}>{t('descEditor.rangMaxLabel')}</span>
                              <input
                                type="number" min={1} max={5} value={grant.rangMax}
                                onChange={e => updateGrant(selected, i, gi, { type: 'VOIE_RANG_CHOIX', voies: grant.voies, rangMax: Math.min(5, Math.max(1, parseInt(e.target.value) || 1)) })}
                                style={{ width: 40, background: S.bg, border: `1px solid ${S.border}`, borderRadius: 3, padding: '2px 4px', fontSize: 13, color: S.gold, outline: 'none', textAlign: 'center' }}
                              />
                            </>
                          )}

                          {grant.type === 'COMPAGNON' && (<>
                            <select
                              value={grant.nom}
                              onChange={e => updateGrant(selected, i, gi, { type: 'COMPAGNON', nom: e.target.value })}
                              style={{ background: S.bg, border: `1px solid ${S.border}`, borderRadius: 3, padding: '2px 4px', fontSize: 13, color: S.parchment, outline: 'none', cursor: 'pointer', maxWidth: 200 }}
                            >
                              {compagnons.map(c => <option key={c.nom} value={c.nom}>{compagnonName(c.nom)}</option>)}
                            </select>
                            <span style={{ fontSize: 12, color: 'rgba(245,236,215,0.4)' }}>{t('descEditor.remplacePar')}</span>
                            <select
                              value={grant.remplace ?? ''}
                              onChange={e => updateGrant(selected, i, gi, { type: 'COMPAGNON', nom: grant.nom, remplace: e.target.value || undefined })}
                              style={{ background: S.bg, border: `1px solid ${S.border}`, borderRadius: 3, padding: '2px 4px', fontSize: 13, color: grant.remplace ? S.parchment : 'rgba(245,236,215,0.3)', outline: 'none', cursor: 'pointer', maxWidth: 160 }}
                            >
                              <option value="">{t('descEditor.aucunRemplace')}</option>
                              {compagnons.filter(c => c.nom !== grant.nom).map(c => <option key={c.nom} value={c.nom}>{compagnonName(c.nom)}</option>)}
                            </select>
                          </>)}

                          {grant.type === 'COMPAGNON_CHOIX' && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                              {grant.noms.map((n, ni) => (
                                <span key={ni} style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'rgba(201,168,76,0.12)', border: `1px solid ${S.border}`, borderRadius: 3, padding: '1px 6px', fontSize: 12, color: S.parchment }}>
                                  {compagnonName(n)}
                                  <button
                                    onClick={() => updateGrant(selected, i, gi, { type: 'COMPAGNON_CHOIX', noms: grant.noms.filter((_, j) => j !== ni) })}
                                    style={{ background: 'none', border: 'none', color: '#e05555', cursor: 'pointer', padding: '0 2px', fontSize: 11, lineHeight: 1 }}
                                  >✕</button>
                                </span>
                              ))}
                              <select
                                value=""
                                onChange={e => {
                                  if (!e.target.value || grant.noms.includes(e.target.value)) return
                                  updateGrant(selected, i, gi, { type: 'COMPAGNON_CHOIX', noms: [...grant.noms, e.target.value] })
                                }}
                                style={{ background: S.bg, border: `1px solid ${S.border}`, borderRadius: 3, padding: '1px 4px', fontSize: 12, color: S.gold, outline: 'none', cursor: 'pointer' }}
                              >
                                <option value="">{t('descEditor.ajouterCompagnonPlus')}</option>
                                {compagnons.filter(c => !grant.noms.includes(c.nom)).map(c => <option key={c.nom} value={c.nom}>{compagnonName(c.nom)}</option>)}
                              </select>
                            </div>
                          )}

                          {grant.type === 'EFFECT_CHOIX' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                                <span style={{ fontSize: 12, color: S.parchment, opacity: 0.6 }}>{t('descEditor.effectChoixStats')}</span>
                                {grant.stats.map((s, si) => (
                                  <span key={si} style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'rgba(201,168,76,0.12)', border: `1px solid ${S.border}`, borderRadius: 3, padding: '1px 6px', fontSize: 12, color: S.gold }}>
                                    {s}
                                    <button
                                      onClick={() => updateGrant(selected, i, gi, { stats: grant.stats.filter((_, j) => j !== si) })}
                                      style={{ background: 'none', border: 'none', color: '#e05555', cursor: 'pointer', padding: '0 2px', fontSize: 11, lineHeight: 1 }}
                                    >✕</button>
                                  </span>
                                ))}
                                <select
                                  value=""
                                  onChange={e => {
                                    if (!e.target.value || grant.stats.includes(e.target.value)) return
                                    updateGrant(selected, i, gi, { stats: [...grant.stats, e.target.value] })
                                  }}
                                  style={{ background: S.bg, border: `1px solid ${S.border}`, borderRadius: 3, padding: '1px 4px', fontSize: 12, color: S.gold, outline: 'none', cursor: 'pointer' }}
                                >
                                  <option value="">+ stat</option>
                                  {STATS.filter(s => !grant.stats.includes(s)).map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontSize: 12, color: S.parchment, opacity: 0.6 }}>{t('descEditor.effectChoixValeur')}</span>
                                {grant.formula !== undefined ? (
                                  <select
                                    value={grant.formula ?? ''}
                                    onChange={e => updateGrant(selected, i, gi, { formula: e.target.value })}
                                    style={{ background: S.bg, border: `1px solid ${S.border}`, borderRadius: 3, padding: '2px 4px', fontSize: 12, color: S.parchment, outline: 'none', cursor: 'pointer' }}
                                  >
                                    {FORMULAS.map(f => <option key={f} value={f}>{f}</option>)}
                                  </select>
                                ) : (
                                  <input
                                    type="number"
                                    value={grant.value ?? 1}
                                    onChange={e => updateGrant(selected, i, gi, { value: parseInt(e.target.value) || 1 })}
                                    style={{ width: 48, background: S.bg, border: `1px solid ${S.border}`, borderRadius: 3, padding: '2px 4px', fontSize: 12, color: S.gold, outline: 'none', textAlign: 'center' }}
                                  />
                                )}
                                <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, color: S.parchment, cursor: 'pointer', userSelect: 'none' }}>
                                  <input
                                    type="checkbox"
                                    checked={grant.formula !== undefined}
                                    onChange={e => updateGrant(selected, i, gi, e.target.checked ? { formula: FORMULAS[0], value: undefined } : { formula: undefined, value: 1 })}
                                    style={{ accentColor: S.gold, cursor: 'pointer' }}
                                  />
                                  {t('descEditor.formulaire')}
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, color: S.parchment, cursor: 'pointer', userSelect: 'none' }}>
                                  <input
                                    type="checkbox"
                                    checked={!!grant.rangMultiplier}
                                    onChange={e => updateGrant(selected, i, gi, { rangMultiplier: e.target.checked || undefined })}
                                    style={{ accentColor: S.gold, cursor: 'pointer' }}
                                  />
                                  {t('descEditor.xRang')}
                                </label>
                              </div>
                            </div>
                          )}

                          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: S.parchment, cursor: 'pointer', userSelect: 'none' }}>
                            <input
                              type="checkbox"
                              checked={grant.minRang !== undefined}
                              onChange={e => updateGrant(selected, i, gi, { minRang: e.target.checked ? (i + 1) : null })}
                              style={{ accentColor: S.gold, cursor: 'pointer' }}
                            />
                            {t('descEditor.actifRang')}
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
                            {t('descEditor.avancee')}
                          </label>
                          <button
                            onClick={() => removeGrant(selected, i, gi)}
                            title={t('descEditor.supprimerAccesTitle')}
                            style={{ padding: '2px 7px', borderRadius: 3, fontSize: 13, cursor: 'pointer', border: '1px solid rgba(220,80,80,0.35)', background: 'transparent', color: '#e05555', marginLeft: 'auto' }}
                          >🗑</button>
                        </div>

                        {/* Liste des voies pour VOIE_RANG_CHOIX */}
                        {grant.type === 'VOIE_RANG_CHOIX' && (
                          <div style={{ marginTop: 4, marginLeft: 16, display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                            {grant.voies.map((v, vi) => (
                              <span key={vi} style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'rgba(201,168,76,0.12)', border: `1px solid ${S.border}`, borderRadius: 3, padding: '1px 6px', fontSize: 12, color: S.parchment }}>
                                {voieName(v)}
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
                              <option value="">{t('descEditor.ajouterVoiePlus')}</option>
                              {VOIES_INIT.filter(v => !grant.voies.includes(v)).map(v => <option key={v} value={v}>{voieName(v)}</option>)}
                            </select>
                          </div>
                        )}
                      </div>
                    )

                    return (
                      <div style={{ marginTop: 8, border: `1px solid rgba(201,168,76,0.45)`, borderRadius: 5, padding: '8px 10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                          <span style={{ fontSize: 12, color: S.gold, opacity: 0.6, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                            {t('descEditor.effets')}
                          </span>
                          <button
                            onClick={() => setShowEffectsHelp(v => !v)}
                            title={t('descEditor.effetsAideTitle')}
                            style={{
                              width: 18, height: 18, borderRadius: '50%', border: `1px solid rgba(201,168,76,0.45)`,
                              background: showEffectsHelp ? 'rgba(201,168,76,0.2)' : 'transparent',
                              color: 'rgba(201,168,76,0.7)', fontSize: 11, fontWeight: 700,
                              cursor: 'pointer', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >i</button>
                        </div>
                        {showEffectsHelp && (
                          <div style={{
                            marginBottom: 10, padding: '10px 12px', borderRadius: 4,
                            background: 'rgba(201,168,76,0.05)', border: `1px solid rgba(201,168,76,0.2)`,
                            fontSize: 12, color: 'rgba(245,236,215,0.75)', lineHeight: 1.6,
                            display: 'flex', flexDirection: 'column', gap: 8,
                          }}>
                            <div style={{ fontWeight: 700, color: S.gold, fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                              {t('descEditor.effetsAideTitre')}
                            </div>
                            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
                              <tbody>
                                {[
                                  ['Stat', t('descEditor.effetsAideStat')],
                                  [t('descEditor.formulaire'), t('descEditor.effetsAideFormule')],
                                  [t('descEditor.valeurLabel').replace(' :', ''), t('descEditor.effetsAideValeur')],
                                  [t('descEditor.desLabel').replace(' :', ''), t('descEditor.effetsAideDes')],
                                  [t('descEditor.xRang'), t('descEditor.effetsAideXRang')],
                                  [t('descEditor.actifRang').replace(' :', ''), t('descEditor.effetsAideActifRang')],
                                  [t('descEditor.avancee'), t('descEditor.effetsAideAvancee')],
                                  [t('descEditor.si'), t('descEditor.effetsAideSi')],
                                ].map(([label, desc]) => (
                                  <tr key={label} style={{ verticalAlign: 'top' }}>
                                    <td style={{ color: S.gold, paddingRight: 10, paddingBottom: 4, whiteSpace: 'nowrap', fontWeight: 600 }}>{label}</td>
                                    <td style={{ paddingBottom: 4, color: 'rgba(245,236,215,0.7)' }}>{desc}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <div style={{ fontWeight: 700, color: S.gold, fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 2 }}>
                              {t('descEditor.effetsAideTokens')}
                            </div>
                            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
                              <tbody>
                                {[
                                  ['[rang]', t('descEditor.effetsAideTokenRang')],
                                  ['[niveau]', t('descEditor.effetsAideTokenNiveau')],
                                  ['[Mod. FOR] … [Mod. CHA]', t('descEditor.effetsAideTokenMods')],
                                  ['[DM_ARME] [DM_MAINS_NUES]', t('descEditor.effetsAideTokenDM')],
                                ].map(([token, desc]) => (
                                  <tr key={token} style={{ verticalAlign: 'top' }}>
                                    <td style={{ color: 'rgba(180,220,140,0.9)', paddingRight: 10, paddingBottom: 3, whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: 11 }}>{token}</td>
                                    <td style={{ paddingBottom: 3, color: 'rgba(245,236,215,0.7)' }}>{desc}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        {normaux.map(({ e, idx }) => renderLigne(e, idx))}
                        {grantsNormaux.map(({ g, idx }) => renderGrant(g, idx))}
                        <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                          <button
                            onClick={() => addEffect(selected, i)}
                            style={{
                              padding: '3px 10px', borderRadius: 3, fontSize: 13, cursor: 'pointer',
                              border: `1px solid ${S.border}`, background: 'transparent', color: S.gold,
                            }}
                          >{t('descEditor.ajouterEffet')}</button>
                          <button
                            onClick={() => addGrant(selected, i)}
                            style={{
                              padding: '3px 10px', borderRadius: 3, fontSize: 13, cursor: 'pointer',
                              border: `1px solid ${S.border}`, background: 'transparent', color: S.gold,
                            }}
                          >{t('descEditor.ajouterAcces')}</button>
                        </div>
                        <div style={{ marginTop: 10, borderRadius: 4, padding: '8px 10px', background: 'rgba(201,168,76,0.07)' }}>
                          <div style={{ fontSize: 12, color: S.gold, letterSpacing: '0.08em', marginBottom: 6, textTransform: 'uppercase' }}>
                            {t('descEditor.capaciteAvancee')}
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
                            >{t('descEditor.ajouterEffetAvance')}</button>
                            <button
                              onClick={() => addGrant(selected, i, true)}
                              style={{
                                padding: '3px 10px', borderRadius: 3, fontSize: 13, cursor: 'pointer',
                                border: `1px solid ${S.border}`, background: 'transparent', color: S.gold,
                              }}
                            >{t('descEditor.ajouterAccesAvance')}</button>
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
            <div style={isMobile ? {
              position: 'absolute', top: 0, left: 0, bottom: 0, zIndex: 5,
              width: 'min(85vw, 320px)', background: 'rgba(18,14,9,0.99)',
              borderRight: `1px solid ${S.border}`, display: 'flex', flexDirection: 'column',
              transform: mobileListOpen ? 'translateX(0)' : 'translateX(-100%)',
              transition: 'transform 0.25s ease',
              boxShadow: mobileListOpen ? '4px 0 24px rgba(0,0,0,0.7)' : 'none',
            } : {
              width: 'max-content', minWidth: 280, flexShrink: 0,
              borderRight: `1px solid ${S.border}`, display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ padding: '10px 12px', borderBottom: `1px solid ${S.border}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input
                  type="text"
                  placeholder={t('descEditor.rechercher')}
                  value={traitQuery}
                  onChange={e => setTraitQuery(e.target.value)}
                  style={{
                    width: '100%', background: S.bg, border: `1px solid ${S.border}`,
                    borderRadius: 4, padding: '5px 8px', fontSize: 17,
                    color: S.parchment, outline: 'none', boxSizing: 'border-box',
                  }}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={addTrait} style={{
                    flex: 1, padding: '5px 8px', borderRadius: 4, fontSize: 14, cursor: 'pointer',
                    border: `1px solid ${S.border}`, background: 'rgba(201,168,76,0.07)',
                    color: S.gold, boxSizing: 'border-box',
                  }}>{t('descEditor.btnNouveauTrait')}</button>
                  <button onClick={() => pendingFileRef.current?.click()} style={{
                    flex: 1, padding: '5px 8px', borderRadius: 4, fontSize: 14, cursor: 'pointer',
                    border: `1px solid ${S.border}`, background: 'transparent',
                    color: 'rgba(201,168,76,0.6)', boxSizing: 'border-box',
                  }}>{t('descEditor.btnImporterTrait')}</button>
                </div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {traits.map((trait, i) => ({ trait, i })).filter(({ trait }) => !traitQuery || trait.nom.toLowerCase().includes(traitQuery.toLowerCase())).map(({ trait, i }) => (
                  <div key={i} onClick={() => { setSelectedTrait(i); closeMobileList() }} className="voie-list-item" style={{
                    padding: '7px 12px', fontSize: 17, cursor: 'pointer',
                    color: selectedTrait === i ? S.gold : S.parchment,
                    background: selectedTrait === i ? 'rgba(201,168,76,0.1)' : 'transparent',
                    borderLeft: selectedTrait === i ? `3px solid ${S.gold}` : '3px solid transparent',
                    transition: 'all 0.1s',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4,
                  }}>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{traitName(trait.nom)}</span>
                    <button
                      onClick={e => { e.stopPropagation(); exportSingleItem({ type: 'trait', data: trait }, `trait-${safeName(trait.nom)}.json`) }}
                      style={{ background: 'none', border: 'none', color: 'rgba(201,168,76,0.9)', cursor: 'pointer', fontSize: 15, fontWeight: 700, padding: '0 3px', opacity: 0, transition: 'opacity 0.15s', flexShrink: 0 }}
                      className="voie-delete-btn"
                      title={t('descEditor.exporterTraitTitle')}
                    >↓</button>
                  </div>
                ))}
              </div>
              {/* Zone en attente — traits */}
              {pendingItems.some(p => p.type === 'trait') && (
                <div style={{ borderTop: `2px solid rgba(201,168,76,0.4)`, flexShrink: 0 }}>
                  <div style={{ padding: '6px 14px', fontSize: 12, color: S.gold, opacity: 0.8, letterSpacing: '0.1em', textTransform: 'uppercase', background: 'rgba(201,168,76,0.07)', fontWeight: 600 }}>
                    {t('descEditor.enAttente')} ({pendingItems.filter(p => p.type === 'trait').length})
                  </div>
                  <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                    {pendingItems.filter(p => p.type === 'trait').map(item => {
                      if (item.type !== 'trait') return null
                      const isDoublon = traits.some(t => t.nom === item.data.nom)
                      return (
                        <div key={item.id} style={{ padding: '8px 12px', borderBottom: `1px solid rgba(201,168,76,0.1)` }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                            {isDoublon && <span style={{ fontSize: 11, background: 'rgba(230,140,40,0.2)', color: 'rgba(230,160,60,0.9)', border: '1px solid rgba(230,140,40,0.4)', borderRadius: 3, padding: '1px 5px', flexShrink: 0 }}>{t('descEditor.doublon')}</span>}
                            <span style={{ fontSize: 14, color: S.parchment, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.data.nom}</span>
                            <button onClick={() => openPreview(item.id)} style={{ background: 'none', border: 'none', color: S.gold, cursor: 'pointer', fontSize: 15, padding: '0 3px', opacity: 0.8, flexShrink: 0 }} title={t('descEditor.apercuTitle')}>🔍</button>
                          </div>
                          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                            <button onClick={() => {
                              if (isDoublon) setTraits(prev => prev.map(t => t.nom === item.data.nom ? item.data : t))
                              else { setTraits(prev => [...prev, item.data]); setSelectedTrait(traits.length) }
                              setPendingItems(prev => prev.filter(p => p.id !== item.id)); setTraitsExported(false)
                            }} style={{ padding: '3px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer', border: `1px solid rgba(201,168,76,0.4)`, background: 'rgba(201,168,76,0.12)', color: S.gold }}>
                              {isDoublon ? t('descEditor.remplacer') : t('descEditor.incorporer')}
                            </button>
                            {isDoublon && <button onClick={() => {
                              let n = `${item.data.nom} (2)`; let i = 3; while (traits.some(t => t.nom === n)) n = `${item.data.nom} (${i++})`
                              setTraits(prev => [...prev, { ...item.data, nom: n }]); setSelectedTrait(traits.length)
                              setPendingItems(prev => prev.filter(p => p.id !== item.id)); setTraitsExported(false)
                            }} style={{ padding: '3px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer', border: `1px solid rgba(201,168,76,0.25)`, background: 'transparent', color: 'rgba(245,236,215,0.65)' }}>+copie</button>}
                            <button onClick={() => setPendingItems(prev => prev.filter(p => p.id !== item.id))}
                              style={{ padding: '3px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer', border: '1px solid rgba(220,80,80,0.3)', background: 'transparent', color: '#e05555' }}>{t('descEditor.ignorer')}</button>
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
                    onClick={cloneTrait}
                    title={t('descEditor.cloneTraitTitle')}
                    style={{ padding: '4px 10px', borderRadius: 4, fontSize: 15, cursor: 'pointer', border: `1px solid rgba(201,168,76,0.35)`, background: 'transparent', color: 'rgba(201,168,76,0.7)', flexShrink: 0 }}
                  >⎘</button>
                  <button
                    onClick={() => askConfirm(t('descEditor.confirmSupprimerTrait', { nom: traits[selectedTrait]?.nom }), () => removeTrait(selectedTrait))}
                    title={t('descEditor.supprimer')}
                    style={{
                      padding: '4px 10px', borderRadius: 4, fontSize: 15, cursor: 'pointer',
                      border: '1px solid rgba(220,80,80,0.4)', background: 'transparent',
                      color: '#e05555', flexShrink: 0,
                    }}
                  >🗑</button>
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
          </>) : section === 'traitsRaciaux' ? (<>
            {/* Colonne traits raciaux */}
            <div style={isMobile ? {
              position: 'absolute', top: 0, left: 0, bottom: 0, zIndex: 5,
              width: 'min(85vw, 320px)', background: 'rgba(18,14,9,0.99)',
              borderRight: `1px solid ${S.border}`, display: 'flex', flexDirection: 'column',
              transform: mobileListOpen ? 'translateX(0)' : 'translateX(-100%)',
              transition: 'transform 0.25s ease',
              boxShadow: mobileListOpen ? '4px 0 24px rgba(0,0,0,0.7)' : 'none',
            } : { width: 'max-content', minWidth: 280, flexShrink: 0, borderRight: `1px solid ${S.border}`, display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '10px 12px', borderBottom: `1px solid ${S.border}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input
                  type="text" placeholder={t('descEditor.rechercher')} value={traitRacialQuery}
                  onChange={e => setTraitRacialQuery(e.target.value)}
                  style={{ width: '100%', background: S.bg, border: `1px solid ${S.border}`, borderRadius: 4, padding: '5px 8px', fontSize: 17, color: S.parchment, outline: 'none', boxSizing: 'border-box' }}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={addTraitRacial} style={{
                    flex: 1, padding: '5px 8px', borderRadius: 4, fontSize: 14, cursor: 'pointer',
                    border: `1px solid ${S.border}`, background: 'rgba(201,168,76,0.07)', color: S.gold, boxSizing: 'border-box',
                  }}>{t('descEditor.btnNouveauTraitRacial')}</button>
                  <button onClick={() => traitRacialImportRef.current?.click()} style={{
                    flex: 1, padding: '5px 8px', borderRadius: 4, fontSize: 14, cursor: 'pointer',
                    border: `1px solid ${S.border}`, background: 'transparent',
                    color: 'rgba(201,168,76,0.6)', boxSizing: 'border-box',
                  }}>{t('descEditor.btnImporterTrait')}</button>
                </div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {traitsRaciaux
                  .map((traitR, i) => ({ traitR, i }))
                  .filter(({ traitR }) => !traitRacialQuery || traitR.nom.toLowerCase().includes(traitRacialQuery.toLowerCase()))
                  .map(({ traitR, i }) => (
                    <div key={i} onClick={() => { setSelectedTraitRacial(i); closeMobileList() }} className="voie-list-item" style={{
                      padding: '7px 12px', fontSize: 17, cursor: 'pointer',
                      color: selectedTraitRacial === i ? S.gold : S.parchment,
                      background: selectedTraitRacial === i ? 'rgba(201,168,76,0.1)' : 'transparent',
                      borderLeft: selectedTraitRacial === i ? `3px solid ${S.gold}` : '3px solid transparent',
                      transition: 'all 0.1s', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4,
                    }}>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{traitRacialName(traitR.nom)}</span>
                      <button
                        onClick={e => { e.stopPropagation(); exportSingleItem({ type: 'trait-racial', data: traitR }, `trait-racial-${safeName(traitR.nom)}.json`) }}
                        style={{ background: 'none', border: 'none', color: 'rgba(201,168,76,0.9)', cursor: 'pointer', fontSize: 15, fontWeight: 700, padding: '0 3px', opacity: 0, transition: 'opacity 0.15s', flexShrink: 0 }}
                        className="voie-delete-btn"
                        title={t('descEditor.exporterTraitRacialTitle')}
                      >↓</button>
                    </div>
                  ))}
              </div>
              {/* Zone en attente — traits raciaux */}
              {pendingItems.some(p => p.type === 'trait-racial') && (
                <div style={{ borderTop: `2px solid rgba(201,168,76,0.4)`, flexShrink: 0 }}>
                  <div style={{ padding: '6px 14px', fontSize: 12, color: S.gold, opacity: 0.8, letterSpacing: '0.1em', textTransform: 'uppercase', background: 'rgba(201,168,76,0.07)', fontWeight: 600 }}>
                    {t('descEditor.enAttente')} ({pendingItems.filter(p => p.type === 'trait-racial').length})
                  </div>
                  <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                    {pendingItems.filter(p => p.type === 'trait-racial').map(item => {
                      if (item.type !== 'trait-racial') return null
                      const isDoublon = traitsRaciaux.some(t => t.nom === item.data.nom)
                      return (
                        <div key={item.id} style={{ padding: '8px 12px', borderBottom: `1px solid rgba(201,168,76,0.1)` }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                            {isDoublon && <span style={{ fontSize: 11, background: 'rgba(230,140,40,0.2)', color: 'rgba(230,160,60,0.9)', border: '1px solid rgba(230,140,40,0.4)', borderRadius: 3, padding: '1px 5px', flexShrink: 0 }}>{t('descEditor.doublon')}</span>}
                            <span style={{ fontSize: 14, color: S.parchment, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.data.nom}</span>
                            <button onClick={() => openPreview(item.id)} style={{ background: 'none', border: 'none', color: S.gold, cursor: 'pointer', fontSize: 15, padding: '0 3px', opacity: 0.8, flexShrink: 0 }} title={t('descEditor.apercuTitle')}>🔍</button>
                          </div>
                          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                            <button onClick={() => {
                              if (isDoublon) setTraitsRaciaux(prev => prev.map(t => t.nom === item.data.nom ? item.data : t))
                              else { setTraitsRaciaux(prev => [...prev, item.data]); setSelectedTraitRacial(traitsRaciaux.length) }
                              setPendingItems(prev => prev.filter(p => p.id !== item.id)); setTraitsRaciauxExported(false)
                            }} style={{ padding: '3px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer', border: `1px solid rgba(201,168,76,0.4)`, background: 'rgba(201,168,76,0.12)', color: S.gold }}>
                              {isDoublon ? t('descEditor.remplacer') : t('descEditor.incorporer')}
                            </button>
                            {isDoublon && <button onClick={() => {
                              let n = `${item.data.nom} (2)`; let i = 3; while (traitsRaciaux.some(t => t.nom === n)) n = `${item.data.nom} (${i++})`
                              setTraitsRaciaux(prev => [...prev, { ...item.data, nom: n }]); setSelectedTraitRacial(traitsRaciaux.length)
                              setPendingItems(prev => prev.filter(p => p.id !== item.id)); setTraitsRaciauxExported(false)
                            }} style={{ padding: '3px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer', border: `1px solid rgba(201,168,76,0.25)`, background: 'transparent', color: 'rgba(245,236,215,0.65)' }}>+copie</button>}
                            <button onClick={() => setPendingItems(prev => prev.filter(p => p.id !== item.id))}
                              style={{ padding: '3px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer', border: '1px solid rgba(220,80,80,0.3)', background: 'transparent', color: '#e05555' }}>{t('descEditor.ignorer')}</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Éditeur trait racial */}
            {traitsRaciaux[selectedTraitRacial] && (
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="text"
                    value={traitsRaciaux[selectedTraitRacial].nom}
                    onChange={e => updateTraitRacial(selectedTraitRacial, { nom: e.target.value })}
                    style={{ flex: 1, background: S.bg, border: `1px solid ${S.border}`, borderRadius: 4, padding: '5px 10px', fontSize: 17, color: S.gold, fontWeight: 700, outline: 'none', fontFamily: "'Cinzel', serif" }}
                    onFocus={e => (e.target.style.borderColor = 'rgba(201,168,76,0.6)')}
                    onBlur={e => (e.target.style.borderColor = S.border)}
                  />
                  <button
                    onClick={cloneTraitRacial}
                    title={t('descEditor.cloneTraitRacialTitle')}
                    style={{ padding: '5px 10px', borderRadius: 4, fontSize: 15, cursor: 'pointer', border: `1px solid rgba(201,168,76,0.35)`, background: 'transparent', color: 'rgba(201,168,76,0.7)', flexShrink: 0 }}
                  >⎘</button>
                  <button
                    onClick={() => askConfirm(t('descEditor.confirmSupprimerTraitRacial', { nom: traitsRaciaux[selectedTraitRacial]?.nom }), () => removeTraitRacial(selectedTraitRacial))}
                    style={{ padding: '5px 10px', borderRadius: 4, fontSize: 15, cursor: 'pointer', border: '1px solid rgba(220,80,80,0.4)', background: 'transparent', color: '#e05555', flexShrink: 0 }}
                  >🗑</button>
                </div>
                <textarea
                  ref={traitRacialDescRef}
                  value={traitsRaciaux[selectedTraitRacial].desc}
                  onChange={e => updateTraitRacial(selectedTraitRacial, { desc: e.target.value })}
                  rows={8}
                  style={{
                    width: '100%', background: S.bg, border: `1px solid ${S.border}`,
                    borderRadius: 4, padding: '8px 10px', fontSize: 17, color: S.parchment,
                    resize: 'vertical', outline: 'none', fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box',
                  }}
                  onFocus={e => (e.target.style.borderColor = 'rgba(201,168,76,0.6)')}
                  onBlur={e => (e.target.style.borderColor = S.border)}
                />
              </div>
            )}
          </>) : section === 'peuples' ? (<>
            {/* Colonne peuples */}
            <div style={isMobile ? {
              position: 'absolute', top: 0, left: 0, bottom: 0, zIndex: 5,
              width: 'min(85vw, 340px)', background: 'rgba(18,14,9,0.99)',
              borderRight: `1px solid ${S.border}`, display: 'flex', flexDirection: 'column',
              transform: mobileListOpen ? 'translateX(0)' : 'translateX(-100%)',
              transition: 'transform 0.25s ease',
              boxShadow: mobileListOpen ? '4px 0 24px rgba(0,0,0,0.7)' : 'none',
            } : { width: 'max-content', minWidth: 340, flexShrink: 0, borderRight: `1px solid ${S.border}`, display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '10px 12px', borderBottom: `1px solid ${S.border}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input
                  type="text"
                  placeholder={t('descEditor.rechercher')}
                  value={peupleQuery}
                  onChange={e => setPeupleQuery(e.target.value)}
                  style={{
                    width: '100%', background: S.bg, border: `1px solid ${S.border}`,
                    borderRadius: 4, padding: '5px 8px', fontSize: 17,
                    color: S.parchment, outline: 'none', boxSizing: 'border-box',
                  }}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={addPeuple} style={{
                    flex: 1, padding: '5px 8px', borderRadius: 4, fontSize: 14, cursor: 'pointer',
                    border: `1px solid ${S.border}`, background: 'rgba(201,168,76,0.07)',
                    color: S.gold, boxSizing: 'border-box',
                  }}>{t('descEditor.btnNouveauPeuple')}</button>
                  <button onClick={() => pendingFileRef.current?.click()} style={{
                    flex: 1, padding: '5px 8px', borderRadius: 4, fontSize: 14, cursor: 'pointer',
                    border: `1px solid ${S.border}`, background: 'transparent',
                    color: 'rgba(201,168,76,0.6)', boxSizing: 'border-box',
                  }}>{t('descEditor.btnImporterPeuple')}</button>
                </div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {peuples.map((p, i) => ({ p, i }))
                  .filter(({ p }) => showHidden || !hiddenPeuples.includes(p.label))
                  .filter(({ p }) => !peupleQuery || p.label.toLowerCase().includes(peupleQuery.toLowerCase()))
                  .map(({ p, i }) => (
                  <div key={i} onClick={() => { setSelectedPeuple(i); setSelectedCulture(0); closeMobileList() }} className="voie-list-item" style={{
                    padding: '7px 12px', fontSize: 17, cursor: 'pointer',
                    color: selectedPeuple === i ? S.gold : S.parchment,
                    background: selectedPeuple === i ? 'rgba(201,168,76,0.1)' : 'transparent',
                    borderLeft: selectedPeuple === i ? `3px solid ${S.gold}` : '3px solid transparent',
                    transition: 'all 0.1s',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4,
                  }}>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: hiddenPeuples.includes(p.label) ? 0.4 : 1 }}>{peupleName(p.label)}</span>
                    {hiddenPeuples.includes(p.label) && (
                      <span style={{ fontSize: 10, color: 'rgba(255,160,50,0.7)', background: 'rgba(255,160,50,0.1)', padding: '1px 5px', borderRadius: 3, whiteSpace: 'nowrap' }}>
                        {t('descEditor.masquee')}
                      </span>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); exportSingleItem({ type: 'peuple', data: p }, `peuple-${safeName(p.label)}.json`) }}
                      style={{ background: 'none', border: 'none', color: 'rgba(201,168,76,0.9)', cursor: 'pointer', fontSize: 15, fontWeight: 700, padding: '0 3px', opacity: 0, transition: 'opacity 0.15s', flexShrink: 0 }}
                      className="voie-delete-btn"
                      title={t('descEditor.exporterPeupleTitle')}
                    >↓</button>
                  </div>
                ))}
              </div>
              {/* Bouton accès masquage peuples */}
              <div style={{ borderTop: '1px solid rgba(201,168,76,0.1)', padding: '6px 10px', flexShrink: 0 }}>
                <button
                  onClick={() => showHidden ? setShowHidden(false) : setShowPasswordModal(true)}
                  style={{
                    width: '100%', padding: '5px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer',
                    border: `1px solid ${showHidden ? 'rgba(255,160,50,0.4)' : 'rgba(201,168,76,0.15)'}`,
                    background: showHidden ? 'rgba(255,160,50,0.08)' : 'transparent',
                    color: showHidden ? 'rgba(255,160,50,0.8)' : 'rgba(245,236,215,0.3)',
                    textAlign: 'left',
                  }}
                >
                  {showHidden
                    ? `🔓 ${t('descEditor.masquageActif')} (${hiddenPeuples.length + hiddenCultures.length})`
                    : (hiddenPeuples.length + hiddenCultures.length) > 0
                      ? `🔒 ${t('descEditor.peuplesMasques', { count: hiddenPeuples.length + hiddenCultures.length })}`
                      : `🔒 ${t('descEditor.masquer')}`
                  }
                </button>
              </div>
              {/* Zone en attente — peuples */}
              {pendingItems.some(p => p.type === 'peuple') && (
                <div style={{ borderTop: `2px solid rgba(201,168,76,0.4)`, flexShrink: 0 }}>
                  <div style={{ padding: '6px 14px', fontSize: 12, color: S.gold, opacity: 0.8, letterSpacing: '0.1em', textTransform: 'uppercase', background: 'rgba(201,168,76,0.07)', fontWeight: 600 }}>
                    {t('descEditor.enAttente')} ({pendingItems.filter(p => p.type === 'peuple').length})
                  </div>
                  <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                    {pendingItems.filter(p => p.type === 'peuple').map(item => {
                      if (item.type !== 'peuple') return null
                      const isDoublon = peuples.some(p => p.label === item.data.label)
                      return (
                        <div key={item.id} style={{ padding: '8px 12px', borderBottom: `1px solid rgba(201,168,76,0.1)` }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                            {isDoublon && <span style={{ fontSize: 11, background: 'rgba(230,140,40,0.2)', color: 'rgba(230,160,60,0.9)', border: '1px solid rgba(230,140,40,0.4)', borderRadius: 3, padding: '1px 5px', flexShrink: 0 }}>{t('descEditor.doublon')}</span>}
                            <span style={{ fontSize: 14, color: S.parchment, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.data.label}</span>
                            <button onClick={() => openPreview(item.id)} style={{ background: 'none', border: 'none', color: S.gold, cursor: 'pointer', fontSize: 15, padding: '0 3px', opacity: 0.8, flexShrink: 0 }} title={t('descEditor.apercuTitle')}>🔍</button>
                          </div>
                          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                            <button onClick={() => {
                              if (isDoublon) setPeuples(prev => prev.map(p => p.label === item.data.label ? item.data : p))
                              else { setPeuples(prev => [...prev, item.data]); setSelectedPeuple(peuples.length) }
                              setPendingItems(prev => prev.filter(p => p.id !== item.id)); setPeuplesExported(false)
                            }} style={{ padding: '3px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer', border: `1px solid rgba(201,168,76,0.4)`, background: 'rgba(201,168,76,0.12)', color: S.gold }}>
                              {isDoublon ? t('descEditor.remplacer') : t('descEditor.incorporer')}
                            </button>
                            {isDoublon && <button onClick={() => {
                              let n = `${item.data.label} (2)`; let i = 3; while (peuples.some(p => p.label === n)) n = `${item.data.label} (${i++})`
                              setPeuples(prev => [...prev, { ...item.data, label: n }]); setSelectedPeuple(peuples.length)
                              setPendingItems(prev => prev.filter(p => p.id !== item.id)); setPeuplesExported(false)
                            }} style={{ padding: '3px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer', border: `1px solid rgba(201,168,76,0.25)`, background: 'transparent', color: 'rgba(245,236,215,0.65)' }}>+copie</button>}
                            <button onClick={() => setPendingItems(prev => prev.filter(p => p.id !== item.id))}
                              style={{ padding: '3px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer', border: '1px solid rgba(220,80,80,0.3)', background: 'transparent', color: '#e05555' }}>{t('descEditor.ignorer')}</button>
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
                    <button
                      onClick={() => setHiddenPeuples(prev =>
                        prev.includes(peuple.label) ? prev.filter(n => n !== peuple.label) : [...prev, peuple.label]
                      )}
                      title={hiddenPeuples.includes(peuple.label) ? t('descEditor.rendreVisible') : t('descEditor.masquer')}
                      style={{
                        padding: '4px 10px', borderRadius: 4, fontSize: 15, cursor: 'pointer',
                        border: '1px solid rgba(201,168,76,0.25)', background: 'transparent',
                        color: hiddenPeuples.includes(peuple.label) ? 'rgba(255,160,50,0.55)' : 'rgba(245,236,215,0.85)',
                        flexShrink: 0, position: 'relative', overflow: 'hidden',
                      }}
                    >
                      👁
                      {hiddenPeuples.includes(peuple.label) && (
                        <span style={{ position: 'absolute', top: '50%', left: '-8px', right: '-8px', height: '2px', background: 'currentColor', transform: 'rotate(-35deg)', transformOrigin: 'center', pointerEvents: 'none' }} />
                      )}
                    </button>
                    <button onClick={() => askConfirm(t('descEditor.confirmSupprimerPeuple', { nom: peuple.label }), () => removePeuple(selectedPeuple))} style={{
                      padding: '4px 10px', borderRadius: 4, fontSize: 15, cursor: 'pointer',
                      border: '1px solid rgba(220,80,80,0.4)', background: 'transparent', color: '#e05555', flexShrink: 0,
                    }}>🗑</button>
                  </div>

                  {/* Cultures */}
                  {peuple.cultures.map((culture, ci) => {
                    if (!showHidden && hiddenCultures.includes(cultureKey(peuple.label, culture.label))) return null
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12, color: S.gold, opacity: 0.6, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{t('descEditor.culture')}</span>
                        <input
                          type="text"
                          value={culture.label}
                          onChange={e => updateCulture(selectedPeuple, ci, { label: e.target.value })}
                          style={{ flex: 1, background: S.bg, border: `1px solid ${S.border}`, borderRadius: 3, padding: '2px 8px', fontSize: 15, color: S.gold, fontWeight: 600, outline: 'none' }}
                          onFocus={e => (e.target.style.borderColor = 'rgba(201,168,76,0.6)')}
                          onBlur={e => (e.target.style.borderColor = S.border)}
                        />
                        <button
                          onClick={() => {
                            const k = cultureKey(peuple.label, culture.label)
                            setHiddenCultures(prev => prev.includes(k) ? prev.filter(c => c !== k) : [...prev, k])
                          }}
                          title={hiddenCultures.includes(cultureKey(peuple.label, culture.label)) ? t('descEditor.rendreVisible') : t('descEditor.masquer')}
                          style={{
                            padding: '2px 8px', borderRadius: 3, fontSize: 13, cursor: 'pointer',
                            border: '1px solid rgba(201,168,76,0.25)', background: 'transparent',
                            color: hiddenCultures.includes(cultureKey(peuple.label, culture.label)) ? 'rgba(255,160,50,0.55)' : 'rgba(245,236,215,0.85)',
                            position: 'relative', overflow: 'hidden',
                          }}
                        >
                          👁
                          {hiddenCultures.includes(cultureKey(peuple.label, culture.label)) && (
                            <span style={{ position: 'absolute', top: '50%', left: '-8px', right: '-8px', height: '2px', background: 'currentColor', transform: 'rotate(-35deg)', transformOrigin: 'center', pointerEvents: 'none' }} />
                          )}
                        </button>
                        <button onClick={() => cloneCulture(selectedPeuple, ci)} title={t('descEditor.cloneCultureTitle')} style={{
                          padding: '2px 8px', borderRadius: 3, fontSize: 13, cursor: 'pointer',
                          border: '1px solid rgba(201,168,76,0.35)', background: 'transparent', color: 'rgba(201,168,76,0.7)',
                        }}>⎘</button>
                        <button onClick={() => askConfirm(t('descEditor.confirmSupprimerCulture', { nom: culture.label }), () => removeCulture(selectedPeuple, ci))} style={{
                          padding: '2px 8px', borderRadius: 3, fontSize: 13, cursor: 'pointer',
                          border: '1px solid rgba(220,80,80,0.35)', background: 'transparent', color: '#e05555',
                        }}>🗑</button>
                      </div>

                      <div style={{ display: 'flex', gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, color: S.parchment, opacity: 0.5, marginBottom: 3 }}>{t('descEditor.voieDuPeuple')}</div>
                          <VoieSelectCombobox
                            value={culture.voiePeuple}
                            voiesList={voiesList.filter(v => v.toLowerCase().includes('peuple'))}
                            usedVoies={usedVoiesPeuple}
                            onChange={v => updateCulture(selectedPeuple, ci, { voiePeuple: v })}
                            onCreateVoie={() => { addVoie(); setSection('voies') }}
                          />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, color: S.parchment, opacity: 0.5, marginBottom: 3 }}>{t('descEditor.voieCulturelle')}</div>
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
                        <div style={{ fontSize: 12, color: S.parchment, opacity: 0.5, marginBottom: 4 }}>{t('descEditor.modCaracs')}</div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {CARACS.map(car => (
                            <label key={car} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 13, color: S.parchment }}>
                              <span style={{ color: S.gold, fontWeight: 600, minWidth: 28 }}>{t(`stats.${car}`)}</span>
                              <input
                                key={`${selectedPeuple}-${ci}-${car}`}
                                type="number"
                                defaultValue={culture.modCaracs[car] ?? 0}
                                onChange={e => {
                                  const val = parseInt(e.target.value)
                                  if (isNaN(val)) return
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
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                          <div style={{ fontSize: 12, color: S.parchment, opacity: 0.5 }}>{t('descEditor.traitRacial')}</div>
                          {culture.trait?.nom && (
                            <button
                              onClick={() => updateCulture(selectedPeuple, ci, { trait: { nom: '', desc: '' } })}
                              title={t('descEditor.effacerTraitTitle')}
                              style={{ background: 'none', border: 'none', color: '#c05050', cursor: 'pointer', fontSize: 12, padding: '0 2px', lineHeight: 1 }}
                            >{t('descEditor.effacerTraitBtn')}</button>
                          )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <TraitNomCombobox
                            value={culture.trait?.nom ?? ''}
                            allTraits={allTraits}
                            onChange={(nom, desc) => updateCulture(selectedPeuple, ci, {
                              trait: { nom, desc: desc ?? culture.trait?.desc ?? '' }
                            })}
                          />
                          <textarea
                            placeholder={t('descEditor.traitDescPlaceholder')}
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
                  }}>{t('descEditor.btnNouvelleCulture')}</button>
                </div>
              )
            })()}
          </>) : null}

          {section === 'compagnons' && (<>
            {/* Liste compagnons */}
            <div style={isMobile ? {
              position: 'absolute', top: 0, left: 0, bottom: 0, zIndex: 5,
              width: 'min(85vw, 300px)', background: 'rgba(18,14,9,0.99)',
              borderRight: `1px solid ${S.border}`, display: 'flex', flexDirection: 'column',
              transform: mobileListOpen ? 'translateX(0)' : 'translateX(-100%)',
              transition: 'transform 0.25s ease',
              boxShadow: mobileListOpen ? '4px 0 24px rgba(0,0,0,0.7)' : 'none',
            } : {
              width: 320, flexShrink: 0, borderRight: `1px solid ${S.border}`,
              display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ padding: '10px 12px', borderBottom: `1px solid ${S.border}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input
                  type="text" placeholder={t('descEditor.rechercher')} value={compagnonQuery}
                  onChange={e => setCompagnonQuery(e.target.value)}
                  style={{ width: '100%', background: S.bg, border: `1px solid ${S.border}`, borderRadius: 4, padding: '5px 8px', fontSize: 15, color: S.parchment, outline: 'none', boxSizing: 'border-box' }}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={addCompagnon} style={{
                    flex: 1, padding: '5px 8px', borderRadius: 4, fontSize: 14, cursor: 'pointer',
                    border: `1px solid ${S.border}`, background: 'rgba(201,168,76,0.07)', color: S.gold,
                    whiteSpace: 'nowrap',
                  }}>{t('descEditor.btnNouveauCompagnon')}</button>
                  <button onClick={() => compagnonImportRef.current?.click()} style={{
                    flex: 1, padding: '5px 8px', borderRadius: 4, fontSize: 14, cursor: 'pointer',
                    border: `1px solid ${S.border}`, background: 'transparent',
                    color: 'rgba(201,168,76,0.6)', boxSizing: 'border-box',
                  }}>{t('descEditor.btnImporterCompagnon')}</button>
                </div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {compagnons
                  .map((c, i) => ({ c, i }))
                  .sort((a, b) => a.c.nom.localeCompare(b.c.nom, 'fr'))
                  .filter(({ c }) => showHidden || !hiddenCompagnons.includes(c.nom))
                  .filter(({ c }) => !compagnonQuery || c.nom.toLowerCase().includes(compagnonQuery.toLowerCase()))
                  .map(({ c, i }) => (
                    <div key={i} onClick={() => { setSelectedCompagnon(i); closeMobileList() }} className="voie-list-item" style={{
                      padding: '7px 12px', fontSize: 15, cursor: 'pointer',
                      color: selectedCompagnon === i ? S.gold : S.parchment,
                      background: selectedCompagnon === i ? 'rgba(201,168,76,0.1)' : 'transparent',
                      borderLeft: selectedCompagnon === i ? `3px solid ${S.gold}` : '3px solid transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4,
                    }}>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: hiddenCompagnons.includes(c.nom) ? 0.4 : 1 }}>{compagnonName(c.nom)}</span>
                      {hiddenCompagnons.includes(c.nom) && (
                        <span style={{ fontSize: 10, color: 'rgba(255,160,50,0.7)', background: 'rgba(255,160,50,0.1)', padding: '1px 5px', borderRadius: 3, whiteSpace: 'nowrap' }}>
                          {t('descEditor.masquee')}
                        </span>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); exportSingleItem({ type: 'compagnon', data: c }, `compagnon-${safeName(c.nom)}.json`) }}
                        style={{ background: 'none', border: 'none', color: 'rgba(201,168,76,0.9)', cursor: 'pointer', fontSize: 15, fontWeight: 700, padding: '0 3px', opacity: 0, transition: 'opacity 0.15s', flexShrink: 0 }}
                        className="voie-delete-btn"
                        title={t('descEditor.exporterCompagnonTitle')}
                      >↓</button>
                    </div>
                  ))}
              </div>
              {/* Bouton accès masquage compagnons */}
              <div style={{ borderTop: '1px solid rgba(201,168,76,0.1)', padding: '6px 10px', flexShrink: 0 }}>
                <button
                  onClick={() => showHidden ? setShowHidden(false) : setShowPasswordModal(true)}
                  style={{
                    width: '100%', padding: '5px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer',
                    border: `1px solid ${showHidden ? 'rgba(255,160,50,0.4)' : 'rgba(201,168,76,0.15)'}`,
                    background: showHidden ? 'rgba(255,160,50,0.08)' : 'transparent',
                    color: showHidden ? 'rgba(255,160,50,0.8)' : 'rgba(245,236,215,0.3)',
                    textAlign: 'left',
                  }}
                >
                  {(() => {
                    const countReel = hiddenCompagnons.filter(nom => compagnons.some(c => c.nom === nom)).length
                    return showHidden
                      ? `🔓 ${t('descEditor.masquageActif')} (${countReel})`
                      : countReel > 0
                        ? `🔒 ${t('descEditor.compagnonsMasques', { count: countReel })}`
                        : `🔒 ${t('descEditor.masquer')}`
                  })()}
                </button>
              </div>
              {/* Zone en attente — compagnons */}
              {pendingItems.some(p => p.type === 'compagnon') && (
                <div style={{ borderTop: `2px solid rgba(201,168,76,0.4)`, flexShrink: 0 }}>
                  <div style={{ padding: '6px 14px', fontSize: 12, color: S.gold, opacity: 0.8, letterSpacing: '0.1em', textTransform: 'uppercase', background: 'rgba(201,168,76,0.07)', fontWeight: 600 }}>
                    {t('descEditor.enAttente')} ({pendingItems.filter(p => p.type === 'compagnon').length})
                  </div>
                  <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                    {pendingItems.filter(p => p.type === 'compagnon').map(item => {
                      if (item.type !== 'compagnon') return null
                      const isDoublon = compagnons.some(c => c.nom === item.data.nom)
                      return (
                        <div key={item.id} style={{ padding: '8px 12px', borderBottom: `1px solid rgba(201,168,76,0.1)` }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                            {isDoublon && <span style={{ fontSize: 11, background: 'rgba(230,140,40,0.2)', color: 'rgba(230,160,60,0.9)', border: '1px solid rgba(230,140,40,0.4)', borderRadius: 3, padding: '1px 5px', flexShrink: 0 }}>{t('descEditor.doublon')}</span>}
                            <span style={{ fontSize: 14, color: S.parchment, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.data.nom}</span>
                            <button onClick={() => openPreview(item.id)} style={{ background: 'none', border: 'none', color: S.gold, cursor: 'pointer', fontSize: 15, padding: '0 3px', opacity: 0.8, flexShrink: 0 }} title={t('descEditor.apercuTitle')}>🔍</button>
                          </div>
                          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                            <button onClick={() => {
                              if (isDoublon) setCompagnons(prev => prev.map(c => c.nom === item.data.nom ? item.data : c))
                              else { setCompagnons(prev => [...prev, item.data]); setSelectedCompagnon(compagnons.length) }
                              setPendingItems(prev => prev.filter(p => p.id !== item.id)); setCompagnonsExported(false)
                            }} style={{ padding: '3px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer', border: `1px solid rgba(201,168,76,0.4)`, background: 'rgba(201,168,76,0.12)', color: S.gold }}>
                              {isDoublon ? t('descEditor.remplacer') : t('descEditor.incorporer')}
                            </button>
                            {isDoublon && <button onClick={() => {
                              let n = `${item.data.nom} (2)`; let i = 3; while (compagnons.some(c => c.nom === n)) n = `${item.data.nom} (${i++})`
                              setCompagnons(prev => [...prev, { ...item.data, nom: n }]); setSelectedCompagnon(compagnons.length)
                              setPendingItems(prev => prev.filter(p => p.id !== item.id)); setCompagnonsExported(false)
                            }} style={{ padding: '3px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer', border: `1px solid rgba(201,168,76,0.25)`, background: 'transparent', color: 'rgba(245,236,215,0.65)' }}>+copie</button>}
                            <button onClick={() => setPendingItems(prev => prev.filter(p => p.id !== item.id))}
                              style={{ padding: '3px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer', border: '1px solid rgba(220,80,80,0.3)', background: 'transparent', color: '#e05555' }}>{t('descEditor.ignorer')}</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Éditeur compagnon */}
            {compagnons[selectedCompagnon] && (() => {
              const c = compagnons[selectedCompagnon]
              const fmtMod = (n: number) => n >= 0 ? `+${n}` : `${n}`
              const numIn = (field: keyof typeof c, label: string, showSign = false) => (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: S.gold, letterSpacing: '0.08em' }}>{label}</span>
                  <input
                    type="text"
                    defaultValue={showSign ? fmtMod((c[field] as number) ?? 0) : String((c[field] as number) ?? 0)}
                    key={`${selectedCompagnon}-${field}`}
                    onChange={e => {
                      const n = parseInt(e.target.value.replace(/[^0-9-]/g, ''))
                      if (!isNaN(n)) updateCompagnon(selectedCompagnon, { [field]: n })
                    }}
                    onBlur={e => {
                      const n = parseInt(e.target.value.replace(/[^0-9-]/g, '')) || 0
                      updateCompagnon(selectedCompagnon, { [field]: n })
                      e.target.value = showSign ? fmtMod(n) : String(n)
                      e.target.style.borderColor = S.border
                    }}
                    onFocus={e => { e.target.select(); e.target.style.borderColor = 'rgba(201,168,76,0.6)' }}
                    style={{
                      width: 52, background: S.bg, border: `1px solid ${S.border}`, borderRadius: 4,
                      padding: '3px 4px', fontSize: 14, color: S.parchment,
                      outline: 'none', textAlign: 'center',
                    }}
                  />
                </div>
              )
              const attIn = (attField: 'attaque1' | 'attaque2', label: string) => {
                const att = c[attField]
                const bonus = att?.bonus ?? ''
                // Formule si contient [ ou est une expression non numérique simple
                const bonusIsFormula = /\[/.test(bonus) || (bonus !== '' && isNaN(parseFloat(bonus.replace(/^\+/, ''))) && !bonus.match(/^[+-]?\d+(\.\d+)?$/))
                const toggleBonus = () => {
                  const next = bonusIsFormula ? '+0' : '[formule]'
                  updateCompagnon(selectedCompagnon, { [attField]: { nom: att?.nom ?? '', bonus: next, dm: att?.dm ?? '1d6' } })
                }
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 12, color: S.gold, letterSpacing: '0.06em' }}>{label}</span>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <input
                        placeholder={t('descEditor.attNomPlaceholder')} value={att?.nom ?? ''}
                        onChange={e => updateCompagnon(selectedCompagnon, { [attField]: { nom: e.target.value, bonus: att?.bonus ?? '+0', dm: att?.dm ?? '1d6' } })}
                        style={{ flex: 2, minWidth: 0, ...inStyle }}
                        onFocus={e => (e.target.style.borderColor = 'rgba(201,168,76,0.6)')}
                        onBlur={e => (e.target.style.borderColor = S.border)}
                      />
                      {/* Toggle bonus fixe / formule */}
                      <button
                        onClick={toggleBonus}
                        title={bonusIsFormula ? t('descEditor.compPasserFixe') : t('descEditor.compPasserFormule')}
                        style={{
                          fontFamily: 'monospace', fontSize: 9, padding: '2px 5px', borderRadius: 2, flexShrink: 0,
                          border: `1px solid ${bonusIsFormula ? 'rgba(201,168,76,0.6)' : S.border}`,
                          background: bonusIsFormula ? 'rgba(201,168,76,0.2)' : 'transparent',
                          cursor: 'pointer', color: bonusIsFormula ? S.gold : 'rgba(245,236,215,0.4)',
                        }}
                      >{bonusIsFormula ? 'fx' : '42'}</button>
                      <input
                        placeholder={bonusIsFormula ? '[formule]' : '+5'}
                        value={att?.bonus ?? ''}
                        onChange={e => updateCompagnon(selectedCompagnon, { [attField]: { nom: att?.nom ?? '', bonus: e.target.value, dm: att?.dm ?? '1d6' } })}
                        style={{ width: bonusIsFormula ? 130 : 60, ...inStyle, textAlign: bonusIsFormula ? 'left' : 'center' }}
                        onFocus={e => (e.target.style.borderColor = 'rgba(201,168,76,0.6)')}
                        onBlur={e => (e.target.style.borderColor = S.border)}
                      />
                      <input
                        placeholder={t('descEditor.attDmPlaceholder')} value={att?.dm ?? ''}
                        onChange={e => updateCompagnon(selectedCompagnon, { [attField]: { nom: att?.nom ?? '', bonus: att?.bonus ?? '+0', dm: e.target.value } })}
                        style={{ width: 72, ...inStyle, textAlign: 'center' }}
                        onFocus={e => (e.target.style.borderColor = 'rgba(201,168,76,0.6)')}
                        onBlur={e => (e.target.style.borderColor = S.border)}
                      />
                      {att?.nom && (
                        <button onClick={() => updateCompagnon(selectedCompagnon, { [attField]: undefined })}
                          style={{ background: 'none', border: 'none', color: '#c05050', cursor: 'pointer', fontSize: 16, padding: '0 2px', flexShrink: 0 }}>✕</button>
                      )}
                    </div>
                  </div>
                )
              }
              const inStyle: React.CSSProperties = {
                background: S.bg, border: `1px solid ${S.border}`, borderRadius: 4,
                padding: '4px 8px', fontSize: 14, color: S.parchment, outline: 'none',
              }
              return (
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* Nom + supprimer */}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                      value={c.nom}
                      onChange={e => updateCompagnon(selectedCompagnon, { nom: e.target.value })}
                      style={{ flex: 1, minWidth: 0, background: S.bg, border: `1px solid ${S.border}`, borderRadius: 4, padding: '5px 10px', fontSize: 17, color: S.gold, fontWeight: 700, outline: 'none', fontFamily: "'Cinzel', serif" }}
                      onFocus={e => (e.target.style.borderColor = 'rgba(201,168,76,0.6)')}
                      onBlur={e => (e.target.style.borderColor = S.border)}
                    />
                    <button
                      onClick={() => setHiddenCompagnons(prev =>
                        prev.includes(c.nom) ? prev.filter(n => n !== c.nom) : [...prev, c.nom]
                      )}
                      title={hiddenCompagnons.includes(c.nom) ? t('descEditor.rendreVisible') : t('descEditor.masquer')}
                      style={{
                        padding: '4px 10px', borderRadius: 4, fontSize: 15, cursor: 'pointer',
                        border: '1px solid rgba(201,168,76,0.25)', background: 'transparent',
                        color: hiddenCompagnons.includes(c.nom) ? 'rgba(255,160,50,0.55)' : 'rgba(245,236,215,0.85)',
                        flexShrink: 0, position: 'relative', overflow: 'hidden',
                      }}
                    >
                      👁
                      {hiddenCompagnons.includes(c.nom) && (
                        <span style={{ position: 'absolute', top: '50%', left: '-8px', right: '-8px', height: '2px', background: 'currentColor', transform: 'rotate(-35deg)', transformOrigin: 'center', pointerEvents: 'none' }} />
                      )}
                    </button>
                    <button onClick={cloneCompagnon} title={t('descEditor.cloneCompagnonTitle')}
                      style={{ padding: '4px 10px', borderRadius: 4, fontSize: 15, cursor: 'pointer', border: `1px solid rgba(201,168,76,0.35)`, background: 'transparent', color: 'rgba(201,168,76,0.7)', flexShrink: 0 }}>
                      ⎘
                    </button>
                    <button onClick={() => askConfirm(t('descEditor.confirmSupprimerCompagnon', { nom: c.nom }), () => removeCompagnon(selectedCompagnon))}
                      style={{ padding: '4px 10px', borderRadius: 4, fontSize: 15, cursor: 'pointer', border: '1px solid rgba(220,80,80,0.4)', background: 'transparent', color: '#e05555', flexShrink: 0 }}>
                      🗑
                    </button>
                  </div>

                  {/* Modificateurs + Stats sur une seule ligne */}
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={{ fontSize: 12, color: 'rgba(245,236,215,0.45)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{t('descEditor.compModificateurs')}</span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {numIn('for', 'FOR', true)}{numIn('dex', 'DEX', true)}{numIn('con', 'CON', true)}
                        {numIn('int', 'INT', true)}{numIn('sag', 'SAG', true)}{numIn('cha', 'CHA', true)}
                      </div>
                    </div>
                    <div style={{ width: 1, alignSelf: 'stretch', background: 'rgba(201,168,76,0.2)', flexShrink: 0, marginTop: 18 }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={{ fontSize: 12, color: 'rgba(245,236,215,0.45)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{t('descEditor.compStats')}</span>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                        {/* Init : fixe ou formule */}
                        {(() => {
                          const isFormula = typeof c.init === 'string'
                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center' }}>
                              <span style={{ fontSize: 11, color: S.gold, letterSpacing: '0.08em' }}>{t('descEditor.compInit')}</span>
                              <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                                <button
                                  onClick={() => updateCompagnon(selectedCompagnon, { init: isFormula ? (parseInt(String(c.init)) || 10) : String(c.init) })}
                                  title={isFormula ? t('descEditor.compPasserFixe') : t('descEditor.compPasserFormule')}
                                  style={{
                                    fontFamily: 'monospace', fontSize: 9, padding: '2px 5px', borderRadius: 2,
                                    border: `1px solid ${isFormula ? 'rgba(201,168,76,0.6)' : S.border}`,
                                    background: isFormula ? 'rgba(201,168,76,0.2)' : 'transparent',
                                    cursor: 'pointer', color: isFormula ? S.gold : 'rgba(245,236,215,0.4)',
                                    flexShrink: 0,
                                  }}
                                >{isFormula ? 'fx' : '42'}</button>
                                {isFormula ? (
                                  <input type="text" defaultValue={String(c.init)} key={`${selectedCompagnon}-init-fx`}
                                    placeholder="[formule]"
                                    onChange={e => updateCompagnon(selectedCompagnon, { init: e.target.value })}
                                    onBlur={e => { updateCompagnon(selectedCompagnon, { init: e.target.value }); e.target.style.borderColor = S.border }}
                                    onFocus={e => { e.target.select(); e.target.style.borderColor = 'rgba(201,168,76,0.6)' }}
                                    style={{ width: 120, background: S.bg, border: `1px solid ${S.border}`, borderRadius: 4, padding: '3px 6px', fontSize: 13, color: S.parchment, outline: 'none' }}
                                  />
                                ) : (
                                  <input type="text" defaultValue={String(c.init ?? 0)} key={`${selectedCompagnon}-init-num`}
                                    onChange={e => { const n = parseInt(e.target.value); if (!isNaN(n)) updateCompagnon(selectedCompagnon, { init: n }) }}
                                    onBlur={e => { updateCompagnon(selectedCompagnon, { init: parseInt(e.target.value) || 0 }); e.target.style.borderColor = S.border }}
                                    onFocus={e => { e.target.select(); e.target.style.borderColor = 'rgba(201,168,76,0.6)' }}
                                    style={{ width: 52, background: S.bg, border: `1px solid ${S.border}`, borderRadius: 4, padding: '3px 4px', fontSize: 14, color: S.parchment, outline: 'none', textAlign: 'center' }}
                                  />
                                )}
                              </div>
                            </div>
                          )
                        })()}
                        {numIn('def', 'DEF')}
                        {/* PV : fixe ou formule */}
                        {(() => {
                          const isFormula = typeof c.pv === 'string'
                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center' }}>
                              <span style={{ fontSize: 11, color: S.gold, letterSpacing: '0.08em' }}>PV</span>
                              <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                                <button
                                  onClick={() => updateCompagnon(selectedCompagnon, { pv: isFormula ? (parseInt(String(c.pv)) || 10) : String(c.pv) })}
                                  title={isFormula ? t('descEditor.compPasserFixe') : t('descEditor.compPasserFormule')}
                                  style={{
                                    fontFamily: 'monospace', fontSize: 9, padding: '2px 5px', borderRadius: 2,
                                    border: `1px solid ${isFormula ? 'rgba(201,168,76,0.6)' : S.border}`,
                                    background: isFormula ? 'rgba(201,168,76,0.2)' : 'transparent',
                                    cursor: 'pointer', color: isFormula ? S.gold : 'rgba(245,236,215,0.4)',
                                    flexShrink: 0,
                                  }}
                                >
                                  {isFormula ? 'fx' : '42'}
                                </button>
                                {isFormula ? (
                                  <input
                                    type="text"
                                    defaultValue={String(c.pv)}
                                    key={`${selectedCompagnon}-pv-fx`}
                                    placeholder="20 + [5 × niv]"
                                    onChange={e => updateCompagnon(selectedCompagnon, { pv: e.target.value })}
                                    onBlur={e => { updateCompagnon(selectedCompagnon, { pv: e.target.value }); e.target.style.borderColor = S.border }}
                                    onFocus={e => { e.target.select(); e.target.style.borderColor = 'rgba(201,168,76,0.6)' }}
                                    style={{ width: 120, background: S.bg, border: `1px solid ${S.border}`, borderRadius: 4, padding: '3px 6px', fontSize: 13, color: S.parchment, outline: 'none' }}
                                  />
                                ) : (
                                  <input
                                    type="text"
                                    defaultValue={String(c.pv ?? 0)}
                                    key={`${selectedCompagnon}-pv-num`}
                                    onChange={e => { const n = parseInt(e.target.value); if (!isNaN(n)) updateCompagnon(selectedCompagnon, { pv: n }) }}
                                    onBlur={e => { updateCompagnon(selectedCompagnon, { pv: parseInt(e.target.value) || 0 }); e.target.style.borderColor = S.border }}
                                    onFocus={e => { e.target.select(); e.target.style.borderColor = 'rgba(201,168,76,0.6)' }}
                                    style={{ width: 52, background: S.bg, border: `1px solid ${S.border}`, borderRadius: 4, padding: '3px 4px', fontSize: 14, color: S.parchment, outline: 'none', textAlign: 'center' }}
                                  />
                                )}
                              </div>
                            </div>
                          )
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Attaques */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span style={{ fontSize: 12, color: 'rgba(245,236,215,0.45)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{t('descEditor.compAttaques')}</span>
                    {attIn('attaque1', t('descEditor.compAttaque1'))}
                    {attIn('attaque2', t('descEditor.compAttaque2'))}
                  </div>

                  {/* Capacités */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={{ fontSize: 12, color: 'rgba(245,236,215,0.45)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{t('descEditor.compCapacitesSpeciales')}</span>
                    <textarea
                      value={c.capacites ?? ''}
                      onChange={e => updateCompagnon(selectedCompagnon, { capacites: e.target.value })}
                      rows={3}
                      placeholder={t('descEditor.attCapacitesPlaceholder')}
                      style={{ width: '100%', background: S.bg, border: `1px solid ${S.border}`, borderRadius: 4, padding: '6px 10px', fontSize: 14, color: S.parchment, resize: 'vertical', outline: 'none', fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box' }}
                      onFocus={e => (e.target.style.borderColor = 'rgba(201,168,76,0.6)')}
                      onBlur={e => (e.target.style.borderColor = S.border)}
                    />
                  </div>

                  {/* Bouton aide compagnons */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <button
                      onClick={() => setShowCompagnonsHelp(v => !v)}
                      title={t('descEditor.compAideTitle')}
                      style={{
                        alignSelf: 'flex-start', padding: '4px 10px', borderRadius: 4,
                        border: `1px solid rgba(201,168,76,0.45)`,
                        background: showCompagnonsHelp ? 'rgba(201,168,76,0.12)' : 'transparent',
                        color: 'rgba(201,168,76,0.7)', fontSize: 12, fontWeight: 600,
                        cursor: 'pointer', letterSpacing: '0.04em',
                      }}
                    >{t('descEditor.compAideBtn')}</button>
                    {showCompagnonsHelp && (
                      <div style={{
                        padding: '10px 12px', borderRadius: 4,
                        background: 'rgba(201,168,76,0.05)', border: `1px solid rgba(201,168,76,0.2)`,
                        fontSize: 12, color: 'rgba(245,236,215,0.75)', lineHeight: 1.6,
                        display: 'flex', flexDirection: 'column', gap: 8,
                      }}>
                        <div style={{ fontWeight: 700, color: S.gold, fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                          {t('descEditor.compAideTitre')}
                        </div>
                        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
                          <tbody>
                            {([
                              ['FOR…CHA', t('descEditor.compAideForCha')],
                              ['Init / PV / DEF', t('descEditor.compAideInitPvDef')],
                              [t('descEditor.compAideAttBonusLabel'), t('descEditor.compAideAttBonus')],
                              [t('descEditor.compAideAttDmLabel'), t('descEditor.compAideAttDm')],
                              [t('descEditor.compAideCapacitesLabel'), t('descEditor.compAideCapacites')],
                            ] as [string, string][]).map(([label, desc]) => (
                              <tr key={label} style={{ verticalAlign: 'top' }}>
                                <td style={{ color: S.gold, paddingRight: 8, paddingBottom: 4, whiteSpace: 'nowrap', fontWeight: 600 }}>{label}</td>
                                <td style={{ paddingBottom: 4, color: 'rgba(245,236,215,0.7)' }}>{desc}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div style={{ fontWeight: 700, color: S.gold, fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 4 }}>
                          {t('descEditor.compAideFormules')}
                        </div>
                        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
                          <tbody>
                            {([
                              ['[NIV]', t('descEditor.compAideTokenNiv')],
                              ['[NIV × N]', t('descEditor.compAideTokenNivN')],
                              ['[RANG]', t('descEditor.compAideTokenRang')],
                              ['[RANG × N]', t('descEditor.compAideTokenRangN')],
                              ['[ATT contact]', t('descEditor.compAideTokenAttContact')],
                              ['[ATT distance]', t('descEditor.compAideTokenAttDistance')],
                              ['[ATT magique]', t('descEditor.compAideTokenAttMagique')],
                              ['[FOR]…[CHA]', t('descEditor.compAideTokenForCha')],
                            ] as [string, string][]).map(([token, desc]) => (
                              <tr key={token} style={{ verticalAlign: 'top' }}>
                                <td style={{ color: 'rgba(100,180,255,0.85)', paddingRight: 8, paddingBottom: 4, whiteSpace: 'nowrap', fontFamily: 'monospace', fontWeight: 600 }}>{token}</td>
                                <td style={{ paddingBottom: 4, color: 'rgba(245,236,215,0.7)' }}>{desc}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}
          </>)}

        </div>


        {/* Footer */}
        <div style={{
          paddingTop: '8px',
          paddingLeft: isMobile ? 'calc(20px + env(safe-area-inset-left))' : '20px',
          paddingRight: isMobile ? 'calc(20px + env(safe-area-inset-right))' : '20px',
          paddingBottom: isMobile ? 'calc(8px + env(safe-area-inset-bottom))' : '8px',
          borderTop: `1px solid ${S.border}`,
          fontSize: 13, color: 'rgba(245,236,215,0.4)', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        }}>
          {import.meta.env.DEV ? (
            <span><Trans i18nKey="descEditor.footerDevMode" components={{ strong: <strong style={{ color: 'rgba(201,168,76,0.6)' }} /> }} />
              {' '}<button
                onClick={async () => {
                  const ok = await new Promise<boolean>(resolve => {
                    setConfirmDialog({
                      message: t('descEditor.confirmDevSauvegarderMsg'),
                      label: t('descEditor.confirmDevSauvegarderLabel'),
                      danger: false,
                      onConfirm: () => resolve(true),
                    })
                    setTimeout(() => resolve(false), 30000)
                  })
                  if (!ok) return
                  await Promise.all([
                    saveDataFileToBundle('descriptions.json', data),
                    saveDataFileToBundle('traits-magiques.json', traits),
                    saveDataFileToBundle('peuples.json', peuples),
                    saveDataFileToBundle('voies.json', voies),
                    saveDataFileToBundle('compagnons.json', compagnons),
                    saveDataFileToBundle('traits-raciaux.json', traitsRaciaux),
                    saveDataFileToBundle('hidden-voies.json', hiddenVoies),
                    saveDataFileToBundle('hidden-peuples.json', hiddenPeuples),
                    saveDataFileToBundle('hidden-cultures.json', hiddenCultures),
                    saveDataFileToBundle('hidden-compagnons.json', hiddenCompagnons),
                  ])
                  window.location.reload()
                }}
                style={{ marginLeft: 8, padding: '2px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer', border: '1px solid rgba(100,200,120,0.5)', background: 'transparent', color: 'rgba(100,200,120,0.8)', fontFamily: 'inherit' }}
              >{t('descEditor.footerDevSauvegarder')}</button>
            </span>
          ) : (
            <span><Trans i18nKey="descEditor.footerProd" components={{ strong: <strong style={{ color: 'rgba(201,168,76,0.6)' }} />, em: <em /> }} /></span>
          )}
          <button
            onClick={() => askConfirm(
              t('descEditor.confirmReinitialiserMsg'),
              () => {
                const unwrap = (v: unknown) => v && typeof v === 'object' && '_type' in (v as object) && 'data' in (v as object) ? (v as Record<string, unknown>).data : v
                setData(unwrap(JSON.parse(JSON.stringify(DESCRIPTIONS_RAW))) as typeof data)
                setTraits(unwrap(JSON.parse(JSON.stringify(TRAITS_RAW))) as typeof traits)
                setPeuples(unwrap(JSON.parse(JSON.stringify(PEUPLES_RAW))) as typeof peuples)
                setVoies(unwrap(JSON.parse(JSON.stringify(VOIES_BUNDLE))) as typeof voies)
              }
            )}
            style={{
              flexShrink: 0, padding: '4px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 12,
              border: '1px solid rgba(200,80,80,0.3)', background: 'transparent',
              color: 'rgba(200,100,100,0.6)', fontFamily: 'inherit', whiteSpace: 'nowrap',
            }}
          >{t('descEditor.reinitialiserBtn')}</button>
        </div>
      </div>
    </div>
    {/* ── Aperçu impression voie ── */}
    {printPreviewNom && (() => {
      const nom    = printPreviewNom
      const rangs  = data[nom] ?? []
      const famille = voies.find(v => v.nom === nom)?.famille ?? ''
      const FAMILLE_LABELS_PREVIEW: Record<string, string> = {
        combattants: t('descEditor.familleCombattants'),
        aventuriers: t('descEditor.familleAventuriers'),
        mystiques: t('descEditor.familleMystiques'),
      }
      const familleLabel = famille ? (FAMILLE_LABELS_PREVIEW[famille] ?? famille) : ''
      return (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 800,
          background: 'rgba(0,0,0,0.82)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center',
        }} onClick={() => setPrintPreviewNom(null)}>

          {/* Barre d'actions */}
          <div style={{
            width: '100%', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 24px',
            background: 'rgba(12,9,5,0.95)',
            borderBottom: '1px solid rgba(201,168,76,0.2)',
          }} onClick={e => e.stopPropagation()}>
            <span style={{ fontFamily: "'Cinzel', serif", fontSize: 15, color: 'rgba(201,168,76,0.85)', letterSpacing: '0.06em' }}>
              {t('descEditor.apercu', { nom })}
            </span>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => { executePrint(nom); setPrintPreviewNom(null) }}
                style={{
                  padding: '6px 18px', borderRadius: 4, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
                  border: '1px solid rgba(201,168,76,0.6)', background: 'rgba(201,168,76,0.15)',
                  color: 'rgba(201,168,76,0.9)', fontWeight: 600,
                }}
              >{t('descEditor.imprimerBtn')}</button>
              <button
                onClick={() => setPrintPreviewNom(null)}
                style={{
                  padding: '6px 14px', borderRadius: 4, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
                  border: '1px solid rgba(245,236,215,0.2)', background: 'transparent',
                  color: 'rgba(245,236,215,0.5)',
                }}
              >{t('descEditor.fermerBtn')}</button>
            </div>
          </div>

          {/* Page A4 */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '32px 0', width: '100%', display: 'flex', justifyContent: 'center' }}
            onClick={e => e.stopPropagation()}>
            <div style={{
              background: '#fff', color: '#1a1208',
              width: 'min(210mm, 92vw)',
              minHeight: '297mm',
              padding: '18mm 22mm',
              boxShadow: '0 4px 32px rgba(0,0,0,0.7)',
              fontFamily: "'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif",
              fontSize: '11pt', lineHeight: 1.65,
            }}>
              <style>{PRINT_CSS}</style>
              <div className="tda-page">
                <h1>{nom}</h1>
                {familleLabel && <div className="tda-famille">{familleLabel}</div>}
                {rangs.map((r, i) => (
                  <div key={i} className="tda-rang">
                    <h2 className="tda-h2">{t('descEditor.rangN', { n: i + 1 })}{r.nom ? ` — ${r.nom}` : ''}</h2>
                    <div dangerouslySetInnerHTML={{ __html: blockToHtml(r.desc) }} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )
    })()}
    </>
  )
}

function TraitNomCombobox({
  value, allTraits, onChange, style,
}: {
  value: string
  allTraits: { nom: string; desc: string; label: string }[]
  onChange: (nom: string, desc: string | null) => void
  style?: React.CSSProperties
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value)
  const [prevValue, setPrevValue] = useState(value)
  const ref = useRef<HTMLDivElement>(null)

  // Resynchronise pendant le rendu (au lieu d'un effet) pour éviter un rendu en cascade.
  if (value !== prevValue) {
    setPrevValue(value)
    setQuery(value)
  }

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const S2 = { bg: 'rgba(15,12,8,0.92)', border: 'rgba(201,168,76,0.35)', gold: '#c9a84c', parchment: '#f5ecd7' }
  const filtered = allTraits.filter(t => t.label.toLowerCase().includes(query.toLowerCase()))

  return (
    <div ref={ref} style={{ position: 'relative', ...style }}>
      <input
        type="text"
        value={query}
        placeholder={t('descEditor.nomDuTrait')}
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
            <TraitOption key={t.label} trait={t} onSelect={() => { onChange(t.nom, t.desc); setQuery(t.nom); setOpen(false) }} />
          ))}
        </div>
      )}
    </div>
  )
}

function TraitOption({ trait, onSelect }: { trait: { nom: string; desc: string; label: string }; onSelect: () => void }) {
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
      <div style={{ fontWeight: 600, color: '#c9a84c' }}>{trait.label}</div>
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
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value)
  const [prevValue, setPrevValue] = useState(value)
  const ref = useRef<HTMLDivElement>(null)

  // Resynchronise pendant le rendu (au lieu d'un effet) pour éviter un rendu en cascade.
  if (value !== prevValue) {
    setPrevValue(value)
    setQuery(value)
  }

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
          {available.map(v => (
            <VoieSelectOption key={v} nom={v} dimmed={false} onSelect={() => { onChange(v); setQuery(v); setOpen(false) }} />
          ))}
          {used.length > 0 && (
            <>
              {available.length > 0 && <div style={{ borderTop: '1px solid rgba(201,168,76,0.15)', margin: '2px 0' }} />}
              <div style={{ padding: '3px 10px', fontSize: 11, color: 'rgba(201,168,76,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{t('descEditor.dejaUtilisees')}</div>
              {used.map(v => (
                <VoieSelectOption key={v} nom={v} dimmed onSelect={() => { onChange(v); setQuery(v); setOpen(false) }} />
              ))}
            </>
          )}
          {onCreateVoie && (
            <div
              onMouseDown={() => { setOpen(false); onCreateVoie() }}
              style={{
                padding: '6px 10px', fontSize: 13, cursor: 'pointer',
                color: '#c9a84c', borderTop: '1px solid rgba(201,168,76,0.2)',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(201,168,76,0.12)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ fontSize: 15 }}>+</span> {t('descEditor.creerNouvelleVoie')}
            </div>
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
