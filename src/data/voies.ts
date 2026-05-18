import VOIES from './voies.json'

export type VoieEntry = typeof VOIES[number]
export { VOIES }

export function getVoiesForFamille(
  famille: 'combattants' | 'aventuriers' | 'mystiques' | null | undefined,
): VoieEntry[] {
  if (!famille) return VOIES
  return VOIES.filter(v => v.famille === famille)
}
