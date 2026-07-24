import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { Character } from '../types/character'
import type { DescMap, Grant } from '../types/gameData'
import { getChoixOptions, estCapaciteDejaChoisie, estAvanceeAccordeePourCible, symboleElement } from '../utils/voieRangChoix'
import { useVoieName } from '../hooks/useContentTranslation'
import CarteVoieModal from './CarteVoieModal'

type VoieRangChoixGrant = Extract<Grant, { type: 'VOIE_RANG_CHOIX' }>

interface Props {
  character: Character
  descriptions: DescMap
  grant: VoieRangChoixGrant
  rangNom: string
  // Position (en % du conteneur de la fiche, même repère que le rond "?" qui a déclenché l'ouverture)
  // à laquelle ancrer le popover — pas de fond plein écran, juste un petit panneau au clic, comme les
  // tooltips déjà utilisés ailleurs sur la fiche.
  anchor: { x: number; y: number }
  onChoose: (voie: string, rang: number, avanceeSeulement?: boolean) => void
  onClose: () => void
}

// Popover déclenché directement depuis une case à cocher de la fiche (recto/verso), pour un rang qui
// vient d'être coché (ou l'a été il y a longtemps) sans jamais passer par le wizard ou la montée de
// niveau — ces deux écrans ne proposent le choix que ponctuellement (au moment de l'achat), donc un
// rang coché directement sur la fiche n'a sinon aucun moyen d'être résolu avant la prochaine ouverture
// fortuite de la modale de montée de niveau. Même logique de choix que les pickers de LevelUpModal/
// CreationWizard (options + bouton "▤" de prévisualisation + grisage des capacités déjà prises
// ailleurs), mais autonome et appliquée directement au personnage réel (pas de brouillon à confirmer).
export default function VoieRangChoixSheetModal({ character, descriptions, grant, rangNom, anchor, onChoose, onClose }: Props) {
  const { t } = useTranslation()
  const voieName = useVoieName()
  const [previewVoie, setPreviewVoie] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (previewVoie) return // la carte de voie a son propre clic-extérieur, ne pas fermer le popover en dessous
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose, previewVoie])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <>
      <div
        ref={panelRef}
        style={{
          position: 'absolute',
          zIndex: 200,
          ...(anchor.x > 60 ? { right: `${100 - anchor.x}%` } : { left: `${anchor.x}%` }),
          ...(anchor.y > 60 ? { bottom: `${100 - anchor.y}%` } : { top: `${anchor.y}%` }),
          width: 300,
          maxWidth: '90vw',
          maxHeight: 340,
          overflowY: 'auto',
          background: 'rgba(18,14,9,0.98)',
          border: '1px solid rgba(120,180,255,0.5)',
          borderRadius: 6,
          boxShadow: '0 8px 32px rgba(0,0,0,0.85)',
        }}
      >
        <div style={{
          padding: '8px 10px 6px',
          borderBottom: '1px solid rgba(120,180,255,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.03em', color: 'rgba(160,200,255,0.95)' }}>
            {rangNom || t('fiche.choisirCapacite')}
          </span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(245,236,215,0.5)', fontSize: 16, lineHeight: 1, padding: '0 2px' }}
            aria-label="Fermer"
          >×</button>
        </div>

        <div style={{ padding: '8px 10px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {getChoixOptions(grant, descriptions).map(opt => {
            const dejaPrise = estCapaciteDejaChoisie(character, opt.voie, opt.rang)
            const dejaAvancee = dejaPrise && estAvanceeAccordeePourCible(character, descriptions, opt.voie, opt.rang)
            const proposerAvancee = !!grant.avanceeGratuite && dejaPrise && !dejaAvancee
            const bloque = dejaPrise && !proposerAvancee
            return (
              <div key={`${opt.voie}|${opt.rang}`} style={{ display: 'flex', gap: 6 }}>
                <button
                  disabled={bloque}
                  onClick={() => { onChoose(opt.voie, opt.rang, proposerAvancee); onClose() }}
                  title={dejaAvancee ? t('levelUp.dejaAvancee') : bloque ? t('levelUp.capaciteDejaPrise') : undefined}
                  style={{
                    flex: 1, textAlign: 'left', padding: '5px 8px', borderRadius: 4,
                    border: `1px solid rgba(120,180,255,${bloque ? 0.15 : 0.5})`,
                    background: proposerAvancee ? 'rgba(120,180,255,0.1)' : 'transparent',
                    color: bloque ? 'rgba(200,220,255,0.35)' : 'rgba(200,220,255,0.9)',
                    fontSize: 12.5, cursor: bloque ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                  }}>
                  {symboleElement(opt.voie) && <span style={{ marginRight: 4 }}>{symboleElement(opt.voie)}</span>}
                  <strong>{opt.nom}</strong> <span style={{ opacity: 0.6 }}>({opt.voie}, {t('levelUp.rangCourt', { rang: opt.rang })})</span>
                  {proposerAvancee && <span style={{ marginLeft: 6, fontStyle: 'italic' }}>— {t('levelUp.obtenirAvancee')}</span>}
                  {dejaAvancee && <span style={{ marginLeft: 6, fontStyle: 'italic' }}>— {t('levelUp.dejaAvancee')}</span>}
                  {bloque && !dejaAvancee && <span style={{ marginLeft: 6, fontStyle: 'italic' }}>— {t('levelUp.dejaAcquis')}</span>}
                </button>
                <button
                  onClick={() => setPreviewVoie(opt.voie)}
                  title={t('wizard.step3.voirVoie', { nom: voieName(opt.voie) })}
                  style={{
                    padding: '5px 8px', borderRadius: 4,
                    border: '1px solid rgba(120,180,255,0.4)',
                    background: 'rgba(120,180,255,0.12)',
                    color: 'rgba(160,200,255,0.95)',
                    cursor: 'pointer',
                    fontSize: 14, lineHeight: 1, flexShrink: 0,
                  }}>▤</button>
              </div>
            )
          })}
        </div>
      </div>

      {previewVoie && <CarteVoieModal nom={previewVoie} onClose={() => setPreviewVoie(null)} character={character} />}
    </>
  )
}
