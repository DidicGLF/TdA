import { loadDataFile, saveDataFile, saveBinaryFile, loadBinaryFile } from './tauriStorage'

// Les images étaient encodées en base64 à l'intérieur des fichiers de données : le bestiaire pesait
// 2,6 Mo dont 91 % d'images (8 illustrations), les images de notes 27,8 Mo pour 11 images. Chaque
// ajout réécrivait donc l'intégralité du fichier. Elles vivent désormais dans images/, un fichier par
// image, le JSON ne conservant qu'une clé — les données redeviennent légères et ne sont plus
// réécrites à chaque modification d'image.
const DOSSIER = 'images'

const isTauri = () =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

// Une image chargée reste en mémoire : plusieurs composants affichent la même (liste + détail), et
// le contenu ne change pas tant qu'on ne la remplace pas.
const cache = new Map<string, string | null>()

// Ancien format (avant le passage au binaire réel) : la clé était nue (ex. "bestiaire-8340da17"), le
// contenu un fichier .txt contenant directement la Data URL en base64 — illisible/impartageable hors
// de l'app. Conservé pour ne pas casser les images déjà posées (pas de migration automatique, voir
// importerImage) : une clé nue continue de pointer ici, jamais réécrite dans le nouveau format.
const cheminImageLegacy = (cle: string) => `${DOSSIER}/${cle}.txt`

// Nouveau format : la clé porte elle-même son extension (ex. "bestiaire-8340da17.webp"), le fichier
// est du binaire réel — ouvrable/copiable comme n'importe quelle image, contrairement à l'ancien .txt.
const estNouveauFormat = (cle: string) => /\.[a-z0-9]+$/i.test(cle)
const cheminImageBinaire = (cle: string) => `${DOSSIER}/${cle}`

// Empreinte du contenu : deux images identiques donnent la même clé, donc le même fichier. La
// déduplication est ainsi acquise par construction, sans code de détection — les notes contenaient
// 11 copies du même logo (25 Mo de doublons sur 27,8), le bestiaire 3 copies de la même image d'aigle.
async function empreinte(contenu: string): Promise<string> {
  const octets = new TextEncoder().encode(contenu)
  const condensat = await crypto.subtle.digest('SHA-256', octets)
  return Array.from(new Uint8Array(condensat)).slice(0, 8)
    .map(o => o.toString(16).padStart(2, '0')).join('')
}

// Extrait l'extension et les octets bruts d'une Data URL image (ex. "data:image/webp;base64,...") —
// jamais "webp" figé en dur : compresserImage peut retomber sur le format d'origine (échec, SVG…).
function dataUrlVersOctets(dataUrl: string): { extension: string; octets: Uint8Array } {
  const m = dataUrl.match(/^data:image\/([a-z0-9+.-]+);base64,(.*)$/is)
  if (!m) throw new Error('Data URL image invalide')
  const extension = m[1].split('+')[0] // 'svg+xml' -> 'svg'
  const binaire = atob(m[2])
  const octets = new Uint8Array(binaire.length)
  for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i)
  return { extension, octets }
}

function octetsVersDataUrl(octets: Uint8Array, extension: string): string {
  let binaire = ''
  for (let i = 0; i < octets.length; i++) binaire += String.fromCharCode(octets[i])
  const mime = extension === 'svg' ? 'image/svg+xml' : `image/${extension}`
  return `data:${mime};base64,${btoa(binaire)}`
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
// Hors Tauri (aperçu navigateur, pas de vrai fichier possible) : ancien comportement inchangé, clé
// nue + stockage texte. Sous Tauri : nouvelle clé avec extension + fichier binaire réel.
// cleNommee (optionnelle) : identifiant fourni par l'appelant (déjà "slug-safe", voir sluggifierNom
// dans bestiairePerso.ts) à utiliser à la place de l'empreinte de contenu — pour le bestiaire, où le
// nom de la créature rend le fichier lisible/partageable. Séparateur '_' (pas '-') et préfixe 'img'
// côté bestiaire (voir les appelants) : le fichier stocké (ex. "img_orc_guerrier_nc4.webp") porte
// alors EXACTEMENT le nom attendu par l'import en masse (img_<nom>[_nc<NC>].ext, voir
// GMDashboard.tsx) — le dossier images/ devient directement réutilisable comme dossier source pour
// un autre import, sans rien renommer. Omise (images de notes, sans nom naturel à utiliser) :
// comportement inchangé, juste le hash de contenu.
export async function importerImage(prefixe: string, dataUrl: string, cleNommee?: string): Promise<string> {
  const compressee = await compresserImage(dataUrl)
  const identifiant = cleNommee ?? await empreinte(compressee)
  const cle = isTauri() ? `${prefixe}_${identifiant}.${dataUrlVersOctets(compressee).extension}` : `${prefixe}_${identifiant}`
  await enregistrerImage(cle, compressee)
  return cle
}

export function estCleImage(valeur: string | undefined | null): boolean {
  return !!valeur && !valeur.startsWith('data:')
}

export async function chargerImage(cle: string): Promise<string | null> {
  if (cache.has(cle)) return cache.get(cle) ?? null
  let contenu: string | null
  if (isTauri() && estNouveauFormat(cle)) {
    const octets = await loadBinaryFile(cheminImageBinaire(cle))
    const extension = cle.slice(cle.lastIndexOf('.') + 1)
    contenu = octets && octets.length > 0 ? octetsVersDataUrl(octets, extension) : null
  } else {
    contenu = await loadDataFile(cheminImageLegacy(cle))
  }
  cache.set(cle, contenu)
  return contenu
}

export async function enregistrerImage(cle: string, dataUrl: string): Promise<void> {
  if (isTauri() && estNouveauFormat(cle)) {
    await saveBinaryFile(cheminImageBinaire(cle), dataUrlVersOctets(dataUrl).octets)
  } else {
    await saveDataFile(cheminImageLegacy(cle), dataUrl)
  }
  cache.set(cle, dataUrl)
}

// Pas de suppression de fichier : on écrit un contenu vide, que chargerImage traite comme une
// absence (0 octet pour le binaire, chaîne vide pour l'ancien format texte). Le fichier résiduel est
// négligeable et évite d'ajouter une commande native de suppression.
export async function oublierImage(cle: string): Promise<void> {
  if (isTauri() && estNouveauFormat(cle)) {
    await saveBinaryFile(cheminImageBinaire(cle), new Uint8Array(0))
  } else {
    await saveDataFile(cheminImageLegacy(cle), '')
  }
  cache.set(cle, null)
}

export function viderCacheImages(): void {
  cache.clear()
}
