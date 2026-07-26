// Empreinte structurelle d'une valeur, insensible à l'ordre des clés d'un objet — comparer deux
// objets avec JSON.stringify tel quel déclarerait « différents » deux valeurs identiques dont les clés
// auraient été réécrites dans un autre ordre. Partagée entre tous les modules livré/perso (bestiaire,
// voies…) qui doivent détecter si une fiche a réellement été modifiée par rapport au livré.
export function empreinte(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(empreinte).join(',')}]`
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return `{${Object.keys(o).sort().map(k => `${JSON.stringify(k)}:${empreinte(o[k])}`).join(',')}}`
  }
  return JSON.stringify(v) ?? 'null'
}
