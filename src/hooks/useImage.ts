import { useEffect, useState } from 'react'
import { chargerImage, estCleImage } from '../utils/imageStore'

// Source affichable d'une image, que la valeur stockée soit une clé (images/…, nouveau format) ou
// une data URL encodée directement dans les données (ancien format, encore présent chez les
// utilisateurs qui n'ont pas migré). Les composants n'ont donc pas à connaître le format.
export function useImage(valeur: string | undefined | null): string | null {
  // Une data URL est déjà affichable : on la renvoie telle quelle, sans passer par l'état — sinon
  // l'effet devrait la recopier à chaque rendu, ce qui provoque des rendus en cascade inutiles.
  const directe = valeur && !estCleImage(valeur) ? valeur : null
  const [chargee, setChargee] = useState<string | null>(null)
  // Repère la dernière valeur pour laquelle chargee a été résolu — ajusté pendant le rendu (pattern
  // recommandé par React pour réagir à un changement de prop), pas dans l'effet ci-dessous. Sans ce
  // reset, passer d'une créature illustrée à une créature sans image laissait chargee à sa dernière
  // valeur chargée, affichée indéfiniment jusqu'à la sélection d'une autre créature illustrée.
  const [dernierePourChargee, setDernierePourChargee] = useState(valeur)
  if (valeur !== dernierePourChargee) {
    setDernierePourChargee(valeur)
    setChargee(null)
  }

  useEffect(() => {
    if (!valeur || !estCleImage(valeur)) return
    let annule = false
    chargerImage(valeur).then(d => { if (!annule) setChargee(d) })
    return () => { annule = true }
  }, [valeur])

  return directe ?? chargee
}
