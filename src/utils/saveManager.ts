import { saveDataFile } from './tauriStorage'

// Gestionnaire centralisé des sauvegardes de données de jeu.
// - Regroupe (debounce) les écritures par fichier pour éviter d'écrire le JSON
//   entier sur disque à chaque frappe clavier.
// - Expose un statut ('saving' | 'saved' | 'error') auquel l'UI peut s'abonner
//   afin de signaler les échecs au lieu de les avaler silencieusement.

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

const DEBOUNCE_MS = 500

const pendingContent = new Map<string, string>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()
let inFlight = 0
let status: SaveStatus = 'idle'
let savedResetTimer: ReturnType<typeof setTimeout> | null = null

const listeners = new Set<(s: SaveStatus) => void>()

function emit(s: SaveStatus) {
  status = s
  listeners.forEach(l => l(s))
}

export function subscribeSaveStatus(fn: (s: SaveStatus) => void): () => void {
  listeners.add(fn)
  fn(status)
  return () => { listeners.delete(fn) }
}

export function getSaveStatus(): SaveStatus {
  return status
}

/** Programme une écriture debouncée du fichier. Les appels rapprochés sur le
 *  même fichier sont fusionnés ; seul le dernier contenu est écrit. */
export function queueSave(filename: string, content: string): void {
  pendingContent.set(filename, content)
  if (savedResetTimer) { clearTimeout(savedResetTimer); savedResetTimer = null }
  emit('saving')
  const existing = timers.get(filename)
  if (existing) clearTimeout(existing)
  timers.set(filename, setTimeout(() => { void flush(filename) }, DEBOUNCE_MS))
}

async function flush(filename: string): Promise<void> {
  timers.delete(filename)
  const content = pendingContent.get(filename)
  if (content === undefined) return
  pendingContent.delete(filename)
  inFlight++
  try {
    await saveDataFile(filename, content)
    inFlight--
    settle()
  } catch (e) {
    console.error('[saveManager] échec de sauvegarde de', filename, e)
    inFlight--
    emit('error')
  }
}

function settle() {
  if (status === 'error') return
  if (inFlight === 0 && timers.size === 0 && pendingContent.size === 0) {
    emit('saved')
    savedResetTimer = setTimeout(() => emit('idle'), 2000)
  }
}

/** Écrit immédiatement toutes les sauvegardes en attente (fermeture de l'app). */
export async function flushAllSaves(): Promise<void> {
  const names = [...timers.keys()]
  for (const n of names) {
    const t = timers.get(n)
    if (t) clearTimeout(t)
  }
  timers.clear()
  await Promise.all(names.map(n => flush(n)))
}

if (typeof window !== 'undefined') {
  // Filet de sécurité : vide la file d'attente avant la fermeture pour ne pas
  // perdre les ~500 ms d'écritures encore en debounce.
  window.addEventListener('beforeunload', () => { void flushAllSaves() })
}
