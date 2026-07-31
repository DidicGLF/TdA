import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

const A4_LARGEUR_MM = 210
const A4_HAUTEUR_MM = 297
const A5_HAUTEUR_MM = 148

// Filet de rattrapage pour d'anciens personnages dont le recadrage de portrait (tx/ty) a été enregistré
// en pixels bruts par une version antérieure du pan/zoom (aujourd'hui en pourcentage) — une valeur aussi
// grande produirait une image visiblement décalée dans le PDF.
function corrigerPortraitsLegacy(container: HTMLElement) {
  container.querySelectorAll<HTMLElement>('.portrait-img').forEach(el => {
    const s  = parseFloat(el.dataset.scale ?? '1') || 1
    const tx = parseFloat(el.dataset.tx ?? '0')
    const ty = parseFloat(el.dataset.ty ?? '0')
    const safeTx = Math.abs(tx) > 3 ? 0 : tx
    const safeTy = Math.abs(ty) > 3 ? 0 : ty
    el.style.setProperty('transform', `scale(${s}) translate(${safeTx / s * 100}%, ${safeTy / s * 100}%)`, 'important')
  })
}

const DIACRITIQUES = /[̀-ͯ]/g

function sluggifier(nom: string): string {
  return nom.trim().toLowerCase()
    .normalize('NFD').replace(DIACRITIQUES, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'personnage'
}

// PDF unique de la fiche : recto, verso, voies, puis une fiche A5 par compagnon débloqué (2 par page,
// comme prévu à l'origine) — capturés en image via html2canvas plutôt que window.print(), dont le rendu
// restait cassé sur au moins une page (fiche compagnon, étirée/tronquée sur Windows ET Linux) et dont
// l'app n'a de toute façon aucun moyen de récupérer le fichier généré pour le fusionner avec autre
// chose. Contrepartie : texte non sélectionnable dans le PDF (rendu en image) — jugé acceptable pour
// une fiche destinée à être imprimée/remplie à la main plutôt que lue à l'écran.
export async function exporterFichePDF(container: HTMLElement, nomPersonnage: string): Promise<void> {
  corrigerPortraitsLegacy(container)
  // Laisse le navigateur appliquer le transform qu'on vient de poser avant de capturer — sinon
  // html2canvas peut lire une mise en page pas encore repeinte.
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  let premierePage = true
  const nouvellePage = () => {
    if (!premierePage) pdf.addPage()
    premierePage = false
  }

  const capturerPageEntiere = async (el: HTMLElement | null) => {
    if (!el) return
    nouvellePage()
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff' })
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, A4_LARGEUR_MM, A4_HAUTEUR_MM)
  }

  await capturerPageEntiere(container.querySelector<HTMLElement>('.print-page-recto'))
  await capturerPageEntiere(container.querySelector<HTMLElement>('.print-page-verso'))
  await capturerPageEntiere(container.querySelector<HTMLElement>('.print-page-voies'))

  const fichesCompagnons = Array.from(container.querySelectorAll<HTMLElement>('.print-page-compagnon'))
  for (let i = 0; i < fichesCompagnons.length; i++) {
    if (i % 2 === 0) nouvellePage()
    const canvas = await html2canvas(fichesCompagnons[i], { scale: 2, backgroundColor: '#ffffff' })
    const y = (i % 2) * A5_HAUTEUR_MM
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, y, A4_LARGEUR_MM, A5_HAUTEUR_MM)
  }

  pdf.save(`fiche-${sluggifier(nomPersonnage)}.pdf`)
}
