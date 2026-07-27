import { useMemo, useState } from 'react'
import SelecteurCible from './SelecteurCible'
import { useTranslation } from 'react-i18next'
import { useGameData } from '../../context/GameDataContext'
import StatCell from './StatCell'
import NumberField from '../NumberField'
import { computeCombatStatsPJ } from '../../utils/computeEffects'
import type { CombatPJ, CombatEntiteInfo, RollResult } from '../../utils/combat'
import ResultatCartouche from './ResultatCartouche'
import { DAMAGE_TYPES, ICONES_TYPES_DEGATS } from '../../utils/damageTypes'

const GOLD = '#c9a84c'
const PARCHMENT = '#f5ecd7'
const SECTION_BORDER = 'rgba(201,168,76,0.2)'
const RED = 'rgba(255,150,150,0.95)'

const inputStyle: React.CSSProperties = {
  boxSizing: 'border-box', padding: '4px 6px', borderRadius: 4, fontSize: 13,
  background: 'rgba(255,255,255,0.05)', border: `1px solid ${SECTION_BORDER}`, color: PARCHMENT, outline: 'none',
}

const CARACS = ['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA'] as const

// Choix du type de dégâts en icônes à cocher — même principe que les rdTypes d'une créature du
// bestiaire (voir CreatureDetail), mais sélection unique (value === type) plutôt que multiple : une
// attaque n'a qu'un seul type à la fois, contrairement à une RD qui peut couvrir plusieurs types.
function SelecteurTypeDegats({ value, onChange }: { value: string; onChange: (type: string) => void }) {
  const { t } = useTranslation()
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
      {['', ...DAMAGE_TYPES].map(type => {
        const actif = value === type
        return (
          <button
            key={type || 'GEN'}
            onClick={() => onChange(type)}
            title={type ? t(`gameMode.dmType${type}`) : t('gameMode.dmTypeGenerique')}
            style={{
              width: 22, height: 22, padding: 0, fontSize: 12, lineHeight: '20px',
              background: actif ? 'rgba(201,168,76,0.25)' : 'transparent',
              border: `1px solid ${actif ? GOLD : 'rgba(201,168,76,0.25)'}`,
              borderRadius: 4, cursor: 'pointer', opacity: actif ? 1 : 0.4,
            }}
          >
            {ICONES_TYPES_DEGATS[type]}
          </button>
        )
      })}
    </div>
  )
}

interface Props {
  pj: CombatPJ
  cibles: CombatEntiteInfo[]
  // Créatures qui visent CE PJ, avec leur dernier résultat contre lui (voir CombatTab.recomputeLinks) —
  // les PJ n'ont pas de moteur de jet propre (leurs jets sont gérés à la main par le MJ), donc
  // l'information utile à afficher repliée n'est pas le ciblage du PJ lui-même mais qui l'attaque.
  attaquants: { nom: string; resultat: RollResult | null }[]
  onToggleExpand: () => void
  onSetPV: (pv: number) => void
  onSetPM: (pm: number) => void
  onSetCible: (id: string | null) => void
  // Le MJ saisit lui-même le montant final infligé par ce PJ à sa cible — pas de jet d'attaque/DEF/RD
  // recalculé ici, voir CombatTab.handleAttaquePJ. type est purement informatif (icône affichée).
  onInfligerDegats: (montant: number, type: string) => void
  // Pose un effet de dégâts sur la durée sur la cible actuelle du PJ (voir CombatTab.handleAjouterDotPJ).
  onAjouterDot: (type: string, montant: number, duree: number) => void
  // Retrait anticipé d'un DoT actif sur CE PJ (poison sur lui, pas ceux qu'il a posés sur d'autres).
  onRetirerDot: (dotId: string) => void
  onSetBuff: (stat: string, valeur: number) => void
  onClearBuff: (stat: string) => void
}

export default function PJCard({ pj, cibles, attaquants, onToggleExpand, onSetPV, onSetPM, onSetCible, onInfligerDegats, onAjouterDot, onRetirerDot, onSetBuff, onClearBuff }: Props) {
  const { t } = useTranslation()
  const { data: descriptions } = useGameData()
  const { character, expanded, buffs, pvActuels, pmActuels, cibleId, dernierResultat, dotsActifs } = pj
  const [montantDegats, setMontantDegats] = useState(0)
  const [typeDegats, setTypeDegats] = useState('')
  const [dotAmount, setDotAmount] = useState(0)
  const [dotDuree, setDotDuree] = useState(0)
  const [dotType, setDotType] = useState('')
  // computeCombatStatsPJ scanne voies/traits/cristaux du personnage — coûteux à refaire à chaque
  // rendu. Le glisser-déposer entre cartes (CombatTab) re-rend cette carte à chaque survol d'un
  // emplacement différent ; sans ce useMemo, cette carte à elle seule pouvait suffire à rendre le
  // survol perceptiblement lent (constaté sur la colonne PJ, jamais sur celle des créatures qui n'a
  // pas cette recomputation).
  const stats = useMemo(() => computeCombatStatsPJ(character, descriptions), [character, descriptions])
  const isDown = pvActuels <= 0

  if (!expanded) {
    // Ciblage propre du PJ, avec le dernier montant infligé s'il concerne encore la cible assignée
    // (voir handleAttaquePJ), en plus des créatures qui le visent (attaquants, recherche inverse dans
    // CombatTab) : les deux relations sont indépendantes et peuvent coexister (le PJ vise une créature
    // tout en étant lui-même visé par une autre).
    const cibleActuelle = cibleId ? cibles.find(c => c.id === cibleId) : null
    const resultatValide = dernierResultat && cibleActuelle && dernierResultat.cibleNom === cibleActuelle.nom ? dernierResultat : null
    // Ciblage réciproque — voir la même note dans CombatCard.tsx.
    const attaquantMutuel = cibleActuelle ? attaquants.find(a => a.nom === cibleActuelle.nom) : undefined
    const autresAttaquants = attaquantMutuel ? attaquants.filter(a => a !== attaquantMutuel) : attaquants
    return (
      <div data-combat-id={pj.id} onClick={onToggleExpand} style={{
        width: 180, cursor: 'pointer', border: `1px solid ${isDown ? 'rgba(150,150,150,0.4)' : SECTION_BORDER}`, borderRadius: 8,
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
          {cibleActuelle && (
            attaquantMutuel
              ? <ResultatCartouche autrePartie={cibleActuelle.nom} role="mutuel" resultat={resultatValide} resultatInverse={attaquantMutuel.resultat} />
              : <ResultatCartouche autrePartie={cibleActuelle.nom} role="cible" resultat={resultatValide} />
          )}
          {autresAttaquants.map((a, i) => (
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
          <SelecteurCible
            value={cibleId ?? null}
            onChange={id => onSetCible(id)}
            cibles={cibles}
            monCamp={'pj'}
            labelAucune={t('gmMode.bataille.aucuneCible')}
            bordure={SECTION_BORDER}
          />
        </div>

        {/* Dégâts infligés — saisie manuelle : le MJ résout l'attaque lui-même (à la table) et entre le
            montant BRUT ; pas de jet propre à recalculer, mais la RD de la cible est déduite ici (voir
            appliquerDegatsCible/handleAttaquePJ dans CombatTab). Le type est purement informatif (icône
            affichée sur le résultat), jamais utilisé pour un calcul de RD (pas de résistance par type
            pour les créatures dans ce modèle, contrairement aux PJ). */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, opacity: 0.6, textTransform: 'uppercase', flexShrink: 0 }}>⚔️ {t('gmMode.bataille.dmInfliges')}</span>
          <NumberField value={montantDegats} onChange={n => setMontantDegats(n ?? 0)}
            style={{ width: 56, textAlign: 'center', fontSize: 16, fontWeight: 700, background: 'rgba(255,255,255,0.05)', border: `1px solid ${SECTION_BORDER}`, borderRadius: 4, color: PARCHMENT }} />
          <SelecteurTypeDegats value={typeDegats} onChange={setTypeDegats} />
          <button
            onClick={() => { onInfligerDegats(montantDegats, typeDegats); setMontantDegats(0) }}
            disabled={!cibleId || montantDegats <= 0}
            style={{
              padding: '6px 12px', borderRadius: 4, border: '1px solid rgba(160,120,255,0.4)',
              background: 'rgba(140,100,255,0.1)', color: PARCHMENT, cursor: 'pointer', fontSize: 13,
              fontFamily: 'inherit', opacity: (!cibleId || montantDegats <= 0) ? 0.4 : 1,
            }}
          >
            {t('gmMode.bataille.infliger')}
          </button>
        </div>

        {/* Dégâts sur la durée — pose un effet sur la cible actuelle, encaissé automatiquement à
            chaque « Tour suivant » (voir tickerDots dans combat.ts), même principe que le Mode de jeu. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, opacity: 0.6, textTransform: 'uppercase', flexShrink: 0 }}>☠️ {t('gmMode.bataille.dotSection')}</span>
          <NumberField value={dotAmount} onChange={n => setDotAmount(n ?? 0)}
            style={{ width: 48, textAlign: 'center', fontSize: 14, fontWeight: 700, ...inputStyle }} />
          <span style={{ fontSize: 11, opacity: 0.5 }}>DM</span>
          <span style={{ fontSize: 12, opacity: 0.5 }}>/</span>
          <NumberField value={dotDuree} onChange={n => setDotDuree(n ?? 0)}
            style={{ width: 48, textAlign: 'center', fontSize: 14, fontWeight: 700, ...inputStyle }} />
          <span style={{ fontSize: 11, opacity: 0.5 }}>{t('gmMode.bataille.dotTours')}</span>
          <SelecteurTypeDegats value={dotType} onChange={setDotType} />
          <button
            onClick={() => { onAjouterDot(dotType, dotAmount, dotDuree); setDotAmount(0); setDotDuree(0) }}
            disabled={!cibleId || dotAmount <= 0 || dotDuree <= 0}
            style={{
              padding: '6px 12px', borderRadius: 4, border: '1px solid rgba(220,50,50,0.4)',
              background: 'rgba(180,30,30,0.12)', color: PARCHMENT, cursor: 'pointer', fontSize: 13,
              fontFamily: 'inherit', opacity: (!cibleId || dotAmount <= 0 || dotDuree <= 0) ? 0.4 : 1,
            }}
          >
            {t('gmMode.bataille.dotAjouter')}
          </button>
        </div>

        {/* Effets sur la durée actifs SUR ce PJ (posés par une créature, pas par lui) */}
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
