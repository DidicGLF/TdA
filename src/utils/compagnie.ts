// Règles de création/gestion de compagnie (Chroniques des Terres mortes, p.5-11) — plusieurs compagnies
// possibles par table (voir GameDataContext.tsx : compagnies: Compagnie[]), gérées côté MJ (voir
// GMDashboard.tsx/CompagnieTab.tsx). Contenu de règle (voie, descriptions, devises) en français en dur,
// même traitement que data/psychologieTraits.ts/data/cristaux.json : pas de couche de traduction
// perso/livré pour ce texte, aucune fusion livré/perso n'a de sens ici (pas de "compagnie livrée avec
// l'appli").

import type { MissionCompagnie } from './missions'

export type CodeCompagnie = 'altruiste' | 'anarchique' | 'autoritaire' | 'solidaire'
export type CodeAvecVoieFixe = Exclude<CodeCompagnie, 'anarchique'>
export type DomaineCapacite = 'arsenal' | 'influence' | 'tactique'
// 'clanCulVert' : option maison, hors échelle du livre (voir le filet en pointillé qui la sépare des
// 5 tailles officielles dans le sélecteur, CompagnieTab.tsx).
export type TailleCompagnie = 'petite' | 'moyenne' | 'grande' | 'organisation' | 'armee' | 'clanCulVert'
export type FonctionMembre = 'commandant' | 'second' | 'emissaire' | 'intendant' | 'maitreArmes'

export interface CapaciteCompagnie {
  domaine: DomaineCapacite
  nom: string
}

export interface MembreCompagnie {
  // Absente pour un membre général (ajouté depuis la fiche d'un personnage importée en .json, voir
  // CompagnieTab) — présente seulement pour les 5 emplacements de fonction (saisie libre, voir
  // FONCTIONS_MEMBRE). Les deux vivent dans le même tableau : un personnage dont le nom figure ici,
  // fonction ou non, est traité comme membre de la compagnie (voir showCompagnieTab dans App.tsx).
  fonction?: FonctionMembre
  nom: string
}

export interface Compagnie {
  id: string
  nom: string
  // Clé imageStore (voir utils/imageStore.ts::importerImage/useImage), jamais une dataURL brute stockée
  // directement — même règle que partout ailleurs dans l'appli où une image est attachée à une fiche.
  // Affiché en miniature dans la liste des compagnies (CompagnieTab.tsx) et en plus grand dans son
  // panneau Identité.
  logo?: string
  taille: TailleCompagnie
  siege: string
  histoire: string
  renommee: number
  code: CodeCompagnie | null
  // Choix libres du code Anarchique, par rang (1-5) — capacité choisie parmi celles autorisées à ce
  // rang (voir capacitesDisponiblesAnarchique). Absent des autres codes, dont la voie est fixe.
  choixAnarchique: Partial<Record<number, CapaciteCompagnie>>
  membres: MembreCompagnie[]
  // Missions créées par le MJ (voir utils/missions.ts/MissionsTab.tsx) — voyagent avec le reste de la
  // compagnie via l'export/import JSON déjà existant (CompagnieTab.tsx), sans code supplémentaire.
  missions: MissionCompagnie[]
  modifieLe: string
}

export const COMPAGNIE_PAR_DEFAUT = (): Compagnie => ({
  id: crypto.randomUUID(),
  nom: '',
  logo: undefined,
  taille: 'moyenne',
  siege: '',
  histoire: '',
  renommee: 0,
  code: null,
  choixAnarchique: {},
  membres: [],
  missions: [],
  modifieLe: new Date().toISOString(),
})

// clanCulVert en dernier, séparé visuellement des 5 tailles officielles par un filet en pointillé
// (voir CompagnieTab.tsx, juste après la pastille Armée).
export const TAILLES_COMPAGNIE: TailleCompagnie[] = ['petite', 'moyenne', 'grande', 'organisation', 'armee', 'clanCulVert']
export const FONCTIONS_MEMBRE: FonctionMembre[] = ['commandant', 'second', 'emissaire', 'intendant', 'maitreArmes']

// Effectif approximatif associé à chaque taille (règle du livre : une dizaine / une trentaine / une
// centaine / plusieurs centaines / plusieurs milliers) — affiché avec le signe ≈ dans la liste des
// compagnies (CompagnieTab.tsx). Pour organisation/armée ("plusieurs..."), le livre ne donne pas de
// chiffre précis : valeur ronde représentative choisie ici (300, 3000). clanCulVert (hors livre) :
// 300 pour le moment, à ajuster.
export const EFFECTIF_APPROX_TAILLE: Record<TailleCompagnie, number> = {
  petite: 10,
  moyenne: 30,
  grande: 100,
  organisation: 300,
  armee: 3000,
  clanCulVert: 300,
}

// Devise + philosophie de chaque code — texte du livre, jamais traduit (citations en français).
export const DEVISE_CODE: Record<CodeCompagnie, string> = {
  altruiste: '« Pourquoi ? Parce qu\'il le faut. »',
  anarchique: '« L\'horizon pour demeure, le vent pour destrier. »',
  autoritaire: '« Sang et gloire. Honneur et vie. »',
  solidaire: '« Mon frère, ma sœur, je mourrais pour toi. »',
}
export const DESCRIPTION_CODE: Record<CodeCompagnie, string> = {
  altruiste: "Tournée vers les autres, le bien commun — dévotion, religion ou choix philosophique.",
  anarchique: "Sans loi ni règle, chaotique et éprise de liberté — opposée à tout despotisme.",
  autoritaire: "Ordre, discipline, honneur — une hiérarchie stricte, presque militaire.",
  solidaire: "La cohésion de groupe avant tout — l'individu n'existe qu'au service des camarades.",
}

// Bonus d'Autorité : tests concernés, selon le code (voir DESCRIPTION_CAPACITE['Autorité']).
export const TESTS_AUTORITE: Record<CodeCompagnie, string> = {
  altruiste: 'persuasion ou séduction',
  anarchique: 'intimidation ou mensonge',
  autoritaire: 'persuasion ou intimidation',
  solidaire: 'séduction ou mensonge',
}

// Voie de compagnie : rang (index 0 = rang 1) → capacité, une par code à voie fixe (Altruiste/
// Autoritaire/Solidaire). Le code Anarchique choisit librement (voir choixAnarchique ci-dessus).
export const VOIE_COMPAGNIE: Record<CodeAvecVoieFixe, CapaciteCompagnie[]> = {
  altruiste: [
    { domaine: 'influence', nom: 'Autorité' },
    { domaine: 'tactique', nom: 'Coordination' },
    { domaine: 'arsenal', nom: 'Arsenal de pouvoir' },
    { domaine: 'influence', nom: 'Récupération supérieure' },
    { domaine: 'arsenal', nom: 'Arsenal de puissance' },
  ],
  autoritaire: [
    { domaine: 'influence', nom: 'Autorité' },
    { domaine: 'arsenal', nom: 'Arsenal traditionnel' },
    { domaine: 'tactique', nom: 'Coordination' },
    { domaine: 'influence', nom: 'Récupération supérieure' },
    { domaine: 'influence', nom: "Entraînement d'élite" },
  ],
  solidaire: [
    { domaine: 'tactique', nom: 'Coordination' },
    { domaine: 'influence', nom: 'Autorité' },
    { domaine: 'tactique', nom: 'Attaque combinée' },
    { domaine: 'arsenal', nom: 'Arsenal traditionnel' },
    { domaine: 'tactique', nom: "Esprit d'équipe" },
  ],
}

// Domaines ouverts au choix libre du code Anarchique, par rang (rangs 1-2 : Influence ou Tactique ;
// rangs 3-5 : les 3 domaines, Arsenal compris) — le livre ne fournit pas de liste de capacités séparée
// pour ce code : le "menu" est déduit des capacités distinctes des 3 autres codes (voir toutesLesCapacites).
export const DOMAINES_ANARCHIQUE: Record<number, DomaineCapacite[]> = {
  1: ['influence', 'tactique'],
  2: ['influence', 'tactique'],
  3: ['arsenal', 'influence', 'tactique'],
  4: ['arsenal', 'influence', 'tactique'],
  5: ['arsenal', 'influence', 'tactique'],
}

export function toutesLesCapacites(): CapaciteCompagnie[] {
  const vues = new Set<string>()
  const result: CapaciteCompagnie[] = []
  for (const rangs of Object.values(VOIE_COMPAGNIE)) {
    for (const cap of rangs) {
      if (vues.has(cap.nom)) continue
      vues.add(cap.nom)
      result.push(cap)
    }
  }
  return result
}

export function capacitesDisponiblesAnarchique(rang: number): CapaciteCompagnie[] {
  const domaines = DOMAINES_ANARCHIQUE[rang] ?? []
  return toutesLesCapacites().filter(c => domaines.includes(c.domaine))
}

// Description de règle complète d'une capacité, par nom (partagée entre les 4 codes).
export const DESCRIPTION_CAPACITE: Record<string, string> = {
  'Autorité': "Bonus égal au rang atteint dans la voie pour les tests de {{tests}} (selon le code de la compagnie).",
  'Récupération supérieure': "Quand un PJ dépense 1 PR pour regagner des PV, la catégorie du dé est augmentée de 1 (ex. 1d12 au lieu de 1d10).",
  "Entraînement d'élite": "Au début d'une mission, chaque PJ choisit une caractéristique parmi FOR/DEX/CON qui devient sa caractéristique supérieure pour la mission : il lance alors 2d20 et garde le résultat de son choix.",
  'Coordination': "Au premier tour de chaque combat, tous les PJ ne souffrant pas de l'état surpris gagnent +2 en Initiative et +2 en Défense.",
  'Attaque combinée': "Pour chaque allié ayant attaqué la même cible ce tour, le PJ gagne un bonus cumulatif de +1 à son test d'attaque et à ses DM.",
  "Esprit d'équipe": "Une fois par combat, un PJ peut sacrifier 1 PC pour offrir un bonus de +5 en attaque et aux DM à un allié.",
  'Arsenal traditionnel': "Les PJ commencent le scénario avec 1 ou 2 objets issus des armes, armures ou focalisateurs magiques. Niveau de magie maximum de l'objet égal à la moitié du rang de la voie de compagnie (arrondi au supérieur).",
  'Arsenal de pouvoir': "Les PJ commencent le scénario avec 1 ou 2 objets de pouvoir issus des réserves de l'arsenal. Niveau de magie maximum égal à la moitié du rang de la voie de compagnie (arrondi au supérieur).",
  'Arsenal de puissance': "Les PJ commencent le scénario avec un objet de puissance de leur choix. Niveau de magie maximum égal à la moitié du rang de la voie de compagnie (arrondi au supérieur).",
}

export function descriptionCapacite(nom: string, code: CodeCompagnie | null): string {
  const brut = DESCRIPTION_CAPACITE[nom] ?? ''
  if (nom === 'Autorité' && code) return brut.replace('{{tests}}', TESTS_AUTORITE[code])
  return brut.replace('{{tests}}', 'persuasion, séduction, intimidation ou mensonge')
}

// Paliers de renommée → niveau de la compagnie (= rang débloqué dans la voie). Niveau 0 à la création.
export const SEUILS_RENOMMEE = [0, 150, 300, 500, 700, 850]

export function niveauDepuisRenommee(renommee: number): number {
  let niveau = 0
  for (let i = 1; i < SEUILS_RENOMMEE.length; i++) if (renommee >= SEUILS_RENOMMEE[i]) niveau = i
  return niveau
}

// Capacité effective à un rang donné (1-5), selon le code — null si code absent, rang hors-limite,
// ou choix Anarchique pas encore fait à ce rang.
export function capaciteAuRang(compagnie: Compagnie, rang: number): CapaciteCompagnie | null {
  if (!compagnie.code || rang < 1 || rang > 5) return null
  if (compagnie.code === 'anarchique') return compagnie.choixAnarchique[rang] ?? null
  return VOIE_COMPAGNIE[compagnie.code][rang - 1] ?? null
}

// Toutes les capacités actuellement actives (rangs déjà débloqués par le niveau courant).
export function capacitesActives(compagnie: Compagnie): CapaciteCompagnie[] {
  const niveau = niveauDepuisRenommee(compagnie.renommee)
  const result: CapaciteCompagnie[] = []
  for (let rang = 1; rang <= niveau; rang++) {
    const cap = capaciteAuRang(compagnie, rang)
    if (cap) result.push(cap)
  }
  return result
}

// Compagnie dont ce personnage est membre, s'il y en a une — au plus une par construction (un
// personnage ne rejoint jamais deux compagnies à la fois, voir CompagnieTab.tsx). Source unique de
// vérité pour ce lookup, réutilisée par App.tsx (showCompagnieTab + prop de CharacterCompagnieTab) et
// GameModePanel.tsx (missionsActives), qui avant ce chantier multi-compagnies testaient chacun leur
// propre variante d'un objet compagnie unique.
export function trouverCompagnieDuPersonnage(compagnies: Compagnie[], nomPersonnage: string): Compagnie | null {
  const nom = nomPersonnage.trim().toLowerCase()
  if (!nom) return null
  return compagnies.find(c => c.membres.some(m => m.nom.trim().toLowerCase() === nom)) ?? null
}
