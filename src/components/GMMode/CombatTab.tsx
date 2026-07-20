import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useGameData } from '../../context/GameDataContext'
import CombatCard from './CombatCard'
import PJCard from './PJCard'
import { importPJ, resoudreAttaque, listerEntites } from '../../utils/combat'
import type { CombatSession, RollResult } from '../../utils/combat'
import type { Character } from '../../types/character'

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
}

export default function CombatTab({ session, onSessionChange, onEndSession, onSauvegarder }: Props) {
  const { t } = useTranslation()
  const { data: descriptions } = useGameData()
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
      })
    }

    // Les créatures ont un moteur de jet (dernierResultat) ; les PJ n'ont pour l'instant qu'un simple
    // ciblage visuel (pas d'attaques structurées côté PJ — le MJ gère leurs jets manuellement).
    for (const c of session.combatants) if (c.cibleId) pushLink(c.id, c.cibleId, c.dernierResultat, 'creature')
    for (const p of session.pjs) if (p.cibleId) pushLink(p.id, p.cibleId, null, 'pj')

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
      const deltaRatio = (e.clientX - drag.startX) / drag.areaWidth
      const next = Math.min(0.8, Math.max(0.2, drag.startRatio + deltaRatio))
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

  const updatePJ = (id: string, patch: Partial<CombatSession['pjs'][number]>) => {
    onSessionChange({ ...session, pjs: session.pjs.map(p => p.id === id ? { ...p, ...patch } : p) })
  }

  const removePJ = (id: string) => {
    onSessionChange({ ...session, pjs: session.pjs.filter(p => p.id !== id) })
  }

  const tourSuivant = () => {
    onSessionChange({ ...session, combatants: session.combatants.map(c => ({ ...c, aJoueCeTour: false, dernierResultat: null })) })
  }

  const handleFiles = async (files: FileList) => {
    const nouveaux: CombatSession['pjs'] = []
    for (const file of Array.from(files)) {
      try {
        const text = await file.text()
        const parsed = JSON.parse(text)
        const entries = Array.isArray(parsed) ? parsed : [parsed]
        for (const entry of entries) {
          const character: Character | undefined = entry?.character ?? (entry?.caracteristiques ? entry : undefined)
          if (character) nouveaux.push(importPJ(character, descriptions))
        }
      } catch { /* fichier invalide, ignoré */ }
    }
    if (nouveaux.length > 0) onSessionChange({ ...session, pjs: [...session.pjs, ...nouveaux] })
  }

  const cibles = listerEntites(session, descriptions)

  // Un seul appel à onSessionChange pour tout l'attaque (résultat sur l'attaquant + dégâts sur la
  // cible) : deux appels séparés à updateCombatant/updatePJ ici se baseraient tous deux sur le même
  // `session` (fermeture de ce rendu), donc le second écraserait le premier au lieu de le compléter.
  const handleAttaque = (combatant: CombatSession['combatants'][number], attaque: NonNullable<typeof combatant.creature.attaques>[number]) => {
    const cibleInfo = combatant.cibleId ? cibles.find(c => c.id === combatant.cibleId) ?? null : null
    const result = resoudreAttaque(attaque.nom, attaque.bonus, attaque.dm, cibleInfo)
    const cibleId = combatant.cibleId
    const degats = result.degatsAppliques

    let nextCombatants = session.combatants.map(c => c.id === combatant.id ? { ...c, dernierResultat: result, aJoueCeTour: true } : c)
    let nextPjs = session.pjs

    if (cibleId && degats !== undefined) {
      nextCombatants = nextCombatants.map(c => c.id === cibleId ? { ...c, pvActuels: Math.max(0, c.pvActuels - degats) } : c)
      nextPjs = nextPjs.map(p => p.id === cibleId ? { ...p, pvActuels: Math.max(0, p.pvActuels - degats) } : p)
    }

    onSessionChange({ ...session, combatants: nextCombatants, pjs: nextPjs })
  }

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%', paddingRight: 38 }}>
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
          {/* Créatures */}
          <div ref={creaturesColRef} style={{ flex: `${splitRatio} 1 0%`, minWidth: 0, overflowY: 'auto', display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 14, alignContent: 'flex-start' }}>
            {session.combatants.map(c => (
              <CombatCard
                key={c.id}
                combatant={c}
                cibles={cibles.filter(x => x.id !== c.id)}
                onToggleExpand={() => updateCombatant(c.id, { expanded: !c.expanded })}
                onSetPV={pv => updateCombatant(c.id, { pvActuels: pv })}
                onAttaque={attaque => handleAttaque(c, attaque)}
                onSetCible={id => updateCombatant(c.id, { cibleId: id })}
                onSetBuff={(stat, valeur) => {
                  const buffs = [...c.buffs.filter(b => b.stat !== stat), { stat, valeur }]
                  updateCombatant(c.id, { buffs })
                }}
                onClearBuff={stat => updateCombatant(c.id, { buffs: c.buffs.filter(b => b.stat !== stat) })}
              />
            ))}
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

          {/* Personnages joueurs */}
          <div ref={pjsColRef} style={{ flex: `${1 - splitRatio} 1 0%`, minWidth: 0, overflowY: 'auto', display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 14, alignContent: 'flex-start' }}>
            {session.pjs.length === 0 ? (
              <div style={{ width: '100%', textAlign: 'center', opacity: 0.35, fontSize: 13, padding: '20px 0' }}>
                {t('gmMode.bataille.aucunPJ')}
              </div>
            ) : session.pjs.map(p => (
              <PJCard
                key={p.id}
                pj={p}
                cibles={cibles.filter(x => x.id !== p.id)}
                onToggleExpand={() => updatePJ(p.id, { expanded: !p.expanded })}
                onSetPV={pv => updatePJ(p.id, { pvActuels: pv })}
                onSetPM={pm => updatePJ(p.id, { pmActuels: pm })}
                onSetCible={id => updatePJ(p.id, { cibleId: id })}
                onSetBuff={(stat, valeur) => {
                  const buffs = [...p.buffs.filter(b => b.stat !== stat), { stat, valeur }]
                  updatePJ(p.id, { buffs })
                }}
                onClearBuff={stat => updatePJ(p.id, { buffs: p.buffs.filter(b => b.stat !== stat) })}
              />
            ))}
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
                    const ligneDm = !l.toucheRate && l.degatsTotal !== undefined
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
                            <tspan fill={LINK_COLOR} fontWeight={700}>DM {l.degatsTotal}</tspan>
                            <tspan fill={DIM}> {'—'} </tspan>
                            <tspan fill={GOLD} fontWeight={700}>{t('gmMode.bataille.rdLabel')} {l.rdAppliquee ?? 0}</tspan>
                            <tspan fill={DIM}>  =  </tspan>
                            <tspan fill="rgba(120,220,140,0.95)" fontWeight={700}>{l.degatsAppliques} DM</tspan>
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

      {/* Tiroir latéral — import/liste des PJ, symétrique du tiroir Paramètres côté gauche */}
      <div
        onMouseLeave={() => setPjPanelOpen(false)}
        style={{
          position: 'absolute', top: 0, right: 0, height: '100%', zIndex: 20,
          display: 'flex', alignItems: 'stretch',
          transform: pjPanelOpen ? 'translateX(0)' : 'translateX(380px)',
          transition: 'transform 0.2s ease',
        }}
      >
        {/* Poignée — reste collée au bord droit de l'écran, visible même tiroir fermé. Elle doit précéder
            le panneau dans l'ordre flex : le groupe est ancré par son bord droit (right:0), donc le premier
            enfant se retrouve du côté intérieur (visible en permanence) et le second (panneau) du côté
            extérieur (flush contre le bord de l'écran à l'état ouvert, hors-écran une fois fermé). */}
        <button
          onMouseEnter={() => setPjPanelOpen(true)}
          onClick={() => setPjPanelOpen(o => !o)}
          style={{
            width: 30, height: 140, flexShrink: 0, alignSelf: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '10px 0', background: 'rgba(15,12,8,0.95)',
            border: `1px solid ${SECTION_BORDER}`, borderRight: 'none', borderRadius: '6px 0 0 6px',
            color: GOLD, cursor: 'pointer', boxShadow: '-4px 0 16px rgba(0,0,0,0.4)',
          }}
        >
          <span style={{ display: 'inline-block', whiteSpace: 'nowrap', fontSize: 12, letterSpacing: '0.05em', transform: 'rotate(-90deg)' }}>
            🧑 {t('gmMode.bataille.personnages')}
          </span>
        </button>

        <div style={{
          width: 380, flexShrink: 0, display: 'flex', flexDirection: 'column',
          background: 'rgba(15,12,8,0.97)', border: `1px solid ${SECTION_BORDER}`, borderRight: 'none',
          boxShadow: '-6px 0 24px rgba(0,0,0,0.5)', overflow: 'hidden',
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
      </div>
    </div>
  )
}
