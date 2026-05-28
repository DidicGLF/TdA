import { useState, useRef, useEffect } from 'react'
import type { Character } from './types/character'
import { defaultCharacter } from './types/character'
import type { SavedEntry } from './components/SaveLoadPanel'
import CharacterSheetRecto from './components/CharacterSheetRecto'
import CharacterSheetVerso from './components/CharacterSheetVerso'
import CreationWizard from './components/CreationWizard'
import SaveLoadPanel from './components/SaveLoadPanel'
import DescriptionsEditor from './components/DescriptionsEditor'
import LevelUpModal from './components/LevelUpModal'
import { calcPointsCapacite } from './utils/levelUp'
import { findTrait } from './data/peuples'
import { GameDataProvider } from './context/GameDataContext'

export default function App() {
  const [character, setCharacter] = useState<Character>(defaultCharacter())
  const [step, setStep] = useState(0)
  const [maxStep, setMaxStep] = useState(0)
  const [sheetPage, setSheetPage] = useState<'recto' | 'verso'>('recto')
  const [zoom, setZoom] = useState(() => {
    const saved = localStorage.getItem('tdr-zoom')
    return saved ? parseInt(saved) : 60
  })
  const [calibrate, setCalibrate] = useState(false)
  const [showSave, setShowSave] = useState(false)
  const [showDescEditor, setShowDescEditor] = useState(false)
  const [showLevelUp, setShowLevelUp] = useState(false)
  const { disponibles: ptsDisponibles } = calcPointsCapacite(character)
  const [library, setLibrary] = useState<SavedEntry[]>(() => {
    try {
      const saved = localStorage.getItem('tdr-library')
      if (!saved) return []
      const parsed: SavedEntry[] = JSON.parse(saved)
      // Portraits are stored separately to handle localStorage size limits
      const portraits: Record<string, string> = JSON.parse(localStorage.getItem('tdr-portraits') ?? '{}')
      return parsed.map(e => ({ ...e, character: { ...e.character, portrait: portraits[e.id] ?? e.character.portrait ?? '' } }))
    } catch { return [] }
  })
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)
  const [voieHovered, setVoieHovered] = useState(false)
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null)
  const [pinned, setPinned] = useState<{ x: number; y: number } | null>(null)
  const [lastMoved, setLastMoved] = useState<{ label: string; top: number; left: number; width?: number; height?: number } | null>(null)
  const sheetRef = useRef<HTMLDivElement>(null)

  const onChange = (patch: Partial<Character>) =>
    setCharacter(prev => ({ ...prev, ...patch }))

  useEffect(() => {
    setSheetPage(step >= 5 ? 'verso' : 'recto')
  }, [step])

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

  // Persist library to localStorage (portraits stored separately to handle 5MB limit)
  useEffect(() => {
    try {
      const portraits: Record<string, string> = {}
      const compact = library.map(e => {
        if (e.character.portrait) portraits[e.id] = e.character.portrait
        return { ...e, character: { ...e.character, portrait: '' } }
      })
      localStorage.setItem('tdr-library', JSON.stringify(compact))
      try {
        localStorage.setItem('tdr-portraits', JSON.stringify(portraits))
      } catch {
        localStorage.removeItem('tdr-portraits')
      }
    } catch { /* quota dépassé */ }
  }, [library])

  const getCoords = (e: React.MouseEvent) => {
    const rect = sheetRef.current!.getBoundingClientRect()
    return {
      x: +((e.clientX - rect.left) / rect.width  * 100).toFixed(1),
      y: +((e.clientY - rect.top)  / rect.height * 100).toFixed(1),
    }
  }

  return (
    <GameDataProvider>
    <div className="app-root" style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--tdr-dark)' }}>

      {/* === CONTENEUR IMPRESSION (hors flux, caché à l'écran, visible à l'impression) === */}
      <div className="print-only" style={{ '--portrait-scale': character.portraitScale ?? 1 } as React.CSSProperties}>
        <div className="print-page-recto">
          <CharacterSheetRecto character={character} onChange={() => {}} activeStep={-1} />
        </div>
        <div className="print-page-verso">
          <CharacterSheetVerso character={character} onChange={() => {}} activeStep={-1} />
        </div>
      </div>

      {/* === FEUILLE (gauche, scrollable) === */}
      <div className="no-print" style={{ width: `${zoom}%`, flexShrink: 0, minWidth: 280, overflowY: 'auto', background: '#111' }}>

        {/* Toolbar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 8px 0',
          position: 'sticky', top: 0, zIndex: 10, background: '#111',
        }}>
          {(['recto', 'verso'] as const).map(p => (
            <button key={p} onClick={() => setSheetPage(p)} style={{
              padding: '4px 16px', borderRadius: '4px 4px 0 0',
              border: '1px solid rgba(201,168,76,0.4)',
              borderBottom: sheetPage === p ? '2px solid var(--tdr-gold)' : '1px solid transparent',
              background: sheetPage === p ? 'rgba(201,168,76,0.1)' : 'transparent',
              color: sheetPage === p ? 'var(--tdr-gold)' : 'rgba(245,236,215,0.5)',
              cursor: 'pointer', fontSize: 15,
              fontFamily: "'Cinzel', serif", letterSpacing: '0.05em',
            }}>
              {p === 'recto' ? 'Recto' : 'Verso'}
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
            Imprimer
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
            Personnages
          </button>

          {/* Niveau */}
          <button
            onClick={() => setShowLevelUp(true)}
            title={character.niveau >= 20 ? 'Niveau maximum — cliquer pour réinitialiser' : `Passer au niveau ${character.niveau + 1}`}
            style={{
              marginBottom: 4, padding: '3px 12px', borderRadius: 4,
              border: '1px solid rgba(201,168,76,0.5)',
              background: 'transparent',
              color: 'rgba(245,236,215,0.85)',
              cursor: 'pointer',
              letterSpacing: '0.03em', fontSize: 14,
            }}
          >
            Niv. {character.niveau}{character.niveau >= 20 ? ' ★' : ' →'}
          </button>

          {/* Zoom */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 4 }}>
            <button onClick={() => setZoom(z => { const n = Math.max(30, z - 5); localStorage.setItem('tdr-zoom', String(n)); return n })}
              style={{ color: 'var(--tdr-gold)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>−</button>
            <span style={{ fontSize: 14, color: 'rgba(245,236,215,0.6)', minWidth: 36, textAlign: 'center' }}>{zoom}%</span>
            <button onClick={() => setZoom(z => { const n = Math.min(82, z + 5); localStorage.setItem('tdr-zoom', String(n)); return n })}
              style={{ color: 'var(--tdr-gold)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>+</button>
          </div>

          {/* Éditeur descriptions */}
          <button
            onClick={() => setShowDescEditor(d => !d)}
            style={{
              marginBottom: 4, padding: '3px 12px', borderRadius: 4,
              border: '1px solid rgba(201,168,76,0.4)',
              background: 'transparent',
              color: 'rgba(245,236,215,0.7)',
              cursor: 'pointer', letterSpacing: '0.04em', fontSize: 14,
            }}
          >
            ✎ Données du jeu
          </button>

          {/* Calibrage */}
          <button
            onClick={() => { setCalibrate(c => !c); setPinned(null); setLastMoved(null) }}
            style={{
              marginBottom: 4, padding: '3px 12px', borderRadius: 4,
              border: `1px solid ${calibrate ? 'var(--tdr-gold)' : 'rgba(201,168,76,0.4)'}`,
              background: calibrate ? 'rgba(201,168,76,0.2)' : 'transparent',
              color: calibrate ? 'var(--tdr-gold)' : 'rgba(245,236,215,0.7)',
              cursor: 'pointer', letterSpacing: '0.04em', fontSize: 14,
            }}
          >
            {calibrate ? '✕ Calibrage ON' : '⊹ Calibrage'}
          </button>
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
                calibrate={calibrate} onFieldMoved={(l, t, lf, w, h) => setLastMoved({ label: l, top: t, left: lf, width: w, height: h })} />
            ) : (
              <CharacterSheetVerso character={character} onChange={onChange} activeStep={step}
                calibrate={calibrate} onFieldMoved={(l, t, lf, w, h) => setLastMoved({ label: l, top: t, left: lf, width: w, height: h })} />
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
            Survol :{' '}
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
                  `top={${lastMoved.top}} left={${lastMoved.left}}` +
                  (lastMoved.width  !== undefined ? ` width={${lastMoved.width}}`   : '') +
                  (lastMoved.height !== undefined ? ` height={${lastMoved.height}}` : '')
                )}
                style={{
                  marginLeft: 8, padding: '1px 6px', fontSize: 10, borderRadius: 3,
                  border: '1px solid rgba(201,168,76,0.4)', background: 'transparent',
                  color: 'var(--tdr-gold)', cursor: 'pointer',
                }}
              >
                copier
              </button>
            </span>
          ) : (
            <span style={{ color: 'rgba(245,236,215,0.35)', fontSize: 11 }}>
              Glisser un tag doré pour déplacer le champ
            </span>
          )}
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
            ? `${ptsDisponibles} pt${ptsDisponibles > 1 ? 's' : ''} de capacité disponible${ptsDisponibles > 1 ? 's' : ''}`
            : `${Math.abs(ptsDisponibles)} pt${Math.abs(ptsDisponibles) > 1 ? 's' : ''} de capacité en trop`}
        </div>
      )}

      {/* === MONTÉE DE NIVEAU === */}
      {showLevelUp && (
        <LevelUpModal
          character={character}
          onConfirm={onChange}
          onClose={() => setShowLevelUp(false)}
        />
      )}

      {/* === ÉDITEUR DESCRIPTIONS === */}
      {showDescEditor && <DescriptionsEditor onClose={() => setShowDescEditor(false)} />}

      {/* === PANNEAU SAUVEGARDE === */}
      {showSave && (
        <SaveLoadPanel
          character={character}
          maxStep={maxStep}
          library={library}
          onLibraryChange={setLibrary}
          onLoad={(c, savedMaxStep) => {
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
          }}
          onNew={() => { setCharacter(defaultCharacter()); setStep(0); setMaxStep(0) }}
          onClose={() => setShowSave(false)}
        />
      )}

      {/* === WIZARD (droite, flexible) === */}
      <div className="no-print" style={{
        flex: 1, minWidth: 300,
        borderLeft: '1px solid rgba(201,168,76,0.2)',
        display: 'flex', flexDirection: 'column',
        background: 'rgba(20,16,10,0.98)',
      }}>
        <div style={{ padding: '16px', borderBottom: '1px solid rgba(201,168,76,0.15)', textAlign: 'center' }}>
          <div style={{ fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.5 }}>
            Terres d'Arran
          </div>
          <div style={{ fontSize: 18, fontFamily: "'Cinzel', serif", fontWeight: 700, color: 'var(--tdr-gold)', letterSpacing: '0.05em' }}>
            Création de personnage
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
    </GameDataProvider>
  )
}
