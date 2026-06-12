import VOIES_RAW from './voies.json'

const _raw = VOIES_RAW as unknown
const _unwrapped = (_raw && typeof _raw === 'object' && '_type' in (_raw as object) && 'data' in (_raw as object))
  ? (_raw as Record<string, unknown>).data
  : _raw

export const VOIES = _unwrapped as { nom: string; famille: string; categorie: string }[]
export type VoieEntry = typeof VOIES[number]

export function getVoiesForFamille(
  famille: 'combattants' | 'aventuriers' | 'mystiques' | null | undefined,
): VoieEntry[] {
  const profil = VOIES.filter(v => v.categorie === 'profil')
  if (!famille) return profil
  return profil.filter(v => v.famille === famille)
}
