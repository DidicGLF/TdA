// Silhouette partagée du repère "curseur" (haut rectangulaire à coins arrondis, pointe basse arrondie
// plutôt que franche) — utilisée à la fois par le curseur du wizard (CreationWizard.tsx, pouce d'un
// <input type="range">) et par le champ curseur de la fiche verso (DraggableCursorRow.tsx), pour ne
// dessiner cette forme qu'à un seul endroit. viewBox 0 0 14 24 : par défaut la pointe vise vers le bas
// (axe horizontal) ; DraggableCursorRow fait pivoter cette forme selon l'angle réel de son axe.
export const CURSEUR_MASK_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 14 24'%3E%3Cpath d='M3.5,0 H10.5 A2.5,2.5 0 0 1 13,2.5 V12 L8,21 Q7,24 6,21 L1,12 V2.5 A2.5,2.5 0 0 1 3.5,0 Z' fill='white'/%3E%3C/svg%3E"

// Même silhouette, mais en deux tons figés dans le SVG (fond --tdr-dark, contour --tdr-gold) plutôt
// qu'en masque à une seule couleur — demandé par Didic pour le champ curseur de la fiche verso
// spécifiquement (le curseur du wizard reste doré uni, via CURSEUR_MASK_SVG ci-dessus). viewBox agrandi
// d'une unité de marge de chaque côté pour laisser la place au contour sans le rogner sur les bords.
export const CURSEUR_ICON_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='-1 -1 16 26'%3E%3Cpath d='M3.5,0 H10.5 A2.5,2.5 0 0 1 13,2.5 V12 L8,21 Q7,24 6,21 L1,12 V2.5 A2.5,2.5 0 0 1 3.5,0 Z' fill='%231a1510' stroke='%23c9a84c' stroke-width='1.8'/%3E%3C/svg%3E"

export const CURSEUR_VIEWBOX_WIDTH = 14
export const CURSEUR_VIEWBOX_HEIGHT = 24
