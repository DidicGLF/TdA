// PNJ générés à partir de la catégorie « Mystique » (Livre du Meneur, p.117-160, section « PNJ »).
// Même principe que pnjAventurier.ts (caractéristiques variables par NC, capacités communes aux 3
// variantes en plus des capacités propres) mais avec deux attaques distinctes par ligne de NC : une
// arme de mêlée secondaire (qui change de nom selon le NC) et l'attaque magique principale, dont les
// DM grimpent à chaque NC plutôt que par palier de deux.
import type { BestiaireEntry } from '../types/gameData'

export type VarianteMystiqueId = 'arcaniste' | 'guerisseur' | 'necromancien'

type CaracteristiquesTexte = { FOR: string; DEX: string; CON: string; INT: string; SAG: string; CHA: string }

type LigneNC = {
  nc: number
  caracteristiques: CaracteristiquesTexte
  def: number
  pv: number
  init: number
  armeMeleeNom: string
  armeMeleeBonus: number
  armeMeleeDm: string
  attMagBonus: number
  attMagDm: string
  bonusUniversel: number
}

type CapaciteNC = { nc: number; ncMax?: number; nom: string; desc: string }

type VarianteMystique = {
  id: VarianteMystiqueId
  nom: string
  description: string
  capacites: CapaciteNC[]
}

const LIGNES: LigneNC[] = [
  { nc: 0.5, caracteristiques: { FOR: '+0', DEX: '+0', CON: '+0', INT: '+3*', SAG: '+2', CHA: '+2' }, def: 10, pv: 4, init: 10, armeMeleeNom: 'Dague', armeMeleeBonus: 1, armeMeleeDm: '1d4', attMagBonus: 4, attMagDm: '1d4', bonusUniversel: 0 },
  { nc: 1, caracteristiques: { FOR: '+0', DEX: '+0', CON: '+0', INT: '+3*', SAG: '+2*', CHA: '+2' }, def: 10, pv: 4, init: 10, armeMeleeNom: 'Dague', armeMeleeBonus: 1, armeMeleeDm: '1d4', attMagBonus: 4, attMagDm: '1d6', bonusUniversel: 0 },
  { nc: 2, caracteristiques: { FOR: '+0', DEX: '+0', CON: '+0', INT: '+3*', SAG: '+2*', CHA: '+2' }, def: 13, pv: 19, init: 10, armeMeleeNom: 'Bâton', armeMeleeBonus: 4, armeMeleeDm: '1d6+1', attMagBonus: 7, attMagDm: '2d6', bonusUniversel: 1 },
  { nc: 3, caracteristiques: { FOR: '+0', DEX: '+0', CON: '+0', INT: '+3*', SAG: '+2*', CHA: '+2' }, def: 13, pv: 19, init: 10, armeMeleeNom: 'Bâton', armeMeleeBonus: 4, armeMeleeDm: '1d6+1', attMagBonus: 7, attMagDm: '3d6', bonusUniversel: 1 },
  { nc: 4, caracteristiques: { FOR: '+0', DEX: '+0', CON: '+0', INT: '+3*', SAG: '+2*', CHA: '+2' }, def: 13, pv: 19, init: 10, armeMeleeNom: 'Bâton', armeMeleeBonus: 4, armeMeleeDm: '1d6+1', attMagBonus: 7, attMagDm: '4d6', bonusUniversel: 1 },
  { nc: 5, caracteristiques: { FOR: '+0', DEX: '+0', CON: '+0', INT: '+3*', SAG: '+2*', CHA: '+2' }, def: 16, pv: 34, init: 10, armeMeleeNom: 'Bâton', armeMeleeBonus: 7, armeMeleeDm: '1d6+2', attMagBonus: 10, attMagDm: '5d6', bonusUniversel: 2 },
  { nc: 6, caracteristiques: { FOR: '+0', DEX: '+0', CON: '+0', INT: '+3*', SAG: '+2*', CHA: '+2' }, def: 16, pv: 34, init: 10, armeMeleeNom: 'Bâton', armeMeleeBonus: 7, armeMeleeDm: '1d6+2', attMagBonus: 10, attMagDm: '6d6', bonusUniversel: 2 },
  { nc: 7, caracteristiques: { FOR: '+0', DEX: '+0', CON: '+0', INT: '+3*', SAG: '+2*', CHA: '+2' }, def: 19, pv: 49, init: 10, armeMeleeNom: 'Bâton runique', armeMeleeBonus: 10, armeMeleeDm: '1d6+3', attMagBonus: 13, attMagDm: '7d6', bonusUniversel: 3 },
  { nc: 8, caracteristiques: { FOR: '+0', DEX: '+0', CON: '+0', INT: '+3*', SAG: '+2*', CHA: '+2' }, def: 19, pv: 49, init: 10, armeMeleeNom: 'Bâton runique', armeMeleeBonus: 10, armeMeleeDm: '1d6+3', attMagBonus: 13, attMagDm: '8d6', bonusUniversel: 3 },
  { nc: 9, caracteristiques: { FOR: '+0', DEX: '+0', CON: '+0', INT: '+3*', SAG: '+2*', CHA: '+2' }, def: 19, pv: 49, init: 10, armeMeleeNom: 'Bâton runique', armeMeleeBonus: 10, armeMeleeDm: '1d6+3', attMagBonus: 13, attMagDm: '9d6', bonusUniversel: 3 },
  { nc: 10, caracteristiques: { FOR: '+0', DEX: '+0', CON: '+0', INT: '+3*', SAG: '+2*', CHA: '+2' }, def: 22, pv: 64, init: 10, armeMeleeNom: 'Bâton runique', armeMeleeBonus: 10, armeMeleeDm: '1d6+3', attMagBonus: 16, attMagDm: '10d6', bonusUniversel: 4 },
  { nc: 11, caracteristiques: { FOR: '+0', DEX: '+0', CON: '+0', INT: '+3*', SAG: '+2*', CHA: '+2' }, def: 22, pv: 64, init: 10, armeMeleeNom: 'Bâton runique', armeMeleeBonus: 13, armeMeleeDm: '1d6+4', attMagBonus: 16, attMagDm: '10d6+3', bonusUniversel: 4 },
  { nc: 12, caracteristiques: { FOR: '+0', DEX: '+0', CON: '+0', INT: '+3*', SAG: '+2*', CHA: '+2' }, def: 25, pv: 79, init: 10, armeMeleeNom: 'Bâton runique', armeMeleeBonus: 16, armeMeleeDm: '1d6+5', attMagBonus: 19, attMagDm: '10d6+6', bonusUniversel: 5 },
  { nc: 13, caracteristiques: { FOR: '+0', DEX: '+0', CON: '+0', INT: '+3*', SAG: '+2*', CHA: '+2' }, def: 25, pv: 79, init: 10, armeMeleeNom: 'Bâton runique', armeMeleeBonus: 16, armeMeleeDm: '1d6+5', attMagBonus: 19, attMagDm: '10d6+9', bonusUniversel: 5 },
  { nc: 14, caracteristiques: { FOR: '+0', DEX: '+0', CON: '+0', INT: '+3*', SAG: '+2*', CHA: '+2' }, def: 28, pv: 94, init: 10, armeMeleeNom: 'Bâton runique', armeMeleeBonus: 19, armeMeleeDm: '1d6+6', attMagBonus: 21, attMagDm: '10d6+12', bonusUniversel: 6 },
  { nc: 15, caracteristiques: { FOR: '+0', DEX: '+0', CON: '+0', INT: '+3*', SAG: '+2*', CHA: '+2' }, def: 28, pv: 94, init: 10, armeMeleeNom: 'Bâton runique', armeMeleeBonus: 19, armeMeleeDm: '1d6+6', attMagBonus: 21, attMagDm: '10d6+15', bonusUniversel: 6 },
]

export const NC_DISPONIBLES: number[] = LIGNES.map(l => l.nc)

// Capacités communes, partagées par les 3 variantes (I à V dans le livre).
const CAPACITES_COMMUNES: CapaciteNC[] = [
  { nc: 4, nom: 'Armure magique (L)', desc: 'Le mystique possède un pouvoir magique (peau de pierre, bouclier intangible, forme ténébreuse, etc.) qui lui permet de diviser tous les DM non magiques subis par deux pour le reste du combat.' },
  { nc: 9, nom: 'Déplacement magique (L)', desc: 'Le mystique possède une magie qui lui permet de se téléporter à une distance maximale de 30 mètres. Le lieu d\'arrivée doit être en ligne de vue ou parfaitement connu (10 minutes pour étudier le lieu).' },
  { nc: 11, nom: 'Instinct de survie', desc: "Une fois par tour, au moment de son choix, le mystique peut utiliser une action de mouvement supplémentaire pour se déplacer. Si un effet ou une créature le paralyse, le ralentit ou restreint ses mouvements, il a droit une fois par tour à un test d'INT ou de DEX au choix de difficulté 10 pour s'en débarrasser. Il gagne +5 en DEF lorsqu'il lui reste moins de [NC x 5] PV." },
  { nc: 13, nom: 'Résistance à la magie', desc: 'Le mystique dispose de défenses actives contre la magie, que ce soit dû à des vêtements enchantés, des cristaux ou des sorts actifs. Il réduit de 5 tous les DM provoqués par les sorts, les armes traditionnelles ou légendaires.' },
  { nc: 15, nom: 'Régénération magique', desc: 'Le mystique régénère magiquement 5 PV à la fin de chaque tour. Il faut détruire son corps pour le tuer complètement, que ce soit par le feu ou l\'acide par exemple.' },
]

export const VARIANTES_MYSTIQUE: VarianteMystique[] = [
  {
    id: 'arcaniste', nom: 'Arcaniste',
    description: 'Mystique ayant étudié les arts arcaniques pour tordre les lois physiques selon sa volonté.',
    capacites: [
      { nc: 3, nom: 'Maîtrise élémentaire (L)', desc: "L'attaque magique de l'arcaniste (feu, foudre ou glace) peut affecter une zone de 10 mètres de diamètre. Les cibles prises dans le souffle de l'explosion peuvent réaliser un test de DEX difficulté [10 + bonus universel] pour diviser les DM par deux. De plus, l'arcaniste gagne une RD égale au [bonus universel] contre tous les DM élémentaires. (Le test DEX et la RD élémentaire associée progressent avec le NC : DEX 11 à NC3-4, 12 à NC5-6, 13 à NC7-9, 14 à NC10-11, 15 à NC12-15 ; RD élémentaire 1 à NC3-4, 2 à NC5-6, 3 à NC7-9, 4 à NC10-11, 5 à NC12-13, 6 à NC14-15.)" },
      { nc: 6, nom: 'Image miroir (L)', desc: "L'arcaniste crée [1d4+1] images illusoires de lui-même. Lorsque lui ou l'un de ses doubles est pris pour cible, lancez [1d6]. Sur un résultat de 1 à 4, c'est un double qui est pris pour cible et est immédiatement détruit. Sur un résultat de 5 à 6, c'est l'arcaniste qui subit les DM normalement. De plus, les attaques magiques de l'arcaniste provoquent +1d6 DM par double illusoire encore présent. Les DM de zone peuvent détruire plusieurs doubles en une seule attaque." },
      { nc: 8, nom: 'Contrôle mental (L)', desc: "Si l'arcaniste réussit un test d'attaque magique opposé contre une cible à moins 20 mètres, il en prend le contrôle pendant [1d4] tours. L'arcaniste peut continuer à agir tout en maintenant le contrôle mental. Pendant toute la durée du sort, l'arcaniste et sa cible subissent un malus de -2 à tous leurs tests. Une victime d'un contrôle mental peut tenter de se libérer à chaque tour en réussissant un test de SAG difficulté [15 + bonus universel]. Le sort ne peut affecter une cible qu'une fois par jour." },
    ],
  },
  {
    id: 'guerisseur', nom: 'Guérisseur',
    description: 'Mystique dont la magie exceptionnelle est capable de modeler la chair et de refermer les plaies instantanément.',
    capacites: [
      { nc: 3, nom: 'Soigner (L)', desc: 'Le guérisseur est capable de soigner 50 % de la valeur maximale des PV de chaque créature qu\'il touche une fois par jour.' },
      { nc: 6, nom: 'Guérir (L)', desc: 'Ce pouvoir annule tous les effets préjudiciables, pénalités, poisons, maladies auxquels était soumise la cible. Portée : toucher la cible.' },
      { nc: 8, nom: 'Gaz alchimiques (L)', desc: "Le guérisseur dispose de fioles pleines d'un gaz nocif qu'il peut lancer sur le champ de bataille jusqu'à une portée de 10 mètres pour empoisonner les cibles prises dans un nuage de 4 mètres de diamètre. Chaque tour qu'une victime passe dans le gaz l'oblige à réussir un test de CON difficulté [12 + bonus universel] ou à subir 5 DM et être affaiblie pendant 1d4 tours. Le nuage persiste pendant 1d4 tours – un vent violent le disperse cependant immédiatement. (Difficulté du test CON : 15 à NC8-9, 16 à NC10-15.)" },
    ],
  },
  {
    id: 'necromancien', nom: 'Nécromancien',
    description: 'Mystique souvent maléfique versé dans la magie du sang, la perversion de la chair et la recherche de la puissance absolue.',
    capacites: [
      { nc: 3, nom: 'Vampirisation (L)', desc: 'Le nécromancien doit réussir une attaque magique sur une cible vivante à une distance maximale de 30 mètres. En cas de réussite, la cible subit [1d6 x NC/2] DM et la créature régénère autant de PV que de DM infligés. De plus, à chaque fois qu\'une créature meurt à moins de 20 mètres d\'elle, la créature siphonne son énergie et gagne [1d6 + NC] PV.' },
      { nc: 6, nom: 'Animer un cadavre (L)', desc: 'Ce pouvoir permet d\'animer le cadavre d\'une créature morte pendant le combat. La créature se relève avec les mêmes caractéristiques mais elle subit une pénalité de -2 en attaque et en initiative. Lorsque le cadavre est à nouveau vaincu, il ne peut plus être réanimé. Le cadavre de la créature animée ne peut être d\'un NC ou d\'un niveau supérieur à celui du nécromancien.' },
      { nc: 8, nom: 'Injonction mortelle (L)', desc: 'Une cible située à une distance maximale de 30 mètres doit réussir un test de CON difficulté 15 ou tomber à 0 PV (et mourir immédiatement s\'il s\'agit d\'un PNJ). En cas de succès, la cible subit tout de même [2d6 + NC] DM. Ce pouvoir ne peut prendre une même créature pour cible qu\'une seule fois par combat.' },
    ],
  },
]

function signe(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`
}

function trouverLigne(nc: number): LigneNC {
  return LIGNES.find(l => l.nc === nc) ?? LIGNES[0]
}

export function genererPNJMystique(varianteId: VarianteMystiqueId, nc: number, nom: string): BestiaireEntry {
  const variante = VARIANTES_MYSTIQUE.find(v => v.id === varianteId) ?? VARIANTES_MYSTIQUE[0]
  const ligne = trouverLigne(nc)
  const capacitesDebloquees = [...CAPACITES_COMMUNES, ...variante.capacites]
    .filter(c => c.nc <= nc && (c.ncMax === undefined || nc <= c.ncMax))
    .sort((a, b) => a.nc - b.nc)

  return {
    nom, nc, livres: ['Livre du Meneur'], page: '146',
    description: variante.description,
    caracteristiques: { ...ligne.caracteristiques },
    def: ligne.def,
    pv: ligne.pv,
    init: ligne.init,
    attaques: [
      { nom: ligne.armeMeleeNom, bonus: signe(ligne.armeMeleeBonus), dm: ligne.armeMeleeDm },
      { nom: 'Attaque magique (L)', bonus: signe(ligne.attMagBonus), dm: ligne.attMagDm },
    ],
    capacites: [
      { nom: 'Bonus universel', desc: `+${ligne.bonusUniversel} à tout test de caractéristique ou de compétence jugé pertinent par le MJ.` },
      ...capacitesDebloquees.map(c => ({ nom: c.nom, desc: c.desc })),
    ],
  }
}
