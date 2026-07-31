import { useRef, useLayoutEffect, useContext } from 'react'
import { PdfExportContext } from '../hooks/modeImpression'

interface SheetFieldProps {
  top: number
  left: number
  width: number
  height?: number
  value: string | number
  onChange: (val: string) => void
  type?: 'text' | 'number'
  align?: 'left' | 'center' | 'right'
  active?: boolean
  calibrate?: boolean
  // Texte-repère affiché uniquement en calibrage, quand le champ est vide (cf. .tdr-field::placeholder)
  placeholder?: string
  // Donnée de session (PV restants, trésorerie…) : affichée à l'écran mais jamais imprimée, le
  // joueur la tenant au crayon sur la version papier.
  temporaire?: boolean
  title?: string
  readOnly?: boolean
}

const BASE_FONT = 1.15  // vw
const MIN_FONT  = 0.45  // vw

export default function SheetField({
  top, left, width, height = 2.2,
  value, onChange, type = 'text', align = 'left', active = false, calibrate = false, title, readOnly = false, placeholder, temporaire,
}: SheetFieldProps) {
  // html2canvas ne reproduit pas fidèlement le rendu natif d'un <input> (texte constaté décalé/rogné
  // dans le PDF exporté — voir project_impression_pdf_bug) : dans le conteneur d'export, on affiche donc
  // la valeur dans un <div> ordinaire (bien supporté par html2canvas) plutôt qu'un vrai champ de saisie,
  // avec le même calcul d'ajustement de police.
  const pdfExport = useContext(PdfExportContext)
  const ref = useRef<HTMLInputElement>(null)
  const refDiv = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = pdfExport ? refDiv.current : ref.current
    if (!el) return
    // calc(...vw * var(--zoom-scale, 1)) plutôt que Xvw seul : voir la note sur le conteneur zoomable
    // dans App.tsx. Boîte et police sont alors proportionnelles au même facteur (--zoom-scale ∝ zoom%),
    // donc ce calcul (mesuré en pixels réels via clientWidth/scrollWidth) reste valable à tout niveau de
    // zoom sans avoir besoin d'être relancé quand zoom change.
    el.style.fontSize = `calc(${BASE_FONT}vw * var(--zoom-scale, 1))`
    if (el.clientWidth === 0) return
    let size = BASE_FONT
    while (el.scrollWidth > el.clientWidth + 1 && size > MIN_FONT) {
      size = +(size - 0.05).toFixed(2)
      el.style.fontSize = `calc(${size}vw * var(--zoom-scale, 1))`
    }
    // width/height dans les dépendances : sans eux, redimensionner un champ en calibrage ne
    // recalculait pas la police, qui restait ajustée à l'ancienne largeur.
  }, [value, width, height, pdfExport])

  if (pdfExport) {
    return (
      <div
        ref={refDiv}
        title={title}
        className={temporaire ? "tdr-field tdr-temporaire" : "tdr-field"}
        style={{
          position: 'absolute',
          top: `${top}%`,
          left: `${left}%`,
          width: `${width}%`,
          height: `${height}%`,
          transform: 'translate(-50%, -50%)',
          display: 'flex',
          // flex-end (pas center) + un peu de marge sous le texte : un <input> natif centre son texte
          // différemment d'un <div> flex-centré (constaté sur un export réel — voir
          // project_impression_pdf_bug) — le texte apparaissait décalé vers le haut par rapport à la
          // ligne du fond sur laquelle il est censé reposer. Marge basse en em (relative à la taille de
          // police de CE champ) plutôt qu'en % de hauteur de la boîte — un % de padding vertical se
          // calcule en CSS sur la LARGEUR du bloc, pas sa hauteur, ce qui aurait donné un décalage
          // incohérent d'un champ à l'autre.
          alignItems: 'flex-end',
          justifyContent: align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center',
          textAlign: align,
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          fontSize: `calc(${BASE_FONT}vw * var(--zoom-scale, 1))`,
          fontFamily: "'Crimson Text', Georgia, serif",
          color: '#1a1510',
          padding: '0 3px 0.2em',
          boxSizing: 'border-box',
        }}
      >
        {value}
      </div>
    )
  }

  return (
    <input
      ref={ref}
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      readOnly={readOnly}
      title={title}
      className={temporaire ? "tdr-field tdr-temporaire" : "tdr-field"}
      placeholder={placeholder}
      style={{
        position: 'absolute',
        top: `${top}%`,
        left: `${left}%`,
        width: `${width}%`,
        height: `${height}%`,
        transform: 'translate(-50%, -50%)',
        textAlign: align,
        fontSize: `calc(${BASE_FONT}vw * var(--zoom-scale, 1))`,
        fontFamily: "'Crimson Text', Georgia, serif",
        background: active ? 'rgba(201,168,76,0.18)' : 'transparent',
        border: active
          ? '1.5px solid rgba(201,168,76,0.7)'
          : calibrate
            ? '2px dashed rgba(160,90,230,0.95)'
            : '1px solid transparent',
        borderRadius: '2px',
        color: '#1a1510',
        padding: '0 3px',
        outline: 'none',
        transition: 'background 0.2s, border 0.2s',
      }}
      onFocus={e => {
        e.target.style.background = 'rgba(201,168,76,0.25)'
        e.target.style.border = '1.5px solid rgba(201,168,76,0.9)'
      }}
      onBlur={e => {
        e.target.style.background = active ? 'rgba(201,168,76,0.18)' : 'transparent'
        e.target.style.border = active ? '1.5px solid rgba(201,168,76,0.7)' : '1px solid transparent'
      }}
    />
  )
}
