import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Rune from './Runes'
import type { Character } from '../types/character'
import { getMod } from '../types/character'

const GOLD   = 'var(--tdr-gold)'
const SILVER = 'rgba(200,200,220,0.9)'
const DIVINE = '#c9a0dc'
const BORDER = '1px solid rgba(201,168,76,0.3)'
const BORDER_D = '1px solid rgba(201,160,220,0.25)'

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
          position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(20,15,8,0.97)', color: '#e8dfc0', border: '1px solid #c9a84c',
          borderRadius: 4, padding: '4px 8px', fontSize: 13, whiteSpace: 'nowrap',
          zIndex: 100, pointerEvents: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.7)',
          fontWeight: 700, fontFamily: "'Cinzel', serif",
        }}>{label}</div>
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

interface RunesElement { nom: string; label: string; glyphe: string; texte: string }
interface RunesAttribut { nom: string; label: string; glyphe: string; effet: string }
interface RunesGroupe { niveau: string; effetElement: string; elements: RunesElement[]; attributs: RunesAttribut[] }
interface RunesDivine { nom: string; label: string; code: string; effet: string }
interface RunesData { groupes: RunesGroupe[]; divines: RunesDivine[] }

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

export default function CharacterSheetRunesFull({ character, divin, onDivinChange }: Props) {
  const { t } = useTranslation()
  const data = t('runesData', { returnObjects: true }) as RunesData
  const allElements = data.groupes.flatMap(g => g.elements.map(e => ({ ...e, effetElement: g.effetElement })))
  const allAttributs = data.groupes.flatMap(g => g.attributs)
  const [element, setElement]     = useState<string | null>(null)
  const [attributs, setAttributs] = useState<string[]>([])
  const [rangChoisi, setRangChoisi] = useState<1 | 3 | 5 | 7 | null>(null)

  const intMod = getMod(character.caracteristiques.INT.valeur)
  const sagMod = getMod(character.caracteristiques.SAG.valeur)
  const allVoies = [character.voiePeuple, character.voieCulturelle, character.voie1,
    character.voie2, character.voie3, character.voiePrestige, character.voieSangMele]
  const voieEtheree = allVoies.find(v => v.nom === 'Voie éthérée')
  const rangVoie = voieEtheree ? voieEtheree.rangs.filter(Boolean).length : 0

  const rangPrestige = character.voiePrestige.nom === 'Voie des runes divines'
    ? character.voiePrestige.rangs.filter(Boolean).length
    : 0
  const maxAttributs = rangPrestige >= 5 ? 4 : 3
  const rangsDisponibles = (maxAttributs >= 4 ? [1, 3, 5, 7] : [1, 3, 5]) as (1 | 3 | 5 | 7)[]

  const elementData = element ? allElements.find(e => e.nom === element) : null
  const rang = attributs.length > 0 ? (attributs.length * 2 - 1 + (divin ? 1 : 0)) : null
  const selectedAttrData = attributs.map(nom => allAttributs.find(a => a.nom === nom)!)

  function handleElementClick(nom: string) { setElement(prev => prev === nom ? null : nom) }
  function handleAttributClick(nom: string) {
    setAttributs(prev => {
      if (prev.includes(nom)) return prev.filter(a => a !== nom)
      if (prev.length >= maxAttributs) return prev
      return [...prev, nom]
    })
  }
  function handleDivinClick(nom: string) { onDivinChange(divin === nom ? null : nom) }
  function tirerAuSort() {
    if (!rangChoisi) return
    const count = rangChoisi === 1 ? 1 : rangChoisi === 3 ? 2 : rangChoisi === 5 ? 3 : 4
    const el = allElements[Math.floor(Math.random() * allElements.length)]
    const shuffled = [...allAttributs].sort(() => Math.random() - 0.5)
    setElement(el.nom)
    setAttributs(shuffled.slice(0, count).map(a => a.nom))
    if (Math.random() > 0.5) {
      const keys = data.divines.map(d => d.nom)
      onDivinChange(keys[Math.floor(Math.random() * keys.length)])
    } else {
      onDivinChange(null)
    }
  }
  function effacer() { setElement(null); setAttributs([]); onDivinChange(null) }

  const headerCell: React.CSSProperties = {
    fontFamily: "'Cinzel', serif",
    fontSize: 14,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: GOLD,
    padding: '10px 14px',
    background: 'rgba(201,168,76,0.08)',
    borderBottom: BORDER,
    textAlign: 'center',
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      color: 'rgba(245,236,215,0.9)', overflowY: 'auto',
    }}>

      {/* ── Règle de composition ── */}
      <div style={{
        flexShrink: 0,
        fontSize: 15,
        background: 'rgba(0,0,0,0.2)',
        borderBottom: BORDER,
        padding: '10px 24px',
        display: 'flex',
        justifyContent: 'center',
      }}>
        {/* inline-grid : aligne les rangs sous les tuiles, centré sur la largeur du panneau */}
        <div style={{
          display: 'inline-grid',
          gridTemplateColumns: maxAttributs >= 4
            ? 'auto auto auto auto auto auto auto auto auto auto auto auto auto'
            : 'auto auto auto auto auto auto auto auto auto auto auto',
          columnGap: 8, rowGap: 5, alignItems: 'center',
        }}>
          {/* Ligne 1 : formule */}
          <span>
            <span style={{ fontFamily: "'Cinzel', serif", color: GOLD, fontWeight: 600 }}>{t('runes.sort')}</span>
            {' = '}
            <TileVide count={1} />
            {' '}{t('runes.glyphe')}{' '}
            <span style={{ color: GOLD }}>{t('runes.element')}</span>
            {' +'}
          </span>
          <div style={{ display: 'flex', justifyContent: 'center' }}><TileVide count={1} /></div>
          <span style={{ opacity: 0.5 }}>,</span>
          <div style={{ display: 'flex', justifyContent: 'center' }}><TileVide count={2} /></div>
          <span style={{ opacity: 0.6 }}>{t('runes.ou')}</span>
          <div style={{ display: 'flex', justifyContent: 'center' }}><TileVide count={3} /></div>
          {maxAttributs >= 4 && (
            <>
              <span style={{ opacity: 0.6 }}>{t('runes.ou')}</span>
              <div style={{ display: 'flex', justifyContent: 'center' }}><TileVide count={4} /></div>
            </>
          )}
          <span>{t('runes.glyphes')} <span style={{ color: SILVER }}>{t('runes.attribut')}</span> {t('runes.differents')}</span>
          <span style={{ opacity: 0.4 }}>+</span>
          <div style={{ display: 'flex', justifyContent: 'center' }}><TileVide count={1} /></div>
          <span>{t('runes.glyphe')} <span style={{ color: DIVINE, fontWeight: 600 }}>{t('runes.divin')}</span> (optionnel)</span>
          <span style={{ color: DIVINE, fontWeight: 700 }}>{t('runes.rangPlusUn')}</span>

          {/* Ligne 2 : rangs alignés sous les tuiles */}
          <span style={{ color: GOLD, opacity: 0.8, fontFamily: "'Cinzel', serif", fontWeight: 600, fontSize: 13 }}>
            {t('runes.rangDuSort')}
          </span>
          <span style={{ textAlign: 'center', color: GOLD, fontWeight: 700 }}>1</span>
          <span />
          <span style={{ textAlign: 'center', color: GOLD, fontWeight: 700 }}>3</span>
          <span />
          <span style={{ textAlign: 'center', color: GOLD, fontWeight: 700 }}>5</span>
          {maxAttributs >= 4 && (
            <>
              <span />
              <span style={{ textAlign: 'center', color: GOLD, fontWeight: 700 }}>7</span>
            </>
          )}
          <span /><span /><span /><span />
          <span style={{ color: DIVINE, fontWeight: 600, fontSize: 13 }}>{t('runes.plusUnSiDivin')}</span>
        </div>
      </div>

      {/* ── Zone centrale : deux tableaux côte à côte ── */}
      <div style={{ display: 'flex' }}>

        {/* Tableau éthéré (gauche) */}
        <div style={{ flex: 3, padding: '12px 12px 24px 16px' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'auto repeat(3, 1fr)',
            border: BORDER,
            borderRadius: 8,
            overflow: 'hidden',
          }}>
            {/* Coin */}
            <div style={{ background: 'rgba(201,168,76,0.08)' }} />
            {/* En-têtes colonnes */}
            {data.groupes.map((g, i) => (
              <div key={g.niveau} style={{ ...headerCell, borderRight: i < 2 ? BORDER : undefined }}>
                {t('runes.glyphesNiveau', { niveau: g.niveau })}
              </div>
            ))}

            {/* En-tête ligne Élément */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderLeft: BORDER, padding: '0 10px',
              writingMode: 'vertical-rl' as const, transform: 'rotate(180deg)',
              fontFamily: "'Cinzel', serif", fontSize: 14, letterSpacing: '0.12em', color: GOLD,
              background: 'rgba(201,168,76,0.08)',
            }}>{t('runes.element')}</div>

            {/* Ligne éléments */}
            {data.groupes.map((g, i) => (
              <div key={g.niveau} style={{ display: 'flex', borderRight: i < 2 ? BORDER : undefined }}>
                <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: 8, padding: '10px' }}>
                  {g.elements.map(e => {
                    const selected = element === e.nom
                    const disabled = !selected && element !== null
                    return (
                      <div key={e.nom} onClick={() => !disabled && handleElementClick(e.nom)}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1 }}>
                        {selected
                          ? <SlotVide color="rgba(201,168,76,0.35)" />
                          : <div style={{ ...TILE }}><Rune nom={e.nom} width={48} height={60} color="#7a3a00" /></div>
                        }
                        <div style={{ opacity: selected ? 0.3 : 1 }}>
                          <div style={{ fontSize: 15, fontWeight: 600, color: GOLD, fontFamily: "'Cinzel', serif" }}>{e.nom}</div>
                          <div style={{ fontSize: 14, opacity: 0.6, marginTop: 2 }}>{e.texte}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '10px 10px', borderLeft: '1px solid rgba(201,168,76,0.2)', textAlign: 'center' as const,
                }}>
                  <span style={{ color: GOLD, fontWeight: 700, fontSize: 15 }}>{parseDesc(g.effetElement, intMod, sagMod, rangVoie)}</span>
                </div>
              </div>
            ))}

            {/* Séparateur */}
            <div style={{ gridColumn: '1 / -1', borderTop: BORDER }} />

            {/* En-tête ligne Attribut */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderLeft: BORDER, padding: '0 10px',
              writingMode: 'vertical-rl' as const, transform: 'rotate(180deg)',
              fontFamily: "'Cinzel', serif", fontSize: 14, letterSpacing: '0.12em', color: GOLD,
              background: 'rgba(201,168,76,0.08)',
            }}>{t('runes.attribut')}</div>

            {/* Ligne attributs */}
            {data.groupes.map((g, i) => (
              <div key={g.niveau} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px', borderRight: i < 2 ? BORDER : undefined }}>
                {g.attributs.map(a => {
                  const selected = attributs.includes(a.nom)
                  const disabled = !selected && attributs.length >= maxAttributs
                  return (
                    <div key={a.nom} onClick={() => !disabled && handleAttributClick(a.nom)}
                      style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1 }}>
                      {selected
                        ? <SlotVide color="rgba(138,180,248,0.35)" />
                        : <div style={{ ...TILE }}><Rune nom={a.nom} width={48} height={60} color="#1a2a5a" /></div>
                      }
                      <div style={{ opacity: selected ? 0.3 : 1 }}>
                        <div style={{ fontSize: 15, fontWeight: 600, color: SILVER, fontFamily: "'Cinzel', serif" }}>{a.nom}</div>
                        <div style={{ fontSize: 14, opacity: 0.7, marginTop: 2, lineHeight: 1.4 }}>{parseDesc(a.effet, intMod, sagMod, rangVoie)}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Séparateur vertical */}
        <div style={{ width: 1, background: 'rgba(201,160,220,0.2)', flexShrink: 0, margin: '12px 0' }} />

        {/* Tableau divin (droite) */}
        <div style={{ flex: 2, padding: '12px 16px 24px 12px' }}>
          {/* Grille unifiée : header + lignes partagent les mêmes colonnes */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            border: BORDER_D,
            borderRadius: 8,
            overflow: 'hidden',
          }}>
            {/* En-têtes */}
            <div style={{
              padding: '10px 14px', background: 'rgba(80,40,100,0.2)',
              fontFamily: "'Cinzel', serif", fontSize: 14,
              letterSpacing: '0.1em', textTransform: 'uppercase' as const,
              color: DIVINE, borderRight: BORDER_D, borderBottom: BORDER_D,
            }}>
              {t('runes.glyphesDivins')}
            </div>
            <div style={{
              padding: '10px 14px', background: 'rgba(80,40,100,0.2)',
              fontFamily: "'Cinzel', serif", fontSize: 14,
              letterSpacing: '0.1em', textTransform: 'uppercase' as const,
              color: DIVINE, borderBottom: BORDER_D,
            }}>
              {t('runes.effet')}
            </div>

            {/* Lignes */}
            {data.divines.map((d, i) => {
              const selected = divin === d.nom
              const isLast = i === data.divines.length - 1
              const rowBg = selected ? 'rgba(80,40,100,0.45)' : 'rgba(80,40,100,0.08)'
              const rowBorder = isLast ? 'none' : BORDER_D
              return (
                <React.Fragment key={d.nom}>
                  {/* Cellule tuile seule */}
                  <div
                    onClick={() => handleDivinClick(d.nom)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: '10px 12px', borderRight: BORDER_D, borderBottom: rowBorder,
                      background: rowBg, cursor: 'pointer', transition: 'background 0.15s',
                    }}
                  >
                    {selected
                      ? <div style={{
                          width: 64, height: 88,
                          border: '2px dashed rgba(201,160,220,0.4)',
                          borderRadius: 6, background: 'rgba(0,0,0,0.15)',
                          flexShrink: 0, boxSizing: 'border-box' as const,
                        }} />
                      : <div style={{ ...TILE, padding: 0, width: 64, height: 88, boxSizing: 'border-box' as const, overflow: 'hidden' }}><img src={`/${d.code}.png`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>
                    }
                  </div>
                  {/* Cellule nom + effet + code à droite */}
                  <div
                    onClick={() => handleDivinClick(d.nom)}
                    style={{
                      padding: '10px 12px', borderBottom: rowBorder,
                      background: rowBg, cursor: 'pointer', transition: 'background 0.15s',
                      display: 'flex', alignItems: 'center', gap: 12,
                    }}
                  >
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4, fontSize: 14, lineHeight: 1.5 }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: DIVINE, fontFamily: "'Cinzel', serif" }}>
                        {d.label}
                      </span>
                      <div style={{ opacity: 0.85 }}>
                        {parseDesc(d.effet, intMod, sagMod, rangVoie)}
                      </div>
                    </div>
                    <span style={{
                      fontSize: 36, fontWeight: 800, color: DIVINE, opacity: 0.25,
                      fontFamily: "'Cinzel', serif", letterSpacing: '0.05em',
                      flexShrink: 0, lineHeight: 1,
                    }}>
                      {d.code}
                    </span>
                  </div>
                </React.Fragment>
              )
            })}
          </div>

          {/* Rang prestige */}
          {rangPrestige > 0 && (
            <div style={{ marginTop: 12, fontSize: 12, opacity: 0.5, paddingLeft: 2 }}>
              <span style={{ color: DIVINE }}>{t('runes.voieRunesDivines')}</span>
              {' — '}{t('runes.rang')} {rangPrestige}
              {rangPrestige >= 5 && ` · ${t('runes.maitreRuniste')}`}
              {rangPrestige >= 3 && rangPrestige < 5 && ` · ${t('runes.expertRuniste')}`}
            </div>
          )}
        </div>
      </div>

      {/* ── Barre de sort ── */}
      <div style={{
        position: 'sticky', bottom: 0,
        background: 'var(--tdr-dark)',
        marginTop: 20,
        borderTop: BORDER,
        padding: '28px 20px 12px',
      }}>
        {/* En-tête barre */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <span style={{ fontFamily: "'Cinzel', serif", fontSize: 15, color: GOLD, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            {t('runes.sortCompose')}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, opacity: 0.6, marginRight: 2 }}>{t('runes.rang')}</span>
            {rangsDisponibles.map(r => (
              <button key={r} onClick={() => setRangChoisi(prev => prev === r ? null : r)} style={{
                background: rangChoisi === r ? 'rgba(201,168,76,0.35)' : 'rgba(201,168,76,0.08)',
                border: rangChoisi === r ? '1px solid #ffd700' : BORDER,
                borderRadius: 6, color: rangChoisi === r ? '#ffd700' : GOLD,
                fontFamily: "'Cinzel', serif", fontSize: 15,
                fontWeight: rangChoisi === r ? 700 : 400,
                padding: '3px 10px', cursor: 'pointer', transition: 'all 0.15s',
              }}>{r}</button>
            ))}
            <div style={{ width: 1, height: 20, background: 'rgba(201,168,76,0.25)', margin: '0 4px' }} />
            <button onClick={tirerAuSort} disabled={!rangChoisi} style={{
              background: rangChoisi ? 'rgba(201,168,76,0.15)' : 'rgba(201,168,76,0.05)',
              border: BORDER, borderRadius: 6,
              color: rangChoisi ? GOLD : 'rgba(201,168,76,0.3)',
              fontFamily: "'Cinzel', serif", fontSize: 14, padding: '4px 12px',
              cursor: rangChoisi ? 'pointer' : 'not-allowed', letterSpacing: '0.08em',
              transition: 'all 0.15s',
            }}>{t('runes.tirageChao')}</button>
            <button onClick={effacer} style={{
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 6, color: 'rgba(245,236,215,0.5)', fontSize: 14, padding: '4px 12px', cursor: 'pointer',
            }}>{t('runes.effacer')}</button>
          </div>
        </div>

        {/* Slots */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          {/* Élément */}
          {element ? (
            <TileTooltip label={allElements.find(e => e.nom === element)?.label ?? element} onClick={() => setElement(null)}>
              <div style={{ ...TILE, border: '2px solid #ffd700', boxShadow: '0 0 14px rgba(255,215,0,0.6), 3px 5px 10px rgba(0,0,0,0.55), inset 0 1px 2px rgba(255,255,255,0.8)' }}>
                <Rune nom={element} width={48} height={60} color="#a04800" />
              </div>
            </TileTooltip>
          ) : <SlotVide color="rgba(201,168,76,0.35)" />}

          <span style={{ fontSize: 20, opacity: 0.4 }}>+</span>

          {/* Attributs */}
          {Array.from({ length: maxAttributs }, (_, i) => {
            const nom = attributs[i]
            const attrLabel = nom ? (allAttributs.find(a => a.nom === nom)?.label ?? nom) : ''
            return nom ? (
              <TileTooltip key={i} label={attrLabel} onClick={() => handleAttributClick(nom)}>
                <div style={{ ...TILE, border: '2px solid #8ab4f8', boxShadow: '0 0 14px rgba(100,160,255,0.55), 3px 5px 10px rgba(0,0,0,0.55), inset 0 1px 2px rgba(255,255,255,0.8)' }}>
                  <Rune nom={nom} width={48} height={60} color="#2a4aaa" />
                </div>
              </TileTooltip>
            ) : <SlotVide key={i} color="rgba(180,180,220,0.25)" />
          })}

          {/* Divin */}
          <>
            <span style={{ fontSize: 15, opacity: 0.5 }}>+</span>
            {divin ? (() => {
              const divineData = data.divines.find(d => d.nom === divin)
              const code = divineData?.code
              return (
                <TileTooltip label={divineData?.label ?? divin} onClick={() => onDivinChange(null)}>
                  <div style={{ ...TILE, padding: 0, width: 64, height: 88, boxSizing: 'border-box' as const, overflow: 'hidden', border: '2px solid #c9a0dc', boxShadow: '0 0 14px rgba(201,160,220,0.6), 3px 5px 10px rgba(0,0,0,0.55), inset 0 1px 2px rgba(255,255,255,0.8)' }}>
                    {code && <img src={`/${code}.png`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  </div>
                </TileTooltip>
              )
            })() : <SlotVide color="rgba(201,160,220,0.25)" />}
          </>

          {/* Résultat */}
          {rang !== null && elementData && (
            <>
              <span style={{ fontSize: 20, opacity: 0.4 }}>=</span>
              <div style={{ background: 'rgba(0,0,0,0.2)', border: BORDER, borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
                  <span style={{ fontFamily: "'Cinzel', serif", color: GOLD, fontSize: 18, fontWeight: 700 }}>{t('runes.rangResult', { rang })}</span>
                  <span style={{ color: GOLD, opacity: 0.8, fontSize: 15 }}>{parseDesc(elementData.effetElement, intMod, sagMod, rangVoie)}</span>
                </div>
                <div style={{ fontSize: 15, opacity: 0.75, marginBottom: 3 }}>
                  <span style={{ color: GOLD }}>{t('runes.elementTiret')}</span>{elementData.texte}
                </div>
                {selectedAttrData.map(a => (
                  <div key={a.nom} style={{ fontSize: 15, opacity: 0.75, marginTop: 3 }}>
                    <span style={{ color: SILVER }}>{a.label} — </span>{parseDesc(a.effet, intMod, sagMod, rangVoie)}
                  </div>
                ))}
                {divin && (() => {
                  const d = data.divines.find(x => x.nom === divin)
                  return d ? (
                    <div style={{ fontSize: 15, opacity: 0.75, marginTop: 3 }}>
                      <span style={{ color: DIVINE }}>{d.label} — </span>{parseDesc(d.effet, intMod, sagMod, rangVoie)}
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
