import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation, Trans } from 'react-i18next'
import { loadDataFile, saveDataFile } from './utils/tauriStorage'
import type { Character } from './types/character'
import { defaultCharacter } from './types/character'
import type { SavedEntry } from './components/SaveLoadPanel'
import CharacterSheetRecto from './components/CharacterSheetRecto'
import CharacterSheetVerso from './components/CharacterSheetVerso'
import CharacterSheetGolem from './components/CharacterSheetGolem'
import CreationWizard from './components/CreationWizard'
import SaveLoadPanel from './components/SaveLoadPanel'
import DescriptionsEditor from './components/DescriptionsEditor'
import LevelUpModal from './components/LevelUpModal'
import { calcPointsCapacite } from './utils/levelUp'
import { findTrait } from './data/peuples'
import { GameDataProvider, useGameData } from './context/GameDataContext'
import { autoAssignCompagnons } from './utils/compagnons'

export default function App() {
  return <GameDataProvider><AppContent /></GameDataProvider>
}

function AppContent() {
  const { t, i18n } = useTranslation()
  const { data: descriptions, fieldPositions, setFieldPositions, sheetImages, setSheetImages } = useGameData()
  const [character, setCharacter] = useState<Character>(() => ({
    ...defaultCharacter(),
    inventaire: t('wizard.step6.inventaireDefault'),
    tresorerie: t('wizard.step6.tresorerieDefault'),
  }))

  // Synchronise compagnonsActifs dès qu'un rang de voie change, quelle que soit l'origine
  useEffect(() => {
    const newActifs = autoAssignCompagnons(character, descriptions)
    const cur = character.compagnonsActifs ?? [null, null]
    if (newActifs[0] !== (cur[0] ?? null) || newActifs[1] !== (cur[1] ?? null)) {
      setCharacter(prev => ({ ...prev, compagnonsActifs: newActifs }))
    }
  }, [character.voiePeuple, character.voieCulturelle, character.voie1, character.voie2, character.voie3, character.voiePrestige, character.voieSangMele])

  const [step, setStep] = useState(0)
  const [maxStep, setMaxStep] = useState(0)
  const [sheetPage, setSheetPage] = useState<'recto' | 'verso' | 'golem'>('recto')
  const [zoom, setZoom] = useState(() => {
    const saved = localStorage.getItem('tdr-zoom')
    return saved ? parseInt(saved) : 60
  })
  const [calibrate, setCalibrate] = useState(false)
  const [showSave, setShowSave] = useState(false)
  const [showDescEditor, setShowDescEditor] = useState(false)
  const [showLevelUp, setShowLevelUp] = useState(false)
  const [ficheLocked, setFicheLocked] = useState(true)
  const [showUnlockConfirm, setShowUnlockConfirm] = useState(false)
  const [showGestion, setShowGestion] = useState(false)
  const gestionRef = useRef<HTMLDivElement>(null)
  const rectoInputRef = useRef<HTMLInputElement>(null)
  const versoInputRef = useRef<HTMLInputElement>(null)
  const { disponibles: ptsDisponibles } = calcPointsCapacite(character)
  const [library, setLibrary] = useState<SavedEntry[]>([])
  const [libraryLoaded, setLibraryLoaded] = useState(false)
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)
  const [voieHovered, setVoieHovered] = useState(false)
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null)
  const [pinned, setPinned] = useState<{ x: number; y: number } | null>(null)
  const [lastMoved, setLastMoved] = useState<{ label: string; top: number; left: number; width?: number; height?: number } | null>(null)
  const sheetRef = useRef<HTMLDivElement>(null)

  const [screenWidth, setScreenWidth] = useState(() => window.innerWidth)
  const [mobileTab, setMobileTab] = useState<'fiche' | 'creation'>('fiche')

  const onChange = (patch: Partial<Character>) =>
    setCharacter(prev => ({ ...prev, ...patch }))

  const importSheetImage = (side: 'recto' | 'verso', file: File) => {
    const reader = new FileReader()
    reader.onload = e => {
      const dataUrl = e.target?.result as string
      setSheetImages(prev => ({ ...prev, [side]: dataUrl }))
    }
    reader.readAsDataURL(file)
  }

  useEffect(() => {
    setSheetPage(step >= 5 ? 'verso' : 'recto')
  }, [step])

  useEffect(() => {
    const onResize = () => setScreenWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!showGestion) return
    const handler = (e: MouseEvent) => {
      if (gestionRef.current && !gestionRef.current.contains(e.target as Node))
        setShowGestion(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showGestion])

  useEffect(() => {
    const BASE_PT = 12
    const MIN_PT = 5
    const before = () => {
      const printContainer = document.querySelector<HTMLElement>('.print-only')
      if (!printContainer) return
      const rectoEl = printContainer.querySelector<HTMLElement>('.print-page-recto')
      const versoEl = printContainer.querySelector<HTMLElement>('.print-page-verso')

      // Rendre visible hors-écran avec les dimensions d'impression pour mesurer
      printContainer.style.cssText = 'display:block;position:fixed;top:-10000px;left:0;'
      if (rectoEl) rectoEl.style.cssText = 'width:210mm;height:297mm;overflow:hidden;position:relative;'
      if (versoEl) versoEl.style.cssText = 'width:210mm;height:297mm;overflow:hidden;position:relative;'
      printContainer.getBoundingClientRect() // force reflow

      printContainer.querySelectorAll<HTMLElement>('.tdr-field').forEach(el => {
        // Recalcule le line-height des textareas pour les dimensions d'impression (297mm)
        if (el.tagName === 'TEXTAREA') {
          const lhPct = parseFloat((el as HTMLElement).dataset.lhPct ?? '0')
          const ptPct = parseFloat((el as HTMLElement).dataset.ptPct ?? '0')
          if (lhPct) el.style.lineHeight = `${(lhPct / 100 * 297).toFixed(2)}mm`
          if (ptPct) el.style.paddingTop = `${(ptPct / 100 * 297).toFixed(2)}mm`
        }

        el.style.setProperty('font-size', `${BASE_PT}pt`, 'important')
        const w = el.clientWidth
        if (!w) return
        let size = BASE_PT
        while (el.scrollWidth > w + 1 && size > MIN_PT) {
          size = +(size - 0.5).toFixed(1)
          el.style.setProperty('font-size', `${size}pt`, 'important')
        }
        if (el.tagName === 'TEXTAREA') {
          const h = el.clientHeight
          if (h) {
            while (el.scrollHeight > h + 1 && size > MIN_PT) {
              size = +(size - 0.5).toFixed(1)
              el.style.setProperty('font-size', `${size}pt`, 'important')
            }
          }
        }
      })

      // Recalcule le transform portrait : scale uniquement si les tx/ty sont d'anciennes valeurs pixels
      printContainer.querySelectorAll<HTMLElement>('.portrait-img').forEach(el => {
        const s  = parseFloat(el.dataset.scale ?? '1') || 1
        const tx = parseFloat(el.dataset.tx ?? '0')
        const ty = parseFloat(el.dataset.ty ?? '0')
        const safeTx = Math.abs(tx) > 3 ? 0 : tx
        const safeTy = Math.abs(ty) > 3 ? 0 : ty
        el.style.setProperty('transform', `scale(${s}) translate(${safeTx / s * 100}%, ${safeTy / s * 100}%)`, 'important')
      })

      // Restaurer — le CSS @media print prendra le relais
      printContainer.style.cssText = ''
      if (rectoEl) rectoEl.style.cssText = ''
      if (versoEl) versoEl.style.cssText = ''
    }
    window.addEventListener('beforeprint', before)
    return () => window.removeEventListener('beforeprint', before)
  }, [])

  // Chargement initial de la bibliothèque
  useEffect(() => {
    async function load() {
      try {
        const raw = await loadDataFile('library.json')
        if (raw) {
          const parsed: SavedEntry[] = JSON.parse(raw)
          const portraitsRaw = await loadDataFile('portraits.json')
          const portraits: Record<string, string> = portraitsRaw ? JSON.parse(portraitsRaw) : {}
          setLibrary(parsed.map(e => ({ ...e, character: { ...e.character, portrait: portraits[e.id] ?? e.character.portrait ?? '' } })))
        }
      } catch {
        // Fallback localStorage (migration depuis ancienne version)
        try {
          const saved = localStorage.getItem('tdr-library')
          if (saved) {
            const parsed: SavedEntry[] = JSON.parse(saved)
            const portraits: Record<string, string> = JSON.parse(localStorage.getItem('tdr-portraits') ?? '{}')
            setLibrary(parsed.map(e => ({ ...e, character: { ...e.character, portrait: portraits[e.id] ?? e.character.portrait ?? '' } })))
          }
        } catch { /* ignore */ }
      }
      setLibraryLoaded(true)
    }
    load()
  }, [])

  // Persistance de la bibliothèque (portraits séparés pour limites de taille)
  const saveLibrary = useCallback(async (lib: SavedEntry[]) => {
    try {
      const portraits: Record<string, string> = {}
      const compact = lib.map(e => {
        if (e.character.portrait) portraits[e.id] = e.character.portrait
        return { ...e, character: { ...e.character, portrait: '' } }
      })
      await saveDataFile('library.json', JSON.stringify(compact))
      try {
        await saveDataFile('portraits.json', JSON.stringify(portraits))
      } catch { /* portrait trop grand */ }
    } catch { /* quota dépassé */ }
  }, [])

  useEffect(() => {
    if (!libraryLoaded) return
    saveLibrary(library)
  }, [library, libraryLoaded, saveLibrary])

  const getCoords = (e: React.MouseEvent) => {
    const rect = sheetRef.current!.getBoundingClientRect()
    return {
      x: +((e.clientX - rect.left) / rect.width  * 100).toFixed(1),
      y: +((e.clientY - rect.top)  / rect.height * 100).toFixed(1),
    }
  }

  const isMobile = screenWidth < 700

  const handleLoad = (c: Character, savedMaxStep: number) => {
    const tm = c.talentMagique
    const normalized = {
      ...c,
      talentMagique: typeof tm === 'string' ? { nom: tm, desc: '' } : (tm ?? { nom: '', desc: '' }),
      portrait: c.portrait ?? '',
      portraitScale: c.portraitScale ?? 1,
      // Migration : anciennes valeurs en pixels (|val|>3) → reset à 0 (fraction du container)
      portraitTx: Math.abs(c.portraitTx ?? 0) > 3 ? 0 : (c.portraitTx ?? 0),
      portraitTy: Math.abs(c.portraitTy ?? 0) > 3 ? 0 : (c.portraitTy ?? 0),
      portraitFit: c.portraitFit ?? 'cover',
      traitPeupleDesc: c.traitPeupleDesc ?? findTrait(c.peuple, c.culture)?.desc ?? '',
      armuresEquipees: c.armuresEquipees ?? [],
      bonusDefense: c.bonusDefense ?? 0,
      enchantementEncombrement: c.enchantementEncombrement ?? 0,
      arme1: c.arme1 ?? '',
      arme2: c.arme2 ?? '',
      dmArme1: c.dmArme1 ?? '',
      dmArme2: c.dmArme2 ?? '',
    }
    setCharacter(normalized)
    setStep(savedMaxStep)
    setMaxStep(savedMaxStep)
  }

  const printContainer = (
    <div className="print-only" style={{ '--portrait-scale': character.portraitScale ?? 1 } as React.CSSProperties}>
      <div className="print-page-recto">
        <CharacterSheetRecto character={character} onChange={() => {}} activeStep={-1} />
      </div>
      <div className="print-page-verso">
        <CharacterSheetVerso character={character} onChange={() => {}} activeStep={-1} />
      </div>
    </div>
  )

  const modals = (
    <>
      <input ref={rectoInputRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) importSheetImage('recto', f); e.target.value = '' }} />
      <input ref={versoInputRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) importSheetImage('verso', f); e.target.value = '' }} />

      {showLevelUp && (
        <LevelUpModal character={character} onConfirm={onChange} onClose={() => setShowLevelUp(false)} />
      )}
      {showDescEditor && <DescriptionsEditor onClose={() => setShowDescEditor(false)} />}

      {showUnlockConfirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)',
        }}>
          <div style={{ background: 'rgba(22,17,11,0.99)', border: '1px solid rgba(255,160,50,0.5)',
            borderRadius: 10, padding: '28px 28px 24px', maxWidth: 420, width: '90vw',
            boxShadow: '0 8px 40px rgba(0,0,0,0.9)', display: 'flex', flexDirection: 'column', gap: 18,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 28 }}>🔓</span>
              <span style={{ fontSize: 17, fontWeight: 700, color: 'rgba(255,180,60,0.95)', fontFamily: "'Cinzel', serif" }}>
                {t('modalDeverrouiller.titre')}
              </span>
            </div>
            <div style={{ fontSize: 14, color: 'rgba(245,236,215,0.85)', lineHeight: 1.6 }}>
              <Trans
                i18nKey="modalDeverrouiller.description"
                components={{ highlight: <strong style={{ color: 'rgba(255,180,60,0.9)' }} /> }}
              />
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,150,50,0.8)', lineHeight: 1.6,
              background: 'rgba(255,120,30,0.08)', border: '1px solid rgba(255,120,30,0.25)',
              borderRadius: 6, padding: '10px 14px',
            }}>
              <Trans
                i18nKey="modalDeverrouiller.avertissement"
                components={{ strong: <strong /> }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button onClick={() => setShowUnlockConfirm(false)} style={{
                padding: '8px 20px', borderRadius: 5, cursor: 'pointer', fontSize: 14,
                border: '1px solid rgba(245,236,215,0.2)', background: 'transparent',
                color: 'rgba(245,236,215,0.55)', fontFamily: 'inherit',
              }}>{t('modalDeverrouiller.annuler')}</button>
              <button onClick={() => { setFicheLocked(false); setShowUnlockConfirm(false) }} style={{
                padding: '8px 20px', borderRadius: 5, cursor: 'pointer', fontSize: 14, fontWeight: 700,
                border: '1px solid rgba(255,160,50,0.6)', background: 'rgba(255,160,50,0.15)',
                color: 'rgba(255,180,60,0.95)', fontFamily: 'inherit',
              }}>{t('modalDeverrouiller.confirmer')}</button>
            </div>
          </div>
        </div>
      )}
      {showSave && (
        <SaveLoadPanel
          character={character}
          maxStep={maxStep}
          library={library}
          onLibraryChange={setLibrary}
          onLoad={handleLoad}
          onNew={() => {
            setCharacter({ ...defaultCharacter(), inventaire: t('wizard.step6.inventaireDefault'), tresorerie: t('wizard.step6.tresorerieDefault') })
            setStep(0)
            setMaxStep(0)
          }}
          onClose={() => setShowSave(false)}
        />
      )}
    </>
  )

  // ─── Layout mobile (< 700px) ────────────────────────────────────────────
  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden', background: 'var(--tdr-dark)', paddingTop: 'env(safe-area-inset-top)', paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }}>
        {printContainer}

        {/* Zone de contenu */}
        <div style={{ flex: 1, overflow: 'hidden' }}>

          {mobileTab === 'fiche' ? (
            <div style={{ height: '100%', overflowY: 'auto', background: '#111' }}>
              {/* Toolbar compact */}
              <div style={{
                display: 'flex', alignItems: 'center', flexWrap: 'nowrap', gap: 6, padding: '8px',
                position: 'sticky', top: 0, zIndex: 35, background: '#111',
                borderBottom: '1px solid rgba(201,168,76,0.15)',
                overflowX: 'auto', WebkitOverflowScrolling: 'touch',
              }}>
                {(['recto', 'verso', 'golem'] as const).map(p => (
                  <button key={p} onClick={() => setSheetPage(p)} style={{
                    flexShrink: 0,
                    padding: '6px 14px', borderRadius: '4px 4px 0 0',
                    border: '1px solid rgba(201,168,76,0.4)',
                    borderBottom: sheetPage === p ? '2px solid var(--tdr-gold)' : '1px solid transparent',
                    background: sheetPage === p ? 'rgba(201,168,76,0.1)' : 'transparent',
                    color: sheetPage === p ? 'var(--tdr-gold)' : 'rgba(245,236,215,0.5)',
                    cursor: 'pointer', fontSize: 15,
                    fontFamily: "'Cinzel', serif", letterSpacing: '0.05em',
                  }}>
                    {t(`fiche.${p}`)}
                  </button>
                ))}
                <button onClick={() => setShowSave(true)} style={{
                  flexShrink: 0, padding: '6px 12px', borderRadius: 4,
                  border: '1px solid rgba(201,168,76,0.4)', background: 'transparent',
                  color: 'rgba(245,236,215,0.7)', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap',
                }}>{t('toolbar.personnages')}</button>
                <button onClick={() => setShowLevelUp(true)} style={{
                  flexShrink: 0, padding: '6px 12px', borderRadius: 4,
                  border: '1px solid rgba(201,168,76,0.5)', background: 'transparent',
                  color: 'rgba(245,236,215,0.85)', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap',
                }}>{t('toolbar.niveau', { niveau: character.niveau })}{character.niveau >= 20 ? ' ★' : ' →'}</button>
                <button onClick={() => setShowDescEditor(d => !d)} style={{
                  flexShrink: 0, padding: '6px 12px', borderRadius: 4,
                  border: '1px solid rgba(201,168,76,0.4)', background: 'transparent',
                  color: 'rgba(245,236,215,0.7)', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap',
                }}>{t('toolbar.donneesJeu')}</button>
              </div>
              {/* Feuille scrollable */}
              <div style={{ padding: '0 4px 80px' }}>
                {sheetPage === 'recto' ? (
                  <CharacterSheetRecto character={character} onChange={onChange} activeStep={step} />
                ) : sheetPage === 'verso' ? (
                  <CharacterSheetVerso character={character} onChange={onChange} activeStep={step} />
                ) : (
                  <CharacterSheetGolem character={character} onChange={onChange} />
                )}
              </div>
            </div>

          ) : (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'rgba(20,16,10,0.98)' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(201,168,76,0.15)', textAlign: 'center', flexShrink: 0 }}>
                <div style={{ fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.5 }}>
                  {t('app.titre')}
                </div>
                <div style={{ fontSize: 17, fontFamily: "'Cinzel', serif", fontWeight: 700, color: 'var(--tdr-gold)', letterSpacing: '0.05em' }}>
                  {t('app.sousTitre')}
                </div>
              </div>
              <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <CreationWizard
                  step={step} maxStep={maxStep} character={character} onChange={onChange}
                  onNext={() => { const n = Math.min(step + 1, 7); setStep(n); setMaxStep(m => Math.max(m, n)) }}
                  onPrev={() => setStep(s => Math.max(s - 1, 0))}
                  onGoTo={(s) => { setStep(s); setMaxStep(m => Math.max(m, s)) }}
                  onSave={() => setShowSave(true)}
                />
              </div>
            </div>
          )}
        </div>

        {/* Barre de navigation basse */}
        <div style={{ flexShrink: 0, background: 'rgba(15,12,8,0.98)', borderTop: '1px solid rgba(201,168,76,0.25)' }}>
          <div style={{ display: 'flex', height: 56 }}>
            {(['fiche', 'creation'] as const).map(tab => (
              <button key={tab} onClick={() => setMobileTab(tab)} style={{
                flex: 1, border: 'none', background: 'transparent',
                color: mobileTab === tab ? 'var(--tdr-gold)' : 'rgba(245,236,215,0.45)',
                fontSize: 15, fontFamily: "'Cinzel', serif", letterSpacing: '0.05em',
                borderTop: mobileTab === tab ? '2px solid var(--tdr-gold)' : '2px solid transparent',
                cursor: 'pointer',
              }}>{tab === 'fiche' ? t('mobile.ongletFiche') : t('mobile.ongletCreation')}</button>
            ))}
          </div>
          <div style={{ height: 'env(safe-area-inset-bottom)' }} />
        </div>

        {modals}
      </div>
    )
  }

  // ─── Layout desktop / tablette (>= 700px) ───────────────────────────────
  return (
    <div className="app-root" style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--tdr-dark)' }}>

      {printContainer}

      {/* === FEUILLE (gauche, scrollable) === */}
      <div className="no-print" style={{ width: `${zoom}%`, flexShrink: 0, minWidth: 280, overflowY: 'auto', background: '#111' }}>

        {/* Toolbar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 8px 0',
          position: 'sticky', top: 0, zIndex: 35, background: '#111',
        }}>
          {(['recto', 'verso', 'golem'] as const).map(p => (
            <button key={p} onClick={() => setSheetPage(p)} style={{
              padding: '4px 16px', borderRadius: '4px 4px 0 0',
              border: '1px solid rgba(201,168,76,0.4)',
              borderBottom: sheetPage === p ? '2px solid var(--tdr-gold)' : '1px solid transparent',
              background: sheetPage === p ? 'rgba(201,168,76,0.1)' : 'transparent',
              color: sheetPage === p ? 'var(--tdr-gold)' : 'rgba(245,236,215,0.5)',
              cursor: 'pointer', fontSize: 15,
              fontFamily: "'Cinzel', serif", letterSpacing: '0.05em',
            }}>
              {t(`fiche.${p}`)}
            </button>
          ))}

          <div style={{ flex: 1 }} />

          {/* Imprimer */}
          <button
            onClick={() => { document.body.removeAttribute('data-print'); window.print() }}
            style={{
              marginBottom: 4, padding: '3px 12px', borderRadius: 4,
              border: '1px solid rgba(201,168,76,0.3)',
              background: 'transparent',
              color: 'rgba(245,236,215,0.65)',
              cursor: 'pointer', letterSpacing: '0.03em', fontSize: 14,
            }}
          >
            {t('toolbar.imprimer')}
          </button>

          {/* Sauvegarde */}
          <button
            onClick={() => setShowSave(true)}
            style={{
              marginBottom: 4, padding: '3px 12px', borderRadius: 4,
              border: '1px solid rgba(201,168,76,0.4)',
              background: 'transparent',
              color: 'rgba(245,236,215,0.7)',
              cursor: 'pointer', letterSpacing: '0.04em', fontSize: 14,
            }}
          >
            {t('toolbar.personnages')}
          </button>

          {/* Niveau */}
          <button
            onClick={() => setShowLevelUp(true)}
            title={character.niveau >= 20 ? t('toolbar.niveauMax') : t('toolbar.niveauSuivant', { suivant: character.niveau + 1 })}
            style={{
              marginBottom: 4, padding: '3px 12px', borderRadius: 4,
              border: '1px solid rgba(201,168,76,0.5)',
              background: 'transparent',
              color: 'rgba(245,236,215,0.85)',
              cursor: 'pointer',
              letterSpacing: '0.03em', fontSize: 14,
            }}
          >
            {t('toolbar.niveau', { niveau: character.niveau })}{character.niveau >= 20 ? ' ★' : ' →'}
          </button>

          {/* Zoom */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 4 }}>
            <button onClick={() => setZoom(z => { const n = Math.max(30, z - 5); localStorage.setItem('tdr-zoom', String(n)); return n })}
              style={{ color: 'var(--tdr-gold)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>−</button>
            <span style={{ fontSize: 14, color: 'rgba(245,236,215,0.6)', minWidth: 36, textAlign: 'center' }}>{zoom}%</span>
            <button onClick={() => setZoom(z => { const n = Math.min(82, z + 5); localStorage.setItem('tdr-zoom', String(n)); return n })}
              style={{ color: 'var(--tdr-gold)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>+</button>
          </div>

          {/* Menu Gestion */}
          <div ref={gestionRef} style={{ position: 'relative', marginBottom: 4 }}>
            <button
              onClick={() => setShowGestion(g => !g)}
              style={{
                padding: '3px 12px', borderRadius: 4,
                border: `1px solid ${showGestion ? 'var(--tdr-gold)' : 'rgba(201,168,76,0.4)'}`,
                background: showGestion ? 'rgba(201,168,76,0.1)' : 'transparent',
                color: showGestion ? 'var(--tdr-gold)' : 'rgba(245,236,215,0.7)',
                cursor: 'pointer', letterSpacing: '0.04em', fontSize: 14,
              }}
            >
              {t('toolbar.gestion')}
            </button>
            {showGestion && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 100,
                background: 'rgba(18,14,9,0.99)', border: '1px solid rgba(201,168,76,0.3)',
                borderRadius: 6, boxShadow: '0 4px 20px rgba(0,0,0,0.7)',
                minWidth: 220, display: 'flex', flexDirection: 'column', overflow: 'hidden',
              }}>
                {/* Données du jeu */}
                <button onClick={() => { setShowDescEditor(d => !d); setShowGestion(false) }} style={{
                  padding: '10px 16px', background: 'transparent', border: 'none',
                  borderBottom: '1px solid rgba(201,168,76,0.1)',
                  color: 'rgba(245,236,215,0.8)', cursor: 'pointer', textAlign: 'left', fontSize: 14,
                }}>
                  {t('menuGestion.donneesJeu')}
                </button>

                {/* Déverrouiller la fiche */}
                <button onClick={() => {
                  if (ficheLocked) { setShowUnlockConfirm(true); setShowGestion(false) }
                  else { setFicheLocked(true); setShowGestion(false) }
                }} style={{
                  padding: '10px 16px', background: ficheLocked ? 'transparent' : 'rgba(255,160,50,0.1)',
                  border: 'none', borderBottom: '1px solid rgba(201,168,76,0.1)',
                  color: ficheLocked ? 'rgba(245,236,215,0.8)' : 'rgba(255,180,60,0.95)',
                  cursor: 'pointer', textAlign: 'left', fontSize: 14,
                }}>
                  {ficheLocked ? t('menuGestion.deverrouiller') : t('menuGestion.verrouiller')}
                </button>

                {/* Langue */}
                <div style={{
                  padding: '8px 16px', borderBottom: import.meta.env.DEV ? '1px solid rgba(201,168,76,0.1)' : 'none',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <span style={{ fontSize: 13, color: 'rgba(245,236,215,0.5)' }}>{t('menuGestion.langue')}</span>
                  {(['fr', 'en'] as const).map(lang => (
                    <button key={lang} onClick={() => { i18n.changeLanguage(lang); localStorage.setItem('tda-lang', lang) }} style={{
                      padding: '2px 8px', borderRadius: 3, fontSize: 12, cursor: 'pointer', fontWeight: 600,
                      border: `1px solid ${i18n.language === lang ? 'var(--tdr-gold)' : 'rgba(201,168,76,0.3)'}`,
                      background: i18n.language === lang ? 'rgba(201,168,76,0.15)' : 'transparent',
                      color: i18n.language === lang ? 'var(--tdr-gold)' : 'rgba(245,236,215,0.5)',
                    }}>{lang.toUpperCase()}</button>
                  ))}
                </div>

                {/* Feuilles personnalisées */}
                <div style={{ borderTop: '1px solid rgba(201,168,76,0.1)', padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 11, color: 'rgba(245,236,215,0.4)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    {t('menuGestion.feuilles')}
                  </span>
                  {(['recto', 'verso'] as const).map(side => (
                    <div key={side} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button onClick={() => (side === 'recto' ? rectoInputRef : versoInputRef).current?.click()} style={{
                        flex: 1, padding: '5px 8px', background: 'transparent',
                        border: '1px solid rgba(201,168,76,0.25)', borderRadius: 3,
                        color: 'rgba(245,236,215,0.75)', cursor: 'pointer', fontSize: 12, textAlign: 'left',
                      }}>
                        {sheetImages[side] ? t('menuGestion.feuillePersonnalisee', { side: side.toUpperCase() }) : t('menuGestion.importerFeuille', { side: side.toUpperCase() })}
                      </button>
                      {sheetImages[side] && (
                        <button onClick={() => setSheetImages(prev => ({ ...prev, [side]: '' }))} title={t('menuGestion.reinitFeuille')} style={{
                          padding: '4px 6px', background: 'transparent',
                          border: '1px solid rgba(255,80,80,0.3)', borderRadius: 3,
                          color: 'rgba(255,110,110,0.7)', cursor: 'pointer', fontSize: 11,
                        }}>✕</button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Calibrage */}
                <button onClick={() => { setCalibrate(c => !c); setPinned(null); setLastMoved(null); setShowGestion(false) }} style={{
                  padding: '10px 16px', background: calibrate ? 'rgba(201,168,76,0.15)' : 'transparent',
                  border: 'none',
                  color: calibrate ? 'var(--tdr-gold)' : 'rgba(245,236,215,0.8)',
                  cursor: 'pointer', textAlign: 'left', fontSize: 14,
                }}>
                  {calibrate ? t('menuGestion.calibrageOn') : t('menuGestion.calibrage')}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Feuille + overlay calibrage */}
        <div style={{ padding: '0 8px 16px' }}>
          <div
            ref={sheetRef}
            style={{ width: '100%', minWidth: 320, cursor: calibrate ? 'crosshair' : 'auto', position: 'relative' }}
            onMouseMove={e => {
              if (calibrate) setHover(getCoords(e))
              setCursor({ x: e.clientX, y: e.clientY })
              setVoieHovered(!!(e.target as Element).closest('[data-voie]'))
            }}
            onMouseLeave={() => { setHover(null); setCursor(null); setVoieHovered(false) }}
            onClick={calibrate ? e => { e.stopPropagation(); setPinned(getCoords(e)) } : undefined}
          >
            {sheetPage === 'recto' ? (
              <CharacterSheetRecto character={character} onChange={onChange} activeStep={step}
                calibrate={calibrate} locked={ficheLocked} fieldPositions={fieldPositions} sheetImage={sheetImages.recto || undefined}
                onFieldMoved={(l, t, lf, w, h) => { setLastMoved({ label: l, top: t, left: lf, width: w, height: h }); setFieldPositions(prev => ({ ...prev, [l]: { top: t, left: lf, ...(w !== undefined ? { width: w } : {}), ...(h !== undefined ? { height: h } : {}) } })) }} />
            ) : sheetPage === 'verso' ? (
              <CharacterSheetVerso character={character} onChange={onChange} activeStep={step}
                calibrate={calibrate} locked={ficheLocked} fieldPositions={fieldPositions} sheetImage={sheetImages.verso || undefined}
                onFieldMoved={(l, t, lf, w, h) => { setLastMoved({ label: l, top: t, left: lf, width: w, height: h }); setFieldPositions(prev => ({ ...prev, [l]: { top: t, left: lf, ...(w !== undefined ? { width: w } : {}), ...(h !== undefined ? { height: h } : {}) } })) }} />
            ) : (
              <CharacterSheetGolem character={character} onChange={onChange} />
            )}

            {/* Tooltip coordonnées au survol (suit le curseur) */}
            {calibrate && hover && (
              <div style={{
                position: 'absolute',
                top: `${hover.y}%`,
                left: `${hover.x}%`,
                transform: 'translate(10px, -28px)',
                background: 'rgba(0,0,0,0.88)',
                color: '#7fff7f',
                padding: '2px 8px',
                borderRadius: 4,
                fontSize: 11,
                fontFamily: 'monospace',
                pointerEvents: 'none',
                zIndex: 30,
                whiteSpace: 'nowrap',
                boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
              }}>
                top={hover.y} left={hover.x}
              </div>
            )}

            {/* Marqueur rouge au dernier clic */}
            {calibrate && pinned && (
              <div style={{
                position: 'absolute',
                top: `${pinned.y}%`,
                left: `${pinned.x}%`,
                transform: 'translate(-50%, -50%)',
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: '#ff4444',
                border: '2px solid white',
                zIndex: 31,
                pointerEvents: 'none',
                boxShadow: '0 0 4px rgba(255,68,68,0.8)',
              }} />
            )}
          </div>
        </div>
      </div>

      {/* HUD coordonnées (fixe en bas à gauche, toujours visible) */}
      {calibrate && (
        <div className="no-print" style={{
          position: 'fixed', bottom: 0, left: 0,
          right: 360,
          zIndex: 50,
          padding: '8px 16px',
          background: 'rgba(15,12,8,0.97)',
          borderTop: '1px solid rgba(201,168,76,0.4)',
          fontFamily: 'monospace', fontSize: 12, color: 'var(--tdr-parchment)',
          display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap',
        }}>
          <span style={{ color: 'rgba(245,236,215,0.5)' }}>
            {t('calibrage.survol')}{' '}
            <span style={{ color: 'var(--tdr-gold)' }}>
              {hover ? `top=${hover.y}  left=${hover.x}` : '—'}
            </span>
          </span>
          {lastMoved ? (
            <span>
              <span style={{ color: 'rgba(245,236,215,0.6)' }}>{lastMoved.label} : </span>
              <span style={{ color: '#7fff7f', fontWeight: 700 }}>
                top={lastMoved.top}  left={lastMoved.left}
                {lastMoved.width  !== undefined && `  width={${lastMoved.width}}`}
                {lastMoved.height !== undefined && `  height={${lastMoved.height}}`}
              </span>
              <button
                onClick={() => navigator.clipboard.writeText(
                  `${lastMoved.label}  top={${lastMoved.top}} left={${lastMoved.left}}` +
                  (lastMoved.width  !== undefined ? ` width={${lastMoved.width}}`   : '') +
                  (lastMoved.height !== undefined ? ` height={${lastMoved.height}}` : '')
                )}
                style={{
                  marginLeft: 8, padding: '1px 6px', fontSize: 10, borderRadius: 3,
                  border: '1px solid rgba(201,168,76,0.4)', background: 'transparent',
                  color: 'var(--tdr-gold)', cursor: 'pointer',
                }}
              >
                {t('calibrage.copier')}
              </button>
            </span>
          ) : (
            <span style={{ color: 'rgba(245,236,215,0.35)', fontSize: 11 }}>
              {t('calibrage.glisser')}
            </span>
          )}
          <button
            onClick={() => setFieldPositions({})}
            style={{
              marginLeft: 'auto', padding: '2px 10px', fontSize: 11, borderRadius: 3,
              border: '1px solid rgba(255,80,80,0.4)', background: 'transparent',
              color: 'rgba(255,110,110,0.8)', cursor: 'pointer',
            }}
          >
            {t('calibrage.reinitialiser')}
          </button>
        </div>
      )}

      {/* Badge points de capacité — suit le curseur sur la feuille */}
      {cursor && voieHovered && ptsDisponibles !== 0 && (
        <div style={{
          position: 'fixed',
          left: cursor.x + 16,
          top: cursor.y + 16,
          zIndex: 40,
          pointerEvents: 'none',
          background: ptsDisponibles > 0 ? 'rgba(18,14,9,0.95)' : 'rgba(40,10,10,0.95)',
          border: `1px solid ${ptsDisponibles > 0 ? 'rgba(201,168,76,0.6)' : 'rgba(255,80,80,0.5)'}`,
          borderRadius: 6, padding: '5px 12px',
          color: ptsDisponibles > 0 ? 'var(--tdr-gold)' : 'rgba(255,110,110,0.9)',
          fontSize: 13, fontWeight: 600, letterSpacing: '0.04em',
          boxShadow: '0 2px 12px rgba(0,0,0,0.7)',
          whiteSpace: 'nowrap',
        }}>
          {ptsDisponibles > 0
            ? t('capacite.disponible', { count: ptsDisponibles })
            : t('capacite.enTrop', { count: Math.abs(ptsDisponibles) })}
        </div>
      )}

      {modals}

      {/* === WIZARD (droite, flexible) === */}
      <div className="no-print" style={{
        flex: 1, minWidth: 300,
        borderLeft: '1px solid rgba(201,168,76,0.2)',
        display: 'flex', flexDirection: 'column',
        background: 'rgba(20,16,10,0.98)',
      }}>
        <div style={{ padding: '16px', borderBottom: '1px solid rgba(201,168,76,0.15)', textAlign: 'center' }}>
          <div style={{ fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.5 }}>
            {t('app.titre')}
          </div>
          <div style={{ fontSize: 18, fontFamily: "'Cinzel', serif", fontWeight: 700, color: 'var(--tdr-gold)', letterSpacing: '0.05em' }}>
            {t('app.sousTitre')}
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <CreationWizard
            step={step} maxStep={maxStep} character={character} onChange={onChange}
            onNext={() => { const n = Math.min(step + 1, 7); setStep(n); setMaxStep(m => Math.max(m, n)) }}
            onPrev={() => setStep(s => Math.max(s - 1, 0))}
            onGoTo={(s) => { setStep(s); setMaxStep(m => Math.max(m, s)) }}
            onSave={() => setShowSave(true)}
            onPrint={() => { document.body.removeAttribute('data-print'); window.print() }}
          />
        </div>
      </div>
    </div>
  )
}
