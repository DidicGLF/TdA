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
  } else {
    localStorage.setItem(LS_PREFIX + filename, content)
  }
}

export async function openDataDir(): Promise<void> {
  if (!isTauri()) return
  await invoke<void>('open_data_dir', {})
}

// Écrit le fichier dans src/data/ via le middleware Vite (dev uniquement)
export async function saveDataFileToBundle(filename: string, data: unknown): Promise<void> {
  await fetch('/api/save-json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file: filename, data }),
  })
}
