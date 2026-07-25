import cristauxData from '../data/cristaux.json'

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
  // Fiche de compagnon dédiée : zones de texte libre du joueur et image du compagnon.
  special?: string
  notes?: string
  image?: string
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
  rangsAvances?: boolean[] // index 0 = cap. avancée rang 1, index 1 = cap. avancée rang 2
}

// Bonus temporaire (Effets en jeu) actuellement activé — vit sur la copie de session du Mode de jeu
// (jamais sur le personnage d'origine), pour que la fiche affichée pendant la partie reflète ces effets.
export interface ActiveBoostPersisted {
  id: number
  stat: string
  bonus: number
  nom: string
  rang: number
  sourceKey?: string
  div2?: boolean
  immunite?: boolean
}

// Dégâts sur la durée (poison, brûlure, etc.) actuellement en cours — vit sur la copie de session du
// Mode de jeu au même titre que les bonus temporaires ; s'applique automatiquement à chaque fin de tour.
export interface ActiveDotPersisted {
  id: number
  type: string
  amount: number
  remainingTurns: number
  label: string
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
  deuxMains?: boolean
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
  pvRestants?: number
  // État live du Mode de jeu (Effets en jeu actuellement actifs) — présent uniquement sur la copie de session
  activeBoosts?: ActiveBoostPersisted[]
  effectCounters?: Record<string, number>
  activeDots?: ActiveDotPersisted[]
  pr: number
  prUtilises: boolean[]
  pm: number
  pmRestants?: number
  pc: number
  pcRestants: number
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

  // Cristaux
  cristauxAppris?: string[]
  cristauxActifs?: string[]

  // Compagnons
  compagnonsActifs?: [string | null, string | null]
  compagnonsChoix?: string[]   // un nom choisi par grant COMPAGNON_CHOIX actif
  effectsChoix?: Record<string, string>  // grantKey → stat choisie par grant EFFECT_CHOIX
  // grantKey → {voie, rang} choisi par un grant VOIE_RANG_CHOIX (ex : voie culturelle de la Forge
  // rang 2 "choisis une capacité de rang 1 ou 2 de la voie d'alchimie ou de la voie runique") — le
  // pointeur est stocké, pas une copie du texte, pour rester à jour si la voie source est retouchée.
  // avanceeSeulement : ce grant n'a pas servi à choisir une nouvelle capacité (voie/rang pointent vers
  // une capacité déjà empruntée ailleurs) mais seulement à lui accorder gratuitement sa version avancée
  // (ex : "Perfection élémentaliste").
  voieRangChoix?: Record<string, { voie: string; rang: number; avanceeSeulement?: boolean }>
  compagnonsOverrides?: [CompagnonOverride | null, CompagnonOverride | null]
  // Saisies du joueur pour les fiches de compagnon, indexées par NOM de compagnon et non par position :
  // un personnage peut en débloquer plus de deux, et l'ordre de la liste peut changer (une voie qui en
  // remplace un autre, par exemple) — un index de position ferait alors suivre les saisies au mauvais
  // compagnon. `compagnonsOverrides` (2 positions) reste lu en repli pour les personnages existants.
  compagnonsFiches?: Record<string, CompagnonOverride>

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

export function hasCristauxVoie(character: Character): boolean {
  return character.voiePrestige.nom === 'Voie des cristaux' && character.voiePrestige.rangs.some(Boolean)
}

export function getCristauxRang(character: Character): number {
  if (character.voiePrestige.nom !== 'Voie des cristaux') return 0
  return character.voiePrestige.rangs.filter(Boolean).length
}

export function getCristalBonuses(character: Character): Record<string, number> {
  const actifs = character.cristauxActifs ?? []
  if (actifs.length === 0) return {}
  const bonuses: Record<string, number> = {}
  for (const nom of actifs) {
    const cristal = cristauxData.find(c => c.nom === nom)
    if (cristal?.bonus) {
      const { stat, valeur } = cristal.bonus
      bonuses[stat] = (bonuses[stat] ?? 0) + valeur
    }
  }
  return bonuses
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
  pr: 0,
  prUtilises: [false, false, false, false, false, false],
  pm: 0,
  pc: 0,
  pcRestants: 0,
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
