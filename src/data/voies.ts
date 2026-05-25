import VOIES from './voies.json'

export type VoieEntry = typeof VOIES[number]
export { VOIES }

export function getVoiesForFamille(
  famille: 'combattants' | 'aventuriers' | 'mystiques' | null | undefined,
): VoieEntry[] {
  const profil = VOIES.filter(v => v.categorie === 'profil')
  if (!famille) return profil
  return profil.filter(v => v.famille === famille)
}
