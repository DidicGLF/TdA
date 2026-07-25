import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

const GOLD = '#c9a84c'
const PARCHMENT = '#f5ecd7'

// Drapeau par code langue (repère visuel dans le menu déroulant, voir DRAPEAUX) — 🌐 en repli pour
// une langue future sans entrée ici plutôt que de bloquer sur un code manquant.
const DRAPEAUX: Record<string, string> = { fr: '🇫🇷', en: '🇬🇧' }

interface Props {
  onSelect: (mode: 'joueur' | 'mj') => void
  mjDisabled?: boolean
  // Langue + éditeur de traductions — déplacés ici (page d'accueil) plutôt que dans le menu Gestion du
  // mode joueur, pour pouvoir choisir la langue avant même d'entrer dans un mode. onOpenTranslations
  // absent sur Android (l'éditeur de traductions n'y est pas proposé, voir App.tsx).
  languages: { code: string; label: string }[]
  currentLanguage: string
  onChangeLanguage: (code: string) => void
  onOpenTranslations?: () => void
}

export default function ModeSelector({ onSelect, mjDisabled, languages, currentLanguage, onChangeLanguage, onOpenTranslations }: Props) {
  const { t } = useTranslation()
  // Bouton discret (planète, voir le globe déjà utilisé ailleurs dans l'app) plutôt qu'une rangée de
  // boutons de langue toujours visible — ouvre un petit menu (langues + drapeaux, puis Traductions en
  // bas). Fermeture au clic en dehors, même pattern que les popovers du mode MJ (BatailleTab).
  const [menuOuvert, setMenuOuvert] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOuvert(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const cardStyle: React.CSSProperties = {
    // Hauteur minimale fixe : sans ça, le remplacement de la police de secours par Cinzel/Crimson
    // Text une fois chargée (métriques différentes) fait légèrement changer la hauteur du bouton —
    // donc sa position, centré verticalement avec l'autre — juste avant qu'on puisse cliquer dessus.
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
    width: 240, minHeight: 190, padding: '32px 24px', borderRadius: 12,
    border: `1px solid rgba(201,168,76,0.4)`, background: 'rgba(255,255,255,0.02)',
    color: PARCHMENT, cursor: 'pointer', fontFamily: "'Cinzel', serif",
    transition: 'background 0.15s, border-color 0.15s',
  }

  return (
    <div style={{
      position: 'relative',
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

      {/* Langue + éditeur de traductions — bouton discret en coin plutôt qu'une rangée toujours
          visible : pas de convention de coin déjà établie ailleurs dans l'app pour ce genre de bouton
          utilitaire, coin haut-droit choisi (convention web habituelle pour un sélecteur de langue).
          Le drapeau de la langue actuelle sert d'icône (voir DRAPEAUX), pas une planète fixe. */}
      {/* Le décalage tient compte de la zone sûre de l'appareil (barre d'état, encoche) : sans lui,
          le bouton passe sous l'heure et le niveau de batterie sur mobile. */}
      <div ref={menuRef} style={{
        position: 'absolute', right: 20,
        // max() garantit un dégagement même si l'appareil renvoie 0 pour la zone sûre
        // alors qu'une barre d'état recouvre malgré tout le haut de l'écran.
        top: 'max(calc(env(safe-area-inset-top, 0px) + 20px), 44px)',
      }}>
        <button
          onClick={() => setMenuOuvert(o => !o)}
          title={t('menuGestion.langue')}
          style={{
            width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `1px solid ${menuOuvert ? GOLD : 'rgba(201,168,76,0.3)'}`,
            background: menuOuvert ? 'rgba(201,168,76,0.1)' : 'transparent',
            color: 'rgba(245,236,215,1)', opacity: 1, cursor: 'pointer', fontSize: 18, padding: 0,
          }}
        >
          {DRAPEAUX[currentLanguage] ?? '🌐'}
        </button>
        {menuOuvert && (
          <div style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 8, zIndex: 20, width: 180,
            background: 'rgba(18,14,9,0.99)', border: `1px solid ${GOLD}30`, borderRadius: 8,
            boxShadow: '0 6px 20px rgba(0,0,0,0.5)', padding: 6, display: 'flex', flexDirection: 'column', gap: 2,
          }}>
            {languages.map(({ code, label }) => (
              <button
                key={code}
                onClick={() => { onChangeLanguage(code); setMenuOuvert(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 5,
                  border: 'none', cursor: 'pointer', fontSize: 14, textAlign: 'left',
                  background: currentLanguage === code ? 'rgba(201,168,76,0.15)' : 'transparent',
                  color: currentLanguage === code ? GOLD : 'rgba(245,236,215,0.75)',
                }}
              >
                <span style={{ fontSize: 16 }}>{DRAPEAUX[code] ?? '🌐'}</span>
                {label}
              </button>
            ))}
            {onOpenTranslations && (
              <>
                <div style={{ borderTop: `1px solid ${GOLD}20`, margin: '4px 0' }} />
                <button
                  onClick={() => { onOpenTranslations(); setMenuOuvert(false) }}
                  style={{
                    padding: '7px 10px', borderRadius: 5, border: 'none', cursor: 'pointer', fontSize: 14,
                    textAlign: 'left', background: 'transparent', color: 'rgba(245,236,215,0.6)',
                  }}
                >
                  {t('menuGestion.traductions', 'Traductions')}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
