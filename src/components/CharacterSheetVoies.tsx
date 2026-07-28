import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { Character } from '../types/character'
import type { FieldPositions, SheetPage } from '../context/GameDataContext'
import { useGameData } from '../context/GameDataContext'
import { useTranslatedDescriptions } from '../hooks/useContentTranslation'
import ChampsRecto from './ChampsRecto'
import ChampsVerso from './ChampsVerso'
import VoieRangCheckboxes from './VoieRangCheckboxes'
import { TOUTES_VOIES_ENTRIES, TOUS_VOIES_TITRES } from '../data/voieRangEntries'

interface Props {
  character: Character
  onChange: (patch: Partial<Character>) => void
  activeStep: number
  calibrate?: boolean
  locked?: boolean
  onFieldMoved?: (label: string, top: number, left: number, width?: number, height?: number) => void
  fieldPositions?: FieldPositions
  sheetImage?: string
  reservePortalTarget?: HTMLElement | null
  onReserveToggle?: (label: string, reserved: boolean, pos: { top: number; left: number; width?: number; height?: number; perRow?: number; page?: SheetPage }) => void
  onCheckboxRowMoved?: (label: string, top: number, left: number, perRow: number, stepX: number, stepY: number) => void
}

// Troisième fiche, dédiée aux voies. Même structure que le recto et le verso : un support (image de
// fond) qui monte les mêmes blocs de champs, chacun ne dessinant que ce qui lui est assigné.
export default function CharacterSheetVoies({
  character, onChange, activeStep, calibrate = false, locked = true,
  onFieldMoved, fieldPositions, sheetImage, reservePortalTarget, onReserveToggle, onCheckboxRowMoved,
}: Props) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const { data: rawData } = useGameData()
  const data = useTranslatedDescriptions(rawData)

  const commun = {
    character, onChange, containerRef, page: 'voies' as const,
    calibrate, locked, fieldPositions, onFieldMoved, reservePortalTarget, onReserveToggle,
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <img src={sheetImage || `${import.meta.env.BASE_URL}feuille-voies.webp`} alt={t('fiche.voies')}
        className="sheet-bg" style={{ width: '100%', display: 'block' }} draggable={false} />

      <ChampsRecto {...commun} defaultPage="recto" activeStep={activeStep} onCheckboxRowMoved={onCheckboxRowMoved} />
      <ChampsVerso {...commun} defaultPage="verso" activeStep={activeStep} />
      <VoieRangCheckboxes {...commun} defaultPage="voies" activeStep={activeStep} descriptions={data}
        entries={TOUTES_VOIES_ENTRIES} titres={TOUS_VOIES_TITRES} />
    </div>
  )
}
