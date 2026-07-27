import type { BestiaireEntry, RencontreSauvegardee, DescMap, StatBuff } from '../types/gameData'
import type { Character } from '../types/character'
import { computeCombatStatsPJ } from './computeEffects'

export type { StatBuff }

export type RollResult = {
  attaqueNom: string
  jetSides?: number         // 20 pour un jet d'attaque
  jetRoll?: number          // valeur brute du d20
  jetModifier?: number
  jetTotal?: number
  degatsSides?: number      // taille du dé de dégâts (ex: 6 pour 4d6+16)
  degatsRollDisplay?: string  // ex: "[3+5+2+6]=16+16"
  degatsTotal?: number
  // Résolution contre une cible assignée (si une cible était définie au moment du jet)
  cibleNom?: string
  toucheRate?: boolean       // jet d'attaque présent et inférieur à la DEF de la cible
  degatsAppliques?: number   // dégâts réellement appliqués à la cible après réduction par sa RD
  rdAppliquee?: number       // RD de la cible utilisée pour ce calcul, conservée pour l'affichage
  cibleDef?: number          // DEF de la cible utilisée pour le test de touche, conservée pour l'affichage
  // Type de dégâts choisi pour une attaque manuelle de PJ (voir handleAttaquePJ) — purement informatif,
  // comme creature.rdTypes : combat.ts n'applique jamais de RD par type, le MJ a déjà tout décidé en
  // choisissant le montant final. '' ou absent = générique.
  typeDegats?: string
}

// Dégâts sur la durée (poison, brûlure, ...) posés par une attaque manuelle de PJ (voir
// handleAjouterDotPJ) — même principe que ActiveDot dans GameModePanel, en plus simple : pas de calcul
// d'immunité/div2/RD par type ici, juste `amount` retiré des PV à chaque tour suivant jusqu'à expiration.
export type DotActif = {
  id: string
  type: string   // '' | un code de DAMAGE_TYPES (voir utils/damageTypes.ts) — juste pour l'icône affichée
  amount: number
  remainingTurns: number
}

export type CombatCreature = {
  id: string
  creature: BestiaireEntry
  pvActuels: number
  aJoueCeTour: boolean
  buffs: StatBuff[]
  expanded: boolean
  dernierResultat: RollResult | null
  cibleId: string | null
  dotsActifs: DotActif[]
  // Renseigné uniquement pour un compagnon dérivé d'un PJ importé (voir compagnonEnCreature dans
  // utils/compagnons.ts) : id du PJ propriétaire — sert à afficher le lien sur la carte et à retirer
  // le compagnon quand son PJ quitte le combat (voir removePJ dans CombatTab).
  pjProprietaireId?: string
}

export type CombatPJ = {
  id: string
  character: Character
  pvActuels: number
  pmActuels: number
  buffs: StatBuff[]
  expanded: boolean
  // Un PJ n'a pas de moteur de jet propre (le MJ gère l'attaque à la main, voir CombatTab) : seuls
  // cibleNom/degatsAppliques sont renseignés, jamais jetTotal/degatsTotal/rdAppliquee — ResultatCartouche
  // s'adapte à cette forme réduite (voir sa propre note).
  dernierResultat: RollResult | null
  cibleId: string | null
  dotsActifs: DotActif[]
}

// Infos normalisées d'une cible potentielle (créature, PJ ou compagnon), pour le sélecteur de ciblage
// et la résolution des dégâts sans que l'appelant ait à distinguer les trois.
// camp : côté du plateau. Sert à colorer les listes de cibles (alliés en vert, adversaires en rouge) du
// point de vue de celui qui agit — un compagnon est allié des PJ, donc camp 'pj' malgré sa forme de
// CombatCreature (voir pjProprietaireId).
// estPJ : true UNIQUEMENT pour un vrai PJ (pas un compagnon, malgré son camp 'pj' identique) — sert à
// resoudreAttaque pour savoir si la RD doit être déduite ici (créature, compagnon : pas de Mode de jeu
// externe, seule source de vérité pour leurs PV) ou laissée au Mode de jeu du PJ (voir plus bas).
export type CombatEntiteInfo = { id: string; nom: string; def: number; rd: number; pvActuels: number; camp: 'creature' | 'pj'; estPJ: boolean }

export function listerEntites(session: CombatSession, descriptions: DescMap): CombatEntiteInfo[] {
  const creatures = session.combatants.map(c => ({
    id: c.id,
    nom: c.creature.nom,
    def: getStatAvecBuff(c.creature.def, c.buffs, 'DEF').value,
    rd: getStatAvecBuff(c.creature.rd, c.buffs, 'RD').value,
    pvActuels: c.pvActuels,
    camp: 'creature' as const,
    estPJ: false,
  }))
  const pjs = session.pjs.map(p => {
    const stats = computeCombatStatsPJ(p.character, descriptions)
    return {
      id: p.id,
      nom: p.character.nomPersonnage,
      def: getStatAvecBuff(stats.def, p.buffs, 'DEF').value,
      rd: getStatAvecBuff(stats.rd, p.buffs, 'RD').value,
      pvActuels: p.pvActuels,
      camp: 'pj' as const,
      estPJ: true,
    }
  })
  const compagnons = session.compagnons.map(c => ({
    id: c.id,
    nom: c.creature.nom,
    def: getStatAvecBuff(c.creature.def, c.buffs, 'DEF').value,
    rd: getStatAvecBuff(c.creature.rd, c.buffs, 'RD').value,
    pvActuels: c.pvActuels,
    camp: 'pj' as const,
    estPJ: false,
  }))
  return [...creatures, ...pjs, ...compagnons]
}

export type CombatSession = {
  nomRencontre: string
  combatants: CombatCreature[]
  pjs: CombatPJ[]
  // Compagnons des PJ importés (voir compagnonEnCreature) : même forme qu'une créature (stats, jet
  // d'attaque propre), mais alliés des PJ — rendus dans la colonne PJ, jamais dans celle des créatures.
  compagnons: CombatCreature[]
  // Part (0 à 1) de la largeur attribuée à la colonne Créatures dans CombatTab — ajustée en glissant
  // la barre de séparation, conservée avec la session pour survivre à un instantané sauvegardé/rechargé.
  splitRatio?: number
}

// Instantané persistable d'une session de combat en cours : mêmes données (créatures présentes,
// PV/buffs/cibles, PJ importés avec les leurs) + un identifiant pour la retrouver et la mettre à
// jour dans la bibliothèque, afin de pouvoir reprendre un combat interrompu.
export type CombatSessionSauvegardee = CombatSession & { id: string; creeLe: string }

// Complète dotsActifs et compagnons (absents des sessions sauvegardées avant leur ajout respectif) —
// à appliquer au chargement depuis le disque, avant tout rendu (CombatCard/PJCard lisent .length/.map
// sans vérifier que les champs existent).
export function normaliserCombatSession<T extends CombatSession>(session: T): T {
  return {
    ...session,
    combatants: session.combatants.map(c => ({ ...c, dotsActifs: c.dotsActifs ?? [] })),
    pjs: session.pjs.map(p => ({ ...p, dotsActifs: p.dotsActifs ?? [] })),
    compagnons: (session.compagnons ?? []).map(c => ({ ...c, dotsActifs: c.dotsActifs ?? [] })),
  }
}

// Construit une session de combat éphémère à partir d'une rencontre enregistrée : copie de travail,
// jamais persistée, jamais réécrite sur la rencontre ou le bestiaire d'origine.
export function demarrerCombat(rencontre: RencontreSauvegardee, bestiaire: BestiaireEntry[]): CombatSession {
  const combatants: CombatCreature[] = []
  rencontre.adversaires.forEach((a, i) => {
    if (!a.creatureNom) return
    // Par (nom, NC) d'abord : le bestiaire contient volontairement plusieurs fiches de même nom à des
    // NC différents (une même base de PNJ déclinée par niveau), et le NC choisi pour ce slot est déjà
    // connu (a.nc) — l'ignorer résoudrait au hasard la première créature de ce nom trouvée, pas
    // forcément celle sélectionnée dans le constructeur de rencontre. Repli sur le nom seul si la
    // fiche exacte a disparu depuis (renommée/NC changé) plutôt que d'abandonner le combattant.
    const creature = bestiaire.find(c => c.nom === a.creatureNom && c.nc === a.nc)
      ?? bestiaire.find(c => c.nom === a.creatureNom)
    if (!creature) return
    combatants.push({
      id: `${i}-${creature.nom}`,
      creature,
      pvActuels: creature.pv ?? 0,
      aJoueCeTour: false,
      buffs: [],
      expanded: false,
      dernierResultat: null,
      cibleId: null,
      dotsActifs: [],
    })
  })
  // Classées par initiative décroissante par défaut — celles sans INIT renseignée passent en dernier
  // plutôt que de casser le tri (undefined traité comme -Infinity).
  combatants.sort((a, b) => (b.creature.init ?? -Infinity) - (a.creature.init ?? -Infinity))
  return { nomRencontre: rencontre.nom, combatants, pjs: [], compagnons: [] }
}

// Importe un personnage joueur (depuis le JSON de sauvegarde de fiche) dans la session de combat.
// PV/PM de départ = ceux de la fiche (pvRestants/pmRestants) si présents, sinon le max calculé —
// on respecte l'état réel du personnage plutôt que de repartir à fond.
export function importPJ(character: Character, descriptions: DescMap): CombatPJ {
  const { pvTotal, pmTotal } = computeCombatStatsPJ(character, descriptions)
  return {
    id: `pj-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    character,
    pvActuels: character.pvRestants ?? pvTotal,
    pmActuels: character.pmRestants ?? pmTotal,
    buffs: [],
    expanded: false,
    dernierResultat: null,
    cibleId: null,
    dotsActifs: [],
  }
}

// Décompte d'un tour pour les DoT actifs d'une créature ou d'un PJ (voir handleAjouterDotPJ dans
// CombatTab) : chaque effet encore actif retire son montant des PV avant que son compteur ne baisse,
// puis les effets expirés (0 tour restant) disparaissent — même ordre que handleEndTurn/activeDots dans
// GameModePanel, en plus simple (pas de RD/div2/immunité par type, montant flat).
export function tickerDots<T extends { pvActuels: number; dotsActifs: DotActif[] }>(entite: T): T {
  if (entite.dotsActifs.length === 0) return entite
  const degats = entite.dotsActifs.reduce((somme, d) => somme + d.amount, 0)
  const dotsRestants = entite.dotsActifs
    .map(d => ({ ...d, remainingTurns: d.remainingTurns - 1 }))
    .filter(d => d.remainingTurns > 0)
  return { ...entite, pvActuels: Math.max(0, entite.pvActuels - degats), dotsActifs: dotsRestants }
}

function parseSigned(s: string | undefined): number {
  if (!s) return 0
  const n = parseInt(s.replace(/\s/g, ''))
  return Number.isNaN(n) ? 0 : n
}

// Lance l'attaque (jet d'attaque si bonus présent, dégâts si dm présent), au même format d'affichage
// (dé + détail du jet + total) que la modale Mode de jeu côté joueur.
export function rollAttaque(nom: string, bonus: string | undefined, dm: string | undefined): RollResult {
  const result: RollResult = { attaqueNom: nom }

  if (bonus) {
    const mod = parseSigned(bonus)
    const d = Math.floor(Math.random() * 20) + 1
    result.jetSides = 20
    result.jetRoll = d
    result.jetModifier = mod
    result.jetTotal = d + mod
  }

  if (dm) {
    const m = dm.match(/(\d*)d(\d+)\s*([+-]\s*\d+)?/i)
    if (m) {
      const nb = Math.max(1, parseInt(m[1] || '1'))
      const sides = parseInt(m[2])
      const mod = m[3] ? parseInt(m[3].replace(/\s/g, '')) : 0
      const rolls = Array.from({ length: nb }, () => Math.floor(Math.random() * sides) + 1)
      const diceTotal = rolls.reduce((a, b) => a + b, 0)
      const modStr = mod !== 0 ? (mod > 0 ? `+${mod}` : String(mod)) : ''
      result.degatsSides = sides
      result.degatsRollDisplay = nb > 1 ? `[${rolls.join('+')}]=${diceTotal}${modStr}` : `${diceTotal}${modStr}`
      result.degatsTotal = diceTotal + mod
    }
  }

  return result
}

// Applique la RD d'une cible à un montant de dégâts déjà connu (utilisé quand aucun jet n'a eu lieu
// ici — attaque d'un PJ résolue à la main par le MJ, voir handleAttaquePJ dans CombatTab.tsx — mais
// suit la même règle que resoudreAttaque ci-dessous : RD déduite pour une créature/un compagnon (seule
// source de vérité pour leurs PV), pas pour un PJ (résolue dans son propre Mode de jeu).
export function appliquerDegatsCible(montant: number, cible: CombatEntiteInfo): { degatsAppliques: number; rdAppliquee?: number } {
  if (cible.estPJ) return { degatsAppliques: montant }
  return { degatsAppliques: Math.max(0, montant - cible.rd), rdAppliquee: cible.rd }
}

// Lance l'attaque puis résout son effet contre une cible assignée : si un jet d'attaque existait et
// n'atteint pas la DEF de la cible, l'attaque rate (aucun dégât appliqué, même si des DM ont été
// lancés — ex. un jet de dégâts groupé avec le jet d'attaque). Sinon (touché, ou attaque à zone qui
// n'a pas de jet d'attaque type "Souffle"), les dégâts sont réduits par la RD de la cible — SAUF si la
// cible est un PJ : sa RD (potentiellement dynamique — boosts défensifs actifs, résistances par type,
// etc.) n'est fiablement connue et appliquée qu'une fois, côté Mode de jeu de ce PJ (voir
// computeIncomingDamage/appliquerDegats dans GameModePanel.tsx). L'appliquer aussi ici la
// déduirait deux fois (une fois ici sur le cartouche, une fois côté joueur) — le montant brut est
// donc transmis tel quel (annoncé par le MJ ou envoyé automatiquement, voir handleAttaque dans
// CombatTab.tsx), et session.pjs.pvActuels n'en devient qu'un miroir approximatif de la rencontre,
// le Mode de jeu du PJ restant la source de vérité pour ses PV.
// Le MJ garde la main pour corriger ensuite via les boutons +/- PV de la cible.
export function resoudreAttaque(
  nom: string, bonus: string | undefined, dm: string | undefined,
  cible: CombatEntiteInfo | null,
): RollResult {
  const result = rollAttaque(nom, bonus, dm)
  if (!cible) return result

  result.cibleNom = cible.nom
  if (result.jetTotal !== undefined) result.cibleDef = cible.def
  const rate = result.jetTotal !== undefined && result.jetTotal < cible.def
  if (rate) {
    result.toucheRate = true
  } else if (result.degatsTotal !== undefined) {
    const { degatsAppliques, rdAppliquee } = appliquerDegatsCible(result.degatsTotal, cible)
    result.degatsAppliques = degatsAppliques
    result.rdAppliquee = rdAppliquee
  }
  return result
}

// Valeur totale d'une stat (base + somme des buffs actifs pour cette stat) + indication du signe
// du cumul, pour l'affichage coloré (vert = bonus net, rouge = malus net)
export function getStatAvecBuff(base: string | number | undefined, buffs: StatBuff[], stat: string): { value: number; net: number } {
  const baseNum = typeof base === 'number' ? base : parseSigned(base)
  const net = buffs.filter(b => b.stat === stat).reduce((s, b) => s + b.valeur, 0)
  return { value: baseNum + net, net }
}
