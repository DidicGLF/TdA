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
// Le terrain protège une position précise du champ de bataille, pas la bataille entière : une
// barricade légère "tenant le rang" et une muraille "en retrait" peuvent coexister. Première ligne
// (au contact) et arrière (hors défense) n'ont jamais de terrain — seules les deux positions
// intermédiaires en ont un, voir terrainPourPosition().
export type TerrainParPosition = {
  tenirLeRang: TerrainBataille
  enRetrait: TerrainBataille
}
export function terrainPourPosition(t: TerrainParPosition, position: PositionBataille): TerrainBataille {
  if (position === 'tenirLeRang') return t.tenirLeRang
  if (position === 'enRetrait') return t.enRetrait
  return 'aucun'
}
export type DeAdversite = 3 | 4 | 6 | 8 | 10 | 12

export const DES_ADVERSITE: DeAdversite[] = [3, 4, 6, 8, 10, 12]

// Taille d'armée (1 à 5) déduite de l'ordre de grandeur du nombre de combattants engagés (table du
// livre, p.17) : 1 = quelques dizaines, 2 = quelques centaines, 3 = quelques milliers, 4 = quelques
// dizaines de milliers, 5 = plus de cent mille.
export function tailleDepuisNombreUnites(nombreUnites: number): number {
  if (nombreUnites >= 100000) return 5
  if (nombreUnites >= 10000) return 4
  if (nombreUnites >= 1000) return 3
  if (nombreUnites >= 100) return 2
  return 1
}

// Modificateur de DM pour intensité impaire (table "Mod. de DM" du livre), indexé par dé d'adversité.
const MOD_DM: Record<DeAdversite, number> = { 3: 1, 4: 1, 6: 2, 8: 2, 10: 3, 12: 3 }

// Le jet d'attaque est fait physiquement par le joueur (pas par l'app) : le MJ se contente de
// constater lequel des 4 états du livre s'applique et de le reporter ici.
export type EtatAttaque = 'critiqueReussite' | 'reussite' | 'echec' | 'critiqueEchec'

// Effet sur les succès cumulés pour chacun des 4 états (voir le commentaire de appliquerResultatAttaque
// ci-dessous) — exposé pour l'affichage (PionCard) sans dupliquer les valeurs.
const DELTA_SUCCES: Record<EtatAttaque, number> = {
  critiqueReussite: 2, reussite: 1, echec: 0, critiqueEchec: -1,
}

export function deltaSuccesAttaque(etat: EtatAttaque): number {
  return DELTA_SUCCES[etat]
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
  // Un pion n'attaque qu'une fois par tour (pas optionnel, contrairement à aRecupereCeTour ci-dessus) —
  // verrouille les 4 boutons d'état d'attaque une fois l'un d'eux cliqué, réinitialisé par tourSuivant().
  aAttaqueCeTour: boolean
  dernierEtatAttaque: EtatAttaque | null
  dernierTestDefense: ResultatTestDefense | null
}

// Effet appliqué à la bataille selon l'issue (succès/échec) d'un événement — un seul par issue (pas de
// cumul), le MJ choisit son type à la création de l'événement :
// - 'points' : ajuste les points de bataille (comme les +/- manuels de l'en-tête).
// - 'intensite' : ajuste l'intensité (plafonnée à [0, 10], comme partout ailleurs dans ce fichier).
// - 'soins' : soigne (ou blesse, si valeur négative) TOUS les pions engagés du montant indiqué, chacun
//   plafonné à son pvMax — échelle d'un événement de bataille de masse (renforts, soins de campagne...),
//   pas un soin ciblé sur un seul PJ.
export type TypeEffetEvenement = 'points' | 'intensite' | 'soins'
export type EffetEvenement = { type: TypeEffetEvenement; valeur: number }

// Un événement de bataille est soit un combat (renvoie vers une rencontre déjà créée et sauvegardée
// dans le générateur d'adversité — voir RencontreSauvegardee dans types/gameData.ts, résolue par son
// id plutôt que dupliquée ici), soit une action narrative libre (nom + description saisis par le MJ).
// Cycle de vie d'une carte pendant une bataille active (système de cartes, voir jouerEvenement/
// retirerEvenementDeJeu/appliquerResultatEvenement) : en réserve (enJeu=false, resultat=null, dans le
// menu) → en jeu (enJeu=true, resultat=null, posée sur le panneau de bataille) → résolue (resultat
// non-null, figé, de retour dans le menu avec sa mention). effetSucces/effetEchec sont définis par le
// MJ à la création de l'événement (pas de valeur fixe imposée par le système), appliqués selon l'issue
// choisie lors de la résolution — voir EffetEvenement ci-dessus.
export type EvenementBataille = {
  id: string
  resultat: 'succes' | 'echec' | null
  enJeu: boolean
  effetSucces: EffetEvenement
  effetEchec: EffetEvenement
} & (
  | { type: 'combat'; rencontreId: string }
  | { type: 'narratif'; nom: string; description: string }
)

// Compatibilité avec les sauvegardes/gabarits déjà sur le disque des MJ d'avant le système d'effets
// configurables : ceux-ci stockent pointsSucces/pointsEchec au lieu d'effetSucces/effetEchec, et n'ont
// pas de champ enJeu. À appeler sur chaque événement lu depuis un fichier (voir GameDataContext) pour
// ramener les deux formes au même type — les événements déjà au nouveau format traversent inchangés.
export function normaliserEvenement(e: EvenementBataille & { pointsSucces?: number; pointsEchec?: number }): EvenementBataille {
  return {
    ...e,
    enJeu: e.enJeu ?? false,
    effetSucces: e.effetSucces ?? { type: 'points', valeur: e.pointsSucces ?? 0 },
    effetEchec: e.effetEchec ?? { type: 'points', valeur: e.pointsEchec ?? 0 },
  }
}

export type BatailleSession = {
  nom: string
  tailleArmeePJ: number        // 1 à 5
  tailleArmeeEnnemie: number   // 1 à 5
  adversite: DeAdversite
  defEnnemieMoyenne: number    // profil type ennemi, saisi par le MJ
  bonusAtqEnnemiMoyen: number  // idem
  terrainParPosition: TerrainParPosition
  intensite: number            // 0 à 10 — 0 = victoire automatique (voir victoireAtteinte)
  succesCumules: number        // vers le seuil = tailleArmeeEnnemie × nb de pions
  pointsBataille: number       // ajustés manuellement par le MJ (résolution d'événements)
  // Condition de victoire alternative, en plus de l'intensité à 0 (toujours active) : null = désactivée,
  // sinon le nombre de points de bataille à atteindre pour gagner sans avoir à réduire l'intensité.
  seuilVictoirePoints: number | null
  evenements: EvenementBataille[]
  tour: number
  limiterRecuperation: boolean
  pions: PionPJ[]
}

// Victoire : l'intensité réduite à 0 gagne toujours la bataille, quoi qu'il arrive par ailleurs ; le
// seuil de points de bataille (s'il est activé) est une voie de victoire additionnelle — on peut donc
// gagner bien avant que l'intensité n'atteigne 0 si ce seuil est atteint en premier.
export function victoireAtteinte(session: BatailleSession): boolean {
  return session.intensite <= 0
    || (session.seuilVictoirePoints !== null && session.pointsBataille >= session.seuilVictoirePoints)
}

// Instantané persistable, même principe que CombatSessionSauvegardee dans combat.ts.
export type BatailleSessionSauvegardee = BatailleSession & { id: string; creeLe: string }

// Configuration de bataille réutilisable — même principe que RencontreSauvegardee (gameData.ts) : les
// paramètres du constructeur (avant de lancer), pas un état de combat en cours. Se distingue de
// BatailleSessionSauvegardee (instantané figé d'une bataille déjà lancée, tour/succès/PV compris) —
// un gabarit se recharge dans le constructeur pour être modifié, ou lance une bataille toute fraîche.
export type BatailleTemplate = {
  id: string
  nom: string
  nombreUnitesArmeePJ: number
  nombreUnitesArmeeEnnemie: number
  creatureTypeNom: string          // '' si saisie manuelle (voir selectionnerCreatureType dans BatailleTab)
  adversite: DeAdversite
  defEnnemieMoyenne: number
  bonusAtqEnnemiMoyen: number
  terrainParPosition: TerrainParPosition
  intensiteDepart: number
  seuilVictoirePoints: number | null  // voir BatailleSession.seuilVictoirePoints
  evenements: EvenementBataille[]
  limiterRecuperation: boolean
  pions: PionPJ[]                  // PJ importés, à l'état frais (pvActuels = pvMax, aucun test encore fait)
  creeLe: string
}

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
    aAttaqueCeTour: false,
    dernierEtatAttaque: null,
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
  terrainParPosition: TerrainParPosition
  intensite: number
  seuilVictoirePoints: number | null
  evenements: EvenementBataille[]
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

export function bonusAttaque(pion: PionPJ): number {
  return pion.typeAttaque === 'contact' ? pion.bonusContact
    : pion.typeAttaque === 'distance' ? pion.bonusDistance
    : pion.bonusMagique
}

// Bonus/malus lié à la position (source unique de vérité pour testerAttaque/testerDefense ci-dessous
// ET pour son affichage dans PionCard) : la première ligne facilite l'attaque (+5 pour toucher) mais
// expose davantage en défense (-1, plus de DM subis) ; en retrait fait l'inverse (-5 pour toucher,
// +1 en défense, moins de DM subis). Neutre en tenant le rang ou à l'arrière.
export function bonusPosition(position: PositionBataille): { atq: number; def: number } {
  if (position === 'premiereLigne') return { atq: 5, def: -1 }
  if (position === 'enRetrait') return { atq: -5, def: 1 }
  return { atq: 0, def: 0 }
}

// Le jet d'attaque (d20 + bonus vs DEF ennemie moyenne, ajustée ±5 selon la position) est fait à la
// table par le joueur, pas par l'app — le MJ indique juste lequel des 4 états du livre s'est produit
// (nat 20 = réussite critique +2 succès, nat 1 = échec critique -1, réussite normale +1, échec 0).
export function appliquerResultatAttaque(session: BatailleSession, pionId: string, etat: EtatAttaque): BatailleSession {
  const pion = session.pions.find(p => p.id === pionId)
  if (!pion) throw new Error('Pion introuvable')

  let succesCumules = Math.max(0, session.succesCumules + DELTA_SUCCES[etat])
  let intensite = session.intensite
  const seuil = seuilSucces(session)
  if (seuil > 0 && succesCumules >= seuil) {
    succesCumules -= seuil
    intensite = Math.max(0, intensite - 1)
  }

  const pions = session.pions.map(p => p.id === pionId ? { ...p, dernierEtatAttaque: etat, aAttaqueCeTour: true } : p)
  return { ...session, succesCumules, intensite, pions }
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

  const modPosition = -bonusPosition(pion.position).def
  const modTaille = session.tailleArmeeEnnemie - session.tailleArmeePJ
  const terrainPion = terrainPourPosition(session.terrainParPosition, pion.position)
  const modTerrain = terrainPion === 'leger' ? -1 : terrainPion === 'lourd' ? -2 : 0
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

// Fait passer une carte événement de la réserve (menu) à la zone de jeu du panneau de bataille — sans
// effet si elle est déjà résolue. Plusieurs cartes peuvent être en jeu simultanément.
export function jouerEvenement(session: BatailleSession, evenementId: string): BatailleSession {
  const evenement = session.evenements.find(e => e.id === evenementId)
  if (!evenement || evenement.resultat !== null) return session
  return { ...session, evenements: session.evenements.map(e => e.id === evenementId ? { ...e, enJeu: true } : e) }
}

// Retire une carte de la zone de jeu sans la résoudre (retour à la réserve dans le menu) — rattrape un
// "jouer" déclenché par erreur, tant que le résultat n'a pas encore été tranché.
export function retirerEvenementDeJeu(session: BatailleSession, evenementId: string): BatailleSession {
  const evenement = session.evenements.find(e => e.id === evenementId)
  if (!evenement || evenement.resultat !== null) return session
  return { ...session, evenements: session.evenements.map(e => e.id === evenementId ? { ...e, enJeu: false } : e) }
}

// Résolution d'un événement sur le champ de bataille : applique l'effet défini par le MJ à la création
// de l'événement pour l'issue choisie (effetSucces/effetEchec, voir EvenementBataille et EffetEvenement
// ci-dessus) — pas de valeur ni de type fixe imposé ici. Fige le résultat sur l'événement (pas de
// re-résolution) et la fait sortir de la zone de jeu (retour dans le menu, avec sa mention résolue).
export function appliquerResultatEvenement(
  session: BatailleSession, evenementId: string, resultat: 'succes' | 'echec',
): BatailleSession {
  const evenement = session.evenements.find(e => e.id === evenementId)
  if (!evenement) return session
  const evenements = session.evenements.map(e => e.id === evenementId ? { ...e, resultat, enJeu: false } : e)
  const effet = resultat === 'succes' ? evenement.effetSucces : evenement.effetEchec
  if (effet.type === 'points') {
    return { ...session, evenements, pointsBataille: session.pointsBataille + effet.valeur }
  }
  if (effet.type === 'intensite') {
    return { ...session, evenements, intensite: Math.max(0, Math.min(10, session.intensite + effet.valeur)) }
  }
  const pions = session.pions.map(p => ({ ...p, pvActuels: Math.max(0, Math.min(p.pvMax, p.pvActuels + effet.valeur)) }))
  return { ...session, evenements, pions }
}

export function tourSuivant(session: BatailleSession): BatailleSession {
  return {
    ...session, tour: session.tour + 1,
    pions: session.pions.map(p => ({ ...p, aRecupereCeTour: false, aAttaqueCeTour: false })),
  }
}
