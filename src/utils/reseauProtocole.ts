import type { Character } from '../types/character'
import { empreinte } from './empreinte'

// Petit hash déterministe (djb2) d'une chaîne — empreinte() renvoie une sérialisation JSON canonique
// complète (ex. {"nomJoueur":"Dodoc",...}), pas affichable telle quelle (en tronquer un fragment
// montrerait un bout de JSON) : ce hash la compacte en une courte clé hexadécimale, à la fois plus
// légère à transmettre sur le réseau et lisible en fragment dans l'UI (journal, joueurs connectés).
function hashCourt(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = ((h * 33) ^ s.charCodeAt(i)) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

// Identité stable d'un PJ pour la mise en correspondance réseau (dédoublonnage de la file d'attente,
// retrouver un PJ déjà engagé après une reconnexion) — nom perso + nom joueur + peuple, réutilisant
// l'empreinte structurelle déjà utilisée pour les comparaisons livré/perso (voir utils/empreinte.ts)
// plutôt que d'inventer un algorithme de sérialisation, puis compactée par hashCourt. Une collision
// nécessiterait que deux personnages partagent EXACTEMENT ces trois valeurs ET tombent sur le même
// hash 32 bits — jugé assez improbable pour une table de jeu. Ne PAS utiliser le connexionId réseau
// (id de socket, voir EvenementReseau) pour cette identité : il change à chaque reconnexion, alors que
// idPJ reste stable tant que le personnage ne change pas.
export function idPJ(character: Character): string {
  return hashCourt(empreinte({ nomPersonnage: character.nomPersonnage, nomJoueur: character.nomJoueur, peuple: character.peuple }))
}

// Enveloppe de messages du protocole de jeu réseau (jets/dégâts entre MJ et joueur) — partagée entre
// CombatTab.tsx (MJ) et GameModePanel.tsx (joueur) pour que les deux bouts s'accordent sur une seule
// définition. Même convention {type, ...} que la découverte UDP (reseau.rs) et importTypage.ts.
export type MessageReseau =
  // Envoyé par le joueur dès l'ouverture de la connexion (voir useReseauClient.connecter) et à chaque
  // réponse à 'qui-etes-vous' : permet au MJ d'associer cette connexion à un PJ de sa rencontre — par
  // idPJ (voir ci-dessus), jamais par nom (deux joueurs pourraient choisir le même nom de personnage).
  // nom reste transmis pour l'affichage humain du journal (ReseauTab.tsx/GameModePanel.tsx), jamais pour
  // du matching. character voyage avec pour que le MJ puisse importer/retrouver automatiquement ce PJ
  // dans sa rencontre sans glisser-déposer de fichier (voir pjsEnAttente/activerPJ dans CombatTab.tsx) —
  // déjà JSON-safe, c'est exactement ce que SaveLoadPanel exporte tel quel.
  | { type: 'identification'; nom: string; idPJ: string; character: Character }
  // Joueur → MJ : montant de dégâts que le joueur vient d'infliger à sa cible (saisi à la main côté
  // joueur, comme le fait aujourd'hui le MJ dans handleAttaquePJ — seule la transmission est automatisée).
  | { type: 'degats'; montant: number; typeDegats: string }
  // MJ → joueur : résultat de l'attaque d'une créature contre ce PJ (voir handleAttaque dans
  // CombatTab.tsx). montant à 0 avec toucheRate=true signifie une attaque ratée (aucun dégât).
  | { type: 'degats-recus'; montant: number; typeDegats: string; toucheRate: boolean }
  // MJ → tous les clients (diffusé, voir envoyerATousReseau) : redemande à chacun de se réidentifier.
  // La correspondance connexion↔nom ne vit que dans une ref de CombatTab (voir clientsPJRef) — un
  // changement d'onglet du tableau de bord MJ démonte/remonte ce composant et la perd, alors que la
  // connexion WebSocket, elle, reste ouverte côté joueur (qui n'a donc aucune raison de renvoyer son
  // identification de lui-même). Diffusé à chaque (re)montage de l'écoute réseau côté MJ.
  | { type: 'qui-etes-vous' }
  // MJ → UN joueur en particulier (voir envoyerAClientReseau, déjà existant au niveau transport) :
  // message privé, invisible des autres joueurs connectés — contrairement au "message à tous" qui reste
  // du texte brut non protocolaire. Affiché dans le journal du panneau réseau du joueur ET signale une
  // notification tant que le panneau n'a pas été rouvert (voir messageNonLu dans useReseauClient).
  | { type: 'message-mj'; texte: string }
  // Joueur → MJ : réponse au message privé (ou tout texte libre) — symétrique de 'message-mj'. Affiché
  // dans le journal du MJ avec le nom du PJ (résolu via identitesRef, voir ReseauTab.tsx), là où l'ancien
  // "message de test" brut n'affichait qu'un id de connexion.
  | { type: 'message-joueur'; texte: string }
  // MJ → un ou plusieurs joueurs (diffusion via envoyerATousReseau, ou ciblée via envoyerAClientReseau —
  // le choix se fait au niveau du transport appelé côté MJ, voir ReseauTab.tsx, jamais dans le message
  // lui-même) : image affichée en plein écran dès réception côté joueur (voir imageAffichee dans
  // useReseauClient.ts). dataUrl déjà compressée (compresserImage, même réglage que les portraits).
  | { type: 'image-mj'; dataUrl: string }

export function encoderMessage(m: MessageReseau): string {
  return JSON.stringify(m)
}

// Retourne null si contenu n'est pas un message structuré reconnu — un texte de test brut (voir le
// champ "message de test" déjà existant dans ReseauTab.tsx/GameModePanel.tsx) doit pouvoir continuer à
// transiter sans être pris pour une erreur de protocole.
export function decoderMessage(contenu: string): MessageReseau | null {
  try {
    const valeur: unknown = JSON.parse(contenu)
    if (valeur && typeof valeur === 'object' && typeof (valeur as { type?: unknown }).type === 'string') {
      return valeur as MessageReseau
    }
  } catch {
    // pas du JSON : message de test brut, pas un message de protocole
  }
  return null
}

// Catégories des lignes de journal réseau (ReseauTab.tsx côté MJ, panneau 🌐 de GameModePanel.tsx côté
// joueur) — palette partagée pour que les deux consoles utilisent les mêmes couleurs par type
// d'événement plutôt que de la redéfinir en double.
export type CategorieJournal = 'identification' | 'degats' | 'degatsRecus' | 'connexion' | 'deconnexion' | 'decouverte' | 'messageMJ' | 'messageJoueur' | 'imageMJ'

export const COULEUR_JOURNAL: Record<CategorieJournal, string> = {
  identification: 'rgba(120,180,255,0.9)', // bleu — arrivée d'un PJ
  degats: 'rgba(255,170,90,0.95)',         // orange — dégâts infligés par un joueur
  degatsRecus: 'rgba(255,120,120,0.95)',   // rouge — dégâts reçus par le joueur
  connexion: 'rgba(120,220,140,0.9)',      // vert — connexion
  deconnexion: 'rgba(245,236,215,0.45)',   // parchemin atténué — déconnexion
  decouverte: 'rgba(200,170,255,0.85)',    // violet — requête de découverte (code de partie)
  messageMJ: 'rgba(201,168,76,0.95)',      // or — message privé du MJ, doit se démarquer du reste
  messageJoueur: 'rgba(120,210,220,0.95)', // turquoise — réponse d'un joueur, distincte de tout le reste
  imageMJ: 'rgba(201,168,76,0.95)',        // or — même famille que messageMJ, distinguée par l'icône 🖼
}
