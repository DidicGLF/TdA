import { useTranslation } from 'react-i18next'
import type { Character } from '../types/character'
import type { DescMap } from '../types/gameData'
import { parseDesc } from '../utils/parseDesc'
import cristauxData from '../data/cristaux.json'
import CristalSvg from './CristalSvg'

export type TooltipLine = { label: string; value: string | number; neg?: boolean; cristal?: typeof cristauxData[0] }
export type TooltipItem = { nom: string; desc: string; avanceeOwned?: boolean }

// Trois formes exclusives : description simple, tableau de contributions (formules de stats), ou
// plusieurs capacités juxtaposées (items) — chacune avec son propre statut "capacité avancée", pour
// ne pas laisser croire qu'un badge global s'applique à toutes alors qu'une seule l'a réellement
// (cas des rangs qui cumulent une capacité de base et une capacité empruntée, ex. Perfection).
export type TooltipData =
  | { nom: string; desc: string; rang?: number; avanceeOwned?: boolean; lines?: never; total?: never; items?: never; x: number; y: number }
  | { nom: string; lines: TooltipLine[]; total: string | number; rang?: never; desc?: never; avanceeOwned?: never; items?: never; x: number; y: number }
  | { nom: string; items: TooltipItem[]; rang?: number; lines?: never; desc?: never; total?: never; avanceeOwned?: never; x: number; y: number }

interface Props {
  tooltip: TooltipData
  character: Character
  descriptions: DescMap
}

const AvanceeBadge = ({ owned, spaced }: { owned: boolean; spaced: boolean }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 6,
    marginTop: spaced ? 8 : 6,
    ...(spaced ? { paddingTop: 8, borderTop: '1px solid rgba(201,168,76,0.2)' } : {}),
    color: owned ? 'var(--tdr-gold)' : 'rgba(245,236,215,0.35)',
    fontSize: '0.9em',
  }}>
    <span style={{ fontSize: '1.1em' }}>{owned ? '✓' : '○'}</span>
    <span>Capacité avancée{!owned ? ' (non acquise)' : ''}</span>
  </div>
)

// Infobulle de la fiche (fond sombre, bordure dorée), positionnée en % du conteneur de la feuille.
// Partagée entre la fiche elle-même et les blocs de champs autonomes (VoieRangCheckboxes…) pour que
// tous les blocs aient exactement le même rendu où qu'ils soient placés (recto, verso, autre fiche).
export default function SheetTooltip({ tooltip, character, descriptions }: Props) {
  const { t } = useTranslation()
  return (
    <div style={{
      position: 'absolute',
      ...(tooltip.x > 65
        ? { right: `${100 - tooltip.x}%` }
        : { left: `${tooltip.x + 1}%` }),
      ...(tooltip.y > 72
        ? { bottom: `${100 - tooltip.y + 1.5}%` }
        : { top: `${tooltip.y + 1.5}%` }),
      width: 220,
      maxWidth: 'min(220px, 80%)',
      background: 'rgba(20,15,8,0.97)',
      color: '#e8dfc0',
      border: '1px solid #c9a84c',
      borderRadius: 4,
      padding: '8px 10px',
      fontSize: 13,
      lineHeight: 1.5,
      zIndex: 100,
      pointerEvents: 'none',
      boxShadow: '0 2px 8px rgba(0,0,0,0.7)',
    }}>
      {!tooltip.items && (
        <div style={{ fontWeight: 700, color: '#c9a84c', marginBottom: 6, fontSize: '1.05em' }}>{tooltip.nom}</div>
      )}
      {tooltip.desc && (
        <>
          <div style={{ lineHeight: 1.5 }}>{parseDesc(tooltip.desc, character, descriptions, tooltip.rang)}</div>
          {tooltip.avanceeOwned !== undefined && <AvanceeBadge owned={tooltip.avanceeOwned} spaced />}
        </>
      )}
      {tooltip.items && tooltip.items.map((item, i) => (
        <div key={i} style={{ marginTop: i > 0 ? 10 : 0, paddingTop: i > 0 ? 8 : 0, borderTop: i > 0 ? '1px solid rgba(201,168,76,0.2)' : undefined }}>
          <div style={{ fontWeight: 700, color: '#c9a84c', marginBottom: 4, fontSize: '1.05em' }}>{item.nom}</div>
          <div style={{ lineHeight: 1.5 }}>{parseDesc(item.desc, character, descriptions, tooltip.rang)}</div>
          {item.avanceeOwned !== undefined && <AvanceeBadge owned={item.avanceeOwned} spaced={false} />}
        </div>
      ))}
      {tooltip.lines && (
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <tbody>
            {tooltip.lines.map((line, i) => {
              const isNeg = line.neg
              const val = String(line.value)
              const isPos = !isNeg && (val.startsWith('+') || (Number(val) > 0))
              const color = isNeg ? '#c97a4c' : isPos ? '#7fb87f' : 'rgba(232,223,192,0.75)'
              return (
                <tr key={i}>
                  <td style={{ paddingRight: 14, paddingBottom: 3, color: 'rgba(232,223,192,0.6)', fontSize: '0.95em' }}>
                    {line.cristal ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, verticalAlign: 'middle' }}>
                        {line.label}
                        <CristalSvg cristal={line.cristal} size={13} actif />
                      </span>
                    ) : line.label}
                  </td>
                  <td style={{ textAlign: 'right', paddingBottom: 3, color, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{val}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '1px solid rgba(201,168,76,0.35)' }}>
              <td style={{ paddingTop: 4, color: '#c9a84c', fontWeight: 700 }}>{t('fiche.total')}</td>
              <td style={{ paddingTop: 4, textAlign: 'right', color: '#c9a84c', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{String(tooltip.total)}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  )
}
