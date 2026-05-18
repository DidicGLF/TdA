import { useState } from 'react'
import type { Character } from '../types/character'

const STORAGE_KEY = 'tdr_personnages'

interface SavedEntry {
  id: string
  nom: string
  date: string
  character: Character
}

function load(): SavedEntry[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') }
  catch { return [] }
}

function store(entries: SavedEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
}

interface Props {
  character: Character
  onLoad: (c: Character) => void
  onNew: () => void
  onClose: () => void
}

export default function SaveLoadPanel({ character, onLoad, onNew, onClose }: Props) {
  const [entries, setEntries] = useState<SavedEntry[]>(load)
  const [confirm, setConfirm] = useState<string | null>(null)

  const nomPerso = character.nomPersonnage?.trim() || character.nomJoueur?.trim() || 'Personnage sans nom'

  const save = () => {
    const existing = entries.find(e => e.nom === nomPerso)
    const entry: SavedEntry = {
      id: existing?.id ?? crypto.randomUUID(),
      nom: nomPerso,
      date: new Date().toISOString(),
      character,
    }
    const next = existing
      ? entries.map(e => e.id === entry.id ? entry : e)
      : [...entries, entry]
    store(next)
    setEntries(next)
  }

  const remove = (id: string) => {
    const next = entries.filter(e => e.id !== id)
    store(next)
    setEntries(next)
    setConfirm(null)
  }

  const fmt = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
      + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
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
        borderRadius: 8,
        padding: '24px 28px',
        minWidth: 360, maxWidth: 480, width: '90vw',
        boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
        display: 'flex', flexDirection: 'column', gap: 16,
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: "'Cinzel', serif", fontSize: 16, color: 'var(--tdr-gold)', fontWeight: 700 }}>
            Personnages
          </span>
          <button onClick={onClose} style={{ ...btn, border: 'none', opacity: 0.5 }}>✕</button>
        </div>

        {/* Sauvegarder le personnage courant */}
        <div style={{
          background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.2)',
          borderRadius: 6, padding: '12px 14px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 13, color: 'var(--tdr-parchment)', fontWeight: 600 }}>{nomPerso}</div>
            <div style={{ fontSize: 11, color: 'rgba(245,236,215,0.45)', marginTop: 2 }}>
              {character.peuple || '—'} · Niv. {character.niveau}
            </div>
          </div>
          <button onClick={save} style={{ ...btn, background: 'rgba(201,168,76,0.15)', whiteSpace: 'nowrap' }}>
            Sauvegarder
          </button>
        </div>

        {/* Liste */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
          {entries.length === 0 ? (
            <div style={{ color: 'rgba(245,236,215,0.35)', fontSize: 12, textAlign: 'center', padding: '12px 0' }}>
              Aucune fiche sauvegardée
            </div>
          ) : entries.map(e => (
            <div key={e.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '8px 10px', borderRadius: 5,
              border: '1px solid rgba(201,168,76,0.15)',
              background: 'rgba(255,255,255,0.02)',
              gap: 8,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--tdr-parchment)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.nom}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(245,236,215,0.4)', marginTop: 1 }}>
                  {e.character.peuple || '—'} · Niv. {e.character.niveau} · {fmt(e.date)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button onClick={() => { onLoad(e.character); onClose() }} style={btn}>Charger</button>
                {confirm === e.id ? (
                  <>
                    <button onClick={() => remove(e.id)} style={btnDanger}>Confirmer</button>
                    <button onClick={() => setConfirm(null)} style={{ ...btn, opacity: 0.5 }}>✕</button>
                  </>
                ) : (
                  <button onClick={() => setConfirm(e.id)} style={btnDanger}>Supprimer</button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Nouveau personnage */}
        <div style={{ borderTop: '1px solid rgba(201,168,76,0.15)', paddingTop: 12 }}>
          <button onClick={() => { onNew(); onClose() }} style={{ ...btn, width: '100%', textAlign: 'center', opacity: 0.7 }}>
            + Nouveau personnage
          </button>
        </div>
      </div>
    </div>
  )
}
