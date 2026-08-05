import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useGameData } from '../../context/GameDataContext'
import CombatCard from './CombatCard'
import PJCard from './PJCard'
import { importPJ, resoudreAttaque, appliquerDegatsCible, listerEntites, tickerDots, construireOrdreInitiative, insererDansOrdreInitiative, ajouterHistorique } from '../../utils/combat'
import type { CombatSession, CombatCreature, RollResult, DotActif } from '../../utils/combat'
import type { Character } from '../../types/character'
import type { DescMap } from '../../types/gameData'
import { ICONES_TYPES_DEGATS } from '../../utils/damageTypes'
import { compagnonEnCreature, getCompagnonsOrdonnes, estCompagnonActif } from '../../utils/compagnons'
import { computeInitiativeTotale } from '../../utils/computeEffects'
import { desenvelopper, messageMauvaisType } from '../../utils/importTypage'
import { ecouterReseau, envoyerAClientReseau, envoyerATousReseau } from '../../utils/reseau'
import { encoderMessage, decoderMessage, idPJ } from '../../utils/reseauProtocole'
import { chargerImage, compresserImage, estCleImage } from '../../utils/imageStore'
import type { CarteCritique, CategorieCarteCritique } from '../../data/cartesCritiques'
import { piocherCarteActive } from '../../utils/cartesCritiquesPerso'
import CarteCritiqueModal from '../CarteCritiqueModal'

const GOLD = '#c9a84c'
const PARCHMENT = '#f5ecd7'
const SECTION_BORDER = 'rgba(201,168,76,0.2)'
const LINK_COLOR = 'rgba(200,170,255,0.85)'          // liens partant d'une créature
const LINK_COLOR_PJ = 'rgba(110,220,200,0.85)'       // liens partant d'un PJ — teinte distincte

// Même convention que EquipementModal.tsx/ChampsVerso.tsx/etc. (dupliqué localement par fichier dans ce
// projet, pas de helper partagé) — retrouver un compagnon par nom malgré un éventuel marqueur de
// footnote (¹²³...) dans son nom affiché (voir 'degats'.compagnonNom dans reseauProtocole.ts).
const stripExposants = (s: string) => s.replace(/[¹²³⁴⁵⁶⁷*]\s*/g, '').trim()

// État de ciblage envoyé à UN PJ précis (voir 'etat-ciblage' dans reseauProtocole.ts) : jamais def/rd/
// pvActuels (voir CombatEntiteInfo — ce sont précisément les champs qu'un joueur ne doit jamais voir,
// contrairement au MJ dans SelecteurCible.tsx), juste de quoi choisir une cible et savoir qui le vise.
// Fonction pure (pas de dépendance au rendu) pour pouvoir être appelée aussi bien depuis l'effet
// [session, descriptions] (voir plus bas) que depuis la branche 'identification' de l'écoute réseau
// (fermeture figée à l'abonnement, d'où sessionRef/descriptionsRef côté appelant).
function etatCiblagePourPJ(pj: CombatSession['pjs'][number], session: CombatSession, descriptions: DescMap) {
  const toutesEntites = listerEntites(session, descriptions)
  // Juste pour retrouver un NOM à partir d'un id (voir cible/ordreInitiative ci-dessous) — jamais pour
  // exposer autre chose : nomParId ne contient que ce que toutesEntites contient déjà, {id, nom}.
  const nomParId = new Map(toutesEntites.map(e => [e.id, e.nom]))
  const ordre = session.ordreInitiative ?? []
  const tourActuelIndex = session.tourActuelIndex ?? 0

  const ciblesDisponibles = toutesEntites
    .filter(c => c.camp === 'creature')
    .map(({ id, nom, pvActuels }) => {
      const combatant = session.combatants.find(c => c.id === id)
      return {
        id, nom, mort: pvActuels <= 0,
        // Calculé par ID ici (pas par nom côté PJ comme précédemment) : deux ennemis homonymes (ex. 3
        // gobelins identiques) tombaient sinon tous sur la même entrée de l'ordre d'initiative et
        // affichaient le même statut (bug signalé par Didic) — id toujours unique, contrairement au nom.
        enCours: ordre.findIndex(e => e.id === id) === tourActuelIndex,
        // Qui cet ennemi vise actuellement — un PJ, un compagnon (même d'un AUTRE PJ) ou une autre
        // créature, peu importe : juste le nom (demandé par Didic), jamais de PV/stats sur cette cible.
        cible: combatant?.cibleId ? (nomParId.get(combatant.cibleId) ?? null) : null,
      }
    })
  const ciblesSurMoi = [
    ...session.combatants.filter(c => c.cibleId === pj.id).map(c => c.creature.nom),
    ...session.pjs.filter(p => p.cibleId === pj.id).map(p => p.character.nomPersonnage),
    ...session.compagnons.filter(c => c.cibleId === pj.id).map(c => c.creature.nom),
  ]
  // PV de SES PROPRES compagnons (jamais des ennemis, voir la note dans reseauProtocole.ts) — le joueur
  // ne les voyait jusqu'ici jamais changer quand une créature les touchait (signalé par Didic), là où le
  // PV de sa propre fiche, lui, était déjà transmis (voir 'pv-actualises'). estSonTour : dérivé de
  // l'ordre d'initiative, comme estMonTour ci-dessous pour le PJ lui-même.
  const compagnons = session.compagnons
    .filter(c => c.pjProprietaireId === pj.id)
    .map(c => ({
      nom: c.creature.nom, pvActuels: c.pvActuels, pvMax: Number(c.creature.pv) || 0,
      estSonTour: ordre.findIndex(e => e.id === c.id) === tourActuelIndex,
    }))
  // estMonTour : calculé ici (pas par le joueur lui-même) car il ne connaît jamais son propre
  // CombatPJ.id interne (rien dans le protocole ne le lui transmet — seul idPJ(character), un hash
  // d'identité, jamais l'id éphémère de session). ordreInitiative : le tableau complet, pour l'affichage
  // du même ordre côté joueur (voir la vue Combat de GameModePanel.tsx) — enCours/aJoue dérivés de la
  // position par rapport à tourActuelIndex, remplace l'ancien champ aJoueCeTour synchronisé par PJ.
  const estMonTour = ordre.findIndex(e => e.id === pj.id) === tourActuelIndex
  const ordreInitiative = ordre.map((e, i) => ({
    nom: nomParId.get(e.id) ?? '?',
    enCours: i === tourActuelIndex,
    aJoue: i < tourActuelIndex,
  }))
  return { ciblesDisponibles, ciblesSurMoi, compagnons, estMonTour, ordreInitiative, round: session.round ?? 1 }
}

// Résout puis transmet le portrait d'UNE créature à UN client précis, une seule fois (voir dejaEnvoyees,
// alimenté par imagesEnvoyeesRef côté appelant) — la valeur stockée sur la créature peut être une "clé"
// (nouveau format, à résoudre via chargerImage) ou une data URL directe (ancien format, déjà utilisable
// telle quelle, voir estCleImage), même branchement que le hook useImage côté affichage local.
async function envoyerImageCibleSiNecessaire(connexionId: number, id: string, imageValeur: string | undefined, dejaEnvoyees: Set<string>) {
  if (!imageValeur || dejaEnvoyees.has(id)) return
  dejaEnvoyees.add(id)
  const brute = estCleImage(imageValeur) ? await chargerImage(imageValeur) : imageValeur
  if (!brute) return
  const compressee = await compresserImage(brute)
  envoyerAClientReseau(connexionId, encoderMessage({ type: 'image-cible', id, dataUrl: compressee }))
}

// Boucle sur toutes les créatures de la rencontre pour UN client — le portrait du PJ et de ses
// compagnons n'a pas besoin de ce chemin (déjà présent localement sur sa propre fiche, voir
// GameModePanel.tsx).
function envoyerImagesCiblesPourPJ(connexionId: number, session: CombatSession, envoyees: Record<number, Set<string>>) {
  if (!envoyees[connexionId]) envoyees[connexionId] = new Set()
  const dejaEnvoyees = envoyees[connexionId]
  for (const c of session.combatants) {
    envoyerImageCibleSiNecessaire(connexionId, c.id, c.creature.image, dejaEnvoyees)
  }
}

interface Props {
  session: CombatSession | null
  onSessionChange: (session: CombatSession) => void
  onEndSession: () => void
  onSauvegarder: () => void
}

// Les colonnes réordonnables indépendamment (voir le suivi au pointeur plus bas) — un compagnon ne se
// mélange jamais aux PJ dans l'ordre, même s'il partage leur colonne visuelle. 'initiative' : le
// tableau d'ordre d'initiative, même mécanisme de glisser-déposer que les trois autres (demandé par
// Didic plutôt que des flèches ▲/▼).
type ListeDrag = 'creature' | 'pj' | 'compagnon' | 'initiative'

type Link = {
  id: string; x1: number; y1: number; x2: number; y2: number
  midY: number   // hauteur du coude horizontal, déjà calculée pour ne traverser aucune carte
  source: 'creature' | 'pj'
  aResultat?: boolean   // un jet valide existe pour la cible actuellement assignée (touché ou raté)
  jetTotal?: number
  cibleDef?: number
  degatsTotal?: number
  rdAppliquee?: number
  degatsAppliques?: number
  toucheRate?: boolean
  typeDegats?: string
}

export default function CombatTab({ session, onSessionChange, onEndSession, onSauvegarder }: Props) {
  const { t } = useTranslation()
  const { data: descriptions, compagnons: compagnonsCatalogue, cartesCritiquesEchecs, cartesCritiquesReussites } = useGameData()
  const [pjPanelOpen, setPjPanelOpen] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const areaRef = useRef<HTMLDivElement>(null)
  const creaturesColRef = useRef<HTMLDivElement>(null)
  const pjsColRef = useRef<HTMLDivElement>(null)
  const initiativeColRef = useRef<HTMLDivElement>(null)
  const [links, setLinks] = useState<Link[]>([])
  // Part (0 à 1) de la largeur totale attribuée à la colonne Créatures — le reste va aux PJ. Ajustable
  // en glissant la barre de séparation (voir resizeRef ci-dessous) ; conservée dans la session (donc
  // incluse dans l'instantané sauvegardé) plutôt qu'en état local, pour survivre à une sauvegarde/reprise.
  const splitRatio = session?.splitRatio ?? 0.5
  const [isResizingSplit, setIsResizingSplit] = useState(false)
  const resizeRef = useRef<{ startX: number; startRatio: number; areaWidth: number } | null>(null)

  // Correspondance connexion réseau → idPJ (voir reseauProtocole.ts), alimentée au fil des messages
  // d'identification reçus (un joueur connecté envoie son idPJ dès l'ouverture, voir useReseauClient) —
  // idPJ, pas le nom : deux joueurs pourraient choisir le même nom de personnage, idPJ reste unique
  // (nom perso + nom joueur + peuple). En ref (pas un state) : rien dans l'UI n'affiche cette liste,
  // seuls handleAttaque et l'écoute réseau (abonnée une seule fois, voir plus bas) ont besoin de sa
  // valeur la plus récente.
  const clientsPJRef = useRef<Record<number, string>>({})
  // Créatures dont le portrait a déjà été transmis à CHAQUE connexion (voir envoyerImagesCiblesSiNecessaire
  // et 'image-cible' dans reseauProtocole.ts) — évite de renvoyer les mêmes octets à chaque changement de
  // session (etat-ciblage, lui, se met à jour à chaque attaque/PV modifié, mais une image ne change
  // presque jamais en cours de combat). Un doublon après reconnexion (nouveau connexionId) est sans
  // conséquence, juste un envoi superflu.
  const imagesEnvoyeesRef = useRef<Record<number, Set<string>>>({})
  // handleAttaquePJ est redéfini à chaque rendu (ferme sur le session de CE rendu) : l'écoute réseau,
  // abonnée une seule fois au montage, doit passer par cette ref (mise à jour juste après sa définition
  // plus bas) pour toujours appeler la version la plus récente — sinon les dégâts reçus par réseau
  // s'appliqueraient toujours sur l'état de session du tout premier rendu.
  const handleAttaquePJRef = useRef<(pj: CombatSession['pjs'][number], montant: number, type: string) => void>(() => {})
  // Même besoin, pour les dégâts infligés par un COMPAGNON du PJ (voir 'degats'.compagnonNom dans
  // reseauProtocole.ts et handleAttaqueCompagnonPJ plus bas) — chemin parallèle à handleAttaquePJRef,
  // pas une extension de celui-ci : la cible résolue est celle du compagnon (compagnon.cibleId), pas
  // celle du PJ.
  const handleAttaqueCompagnonPJRef = useRef<(compagnon: CombatCreature, montant: number, type: string) => void>(() => {})
  // Même besoin, pour appliquer une valeur de PV reçue par réseau (voir 'pv-actualises') sur la session
  // la plus récente — updatePJ est redéfini à chaque rendu comme handleAttaquePJ ci-dessus.
  const updatePJRef = useRef<(id: string, patch: Partial<CombatSession['pjs'][number]>) => void>(() => {})
  // Même besoin, pour appliquer une cible choisie par le joueur pour l'UN de ses compagnons (voir
  // 'cible-choisie-compagnon' dans reseauProtocole.ts) — updateCompagnon est lui aussi redéfini à chaque
  // rendu.
  const updateCompagnonRef = useRef<(id: string, patch: Partial<CombatCreature>) => void>(() => {})
  // Même besoin, pour repousser en fin d'ordre l'entrée d'un PJ (ou de l'un de ses compagnons) qui
  // choisit d'"attendre" son tour (voir 'attendre-mon-tour' dans reseauProtocole.ts) —
  // handleAttendreMonTour est lui aussi redéfini à chaque rendu, ferme sur session/onSessionChange.
  const attendreMonTourRef = useRef<(pjId: string, compagnonNom?: string) => void>(() => {})
  // Même besoin que handleAttaquePJRef ci-dessus : l'écoute réseau doit retrouver le PJ par nom dans la
  // session la PLUS RÉCENTE, pas celle du rendu où elle s'est abonnée. Synchronisée dans un effet (pas
  // pendant le rendu) : écrire une ref pendant le rendu est interdit par les règles des Hooks.
  const sessionRef = useRef(session)
  useEffect(() => { sessionRef.current = session })
  // Même besoin que sessionRef ci-dessus : la poussée d'état de ciblage déclenchée depuis la branche
  // 'identification' de l'écoute réseau (abonnée une seule fois) doit lire les descriptions les plus
  // récentes, pas celles du tout premier rendu (voir etatCiblagePourPJ plus bas).
  const descriptionsRef = useRef(descriptions)
  useEffect(() => { descriptionsRef.current = descriptions })
  // PJ connectés au réseau mais pas encore engagés dans la rencontre (voir activerPJ plus bas) —
  // alimentée directement par l'écoute réseau : un setter issu de useState est stable par nature en
  // React (contrairement à une fonction redéfinie à chaque rendu), pas besoin d'une ref d'indirection ici.
  const [pjsEnAttente, setPjsEnAttente] = useState<{ connexionId: number; character: Character }[]>([])
  // PJ importés par fichier (voir handleFiles) mais pas encore engagés — même principe que pjsEnAttente
  // côté réseau, pour que le MJ voie clairement d'où vient chaque PJ avant de l'ajouter à la rencontre.
  const [pjsImportesEnAttente, setPjsImportesEnAttente] = useState<Character[]>([])

  // Réorganisation par pointeur des cartes (créatures ET PJ, chacune dans sa propre colonne — jamais
  // l'une vers l'autre). Le drag-and-drop HTML5 natif (draggable/dragover/drop) n'est pas fiable dans
  // la webview Linux (WebKitGTK) : le survol n'y déclenche jamais preventDefault, donnant un curseur
  // « interdit » permanent sans la moindre case fantôme ni erreur JS — remplacé ici par un suivi au
  // pointeur, même principe que la barre de séparation ci-dessous et le glisser de nœud dans NotesGraph.
  // dragState.width/height sont capturés au pointerdown (taille réelle de la carte, repliée ou dépliée)
  // pour dimensionner la case fantôme à l'identique. dropIndex est l'index d'insertion visé dans la
  // liste survolée, affiché comme case fantôme entre deux cartes (ou en bout de liste) ; rien n'est
  // réordonné tant que le pointeur n'est pas relâché, la carte glissée reste visible à sa place
  // d'origine, juste atténuée, pendant le survol.
  // Carte de réussite/échec critique tirée sur un 1/20 naturel (voir HistoriqueEntreeBloc.tsx →
  // CombatCard.tsx/PJCard.tsx → ici) — un seul état partagé par toute la rencontre, pas un par carte :
  // aucune attaque de créature n'est typée contact/distance/magique (CreatureAttaque n'a pas ce champ),
  // la modale montre donc systématiquement les trois blocs, au MJ de lire celui qui convient.
  const [carteAffichee, setCarteAffichee] = useState<{ categorie: CategorieCarteCritique; carte: CarteCritique } | null>(null)
  const tirerCarte = useCallback((categorie: CategorieCarteCritique) => {
    const carte = piocherCarteActive(categorie === 'echec' ? cartesCritiquesEchecs : cartesCritiquesReussites)
    setCarteAffichee({ categorie, carte })
  }, [cartesCritiquesEchecs, cartesCritiquesReussites])
  const [dragState, setDragState] = useState<{ liste: ListeDrag; id: string; width: number; height: number; startX: number; startY: number } | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  // Suivi du glisser en cours dans une ref (pas un state) : lu de façon synchrone par le pointerup, qui
  // ne doit jamais agir sur une valeur de dropIndex périmée d'un rendu précédent.
  const pointerDragRef = useRef<{
    liste: ListeDrag; id: string; width: number; height: number
    startX: number; startY: number; started: boolean; dropIndex: number | null
  } | null>(null)
  // Aperçu qui suit le curseur pendant le glisser — le drag-and-drop natif fournissait cet aperçu
  // gratuitement (image fantôme générée par le navigateur) ; en suivi au pointeur il faut le fournir
  // soi-même. Position mise à jour directement en DOM (pas par un state React) pour rester fluide à
  // chaque pointermove sans repasser par un rendu complet du composant à chaque pixel.
  const previewRef = useRef<HTMLDivElement>(null)

  const handleCardPointerDown = (liste: ListeDrag, id: string) => (e: React.PointerEvent<HTMLDivElement>) => {
    // Jamais depuis un clic droit/secondaire, ni depuis un contrôle interactif de la carte (bouton,
    // champ, select) — sinon impossible d'interagir avec la carte sans déclencher un glisser accidentel.
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('button, input, select, textarea, a')) return
    // Sans ça, glisser le pointeur au-dessus du texte des AUTRES cartes pendant le survol sélectionne
    // ce texte (comportement par défaut du navigateur pour un bouton maintenu en mouvement) — moche et
    // gênant. preventDefault ici bloque uniquement la sélection/le focus, pas le clic synthétique React
    // (qui dépend de la paire down/up, pas de ce preventDefault).
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    pointerDragRef.current = {
      liste, id, width: rect.width, height: rect.height,
      startX: e.clientX, startY: e.clientY, started: false, dropIndex: null,
    }
  }

  // Carte la plus proche du curseur (centre à centre) parmi les emplacements de CETTE liste (repérés
  // par data-drag-liste, pas juste data-drag-index) — un compagnon partage la colonne visuelle des PJ
  // mais forme un groupe réordonnable à part, donc filtrer seulement par data-drag-index mélangerait
  // les deux index-spaces. Avant la carte si le curseur est dans sa moitié gauche, après sinon.
  function indexDepot(conteneur: HTMLElement, liste: ListeDrag, clientX: number, clientY: number, total: number): number {
    const emplacements = Array.from(conteneur.querySelectorAll<HTMLElement>(`[data-drag-liste="${liste}"]`))
    if (emplacements.length === 0) return total
    let meilleur = emplacements[0]
    let meilleureDistance = Infinity
    for (const el of emplacements) {
      const r = el.getBoundingClientRect()
      const dx = clientX - (r.left + r.width / 2)
      const dy = clientY - (r.top + r.height / 2)
      const distance = dx * dx + dy * dy
      if (distance < meilleureDistance) { meilleureDistance = distance; meilleur = el }
    }
    const r = meilleur.getBoundingClientRect()
    const index = Number(meilleur.dataset.dragIndex)
    return clientX < r.left + r.width / 2 ? index : index + 1
  }

  const commitDrop = useCallback((liste: ListeDrag, id: string, dropIndex: number) => {
    if (!session) return
    if (liste === 'creature') {
      const list = [...session.combatants]
      const fromIndex = list.findIndex(c => c.id === id)
      if (fromIndex === -1) return
      const [item] = list.splice(fromIndex, 1)
      list.splice(fromIndex < dropIndex ? dropIndex - 1 : dropIndex, 0, item)
      onSessionChange({ ...session, combatants: list })
    } else if (liste === 'pj') {
      const list = [...session.pjs]
      const fromIndex = list.findIndex(p => p.id === id)
      if (fromIndex === -1) return
      const [item] = list.splice(fromIndex, 1)
      list.splice(fromIndex < dropIndex ? dropIndex - 1 : dropIndex, 0, item)
      onSessionChange({ ...session, pjs: list })
    } else if (liste === 'compagnon') {
      const list = [...session.compagnons]
      const fromIndex = list.findIndex(c => c.id === id)
      if (fromIndex === -1) return
      const [item] = list.splice(fromIndex, 1)
      list.splice(fromIndex < dropIndex ? dropIndex - 1 : dropIndex, 0, item)
      onSessionChange({ ...session, compagnons: list })
    } else {
      // 'initiative' : contrairement aux trois listes ci-dessus, il faut aussi faire suivre
      // tourActuelIndex sur la MÊME entité logique (celle qu'il désignait avant le glisser), sans quoi
      // le curseur de tour se retrouverait à pointer une entité différente après réordonnancement.
      const list = session.ordreInitiative ? [...session.ordreInitiative] : []
      const fromIndex = list.findIndex(e => e.id === id)
      if (fromIndex === -1) return
      const entiteActuelle = list[session.tourActuelIndex ?? 0]
      const [item] = list.splice(fromIndex, 1)
      list.splice(fromIndex < dropIndex ? dropIndex - 1 : dropIndex, 0, item)
      const tourActuelIndex = entiteActuelle ? Math.max(0, list.findIndex(e => e.id === entiteActuelle.id)) : 0
      onSessionChange({ ...session, ordreInitiative: list, tourActuelIndex })
    }
  }, [session, onSessionChange])

  // Écoute globale (pas seulement sur la carte) pour continuer à suivre le pointeur même s'il quitte la
  // carte ou la colonne pendant un glisser rapide. Seuil de 5px avant de considérer que c'est un glisser
  // (pas un simple clic) : sans lui, déplier/replier une carte ou cliquer un contrôle qui laisse
  // remonter l'événement jusqu'au fond de la carte déclencherait un glisser fantôme d'un pixel.
  useEffect(() => {
    // Compagnon et PJ partagent le même conteneur visuel (colonne PJ), pas les créatures.
    const conteneurDe = (liste: ListeDrag) =>
      liste === 'creature' ? creaturesColRef.current
      : liste === 'initiative' ? initiativeColRef.current
      : pjsColRef.current
    const totalDe = (liste: ListeDrag) =>
      liste === 'creature' ? (session?.combatants.length ?? 0)
      : liste === 'pj' ? (session?.pjs.length ?? 0)
      : liste === 'initiative' ? (session?.ordreInitiative?.length ?? 0)
      : (session?.compagnons.length ?? 0)

    const handleMove = (e: PointerEvent) => {
      const drag = pointerDragRef.current
      if (!drag) return
      if (!drag.started) {
        if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 5) return
        drag.started = true
        setDragState({ liste: drag.liste, id: drag.id, width: drag.width, height: drag.height, startX: e.clientX, startY: e.clientY })
      }
      if (previewRef.current) {
        previewRef.current.style.left = `${e.clientX + 12}px`
        previewRef.current.style.top = `${e.clientY + 12}px`
      }
      const conteneur = conteneurDe(drag.liste)
      if (!conteneur) return
      const next = indexDepot(conteneur, drag.liste, e.clientX, e.clientY, totalDe(drag.liste))
      drag.dropIndex = next
      setDropIndex(prev => (prev === next ? prev : next))
    }
    const handleUp = () => {
      const drag = pointerDragRef.current
      if (drag?.started && drag.dropIndex !== null) commitDrop(drag.liste, drag.id, drag.dropIndex)
      pointerDragRef.current = null
      setDragState(null)
      setDropIndex(null)
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
  }, [session, commitDrop])

  // Case fantôme : mêmes dimensions que la carte glissée (capturées au dragstart), pointillé doré.
  const caseFantome = dragState && (
    <div style={{
      width: dragState.width, height: dragState.height, flexShrink: 0,
      border: `2px dashed ${GOLD}`, borderRadius: 8, background: 'rgba(201,168,76,0.08)',
    }} />
  )

  // Nom affiché sur l'aperçu qui suit le curseur (voir previewRef) — cherché dans la bonne liste selon
  // dragState.liste, la carte glissée pouvant être une créature, un PJ ou un compagnon.
  const nomCarteGlissee = dragState && (
    dragState.liste === 'creature' ? session?.combatants.find(c => c.id === dragState.id)?.creature.nom
    : dragState.liste === 'pj' ? session?.pjs.find(p => p.id === dragState.id)?.character.nomPersonnage
    : dragState.liste === 'initiative'
      // Une entrée d'ordre d'initiative peut être une créature, un PJ OU un compagnon — pas de liste
      // unique à interroger comme les trois autres cas (voir cibles plus bas, pas encore déclaré ici).
      ? session?.combatants.find(c => c.id === dragState.id)?.creature.nom
        ?? session?.pjs.find(p => p.id === dragState.id)?.character.nomPersonnage
        ?? session?.compagnons.find(c => c.id === dragState.id)?.creature.nom
    : session?.compagnons.find(c => c.id === dragState.id)?.creature.nom
  )
  // Rendu dans un portail (document.body) : en position fixe imbriquée dans la mise en page normale,
  // un ancêtre avec overflow/transform la retaillerait ou la couperait (même raison que le portail de
  // SelecteurCible ci-dessus).
  const apercuGlisse = dragState && createPortal(
    <div ref={previewRef} style={{
      // Position initiale = point de départ du glisser (capturé dans dragState), pour ne pas flasher en
      // haut à gauche le temps qu'un premier pointermove mette à jour la position réelle après montage.
      position: 'fixed', left: dragState.startX + 12, top: dragState.startY + 12,
      zIndex: 3000, pointerEvents: 'none',
      width: dragState.width, height: dragState.height, borderRadius: 8,
      border: `2px solid ${GOLD}`, background: 'rgba(15,12,8,0.85)', opacity: 0.9,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8,
      color: PARCHMENT, fontSize: 14, fontWeight: 700, textAlign: 'center',
      boxShadow: '0 6px 20px rgba(0,0,0,0.6)',
    }}>
      {nomCarteGlissee}
    </div>,
    document.body,
  )

  // Recalcule les lignes de ciblage (position des cartes source/cible dans la zone) — nécessaire à
  // chaque changement de session (dépli/replis d'une carte, nouvelle cible...) et à chaque scroll d'une
  // des deux colonnes, qui défilent indépendamment sans forcément changer l'état de session.
  const recomputeLinks = useCallback(() => {
    if (!session || !areaRef.current) { setLinks([]); return }
    const areaRect = areaRef.current.getBoundingClientRect()
    const entites = listerEntites(session, descriptions)
    const next: Link[] = []

    const pushLink = (sourceId: string, cibleId: string, dernierResultat: RollResult | null, source: 'creature' | 'pj') => {
      const elA = areaRef.current!.querySelector(`[data-combat-id="${sourceId}"]`)
      const elB = areaRef.current!.querySelector(`[data-combat-id="${cibleId}"]`)
      if (!elA || !elB) return
      const rectA = elA.getBoundingClientRect()
      const rectB = elB.getBoundingClientRect()
      // Le résultat affiché sur le lien ne vaut que s'il concerne la cible actuellement assignée
      // (si le MJ a changé de cible depuis le dernier jet, on n'affiche pas une info obsolète).
      const cibleActuelle = entites.find(e => e.id === cibleId)
      const resultatValide = dernierResultat && dernierResultat.cibleNom === cibleActuelle?.nom ? dernierResultat : null
      // Décalage horizontal léger (alterné gauche/droite, croissant) appliqué aux DEUX bouts du lien :
      // sépare les segments verticaux qui coïncideraient sinon (plusieurs liens vers la même cible, ou
      // deux cartes de colonnes différentes qui tombent au même x dans la grille en wrap).
      const idx = next.length
      const jitterX = idx === 0 ? 0 : (idx % 2 === 1 ? -1 : 1) * Math.ceil(idx / 2) * 10
      const x1 = rectA.left + rectA.width / 2 - areaRect.left + jitterX
      const y1 = rectA.bottom - areaRect.top
      const x2 = rectB.left + rectB.width / 2 - areaRect.left + jitterX
      const y2 = rectB.bottom - areaRect.top

      // Le coude horizontal doit passer sous TOUTES les cartes qu'il traverserait, pas seulement les
      // deux cartes reliées : les cartes sont désormais opaques, donc tout chevauchement s'y verrait.
      // On part du dessous des deux cartes (+ l'étalement habituel entre liens simultanés), puis on
      // repousse le coude sous chaque carte tierce dont la largeur croise la bande horizontale traversée
      // à cette hauteur — en boucle, pour gérer plusieurs rangées de cartes empilées.
      const minX = Math.min(x1, x2), maxX = Math.max(x1, x2)
      // Le pas vertical entre liens simultanés doit dépasser la hauteur de leur encart résultat (jusqu'à
      // 50px avec ATK+DM, cf. le rendu SVG plus bas), sinon deux liens d'index consécutifs — typiquement
      // un ciblage réciproque (PJ→créature ET créature→PJ, poussés l'un juste après l'autre) — se
      // retrouvent avec des encarts qui se chevauchent malgré cet écart. 14px (l'ancienne valeur) ne
      // séparait que les SEGMENTS de lien, pas leurs encarts, bien plus hauts.
      let midY = Math.max(y1, y2) + 20 + idx * 60
      const toutesLesCartes = areaRef.current!.querySelectorAll('[data-combat-id]')
      let aAjuste = true
      while (aAjuste) {
        aAjuste = false
        for (const el of toutesLesCartes) {
          if (el === elA || el === elB) continue
          const r = el.getBoundingClientRect()
          const cardTop = r.top - areaRect.top
          const cardBottom = r.bottom - areaRect.top
          const cardLeft = r.left - areaRect.left
          const cardRight = r.right - areaRect.left
          if (cardRight > minX && cardLeft < maxX && midY > cardTop && midY < cardBottom) {
            midY = cardBottom + 10
            aAjuste = true
          }
        }
      }

      next.push({
        id: sourceId,
        source,
        x1, y1, x2, y2, midY,
        aResultat: !!resultatValide,
        jetTotal: resultatValide?.jetTotal,
        cibleDef: resultatValide?.cibleDef,
        degatsTotal: resultatValide?.degatsTotal,
        rdAppliquee: resultatValide?.rdAppliquee,
        degatsAppliques: resultatValide?.degatsAppliques,
        toucheRate: resultatValide?.toucheRate,
        typeDegats: resultatValide?.typeDegats,
      })
    }

    // Les créatures ont un moteur de jet (dernierResultat) ; les PJ n'ont pour l'instant qu'un simple
    // ciblage visuel (pas d'attaques structurées côté PJ — le MJ gère leurs jets manuellement).
    // Un lien n'est tracé que si sa carte SOURCE (celle qui porte cibleId) est dépliée — repliée, elle
    // n'affiche plus son lien. Avec beaucoup de cibles simultanées, l'ensemble des liens devenait
    // illisible (tracés par-dessus les cartes, hors champ si une carte défilait hors de la zone
    // visible) ; ne montrer que les liens des cartes qu'on a explicitement dépliées les limite à ce
    // qu'on regarde vraiment. La carte cible, elle, peut rester repliée : seule la source compte.
    for (const c of session.combatants) if (c.cibleId && c.expanded) pushLink(c.id, c.cibleId, c.dernierResultat, 'creature')
    for (const p of session.pjs) if (p.cibleId && p.expanded) pushLink(p.id, p.cibleId, p.dernierResultat, 'pj')
    // Compagnon : même moteur de jet qu'une créature (voir compagnonEnCreature), mais allié — couleur
    // de lien 'pj' pour rester cohérent avec sa carte, rendue dans la colonne PJ.
    for (const c of session.compagnons) if (c.cibleId && c.expanded) pushLink(c.id, c.cibleId, c.dernierResultat, 'pj')

    setLinks(next)
  }, [session, descriptions])

  useEffect(() => { recomputeLinks() }, [recomputeLinks])

  // Les cartes se déplacent quand la répartition des colonnes change (glisser la barre de séparation) —
  // il faut retracer les liens de ciblage pour qu'ils suivent, comme au scroll ou au redimensionnement.
  useEffect(() => { recomputeLinks() }, [splitRatio, recomputeLinks])

  // Glisser la barre de séparation entre les deux colonnes : suit le pointeur sur window (pas sur la
  // barre elle-même) pour continuer à recevoir les mouvements même si le curseur s'en éloigne pendant
  // un glisser rapide — même principe que le drag de nœud dans NotesGraph.
  useEffect(() => {
    if (!isResizingSplit || !session) return
    const handleMove = (e: PointerEvent) => {
      const drag = resizeRef.current
      if (!drag || drag.areaWidth <= 0) return
      // Signe inversé par rapport à avant l'inversion des colonnes : splitRatio pilote maintenant la
      // colonne de DROITE (créatures) et non plus celle de gauche, donc un déplacement du curseur vers
      // la droite doit désormais RÉDUIRE splitRatio (agrandir la colonne PJ à gauche, repousser la barre
      // vers la droite) plutôt que l'augmenter.
      const deltaRatio = (e.clientX - drag.startX) / drag.areaWidth
      const next = Math.min(0.8, Math.max(0.2, drag.startRatio - deltaRatio))
      onSessionChange({ ...session, splitRatio: next })
    }
    const handleUp = () => { resizeRef.current = null; setIsResizingSplit(false) }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
  }, [isResizingSplit, session, onSessionChange])

  useEffect(() => {
    const creaturesEl = creaturesColRef.current
    const pjsEl = pjsColRef.current
    creaturesEl?.addEventListener('scroll', recomputeLinks)
    pjsEl?.addEventListener('scroll', recomputeLinks)
    window.addEventListener('resize', recomputeLinks)
    return () => {
      creaturesEl?.removeEventListener('scroll', recomputeLinks)
      pjsEl?.removeEventListener('scroll', recomputeLinks)
      window.removeEventListener('resize', recomputeLinks)
    }
  }, [recomputeLinks])

  // Écoute réseau (jets/dégâts, voir reseauProtocole.ts) : abonnement une seule fois — pas reconstruit à
  // chaque changement de session, ce qui ouvrirait une fenêtre de désabonnement/réabonnement à chaque
  // action de combat. clientsPJRef/handleAttaquePJRef/sessionRef (voir plus haut) donnent accès aux
  // valeurs les plus récentes sans dépendre d'un effet reconstruit.
  useEffect(() => {
    let annule = false
    let desabonner = () => {}
    ecouterReseau(e => {
      // Un PJ en attente dont le joueur repart n'a encore rien à défaire dans la rencontre (il n'y a
      // jamais été ajouté) — juste retirer l'entrée pour ne pas la laisser traîner.
      if (e.type === 'deconnexion') {
        setPjsEnAttente(prev => prev.filter(p => p.connexionId !== e.id))
        return
      }
      if (e.type !== 'message') return
      const message = decoderMessage(e.contenu)
      if (!message) return
      if (message.type === 'identification') {
        clientsPJRef.current = { ...clientsPJRef.current, [e.id]: message.idPJ }
        // Déjà engagé dans la rencontre (ex. réponse à qui-etes-vous après un changement d'onglet) :
        // rien à faire, on ne le remet pas en attente par-dessus.
        const pjDejaEngage = sessionRef.current?.pjs.find(p => idPJ(p.character) === message.idPJ)
        if (!pjDejaEngage) {
          setPjsEnAttente(prev => [
            ...prev.filter(p => idPJ(p.character) !== message.idPJ),
            { connexionId: e.id, character: message.character },
          ])
        } else if (sessionRef.current) {
          // Reconnexion/rafraîchissement d'un PJ déjà dans la rencontre : lui repousser son état de
          // ciblage tout de suite plutôt que d'attendre un changement de session qui pourrait ne jamais
          // arriver (voir la note sur l'effet [session, descriptions] plus haut — clientsPJRef vient
          // d'être mise à jour par mutation de ref, ce qui ne le redéclenche pas).
          envoyerAClientReseau(e.id, encoderMessage({ type: 'etat-ciblage', ...etatCiblagePourPJ(pjDejaEngage, sessionRef.current, descriptionsRef.current) }))
          envoyerImagesCiblesPourPJ(e.id, sessionRef.current, imagesEnvoyeesRef.current)
        }
      } else if (message.type === 'cible-choisie') {
        const monIdPJ = clientsPJRef.current[e.id]
        const pj = monIdPJ ? sessionRef.current?.pjs.find(p => idPJ(p.character) === monIdPJ) : undefined
        if (pj) updatePJRef.current(pj.id, { cibleId: message.cibleId })
      } else if (message.type === 'cible-choisie-compagnon') {
        const monIdPJ = clientsPJRef.current[e.id]
        const pj = monIdPJ ? sessionRef.current?.pjs.find(p => idPJ(p.character) === monIdPJ) : undefined
        if (!pj) return
        const compagnon = sessionRef.current?.compagnons.find(c => c.pjProprietaireId === pj.id && stripExposants(c.creature.nom) === stripExposants(message.compagnonNom))
        if (compagnon) updateCompagnonRef.current(compagnon.id, { cibleId: message.cibleId })
      } else if (message.type === 'attendre-mon-tour') {
        const monIdPJ = clientsPJRef.current[e.id]
        const pj = monIdPJ ? sessionRef.current?.pjs.find(p => idPJ(p.character) === monIdPJ) : undefined
        if (pj) attendreMonTourRef.current(pj.id, message.compagnonNom)
      } else if (message.type === 'degats') {
        const monIdPJ = clientsPJRef.current[e.id]
        const pj = monIdPJ ? sessionRef.current?.pjs.find(p => idPJ(p.character) === monIdPJ) : undefined
        if (!pj) return
        if (message.compagnonNom) {
          const compagnon = sessionRef.current?.compagnons.find(c => c.pjProprietaireId === pj.id && stripExposants(c.creature.nom) === stripExposants(message.compagnonNom!))
          if (compagnon) handleAttaqueCompagnonPJRef.current(compagnon, message.montant, message.typeDegats)
        } else {
          handleAttaquePJRef.current(pj, message.montant, message.typeDegats)
        }
      } else if (message.type === 'pv-actualises') {
        // Le joueur vient de se soigner ou de perdre des PV de son côté (voir applyPVLoss/applyHeal
        // dans GameModePanel.tsx) — jusqu'ici jamais transmis au MJ (contrairement aux dégâts infligés
        // ou reçus, déjà couverts par 'degats'/'degats-recus'), sa carte restait figée.
        const monIdPJ = clientsPJRef.current[e.id]
        const pj = monIdPJ ? sessionRef.current?.pjs.find(p => idPJ(p.character) === monIdPJ) : undefined
        if (pj) updatePJRef.current(pj.id, { pvActuels: message.pvActuels })
      }
    }).then(fn => {
      if (annule) { fn(); return }
      desabonner = fn
      // Redemande à tous les clients déjà connectés de se réidentifier (voir reseauProtocole.ts) :
      // clientsPJRef vient d'être recréée vide par ce (re)montage, mais leur connexion WebSocket, elle,
      // est restée ouverte pendant qu'on était sur un autre onglet — sans ça, elle resterait vide
      // jusqu'à la prochaine (re)connexion d'un joueur.
      envoyerATousReseau(encoderMessage({ type: 'qui-etes-vous' }))
    })
    return () => { annule = true; desabonner() }
  }, [])

  // listerEntites recalcule les stats de combat de chaque PJ (computeCombatStatsPJ, coûteux — scan
  // voies/traits/cristaux) : mémoïsé pour ne pas repayer ce coût à chaque rendu déclenché par le survol
  // pendant un glisser-déposer (dragState/dropIndex changent bien plus souvent qu'une vraie mise à jour
  // de session). Doit rester AVANT le retour anticipé ci-dessous (règle des Hooks : jamais après un
  // retour conditionnel) — session peut donc valoir null ici, d'où le fallback tableau vide.
  const cibles = useMemo(() => (session ? listerEntites(session, descriptions) : []), [session, descriptions])

  // Entités (créatures, PJ ET compagnons) qui visent l'entité donnée (voir ResultatCartouche sur
  // CombatCard/PJCard) — un PJ peut désormais attaquer une créature (dégâts saisis à la main, voir
  // handleAttaquePJ) et un compagnon peut viser n'importe qui (mêmes attaques qu'une créature), donc la
  // recherche inverse doit couvrir les trois listes.
  const attaquantsDe = useCallback((cibleId: string) => {
    if (!session) return []
    const cibleActuelle = cibles.find(x => x.id === cibleId)
    const resultatValide = (r: RollResult | null) => r && cibleActuelle && r.cibleNom === cibleActuelle.nom ? r : null
    const deCreatures = session.combatants
      .filter(c => c.cibleId === cibleId)
      .map(c => ({ nom: c.creature.nom, resultat: resultatValide(c.dernierResultat) }))
    const dePjs = session.pjs
      .filter(p => p.cibleId === cibleId)
      .map(p => ({ nom: p.character.nomPersonnage, resultat: resultatValide(p.dernierResultat) }))
    const deCompagnons = session.compagnons
      .filter(c => c.cibleId === cibleId)
      .map(c => ({ nom: c.creature.nom, resultat: resultatValide(c.dernierResultat) }))
    return [...deCreatures, ...dePjs, ...deCompagnons]
  }, [session, cibles])

  // Diffuse à chaque PJ connecté l'état de ciblage qui le concerne (voir etatCiblagePourPJ) — à chaque
  // changement de session ou de descriptions (nouvelle cible choisie côté MJ, créature ajoutée/retirée,
  // PV changés...). Le cas de la RECONNEXION (client qui revient sans changement de session) est couvert
  // séparément dans la branche 'identification' de l'écoute réseau plus bas — clientsPJRef est mise à
  // jour par mutation de ref, ce qui ne redéclenche pas cet effet.
  useEffect(() => {
    if (!session) return
    for (const pj of session.pjs) {
      const connexionId = Object.entries(clientsPJRef.current).find(([, idpj]) => idpj === idPJ(pj.character))?.[0]
      if (connexionId === undefined) continue
      envoyerAClientReseau(Number(connexionId), encoderMessage({ type: 'etat-ciblage', ...etatCiblagePourPJ(pj, session, descriptions) }))
      envoyerImagesCiblesPourPJ(Number(connexionId), session, imagesEnvoyeesRef.current)
    }
  }, [session, descriptions])

  // Filet de sécurité : une session reprise depuis une sauvegarde antérieure à ce chantier (ou tout
  // autre chemin qui n'aurait pas encore renseigné ordreInitiative) régénère son ordre au premier rendu
  // plutôt que de laisser le tableau/le gating d'action silencieusement vides.
  useEffect(() => {
    if (!session || session.ordreInitiative) return
    onSessionChange({
      ...session,
      ordreInitiative: construireOrdreInitiative(session.combatants, session.pjs, session.compagnons, descriptions),
      tourActuelIndex: 0,
      round: session.round ?? 1,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, descriptions])

  if (!session) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.4, fontSize: 14, textAlign: 'center', padding: 20 }}>
        {t('gmMode.bataille.aucuneSession')}
      </div>
    )
  }

  // Remplace l'ancien champ aJoueCeTour (persisté par entité) : dérivé de sa position dans l'ordre
  // d'initiative — seule l'entité à tourActuelIndex peut agir (voir CombatCard.tsx/PJCard.tsx, qui
  // reçoivent le résultat sous le nom estEnCours).
  const estEnCours = (id: string) => {
    const ordre = session.ordreInitiative
    if (!ordre) return false
    return ordre.findIndex(e => e.id === id) === (session.tourActuelIndex ?? 0)
  }

  const updateCombatant = (id: string, patch: Partial<CombatSession['combatants'][number]>) => {
    onSessionChange({ ...session, combatants: session.combatants.map(c => c.id === id ? { ...c, ...patch } : c) })
  }

  const updateCompagnon = (id: string, patch: Partial<CombatCreature>) => {
    onSessionChange({ ...session, compagnons: session.compagnons.map(c => c.id === id ? { ...c, ...patch } : c) })
  }

  // Un PJ (ou l'un de ses compagnons) choisit de ne pas agir tout de suite sur son tour et de repasser
  // en fin d'ordre du round en cours (voir 'attendre-mon-tour' dans reseauProtocole.ts) — l'entrée
  // concernée était forcément à tourActuelIndex (c'est SON tour, sinon le joueur n'aurait pas pu
  // déclencher ce message, voir peutAgir/estMonTour dans GameModePanel.tsx), donc la repousser en fin de
  // tableau ne décale jamais rien avant elle : tourActuelIndex n'a besoin d'aucun ajustement.
  const handleAttendreMonTour = (pjId: string, compagnonNom?: string) => {
    const ordre = session.ordreInitiative
    if (!ordre) return
    const entiteId = compagnonNom
      ? session.compagnons.find(c => c.pjProprietaireId === pjId && stripExposants(c.creature.nom) === stripExposants(compagnonNom))?.id
      : pjId
    if (!entiteId) return
    const entree = ordre.find(e => e.id === entiteId)
    if (!entree) return
    onSessionChange({ ...session, ordreInitiative: [...ordre.filter(e => e.id !== entiteId), entree] })
  }

  // Si le patch touche pvActuels (édition manuelle du champ PV dans PJCard, ou réception réseau
  // 'pv-actualises' ci-dessus via updatePJRef) et que ce PJ est connecté, le lui transmettre — sinon un
  // MJ qui tue/soigne un PJ à la main ne le prévient jamais (voir reseauProtocole.ts). Idempotent si
  // l'appel vient déjà d'un 'pv-actualises' reçu de ce même PJ : il recevra en retour la valeur qu'il
  // vient d'envoyer, sans effet (pas de nouvel aller-retour côté joueur, voir GameModePanel.tsx).
  const updatePJ = (id: string, patch: Partial<CombatSession['pjs'][number]>) => {
    onSessionChange({ ...session, pjs: session.pjs.map(p => p.id === id ? { ...p, ...patch } : p) })
    if (patch.pvActuels !== undefined) {
      const pj = session.pjs.find(p => p.id === id)
      if (pj) {
        const connexionId = Object.entries(clientsPJRef.current).find(([, idpj]) => idpj === idPJ(pj.character))?.[0]
        if (connexionId !== undefined) {
          envoyerAClientReseau(Number(connexionId), encoderMessage({ type: 'pv-actualises', pvActuels: patch.pvActuels }))
        }
      }
    }
  }

  // Retire aussi les compagnons de ce PJ (voir pjProprietaireId) : sans lui, ses cartes resteraient
  // orphelines sur le champ de bataille.
  const removePJ = (id: string) => {
    onSessionChange({
      ...session,
      pjs: session.pjs.filter(p => p.id !== id),
      compagnons: session.compagnons.filter(c => c.pjProprietaireId !== id),
    })
  }

  // Avance l'ordre d'initiative d'UNE entité (plus un round entier comme l'ancien modèle à déblocage
  // simultané) — seul déclencheur de l'avancée, le MJ (décidé avec Didic). Saute automatiquement toute
  // entrée "passe son tour" (bascule à usage unique, remise à false une fois sautée). Les DoT/dernier
  // résultat affiché ne sont recalculés/effacés QUE quand l'ordre boucle sur le début (un round
  // complet) — pas à chaque clic, pour préserver le rythme "une fois par round" déjà en place avant ce
  // chantier (ce bouton était auparavant cliqué une fois par round ; il l'est désormais une fois par
  // entité, il faut donc déplacer ce qui doit rester round-based).
  const tourSuivant = () => {
    let ordreMaj = session.ordreInitiative ?? construireOrdreInitiative(session.combatants, session.pjs, session.compagnons, descriptions)
    if (ordreMaj.length === 0) return
    // PV réévalués à chaque avancée (pas un drapeau figé comme passeSonTour) : une entité inconsciente
    // (0 PV) est sautée automatiquement, mais redevient éligible dès qu'elle est soignée, sans
    // intervention du MJ (demandé par Didic — contrairement à passeSonTour, ce n'est jamais "consommé").
    const pvParId = new Map(listerEntites(session, descriptions).map(e => [e.id, e.pvActuels]))
    let index = session.tourActuelIndex ?? 0
    let round = session.round ?? 1
    let boucle = false
    for (let i = 0; i < ordreMaj.length; i++) {
      index = (index + 1) % ordreMaj.length
      if (index === 0) { boucle = true; round += 1 }
      const entree = ordreMaj[index]
      const inconscient = (pvParId.get(entree?.id ?? '') ?? 0) <= 0
      if (!entree?.passeSonTour && !inconscient) break
      if (entree?.passeSonTour) {
        ordreMaj = ordreMaj.map((e, idx) => idx === index ? { ...e, passeSonTour: false } : e)
      }
    }
    onSessionChange({
      ...session,
      ordreInitiative: ordreMaj,
      tourActuelIndex: index,
      round,
      combatants: boucle ? session.combatants.map(c => tickerDots({ ...c, dernierResultat: null })) : session.combatants,
      // Remise à zéro immédiate côté MJ (pas besoin d'attendre l'aller-retour réseau qui arrivera de
      // toute façon confirmer la même chose une fois le joueur averti par 'nouveau-tour' ci-dessous).
      pjs: boucle ? session.pjs.map(p => tickerDots({ ...p, dernierResultat: null })) : session.pjs,
      compagnons: boucle ? session.compagnons.map(c => tickerDots({ ...c, dernierResultat: null })) : session.compagnons,
    })
    // Débloque le budget d'action des PJ connectés (voir handleEndTurn dans GameModePanel.tsx) — sans
    // ça, seules les cartes suivies côté MJ étaient mises à jour, jamais les PJ eux-mêmes (qui jouent
    // depuis leur propre Mode de jeu, déconnecté de cet écran).
    envoyerATousReseau(encoderMessage({ type: 'nouveau-tour' }))
  }

  // Compagnons ACTIFS (pas "laissés en arrière", voir estCompagnonActif) du PJ importé, dans l'ordre
  // choisi par le joueur (voir compagnonEnCreature) — mêmes contrôles qu'une créature (PV, cible,
  // attaques cliquables), mais alliés du PJ — rendus dans sa colonne, jamais celle des créatures.
  // pjProprietaireId les relie à leur PJ (affichage + retrait en cascade, voir removePJ).
  const compagnonsDe = (pj: CombatSession['pjs'][number]): CombatCreature[] => {
    const noms = getCompagnonsOrdonnes(pj.character, descriptions).filter(nom => estCompagnonActif(pj.character, nom))
    return noms.flatMap(nom => {
      const creature = compagnonEnCreature(nom, compagnonsCatalogue, pj.character, descriptions)
      if (!creature) return []
      return [{
        id: `compagnon-${pj.id}-${nom}`,
        creature, pvActuels: creature.pv ?? 0, buffs: [],
        expanded: false, dernierResultat: null, cibleId: null, dotsActifs: [], historique: [],
        pjProprietaireId: pj.id,
      }]
    })
  }

  // Met les PJ importés en attente (voir pjsImportesEnAttente) au lieu de les ajouter directement à la
  // rencontre — même principe que les PJ réseau (pjsEnAttente), pour que le MJ décide explicitement du
  // moment où chacun rejoint le combat, quelle que soit sa provenance.
  const handleFiles = async (files: FileList) => {
    const nouveaux: Character[] = []
    const rejets: string[] = []
    for (const file of Array.from(files)) {
      try {
        const text = await file.text()
        const parsed = JSON.parse(text)
        const entries = Array.isArray(parsed) ? parsed : [parsed]
        for (const entry of entries) {
          // Un export récent est enveloppé ({type:'personnage', data:{...}}, voir SaveLoadPanel) — un
          // fichier plus ancien ou d'un autre type d'export est reconnu par repli structurel.
          const { type, contenu } = desenvelopper(entry)
          if (type && type !== 'personnage') { rejets.push(messageMauvaisType(t, 'personnage', type)); continue }
          const c = contenu as { character?: Character; caracteristiques?: unknown } | undefined
          const character: Character | undefined = c?.character ?? (c?.caracteristiques ? (c as Character) : undefined)
          if (character) nouveaux.push(character)
        }
      } catch { /* fichier invalide, ignoré */ }
    }
    if (rejets.length > 0) { setSaveMsg(rejets.join(' ')); setTimeout(() => setSaveMsg(null), 5000) }
    if (nouveaux.length > 0) {
      setPjsImportesEnAttente(prev => {
        // Dédoublonné par idPJ (pas par nom seul, voir reseauProtocole.ts), contre la rencontre active
        // ET contre la liste d'attente elle-même — un fichier réimporté deux fois (ou déjà engagé) ne
        // doit pas créer d'entrée en double.
        const dejaPresents = new Set([...session.pjs.map(p => idPJ(p.character)), ...prev.map(idPJ)])
        const aAjouter = nouveaux.filter(c => !dejaPresents.has(idPJ(c)))
        return [...prev, ...aAjouter]
      })
    }
  }

  // Fait passer un PJ d'une des deux listes d'attente (réseau pjsEnAttente, ou fichier
  // pjsImportesEnAttente) à la rencontre active — même logique d'import + compagnons + tri par
  // initiative dans les deux cas, seule la provenance affichée dans le tiroir diffère. Déclenchée par un
  // clic (bouton du tiroir), jamais par l'écoute réseau elle-même : pas besoin de ref d'indirection ici,
  // un gestionnaire de clic ferme toujours sur le rendu le plus récent. Retirer des DEUX listes ne pose
  // pas de risque : un PJ n'est jamais présent que dans une seule des deux.
  const activerPJ = (character: Character) => {
    const nouveau = importPJ(character, descriptions)
    const pjs = [...session.pjs, nouveau]
    const nouveauxCompagnons = compagnonsDe(nouveau)
    const compagnons = [...session.compagnons, ...nouveauxCompagnons]
    // Insertion dans l'ordre d'initiative (voir insererDansOrdreInitiative dans utils/combat.ts) : le PJ
    // et chacun de ses compagnons jouent dès ce round si leur rang n'est pas encore atteint, sinon
    // seulement au round suivant — jamais de tri par la valeur figée character.initiative (voir
    // computeInitiativeTotale).
    let ordreInitiative = session.ordreInitiative ?? construireOrdreInitiative(session.combatants, session.pjs, session.compagnons, descriptions)
    const tourActuelIndex = session.tourActuelIndex ?? 0
    ordreInitiative = insererDansOrdreInitiative(ordreInitiative, tourActuelIndex, { id: nouveau.id, initiative: computeInitiativeTotale(character, descriptions) })
    for (const c of nouveauxCompagnons) {
      ordreInitiative = insererDansOrdreInitiative(ordreInitiative, tourActuelIndex, { id: c.id, initiative: c.creature.init ?? -Infinity })
    }
    onSessionChange({ ...session, pjs, compagnons, ordreInitiative, tourActuelIndex })
    setPjsEnAttente(prev => prev.filter(p => idPJ(p.character) !== idPJ(character)))
    setPjsImportesEnAttente(prev => prev.filter(c => idPJ(c) !== idPJ(character)))
  }

  // Qualifie le nom d'un PJ par son joueur ("Beldin (joueur Dodoc)") pour distinguer deux PJ homonymes
  // (voir aussi PJCard.tsx, même besoin) — inchangé si nomJoueur est vide.
  const nomQualifie = (character: Character) =>
    character.nomJoueur?.trim() ? t('gmMode.bataille.nomAvecJoueur', { nom: character.nomPersonnage, joueur: character.nomJoueur.trim() }) : character.nomPersonnage

  // Une ligne des listes d'attente du tiroir (réseau ou fichier) — même structure visuelle pour les
  // deux, seule la section englobante (avec ou sans 🌐) distingue la provenance.
  const rendrePJAttente = (cle: string | number, nom: string, onAjouter: () => void) => (
    <div key={cle} style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
      border: '1px dashed rgba(201,168,76,0.4)', borderRadius: 6,
    }}>
      <span style={{ flex: 1, fontSize: 13, color: PARCHMENT }}>{nom}</span>
      <button onClick={onAjouter} style={{
        background: 'rgba(201,168,76,0.12)', border: `1px solid ${SECTION_BORDER}`, borderRadius: 4,
        color: GOLD, cursor: 'pointer', fontSize: 11, padding: '2px 8px', whiteSpace: 'nowrap',
      }}>
        {t('gmMode.bataille.ajouterALaRencontre')}
      </button>
    </div>
  )

  // Un seul appel à onSessionChange pour tout l'attaque (résultat sur l'attaquant + dégâts sur la
  // cible) : deux appels séparés à updateCombatant/updatePJ ici se baseraient tous deux sur le même
  // `session` (fermeture de ce rendu), donc le second écraserait le premier au lieu de le compléter.
  // combatant peut être une créature OU un compagnon (même forme, voir compagnonsDe) — seul le tableau
  // qui le contient réellement changera, l'autre passe inchangé faute d'id correspondant. La cible peut
  // être n'importe laquelle des trois listes (créature, PJ ou compagnon).
  const handleAttaque = (combatant: CombatCreature, attaque: NonNullable<CombatCreature['creature']['attaques']>[number]) => {
    const cibleInfo = combatant.cibleId ? cibles.find(c => c.id === combatant.cibleId) ?? null : null
    // Cible déjà morte (tuée par un autre coup pendant que ce combattant la visait encore) : on refuse
    // l'attaque plutôt que de la résoudre contre un cadavre — voir aussi le blocage de sélection dans
    // SelecteurCible.tsx, qui empêche déjà d'en CHOISIR une nouvelle une fois morte.
    if (cibleInfo && cibleInfo.pvActuels <= 0) return
    const result = resoudreAttaque(attaque.nom, attaque.bonus, attaque.dm, cibleInfo)
    result.attaquantNom = combatant.creature.nom
    const cibleId = combatant.cibleId
    const degats = result.degatsAppliques

    // Historique côté cible poussé dès qu'une cible était assignée (touché OU raté — un raté reste un
    // événement qui la concerne), indépendamment de l'application de PV (conditionnée, elle, à un
    // dégât réellement chiffré) — voir HistoriqueEntree/ajouterHistorique dans combat.ts.
    const appliquer = (c: CombatCreature): CombatCreature => {
      if (c.id === combatant.id) return { ...c, dernierResultat: result, historique: ajouterHistorique(c.historique, 'attaque', result) }
      if (cibleId && c.id === cibleId) {
        const pvActuels = degats !== undefined ? Math.max(0, c.pvActuels - degats) : c.pvActuels
        return { ...c, pvActuels, historique: ajouterHistorique(c.historique, 'subi', result) }
      }
      return c
    }
    const nextCombatants = session.combatants.map(appliquer)
    const nextCompagnons = session.compagnons.map(appliquer)
    const nextPjs = cibleId
      ? session.pjs.map(p => p.id === cibleId
        ? { ...p, pvActuels: degats !== undefined ? Math.max(0, p.pvActuels - degats) : p.pvActuels, historique: ajouterHistorique(p.historique, 'subi', result) }
        : p)
      : session.pjs

    onSessionChange({ ...session, combatants: nextCombatants, compagnons: nextCompagnons, pjs: nextPjs })

    // Si la cible est un PJ connecté au réseau (voir clientsPJRef), lui envoyer automatiquement le
    // résultat — le MJ a déjà décidé l'action en cliquant "Attaquer", pas besoin d'une confirmation
    // supplémentaire (contrairement à l'envoi joueur → MJ, resté manuel — voir GameModePanel.tsx).
    const cibleEstPJ = cibleId ? session.pjs.find(p => p.id === cibleId) : undefined
    if (cibleEstPJ) {
      const connexionId = Object.entries(clientsPJRef.current).find(([, id]) => id === idPJ(cibleEstPJ.character))?.[0]
      if (connexionId !== undefined) {
        envoyerAClientReseau(Number(connexionId), encoderMessage({
          type: 'degats-recus', montant: degats ?? 0, typeDegats: result.typeDegats ?? '', toucheRate: !!result.toucheRate,
        }))
      }
    }
  }

  // Un PJ n'a pas de moteur de jet propre : le MJ résout l'attaque lui-même (à la table ou de tête) et
  // saisit le montant BRUT infligé (même convention que l'envoi automatique réseau, voir
  // envoyerDegatsReseau dans GameModePanel.tsx) — la RD de la cible est déduite ici via
  // appliquerDegatsCible, comme pour une attaque de créature (voir resoudreAttaque), pour apparaître
  // dans le cartouche. type est purement informatif (icône affichée), jamais utilisé pour un calcul de
  // RD — les créatures n'ont pas de résistance par type dans ce modèle, contrairement aux PJ.
  const handleAttaquePJ = (pj: CombatSession['pjs'][number], montant: number, type: string) => {
    const cibleInfo = pj.cibleId ? cibles.find(c => c.id === pj.cibleId) ?? null : null
    // Voir la même note dans handleAttaque ci-dessus : cible déjà morte entre-temps, on refuse.
    if (!cibleInfo || montant <= 0 || cibleInfo.pvActuels <= 0) return
    const { degatsAppliques, rdAppliquee } = appliquerDegatsCible(montant, cibleInfo)
    const result: RollResult = {
      attaqueNom: t('gmMode.bataille.attaqueManuelle'), cibleNom: cibleInfo.nom, attaquantNom: pj.character.nomPersonnage,
      degatsTotal: montant, degatsAppliques, rdAppliquee, typeDegats: type || undefined,
    }
    const cibleId = pj.cibleId

    const nextCombatants = session.combatants.map(c => c.id === cibleId ? { ...c, pvActuels: Math.max(0, c.pvActuels - degatsAppliques), historique: ajouterHistorique(c.historique, 'subi', result) } : c)
    const nextCompagnons = session.compagnons.map(c => c.id === cibleId ? { ...c, pvActuels: Math.max(0, c.pvActuels - degatsAppliques), historique: ajouterHistorique(c.historique, 'subi', result) } : c)
    const nextPjs = session.pjs.map(p => {
      if (p.id === pj.id) return { ...p, dernierResultat: result, historique: ajouterHistorique(p.historique, 'attaque', result) }
      if (p.id === cibleId) return { ...p, pvActuels: Math.max(0, p.pvActuels - degatsAppliques), historique: ajouterHistorique(p.historique, 'subi', result) }
      return p
    })

    onSessionChange({ ...session, combatants: nextCombatants, compagnons: nextCompagnons, pjs: nextPjs })
  }

  // Symétrique de handleAttaquePJ ci-dessus, mais pour un compagnon du PJ (voir 'degats'.compagnonNom
  // dans reseauProtocole.ts et la section Compagnons de GameModePanel.tsx) : la cible résolue est celle
  // du COMPAGNON (compagnon.cibleId, choisie par le MJ via son propre SelecteurCible sur sa carte), pas
  // celle du PJ — un compagnon peut viser une créature différente de son propriétaire. Le résultat
  // (dernierResultat) est écrit sur l'entrée compagnon dans session.compagnons, pas sur le PJ, sinon le
  // journal MJ ne refléterait jamais une attaque de compagnon déclenchée à distance.
  const handleAttaqueCompagnonPJ = (compagnon: CombatCreature, montant: number, type: string) => {
    const cibleInfo = compagnon.cibleId ? cibles.find(c => c.id === compagnon.cibleId) ?? null : null
    // Voir la même note dans handleAttaque ci-dessus : cible déjà morte entre-temps, on refuse.
    if (!cibleInfo || montant <= 0 || cibleInfo.pvActuels <= 0) return
    const { degatsAppliques, rdAppliquee } = appliquerDegatsCible(montant, cibleInfo)
    const result: RollResult = {
      attaqueNom: t('gmMode.bataille.attaqueManuelle'), cibleNom: cibleInfo.nom, attaquantNom: compagnon.creature.nom,
      degatsTotal: montant, degatsAppliques, rdAppliquee, typeDegats: type || undefined,
    }
    const cibleId = compagnon.cibleId

    const nextCombatants = session.combatants.map(c => c.id === cibleId ? { ...c, pvActuels: Math.max(0, c.pvActuels - degatsAppliques), historique: ajouterHistorique(c.historique, 'subi', result) } : c)
    const nextPjs = session.pjs.map(p => p.id === cibleId ? { ...p, pvActuels: Math.max(0, p.pvActuels - degatsAppliques), historique: ajouterHistorique(p.historique, 'subi', result) } : p)
    const nextCompagnons = session.compagnons.map(c => {
      if (c.id === compagnon.id) return { ...c, dernierResultat: result, historique: ajouterHistorique(c.historique, 'attaque', result) }
      if (c.id === cibleId) return { ...c, pvActuels: Math.max(0, c.pvActuels - degatsAppliques), historique: ajouterHistorique(c.historique, 'subi', result) }
      return c
    })

    onSessionChange({ ...session, combatants: nextCombatants, compagnons: nextCompagnons, pjs: nextPjs })
  }
  // Voir la note sur handleAttaquePJRef plus haut : synchronisée à chaque rendu pour que l'écoute
  // réseau (abonnée une seule fois) appelle toujours la version la plus récente. Pas un useEffect ici :
  // handleAttaquePJ n'existe qu'après le retour anticipé "if (!session)" plus haut, un Hook ne peut pas
  // être appelé après un retour conditionnel. La ref n'est de toute façon jamais lue pendant le rendu
  // (seulement depuis le callback réseau asynchrone ci-dessus), donc cette écriture est sûre malgré
  // l'avertissement.
  // eslint-disable-next-line react-hooks/refs
  handleAttaquePJRef.current = handleAttaquePJ
  // eslint-disable-next-line react-hooks/refs
  handleAttaqueCompagnonPJRef.current = handleAttaqueCompagnonPJ
  // eslint-disable-next-line react-hooks/refs
  updatePJRef.current = updatePJ
  // eslint-disable-next-line react-hooks/refs
  updateCompagnonRef.current = updateCompagnon
  // eslint-disable-next-line react-hooks/refs
  attendreMonTourRef.current = handleAttendreMonTour

  // Pose un effet de dégâts sur la durée sur la cible actuelle du PJ (poison, brûlure, ...) — encaissé
  // automatiquement à chaque « Tour suivant » (voir tickerDots), sans appliquer de dégâts immédiats :
  // le premier tic n'arrive qu'au tour suivant, comme les DoT du Mode de jeu (GameModePanel).
  const handleAjouterDotPJ = (pj: CombatSession['pjs'][number], type: string, montant: number, duree: number) => {
    const cibleId = pj.cibleId
    if (!cibleId || montant <= 0 || duree <= 0) return
    const dot: DotActif = { id: crypto.randomUUID(), type, amount: montant, remainingTurns: duree }
    const nextCombatants = session.combatants.map(c => c.id === cibleId ? { ...c, dotsActifs: [...c.dotsActifs, dot] } : c)
    const nextCompagnons = session.compagnons.map(c => c.id === cibleId ? { ...c, dotsActifs: [...c.dotsActifs, dot] } : c)
    const nextPjs = session.pjs.map(p => p.id === cibleId ? { ...p, dotsActifs: [...p.dotsActifs, dot] } : p)
    onSessionChange({ ...session, combatants: nextCombatants, compagnons: nextCompagnons, pjs: nextPjs })
  }

  // Retrait anticipé d'un DoT (ex: soin qui purge l'effet) — cherche l'entité concernée dans les trois
  // camps, peu importe lequel a reçu l'effet.
  const handleRetirerDot = (entiteId: string, dotId: string) => {
    onSessionChange({
      ...session,
      combatants: session.combatants.map(c => c.id === entiteId ? { ...c, dotsActifs: c.dotsActifs.filter(d => d.id !== dotId) } : c),
      compagnons: session.compagnons.map(c => c.id === entiteId ? { ...c, dotsActifs: c.dotsActifs.filter(d => d.id !== dotId) } : c),
      pjs: session.pjs.map(p => p.id === entiteId ? { ...p, dotsActifs: p.dotsActifs.filter(d => d.id !== dotId) } : p),
    })
  }

  // Bascule "passe son tour" (créature immobilisée, voir passeSonTour dans utils/combat.ts) — à usage
  // unique, remise à false par tourSuivant une fois sautée.
  const toggleSkipTour = (id: string) => {
    if (!session.ordreInitiative) return
    onSessionChange({ ...session, ordreInitiative: session.ordreInitiative.map(e => e.id === id ? { ...e, passeSonTour: !e.passeSonTour } : e) })
  }

  // Jet de d20 de départage pour TOUTES les entrées à égalité avec initiativeEgale (voir tieBreak dans
  // utils/combat.ts) — un nouveau jet écrase l'ancien à chaque clic, permet de relancer si besoin. Retri
  // complet (stable pour tout le reste) puis retrouve la nouvelle position de l'entité actuellement
  // pointée, pour ne jamais perdre le curseur de tour en cours de route.
  const departagerInitiative = (initiativeEgale: number) => {
    const ordre = session.ordreInitiative
    if (!ordre) return
    const entiteActuelle = ordre[session.tourActuelIndex ?? 0]
    const nouvelOrdre = ordre
      .map(e => e.initiative === initiativeEgale ? { ...e, tieBreak: Math.floor(Math.random() * 20) + 1 } : e)
      .sort((a, b) => b.initiative - a.initiative || (b.tieBreak ?? 0) - (a.tieBreak ?? 0))
    const tourActuelIndex = entiteActuelle ? Math.max(0, nouvelOrdre.findIndex(e => e.id === entiteActuelle.id)) : 0
    onSessionChange({ ...session, ordreInitiative: nouvelOrdre, tourActuelIndex })
  }

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      {apercuGlisse}
      {carteAffichee && (
        <CarteCritiqueModal
          carte={carteAffichee.carte}
          categorie={carteAffichee.categorie}
          onClose={() => setCarteAffichee(null)}
        />
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%', paddingLeft: 38 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: GOLD, fontFamily: "'Cinzel', serif" }}>{session.nomRencontre}</div>
            <div style={{ fontSize: 12, opacity: 0.5 }}>
              {t('gmMode.bataille.nbAdversaires', { count: session.combatants.length })}
              {session.pjs.length > 0 && ` · ${t('gmMode.bataille.nbPJ', { count: session.pjs.length })}`}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {saveMsg && <span style={{ fontSize: 12, color: GOLD }}>{saveMsg}</span>}
            <button onClick={tourSuivant} style={{
              padding: '6px 14px', borderRadius: 4, border: '1px solid rgba(201,168,76,0.5)',
              background: 'rgba(201,168,76,0.12)', color: GOLD, cursor: 'pointer', fontSize: 13,
            }}>
              ⏭ {t('gmMode.bataille.tourSuivant')}
            </button>
            <button
              onClick={() => {
                onSauvegarder()
                setSaveMsg(t('gmMode.bataille.instantaneEnregistre'))
                setTimeout(() => setSaveMsg(null), 2500)
              }}
              style={{
                padding: '6px 14px', borderRadius: 4, border: '1px solid rgba(100,200,120,0.5)',
                background: 'rgba(100,200,120,0.12)', color: 'rgba(120,220,140,0.95)', cursor: 'pointer', fontSize: 13,
              }}
            >
              💾 {t('gmMode.bataille.sauvegarder')}
            </button>
            <button onClick={onEndSession} style={{
              padding: '6px 14px', borderRadius: 4, border: `1px solid ${SECTION_BORDER}`,
              background: 'transparent', color: 'rgba(245,236,215,0.6)', cursor: 'pointer', fontSize: 13,
            }}>
              {t('gmMode.bataille.terminer')}
            </button>
          </div>
        </div>

        {/* Ordre d'initiative (voir OrdreInitiativeEntry dans utils/combat.ts) — une carte par entité,
            nom résolu via cibles (même liste que SelecteurCible). Réordonnancement par glisser-déposer,
            même mécanisme de suivi au pointeur que les colonnes PJ/créatures ci-dessous (voir
            handleCardPointerDown/commitDrop/dragState plus haut — demandé par Didic plutôt que des
            flèches ▲/▼, trop petit/peu naturel). Départage au dé (🎲, groupes à égalité), "passe son
            tour" (case, bascule à usage unique) — la seule AVANCÉE du tour reste le bouton "Tour
            suivant" ci-dessus, qui avance maintenant d'UNE entité. */}
        {session.ordreInitiative && session.ordreInitiative.length > 0 && (
          <div style={{ flexShrink: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: GOLD, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
              {t('gmMode.bataille.ordreInitiativeLabel')} — {t('gmMode.bataille.roundLabel', { round: session.round ?? 1 })}
            </div>
            <div ref={initiativeColRef} style={{ display: 'flex', flexWrap: 'nowrap', overflowX: 'auto', gap: 10, padding: '4px 2px 8px' }}>
              {session.ordreInitiative.map((entree, i) => {
                const nomEntite = cibles.find(x => x.id === entree.id)?.nom ?? '?'
                const enCours = i === (session.tourActuelIndex ?? 0)
                const enEgalite = session.ordreInitiative!.filter(x => x.initiative === entree.initiative).length > 1
                return (
                  <div key={entree.id} style={{ display: 'contents' }}>
                    {dragState?.liste === 'initiative' && dropIndex === i && caseFantome}
                    <div
                      data-drag-index={i}
                      data-drag-liste="initiative"
                      onPointerDown={handleCardPointerDown('initiative', entree.id)}
                      style={{
                        opacity: dragState?.id === entree.id ? 0.35 : 1, cursor: 'grab', touchAction: 'none', flexShrink: 0,
                        width: 150, padding: '10px 12px', borderRadius: 8,
                        background: enCours ? 'rgba(201,168,76,0.2)' : 'rgba(245,236,215,0.05)',
                        border: `1px solid ${enCours ? GOLD : 'rgba(245,236,215,0.15)'}`,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 15, fontWeight: enCours ? 700 : 600, color: enCours ? GOLD : PARCHMENT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nomEntite}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(123,170,232,0.95)', flexShrink: 0 }}>{t('gmMode.bataille.initAbrege')} {entree.initiative}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                        {/* stopPropagation nécessaire ici (contrairement au bouton 🎲 ci-dessous, déjà
                            ignoré par handleCardPointerDown via closest('button,...')) : un clic sur le
                            <label> lui-même (pas exactement sur la case) ne matche pas ce sélecteur,
                            puisque closest() ne remonte que vers les ANCÊTRES, jamais les descendants —
                            sans quoi cliquer à côté de la case démarrerait un glisser accidentel. */}
                        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer', opacity: 0.75 }} title={t('gmMode.bataille.passeSonTourTitle')} onPointerDown={e => e.stopPropagation()}>
                          <input type="checkbox" checked={!!entree.passeSonTour} onChange={() => toggleSkipTour(entree.id)} style={{ cursor: 'pointer' }} />
                          {t('gmMode.bataille.passeSonTourTitle')}
                        </label>
                        {enEgalite && (
                          <button onClick={() => departagerInitiative(entree.initiative)} title={t('gmMode.bataille.departagerTitle')}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: 0, lineHeight: 1 }}>🎲</button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
              {dragState?.liste === 'initiative' && dropIndex === session.ordreInitiative.length && caseFantome}
            </div>
          </div>
        )}

        <div ref={areaRef} style={{ flex: 1, minHeight: 0, display: 'flex', gap: 16, position: 'relative' }}>
          {/* Personnages joueurs — à gauche (voir aussi le tiroir latéral PJ, déplacé côté gauche pour
              rester à côté de sa colonne). */}
          <div
            ref={pjsColRef}
            style={{ flex: `${1 - splitRatio} 1 0%`, minWidth: 0, overflowY: 'auto', display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 14, alignContent: 'flex-start' }}
          >
            {session.pjs.length === 0 ? (
              <div style={{ width: '100%', textAlign: 'center', opacity: 0.35, fontSize: 13, padding: '20px 0' }}>
                {t('gmMode.bataille.aucunPJ')}
              </div>
            ) : session.pjs.map((p, index) => (
              <div key={p.id} style={{ display: 'contents' }}>
                {dragState?.liste === 'pj' && dropIndex === index && caseFantome}
                <div
                  data-drag-index={index}
                  data-drag-liste="pj"
                  onPointerDown={handleCardPointerDown('pj', p.id)}
                  style={{ opacity: dragState?.id === p.id ? 0.35 : 1, cursor: 'grab', touchAction: 'none' }}
                >
                  <PJCard
                    pj={p}
                    estEnCours={estEnCours(p.id)}
                    cibles={cibles.filter(x => x.id !== p.id)}
                    attaquants={attaquantsDe(p.id)}
                    onToggleExpand={() => updatePJ(p.id, { expanded: !p.expanded })}
                    onSetPV={pv => updatePJ(p.id, { pvActuels: pv })}
                    onSetPM={pm => updatePJ(p.id, { pmActuels: pm })}
                    onInfligerDegats={(montant, type) => handleAttaquePJ(p, montant, type)}
                    onAjouterDot={(type, montant, duree) => handleAjouterDotPJ(p, type, montant, duree)}
                    onSetCible={id => updatePJ(p.id, { cibleId: id })}
                    onSetBuff={(stat, valeur) => {
                      const buffs = [...p.buffs.filter(b => b.stat !== stat), { stat, valeur }]
                      updatePJ(p.id, { buffs })
                    }}
                    onClearBuff={stat => updatePJ(p.id, { buffs: p.buffs.filter(b => b.stat !== stat) })}
                    onRetirerDot={dotId => handleRetirerDot(p.id, dotId)}
                    onTirerCarte={tirerCarte}
                  />
                </div>
              </div>
            ))}
            {dragState?.liste === 'pj' && dropIndex === session.pjs.length && caseFantome}

            {/* Compagnons des PJ (voir compagnonsDe) — mêmes cartes qu'une créature (jet d'attaque
                propre), rendues ici puisqu'alliés des PJ. Réordonnables entre eux (data-drag-liste
                "compagnon"), jamais mélangés à l'ordre des PJ malgré la colonne visuelle commune. */}
            {session.compagnons.map((c, index) => (
              <div key={c.id} style={{ display: 'contents' }}>
                {dragState?.liste === 'compagnon' && dropIndex === index && caseFantome}
                <div
                  data-drag-index={index}
                  data-drag-liste="compagnon"
                  onPointerDown={handleCardPointerDown('compagnon', c.id)}
                  style={{ opacity: dragState?.id === c.id ? 0.35 : 1, cursor: 'grab', touchAction: 'none' }}
                >
                  <CombatCard
                    combatant={c}
                    estEnCours={estEnCours(c.id)}
                    cibles={cibles.filter(x => x.id !== c.id)}
                    attaquants={attaquantsDe(c.id)}
                    sousTitre={t('gmMode.bataille.compagnonDe', { nom: session.pjs.find(p => p.id === c.pjProprietaireId)?.character.nomPersonnage ?? '?' })}
                    onToggleExpand={() => updateCompagnon(c.id, { expanded: !c.expanded })}
                    onSetPV={pv => updateCompagnon(c.id, { pvActuels: pv })}
                    onAttaque={attaque => handleAttaque(c, attaque)}
                    onSetCible={id => updateCompagnon(c.id, { cibleId: id })}
                    onSetBuff={(stat, valeur) => {
                      const buffs = [...c.buffs.filter(b => b.stat !== stat), { stat, valeur }]
                      updateCompagnon(c.id, { buffs })
                    }}
                    onClearBuff={stat => updateCompagnon(c.id, { buffs: c.buffs.filter(b => b.stat !== stat) })}
                    onRetirerDot={dotId => handleRetirerDot(c.id, dotId)}
                    onTirerCarte={tirerCarte}
                  />
                </div>
              </div>
            ))}
            {dragState?.liste === 'compagnon' && dropIndex === session.compagnons.length && caseFantome}
          </div>

          {/* Barre de séparation déplaçable — zone de saisie large (8px) pour un glisser confortable,
              trait visuel fin (1px) centré dedans pour rester discret comme avant. */}
          <div
            onPointerDown={e => {
              e.preventDefault()
              resizeRef.current = { startX: e.clientX, startRatio: splitRatio, areaWidth: areaRef.current?.getBoundingClientRect().width ?? 0 }
              setIsResizingSplit(true)
            }}
            style={{
              width: 8, flexShrink: 0, cursor: 'col-resize', touchAction: 'none',
              display: 'flex', justifyContent: 'center',
            }}
          >
            <div style={{
              width: 1, background: isResizingSplit ? GOLD : SECTION_BORDER, transition: isResizingSplit ? 'none' : 'background 0.15s',
            }} />
          </div>

          {/* Créatures — à droite. */}
          <div
            ref={creaturesColRef}
            style={{ flex: `${splitRatio} 1 0%`, minWidth: 0, overflowY: 'auto', display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 14, alignContent: 'flex-start' }}
          >
            {session.combatants.map((c, index) => (
              <div key={c.id} style={{ display: 'contents' }}>
                {dragState?.liste === 'creature' && dropIndex === index && caseFantome}
                <div
                  data-drag-index={index}
                  data-drag-liste="creature"
                  onPointerDown={handleCardPointerDown('creature', c.id)}
                  style={{ opacity: dragState?.id === c.id ? 0.35 : 1, cursor: 'grab', touchAction: 'none' }}
                >
                  <CombatCard
                    combatant={c}
                    estEnCours={estEnCours(c.id)}
                    cibles={cibles.filter(x => x.id !== c.id)}
                    attaquants={attaquantsDe(c.id)}
                    onToggleExpand={() => updateCombatant(c.id, { expanded: !c.expanded })}
                    onSetPV={pv => updateCombatant(c.id, { pvActuels: pv })}
                    onAttaque={attaque => handleAttaque(c, attaque)}
                    onSetCible={id => updateCombatant(c.id, { cibleId: id })}
                    onSetBuff={(stat, valeur) => {
                      const buffs = [...c.buffs.filter(b => b.stat !== stat), { stat, valeur }]
                      updateCombatant(c.id, { buffs })
                    }}
                    onClearBuff={stat => updateCombatant(c.id, { buffs: c.buffs.filter(b => b.stat !== stat) })}
                    onRetirerDot={dotId => handleRetirerDot(c.id, dotId)}
                    onTirerCarte={tirerCarte}
                  />
                </div>
              </div>
            ))}
            {dragState?.liste === 'creature' && dropIndex === session.combatants.length && caseFantome}
          </div>

          {/* Liens visuels de ciblage — calque SVG non interactif par-dessus les deux colonnes. Tracé en
              coude à angles droits (horizontal → vertical → horizontal, pivot au milieu) plutôt qu'une
              ligne droite, pour éviter de passer visuellement par-dessus les cartes entre les deux. */}
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 5 }}>
            <defs>
              <marker id="cible-fleche" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M0,0 L10,5 L0,10 z" fill={LINK_COLOR} />
              </marker>
              <marker id="cible-fleche-pj" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M0,0 L10,5 L0,10 z" fill={LINK_COLOR_PJ} />
              </marker>
            </defs>
            {links.map(l => {
              const midY = l.midY
              const midX = (l.x1 + l.x2) / 2
              const couleur = l.source === 'pj' ? LINK_COLOR_PJ : LINK_COLOR
              const d = `M ${l.x1},${l.y1} L ${l.x1},${midY} L ${l.x2},${midY} L ${l.x2},${l.y2}`
              return (
                <g key={l.id}>
                  <path d={d} fill="none"
                    stroke={couleur} strokeWidth={2} strokeDasharray="6 4"
                    markerEnd={l.source === 'pj' ? 'url(#cible-fleche-pj)' : 'url(#cible-fleche)'} />
                  {(() => {
                    const ligneAtk = l.jetTotal !== undefined
                    const ligneDm = !l.toucheRate && l.degatsAppliques !== undefined
                    // rdAppliquee undefined alors que degatsTotal est défini : cible PJ (voir
                    // resoudreAttaque dans combat.ts) — RD non résolue ici, pas de faux "RD 0".
                    const detailDm = l.degatsTotal !== undefined && l.rdAppliquee !== undefined
                    if (!ligneAtk && !ligneDm) return null
                    const deuxLignes = ligneAtk && ligneDm
                    const boxHeight = deuxLignes ? 50 : 32
                    const yAtk = deuxLignes ? midY - 9 : midY + 5
                    const yDm = deuxLignes ? midY + 15 : midY + 5
                    const DIM = 'rgba(245,236,215,0.4)'
                    return (
                      <>
                        <rect x={midX - 115} y={midY - boxHeight / 2 - 4} width={230} height={boxHeight} rx={6}
                          fill="rgba(15,12,8,0.92)" stroke={couleur} strokeWidth={1} />
                        {/* Attaquant (violet) séparé visuellement de la cible (doré) par un tiret, puis le résultat */}
                        {ligneAtk && (
                          <text x={midX} y={yAtk} textAnchor="middle" fontSize={14}>
                            <tspan fill={LINK_COLOR} fontWeight={700}>ATK {l.jetTotal}</tspan>
                            <tspan fill={DIM}> {'—'} </tspan>
                            <tspan fill={GOLD} fontWeight={700}>DEF {l.cibleDef}</tspan>
                            <tspan fill={DIM}>  =  </tspan>
                            <tspan fill={l.toucheRate ? 'rgba(255,150,150,0.95)' : 'rgba(120,220,140,0.95)'} fontWeight={700}>
                              {l.toucheRate ? t('gmMode.bataille.rateCourt') : t('gmMode.bataille.toucheCourt')}
                            </tspan>
                          </text>
                        )}
                        {ligneDm && (
                          <text x={midX} y={yDm} textAnchor="middle" fontSize={14}>
                            {detailDm ? (
                              <>
                                <tspan fill={LINK_COLOR} fontWeight={700}>DM {l.degatsTotal}</tspan>
                                <tspan fill={DIM}> {'—'} </tspan>
                                <tspan fill={GOLD} fontWeight={700}>{t('gmMode.bataille.rdLabel')} {l.rdAppliquee ?? 0}</tspan>
                                <tspan fill={DIM}>  =  </tspan>
                                <tspan fill="rgba(120,220,140,0.95)" fontWeight={700}>{l.degatsAppliques} DM</tspan>
                              </>
                            ) : (
                              <tspan fill="rgba(120,220,140,0.95)" fontWeight={700}>
                                {l.typeDegats !== undefined && `${ICONES_TYPES_DEGATS[l.typeDegats]} `}{l.degatsAppliques} DM
                              </tspan>
                            )}
                          </text>
                        )}
                      </>
                    )
                  })()}
                </g>
              )
            })}
          </svg>
        </div>
      </div>

      {/* Tiroir latéral — import/liste des PJ, côté gauche pour rester à côté de sa colonne (voir
          l'inversion des deux colonnes ci-dessus). */}
      <div
        onMouseLeave={() => setPjPanelOpen(false)}
        style={{
          position: 'absolute', top: 0, left: 0, height: '100%', zIndex: 20,
          display: 'flex', alignItems: 'stretch',
          transform: pjPanelOpen ? 'translateX(0)' : 'translateX(-380px)',
          transition: 'transform 0.2s ease',
        }}
      >
        {/* Panneau d'abord (flush contre le bord gauche de l'écran à l'état ouvert, hors-écran une fois
            fermé), poignée ensuite (côté intérieur, toujours visible même tiroir fermé). */}
        <div style={{
          width: 380, flexShrink: 0, display: 'flex', flexDirection: 'column',
          background: 'rgba(15,12,8,0.97)', border: `1px solid ${SECTION_BORDER}`, borderLeft: 'none',
          boxShadow: '6px 0 24px rgba(0,0,0,0.5)', overflow: 'hidden',
        }}>
          <div style={{
            flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px', borderBottom: `1px solid ${SECTION_BORDER}`, background: 'rgba(201,168,76,0.08)',
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: GOLD }}>{t('gmMode.bataille.personnages')}</span>
            <button onClick={() => setPjPanelOpen(false)} style={{ background: 'transparent', border: 'none', color: 'rgba(245,236,215,0.6)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
          </div>
          <div style={{ padding: 16, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input ref={fileRef} type="file" accept=".json" multiple style={{ display: 'none' }}
              onChange={e => { if (e.target.files) handleFiles(e.target.files); e.target.value = '' }} />
            <button
              onClick={() => fileRef.current?.click()}
              style={{
                padding: '8px 14px', borderRadius: 4, border: '1px dashed rgba(201,168,76,0.5)',
                background: 'transparent', color: GOLD, cursor: 'pointer', fontSize: 13,
              }}
            >
              📂 {t('gmMode.bataille.importerPJ')}
            </button>

            {/* PJ connectés au réseau mais pas encore engagés (voir pjsEnAttente) — un joueur peut se
                connecter puis rejoindre le combat plus tard, pas forcément dès sa connexion. */}
            {pjsEnAttente.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(245,236,215,0.5)' }}>
                  🌐 {t('gmMode.bataille.pjEnAttente')}
                </span>
                {pjsEnAttente.map(p => rendrePJAttente(p.connexionId, nomQualifie(p.character), () => activerPJ(p.character)))}
              </div>
            )}

            {/* PJ importés par fichier mais pas encore engagés (voir handleFiles/pjsImportesEnAttente) —
                même principe que ci-dessus, sans le 🌐 : distingue visuellement la provenance. */}
            {pjsImportesEnAttente.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(245,236,215,0.5)' }}>
                  {t('gmMode.bataille.pjImportesEnAttente')}
                </span>
                {pjsImportesEnAttente.map(c => rendrePJAttente(c.nomPersonnage, nomQualifie(c), () => activerPJ(c)))}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {session.pjs.length === 0 ? (
                <span style={{ fontSize: 13, opacity: 0.4 }}>{t('gmMode.bataille.aucunPJ')}</span>
              ) : session.pjs.map(p => (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                  border: `1px solid ${SECTION_BORDER}`, borderRadius: 6,
                }}>
                  <span style={{ flex: 1, fontSize: 13, color: PARCHMENT }}>{p.character.nomPersonnage}</span>
                  <button onClick={() => removePJ(p.id)} style={{
                    background: 'transparent', border: '1px solid rgba(255,80,80,0.3)', borderRadius: 4,
                    color: 'rgba(255,110,110,0.8)', cursor: 'pointer', fontSize: 11, padding: '2px 6px',
                  }}>✕</button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <button
          onMouseEnter={() => setPjPanelOpen(true)}
          onClick={() => setPjPanelOpen(o => !o)}
          style={{
            width: 30, height: 140, flexShrink: 0, alignSelf: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '10px 0', background: 'rgba(15,12,8,0.95)',
            border: `1px solid ${SECTION_BORDER}`, borderLeft: 'none', borderRadius: '0 6px 6px 0',
            color: GOLD, cursor: 'pointer', boxShadow: '4px 0 16px rgba(0,0,0,0.4)',
          }}
        >
          {/* writing-mode plutôt que transform: rotate() sur le texte — un texte pivoté par transform
              garde la boîte de mise en page de sa version NON pivotée (le transform ne change que le
              dessin, pas la mise en page), donc son espace réservé ne correspond pas à sa taille réelle
              une fois pivoté : texte coupé (constaté sur tablette). writing-mode empile le texte
              verticalement nativement, avec la bonne taille de boîte ; rotate(180deg) en plus est sans
              risque pour la mise en page (contrairement à 90°/-90°, ça ne change pas largeur/hauteur).
              L'émoji est sorti du span vertical et empilé à part : dans le moteur WebKitGTK, un émoji
              inséré DANS un flux vertical-rl ne se positionne pas correctement (décalage constaté sur
              tablette) — en tant qu'élément normal séparé, il n'est pas concerné par la bascule. */}
          <span style={{ fontSize: 16 }}>🧑</span>
          <span style={{
            writingMode: 'vertical-rl', textOrientation: 'mixed', transform: 'rotate(180deg)',
            whiteSpace: 'nowrap', fontSize: 13, letterSpacing: '0.05em', marginTop: 4,
          }}>
            {t('gmMode.bataille.personnages')}
          </span>
        </button>
      </div>
    </div>
  )
}
