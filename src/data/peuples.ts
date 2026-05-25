import PEUPLES from './peuples.json'

export type { default as PeuplesData } from './peuples.json'
export { PEUPLES }

export function findCulture(peupleLabel: string, cultureLabel: string) {
  const peuple = PEUPLES.find(p => p.label === peupleLabel)
  return peuple?.cultures.find(c => c.label === cultureLabel)
}

export function findTrait(peupleLabel: string, cultureLabel: string): { nom: string; desc: string } | null {
  const culture = findCulture(peupleLabel, cultureLabel) as Record<string, unknown> | undefined
  const trait = culture?.trait as { nom: string; desc: string } | undefined
  return trait ?? null
}
