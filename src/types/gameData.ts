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
  | { type: 'FORMATION'; value: string; minRang?: number; avancee?: boolean }
  | { type: 'VOIE_RANG'; voie: string; rang: number; minRang?: number; avancee?: boolean }
  | { type: 'VOIE_RANG_CHOIX'; voies: string[]; rangMax: number; minRang?: number; avancee?: boolean }
  | { type: 'COMPAGNON'; nom: string; remplace?: string; minRang?: number; avancee?: boolean }
  | { type: 'COMPAGNON_CHOIX'; noms: string[]; minRang?: number; avancee?: boolean }
  | { type: 'EFFECT_CHOIX'; stats: string[]; value?: number; formula?: string; rangMultiplier?: boolean; condition?: EffectCondition; minRang?: number; avancee?: boolean }
  | { type: 'BONUS_TEMP'; label: string; bonus?: number; formula?: string; deDegats?: string; deDegatsParArme?: boolean; temporaire?: boolean; cibles: string[]; choix?: boolean; cout_pv?: string; cout_pm?: string; coutCaracStat?: string; coutCaracValeur?: number; usage?: string; post_jet?: boolean; precision?: string; minRang?: number; avancee?: boolean; masqueSiAvancee?: boolean; div2?: boolean; immunite?: boolean }
  | { type: 'AVANTAGE'; stat: string; lancer: number; garder: number; minRang?: number; avancee?: boolean; masqueSiAvancee?: boolean }
  | { type: 'ACTION'; label: string; de: number; dm: string; attType?: 'contact' | 'distance' | 'magique'; activable?: boolean; cout_pm?: string; minRang?: number; avancee?: boolean; masqueSiAvancee?: boolean }

export type RangEntry = { nom: string; desc: string; effects?: Effect[]; grants?: Grant[] }
export type DescMap = Record<string, RangEntry[]>
export type TraitEntry = { nom: string; desc: string }

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
  attaques?: CreatureAttaque[]
  capacites?: CreatureCapacite[]
  voies?: CreatureVoie[]
}

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

// Note libre côté joueur (onglet Notes) : texte en Markdown léger (gras/italique/listes) pouvant
// contenir des liens wiki [[Titre]] vers d'autres notes — cliquer un lien ouvre la note existante
// portant ce titre, ou en crée une vide si elle n'existe pas encore.
export type Note = {
  id: string
  titre: string
  contenu: string
  date?: string          // date libre (in fiction ou réelle), saisie par le joueur — pas de format imposé
  campagneId?: string    // référence à Campaign.id, si la note est rattachée à une campagne
  tags?: string[]        // libres, créés à la volée — pas d'entité séparée, juste une liste par note
  creeLe: string     // ISO timestamp
  modifieLe: string  // ISO timestamp
}
