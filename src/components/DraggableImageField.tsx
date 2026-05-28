import { useState, useRef, useEffect } from 'react'
import type { RefObject } from 'react'

interface Props {
  top: number
  left: number
  width: number
  height: number
  value: string
  scale?: number
  tx?: number
  ty?: number
  fit?: 'cover' | 'contain'
  onChange: (val: string) => void
  onPanZoomChange?: (scale: number, tx: number, ty: number) => void
  onFitChange?: (fit: 'cover' | 'contain') => void
  calibrate: boolean
  label: string
  containerRef: RefObject<HTMLDivElement | null>
  onMoved: (label: string, top: number, left: number, width?: number, height?: number) => void
}

const TOOL_BTN: React.CSSProperties = {
  background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)',
  color: '#fff', borderRadius: 3, padding: '2px 7px', fontSize: '0.65vw',
  fontFamily: 'inherit', cursor: 'pointer', lineHeight: 1.5,
}

export default function DraggableImageField({
  top, left, width: initWidth, height: initHeight,
  value, scale: initScale = 1, tx: initTx = 0, ty: initTy = 0,
  fit = 'cover',
  onChange, onPanZoomChange, onFitChange, calibrate, label, containerRef, onMoved,
}: Props) {
  const [pos, setPos] = useState({ top, left })
  const [width, setWidth] = useState(initWidth)
  const [height, setHeight] = useState(initHeight)
  const [imgScale, setImgScale] = useState(initScale)
  const [imgTx, setImgTx] = useState(initTx)
  const [imgTy, setImgTy] = useState(initTy)
  const [locked, setLocked] = useState(false)
  const lockedRef = useRef(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const imgContainerRef = useRef<HTMLDivElement>(null)
  const calibrateRef = useRef(calibrate)
  calibrateRef.current = calibrate
  const onPanZoomChangeRef = useRef(onPanZoomChange)
  onPanZoomChangeRef.current = onPanZoomChange
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const imgTxRef = useRef(imgTx)
  imgTxRef.current = imgTx
  const imgTyRef = useRef(imgTy)
  imgTyRef.current = imgTy
  const imgScaleRef = useRef(imgScale)
  imgScaleRef.current = imgScale

  // Sync from props whenever scale/tx/ty or the portrait itself changes.
  // This keeps the hidden print section's data-* attributes up to date.
  useEffect(() => {
    setImgScale(initScale)
    setImgTx(initTx)
    setImgTy(initTy)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, initScale, initTx, initTy])

  // Non-passive wheel listener — re-register when portrait appears (value goes '' → base64)
  const hasValue = !!value
  useEffect(() => {
    const el = imgContainerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (calibrateRef.current) return
      if (lockedRef.current) return
      e.preventDefault()
      const next = Math.max(1, Math.min(5, imgScaleRef.current * Math.pow(0.999, e.deltaY)))
      imgScaleRef.current = next
      setImgScale(next)
      onPanZoomChangeRef.current?.(next, imgTxRef.current, imgTyRef.current)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasValue])

  // Clic = changer l'image / Glisser = déplacer (tx/ty stockés en fraction du container)
  const handleImageMouseDown = (e: React.MouseEvent) => {
    if (calibrate) return
    if (lockedRef.current) return
    e.preventDefault(); e.stopPropagation()
    const el = imgContainerRef.current
    const cw = el ? el.clientWidth  : 1
    const ch = el ? el.clientHeight : 1
    const startX = e.clientX, startY = e.clientY
    const startTx = imgTxRef.current, startTy = imgTyRef.current
    let dragged = false
    const onMove = (ev: MouseEvent) => {
      if (lockedRef.current) return
      if (!dragged && (Math.abs(ev.clientX - startX) > 4 || Math.abs(ev.clientY - startY) > 4)) {
        dragged = true
      }
      if (dragged) {
        setImgTx(startTx + (ev.clientX - startX) / cw)
        setImgTy(startTy + (ev.clientY - startY) / ch)
      }
    }
    const onUp = (ev: MouseEvent) => {
      if (!dragged) {
        fileRef.current?.click()
      } else {
        const newTx = startTx + (ev.clientX - startX) / cw
        const newTy = startTy + (ev.clientY - startY) / ch
        setImgTx(newTx); setImgTy(newTy)
        onPanZoomChangeRef.current?.(imgScaleRef.current, newTx, newTy)
      }
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  // Calibrate: drag the whole field
  const handleDragMouseDown = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    const startX = e.clientX, startY = e.clientY
    const startTop = pos.top, startLeft = pos.left
    const onMove = (ev: MouseEvent) => {
      const rect = containerRef.current!.getBoundingClientRect()
      setPos({
        top:  +(startTop  + (ev.clientY - startY) / rect.height * 100).toFixed(1),
        left: +(startLeft + (ev.clientX - startX) / rect.width  * 100).toFixed(1),
      })
    }
    const onUp = (ev: MouseEvent) => {
      const rect = containerRef.current!.getBoundingClientRect()
      const newTop  = +(startTop  + (ev.clientY - startY) / rect.height * 100).toFixed(1)
      const newLeft = +(startLeft + (ev.clientX - startX) / rect.width  * 100).toFixed(1)
      setPos({ top: newTop, left: newLeft })
      onMoved(label, newTop, newLeft, width, height)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const handleResizeWidthMouseDown = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    const startX = e.clientX, startWidth = width
    const onMove = (ev: MouseEvent) => {
      const rect = containerRef.current!.getBoundingClientRect()
      setWidth(Math.max(1, +(startWidth + (ev.clientX - startX) / rect.width * 100).toFixed(1)))
    }
    const onUp = (ev: MouseEvent) => {
      const rect = containerRef.current!.getBoundingClientRect()
      const w = Math.max(1, +(startWidth + (ev.clientX - startX) / rect.width * 100).toFixed(1))
      setWidth(w); onMoved(label, pos.top, pos.left, w, height)
      document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
  }

  const handleResizeHeightMouseDown = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    const startY = e.clientY, startHeight = height
    const onMove = (ev: MouseEvent) => {
      const rect = containerRef.current!.getBoundingClientRect()
      setHeight(Math.max(1, +(startHeight + (ev.clientY - startY) / rect.height * 100).toFixed(1)))
    }
    const onUp = (ev: MouseEvent) => {
      const rect = containerRef.current!.getBoundingClientRect()
      const h = Math.max(1, +(startHeight + (ev.clientY - startY) / rect.height * 100).toFixed(1))
      setHeight(h); onMoved(label, pos.top, pos.left, width, h)
      document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const reader = new FileReader()
    reader.onload = ev => {
      const src = ev.target?.result as string
      const applyImage = (dataUrl: string) => {
        onPanZoomChangeRef.current?.(1, 0, 0)
        onChangeRef.current(dataUrl)
      }
      const img = new Image()
      img.onload = () => {
        try {
          const MAX = 1200
          const ratio = Math.min(MAX / img.width, MAX / img.height, 1)
          const w = Math.round(img.width * ratio)
          const h = Math.round(img.height * ratio)
          const canvas = document.createElement('canvas')
          canvas.width = w
          canvas.height = h
          const ctx = canvas.getContext('2d')
          if (!ctx) { applyImage(src); return }
          ctx.drawImage(img, 0, 0, w, h)
          const webp = canvas.toDataURL('image/webp', 0.88)
          applyImage(webp)
        } catch {
          applyImage(src)
        }
      }
      img.onerror = () => applyImage(src)
      img.src = src
    }
    reader.readAsDataURL(file)
  }

  const fieldStyle: React.CSSProperties = {
    position: 'absolute',
    top: `${pos.top}%`,
    left: `${pos.left}%`,
    width: `${width}%`,
    height: `${height}%`,
    transform: 'translate(-50%, -50%)',
  }

  const isModified = imgScale > 1 || imgTx !== 0 || imgTy !== 0

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {value ? (
        <div
          ref={imgContainerRef}
          style={{ ...fieldStyle, overflow: 'hidden', cursor: 'pointer' }}
          onMouseDown={handleImageMouseDown}
        >
          <img
            src={value}
            alt="Portrait"
            className="portrait-img"
            data-scale={imgScale}
            data-tx={imgTx}
            data-ty={imgTy}
            data-fit={fit}
            style={{
              width: '100%', height: '100%', objectFit: fit, display: 'block',
              transform: `scale(${imgScale}) translate(${imgTx / imgScale * 100}%, ${imgTy / imgScale * 100}%)`,
              transformOrigin: 'center',
              userSelect: 'none', pointerEvents: 'none',
            }}
            draggable={false}
          />
          {!calibrate && (
            <>
              {/* Hint "Changer" au survol */}
              <div style={{
                position: 'absolute', inset: 0,
                background: 'rgba(0,0,0,0.4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: '0.8vw', fontFamily: 'sans-serif',
                opacity: 0, transition: 'opacity 0.15s', pointerEvents: 'none',
              }}
              className="portrait-hover-hint">
                <div style={{ textAlign: 'center', lineHeight: 1.6 }}>
                  {!locked && <><div style={{ fontSize: '1.4vw' }}>↑</div>Cliquer pour changer<br /></>}
                  <span style={{ fontSize: '0.65vw', opacity: 0.7 }}>
                    {locked
                      ? 'Portrait figé · Cliquer "Figé" pour modifier le cadrage'
                      : fit === 'cover'
                        ? 'Glisser pour cadrer · Molette pour zoomer'
                        : 'Molette pour zoomer · Image entière visible'}
                  </span>
                </div>
              </div>
              {/* Boutons d'outils */}
              <div className="portrait-tools no-print" style={{ position: 'absolute', top: 4, right: 4, display: 'flex', gap: 3, opacity: 0, transition: 'opacity 0.15s' }}>
                {/* Figer / Défiger */}
                <button
                  style={{ ...TOOL_BTN, background: locked ? 'rgba(201,168,76,0.25)' : TOOL_BTN.background, borderColor: locked ? 'rgba(201,168,76,0.6)' : undefined }}
                  onClick={e => { e.stopPropagation(); const next = !lockedRef.current; lockedRef.current = next; setLocked(next) }}
                  onMouseDown={e => e.stopPropagation()}
                  title={locked ? 'Défiger (autoriser le déplacement)' : 'Figer (empêcher le déplacement accidentel)'}
                >
                  {locked ? 'Figé' : 'Figer'}
                </button>
                {/* Bascule cover ↔ contain */}
                {!locked && (
                  <button
                    style={{ ...TOOL_BTN }}
                    onClick={e => { e.stopPropagation(); onFitChange?.(fit === 'cover' ? 'contain' : 'cover') }}
                    onMouseDown={e => e.stopPropagation()}
                    title={fit === 'cover' ? 'Afficher l\'image entière' : 'Recadrer (remplir le cadre)'}
                  >
                    {fit === 'cover' ? '⊡' : '▣'}
                  </button>
                )}
                {/* Reset cadrage */}
                {!locked && isModified && (
                  <button
                    style={{ ...TOOL_BTN }}
                    onClick={e => { e.stopPropagation(); setImgScale(1); setImgTx(0); setImgTy(0); onPanZoomChange?.(1, 0, 0) }}
                    onMouseDown={e => e.stopPropagation()}
                    title="Réinitialiser le cadrage"
                  >↺</button>
                )}
              </div>
            </>
          )}
        </div>
      ) : (
        <div
          onClick={!calibrate ? () => fileRef.current?.click() : undefined}
          style={{
            ...fieldStyle,
            border: `1.5px dashed ${calibrate ? 'rgba(180,130,255,0.7)' : 'rgba(201,168,76,0.4)'}`,
            borderRadius: 3,
            cursor: calibrate ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: calibrate ? 'rgba(180,130,255,0.6)' : 'rgba(201,168,76,0.45)',
            fontSize: '0.7vw',
            fontFamily: 'sans-serif',
            textAlign: 'center',
            lineHeight: 1.4,
          }}
        >
          {!calibrate && (
            <div>
              <div style={{ fontSize: '1.2vw', marginBottom: 2 }}>+</div>
              Ajouter<br />une image
            </div>
          )}
        </div>
      )}

      {calibrate && (
        <div
          onMouseDown={handleDragMouseDown}
          style={{
            position: 'absolute',
            top: `${pos.top}%`, left: `${pos.left}%`,
            transform: 'translate(-50%, -50%)',
            cursor: 'grab',
            background: 'rgba(180,130,255,0.92)',
            color: '#1a0a30',
            fontSize: 8, fontFamily: 'monospace', fontWeight: 700,
            padding: '1px 3px', borderRadius: 2,
            userSelect: 'none', zIndex: 40,
            whiteSpace: 'nowrap', lineHeight: '14px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', gap: 2,
          }}
        >
          {label}
          <span onMouseDown={handleResizeWidthMouseDown}
            style={{ cursor: 'ew-resize', paddingLeft: 3, borderLeft: '1px solid rgba(26,10,48,0.35)', fontSize: 10, lineHeight: 1 }}
            title="Largeur">↔</span>
          <span onMouseDown={handleResizeHeightMouseDown}
            style={{ cursor: 'ns-resize', paddingLeft: 2, fontSize: 10, lineHeight: 1 }}
            title="Hauteur">↕</span>
          {value && (
            <span
              onMouseDown={e => { e.preventDefault(); e.stopPropagation(); onChange('') }}
              style={{ cursor: 'pointer', paddingLeft: 3, borderLeft: '1px solid rgba(26,10,48,0.35)', fontSize: 10, lineHeight: 1, color: '#c05050' }}
              title="Supprimer l'image"
            >✕</span>
          )}
        </div>
      )}
    </>
  )
}
