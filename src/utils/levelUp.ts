import type { Character, VoiePersonnage } from '../types/character'

export type VoieKey = 'voiePeuple' | 'voieCulturelle' | 'voie1' | 'voie2' | 'voie3' | 'voiePrestige' | 'voieSangMele'

export const VOIE_KEYS: VoieKey[] = [
  'voiePeuple', 'voieCulturelle', 'voie1', 'voie2', 'voie3', 'voiePrestige', 'voieSangMele',
]

export const VOIE_LABELS: Record<VoieKey, string> = {
  voiePeuple:     'Voie du peuple',
  voieCulturelle: 'Voie culturelle',
  voie1:          'Voie 1',
  voie2:          'Voie 2',
  voie3:          'Voie 3',
  voiePrestige:   'Voie de prestige',
  voieSangMele:   'Voie sang-mêlé',
}

// Rang is 0-indexed (0 = rang 1)
export function coutRang(rang: number): number {
  return rang < 2 ? 1 : 2
}

export const VOIES_NIVEAU8: VoieKey[] = ['voiePrestige']

export function coutRangPourVoie(key: VoieKey, rang: number): number {
  return VOIES_NIVEAU8.includes(key) ? 2 : coutRang(rang)
}

export function calcPointsCapacite(character: Character) {
  const total = 2 * character.niveau
  let depenses = 0
  for (const key of VOIE_KEYS) {
    const voie = character[key] as VoiePersonnage
    voie.rangs.forEach((acquis, i) => { if (acquis) depenses += coutRangPourVoie(key, i) })
  }
  return { total, depenses, disponibles: total - depenses }
}

// Returns the index of the next acquirable rang (sequential), or null if maxed
export function prochainRang(voie: VoiePersonnage): number | null {
  for (let i = 0; i < voie.rangs.length; i++) {
    if (!voie.rangs[i]) return i
  }
  return null
}

export function recalcAttaques(character: Character, niveau: number) {
  const { FOR, DEX, INT } = character.caracteristiques
  const f = character.famille
  const famContact = f === 'combattants' ? 2 : f === 'aventuriers' ? 1 : 0
  const famMagique = f === 'mystiques' ? 2 : 0
  return {
    attaqueContact:  niveau + FOR.mod + famContact,
    attaqueDistance: niveau + DEX.mod + famContact,
    attaqueMagique:  niveau + INT.mod + famMagique,
  }
}

export function parseDeVie(deVie: string): number {
  const m = deVie.match(/d(\d+)/i)
  return m ? parseInt(m[1]) : 6
}

export function rollDie(faces: number): number {
  return Math.floor(Math.random() * faces) + 1
}
