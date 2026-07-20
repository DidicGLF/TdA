import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useGameData } from '../../context/GameDataContext'
import { saveDataFile } from '../../utils/tauriStorage'
import batailleBg from '../../assets/bataille-gold.png'
import {
  DES_ADVERSITE, appliquerRecuperation, appliquerTestAttaque, appliquerTestDefense,
  ajusterPointsBataille, creerBataille, definirPosition, importerPionPJ, retirerPion, seuilSucces, tourSuivant,
} from '../../utils/bataille'
import type {
  BatailleSession, BatailleSessionSauvegardee, DeAdversite, PionPJ, PositionBataille, TerrainBataille, TypeAttaque,
} from '../../utils/bataille'
import type { Character } from '../../types/character'

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

const genId = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : String(Date.now())

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

const POSITIONS: PositionBataille[] = ['premiereLigne', 'tenirLeRang', 'enRetrait', 'arriere']
const TERRAINS: TerrainBataille[] = ['aucun', 'leger', 'lourd']

export default function BatailleTab() {
  const { t } = useTranslation()
  const { data: descriptions, batailles, setBatailles } = useGameData()

  // ── Paramètres du constructeur (avant de lancer la bataille) ──
  const [nom, setNom] = useState('')
  const [tailleArmeePJ, setTailleArmeePJ] = useState(2)
  const [tailleArmeeEnnemie, setTailleArmeeEnnemie] = useState(2)
  const [adversite, setAdversite] = useState<DeAdversite>(6)
  const [defEnnemieMoyenne, setDefEnnemieMoyenne] = useState(14)
  const [bonusAtqEnnemiMoyen, setBonusAtqEnnemiMoyen] = useState(4)
  const [terrain, setTerrain] = useState<TerrainBataille>('aucun')
  const [intensiteDepart, setIntensiteDepart] = useState(5)
  const [limiterRecuperation, setLimiterRecuperation] = useState(false)
  const [pionsEnConstruction, setPionsEnConstruction] = useState<PionPJ[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  // ── Session active ──
  const [session, setSession] = useState<BatailleSession | null>(null)
  const [snapshotId, setSnapshotId] = useState<string | null>(null)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [colonneSurvolee, setColonneSurvolee] = useState<PositionBataille | null>(null)

  const handleFiles = async (files: FileList) => {
    const nouveaux: PionPJ[] = []
    for (const file of Array.from(files)) {
      try {
        const text = await file.text()
        const parsed = JSON.parse(text)
        const entries = Array.isArray(parsed) ? parsed : [parsed]
        for (const entry of entries) {
          const character: Character | undefined = entry?.character ?? (entry?.caracteristiques ? entry : undefined)
          if (character) nouveaux.push(importerPionPJ(character, descriptions))
        }
      } catch { /* fichier invalide, ignoré */ }
    }
    if (nouveaux.length > 0) setPionsEnConstruction(prev => [...prev, ...nouveaux])
  }

  const lancerBataille = () => {
    if (!nom.trim() || pionsEnConstruction.length === 0) return
    setSession(creerBataille({
      nom: nom.trim(), tailleArmeePJ, tailleArmeeEnnemie, adversite, defEnnemieMoyenne, bonusAtqEnnemiMoyen,
      terrain, intensite: intensiteDepart, limiterRecuperation, pions: pionsEnConstruction,
    }))
    setSnapshotId(null)
  }

  const sauvegarderSnapshot = () => {
    if (!session) return
    const id = snapshotId ?? genId()
    const entry: BatailleSessionSauvegardee = { ...session, id, creeLe: new Date().toISOString() }
    setBatailles(prev => snapshotId ? prev.map(b => b.id === id ? entry : b) : [...prev, entry])
    setSnapshotId(id)
    setSaveMsg(t('gmMode.batailleMasse.instantaneEnregistre'))
    setTimeout(() => setSaveMsg(null), 2500)
  }

  const reprendre = (b: BatailleSessionSauvegardee) => {
    setSession(JSON.parse(JSON.stringify(b)) as BatailleSession)
    setSnapshotId(b.id)
  }

  const supprimer = (id: string) => {
    setBatailles(prev => prev.filter(b => b.id !== id))
    setConfirmDeleteId(null)
  }

  const exporter = async (b: BatailleSessionSauvegardee) => {
    const content = JSON.stringify(b, null, 2)
    const safe = b.nom.replace(/[^a-zA-Z0-9À-ÿ _-]/g, '').trim().replace(/\s+/g, '-') || 'bataille'
    const filename = `${safe}.json`
    if (isTauri) {
      await saveDataFile(filename, content)
      setSaveMsg(t('gmMode.batailleMasse.exporteVers', { filename }))
      setTimeout(() => setSaveMsg(null), 3000)
    } else {
      const blob = new Blob([content], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = filename; a.click()
      URL.revokeObjectURL(url)
    }
  }

  // ── Actions sur la session active ──
  const deposerPion = (e: React.DragEvent, position: PositionBataille) => {
    e.preventDefault()
    setColonneSurvolee(null)
    const pionId = e.dataTransfer.getData('text/plain')
    if (pionId) setSession(s => s && definirPosition(s, pionId, position))
  }

  const changerTypeAttaque = (pionId: string, typeAttaque: TypeAttaque) => {
    setSession(s => s && { ...s, pions: s.pions.map(p => p.id === pionId ? { ...p, typeAttaque } : p) })
  }

  const testerAttaqueSur = (pionId: string) => {
    setSession(s => s ? appliquerTestAttaque(s, pionId).session : s)
  }

  const testerDefenseSur = (pionId: string) => {
    setSession(s => s ? appliquerTestDefense(s, pionId).session : s)
  }

  const recupererSur = (pionId: string) => {
    setSession(s => s && appliquerRecuperation(s, pionId, 5))
  }

  const retirerPionActif = (pionId: string) => {
    setSession(s => s && retirerPion(s, pionId))
  }

  // Fond décoratif — même traitement que les autres onglets MJ (Adversité, Bestiaire).
  const backgroundLayer = (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 0,
      backgroundImage: `url(${batailleBg})`, backgroundSize: 'cover', backgroundRepeat: 'no-repeat',
      backgroundPosition: 'center', opacity: 0.08, pointerEvents: 'none', userSelect: 'none',
    }} />
  )

  if (!session) {
    return (
      <div style={{ position: 'relative', minHeight: '100%' }}>
        {backgroundLayer}
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 780, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ fontSize: 12, opacity: 0.5, textAlign: 'center', lineHeight: 1.5 }}>
            {t('gmMode.batailleMasse.intro')}
          </div>

          <div>
            <div style={sectionTitleStyle}>{t('gmMode.batailleMasse.parametres')}</div>
            <div style={{ marginBottom: 12 }}>
              <span style={labelStyle}>{t('gmMode.batailleMasse.nom')}</span>
              <input value={nom} onChange={e => setNom(e.target.value)} placeholder={t('gmMode.batailleMasse.nomPlaceholder')} style={inputStyle} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              <div>
                <span style={labelStyle}>{t('gmMode.batailleMasse.tailleArmeePJ')}</span>
                <input type="number" min={1} max={5} value={tailleArmeePJ}
                  onChange={e => setTailleArmeePJ(Math.min(5, Math.max(1, parseInt(e.target.value) || 1)))} style={inputStyle} />
              </div>
              <div>
                <span style={labelStyle}>{t('gmMode.batailleMasse.tailleArmeeEnnemie')}</span>
                <input type="number" min={1} max={5} value={tailleArmeeEnnemie}
                  onChange={e => setTailleArmeeEnnemie(Math.min(5, Math.max(1, parseInt(e.target.value) || 1)))} style={inputStyle} />
              </div>
              <div>
                <span style={labelStyle}>{t('gmMode.batailleMasse.adversite')}</span>
                <select value={adversite} onChange={e => setAdversite(parseInt(e.target.value) as DeAdversite)} style={selectStyle}>
                  {DES_ADVERSITE.map(d => <option key={d} value={d} style={optionStyle}>d{d}</option>)}
                </select>
              </div>
              <div>
                <span style={labelStyle}>{t('gmMode.batailleMasse.intensiteDepart')}</span>
                <input type="number" min={1} max={10} value={intensiteDepart}
                  onChange={e => setIntensiteDepart(Math.min(10, Math.max(1, parseInt(e.target.value) || 1)))} style={inputStyle} />
              </div>
              <div>
                <span style={labelStyle}>{t('gmMode.batailleMasse.defEnnemie')}</span>
                <input type="number" value={defEnnemieMoyenne}
                  onChange={e => setDefEnnemieMoyenne(parseInt(e.target.value) || 0)} style={inputStyle} />
              </div>
              <div>
                <span style={labelStyle}>{t('gmMode.batailleMasse.bonusAtqEnnemi')}</span>
                <input type="number" value={bonusAtqEnnemiMoyen}
                  onChange={e => setBonusAtqEnnemiMoyen(parseInt(e.target.value) || 0)} style={inputStyle} />
              </div>
              <div>
                <span style={labelStyle}>{t('gmMode.batailleMasse.terrain')}</span>
                <select value={terrain} onChange={e => setTerrain(e.target.value as TerrainBataille)} style={selectStyle}>
                  {TERRAINS.map(tr => <option key={tr} value={tr} style={optionStyle}>{t(`gmMode.batailleMasse.terrains.${tr}`)}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 6 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={limiterRecuperation} onChange={e => setLimiterRecuperation(e.target.checked)} />
                  {t('gmMode.batailleMasse.limiterRecuperation')}
                </label>
              </div>
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ ...sectionTitleStyle, marginBottom: 0, border: 'none', paddingBottom: 0 }}>
                {t('gmMode.batailleMasse.pjEngages')}
              </div>
              <button onClick={() => fileRef.current?.click()} style={{ ...btnStyle, fontSize: 14 }}>
                📂 {t('gmMode.batailleMasse.importerPJ')}
              </button>
              <input ref={fileRef} type="file" accept=".json" multiple style={{ display: 'none' }}
                onChange={e => { if (e.target.files) handleFiles(e.target.files); e.target.value = '' }} />
            </div>
            {pionsEnConstruction.length === 0 ? (
              <div style={{ fontSize: 13, opacity: 0.4, textAlign: 'center', padding: '10px 0' }}>
                {t('gmMode.batailleMasse.aucunPJ')}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                {pionsEnConstruction.map(p => (
                  <div key={p.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                    border: `1px solid ${SECTION_BORDER}`, borderRadius: 6,
                  }}>
                    <span style={{ flex: 1, fontSize: 16, color: PARCHMENT }}>{p.nom}</span>
                    <span style={{ fontSize: 14, opacity: 0.5 }}>DEF {p.def}</span>
                    <span style={{ fontSize: 14, opacity: 0.5 }}>PV {p.pvMax}</span>
                    <button onClick={() => setPionsEnConstruction(prev => prev.filter(x => x.id !== p.id))} style={removeBtnStyle}>✕</button>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={lancerBataille}
              disabled={!nom.trim() || pionsEnConstruction.length === 0}
              style={{
                ...btnStyle, marginTop: 12, borderColor: 'rgba(160,120,255,0.6)', background: 'rgba(140,100,255,0.2)',
                color: 'rgba(210,185,255,0.95)', opacity: (!nom.trim() || pionsEnConstruction.length === 0) ? 0.4 : 1,
              }}
            >
              ▶ {t('gmMode.batailleMasse.lancerBataille')}
            </button>
          </div>

          <div>
            <div style={sectionTitleStyle}>{t('gmMode.batailleMasse.bataillesSauvegardees')}</div>
            {saveMsg && <div style={{ fontSize: 14, color: GOLD, marginBottom: 8 }}>{saveMsg}</div>}
            {batailles.length === 0 ? (
              <div style={{ fontSize: 13, opacity: 0.4, textAlign: 'center', padding: '10px 0' }}>
                {t('gmMode.batailleMasse.aucuneBatailleSauvegardee')}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {batailles.map(b => (
                  <div key={b.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                    border: `1px solid ${SECTION_BORDER}`, borderRadius: 6, background: 'rgba(15,12,8,0.9)',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 16, color: PARCHMENT, fontWeight: 700 }}>{b.nom}</div>
                      <div style={{ fontSize: 11, opacity: 0.5 }}>
                        {t('gmMode.batailleMasse.resume', { tour: b.tour, nb: b.pions.length, intensite: b.intensite })}
                      </div>
                    </div>
                    <button
                      onClick={() => reprendre(b)}
                      style={{ ...btnStyle, borderColor: 'rgba(160,120,255,0.6)', background: 'rgba(140,100,255,0.15)', color: 'rgba(210,185,255,0.95)', fontSize: 14 }}
                    >
                      ▶ {t('gmMode.batailleMasse.reprendre')}
                    </button>
                    <button onClick={() => exporter(b)} style={{ ...btnStyle, fontSize: 14 }}>{t('gmMode.batailleMasse.exporter')}</button>
                    {confirmDeleteId === b.id ? (
                      <button onClick={() => supprimer(b.id)} style={{ ...removeBtnStyle, fontSize: 14 }}>{t('gmMode.batailleMasse.confirmerSuppression')}</button>
                    ) : (
                      <button onClick={() => setConfirmDeleteId(b.id)} style={removeBtnStyle}>✕</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  const seuil = seuilSucces(session)

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      {backgroundLayer}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
        {/* En-tête */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: GOLD, fontFamily: "'Cinzel', serif" }}>{session.nom}</div>
            <div style={{ fontSize: 14, opacity: 0.5 }}>{t('gmMode.batailleMasse.tourLabel', { tour: session.tour })}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {saveMsg && <span style={{ fontSize: 14, color: GOLD }}>{saveMsg}</span>}
            <button onClick={() => setSession(s => s && tourSuivant(s))} style={{
              padding: '6px 14px', borderRadius: 4, border: '1px solid rgba(201,168,76,0.5)',
              background: 'rgba(201,168,76,0.12)', color: GOLD, cursor: 'pointer', fontSize: 15,
            }}>
              ⏭ {t('gmMode.batailleMasse.tourSuivant')}
            </button>
            <button onClick={sauvegarderSnapshot} style={{
              padding: '6px 14px', borderRadius: 4, border: '1px solid rgba(100,200,120,0.5)',
              background: 'rgba(100,200,120,0.12)', color: 'rgba(120,220,140,0.95)', cursor: 'pointer', fontSize: 15,
            }}>
              💾 {t('gmMode.batailleMasse.sauvegarder')}
            </button>
            <button onClick={() => { setSession(null); setSnapshotId(null) }} style={{
              padding: '6px 14px', borderRadius: 4, border: `1px solid ${SECTION_BORDER}`,
              background: 'transparent', color: 'rgba(245,236,215,0.6)', cursor: 'pointer', fontSize: 15,
            }}>
              {t('gmMode.batailleMasse.terminer')}
            </button>
          </div>
        </div>

        {/* Compteurs */}
        <div style={{ display: 'flex', gap: 16, flexShrink: 0 }}>
          <div style={{ flex: 1, border: `1px solid ${SECTION_BORDER}`, borderRadius: 6, padding: '8px 14px' }}>
            <span style={labelStyle}>{t('gmMode.batailleMasse.intensiteLabel')}</span>
            <div style={{ fontSize: 22, fontWeight: 700, color: GOLD, fontFamily: "'Cinzel', serif" }}>{session.intensite} / 10</div>
          </div>
          <div style={{ flex: 1, border: `1px solid ${SECTION_BORDER}`, borderRadius: 6, padding: '8px 14px' }}>
            <span style={labelStyle}>{t('gmMode.batailleMasse.succesLabel')}</span>
            <div style={{ fontSize: 22, fontWeight: 700, color: PARCHMENT }}>{session.succesCumules} / {seuil}</div>
          </div>
          <div style={{ flex: 1, border: `1px solid ${SECTION_BORDER}`, borderRadius: 6, padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <span style={labelStyle}>{t('gmMode.batailleMasse.pointsBatailleLabel')}</span>
              <div style={{ fontSize: 22, fontWeight: 700, color: PARCHMENT }}>{session.pointsBataille}</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setSession(s => s && ajusterPointsBataille(s, -1))} style={{ ...btnStyle, padding: '4px 10px' }}>-</button>
              <button onClick={() => setSession(s => s && ajusterPointsBataille(s, 1))} style={{ ...btnStyle, padding: '4px 10px' }}>+</button>
            </div>
          </div>
        </div>

        {/* Colonnes de position */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 12 }}>
          {POSITIONS.map(position => (
            <div
              key={position}
              onDragOver={e => { e.preventDefault(); setColonneSurvolee(position) }}
              onDragLeave={() => setColonneSurvolee(prev => prev === position ? null : prev)}
              onDrop={e => deposerPion(e, position)}
              style={{
                flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8,
                border: `1px solid ${colonneSurvolee === position ? GOLD : SECTION_BORDER}`, borderRadius: 6,
                background: colonneSurvolee === position ? 'rgba(201,168,76,0.06)' : 'transparent',
                padding: 10, overflowY: 'auto',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: GOLD, textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center', flexShrink: 0 }}>
                {t(`gmMode.batailleMasse.positions.${position}`)}
              </div>
              {session.pions.filter(p => p.position === position).map(pion => (
                <PionCard
                  key={pion.id}
                  pion={pion}
                  onChangerTypeAttaque={type => changerTypeAttaque(pion.id, type)}
                  onTestAttaque={() => testerAttaqueSur(pion.id)}
                  onTestDefense={() => testerDefenseSur(pion.id)}
                  onRecuperer={() => recupererSur(pion.id)}
                  onRetirer={() => retirerPionActif(pion.id)}
                  limiterRecuperation={session.limiterRecuperation}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function PionCard({
  pion, onChangerTypeAttaque, onTestAttaque, onTestDefense, onRecuperer, onRetirer, limiterRecuperation,
}: {
  pion: PionPJ
  onChangerTypeAttaque: (type: TypeAttaque) => void
  onTestAttaque: () => void
  onTestDefense: () => void
  onRecuperer: () => void
  onRetirer: () => void
  limiterRecuperation: boolean
}) {
  const { t } = useTranslation()
  const pvRatio = pion.pvMax > 0 ? Math.max(0, pion.pvActuels / pion.pvMax) : 0

  return (
    <div
      draggable
      onDragStart={e => e.dataTransfer.setData('text/plain', pion.id)}
      style={{
        background: 'rgba(15,12,8,0.95)', border: `1px solid ${SECTION_BORDER}`, borderRadius: 6,
        padding: 10, cursor: 'grab', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: PARCHMENT, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {pion.nom}
        </span>
        <button onClick={onRetirer} style={{ background: 'transparent', border: 'none', color: 'rgba(255,110,110,0.7)', cursor: 'pointer', fontSize: 12, padding: 0, lineHeight: 1 }}>✕</button>
      </div>

      <div>
        <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pvRatio * 100}%`, background: pvRatio > 0.5 ? 'rgba(120,220,140,0.8)' : pvRatio > 0.2 ? 'rgba(230,190,80,0.85)' : 'rgba(230,90,90,0.85)' }} />
        </div>
        <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>{t('gmMode.batailleMasse.pvLabel')} {pion.pvActuels} / {pion.pvMax}</div>
      </div>

      {pion.position !== 'arriere' ? (
        <>
          <select value={pion.typeAttaque} onChange={e => onChangerTypeAttaque(e.target.value as TypeAttaque)} style={{ ...selectStyle, fontSize: 12, padding: '3px 6px' }}>
            <option value="contact" style={optionStyle}>{t('gmMode.batailleMasse.typeAttaque.contact')} ({pion.bonusContact >= 0 ? '+' : ''}{pion.bonusContact})</option>
            <option value="distance" style={optionStyle}>{t('gmMode.batailleMasse.typeAttaque.distance')} ({pion.bonusDistance >= 0 ? '+' : ''}{pion.bonusDistance})</option>
            <option value="magique" style={optionStyle}>{t('gmMode.batailleMasse.typeAttaque.magique')} ({pion.bonusMagique >= 0 ? '+' : ''}{pion.bonusMagique})</option>
          </select>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={onTestAttaque} style={{ ...btnStyle, flex: 1, fontSize: 11, padding: '5px 6px' }}>🎲 {t('gmMode.batailleMasse.testAttaque')}</button>
            <button onClick={onTestDefense} style={{ ...btnStyle, flex: 1, fontSize: 11, padding: '5px 6px' }}>🛡 {t('gmMode.batailleMasse.testDefense')}</button>
          </div>
          {pion.dernierTestAttaque && (
            <div style={{ fontSize: 11, lineHeight: 1.5, color: pion.dernierTestAttaque.reussite ? 'rgba(120,220,140,0.9)' : 'rgba(230,110,110,0.9)' }}>
              🎲 {pion.dernierTestAttaque.jet} {pion.dernierTestAttaque.bonus >= 0 ? '+' : ''}{pion.dernierTestAttaque.bonus} = {pion.dernierTestAttaque.total} {t('gmMode.batailleMasse.vsAbrege')} {pion.dernierTestAttaque.difficulte}
              {pion.dernierTestAttaque.critique && ` · ${t(`gmMode.batailleMasse.critique.${pion.dernierTestAttaque.critique}`)}`}
              {' · '}{pion.dernierTestAttaque.deltaSucces >= 0 ? '+' : ''}{pion.dernierTestAttaque.deltaSucces} {t('gmMode.batailleMasse.succesAbrege')}
            </div>
          )}
          {pion.dernierTestDefense && (
            <div style={{ fontSize: 11, lineHeight: 1.5, color: pion.dernierTestDefense.reussite ? 'rgba(120,220,140,0.9)' : 'rgba(230,110,110,0.9)' }}>
              🛡 {pion.dernierTestDefense.jet} {pion.dernierTestDefense.bonus >= 0 ? '+' : ''}{pion.dernierTestDefense.bonus} = {pion.dernierTestDefense.total} {t('gmMode.batailleMasse.vsAbrege')} {pion.dernierTestDefense.difficulte}
              {pion.dernierTestDefense.critique && ` · ${t(`gmMode.batailleMasse.critique.${pion.dernierTestDefense.critique}`)}`}
              {' · '}{pion.dernierTestDefense.dm} {t('gmMode.batailleMasse.dmAbrege')}
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ fontSize: 11, opacity: 0.6 }}>
            {t('gmMode.batailleMasse.recuperationLabel')} {pion.pointsRecuperationActuels} / {pion.pointsRecuperationMax}
          </div>
          <button
            onClick={onRecuperer}
            disabled={pion.pointsRecuperationActuels <= 0 || (limiterRecuperation && pion.aRecupereCeTour)}
            style={{
              ...btnStyle, fontSize: 11, padding: '5px 6px',
              opacity: (pion.pointsRecuperationActuels <= 0 || (limiterRecuperation && pion.aRecupereCeTour)) ? 0.4 : 1,
            }}
          >
            💚 {t('gmMode.batailleMasse.recuperer')}
          </button>
        </>
      )}
    </div>
  )
}
