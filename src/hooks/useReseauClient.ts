import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PORT_RESEAU } from '../utils/reseau'
import { encoderMessage, decoderMessage, idPJ } from '../utils/reseauProtocole'
import type { CategorieJournal } from '../utils/reseauProtocole'
import type { Character, Arme, ArmureEquipee } from '../types/character'
import type { ObjetMagiqueEntry } from '../types/gameData'
import type { MissionCompagnie } from '../utils/missions'

// Client réseau côté joueur (Mode de jeu) — se connecte au serveur MJ (voir src-tauri/src/reseau.rs et
// src/components/GMMode/CombatTab.tsx). Un client WebSocket ne nécessite aucun code Rust/Tauri : la CSP
// de l'app est ouverte (null), donc le WebSocket natif du navigateur suffit, comme sur n'importe quelle
// page web.
export interface LigneJournalReseau {
  id: number
  texte: string
  categorie?: CategorieJournal
}

export interface DegatsRecus {
  montant: number
  typeDegats: string
  toucheRate: boolean
}

// onDegatsRecus : appelé directement depuis le callback onmessage du socket (pas via un state+effet) —
// évite d'enchaîner un effet qui ne ferait qu'appeler d'autres setState en réaction à un changement
// d'état, ce que les règles des Hooks découragent. Le composant appelant garde sa propre logique
// d'application des dégâts à jour dans une ref (voir GameModePanel.tsx) pour ne pas avoir à la définir
// avant l'appel à ce hook.
export function useReseauClient(
  onDegatsRecus?: (d: DegatsRecus) => void,
  onObjetMagiqueRecu?: (o: ObjetMagiqueEntry) => void,
  onObjetClassiqueRecu?: (categorie: 'arme' | 'armure', objet: Arme | ArmureEquipee) => void,
  // MJ → joueur : le MJ vient de modifier pvActuels à la main (voir 'pv-actualises' dans
  // reseauProtocole.ts) — appliqué directement à pvRestants, sans repasser par applyPVLoss/applyHeal
  // (qui émettent CE MÊME message vers le MJ), pour ne jamais faire d'aller-retour.
  onPvActualisesRecu?: (pv: number) => void,
  // MJ → tous : le MJ vient de cliquer "Tour suivant" côté rencontre (voir 'nouveau-tour' dans
  // reseauProtocole.ts) — déclenche le même handleEndTurn que le bouton "Tour suivant" local (voir
  // GameModePanel.tsx).
  onNouveauTourRecu?: () => void,
) {
  const { t } = useTranslation()
  const [connecte, setConnecte] = useState(false)
  const [journal, setJournal] = useState<LigneJournalReseau[]>([])
  // Signale un message privé du MJ (voir 'message-mj') non encore vu tant que le panneau réseau n'a pas
  // été rouvert — le joueur ne le garde pas forcément ouvert en permanence, contrairement au MJ qui suit
  // ReseauTab. Remis à false par marquerMessagesLus (voir GameModePanel, à l'ouverture du panneau).
  const [messageNonLu, setMessageNonLu] = useState(false)
  // Image actuellement affichée en plein écran (voir 'image-mj') — dataUrl déjà compressée par le MJ,
  // jamais stockée sur disque ici. imagesRecuesRef (id de ligne de journal → dataUrl) permet de rouvrir
  // une image passée en cliquant sa ligne de journal (voir ouvrirImage) ; purgée au-delà de 30 entrées,
  // simple garde-fou mémoire pour une longue session (ces images ne sont jamais persistées).
  const [imageAffichee, setImageAffichee] = useState<string | null>(null)
  const imagesRecuesRef = useRef<Record<number, string>>({})
  // Autres PJ actuellement connectés (voir 'roster-pj' dans reseauProtocole.ts), diffusé par le MJ à
  // chaque connexion/déconnexion/identification — sert à choisir un destinataire pour le dialogue entre
  // PJ (voir GameModePanel.tsx). Notre propre idPJ est filtré à la réception (voir plus bas).
  const [rosterPJ, setRosterPJ] = useState<{ idPJ: string; nom: string }[]>([])
  // État de ciblage propre à ce PJ (voir 'etat-ciblage' dans reseauProtocole.ts) — poussé par le MJ à
  // chaque changement pertinent de la rencontre, jamais de def/rd/pvActuels (voir la note dans
  // reseauProtocole.ts). Simple state, pas besoin du patron ref-indirection (comme rosterPJ) : rien ici
  // ne dépend de l'état local de GameModePanel.
  const [ciblesDisponibles, setCiblesDisponibles] = useState<{ id: string; nom: string; mort: boolean; enCours: boolean; cible: string | null }[]>([])
  const [ciblesSurMoi, setCiblesSurMoi] = useState<string[]>([])
  // PV actuels/max des compagnons DE CE PJ (voir 'etat-ciblage' dans reseauProtocole.ts) — même simple
  // state que ciblesDisponibles/ciblesSurMoi ci-dessus. estSonTour : dérivé de l'ordre d'initiative
  // côté MJ (voir ordreInitiative ci-dessous), pas recalculable ici (id de session inconnu du joueur).
  const [compagnonsEtat, setCompagnonsEtat] = useState<{ nom: string; pvActuels: number; pvMax: number; estSonTour: boolean }[]>([])
  // Ordre d'initiative (voir 'etat-ciblage' dans reseauProtocole.ts) : estMonTour calculé par le MJ (le
  // joueur ne connaît jamais son propre CombatPJ.id de session), ordreInitiative pour l'affichage du
  // même tableau que côté MJ (voir la vue Combat de GameModePanel.tsx), round pour le numéro affiché.
  const [estMonTour, setEstMonTour] = useState(false)
  const [ordreInitiative, setOrdreInitiative] = useState<{ nom: string; enCours: boolean; aJoue: boolean }[]>([])
  const [round, setRound] = useState(1)
  // Portraits des créatures de la rencontre (id → data URL), reçus au fil de l'eau (voir 'image-cible'
  // dans reseauProtocole.ts, envoyé une seule fois par créature côté MJ) — jamais réinitialisé (une
  // entrée obsolète pour une créature qui n'est plus dans la rencontre est sans conséquence, juste
  // inutilisée par la vue Combat de GameModePanel.tsx).
  const [imagesCibles, setImagesCibles] = useState<Record<string, string>>({})
  // Missions de la compagnie, synchronisées en direct par le MJ (voir 'compagnie-missions-maj' dans
  // reseauProtocole.ts) — null tant qu'aucune mise à jour n'a encore été reçue, pour que l'appelant
  // (CharacterCompagnieTab.tsx) sache qu'il faut alors se rabattre sur la donnée locale/importée
  // (compagnie.missions) plutôt que de croire à une compagnie sans aucune mission.
  const [compagnieMissions, setCompagnieMissions] = useState<MissionCompagnie[] | null>(null)
  // Dialogue scoped aux volontaires d'une mission (voir 'message-mission-recu') — toutes les missions
  // confondues, filtré par missionId côté appelant (GameModePanel.tsx), même principe que journal.
  const [missionChat, setMissionChat] = useState<{ missionId: string; expediteurNom: string; texte: string }[]>([])
  const socketRef = useRef<WebSocket | null>(null)
  const prochainId = useRef(0)
  const onDegatsRecusRef = useRef(onDegatsRecus)
  useEffect(() => { onDegatsRecusRef.current = onDegatsRecus })
  const onObjetMagiqueRecuRef = useRef(onObjetMagiqueRecu)
  useEffect(() => { onObjetMagiqueRecuRef.current = onObjetMagiqueRecu })
  const onObjetClassiqueRecuRef = useRef(onObjetClassiqueRecu)
  useEffect(() => { onObjetClassiqueRecuRef.current = onObjetClassiqueRecu })
  const onPvActualisesRecuRef = useRef(onPvActualisesRecu)
  useEffect(() => { onPvActualisesRecuRef.current = onPvActualisesRecu })
  const onNouveauTourRecuRef = useRef(onNouveauTourRecu)
  useEffect(() => { onNouveauTourRecuRef.current = onNouveauTourRecu })
  // Mémorisé pour pouvoir se réidentifier sur demande (voir 'qui-etes-vous' ci-dessous) sans redemander
  // le personnage à l'appelant — le MJ peut perdre sa correspondance connexion↔nom (changement d'onglet
  // qui démonte CombatTab, voir reseauProtocole.ts) alors que cette connexion, elle, reste ouverte.
  const characterRef = useRef<Character | null>(null)

  const ajouterJournal = useCallback((texte: string, categorie?: CategorieJournal) => {
    prochainId.current += 1
    const id = prochainId.current
    setJournal(prev => [{ id, texte, categorie }, ...prev].slice(0, 200))
    return id
  }, [])

  const deconnecter = useCallback(() => {
    socketRef.current?.close()
    socketRef.current = null
    setConnecte(false)
  }, [])

  // character : envoyé au MJ dès l'ouverture de la connexion (voir reseauProtocole.ts) pour qu'il puisse
  // associer cette connexion à un PJ de sa rencontre par nom, et le proposer en attente dans son tiroir
  // (voir pjsEnAttente/activerPJ dans CombatTab.tsx) — pas d'id stable disponible côté personnage, cf.
  // la note dans reseauProtocole.ts.
  const connecter = useCallback((ip: string, character: Character) => {
    socketRef.current?.close()
    characterRef.current = character
    const socket = new WebSocket(`ws://${ip}:${PORT_RESEAU}`)
    socket.onopen = () => {
      setConnecte(true)
      socket.send(encoderMessage({ type: 'identification', nom: character.nomPersonnage, idPJ: idPJ(character), character }))
    }
    socket.onmessage = e => {
      const contenu = String(e.data)
      const message = decoderMessage(contenu)
      if (message?.type === 'degats-recus') {
        onDegatsRecusRef.current?.({ montant: message.montant, typeDegats: message.typeDegats, toucheRate: message.toucheRate })
        const texte = message.toucheRate
          ? t('gameMode.reseau.attaqueRateeJournal')
          : t('gameMode.reseau.degatsRecusJournal', { montant: message.montant, type: message.typeDegats || t('gameMode.dmTypeGenerique') })
        ajouterJournal(texte, 'degatsRecus')
      } else if (message?.type === 'message-mj') {
        // diffusion 'tous' = message de groupe (voir MessageReseau dans reseauProtocole.ts) — tagué
        // différemment du message privé pour qu'on sache d'un coup d'œil s'il n'y a que soi qui l'a reçu.
        ajouterJournal(
          message.diffusion === 'tous'
            ? t('gameMode.reseau.messageATousJournal', { texte: message.texte })
            : t('gameMode.reseau.messagePriveJournal', { texte: message.texte }),
          'messageMJ',
        )
        setMessageNonLu(true)
      } else if (message?.type === 'image-mj') {
        const id = ajouterJournal(t('gameMode.reseau.imageMJJournal'), 'imageMJ')
        const entries = Object.entries(imagesRecuesRef.current)
        if (entries.length >= 30) delete imagesRecuesRef.current[Number(entries[0][0])]
        imagesRecuesRef.current[id] = message.dataUrl
        setImageAffichee(message.dataUrl)
        setMessageNonLu(true)
      } else if (message?.type === 'objet-magique-mj') {
        onObjetMagiqueRecuRef.current?.(message.objet)
        ajouterJournal(t('gameMode.reseau.objetMagiqueMJJournal', { nom: message.objet.nom }), 'objetMagique')
        setMessageNonLu(true)
      } else if (message?.type === 'objet-classique-mj') {
        onObjetClassiqueRecuRef.current?.(message.categorie, message.objet)
        ajouterJournal(t('gameMode.reseau.objetClassiqueMJJournal', { nom: message.objet.nom }), 'objetClassique')
        setMessageNonLu(true)
      } else if (message?.type === 'pv-actualises') {
        // Le MJ vient de modifier les PV à la main (voir reseauProtocole.ts) — appliqué directement,
        // sans passer par applyPVLoss/applyHeal côté GameModePanel (qui émettraient ce même message en
        // retour vers le MJ, créant un aller-retour inutile).
        onPvActualisesRecuRef.current?.(message.pvActuels)
        ajouterJournal(t('gameMode.reseau.pvActualisesMJJournal', { pv: message.pvActuels }), 'pvActualises')
        setMessageNonLu(true)
      } else if (message?.type === 'message-pj-recu') {
        // Dialogue entre PJ relayé par le MJ (voir 'message-pj'/'message-pj-recu' dans
        // reseauProtocole.ts) — catégorie dialoguePJ, distincte de messageMJ (messages du MJ lui-même).
        ajouterJournal(t('gameMode.reseau.dialoguePJJournal', { nom: message.expediteurNom, texte: message.texte }), 'dialoguePJ')
        setMessageNonLu(true)
      } else if (message?.type === 'roster-pj') {
        // Liste des PJ connectés (voir reseauProtocole.ts) — filtre notre propre idPJ, on ne s'envoie pas
        // de dialogue à soi-même. Pas de ligne de journal, purement une mise à jour de liste silencieuse.
        const monId = characterRef.current ? idPJ(characterRef.current) : null
        setRosterPJ(message.joueurs.filter(j => j.idPJ !== monId))
      } else if (message?.type === 'etat-ciblage') {
        // Poussé par le MJ à chaque changement pertinent (voir reseauProtocole.ts) — pas de ligne de
        // journal, purement une mise à jour de liste silencieuse (même traitement que 'roster-pj').
        setCiblesDisponibles(message.ciblesDisponibles)
        setCiblesSurMoi(message.ciblesSurMoi)
        setCompagnonsEtat(message.compagnons)
        setEstMonTour(message.estMonTour)
        setOrdreInitiative(message.ordreInitiative)
        setRound(message.round)
      } else if (message?.type === 'image-cible') {
        // Portrait d'une créature de la rencontre (voir reseauProtocole.ts) — fusionné dans le cache,
        // pas de ligne de journal (même traitement silencieux que 'etat-ciblage').
        setImagesCibles(prev => ({ ...prev, [message.id]: message.dataUrl }))
      } else if (message?.type === 'compagnie-missions-maj') {
        // Diffusé par le MJ après chaque mutation des missions (voir reseauProtocole.ts) — mise à jour de
        // liste silencieuse, pas de ligne de journal (même traitement que 'roster-pj'/'etat-ciblage').
        setCompagnieMissions(message.missions)
      } else if (message?.type === 'message-mission-recu') {
        // Dialogue de mission relayé par le MJ (voir 'message-mission'/'message-mission-recu' dans
        // reseauProtocole.ts) — accumulé pour toutes les missions, filtré par missionId côté appelant.
        setMissionChat(prev => [...prev, { missionId: message.missionId, expediteurNom: message.expediteurNom, texte: message.texte }].slice(-200))
      } else if (message?.type === 'nouveau-tour') {
        // Tour suivant déclenché par le MJ côté rencontre (voir reseauProtocole.ts) : pas de ligne de
        // journal, le bouton local "Tour suivant" n'en affiche pas non plus.
        onNouveauTourRecuRef.current?.()
      } else if (message?.type === 'qui-etes-vous') {
        // Pure mécanique interne de reconnexion (voir reseauProtocole.ts) : pas de ligne de journal,
        // ça n'apporte rien au joueur de le voir.
        if (characterRef.current) {
          socket.send(encoderMessage({ type: 'identification', nom: characterRef.current.nomPersonnage, idPJ: idPJ(characterRef.current), character: characterRef.current }))
        }
      } else if (!message) {
        // Pas un message de protocole reconnu : texte de test brut (voir "message de test"), affiché tel quel.
        ajouterJournal(contenu)
      }
    }
    socket.onclose = () => setConnecte(false)
    socket.onerror = () => setConnecte(false)
    socketRef.current = socket
  }, [ajouterJournal, t])

  const envoyer = useCallback((contenu: string) => {
    socketRef.current?.send(contenu)
  }, [])

  // Message libre envoyé au MJ (voir 'message-joueur' dans reseauProtocole.ts) — encode ET journalise
  // localement en un seul geste, pour que le joueur retrouve sa propre trace dans son journal, comme
  // pour les messages qu'il reçoit (signalé par Didic : jusqu'ici seuls les messages reçus y figuraient).
  const envoyerMessageJoueur = useCallback((texte: string) => {
    socketRef.current?.send(encoderMessage({ type: 'message-joueur', texte }))
    ajouterJournal(t('gameMode.reseau.messageEnvoyeJournal', { texte }), 'messageJoueur')
  }, [ajouterJournal, t])

  // Dialogue entre PJ (voir 'message-pj' dans reseauProtocole.ts et rosterPJ pour choisir un
  // destinataire) — le MJ relaie au seul destinataire visé (sauf s'il a coupé le dialogue pour nous), ou
  // à tous les autres joueurs si destinataireIdPJ est omis (comportement par défaut tant qu'aucun
  // destinataire précis n'est choisi, voir GameModePanel.tsx). Jamais traité comme un message au MJ.
  // destinataireNom : juste pour l'écho local (qui n'a pas besoin de repasser par le MJ pour savoir à qui
  // on vient d'écrire) — "Tous" quand destinataireIdPJ est omis.
  const envoyerMessagePJ = useCallback((destinataireIdPJ: string | undefined, destinataireNom: string, texte: string) => {
    socketRef.current?.send(encoderMessage({ type: 'message-pj', ...(destinataireIdPJ ? { destinataireIdPJ } : {}), texte }))
    ajouterJournal(t('gameMode.reseau.dialoguePJEnvoyeJournal', { nom: destinataireNom, texte }), 'dialoguePJ')
  }, [ajouterJournal, t])

  // Se porter volontaire pour une mission de compagnie (voir 'mission-volontaire' dans
  // reseauProtocole.ts) — le MJ résout notre nom via identitesRef, pas besoin de le transmettre ici (même
  // principe que 'message-pj'/'message-joueur').
  const envoyerVolontaireMission = useCallback((missionId: string) => {
    socketRef.current?.send(encoderMessage({ type: 'mission-volontaire', missionId }))
  }, [])

  // Dialogue scoped aux volontaires d'une mission (voir 'message-mission' dans reseauProtocole.ts) — le
  // MJ relaie aux AUTRES volontaires actuellement connectés de cette mission, jamais à tout le roster ;
  // il ne nous le renvoie donc jamais à nous-même — écho local immédiat dans missionChat pour que
  // l'expéditeur voie tout de suite son propre message dans le fil, comme dans n'importe quel chat.
  const envoyerMessageMission = useCallback((missionId: string, texte: string) => {
    socketRef.current?.send(encoderMessage({ type: 'message-mission', missionId, texte }))
    const monNom = characterRef.current?.nomPersonnage ?? t('gameMode.reseau.moi')
    setMissionChat(prev => [...prev, { missionId, expediteurNom: monNom, texte }].slice(-200))
  }, [t])

  // La cible que ce PJ vient de choisir dans son propre Mode de jeu (voir 'cible-choisie' dans
  // reseauProtocole.ts et la section Combat de GameModePanel.tsx) — le MJ l'applique via l'updatePJ
  // existant, même chemin qu'un choix fait depuis son propre SelecteurCible.
  const envoyerCibleChoisie = useCallback((cibleId: string | null) => {
    socketRef.current?.send(encoderMessage({ type: 'cible-choisie', cibleId }))
  }, [])

  // Symétrique, pour l'UN des compagnons du PJ (voir 'cible-choisie-compagnon' dans reseauProtocole.ts).
  const envoyerCibleChoisieCompagnon = useCallback((compagnonNom: string, cibleId: string | null) => {
    socketRef.current?.send(encoderMessage({ type: 'cible-choisie-compagnon', compagnonNom, cibleId }))
  }, [])

  // Ce PJ (ou l'UN de ses compagnons, si compagnonNom fourni) choisit de ne pas agir tout de suite sur
  // son tour et de passer en fin d'ordre du round en cours (voir 'attendre-mon-tour' dans
  // reseauProtocole.ts) — n'a de sens que quand c'est effectivement son tour (voir estMonTour/
  // compagnonsEtat[].estSonTour), laissé à l'appelant de vérifier.
  const envoyerAttendreMonTour = useCallback((compagnonNom?: string) => {
    socketRef.current?.send(encoderMessage({ type: 'attendre-mon-tour', ...(compagnonNom ? { compagnonNom } : {}) }))
  }, [])

  const marquerMessagesLus = useCallback(() => setMessageNonLu(false), [])

  // Rouvre une image déjà reçue depuis sa ligne de journal (voir imagesRecuesRef ci-dessus).
  const ouvrirImage = useCallback((id: number) => {
    const dataUrl = imagesRecuesRef.current[id]
    if (dataUrl) setImageAffichee(dataUrl)
  }, [])
  const fermerImage = useCallback(() => setImageAffichee(null), [])

  // Ferme proprement la connexion si le panneau (ou l'app) se démonte pendant qu'on est connecté.
  useEffect(() => () => { socketRef.current?.close() }, [])

  return {
    connecte, journal, connecter, deconnecter, envoyer, envoyerMessageJoueur, envoyerMessagePJ, rosterPJ, messageNonLu, marquerMessagesLus,
    imageAffichee, ouvrirImage, fermerImage, ciblesDisponibles, ciblesSurMoi, envoyerCibleChoisie, envoyerCibleChoisieCompagnon, imagesCibles, compagnonsEtat,
    estMonTour, ordreInitiative, round, envoyerAttendreMonTour,
    compagnieMissions, missionChat, envoyerVolontaireMission, envoyerMessageMission,
  }
}
