// Séparation livré/perso pour les objets magiques (calquée sur cataloguePerso.ts) — même règle que les
// autres catalogues simples (« le livré n'est jamais réécrit, une surcharge de même identifiant le
// remplace à l'affichage, sinon c'est un ajout »), mais identifiée par `id` plutôt que par `nom` : deux
// objets créés par le MJ peuvent légitimement partager un nom (clonage d'un objet existant pour créer
// une variante), contrairement aux autres catalogues nommés (voies, traits...).
import { empreinte } from './empreinte'
import { queueSave, flushAllSaves } from './saveManager'
import type { ObjetMagiqueEntry } from '../types/gameData'
import type { Character } from '../types/character'

const stripExposants = (s: string) => s.replace(/[¹²³⁴⁵⁶⁷*]\s*/g, '').trim()

// Synthétise/retire l'entrée Arme ou ArmureEquipee correspondant à la possession d'un objet magique de
// slot arme/armure/bouclier — extrait de EquipementModal.tsx (togglePossede, seul appelant à l'origine)
// pour être réutilisé À L'IDENTIQUE par toute autre voie d'acquisition (ex. réception réseau d'un objet
// envoyé par le MJ, voir GameModePanel.tsx). Sans ce partage, un objet reçu autrement que par le bouton
// "Posséder" de la modale marquerait bien objetsMagiquesPossedes à jour, mais n'apparaîtrait nulle part
// sur la fiche (aucune arme/armure synthétisée) — bug initial du transfert réseau.
export function patchPossessionObjetMagique(character: Character, objet: ObjetMagiqueEntry, possede: boolean): Partial<Character> {
  const patch: Partial<Character> = {}
  if (objet.slot === 'arme') {
    if (!possede) {
      patch.armes = character.armes.filter(a => a.nom !== objet.nom)
      if (stripExposants(character.arme1) === stripExposants(objet.nom)) { patch.arme1 = ''; patch.dmArme1 = '' }
      if (stripExposants(character.arme2) === stripExposants(objet.nom)) { patch.arme2 = ''; patch.dmArme2 = '' }
    } else if (!character.armes.some(a => a.nom === objet.nom)) {
      patch.armes = [...character.armes, {
        nom: objet.nom, dm: objet.armeDm ?? '', attaque: objet.armeAttaque ?? 'FOR',
        special: objet.description ?? '',
      }]
    }
  } else if (objet.slot === 'armure' || objet.slot === 'bouclier') {
    if (!possede) {
      patch.armuresEquipees = character.armuresEquipees.filter(a => a.nom !== objet.nom)
    } else if (!character.armuresEquipees.some(a => a.nom === objet.nom)) {
      const defDerive = objet.enchantements.reduce((s, e) =>
        s + (e.effets ?? []).filter(ef => ef.stat === 'DEF').reduce((s2, ef) => s2 + (parseInt(ef.valeur) || 0), 0), 0)
      patch.armuresEquipees = [...character.armuresEquipees, { nom: objet.nom, def: defDerive, prix: '' }]
    }
  }
  return patch
}

export function fusionnerObjetsMagiques(livre: ObjetMagiqueEntry[], perso: ObjetMagiqueEntry[]): ObjetMagiqueEntry[] {
  const surcharges = new Map(perso.map(o => [o.id, o]))
  const clesLivre = new Set(livre.map(o => o.id))
  const fusion = livre.map(o => surcharges.get(o.id) ?? o)
  for (const o of perso) if (!clesLivre.has(o.id)) fusion.push(o)
  return fusion
}

/** Même principe que extraireSurchargesCatalogue : sert à la fois de setter générique (next = l'état
 *  affiché voulu) et, le cas échéant, de migration. */
export function extraireSurchargesObjetsMagiques(next: ObjetMagiqueEntry[], livre: ObjetMagiqueEntry[]): ObjetMagiqueEntry[] {
  const parId = new Map(livre.map(o => [o.id, o]))
  const perso: ObjetMagiqueEntry[] = []
  for (const o of next) {
    const l = parId.get(o.id)
    if (!l || empreinte(o) !== empreinte(l)) perso.push(o)
  }
  return perso
}

/** Publie l'état affiché comme nouveau contenu livré — bouton réservé à l'auteur, en dev (même principe
 *  que publierBestiaireLivre) : perso repart à vide, puisque ce qu'il contenait EST désormais le livré. */
export async function publierObjetsMagiquesLivre(): Promise<void> {
  queueSave('Maitre de jeu/objets-magiques-perso.json', JSON.stringify({ _type: 'objets-magiques-perso', data: [] }, null, 2))
  await flushAllSaves()
}
