// Séparation livré/perso pour les objets magiques (calquée sur cataloguePerso.ts) — même règle que les
// autres catalogues simples (« le livré n'est jamais réécrit, une surcharge de même identifiant le
// remplace à l'affichage, sinon c'est un ajout »), mais identifiée par `id` plutôt que par `nom` : deux
// objets créés par le MJ peuvent légitimement partager un nom (clonage d'un objet existant pour créer
// une variante), contrairement aux autres catalogues nommés (voies, traits...).
import { empreinte } from './empreinte'
import { queueSave, flushAllSaves } from './saveManager'
import type { ObjetMagiqueEntry } from '../types/gameData'

export function fusionnerObjetsMagiques(livre: ObjetMagiqueEntry[], perso: ObjetMagiqueEntry[]): ObjetMagiqueEntry[] {
  const surcharges = new Map(perso.map(o => [o.id, o]))
  const clesLivre = new Set(livre.map(o => o.id))
  const fusion = livre.map(o => surcharges.get(o.id) ?? o)
  for (const o of perso) if (!clesLivre.has(o.id)) fusion.push(o)
  return fusion
}

/** Même principe que extraireSurchargesCatalogue : sert à la fois de setter générique (next = l'état
 *  affiché voulu) et, le cas échéant, de migration. */
export function extraireSurchargesObjetsMagiques(next: ObjetMagiqueEntry[], livre: ObjetMagiqueEntry[]): ObjetMagiqueEntry[] {
  const parId = new Map(livre.map(o => [o.id, o]))
  const perso: ObjetMagiqueEntry[] = []
  for (const o of next) {
    const l = parId.get(o.id)
    if (!l || empreinte(o) !== empreinte(l)) perso.push(o)
  }
  return perso
}

/** Publie l'état affiché comme nouveau contenu livré — bouton réservé à l'auteur, en dev (même principe
 *  que publierBestiaireLivre) : perso repart à vide, puisque ce qu'il contenait EST désormais le livré. */
export async function publierObjetsMagiquesLivre(): Promise<void> {
  queueSave('Maitre de jeu/objets-magiques-perso.json', JSON.stringify({ _type: 'objets-magiques-perso', data: [] }, null, 2))
  await flushAllSaves()
}
