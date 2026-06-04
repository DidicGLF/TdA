import { useRef, useLayoutEffect } from 'react'

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
  title?: string
  readOnly?: boolean
}

const BASE_FONT = 1.15  // vw
const MIN_FONT  = 0.45  // vw

export default function SheetField({
  top, left, width, height = 2.2,
  value, onChange, type = 'text', align = 'left', active = false, calibrate = false, title, readOnly = false,
}: SheetFieldProps) {
  const ref = useRef<HTMLInputElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.fontSize = `${BASE_FONT}vw`
    if (el.clientWidth === 0) return
    let size = BASE_FONT
    while (el.scrollWidth > el.clientWidth + 1 && size > MIN_FONT) {
      size = +(size - 0.05).toFixed(2)
      el.style.fontSize = `${size}vw`
    }
  }, [value])

  return (
    <input
      ref={ref}
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      readOnly={readOnly}
      title={title}
      className="tdr-field"
      style={{
        position: 'absolute',
        top: `${top}%`,
        left: `${left}%`,
        width: `${width}%`,
        height: `${height}%`,
        transform: 'translate(-50%, -50%)',
        textAlign: align,
        fontSize: `${BASE_FONT}vw`,
        fontFamily: "'Crimson Text', Georgia, serif",
        background: active ? 'rgba(201,168,76,0.18)' : 'transparent',
        border: active
          ? '1.5px solid rgba(201,168,76,0.7)'
          : calibrate
            ? '1px dashed rgba(201,168,76,0.5)'
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
