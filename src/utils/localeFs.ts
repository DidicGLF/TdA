import { invoke } from '@tauri-apps/api/core'

export const initLocaleDir = (): Promise<string> =>
  invoke('init_locale_dir')

export const localeFileExists = (path: string): Promise<boolean> =>
  invoke('locale_file_exists', { path })

export const readLocaleFile = (path: string): Promise<string> =>
  invoke('read_locale_file', { path })

export const writeLocaleFile = (path: string, content: string): Promise<void> =>
  invoke('write_locale_file', { path, content })

export const listLocaleDir = (dir: string): Promise<string[]> =>
  invoke('list_locale_dir', { dir })
