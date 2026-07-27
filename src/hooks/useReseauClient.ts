import { useCallback, useEffect, useRef, useState } from 'react'
import { PORT_RESEAU } from '../utils/reseau'

// Client réseau minimal côté joueur (Mode de jeu) — se connecte au mini serveur MJ (voir
// src-tauri/src/reseau.rs et src/components/GMMode/ReseauTab.tsx). Contrairement au serveur, un client
// WebSocket ne nécessite aucun code Rust/Tauri : la CSP de l'app est ouverte (null), donc le WebSocket
// natif du navigateur suffit, comme sur n'importe quelle page web. Étape de test uniquement — pas de
// code de partie ni de découverte réseau, l'IP se saisit à la main pour l'instant.
export interface LigneJournalReseau {
  id: number
  texte: string
}

export function useReseauClient() {
  const [connecte, setConnecte] = useState(false)
  const [journal, setJournal] = useState<LigneJournalReseau[]>([])
  const socketRef = useRef<WebSocket | null>(null)
  const prochainId = useRef(0)

  const ajouterJournal = useCallback((texte: string) => {
    prochainId.current += 1
    setJournal(prev => [{ id: prochainId.current, texte }, ...prev].slice(0, 200))
  }, [])

  const deconnecter = useCallback(() => {
    socketRef.current?.close()
    socketRef.current = null
    setConnecte(false)
  }, [])

  const connecter = useCallback((ip: string) => {
    socketRef.current?.close()
    const socket = new WebSocket(`ws://${ip}:${PORT_RESEAU}`)
    socket.onopen = () => setConnecte(true)
    socket.onmessage = e => ajouterJournal(String(e.data))
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
