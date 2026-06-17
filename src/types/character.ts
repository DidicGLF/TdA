export type Famille = 'combattants' | 'aventuriers' | 'mystiques'

export type GolemRole = 'soldat' | 'gardien' | 'gladiateur'

export interface GolemState {
  role: GolemRole | null
  ameliorationsChoisies: string[]
}

export const defaultGolemState = (): GolemState => ({
  role: null,
  ameliorationsChoisies: [],
})

export type CompagnonOverride = {
  nom?: string
  for?: string; dex?: string; con?: string; int?: string; sag?: string; cha?: string
  init?: string; def?: string; pv?: string
  atk1nom?: string; atk1bonus?: string; atk1dm?: string
}

export type Caracteristique = 'FOR' | 'DEX' | 'CON' | 'INT' | 'SAG' | 'CHA'

export interface CaracteristiqueScore {
  valeur: number
  mod: number
}

export interface VoieRang {
  rang: number
  acquis: boolean
}

export interface VoiePersonnage {
  nom: string
  rangs: boolean[] // index 0 = rang 1, ..., index 4 = rang 5
}

export interface TraitMagique {
  nom: string
  desc: string
}

export interface Arme {
  nom: string
  attaque: string
  special: string
  dm: string
  prix?: string
  portee?: string
}

export interface ArmureEquipee {
  nom: string
  def: number
  prix: string
  equipe?: boolean
}

export interface Character {
  // Identité
  nomJoueur: string
  nomPersonnage: string
  genre: string
  age: string
  taille: string
  poids: string
  niveau: number

  // Peuple & profil
  peuple: string
  culture: string
  profil: string
  famille: Famille | null

  // Caractéristiques
  caracteristiques: Record<Caracteristique, CaracteristiqueScore>

  // Scores dérivés (calculés)
  initiative: number
  defense: number
  bonusDefense: number
  pvTotal: number
  pvRestants: number
  pr: number
  prUtilises: boolean[]
  pm: number
  pc: number
  deVie: string
  encombrement: number
  malusEncombrement: number
  enchantementEncombrement: number

  // Attaques
  attaqueContact: number
  attaqueDistance: number
  attaqueMagique: number
  arme1: string
  arme2: string
  dmArme1: string
  dmArme2: string
  armes: Arme[]
  armuresEquipees: ArmureEquipee[]

  // Voies
  voiePeuple: VoiePersonnage
  voieCulturelle: VoiePersonnage
  voie1: VoiePersonnage
  voie2: VoiePersonnage
  voie3: VoiePersonnage
  voiePrestige: VoiePersonnage
  voieSangMele: VoiePersonnage

  // Traits & talents
  traitPeuple: string
  traitPeupleDesc: string
  talentMagique: TraitMagique
  formationsMartiales: string[]
  capacitesSupplementaires: string

  // Divers
  description: string
  inventaire: string
  tresorerie: string
  portrait: string
  portraitScale: number
  portraitTx: number
  portraitTy: number
  portraitFit: 'cover' | 'contain'
  portraitLocked?: boolean
  versoMode?: 'description' | 'image'

  // Golem
  golem?: GolemState

  // Compagnons
  compagnonsActifs?: [string | null, string | null]
  compagnonsChoix?: string[]   // un nom choisi par grant COMPAGNON_CHOIX actif
  effectsChoix?: Record<string, string>  // grantKey → stat choisie par grant EFFECT_CHOIX
  compagnonsOverrides?: [CompagnonOverride | null, CompagnonOverride | null]

  // Snapshot du niveau 1 (capturé lors du premier level-up)
  niveau1Base?: {
    pvTotal: number
    pm: number
    attaqueContact: number
    attaqueDistance: number
    attaqueMagique: number
  }

  // Historique des gains de PV par passage de niveau
  pvHistorique?: { niveauDe: number; niveauA: number; jet: number; conMod: number; total: number }[]
}

export function getGolemVoieRang(character: Character): number {
  const voies = [character.voie1, character.voie2, character.voie3, character.voiePrestige, character.voieSangMele]
  const v = voies.find(v => v.nom === 'Voie des golems')
  return v ? v.rangs.filter(Boolean).length : 0
}

export function hasVoieEtheree(character: Character): boolean {
  const voies = [character.voie1, character.voie2, character.voie3, character.voiePrestige, character.voieSangMele]
  return voies.some(v => v.nom === 'Voie éthérée' && v.rangs.some(Boolean))
}

export const defaultCharacter = (): Character => ({
  nomJoueur: '',
  nomPersonnage: '',
  genre: '',
  age: '',
  taille: '',
  poids: '',
  niveau: 1,

  peuple: '',
  culture: '',
  profil: '',
  famille: null,

  caracteristiques: {
    FOR: { valeur: 10, mod: 0 },
    DEX: { valeur: 10, mod: 0 },
    CON: { valeur: 10, mod: 0 },
    INT: { valeur: 10, mod: 0 },
    SAG: { valeur: 10, mod: 0 },
    CHA: { valeur: 10, mod: 0 },
  },

  initiative: 0,
  defense: 10,
  bonusDefense: 0,
  pvTotal: 0,
  pvRestants: 0,
  pr: 0,
  prUtilises: [false, false, false, false, false, false],
  pm: 0,
  pc: 0,
  deVie: 'd8',
  encombrement: 0,
  malusEncombrement: 0,
  enchantementEncombrement: 0,

  attaqueContact: 0,
  attaqueDistance: 0,
  attaqueMagique: 0,
  arme1: '',
  arme2: '',
  dmArme1: '',
  dmArme2: '',
  armes: [],
  armuresEquipees: [],

  voiePeuple: { nom: '', rangs: [false, false, false, false, false] },
  voieCulturelle: { nom: '', rangs: [false, false, false, false, false] },
  voie1: { nom: '', rangs: [false, false, false, false, false] },
  voie2: { nom: '', rangs: [false, false, false, false, false] },
  voie3: { nom: '', rangs: [false, false, false, false, false] },
  voiePrestige: { nom: '', rangs: [false, false, false, false, false] },
  voieSangMele: { nom: '', rangs: [false, false, false, false, false] },

  traitPeuple: '',
  traitPeupleDesc: '',
  talentMagique: { nom: '', desc: '' },
  formationsMartiales: ['Armes de paysan (gratuit)'],
  capacitesSupplementaires: '',

  description: '',
  inventaire: '',
  tresorerie: '',
  portrait: '',
  portraitScale: 1,
  portraitTx: 0,
  portraitTy: 0,
  portraitFit: 'cover',
})

export function getMod(valeur: number): number {
  return Math.max(-4, Math.floor((valeur - 10) / 2))
}
