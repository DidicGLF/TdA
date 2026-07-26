import type { Character, CompagnonOverride } from '../types/character'
import type { DescMap, CompanionEntry, BestiaireEntry, CreatureAttaque } from '../types/gameData'

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

// Rang atteint dans la voie qui a octroyé ce compagnon — c'est lui qui détermine ses caractéristiques
// évolutives (PV, initiative, dégâts). Extrait ici pour être partagé par le bloc du verso et les
// fiches de compagnon dédiées, qui en avaient chacun besoin.
export function getRangCompagnon(
  character: Character,
  descriptions: DescMap,
  nomCompagnon: string,
): number {
  for (const key of VOIE_KEYS) {
    const voie = character[key]
    if (!voie?.nom) continue
    const rangsData = descriptions[voie.nom]
    if (!rangsData) continue
    const octroye = rangsData.some(r => r?.grants?.some(g =>
      (g.type === 'COMPAGNON' && g.nom === nomCompagnon) ||
      (g.type === 'COMPAGNON_CHOIX' && g.noms?.includes(nomCompagnon))
    ))
    if (octroye) return voie.rangs.filter(Boolean).length
  }
  return 1
}

// Saisies du joueur pour ce compagnon (fiche dédiée) — compagnonsFiches (par nom) prioritaire,
// compagnonsOverrides (par position, legacy) en repli seulement si ce compagnon occupe encore l'un
// des 2 emplacements actifs. Même règle que CompagnonsFields/FicheCompagnon.
function getOverrideCompagnon(character: Character, nom: string): CompagnonOverride {
  const parFiche = character.compagnonsFiches?.[nom]
  if (parFiche) return parFiche
  const slot = character.compagnonsActifs?.indexOf(nom) ?? -1
  return (slot >= 0 ? character.compagnonsOverrides?.[slot] : undefined) ?? {}
}

// Substitution pure (sans évaluer l'expression) des tokens [NIV]/[RANG]/[ATT ...] et des modificateurs
// de caractéristique [FOR]/[DEX]/... par leur valeur numérique — contrairement à resolveNiv/computeNiv,
// ne touche pas à une éventuelle notation de dés (ex. "1d6+[NIV]" → "1d6+5"), pour rester exploitable
// telle quelle par resoudreAttaque (combat.ts), qui sait lire "NdS+M" mais pas évaluer une expression.
function substituerTokens(s: string, entry: CompanionEntry, niveau: number, rang: number, att: AttContext): string {
  let expr = s
    .replace(/\[RANG\s*[x×*]\s*(\d+)\]/gi, (_, n) => String(rang * parseInt(n)))
    .replace(/\[RANG\]/gi, String(rang))
    .replace(/\[NIV\s*[x×*]\s*(\d+)\]/gi, (_, n) => String(niveau * parseInt(n)))
    .replace(/\[NIV\]/gi, String(niveau))
    .replace(/\[ATT\s+contact\]/gi, String(att.contact ?? 0))
    .replace(/\[ATT\s+distance\]/gi, String(att.distance ?? 0))
    .replace(/\[ATT\s+magique\]/gi, String(att.magique ?? 0))
  for (const key of MOD_KEYS) {
    expr = expr.replace(new RegExp(`\\[${key.toUpperCase()}\\]`, 'gi'), String(entry[key]))
  }
  return expr
}

// Bonus d'attaque : jamais de dés, donc évaluable sans risque une fois les tokens substitués (voir
// substituerTokens) — contrairement à un montant de dégâts, qui doit garder sa notation "NdS".
function evaluerBonusAttaque(s: string, entry: CompanionEntry, niveau: number, rang: number, att: AttContext): string {
  const expr = substituerTokens(s, entry, niveau, rang, att)
  try {
    const n = Math.floor(Function(`'use strict'; return (${expr})`)())
    return n >= 0 ? `+${n}` : String(n)
  } catch {
    return expr
  }
}

// Convertit le compagnon nommé (débloqué par ce PJ) en fiche de créature exploitable par CombatCard —
// mêmes contrôles qu'une créature du bestiaire (PV, cible, attaques cliquables), voir CombatTab. Les
// overrides du joueur (fiche dédiée) priment sur les valeurs calculées, exactement comme sur sa fiche.
// Retourne null si le nom ne correspond à aucune entrée du catalogue (compagnon supprimé depuis).
export function compagnonEnCreature(
  nomCompagnon: string,
  catalogue: CompanionEntry[],
  character: Character,
  descriptions: DescMap,
): BestiaireEntry | null {
  const entry = catalogue.find(c => c.nom === nomCompagnon)
  if (!entry) return null
  const ov = getOverrideCompagnon(character, nomCompagnon)
  const rang = getRangCompagnon(character, descriptions, nomCompagnon)
  const att: AttContext = { contact: character.attaqueContact, distance: character.attaqueDistance, magique: character.attaqueMagique }
  const niveau = character.niveau
  const fmtMod = (n: number) => n >= 0 ? `+${n}` : String(n)

  const attaques: CreatureAttaque[] = []
  if (entry.attaque1) {
    attaques.push({
      nom: ov.atk1nom ?? entry.attaque1.nom,
      bonus: ov.atk1bonus ?? evaluerBonusAttaque(entry.attaque1.bonus, entry, niveau, rang, att),
      dm: ov.atk1dm ?? substituerTokens(entry.attaque1.dm, entry, niveau, rang, att),
    })
  }
  if (entry.attaque2) {
    attaques.push({
      nom: entry.attaque2.nom,
      bonus: evaluerBonusAttaque(entry.attaque2.bonus, entry, niveau, rang, att),
      dm: substituerTokens(entry.attaque2.dm, entry, niveau, rang, att),
    })
  }

  return {
    nom: ov.nom ?? entry.nom,
    nc: 0,
    livres: [],
    // Image de la fiche dédiée (saisie du joueur, data URL — voir DraggableImageField) : sans elle,
    // CombatCard retombe sur l'icône 🐾 générique, comme n'importe quelle créature sans illustration.
    image: ov.image,
    def: Number(ov.def ?? entry.def),
    pv: Number(ov.pv ?? computeNiv(entry.pv, niveau, rang, att)) || 0,
    init: Number(ov.init ?? computeNiv(entry.init, niveau, rang, att)) || 0,
    caracteristiques: {
      FOR: ov.for ?? fmtMod(entry.for), DEX: ov.dex ?? fmtMod(entry.dex), CON: ov.con ?? fmtMod(entry.con),
      INT: ov.int ?? fmtMod(entry.int), SAG: ov.sag ?? fmtMod(entry.sag), CHA: ov.cha ?? fmtMod(entry.cha),
    },
    attaques: attaques.length > 0 ? attaques : undefined,
    capacites: entry.capacites ? [{ nom: entry.nom, desc: entry.capacites }] : undefined,
  }
}
