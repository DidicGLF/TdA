import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { Character, CompagnonOverride } from '../types/character'
import type { FieldPositions } from '../context/GameDataContext'
import { useGameData } from '../context/GameDataContext'
import { useCompagnonName } from '../hooks/useContentTranslation'
import { resolveCompagnon } from '../utils/compagnons'
import { useChampsFiche } from '../hooks/useChampsFiche'
import DraggableTextarea from './DraggableTextarea'
import DraggableImageField from './DraggableImageField'
import SheetTooltip from './SheetTooltip'
import type { TooltipData } from './SheetTooltip'

interface Props {
  character: Character
  onChange: (patch: Partial<Character>) => void
  // Nom du compagnon débloqué que cette fiche décrit.
  nomCompagnon: string
  // Rang atteint dans la voie qui l'a octroyé (détermine ses caractéristiques évolutives).
  rang: number
  calibrate?: boolean
  locked?: boolean
  fieldPositions?: FieldPositions
  onFieldMoved?: (label: string, top: number, left: number, width?: number, height?: number) => void
  // Une seule fiche alimente la réserve : les champs sont communs à toutes les fiches (un seul
  // calibrage), il ne faut donc pas dupliquer leurs pastilles autant de fois qu'il y a de compagnons.
  reservePortalTarget?: HTMLElement | null
  onReserveToggle?: (label: string, reserved: boolean, pos: { top: number; left: number; width?: number; height?: number }) => void
}

const STATS = ['for', 'dex', 'con', 'int', 'sag', 'cha'] as const

// Une fiche de compagnon (A5 à l'italienne). Son propre conteneur sert de repère aux positions en
// pourcentage : un unique calibrage vaut donc pour toutes les fiches, quel que soit le compagnon
// affiché et sa place dans la page.
export default function FicheCompagnon({
  character, onChange, nomCompagnon, rang,
  calibrate = false, locked = true, fieldPositions, onFieldMoved, reservePortalTarget, onReserveToggle,
}: Props) {
  const { t } = useTranslation()
  const compagnonName = useCompagnonName()
  const { compagnons: catalogue } = useGameData()
  const containerRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<TooltipData | null>(null)

  const { f } = useChampsFiche({
    page: 'compagnons', defaultPage: 'compagnons', calibrate, fieldPositions,
    containerRef, setTooltip, onFieldMoved, reservePortalTarget, onReserveToggle,
  })

  const entry = catalogue.find(c => c.nom === nomCompagnon)
  const att = { contact: character.attaqueContact, distance: character.attaqueDistance, magique: character.attaqueMagique }
  const c = entry ? resolveCompagnon(entry, character.niveau, rang, att) : null

  // Saisies du joueur, indexées par nom (cf. Character.compagnonsFiches) — l'ancien format par
  // position (compagnonsOverrides) est migré une fois pour toutes au chargement (voir App.tsx).
  const ov: CompagnonOverride = character.compagnonsFiches?.[nomCompagnon] ?? {}

  const setOv = (champ: keyof CompagnonOverride, valeur: string) => {
    onChange({ compagnonsFiches: { ...(character.compagnonsFiches ?? {}), [nomCompagnon]: { ...ov, [champ]: valeur } } })
  }

  const fmtMod = (n: number) => n >= 0 ? `+${n}` : `${n}`

  // Champ de texte libre (Spécial, Notes) : calibrable et réservable comme les autres.
  const zoneTexte = (id: string, champ: 'special' | 'notes', top: number, left: number, width: number, height: number) => {
    const fp = fieldPositions?.[id]
    const p = { top: fp?.top ?? top, left: fp?.left ?? left, width: fp?.width ?? width, height: fp?.height ?? height }
    return (
      <DraggableTextarea
        key={id} label={id} {...p}
        value={ov[champ] ?? ''} onChange={v => setOv(champ, v)}
        calibrate={calibrate} containerRef={containerRef} onMoved={onFieldMoved ?? (() => {})}
        reserved={fp ? fp.reserved === true : true}
        reservePortalTarget={reservePortalTarget}
        onReserveToggle={r => onReserveToggle?.(id, r, p)}
      />
    )
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <img src={`${import.meta.env.BASE_URL}feuille-compagnons.webp`} alt={t('fiche.compagnons')}
        className="sheet-bg" style={{ width: '100%', display: 'block' }} draggable={false} />

      {/* Identité */}
      {f({ label: 'Comp nom', top: 12, left: 30, width: 34, height: 4, value: c ? compagnonName(c.nom) : '', onChange: () => {}, readOnly: true, reserveByDefault: true })}

      {/* Caractéristiques */}
      {STATS.map((s, i) => f({
        label: `Comp ${s.toUpperCase()}`,
        top: 22 + Math.floor(i / 3) * 0, left: 55 + i * 4, width: 4, height: 4,
        value: ov[s] ?? (c ? fmtMod(c[s]) : ''), onChange: v => setOv(s, v),
        align: 'center', readOnly: locked, reserveByDefault: true,
      }))}
      {f({ label: 'Comp INIT', top: 22, left: 84, width: 4, height: 4, value: ov.init ?? c?.initValue ?? '', onChange: v => setOv('init', v), align: 'center', readOnly: locked, reserveByDefault: true })}
      {f({ label: 'Comp DEF',  top: 28, left: 84, width: 4, height: 4, value: ov.def ?? (c ? String(c.def) : ''), onChange: v => setOv('def', v), align: 'center', readOnly: locked, reserveByDefault: true })}
      {f({ label: 'Comp PV',   top: 34, left: 84, width: 4, height: 4, value: ov.pv ?? c?.pvValue ?? '', onChange: v => setOv('pv', v), align: 'center', readOnly: locked, reserveByDefault: true })}

      {/* Arme */}
      {f({ label: 'Comp arme',    top: 44, left: 60, width: 18, height: 4, value: ov.atk1nom ?? c?.attaque1?.nom ?? '', onChange: v => setOv('atk1nom', v), readOnly: locked, reserveByDefault: true })}
      {f({ label: 'Comp attaque', top: 44, left: 80, width: 8,  height: 4, value: ov.atk1bonus ?? c?.atk1Display ?? '', onChange: v => setOv('atk1bonus', v), align: 'center', readOnly: locked, reserveByDefault: true })}
      {f({ label: 'Comp DM',      top: 44, left: 90, width: 8,  height: 4, value: ov.atk1dm ?? c?.atk1dmDisplay ?? c?.attaque1?.dm ?? '', onChange: v => setOv('atk1dm', v), align: 'center', readOnly: locked, reserveByDefault: true })}

      {/* Zones de texte libre */}
      {zoneTexte('Comp spécial', 'special', 60, 72, 44, 18)}
      {zoneTexte('Comp notes',   'notes',   85, 72, 44, 12)}

      {/* Image du compagnon — DraggableImageField ne gère pas la réserve, on s'en charge ici. */}
      {(() => {
        const fp = fieldPositions?.['Comp image']
        const p = { top: fp?.top ?? 45, left: fp?.left ?? 24, width: fp?.width ?? 40, height: fp?.height ?? 55 }
        if (fp ? fp.reserved === true : true) {
          return calibrate && reservePortalTarget
            ? createPortal(
                <div onClick={() => onReserveToggle?.('Comp image', false, p)} title="Placer sur la feuille" style={{
                  display: 'inline-flex', alignItems: 'center',
                  background: 'rgba(160,90,230,0.18)', border: '1px solid rgba(160,90,230,0.6)',
                  color: 'rgba(225,205,255,0.95)', fontSize: 12, fontFamily: 'monospace', fontWeight: 700,
                  padding: '4px 9px', borderRadius: 4, userSelect: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                }}>Comp image</div>,
                reservePortalTarget)
            : null
        }
        return (
          <DraggableImageField
            {...p}
            value={ov.image ?? ''}
            onChange={v => setOv('image', v)}
            calibrate={calibrate} label="Comp image"
            containerRef={containerRef} onMoved={onFieldMoved ?? (() => {})}
          />
        )
      })()}

      {tooltip && <SheetTooltip tooltip={tooltip} character={character} descriptions={{}} />}
    </div>
  )
}
