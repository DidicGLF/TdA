import type { Character, Arme, ArmureEquipee } from '../types/character'
import type { ObjetMagiqueEntry } from '../types/gameData'
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
  // MJ → un joueur (privé, voir envoyerAClientReseau) ou tous (diffusion, voir envoyerATousReseau) — le
  // choix du transport se fait côté MJ (ReseauTab.tsx), diffusion ci-dessous ne fait que permettre à
  // chaque bout (joueur ET MJ lui-même, dans son propre journal) de savoir lequel c'était pour bien le
  // taguer. Absent = privé (rétrocompatible avec l'ancien format, sans le champ). Affiché dans le journal
  // du panneau réseau du joueur ET signale une notification tant que le panneau n'a pas été rouvert (voir
  // messageNonLu dans useReseauClient).
  | { type: 'message-mj'; texte: string; diffusion?: 'tous' }
  // Joueur → MJ : réponse au message privé (ou tout texte libre) — symétrique de 'message-mj'. Affiché
  // dans le journal du MJ avec le nom du PJ (résolu via identitesRef, voir ReseauTab.tsx), là où l'ancien
  // "message de test" brut n'affichait qu'un id de connexion.
  | { type: 'message-joueur'; texte: string }
  // MJ → un ou plusieurs joueurs (diffusion via envoyerATousReseau, ou ciblée via envoyerAClientReseau —
  // le choix se fait au niveau du transport appelé côté MJ, voir ReseauTab.tsx, jamais dans le message
  // lui-même) : image affichée en plein écran dès réception côté joueur (voir imageAffichee dans
  // useReseauClient.ts). dataUrl déjà compressée (compresserImage, même réglage que les portraits).
  | { type: 'image-mj'; dataUrl: string }
  // MJ → un ou plusieurs joueurs (même diffusion ciblée/à tous que 'image-mj', choisie au niveau du
  // transport côté MJ) : objet magique transmis tel quel — même forme JSON que l'export/import fichier
  // existant (voir exporterObjet dans ObjetMagiqueDetail.tsx et ressembleAObjetMagique dans
  // importTypage.ts), juste transporté par WebSocket plutôt que par un fichier glissé-déposé. Côté
  // joueur, fusionné dans son catalogue perso ET ajouté à ses objets possédés directement (voir
  // gererObjetMagiqueRecuRef dans GameModePanel.tsx) — contrairement à un import fichier classique qui
  // ne fait qu'alimenter le catalogue, recevoir un objet en Mode de jeu doit se traduire immédiatement
  // par "je l'ai" sans étape manuelle supplémentaire dans EquipementModal.
  | { type: 'objet-magique-mj'; objet: ObjetMagiqueEntry }
  // MJ → un ou plusieurs joueurs (même diffusion ciblée/à tous que 'objet-magique-mj') : objet CLASSIQUE
  // (arme/armure du catalogue livré, sans enchantement) — même geste que ci-dessus mais pour l'équipement
  // ordinaire, demandé par Didic en plus des objets magiques. categorie distingue Arme d'ArmureEquipee
  // (formes différentes, voir types/character.ts) puisque le message ne porte qu'un objet à la fois.
  // Côté joueur, ajouté directement à armes/armuresEquipees ET à l'inventaire texte (voir
  // recevoirObjetClassiqueReseau dans App.tsx) — même traitement immédiat que la réception d'un objet
  // magique, pas une simple entrée de catalogue à activer manuellement plus tard.
  | { type: 'objet-classique-mj'; categorie: 'arme' | 'armure'; objet: Arme | ArmureEquipee }
  // Bidirectionnel (joueur → MJ ET MJ → joueur, même forme dans les deux sens) : la valeur ACTUELLE de
  // pvActuels/pvRestants du PJ, hors des deux cas déjà couverts par 'degats'/'degats-recus' (dégâts
  // infligés PAR ce PJ à une cible, ou REÇUS d'une attaque de créature) — un soin (applyHeal), une perte
  // de PV hors attaque de créature (applyPVLoss), ou une édition manuelle du champ PV côté MJ
  // (updatePJ dans CombatTab.tsx) ne passaient par AUCUN de ces deux messages, donc jamais transmis :
  // le MJ ne voyait pas un soin du joueur, et le joueur ne voyait pas le MJ le tuer/soigner à la main.
  // Toujours la valeur absolue (pas un delta) pour rester correct même si un message se perd. Ne
  // déclenche jamais de renvoi en retour à la réception (voir GameModePanel.tsx/CombatTab.tsx) : la
  // valeur reçue est appliquée localement sans repasser par les fonctions qui émettent ce message, pour
  // ne jamais faire d'aller-retour.
  | { type: 'pv-actualises'; pvActuels: number }
  // PJ → MJ, à relayer (voir GameModePanel.tsx, le joueur choisit son destinataire dans la liste donnée
  // par 'roster-pj' ci-dessous) — jamais traité comme un message AU MJ (contrairement à 'message-joueur').
  // destinataireIdPJ présent = dialogue PRIVÉ, relayé à cette seule connexion ; absent = à TOUS les
  // autres joueurs connectés (chat de groupe, comportement par défaut tant qu'aucun destinataire précis
  // n'est choisi — demandé par Didic). Le MJ ne fait que journaliser à part (voir dialoguePJ dans
  // GMDashboard.tsx) et retransmettre en 'message-pj-recu' (voir ReseauTab.tsx), sauf si l'expéditeur a
  // été coupé (voir dialoguesCoupes) — pour que les PJ puissent discuter sans polluer le journal de jeu
  // du MJ, tout en lui laissant un œil dessus (modération).
  | { type: 'message-pj'; destinataireIdPJ?: string; texte: string }
  // MJ → PJ : relais transparent d'un 'message-pj' reçu d'un autre joueur — expediteurNom pour l'affichage
  // (le destinataire ne connaît ni l'idPJ ni le connexionId de qui lui parle).
  | { type: 'message-pj-recu'; expediteurNom: string; texte: string }
  // MJ → tous les joueurs, diffusé à chaque connexion/déconnexion/identification : liste des PJ
  // actuellement connectés (nom + idPJ), pour que chacun puisse choisir un destinataire dans son propre
  // client (voir rosterPJ dans useReseauClient.ts). Contient TOUS les PJ, chacun compris — plus simple à
  // calculer côté MJ (une seule diffusion identique à tous) que de retirer le destinataire lui-même à
  // chaque envoi ; chaque client filtre son propre idPJ localement à la réception.
  | { type: 'roster-pj'; joueurs: { idPJ: string; nom: string }[] }

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
export type CategorieJournal = 'identification' | 'degats' | 'degatsRecus' | 'connexion' | 'deconnexion' | 'decouverte' | 'messageMJ' | 'messageJoueur' | 'imageMJ' | 'objetMagique' | 'objetClassique' | 'pvActualises' | 'dialoguePJ'

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
  // Même violet que l'onglet/les boutons "Objets magiques" ailleurs dans l'app (EquipementModal.tsx),
  // pour rester reconnaissable d'un coup d'œil comme la même famille de fonctionnalité.
  objetMagique: 'rgba(180,130,255,0.95)',
  // Gris-acier plutôt que doré/violet (déjà pris) — équipement ordinaire, pas une famille dorée/magique.
  objetClassique: 'rgba(170,180,195,0.9)',
  // Vert-de-gris neutre, ni la couleur "dégâts" (rouge/orange) ni "soin" — la valeur peut monter ou
  // descendre selon le cas (soin, mort par édition manuelle...), pas de connotation univoque possible.
  pvActualises: 'rgba(150,190,160,0.9)',
  // Lavande — dialogue entre PJ (voir 'message-pj'/dialoguePJ), délibérément distinct de messageJoueur
  // (turquoise, adressé AU MJ) : un canal différent, une couleur différente.
  dialoguePJ: 'rgba(190,170,230,0.9)',
}
