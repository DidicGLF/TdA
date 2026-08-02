import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Note, RelationType } from '../types/gameData'

const GOLD = '#c9a84c'

// Espace de coordonnées virtuel du graphe — le SVG le redimensionne automatiquement au conteneur
// réel via viewBox, pas besoin de mesurer les pixels du panneau (ResizeObserver, etc.).
const CANVAS = 560

// Symbole affiché au milieu d'un lien du graphe pour la relation choisie — uniquement là, jamais
// ailleurs dans l'interface (voir Note.relations).
const RELATION_SYMBOLES: Record<RelationType, { glyphe: string; couleur: string }> = {
  amical: { glyphe: '♥', couleur: '#7fd88f' },
  ennemi: { glyphe: '⚔', couleur: '#e05555' },
  neutre: { glyphe: '●', couleur: 'rgba(245,236,215,0.6)' },
}
const RELATION_TYPES: RelationType[] = ['amical', 'ennemi', 'neutre']

// labelHaut/labelBas : deux textes indépendants, position FIXE (haut = toujours au-dessus du trait, bas
// = toujours en dessous — pas liée à qui a écrit le [[lien]] wiki). *Inverse : sens de la flèche de
// CHAQUE texte, réglable indépendamment de sa position — voir Note.relations pour le détail des défauts.
type GraphEdge = {
  source: string; target: string; relation?: RelationType
  labelHaut?: string; labelHautInverse?: boolean
  labelBas?: string; labelBasInverse?: boolean
}
type Point = { x: number; y: number }

// Rayon d'un nœud — croît avec son nombre de liens (racine carrée pour que les gros ne dévorent pas les
// petits), plafonné pour ne jamais écraser le graphe. Partagé entre la disposition (évitement de
// chevauchement radius-aware, voir calculerLayout) et le rendu (cercle affiché) : les deux doivent
// s'accorder sur la même taille, sinon l'anti-chevauchement calculé ne correspondrait pas à ce qui est
// dessiné. focus (agrandissement du nœud sélectionné) est ignoré ici : inconnu au moment de la
// disposition, et de toute façon marginal (+3) pour ce que ça change à l'espacement.
function rayonDeNoeud(degre: number): number {
  return Math.min(3 + Math.sqrt(degre) * 4, 20)
}

// Repère tous les [[Titre]] d'une note — même syntaxe que le rendu Markdown léger de NotesTab.
function extraireLiens(contenu: string): string[] {
  const regex = /\[\[(.+?)\]\]/g
  const titres: string[] = []
  let m: RegExpExecArray | null
  while ((m = regex.exec(contenu))) titres.push(m[1].trim())
  return titres
}

// Disposition à ressorts (force-directed) toute simple, faite main plutôt que d'ajouter une
// dépendance : les nœuds se repoussent entre eux, les liens rapprochent leurs deux extrémités vers
// une distance idéale, et une légère attraction vers le centre évite que le graphe ne dérive.
// La position de départ dépend d'une graine (PRNG déterministe maison) : essayer plusieurs graines
// donne des dispositions finales différentes, dont certaines évitent mieux les croisements de liens
// que d'autres — voir meilleureDisposition, qui choisit celle qui en a le moins.
function calculerLayout(nodeIds: string[], edges: GraphEdge[], taille: number, graine = 0, rayonParId?: Map<string, number>): Map<string, Point> {
  let etatAlea = (graine * 999331 + 12345) >>> 0
  const alea = () => {
    etatAlea = (etatAlea * 1103515245 + 12345) >>> 0
    return etatAlea / 0xffffffff
  }

  const positions = new Map<string, Point & { vx: number; vy: number }>()
  nodeIds.forEach((id, i) => {
    const angle = (i / Math.max(nodeIds.length, 1)) * Math.PI * 2 + alea() * Math.PI * 2
    const rayon = taille * (0.15 + alea() * 0.25)
    positions.set(id, {
      x: taille / 2 + Math.cos(angle) * rayon,
      y: taille / 2 + Math.sin(angle) * rayon,
      vx: 0, vy: 0,
    })
  })

  const REPULSION = 2600
  const SPRING = 0.02
  const DIST_IDEALE = 100
  const AMORTI = 0.85
  const RAPPEL_CENTRE = 0.01
  const MARGE = 30

  for (let iter = 0; iter < 220; iter++) {
    for (const idA of nodeIds) {
      const a = positions.get(idA)!
      let fx = 0, fy = 0
      for (const idB of nodeIds) {
        if (idA === idB) continue
        const b = positions.get(idB)!
        const dx = a.x - b.x, dy = a.y - b.y
        const distSq = Math.max(dx * dx + dy * dy, 1)
        const force = REPULSION / distSq
        const dist = Math.sqrt(distSq)
        fx += (dx / dist) * force
        fy += (dy / dist) * force
      }
      fx += (taille / 2 - a.x) * RAPPEL_CENTRE
      fy += (taille / 2 - a.y) * RAPPEL_CENTRE
      a.vx = (a.vx + fx) * AMORTI
      a.vy = (a.vy + fy) * AMORTI
    }
    for (const e of edges) {
      const a = positions.get(e.source)
      const b = positions.get(e.target)
      if (!a || !b) continue
      const dx = b.x - a.x, dy = b.y - a.y
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
      const force = (dist - DIST_IDEALE) * SPRING
      const fx = (dx / dist) * force, fy = (dy / dist) * force
      a.vx += fx; a.vy += fy
      b.vx -= fx; b.vy -= fy
    }
    for (const id of nodeIds) {
      const p = positions.get(id)!
      p.x = Math.min(Math.max(p.x + p.vx, MARGE), taille - MARGE)
      p.y = Math.min(Math.max(p.y + p.vy, MARGE), taille - MARGE)
    }
  }

  // Passe finale d'évitement de chevauchement, radius-aware — la simulation à ressorts ci-dessus n'a
  // qu'une répulsion générique par point, sans connaître le RAYON réel affiché (voir rayonDeNoeud) : deux
  // gros nœuds (beaucoup de liens) peuvent donc rester trop proches malgré elle. Sépare toute paire qui
  // se chevauche encore, à parts égales le long de leur axe ; plusieurs passes car séparer une paire peut
  // en réintroduire une autre (demandé par Didic : les pastilles ne doivent jamais se chevaucher).
  const PADDING_NOEUDS = 6
  for (let passe = 0; passe < 60; passe++) {
    let bouge = false
    for (let i = 0; i < nodeIds.length; i++) {
      for (let j = i + 1; j < nodeIds.length; j++) {
        const a = positions.get(nodeIds[i])!, b = positions.get(nodeIds[j])!
        const rA = rayonParId?.get(nodeIds[i]) ?? 6, rB = rayonParId?.get(nodeIds[j]) ?? 6
        const dx = b.x - a.x, dy = b.y - a.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.01
        const minDist = rA + rB + PADDING_NOEUDS
        if (dist < minDist) {
          bouge = true
          const push = (minDist - dist) / 2
          const ux = dx / dist, uy = dy / dist
          a.x = Math.min(Math.max(a.x - ux * push, MARGE), taille - MARGE)
          a.y = Math.min(Math.max(a.y - uy * push, MARGE), taille - MARGE)
          b.x = Math.min(Math.max(b.x + ux * push, MARGE), taille - MARGE)
          b.y = Math.min(Math.max(b.y + uy * push, MARGE), taille - MARGE)
        }
      }
    }
    if (!bouge) break
  }

  const result = new Map<string, Point>()
  positions.forEach((p, id) => result.set(id, { x: p.x, y: p.y }))
  return result
}

// Test d'intersection de deux segments (méthode par orientation, standard) — sert à compter combien
// de liens se croisent visuellement dans une disposition donnée.
function segmentsSeCroisent(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const orientation = (a: Point, b: Point, c: Point) => {
    const val = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y)
    if (Math.abs(val) < 1e-9) return 0
    return val > 0 ? 1 : 2
  }
  const surSegment = (a: Point, b: Point, c: Point) =>
    Math.min(a.x, b.x) <= c.x && c.x <= Math.max(a.x, b.x) && Math.min(a.y, b.y) <= c.y && c.y <= Math.max(a.y, b.y)

  const o1 = orientation(p1, p2, p3)
  const o2 = orientation(p1, p2, p4)
  const o3 = orientation(p3, p4, p1)
  const o4 = orientation(p3, p4, p2)

  if (o1 !== o2 && o3 !== o4) return true
  if (o1 === 0 && surSegment(p1, p2, p3)) return true
  if (o2 === 0 && surSegment(p1, p2, p4)) return true
  if (o3 === 0 && surSegment(p3, p4, p1)) return true
  if (o4 === 0 && surSegment(p3, p4, p2)) return true
  return false
}

// Nombre de paires de liens qui se croisent dans une disposition — les paires partageant une
// extrémité (deux liens issus du même nœud) ne comptent pas : elles se rejoignent au nœud commun,
// ce n'est pas un croisement génant à éviter.
function compterCroisements(edges: GraphEdge[], positions: Map<string, Point>): number {
  let total = 0
  for (let i = 0; i < edges.length; i++) {
    const a1 = positions.get(edges[i].source), a2 = positions.get(edges[i].target)
    if (!a1 || !a2) continue
    for (let j = i + 1; j < edges.length; j++) {
      const e1 = edges[i], e2 = edges[j]
      if (e1.source === e2.source || e1.source === e2.target || e1.target === e2.source || e1.target === e2.target) continue
      const b1 = positions.get(e2.source), b2 = positions.get(e2.target)
      if (!b1 || !b2) continue
      if (segmentsSeCroisent(a1, a2, b1, b2)) total++
    }
  }
  return total
}

// Essaie plusieurs graines de départ et garde la disposition qui minimise le nombre de croisements de
// liens — s'arrête dès qu'une disposition sans aucun croisement est trouvée. Le chevauchement des
// pastilles, lui, est déjà éliminé par calculerLayout (passe radius-aware) pour CHAQUE graine essayée
// ici, donc pas besoin de le compter en plus dans ce score : les croisements de LIENS restent seuls
// juges entre plusieurs dispositions qui n'ont, elles, aucun nœud qui se chevauche.
function meilleureDisposition(nodeIds: string[], edges: GraphEdge[], taille: number, tentative: number, rayonParId?: Map<string, number>): Map<string, Point> {
  const ESSAIS = 16
  let meilleure = calculerLayout(nodeIds, edges, taille, tentative * 1000, rayonParId)
  let meilleurScore = compterCroisements(edges, meilleure)
  for (let essai = 1; essai < ESSAIS && meilleurScore > 0; essai++) {
    const candidate = calculerLayout(nodeIds, edges, taille, tentative * 1000 + essai, rayonParId)
    const score = compterCroisements(edges, candidate)
    if (score < meilleurScore) { meilleure = candidate; meilleurScore = score }
  }
  return meilleure
}

interface Props {
  selectedId: string | null
  onOpenNote: (id: string) => void
  // Injecté par l'appelant (comme dans NotesTab) pour que le même graphe serve aux notes joueur et
  // aux notes MJ, deux bibliothèques distinctes.
  notes: Note[]
  // Applique le choix fait dans le menu ouvert au clic sur un lien — sourceId est la note dont le
  // contenu porte le [[Titre]] (celle qui stocke Note.relations), targetId la note visée ; type=null
  // efface la relation (et les deux textes avec, voir le menu). Laissé à l'appelant plutôt que reçu déjà
  // résolu : NotesGraph ne connaît pas le setState des deux bibliothèques de notes (joueur/MJ) qui
  // l'utilisent. labels : les deux textes haut/bas + leur sens (voir Note.relations) — absent quand
  // type=null.
  onSetRelation: (sourceId: string, targetId: string, type: RelationType | null, labels?: {
    labelHaut?: string; labelHautInverse?: boolean; labelBas?: string; labelBasInverse?: boolean
  }) => void
  // Mémorise (ou efface, pos=null) la position déplacée à la main d'une note — voir Note.graphPosition.
  // Même logique que onSetRelation : NotesGraph ne connaît pas le setState des deux bibliothèques.
  onSetPosition: (id: string, pos: Point | null) => void
}

export default function NotesGraph({ selectedId, onOpenNote, notes, onSetRelation, onSetPosition }: Props) {
  const { t } = useTranslation()
  const svgRef = useRef<SVGSVGElement>(null)
  // Menu de choix de relation, ouvert au clic sur un lien — coordonnées écran (pas celles, internes au
  // SVG, du viewBox) pour se positionner simplement en `position: fixed`, indépendamment du zoom/pan.
  // labelHautInput/labelBasInput : brouillons des deux textes du lien (position fixe haut/bas, voir
  // GraphEdge.labelHaut/labelBas), initialisés aux valeurs courantes à l'ouverture (voir le clic sur un
  // lien plus bas). *Inverse : sens de chaque flèche, modifiable au clic sur la flèche du champ. Tout est
  // appliqué ensemble avec le type choisi, ou seul via le bouton Valider.
  const [relationMenu, setRelationMenu] = useState<{
    source: string; target: string; x: number; y: number
    labelHautInput: string; labelHautInverse: boolean
    labelBasInput: string; labelBasInverse: boolean
  } | null>(null)
  // Position du nœud en cours de glisser — uniquement pour le retour visuel pendant le drag ; une fois
  // relâché, la position finale est confiée à onSetPosition (voir Note.graphPosition), qui la persiste
  // et prime alors sur la disposition calculée via positionParId (voir posDe plus bas).
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragPos, setDragPos] = useState<Point | null>(null)
  const dragRef = useRef<{ id: string; startX: number; startY: number; moved: boolean; lastPoint: Point | null } | null>(null)
  // Pan du plateau entier : glisser sur le fond (pas sur un nœud, qui intercepte l'événement avant
  // qu'il n'atteigne le <svg>) translate tout le contenu.
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const panRef = useRef<{ startClientX: number; startClientY: number; startPanX: number; startPanY: number } | null>(null)
  // Incrémenté par le bouton « Recalculer » : force meilleureDisposition à explorer de nouvelles graines.
  const [tentative, setTentative] = useState(0)

  const { nodeIds, edges, titreParId, degreParId, couleurParId, positionParId, structureKey } = useMemo(() => {
    const parTitre = new Map(notes.filter(n => n.titre.trim()).map(n => [n.titre.trim().toLowerCase(), n]))
    const edges: GraphEdge[] = []
    for (const n of notes) {
      for (const cible of extraireLiens(n.contenu)) {
        const match = parTitre.get(cible.toLowerCase())
        if (match && match.id !== n.id) {
          const rel = n.relations?.find(r => r.versId === match.id)
          edges.push({
            source: n.id, target: match.id, relation: rel?.type,
            labelHaut: rel?.labelHaut, labelHautInverse: rel?.labelHautInverse,
            labelBas: rel?.labelBas, labelBasInverse: rel?.labelBasInverse,
          })
        }
      }
    }
    const nodeIds = notes.map(n => n.id)
    const titreParId = new Map(notes.map(n => [n.id, n.titre]))
    // Couleur de repère choisie par note (voir Note.couleur) — volontairement absente de structureKey
    // ci-dessous : changer juste la couleur d'une note ne doit pas relancer le calcul de disposition.
    const couleurParId = new Map(notes.map(n => [n.id, n.couleur]))
    // Positions mémorisées (voir Note.graphPosition) — délibérément absentes de structureKey ci-dessous :
    // déplacer un nœud ne doit pas être considéré comme un changement de structure du graphe (sinon
    // meilleureDisposition recalculerait tout, écrasant l'intérêt même de mémoriser la position).
    const positionParId = new Map(notes.filter(n => n.graphPosition).map(n => [n.id, n.graphPosition!]))
    // Nombre de liens touchant chaque note (dans un sens ou l'autre) — sert à faire grossir son point.
    const degreParId = new Map<string, number>(nodeIds.map(id => [id, 0]))
    for (const e of edges) {
      degreParId.set(e.source, (degreParId.get(e.source) ?? 0) + 1)
      degreParId.set(e.target, (degreParId.get(e.target) ?? 0) + 1)
    }
    const structureKey = nodeIds.slice().sort().join(',') + '|' + edges.map(e => `${e.source}>${e.target}`).sort().join(',')
    return { nodeIds, edges, titreParId, degreParId, couleurParId, positionParId, structureKey }
  }, [notes])

  // rayonParId (voir rayonDeNoeud) : passé à la disposition pour que l'évitement de chevauchement
  // connaisse la taille RÉELLE de chaque pastille, pas une valeur générique.
  const rayonParId = useMemo(() => new Map(nodeIds.map(id => [id, rayonDeNoeud(degreParId.get(id) ?? 0)])), [nodeIds, degreParId])

  // Ne recalcule la disposition que si la structure du graphe (quelles notes, quels liens) change
  // réellement — sinon éditer une note ailleurs ferait « sauter » tous les nœuds à chaque sauvegarde.
  // structureKey résume déjà nodeIds/edges ; les y ajouter forcerait un recalcul à chaque render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const positions = useMemo(() => meilleureDisposition(nodeIds, edges, CANVAS, tentative, rayonParId), [structureKey, tentative])

  // Suit le déplacement à la souris/au doigt sur window (pas sur le nœud lui-même) pour continuer à
  // recevoir les mouvements même si le curseur sort du petit cercle en cours de glisser.
  useEffect(() => {
    if (!draggingId) return
    const handleMove = (e: PointerEvent) => {
      const svg = svgRef.current
      const drag = dragRef.current
      if (!svg || !drag) return
      if (Math.abs(e.clientX - drag.startX) > 3 || Math.abs(e.clientY - drag.startY) > 3) drag.moved = true
      const rect = svg.getBoundingClientRect()
      // Les positions des nœuds sont exprimées dans l'espace local du groupe pané (voir le <g
      // transform> plus bas) : on retranche le pan courant pour repasser de l'espace écran à cet
      // espace local, sinon le nœud se déplacerait deux fois plus vite/dans le mauvais sens en cas de pan actif.
      const point = {
        x: (e.clientX - rect.left) * (CANVAS / rect.width) - pan.x,
        y: (e.clientY - rect.top) * (CANVAS / rect.height) - pan.y,
      }
      drag.lastPoint = point
      setDragPos(point)
    }
    const handleUp = () => {
      const drag = dragRef.current
      dragRef.current = null
      setDraggingId(null)
      setDragPos(null)
      if (!drag) return
      if (!drag.moved) onOpenNote(drag.id)
      else if (drag.lastPoint) onSetPosition(drag.id, drag.lastPoint)
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
  }, [draggingId, onOpenNote, onSetPosition, pan])

  // Pan du plateau : même principe que le glisser d'un nœud, mais translate tout le contenu au lieu
  // de déplacer une seule position.
  useEffect(() => {
    if (!isPanning) return
    const handleMove = (e: PointerEvent) => {
      const svg = svgRef.current
      const drag = panRef.current
      if (!svg || !drag) return
      const rect = svg.getBoundingClientRect()
      setPan({
        x: drag.startPanX + (e.clientX - drag.startClientX) * (CANVAS / rect.width),
        y: drag.startPanY + (e.clientY - drag.startClientY) * (CANVAS / rect.height),
      })
    }
    const handleUp = () => { panRef.current = null; setIsPanning(false) }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
  }, [isPanning])

  if (nodeIds.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.4, fontSize: 13, textAlign: 'center', padding: 20 }}>
        {t('notes.grapheVide')}
      </div>
    )
  }

  const connectes = new Set<string>()
  if (selectedId) {
    connectes.add(selectedId)
    for (const e of edges) {
      if (e.source === selectedId) connectes.add(e.target)
      if (e.target === selectedId) connectes.add(e.source)
    }
  }

  // Position effective d'un nœud : celle en cours de glisser prime, puis la position mémorisée (voir
  // Note.graphPosition), puis celle calculée par la disposition à ressorts.
  const posDe = (id: string): Point | undefined =>
    (draggingId === id && dragPos) ? dragPos : positionParId.get(id) ?? positions.get(id)

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', position: 'relative', padding: 12, boxSizing: 'border-box' }}>
      <button
        type="button"
        title={t('notes.grapheRecalculerAide')}
        onClick={() => {
          setTentative(t => t + 1)
          // Sinon les nœuds déjà déplacés à la main resteraient figés, rendant ce bouton sans effet sur eux.
          for (const id of nodeIds) if (positionParId.has(id)) onSetPosition(id, null)
        }}
        style={{
          position: 'absolute', top: 20, right: 20, zIndex: 1,
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'rgba(15,12,8,0.85)', border: '1px solid rgba(201,168,76,0.4)', borderRadius: 6,
          color: 'var(--tdr-gold, #c9a84c)', fontSize: 12, padding: '6px 10px', cursor: 'pointer',
        }}
      >
        ↻ {t('notes.grapheRecalculer')}
      </button>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CANVAS} ${CANVAS}`}
        // userSelect: 'none' — sans ça, glisser rapidement une pastille ou le fond sélectionne le texte
        // du graphe (titres des nœuds, textes des liens) comme n'importe quel texte de page, au lieu de
        // simplement déplacer/paner.
        style={{ width: '100%', height: '100%', touchAction: 'none', cursor: isPanning ? 'grabbing' : 'grab',
          userSelect: 'none', WebkitUserSelect: 'none' }}
        onPointerDown={e => {
          panRef.current = { startClientX: e.clientX, startClientY: e.clientY, startPanX: pan.x, startPanY: pan.y }
          setIsPanning(true)
        }}
      >
        {/* Fond invisible mais « pleine surface » : sans lui, un clic sur une zone vide sans forme
            dessinée ne remonterait pas jusqu'au <svg> pour déclencher le pan. */}
        <rect x={-CANVAS} y={-CANVAS} width={CANVAS * 3} height={CANVAS * 3} fill="transparent" />
        <g transform={`translate(${pan.x}, ${pan.y})`}>
        {edges.map((e, i) => {
          const a = posDe(e.source), b = posDe(e.target)
          if (!a || !b) return null
          const estAttenue = selectedId !== null && !(connectes.has(e.source) && connectes.has(e.target))
          const sym = e.relation ? RELATION_SYMBOLES[e.relation] : null
          return (
            <g key={i}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={estAttenue ? 'rgba(201,168,76,0.08)' : 'rgba(201,168,76,0.35)'} strokeWidth={1.5} />
              {/* Zone de clic élargie et invisible — un trait de 1.5px est trop fin à viser pour ouvrir
                  le menu de relation. stopPropagation empêche ce clic de démarrer aussi le pan du fond. */}
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={14}
                style={{ cursor: 'pointer' }}
                onPointerDown={ev => ev.stopPropagation()}
                onClick={ev => { ev.stopPropagation(); setRelationMenu({
                  source: e.source, target: e.target, x: ev.clientX, y: ev.clientY,
                  labelHautInput: e.labelHaut ?? '', labelHautInverse: e.labelHautInverse ?? false,
                  labelBasInput: e.labelBas ?? '', labelBasInverse: e.labelBasInverse ?? false,
                }) }}
              />
              {sym && (
                <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2} textAnchor="middle" dominantBaseline="central"
                  fontSize={13} fill={sym.couleur} opacity={estAttenue ? 0.2 : 1} style={{ pointerEvents: 'none' }}>
                  {sym.glyphe}
                </text>
              )}
              {(() => {
                // Dessine un des deux textes du lien, flèche intégrée en bout. versCible : sens VOULU
                // pour CE texte, réglable indépendamment au clic sur la flèche du champ dans le menu (voir
                // *Inverse) — le glyphe affiché ici (→ si versCible, ← sinon) est TOUJOURS exactement
                // celui affiché sur le bouton du menu, jamais reswappé selon l'angle de la ligne : un essai
                // précédent le faisait "pour rester géométriquement exact", mais ça affichait alors un
                // glyphe différent de celui du bouton cliqué, ce qui semblait juste faux à l'utilisateur
                // (retour de Didic, capture à l'appui) — la cohérence menu ↔ graphe prime ici sur la
                // précision de rotation d'un petit glyphe de toute façon peu perceptible.
                // offsetSigne : côté FIXE (+1 = toujours au-dessus du trait, -1 = toujours en dessous),
                // indépendant du sens choisi — sinon la position sur le graphe ne correspondrait plus à la
                // position du champ dans le menu (retour de Didic : champ du haut affiché en dessous).
                const segment = (texte: string, versCible: boolean, offsetSigne: 1 | -1) => {
                  const dx = b.x - a.x, dy = b.y - a.y
                  const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
                  // Jamais retourné à l'envers : au-delà de ±90°, on ajoute 180° pour garder le texte
                  // lisible de gauche à droite — ne touche qu'à la rotation, jamais au glyphe/à sa position
                  // dans la chaîne (voir plus haut).
                  let angleDeg = Math.atan2(dy, dx) * 180 / Math.PI
                  if (angleDeg > 90 || angleDeg < -90) angleDeg += 180
                  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
                  const decalX = (-dy / dist) * 9 * offsetSigne, decalY = (dx / dist) * 9 * offsetSigne
                  const lx = mx + decalX, ly = my + decalY
                  const couleur = estAttenue ? 'rgba(245,236,215,0.15)' : 'rgba(245,236,215,0.7)'
                  return (
                    <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central" fontSize={9} fill={couleur}
                      transform={`rotate(${angleDeg}, ${lx}, ${ly})`} style={{ pointerEvents: 'none' }}>
                      {versCible ? `${texte} →` : `← ${texte}`}
                    </text>
                  )
                }
                return (
                  <>
                    {e.labelHaut && segment(e.labelHaut, !e.labelHautInverse, 1)}
                    {e.labelBas && segment(e.labelBas, !!e.labelBasInverse, -1)}
                  </>
                )
              })()}
            </g>
          )
        })}
        {nodeIds.map(id => {
          const p = posDe(id)
          if (!p) return null
          const titre = (titreParId.get(id) || '').trim() || t('notes.sansTitre')
          const estFocus = selectedId === id
          const estAttenue = selectedId !== null && !connectes.has(id)
          const court = titre.length > 16 ? `${titre.slice(0, 15)}…` : titre
          // +3 si sélectionné : léger agrandissement de mise en avant, ignoré par la disposition (voir
          // rayonDeNoeud) — trop marginal pour justifier un recalcul de layout à chaque sélection.
          const rayon = rayonDeNoeud(degreParId.get(id) ?? 0) + (estFocus ? 3 : 0)
          return (
            <g
              key={id}
              onPointerDown={e => {
                e.stopPropagation()
                dragRef.current = { id, startX: e.clientX, startY: e.clientY, moved: false, lastPoint: null }
                setDraggingId(id)
              }}
              style={{ cursor: draggingId === id ? 'grabbing' : 'grab' }}
            >
              {/* Couleur de repère de la note (voir couleurParId) si choisie, sinon le doré par défaut —
                  fillOpacity (pas une couleur rgba figée) porte l'état focus/atténué/normal, pour que ça
                  fonctionne pareil quelle que soit la couleur choisie. */}
              <circle
                cx={p.x} cy={p.y} r={rayon}
                fill={couleurParId.get(id) || GOLD}
                fillOpacity={estFocus ? 1 : estAttenue ? 0.22 : 0.7}
                stroke="rgba(15,12,8,0.85)" strokeWidth={1.5}
              />
              <text x={p.x} y={p.y + rayon + 11} textAnchor="middle" fontSize={10}
                fill={estAttenue ? 'rgba(245,236,215,0.22)' : 'rgba(245,236,215,0.75)'}>
                {court}
              </text>
            </g>
          )
        })}
        </g>
      </svg>
      {relationMenu && (() => {
        // Type actuellement en place sur ce lien (avant tout choix dans ce menu) — sert de valeur à
        // conserver quand on valide juste le texte sans (re)cliquer un type. Volontairement sans défaut
        // 'neutre' : un lien peut n'avoir que du texte, sans aucun symbole (voir Note.relations).
        const edgeActuel = edges.find(e => e.source === relationMenu.source && e.target === relationMenu.target)
        const typeActuel = edgeActuel?.relation ?? null
        const titreSource = (titreParId.get(relationMenu.source) || '').trim() || t('notes.sansTitre')
        const titreCible = (titreParId.get(relationMenu.target) || '').trim() || t('notes.sansTitre')
        // Applique les deux textes (haut/bas) + le type donné (null = pas de symbole), puis ferme le menu
        // — partagé par le Valider et chaque bouton de type, pour que choisir un type n'efface jamais un
        // texte déjà saisi. Si tout est vide (ni type, ni texte), équivaut à "Aucune relation" plutôt que
        // de créer une entrée vide.
        const valider = (type: RelationType | null) => {
          const labelHaut = relationMenu.labelHautInput.trim() || undefined
          const labelBas = relationMenu.labelBasInput.trim() || undefined
          if (!type && !labelHaut && !labelBas) {
            onSetRelation(relationMenu.source, relationMenu.target, null)
          } else {
            onSetRelation(relationMenu.source, relationMenu.target, type, {
              labelHaut, labelHautInverse: relationMenu.labelHautInverse,
              labelBas, labelBasInverse: relationMenu.labelBasInverse,
            })
          }
          setRelationMenu(null)
        }
        return (
        <>
          <div onClick={() => setRelationMenu(null)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{
            position: 'fixed', left: relationMenu.x, top: relationMenu.y, zIndex: 41,
            transform: 'translate(-50%, 8px)',
            background: 'rgba(15,12,8,0.97)', border: '1px solid rgba(201,168,76,0.4)', borderRadius: 6,
            padding: 4, display: 'flex', flexDirection: 'column', gap: 1, minWidth: 200,
            boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
          }}>
            {/* Deux textes indépendants — le champ du haut s'affiche TOUJOURS au-dessus du lien, celui du
                bas TOUJOURS en dessous (position fixe, voir le rendu plus haut) : utile quand les deux
                personnages n'ont pas le même avis l'un de l'autre (ex. Perso 1 aime Perso 2, qui lui reste
                neutre). Le bouton flèche devant chaque champ inverse son sens indépendamment de sa
                position — le lien sur le graphe s'adapte aussitôt. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '3px 4px 5px' }}>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <button
                  onClick={ev => { ev.stopPropagation(); setRelationMenu(prev => prev ? { ...prev, labelHautInverse: !prev.labelHautInverse } : prev) }}
                  title={relationMenu.labelHautInverse ? `${titreCible} → ${titreSource}` : `${titreSource} → ${titreCible}`}
                  style={{ width: 20, height: 20, flexShrink: 0, padding: 0, borderRadius: 4,
                    border: '1px solid rgba(201,168,76,0.3)', background: 'rgba(255,255,255,0.04)',
                    color: 'rgba(245,236,215,0.75)', fontSize: 12, cursor: 'pointer' }}>
                  {relationMenu.labelHautInverse ? '←' : '→'}
                </button>
                <input
                  value={relationMenu.labelHautInput}
                  onChange={ev => setRelationMenu(prev => prev ? { ...prev, labelHautInput: ev.target.value } : prev)}
                  onKeyDown={ev => { if (ev.key === 'Enter') valider(typeActuel) }}
                  onClick={ev => ev.stopPropagation()}
                  placeholder={t('notes.relation.labelHautPlaceholder')}
                  autoFocus
                  style={{ flex: 1, minWidth: 0, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(201,168,76,0.3)',
                    borderRadius: 4, padding: '4px 6px', color: 'var(--tdr-parchment)', fontSize: 12, outline: 'none' }}
                />
              </div>
              {/* Filet séparant les deux champs — matérialise le trait du lien lui-même entre le texte du
                  haut et celui du bas, purement décoratif. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '1px 0', opacity: 0.45 }}>
                <div style={{ flex: 1, height: 1, background: 'rgba(201,168,76,0.35)' }} />
                <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(245,236,215,0.6)' }}>
                  {t('notes.relation.lienSeparateur')}
                </span>
                <div style={{ flex: 1, height: 1, background: 'rgba(201,168,76,0.35)' }} />
              </div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <button
                  onClick={ev => { ev.stopPropagation(); setRelationMenu(prev => prev ? { ...prev, labelBasInverse: !prev.labelBasInverse } : prev) }}
                  title={relationMenu.labelBasInverse ? `${titreSource} → ${titreCible}` : `${titreCible} → ${titreSource}`}
                  style={{ width: 20, height: 20, flexShrink: 0, padding: 0, borderRadius: 4,
                    border: '1px solid rgba(201,168,76,0.3)', background: 'rgba(255,255,255,0.04)',
                    color: 'rgba(245,236,215,0.75)', fontSize: 12, cursor: 'pointer' }}>
                  {relationMenu.labelBasInverse ? '→' : '←'}
                </button>
                <input
                  value={relationMenu.labelBasInput}
                  onChange={ev => setRelationMenu(prev => prev ? { ...prev, labelBasInput: ev.target.value } : prev)}
                  onKeyDown={ev => { if (ev.key === 'Enter') valider(typeActuel) }}
                  onClick={ev => ev.stopPropagation()}
                  placeholder={t('notes.relation.labelBasPlaceholder')}
                  style={{ flex: 1, minWidth: 0, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(201,168,76,0.3)',
                    borderRadius: 4, padding: '4px 6px', color: 'var(--tdr-parchment)', fontSize: 12, outline: 'none' }}
                />
              </div>
              <button
                onClick={() => valider(typeActuel)}
                style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid rgba(201,168,76,0.4)',
                  background: 'rgba(201,168,76,0.12)', color: 'var(--tdr-gold)', fontSize: 12, cursor: 'pointer' }}>
                {t('notes.relation.labelValider')}
              </button>
            </div>
            {/* Aucun symbole : distinct de "Aucune relation" plus bas (qui efface tout) — celui-ci retire
                juste le ● / ♥ / ⚔ du milieu du lien tout en gardant les textes haut/bas (voir Note.relations). */}
            <button onClick={() => valider(null)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 4,
                background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--tdr-parchment)', fontSize: 13, textAlign: 'left' }}>
              <span style={{ color: 'rgba(245,236,215,0.35)', fontSize: 14, width: 16, textAlign: 'center', flexShrink: 0 }}>—</span>
              {t('notes.relation.aucunSymbole')}
            </button>
            {RELATION_TYPES.map(type => (
              <button key={type} onClick={() => valider(type)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 4,
                  background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--tdr-parchment)', fontSize: 13, textAlign: 'left' }}>
                <span style={{ color: RELATION_SYMBOLES[type].couleur, fontSize: 14, width: 16, textAlign: 'center', flexShrink: 0 }}>
                  {RELATION_SYMBOLES[type].glyphe}
                </span>
                {t(`notes.relation.${type}`)}
              </button>
            ))}
            <button onClick={() => { onSetRelation(relationMenu.source, relationMenu.target, null); setRelationMenu(null) }}
              style={{ padding: '5px 8px', marginTop: 2, background: 'transparent', border: 'none',
                borderTop: '1px solid rgba(201,168,76,0.15)', cursor: 'pointer',
                color: 'rgba(245,236,215,0.45)', fontSize: 12, textAlign: 'left' }}>
              {t('notes.relation.aucune')}
            </button>
          </div>
        </>
        )
      })()}
    </div>
  )
}
