import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocaleContext } from '../context/LocaleContext'
import type { Language } from '../context/LocaleContext'

const CONTENT_TYPES = [
  { key: 'voies',          label: 'Voies' },
  { key: 'profils',        label: 'Profils' },
  { key: 'traits-raciaux', label: 'Traits raciaux' },
  { key: 'talents',        label: 'Talents magiques' },
  { key: 'peuples',        label: 'Peuples & Cultures' },
  { key: 'compagnons',     label: 'Compagnons' },
  { key: 'equipement',     label: 'Équipement' },
]

// Actual content files to create when adding a new language (talents is virtual)
const CONTENT_FILES = ['voies', 'profils', 'traits-raciaux', 'traits', 'traits-descs', 'peuples', 'compagnons', 'equipement']

// Types rendered with grouped chevron: name row + description row (no rangs)
const GROUPED_SIMPLE = new Set(['traits-raciaux', 'talents'])

const UI_TYPE = 'ui'

function flattenObj(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'string') out[key] = v
    else if (v && typeof v === 'object') Object.assign(out, flattenObj(v as Record<string, unknown>, key))
  }
  return out
}

function unflattenObj(flat: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [dotKey, value] of Object.entries(flat)) {
    const parts = dotKey.split('.')
    let cur = out
    for (let i = 0; i < parts.length - 1; i++) {
      if (typeof cur[parts[i]] !== 'object') cur[parts[i]] = {}
      cur = cur[parts[i]] as Record<string, unknown>
    }
    cur[parts[parts.length - 1]] = value
  }
  return out
}

const LONG_TEXT_TYPES = new Set<string>([])

function mergeTalentsMaps(
  namesMap: Record<string, string>,
  descsMap: Record<string, string>,
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [k, v] of Object.entries(namesMap)) result[k] = v
  for (const [k, v] of Object.entries(descsMap)) result[`${k}|desc`] = v
  return result
}

function splitTalentsEdits(edits: Record<string, string>): { names: Record<string, string>; descs: Record<string, string> } {
  const names: Record<string, string> = {}
  const descs: Record<string, string> = {}
  for (const [k, v] of Object.entries(edits)) {
    if (k.endsWith('|desc')) descs[k.slice(0, -5)] = v
    else names[k] = v
  }
  return { names, descs }
}

const ALL_LANGUAGES: { code: string; label: string }[] = [
  { code: 'af', label: 'Afrikaans' },
  { code: 'sq', label: 'Albanais' },
  { code: 'de', label: 'Allemand' },
  { code: 'ar', label: 'Arabe' },
  { code: 'hy', label: 'Arménien' },
  { code: 'eu', label: 'Basque' },
  { code: 'be', label: 'Biélorusse' },
  { code: 'br', label: 'Breton' },
  { code: 'bg', label: 'Bulgare' },
  { code: 'ca', label: 'Catalan' },
  { code: 'zh', label: 'Chinois' },
  { code: 'ko', label: 'Coréen' },
  { code: 'hr', label: 'Croate' },
  { code: 'da', label: 'Danois' },
  { code: 'es', label: 'Espagnol' },
  { code: 'eo', label: 'Espéranto' },
  { code: 'et', label: 'Estonien' },
  { code: 'fi', label: 'Finnois' },
  { code: 'fr', label: 'Français' },
  { code: 'gl', label: 'Galicien' },
  { code: 'ka', label: 'Géorgien' },
  { code: 'el', label: 'Grec' },
  { code: 'he', label: 'Hébreu' },
  { code: 'hi', label: 'Hindi' },
  { code: 'hu', label: 'Hongrois' },
  { code: 'id', label: 'Indonésien' },
  { code: 'en', label: 'Anglais' },
  { code: 'ga', label: 'Irlandais' },
  { code: 'is', label: 'Islandais' },
  { code: 'it', label: 'Italien' },
  { code: 'ja', label: 'Japonais' },
  { code: 'lv', label: 'Letton' },
  { code: 'lt', label: 'Lituanien' },
  { code: 'lb', label: 'Luxembourgeois' },
  { code: 'mk', label: 'Macédonien' },
  { code: 'ms', label: 'Malais' },
  { code: 'mt', label: 'Maltais' },
  { code: 'nl', label: 'Néerlandais' },
  { code: 'nb', label: 'Norvégien' },
  { code: 'fa', label: 'Persan' },
  { code: 'pl', label: 'Polonais' },
  { code: 'pt', label: 'Portugais' },
  { code: 'ro', label: 'Roumain' },
  { code: 'ru', label: 'Russe' },
  { code: 'sr', label: 'Serbe' },
  { code: 'sk', label: 'Slovaque' },
  { code: 'sl', label: 'Slovène' },
  { code: 'sv', label: 'Suédois' },
  { code: 'th', label: 'Thaï' },
  { code: 'cs', label: 'Tchèque' },
  { code: 'tr', label: 'Turc' },
  { code: 'uk', label: 'Ukrainien' },
  { code: 'vi', label: 'Vietnamien' },
]

const INPUT_STYLE: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '5px 8px', borderRadius: 4,
  fontSize: 13, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(201,168,76,0.3)',
  color: '#f5ecd7', outline: 'none',
}
const TEXTAREA_STYLE: React.CSSProperties = {
  ...INPUT_STYLE, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, minHeight: 60,
}

interface Props {
  onClose: () => void
}

export default function TranslationEditor({ onClose }: Props) {
  const { t } = useTranslation()
  const { contentMaps, uiMaps, languages, saveContentFile, saveUIFile, saveLanguages, localeDir } = useLocaleContext()

  const [activeType, setActiveType] = useState('voies')
  const [activeLang, setActiveLang] = useState<string>(() => languages.find(l => l.code !== 'fr')?.code ?? '')
  const [refLang, setRefLang] = useState<string>('fr')
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [dirty, setDirty] = useState(false)
  const [filter, setFilter] = useState('')
  const [showAddLang, setShowAddLang] = useState(false)
  const [newCode, setNewCode] = useState('')
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [expandedVoies, setExpandedVoies] = useState<Set<string>>(new Set())
  const selectRef = useRef<HTMLSelectElement>(null)

  const isUI = activeType === UI_TYPE
  const isTalents = activeType === 'talents'
  const isGroupedSimple = GROUPED_SIMPLE.has(activeType)

  // frMap = always FR flat, used for key enumeration (source of truth)
  const frMap: Record<string, string> = isUI
    ? flattenObj(uiMaps['fr'] as Record<string, unknown> ?? {})
    : isTalents
      ? mergeTalentsMaps(
          (contentMaps['traits.fr'] ?? {}) as Record<string, string>,
          (contentMaps['traits-descs.fr'] ?? {}) as Record<string, string>,
        )
      : (contentMaps[`${activeType}.fr`] ?? {}) as Record<string, string>

  // refMap = chosen reference language for display; falls back to FR value
  const refMap: Record<string, string> = isUI
    ? flattenObj(uiMaps[refLang] as Record<string, unknown> ?? {})
    : isTalents
      ? mergeTalentsMaps(
          (contentMaps[`traits.${refLang}`] ?? contentMaps['traits.fr'] ?? {}) as Record<string, string>,
          (contentMaps[`traits-descs.${refLang}`] ?? contentMaps['traits-descs.fr'] ?? {}) as Record<string, string>,
        )
      : (contentMaps[`${activeType}.${refLang}`] ?? {}) as Record<string, string>

  const refText = (key: string): string => refMap[key] || frMap[key] || key

  // For voies: separate name keys from rang keys
  const voieNames = activeType === 'voies'
    ? Object.keys(frMap).filter(k => !k.includes('|')).sort((a, b) => a.localeCompare(b, 'fr'))
    : []

  const filteredVoies = filter
    ? voieNames.filter(name => {
        const term = filter.toLowerCase()
        if (refText(name).toLowerCase().includes(term)) return true
        for (let i = 0; i < 5; i++) {
          if (refText(`${name}|${i}|nom`).toLowerCase().includes(term)) return true
          if (refText(`${name}|${i}|desc`).toLowerCase().includes(term)) return true
        }
        return false
      })
    : voieNames

  // For grouped-simple types (traits-raciaux, talents): name + |desc per entry
  const groupedSimpleNames = isGroupedSimple
    ? Object.keys(frMap).filter(k => !k.includes('|')).sort((a, b) => a.localeCompare(b, 'fr'))
    : []

  const filteredGroupedSimpleNames = filter
    ? groupedSimpleNames.filter(name => {
        const term = filter.toLowerCase()
        return (
          refText(name).toLowerCase().includes(term) ||
          refText(`${name}|desc`).toLowerCase().includes(term)
        )
      })
    : groupedSimpleNames

  // For flat types
  const allFlatKeys = !isGroupedSimple && activeType !== 'voies' ? Object.keys(frMap) : []
  const filteredFlatKeys = filter
    ? allFlatKeys.filter(k => refText(k).toLowerCase().includes(filter.toLowerCase()))
    : allFlatKeys

  useEffect(() => {
    if (!activeLang) return
    const targetMap: Record<string, string> = isUI
      ? flattenObj(uiMaps[activeLang] as Record<string, unknown> ?? {})
      : isTalents
        ? mergeTalentsMaps(
            (contentMaps[`traits.${activeLang}`] ?? {}) as Record<string, string>,
            (contentMaps[`traits-descs.${activeLang}`] ?? {}) as Record<string, string>,
          )
        : (contentMaps[`${activeType}.${activeLang}`] ?? {}) as Record<string, string>
    const initial = Object.fromEntries(Object.keys(frMap).map(k => [k, targetMap[k] ?? '']))
    setEdits(initial)
    setDirty(false)
    setFilter('')
    setExpandedVoies(new Set())
  }, [activeType, activeLang])

  const switchTo = (type: string, lang: string) => {
    if (dirty && !window.confirm('Des modifications non enregistrées seront perdues. Continuer ?')) return
    setActiveType(type)
    setActiveLang(lang)
  }

  const handleEdit = (key: string, value: string) => {
    setEdits(prev => ({ ...prev, [key]: value }))
    setDirty(true)
  }

  const handleSave = async () => {
    if (!activeLang) return
    setSaving(true)
    try {
      if (isUI) {
        await saveUIFile(`${activeLang}.json`, unflattenObj(edits))
      } else if (isTalents) {
        const { names, descs } = splitTalentsEdits(edits)
        await saveContentFile(`traits.${activeLang}.json`, names)
        await saveContentFile(`traits-descs.${activeLang}.json`, descs)
      } else {
        await saveContentFile(`${activeType}.${activeLang}.json`, edits)
      }
      setDirty(false)
    } finally {
      setSaving(false)
    }
  }

  const handleAddLang = async () => {
    if (!newCode) return
    const found = ALL_LANGUAGES.find(l => l.code === newCode)
    if (!found) return
    const newLangs: Language[] = [...languages, { code: found.code, label: found.label }]
    await saveLanguages(newLangs)
    for (const fileKey of CONTENT_FILES) {
      const frBase = contentMaps[`${fileKey}.fr`] ?? {}
      await saveContentFile(`${fileKey}.${found.code}.json`, Object.fromEntries(Object.keys(frBase).map(k => [k, ''])))
    }
    setShowAddLang(false)
    setNewCode('')
    if (dirty && !window.confirm('Des modifications non enregistrées seront perdues. Continuer ?')) return
    setActiveLang(found.code)
  }

  const handleCopyPath = () => {
    navigator.clipboard.writeText(localeDir).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const toggleVoie = (name: string) => {
    setExpandedVoies(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const activeLangLabel = languages.find(l => l.code === activeLang)?.label ?? activeLang
  const refLangLabel = languages.find(l => l.code === refLang)?.label ?? refLang
  const isLong = LONG_TEXT_TYPES.has(activeType)

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#1a1410', border: '1px solid rgba(201,168,76,0.4)', borderRadius: 8, width: '100%', maxWidth: 1100, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 8px 40px rgba(0,0,0,0.9)' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid rgba(201,168,76,0.25)' }}>
          <span style={{ fontSize: 17, fontWeight: 700, color: '#c9a84c', fontFamily: "'Cinzel', serif", letterSpacing: '0.04em' }}>
            {t('menuGestion.traductions', 'Traductions')}
          </span>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'rgba(245,236,215,0.6)', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>

        {/* Lang selector bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderBottom: '1px solid rgba(201,168,76,0.15)', flexWrap: 'wrap' }}>
          {/* Reference language */}
          <span style={{ fontSize: 12, color: 'rgba(245,236,215,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 4 }}>Référence :</span>
          {languages.filter(l => l.code !== activeLang).map(lang => (
            <button key={lang.code} onClick={() => setRefLang(lang.code)} style={{
              padding: '4px 14px', borderRadius: 4, fontSize: 13, cursor: 'pointer', fontWeight: 600,
              border: `1px solid ${refLang === lang.code ? 'rgba(120,180,120,0.8)' : 'rgba(120,180,120,0.25)'}`,
              background: refLang === lang.code ? 'rgba(120,180,120,0.12)' : 'transparent',
              color: refLang === lang.code ? 'rgba(160,220,160,0.9)' : 'rgba(245,236,215,0.4)',
            }}>{lang.label}</button>
          ))}
          {/* Separator */}
          <span style={{ width: 1, height: 20, background: 'rgba(201,168,76,0.2)', margin: '0 6px', flexShrink: 0 }} />
          {/* Target language */}
          <span style={{ fontSize: 12, color: 'rgba(245,236,215,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 4 }}>Cible :</span>
          {languages.filter(l => l.code !== refLang).map(lang => (
            <button key={lang.code} onClick={() => switchTo(activeType, lang.code)} style={{
              padding: '4px 14px', borderRadius: 4, fontSize: 13, cursor: 'pointer', fontWeight: 600,
              border: `1px solid ${activeLang === lang.code ? 'var(--tdr-gold, #c9a84c)' : 'rgba(201,168,76,0.3)'}`,
              background: activeLang === lang.code ? 'rgba(201,168,76,0.15)' : 'transparent',
              color: activeLang === lang.code ? '#c9a84c' : 'rgba(245,236,215,0.5)',
            }}>{lang.label}</button>
          ))}
          {showAddLang ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <select
                ref={selectRef}
                value={newCode}
                onChange={e => setNewCode(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddLang()}
                style={{ padding: '3px 8px', borderRadius: 3, fontSize: 13, background: '#1a1410', border: '1px solid rgba(201,168,76,0.4)', color: '#f5ecd7', minWidth: 180 }}
              >
                <option value="">— Choisir une langue —</option>
                {ALL_LANGUAGES
                  .filter(l => !languages.some(existing => existing.code === l.code))
                  .map(l => (
                    <option key={l.code} value={l.code}>{l.label} ({l.code})</option>
                  ))}
              </select>
              <button onClick={handleAddLang} disabled={!newCode} style={{ padding: '3px 10px', borderRadius: 3, fontSize: 13, cursor: newCode ? 'pointer' : 'not-allowed', background: newCode ? '#c9a84c' : 'rgba(201,168,76,0.2)', border: 'none', color: newCode ? '#1a1410' : 'rgba(245,236,215,0.3)', fontWeight: 700 }}>✓</button>
              <button onClick={() => { setShowAddLang(false); setNewCode('') }} style={{ padding: '3px 8px', borderRadius: 3, fontSize: 13, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(201,168,76,0.3)', color: 'rgba(245,236,215,0.5)' }}>✕</button>
            </div>
          ) : (
            <button onClick={() => { setShowAddLang(true); setTimeout(() => selectRef.current?.focus(), 50) }} style={{
              padding: '4px 12px', borderRadius: 4, fontSize: 13, cursor: 'pointer',
              border: '1px dashed rgba(201,168,76,0.35)', background: 'transparent', color: 'rgba(201,168,76,0.6)',
            }}>+ Nouvelle langue</button>
          )}
        </div>

        {/* Body */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Sidebar */}
          <div style={{ width: 180, flexShrink: 0, background: 'rgba(0,0,0,0.3)', borderRight: '1px solid rgba(201,168,76,0.2)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            <div style={{ padding: '8px 16px 4px', fontSize: 10, color: 'rgba(201,168,76,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Contenu</div>
            {CONTENT_TYPES.map(ct => (
              <button key={ct.key} onClick={() => switchTo(ct.key, activeLang)} style={{
                padding: '10px 16px', background: 'transparent', border: 'none', cursor: 'pointer',
                textAlign: 'left', fontSize: 14,
                color: activeType === ct.key ? '#c9a84c' : 'rgba(245,236,215,0.6)',
                borderLeft: activeType === ct.key ? '3px solid #c9a84c' : '3px solid transparent',
                borderBottom: '1px solid rgba(201,168,76,0.08)',
              }}>{ct.label}</button>
            ))}
            <div style={{ padding: '10px 16px 4px', fontSize: 10, color: 'rgba(201,168,76,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', borderTop: '1px solid rgba(201,168,76,0.15)', marginTop: 4 }}>Application</div>
            <button onClick={() => switchTo(UI_TYPE, activeLang)} style={{
              padding: '10px 16px', background: 'transparent', border: 'none', cursor: 'pointer',
              textAlign: 'left', fontSize: 14,
              color: activeType === UI_TYPE ? '#c9a84c' : 'rgba(245,236,215,0.6)',
              borderLeft: activeType === UI_TYPE ? '3px solid #c9a84c' : '3px solid transparent',
              borderBottom: '1px solid rgba(201,168,76,0.08)',
            }}>Interface</button>
          </div>

          {/* Table area */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Filter */}
            <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(201,168,76,0.15)' }}>
              <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filtrer…"
                style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: 4, fontSize: 13, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(201,168,76,0.25)', color: '#f5ecd7', outline: 'none' }} />
            </div>

            {!activeLang ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(245,236,215,0.3)', fontSize: 14 }}>
                Sélectionnez ou créez une langue cible
              </div>
            ) : activeType === 'voies' ? (
              /* ── Grouped voies view ── */
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {/* Column headers */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', position: 'sticky', top: 0, background: '#1a1410', zIndex: 2, borderBottom: '2px solid rgba(201,168,76,0.3)' }}>
                  <div style={{ padding: '8px 14px', fontSize: 12, color: 'rgba(201,168,76,0.6)', textTransform: 'uppercase', letterSpacing: '0.06em', borderRight: '1px solid rgba(201,168,76,0.15)' }}>
                    {refLangLabel} (référence)
                  </div>
                  <div style={{ padding: '8px 14px', fontSize: 12, color: 'rgba(201,168,76,0.6)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {activeLangLabel} (traduction)
                  </div>
                </div>

                {filteredVoies.length === 0 && (
                  <div style={{ padding: '24px 16px', color: 'rgba(245,236,215,0.3)', fontSize: 13, textAlign: 'center' }}>Aucun résultat</div>
                )}

                {filteredVoies.map(voieName => {
                  const expanded = expandedVoies.has(voieName)
                  return (
                    <div key={voieName} style={{ borderBottom: '1px solid rgba(201,168,76,0.12)' }}>
                      {/* Voie name header row */}
                      <div
                        onClick={() => toggleVoie(voieName)}
                        style={{ display: 'grid', gridTemplateColumns: '24px 1fr 1fr', alignItems: 'center', background: 'rgba(201,168,76,0.08)', cursor: 'pointer', borderBottom: expanded ? '1px solid rgba(201,168,76,0.12)' : 'none' }}
                      >
                        <span style={{ padding: '8px 4px 8px 10px', fontSize: 11, color: 'rgba(201,168,76,0.5)', userSelect: 'none' }}>{expanded ? '▼' : '▶'}</span>
                        <span style={{ padding: '8px 14px', fontSize: 15, fontWeight: 600, color: 'rgba(245,236,215,0.7)', borderRight: '1px solid rgba(201,168,76,0.15)' }}>{refText(voieName)}</span>
                        <div style={{ padding: '6px 10px' }} onClick={e => e.stopPropagation()}>
                          <input
                            value={edits[voieName] ?? ''}
                            onChange={e => handleEdit(voieName, e.target.value)}
                            style={INPUT_STYLE}
                            placeholder={voieName}
                          />
                        </div>
                      </div>

                      {/* Rang rows */}
                      {expanded && Array.from({ length: 5 }, (_, i) => {
                        const nomKey = `${voieName}|${i}|nom`
                        const descKey = `${voieName}|${i}|desc`
                        const refNom = refText(nomKey)
                        const refDesc = refText(descKey)
                        return (
                          <div key={i} style={{ background: i % 2 === 0 ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.08)', borderTop: '1px solid rgba(201,168,76,0.06)' }}>
                            <div style={{ padding: '4px 14px 2px 34px', fontSize: 11, color: 'rgba(201,168,76,0.45)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              Rang {i + 1}
                            </div>
                            {/* nom sub-row */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', paddingLeft: 20 }}>
                              <div style={{ padding: '4px 14px', fontSize: 14, color: 'rgba(245,236,215,0.65)', borderRight: '1px solid rgba(201,168,76,0.1)', alignSelf: 'center', fontStyle: 'italic', display: 'flex', gap: 8, alignItems: 'baseline' }}>
                                <span style={{ fontSize: 10, fontStyle: 'normal', background: 'rgba(201,168,76,0.15)', color: '#c9a84c', borderRadius: 3, padding: '1px 5px', flexShrink: 0 }}>Nom</span>
                                {refNom}
                              </div>
                              <div style={{ padding: '4px 10px' }}>
                                <input
                                  value={edits[nomKey] ?? ''}
                                  onChange={e => handleEdit(nomKey, e.target.value)}
                                  style={INPUT_STYLE}
                                  placeholder={refNom}
                                />
                              </div>
                            </div>
                            {/* desc sub-row */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', paddingLeft: 20, paddingBottom: 8 }}>
                              <div style={{ padding: '4px 14px 4px 14px', fontSize: 13, color: 'rgba(245,236,215,0.5)', borderRight: '1px solid rgba(201,168,76,0.1)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                <span style={{ fontSize: 10, fontStyle: 'normal', background: 'rgba(100,140,201,0.15)', color: 'rgba(150,180,230,0.7)', borderRadius: 3, padding: '1px 5px', flexShrink: 0, marginTop: 1 }}>Desc</span>
                                <span>{refDesc}</span>
                              </div>
                              <div style={{ padding: '4px 10px' }}>
                                <textarea
                                  value={edits[descKey] ?? ''}
                                  onChange={e => handleEdit(descKey, e.target.value)}
                                  style={TEXTAREA_STYLE}
                                  placeholder={refDesc}
                                />
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            ) : isGroupedSimple ? (
              /* ── Grouped simple view (traits-raciaux, talents): name + desc ── */
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', position: 'sticky', top: 0, background: '#1a1410', zIndex: 2, borderBottom: '2px solid rgba(201,168,76,0.3)' }}>
                  <div style={{ padding: '8px 14px', fontSize: 12, color: 'rgba(201,168,76,0.6)', textTransform: 'uppercase', letterSpacing: '0.06em', borderRight: '1px solid rgba(201,168,76,0.15)' }}>
                    {refLangLabel} (référence)
                  </div>
                  <div style={{ padding: '8px 14px', fontSize: 12, color: 'rgba(201,168,76,0.6)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {activeLangLabel} (traduction)
                  </div>
                </div>

                {filteredGroupedSimpleNames.length === 0 && (
                  <div style={{ padding: '24px 16px', color: 'rgba(245,236,215,0.3)', fontSize: 13, textAlign: 'center' }}>Aucun résultat</div>
                )}

                {filteredGroupedSimpleNames.map(baseName => {
                  const expanded = expandedVoies.has(baseName)
                  const descKey = `${baseName}|desc`
                  return (
                    <div key={baseName} style={{ borderBottom: '1px solid rgba(201,168,76,0.12)' }}>
                      {/* Name header row */}
                      <div
                        onClick={() => toggleVoie(baseName)}
                        style={{ display: 'grid', gridTemplateColumns: '24px 1fr 1fr', alignItems: 'center', background: 'rgba(201,168,76,0.08)', cursor: 'pointer', borderBottom: expanded ? '1px solid rgba(201,168,76,0.12)' : 'none' }}
                      >
                        <span style={{ padding: '8px 4px 8px 10px', fontSize: 11, color: 'rgba(201,168,76,0.5)', userSelect: 'none' }}>{expanded ? '▼' : '▶'}</span>
                        <span style={{ padding: '8px 14px', fontSize: 15, fontWeight: 600, color: 'rgba(245,236,215,0.7)', borderRight: '1px solid rgba(201,168,76,0.15)' }}>{refText(baseName)}</span>
                        <div style={{ padding: '6px 10px' }} onClick={e => e.stopPropagation()}>
                          <input
                            value={edits[baseName] ?? ''}
                            onChange={e => handleEdit(baseName, e.target.value)}
                            style={INPUT_STYLE}
                            placeholder={baseName}
                          />
                        </div>
                      </div>

                      {/* Description row when expanded */}
                      {expanded && (
                        <div style={{ background: 'rgba(0,0,0,0.18)', borderTop: '1px solid rgba(201,168,76,0.06)', paddingBottom: 8 }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', paddingLeft: 20 }}>
                            <div style={{ padding: '8px 14px', fontSize: 13, color: 'rgba(245,236,215,0.5)', borderRight: '1px solid rgba(201,168,76,0.1)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                              <span style={{ fontSize: 10, fontStyle: 'normal', background: 'rgba(100,140,201,0.15)', color: 'rgba(150,180,230,0.7)', borderRadius: 3, padding: '1px 5px', flexShrink: 0, marginTop: 1 }}>Desc</span>
                              <span>{refText(descKey)}</span>
                            </div>
                            <div style={{ padding: '6px 10px' }}>
                              <textarea
                                value={edits[descKey] ?? ''}
                                onChange={e => handleEdit(descKey, e.target.value)}
                                style={TEXTAREA_STYLE}
                                placeholder={refText(descKey)}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              /* ── Flat table for other types ── */
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', position: 'sticky', top: 0, background: '#1a1410', zIndex: 2, borderBottom: '2px solid rgba(201,168,76,0.3)' }}>
                  <div style={{ padding: '8px 14px', fontSize: 12, color: 'rgba(201,168,76,0.6)', textTransform: 'uppercase', letterSpacing: '0.06em', borderRight: '1px solid rgba(201,168,76,0.15)' }}>
                    {refLangLabel} (référence)
                  </div>
                  <div style={{ padding: '8px 14px', fontSize: 12, color: 'rgba(201,168,76,0.6)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {activeLangLabel} (traduction)
                  </div>
                </div>

                {filteredFlatKeys.length === 0 && (
                  <div style={{ padding: '24px 16px', color: 'rgba(245,236,215,0.3)', fontSize: 13, textAlign: 'center' }}>Aucun résultat</div>
                )}
                {filteredFlatKeys.map((key, i) => (
                  <div key={key} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', background: i % 2 === 1 ? 'rgba(0,0,0,0.2)' : 'transparent', borderBottom: '1px solid rgba(201,168,76,0.06)' }}>
                    <div style={{ padding: '8px 14px', fontSize: 15, color: 'rgba(245,236,215,0.7)', borderRight: '1px solid rgba(201,168,76,0.1)', wordBreak: 'break-word', alignSelf: 'center' }}>
                      {refText(key)}
                    </div>
                    <div style={{ padding: '6px 10px' }}>
                      {isLong ? (
                        <textarea
                          value={edits[key] ?? ''}
                          onChange={e => handleEdit(key, e.target.value)}
                          rows={3}
                          style={{ ...TEXTAREA_STYLE }}
                        />
                      ) : (
                        <input
                          value={edits[key] ?? ''}
                          onChange={e => handleEdit(key, e.target.value)}
                          style={INPUT_STYLE}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderTop: '1px solid rgba(201,168,76,0.25)', flexWrap: 'wrap' }}>
          <button onClick={handleSave} disabled={!activeLang || saving} style={{
            padding: '7px 20px', borderRadius: 4, fontSize: 14, cursor: activeLang ? 'pointer' : 'not-allowed',
            background: activeLang ? '#c9a84c' : 'rgba(201,168,76,0.2)',
            border: 'none', color: activeLang ? '#1a1410' : 'rgba(245,236,215,0.3)', fontWeight: 700,
          }}>
            {saving ? '…' : 'Enregistrer'}
          </button>
          {dirty && (
            <span style={{ fontSize: 12, color: 'rgba(255,180,60,0.8)' }}>• Modifications non enregistrées</span>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={handleCopyPath} title="Copier le chemin" style={{
            background: 'transparent', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 4,
            padding: '4px 10px', fontSize: 11, color: 'rgba(245,236,215,0.4)', cursor: 'pointer',
            maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {copied ? '✓ Copié' : `📁 ${localeDir || 'Dossier locales'}`}
          </button>
        </div>
      </div>
    </div>
  )
}
