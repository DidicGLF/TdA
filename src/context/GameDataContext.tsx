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
import BESTIAIRE_RAW from '../data/bestiaire.json'
import RENCONTRES_RAW from '../data/rencontres.json'
import COMBATS_RAW from '../data/combats-sauvegardes.json'
import CAPACITES_BIBLIOTHEQUE_RAW from '../data/capacites-bibliotheque.json'
import NOTES_RAW from '../data/notes.json'
import CAMPAGNES_RAW from '../data/campagnes.json'
import NOTE_IMAGES_RAW from '../data/note-images.json'
import GM_NOTES_RAW from '../data/gm-notes.json'
import GM_CAMPAGNES_RAW from '../data/gm-campagnes.json'
import GM_NOTE_IMAGES_RAW from '../data/gm-note-images.json'
import BATAILLES_RAW from '../data/batailles-sauvegardees.json'
import BATAILLE_TEMPLATES_RAW from '../data/batailles-modeles.json'
import { loadDataFile, openDataDir as openDir } from '../utils/tauriStorage'
import { queueSave } from '../utils/saveManager'
import type { DescMap, TraitEntry, PeupleEntry, CompanionEntry, BestiaireEntry, RencontreSauvegardee, CapaciteBibliotheque, Note, Campaign, NoteImage } from '../types/gameData'
import type { CombatSessionSauvegardee } from '../utils/combat'
import type { BatailleSessionSauvegardee, BatailleTemplate } from '../utils/bataille'
import { normaliserEvenement } from '../utils/bataille'

export type ArmesData = typeof ARMES_RAW
export type ArmuresData = typeof ARMURES_RAW
export type VoieEntry = { nom: string; famille: string; categorie: string }
// reserved : le champ est actuellement stocké dans la réserve de calibrage plutôt qu'affiché sur la
// feuille — top/left/width/height sont conservés tels quels pour reprendre leur valeur telle quelle
// une fois replacé sur la feuille (pas de perte de position en cas d'aller-retour par la réserve).
// perRow : uniquement pour les champs "rangée de cases à cocher" (DraggableCheckboxRow) — nombre de
// cases par ligne avant de passer à la suivante ; width/height y sont alors réinterprétés comme
// l'espacement horizontal/vertical entre cases (stepX/stepY), pas une taille de champ classique.
// page : la fiche sur laquelle le champ est affiché, quand il a été déplacé depuis sa fiche d'origine.
// Absent = le champ est resté sur sa fiche d'origine (celle déclarée dans le code du bloc).
// Les fiches sur lesquelles un champ peut être posé. Ajouter une valeur ici suffit à rendre la
// nouvelle fiche éligible pour tous les champs existants (ils s'y déplacent via la réserve).
export type SheetPage = 'recto' | 'verso' | 'voies'
export type FieldPosition = { top: number; left: number; width?: number; height?: number; reserved?: boolean; perRow?: number; page?: SheetPage }
export type FieldPositions = Record<string, FieldPosition>
export type SheetImages = Partial<Record<SheetPage, string>>

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
  bestiaire: BestiaireEntry[]
  setBestiaire: Dispatch<SetStateAction<BestiaireEntry[]>>
  rencontres: RencontreSauvegardee[]
  setRencontres: Dispatch<SetStateAction<RencontreSauvegardee[]>>
  combatsSauvegardes: CombatSessionSauvegardee[]
  setCombatsSauvegardes: Dispatch<SetStateAction<CombatSessionSauvegardee[]>>
  capacitesBibliotheque: CapaciteBibliotheque[]
  setCapacitesBibliotheque: Dispatch<SetStateAction<CapaciteBibliotheque[]>>
  notes: Note[]
  setNotes: Dispatch<SetStateAction<Note[]>>
  campagnes: Campaign[]
  setCampagnes: Dispatch<SetStateAction<Campaign[]>>
  noteImages: NoteImage[]
  setNoteImages: Dispatch<SetStateAction<NoteImage[]>>
  // Notes du mode Maître de jeu — bibliothèque distincte des notes joueur ci-dessus (même outil,
  // données séparées : un MJ ne doit pas voir/mélanger ses notes de préparation avec celles du joueur).
  gmNotes: Note[]
  setGmNotes: Dispatch<SetStateAction<Note[]>>
  gmCampagnes: Campaign[]
  setGmCampagnes: Dispatch<SetStateAction<Campaign[]>>
  gmNoteImages: NoteImage[]
  setGmNoteImages: Dispatch<SetStateAction<NoteImage[]>>
  // Batailles de masse sauvegardées (voir utils/bataille.ts) — même principe que combatsSauvegardes.
  batailles: BatailleSessionSauvegardee[]
  setBatailles: Dispatch<SetStateAction<BatailleSessionSauvegardee[]>>
  // Gabarits de bataille (config réutilisable, pas encore lancée) — même principe que rencontres ci-dessus.
  batailleTemplates: BatailleTemplate[]
  setBatailleTemplates: Dispatch<SetStateAction<BatailleTemplate[]>>
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

// Passe chaque événement d'une liste de sessions/gabarits de bataille par normaliserEvenement (voir
// bataille.ts) — nécessaire au chargement de tout fichier venant du disque, pour rester compatible
// avec les sauvegardes d'avant le système d'effets configurables.
function normaliserEvenementsBatailles<T extends { evenements: BatailleTemplate['evenements'] }>(arr: T[]): T[] {
  return arr.map(item => ({ ...item, evenements: item.evenements.map(normaliserEvenement) }))
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
  const [bestiaire, setBestiaireRaw] = useState<BestiaireEntry[]>(() =>
    unwrap(JSON.parse(JSON.stringify(BESTIAIRE_RAW))) as BestiaireEntry[]
  )
  const [rencontres, setRencontresRaw] = useState<RencontreSauvegardee[]>(() =>
    unwrap(JSON.parse(JSON.stringify(RENCONTRES_RAW))) as RencontreSauvegardee[]
  )
  const [combatsSauvegardes, setCombatsSauvegardesRaw] = useState<CombatSessionSauvegardee[]>(() =>
    unwrap(JSON.parse(JSON.stringify(COMBATS_RAW))) as CombatSessionSauvegardee[]
  )
  const [capacitesBibliotheque, setCapacitesBibliothequeRaw] = useState<CapaciteBibliotheque[]>(() =>
    unwrap(JSON.parse(JSON.stringify(CAPACITES_BIBLIOTHEQUE_RAW))) as CapaciteBibliotheque[]
  )
  const [notes, setNotesRaw] = useState<Note[]>(() =>
    unwrap(JSON.parse(JSON.stringify(NOTES_RAW))) as Note[]
  )
  const [campagnes, setCampagnesRaw] = useState<Campaign[]>(() =>
    unwrap(JSON.parse(JSON.stringify(CAMPAGNES_RAW))) as Campaign[]
  )
  const [noteImages, setNoteImagesRaw] = useState<NoteImage[]>(() =>
    unwrap(JSON.parse(JSON.stringify(NOTE_IMAGES_RAW))) as NoteImage[]
  )
  const [gmNotes, setGmNotesRaw] = useState<Note[]>(() =>
    unwrap(JSON.parse(JSON.stringify(GM_NOTES_RAW))) as Note[]
  )
  const [gmCampagnes, setGmCampagnesRaw] = useState<Campaign[]>(() =>
    unwrap(JSON.parse(JSON.stringify(GM_CAMPAGNES_RAW))) as Campaign[]
  )
  const [gmNoteImages, setGmNoteImagesRaw] = useState<NoteImage[]>(() =>
    unwrap(JSON.parse(JSON.stringify(GM_NOTE_IMAGES_RAW))) as NoteImage[]
  )
  const [batailles, setBataillesRaw] = useState<BatailleSessionSauvegardee[]>(() =>
    normaliserEvenementsBatailles(unwrap(JSON.parse(JSON.stringify(BATAILLES_RAW))) as BatailleSessionSauvegardee[])
  )
  const [batailleTemplates, setBatailleTemplatesRaw] = useState<BatailleTemplate[]>(() =>
    normaliserEvenementsBatailles(unwrap(JSON.parse(JSON.stringify(BATAILLE_TEMPLATES_RAW))) as BatailleTemplate[])
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
        const bestiaireStr = await loadDataFile('bestiaire.json')
        if (bestiaireStr) setBestiaireRaw(unwrap(JSON.parse(bestiaireStr)) as BestiaireEntry[])
        const rencontresStr = await loadDataFile('rencontres-sauvegardees.json')
        if (rencontresStr) setRencontresRaw(unwrap(JSON.parse(rencontresStr)) as RencontreSauvegardee[])
        const combatsStr = await loadDataFile('combats-sauvegardes.json')
        if (combatsStr) setCombatsSauvegardesRaw(unwrap(JSON.parse(combatsStr)) as CombatSessionSauvegardee[])
        const capacitesBiblioStr = await loadDataFile('capacites-bibliotheque.json')
        if (capacitesBiblioStr) setCapacitesBibliothequeRaw(unwrap(JSON.parse(capacitesBiblioStr)) as CapaciteBibliotheque[])
        const notesStr = await loadDataFile('notes.json')
        if (notesStr) setNotesRaw(unwrap(JSON.parse(notesStr)) as Note[])
        const campagnesStr = await loadDataFile('campagnes.json')
        if (campagnesStr) setCampagnesRaw(unwrap(JSON.parse(campagnesStr)) as Campaign[])
        const noteImagesStr = await loadDataFile('note-images.json')
        if (noteImagesStr) setNoteImagesRaw(unwrap(JSON.parse(noteImagesStr)) as NoteImage[])
        const gmNotesStr = await loadDataFile('gm-notes.json')
        if (gmNotesStr) setGmNotesRaw(unwrap(JSON.parse(gmNotesStr)) as Note[])
        const gmCampagnesStr = await loadDataFile('gm-campagnes.json')
        if (gmCampagnesStr) setGmCampagnesRaw(unwrap(JSON.parse(gmCampagnesStr)) as Campaign[])
        const gmNoteImagesStr = await loadDataFile('gm-note-images.json')
        if (gmNoteImagesStr) setGmNoteImagesRaw(unwrap(JSON.parse(gmNoteImagesStr)) as NoteImage[])
        const bataillesStr = await loadDataFile('batailles-sauvegardees.json')
        if (bataillesStr) setBataillesRaw(normaliserEvenementsBatailles(unwrap(JSON.parse(bataillesStr)) as BatailleSessionSauvegardee[]))
        const batailleTemplatesStr = await loadDataFile('batailles-modeles.json')
        if (batailleTemplatesStr) setBatailleTemplatesRaw(normaliserEvenementsBatailles(unwrap(JSON.parse(batailleTemplatesStr)) as BatailleTemplate[]))
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
  const setBestiaire = useMemo(() => makeAutoSaver<BestiaireEntry[]>(setBestiaireRaw, 'bestiaire.json', 'bestiaire'), [])
  const setRencontres = useMemo(() => makeAutoSaver<RencontreSauvegardee[]>(setRencontresRaw, 'rencontres-sauvegardees.json', 'rencontres'), [])
  const setCombatsSauvegardes = useMemo(() => makeAutoSaver<CombatSessionSauvegardee[]>(setCombatsSauvegardesRaw, 'combats-sauvegardes.json', 'combats'), [])
  const setCapacitesBibliotheque = useMemo(() => makeAutoSaver<CapaciteBibliotheque[]>(setCapacitesBibliothequeRaw, 'capacites-bibliotheque.json', 'capacites-bibliotheque'), [])
  const setNotes = useMemo(() => makeAutoSaver<Note[]>(setNotesRaw, 'notes.json', 'notes'), [])
  const setCampagnes = useMemo(() => makeAutoSaver<Campaign[]>(setCampagnesRaw, 'campagnes.json', 'campagnes'), [])
  const setNoteImages = useMemo(() => makeAutoSaver<NoteImage[]>(setNoteImagesRaw, 'note-images.json', 'note-images'), [])
  const setGmNotes = useMemo(() => makeAutoSaver<Note[]>(setGmNotesRaw, 'gm-notes.json', 'gm-notes'), [])
  const setGmCampagnes = useMemo(() => makeAutoSaver<Campaign[]>(setGmCampagnesRaw, 'gm-campagnes.json', 'gm-campagnes'), [])
  const setGmNoteImages = useMemo(() => makeAutoSaver<NoteImage[]>(setGmNoteImagesRaw, 'gm-note-images.json', 'gm-note-images'), [])
  const setBatailles = useMemo(() => makeAutoSaver<BatailleSessionSauvegardee[]>(setBataillesRaw, 'batailles-sauvegardees.json', 'batailles'), [])
  const setBatailleTemplates = useMemo(() => makeAutoSaver<BatailleTemplate[]>(setBatailleTemplatesRaw, 'batailles-modeles.json', 'batailles-modeles'), [])

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
      bestiaire, setBestiaire,
      rencontres, setRencontres,
      combatsSauvegardes, setCombatsSauvegardes,
      capacitesBibliotheque, setCapacitesBibliotheque,
      notes, setNotes,
      campagnes, setCampagnes,
      noteImages, setNoteImages,
      gmNotes, setGmNotes,
      gmCampagnes, setGmCampagnes,
      gmNoteImages, setGmNoteImages,
      batailles, setBatailles,
      batailleTemplates, setBatailleTemplates,
      showHidden, setShowHidden,
      openDataDir,
      loaded,
    }}>
      {children}
    </GameDataContext.Provider>
  )
}
