import React from 'react'

type SvgP = React.SVGProps<SVGSVGElement>

const S = {
  stroke: 'currentColor' as const,
  strokeWidth: 2.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  fill: 'none' as const,
}

const VB = '-12 -15 24 30'

// ᚲ Kenaz — Lumière : chevron ouvert vers la droite
export const RuneLumiere = (p: SvgP) => (
  <svg viewBox={VB} {...p}>
    <path d="M 6,-13 L -7,0 L 6,13" {...S} />
  </svg>
)

// ᛖ Ehwaz — Air : double arche en M
export const RuneAir = (p: SvgP) => (
  <svg viewBox={VB} {...p}>
    <path d="M -7,13 L -7,-13 L 0,0 L 7,-13 L 7,13" {...S} />
  </svg>
)

// ᛚ Laguz — Eau : tige verticale + branche droite de la pointe vers le bas-droite
export const RuneEau = (p: SvgP) => (
  <svg viewBox={VB} {...p}>
    <line x1="-5" y1="14" x2="-5" y2="-13" {...S} />
    <line x1="-5" y1="-13" x2="4" y2="-4" {...S} />
  </svg>
)

// ᚺ Hagalaz — Obscurité : deux verticales + courte diagonale centrale
export const RuneObscurite = (p: SvgP) => (
  <svg viewBox={VB} {...p}>
    <line x1="-5" y1="-13" x2="-5" y2="13" {...S} />
    <line x1="5" y1="-13" x2="5" y2="13" {...S} />
    <line x1="-5" y1="-5" x2="5" y2="5" {...S} />
  </svg>
)

// ᛃ Jera — Terre : < en haut et > en bas face à face
export const RuneTerre = (p: SvgP) => (
  <svg viewBox={VB} {...p}>
    <path d="M 0,-12 L -7,-4 L 0,4" {...S} />
    <path d="M 0,-4 L 7,4 L 0,12" {...S} />
  </svg>
)

// ᛒ Berkanan — Bois : tige + deux bosses angulaires à droite (B)
export const RuneBois = (p: SvgP) => (
  <svg viewBox={VB} {...p}>
    <line x1="-6" y1="-13" x2="-6" y2="13" {...S} />
    <path d="M -6,-13 L 5,-6.5 L -6,0" {...S} />
    <path d="M -6,0 L 5,6.5 L -6,13" {...S} />
  </svg>
)

// ᛊ Sowilo — Feu : éclair en zigzag
export const RuneFeu = (p: SvgP) => (
  <svg viewBox={VB} {...p}>
    <path d="M 6,-13 L -6,-4 L 6,4 L -6,13" {...S} />
  </svg>
)

// ᛁ Isa — Glace : trait vertical unique
export const RuneGlace = (p: SvgP) => (
  <svg viewBox={VB} {...p}>
    <line x1="0" y1="-14" x2="0" y2="14" {...S} />
  </svg>
)

// ᛞ Dagaz — Foudre : deux triangles pointe à pointe au centre
export const RuneFoudre = (p: SvgP) => (
  <svg viewBox={VB} {...p}>
    <path d="M -7,-13 L 0,0 L -7,13 Z" {...S} />
    <path d="M 7,-13 L 0,0 L 7,13 Z" {...S} />
  </svg>
)

// ᚱ Raidho — Manipulation : R angulaire (tige + bosse + jambe)
export const RuneDeplacement = (p: SvgP) => (
  <svg viewBox={VB} {...p}>
    <line x1="-6" y1="-13" x2="-6" y2="13" {...S} />
    <path d="M -6,-13 L 6,-4 L 0,3 L 6,13" {...S} />
  </svg>
)

// ᛉ Algiz — Résistance : tige complète + deux branches du milieu vers le haut
export const RuneResistance = (p: SvgP) => (
  <svg viewBox={VB} {...p}>
    <line x1="0" y1="14" x2="0" y2="-13" {...S} />
    <line x1="0" y1="-2" x2="-8" y2="-13" {...S} />
    <line x1="0" y1="-2" x2="8" y2="-13" {...S} />
  </svg>
)

// ᛗ Mannaz — Détection : deux verticales + croix dans la moitié haute
export const RuneDetection = (p: SvgP) => (
  <svg viewBox={VB} {...p}>
    <line x1="-7" y1="-13" x2="-7" y2="13" {...S} />
    <line x1="7" y1="-13" x2="7" y2="13" {...S} />
    <line x1="-7" y1="-11" x2="7" y2="-1" {...S} />
    <line x1="7" y1="-11" x2="-7" y2="-1" {...S} />
  </svg>
)

// ᚢ Uruz — Portée : arche inversée (U angulaire)
export const RunePortee = (p: SvgP) => (
  <svg viewBox={VB} {...p}>
    <path d="M -6,13 L -6,-13 L 6,-7 L 6,13" {...S} />
  </svg>
)

// ᚷ Gebo — Etendue : X étiré en hauteur
export const RuneEtendue = (p: SvgP) => (
  <svg viewBox={VB} {...p}>
    <line x1="-6" y1="-14" x2="6" y2="14" {...S} />
    <line x1="6" y1="-14" x2="-6" y2="14" {...S} />
  </svg>
)

// ᚠ Fehu — Création : tige + deux branches montantes à droite
export const RuneCreation = (p: SvgP) => (
  <svg viewBox={VB} {...p}>
    <line x1="-4" y1="-13" x2="-4" y2="13" {...S} />
    <line x1="-4" y1="-3" x2="1" y2="-13" {...S} />
    <line x1="-4" y1="6" x2="5" y2="-13" {...S} />
  </svg>
)

// ᛇ Eihwaz — Entropie : comme Eau + diagonal symétrique en bas à gauche
export const RuneEntropie = (p: SvgP) => (
  <svg viewBox={VB} {...p}>
    <line x1="0" y1="13" x2="0" y2="-13" {...S} />
    <line x1="0" y1="-13" x2="6" y2="-7" {...S} />
    <line x1="0" y1="13" x2="-6" y2="7" {...S} />
  </svg>
)

// ᛟ Othalan — Persistance : > et < qui se croisent
export const RunePersistance = (p: SvgP) => (
  <svg viewBox={VB} {...p}>
    <path d="M -8,-13 L 8,0 L -8,13" {...S} />
    <path d="M 8,-13 L -8,0 L 8,13" {...S} />
  </svg>
)

// ᛏ Tiwaz — Annihilation : flèche vers le haut (↑)
export const RuneAnnihilation = (p: SvgP) => (
  <svg viewBox={VB} {...p}>
    <line x1="0" y1="13" x2="0" y2="-13" {...S} />
    <line x1="0" y1="-13" x2="-7" y2="-4" {...S} />
    <line x1="0" y1="-13" x2="7" y2="-4" {...S} />
  </svg>
)

// ᛈ Perthro — Puissance : tige verticale + pointe vers le bas en haut + pointe vers le haut en bas
export const RunePuissance = (p: SvgP) => (
  <svg viewBox={VB} {...p}>
    <line x1="-6" y1="-13" x2="-6" y2="13" {...S} />
    <path d="M -6,-13 L 0,-10 L 6,-13" {...S} />
    <path d="M -6,13 L 0,10 L 6,13" {...S} />
  </svg>
)

// ᚾ Nauthiz — Adversité : tige verticale + barre légèrement penchée (croix avec diagonale)
export const RuneAdversite = (p: SvgP) => (
  <svg viewBox={VB} {...p}>
    <line x1="0" y1="-13" x2="0" y2="13" {...S} />
    <line x1="-5" y1="-4" x2="5" y2="2" {...S} />
  </svg>
)

// ᚨ Ansuz — Catalyseur : comme Eau + second trait oblique parallèle en dessous
export const RuneCatalyseur = (p: SvgP) => (
  <svg viewBox={VB} {...p}>
    <line x1="-5" y1="13" x2="-5" y2="-13" {...S} />
    <line x1="-5" y1="-13" x2="4" y2="-4" {...S} />
    <line x1="-5" y1="-4" x2="4" y2="5" {...S} />
  </svg>
)

// ─── Runes divines ────────────────────────────────────────────────────────────

// Fatalité — losange centré sur tige verticale
export const RuneFatalite = (p: SvgP) => (
  <svg viewBox={VB} {...p}>
    <line x1="0" y1="-14" x2="0" y2="14" {...S} />
    <path d="M0,-9 L6,0 L0,9 L-6,0 Z" {...S} />
  </svg>
)

// Immortalité — 8 vertical (deux boucles) + tige basse
export const RuneImmortalite = (p: SvgP) => (
  <svg viewBox={VB} {...p}>
    <path d="M0,0 C7,0 7,-11 0,-11 C-7,-11 -7,0 0,0 C7,0 7,11 0,11 C-7,11 -7,0 0,0 Z" {...S} />
    <line x1="0" y1="11" x2="0" y2="14" {...S} />
  </svg>
)

// Infinitude — symbole infini (∞) + tige basse
export const RuneInfinitude = (p: SvgP) => (
  <svg viewBox={VB} {...p}>
    <path d="M0,0 C0,-6 9,-6 9,0 C9,6 0,6 0,0 C0,-6 -9,-6 -9,0 C-9,6 0,6 0,0 Z" {...S} />
    <line x1="0" y1="6" x2="0" y2="14" {...S} />
  </svg>
)

// Néant — cercle + diamètre horizontal + tiges verticales
export const RuneNeant = (p: SvgP) => (
  <svg viewBox={VB} {...p}>
    <circle cx="0" cy="0" r="7" {...S} />
    <line x1="-7" y1="0" x2="7" y2="0" {...S} />
    <line x1="0" y1="-7" x2="0" y2="-13" {...S} />
    <line x1="0" y1="7" x2="0" y2="13" {...S} />
  </svg>
)

// Omniscience — losange allongé sur tige
export const RuneOmniscience = (p: SvgP) => (
  <svg viewBox={VB} {...p}>
    <line x1="0" y1="-14" x2="0" y2="14" {...S} />
    <path d="M0,-11 L5,0 L0,11 L-5,0 Z" {...S} />
  </svg>
)

// ─── Correspondances Futhark ──────────────────────────────────────────────────

export const FUTHARK: Record<string, string> = {
  Lumière:     'ᚲ', // Kenaz
  Air:         'ᛖ', // Ehwaz
  Eau:         'ᛚ', // Laguz
  Obscurité:   'ᚺ', // Hagalaz
  Terre:       'ᛃ', // Jera
  Bois:        'ᛒ', // Berkanan
  Feu:         'ᛊ', // Sowilo
  Glace:       'ᛁ', // Isa
  Foudre:      'ᛞ', // Dagaz
  Manipulation:'ᚱ', // Raidho
  Résistance:  'ᛉ', // Algiz
  Détection:   'ᛗ', // Mannaz
  Portée:      'ᚢ', // Uruz
  Etendue:     'ᚷ', // Gebo
  Création:    'ᚠ', // Fehu
  Entropie:    'ᛇ', // Eihwaz
  Persistance: 'ᛟ', // Othalan
  Annihilation:'ᛏ', // Tiwaz
  Puissance:   'ᛈ', // Perthro
  Adversité:   'ᚾ', // Nauthiz
  Catalyseur:  'ᚨ', // Ansuz
}

// ─── Index ────────────────────────────────────────────────────────────────────

export const RUNES_DIVINES: Record<string, React.FC<SvgP>> = {
  Fatalité:    RuneFatalite,
  Immortalité: RuneImmortalite,
  Infinitude:  RuneInfinitude,
  Néant:       RuneNeant,
  Omniscience: RuneOmniscience,
}

export const RUNES: Record<string, React.FC<SvgP>> = {
  Adversité:   RuneAdversite,
  Air:         RuneAir,
  Annihilation: RuneAnnihilation,
  Bois:        RuneBois,
  Catalyseur:  RuneCatalyseur,
  Création:    RuneCreation,
  Manipulation: RuneDeplacement,
  Détection:   RuneDetection,
  Eau:         RuneEau,
  Entropie:    RuneEntropie,
  Etendue:     RuneEtendue,
  Feu:         RuneFeu,
  Foudre:      RuneFoudre,
  Glace:       RuneGlace,
  Lumière:     RuneLumiere,
  Obscurité:   RuneObscurite,
  Persistance: RunePersistance,
  Portée:      RunePortee,
  Puissance:   RunePuissance,
  Résistance:  RuneResistance,
  Terre:       RuneTerre,
}

interface RuneProps extends SvgP { nom: string }

export default function Rune({ nom, ...props }: RuneProps) {
  const C = RUNES[nom] ?? RUNES_DIVINES[nom]
  return C ? <C {...props} /> : null
}
