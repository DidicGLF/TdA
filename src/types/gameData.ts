export type EffectCondition =
  | { type: 'hasBouclier' }
  | { type: 'hasArme'; armes: string[] }
  | { type: 'noArme' }

export type Effect = {
  stat: string
  value?: number
  formula?: string
  diceStr?: string
  minRang?: number
  avancee?: boolean
  rangMultiplier?: boolean
  condition?: EffectCondition
  // Pour les stats RD/RD_<TYPE> : au lieu d'une réduction à points fixes, divise par 2 les DM correspondants
  div2?: boolean
  // Pour les stats RD/RD_<TYPE> : immunité totale, les DM correspondants sont ramenés à 0 (prioritaire sur div2)
  immunite?: boolean
}

export type Grant =
  // nombre (défaut 1) : combien d'emplacements de formation martiale supplémentaires ce rang accorde —
  // toujours à choix libre du joueur parmi la liste complète (comme ses emplacements de base liés à sa
  // famille), jamais une formation imposée d'avance. Voir getBonusFormationsCount (voieRangChoix.ts).
  | { type: 'FORMATION'; nombre?: number; minRang?: number; avancee?: boolean }
  | { type: 'VOIE_RANG'; voie: string; rang: number; minRang?: number; avancee?: boolean }
  // rangMin (optionnel, défaut 1) : propose les rangs [rangMin..rangMax] de chaque voie listée, pas
  // toujours à partir de 1 — ex. un choix qui ne doit proposer QUE le rang 2 (rangMin=2, rangMax=2),
  // pour ne pas réoffrir le rang 1 quand on choisit à un rang plus élevé de la voie hôte.
  // avanceeGratuite : en plus du choix normal (nouvelle capacité), le picker propose aussi, pour une
  // capacité déjà choisie ailleurs et pas encore avancée, d'en obtenir gratuitement la version avancée
  // (sans coût en points) — ex. "Perfection élémentaliste" : ce choix-là se résout alors sans ajouter
  // de nouvelle capacité empruntée, juste en accordant l'avancée à la cible déjà choisie.
  | { type: 'VOIE_RANG_CHOIX'; voies: string[]; rangMax: number; rangMin?: number; minRang?: number; avancee?: boolean; avanceeGratuite?: boolean }
  | { type: 'COMPAGNON'; nom: string; remplace?: string; minRang?: number; avancee?: boolean }
  | { type: 'COMPAGNON_CHOIX'; noms: string[]; minRang?: number; avancee?: boolean }
  | { type: 'EFFECT_CHOIX'; stats: string[]; value?: number; formula?: string; rangMultiplier?: boolean; condition?: EffectCondition; minRang?: number; avancee?: boolean }
  | { type: 'BONUS_TEMP'; label: string; bonus?: number; formula?: string; deDegats?: string; deDegatsParArme?: boolean; temporaire?: boolean; cibles: string[]; choix?: boolean; cout_pv?: string; cout_pm?: string; coutCaracStat?: string; coutCaracValeur?: number; usage?: string; post_jet?: boolean; precision?: string; minRang?: number; avancee?: boolean; masqueSiAvancee?: boolean; div2?: boolean; immunite?: boolean }
  | { type: 'AVANTAGE'; stat: string; lancer: number; garder: number; minRang?: number; avancee?: boolean; masqueSiAvancee?: boolean }
  | { type: 'ACTION'; label: string; de: number; dm: string; attType?: 'contact' | 'distance' | 'magique'; activable?: boolean; cout_pm?: string; minRang?: number; avancee?: boolean; masqueSiAvancee?: boolean }

export type RangEntry = { nom: string; desc: string; effects?: Effect[]; grants?: Grant[] }
export type DescMap = Record<string, RangEntry[]>
export type TraitEntry = { nom: string; desc: string }
// Entrée du catalogue des voies (voies.json) : uniquement les métadonnées de classement. Le contenu
// des rangs (nom+desc de chaque rang) vit à part, dans DescMap, indexé par le même nom.
export type VoieEntry = { nom: string; famille: string; categorie: string }

export type Culture = {
  label: string
  voiePeuple: string
  voieCulturelle: string
  modCaracs: Record<string, number>
  trait?: { nom: string; desc: string }
}

export type PeupleEntry = { label: string; cultures: Culture[] }

export type CompanionAttaque = {
  nom: string
  bonus: string   // ex: "+5", "-1"
  dm: string      // ex: "1d6+4"
}

export type CompanionEntry = {
  nom: string
  for: number     // modificateur
  dex: number
  con: number
  int: number
  sag: number
  cha: number
  init: number | string
  def: number
  pv: number | string
  attaque1?: CompanionAttaque
  attaque2?: CompanionAttaque
  capacites?: string
}

export type CreatureCaracteristiques = {
  FOR: string
  DEX: string
  CON: string
  INT: string
  SAG: string
  CHA: string
}

export type CreatureAttaque = {
  nom: string      // ex: "Morsure et griffes", "Souffle (L)"
  bonus?: string   // ex: "+22"
  dm?: string      // ex: "4d6+16", "6d6+30"
  zone?: string    // ex: "(30 x 15 m)"
}

// Modificateur numérique simple sur une statistique nommée (ex: "DEF", "ATK"...) — bonus/malus déjà
// résolu en nombre, utilisé pour les ajustements manuels actifs du MJ en combat (StatCell +/-).
export type StatBuff = { stat: string; valeur: number }

// Effet préréglé d'une capacité : valeur non résolue (peut être un nombre fixe "5"/"+5" ou un jet de
// dé "1d6", "1d6+2"...), au même format texte que CreatureAttaque.bonus/.dm — résolue en StatBuff
// (un nombre) seulement au moment où le MJ active la capacité en combat.
export type CapaciteEffet = { stat: string; valeur: string }

export type CreatureCapacite = {
  nom: string
  desc: string
  effets?: CapaciteEffet[]   // appliqués d'un clic (après résolution du jet) quand le MJ active la capacité
}

// Capacité réutilisable d'une créature à l'autre (ex: "Vision nocturne", "Vol rapide") : le MJ la
// choisit dans cette bibliothèque au lieu de la retaper (et son éventuel effet) pour chaque créature —
// la copie posée sur une créature reste ensuite indépendante (voir CreatureCapacite ci-dessus).
export type CapaciteBibliotheque = {
  id: string
  nom: string
  desc: string
  effets?: CapaciteEffet[]
}

// Objets magiques (Livre du meneur, p.183-190) — voir enchantements-magiques.json (catalogue de
// référence statique, tables du livre) et objets-magiques.json/objets-magiques-perso.json (objets créés
// par le MJ, un par un, en piochant dans ce catalogue).
export type ObjetMagiqueCategorie = 'traditionnel' | 'focalisateur' | 'legendaire'
// 'accessoire' couvre les objets légendaires narratifs sans emplacement de combat (bague, amulette,
// vêtement...) — pas d'enchantements arme/armure/focalisateur disponibles, seulement pouvoir/puissance
// ou un effet purement descriptif (cf. les deux exemples du livre : Bague de symbiose aquatique,
// Fragment du cristal noir).
export type ObjetMagiqueSlot = 'arme' | 'armure' | 'bouclier' | 'focalisateur' | 'accessoire'
export type TraditionPeuple = 'elfe' | 'nain' | 'orc' | 'gobelin' | 'ogre'

// Un enchantement choisi dans enchantements-magiques.json (ou saisi à la main pour un enchantement de
// pouvoir) et copié sur l'objet — indépendant du catalogue de référence ensuite, comme
// CapaciteBibliotheque copiée sur CreatureCapacite.effets.
export type EnchantementApplique = {
  nom: string
  niveauMagie: number
  effets?: CapaciteEffet[]
  // Effet non réductible à un simple bonus de stat (ex. "dégainer est une action gratuite") — toujours
  // affiché, y compris quand effets est vide ou ne couvre qu'une partie de l'enchantement.
  texte?: string
}

export type ObjetMagiqueEntry = {
  id: string
  nom: string
  categorie: ObjetMagiqueCategorie
  slot: ObjetMagiqueSlot
  tradition?: TraditionPeuple           // si categorie === 'traditionnel' — purement descriptif/filtre
  degreQualite?: 1 | 2 | 3              // idem, purement descriptif (1=-, 2=Supérieure, 3=Exceptionnelle)
  // Statistiques de base si slot === 'arme' — aucun enchantement ne modélise un dé de dégâts ou une
  // caractéristique d'attaque (ce ne sont que des bonus), donc rien pour les déduire automatiquement :
  // saisies à la main par le MJ. Utilisées pour synthétiser une Arme classique (character.armes) quand
  // le joueur possède l'objet (voir EquipementModal.tsx, togglePossede) — au-delà de là, l'objet se
  // comporte comme n'importe quelle arme "hors catalogue" existante, aucun autre branchement nécessaire.
  armeDm?: string
  armeAttaque?: 'FOR' | 'DEX' | 'INT'
  // TOUS les enchantements appliqués, y compris l'effet de base tradition/focalisateur (copié ici par
  // ObjetMagiqueDetail au moment du choix de tradition+degré/focalisateur+degré, comme n'importe quel
  // autre enchantement) — computeEffectsWithCristaux ne lit QUE ce tableau, jamais tradition/
  // degreQualite directement : ces deux champs ne servent qu'à l'affichage et au filtrage du picker.
  enchantements: EnchantementApplique[]
  // Niveau de magie narratif assigné directement par le MJ (0 par défaut) — utile pour un objet
  // légendaire "accessoire" (bague, amulette...) dont le pouvoir n'est pas réductible à un enchantement
  // du catalogue, cf. les exemples du livre (Bague de symbiose aquatique, Fragment du cristal noir).
  niveauMagieBase?: number
  niveauMagie: number   // total = niveauMagieBase + somme des niveauMagie de enchantements
  valeur: number         // niveauMagie² × 200 po
  description?: string   // texte libre (lore)
}

export type CreatureVoieRang = {
  rang: number
  nom: string
  desc: string
}

export type CreatureVoie = {
  nom: string          // ex: "Voie de l'envoûtement"
  rang: number         // rang atteint par la créature
  reference?: string   // ex: "LdJ p.134"
  rangs: CreatureVoieRang[]
}

export type BestiaireEntry = {
  nom: string
  nc: number   // Niveau de Créature (0, 0.5, 1, 2, ... 20)
  livres: string[]
  page?: string
  taille?: string
  image?: string
  imageScale?: number
  imageTx?: number
  imageTy?: number
  imageFit?: 'cover' | 'contain'
  imageLocked?: boolean
  description?: string
  caracteristiques?: CreatureCaracteristiques
  def?: number
  pv?: number
  init?: number
  rd?: number
  // Types de dégâts auxquels la RD ci-dessus s'applique (ex. "RD 5 (Feu, Froid)" dans le livre) —
  // codes identiques à DAMAGE_TYPES (GameModePanel) : FEU/FROID/FOUDRE/ACIDE/POISON/NECROTIQUE/
  // TENEBRES/LUMIERE/MENTAL/TRANCHANT/PERFORANT/CONTONDANT. Vide/absent = RD générale (tous types).
  // Purement informatif pour le MJ : combat.ts applique toujours rd à plat, sans lire ce champ.
  rdTypes?: string[]
  attaques?: CreatureAttaque[]
  capacites?: CreatureCapacite[]
  voies?: CreatureVoie[]
}

// Les champs d'illustration d'une créature, isolés du reste de la fiche.
// Voir CHAMPS_ILLUSTRATION et bestiaire-illustrations.json (GameDataContext) : poser sa propre image
// sur une créature livrée ne doit pas figer ses statistiques, donc l'illustration se range à part.
export type BestiaireIllustration = Pick<
  BestiaireEntry,
  'image' | 'imageScale' | 'imageTx' | 'imageTy' | 'imageFit' | 'imageLocked'
>
// Illustrations posées par l'utilisateur sur des créatures livrées, indexées par nom de créature
// (le nom est déjà l'identifiant des créatures partout : rencontres, batailles, liens de notes).
export type BestiaireIllustrations = Record<string, BestiaireIllustration>

export type Difficulte = 'facile' | 'ordinaire' | 'difficile' | 'extreme'

export type CoutPAEntry = { niveau: number; facile: number; ordinaire: number; difficile: number; extreme: number }
// nc: null représente l'entrée "-" (aucune créature, coût 0), distincte du vrai NC 0
export type NCPAEntry = { nc: number | null; pa: number }
export type RencontreData = { coutPA: CoutPAEntry[]; ncPA: NCPAEntry[] }

export type RencontreAdversaire = {
  nc: number
  manuel: boolean          // true si le NC a été fixé à la main (pas redistribué automatiquement)
  creatureNom: string | null  // nom de la créature choisie dans le bestiaire (lien par nom)
}

export type RencontreSauvegardee = {
  id: string
  nom: string
  nombrePJs: number
  niveauMoyen: number
  difficulte: Difficulte
  adversaires: RencontreAdversaire[]
  creeLe: string   // ISO timestamp
}

// Campagne à laquelle une note peut être rattachée (voir Note.campagneId) — permet de séparer les
// notes de plusieurs campagnes suivies en parallèle.
export type Campaign = {
  id: string
  nom: string
}

// Image partagée entre notes (bibliothèque centrale, comme les portraits de personnage/créatures
// ailleurs dans l'app) — référencée dans le texte d'une note via ![[Nom]], jamais embarquée telle
// quelle dans son contenu.
export type NoteImage = {
  id: string
  nom: string   // référence utilisée dans ![[Nom]] — unique (comme les titres de notes pour [[Titre]])
  data: string  // data URL (base64)
}

// Marque-page personnalisé : un signet simple pointe juste vers une page (decalage absent), une ancre
// pointe plus précisément vers une position de caractère dans le texte de cette page (ex. un
// paragraphe précis) — les deux se retrouvent via la recherche (voir NotesTab.tsx) et permettent d'y
// revenir d'un clic sans avoir à re-parcourir la note.
export type NoteMarque = {
  id: string
  nom: string
  page: number        // index de page (0-based) où se trouve le marque-page
  decalage?: number    // position de caractère dans le texte de cette page — absent pour un simple signet de page
}

// Note (onglet Notes, côté joueur ou côté MJ selon la bibliothèque utilisée) : texte en Markdown léger
// (gras/italique/listes) pouvant contenir des liens wiki [[Titre]] — résolus (voir resoudreLien dans
// NotesTab.tsx) contre une autre note en priorité, puis, capacité réservée au MJ, contre une créature
// du Bestiaire ou une rencontre sauvegardée portant ce nom ; sinon le lien crée une note vide.
export type RelationType = 'amical' | 'ennemi' | 'neutre'

export type Note = {
  id: string
  titre: string
  contenu: string
  date?: string          // date libre (in fiction ou réelle), saisie par le joueur — pas de format imposé
  campagneId?: string    // référence à Campaign.id, si la note est rattachée à une campagne
  tags?: string[]        // libres, créés à la volée — pas d'entité séparée, juste une liste par note
  marques?: NoteMarque[] // signets de page / ancres de paragraphe personnalisés
  couleur?: string       // repère visuel libre (hex "#rrggbb"), utilisé pour la pastille dans NotesGraph
  // Relation affichée en symbole sur le lien correspondant dans NotesGraph, jamais ailleurs dans
  // l'interface — versId = id de la note ciblée par un [[Titre]] présent dans le contenu de CETTE note.
  // Absent de la liste = relation jamais catégorisée (lien affiché neutre par défaut, à distinguer du
  // type 'neutre' explicitement choisi qui, lui, affiche son propre symbole).
  // Deux textes indépendants affichables le long du lien dans NotesGraph — labelHaut TOUJOURS au-dessus
  // du trait, labelBas TOUJOURS en dessous (position fixe, qui ne dépend pas de qui a écrit le [[lien]]
  // wiki — contrairement à un ancien essai où la position dépendait du sens, source de confusion : le
  // champ du haut dans le menu affichait son texte en dessous, et inversement). Sert quand les deux notes
  // n'ont pas le même avis l'une de l'autre (ex. CETTE note "aime" versId, qui ne ressent que de la
  // "neutralité" en retour) : un texte par sens, chacun avec sa propre flèche.
  // *Inverse : chaque texte a sa propre flèche, réglable indépendamment de sa position (haut/bas) —
  // absent/false = sens par défaut (labelHaut → vers versId, labelBas → vers cette note) ; true = sens
  // opposé. Modifiable au clic sur la flèche à côté du champ, dans le menu du lien.
  // type optionnel : un lien peut n'avoir que du texte (labelHaut/labelBas), sans symbole ● au milieu —
  // absent = pas de symbole, à distinguer d'un choix explicite de 'neutre' (qui, lui, affiche ●).
  relations?: { versId: string; type?: RelationType; labelHaut?: string; labelHautInverse?: boolean; labelBas?: string; labelBasInverse?: boolean }[]
  // Position déplacée à la main dans NotesGraph (coordonnées de l'espace virtuel CANVAS) — persistée ici
  // pour que repositionner un nœud (ex. pour démêler des liens qui se croisent) reste utile d'une
  // session à l'autre. Absent = position calculée par la disposition à ressorts (voir meilleureDisposition).
  graphPosition?: { x: number; y: number }
  creeLe: string     // ISO timestamp
  modifieLe: string  // ISO timestamp
}
