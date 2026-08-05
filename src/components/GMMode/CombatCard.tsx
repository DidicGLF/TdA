import { useState } from 'react'
import SelecteurCible from './SelecteurCible'
import { useImage } from '../../hooks/useImage'
import { useTranslation } from 'react-i18next'
import StatCell from './StatCell'
import NumberField from '../NumberField'
import type { CombatCreature, CombatEntiteInfo, RollResult } from '../../utils/combat'
import ResultatCartouche from './ResultatCartouche'
import HistoriqueEntreeBloc from './HistoriqueEntreeBloc'
import { ICONES_TYPES_DEGATS } from '../../utils/damageTypes'

const GOLD = '#c9a84c'
const PARCHMENT = '#f5ecd7'
const SECTION_BORDER = 'rgba(201,168,76,0.2)'
const RED = 'rgba(255,150,150,0.95)'

const CARACS = ['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA'] as const

interface Props {
  combatant: CombatCreature
  // Remplace l'ancien champ persisté CombatCreature.aJoueCeTour : dérivé de l'ordre d'initiative côté
  // CombatTab.tsx (seule l'entité à tourActuelIndex peut agir) — voir estEnCours dans CombatTab.tsx.
  estEnCours: boolean
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
  // Tirage d'une carte de réussite/échec critique sur un 1/20 naturel (voir HistoriqueEntreeBloc.tsx) —
  // remonté jusqu'à CombatTab.tsx, qui possède la modale affichée (partagée entre toutes les cartes de
  // la rencontre plutôt que dupliquée ici).
  onTirerCarte?: (categorie: 'echec' | 'reussite') => void
}

export default function CombatCard({ combatant, estEnCours, cibles, attaquants, onToggleExpand, onSetPV, onAttaque, onSetCible, onSetBuff, onClearBuff, onRetirerDot, sousTitre, onTirerCarte }: Props) {
  const { t } = useTranslation()
  const { creature, expanded, dernierResultat, buffs, pvActuels, cibleId, dotsActifs, historique } = combatant
  // Inversé par rapport à l'ancien aJoueCeTour (true = déjà joué) : ici true = ce n'est PAS son tour,
  // qu'il ait déjà joué ce round ou pas encore été atteint — le détail vit dans le tableau d'ordre.
  const aJoueCeTour = !estEnCours
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
    // Ciblage réciproque (cibleActuelle vise aussi cette carte en retour) : regroupé dans un seul
    // cartouche « mutuel » plutôt que d'empiler un cartouche cible et un cartouche attaquant quasi
    // identiques (même nom en tête) pour la même relation — voir ResultatCartouche.
    const attaquantMutuel = cibleActuelle ? attaquants.find(a => a.nom === cibleActuelle.nom) : undefined
    const autresAttaquants = attaquantMutuel ? attaquants.filter(a => a !== attaquantMutuel) : attaquants
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
          {isDown ? (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 40 }}>💀</span>
            </div>
          ) : aJoueCeTour && (
            // Sablier : a déjà agi ce tour (même signal que le grisé plus bas en vue dépliée, et même
            // symbole que côté joueur, voir GameModePanel.tsx) — le crâne reste prioritaire si la
            // créature est aussi morte (les deux ne se cumulent pas).
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 40 }}>⏳</span>
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

  // Cible actuelle déjà morte (tuée par un autre coup pendant qu'elle était visée) : désactive le
  // bouton d'attaque plutôt que de laisser résoudre un coup contre un cadavre (voir le blocage miroir
  // dans handleAttaque, CombatTab.tsx, et la sélection déjà bloquée dans SelecteurCible.tsx).
  const cibleMorte = !!cibleId && (cibles.find(c => c.id === cibleId)?.pvActuels ?? 1) <= 0

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
            // CombatCard sert aussi bien une vraie créature ennemie qu'un compagnon (allié d'un PJ, voir
            // pjProprietaireId dans CombatCreature/listerEntites) — était figé à 'creature' pour les deux,
            // ce qui inversait les couleurs alliés/ennemis dans la liste de cibles d'un compagnon
            // (rapporté par Didic : ses propres alliés apparaissaient en rouge, les ennemis en vert).
            monCamp={combatant.pjProprietaireId ? 'pj' : 'creature'}
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
              <button key={i} onClick={() => handleAttaque(a)} disabled={aJoueCeTour || cibleMorte}
                title={aJoueCeTour ? t('gmMode.bataille.aJoueCeTourTitle') : cibleMorte ? t('gmMode.bataille.cibleMorteTitle') : undefined}
                style={{ ...attaqueBtnStyle, opacity: (aJoueCeTour || cibleMorte) ? 0.4 : 1, cursor: (aJoueCeTour || cibleMorte) ? 'not-allowed' : 'pointer' }}>
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

        {/* Historique du combat — journal des actions faites ET subies par cette carte (voir
            HistoriqueEntree/ajouterHistorique dans combat.ts), conservé pour toute la durée du combat
            (demande de Didic), pas juste le dernier jet comme auparavant. 3 entrées tiennent dans la
            hauteur fixée ci-dessous (maxHeight approximatif, la hauteur réelle d'une entrée varie selon
            qu'elle a un jet d'attaque/dégâts ou non) — au-delà, défilement vertical. */}
        {historique.length > 0 && (
          <div>
            <div style={{ fontSize: 13, opacity: 0.6, textTransform: 'uppercase', marginBottom: 6 }}>
              {t('gmMode.bataille.historiqueLabel')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 380, overflowY: 'auto', paddingRight: 4 }}>
              {historique.map((h, i) => (
                <HistoriqueEntreeBloc key={h.id} entree={h} flash={i === 0 && flash} onTirerCarte={onTirerCarte} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Overlay "a joué ce tour" — jusqu'au bouton Tour suivant. Sablier ajouté en haut à droite (même
          symbole que la vue repliée ci-dessus et que côté joueur, voir GameModePanel.tsx) — jusqu'ici un
          simple assombrissement sans icône. */}
      {aJoueCeTour && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', pointerEvents: 'none', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', padding: 10 }}>
          <span style={{ fontSize: 28 }}>⏳</span>
        </div>
      )}
    </div>
  )
}

const attaqueBtnStyle: React.CSSProperties = {
  display: 'flex', gap: 8, alignItems: 'center', padding: '8px 12px', borderRadius: 4,
  border: '1px solid rgba(160,120,255,0.4)', background: 'rgba(140,100,255,0.1)',
  color: PARCHMENT, cursor: 'pointer', fontSize: 14, fontFamily: 'inherit', textAlign: 'left',
}
