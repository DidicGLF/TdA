import { useTranslation } from 'react-i18next'
import { DiceIcon } from '../GameMode/DiceIcon'
import type { HistoriqueEntree } from '../../utils/combat'

const GOLD = '#c9a84c'
const PARCHMENT = '#f5ecd7'
const PURPLE = 'rgba(200,170,255,0.9)'

interface Props {
  entree: HistoriqueEntree
  // Pulse blanc — n'a de sens que sur la toute dernière entrée (celle qui vient d'être ajoutée), voir
  // CombatCard.tsx/PJCard.tsx qui ne le passent qu'à historique[0].
  flash?: boolean
}

// Une ligne du journal de combat affiché sous une carte MJ (voir HistoriqueEntree/ajouterHistorique
// dans combat.ts) : réutilisé par CombatCard.tsx (créatures/compagnons) et PJCard.tsx, dans une liste
// défilante conservant toutes les actions de la session — reprend la présentation (icône de dé + détail
// + total) de l'ancien bloc "dernier résultat", en distinguant 'attaque' (cette carte a agi, doré) de
// 'subi' (cette carte a été touchée par quelqu'un d'autre, violet) par la couleur d'accent.
export default function HistoriqueEntreeBloc({ entree, flash }: Props) {
  const { t } = useTranslation()
  const { type, resultat } = entree
  const accent = type === 'attaque' ? GOLD : PURPLE

  return (
    <div style={{
      border: `1px solid ${accent}`, borderRadius: 6, padding: 10,
      background: type === 'attaque' ? 'rgba(201,168,76,0.08)' : 'rgba(160,120,255,0.08)',
      display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: accent }}>
        {type === 'attaque' ? (
          <>
            {resultat.attaqueNom}
            {resultat.cibleNom && <span style={{ fontWeight: 400, opacity: 0.7 }}> → {resultat.cibleNom}</span>}
          </>
        ) : (
          <>
            {resultat.attaquantNom ?? '?'}
            <span style={{ fontWeight: 400, opacity: 0.7 }}> → {t('gmMode.bataille.subiLabel')}</span>
          </>
        )}
      </div>
      {resultat.jetSides !== undefined && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, opacity: 0.55, width: 76, flexShrink: 0 }}>{t('gmMode.bataille.jetAttaque')}</span>
          <DiceIcon sides={resultat.jetSides} size={20} color={flash ? '#fff' : PARCHMENT} />
          <span style={{ fontSize: 15, color: flash ? '#fff' : PARCHMENT, transition: 'color 0.2s' }}>{resultat.jetRoll}</span>
          {resultat.jetModifier !== undefined && (
            <span style={{ fontSize: 13, opacity: 0.6 }}>{resultat.jetModifier >= 0 ? '+' : ''}{resultat.jetModifier}</span>
          )}
          <span style={{ opacity: 0.4, fontSize: 13 }}>=</span>
          <span style={{ fontSize: 17, fontWeight: 700, color: flash ? '#fff' : accent, transition: 'color 0.2s' }}>{resultat.jetTotal}</span>
        </div>
      )}
      {resultat.toucheRate ? (
        <div style={{ fontSize: 12, color: 'rgba(245,236,215,0.5)', fontStyle: 'italic' }}>
          {t('gmMode.bataille.attaqueRatee')}
        </div>
      ) : (
        <>
          {resultat.degatsSides !== undefined && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, opacity: 0.55, width: 76, flexShrink: 0 }}>{t('gmMode.bataille.degats')}</span>
              <DiceIcon sides={resultat.degatsSides} size={20} color={flash ? '#fff' : PARCHMENT} />
              <span style={{ fontSize: 13, color: flash ? '#fff' : PARCHMENT, transition: 'color 0.2s' }}>{resultat.degatsRollDisplay}</span>
              <span style={{ opacity: 0.4, fontSize: 13 }}>=</span>
              <span style={{ fontSize: 17, fontWeight: 700, color: flash ? '#fff' : accent, transition: 'color 0.2s' }}>{resultat.degatsTotal}</span>
            </div>
          )}
          {resultat.degatsAppliques !== undefined && (
            <div style={{ fontSize: 12, color: PURPLE }}>
              {type === 'attaque'
                ? t('gmMode.bataille.degatsAppliques', { nom: resultat.cibleNom, degats: resultat.degatsAppliques })
                : t('gmMode.bataille.degatsSubis', { degats: resultat.degatsAppliques })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
