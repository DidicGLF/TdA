import type { Difficulte, RencontreData } from '../types/gameData'

// Coût PA d'un NC donné (null = sentinelle "aucune créature", coût 0)
export function getPAPourNC(data: RencontreData, nc: number | null): number {
  const entry = data.ncPA.find(e => e.nc === nc)
  return entry?.pa ?? 0
}

// Budget PA d'une rencontre pour un groupe donné, au prorata du nombre de PJ (référence : groupe de 4)
export function getBudgetPA(data: RencontreData, niveauMoyen: number, difficulte: Difficulte, nombrePJs: number): number {
  const ligne = data.coutPA.find(e => e.niveau === niveauMoyen)
  if (!ligne) return 0
  return ligne[difficulte] * (nombrePJs / 4)
}

// Nombre de créatures de groupe qui rentrent dans le budget restant après déduction du chef
export function getNombreCreatures(data: RencontreData, budgetTotal: number, ncChef: number | null, ncGroupe: number): number {
  const paGroupe = getPAPourNC(data, ncGroupe)
  if (paGroupe <= 0) return 0
  return (budgetTotal - getPAPourNC(data, ncChef)) / paGroupe
}

// NC réel (hors sentinelle "-") dont le coût PA est le plus proche du budget donné, sans le dépasser.
// Si même le NC le plus faible dépasse le budget, on renvoie ce NC le plus faible (plancher).
export function getNCPourBudget(data: RencontreData, budget: number): number {
  const reels = data.ncPA.filter((e): e is { nc: number; pa: number } => e.nc !== null)
  const eligibles = reels.filter(e => e.pa <= budget)
  if (eligibles.length === 0) return reels[0]?.nc ?? 0
  return eligibles.reduce((best, e) => (e.pa > best.pa ? e : best)).nc
}

// Répartit le budget restant (après déduction des NC fixés manuellement) à parts égales entre
// les adversaires non fixés, et convertit chaque part en NC le plus proche.
export function distribuerNC(
  data: RencontreData,
  slots: { nc: number; manuel: boolean }[],
  budgetTotal: number,
): number[] {
  const budgetFixe = slots.filter(s => s.manuel).reduce((somme, s) => somme + getPAPourNC(data, s.nc), 0)
  const nbAuto = slots.filter(s => !s.manuel).length
  const budgetRestant = budgetTotal - budgetFixe
  const budgetParAuto = nbAuto > 0 ? budgetRestant / nbAuto : 0
  return slots.map(s => s.manuel ? s.nc : getNCPourBudget(data, budgetParAuto))
}
