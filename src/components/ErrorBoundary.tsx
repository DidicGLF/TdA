import { Component, type ErrorInfo, type ReactNode } from 'react'
import i18n from '../i18n'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

// Filet de sécurité global : capture toute exception de rendu pour éviter
// l'écran blanc total et proposer un rechargement à l'utilisateur.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] exception non capturée :', error, info.componentStack)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const t = (k: string, fb: string) => {
      const v = i18n.t(k)
      return v === k ? fb : v
    }

    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 100000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--tdr-dark, #14110a)', padding: 24,
      }}>
        <div style={{
          maxWidth: 520, width: '100%',
          background: 'rgba(22,17,11,0.99)', border: '1px solid rgba(240,120,120,0.5)',
          borderRadius: 10, padding: '28px 30px',
          boxShadow: '0 8px 40px rgba(0,0,0,0.9)',
          display: 'flex', flexDirection: 'column', gap: 16,
          fontFamily: "'Crimson Text', serif", color: '#f5ecd7',
        }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'rgba(240,140,140,0.95)', fontFamily: "'Cinzel', serif" }}>
            ⚠ {t('errorBoundary.titre', 'Une erreur est survenue')}
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.6, color: 'rgba(245,236,215,0.8)' }}>
            {t('errorBoundary.corps', "L'application a rencontré un problème inattendu. Tes données sauvegardées ne sont pas affectées. Recharge l'application pour continuer.")}
          </div>
          <details style={{ fontSize: 12, color: 'rgba(245,236,215,0.5)' }}>
            <summary style={{ cursor: 'pointer', userSelect: 'none' }}>
              {t('errorBoundary.details', 'Détails techniques')}
            </summary>
            <pre style={{
              marginTop: 8, padding: 10, background: 'rgba(0,0,0,0.4)', borderRadius: 5,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 200, overflowY: 'auto',
              fontFamily: 'monospace', fontSize: 11,
            }}>
              {error.message}
              {error.stack ? `\n\n${error.stack}` : ''}
            </pre>
          </details>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={this.handleReload}
              style={{
                padding: '9px 22px', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 700,
                border: '1px solid rgba(201,168,76,0.6)', background: 'rgba(201,168,76,0.15)',
                color: 'var(--tdr-gold, #c9a84c)', fontFamily: 'inherit',
              }}
            >
              ↻ {t('errorBoundary.recharger', "Recharger l'application")}
            </button>
          </div>
        </div>
      </div>
    )
  }
}
