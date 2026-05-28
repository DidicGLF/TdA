import { createContext, useContext, useState, useEffect, useCallback, type Dispatch, type SetStateAction } from 'react'
import DESCRIPTIONS_RAW from '../data/descriptions.json'
import TRAITS_RAW from '../data/traits-magiques.json'
import PEUPLES_RAW from '../data/peuples.json'
import ARMES_RAW from '../data/armes.json'
import ARMURES_RAW from '../data/armures.json'
import VOIES_RAW from '../data/voies.json'
import { loadDataFile, saveDataFile, openDataDir as openDir } from '../utils/tauriStorage'
import type { DescMap, TraitEntry, PeupleEntry } from '../types/gameData'

export type ArmesData = typeof ARMES_RAW
export type ArmuresData = typeof ARMURES_RAW
export type VoieEntry = { nom: string; famille: string; categorie: string }

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
      saveDataFile(filename, JSON.stringify({ _type: type, data: next }, null, 2)).catch(console.error)
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
  const [loaded, setLoaded] = useState(false)

  // Chargement initial depuis Documents/TdR/ (Tauri) ou valeurs du bundle (dev)
  useEffect(() => {
    const load = async () => {
      try {
        const [descStr, traitsStr, peuplesStr, armesStr, armuresStr, voiesStr] = await Promise.all([
          loadDataFile('descriptions.json'),
          loadDataFile('traits-magiques.json'),
          loadDataFile('peuples.json'),
          loadDataFile('armes.json'),
          loadDataFile('armures.json'),
          loadDataFile('voies.json'),
        ])
        if (descStr) setDataRaw(unwrap(JSON.parse(descStr)) as DescMap)
        if (traitsStr) setTraitsRaw(unwrap(JSON.parse(traitsStr)) as TraitEntry[])
        if (peuplesStr) setPeuplesRaw(unwrap(JSON.parse(peuplesStr)) as PeupleEntry[])
        if (armesStr) setArmesRaw(unwrap(JSON.parse(armesStr)) as ArmesData)
        if (armuresStr) setArmuresRaw(unwrap(JSON.parse(armuresStr)) as ArmuresData)
        if (voiesStr) setVoiesRaw(unwrap(JSON.parse(voiesStr)) as VoieEntry[])
      } catch { /* données du bundle utilisées par défaut */ }
      setLoaded(true)
    }
    load()
  }, [])

  // Setters avec auto-save : chaque modification écrit dans Documents/TdR/
  const setData = useCallback(
    makeAutoSaver<DescMap>(setDataRaw, 'descriptions.json', 'descriptions'),
    []
  )
  const setTraits = useCallback(
    makeAutoSaver<TraitEntry[]>(setTraitsRaw, 'traits-magiques.json', 'traits-magiques'),
    []
  )
  const setPeuples = useCallback(
    makeAutoSaver<PeupleEntry[]>(setPeuplesRaw, 'peuples.json', 'peuples'),
    []
  )
  const setArmes = useCallback(
    makeAutoSaver<ArmesData>(setArmesRaw, 'armes.json', 'armes'),
    []
  )
  const setArmures = useCallback(
    makeAutoSaver<ArmuresData>(setArmuresRaw, 'armures.json', 'armures'),
    []
  )
  const setVoies = useCallback(
    makeAutoSaver<VoieEntry[]>(setVoiesRaw, 'voies.json', 'voies'),
    []
  )

  const openDataDir = useCallback(() => { openDir().catch(console.error) }, [])

  return (
    <GameDataContext.Provider value={{
      data, setData,
      traits, setTraits,
      peuples, setPeuples,
      armes, setArmes,
      armures, setArmures,
      voies, setVoies,
      openDataDir,
      loaded,
    }}>
      {children}
    </GameDataContext.Provider>
  )
}
