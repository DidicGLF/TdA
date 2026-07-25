import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Character, CompagnonOverride } from '../types/character'
import type { DescMap } from '../types/gameData'
import { createPortal } from 'react-dom'
import type { FieldPositions, SheetPage } from '../context/GameDataContext'
import { useGameData } from '../context/GameDataContext'
import { useCompagnonName } from '../hooks/useContentTranslation'
import { resolveCompagnon } from '../utils/compagnons'
import DraggableField from './DraggableField'
import SheetTooltip from './SheetTooltip'
import type { TooltipData } from './SheetTooltip'

type Pos = { top: number; left: number; width: number }
type SlotPositions = {
  nom: Pos
  for: Pos; dex: Pos; con: Pos; int: Pos; sag: Pos; cha: Pos
  init: Pos; def: Pos; pv: Pos
  atk1nom: Pos; atk1bonus: Pos; atk1dm: Pos
}

// Positions par défaut des deux encarts de compagnon. Comme partout ailleurs, elles ne servent que
// tant qu'aucun calibrage n'existe dans field-positions.json — les identifiants ("C1 nom", "C2 DEF"…)
// eux ne doivent pas changer, même si ce bloc est déplacé vers une autre fiche.
const POS: SlotPositions[] = [
  // C1
  {
    nom:      { top: 51.5, left: 33.4, width: 28   },
    for:      { top: 54.2, left: 15.2, width: 5.9 },
    dex:      { top: 56.9, left: 15.2, width: 5.8 },
    con:      { top: 59.8, left: 15.2, width: 6.1 },
    int:      { top: 54.1, left: 30,   width: 5.7 },
    sag:      { top: 57,   left: 30,   width: 5.8 },
    cha:      { top: 59.8, left: 30,   width: 5.8 },
    init:     { top: 54.2, left: 45,   width: 6.5 },
    def:      { top: 57,   left: 45,   width: 6.5 },
    pv:       { top: 59.7, left: 45,   width: 6.7 },
    atk1nom:  { top: 62.5, left: 16.5, width: 17.1},
    atk1bonus:{ top: 62.6, left: 35.2, width: 7.1 },
    atk1dm:   { top: 62.7, left: 45,   width: 6.6 },
  },
  // C2
  {
    nom:      { top: 51.4, left: 79.8, width: 28.3 },
    for:      { top: 54.1, left: 61.7, width: 5.9  },
    dex:      { top: 56.9, left: 61.8, width: 5.8  },
    con:      { top: 59.8, left: 61.9, width: 6.1  },
    int:      { top: 54.1, left: 76.6, width: 5.7  },
    sag:      { top: 56.9, left: 76.5, width: 5.8  },
    cha:      { top: 59.7, left: 76.4, width: 5.8  },
    init:     { top: 54.2, left: 91.6, width: 6.5  },
    def:      { top: 57,   left: 91.5, width: 6.5  },
    pv:       { top: 59.8, left: 91.6, width: 6.7  },
    atk1nom:  { top: 62.6, left: 63,   width: 17.1 },
    atk1bonus:{ top: 62.6, left: 81.8, width: 7.1  },
    atk1dm:   { top: 62.7, left: 91.4, width: 6.6  },
  },
]

const VOIE_KEYS_ALL = ['voiePeuple', 'voieCulturelle', 'voie1', 'voie2', 'voie3', 'voiePrestige', 'voieSangMele'] as const

interface Props {
  character: Character
  onChange: (patch: Partial<Character>) => void
  descriptions: DescMap
  containerRef: React.RefObject<HTMLDivElement | null>
  // Voir VoieRangCheckboxes : page = fiche affichée, defaultPage = fiche d'origine de ces champs.
  page: SheetPage
  defaultPage: SheetPage
  calibrate?: boolean
  locked?: boolean
  fieldPositions?: FieldPositions
  onFieldMoved?: (label: string, top: number, left: number, width?: number, height?: number) => void
  reservePortalTarget?: HTMLElement | null
  onReserveToggle?: (label: string, reserved: boolean, pos: { top: number; left: number; width?: number; height?: number; page?: SheetPage }) => void
}

// Bloc autonome "compagnons" : les deux encarts de compagnon avec leurs caractéristiques résolues
// depuis le catalogue (et surchargeables par le joueur). Indépendant de la page qui l'affiche — il est
// aujourd'hui au verso mais destiné à migrer vers une fiche compagnons dédiée, ce qui ne demandera que
// de déplacer cet appel.
export default function CompagnonsFields({
  character, onChange, descriptions, containerRef, page, defaultPage,
  calibrate = false, locked = true,
  fieldPositions, onFieldMoved, reservePortalTarget, onReserveToggle,
}: Props) {
  const { t } = useTranslation()
  const compagnonName = useCompagnonName()
  const { compagnons: compagnonsCatalogue } = useGameData()
  const [tooltip, setTooltip] = useState<TooltipData | null>(null)
  const cb = onFieldMoved ?? (() => {})
  const cbReserve = onReserveToggle ?? (() => {})

  const pageDe = (id: string) => fieldPositions?.[id]?.page ?? defaultPage

  // Résout la position d'un champ et son sort : rien (assigné à l'autre fiche), une pastille de réserve
  // (récupérable depuis n'importe quelle fiche), ou les props à passer au DraggableField.
  const fp = (label: string, top: number, left: number, width: number, height: number) => {
    const ov = fieldPositions?.[label]
    const p = { top: ov?.top ?? top, left: ov?.left ?? left, width: ov?.width ?? width, height: ov?.height ?? height }
    if (ov?.reserved === true) {
      if (!calibrate || !reservePortalTarget) return null
      const venuDAilleurs = pageDe(label) !== page
      return { chip: createPortal(
        <div key={label} onClick={() => cbReserve(label, false, { ...p, page })}
          title={venuDAilleurs ? `Placer sur cette fiche (vient du ${pageDe(label)})` : 'Placer sur la feuille'}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: 'rgba(160,90,230,0.18)', border: '1px solid rgba(160,90,230,0.6)',
            color: 'rgba(225,205,255,0.95)', fontSize: 12, fontFamily: 'monospace', fontWeight: 700,
            padding: '4px 9px', borderRadius: 4, userSelect: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
          }}>
          {label}
          {venuDAilleurs && <span style={{ opacity: 0.6, fontSize: 10 }}>({pageDe(label) === 'recto' ? 'R' : 'V'})</span>}
        </div>,
        reservePortalTarget,
      ) }
    }
    if (pageDe(label) !== page) return null
    return {
      props: {
        ...p,
        onReserveToggle: (r: boolean) => cbReserve(label, r, p),
      // Décision d'impression : par défaut le champ figure sur le papier (cf. FieldPosition.imprimer).
      imprime: ov?.imprimer ?? true,
      onToggleImpression: () => cbReserve(label, ov?.reserved === true, { imprimer: !(ov?.imprimer ?? true) } as never),
      },
      pos: p,
    }
  }

  const fmtMod = (n: number) => n >= 0 ? `+${n}` : `${n}`

  // Le rang atteint dans la voie qui a octroyé le compagnon détermine sa puissance.
  const findRangCompagnon = (nomCompagnon: string): number => {
    for (const key of VOIE_KEYS_ALL) {
      const voie = character[key]
      if (!voie?.nom) continue
      const rangsData = descriptions[voie.nom]
      if (!rangsData) continue
      const granted = rangsData.some(r => r?.grants?.some(g =>
        (g.type === 'COMPAGNON' && g.nom === nomCompagnon) ||
        (g.type === 'COMPAGNON_CHOIX' && g.noms?.includes(nomCompagnon))
      ))
      if (granted) return voie.rangs.filter(Boolean).length
    }
    return 1
  }

  // Infobulle détaillant le calcul quand la valeur affichée est une synthèse (ex : PV « 4d6 » → 14).
  const hoverDetail = (pos: Pos, titre: string, detail: string) => (
    <div style={{ position: 'absolute', top: `${pos.top}%`, left: `${pos.left}%`, width: `${pos.width}%`, height: '2%', zIndex: 50, cursor: 'help' }}
      onMouseEnter={e => { const r = containerRef.current!.getBoundingClientRect(); setTooltip({ nom: titre, desc: detail, x: (e.clientX - r.left) / r.width * 100, y: (e.clientY - r.top) / r.height * 100 }) }}
      onMouseMove={e => { const r = containerRef.current!.getBoundingClientRect(); setTooltip(p => p ? { ...p, x: (e.clientX - r.left) / r.width * 100, y: (e.clientY - r.top) / r.height * 100 } : null) }}
      onMouseLeave={() => setTooltip(null)}
    />
  )

  return (
    <>
      {([0, 1] as const).map(slot => {
        const nomActif = character.compagnonsActifs?.[slot] ?? null
        const entry = nomActif ? compagnonsCatalogue.find(c => c.nom === nomActif) : null
        const rang = nomActif ? findRangCompagnon(nomActif) : 1
        const att = { contact: character.attaqueContact, distance: character.attaqueDistance, magique: character.attaqueMagique }
        const c = entry ? resolveCompagnon(entry, character.niveau, rang, att) : null
        const Q = POS[slot]
        const pre = `C${slot + 1} `
        const ov = character.compagnonsOverrides?.[slot] ?? {}
        const setOv = (field: keyof CompagnonOverride, val: string) => {
          const cur = character.compagnonsOverrides ?? [null, null]
          const next: [CompagnonOverride | null, CompagnonOverride | null] = [cur[0], cur[1]]
          next[slot] = { ...(cur[slot] ?? {}), [field]: val }
          onChange({ compagnonsOverrides: next })
        }
        // Champ éditable par le joueur (stocké dans compagnonsOverrides)
        const f = (pos: Pos, field: keyof CompagnonOverride, computed: string, label: string, align?: 'left'|'center'|'right') => {
          const r = fp(pre + label, pos.top, pos.left, pos.width, 2)
          if (!r) return null
          if ('chip' in r) return r.chip
          return (
            <DraggableField key={label} {...r.props}
              value={ov[field] ?? computed} onChange={v => setOv(field, v)} readOnly={locked} align={align} label={pre + label}
              calibrate={calibrate} containerRef={containerRef} onMoved={cb} />
          )
        }
        // Champ catalogue — éditable uniquement si déverrouillé
        const fRO = (pos: Pos, field: keyof CompagnonOverride, value: string, label: string, align?: 'left'|'center'|'right') => {
          const r = fp(pre + label, pos.top, pos.left, pos.width, 2)
          if (!r) return null
          if ('chip' in r) return r.chip
          return (
            <DraggableField key={label} {...r.props}
              value={locked ? value : (ov[field] ?? value)} onChange={v => !locked && setOv(field, v)} readOnly={locked} align={align} label={pre + label}
              calibrate={calibrate} containerRef={containerRef} onMoved={cb} />
          )
        }
        // Zone d'infobulle : seulement si le champ correspondant est bien posé sur cette fiche.
        const detail = (label: string, pos: Pos, titre: string, texte: string) => {
          const r = fp(pre + label, pos.top, pos.left, pos.width, 2)
          if (!r || 'chip' in r) return null
          return hoverDetail(r.pos, titre, texte)
        }
        return (
          <React.Fragment key={slot}>
            {fRO(Q.nom,      'nom', c ? compagnonName(c.nom) : '',  'nom')}
            {f(Q.for,       'for', c ? fmtMod(c.for)  : '',   t('stats.FOR'),  'center')}
            {f(Q.dex,       'dex', c ? fmtMod(c.dex)  : '',   t('stats.DEX'),  'center')}
            {f(Q.con,       'con', c ? fmtMod(c.con)  : '',   t('stats.CON'),  'center')}
            {f(Q.int,       'int', c ? fmtMod(c.int)  : '',   t('stats.INT'),  'center')}
            {f(Q.sag,       'sag', c ? fmtMod(c.sag)  : '',   t('stats.SAG'),  'center')}
            {f(Q.cha,       'cha', c ? fmtMod(c.cha)  : '',   t('stats.CHA'),  'center')}
            {f(Q.init,      'init', c?.initValue ?? '',        'Init', 'center')}
            {c && !ov.init && c.initDisplay !== c.initValue && detail('Init', Q.init, t('recto.initiative'), c.initDisplay)}
            {f(Q.def,       'def', c ? String(c.def)  : '',   'DEF',  'center')}
            {f(Q.pv,        'pv',  c?.pvValue ?? '',           'PV',   'center')}
            {c && !ov.pv && c.pvDisplay !== c.pvValue && detail('PV', Q.pv, t('recto.pv'), c.pvDisplay)}
            {fRO(Q.atk1nom,   'atk1nom',   c?.attaque1?.nom ?? '',    'Atk1 nom')}
            {fRO(Q.atk1bonus, 'atk1bonus', c?.atk1Display ?? '',      'Atk1 bonus', 'center')}
            {fRO(Q.atk1dm,    'atk1dm',    c?.atk1dmDisplay ?? c?.attaque1?.dm ?? '', 'Atk1 DM', 'center')}
          </React.Fragment>
        )
      })}
      {tooltip && <SheetTooltip tooltip={tooltip} character={character} descriptions={descriptions} />}
    </>
  )
}
