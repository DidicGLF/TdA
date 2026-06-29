import React from 'react'
import { useTranslation, Trans } from 'react-i18next'
import cristauxData from '../data/cristaux.json'
import type { Character } from '../types/character'
import { getCristauxRang } from '../types/character'
import CristalSvg from './CristalSvg'
import type { Cristal } from './CristalSvg'

const GOLD = 'var(--tdr-gold)'
const BORDER = '1px solid rgba(201,168,76,0.25)'

const MAX_APPRIS = [0, 1, 2, 4, 6, 8]
const MAX_ACTIFS = [0, 1, 2, 3, 4, 5]

// ── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ label, count, max }: { label: string; count?: number; max?: number }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      marginBottom: 12,
    }}>
      <div style={{
        fontSize: 15, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.12em', color: 'rgba(201,168,76,0.7)',
      }}>
        {label}
      </div>
      {count !== undefined && max !== undefined && (
        <div style={{
          fontSize: 15, color: count >= max ? GOLD : 'rgba(245,236,215,0.4)',
          fontWeight: count >= max ? 700 : 400,
        }}>
          {count}/{max}
        </div>
      )}
      <div style={{ flex: 1, height: 1, background: 'rgba(201,168,76,0.15)' }} />
    </div>
  )
}

// ── Crystal card (sections Fabriqués et Catalogue) ───────────────────────────

function CristalCard({
  cristal, dimmed, clickable, onForget, onClick, count,
}: {
  cristal: Cristal
  dimmed: boolean
  clickable: boolean
  onForget?: () => void
  onClick?: () => void
  count?: number
}) {
  const { t } = useTranslation()
  return (
    <div
      onClick={clickable ? onClick : undefined}
      style={{
        border: BORDER,
        borderRadius: 10,
        padding: '10px 10px 8px',
        background: 'rgba(10,5,8,0.6)',
        opacity: dimmed ? 0.3 : 1,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        cursor: clickable ? 'pointer' : 'default',
        transition: 'opacity 0.15s',
        position: 'relative',
      }}
    >
      <CristalSvg cristal={cristal} size={52} actif={false} />
      <div style={{ fontSize: 15, textAlign: 'center', color: 'rgba(245,236,215,0.85)', lineHeight: 1.2 }}>
        {cristal.nom}
      </div>
      <div style={{ fontSize: 14, textAlign: 'center', color: 'rgba(245,236,215,0.45)', lineHeight: 1.3 }}>
        {cristal.effet}
      </div>
      {count !== undefined && count > 0 && (
        <div style={{
          position: 'absolute', top: 4, right: 6,
          fontSize: 11, fontWeight: 700,
          color: 'rgba(201,168,76,0.7)',
          lineHeight: 1,
        }}>
          ×{count}
        </div>
      )}
      {onForget && !dimmed && (
        <button
          onClick={e => { e.stopPropagation(); onForget() }}
          title={t('cristaux.oublier')}
          style={{
            position: 'absolute', top: 4, left: 6,
            fontSize: 13, lineHeight: 1, padding: '1px 4px', borderRadius: 3,
            border: 'none', cursor: 'pointer',
            background: 'rgba(255,255,255,0.06)',
            color: 'rgba(245,236,215,0.25)',
          }}
        >✕</button>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  character: Character
  onChange: (patch: Partial<Character>) => void
}

const FAB_BG: React.CSSProperties = {
  background: 'rgba(78,13,22,0.97)',
  border: '1px solid rgba(201,168,76,0.3)',
  boxShadow: 'inset 0 0 18px rgba(0,0,0,0.75)',
  borderRadius: 8,
  padding: '12px 10px',
}

export default function CharacterSheetCristaux({ character, onChange }: Props) {
  const { t } = useTranslation()

  const rang = getCristauxRang(character)
  const maxAppris = MAX_APPRIS[rang] ?? 0
  const maxActifs = MAX_ACTIFS[rang] ?? 0
  const canDuplicate = rang >= 5

  const appris = character.cristauxAppris ?? []
  const actifs = character.cristauxActifs ?? []

  function learnCristal(nom: string) {
    if (appris.length < maxAppris) {
      onChange({ cristauxAppris: [...appris, nom] })
    }
  }

  function unlearnCristal(idx: number) {
    const nom = appris[idx]
    const newAppris = appris.filter((_, i) => i !== idx)
    const remainingInAppris = newAppris.filter(n => n === nom).length
    const actifCount = actifs.filter(n => n === nom).length
    let newActifs = actifs
    if (actifCount > remainingInAppris) {
      const actifIdx = actifs.lastIndexOf(nom)
      newActifs = actifs.filter((_, i) => i !== actifIdx)
    }
    onChange({ cristauxAppris: newAppris, cristauxActifs: newActifs })
  }

  function activateCristal(nom: string) {
    if (actifs.length >= maxActifs) return
    const count = actifs.filter(n => n === nom).length
    if (!canDuplicate && count >= 1) return
    if (canDuplicate && count >= 2) return
    onChange({ cristauxActifs: [...actifs, nom] })
  }

  function deactivateCristal(nom: string) {
    const idx = actifs.indexOf(nom)
    if (idx >= 0) onChange({ cristauxActifs: actifs.filter((_, i) => i !== idx) })
  }

  function canActivateMore(nom: string) {
    if (actifs.length >= maxActifs) return false
    const count = actifs.filter(n => n === nom).length
    if (!canDuplicate && count >= 1) return false
    if (canDuplicate && count >= 2) return false
    return true
  }

  const apprisCristaux = appris.map((nom, idx) => {
    const data = cristauxData.find(c => c.nom === nom)
    return data ? { ...data, _idx: idx } : null
  }).filter(Boolean) as (Cristal & { _idx: number })[]
  const actifsCristaux  = actifs.map(nom => cristauxData.find(c => c.nom === nom)!).filter(Boolean)

  return (
    <div style={{ padding: 16, overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontFamily: "'Cinzel', serif", color: GOLD, fontSize: 22, fontWeight: 700 }}>
          {t('cristaux.titre')}
        </h2>
        <span style={{ fontSize: 16, color: 'rgba(245,236,215,0.45)' }}>
          {t('cristaux.rang', { rang })}
        </span>
        {canDuplicate && (
          <span style={{ fontSize: 15, color: 'rgba(245,236,215,0.35)' }}>{t('cristaux.duplicatAutorise')}</span>
        )}
      </div>

      {/* ── Section Équipés — orbite ── */}
      <div style={{ marginBottom: 28 }}>
        <SectionHeader label={t('cristaux.equipe')} count={actifs.length} max={maxActifs} />
        {(() => {
          const OW = 310, OH = 370
          const ocx = OW / 2, ocy = OH / 2 + 25
          const R = 105
          const cw = 64, ch = Math.round(cw * 1.4)
          const slots = Array.from({ length: maxActifs }, (_, i) => {
            const angle = (2 * Math.PI / maxActifs) * i - Math.PI / 2
            return {
              x: ocx + R * Math.cos(angle),
              y: ocy + R * Math.sin(angle),
              angle,
              cristal: actifsCristaux[i] ?? null,
            }
          })
          return (
            <div style={{ position: 'relative', width: OW, height: OH, margin: '0 auto', overflow: 'visible' }}>
              {/* Orbit ring */}
              <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }} width={OW} height={OH}>
                <circle cx={ocx} cy={ocy} r={R} fill="none"
                  stroke={GOLD} strokeOpacity={0.35} strokeWidth={1}
                  strokeDasharray="5 7" />
                <circle cx={ocx} cy={ocy} r={4}
                  fill={GOLD} fillOpacity={0.35} />
              </svg>
              {/* Slots */}
              {slots.map(({ x, y, angle, cristal }, i) => {
                const cos = Math.cos(angle)
                const sin = Math.sin(angle)
                const tR = R + ch / 2 + 12
                const tX = ocx + tR * cos
                const tY = ocy + tR * sin
                const xShift = cos > 0.25 ? '0%' : cos < -0.25 ? '-100%' : '-50%'
                const yShift = sin > 0.25 ? '0%' : sin < -0.25 ? '-100%' : '-50%'
                const tAlign: React.CSSProperties['textAlign'] = cos > 0.25 ? 'left' : cos < -0.25 ? 'right' : 'center'
                return (
                  <React.Fragment key={i}>
                    <div
                      onClick={cristal ? () => deactivateCristal(cristal.nom) : undefined}
                      title={cristal ? t('cristaux.desactiver') : undefined}
                      style={{
                        position: 'absolute',
                        left: x - cw / 2,
                        top: y - ch / 2,
                        width: cw,
                        cursor: cristal ? 'pointer' : 'default',
                        transition: 'transform 0.15s',
                      }}
                    >
                      {cristal ? (
                        <div style={{ filter: `drop-shadow(0 0 8px ${cristal.couleur1}88)` }}>
                          <CristalSvg cristal={cristal} size={cw} actif />
                        </div>
                      ) : (
                        <div style={{
                          width: cw, height: ch,
                          border: '1px dashed rgba(245,236,215,0.12)',
                          borderRadius: 8,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <span style={{ fontSize: 16, color: 'rgba(245,236,215,0.1)', lineHeight: 1 }}>+</span>
                        </div>
                      )}
                    </div>
                    {cristal && (
                      <div style={{
                        position: 'absolute',
                        left: tX, top: tY,
                        transform: `translate(${xShift}, ${yShift})`,
                        textAlign: tAlign,
                        maxWidth: 110,
                        pointerEvents: 'none',
                        lineHeight: 1.25,
                      }}>
                        <div style={{ fontSize: 14, color: cristal.couleur1, fontWeight: 600 }}>
                          {cristal.nom}
                        </div>
                        <div style={{ fontSize: 13, color: 'rgba(245,236,215,0.55)' }}>
                          {cristal.effet}
                        </div>
                      </div>
                    )}
                  </React.Fragment>
                )
              })}
            </div>
          )
        })()}
      </div>

      {/* ── Section Fabriqués ── */}
      <div style={{ marginBottom: 28 }}>
        <SectionHeader label={t('cristaux.fabrique')} count={appris.length} max={maxAppris} />
        <p style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(201,168,76,0.15)',
          borderRadius: 4, padding: '6px 10px', marginBottom: 12,
          fontSize: 14, color: 'rgba(245,236,215,0.5)', fontStyle: 'italic',
        }}>
          <Trans i18nKey="cristaux.coutFabrication" components={{ bold: <strong style={{ color: 'rgba(245,236,215,0.75)' }} /> }} />
        </p>
        <div style={{ ...FAB_BG }}>
          {apprisCristaux.length === 0 ? (
            <div style={{ fontSize: 16, color: 'rgba(245,236,215,0.3)', fontStyle: 'italic', paddingLeft: 4 }}>
              {t('cristaux.aucunFabrique')}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
              {apprisCristaux.map(cristal => {
                const actifCount = actifs.filter(n => n === cristal.nom).length
                const positionAmongSameName = apprisCristaux.filter(c => c.nom === cristal.nom && c._idx < cristal._idx).length
                const estEquipe = positionAmongSameName < actifCount
                return (
                  <CristalCard
                    key={cristal._idx}
                    cristal={cristal}
                    dimmed={estEquipe}
                    clickable={!estEquipe && canActivateMore(cristal.nom)}
                    onClick={() => activateCristal(cristal.nom)}
                    onForget={() => unlearnCristal(cristal._idx)}
                  />
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Section Catalogue ── */}
      <div>
        <SectionHeader label={t('cristaux.catalogue')} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
          {cristauxData.map(cristal => {
            const countFabrique = appris.filter(n => n === cristal.nom).length
            const peutApprendre = appris.length < maxAppris
            return (
              <CristalCard
                key={cristal.nom}
                cristal={cristal}
                dimmed={false}
                clickable={peutApprendre}
                count={countFabrique}
                onClick={() => learnCristal(cristal.nom)}
              />
            )
          })}
        </div>
      </div>

    </div>
  )
}
