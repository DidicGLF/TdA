import { useState, useRef, useEffect } from 'react'
import type { VoieEntry } from '../data/voies'

interface Props {
  value: string
  onChange: (val: string) => void
  options: VoieEntry[]
  alreadyChosen?: string[]
  placeholder?: string
}

export default function VoieCombobox({ value, onChange, options, alreadyChosen = [], placeholder }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value)
  const ref = useRef<HTMLDivElement>(null)

  // Keep query in sync when value changes externally
  useEffect(() => { setQuery(value) }, [value])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const filtered = options.filter(v =>
    v.nom.toLowerCase().includes(query.toLowerCase()),
  )

  const profil = filtered.filter(v => v.categorie === 'profil')
  const prestige = filtered.filter(v => v.categorie === 'prestige')

  const select = (nom: string) => {
    onChange(nom)
    setQuery(nom)
    setOpen(false)
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        type="text"
        value={query}
        placeholder={open && !query && value ? value : placeholder}
        onFocus={() => {
          setQuery('')
          setOpen(true)
        }}
        onChange={e => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onBlur={() => {
          setTimeout(() => {
            setOpen(false)
            setQuery(value)
          }, 150)
        }}
        className="w-full border rounded px-3 py-1.5 text-base"
        style={{
          background: 'rgba(15,12,8,0.92)',
          borderColor: open ? 'rgba(201,168,76,0.8)' : 'rgba(201,168,76,0.35)',
          color: 'var(--tdr-parchment)',
          outline: 'none',
        }}
      />

      {open && (profil.length > 0 || prestige.length > 0) && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          zIndex: 50,
          background: 'rgba(18,14,9,0.98)',
          border: '1px solid rgba(201,168,76,0.4)',
          borderRadius: 4,
          maxHeight: 240,
          overflowY: 'auto',
          boxShadow: '0 4px 20px rgba(0,0,0,0.7)',
          marginTop: 2,
        }}>
          {profil.length > 0 && (
            <>
              <div style={{
                padding: '4px 10px',
                fontSize: 12,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                color: 'rgba(201,168,76,0.5)',
                borderBottom: '1px solid rgba(201,168,76,0.1)',
              }}>
                Voies de profil
              </div>
              {profil.map(v => (
                <OptionRow key={v.nom} entry={v} chosen={alreadyChosen.includes(v.nom)} onSelect={select} />
              ))}
            </>
          )}
          {prestige.length > 0 && (
            <>
              <div style={{
                padding: '4px 10px',
                fontSize: 12,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                color: 'rgba(201,168,76,0.5)',
                borderBottom: '1px solid rgba(201,168,76,0.1)',
                borderTop: profil.length > 0 ? '1px solid rgba(201,168,76,0.1)' : undefined,
              }}>
                Voies de prestige
              </div>
              {prestige.map(v => (
                <OptionRow key={v.nom} entry={v} chosen={alreadyChosen.includes(v.nom)} onSelect={select} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function OptionRow({ entry, chosen, onSelect }: { entry: VoieEntry; chosen: boolean; onSelect: (n: string) => void }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onMouseDown={() => { if (!chosen) onSelect(entry.nom) }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '6px 12px',
        fontSize: 15,
        cursor: chosen ? 'default' : 'pointer',
        color: chosen ? 'rgba(245,236,215,0.4)' : 'var(--tdr-parchment)',
        background: hovered ? 'rgba(201,168,76,0.12)' : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
      }}
    >
      <span>{entry.nom}</span>
      {chosen && (
        <span style={{ fontSize: 12, color: 'rgba(201,168,76,0.5)', flexShrink: 0 }}>déjà choisie</span>
      )}
    </div>
  )
}
