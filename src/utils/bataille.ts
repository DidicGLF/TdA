// Système de gestion de bataille de masse (voir Chroniques des Terres Mortes, p.17-23) : chaque PJ
// choisit une position par tour, subit des dégâts calculés automatiquement selon l'intensité de la
// bataille, et peut la faire baisser via des tests d'attaque cumulés. Miroir de combat.ts (mêmes
// conventions : session en mémoire côté composant, instantané "Sauvegardee" pour la persistance).
import type { Character } from '../types/character'
import type { DescMap } from '../types/gameData'
import { computeCombatStatsPJ } from './computeEffects'

export type PositionBataille = 'premiereLigne' | 'tenirLeRang' | 'enRetrait' | 'arriere'
export type TypeAttaque = 'contact' | 'distance' | 'magique'
// "Léger" couvre à la fois une fortification légère (barricade, palissade) et une position avantageuse
// (colline) — "lourd" une fortification lourde (muraille, bâtiment) ou une position extrêmement
// avantageuse (falaise) : le livre donne le même modificateur (-1/-2) aux deux cas de chaque paire.
export type TerrainBataille = 'aucun' | 'leger' | 'lourd'
export type DeAdversite = 3 | 4 | 6 | 8 | 10 | 12

export const DES_ADVERSITE: DeAdversite[] = [3, 4, 6, 8, 10, 12]

// Modificateur de DM pour intensité impaire (table "Mod. de DM" du livre), indexé par dé d'adversité.
const MOD_DM: Record<DeAdversite, number> = { 3: 1, 4: 1, 6: 2, 8: 2, 10: 3, 12: 3 }

export type ResultatTestAttaque = {
  jet: number
  bonus: number
  total: number
  difficulte: number
  critique: 'reussite' | 'echec' | null
  reussite: boolean
  deltaSucces: number
}

export type ResultatTestDefense = {
  jet: number
  bonus: number
  total: number
  difficulte: number
  critique: 'reussite' | 'echec' | null
  reussite: boolean
  modIntensite: number
  intensiteModifiee: number
  detailDes: number[]
  dm: number
}

export type PionPJ = {
  id: string
  nom: string
  def: number
  bonusContact: number
  bonusDistance: number
  bonusMagique: number
  typeAttaque: TypeAttaque
  position: PositionBataille
  pvActuels: number
  pvMax: number
  pointsRecuperationActuels: number
  pointsRecuperationMax: number
  // Limite optionnelle (case à cocher de la session) à 1 utilisation de point de récupération par
  // tour passé à l'arrière — réinitialisé par tourSuivant().
  aRecupereCeTour: boolean
  dernierTestAttaque: ResultatTestAttaque | null
  dernierTestDefense: ResultatTestDefense | null
}

export type BatailleSession = {
  nom: string
  tailleArmeePJ: number        // 1 à 5
  tailleArmeeEnnemie: number   // 1 à 5
  adversite: DeAdversite
  defEnnemieMoyenne: number    // profil type ennemi, saisi par le MJ
  bonusAtqEnnemiMoyen: number  // idem
  terrain: TerrainBataille
  intensite: number            // 1 à 10, plancher 1
  succesCumules: number        // vers le seuil = tailleArmeeEnnemie × nb de pions
  pointsBataille: number       // ajustés manuellement par le MJ (résolution d'événements)
  tour: number
  limiterRecuperation: boolean
  pions: PionPJ[]
}

// Instantané persistable, même principe que CombatSessionSauvegardee dans combat.ts.
export type BatailleSessionSauvegardee = BatailleSession & { id: string; creeLe: string }

function rollD20(): number {
  return Math.floor(Math.random() * 20) + 1
}

function rollDice(nb: number, sides: number): number[] {
  return Array.from({ length: nb }, () => Math.floor(Math.random() * sides) + 1)
}

// Snapshot d'un PJ importé (fiche exportée par l'app) en pion de bataille : DEF via computeCombatStatsPJ
// (déjà tenu à jour par les effets de voies/cristaux), bonus d'attaque bruts de la fiche (contact/
// distance/magique) — pas de recalcul via armes/armures pour l'instant, voir le plan pour la suite.
// Le type d'attaque par défaut est celui du plus haut des trois bonus (style de combat privilégié).
export function importerPionPJ(character: Character, descriptions: DescMap): PionPJ {
  const { pvTotal, def } = computeCombatStatsPJ(character, descriptions)
  const bonusContact = character.attaqueContact ?? 0
  const bonusDistance = character.attaqueDistance ?? 0
  const bonusMagique = character.attaqueMagique ?? 0
  const typeAttaque: TypeAttaque =
    bonusContact >= bonusDistance && bonusContact >= bonusMagique ? 'contact'
      : bonusDistance >= bonusMagique ? 'distance' : 'magique'
  return {
    id: `pion-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    nom: character.nomPersonnage,
    def, bonusContact, bonusDistance, bonusMagique, typeAttaque,
    position: 'tenirLeRang',
    pvActuels: character.pvRestants ?? pvTotal,
    pvMax: pvTotal,
    pointsRecuperationActuels: 3,
    pointsRecuperationMax: 3,
    aRecupereCeTour: false,
    dernierTestAttaque: null,
    dernierTestDefense: null,
  }
}

export function creerBataille(params: {
  nom: string
  tailleArmeePJ: number
  tailleArmeeEnnemie: number
  adversite: DeAdversite
  defEnnemieMoyenne: number
  bonusAtqEnnemiMoyen: number
  terrain: TerrainBataille
  intensite: number
  limiterRecuperation: boolean
  pions: PionPJ[]
}): BatailleSession {
  return { ...params, succesCumules: 0, pointsBataille: 0, tour: 1 }
}

// Seuil de succès cumulés (test d'attaque) au bout duquel l'intensité baisse de 1 : [taille de
// l'armée ennemie × nombre de PJ engagés dans la bataille].
export function seuilSucces(session: BatailleSession): number {
  return session.tailleArmeeEnnemie * Math.max(1, session.pions.length)
}

function bonusAttaque(pion: PionPJ): number {
  return pion.typeAttaque === 'contact' ? pion.bonusContact
    : pion.typeAttaque === 'distance' ? pion.bonusDistance
    : pion.bonusMagique
}

// Test d'attaque : d20 + bonus vs DEF ennemie moyenne (ajustée ±5 selon la position). Nat 20 = réussite
// critique (+2 succès), Nat 1 = échec critique (-1, "annule une réussite"), réussite normale = +1.
export function testerAttaque(session: BatailleSession, pion: PionPJ): ResultatTestAttaque {
  const jet = rollD20()
  const bonus = bonusAttaque(pion)
  const total = jet + bonus
  const modPosition = pion.position === 'premiereLigne' ? -5 : pion.position === 'enRetrait' ? 5 : 0
  const difficulte = session.defEnnemieMoyenne + modPosition
  const critique = jet === 20 ? 'reussite' : jet === 1 ? 'echec' : null
  const reussite = total >= difficulte
  const deltaSucces = critique === 'reussite' ? 2 : critique === 'echec' ? -1 : reussite ? 1 : 0
  return { jet, bonus, total, difficulte, critique, reussite, deltaSucces }
}

export function appliquerTestAttaque(session: BatailleSession, pionId: string): { session: BatailleSession; resultat: ResultatTestAttaque } {
  const pion = session.pions.find(p => p.id === pionId)
  if (!pion) throw new Error('Pion introuvable')
  const resultat = testerAttaque(session, pion)

  let succesCumules = Math.max(0, session.succesCumules + resultat.deltaSucces)
  let intensite = session.intensite
  const seuil = seuilSucces(session)
  if (seuil > 0 && succesCumules >= seuil) {
    succesCumules -= seuil
    intensite = Math.max(1, intensite - 1)
  }

  const pions = session.pions.map(p => p.id === pionId ? { ...p, dernierTestAttaque: resultat } : p)
  return { session: { ...session, succesCumules, intensite, pions }, resultat }
}

// Test de défense : d20 + (DEF - 10) vs 10 + bonus ATQ ennemi moyen. Le résultat module l'intensité
// pour CE tour uniquement (pas de report), qui sert ensuite à calculer les DM subis :
// intensité modifiée = intensité + modDéfense + modPosition + (taille ennemie - taille PJ) + modTerrain.
// Positive et paire → (intensité modifiée / 2) dés d'adversité, sans modificateur fixe. Positive et
// impaire, OU égale à zéro → même nombre de dés (arrondi en-dessous) + le modificateur fixe de la
// table "Mod. de DM" (minimum de dégâts même à intensité modifiée nulle). Strictement négative → aucun DM.
export function testerDefense(session: BatailleSession, pion: PionPJ): ResultatTestDefense {
  const jet = rollD20()
  const bonus = pion.def - 10
  const total = jet + bonus
  const difficulte = 10 + session.bonusAtqEnnemiMoyen
  const critique = jet === 20 ? 'reussite' : jet === 1 ? 'echec' : null
  const reussite = total >= difficulte
  const modIntensite = critique === 'reussite' ? -2 : critique === 'echec' ? 1 : reussite ? -1 : 0

  const modPosition = pion.position === 'premiereLigne' ? 1 : pion.position === 'enRetrait' ? -1 : 0
  const modTaille = session.tailleArmeeEnnemie - session.tailleArmeePJ
  const modTerrain = session.terrain === 'leger' ? -1 : session.terrain === 'lourd' ? -2 : 0
  const intensiteModifiee = session.intensite + modIntensite + modPosition + modTaille + modTerrain

  // Seule une intensité modifiée STRICTEMENT négative annule tout DM — à zéro pile, le PJ encaisse
  // quand même le modificateur fixe minimal (vérifié contre les tables de référence MJ "Calcul des DM"
  // pour les 6 dés d'adversité : la ligne "0" y inflige toujours le Mod. de DM, seule la ligne
  // "Négative" tombe à 0 partout).
  let detailDes: number[] = []
  let dm = 0
  if (intensiteModifiee >= 0) {
    const nbDes = Math.floor(intensiteModifiee / 2)
    const positifPair = intensiteModifiee > 0 && intensiteModifiee % 2 === 0
    detailDes = nbDes > 0 ? rollDice(nbDes, session.adversite) : []
    dm = detailDes.reduce((a, b) => a + b, 0) + (positifPair ? 0 : MOD_DM[session.adversite])
  }

  return { jet, bonus, total, difficulte, critique, reussite, modIntensite, intensiteModifiee, detailDes, dm }
}

export function appliquerTestDefense(session: BatailleSession, pionId: string): { session: BatailleSession; resultat: ResultatTestDefense } {
  const pion = session.pions.find(p => p.id === pionId)
  if (!pion) throw new Error('Pion introuvable')
  const resultat = testerDefense(session, pion)
  const pions = session.pions.map(p => p.id === pionId
    ? { ...p, pvActuels: Math.max(0, p.pvActuels - resultat.dm), dernierTestDefense: resultat }
    : p)
  return { session: { ...session, pions }, resultat }
}

// Dépense un point de récupération à l'arrière pour regagner des PV (plafond pvMax) — respecte la
// limite optionnelle d'1 utilisation/tour si activée sur la session (aRecupereCeTour, remis à zéro
// par tourSuivant). Ne fait rien si la réserve est vide ou la limite déjà atteinte.
export function appliquerRecuperation(session: BatailleSession, pionId: string, montant: number): BatailleSession {
  const pion = session.pions.find(p => p.id === pionId)
  if (!pion) return session
  if (pion.pointsRecuperationActuels <= 0) return session
  if (session.limiterRecuperation && pion.aRecupereCeTour) return session
  const pions = session.pions.map(p => p.id === pionId
    ? {
        ...p,
        pvActuels: Math.min(p.pvMax, p.pvActuels + montant),
        pointsRecuperationActuels: p.pointsRecuperationActuels - 1,
        aRecupereCeTour: true,
      }
    : p)
  return { ...session, pions }
}

export function definirPosition(session: BatailleSession, pionId: string, position: PositionBataille): BatailleSession {
  return { ...session, pions: session.pions.map(p => p.id === pionId ? { ...p, position } : p) }
}

export function retirerPion(session: BatailleSession, pionId: string): BatailleSession {
  return { ...session, pions: session.pions.filter(p => p.id !== pionId) }
}

export function ajusterPointsBataille(session: BatailleSession, delta: number): BatailleSession {
  return { ...session, pointsBataille: session.pointsBataille + delta }
}

export function tourSuivant(session: BatailleSession): BatailleSession {
  return { ...session, tour: session.tour + 1, pions: session.pions.map(p => ({ ...p, aRecupereCeTour: false })) }
}
