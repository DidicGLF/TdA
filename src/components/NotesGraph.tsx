import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useGameData } from '../context/GameDataContext'

const GOLD = '#c9a84c'

// Espace de coordonnées virtuel du graphe — le SVG le redimensionne automatiquement au conteneur
// réel via viewBox, pas besoin de mesurer les pixels du panneau (ResizeObserver, etc.).
const CANVAS = 560

type GraphEdge = { source: string; target: string }
type Point = { x: number; y: number }

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
function calculerLayout(nodeIds: string[], edges: GraphEdge[], taille: number, graine = 0): Map<string, Point> {
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
// liens — s'arrête dès qu'une disposition sans aucun croisement est trouvée.
function meilleureDisposition(nodeIds: string[], edges: GraphEdge[], taille: number, tentative: number): Map<string, Point> {
  const ESSAIS = 8
  let meilleure = calculerLayout(nodeIds, edges, taille, tentative * 1000)
  let meilleurScore = compterCroisements(edges, meilleure)
  for (let essai = 1; essai < ESSAIS && meilleurScore > 0; essai++) {
    const candidate = calculerLayout(nodeIds, edges, taille, tentative * 1000 + essai)
    const score = compterCroisements(edges, candidate)
    if (score < meilleurScore) { meilleure = candidate; meilleurScore = score }
  }
  return meilleure
}

interface Props {
  selectedId: string | null
  onOpenNote: (id: string) => void
}

export default function NotesGraph({ selectedId, onOpenNote }: Props) {
  const { t } = useTranslation()
  const { notes } = useGameData()
  const svgRef = useRef<SVGSVGElement>(null)
  // Positions déplacées à la souris — prioritaires sur celles calculées par la disposition à ressorts,
  // et conservées même si le graphe se recalcule ensuite (ajout d'une autre note, d'un autre lien...).
  const [manualPositions, setManualPositions] = useState<Map<string, Point>>(new Map())
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const dragRef = useRef<{ id: string; startX: number; startY: number; moved: boolean } | null>(null)
  // Pan du plateau entier : glisser sur le fond (pas sur un nœud, qui intercepte l'événement avant
  // qu'il n'atteigne le <svg>) translate tout le contenu.
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const panRef = useRef<{ startClientX: number; startClientY: number; startPanX: number; startPanY: number } | null>(null)
  // Incrémenté par le bouton « Recalculer » : force meilleureDisposition à explorer de nouvelles graines.
  const [tentative, setTentative] = useState(0)

  const { nodeIds, edges, titreParId, degreParId, structureKey } = useMemo(() => {
    const parTitre = new Map(notes.filter(n => n.titre.trim()).map(n => [n.titre.trim().toLowerCase(), n]))
    const edges: GraphEdge[] = []
    for (const n of notes) {
      for (const cible of extraireLiens(n.contenu)) {
        const match = parTitre.get(cible.toLowerCase())
        if (match && match.id !== n.id) edges.push({ source: n.id, target: match.id })
      }
    }
    const nodeIds = notes.map(n => n.id)
    const titreParId = new Map(notes.map(n => [n.id, n.titre]))
    // Nombre de liens touchant chaque note (dans un sens ou l'autre) — sert à faire grossir son point.
    const degreParId = new Map<string, number>(nodeIds.map(id => [id, 0]))
    for (const e of edges) {
      degreParId.set(e.source, (degreParId.get(e.source) ?? 0) + 1)
      degreParId.set(e.target, (degreParId.get(e.target) ?? 0) + 1)
    }
    const structureKey = nodeIds.slice().sort().join(',') + '|' + edges.map(e => `${e.source}>${e.target}`).sort().join(',')
    return { nodeIds, edges, titreParId, degreParId, structureKey }
  }, [notes])

  // Ne recalcule la disposition que si la structure du graphe (quelles notes, quels liens) change
  // réellement — sinon éditer une note ailleurs ferait « sauter » tous les nœuds à chaque sauvegarde.
  // structureKey résume déjà nodeIds/edges ; les y ajouter forcerait un recalcul à chaque render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const positions = useMemo(() => meilleureDisposition(nodeIds, edges, CANVAS, tentative), [structureKey, tentative])

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
      setManualPositions(prev => {
        const next = new Map(prev)
        next.set(drag.id, point)
        return next
      })
    }
    const handleUp = () => {
      const drag = dragRef.current
      dragRef.current = null
      setDraggingId(null)
      if (drag && !drag.moved) onOpenNote(drag.id)
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
  }, [draggingId, onOpenNote, pan])

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

  // Position effective d'un nœud : la position déplacée à la main prime sur celle calculée.
  const posDe = (id: string): Point | undefined => manualPositions.get(id) ?? positions.get(id)

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', position: 'relative', padding: 12, boxSizing: 'border-box' }}>
      <button
        type="button"
        title={t('notes.grapheRecalculerAide')}
        onClick={() => {
          setTentative(t => t + 1)
          setManualPositions(new Map())
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
        style={{ width: '100%', height: '100%', touchAction: 'none', cursor: isPanning ? 'grabbing' : 'grab' }}
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
          return (
            <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke={estAttenue ? 'rgba(201,168,76,0.08)' : 'rgba(201,168,76,0.35)'} strokeWidth={1.5} />
          )
        })}
        {nodeIds.map(id => {
          const p = posDe(id)
          if (!p) return null
          const titre = (titreParId.get(id) || '').trim() || t('notes.sansTitre')
          const estFocus = selectedId === id
          const estAttenue = selectedId !== null && !connectes.has(id)
          const court = titre.length > 16 ? `${titre.slice(0, 15)}…` : titre
          // Rayon croissant avec le nombre de liens (racine carrée pour que les gros ne dévorent pas
          // les petits), plafonné pour ne jamais écraser le graphe.
          const rayon = Math.min(3 + Math.sqrt(degreParId.get(id) ?? 0) * 4, 20) + (estFocus ? 3 : 0)
          return (
            <g
              key={id}
              onPointerDown={e => {
                e.stopPropagation()
                dragRef.current = { id, startX: e.clientX, startY: e.clientY, moved: false }
                setDraggingId(id)
              }}
              style={{ cursor: draggingId === id ? 'grabbing' : 'grab' }}
            >
              <circle
                cx={p.x} cy={p.y} r={rayon}
                fill={estFocus ? GOLD : estAttenue ? 'rgba(201,168,76,0.22)' : 'rgba(201,168,76,0.7)'}
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
    </div>
  )
}
