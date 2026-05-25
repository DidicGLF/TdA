import PEUPLES_BUNDLED from './peuples.json'
import type { PeupleEntry } from '../types/gameData'

export type { default as PeuplesData } from './peuples.json'
export { PEUPLES_BUNDLED as PEUPLES }

export function findCulture(peuples: PeupleEntry[] | undefined, peupleLabel: string, cultureLabel: string) {
  const list = peuples ?? PEUPLES_BUNDLED
  const peuple = list.find(p => p.label === peupleLabel)
  return peuple?.cultures.find(c => c.label === cultureLabel)
}

export function findTrait(peuples: PeupleEntry[] | undefined, peupleLabel: string, cultureLabel: string): { nom: string; desc: string } | null
export function findTrait(peupleLabel: string, cultureLabel: string): { nom: string; desc: string } | null
export function findTrait(
  peuplesOrLabel: PeupleEntry[] | string | undefined,
  peupleOrCulture: string,
  cultureLabel?: string,
): { nom: string; desc: string } | null {
  if (typeof peuplesOrLabel === 'string') {
    const culture = findCulture(undefined, peuplesOrLabel, peupleOrCulture)
    return culture?.trait ?? null
  }
  const culture = findCulture(peuplesOrLabel, peupleOrCulture, cultureLabel!)
  return culture?.trait ?? null
}
