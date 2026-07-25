interface Props {
  coche: boolean
  // En calibrage, une case décochée affiche une croix-repère atténuée : sans elle, la case est
  // invisible et impossible à centrer sur le carré imprimé de la feuille.
  calibrate?: boolean
  epaisseur?: number
  taille?: string
}

// La croix des cases à cocher de la fiche, partagée par tous les groupes de cases (rangs de voies,
// points de récupération, formations martiales, points de magie).
export default function CroixCase({ coche, calibrate = false, epaisseur = 1.5, taille = '100%' }: Props) {
  if (!coche && !calibrate) return null
  const couleur = coche ? '#1a1510' : 'rgba(160,90,230,0.45)'
  return (
    <svg viewBox="0 0 14 11" style={{ width: taille, height: taille }} overflow="visible">
      <line x1="2" y1="1" x2="12" y2="10" stroke={couleur} strokeWidth={epaisseur} strokeLinecap="round" />
      <line x1="12" y1="1" x2="2" y2="10" stroke={couleur} strokeWidth={epaisseur} strokeLinecap="round" />
    </svg>
  )
}
