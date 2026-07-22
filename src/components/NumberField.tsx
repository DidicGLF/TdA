import { useEffect, useRef, useState } from 'react'

interface Props {
  value: number | undefined
  onChange: (value: number | undefined) => void
  // Si vrai, vider le champ committe `undefined` au parent (stats optionnelles du bestiaire). Sinon
  // (par défaut), vider le champ ne committe rien tant qu'aucun nombre valide n'est retapé — la valeur
  // précédente reste active côté parent, seul l'affichage local montre le champ vide entre-temps.
  allowUndefined?: boolean
  min?: number
  max?: number
  parseAs?: 'int' | 'float'
  placeholder?: string
  disabled?: boolean
  style?: React.CSSProperties
}

// Champ numérique dont l'affichage (draft, une chaîne locale) est totalement isolé de l'état du parent
// tant que le champ a le focus — un re-rendu externe (pour n'importe quelle raison ailleurs dans l'app,
// pas forcément liée à ce champ) ne peut donc jamais écraser une frappe en cours. C'est le vrai
// correctif au bug « impossible de supprimer un chiffre / le - n'est pas pris » : un <input> classique
// bindé directement sur un nombre d'état, combiné à un onChange qui n'accepte que les valeurs
// valides/complètes, laisse des instants où le DOM affiche quelque chose (vide, "-", en cours de
// frappe) que React n'a pas encore committé — un re-rendu survenant pendant cette fenêtre réaffiche
// alors l'ancienne valeur, qui semble alors ne "jamais changer". Ici, `draft` (state local) reste
// exactement ce que l'utilisateur tape quoi qu'il arrive ailleurs dans l'app ; il n'est resynchronisé
// depuis `value` que hors focus (perte de focus, ou changement externe comme un bouton +/-).
export default function NumberField({
  value, onChange, allowUndefined, min, max, parseAs = 'int', placeholder, disabled, style,
}: Props) {
  const [draft, setDraft] = useState(value === undefined ? '' : String(value))
  const focusedRef = useRef(false)

  useEffect(() => {
    if (!focusedRef.current) setDraft(value === undefined ? '' : String(value))
  }, [value])

  return (
    <input
      type="text"
      inputMode="numeric"
      placeholder={placeholder}
      disabled={disabled}
      value={draft}
      onFocus={e => { focusedRef.current = true; e.target.select() }}
      onBlur={() => {
        focusedRef.current = false
        setDraft(value === undefined ? '' : String(value))
      }}
      onChange={e => {
        const raw = e.target.value
        setDraft(raw)
        if (raw === '') {
          if (allowUndefined) onChange(undefined)
          return
        }
        const n = parseAs === 'float' ? parseFloat(raw) : parseInt(raw, 10)
        if (Number.isNaN(n)) return
        const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n))
        onChange(clamped)
      }}
      style={style}
    />
  )
}
