import { useRef, useState } from 'react'
import type { Character } from '../types/character'
import DraggableField from './DraggableField'
import DraggableTextarea from './DraggableTextarea'

interface Props {
  character: Character
  onChange: (patch: Partial<Character>) => void
  activeStep: number
  calibrate?: boolean
  onFieldMoved?: (label: string, top: number, left: number, width?: number, height?: number) => void
}

const FORMATION_CHECKBOXES: { nom: string; top: number; left: number }[] = [
  { nom: 'Armures légères',         top: 50.0, left: 54.2 },
  { nom: 'Armures lourdes',         top: 51.3, left: 54.2 },
  { nom: 'Armes de jet',            top: 52.7, left: 54.2 },
  { nom: 'Armes de trait',          top: 54.0, left: 54.2 },
  { nom: 'Armes de tir',            top: 55.3, left: 54.2 },
  { nom: 'Armes de guerre',         top: 51.3, left: 66.6 },
  { nom: 'Armes de guerre lourdes', top: 52.6, left: 66.8 },
  { nom: 'Armes de duel',           top: 54.0, left: 66.6 },
  { nom: "Armes d'hast",            top: 55.3, left: 66.7 },
]

export default function CharacterSheetVerso({ character, onChange, activeStep, calibrate = false, onFieldMoved }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cb = onFieldMoved ?? (() => {})
  const [cbPos, setCbPos] = useState<Record<string, { top: number; left: number }>>(
    Object.fromEntries(FORMATION_CHECKBOXES.map(f => [f.nom, { top: f.top, left: f.left }]))
  )

  const toggleFormation = (nom: string) => {
    if (calibrate) return
    const current = character.formationsMartiales
    onChange({ formationsMartiales: current.includes(nom) ? current.filter(f => f !== nom) : [...current, nom] })
  }

  const startCheckboxDrag = (nom: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startY = e.clientY
    const { top: startTop, left: startLeft } = cbPos[nom]

    const onMove = (ev: MouseEvent) => {
      const rect = containerRef.current!.getBoundingClientRect()
      setCbPos(prev => ({
        ...prev,
        [nom]: {
          top:  +(startTop  + (ev.clientY - startY) / rect.height * 100).toFixed(1),
          left: +(startLeft + (ev.clientX - startX) / rect.width  * 100).toFixed(1),
        },
      }))
    }

    const onUp = (ev: MouseEvent) => {
      const rect = containerRef.current!.getBoundingClientRect()
      const newTop  = +(startTop  + (ev.clientY - startY) / rect.height * 100).toFixed(1)
      const newLeft = +(startLeft + (ev.clientX - startX) / rect.width  * 100).toFixed(1)
      setCbPos(prev => ({ ...prev, [nom]: { top: newTop, left: newLeft } }))
      cb(nom, newTop, newLeft)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <img src="/feuille-verso.png" alt="Feuille de personnage verso"
        style={{ width: '100%', display: 'block' }} draggable={false} />

      {/* === DESCRIPTION === */}
      <DraggableTextarea
        top={17.7} left={73.2} width={44.2} height={14.7}
        value={character.description}
        onChange={v => onChange({ description: v })}
        calibrate={calibrate} label="Description"
        containerRef={containerRef} onMoved={cb}
      />

      {/* === INVENTAIRE === */}
      <DraggableTextarea
        top={36.7} left={73.2} width={44.4} height={17.5}
        value={character.inventaire}
        onChange={v => onChange({ inventaire: v })}
        calibrate={calibrate} label="Inventaire"
        containerRef={containerRef} onMoved={cb}
      />

      {/* === FORMATIONS MARTIALES === */}
      {FORMATION_CHECKBOXES.map(({ nom }) => {
        const { top, left } = cbPos[nom]
        return (
          <div key={nom}>
            {/* Case à cocher */}
            <div
              onClick={() => toggleFormation(nom)}
              style={{
                position: 'absolute',
                top: `${top}%`, left: `${left}%`,
                width: '1.6%', height: '1.1%',
                transform: 'translate(-50%, -50%)',
                cursor: calibrate ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {character.formationsMartiales.includes(nom) && (
                <svg viewBox="0 0 14 11" style={{ width: '100%', height: '100%' }} overflow="visible">
                  <polyline points="1,5.5 5,9.5 13,1" fill="none" stroke="#c9a84c"
                    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            {/* Tag draggable en mode calibrage */}
            {calibrate && (
              <div
                onMouseDown={e => startCheckboxDrag(nom, e)}
                style={{
                  position: 'absolute',
                  top: `${top}%`, left: `${left}%`,
                  transform: 'translate(-50%, -50%)',
                  cursor: 'grab',
                  background: 'rgba(201,168,76,0.92)',
                  color: '#1a1510',
                  fontSize: 7,
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  padding: '1px 4px',
                  borderRadius: 2,
                  userSelect: 'none',
                  zIndex: 40,
                  whiteSpace: 'nowrap',
                  lineHeight: '13px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
                }}
              >
                {nom.replace('Armes de ', '').replace('Armures ', '')}
              </div>
            )}
          </div>
        )
      })}

      {/* === TALENT MAGIQUE === */}
      <DraggableField
        top={63.9} left={73} width={44.4} height={2.0}
        value={character.talentMagique} onChange={v => onChange({ talentMagique: v })}
        calibrate={calibrate} label="Talent magique"
        containerRef={containerRef} onMoved={cb}
        active={activeStep === 5}
      />

      {/* === VOIE DE PRESTIGE === */}
      <DraggableField
        top={70} left={25.9} width={16.4} height={2.0}
        value={character.voiePrestige.nom}
        onChange={v => onChange({ voiePrestige: { ...character.voiePrestige, nom: v } })}
        calibrate={calibrate} label="Voie prestige"
        containerRef={containerRef} onMoved={cb}
      />

      {/* === VOIE DE SANG-MÊLÉ === */}
      <DraggableField
        top={78.8} left={57.6} width={14} height={2.0}
        value={character.voieSangMele.nom}
        onChange={v => onChange({ voieSangMele: { ...character.voieSangMele, nom: v } })}
        calibrate={calibrate} label="Voie sang-mêlé"
        containerRef={containerRef} onMoved={cb}
      />

      {/* === TRÉSORERIE === */}
      <DraggableField
        top={72.2} left={49.9} width={29.2} height={2.0}
        value={character.tresorerie} onChange={v => onChange({ tresorerie: v })}
        calibrate={calibrate} label="Trésorerie"
        containerRef={containerRef} onMoved={cb}
        active={activeStep === 6}
      />

      {/* === CAPACITÉS SUPPLÉMENTAIRES === */}
      <DraggableTextarea
        top={82} left={80.7} width={29.1} height={21.1}
        value={character.capacitesSupplementaires}
        onChange={v => onChange({ capacitesSupplementaires: v })}
        calibrate={calibrate} label="Capacités supp."
        containerRef={containerRef} onMoved={cb}
      />
    </div>
  )
}
