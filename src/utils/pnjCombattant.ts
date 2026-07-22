// PNJ générés à partir de la catégorie « Combattant » (Livre du Meneur, p.117-160, section « PNJ »).
// Contrairement au bestiaire animalier où chaque créature est une fiche isolée, ce chapitre donne UNE
// table de stats par NC (identique pour les 3 variantes) et des capacités qui se débloquent
// progressivement avec le NC, propres à chaque variante — d'où un générateur (voir genererPNJCombattant)
// plutôt que des dizaines de fiches de bestiaire quasi identiques. Le résultat est un BestiaireEntry
// tout à fait normal, éditable et sauvegardable comme n'importe quelle créature.
import type { BestiaireEntry } from '../types/gameData'

export type VarianteCombattantId = 'brute' | 'champion' | 'conquerant'

type LigneNC = {
  nc: number
  def: number
  pv: number
  init: number
  attaqueBonus: number
  attaqueDm: string
  bonusUniversel: number
}

type CapaciteNC = { nc: number; nom: string; desc: string }

export type VarianteCombattant = {
  id: VarianteCombattantId
  nom: string
  description: string
  // Stat qui reçoit l'astérisque (voir genererPNJCombattant) — propre à chaque variante, le reste des
  // caractéristiques (CARACTERISTIQUES_BASE ci-dessous) étant partagé.
  caracSup: 'FOR' | 'DEX' | 'CON' | 'INT' | 'SAG' | 'CHA'
  capacites: CapaciteNC[]
}

// Caractéristiques identiques pour les 3 variantes et tous les NC (seule la « Carac. sup » propre à la
// variante reçoit l'astérisque à la génération).
const CARACTERISTIQUES_BASE = { FOR: 3, DEX: 0, CON: 3, INT: 0, SAG: 0, CHA: 0 }

const ARME_BASE = 'Épée longue'

const LIGNES: LigneNC[] = [
  { nc: 0.5, def: 14, pv: 9, init: 10, attaqueBonus: 2, attaqueDm: '1d8+1', bonusUniversel: 0 },
  { nc: 1, def: 15, pv: 15, init: 10, attaqueBonus: 4, attaqueDm: '1d8+3', bonusUniversel: 0 },
  { nc: 2, def: 17, pv: 35, init: 10, attaqueBonus: 6, attaqueDm: '1d8+5', bonusUniversel: 1 },
  { nc: 3, def: 17, pv: 35, init: 10, attaqueBonus: 6, attaqueDm: '1d8+5', bonusUniversel: 1 },
  { nc: 4, def: 19, pv: 55, init: 10, attaqueBonus: 8, attaqueDm: '1d8+7', bonusUniversel: 2 },
  { nc: 5, def: 19, pv: 55, init: 10, attaqueBonus: 8, attaqueDm: '1d8+7', bonusUniversel: 2 },
  { nc: 6, def: 23, pv: 75, init: 10, attaqueBonus: 10, attaqueDm: '1d8+9', bonusUniversel: 3 },
  { nc: 7, def: 23, pv: 75, init: 10, attaqueBonus: 10, attaqueDm: '1d8+9', bonusUniversel: 3 },
  { nc: 8, def: 25, pv: 95, init: 10, attaqueBonus: 12, attaqueDm: '1d8+11', bonusUniversel: 4 },
  { nc: 9, def: 25, pv: 95, init: 10, attaqueBonus: 12, attaqueDm: '1d8+11', bonusUniversel: 4 },
  { nc: 10, def: 27, pv: 115, init: 10, attaqueBonus: 14, attaqueDm: '1d8+13', bonusUniversel: 5 },
  { nc: 11, def: 27, pv: 115, init: 10, attaqueBonus: 14, attaqueDm: '1d8+13', bonusUniversel: 5 },
  { nc: 12, def: 29, pv: 135, init: 10, attaqueBonus: 16, attaqueDm: '1d8+15', bonusUniversel: 6 },
  { nc: 13, def: 29, pv: 135, init: 10, attaqueBonus: 16, attaqueDm: '1d8+15', bonusUniversel: 6 },
  { nc: 14, def: 29, pv: 145, init: 10, attaqueBonus: 20, attaqueDm: '1d8+18', bonusUniversel: 7 },
  { nc: 15, def: 31, pv: 165, init: 10, attaqueBonus: 22, attaqueDm: '1d8+20', bonusUniversel: 8 },
]

export const NC_DISPONIBLES: number[] = LIGNES.map(l => l.nc)

export const VARIANTES_COMBATTANT: VarianteCombattant[] = [
  {
    id: 'brute', nom: 'Brute',
    description: 'Regroupe les forces de la nature, les grands, les grandes, les massifs, les massives, les musculeux, les musculeuses. Tout particulièrement adapté aux Ogres et aux Orcs, les brigands ou les barbares.',
    caracSup: 'CON',
    capacites: [
      { nc: 0.5, nom: 'Charge (L)', desc: "La brute parcourt une distance maximale de 30 mètres et porte une attaque : lancez deux d20 et gardez le meilleur résultat. Si l'attaque est réussie, en plus des DM normaux, une victime de taille inférieure ou égale à la brute doit faire un test opposé de FOR ou être renversée. Dans ce cas, la brute embroche sa victime et les DM sont doublés." },
      { nc: 5, nom: 'Enrager', desc: "Lorsqu'elle reçoit un coup critique ou si ses PV sont réduits de moitié ou plus, la brute devient enragée. Elle ignore les pénalités de douleur ou la peur, augmente de +5 son score d'attaque au contact et ses DM de +1d6. Elle peut encore agir un tour complet après avoir atteint 0 PV." },
      { nc: 7, nom: 'Percuter', desc: "Sur une « charge » réussie, si la victime est d'une taille inférieure ou égale à la brute, elle est de plus projetée à [1d6+1] mètres de là. Elle doit réussir un test de CON de difficulté 15 ou être étourdie. À chaque tour, elle peut tenter un nouveau test de CON pour retrouver ses esprits." },
      { nc: 9, nom: 'Imparable (L)', desc: "Portez une attaque en lançant deux d20 et gardez le meilleur résultat. Si la brute obtient un résultat de 15 à 20 sur un jet de d20 à un test d'attaque (même sans utiliser Imparable), elle inflige +1d6 DM et l'attaque est automatiquement réussie." },
      { nc: 11, nom: 'Fauchage', desc: "Sur un résultat de 15 à 20 au test d'attaque, si l'attaque est réussie, la victime doit réussir au choix un test de FOR ou de DEX difficulté [10 + bonus universel] ou être renversée." },
      { nc: 13, nom: 'Balayage', desc: "La brute utilise sa puissance pour affecter plusieurs créatures face à elle d'un seul coup. Si plusieurs cibles sont présentes face à elle, son attaque affecte jusqu'à trois créatures (dans un arc de 180°). Faire un seul test d'attaque et le comparer à la DEF de chaque cible." },
    ],
  },
  {
    id: 'champion', nom: 'Champion',
    description: 'Désigne les combattants exceptionnels, plus compétents que la moyenne au sein de leur communauté ou de leur corps de métier.',
    caracSup: 'CHA',
    capacites: [
      { nc: 0.5, nom: 'Imparable (L)', desc: "Portez une attaque en lançant deux d20 et gardez le meilleur résultat. Si le champion obtient un résultat de 15 à 20 sur un jet de d20 à un test d'attaque (même sans utiliser Imparable), il inflige +1d6 DM et l'attaque est automatiquement réussie." },
      { nc: 5, nom: 'Riposte', desc: "Le champion peut effectuer une attaque en action gratuite contre chaque adversaire qui l'attaque à l'exception de celui qu'il a lui-même choisi d'attaquer à son tour." },
      { nc: 7, nom: 'Hausser le ton', desc: "Lorsqu'il passe sous la moitié de sa valeur maximale de PV, le champion gagne un bonus de +5 à ses tests d'attaque et +1d6 aux DM et réduit tous les DM subis de 5 points par attaque (RD 5)." },
      { nc: 9, nom: 'Charge (L)', desc: "Le champion parcourt une distance maximale de 30 mètres et porte une attaque : lancez deux d20 et gardez le meilleur résultat. Si l'attaque est réussie, en plus des DM normaux, une victime de taille inférieure ou égale au champion doit faire un test opposé de FOR ou être renversée. Dans ce cas, il embroche sa victime et les DM sont doublés." },
      { nc: 11, nom: 'Enrager', desc: "Lorsqu'il reçoit un coup critique ou si ses PV sont réduits de moitié ou plus, le champion devient enragé. Il ignore les pénalités de douleur ou la peur, augmente de +5 son score d'attaque au contact et ses DM de +1d6. Il peut encore agir un tour complet après avoir atteint 0 PV." },
      { nc: 13, nom: 'Percuter', desc: "Sur une « charge » réussie, si la victime est d'une taille inférieure ou égale au champion, elle est de plus projetée à [1d6+1] mètres de là. Elle doit réussir un test de CON de difficulté 15 ou être étourdie. À chaque tour, elle peut tenter un nouveau test de CON pour retrouver ses esprits." },
    ],
  },
  {
    id: 'conquerant', nom: 'Conquérant',
    description: 'Les conquérants appartiennent à des corps militaires organisés tels que les milices, les armées ou les groupes de mercenaires.',
    caracSup: 'CHA',
    capacites: [
      { nc: 0.5, nom: 'Sergent', desc: "Une fois par tour, le conquérant peut donner une action supplémentaire à n'importe quel allié sous ses ordres à portée de vue (attaque ou mouvement). Une fois par combat, une attaque qui aurait dû l'amener à 0 PV est ignorée." },
      { nc: 5, nom: 'Capitaine', desc: "Le conquérant donne un bonus de +2 en initiative, en attaque et aux DM à toutes les créatures sous ses ordres à portée de vue. De plus il bénéficie d'une attaque supplémentaire à chaque tour lorsqu'il utilise une action limitée." },
      { nc: 7, nom: 'Commandant', desc: "Le bonus de capitaine passe à +3 en initiative, en attaque, aux DM et en DEF à toutes les créatures sous ses ordres à portée de vue. Tant qu'au moins quatre créatures sous ses ordres sont à moins de 10 mètres de lui, le commandant ne subit que la moitié des DM qui lui sont infligés." },
      { nc: 9, nom: 'Instinct de survie', desc: "Une fois par tour, au moment de son choix, le conquérant peut utiliser une action de mouvement supplémentaire pour se déplacer. Si un effet ou une créature le paralyse, le ralentit ou restreint ses mouvements, il a droit une fois par tour à un test d'INT ou de DEX au choix de difficulté 10 pour s'en débarrasser. Il gagne +5 en DEF lorsqu'il lui reste moins de [NC x 5] PV." },
      { nc: 11, nom: 'Chair à canon', desc: "Une fois par tour, le conquérant peut décider qu'une attaque qui le visait touche à la place l'un de ses subordonnés situé à moins de 3 mètres et venu s'interposer. Il gagne un bonus de +5 en DEF tant que des subordonnés sont positionnés à moins de 3 mètres de lui." },
      { nc: 13, nom: 'Attaque mortelle (L)', desc: "Une attaque similaire à l'attaque sournoise de l'aventurier (voie de l'assassinat) qui doit être exécutée de dos ou par surprise. Le conquérant obtient un bonus de +5 en attaque et ajoute 3d6 aux DM. Il obtient aussi un bonus de +5 aux tests de discrétion." },
    ],
  },
]

function signe(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`
}

function trouverLigne(nc: number): LigneNC {
  return LIGNES.find(l => l.nc === nc) ?? LIGNES[0]
}

// RD de la Brute (seule variante concernée) : +3 à partir du NC 11, +6 à partir du NC 13 — voir la note
// du tableau des caractéristiques du livre.
function rdBrute(nc: number): number | undefined {
  if (nc >= 13) return 6
  if (nc >= 11) return 3
  return undefined
}

export function genererPNJCombattant(varianteId: VarianteCombattantId, nc: number, nom: string): BestiaireEntry {
  const variante = VARIANTES_COMBATTANT.find(v => v.id === varianteId) ?? VARIANTES_COMBATTANT[0]
  const ligne = trouverLigne(nc)
  const avecAsterisque = (stat: keyof typeof CARACTERISTIQUES_BASE) =>
    signe(CARACTERISTIQUES_BASE[stat]) + (variante.caracSup === stat ? '*' : '')
  const capacitesDebloquees = variante.capacites.filter(c => c.nc <= nc)

  return {
    nom, nc, livres: ['Livre du Meneur'], page: '119',
    description: variante.description,
    caracteristiques: {
      FOR: avecAsterisque('FOR'), DEX: avecAsterisque('DEX'), CON: avecAsterisque('CON'),
      INT: avecAsterisque('INT'), SAG: avecAsterisque('SAG'), CHA: avecAsterisque('CHA'),
    },
    def: ligne.def,
    pv: ligne.pv,
    init: ligne.init,
    rd: varianteId === 'brute' ? rdBrute(nc) : undefined,
    attaques: [{ nom: ARME_BASE, bonus: signe(ligne.attaqueBonus), dm: ligne.attaqueDm }],
    capacites: [
      { nom: 'Bonus universel', desc: `+${ligne.bonusUniversel} à tout test de caractéristique ou de compétence jugé pertinent par le MJ.` },
      ...capacitesDebloquees.map(c => ({ nom: c.nom, desc: c.desc })),
    ],
  }
}
