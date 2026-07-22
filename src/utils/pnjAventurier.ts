// PNJ générés à partir de la catégorie « Aventurier » (Livre du Meneur, p.117-160, section « PNJ »).
// Même principe que pnjCombattant.ts (une table de stats par NC, capacités qui se débloquent
// progressivement) mais avec deux différences structurelles : les caractéristiques varient par NC
// (l'astérisque se déplace avec le NC, pas avec la variante) et il existe des capacités COMMUNES aux
// 3 variantes en plus de leurs capacités propres.
import type { BestiaireEntry } from '../types/gameData'

export type VarianteAventurierId = 'assassin' | 'maitreArmes' | 'tireur'

type CaracteristiquesTexte = { FOR: string; DEX: string; CON: string; INT: string; SAG: string; CHA: string }

type LigneNC = {
  nc: number
  caracteristiques: CaracteristiquesTexte
  def: number
  pv: number
  init: number
  armeBonus: number
  armeDm: string
  bonusUniversel: number
}

// Capacité avec seuil de déblocage (nc) et, pour les cas de remplacement (voir Tireur), une borne
// haute (ncMax) au-delà de laquelle une autre capacité prend le relais dans le même « slot ».
type CapaciteNC = { nc: number; ncMax?: number; nom: string; desc: string }

type VarianteAventurier = {
  id: VarianteAventurierId
  nom: string
  description: string
  capacites: CapaciteNC[]
}

const ARMES_BASE = ['Rapière (crit 19-20)', 'Arc court']

const LIGNES: LigneNC[] = [
  { nc: 0.5, caracteristiques: { FOR: '+0', DEX: '+4*', CON: '+0', INT: '+0', SAG: '+1', CHA: '+1' }, def: 14, pv: 3, init: 14, armeBonus: 3, armeDm: '1d6', bonusUniversel: 0 },
  { nc: 1, caracteristiques: { FOR: '+0', DEX: '+4*', CON: '+0', INT: '+0', SAG: '+1', CHA: '+1*' }, def: 16, pv: 6, init: 18, armeBonus: 5, armeDm: '1d6', bonusUniversel: 0 },
  { nc: 2, caracteristiques: { FOR: '+0', DEX: '+4*', CON: '+0', INT: '+0', SAG: '+1', CHA: '+1*' }, def: 18, pv: 26, init: 18, armeBonus: 7, armeDm: '1d6+2', bonusUniversel: 1 },
  { nc: 3, caracteristiques: { FOR: '+0', DEX: '+4*', CON: '+0', INT: '+0', SAG: '+1', CHA: '+1*' }, def: 18, pv: 26, init: 18, armeBonus: 7, armeDm: '1d6+2', bonusUniversel: 1 },
  { nc: 4, caracteristiques: { FOR: '+0', DEX: '+4*', CON: '+0', INT: '+0', SAG: '+1', CHA: '+1*' }, def: 20, pv: 46, init: 18, armeBonus: 9, armeDm: '1d6+4', bonusUniversel: 2 },
  { nc: 5, caracteristiques: { FOR: '+0', DEX: '+4*', CON: '+0', INT: '+0', SAG: '+1', CHA: '+1*' }, def: 20, pv: 46, init: 18, armeBonus: 9, armeDm: '1d6+4', bonusUniversel: 2 },
  { nc: 6, caracteristiques: { FOR: '+0', DEX: '+4*', CON: '+0', INT: '+0', SAG: '+1', CHA: '+1*' }, def: 22, pv: 66, init: 18, armeBonus: 11, armeDm: '1d6+6', bonusUniversel: 3 },
  { nc: 7, caracteristiques: { FOR: '+0', DEX: '+4*', CON: '+0', INT: '+0', SAG: '+1', CHA: '+1*' }, def: 22, pv: 66, init: 18, armeBonus: 11, armeDm: '1d6+6', bonusUniversel: 3 },
  { nc: 8, caracteristiques: { FOR: '+0', DEX: '+4*', CON: '+0', INT: '+0', SAG: '+1', CHA: '+1*' }, def: 24, pv: 86, init: 18, armeBonus: 13, armeDm: '1d6+8', bonusUniversel: 4 },
  { nc: 9, caracteristiques: { FOR: '+0', DEX: '+4*', CON: '+0', INT: '+0', SAG: '+1*', CHA: '+1*' }, def: 24, pv: 86, init: 18, armeBonus: 13, armeDm: '1d6+8', bonusUniversel: 4 },
  { nc: 10, caracteristiques: { FOR: '+0', DEX: '+4*', CON: '+0', INT: '+0', SAG: '+1*', CHA: '+1*' }, def: 24, pv: 96, init: 18, armeBonus: 17, armeDm: '2d6+8', bonusUniversel: 5 },
  { nc: 11, caracteristiques: { FOR: '+0', DEX: '+4*', CON: '+0', INT: '+0', SAG: '+1*', CHA: '+1*' }, def: 24, pv: 96, init: 18, armeBonus: 17, armeDm: '2d6+8', bonusUniversel: 5 },
  { nc: 12, caracteristiques: { FOR: '+0', DEX: '+4*', CON: '+0', INT: '+0', SAG: '+1*', CHA: '+1*' }, def: 26, pv: 116, init: 18, armeBonus: 19, armeDm: '2d6+10', bonusUniversel: 6 },
  { nc: 13, caracteristiques: { FOR: '+0', DEX: '+4*', CON: '+0', INT: '+0', SAG: '+1*', CHA: '+1*' }, def: 26, pv: 116, init: 18, armeBonus: 19, armeDm: '2d6+10', bonusUniversel: 6 },
  { nc: 14, caracteristiques: { FOR: '+0', DEX: '+4*', CON: '+0', INT: '+0', SAG: '+1*', CHA: '+1*' }, def: 26, pv: 126, init: 18, armeBonus: 23, armeDm: '3d6+10', bonusUniversel: 7 },
  { nc: 15, caracteristiques: { FOR: '+0', DEX: '+4*', CON: '+0', INT: '+0', SAG: '+1*', CHA: '+1*' }, def: 26, pv: 126, init: 18, armeBonus: 23, armeDm: '3d6+10', bonusUniversel: 7 },
]

export const NC_DISPONIBLES: number[] = LIGNES.map(l => l.nc)

// Capacités communes, partagées par les 3 variantes (I à IV dans le livre).
const CAPACITES_COMMUNES: CapaciteNC[] = [
  { nc: 1, nom: 'Instinct de survie', desc: "Une fois par tour, au moment de son choix, l'aventurier peut utiliser une action de mouvement supplémentaire pour se déplacer. Si un effet ou une créature le paralyse, le ralentit ou restreint ses mouvements, il a droit une fois par tour à un test d'INT ou de DEX au choix de difficulté 10 pour s'en débarrasser. Il gagne +5 en DEF lorsqu'il lui reste moins de [NC x 5] PV." },
  { nc: 9, nom: 'Embuscade', desc: "Au premier tour de combat, si l'environnement permet à l'aventurier de se dissimuler, la cible doit faire un test de SAG difficulté 19 ou être surprise. Si elle attaque avec succès une cible surprise, la créature inflige +1d6 aux DM. La créature obtient un bonus de +5 à tous les tests de discrétion et en Init." },
  { nc: 13, nom: 'Attaque en traître (L)', desc: "Si l'aventurier attaque en même temps qu'un allié (il peut volontairement retarder son initiative), de dos ou par surprise, il réalise une attaque en traître avec un bonus de +5 en attaque et +2d6 aux DM – cumulable avec Attaque mortelle (pour les variantes assassin et tireur) ou Imparable (pour la variante maître d'armes). Un tireur ne peut utiliser une attaque en traître à distance que si un allié est déjà au contact de sa cible." },
  { nc: 15, nom: "L'hallali", desc: "Les aventuriers profitent d'une erreur de leur adversaire pour lui porter des attaques fatales. À chaque fois que la victime rate une attaque ou obtient sur un test d'attaque un résultat au d20 allant de 1 à 5 (inclus), elle déclenche la curée ! Chaque aventurier doté de cette capacité bénéficie immédiatement et gratuitement d'une Attaque en traître contre la victime (+5 au jet d'attaque/+2d6 aux DM)." },
]

export const VARIANTES_AVENTURIER: VarianteAventurier[] = [
  {
    id: 'assassin', nom: 'Assassin',
    description: 'Combattants de l\'ombre, les assassins utilisent des armes de duel et frappent leurs adversaires là où ils s\'y attendent le moins. On peut également classer dans cette catégorie les bandits et les voleurs.',
    capacites: [
      { nc: 3, nom: 'Attaque mortelle (L)', desc: "Une attaque similaire à l'Attaque sournoise de l'aventurier (voie de l'assassinat) qui doit être exécutée de dos ou par surprise. L'assassin obtient un bonus de +5 en attaque et ajoute 3d6 aux DM. Il obtient aussi un bonus de +5 aux tests de discrétion." },
      { nc: 5, nom: 'Disparition (L)', desc: "L'assassin devient invisible (passage dans les ombres ou utilisation d'un sort, etc.) et peut se déplacer de 20 mètres. Il réapparaît à son prochain tour et, s'il réussit un test opposé de discrétion (DEX) contre la SAG de sa cible, il peut porter une Attaque mortelle." },
      { nc: 7, nom: 'Assassinat', desc: "Au premier tour de combat, si la cible est surprise, une Attaque mortelle réussie l'oblige à réussir un test de CON difficulté 15 : en cas d'échec, elle tombe à 0 PV." },
      { nc: 11, nom: 'Interchangeables', desc: "Tant que l'assassin et ses alliées sont plus nombreux que la cible, ils se relaient pour esquiver ses attaques et obtiennent un bonus de +5 en DEF. Si plusieurs assassins semblables sont au contact du PJ, le MJ a toute latitude pour infliger les DM d'une attaque sur la créature de son choix, le personnage ne sachant jamais laquelle il blesse." },
    ],
  },
  {
    id: 'maitreArmes', nom: "Maître d'armes",
    description: "Les maîtres d'armes usent de techniques martiales souples et combattent au corps-à-corps avec une arme dans chaque main. Adapté aux soldats en armures plus légères tels que les spadassins elfes.",
    capacites: [
      { nc: 3, nom: 'Imparable (L)', desc: "Portez une attaque en lançant deux d20 et gardez le meilleur résultat. Si le maître d'armes obtient un résultat de 15 à 20 au d20 d'un test d'attaque (même sans utiliser Imparable), il inflige +1d6 DM et l'attaque est automatiquement réussie." },
      { nc: 5, nom: 'Riposte', desc: "Le maître d'armes peut effectuer une attaque en action gratuite contre chaque adversaire qui l'attaque à l'exception de celui qu'il a lui-même choisi d'attaquer à son tour." },
      { nc: 7, nom: 'Hausser le ton', desc: "Lorsqu'il a perdu au moins la moitié de sa valeur de PV maximale, le maître d'armes gagne un bonus de +5 à ses tests d'attaque et +1d6 aux DM et réduit tous les DM subis de 5 points par attaque (RD 5)." },
      { nc: 11, nom: 'Interchangeables', desc: "Tant que le maître d'armes et ses alliées sont plus nombreux que la cible, ils se relaient pour esquiver ses attaques et obtiennent un bonus de +5 en DEF. Si plusieurs maîtres d'armes semblables sont au contact du PJ, le MJ a toute latitude pour infliger les DM d'une attaque sur la créature de son choix, le personnage ne sachant jamais laquelle il blesse." },
    ],
  },
  {
    id: 'tireur', nom: 'Tireur',
    description: 'Spécialiste des attaques à distance et des embuscades, que ce soit en forêt ou en ville.',
    capacites: [
      { nc: 3, ncMax: 8, nom: 'Embuscade', desc: "Au premier tour de combat, si l'environnement permet au tireur de se dissimuler, la cible doit faire un test de SAG difficulté 19 ou être surprise. Si elle attaque avec succès une cible surprise, la créature inflige +1d6 aux DM. La créature obtient un bonus de +5 à tous les tests de discrétion et en Init." },
      { nc: 9, nom: 'Attaque mortelle (L)', desc: "Une attaque similaire à l'Attaque sournoise de l'aventurier (voie de l'assassinat) qui doit être exécutée de dos ou par surprise. Le tireur obtient un bonus de +5 en attaque et ajoute 3d6 aux DM. Il obtient aussi un bonus de +5 aux tests de discrétion." },
      { nc: 5, nom: 'Imparable (L)', desc: "Portez une attaque en lançant deux d20 et gardez le meilleur résultat. Si le tireur obtient un résultat de 15 à 20 au d20 d'un test d'attaque (même sans utiliser Imparable), il inflige +1d6 DM et l'attaque est automatiquement réussie." },
      { nc: 7, nom: 'Tireur d\'élite (L)', desc: "Le tireur peut réaliser deux attaques à distance dans le même tour. Il ignore les pénalités normalement appliquées lorsque la cible est à couvert (-2 à -5) et peut lancer 1d12 au lieu de 1d20 pour bénéficier d'un bonus de +2d6 DM." },
      { nc: 11, nom: 'Disparition (L)', desc: "Le tireur devient invisible (passage dans les ombres ou utilisation d'un sort, etc.) et peut se déplacer de 20 mètres. Il réapparaît à son prochain tour et, s'il réussit un test opposé de discrétion (DEX) contre la SAG de sa cible, il peut porter une Attaque mortelle." },
    ],
  },
]

function signe(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`
}

function trouverLigne(nc: number): LigneNC {
  return LIGNES.find(l => l.nc === nc) ?? LIGNES[0]
}

export function genererPNJAventurier(varianteId: VarianteAventurierId, nc: number, nom: string): BestiaireEntry {
  const variante = VARIANTES_AVENTURIER.find(v => v.id === varianteId) ?? VARIANTES_AVENTURIER[0]
  const ligne = trouverLigne(nc)
  const capacitesDebloquees = [...CAPACITES_COMMUNES, ...variante.capacites]
    .filter(c => c.nc <= nc && (c.ncMax === undefined || nc <= c.ncMax))
    .sort((a, b) => a.nc - b.nc)

  return {
    nom, nc, livres: ['Livre du Meneur'], page: '134',
    description: variante.description,
    caracteristiques: { ...ligne.caracteristiques },
    def: ligne.def,
    pv: ligne.pv,
    init: ligne.init,
    attaques: ARMES_BASE.map(nomArme => ({ nom: nomArme, bonus: signe(ligne.armeBonus), dm: ligne.armeDm })),
    capacites: [
      { nom: 'Bonus universel', desc: `+${ligne.bonusUniversel} à tout test de caractéristique ou de compétence jugé pertinent par le MJ.` },
      ...capacitesDebloquees.map(c => ({ nom: c.nom, desc: c.desc })),
    ],
  }
}
