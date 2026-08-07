// Missions de compagnie (Chroniques des Terres mortes, p.5-6 : une mission type rapporte en moyenne
// 100-150 points de renommée, davantage si plusieurs objectifs sont atteints ; un échec isolé n'en fait
// pas perdre, seuls des échecs répétés ou catastrophiques le pourraient — laissé à l'appréciation du MJ
// via l'ajustement manuel de renommée déjà existant dans CompagnieTab.tsx, pas automatisé ici).
// Créées et gérées côté MJ (voir MissionsTab.tsx), diffusées aux PJ via l'onglet Compagnie
// (CharacterCompagnieTab.tsx) et le réseau local (voir reseauProtocole.ts).

export type TypeMission = 'combat' | 'escorte' | 'sauvetage' | 'exploration' | 'diplomatie' | 'infiltration' | 'autre'
export const TYPES_MISSION: TypeMission[] = ['combat', 'escorte', 'sauvetage', 'exploration', 'diplomatie', 'infiltration', 'autre']

export type StatutMission = 'proposee' | 'enCours' | 'reussie' | 'echouee'

// Couleur par statut de mission — partagée entre CompagnieTab.tsx (MJ) et CharacterCompagnieTab.tsx
// (PJ, version réduite d'une mission résolue).
export const COULEUR_STATUT: Record<StatutMission, string> = {
  proposee: 'rgba(245,236,215,0.5)',
  enCours: 'rgba(160,120,255,0.9)',
  reussie: 'rgba(120,220,140,0.9)',
  echouee: 'rgba(230,110,110,0.9)',
}

// Couleur d'accent par type de mission — partagée entre la modale de mission (Mode de jeu), les cartes
// MJ (CompagnieTab.tsx) et les cartes PJ (CharacterCompagnieTab.tsx), pour un code visuel cohérent
// partout où une mission s'affiche. Volontairement distinctes des couleurs de statut déjà en place
// (COULEUR_STATUT dans CompagnieTab.tsx : violet enCours, vert reussie, rouge corail echouee) pour
// éviter toute confusion entre les deux informations sur une même carte.
export const COULEUR_TYPE_MISSION: Record<TypeMission, string> = {
  combat: '#c1524a',
  escorte: '#5b8dbd',
  sauvetage: '#7fae6a',
  exploration: '#4fa3b0',
  diplomatie: '#b07fae',
  infiltration: '#6b7a99',
  autre: '#a08e6b',
}

export interface ButMission {
  id: string
  texte: string
}

export interface MissionCompagnie {
  id: string
  // Compagnie propriétaire (voir utils/compagnie.ts) — nécessaire depuis que plusieurs compagnies
  // coexistent : missionId seul ne suffit plus à retrouver la mission sans parcourir toutes les
  // compagnies, et le réseau (reseauProtocole.ts) doit savoir à quelle compagnie router chaque message.
  compagnieId: string
  nom: string
  description: string
  type: TypeMission
  nombreParticipants: number
  recompenseRenommee: number
  // Clé imageStore (voir utils/imageStore.ts::importerImage/useImage), jamais une dataURL brute stockée
  // directement — même règle que partout ailleurs dans l'appli où une image est attachée à une fiche.
  illustration?: string
  buts: ButMission[]
  // Noms de personnages (comme MembreCompagnie.nom), pas des idPJ : la résolution en identité réseau
  // (idPJ) ne se fait qu'au moment de l'envoi, via le roster des joueurs actuellement connectés — voir
  // ReseauTab.tsx. Un volontaire non connecté reste listé ici sans que rien ne casse.
  volontaires: string[]
  statut: StatutMission
  creeLe: string
  modifieLe: string
}

export const MISSION_VIDE = (compagnieId: string): MissionCompagnie => ({
  id: crypto.randomUUID(),
  compagnieId,
  nom: '',
  description: '',
  type: 'autre',
  nombreParticipants: 1,
  recompenseRenommee: 0,
  illustration: undefined,
  buts: [],
  volontaires: [],
  statut: 'proposee',
  creeLe: new Date().toISOString(),
  modifieLe: new Date().toISOString(),
})

// Un PJ peut se porter volontaire tant que la mission n'est pas déjà lancée/résolue, qu'il n'y figure
// pas déjà et que les emplacements ne sont pas tous pris.
export function peutSePorterVolontaire(mission: MissionCompagnie, nom: string): boolean {
  if (mission.statut !== 'proposee') return false
  if (mission.volontaires.some(v => v.toLowerCase() === nom.toLowerCase())) return false
  return mission.volontaires.length < mission.nombreParticipants
}

// Identifiant de la mission à afficher en taille normale quand il y en a plusieurs (les autres en
// réduit) — partagé entre CompagnieTab.tsx (MJ) et CharacterCompagnieTab.tsx (PJ) pour un comportement
// cohérent des deux côtés. Priorité à celle en cours, sinon la dernière saisie (fin de liste) parmi
// celles pas encore lancées — les missions résolues (réussie/échouée) ne sont jamais mises en avant.
export function missionMiseEnAvant(missions: MissionCompagnie[]): string | null {
  const candidates = missions.filter(m => m.statut !== 'reussie' && m.statut !== 'echouee')
  return (candidates.find(m => m.statut === 'enCours') ?? candidates[candidates.length - 1])?.id ?? null
}
