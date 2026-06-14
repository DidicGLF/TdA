import type { Character } from '../types/character'
import type { DescMap, CompanionEntry } from '../types/gameData'

const VOIE_KEYS = [
  'voiePeuple', 'voieCulturelle',
  'voie1', 'voie2', 'voie3',
  'voiePrestige', 'voieSangMele',
] as const

type CompagnonChoixGrant = { type: 'COMPAGNON_CHOIX'; noms: string[]; minRang?: number; avancee?: boolean }

// Retourne les noms des compagnons disponibles pour ce personnage
export function getCompagnonsDisponibles(
  character: Character,
  descriptions: DescMap,
): string[] {
  const noms: string[] = []
  const remplacés = new Set<string>()

  for (const field of VOIE_KEYS) {
    const voie = character[field]
    if (!voie.nom) continue
    const rangs = descriptions[voie.nom]
    if (!rangs) continue
    for (let i = 0; i < voie.rangs.length; i++) {
      if (!voie.rangs[i]) continue
      const entry = rangs[i]
      if (!entry?.grants) continue
      for (const grant of entry.grants) {
        if (grant.minRang !== undefined && (i + 1) < grant.minRang) continue
        if (grant.type === 'COMPAGNON') {
          if (!noms.includes(grant.nom)) noms.push(grant.nom)
          if (grant.remplace) remplacés.add(grant.remplace)
        } else if (grant.type === 'COMPAGNON_CHOIX') {
          const choix = grant.noms.find(n => character.compagnonsChoix?.includes(n))
          if (choix && !noms.includes(choix)) noms.push(choix)
        }
      }
    }
  }
  return noms.filter(n => !remplacés.has(n))
}

// Retourne les grants COMPAGNON_CHOIX actifs (rang acquis, minRang ok)
// avec l'éventuel choix déjà fait par le joueur
export function getCompagnonChoixGrants(
  character: Character,
  descriptions: DescMap,
): { grant: CompagnonChoixGrant; choixFait: string | null }[] {
  const result: { grant: CompagnonChoixGrant; choixFait: string | null }[] = []
  const seen = new Set<string>()  // déduplique par ensemble de noms
  for (const field of VOIE_KEYS) {
    const voie = character[field]
    if (!voie.nom) continue
    const rangs = descriptions[voie.nom]
    if (!rangs) continue
    for (let i = 0; i < voie.rangs.length; i++) {
      if (!voie.rangs[i]) continue
      const entry = rangs[i]
      if (!entry?.grants) continue
      for (const grant of entry.grants) {
        if (grant.type !== 'COMPAGNON_CHOIX') continue
        if (grant.minRang !== undefined && (i + 1) < grant.minRang) continue
        const key = grant.noms.slice().sort().join('|')
        if (seen.has(key)) continue
        seen.add(key)
        const choixFait = grant.noms.find(n => character.compagnonsChoix?.includes(n)) ?? null
        result.push({ grant, choixFait })
      }
    }
  }
  return result
}

// Met à jour compagnonsChoix et nettoie les choix devenus invalides
export function applyChoixCompagnon(
  character: Character,
  nom: string,
  grantsActifs: ReturnType<typeof getCompagnonChoixGrants>,
): string[] {
  // Trouver le grant qui offre ce nom
  const grantConcerne = grantsActifs.find(({ grant }) => grant.noms.includes(nom))
  if (!grantConcerne) return character.compagnonsChoix ?? []
  // Retirer tout choix précédent de ce grant, puis ajouter le nouveau
  const autres = (character.compagnonsChoix ?? []).filter(
    n => !grantConcerne.grant.noms.includes(n)
  )
  return [...autres, nom]
}

export function autoAssignCompagnons(
  character: Character,
  descriptions: DescMap,
): [string | null, string | null] {
  const disponibles = getCompagnonsDisponibles(character, descriptions)
  const actifs: [string | null, string | null] = [
    character.compagnonsActifs?.[0] ?? null,
    character.compagnonsActifs?.[1] ?? null,
  ]
  if (actifs[0] && !disponibles.includes(actifs[0])) actifs[0] = null
  if (actifs[1] && !disponibles.includes(actifs[1])) actifs[1] = null
  for (const nom of disponibles) {
    if (actifs.includes(nom)) continue
    if (actifs[0] === null) { actifs[0] = nom; continue }
    if (actifs[1] === null) { actifs[1] = nom; break }
  }
  return actifs
}

type AttContext = { contact: number; distance: number; magique: number }

export function resolveNiv(stat: number | string, niveau: number, rang = 1, att?: AttContext): string {
  if (typeof stat === 'number') return String(stat)
  const fmt = (n: number) => n >= 0 ? `+${n}` : `${n}`
  return stat
    .replace(/\[RANG\s*[x×*]\s*(\d+)\]/gi, (_, n) => `[RANG×${n}](${rang * parseInt(n)})`)
    .replace(/\[RANG\]/gi, `[RANG](${rang})`)
    .replace(/\[NIV\s*[x×*]\s*(\d+)\]/gi, (_, n) => `[NIV×${n}](${niveau * parseInt(n)})`)
    .replace(/\[NIV\]/gi, `[NIV](${niveau})`)
    .replace(/\[ATT\s+contact\]/gi,  `[ATT contact](${fmt(att?.contact  ?? 0)})`)
    .replace(/\[ATT\s+distance\]/gi, `[ATT distance](${fmt(att?.distance ?? 0)})`)
    .replace(/\[ATT\s+magique\]/gi,  `[ATT magique](${fmt(att?.magique  ?? 0)})`)
}

// Résout les tokens de modificateurs de compagnon : [FOR], [DEX], etc.
const MOD_KEYS = ['for', 'dex', 'con', 'int', 'sag', 'cha'] as const
function resolveModTokens(s: string, entry: CompanionEntry): string {
  let result = s
  for (const key of MOD_KEYS) {
    const val = entry[key] as number
    const display = val >= 0 ? `+${val}` : `${val}`
    result = result.replace(new RegExp(`\\[${key.toUpperCase()}\\]`, 'gi'), `[${key.toUpperCase()}](${display})`)
  }
  return result
}

export function resolveDM(dm: string, entry: CompanionEntry, niveau: number, rang = 1, att?: AttContext): string {
  return resolveModTokens(resolveNiv(dm, niveau, rang, att), entry)
}

// Retourne uniquement la valeur numérique calculée (pour l'affichage sur la fiche)
export function computeNiv(stat: number | string, niveau: number, rang = 1, att?: AttContext): string {
  if (typeof stat === 'number') return String(stat)
  const expr = stat
    .replace(/\[RANG\s*[x×*]\s*(\d+)\]/gi, (_, n) => String(rang * parseInt(n)))
    .replace(/\[RANG\]/gi, String(rang))
    .replace(/\[NIV\s*[x×*]\s*(\d+)\]/gi, (_, n) => String(niveau * parseInt(n)))
    .replace(/\[NIV\]/gi, String(niveau))
    .replace(/\[ATT\s+contact\]/gi,  String(att?.contact  ?? 0))
    .replace(/\[ATT\s+distance\]/gi, String(att?.distance ?? 0))
    .replace(/\[ATT\s+magique\]/gi,  String(att?.magique  ?? 0))
    .replace(/[x×]/gi, '*')
  try {
    // eslint-disable-next-line no-new-func
    const result = Function(`'use strict'; return (${expr})`)()
    return String(Math.floor(result))
  } catch {
    return String(niveau)
  }
}

export function resolveCompagnon(
  entry: CompanionEntry,
  niveau: number,
  rang = 1,
  att?: AttContext,
): CompanionEntry & { pvDisplay: string; pvValue: string; initDisplay: string; initValue: string; atk1Display?: string; atk1dmDisplay?: string; atk2Display?: string; atk2dmDisplay?: string } {
  return {
    ...entry,
    pvDisplay:    resolveNiv(entry.pv,   niveau, rang, att),
    pvValue:      computeNiv(entry.pv,   niveau, rang, att),
    initDisplay:  resolveNiv(entry.init, niveau, rang, att),
    initValue:    computeNiv(entry.init, niveau, rang, att),
    atk1Display:  entry.attaque1 ? resolveModTokens(resolveNiv(entry.attaque1.bonus, niveau, rang, att), entry) : undefined,
    atk1dmDisplay:entry.attaque1 ? resolveDM(entry.attaque1.dm, entry, niveau, rang, att) : undefined,
    atk2Display:  entry.attaque2 ? resolveModTokens(resolveNiv(entry.attaque2.bonus, niveau, rang, att), entry) : undefined,
    atk2dmDisplay:entry.attaque2 ? resolveDM(entry.attaque2.dm, entry, niveau, rang, att) : undefined,
  }
}
