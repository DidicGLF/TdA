import { createContext, useContext, useState, useEffect, useCallback, useMemo, type Dispatch, type SetStateAction } from 'react'
import DESCRIPTIONS_RAW from '../data/descriptions.json'
import TRAITS_RAW from '../data/traits-magiques.json'
import PEUPLES_RAW from '../data/peuples.json'
import ARMES_RAW from '../data/armes.json'
import ARMURES_RAW from '../data/armures.json'
import VOIES_RAW from '../data/voies.json'
import COMPAGNONS_RAW from '../data/compagnons.json'
import TRAITS_RACIAUX_RAW from '../data/traits-raciaux.json'
import FIELD_POSITIONS_RAW from '../data/field-positions.json'
import SHEET_IMAGES_RAW from '../data/sheet-images.json'
import HIDDEN_VOIES_RAW from '../data/hidden-voies.json'
import HIDDEN_PEUPLES_RAW from '../data/hidden-peuples.json'
import HIDDEN_CULTURES_RAW from '../data/hidden-cultures.json'
import HIDDEN_COMPAGNONS_RAW from '../data/hidden-compagnons.json'
import { loadDataFile, openDataDir as openDir } from '../utils/tauriStorage'
import { queueSave } from '../utils/saveManager'
import type { DescMap, TraitEntry, PeupleEntry, CompanionEntry } from '../types/gameData'

export type ArmesData = typeof ARMES_RAW
export type ArmuresData = typeof ARMURES_RAW
export type VoieEntry = { nom: string; famille: string; categorie: string }
export type FieldPosition = { top: number; left: number; width?: number; height?: number }
export type FieldPositions = Record<string, FieldPosition>
export type SheetImages = { recto: string; verso: string }

interface GameDataContextValue {
  data: DescMap
  setData: Dispatch<SetStateAction<DescMap>>
  traits: TraitEntry[]
  setTraits: Dispatch<SetStateAction<TraitEntry[]>>
  peuples: PeupleEntry[]
  setPeuples: Dispatch<SetStateAction<PeupleEntry[]>>
  armes: ArmesData
  setArmes: Dispatch<SetStateAction<ArmesData>>
  armures: ArmuresData
  setArmures: Dispatch<SetStateAction<ArmuresData>>
  voies: VoieEntry[]
  setVoies: Dispatch<SetStateAction<VoieEntry[]>>
  compagnons: CompanionEntry[]
  setCompagnons: Dispatch<SetStateAction<CompanionEntry[]>>
  traitsRaciaux: TraitEntry[]
  setTraitsRaciaux: Dispatch<SetStateAction<TraitEntry[]>>
  fieldPositions: FieldPositions
  setFieldPositions: Dispatch<SetStateAction<FieldPositions>>
  sheetImages: SheetImages
  setSheetImages: Dispatch<SetStateAction<SheetImages>>
  hiddenVoies: string[]
  setHiddenVoies: Dispatch<SetStateAction<string[]>>
  hiddenPeuples: string[]
  setHiddenPeuples: Dispatch<SetStateAction<string[]>>
  hiddenCultures: string[]
  setHiddenCultures: Dispatch<SetStateAction<string[]>>
  hiddenCompagnons: string[]
  setHiddenCompagnons: Dispatch<SetStateAction<string[]>>
  showHidden: boolean
  setShowHidden: Dispatch<SetStateAction<boolean>>
  openDataDir: () => void
  loaded: boolean
}

const GameDataContext = createContext<GameDataContextValue | null>(null)

export function useGameData() {
  const ctx = useContext(GameDataContext)
  if (!ctx) throw new Error('useGameData doit être utilisé dans GameDataProvider')
  return ctx
}

function unwrap(parsed: unknown): unknown {
  if (parsed && typeof parsed === 'object' && '_type' in parsed && 'data' in (parsed as Record<string, unknown>)) {
    return (parsed as Record<string, unknown>).data
  }
  return parsed
}

function makeAutoSaver<T>(setter: Dispatch<SetStateAction<T>>, filename: string, type: string): Dispatch<SetStateAction<T>> {
  return (updater) => {
    setter(prev => {
      const next = typeof updater === 'function'
        ? (updater as (p: T) => T)(prev)
        : updater
      queueSave(filename, JSON.stringify({ _type: type, data: next }, null, 2))
      return next
    })
  }
}

export function GameDataProvider({ children }: { children: React.ReactNode }) {
  const [data, setDataRaw] = useState<DescMap>(() =>
    unwrap(JSON.parse(JSON.stringify(DESCRIPTIONS_RAW))) as DescMap
  )
  const [traits, setTraitsRaw] = useState<TraitEntry[]>(() =>
    unwrap(JSON.parse(JSON.stringify(TRAITS_RAW))) as TraitEntry[]
  )
  const [peuples, setPeuplesRaw] = useState<PeupleEntry[]>(() =>
    unwrap(JSON.parse(JSON.stringify(PEUPLES_RAW))) as PeupleEntry[]
  )
  const [armes, setArmesRaw] = useState<ArmesData>(() =>
    unwrap(JSON.parse(JSON.stringify(ARMES_RAW))) as ArmesData
  )
  const [armures, setArmuresRaw] = useState<ArmuresData>(() =>
    unwrap(JSON.parse(JSON.stringify(ARMURES_RAW))) as ArmuresData
  )
  const [voies, setVoiesRaw] = useState<VoieEntry[]>(() =>
    unwrap(JSON.parse(JSON.stringify(VOIES_RAW))) as VoieEntry[]
  )
  const [compagnons, setCompagnonsRaw] = useState<CompanionEntry[]>(() =>
    unwrap(JSON.parse(JSON.stringify(COMPAGNONS_RAW))) as CompanionEntry[]
  )
  const [traitsRaciaux, setTraitsRaciauxRaw] = useState<TraitEntry[]>(() =>
    unwrap(JSON.parse(JSON.stringify(TRAITS_RACIAUX_RAW))) as TraitEntry[]
  )
  const [fieldPositions, setFieldPositionsRaw] = useState<FieldPositions>(() =>
    unwrap(JSON.parse(JSON.stringify(FIELD_POSITIONS_RAW))) as FieldPositions
  )
  const [sheetImages, setSheetImagesRaw] = useState<SheetImages>(() =>
    JSON.parse(JSON.stringify(SHEET_IMAGES_RAW)) as SheetImages
  )
  const [hiddenVoies, setHiddenVoiesRaw] = useState<string[]>(() =>
    unwrap(JSON.parse(JSON.stringify(HIDDEN_VOIES_RAW))) as string[]
  )
  const [hiddenPeuples, setHiddenPeuplesRaw] = useState<string[]>(() =>
    unwrap(JSON.parse(JSON.stringify(HIDDEN_PEUPLES_RAW))) as string[]
  )
  const [hiddenCultures, setHiddenCulturesRaw] = useState<string[]>(() =>
    unwrap(JSON.parse(JSON.stringify(HIDDEN_CULTURES_RAW))) as string[]
  )
  const [hiddenCompagnons, setHiddenCompagnonsRaw] = useState<string[]>(() =>
    unwrap(JSON.parse(JSON.stringify(HIDDEN_COMPAGNONS_RAW))) as string[]
  )
  const [showHidden, setShowHidden] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // Chargement initial depuis Documents/TdR/ (Tauri) ou valeurs du bundle (dev)
  useEffect(() => {
    const load = async () => {
      try {
        const [descStr, traitsStr, peuplesStr, armesStr, armuresStr, voiesStr, compagnonsStr] = await Promise.all([
          loadDataFile('descriptions.json'),
          loadDataFile('traits-magiques.json'),
          loadDataFile('peuples.json'),
          loadDataFile('armes.json'),
          loadDataFile('armures.json'),
          loadDataFile('voies.json'),
          loadDataFile('compagnons.json'),
        ])
        if (descStr) setDataRaw(unwrap(JSON.parse(descStr)) as DescMap)
        if (traitsStr) setTraitsRaw(unwrap(JSON.parse(traitsStr)) as TraitEntry[])
        if (peuplesStr) setPeuplesRaw(unwrap(JSON.parse(peuplesStr)) as PeupleEntry[])
        if (armesStr) setArmesRaw(unwrap(JSON.parse(armesStr)) as ArmesData)
        if (armuresStr) setArmuresRaw(unwrap(JSON.parse(armuresStr)) as ArmuresData)
        if (voiesStr) setVoiesRaw(unwrap(JSON.parse(voiesStr)) as VoieEntry[])
        if (compagnonsStr) setCompagnonsRaw(unwrap(JSON.parse(compagnonsStr)) as CompanionEntry[])
        const traitsRaciauxStr = await loadDataFile('traits-raciaux.json')
        if (traitsRaciauxStr) setTraitsRaciauxRaw(unwrap(JSON.parse(traitsRaciauxStr)) as TraitEntry[])
        const fieldPositionsStr = await loadDataFile('field-positions.json')
        if (fieldPositionsStr) setFieldPositionsRaw(unwrap(JSON.parse(fieldPositionsStr)) as FieldPositions)
        const sheetImagesStr = await loadDataFile('sheet-images.json')
        if (sheetImagesStr) setSheetImagesRaw(unwrap(JSON.parse(sheetImagesStr)) as SheetImages)
        const hiddenVoiesStr = await loadDataFile('hidden-voies.json')
        if (hiddenVoiesStr) setHiddenVoiesRaw(unwrap(JSON.parse(hiddenVoiesStr)) as string[])
        const hiddenPeuplesStr = await loadDataFile('hidden-peuples.json')
        if (hiddenPeuplesStr) setHiddenPeuplesRaw(unwrap(JSON.parse(hiddenPeuplesStr)) as string[])
        const hiddenCulturesStr = await loadDataFile('hidden-cultures.json')
        if (hiddenCulturesStr) setHiddenCulturesRaw(unwrap(JSON.parse(hiddenCulturesStr)) as string[])
        const hiddenCompagnonsStr = await loadDataFile('hidden-compagnons.json')
        if (hiddenCompagnonsStr) setHiddenCompagnonsRaw(unwrap(JSON.parse(hiddenCompagnonsStr)) as string[])
      } catch { /* données du bundle utilisées par défaut */ }
      setLoaded(true)
    }
    load()
  }, [])

  // Setters avec auto-save : chaque modification écrit dans Documents/TdA/.
  // useMemo crée le saver une seule fois (les setters useState et les chemins
  // sont stables), ce qui préserve la stabilité référentielle.
  const setData = useMemo(() => makeAutoSaver<DescMap>(setDataRaw, 'descriptions.json', 'descriptions'), [])
  const setTraits = useMemo(() => makeAutoSaver<TraitEntry[]>(setTraitsRaw, 'traits-magiques.json', 'traits-magiques'), [])
  const setPeuples = useMemo(() => makeAutoSaver<PeupleEntry[]>(setPeuplesRaw, 'peuples.json', 'peuples'), [])
  const setArmes = useMemo(() => makeAutoSaver<ArmesData>(setArmesRaw, 'armes.json', 'armes'), [])
  const setArmures = useMemo(() => makeAutoSaver<ArmuresData>(setArmuresRaw, 'armures.json', 'armures'), [])
  const setVoies = useMemo(() => makeAutoSaver<VoieEntry[]>(setVoiesRaw, 'voies.json', 'voies'), [])
  const setCompagnons = useMemo(() => makeAutoSaver<CompanionEntry[]>(setCompagnonsRaw, 'compagnons.json', 'compagnons'), [])
  const setTraitsRaciaux = useMemo(() => makeAutoSaver<TraitEntry[]>(setTraitsRaciauxRaw, 'traits-raciaux.json', 'traits-raciaux'), [])
  const setFieldPositions = useMemo(() => makeAutoSaver<FieldPositions>(setFieldPositionsRaw, 'field-positions.json', 'field-positions'), [])
  const setSheetImages = useMemo(() => makeAutoSaver<SheetImages>(setSheetImagesRaw, 'sheet-images.json', 'sheet-images'), [])
  const setHiddenVoies = useMemo(() => makeAutoSaver<string[]>(setHiddenVoiesRaw, 'hidden-voies.json', 'hidden-voies'), [])
  const setHiddenPeuples = useMemo(() => makeAutoSaver<string[]>(setHiddenPeuplesRaw, 'hidden-peuples.json', 'hidden-peuples'), [])
  const setHiddenCultures = useMemo(() => makeAutoSaver<string[]>(setHiddenCulturesRaw, 'hidden-cultures.json', 'hidden-cultures'), [])
  const setHiddenCompagnons = useMemo(() => makeAutoSaver<string[]>(setHiddenCompagnonsRaw, 'hidden-compagnons.json', 'hidden-compagnons'), [])

  const openDataDir = useCallback(() => { openDir().catch(console.error) }, [])

  return (
    <GameDataContext.Provider value={{
      data, setData,
      traits, setTraits,
      peuples, setPeuples,
      armes, setArmes,
      armures, setArmures,
      voies, setVoies,
      compagnons, setCompagnons,
      traitsRaciaux, setTraitsRaciaux,
      fieldPositions, setFieldPositions,
      sheetImages, setSheetImages,
      hiddenVoies, setHiddenVoies,
      hiddenPeuples, setHiddenPeuples,
      hiddenCultures, setHiddenCultures,
      hiddenCompagnons, setHiddenCompagnons,
      showHidden, setShowHidden,
      openDataDir,
      loaded,
    }}>
      {children}
    </GameDataContext.Provider>
  )
}
