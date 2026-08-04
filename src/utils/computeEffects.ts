import type { Character, Caracteristique } from '../types/character'
import { getMod } from '../types/character'
import type { DescMap, ObjetMagiqueEntry } from '../types/gameData'
import cristauxData from '../data/cristaux.json'
import { getRangsEmpruntes } from './voieRangChoix'

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
      return !character.arme1 && !character.arme2
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

  // Rangs empruntés à une autre voie via VOIE_RANG/VOIE_RANG_CHOIX (ex : voie culturelle de la Forge
  // qui donne un rang 1/2 de la voie d'alchimie ou runique). Seuls leurs effets numériques directs sont
  // pris en compte, pas leurs propres grants — volontairement non récursif (voir voieRangChoix.ts), et
  // un rang emprunté n'est jamais jaugé par un minRang (pas de progression dans la voie source). Un
  // effet "avancé" s'applique en revanche si la case avancée du rang QUI PORTE LE GRANT est cochée
  // (avanceeAccordee) — pas de case propre au rang emprunté lui-même.
  for (const { voieNom, rangIdx, rangData, avanceeAccordee } of getRangsEmpruntes(character, descriptions)) {
    for (const effect of rangData.effects ?? []) {
      if (effect.avancee && !avanceeAccordee) continue
      if (effect.minRang !== undefined) continue
      if (!effect.value && !effect.formula && !effect.div2 && !effect.immunite) continue
      if (effect.condition && !evaluateCondition(effect.condition, character)) continue

      let value: number
      if (effect.value !== undefined) {
        value = effect.value
      } else if (effect.formula) {
        const resolved = resolveFormula(effect.formula, character)
        if (resolved === null) continue
        value = resolved
      } else {
        value = 0
      }

      const contribution: Contribution = {
        stat: effect.stat, value, nom: rangData.nom, rang: rangIdx + 1, triggerRang: rangIdx + 1, voie: voieNom,
        div2: effect.div2, immunite: effect.immunite,
      }
      if (!result[effect.stat]) result[effect.stat] = []
      result[effect.stat].push(contribution)
    }
  }

  return result
}

// Comme computeEffects, mais fusionne également les bonus des cristaux actifs (Voie des cristaux) et des
// objets magiques équipés (objetsMagiques : catalogue fusionné livré+perso résolu par l'appelant — voir
// useGameData().objetsMagiques ; paramètre optionnel, défaut [], pour ne pas casser les appelants qui
// n'ont pas encore ce catalogue sous la main, ex. les outils de combat/bataille MJ).
export function computeEffectsWithCristaux(character: Character, descriptions: DescMap, objetsMagiques: ObjetMagiqueEntry[] = []): EffectsResult {
  const baseEffects = computeEffects(character, descriptions)
  const actifsCristaux = (character.cristauxActifs ?? [])
    .map(nom => cristauxData.find(c => c.nom === nom))
    .filter((c): c is typeof cristauxData[0] => Boolean(c?.bonus))

  const equipes = (character.objetsMagiquesEquipes ?? [])
    .map(id => objetsMagiques.find(o => o.id === id))
    .filter((o): o is ObjetMagiqueEntry => Boolean(o))

  if (actifsCristaux.length === 0 && equipes.length === 0) return baseEffects

  const result: EffectsResult = { ...baseEffects }
  const addContrib = (key: string, value: number, nom: string, voie: string) => {
    result[key] = [...(result[key] ?? []), { stat: key, value, nom, rang: -1, triggerRang: -1, voie }]
  }
  for (const cristal of actifsCristaux) {
    const { stat, valeur } = cristal.bonus!
    if (stat === 'initiative') addContrib('INIT', valeur, cristal.nom, 'cristaux')
    else if (stat === 'defense') addContrib('DEF', valeur, cristal.nom, 'cristaux')
    else if (stat === 'attaques') { addContrib('ATT_CONTACT', valeur, cristal.nom, 'cristaux'); addContrib('ATT_DISTANCE', valeur, cristal.nom, 'cristaux'); addContrib('ATT_MAGIQUE', valeur, cristal.nom, 'cristaux') }
    else addContrib(stat, valeur, cristal.nom, 'cristaux')
  }
  for (const objet of equipes) {
    for (const ench of objet.enchantements) {
      for (const effet of ench.effets ?? []) {
        const value = parseInt(effet.valeur)
        if (!isNaN(value)) addContrib(effet.stat, value, objet.nom, 'objets-magiques')
      }
    }
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

// Grants de type AVANTAGE ("lancer N dés, garder le meilleur M") actuellement actifs — accordés par les
// rangs "Héroïque" (rang 5 de certaines voies : +2 à une carac ET cet avantage sur cette même carac),
// mais le mécanisme n'est pas réservé à ces rangs-là dans les données. Utilisé par le Mode de jeu (pour
// activer le double-jet) et par la fiche recto (pour cocher automatiquement la case "Héroïque (2d)").
export type AvailableAvantage = { voieNom: string; rangIdx: number; rangNom: string; stat: string; lancer: number; garder: number }

export function computeAvantages(character: Character, descriptions: DescMap): AvailableAvantage[] {
  const list: AvailableAvantage[] = []
  for (const key of VOIE_KEYS) {
    const voie = character[key]
    if (!voie.nom) continue
    const rangsDesc = descriptions[voie.nom]
    if (!rangsDesc) continue
    voie.rangs.forEach((unlocked, idx) => {
      if (!unlocked) return
      const rang = rangsDesc[idx]
      if (!rang?.grants) return
      for (const grant of rang.grants) {
        if (grant.type !== 'AVANTAGE') continue
        if (grant.avancee && !(voie.rangsAvances?.[idx])) continue
        if (grant.masqueSiAvancee && voie.rangsAvances?.[idx]) continue
        if ((grant.minRang ?? 1) > voie.rangs.filter(Boolean).length) continue
        list.push({ voieNom: voie.nom, rangIdx: idx, rangNom: rang.nom, stat: grant.stat, lancer: grant.lancer ?? 2, garder: grant.garder ?? 1 })
      }
    })
  }
  for (const { voieNom, rangIdx, rangData, avanceeAccordee } of getRangsEmpruntes(character, descriptions)) {
    for (const grant of rangData.grants ?? []) {
      // masqueSiAvancee manquait ici (présent sur la boucle des voies possédées en propre, plus haut) :
      // une capacité élémentaliste EMPRUNTÉE (VOIE_RANG_CHOIX) dont l'avancée est accordée gardait sa
      // version de base en plus de la version avancée, au lieu de la remplacer (signalé par Didic,
      // même bug que dans GameModePanel.tsx pour BONUS_TEMP/ACTION).
      if (grant.type !== 'AVANTAGE' || (grant.avancee && !avanceeAccordee) || (grant.masqueSiAvancee && avanceeAccordee) || grant.minRang !== undefined) continue
      list.push({ voieNom, rangIdx, rangNom: rangData.nom, stat: grant.stat, lancer: grant.lancer ?? 2, garder: grant.garder ?? 1 })
    }
  }
  return list
}

// Grants de type ACTIONS_SUPP ("N action(s) offensive/active supplémentaire(s) par tour", ex. "2
// attaques par tour") actuellement actifs — même patron que computeAvantages ci-dessus : détecté
// automatiquement depuis les rangs débloqués, jamais une case à cocher manuelle. Utilisé par le Mode de
// jeu pour calculer le budget d'action du tour (voir budgetActions dans GameModePanel.tsx) et pour
// afficher la capacité comme un grant "Automatique" au même titre qu'un AVANTAGE.
export type AvailableActionSupp = { voieNom: string; rangIdx: number; rangNom: string; label: string; nombre: number }

export function computeActionsSupp(character: Character, descriptions: DescMap): AvailableActionSupp[] {
  const list: AvailableActionSupp[] = []
  for (const key of VOIE_KEYS) {
    const voie = character[key]
    if (!voie.nom) continue
    const rangsDesc = descriptions[voie.nom]
    if (!rangsDesc) continue
    voie.rangs.forEach((unlocked, idx) => {
      if (!unlocked) return
      const rang = rangsDesc[idx]
      if (!rang?.grants) return
      for (const grant of rang.grants) {
        if (grant.type !== 'ACTIONS_SUPP') continue
        if (grant.avancee && !(voie.rangsAvances?.[idx])) continue
        if (grant.masqueSiAvancee && voie.rangsAvances?.[idx]) continue
        if ((grant.minRang ?? 1) > voie.rangs.filter(Boolean).length) continue
        list.push({ voieNom: voie.nom, rangIdx: idx, rangNom: rang.nom, label: grant.label, nombre: grant.nombre ?? 1 })
      }
    })
  }
  for (const { voieNom, rangIdx, rangData, avanceeAccordee } of getRangsEmpruntes(character, descriptions)) {
    for (const grant of rangData.grants ?? []) {
      if (grant.type !== 'ACTIONS_SUPP' || (grant.avancee && !avanceeAccordee) || grant.minRang !== undefined) continue
      list.push({ voieNom, rangIdx, rangNom: rangData.nom, label: grant.label, nombre: grant.nombre ?? 1 })
    }
  }
  return list
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

// Initiative de combat d'un PJ, recalculée en direct — contrairement à character.initiative (figée à la
// création du personnage dans CreationWizard.tsx, juste DEX.valeur, jamais mise à jour depuis), pas
// fiable pour trier un ordre d'initiative. Même formule que "Initiative totale" sur la fiche recto
// (ChampsRecto.tsx : DEX.valeur - encombrement + bonus de voies/cristaux), à l'exception du malus
// "équipement sans formation martiale" qui dépend des catalogues armes/armures (hors de portée ici,
// comme le malusEquip déjà omis du def de computeCombatStatsPJ ci-dessus — même précédent, même
// simplification assumée pour l'écran de combat MJ).
export function computeInitiativeTotale(character: Character, descriptions: DescMap): number {
  const effectsAll = computeEffectsWithCristaux(character, descriptions)
  const isBouclier = (nom: string) => nom.toLowerCase().includes('bouclier')
  const armorDef = character.armuresEquipees.filter(a => !isBouclier(a.nom) && a.equipe).reduce((s, a) => s + a.def, 0)
  const totalEncombrement = Math.max(0, armorDef - (character.enchantementEncombrement ?? 0))
  return character.caracteristiques.DEX.valeur - totalEncombrement + sumStat(effectsAll['INIT'] ?? [])
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
