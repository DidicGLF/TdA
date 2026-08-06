import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import type { MutableRefObject } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { DiceIcon } from './DiceIcon'
import type { Character, Caracteristique } from '../../types/character'
type CharacterPatch = Partial<Character>
import type { DescMap, Grant } from '../../types/gameData'
import { computeEffectsWithCristaux, sumStat, computeAttaquesTotaux, resolveFormula, computeAvantages, computeActionsSupp } from '../../utils/computeEffects'
import { getMod } from '../../types/character'
import { useGameData } from '../../context/GameDataContext'
import { getRangsEmpruntes } from '../../utils/voieRangChoix'
import { parseDesc } from '../../utils/parseDesc'
import { compagnonEnCreature, getCompagnonsOrdonnes, estCompagnonActif } from '../../utils/compagnons'
import { useImage } from '../../hooks/useImage'
import type { useReseauClient, DegatsRecus } from '../../hooks/useReseauClient'
import { rechercherPartieReseau } from '../../utils/reseau'
import { encoderMessage, COULEUR_JOURNAL } from '../../utils/reseauProtocole'
import type { CarteCritique, CategorieCarteCritique, TypeBlocCarte } from '../../data/cartesCritiques'
import { piocherCarteActive } from '../../utils/cartesCritiquesPerso'
import CarteCritiqueModal from '../CarteCritiqueModal'
import type { MissionCompagnie } from '../../utils/missions'
import { COULEUR_TYPE_MISSION } from '../../utils/missions'

// Type d'attaque à l'origine d'un jet, déduit de result.stat (voir Step5/attaques ci-dessous) — sert
// à ne montrer que le bloc pertinent de la carte tirée plutôt que les trois d'un coup.
const TYPE_ATTAQUE_PAR_STAT: Record<string, TypeBlocCarte> = {
  ATT_CONTACT: 'contact', ATT_DISTANCE: 'distance', ATT_MAGIQUE: 'magique',
}

const GOLD = '#c9a84c'
const PARCHMENT = '#f5ecd7'
const BG = '#1a1410'
const SECTION_BORDER = 'rgba(201,168,76,0.2)'
const SECTION_DIVIDER: React.CSSProperties = { borderTop: `1px dashed ${SECTION_BORDER}`, paddingTop: 12 }

const STATS: Caracteristique[] = ['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA']
const BARE_DICE = [4, 6, 8, 10, 12, 20]
// Types de dégâts sélectionnables pour le champ "Dégâts subis" — chaque type (hors générique) a sa propre
// stat de RD dédiée (RD_FEU, RD_FROID, ...), qui s'ajoute à la RD générique (stat "RD").
const DAMAGE_TYPES = ['FEU', 'FROID', 'FOUDRE', 'ACIDE', 'POISON', 'NECROTIQUE', 'TENEBRES', 'LUMIERE', 'MENTAL', 'TRANCHANT', 'PERFORANT', 'CONTONDANT']
// Icônes (non traduites, universelles) associées à chaque type de dégâts — '' = générique
const DAMAGE_TYPE_ICONS: Record<string, string> = {
  '': '🩸', FEU: '🔥', FROID: '❄️', FOUDRE: '⚡', ACIDE: '🧪', POISON: '☠️', NECROTIQUE: '🪦',
  TENEBRES: '🌑', LUMIERE: '☀️', MENTAL: '🧠', TRANCHANT: '🗡️', PERFORANT: '🏹', CONTONDANT: '🔨',
}


interface ContributingEffect {
  rangNom: string
  voieNom?: string
  rangIdx?: number
  temporaire?: boolean
}

interface RollResult {
  label: string
  formula: string
  sides: number
  roll: number
  modifier: number | null
  boost?: number
  boostLabel?: string
  total: number
  stat?: string
  costType?: 'PV' | 'PM' | 'PR'
  rollDisplay?: string
  flash: boolean
  contributingEffects?: ContributingEffect[]
}

interface ActiveBoost {
  id: number
  stat: string
  bonus: number
  label: string
  post_jet: boolean
  cout_pv?: string
  sourceKey?: string
  div2?: boolean
  immunite?: boolean
  // Nom de la capacité + rang, dupliqués ici (plutôt qu'une recherche dans availableBonuses) pour que ce soit
  // auto-suffisant une fois persisté sur le personnage et relu par la fiche.
  nom: string
  rang: number
}

// Dégâts sur la durée (poison, brûlure, etc.) : X points du type choisi, encaissés automatiquement (avec
// prise en compte de la RD/div2/immunité du type au moment de chaque application) à chaque fin de tour,
// pendant un nombre de tours donné.
interface ActiveDot {
  id: number
  type: string
  amount: number
  remainingTurns: number
  label: string
}

interface AvailableBonus {
  voieNom: string
  rangIdx: number
  grantIdx: number
  rangNom: string
  label: string
  bonus: number
  formula?: string
  deDegats?: string
  deDegatsParArme?: boolean
  temporaire?: boolean
  cibles: string[]
  choix?: boolean
  cout_pv?: string
  cout_pm?: string
  coutCaracStat?: string
  coutCaracValeur?: number
  usage?: string
  post_jet?: boolean
  precision?: string
  div2?: boolean
  immunite?: boolean
}

interface AvailableAction {
  voieNom: string
  rangIdx: number
  rangNom: string
  label: string
  de: number
  dm: string
  attType?: 'contact' | 'distance' | 'magique'
  activable?: boolean
  cout_pm?: string
}

interface Props {
  character: Character
  descriptions: DescMap
  onChange: (patch: CharacterPatch) => void
  // Connexion réseau — possédée par App.tsx (voir sa note), PAS créée ici : fermer/rouvrir le Mode de jeu
  // (ex. le joueur consulte les Notes puis revient) démonte/remonte GameModePanel, mais la connexion, elle,
  // doit survivre pour ne pas déconnecter le joueur juste parce qu'il change d'onglet. Réception des
  // dégâts/PV réseau : la vraie logique (RD, historique de jets) reste ici (dépend de l'état local du
  // Mode de jeu), donc App.tsx la délègue via ces refs, en mettant en attente tout message reçu
  // pendant que GameModePanel est démonté (voir gererDegatsRecusRef/gererPvActualisesRecuRef/
  // gererNouveauTourRecuRef dans App.tsx) — rejoué dès que ce composant se remonte (voir le useEffect
  // plus bas qui les renseigne).
  reseau: ReturnType<typeof useReseauClient>
  gererDegatsRecusRef: MutableRefObject<((d: DegatsRecus) => void) | null>
  gererPvActualisesRecuRef: MutableRefObject<((pv: number) => void) | null>
  // Déclenché par le message réseau 'nouveau-tour' (bouton "Tour suivant" du MJ, voir CombatTab.tsx) —
  // invoque exactement handleEndTurn, comme le bouton "Tour suivant" local ci-dessous.
  gererNouveauTourRecuRef: MutableRefObject<(() => void) | null>
  // Rejoue tout dégât/PV/nouveau-tour reçu pendant que ce composant était démonté (voir la note sur
  // reseau ci-dessus) — appelé juste après avoir renseigné les refs, une fois qu'elles pointent de
  // nouveau vers la vraie logique de traitement (RD, historique, fin de tour).
  drainerReseauEnAttente: () => void
  onClose: () => void
  screenWidth: number
}

let nextId = 1

function rollDiceStr(diceStr: string): number {
  const m = diceStr.match(/^(\d*)d(\d+)$/i)
  if (!m) return 0
  const nb = parseInt(m[1] || '1')
  const sides = parseInt(m[2])
  let total = 0
  for (let k = 0; k < nb; k++) total += Math.floor(Math.random() * sides) + 1
  return total
}

// Clé unique par grant activable — doit inclure grantIdx : plusieurs Bonus temporaire peuvent coexister
// sur un même rang (ex: DEF+4, immunité au froid, ÷2 au feu), et ab-${voieNom}-${rangIdx} seul les confondrait.
function boostKey(ab: { voieNom: string; rangIdx: number; grantIdx: number }): string {
  return `ab-${ab.voieNom}-${ab.rangIdx}-${ab.grantIdx}`
}

// Portrait d'une carte compagnon (vue Combat bureau, voir renderCompagnonCardVisuelle) — un vrai
// composant (pas un appel de useImage dans une boucle) : le nombre de compagnons actifs n'est plus
// plafonné à 2, donc plus moyen d'appeler useImage un nombre fixe de fois dans GameModePanel lui-même.
function CompagnonPortrait({ image, fit }: { image?: string; fit?: 'cover' | 'contain' }) {
  const src = useImage(image)
  return src
    ? <img src={src} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: fit ?? 'cover' }} />
    : <span style={{ fontSize: 28, opacity: 0.3 }}>🐾</span>
}

// Modale plein écran d'une mission en cours — bandeau (illustration/nom/participants) + dialogue
// partagé entre les participants ET le MJ (voir envoyerMessageMissionMJ côté CompagnieTab.tsx). Rendue
// en portail à `document.body`, par-dessus tout le reste de l'app (voir zIndex), tant qu'elle est
// ouverte — se ferme via ×, se rouvre depuis le petit bouton de rappel du panneau réseau (voir
// missionModaleOuverte). La modale couvrant tout l'écran, le joueur n'a plus accès aux boutons dés du
// Mode de jeu en dessous : les mêmes boutons (voir BARE_DICE) sont donc reproduits ici, en plus petit,
// et lancent directement dans le dialogue (voir onLancerDe/lancerDeMission) — les jets apparaissent
// comme n'importe quel autre message, visibles par tous les participants sans mécanique séparée.
function MissionModale({ mission, chat, input, onInputChange, onEnvoyer, onLancerDe, nbDes, onNbDesChange, onFermer }: {
  mission: MissionCompagnie
  chat: { expediteurNom: string; texte: string }[]
  input: string
  onInputChange: (v: string) => void
  onEnvoyer: () => void
  onLancerDe: (sides: number) => void
  nbDes: string
  onNbDesChange: (v: string) => void
  onFermer: () => void
}) {
  const { t } = useTranslation()
  const illustrationSrc = useImage(mission.illustration)
  // Texte clair (blanc) ou sombre selon la luminosité de l'illustration, pour rester lisible quelle
  // que soit l'image fournie par le MJ — mesurée sur sa bande basse uniquement (~45%), la seule
  // partie réellement recouverte par ce texte une fois le dégradé du bandeau appliqué.
  const [texteClair, setTexteClair] = useState(true)
  useEffect(() => {
    if (!illustrationSrc) return
    let annule = false
    const img = new Image()
    img.onload = () => {
      if (annule) return
      const canvas = document.createElement('canvas')
      canvas.width = 40
      canvas.height = 40
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const hauteurBande = img.naturalHeight * 0.45
      ctx.drawImage(img, 0, img.naturalHeight - hauteurBande, img.naturalWidth, hauteurBande, 0, 0, 40, 40)
      const { data } = ctx.getImageData(0, 0, 40, 40)
      let somme = 0
      for (let i = 0; i < data.length; i += 4) somme += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      if (!annule) setTexteClair(somme / (data.length / 4) < 140)
    }
    img.src = illustrationSrc
    return () => { annule = true }
  }, [illustrationSrc])
  const texteBlanc = !illustrationSrc || texteClair
  const ombreTexte = texteBlanc ? 'rgba(0,0,0,0.9)' : 'rgba(255,255,255,0.9)'
  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,0.88)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px',
    }}>
      <div style={{
        background: 'rgba(18,14,9,0.98)', border: `1px solid ${COULEUR_TYPE_MISSION[mission.type]}66`, borderRadius: 10,
        maxWidth: 560, width: '100%', maxHeight: '88vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 16px 70px rgba(0,0,0,0.9)', overflow: 'hidden',
      }}>
        {/* Bandeau : illustration (si présente), nom de la mission, nombre de participants */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          {illustrationSrc && (
            <img src={illustrationSrc} alt="" style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }} />
          )}
          <div style={{
            // Recouvre le bas de l'image (~30px) avec un fond flou (plutôt qu'un dégradé sombre) sous
            // le titre : reste lisible quelle que soit la luminosité de l'illustration, sans jamais la
            // couper net ni trop en recouvrir.
            padding: '14px 20px', position: 'relative', marginTop: illustrationSrc ? -30 : 0,
            background: illustrationSrc ? (texteBlanc ? 'rgba(18,14,9,0.55)' : 'rgba(245,236,215,0.6)') : 'transparent',
            backdropFilter: illustrationSrc ? 'blur(18px)' : undefined,
            WebkitBackdropFilter: illustrationSrc ? 'blur(18px)' : undefined,
          }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: texteBlanc ? '#fff' : BG, fontFamily: "'Cinzel', serif", textShadow: illustrationSrc ? `0 2px 8px ${ombreTexte}` : 'none' }}>
              🗺️ {mission.nom}
            </div>
            <div style={{ fontSize: 13, color: texteBlanc ? (illustrationSrc ? 'rgba(255,255,255,0.85)' : 'rgba(245,236,215,0.55)') : 'rgba(26,20,16,0.85)', marginTop: 2, textShadow: illustrationSrc ? `0 1px 4px ${ombreTexte}` : 'none' }}>
              <span style={{ color: COULEUR_TYPE_MISSION[mission.type], fontWeight: 700 }}>{t(`gmMode.missions.type.${mission.type}`)}</span> - {t('gameMode.reseau.missionParticipants', { n: mission.volontaires.length })} : {mission.volontaires.join(', ')}
            </div>
          </div>
          <button onClick={onFermer} style={{
            position: 'absolute', top: 10, right: 12, background: 'rgba(0,0,0,0.4)', border: 'none', borderRadius: 4,
            cursor: 'pointer', color: '#fff', fontSize: 20, lineHeight: 1, padding: '2px 8px',
          }} aria-label="Fermer">×</button>
        </div>

        {/* Dialogue — hauteur plafonnée à ~15 lignes (au-delà, ça défile) plutôt que de laisser la
            modale entière grandir indéfiniment à chaque message reçu. */}
        <div style={{ maxHeight: 320, overflowY: 'auto', padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {chat.length === 0
            ? <span style={{ opacity: 0.4, fontStyle: 'italic', fontSize: 13 }}>{t('gameMode.reseau.dialogueMissionVide')}</span>
            : chat.map((l, i) => (
              <div key={i} style={{ fontSize: 13.5, color: 'rgba(245,236,215,0.9)' }}>
                <strong style={{ color: 'rgba(150,200,120,0.95)' }}>{l.expediteurNom}</strong> : {l.texte}
              </div>
            ))}
        </div>

        {/* Dés — mêmes boutons que la section "jets rapides" du Mode de jeu (voir BARE_DICE), en plus
            petit : la modale couvrant tout l'écran, ce sont les seuls boutons de dé encore accessibles
            tant qu'elle est ouverte. */}
        <div style={{ display: 'flex', gap: 4, padding: '10px 20px 0', flexShrink: 0, justifyContent: 'center' }}>
          {BARE_DICE.map(d => (
            <button key={d} onClick={() => onLancerDe(d)} style={{
              flex: 1, maxWidth: 56, aspectRatio: '1', padding: 3, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 4, cursor: 'pointer', border: '1px solid rgba(150,200,120,0.3)', background: 'rgba(150,200,120,0.1)',
            }}>
              <DiceIcon sides={d} size="100%" />
            </button>
          ))}
          <div style={{ flexShrink: 0, width: 26, display: 'flex', flexDirection: 'column', gap: 2 }} title={t('gameMode.nbDesLabel')}>
            <button type="button" onClick={() => onNbDesChange(String(Math.max(1, (parseInt(nbDes, 10) || 1) + 1)))} style={{
              flex: 1, minHeight: 0, padding: 0, borderRadius: 3, fontSize: 11, lineHeight: 1, cursor: 'pointer',
              border: '1px solid rgba(150,200,120,0.3)', background: 'rgba(150,200,120,0.12)', color: 'rgba(180,230,150,0.95)',
            }}>+</button>
            <input
              type="number" min={1} value={nbDes} onChange={e => onNbDesChange(e.target.value)} placeholder="1"
              style={{ flex: 1, minHeight: 0, width: '100%', padding: 0, borderRadius: 3, fontSize: 11, textAlign: 'center',
                border: '1px solid rgba(150,200,120,0.3)', background: 'rgba(0,0,0,0.3)', color: PARCHMENT, outline: 'none', boxSizing: 'border-box' }}
            />
            <button type="button" onClick={() => onNbDesChange(String(Math.max(1, (parseInt(nbDes, 10) || 1) - 1)))} style={{
              flex: 1, minHeight: 0, padding: 0, borderRadius: 3, fontSize: 11, lineHeight: 1, cursor: 'pointer',
              border: '1px solid rgba(150,200,120,0.3)', background: 'rgba(150,200,120,0.12)', color: 'rgba(180,230,150,0.95)',
            }}>-</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, padding: '10px 20px 14px', borderTop: '1px solid rgba(150,200,120,0.2)', marginTop: 10, flexShrink: 0 }}>
          <input
            value={input}
            onChange={e => onInputChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onEnvoyer() }}
            placeholder={t('gameMode.reseau.dialogueMissionPlaceholder')}
            style={{ flex: 1, minWidth: 0, padding: '8px 10px', borderRadius: 4, border: '1px solid rgba(150,200,120,0.3)', background: 'rgba(0,0,0,0.3)', color: PARCHMENT, fontSize: 14 }}
          />
          <button onClick={onEnvoyer} style={{
            padding: '8px 14px', borderRadius: 4, cursor: 'pointer', fontSize: 14,
            border: '1px solid rgba(150,200,120,0.3)', background: 'rgba(150,200,120,0.12)', color: 'rgba(180,230,150,0.95)',
          }}>
            {t('gameMode.reseau.envoyer')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default function GameModePanel({ character, descriptions, onChange, reseau, gererDegatsRecusRef, gererPvActualisesRecuRef, gererNouveauTourRecuRef, drainerReseauEnAttente, onClose, screenWidth }: Props) {
  const { t } = useTranslation()
  const { armes, armures, compagnons: compagnonsCatalogue, cartesCritiquesEchecs, cartesCritiquesReussites, compagnie } = useGameData()
  // Même seuil que App.tsx (voir sa note) : 1200, pas 700, pour couvrir les tablettes en paysage.
  const isMobile = screenWidth < 1200
  const [result, setResult] = useState<RollResult | null>(null)
  const [history, setHistory] = useState<RollResult[]>([])
  // Carte de réussite/échec critique tirée (voir cartesCritiques.ts) — appliquée oralement par le
  // joueur/MJ, aucun effet automatisé dessus. typeAttaque déduit de RollResult.stat, absent pour un
  // jet qui n'est pas une attaque (jet rapide, caractéristique...), voir TYPE_ATTAQUE_PAR_STAT.
  const [carteAffichee, setCarteAffichee] = useState<{ categorie: CategorieCarteCritique; carte: CarteCritique; typeAttaque: TypeBlocCarte | null } | null>(null)
  const tirerCarte = (categorie: CategorieCarteCritique, stat?: string) => {
    const carte = piocherCarteActive(categorie === 'echec' ? cartesCritiquesEchecs : cartesCritiquesReussites)
    setCarteAffichee({ categorie, carte, typeAttaque: stat ? TYPE_ATTAQUE_PAR_STAT[stat] ?? null : null })
  }
  // Le "character" reçu est déjà la copie de session créée par App.tsx à l'ouverture du Mode de jeu (jamais
  // l'original) — on peut donc écrire dessus librement via onChange, ça ne touche jamais la vraie fiche.
  const [effectCounters, setEffectCounters] = useState<Record<string, number>>(() => character.effectCounters ?? {})
  const [activeBoosts, setActiveBoosts] = useState<ActiveBoost[]>(() => (character.activeBoosts as ActiveBoost[] | undefined) ?? [])
  const [activeDots, setActiveDots] = useState<ActiveDot[]>(() => character.activeDots ?? [])
  // Limite d'action par tour (voir budgetActions plus bas) : nombre d'actions offensives/actives déjà
  // utilisées ce tour côté PJ, et par compagnon (verrou indépendant, voir section Compagnons). Les deux
  // sont remis à zéro dans handleEndTurn, déclenché par le bouton local ET par le message réseau
  // 'nouveau-tour' envoyé par le MJ (voir gererNouveauTourRecuRef plus bas).
  const [actionsUtiliseesCeTour, setActionsUtiliseesCeTour] = useState<number>(() => character.actionsUtiliseesCeTour ?? 0)
  const [compagnonsDejaAgiCeTour, setCompagnonsDejaAgiCeTour] = useState<Record<string, boolean>>(() => character.compagnonsDejaAgiCeTour ?? {})
  useEffect(() => {
    onChange({ activeBoosts, effectCounters, activeDots, actionsUtiliseesCeTour, compagnonsDejaAgiCeTour })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBoosts, effectCounters, activeDots, actionsUtiliseesCeTour, compagnonsDejaAgiCeTour])
  // Voie culturelle des Ogres, rang 4 "Intuable" : le PJ peut choisir de résister à l'inconscience à 0 PV
  // et continuer à se battre, PV négatifs jusqu'à -CON, au-delà duquel il meurt.
  const [ogreResisting, setOgreResisting] = useState(false)
  const [pendingStatPick, setPendingStatPick] = useState<{ abIdx: number } | null>(null)
  const [deDegatsWeapon, setDeDegatsWeapon] = useState<Record<string, string>>({})
  const [currentPV, setCurrentPV] = useState<number | null>(() => character.pvRestants ?? null)
  const [currentPM, setCurrentPM] = useState<number | null>(() => character.pmRestants ?? null)
  const [resultInHistory, setResultInHistory] = useState(false)
  const [healInput, setHealInput] = useState('')
  // Cliquer "Soigner" sans montant saisi envoie le curseur ici plutôt que de ne rien faire (voir
  // handleManualHeal) — la touche Entrée valide alors directement depuis ce même champ.
  const healInputRef = useRef<HTMLInputElement>(null)
  const [dmInput, setDmInput] = useState('')
  // Nombre de dés à lancer pour les jets rapides (section dés bruts, voir BARE_DICE) — ex. taper "6"
  // puis cliquer d8 lance 6d8 d'un coup plutôt qu'un seul d8. Vide/invalide = 1 (comportement inchangé).
  const [nbDesInput, setNbDesInput] = useState('')
  const [dotAmountInput, setDotAmountInput] = useState('')
  const [dotDurationInput, setDotDurationInput] = useState('')
  const [dotTypeInput, setDotTypeInput] = useState('')
  const [gmTooltip, setGmTooltip] = useState<{ title: string; desc?: string; x: number; y: number; below: boolean } | null>(null)
  // Panneau réseau (voir useReseauClient et src/components/GMMode/ReseauTab.tsx côté MJ) : connexion au
  // serveur du MJ via le code de partie qu'il affiche (recherche par diffusion UDP, voir
  // rechercherPartieReseau) — la saisie d'IP manuelle reste disponible en repli si la découverte ne
  // fonctionne pas sur le réseau (routeur/VPN qui bloque le broadcast).
  const [reseauPanelOuvert, setReseauPanelOuvert] = useState(false)
  const [reseauCode, setReseauCode] = useState('')
  const [reseauRecherche, setReseauRecherche] = useState(false)
  const [reseauIntrouvable, setReseauIntrouvable] = useState(false)
  const [reseauManuelOuvert, setReseauManuelOuvert] = useState(false)
  const [reseauIp, setReseauIp] = useState('')
  const [reseauMessage, setReseauMessage] = useState('')
  // Dialogue PRIVÉ avec un autre PJ précis (voir envoyerMessagePJ dans useReseauClient.ts et
  // 'message-pj' dans reseauProtocole.ts) — relayé par le MJ au seul destinataire choisi, distinct du
  // champ ci-dessus qui s'adresse AU MJ. dialoguePJCible : idPJ choisi dans reseau.rosterPJ.
  const [dialoguePJInput, setDialoguePJInput] = useState('')
  const [dialoguePJCible, setDialoguePJCible] = useState('')
  // Cible choisie par le joueur lui-même (voir la section Combat plus bas et envoyerCibleChoisie dans
  // useReseauClient.ts) — état purement local à l'UI de ce select, la valeur "vraie" (session.pjs[].cibleId
  // côté MJ) n'est jamais rejouée vers le joueur (voir 'etat-ciblage' dans reseauProtocole.ts, qui ne
  // transporte que les cibles disponibles et qui cible le PJ, pas sa propre sélection actuelle).
  const [cibleChoisieId, setCibleChoisieId] = useState('')
  // Cible choisie par le joueur pour CHACUN de ses compagnons (nom → id), indépendante de la sienne —
  // le ciblage compagnon était jusqu'ici resté manuel côté MJ (limite acceptée du premier lot), corrigé
  // suite au retour de Didic. Même état purement local que cibleChoisieId (voir sa note juste au-dessus).
  const [compagnonsCibleChoisie, setCompagnonsCibleChoisie] = useState<Record<string, string>>({})
  // Total des dégâts infligés PAR LE PJ (pas ses compagnons, dont la cible n'est pas suivie côté joueur —
  // ciblage compagnon resté manuel côté MJ) à chaque ennemi, purement local (aucun message réseau dédié :
  // le joueur connaît déjà ce total puisque c'est lui qui vient de lancer les dés) — affiché sur la carte
  // ennemi de la vue Combat desktop (voir plus bas), conformément à la demande initiale de Didic
  // ("les dégâts que le PJ fait sur la créature").
  const [degatsInfligesParCible, setDegatsInfligesParCible] = useState<Record<string, number>>({})
  // reseau (connexion) et gererDegatsRecusRef/gererPvActualisesRecuRef (délégation de la réception, voir
  // leur note dans Props ci-dessus) viennent maintenant d'App.tsx — plus de useReseauClient local ici.
  // Marque le message/l'image du MJ comme lu(e) dès que le panneau est ouvert — à l'ouverture, mais
  // aussi si un nouveau message arrive alors que le panneau est DÉJÀ ouvert (sinon messageNonLu repasse
  // à true sans que ce useEffect ne se redéclenche, puisque reseauPanelOuvert lui ne change pas : le
  // voyant rouge restait affiché malgré le panneau ouvert — bug rapporté par Didic).
  useEffect(() => {
    if (reseauPanelOuvert && reseau.messageNonLu) reseau.marquerMessagesLus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reseauPanelOuvert, reseau.messageNonLu, reseau.marquerMessagesLus])

  // Transmission automatique au MJ de tout dégât infligé via le Mode de jeu (voir handleActionDegats/
  // handleWeaponDegats/handleRollBonusDice ci-dessous) — pas de type de dégâts fiable à déduire côté
  // joueur pour ces jets (DAMAGE_TYPES sert aux résistances de dégâts reçus, pas aux dégâts infligés),
  // donc envoyé générique ; le MJ l'affiche comme tel dans son journal.
  const envoyerDegatsReseau = (montant: number, compagnonNom?: string) => {
    if (reseau.connecte && montant > 0) reseau.envoyer(encoderMessage({ type: 'degats', montant, typeDegats: '', ...(compagnonNom ? { compagnonNom } : {}) }))
    if (!compagnonNom && montant > 0 && cibleChoisieId) {
      setDegatsInfligesParCible(prev => ({ ...prev, [cibleChoisieId]: (prev[cibleChoisieId] ?? 0) + montant }))
    }
  }

  // Transmission automatique au MJ de toute nouvelle valeur de PV (soin ou perte hors attaque de
  // créature, déjà couverte séparément par 'degats-recus') — voir applyPVLoss/applyHeal plus bas et la
  // note sur 'pv-actualises' dans reseauProtocole.ts. Valeur absolue, pas un delta.
  const envoyerPvReseau = (pv: number) => {
    if (reseau.connecte) reseau.envoyer(encoderMessage({ type: 'pv-actualises', pvActuels: pv }))
  }

  const rechercherEtConnecter = async () => {
    if (!reseauCode.trim()) return
    setReseauRecherche(true)
    setReseauIntrouvable(false)
    const ip = await rechercherPartieReseau(reseauCode.trim())
    setReseauRecherche(false)
    if (ip) reseau.connecter(ip, character)
    else setReseauIntrouvable(true)
  }

  // Partagé par le bouton Envoyer et la touche Entrée dans le champ (voir onKeyDown ci-dessous).
  const envoyerMessageChat = () => {
    if (!reseauMessage.trim()) return
    reseau.envoyerMessageJoueur(reseauMessage.trim())
    setReseauMessage('')
  }
  // Même principe, pour le dialogue avec le(s) PJ choisi(s) dans dialoguePJCible (voir envoyerMessagePJ)
  // — dialoguePJCible vide = à tous les autres joueurs connectés (comportement par défaut tant qu'aucun
  // destinataire précis n'est choisi).
  const envoyerDialoguePJChat = () => {
    if (!dialoguePJInput.trim()) return
    if (!dialoguePJCible) {
      reseau.envoyerMessagePJ(undefined, t('gameMode.reseau.dialogueTousLabel'), dialoguePJInput.trim())
    } else {
      const cible = reseau.rosterPJ.find(j => j.idPJ === dialoguePJCible)
      if (!cible) return
      reseau.envoyerMessagePJ(cible.idPJ, cible.nom, dialoguePJInput.trim())
    }
    setDialoguePJInput('')
  }

  // Missions dont ce PJ est volontaire et qui sont actuellement en cours (voir la section Missions de
  // CompagnieTab.tsx côté MJ) — préfère la vue réseau (mise à jour en direct, voir 'compagnie-missions-
  // maj') dès qu'elle a été reçue, sinon la donnée locale/importée, même principe que
  // CharacterCompagnieTab.tsx.
  const missionsActives = useMemo(() => {
    const missions = reseau.compagnieMissions ?? compagnie.missions
    const monNom = character.nomPersonnage.trim().toLowerCase()
    return missions.filter(m => m.statut === 'enCours' && m.volontaires.some(v => v.toLowerCase() === monNom))
  }, [reseau.compagnieMissions, compagnie.missions, character.nomPersonnage])
  // Brouillon de message par mission (plusieurs missions actives possibles à la fois) — même principe
  // que messagesPrives côté MJ dans ReseauTab.tsx.
  const [missionChatInput, setMissionChatInput] = useState<Record<string, string>>({})
  const envoyerChatMission = (missionId: string) => {
    const texte = (missionChatInput[missionId] ?? '').trim()
    if (!texte) return
    reseau.envoyerMessageMission(missionId, texte)
    setMissionChatInput(prev => ({ ...prev, [missionId]: '' }))
  }
  // Modale plein écran de mission (voir MissionModale plus haut) — ouverte automatiquement dès qu'une
  // mission jamais vue apparaît dans missionsActives (lancement par le MJ, ou reconnexion en pleine
  // mission déjà en cours), rouvrable ensuite via le petit bouton de rappel du panneau réseau. Se
  // referme d'elle-même si le MJ stoppe/résout la mission affichée : missionModaleOuverte n'est jamais
  // remis à null explicitement pour ça, le rendu (voir plus bas) ne réaffiche la modale que si l'id
  // pointe encore vers une mission de missionsActives — un id devenu périmé ne produit donc plus rien.
  // missionsPrecedentesRef (l'ensemble précédent, pas "déjà vue une fois pour toutes") : si le MJ stoppe
  // PUIS relance la même mission, elle redevient une transition "nouvelle" et rouvre la modale.
  const [missionModaleOuverte, setMissionModaleOuverte] = useState<string | null>(null)
  const missionsPrecedentesRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    const idsActifs = new Set(missionsActives.map(m => m.id))
    for (const id of idsActifs) {
      if (!missionsPrecedentesRef.current.has(id)) setMissionModaleOuverte(id)
    }
    missionsPrecedentesRef.current = idsActifs
  }, [missionsActives])

  const voiesPerso = useMemo(() => [
    character.voiePeuple, character.voieCulturelle,
    character.voie1, character.voie2, character.voie3,
    character.voiePrestige, character.voieSangMele,
  ], [character])

  // Rangs obtenus via un grant VOIE_RANG/VOIE_RANG_CHOIX d'une des voies ci-dessus (ex : voie
  // culturelle de la Forge donnant un rang d'alchimie ou de magie runique, ou "Furie du Berserker"
  // donnant le rang 3 de la voie de la férocité) — mêmes capacités qu'un rang possédé en propre pour
  // les bonus/actions activables ci-dessous, mais sans notion de rang avancé ni de sous-choix en cascade.
  const rangsEmpruntes = useMemo(() => getRangsEmpruntes(character, descriptions), [character, descriptions])

  // Parmi les rangs empruntés, ceux qui n'ont aucun grant activable (BONUS_TEMP/ACTION/AVANTAGE) —
  // purement descriptifs (ex : Fortifiant, Feu grégeois de la voie d'alchimie) — n'apparaîtraient sinon
  // nulle part dans le Mode de jeu une fois la fiche fermée ; on les liste à part, en texte simple.
  const rangsEmpruntesTexte = useMemo(() =>
    rangsEmpruntes.filter(({ rangData }) =>
      !(rangData.grants ?? []).some(g => g.type === 'BONUS_TEMP' || g.type === 'ACTION' || g.type === 'AVANTAGE')
    ),
  [rangsEmpruntes])

  const availableBonuses = useMemo<AvailableBonus[]>(() => {
    const out: AvailableBonus[] = []
    for (const voie of voiesPerso) {
      if (!voie.nom) continue
      const rangsDesc = descriptions[voie.nom]
      if (!rangsDesc) continue
      voie.rangs.forEach((unlocked, idx) => {
        if (!unlocked) return
        const rang = rangsDesc[idx]
        if (!rang?.grants) return
        for (let gi = 0; gi < rang.grants.length; gi++) {
          const grant = rang.grants[gi]
          if (grant.type !== 'BONUS_TEMP') continue
          if (grant.avancee && !(voie.rangsAvances?.[idx])) continue
          if (grant.masqueSiAvancee && voie.rangsAvances?.[idx]) continue
          if ((grant.minRang ?? 1) > voie.rangs.filter(Boolean).length) continue
          const bonusValue = grant.formula ? (resolveFormula(grant.formula, character) ?? 0) : (grant.bonus ?? 0)
          out.push({ voieNom: voie.nom, rangIdx: idx, grantIdx: gi, rangNom: rang.nom, label: grant.label, bonus: bonusValue, formula: grant.formula, deDegats: grant.deDegats, deDegatsParArme: grant.deDegatsParArme, temporaire: grant.temporaire, cibles: grant.cibles, choix: grant.choix, cout_pv: grant.cout_pv, cout_pm: grant.cout_pm, coutCaracStat: grant.coutCaracStat, coutCaracValeur: grant.coutCaracValeur, usage: grant.usage, post_jet: grant.post_jet, precision: grant.precision, div2: grant.div2, immunite: grant.immunite })
        }
      })
    }
    // Rangs empruntés (VOIE_RANG/VOIE_RANG_CHOIX) : mêmes bonus temporaires activables. La case avancée
    // se raccroche à celle du rang qui porte le grant (avanceeAccordee), pas de minRang (pas de
    // progression dans la voie source). Cas limite non géré : si le perso possède déjà EN PROPRE le
    // même (voieNom, rangIdx) que celui emprunté (ex. Furie du Berserker empruntant un rang de férocité
    // que le perso a aussi pris directement), boostKey() produit la même clé pour les deux — le livre
    // les fusionne narrativement dans ce cas précis (voir description de la capacité), pas géré
    // mécaniquement ici.
    for (const { voieNom, rangIdx, rangData, avanceeAccordee } of rangsEmpruntes) {
      (rangData.grants ?? []).forEach((grant, gi) => {
        // masqueSiAvancee manquait ici (présent sur la boucle des voies possédées en propre, plus haut) :
        // une capacité élémentaliste EMPRUNTÉE (VOIE_RANG_CHOIX) dont l'avancée est accordée gardait sa
        // version de base en plus de la version avancée, au lieu de la remplacer (signalé par Didic).
        if (grant.type !== 'BONUS_TEMP' || (grant.avancee && !avanceeAccordee) || (grant.masqueSiAvancee && avanceeAccordee) || grant.minRang !== undefined) return
        const bonusValue = grant.formula ? (resolveFormula(grant.formula, character) ?? 0) : (grant.bonus ?? 0)
        out.push({ voieNom, rangIdx, grantIdx: gi, rangNom: rangData.nom, label: grant.label, bonus: bonusValue, formula: grant.formula, deDegats: grant.deDegats, deDegatsParArme: grant.deDegatsParArme, temporaire: grant.temporaire, cibles: grant.cibles, choix: grant.choix, cout_pv: grant.cout_pv, cout_pm: grant.cout_pm, coutCaracStat: grant.coutCaracStat, coutCaracValeur: grant.coutCaracValeur, usage: grant.usage, post_jet: grant.post_jet, precision: grant.precision, div2: grant.div2, immunite: grant.immunite })
      })
    }
    return out
  }, [voiesPerso, rangsEmpruntes, descriptions, character])

  const permanentBonusByStat = useMemo(() => {
    const map = new Map<string, number>()
    for (const ab of availableBonuses) {
      if (ab.temporaire) continue
      for (const cible of ab.cibles) map.set(cible, (map.get(cible) ?? 0) + ab.bonus)
    }
    return map
  }, [availableBonuses])

  // Bonus en dés (deDegats) actuellement actifs : permanents, ou temporaires en cours
  const activeDeDegats = useMemo(() => availableBonuses.filter(ab =>
    ab.deDegats && (!ab.temporaire || (effectCounters[boostKey(ab)] ?? 0) > 0)
  ), [availableBonuses, effectCounters])

  // Stats avec "garder le meilleur jet" : stat → { lancer, garder }
  const { statsAvantage, availableAvantages } = useMemo(() => {
    const list = computeAvantages(character, descriptions)
    const map = new Map<string, { lancer: number; garder: number }>()
    for (const a of list) map.set(a.stat, { lancer: a.lancer, garder: a.garder })
    return { statsAvantage: map, availableAvantages: list }
  }, [character, descriptions])

  // Grants ACTIONS_SUPP ("2 attaques par tour" etc.) — détectés automatiquement depuis les voies, jamais
  // une case à cocher manuelle (voir computeActionsSupp/budgetActions). Affichés comme un grant
  // "Automatique" au même titre qu'un AVANTAGE (voir la section Effets actifs plus bas).
  const availableActionsSupp = useMemo(() => computeActionsSupp(character, descriptions), [character, descriptions])

  const availableActions = useMemo<AvailableAction[]>(() => {
    const out: AvailableAction[] = []
    for (const voie of voiesPerso) {
      if (!voie.nom) continue
      const rangsDesc = descriptions[voie.nom]
      if (!rangsDesc) continue
      voie.rangs.forEach((unlocked, idx) => {
        if (!unlocked) return
        const rang = rangsDesc[idx]
        if (!rang?.grants) return
        const eligibles: Extract<Grant, { type: 'ACTION' }>[] = []
        for (const grant of rang.grants) {
          if (grant.type !== 'ACTION') continue
          if (grant.avancee && !(voie.rangsAvances?.[idx])) continue
          if (grant.masqueSiAvancee && voie.rangsAvances?.[idx]) continue
          if ((grant.minRang ?? 1) > voie.rangs.filter(Boolean).length) continue
          eligibles.push(grant)
        }
        // Une même capacité (label identique) peut monter en puissance avec le rang via plusieurs paliers
        // minRang successifs : ne garder que le palier le plus élevé actuellement atteint, pas tous à la fois.
        const meilleurParLabel = new Map<string, typeof eligibles[number]>()
        for (const grant of eligibles) {
          const actuel = meilleurParLabel.get(grant.label)
          if (!actuel || (grant.minRang ?? 1) > (actuel.minRang ?? 1)) meilleurParLabel.set(grant.label, grant)
        }
        for (const grant of meilleurParLabel.values()) {
          out.push({ voieNom: voie.nom, rangIdx: idx, rangNom: rang.nom, label: grant.label, de: grant.de, dm: grant.dm, attType: grant.attType, activable: grant.activable, cout_pm: grant.cout_pm })
        }
      })
    }
    for (const { voieNom, rangIdx, rangData, avanceeAccordee } of rangsEmpruntes) {
      for (const grant of rangData.grants ?? []) {
        // Voir la même note sur masqueSiAvancee dans la boucle BONUS_TEMP ci-dessus.
        if (grant.type !== 'ACTION' || (grant.avancee && !avanceeAccordee) || (grant.masqueSiAvancee && avanceeAccordee) || grant.minRang !== undefined) continue
        out.push({ voieNom, rangIdx, rangNom: rangData.nom, label: grant.label, de: grant.de, dm: grant.dm, attType: grant.attType, activable: grant.activable, cout_pm: grant.cout_pm })
      }
    }
    return out
  }, [voiesPerso, rangsEmpruntes, descriptions])

  // Effets de voie actifs par stat
  const effectsByStatMap = useMemo(() => {
    const map = new Map<string, { voieNom: string; rangIdx: number; rangNom: string; value?: number; formula?: string; diceStr?: string }[]>()
    for (const voie of voiesPerso) {
      if (!voie.nom) continue
      const rangsDesc = descriptions[voie.nom]
      if (!rangsDesc) continue
      voie.rangs.forEach((unlocked, idx) => {
        if (!unlocked) return
        const rang = rangsDesc[idx]
        if (!rang?.effects) return
        for (const eff of rang.effects) {
          if (!eff.stat) continue
          if (!map.has(eff.stat)) map.set(eff.stat, [])
          map.get(eff.stat)!.push({ voieNom: voie.nom, rangIdx: idx, rangNom: rang.nom, value: eff.value, formula: eff.formula, diceStr: eff.diceStr })
        }
      })
    }
    for (const { voieNom, rangIdx, rangData, avanceeAccordee } of rangsEmpruntes) {
      for (const eff of rangData.effects ?? []) {
        if (!eff.stat || (eff.avancee && !avanceeAccordee) || eff.minRang !== undefined) continue
        if (!map.has(eff.stat)) map.set(eff.stat, [])
        map.get(eff.stat)!.push({ voieNom, rangIdx, rangNom: rangData.nom, value: eff.value, formula: eff.formula, diceStr: eff.diceStr })
      }
    }
    for (const ab of availableBonuses) {
      if (ab.temporaire) continue
      for (const cible of ab.cibles) {
        if (!map.has(cible)) map.set(cible, [])
        map.get(cible)!.push({ voieNom: ab.voieNom, rangIdx: ab.rangIdx, rangNom: ab.rangNom, value: ab.bonus })
      }
    }
    return map
  }, [voiesPerso, rangsEmpruntes, descriptions, availableBonuses])

  const pushHistory = useCallback((entry: RollResult) => {
    setHistory(prev => [entry, ...prev].slice(0, 20))
    setResultInHistory(false)
  }, [])

  const pushResult = useCallback((entry: RollResult) => {
    setResult({ ...entry, flash: true })
    setHistory(prev => [entry, ...prev].slice(0, 20))
    setResultInHistory(true)
    setTimeout(() => setResult(prev => prev ? { ...prev, flash: false } : null), 300)
  }, [])

  const roll = useCallback((sides: number, label: string, modifier: number | null, stat?: string) => {
    const av = stat ? statsAvantage.get(stat) : undefined
    const nbLancer = av ? av.lancer : 1
    const nbGarder = av ? av.garder : 1

    const rolls = Array.from({ length: nbLancer }, () => Math.floor(Math.random() * sides) + 1)
    const sorted = [...rolls].sort((a, b) => b - a)
    const kept = sorted.slice(0, nbGarder)
    const r = kept.reduce((s, v) => s + v, 0)

    let boost: number | undefined
    let boostLabel: string | undefined
    // Un bonus ciblant "JET" s'applique au prochain jet de d20, quel qu'il soit (attaque, carac ou jet libre)
    const match = (stat ? activeBoosts.find(b => b.stat === stat) : undefined)
      ?? (sides === 20 ? activeBoosts.find(b => b.stat === 'JET') : undefined)
    if (match) {
      boost = match.bonus
      boostLabel = match.label
      setActiveBoosts(prev => prev.filter(b => b.id !== match.id))
    }
    const modStr = modifier !== null ? (modifier >= 0 ? `+${modifier}` : String(modifier)) : ''
    const boostStr = boost ? `+${boost}` : ''
    const formula = av ? `${nbLancer}d${sides}k${nbGarder}${modStr}${boostStr}` : `1d${sides}${modStr}${boostStr}`
    const total = (modifier !== null ? r + modifier : r) + (boost ?? 0)
    const rollDisplay = av ? `[${rolls.join(',')}]→${r}` : undefined
    pushResult({ label, formula, sides, roll: r, modifier, boost, boostLabel, total, stat, flash: false, rollDisplay })
  }, [activeBoosts, statsAvantage, pushResult])

  // Jets rapides (section dés bruts, voir BARE_DICE) — plusieurs dés identiques d'un coup selon
  // nbDesInput, sans passer par roll() qui porte toute la mécanique avantage/boost/stat propre aux jets
  // de caractéristique, hors de propos ici (juste additionner N dés bruts).
  const rollQuick = useCallback((sides: number) => {
    const nb = Math.max(1, parseInt(nbDesInput, 10) || 1)
    const rolls = Array.from({ length: nb }, () => Math.floor(Math.random() * sides) + 1)
    const total = rolls.reduce((s, v) => s + v, 0)
    pushResult({
      label: `${nb}d${sides}`, formula: `${nb}d${sides}`, sides, roll: total, modifier: null, total,
      flash: false, rollDisplay: nb > 1 ? `[${rolls.join(',')}]` : undefined,
    })
    // Revient à vide (donc 1 dé par défaut) une fois le jet fait, plutôt que de garder le dernier nombre
    // saisi — évite de relancer 6d8 par mégarde en cliquant un autre bouton dé juste après.
    setNbDesInput('')
  }, [nbDesInput, pushResult])

  // Jet de dé DEPUIS la modale de mission (voir MissionModale) — la modale couvrant tout l'écran, le
  // joueur n'a plus accès aux boutons dés habituels du Mode de jeu en dessous tant qu'elle est ouverte ;
  // mêmes boutons/même calcul que rollQuick (dés bruts, nbDesInput partagé), mais le résultat est en
  // plus posté directement dans le dialogue de la mission au lieu de rester dans le seul panneau
  // Résultat — c'est la seule différence, aucune mécanique de résolution automatisée ajoutée.
  const lancerDeMission = useCallback((missionId: string, sides: number) => {
    const nb = Math.max(1, parseInt(nbDesInput, 10) || 1)
    const rolls = Array.from({ length: nb }, () => Math.floor(Math.random() * sides) + 1)
    const total = rolls.reduce((s, v) => s + v, 0)
    const formula = `${nb}d${sides}`
    const rollDisplay = nb > 1 ? `[${rolls.join(',')}]` : undefined
    pushResult({ label: formula, formula, sides, roll: total, modifier: null, total, flash: false, rollDisplay })
    reseau.envoyerMessageMission(missionId, `🎲 ${formula}${rollDisplay ? ` ${rollDisplay}` : ''} = ${total}`)
    setNbDesInput('')
  }, [nbDesInput, pushResult, reseau])

  const rollDmFormula = (dm: string): { formula: string; total: number; display: string } => {
    const statValues: Record<string, number> = {
      FOR: character.caracteristiques['FOR']?.mod ?? 0,
      DEX: character.caracteristiques['DEX']?.mod ?? 0,
      CON: character.caracteristiques['CON']?.mod ?? 0,
      INT: character.caracteristiques['INT']?.mod ?? 0,
      SAG: character.caracteristiques['SAG']?.mod ?? 0,
      CHA: character.caracteristiques['CHA']?.mod ?? 0,
    }
    // Retire les crochets englobant toute la formule : [1d4+Mod.FOR] → 1d4+Mod.FOR
    let resolved = dm.trim()
    if (resolved.startsWith('[') && resolved.endsWith(']') && !resolved.slice(1, -1).includes('[')) {
      resolved = resolved.slice(1, -1)
    }
    // Remplace toutes les variantes de token stat : [Mod.FOR], [Mod. FOR], Mod.FOR, Mod. FOR
    let bonusMod = 0
    resolved = resolved.replace(/\[?Mod\.?\s*(FOR|DEX|CON|INT|SAG|CHA)\]?/gi, (_, stat) => {
      bonusMod += statValues[stat.toUpperCase()] ?? 0
      return ''
    })
    resolved = resolved.replace(/\s/g, '').replace(/[+-]+$/, '').replace(/^\+/, '')
    const diceMatch = resolved.match(/(\d*)d(\d+)/i)
    if (!diceMatch) {
      const flat = (parseInt(resolved) || 0) + bonusMod
      return { formula: dm, total: flat, display: String(flat) }
    }
    const nb = Math.max(1, parseInt(diceMatch[1] || '1'))
    const sides = parseInt(diceMatch[2])
    const rolls = Array.from({ length: nb }, () => Math.floor(Math.random() * sides) + 1)
    const diceTotal = rolls.reduce((s, v) => s + v, 0)
    const afterDice = resolved.replace(diceMatch[0], '').replace(/^\+/, '')
    const extraMod = afterDice ? (parseInt(afterDice) || 0) : 0
    const total = diceTotal + extraMod + bonusMod
    const totalMod = extraMod + bonusMod
    const modStr = totalMod !== 0 ? (totalMod > 0 ? `+${totalMod}` : String(totalMod)) : ''
    const display = nb > 1 ? `[${rolls.join('+')}]=${diceTotal}${modStr}` : `${diceTotal}${modStr}`
    return { formula: dm, total, display }
  }

  const handleActionAttaque = (action: AvailableAction) => {
    if (action.cout_pm) {
      const { formula, total: cost, display } = rollDmFormula(action.cout_pm)
      pushHistory({ label: `${action.label} — ${t('gameMode.sufCoutPm')}`, formula, sides: 6, roll: cost, modifier: null, total: cost, rollDisplay: display, costType: 'PM', flash: false })
      payPMCost(cost, action.label)
    }
    const mod = action.attType === 'contact' ? attaques.contact : action.attType === 'distance' ? attaques.distance : action.attType === 'magique' ? attaques.magique : null
    const statKey = action.attType === 'contact' ? 'ATT_CONTACT' : action.attType === 'distance' ? 'ATT_DISTANCE' : action.attType === 'magique' ? 'ATT_MAGIQUE' : undefined
    const r = Math.floor(Math.random() * action.de) + 1
    const total = mod !== null ? r + mod : r
    const modStr = mod !== null ? (mod >= 0 ? `+${mod}` : String(mod)) : ''
    pushResult({ label: `⚔️ ${action.label} — ${t('gameMode.sufAtt')}`, formula: `1d${action.de}${modStr}`, sides: action.de, roll: r, modifier: mod, total, stat: statKey, flash: false })
  }

  const handleActionDegats = (action: AvailableAction) => {
    if (!peutAgir) return
    const base = rollDmFormula(action.dm)
    let total = base.total
    const displayParts = [base.display]
    const formulaParts = [base.formula]
    const contributingEffects: ContributingEffect[] = []
    for (const ab of activeDeDegats) {
      if (ab.deDegatsParArme) continue
      const bonus = rollDmFormula(ab.deDegats!)
      total += bonus.total
      displayParts.push(`+ ${bonus.display} (${ab.label})`)
      formulaParts.push(ab.deDegats!)
      contributingEffects.push(ab.temporaire
        ? { rangNom: ab.rangNom, temporaire: true }
        : { rangNom: ab.rangNom, voieNom: ab.voieNom, rangIdx: ab.rangIdx })
    }
    pushResult({ label: `💥 ${action.label} — ${t('gameMode.sufDm')}`, formula: formulaParts.join(' + '), sides: 6, roll: total, modifier: null, total, rollDisplay: displayParts.join(' '), flash: false, contributingEffects })
    envoyerDegatsReseau(total)
    consommerAction()
  }

  const handleRollBonusDice = (ab: AvailableBonus) => {
    if (!ab.deDegats || !peutAgir) return
    const { formula, total, display } = rollDmFormula(ab.deDegats)
    pushResult({ label: `💥 ${ab.label} — ${t('gameMode.sufDm')}`, formula, sides: 6, roll: total, modifier: null, total, rollDisplay: display, flash: false })
    envoyerDegatsReseau(total)
    consommerAction()
  }

  const stripExposants = (nom: string) => nom.replace(/[¹²³⁴⁵⁶⁷*]\s*/g, '').trim().toLowerCase()

  const findArmeEntry = (nomArme: string) => {
    const key = stripExposants(nomArme)
    for (const groupe of armes.groupes) {
      for (const cat of groupe.categories) {
        const entry = cat.entrees.find(e => stripExposants(e.nom) === key)
        if (entry) return entry
      }
    }
    return null
  }

  const getDeDegatsWeapon = (ab: AvailableBonus): string | undefined => {
    if (!ab.deDegatsParArme) return undefined
    const equipped = [character.arme1, character.arme2].filter(Boolean)
    if (equipped.length <= 1) return equipped[0]
    return deDegatsWeapon[boostKey(ab)]
  }

  const handleWeaponDegats = (nomArme: string, label: string, dmFallback: string) => {
    if (!peutAgir) return
    const entry = findArmeEntry(nomArme)
    const baseFormula = entry ? `${entry.dm} Mod.${entry.mod}` : dmFallback
    const base = rollDmFormula(baseFormula)
    let total = base.total
    const displayParts = [base.display]
    const formulaParts = [base.formula]
    const contributingEffects: ContributingEffect[] = []
    for (const ab of activeDeDegats) {
      if (ab.deDegatsParArme && getDeDegatsWeapon(ab) !== nomArme) continue
      const bonus = rollDmFormula(ab.deDegats!)
      total += bonus.total
      displayParts.push(`+ ${bonus.display} (${ab.label})`)
      formulaParts.push(ab.deDegats!)
      contributingEffects.push(ab.temporaire
        ? { rangNom: ab.rangNom, temporaire: true }
        : { rangNom: ab.rangNom, voieNom: ab.voieNom, rangIdx: ab.rangIdx })
    }
    // Bonus temporaire à valeur fixe (pas en dés, donc absent de activeDeDegats ci-dessus) ciblant
    // DM_ARME — ex. "Attaque flamboyante" (voie du charme rang 3, +Mod.CHA). Même consommation qu'un
    // bonus de jet classique (voir roll()) : retiré de activeBoosts une fois utilisé.
    const dmBoost = activeBoosts.find(b => b.stat === 'DM_ARME')
    if (dmBoost) {
      total += dmBoost.bonus
      displayParts.push(`+${dmBoost.bonus} (${dmBoost.label})`)
      formulaParts.push(String(dmBoost.bonus))
      setActiveBoosts(prev => prev.filter(b => b.id !== dmBoost.id))
    }
    pushResult({ label: `💥 ${label} — ${t('gameMode.sufDm')}`, formula: formulaParts.join(' + '), sides: 6, roll: total, modifier: null, total, rollDisplay: displayParts.join(' '), flash: false, contributingEffects })
    envoyerDegatsReseau(total)
    consommerAction()
  }

  const activateDuration = (ab: AvailableBonus, key: string) => {
    if (!ab.usage) return
    const { formula, total: duration, display } = rollDmFormula(ab.usage)
    if (/\d*d\d+/i.test(ab.usage)) {
      pushHistory({ label: `${ab.label} — ${t('gameMode.sufDuree')}`, formula, sides: 6, roll: duration, modifier: null, total: duration, rollDisplay: display, flash: false })
    }
    if (duration > 0) setEffectCounters(prev => ({ ...prev, [key]: duration }))
  }

  const handleActivateClick = (ab: AvailableBonus, idx: number) => {
    // Seules les capacités actives à coût en PM consomment le budget d'action du tour — un simple
    // basculement de bonus permanent/gratuit (pas de cout_pm) n'est pas une "action" au sens du tour.
    if (ab.cout_pm && !peutAgir) return
    const key = boostKey(ab)
    if (ab.cout_pv) {
      const cost = rollDiceStr(ab.cout_pv)
      const m = ab.cout_pv.match(/^(\d*)d(\d+)$/i)
      const sides = m ? parseInt(m[2]) : 4
      const entry: RollResult = { label: `${ab.label} — ${t('gameMode.sufCoutPv')}`, formula: ab.cout_pv, sides, roll: cost, modifier: null, total: cost, costType: 'PV', flash: false }
      if (ab.post_jet) {
        // Ne pas écraser le résultat principal, ajouter uniquement à l'historique
        pushHistory(entry)
      } else {
        pushResult(entry)
      }
      applyPVLoss(clampPvLoss(pvActuels - cost))
    }
    if (ab.cout_pm) {
      const { formula, total: cost, display } = rollDmFormula(ab.cout_pm)
      const entry: RollResult = { label: `${ab.label} — ${t('gameMode.sufCoutPm')}`, formula, sides: 6, roll: cost, modifier: null, total: cost, rollDisplay: display, costType: 'PM', flash: false }
      if (ab.post_jet) {
        pushHistory(entry)
      } else {
        pushResult(entry)
      }
      payPMCost(cost, ab.label)
      consommerAction()
    }
    activateDuration(ab, key)
    if (ab.coutCaracStat && ab.coutCaracValeur) {
      setActiveBoosts(prev => [
        ...prev,
        { id: nextId++, stat: ab.coutCaracStat!, bonus: -ab.coutCaracValeur!, label: `${ab.label} — ${t('gameMode.sufCout')}`, post_jet: false, sourceKey: key, nom: ab.rangNom, rang: ab.rangIdx + 1 },
      ])
    }
    if (ab.deDegats) {
      const equipped = [character.arme1, character.arme2].filter(Boolean)
      if (equipped.length === 1) setDeDegatsWeapon(prev => ({ ...prev, [key]: equipped[0] }))
    }
    if (ab.choix) {
      setPendingStatPick({ abIdx: idx })
    } else if (!ab.deDegats) {
      setActiveBoosts(prev => [
        ...prev,
        ...ab.cibles.map(s => ({ id: nextId++, stat: s, bonus: ab.bonus, label: ab.label, post_jet: ab.post_jet ?? false, cout_pv: ab.cout_pv, sourceKey: key, div2: ab.div2, immunite: ab.immunite, nom: ab.rangNom, rang: ab.rangIdx + 1 })),
      ])
    }
  }

  const handleStatPick = (ab: AvailableBonus, stat: string) => {
    setPendingStatPick(null)
    const key = boostKey(ab)
    setActiveBoosts(prev => [...prev, { id: nextId++, stat, bonus: ab.bonus, label: ab.label, post_jet: ab.post_jet ?? false, cout_pv: ab.cout_pv, sourceKey: key, div2: ab.div2, immunite: ab.immunite, nom: ab.rangNom, rang: ab.rangIdx + 1 }])
  }

  const applyPostJetBoost = useCallback((boost: ActiveBoost) => {
    setActiveBoosts(prev => prev.filter(b => b.id !== boost.id))
    setResult(prev => {
      if (!prev) return null
      const newTotal = prev.total + boost.bonus
      return { ...prev, boost: (prev.boost ?? 0) + boost.bonus, boostLabel: boost.label, total: newTotal }
    })
  }, [])

  const attaques = useMemo(() => computeAttaquesTotaux(character, descriptions, armes, armures), [character, descriptions, armes, armures])
  const effectsAll = useMemo(() => computeEffectsWithCristaux(character, descriptions), [character, descriptions])

  // Budget d'action par tour : 1 action de base + tout grant ACTIONS_SUPP accordé par une voie (ex.
  // capacité "2 attaques par tour", voir availableActionsSupp ci-dessus) — détecté automatiquement,
  // jamais une donnée figée en dur ici. Ne couvre que les actions offensives/actives (attaque, soin,
  // dépense de PM pour un bonus, Récupération) — les jets rapides et les jets de caractéristique simples
  // restent illimités.
  const budgetActions = 1 + availableActionsSupp.reduce((s, a) => s + a.nombre, 0)
  // Hors connexion (solo/déconnecté), seul le budget compte, comme avant l'ordre d'initiative — pas de
  // tableau d'ordre sans MJ pour l'arbitrer. Connecté, il faut EN PLUS que ce soit effectivement le tour
  // de ce PJ (reseau.estMonTour, calculé par le MJ — voir 'etat-ciblage' dans reseauProtocole.ts, le
  // joueur ne connaît jamais sa propre position dans l'ordre). actionsUtiliseesCeTour est remis à zéro
  // une fois par round par handleEndTurn (voir plus bas, déclenché par 'nouveau-tour') : comme chaque
  // entité ne joue qu'une fois par cycle complet de l'ordre et ne peut consommer son budget que pendant
  // SON tour (justement grâce à ce estMonTour), une remise à zéro par round suffit — inutile de la
  // resynchroniser une seconde fois au démarrage précis de chaque tour.
  const peutAgir = (!reseau.connecte || reseau.estMonTour) && actionsUtiliseesCeTour < budgetActions
  const consommerAction = () => setActionsUtiliseesCeTour(prev => prev + 1)

  // Compagnons ACTIFS du PJ (pas "laissés en arrière", voir estCompagnonActif — aucune limite de
  // nombre), résolus en stats numériques prêtes à être lancées (même fonction que côté MJ dans
  // CombatTab.tsx/compagnonsDe) — jusqu'ici invisibles du joueur, qui ne pouvait pas les faire agir
  // lui-même (le MJ devait jouer à sa place, signalé comme frustrant).
  const compagnonsActifsResolus = useMemo(() => {
    const noms = getCompagnonsOrdonnes(character, descriptions).filter(nom => estCompagnonActif(character, nom))
    return noms.flatMap(nom => {
      const creature = compagnonEnCreature(nom, compagnonsCatalogue, character, descriptions)
      return creature ? [{ nom, creature }] : []
    })
  }, [character, compagnonsCatalogue, descriptions])

  // Portrait du PJ pour la vue Combat en cartes (bureau, voir plus bas) : déjà en local
  // (character.portrait), aucun réseau nécessaire. Les portraits des compagnons, eux, sont résolus
  // individuellement par <CompagnonPortrait> (un par carte) — leur nombre n'est plus limité à 2 comme
  // avant, donc plus question d'appeler useImage un nombre fixe de fois ici (romprait les règles des
  // Hooks si on essayait de le faire dans une boucle).
  const pjImageSrc = useImage(character.portrait)

  // Verrou de tour du compagnon INDÉPENDANT de celui du PJ (voir compagnonsDejaAgiCeTour) : le compagnon
  // n'a pas de voies, donc pas de budget à calculer, juste une action par tour comme n'importe quelle
  // créature suivie côté MJ (voir estEnCours dans CombatCard.tsx). Le déclenchement de l'attaque, le jet
  // de dégâts ET la cible (voir compagnonsCibleChoisie/renderCompagnonCard) viennent tous du joueur.
  // Même logique que peutAgir pour le PJ lui-même : hors connexion, seul compagnonsDejaAgiCeTour compte
  // (pas de tableau d'ordre sans MJ) ; connecté, il faut EN PLUS que ce soit le tour de CE compagnon
  // précisément (reseau.compagnonsEtat[].estSonTour, calculé côté MJ).
  const compagnonPeutAgir = (nom: string) => {
    const estSonTour = reseau.compagnonsEtat.find(c => c.nom === nom)?.estSonTour ?? false
    return (!reseau.connecte || estSonTour) && !compagnonsDejaAgiCeTour[nom]
  }

  const handleCompagnonDegats = (nomCompagnon: string, attaque: { nom: string; dm?: string }) => {
    if (!attaque.dm || !compagnonPeutAgir(nomCompagnon)) return
    const { formula, total, display } = rollDmFormula(attaque.dm)
    pushResult({ label: `💥 ${nomCompagnon} — ${attaque.nom} — ${t('gameMode.sufDm')}`, formula, sides: 6, roll: total, modifier: null, total, rollDisplay: display, flash: false })
    envoyerDegatsReseau(total, nomCompagnon)
    setCompagnonsDejaAgiCeTour(prev => ({ ...prev, [nomCompagnon]: true }))
  }

  // Carte compagnon partagée entre la section mobile (compacte) et la colonne alliés du bureau (voir plus
  // bas) — évite de dupliquer la logique de ciblage/attaque à deux endroits. Le select de cible n'est
  // affiché que connecté (comme celui du PJ) : le ciblage compagnon suit exactement le même chemin réseau
  // ('cible-choisie-compagnon', voir useReseauClient.ts/CombatTab.tsx) que celui du PJ lui-même.
  const renderCompagnonCard = (nom: string, creature: (typeof compagnonsActifsResolus)[number]['creature']) => {
    const dejaAgi = !compagnonPeutAgir(nom)
    const cibleCompagnon = compagnonsCibleChoisie[nom] ?? ''
    // PV du compagnon, transmis par le MJ (voir 'etat-ciblage'.compagnons dans reseauProtocole.ts) —
    // sans ça, une créature qui blessait le compagnon restait invisible côté joueur (signalé par Didic).
    const etatPv = reseau.compagnonsEtat.find(c => c.nom === nom)
    return (
      <div key={nom} style={{ padding: '8px 10px', borderRadius: 5, background: 'rgba(140,100,255,0.08)', border: '1px solid rgba(160,120,255,0.35)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 6 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'rgba(200,170,255,0.95)' }}>🐾 {nom}</span>
          {etatPv && (
            <span style={{ fontSize: 13, fontWeight: 700, color: etatPv.pvActuels <= 0 ? '#ff5555' : 'rgba(200,170,255,0.9)', flexShrink: 0 }}>
              ❤️ {etatPv.pvActuels} / {etatPv.pvMax}
            </span>
          )}
        </div>
        {reseau.connecte && (
          <select
            value={cibleCompagnon}
            onChange={e => {
              setCompagnonsCibleChoisie(prev => ({ ...prev, [nom]: e.target.value }))
              reseau.envoyerCibleChoisieCompagnon(nom, e.target.value || null)
            }}
            style={{ width: '100%', boxSizing: 'border-box', padding: '4px 6px', borderRadius: 4, fontSize: 12, background: 'var(--tdr-dark)', border: '1px solid rgba(160,120,255,0.35)', color: PARCHMENT, outline: 'none', marginBottom: 6 }}
          >
            <option value="" style={{ background: 'var(--tdr-dark)', color: PARCHMENT }}>{t('gameMode.aucuneCibleChoisie')}</option>
            {reseau.ciblesDisponibles.map(c => (
              <option key={c.id} value={c.id} disabled={c.mort} style={{ background: 'var(--tdr-dark)', color: PARCHMENT }}>{c.nom}{c.mort ? ' 💀' : ''}</option>
            ))}
          </select>
        )}
        {reseau.connecte && etatPv?.estSonTour && (
          <button onClick={() => reseau.envoyerAttendreMonTour(nom)}
            style={{ width: '100%', marginBottom: 6, padding: '4px 6px', borderRadius: 4, fontSize: 12, cursor: 'pointer', fontWeight: 600, border: '1px solid rgba(160,120,255,0.4)', background: 'rgba(140,100,255,0.1)', color: 'rgba(200,170,255,0.9)' }}>
            ⏳ {t('gameMode.attendreButton')}
          </button>
        )}
        {creature.attaques && creature.attaques.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {creature.attaques.map((a, i) => (
              <button key={i} disabled={dejaAgi || isUnconscious} onClick={() => handleCompagnonDegats(nom, a)}
                title={dejaAgi ? t('gameMode.actionsEpuiseesTitle') : undefined}
                style={{ fontSize: 13, padding: '5px 8px', borderRadius: 4, cursor: (dejaAgi || isUnconscious) ? 'not-allowed' : 'pointer', fontWeight: 600, border: '1px solid rgba(160,120,255,0.5)', background: 'rgba(140,100,255,0.15)', color: 'rgba(200,170,255,0.9)', opacity: (dejaAgi || isUnconscious) ? 0.35 : 1, textAlign: 'left' }}>
                {a.nom}{a.bonus ? ` — ${t('gmMode.bataille.attaqueLabel')} ${a.bonus}` : ''}{a.dm ? ` — ${t('gmMode.bataille.dmLabel')} ${a.dm}` : ''}
              </button>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'rgba(245,236,215,0.4)' }}>{t('gameMode.compagnonSansAttaque')}</div>
        )}
      </div>
    )
  }

  // Carte illustrée (bureau uniquement, voir la section Combat plus bas) — même esprit visuel que
  // CombatCard repliée côté MJ (image en 2/3, nom dessous), mais jamais dépliable (demandé par Didic :
  // "plus visuel" sans reprendre le mécanisme d'expansion du MJ). Le portrait est résolu par
  // <CompagnonPortrait>, un composant à part entière (voir plus haut) — aucune limite de nombre.
  const renderCompagnonCardVisuelle = (nom: string, creature: (typeof compagnonsActifsResolus)[number]['creature']) => {
    const dejaAgi = !compagnonPeutAgir(nom)
    const cibleCompagnon = compagnonsCibleChoisie[nom] ?? ''
    // PV du compagnon, transmis par le MJ (voir 'etat-ciblage'.compagnons dans reseauProtocole.ts) —
    // sans ça, une créature qui blessait le compagnon restait invisible côté joueur (signalé par Didic).
    const etatPv = reseau.compagnonsEtat.find(c => c.nom === nom)
    const estMort = !!etatPv && etatPv.pvActuels <= 0
    return (
      <div key={nom} style={{ width: 138, flexShrink: 0, borderRadius: 8, overflow: 'hidden', background: 'rgba(15,12,8,0.95)', border: '1px solid rgba(160,120,255,0.35)' }}>
        <div style={{ width: '100%', aspectRatio: '2 / 3', background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
          <CompagnonPortrait image={creature.image} fit={creature.imageFit} />
          {estMort ? (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 32 }}>💀</span>
            </div>
          ) : dejaAgi && (
            // Sablier : a déjà agi ce tour (même signal que le grisé de CombatCard côté MJ) — le crâne
            // reste prioritaire si le compagnon est aussi mort (les deux ne se cumulent pas).
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 32 }}>⏳</span>
            </div>
          )}
        </div>
        <div style={{ padding: '6px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(200,170,255,0.95)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nom}</span>
            {etatPv && (
              <span style={{ fontSize: 11, fontWeight: 700, color: estMort ? '#ff5555' : 'rgba(200,170,255,0.9)', flexShrink: 0 }}>
                ❤️ {etatPv.pvActuels}/{etatPv.pvMax}
              </span>
            )}
          </div>
          {reseau.connecte && (
            <select
              value={cibleCompagnon}
              onChange={e => {
                setCompagnonsCibleChoisie(prev => ({ ...prev, [nom]: e.target.value }))
                reseau.envoyerCibleChoisieCompagnon(nom, e.target.value || null)
              }}
              style={{ width: '100%', boxSizing: 'border-box', padding: '3px 4px', borderRadius: 4, fontSize: 11, background: 'var(--tdr-dark)', border: '1px solid rgba(160,120,255,0.35)', color: PARCHMENT, outline: 'none', marginBottom: 4 }}
            >
              <option value="" style={{ background: 'var(--tdr-dark)', color: PARCHMENT }}>{t('gameMode.aucuneCibleChoisie')}</option>
              {reseau.ciblesDisponibles.map(c => (
                <option key={c.id} value={c.id} disabled={c.mort} style={{ background: 'var(--tdr-dark)', color: PARCHMENT }}>{c.nom}{c.mort ? ' 💀' : ''}</option>
              ))}
            </select>
          )}
          {reseau.connecte && etatPv?.estSonTour && (
            <button onClick={() => reseau.envoyerAttendreMonTour(nom)}
              style={{ width: '100%', marginBottom: 4, padding: '3px 4px', borderRadius: 4, fontSize: 11, cursor: 'pointer', fontWeight: 600, border: '1px solid rgba(160,120,255,0.4)', background: 'rgba(140,100,255,0.1)', color: 'rgba(200,170,255,0.9)' }}>
              ⏳ {t('gameMode.attendreButton')}
            </button>
          )}
          {creature.attaques && creature.attaques.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {creature.attaques.map((a, i) => (
                <button key={i} disabled={dejaAgi || isUnconscious} onClick={() => handleCompagnonDegats(nom, a)}
                  title={`${a.nom}${a.bonus ? ` — ${t('gmMode.bataille.attaqueLabel')} ${a.bonus}` : ''}${a.dm ? ` — ${t('gmMode.bataille.dmLabel')} ${a.dm}` : ''}${dejaAgi ? ` — ${t('gameMode.actionsEpuiseesTitle')}` : ''}`}
                  style={{ fontSize: 11, padding: '3px 5px', borderRadius: 4, cursor: (dejaAgi || isUnconscious) ? 'not-allowed' : 'pointer', fontWeight: 600, border: '1px solid rgba(160,120,255,0.5)', background: 'rgba(140,100,255,0.15)', color: 'rgba(200,170,255,0.9)', opacity: (dejaAgi || isUnconscious) ? 0.35 : 1, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {a.nom}
                </button>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: 'rgba(245,236,215,0.4)' }}>{t('gameMode.compagnonSansAttaque')}</div>
          )}
        </div>
      </div>
    )
  }

  const panelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', background: BG }

  const btnStyle = (active?: boolean): React.CSSProperties => ({
    padding: '6px 10px', borderRadius: 4, fontSize: 14, cursor: 'pointer', fontWeight: 600,
    border: `1px solid ${active ? GOLD : 'rgba(201,168,76,0.35)'}`,
    background: active ? 'rgba(201,168,76,0.15)' : 'rgba(0,0,0,0.3)',
    color: active ? GOLD : `rgba(245,236,215,0.7)`,
    textAlign: 'center' as const, whiteSpace: 'nowrap' as const,
  })

  // Tooltip au même design que celui de la fiche de personnage (fond sombre, bordure dorée), positionné
  // au-dessus de l'élément survolé plutôt que via le tooltip natif du navigateur — sauf si l'élément est trop
  // proche du haut de la fenêtre (ex. pastilles de dégâts sur la durée sur la carte PV), auquel cas on bascule
  // l'affichage en dessous pour éviter qu'il soit tronqué.
  const showGmTooltip = (e: React.MouseEvent, title: string, desc?: string) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const below = rect.top < 80
    setGmTooltip({ title, desc, x: rect.left + rect.width / 2, y: below ? rect.bottom : rect.top, below })
  }
  const hideGmTooltip = () => setGmTooltip(null)

  // Sur mobile/tactile, le tap déclenche onMouseEnter (affiche le tooltip) mais jamais onMouseLeave
  // (pas de vrai pointeur qui "quitte" l'élément), donc le tooltip reste bloqué à l'écran après l'action.
  useEffect(() => {
    document.addEventListener('touchend', hideGmTooltip)
    return () => document.removeEventListener('touchend', hideGmTooltip)
  }, [])

  const pvFromVoies = sumStat(effectsAll['PV'] ?? [])
  // Réplique le calcul de la fiche de personnage (CharacterSheetRecto) : base niveau 1 (snapshot ou dé de vie + Mod.CON) + historique de montées de niveau
  const deVieFaces = character.famille === 'combattants' ? 10 : character.famille === 'aventuriers' ? 8 : 6
  let pvBase = character.niveau1Base ? character.niveau1Base.pvTotal : deVieFaces + character.caracteristiques.CON.mod
  for (const e of character.pvHistorique ?? []) pvBase += e.total
  const pvTotalEffectif = pvBase + pvFromVoies
  // Mod. effectif d'une carac (base + bonus de voies/cristaux)
  const effectiveMod = (stat: Caracteristique): number => {
    const bonus = sumStat(effectsAll[stat] ?? [])
    return bonus === 0 ? character.caracteristiques[stat].mod : getMod(character.caracteristiques[stat].valeur + bonus)
  }
  // Détail des sources qui contribuent au score/mod affiché sur les boutons de Caractéristiques (pour le tooltip) :
  // les bonus de score permanents (Effects, ajoutés avant conversion en mod) et les bonus permanents de Mod (Bonus temporaire non-temporaire).
  const modSourcesPourStat = (stat: string): { nom: string; rang: number; value: number }[] => {
    const sources: { nom: string; rang: number; value: number }[] = []
    for (const c of effectsAll[stat] ?? []) sources.push({ nom: c.nom, rang: c.rang, value: c.value })
    for (const ab of availableBonuses) {
      if (ab.temporaire || !ab.cibles.includes(stat)) continue
      sources.push({ nom: ab.rangNom, rang: ab.rangIdx + 1, value: ab.bonus })
    }
    return sources
  }
  const pmFromVoies = sumStat(effectsAll['PM'] ?? [])
  // PM = Niveau + Mod.SAG (doublé pour les mystiques), recalculé en direct plutôt que de se fier à character.pm figé
  const pmBaseNiveau = character.niveau + effectiveMod('SAG')
  const pmNiveau = Math.max(0, character.famille === 'mystiques' ? 2 * pmBaseNiveau : pmBaseNiveau)
  const pmTotalEffectif = pmNiveau + pmFromVoies
  // Réduction des dégâts (RD) accordée par certaines voies — appliquée automatiquement sur les DM encaissés.
  // Additionne la RD permanente (Effects) et la RD des bonus temporaires actuellement activés (Effets en jeu),
  // tant que leur compteur de tours n'est pas retombé à 0 — pas seulement "au prochain jet". On garde le détail
  // (nom de la capacité + rang + éventuels flags "div2"/"immunite") pour pouvoir l'expliquer dans le tooltip.
  // Note : les bonus temporaires (choix ou non) finissent tous dans activeBoosts (cf. handleActivateClick /
  // handleStatPick) — ne parcourir que ce tableau évite de compter deux fois la même activation.
  type RdSource = { nom: string; rang: number; value: number; div2?: boolean; immunite?: boolean }
  const rdSourcesPourStat = (statKey: string): RdSource[] => {
    const sources: RdSource[] = []
    for (const c of effectsAll[statKey] ?? []) sources.push({ nom: c.nom, rang: c.rang, value: c.value, div2: c.div2, immunite: c.immunite })
    for (const boost of activeBoosts) {
      if (boost.stat !== statKey || !boost.sourceKey) continue
      // Un compteur absent (pas de "usage" renseigné sur le grant) signifie "actif tant qu'il n'est pas retiré
      // manuellement", pas "expiré" — ne l'exclure que si un compteur existe ET est retombé à 0.
      const compteur = effectCounters[boost.sourceKey]
      if (compteur !== undefined && compteur <= 0) continue
      sources.push({ nom: boost.nom, rang: boost.rang, value: boost.bonus, div2: boost.div2, immunite: boost.immunite })
    }
    return sources
  }
  // RD générique (s'applique à tous les types) + RD spécifique au type de dégâts, si renseigné
  const combinedRdSourcesPourType = (typeKey: string) => [...rdSourcesPourStat('RD'), ...(typeKey ? rdSourcesPourStat(`RD_${typeKey}`) : [])]
  const rdEffectifPourType = (typeKey: string): number => combinedRdSourcesPourType(typeKey).filter(s => !s.div2 && !s.immunite).reduce((s, c) => s + c.value, 0)
  const rdSourcesPourType = (typeKey: string) => combinedRdSourcesPourType(typeKey).filter(s => !s.div2 && !s.immunite)
  // Une source RD/RD_<TYPE> peut être marquée "div2" (résistance) : elle divise par 2 les DM au lieu de les
  // réduire à points fixes. Ne se cumule pas (une seule division, peu importe le nombre de sources actives)
  // et s'applique avant la RD à points fixes.
  const halfDamageSourcesPourType = (typeKey: string) => combinedRdSourcesPourType(typeKey).filter(s => s.div2 && !s.immunite)
  const isHalfDamage = (typeKey: string): boolean => halfDamageSourcesPourType(typeKey).length > 0
  // Une source marquée "immunite" ramène les DM correspondants à 0, prioritaire sur div2 et la RD à points fixes
  const immuniteSourcesPourType = (typeKey: string) => combinedRdSourcesPourType(typeKey).filter(s => s.immunite)
  const isImmune = (typeKey: string): boolean => immuniteSourcesPourType(typeKey).length > 0
  // DEF effective, live comme sur la fiche (10 + Mod.DEX + armure + bouclier + bonus manuel), mais en tenant compte
  // en plus des bonus temporaires actuellement actifs (Effets en jeu) — pas juste des effets permanents.
  const isBouclier = (nom: string) => nom.toLowerCase().includes('bouclier')
  const armorDef = character.armuresEquipees.filter(a => !isBouclier(a.nom) && a.equipe).reduce((s, a) => s + a.def, 0)
  const shieldDef = character.armuresEquipees.filter(a => isBouclier(a.nom) && a.equipe).reduce((s, a) => s + a.def, 0)
  const defSourcesTemporaireEtEffects = rdSourcesPourStat('DEF')
  const defBonusVoies = defSourcesTemporaireEtEffects.reduce((s, c) => s + c.value, 0) + (permanentBonusByStat.get('DEF') ?? 0)
  const defTotalEffectif = 10 + effectiveMod('DEX') + armorDef + shieldDef + (character.bonusDefense ?? 0) + defBonusVoies
  const defSources = [
    ...defSourcesTemporaireEtEffects,
    ...availableBonuses.filter(ab => !ab.temporaire && ab.cibles.includes('DEF')).map(ab => ({ nom: ab.rangNom, rang: ab.rangIdx + 1, value: ab.bonus })),
  ]
  // currentPV/currentPM sont null au premier render → on initialise au max effectif
  const pvActuels = currentPV ?? pvTotalEffectif
  const pvPct = pvTotalEffectif > 0 ? pvActuels / pvTotalEffectif : 0
  const pvColor = pvPct > 0.5 ? '#5cb85c' : pvPct > 0.25 ? '#e8a838' : '#d9534f'
  // Voie culturelle des Ogres rang 4 "Intuable" : possibilité de résister à l'inconscience à 0 PV
  const hasOgreResilience = character.voieCulturelle.nom === 'Voie culturelle des Ogres' && character.voieCulturelle.rangs[3] === true
  const conValeur = character.caracteristiques.CON.valeur
  const isResisting = hasOgreResilience && ogreResisting
  const isDead = isResisting && pvActuels <= -conValeur
  const isUnconscious = isDead || (pvActuels <= 0 && !isResisting)
  const isPvFull = pvActuels >= pvTotalEffectif
  const pmActuels = currentPM ?? pmTotalEffectif
  // Sous 0 PV, un PJ "Intuable" ne peut pas descendre plus bas que -CON (au-delà, il meurt)
  const clampPvLoss = (newPV: number) => isResisting ? Math.max(-conValeur, newPV) : Math.max(0, newPV)

  // Paie un coût en PM ; si les PM sont insuffisants, la différence est infligée en PV (brûlure de mana)
  // Applique une nouvelle valeur de PV et journalise le passage à l'inconscience (PV à 0) ou à la mort (Intuable)
  const applyPVLoss = (newPV: number) => {
    const wasConscious = pvActuels > 0
    const wasAlive = !isDead
    setCurrentPV(newPV)
    onChange({ pvRestants: newPV })
    envoyerPvReseau(newPV)
    if (wasAlive && isResisting && newPV <= -conValeur) {
      pushHistory({ label: t('gameMode.deathHistoryLabel'), formula: t('gameMode.pvZero'), sides: 6, roll: 0, modifier: null, total: 0, costType: 'PV', flash: false })
    } else if (wasConscious && newPV <= 0 && !isResisting) {
      pushHistory({ label: t('gameMode.unconsciousHistoryLabel'), formula: t('gameMode.pvZero'), sides: 6, roll: 0, modifier: null, total: 0, costType: 'PV', flash: false })
    }
  }

  // Applique un soin : augmente les PV (jamais au-delà du max) ; bloqué sous 0 PV sauf via la Récupération (1 PR),
  // et impossible sur un PJ mort (Intuable au-delà de -CON)
  const applyHeal = (amount: number, label: string, formula?: string, rollDisplay?: string, costType: 'PV' | 'PR' = 'PV') => {
    if (!Number.isFinite(amount) || amount <= 0) return
    if (isDead) return
    if (pvActuels < 0 && costType !== 'PR') return
    const newPV = Math.min(pvTotalEffectif, pvActuels + amount)
    const healed = newPV - pvActuels
    setCurrentPV(newPV)
    onChange({ pvRestants: newPV })
    envoyerPvReseau(newPV)
    if (newPV > 0) setOgreResisting(false)
    pushHistory({ label, formula: formula ?? `+${healed} ${t('gameMode.pv')}`, sides: 6, roll: healed, modifier: null, total: healed, costType, rollDisplay, flash: false })
  }

  const handleManualHeal = () => {
    if (!peutAgir) return
    const amount = parseInt(healInput, 10)
    // Montant absent/invalide : plutôt que de ne rien faire silencieusement, envoie le curseur dans le
    // champ pour saisir directement — Entrée y revalide ensuite ce même handler (voir onKeyDown ci-dessous).
    if (!Number.isFinite(amount) || amount <= 0) {
      healInputRef.current?.focus()
      return
    }
    applyHeal(amount, t('gameMode.healHistoryLabel'))
    setHealInput('')
    consommerAction()
  }

  // 1 PR dépensé = [1 dé de vie + Mod.CON + Niveau] PV récupérés (indisponible si inconscient)
  // prUtilises[idx] === true signifie que le PR est disponible (non dépensé) — cf. CreationWizard qui
  // initialise `Array(pr).fill(true)` pour un personnage neuf, donc "PR à fond" = tout à true.
  const prMax = character.pr || 5
  const prUtilisesActuels = character.prUtilises ?? []
  const prRemaining = prUtilisesActuels.slice(0, prMax).filter(Boolean).length

  const handleRecuperation = () => {
    if (!peutAgir || isUnconscious || prRemaining <= 0) return
    const idx = prUtilisesActuels.findIndex((available, i) => i < prMax && available)
    if (idx === -1) return
    const next = [...prUtilisesActuels]
    next[idx] = false
    onChange({ prUtilises: next })
    const dieRoll = Math.floor(Math.random() * deVieFaces) + 1
    const conMod = effectiveMod('CON')
    const total = Math.max(0, dieRoll + conMod + character.niveau)
    const modStr = conMod >= 0 ? `+${conMod}` : `${conMod}`
    applyHeal(total, t('gameMode.recuperationHistoryLabel'), `1d${deVieFaces}${modStr}+${character.niveau}`, `[${dieRoll}]`, 'PR')
    consommerAction()
  }

  // Applique des DM reçus du type choisi : immunité totale en priorité, sinon division par 2 si applicable,
  // puis déduction de la RD (générique + spécifique au type) avant de retirer les PV. Factorisé pour être
  // réutilisé aussi bien par la saisie manuelle (handleTakeDamage) que par le tic automatique des dégâts sur
  // la durée (handleEndTurn), qui doivent appliquer exactement la même résolution RD/div2/immunité.
  const computeIncomingDamage = (type: string, amount: number) => {
    if (isImmune(type)) return { net: 0, apresDivision: amount, halved: false, rd: 0, immune: true }
    const halved = isHalfDamage(type)
    const apresDivision = halved ? Math.floor(amount / 2) : amount
    const rd = rdEffectifPourType(type)
    const net = Math.max(0, apresDivision - rd)
    return { net, apresDivision, halved, rd, immune: false }
  }
  const formatDamageFormula = (amount: number, calc: ReturnType<typeof computeIncomingDamage>) => {
    if (calc.immune) return `${amount} ${t('gameMode.sufImmunite')}`
    const parts = [String(amount)]
    if (calc.halved) parts.push(`÷2 = ${calc.apresDivision}`)
    if (calc.rd > 0) parts.push(`− ${calc.rd} ${t('gameMode.sufRD')}`)
    return parts.length > 1 ? parts.join(' ') : `${amount} ${t('gameMode.pv')}`
  }

  // Factorisé pour être appelé aussi bien par la saisie manuelle (handleTakeDamage) que par la réception
  // réseau d'une attaque du MJ (voir gererDegatsRecusRef juste après) — même résolution
  // immunité/RD/division, seul le label affiché diffère selon l'origine.
  const appliquerDegats = (type: string, amount: number, label?: string) => {
    if (!Number.isFinite(amount) || amount <= 0) return
    const resolvedLabel = label ?? (type ? `${t('gameMode.damageTakenHistoryLabel')} (${t(`gameMode.dmType${type}`)})` : t('gameMode.damageTakenHistoryLabel'))
    const calc = computeIncomingDamage(type, amount)
    pushHistory({ label: resolvedLabel, formula: formatDamageFormula(amount, calc), sides: 6, roll: calc.net, modifier: null, total: calc.net, costType: 'PV', flash: false })
    if (!calc.immune) applyPVLoss(clampPvLoss(pvActuels - calc.net))
  }

  const handleTakeDamage = (type: string) => {
    appliquerDegats(type, parseInt(dmInput, 10))
    setDmInput('')
  }

  // Enregistre un effet de dégâts sur la durée (poison, brûlure, ...) : X dégâts du type choisi, encaissés
  // automatiquement à chaque fin de tour (handleEndTurn) pendant N tours, puis retiré de lui-même.
  const handleAddDot = () => {
    const amount = parseInt(dotAmountInput, 10)
    const duration = parseInt(dotDurationInput, 10)
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(duration) || duration <= 0) return
    const type = dotTypeInput
    const typeLabel = type ? t(`gameMode.dmType${type}`) : t('gameMode.dmTypeGenerique')
    const label = `${t('gameMode.dotTickHistoryLabel')} (${typeLabel})`
    setActiveDots(prev => [...prev, { id: nextId++, type, amount, remainingTurns: duration, label }])
    pushHistory({
      label: t('gameMode.dotAddedHistoryLabel', { type: typeLabel }),
      formula: `${amount} ${t('gameMode.pv')} / ${t('gameMode.turn', { count: duration })}`,
      sides: 6, roll: 0, modifier: null, total: 0, flash: false,
    })
    setDotAmountInput('')
    setDotDurationInput('')
  }

  // Décompte les tours d'effets temporaires (Effets en jeu) ET applique le tic de chaque dégât sur la durée
  // actif (immunité/div2/RD résolus comme pour un dégât encaissé manuellement), en une seule perte de PV
  // groupée pour rester cohérent même avec plusieurs DoT actifs simultanément (poison + brûlure, etc.).
  const handleEndTurn = () => {
    setEffectCounters(prev => {
      const next: Record<string, number> = {}
      const expiredKeys: string[] = []
      for (const [key, val] of Object.entries(prev)) {
        const newVal = Math.max(0, val - 1)
        next[key] = newVal
        if (val > 0 && newVal === 0) expiredKeys.push(key)
      }
      if (expiredKeys.length > 0) {
        setActiveBoosts(prevBoosts => prevBoosts.filter(b => !b.sourceKey || !expiredKeys.includes(b.sourceKey)))
      }
      return next
    })
    if (!isDead && activeDots.length > 0) {
      let totalNet = 0
      for (const dot of activeDots) {
        const calc = computeIncomingDamage(dot.type, dot.amount)
        pushHistory({ label: dot.label, formula: formatDamageFormula(dot.amount, calc), sides: 6, roll: calc.net, modifier: null, total: calc.net, costType: 'PV', flash: false })
        totalNet += calc.net
      }
      if (totalNet > 0) applyPVLoss(clampPvLoss(pvActuels - totalNet))
    }
    setActiveDots(prev => prev
      .map(d => ({ ...d, remainingTurns: d.remainingTurns - 1 }))
      .filter(d => d.remainingTurns > 0))
    setActionsUtiliseesCeTour(0)
    setCompagnonsDejaAgiCeTour({})
  }

  // Réception réseau d'une attaque du MJ (voir handleAttaque dans CombatTab.tsx et reseauProtocole.ts),
  // invoquée directement depuis le callback onmessage du socket (voir useReseauClient) — pas de state+
  // effet intermédiaire, qui ne ferait qu'appeler ces mêmes setState en réaction à un changement d'état.
  // toucheRate=true veut dire une attaque ratée : rien à appliquer, juste une ligne d'historique.
  // montant est le dégât BRUT (voir resoudreAttaque dans combat.ts — la RD n'est plus résolue côté MJ
  // pour une cible PJ, justement pour n'être appliquée qu'une fois, ici) : on repasse par
  // appliquerDegats/computeIncomingDamage, exactement comme la saisie manuelle (handleTakeDamage), pour
  // que réseau et hors-ligne appliquent la RD au même endroit et de la même façon.
  useEffect(() => {
    gererDegatsRecusRef.current = ({ montant, typeDegats, toucheRate }) => {
      if (toucheRate) {
        pushHistory({ label: t('gameMode.reseau.attaqueRateeLabel'), formula: t('gameMode.reseau.attaqueRateeFormule'), sides: 6, roll: 0, modifier: null, total: 0, costType: 'PV', flash: false })
        return
      }
      appliquerDegats(typeDegats, montant, t('gameMode.reseau.degatsRecusLabel'))
    }
  })
  // Réception réseau du message 'nouveau-tour' (bouton "Tour suivant" du MJ, voir CombatTab.tsx) —
  // déclenche exactement la même logique que le bouton "Tour suivant" local (tick DoT/effets temporaires
  // ET remise à zéro du budget d'action, voir handleEndTurn juste au-dessus).
  useEffect(() => {
    gererNouveauTourRecuRef.current = handleEndTurn
  })
  // Réception réseau d'une nouvelle valeur de PV fixée par le MJ à la main (voir 'pv-actualises' dans
  // reseauProtocole.ts) — appliquée directement, PAS via applyPVLoss/applyHeal (qui émettraient ce même
  // message en retour vers le MJ, créant un aller-retour inutile).
  useEffect(() => {
    gererPvActualisesRecuRef.current = pv => {
      setCurrentPV(pv)
      onChange({ pvRestants: pv })
      if (pv > 0) setOgreResisting(false)
      pushHistory({ label: t('gameMode.reseau.pvActualisesHistoryLabel'), formula: t('gameMode.reseau.pvActualisesFormule', { pv }), sides: 6, roll: 0, modifier: null, total: 0, costType: 'PV', flash: false })
    }
    // Les trois refs (dégâts + nouveau-tour + PV) sont renseignées à ce stade (les effets précédents
    // tournent d'abord dans le même commit) — rejoue tout ce qui s'est accumulé pendant que ce composant
    // était démonté.
    drainerReseauEnAttente()
  })
  // Ce composant peut se démonter (le joueur consulte les Notes) alors que la connexion, elle, survit
  // (voir la note sur reseau dans Props) — remet les refs à null pour qu'App.tsx mette en attente tout
  // dégât/PV/nouveau-tour reçu pendant l'absence plutôt que d'appeler une closure devenue obsolète ;
  // rejoués dès que ce composant se remonte (les useEffect ci-dessus renseignent alors les refs à nouveau).
  useEffect(() => () => {
    gererDegatsRecusRef.current = null
    gererNouveauTourRecuRef.current = null
    gererPvActualisesRecuRef.current = null
  }, [gererDegatsRecusRef, gererNouveauTourRecuRef, gererPvActualisesRecuRef])

  const payPMCost = (cost: number, label: string) => {
    const pmSpent = Math.min(cost, pmActuels)
    const deficit = cost - pmSpent
    const newPM = pmActuels - pmSpent
    setCurrentPM(newPM)
    onChange({ pmRestants: newPM })
    if (deficit > 0) {
      pushHistory({ label: `${label} — ${t('gameMode.sufBruleMana')}`, formula: `${deficit} ${t('gameMode.pv')}`, sides: 6, roll: deficit, modifier: null, total: deficit, costType: 'PV', flash: false })
      applyPVLoss(clampPvLoss(pvActuels - deficit))
    }
  }

  const parseFlatCost = (cost: string): number | null => {
    const n = Number(cost)
    return Number.isFinite(n) ? n : null
  }

  const formatUsage = (usage: string) => {
    const n = Number(usage)
    return Number.isFinite(n) && usage.trim() !== '' ? t('gameMode.turn', { count: n }) : usage
  }

  const formatFormula = (formula: string) => `Mod.${formula.replace(/^MOD_/, '')}`
  // Pour un bonus RD/RD_<TYPE> marqué "immunite" ou "div2", il n'y a pas de valeur chiffrée à afficher (le +0 par
  // défaut n'a aucun sens) — on affiche plutôt ce que l'activation représente concrètement.
  const formatBonusLabel = (ab: AvailableBonus) => {
    if (ab.immunite) return t('gameMode.sufImmunite')
    if (ab.div2) return t('gameMode.sufDiv2')
    const signedBonus = `${ab.bonus >= 0 ? '+' : ''}${ab.bonus}`
    return ab.formula ? `${formatFormula(ab.formula)} (${signedBonus})` : signedBonus
  }

  const postJetBoosts = result?.stat ? activeBoosts.filter(b => b.stat === result.stat && b.post_jet) : []

  return (
    <div style={panelStyle}>
      {/* Image envoyée par le MJ (voir 'image-mj') : révélation plein écran automatique à la réception
          (imageAffichee, mis à jour depuis useReseauClient) — clic sur le fond ou ✕ pour fermer, la ligne
          de journal correspondante permet de la rouvrir ensuite (voir reseau.ouvrirImage ci-dessous). */}
      {reseau.imageAffichee && (
        <div onClick={reseau.fermerImage} style={{
          position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.9)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}>
          <img src={reseau.imageAffichee} alt="" style={{
            maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain',
            boxShadow: '0 8px 40px rgba(0,0,0,0.8)', cursor: 'default',
          }} onClick={e => e.stopPropagation()} />
          <button onClick={reseau.fermerImage} title={t('gameMode.reseau.fermerImageTitle')} style={{
            position: 'fixed', top: 16, right: 20, background: 'rgba(0,0,0,0.5)', border: `1px solid ${SECTION_BORDER}`,
            color: PARCHMENT, cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '6px 10px', borderRadius: 4,
          }}>✕</button>
        </div>
      )}
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: `1px solid ${SECTION_BORDER}`, flexShrink: 0, gap: 8, position: 'relative' }}>
        {/* Dernier événement réseau, affiché ici tant que le panneau réseau est fermé — permet de le lire
            sans l'ouvrir (sur petit écran, le panneau ouvert empiète sur les jauges PV/PM juste en
            dessous). Reste affiché jusqu'au suivant (reseau.journal[0], le plus récent en tête — voir
            ajouterJournal dans useReseauClient) : aucune disparition automatique. Le panneau ouvert montre
            déjà tout l'historique, donc le titre normal reprend sa place. */}
        {!reseauPanelOuvert && reseau.journal.length > 0 ? (
          <span title={reseau.journal[0].texte} style={{
            fontSize: 12, fontFamily: 'monospace', flex: 1, minWidth: 0, overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            color: reseau.journal[0].categorie ? COULEUR_JOURNAL[reseau.journal[0].categorie] : 'rgba(245,236,215,0.8)',
          }}>{reseau.journal[0].texte}</span>
        ) : (
          <span style={{ fontSize: 17, fontWeight: 700, color: GOLD, flex: 1, fontFamily: "'Cinzel', serif" }}>{t('gameMode.title')}</span>
        )}
        {/* Pulsation du point rouge ci-dessous — message privé du MJ non lu (voir messageNonLu) */}
        {reseau.messageNonLu && (
          <style>{'@keyframes tda-reseau-pulse{0%,100%{box-shadow:0 0 0 0 rgba(255,90,90,0.55)}50%{box-shadow:0 0 0 5px rgba(255,90,90,0)}}'}</style>
        )}
        <button onClick={() => setReseauPanelOuvert(o => !o)} title={t('gameMode.reseau.titre')}
          style={{
            background: reseau.connecte ? 'rgba(120,220,140,0.15)' : 'transparent',
            border: `1px solid ${reseau.connecte ? 'rgba(120,220,140,0.4)' : 'transparent'}`,
            borderRadius: 4, color: reseau.connecte ? 'rgba(120,220,140,0.95)' : 'rgba(245,236,215,0.5)',
            cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '4px 6px', position: 'relative',
          }}>
          🌐
          {/* Point rouge : message privé du MJ non lu, visible même panneau fermé (voir messageNonLu) */}
          {reseau.messageNonLu && (
            <span style={{
              position: 'absolute', top: 2, right: 2, width: 7, height: 7, borderRadius: 4,
              background: 'rgba(255,90,90,0.95)', animation: 'tda-reseau-pulse 1.6s ease-in-out infinite',
            }} />
          )}
        </button>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: `rgba(245,236,215,0.5)`, cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 4px' }}>✕</button>

        {reseauPanelOuvert && (
          <div style={{
            position: 'absolute', top: '100%', right: 8, zIndex: 40, width: 260,
            background: BG, border: `1px solid ${SECTION_BORDER}`, borderRadius: 6,
            boxShadow: '0 6px 20px rgba(0,0,0,0.5)', padding: 12,
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, fontSize: 12, fontWeight: 700, color: GOLD, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {t('gameMode.reseau.titre')} — {reseau.connecte ? t('gameMode.reseau.connecte') : t('gameMode.reseau.deconnecte')}
              </div>
              <button onClick={() => setReseauPanelOuvert(false)} style={{ background: 'transparent', border: 'none', color: 'rgba(245,236,215,0.5)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '0 2px', flexShrink: 0 }}>✕</button>
            </div>

            {!reseau.connecte ? (
              <>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    value={reseauCode}
                    onChange={e => setReseauCode(e.target.value)}
                    placeholder={t('gameMode.reseau.codePlaceholder')}
                    disabled={reseauRecherche}
                    style={{ flex: 1, minWidth: 0, padding: '5px 8px', borderRadius: 4, border: `1px solid ${SECTION_BORDER}`, background: 'rgba(0,0,0,0.25)', color: PARCHMENT, fontSize: 12, letterSpacing: '0.1em' }}
                  />
                  <button onClick={rechercherEtConnecter} disabled={reseauRecherche} style={{
                    padding: '5px 10px', borderRadius: 4, cursor: reseauRecherche ? 'default' : 'pointer', fontSize: 12,
                    border: `1px solid ${SECTION_BORDER}`, background: 'rgba(201,168,76,0.12)', color: GOLD, opacity: reseauRecherche ? 0.6 : 1,
                  }}>
                    {reseauRecherche ? t('gameMode.reseau.recherche') : t('gameMode.reseau.rechercher')}
                  </button>
                </div>
                {reseauIntrouvable && (
                  <div style={{ fontSize: 11, color: 'rgba(255,150,150,0.9)' }}>{t('gameMode.reseau.introuvable')}</div>
                )}

                {!reseauManuelOuvert ? (
                  <button onClick={() => setReseauManuelOuvert(true)} style={{
                    background: 'transparent', border: 'none', color: 'rgba(245,236,215,0.4)',
                    cursor: 'pointer', fontSize: 11, textDecoration: 'underline', alignSelf: 'flex-start', padding: 0,
                  }}>
                    {t('gameMode.reseau.manuelLien')}
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      value={reseauIp}
                      onChange={e => setReseauIp(e.target.value)}
                      placeholder={t('gameMode.reseau.ipPlaceholder')}
                      style={{ flex: 1, minWidth: 0, padding: '5px 8px', borderRadius: 4, border: `1px solid ${SECTION_BORDER}`, background: 'rgba(0,0,0,0.25)', color: PARCHMENT, fontSize: 12 }}
                    />
                    <button onClick={() => { if (reseauIp.trim()) reseau.connecter(reseauIp.trim(), character) }} style={{
                      padding: '5px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12,
                      border: `1px solid ${SECTION_BORDER}`, background: 'rgba(201,168,76,0.12)', color: GOLD,
                    }}>
                      {t('gameMode.reseau.connecter')}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Les dégâts infligés via le Mode de jeu (handleActionDegats/handleWeaponDegats/
                    handleRollBonusDice) sont désormais transmis au MJ automatiquement, sans action du
                    joueur — voir envoyerDegatsReseau. Ce panneau ne garde qu'un repère visuel. */}
                <div style={{ fontSize: 11, color: 'rgba(120,220,140,0.85)' }}>
                  {t('gameMode.reseau.envoiAutomatique')}
                </div>

                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    value={reseauMessage}
                    onChange={e => setReseauMessage(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') envoyerMessageChat() }}
                    placeholder={t('gameMode.reseau.envoyerPlaceholder')}
                    style={{ flex: 1, minWidth: 0, padding: '5px 8px', borderRadius: 4, border: `1px solid ${SECTION_BORDER}`, background: 'rgba(0,0,0,0.25)', color: PARCHMENT, fontSize: 12 }}
                  />
                  <button onClick={envoyerMessageChat} style={{
                    padding: '5px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12,
                    border: `1px solid ${SECTION_BORDER}`, background: 'rgba(201,168,76,0.12)', color: GOLD,
                  }}>
                    {t('gameMode.reseau.envoyer')}
                  </button>
                </div>
                {/* Dialogue entre PJ (voir envoyerMessagePJ) — relayé par le MJ au destinataire choisi
                    ci-dessous, ou à tous les autres joueurs tant qu'aucun n'est précisé (option "Tous les
                    joueurs", sélectionnée par défaut) ; distinct du champ ci-dessus qui s'adresse au MJ.
                    reseau.rosterPJ (voir useReseauClient.ts) liste les autres PJ actuellement connectés. */}
                {reseau.rosterPJ.length === 0 ? (
                  <div style={{ fontSize: 11, color: 'rgba(245,236,215,0.4)' }}>
                    {t('gameMode.reseau.dialoguePJAucunAutreJoueur')}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <select
                      value={dialoguePJCible}
                      onChange={e => setDialoguePJCible(e.target.value)}
                      // Fond opaque, pas rgba : voir la note sur le <select> des dégâts sur la durée
                      // plus bas — même correctif, même bug rapporté sur cette liste.
                      style={{ padding: '5px 8px', borderRadius: 4, border: '1px solid rgba(190,170,230,0.3)', background: 'var(--tdr-dark)', color: PARCHMENT, fontSize: 12 }}
                    >
                      <option value="" style={{ background: 'var(--tdr-dark)', color: PARCHMENT }}>{t('gameMode.reseau.dialoguePJTousOption')}</option>
                      {reseau.rosterPJ.map(j => <option key={j.idPJ} value={j.idPJ} style={{ background: 'var(--tdr-dark)', color: PARCHMENT }}>{j.nom}</option>)}
                    </select>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        value={dialoguePJInput}
                        onChange={e => setDialoguePJInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') envoyerDialoguePJChat() }}
                        placeholder={t('gameMode.reseau.dialoguePJPlaceholder')}
                        style={{ flex: 1, minWidth: 0, padding: '5px 8px', borderRadius: 4, border: '1px solid rgba(190,170,230,0.3)', background: 'rgba(0,0,0,0.25)', color: PARCHMENT, fontSize: 12 }}
                      />
                      <button onClick={envoyerDialoguePJChat} style={{
                        padding: '5px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12,
                        border: '1px solid rgba(190,170,230,0.3)', background: 'rgba(190,170,230,0.12)', color: 'rgba(210,190,255,0.95)',
                      }}>
                        {t('gameMode.reseau.dialoguePJEnvoyer')}
                      </button>
                    </div>
                  </div>
                )}

                {/* Mission(s) en cours dont ce PJ fait partie (voir missionsActives ci-dessus) — juste un
                    petit bouton de rappel ici, le dialogue lui-même vit dans la modale plein écran (voir
                    plus bas, MissionModale) qui s'ouvre automatiquement au lancement et peut être
                    rouverte à tout moment depuis ce bouton. */}
                {missionsActives.map(mission => (
                  <button key={mission.id} onClick={() => setMissionModaleOuverte(mission.id)} style={{
                    padding: '6px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12, textAlign: 'left',
                    border: '1px solid rgba(150,200,120,0.35)', background: 'rgba(150,200,120,0.1)', color: 'rgba(180,230,150,0.95)',
                  }}>
                    🗺️ {t('gameMode.reseau.rejoindreMission', { mission: mission.nom })}
                  </button>
                ))}

                <button onClick={reseau.deconnecter} style={{
                  padding: '5px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12, alignSelf: 'flex-start',
                  border: '1px solid rgba(220,80,80,0.4)', background: 'rgba(220,80,80,0.1)', color: 'rgba(255,150,150,0.9)',
                }}>
                  {t('gameMode.reseau.deconnecter')}
                </button>
              </>
            )}

            <div style={{
              maxHeight: 140, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3,
              fontFamily: 'monospace', fontSize: 11, color: 'rgba(245,236,215,0.8)',
              borderTop: `1px solid ${SECTION_BORDER}`, paddingTop: 6,
            }}>
              {reseau.journal.length === 0
                ? <span style={{ opacity: 0.4 }}>{t('gameMode.reseau.journalVide')}</span>
                : reseau.journal.map(l => (
                  <div key={l.id}
                    onClick={l.categorie === 'imageMJ' ? () => reseau.ouvrirImage(l.id) : undefined}
                    style={{
                      color: l.categorie ? COULEUR_JOURNAL[l.categorie] : undefined,
                      cursor: l.categorie === 'imageMJ' ? 'pointer' : undefined,
                      textDecoration: l.categorie === 'imageMJ' ? 'underline' : undefined,
                    }}
                  >{l.texte}</div>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Barre PV / PM */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 14px', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <div onClick={() => { setCurrentPV(pvTotalEffectif); onChange({ pvRestants: pvTotalEffectif }) }}
            title={t('gameMode.clickToFull')}
            style={{ position: 'relative', cursor: 'pointer', width: 130, height: 130, boxSizing: 'border-box', borderRadius: 10, border: `1px solid ${GOLD}`, background: 'linear-gradient(to right, rgba(74,222,128,0.28), transparent 10%, transparent 90%, rgba(74,222,128,0.28)), linear-gradient(to bottom, rgba(74,222,128,0.28), transparent 10%, transparent 90%, rgba(74,222,128,0.28)), rgba(0,0,0,0.4)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-evenly', width: '100%', height: '100%' }}>
              <span style={{ fontSize: 11, color: 'rgba(245,236,215,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('gameMode.pvCardTitle')}</span>
              <span style={{ fontSize: 24 }}>❤️</span>
              <span style={{ fontSize: 20, fontWeight: 700, color: pvColor }}>{pvActuels} / {pvTotalEffectif}</span>
            </div>
            {activeDots.map((d, i) => (
              <span
                key={d.id}
                onMouseEnter={e => { e.stopPropagation(); showGmTooltip(e, t('gameMode.dotBadgeTitle'), `${DAMAGE_TYPE_ICONS[d.type]} ${d.amount} ${t('gameMode.pv')} · ${t('gameMode.turn', { count: d.remainingTurns })}`) }}
                onMouseLeave={hideGmTooltip}
                onClick={e => e.stopPropagation()}
                style={{
                  position: 'absolute', top: -8 + i * 20, right: -13, width: 26, height: 26, borderRadius: '50%',
                  zIndex: i + 1,
                  background: BG, border: `2px solid ${GOLD}`, boxShadow: '0 2px 5px rgba(0,0,0,0.6)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, cursor: 'help',
                }}
              >
                {DAMAGE_TYPE_ICONS[d.type]}
              </span>
            ))}
          </div>
          {pmTotalEffectif > 0 && (
            <div onClick={() => { setCurrentPM(pmTotalEffectif); onChange({ pmRestants: pmTotalEffectif }) }}
              title={t('gameMode.clickToFull')}
              style={{ cursor: 'pointer', width: 130, height: 130, boxSizing: 'border-box', borderRadius: 10, border: `1px solid ${GOLD}`, background: 'linear-gradient(to right, rgba(123,170,232,0.28), transparent 10%, transparent 90%, rgba(123,170,232,0.28)), linear-gradient(to bottom, rgba(123,170,232,0.28), transparent 10%, transparent 90%, rgba(123,170,232,0.28)), rgba(0,0,0,0.4)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-evenly', width: '100%', height: '100%' }}>
                <span style={{ fontSize: 11, color: 'rgba(245,236,215,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('gameMode.pmCardTitle')}</span>
                <span style={{ fontSize: 24 }}>✨</span>
                <span style={{ fontSize: 20, fontWeight: 700, color: '#7baae8' }}>{pmActuels} / {pmTotalEffectif}</span>
              </div>
            </div>
          )}
        </div>
        <div style={{ textAlign: 'center', fontSize: 11, color: 'rgba(245,236,215,0.3)' }}>{t('gameMode.clickCardToFull')}</div>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <span
            onMouseEnter={e => showGmTooltip(e, t('gameMode.defCardTitle'), defSources.map(s => t('gameMode.bonusSourceLine', { nom: s.nom, rang: s.rang, value: s.value })).join('\n') || undefined)}
            onMouseLeave={hideGmTooltip}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 700, color: GOLD, background: 'rgba(201,168,76,0.1)', border: `1px solid ${GOLD}`, borderRadius: 12, padding: '3px 12px', cursor: 'help' }}
          >
            🛡️ {t('gameMode.defCardTitle')} {defTotalEffectif}
          </span>
        </div>
        {activeBoosts.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
            {activeBoosts.map(b => (
              <span key={b.id} style={{ fontSize: 11, background: 'rgba(201,168,76,0.15)', border: `1px solid rgba(201,168,76,0.4)`, borderRadius: 3, padding: '1px 5px', color: GOLD }}>
                {b.bonus >= 0 ? '+' : ''}{b.bonus} {b.stat}{b.post_jet ? ` (${t('gameMode.afterParen')})` : ''}
                <button onClick={() => setActiveBoosts(prev => prev.filter(x => x.id !== b.id))} style={{ background: 'none', border: 'none', color: 'rgba(245,236,215,0.4)', cursor: 'pointer', padding: '0 0 0 3px', fontSize: 10, lineHeight: 1 }}>✕</button>
              </span>
            ))}
          </div>
        )}
        {/* En réseau, c'est le MJ qui fait avancer le tour pour tout le monde (message 'nouveau-tour',
            voir handleEndTurn plus haut) — le bouton local reste affiché pour comprendre pourquoi il ne
            réagit plus, mais désactivé pour éviter qu'un joueur se débloque tout seul en avance sur les
            autres/le MJ. Hors connexion (jeu solo/déconnecté), il reste l'unique déclencheur. */}
        <button onClick={handleEndTurn} disabled={reseau.connecte}
          title={reseau.connecte ? t('gameMode.endTurnDisabledReseau') : undefined}
          style={{
          alignSelf: 'center', padding: '6px 12px', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0,
          borderRadius: 4, cursor: reseau.connecte ? 'not-allowed' : 'pointer', border: `1px solid ${GOLD}`,
          background: reseau.connecte ? 'rgba(201,168,76,0.25)' : GOLD, color: reseau.connecte ? 'rgba(26,20,16,0.6)' : BG,
          opacity: reseau.connecte ? 0.6 : 1,
        }}>
          {t('gameMode.endTurn')}
        </button>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {isDead ? (
          <div style={{ padding: '10px 12px', borderRadius: 6, background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(220,50,50,0.5)', textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#ff5555', letterSpacing: '0.05em' }}>{t('gameMode.deathTitle')}</div>
            <div style={{ fontSize: 12, color: 'rgba(245,236,215,0.5)', marginTop: 2 }}>{t('gameMode.deathDesc', { con: conValeur })}</div>
          </div>
        ) : isUnconscious ? (
          <div style={{ padding: '10px 12px', borderRadius: 6, background: 'rgba(180,30,30,0.15)', border: '1px solid rgba(220,50,50,0.5)', textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#ff5555', letterSpacing: '0.05em' }}>{t('gameMode.unconsciousTitle')}</div>
            <div style={{ fontSize: 12, color: 'rgba(245,236,215,0.5)', marginTop: 2 }}>{t('gameMode.unconsciousDesc')}</div>
            {hasOgreResilience && pvActuels <= 0 && (
              <button onClick={() => setOgreResisting(true)} style={{ ...btnStyle(), marginTop: 8, border: '1px solid rgba(220,50,50,0.6)', color: 'rgba(255,150,150,0.95)' }}>
                {t('gameMode.ogreResistButton')}
              </button>
            )}
          </div>
        ) : isResisting && pvActuels <= 0 && (
          <div style={{ padding: '10px 12px', borderRadius: 6, background: 'rgba(180,30,30,0.1)', border: '1px solid rgba(220,50,50,0.35)', textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#ff8888', letterSpacing: '0.05em' }}>{t('gameMode.ogreResistingTitle')}</div>
            <div style={{ fontSize: 12, color: 'rgba(245,236,215,0.5)', marginTop: 2 }}>{t('gameMode.ogreResistingDesc', { con: conValeur })}</div>
          </div>
        )}

        {/* ── Section : Soins ── */}
        <div style={SECTION_DIVIDER}>
          <div style={{ fontSize: 13, color: `rgba(201,168,76,0.85)`, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{t('gameMode.healSection')}</div>
          {pvActuels < 0 && !isDead && (
            <div style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,150,150,0.7)', marginBottom: 6 }}>{t('gameMode.ogreNoFreeHeal')}</div>
          )}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                ref={healInputRef}
                type="number"
                min={1}
                value={healInput}
                onChange={e => setHealInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleManualHeal() }}
                placeholder={t('gameMode.healPlaceholder')}
                disabled={isPvFull || pvActuels < 0 || isDead}
                style={{ width: 100, flexShrink: 0, boxSizing: 'border-box', padding: '6px 8px', borderRadius: 4, fontSize: 14, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(201,168,76,0.35)', color: PARCHMENT, outline: 'none', opacity: (isPvFull || pvActuels < 0 || isDead) ? 0.35 : 1 }}
              />
              <button onClick={handleManualHeal} disabled={isPvFull || pvActuels < 0 || isDead || !peutAgir}
                title={!peutAgir ? t('gameMode.actionsEpuiseesTitle') : undefined}
                style={{ ...btnStyle(), flexShrink: 0, opacity: (isPvFull || pvActuels < 0 || isDead || !peutAgir) ? 0.35 : 1, cursor: (isPvFull || pvActuels < 0 || isDead || !peutAgir) ? 'not-allowed' : 'pointer' }}>❤️ {t('gameMode.healButton')}</button>
            </div>
            <div style={{ width: 1, alignSelf: 'stretch', background: SECTION_BORDER }} />
            <button
              onClick={handleRecuperation}
              disabled={isUnconscious || prRemaining <= 0 || isPvFull || !peutAgir}
              title={!peutAgir ? t('gameMode.actionsEpuiseesTitle') : prRemaining > 0 ? t('gameMode.recuperationLabel', { count: prRemaining }) : t('gameMode.recuperationNone')}
              style={{ ...btnStyle(), flexShrink: 0, opacity: (isUnconscious || prRemaining <= 0 || isPvFull || !peutAgir) ? 0.35 : 1, cursor: (isUnconscious || prRemaining <= 0 || isPvFull || !peutAgir) ? 'not-allowed' : 'pointer' }}
            >
              🩹 {t('gameMode.recuperationButton')} ({prRemaining})
            </button>
          </div>
        </div>

        {/* ── Section : Dégâts subis ── */}
        <div style={SECTION_DIVIDER}>
          <div style={{ fontSize: 13, color: `rgba(201,168,76,0.85)`, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{t('gameMode.damageTakenSection')}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'flex-start', justifyContent: 'center' }}>
            <input
              type="number"
              min={1}
              value={dmInput}
              onChange={e => setDmInput(e.target.value)}
              placeholder={t('gameMode.damageTakenPlaceholder')}
              style={{ width: 100, height: 48, flexShrink: 0, boxSizing: 'border-box', padding: '6px 8px', borderRadius: 4, fontSize: 14, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(201,168,76,0.35)', color: PARCHMENT, outline: 'none' }}
            />
            {(() => {
              const amount = parseInt(dmInput, 10)
              const amountValide = Number.isFinite(amount) && amount > 0
              return (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {['', ...DAMAGE_TYPES].map(type => {
                    const immune = isImmune(type)
                    const rd = rdEffectifPourType(type)
                    const halved = isHalfDamage(type)
                    const label = type ? t(`gameMode.dmType${type}`) : t('gameMode.dmTypeGenerique')
                    const rdDesc = rd > 0
                      ? rdSourcesPourType(type).map(s => t('gameMode.bonusSourceLine', { nom: s.nom, rang: s.rang, value: s.value })).join('\n')
                      : undefined
                    const halfDesc = halved
                      ? halfDamageSourcesPourType(type).map(s => t('gameMode.halfDamageSourceLine', { nom: s.nom, rang: s.rang })).join('\n')
                      : undefined
                    const immuniteDesc = immune
                      ? immuniteSourcesPourType(type).map(s => t('gameMode.immuniteSourceLine', { nom: s.nom, rang: s.rang })).join('\n')
                      : undefined
                    const hintParts = immune
                      ? [t('gameMode.sufImmunite')]
                      : [halved ? t('gameMode.sufDiv2') : null, rd > 0 ? `${rd} ${t('gameMode.sufRD')}` : null].filter(Boolean)
                    const hintDesc = immune ? immuniteDesc : [halfDesc, rdDesc].filter(Boolean).join('\n')
                    return (
                      <div key={type || 'GENERIQUE'} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                        <button
                          disabled={!amountValide}
                          onClick={() => handleTakeDamage(type)}
                          onMouseEnter={e => showGmTooltip(e, label)}
                          onMouseLeave={hideGmTooltip}
                          style={{
                            ...btnStyle(),
                            border: immune ? `1px solid ${GOLD}` : btnStyle().border,
                            width: 48, height: 48, boxSizing: 'border-box', padding: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 22, opacity: amountValide ? 1 : 0.35, cursor: amountValide ? 'pointer' : 'not-allowed',
                          }}
                        >
                          {DAMAGE_TYPE_ICONS[type]}
                        </button>
                        <span
                          onMouseEnter={hintParts.length > 0 ? e => showGmTooltip(e, label, hintDesc) : undefined}
                          onMouseLeave={hintParts.length > 0 ? hideGmTooltip : undefined}
                          style={{ fontSize: 13, color: immune ? GOLD : 'rgba(245,236,215,0.45)', height: 16, lineHeight: '16px', cursor: hintParts.length > 0 ? 'help' : 'default' }}
                        >
                          {hintParts.length > 0 ? hintParts.join(' · ') : ' '}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>

          {/* Dégâts sur la durée (poison, brûlure, ...) : encaissés automatiquement à chaque fin de tour
              (RD/div2/immunité du type résolus à chaque tic, comme pour un dégât encaissé manuellement) */}
          <div style={{ fontSize: 11, color: 'rgba(245,236,215,0.35)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 12, marginBottom: 4, textAlign: 'center' }}>
            {t('gameMode.dotSectionTitle')}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
            <input
              type="number" min={1}
              value={dotAmountInput}
              onChange={e => setDotAmountInput(e.target.value)}
              placeholder={t('gameMode.dotAmountPlaceholder')}
              style={{ width: 90, height: 34, flexShrink: 0, boxSizing: 'border-box', padding: '4px 8px', borderRadius: 4, fontSize: 13, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(201,168,76,0.35)', color: PARCHMENT, outline: 'none' }}
            />
            <input
              type="number" min={1}
              value={dotDurationInput}
              onChange={e => setDotDurationInput(e.target.value)}
              placeholder={t('gameMode.dotDurationPlaceholder')}
              style={{ width: 70, height: 34, flexShrink: 0, boxSizing: 'border-box', padding: '4px 8px', borderRadius: 4, fontSize: 13, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(201,168,76,0.35)', color: PARCHMENT, outline: 'none' }}
            />
            <select
              value={dotTypeInput}
              onChange={e => setDotTypeInput(e.target.value)}
              // Fond opaque, pas rgba : sur Windows, la liste déroulante d'un <select> est un popup natif
              // hors de la page — un fond translucide y est composité sur blanc au lieu du thème sombre
              // (même correctif déjà appliqué ailleurs, ex. CreatureDetail.tsx/AdversiteTab.tsx).
              style={{ height: 34, flexShrink: 0, boxSizing: 'border-box', padding: '4px 6px', borderRadius: 4, fontSize: 13, background: 'var(--tdr-dark)', border: '1px solid rgba(201,168,76,0.35)', color: PARCHMENT, outline: 'none' }}
            >
              {['', ...DAMAGE_TYPES].map(type => (
                <option key={type || 'GENERIQUE'} value={type} style={{ background: 'var(--tdr-dark)', color: PARCHMENT }}>{type ? t(`gameMode.dmType${type}`) : t('gameMode.dmTypeGenerique')}</option>
              ))}
            </select>
            {(() => {
              const dotValide = parseInt(dotAmountInput, 10) > 0 && parseInt(dotDurationInput, 10) > 0
              return (
                <button
                  disabled={!dotValide}
                  onClick={handleAddDot}
                  style={{ ...btnStyle(), height: 34, flexShrink: 0, opacity: dotValide ? 1 : 0.35, cursor: dotValide ? 'pointer' : 'not-allowed' }}
                >
                  ☠️ {t('gameMode.dotAddButton')}
                </button>
              )
            })()}
          </div>
          {activeDots.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
              {activeDots.map(dot => (
                <span key={dot.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, background: 'rgba(180,30,30,0.12)', border: '1px solid rgba(220,50,50,0.4)', borderRadius: 12, padding: '3px 8px', color: 'rgba(255,150,150,0.9)' }}>
                  {DAMAGE_TYPE_ICONS[dot.type]} {dot.amount} · {t('gameMode.turn', { count: dot.remainingTurns })}
                  <button onClick={() => setActiveDots(prev => prev.filter(d => d.id !== dot.id))} style={{ background: 'none', border: 'none', color: 'rgba(245,236,215,0.4)', cursor: 'pointer', padding: '0 0 0 3px', fontSize: 10, lineHeight: 1 }}>✕</button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* ── Section 1 : Jets rapides ── */}
        <div style={SECTION_DIVIDER}>
          <div style={{ fontSize: 13, color: `rgba(201,168,76,0.85)`, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{t('gameMode.quickRolls')}</div>

          <div style={{ fontSize: 13, color: `rgba(245,236,215,0.4)`, marginBottom: 4 }}>{t('gameMode.attacksSection')}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
            {[
              { label: t('gameMode.attContact'), val: attaques.contact, stat: 'ATT_CONTACT' },
              { label: t('gameMode.attDistance'), val: attaques.distance, stat: 'ATT_DISTANCE' },
              { label: t('gameMode.attMagic'), val: attaques.magique, stat: 'ATT_MAGIQUE' },
            ].map(({ label, val, stat }) => {
              // Même mécanique que les boutons de caractéristiques ci-dessous (boost/boostedMod) —
              // manquait ici : `roll` n'appliquait jamais un bonus temporaire ciblant ATT_CONTACT/
              // DISTANCE/MAGIQUE faute de recevoir `stat`, et l'affichage ne le montrait pas non plus
              // (ex. "Attaque flamboyante", voie du charme rang 3, formula MOD_CHA sur ATT_CONTACT).
              const boost = activeBoosts.find(b => b.stat === stat)
              const boostedVal = boost ? val + boost.bonus : val
              return (
                <button key={label} disabled={isUnconscious} style={{ ...btnStyle(!!boost), flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, padding: '4px 2px', opacity: isUnconscious ? 0.35 : 1, cursor: isUnconscious ? 'not-allowed' : 'pointer' }} onClick={() => roll(20, label, val, stat)}>
                  <span style={{ fontSize: 11, color: boost ? '#ffe94d' : `rgba(245,236,215,0.5)`, display: 'flex', alignItems: 'center', gap: 2 }}>
                    {label}{boost && <span style={{ fontSize: 10 }}>{boost.bonus >= 0 ? '+' : ''}{boost.bonus}</span>}
                  </span>
                  <span style={{ color: boost ? '#ffe94d' : GOLD, fontSize: 22, fontWeight: 700 }}>{boostedVal >= 0 ? '+' : ''}{boostedVal}</span>
                </button>
              )
            })}
          </div>

          {(character.arme1 || character.arme2) && (
            <>
              <div style={{ fontSize: 13, color: `rgba(245,236,215,0.4)`, marginBottom: 4 }}>{t('gameMode.damageSection')}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                {[
                  ...(character.arme1 ? [{ label: character.arme1, nomArme: character.arme1, fallback: character.dmArme1 }] : []),
                  ...(character.arme2 ? [{ label: character.arme2, nomArme: character.arme2, fallback: character.dmArme2 }] : []),
                ].map(({ label, nomArme, fallback }) => {
                  const nbBonus = activeDeDegats.filter(ab => !ab.deDegatsParArme || getDeDegatsWeapon(ab) === nomArme).length
                  return (
                    <button key={label} disabled={isUnconscious || !peutAgir}
                      title={!peutAgir ? t('gameMode.actionsEpuiseesTitle') : undefined}
                      style={{ ...btnStyle(), flex: 1, padding: '6px 4px', opacity: (isUnconscious || !peutAgir) ? 0.35 : 1, cursor: (isUnconscious || !peutAgir) ? 'not-allowed' : 'pointer' }} onClick={() => handleWeaponDegats(nomArme, label, fallback)}>
                      💥 {label}{nbBonus > 0 ? ` (+${nbBonus})` : ''}
                    </button>
                  )
                })}
              </div>
            </>
          )}

          <div style={{ fontSize: 13, color: `rgba(245,236,215,0.4)`, marginBottom: 4 }}>{t('gameMode.characteristics')}</div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 32 }}>
            {STATS.map(stat => {
              const permBonus = permanentBonusByStat.get(stat) ?? 0
              const scoreBonus = sumStat(effectsAll[stat] ?? [])
              const mod = effectiveMod(stat) + permBonus
              const boost = activeBoosts.find(b => b.stat === stat)
              const boostedMod = boost ? mod + boost.bonus : mod
              const sources = modSourcesPourStat(stat)
              const tooltipDesc = [
                t('gameMode.bonusBaseLine', { value: character.caracteristiques[stat].mod }),
                ...sources.map(s => t('gameMode.bonusSourceLine', { nom: s.nom, rang: s.rang, value: s.value })),
                ...(boost ? [t('gameMode.bonusNextRollLine', { nom: boost.label, value: boost.bonus })] : []),
              ].join('\n')
              return (
                <button
                  key={stat} disabled={isUnconscious}
                  style={{ ...btnStyle(!!boost), flex: 1, padding: '4px 2px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, opacity: isUnconscious ? 0.35 : 1, cursor: isUnconscious ? 'not-allowed' : 'pointer' }}
                  onClick={() => roll(20, t(`stats.${stat}`), mod, stat)}
                  onMouseEnter={e => showGmTooltip(e, t(`stats.${stat}`), tooltipDesc)}
                  onMouseLeave={hideGmTooltip}
                >
                  <span style={{ fontSize: 11, color: boost ? '#ffe94d' : (permBonus || scoreBonus) ? GOLD : `rgba(245,236,215,0.5)`, display: 'flex', alignItems: 'center', gap: 2 }}>
                    {t(`stats.${stat}`)}{boost && <span style={{ fontSize: 10 }}>{boost.bonus >= 0 ? '+' : ''}{boost.bonus}</span>}
                  </span>
                  <span style={{ color: boost ? '#ffe94d' : GOLD, fontSize: 22, fontWeight: 700 }}>{boostedMod >= 0 ? '+' : ''}{boostedMod}</span>
                </button>
              )
            })}
          </div>

          {/* 2 colonnes : [dés + résultat] | [historique] — empilées verticalement sur mobile */}
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8, marginTop: 4, alignItems: 'stretch' }}>

            {/* Colonne 1 : dés (ligne 1) + résultat (ligne 2) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
              {/* Ligne 1 : boutons dés + compteur de dés à droite (voir rollQuick) — dans la même rangée
                  plutôt qu'une ligne à part, pour ne pas creuser d'espace entre les dés et le résultat. */}
              <div style={{ flexShrink: 0, display: 'flex', gap: 4, justifyContent: 'center' }}>
                {BARE_DICE.map(d => (
                  <button key={d} disabled={isUnconscious} style={{ ...btnStyle(), flex: 1, maxWidth: 56, aspectRatio: '1', padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: isUnconscious ? 0.35 : 1, cursor: isUnconscious ? 'not-allowed' : 'pointer' }} onClick={() => rollQuick(d)}>
                    <DiceIcon sides={d} size="100%" />
                  </button>
                ))}
                {/* Nombre de dés identiques à lancer d'un coup — vide/invalide = 1 (comportement inchangé
                    de rollQuick). Champ toujours modifiable directement, +/- ne font qu'incrémenter sa
                    valeur. */}
                <div style={{ flexShrink: 0, width: 30, display: 'flex', flexDirection: 'column', gap: 2 }} title={t('gameMode.nbDesLabel')}>
                  <button
                    type="button"
                    onClick={() => setNbDesInput(String(Math.max(1, (parseInt(nbDesInput, 10) || 1) + 1)))}
                    style={{ flex: 1, minHeight: 0, padding: 0, borderRadius: 3, fontSize: 12, lineHeight: 1, cursor: 'pointer',
                      border: `1px solid ${SECTION_BORDER}`, background: 'rgba(201,168,76,0.12)', color: GOLD }}
                  >+</button>
                  <input
                    type="number" min={1}
                    value={nbDesInput}
                    onChange={e => setNbDesInput(e.target.value)}
                    placeholder="1"
                    style={{ flex: 1, minHeight: 0, width: '100%', padding: 0, borderRadius: 3, fontSize: 13, textAlign: 'center',
                      border: `1px solid ${SECTION_BORDER}`, background: 'rgba(0,0,0,0.3)', color: PARCHMENT, outline: 'none', boxSizing: 'border-box' }}
                  />
                  <button
                    type="button"
                    onClick={() => setNbDesInput(String(Math.max(1, (parseInt(nbDesInput, 10) || 1) - 1)))}
                    style={{ flex: 1, minHeight: 0, padding: 0, borderRadius: 3, fontSize: 12, lineHeight: 1, cursor: 'pointer',
                      border: `1px solid ${SECTION_BORDER}`, background: 'rgba(201,168,76,0.12)', color: GOLD }}
                  >-</button>
                </div>
              </div>

              {/* Ligne 2 : résultat */}
              {(() => {
                const isCritSuccess = !!result && result.sides === 20 && result.roll === 20
                const isCritFail    = !!result && result.sides === 20 && result.roll === 1
                const borderColor = isCritSuccess ? 'rgba(255,215,0,0.7)' : isCritFail ? 'rgba(220,50,50,0.7)' : SECTION_BORDER
                const bgColor     = isCritSuccess ? 'rgba(255,200,0,0.08)' : isCritFail ? 'rgba(180,30,30,0.12)' : 'rgba(0,0,0,0.4)'
                const totalColor  = isCritSuccess ? '#ffe94d' : isCritFail ? '#ff5555' : GOLD
                const effs: ContributingEffect[] = result ? [
                  ...(result.stat ? effectsByStatMap.get(result.stat) ?? [] : []),
                  ...(result.boost !== undefined ? [{ rangNom: result.boostLabel ?? 'Bonus', temporaire: true as const }] : []),
                  ...(result.contributingEffects ?? []),
                ] : []
                return (
                  <div style={{ flex: 1, padding: '4px 12px', background: bgColor, borderRadius: 6, border: `1px solid ${borderColor}`, textAlign: 'center', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 0 }}>
                      {!result && <div style={{ color: `rgba(245,236,215,0.2)`, fontSize: 14 }}>—</div>}
                      {result && <>
                        {isCritSuccess && (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 4 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#ffe94d', letterSpacing: '0.1em' }}>{t('gameMode.critSuccess')}</div>
                            <button onClick={() => tirerCarte('reussite', result.stat)}
                              style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, cursor: 'pointer', background: 'rgba(255,220,80,0.12)', border: '1px solid rgba(255,220,80,0.4)', color: '#ffe94d' }}>
                              🎴 {t('carteCritique.tirer')}
                            </button>
                          </div>
                        )}
                        {isCritFail && (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 4 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#ff5555', letterSpacing: '0.1em' }}>{t('gameMode.critFail')}</div>
                            <button onClick={() => tirerCarte('echec', result.stat)}
                              style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, cursor: 'pointer', background: 'rgba(220,80,80,0.12)', border: '1px solid rgba(220,80,80,0.4)', color: '#ff8080' }}>
                              🎴 {t('carteCritique.tirer')}
                            </button>
                          </div>
                        )}
                        <div style={{ fontSize: 13, color: `rgba(245,236,215,0.45)`, marginBottom: 6 }}>
                          {result.label} <span style={{ color: `rgba(201,168,76,0.5)` }}>({result.formula})</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 24, color: result.flash ? '#fff' : PARCHMENT, transition: 'color 0.2s' }}>
                            <DiceIcon sides={result.sides} size={32} color={result.flash ? '#fff' : PARCHMENT} />
                            {result.rollDisplay ?? result.roll}
                          </span>
                          {result.modifier !== null && (
                            <span style={{ fontSize: 22, color: `rgba(245,236,215,0.55)` }}>{result.modifier >= 0 ? '+' : ''}{result.modifier}</span>
                          )}
                          {result.boost !== undefined && (
                            <span style={{ fontSize: 18, color: '#ffe94d' }} title={result.boostLabel}>+{result.boost}</span>
                          )}
                          <span style={{ fontSize: 22, color: `rgba(245,236,215,0.4)` }}>=</span>
                          <span style={{ fontSize: 36, fontWeight: 700, color: result.flash ? '#fff' : totalColor, transition: 'color 0.2s' }}>{result.total}</span>
                        </div>
                        {postJetBoosts.map(b => (
                          <button key={b.id} onClick={() => applyPostJetBoost(b)}
                            style={{ marginTop: 8, width: '100%', padding: '5px', borderRadius: 4, fontSize: 12, cursor: 'pointer', background: 'rgba(255,220,80,0.1)', border: '1px solid rgba(255,220,80,0.4)', color: '#ffe94d' }}>
                            {t('gameMode.applyBoost', { label: b.label, bonus: `${b.bonus >= 0 ? '+' : ''}${b.bonus}` })}
                          </button>
                        ))}
                      </>}
                    </div>
                    {effs.length > 0 && (
                      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 2, padding: '4px 8px', margin: '4px -12px -4px', background: 'rgba(20,14,30,0.92)', borderTop: '1px solid rgba(160,120,255,0.3)', borderRadius: '0 0 6px 6px' }}>
                        {effs.map((e, i) => (
                          <div key={i} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(140,100,255,0.15)', border: '1px solid rgba(160,120,255,0.3)', borderRadius: 4, padding: '3px 8px' }}>
                            <span style={{ color: `rgba(245,236,215,0.85)`, fontWeight: 600 }}>{e.rangNom}</span>
                            <span style={{ color: `rgba(245,236,215,0.35)`, marginLeft: 'auto', fontSize: 11 }}>
                              {'temporaire' in e ? t('gameMode.temporary') : t('gameMode.rangVoie', { rang: e.rangIdx! + 1, voie: e.voieNom })}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>

            {/* Colonne 2 : historique */}
            {(() => {
              const histDisplay = resultInHistory ? history.slice(1) : history
              return (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <div style={{ fontSize: 13, color: `rgba(201,168,76,0.85)`, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{t('gameMode.history')}</div>
                    {history.length > 0 && (
                      <button
                        onClick={() => setHistory([])}
                        style={{ fontSize: 11, color: 'rgba(245,236,215,0.4)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}
                      >
                        🗑️ {t('gameMode.clearHistory')}
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', minHeight: 230, maxHeight: 230, paddingRight: 6 }}>
                    {histDisplay.length === 0
                      ? <div style={{ color: `rgba(245,236,215,0.2)`, fontSize: 13, padding: '4px 6px' }}>—</div>
                      : histDisplay.map((h, i) => {
                          const cs = h.sides === 20 && h.roll === 20
                          const cf = h.sides === 20 && h.roll === 1
                          const color = cs ? '#ffe94d' : cf ? '#ff5555' : `rgba(245,236,215,0.85)`
                          const bg = cs ? 'rgba(255,200,0,0.1)' : cf ? 'rgba(180,30,30,0.15)' : 'rgba(0,0,0,0.25)'
                          const modStr = h.modifier !== null ? (h.modifier >= 0 ? ` +${h.modifier}` : ` ${h.modifier}`) : ''
                          const boostStr = h.boost ? ` +${h.boost}` : ''
                          return (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 6px', borderRadius: 3, background: bg, fontSize: 15 }}>
                              <span style={{ flex: 1, color: `rgba(245,236,215,0.75)`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {cs ? '✨ ' : cf ? '💀 ' : ''}{h.costType === 'PV' ? '❤️ ' : h.costType === 'PM' ? '✨ ' : h.costType === 'PR' ? '🩹 ' : ''}{h.label} ({h.formula})
                              </span>
                              <span style={{ color: `rgba(245,236,215,0.6)`, flexShrink: 0 }}>{h.rollDisplay ?? h.roll}{modStr}{boostStr} =</span>
                              <span style={{ fontWeight: 700, color, flexShrink: 0 }}>{h.total}</span>
                              {(cs || cf) && (
                                <button onClick={() => tirerCarte(cs ? 'reussite' : 'echec', h.stat)}
                                  title={t('carteCritique.tirer')}
                                  style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: '0 2px', lineHeight: 1 }}>
                                  🎴
                                </button>
                              )}
                            </div>
                          )
                        })
                    }
                  </div>
                </div>
              )
            })()}
          </div>
        </div>

        {/* ── Section : Compagnons + Combat (mobile) ── */}
        {/* Sur mobile, panneau étroit : on garde les listes compactes (compagnons puis ciblage) plutôt que
            la vue à deux colonnes ci-dessous, qui a besoin de largeur pour rester lisible côte à côte. */}
        {isMobile && (
          <>
            {compagnonsActifsResolus.length > 0 && (
              <div style={SECTION_DIVIDER}>
                <div style={{ fontSize: 13, color: `rgba(201,168,76,0.85)`, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{t('gameMode.compagnonsSection')}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {compagnonsActifsResolus.map(({ nom, creature }) => renderCompagnonCard(nom, creature))}
                </div>
              </div>
            )}

            {reseau.connecte && (
              <div style={SECTION_DIVIDER}>
                <div style={{ fontSize: 13, color: `rgba(201,168,76,0.85)`, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{t('gameMode.combatSection')}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 12, color: 'rgba(245,236,215,0.5)', marginBottom: 4 }}>{t('gameMode.cibleChoisieLabel')}</div>
                    <select
                      value={cibleChoisieId}
                      onChange={e => { setCibleChoisieId(e.target.value); reseau.envoyerCibleChoisie(e.target.value || null) }}
                      // Fond opaque, pas rgba : même correctif Windows que les autres <select> de ce fichier.
                      style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', borderRadius: 4, fontSize: 14, background: 'var(--tdr-dark)', border: '1px solid rgba(201,168,76,0.35)', color: PARCHMENT, outline: 'none' }}
                    >
                      <option value="" style={{ background: 'var(--tdr-dark)', color: PARCHMENT }}>{t('gameMode.aucuneCibleChoisie')}</option>
                      {reseau.ciblesDisponibles.map(c => (
                        <option key={c.id} value={c.id} disabled={c.mort} style={{ background: 'var(--tdr-dark)', color: PARCHMENT }}>{c.nom}{c.mort ? ' 💀' : ''}</option>
                      ))}
                    </select>
                    {reseau.estMonTour && (
                      <button onClick={() => reseau.envoyerAttendreMonTour()}
                        style={{ width: '100%', marginTop: 6, padding: '5px 8px', borderRadius: 4, fontSize: 12, cursor: 'pointer', fontWeight: 600, border: '1px solid rgba(201,168,76,0.4)', background: 'rgba(201,168,76,0.1)', color: GOLD }}>
                        ⏳ {t('gameMode.attendreButton')}
                      </button>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: 'rgba(245,236,215,0.5)', marginBottom: 4 }}>{t('gameMode.ciblesSurMoiLabel')}</div>
                    {reseau.ciblesSurMoi.length === 0 ? (
                      <div style={{ fontSize: 12, color: 'rgba(245,236,215,0.35)' }}>{t('gameMode.aucuneCibleSurMoi')}</div>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {reseau.ciblesSurMoi.map((nom, i) => (
                          <span key={i} style={{ fontSize: 12, background: 'rgba(220,80,80,0.12)', border: '1px solid rgba(220,50,50,0.3)', borderRadius: 12, padding: '2px 8px', color: 'rgba(255,150,150,0.9)' }}>{nom}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Ordre d'initiative (voir 'etat-ciblage'.ordreInitiative dans reseauProtocole.ts) —
                      version texte compacte, miroir du tableau du MJ ; la vue en cartes du bureau
                      (ci-dessous) en a une version plus visuelle. */}
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'rgba(245,236,215,0.7)', marginBottom: 4 }}>{t('gameMode.ordreInitiativeLabel')} — {t('gameMode.roundLabel', { round: reseau.round })}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {reseau.ordreInitiative.map((e, i) => (
                        <span key={i} style={{
                          fontSize: 12, borderRadius: 12, padding: '2px 8px',
                          background: e.enCours ? 'rgba(201,168,76,0.2)' : 'rgba(245,236,215,0.06)',
                          border: `1px solid ${e.enCours ? GOLD : 'rgba(245,236,215,0.15)'}`,
                          color: e.enCours ? GOLD : e.aJoue ? 'rgba(245,236,215,0.35)' : 'rgba(245,236,215,0.7)',
                        }}>{e.nom}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Section : Combat (bureau, cartes illustrées façon écran de rencontre du MJ) ── */}
        {/* Même esprit visuel que CombatCard repliée côté MJ (portrait en 2/3, nom dessous), mais jamais
            dépliable (demandé par Didic — plus visuel, sans reprendre le mécanisme d'expansion du MJ) et
            sans redimensionnement/glisser-déposer/liens SVG (pas adapté à la largeur réduite de ce
            panneau) : ciblage par simple sélection sur SA PROPRE carte (comme SelecteurCible côté MJ),
            liens affichés en badge. Remplace les deux sections mobiles ci-dessus sur desktop (une seule
            interface plutôt que deux qui font la même chose).
            Masquée hors connexion (pas seulement les sous-parties MJ comme avant) : sans MJ, il n'y a de
            toute façon aucun ennemi à cibler, donc rien d'utile à faire depuis cette carte — les PV/infos
            du compagnon restent consultables via l'onglet "Compagnons" de la fiche, accessible sans
            fermer le Mode de jeu (panneau séparé). */}
        {!isMobile && reseau.connecte && (
          <div style={SECTION_DIVIDER}>
            <div style={{ fontSize: 13, color: `rgba(201,168,76,0.85)`, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{t('gameMode.combatSection')}</div>
            {/* Ordre d'initiative — miroir en lecture du tableau du MJ (voir OrdreInitiativeTable dans
                CombatTab.tsx), affiché seulement connecté (pas de tableau sans MJ pour l'arbitrer). */}
            {reseau.connecte && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'rgba(245,236,215,0.7)', marginBottom: 4 }}>{t('gameMode.ordreInitiativeLabel')} — {t('gameMode.roundLabel', { round: reseau.round })}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {reseau.ordreInitiative.map((e, i) => (
                    <span key={i} style={{
                      fontSize: 12, borderRadius: 12, padding: '2px 8px',
                      background: e.enCours ? 'rgba(201,168,76,0.2)' : 'rgba(245,236,215,0.06)',
                      border: `1px solid ${e.enCours ? GOLD : 'rgba(245,236,215,0.15)'}`,
                      color: e.enCours ? GOLD : e.aJoue ? 'rgba(245,236,215,0.35)' : 'rgba(245,236,215,0.7)',
                    }}>{e.nom}</span>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              {/* Colonne alliés : le PJ (avec sa propre sélection de cible) puis ses compagnons — portraits
                  déjà locaux (character.portrait / creature.image), aucun réseau nécessaire ici. */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: 'rgba(110,220,200,0.7)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{t('gameMode.alliesColumn')}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignContent: 'flex-start' }}>
                  <div style={{ width: 138, flexShrink: 0, borderRadius: 8, overflow: 'hidden', background: 'rgba(15,12,8,0.95)', border: '1px solid rgba(110,220,200,0.35)' }}>
                    <div style={{ width: '100%', aspectRatio: '2 / 3', background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                      {pjImageSrc
                        ? <img src={pjImageSrc} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: character.portraitFit ?? 'cover' }} />
                        : <span style={{ fontSize: 28, opacity: 0.3 }}>🧍</span>}
                      {/* Sablier : ce n'est pas (encore, ou plus) le tour de ce PJ — soit son budget
                          d'action est épuisé pour ce tour (voir peutAgir/budgetActions), soit ce n'est
                          simplement pas encore son tour dans l'ordre d'initiative (reseau.estMonTour). */}
                      {!peutAgir && (
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontSize: 32 }}>⏳</span>
                        </div>
                      )}
                      {reseau.connecte && reseau.ciblesSurMoi.length > 0 && (
                        <div title={`${t('gameMode.ciblesSurMoiLabel')} : ${reseau.ciblesSurMoi.join(', ')}`} style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(180,30,30,0.85)', borderRadius: 10, padding: '1px 6px', fontSize: 11, color: '#fff' }}>
                          🎯 {reseau.ciblesSurMoi.length}
                        </div>
                      )}
                    </div>
                    <div style={{ padding: '6px 8px' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: PARCHMENT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 4 }}>{character.nomPersonnage}</div>
                      {reseau.connecte ? (
                        <select
                          value={cibleChoisieId}
                          onChange={e => { setCibleChoisieId(e.target.value); reseau.envoyerCibleChoisie(e.target.value || null) }}
                          style={{ width: '100%', boxSizing: 'border-box', padding: '3px 4px', borderRadius: 4, fontSize: 11, background: 'var(--tdr-dark)', border: '1px solid rgba(201,168,76,0.35)', color: PARCHMENT, outline: 'none' }}
                        >
                          <option value="" style={{ background: 'var(--tdr-dark)', color: PARCHMENT }}>{t('gameMode.aucuneCibleChoisie')}</option>
                          {reseau.ciblesDisponibles.map(c => (
                            <option key={c.id} value={c.id} disabled={c.mort} style={{ background: 'var(--tdr-dark)', color: PARCHMENT }}>{c.nom}{c.mort ? ' 💀' : ''}</option>
                          ))}
                        </select>
                      ) : (
                        <div style={{ fontSize: 10, color: 'rgba(245,236,215,0.35)', fontStyle: 'italic' }}>{t('gameMode.enemiesRequireConnexion')}</div>
                      )}
                      {/* "Attendre" : ne joue pas tout de suite, repasse en fin d'ordre du round en
                          cours ("attendre que tout le monde ait attaqué", demandé par Didic) — visible
                          uniquement quand c'est effectivement le tour de ce PJ. */}
                      {reseau.connecte && reseau.estMonTour && (
                        <button onClick={() => reseau.envoyerAttendreMonTour()}
                          style={{ width: '100%', marginTop: 4, padding: '3px 4px', borderRadius: 4, fontSize: 11, cursor: 'pointer', fontWeight: 600, border: '1px solid rgba(201,168,76,0.4)', background: 'rgba(201,168,76,0.1)', color: GOLD }}>
                          ⏳ {t('gameMode.attendreButton')}
                        </button>
                      )}
                    </div>
                  </div>
                  {compagnonsActifsResolus.map(({ nom, creature }) => renderCompagnonCardVisuelle(nom, creature))}
                </div>
              </div>

              {/* Colonne ennemis : jamais de PV/DEF/RD/caractéristiques (voir CombatEntiteInfo côté MJ) —
                  juste le portrait (voir reseau.imagesCibles, transmis explicitement par le MJ), le nom,
                  si mort (c.mort), si cet ennemi cible le PJ (recoupé par nom avec ciblesSurMoi), et les
                  dégâts déjà infligés PAR le PJ (voir degatsInfligesParCible). Clic sur la carte = choisir
                  cette cible, même geste que le select de la carte PJ (juste une seconde façon d'y
                  accéder). */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: 'rgba(255,150,150,0.7)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{t('gameMode.enemiesColumn')}</div>
                {!reseau.connecte ? (
                  <div style={{ fontSize: 12, color: 'rgba(245,236,215,0.35)', fontStyle: 'italic' }}>{t('gameMode.enemiesRequireConnexion')}</div>
                ) : reseau.ciblesDisponibles.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'rgba(245,236,215,0.35)', fontStyle: 'italic' }}>{t('gameMode.aucunEnnemi')}</div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignContent: 'flex-start' }}>
                    {reseau.ciblesDisponibles.map(c => {
                      const estCible = cibleChoisieId === c.id
                      const meVise = reseau.ciblesSurMoi.includes(c.nom)
                      const degats = degatsInfligesParCible[c.id]
                      const imageSrc = reseau.imagesCibles[c.id]
                      return (
                        <div key={c.id}
                          // Une créature morte reste visible (le 💀 informe de son sort, voir la note
                          // ci-dessous) mais ne peut plus être choisie comme cible — même règle que côté
                          // MJ (SelecteurCible.tsx/handleAttaque dans CombatTab.tsx).
                          onClick={() => { if (c.mort) return; setCibleChoisieId(c.id); reseau.envoyerCibleChoisie(c.id) }}
                          style={{ width: 138, flexShrink: 0, cursor: c.mort ? 'not-allowed' : 'pointer', borderRadius: 8, overflow: 'hidden', background: 'rgba(15,12,8,0.95)', border: `1px solid ${estCible ? GOLD : 'rgba(220,80,80,0.3)'}`, opacity: c.mort ? 0.6 : 1 }}
                        >
                          <div style={{ width: '100%', aspectRatio: '2 / 3', background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                            {imageSrc
                              ? <img src={imageSrc} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              : <span style={{ fontSize: 28, opacity: 0.3 }}>👹</span>}
                            {/* c.mort : juste un booléen dérivé de pvActuels<=0 côté MJ (voir
                                etatCiblagePourPJ dans CombatTab.tsx), jamais la valeur elle-même — seuls
                                les PV/caractéristiques restent masqués, pas le fait qu'une créature soit
                                morte (demandé par Didic). */}
                            {c.mort ? (
                              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <span style={{ fontSize: 32 }}>💀</span>
                              </div>
                            ) : !c.enCours && (
                              // Sablier : ce n'est pas le tour de cette créature — c.enCours est calculé
                              // par ID côté MJ (voir 'etat-ciblage' dans reseauProtocole.ts), PAS par nom
                              // via le tableau ordreInitiative comme précédemment : plusieurs ennemis
                              // homonymes tombaient sinon tous sur la même entrée et affichaient le même
                              // statut (bug signalé par Didic). Le crâne reste prioritaire si mort aussi.
                              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <span style={{ fontSize: 32 }}>⏳</span>
                              </div>
                            )}
                            {meVise && (
                              <div title={t('gameMode.meViseTitle')} style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(180,30,30,0.85)', borderRadius: 10, padding: '1px 5px', fontSize: 12 }}>🎯</div>
                            )}
                          </div>
                          <div style={{ padding: '6px 8px' }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: estCible ? GOLD : 'rgba(255,150,150,0.9)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.nom}</div>
                            {degats ? (
                              <div style={{ fontSize: 11, color: 'rgba(255,180,120,0.85)', marginTop: 2 }}>💥 {t('gameMode.degatsInfligesLabel', { degats })}</div>
                            ) : null}
                            {/* Qui cet ennemi vise actuellement — un PJ, un compagnon (même d'un AUTRE
                                PJ) ou une autre créature, peu importe : juste le nom (voir c.cible dans
                                etatCiblagePourPJ, CombatTab.tsx), jamais de PV/stats sur cette cible. */}
                            {c.cible && (
                              <div style={{ fontSize: 11, color: 'rgba(245,236,215,0.5)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                🎯 {t('gameMode.ennemiCibleLabel', { cible: c.cible })}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Section 2 : Effets actifs ── */}
        <div style={SECTION_DIVIDER}>
          <div style={{ fontSize: 13, color: `rgba(201,168,76,0.85)`, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{t('gameMode.activeEffects')}</div>
          {availableBonuses.length === 0 && availableAvantages.length === 0 && availableActions.length === 0 && availableActionsSupp.length === 0 ? (
            <div style={{ padding: '12px 0', textAlign: 'center' }}>
              <div style={{ fontSize: 20, marginBottom: 6 }}>✦</div>
              <div style={{ fontSize: 14, color: `rgba(245,236,215,0.3)`, lineHeight: 1.5 }}>{t('gameMode.noEffectsTitle')}<br />{t('gameMode.noEffectsDesc')}</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {availableActions.map((action, i) => (
                <div key={`action-${i}`} style={{ padding: '8px 10px', borderRadius: 5, background: 'rgba(140,100,255,0.08)', border: `1px ${action.activable ? 'solid' : 'dashed'} rgba(160,120,255,0.35)` }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'rgba(200,170,255,0.95)' }}>{action.rangNom}</span>
                    <span style={{ fontSize: 12, color: `rgba(245,236,215,0.3)` }}>{t('gameMode.rangVoie', { rang: action.rangIdx + 1, voie: action.voieNom })}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(200,170,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>⚔️</span> {t('gameMode.actionType')}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: action.activable ? 8 : 0, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, color: PARCHMENT, opacity: 0.6 }}>{t('gameMode.actionSummary', { de: action.de, dm: action.dm })}</span>
                    {action.cout_pm && <span style={{ fontSize: 12, color: 'rgba(123,170,232,0.9)', background: 'rgba(123,170,232,0.1)', border: '1px solid rgba(123,170,232,0.3)', borderRadius: 3, padding: '1px 6px' }}>{action.cout_pm} {t('gameMode.pm')}</span>}
                    {(() => {
                      const flat = action.cout_pm ? parseFlatCost(action.cout_pm) : null
                      if (flat === null || pmActuels >= flat) return null
                      return <span style={{ fontSize: 12, color: '#ff8a5c', background: 'rgba(255,90,30,0.12)', border: '1px solid rgba(255,90,30,0.4)', borderRadius: 3, padding: '1px 6px', fontWeight: 600 }}>{t('gameMode.manaBurnWarning')}</span>
                    })()}
                    {!action.activable && (
                      <span style={{ fontSize: 12, background: 'rgba(140,100,255,0.15)', border: '1px solid rgba(160,120,255,0.4)', borderRadius: 3, padding: '1px 7px', color: 'rgba(200,170,255,0.8)', fontWeight: 600 }}>{t('gameMode.automatic')}</span>
                    )}
                  </div>
                  {action.activable && (
                    <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                      <button disabled={isUnconscious} onClick={() => handleActionAttaque(action)} style={{ flex: 1, fontSize: 14, padding: '6px 10px', borderRadius: 4, cursor: isUnconscious ? 'not-allowed' : 'pointer', fontWeight: 600, border: '1px solid rgba(160,120,255,0.5)', background: 'rgba(140,100,255,0.15)', color: 'rgba(200,170,255,0.9)', opacity: isUnconscious ? 0.35 : 1 }}>
                        {action.attType
                          ? t('gameMode.attackButtonTyped', { de: action.de, type: t(`gameMode.type${action.attType === 'contact' ? 'Contact' : action.attType === 'distance' ? 'Distance' : 'Magique'}`) })
                          : t('gameMode.attackButtonPlain', { de: action.de })}
                      </button>
                      <button disabled={isUnconscious || !peutAgir} onClick={() => handleActionDegats(action)}
                        title={!peutAgir ? t('gameMode.actionsEpuiseesTitle') : undefined}
                        style={{ flex: 1, fontSize: 14, padding: '6px 10px', borderRadius: 4, cursor: (isUnconscious || !peutAgir) ? 'not-allowed' : 'pointer', fontWeight: 600, border: '1px solid rgba(160,120,255,0.35)', background: 'rgba(140,100,255,0.08)', color: 'rgba(200,170,255,0.7)', opacity: (isUnconscious || !peutAgir) ? 0.35 : 1 }}>
                        {t('gameMode.damageButton', { dm: action.dm })}
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {availableActionsSupp.map((asup, i) => (
                <div key={`asup-${i}`} style={{ padding: '8px 10px', borderRadius: 5, background: 'rgba(140,100,255,0.08)', border: '1px dashed rgba(160,120,255,0.35)' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'rgba(200,170,255,0.95)' }}>{asup.rangNom}</span>
                    <span style={{ fontSize: 12, color: `rgba(245,236,215,0.3)` }}>{t('gameMode.rangVoie', { rang: asup.rangIdx + 1, voie: asup.voieNom })}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(200,170,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>⚔️</span> {asup.label}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                    <span style={{ fontSize: 14, color: PARCHMENT }}>{t('gameMode.actionsSuppDesc', { count: asup.nombre })}</span>
                    <span style={{ fontSize: 12, background: 'rgba(140,100,255,0.15)', border: '1px solid rgba(160,120,255,0.4)', borderRadius: 3, padding: '1px 7px', color: 'rgba(200,170,255,0.8)', fontWeight: 600 }}>{t('gameMode.automatic')}</span>
                  </div>
                </div>
              ))}
              {availableAvantages.map((av, i) => (
                <div key={`av-${i}`} style={{ padding: '8px 10px', borderRadius: 5, background: 'rgba(140,100,255,0.08)', border: '1px dashed rgba(160,120,255,0.35)' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'rgba(200,170,255,0.95)' }}>{av.rangNom}</span>
                    <span style={{ fontSize: 12, color: `rgba(245,236,215,0.3)` }}>{t('gameMode.rangVoie', { rang: av.rangIdx + 1, voie: av.voieNom })}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(200,170,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>🎲</span> {t('gameMode.advantageTitle', { stat: av.stat })}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                    <span style={{ fontSize: 14, color: PARCHMENT }}>{t('gameMode.advantageDesc', { count: av.garder, lancer: av.lancer, garder: av.garder })}</span>
                    <span style={{ fontSize: 12, background: 'rgba(140,100,255,0.15)', border: '1px solid rgba(160,120,255,0.4)', borderRadius: 3, padding: '1px 7px', color: 'rgba(200,170,255,0.8)', fontWeight: 600 }}>{t('gameMode.automatic')}</span>
                  </div>
                </div>
              ))}
              {availableBonuses.map((ab, i) => {
                const equippedWeapons = [character.arme1, character.arme2].filter(Boolean)
                const weaponKey = boostKey(ab)
                const needsWeaponChoice = !!ab.deDegats && !!ab.deDegatsParArme && equippedWeapons.length >= 2
                const resolvedWeapon = ab.deDegats ? getDeDegatsWeapon(ab) : undefined
                const showStandaloneRoll = !!ab.deDegats && (ab.deDegatsParArme ? !resolvedWeapon : equippedWeapons.length === 0)
                const weaponPicker = needsWeaponChoice && (
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 6 }}>
                    <span style={{ fontSize: 11, color: 'rgba(245,236,215,0.4)' }}>{t('gameMode.weaponLabel')}</span>
                    {equippedWeapons.map(w => (
                      <button key={w} onClick={() => setDeDegatsWeapon(prev => ({ ...prev, [weaponKey]: w }))}
                        style={{ ...btnStyle(deDegatsWeapon[weaponKey] === w), flex: 1, fontSize: 12, padding: '4px 6px' }}>
                        {w}
                      </button>
                    ))}
                  </div>
                )
                if (!ab.temporaire) {
                  return (
                    <div key={i} style={{ padding: '8px 10px', borderRadius: 5, background: 'rgba(140,100,255,0.08)', border: '1px dashed rgba(160,120,255,0.35)' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: 'rgba(200,170,255,0.95)' }}>{ab.rangNom}</span>
                        <span style={{ fontSize: 12, color: `rgba(245,236,215,0.3)` }}>{t('gameMode.rangVoie', { rang: ab.rangIdx + 1, voie: ab.voieNom })}</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(200,170,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span>⚡</span> {t('gameMode.bonusPermanent')}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: ab.deDegats ? 8 : 0 }}>
                        <span style={{ fontSize: 14, color: PARCHMENT }}>{ab.deDegats ? `+${ab.deDegats}` : formatBonusLabel(ab)} {ab.cibles.join(' + ')}{ab.precision ? ` ${ab.precision}` : ''}</span>
                        <span style={{ fontSize: 12, background: 'rgba(140,100,255,0.15)', border: '1px solid rgba(160,120,255,0.4)', borderRadius: 3, padding: '1px 7px', color: 'rgba(200,170,255,0.8)', fontWeight: 600 }}>{t('gameMode.alwaysActive')}</span>
                      </div>
                      {weaponPicker}
                      {showStandaloneRoll && (
                        <button disabled={isUnconscious || !peutAgir} onClick={() => handleRollBonusDice(ab)}
                          title={!peutAgir ? t('gameMode.actionsEpuiseesTitle') : undefined}
                          style={{ width: '100%', fontSize: 14, padding: '6px 10px', borderRadius: 4, cursor: (isUnconscious || !peutAgir) ? 'not-allowed' : 'pointer', fontWeight: 600, border: '1px solid rgba(255,150,80,0.5)', background: 'rgba(255,150,80,0.12)', color: 'rgba(255,180,120,0.95)', marginTop: needsWeaponChoice ? 6 : 0, opacity: (isUnconscious || !peutAgir) ? 0.35 : 1 }}>
                          {t('gameMode.rollBonus', { dice: ab.deDegats })}
                        </button>
                      )}
                    </div>
                  )
                }
                const isPending = pendingStatPick?.abIdx === i
                const activationKey = boostKey(ab)
                const remainingTurns = effectCounters[activationKey] ?? 0
                const alreadyUsed = remainingTurns > 0
                return (
                  <div key={i} style={{ padding: '8px 10px', borderRadius: 5, background: isPending ? 'rgba(140,100,255,0.14)' : 'rgba(140,100,255,0.08)', border: `1px solid ${isPending ? 'rgba(160,120,255,0.6)' : 'rgba(160,120,255,0.35)'}` }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: 'rgba(200,170,255,0.95)' }}>{ab.rangNom}</span>
                      <span style={{ fontSize: 12, color: `rgba(245,236,215,0.3)` }}>{t('gameMode.rangVoie', { rang: ab.rangIdx + 1, voie: ab.voieNom })}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(200,170,255,0.55)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span>⚡</span> {t('gameMode.bonusTemporary')}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: 14, color: PARCHMENT }}>{ab.deDegats ? `+${ab.deDegats}` : formatBonusLabel(ab)} {ab.cibles.join(ab.choix ? ' ou ' : ' + ')}{ab.precision ? ` ${ab.precision}` : ''}</span>
                      {ab.cout_pv && <span style={{ fontSize: 13, color: 'rgba(220,80,80,0.9)', background: 'rgba(220,50,50,0.1)', border: '1px solid rgba(220,50,50,0.3)', borderRadius: 3, padding: '1px 6px' }}>{ab.cout_pv} {t('gameMode.pv')}</span>}
                      {ab.cout_pm && <span style={{ fontSize: 13, color: 'rgba(123,170,232,0.9)', background: 'rgba(123,170,232,0.1)', border: '1px solid rgba(123,170,232,0.3)', borderRadius: 3, padding: '1px 6px' }}>{ab.cout_pm} {t('gameMode.pm')}</span>}
                      {(() => {
                        const flat = ab.cout_pm ? parseFlatCost(ab.cout_pm) : null
                        if (flat === null || pmActuels >= flat) return null
                        return <span style={{ fontSize: 13, color: '#ff8a5c', background: 'rgba(255,90,30,0.12)', border: '1px solid rgba(255,90,30,0.4)', borderRadius: 3, padding: '1px 6px', fontWeight: 600 }}>{t('gameMode.manaBurnWarning')}</span>
                      })()}
                      {ab.coutCaracStat && ab.coutCaracValeur && <span style={{ fontSize: 13, color: 'rgba(220,80,80,0.9)', background: 'rgba(220,50,50,0.1)', border: '1px solid rgba(220,50,50,0.3)', borderRadius: 3, padding: '1px 6px' }}>-{ab.coutCaracValeur} {ab.coutCaracStat}</span>}
                      {ab.usage && <span style={{ fontSize: 13, color: `rgba(245,236,215,0.5)`, background: 'rgba(0,0,0,0.3)', border: `1px solid rgba(160,120,255,0.25)`, borderRadius: 3, padding: '1px 6px' }}>{formatUsage(ab.usage)}</span>}
                      {ab.post_jet && <span style={{ fontSize: 13, color: 'rgba(200,170,255,0.6)', fontStyle: 'italic' }}>{t('gameMode.afterRollTag')}</span>}
                    </div>
                    {!isPending ? (
                      <button
                        onClick={() => !alreadyUsed && !isUnconscious && handleActivateClick(ab, i)}
                        disabled={alreadyUsed || isUnconscious || (!!ab.cout_pm && !peutAgir)}
                        title={ab.cout_pm && !peutAgir ? t('gameMode.actionsEpuiseesTitle') : undefined}
                        style={{
                          width: '100%', fontSize: 14, padding: '6px 10px', borderRadius: 4, fontWeight: 600, marginBottom: 6,
                          cursor: (alreadyUsed || isUnconscious || (ab.cout_pm && !peutAgir)) ? 'not-allowed' : 'pointer',
                          border: `1px solid ${alreadyUsed ? 'rgba(160,120,255,0.2)' : 'rgba(160,120,255,0.5)'}`,
                          background: alreadyUsed ? 'rgba(140,100,255,0.05)' : 'rgba(140,100,255,0.15)',
                          color: alreadyUsed ? 'rgba(200,170,255,0.35)' : 'rgba(200,170,255,0.9)',
                          opacity: (isUnconscious || (ab.cout_pm && !peutAgir)) ? 0.35 : 1,
                        }}>
                        {alreadyUsed ? t('gameMode.activeTurns', { count: remainingTurns }) : t('gameMode.activate')}
                      </button>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 6 }}>
                        <span style={{ fontSize: 12, color: `rgba(245,236,215,0.6)` }}>{t('gameMode.chooseStatToBoost')}</span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {ab.cibles.map(stat => (
                            <button key={stat} onClick={() => handleStatPick(ab, stat)} style={{ flex: 1, fontSize: 13, padding: '6px 10px', borderRadius: 4, cursor: 'pointer', fontWeight: 600, border: '1px solid rgba(160,120,255,0.7)', background: 'rgba(140,100,255,0.25)', color: 'rgba(220,200,255,0.95)' }}>
                              {formatBonusLabel(ab)} {stat}
                            </button>
                          ))}
                          <button onClick={() => setPendingStatPick(null)} style={{ ...btnStyle(false), padding: '6px 10px', fontSize: 13 }}>✕</button>
                        </div>
                      </div>
                    )}
                    {ab.deDegats && alreadyUsed && weaponPicker}
                    {ab.deDegats && alreadyUsed && showStandaloneRoll && (
                      <button disabled={isUnconscious} onClick={() => handleRollBonusDice(ab)} style={{ width: '100%', fontSize: 14, padding: '6px 10px', borderRadius: 4, cursor: isUnconscious ? 'not-allowed' : 'pointer', fontWeight: 600, border: '1px solid rgba(255,150,80,0.5)', background: 'rgba(255,150,80,0.12)', color: 'rgba(255,180,120,0.95)', marginTop: needsWeaponChoice ? 6 : 0, opacity: isUnconscious ? 0.35 : 1 }}>
                        {t('gameMode.rollBonus', { dice: ab.deDegats })}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Section : Capacités empruntées (texte) — voir rangsEmpruntesTexte ── */}
        {rangsEmpruntesTexte.length > 0 && (
          <div style={SECTION_DIVIDER}>
            <div style={{ fontSize: 13, color: `rgba(201,168,76,0.85)`, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              {t('gameMode.rangsEmpruntesTitre')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {rangsEmpruntesTexte.map(({ voieNom, rangIdx, rangData, grantKey }) => (
                <div key={grantKey} style={{ padding: '8px 10px', borderRadius: 5, background: 'rgba(201,168,76,0.05)', border: '1px dashed rgba(201,168,76,0.3)' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: GOLD }}>{rangData.nom}</span>
                    <span style={{ fontSize: 12, color: `rgba(245,236,215,0.3)` }}>{t('gameMode.rangVoie', { rang: rangIdx + 1, voie: voieNom })}</span>
                  </div>
                  {/* Même rendu que sur la fiche : le texte des capacités contient du balisage
                      (**gras**, ==surligné==, [formules]) qui doit être interprété, pas affiché brut. */}
                  <div style={{ fontSize: 13, color: 'rgba(245,236,215,0.6)', lineHeight: 1.4 }}>
                    {parseDesc(rangData.desc, character, descriptions, rangIdx + 1)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* Tooltip custom, même design que celui de la fiche de personnage (fond sombre, bordure dorée) */}
      {gmTooltip && (
        <div style={{
          position: 'fixed', left: gmTooltip.x, top: gmTooltip.y,
          transform: gmTooltip.below ? 'translate(-50%, 8px)' : 'translate(-50%, calc(-100% - 8px))',
          maxWidth: 220, background: 'rgba(20,15,8,0.97)', color: '#e8dfc0',
          border: `1px solid ${GOLD}`, borderRadius: 4, padding: '8px 10px',
          fontSize: 13, lineHeight: 1.5, zIndex: 9999, pointerEvents: 'none',
          boxShadow: '0 2px 8px rgba(0,0,0,0.7)', whiteSpace: 'pre-line',
        }}>
          <div style={{ fontWeight: 700, color: GOLD, marginBottom: gmTooltip.desc ? 6 : 0, fontSize: '1.05em' }}>{gmTooltip.title}</div>
          {gmTooltip.desc && <div>{gmTooltip.desc}</div>}
        </div>
      )}

      {carteAffichee && (
        <CarteCritiqueModal
          carte={carteAffichee.carte}
          categorie={carteAffichee.categorie}
          typeAttaque={carteAffichee.typeAttaque}
          onClose={() => setCarteAffichee(null)}
        />
      )}

      {missionModaleOuverte && (() => {
        const mission = missionsActives.find(m => m.id === missionModaleOuverte)
        if (!mission) return null
        return (
          <MissionModale
            mission={mission}
            chat={reseau.missionChat.filter(l => l.missionId === mission.id)}
            input={missionChatInput[mission.id] ?? ''}
            onInputChange={v => setMissionChatInput(prev => ({ ...prev, [mission.id]: v }))}
            onEnvoyer={() => envoyerChatMission(mission.id)}
            onLancerDe={sides => lancerDeMission(mission.id, sides)}
            nbDes={nbDesInput}
            onNbDesChange={setNbDesInput}
            onFermer={() => setMissionModaleOuverte(null)}
          />
        )
      })()}
    </div>
  )
}
