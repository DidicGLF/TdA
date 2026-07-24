import React from 'react'
import { useTranslation } from 'react-i18next'
import type { Character } from '../types/character'
import { useGameData } from '../context/GameDataContext'
import { useVoieName, useTranslatedDescriptions } from '../hooks/useContentTranslation'
import { parseDesc } from '../utils/parseDesc'

function renderDesc(text: string, character?: Character): React.ReactNode {
  return parseDesc(text, character)
}

// Modale de prévisualisation d'une voie : ses 5 rangs, nom + description complète — partagée entre
// le wizard de création (choix des voies) et la modale de montée de niveau (choix VOIE_RANG_CHOIX),
// pour que "voir le détail d'une voie" se comporte et se présente toujours de la même façon.
export default function CarteVoieModal({ nom, onClose, character }: { nom: string; onClose: () => void; character?: Character }) {
  const { t } = useTranslation()
  const { data: rawData } = useGameData()
  const data = useTranslatedDescriptions(rawData)
  const voieName = useVoieName()
  const capacites = data[nom] ?? data[nom.toLowerCase()] ?? []

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.88)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px 16px',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'rgba(18,14,9,0.98)',
        border: '1px solid rgba(201,168,76,0.45)',
        borderRadius: 8,
        maxWidth: 560,
        width: '100%',
        maxHeight: '85vh',
        overflowY: 'auto',
        boxShadow: '0 12px 64px rgba(0,0,0,0.9)',
      }}>
        {/* En-tête */}
        <div style={{
          padding: '16px 20px 12px',
          borderBottom: '1px solid rgba(201,168,76,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <h2 style={{
            margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: '0.04em',
            color: 'var(--tdr-gold)',
          }}>{voieName(nom)}</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(245,236,215,0.5)', fontSize: 20, lineHeight: 1, padding: '0 2px',
            }}
            aria-label="Fermer"
          >×</button>
        </div>

        {/* Capacités */}
        <div style={{ padding: '12px 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {capacites.map((cap, i) => (
            <div key={i} style={{
              borderLeft: '2px solid rgba(201,168,76,0.4)',
              paddingLeft: 12,
            }}>
              <div style={{
                fontSize: 17, fontWeight: 600, letterSpacing: '0.06em',
                color: 'rgba(201,168,76,0.7)', marginBottom: 5,
                textTransform: 'uppercase',
              }}>
                {t('wizard.step3.rangCarteTitre', { rang: i + 1, nom: cap.nom })}
              </div>
              <div style={{
                fontSize: 18, lineHeight: 1.6,
                color: 'rgba(245,236,215,0.85)',
              }}>
                {renderDesc(cap.desc, character)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
