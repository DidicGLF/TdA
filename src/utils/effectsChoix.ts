import type { Character } from '../types/character'
import type { DescMap } from '../types/gameData'

type EffectChoixGrant = {
  type: 'EFFECT_CHOIX'
  stats: string[]
  value?: number
  formula?: string
  rangMultiplier?: boolean
  minRang?: number
  avancee?: boolean
}

const VOIE_KEYS = ['voiePeuple', 'voieCulturelle', 'voie1', 'voie2', 'voie3', 'voiePrestige', 'voieSangMele'] as const

export function makeGrantKey(voieNom: string, rangIdx: number, grantIdx: number): string {
  return `${voieNom}|${rangIdx}|${grantIdx}`
}

export function getEffectChoixGrants(
  character: Character,
  descriptions: DescMap,
): { grant: EffectChoixGrant; grantKey: string; choixFait: string | null }[] {
  const result: { grant: EffectChoixGrant; grantKey: string; choixFait: string | null }[] = []

  for (const field of VOIE_KEYS) {
    const voie = character[field]
    if (!voie.nom) continue
    const rangs = descriptions[voie.nom]
    if (!rangs) continue

    for (let i = 0; i < voie.rangs.length; i++) {
      if (!voie.rangs[i]) continue
      const entry = rangs[i]
      if (!entry?.grants) continue

      entry.grants.forEach((grant, grantIdx) => {
        if (grant.type !== 'EFFECT_CHOIX') return
        if (grant.avancee) return
        if (grant.minRang !== undefined && (i + 1) < grant.minRang) return

        const grantKey = makeGrantKey(voie.nom, i, grantIdx)
        const choixFait = character.effectsChoix?.[grantKey] ?? null
        result.push({ grant: grant as EffectChoixGrant, grantKey, choixFait })
      })
    }
  }

  return result
}

export function applyChoixEffect(
  character: Character,
  grantKey: string,
  stat: string,
): Record<string, string> {
  return { ...(character.effectsChoix ?? {}), [grantKey]: stat }
}
