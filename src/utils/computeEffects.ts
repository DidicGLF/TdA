import type { Character } from '../types/character'
import type { DescMap } from '../types/gameData'

type Condition =
  | { type: 'hasBouclier' }
  | { type: 'hasArme'; armes: string[] }
  | { type: 'noArme' }

type DescEffect = {
  stat: string
  value?: number
  formula?: string
  diceStr?: string
  minRang?: number
  avancee?: boolean
  condition?: Condition
}

function normalizeArmeName(nom: string): string {
  return nom.replace(/[¹²³⁴⁵⁶⁷*]\s*/g, '').trim().toLowerCase()
}

function evaluateCondition(condition: Condition, character: Character): boolean {
  switch (condition.type) {
    case 'hasBouclier':
      return character.armuresEquipees.some(a => a.nom.toLowerCase().includes('bouclier') && a.equipe)
    case 'hasArme': {
      const armes = condition.armes.map(normalizeArmeName)
      const arme1 = character.arme1 ? normalizeArmeName(character.arme1) : null
      const arme2 = character.arme2 ? normalizeArmeName(character.arme2) : null
      return armes.some(a => a === arme1 || a === arme2)
    }
    case 'noArme':
      return !character.arme1
  }
}

const VOIE_KEYS: Array<keyof Pick<Character,
  'voiePeuple' | 'voieCulturelle' | 'voie1' | 'voie2' | 'voie3' | 'voiePrestige' | 'voieSangMele'
>> = ['voiePeuple', 'voieCulturelle', 'voie1', 'voie2', 'voie3', 'voiePrestige', 'voieSangMele']

function resolveFormula(formula: string, character: Character): number | null {
  const c = character.caracteristiques
  switch (formula) {
    case 'MOD_FOR': return c.FOR.mod
    case 'MOD_DEX': return c.DEX.mod
    case 'MOD_CON': return c.CON.mod
    case 'MOD_INT': return c.INT.mod
    case 'MOD_SAG': return c.SAG.mod
    case 'MOD_CHA': return c.CHA.mod
    default: return null
  }
}

export type Contribution = {
  stat: string
  value: number
  nom: string
  rang: number
  triggerRang: number
  voie: string
  conditionArmes?: string[]
}

export type EffectsResult = Record<string, Contribution[]>

export type DiceContribution = {
  stat: string
  diceStr: string
  nom: string
  rang: number
  triggerRang: number
  voie: string
}

export function computeEffects(character: Character, descriptions: DescMap): EffectsResult {
  const result: EffectsResult = {}

  for (const key of VOIE_KEYS) {
    const voie = character[key]
    if (!voie.nom) continue

    const rangsData = descriptions[voie.nom]
    if (!rangsData) continue

    for (let i = 0; i < 5; i++) {
      if (!voie.rangs[i]) continue

      const rangData = rangsData[i]
      if (!rangData?.effects?.length) continue

      for (const effect of rangData.effects) {
        if (effect.avancee) continue
        if (!effect.value && !effect.formula) continue

        if (effect.minRang !== undefined && !voie.rangs[effect.minRang - 1]) continue
        if (effect.condition && !evaluateCondition(effect.condition, character)) continue

        let value: number
        if (effect.value !== undefined) {
          value = effect.value
        } else if (effect.formula) {
          const resolved = resolveFormula(effect.formula, character)
          if (resolved === null) continue
          value = resolved
        } else {
          continue
        }

        const contribution: Contribution = {
          stat: effect.stat,
          value,
          nom: rangData.nom,
          rang: i + 1,
          triggerRang: effect.minRang ?? (i + 1),
          voie: voie.nom,
          conditionArmes: effect.condition && effect.condition.type === 'hasArme' ? effect.condition.armes : undefined,
        }

        if (!result[effect.stat]) result[effect.stat] = []
        result[effect.stat].push(contribution)
      }
    }
  }

  return result
}

export function computeDiceEffects(character: Character, descriptions: DescMap): Record<string, DiceContribution> {
  const result: Record<string, DiceContribution> = {}

  for (const key of VOIE_KEYS) {
    const voie = character[key]
    if (!voie.nom) continue

    const rangsData = descriptions[voie.nom]
    if (!rangsData) continue

    for (let i = 0; i < 5; i++) {
      if (!voie.rangs[i]) continue

      const rangData = rangsData[i]
      if (!rangData?.effects?.length) continue

      for (const effect of rangData.effects) {
        if (effect.avancee) continue
        if (!effect.diceStr) continue
        if (effect.minRang !== undefined && !voie.rangs[effect.minRang - 1]) continue
        if (effect.condition && !evaluateCondition(effect.condition, character)) continue

        const triggerRang = effect.minRang ?? (i + 1)
        const existing = result[effect.stat]
        if (!existing || triggerRang > existing.triggerRang) {
          result[effect.stat] = {
            stat: effect.stat,
            diceStr: effect.diceStr,
            nom: rangData.nom,
            rang: i + 1,
            triggerRang,
            voie: voie.nom,
          }
        }
      }
    }
  }

  return result
}

export function sumStat(contributions: Contribution[]): number {
  return contributions.reduce((acc, c) => acc + c.value, 0)
}
