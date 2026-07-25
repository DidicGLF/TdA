// Première lettre en majuscule, le reste inchangé — contrairement à `text-transform: capitalize`
// qui capitaliserait chaque mot. Utilisé pour les textes-repères de calibrage, dont les libellés
// viennent d'identifiants techniques parfois en minuscule (« pmRestants », « voie1-0 desc »).
export const majusculeInitiale = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
