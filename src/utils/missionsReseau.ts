// Logique de traitement des messages réseau liés aux missions (mission-volontaire/message-mission),
// partagée entre CompagnieTab.tsx et ReseauTab.tsx — chacun garde son propre abonnement ecouterReseau
// indépendant (architecture établie, aucun listener partagé au niveau de GMDashboard.tsx), mais délègue
// le calcul ici plutôt que de le dupliquer intégralement. Depuis le passage à plusieurs compagnies, une
// mission doit être retrouvée à travers TOUTES les compagnies connues (pas seulement celle affichée à
// l'écran) — un volontariat peut arriver pendant que le MJ regarde une autre compagnie.

import type { Compagnie } from './compagnie'
import type { MissionCompagnie } from './missions'
import { peutSePorterVolontaire } from './missions'

export function trouverMission(
  compagnies: Compagnie[], compagnieId: string, missionId: string,
): { compagnie: Compagnie; mission: MissionCompagnie } | null {
  const compagnie = compagnies.find(c => c.id === compagnieId)
  if (!compagnie) return null
  const mission = compagnie.missions.find(m => m.id === missionId)
  if (!mission) return null
  return { compagnie, mission }
}

// Traite un volontariat reçu par réseau : si accepté (voir peutSePorterVolontaire), retourne le tableau
// de compagnies mis à jour (état local ET rediffusion ciblée) ainsi que la liste de missions de cette
// compagnie — null si refusé ou introuvable, auquel cas l'appelant ne fait rien.
export function traiterVolontariat(
  compagnies: Compagnie[], compagnieId: string, missionId: string, nomVolontaire: string,
): { compagnies: Compagnie[]; missions: MissionCompagnie[] } | null {
  const trouve = trouverMission(compagnies, compagnieId, missionId)
  if (!trouve || !peutSePorterVolontaire(trouve.mission, nomVolontaire)) return null
  const maintenant = new Date().toISOString()
  const missions = trouve.compagnie.missions.map(m =>
    m.id === missionId ? { ...m, volontaires: [...m.volontaires, nomVolontaire], modifieLe: maintenant } : m
  )
  const compagniesMaj = compagnies.map(c => (c.id === compagnieId ? { ...c, missions, modifieLe: maintenant } : c))
  return { compagnies: compagniesMaj, missions }
}

// Connexions ACTUELLEMENT connectées des volontaires d'une mission (pour relayer un message de
// dialogue), en excluant l'expéditeur — identites vient de chaque écoute réseau indépendante (voir
// identitesRef dans CompagnieTab.tsx/ReseauTab.tsx, chacune maintient la sienne).
export function resoudreDestinatairesMission(
  mission: MissionCompagnie, identites: Record<number, { nom: string; idPJ: string }>, expediteurId: number,
): number[] {
  const volontairesMinuscule = new Set(mission.volontaires.map(v => v.toLowerCase()))
  return Object.entries(identites)
    .filter(([idStr, identite]) => Number(idStr) !== expediteurId && volontairesMinuscule.has(identite.nom.toLowerCase()))
    .map(([idStr]) => Number(idStr))
}
