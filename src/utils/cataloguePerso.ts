// Séparation livré/perso générique pour les catalogues simples : un tableau plat, identifié par un
// nom déjà unique (pas d'ambiguïté à la bestiaire) — traits magiques, traits raciaux, compagnons.
// Même principe que bestiairePerso.ts/voiesPerso.ts, factorisé ici parce que la règle est identique
// pour les trois : « le livré n'est jamais réécrit, une surcharge de même nom le remplace à l'affichage,
// sinon c'est un ajout ».
import { empreinte } from './empreinte'
import { queueSave, flushAllSaves } from './saveManager'

export function fusionnerCatalogue<T extends { nom: string }>(livre: T[], perso: T[]): T[] {
  const surcharges = new Map(perso.map(v => [v.nom, v]))
  const clesLivre = new Set(livre.map(v => v.nom))
  const fusion = livre.map(v => surcharges.get(v.nom) ?? v)
  for (const v of perso) if (!clesLivre.has(v.nom)) fusion.push(v)
  return fusion
}

/** Ce qui, dans `next` (la vue affichée après un `setXxx(prev => ...)` générique), diffère du livré —
 *  sert à la fois de setter générique (next = l'état voulu) et de migration (next = l'ancien fichier
 *  unique de l'utilisateur, livre = ce qui vient d'être scindé) : les deux comparent un tableau complet
 *  au livré et n'en gardent que les écarts, le calcul est le même. */
export function extraireSurchargesCatalogue<T extends { nom: string }>(next: T[], livre: T[]): T[] {
  const parNom = new Map(livre.map(v => [v.nom, v]))
  const perso: T[] = []
  for (const v of next) {
    const l = parNom.get(v.nom)
    if (!l || empreinte(v) !== empreinte(l)) perso.push(v)
  }
  return perso
}

// ─── Masquage (ajouts/retraits par rapport au livré) — voir voiesPerso.ts pour le pourquoi des deux
// sens : masquer une entrée livrée n'exige pas de mot de passe, mais la démasquer si (elle disparaît de
// la liste sélectionnable) — c'est l'auteur qui exerce alors le retrait en pratique.

export function fusionnerNomsMasques(livre: string[], ajouts: string[], retraits: string[]): string[] {
  const retraitSet = new Set(retraits)
  return [...new Set([...livre, ...ajouts])].filter(n => !retraitSet.has(n))
}

export function migrerNomsMasquesPerso(ancien: string[], livre: string[]): { ajouts: string[]; retraits: string[] } {
  const livreSet = new Set(livre)
  const ancienSet = new Set(ancien)
  return {
    ajouts: ancien.filter(n => !livreSet.has(n)),
    retraits: livre.filter(n => !ancienSet.has(n)),
  }
}

/** Publie l'état affiché comme nouveau contenu livré pour traits-magiques/traits-raciaux/compagnons
 *  (bouton auteur « Enregistrer dans le projet », voir publierVoiesLivre pour le pourquoi) : les
 *  fichiers perso repartent à vide, puisque ce qu'ils contenaient EST désormais le livré. */
export async function publierAutresCataloguesLivre(): Promise<void> {
  queueSave('traits-magiques-perso.json', JSON.stringify({ _type: 'traits-magiques-perso', data: [] }, null, 2))
  queueSave('traits-raciaux-perso.json', JSON.stringify({ _type: 'traits-raciaux-perso', data: [] }, null, 2))
  queueSave('compagnons-perso.json', JSON.stringify({ _type: 'compagnons-perso', data: [] }, null, 2))
  queueSave('hidden-compagnons-perso.json', JSON.stringify({ _type: 'hidden-compagnons-perso', data: { ajouts: [], retraits: [] } }, null, 2))
  await flushAllSaves()
}

/** Publie l'état affiché comme nouveau contenu livré pour la bibliothèque de capacités (bouton auteur
 *  du tableau de bord MJ, à côté du bestiaire, voir GMDashboard) : le fichier perso repart à vide,
 *  puisque ce qu'il contenait EST désormais le livré. */
export async function publierCapacitesBibliothequeLivre(): Promise<void> {
  queueSave('Maitre de jeu/capacites-bibliotheque-perso.json', JSON.stringify({ _type: 'capacites-bibliotheque-perso', data: [] }, null, 2))
  await flushAllSaves()
}
