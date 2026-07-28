import { useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { demarrerServeurReseau, arreterServeurReseau, etatServeurReseau, envoyerATousReseau, deconnecterClientReseau, ecouterReseau } from '../../utils/reseau'
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

export interface ClientConnecte {
  connexionId: number
  nom: string
  nomJoueur: string
  peuple: string
  idPJ: string
}

interface Props {
  // Portés par GMDashboard.tsx (pas un état local ici) : cet onglet est démonté/remonté à chaque
  // changement d'onglet du tableau de bord — un historique local serait vidé à chaque fois, contrairement
  // à demarre/port/code/clients qui, eux, se régénèrent tout seuls via etatServeurReseau() au montage.
  journal: LigneJournal[]
  ajouterJournal: (texte: string, categorie?: CategorieJournal) => void
  // Même raison que journal/ajouterJournal ci-dessus : un état local ici serait vidé à chaque
  // changement d'onglet, alors que les connexions WebSocket, elles, restent ouvertes.
  clientsConnectes: ClientConnecte[]
  setClientsConnectes: Dispatch<SetStateAction<ClientConnecte[]>>
}

// Écran de test de la plomberie réseau (voir src-tauri/src/reseau.rs et src/utils/reseau.ts) : démarrer/
// arrêter le serveur, voir les connexions et les messages bruts reçus. Pas de protocole de jeu ici —
// c'est la première étape du chantier réseau (branche feature/reseau-local), avant le code de partie,
// la découverte réseau côté joueur et l'échange de jets/dégâts.
export default function ReseauTab({ journal, ajouterJournal, clientsConnectes, setClientsConnectes }: Props) {
  const { t } = useTranslation()
  const [demarre, setDemarre] = useState(false)
  const [port, setPort] = useState<number | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const [clients, setClients] = useState(0)
  const [messageATous, setMessageATous] = useState('')

  useEffect(() => {
    etatServeurReseau().then(etat => { setDemarre(etat.demarre); setPort(etat.port); setCode(etat.code); setClients(etat.clients) })
  }, [])

  // Correspondance connexion → identité de PJ (nom + idPJ, voir reseauProtocole.ts), pour afficher
  // "X inflige..." plutôt qu'un id de connexion sur les lignes "degats" du journal, et pour distinguer
  // deux PJ homonymes par un fragment d'idPJ. Suivi propre à cet écran (ReseauTab a sa propre écoute
  // réseau, indépendante de celle de CombatTab.tsx qui a la sienne pour ses propres besoins — pas de
  // state à partager entre les deux, chacun reconstruit ce dont il a besoin à partir des mêmes événements).
  const identitesRef = useRef<Record<number, { nom: string; idPJ: string }>>({})

  useEffect(() => {
    let annule = false
    const gerer = (e: EvenementReseau) => {
      if (e.type === 'connexion') { setClients(c => c + 1); ajouterJournal(t('gmMode.reseau.connexionEvt', { id: e.id }), 'connexion') }
      else if (e.type === 'deconnexion') {
        setClients(c => Math.max(0, c - 1))
        setClientsConnectes(prev => prev.filter(c => c.connexionId !== e.id))
        ajouterJournal(t('gmMode.reseau.deconnexionEvt', { id: e.id }), 'deconnexion')
      }
      else if (e.type === 'decouverte') { ajouterJournal(`🔍 ${e.source} → code ${e.codeRecu ?? '?'} (${e.correspond ? 'OK' : 'ne correspond pas'})`, 'decouverte') }
      else if (e.type === 'message') {
        const message = decoderMessage(e.contenu)
        if (message?.type === 'identification') {
          identitesRef.current[e.id] = { nom: message.nom, idPJ: message.idPJ }
          setClientsConnectes(prev => [
            ...prev.filter(c => c.connexionId !== e.id),
            { connexionId: e.id, nom: message.character.nomPersonnage, nomJoueur: message.character.nomJoueur, peuple: message.character.peuple, idPJ: message.idPJ },
          ])
          ajouterJournal(t('gmMode.reseau.identificationEvt', { id: e.id, nom: message.nom, cle: message.idPJ.slice(0, 6) }), 'identification')
        } else if (message?.type === 'degats') {
          const identite = identitesRef.current[e.id]
          const nom = identite?.nom ?? `#${e.id}`
          const cle = identite?.idPJ.slice(0, 6) ?? '?'
          ajouterJournal(t('gmMode.reseau.degatsEvt', { id: e.id, nom, cle, montant: message.montant, type: message.typeDegats || t('gameMode.dmTypeGenerique') }), 'degats')
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
      setClientsConnectes([])
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
    <div>
      <div style={{ fontSize: 18, fontFamily: "'Cinzel', serif", fontWeight: 700, color: GOLD, marginBottom: 6 }}>
        {t('gmMode.reseau.titre')}
      </div>
      <div style={{ fontSize: 13, color: 'rgba(245,236,215,0.6)', marginBottom: 16 }}>
        {t('gmMode.reseau.intro')}
      </div>

      {!isTauri() ? (
        <div style={{ padding: 12, borderRadius: 6, border: `1px solid ${SECTION_BORDER}`, color: 'rgba(245,236,215,0.5)', fontSize: 13, maxWidth: 640 }}>
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

          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 500px', minWidth: 0, maxWidth: 640 }}>
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
            </div>

            {/* Vue d'ensemble des joueurs connectés (voir clientsConnectes) — utile pour distinguer deux
                PJ homonymes (nom + joueur + peuple + fragment d'idPJ affichés), et pour déconnecter un
                client précis sans devoir arrêter tout le serveur. */}
            <div style={{ flex: '0 0 260px', minWidth: 220 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: GOLD, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                {t('gmMode.reseau.joueursConnectes')}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {clientsConnectes.length === 0
                  ? <span style={{ fontSize: 12, opacity: 0.4 }}>{t('gmMode.reseau.aucunJoueurConnecte')}</span>
                  : clientsConnectes.map(c => (
                    <div key={c.connexionId} style={{
                      padding: '8px 10px', borderRadius: 6, border: `1px solid ${SECTION_BORDER}`,
                      background: 'rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', gap: 3,
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: PARCHMENT }}>{c.nom}</div>
                      <div style={{ fontSize: 11, color: 'rgba(245,236,215,0.6)' }}>
                        {t('gmMode.reseau.joueurEtPeuple', { joueur: c.nomJoueur || '—', peuple: c.peuple || '—' })}
                      </div>
                      <div style={{ fontSize: 10, color: 'rgba(245,236,215,0.35)', fontFamily: 'monospace' }}>
                        #{c.connexionId} · {c.idPJ.slice(0, 6)}
                      </div>
                      <button
                        onClick={() => deconnecterClientReseau(c.connexionId)}
                        style={{
                          alignSelf: 'flex-start', marginTop: 2, padding: '3px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11,
                          border: '1px solid rgba(220,80,80,0.4)', background: 'rgba(220,80,80,0.1)', color: 'rgba(255,150,150,0.9)',
                        }}
                      >
                        {t('gmMode.reseau.deconnecterJoueur')}
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
