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
    return
  }
  // Dev (Vite) : écriture sur disque via le serveur de dev
  fetch('/api/save-json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file: filename, data: JSON.parse(content) }),
  }).catch(() => {})
}

export async function openDataDir(): Promise<void> {
  if (!isTauri()) return
  await invoke<void>('open_data_dir', {})
}
