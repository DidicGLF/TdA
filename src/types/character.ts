export type Famille = 'combattants' | 'aventuriers' | 'mystiques'

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

export interface Arme {
  nom: string
  attaque: string
  special: string
  dm: string
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
  pvTotal: number
  pvRestants: number
  pr: number
  prUtilises: boolean[]
  pm: number
  pc: number
  deVie: string
  encombrement: number
  malusEncombrement: number

  // Attaques
  attaqueContact: number
  attaqueDistance: number
  attaqueMagique: number
  armes: Arme[]

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
  talentMagique: string
  formationsMartiales: string[]
  capacitesSupplementaires: string

  // Divers
  description: string
  inventaire: string
  tresorerie: string
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
  pvTotal: 0,
  pvRestants: 0,
  pr: 0,
  prUtilises: [false, false, false, false, false, false],
  pm: 0,
  pc: 0,
  deVie: 'd8',
  encombrement: 0,
  malusEncombrement: 0,

  attaqueContact: 0,
  attaqueDistance: 0,
  attaqueMagique: 0,
  armes: [],

  voiePeuple: { nom: '', rangs: [false, false, false, false, false] },
  voieCulturelle: { nom: '', rangs: [false, false, false, false, false] },
  voie1: { nom: '', rangs: [false, false, false, false, false] },
  voie2: { nom: '', rangs: [false, false, false, false, false] },
  voie3: { nom: '', rangs: [false, false, false, false, false] },
  voiePrestige: { nom: '', rangs: [false, false, false, false, false] },
  voieSangMele: { nom: '', rangs: [false, false, false, false, false] },

  traitPeuple: '',
  talentMagique: '',
  formationsMartiales: ['Armes de paysan (gratuit)'],
  capacitesSupplementaires: '',

  description: '',
  inventaire: '',
  tresorerie: '',
})

export function getMod(valeur: number): number {
  if (valeur <= 3) return -4
  if (valeur <= 5) return -3
  if (valeur <= 7) return -2
  if (valeur <= 9) return -1
  if (valeur <= 11) return 0
  if (valeur <= 13) return 1
  if (valeur <= 15) return 2
  if (valeur <= 17) return 3
  if (valeur <= 19) return 4
  return 5
}
