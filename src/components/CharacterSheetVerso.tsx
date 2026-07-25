import { useRef } from 'react'
import type { Character } from '../types/character'
import type { FieldPositions, SheetPage } from '../context/GameDataContext'
import { useGameData } from '../context/GameDataContext'
import { useTranslatedDescriptions } from '../hooks/useContentTranslation'
import ChampsRecto from './ChampsRecto'
import ChampsVerso from './ChampsVerso'
import VoieRangCheckboxes from './VoieRangCheckboxes'
import CompagnonsFields from './CompagnonsFields'
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

// Comme le recto : un support (image de fond) qui monte les mêmes blocs de champs. Chaque bloc ne
// dessine que les champs assignés à cette fiche, d'où la possibilité de les déplacer librement.
export default function CharacterSheetVerso({
  character, onChange, activeStep, calibrate = false, locked = true,
  onFieldMoved, fieldPositions, sheetImage, reservePortalTarget, onReserveToggle, onCheckboxRowMoved,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { data: rawData } = useGameData()
  const data = useTranslatedDescriptions(rawData)

  const commun = {
    character, onChange, containerRef, page: 'verso' as const,
    calibrate, locked, fieldPositions, onFieldMoved, reservePortalTarget, onReserveToggle,
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <img src={sheetImage || `${import.meta.env.BASE_URL}feuille-verso.png`} alt="Feuille de personnage verso"
        className="sheet-bg" style={{ width: '100%', display: 'block' }} draggable={false} />

      <ChampsRecto {...commun} defaultPage="recto" activeStep={activeStep} onCheckboxRowMoved={onCheckboxRowMoved} />
      <ChampsVerso {...commun} defaultPage="verso" activeStep={activeStep} />
      <VoieRangCheckboxes {...commun} defaultPage="voies" activeStep={activeStep} descriptions={data}
        entries={TOUTES_VOIES_ENTRIES} titres={TOUS_VOIES_TITRES} />
      <CompagnonsFields {...commun} defaultPage="verso" descriptions={data} />
    </div>
  )
}
