import { useTranslation } from 'react-i18next'
import type { DescMap } from '../types/gameData'
import { useLocaleContext } from '../context/LocaleContext'

function getLang(lang: string): string {
  return lang.split('-')[0]
}

function useContentMap(type: string): Record<string, string> {
  const { contentMaps } = useLocaleContext()
  const { i18n } = useTranslation()
  const lang = getLang(i18n.language)
  return (contentMaps[`${type}.${lang}`] ?? contentMaps[`${type}.fr`] ?? {}) as Record<string, string>
}

function makeLookup(map: Record<string, string>): (fr: string) => string {
  return (fr: string) => map[fr] ?? fr
}

export function useVoieName(): (nom: string) => string {
  return makeLookup(useContentMap('voies'))
}

export function useTranslatedDescriptions(baseFr: DescMap): DescMap {
  const { contentMaps } = useLocaleContext()
  const { i18n } = useTranslation()
  const lang = getLang(i18n.language)
  if (lang === 'fr') return baseFr
  const flatMap = contentMaps[`voies.${lang}`] ?? contentMaps[`voies.fr`] ?? {}
  const hasRangKeys = Object.keys(flatMap).some(k => k.includes('|'))
  if (!hasRangKeys) return baseFr
  const result: DescMap = {}
  for (const [key, value] of Object.entries(flatMap)) {
    if (!key.includes('|')) continue
    const pipeIdx = key.lastIndexOf('|')
    const secondPipe = key.lastIndexOf('|', pipeIdx - 1)
    const voieName = key.slice(0, secondPipe)
    const rangIdx = parseInt(key.slice(secondPipe + 1, pipeIdx))
    const field = key.slice(pipeIdx + 1)
    if (!result[voieName]) result[voieName] = (baseFr[voieName] ?? []).map(r => ({ ...r }))
    if (result[voieName][rangIdx] && value) {
      result[voieName][rangIdx] = { ...result[voieName][rangIdx], [field]: value }
    }
  }
  for (const voieName of Object.keys(baseFr)) {
    if (!result[voieName]) result[voieName] = baseFr[voieName]
  }
  return result
}

export function useTraitName(): (nomFR: string) => string {
  return makeLookup(useContentMap('traits'))
}

export function useTraitDesc(): (nomFR: string) => string {
  return makeLookup(useContentMap('traits-descs'))
}

export function usePeupleName(): (labelFR: string) => string {
  return makeLookup(useContentMap('peuples'))
}

export function useCompagnonName(): (nomFR: string) => string {
  return makeLookup(useContentMap('compagnons'))
}

export function useEquipementName(): (nomFR: string) => string {
  return makeLookup(useContentMap('equipement'))
}
