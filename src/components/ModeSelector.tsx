import { useTranslation } from 'react-i18next'

const GOLD = '#c9a84c'
const PARCHMENT = '#f5ecd7'

interface Props {
  onSelect: (mode: 'joueur' | 'mj') => void
  mjDisabled?: boolean
}

export default function ModeSelector({ onSelect, mjDisabled }: Props) {
  const { t } = useTranslation()

  const cardStyle: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
    width: 240, padding: '32px 24px', borderRadius: 12,
    border: `1px solid rgba(201,168,76,0.4)`, background: 'rgba(255,255,255,0.02)',
    color: PARCHMENT, cursor: 'pointer', fontFamily: "'Cinzel', serif",
    transition: 'background 0.15s, border-color 0.15s',
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100vh', width: '100vw', background: 'var(--tdr-dark)', gap: 40,
      paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.5 }}>
          {t('app.titre')}
        </div>
        <div style={{ fontSize: 22, fontFamily: "'Cinzel', serif", fontWeight: 700, color: GOLD, letterSpacing: '0.05em' }}>
          {t('modeSelector.titre')}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button
          onClick={() => onSelect('joueur')}
          style={cardStyle}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(201,168,76,0.08)'; e.currentTarget.style.borderColor = GOLD }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = 'rgba(201,168,76,0.4)' }}
        >
          <span style={{ fontSize: 36 }}>📜</span>
          <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: '0.04em' }}>{t('modeSelector.joueur')}</span>
          <span style={{ fontSize: 13, opacity: 0.6, fontFamily: "'Crimson Text', serif", textAlign: 'center' }}>
            {t('modeSelector.joueurDesc')}
          </span>
        </button>

        <button
          onClick={() => { if (!mjDisabled) onSelect('mj') }}
          disabled={mjDisabled}
          title={mjDisabled ? t('modeSelector.mjIndisponibleMobile') : undefined}
          style={{
            ...cardStyle,
            ...(mjDisabled ? { opacity: 0.4, cursor: 'not-allowed' } : {}),
          }}
          onMouseEnter={e => { if (mjDisabled) return; e.currentTarget.style.background = 'rgba(201,168,76,0.08)'; e.currentTarget.style.borderColor = GOLD }}
          onMouseLeave={e => { if (mjDisabled) return; e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = 'rgba(201,168,76,0.4)' }}
        >
          <span style={{ fontSize: 36 }}>🗺️</span>
          <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: '0.04em' }}>{t('modeSelector.mj')}</span>
          <span style={{ fontSize: 13, opacity: 0.6, fontFamily: "'Crimson Text', serif", textAlign: 'center' }}>
            {mjDisabled ? t('modeSelector.mjIndisponibleMobile') : t('modeSelector.mjDesc')}
          </span>
        </button>
      </div>
    </div>
  )
}
