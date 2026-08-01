import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

const A5_LARGEUR_MM = 210
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

// L'impression native de la fiche compagnon (via @page/window.print) reste cassée sur Windows ET Linux
// (étirement + troncature — voir project_impression_pdf_bug) après plusieurs correctifs CSS revertés.
// On capture donc chaque fiche en image (html2canvas) et on les assemble en PDF (jsPDF), indépendamment
// du moteur d'impression du navigateur/OS — au prix d'un texte non sélectionnable dans le PDF, seulement
// pour cette fiche (recto/verso/voies restent en impression native, déjà correcte sur Windows).
export async function exporterFichesCompagnonsPDF(container: HTMLElement): Promise<void> {
  corrigerPortraitsLegacy(container)
  // Laisse le navigateur appliquer le transform qu'on vient de poser avant de capturer — sinon
  // html2canvas peut lire une mise en page pas encore repeinte.
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))

  const fiches = Array.from(container.querySelectorAll<HTMLElement>('.print-page-compagnon'))
  if (fiches.length === 0) return

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  for (let i = 0; i < fiches.length; i++) {
    const canvas = await html2canvas(fiches[i], { scale: 2, backgroundColor: '#ffffff' })
    if (i > 0 && i % 2 === 0) pdf.addPage()
    const y = (i % 2) * A5_HAUTEUR_MM
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, y, A5_LARGEUR_MM, A5_HAUTEUR_MM)
  }
  pdf.save('fiches-compagnons.pdf')
}
