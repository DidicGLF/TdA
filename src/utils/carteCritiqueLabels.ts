import type { TypeBlocCarte } from '../data/cartesCritiques'

// Partagé entre CarteCritiqueModal (consultation) et CartesCritiquesTab (édition) — fichier à part
// (plutôt qu'exporté depuis CarteCritiqueModal) pour ne pas déclencher react-refresh/only-export-
// components, qui exige qu'un fichier de composant n'exporte QUE des composants.
export const LABEL_TYPE: Record<TypeBlocCarte, string> = {
  global: 'Global',
  contact: 'Attaque au contact',
  distance: 'Attaque à distance',
  magique: 'Attaque magique',
}
