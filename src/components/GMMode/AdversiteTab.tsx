import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useGameData } from '../../context/GameDataContext'
import { saveDataFile } from '../../utils/tauriStorage'
import NumberField from '../NumberField'
import RENCONTRE_RAW from '../../data/rencontre.json'
import { getBudgetPA, getPAPourNC, distribuerNC } from '../../utils/rencontre'
import { demarrerCombat } from '../../utils/combat'
import CombatTab from './CombatTab'
import adversiteBg from '../../assets/adversite-gold.png'
import type { RencontreData, Difficulte, RencontreAdversaire, RencontreSauvegardee } from '../../types/gameData'
import type { CombatSession, CombatSessionSauvegardee } from '../../utils/combat'

const RENCONTRE = RENCONTRE_RAW as RencontreData

const GOLD = '#c9a84c'
const PARCHMENT = '#f5ecd7'
const SECTION_BORDER = 'rgba(201,168,76,0.2)'

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 4,
  color: PARCHMENT, fontSize: 13, padding: '6px 10px', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
}
// Fond opaque : sur Windows, la liste déroulante d'un <select> est un popup natif hors de la
// page — un fond translucide (comme sur inputStyle) y est composité sur blanc au lieu du thème sombre.
const selectStyle: React.CSSProperties = { ...inputStyle, background: 'var(--tdr-dark)' }
const optionStyle: React.CSSProperties = { background: 'var(--tdr-dark)', color: PARCHMENT }
const labelStyle: React.CSSProperties = {
  fontSize: 11, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4, display: 'block',
}
const sectionTitleStyle: React.CSSProperties = {
  fontSize: 14, fontWeight: 700, color: GOLD, fontFamily: "'Cinzel', serif", letterSpacing: '0.04em',
  borderBottom: `1px solid ${SECTION_BORDER}`, paddingBottom: 6, marginBottom: 12,
}
const btnStyle: React.CSSProperties = {
  background: 'transparent', border: '1px solid rgba(201,168,76,0.4)', borderRadius: 4,
  color: 'rgba(245,236,215,0.8)', cursor: 'pointer', fontSize: 15, padding: '6px 12px',
}
const removeBtnStyle: React.CSSProperties = {
  background: 'transparent', border: '1px solid rgba(255,80,80,0.3)', borderRadius: 4,
  color: 'rgba(255,110,110,0.8)', cursor: 'pointer', fontSize: 12, padding: '4px 8px', flexShrink: 0,
}

const DIFFICULTES: Difficulte[] = ['facile', 'ordinaire', 'difficile', 'extreme']

const genId = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : String(Date.now())

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

interface Props {
  // Rencontre à lancer automatiquement (déclenché par un lien [[Rencontre]] cliqué dans une note MJ, ou
  // par « Lancer la rencontre » sur un événement de bataille — voir GMDashboard) — absent en usage
  // normal (navigation directe vers l'onglet Adversité).
  demarrerAuto?: RencontreSauvegardee | null
  // Appelé quand le combat en cours se termine (bouton « Terminer le combat ») — seul GMDashboard sait
  // si cette rencontre a été lancée depuis un événement de bataille (auquel cas il ramène le MJ sur
  // l'onglet Bataille) ; absent en usage normal, où la fin du combat reste simplement dans cet onglet.
  onCombatTermine?: () => void
}

export default function AdversiteTab({ demarrerAuto, onCombatTermine }: Props) {
  const { t } = useTranslation()
  const { bestiaire, rencontres, setRencontres, combatsSauvegardes, setCombatsSauvegardes } = useGameData()

  const [nombrePJs, setNombrePJs] = useState(4)
  const [niveauMoyen, setNiveauMoyen] = useState(4)
  const [difficulte, setDifficulte] = useState<Difficulte>('ordinaire')
  const [nombreAdversaires, setNombreAdversaires] = useState(3)
  const [adversaires, setAdversaires] = useState<RencontreAdversaire[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [nomRencontre, setNomRencontre] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [combatSession, setCombatSession] = useState<CombatSession | null>(null)
  const [combatSnapshotId, setCombatSnapshotId] = useState<string | null>(null)
  const [confirmDeleteCombatId, setConfirmDeleteCombatId] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)

  // Lance automatiquement la rencontre demandée — appliqué pendant le rendu plutôt que dans un effet
  // (pattern « ajuster l'état pendant le rendu » recommandé par React pour réagir à un changement de
  // prop), pour ne s'appliquer qu'au changement de rencontre demandé, pas à chaque re-render (sinon
  // impossible de revenir au constructeur ensuite sans revenir par une note).
  const [dernierDemarrerAuto, setDernierDemarrerAuto] = useState<RencontreSauvegardee | null | undefined>(undefined)
  if (demarrerAuto !== dernierDemarrerAuto) {
    setDernierDemarrerAuto(demarrerAuto)
    if (demarrerAuto) {
      setCombatSession(demarrerCombat(demarrerAuto, bestiaire))
      setCombatSnapshotId(null)
    }
  }

  const budgetTotal = getBudgetPA(RENCONTRE, niveauMoyen, difficulte, nombrePJs)
  const paUtilise = adversaires.reduce((somme, a) => somme + getPAPourNC(RENCONTRE, a.nc), 0)

  const creaturesParNC = useMemo(() => {
    const m = new Map<number, typeof bestiaire>()
    for (const c of bestiaire) m.set(c.nc, [...(m.get(c.nc) ?? []), c])
    return m
  }, [bestiaire])

  const applyRedistribution = (slots: RencontreAdversaire[]) => {
    const ncs = distribuerNC(RENCONTRE, slots.map(s => ({ nc: s.nc, manuel: s.manuel })), budgetTotal)
    setAdversaires(slots.map((s, i) => {
      if (s.manuel || s.nc === ncs[i]) return s
      const nc = ncs[i]
      const match = creaturesParNC.get(nc)?.[0]
      return { ...s, nc, creatureNom: match?.nom ?? null }
    }))
  }

  const genererCombat = () => {
    const vides: RencontreAdversaire[] = Array.from({ length: Math.max(1, nombreAdversaires) }, () => ({
      nc: 0, manuel: false, creatureNom: null,
    }))
    const ncs = distribuerNC(RENCONTRE, vides.map(s => ({ nc: s.nc, manuel: s.manuel })), budgetTotal)
    setAdversaires(vides.map((s, i) => {
      const nc = ncs[i]
      const match = creaturesParNC.get(nc)?.[0]
      return { ...s, nc, creatureNom: match?.nom ?? null }
    }))
    setEditingId(null)
  }

  const setSlotNC = (index: number, nc: number) => {
    applyRedistribution(adversaires.map((a, i) => i === index ? { ...a, nc, manuel: true } : a))
  }

  const toggleAuto = (index: number) => {
    applyRedistribution(adversaires.map((a, i) => i === index ? { ...a, manuel: false } : a))
  }

  const setSlotCreature = (index: number, nom: string) => {
    setAdversaires(adversaires.map((a, i) => i === index ? { ...a, creatureNom: nom || null } : a))
  }

  const addSlot = () => applyRedistribution([...adversaires, { nc: 0, manuel: false, creatureNom: null }])
  const removeSlot = (index: number) => applyRedistribution(adversaires.filter((_, i) => i !== index))
  const recalculer = () => applyRedistribution(adversaires)

  const sauvegarder = () => {
    if (!nomRencontre.trim() || adversaires.length === 0) return
    const id = editingId ?? genId()
    const entry: RencontreSauvegardee = {
      id, nom: nomRencontre.trim(), nombrePJs, niveauMoyen, difficulte,
      adversaires, creeLe: new Date().toISOString(),
    }
    setRencontres(prev => editingId ? prev.map(r => r.id === id ? entry : r) : [...prev, entry])
    setEditingId(id)
    setSaveMsg(t('gmMode.adversite.enregistre'))
    setTimeout(() => setSaveMsg(null), 2500)
  }

  const charger = (r: RencontreSauvegardee) => {
    setNombrePJs(r.nombrePJs)
    setNiveauMoyen(r.niveauMoyen)
    setDifficulte(r.difficulte)
    setAdversaires(r.adversaires.map(a => ({ ...a })))
    setEditingId(r.id)
    setNomRencontre(r.nom)
  }

  const nouvelle = () => {
    setEditingId(null)
    setNomRencontre('')
    setAdversaires([])
  }

  const supprimer = (id: string) => {
    setRencontres(prev => prev.filter(r => r.id !== id))
    if (editingId === id) nouvelle()
    setConfirmDeleteId(null)
  }

  // Sauvegarde/mise à jour d'un instantané du combat en cours : la session (créatures + PJ, avec
  // tout leur état — PV, buffs, cibles) est déjà auto-suffisante (voir demarrerCombat/importPJ),
  // il suffit donc de l'horodater et de l'ajouter/mettre à jour dans la bibliothèque. Les sauvegardes
  // suivantes du même combat mettent à jour la même entrée plutôt que d'en créer une nouvelle à chaque fois.
  const sauvegarderSnapshot = () => {
    if (!combatSession) return
    const id = combatSnapshotId ?? genId()
    const entry: CombatSessionSauvegardee = { ...combatSession, id, creeLe: new Date().toISOString() }
    setCombatsSauvegardes(prev => combatSnapshotId ? prev.map(c => c.id === id ? entry : c) : [...prev, entry])
    setCombatSnapshotId(id)
  }

  const reprendreCombat = (c: CombatSessionSauvegardee) => {
    const session: CombatSession = { nomRencontre: c.nomRencontre, combatants: c.combatants, pjs: c.pjs, compagnons: c.compagnons }
    setCombatSession(JSON.parse(JSON.stringify(session)) as CombatSession)
    setCombatSnapshotId(c.id)
  }

  const supprimerCombat = (id: string) => {
    setCombatsSauvegardes(prev => prev.filter(c => c.id !== id))
    setConfirmDeleteCombatId(null)
  }

  const exporter = async (r: RencontreSauvegardee) => {
    const content = JSON.stringify({ type: 'rencontre', data: r }, null, 2)
    const safe = r.nom.replace(/[^a-zA-Z0-9À-ÿ _-]/g, '').trim().replace(/\s+/g, '-') || 'rencontre'
    const filename = `${safe}.json`
    const chemin = `Maitre de jeu/${filename}`
    if (isTauri) {
      await saveDataFile(chemin, content)
      setSaveMsg(t('gmMode.adversite.exporteVers', { filename: chemin }))
      setTimeout(() => setSaveMsg(null), 3000)
    } else {
      const blob = new Blob([content], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = filename; a.click()
      URL.revokeObjectURL(url)
    }
  }

  const builderContent = (
    <>
      <div style={{ fontSize: 12, opacity: 0.5, textAlign: 'center', lineHeight: 1.5 }}>
        {t('gmMode.adversite.intro')}
      </div>

      {/* Paramètres de la rencontre */}
      <div>
        <div style={sectionTitleStyle}>{t('gmMode.adversite.parametres')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          <div>
            <span style={labelStyle}>{t('gmMode.adversite.nombrePJs')}</span>
            <NumberField min={1} value={nombrePJs}
              onChange={n => setNombrePJs(n ?? 1)} style={inputStyle} />
          </div>
          <div>
            <span style={labelStyle}>{t('gmMode.adversite.niveauMoyen')}</span>
            <NumberField min={1} max={20} value={niveauMoyen}
              onChange={n => setNiveauMoyen(n ?? 1)} style={inputStyle} />
          </div>
          <div>
            <span style={labelStyle}>{t('gmMode.adversite.difficulte')}</span>
            <select value={difficulte} onChange={e => setDifficulte(e.target.value as Difficulte)} style={selectStyle}>
              {DIFFICULTES.map(d => (
                <option key={d} value={d} style={optionStyle}>{t(`gmMode.adversite.difficultes.${d}`)}</option>
              ))}
            </select>
          </div>
          <div>
            <span style={labelStyle}>{t('gmMode.adversite.nombreAdversaires')}</span>
            <NumberField min={1} max={12} value={nombreAdversaires}
              onChange={n => setNombreAdversaires(n ?? 1)} style={inputStyle} />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 12 }}>
          <span style={{ fontSize: 15, opacity: 0.7 }}>
            {t('gmMode.adversite.budgetTotal')} : <strong style={{ color: GOLD }}>{budgetTotal} {t('gmMode.adversite.pa')}</strong>
          </span>
          <button onClick={genererCombat} style={{ ...btnStyle, borderColor: 'rgba(160,120,255,0.6)', background: 'rgba(140,100,255,0.2)', color: 'rgba(210,185,255,0.95)' }}>
            🎲 {t('gmMode.adversite.genererCombat')}
          </button>
        </div>
      </div>

      {/* Adversaires générés */}
      {adversaires.length > 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ ...sectionTitleStyle, marginBottom: 0, border: 'none', paddingBottom: 0 }}>
              {t('gmMode.adversite.adversaires')}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 14, color: paUtilise > budgetTotal ? 'rgba(255,150,150,0.9)' : GOLD }}>
                {paUtilise} / {budgetTotal} {t('gmMode.adversite.pa')}
              </span>
              <button onClick={recalculer} style={{ ...btnStyle, fontSize: 14, padding: '4px 10px' }}>
                🔄 {t('gmMode.adversite.recalculer')}
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
            <span style={{ ...labelStyle, width: 60, flexShrink: 0, marginBottom: 0 }}>{t('gmMode.adversite.nc')}</span>
            <span style={{ width: 46, flexShrink: 0 }} />
            <span style={{ visibility: 'hidden', flexShrink: 0, fontSize: 10, padding: '3px 7px', border: '1px solid transparent' }}>
              {t('gmMode.adversite.manuel')}
            </span>
            <span style={{ ...labelStyle, flex: 1, marginBottom: 0 }}>{t('gmMode.adversite.creatures')}</span>
            <span style={{ width: 24, flexShrink: 0 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
            {adversaires.map((a, i) => {
              const options = creaturesParNC.get(a.nc) ?? []
              return (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ width: 60, flexShrink: 0 }}>
                    <NumberField parseAs="float" value={a.nc} onChange={n => setSlotNC(i, n ?? 0)} style={inputStyle} />
                  </div>
                  <span style={{ fontSize: 11, opacity: 0.55, width: 46, flexShrink: 0, textAlign: 'right' }}>
                    {getPAPourNC(RENCONTRE, a.nc)} {t('gmMode.adversite.pa')}
                  </span>
                  <button
                    onClick={() => a.manuel ? toggleAuto(i) : undefined}
                    title={a.manuel ? t('gmMode.adversite.manuelTitle') : t('gmMode.adversite.autoTitle')}
                    style={{
                      flexShrink: 0, fontSize: 10, padding: '3px 7px', borderRadius: 3, cursor: a.manuel ? 'pointer' : 'default',
                      border: `1px solid ${a.manuel ? 'rgba(201,168,76,0.5)' : SECTION_BORDER}`,
                      background: a.manuel ? 'rgba(201,168,76,0.12)' : 'transparent',
                      color: a.manuel ? GOLD : 'rgba(245,236,215,0.4)',
                    }}
                  >
                    {a.manuel ? t('gmMode.adversite.manuel') : t('gmMode.adversite.auto')}
                  </button>
                  <select value={a.creatureNom ?? ''} onChange={e => setSlotCreature(i, e.target.value)} style={{ ...selectStyle, flex: 1 }}>
                    <option value="" style={optionStyle}>{t('gmMode.adversite.selectionner')}</option>
                    {/* Le NC s'affiche même si toutes les options de ce menu le partagent déjà (il est
                        fixé par le budget du slot) : deux créatures peuvent aussi partager nom ET NC,
                        et la clé React doit alors distinguer les options plutôt que de les confondre. */}
                    {options.map((c, k) => (
                      <option key={`${c.nom}-${k}`} value={c.nom} style={optionStyle}>{c.nom} (NC {c.nc})</option>
                    ))}
                  </select>
                  <button onClick={() => removeSlot(i)} style={removeBtnStyle}>✕</button>
                </div>
              )
            })}
          </div>
          <button onClick={addSlot} style={{ ...btnStyle, marginTop: 10, borderStyle: 'dashed' }}>
            + {t('gmMode.adversite.ajouterAdversaire')}
          </button>
        </div>
      )}

      {/* Sauvegarde de la rencontre */}
      {adversaires.length > 0 && (
        <div style={{ border: `1px solid ${SECTION_BORDER}`, borderRadius: 8, padding: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
          <input value={nomRencontre} onChange={e => setNomRencontre(e.target.value)}
            placeholder={t('gmMode.adversite.nomRencontre')} style={{ ...inputStyle, flex: 1 }} />
          <button onClick={sauvegarder} disabled={!nomRencontre.trim()} style={{ ...btnStyle, opacity: nomRencontre.trim() ? 1 : 0.4 }}>
            💾 {editingId ? t('gmMode.adversite.mettreAJour') : t('gmMode.adversite.enregistrer')}
          </button>
          {editingId && (
            <button onClick={nouvelle} style={{ ...btnStyle, fontSize: 14 }}>{t('gmMode.adversite.nouvelle')}</button>
          )}
          {saveMsg && <span style={{ fontSize: 14, color: GOLD }}>{saveMsg}</span>}
        </div>
      )}

      {/* Combats sauvegardés — instantanés repris depuis l'écran de combat (bouton Sauvegarder) */}
      <div>
        <div style={sectionTitleStyle}>{t('gmMode.adversite.combatsEnCours')}</div>
        {combatsSauvegardes.length === 0 ? (
          <div style={{ fontSize: 13, opacity: 0.4, textAlign: 'center', padding: '10px 0' }}>
            {t('gmMode.adversite.aucunCombatSauvegarde')}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {combatsSauvegardes.map(c => (
              <div key={c.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                border: `1px solid ${c.id === combatSnapshotId ? 'rgba(201,168,76,0.5)' : SECTION_BORDER}`, borderRadius: 6,
                background: 'rgba(15,12,8,0.9)',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, color: PARCHMENT, fontWeight: 700 }}>{c.nomRencontre}</div>
                  <div style={{ fontSize: 11, opacity: 0.5 }}>
                    {t('gmMode.bataille.nbAdversaires', { count: c.combatants.length })}
                    {c.pjs.length > 0 && ` · ${t('gmMode.bataille.nbPJ', { count: c.pjs.length })}`}
                  </div>
                </div>
                <button
                  onClick={() => reprendreCombat(c)}
                  style={{ ...btnStyle, borderColor: 'rgba(160,120,255,0.6)', background: 'rgba(140,100,255,0.15)', color: 'rgba(210,185,255,0.95)', fontSize: 14 }}
                >
                  ▶ {t('gmMode.adversite.reprendre')}
                </button>
                {confirmDeleteCombatId === c.id ? (
                  <button onClick={() => supprimerCombat(c.id)} style={{ ...removeBtnStyle, fontSize: 14 }}>{t('gmMode.adversite.confirmerSuppression')}</button>
                ) : (
                  <button onClick={() => setConfirmDeleteCombatId(c.id)} style={removeBtnStyle}>✕</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bibliothèque de rencontres */}
      <div>
        <div style={sectionTitleStyle}>{t('gmMode.adversite.rencontresEnregistrees')}</div>
        {rencontres.length === 0 ? (
          <div style={{ fontSize: 13, opacity: 0.4, textAlign: 'center', padding: '10px 0' }}>
            {t('gmMode.adversite.aucuneRencontre')}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rencontres.map(r => (
              <div key={r.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                border: `1px solid ${r.id === editingId ? 'rgba(201,168,76,0.5)' : SECTION_BORDER}`, borderRadius: 6,
                background: 'rgba(15,12,8,0.9)',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, color: PARCHMENT, fontWeight: 700 }}>{r.nom}</div>
                  <div style={{ fontSize: 11, opacity: 0.5 }}>
                    {t('gmMode.adversite.resume', {
                      pjs: r.nombrePJs, niveau: r.niveauMoyen,
                      difficulte: t(`gmMode.adversite.difficultes.${r.difficulte}`),
                      nb: r.adversaires.length,
                    })}
                  </div>
                </div>
                <button
                  onClick={() => { setCombatSession(demarrerCombat(r, bestiaire)); setCombatSnapshotId(null) }}
                  style={{ ...btnStyle, borderColor: 'rgba(160,120,255,0.6)', background: 'rgba(140,100,255,0.15)', color: 'rgba(210,185,255,0.95)', fontSize: 14 }}
                >
                  ▶ {t('gmMode.adversite.jouer')}
                </button>
                <button onClick={() => charger(r)} style={{ ...btnStyle, fontSize: 14 }}>{t('gmMode.adversite.charger')}</button>
                <button onClick={() => exporter(r)} style={{ ...btnStyle, fontSize: 14 }}>{t('gmMode.adversite.exporter')}</button>
                {confirmDeleteId === r.id ? (
                  <button onClick={() => supprimer(r.id)} style={{ ...removeBtnStyle, fontSize: 14 }}>{t('gmMode.adversite.confirmerSuppression')}</button>
                ) : (
                  <button onClick={() => setConfirmDeleteId(r.id)} style={removeBtnStyle}>✕</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )

  // Fond décoratif commun aux deux vues (constructeur / combat) : image en arrière-plan, non
  // interactive, opacité faible pour rester lisible derrière le contenu (même traitement que le
  // filigrane du Bestiaire — recolorée en or, luminance convertie en alpha).
  const backgroundLayer = (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 0,
      backgroundImage: `url(${adversiteBg})`, backgroundSize: 'min(140%, 1280px)', backgroundRepeat: 'no-repeat',
      backgroundPosition: 'center', opacity: 0.08, pointerEvents: 'none', userSelect: 'none',
    }} />
  )

  if (!combatSession) {
    return (
      <div style={{ position: 'relative', minHeight: '100%' }}>
        {backgroundLayer}
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 780, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
          {builderContent}
        </div>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      {backgroundLayer}
      {/* Zone de combat — décalée à gauche pour ne jamais passer sous la poignée du tiroir Paramètres
          (côté droit), même fermé. La colonne PJ de CombatTab a son propre tiroir à gauche, avec sa
          propre marge interne — les deux ne se chevauchent pas puisqu'ils sont sur des bords opposés. */}
      <div style={{ position: 'relative', zIndex: 1, height: '100%', paddingRight: 38 }}>
        <CombatTab
          session={combatSession}
          onSessionChange={setCombatSession}
          onEndSession={() => { setCombatSession(null); setCombatSnapshotId(null); onCombatTermine?.() }}
          onSauvegarder={sauvegarderSnapshot}
        />
      </div>

      {/* Tiroir latéral — fixe à droite (symétrique du tiroir PJ de CombatTab, passé à gauche), s'ouvre
          au survol ou au clic, glisse par-dessus la zone de combat */}
      <div
        onMouseLeave={() => setPanelOpen(false)}
        style={{
          position: 'absolute', top: 0, right: 0, height: '100%', zIndex: 20,
          display: 'flex', alignItems: 'stretch',
          transform: panelOpen ? 'translateX(0)' : 'translateX(520px)',
          transition: 'transform 0.2s ease',
        }}
      >
        {/* Poignée — reste collée au bord gauche du tiroir (côté intérieur, toujours visible même
            fermé). Voir la note détaillée sur le tiroir Personnages de CombatTab : writing-mode plutôt
            que transform sur le texte (bonne boîte de mise en page, pas de troncature), et l'icône
            sortie du span vertical car WebKitGTK la décale mal quand elle est insérée dans un flux
            vertical-rl (constaté sur tablette). */}
        <button
          onMouseEnter={() => setPanelOpen(true)}
          onClick={() => setPanelOpen(o => !o)}
          style={{
            width: 30, height: 140, flexShrink: 0, alignSelf: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '10px 0', background: 'rgba(15,12,8,0.95)',
            border: `1px solid ${SECTION_BORDER}`, borderRight: 'none', borderRadius: '6px 0 0 6px',
            color: GOLD, cursor: 'pointer', boxShadow: '-4px 0 16px rgba(0,0,0,0.4)',
          }}
        >
          <span style={{ fontSize: 16 }}>⚙</span>
          <span style={{
            writingMode: 'vertical-rl', textOrientation: 'mixed', transform: 'rotate(180deg)',
            whiteSpace: 'nowrap', fontSize: 13, letterSpacing: '0.05em', marginTop: 4,
          }}>
            {t('gmMode.adversite.parametresCourt')}
          </span>
        </button>

        <div style={{
          width: 520, flexShrink: 0, display: 'flex', flexDirection: 'column',
          background: 'rgba(15,12,8,0.97)', border: `1px solid ${SECTION_BORDER}`, borderRight: 'none',
          boxShadow: '-6px 0 24px rgba(0,0,0,0.5)', overflow: 'hidden',
        }}>
          <div style={{
            flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px', borderBottom: `1px solid ${SECTION_BORDER}`, background: 'rgba(201,168,76,0.08)',
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: GOLD }}>{t('gmMode.adversite.parametres')}</span>
            <button onClick={() => setPanelOpen(false)} style={{ background: 'transparent', border: 'none', color: 'rgba(245,236,215,0.6)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
          </div>
          <div style={{ padding: 16, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 24 }}>
            {builderContent}
          </div>
        </div>
      </div>
    </div>
  )
}
