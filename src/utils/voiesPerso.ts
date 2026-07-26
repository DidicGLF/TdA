// Séparation du catalogue de voies livré (lecture seule) et des ajouts de l'utilisateur — même
// principe que le bestiaire (voir bestiairePerso.ts), appliqué à deux fichiers distincts qui décrivent
// ensemble une « voie » :
//   voies.json        le catalogue (nom, famille, catégorie) — VOIES_LIVRE / VoieEntry[]
//   descriptions.json le contenu des rangs (nom+desc de chaque rang), indexé par nom — DESCRIPTIONS_LIVRE
//                      / DescMap. Ce fichier sert aussi aux voies de peuple/culture (peuples.json),
//                      qu'on protège donc au passage, sans logique séparée : la clé (le nom) est déjà
//                      un identifiant unique, contrairement au bestiaire, pas besoin de composer avec un NC.
//
// hidden-voies.json a une particularité propre à ce contenu : contrairement au bestiaire (où masquer
// est réservé à l'utilisateur, sans mot de passe), ici masquer une voie est déjà possible SANS mot de
// passe, mais la démasquer exige de connaître MASQUAGE_MOT_DE_PASSE (elle disparaît de la liste
// sélectionnable dès qu'elle est masquée, y compris pour son propriétaire). Un utilisateur peut donc
// masquer PLUS de voies que le livré n'en masque, mais ne peut pratiquement pas en démasquer une que
// l'auteur avait déjà masquée. Le modèle de fusion couvre quand même les deux sens (ajouts ET retraits),
// au cas où — c'est l'auteur, via ce même mot de passe, qui exerce le retrait en pratique.
import { queueSave, flushAllSaves } from './saveManager'
import { empreinte } from './empreinte'
import type { DescMap, VoieEntry } from '../types/gameData'

// ─── Catalogue (voies.json) ─────────────────────────────────────────────────────────────────────

/** Ce que l'utilisateur voit : livré + ses ajouts, une surcharge perso remplaçant l'entrée livrée de
 *  même nom (les noms sont déjà uniques dans voies.json, aucune ambiguïté à lever). */
export function fusionnerVoies(livre: VoieEntry[], perso: VoieEntry[]): VoieEntry[] {
  const surcharges = new Map(perso.map(v => [v.nom, v]))
  const clesLivre = new Set(livre.map(v => v.nom))
  const fusion = livre.map(v => surcharges.get(v.nom) ?? v)
  for (const v of perso) if (!clesLivre.has(v.nom)) fusion.push(v)
  return fusion
}

/** Migration unique : compare l'ancien voies.json de l'utilisateur au livré et n'en garde que les
 *  écarts (ajouts ou entrées réellement différentes) — le reste continuera de suivre les mises à jour. */
export function migrerVoiesPerso(ancien: VoieEntry[], livre: VoieEntry[]): VoieEntry[] {
  const parNom = new Map(livre.map(v => [v.nom, v]))
  const perso: VoieEntry[] = []
  for (const v of ancien) {
    const l = parNom.get(v.nom)
    if (!l || empreinte(v) !== empreinte(l)) perso.push(v)
  }
  return perso
}

/** Recalcule la surcharge perso d'un catalogue à partir de son état affiché complet (livré+perso) —
 *  utilisé par le setter générique côté contexte : n'importe quelle fonction de l'éditeur peut continuer
 *  à faire `setVoies(prev => ...)` sur la liste FUSIONNÉE, sans savoir où atterrit le résultat. */
export function extraireSurchargesVoies(next: VoieEntry[], livre: VoieEntry[]): VoieEntry[] {
  const parNom = new Map(livre.map(v => [v.nom, v]))
  const perso: VoieEntry[] = []
  for (const v of next) {
    const l = parNom.get(v.nom)
    if (!l || empreinte(v) !== empreinte(l)) perso.push(v)
  }
  return perso
}

// ─── Contenu des rangs (descriptions.json) ──────────────────────────────────────────────────────

export function fusionnerDescriptions(livre: DescMap, perso: DescMap): DescMap {
  return { ...livre, ...perso }
}

export function migrerDescriptionsPerso(ancien: DescMap, livre: DescMap): DescMap {
  const perso: DescMap = {}
  for (const nom of Object.keys(ancien)) {
    const l = livre[nom]
    if (!l || empreinte(ancien[nom]) !== empreinte(l)) perso[nom] = ancien[nom]
  }
  return perso
}

/** Même principe que extraireSurchargesVoies, pour le DescMap. Une clé du livré absente de `next`
 *  (rang supprimé) n'est PAS traitée ici — la suppression d'une entrée livrée passe par le masquage
 *  (voir hidden-voies), jamais par une réécriture de descriptions.json ; les fonctions qui suppriment
 *  réellement une entrée (removeVoie/renameVoie) doivent donc écrire directement dans le perso plutôt
 *  que de transiter par ce setter générique. */
export function extraireSurchargesDescriptions(next: DescMap, livre: DescMap): DescMap {
  const perso: DescMap = {}
  for (const nom of Object.keys(next)) {
    const l = livre[nom]
    if (!l || empreinte(next[nom]) !== empreinte(l)) perso[nom] = next[nom]
  }
  return perso
}

// ─── Masquage (hidden-voies.json) : ajouts ET retraits par rapport au livré ─────────────────────

export function fusionnerHiddenVoies(livre: string[], ajouts: string[], retraits: string[]): string[] {
  const retraitSet = new Set(retraits)
  return [...new Set([...livre, ...ajouts])].filter(n => !retraitSet.has(n))
}

export function migrerHiddenVoiesPerso(ancien: string[], livre: string[]): { ajouts: string[]; retraits: string[] } {
  const livreSet = new Set(livre)
  const ancienSet = new Set(ancien)
  return {
    ajouts: ancien.filter(n => !livreSet.has(n)),
    retraits: livre.filter(n => !ancienSet.has(n)),
  }
}

/** Décompose une prochaine valeur affichée (ce que produirait `setHiddenVoies(updater)`) en ajouts et
 *  retraits par rapport au livré — permet à l'éditeur de continuer à traiter `hiddenVoies` comme un
 *  simple tableau qu'on toggle, sans savoir qu'il est en réalité composé de deux fichiers. */
export function deriverAjoutsRetraits(next: string[], livre: string[]): { ajouts: string[]; retraits: string[] } {
  return migrerHiddenVoiesPerso(next, livre)
}

/** Publie l'état affiché comme nouveau contenu livré (bouton auteur « Enregistrer dans le projet »,
 *  déjà existant dans DescriptionsEditor pour tous les catalogues) : les trois fichiers perso liés aux
 *  voies repartent à vide, puisque ce qu'ils contenaient EST désormais le livré. Écrit sans attendre
 *  le debounce, l'appelant rechargeant la page dans la foulée. */
export async function publierVoiesLivre(): Promise<void> {
  queueSave('voies-perso.json', JSON.stringify({ _type: 'voies-perso', data: [] }, null, 2))
  queueSave('descriptions-perso.json', JSON.stringify({ _type: 'descriptions-perso', data: {} }, null, 2))
  queueSave('hidden-voies-perso.json', JSON.stringify({ _type: 'hidden-voies-perso', data: { ajouts: [], retraits: [] } }, null, 2))
  await flushAllSaves()
}
