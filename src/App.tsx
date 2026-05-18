import { useState, useRef, useEffect } from 'react'
import type { Character } from './types/character'
import { defaultCharacter } from './types/character'
import CharacterSheetRecto from './components/CharacterSheetRecto'
import CharacterSheetVerso from './components/CharacterSheetVerso'
import CreationWizard from './components/CreationWizard'
import SaveLoadPanel from './components/SaveLoadPanel'

export default function App() {
  const [character, setCharacter] = useState<Character>(defaultCharacter())
  const [step, setStep] = useState(0)
  const [sheetPage, setSheetPage] = useState<'recto' | 'verso'>('recto')
  const [zoom, setZoom] = useState(100)
  const [calibrate, setCalibrate] = useState(false)
  const [showSave, setShowSave] = useState(false)
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null)
  const [pinned, setPinned] = useState<{ x: number; y: number } | null>(null)
  const [lastMoved, setLastMoved] = useState<{ label: string; top: number; left: number; width?: number; height?: number } | null>(null)
  const sheetRef = useRef<HTMLDivElement>(null)

  const onChange = (patch: Partial<Character>) =>
    setCharacter(prev => ({ ...prev, ...patch }))

  useEffect(() => {
    setSheetPage(step >= 5 ? 'verso' : 'recto')
  }, [step])

  const getCoords = (e: React.MouseEvent) => {
    const rect = sheetRef.current!.getBoundingClientRect()
    return {
      x: +((e.clientX - rect.left) / rect.width  * 100).toFixed(1),
      y: +((e.clientY - rect.top)  / rect.height * 100).toFixed(1),
    }
  }

  return (
    <div className="app-root" style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--tdr-dark)' }}>

      {/* === CONTENEUR IMPRESSION (hors flux, caché à l'écran, visible à l'impression) === */}
      <div className="print-only">
        <div className="print-page-recto">
          <CharacterSheetRecto character={character} onChange={() => {}} activeStep={-1} />
        </div>
        <div className="print-page-verso">
          <CharacterSheetVerso character={character} onChange={() => {}} activeStep={-1} />
        </div>
      </div>

      {/* === FEUILLE (gauche, scrollable) === */}
      <div className="no-print" style={{ flex: 1, overflowY: 'auto', background: '#111' }}>

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
              cursor: 'pointer', fontSize: 13,
              fontFamily: "'Cinzel', serif", letterSpacing: '0.05em',
            }}>
              {p === 'recto' ? 'Page 1' : 'Page 2'}
            </button>
          ))}

          <div style={{ flex: 1 }} />

          {/* Imprimer */}
          <button
            onClick={() => { document.body.removeAttribute('data-print'); window.print() }}
            style={{
              marginBottom: 4, padding: '3px 12px', borderRadius: 4, fontSize: 12,
              border: '1px solid rgba(201,168,76,0.3)',
              background: 'transparent',
              color: 'rgba(245,236,215,0.65)',
              cursor: 'pointer', letterSpacing: '0.03em',
            }}
          >
            Imprimer
          </button>

          {/* Sauvegarde */}
          <button
            onClick={() => setShowSave(true)}
            style={{
              marginBottom: 4, padding: '3px 12px', borderRadius: 4, fontSize: 12,
              border: '1px solid rgba(201,168,76,0.4)',
              background: 'transparent',
              color: 'rgba(245,236,215,0.7)',
              cursor: 'pointer', letterSpacing: '0.04em',
            }}
          >
            Personnages
          </button>

          {/* Zoom */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 4 }}>
            <button onClick={() => setZoom(z => Math.max(50, z - 10))}
              style={{ color: 'var(--tdr-gold)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>−</button>
            <span style={{ fontSize: 12, color: 'rgba(245,236,215,0.6)', minWidth: 36, textAlign: 'center' }}>{zoom}%</span>
            <button onClick={() => setZoom(z => Math.min(200, z + 10))}
              style={{ color: 'var(--tdr-gold)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>+</button>
          </div>

          {/* Calibrage */}
          <button
            onClick={() => { setCalibrate(c => !c); setPinned(null); setLastMoved(null) }}
            style={{
              marginBottom: 4, padding: '3px 10px', borderRadius: 4, fontSize: 11,
              border: `1px solid ${calibrate ? 'var(--tdr-gold)' : 'rgba(201,168,76,0.3)'}`,
              background: calibrate ? 'rgba(201,168,76,0.2)' : 'transparent',
              color: calibrate ? 'var(--tdr-gold)' : 'rgba(245,236,215,0.4)',
              cursor: 'pointer', letterSpacing: '0.05em',
            }}
          >
            {calibrate ? '✕ Calibrage ON' : '⊹ Calibrage'}
          </button>
        </div>

        {/* Feuille + overlay calibrage */}
        <div style={{ padding: '0 8px 16px' }}>
          <div
            ref={sheetRef}
            style={{ width: `${zoom}%`, minWidth: 320, cursor: calibrate ? 'crosshair' : 'auto', position: 'relative' }}
            onMouseMove={calibrate ? e => setHover(getCoords(e)) : undefined}
            onMouseLeave={calibrate ? () => setHover(null) : undefined}
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

      {/* === PANNEAU SAUVEGARDE === */}
      {showSave && (
        <SaveLoadPanel
          character={character}
          onLoad={c => { setCharacter(c); setStep(0) }}
          onNew={() => { setCharacter(defaultCharacter()); setStep(0) }}
          onClose={() => setShowSave(false)}
        />
      )}

      {/* === WIZARD (droite, fixe) === */}
      <div className="no-print" style={{
        width: 360, minWidth: 320,
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
            step={step} character={character} onChange={onChange}
            onNext={() => setStep(s => Math.min(s + 1, 6))}
            onPrev={() => setStep(s => Math.max(s - 1, 0))}
          />
        </div>
      </div>
    </div>
  )
}
