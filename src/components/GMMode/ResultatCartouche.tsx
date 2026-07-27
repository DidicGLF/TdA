import { useTranslation } from 'react-i18next'
import type { RollResult } from '../../utils/combat'
import { ICONES_TYPES_DEGATS } from '../../utils/damageTypes'

const GOLD = '#c9a84c'
const PARCHMENT = '#f5ecd7'
const LINK_COLOR = 'rgba(200,170,255,0.85)'
const DIM = 'rgba(245,236,215,0.45)'
const RED = 'rgba(255,150,150,0.95)'
const GREEN = 'rgba(120,220,140,0.95)'

interface Props {
  // Nom de l'AUTRE entité impliquée — jamais celui de la carte sous laquelle ce cartouche est affiché,
  // déjà visible juste au-dessus (inutile de le répéter).
  autrePartie: string
  // 'cible' : cette carte vise autrePartie (cas créature — son propre ciblage, avec son propre jet).
  // 'attaquant' : autrePartie vise CETTE carte (cas PJ — reconstitué par recherche inverse dans
  // CombatTab, un PJ n'ayant pas de jet propre). Un PJ peut avoir plusieurs attaquants simultanés
  // (plusieurs cartouches empilées) : le nom affiché doit donc toujours être celui de l'autre partie,
  // jamais un mot générique, sous peine de rendre les cartouches empilés indistinguables entre eux.
  // 'mutuel' : ciblage réciproque (cette carte vise autrePartie ET autrePartie vise cette carte) — les
  // deux résultats (resultat + resultatInverse) sont regroupés dans UN SEUL cartouche plutôt que d'en
  // empiler deux quasi identiques (même nom en tête, l'un juste sous l'autre) pour la même relation.
  role: 'cible' | 'attaquant' | 'mutuel'
  resultat: RollResult | null
  resultatInverse?: RollResult | null
}

function BlocResultat({ resultat }: { resultat: RollResult | null | undefined }) {
  const { t } = useTranslation()
  const ligneAtk = resultat?.jetTotal !== undefined
  // rdAppliquee undefined alors que degatsTotal est défini : cible PJ (voir resoudreAttaque dans
  // combat.ts) — la RD n'est plus résolue ici, pas de faux "RD 0" à afficher, juste le montant brut.
  const ligneDm = !!resultat && !resultat.toucheRate && resultat.degatsAppliques !== undefined
  const detailDm = !!resultat && resultat.degatsTotal !== undefined && resultat.rdAppliquee !== undefined
  if (!ligneAtk && !ligneDm) return null
  return (
    <>
      {ligneAtk && (
        <div style={{ fontSize: 11, lineHeight: 1.4 }}>
          <span style={{ color: LINK_COLOR, fontWeight: 700 }}>ATK {resultat!.jetTotal}</span>
          <span style={{ color: DIM }}> — </span>
          <span style={{ color: GOLD, fontWeight: 700 }}>DEF {resultat!.cibleDef}</span>
          <span style={{ color: DIM }}> = </span>
          <span style={{ color: resultat!.toucheRate ? RED : GREEN, fontWeight: 700 }}>
            {resultat!.toucheRate ? t('gmMode.bataille.rateCourt') : t('gmMode.bataille.toucheCourt')}
          </span>
        </div>
      )}
      {ligneDm && (
        <div style={{ fontSize: 11, lineHeight: 1.4 }}>
          {detailDm ? (
            <>
              <span style={{ color: LINK_COLOR, fontWeight: 700 }}>DM {resultat!.degatsTotal}</span>
              <span style={{ color: DIM }}> — </span>
              <span style={{ color: GOLD, fontWeight: 700 }}>{t('gmMode.bataille.rdLabel')} {resultat!.rdAppliquee ?? 0}</span>
              <span style={{ color: DIM }}> = </span>
              <span style={{ color: GREEN, fontWeight: 700 }}>{resultat!.degatsAppliques} DM</span>
            </>
          ) : (
            <span style={{ color: GREEN, fontWeight: 700 }}>
              {resultat!.typeDegats !== undefined && `${ICONES_TYPES_DEGATS[resultat!.typeDegats]} `}{resultat!.degatsAppliques} DM
            </span>
          )}
        </div>
      )}
    </>
  )
}

// Résumé compact d'une relation de ciblage + son dernier résultat, affiché SOUS une carte repliée (voir
// CombatCard/PJCard) — remplace pour ces cartes le lien SVG plein écran de CombatTab, réservé aux cartes
// dépliées : avec beaucoup de cibles simultanées, ces lignes se croisaient et sortaient du cadre au
// scroll, alors qu'un encart posé directement sous chaque carte suit naturellement sa mise en page.
export default function ResultatCartouche({ autrePartie, role, resultat, resultatInverse }: Props) {
  const { t } = useTranslation()
  const label = t(role === 'cible' ? 'gmMode.bataille.cible' : 'gmMode.bataille.attaquant')

  return (
    <div style={{
      marginTop: 6, padding: '4px 7px', borderRadius: 5,
      background: 'rgba(0,0,0,0.28)', border: '1px solid rgba(201,168,76,0.15)',
    }}>
      <div style={{ fontSize: 11, color: PARCHMENT, opacity: 0.75, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {role === 'cible' ? <>{label} → {autrePartie}</> : role === 'attaquant' ? <>{autrePartie} → {label}</> : <>⇄ {autrePartie}</>}
      </div>
      <BlocResultat resultat={resultat} />
      {role === 'mutuel' && resultatInverse !== undefined && (
        <div style={{ marginTop: 3, paddingTop: 3, borderTop: '1px solid rgba(201,168,76,0.12)' }}>
          <BlocResultat resultat={resultatInverse} />
        </div>
      )}
    </div>
  )
}
