import { loadDataFile, saveDataFile } from './tauriStorage'

// Les images étaient encodées en base64 à l'intérieur des fichiers de données : le bestiaire pesait
// 2,6 Mo dont 91 % d'images (8 illustrations), les images de notes 27,8 Mo pour 11 images. Chaque
// ajout réécrivait donc l'intégralité du fichier. Elles vivent désormais dans images/, un fichier par
// image, le JSON ne conservant qu'une clé — les données redeviennent légères et ne sont plus
// réécrites à chaque modification d'image.
const DOSSIER = 'images'

// Une image chargée reste en mémoire : plusieurs composants affichent la même (liste + détail), et
// le contenu ne change pas tant qu'on ne la remplace pas.
const cache = new Map<string, string | null>()

export const cheminImage = (cle: string) => `${DOSSIER}/${cle}.txt`

// Empreinte du contenu : deux images identiques donnent la même clé, donc le même fichier. La
// déduplication est ainsi acquise par construction, sans code de détection — les notes contenaient
// 11 copies du même logo (25 Mo de doublons sur 27,8), le bestiaire 3 copies de la même image d'aigle.
async function empreinte(contenu: string): Promise<string> {
  const octets = new TextEncoder().encode(contenu)
  const condensat = await crypto.subtle.digest('SHA-256', octets)
  return Array.from(new Uint8Array(condensat)).slice(0, 8)
    .map(o => o.toString(16).padStart(2, '0')).join('')
}

// Réencode en webp et borne la taille : les images importées sont souvent bien plus lourdes que
// nécessaire (un simple logo pesait 2,53 Mo en PNG). En cas d'échec (format exotique, SVG…), on
// conserve l'original plutôt que de risquer de dégrader ou de perdre l'image.
export async function compresserImage(dataUrl: string, cotéMax = 1600, qualite = 0.82): Promise<string> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = dataUrl
    })
    const ratio = Math.min(1, cotéMax / Math.max(img.width, img.height))
    const largeur = Math.round(img.width * ratio)
    const hauteur = Math.round(img.height * ratio)
    const canvas = document.createElement('canvas')
    canvas.width = largeur
    canvas.height = hauteur
    const ctx = canvas.getContext('2d')
    if (!ctx) return dataUrl
    ctx.drawImage(img, 0, 0, largeur, hauteur)
    const compressee = canvas.toDataURL('image/webp', qualite)
    // Certains navigateurs ignorent le webp et renvoient du png : on ne garde que si c'est plus léger.
    return compressee.length < dataUrl.length ? compressee : dataUrl
  } catch {
    return dataUrl
  }
}

// Point d'entrée unique à l'import d'une image : compresse, déduplique, enregistre, renvoie la clé.
export async function importerImage(prefixe: string, dataUrl: string): Promise<string> {
  const compressee = await compresserImage(dataUrl)
  const cle = `${prefixe}-${await empreinte(compressee)}`
  await enregistrerImage(cle, compressee)
  return cle
}

export function estCleImage(valeur: string | undefined | null): boolean {
  return !!valeur && !valeur.startsWith('data:')
}

export async function chargerImage(cle: string): Promise<string | null> {
  if (cache.has(cle)) return cache.get(cle) ?? null
  const contenu = await loadDataFile(cheminImage(cle))
  cache.set(cle, contenu)
  return contenu
}

export async function enregistrerImage(cle: string, dataUrl: string): Promise<void> {
  await saveDataFile(cheminImage(cle), dataUrl)
  cache.set(cle, dataUrl)
}

// Pas de suppression de fichier côté Rust : on écrit une chaîne vide, que chargerImage traite comme
// une absence. Le fichier résiduel est négligeable et évite d'ajouter une commande native.
export async function oublierImage(cle: string): Promise<void> {
  await saveDataFile(cheminImage(cle), '')
  cache.set(cle, null)
}

export function viderCacheImages(): void {
  cache.clear()
}
