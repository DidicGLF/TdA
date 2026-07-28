import { invoke as tauriInvoke } from '@tauri-apps/api/core'

const isTauri = () =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

async function invoke<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  return tauriInvoke<T>(cmd, args)
}

const LS_PREFIX = 'tda-data:'

export async function loadDataFile(filename: string): Promise<string | null> {
  if (isTauri()) {
    return invoke<string | null>('load_data_file', { filename })
  }
  return localStorage.getItem(LS_PREFIX + filename)
}

export async function saveDataFile(filename: string, content: string): Promise<void> {
  if (isTauri()) {
    await invoke<void>('save_data_file', { filename, content })
    return
  }
  localStorage.setItem(LS_PREFIX + filename, content)
}

// Binaire réel (images, voir imageStore.ts) — contrairement à load/saveDataFile (texte). Hors Tauri
// (aperçu navigateur) : pas de vrai fichier de toute façon dans ce contexte, no-op/null — imageStore.ts
// garde son ancien chemin texte via localStorage pour ce cas.
export async function saveBinaryFile(filename: string, content: Uint8Array): Promise<void> {
  if (!isTauri()) return
  await invoke<void>('save_binary_file', { filename, content: Array.from(content) })
}

export async function loadBinaryFile(filename: string): Promise<Uint8Array | null> {
  if (!isTauri()) return null
  const octets = await invoke<number[] | null>('load_binary_file', { filename })
  return octets ? new Uint8Array(octets) : null
}

// Charge un fichier rangé dans un sous-dossier (voir le rangement Personnage/Notes/Maitre de jeu de
// Documents/TdA) ; si le nouveau chemin n'existe pas encore, reprend l'ancien emplacement (racine,
// nom d'avant le rangement) et le recopie aussitôt au nouveau chemin. Migration silencieuse, faite une
// seule fois (le nouveau fichier existe ensuite), et réversible : l'ancien fichier n'est jamais
// supprimé, donc revenir en arrière ne perd rien.
export async function loadDataFileDossier(nouveauChemin: string, ancienNom: string): Promise<string | null> {
  const actuel = await loadDataFile(nouveauChemin)
  if (actuel !== null) return actuel
  const ancien = await loadDataFile(ancienNom)
  if (ancien !== null) await saveDataFile(nouveauChemin, ancien)
  return ancien
}

export async function openDataDir(): Promise<void> {
  if (!isTauri()) return
  await invoke<void>('open_data_dir', {})
}

// Alias conservé pour compatibilité — en dev, saveDataFile écrit déjà dans src/data/
export async function saveDataFileToBundle(filename: string, data: unknown): Promise<void> {
  const res = await fetch('/api/save-json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file: filename, data }),
  })
  // Le serveur refuse tout fichier absent de sa liste blanche. Sans cette vérification, l'échec
  // passait inaperçu et on croyait la sauvegarde faite (cas vécu avec capacites-bibliotheque.json).
  if (!res.ok) {
    throw new Error(`Sauvegarde de ${filename} refusée par le serveur (${res.status}) : ${await res.text()}`)
  }
}
