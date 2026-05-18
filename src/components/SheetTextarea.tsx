interface Props {
  top: number
  left: number
  width: number
  height: number
  value: string
  onChange: (val: string) => void
  calibrate?: boolean
}

export default function SheetTextarea({ top, left, width, height, value, onChange, calibrate = false }: Props) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        position: 'absolute',
        top: `${top}%`,
        left: `${left}%`,
        width: `${width}%`,
        height: `${height}%`,
        transform: 'translate(-50%, -50%)',
        fontSize: '1.15vw',
        fontFamily: "'Crimson Text', Georgia, serif",
        background: 'transparent',
        border: calibrate ? '1px dashed rgba(201,168,76,0.5)' : '1px solid transparent',
        borderRadius: '2px',
        color: '#1a1510',
        padding: '2px 3px',
        outline: 'none',
        resize: 'none',
        lineHeight: 1.4,
        overflow: 'hidden',
      }}
      onFocus={e => {
        e.target.style.background = 'rgba(201,168,76,0.1)'
        e.target.style.border = '1px solid rgba(201,168,76,0.6)'
        e.target.style.overflow = 'auto'
      }}
      onBlur={e => {
        e.target.style.background = 'transparent'
        e.target.style.border = calibrate ? '1px dashed rgba(201,168,76,0.5)' : '1px solid transparent'
        e.target.style.overflow = 'hidden'
      }}
    />
  )
}
