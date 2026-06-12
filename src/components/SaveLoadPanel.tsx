import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useModalBackButton } from '../hooks/useModalBackButton'
import { saveDataFile } from '../utils/tauriStorage'
import type { Character } from '../types/character'

export interface SavedEntry {
  id: string
  nom: string
  date: string
  maxStep?: number
  character: Character
}

interface Props {
  character: Character
  maxStep: number
  library: SavedEntry[]
  onLibraryChange: (entries: SavedEntry[]) => void
  onLoad: (c: Character, maxStep: number) => void
  onNew: () => void
  onClose: () => void
}

export default function SaveLoadPanel({ character, maxStep, library, onLibraryChange, onLoad, onNew, onClose }: Props) {
  useModalBackButton(onClose)
  const { t, i18n } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  const nomPerso = character.nomPersonnage?.trim() || character.nomJoueur?.trim() || t('saveLoad.nomSansNom')
  const locale = i18n.language === 'fr' ? 'fr-FR' : 'en-GB'

  const fmt = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: '2-digit' })
      + ' ' + d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  }

  const addToLibrary = () => {
    const existing = library.find(e => e.nom === nomPerso)
    const entry: SavedEntry = {
      id: existing?.id ?? crypto.randomUUID(),
      nom: nomPerso,
      date: new Date().toISOString(),
      maxStep,
      character,
    }
    onLibraryChange(existing
      ? library.map(e => e.id === entry.id ? entry : e)
      : [...library, entry]
    )
  }

  const remove = (id: string) => {
    onLibraryChange(library.filter(e => e.id !== id))
    setConfirm(null)
  }

  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

  const downloadJson = async (filename: string, payload: unknown) => {
    const content = JSON.stringify(payload, null, 2)
    if (isTauri) {
      await saveDataFile(filename, content)
      setSaveMsg(t('saveLoad.enregistreDans', { filename }))
      setTimeout(() => setSaveMsg(null), 3000)
    } else {
      const blob = new Blob([content], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = filename; a.click()
      URL.revokeObjectURL(url)
    }
  }

  const exportLibrary = () => downloadJson('personnages-tdr.json', library)

  const exportCharacter = (entry: SavedEntry) => {
    const safe = entry.nom.replace(/[^a-zA-Z0-9À-ÿ _-]/g, '').trim().replace(/\s+/g, '-')
    downloadJson(`${safe}.json`, entry)
  }

  const importLibrary = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target?.result as string)
        if (Array.isArray(data)) {
          onLibraryChange(data)
        } else if (data.character !== undefined && data.nom !== undefined) {
          // Format SavedEntry exporté individuellement
          const entry: SavedEntry = {
            id: data.id ?? crypto.randomUUID(),
            nom: data.nom,
            date: data.date ?? new Date().toISOString(),
            maxStep: data.maxStep,
            character: data.character,
          }
          onLibraryChange([...library, entry])
        } else if (data.nomPersonnage !== undefined || data.nomJoueur !== undefined) {
          // Ancien format (personnage nu sans enveloppe SavedEntry)
          const entry: SavedEntry = {
            id: crypto.randomUUID(),
            nom: data.nomPersonnage?.trim() || data.nomJoueur?.trim() || t('saveLoad.nomImporte'),
            date: new Date().toISOString(),
            character: data,
          }
          onLibraryChange([...library, entry])
        } else {
          alert(t('saveLoad.fichierNonReconnu'))
        }
      } catch {
        alert(t('saveLoad.fichierInvalide'))
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const btn: React.CSSProperties = {
    padding: '5px 12px', borderRadius: 4, fontSize: 12, cursor: 'pointer',
    border: '1px solid rgba(201,168,76,0.4)', background: 'transparent',
    color: 'var(--tdr-gold)', letterSpacing: '0.04em',
  }

  const btnDanger: React.CSSProperties = {
    ...btn, color: '#e05555', borderColor: 'rgba(220,80,80,0.4)',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: 'rgba(20,15,8,0.99)',
        border: '1px solid rgba(201,168,76,0.35)',
        borderRadius: 8, padding: '24px 28px',
        minWidth: 360, maxWidth: 480, width: '90vw',
        boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
        display: 'flex', flexDirection: 'column', gap: 16,
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: "'Cinzel', serif", fontSize: 16, color: 'var(--tdr-gold)', fontWeight: 700 }}>
            {t('toolbar.personnages')}
          </span>
          <button onClick={onClose} style={{ ...btn, border: 'none', opacity: 0.5 }}>✕</button>
        </div>

        {/* Personnage courant */}
        <div style={{
          background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.2)',
          borderRadius: 6, padding: '12px 14px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 13, color: 'var(--tdr-parchment)', fontWeight: 600 }}>{nomPerso}</div>
            <div style={{ fontSize: 11, color: 'rgba(245,236,215,0.45)', marginTop: 2 }}>
              {character.peuple || '—'} · {t('toolbar.niveau', { niveau: character.niveau })}
            </div>
          </div>
          <button onClick={addToLibrary} style={{ ...btn, background: 'rgba(201,168,76,0.15)', whiteSpace: 'nowrap' }}>
            {t('saveLoad.sauvegarder')}
          </button>
        </div>

        {/* Liste */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
          {library.length === 0 ? (
            <div style={{ color: 'rgba(245,236,215,0.35)', fontSize: 12, textAlign: 'center', padding: '12px 0' }}>
              {t('saveLoad.aucunPersonnage')}
            </div>
          ) : library.map(e => (
            <div key={e.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '8px 10px', borderRadius: 5,
              border: '1px solid rgba(201,168,76,0.15)',
              background: 'rgba(255,255,255,0.02)', gap: 8,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--tdr-parchment)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.nom}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(245,236,215,0.4)', marginTop: 1 }}>
                  {e.character.peuple || '—'} · {t('toolbar.niveau', { niveau: e.character.niveau })} · {fmt(e.date)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button onClick={() => exportCharacter(e)} style={btn} title={t('saveLoad.exporterTitle')}>↓</button>
                <button onClick={() => { onLoad(e.character, e.maxStep ?? 0); onClose() }} style={btn}>{t('saveLoad.charger')}</button>
                {confirm === e.id ? (
                  <>
                    <button onClick={() => remove(e.id)} style={btnDanger}>{t('saveLoad.confirmerSuppression')}</button>
                    <button onClick={() => setConfirm(null)} style={{ ...btn, opacity: 0.5 }}>✕</button>
                  </>
                ) : (
                  <button onClick={() => setConfirm(e.id)} style={btnDanger}>{t('saveLoad.supprimer')}</button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Message confirmation export */}
        {saveMsg && (
          <div style={{ fontSize: 12, color: 'rgba(201,168,76,0.9)', textAlign: 'center',
            background: 'rgba(201,168,76,0.08)', borderRadius: 4, padding: '6px 10px' }}>
            ✓ {saveMsg}
          </div>
        )}

        {/* Import / Export */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => fileInputRef.current?.click()} style={{ ...btn, flex: 1, textAlign: 'center' }}>
            {t('saveLoad.importer')}
          </button>
          <button onClick={exportLibrary} disabled={library.length === 0}
            style={{ ...btn, flex: 1, textAlign: 'center', opacity: library.length === 0 ? 0.35 : 1 }}>
            {t('saveLoad.exporterBiblio')}
          </button>
          <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={importLibrary} />
        </div>

        {/* Nouveau */}
        <div style={{ borderTop: '1px solid rgba(201,168,76,0.15)', paddingTop: 12 }}>
          <button onClick={() => { onNew(); onClose() }} style={{ ...btn, width: '100%', textAlign: 'center', opacity: 0.7 }}>
            {t('saveLoad.nouveauPersonnage')}
          </button>
        </div>

      </div>
    </div>
  )
}
