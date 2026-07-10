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
