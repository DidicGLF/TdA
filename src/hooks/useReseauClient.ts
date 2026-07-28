import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PORT_RESEAU } from '../utils/reseau'
import { encoderMessage, decoderMessage, idPJ } from '../utils/reseauProtocole'
import type { CategorieJournal } from '../utils/reseauProtocole'
import type { Character } from '../types/character'

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
export function useReseauClient(onDegatsRecus?: (d: DegatsRecus) => void) {
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
  const socketRef = useRef<WebSocket | null>(null)
  const prochainId = useRef(0)
  const onDegatsRecusRef = useRef(onDegatsRecus)
  useEffect(() => { onDegatsRecusRef.current = onDegatsRecus })
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
        ajouterJournal(t('gameMode.reseau.messagePriveJournal', { texte: message.texte }), 'messageMJ')
        setMessageNonLu(true)
      } else if (message?.type === 'image-mj') {
        const id = ajouterJournal(t('gameMode.reseau.imageMJJournal'), 'imageMJ')
        const entries = Object.entries(imagesRecuesRef.current)
        if (entries.length >= 30) delete imagesRecuesRef.current[Number(entries[0][0])]
        imagesRecuesRef.current[id] = message.dataUrl
        setImageAffichee(message.dataUrl)
        setMessageNonLu(true)
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
    connecte, journal, connecter, deconnecter, envoyer, messageNonLu, marquerMessagesLus,
    imageAffichee, ouvrirImage, fermerImage,
  }
}
