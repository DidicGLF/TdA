import { useCallback, useEffect, useRef, useState } from 'react'
import { PORT_RESEAU } from '../utils/reseau'
import { encoderMessage, decoderMessage } from '../utils/reseauProtocole'

// Client réseau côté joueur (Mode de jeu) — se connecte au serveur MJ (voir src-tauri/src/reseau.rs et
// src/components/GMMode/CombatTab.tsx). Un client WebSocket ne nécessite aucun code Rust/Tauri : la CSP
// de l'app est ouverte (null), donc le WebSocket natif du navigateur suffit, comme sur n'importe quelle
// page web.
export interface LigneJournalReseau {
  id: number
  texte: string
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
  const [connecte, setConnecte] = useState(false)
  const [journal, setJournal] = useState<LigneJournalReseau[]>([])
  const socketRef = useRef<WebSocket | null>(null)
  const prochainId = useRef(0)
  const onDegatsRecusRef = useRef(onDegatsRecus)
  useEffect(() => { onDegatsRecusRef.current = onDegatsRecus })
  // Mémorisé pour pouvoir se réidentifier sur demande (voir 'qui-etes-vous' ci-dessous) sans redemander
  // le nom à l'appelant — le MJ peut perdre sa correspondance connexion↔nom (changement d'onglet qui
  // démonte CombatTab, voir reseauProtocole.ts) alors que cette connexion, elle, reste ouverte.
  const nomRef = useRef('')

  const ajouterJournal = useCallback((texte: string) => {
    prochainId.current += 1
    setJournal(prev => [{ id: prochainId.current, texte }, ...prev].slice(0, 200))
  }, [])

  const deconnecter = useCallback(() => {
    socketRef.current?.close()
    socketRef.current = null
    setConnecte(false)
  }, [])

  // nom : identifiant envoyé au MJ dès l'ouverture de la connexion (voir reseauProtocole.ts) pour qu'il
  // puisse associer cette connexion à un PJ de sa rencontre, par nom (pas d'id stable disponible côté
  // personnage, cf. la note dans reseauProtocole.ts).
  const connecter = useCallback((ip: string, nom: string) => {
    socketRef.current?.close()
    nomRef.current = nom
    const socket = new WebSocket(`ws://${ip}:${PORT_RESEAU}`)
    socket.onopen = () => {
      setConnecte(true)
      socket.send(encoderMessage({ type: 'identification', nom }))
    }
    socket.onmessage = e => {
      const contenu = String(e.data)
      const message = decoderMessage(contenu)
      if (message?.type === 'degats-recus') {
        onDegatsRecusRef.current?.({ montant: message.montant, typeDegats: message.typeDegats, toucheRate: message.toucheRate })
      } else if (message?.type === 'qui-etes-vous') {
        socket.send(encoderMessage({ type: 'identification', nom: nomRef.current }))
      }
      ajouterJournal(contenu)
    }
    socket.onclose = () => setConnecte(false)
    socket.onerror = () => setConnecte(false)
    socketRef.current = socket
  }, [ajouterJournal])

  const envoyer = useCallback((contenu: string) => {
    socketRef.current?.send(contenu)
  }, [])

  // Ferme proprement la connexion si le panneau (ou l'app) se démonte pendant qu'on est connecté.
  useEffect(() => () => { socketRef.current?.close() }, [])

  return { connecte, journal, connecter, deconnecter, envoyer }
}
