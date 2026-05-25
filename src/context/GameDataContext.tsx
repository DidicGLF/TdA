import { createContext, useContext, useState, useEffect, useCallback, type Dispatch, type SetStateAction } from 'react'
import DESCRIPTIONS_RAW from '../data/descriptions.json'
import TRAITS_RAW from '../data/traits-magiques.json'
import PEUPLES_RAW from '../data/peuples.json'
import { loadDataFile, saveDataFile, openDataDir as openDir } from '../utils/tauriStorage'
import type { DescMap, TraitEntry, PeupleEntry } from '../types/gameData'

interface GameDataContextValue {
  data: DescMap
  setData: Dispatch<SetStateAction<DescMap>>
  traits: TraitEntry[]
  setTraits: Dispatch<SetStateAction<TraitEntry[]>>
  peuples: PeupleEntry[]
  setPeuples: Dispatch<SetStateAction<PeupleEntry[]>>
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
  const [loaded, setLoaded] = useState(false)

  // Chargement initial depuis Documents/TdR/ (Tauri) ou valeurs du bundle (dev)
  useEffect(() => {
    const load = async () => {
      try {
        const [descStr, traitsStr, peuplesStr] = await Promise.all([
          loadDataFile('descriptions.json'),
          loadDataFile('traits-magiques.json'),
          loadDataFile('peuples.json'),
        ])
        if (descStr) setDataRaw(JSON.parse(descStr))
        if (traitsStr) setTraitsRaw(JSON.parse(traitsStr))
        if (peuplesStr) setPeuplesRaw(JSON.parse(peuplesStr))
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

  const openDataDir = useCallback(() => { openDir().catch(console.error) }, [])

  return (
    <GameDataContext.Provider value={{
      data, setData,
      traits, setTraits,
      peuples, setPeuples,
      openDataDir,
      loaded,
    }}>
      {children}
    </GameDataContext.Provider>
  )
}
