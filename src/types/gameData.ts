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
  condition?: EffectCondition
}

export type Grant =
  | { type: 'FORMATION'; value: string; minRang?: number; avancee?: boolean }
  | { type: 'VOIE_RANG'; voie: string; rang: number; minRang?: number; avancee?: boolean }
  | { type: 'VOIE_RANG_CHOIX'; voies: string[]; rangMax: number; minRang?: number; avancee?: boolean }

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
