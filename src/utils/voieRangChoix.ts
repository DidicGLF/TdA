import type { Character } from '../types/character'
import type { DescMap, Grant, RangEntry } from '../types/gameData'
import { makeGrantKey } from './effectsChoix'

const VOIE_KEYS = ['voiePeuple', 'voieCulturelle', 'voie1', 'voie2', 'voie3', 'voiePrestige', 'voieSangMele'] as const

export { makeGrantKey }

type VoieRangChoixGrant = Extract<Grant, { type: 'VOIE_RANG_CHOIX' }>

// Petit symbole visuel pour repérer d'un coup d'œil l'élément d'une voie élémentaliste dans les pickers
// de VOIE_RANG_CHOIX (ex : "Desctruction feu") — détecté par mot-clé dans le nom, insensible à la casse,
// pour fonctionner aussi bien avec Destruction/Maîtrise/Création qu'avec leurs variantes à venir.
export function symboleElement(voieNom: string): string | null {
  const n = voieNom.toLowerCase()
  if (n.includes('feu')) return '🔥'
  if (n.includes('eau')) return '💧'
  if (n.includes('nature')) return '🍃'
  if (n.includes('foudre')) return '⚡'
  return null
}

// Vrai si le perso possède déjà la capacité (voie, rang) via un AUTRE choix VOIE_RANG_CHOIX déjà fait
// — sert à griser cette option dans un picker plutôt que de permettre de "réapprendre" deux fois la
// même capacité (ex : le rang 4 de la voie de la Forge ne doit pas re-proposer sans le griser un choix
// déjà pris au rang 2, même si la voie mère offre bien deux fois le même vivier de capacités).
export function estCapaciteDejaChoisie(character: Character, voie: string, rang: number): boolean {
  return Object.values(character.voieRangChoix ?? {}).some(c => c.voie === voie && c.rang === rang)
}

// Vrai si la capacité (voieCible, rangCible) bénéficie de la capacité avancée — payée (case avancée
// cochée sur le rang qui héberge le choix menant à elle) OU offerte gratuitement via un grant
// VOIE_RANG_CHOIX marqué avanceeGratuite (ex : Perfection élémentaliste, qui accorde l'avancée sans
// coût en points). Centralise cette logique pour que resolveDisplayRang, getRangsEmpruntes et les
// pickers restent cohérents entre eux plutôt que de relire rangsAvances directement chacun de leur côté.
export function estAvanceeAccordeePourCible(
  character: Character,
  descriptions: DescMap,
  voieCible: string,
  rangCible: number,
): boolean {
  for (const key of VOIE_KEYS) {
    const voie = character[key]
    if (!voie.nom) continue
    const rangsData = descriptions[voie.nom]
    if (!rangsData) continue

    for (let i = 0; i < voie.rangs.length; i++) {
      if (!voie.rangs[i]) continue
      const rangData = rangsData[i]
      if (!rangData?.grants) continue

      for (let gi = 0; gi < rangData.grants.length; gi++) {
        const grant = rangData.grants[gi]
        if (grant.type !== 'VOIE_RANG_CHOIX') continue
        if (grant.minRang !== undefined && !voie.rangs[grant.minRang - 1]) continue
        const choix = character.voieRangChoix?.[makeGrantKey(voie.nom, i, gi)]
        if (!choix || choix.voie !== voieCible || choix.rang !== rangCible) continue
        if (choix.avanceeSeulement || voie.rangsAvances?.[i] === true) return true
      }
    }
  }
  return false
}

// Nombre total d'emplacements de formation martiale supplémentaires accordés par les rangs réellement
// possédés du personnage (grants FORMATION, minRang respecté comme pour VOIE_RANG/VOIE_RANG_CHOIX) —
// toujours des emplacements à choix libre, jamais des formations imposées (voir le type Grant). À
// ajouter au nombre de base lié à la famille partout où ce plafond est utilisé (wizard Step5/Step8).
export function getBonusFormationsCount(character: Character, descriptions: DescMap): number {
  let total = 0
  for (const key of VOIE_KEYS) {
    const voie = character[key]
    if (!voie.nom) continue
    const rangsData = descriptions[voie.nom]
    if (!rangsData) continue
    for (let i = 0; i < voie.rangs.length; i++) {
      if (!voie.rangs[i]) continue
      const rangData = rangsData[i]
      if (!rangData?.grants) continue
      for (const grant of rangData.grants) {
        if (grant.type !== 'FORMATION') continue
        if (grant.minRang !== undefined && !voie.rangs[grant.minRang - 1]) continue
        total += grant.nombre ?? 1
      }
    }
  }
  return total
}

// Un rang "emprunté" : obtenu automatiquement (VOIE_RANG) ou choisi (VOIE_RANG_CHOIX) via un grant
// porté par un rang réellement possédé, plutôt que par une des 7 voies du personnage. Volontairement
// non récursif : les grants VOIE_RANG/VOIE_RANG_CHOIX du rang emprunté lui-même ne sont pas résolus
// à leur tour, pour éviter tout risque de boucle et parce qu'aucune donnée existante n'en a besoin.
export type RangEmprunte = {
  voieNom: string
  rangIdx: number
  rangData: RangEntry
  grantKey: string
  origine: 'VOIE_RANG' | 'VOIE_RANG_CHOIX'
  // "Capacité avancée" empruntée n'a pas de case à cocher qui lui soit propre (le perso ne possède
  // jamais la voie empruntée en tant que telle) — elle se raccroche à la case avancée du RANG QUI
  // PORTE LE GRANT (ex : rang 1 de "Voie de la destruction élémentaire" pour un sort emprunté via lui).
  avanceeAccordee: boolean
}

export function getRangsEmpruntes(character: Character, descriptions: DescMap): RangEmprunte[] {
  const result: RangEmprunte[] = []

  for (const key of VOIE_KEYS) {
    const voie = character[key]
    if (!voie.nom) continue
    const rangsData = descriptions[voie.nom]
    if (!rangsData) continue

    for (let i = 0; i < voie.rangs.length; i++) {
      if (!voie.rangs[i]) continue
      const rangData = rangsData[i]
      if (!rangData?.grants) continue
      const avanceeAccordee = voie.rangsAvances?.[i] === true

      rangData.grants.forEach((grant, gi) => {
        // minRang se compare au rang RÉELLEMENT ATTEINT par le perso dans cette voie (voie.rangs),
        // pas à l'index i du rang qui héberge le grant — un même rang (ex: Forgeron runique, rang 2 de
        // la Forge) peut porter deux grants VOIE_RANG_CHOIX, l'un immédiat et l'autre gagné seulement
        // au rang 4, comme dans "il gagne une capacité supplémentaire... au rang 4 de cette voie".
        if (grant.minRang !== undefined && !voie.rangs[grant.minRang - 1]) return
        const grantKey = makeGrantKey(voie.nom, i, gi)

        if (grant.type === 'VOIE_RANG') {
          const cible = descriptions[grant.voie]?.[grant.rang - 1]
          if (cible) result.push({ voieNom: grant.voie, rangIdx: grant.rang - 1, rangData: cible, grantKey, origine: 'VOIE_RANG', avanceeAccordee })
        } else if (grant.type === 'VOIE_RANG_CHOIX') {
          const choix = character.voieRangChoix?.[grantKey]
          // avanceeSeulement : ce grant n'a pas servi à emprunter une nouvelle capacité, seulement à
          // accorder l'avancée à une capacité déjà empruntée via un AUTRE grant — rien à ajouter ici.
          if (!choix || choix.avanceeSeulement) return
          const cible = descriptions[choix.voie]?.[choix.rang - 1]
          if (cible) result.push({
            voieNom: choix.voie, rangIdx: choix.rang - 1, rangData: cible, grantKey, origine: 'VOIE_RANG_CHOIX',
            avanceeAccordee: avanceeAccordee || estAvanceeAccordeePourCible(character, descriptions, choix.voie, choix.rang),
          })
        }
      })
    }
  }

  return result
}

// Nom/description à AFFICHER pour un rang donné, une fois le choix VOIE_RANG_CHOIX pris en compte —
// à utiliser partout où la fiche montre le nom/la description d'un rang (ex : CharacterSheetRecto),
// pour que le rang affiche la capacité réellement choisie plutôt que le texte générique "choisis..."
// une fois le choix fait. Si le rang porte plusieurs grants VOIE_RANG_CHOIX déjà résolus (ex : voie
// culturelle de la Forge, rang 2 ET rang 4), les capacités choisies sont juxtaposées. Tant qu'aucun
// choix n'est fait, ou si le rang n'est plus acquis (décoché), retombe sur le texte générique du rang
// — un choix reste stocké dans voieRangChoix même après décochage (pour réapparaître si recoché sans
// avoir à rechoisir), mais ne doit s'afficher que tant que le rang est effectivement possédé.
// rangAChoisir : vrai quand le rang n'a délibérément aucun nom de base (cas des voies élémentalistes,
// dont les rangs à choix sont laissés vides exprès) ET qu'aucun choix n'est encore résolu — permet à
// l'appelant d'afficher un texte du genre "Choisir une capacité" plutôt qu'un champ vide.
export function resolveDisplayRang(
  character: Character,
  descriptions: DescMap,
  voieNom: string,
  rangIdx: number,
  acquis: boolean,
): { nom: string; desc: string; rangAChoisir: boolean; avanceeAccordee?: boolean; items?: { nom: string; desc: string; avanceeAccordee: boolean }[] } | null {
  const rangData = descriptions[voieNom]?.[rangIdx]
  if (!rangData) return null
  const aUnChoixVoieRang = (rangData.grants ?? []).some(g => g.type === 'VOIE_RANG_CHOIX')
  const rangAChoisirSiVide = !rangData.nom && aUnChoixVoieRang
  if (!acquis) return { nom: rangData.nom, desc: rangData.desc, rangAChoisir: rangAChoisirSiVide }

  const choixResolus: { nom: string; desc: string; avanceeAccordee: boolean }[] = []
  ;(rangData.grants ?? []).forEach((grant, gi) => {
    if (grant.type !== 'VOIE_RANG_CHOIX') return
    const choix = character.voieRangChoix?.[makeGrantKey(voieNom, rangIdx, gi)]
    // avanceeSeulement : ne s'affiche pas comme une capacité en plus, juste comme l'avancée d'une
    // capacité déjà listée par ailleurs (cf. le "+" ci-dessous, qui ne concerne que les capacités).
    if (!choix || choix.avanceeSeulement) return
    const cible = descriptions[choix.voie]?.[choix.rang - 1]
    if (cible) choixResolus.push({ nom: cible.nom, desc: cible.desc, avanceeAccordee: estAvanceeAccordeePourCible(character, descriptions, choix.voie, choix.rang) })
  })

  if (choixResolus.length === 0) return { nom: rangData.nom, desc: rangData.desc, rangAChoisir: rangAChoisirSiVide }
  return {
    rangAChoisir: false,
    nom: choixResolus.map(c => c.nom).join(' + '),
    desc: choixResolus.map(c => c.desc).join('\n\n'),
    avanceeAccordee: choixResolus.some(c => c.avanceeAccordee),
    // items : détail par capacité choisie, avec son propre statut avancée — nécessaire dès que plusieurs
    // capacités sont juxtaposées (ex : Perfection élémentaliste) pour ne pas afficher un unique badge
    // "capacité avancée" global qui ne dirait pas LAQUELLE des capacités affichées est réellement avancée.
    items: choixResolus,
  }
}

// Liste les options qu'un grant VOIE_RANG_CHOIX propose au joueur : les rangs [rangMin..rangMax]
// (rangMin par défaut 1, pour ne pas changer le comportement des grants déjà existants type Forge) de
// chacune des voies listées, avec leur nom/description résolus depuis descriptions.json. rangMin permet
// de proposer un rang précis (rangMin === rangMax) plutôt qu'une plage à partir de 1 — utile quand le
// même vivier de voies est utilisé à plusieurs rangs différents d'une voie hôte (ex : un choix par
// élément à chaque rang de la magie élémentaliste, qui ne doit jamais réoffrir un rang déjà dépassé).
export function getChoixOptions(
  grant: VoieRangChoixGrant,
  descriptions: DescMap,
): { voie: string; rang: number; nom: string; desc: string }[] {
  const options: { voie: string; rang: number; nom: string; desc: string }[] = []
  const rangMin = grant.rangMin ?? 1
  for (const voieNom of grant.voies) {
    const rangs = descriptions[voieNom]
    if (!rangs) continue
    for (let r = rangMin; r <= grant.rangMax; r++) {
      const entry = rangs[r - 1]
      if (entry) options.push({ voie: voieNom, rang: r, nom: entry.nom, desc: entry.desc })
    }
  }
  return options
}

// Retire du voieRangChoix du personnage tout choix associé aux rangs [fromRangIdx..4] de la voie
// nommée voieNom — à appeler quand un rang est décoché : décocher un rang décoche aussi en cascade
// tous les rangs suivants (progression séquentielle oblige), donc leurs choix éventuels n'ont plus de
// raison d'être conservés. Retourne la même référence que character.voieRangChoix si rien à retirer,
// pour ne pas déclencher de patch inutile.
export function clearVoieRangChoixFromRang(
  character: Character,
  descriptions: DescMap,
  voieNom: string,
  fromRangIdx: number,
): Record<string, { voie: string; rang: number }> | undefined {
  const current = character.voieRangChoix
  if (!current) return current
  const rangsData = descriptions[voieNom]
  if (!rangsData) return current

  const grantKeysARetirer = new Set<string>()
  for (let i = fromRangIdx; i < rangsData.length; i++) {
    (rangsData[i]?.grants ?? []).forEach((grant, gi) => {
      if (grant.type === 'VOIE_RANG_CHOIX') grantKeysARetirer.add(makeGrantKey(voieNom, i, gi))
    })
  }
  if (grantKeysARetirer.size === 0) return current
  if (!Object.keys(current).some(k => grantKeysARetirer.has(k))) return current

  const next = { ...current }
  for (const k of grantKeysARetirer) delete next[k]
  return next
}

// Énumère les grants VOIE_RANG_CHOIX actifs du personnage (rang possédé, minRang satisfait), avec le
// choix déjà fait le cas échéant — même forme que getEffectChoixGrants pour rester cohérent avec le
// picker déjà utilisé pour EFFECT_CHOIX dans LevelUpModal/CreationWizard.
export function getVoieRangChoixGrants(
  character: Character,
  descriptions: DescMap,
): { grant: VoieRangChoixGrant; grantKey: string; rangNom: string; choixFait: { voie: string; rang: number; avanceeSeulement?: boolean } | null }[] {
  const result: { grant: VoieRangChoixGrant; grantKey: string; rangNom: string; choixFait: { voie: string; rang: number; avanceeSeulement?: boolean } | null }[] = []

  for (const key of VOIE_KEYS) {
    const voie = character[key]
    if (!voie.nom) continue
    const rangsData = descriptions[voie.nom]
    if (!rangsData) continue

    for (let i = 0; i < voie.rangs.length; i++) {
      if (!voie.rangs[i]) continue
      const rangData = rangsData[i]
      if (!rangData?.grants) continue

      rangData.grants.forEach((grant, gi) => {
        if (grant.type !== 'VOIE_RANG_CHOIX') return
        if (grant.minRang !== undefined && !voie.rangs[grant.minRang - 1]) return

        const grantKey = makeGrantKey(voie.nom, i, gi)
        const choixFait = character.voieRangChoix?.[grantKey] ?? null
        result.push({ grant: grant as VoieRangChoixGrant, grantKey, rangNom: rangData.nom, choixFait })
      })
    }
  }

  return result
}

export function applyVoieRangChoix(
  character: Character,
  grantKey: string,
  voie: string,
  rang: number,
): Record<string, { voie: string; rang: number }> {
  return { ...(character.voieRangChoix ?? {}), [grantKey]: { voie, rang } }
}

// Résout un grant VOIE_RANG_CHOIX (avanceeGratuite) non pas en empruntant une nouvelle capacité, mais
// en accordant gratuitement l'avancée à une capacité (voie, rang) déjà empruntée par ailleurs — cf.
// "Perfection élémentaliste" : le PJ choisit soit un nouvel élément, soit l'avancée d'un élément déjà
// maîtrisé, sans coût en points dans les deux cas.
export function applyVoieRangChoixAvancee(
  character: Character,
  grantKey: string,
  voie: string,
  rang: number,
): Record<string, { voie: string; rang: number; avanceeSeulement?: boolean }> {
  return { ...(character.voieRangChoix ?? {}), [grantKey]: { voie, rang, avanceeSeulement: true } }
}
