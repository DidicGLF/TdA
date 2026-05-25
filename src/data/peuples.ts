import PEUPLES_BUNDLED from './peuples.json'
import type { PeupleEntry } from '../types/gameData'

export type { default as PeuplesData } from './peuples.json'
export { PEUPLES_BUNDLED as PEUPLES }

export function findCulture(peuples: PeupleEntry[], peupleLabel: string, cultureLabel: string) {
  const peuple = peuples.find(p => p.label === peupleLabel)
  return peuple?.cultures.find(c => c.label === cultureLabel)
}

export function findTrait(peuples: PeupleEntry[], peupleLabel: string, cultureLabel: string): { nom: string; desc: string } | null {
  const culture = findCulture(peuples, peupleLabel, cultureLabel)
  return culture?.trait ?? null
}
