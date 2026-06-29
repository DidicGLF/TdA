import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import i18n from '../i18n'
import { initLocaleDir, localeFileExists, readLocaleFile, writeLocaleFile, listLocaleDir } from '../utils/localeFs'

// ── Bundled defaults (compile-time) ─────────────────────────────────────────

const BUNDLED_UI = import.meta.glob('../locales/[a-z][a-z].json', { eager: true }) as Record<string, { default: Record<string, unknown> }>
const BUNDLED_CONTENT = import.meta.glob('../locales/content/*.json', { eager: true }) as Record<string, { default: Record<string, unknown> }>
const BUNDLED_LANGUAGES = import.meta.glob('../locales/languages.json', { eager: true }) as Record<string, { default: Language[] }>

export type Language = { code: string; label: string }
export type ContentMaps = Record<string, Record<string, unknown>>

function buildBundledUIMaps(): ContentMaps {
  const maps: ContentMaps = {}
  for (const [path, mod] of Object.entries(BUNDLED_UI)) {
    const filename = path.split('/').pop() ?? ''
    const code = filename.replace('.json', '')
    maps[code] = mod.default
  }
  return maps
}

// Derive initial content maps from bundled files
function buildBundledContentMaps(): ContentMaps {
  const maps: ContentMaps = {}
  for (const [path, mod] of Object.entries(BUNDLED_CONTENT)) {
    // path like "../locales/content/voies.fr.json" → key "voies.fr"
    const filename = path.split('/').pop() ?? ''
    const key = filename.replace('.json', '')
    maps[key] = mod.default
  }
  return maps
}

const BUNDLED_LANGS: Language[] = Object.values(BUNDLED_LANGUAGES)[0]?.default ?? [
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'English' },
]

// ── Context types ────────────────────────────────────────────────────────────

interface LocaleContextValue {
  contentMaps: ContentMaps
  uiMaps: ContentMaps
  languages: Language[]
  saveContentFile: (filename: string, data: Record<string, unknown>) => Promise<void>
  saveUIFile: (filename: string, data: Record<string, unknown>) => Promise<void>
  saveLanguages: (langs: Language[]) => Promise<void>
  reloadLocales: () => Promise<void>
}

const LocaleContext = createContext<LocaleContextValue>({
  contentMaps: buildBundledContentMaps(),
  uiMaps: buildBundledUIMaps(),
  languages: BUNDLED_LANGS,
  saveContentFile: async () => {},
  saveUIFile: async () => {},
  saveLanguages: async () => {},
  reloadLocales: async () => {},
})

export function useLocaleContext() {
  return useContext(LocaleContext)
}

// ── Provider ─────────────────────────────────────────────────────────────────

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [contentMaps, setContentMaps] = useState<ContentMaps>(buildBundledContentMaps)
  const [uiMaps, setUIMaps] = useState<ContentMaps>(buildBundledUIMaps)
  const [languages, setLanguages] = useState<Language[]>(BUNDLED_LANGS)

  const reloadLocales = useCallback(async () => {
    try {
      await initLocaleDir()

      // ── 1. Seed missing bundled files into user dir ────────────────────────

      // UI files
      for (const [path, mod] of Object.entries(BUNDLED_UI)) {
        const filename = path.split('/').pop()!
        const dest = `ui/${filename}`
        const exists = await localeFileExists(dest)
        if (!exists) {
          await writeLocaleFile(dest, JSON.stringify(mod.default, null, 2))
        }
      }

      // Content files — always overwrite *.fr.json if bundled has more keys (source of truth)
      for (const [path, mod] of Object.entries(BUNDLED_CONTENT)) {
        const filename = path.split('/').pop()!
        const dest = `content/${filename}`
        const isFr = filename.endsWith('.fr.json')
        const exists = await localeFileExists(dest)
        if (!exists) {
          await writeLocaleFile(dest, JSON.stringify(mod.default, null, 2))
        } else if (isFr) {
          // Overwrite FR files when the bundled version has more keys (e.g. voies got rang descriptions)
          try {
            const existing = JSON.parse(await readLocaleFile(dest))
            const bundledCount = Object.keys(mod.default).length
            const existingCount = Object.keys(existing).length
            if (bundledCount > existingCount) {
              await writeLocaleFile(dest, JSON.stringify(mod.default, null, 2))
            }
          } catch {
            await writeLocaleFile(dest, JSON.stringify(mod.default, null, 2))
          }
        }
      }

      // Languages list
      const langsExists = await localeFileExists('languages.json')
      if (!langsExists) {
        await writeLocaleFile('languages.json', JSON.stringify(BUNDLED_LANGS, null, 2))
      }

      // ── 2. Load languages ─────────────────────────────────────────────────

      try {
        const langsRaw = await readLocaleFile('languages.json')
        const langs: Language[] = JSON.parse(langsRaw)
        setLanguages(langs)
      } catch {
        setLanguages(BUNDLED_LANGS)
      }

      // ── 3. Load UI translation files and merge into i18next ───────────────

      const uiFiles = await listLocaleDir('ui')
      const newUIMaps: ContentMaps = { ...buildBundledUIMaps() }
      for (const filename of uiFiles) {
        if (!filename.endsWith('.json')) continue
        const code = filename.replace('.json', '')
        try {
          const raw = await readLocaleFile(`ui/${filename}`)
          const data = JSON.parse(raw)
          i18n.addResourceBundle(code, 'translation', data, true, true)
          newUIMaps[code] = data
        } catch { /* skip malformed file */ }
      }
      setUIMaps(newUIMaps)

      // ── 4. Load content maps ──────────────────────────────────────────────

      const contentFiles = await listLocaleDir('content')
      const newMaps: ContentMaps = { ...buildBundledContentMaps() }
      for (const filename of contentFiles) {
        if (!filename.endsWith('.json')) continue
        const key = filename.replace('.json', '')
        try {
          const raw = await readLocaleFile(`content/${filename}`)
          newMaps[key] = JSON.parse(raw)
        } catch { /* skip */ }
      }
      setContentMaps(newMaps)

    } catch (err) {
      console.error('[LocaleContext] reloadLocales failed:', err)
    }
  }, [])

  useEffect(() => {
    reloadLocales()
  }, [reloadLocales])

  const saveContentFile = useCallback(async (filename: string, data: Record<string, unknown>) => {
    await writeLocaleFile(`content/${filename}`, JSON.stringify(data, null, 2))
    const key = filename.replace('.json', '')
    setContentMaps(prev => ({ ...prev, [key]: data }))
  }, [])

  const saveUIFile = useCallback(async (filename: string, data: Record<string, unknown>) => {
    await writeLocaleFile(`ui/${filename}`, JSON.stringify(data, null, 2))
    const code = filename.replace('.json', '')
    i18n.addResourceBundle(code, 'translation', data, true, true)
    setUIMaps(prev => ({ ...prev, [code]: data }))
  }, [])

  const saveLanguages = useCallback(async (langs: Language[]) => {
    await writeLocaleFile('languages.json', JSON.stringify(langs, null, 2))
    setLanguages(langs)
  }, [])

  return (
    <LocaleContext.Provider value={{ contentMaps, uiMaps, languages, saveContentFile, saveUIFile, saveLanguages, reloadLocales }}>
      {children}
    </LocaleContext.Provider>
  )
}
