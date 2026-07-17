import type { Character, Caracteristique } from '../types/character'
import { getMod } from '../types/character'
import type { DescMap } from '../types/gameData'
import cristauxData from '../data/cristaux.json'

type Condition =
  | { type: 'hasBouclier' }
  | { type: 'hasArme'; armes: string[] }
  | { type: 'noArme' }

function normalizeArmeName(nom: string): string {
  return nom.replace(/[¹²³⁴⁵⁶⁷*]\s*/g, '').trim().toLowerCase()
}

function evaluateCondition(condition: Condition, character: Character): boolean {
  switch (condition.type) {
    case 'hasBouclier':
      return character.armuresEquipees.some(a => a.nom.toLowerCase().includes('bouclier') && a.equipe)
    case 'hasArme': {
      const armes = condition.armes.map(normalizeArmeName)
      const arme1 = character.arme1 ? normalizeArmeName(character.arme1) : null
      const arme2 = character.arme2 ? normalizeArmeName(character.arme2) : null
      return armes.some(a => a === arme1 || a === arme2)
    }
    case 'noArme':
      return !character.arme1
  }
}

const VOIE_KEYS: Array<keyof Pick<Character,
  'voiePeuple' | 'voieCulturelle' | 'voie1' | 'voie2' | 'voie3' | 'voiePrestige' | 'voieSangMele'
>> = ['voiePeuple', 'voieCulturelle', 'voie1', 'voie2', 'voie3', 'voiePrestige', 'voieSangMele']

export function resolveFormula(formula: string, character: Character): number | null {
  const c = character.caracteristiques
  switch (formula) {
    case 'MOD_FOR': return c.FOR.mod
    case 'MOD_DEX': return c.DEX.mod
    case 'MOD_CON': return c.CON.mod
    case 'MOD_INT': return c.INT.mod
    case 'MOD_SAG': return c.SAG.mod
    case 'MOD_CHA': return c.CHA.mod
    default: return null
  }
}

export type Contribution = {
  stat: string
  value: number
  nom: string
  rang: number
  triggerRang: number
  voie: string
  conditionArmes?: string[]
  div2?: boolean
  immunite?: boolean
}

export type EffectsResult = Record<string, Contribution[]>

export type DiceContribution = {
  stat: string
  diceStr: string
  nom: string
  rang: number
  triggerRang: number
  voie: string
}

export function computeEffects(character: Character, descriptions: DescMap): EffectsResult {
  const result: EffectsResult = {}

  for (const key of VOIE_KEYS) {
    const voie = character[key]
    if (!voie.nom) continue

    const rangsData = descriptions[voie.nom]
    if (!rangsData) continue

    for (let i = 0; i < 5; i++) {
      if (!voie.rangs[i]) continue

      const rangData = rangsData[i]
      if (!rangData) continue

      // Effets normaux
      for (const effect of rangData.effects ?? []) {
        if (effect.avancee && !(voie.rangsAvances?.[i])) continue
        if (!effect.value && !effect.formula && !effect.div2 && !effect.immunite) continue

        if (effect.minRang !== undefined && !voie.rangs[effect.minRang - 1]) continue
        if (effect.condition && !evaluateCondition(effect.condition, character)) continue

        let value: number
        if (effect.value !== undefined) {
          value = effect.rangMultiplier ? effect.value * (i + 1) : effect.value
        } else if (effect.formula) {
          const resolved = resolveFormula(effect.formula, character)
          if (resolved === null) continue
          value = effect.rangMultiplier ? resolved * (i + 1) : resolved
        } else if (effect.div2 || effect.immunite) {
          value = 0
        } else {
          continue
        }

        const contribution: Contribution = {
          stat: effect.stat,
          value,
          nom: rangData.nom,
          rang: i + 1,
          triggerRang: effect.minRang ?? (i + 1),
          voie: voie.nom,
          conditionArmes: effect.condition && effect.condition.type === 'hasArme' ? effect.condition.armes : undefined,
          div2: effect.div2,
          immunite: effect.immunite,
        }

        if (!result[effect.stat]) result[effect.stat] = []
        result[effect.stat].push(contribution)
      }

      // Grants EFFECT_CHOIX
      for (let gi = 0; gi < (rangData.grants ?? []).length; gi++) {
        const grant = rangData.grants![gi]
        if (grant.type !== 'EFFECT_CHOIX') continue
        if (grant.avancee && !(voie.rangsAvances?.[i])) continue
        if (grant.minRang !== undefined && !voie.rangs[grant.minRang - 1]) continue
        if (grant.condition && !evaluateCondition(grant.condition as Condition, character)) continue

        const grantKey = `${voie.nom}|${i}|${gi}`
        const chosenStat = character.effectsChoix?.[grantKey]
        if (!chosenStat) continue

        let value: number
        if (grant.value !== undefined) {
          value = grant.rangMultiplier ? grant.value * (i + 1) : grant.value
        } else if (grant.formula) {
          const resolved = resolveFormula(grant.formula, character)
          if (resolved === null) continue
          value = grant.rangMultiplier ? resolved * (i + 1) : resolved
        } else {
          continue
        }

        if (!result[chosenStat]) result[chosenStat] = []
        result[chosenStat].push({
          stat: chosenStat,
          value,
          nom: rangData.nom,
          rang: i + 1,
          triggerRang: grant.minRang ?? (i + 1),
          voie: voie.nom,
        })
      }
    }
  }

  return result
}

// Comme computeEffects, mais fusionne également les bonus des cristaux actifs (Voie des cristaux)
export function computeEffectsWithCristaux(character: Character, descriptions: DescMap): EffectsResult {
  const baseEffects = computeEffects(character, descriptions)
  const actifsCristaux = (character.cristauxActifs ?? [])
    .map(nom => cristauxData.find(c => c.nom === nom))
    .filter((c): c is typeof cristauxData[0] => Boolean(c?.bonus))
  if (actifsCristaux.length === 0) return baseEffects

  const result: EffectsResult = { ...baseEffects }
  const addContrib = (key: string, value: number, nom: string) => {
    result[key] = [...(result[key] ?? []), { stat: key, value, nom, rang: -1, triggerRang: -1, voie: 'cristaux' }]
  }
  for (const cristal of actifsCristaux) {
    const { stat, valeur } = cristal.bonus!
    if (stat === 'initiative') addContrib('INIT', valeur, cristal.nom)
    else if (stat === 'defense') addContrib('DEF', valeur, cristal.nom)
    else if (stat === 'attaques') { addContrib('ATT_CONTACT', valeur, cristal.nom); addContrib('ATT_DISTANCE', valeur, cristal.nom); addContrib('ATT_MAGIQUE', valeur, cristal.nom) }
    else addContrib(stat, valeur, cristal.nom)
  }
  return result
}

export function computeDiceEffects(character: Character, descriptions: DescMap): Record<string, DiceContribution> {
  const result: Record<string, DiceContribution> = {}

  for (const key of VOIE_KEYS) {
    const voie = character[key]
    if (!voie.nom) continue

    const rangsData = descriptions[voie.nom]
    if (!rangsData) continue

    for (let i = 0; i < 5; i++) {
      if (!voie.rangs[i]) continue

      const rangData = rangsData[i]
      if (!rangData?.effects?.length) continue

      for (const effect of rangData.effects) {
        if (effect.avancee && !(voie.rangsAvances?.[i])) continue
        if (!effect.diceStr) continue
        if (effect.minRang !== undefined && !voie.rangs[effect.minRang - 1]) continue
        if (effect.condition && !evaluateCondition(effect.condition, character)) continue

        const triggerRang = effect.minRang ?? (i + 1)
        const diceStr = effect.rangMultiplier
          ? effect.diceStr!.replace(/^(\d+)/, n => String(parseInt(n) * (i + 1)))
          : effect.diceStr!
        const existing = result[effect.stat]
        if (!existing || triggerRang > existing.triggerRang) {
          result[effect.stat] = {
            stat: effect.stat,
            diceStr,
            nom: rangData.nom,
            rang: i + 1,
            triggerRang,
            voie: voie.nom,
          }
        }
      }
    }
  }

  return result
}

export function sumStat(contributions: Contribution[]): number {
  return contributions.reduce((acc, c) => acc + c.value, 0)
}

// Stats de combat "de base" d'un PJ (PV/PM max, DEF, RD générique) à partir des effets permanents
// (voies + cristaux) uniquement — pas des bonus temporaires de session (activeBoosts/effectCounters),
// qui n'existent pas sur un personnage fraîchement importé et n'ont pas de sens hors d'une session de
// Mode de jeu. Pensé pour l'écran de combat MJ : les modificateurs ponctuels du combat (buffs/debuffs
// posés par le MJ) s'appliquent par-dessus via le même mécanisme StatBuff que les créatures du bestiaire,
// pas via ce calcul. Réplique la logique de GameModePanel/CharacterSheetRecto sans la dupliquer une
// troisième fois avec la partie "session live" qui ne s'applique pas ici.
export function computeCombatStatsPJ(character: Character, descriptions: DescMap): {
  pvTotal: number
  pmTotal: number
  def: number
  rd: number
} {
  const effectsAll = computeEffectsWithCristaux(character, descriptions)

  const effectiveMod = (stat: Caracteristique): number => {
    const bonus = sumStat(effectsAll[stat] ?? [])
    return bonus === 0 ? character.caracteristiques[stat].mod : getMod(character.caracteristiques[stat].valeur + bonus)
  }

  const deVieFaces = character.famille === 'combattants' ? 10 : character.famille === 'aventuriers' ? 8 : 6
  let pvBase = character.niveau1Base ? character.niveau1Base.pvTotal : deVieFaces + character.caracteristiques.CON.mod
  for (const e of character.pvHistorique ?? []) pvBase += e.total
  const pvTotal = pvBase + sumStat(effectsAll['PV'] ?? [])

  const pmBaseNiveau = character.niveau + effectiveMod('SAG')
  const pmNiveau = Math.max(0, character.famille === 'mystiques' ? 2 * pmBaseNiveau : pmBaseNiveau)
  const pmTotal = pmNiveau + sumStat(effectsAll['PM'] ?? [])

  const isBouclier = (nom: string) => nom.toLowerCase().includes('bouclier')
  const armorDef = character.armuresEquipees.filter(a => !isBouclier(a.nom) && a.equipe).reduce((s, a) => s + a.def, 0)
  const shieldDef = character.armuresEquipees.filter(a => isBouclier(a.nom) && a.equipe).reduce((s, a) => s + a.def, 0)
  const def = 10 + effectiveMod('DEX') + armorDef + shieldDef + (character.bonusDefense ?? 0) + sumStat(effectsAll['DEF'] ?? [])

  const rd = sumStat(effectsAll['RD'] ?? [])

  return { pvTotal, pmTotal, def, rd }
}

// Contributions des bonus temporaires (Effets en jeu) actuellement actifs sur la copie de session du Mode de
// jeu (character.activeBoosts/effectCounters) — utilisé à la fois par le Mode de jeu et par la fiche affichée
// pendant la partie, pour qu'elle reflète en temps réel les effets en cours (DEF, etc.).
export function activeBoostContributions(character: Character, statKey: string): Contribution[] {
  const boosts = character.activeBoosts ?? []
  const counters = character.effectCounters ?? {}
  const result: Contribution[] = []
  for (const boost of boosts) {
    if (boost.stat !== statKey || !boost.sourceKey) continue
    // Un compteur absent (pas de durée "usage" définie) signifie "actif jusqu'à retrait manuel", pas "expiré"
    const compteur = counters[boost.sourceKey]
    if (compteur !== undefined && compteur <= 0) continue
    result.push({ stat: statKey, value: boost.bonus, nom: boost.nom, rang: boost.rang, triggerRang: boost.rang, voie: '', div2: boost.div2, immunite: boost.immunite })
  }
  return result
}

// ── Attaques totales (identiques à la fiche) ──────────────────────────────────

type ArmeCat = { categorie: string; entrees: { nom: string }[] }
type ArmuresData = { categories: ArmeCat[] }
type ArmeGroupe = { categories: { categorie: string; entrees: { nom: string }[] }[] }
type ArmesData = { groupes: ArmeGroupe[] }

const stripExposants = (s: string) => s.replace(/[¹²³⁴⁵⁶⁷*]\s*/g, '').trim()
const normalizeFormation = (f: string) => f.replace(/\s*\(.*?\)/g, '').trim().toLowerCase()

function findArmureCategorie(armures: ArmuresData, nom: string): string | null {
  for (const cat of armures.categories)
    if (cat.entrees.some(e => e.nom === nom)) return cat.categorie
  return null
}

function findArmeCategorie(armes: ArmesData, nom: string): string | null {
  const key = stripExposants(nom).toLowerCase()
  for (const g of armes.groupes)
    for (const cat of g.categories)
      if (cat.entrees.some(e => stripExposants(e.nom).toLowerCase() === key)) return cat.categorie
  return null
}

export function computeAttaquesTotaux(
  character: Character,
  descriptions: DescMap,
  armes: ArmesData,
  armures: ArmuresData,
): { contact: number; distance: number; magique: number } {
  const effects = computeEffectsWithCristaux(character, descriptions)

  const isBouclier = (nom: string) => nom.toLowerCase().includes('bouclier')
  const armorDef = character.armuresEquipees.filter(a => !isBouclier(a.nom) && a.equipe).reduce((s, a) => s + a.def, 0)
  const malusAtkDist = Math.floor(armorDef / 2)

  const canUseFormation = (cat: string) =>
    character.formationsMartiales.some(f => normalizeFormation(f) === cat.trim().toLowerCase())

  const MALUS = 3
  const armureSansForm = character.armuresEquipees.filter(a => !isBouclier(a.nom) && a.equipe)
    .some(a => { const c = findArmureCategorie(armures, a.nom); return c !== null && !canUseFormation(c) })
  const bouclierSansForm = character.armuresEquipees.filter(a => isBouclier(a.nom) && a.equipe)
    .some(a => { const c = findArmureCategorie(armures, a.nom); return c !== null && !canUseFormation(c) })
  const malusEquip = (armureSansForm ? MALUS : 0) + (bouclierSansForm ? MALUS : 0)

  const getArmeAttType = (nomArme: string) => {
    const key = stripExposants(nomArme).toLowerCase()
    const arme = character.armes.find(a => stripExposants(a.nom).toLowerCase() === key)
    const mod = (arme as { attaque?: string } | undefined)?.attaque?.toUpperCase()
    return mod === 'DEX' ? 'DEX' : mod === 'INT' ? 'INT' : 'FOR'
  }
  const armeSansForm = (nomArme: string) => {
    const cat = findArmeCategorie(armes, nomArme)
    return cat !== null && !canUseFormation(cat)
  }
  const mal = (arme: string, type: string) => armeSansForm(arme) && getArmeAttType(arme) === type ? MALUS : 0
  const malusArmesContact = ((character.arme1 && mal(character.arme1, 'FOR')) || (character.arme2 && mal(character.arme2, 'FOR'))) ? MALUS : 0
  const malusArmesDist    = ((character.arme1 && mal(character.arme1, 'DEX')) || (character.arme2 && mal(character.arme2, 'DEX'))) ? MALUS : 0
  const malusArmesMag     = ((character.arme1 && mal(character.arme1, 'INT')) || (character.arme2 && mal(character.arme2, 'INT'))) ? MALUS : 0

  // Recalcule Niveau + Mod. actuel (base + bonus de voies/cristaux) + bonus de famille,
  // au lieu de se fier à attaqueContact/attaqueDistance/attaqueMagique figés au dernier level-up
  const effectiveMod = (stat: 'FOR' | 'DEX' | 'INT'): number => {
    const bonus = sumStat(effects[stat] ?? [])
    return bonus === 0 ? character.caracteristiques[stat].mod : getMod(character.caracteristiques[stat].valeur + bonus)
  }
  const famContact = character.famille === 'combattants' ? 2 : character.famille === 'aventuriers' ? 1 : 0
  const famMagique = character.famille === 'mystiques' ? 2 : 0

  return {
    contact:  character.niveau + effectiveMod('FOR') + famContact - malusEquip - malusArmesContact + sumStat(effects['ATT_CONTACT']  ?? []),
    distance: character.niveau + effectiveMod('DEX') + famContact - malusAtkDist - malusEquip - malusArmesDist + sumStat(effects['ATT_DISTANCE'] ?? []),
    magique:  character.niveau + effectiveMod('INT') + famMagique - armorDef    - malusEquip - malusArmesMag   + sumStat(effects['ATT_MAGIQUE']  ?? []),
  }
}
