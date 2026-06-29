import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

// Auto-discover all UI translation files (2-letter lang codes only, not languages.json or content/)
const uiModules = import.meta.glob('./locales/[a-z][a-z].json', { eager: true }) as Record<string, { default: Record<string, unknown> }>

const resources: Record<string, { translation: Record<string, unknown> }> = {}
for (const [path, mod] of Object.entries(uiModules)) {
  const code = path.replace('./locales/', '').replace('.json', '')
  resources[code] = { translation: mod.default as Record<string, unknown> }
}

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: localStorage.getItem('tda-lang') ?? 'fr',
    fallbackLng: 'fr',
    interpolation: { escapeValue: false },
  })

export default i18n
