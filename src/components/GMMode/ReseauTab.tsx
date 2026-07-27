import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { demarrerServeurReseau, arreterServeurReseau, etatServeurReseau, envoyerATousReseau, ecouterReseau } from '../../utils/reseau'
import type { EvenementReseau } from '../../utils/reseau'
import { decoderMessage, COULEUR_JOURNAL } from '../../utils/reseauProtocole'
import type { CategorieJournal } from '../../utils/reseauProtocole'

const GOLD = '#c9a84c'
const PARCHMENT = '#f5ecd7'
const SECTION_BORDER = 'rgba(201,168,76,0.2)'

const isTauri = () =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export interface LigneJournal {
  id: number
  texte: string
  categorie?: CategorieJournal
}

interface Props {
  // Portés par GMDashboard.tsx (pas un état local ici) : cet onglet est démonté/remonté à chaque
  // changement d'onglet du tableau de bord — un historique local serait vidé à chaque fois, contrairement
  // à demarre/port/code/clients qui, eux, se régénèrent tout seuls via etatServeurReseau() au montage.
  journal: LigneJournal[]
  ajouterJournal: (texte: string, categorie?: CategorieJournal) => void
}

// Écran de test de la plomberie réseau (voir src-tauri/src/reseau.rs et src/utils/reseau.ts) : démarrer/
// arrêter le serveur, voir les connexions et les messages bruts reçus. Pas de protocole de jeu ici —
// c'est la première étape du chantier réseau (branche feature/reseau-local), avant le code de partie,
// la découverte réseau côté joueur et l'échange de jets/dégâts.
export default function ReseauTab({ journal, ajouterJournal }: Props) {
  const { t } = useTranslation()
  const [demarre, setDemarre] = useState(false)
  const [port, setPort] = useState<number | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const [clients, setClients] = useState(0)
  const [messageATous, setMessageATous] = useState('')

  useEffect(() => {
    etatServeurReseau().then(etat => { setDemarre(etat.demarre); setPort(etat.port); setCode(etat.code); setClients(etat.clients) })
  }, [])

  // Correspondance connexion → nom de PJ, pour afficher "X inflige..." plutôt qu'un id de connexion sur
  // les lignes "degats" du journal. Suivi propre à cet écran (ReseauTab a sa propre écoute réseau,
  // indépendante de celle de CombatTab.tsx qui a la sienne pour ses propres besoins — pas de state à
  // partager entre les deux, chacun reconstruit ce dont il a besoin à partir des mêmes événements).
  const nomsRef = useRef<Record<number, string>>({})

  useEffect(() => {
    let annule = false
    const gerer = (e: EvenementReseau) => {
      if (e.type === 'connexion') { setClients(c => c + 1); ajouterJournal(t('gmMode.reseau.connexionEvt', { id: e.id }), 'connexion') }
      else if (e.type === 'deconnexion') { setClients(c => Math.max(0, c - 1)); ajouterJournal(t('gmMode.reseau.deconnexionEvt', { id: e.id }), 'deconnexion') }
      else if (e.type === 'decouverte') { ajouterJournal(`🔍 ${e.source} → code ${e.codeRecu ?? '?'} (${e.correspond ? 'OK' : 'ne correspond pas'})`, 'decouverte') }
      else if (e.type === 'message') {
        const message = decoderMessage(e.contenu)
        if (message?.type === 'identification') {
          nomsRef.current[e.id] = message.nom
          ajouterJournal(t('gmMode.reseau.identificationEvt', { nom: message.nom }), 'identification')
        } else if (message?.type === 'degats') {
          const nom = nomsRef.current[e.id] ?? `#${e.id}`
          ajouterJournal(t('gmMode.reseau.degatsEvt', { nom, montant: message.montant, type: message.typeDegats || t('gameMode.dmTypeGenerique') }), 'degats')
        } else {
          // Pas un message de protocole reconnu (texte de test brut, voir "message de test") : affiché tel quel.
          ajouterJournal(t('gmMode.reseau.messageEvt', { id: e.id, contenu: e.contenu }))
        }
      }
    }
    let desabonner = () => {}
    ecouterReseau(gerer).then(fn => { if (annule) fn(); else desabonner = fn })
    return () => { annule = true; desabonner() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleServeur = async () => {
    if (demarre) {
      await arreterServeurReseau()
      setDemarre(false)
      setPort(null)
      setCode(null)
      setClients(0)
    } else {
      const p = await demarrerServeurReseau()
      if (p !== null) {
        // demarrer_serveur ne renvoie que le port : le code n'est disponible qu'en relisant l'état
        // complet côté Rust, juste après (voir EtatServeurInfo).
        const etat = await etatServeurReseau()
        setDemarre(true)
        setPort(p)
        setCode(etat.code)
      }
    }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ fontSize: 18, fontFamily: "'Cinzel', serif", fontWeight: 700, color: GOLD, marginBottom: 6 }}>
        {t('gmMode.reseau.titre')}
      </div>
      <div style={{ fontSize: 13, color: 'rgba(245,236,215,0.6)', marginBottom: 16 }}>
        {t('gmMode.reseau.intro')}
      </div>

      {!isTauri() ? (
        <div style={{ padding: 12, borderRadius: 6, border: `1px solid ${SECTION_BORDER}`, color: 'rgba(245,236,215,0.5)', fontSize: 13 }}>
          {t('gmMode.reseau.horsTauri')}
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <button onClick={toggleServeur} style={{
              padding: '8px 16px', borderRadius: 4, cursor: 'pointer', fontSize: 14,
              border: `1px solid ${demarre ? 'rgba(220,80,80,0.5)' : 'rgba(120,220,140,0.5)'}`,
              background: demarre ? 'rgba(220,80,80,0.12)' : 'rgba(120,220,140,0.12)',
              color: demarre ? 'rgba(255,150,150,0.95)' : 'rgba(120,220,140,0.95)',
            }}>
              {demarre ? t('gmMode.reseau.arreter') : t('gmMode.reseau.demarrer')}
            </button>
            <span style={{ fontSize: 13, color: PARCHMENT }}>
              {demarre && port !== null ? t('gmMode.reseau.demarre', { port }) : t('gmMode.reseau.arrete')}
            </span>
          </div>

          {demarre && (
            <>
              {code !== null && (
                <div style={{
                  display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12,
                  padding: '10px 14px', borderRadius: 6, border: `1px solid ${SECTION_BORDER}`,
                  background: 'rgba(201,168,76,0.08)',
                }}>
                  <span style={{ fontSize: 12, color: 'rgba(245,236,215,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {t('gmMode.reseau.codePartie')}
                  </span>
                  <span style={{ fontSize: 28, fontWeight: 700, color: GOLD, letterSpacing: '0.15em', fontFamily: 'monospace' }}>
                    {code}
                  </span>
                </div>
              )}
              <div style={{ fontSize: 13, color: GOLD, marginBottom: 12 }}>
                {t('gmMode.reseau.clients', { count: clients })}
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <input
                  value={messageATous}
                  onChange={e => setMessageATous(e.target.value)}
                  placeholder={t('gmMode.reseau.envoyerATousPlaceholder')}
                  style={{
                    flex: 1, padding: '6px 10px', borderRadius: 4, border: `1px solid ${SECTION_BORDER}`,
                    background: 'rgba(0,0,0,0.25)', color: PARCHMENT, fontSize: 13,
                  }}
                />
                <button
                  onClick={() => { if (messageATous.trim()) { envoyerATousReseau(messageATous); setMessageATous('') } }}
                  style={{
                    padding: '6px 14px', borderRadius: 4, cursor: 'pointer', fontSize: 13,
                    border: `1px solid ${SECTION_BORDER}`, background: 'rgba(201,168,76,0.12)', color: GOLD,
                  }}
                >
                  {t('gmMode.reseau.envoyerATous')}
                </button>
              </div>
            </>
          )}

          <div style={{ fontSize: 12, fontWeight: 700, color: GOLD, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            {t('gmMode.reseau.journal')}
          </div>
          <div style={{
            border: `1px solid ${SECTION_BORDER}`, borderRadius: 6, padding: 10, maxHeight: 320,
            overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4,
            background: 'rgba(0,0,0,0.2)', fontFamily: 'monospace', fontSize: 12,
          }}>
            {journal.length === 0
              ? <span style={{ opacity: 0.4 }}>{t('gmMode.reseau.journalVide')}</span>
              : journal.map(l => (
                <div key={l.id} style={{ color: l.categorie ? COULEUR_JOURNAL[l.categorie] : 'rgba(245,236,215,0.85)' }}>
                  {l.texte}
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  )
}
