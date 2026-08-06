import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useModalBackButton } from '../hooks/useModalBackButton'
import { saveDataFile } from '../utils/tauriStorage'
import type { Character } from '../types/character'
import { desenvelopper, CLE_LABEL_TYPE } from '../utils/importTypage'

export interface SavedEntry {
  id: string
  nom: string
  date: string
  maxStep?: number
  character: Character
  tags?: string[]
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

type Tri = 'nom' | 'date' | 'niveau'
type Regroupement = 'aucun' | 'peuple' | 'tag'

// Couleur déterministe dérivée du texte (nom de tag ou de peuple) : même libellé -> toujours la même
// teinte, sans avoir à faire choisir/stocker une couleur par groupe.
const teinte = (label: string): number => {
  let hash = 0
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) | 0
  return Math.abs(hash) % 360
}
const couleurGroupe = (label: string) => {
  const h = teinte(label)
  return { point: `hsl(${h}, 65%, 58%)`, fond: `hsla(${h}, 65%, 58%, 0.14)`, bord: `hsla(${h}, 65%, 58%, 0.4)` }
}

const normaliser = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function SaveLoadPanel({ character, maxStep, library, onLibraryChange, onLoad, onNew, onClose }: Props) {
  useModalBackButton(onClose)
  const { t, i18n } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [recherche, setRecherche] = useState('')
  const [tri, setTri] = useState<Tri>('nom')
  const [regroupement, setRegroupement] = useState<Regroupement>('aucun')
  const [ajoutTagPour, setAjoutTagPour] = useState<string | null>(null)
  const [nouveauTag, setNouveauTag] = useState('')
  const tagInputRef = useRef<HTMLInputElement>(null)
  // Position à l'écran du champ d'ajout de tag ouvert : la liste de suggestions est rendue dans un
  // portail (voir plus bas), donc placée en coordonnées absolues d'écran plutôt que relativement au
  // champ — sinon, pour un personnage en bas de la liste, elle était rognée par le conteneur à
  // défilement (overflow-y) et le clic sur une suggestion partiellement visible ne portait pas toujours.
  const [cadreTag, setCadreTag] = useState<DOMRect | null>(null)

  const majPositionTag = useCallback(() => {
    setCadreTag(tagInputRef.current?.getBoundingClientRect() ?? null)
  }, [])

  useEffect(() => {
    if (!ajoutTagPour) return
    majPositionTag()
    // capture : suit aussi le défilement du conteneur interne (la liste des personnages)
    window.addEventListener('scroll', majPositionTag, true)
    window.addEventListener('resize', majPositionTag)
    return () => {
      window.removeEventListener('scroll', majPositionTag, true)
      window.removeEventListener('resize', majPositionTag)
    }
  }, [ajoutTagPour, majPositionTag])

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
      tags: existing?.tags,
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

  const addTag = (id: string, tag: string) => {
    const propre = tag.trim()
    if (!propre) return
    onLibraryChange(library.map(e => e.id === id
      ? { ...e, tags: e.tags?.includes(propre) ? e.tags : [...(e.tags ?? []), propre] }
      : e))
  }

  const removeTag = (id: string, tag: string) => {
    onLibraryChange(library.map(e => e.id === id ? { ...e, tags: (e.tags ?? []).filter(x => x !== tag) } : e))
  }

  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

  // chemin peut inclure un sous-dossier (voir Personnage/, le rangement de Documents/TdA) : le nom de
  // fichier proposé au téléchargement navigateur (a.download) n'en garde que la partie finale, un « / »
  // n'y étant pas interprété comme un chemin.
  const downloadJson = async (chemin: string, payload: unknown) => {
    const content = JSON.stringify(payload, null, 2)
    if (isTauri) {
      await saveDataFile(chemin, content)
      setSaveMsg(t('saveLoad.enregistreDans', { filename: chemin }))
      setTimeout(() => setSaveMsg(null), 3000)
    } else {
      const blob = new Blob([content], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = chemin.split('/').pop() ?? chemin; a.click()
      URL.revokeObjectURL(url)
    }
  }

  const exportLibrary = () => downloadJson('Personnage/personnages-tdr.json', { type: 'bibliotheque-personnages', data: library })

  const exportCharacter = (entry: SavedEntry) => {
    const safe = entry.nom.replace(/[^a-zA-Z0-9À-ÿ _-]/g, '').trim().replace(/\s+/g, '-')
    downloadJson(`Personnage/${safe}.json`, { type: 'personnage', data: entry })
  }

  const importLibrary = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const raw = JSON.parse(ev.target?.result as string)
        const { type, contenu } = desenvelopper(raw)
        if (type === 'bibliotheque-personnages') {
          // Le repli structurel de desenvelopper a déjà vérifié que chaque entrée a bien {nom, character}.
          onLibraryChange(contenu as SavedEntry[])
        } else if (type === 'personnage') {
          const data = contenu as Partial<SavedEntry> & Partial<Character>
          if (data.character !== undefined && data.nom !== undefined) {
            // Format SavedEntry exporté individuellement — toujours un nouvel id, jamais celui du
            // fichier importé (data.id) : un fichier réimporté ailleurs (ex. copié dans un autre
            // dossier, un peu modifié) partage souvent le même id que l'entrée déjà présente dans la
            // bibliothèque, ce qui produirait deux entrées avec la même clé React (key={e.id}) — l'une
            // des deux ne s'affichant alors plus, donnant l'impression que l'import n'a rien fait.
            const entry: SavedEntry = {
              id: crypto.randomUUID(),
              nom: data.nom,
              date: data.date ?? new Date().toISOString(),
              maxStep: data.maxStep,
              character: data.character,
              tags: data.tags,
            }
            onLibraryChange([...library, entry])
          } else {
            // Ancien format (personnage nu sans enveloppe SavedEntry)
            const entry: SavedEntry = {
              id: crypto.randomUUID(),
              nom: data.nomPersonnage?.trim() || data.nomJoueur?.trim() || t('saveLoad.nomImporte'),
              date: new Date().toISOString(),
              character: data as Character,
            }
            onLibraryChange([...library, entry])
          }
        } else if (type) {
          // Un fichier reconnu d'un autre type d'export (créature, rencontre, ...) — jamais accepté
          // tel quel comme personnage/bibliothèque, pour éviter d'écraser silencieusement la bibliothèque.
          alert(t('saveLoad.fichierMauvaisType', { trouve: t(`typeFichier.${CLE_LABEL_TYPE[type]}`) }))
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

  const inputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 4,
    color: 'var(--tdr-parchment)', fontSize: 12, padding: '5px 8px', fontFamily: 'inherit', boxSizing: 'border-box',
  }
  // Fond opaque : sur Windows, la liste déroulante d'un <select> est un popup natif hors de la page —
  // un fond translucide y est composité sur blanc au lieu du thème sombre.
  const selectStyle: React.CSSProperties = { ...inputStyle, background: 'var(--tdr-dark)', cursor: 'pointer' }
  const optionStyle: React.CSSProperties = { background: 'var(--tdr-dark)', color: 'var(--tdr-parchment)' }

  const compare = (a: SavedEntry, b: SavedEntry): number => {
    if (tri === 'nom') return a.nom.localeCompare(b.nom, locale)
    if (tri === 'niveau') return (b.character.niveau ?? 0) - (a.character.niveau ?? 0) || a.nom.localeCompare(b.nom, locale)
    return new Date(b.date).getTime() - new Date(a.date).getTime()
  }

  const tousLesTags = useMemo(
    () => [...new Set(library.flatMap(e => e.tags ?? []))].sort((a, b) => a.localeCompare(b, locale)),
    [library, locale]
  )

  const groupes = useMemo(() => {
    const rechercheNorm = normaliser(recherche.trim())
    const filtres = rechercheNorm
      ? library.filter(e => normaliser(e.nom).includes(rechercheNorm) || (e.tags ?? []).some(tag => normaliser(tag).includes(rechercheNorm)))
      : library
    const tries = [...filtres].sort(compare)
    if (regroupement === 'aucun') return [{ cle: '__tout__', label: '', entrees: tries }]

    const sansLabel = regroupement === 'peuple' ? t('saveLoad.sansPeuple') : t('saveLoad.sansTag')
    const map = new Map<string, SavedEntry[]>()
    for (const e of tries) {
      const cles = regroupement === 'peuple'
        ? [e.character.peuple?.trim() || sansLabel]
        : (e.tags?.length ? e.tags : [sansLabel])
      for (const cle of cles) {
        if (!map.has(cle)) map.set(cle, [])
        map.get(cle)!.push(e)
      }
    }
    const cles = [...map.keys()].sort((a, b) => {
      if (a === sansLabel) return 1
      if (b === sansLabel) return -1
      return a.localeCompare(b, locale)
    })
    return cles.map(cle => ({ cle, label: cle, entrees: map.get(cle)! }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library, recherche, tri, regroupement, locale])

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
        minWidth: 360, maxWidth: 680, width: '92vw',
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

        {/* Recherche / tri / regroupement */}
        {library.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <input
              value={recherche}
              onChange={ev => setRecherche(ev.target.value)}
              placeholder={t('saveLoad.rechercherPlaceholder')}
              style={{ ...inputStyle, flex: '1 1 160px', minWidth: 0 }}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(245,236,215,0.5)' }}>
              {t('saveLoad.trierPar')}
              <select value={tri} onChange={ev => setTri(ev.target.value as Tri)} style={selectStyle}>
                <option value="nom" style={optionStyle}>{t('saveLoad.trierNom')}</option>
                <option value="date" style={optionStyle}>{t('saveLoad.trierDate')}</option>
                <option value="niveau" style={optionStyle}>{t('saveLoad.trierNiveau')}</option>
              </select>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(245,236,215,0.5)' }}>
              {t('saveLoad.regrouperPar')}
              <select value={regroupement} onChange={ev => setRegroupement(ev.target.value as Regroupement)} style={selectStyle}>
                <option value="aucun" style={optionStyle}>{t('saveLoad.regrouperAucun')}</option>
                <option value="peuple" style={optionStyle}>{t('saveLoad.regrouperPeuple')}</option>
                <option value="tag" style={optionStyle}>{t('saveLoad.regrouperTag')}</option>
              </select>
            </label>
          </div>
        )}

        {/* Liste */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 'min(52vh, 480px)', overflowY: 'auto' }}>
          {library.length === 0 ? (
            <div style={{ color: 'rgba(245,236,215,0.35)', fontSize: 12, textAlign: 'center', padding: '12px 0' }}>
              {t('saveLoad.aucunPersonnage')}
            </div>
          ) : groupes.every(g => g.entrees.length === 0) ? (
            <div style={{ color: 'rgba(245,236,215,0.35)', fontSize: 12, textAlign: 'center', padding: '12px 0' }}>
              {t('saveLoad.aucunResultat')}
            </div>
          ) : groupes.map(g => (
            <div key={g.cle}>
              {regroupement !== 'aucun' && g.entrees.length > 0 && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6, margin: '10px 0 6px',
                  fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em',
                  color: 'rgba(245,236,215,0.55)',
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: couleurGroupe(g.label).point, flexShrink: 0 }} />
                  {g.label}
                  <span style={{ opacity: 0.5 }}>({g.entrees.length})</span>
                </div>
              )}
              {g.entrees.map(e => (
                <div key={e.id} style={{
                  display: 'flex', flexDirection: 'column', gap: 6,
                  padding: '10px 12px', borderRadius: 5,
                  border: '1px solid rgba(201,168,76,0.15)',
                  background: 'rgba(255,255,255,0.02)', marginBottom: 6,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: 'var(--tdr-parchment)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {e.nom}
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(245,236,215,0.4)', marginTop: 1 }}>
                        {e.character.peuple || '—'} · {t('toolbar.niveau', { niveau: e.character.niveau })} · {fmt(e.date)}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button onClick={() => exportCharacter(e)} style={btn} title={t('saveLoad.exporterTitle')}>{t('saveLoad.exporter')}</button>
                      <button onClick={() => { onLoad(e.character, e.maxStep ?? 0); onClose() }} style={btn}>{t('saveLoad.charger')}</button>
                      {confirm === e.id ? (
                        <>
                          <button onClick={() => remove(e.id)} style={btnDanger}>{t('saveLoad.confirmerSuppression')}</button>
                          <button onClick={() => setConfirm(null)} style={{ ...btn, opacity: 0.5 }}>✕</button>
                        </>
                      ) : (
                        <button onClick={() => setConfirm(e.id)} style={btnDanger} title={t('saveLoad.supprimer')}>🗑️</button>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                    {(e.tags ?? []).map(tagVal => {
                      const c = couleurGroupe(tagVal)
                      return (
                        <span
                          key={tagVal}
                          onClick={() => removeTag(e.id, tagVal)}
                          title={t('saveLoad.retirerTagTitle')}
                          style={{
                            fontSize: 12, padding: '2px 9px', borderRadius: 10, cursor: 'pointer',
                            background: c.fond, border: `1px solid ${c.bord}`, color: 'var(--tdr-parchment)',
                          }}
                        >
                          {tagVal} ✕
                        </span>
                      )
                    })}
                    {ajoutTagPour === e.id ? (
                      <input
                        ref={tagInputRef}
                        autoFocus
                        value={nouveauTag}
                        onChange={ev => setNouveauTag(ev.target.value)}
                        onKeyDown={ev => {
                          if (ev.key === 'Enter') { addTag(e.id, nouveauTag); setNouveauTag(''); setAjoutTagPour(null) }
                          if (ev.key === 'Escape') { setNouveauTag(''); setAjoutTagPour(null) }
                        }}
                        onBlur={() => { setAjoutTagPour(null); setNouveauTag('') }}
                        placeholder={t('saveLoad.tagPlaceholder')}
                        style={{ ...inputStyle, width: 120, fontSize: 12, padding: '2px 9px' }}
                      />
                    ) : (
                      <span
                        onClick={() => setAjoutTagPour(e.id)}
                        style={{
                          fontSize: 12, padding: '2px 9px', borderRadius: 10, cursor: 'pointer',
                          border: '1px dashed rgba(201,168,76,0.35)', color: 'rgba(245,236,215,0.5)',
                        }}
                      >
                        {t('saveLoad.ajouterTag')}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Suggestions de tags : rendues dans un portail (voir SelecteurCible.tsx pour le même
            motif) — à l'intérieur de la liste à défilement, elles étaient rognées pour un personnage
            en bas de la fenêtre, et le clic sur une suggestion partiellement visible ne portait pas
            toujours. */}
        {ajoutTagPour && cadreTag && (() => {
          const entreeOuverte = library.find(x => x.id === ajoutTagPour)
          const suggestions = entreeOuverte
            ? tousLesTags
                .filter(tag => !(entreeOuverte.tags ?? []).includes(tag))
                .filter(tag => !nouveauTag.trim() || normaliser(tag).includes(normaliser(nouveauTag)))
                .slice(0, 6)
            : []
          if (suggestions.length === 0) return null
          const placeDessous = window.innerHeight - cadreTag.bottom
          const versLeHaut = placeDessous < 180 && cadreTag.top > placeDessous
          return createPortal(
            <div style={{
              position: 'fixed', left: cadreTag.left, width: Math.max(cadreTag.width, 120), zIndex: 2000,
              ...(versLeHaut
                ? { bottom: window.innerHeight - cadreTag.top + 2, maxHeight: Math.max(120, cadreTag.top - 12) }
                : { top: cadreTag.bottom + 2, maxHeight: Math.max(120, placeDessous - 12) }),
              background: 'var(--tdr-dark)', border: '1px solid rgba(201,168,76,0.35)', borderRadius: 4,
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)', overflowY: 'auto',
            }}>
              {suggestions.map(tag => (
                <div
                  key={tag}
                  // onMouseDown (pas onClick) + preventDefault : évite que le clic ne déclenche d'abord
                  // le blur de l'input (qui viderait/fermerait le champ avant que le tag n'ait pu être
                  // ajouté).
                  onMouseDown={ev => { ev.preventDefault(); addTag(ajoutTagPour, tag); setNouveauTag(''); setAjoutTagPour(null) }}
                  style={{ padding: '4px 9px', fontSize: 12, color: 'var(--tdr-parchment)', cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  {tag}
                </div>
              ))}
            </div>,
            document.body
          )
        })()}

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
