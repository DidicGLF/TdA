export type EffectCondition =
  | { type: 'hasBouclier' }
  | { type: 'hasArme'; armes: string[] }
  | { type: 'noArme' }

export type Effect = {
  stat: string
  value?: number
  formula?: string
  diceStr?: string
  minRang?: number
  avancee?: boolean
  rangMultiplier?: boolean
  condition?: EffectCondition
  // Pour les stats RD/RD_<TYPE> : au lieu d'une réduction à points fixes, divise par 2 les DM correspondants
  div2?: boolean
  // Pour les stats RD/RD_<TYPE> : immunité totale, les DM correspondants sont ramenés à 0 (prioritaire sur div2)
  immunite?: boolean
}

export type Grant =
  | { type: 'FORMATION'; value: string; minRang?: number; avancee?: boolean }
  | { type: 'VOIE_RANG'; voie: string; rang: number; minRang?: number; avancee?: boolean }
  | { type: 'VOIE_RANG_CHOIX'; voies: string[]; rangMax: number; minRang?: number; avancee?: boolean }
  | { type: 'COMPAGNON'; nom: string; remplace?: string; minRang?: number; avancee?: boolean }
  | { type: 'COMPAGNON_CHOIX'; noms: string[]; minRang?: number; avancee?: boolean }
  | { type: 'EFFECT_CHOIX'; stats: string[]; value?: number; formula?: string; rangMultiplier?: boolean; condition?: EffectCondition; minRang?: number; avancee?: boolean }
  | { type: 'BONUS_TEMP'; label: string; bonus?: number; formula?: string; deDegats?: string; deDegatsParArme?: boolean; temporaire?: boolean; cibles: string[]; choix?: boolean; cout_pv?: string; cout_pm?: string; coutCaracStat?: string; coutCaracValeur?: number; usage?: string; post_jet?: boolean; precision?: string; minRang?: number; avancee?: boolean; masqueSiAvancee?: boolean; div2?: boolean; immunite?: boolean }
  | { type: 'AVANTAGE'; stat: string; lancer: number; garder: number; minRang?: number; avancee?: boolean; masqueSiAvancee?: boolean }
  | { type: 'ACTION'; label: string; de: number; dm: string; attType?: 'contact' | 'distance' | 'magique'; activable?: boolean; cout_pm?: string; minRang?: number; avancee?: boolean; masqueSiAvancee?: boolean }

export type RangEntry = { nom: string; desc: string; effects?: Effect[]; grants?: Grant[] }
export type DescMap = Record<string, RangEntry[]>
export type TraitEntry = { nom: string; desc: string }

export type Culture = {
  label: string
  voiePeuple: string
  voieCulturelle: string
  modCaracs: Record<string, number>
  trait?: { nom: string; desc: string }
}

export type PeupleEntry = { label: string; cultures: Culture[] }

export type CompanionAttaque = {
  nom: string
  bonus: string   // ex: "+5", "-1"
  dm: string      // ex: "1d6+4"
}

export type CompanionEntry = {
  nom: string
  for: number     // modificateur
  dex: number
  con: number
  int: number
  sag: number
  cha: number
  init: number | string
  def: number
  pv: number | string
  attaque1?: CompanionAttaque
  attaque2?: CompanionAttaque
  capacites?: string
}

export type CreatureCaracteristiques = {
  FOR: string
  DEX: string
  CON: string
  INT: string
  SAG: string
  CHA: string
}

export type CreatureAttaque = {
  nom: string      // ex: "Morsure et griffes", "Souffle (L)"
  bonus?: string   // ex: "+22"
  dm?: string      // ex: "4d6+16", "6d6+30"
  zone?: string    // ex: "(30 x 15 m)"
}

export type CreatureCapacite = {
  nom: string
  desc: string
}

export type CreatureVoieRang = {
  rang: number
  nom: string
  desc: string
}

export type CreatureVoie = {
  nom: string          // ex: "Voie de l'envoûtement"
  rang: number         // rang atteint par la créature
  reference?: string   // ex: "LdJ p.134"
  rangs: CreatureVoieRang[]
}

export type BestiaireEntry = {
  nom: string
  nc: number   // Niveau de Créature (0, 0.5, 1, 2, ... 20)
  livres: string[]
  page?: string
  taille?: string
  image?: string
  imageScale?: number
  imageTx?: number
  imageTy?: number
  imageFit?: 'cover' | 'contain'
  imageLocked?: boolean
  description?: string
  caracteristiques?: CreatureCaracteristiques
  def?: number
  pv?: number
  init?: number
  rd?: number
  attaques?: CreatureAttaque[]
  capacites?: CreatureCapacite[]
  voies?: CreatureVoie[]
}

export type Difficulte = 'facile' | 'ordinaire' | 'difficile' | 'extreme'

export type CoutPAEntry = { niveau: number; facile: number; ordinaire: number; difficile: number; extreme: number }
// nc: null représente l'entrée "-" (aucune créature, coût 0), distincte du vrai NC 0
export type NCPAEntry = { nc: number | null; pa: number }
export type RencontreData = { coutPA: CoutPAEntry[]; ncPA: NCPAEntry[] }

export type RencontreAdversaire = {
  nc: number
  manuel: boolean          // true si le NC a été fixé à la main (pas redistribué automatiquement)
  creatureNom: string | null  // nom de la créature choisie dans le bestiaire (lien par nom)
}

export type RencontreSauvegardee = {
  id: string
  nom: string
  nombrePJs: number
  niveauMoyen: number
  difficulte: Difficulte
  adversaires: RencontreAdversaire[]
  creeLe: string   // ISO timestamp
}
