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
}

export type CombatPJ = {
  id: string
  character: Character
  pvActuels: number
  pmActuels: number
  buffs: StatBuff[]
  expanded: boolean
  cibleId: string | null
}

// Infos normalisées d'une cible potentielle (créature ou PJ), pour le sélecteur de ciblage et la
// résolution des dégâts sans que l'appelant ait à distinguer les deux types.
export type CombatEntiteInfo = { id: string; nom: string; def: number; rd: number; pvActuels: number }

export function listerEntites(session: CombatSession, descriptions: DescMap): CombatEntiteInfo[] {
  const creatures = session.combatants.map(c => ({
    id: c.id,
    nom: c.creature.nom,
    def: getStatAvecBuff(c.creature.def, c.buffs, 'DEF').value,
    rd: getStatAvecBuff(c.creature.rd, c.buffs, 'RD').value,
    pvActuels: c.pvActuels,
  }))
  const pjs = session.pjs.map(p => {
    const stats = computeCombatStatsPJ(p.character, descriptions)
    return {
      id: p.id,
      nom: p.character.nomPersonnage,
      def: getStatAvecBuff(stats.def, p.buffs, 'DEF').value,
      rd: getStatAvecBuff(stats.rd, p.buffs, 'RD').value,
      pvActuels: p.pvActuels,
    }
  })
  return [...creatures, ...pjs]
}

export type CombatSession = {
  nomRencontre: string
  combatants: CombatCreature[]
  pjs: CombatPJ[]
  // Part (0 à 1) de la largeur attribuée à la colonne Créatures dans CombatTab — ajustée en glissant
  // la barre de séparation, conservée avec la session pour survivre à un instantané sauvegardé/rechargé.
  splitRatio?: number
}

// Instantané persistable d'une session de combat en cours : mêmes données (créatures présentes,
// PV/buffs/cibles, PJ importés avec les leurs) + un identifiant pour la retrouver et la mettre à
// jour dans la bibliothèque, afin de pouvoir reprendre un combat interrompu.
export type CombatSessionSauvegardee = CombatSession & { id: string; creeLe: string }

// Construit une session de combat éphémère à partir d'une rencontre enregistrée : copie de travail,
// jamais persistée, jamais réécrite sur la rencontre ou le bestiaire d'origine.
export function demarrerCombat(rencontre: RencontreSauvegardee, bestiaire: BestiaireEntry[]): CombatSession {
  const combatants: CombatCreature[] = []
  rencontre.adversaires.forEach((a, i) => {
    if (!a.creatureNom) return
    const creature = bestiaire.find(c => c.nom === a.creatureNom)
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
    })
  })
  return { nomRencontre: rencontre.nom, combatants, pjs: [] }
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
    cibleId: null,
  }
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

// Lance l'attaque puis résout son effet contre une cible assignée : si un jet d'attaque existait et
// n'atteint pas la DEF de la cible, l'attaque rate (aucun dégât appliqué, même si des DM ont été
// lancés — ex. un jet de dégâts groupé avec le jet d'attaque). Sinon (touché, ou attaque à zone qui
// n'a pas de jet d'attaque type "Souffle"), les dégâts sont appliqués réduits par la RD de la cible.
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
    result.degatsAppliques = Math.max(0, result.degatsTotal - cible.rd)
    result.rdAppliquee = cible.rd
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
