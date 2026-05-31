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
}

export type Grant =
  | { type: 'FORMATION'; value: string; minRang?: number; avancee?: boolean }
  | { type: 'VOIE_RANG'; voie: string; rang: number; minRang?: number; avancee?: boolean }
  | { type: 'VOIE_RANG_CHOIX'; voies: string[]; rangMax: number; minRang?: number; avancee?: boolean }
  | { type: 'COMPAGNON'; nom: string; remplace?: string; minRang?: number; avancee?: boolean }
  | { type: 'COMPAGNON_CHOIX'; noms: string[]; minRang?: number; avancee?: boolean }

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
  init: number
  def: number
  pv: number | string
  attaque1?: CompanionAttaque
  attaque2?: CompanionAttaque
  capacites?: string
}
