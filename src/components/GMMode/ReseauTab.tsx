import { useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { demarrerServeurReseau, arreterServeurReseau, etatServeurReseau, envoyerATousReseau, envoyerAClientReseau, deconnecterClientReseau, ecouterReseau } from '../../utils/reseau'
import type { EvenementReseau } from '../../utils/reseau'
import { decoderMessage, encoderMessage, COULEUR_JOURNAL } from '../../utils/reseauProtocole'
import type { CategorieJournal } from '../../utils/reseauProtocole'
import { compresserImage } from '../../utils/imageStore'
import { useGameData } from '../../context/GameDataContext'

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
  niveau: number
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
  const { objetsMagiques, armes, armures } = useGameData()
  // Catalogue livré+perso déjà fusionné (voir useGameData) — mis à plat pour la liste d'envoi, comme
  // objetsMagiques l'est déjà nativement. entrees.nom sert d'identifiant (unique au sein de sa liste,
  // comme partout ailleurs dans l'app — ex. EquipementModal).
  const armesListe = useMemo(
    () => armes.groupes.flatMap(g => g.categories.flatMap(c => c.entrees)) as
      { nom: string; dm: string; mod: string; prix: string; portee?: string; deuxMains?: boolean }[],
    [armes],
  )
  const armuresListe = useMemo(
    () => armures.categories.flatMap(c => c.entrees),
    [armures],
  )
  const [demarre, setDemarre] = useState(false)
  const [port, setPort] = useState<number | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const [clients, setClients] = useState(0)
  const [messageATous, setMessageATous] = useState('')
  // Brouillon de message privé par connexion (voir 'message-mj' dans reseauProtocole.ts) — un client
  // connecté peut recevoir un message ciblé, invisible des autres, contrairement au champ ci-dessus.
  const [messagesPrives, setMessagesPrives] = useState<Record<number, string>>({})
  const envoyerMessagePrive = (connexionId: number) => {
    const texte = (messagesPrives[connexionId] ?? '').trim()
    if (!texte) return
    envoyerAClientReseau(connexionId, encoderMessage({ type: 'message-mj', texte }))
    setMessagesPrives(prev => ({ ...prev, [connexionId]: '' }))
  }

  // Envoi d'image (voir 'image-mj' dans reseauProtocole.ts) — un seul <input type=file> caché partagé
  // par tous les boutons 🖼 (à tous + un par joueur) : cibleImageRef retient pour qui au moment du clic,
  // relu dans l'onChange une fois le fichier choisi. Évite de créer un ref par carte de client.
  const cibleImageRef = useRef<number | 'tous' | null>(null)
  const fichierImageRef = useRef<HTMLInputElement | null>(null)
  const choisirImagePour = (cible: number | 'tous') => {
    cibleImageRef.current = cible
    fichierImageRef.current?.click()
  }
  const fichierImageChoisi = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const cible = cibleImageRef.current
    e.target.value = ''
    if (!file || cible === null) return
    const reader = new FileReader()
    reader.onload = async ev => {
      const compressed = await compresserImage(ev.target?.result as string)
      const contenu = encoderMessage({ type: 'image-mj', dataUrl: compressed })
      if (cible === 'tous') envoyerATousReseau(contenu)
      else envoyerAClientReseau(cible, contenu)
    }
    reader.readAsDataURL(file)
  }

  // Envoi d'un objet magique (voir 'objet-magique-mj' dans reseauProtocole.ts) — même choix de transport
  // que l'image (à tous vs ciblé) selon d'où l'appel vient, le catalogue objetsMagiques est déjà le
  // même que celui utilisé par ObjetsMagiquesTab/EquipementModal (livré + perso fusionnés).
  const envoyerObjetMagique = (cible: number | 'tous', objetId: string) => {
    const objet = objetsMagiques.find(o => o.id === objetId)
    if (!objet) return
    const contenu = encoderMessage({ type: 'objet-magique-mj', objet })
    if (cible === 'tous') envoyerATousReseau(contenu)
    else envoyerAClientReseau(cible, contenu)
  }

  // Envoi d'un objet CLASSIQUE (arme/armure du catalogue, sans enchantement — voir 'objet-classique-mj')
  // — même transport que ci-dessus. Conversion vers la forme Arme/ArmureEquipee du personnage (mod →
  // attaque, def brut) : même geste que addArme/addArmure dans EquipementModal.tsx.
  const envoyerObjetClassique = (cible: number | 'tous', categorie: 'arme' | 'armure', nom: string) => {
    const contenu = categorie === 'arme'
      ? (() => {
          const e = armesListe.find(x => x.nom === nom)
          if (!e) return null
          return encoderMessage({
            type: 'objet-classique-mj', categorie,
            objet: { nom: e.nom, dm: e.dm, attaque: e.mod, special: '', prix: e.prix, portee: e.portee, deuxMains: e.deuxMains },
          })
        })()
      : (() => {
          const e = armuresListe.find(x => x.nom === nom)
          if (!e) return null
          return encoderMessage({ type: 'objet-classique-mj', categorie, objet: { nom: e.nom, def: e.def, prix: e.prix, equipe: false } })
        })()
    if (!contenu) return
    if (cible === 'tous') envoyerATousReseau(contenu)
    else envoyerAClientReseau(cible, contenu)
  }

  // Point d'entrée unique des deux sélecteurs "Envoyer objet" (à tous et par joueur) : la valeur d'une
  // <option> encode son type ("magique:<id>" / "arme:<nom>" / "armure:<nom>") pour dispatcher vers la
  // bonne fonction d'envoi sans dupliquer la logique de sélection dans les deux endroits où elle apparaît.
  const envoyerObjetSelectionne = (cible: number | 'tous', valeur: string) => {
    const separateur = valeur.indexOf(':')
    if (separateur === -1) return
    const type = valeur.slice(0, separateur)
    const id = valeur.slice(separateur + 1)
    if (type === 'magique') envoyerObjetMagique(cible, id)
    else if (type === 'arme' || type === 'armure') envoyerObjetClassique(cible, type, id)
  }

  // Options communes aux deux sélecteurs "Envoyer objet" — un <optgroup> par catégorie pour une
  // démarcation visuelle claire entre objets magiques et équipement classique (demandé par Didic).
  const optionsObjets = () => (
    <>
      {objetsMagiques.length > 0 && (
        <optgroup label={t('gmMode.reseau.groupeObjetsMagiques')}>
          {objetsMagiques.map(o => <option key={`m-${o.id}`} value={`magique:${o.id}`}>{o.nom}</option>)}
        </optgroup>
      )}
      {armesListe.length > 0 && (
        <optgroup label={t('gmMode.reseau.groupeArmes')}>
          {armesListe.map(e => <option key={`a-${e.nom}`} value={`arme:${e.nom}`}>{e.nom}</option>)}
        </optgroup>
      )}
      {armuresListe.length > 0 && (
        <optgroup label={t('gmMode.reseau.groupeArmures')}>
          {armuresListe.map(e => <option key={`r-${e.nom}`} value={`armure:${e.nom}`}>{e.nom}</option>)}
        </optgroup>
      )}
    </>
  )

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
            { connexionId: e.id, nom: message.character.nomPersonnage, nomJoueur: message.character.nomJoueur, peuple: message.character.peuple, niveau: message.character.niveau, idPJ: message.idPJ },
          ])
          ajouterJournal(t('gmMode.reseau.identificationEvt', { id: e.id, nom: message.nom, cle: message.idPJ.slice(0, 6) }), 'identification')
        } else if (message?.type === 'degats') {
          const identite = identitesRef.current[e.id]
          const nom = identite?.nom ?? `#${e.id}`
          const cle = identite?.idPJ.slice(0, 6) ?? '?'
          ajouterJournal(t('gmMode.reseau.degatsEvt', { id: e.id, nom, cle, montant: message.montant, type: message.typeDegats || t('gameMode.dmTypeGenerique') }), 'degats')
        } else if (message?.type === 'message-joueur') {
          const nom = identitesRef.current[e.id]?.nom ?? `#${e.id}`
          ajouterJournal(t('gmMode.reseau.messageJoueurEvt', { nom, texte: message.texte }), 'messageJoueur')
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
      <input ref={fichierImageRef} type="file" accept="image/*" onChange={fichierImageChoisi} style={{ display: 'none' }} />
      <div style={{ fontSize: 19, fontFamily: "'Cinzel', serif", fontWeight: 700, color: GOLD, marginBottom: 6 }}>
        {t('gmMode.reseau.titre')}
      </div>
      <div style={{ fontSize: 15, color: 'rgba(245,236,215,0.6)', marginBottom: 16 }}>
        {t('gmMode.reseau.intro')}
      </div>

      {!isTauri() ? (
        <div style={{ padding: 12, borderRadius: 6, border: `1px solid ${SECTION_BORDER}`, color: 'rgba(245,236,215,0.5)', fontSize: 15, maxWidth: 640 }}>
          {t('gmMode.reseau.horsTauri')}
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <button onClick={toggleServeur} style={{
              padding: '8px 16px', borderRadius: 4, cursor: 'pointer', fontSize: 16,
              border: `1px solid ${demarre ? 'rgba(220,80,80,0.5)' : 'rgba(120,220,140,0.5)'}`,
              background: demarre ? 'rgba(220,80,80,0.12)' : 'rgba(120,220,140,0.12)',
              color: demarre ? 'rgba(255,150,150,0.95)' : 'rgba(120,220,140,0.95)',
            }}>
              {demarre ? t('gmMode.reseau.arreter') : t('gmMode.reseau.demarrer')}
            </button>
            <span style={{ fontSize: 15, color: PARCHMENT }}>
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
                      <span style={{ fontSize: 14, color: 'rgba(245,236,215,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        {t('gmMode.reseau.codePartie')}
                      </span>
                      <span style={{ fontSize: 28, fontWeight: 700, color: GOLD, letterSpacing: '0.15em', fontFamily: 'monospace' }}>
                        {code}
                      </span>
                    </div>
                  )}
                  <div style={{ fontSize: 15, color: GOLD, marginBottom: 12 }}>
                    {t('gmMode.reseau.clients', { count: clients })}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                    <input
                      value={messageATous}
                      onChange={e => setMessageATous(e.target.value)}
                      placeholder={t('gmMode.reseau.envoyerATousPlaceholder')}
                      style={{
                        flex: '1 1 auto', minWidth: 0, padding: '6px 10px', borderRadius: 4, border: `1px solid ${SECTION_BORDER}`,
                        background: 'rgba(0,0,0,0.25)', color: PARCHMENT, fontSize: 15,
                      }}
                    />
                    <button
                      onClick={() => { if (messageATous.trim()) { envoyerATousReseau(messageATous); setMessageATous('') } }}
                      style={{
                        padding: '6px 14px', borderRadius: 4, cursor: 'pointer', fontSize: 15,
                        border: `1px solid ${SECTION_BORDER}`, background: 'rgba(201,168,76,0.12)', color: GOLD,
                      }}
                    >
                      {t('gmMode.reseau.envoyerATous')}
                    </button>
                    <button
                      onClick={() => choisirImagePour('tous')}
                      title={t('gmMode.reseau.envoyerImageATousTitle')}
                      style={{
                        padding: '6px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 15,
                        border: `1px solid ${SECTION_BORDER}`, background: 'rgba(201,168,76,0.12)', color: GOLD,
                      }}
                    >
                      🖼
                    </button>
                    {(objetsMagiques.length > 0 || armesListe.length > 0 || armuresListe.length > 0) && (
                      <select
                        value=""
                        onChange={e => { if (e.target.value) envoyerObjetSelectionne('tous', e.target.value) }}
                        title={t('gmMode.reseau.envoyerObjetATousTitle')}
                        style={{
                          flex: '0 0 auto', width: 150, minWidth: 0, padding: '6px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 15,
                          border: '1px solid rgba(180,130,255,0.4)', background: 'rgba(180,130,255,0.12)', color: 'rgba(180,130,255,0.9)',
                        }}
                      >
                        <option value="">📦 {t('gmMode.reseau.envoyerObjetPlaceholder')}</option>
                        {optionsObjets()}
                      </select>
                    )}
                  </div>
                </>
              )}

              <div style={{ fontSize: 14, fontWeight: 700, color: GOLD, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                {t('gmMode.reseau.journal')}
              </div>
              <div style={{
                border: `1px solid ${SECTION_BORDER}`, borderRadius: 6, padding: 10, maxHeight: 320,
                overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4,
                background: 'rgba(0,0,0,0.2)', fontFamily: 'monospace', fontSize: 14,
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
            <div style={{ flex: '0 0 340px', minWidth: 280 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: GOLD, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                {t('gmMode.reseau.joueursConnectes')}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {clientsConnectes.length === 0
                  ? <span style={{ fontSize: 14, opacity: 0.4 }}>{t('gmMode.reseau.aucunJoueurConnecte')}</span>
                  : clientsConnectes.map(c => (
                    <div key={c.connexionId} style={{
                      padding: '12px 14px', borderRadius: 6, border: `1px solid ${SECTION_BORDER}`,
                      background: 'rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', gap: 5,
                    }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: PARCHMENT }}>
                        {t('gmMode.reseau.nomEtPeuple', { nom: c.nom, peuple: c.peuple || '—' })}
                      </div>
                      <div style={{ fontSize: 13, color: 'rgba(245,236,215,0.6)' }}>
                        {t('gmMode.reseau.niveauEtJoueur', { niveau: c.niveau, joueur: c.nomJoueur || '—' })}
                      </div>
                      <div style={{ fontSize: 12, color: 'rgba(245,236,215,0.35)', fontFamily: 'monospace' }}>
                        #{c.connexionId} · {c.idPJ.slice(0, 6)}
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                        <input
                          value={messagesPrives[c.connexionId] ?? ''}
                          onChange={e => setMessagesPrives(prev => ({ ...prev, [c.connexionId]: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') envoyerMessagePrive(c.connexionId) }}
                          placeholder={t('gmMode.reseau.messagePrivePlaceholder')}
                          style={{
                            flex: 1, minWidth: 0, padding: '6px 10px', borderRadius: 4, fontSize: 15,
                            border: `1px solid ${SECTION_BORDER}`, background: 'rgba(0,0,0,0.25)', color: PARCHMENT,
                          }}
                        />
                        <button
                          onClick={() => envoyerMessagePrive(c.connexionId)}
                          title={t('gmMode.reseau.envoyerMessagePriveTitle')}
                          style={{
                            padding: '6px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 15,
                            border: `1px solid ${SECTION_BORDER}`, background: 'rgba(201,168,76,0.12)', color: GOLD,
                          }}
                        >
                          🔒
                        </button>
                        <button
                          onClick={() => choisirImagePour(c.connexionId)}
                          title={t('gmMode.reseau.envoyerImagePriveeTitle')}
                          style={{
                            padding: '6px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 15,
                            border: `1px solid ${SECTION_BORDER}`, background: 'rgba(201,168,76,0.12)', color: GOLD,
                          }}
                        >
                          🖼
                        </button>
                        {(objetsMagiques.length > 0 || armesListe.length > 0 || armuresListe.length > 0) && (
                          <select
                            value=""
                            onChange={e => { if (e.target.value) envoyerObjetSelectionne(c.connexionId, e.target.value) }}
                            title={t('gmMode.reseau.envoyerObjetPriveeTitle')}
                            style={{
                              flex: '0 0 auto', width: 56, minWidth: 0, padding: '6px 4px', borderRadius: 4, cursor: 'pointer', fontSize: 15,
                              border: '1px solid rgba(180,130,255,0.4)', background: 'rgba(180,130,255,0.12)', color: 'rgba(180,130,255,0.9)',
                            }}
                          >
                            <option value="">📦</option>
                            {optionsObjets()}
                          </select>
                        )}
                      </div>
                      <button
                        onClick={() => deconnecterClientReseau(c.connexionId)}
                        style={{
                          alignSelf: 'flex-start', marginTop: 6, padding: '6px 14px', borderRadius: 4, cursor: 'pointer', fontSize: 15,
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
