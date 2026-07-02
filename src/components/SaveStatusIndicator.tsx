import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { subscribeSaveStatus, type SaveStatus } from '../utils/saveManager'

export default function SaveStatusIndicator() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<SaveStatus>('idle')
  useEffect(() => subscribeSaveStatus(setStatus), [])

  if (status === 'idle') return null

  const cfg = {
    saving: { icon: '⟳', text: t('saveStatus.saving'), color: 'rgba(201,168,76,0.95)', bg: 'rgba(20,16,10,0.92)', spin: true },
    saved:  { icon: '✓', text: t('saveStatus.saved'),  color: 'rgba(120,200,120,0.95)', bg: 'rgba(16,24,16,0.92)', spin: false },
    error:  { icon: '⚠', text: t('saveStatus.error'),  color: 'rgba(240,120,120,0.98)', bg: 'rgba(40,16,16,0.96)', spin: false },
  }[status]

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed', bottom: 14, left: 14, zIndex: 10000,
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 14px', borderRadius: 6,
        background: cfg.bg, border: `1px solid ${cfg.color}`, color: cfg.color,
        fontSize: 13, fontFamily: 'inherit',
        boxShadow: '0 4px 16px rgba(0,0,0,0.6)', pointerEvents: 'none',
      }}
    >
      <style>{'@keyframes tda-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}'}</style>
      <span style={{ display: 'inline-block', animation: cfg.spin ? 'tda-spin 0.9s linear infinite' : undefined }}>{cfg.icon}</span>
      <span>{cfg.text}</span>
    </div>
  )
}
