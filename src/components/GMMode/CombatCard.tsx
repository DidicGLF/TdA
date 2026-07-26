import { useState } from 'react'
import SelecteurCible from './SelecteurCible'
import { useImage } from '../../hooks/useImage'
import { useTranslation } from 'react-i18next'
import { DiceIcon } from '../GameMode/DiceIcon'
import StatCell from './StatCell'
import NumberField from '../NumberField'
import type { CombatCreature, CombatEntiteInfo, RollResult } from '../../utils/combat'
import ResultatCartouche from './ResultatCartouche'
import { ICONES_TYPES_DEGATS } from '../../utils/damageTypes'

const GOLD = '#c9a84c'
const PARCHMENT = '#f5ecd7'
const SECTION_BORDER = 'rgba(201,168,76,0.2)'
const RED = 'rgba(255,150,150,0.95)'
const PURPLE = 'rgba(200,170,255,0.9)'

const CARACS = ['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA'] as const

interface Props {
  combatant: CombatCreature
  cibles: CombatEntiteInfo[]
  // Entités (créatures ET PJ, voir CombatTab.attaquantsDe) qui visent CETTE créature, avec leur dernier
  // résultat contre elle — un PJ peut désormais lui infliger des dégâts (voir PJCard/handleAttaquePJ).
  attaquants: { nom: string; resultat: RollResult | null }[]
  onToggleExpand: () => void
  onSetPV: (pv: number) => void
  onAttaque: (attaque: NonNullable<CombatCreature['creature']['attaques']>[number]) => void
  onSetCible: (id: string | null) => void
  onSetBuff: (stat: string, valeur: number) => void
  onClearBuff: (stat: string) => void
  // Retrait anticipé d'un DoT actif sur CETTE créature (posé par un PJ, voir handleAjouterDotPJ).
  onRetirerDot: (dotId: string) => void
  // Remplace la ligne "NC X" par ce texte — utilisé pour un compagnon (voir compagnonEnCreature dans
  // CombatTab), dont le nc:0 n'a aucun sens affiché tel quel : on montre plutôt son lien au PJ.
  sousTitre?: string
}

export default function CombatCard({ combatant, cibles, attaquants, onToggleExpand, onSetPV, onAttaque, onSetCible, onSetBuff, onClearBuff, onRetirerDot, sousTitre }: Props) {
  const { t } = useTranslation()
  const { creature, expanded, aJoueCeTour, dernierResultat, buffs, pvActuels, cibleId, dotsActifs } = combatant
  const imageSrc = useImage(creature.image)
  const [flash, setFlash] = useState(false)
  const isDown = pvActuels <= 0

  const handleAttaque = (a: NonNullable<typeof creature.attaques>[number]) => {
    onAttaque(a)
    setFlash(true)
    setTimeout(() => setFlash(false), 300)
  }

  if (!expanded) {
    // Résumé du ciblage propre à cette créature — remplace le lien SVG plein écran (réservé aux
    // cartes dépliées, voir CombatTab.recomputeLinks) tant que la carte reste repliée. Le résultat ne
    // vaut que s'il concerne la cible actuellement assignée (voir la même règle dans pushLink).
    const cibleActuelle = cibleId ? cibles.find(c => c.id === cibleId) : null
    const resultatValide = dernierResultat && cibleActuelle && dernierResultat.cibleNom === cibleActuelle.nom ? dernierResultat : null
    return (
      <div data-combat-id={combatant.id} onClick={onToggleExpand} style={{
        width: 180, cursor: 'pointer', border: `1px solid ${isDown ? 'rgba(150,150,150,0.4)' : SECTION_BORDER}`, borderRadius: 8,
        overflow: 'hidden', background: 'rgba(15,12,8,0.95)', flexShrink: 0,
        filter: isDown ? 'grayscale(1)' : undefined,
      }}>
        <div style={{ width: '100%', aspectRatio: '2 / 3', background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
          {imageSrc
            ? <img src={imageSrc} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: creature.imageFit ?? 'cover' }} />
            : <span style={{ fontSize: 28, opacity: 0.3 }}>🐾</span>}
          {isDown && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 40 }}>💀</span>
            </div>
          )}
          {/* Bandeau posé sur l'image (pas une bande ajoutée en plus) : la carte garde sa hauteur
              habituelle, seul un lien d'origine se superpose au lieu de s'additionner. */}
          {sousTitre && (
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4,
              fontSize: 13, color: GOLD, padding: '3px 6px',
              background: 'rgba(15,12,8,0.9)', borderBottom: `1px solid ${SECTION_BORDER}`,
            }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sousTitre}</span>
              {/* 🐾 est un émoji couleur : la propriété CSS color n'a aucune prise dessus, il faut un
                  filtre pour le teinter doré (sepia rapproche du ton, saturate/brightness l'accentuent). */}
              <span style={{ fontSize: 18, opacity: 0.85, flexShrink: 0, filter: 'sepia(1) saturate(4) brightness(1.15)' }}>🐾</span>
            </div>
          )}
        </div>
        <div style={{ padding: '7px 9px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: PARCHMENT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {creature.nom}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
            <span style={{ fontSize: 13, color: isDown ? RED : GOLD }}>❤️ {pvActuels} / {creature.pv ?? '—'}</span>
            {creature.init !== undefined && (
              <span style={{ fontSize: 13, color: PARCHMENT, opacity: 0.7, flexShrink: 0 }}>⚡ {creature.init}</span>
            )}
          </div>
          {cibleActuelle && <ResultatCartouche autrePartie={cibleActuelle.nom} role="cible" resultat={resultatValide} />}
          {attaquants.map((a, i) => (
            <ResultatCartouche key={i} autrePartie={a.nom} role="attaquant" resultat={a.resultat} />
          ))}
          {dotsActifs.length > 0 && (
            <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }} onClick={e => e.stopPropagation()}>
              {dotsActifs.map(dot => (
                <span key={dot.id} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11,
                  background: 'rgba(180,30,30,0.15)', border: '1px solid rgba(220,50,50,0.4)',
                  borderRadius: 10, padding: '2px 6px', color: 'rgba(255,150,150,0.9)',
                }}>
                  {ICONES_TYPES_DEGATS[dot.type]} {dot.amount}·{dot.remainingTurns}
                  <button onClick={() => onRetirerDot(dot.id)} style={{ background: 'none', border: 'none', color: 'rgba(245,236,215,0.4)', cursor: 'pointer', padding: 0, fontSize: 10, lineHeight: 1 }}>✕</button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div data-combat-id={combatant.id} style={{
      width: 400, flexShrink: 0,
      border: `1px solid ${isDown ? 'rgba(150,150,150,0.5)' : aJoueCeTour ? 'rgba(255,80,80,0.4)' : SECTION_BORDER}`,
      borderRadius: 8, background: 'rgba(15,12,8,0.95)', position: 'relative', overflow: 'hidden',
      filter: isDown ? 'grayscale(1)' : undefined,
    }}>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {imageSrc && (
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <img src={imageSrc} alt="" draggable={false} style={{ width: 52, height: 68, objectFit: creature.imageFit ?? 'cover', borderRadius: 4, display: 'block' }} />
              {isDown && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 24 }}>💀</span>
                </div>
              )}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: GOLD, fontFamily: "'Cinzel', serif" }}>
              {isDown && '💀 '}{creature.nom}
            </div>
            <div style={{ fontSize: 13, opacity: 0.5 }}>
              {sousTitre ?? <>{t('gmMode.creatureDetail.nc')} {creature.nc}{creature.taille ? ` · ${creature.taille}` : ''}</>}
            </div>
          </div>
          <button onClick={onToggleExpand} style={{ background: 'transparent', border: 'none', color: 'rgba(245,236,215,0.5)', cursor: 'pointer', fontSize: 19 }}>✕</button>
        </div>

        {/* PV */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, opacity: 0.6, textTransform: 'uppercase' }}>PV</span>
          <NumberField value={pvActuels} onChange={n => onSetPV(n ?? 0)}
            style={{ width: 64, textAlign: 'center', fontSize: 17, fontWeight: 700, background: 'rgba(255,255,255,0.05)', border: `1px solid ${SECTION_BORDER}`, borderRadius: 4, color: pvActuels <= 0 ? RED : PARCHMENT }} />
          <span style={{ fontSize: 17, opacity: 0.5 }}>/ {creature.pv ?? '—'}</span>
        </div>

        {/* Cible */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, opacity: 0.6, textTransform: 'uppercase', flexShrink: 0 }}>🎯 {t('gmMode.bataille.cible')}</span>
          <SelecteurCible
            value={cibleId ?? null}
            onChange={id => onSetCible(id)}
            cibles={cibles}
            monCamp={'creature'}
            labelAucune={t('gmMode.bataille.aucuneCible')}
            bordure={SECTION_BORDER}
          />
        </div>

        {/* Effets sur la durée actifs sur cette créature (posés par un PJ, voir handleAjouterDotPJ) —
            décomptés automatiquement à chaque « Tour suivant » (voir tickerDots). */}
        {dotsActifs.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {dotsActifs.map(dot => (
              <span key={dot.id} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12,
                background: 'rgba(180,30,30,0.12)', border: '1px solid rgba(220,50,50,0.4)',
                borderRadius: 12, padding: '3px 8px', color: 'rgba(255,150,150,0.9)',
              }}>
                {ICONES_TYPES_DEGATS[dot.type]} {dot.amount} · {t('gameMode.turn', { count: dot.remainingTurns })}
                <button onClick={() => onRetirerDot(dot.id)} style={{ background: 'none', border: 'none', color: 'rgba(245,236,215,0.4)', cursor: 'pointer', padding: '0 0 0 3px', fontSize: 10, lineHeight: 1 }}>✕</button>
              </span>
            ))}
          </div>
        )}

        {/* Caractéristiques + stats de combat */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, paddingTop: 8, borderTop: `1px solid ${SECTION_BORDER}` }}>
          {CARACS.map(c => (
            <StatCell key={c} label={c} base={creature.caracteristiques?.[c]} stat={c} buffs={buffs} onSetBuff={onSetBuff} onClearBuff={onClearBuff} />
          ))}
          <StatCell label="Init." base={creature.init} stat="INIT" buffs={buffs} onSetBuff={onSetBuff} onClearBuff={onClearBuff} />
          <StatCell label="DEF" base={creature.def} stat="DEF" buffs={buffs} onSetBuff={onSetBuff} onClearBuff={onClearBuff} />
          <StatCell label="RD" base={creature.rd} stat="RD" buffs={buffs} onSetBuff={onSetBuff} onClearBuff={onClearBuff} />
          {creature.rdTypes && creature.rdTypes.length > 0 && (
            <span
              style={{ fontSize: 14, alignSelf: 'center' }}
              title={creature.rdTypes.map(ty => t(`gameMode.dmType${ty}`)).join(', ')}
            >
              {creature.rdTypes.map(ty => ICONES_TYPES_DEGATS[ty]).join('')}
            </span>
          )}
        </div>

        {/* Attaques */}
        {creature.attaques && creature.attaques.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 13, opacity: 0.6, textTransform: 'uppercase' }}>{t('gmMode.creatureDetail.attaques')}</span>
            {creature.attaques.map((a, i) => (
              <button key={i} onClick={() => handleAttaque(a)} style={attaqueBtnStyle}>
                <span style={{ flex: 1, textAlign: 'left' }}>{a.nom}</span>
                {a.bonus && <span style={{ opacity: 0.7 }}>{t('gmMode.bataille.attaqueLabel')} {a.bonus}</span>}
                {a.dm && <span style={{ opacity: 0.7 }}>{t('gmMode.bataille.dmLabel')} {a.dm}</span>}
              </button>
            ))}
          </div>
        )}

        {/* Capacités (lecture seule) */}
        {creature.capacites && creature.capacites.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 13, opacity: 0.6, textTransform: 'uppercase' }}>{t('gmMode.creatureDetail.capacites')}</span>
            {creature.capacites.map((c, i) => (
              <div key={i} style={{ fontSize: 14, lineHeight: 1.5 }}>
                <strong style={{ color: GOLD }}>{c.nom}</strong> — <span style={{ opacity: 0.75 }}>{c.desc}</span>
              </div>
            ))}
          </div>
        )}

        {/* Dernier résultat — même présentation (icône de dé + détail + total) que la modale Mode de jeu joueur */}
        {dernierResultat && (
          <div style={{ border: `1px solid ${GOLD}`, borderRadius: 6, padding: 12, background: 'rgba(201,168,76,0.08)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: GOLD }}>
              {dernierResultat.attaqueNom}
              {dernierResultat.cibleNom && (
                <span style={{ fontWeight: 400, opacity: 0.7 }}> → {dernierResultat.cibleNom}</span>
              )}
            </div>
            {dernierResultat.jetSides !== undefined && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ fontSize: 13, opacity: 0.55, width: 84, flexShrink: 0 }}>{t('gmMode.bataille.jetAttaque')}</span>
                <DiceIcon sides={dernierResultat.jetSides} size={26} color={flash ? '#fff' : PARCHMENT} />
                <span style={{ fontSize: 18, color: flash ? '#fff' : PARCHMENT, transition: 'color 0.2s' }}>{dernierResultat.jetRoll}</span>
                {dernierResultat.jetModifier !== undefined && (
                  <span style={{ fontSize: 16, opacity: 0.6 }}>{dernierResultat.jetModifier >= 0 ? '+' : ''}{dernierResultat.jetModifier}</span>
                )}
                <span style={{ opacity: 0.4, fontSize: 16 }}>=</span>
                <span style={{ fontSize: 22, fontWeight: 700, color: flash ? '#fff' : GOLD, transition: 'color 0.2s' }}>{dernierResultat.jetTotal}</span>
              </div>
            )}
            {dernierResultat.toucheRate ? (
              <div style={{ fontSize: 13, color: 'rgba(245,236,215,0.5)', fontStyle: 'italic' }}>
                {t('gmMode.bataille.attaqueRatee')}
              </div>
            ) : (
              <>
                {dernierResultat.degatsSides !== undefined && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ fontSize: 13, opacity: 0.55, width: 84, flexShrink: 0 }}>{t('gmMode.bataille.degats')}</span>
                    <DiceIcon sides={dernierResultat.degatsSides} size={26} color={flash ? '#fff' : PARCHMENT} />
                    <span style={{ fontSize: 16, color: flash ? '#fff' : PARCHMENT, transition: 'color 0.2s' }}>{dernierResultat.degatsRollDisplay}</span>
                    <span style={{ opacity: 0.4, fontSize: 16 }}>=</span>
                    <span style={{ fontSize: 22, fontWeight: 700, color: flash ? '#fff' : GOLD, transition: 'color 0.2s' }}>{dernierResultat.degatsTotal}</span>
                  </div>
                )}
                {dernierResultat.degatsAppliques !== undefined && (
                  <div style={{ fontSize: 13, color: PURPLE }}>
                    {t('gmMode.bataille.degatsAppliques', { nom: dernierResultat.cibleNom, degats: dernierResultat.degatsAppliques })}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Overlay "a joué ce tour" — jusqu'au bouton Tour suivant */}
      {aJoueCeTour && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', pointerEvents: 'none' }} />
      )}
    </div>
  )
}

const attaqueBtnStyle: React.CSSProperties = {
  display: 'flex', gap: 8, alignItems: 'center', padding: '8px 12px', borderRadius: 4,
  border: '1px solid rgba(160,120,255,0.4)', background: 'rgba(140,100,255,0.1)',
  color: PARCHMENT, cursor: 'pointer', fontSize: 14, fontFamily: 'inherit', textAlign: 'left',
}
