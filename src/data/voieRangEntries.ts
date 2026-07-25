import type { VoieRangEntry, VoieTitreEntry } from '../components/VoieRangCheckboxes'
import type { VoieKey } from '../utils/levelUp'

// Définition des rangs affichables, séparée des pages qui les affichent : une page (recto, verso,
// future fiche) n'a plus qu'à passer la liste voulue à <VoieRangCheckboxes>. Les identifiants
// (cbId/nomId) sont ceux déjà utilisés dans field-positions.json et NE DOIVENT PAS changer, sinon les
// calibrages existants sont perdus — même si le bloc change de page.

type BlocOptions = {
  voie: VoieKey
  idPrefix: string           // préfixe des identifiants de case (ex: 'voiePeuple' → 'voiePeuple-0')
  nomId: (rang: number) => string
  chipLabel: (rang: number) => string
  rangs: number
  tops: number[]
  cbLeft: number
  nomLeft: number
  nomWidth: number
  minNiveau?: number
  // false pour les blocs sans place pour une description (sang-mêlé).
  avecDesc?: boolean
}

const bloc = (o: BlocOptions): VoieRangEntry[] =>
  Array.from({ length: o.rangs }, (_, rang) => ({
    cbId: `${o.idPrefix}-${rang}`,
    nomId: o.nomId(rang),
    voie: o.voie,
    rang,
    chipLabel: o.chipLabel(rang),
    cbTop: o.tops[rang],
    cbLeft: o.cbLeft,
    nomTop: o.tops[rang],
    nomLeft: o.nomLeft,
    nomWidth: o.nomWidth,
    ...(o.avecDesc === false ? {} : {
      descId: `${o.idPrefix}-${rang} desc`,
      descTop: o.tops[rang] + 2.4,
      descLeft: o.nomLeft,
      descWidth: o.nomWidth,
      descHeight: 5.2,
    }),
    ...(o.minNiveau !== undefined ? { minNiveau: o.minNiveau } : {}),
  }))

const TOPS_HAUT = [47.6, 52.0, 56.4, 60.7, 65.1]
const TOPS_BAS  = [72.2, 76.5, 80.9, 85.3, 89.7]

export const VOIE_PEUPLE_ENTRIES = bloc({
  voie: 'voiePeuple', idPrefix: 'voiePeuple',
  nomId: r => `voiePeuple-${r} nom`, chipLabel: r => `Vpeuple R${r + 1}`,
  rangs: 5, tops: TOPS_HAUT, cbLeft: 36.5, nomLeft: 52.9, nomWidth: 23.7,
})

export const VOIE_CULTURELLE_ENTRIES = bloc({
  voie: 'voieCulturelle', idPrefix: 'voieCult',
  nomId: r => `voieCult-${r} nom`, chipLabel: r => `Vcult R${r + 1}`,
  rangs: 5, tops: TOPS_HAUT, cbLeft: 67.5, nomLeft: 83.8, nomWidth: 23.7,
})

export const VOIE_1_ENTRIES = bloc({
  voie: 'voie1', idPrefix: 'voie1',
  nomId: r => `voie1-${r} nom`, chipLabel: r => `V1 R${r + 1}`,
  rangs: 5, tops: TOPS_BAS, cbLeft: 5.7, nomLeft: 22.1, nomWidth: 23.7,
})

export const VOIE_2_ENTRIES = bloc({
  voie: 'voie2', idPrefix: 'voie2',
  nomId: r => `voie2-${r} nom`, chipLabel: r => `V2 R${r + 1}`,
  rangs: 5, tops: TOPS_BAS, cbLeft: 36.5, nomLeft: 52.8, nomWidth: 23.7,
})

export const VOIE_3_ENTRIES = bloc({
  voie: 'voie3', idPrefix: 'voie3',
  nomId: r => `voie3-${r} nom`, chipLabel: r => `V3 R${r + 1}`,
  rangs: 5, tops: TOPS_BAS, cbLeft: 67.4, nomLeft: 83.8, nomWidth: 23.7,
})

// Voie de prestige : verrouillée tant que le niveau 8 n'est pas atteint.
export const VOIE_PRESTIGE_ENTRIES = bloc({
  voie: 'voiePrestige', idPrefix: 'prestige',
  nomId: r => `prestige-cap-${r}`, chipLabel: r => `Prestige R${r + 1}`,
  rangs: 5, tops: [72.0, 76.3, 80.7, 85.1, 89.4], cbLeft: 5.7, nomLeft: 21.8, nomWidth: 23.6,
  minNiveau: 8,
})

// Voie sang-mêlé : 3 rangs seulement.
export const VOIE_SANG_MELE_ENTRIES = bloc({
  voie: 'voieSangMele', idPrefix: 'sangmele',
  nomId: r => `sangmele-cap-${r}`, chipLabel: r => `Sang-mêlé R${r + 1}`,
  rangs: 3, tops: [83.0, 87.0, 91.0], cbLeft: 58.5, nomLeft: 65.0, nomWidth: 19.0,
  // Pas de description : le bloc sang-mêlé n'a pas la place sur la feuille des voies.
  avecDesc: false,
})

// Les 5 voies "principales" (peuple, culturelle et les 3 voies de profil) — historiquement au recto,
// déplacées au verso : c'est cette constante qu'on passe à la page qui doit les afficher.
export const VOIES_PRINCIPALES_ENTRIES: VoieRangEntry[] = [
  ...VOIE_PEUPLE_ENTRIES,
  ...VOIE_CULTURELLE_ENTRIES,
  ...VOIE_1_ENTRIES,
  ...VOIE_2_ENTRIES,
  ...VOIE_3_ENTRIES,
]

export const VOIES_SPECIALES_ENTRIES: VoieRangEntry[] = [
  ...VOIE_PRESTIGE_ENTRIES,
  ...VOIE_SANG_MELE_ENTRIES,
]

// Champs "nom de la voie" qui coiffent chaque bloc de rangs (identifiants inchangés eux aussi).
export const VOIES_PRINCIPALES_TITRES: VoieTitreEntry[] = [
  { id: 'Voie peuple', voie: 'voiePeuple',     source: 'peuple',  top: 45.7, left: 56.2, width: 17.3 },
  { id: 'Voie cult.',  voie: 'voieCulturelle', source: 'culture', top: 45.7, left: 87.7, width: 16.3 },
  { id: 'Voie 1',      voie: 'voie1',          source: 'voieNom', top: 70.2, left: 22.2, width: 23.3 },
  { id: 'Voie 2',      voie: 'voie2',          source: 'voieNom', top: 70.3, left: 53.1, width: 23.6 },
  { id: 'Voie 3',      voie: 'voie3',          source: 'voieNom', top: 70.3, left: 84.1, width: 23.5 },
]

export const VOIES_SPECIALES_TITRES: VoieTitreEntry[] = [
  { id: 'Voie prestige',  voie: 'voiePrestige', source: 'voieNom', top: 70.0, left: 25.9, width: 16.4 },
  { id: 'Voie sang-mêlé', voie: 'voieSangMele', source: 'voieNom', top: 78.8, left: 57.6, width: 14.0 },
]

// Listes complètes, exportées telles quelles : à passer directement à <VoieRangCheckboxes> sans les
// reconstruire à la volée (`[...a, ...b]` dans le JSX créerait un nouveau tableau à chaque rendu, donc
// une resynchronisation permanente des positions et une boucle de rendus).
export const TOUTES_VOIES_ENTRIES: VoieRangEntry[] = [
  ...VOIES_PRINCIPALES_ENTRIES,
  ...VOIES_SPECIALES_ENTRIES,
]

export const TOUS_VOIES_TITRES: VoieTitreEntry[] = [
  ...VOIES_PRINCIPALES_TITRES,
  ...VOIES_SPECIALES_TITRES,
]
