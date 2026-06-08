import { invoke as tauriInvoke } from '@tauri-apps/api/core'

const isTauri = () =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

async function invoke<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  return tauriInvoke<T>(cmd, args)
}

// Fichiers de données de jeu gérés par le middleware Vite en dev (écrits dans src/data/)
const GAME_DATA_FILES = new Set([
  'descriptions.json', 'traits-magiques.json', 'peuples.json',
  'compagnons.json', 'voies.json', 'armes.json', 'armures.json', 'traits-raciaux.json',
])

const LS_PREFIX = 'tda-data:'

export async function loadDataFile(filename: string): Promise<string | null> {
  if (isTauri()) {
    return invoke<string | null>('load_data_file', { filename })
  }
  if (GAME_DATA_FILES.has(filename)) {
    const res = await fetch(`/api/load-json?file=${encodeURIComponent(filename)}`)
    if (!res.ok) return null
    return res.text()
  }
  return localStorage.getItem(LS_PREFIX + filename)
}

export async function saveDataFile(filename: string, content: string): Promise<void> {
  if (isTauri()) {
    await invoke<void>('save_data_file', { filename, content })
    return
  }
  if (GAME_DATA_FILES.has(filename)) {
    await fetch('/api/save-json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: filename, data: JSON.parse(content) }),
    })
    return
  }
  localStorage.setItem(LS_PREFIX + filename, content)
}

export async function openDataDir(): Promise<void> {
  if (!isTauri()) return
  await invoke<void>('open_data_dir', {})
}

// Alias conservé pour compatibilité — en dev, saveDataFile écrit déjà dans src/data/
export async function saveDataFileToBundle(filename: string, data: unknown): Promise<void> {
  await fetch('/api/save-json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file: filename, data }),
  })
}
