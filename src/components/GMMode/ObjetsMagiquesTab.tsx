import { useState, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useGameData, OBJETS_MAGIQUES_LIVRE } from '../../context/GameDataContext'
import ObjetMagiqueDetail from './ObjetMagiqueDetail'
import { desenvelopper, messageMauvaisType } from '../../utils/importTypage'
import objetsIllustration from '../../assets/objets-gold.png'
import type { ObjetMagiqueEntry } from '../../types/gameData'

const GOLD = '#c9a84c'
const PARCHMENT = '#f5ecd7'
const SECTION_BORDER = 'rgba(201,168,76,0.2)'

const genId = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : String(Date.now())

function nouvelObjet(): ObjetMagiqueEntry {
  return { id: genId(), nom: '', categorie: 'traditionnel', slot: 'arme', enchantements: [], niveauMagieBase: 0, niveauMagie: 0, valeur: 0 }
}

export default function ObjetsMagiquesTab({ mobile }: { mobile: boolean }) {
  const { t } = useTranslation()
  const { objetsMagiques, setObjetsMagiques } = useGameData()
  const [mobileListeOuverte, setMobileListeOuverte] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tri, setTri] = useState<{ champ: 'nom' | 'niveauMagie'; sens: 'asc' | 'desc' }>({ champ: 'nom', sens: 'asc' })
  const toggleTri = (champ: 'nom' | 'niveauMagie') => {
    setTri(prev => prev.champ === champ ? { champ, sens: prev.sens === 'asc' ? 'desc' : 'asc' } : { champ, sens: 'asc' })
  }

  const clesLivre = useMemo(() => new Set(OBJETS_MAGIQUES_LIVRE.map(o => o.id)), [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const liste = objetsMagiques.filter(o => !q || o.nom.toLowerCase().includes(q))
    const signe = tri.sens === 'asc' ? 1 : -1
    liste.sort((a, b) => tri.champ === 'niveauMagie' ? (a.niveauMagie - b.niveauMagie) * signe : a.nom.localeCompare(b.nom) * signe)
    return liste
  }, [search, objetsMagiques, tri])

  const selected = objetsMagiques.find(o => o.id === selectedId) ?? null

  const addObjet = () => {
    const objet = nouvelObjet()
    setObjetsMagiques(prev => [...prev, objet])
    setSelectedId(objet.id)
  }

  const clonerSelected = () => {
    if (!selected) return
    const objet = { ...JSON.parse(JSON.stringify(selected)), id: genId(), nom: `${selected.nom} (copie)` }
    setObjetsMagiques(prev => [...prev, objet])
    setSelectedId(objet.id)
  }

  const updateSelected = (patch: Partial<ObjetMagiqueEntry>) => {
    if (!selected) return
    setObjetsMagiques(prev => prev.map(o => o.id === selected.id ? { ...o, ...patch } : o))
  }

  const deleteSelected = () => {
    if (!selected) return
    setObjetsMagiques(prev => prev.filter(o => o.id !== selected.id))
    setSelectedId(null)
  }

  const fichierImportRef = useRef<HTMLInputElement>(null)
  const [messageImport, setMessageImport] = useState<string | null>(null)

  const importerObjets = async (fichiers: FileList) => {
    const ajoutes: ObjetMagiqueEntry[] = []
    const rejets: string[] = []
    for (const fichier of Array.from(fichiers)) {
      try {
        const brut = JSON.parse(await fichier.text())
        const entrees: unknown[] = Array.isArray(brut) ? brut : [brut]
        for (const entree of entrees) {
          const { type, contenu } = desenvelopper(entree)
          if (type && type !== 'objet-magique') {
            rejets.push(messageMauvaisType(t, 'objet-magique', type))
            continue
          }
          const o = contenu as ObjetMagiqueEntry
          if (!o || typeof o.nom !== 'string') continue
          // Un objet importé garde son id d'origine SAUF collision avec un id déjà présent (import
          // d'un même fichier deux fois, ou fichier partagé par plusieurs MJ) : un nouvel id est alors
          // généré pour ne pas écraser silencieusement l'entrée existante.
          const idLibre = objetsMagiques.some(x => x.id === o.id) || ajoutes.some(x => x.id === o.id)
          ajoutes.push(idLibre ? { ...o, id: genId() } : o)
        }
      } catch {
        // Fichier illisible : ignoré, signalé par le décompte final.
      }
    }
    if (ajoutes.length > 0) {
      setObjetsMagiques(prev => [...prev, ...ajoutes])
      setSelectedId(ajoutes[0].id)
    }
    const message = [
      ajoutes.length > 0 || rejets.length === 0 ? t('gmMode.objetsMagiquesTab.importResultat', { count: ajoutes.length }) : null,
      ...rejets,
    ].filter(Boolean).join(' ')
    setMessageImport(message)
    setTimeout(() => setMessageImport(null), 5000)
  }

  return (
    <div style={{ display: 'flex', gap: mobile ? 0 : 16, height: '100%', position: 'relative' }}>
      {mobile && mobileListeOuverte && (
        <div onClick={() => setMobileListeOuverte(false)} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.55)' }} />
      )}
      {(!mobile || mobileListeOuverte) && (
        <div style={mobile ? {
          display: 'flex', flexDirection: 'column', gap: 12,
          position: 'fixed', left: 0, right: 0, bottom: 0, maxHeight: '80vh', zIndex: 201,
          background: 'rgba(18,14,9,0.99)', borderTop: '1px solid rgba(201,168,76,0.3)',
          borderRadius: '12px 12px 0 0', boxShadow: '0 -4px 30px rgba(0,0,0,0.8)',
          padding: 12, paddingBottom: 'calc(12px + env(safe-area-inset-bottom))', boxSizing: 'border-box',
        } : { display: 'flex', flexDirection: 'column', gap: 12, width: 380, flexShrink: 0, minHeight: 0 }}>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder={t('gmMode.objetsMagiquesTab.titre')}
            style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(201,168,76,0.4)', background: 'rgba(255,255,255,0.03)', color: PARCHMENT, fontSize: 14 }}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', minWidth: 0 }}>
            <button onClick={addObjet} style={{ background: 'transparent', border: '1px dashed rgba(201,168,76,0.5)', borderRadius: 4, color: GOLD, cursor: 'pointer', fontSize: 14, padding: '3px 8px', whiteSpace: 'nowrap' }}>
              + {t('gmMode.objetsMagiquesTab.nouvelObjet')}
            </button>
            <button onClick={() => fichierImportRef.current?.click()} style={{ background: 'transparent', border: '1px dashed rgba(201,168,76,0.5)', borderRadius: 4, color: GOLD, cursor: 'pointer', fontSize: 14, padding: '3px 8px', whiteSpace: 'nowrap' }}>
              {t('gmMode.objetsMagiquesTab.importer')}
            </button>
            <input ref={fichierImportRef} type="file" accept=".json" multiple style={{ display: 'none' }}
              onChange={e => { if (e.target.files?.length) importerObjets(e.target.files); e.target.value = '' }} />
            {messageImport && <span style={{ fontSize: 12, color: 'rgba(130,220,140,0.95)', whiteSpace: 'nowrap' }}>{messageImport}</span>}
          </div>
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', border: `1px solid ${SECTION_BORDER}`, borderRadius: 6 }}>
            {/* En-tête de colonnes triable, même marge droite que les lignes ci-dessous pour rester
                aligné avec le niveau de magie malgré la scrollbar (voir BestiaireTab). */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '6px 20px 6px 12px', flexShrink: 0,
              borderBottom: `1px solid ${SECTION_BORDER}`,
            }}>
              <button onClick={() => toggleTri('nom')} style={{
                flex: 1, display: 'flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none',
                cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.04em', padding: 0, textAlign: 'left', color: tri.champ === 'nom' ? GOLD : 'rgba(245,236,215,0.5)',
              }}>
                {t('gmMode.objetsMagiquesTab.triNom')} {tri.champ === 'nom' && (tri.sens === 'asc' ? '▲' : '▼')}
              </button>
              <button onClick={() => toggleTri('niveauMagie')} style={{
                minWidth: 24, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4,
                background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12,
                fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', padding: 0,
                color: tri.champ === 'niveauMagie' ? GOLD : 'rgba(245,236,215,0.5)',
              }}>
                {t('gmMode.objetsMagiquesTab.triNiveauMagie')} {tri.champ === 'niveauMagie' && (tri.sens === 'asc' ? '▲' : '▼')}
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {filtered.map(o => {
                const isSelected = o.id === selectedId
                const estLivre = clesLivre.has(o.id)
                return (
                  <div key={o.id} onClick={() => { setSelectedId(o.id); if (mobile) setMobileListeOuverte(false) }} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 20px 8px 12px', cursor: 'pointer',
                    background: isSelected ? 'rgba(201,168,76,0.12)' : 'transparent',
                    borderLeft: isSelected ? `2px solid ${GOLD}` : '2px solid transparent',
                    borderBottom: `1px solid ${SECTION_BORDER}`,
                  }}>
                    <span style={{ flex: 1, fontSize: 15, color: isSelected ? GOLD : PARCHMENT }}>
                      {o.nom || t('gmMode.objetsMagiquesTab.nouvelObjet')}
                    </span>
                    {estLivre ? (
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', padding: '1px 5px', borderRadius: 3, border: '1px solid rgba(201,168,76,0.35)', color: 'rgba(201,168,76,0.75)' }}>
                        {t('gmMode.objetsMagiquesTab.badgeLivre')}
                      </span>
                    ) : (
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', padding: '1px 5px', borderRadius: 3, border: '1px solid rgba(120,200,140,0.45)', color: 'rgba(140,215,160,0.9)' }}>
                        {t('gmMode.objetsMagiquesTab.badgePerso')}
                      </span>
                    )}
                    <span style={{ fontSize: 13, color: GOLD, fontWeight: 700, minWidth: 24, textAlign: 'right' }}>{o.niveauMagie}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <div style={{ flex: mobile ? undefined : 1, width: mobile ? '100%' : undefined, minWidth: 0, border: `1px solid ${SECTION_BORDER}`, borderRadius: 6, padding: mobile ? 12 : 20, overflowY: 'auto', position: 'relative' }}>
        {mobile && (
          <button onClick={() => setMobileListeOuverte(true)} style={{
            position: 'fixed', bottom: 16, left: 16, zIndex: 150,
            display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 20,
            background: 'rgba(15,12,8,0.95)', border: `1px solid ${GOLD}`, color: GOLD,
            cursor: 'pointer', fontSize: 14, fontWeight: 700, boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
          }}>
            ✨ {filtered.length}
          </button>
        )}
        {selected ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {clesLivre.has(selected.id) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', border: `1px solid ${SECTION_BORDER}`, borderRadius: 6, padding: '10px 14px', background: 'rgba(201,168,76,0.05)' }}>
                <span style={{ flex: 1, minWidth: 200, fontSize: 13, lineHeight: 1.45, color: 'rgba(245,236,215,0.7)' }}>
                  {t('gmMode.objetsMagiquesTab.livreInfo')}
                </span>
                <button onClick={clonerSelected} style={{ background: 'transparent', border: '1px dashed rgba(201,168,76,0.5)', borderRadius: 4, color: GOLD, cursor: 'pointer', fontSize: 14, padding: '4px 10px', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>
                  ⎘ {t('gmMode.objetsMagiquesTab.cloner')}
                </button>
              </div>
            )}
            <ObjetMagiqueDetail
              objet={selected}
              onChange={updateSelected}
              onDelete={deleteSelected}
            />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, height: '100%', minHeight: 0 }}>
            <div style={{ flex: '1 1 0', minHeight: 0, minWidth: 0, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              <img src={objetsIllustration} alt="" style={{ maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto', objectFit: 'contain', opacity: 0.08, transform: 'scale(1.4)', userSelect: 'none', pointerEvents: 'none' }} />
            </div>
            <span style={{ flexShrink: 0, opacity: 0.4, fontSize: 14 }}>{t('gmMode.objetsMagiquesTab.aucuneSelection')}</span>
          </div>
        )}
      </div>
    </div>
  )
}
