import { createContext, useContext, useState, useEffect, useCallback, useMemo, type Dispatch, type SetStateAction } from 'react'
import { importerImage } from '../utils/imageStore'
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
import { loadDataFile, loadDataFileDossier, openDataDir as openDir } from '../utils/tauriStorage'
import { queueSave } from '../utils/saveManager'
import { fusionnerBestiaire, migrerBestiairePerso, cleCreature, sluggifierNom } from '../utils/bestiairePerso'
import {
  fusionnerVoies, migrerVoiesPerso, extraireSurchargesVoies,
  fusionnerDescriptions, migrerDescriptionsPerso, extraireSurchargesDescriptions,
  fusionnerHiddenVoies, migrerHiddenVoiesPerso, deriverAjoutsRetraits,
} from '../utils/voiesPerso'
import { fusionnerCatalogue, extraireSurchargesCatalogue, fusionnerNomsMasques, migrerNomsMasquesPerso } from '../utils/cataloguePerso'
import { fusionnerArmes, migrerArmesPerso, extraireSurchargesArmes, fusionnerArmures, migrerArmuresPerso, extraireSurchargesArmures } from '../utils/armesPerso'
import type { ArmesPerso, ArmuresPerso } from '../utils/armesPerso'
import { fusionnerPeuples, migrerPeuplesPerso, extraireSurchargesPeuples } from '../utils/peuplesPerso'
import type { PeuplesPerso } from '../utils/peuplesPerso'
import type { DescMap, TraitEntry, PeupleEntry, CompanionEntry, VoieEntry, BestiaireEntry, BestiaireIllustrations, RencontreSauvegardee, CapaciteBibliotheque, Note, Campaign, NoteImage } from '../types/gameData'
export type { VoieEntry } from '../types/gameData'
import type { CombatSessionSauvegardee } from '../utils/combat'
import { normaliserCombatSession } from '../utils/combat'
import type { BatailleSessionSauvegardee, BatailleTemplate } from '../utils/bataille'
import { normaliserEvenement } from '../utils/bataille'

export type ArmesData = typeof ARMES_RAW
export type ArmuresData = typeof ARMURES_RAW
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
export type SheetPage = 'recto' | 'verso' | 'voies' | 'compagnons'
// imprimer : décision de l'utilisateur pour la version papier. Absent = on garde le défaut du champ
// (les données de session — PV/PM restants, équipement… — ne s'impriment pas, le joueur les tenant au
// crayon). Ce choix vaut pour tous les personnages, comme les positions.
export type FieldPosition = { top: number; left: number; width?: number; height?: number; reserved?: boolean; perRow?: number; page?: SheetPage; imprimer?: boolean }
export type FieldPositions = Record<string, FieldPosition>
export type SheetImages = Partial<Record<SheetPage, string>>

// Calibrage livré avec l'application. Réinitialiser doit y revenir, et non vider les positions :
// un fichier vide sur le disque de l'utilisateur écrase le calibrage embarqué et fait retomber tous
// les champs sur les valeurs par défaut du code, sans retour possible depuis l'interface.
export const FIELD_POSITIONS_LIVRE = unwrap(JSON.parse(JSON.stringify(FIELD_POSITIONS_RAW))) as FieldPositions

interface GameDataContextValue {
  // Vue fusionnée (livré + perso), comme avant la séparation — voir VOIES_LIVRE/DESCRIPTIONS_LIVRE
  // plus haut pour le détail. setData/setVoies acceptent la vue fusionnée et redirigent seuls vers le
  // perso ; voiesPerso/descriptionsPerso (bruts) ne servent qu'aux suppressions/renommages, qui ne
  // peuvent pas passer par ce mécanisme générique (voir extraireSurchargesDescriptions).
  data: DescMap
  setData: Dispatch<SetStateAction<DescMap>>
  descriptionsPerso: DescMap
  setDescriptionsPerso: Dispatch<SetStateAction<DescMap>>
  traits: TraitEntry[]
  setTraits: Dispatch<SetStateAction<TraitEntry[]>>
  traitsPerso: TraitEntry[]
  setTraitsPerso: Dispatch<SetStateAction<TraitEntry[]>>
  peuples: PeupleEntry[]
  setPeuples: Dispatch<SetStateAction<PeupleEntry[]>>
  peuplesPerso: PeuplesPerso
  setPeuplesPerso: Dispatch<SetStateAction<PeuplesPerso>>
  armes: ArmesData
  setArmes: Dispatch<SetStateAction<ArmesData>>
  armures: ArmuresData
  setArmures: Dispatch<SetStateAction<ArmuresData>>
  voies: VoieEntry[]
  setVoies: Dispatch<SetStateAction<VoieEntry[]>>
  voiesPerso: VoieEntry[]
  setVoiesPerso: Dispatch<SetStateAction<VoieEntry[]>>
  compagnons: CompanionEntry[]
  setCompagnons: Dispatch<SetStateAction<CompanionEntry[]>>
  compagnonsPerso: CompanionEntry[]
  setCompagnonsPerso: Dispatch<SetStateAction<CompanionEntry[]>>
  traitsRaciaux: TraitEntry[]
  setTraitsRaciaux: Dispatch<SetStateAction<TraitEntry[]>>
  traitsRaciauxPerso: TraitEntry[]
  setTraitsRaciauxPerso: Dispatch<SetStateAction<TraitEntry[]>>
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
  // Bestiaire tel qu'il s'affiche : livré (moins les masquées, plus les illustrations) + perso.
  // Dérivé, donc en lecture seule — pour modifier, passer par les trois sources ci-dessous.
  bestiaire: BestiaireEntry[]
  bestiairePerso: BestiaireEntry[]
  setBestiairePerso: Dispatch<SetStateAction<BestiaireEntry[]>>
  bestiaireIllustrations: BestiaireIllustrations
  setBestiaireIllustrations: Dispatch<SetStateAction<BestiaireIllustrations>>
  hiddenBestiaire: string[]
  setHiddenBestiaire: Dispatch<SetStateAction<string[]>>
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

// Migration unique : les illustrations étaient encodées en base64 dans bestiaire.json (2,6 Mo dont
// 91 % d'images pour 8 créatures, réécrits à chaque modification). On les sort dans images/ et on ne
// garde qu'une clé. Silencieuse et sans action de l'utilisateur ; en cas d'échec d'écriture on laisse
// l'image en place plutôt que de risquer de la perdre.
// Renvoie le tableau reçu **tel quel** quand il n'y a rien à migrer : l'appelant s'en sert pour ne
// réécrire le fichier que si quelque chose a effectivement bougé.
async function migrerImagesBestiaire(entrees: BestiaireEntry[]): Promise<BestiaireEntry[]> {
  const aMigrer = entrees.filter(e => e.image?.startsWith('data:'))
  if (aMigrer.length === 0) return entrees
  return Promise.all(entrees.map(async e => {
    if (!e.image?.startsWith('data:')) return e
    try {
      return { ...e, image: await importerImage('img', e.image, `${sluggifierNom(e.nom)}_nc${e.nc}`) }
    } catch {
      return e
    }
  }))
}

// Même migration pour les images de notes : 27,8 Mo relus au démarrage et réécrits à chaque ajout,
// dont 25 Mo de doublons (le même logo stocké 11 fois). L'empreinte de contenu les fusionne.
async function migrerImagesNotes(images: NoteImage[]): Promise<NoteImage[]> {
  if (!images.some(i => i.data?.startsWith('data:'))) return images
  const migrees = await Promise.all(images.map(async i => {
    if (!i.data?.startsWith('data:')) return i
    try {
      return { ...i, data: await importerImage('note', i.data) }
    } catch {
      return i
    }
  }))
  queueSave('Notes/note-images.json', JSON.stringify({ _type: 'note-images', data: migrees }, null, 2))
  return migrees
}

// ─── Bestiaire : contenu livré (lecture seule) vs ajouts de l'utilisateur ──────────────────────────
//
// Le bestiaire livré avec l'application n'est plus jamais réécrit sur le disque de l'utilisateur.
// Avant, le chargement faisait « fichier sur disque → on remplace intégralement l'état livré » : la
// première créature ajoutée figeait bestiaire.json et rendait TOUTES les mises à jour ultérieures du
// bestiaire invisibles pour cet utilisateur, définitivement et sans le moindre avertissement.
//
// Ce qu'il voit = livré (moins ce qu'il a masqué, plus ses illustrations) + ses ajouts :
//   src/data/bestiaire.json       le livré — lecture seule, mis à jour à chaque version de l'app
//   bestiaire-perso.json          ses créatures, et ses surcharges complètes d'une créature livrée
//   bestiaire-illustrations.json  ses illustrations posées sur des créatures livrées
//   hidden-bestiaire.json         les créatures livrées qu'il a masquées
//
// L'illustration a son fichier à part exprès : poser sa propre image sur une créature livrée est le
// geste le plus courant, et il ne doit surtout pas figer les statistiques de la fiche — sinon on
// recrée le problème qu'on vient de résoudre, à l'échelle de la créature.
export const BESTIAIRE_LIVRE = unwrap(JSON.parse(JSON.stringify(BESTIAIRE_RAW))) as BestiaireEntry[]

// ─── Voies : même principe, sur deux fichiers ──────────────────────────────────────────────────────
//
// voies.json (catalogue : nom/famille/catégorie) et descriptions.json (contenu des rangs, qui sert
// aussi aux voies de peuple/culture — protégées au passage, sans logique séparée) ne sont plus jamais
// réécrits. Ce que l'utilisateur voit = livré + ses ajouts :
//   src/data/voies.json           le catalogue livré
//   voies-perso.json               ses voies, et ses surcharges complètes d'une voie livrée
//   src/data/descriptions.json    le contenu des rangs livré
//   descriptions-perso.json        ses rangs, et ses surcharges d'une voie livrée
//   hidden-voies.json              masquage livré (auteur) — hidden-voies-perso.json en ajoute/retranche
//
// Détail des règles dans src/utils/voiesPerso.ts.
export const VOIES_LIVRE = unwrap(JSON.parse(JSON.stringify(VOIES_RAW))) as VoieEntry[]
export const DESCRIPTIONS_LIVRE = unwrap(JSON.parse(JSON.stringify(DESCRIPTIONS_RAW))) as DescMap
export const HIDDEN_VOIES_LIVRE = unwrap(JSON.parse(JSON.stringify(HIDDEN_VOIES_RAW))) as string[]

// ─── Traits magiques, traits raciaux, compagnons : même principe, catalogues simples ───────────────
// Trois tableaux plats indépendants, chacun identifié par un nom déjà unique — voir cataloguePerso.ts
// pour la règle générique. traits-magiques.json et traits-raciaux.json n'ont pas de mécanisme de
// masquage (contrairement aux voies/compagnons) : y supprimer une entrée livrée n'a donc pas
// d'équivalent « masquer », c'est bloqué (voir DescriptionsEditor). hidden-compagnons.json a la même
// particularité ajouts/retraits que hidden-voies.json (masquer libre, démasquer au mot de passe).
export const TRAITS_MAGIQUES_LIVRE = unwrap(JSON.parse(JSON.stringify(TRAITS_RAW))) as TraitEntry[]
export const TRAITS_RACIAUX_LIVRE = unwrap(JSON.parse(JSON.stringify(TRAITS_RACIAUX_RAW))) as TraitEntry[]
export const COMPAGNONS_LIVRE = unwrap(JSON.parse(JSON.stringify(COMPAGNONS_RAW))) as CompanionEntry[]
export const HIDDEN_COMPAGNONS_LIVRE = unwrap(JSON.parse(JSON.stringify(HIDDEN_COMPAGNONS_RAW))) as string[]

// Bibliothèque de capacités (autocomplétion pour saisir plus vite les capacités d'une créature du
// bestiaire, voir CreatureDetail) : même principe de catalogue plat identifié par nom, cataloguePerso.ts
// suffit — aucun verrou par champ ni badge PERSO ici, c'est un simple outil de saisie, pas une fiche
// que l'utilisateur consulte entrée par entrée (voir la même logique « données seulement » pour
// l'équipement, plus haut).
export const CAPACITES_BIBLIOTHEQUE_LIVRE = unwrap(JSON.parse(JSON.stringify(CAPACITES_BIBLIOTHEQUE_RAW))) as CapaciteBibliotheque[]

// ─── Équipement : même principe, à la granularité de la catégorie ──────────────────────────────────
// Voir src/utils/armesPerso.ts pour le détail et les limites (portée réduite : la structure — groupes/
// catégories renommés, réordonnés ou supprimés — n'est pas suivie, seuls le contenu des catégories et
// les notes le sont).
export const ARMES_LIVRE = unwrap(JSON.parse(JSON.stringify(ARMES_RAW))) as ArmesData
export const ARMURES_LIVRE = unwrap(JSON.parse(JSON.stringify(ARMURES_RAW))) as ArmuresData

// ─── Peuples/cultures : même principe, à la granularité de la culture ─────────────────────────────
// Voir src/utils/peuplesPerso.ts. hidden-peuples.json/hidden-cultures.json ont la même particularité
// ajouts/retraits que hidden-voies.json — gérée par les fonctions déjà génériques de cataloguePerso.ts.
export const PEUPLES_LIVRE = unwrap(JSON.parse(JSON.stringify(PEUPLES_RAW))) as PeupleEntry[]
export const HIDDEN_PEUPLES_LIVRE = unwrap(JSON.parse(JSON.stringify(HIDDEN_PEUPLES_RAW))) as string[]
export const HIDDEN_CULTURES_LIVRE = unwrap(JSON.parse(JSON.stringify(HIDDEN_CULTURES_RAW))) as string[]

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
  const [descriptionsPerso, setDescriptionsPersoRaw] = useState<DescMap>({})
  const [traitsPerso, setTraitsPersoRaw] = useState<TraitEntry[]>([])
  const [peuplesPerso, setPeuplesPersoRaw] = useState<PeuplesPerso>({ cultures: [] })
  const [armesPerso, setArmesPersoRaw] = useState<ArmesPerso>({ categories: [] })
  const [armuresPerso, setArmuresPersoRaw] = useState<ArmuresPerso>({ categories: [] })
  const [voiesPerso, setVoiesPersoRaw] = useState<VoieEntry[]>([])
  const [compagnonsPerso, setCompagnonsPersoRaw] = useState<CompanionEntry[]>([])
  const [traitsRaciauxPerso, setTraitsRaciauxPersoRaw] = useState<TraitEntry[]>([])
  const [fieldPositions, setFieldPositionsRaw] = useState<FieldPositions>(() =>
    unwrap(JSON.parse(JSON.stringify(FIELD_POSITIONS_RAW))) as FieldPositions
  )
  const [sheetImages, setSheetImagesRaw] = useState<SheetImages>(() =>
    JSON.parse(JSON.stringify(SHEET_IMAGES_RAW)) as SheetImages
  )
  const [hiddenVoiesDelta, setHiddenVoiesDeltaRaw] = useState<{ ajouts: string[]; retraits: string[] }>({ ajouts: [], retraits: [] })
  const [hiddenPeuplesDelta, setHiddenPeuplesDeltaRaw] = useState<{ ajouts: string[]; retraits: string[] }>({ ajouts: [], retraits: [] })
  const [hiddenCulturesDelta, setHiddenCulturesDeltaRaw] = useState<{ ajouts: string[]; retraits: string[] }>({ ajouts: [], retraits: [] })
  const [hiddenCompagnonsDelta, setHiddenCompagnonsDeltaRaw] = useState<{ ajouts: string[]; retraits: string[] }>({ ajouts: [], retraits: [] })
  const [bestiairePerso, setBestiairePersoRaw] = useState<BestiaireEntry[]>([])
  const [bestiaireIllustrations, setBestiaireIllustrationsRaw] = useState<BestiaireIllustrations>({})
  const [hiddenBestiaire, setHiddenBestiaireRaw] = useState<string[]>([])
  const [rencontres, setRencontresRaw] = useState<RencontreSauvegardee[]>(() =>
    unwrap(JSON.parse(JSON.stringify(RENCONTRES_RAW))) as RencontreSauvegardee[]
  )
  const [combatsSauvegardes, setCombatsSauvegardesRaw] = useState<CombatSessionSauvegardee[]>(() =>
    unwrap(JSON.parse(JSON.stringify(COMBATS_RAW))) as CombatSessionSauvegardee[]
  )
  const [capacitesBibliothequePerso, setCapacitesBibliothequePersoRaw] = useState<CapaciteBibliotheque[]>([])
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
        // Peuples/cultures : voir la séparation livré/perso plus haut, granularité de la culture
        // (peuplesPerso.ts).
        const peuplesPersoStr = await loadDataFile('peuples-perso.json')
        if (peuplesPersoStr !== null) {
          setPeuplesPersoRaw(unwrap(JSON.parse(peuplesPersoStr)) as PeuplesPerso)
        } else {
          const ancienStr = await loadDataFile('peuples.json')
          const ancien = ancienStr ? unwrap(JSON.parse(ancienStr)) as PeupleEntry[] : []
          const perso = migrerPeuplesPerso(ancien, PEUPLES_LIVRE)
          setPeuplesPersoRaw(perso)
          queueSave('peuples-perso.json', JSON.stringify({ _type: 'peuples-perso', data: perso }, null, 2))
        }
        // Équipement : voir la séparation livré/perso plus haut. Portée réduite (armesPerso.ts) : seul
        // le contenu des catégories et les notes sont préservés, pas la structure (groupes/catégories
        // renommés/réordonnés/supprimés).
        const armesPersoStr = await loadDataFile('armes-perso.json')
        if (armesPersoStr !== null) {
          setArmesPersoRaw(unwrap(JSON.parse(armesPersoStr)) as ArmesPerso)
        } else {
          const ancienStr = await loadDataFile('armes.json')
          const ancien = ancienStr ? unwrap(JSON.parse(ancienStr)) as ArmesData : ARMES_LIVRE
          const perso = migrerArmesPerso(ancien, ARMES_LIVRE)
          setArmesPersoRaw(perso)
          queueSave('armes-perso.json', JSON.stringify({ _type: 'armes-perso', data: perso }, null, 2))
        }
        const armuresPersoStr = await loadDataFile('armures-perso.json')
        if (armuresPersoStr !== null) {
          setArmuresPersoRaw(unwrap(JSON.parse(armuresPersoStr)) as ArmuresPerso)
        } else {
          const ancienStr = await loadDataFile('armures.json')
          const ancien = ancienStr ? unwrap(JSON.parse(ancienStr)) as ArmuresData : ARMURES_LIVRE
          const perso = migrerArmuresPerso(ancien, ARMURES_LIVRE)
          setArmuresPersoRaw(perso)
          queueSave('armures-perso.json', JSON.stringify({ _type: 'armures-perso', data: perso }, null, 2))
        }
        const fieldPositionsStr = await loadDataFile('field-positions.json')
        if (fieldPositionsStr) setFieldPositionsRaw(unwrap(JSON.parse(fieldPositionsStr)) as FieldPositions)
        const sheetImagesStr = await loadDataFile('sheet-images.json')
        if (sheetImagesStr) setSheetImagesRaw(unwrap(JSON.parse(sheetImagesStr)) as SheetImages)
        // Voies : voir la séparation livré/perso plus haut. Chaque fichier perso migre indépendamment
        // (son existence marque sa propre migration comme faite), sur le même principe que le bestiaire.
        const voiesPersoStr = await loadDataFile('voies-perso.json')
        if (voiesPersoStr !== null) {
          setVoiesPersoRaw(unwrap(JSON.parse(voiesPersoStr)) as VoieEntry[])
        } else {
          const ancienVoiesStr = await loadDataFile('voies.json')
          const ancienVoies = ancienVoiesStr ? unwrap(JSON.parse(ancienVoiesStr)) as VoieEntry[] : []
          const perso = migrerVoiesPerso(ancienVoies, VOIES_LIVRE)
          setVoiesPersoRaw(perso)
          queueSave('voies-perso.json', JSON.stringify({ _type: 'voies-perso', data: perso }, null, 2))
        }
        const descriptionsPersoStr = await loadDataFile('descriptions-perso.json')
        if (descriptionsPersoStr !== null) {
          setDescriptionsPersoRaw(unwrap(JSON.parse(descriptionsPersoStr)) as DescMap)
        } else {
          const ancienDescStr = await loadDataFile('descriptions.json')
          const ancienDesc = ancienDescStr ? unwrap(JSON.parse(ancienDescStr)) as DescMap : {}
          const perso = migrerDescriptionsPerso(ancienDesc, DESCRIPTIONS_LIVRE)
          setDescriptionsPersoRaw(perso)
          queueSave('descriptions-perso.json', JSON.stringify({ _type: 'descriptions-perso', data: perso }, null, 2))
        }
        const hiddenVoiesPersoStr = await loadDataFile('hidden-voies-perso.json')
        if (hiddenVoiesPersoStr !== null) {
          setHiddenVoiesDeltaRaw(unwrap(JSON.parse(hiddenVoiesPersoStr)) as { ajouts: string[]; retraits: string[] })
        } else {
          const ancienHiddenStr = await loadDataFile('hidden-voies.json')
          const ancienHidden = ancienHiddenStr ? unwrap(JSON.parse(ancienHiddenStr)) as string[] : []
          const delta = migrerHiddenVoiesPerso(ancienHidden, HIDDEN_VOIES_LIVRE)
          setHiddenVoiesDeltaRaw(delta)
          queueSave('hidden-voies-perso.json', JSON.stringify({ _type: 'hidden-voies-perso', data: delta }, null, 2))
        }
        const hiddenPeuplesPersoStr = await loadDataFile('hidden-peuples-perso.json')
        if (hiddenPeuplesPersoStr !== null) {
          setHiddenPeuplesDeltaRaw(unwrap(JSON.parse(hiddenPeuplesPersoStr)) as { ajouts: string[]; retraits: string[] })
        } else {
          const ancienStr = await loadDataFile('hidden-peuples.json')
          const ancien = ancienStr ? unwrap(JSON.parse(ancienStr)) as string[] : []
          const delta = migrerNomsMasquesPerso(ancien, HIDDEN_PEUPLES_LIVRE)
          setHiddenPeuplesDeltaRaw(delta)
          queueSave('hidden-peuples-perso.json', JSON.stringify({ _type: 'hidden-peuples-perso', data: delta }, null, 2))
        }
        const hiddenCulturesPersoStr = await loadDataFile('hidden-cultures-perso.json')
        if (hiddenCulturesPersoStr !== null) {
          setHiddenCulturesDeltaRaw(unwrap(JSON.parse(hiddenCulturesPersoStr)) as { ajouts: string[]; retraits: string[] })
        } else {
          const ancienStr = await loadDataFile('hidden-cultures.json')
          const ancien = ancienStr ? unwrap(JSON.parse(ancienStr)) as string[] : []
          const delta = migrerNomsMasquesPerso(ancien, HIDDEN_CULTURES_LIVRE)
          setHiddenCulturesDeltaRaw(delta)
          queueSave('hidden-cultures-perso.json', JSON.stringify({ _type: 'hidden-cultures-perso', data: delta }, null, 2))
        }
        // Traits magiques, traits raciaux, compagnons : même migration indépendante par fichier que les
        // voies (voir plus haut) — cataloguePerso.ts pour la règle générique.
        const traitsPersoStr = await loadDataFile('traits-magiques-perso.json')
        if (traitsPersoStr !== null) {
          setTraitsPersoRaw(unwrap(JSON.parse(traitsPersoStr)) as TraitEntry[])
        } else {
          const ancienStr = await loadDataFile('traits-magiques.json')
          const ancien = ancienStr ? unwrap(JSON.parse(ancienStr)) as TraitEntry[] : []
          const perso = extraireSurchargesCatalogue(ancien, TRAITS_MAGIQUES_LIVRE)
          setTraitsPersoRaw(perso)
          queueSave('traits-magiques-perso.json', JSON.stringify({ _type: 'traits-magiques-perso', data: perso }, null, 2))
        }
        const traitsRaciauxPersoStr = await loadDataFile('traits-raciaux-perso.json')
        if (traitsRaciauxPersoStr !== null) {
          setTraitsRaciauxPersoRaw(unwrap(JSON.parse(traitsRaciauxPersoStr)) as TraitEntry[])
        } else {
          const ancienStr = await loadDataFile('traits-raciaux.json')
          const ancien = ancienStr ? unwrap(JSON.parse(ancienStr)) as TraitEntry[] : []
          const perso = extraireSurchargesCatalogue(ancien, TRAITS_RACIAUX_LIVRE)
          setTraitsRaciauxPersoRaw(perso)
          queueSave('traits-raciaux-perso.json', JSON.stringify({ _type: 'traits-raciaux-perso', data: perso }, null, 2))
        }
        const compagnonsPersoStr = await loadDataFile('compagnons-perso.json')
        if (compagnonsPersoStr !== null) {
          setCompagnonsPersoRaw(unwrap(JSON.parse(compagnonsPersoStr)) as CompanionEntry[])
        } else {
          const ancienStr = await loadDataFile('compagnons.json')
          const ancien = ancienStr ? unwrap(JSON.parse(ancienStr)) as CompanionEntry[] : []
          const perso = extraireSurchargesCatalogue(ancien, COMPAGNONS_LIVRE)
          setCompagnonsPersoRaw(perso)
          queueSave('compagnons-perso.json', JSON.stringify({ _type: 'compagnons-perso', data: perso }, null, 2))
        }
        const hiddenCompagnonsPersoStr = await loadDataFile('hidden-compagnons-perso.json')
        if (hiddenCompagnonsPersoStr !== null) {
          setHiddenCompagnonsDeltaRaw(unwrap(JSON.parse(hiddenCompagnonsPersoStr)) as { ajouts: string[]; retraits: string[] })
        } else {
          const ancienStr = await loadDataFile('hidden-compagnons.json')
          const ancien = ancienStr ? unwrap(JSON.parse(ancienStr)) as string[] : []
          const delta = migrerNomsMasquesPerso(ancien, HIDDEN_COMPAGNONS_LIVRE)
          setHiddenCompagnonsDeltaRaw(delta)
          queueSave('hidden-compagnons-perso.json', JSON.stringify({ _type: 'hidden-compagnons-perso', data: delta }, null, 2))
        }
        // Bestiaire : voir la séparation livré/perso plus haut. L'existence de bestiaire-perso.json
        // fait office de marqueur « migration déjà faite » — l'ancien bestiaire.json de l'utilisateur
        // n'est alors plus jamais relu ni réécrit, et reste en place comme sauvegarde.
        const persoStr = await loadDataFileDossier('Maitre de jeu/bestiaire-perso.json', 'bestiaire-perso.json')
        if (persoStr !== null) {
          const brut = unwrap(JSON.parse(persoStr)) as BestiaireEntry[]
          const migrees = await migrerImagesBestiaire(brut)
          if (migrees !== brut) queueSave('Maitre de jeu/bestiaire-perso.json', JSON.stringify({ _type: 'bestiaire-perso', data: migrees }, null, 2))
          setBestiairePersoRaw(migrees)
          const illustrationsStr = await loadDataFileDossier('Maitre de jeu/bestiaire-illustrations.json', 'bestiaire-illustrations.json')
          if (illustrationsStr) setBestiaireIllustrationsRaw(unwrap(JSON.parse(illustrationsStr)) as BestiaireIllustrations)
          const hiddenBestiaireStr = await loadDataFileDossier('Maitre de jeu/hidden-bestiaire.json', 'hidden-bestiaire.json')
          const hiddenChargees = hiddenBestiaireStr ? unwrap(JSON.parse(hiddenBestiaireStr)) as string[] : []
          // Réparation d'un bug de migration passé : un nouvel utilisateur (jamais eu de bestiaire.json)
          // se retrouvait avec la TOTALITÉ du catalogue livré masquée (voir plus bas, branche `else` —
          // comparer un « ancien » vide au catalogue complet masquait tout, au lieu de ne rien masquer).
          // Le marqueur : le fichier masqué contient exactement les mêmes clés que le catalogue livré au
          // complet, rien de plus, rien de moins — un MJ ne masque jamais la totalité de son bestiaire.
          const clesLivreCompletes = new Set(BESTIAIRE_LIVRE.map(cleCreature))
          const ressembleAuBugToutMasque = hiddenChargees.length === BESTIAIRE_LIVRE.length
            && hiddenChargees.every(cle => clesLivreCompletes.has(cle))
          if (ressembleAuBugToutMasque) {
            setHiddenBestiaireRaw([])
            queueSave('Maitre de jeu/hidden-bestiaire.json', JSON.stringify({ _type: 'hidden-bestiaire', data: [] }, null, 2))
          } else if (hiddenChargees.length > 0) {
            setHiddenBestiaireRaw(hiddenChargees)
          }
        } else {
          // Les images passent d'abord dans images/ (cas d'une installation restée sur une version
          // antérieure aux deux migrations), pour que le découpage qui suit ne charrie pas de base64.
          // bestiaire.json est l'ancien fichier plat (pré-scission livré/perso) : il reste toujours à
          // la racine, jamais déplacé par le rangement en dossiers (voir memory rangement-dossiers).
          const ancienStr = await loadDataFile('bestiaire.json')
          if (ancienStr === null) {
            // Vraiment nouvel utilisateur, jamais eu de bestiaire.json : rien à migrer, et surtout pas
            // de masquage — migrerBestiairePerso([], livre) masquerait le catalogue entier en comparant
            // un « ancien » vide au catalogue complet (voir le bug corrigé au chargement, juste au-dessus).
            setBestiairePersoRaw([])
            setBestiaireIllustrationsRaw({})
            setHiddenBestiaireRaw([])
            queueSave('Maitre de jeu/bestiaire-perso.json', JSON.stringify({ _type: 'bestiaire-perso', data: [] }, null, 2))
          } else {
            const ancien = await migrerImagesBestiaire(unwrap(JSON.parse(ancienStr)) as BestiaireEntry[])
            const { perso, illustrations, masquees } = migrerBestiairePerso(ancien, BESTIAIRE_LIVRE)
            setBestiairePersoRaw(perso)
            setBestiaireIllustrationsRaw(illustrations)
            setHiddenBestiaireRaw(masquees)
            // Écrit même à vide : c'est ce fichier qui marque la migration comme faite.
            queueSave('Maitre de jeu/bestiaire-perso.json', JSON.stringify({ _type: 'bestiaire-perso', data: perso }, null, 2))
            if (Object.keys(illustrations).length > 0) queueSave('Maitre de jeu/bestiaire-illustrations.json', JSON.stringify({ _type: 'bestiaire-illustrations', data: illustrations }, null, 2))
            if (masquees.length > 0) queueSave('Maitre de jeu/hidden-bestiaire.json', JSON.stringify({ _type: 'hidden-bestiaire', data: masquees }, null, 2))
          }
        }
        const rencontresStr = await loadDataFileDossier('Maitre de jeu/rencontres-sauvegardees.json', 'rencontres-sauvegardees.json')
        if (rencontresStr) setRencontresRaw(unwrap(JSON.parse(rencontresStr)) as RencontreSauvegardee[])
        const combatsStr = await loadDataFileDossier('Maitre de jeu/combats-sauvegardes.json', 'combats-sauvegardes.json')
        if (combatsStr) setCombatsSauvegardesRaw((unwrap(JSON.parse(combatsStr)) as CombatSessionSauvegardee[]).map(normaliserCombatSession))
        const capacitesBiblioPersoStr = await loadDataFile('Maitre de jeu/capacites-bibliotheque-perso.json')
        if (capacitesBiblioPersoStr !== null) {
          setCapacitesBibliothequePersoRaw(unwrap(JSON.parse(capacitesBiblioPersoStr)) as CapaciteBibliotheque[])
        } else {
          // L'ancien fichier plat a déjà été déplacé dans Maitre de jeu/ par le rangement en dossiers
          // (voir loadDataFileDossier plus haut) : c'est là qu'on va chercher la version pré-scission.
          const ancienStr = await loadDataFileDossier('Maitre de jeu/capacites-bibliotheque.json', 'capacites-bibliotheque.json')
          const ancien = ancienStr ? unwrap(JSON.parse(ancienStr)) as CapaciteBibliotheque[] : []
          const perso = extraireSurchargesCatalogue(ancien, CAPACITES_BIBLIOTHEQUE_LIVRE)
          setCapacitesBibliothequePersoRaw(perso)
          queueSave('Maitre de jeu/capacites-bibliotheque-perso.json', JSON.stringify({ _type: 'capacites-bibliotheque-perso', data: perso }, null, 2))
        }
        const notesStr = await loadDataFileDossier('Notes/notes.json', 'notes.json')
        if (notesStr) setNotesRaw(unwrap(JSON.parse(notesStr)) as Note[])
        const campagnesStr = await loadDataFileDossier('Notes/campagnes.json', 'campagnes.json')
        if (campagnesStr) setCampagnesRaw(unwrap(JSON.parse(campagnesStr)) as Campaign[])
        const noteImagesStr = await loadDataFileDossier('Notes/note-images.json', 'note-images.json')
        if (noteImagesStr) {
          const brutes = unwrap(JSON.parse(noteImagesStr)) as NoteImage[]
          setNoteImagesRaw(await migrerImagesNotes(brutes))
        }
        const gmNotesStr = await loadDataFileDossier('Maitre de jeu/gm-notes.json', 'gm-notes.json')
        if (gmNotesStr) setGmNotesRaw(unwrap(JSON.parse(gmNotesStr)) as Note[])
        const gmCampagnesStr = await loadDataFileDossier('Maitre de jeu/gm-campagnes.json', 'gm-campagnes.json')
        if (gmCampagnesStr) setGmCampagnesRaw(unwrap(JSON.parse(gmCampagnesStr)) as Campaign[])
        const gmNoteImagesStr = await loadDataFileDossier('Maitre de jeu/gm-note-images.json', 'gm-note-images.json')
        if (gmNoteImagesStr) setGmNoteImagesRaw(unwrap(JSON.parse(gmNoteImagesStr)) as NoteImage[])
        const bataillesStr = await loadDataFileDossier('Maitre de jeu/batailles-sauvegardees.json', 'batailles-sauvegardees.json')
        if (bataillesStr) setBataillesRaw(normaliserEvenementsBatailles(unwrap(JSON.parse(bataillesStr)) as BatailleSessionSauvegardee[]))
        const batailleTemplatesStr = await loadDataFileDossier('Maitre de jeu/batailles-modeles.json', 'batailles-modeles.json')
        if (batailleTemplatesStr) setBatailleTemplatesRaw(normaliserEvenementsBatailles(unwrap(JSON.parse(batailleTemplatesStr)) as BatailleTemplate[]))
      } catch { /* données du bundle utilisées par défaut */ }
      setLoaded(true)
    }
    load()
  }, [])

  // Setters avec auto-save : chaque modification écrit dans Documents/TdA/.
  // useMemo crée le saver une seule fois (les setters useState et les chemins
  // sont stables), ce qui préserve la stabilité référentielle.
  // setData/setVoies/setHiddenVoies sont génériques : ils reçoivent la vue FUSIONNÉE (comme avant),
  // en déduisent la surcharge perso par différence avec le livré, et écrivent uniquement celle-ci —
  // aucun appelant existant (DescriptionsEditor) n'a besoin de savoir que ces trois catalogues sont
  // maintenant scindés livré/perso. Seules les suppressions/renommages d'une entrée livrée doivent
  // passer par les setters perso directement (voir extraireSurchargesDescriptions plus haut).
  const setData = useCallback<Dispatch<SetStateAction<DescMap>>>((updater) => {
    setDescriptionsPersoRaw(prevPerso => {
      const next = typeof updater === 'function'
        ? (updater as (p: DescMap) => DescMap)(fusionnerDescriptions(DESCRIPTIONS_LIVRE, prevPerso))
        : updater
      const nextPerso = extraireSurchargesDescriptions(next, DESCRIPTIONS_LIVRE)
      queueSave('descriptions-perso.json', JSON.stringify({ _type: 'descriptions-perso', data: nextPerso }, null, 2))
      return nextPerso
    })
  }, [])
  // Accès direct au perso brut, réservé aux suppressions/renommages (voir removeVoie/renameVoie dans
  // DescriptionsEditor) : le setter générique ci-dessus ne sait qu'ajouter/modifier, jamais retirer
  // une clé livrée de la vue affichée.
  const setDescriptionsPerso = useMemo(() => makeAutoSaver<DescMap>(setDescriptionsPersoRaw, 'descriptions-perso.json', 'descriptions-perso'), [])
  const setVoiesPerso = useMemo(() => makeAutoSaver<VoieEntry[]>(setVoiesPersoRaw, 'voies-perso.json', 'voies-perso'), [])
  const setTraitsPerso = useMemo(() => makeAutoSaver<TraitEntry[]>(setTraitsPersoRaw, 'traits-magiques-perso.json', 'traits-magiques-perso'), [])
  const setTraits = useCallback<Dispatch<SetStateAction<TraitEntry[]>>>((updater) => {
    setTraitsPersoRaw(prevPerso => {
      const next = typeof updater === 'function'
        ? (updater as (p: TraitEntry[]) => TraitEntry[])(fusionnerCatalogue(TRAITS_MAGIQUES_LIVRE, prevPerso))
        : updater
      const nextPerso = extraireSurchargesCatalogue(next, TRAITS_MAGIQUES_LIVRE)
      queueSave('traits-magiques-perso.json', JSON.stringify({ _type: 'traits-magiques-perso', data: nextPerso }, null, 2))
      return nextPerso
    })
  }, [])
  const setPeuplesPerso = useMemo(() => makeAutoSaver<PeuplesPerso>(setPeuplesPersoRaw, 'peuples-perso.json', 'peuples-perso'), [])
  const setPeuples = useCallback<Dispatch<SetStateAction<PeupleEntry[]>>>((updater) => {
    setPeuplesPersoRaw(prevPerso => {
      const next = typeof updater === 'function'
        ? (updater as (p: PeupleEntry[]) => PeupleEntry[])(fusionnerPeuples(PEUPLES_LIVRE, prevPerso))
        : updater
      const nextPerso = extraireSurchargesPeuples(next, PEUPLES_LIVRE)
      queueSave('peuples-perso.json', JSON.stringify({ _type: 'peuples-perso', data: nextPerso }, null, 2))
      return nextPerso
    })
  }, [])
  // EquipementModal appelle toujours ces setters avec un instantané complet (jamais une fonction) —
  // le générique gère les deux formes quand même, par cohérence avec les autres setters de ce fichier.
  const setArmes = useCallback<Dispatch<SetStateAction<ArmesData>>>((updater) => {
    setArmesPersoRaw(prevPerso => {
      const next = typeof updater === 'function'
        ? (updater as (p: ArmesData) => ArmesData)(fusionnerArmes(ARMES_LIVRE, prevPerso))
        : updater
      const nextPerso = extraireSurchargesArmes(next, ARMES_LIVRE)
      queueSave('armes-perso.json', JSON.stringify({ _type: 'armes-perso', data: nextPerso }, null, 2))
      return nextPerso
    })
  }, [])
  const setArmures = useCallback<Dispatch<SetStateAction<ArmuresData>>>((updater) => {
    setArmuresPersoRaw(prevPerso => {
      const next = typeof updater === 'function'
        ? (updater as (p: ArmuresData) => ArmuresData)(fusionnerArmures(ARMURES_LIVRE, prevPerso))
        : updater
      const nextPerso = extraireSurchargesArmures(next, ARMURES_LIVRE)
      queueSave('armures-perso.json', JSON.stringify({ _type: 'armures-perso', data: nextPerso }, null, 2))
      return nextPerso
    })
  }, [])
  const setVoies = useCallback<Dispatch<SetStateAction<VoieEntry[]>>>((updater) => {
    setVoiesPersoRaw(prevPerso => {
      const next = typeof updater === 'function'
        ? (updater as (p: VoieEntry[]) => VoieEntry[])(fusionnerVoies(VOIES_LIVRE, prevPerso))
        : updater
      const nextPerso = extraireSurchargesVoies(next, VOIES_LIVRE)
      queueSave('voies-perso.json', JSON.stringify({ _type: 'voies-perso', data: nextPerso }, null, 2))
      return nextPerso
    })
  }, [])
  const setCompagnonsPerso = useMemo(() => makeAutoSaver<CompanionEntry[]>(setCompagnonsPersoRaw, 'compagnons-perso.json', 'compagnons-perso'), [])
  const setCompagnons = useCallback<Dispatch<SetStateAction<CompanionEntry[]>>>((updater) => {
    setCompagnonsPersoRaw(prevPerso => {
      const next = typeof updater === 'function'
        ? (updater as (p: CompanionEntry[]) => CompanionEntry[])(fusionnerCatalogue(COMPAGNONS_LIVRE, prevPerso))
        : updater
      const nextPerso = extraireSurchargesCatalogue(next, COMPAGNONS_LIVRE)
      queueSave('compagnons-perso.json', JSON.stringify({ _type: 'compagnons-perso', data: nextPerso }, null, 2))
      return nextPerso
    })
  }, [])
  const setTraitsRaciauxPerso = useMemo(() => makeAutoSaver<TraitEntry[]>(setTraitsRaciauxPersoRaw, 'traits-raciaux-perso.json', 'traits-raciaux-perso'), [])
  const setTraitsRaciaux = useCallback<Dispatch<SetStateAction<TraitEntry[]>>>((updater) => {
    setTraitsRaciauxPersoRaw(prevPerso => {
      const next = typeof updater === 'function'
        ? (updater as (p: TraitEntry[]) => TraitEntry[])(fusionnerCatalogue(TRAITS_RACIAUX_LIVRE, prevPerso))
        : updater
      const nextPerso = extraireSurchargesCatalogue(next, TRAITS_RACIAUX_LIVRE)
      queueSave('traits-raciaux-perso.json', JSON.stringify({ _type: 'traits-raciaux-perso', data: nextPerso }, null, 2))
      return nextPerso
    })
  }, [])
  const setFieldPositions = useMemo(() => makeAutoSaver<FieldPositions>(setFieldPositionsRaw, 'field-positions.json', 'field-positions'), [])
  const setSheetImages = useMemo(() => makeAutoSaver<SheetImages>(setSheetImagesRaw, 'sheet-images.json', 'sheet-images'), [])
  // hiddenVoies a deux façons de diverger du livré (voir voiesPerso.ts) : des ajouts ET des retraits —
  // un setter à deux fichiers, mais qui reste un simple tableau du point de vue de l'appelant.
  const setHiddenVoies = useCallback<Dispatch<SetStateAction<string[]>>>((updater) => {
    setHiddenVoiesDeltaRaw(prevDelta => {
      const next = typeof updater === 'function'
        ? (updater as (p: string[]) => string[])(fusionnerHiddenVoies(HIDDEN_VOIES_LIVRE, prevDelta.ajouts, prevDelta.retraits))
        : updater
      const nextDelta = deriverAjoutsRetraits(next, HIDDEN_VOIES_LIVRE)
      queueSave('hidden-voies-perso.json', JSON.stringify({ _type: 'hidden-voies-perso', data: nextDelta }, null, 2))
      return nextDelta
    })
  }, [])
  // Même particularité que hiddenVoies/hiddenCompagnons (voir plus haut) : masquer est libre, démasquer
  // exige le mot de passe — d'où le modèle ajouts/retraits par rapport au livré.
  const setHiddenPeuples = useCallback<Dispatch<SetStateAction<string[]>>>((updater) => {
    setHiddenPeuplesDeltaRaw(prevDelta => {
      const next = typeof updater === 'function'
        ? (updater as (p: string[]) => string[])(fusionnerNomsMasques(HIDDEN_PEUPLES_LIVRE, prevDelta.ajouts, prevDelta.retraits))
        : updater
      const nextDelta = migrerNomsMasquesPerso(next, HIDDEN_PEUPLES_LIVRE)
      queueSave('hidden-peuples-perso.json', JSON.stringify({ _type: 'hidden-peuples-perso', data: nextDelta }, null, 2))
      return nextDelta
    })
  }, [])
  const setHiddenCultures = useCallback<Dispatch<SetStateAction<string[]>>>((updater) => {
    setHiddenCulturesDeltaRaw(prevDelta => {
      const next = typeof updater === 'function'
        ? (updater as (p: string[]) => string[])(fusionnerNomsMasques(HIDDEN_CULTURES_LIVRE, prevDelta.ajouts, prevDelta.retraits))
        : updater
      const nextDelta = migrerNomsMasquesPerso(next, HIDDEN_CULTURES_LIVRE)
      queueSave('hidden-cultures-perso.json', JSON.stringify({ _type: 'hidden-cultures-perso', data: nextDelta }, null, 2))
      return nextDelta
    })
  }, [])
  // Même particularité que hiddenVoies (voir plus haut) : masquer un compagnon est déjà libre, le
  // démasquer non (mot de passe), d'où le même modèle ajouts/retraits par rapport au livré.
  const setHiddenCompagnons = useCallback<Dispatch<SetStateAction<string[]>>>((updater) => {
    setHiddenCompagnonsDeltaRaw(prevDelta => {
      const next = typeof updater === 'function'
        ? (updater as (p: string[]) => string[])(fusionnerNomsMasques(HIDDEN_COMPAGNONS_LIVRE, prevDelta.ajouts, prevDelta.retraits))
        : updater
      const nextDelta = migrerNomsMasquesPerso(next, HIDDEN_COMPAGNONS_LIVRE)
      queueSave('hidden-compagnons-perso.json', JSON.stringify({ _type: 'hidden-compagnons-perso', data: nextDelta }, null, 2))
      return nextDelta
    })
  }, [])
  const setBestiairePerso = useMemo(() => makeAutoSaver<BestiaireEntry[]>(setBestiairePersoRaw, 'Maitre de jeu/bestiaire-perso.json', 'bestiaire-perso'), [])
  const setBestiaireIllustrations = useMemo(() => makeAutoSaver<BestiaireIllustrations>(setBestiaireIllustrationsRaw, 'Maitre de jeu/bestiaire-illustrations.json', 'bestiaire-illustrations'), [])
  const setHiddenBestiaire = useMemo(() => makeAutoSaver<string[]>(setHiddenBestiaireRaw, 'Maitre de jeu/hidden-bestiaire.json', 'hidden-bestiaire'), [])
  const setRencontres = useMemo(() => makeAutoSaver<RencontreSauvegardee[]>(setRencontresRaw, 'Maitre de jeu/rencontres-sauvegardees.json', 'rencontres'), [])
  const setCombatsSauvegardes = useMemo(() => makeAutoSaver<CombatSessionSauvegardee[]>(setCombatsSauvegardesRaw, 'Maitre de jeu/combats-sauvegardes.json', 'combats'), [])
  // Générique comme setTraits/setTraitsRaciaux/setCompagnons ci-dessus : reçoit la vue fusionnée (même
  // signature qu'avant la scission), en déduit la surcharge perso par différence avec le livré.
  const setCapacitesBibliotheque = useCallback<Dispatch<SetStateAction<CapaciteBibliotheque[]>>>((updater) => {
    setCapacitesBibliothequePersoRaw(prevPerso => {
      const next = typeof updater === 'function'
        ? (updater as (p: CapaciteBibliotheque[]) => CapaciteBibliotheque[])(fusionnerCatalogue(CAPACITES_BIBLIOTHEQUE_LIVRE, prevPerso))
        : updater
      const nextPerso = extraireSurchargesCatalogue(next, CAPACITES_BIBLIOTHEQUE_LIVRE)
      queueSave('Maitre de jeu/capacites-bibliotheque-perso.json', JSON.stringify({ _type: 'capacites-bibliotheque-perso', data: nextPerso }, null, 2))
      return nextPerso
    })
  }, [])
  const setNotes = useMemo(() => makeAutoSaver<Note[]>(setNotesRaw, 'Notes/notes.json', 'notes'), [])
  const setCampagnes = useMemo(() => makeAutoSaver<Campaign[]>(setCampagnesRaw, 'Notes/campagnes.json', 'campagnes'), [])
  const setNoteImages = useMemo(() => makeAutoSaver<NoteImage[]>(setNoteImagesRaw, 'Notes/note-images.json', 'note-images'), [])
  const setGmNotes = useMemo(() => makeAutoSaver<Note[]>(setGmNotesRaw, 'Maitre de jeu/gm-notes.json', 'gm-notes'), [])
  const setGmCampagnes = useMemo(() => makeAutoSaver<Campaign[]>(setGmCampagnesRaw, 'Maitre de jeu/gm-campagnes.json', 'gm-campagnes'), [])
  const setGmNoteImages = useMemo(() => makeAutoSaver<NoteImage[]>(setGmNoteImagesRaw, 'Maitre de jeu/gm-note-images.json', 'gm-note-images'), [])
  const setBatailles = useMemo(() => makeAutoSaver<BatailleSessionSauvegardee[]>(setBataillesRaw, 'Maitre de jeu/batailles-sauvegardees.json', 'batailles'), [])
  const setBatailleTemplates = useMemo(() => makeAutoSaver<BatailleTemplate[]>(setBatailleTemplatesRaw, 'Maitre de jeu/batailles-modeles.json', 'batailles-modeles'), [])

  const bestiaire = useMemo(
    () => fusionnerBestiaire(BESTIAIRE_LIVRE, bestiairePerso, bestiaireIllustrations, hiddenBestiaire),
    [bestiairePerso, bestiaireIllustrations, hiddenBestiaire],
  )

  const voies = useMemo(() => fusionnerVoies(VOIES_LIVRE, voiesPerso), [voiesPerso])
  const data = useMemo(() => fusionnerDescriptions(DESCRIPTIONS_LIVRE, descriptionsPerso), [descriptionsPerso])
  const hiddenVoies = useMemo(
    () => fusionnerHiddenVoies(HIDDEN_VOIES_LIVRE, hiddenVoiesDelta.ajouts, hiddenVoiesDelta.retraits),
    [hiddenVoiesDelta],
  )
  const traits = useMemo(() => fusionnerCatalogue(TRAITS_MAGIQUES_LIVRE, traitsPerso), [traitsPerso])
  const traitsRaciaux = useMemo(() => fusionnerCatalogue(TRAITS_RACIAUX_LIVRE, traitsRaciauxPerso), [traitsRaciauxPerso])
  const compagnons = useMemo(() => fusionnerCatalogue(COMPAGNONS_LIVRE, compagnonsPerso), [compagnonsPerso])
  const capacitesBibliotheque = useMemo(() => fusionnerCatalogue(CAPACITES_BIBLIOTHEQUE_LIVRE, capacitesBibliothequePerso), [capacitesBibliothequePerso])
  const hiddenCompagnons = useMemo(
    () => fusionnerNomsMasques(HIDDEN_COMPAGNONS_LIVRE, hiddenCompagnonsDelta.ajouts, hiddenCompagnonsDelta.retraits),
    [hiddenCompagnonsDelta],
  )
  const armes = useMemo(() => fusionnerArmes(ARMES_LIVRE, armesPerso), [armesPerso])
  const armures = useMemo(() => fusionnerArmures(ARMURES_LIVRE, armuresPerso), [armuresPerso])
  const peuples = useMemo(() => fusionnerPeuples(PEUPLES_LIVRE, peuplesPerso), [peuplesPerso])
  const hiddenPeuples = useMemo(
    () => fusionnerNomsMasques(HIDDEN_PEUPLES_LIVRE, hiddenPeuplesDelta.ajouts, hiddenPeuplesDelta.retraits),
    [hiddenPeuplesDelta],
  )
  const hiddenCultures = useMemo(
    () => fusionnerNomsMasques(HIDDEN_CULTURES_LIVRE, hiddenCulturesDelta.ajouts, hiddenCulturesDelta.retraits),
    [hiddenCulturesDelta],
  )

  const openDataDir = useCallback(() => { openDir().catch(console.error) }, [])

  return (
    <GameDataContext.Provider value={{
      data, setData,
      descriptionsPerso, setDescriptionsPerso,
      traits, setTraits,
      traitsPerso, setTraitsPerso,
      peuples, setPeuples,
      peuplesPerso, setPeuplesPerso,
      armes, setArmes,
      armures, setArmures,
      voies, setVoies,
      voiesPerso, setVoiesPerso,
      compagnons, setCompagnons,
      compagnonsPerso, setCompagnonsPerso,
      traitsRaciaux, setTraitsRaciaux,
      traitsRaciauxPerso, setTraitsRaciauxPerso,
      fieldPositions, setFieldPositions,
      sheetImages, setSheetImages,
      hiddenVoies, setHiddenVoies,
      hiddenPeuples, setHiddenPeuples,
      hiddenCultures, setHiddenCultures,
      hiddenCompagnons, setHiddenCompagnons,
      bestiaire,
      bestiairePerso, setBestiairePerso,
      bestiaireIllustrations, setBestiaireIllustrations,
      hiddenBestiaire, setHiddenBestiaire,
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
