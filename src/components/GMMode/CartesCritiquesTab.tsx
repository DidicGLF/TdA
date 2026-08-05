import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useGameData } from '../../context/GameDataContext'
import { CARTES_ECHECS, CARTES_REUSSITES } from '../../data/cartesCritiques'
import type { BlocCarteCritique, CarteCritique, CategorieCarteCritique } from '../../data/cartesCritiques'
import type { CarteCritiquePerso } from '../../utils/cartesCritiquesPerso'
import { piocherCarteActive } from '../../utils/cartesCritiquesPerso'
import CarteCritiqueModal from '../CarteCritiqueModal'

const GOLD = '#c9a84c'
const PARCHMENT = '#f5ecd7'
const SECTION_BORDER = 'rgba(201,168,76,0.2)'

// Court intitulé d'une carte pour la liste de référence : tout ce qui précède le premier ":" / "!" /
// "..." (les trois formes de ponctuation utilisées par le livre pour introduire l'effet), à défaut les
// 50 premiers caractères — juste un repère pour retrouver une carte au clic, jamais affiché tel quel
// dans la modale (voir CarteCritiqueModal, qui montre le texte complet).
function resumeCarte(carte: CarteCritique): string {
  const texte = carte.blocs[0]?.texte ?? ''
  const m = texte.match(/^(.*?)(:|!|\.\.\.)/)
  return (m ? m[1] : texte).trim().slice(0, 50)
}

const listeBtnStyle: React.CSSProperties = {
  textAlign: 'left', padding: '11px 16px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
  border: `1px solid ${SECTION_BORDER}`, background: 'rgba(255,255,255,0.02)', color: PARCHMENT, fontSize: 16,
}

// Outil MJ autonome : tirage aléatoire (bouton, uniquement parmi les cartes actives) ou consultation
// directe d'une carte précise par son numéro (liste de référence, où toute carte reste consultable même
// désactivée, juste estompée) — utile pour une attaque de créature, qui n'est jamais typée contact/
// distance/magique (voir CreatureAttaque dans types/gameData.ts), contrairement aux jets du joueur en
// Mode de jeu qui déclenchent déjà un tirage depuis leur propre affichage de critique. Activer/désactiver
// une carte et corriger son texte se fait sur la carte dépliée (voir gmControls passé à
// CarteCritiqueModal), pas dans cette liste — qui reste sinon la simple liste de repère qu'elle a
// toujours été. Les changements vivent dans les surcharges perso du MJ (voir utils/cartesCritiquesPerso.ts)
// et sont lus par TOUS les tirages de l'application (Mode de jeu compris, via GameDataContext).
export default function CartesCritiquesTab() {
  const { t } = useTranslation()
  const { cartesCritiquesEchecs, setCartesCritiquesEchecs, cartesCritiquesReussites, setCartesCritiquesReussites } = useGameData()
  // Seul (categorie, numero) est retenu, jamais la carte elle-même : sinon, activer/désactiver ou
  // corriger le texte depuis la carte dépliée mettrait à jour le contexte mais laisserait affichée une
  // ancienne copie figée, désynchronisée de la case à cocher qu'on vient pourtant de cocher.
  const [affichee, setAffichee] = useState<{ categorie: CategorieCarteCritique; numero: number } | null>(null)

  const listesFusionnees: Record<CategorieCarteCritique, CarteCritiquePerso[]> = { echec: cartesCritiquesEchecs, reussite: cartesCritiquesReussites }
  const listesLivre: Record<CategorieCarteCritique, CarteCritique[]> = { echec: CARTES_ECHECS, reussite: CARTES_REUSSITES }
  const setters: Record<CategorieCarteCritique, typeof setCartesCritiquesEchecs> = { echec: setCartesCritiquesEchecs, reussite: setCartesCritiquesReussites }

  const tirer = (categorie: CategorieCarteCritique) => setAffichee({ categorie, numero: piocherCarteActive(listesFusionnees[categorie]).numero })
  const voir = (categorie: CategorieCarteCritique, numero: number) => setAffichee({ categorie, numero })
  const toggleActive = (categorie: CategorieCarteCritique, numero: number) => {
    setters[categorie](prev => prev.map(c => c.numero === numero ? { ...c, active: !c.active } : c))
  }
  const enregistrerTexte = (categorie: CategorieCarteCritique, numero: number, blocs: BlocCarteCritique[]) => {
    setters[categorie](prev => prev.map(c => c.numero === numero ? { ...c, blocs } : c))
  }

  const carteAffichee = affichee ? listesFusionnees[affichee.categorie].find(c => c.numero === affichee.numero) : null

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <button onClick={() => tirer('echec')} style={{
          flex: 1, padding: '16px', borderRadius: 8, cursor: 'pointer', fontFamily: "'Cinzel', serif",
          fontSize: 15, fontWeight: 700, letterSpacing: '0.04em',
          border: '1px solid rgba(220,80,80,0.5)', background: 'rgba(220,80,80,0.1)', color: '#ff8080',
        }}>
          🎴 {t('gmMode.cartesCritiques.tirerEchec')}
        </button>
        <button onClick={() => tirer('reussite')} style={{
          flex: 1, padding: '16px', borderRadius: 8, cursor: 'pointer', fontFamily: "'Cinzel', serif",
          fontSize: 15, fontWeight: 700, letterSpacing: '0.04em',
          border: `1px solid ${GOLD}`, background: 'rgba(201,168,76,0.1)', color: GOLD,
        }}>
          🎴 {t('gmMode.cartesCritiques.tirerReussite')}
        </button>
      </div>

      <div style={{ fontSize: 13.5, color: 'rgba(245,236,215,0.4)', marginBottom: 16, lineHeight: 1.5 }}>
        {t('gmMode.cartesCritiques.aide')}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {(['echec', 'reussite'] as const).map(categorie => (
          <div key={categorie}>
            <div style={{ fontSize: 15, fontWeight: 700, color: categorie === 'echec' ? '#ff8080' : GOLD, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
              {t(categorie === 'echec' ? 'carteCritique.echecTitre' : 'carteCritique.reussiteTitre')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {listesFusionnees[categorie].map(carte => (
                <button
                  key={carte.numero} onClick={() => voir(categorie, carte.numero)}
                  style={{ ...listeBtnStyle, opacity: carte.active ? 1 : 0.4, textDecoration: carte.active ? 'none' : 'line-through' }}
                >
                  <span style={{ opacity: 0.5, marginRight: 6 }}>{carte.numero}.</span>{resumeCarte(carte)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {affichee && carteAffichee && (
        <CarteCritiqueModal
          carte={carteAffichee}
          categorie={affichee.categorie}
          onClose={() => setAffichee(null)}
          gmControls={{
            active: carteAffichee.active,
            onToggleActive: () => toggleActive(affichee.categorie, affichee.numero),
            livreBlocs: listesLivre[affichee.categorie].find(c => c.numero === affichee.numero)?.blocs ?? carteAffichee.blocs,
            onSaveTexte: blocs => enregistrerTexte(affichee.categorie, affichee.numero, blocs),
          }}
        />
      )}
    </div>
  )
}
