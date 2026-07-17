import { useState } from 'react'
import { getStatAvecBuff } from '../../utils/combat'
import type { StatBuff } from '../../utils/combat'

const GOLD = '#c9a84c'
const PARCHMENT = '#f5ecd7'
const GREEN = 'rgba(74,222,128,0.95)'
const RED = 'rgba(255,150,150,0.95)'

interface Props {
  label: string
  base: string | number | undefined
  stat: string
  buffs: StatBuff[]
  onSetBuff: (stat: string, valeur: number) => void
  onClearBuff: (stat: string) => void
}

// Cellule de stat cliquable, partagée entre cartes créature et PJ : affiche la valeur (base + buffs
// actifs, colorée vert/rouge selon le cumul), clic pour ouvrir un petit éditeur de modificateur signé.
export default function StatCell({ label, base, stat, buffs, onSetBuff, onClearBuff }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const { value, net } = getStatAvecBuff(base, buffs, stat)
  const color = net > 0 ? GREEN : net < 0 ? RED : PARCHMENT

  const apply = () => {
    const n = parseInt(draft)
    if (!Number.isNaN(n) && n !== 0) onSetBuff(stat, n)
    setEditing(false); setDraft('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minWidth: 46 }}>
      <span style={{ fontSize: 12, opacity: 0.55, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      {editing ? (
        <input
          autoFocus type="text" value={draft} placeholder="+2"
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') apply(); if (e.key === 'Escape') setEditing(false) }}
          onBlur={apply}
          style={{ width: 48, fontSize: 15, textAlign: 'center', background: 'rgba(255,255,255,0.06)', border: `1px solid ${GOLD}`, borderRadius: 3, color: PARCHMENT }}
        />
      ) : (
        <span
          onClick={e => { e.stopPropagation(); if (net !== 0) { onClearBuff(stat) } else { setEditing(true) } }}
          title={net !== 0 ? 'Cliquer pour retirer le modificateur' : 'Cliquer pour appliquer un bonus/malus'}
          style={{ fontSize: 17, fontWeight: 700, color, cursor: 'pointer' }}
        >
          {value}
        </span>
      )}
    </div>
  )
}
