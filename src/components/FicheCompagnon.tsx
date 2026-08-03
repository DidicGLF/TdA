import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { Character, CompagnonOverride } from '../types/character'
import type { FieldPositions } from '../context/GameDataContext'
import { useGameData } from '../context/GameDataContext'
import { useCompagnonName } from '../hooks/useContentTranslation'
import { resolveCompagnon } from '../utils/compagnons'
import { useChampsFiche } from '../hooks/useChampsFiche'
import DraggableTextarea from './DraggableTextarea'
import DraggableImageField from './DraggableImageField'
import SheetTooltip from './SheetTooltip'
import type { TooltipData } from './SheetTooltip'
import { BASE_FONT } from './SheetField'

interface Props {
  character: Character
  onChange: (patch: Partial<Character>) => void
  // Nom du compagnon débloqué que cette fiche décrit.
  nomCompagnon: string
  // Rang atteint dans la voie qui l'a octroyé (détermine ses caractéristiques évolutives).
  rang: number
  calibrate?: boolean
  locked?: boolean
  fieldPositions?: FieldPositions
  onFieldMoved?: (label: string, top: number, left: number, width?: number, height?: number) => void
  // Une seule fiche alimente la réserve : les champs sont communs à toutes les fiches (un seul
  // calibrage), il ne faut donc pas dupliquer leurs pastilles autant de fois qu'il y a de compagnons.
  reservePortalTarget?: HTMLElement | null
  onReserveToggle?: (label: string, reserved: boolean, pos: { top: number; left: number; width?: number; height?: number }) => void
}

const STATS = ['for', 'dex', 'con', 'int', 'sag', 'cha'] as const

// Une fiche de compagnon (A5 à l'italienne). Son propre conteneur sert de repère aux positions en
// pourcentage : un unique calibrage vaut donc pour toutes les fiches, quel que soit le compagnon
// affiché et sa place dans la page.
export default function FicheCompagnon({
  character, onChange, nomCompagnon, rang,
  calibrate = false, locked = true, fieldPositions, onFieldMoved, reservePortalTarget, onReserveToggle,
}: Props) {
  const { t } = useTranslation()
  const compagnonName = useCompagnonName()
  const { compagnons: catalogue } = useGameData()
  const containerRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<TooltipData | null>(null)

  const { f } = useChampsFiche({
    page: 'compagnons', defaultPage: 'compagnons', calibrate, fieldPositions,
    containerRef, setTooltip, onFieldMoved, reservePortalTarget, onReserveToggle,
  })

  const entry = catalogue.find(c => c.nom === nomCompagnon)
  const att = { contact: character.attaqueContact, distance: character.attaqueDistance, magique: character.attaqueMagique }
  const c = entry ? resolveCompagnon(entry, character.niveau, rang, att) : null

  // Saisies du joueur, indexées par nom (cf. Character.compagnonsFiches) — l'ancien format par
  // position (compagnonsOverrides) est migré une fois pour toutes au chargement (voir App.tsx).
  const ov: CompagnonOverride = character.compagnonsFiches?.[nomCompagnon] ?? {}

  const setOvPatch = (patch: Partial<CompagnonOverride>) => {
    onChange({ compagnonsFiches: { ...(character.compagnonsFiches ?? {}), [nomCompagnon]: { ...ov, ...patch } } })
  }
  const setOv = (champ: keyof CompagnonOverride, valeur: string) => setOvPatch({ [champ]: valeur })

  const fmtMod = (n: number) => n >= 0 ? `+${n}` : `${n}`

  // Champ de texte libre (Spécial, Notes, Capacités) : calibrable et réservable comme les autres.
  // valeurBase : valeur du catalogue affichée par défaut (Capacités spéciales, voir c?.capacites) —
  // absente pour Spécial/Notes, qui n'ont aucune source catalogue, seulement la saisie du joueur.
  const zoneTexte = (id: string, champ: 'special' | 'notes', top: number, left: number, width: number, height: number, valeurBase?: string) => {
    const fp = fieldPositions?.[id]
    const p = { top: fp?.top ?? top, left: fp?.left ?? left, width: fp?.width ?? width, height: fp?.height ?? height }
    return (
      <DraggableTextarea
        key={id} label={id} {...p}
        value={ov[champ] ?? valeurBase ?? ''} onChange={v => setOv(champ, v)}
        autoShrink
        calibrate={calibrate} containerRef={containerRef} onMoved={onFieldMoved ?? (() => {})}
        reserved={fp ? fp.reserved === true : true}
        reservePortalTarget={reservePortalTarget}
        onReserveToggle={r => onReserveToggle?.(id, r, p)}
        imprime={fp?.imprimer ?? true}
        onToggleImpression={() => onReserveToggle?.(id, fp?.reserved === true, { ...p, imprimer: !(fp?.imprimer ?? true) } as never)}
      />
    )
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <img src={`${import.meta.env.BASE_URL}feuille-compagnons.webp`} alt={t('fiche.compagnons')}
        className="sheet-bg" style={{ width: '100%', display: 'block' }} draggable={false} />

      {/* Identité */}
      {/* Nom donné par le joueur à SON compagnon (ov.nom) — remplace le titre "FICHE DE COMPAGNON" de
          l'ancien fond, supprimé de feuille-compagnons.webp au profit de ce champ (nouvelle maquette
          fournie par Didic). Distinct de "Comp nom" ci-dessous, qui reste le TYPE de compagnon (lecture
          seule, catalogue) — ov.nom était déjà lu par compagnonEnCreature (combat.ts) pour afficher ce
          nom personnalisé côté MJ/joueur, mais jusqu'ici sans aucun champ pour le saisir sur la fiche. */}
      {f({ label: 'Comp nom joueur', top: 5, left: 30, width: 55, height: 5,
        value: ov.nom ?? (c ? compagnonName(c.nom) : ''), onChange: v => setOv('nom', v),
        readOnly: locked, reserveByDefault: true, align: 'center',
        // Habillage fourni par Didic (maquette Photoshop) : Times New Roman gras #3a2008, 1re lettre
        // légèrement plus grande que le reste (ratio 28/26,4 de la maquette). Taille absolue : PAS
        // convertie depuis les pixels Photoshop (aucune conversion fiable n'existe entre la résolution
        // du fichier source, 2480px, et les unités vw/zoom-scale de l'appli — calées sur la lisibilité à
        // l'écran au zoom courant, pas sur le fichier source, voir SheetField/BASE_FONT) — calée à la
        // place sur un multiple de BASE_FONT, la référence déjà utilisée par tous les autres champs de
        // fiche, en net plus grand puisque ce champ remplace un gros titre ("FICHE DE COMPAGNON"),
        // contrairement à un champ normal. Premier essai visuel à ajuster avec Didic une fois vu en jeu.
        // Biseau interne + ombre portée Photoshop (lisse 10, angle 125°, élévation 30°, tons clairs
        // blanc 50%/tons foncés noir 50%, ombre portée noire 70% distance 3px) : IMPOSSIBLE à reproduire
        // à l'identique en CSS (Photoshop calcule un éclairage 3D par pixel sur le contour des lettres)
        // — approximé ici par un empilement de text-shadow, décomposé dans la même direction (angle
        // 125°, converti en vecteur d'écran (-0.574,-0.819) vers la lumière) : un reflet clair + une
        // ombre sombre proches (biseau) et une 3e plus éloignée (ombre portée, distance 3px). Accepté
        // explicitement par Didic comme approximation, pas un rendu identique.
        specialStyle: {
          fontFamily: "'Times New Roman', Times, serif",
          fontWeight: 700,
          color: '#3a2008',
          textShadow: '-0.6px -0.8px 0.6px rgba(255,255,255,0.5), 0.6px 0.8px 0.6px rgba(0,0,0,0.5), 1.72px 2.46px 1px rgba(0,0,0,0.7)',
          baseFontSizeVw: BASE_FONT * 2.5,
          firstLetterFontSizeVw: BASE_FONT * 2.5 * (28 / 26.4),
        },
      })}
      {f({ label: 'Comp nom', top: 12, left: 30, width: 34, height: 4, value: c ? compagnonName(c.nom) : '', onChange: () => {}, readOnly: true, reserveByDefault: true })}

      {/* Caractéristiques */}
      {STATS.map((s, i) => f({
        label: `Comp ${s.toUpperCase()}`,
        top: 22 + Math.floor(i / 3) * 0, left: 55 + i * 4, width: 4, height: 4,
        value: ov[s] ?? (c ? fmtMod(c[s]) : ''), onChange: v => setOv(s, v),
        align: 'center', readOnly: locked, reserveByDefault: true,
      }))}
      {f({ label: 'Comp INIT', top: 22, left: 84, width: 4, height: 4, value: ov.init ?? c?.initValue ?? '', onChange: v => setOv('init', v), align: 'center', readOnly: locked, reserveByDefault: true })}
      {f({ label: 'Comp DEF',  top: 28, left: 84, width: 4, height: 4, value: ov.def ?? (c ? String(c.def) : ''), onChange: v => setOv('def', v), align: 'center', readOnly: locked, reserveByDefault: true })}
      {f({ label: 'Comp PV',   top: 34, left: 84, width: 4, height: 4, value: ov.pv ?? c?.pvValue ?? '', onChange: v => setOv('pv', v), align: 'center', readOnly: locked, reserveByDefault: true })}

      {/* Arme */}
      {f({ label: 'Comp arme',    top: 44, left: 60, width: 18, height: 4, value: ov.atk1nom ?? c?.attaque1?.nom ?? '', onChange: v => setOv('atk1nom', v), readOnly: locked, reserveByDefault: true })}
      {f({ label: 'Comp attaque', top: 44, left: 80, width: 8,  height: 4, value: ov.atk1bonus ?? c?.atk1Display ?? '', onChange: v => setOv('atk1bonus', v), align: 'center', readOnly: locked, reserveByDefault: true })}
      {f({ label: 'Comp DM',      top: 44, left: 90, width: 8,  height: 4, value: ov.atk1dm ?? c?.atk1dmDisplay ?? c?.attaque1?.dm ?? '', onChange: v => setOv('atk1dm', v), align: 'center', readOnly: locked, reserveByDefault: true })}

      {/* Zones de texte libre */}
      {/* Comp spécial reçoit désormais le texte "Capacités spéciales" du catalogue (voir
          DescriptionsEditor.tsx → Compagnons) comme valeur par défaut — jamais affiché nulle part sur
          la fiche jusqu'ici, alors que la donnée était bien enregistrée (signalé par Didic : "le texte
          n'est plus là" après édition, alors qu'il manquait juste ce lien pour l'afficher). Toujours
          modifiable par le joueur (ov.special), qui prend alors le pas sur le catalogue. Comp notes
          reste un champ 100% libre, sans lien catalogue. */}
      {zoneTexte('Comp spécial', 'special', 60, 72, 44, 18, c?.capacites)}
      {zoneTexte('Comp notes',   'notes',   85, 72, 44, 12)}

      {/* Image du compagnon — DraggableImageField ne gère pas la réserve, on s'en charge ici. */}
      {(() => {
        const fp = fieldPositions?.['Comp image']
        const p = { top: fp?.top ?? 45, left: fp?.left ?? 24, width: fp?.width ?? 40, height: fp?.height ?? 55 }
        if (fp ? fp.reserved === true : true) {
          return calibrate && reservePortalTarget
            ? createPortal(
                <div onClick={() => onReserveToggle?.('Comp image', false, p)} title="Placer sur la feuille" style={{
                  display: 'inline-flex', alignItems: 'center',
                  background: 'rgba(160,90,230,0.18)', border: '1px solid rgba(160,90,230,0.6)',
                  color: 'rgba(225,205,255,0.95)', fontSize: 12, fontFamily: 'monospace', fontWeight: 700,
                  padding: '4px 9px', borderRadius: 4, userSelect: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                }}>Comp image</div>,
                reservePortalTarget)
            : null
        }
        return (
          <DraggableImageField
            {...p}
            value={ov.image ?? ''}
            onChange={v => setOv('image', v)}
            scale={ov.imageScale} tx={ov.imageTx} ty={ov.imageTy}
            fit={ov.imageFit ?? 'cover'}
            locked={ov.imageLocked ?? false}
            onPanZoomChange={(scale, tx, ty) => setOvPatch({ imageScale: scale, imageTx: tx, imageTy: ty })}
            onFitChange={f => setOvPatch({ imageFit: f })}
            onLockedChange={l => setOvPatch({ imageLocked: l })}
            calibrate={calibrate} label="Comp image"
            containerRef={containerRef} onMoved={onFieldMoved ?? (() => {})}
            imprime={fp?.imprimer ?? true}
            onToggleImpression={() => onReserveToggle?.('Comp image', fp?.reserved === true, { ...p, imprimer: !(fp?.imprimer ?? true) } as never)}
          />
        )
      })()}

      {tooltip && <SheetTooltip tooltip={tooltip} character={character} descriptions={{}} />}
    </div>
  )
}
