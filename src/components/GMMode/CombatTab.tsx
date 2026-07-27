import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useGameData } from '../../context/GameDataContext'
import CombatCard from './CombatCard'
import PJCard from './PJCard'
import { importPJ, resoudreAttaque, listerEntites, tickerDots } from '../../utils/combat'
import type { CombatSession, CombatCreature, RollResult, DotActif } from '../../utils/combat'
import type { Character } from '../../types/character'
import { ICONES_TYPES_DEGATS } from '../../utils/damageTypes'
import { compagnonEnCreature } from '../../utils/compagnons'
import { desenvelopper, messageMauvaisType } from '../../utils/importTypage'

const GOLD = '#c9a84c'
const PARCHMENT = '#f5ecd7'
const SECTION_BORDER = 'rgba(201,168,76,0.2)'
const LINK_COLOR = 'rgba(200,170,255,0.85)'          // liens partant d'une créature
const LINK_COLOR_PJ = 'rgba(110,220,200,0.85)'       // liens partant d'un PJ — teinte distincte

interface Props {
  session: CombatSession | null
  onSessionChange: (session: CombatSession) => void
  onEndSession: () => void
  onSauvegarder: () => void
}

// Les trois colonnes réordonnables indépendamment (voir le suivi au pointeur plus bas) — un compagnon
// ne se mélange jamais aux PJ dans l'ordre, même s'il partage leur colonne visuelle.
type ListeDrag = 'creature' | 'pj' | 'compagnon'

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
  const { data: descriptions, compagnons: compagnonsCatalogue } = useGameData()
  const [pjPanelOpen, setPjPanelOpen] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const areaRef = useRef<HTMLDivElement>(null)
  const creaturesColRef = useRef<HTMLDivElement>(null)
  const pjsColRef = useRef<HTMLDivElement>(null)
  const [links, setLinks] = useState<Link[]>([])
  // Part (0 à 1) de la largeur totale attribuée à la colonne Créatures — le reste va aux PJ. Ajustable
  // en glissant la barre de séparation (voir resizeRef ci-dessous) ; conservée dans la session (donc
  // incluse dans l'instantané sauvegardé) plutôt qu'en état local, pour survivre à une sauvegarde/reprise.
  const splitRatio = session?.splitRatio ?? 0.5
  const [isResizingSplit, setIsResizingSplit] = useState(false)
  const resizeRef = useRef<{ startX: number; startRatio: number; areaWidth: number } | null>(null)

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
    } else {
      const list = [...session.compagnons]
      const fromIndex = list.findIndex(c => c.id === id)
      if (fromIndex === -1) return
      const [item] = list.splice(fromIndex, 1)
      list.splice(fromIndex < dropIndex ? dropIndex - 1 : dropIndex, 0, item)
      onSessionChange({ ...session, compagnons: list })
    }
  }, [session, onSessionChange])

  // Écoute globale (pas seulement sur la carte) pour continuer à suivre le pointeur même s'il quitte la
  // carte ou la colonne pendant un glisser rapide. Seuil de 5px avant de considérer que c'est un glisser
  // (pas un simple clic) : sans lui, déplier/replier une carte ou cliquer un contrôle qui laisse
  // remonter l'événement jusqu'au fond de la carte déclencherait un glisser fantôme d'un pixel.
  useEffect(() => {
    // Compagnon et PJ partagent le même conteneur visuel (colonne PJ), pas les créatures.
    const conteneurDe = (liste: ListeDrag) => liste === 'creature' ? creaturesColRef.current : pjsColRef.current
    const totalDe = (liste: ListeDrag) =>
      liste === 'creature' ? (session?.combatants.length ?? 0)
      : liste === 'pj' ? (session?.pjs.length ?? 0)
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
      let midY = Math.max(y1, y2) + 20 + idx * 14
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

  if (!session) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.4, fontSize: 14, textAlign: 'center', padding: 20 }}>
        {t('gmMode.bataille.aucuneSession')}
      </div>
    )
  }

  const updateCombatant = (id: string, patch: Partial<CombatSession['combatants'][number]>) => {
    onSessionChange({ ...session, combatants: session.combatants.map(c => c.id === id ? { ...c, ...patch } : c) })
  }

  const updateCompagnon = (id: string, patch: Partial<CombatCreature>) => {
    onSessionChange({ ...session, compagnons: session.compagnons.map(c => c.id === id ? { ...c, ...patch } : c) })
  }

  const updatePJ = (id: string, patch: Partial<CombatSession['pjs'][number]>) => {
    onSessionChange({ ...session, pjs: session.pjs.map(p => p.id === id ? { ...p, ...patch } : p) })
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

  const tourSuivant = () => {
    onSessionChange({
      ...session,
      combatants: session.combatants.map(c => tickerDots({ ...c, aJoueCeTour: false, dernierResultat: null })),
      pjs: session.pjs.map(p => tickerDots({ ...p, dernierResultat: null })),
      compagnons: session.compagnons.map(c => tickerDots({ ...c, aJoueCeTour: false, dernierResultat: null })),
    })
  }

  // Compagnons actifs du PJ importé (voir compagnonEnCreature) : mêmes contrôles qu'une créature
  // (PV, cible, attaques cliquables), mais alliés du PJ — rendus dans sa colonne, jamais celle des
  // créatures. pjProprietaireId les relie à leur PJ (affichage + retrait en cascade, voir removePJ).
  const compagnonsDe = (pj: CombatSession['pjs'][number]): CombatCreature[] => {
    const brut: (string | null)[] = pj.character.compagnonsActifs ?? []
    const noms = brut.filter((n): n is string => !!n)
    return noms.flatMap(nom => {
      const creature = compagnonEnCreature(nom, compagnonsCatalogue, pj.character, descriptions)
      if (!creature) return []
      return [{
        id: `compagnon-${pj.id}-${nom}`,
        creature, pvActuels: creature.pv ?? 0, aJoueCeTour: false, buffs: [],
        expanded: false, dernierResultat: null, cibleId: null, dotsActifs: [],
        pjProprietaireId: pj.id,
      }]
    })
  }

  const handleFiles = async (files: FileList) => {
    const nouveaux: CombatSession['pjs'] = []
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
          if (character) nouveaux.push(importPJ(character, descriptions))
        }
      } catch { /* fichier invalide, ignoré */ }
    }
    if (rejets.length > 0) { setSaveMsg(rejets.join(' ')); setTimeout(() => setSaveMsg(null), 5000) }
    // Classés par initiative décroissante, quel que soit l'ordre d'import des fichiers (même règle que
    // les créatures au lancement d'une rencontre, voir demarrerCombat dans combat.ts).
    if (nouveaux.length > 0) {
      const pjs = [...session.pjs, ...nouveaux].sort((a, b) => b.character.initiative - a.character.initiative)
      const compagnons = [...session.compagnons, ...nouveaux.flatMap(compagnonsDe)]
      onSessionChange({ ...session, pjs, compagnons })
    }
  }

  // Un seul appel à onSessionChange pour tout l'attaque (résultat sur l'attaquant + dégâts sur la
  // cible) : deux appels séparés à updateCombatant/updatePJ ici se baseraient tous deux sur le même
  // `session` (fermeture de ce rendu), donc le second écraserait le premier au lieu de le compléter.
  // combatant peut être une créature OU un compagnon (même forme, voir compagnonsDe) — seul le tableau
  // qui le contient réellement changera, l'autre passe inchangé faute d'id correspondant. La cible peut
  // être n'importe laquelle des trois listes (créature, PJ ou compagnon).
  const handleAttaque = (combatant: CombatCreature, attaque: NonNullable<CombatCreature['creature']['attaques']>[number]) => {
    const cibleInfo = combatant.cibleId ? cibles.find(c => c.id === combatant.cibleId) ?? null : null
    const result = resoudreAttaque(attaque.nom, attaque.bonus, attaque.dm, cibleInfo)
    const cibleId = combatant.cibleId
    const degats = result.degatsAppliques

    const appliquer = (c: CombatCreature): CombatCreature => {
      if (c.id === combatant.id) return { ...c, dernierResultat: result, aJoueCeTour: true }
      if (cibleId && degats !== undefined && c.id === cibleId) return { ...c, pvActuels: Math.max(0, c.pvActuels - degats) }
      return c
    }
    const nextCombatants = session.combatants.map(appliquer)
    const nextCompagnons = session.compagnons.map(appliquer)
    const nextPjs = (cibleId && degats !== undefined)
      ? session.pjs.map(p => p.id === cibleId ? { ...p, pvActuels: Math.max(0, p.pvActuels - degats) } : p)
      : session.pjs

    onSessionChange({ ...session, combatants: nextCombatants, compagnons: nextCompagnons, pjs: nextPjs })
  }

  // Un PJ n'a pas de moteur de jet propre : le MJ résout l'attaque lui-même (à la table ou de tête) et
  // saisit directement le montant final infligé — pas de jet d'attaque/DEF/RD à recalculer ici, juste
  // l'appliquer à la cible et garder le résultat pour l'afficher (cartouche + lien, voir ResultatCartouche).
  // type est purement informatif (icône affichée), jamais utilisé pour un calcul de RD — voir RollResult.
  const handleAttaquePJ = (pj: CombatSession['pjs'][number], montant: number, type: string) => {
    const cibleInfo = pj.cibleId ? cibles.find(c => c.id === pj.cibleId) ?? null : null
    if (!cibleInfo || montant <= 0) return
    const result: RollResult = {
      attaqueNom: t('gmMode.bataille.attaqueManuelle'), cibleNom: cibleInfo.nom,
      degatsAppliques: montant, typeDegats: type || undefined,
    }
    const cibleId = pj.cibleId

    const nextCombatants = session.combatants.map(c => c.id === cibleId ? { ...c, pvActuels: Math.max(0, c.pvActuels - montant) } : c)
    const nextCompagnons = session.compagnons.map(c => c.id === cibleId ? { ...c, pvActuels: Math.max(0, c.pvActuels - montant) } : c)
    const nextPjs = session.pjs.map(p => {
      if (p.id === pj.id) return { ...p, dernierResultat: result }
      if (p.id === cibleId) return { ...p, pvActuels: Math.max(0, p.pvActuels - montant) }
      return p
    })

    onSessionChange({ ...session, combatants: nextCombatants, compagnons: nextCompagnons, pjs: nextPjs })
  }

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

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      {apercuGlisse}
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
                    // degatsAppliques (pas degatsTotal) : un PJ n'a pas de jet propre, seul le montant
                    // final saisi à la main par le MJ existe (voir handleAttaquePJ) — degatsTotal reste
                    // alors undefined et la ligne se réduit au montant seul, sans détail brut/RD.
                    const ligneDm = !l.toucheRate && l.degatsAppliques !== undefined
                    const detailDm = l.degatsTotal !== undefined
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
