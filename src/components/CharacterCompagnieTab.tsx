import { useTranslation } from 'react-i18next'
import type { Compagnie, CodeCompagnie, DomaineCapacite } from '../utils/compagnie'
import {
  DEVISE_CODE, DESCRIPTION_CODE, VOIE_COMPAGNIE, capaciteAuRang, niveauDepuisRenommee,
  descriptionCapacite, SEUILS_RENOMMEE,
} from '../utils/compagnie'
import { peutSePorterVolontaire, missionMiseEnAvant, COULEUR_TYPE_MISSION, COULEUR_STATUT } from '../utils/missions'
import { useImage } from '../hooks/useImage'
import type { useReseauClient } from '../hooks/useReseauClient'

const GOLD = '#c9a84c'
const PARCHMENT = '#f5ecd7'
const SECTION_BORDER = 'rgba(201,168,76,0.2)'
const COULEUR_DOMAINE: Record<DomaineCapacite, string> = {
  arsenal: '#c67a3d', influence: '#a98ff0', tactique: '#5fb0a8',
}

const sectionTitreStyle: React.CSSProperties = {
  fontSize: 13, fontWeight: 700, color: GOLD, textTransform: 'uppercase',
  letterSpacing: '0.08em', marginBottom: 10, fontFamily: "'Cinzel', serif",
}
const panelStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)', border: `1px solid ${SECTION_BORDER}`,
  borderRadius: 8, padding: '16px 18px', marginBottom: 14,
}

interface Props {
  compagnie: Compagnie
  nomPersonnage: string
  reseau: ReturnType<typeof useReseauClient>
}

function MissionIllustration({ cle }: { cle?: string }) {
  const src = useImage(cle)
  if (!src) return null
  return <img src={src} alt="" style={{ width: '100%', maxHeight: 140, objectFit: 'cover', borderRadius: 5, marginBottom: 8 }} />
}

// Petit rappel de l'illustration sur une mission réduite — juste assez pour la reconnaître d'un coup
// d'œil, sans reprendre toute la largeur de la ligne compacte (l'objectif de la réduction).
function MissionIllustrationMini({ cle }: { cle?: string }) {
  const src = useImage(cle)
  if (!src) return null
  return <img src={src} alt="" style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
}

// Aperçu en lecture seule de la compagnie, sur la fiche d'un personnage qui en est membre (voir
// showCompagnieTab dans App.tsx — présent dès que son nom figure dans compagnie.membres, fonction ou
// non). Volontairement une simple page de données empilées façon Notes (pas de mise en page sur fond de
// fiche imprimée, pas de calibrage) : contrairement à Recto/Verso/Voies, cet onglet n'a pas encore de
// vraie maquette, l'avertissement en tête le dit explicitement. Reprend le même contenu que
// CompagnieTab.tsx côté MJ (voir gmMode.compagnie.* dans les locales, partagé plutôt que redupliqué),
// mais en lecture seule et sans le panneau Capacités actives séparé — déjà lisible directement sur les
// rangs débloqués de la voie ci-dessous.
export default function CharacterCompagnieTab({ compagnie, nomPersonnage, reseau }: Props) {
  const { t } = useTranslation()
  const niveau = niveauDepuisRenommee(compagnie.renommee)
  const estVous = (nom: string) => nom.trim().toLowerCase() === nomPersonnage.trim().toLowerCase()
  // Préfère la vue réseau (mise à jour en direct, voir 'compagnie-missions-maj') dès qu'elle a été reçue
  // au moins une fois ; sinon la donnée locale/importée avec le reste de la compagnie — jamais rien du
  // tout tant que la connexion n'a pas encore poussé sa première mise à jour.
  const missions = reseau.compagnieMissions ?? compagnie.missions
  const missionMiseEnAvantId = missionMiseEnAvant(missions)

  const rangArsenalFixe = compagnie.code && compagnie.code !== 'anarchique'
    ? (() => { const i = VOIE_COMPAGNIE[compagnie.code as Exclude<CodeCompagnie, 'anarchique'>].findIndex(c => c.domaine === 'arsenal'); return i === -1 ? null : i + 1 })()
    : null
  const capacitesArsenalActives = compagnie.code
    ? Array.from({ length: niveau }, (_, i) => capaciteAuRang(compagnie, i + 1)).filter((c): c is NonNullable<typeof c> => !!c && c.domaine === 'arsenal')
    : []

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '20px 16px 60px' }}>
      <div style={{ fontSize: 11.5, fontStyle: 'italic', color: 'rgba(245,236,215,0.4)', textAlign: 'center', marginBottom: 18, lineHeight: 1.5 }}>
        🚧 {t('compagnieApercu.avertissement')}
      </div>

      {/* Identité */}
      <div style={panelStyle}>
        <div style={sectionTitreStyle}>{t('gmMode.compagnie.identite')}</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: PARCHMENT, fontFamily: "'Cinzel', serif", marginBottom: 4 }}>
          {compagnie.nom || t('gmMode.compagnie.nomPlaceholder')}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12, color: 'rgba(245,236,215,0.5)', marginBottom: compagnie.histoire ? 10 : 0 }}>
          <span>{t(`gmMode.compagnie.taille.${compagnie.taille}`)}</span>
          {compagnie.siege && <span>· {compagnie.siege}</span>}
        </div>
        {compagnie.histoire && (
          <div style={{ fontSize: 12.5, color: 'rgba(245,236,215,0.65)', lineHeight: 1.55, borderTop: `1px dashed ${SECTION_BORDER}`, paddingTop: 10 }}>
            {compagnie.histoire}
          </div>
        )}
      </div>

      {/* Renommée & niveau */}
      <div style={panelStyle}>
        <div style={sectionTitreStyle}>{t('gmMode.compagnie.renommeeTitre')}</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
          <div style={{ fontSize: 30, fontWeight: 700, color: PARCHMENT, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {compagnie.renommee}
            <span style={{ fontSize: 11, fontWeight: 400, color: 'rgba(245,236,215,0.45)', marginLeft: 6 }}>
              {t('gmMode.compagnie.renommeeUnite')}
            </span>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(201,168,76,0.1)',
            border: `1px solid ${GOLD}`, borderRadius: 6, padding: '5px 12px',
          }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: GOLD, fontFamily: "'Cinzel', serif" }}>{niveau}</span>
            <span style={{ fontSize: 9.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(245,236,215,0.5)' }}>
              {t('gmMode.compagnie.niveauLabel')}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {SEUILS_RENOMMEE.map(seuil => (
            <div key={seuil} style={{
              flex: 1, height: 5, borderRadius: 3,
              background: compagnie.renommee >= seuil ? GOLD : 'rgba(255,255,255,0.08)',
            }} />
          ))}
        </div>
      </div>

      {/* Code */}
      <div style={panelStyle}>
        <div style={sectionTitreStyle}>{t('gmMode.compagnie.codeTitre')}</div>
        {!compagnie.code ? (
          <div style={{ fontSize: 12, color: 'rgba(245,236,215,0.4)', fontStyle: 'italic' }}>{t('compagnieApercu.sansCode')}</div>
        ) : (
          <div>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: 15, fontWeight: 700, color: GOLD, marginBottom: 4 }}>
              {t(`gmMode.compagnie.code.${compagnie.code}`)}
            </div>
            <div style={{ fontSize: 12, fontStyle: 'italic', color: 'rgba(245,236,215,0.6)', marginBottom: 6 }}>
              {DEVISE_CODE[compagnie.code]}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(245,236,215,0.5)', lineHeight: 1.5 }}>
              {DESCRIPTION_CODE[compagnie.code]}
            </div>
          </div>
        )}
      </div>

      {/* Voie de compagnie */}
      {compagnie.code && (
        <div style={panelStyle}>
          <div style={sectionTitreStyle}>{t('gmMode.compagnie.voieTitre')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[1, 2, 3, 4, 5].map(rang => {
              const debloque = rang <= niveau
              const cap = capaciteAuRang(compagnie, rang)
              return (
                <div key={rang} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 6,
                  border: `1px solid ${debloque ? 'rgba(201,168,76,0.3)' : SECTION_BORDER}`,
                  background: debloque ? 'rgba(201,168,76,0.05)' : 'rgba(255,255,255,0.015)',
                  opacity: debloque ? 1 : 0.55,
                }}>
                  <span style={{ fontSize: 11, color: 'rgba(245,236,215,0.5)', width: 56, flexShrink: 0 }}>
                    {t('gmMode.compagnie.rangLabel', { n: rang })}
                  </span>
                  {cap ? (
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: COULEUR_DOMAINE[cap.domaine], flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: debloque ? GOLD : PARCHMENT }}>{cap.nom}</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(245,236,215,0.45)', marginTop: 3, lineHeight: 1.4 }}>
                        {descriptionCapacite(cap.nom, compagnie.code)}
                      </div>
                    </div>
                  ) : (
                    <span style={{ fontSize: 11, color: 'rgba(245,236,215,0.3)', fontStyle: 'italic' }}>
                      {t('compagnieApercu.aucuneCapaciteActive')}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Membres */}
      {compagnie.membres.length > 0 && (
        <div style={panelStyle}>
          <div style={sectionTitreStyle}>{t('gmMode.compagnie.membresTitre')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {compagnie.membres.map((m, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 5,
                background: estVous(m.nom) ? 'rgba(201,168,76,0.1)' : 'rgba(255,255,255,0.015)',
                border: `1px solid ${estVous(m.nom) ? 'rgba(201,168,76,0.4)' : SECTION_BORDER}`,
              }}>
                <span style={{ fontSize: 13, color: estVous(m.nom) ? GOLD : PARCHMENT, fontWeight: estVous(m.nom) ? 700 : 400 }}>
                  {m.nom}{estVous(m.nom) && ` ${t('compagnieApercu.vousMarqueur')}`}
                </span>
                {m.fonction && (
                  <span style={{ fontSize: 10.5, color: 'rgba(245,236,215,0.45)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {t(`gmMode.compagnie.fonction.${m.fonction}`)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Missions — visibles hors-ligne (données locales/importées, comme le reste de la compagnie),
          mais se porter volontaire nécessite d'être connecté au réseau local du MJ (voir
          reseau.envoyerVolontaireMission, 'mission-volontaire' dans reseauProtocole.ts). */}
      {missions.length > 0 && (
        <div style={panelStyle}>
          <div style={sectionTitreStyle}>{t('gmMode.missions.titrePJ')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {missions.map(mission => {
              const dejaVolontaire = mission.volontaires.some(v => v.toLowerCase() === nomPersonnage.trim().toLowerCase())
              const peutVolontaire = peutSePorterVolontaire(mission, nomPersonnage) && reseau.connecte
              const missionResolue = mission.statut === 'reussie' || mission.statut === 'echouee'

              if (mission.id !== missionMiseEnAvantId) {
                return (
                  <div key={mission.id} style={{
                    border: `1px solid ${SECTION_BORDER}`, borderLeft: `3px solid ${COULEUR_TYPE_MISSION[mission.type]}`, borderRadius: 6,
                    padding: '6px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <MissionIllustrationMini cle={mission.illustration} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: PARCHMENT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mission.nom}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: COULEUR_TYPE_MISSION[mission.type], flexShrink: 0 }}>{t(`gmMode.missions.type.${mission.type}`)}</span>
                    </div>
                    <span style={{
                      fontSize: 11, fontStyle: 'italic', flexShrink: 0,
                      color: missionResolue ? COULEUR_STATUT[mission.statut] : 'rgba(245,236,215,0.4)',
                      fontWeight: missionResolue ? 700 : 400,
                    }}>
                      {missionResolue
                        ? t(`gmMode.missions.statut.${mission.statut}`)
                        : dejaVolontaire ? `✓ ${t('gmMode.missions.dejaVolontaire')}` : t(`gmMode.missions.statut.${mission.statut}`)}
                    </span>
                  </div>
                )
              }

              return (
                <div key={mission.id} style={{ border: `1px solid ${SECTION_BORDER}`, borderLeft: `3px solid ${COULEUR_TYPE_MISSION[mission.type]}`, borderRadius: 6, padding: '10px 12px' }}>
                  <MissionIllustration cle={mission.illustration} />
                  <div style={{ fontSize: 15, fontWeight: 700, color: PARCHMENT }}>{mission.nom}</div>
                  <div style={{ fontSize: 11, color: 'rgba(245,236,215,0.5)', margin: '2px 0 6px' }}>
                    <span style={{ color: COULEUR_TYPE_MISSION[mission.type], fontWeight: 700 }}>{t(`gmMode.missions.type.${mission.type}`)}</span> · 🏅 {t('gmMode.missions.recompenseRenommee', { n: mission.recompenseRenommee })}
                    {' · '}{t('gmMode.missions.slotsLabel', { n: mission.volontaires.length, total: mission.nombreParticipants })}
                  </div>
                  {mission.description && (
                    <div style={{ fontSize: 12.5, color: 'rgba(245,236,215,0.6)', lineHeight: 1.5, marginBottom: 8 }}>
                      {mission.description}
                    </div>
                  )}
                  {mission.buts.length > 0 && (
                    <ul style={{ margin: '0 0 8px', paddingLeft: 18, fontSize: 12, color: 'rgba(245,236,215,0.55)' }}>
                      {mission.buts.map(but => <li key={but.id}>{but.texte}</li>)}
                    </ul>
                  )}
                  {dejaVolontaire ? (
                    <span style={{ fontSize: 12.5, color: GOLD }}>✓ {t('gmMode.missions.dejaVolontaire')}</span>
                  ) : mission.statut !== 'proposee' ? (
                    <span style={{ fontSize: 12, color: 'rgba(245,236,215,0.4)', fontStyle: 'italic' }}>
                      {t(`gmMode.missions.statut.${mission.statut}`)}
                    </span>
                  ) : (
                    <button
                      onClick={() => reseau.envoyerVolontaireMission(mission.compagnieId, mission.id)}
                      disabled={!peutVolontaire}
                      title={!reseau.connecte ? t('gmMode.missions.connexionRequise') : undefined}
                      style={{
                        padding: '6px 14px', borderRadius: 4, fontSize: 13, fontFamily: 'inherit',
                        cursor: peutVolontaire ? 'pointer' : 'default', opacity: peutVolontaire ? 1 : 0.4,
                        border: '1px solid rgba(201,168,76,0.4)', background: 'rgba(201,168,76,0.1)', color: GOLD,
                      }}
                    >
                      🙋 {t('gmMode.missions.sePorterVolontaire')}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Arsenal */}
      <div style={panelStyle}>
        <div style={sectionTitreStyle}>{t('gmMode.compagnie.arsenalTitre')}</div>
        {!compagnie.code ? (
          <div style={{ fontSize: 12, color: 'rgba(245,236,215,0.4)', fontStyle: 'italic' }}>{t('gmMode.compagnie.arsenalAucunCode')}</div>
        ) : capacitesArsenalActives.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {capacitesArsenalActives.map(cap => (
              <div key={cap.nom} style={{ fontSize: 12.5, color: 'rgba(245,236,215,0.7)', lineHeight: 1.5 }}>
                <strong style={{ color: GOLD }}>{cap.nom}</strong> — {descriptionCapacite(cap.nom, compagnie.code)}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'rgba(245,236,215,0.4)' }}>
            🔒 {rangArsenalFixe
              ? t('gmMode.compagnie.arsenalVerrouilleRang', { n: rangArsenalFixe })
              : t('gmMode.compagnie.arsenalVerrouille')}
          </div>
        )}
      </div>
    </div>
  )
}
