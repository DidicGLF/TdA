import React, { useState } from 'react'
import data from '../data/runesEtherees.json'
import Rune, { RUNES_DIVINES } from './Runes'
import type { Character } from '../types/character'
import { getMod } from '../types/character'

const GOLD   = 'var(--tdr-gold)'
const SILVER = 'rgba(200,200,220,0.9)'
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

const TILE_MINI: React.CSSProperties = {
  ...TILE,
  padding: '7px 5px',
  borderRadius: 5,
  width: 28,
  height: 36,
  boxSizing: 'border-box' as const,
  display: 'inline-block',
  verticalAlign: 'middle',
  boxShadow: '2px 3px 6px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.8), inset 0 -1px 2px rgba(0,0,0,0.15)',
}

function TileTooltip({ label, onClick, children }: { label: string; onClick?: () => void; children: React.ReactNode }) {
  const [show, setShow] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      style={{ position: 'relative', width: 64, flexShrink: 0, cursor: onClick ? 'pointer' : 'default' }}
    >
      {children}
      {show && (
        <div style={{
          position: 'absolute',
          bottom: 'calc(100% + 6px)',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(20,15,8,0.97)',
          color: '#e8dfc0',
          border: '1px solid #c9a84c',
          borderRadius: 4,
          padding: '4px 8px',
          fontSize: 13,
          whiteSpace: 'nowrap',
          zIndex: 100,
          pointerEvents: 'none',
          boxShadow: '0 2px 8px rgba(0,0,0,0.7)',
          fontWeight: 700,
          fontFamily: "'Cinzel', serif",
        }}>
          {label}
        </div>
      )}
    </div>
  )
}

function TileVide({ count = 1 }: { count?: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, verticalAlign: 'middle' }}>
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} style={TILE_MINI} />
      ))}
    </span>
  )
}

const allElements = data.groupes.flatMap(g =>
  g.elements.map(e => ({ ...e, effetElement: g.effetElement }))
)
const allAttributs = data.groupes.flatMap(g => g.attributs)


// TILE total: 48(svg) + 2×6(padding H) + 2×2(border) = 64 wide ; 60(svg) + 2×12(padding V) + 2×2(border) = 88 tall
function SlotVide({ color }: { color: string }) {
  return (
    <div style={{
      width: 64, height: 88,
      border: `2px dashed ${color}`,
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

export default function CharacterSheetRunes({ character, divin, onDivinChange }: Props) {
  const [element, setElement]       = useState<string | null>(null)
  const [attributs, setAttributs]   = useState<string[]>([])
  const [rangChoisi, setRangChoisi] = useState<1 | 3 | 5 | 7 | null>(null)

  const intMod = getMod(character.caracteristiques.INT.valeur)
  const sagMod = getMod(character.caracteristiques.SAG.valeur)
  const allVoies = [character.voiePeuple, character.voieCulturelle, character.voie1, character.voie2, character.voie3, character.voiePrestige, character.voieSangMele]
  const voieEtheree = allVoies.find(v => v.nom === 'Voie éthérée')
  const rangVoie = voieEtheree ? voieEtheree.rangs.filter(Boolean).length : 0

  const rangPrestige = character.voiePrestige.nom === 'Voie des runes divines'
    ? character.voiePrestige.rangs.filter(Boolean).length
    : 0
  const divineUnlocked = rangPrestige >= 1
  const maxAttributs = rangPrestige >= 5 ? 4 : 3
  const rangsDisponibles = (maxAttributs >= 4 ? [1, 3, 5, 7] : [1, 3, 5]) as (1 | 3 | 5 | 7)[]

  const elementData = element ? allElements.find(e => e.nom === element) : null
  const rang = attributs.length > 0 ? (attributs.length * 2 - 1 + (divin ? 1 : 0)) : null

  function handleElementClick(nom: string) {
    setElement(prev => prev === nom ? null : nom)
  }

  function handleAttributClick(nom: string) {
    setAttributs(prev => {
      if (prev.includes(nom)) return prev.filter(a => a !== nom)
      if (prev.length >= maxAttributs) return prev
      return [...prev, nom]
    })
  }


  function tirerAuSort() {
    if (!rangChoisi) return
    const count = rangChoisi === 1 ? 1 : rangChoisi === 3 ? 2 : rangChoisi === 5 ? 3 : 4
    const el = allElements[Math.floor(Math.random() * allElements.length)]
    const shuffled = [...allAttributs].sort(() => Math.random() - 0.5)
    setElement(el.nom)
    setAttributs(shuffled.slice(0, count).map(a => a.nom))
    if (divineUnlocked) {
      if (Math.random() > 0.5) {
        const keys = Object.keys(RUNES_DIVINES)
        onDivinChange(keys[Math.floor(Math.random() * keys.length)])
      } else {
        onDivinChange(null)
      }
    }
  }

  function effacer() {
    setElement(null)
    setAttributs([])
    onDivinChange(null)
  }

  const selectedAttrData = attributs.map(nom => allAttributs.find(a => a.nom === nom)!)

  return (
    <div style={{ padding: '16px 12px', color: 'rgba(245,236,215,0.9)' }}>

      {/* ── Règle de composition ── */}
      <div style={{
        marginBottom: 18,
        fontSize: 17,
        background: 'rgba(0,0,0,0.2)',
        border: BORDER,
        borderRadius: 8,
        padding: '12px 16px',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: maxAttributs >= 4
            ? 'auto auto auto auto auto auto auto auto 1fr'
            : 'auto auto auto auto auto auto 1fr',
          columnGap: 8,
          rowGap: 6,
          alignItems: 'center',
        }}>
          <span>
            <span style={{ fontFamily: "'Cinzel', serif", color: GOLD, fontWeight: 600 }}>Sort</span>
            {' = '}
            <TileVide count={1} />
            {' Glyphe '}
            <span style={{ color: GOLD }}>Élément</span>
            {' +'}
          </span>
          <div style={{ display: 'flex', justifyContent: 'center' }}><TileVide count={1} /></div>
          <span style={{ opacity: 0.5 }}>,</span>
          <div style={{ display: 'flex', justifyContent: 'center' }}><TileVide count={2} /></div>
          <span style={{ opacity: 0.6 }}>ou</span>
          <div style={{ display: 'flex', justifyContent: 'center' }}><TileVide count={3} /></div>
          {maxAttributs >= 4 ? (
            <>
              <span style={{ opacity: 0.6 }}>ou</span>
              <div style={{ display: 'flex', justifyContent: 'center' }}><TileVide count={4} /></div>
            </>
          ) : null}
          <span>glyphes <span style={{ color: SILVER }}>Attribut</span> différents</span>

          <span style={{ color: GOLD, opacity: 0.8, fontFamily: "'Cinzel', serif", fontWeight: 600 }}>Rang du sort :</span>
          <span style={{ textAlign: 'center', color: GOLD, fontWeight: 700 }}>1</span>
          <span />
          <span style={{ textAlign: 'center', color: GOLD, fontWeight: 700 }}>3</span>
          <span />
          <span style={{ textAlign: 'center', color: GOLD, fontWeight: 700 }}>5</span>
          {maxAttributs >= 4 ? (
            <>
              <span />
              <span style={{ textAlign: 'center', color: GOLD, fontWeight: 700 }}>7</span>
            </>
          ) : null}
          <span />
        </div>

        {divineUnlocked && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            marginTop: 8, paddingTop: 8,
            borderTop: '1px solid rgba(201,160,220,0.2)',
            fontSize: 15,
          }}>
            <span style={{ opacity: 0.7 }}>+</span>
            <TileVide count={1} />
            <span>Glyphe <span style={{ color: DIVINE, fontWeight: 600 }}>Divin</span> (optionnel)</span>
            <span style={{ color: DIVINE, fontWeight: 700, marginLeft: 8 }}>Rang +1</span>
          </div>
        )}
      </div>

      {/* ── Tableau principal 3 colonnes ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'auto repeat(3, 1fr)',
        border: BORDER,
        borderRadius: 8,
        overflow: 'hidden',
        marginBottom: 20,
      }}>

        {/* Coin vide en-tête */}
        <div style={{
          background: 'rgba(201,168,76,0.08)',
        }} />

        {/* En-têtes */}
        {data.groupes.map((g, i) => (
          <div key={g.niveau} style={{
            fontFamily: "'Cinzel', serif",
            fontSize: 14,
            letterSpacing: '0.1em',
            textTransform: 'uppercase' as const,
            color: GOLD,
            padding: '10px 14px',
            background: 'rgba(201,168,76,0.08)',
            borderBottom: BORDER,
            borderRight: i < 2 ? BORDER : undefined,
            textAlign: 'center' as const,
          }}>
            Glyphes de l'{g.niveau}
          </div>
        ))}

        {/* En-tête de ligne — Élément */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderLeft: BORDER,
          padding: '0 10px',
          writingMode: 'vertical-rl' as const,
          transform: 'rotate(180deg)',
          fontFamily: "'Cinzel', serif",
          fontSize: 14,
          letterSpacing: '0.12em',
          color: GOLD,
          background: 'rgba(201,168,76,0.08)',
        }}>
          Élément
        </div>

        {/* Ligne éléments */}
        {data.groupes.map((g, i) => (
          <div key={g.niveau} style={{
            display: 'flex',
            borderRight: i < 2 ? BORDER : undefined,
          }}>
            <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 10px' }}>
              {g.elements.map(e => {
                const selected = element === e.nom
                const disabled = !selected && element !== null
                return (
                  <div
                    key={e.nom}
                    onClick={() => !disabled && handleElementClick(e.nom)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1 }}
                  >
                    {selected
                      ? <SlotVide color="rgba(201,168,76,0.35)" />
                      : <div style={{ ...TILE, transition: 'box-shadow 0.15s' }}>
                          <Rune nom={e.nom} width={48} height={60} color="#7a3a00" />
                        </div>
                    }
                    <div style={{ opacity: selected ? 0.3 : 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: GOLD, fontFamily: "'Cinzel', serif" }}>{e.nom}</div>
                      <div style={{ fontSize: 13, opacity: 0.6, marginTop: 2 }}>{e.texte}</div>
                    </div>
                  </div>
                )
              })}
            </div>

            <div style={{
              flex: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '10px 12px',
              borderLeft: '1px solid rgba(201,168,76,0.2)',
              textAlign: 'center' as const,
            }}>
              <span style={{ color: GOLD, fontWeight: 700, fontSize: 15 }}>{parseDesc(g.effetElement, intMod, sagMod, rangVoie)}</span>
            </div>
          </div>
        ))}

        {/* Séparateur pleine largeur entre Élément et Attribut */}
        <div style={{ gridColumn: '1 / -1', borderTop: BORDER, margin: 0, padding: 0 }} />

        {/* En-tête de ligne — Attribut */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderLeft: BORDER,
          padding: '0 10px',
          writingMode: 'vertical-rl' as const,
          transform: 'rotate(180deg)',
          fontFamily: "'Cinzel', serif",
          fontSize: 14,
          letterSpacing: '0.12em',
          color: GOLD,
          background: 'rgba(201,168,76,0.08)',
        }}>
          Attribut
        </div>

        {/* Ligne attributs */}
        {data.groupes.map((g, i) => (
          <div key={g.niveau} style={{
            display: 'flex', flexDirection: 'column', gap: 8,
            padding: '10px 10px',
            borderRight: i < 2 ? BORDER : undefined,
          }}>
            {g.attributs.map(a => {
              const selected = attributs.includes(a.nom)
              const disabled = !selected && attributs.length >= maxAttributs
              return (
                <div
                  key={a.nom}
                  onClick={() => !disabled && handleAttributClick(a.nom)}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1 }}
                >
                  {selected
                    ? <SlotVide color="rgba(138,180,248,0.35)" />
                    : <div style={{ ...TILE, transition: 'box-shadow 0.15s' }}>
                        <Rune nom={a.nom} width={48} height={60} color="#1a2a5a" />
                      </div>
                  }
                  <div style={{ opacity: selected ? 0.3 : 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: SILVER, fontFamily: "'Cinzel', serif" }}>{a.nom}</div>
                    <div style={{ fontSize: 13, opacity: 0.7, marginTop: 2, lineHeight: 1.4 }}>{parseDesc(a.effet, intMod, sagMod, rangVoie)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* ── Barre de sort ── */}
      <div style={{
        background: 'rgba(0,0,0,0.25)',
        border: BORDER,
        borderRadius: 10,
        padding: '14px 16px',
        marginBottom: 28,
      }}>
        {/* En-tête barre */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginBottom: 12 }}>
          <span style={{ fontFamily: "'Cinzel', serif", fontSize: 14, color: GOLD, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Sort composé
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Sélecteur de rang */}
            <span style={{ fontSize: 13, opacity: 0.6, marginRight: 2 }}>Rang</span>
            {rangsDisponibles.map(r => (
              <button key={r} onClick={() => setRangChoisi(prev => prev === r ? null : r)} style={{
                background: rangChoisi === r ? 'rgba(201,168,76,0.35)' : 'rgba(201,168,76,0.08)',
                border: rangChoisi === r ? '1px solid #ffd700' : BORDER,
                borderRadius: 6,
                color: rangChoisi === r ? '#ffd700' : GOLD,
                fontFamily: "'Cinzel', serif",
                fontSize: 13,
                fontWeight: rangChoisi === r ? 700 : 400,
                padding: '3px 10px',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}>
                {r}
              </button>
            ))}
            <div style={{ width: 1, height: 20, background: 'rgba(201,168,76,0.25)', margin: '0 4px' }} />
            <button onClick={tirerAuSort} disabled={!rangChoisi} style={{
              background: rangChoisi ? 'rgba(201,168,76,0.15)' : 'rgba(201,168,76,0.05)',
              border: BORDER, borderRadius: 6,
              color: rangChoisi ? GOLD : 'rgba(201,168,76,0.3)',
              fontFamily: "'Cinzel', serif", fontSize: 12, padding: '4px 12px',
              cursor: rangChoisi ? 'pointer' : 'not-allowed', letterSpacing: '0.08em',
              transition: 'all 0.15s',
            }}>
              Tirage chaotique
            </button>
            <button onClick={effacer} style={{
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6,
              color: 'rgba(245,236,215,0.5)', fontSize: 12, padding: '4px 12px',
              cursor: 'pointer',
            }}>
              Effacer
            </button>
          </div>
        </div>

        {/* Slots */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>

          {/* Slot élément */}
          {element ? (
            <TileTooltip label={element} onClick={() => setElement(null)}>
              <div style={{
                ...TILE,
                border: '2px solid #ffd700',
                boxShadow: '0 0 14px rgba(255,215,0,0.6), 3px 5px 10px rgba(0,0,0,0.55), inset 0 1px 2px rgba(255,255,255,0.8)',
              }}>
                <Rune nom={element} width={48} height={60} color="#a04800" />
              </div>
            </TileTooltip>
          ) : (
            <SlotVide color="rgba(201,168,76,0.35)" />
          )}

          <span style={{ fontSize: 20, opacity: 0.4 }}>+</span>

          {/* Slots attributs */}
          {Array.from({ length: maxAttributs }, (_, i) => {
            const nom = attributs[i]
            return nom ? (
              <TileTooltip key={i} label={nom} onClick={() => handleAttributClick(nom)}>
                <div style={{
                  ...TILE,
                  border: '2px solid #8ab4f8',
                  boxShadow: '0 0 14px rgba(100,160,255,0.55), 3px 5px 10px rgba(0,0,0,0.55), inset 0 1px 2px rgba(255,255,255,0.8)',
                }}>
                  <Rune nom={nom} width={48} height={60} color="#2a4aaa" />
                </div>
              </TileTooltip>
            ) : (
              <SlotVide key={i} color="rgba(180,180,220,0.25)" />
            )
          })}

          {/* Slot divin (optionnel, si voie des runes divines déverrouillée) */}
          {divineUnlocked && (
            <>
              <span style={{ fontSize: 15, opacity: 0.5 }}>+</span>
              {divin ? (() => {
                const C = RUNES_DIVINES[divin]
                return (
                  <TileTooltip label={divin} onClick={() => onDivinChange(null)}>
                    <div style={{
                      ...TILE,
                      border: '2px solid #c9a0dc',
                      boxShadow: '0 0 14px rgba(201,160,220,0.6), 3px 5px 10px rgba(0,0,0,0.55), inset 0 1px 2px rgba(255,255,255,0.8)',
                    }}>
                      {C && <C width={48} height={60} color="#4a1060" />}
                    </div>
                  </TileTooltip>
                )
              })() : (
                <SlotVide color="rgba(201,160,220,0.25)" />
              )}
            </>
          )}

          {/* Résultat */}
          {rang !== null && elementData && (
            <>
              <span style={{ fontSize: 20, opacity: 0.4 }}>=</span>
              <div style={{
                flex: 1, minWidth: 180,
                background: 'rgba(0,0,0,0.2)', border: BORDER, borderRadius: 8,
                padding: '10px 14px',
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
                  <span style={{ fontFamily: "'Cinzel', serif", color: GOLD, fontSize: 20, fontWeight: 700 }}>
                    Rang {rang}
                  </span>
                  <span style={{ color: GOLD, opacity: 0.8, fontSize: 16 }}>{parseDesc(elementData.effetElement, intMod, sagMod, rangVoie)}</span>
                </div>
                <div style={{ fontSize: 15, opacity: 0.75, marginBottom: 4 }}>
                  <span style={{ color: GOLD }}>Élément — </span>{elementData.texte}
                </div>
                {selectedAttrData.map(a => (
                  <div key={a.nom} style={{ fontSize: 15, opacity: 0.75, marginTop: 4 }}>
                    <span style={{ color: SILVER }}>{a.nom} — </span>{parseDesc(a.effet, intMod, sagMod, rangVoie)}
                  </div>
                ))}
                {divin && (() => {
                  const d = data.divines.find(x => x.nom === divin)
                  return d ? (
                    <div style={{ fontSize: 15, opacity: 0.75, marginTop: 4 }}>
                      <span style={{ color: DIVINE }}>{d.nom} — </span>{parseDesc(d.effet, intMod, sagMod, rangVoie)}
                    </div>
                  ) : null
                })()}
              </div>
            </>
          )}
        </div>
      </div>

    </div>
  )
}
