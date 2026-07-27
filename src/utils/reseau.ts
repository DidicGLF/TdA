// Mini serveur réseau local côté Maître de Jeu — plomberie de test (voir src-tauri/src/reseau.rs) :
// démarrer/arrêter le serveur, suivre son état, écouter les messages bruts reçus. Aucun protocole de
// jeu ici, c'est la première étape du chantier réseau (branche feature/reseau-local).
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { UnlistenFn } from '@tauri-apps/api/event'

const isTauri = () =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

// Port fixe du serveur (voir la même constante côté Rust, src-tauri/src/reseau.rs) — partagé ici pour
// que le client (useReseauClient) n'ait pas à le redevenir en dur une seconde fois.
export const PORT_RESEAU = 47821

export interface EtatServeurReseau {
  demarre: boolean
  port: number | null
  code: string | null
  clients: number
}

// Hors Tauri (dev navigateur pur, cf. tauriStorage.ts), le réseau n'existe pas : on renvoie un état
// "à l'arrêt" plutôt que de faire planter l'appelant.
const ETAT_INDISPONIBLE: EtatServeurReseau = { demarre: false, port: null, code: null, clients: 0 }

export async function demarrerServeurReseau(): Promise<number | null> {
  if (!isTauri()) return null
  return invoke<number>('demarrer_serveur')
}

export async function arreterServeurReseau(): Promise<void> {
  if (!isTauri()) return
  await invoke<void>('arreter_serveur')
}

export async function envoyerATousReseau(contenu: string): Promise<void> {
  if (!isTauri()) return
  await invoke<void>('envoyer_a_tous', { contenu })
}

export async function etatServeurReseau(): Promise<EtatServeurReseau> {
  if (!isTauri()) return ETAT_INDISPONIBLE
  return invoke<EtatServeurReseau>('etat_serveur')
}

// Diffuse une requête UDP contenant code sur le réseau local et attend (jusqu'à ~3s côté Rust) la
// réponse du MJ dont le code correspond — voir rechercher_partie dans reseau.rs. Retourne l'IP trouvée,
// ou null si personne n'a répondu (mauvais code, MJ non démarré, réseau qui bloque le broadcast…).
export async function rechercherPartieReseau(code: string): Promise<string | null> {
  if (!isTauri()) return null
  return invoke<string | null>('rechercher_partie', { code })
}

export type EvenementReseau =
  | { type: 'connexion'; id: number }
  | { type: 'deconnexion'; id: number }
  | { type: 'message'; id: number; contenu: string }
  // Diagnostic temporaire de la découverte réseau (voir demarrer_serveur dans reseau.rs) : toute
  // requête UDP de découverte reçue, correspondance ou pas — utile pour voir si le paquet arrive du
  // tout avant de chercher plus loin en cas d'échec.
  | { type: 'decouverte'; source: string; codeRecu: string | null; correspond: boolean }

// Abonnement groupé aux événements émis par reseau.rs — retourne la fonction de désabonnement
// (à appeler dans le cleanup d'un useEffect). Pas d'effet hors Tauri : listen() n'y recevrait jamais
// rien, mais autant éviter l'appel pour rester cohérent avec le reste du fichier.
export async function ecouterReseau(callback: (e: EvenementReseau) => void): Promise<UnlistenFn> {
  if (!isTauri()) return () => {}
  const unlistens = await Promise.all([
    listen<{ id: number }>('reseau:connexion', e => callback({ type: 'connexion', id: e.payload.id })),
    listen<{ id: number; contenu: string }>('reseau:message', e =>
      callback({ type: 'message', id: e.payload.id, contenu: e.payload.contenu })),
    listen<{ id: number }>('reseau:deconnexion', e => callback({ type: 'deconnexion', id: e.payload.id })),
    listen<{ source: string; code_recu: string | null; correspond: boolean }>('reseau:decouverte', e =>
      callback({ type: 'decouverte', source: e.payload.source, codeRecu: e.payload.code_recu, correspond: e.payload.correspond })),
  ])
  return () => unlistens.forEach(u => u())
}
