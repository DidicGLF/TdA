// Séparation livré/perso pour les cartes de réussites/échecs critiques (calquée sur objetsMagiquesPerso.ts)
// — identifiées par leur numéro (1-25, unique DANS chaque catégorie ; échecs et réussites sont deux
// catalogues distincts, fusionnés séparément par GameDataContext, chacun avec son propre fichier perso).
// `active` vit comme un champ à part entière de la surcharge plutôt que dans un hidden-*.json séparé :
// contrairement au bestiaire/aux voies, ces 25+25 cartes sont un ensemble fixe qui ne gagne jamais de
// nouvelle entrée d'une version à l'autre — pas besoin du mécanisme ajouts/retraits par nom des autres
// catalogues masquables.
import { empreinte } from './empreinte'
import type { CarteCritique } from '../data/cartesCritiques'

export interface CarteCritiquePerso extends CarteCritique {
  active: boolean
}

export function fusionnerCartesCritiques(livre: CarteCritique[], perso: CarteCritiquePerso[]): CarteCritiquePerso[] {
  const surcharges = new Map(perso.map(c => [c.numero, c]))
  return livre.map(c => surcharges.get(c.numero) ?? { ...c, active: true })
}

/** Même principe que extraireSurchargesCatalogue : sert de setter générique (next = la vue fusionnée
 *  voulue, calculée par l'appelant à partir de la vue actuelle) — une carte revenue à l'identique du
 *  livré (texte ET active) redevient sans surcharge plutôt que de traîner une entrée perso inutile. */
export function extraireSurchargesCartesCritiques(next: CarteCritiquePerso[], livre: CarteCritique[]): CarteCritiquePerso[] {
  const parNumero = new Map(livre.map(c => [c.numero, c]))
  const perso: CarteCritiquePerso[] = []
  for (const c of next) {
    const l = parNumero.get(c.numero)
    if (!l) continue
    const livreeActive: CarteCritiquePerso = { ...l, active: true }
    if (empreinte(c) !== empreinte(livreeActive)) perso.push(c)
  }
  return perso
}

// Tirage aléatoire parmi les cartes actives — si le MJ a désactivé toute une catégorie (25/25), on
// retombe sur l'ensemble complet plutôt que de planter : mieux vaut une carte non voulue qu'un tirage
// impossible en pleine table.
export function piocherCarteActive(cartes: CarteCritiquePerso[]): CarteCritiquePerso {
  const actives = cartes.filter(c => c.active)
  const pool = actives.length > 0 ? actives : cartes
  return pool[Math.floor(Math.random() * pool.length)]
}
