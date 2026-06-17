import React from 'react'
import data from '../data/runesEtherees.json'
import { RUNES_DIVINES } from './Runes'
import type { Character } from '../types/character'
import { getMod } from '../types/character'

const GOLD   = 'var(--tdr-gold)'
const DIVINE = '#c9a0dc'
const BORDER = '1px solid rgba(201,168,76,0.3)'

const TILE: React.CSSProperties = {
  background: 'linear-gradient(160deg, #f5e8c0 60%, #e2d090)',
  border: '2px solid #b09040',
  borderRadius: 6,
  boxShadow: '3px 5px 10px rgba(0,0,0,0.55), inset 0 1px 2px rgba(255,255,255,0.8), inset 0 -2px 4px rgba(0,0,0,0.15)',
  padding: '12px 6px',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

function SlotVide() {
  return (
    <div style={{
      width: 64, height: 88,
      border: '2px dashed rgba(201,160,220,0.4)',
      borderRadius: 6,
      background: 'rgba(0,0,0,0.15)',
      flexShrink: 0,
      boxSizing: 'border-box' as const,
    }} />
  )
}

function parseDesc(text: string, intMod: number, sagMod: number, rang: number): React.ReactNode {
  const fmt = (n: number) => n >= 0 ? `+${n}` : String(n)
  const badge = (v: string | number) => (
    <span style={{ color: '#ffd700', fontWeight: 700, fontSize: '0.88em', marginLeft: 2 }}>({v})</span>
  )
  type Chunk = string | React.ReactNode
  let chunks: Chunk[] = [text]
  const expand = (re: RegExp, render: () => React.ReactNode) => {
    const next: Chunk[] = []
    for (const chunk of chunks) {
      if (typeof chunk !== 'string') { next.push(chunk); continue }
      const parts = chunk.split(re)
      parts.forEach((part, i) => {
        if (part) next.push(part)
        if (i < parts.length - 1) next.push(render())
      })
    }
    chunks = next
  }
  expand(/\[1 tour \+ Mod\. de SAG\]/, () => <>[1 tour + Mod. de SAG]{badge(Math.max(1, 1 + sagMod))}</>)
  expand(/\[5 \+ Mod\. de SAG\]/,      () => <>[5 + Mod. de SAG]{badge(5 + sagMod)}</>)
  expand(/\[rang \/ 2\]/,              () => <>[rang / 2]{badge(Math.floor(rang / 2))}</>)
  expand(/\[rang\]/,                   () => <>[rang]{badge(rang)}</>)
  expand(/Mod\.INT/,                   () => <>Mod.INT{badge(fmt(intMod))}</>)
  expand(/Mod\. de SAG/,              () => <>Mod. de SAG{badge(fmt(sagMod))}</>)
  return <>{chunks.map((c, i) => <React.Fragment key={i}>{c}</React.Fragment>)}</>
}

interface Props {
  character: Character
  divin: string | null
  onDivinChange: (nom: string | null) => void
}

export default function CharacterSheetRunesDivines({ character, divin, onDivinChange }: Props) {
  const intMod = getMod(character.caracteristiques.INT.valeur)
  const sagMod = getMod(character.caracteristiques.SAG.valeur)
  const allVoies = [character.voiePeuple, character.voieCulturelle, character.voie1,
    character.voie2, character.voie3, character.voiePrestige, character.voieSangMele]
  const voieEtheree = allVoies.find(v => v.nom === 'Voie éthérée')
  const rangVoie = voieEtheree ? voieEtheree.rangs.filter(Boolean).length : 0

  const rangPrestige = character.voiePrestige.nom === 'Voie des runes divines'
    ? character.voiePrestige.rangs.filter(Boolean).length
    : 0
  const divineUnlocked = rangPrestige >= 1

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'rgba(20,16,10,0.98)', color: 'rgba(245,236,215,0.9)',
    }}>

      {/* En-tête panneau */}
      <div style={{
        padding: '16px',
        borderBottom: '1px solid rgba(201,168,76,0.15)',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.5 }}>
          Voie des runes divines
        </div>
        <div style={{
          fontSize: 18, fontFamily: "'Cinzel', serif", fontWeight: 700,
          color: DIVINE, letterSpacing: '0.05em',
        }}>
          Runes divines
        </div>
      </div>

      {/* Contenu scrollable */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 12px' }}>

        {!divineUnlocked && (
          <div style={{
            fontSize: 13, opacity: 0.5, fontStyle: 'italic',
            textAlign: 'center', padding: '12px 0 16px',
            borderBottom: '1px solid rgba(201,160,220,0.15)',
            marginBottom: 16,
          }}>
            Requiert la Voie des runes divines (voie de prestige)
          </div>
        )}

        {divineUnlocked && (
          <div style={{
            fontSize: 13, opacity: 0.65, marginBottom: 16,
            padding: '8px 12px',
            background: 'rgba(80,40,100,0.15)',
            border: '1px solid rgba(201,160,220,0.2)',
            borderRadius: 6,
          }}>
            Cliquez une rune pour l'ajouter à votre sort. Cliquez à nouveau pour la retirer.
          </div>
        )}

        {/* Tableau des runes divines */}
        <div style={{
          border: BORDER,
          borderRadius: 8,
          overflow: 'hidden',
        }}>

          {/* En-tête tableau */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            background: 'rgba(80,40,100,0.2)',
            borderBottom: '1px solid rgba(201,160,220,0.3)',
          }}>
            <div style={{
              padding: '10px 14px',
              fontFamily: "'Cinzel', serif",
              fontSize: 13,
              letterSpacing: '0.1em',
              textTransform: 'uppercase' as const,
              color: DIVINE,
              borderRight: '1px solid rgba(201,160,220,0.2)',
            }}>
              Glyphe
            </div>
            <div style={{
              padding: '10px 14px',
              fontFamily: "'Cinzel', serif",
              fontSize: 13,
              letterSpacing: '0.1em',
              textTransform: 'uppercase' as const,
              color: DIVINE,
            }}>
              Effet
            </div>
          </div>

          {/* Lignes des runes */}
          {data.divines.map((d, i) => {
            const C = RUNES_DIVINES[d.nom]
            const selected = divin === d.nom
            const isLast = i === data.divines.length - 1

            return (
              <div
                key={d.nom}
                onClick={divineUnlocked ? () => onDivinChange(selected ? null : d.nom) : undefined}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr',
                  borderBottom: isLast ? 'none' : '1px solid rgba(201,160,220,0.15)',
                  background: selected
                    ? 'rgba(80,40,100,0.4)'
                    : 'rgba(80,40,100,0.08)',
                  cursor: divineUnlocked ? 'pointer' : 'default',
                  opacity: divineUnlocked ? 1 : 0.55,
                  transition: 'background 0.15s',
                }}
              >
                {/* Cellule glyphe */}
                <div style={{
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  gap: 6,
                  padding: '12px 14px',
                  borderRight: '1px solid rgba(201,160,220,0.15)',
                  minWidth: 90,
                }}>
                  {selected
                    ? <SlotVide />
                    : C && (
                      <div style={{
                        ...TILE,
                        border: selected ? '2px solid #c9a0dc' : '2px solid #b09040',
                        boxShadow: selected
                          ? '0 0 14px rgba(201,160,220,0.6), 3px 5px 10px rgba(0,0,0,0.55), inset 0 1px 2px rgba(255,255,255,0.8)'
                          : TILE.boxShadow,
                      }}>
                        <C width={48} height={60} color="#4a1060" />
                      </div>
                    )
                  }
                  <span style={{
                    fontSize: 13, fontWeight: 700, color: DIVINE,
                    fontFamily: "'Cinzel', serif", textAlign: 'center',
                  }}>
                    {d.nom}
                  </span>
                  <span style={{ fontSize: 10, opacity: 0.45, letterSpacing: '0.12em' }}>
                    {d.code}
                  </span>
                </div>

                {/* Cellule effet */}
                <div style={{
                  padding: '12px 14px',
                  display: 'flex', alignItems: 'center',
                  fontSize: 13, lineHeight: 1.55, opacity: 0.85,
                }}>
                  {parseDesc(d.effet, intMod, sagMod, rangVoie)}
                </div>
              </div>
            )
          })}
        </div>

        {/* Indicateur de sélection */}
        {divin && (
          <div style={{
            marginTop: 16,
            padding: '10px 14px',
            background: 'rgba(80,40,100,0.3)',
            border: '1px solid rgba(201,160,220,0.5)',
            borderRadius: 8,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            {(() => {
              const C = RUNES_DIVINES[divin]
              return C ? (
                <div style={{
                  ...TILE,
                  border: '2px solid #c9a0dc',
                  boxShadow: '0 0 10px rgba(201,160,220,0.5), 3px 5px 10px rgba(0,0,0,0.55)',
                }}>
                  <C width={48} height={60} color="#4a1060" />
                </div>
              ) : null
            })()}
            <div>
              <div style={{ fontSize: 12, opacity: 0.55, marginBottom: 2 }}>Rune divine sélectionnée</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: DIVINE, fontFamily: "'Cinzel', serif" }}>
                {divin}
              </div>
              <button
                onClick={() => onDivinChange(null)}
                style={{
                  marginTop: 6, padding: '2px 10px', fontSize: 11,
                  background: 'transparent', border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: 4, color: 'rgba(245,236,215,0.5)', cursor: 'pointer',
                }}
              >
                Retirer
              </button>
            </div>
          </div>
        )}

        {/* Note rang prestige */}
        {rangPrestige > 0 && (
          <div style={{
            marginTop: 16,
            padding: '8px 12px',
            background: 'rgba(0,0,0,0.2)',
            border: BORDER,
            borderRadius: 6,
            fontSize: 12, opacity: 0.6,
          }}>
            <span style={{ color: GOLD }}>Voie des runes divines</span>
            {' — '}Rang {rangPrestige}
            {rangPrestige >= 5 && ' · Maître runiste (4 attributs, sorts rang 7)'}
            {rangPrestige >= 3 && rangPrestige < 5 && ' · Expert runiste (sorts rang 6)'}
          </div>
        )}
      </div>
    </div>
  )
}
