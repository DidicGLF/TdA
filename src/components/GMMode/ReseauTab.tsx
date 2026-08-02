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
  // Dialogue entre PJ (voir 'message-pj' dans reseauProtocole.ts) — journal séparé, même raison de levée
  // qu'au-dessus. dialoguesCoupes : idPJ des joueurs dont le dialogue est coupé (bouton 🔇 sur leur carte).
  dialoguePJ: LigneJournal[]
  ajouterDialoguePJ: (texte: string, categorie?: CategorieJournal) => void
  dialoguesCoupes: Set<string>
  setDialoguesCoupes: Dispatch<SetStateAction<Set<string>>>
}

// Écran de test de la plomberie réseau (voir src-tauri/src/reseau.rs et src/utils/reseau.ts) : démarrer/
// arrêter le serveur, voir les connexions et les messages bruts reçus. Pas de protocole de jeu ici —
// c'est la première étape du chantier réseau (branche feature/reseau-local), avant le code de partie,
// la découverte réseau côté joueur et l'échange de jets/dégâts.
export default function ReseauTab({
  journal, ajouterJournal, clientsConnectes, setClientsConnectes,
  dialoguePJ, ajouterDialoguePJ, dialoguesCoupes, setDialoguesCoupes,
}: Props) {
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
  // Diffusé à tous (voir 'message-mj'/diffusion dans reseauProtocole.ts) — encodé comme un vrai message
  // protocolaire (auparavant envoyé en texte brut non protocolaire, donc ni tagué ni journalisé
  // correctement côté joueur ni ici, signalé par Didic), et journalisé ici même pour qu'on retrouve trace
  // de ce qu'on a envoyé, comme pour un message privé (voir envoyerMessagePrive juste en dessous).
  const envoyerMessageATous = () => {
    const texte = messageATous.trim()
    if (!texte) return
    envoyerATousReseau(encoderMessage({ type: 'message-mj', texte, diffusion: 'tous' }))
    ajouterJournal(t('gmMode.reseau.messageATousEnvoyeEvt', { texte }), 'messageMJ')
    setMessageATous('')
  }
  // Brouillon de message privé par connexion (voir 'message-mj' dans reseauProtocole.ts) — un client
  // connecté peut recevoir un message ciblé, invisible des autres, contrairement au champ ci-dessus.
  const [messagesPrives, setMessagesPrives] = useState<Record<number, string>>({})
  const envoyerMessagePrive = (connexionId: number, nomPJ: string) => {
    const texte = (messagesPrives[connexionId] ?? '').trim()
    if (!texte) return
    envoyerAClientReseau(connexionId, encoderMessage({ type: 'message-mj', texte }))
    ajouterJournal(t('gmMode.reseau.messagePriveEnvoyeEvt', { nom: nomPJ, texte }), 'messageMJ')
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
  // dialoguesCoupes est un prop qui change au clic sur 🔇 — l'écoute réseau ci-dessous ne se réabonne
  // jamais (effet à deps vides, voir sa note), donc le closure `gerer` doit lire l'état FRAIS via une
  // ref plutôt que la valeur du prop, restée figée à celle du montage sinon.
  const dialoguesCoupesRef = useRef(dialoguesCoupes)
  useEffect(() => { dialoguesCoupesRef.current = dialoguesCoupes }, [dialoguesCoupes])

  useEffect(() => {
    let annule = false
    // Diffusé à tous les joueurs à chaque changement de qui est connecté/identifié (voir 'roster-pj' dans
    // reseauProtocole.ts) — chaque client s'en sert pour proposer un destinataire au dialogue entre PJ
    // (voir rosterPJ dans useReseauClient.ts). Reconstruit depuis identitesRef, toujours à jour puisque
    // muté en place (pas de state React à lire ici, voir la note sur dialoguesCoupesRef plus haut).
    const diffuserRosterPJ = () => {
      const joueurs = Object.values(identitesRef.current).map(({ nom, idPJ }) => ({ nom, idPJ }))
      envoyerATousReseau(encoderMessage({ type: 'roster-pj', joueurs }))
    }
    const gerer = (e: EvenementReseau) => {
      if (e.type === 'connexion') { setClients(c => c + 1); ajouterJournal(t('gmMode.reseau.connexionEvt', { id: e.id }), 'connexion') }
      else if (e.type === 'deconnexion') {
        setClients(c => Math.max(0, c - 1))
        setClientsConnectes(prev => prev.filter(c => c.connexionId !== e.id))
        delete identitesRef.current[e.id]
        diffuserRosterPJ()
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
          diffuserRosterPJ()
          ajouterJournal(t('gmMode.reseau.identificationEvt', { id: e.id, nom: message.nom, cle: message.idPJ.slice(0, 6) }), 'identification')
        } else if (message?.type === 'degats') {
          const identite = identitesRef.current[e.id]
          const nom = identite?.nom ?? `#${e.id}`
          const cle = identite?.idPJ.slice(0, 6) ?? '?'
          ajouterJournal(t('gmMode.reseau.degatsEvt', { id: e.id, nom, cle, montant: message.montant, type: message.typeDegats || t('gameMode.dmTypeGenerique') }), 'degats')
        } else if (message?.type === 'message-joueur') {
          const nom = identitesRef.current[e.id]?.nom ?? `#${e.id}`
          ajouterJournal(t('gmMode.reseau.messageJoueurEvt', { nom, texte: message.texte }), 'messageJoueur')
        } else if (message?.type === 'pv-actualises') {
          // Le PJ s'est soigné ou a perdu des PV de son côté (voir applyPVLoss/applyHeal dans
          // GameModePanel.tsx) — la carte de la rencontre est mise à jour ailleurs (CombatTab.tsx a sa
          // propre écoute réseau, voir sa note), cette ligne n'est qu'une trace visible dans ce journal.
          const nom = identitesRef.current[e.id]?.nom ?? `#${e.id}`
          ajouterJournal(t('gmMode.reseau.pvActualisesEvt', { nom, pv: message.pvActuels }), 'pvActualises')
        } else if (message?.type === 'message-pj') {
          // Dialogue entre PJ (voir reseauProtocole.ts) — journal SÉPARÉ (jamais dans ajouterJournal, qui
          // resterait celui du MJ). destinataireIdPJ présent = relayé au SEUL destinataire visé (dialogue
          // privé) ; absent = relayé à TOUS les autres joueurs connectés (comportement par défaut tant
          // qu'aucun destinataire précis n'est choisi côté joueur, voir GameModePanel.tsx) — sauf si
          // l'expéditeur a été coupé (dialoguesCoupesRef, voir sa note plus haut) : toujours journalisé
          // ici, même coupé/introuvable, pour que le MJ garde une trace de ce qui a été tenté (modération).
          const expediteur = identitesRef.current[e.id]
          const nom = expediteur?.nom ?? `#${e.id}`
          const coupe = !!expediteur && dialoguesCoupesRef.current.has(expediteur.idPJ)
          if (message.destinataireIdPJ) {
            const cibleEntree = Object.entries(identitesRef.current).find(([, v]) => v.idPJ === message.destinataireIdPJ)
            const cible = cibleEntree?.[1]?.nom ?? '?'
            ajouterDialoguePJ(
              t(coupe ? 'gmMode.reseau.dialogueBloqueEvt' : 'gmMode.reseau.dialogueEvt', { nom, cible, texte: message.texte }),
              'dialoguePJ',
            )
            if (!coupe && cibleEntree) {
              envoyerAClientReseau(Number(cibleEntree[0]), encoderMessage({ type: 'message-pj-recu', expediteurNom: nom, texte: message.texte }))
            }
          } else {
            const cible = t('gmMode.reseau.dialogueTousLabel')
            ajouterDialoguePJ(
              t(coupe ? 'gmMode.reseau.dialogueBloqueEvt' : 'gmMode.reseau.dialogueEvt', { nom, cible, texte: message.texte }),
              'dialoguePJ',
            )
            if (!coupe) {
              const contenu = encoderMessage({ type: 'message-pj-recu', expediteurNom: nom, texte: message.texte })
              for (const idStr of Object.keys(identitesRef.current)) {
                const id = Number(idStr)
                if (id !== e.id) envoyerAClientReseau(id, contenu)
              }
            }
          }
        } else {
          // Pas un message de protocole reconnu (texte de test brut, voir "message de test") : affiché tel quel.
          ajouterJournal(t('gmMode.reseau.messageEvt', { id: e.id, contenu: e.contenu }))
        }
      }
    }
    let desabonner = () => {}
    ecouterReseau(gerer).then(fn => {
      if (annule) { fn(); return }
      desabonner = fn
      // Redemande à tous les clients déjà connectés de se réidentifier (voir reseauProtocole.ts et le
      // même correctif dans CombatTab.tsx) : identitesRef/clientsConnectes viennent d'être recréés vides
      // par ce (re)montage — ex. après un aller-retour par le Mode de jeu, qui démonte GMDashboard —
      // mais leur connexion WebSocket, elle, est restée ouverte. Sans ça, la carte du joueur restait
      // vide jusqu'à sa prochaine (re)connexion, alors que "X client(s) connecté(s)" (compté côté
      // serveur Rust, indépendant de cet état React) continuait d'afficher le bon nombre.
      envoyerATousReseau(encoderMessage({ type: 'qui-etes-vous' }))
    })
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
                      onKeyDown={e => { if (e.key === 'Enter') envoyerMessageATous() }}
                      placeholder={t('gmMode.reseau.envoyerATousPlaceholder')}
                      style={{
                        flex: '1 1 auto', minWidth: 0, padding: '6px 10px', borderRadius: 4, border: `1px solid ${SECTION_BORDER}`,
                        background: 'rgba(0,0,0,0.25)', color: PARCHMENT, fontSize: 15,
                      }}
                    />
                    <button
                      onClick={envoyerMessageATous}
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
                          flex: '0 0 auto', width: 150, minWidth: 0, boxSizing: 'border-box',
                          padding: '6px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 15,
                          textAlign: 'center', textAlignLast: 'center',
                          appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
                          border: '1px solid rgba(180,130,255,0.4)', background: 'rgba(180,130,255,0.12)', color: 'rgba(180,130,255,0.9)',
                        } as React.CSSProperties}
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
                          onKeyDown={e => { if (e.key === 'Enter') envoyerMessagePrive(c.connexionId, c.nom) }}
                          placeholder={t('gmMode.reseau.messagePrivePlaceholder')}
                          style={{
                            flex: 1, minWidth: 0, padding: '6px 10px', borderRadius: 4, fontSize: 15,
                            border: `1px solid ${SECTION_BORDER}`, background: 'rgba(0,0,0,0.25)', color: PARCHMENT,
                          }}
                        />
                        <button
                          onClick={() => envoyerMessagePrive(c.connexionId, c.nom)}
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
                              // Largeur fixe : sans elle, la boîte fermée du <select> s'élargit selon la
                              // largeur de sa PLUS LONGUE option (nom d'arme/armure), pas juste 📦 —
                              // c'est exactement le bug de chevauchement avec le champ de texte voisin
                              // déjà rencontré et corrigé une première fois sur ce même sélecteur.
                              flex: '0 0 auto', width: 44, minWidth: 0, boxSizing: 'border-box',
                              padding: '6px 0', borderRadius: 4, cursor: 'pointer', fontSize: 15,
                              textAlign: 'center', textAlignLast: 'center',
                              appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
                              border: '1px solid rgba(180,130,255,0.4)', background: 'rgba(180,130,255,0.12)', color: 'rgba(180,130,255,0.9)',
                            } as React.CSSProperties}
                          >
                            <option value="">📦</option>
                            {optionsObjets()}
                          </select>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                        <button
                          onClick={() => deconnecterClientReseau(c.connexionId)}
                          style={{
                            padding: '6px 14px', borderRadius: 4, cursor: 'pointer', fontSize: 15,
                            border: '1px solid rgba(220,80,80,0.4)', background: 'rgba(220,80,80,0.1)', color: 'rgba(255,150,150,0.9)',
                          }}
                        >
                          {t('gmMode.reseau.deconnecterJoueur')}
                        </button>
                        {/* Coupe le dialogue entre PJ pour CE joueur (voir 'message-pj' dans
                            reseauProtocole.ts) — ses messages restent journalisés ici (modération) mais ne
                            sont plus relayés aux autres joueurs tant que c'est actif. */}
                        <button
                          onClick={() => setDialoguesCoupes(prev => {
                            const next = new Set(prev)
                            if (next.has(c.idPJ)) next.delete(c.idPJ); else next.add(c.idPJ)
                            return next
                          })}
                          title={dialoguesCoupes.has(c.idPJ) ? t('gmMode.reseau.reactiverDialogueTitle') : t('gmMode.reseau.couperDialogueTitle')}
                          style={{
                            padding: '6px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 15,
                            border: dialoguesCoupes.has(c.idPJ) ? '1px solid rgba(190,170,230,0.5)' : `1px solid ${SECTION_BORDER}`,
                            background: dialoguesCoupes.has(c.idPJ) ? 'rgba(190,170,230,0.15)' : 'transparent',
                            color: dialoguesCoupes.has(c.idPJ) ? 'rgba(210,190,255,0.95)' : 'rgba(245,236,215,0.5)',
                          }}
                        >
                          {dialoguesCoupes.has(c.idPJ) ? '🔇' : '🔊'}
                        </button>
                      </div>
                    </div>
                  ))}
              </div>

              {/* Dialogue entre PJ (voir 'message-pj' dans reseauProtocole.ts) — journal SÉPARÉ du
                  journal de jeu principal (ci-dessus), pour que le MJ puisse garder un œil sur ce que se
                  disent les joueurs (modération) sans le noyer dans le reste des événements réseau. */}
              <div style={{ fontSize: 14, fontWeight: 700, color: 'rgba(190,170,230,0.9)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 16, marginBottom: 8 }}>
                {t('gmMode.reseau.dialoguePJTitre')}
              </div>
              <div style={{
                border: '1px solid rgba(190,170,230,0.25)', borderRadius: 6, padding: 10, maxHeight: 200,
                overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4,
                background: 'rgba(0,0,0,0.2)', fontFamily: 'monospace', fontSize: 14,
              }}>
                {dialoguePJ.length === 0
                  ? <span style={{ opacity: 0.4 }}>{t('gmMode.reseau.dialoguePJVide')}</span>
                  : dialoguePJ.map(l => (
                    <div key={l.id} style={{ color: l.categorie ? COULEUR_JOURNAL[l.categorie] : 'rgba(245,236,215,0.85)' }}>
                      {l.texte}
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
