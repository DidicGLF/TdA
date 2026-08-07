import type { Character, Arme, ArmureEquipee } from '../types/character'
import type { ObjetMagiqueEntry } from '../types/gameData'
import type { MissionCompagnie } from './missions'
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
  // compagnonNom absent = dégâts du PJ lui-même ; présent = dégâts infligés par ce compagnon du PJ
  // (voir handleAttaqueCompagnonPJ dans CombatTab.tsx), appliqués à la cible PROPRE du compagnon
  // (compagnon.cibleId), pas à celle du PJ.
  | { type: 'degats'; montant: number; typeDegats: string; compagnonNom?: string }
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
  // MJ → tous les clients (diffusé, voir envoyerATousReseau) : signale un nouveau tour de combat —
  // déclenché par le bouton "Tour suivant" côté rencontre du MJ (CombatTab.tsx, tourSuivant). Reçu côté
  // joueur, invoque exactement le même handleEndTurn que le bouton "Tour suivant" LOCAL de
  // GameModePanel.tsx (tick des DoT/effets temporaires ET remise à zéro du budget d'action du tour) —
  // pas un message séparé à traiter différemment, juste un déclenchement à distance de la même logique.
  | { type: 'nouveau-tour' }
  // MJ → un joueur (privé, voir envoyerAClientReseau) : liste des cibles disponibles pour CE PJ — id+nom
  // + juste un booléen "morte" (dérivé de pvActuels<=0 côté MJ, jamais la valeur elle-même), JAMAIS
  // def/rd/pvActuels (voir CombatEntiteInfo dans utils/combat.ts, ce sont précisément les champs qu'un
  // joueur ne doit jamais voir — seules les CARACTÉRISTIQUES/PV restent masqués, pas le fait qu'une
  // créature soit morte, demandé par Didic) — et noms des créatures qui le ciblent actuellement (même
  // information que attaquantsDe() dans CombatTab.tsx, réduite aux noms). enCours : calculé par ID ICI
  // (pas déduit côté joueur en recoupant par nom avec ordreInitiative ci-dessous) — deux ennemis
  // homonymes (ex. plusieurs gobelins identiques) tombaient sinon tous sur la même entrée de l'ordre et
  // affichaient le même statut de sablier, bug signalé par Didic ; id reste toujours unique, pas le nom.
  // compagnons : PV actuels/max des SEULS compagnons DE CE PJ (jamais des ennemis) — sans ça, une
  // créature qui blessait un compagnon restait invisible côté joueur (signalé par Didic), contrairement
  // à ses propres PV déjà transmis via 'pv-actualises' — plus estSonTour, calculé par ID de la même
  // façon (un PJ n'a que 2 compagnons au plus, mais la même règle s'applique par cohérence/sécurité).
  // cible : nom de qui cet ennemi vise actuellement — PJ, compagnon (même d'un AUTRE PJ) ou une autre
  // créature, peu importe, jamais de PV/stats sur cette cible (demandé par Didic). estMonTour : calculé
  // ici (pas déductible côté joueur, qui ne connaît jamais son propre CombatPJ.id de session — seul
  // idPJ(character), un hash d'identité, lui est transmis). ordreInitiative : le tableau complet (ordre
  // d'initiative, voir OrdreInitiativeEntry dans utils/combat.ts) pour l'AFFICHAGE du tableau côté
  // joueur uniquement (juste les noms + un statut enCours/aJoue) — jamais utilisé pour retrouver le
  // statut d'une carte précise (voir enCours/estSonTour ci-dessus, calculés par id pour cet usage-là).
  // round : numéro du round en cours. Renvoyé à chaque changement de session pertinent ET immédiatement
  // à la (ré)identification d'un PJ (voir CombatTab.tsx), pour ne jamais laisser un client reconnecté
  // avec un état périmé.
  | {
      type: 'etat-ciblage'
      ciblesDisponibles: { id: string; nom: string; mort: boolean; enCours: boolean; cible: string | null }[]
      ciblesSurMoi: string[]
      compagnons: { nom: string; pvActuels: number; pvMax: number; estSonTour: boolean }[]
      estMonTour: boolean
      ordreInitiative: { nom: string; enCours: boolean; aJoue: boolean }[]
      round: number
    }
  // Joueur → MJ : la cible que ce PJ vient de choisir dans son propre Mode de jeu (voir la nouvelle
  // section Combat de GameModePanel.tsx). null = plus aucune cible choisie. Le MJ applique directement
  // via l'updatePJ existant (CombatTab.tsx) — même chemin qu'un choix fait depuis SelecteurCible côté MJ,
  // aucune divergence de source de vérité pour cibleId.
  | { type: 'cible-choisie'; cibleId: string | null }
  // Joueur → MJ : la cible que ce PJ vient de choisir pour l'UN de ses compagnons (voir la carte
  // compagnon dans GameModePanel.tsx) — symétrique de 'cible-choisie' ci-dessus, mais compagnonNom
  // identifie DE QUI il s'agit (un PJ peut avoir jusqu'à 2 compagnons actifs). Le MJ résout le compagnon
  // via pjProprietaireId + le nom (voir CombatTab.tsx, même appariement que pour 'degats'.compagnonNom)
  // et applique via l'updateCompagnon existant.
  | { type: 'cible-choisie-compagnon'; compagnonNom: string; cibleId: string | null }
  // Joueur → MJ : ce PJ (ou l'UN de ses compagnons, si compagnonNom présent) choisit de ne pas agir
  // tout de suite sur son tour et de passer en fin d'ordre du round en cours ("attendre que tout le
  // monde ait attaqué pour faire son action", demandé par Didic) — n'est envoyé que quand c'est
  // effectivement le tour de l'entité concernée (voir estMonTour/estSonTour ci-dessus), donc son entrée
  // est forcément à tourActuelIndex côté MJ (voir handleAttendreMonTour dans CombatTab.tsx).
  | { type: 'attendre-mon-tour'; compagnonNom?: string }
  // MJ → un joueur (privé) : portrait d'une créature ennemie de la rencontre (voir la vue Combat en
  // cartes de GameModePanel.tsx). Contrairement au portrait du PJ et de ses compagnons (déjà présents
  // localement dans son propre personnage, aucun transport nécessaire), l'image d'une créature n'existe
  // que sur le disque du MJ (voir imageStore.ts) — il faut donc la transmettre explicitement, comme pour
  // 'image-mj'. Envoyée UNE SEULE FOIS par créature et par connexion (voir imagesEnvoyeesRef dans
  // CombatTab.tsx), jamais republiée à chaque changement de session comme 'etat-ciblage' — trop lourd à
  // renvoyer en entier à chaque attaque/PV modifié.
  | { type: 'image-cible'; id: string; dataUrl: string }
  // Joueur → MJ : ce PJ se porte volontaire pour la mission désignée (voir utils/missions.ts). Le nom
  // de l'expéditeur n'a pas besoin de voyager dans le message : le MJ le résout via identitesRef, comme
  // pour 'message-pj' (voir ReseauTab.tsx). Traité seulement si la mission accepte encore des volontaires
  // (voir peutSePorterVolontaire) — sinon ignoré silencieusement côté MJ. compagnieId (depuis le chantier
  // multi-compagnies) permet au MJ de retrouver la bonne compagnie sans parcourir toutes celles en
  // mémoire — un PJ n'étant membre que d'une seule à la fois, il connaît toujours la sienne.
  | { type: 'mission-volontaire'; compagnieId: string; missionId: string }
  // MJ → UN client ciblé (pas diffusé à tous, voir envoyerAClientReseau) : la liste À JOUR des missions
  // de LA compagnie de ce joueur, envoyée après chaque mutation de ses missions (création, volontariat
  // accepté, lancement, résolution) et à son identification — c'est la seule donnée de compagnie
  // synchronisée en direct ; le reste (identité, renommée, membres) ne circule que via l'export/import
  // JSON manuel déjà existant. Un joueur ne reçoit jamais les missions d'une compagnie dont il n'est pas
  // membre.
  | { type: 'compagnie-missions-maj'; compagnieId: string; missions: MissionCompagnie[] }
  // Joueur → MJ, à relayer aux AUTRES volontaires de cette mission uniquement (pas au roster entier
  // comme 'message-pj' sans destinataire) — le dialogue de mission, voir GameModePanel.tsx. Le MJ
  // retrouve les volontaires actuellement connectés en croisant missions[...].volontaires (des noms,
  // dans la compagnie compagnieId) avec identitesRef (voir ReseauTab.tsx), puis relaie en
  // 'message-mission-recu'.
  | { type: 'message-mission'; compagnieId: string; missionId: string; texte: string }
  // MJ → un participant de la mission : relais transparent d'un 'message-mission' reçu d'un autre
  // volontaire — même principe que 'message-pj-recu'.
  | { type: 'message-mission-recu'; compagnieId: string; missionId: string; expediteurNom: string; texte: string }

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
export type CategorieJournal = 'identification' | 'degats' | 'degatsRecus' | 'connexion' | 'deconnexion' | 'decouverte' | 'messageMJ' | 'messageJoueur' | 'imageMJ' | 'objetMagique' | 'objetClassique' | 'pvActualises' | 'dialoguePJ' | 'dialogueMission'

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
  // Vert doré — dialogue de mission (voir 'message-mission'/'mission-volontaire'), distinct du dialogue
  // PJ général (lavande) pour repérer d'un coup d'œil qu'il s'agit d'un sous-groupe (les volontaires
  // d'une mission précise), pas de tous les PJ connectés.
  dialogueMission: 'rgba(150,200,120,0.9)',
}
