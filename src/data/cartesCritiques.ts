// Cartes de réussites et d'échecs critiques (livret "1023_tda_c02_cartes_reussites_et_echecs_critiques").
// 25 cartes par catégorie, chacune avec un effet global OU trois effets selon le type d'attaque qui a
// provoqué le jet naturel de 1 (échec) ou 20 (réussite). Texte du livre en dur, en lecture seule — les
// cartes activables/désactivables et les corrections de texte du MJ vivent dans une couche perso séparée
// (voir utils/cartesCritiquesPerso.ts + GameDataContext), pas ici : ce fichier ne contient QUE le contenu
// livré. Le tirage reste une aide de jeu appliquée oralement par le MJ, pas une mécanique automatisée
// (voir blocsPertinents plus bas).

export type CategorieCarteCritique = 'echec' | 'reussite'
export type TypeBlocCarte = 'global' | 'contact' | 'distance' | 'magique'

export interface BlocCarteCritique {
  type: TypeBlocCarte
  texte: string
}

export interface CarteCritique {
  numero: number
  blocs: BlocCarteCritique[]
}

export const CARTES_ECHECS: CarteCritique[] = [
  { numero: 1, blocs: [
      { type: 'global', texte: "Raffut d’enfer : si la discrétion était de mise, c’est totalement raté et cela attire des renforts. Sinon lancez un d6 : sur 1-2 le bruit attire un adversaire du niveau de la rencontre – 1 (rencontre « facile »). Par exemple un prédateur en pleine nature." },
    ] },
  { numero: 2, blocs: [
      { type: 'contact', texte: "Bousculé : réussir un test de FOR difficulté [10+Mod. de FOR de l’adversaire] ou être renversé." },
      { type: 'distance', texte: "Glissade : réussir un test de DEX difficulté 12 ou être renversé." },
      { type: 'magique', texte: "Choc en retour : réussir un test de CON difficulté [10 + rang du sort] ou être renversé." },
    ] },
  { numero: 3, blocs: [
      { type: 'contact', texte: "Maladresse : réussir un test de DEX difficulté 15 ou lâcher son arme (difficulté 10 pour une arme tenue à deux mains)." },
      { type: 'distance', texte: "Maladresse : réussir un test de DEX difficulté 15 ou lâcher son arme (difficulté 10 pour une arme tenue à deux mains)." },
      { type: 'magique', texte: "Maladresse : Cet effet est valable aussi pour un lanceur de sorts s’il tenait un objet en main ou un focalisateur magique (par exemple son bâton). Sinon aucun effet." },
    ] },
  { numero: 4, blocs: [
      { type: 'global', texte: "Coup de mou : réussir un test de CON difficulté [10+nb de tours de combat] ou subir l’état affaibli. Le personnage peut annuler cet état en reprenant son souffle par une action limitée et un PR." },
    ] },
  { numero: 5, blocs: [
      { type: 'contact', texte: "Erreur tactique : réussir un test d’INT difficulté 15 ou subir une attaque (gratuite) d’un adversaire à son contact." },
      { type: 'distance', texte: "Erreur dramatique : réussir un test d’INT difficulté 15 ou blesser un allié à moins de 3 mètres de la cible. S’il n’y a pas d’allié dans la zone, aucun effet." },
      { type: 'magique', texte: "Erreur de casting : réussir un test d’INT difficulté 15 ou cibler un allié en vue. S’il n’y a pas d’allié en vue, aucun effet." },
    ] },
  { numero: 6, blocs: [
      { type: 'global', texte: "Distrait : réussir un test de SAG difficulté 15 ou être distrait. Le personnage ne voit pas venir la prochaine attaque, il subit un malus de -10 en DEF sur la prochaine attaque subie avant la fin de son prochain tour." },
    ] },
  { numero: 7, blocs: [
      { type: 'global', texte: "Ridicule : réussir un test de CHA difficulté 15 ou le personnage fait un faux mouvement à la fois douloureux et ridicule. Il subit l’état étourdi pendant un tour pour reprendre contenance." },
    ] },
  { numero: 8, blocs: [
      { type: 'contact', texte: "Arme brisée : une arme ordinaire est brisée. Une arme magique est ébréchée ou altérée : ses DM sont divisés par deux pour le reste du combat." },
      { type: 'distance', texte: "Arme brisée : une arme ordinaire est brisée. Une arme magique est ébréchée ou altérée : ses DM sont divisés par deux pour le reste du combat." },
      { type: 'magique', texte: "Blocage mental : le lanceur de sorts ne peut plus lancer ce sort pour le reste du combat." },
    ] },
  { numero: 9, blocs: [
      { type: 'contact', texte: "Armure mal ajustée : Une pièce d’armure bouge et devient gênante. Armure légère (cuir à cuir renforcé) : - 2 à tous les tests. Armure lourde (chemise de mailles à armure de plaques) : -3 à tous les tests. Le combattant peut réduire ce malus de 1 point par action limitée qu’il utilise à cet effet." },
      { type: 'distance', texte: "Armure mal ajustée : Une pièce d’armure bouge et devient gênante. Armure légère (cuir à cuir renforcé) : - 2 à tous les tests. Armure lourde (chemise de mailles à armure de plaques) : -3 à tous les tests. Le combattant peut réduire ce malus de 1 point par action limitée qu’il utilise à cet effet." },
      { type: 'magique', texte: "Lumineux : le corps du lanceur de sorts émet une vive lumière colorée dans un rayon de 3 mètres. Il subit un malus de -2 en DEF contre les attaques à distance pour le reste du combat." },
    ] },
  { numero: 10, blocs: [
      { type: 'contact', texte: "Automutilation : le personnage se blesse avec sa propre arme. Il subit 1d4 DM (1d6 DM pour une arme à deux mains)." },
      { type: 'distance', texte: "Automutilation : le personnage se blesse avec sa propre arme. Il subit 1d4 DM (1d6 DM pour une arme à deux mains)." },
      { type: 'magique', texte: "Brûlure de magie : le lanceur de sorts subit 1 point de DM par rang du sort." },
    ] },
  { numero: 11, blocs: [
      { type: 'contact', texte: "Crampe : le personnage est ralenti pendant 1d6 tours. Test de CON difficulté 15 pour mettre fin à cet effet à la fin de chaque tour." },
      { type: 'distance', texte: "Crampe : pour toutes les attaques à distance, le personnage est affaibli pendant 1d6 tours. Test de CON difficulté 15 pour mettre fin à cet effet à la fin de chaque tour." },
      { type: 'magique', texte: "Glitch temporel : le lanceur de sorts est ralenti pendant 1d6 tours. Test d’INT difficulté 15 pour mettre fin à cet effet à la fin de chaque tour." },
    ] },
  { numero: 12, blocs: [
      { type: 'contact', texte: "Aveuglé : du sang, de la sueur ou une pièce d’équipement aveugle le personnage pendant 1d4 tours. Utiliser une action d’attaque pour mettre fin à cet effet." },
      { type: 'distance', texte: "Aveuglé : du sang, de la sueur ou une pièce d’équipement aveugle le personnage pendant 1d4 tours. Utiliser une action d’attaque pour mettre fin à cet effet." },
      { type: 'magique', texte: "Cécité des mages : la magie brûle la rétine du lanceur de sorts. Il est aveuglé pendant 1d4 tours et peut utiliser une action d’attaque pour mettre fin à cet effet." },
    ] },
  { numero: 13, blocs: [
      { type: 'contact', texte: "Douleur vive : le personnage se fait mal où se bloque le dos, il est immobilisé jusqu’à la fin de son prochain tour." },
      { type: 'distance', texte: "Douleur vive : le personnage se fait mal où se bloque le dos, il est immobilisé jusqu’à la fin de son prochain tour." },
      { type: 'magique', texte: "Tétanisé : la magie tétanise le lanceur de sorts. Il est immobilisé pour 1 tour par rang du sort. Test d’INT difficulté 15 pour mettre fin à cet effet à la fin de chaque tour." },
    ] },
  { numero: 14, blocs: [
      { type: 'global', texte: "Dans le décor : une pièce de décor est touchée par l’attaque, elle s’effondre ou est détruite et inflige 1d4 DM au personnage. Si elle est assez grande, elle peut affecter plusieurs créatures, alliés et adversaires." },
    ] },
  { numero: 15, blocs: [
      { type: 'global', texte: "Renfort : les adversaires profitent d’un renfort inattendu. Lancer 1d6 : 1-5 renfort mineur (niveau de rencontre « facile » niveau - 1). 6 : renfort important (niveau de rencontre « ordinaire » du niveau de la rencontre)." },
    ] },
  { numero: 16, blocs: [
      { type: 'global', texte: "La totale : par un concours de circonstances à la fois fatal et comique, vous tirez deux cartes et appliquez leurs effets." },
    ] },
  { numero: 17, blocs: [
      { type: 'global', texte: "In extremis : vous frôlez la catastrophe, mais évitez le pire. Vous récupérez un point de chance (sans dépasser votre maximum) !" },
    ] },
  { numero: 18, blocs: [
      { type: 'global', texte: "Épuisement : le personnage s’épuise et perd 1 point de récupération. S’il n’en avait plus, il est affaibli jusqu’à la fin du combat." },
    ] },
  { numero: 19, blocs: [
      { type: 'contact', texte: "Hémorragie : une blessure se réouvre et saigne abondamment, le personnage perd 1 PV par round jusqu’à la fin du combat. Cet effet est ignoré si le personnage n’a encore perdu aucun PV aujourd’hui." },
      { type: 'distance', texte: "Hémorragie : une blessure se réouvre et saigne abondamment, le personnage perd 1 PV par round jusqu’à la fin du combat. Cet effet est ignoré si le personnage n’a encore perdu aucun PV aujourd’hui." },
      { type: 'magique', texte: "Hémorragie de magie : le lanceur de sorts perd 1d4 points de magie (en plus du coût normal du sort). S’il n’en a pas assez, appliquez les effets de la brûlure de magie (1PV perdu pour chaque PM manquant)." },
    ] },
  { numero: 20, blocs: [
      { type: 'global', texte: "Entorse : divisez le déplacement par deux jusqu’à ce que le personnage consomme 1 PR." },
    ] },
  { numero: 21, blocs: [
      { type: 'contact', texte: "Ébréché : l’arme utilisée est ébréchée, elle inflige -1 aux DM jusqu’à la fin du combat." },
      { type: 'distance', texte: "Dysfonctionnement : l’arme inflige -1 DM jusqu’à la fin du combat (par exemple, la corde d’un arc est détendue)." },
      { type: 'magique', texte: "Surdité des mages : la magie brûle le tympan du lanceur de sorts, il est sourd pour le reste du combat (-1 aux tests d’attaque magique)." },
    ] },
  { numero: 22, blocs: [
      { type: 'contact', texte: "Oups ! Vous avez failli lâcher votre arme, pas d’autre action lors de ce tour." },
      { type: 'distance', texte: "Oups ! Vous avez failli lâcher votre arme, pas d’autre action lors de ce tour." },
      { type: 'magique', texte: "Sort avorté : vous comprenez très vite que le sort est raté, vous pouvez faire une action de mouvement à la place." },
    ] },
  { numero: 23, blocs: [
      { type: 'global', texte: "Muet : dans l’excitation du combat, le personnage se mord fortement la langue. Pendant 1d4 rounds, il ne peut pas parler de façon intelligible. Un lanceur de sorts utilise un d12 en attaque magique." },
    ] },
  { numero: 24, blocs: [
      { type: 'contact', texte: "Coincé : l’arme est coincée dans un obstacle (un arbre, un meuble ou même au sol). Il faut réussir un test de FOR difficulté 12 pour la décoincer (action d’attaque)." },
      { type: 'distance', texte: "Déréglé : pour une arbalète ou un arc, il faut réussir un test d’INT difficulté 12 (action d’attaque) pour la rendre fonctionnelle. Les armes plus simples ne subissent pas cet effet." },
      { type: 'magique', texte: "Confus : le lanceur de sorts perd sa concentration et doit réussir un test de SAG difficulté 12 avant de pouvoir de nouveau lancer un sort (action d’attaque)." },
    ] },
  { numero: 25, blocs: [
      { type: 'contact', texte: "Mutilation : blessure à la main. Toutes les actions avec cette main sont effectuées avec -2 au test pour le reste du combat." },
      { type: 'distance', texte: "Mutilation : blessure à la main. Toutes les actions avec cette main sont effectuées avec -2 au test pour le reste du combat." },
      { type: 'magique', texte: "Retour de flamme : le lanceur de sorts s’embrase brusquement et subit 1d4 DM par rang du sort." },
    ] },
]

export const CARTES_REUSSITES: CarteCritique[] = [
  { numero: 1, blocs: [
      { type: 'global', texte: "Critique normal : (DM x 2 hors dés bonus)" },
    ] },
  { numero: 2, blocs: [
      { type: 'global', texte: "Coup puissant : vous infligez les DM maximaux (hors dés bonus) sans doubler les bonus. Ceci remplace les DM x 2 du critique habituel. Par exemple : 1d6+3 donne 9 DM." },
    ] },
  { numero: 3, blocs: [
      { type: 'global', texte: "Coup parfait ! Vous infligez les DM maximaux sur les dés (hors dés bonus) puis vous appliquez les DM x 2 du critique. Par exemple : 1d6+3 donne 18 DM !" },
    ] },
  { numero: 4, blocs: [
      { type: 'global', texte: "Coup destructeur : vous multipliez les DM par 3 au lieu de x 2 (hors dés bonus). Si une capacité vous permet déjà de multiplier vos DM par 3, vous les multipliez par 4." },
    ] },
  { numero: 5, blocs: [
      { type: 'global', texte: "Coup de maître : vous ajoutez votre niveau aux DM infligés (vous ne multipliez pas ce bonus par 2)." },
    ] },
  { numero: 6, blocs: [
      { type: 'global', texte: "Coup de génie : vous obtenez un effet supplémentaire au choix parmi : renverser, aveugler (1 tour complet), faire reculer de 3 mètres ou désarmer la cible." },
    ] },
  { numero: 7, blocs: [
      { type: 'contact', texte: "Entaille profonde : +3 DM." },
      { type: 'distance', texte: "Perforation profonde : +2 DM." },
      { type: 'magique', texte: "Choc puissant : La victime recule de 3 mètres dans une direction au choix de l’attaquant." },
    ] },
  { numero: 8, blocs: [
      { type: 'contact', texte: "Entaille sévère : +5 DM." },
      { type: 'distance', texte: "Perforation interne : +2 DM, hémorragie 1." },
      { type: 'magique', texte: "Hématome douloureux : +1 DM, -1 aux actions." },
    ] },
  { numero: 9, blocs: [
      { type: 'contact', texte: "Entaille sanglante : +5 DM, hémorragie 1." },
      { type: 'distance', texte: "Perforation sanglante : +3 DM, hémorragie 2." },
      { type: 'magique', texte: "Hématome très douloureux : +2 DM, -2 aux actions." },
    ] },
  { numero: 10, blocs: [
      { type: 'contact', texte: "Entaille sanglante : +7 DM, hémorragie 1." },
      { type: 'distance', texte: "Perforation sanglante : +5 DM, hémorragie 2." },
      { type: 'magique', texte: "Hématome très douloureux : +3 DM, -2 aux actions." },
    ] },
  { numero: 11, blocs: [
      { type: 'contact', texte: "Coup puissant aux membres supérieurs : +3 DM, test de CON 10 ou arme lâchée." },
      { type: 'distance', texte: "Coup profond aux membres supérieurs : +2 DM, test de CON 12 ou arme lâchée." },
      { type: 'magique', texte: "Coup violent aux membres supérieurs : +1 DM, test de CON 15 ou arme lâchée." },
    ] },
  { numero: 12, blocs: [
      { type: 'contact', texte: "Tendon entaillé : d12 pour toutes les actions des membres supérieurs." },
      { type: 'distance', texte: "Muscle perforé : d12 à toutes les actions des membres supérieurs, hémorragie 1." },
      { type: 'magique', texte: "Articulation luxée : d12 pour toutes les actions des membres supérieurs." },
    ] },
  { numero: 13, blocs: [
      { type: 'contact', texte: "Coup puissant aux membres inférieurs : invalide. Test de FOR difficulté 15 ou la cible est renversée." },
      { type: 'distance', texte: "Coup précis aux membres inférieurs : invalide, hémorragie 1. Test de FOR difficulté 10 ou la cible est renversée." },
      { type: 'magique', texte: "Coup violent aux membres inférieurs : invalide. Test de FOR difficulté 20 ou la cible est renversée." },
    ] },
  { numero: 14, blocs: [
      { type: 'contact', texte: "Large plaie sur un membre supérieur : test de CON difficulté 13 ou le membre n’est plus utilisable." },
      { type: 'distance', texte: "Plaie profonde sur un membre supérieur : test de CON difficulté 10 ou le membre n’est plus utilisable." },
      { type: 'magique', texte: "Os brisé sur un membre supérieur : test de CON difficulté 15 ou le membre n’est plus utilisable." },
    ] },
  { numero: 15, blocs: [
      { type: 'contact', texte: "Coup puissant à la poitrine : +6 DM et test de CON difficulté 13 ou ralenti." },
      { type: 'distance', texte: "Blessure profonde à la poitrine : +3 DM et test de CON difficulté 13 ou ralenti." },
      { type: 'magique', texte: "Coup violent à la poitrine : test de CON difficulté 15 ou ralenti." },
    ] },
  { numero: 16, blocs: [
      { type: 'contact', texte: "Plaie béante à la poitrine : +6 DM et test de CON difficulté 13 ou affaibli." },
      { type: 'distance', texte: "Perforation profonde à la poitrine : +3 DM et test de CON difficulté 13 ou affaibli." },
      { type: 'magique', texte: "Coup violent à la poitrine : test de CON difficulté 15 ou affaibli." },
    ] },
  { numero: 17, blocs: [
      { type: 'contact', texte: "Coup puissant à la poitrine : +6 DM et étourdi 1 tour." },
      { type: 'distance', texte: "Blessure profonde à la poitrine : +3 DM, étourdi 1 tour, hémorragie 1." },
      { type: 'magique', texte: "Coup violent à la poitrine : étourdi 2 tours." },
    ] },
  { numero: 18, blocs: [
      { type: 'contact', texte: "Coup terrible aux membres inférieurs : le sang gicle à gros bouillons. +8 DM, invalide, hémorragie 2." },
      { type: 'distance', texte: "Empalé ! +6 DM et hémorragie 3. S’il s’agit d’une arme de trait, la cible est affaiblie tant que le projectile n’est pas retiré (1 action d’attaque, 1d6 DM)." },
      { type: 'magique', texte: "Coup phénoménal aux membres inférieurs : pirouette et réception en vrac. Renversé, +10 DM, invalide." },
    ] },
  { numero: 19, blocs: [
      { type: 'contact', texte: "Éventration... La pauvre victime doit ramasser ses entrailles dans un flot de sang. DM +10, hémorragie 3, étourdi 1 tour." },
      { type: 'distance', texte: "Embroché ! Le coup d’une précision diabolique vise le cœur… DM +10, hémorragie 4, étourdi 1 tour." },
      { type: 'magique', texte: "Coup destructeur à la cage thoracique : la victime s’effondre net dans un craquement de mauvais augure. Renversé, +5 DM, étourdi 1 tour, affaibli." },
    ] },
  { numero: 20, blocs: [
      { type: 'contact', texte: "Coup à la gorge : la victime saigne à gros bouillons, hémorragie 5, +15 DM, muet." },
      { type: 'distance', texte: "Dans le mille ! Attaque vicieuse au cerveau en passant par les yeux. +12 DM, test de CON difficulté 10 ou inconscient. Aveuglé." },
      { type: 'magique', texte: "Sbrotch ! La tête amorce une spirale infernale bientôt imitée par tout le corps. +20 DM, test de CON difficulté 10 ou inconscient." },
    ] },
  { numero: 21, blocs: [
      { type: 'contact', texte: "Brise-bouclier : si la cible possède un bouclier, il est brisé ou arraché. Sinon pas d’effet supplémentaire." },
      { type: 'distance', texte: "Coup précis : piqûre à la main. Une arme ou un bouclier est lâché. Sinon pas d’effet supplémentaire." },
      { type: 'magique', texte: "Brise-bouclier : si la cible possède un bouclier il est brisé ou arraché. Sinon pas d’effet supplémentaire." },
    ] },
  { numero: 22, blocs: [
      { type: 'contact', texte: "Brise armure : si la cible porte une armure, elle perd 2 en DEF." },
      { type: 'distance', texte: "Point faible : vous avez repéré le point faible de la cuirasse. La cible perd 2 en DEF contre vos attaques." },
      { type: 'magique', texte: "Brise armure : si la cible porte une armure de métal, elle perd 3 en DEF. Sinon pas d’effet supplémentaire." },
    ] },
  { numero: 23, blocs: [
      { type: 'global', texte: "Brise arme : brise l’arme de l’adversaire en plus d’infliger les DM. Si la cible ne possède pas d’arme, elle subit +1d6 DM." },
      { type: 'distance', texte: "Épinglé : vous clouez au sol (ou au mur) votre adversaire : il est immobilisé jusqu’à la fin de son prochain tour." },
      { type: 'magique', texte: "Assommer : vous cognez votre adversaire à la tête : il est étourdi jusqu’à la fin de son prochain tour." },
    ] },
  { numero: 24, blocs: [
      { type: 'contact', texte: "Membre tranché ! Le membre est inutilisable pour le reste du combat (tranché dans le cas d’un PNJ)." },
      { type: 'distance', texte: "Poumon perforé : la victime est ralentie." },
      { type: 'magique', texte: "K.O. ! Coup brutal à la poitrine, souffle coupé. Renversé et étourdi pendant 1 tour, puis immobilisé pour 3 tours." },
    ] },
  { numero: 25, blocs: [
      { type: 'contact', texte: "Décapitation ! Test de CON difficulté 10 ou la victime perd la tête dans une gerbe de sang. Gore." },
      { type: 'distance', texte: "En plein cœur ! Test de CON difficulté 10 ou la victime meurt dans un hoquet de surprise. Net et sans bavure." },
      { type: 'magique', texte: "Coup du lapin ! Test de FOR difficulté 10 ou les cervicales cassent dans un craquement sinistre. Mort sur le coup." },
    ] },
]

export function carteParNumero(categorie: CategorieCarteCritique, numero: number): CarteCritique | null {
  const liste = categorie === 'echec' ? CARTES_ECHECS : CARTES_REUSSITES
  return liste.find(c => c.numero === numero) ?? null
}

// Bloc(s) à lire pour un type d'attaque donné : le bloc spécifique s'il existe, sinon le bloc "global"
// (cartes à effet unique) — jamais les deux. Type inconnu/absent (contexte non déterminable, ex. jet MJ
// sans classification contact/distance/magique) : tous les blocs, comme sur la carte physique — au MJ
// de lire celui qui convient.
export function blocsPertinents(carte: CarteCritique, type?: TypeBlocCarte | null): BlocCarteCritique[] {
  if (!type) return carte.blocs
  const specifiques = carte.blocs.filter(b => b.type === type)
  if (specifiques.length > 0) return specifiques
  return carte.blocs.filter(b => b.type === 'global')
}
