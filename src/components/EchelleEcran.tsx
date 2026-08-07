import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

// Correctif "TV" : une TV branchée en HDMI (quel que soit l'OS — Windows compris) ne remonte souvent
// AUCUNE mise à l'échelle, contrairement à un moniteur classique reconnu comme tel : devicePixelRatio
// reste à 1 malgré une résolution énorme (Windows applique en général 100% par défaut sur un écran
// externe tant que l'utilisateur ne va pas régler l'échelle manuellement dans Paramètres d'affichage —
// une TV, rarement configurée comme un vrai moniteur de bureau, reste donc typiquement à 100%). Dans ce
// cas précis (résolution très haute + devicePixelRatio à 1), on grossit artificiellement toute
// l'interface pour rester lisible à distance, sans quoi chaque pixel logique reste minuscule sur un
// écran physiquement immense.
//
// transform: scale() plutôt que le zoom CSS : `zoom` changerait window.innerWidth, la valeur que
// App.tsx/GMDashboard.tsx lisent pour basculer en mise en page mobile (screenWidth < 1200) — un TV
// zoomé se ferait alors passer, à tort, pour un mobile. transform ne touche jamais innerWidth, et les
// coordonnées souris (clientX/clientY) comme getBoundingClientRect() restent cohérentes après
// transformation (le drag des portraits, le calibrage, etc. continuent de fonctionner sans adaptation).
//
// Seuil volontairement haut (4K, 3840px) plutôt que réagir dès qu'un écran dépasse 1920px : beaucoup de
// moniteurs de bureau (1440p/4K) tournent aussi à devicePixelRatio 1 sans que ce soit un problème — vus
// de près, ils n'ont pas besoin d'être grossis. Seul un écran massif (TV) mérite ce correctif.
const LARGEUR_REFERENCE = 1920
const SEUIL_DECLENCHEMENT = 3840
const ECHELLE_MAX = 2.5

function calculerEchelle(): number {
  if (typeof window === 'undefined') return 1
  const largeurEcran = window.screen.width
  const dpr = window.devicePixelRatio || 1
  if (largeurEcran < SEUIL_DECLENCHEMENT || dpr > 1) return 1
  return Math.min(ECHELLE_MAX, largeurEcran / LARGEUR_REFERENCE)
}

export default function EchelleEcran({ children }: { children: ReactNode }) {
  const [echelle, setEchelle] = useState(calculerEchelle)

  useEffect(() => {
    // Recalcule au redimensionnement — notamment utile en multi-écrans, si la fenêtre passe d'un
    // moniteur normal à la TV (ou l'inverse).
    const recalculer = () => setEchelle(calculerEchelle())
    window.addEventListener('resize', recalculer)
    return () => window.removeEventListener('resize', recalculer)
  }, [])

  if (echelle === 1) return <>{children}</>

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <div style={{ width: `${100 / echelle}%`, height: `${100 / echelle}%`, transform: `scale(${echelle})`, transformOrigin: 'top left' }}>
        {children}
      </div>
    </div>
  )
}
