import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BlocCarteCritique, CarteCritique, CategorieCarteCritique, TypeBlocCarte } from '../data/cartesCritiques'
import { blocsPertinents } from '../data/cartesCritiques'
import { LABEL_TYPE } from '../utils/carteCritiqueLabels'

// Contrôles MJ optionnels — fournis UNIQUEMENT par CartesCritiquesTab (outil MJ autonome), jamais par
// le Mode de jeu (côté joueur) ni CombatTab : leur simple présence bascule un bandeau actif/désactivée +
// éditer sous l'en-tête, absent sinon. `livreBlocs` sert au bouton Réinitialiser en mode édition (retrouver
// le texte d'origine sans avoir à le retaper) ; `onSaveTexte` persiste la correction dans les surcharges
// perso (voir cartesCritiquesPerso.ts), lue ensuite par tous les tirages de l'appli, Mode de jeu compris.
export interface CarteCritiqueGmControls {
  active: boolean
  onToggleActive: () => void
  livreBlocs: BlocCarteCritique[]
  onSaveTexte: (blocs: BlocCarteCritique[]) => void
}

interface Props {
  carte: CarteCritique
  categorie: CategorieCarteCritique
  // Type d'attaque à l'origine du jet, quand il est connu (Mode de jeu : le joueur clique un bouton
  // contact/distance/magique dédié) — n'affiche alors que le bloc correspondant. Absent côté rencontre
  // MJ (les attaques de créatures ne sont pas typées, voir types/gameData.ts::CreatureAttaque) : tous
  // les blocs sont alors montrés, comme sur la carte physique, au MJ de lire celui qui convient.
  typeAttaque?: TypeBlocCarte | null
  onClose: () => void
  gmControls?: CarteCritiqueGmControls
}

const toolbarBtnStyle: React.CSSProperties = {
  padding: '6px 12px', borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13,
  border: '1px solid rgba(201,168,76,0.35)', background: 'rgba(255,255,255,0.02)', color: 'rgba(245,236,215,0.7)',
}
const checkboxStyle: React.CSSProperties = { width: 17, height: 17, cursor: 'pointer', flexShrink: 0 }

// Modale de tirage — partagée entre le Mode de jeu (jets du joueur) et les outils MJ (rencontre,
// tableau de bord), pour que "voir la carte tirée" se comporte et se présente toujours de la même
// façon (même esprit que CarteVoieModal, pas de portail : position fixed suffit, comme là-bas).
export default function CarteCritiqueModal({ carte, categorie, typeAttaque, onClose, gmControls }: Props) {
  const { t } = useTranslation()
  const blocs = blocsPertinents(carte, typeAttaque)
  const estEchec = categorie === 'echec'
  const accent = estEchec ? 'rgba(255,110,110,0.9)' : 'var(--tdr-gold)'
  const accentBorder = estEchec ? 'rgba(220,80,80,0.5)' : 'rgba(201,168,76,0.5)'
  const accentBorderFaint = estEchec ? 'rgba(220,80,80,0.3)' : 'rgba(201,168,76,0.25)'

  // Édition de texte : locale à la modale, jamais initialisée tant qu'on n'a pas cliqué "Éditer" — la
  // carte dépliée reste en lecture seule par défaut, même avec gmControls fourni.
  const [editing, setEditing] = useState(false)
  const [blocsEdit, setBlocsEdit] = useState<BlocCarteCritique[]>([])
  const commencerEdition = () => { setBlocsEdit(carte.blocs.map(b => ({ ...b }))); setEditing(true) }
  const changerTexte = (i: number, texte: string) => setBlocsEdit(prev => prev.map((b, idx) => idx === i ? { ...b, texte } : b))
  const reinitialiserTexte = () => gmControls && setBlocsEdit(gmControls.livreBlocs.map(b => ({ ...b })))
  const enregistrer = () => { gmControls?.onSaveTexte(blocsEdit); setEditing(false) }

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
        border: `1px solid ${accentBorder}`,
        borderRadius: 8,
        maxWidth: 440,
        width: '100%',
        maxHeight: '85vh',
        overflowY: 'auto',
        boxShadow: '0 12px 64px rgba(0,0,0,0.9)',
      }}>
        <div style={{
          padding: '16px 20px 12px',
          borderBottom: `1px solid ${accentBorderFaint}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: accent, opacity: 0.85 }}>
              {estEchec ? `💀 ${t('carteCritique.echecTitre')}` : `✨ ${t('carteCritique.reussiteTitre')}`}
            </div>
            <h2 style={{ margin: '2px 0 0', fontSize: 18, fontWeight: 700, color: accent }}>
              {t('carteCritique.numero', { n: carte.numero })}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(245,236,215,0.5)', fontSize: 20, lineHeight: 1, padding: '0 2px' }}
            aria-label="Fermer"
          >×</button>
        </div>

        {/* Bandeau MJ : présent uniquement quand gmControls est fourni (CartesCritiquesTab), jamais côté
            joueur ni en combat — activer/désactiver la carte est immédiat, éditer bascule le contenu
            ci-dessous en formulaire. */}
        {gmControls && (
          <div style={{
            padding: '10px 20px', borderBottom: `1px solid ${accentBorderFaint}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          }}>
            <label
              style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: 'rgba(245,236,215,0.75)' }}
              title={gmControls.active ? t('gmMode.cartesCritiques.desactiverCarte') : t('gmMode.cartesCritiques.reactiverCarte')}
            >
              <input type="checkbox" checked={gmControls.active} onChange={gmControls.onToggleActive} style={checkboxStyle} />
              {t('gmMode.cartesCritiques.carteActive')}
            </label>
            {!editing && (
              <button onClick={commencerEdition} style={toolbarBtnStyle}>✎ {t('gmMode.cartesCritiques.editer')}</button>
            )}
          </div>
        )}

        {editing ? (
          <div style={{ padding: '14px 20px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {blocsEdit.map((b, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(245,236,215,0.45)' }}>
                  {LABEL_TYPE[b.type]}
                </span>
                <textarea
                  value={b.texte} onChange={e => changerTexte(i, e.target.value)} rows={3}
                  style={{
                    background: 'rgba(255,255,255,0.03)', border: `1px solid ${accentBorderFaint}`, borderRadius: 5,
                    color: 'rgba(245,236,215,0.9)', fontSize: 15, padding: '9px 11px', fontFamily: 'inherit', resize: 'vertical',
                  }}
                />
              </div>
            ))}
            <div style={{ fontSize: 11.5, color: 'rgba(245,236,215,0.4)', lineHeight: 1.5 }}>
              {t('gmMode.cartesCritiques.aideEdition')}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
              <button onClick={reinitialiserTexte} style={toolbarBtnStyle}>{t('gmMode.cartesCritiques.reinitialiser')}</button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setEditing(false)} style={toolbarBtnStyle}>{t('gmMode.cartesCritiques.annuler')}</button>
                <button onClick={enregistrer} style={{ ...toolbarBtnStyle, borderColor: accentBorder, color: accent }}>
                  {t('gmMode.cartesCritiques.enregistrer')}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: '14px 20px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {blocs.map((b, i) => (
              <div key={i} style={{ borderLeft: `2px solid ${accentBorder}`, paddingLeft: 12 }}>
                {/* Toujours affiché, y compris "Global" sur une carte à un seul bloc : c'est une
                    information du livre (l'effet s'applique quel que soit le type d'attaque), pas une
                    étiquette redondante à masquer. */}
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(245,236,215,0.45)', marginBottom: 4 }}>
                  {LABEL_TYPE[b.type]}
                </div>
                <div style={{ fontSize: 15, lineHeight: 1.55, color: 'rgba(245,236,215,0.9)' }}>{b.texte}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
