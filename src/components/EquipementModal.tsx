import { useState, useRef } from 'react'
import type { Character } from '../types/character'
import ARMES_DATA from '../data/armes.json'
import ARMURES_DATA from '../data/armures.json'

type EntreeArme   = { nom: string; dm: string; mod: string; prix: string; portee?: string }
type EntreeArmure = { nom: string; def: number; prix: string }
type CatArme      = { categorie: string; entrees: EntreeArme[]; notes?: string }
type CatArmure    = { categorie: string; entrees: EntreeArmure[]; notes?: string }
type GroupeArme   = { groupe: string; categories: CatArme[] }

interface Props {
  character: Character
  onChange: (patch: Partial<Character>) => void
  onClose: () => void
}

const S = {
  gold: 'var(--tdr-gold)',
  parchment: 'var(--tdr-parchment)',
  border: 'rgba(201,168,76,0.25)',
  bg: 'rgba(15,12,8,0.92)',
}

const cell: React.CSSProperties = {
  padding: '5px 8px', fontSize: 15,
  borderBottom: '1px solid rgba(201,168,76,0.1)',
  color: 'var(--tdr-parchment)',
  verticalAlign: 'middle',
}

const headCell: React.CSSProperties = {
  ...cell,
  color: 'var(--tdr-gold)', fontWeight: 600,
  fontSize: 14, letterSpacing: '0.06em', textTransform: 'uppercase',
  borderBottom: '1px solid rgba(201,168,76,0.3)',
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(201,168,76,0.3)', borderRadius: 3,
  color: 'var(--tdr-parchment)', fontSize: 14,
  padding: '2px 5px', outline: 'none',
}

function exportJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

const isDistance = (groupe: string) => groupe.toLowerCase().includes('distance')

const stripExposants = (s: string) => s.replace(/[¹²³⁴⁵⁶⁷*]\s*/g, '').trim()

type DragSrc =
  | { type: 'groupe'; gi: number }
  | { type: 'cat'; gi: number; ci: number }

export default function EquipementModal({ character, onChange, onClose }: Props) {
  const [section,      setSection]      = useState<'armes' | 'armures'>('armes')
  const [editMode,     setEditMode]     = useState(false)
  const [exported,     setExported]     = useState(false)
  const [activeKey,    setActiveKey]    = useState('0-0')
  const [dragOver,     setDragOver]     = useState<string | null>(null)

  const [groupes,      setGroupes]      = useState<GroupeArme[]> (() => JSON.parse(JSON.stringify(ARMES_DATA.groupes)))
  const [armures,      setArmures]      = useState<CatArmure[]>  (() => JSON.parse(JSON.stringify(ARMURES_DATA.categories)))
  const [armesNotes,   setArmesNotes]   = useState<string>(() => ARMES_DATA.notes ?? '')
  const [armuresNotes, setArmuresNotes] = useState<string>(() => ARMURES_DATA.notes ?? '')

  const sectionRefs = useRef<(HTMLDivElement | null)[]>([])
  const dragSrc     = useRef<DragSrc | null>(null)

  const scrollTo = (key: string, flatIdx: number) => {
    setActiveKey(key)
    sectionRefs.current[flatIdx]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  /* ── réorganisation ── */
  const reorderGroupes = (toGi: number) => {
    if (!dragSrc.current || dragSrc.current.type !== 'groupe') return
    const fromGi = dragSrc.current.gi
    if (fromGi === toGi) return
    setGroupes(prev => {
      const next = [...prev]
      const [item] = next.splice(fromGi, 1)
      next.splice(toGi, 0, item)
      return next
    })
    setExported(false)
  }

  const reorderCats = (toGi: number, toCi: number) => {
    if (!dragSrc.current || dragSrc.current.type !== 'cat') return
    const { gi: fromGi, ci: fromCi } = dragSrc.current
    if (fromGi === toGi && fromCi === toCi) return
    setGroupes(prev => {
      const next = prev.map(g => ({ ...g, categories: [...g.categories] }))
      const [item] = next[fromGi].categories.splice(fromCi, 1)
      next[toGi].categories.splice(toCi, 0, item)
      return next
    })
    setExported(false)
  }

  /* ── édition groupes ── */
  const renameGroupe = (gi: number, groupe: string) => {
    setGroupes(prev => prev.map((g, i) => i !== gi ? g : { ...g, groupe }))
    setExported(false)
  }
  const removeGroupe = (gi: number) => {
    setGroupes(prev => prev.filter((_, i) => i !== gi))
    setExported(false)
  }
  const addGroupe = () => {
    setGroupes(prev => [...prev, { groupe: 'Nouveau groupe', categories: [] }])
    setExported(false)
  }

  /* ── édition catégories armes ── */
  const renameCatArme = (gi: number, ci: number, categorie: string) => {
    setGroupes(prev => prev.map((g, i) => i !== gi ? g : {
      ...g, categories: g.categories.map((c, j) => j !== ci ? c : { ...c, categorie }),
    }))
    setExported(false)
  }
  const removeCatArme = (gi: number, ci: number) => {
    setGroupes(prev => prev.map((g, i) => i !== gi ? g : {
      ...g, categories: g.categories.filter((_, j) => j !== ci),
    }))
    setExported(false)
  }
  const addCatArme = (gi: number) => {
    setGroupes(prev => prev.map((g, i) => i !== gi ? g : {
      ...g, categories: [...g.categories, { categorie: 'Nouvelle catégorie', entrees: [] }],
    }))
    setExported(false)
  }

  /* ── édition entrées armes ── */
  const updateArme = (gi: number, ci: number, ei: number, patch: Partial<EntreeArme>) => {
    setGroupes(prev => prev.map((g, i) => i !== gi ? g : {
      ...g, categories: g.categories.map((c, j) => j !== ci ? c : {
        ...c, entrees: c.entrees.map((e, k) => k !== ei ? e : { ...e, ...patch }),
      }),
    }))
    setExported(false)
  }
  const addArmeEntry = (gi: number, ci: number) => {
    const dist = isDistance(groupes[gi].groupe)
    const entry: EntreeArme = dist
      ? { nom: '', dm: '', mod: '', portee: '', prix: '' }
      : { nom: '', dm: '', mod: 'FOR', prix: '' }
    setGroupes(prev => prev.map((g, i) => i !== gi ? g : {
      ...g, categories: g.categories.map((c, j) => j !== ci ? c : {
        ...c, entrees: [...c.entrees, entry],
      }),
    }))
    setExported(false)
  }
  const removeArmeEntry = (gi: number, ci: number, ei: number) => {
    setGroupes(prev => prev.map((g, i) => i !== gi ? g : {
      ...g, categories: g.categories.map((c, j) => j !== ci ? c : {
        ...c, entrees: c.entrees.filter((_, k) => k !== ei),
      }),
    }))
    setExported(false)
  }
  const updateArmeNotes = (gi: number, ci: number, notes: string) => {
    setGroupes(prev => prev.map((g, i) => i !== gi ? g : {
      ...g, categories: g.categories.map((c, j) => j !== ci ? c : { ...c, notes }),
    }))
    setExported(false)
  }

  /* ── édition armures ── */
  const renameCatArmure = (ci: number, categorie: string) => {
    setArmures(prev => prev.map((c, i) => i !== ci ? c : { ...c, categorie }))
    setExported(false)
  }
  const removeCatArmure = (ci: number) => {
    setArmures(prev => prev.filter((_, i) => i !== ci))
    setExported(false)
  }
  const addCatArmure = () => {
    setArmures(prev => [...prev, { categorie: 'Nouvelle catégorie', entrees: [] }])
    setExported(false)
  }
  const updateArmure = (ci: number, ei: number, patch: Partial<EntreeArmure>) => {
    setArmures(prev => prev.map((c, i) => i !== ci ? c : {
      ...c, entrees: c.entrees.map((e, j) => j !== ei ? e : { ...e, ...patch }),
    }))
    setExported(false)
  }
  const addArmureEntry = (ci: number) => {
    setArmures(prev => prev.map((c, i) => i !== ci ? c : {
      ...c, entrees: [...c.entrees, { nom: '', def: 0, prix: '' }],
    }))
    setExported(false)
  }
  const removeArmureEntry = (ci: number, ei: number) => {
    setArmures(prev => prev.map((c, i) => i !== ci ? c : {
      ...c, entrees: c.entrees.filter((_, j) => j !== ei),
    }))
    setExported(false)
  }
  const updateArmureNotes = (ci: number, notes: string) => {
    setArmures(prev => prev.map((c, i) => i !== ci ? c : { ...c, notes }))
    setExported(false)
  }

  /* ── sélection personnage ── */
  const appendInv = (nom: string) => {
    const inv = character.inventaire.trim()
    return inv ? `${inv}, ${nom}` : nom
  }
  const removeInv = (nom: string) => {
    let inv = character.inventaire
    if (inv.includes(`, ${nom}`)) inv = inv.replace(`, ${nom}`, '')
    else if (inv.includes(`${nom}, `)) inv = inv.replace(`${nom}, `, '')
    else inv = inv.replace(nom, '')
    return inv.trim()
  }

  const addArme = (e: EntreeArme) =>
    onChange({
      armes: [...character.armes, { nom: e.nom, dm: e.dm, attaque: e.mod, special: '', prix: e.prix, portee: e.portee }],
      inventaire: appendInv(stripExposants(e.nom)),
    })
  const removeArme = (idx: number) => {
    const a = character.armes[idx]
    const stripped = stripExposants(a.nom)
    const isEquipped = stripExposants(character.arme1) === stripped || stripExposants(character.arme2) === stripped
    const patch: Partial<Character> = {
      armes: character.armes.filter((_, i) => i !== idx),
      inventaire: removeInv(isEquipped ? `${stripped} (Equip)` : stripped),
    }
    if (stripExposants(character.arme1) === stripped) { patch.arme1 = ''; patch.dmArme1 = '' }
    if (stripExposants(character.arme2) === stripped) { patch.arme2 = ''; patch.dmArme2 = '' }
    onChange(patch)
  }

  const equipeArmeSlot = (nom: string | null, slot: 1 | 2) => {
    const arme = nom ? character.armes.find(a => a.nom === nom) : null
    const prevNom = slot === 1 ? character.arme1 : character.arme2
    const stripped = nom ? stripExposants(nom) : null
    let inv = character.inventaire
    if (prevNom) inv = unmarkEquipe(inv, prevNom)
    if (nom)     inv = markEquipe(inv, nom)
    const dm = arme ? [arme.dm, arme.attaque].filter(Boolean).join(' ') : ''
    if (slot === 1) onChange({ arme1: stripped ?? '', dmArme1: dm, inventaire: inv })
    else            onChange({ arme2: stripped ?? '', dmArme2: dm, inventaire: inv })
  }
  const addArmure = (e: EntreeArmure) =>
    onChange({
      armuresEquipees: [...character.armuresEquipees, { nom: e.nom, def: e.def, prix: e.prix, equipe: false }],
      inventaire: appendInv(e.nom),
    })
  const removeArmure = (idx: number) => {
    const a = character.armuresEquipees[idx]
    const invNom = a.equipe ? `${a.nom} (Equip)` : a.nom
    onChange({
      armuresEquipees: character.armuresEquipees.filter((_, i) => i !== idx),
      inventaire: removeInv(invNom),
    })
  }

  const isBouclier = (nom: string) => nom.toLowerCase().includes('bouclier')

  const markEquipe = (inv: string, nom: string) => {
    const s = stripExposants(nom)
    if (inv.includes(nom)) return inv.replace(nom, `${s} (Equip)`)
    if (inv.includes(s))   return inv.replace(s,   `${s} (Equip)`)
    return inv
  }
  const unmarkEquipe = (inv: string, nom: string) => {
    const s = stripExposants(nom)
    if (inv.includes(`${s} (Equip)`))   return inv.replace(`${s} (Equip)`, s)
    if (inv.includes(`${nom} (Equip)`)) return inv.replace(`${nom} (Equip)`, s)
    return inv
  }

  const equipeArmure = (nom: string | null) => {
    let inv = character.inventaire
    if (armurePortee) inv = unmarkEquipe(inv, armurePortee)
    if (nom)          inv = markEquipe(inv, nom)
    onChange({
      armuresEquipees: character.armuresEquipees.map(a =>
        isBouclier(a.nom) ? a : { ...a, equipe: a.nom === nom }
      ),
      inventaire: inv,
    })
  }
  const equipeBouclier = (nom: string | null) => {
    let inv = character.inventaire
    if (bouclierPorte) inv = unmarkEquipe(inv, bouclierPorte)
    if (nom)           inv = markEquipe(inv, nom)
    onChange({
      armuresEquipees: character.armuresEquipees.map(a =>
        !isBouclier(a.nom) ? a : { ...a, equipe: a.nom === nom }
      ),
      inventaire: inv,
    })
  }

  const armuresSeules  = character.armuresEquipees.filter(a => !isBouclier(a.nom))
  const boucliersSeuls = character.armuresEquipees.filter(a =>  isBouclier(a.nom))
  const armurePortee   = armuresSeules.find(a => a.equipe)?.nom ?? null
  const bouclierPorte  = boucliersSeuls.find(a => a.equipe)?.nom ?? null

  const handleExport = () => {
    if (section === 'armes') exportJson({ notes: armesNotes, groupes }, 'armes.json')
    else exportJson({ notes: armuresNotes, categories: armures }, 'armures.json')
    setExported(true)
  }

  const renderArmeTable = (cat: CatArme, gi: number, ci: number, withPortee: boolean) => {
    const cols = withPortee ? 6 : 5
    return (
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>
          <th style={{ ...headCell, textAlign: 'left' }}>Arme</th>
          <th style={{ ...headCell, textAlign: 'center', width: 70 }}>DM</th>
          <th style={{ ...headCell, textAlign: 'center', width: 70 }}>+ Mod</th>
          {withPortee && <th style={{ ...headCell, textAlign: 'center', width: 80 }}>Portée</th>}
          <th style={{ ...headCell, textAlign: 'center', width: 70 }}>Prix</th>
          <th style={{ ...headCell, width: editMode ? 50 : 80, textAlign: 'center' }}>{!editMode && 'Ajouter'}</th>
        </tr></thead>
        <tbody>
          {cat.entrees.length === 0 && !editMode && (
            <tr><td colSpan={cols} style={{ ...cell, opacity: 0.4, fontStyle: 'italic', textAlign: 'center' }}>
              Aucune entrée — activez le mode édition pour en ajouter
            </td></tr>
          )}
          {cat.entrees.map((e, ei) => (
            <tr key={ei}>
              <td style={cell}>
                {editMode ? <input value={e.nom} onChange={ev => updateArme(gi, ci, ei, { nom: ev.target.value })} style={inputStyle} /> : e.nom}
              </td>
              <td style={{ ...cell, textAlign: 'center' }}>
                {editMode ? <input value={e.dm} onChange={ev => updateArme(gi, ci, ei, { dm: ev.target.value })} style={{ ...inputStyle, textAlign: 'center' }} /> : e.dm}
              </td>
              <td style={{ ...cell, textAlign: 'center', color: S.gold }}>
                {editMode ? <input value={e.mod} onChange={ev => updateArme(gi, ci, ei, { mod: ev.target.value })} style={{ ...inputStyle, textAlign: 'center', color: S.gold }} /> : e.mod}
              </td>
              {withPortee && (
                <td style={{ ...cell, textAlign: 'center' }}>
                  {editMode ? <input value={e.portee ?? ''} onChange={ev => updateArme(gi, ci, ei, { portee: ev.target.value })} style={{ ...inputStyle, textAlign: 'center' }} /> : (e.portee ?? '—')}
                </td>
              )}
              <td style={{ ...cell, textAlign: 'center', opacity: editMode ? 1 : 0.6 }}>
                {editMode ? <input value={e.prix} onChange={ev => updateArme(gi, ci, ei, { prix: ev.target.value })} style={{ ...inputStyle, textAlign: 'center' }} /> : e.prix}
              </td>
              <td style={{ ...cell, textAlign: 'center' }}>
                {editMode
                  ? <button onClick={() => removeArmeEntry(gi, ci, ei)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(220,80,80,0.7)', fontSize: 14, padding: 0 }}>✕</button>
                  : <button onClick={() => addArme(e)} style={{ padding: '2px 10px', borderRadius: 3, fontSize: 14, cursor: 'pointer', border: `1px solid ${S.gold}`, background: 'rgba(201,168,76,0.1)', color: S.gold }}>+</button>
                }
              </td>
            </tr>
          ))}
          {editMode && (
            <tr>
              <td colSpan={cols} style={cell}>
                <button onClick={() => addArmeEntry(gi, ci)} style={{
                  width: '100%', padding: '4px', borderRadius: 3, fontSize: 14, cursor: 'pointer',
                  border: `1px dashed ${S.border}`, background: 'transparent', color: S.gold,
                }}>+ Nouvelle entrée</button>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    )
  }

  const renderArmureTable = (cat: CatArmure, ci: number) => (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead><tr>
        <th style={{ ...headCell, textAlign: 'left' }}>Armure</th>
        <th style={{ ...headCell, textAlign: 'center', width: 70 }}>DEF</th>
        <th style={{ ...headCell, textAlign: 'center', width: 70 }}>Prix</th>
        <th style={{ ...headCell, width: editMode ? 50 : 80, textAlign: 'center' }}>{!editMode && 'Ajouter'}</th>
      </tr></thead>
      <tbody>
        {cat.entrees.length === 0 && !editMode && (
          <tr><td colSpan={4} style={{ ...cell, opacity: 0.4, fontStyle: 'italic', textAlign: 'center' }}>
            Aucune entrée — activez le mode édition pour en ajouter
          </td></tr>
        )}
        {cat.entrees.map((e, ei) => (
          <tr key={ei}>
            <td style={cell}>
              {editMode ? <input value={e.nom} onChange={ev => updateArmure(ci, ei, { nom: ev.target.value })} style={inputStyle} /> : e.nom}
            </td>
            <td style={{ ...cell, textAlign: 'center', color: S.gold }}>
              {editMode ? <input type="number" value={e.def} onChange={ev => updateArmure(ci, ei, { def: parseInt(ev.target.value) || 0 })} style={{ ...inputStyle, textAlign: 'center', color: S.gold, width: 60 }} /> : `+${e.def}`}
            </td>
            <td style={{ ...cell, textAlign: 'center', opacity: editMode ? 1 : 0.6 }}>
              {editMode ? <input value={e.prix} onChange={ev => updateArmure(ci, ei, { prix: ev.target.value })} style={{ ...inputStyle, textAlign: 'center' }} /> : e.prix}
            </td>
            <td style={{ ...cell, textAlign: 'center' }}>
              {editMode
                ? <button onClick={() => removeArmureEntry(ci, ei)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(220,80,80,0.7)', fontSize: 14, padding: 0 }}>✕</button>
                : <button onClick={() => addArmure(e)} style={{ padding: '2px 10px', borderRadius: 3, fontSize: 14, cursor: 'pointer', border: `1px solid ${S.gold}`, background: 'rgba(201,168,76,0.1)', color: S.gold }}>+</button>
              }
            </td>
          </tr>
        ))}
        {editMode && (
          <tr>
            <td colSpan={4} style={cell}>
              <button onClick={() => addArmureEntry(ci)} style={{
                width: '100%', padding: '4px', borderRadius: 3, fontSize: 14, cursor: 'pointer',
                border: `1px dashed ${S.border}`, background: 'transparent', color: S.gold,
              }}>+ Nouvelle entrée</button>
            </td>
          </tr>
        )}
      </tbody>
    </table>
  )

  // Index plats pour les refs de scroll
  let flatCounter = 0
  const flatIndex = groupes.map(g => g.categories.map(() => flatCounter++))

  const handleStyle: React.CSSProperties = {
    cursor: 'grab', opacity: 0.35, fontSize: 13, flexShrink: 0,
    userSelect: 'none', paddingRight: 4,
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'rgba(18,14,9,0.99)', border: `1px solid ${S.border}`,
        borderRadius: 8, width: '90vw', maxWidth: 900, maxHeight: '85vh',
        display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,0.9)', overflow: 'hidden' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 20px', borderBottom: `1px solid ${S.border}`, flexShrink: 0, gap: 10 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['armes', 'armures'] as const).map(s => (
              <button key={s} onClick={() => { setSection(s); setActiveKey('0-0'); setExported(false) }} style={{
                padding: '4px 14px', borderRadius: 4, fontSize: 15, cursor: 'pointer',
                border: `1px solid ${S.gold}`,
                background: section === s ? 'rgba(201,168,76,0.2)' : 'transparent',
                color: S.gold, fontWeight: section === s ? 700 : 400,
              }}>
                {s === 'armes' ? 'Armes' : 'Armures'}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {editMode && (
              <button onClick={handleExport} style={{
                padding: '4px 12px', borderRadius: 4, fontSize: 14, cursor: 'pointer',
                border: `1px solid ${S.gold}`,
                background: exported ? 'rgba(201,168,76,0.2)' : 'rgba(201,168,76,0.08)',
                color: S.gold, fontWeight: 600,
              }}>
                {exported ? '✓ Exporté' : `↓ Exporter ${section}.json`}
              </button>
            )}
            <button onClick={() => { setEditMode(m => !m); setExported(false) }} style={{
              padding: '4px 12px', borderRadius: 4, fontSize: 14, cursor: 'pointer',
              border: `1px solid ${editMode ? 'rgba(180,130,255,0.6)' : S.border}`,
              background: editMode ? 'rgba(180,130,255,0.15)' : 'transparent',
              color: editMode ? 'rgba(210,180,255,0.9)' : S.parchment,
            }}>
              {editMode ? '✓ Mode édition' : '✎ Éditer'}
            </button>
            <button onClick={onClose} style={{
              background: 'none', border: 'none', color: S.parchment,
              opacity: 0.5, cursor: 'pointer', fontSize: 20, lineHeight: 1,
            }}>✕</button>
          </div>
        </div>

        {/* ── Corps ── */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* Menu ancres */}
          <div style={{ width: 210, flexShrink: 0, borderRight: `1px solid ${S.border}`,
            display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            <div style={{ flex: 1 }}>
              {section === 'armes'
                ? groupes.map((g, gi) => (
                  <div key={gi}>
                    {/* En-tête de groupe */}
                    <div
                      draggable={editMode}
                      onDragStart={() => { dragSrc.current = { type: 'groupe', gi } }}
                      onDragOver={e => { e.preventDefault(); setDragOver(`g-${gi}`) }}
                      onDragLeave={() => setDragOver(null)}
                      onDrop={() => { reorderGroupes(gi); setDragOver(null) }}
                      style={{
                        display: 'flex', alignItems: 'center',
                        padding: '8px 12px 4px', fontSize: 11, fontWeight: 700,
                        letterSpacing: '0.1em', textTransform: 'uppercase',
                        color: dragOver === `g-${gi}` ? S.gold : 'rgba(201,168,76,0.55)',
                        borderTop: gi > 0 ? `1px solid ${S.border}` : 'none',
                        marginTop: gi > 0 ? 4 : 0,
                        cursor: editMode ? 'grab' : 'default',
                        background: dragOver === `g-${gi}` ? 'rgba(201,168,76,0.08)' : 'transparent',
                      }}
                    >
                      {editMode && <span style={handleStyle}>⠿</span>}
                      {g.groupe}
                    </div>
                    {g.categories.map((c, ci) => {
                      const fi = flatIndex[gi][ci]
                      const key = `${gi}-${ci}`
                      return (
                        <div
                          key={ci}
                          draggable={editMode}
                          onDragStart={() => { dragSrc.current = { type: 'cat', gi, ci } }}
                          onDragOver={e => { e.preventDefault(); setDragOver(`c-${gi}-${ci}`) }}
                          onDragLeave={() => setDragOver(null)}
                          onDrop={() => { reorderCats(gi, ci); setDragOver(null) }}
                          onClick={() => scrollTo(key, fi)}
                          style={{
                            display: 'flex', alignItems: 'center',
                            padding: '6px 12px 6px 18px', fontSize: 14,
                            cursor: editMode ? 'grab' : 'pointer',
                            color: activeKey === key ? S.gold : S.parchment,
                            background: dragOver === `c-${gi}-${ci}`
                              ? 'rgba(201,168,76,0.12)'
                              : activeKey === key ? 'rgba(201,168,76,0.1)' : 'transparent',
                            borderLeft: activeKey === key ? `3px solid ${S.gold}` : '3px solid transparent',
                            transition: 'background 0.1s',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}
                        >
                          {editMode && <span style={handleStyle}>⠿</span>}
                          {c.categorie}
                        </div>
                      )
                    })}
                    {editMode && (
                      <div style={{ padding: '4px 12px 4px 18px' }}>
                        <button onClick={() => addCatArme(gi)} style={{
                          width: '100%', padding: '3px', borderRadius: 3, fontSize: 12, cursor: 'pointer',
                          border: `1px dashed ${S.border}`, background: 'transparent', color: S.gold,
                        }}>+ Catégorie</button>
                      </div>
                    )}
                  </div>
                ))
                : armures.map((c, ci) => (
                  <div key={ci} onClick={() => scrollTo(`${ci}`, ci)} style={{
                    padding: '8px 12px', fontSize: 14, cursor: 'pointer',
                    color: activeKey === `${ci}` ? S.gold : S.parchment,
                    background: activeKey === `${ci}` ? 'rgba(201,168,76,0.1)' : 'transparent',
                    borderLeft: activeKey === `${ci}` ? `3px solid ${S.gold}` : '3px solid transparent',
                    transition: 'all 0.1s', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {c.categorie}
                  </div>
                ))
              }
            </div>
            {editMode && (
              <div style={{ padding: '8px 10px', borderTop: `1px solid ${S.border}`, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {section === 'armes' && (
                  <button onClick={addGroupe} style={{
                    width: '100%', padding: '5px', borderRadius: 4, fontSize: 13, cursor: 'pointer',
                    border: `1px dashed rgba(180,130,255,0.4)`, background: 'transparent',
                    color: 'rgba(210,180,255,0.8)',
                  }}>+ Groupe</button>
                )}
                {section === 'armures' && (
                  <button onClick={addCatArmure} style={{
                    width: '100%', padding: '5px', borderRadius: 4, fontSize: 13, cursor: 'pointer',
                    border: `1px dashed rgba(180,130,255,0.4)`, background: 'transparent',
                    color: 'rgba(210,180,255,0.8)',
                  }}>+ Catégorie</button>
                )}
              </div>
            )}
          </div>

          {/* Toutes les tables */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 18px 24px' }}>
            {section === 'armes'
              ? groupes.map((g, gi) => (
                <div key={gi}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8,
                    paddingTop: gi === 0 ? 16 : 24, paddingBottom: 8,
                    borderTop: gi > 0 ? `2px solid rgba(201,168,76,0.2)` : 'none',
                  }}>
                    {editMode
                      ? <input value={g.groupe} onChange={e => renameGroupe(gi, e.target.value)}
                          style={{ ...inputStyle, fontSize: 16, color: S.gold, fontFamily: "'Cinzel', serif", fontWeight: 700, flex: 1 }} />
                      : <div style={{ fontFamily: "'Cinzel', serif", fontSize: 16, color: S.gold, fontWeight: 700, flex: 1 }}>{g.groupe}</div>
                    }
                    {editMode && (
                      <button onClick={() => removeGroupe(gi)}
                        style={{ background: 'none', border: '1px solid rgba(220,80,80,0.4)', borderRadius: 3,
                          cursor: 'pointer', color: 'rgba(220,80,80,0.7)', fontSize: 12, padding: '2px 7px', flexShrink: 0 }}>
                        ✕ Groupe
                      </button>
                    )}
                  </div>

                  {g.categories.map((cat, ci) => {
                    const fi = flatIndex[gi][ci]
                    const withPortee = isDistance(g.groupe)
                    return (
                      <div key={ci} ref={el => { sectionRefs.current[fi] = el }}
                        style={{ paddingBottom: 16, marginBottom: 16,
                          borderBottom: ci < g.categories.length - 1 ? `1px solid ${S.border}` : 'none' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          {editMode
                            ? <input value={cat.categorie} onChange={e => renameCatArme(gi, ci, e.target.value)}
                                style={{ ...inputStyle, fontSize: 14, color: S.gold, flex: 1 }} />
                            : <div style={{ fontSize: 14, color: S.gold, fontStyle: 'italic', flex: 1 }}>
                                {cat.categorie}
                              </div>
                          }
                          {editMode && (
                            <button onClick={() => removeCatArme(gi, ci)}
                              style={{ background: 'none', border: '1px solid rgba(220,80,80,0.4)', borderRadius: 3,
                                cursor: 'pointer', color: 'rgba(220,80,80,0.7)', fontSize: 11, padding: '1px 6px', flexShrink: 0 }}>
                              ✕
                            </button>
                          )}
                        </div>
                        {renderArmeTable(cat, gi, ci, withPortee)}
                        {editMode && (
                          <textarea value={cat.notes ?? ''} onChange={e => updateArmeNotes(gi, ci, e.target.value)}
                            placeholder="Notes de bas de page…"
                            style={{ marginTop: 6, width: '100%', minHeight: 50, background: 'rgba(255,255,255,0.04)',
                              border: '1px solid rgba(201,168,76,0.2)', borderRadius: 4, resize: 'vertical',
                              color: S.parchment, fontSize: 13, padding: '6px 8px', outline: 'none',
                              fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box' }} />
                        )}
                        {!editMode && cat.notes && (
                          <div style={{ marginTop: 6, fontSize: 13, color: 'rgba(245,236,215,0.5)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                            {cat.notes}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))
              : armures.map((cat, ci) => {
                return (
                <div key={ci} ref={el => { sectionRefs.current[ci] = el }}
                  style={{ paddingTop: 20, paddingBottom: 20,
                    borderBottom: ci < armures.length - 1 ? `1px solid ${S.border}` : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    {editMode
                      ? <input value={cat.categorie} onChange={e => renameCatArmure(ci, e.target.value)}
                          style={{ ...inputStyle, fontSize: 15, color: S.gold, fontFamily: "'Cinzel', serif", fontWeight: 700, flex: 1 }} />
                      : <div style={{ fontFamily: "'Cinzel', serif", fontSize: 15, color: S.gold, flex: 1 }}>
                          {cat.categorie}
                        </div>
                    }
                    {editMode && (
                      <button onClick={() => removeCatArmure(ci)}
                        style={{ background: 'none', border: '1px solid rgba(220,80,80,0.4)', borderRadius: 3,
                          cursor: 'pointer', color: 'rgba(220,80,80,0.7)', fontSize: 12, padding: '2px 7px' }}>✕</button>
                    )}
                  </div>
                  {renderArmureTable(cat, ci)}
                  {editMode && (
                    <textarea value={cat.notes ?? ''} onChange={e => updateArmureNotes(ci, e.target.value)}
                      placeholder="Notes de bas de page…"
                      style={{ marginTop: 8, width: '100%', minHeight: 60, background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(201,168,76,0.2)', borderRadius: 4, resize: 'vertical',
                        color: S.parchment, fontSize: 13, padding: '6px 8px', outline: 'none',
                        fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box' }} />
                  )}
                  {!editMode && cat.notes && (
                    <div style={{ marginTop: 8, fontSize: 13, color: 'rgba(245,236,215,0.5)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                      {cat.notes}
                    </div>
                  )}
                </div>
              )})
            }

            {/* Notes globales */}
            {editMode && (
              <div style={{ paddingTop: 20, borderTop: `1px solid ${S.border}` }}>
                <div style={{ fontSize: 13, color: S.gold, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
                  Notes de page
                </div>
                <textarea
                  value={section === 'armes' ? armesNotes : armuresNotes}
                  onChange={e => section === 'armes' ? setArmesNotes(e.target.value) : setArmuresNotes(e.target.value)}
                  placeholder="Notes générales pour cette section…"
                  style={{ width: '100%', minHeight: 80, background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(201,168,76,0.2)', borderRadius: 4, resize: 'vertical',
                    color: S.parchment, fontSize: 13, padding: '6px 8px', outline: 'none',
                    fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box' }}
                />
              </div>
            )}
            {!editMode && (section === 'armes' ? armesNotes : armuresNotes) && (
              <div style={{ paddingTop: 16, borderTop: `1px solid ${S.border}`,
                fontSize: 13, color: 'rgba(245,236,215,0.5)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                {section === 'armes' ? armesNotes : armuresNotes}
              </div>
            )}
          </div>
        </div>

        {/* ── Footer récap ── */}
        {!editMode && (character.armes.length > 0 || character.armuresEquipees.length > 0) && (
          <div style={{ borderTop: `1px solid ${S.border}`, padding: '10px 20px',
            flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 200, overflowY: 'auto' }}>

            {/* Armes */}
            {character.armes.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: S.gold, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Armes</div>
                {/* Tags avec ✕ */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                  {character.armes.map((a, i) => {
                    const slot = stripExposants(character.arme1) === stripExposants(a.nom) ? 1 : stripExposants(character.arme2) === stripExposants(a.nom) ? 2 : null
                    return (
                      <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '2px 8px', borderRadius: 3, fontSize: 14,
                        background: slot ? 'rgba(100,160,255,0.12)' : 'rgba(201,168,76,0.12)',
                        border: `1px solid ${slot ? 'rgba(100,160,255,0.3)' : S.border}`,
                        color: slot ? 'rgba(100,160,255,0.9)' : S.parchment }}>
                        {slot && <span style={{ fontSize: 11, opacity: 0.7 }}>E{slot} ·</span>}
                        {a.nom} <span style={{ opacity: 0.5 }}>{a.dm}</span>
                        <button onClick={() => removeArme(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(220,80,80,0.7)', fontSize: 14, padding: 0, lineHeight: 1 }}>✕</button>
                      </span>
                    )
                  })}
                </div>
                {/* Slots d'équipement */}
                {([1, 2] as const).map(slot => {
                  const current = slot === 1 ? character.arme1 : character.arme2
                  const label   = `Emplacement ${slot}`
                  const color   = 'rgba(100,160,255,0.8)'
                  return (
                    <div key={slot} style={{ marginBottom: 4 }}>
                      <div style={{ fontSize: 11, color, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer', color: S.parchment }}>
                          <input type="radio" name={`arme-slot-${slot}`} checked={!current} onChange={() => equipeArmeSlot(null, slot)} style={{ accentColor: color }} />
                          Aucune
                        </label>
                        {character.armes.map((a, i) => {
                          const otherSlot = slot === 1 ? character.arme2 : character.arme1
                          const takenByOther = stripExposants(otherSlot) === stripExposants(a.nom)
                          const isCurrent   = stripExposants(current) === stripExposants(a.nom)
                          return (
                            <label key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13,
                              cursor: takenByOther ? 'not-allowed' : 'pointer',
                              opacity: takenByOther ? 0.4 : 1,
                              color: isCurrent ? color : S.parchment }}>
                              <input type="radio" name={`arme-slot-${slot}`}
                                checked={isCurrent}
                                disabled={takenByOther}
                                onChange={() => equipeArmeSlot(a.nom, slot)}
                                style={{ accentColor: color }} />
                              {a.nom} <span style={{ opacity: 0.5, fontSize: 12 }}>{a.dm}</span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Armure portée */}
            {armuresSeules.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: 'rgba(100,160,255,0.8)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Armure portée</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer', color: S.parchment }}>
                    <input type="radio" name="armure-portee" checked={armurePortee === null} onChange={() => equipeArmure(null)} style={{ accentColor: 'rgba(100,160,255,0.8)' }} />
                    Aucune
                  </label>
                  {armuresSeules.map((a, i) => (
                    <label key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer',
                      color: armurePortee === a.nom ? 'rgba(100,160,255,0.9)' : S.parchment }}>
                      <input type="radio" name="armure-portee" checked={armurePortee === a.nom} onChange={() => equipeArmure(a.nom)} style={{ accentColor: 'rgba(100,160,255,0.8)' }} />
                      {a.nom} <span style={{ opacity: 0.5, fontSize: 12 }}>DEF +{a.def}</span>
                      <button onClick={() => removeArmure(character.armuresEquipees.indexOf(a))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(220,80,80,0.7)', fontSize: 12, padding: 0, lineHeight: 1 }}>✕</button>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Bouclier porté */}
            {boucliersSeuls.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: 'rgba(100,160,255,0.8)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Bouclier porté</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer', color: S.parchment }}>
                    <input type="radio" name="bouclier-porte" checked={bouclierPorte === null} onChange={() => equipeBouclier(null)} style={{ accentColor: 'rgba(100,160,255,0.8)' }} />
                    Aucun
                  </label>
                  {boucliersSeuls.map((a, i) => (
                    <label key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer',
                      color: bouclierPorte === a.nom ? 'rgba(100,160,255,0.9)' : S.parchment }}>
                      <input type="radio" name="bouclier-porte" checked={bouclierPorte === a.nom} onChange={() => equipeBouclier(a.nom)} style={{ accentColor: 'rgba(100,160,255,0.8)' }} />
                      {a.nom} <span style={{ opacity: 0.5, fontSize: 12 }}>DEF +{a.def}</span>
                      <button onClick={() => removeArmure(character.armuresEquipees.indexOf(a))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(220,80,80,0.7)', fontSize: 12, padding: 0, lineHeight: 1 }}>✕</button>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Footer édition ── */}
        {editMode && (
          <div style={{ borderTop: `1px solid ${S.border}`, padding: '8px 20px', flexShrink: 0,
            fontSize: 11, color: 'rgba(245,236,215,0.35)' }}>
            Les modifications sont en mémoire jusqu'à l'export. Remplace <code>src/data/{section}.json</code> puis relance <code>npm run build</code>.
          </div>
        )}
      </div>
    </div>
  )
}
