// Reconnaissance du type d'un fichier importé, pour signaler précisément à l'utilisateur "ce fichier
// n'est pas une créature (c'est un personnage)" plutôt qu'une erreur générique — ou pire, l'accepter
// silencieusement à la mauvaise place (voir GMDashboard.importerCreatures, SaveLoadPanel.importLibrary).
// Les exports récents posent un champ `type` explicite (voir tagués ci-dessous) ; les fichiers plus
// anciens ou d'un autre point de l'appli sont reconnus par leur forme (repli structurel).
export type TypeFichier =
  | 'personnage'
  | 'bibliotheque-personnages'
  | 'creature'
  | 'objet-magique'
  | 'rencontre'
  | 'bataille'
  | 'gabarit-bataille'
  | 'note'
  | 'notes-groupe'

const TYPES_CONNUS: TypeFichier[] = [
  'personnage', 'bibliotheque-personnages', 'creature', 'objet-magique', 'rencontre',
  'bataille', 'gabarit-bataille', 'note', 'notes-groupe',
]

// Clé i18n (typeFichier.<key>) associée à chaque type, pour construire un message du genre
// "ce fichier n'est pas {{attendu}} ({{trouve}})".
export const CLE_LABEL_TYPE: Record<TypeFichier, string> = {
  'personnage': 'personnage',
  'bibliotheque-personnages': 'bibliothequePersonnages',
  'creature': 'creature',
  'objet-magique': 'objetMagique',
  'rencontre': 'rencontre',
  'bataille': 'bataille',
  'gabarit-bataille': 'gabaritBataille',
  'note': 'note',
  'notes-groupe': 'notesGroupe',
}

function ressembleAPersonnage(r: Record<string, unknown>): boolean {
  if (r.character !== undefined && typeof r.character === 'object' && r.character !== null) return true
  return r.caracteristiques !== undefined && typeof r.caracteristiques === 'object'
}

function ressembleACreature(r: Record<string, unknown>): boolean {
  return typeof r.nom === 'string' && typeof r.nc === 'number' && Array.isArray(r.livres)
}

function ressembleAObjetMagique(r: Record<string, unknown>): boolean {
  return typeof r.nom === 'string' && typeof r.categorie === 'string' && typeof r.slot === 'string'
    && Array.isArray(r.enchantements) && typeof r.niveauMagie === 'number' && typeof r.valeur === 'number'
}

function ressembleARencontre(r: Record<string, unknown>): boolean {
  return Array.isArray(r.adversaires) && typeof r.difficulte === 'string' && typeof r.nombrePJs === 'number'
}

function ressembleAGabaritBataille(r: Record<string, unknown>): boolean {
  return Array.isArray(r.pions) && typeof r.nombreUnitesArmeePJ === 'number' && r.terrainParPosition !== undefined
}

function ressembleABataille(r: Record<string, unknown>): boolean {
  return Array.isArray(r.pions) && Array.isArray(r.journal) && typeof r.intensite === 'number'
}

function ressembleANotesGroupe(r: Record<string, unknown>): boolean {
  return Array.isArray(r.notes)
}

function ressembleANote(r: Record<string, unknown>): boolean {
  return r.note !== undefined && typeof r.note === 'object' && r.note !== null
}

function ressembleABibliothequePersonnages(brut: unknown[]): boolean {
  return brut.length > 0 && brut.every(e =>
    e !== null && typeof e === 'object'
    && typeof (e as Record<string, unknown>).nom === 'string'
    && typeof (e as Record<string, unknown>).character === 'object'
  )
}

// Détecte le type d'un fichier importé, tag explicite en priorité puis repli structurel.
// Retourne null si rien de connu ne correspond (fichier étranger à l'appli, ou vide).
export function detecterTypeFichier(raw: unknown): TypeFichier | null {
  if (Array.isArray(raw)) {
    return ressembleABibliothequePersonnages(raw) ? 'bibliotheque-personnages' : null
  }
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>

  if (typeof r.type === 'string' && (TYPES_CONNUS as string[]).includes(r.type)) {
    return r.type as TypeFichier
  }

  // Repli structurel — ordre important : un gabarit et une bataille partagent `pions`, seule la
  // bataille porte un `journal` ; une créature exportée n'a jamais `character`/`caracteristiques`.
  if (ressembleAPersonnage(r)) return 'personnage'
  if (ressembleABataille(r)) return 'bataille'
  if (ressembleAGabaritBataille(r)) return 'gabarit-bataille'
  if (ressembleARencontre(r)) return 'rencontre'
  if (ressembleANotesGroupe(r)) return 'notes-groupe'
  if (ressembleANote(r)) return 'note'
  if (ressembleACreature(r)) return 'creature'
  if (ressembleAObjetMagique(r)) return 'objet-magique'
  return null
}

// Message prêt à afficher quand le type détecté ne correspond pas au type attendu à ce point d'import
// (ex: import d'une créature qui reçoit en réalité un personnage).
export function messageMauvaisType(t: (cle: string, options?: Record<string, unknown>) => string, attendu: TypeFichier, trouve: TypeFichier): string {
  return t('importTypage.pasLeBonType', {
    attendu: t(`typeFichier.${CLE_LABEL_TYPE[attendu]}`),
    trouve: t(`typeFichier.${CLE_LABEL_TYPE[trouve]}`),
  })
}

// Les exports récents s'enveloppent en { type, data } (voir CreatureDetail.exporterCreature,
// AdversiteTab.exporter, BatailleTab.exporterJSON, SaveLoadPanel.exportCharacter/exportLibrary). Cette
// fonction détecte le type ET, si une enveloppe est bien présente, retourne le contenu utile
// (raw.data) plutôt que l'enveloppe elle-même — un fichier plus ancien ou sans enveloppe (repli
// structurel) renvoie raw tel quel comme contenu.
export function desenvelopper(raw: unknown): { type: TypeFichier | null; contenu: unknown } {
  const type = detecterTypeFichier(raw)
  if (type && raw && typeof raw === 'object' && 'data' in raw && typeof (raw as Record<string, unknown>).type === 'string') {
    return { type, contenu: (raw as Record<string, unknown>).data }
  }
  return { type, contenu: raw }
}
