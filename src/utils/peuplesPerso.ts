// Séparation livré/perso pour peuples.json — même principe que les voies (voir voiesPerso.ts),
// à la granularité de la CULTURE (comme la catégorie pour l'équipement) : un peuple n'est qu'un nom
// (`label`) qui regroupe des cultures, et c'est la culture qui porte tout le contenu utile (voies,
// modificateurs, trait racial). L'identité d'une culture est (peupleLabel, cultureLabel) — les deux
// sont déjà uniques individuellement sur le livré, mais composer les deux reste la règle générale
// (mêmes précautions que pour les armes).
//
// hidden-peuples.json / hidden-cultures.json ont la même particularité que hidden-voies.json (masquer
// libre, démasquer au mot de passe) — géré par les fonctions déjà génériques de cataloguePerso.ts,
// rien de nouveau à écrire ici pour le masquage.
import { empreinte } from './empreinte'
import { queueSave, flushAllSaves } from './saveManager'
import type { PeupleEntry, Culture } from '../types/gameData'

export type CulturePerso = { peupleLabel: string; culture: Culture }
export type PeuplesPerso = { cultures: CulturePerso[] }

export const cleCulturePerso = (peupleLabel: string, cultureLabel: string) => `${peupleLabel} ${cultureLabel}`

export function fusionnerPeuples(livre: PeupleEntry[], perso: PeuplesPerso): PeupleEntry[] {
  const persoMap = new Map(perso.cultures.map(p => [cleCulturePerso(p.peupleLabel, p.culture.label), p.culture]))
  const peupleLabelsLivre = new Set(livre.map(p => p.label))
  const peuples = livre.map(p => {
    const culturesVues = new Set(p.cultures.map(c => c.label))
    const cultures = p.cultures.map(c => persoMap.get(cleCulturePerso(p.label, c.label)) ?? c)
    const ajouts = perso.cultures
      .filter(pc => pc.peupleLabel === p.label && !culturesVues.has(pc.culture.label))
      .map(pc => pc.culture)
    return { ...p, cultures: [...cultures, ...ajouts] }
  })
  // Peuples entièrement nouveaux (absents du livré).
  for (const label of new Set(perso.cultures.map(p => p.peupleLabel).filter(l => !peupleLabelsLivre.has(l)))) {
    peuples.push({ label, cultures: perso.cultures.filter(p => p.peupleLabel === label).map(p => p.culture) })
  }
  return peuples
}

export function extraireSurchargesPeuples(next: PeupleEntry[], livre: PeupleEntry[]): PeuplesPerso {
  const livreCultures = new Map<string, Culture>()
  for (const p of livre) for (const c of p.cultures) livreCultures.set(cleCulturePerso(p.label, c.label), c)
  const cultures: CulturePerso[] = []
  for (const p of next) {
    for (const c of p.cultures) {
      const l = livreCultures.get(cleCulturePerso(p.label, c.label))
      if (!l || empreinte(c) !== empreinte(l)) cultures.push({ peupleLabel: p.label, culture: c })
    }
  }
  return { cultures }
}

export const migrerPeuplesPerso = extraireSurchargesPeuples

/** Publie l'état affiché comme nouveau contenu livré (bouton auteur « Enregistrer dans le projet »,
 *  voir publierVoiesLivre pour le pourquoi) : les trois fichiers perso repartent à vide. */
export async function publierPeuplesLivre(): Promise<void> {
  queueSave('peuples-perso.json', JSON.stringify({ _type: 'peuples-perso', data: { cultures: [] } }, null, 2))
  queueSave('hidden-peuples-perso.json', JSON.stringify({ _type: 'hidden-peuples-perso', data: { ajouts: [], retraits: [] } }, null, 2))
  queueSave('hidden-cultures-perso.json', JSON.stringify({ _type: 'hidden-cultures-perso', data: { ajouts: [], retraits: [] } }, null, 2))
  await flushAllSaves()
}
