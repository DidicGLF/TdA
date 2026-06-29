import React from 'react'
import cristauxData from '../data/cristaux.json'

export type Cristal = typeof cristauxData[number]

const GOLD = 'var(--tdr-gold)'

export default function CristalSvg({ cristal, size = 56, actif = false }: { cristal: Cristal; size?: number; actif?: boolean }) {
  const id = `cg-${cristal.nom.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '')}`
  const c1 = cristal.couleur1
  const c2 = cristal.couleur2
  const w = size
  const h = Math.round(size * 1.4)
  const cx = w / 2
  const cy = h / 2
  const opacity = actif ? 1 : 0.55
  const stroke = actif ? GOLD : c2

  const gradientDef = (
    <defs>
      <radialGradient id={`${id}-rg`} cx="35%" cy="30%" r="65%">
        <stop offset="0%"   stopColor={c1} stopOpacity="1" />
        <stop offset="60%"  stopColor={c1} stopOpacity="0.85" />
        <stop offset="100%" stopColor={c2} stopOpacity="1" />
      </radialGradient>
      <linearGradient id={`${id}-lg`} x1="20%" y1="10%" x2="80%" y2="90%">
        <stop offset="0%"   stopColor={c1} stopOpacity="1" />
        <stop offset="100%" stopColor={c2} stopOpacity="1" />
      </linearGradient>
    </defs>
  )

  const fill = `url(#${id}-lg)`
  let shape: React.ReactNode

  if (cristal.forme === 'sphere') {
    shape = (
      <>
        <circle cx={cx} cy={cy} r={Math.min(cx, cy) - 2} fill={`url(#${id}-rg)`} stroke={stroke} strokeWidth={actif ? 1.5 : 1} opacity={opacity} />
        <ellipse cx={cx * 0.7} cy={cy * 0.6} rx={w * 0.12} ry={h * 0.08} fill="white" opacity={0.4} transform={`rotate(-25, ${cx * 0.7}, ${cy * 0.6})`} />
      </>
    )
  } else if (cristal.forme === 'rhombe') {
    const pts = `${cx},${h * 0.05} ${w * 0.95},${cy} ${cx},${h * 0.95} ${w * 0.05},${cy}`
    const Tx = cx,        Ty = h * 0.05
    const Lx = w * 0.05,  Ly = cy
    const dx = Lx - Tx,   dy = Ly - Ty
    const len = Math.sqrt(dx * dx + dy * dy)
    const nx = dy / len,  ny = -dx / len
    const thick = w * 0.085
    const offset = w * 0.04
    const t1 = 0.15,      t2 = 0.70
    const P1x = Tx + t1 * dx + offset * nx, P1y = Ty + t1 * dy + offset * ny
    const P2x = Tx + t2 * dx + offset * nx, P2y = Ty + t2 * dy + offset * ny
    const P3x = P2x + thick * nx, P3y = P2y + thick * ny
    const P4x = P1x + thick * nx, P4y = P1y + thick * ny
    shape = (
      <>
        <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={actif ? 1.5 : 1} opacity={opacity} />
        <polygon points={`${P1x},${P1y} ${P2x},${P2y} ${P3x},${P3y} ${P4x},${P4y}`} fill="white" opacity={0.28} />
      </>
    )
  } else if (cristal.forme === 'prisme') {
    const pts = `${cx},${h * 0.05} ${w * 0.95},${h * 0.92} ${w * 0.05},${h * 0.92}`
    const eLx = w * 0.05 - cx
    const eLy = h * 0.92 - h * 0.05
    const eLlen = Math.sqrt(eLx * eLx + eLy * eLy)
    const eNx = eLy / eLlen
    const eNy = -eLx / eLlen
    const eThick  = w * 0.085
    const eOffset = w * 0.04
    const et1 = 0.60, et2 = 0.88
    const eP1x = cx + et1 * eLx + eOffset * eNx,  eP1y = h * 0.05 + et1 * eLy + eOffset * eNy
    const eP2x = cx + et2 * eLx + eOffset * eNx,  eP2y = h * 0.05 + et2 * eLy + eOffset * eNy
    const eP3x = eP2x + eThick * eNx, eP3y = eP2y + eThick * eNy
    const eP4x = eP1x + eThick * eNx, eP4y = eP1y + eThick * eNy
    shape = (
      <>
        <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={actif ? 1.5 : 1} opacity={opacity} />
        <line x1={cx} y1={h * 0.05} x2={cx} y2={h * 0.92} stroke="white" strokeWidth={0.8} opacity={0.2} />
        <polygon points={`${eP1x},${eP1y} ${eP2x},${eP2y} ${eP3x},${eP3y} ${eP4x},${eP4y}`} fill="white" opacity={0.28} />
      </>
    )
  } else {
    const path = `M ${cx},${h * 0.04} C ${w * 0.85},${cy * 0.7} ${w * 0.85},${cy * 1.3} ${cx},${h * 0.96} C ${w * 0.15},${cy * 1.3} ${w * 0.15},${cy * 0.7} ${cx},${h * 0.04} Z`
    const crescent = [
      `M ${cx},${h * 0.04}`,
      `C ${w * 0.15},${cy * 0.70} ${w * 0.15},${cy * 1.30} ${cx},${h * 0.96}`,
      `C ${w * 0.28},${cy * 1.30} ${w * 0.28},${cy * 0.70} ${cx},${h * 0.04}`,
      'Z',
    ].join(' ')
    shape = (
      <>
        <path d={path} fill={fill} stroke={stroke} strokeWidth={actif ? 1.5 : 1} opacity={opacity} />
        <path d={crescent} fill="white" opacity={0.28} />
      </>
    )
  }

  return (
    <svg
      width={w} height={h} viewBox={`0 0 ${w} ${h}`}
      style={{ filter: actif ? `drop-shadow(0 0 6px ${c1}88)` : undefined, display: 'block', flexShrink: 0 }}
    >
      {gradientDef}
      {shape}
    </svg>
  )
}
