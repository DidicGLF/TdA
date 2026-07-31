import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { useTranslation } from 'react-i18next'

const ASPECT = 0.72

interface Props {
  value: string
  scale?: number
  tx?: number
  ty?: number
  fit?: 'cover' | 'contain'
  locked?: boolean
  onChange: (val: string) => void
  onTransformChange?: (scale: number, tx: number, ty: number) => void
  onFitChange?: (fit: 'cover' | 'contain') => void
  onLockedChange?: (locked: boolean) => void
}

// Boutons placés hors de l'image (au-dessus) plutôt qu'en overlay dessus : sur une image sombre,
// des boutons semi-transparents superposés deviennent illisibles.
const TOOL_BTN: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(201,168,76,0.35)',
  color: 'rgba(245,236,215,0.85)', borderRadius: 4, padding: '4px 9px', fontSize: 12,
  fontFamily: 'inherit', cursor: 'pointer', lineHeight: 1.4,
}

export default function CreatureImage({
  value, scale: initScale = 1, tx: initTx = 0, ty: initTy = 0, fit = 'cover', locked: initLocked = false,
  onChange, onTransformChange, onFitChange, onLockedChange,
}: Props) {
  const { t } = useTranslation()
  const [imgScale, setImgScale] = useState(initScale)
  const [imgTx, setImgTx] = useState(initTx)
  const [imgTy, setImgTy] = useState(initTy)
  const [locked, setLocked] = useState(initLocked)
  const fileRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const [boxWidth, setBoxWidth] = useState(240)
  const lockedRef = useRef(locked); lockedRef.current = locked
  const imgTxRef = useRef(imgTx); imgTxRef.current = imgTx
  const imgTyRef = useRef(imgTy); imgTyRef.current = imgTy
  const imgScaleRef = useRef(imgScale); imgScaleRef.current = imgScale
  const onTransformChangeRef = useRef(onTransformChange); onTransformChangeRef.current = onTransformChange
  const onChangeRef = useRef(onChange); onChangeRef.current = onChange
  // Aperçu local de l'image tout juste choisie, affiché immédiatement sans attendre l'aller-retour
  // async (compression + écriture) par importerImage — nécessaire depuis que la clé de stockage du
  // bestiaire est basée sur le nom de la créature (stable) plutôt que sur le contenu : remplacer une
  // image garde la même clé, donc `value` (qui en dérive via useImage) ne change pas et n'aurait sinon
  // rien déclenché de nouveau à l'écran tant que la page n'est pas rechargée.
  const [apercuLocal, setApercuLocal] = useState<string | null>(null)
  const valeurAffichee = apercuLocal ?? value

  useEffect(() => {
    setImgScale(initScale); setImgTx(initTx); setImgTy(initTy)
    setApercuLocal(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, initScale, initTx, initTy])

  // La largeur suit la hauteur réelle du conteneur (étiré par le flex parent pour atteindre
  // le bas de la colonne 1) plutôt que de dépendre de la propriété CSS aspect-ratio, dont le
  // calcul combiné à une largeur de parent non définie (flex item sans width) peut être instable
  // selon le moteur de rendu.
  useLayoutEffect(() => {
    const parent = rootRef.current?.parentElement
    if (!parent) return
    const update = () => {
      const h = parent.clientHeight
      if (h) setBoxWidth(Math.round(h * ASPECT))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(parent)
    return () => ro.disconnect()
  }, [])

  const hasValue = !!valeurAffichee
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (lockedRef.current) return
      e.preventDefault()
      const next = Math.max(1, Math.min(5, imgScaleRef.current * Math.pow(0.999, e.deltaY)))
      imgScaleRef.current = next
      setImgScale(next)
      onTransformChangeRef.current?.(next, imgTxRef.current, imgTyRef.current)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [hasValue])

  const handleImageMouseDown = (e: React.MouseEvent) => {
    if (lockedRef.current) return
    e.preventDefault(); e.stopPropagation()
    const el = containerRef.current
    const cw = el ? el.clientWidth : 1
    const ch = el ? el.clientHeight : 1
    const startX = e.clientX, startY = e.clientY
    const startTx = imgTxRef.current, startTy = imgTyRef.current
    let dragged = false
    const onMove = (ev: MouseEvent) => {
      if (lockedRef.current) return
      if (!dragged && (Math.abs(ev.clientX - startX) > 4 || Math.abs(ev.clientY - startY) > 4)) dragged = true
      if (dragged) { setImgTx(startTx + (ev.clientX - startX) / cw); setImgTy(startTy + (ev.clientY - startY) / ch) }
    }
    const onUp = (ev: MouseEvent) => {
      if (!dragged) {
        fileRef.current?.click()
      } else {
        const newTx = startTx + (ev.clientX - startX) / cw
        const newTy = startTy + (ev.clientY - startY) / ch
        setImgTx(newTx); setImgTy(newTy)
        onTransformChangeRef.current?.(imgScaleRef.current, newTx, newTy)
      }
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const reader = new FileReader()
    reader.onload = ev => {
      const src = ev.target?.result as string
      const applyImage = (dataUrl: string) => {
        setApercuLocal(dataUrl)
        onTransformChangeRef.current?.(1, 0, 0)
        onChangeRef.current(dataUrl)
      }
      const img = new Image()
      img.onload = () => {
        try {
          const MAX = 900
          const ratio = Math.min(MAX / img.width, MAX / img.height, 1)
          const w = Math.round(img.width * ratio)
          const h = Math.round(img.height * ratio)
          const canvas = document.createElement('canvas')
          canvas.width = w; canvas.height = h
          const ctx = canvas.getContext('2d')
          if (!ctx) { applyImage(src); return }
          ctx.drawImage(img, 0, 0, w, h)
          applyImage(canvas.toDataURL('image/webp', 0.88))
        } catch {
          applyImage(src)
        }
      }
      img.onerror = () => applyImage(src)
      img.src = src
    }
    reader.readAsDataURL(file)
  }

  const isModified = imgScale > 1 || imgTx !== 0 || imgTy !== 0

  return (
    <div ref={rootRef} style={{ height: '100%', flexShrink: 0, display: 'flex', flexDirection: 'row', gap: 6 }}>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />

      {valeurAffichee && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
          <button
            style={{ ...TOOL_BTN, background: locked ? 'rgba(201,168,76,0.18)' : TOOL_BTN.background, borderColor: locked ? 'rgba(201,168,76,0.7)' : undefined }}
            onClick={() => { const next = !lockedRef.current; setLocked(next); onLockedChange?.(next) }}
            title={locked ? t('gmMode.creatureDetail.titleDefiger') : t('gmMode.creatureDetail.titleFiger')}
          >
            {locked ? '🔒' : '🔓'}
          </button>
          {!locked && (
            <button style={TOOL_BTN}
              onClick={() => onFitChange?.(fit === 'cover' ? 'contain' : 'cover')}
              title={fit === 'cover' ? t('gmMode.creatureDetail.imageEntiere') : t('gmMode.creatureDetail.imageRecadrer')}
            >
              {fit === 'cover' ? '⊡' : '▣'}
            </button>
          )}
          {!locked && isModified && (
            <button style={TOOL_BTN}
              onClick={() => { setImgScale(1); setImgTx(0); setImgTy(0); onTransformChangeRef.current?.(1, 0, 0) }}
              title={t('gmMode.creatureDetail.imageReset')}
            >↺</button>
          )}
          <button style={{ ...TOOL_BTN, color: 'rgba(255,140,140,0.95)' }}
            onClick={() => onChange('')}
            title={t('gmMode.creatureDetail.imageSupprimer')}
          >✕</button>
        </div>
      )}

      <div style={{ width: boxWidth, height: '100%', flexShrink: 0, position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(201,168,76,0.3)' }}>
        {valeurAffichee ? (
          <div ref={containerRef} onMouseDown={handleImageMouseDown} className="creature-image-hover" style={{ width: '100%', height: '100%', cursor: 'pointer', position: 'relative' }}>
            <img
              src={valeurAffichee}
              alt=""
              draggable={false}
              style={{
                width: '100%', height: '100%', objectFit: fit, display: 'block',
                transform: `scale(${imgScale}) translate(${imgTx / imgScale * 100}%, ${imgTy / imgScale * 100}%)`,
                transformOrigin: 'center', userSelect: 'none', pointerEvents: 'none',
              }}
            />
            <div className="creature-image-hint" style={{
              position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 12, textAlign: 'center', lineHeight: 1.6,
              opacity: 0, transition: 'opacity 0.15s', pointerEvents: 'none',
            }}>
              <div>
                {!locked && <>{t('gmMode.creatureDetail.imageChanger')}<br /></>}
                <span style={{ fontSize: 10, opacity: 0.7 }}>
                  {locked ? t('gmMode.creatureDetail.imageFigeLegend') : t('gmMode.creatureDetail.imageGlisser')}
                </span>
              </div>
            </div>
            <style>{`
              .creature-image-hover:hover .creature-image-hint { opacity: 1; }
            `}</style>
          </div>
        ) : (
          <div
            onClick={() => fileRef.current?.click()}
            style={{
              width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1.5px dashed rgba(201,168,76,0.4)', borderRadius: 8, cursor: 'pointer',
              color: 'rgba(201,168,76,0.5)', fontSize: 12, textAlign: 'center', lineHeight: 1.5,
            }}
          >
            <div>
              <div style={{ fontSize: 22, marginBottom: 4 }}>+</div>
              {t('gmMode.creatureDetail.imageAjouter')}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
