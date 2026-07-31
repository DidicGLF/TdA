import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

const A5_LARGEUR_MM = 210
const A5_HAUTEUR_MM = 148

// L'impression native de la fiche compagnon (via @page/window.print) reste cassée sur Windows ET Linux
// (étirement + troncature — voir project_impression_pdf_bug) après deux correctifs CSS revertés. On
// capture donc chaque fiche en image (html2canvas) et on les assemble en PDF (jsPDF), indépendamment du
// moteur d'impression du navigateur/OS — au prix d'un texte non sélectionnable dans le PDF, seulement
// pour cette fiche (recto/verso/voies restent en impression native, déjà correcte sur Windows).
export async function exporterFichesCompagnonsPDF(container: HTMLElement): Promise<void> {
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
