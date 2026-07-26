// Types de dégâts partagés entre le Mode de jeu (GameModePanel, dégâts subis par un personnage seul)
// et le combat de groupe (CombatCard/PJCard) — même liste, mêmes icônes, pour rester reconnaissable
// d'un endroit à l'autre. Les libellés traduits réutilisent les clés existantes gameMode.dmType<TYPE>.
export const DAMAGE_TYPES = [
  'FEU', 'FROID', 'FOUDRE', 'ACIDE', 'POISON', 'NECROTIQUE',
  'TENEBRES', 'LUMIERE', 'MENTAL', 'TRANCHANT', 'PERFORANT', 'CONTONDANT',
] as const

export const ICONES_TYPES_DEGATS: Record<string, string> = {
  '': '🩸', FEU: '🔥', FROID: '❄️', FOUDRE: '⚡', ACIDE: '🧪', POISON: '☠️', NECROTIQUE: '🪦',
  TENEBRES: '🌑', LUMIERE: '☀️', MENTAL: '🧠', TRANCHANT: '🗡️', PERFORANT: '🏹', CONTONDANT: '🔨',
}
