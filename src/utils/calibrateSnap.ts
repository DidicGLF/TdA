// Accroche aux champs voisins en mode calibrage : cherche, parmi les autres champs du même conteneur
// (repérés par l'attribut data-calib-handle), le meilleur alignement possible (centre, bord gauche, bord
// droit sur l'axe horizontal ; centre sur l'axe vertical) et propose une position corrigée ainsi que la
// ligne-repère à afficher. Les positions des autres champs sont lues directement dans le DOM (attributs
// data-calib-*), toujours à jour puisque React les réécrit à chaque rendu — pas de registre séparé à
// synchroniser.
export interface ResultatAccroche {
  left: number
  top: number
  guideV: number | null
  guideH: number | null
}

const SEUIL = 0.4 // en % de la largeur/hauteur du conteneur

export function calculerAccroche(
  conteneur: HTMLElement,
  elementSoi: HTMLElement,
  top: number,
  left: number,
  width: number,
): ResultatAccroche {
  const autres = Array.from(conteneur.querySelectorAll<HTMLElement>('[data-calib-handle]'))
    .filter(el => el !== elementSoi)

  const gaucheSoi = left - width / 2
  const droiteSoi = left + width / 2

  let snapLeft: number | null = null
  let guideV: number | null = null
  let meilleureDistV = SEUIL

  let snapTop: number | null = null
  let guideH: number | null = null
  let meilleureDistH = SEUIL

  for (const el of autres) {
    const oLeft = Number(el.dataset.calibLeft)
    const oTop = Number(el.dataset.calibTop)
    const oWidth = Number(el.dataset.calibWidth)
    if (Number.isNaN(oLeft) || Number.isNaN(oTop) || Number.isNaN(oWidth)) continue
    const gaucheAutre = oLeft - oWidth / 2
    const droiteAutre = oLeft + oWidth / 2

    const candidatsH: Array<[number, number]> = [
      [left, oLeft],           // centre à centre
      [gaucheSoi, gaucheAutre], // bord gauche à bord gauche
      [droiteSoi, droiteAutre], // bord droit à bord droit
    ]
    for (const [valSoi, valAutre] of candidatsH) {
      const d = Math.abs(valSoi - valAutre)
      if (d < meilleureDistV) {
        meilleureDistV = d
        snapLeft = left + (valAutre - valSoi)
        guideV = valAutre
      }
    }

    const dTop = Math.abs(top - oTop)
    if (dTop < meilleureDistH) {
      meilleureDistH = dTop
      snapTop = oTop
      guideH = oTop
    }
  }

  return {
    left: snapLeft ?? left,
    top: snapTop ?? top,
    guideV, guideH,
  }
}
