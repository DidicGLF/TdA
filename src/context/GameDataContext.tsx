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

function makeAutoSaver<T>(setter: Dispatch<SetStateAction<T>>, filename: string): Dispatch<SetStateAction<T>> {
  return (updater) => {
    setter(prev => {
      const next = typeof updater === 'function'
        ? (updater as (p: T) => T)(prev)
        : updater
      saveDataFile(filename, JSON.stringify(next, null, 2)).catch(console.error)
      return next
    })
  }
}

export function GameDataProvider({ children }: { children: React.ReactNode }) {
  const [data, setDataRaw] = useState<DescMap>(() =>
    JSON.parse(JSON.stringify(DESCRIPTIONS_RAW))
  )
  const [traits, setTraitsRaw] = useState<TraitEntry[]>(() =>
    JSON.parse(JSON.stringify(TRAITS_RAW))
  )
  const [peuples, setPeuplesRaw] = useState<PeupleEntry[]>(() =>
    JSON.parse(JSON.stringify(PEUPLES_RAW))
  )
  const [armes, setArmesRaw] = useState<ArmesData>(() =>
    JSON.parse(JSON.stringify(ARMES_RAW))
  )
  const [armures, setArmuresRaw] = useState<ArmuresData>(() =>
    JSON.parse(JSON.stringify(ARMURES_RAW))
  )
  const [voies, setVoiesRaw] = useState<VoieEntry[]>(() =>
    JSON.parse(JSON.stringify(VOIES_RAW))
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
        if (descStr) setDataRaw(JSON.parse(descStr))
        if (traitsStr) setTraitsRaw(JSON.parse(traitsStr))
        if (peuplesStr) setPeuplesRaw(JSON.parse(peuplesStr))
        if (armesStr) setArmesRaw(JSON.parse(armesStr))
        if (armuresStr) setArmuresRaw(JSON.parse(armuresStr))
        if (voiesStr) setVoiesRaw(JSON.parse(voiesStr))
      } catch { /* données du bundle utilisées par défaut */ }
      setLoaded(true)
    }
    load()
  }, [])

  // Setters avec auto-save : chaque modification écrit dans Documents/TdR/
  const setData = useCallback(
    makeAutoSaver<DescMap>(setDataRaw, 'descriptions.json'),
    []
  )
  const setTraits = useCallback(
    makeAutoSaver<TraitEntry[]>(setTraitsRaw, 'traits-magiques.json'),
    []
  )
  const setPeuples = useCallback(
    makeAutoSaver<PeupleEntry[]>(setPeuplesRaw, 'peuples.json'),
    []
  )
  const setArmes = useCallback(
    makeAutoSaver<ArmesData>(setArmesRaw, 'armes.json'),
    []
  )
  const setArmures = useCallback(
    makeAutoSaver<ArmuresData>(setArmuresRaw, 'armures.json'),
    []
  )
  const setVoies = useCallback(
    makeAutoSaver<VoieEntry[]>(setVoiesRaw, 'voies.json'),
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
