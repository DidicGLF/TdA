import React, { useState } from 'react'
import CroixCase from './CroixCase'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { Character, VoiePersonnage } from '../types/character'
import { getMod } from '../types/character'
import type { DescMap, Grant } from '../types/gameData'
import type { FieldPositions, SheetPage } from '../context/GameDataContext'
import type { VoieKey } from '../utils/levelUp'
import { calcPointsCapacite, coutRangPourVoie } from '../utils/levelUp'
import { computeEffectsWithCristaux, sumStat } from '../utils/computeEffects'
import {
  resolveDisplayRang, clearVoieRangChoixFromRang, getVoieRangChoixGrants,
  applyVoieRangChoix, applyVoieRangChoixAvancee,
} from '../utils/voieRangChoix'
import { useVoieName, usePeupleName } from '../hooks/useContentTranslation'
import DraggableField from './DraggableField'
import DraggableRangDesc from './DraggableRangDesc'
import { parseDesc } from '../utils/parseDesc'
import VoieRangChoixSheetModal from './VoieRangChoixSheetModal'
import SheetTooltip from './SheetTooltip'
import type { TooltipData } from './SheetTooltip'

// Un rang affiché : sa case à cocher et le nom de la capacité correspondante, chacun calibrable
// séparément. cbId/nomId sont les identifiants utilisés dans field-positions.json — ils doivent rester
// stables même si le bloc change de page, sinon les calibrages déjà faits sont perdus.
export type VoieRangEntry = {
  cbId: string
  nomId: string
  voie: VoieKey
  rang: number
  chipLabel: string
  cbTop: number
  cbLeft: number
  nomTop: number
  nomLeft: number
  nomWidth: number
  // Description du rang, affichée en lecture seule sous son nom. Optionnelle : les blocs trop étroits
  // pour l'accueillir (sang-mêlé) l'omettent, et n'ont alors que la case à cocher et le nom.
  descId?: string
  descTop?: number
  descLeft?: number
  descWidth?: number
  descHeight?: number
  // Rang verrouillé tant que le personnage n'a pas atteint ce niveau (voie de prestige : 8).
  minNiveau?: number
}

// Le champ "nom de la voie" qui coiffe un bloc de rangs. source indique d'où vient le libellé : le
// peuple/la culture du personnage (dérivé, non éditable) ou le nom de la voie elle-même (éditable).
export type VoieTitreEntry = {
  id: string
  voie: VoieKey
  source: 'peuple' | 'culture' | 'voieNom'
  top: number
  left: number
  width: number
}

interface Props {
  entries: VoieRangEntry[]
  titres?: VoieTitreEntry[]
  // page : la fiche en cours d'affichage. defaultPage : la fiche d'origine de ces champs, utilisée
  // tant que l'utilisateur ne les a pas déplacés. Un champ n'est dessiné que sur la page à laquelle il
  // est assigné — mais sa pastille de réserve, elle, apparaît quelle que soit la page, pour pouvoir le
  // récupérer depuis l'autre fiche (réserve commune).
  page: SheetPage
  defaultPage: SheetPage
  character: Character
  onChange: (patch: Partial<Character>) => void
  descriptions: DescMap
  containerRef: React.RefObject<HTMLDivElement | null>
  calibrate?: boolean
  locked?: boolean
  activeStep?: number
  fieldPositions?: FieldPositions
  onFieldMoved?: (label: string, top: number, left: number, width?: number, height?: number) => void
  reservePortalTarget?: HTMLElement | null
  onReserveToggle?: (label: string, reserved: boolean, pos: { top: number; left: number; width?: number; height?: number; page?: SheetPage }) => void
}

// Bloc autonome "rangs d'une ou plusieurs voies" : cases à cocher (avec coût en points de capacité,
// progression séquentielle, popover de choix VOIE_RANG_CHOIX), noms des capacités et leurs infobulles.
// Volontairement indépendant de la page qui l'affiche — recto, verso ou n'importe quelle future fiche
// n'ont qu'à l'instancier avec la liste de rangs voulue, sans dupliquer la moindre règle de jeu.
export default function VoieRangCheckboxes({
  entries, titres = [], page, defaultPage, character, onChange, descriptions, containerRef,
  calibrate = false, locked = true, activeStep = -1,
  fieldPositions, onFieldMoved, reservePortalTarget, onReserveToggle,
}: Props) {
  const { t } = useTranslation()
  const voieName = useVoieName()
  const peupleName = usePeupleName()
  const cb = onFieldMoved ?? (() => {})
  const cbReserve = onReserveToggle ?? (() => {})

  const [rangPos, setRangPos] = useState<Record<string, { top: number; left: number }>>(
    Object.fromEntries(entries.map(e => [e.cbId, fieldPositions?.[e.cbId] ?? { top: e.cbTop, left: e.cbLeft }]))
  )
  const [tooltip, setTooltip] = useState<TooltipData | null>(null)
  const [hoveredRangInfo, setHoveredRangInfo] = useState<{ voie: VoieKey; rang: number; x: number; y: number } | null>(null)
  // Popover de choix VOIE_RANG_CHOIX ouvert directement depuis une case à cocher (rang coché sans être
  // passé par le wizard/la montée de niveau — sinon aucun autre moyen de résoudre le choix).
  const [choixModal, setChoixModal] = useState<{ grantKey: string; grant: Extract<Grant, { type: 'VOIE_RANG_CHOIX' }>; rangNom: string; anchor: { x: number; y: number } } | null>(null)

  React.useEffect(() => {
    setRangPos(Object.fromEntries(entries.map(e => [e.cbId, fieldPositions?.[e.cbId] ?? { top: e.cbTop, left: e.cbLeft }])))
  }, [fieldPositions, entries])

  const { disponibles: ptsDisponibles } = calcPointsCapacite(character)

  // Le peuple Sang-mêlé pioche 2 voies de peuple limitées à 3 rangs chacune : les rangs 4-5 de la voie
  // de peuple lui sont interdits (cf. wizard).
  const estSangMeleLimite = (voie: VoieKey, rang: number) =>
    character.peuple === 'Sang-mêlé' && voie === 'voiePeuple' && rang >= 3

  const toggleVoieRang = (voie: VoieKey, rang: number, top: number, left: number) => {
    if (calibrate) return
    const v = character[voie] as VoiePersonnage
    if (!v.nom) return
    const estCoché = v.rangs[rang]
    const newRangs = [...v.rangs]
    if (estCoché) {
      for (let i = rang; i < newRangs.length; i++) newRangs[i] = false
    } else {
      let { disponibles } = calcPointsCapacite(character)
      for (let i = 0; i <= rang; i++) {
        if (newRangs[i]) continue
        const cout = coutRangPourVoie(voie, i)
        if (cout > disponibles) break
        newRangs[i] = true
        disponibles -= cout
      }
      if (!newRangs[rang]) return
    }

    const patch: Partial<Character> = { [voie]: { ...v, rangs: newRangs } }

    if (estCoché) {
      // Décocher un rang décoche aussi les suivants (en cascade) : tout choix VOIE_RANG_CHOIX associé à
      // ces rangs n'a plus de raison d'être conservé, sans quoi il réapparaîtrait tel quel si on recoche.
      const nextVoieRangChoix = clearVoieRangChoixFromRang(character, descriptions, v.nom, rang)
      if (nextVoieRangChoix !== character.voieRangChoix) patch.voieRangChoix = nextVoieRangChoix
    } else {
      // Rang qui vient d'être coché : si ça débloque un choix VOIE_RANG_CHOIX (le sien ou celui d'un
      // rang antérieur dont le minRang est désormais atteint, ex: 2e choix de la Forge au rang 4), on
      // ouvre directement le popover de choix — sinon aucun autre écran ne le proposerait avant la
      // prochaine ouverture (éventuelle) de la montée de niveau.
      const virtualCharacter = { ...character, [voie]: { ...v, rangs: newRangs } }
      const pending = getVoieRangChoixGrants(virtualCharacter, descriptions).find(g => g.grantKey.startsWith(`${v.nom}|`) && !g.choixFait)
      if (pending) setChoixModal({ ...pending, anchor: { x: left, y: top } })
    }

    // Un rang qui donne un bonus de CON change le mod de CON, donc les PV gagnés à chaque niveau :
    // l'historique des PV est réajusté pour rester cohérent avec le nouveau mod.
    if (estCoché && character.pvHistorique?.length) {
      const oldConBonus = sumStat(computeEffectsWithCristaux(character, descriptions)['CON'] ?? [])
      const oldConMod = getMod(character.caracteristiques.CON.valeur + oldConBonus)
      const newEffects = computeEffectsWithCristaux({ ...character, [voie]: { ...v, rangs: newRangs } } as Character, descriptions)
      const newConMod = getMod(character.caracteristiques.CON.valeur + sumStat(newEffects['CON'] ?? []))
      if (newConMod !== oldConMod) {
        patch.pvHistorique = character.pvHistorique.map(entry =>
          entry.conMod === oldConMod
            ? { ...entry, conMod: newConMod, total: entry.jet + newConMod }
            : entry
        )
      }
    }

    onChange(patch)
  }

  const startRangDrag = (id: string, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    const startX = e.clientX, startY = e.clientY
    const { top: startTop, left: startLeft } = rangPos[id]
    const onMove = (ev: MouseEvent) => {
      const rect = containerRef.current!.getBoundingClientRect()
      setRangPos(prev => ({ ...prev, [id]: {
        top:  +(startTop  + (ev.clientY - startY) / rect.height * 100).toFixed(1),
        left: +(startLeft + (ev.clientX - startX) / rect.width  * 100).toFixed(1),
      }}))
    }
    const onUp = (ev: MouseEvent) => {
      const rect = containerRef.current!.getBoundingClientRect()
      const newTop  = +(startTop  + (ev.clientY - startY) / rect.height * 100).toFixed(1)
      const newLeft = +(startLeft + (ev.clientX - startX) / rect.width  * 100).toFixed(1)
      setRangPos(prev => ({ ...prev, [id]: { top: newTop, left: newLeft } }))
      cb(id, newTop, newLeft)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  // Infobulle expliquant pourquoi un rang n'est pas cochable (ordre séquentiel, points manquants) ou
  // rappelant le solde de points — prioritaire sur l'infobulle de description quand les deux existent.
  const rangTooltip: TooltipData | null = hoveredRangInfo ? (() => {
    const { voie, rang, x, y } = hoveredRangInfo
    const voieData = character[voie] as VoiePersonnage
    const acquis = voieData.rangs[rang]
    const cout = coutRangPourVoie(voie, rang)
    const sequentialBlocked = !acquis && rang > 0 && !voieData.rangs[rang - 1]
    const pointsBlocked = !acquis && !sequentialBlocked && ptsDisponibles < cout
    if (sequentialBlocked)
      return { nom: t('recto.ordreRequis'), desc: t('recto.ordreRequisDesc', { rang }), x, y }
    if (pointsBlocked)
      return { nom: t('recto.pointsInsuffisants'), desc: t('recto.pointsInsuffisantsDesc', { count: cout - ptsDisponibles }), x, y }
    if (ptsDisponibles > 0)
      return { nom: t('recto.pointsCapacite'), desc: t('recto.pointsDisponiblesDesc', { count: ptsDisponibles }), x, y }
    if (ptsDisponibles < 0)
      return { nom: t('recto.pointsCapacite'), desc: t('recto.pointsEnTropDesc', { count: Math.abs(ptsDisponibles) }), x, y }
    return null
  })() : null

  const activeTooltip = rangTooltip ?? tooltip

  // Page à laquelle un champ est actuellement rattaché (sa page d'origine tant qu'on ne l'a pas déplacé).
  const pageDe = (id: string) => fieldPositions?.[id]?.page ?? defaultPage
  const surCettePage = (id: string) => pageDe(id) === page

  // Pastille de réserve. Volontairement affichée quelle que soit la page courante : c'est ce qui permet
  // de mettre un champ en réserve depuis une fiche puis d'aller le récupérer sur l'autre. Le clic le
  // place sur la fiche EN COURS — c'est donc aussi le geste qui change un champ de page.
  const reserveChip = (label: string, id: string, pos: { top: number; left: number; width?: number; height?: number }) => {
    const venuDAilleurs = pageDe(id) !== page
    return createPortal(
      <div key={id} onClick={() => cbReserve(id, false, { ...pos, page })}
        title={venuDAilleurs ? `Placer sur cette fiche (vient du ${pageDe(id)})` : 'Placer sur la feuille'}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          background: 'rgba(160,90,230,0.18)', border: '1px solid rgba(160,90,230,0.6)',
          color: 'rgba(225,205,255,0.95)', fontSize: 12, fontFamily: 'monospace', fontWeight: 700,
          padding: '4px 9px', borderRadius: 4, userSelect: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
        }}>
        {label}
        {venuDAilleurs && <span style={{ opacity: 0.6, fontSize: 10 }}>({pageDe(id) === 'recto' ? 'R' : 'V'})</span>}
      </div>,
      reservePortalTarget!,
    )
  }

  return (
    <>
      {/* === NOMS DES VOIES === */}
      {titres.map(({ id, voie, source, top, left, width }) => {
        const fp = fieldPositions?.[id]
        const tTop = fp?.top ?? top, tLeft = fp?.left ?? left
        const tWidth = fp?.width ?? width, tHeight = fp?.height ?? 2.0
        if (fp?.reserved === true) {
          return calibrate && reservePortalTarget ? reserveChip(id, id, { top: tTop, left: tLeft, width: tWidth, height: tHeight }) : null
        }
        if (!surCettePage(id)) return null
        const derive = source !== 'voieNom'
        const value = source === 'peuple' ? peupleName(character.peuple)
          : source === 'culture' ? peupleName(character.culture)
          : voieName((character[voie] as VoiePersonnage).nom)
        return (
          <DraggableField
            key={id}
            label={id} top={tTop} left={tLeft} width={tWidth} height={tHeight}
            value={value}
            onChange={derive || locked ? () => {} : v => onChange({ [voie]: { ...(character[voie] as VoiePersonnage), nom: v } })}
            readOnly={derive || locked}
            active={activeStep === (derive ? 1 : 3)}
            calibrate={calibrate} containerRef={containerRef} onMoved={cb}
            onReserveToggle={r => cbReserve(id, r, { top: tTop, left: tLeft, width: tWidth, height: tHeight })}
          />
        )
      })}

      {/* === NOMS DES CAPACITÉS + ZONES HOVER === */}
      {entries.map(({ nomId, voie, rang, nomTop, nomLeft, nomWidth }) => {
        const voieData = character[voie] as VoiePersonnage
        const nomVoie = voieData.nom
        // Si ce rang porte un choix VOIE_RANG_CHOIX déjà fait (ex: voie culturelle de la Forge), on
        // affiche la capacité réellement choisie (nom + desc) plutôt que le texte générique du rang —
        // mais seulement tant que le rang est coché (acquis), sinon on revient au texte générique.
        const displayRang = resolveDisplayRang(character, descriptions, nomVoie, rang, voieData.rangs[rang])
        const nomCap = displayRang?.rangAChoisir ? t('fiche.choisirCapacite') : (displayRang?.nom || '')
        const desc = displayRang?.desc ?? ''
        const hasAvancee = rang <= 1 && desc.includes('Capacité avancée')
        // avanceeAccordee (via un choix VOIE_RANG_CHOIX résolu, payant OU gratuit type Perfection) prime
        // sur la case avancée brute du rang quand le rang affiché vient d'un choix — sinon (capacité
        // possédée directement) on retombe sur la case avancée classique du rang.
        const avanceeOwned = hasAvancee ? (displayRang?.avanceeAccordee ?? (voieData.rangsAvances?.[rang] === true)) : undefined

        const fp = fieldPositions?.[nomId]
        const nTop = fp?.top ?? nomTop, nLeft = fp?.left ?? nomLeft
        const nWidth = fp?.width ?? nomWidth, nHeight = fp?.height ?? 2.0
        if (fp?.reserved === true) {
          return calibrate && reservePortalTarget ? reserveChip(nomId, nomId, { top: nTop, left: nLeft, width: nWidth, height: nHeight }) : null
        }
        if (!surCettePage(nomId)) return null

        return (
          <React.Fragment key={`${nomId}-cap`}>
            <DraggableField
              label={nomId} top={nTop} left={nLeft} width={nWidth} height={nHeight}
              value={nomCap} onChange={() => {}} readOnly={locked} active={activeStep === 3}
              calibrate={calibrate} containerRef={containerRef} onMoved={cb}
              onReserveToggle={r => cbReserve(nomId, r, { top: nTop, left: nLeft, width: nWidth, height: nHeight })}
            />
            {desc && !calibrate && (
              <div
                style={{
                  position: 'absolute',
                  top: `${nTop}%`, left: `${nLeft}%`,
                  width: `${nWidth}%`, height: '2%',
                  transform: 'translate(-50%, -50%)',
                  zIndex: 20,
                  cursor: 'help',
                }}
                onMouseEnter={e => {
                  const rect = containerRef.current!.getBoundingClientRect()
                  const x = (e.clientX - rect.left) / rect.width * 100
                  const y = (e.clientY - rect.top) / rect.height * 100
                  if (displayRang?.items && displayRang.items.length > 0) {
                    // Plusieurs capacités juxtaposées (ex: Perfection élémentaliste) : chacune avec son
                    // propre statut avancée, pour ne pas laisser croire qu'un badge global s'applique aux
                    // deux alors qu'une seule des deux a réellement l'avancée.
                    setTooltip({
                      nom: nomCap,
                      items: displayRang.items.map(it => ({
                        nom: it.nom,
                        desc: it.desc,
                        avanceeOwned: (rang <= 1 && it.desc.includes('Capacité avancée')) ? it.avanceeAccordee : undefined,
                      })),
                      rang: rang + 1, x, y,
                    })
                  } else {
                    setTooltip({ nom: nomCap, desc, rang: rang + 1, avanceeOwned, x, y })
                  }
                }}
                onMouseMove={e => {
                  const rect = containerRef.current!.getBoundingClientRect()
                  setTooltip(prev => prev ? { ...prev, x: (e.clientX - rect.left) / rect.width * 100, y: (e.clientY - rect.top) / rect.height * 100 } : null)
                }}
                onMouseLeave={() => setTooltip(null)}
              />
            )}
          </React.Fragment>
        )
      })}

      {/* === DESCRIPTIONS DES RANGS (lecture seule, texte mis en forme) === */}
      {entries.map(({ descId, voie, rang, descTop, descLeft, descWidth, descHeight }) => {
        if (!descId) return null
        const voieData = character[voie] as VoiePersonnage
        const displayRang = resolveDisplayRang(character, descriptions, voieData.nom, rang, voieData.rangs[rang])
        const texte = displayRang?.desc ?? ''
        const fp = fieldPositions?.[descId]
        const dTop = fp?.top ?? descTop!, dLeft = fp?.left ?? descLeft!
        const dWidth = fp?.width ?? descWidth!, dHeight = fp?.height ?? descHeight!
        // Un champ jamais calibré (aucune entrée) part en réserve plutôt que d'atterrir sur la feuille
        // à une position devinée : ces descriptions sont nouvelles et leurs valeurs par défaut datent
        // de l'ancienne mise en page, donc les poser d'office n'aurait aucun sens.
        if (fp ? fp.reserved === true : true) {
          return calibrate && reservePortalTarget ? reserveChip(descId, descId, { top: dTop, left: dLeft, width: dWidth, height: dHeight }) : null
        }
        if (!surCettePage(descId)) return null
        // Rien à afficher hors calibrage quand le rang n'a pas de texte : inutile de réserver la place.
        if (!texte && !calibrate) return null
        return (
          <DraggableRangDesc
            key={descId}
            label={descId} top={dTop} left={dLeft} width={dWidth} height={dHeight}
            contenu={(displayRang?.items?.length ?? 0) > 1
              // Rang cumulant plusieurs capacités (ex. élémentaliste : le sort initial + celui gagné
              // par Perfection) : les décrire l'une après l'autre en les nommant. Sans ça, `desc` ne
              // fournit que les textes concaténés, impossibles à rattacher à leur sort respectif.
              ? displayRang!.items!.map((it, i) => (
                  <div key={i} style={{ marginTop: i > 0 ? '0.4em' : 0 }}>
                    <strong>{it.nom} — </strong>
                    {parseDesc(it.desc, character, descriptions, rang + 1)}
                  </div>
                ))
              : parseDesc(texte, character, descriptions, rang + 1)}
            texteBrut={texte}
            calibrate={calibrate} containerRef={containerRef} onMoved={cb}
            reservePortalTarget={reservePortalTarget}
            onReserveToggle={r => cbReserve(descId, r, { top: dTop, left: dLeft, width: dWidth, height: dHeight })}
          />
        )
      })}

      {/* === CASES À COCHER DES RANGS === */}
      {entries.map(({ cbId, voie, rang, chipLabel, minNiveau }) => {
        const { top, left } = rangPos[cbId] ?? { top: 0, left: 0 }
        const voieData = character[voie] as VoiePersonnage
        const acquis = voieData.rangs[rang]
        const niveauInsuffisant = minNiveau !== undefined && character.niveau < minNiveau
        const disabled = !voieData.nom || niveauInsuffisant
        const sangMeleLimite = estSangMeleLimite(voie, rang)
        const cout = coutRangPourVoie(voie, rang)
        const sequentialBlocked = !acquis && rang > 0 && !voieData.rangs[rang - 1]
        const pointsBlocked = !acquis && !sequentialBlocked && ptsDisponibles < cout
        const blocked = sequentialBlocked || pointsBlocked || sangMeleLimite
        const showRangTooltip = !calibrate && !disabled && !sangMeleLimite && (blocked || ptsDisponibles !== 0)

        if (fieldPositions?.[cbId]?.reserved === true) {
          return calibrate && reservePortalTarget ? reserveChip(chipLabel, cbId, { top, left }) : null
        }
        if (!surCettePage(cbId)) return null

        return (
          <div key={cbId}>
            <div
              data-voie="true"
              onClick={() => !sangMeleLimite && !niveauInsuffisant && toggleVoieRang(voie, rang, top, left)}
              title={niveauInsuffisant ? t('fiche.deblocableNiveau', { n: minNiveau }) : undefined}
              {...(showRangTooltip && {
                onMouseEnter: (e: React.MouseEvent) => {
                  const rect = containerRef.current?.getBoundingClientRect()
                  if (!rect) return
                  setHoveredRangInfo({ voie, rang, x: (e.clientX - rect.left) / rect.width * 100, y: (e.clientY - rect.top) / rect.height * 100 })
                },
                onMouseMove: (e: React.MouseEvent) => {
                  const rect = containerRef.current?.getBoundingClientRect()
                  if (!rect) return
                  setHoveredRangInfo(prev => prev ? { ...prev, x: (e.clientX - rect.left) / rect.width * 100, y: (e.clientY - rect.top) / rect.height * 100 } : null)
                },
                onMouseLeave: () => setHoveredRangInfo(null),
              })}
              style={{
                position: 'absolute', top: `${top}%`, left: `${left}%`,
                width: '1.6%', height: '1.1%', transform: 'translate(-50%, -50%)',
                cursor: calibrate || disabled || sangMeleLimite ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: sangMeleLimite ? 0.25 : niveauInsuffisant ? 0.35 : 1,
                background: sangMeleLimite ? 'rgba(80,70,60,0.5)' : undefined,
                borderRadius: sangMeleLimite ? 2 : undefined,
              }}>
              <CroixCase coche={acquis} calibrate={calibrate} />
            </div>
            {calibrate && (
              <div onMouseDown={e => startRangDrag(cbId, e)} style={{
                position: 'absolute', top: `${top}%`, left: `${left}%`,
                // Décalée au-dessus de la case : centrée dessus, elle masquerait la croix-repère.
                transform: 'translate(-50%, calc(-100% - 3px))', cursor: 'grab',
                background: 'rgba(160,90,230,0.92)', color: '#fff',
                fontSize: 7, fontFamily: 'monospace', fontWeight: 700,
                padding: '1px 4px', borderRadius: 2, userSelect: 'none',
                zIndex: 40, whiteSpace: 'nowrap', lineHeight: '13px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
                display: 'flex', alignItems: 'center', gap: 2,
              }}>
                {chipLabel}
                {onReserveToggle && (
                  <span
                    onMouseDown={e => { e.preventDefault(); e.stopPropagation(); cbReserve(cbId, true, { top, left }) }}
                    style={{ cursor: 'pointer', fontSize: 9, paddingLeft: 3, borderLeft: '1px solid rgba(255,255,255,0.35)', lineHeight: 1 }}
                    title="Envoyer à la réserve"
                  >📥</span>
                )}
              </div>
            )}
          </div>
        )
      })}

      {activeTooltip && <SheetTooltip tooltip={activeTooltip} character={character} descriptions={descriptions} />}

      {choixModal && (
        <VoieRangChoixSheetModal
          character={character}
          descriptions={descriptions}
          grant={choixModal.grant}
          rangNom={choixModal.rangNom}
          anchor={choixModal.anchor}
          onChoose={(voieChoisie, rangChoisi, avanceeSeulement) => onChange({
            voieRangChoix: avanceeSeulement
              ? applyVoieRangChoixAvancee(character, choixModal.grantKey, voieChoisie, rangChoisi)
              : applyVoieRangChoix(character, choixModal.grantKey, voieChoisie, rangChoisi),
          })}
          onClose={() => setChoixModal(null)}
        />
      )}
    </>
  )
}
