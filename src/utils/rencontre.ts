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
