import { invoke as tauriInvoke } from '@tauri-apps/api/core'

const isTauri = () =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

async function invoke<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  return tauriInvoke<T>(cmd, args)
}

export async function loadDataFile(filename: string): Promise<string | null> {
  if (isTauri()) {
    return invoke<string | null>('load_data_file', { filename })
  }
  return null
}

export async function saveDataFile(filename: string, content: string): Promise<void> {
  if (isTauri()) {
    await invoke<void>('save_data_file', { filename, content })
  }
  // Dev mode : pas d'écriture sur disque — Vite surveille src/data/ et un
  // writeFile déclencherait un HMR qui réinitialiserait l'état React.
}

export async function openDataDir(): Promise<void> {
  if (!isTauri()) return
  await invoke<void>('open_data_dir', {})
}
