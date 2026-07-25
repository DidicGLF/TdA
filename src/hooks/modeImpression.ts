import { createContext } from 'react'

// Vrai quand l'utilisateur prépare une impression : chaque champ affiche alors une pastille pour
// décider s'il figure ou non sur la version papier. Dans son propre fichier pour que les composants
// de champ puissent le lire sans dépendre de useChampsFiche, qui lui-même les importe.
export const ModeImpressionContext = createContext(false)
