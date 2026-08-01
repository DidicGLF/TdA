// Traits de psychologie du personnage — 10 traits (Colère exclue), source Psy.odt. Chaque trait est une
// échelle 0-10 dont le sens narratif ne change que par tranches de 2-3 valeurs (5 profils nommés) ; le
// joueur choisit un chiffre précis (curseur, voir CreationWizard.tsx Step6), le profil affiché n'est
// qu'un texte dérivé pour l'aider à situer sa valeur. Texte français en dur, sans traduction ni édition
// perso/livré — même traitement que data/cristaux.json, pas demandé pour ce jeu de données.
export type ProfilPsychologie = {
  min: number
  max: number
  // Forme masculine — la base historique de ce jeu de données, gardée comme valeur par défaut.
  label: string
  // Absentes = identiques à `label` (aucun accord de genre dans le libellé, ex. "Lâche, fuit le
  // danger" — que des mots épicènes/verbes). Écrites à la main plutôt que dérivées d'une règle
  // automatique : l'accord féminin français est trop irrégulier ("Franc"→"Franche",
  // "Manipulateur"→"Manipulatrice"...) pour une simple règle de suffixe.
  labelFeminin?: string
  labelEpicene?: string
}
export type TraitPsychologie = { cle: string; nom: string; sousTitre: string; profils: ProfilPsychologie[] }

export const TRAITS_PSYCHOLOGIE: TraitPsychologie[] = [
  { cle: 'courage', nom: 'Courage', sousTitre: 'Affronter le danger', profils: [
    { min: 0, max: 2, label: 'Lâche, fuit le danger' },
    { min: 3, max: 4, label: 'Hésitant, évite le risque', labelFeminin: 'Hésitante, évite le risque', labelEpicene: 'Hésitant(e), évite le risque' },
    { min: 5, max: 6, label: 'Agit si nécessaire' },
    { min: 7, max: 8, label: 'Prend des risques calculés' },
    { min: 9, max: 10, label: 'Héroïque, intrépide' },
  ] },
  { cle: 'empathie', nom: 'Empathie', sousTitre: 'Ressentir l’autre', profils: [
    { min: 0, max: 2, label: 'Cruel, indifférent', labelFeminin: 'Cruelle, indifférente', labelEpicene: 'Cruel(le), indifférent(e)' },
    { min: 3, max: 4, label: 'Peu sensible aux autres' },
    { min: 5, max: 6, label: 'À l’écoute, mais sélectif', labelFeminin: 'À l’écoute, mais sélective', labelEpicene: 'À l’écoute, mais sélectif(ve)' },
    { min: 7, max: 8, label: 'Compatissant, bienveillant', labelFeminin: 'Compatissante, bienveillante', labelEpicene: 'Compatissant(e), bienveillant(e)' },
    { min: 9, max: 10, label: 'Se sacrifie pour autrui' },
  ] },
  { cle: 'sociabilite', nom: 'Sociabilité', sousTitre: 'Facilité de contact', profils: [
    { min: 0, max: 2, label: 'Je déteste les gens' },
    { min: 3, max: 4, label: 'Renfermé, méfiant', labelFeminin: 'Renfermée, méfiante', labelEpicene: 'Renfermé(e), méfiant(e)' },
    { min: 5, max: 6, label: 'À l’aise en petit comité' },
    { min: 7, max: 8, label: 'Agréable, ouvert', labelFeminin: 'Agréable, ouverte', labelEpicene: 'Agréable, ouvert(e)' },
    { min: 9, max: 10, label: 'Je me fais facilement des amis' },
  ] },
  { cle: 'loyaute', nom: 'Loyauté', sousTitre: 'Fidélité & engagement', profils: [
    { min: 0, max: 2, label: 'Traître, opportuniste' },
    { min: 3, max: 4, label: 'Change souvent de camp' },
    { min: 5, max: 6, label: 'Loyal selon les circonstances', labelFeminin: 'Loyale selon les circonstances', labelEpicene: 'Loyal(e) selon les circonstances' },
    { min: 7, max: 8, label: 'Fidèle à ses proches' },
    { min: 9, max: 10, label: 'Dévoué jusqu’à se sacrifier', labelFeminin: 'Dévouée jusqu’à se sacrifier', labelEpicene: 'Dévoué(e) jusqu’à se sacrifier' },
  ] },
  { cle: 'ambition', nom: 'Ambition', sousTitre: 'Désir de réussite', profils: [
    { min: 0, max: 2, label: 'Sans ambition, résigné', labelFeminin: 'Sans ambition, résignée', labelEpicene: 'Sans ambition, résigné(e)' },
    { min: 3, max: 4, label: 'Veut améliorer sa condition' },
    { min: 5, max: 6, label: 'Motivé par la réussite', labelFeminin: 'Motivée par la réussite', labelEpicene: 'Motivé(e) par la réussite' },
    { min: 7, max: 8, label: 'Assoiffé de reconnaissance', labelFeminin: 'Assoiffée de reconnaissance', labelEpicene: 'Assoiffé(e) de reconnaissance' },
    { min: 9, max: 10, label: 'Dévoré d’ambition', labelFeminin: 'Dévorée d’ambition', labelEpicene: 'Dévoré(e) d’ambition' },
  ] },
  { cle: 'prudence', nom: 'Prudence', sousTitre: 'Sens du danger', profils: [
    { min: 0, max: 2, label: 'Téméraire, inconscient', labelFeminin: 'Téméraire, inconsciente', labelEpicene: 'Téméraire, inconscient(e)' },
    { min: 3, max: 4, label: 'Peu prévoyant, impulsif', labelFeminin: 'Peu prévoyante, impulsive', labelEpicene: 'Peu prévoyant(e), impulsif(ve)' },
    { min: 5, max: 6, label: 'Équilibré, vigilant', labelFeminin: 'Équilibrée, vigilante', labelEpicene: 'Équilibré(e), vigilant(e)' },
    { min: 7, max: 8, label: 'Réfléchi, prévoyant', labelFeminin: 'Réfléchie, prévoyante', labelEpicene: 'Réfléchi(e), prévoyant(e)' },
    { min: 9, max: 10, label: 'Extrêmement prudent', labelFeminin: 'Extrêmement prudente', labelEpicene: 'Extrêmement prudent(e)' },
  ] },
  { cle: 'honnetete', nom: 'Honnêteté', sousTitre: 'Intégrité & sincérité', profils: [
    { min: 0, max: 2, label: 'Manipulateur, menteur', labelFeminin: 'Manipulatrice, menteuse', labelEpicene: 'Manipulateur(trice), menteur(se)' },
    { min: 3, max: 4, label: 'Cache souvent la vérité' },
    { min: 5, max: 6, label: 'Honnête selon l’intérêt' },
    { min: 7, max: 8, label: 'Franc, transparent', labelFeminin: 'Franche, transparente', labelEpicene: 'Franc(he), transparent(e)' },
    { min: 9, max: 10, label: 'Incorruptible, vérité absolue' },
  ] },
  { cle: 'curiosite', nom: 'Curiosité', sousTitre: 'Soif de découverte', profils: [
    { min: 0, max: 2, label: 'Conservateur, réticent', labelFeminin: 'Conservatrice, réticente', labelEpicene: 'Conservateur(trice), réticent(e)' },
    { min: 3, max: 4, label: 'Peu intéressé par le monde', labelFeminin: 'Peu intéressée par le monde', labelEpicene: 'Peu intéressé(e) par le monde' },
    { min: 5, max: 6, label: 'Curieux occasionnel', labelFeminin: 'Curieuse occasionnelle', labelEpicene: 'Curieux(se) occasionnel(le)' },
    { min: 7, max: 8, label: 'Avide d’apprendre' },
    { min: 9, max: 10, label: 'Soif inextinguible de savoir' },
  ] },
  { cle: 'foi', nom: 'Foi / Convictions', sousTitre: 'Croyances & idéaux', profils: [
    { min: 0, max: 2, label: 'Cynique, sceptique' },
    { min: 3, max: 4, label: 'Doute ou hésite' },
    { min: 5, max: 6, label: 'Croit selon son expérience' },
    { min: 7, max: 8, label: 'Convictions profondes' },
    { min: 9, max: 10, label: 'Inébranlable, fanatique' },
  ] },
  { cle: 'maitrise', nom: 'Maîtrise de soi', sousTitre: 'Discipline & contrôle', profils: [
    { min: 0, max: 2, label: 'Instable, impulsif', labelFeminin: 'Instable, impulsive', labelEpicene: 'Instable, impulsif(ve)' },
    { min: 3, max: 4, label: 'Se laisse facilement aller' },
    { min: 5, max: 6, label: 'Contrôle satisfaisant' },
    { min: 7, max: 8, label: 'Très discipliné, maîtrisé', labelFeminin: 'Très disciplinée, maîtrisée', labelEpicene: 'Très discipliné(e), maîtrisé(e)' },
    { min: 9, max: 10, label: 'Impassible, maître de soi', labelFeminin: 'Impassible, maîtresse de soi', labelEpicene: 'Impassible, maître(sse) de soi' },
  ] },
]

// Reconnaît le genre du personnage à partir du champ libre Character.genre (pas une liste fermée,
// n'importe quel texte est possible) — se limite aux valeurs que l'app elle-même propose par
// convention ("Masculin"/"Féminin", déjà ce qu'affiche la fiche recto) plutôt que d'inventer une
// liste de synonymes fragile qui devinerait mal. Non reconnu (vide, "Autre", texte libre...) : la
// forme épicène "(e)" sert de repli, jamais la forme masculine imposée par défaut.
function accordGenre(genre: string): 'masculin' | 'feminin' | null {
  const g = genre.trim().toLowerCase()
  if (g === 'masculin' || g === 'homme' || g === 'm') return 'masculin'
  if (g === 'féminin' || g === 'feminin' || g === 'femme' || g === 'f') return 'feminin'
  return null
}

export function labelProfilPsychologie(trait: TraitPsychologie, valeur: number, genre: string): string {
  const profil = trait.profils.find(p => valeur >= p.min && valeur <= p.max)
  if (!profil) return ''
  const accord = accordGenre(genre)
  if (accord === 'masculin') return profil.label
  if (accord === 'feminin') return profil.labelFeminin ?? profil.label
  return profil.labelEpicene ?? profil.label
}
