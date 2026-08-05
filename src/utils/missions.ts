// Missions de compagnie (Chroniques des Terres mortes, p.5-6 : une mission type rapporte en moyenne
// 100-150 points de renommée, davantage si plusieurs objectifs sont atteints ; un échec isolé n'en fait
// pas perdre, seuls des échecs répétés ou catastrophiques le pourraient — laissé à l'appréciation du MJ
// via l'ajustement manuel de renommée déjà existant dans CompagnieTab.tsx, pas automatisé ici).
// Créées et gérées côté MJ (voir MissionsTab.tsx), diffusées aux PJ via l'onglet Compagnie
// (CharacterCompagnieTab.tsx) et le réseau local (voir reseauProtocole.ts).

export type TypeMission = 'combat' | 'escorte' | 'sauvetage' | 'exploration' | 'diplomatie' | 'infiltration' | 'autre'
export const TYPES_MISSION: TypeMission[] = ['combat', 'escorte', 'sauvetage', 'exploration', 'diplomatie', 'infiltration', 'autre']

export type StatutMission = 'proposee' | 'enCours' | 'reussie' | 'echouee'

export interface ButMission {
  id: string
  texte: string
}

export interface MissionCompagnie {
  id: string
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

export const MISSION_VIDE = (): MissionCompagnie => ({
  id: crypto.randomUUID(),
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
