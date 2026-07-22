import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useGameData } from '../../context/GameDataContext'
import StatCell from './StatCell'
import NumberField from '../NumberField'
import { computeCombatStatsPJ } from '../../utils/computeEffects'
import type { CombatPJ, CombatEntiteInfo } from '../../utils/combat'

const GOLD = '#c9a84c'
const PARCHMENT = '#f5ecd7'
const SECTION_BORDER = 'rgba(201,168,76,0.2)'
const RED = 'rgba(255,150,150,0.95)'
const PURPLE = 'rgba(200,170,255,0.9)'

const CARACS = ['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA'] as const

interface Props {
  pj: CombatPJ
  cibles: CombatEntiteInfo[]
  onToggleExpand: () => void
  onSetPV: (pv: number) => void
  onSetPM: (pm: number) => void
  onSetCible: (id: string | null) => void
  onSetBuff: (stat: string, valeur: number) => void
  onClearBuff: (stat: string) => void
}

export default function PJCard({ pj, cibles, onToggleExpand, onSetPV, onSetPM, onSetCible, onSetBuff, onClearBuff }: Props) {
  const { t } = useTranslation()
  const { data: descriptions } = useGameData()
  const { character, expanded, buffs, pvActuels, pmActuels, cibleId } = pj
  // computeCombatStatsPJ scanne voies/traits/cristaux du personnage — coûteux à refaire à chaque
  // rendu. Le glisser-déposer entre cartes (CombatTab) re-rend cette carte à chaque survol d'un
  // emplacement différent ; sans ce useMemo, cette carte à elle seule pouvait suffire à rendre le
  // survol perceptiblement lent (constaté sur la colonne PJ, jamais sur celle des créatures qui n'a
  // pas cette recomputation).
  const stats = useMemo(() => computeCombatStatsPJ(character, descriptions), [character, descriptions])
  const isDown = pvActuels <= 0

  if (!expanded) {
    return (
      <div data-combat-id={pj.id} onClick={onToggleExpand} style={{
        width: 140, cursor: 'pointer', border: `1px solid ${isDown ? 'rgba(150,150,150,0.4)' : SECTION_BORDER}`, borderRadius: 8,
        overflow: 'hidden', background: 'rgba(15,12,8,0.95)', flexShrink: 0,
        filter: isDown ? 'grayscale(1)' : undefined,
      }}>
        <div style={{ width: '100%', aspectRatio: '2 / 3', background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
          {character.portrait
            ? <img src={character.portrait} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: character.portraitFit ?? 'cover' }} />
            : <span style={{ fontSize: 28, opacity: 0.3 }}>🧑</span>}
          {isDown && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 40 }}>💀</span>
            </div>
          )}
        </div>
        <div style={{ padding: '7px 9px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: PARCHMENT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {character.nomPersonnage}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
            <span style={{ fontSize: 13, color: isDown ? RED : GOLD }}>❤️ {pvActuels} / {stats.pvTotal}</span>
            <span style={{ fontSize: 13, color: PARCHMENT, opacity: 0.7, flexShrink: 0 }}>⚡ {character.initiative}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div data-combat-id={pj.id} style={{
      width: 400, flexShrink: 0, border: `1px solid ${isDown ? 'rgba(150,150,150,0.5)' : SECTION_BORDER}`,
      borderRadius: 8, background: 'rgba(15,12,8,0.95)', position: 'relative', overflow: 'hidden',
      filter: isDown ? 'grayscale(1)' : undefined,
    }}>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {character.portrait && (
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <img src={character.portrait} alt="" draggable={false} style={{ width: 52, height: 68, objectFit: character.portraitFit ?? 'cover', borderRadius: 4, display: 'block' }} />
              {isDown && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 24 }}>💀</span>
                </div>
              )}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: GOLD, fontFamily: "'Cinzel', serif" }}>
              {isDown && '💀 '}{character.nomPersonnage}
            </div>
            <div style={{ fontSize: 13, opacity: 0.5 }}>{t('gmMode.bataille.niveau', { niveau: character.niveau })}{character.peuple ? ` · ${character.peuple}` : ''}</div>
          </div>
          <button onClick={onToggleExpand} style={{ background: 'transparent', border: 'none', color: 'rgba(245,236,215,0.5)', cursor: 'pointer', fontSize: 19 }}>✕</button>
        </div>

        {/* PV / PM */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, opacity: 0.6, textTransform: 'uppercase' }}>PV</span>
            <NumberField value={pvActuels} onChange={n => onSetPV(n ?? 0)}
              style={{ width: 56, textAlign: 'center', fontSize: 16, fontWeight: 700, background: 'rgba(255,255,255,0.05)', border: `1px solid ${SECTION_BORDER}`, borderRadius: 4, color: pvActuels <= 0 ? RED : PARCHMENT }} />
            <span style={{ fontSize: 16, opacity: 0.5 }}>/ {stats.pvTotal}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, opacity: 0.6, textTransform: 'uppercase' }}>PM</span>
            <NumberField value={pmActuels} onChange={n => onSetPM(n ?? 0)}
              style={{ width: 56, textAlign: 'center', fontSize: 16, fontWeight: 700, background: 'rgba(255,255,255,0.05)', border: `1px solid ${SECTION_BORDER}`, borderRadius: 4, color: PARCHMENT }} />
            <span style={{ fontSize: 16, opacity: 0.5 }}>/ {stats.pmTotal}</span>
          </div>
        </div>

        {/* Cible */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, opacity: 0.6, textTransform: 'uppercase', flexShrink: 0 }}>🎯 {t('gmMode.bataille.cible')}</span>
          <select value={cibleId ?? ''} onChange={e => onSetCible(e.target.value || null)} style={{
            flex: 1, fontSize: 13, padding: '5px 8px', borderRadius: 4, background: 'var(--tdr-dark)',
            border: `1px solid ${cibleId ? PURPLE : SECTION_BORDER}`, color: cibleId ? PURPLE : PARCHMENT,
          }}>
            <option value="" style={{ background: 'var(--tdr-dark)', color: PARCHMENT }}>{t('gmMode.bataille.aucuneCible')}</option>
            {cibles.map(c => <option key={c.id} value={c.id} style={{ background: 'var(--tdr-dark)', color: PARCHMENT }}>{c.nom}</option>)}
          </select>
        </div>

        {/* Caractéristiques + stats de combat */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, paddingTop: 8, borderTop: `1px solid ${SECTION_BORDER}` }}>
          {CARACS.map(c => (
            <StatCell key={c} label={c} base={character.caracteristiques[c]?.mod} stat={c} buffs={buffs} onSetBuff={onSetBuff} onClearBuff={onClearBuff} />
          ))}
          <StatCell label="Init." base={character.initiative} stat="INIT" buffs={buffs} onSetBuff={onSetBuff} onClearBuff={onClearBuff} />
          <StatCell label="DEF" base={stats.def} stat="DEF" buffs={buffs} onSetBuff={onSetBuff} onClearBuff={onClearBuff} />
          <StatCell label="RD" base={stats.rd} stat="RD" buffs={buffs} onSetBuff={onSetBuff} onClearBuff={onClearBuff} />
        </div>
      </div>
    </div>
  )
}
