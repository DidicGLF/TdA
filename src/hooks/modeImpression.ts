import { createContext } from 'react'

// Vrai quand l'utilisateur prépare une impression : chaque champ affiche alors une pastille pour
// décider s'il figure ou non sur la version papier. Dans son propre fichier pour que les composants
// de champ puissent le lire sans dépendre de useChampsFiche, qui lui-même les importe.
export const ModeImpressionContext = createContext(false)

// Vrai uniquement dans le conteneur hors écran capturé pour l'export PDF (voir App.tsx/
// exportFichePdf.ts) — jamais vrai dans la fiche éditable normale. Sert à masquer les affordances
// d'édition qui n'ont pas de sens sur un export figé (ex. le cadre "Ajouter une image" en pointillés
// d'un portrait vide, dans DraggableImageField).
export const PdfExportContext = createContext(false)
