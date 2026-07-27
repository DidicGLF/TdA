// Enveloppe de messages du protocole de jeu réseau (jets/dégâts entre MJ et joueur) — partagée entre
// CombatTab.tsx (MJ) et GameModePanel.tsx (joueur) pour que les deux bouts s'accordent sur une seule
// définition. Même convention {type, ...} que la découverte UDP (reseau.rs) et importTypage.ts.
export type MessageReseau =
  // Envoyé par le joueur dès l'ouverture de la connexion (voir useReseauClient.connecter) : permet au MJ
  // d'associer cette connexion à un PJ de sa rencontre — par nom, comme le fait déjà tout le code de
  // ciblage existant (cibleNom, pas d'id stable disponible pour un PJ, voir CombatPJ dans combat.ts).
  | { type: 'identification'; nom: string }
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
