import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Character } from '../types/character'
import type { FieldPositions } from '../context/GameDataContext'
import { useGameData } from '../context/GameDataContext'
import { useTranslatedDescriptions } from '../hooks/useContentTranslation'
import { getCompagnonsDisponibles, getRangCompagnon } from '../utils/compagnons'
import FicheCompagnon from './FicheCompagnon'

const PAR_PAGE = 2

interface Props {
  character: Character
  onChange: (patch: Partial<Character>) => void
  calibrate?: boolean
  locked?: boolean
  fieldPositions?: FieldPositions
  onFieldMoved?: (label: string, top: number, left: number, width?: number, height?: number) => void
  reservePortalTarget?: HTMLElement | null
  onReserveToggle?: (label: string, reserved: boolean, pos: { top: number; left: number; width?: number; height?: number }) => void
  // Impression : sortir toutes les fiches d'un coup au lieu de la seule page courante.
  toutesLesPages?: boolean
}

// Onglet compagnons : une fiche A5 par compagnon débloqué, deux par page (2 × A5 à l'italienne =
// 1 A4 portrait). Au-delà de deux compagnons, on pagine comme les notes.
export default function CharacterSheetCompagnons({
  character, onChange, calibrate = false, locked = true,
  fieldPositions, onFieldMoved, reservePortalTarget, onReserveToggle, toutesLesPages = false,
}: Props) {
  const { t } = useTranslation()
  const { data: rawData } = useGameData()
  const descriptions = useTranslatedDescriptions(rawData)
  const [page, setPage] = useState(0)

  // Les fiches n'existent que pour les compagnons réellement débloqués par les voies du personnage.
  const compagnons = useMemo(
    () => getCompagnonsDisponibles(character, descriptions),
    [character, descriptions],
  )

  const nbPages = Math.max(1, Math.ceil(compagnons.length / PAR_PAGE))
  const pageActive = Math.min(page, nbPages - 1)
  const affiches = toutesLesPages
    ? compagnons
    : compagnons.slice(pageActive * PAR_PAGE, pageActive * PAR_PAGE + PAR_PAGE)

  if (compagnons.length === 0) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: 'rgba(245,236,215,0.45)', fontStyle: 'italic' }}>
        {t('fiche.aucunCompagnon')}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {affiches.map((nom, i) => (
        <div key={`${nom}-${i}`} className="print-page-compagnon">
          <FicheCompagnon
            character={character} onChange={onChange}
            nomCompagnon={nom}
            rang={getRangCompagnon(character, descriptions, nom)}
            calibrate={calibrate} locked={locked}
            fieldPositions={fieldPositions} onFieldMoved={onFieldMoved}
            // Les champs sont communs à toutes les fiches (un seul calibrage) : seule la première
            // alimente la réserve, sinon chaque pastille apparaîtrait autant de fois qu'il y a de fiches.
            reservePortalTarget={i === 0 ? reservePortalTarget : null}
            onReserveToggle={onReserveToggle}
          />
        </div>
      ))}

      {!toutesLesPages && nbPages > 1 && (
        <div className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '4px 0 10px' }}>
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={pageActive === 0}
            style={boutonPage(pageActive === 0)}>‹</button>
          <span style={{ fontSize: 13, color: 'rgba(245,236,215,0.6)', fontFamily: "'Cinzel', serif" }}>
            {t('fiche.pageSur', { page: pageActive + 1, total: nbPages })}
          </span>
          <button onClick={() => setPage(p => Math.min(nbPages - 1, p + 1))} disabled={pageActive === nbPages - 1}
            style={boutonPage(pageActive === nbPages - 1)}>›</button>
        </div>
      )}
    </div>
  )
}

const boutonPage = (inactif: boolean): React.CSSProperties => ({
  padding: '2px 12px', borderRadius: 4, fontSize: 16,
  border: '1px solid rgba(201,168,76,0.4)',
  background: 'transparent',
  color: inactif ? 'rgba(245,236,215,0.25)' : 'var(--tdr-gold)',
  cursor: inactif ? 'default' : 'pointer',
})
