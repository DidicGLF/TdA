// Traits de psychologie du personnage — 10 traits (Colère exclue), source Psy.odt. Chaque trait est une
// échelle 0-10 dont le sens narratif ne change que par tranches de 2-3 valeurs (5 profils nommés) ; le
// joueur choisit un chiffre précis (curseur, voir CreationWizard.tsx Step6), le profil affiché n'est
// qu'un texte dérivé pour l'aider à situer sa valeur. Texte français en dur, sans traduction ni édition
// perso/livré — même traitement que data/cristaux.json, pas demandé pour ce jeu de données.
export type ProfilPsychologie = { min: number; max: number; label: string }
export type TraitPsychologie = { cle: string; nom: string; sousTitre: string; profils: ProfilPsychologie[] }

export const TRAITS_PSYCHOLOGIE: TraitPsychologie[] = [
  { cle: 'courage', nom: 'Courage', sousTitre: 'Affronter le danger', profils: [
    { min: 0, max: 2, label: 'Lâche, fuit le danger' },
    { min: 3, max: 4, label: 'Hésitant, évite le risque' },
    { min: 5, max: 6, label: 'Agit si nécessaire' },
    { min: 7, max: 8, label: 'Prend des risques calculés' },
    { min: 9, max: 10, label: 'Héroïque, intrépide' },
  ] },
  { cle: 'empathie', nom: 'Empathie', sousTitre: 'Ressentir l’autre', profils: [
    { min: 0, max: 2, label: 'Cruel, indifférent' },
    { min: 3, max: 4, label: 'Peu sensible aux autres' },
    { min: 5, max: 6, label: 'À l’écoute, mais sélectif' },
    { min: 7, max: 8, label: 'Compatissant, bienveillant' },
    { min: 9, max: 10, label: 'Se sacrifie pour autrui' },
  ] },
  { cle: 'sociabilite', nom: 'Sociabilité', sousTitre: 'Facilité de contact', profils: [
    { min: 0, max: 2, label: 'Je déteste les gens' },
    { min: 3, max: 4, label: 'Renfermé, méfiant' },
    { min: 5, max: 6, label: 'À l’aise en petit comité' },
    { min: 7, max: 8, label: 'Agréable, ouvert' },
    { min: 9, max: 10, label: 'Je me fais facilement des amis' },
  ] },
  { cle: 'loyaute', nom: 'Loyauté', sousTitre: 'Fidélité & engagement', profils: [
    { min: 0, max: 2, label: 'Traître, opportuniste' },
    { min: 3, max: 4, label: 'Change souvent de camp' },
    { min: 5, max: 6, label: 'Loyal selon les circonstances' },
    { min: 7, max: 8, label: 'Fidèle à ses proches' },
    { min: 9, max: 10, label: 'Dévoué jusqu’à se sacrifier' },
  ] },
  { cle: 'ambition', nom: 'Ambition', sousTitre: 'Désir de réussite', profils: [
    { min: 0, max: 2, label: 'Sans ambition, résigné' },
    { min: 3, max: 4, label: 'Veut améliorer sa condition' },
    { min: 5, max: 6, label: 'Motivé par la réussite' },
    { min: 7, max: 8, label: 'Assoiffé de reconnaissance' },
    { min: 9, max: 10, label: 'Dévoré d’ambition' },
  ] },
  { cle: 'prudence', nom: 'Prudence', sousTitre: 'Sens du danger', profils: [
    { min: 0, max: 2, label: 'Téméraire, inconscient' },
    { min: 3, max: 4, label: 'Peu prévoyant, impulsif' },
    { min: 5, max: 6, label: 'Équilibré, vigilant' },
    { min: 7, max: 8, label: 'Réfléchi, prévoyant' },
    { min: 9, max: 10, label: 'Extrêmement prudent' },
  ] },
  { cle: 'honnetete', nom: 'Honnêteté', sousTitre: 'Intégrité & sincérité', profils: [
    { min: 0, max: 2, label: 'Manipulateur, menteur' },
    { min: 3, max: 4, label: 'Cache souvent la vérité' },
    { min: 5, max: 6, label: 'Honnête selon l’intérêt' },
    { min: 7, max: 8, label: 'Franc, transparent' },
    { min: 9, max: 10, label: 'Incorruptible, vérité absolue' },
  ] },
  { cle: 'curiosite', nom: 'Curiosité', sousTitre: 'Soif de découverte', profils: [
    { min: 0, max: 2, label: 'Conservateur, réticent' },
    { min: 3, max: 4, label: 'Peu intéressé par le monde' },
    { min: 5, max: 6, label: 'Curieux occasionnel' },
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
    { min: 0, max: 2, label: 'Instable, impulsif' },
    { min: 3, max: 4, label: 'Se laisse facilement aller' },
    { min: 5, max: 6, label: 'Contrôle satisfaisant' },
    { min: 7, max: 8, label: 'Très discipliné, maîtrisé' },
    { min: 9, max: 10, label: 'Impassible, maître de soi' },
  ] },
]

export function labelProfilPsychologie(trait: TraitPsychologie, valeur: number): string {
  return trait.profils.find(p => valeur >= p.min && valeur <= p.max)?.label ?? ''
}
