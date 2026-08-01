import { useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { saveDataFile } from '../utils/tauriStorage'
import noteParchmentBg from '../assets/note-parchment.webp'
import type { Note, Campaign, NoteImage, BestiaireEntry, RencontreSauvegardee, NoteMarque } from '../types/gameData'
import { importerImage, chargerImage, estCleImage } from '../utils/imageStore'
import { useImage } from '../hooks/useImage'
import { detecterTypeFichier, messageMauvaisType } from '../utils/importTypage'

const GOLD = '#c9a84c'
const PARCHMENT = '#f5ecd7'
const SECTION_BORDER = 'rgba(201,168,76,0.2)'
// Encre sombre pour le corps de la note : le fond y devient une image de parchemin clair (voir
// noteParchmentBg), donc le texte clair (PARCHMENT) utilisé partout ailleurs dans l'app sombre y
// deviendrait illisible.
const ENCRE = '#2b2013'
// Nombre minimum de caractères avant de lancer la recherche — sous ce seuil, la liste reste
// entière plutôt que de filtrer sur une lettre isolée (résultats trop bruités, quasi tout matche).
const SEUIL_RECHERCHE = 3

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

// Noms de fichiers déjà utilisés par les sauvegardes internes de l'app (voir GameDataContext) — un
// export ne doit JAMAIS pouvoir en réutiliser un : sur Tauri, saveDataFile écrit directement dans
// Documents/TdA/ au nom donné, ce qui écraserait silencieusement la vraie sauvegarde correspondante.
// Comparaison insensible à la casse : Windows/macOS traitent "Notes.json" et "notes.json" comme le
// même fichier même si Linux les distingue.
const NOMS_FICHIERS_RESERVES = new Set([
  'descriptions', 'traits-magiques', 'peuples', 'armes', 'armures', 'voies', 'compagnons',
  'traits-raciaux', 'field-positions', 'sheet-images', 'hidden-voies', 'hidden-peuples',
  'hidden-cultures', 'hidden-compagnons', 'bestiaire', 'bestiaire-perso',
  'bestiaire-illustrations', 'hidden-bestiaire', 'voies-perso', 'descriptions-perso',
  'hidden-voies-perso', 'traits-magiques-perso', 'traits-raciaux-perso', 'compagnons-perso',
  'hidden-compagnons-perso', 'armes-perso', 'armures-perso', 'peuples-perso',
  'hidden-peuples-perso', 'hidden-cultures-perso', 'rencontres-sauvegardees',
  'combats-sauvegardes', 'capacites-bibliotheque', 'notes', 'campagnes', 'note-images',
  'gm-notes', 'gm-campagnes', 'gm-note-images', 'batailles-sauvegardees', 'batailles-modeles',
])

function nomFichierExport(base: string, secours: string): string {
  let safe = base.replace(/[^a-zA-Z0-9À-ÿ _-]/g, '').trim().replace(/\s+/g, '-') || secours
  if (NOMS_FICHIERS_RESERVES.has(safe.toLowerCase())) safe = `${safe}-export`
  return `${safe}.json`
}

// Écrire dans une note ne doit pas ré-écrire (ni même ré-sérialiser) tout le tableau de notes à
// chaque frappe : l'édition reste locale au composant (voir NoteEditor) et n'est répercutée dans
// l'état global (donc sauvegardée) qu'après une pause dans la saisie.
const SAVE_DEBOUNCE_MS = 800

const genId = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : String(Date.now())

// Comparaison insensible à la casse ET aux accents — pour reconnaître les mots-clés "créature"/
// "rencontre" (voir suggestions ci-dessous) même tapés sans accent.
function normaliser(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

// Repère un lien wiki en cours de frappe : si le curseur se trouve juste après un "[[" pas encore
// refermé par "]]" (ni suivi d'un saut de ligne), renvoie ce qui a été tapé depuis ce "[[" — sert de
// filtre pour la liste de suggestions de notes existantes. Un "[[" précédé de "!" appartient à une
// référence d'image (![[...]]) et n'est pas un lien de note en cours — sinon éditer l'intérieur d'une
// référence d'image (ex. ajouter |Alias) déclenchait à tort l'autocomplétion et la création de notes.
function lienEnCours(texte: string, curseur: number): string | null {
  const avantCurseur = texte.slice(0, curseur)
  const dernierOuvrant = avantCurseur.lastIndexOf('[[')
  if (dernierOuvrant === -1 || avantCurseur[dernierOuvrant - 1] === '!') return null
  const entre = avantCurseur.slice(dernierOuvrant + 2)
  if (entre.includes(']]') || entre.includes('\n')) return null
  return entre
}

// Détecte le moment précis où un lien en cours de frappe vient d'être refermé par "]]" (et pas une
// simple frappe à l'intérieur d'un lien déjà refermé ailleurs dans le texte) : le curseur était dans
// un lien ouvert juste avant cette frappe (lienAvant non nul) et les deux caractères qui précèdent le
// curseur sont maintenant "]]". Renvoie le titre du lien qui vient d'être validé, sinon null.
function lienVientDEtreFerme(lienAvant: string | null, texte: string, curseur: number): string | null {
  if (lienAvant === null) return null
  if (texte.slice(curseur - 2, curseur) !== ']]') return null
  const avantCurseur = texte.slice(0, curseur)
  const dernierOuvrant = avantCurseur.lastIndexOf('[[')
  if (dernierOuvrant === -1 || avantCurseur[dernierOuvrant - 1] === '!') return null
  const titre = avantCurseur.slice(dernierOuvrant + 2, curseur - 2).trim()
  return titre || null
}

// Noms des images référencées par ![[Nom]] ou ![[Nom|Alias]] dans un texte de note — utilisé pour
// embarquer les images concernées dans un export, afin que la note reste utilisable une fois partagée.
function imagesReferencees(contenu: string): Set<string> {
  const noms = new Set<string>()
  const regex = /!\[\[(.+?)\]\]/g
  let m: RegExpExecArray | null
  while ((m = regex.exec(contenu))) {
    const nom = m[1].split('|')[0].trim().toLowerCase()
    if (nom) noms.add(nom)
  }
  return noms
}

// Réécrit toutes les références ![[AncienNom]] / ![[AncienNom|Alias]] d'une note vers un nouveau nom
// (insensible à la casse) — utilisé à l'import quand une image du fichier reçu doit être renommée pour
// ne pas entrer en collision avec une image du même nom déjà présente.
function renommerReferenceImage(contenu: string, ancienNom: string, nouveauNom: string): string {
  return contenu.replace(/!\[\[(.+?)\]\]/g, (jeton, interieur: string) => {
    const indexPipe = interieur.indexOf('|')
    const nom = (indexPipe === -1 ? interieur : interieur.slice(0, indexPipe)).trim()
    if (nom.toLowerCase() !== ancienNom.toLowerCase()) return jeton
    const reste = indexPipe === -1 ? '' : interieur.slice(indexPipe)
    return `![[${nouveauNom}${reste}]]`
  })
}

// Ce que désigne un lien [[Titre]] : une note existante en priorité (comportement historique, jamais
// cassé par cette extension), sinon — capacité MJ uniquement (bestiaire/rencontres absents côté
// joueur) — une créature du Bestiaire ou une rencontre sauvegardée portant ce nom, sinon rien (le lien
// créera une nouvelle note vide, comportement historique).
type CibleLien =
  | { type: 'note'; note: Note }
  | { type: 'creature'; creature: BestiaireEntry }
  | { type: 'rencontre'; rencontre: RencontreSauvegardee }
  | { type: 'aucun' }

function resoudreLien(titre: string, notes: Note[], bestiaire?: BestiaireEntry[], rencontres?: RencontreSauvegardee[]): CibleLien {
  const q = titre.trim().toLowerCase()
  if (!q) return { type: 'aucun' }
  const note = notes.find(n => n.titre.trim().toLowerCase() === q)
  if (note) return { type: 'note', note }
  const creature = bestiaire?.find(c => c.nom.trim().toLowerCase() === q)
  if (creature) return { type: 'creature', creature }
  const rencontre = rencontres?.find(r => r.nom.trim().toLowerCase() === q)
  if (rencontre) return { type: 'rencontre', rencontre }
  return { type: 'aucun' }
}

// ── Pilotage du curseur/de la sélection d'un <div contentEditable> par décalage de caractères ──
// (l'équivalent de selectionStart/selectionEnd d'un <textarea>, qu'un contentEditable n'expose pas).

function positionVersDecalage(racine: Node, noeud: Node, decalageNoeud: number): number {
  const marcheur = document.createTreeWalker(racine, NodeFilter.SHOW_TEXT)
  let total = 0
  let n: Node | null
  while ((n = marcheur.nextNode())) {
    if (n === noeud) return total + decalageNoeud
    total += n.textContent?.length ?? 0
  }
  return total
}

function decalageVersPosition(racine: Node, decalage: number): { noeud: Node; decalage: number } {
  const marcheur = document.createTreeWalker(racine, NodeFilter.SHOW_TEXT)
  const noeuds: Text[] = []
  let n: Node | null
  while ((n = marcheur.nextNode())) noeuds.push(n as Text)

  // Positionner juste avant un <br> de fin de contenu (voir renderLiveContent) plutôt qu'« à la fin »
  // du dernier nœud texte qui le précède — sinon, sur une ligne vide finale, le curseur reste
  // visuellement collé à la fin de la ligne précédente au lieu d'apparaître sur la ligne vide.
  const finSurBr = (): { noeud: Node; decalage: number } | null =>
    (racine.lastChild && racine.lastChild.nodeName === 'BR')
      ? { noeud: racine, decalage: racine.childNodes.length - 1 }
      : null

  let restant = decalage
  for (let i = 0; i < noeuds.length; i++) {
    const len = noeuds[i].textContent?.length ?? 0
    if (restant < len) return { noeud: noeuds[i], decalage: restant }
    if (restant === len) {
      // Préfère le tout début du nœud suivant (s'il existe) plutôt que la fin de celui-ci : sinon,
      // juste après un saut de ligne, le curseur reste visuellement « collé » à la fin de la ligne
      // précédente au lieu d'apparaître au début de la nouvelle.
      if (i + 1 < noeuds.length) return { noeud: noeuds[i + 1], decalage: 0 }
      return finSurBr() ?? { noeud: noeuds[i], decalage: len }
    }
    restant -= len
  }
  if (noeuds.length > 0) {
    return finSurBr() ?? {
      noeud: noeuds[noeuds.length - 1],
      decalage: noeuds[noeuds.length - 1].textContent?.length ?? 0,
    }
  }
  return finSurBr() ?? { noeud: racine, decalage: 0 }
}

function lireSelection(racine: HTMLElement): { debut: number; fin: number } | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || !sel.anchorNode || !racine.contains(sel.anchorNode)) return null
  const a = positionVersDecalage(racine, sel.anchorNode, sel.anchorOffset)
  const b = sel.focusNode ? positionVersDecalage(racine, sel.focusNode, sel.focusOffset) : a
  return { debut: Math.min(a, b), fin: Math.max(a, b) }
}

function definirSelection(racine: HTMLElement, debut: number, fin: number) {
  const a = decalageVersPosition(racine, debut)
  const b = decalageVersPosition(racine, fin)
  const range = document.createRange()
  range.setStart(a.noeud, a.decalage)
  range.setEnd(b.noeud, b.decalage)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
}

// Position/hauteur de ligne du curseur, relative au conteneur — utilisée pour ancrer la liste de
// suggestions de liens. Un contentEditable expose ça nativement via Range.getClientRects(),
// contrairement à un <textarea> qui demandait un <div> miroir.
function getCaretRect(racine: HTMLElement): { top: number; left: number; ligneHauteur: number } | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0).cloneRange()
  range.collapse(true)
  const rect = range.getClientRects()[0] ?? range.getBoundingClientRect()
  const racineRect = racine.getBoundingClientRect()
  return { top: rect.top - racineRect.top, left: rect.left - racineRect.left, ligneHauteur: rect.height || 18 }
}

// Position/largeur (relative au conteneur, comme getCaretRect) de la sélection EN COURS (pas
// collapsée, contrairement à getCaretRect qui force range.collapse(true)) — ancre la barre d'outils
// flottante (gras/italique/lien/image) juste au-dessus du texte sélectionné.
function getSelectionRect(racine: HTMLElement): { top: number; left: number } | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null
  const range = sel.getRangeAt(0)
  const rect = range.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return null
  const racineRect = racine.getBoundingClientRect()
  return { top: rect.top - racineRect.top, left: rect.left - racineRect.left + rect.width / 2 }
}

// Position (relative au conteneur, comme getCaretRect) d'un décalage de caractère arbitraire — pas
// besoin d'y avoir la sélection, contrairement à getCaretRect — utilisée pour placer une icône
// d'ancre directement dans le texte (voir le rendu des ancresPositions dans NoteEditor).
function rectPourDecalage(racine: HTMLElement, decalage: number): { top: number; left: number } | null {
  if (!racine.isConnected) return null
  const pos = decalageVersPosition(racine, decalage)
  const range = document.createRange()
  range.setStart(pos.noeud, pos.decalage)
  range.collapse(true)
  const rect = range.getClientRects()[0] ?? range.getBoundingClientRect()
  const racineRect = racine.getBoundingClientRect()
  return { top: rect.top - racineRect.top, left: rect.left - racineRect.left }
}

// Décalage de caractère (même sens que positionVersDecalage/decalageVersPosition ci-dessus) au-delà
// duquel le texte ne tient plus dans hauteurMax — recherche binaire par mesure de rectangle (comme
// getCaretRect), donc log(n) mesures même pour un gros collage, plutôt qu'une mesure par caractère.
// Sert à couper une page pile où elle déborde (voir onOverflow) : sans ça, le texte en trop restait
// bien présent dans la note mais invisible (overflow caché) et jamais reporté sur la page suivante —
// un collage volumineux semblait alors perdre tout ce qui dépassait l'espace restant.
function trouverPointDeCoupure(el: HTMLElement, hauteurMax: number): number {
  const total = (el.textContent ?? '').length
  if (total === 0) return 0
  const elRect = el.getBoundingClientRect()
  const basRelatif = (decalage: number): number => {
    const pos = decalageVersPosition(el, decalage)
    const range = document.createRange()
    range.setStart(pos.noeud, pos.decalage)
    range.collapse(true)
    return range.getBoundingClientRect().bottom - elRect.top
  }
  let lo = 0, hi = total
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (basRelatif(mid) <= hauteurMax) lo = mid; else hi = mid - 1
  }
  return lo
}

// Aperçu au survol d'un lien de note ou d'une image — la modale elle-même (contenu affiché, aller à
// la note...) est gérée par l'appelant (NoteEditor), renderLiveContent se contente de signaler quoi
// survoler et où l'ancrer.
// Un fichier exporté doit rester lisible sur une autre machine : les images y sont réincorporées,
// les clés locales (images/…) n'ayant aucun sens ailleurs.
async function imagesAutonomes(images: NoteImage[]): Promise<NoteImage[]> {
  return Promise.all(images.map(async img => (
    estCleImage(img.data) ? { ...img, data: (await chargerImage(img.data)) ?? '' } : img
  )))
}

export type HoverInfo = { type: 'lien'; titre: string } | { type: 'image'; image: NoteImage }

// ── Rendu « en direct » : le Markdown déjà validé (marqueurs des deux côtés présents) s'affiche mis
// en forme avec ses marqueurs masqués (mais toujours présents dans le texte, juste display:none, pour
// que la note reste un Markdown source complet) ; seul le fragment que touche la sélection courante
// s'affiche en clair, pour pouvoir l'éditer — exactement comme Obsidian/Typora en mode « live preview ».
// Une image ![[Nom]] (ou ![[Nom|Texte affiché]]) suit la même logique : un simple mot cliquable tant
// que le curseur n'est pas dedans (l'image elle-même ne s'affiche qu'au survol, voir onHoverStart),
// marqueurs bruts sinon pour l'éditer — comme pour un lien de note, le clic place nativement le
// curseur (span de texte normal, pas de positionnement manuel nécessaire).
function renderLiveContent(
  contenu: string,
  selection: { debut: number; fin: number } | null,
  onLien: (titre: string) => void,
  images: NoteImage[],
  onHoverStart: (info: HoverInfo, rect: DOMRect) => void,
  onHoverEnd: () => void,
  // Le corps de la note s'affiche désormais sur un fond de parchemin clair (voir noteParchmentBg) —
  // le doré/rouge pâle habituel (pensés pour l'app sombre, utilisés ailleurs par cette même fonction
  // dans l'aperçu au survol) y aurait un contraste trop faible pour rester lisible.
  fondClair = false,
): ReactNode[] {
  // Bordeaux (« rubrique » des manuscrits enluminés) plutôt qu'un doré assombri : à contraste égal
  // avec le fond de parchemin clair, le doré reste trop proche en teinte du fond lui-même pour bien
  // se détacher (ratio WCAG ~3.5, sous le seuil de lisibilité de 4.5) alors que le bordeaux y grimpe à ~7.5.
  const couleurLien = fondClair ? '#6b1f2f' : GOLD
  const couleurImageManquante = fondClair ? '#7a1f1f' : 'rgba(255,150,150,0.85)'
  const nodes: ReactNode[] = []
  let key = 0
  let pos = 0
  const chevauche = (debut: number, fin: number) => !!selection && selection.debut <= fin && selection.fin >= debut

  // Contenu d'un passage en gras/italique : les liens [[...]] et images ![[...]] qu'il contient doivent
  // rester interprétés, sinon "**[[Ma note]]**" affiche les crochets en clair et le lien n'est plus
  // cliquable. Le curseur ne peut pas se trouver ici (ce cas est traité en amont par `chevauche`, qui
  // affiche alors le jeton brut) : aucun marqueur n'a donc à être révélé. Comme ailleurs, les marqueurs
  // masqués doivent reconstituer le texte source à l'identique.
  const rendreContenuStyle = (texte: string): ReactNode => {
    const reInterne = /(!\[\[(.+?)\]\]|\[\[(.+?)\]\])/g
    const sous: ReactNode[] = []
    let dernier = 0
    let mi: RegExpExecArray | null
    while ((mi = reInterne.exec(texte))) {
      if (mi.index > dernier) sous.push(<span key={key++}>{texte.slice(dernier, mi.index)}</span>)
      const jetonI = mi[0]
      if (jetonI.startsWith('![[')) {
        const interieur = jetonI.slice(3, -2)
        const indexPipe = interieur.indexOf('|')
        const aAlias = indexPipe !== -1
        const nomImage = (aAlias ? interieur.slice(0, indexPipe) : interieur).trim()
        const texteAffiche = aAlias ? interieur.slice(indexPipe + 1) : interieur
        const prefixeCache = jetonI.slice(0, 3 + (aAlias ? indexPipe + 1 : 0))
        const image = images.find(img => img.nom.toLowerCase() === nomImage.toLowerCase())
        sous.push(<span key={key++} style={{ display: 'none' }}>{prefixeCache}</span>)
        sous.push(
          <span
            key={key++}
            onMouseEnter={image ? e => onHoverStart({ type: 'image', image }, e.currentTarget.getBoundingClientRect()) : undefined}
            onMouseLeave={image ? onHoverEnd : undefined}
            style={image
              ? { color: couleurLien, textDecoration: 'underline', textUnderlineOffset: 2, cursor: 'text' }
              : { color: couleurImageManquante, fontStyle: 'italic', textDecoration: 'underline', textDecorationStyle: 'dashed', textUnderlineOffset: 2 }}
          >
            {texteAffiche}
          </span>
        )
        sous.push(<span key={key++} style={{ display: 'none' }}>{']]'}</span>)
      } else {
        const libelleLien = jetonI.slice(2, -2)
        const titreLien = libelleLien.trim()
        sous.push(<span key={key++} style={{ display: 'none' }}>{'[['}</span>)
        sous.push(
          <span
            key={key++}
            onMouseDown={e => { e.preventDefault(); onLien(titreLien) }}
            onMouseEnter={e => onHoverStart({ type: 'lien', titre: titreLien }, e.currentTarget.getBoundingClientRect())}
            onMouseLeave={onHoverEnd}
            style={{ color: couleurLien, textDecoration: 'underline', textUnderlineOffset: 2, cursor: 'pointer' }}
          >
            {libelleLien}
          </span>
        )
        sous.push(<span key={key++} style={{ display: 'none' }}>{']]'}</span>)
      }
      dernier = mi.index + jetonI.length
    }
    if (sous.length === 0) return texte
    if (dernier < texte.length) sous.push(<span key={key++}>{texte.slice(dernier)}</span>)
    return sous
  }

  const lignes = contenu.split('\n')
  lignes.forEach((ligne, li) => {
    const ligneDebut = pos
    const estListe = ligne.startsWith('- ')
    const cachePuce = estListe && !chevauche(ligneDebut, ligneDebut + 2)

    if (estListe && cachePuce) {
      nodes.push(<span key={key++} style={{ display: 'none' }}>{'- '}</span>)
      nodes.push(<span key={key++} style={{ opacity: 0.55 }}>{'•  '}</span>)
    }

    const decalageLigne = (estListe && cachePuce) ? 2 : 0
    const texteLigne = ligne.slice(decalageLigne)

    const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|!\[\[(.+?)\]\]|\[\[(.+?)\]\])/g
    let dernierIndex = 0
    let m: RegExpExecArray | null
    while ((m = regex.exec(texteLigne))) {
      if (m.index > dernierIndex) nodes.push(<span key={key++}>{texteLigne.slice(dernierIndex, m.index)}</span>)
      const jeton = m[0]
      const debutAbs = ligneDebut + decalageLigne + m.index
      const finAbs = debutAbs + jeton.length
      if (jeton.startsWith('![[')) {
        // ![[Nom]] ou ![[Nom|Texte affiché]] — l'image ne s'affiche jamais en vignette dans le fil du
        // texte (ça alourdirait l'affichage) : seul un mot/texte cliquable apparaît, l'image ne se
        // montre qu'au survol (même aperçu que pour un lien de note).
        //
        // Comme pour gras/italique/lien, les marqueurs masqués ne doivent contenir QUE la syntaxe
        // (jamais le texte affiché en double) : préfixe caché = "![[" + éventuellement "Nom|", texte
        // affiché = ce qui reste, suffixe caché = "]]" — leur somme doit reconstituer `jeton` très
        // exactement, sinon chaque passage caché→affiché regonfle le texte source relu ensuite.
        const interieur = jeton.slice(3, -2)
        const indexPipe = interieur.indexOf('|')
        const aAlias = indexPipe !== -1
        const nomImage = (aAlias ? interieur.slice(0, indexPipe) : interieur).trim()
        const texteAffiche = aAlias ? interieur.slice(indexPipe + 1) : interieur
        const prefixeCache = jeton.slice(0, 3 + (aAlias ? indexPipe + 1 : 0))
        const image = images.find(img => img.nom.toLowerCase() === nomImage.toLowerCase())
        if (chevauche(debutAbs, finAbs)) {
          nodes.push(<span key={key++}>{jeton}</span>)
        } else if (image) {
          nodes.push(<span key={key++} style={{ display: 'none' }}>{prefixeCache}</span>)
          nodes.push(
            <span
              key={key++}
              onMouseEnter={e => onHoverStart({ type: 'image', image }, e.currentTarget.getBoundingClientRect())}
              onMouseLeave={onHoverEnd}
              style={{ color: couleurLien, textDecoration: 'underline', textUnderlineOffset: 2, cursor: 'text' }}
            >
              {texteAffiche}
            </span>
          )
          nodes.push(<span key={key++} style={{ display: 'none' }}>{']]'}</span>)
        } else {
          nodes.push(<span key={key++} style={{ display: 'none' }}>{prefixeCache}</span>)
          nodes.push(
            // Pas de caractères décoratifs ajoutés (icône, "?"...) : ils s'ajouteraient au texte
            // relu par le navigateur au prochain resync et corromperaient la note — le style seul
            // (couleur + soulignement en tirets) signale une référence d'image introuvable.
            <span key={key++} style={{ color: couleurImageManquante, fontStyle: 'italic', textDecoration: 'underline', textDecorationStyle: 'dashed', textUnderlineOffset: 2 }}>
              {texteAffiche}
            </span>
          )
          nodes.push(<span key={key++} style={{ display: 'none' }}>{']]'}</span>)
        }
      } else if (chevauche(debutAbs, finAbs)) {
        nodes.push(<span key={key++}>{jeton}</span>)
      } else if (jeton.startsWith('[[')) {
        const libelleLien = jeton.slice(2, -2)
        const titreLien = libelleLien.trim()
        nodes.push(<span key={key++} style={{ display: 'none' }}>{'[['}</span>)
        nodes.push(
          <span
            key={key++}
            onMouseDown={e => { e.preventDefault(); onLien(titreLien) }}
            onMouseEnter={e => onHoverStart({ type: 'lien', titre: titreLien }, e.currentTarget.getBoundingClientRect())}
            onMouseLeave={onHoverEnd}
            style={{ color: couleurLien, textDecoration: 'underline', textUnderlineOffset: 2, cursor: 'pointer' }}
          >
            {libelleLien}
          </span>
        )
        nodes.push(<span key={key++} style={{ display: 'none' }}>{']]'}</span>)
      } else if (jeton.startsWith('**')) {
        nodes.push(<span key={key++} style={{ display: 'none' }}>{'**'}</span>)
        nodes.push(<strong key={key++}>{rendreContenuStyle(jeton.slice(2, -2))}</strong>)
        nodes.push(<span key={key++} style={{ display: 'none' }}>{'**'}</span>)
      } else {
        nodes.push(<span key={key++} style={{ display: 'none' }}>{'*'}</span>)
        nodes.push(<em key={key++}>{rendreContenuStyle(jeton.slice(1, -1))}</em>)
        nodes.push(<span key={key++} style={{ display: 'none' }}>{'*'}</span>)
      }
      dernierIndex = m.index + jeton.length
    }
    if (dernierIndex < texteLigne.length) nodes.push(<span key={key++}>{texteLigne.slice(dernierIndex)}</span>)

    pos += ligne.length
    if (li < lignes.length - 1) {
      nodes.push('\n')
      pos += 1
    }
  })

  // Une dernière ligne vide (note vide, ou qui se termine juste après un saut de ligne) ne produit
  // aucun nœud texte — sans ancrage, le curseur resterait visuellement collé à la fin de la ligne
  // précédente au lieu d'apparaître sur cette ligne vide. Un <br> ne compte pas dans textContent
  // (donc ne pollue pas le Markdown source relu ensuite) mais donne au navigateur un point où placer
  // le curseur.
  if (lignes[lignes.length - 1] === '') nodes.push(<br key={key++} />)

  return nodes
}

interface NoteEditorProps {
  note: Note
  notes: Note[]
  campagnes: Campaign[]
  noteImages: NoteImage[]
  setNoteImages: Dispatch<SetStateAction<NoteImage[]>>
  mobile?: boolean
  // Capacité réservée au mode MJ (voir GMDashboard) : présents uniquement quand NotesTab est monté
  // depuis le tableau de bord MJ, jamais côté joueur — un [[Titre]] qui ne désigne aucune note peut
  // alors désigner une créature du Bestiaire ou une rencontre sauvegardée (voir resoudreLien).
  bestiaire?: BestiaireEntry[]
  rencontres?: RencontreSauvegardee[]
  onOpenCreature?: (nom: string) => void       // survol/clic d'un lien créature → sa fiche
  onEditRencontre?: (id: string) => void       // bouton « Modifier » de l'aperçu d'un lien rencontre
  // Note : le lancement du combat au clic d'un lien rencontre passe par `onLien` (résolu dans
  // `suivreLien`, côté NotesTab), pas par une prop dédiée ici — NoteEditor n'a pas besoin de le savoir.
  onSave: (patch: Partial<Note>) => void
  onBack: () => void
  onDelete: () => void
  onLien: (titre: string) => void
  onEnsureNote: (titre: string) => void
  // Pagination — la note complète est déjà découpée en pages par le composant parent (séparateur
  // form feed dans note.contenu, voir NotesTab) ; NoteEditor n'édite ici que la page active (fournie
  // dans note.contenu), sans rien savoir des autres pages.
  pageActive: number
  pageCount: number
  onPrevPage: () => void
  onNextPage: () => void
  // Supprime la page active (voir supprimerPage dans NotesTab) — masqué/désactivé s'il n'y a qu'une
  // seule page, une note ne pouvant pas en avoir zéro.
  onDeletePage: () => void
  // texteGarde = ce qui tient encore sur la page actuelle, texteReporte = le reste, à faire commencer
  // la page suivante (voir trouverPointDeCoupure) — un vrai découpage, pas juste "page suivante vide".
  onOverflow?: (texteGarde: string, texteReporte: string) => void
  autoFocus?: boolean
  // Position (ou plage, pour sélectionner un mot trouvé par la recherche) de curseur à restaurer une
  // fois cette page affichée (ex. en arrivant via une ancre de paragraphe ou un résultat de recherche
  // en texte) — n'a d'effet que si autoFocus est vrai. fin === debut pour un simple curseur.
  curseurInitial?: { debut: number; fin: number } | null
  // Marque-pages (note.marques, déjà présents sur `note` — pas une prop séparée) : navigation directe
  // vers une AUTRE page de cette même note (contrairement à onPrevPage/onNextPage, qui n'avancent que
  // d'une page), et création/suppression.
  onGoToPage: (page: number, decalage?: number) => void
  onAjouterMarque: (nom: string, page: number, decalage?: number) => void
  onSupprimerMarque: (marqueId: string) => void
}

const toolbarBtnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)', border: `1px solid ${SECTION_BORDER}`, borderRadius: 4,
  color: 'rgba(245,236,215,0.75)', cursor: 'pointer', fontSize: 13, padding: '4px 10px', fontFamily: 'inherit',
}
// Boutons carrés de la barre d'outils flottante (gras/italique/lien/image, voir bulleFormatPos).
const bulleFormatBtnStyle: React.CSSProperties = {
  background: 'transparent', border: 'none', borderRadius: 4,
  color: PARCHMENT, cursor: 'pointer', fontSize: 14, width: 28, height: 28,
  display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', padding: 0,
}
const metaInputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)', border: `1px solid ${SECTION_BORDER}`, borderRadius: 4,
  color: PARCHMENT, fontSize: 13, padding: '4px 8px', fontFamily: 'inherit',
}
// Boutons-icônes de l'en-tête d'un groupe (▾ ✎ ↑ ↓ +) : boîte carrée identique + centrage flex pour
// que les glyphes (de formes/hauteurs très différentes) s'alignent visuellement entre eux, ce qu'un
// simple lineHeight:1 par bouton ne garantit pas.
const groupeIconBtnStyle: React.CSSProperties = {
  background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
  padding: 0, width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
  flexShrink: 0, lineHeight: 1,
}

// Composant dédié à l'édition d'UNE note, remonté (via key={note.id} côté parent) à chaque
// changement de sélection : titre/contenu vivent en état local, initialisés une seule fois depuis
// la note, et ne sont répercutés dans l'état global (donc sauvegardés) qu'après une pause de frappe
// (voir SAVE_DEBOUNCE_MS) ou en quittant le champ — jamais à chaque caractère tapé.
//
// La zone de texte est un <div contentEditable> plutôt qu'un <textarea> : le Markdown déjà validé
// (ex. "**mot**" une fois le second "**" tapé) s'affiche directement mis en forme, marqueurs masqués —
// seul le fragment sous le curseur redevient du texte brut éditable. La frappe elle-même reste gérée
// nativement par le navigateur (accents/touches mortes/IME inclus) ; on ne fait que relire le texte et
// la position du curseur après coup et re-rendre en conséquence, avec restauration explicite du
// curseur (useLayoutEffect) pour ne jamais le laisser sauter au mauvais endroit.
function NoteEditor({
  note, notes, campagnes, noteImages, setNoteImages, mobile, bestiaire, rencontres, onOpenCreature, onEditRencontre,
  onSave, onBack, onDelete, onLien, onEnsureNote, pageActive, pageCount, onPrevPage, onNextPage, onDeletePage, onOverflow, autoFocus,
  curseurInitial, onGoToPage, onAjouterMarque, onSupprimerMarque,
}: NoteEditorProps) {
  const { t } = useTranslation()
  // onOpenCreature n'existe que côté MJ (voir NoteEditorProps) : sert à distinguer les notes joueur
  // (Notes/) des notes MJ (Maitre de jeu/) — même composant, deux dossiers d'export distincts.
  const dossierExport = onOpenCreature ? 'Maitre de jeu' : 'Notes'
  // Survol du fond de page (parchemin) — la croix de suppression de page ne doit apparaître que
  // pendant ce survol, voir le rendu de la page plus bas.
  const [pageHover, setPageHover] = useState(false)
  const [titre, setTitre] = useState(note.titre)
  const [contenu, setContenu] = useState(note.contenu)
  const [date, setDate] = useState(note.date ?? '')
  // Repère visuel libre — voir Note.couleur, utilisé aussi pour la pastille de cette note dans NotesGraph.
  const [couleur, setCouleur] = useState(note.couleur ?? '')
  const [selection, setSelection] = useState<{ debut: number; fin: number } | null>(null)
  const [lienQuery, setLienQuery] = useState<string | null>(null)
  const [caretPos, setCaretPos] = useState<{ top: number; left: number; ligneHauteur: number } | null>(null)
  // Barre d'outils flottante (gras/italique/lien/image) — n'apparaît que sur une VRAIE sélection de
  // texte (pas juste un curseur), et jamais en même temps que la liste de suggestions [[...]] (les deux
  // se disputeraient la même zone au-dessus du texte).
  const [bulleFormatPos, setBulleFormatPos] = useState<{ top: number; left: number } | null>(null)
  const [preview, setPreview] = useState<HoverInfo | null>(null)
  const [previewRect, setPreviewRect] = useState<{ top: number; left: number } | null>(null)
  // L'aperçu d'image peut porter une clé (images/…) ou une ancienne data URL : useImage résout les deux.
  const apercuSrc = useImage(preview?.type === 'image' ? preview.image.data : null)
  // Panneau des marque-pages (signets/ancres) de cette note — voir la rangée 🔖 dans l'en-tête.
  const [marquesOuvert, setMarquesOuvert] = useState(false)
  // Aide (mise en forme, liens, marque-pages) — remplace le texte d'exemple qu'affichait auparavant
  // le placeholder d'une note vide, qui gênait la lecture une fois du vrai texte tapé par-dessus.
  const [aideOuverte, setAideOuverte] = useState(false)
  const [nomNouveauSignet, setNomNouveauSignet] = useState('')
  const [nomNouvelleAncre, setNomNouvelleAncre] = useState('')
  // Position (relative au conteneur du texte) de chaque ancre de paragraphe présente sur cette page —
  // affichée comme une petite icône directement dans le texte (voir le rendu plus bas), pour repérer
  // une ancre au premier coup d'œil : un simple curseur laissé là après un clic depuis la recherche
  // est peu visible et redevient invisible dès qu'on clique ailleurs.
  const [ancresPositions, setAncresPositions] = useState<{ id: string; top: number; left: number }[]>([])
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editableRef = useRef<HTMLDivElement>(null)
  // État de dépassement mesuré au dernier rendu — sert à ne déclencher onOverflow qu'au moment où la
  // page passe de "tient dans la hauteur visible" à "déborde" (front montant), jamais tant qu'elle
  // reste simplement débordante d'un rendu à l'autre. Le découpage (trouverPointDeCoupure) rend une
  // page tout juste coupée exactement à la limite, mais reste une garde utile en défense : sans elle,
  // n'importe quel autre changement d'état (curseur, sélection...) sur une page encore en léger
  // dépassement redéclencherait un découpage à chaque clic, même sans la moindre frappe.
  // null = pas encore mesuré (page tout juste montée) : ce premier état ne doit jamais déclencher.
  const debordaitAvantRef = useRef<boolean | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const hoverShowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoverHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Après un changement de page déclenché par une navigation (auto au dépassement, boutons ‹ ›, ou
  // clic sur un marque-page), le composant est remonté (key différente côté parent) — on redonne le
  // focus à la nouvelle page pour que la frappe puisse continuer sans clic, et on place le curseur à
  // curseurInitial si fourni (arrivée via une ancre de paragraphe précise, pas juste un signet de
  // page). Absent lors de l'ouverture initiale d'une note (autoFocus alors à false), pour ne pas voler
  // le focus quand on sélectionne juste une note.
  useEffect(() => {
    if (!autoFocus) return
    const el = editableRef.current
    if (!el) return
    if (curseurInitial !== undefined && curseurInitial !== null) {
      const debut = Math.min(curseurInitial.debut, contenu.length)
      const fin = Math.min(curseurInitial.fin, contenu.length)
      definirSelection(el, debut, fin)
    }
    el.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Aperçu au survol (lien de note ou image) : un léger délai avant affichage évite un flash pendant
  // qu'on traverse juste le texte au passage de la souris ; un léger délai avant fermeture laisse le
  // temps de déplacer la souris jusque dans la modale elle-même (ex. pour cliquer « Aller à la note »).
  const annulerFermetureSurvol = () => { if (hoverHideTimerRef.current) { clearTimeout(hoverHideTimerRef.current); hoverHideTimerRef.current = null } }
  const programmerFermetureSurvol = () => {
    annulerFermetureSurvol()
    hoverHideTimerRef.current = setTimeout(() => setPreview(null), 200)
  }
  const handleHoverStart = (info: HoverInfo, rect: DOMRect) => {
    if (hoverShowTimerRef.current) clearTimeout(hoverShowTimerRef.current)
    hoverShowTimerRef.current = setTimeout(() => {
      annulerFermetureSurvol()
      setPreview(info)
      setPreviewRect({ top: rect.bottom + 6, left: rect.left })
    }, 300)
  }
  const handleHoverEnd = () => {
    if (hoverShowTimerRef.current) { clearTimeout(hoverShowTimerRef.current); hoverShowTimerRef.current = null }
    programmerFermetureSurvol()
  }

  // La campagne se réassigne désormais par glisser-déposer dans la liste (pas depuis l'éditeur) : lue
  // directement depuis la prop `note` (pas d'état local) pour rester à jour même si la note reste
  // ouverte pendant qu'on la glisse d'une section à l'autre.
  const campagneNom = campagnes.find(c => c.id === note.campagneId)?.nom

  // Tags : comme la campagne, un ajout/retrait est immédiat (pas de debounce à la frappe — on ajoute
  // un tag entier à la fois, pas caractère par caractère) donc lu directement depuis `note`, pas d'état
  // local dupliqué. La liste des tags déjà utilisés (pour l'autocomplétion) vient des autres notes.
  const tagsActuels = note.tags ?? []
  const [nouveauTag, setNouveauTag] = useState('')
  const tagsExistants = useMemo(
    () => Array.from(new Set(notes.flatMap(n => n.tags ?? []))).sort((a, b) => a.localeCompare(b)),
    [notes]
  )
  const ajouterTag = (tag: string) => {
    const t = tag.trim()
    if (!t || tagsActuels.some(existant => existant.toLowerCase() === t.toLowerCase())) { setNouveauTag(''); return }
    onSave({ tags: [...tagsActuels, t] })
    setNouveauTag('')
  }
  const retirerTag = (tag: string) => onSave({ tags: tagsActuels.filter(t => t !== tag) })

  // Exporte la note (titre/contenu/date/tags — pas campagneId, une référence locale qui ne veut rien
  // dire une fois partagée) accompagnée des images qu'elle référence, pour que le fichier reste
  // utilisable une fois reçu ailleurs plutôt que d'afficher des ![[...]] cassés.
  const [exportMsg, setExportMsg] = useState<string | null>(null)
  const exporterNote = async () => {
    const nomsRef = imagesReferencees(contenu)
    const imagesLiees = noteImages.filter(img => nomsRef.has(img.nom.toLowerCase()))
    const contenuExport = {
      type: 'note' as const,
      note: { titre, contenu, date: date || undefined, tags: tagsActuels.length ? tagsActuels : undefined, couleur: couleur || undefined },
      images: await imagesAutonomes(imagesLiees),
    }
    const jsonContent = JSON.stringify(contenuExport, null, 2)
    const filename = nomFichierExport(titre, 'note')
    const chemin = `${dossierExport}/${filename}`
    if (isTauri) {
      await saveDataFile(chemin, jsonContent)
      setExportMsg(t('notes.exporteVers', { filename: chemin }))
      setTimeout(() => setExportMsg(null), 3000)
    } else {
      const blob = new Blob([jsonContent], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = filename; a.click()
      URL.revokeObjectURL(url)
    }
  }

  // Un seul minuteur de sauvegarde partagé titre/contenu/date/couleur : chaque appel ne fournit que le
  // champ qui vient de changer, les autres sont complétés depuis l'état courant — sinon changer de
  // champ avant l'expiration du délai perdrait le changement précédent. La campagne n'y figure jamais :
  // ne pas l'inclure dans le patch la laisse intacte (fusion superficielle côté appelant).
  const scheduleSave = (patch: Partial<Note>) => {
    const complet: Partial<Note> = {
      titre: patch.titre ?? titre,
      contenu: patch.contenu ?? contenu,
      date: 'date' in patch ? patch.date : (date || undefined),
      couleur: 'couleur' in patch ? patch.couleur : (couleur || undefined),
    }
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => onSave(complet), SAVE_DEBOUNCE_MS)
  }

  const flush = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    onSave({ titre, contenu, date: date || undefined, couleur: couleur || undefined })
  }

  // Insère du texte à la position du curseur (ou en fin de note à défaut) — utilisé pour la référence
  // ![[Nom]] générée après import d'une image.
  const inserer = (texte: string) => {
    const el = editableRef.current
    if (!el) return
    const sel = lireSelection(el) ?? { debut: contenu.length, fin: contenu.length }
    const next = contenu.slice(0, sel.debut) + texte + contenu.slice(sel.fin)
    setContenu(next)
    scheduleSave({ contenu: next })
    const pos = sel.debut + texte.length
    setSelection({ debut: pos, fin: pos })
    requestAnimationFrame(() => el.focus())
  }

  // Lit le fichier choisi, l'ajoute à la bibliothèque d'images partagée (nom dérivé du fichier,
  // dédupliqué comme un système de fichiers) puis insère sa référence à la position du curseur.
  const handleImageFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = async () => {
      const data = reader.result
      if (typeof data !== 'string') return
      const base = file.name.replace(/\.[^./]+$/, '').trim() || 'image'
      // La clé vient du contenu : réimporter la même image retrouve l'entrée existante au lieu d'en
      // créer une copie. C'est ce qui manquait — le fichier contenait 11 exemplaires du même logo,
      // nommés « (2) », « (3) »…, soit 25 Mo de doublons.
      const cle = await importerImage('note', data)
      const existante = noteImages.find(img => img.data === cle)
      if (existante) { inserer(`![[${existante.nom}]]`); return }
      let nom = base
      let n = 2
      while (noteImages.some(img => img.nom.toLowerCase() === nom.toLowerCase())) {
        nom = `${base} (${n})`
        n++
      }
      setNoteImages(prev => [...prev, { id: genId(), nom, data: cle }])
      inserer(`![[${nom}]]`)
    }
    reader.readAsDataURL(file)
  }

  // Applique un changement de contenu déjà décidé (texte inséré + bornes supprimées) : source de
  // vérité unique pour toute mutation, que ce soit via beforeinput, les boutons de mise en forme ou
  // le choix d'une suggestion de lien.
  const appliquerChangement = (debutSuppr: number, finSuppr: number, texteInsere: string) => {
    const next = contenu.slice(0, debutSuppr) + texteInsere + contenu.slice(finSuppr)
    const nouvellePosition = debutSuppr + texteInsere.length
    const titreValide = lienVientDEtreFerme(lienQuery, next, nouvellePosition)
    setContenu(next)
    scheduleSave({ contenu: next })
    setSelection({ debut: nouvellePosition, fin: nouvellePosition })
    setLienQuery(lienEnCours(next, nouvellePosition))
    if (titreValide) onEnsureNote(titreValide)
  }

  // Barre d'outils flottante au-dessus de la sélection (voir bulleFormatPos) — un utilisateur qui ne
  // connaît pas la syntaxe Markdown (**gras**, *italique*) a du mal à formater son texte au clavier
  // seul, demandé explicitement par Didic. Enveloppe la sélection avec le marqueur ; sélection vide
  // (bouton cliqué sans rien sélectionner d'abord) : insère une paire de marqueurs vide et place le
  // curseur ENTRE les deux pour taper directement dedans, plutôt que de laisser le curseur après.
  const appliquerFormatage = (marqueur: '**' | '*') => {
    const el = editableRef.current
    if (!el) return
    const sel = selection ?? { debut: contenu.length, fin: contenu.length }
    const texteSelectionne = contenu.slice(sel.debut, sel.fin)
    appliquerChangement(sel.debut, sel.fin, `${marqueur}${texteSelectionne}${marqueur}`)
    if (texteSelectionne === '') {
      const pos = sel.debut + marqueur.length
      setSelection({ debut: pos, fin: pos })
    }
    requestAnimationFrame(() => el.focus())
  }

  // Bouton lien de la barre flottante : remplace la sélection par "[[" + le texte sélectionné (comme
  // si l'utilisateur venait de le retaper après un "[[" manuel) — appliquerChangement détecte alors
  // tout seul ce lien en cours (lienEnCours) et ouvre la liste de suggestions existante ci-dessous,
  // déjà filtrée sur le texte qui était sélectionné. Sélection vide : ouvre la liste non filtrée
  // (toutes les notes), voir le bouton dédié "créer une note vide" dans cette liste.
  const ouvrirLienDepuisSelection = () => {
    const el = editableRef.current
    if (!el) return
    const sel = selection ?? { debut: contenu.length, fin: contenu.length }
    const texteSelectionne = contenu.slice(sel.debut, sel.fin)
    appliquerChangement(sel.debut, sel.fin, `[[${texteSelectionne}`)
    requestAnimationFrame(() => el.focus())
  }

  // Option "créer une note vide" de la liste de suggestions [[...]] (voir plus bas) : contrairement à
  // choisirSuggestion (qui ne peut choisir qu'une note DÉJÀ existante dans la liste), celle-ci crée
  // d'abord la note si besoin (onEnsureNote, comme le ferait taper un titre inédit puis "]]" à la
  // main) avant d'insérer le lien — un titre vide (liste ouverte sans avoir rien tapé) retombe sur
  // "Sans titre" plutôt que de créer un lien "[[]]" invisible/inutilisable.
  const creerNoteVideEtLier = () => {
    const titre = (lienQuery ?? '').trim() || t('notes.sansTitre')
    onEnsureNote(titre)
    choisirSuggestion(titre)
  }

  // Recharge contenu/sélection depuis le DOM réel — utilisé uniquement pour la composition IME
  // (accents via touche morte, saisie CJK...) qu'on laisse le navigateur gérer nativement (voir
  // composingRef ci-dessous), et comme filet de sécurité si un type d'événement imprévu passait au
  // travers de handleBeforeInput.
  const resyncDepuisDom = (detecterFermeture: boolean) => {
    const el = editableRef.current
    if (!el) return
    const brut = el.textContent ?? ''
    const sel = lireSelection(el)
    const nouvelleSelection = sel ?? { debut: brut.length, fin: brut.length }

    if (detecterFermeture && nouvelleSelection.debut === nouvelleSelection.fin) {
      const titreValide = lienVientDEtreFerme(lienQuery, brut, nouvelleSelection.debut)
      if (titreValide) onEnsureNote(titreValide)
    }

    if (brut !== contenu) {
      setContenu(brut)
      scheduleSave({ contenu: brut })
    }
    setSelection(nouvelleSelection)
    setLienQuery(nouvelleSelection.debut === nouvelleSelection.fin ? lienEnCours(brut, nouvelleSelection.debut) : null)
    // La détection de dépassement de page ne vit plus ici : mesurer scrollHeight juste après un
    // événement natif (keyup...) ne garantit pas que React ait déjà commité le rendu de la dernière
    // frappe (setContenu ci-dessus est asynchrone) — la mesure portait parfois sur l'état affiché AVANT
    // cette frappe. Voir le useLayoutEffect ci-dessous, qui s'exécute toujours après le commit réel.
  }

  // Page pleine : se déclenche à CHAQUE rendu où `contenu` a changé (donc après que React a commité le
  // texte affiché, quelle que soit sa source — frappe normale via beforeinput, IME, collage, insertion
  // d'image...), jamais avant — contrairement à une mesure prise dans un gestionnaire d'événement natif
  // (keyup...), qui pouvait tomber avant que React ait fini de rendre la dernière frappe et manquer le
  // vrai dépassement, ou au contraire mesurer un état déjà périmé. `useLayoutEffect` s'exécute après le
  // commit DOM mais avant que le navigateur affiche quoi que ce soit : aucun flash visible possible.
  // Ne se déclenche que sur le FRONT MONTANT (ne débordait pas → déborde, voir debordaitAvantRef) —
  // jamais tant que la page reste débordante d'un rendu à l'autre, ce qui est son état normal juste
  // après avoir déjà signalé le dépassement : sans cette garde, le moindre autre changement d'état
  // (curseur, sélection...) redéclencherait un découpage à chaque fois. Le texte est réellement coupé
  // au point exact où il déborde (trouverPointDeCoupure) et reporté sur la nouvelle page — un simple
  // collage volumineux qui dépasse largement la page ne perd donc plus sa fin, elle apparaît sur la
  // page suivante au lieu de rester invisible (overflow caché) sur la page d'origine.
  useLayoutEffect(() => {
    const el = editableRef.current
    if (!el) return
    const debordeMaintenant = el.scrollHeight > el.clientHeight + 2
    if (onOverflow && debordeMaintenant && debordaitAvantRef.current === false) {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
      const coupure = trouverPointDeCoupure(el, el.clientHeight)
      onOverflow(contenu.slice(0, coupure), contenu.slice(coupure))
    }
    debordaitAvantRef.current = debordeMaintenant
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contenu])

  // Icône d'ancre : affichée seulement quelques secondes juste après avoir navigué DESSUS (via un
  // marque-page/résultat de recherche — curseurInitial pointe alors précisément sur son décalage),
  // jamais en permanence — sinon elle gênerait la lecture, d'autant plus avec plusieurs ancres sur la
  // même page. Effet de montage uniquement (comme la restauration du curseur ci-dessus) : NoteEditor
  // étant remonté à chaque navigation (voir navigationSeq côté parent), il se redéclenche à chaque fois,
  // y compris en cliquant à nouveau sur la même ancre.
  useLayoutEffect(() => {
    if (!autoFocus || !curseurInitial) return
    const cible = (note.marques ?? []).find(m => m.page === pageActive && m.decalage === curseurInitial.debut)
    if (!cible) return
    const el = editableRef.current
    if (!el) return
    const rect = rectPourDecalage(el, curseurInitial.debut)
    if (!rect) return
    setAncresPositions([{ id: cible.id, ...rect }])
    const timer = setTimeout(() => setAncresPositions([]), 2500)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // « Dernière version » des gestionnaires accessible depuis un écouteur DOM natif attaché une seule
  // fois (voir plus bas) — évite de désabonner/réabonner beforeinput à chaque rendu tout en gardant
  // les fermetures à jour sur titre/contenu/selection courants. Réassigné après CHAQUE rendu (pas de
  // tableau de dépendances) plutôt que pendant le rendu lui-même, qui n'autorise pas l'écriture de refs.
  const composingRef = useRef(false)
  const handleBeforeInputRef = useRef<(e: InputEvent) => void>(() => {})
  useEffect(() => {
    handleBeforeInputRef.current = (e: InputEvent) => {
      // Laisse la composition IME suivre son cours nativement (dead-keys pour les accents, saisie
      // CJK...) : on ne resynchronise qu'à la fin (compositionend), sinon la frappe des accents casse.
      if (composingRef.current) return

      const el = editableRef.current
      if (!el) return
      const sel = lireSelection(el) ?? { debut: contenu.length, fin: contenu.length }
      const type = e.inputType

      let debutSuppr = sel.debut
      let finSuppr = sel.fin
      let texteInsere = ''

      if (type === 'insertText' || type === 'insertReplacementText') {
        texteInsere = e.data ?? ''
      } else if (type === 'insertParagraph' || type === 'insertLineBreak') {
        // Un contentEditable scinde par défaut le contenu en plusieurs <div> à l'Entrée (variable selon
        // le moteur) au lieu d'un simple saut de ligne dans le texte — on gère nous-mêmes l'insertion
        // d'un "\n" pour que le texte reste un Markdown source fidèle.
        texteInsere = '\n'
      } else if (type === 'insertFromPaste' || type === 'insertFromDrop') {
        texteInsere = e.dataTransfer?.getData('text/plain') ?? ''
      } else if (type === 'deleteContentBackward') {
        if (sel.debut === sel.fin && sel.debut > 0) debutSuppr = sel.debut - 1
      } else if (type === 'deleteContentForward') {
        if (sel.debut === sel.fin && sel.fin < contenu.length) finSuppr = sel.fin + 1
      } else {
        // Type non pris en charge ici (ex: formatBold natif via Ctrl+B, historyUndo/historyRedo...) —
        // bloqué plutôt que laissé au navigateur, pour ne jamais le laisser modifier le DOM sans passer
        // par notre état React (c'est exactement ce qui provoquait un crash React à la suppression d'un
        // lien : le navigateur retirait déjà les nœuds que React croyait encore devoir retirer lui-même).
        e.preventDefault()
        return
      }

      e.preventDefault()
      appliquerChangement(debutSuppr, finSuppr, texteInsere)
    }
  })

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') setLienQuery(null)
  }

  // Restaure la sélection logique après chaque re-rendu (le nouveau DOM peut avoir une structure très
  // différente de l'ancien — marqueurs révélés/masqués — sans que la position doive bouger pour autant),
  // et ne recalcule la position d'ancrage des suggestions qu'une fois cette position bien posée.
  useLayoutEffect(() => {
    const el = editableRef.current
    if (!el || !selection || document.activeElement !== el) return
    definirSelection(el, selection.debut, selection.fin)
    setCaretPos(lienQuery !== null && selection.debut === selection.fin ? getCaretRect(el) : null)
    setBulleFormatPos(lienQuery === null && selection.debut !== selection.fin ? getSelectionRect(el) : null)
  }, [contenu, selection, lienQuery])

  // Écouteur natif (pas une prop React onBeforeInput) attaché une seule fois : passe systématiquement
  // par handleBeforeInputRef.current, qui referme sur l'état le plus récent à chaque appel.
  useEffect(() => {
    const el = editableRef.current
    if (!el) return
    const ecouteur = (e: Event) => handleBeforeInputRef.current(e as InputEvent)
    el.addEventListener('beforeinput', ecouteur)
    return () => el.removeEventListener('beforeinput', ecouteur)
  }, [])

  const choisirSuggestion = (titreChoisi: string) => {
    const el = editableRef.current
    if (!el) return
    const sel = lireSelection(el) ?? { debut: contenu.length, fin: contenu.length }
    const avantCurseur = contenu.slice(0, sel.debut)
    const dernierOuvrant = avantCurseur.lastIndexOf('[[')
    if (dernierOuvrant === -1) return
    const avant = contenu.slice(0, dernierOuvrant)
    const apres = contenu.slice(sel.debut)
    const next = `${avant}[[${titreChoisi}]]${apres}`
    setContenu(next)
    scheduleSave({ contenu: next })
    setLienQuery(null)
    const pos = avant.length + titreChoisi.length + 4
    setSelection({ debut: pos, fin: pos })
    requestAnimationFrame(() => el.focus())
  }

  // Suggestions pour l'autocomplétion [[...]] : par défaut des notes existantes (comportement
  // historique, insensible à la casse). Deux mots-clés réservés — capacité MJ uniquement (bestiaire/
  // rencontres absents côté joueur) — donnent accès à des listes dédiées plutôt que de chercher un nom :
  // taper [[créature affiche TOUTE la bibliothèque de créatures, [[rencontre TOUTES les rencontres
  // sauvegardées — la note reçue elle-même n'a jamais ce nom, un filtre par sous-chaîne ne servirait à
  // rien ici. Choisir une suggestion insère son nom réel ([[Gobelin]]) : le mot-clé ne survit pas dans
  // la note, seule la sélection compte.
  const suggestions = useMemo(() => {
    if (lienQuery === null) return []
    const q = normaliser(lienQuery)
    if (bestiaire && q.length >= 3 && normaliser('créature').startsWith(q)) {
      // Le bestiaire comporte volontairement plusieurs fiches de même nom à des NC différents (une
      // même base de PNJ déclinée par niveau) : `key` doit distinguer les entrées (deux créatures de
      // même nom auraient sinon la même clé React), et `sousLabel` affiche le NC pour que l'utilisateur
      // sache lesquelles choisir. Le lien inséré ([[Nom]]) reste néanmoins le nom seul — un lien texte
      // ne peut pas encoder le NC, donc la résolution du lien reste ambiguë entre homonymes malgré tout.
      return bestiaire.map((c, i) => ({
        type: 'creature' as const, titre: c.nom, key: `creature-${i}`, sousLabel: `NC ${c.nc}`,
      })).slice(0, 30)
    }
    if (rencontres && q.length >= 3 && normaliser('rencontre').startsWith(q)) {
      return rencontres.map(r => ({ type: 'rencontre' as const, titre: r.nom, key: `rencontre-${r.id}` })).slice(0, 30)
    }
    return notes
      .filter(n => n.id !== note.id && n.titre.trim() && n.titre.toLowerCase().includes(lienQuery.toLowerCase()))
      .map(n => ({ type: 'note' as const, titre: n.titre, key: `note-${n.id}` }))
      .slice(0, 8)
  }, [lienQuery, notes, note.id, bestiaire, rencontres])
  // "Créer une note vide" (voir creerNoteVideEtLier) n'a de sens qu'en liste de notes classique — pas
  // en train de parcourir le bestiaire/les rencontres (mots-clés réservés [[créature/[[rencontre, voir
  // le useMemo ci-dessus) : mêmes conditions que la branche correspondante, pour rester synchronisé
  // si ces mots-clés changent un jour.
  const estListeSpeciale = lienQuery !== null && (() => {
    const q = normaliser(lienQuery)
    return (!!bestiaire && q.length >= 3 && normaliser('créature').startsWith(q))
      || (!!rencontres && q.length >= 3 && normaliser('rencontre').startsWith(q))
  })()

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', border: `1px solid ${SECTION_BORDER}`, borderRadius: 6, minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: `1px solid ${SECTION_BORDER}` }}>
        {mobile && (
          <button onClick={() => { flush(); onBack() }} style={{ background: 'transparent', border: 'none', color: GOLD, cursor: 'pointer', fontSize: 18, flexShrink: 0, padding: 0 }}>
            ←
          </button>
        )}
        <input
          value={titre}
          onChange={e => { setTitre(e.target.value); scheduleSave({ titre: e.target.value }) }}
          onBlur={flush}
          placeholder={t('notes.titrePlaceholder')}
          style={{
            flex: 1, minWidth: 0, background: 'transparent', border: 'none', color: GOLD,
            fontSize: 18, fontWeight: 700, fontFamily: "'Cinzel', serif", letterSpacing: '0.02em',
          }}
        />
        {/* Pagination — chaque page est une portion du même texte (voir la découpe côté NotesTab),
            « › » navigue vers la page suivante existante ou en crée une vierge si on est déjà sur la
            dernière (même chemin que le déclenchement automatique au dépassement, voir onOverflow). */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }} title={t('notes.pageAide')}>
          <button
            onClick={() => { flush(); onPrevPage() }}
            disabled={pageActive === 0}
            style={{
              background: 'transparent', border: 'none', cursor: pageActive === 0 ? 'default' : 'pointer',
              color: pageActive === 0 ? 'rgba(245,236,215,0.25)' : GOLD, fontSize: 16, padding: '0 2px', lineHeight: 1,
            }}
          >
            ‹
          </button>
          <span style={{ fontSize: 12, color: 'rgba(245,236,215,0.6)', minWidth: 44, textAlign: 'center' }}>
            {t('notes.pageLabel', { page: pageActive + 1, total: pageCount })}
          </span>
          <button
            onClick={() => { flush(); onNextPage() }}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: GOLD, fontSize: 16, padding: '0 2px', lineHeight: 1 }}
          >
            ›
          </button>
        </div>
        {/* Marque-pages : 📌 signet de page, ⚓ ancre sur le paragraphe où se trouve le curseur — les
            deux se retrouvent ensuite via la recherche (voir sections/correspond) et ramènent d'un clic
            à la bonne page (et à la bonne position pour une ancre, voir onGoToPage/curseurInitial). */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={() => setMarquesOuvert(o => !o)}
            title={t('notes.marquesTitre')}
            style={{
              background: marquesOuvert ? 'rgba(201,168,76,0.15)' : 'transparent', border: `1px solid ${SECTION_BORDER}`, borderRadius: 4,
              color: (note.marques ?? []).length > 0 ? GOLD : 'rgba(245,236,215,0.5)', cursor: 'pointer', fontSize: 13, padding: '4px 8px',
            }}
          >
            🔖{(note.marques ?? []).length > 0 ? ` ${(note.marques ?? []).length}` : ''}
          </button>
          {marquesOuvert && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 20, width: 260,
              background: 'rgba(15,12,8,0.98)', border: `1px solid ${SECTION_BORDER}`, borderRadius: 6,
              boxShadow: '0 6px 20px rgba(0,0,0,0.5)', padding: 10, display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  value={nomNouveauSignet}
                  onChange={e => setNomNouveauSignet(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && nomNouveauSignet.trim()) { onAjouterMarque(nomNouveauSignet, pageActive); setNomNouveauSignet('') } }}
                  placeholder={t('notes.nomSignet')}
                  style={{ ...metaInputStyle, flex: 1 }}
                />
                <button
                  onClick={() => { onAjouterMarque(nomNouveauSignet, pageActive); setNomNouveauSignet('') }}
                  disabled={!nomNouveauSignet.trim()}
                  title={t('notes.ajouterSignet')}
                  style={{ ...toolbarBtnStyle, opacity: nomNouveauSignet.trim() ? 1 : 0.4 }}
                >
                  📌
                </button>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  value={nomNouvelleAncre}
                  onChange={e => setNomNouvelleAncre(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && nomNouvelleAncre.trim()) { onAjouterMarque(nomNouvelleAncre, pageActive, selection?.debut ?? contenu.length); setNomNouvelleAncre('') } }}
                  placeholder={t('notes.nomAncre')}
                  style={{ ...metaInputStyle, flex: 1 }}
                />
                <button
                  onClick={() => { onAjouterMarque(nomNouvelleAncre, pageActive, selection?.debut ?? contenu.length); setNomNouvelleAncre('') }}
                  disabled={!nomNouvelleAncre.trim()}
                  title={t('notes.ajouterAncre')}
                  style={{ ...toolbarBtnStyle, opacity: nomNouvelleAncre.trim() ? 1 : 0.4 }}
                >
                  ⚓
                </button>
              </div>
              {(note.marques ?? []).length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, borderTop: `1px solid ${SECTION_BORDER}`, paddingTop: 8, maxHeight: 160, overflowY: 'auto' }}>
                  {(note.marques ?? []).map(m => (
                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button
                        onClick={() => { flush(); onGoToPage(m.page, m.decalage); setMarquesOuvert(false) }}
                        style={{
                          flex: 1, minWidth: 0, textAlign: 'left', background: 'transparent', border: 'none',
                          color: PARCHMENT, cursor: 'pointer', fontSize: 13, padding: '2px 0',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}
                      >
                        {m.decalage !== undefined ? '⚓' : '📌'} {m.nom} <span style={{ opacity: 0.5 }}>· {t('notes.pageAbrege', { page: m.page + 1 })}</span>
                      </button>
                      <button
                        onClick={() => onSupprimerMarque(m.id)}
                        style={{ background: 'transparent', border: 'none', color: 'rgba(245,236,215,0.4)', cursor: 'pointer', fontSize: 12, padding: 0, lineHeight: 1, flexShrink: 0 }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        {exportMsg && <span style={{ fontSize: 11, color: GOLD, flexShrink: 0 }}>{exportMsg}</span>}
        <button
          onClick={exporterNote}
          title={t('notes.exporter')}
          style={{
            background: 'transparent', border: `1px solid ${SECTION_BORDER}`, borderRadius: 4,
            color: 'rgba(245,236,215,0.7)', cursor: 'pointer', fontSize: 14, padding: '4px 8px', flexShrink: 0,
          }}
        >
          ↓
        </button>
        <button onClick={onDelete} style={{
          background: 'transparent', border: '1px solid rgba(255,80,80,0.3)', borderRadius: 4,
          color: 'rgba(255,110,110,0.8)', cursor: 'pointer', fontSize: 14, padding: '4px 8px', flexShrink: 0,
        }}>
          ✕
        </button>
      </div>
      {aideOuverte && (
        <div
          onClick={() => setAideOuverte(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.65)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'rgba(22,17,11,0.99)', border: `1px solid ${SECTION_BORDER}`, borderRadius: 8,
              padding: '24px 28px', maxWidth: 440, width: '90vw', maxHeight: '80vh', overflowY: 'auto',
              boxShadow: '0 8px 40px rgba(0,0,0,0.9)', display: 'flex', flexDirection: 'column', gap: 18,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: GOLD, fontFamily: "'Cinzel', serif" }}>{t('notes.aideTitre')}</span>
              <button onClick={() => setAideOuverte(false)} style={{ background: 'transparent', border: 'none', color: 'rgba(245,236,215,0.6)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: GOLD, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>{t('notes.aideMiseEnFormeTitre')}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: PARCHMENT, opacity: 0.85 }}>
                <span>{t('notes.aideGras')}</span>
                <span>{t('notes.aideItalique')}</span>
                <span>{t('notes.aideListe')}</span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: GOLD, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>{t('notes.aideLiensTitre')}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: PARCHMENT, opacity: 0.85 }}>
                <span>{t('notes.aideLienNote')}</span>
                <span>{t('notes.aideLienImage')}</span>
                {bestiaire && <span>{t('notes.aideLienCreature')}</span>}
                {rencontres && <span>{t('notes.aideLienRencontre')}</span>}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: GOLD, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>{t('notes.aideMarquesTitre')}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: PARCHMENT, opacity: 0.85 }}>
                <span>{t('notes.aideSignetDesc')}</span>
                <span>{t('notes.aideAncreDesc')}</span>
                <span style={{ opacity: 0.7 }}>{t('notes.aideMarquesRecherche')}</span>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Métadonnées + rappel de syntaxe sur une seule ligne (repasse à la ligne si la fenêtre est
          trop étroite) — date, campagne, tags et boutons de formatage tenaient auparavant sur 3 lignes
          distinctes ; les regrouper laisse plus de hauteur à la « page » ci-dessous. */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, padding: '8px 14px', borderBottom: `1px solid ${SECTION_BORDER}` }}>
        <input
          value={date}
          onChange={e => { setDate(e.target.value); scheduleSave({ date: e.target.value || undefined }) }}
          onBlur={flush}
          placeholder={t('notes.datePlaceholder')}
          style={{ ...metaInputStyle, width: 120, flexShrink: 0 }}
        />
        {/* Repère visuel libre — voir Note.couleur, repris pour la pastille de cette note dans
            NotesGraph. Pas de valeur par défaut réellement enregistrée tant que le MJ/joueur ne choisit
            rien : l'input color a besoin d'une valeur hexadécimale valide à afficher, GOLD sert de
            couleur neutre affichée mais jamais sauvegardée (voir scheduleSave, qui n'écrit couleur que
            si elle a été explicitement changée). */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <input
            type="color"
            value={couleur || GOLD}
            onChange={e => { setCouleur(e.target.value); scheduleSave({ couleur: e.target.value }) }}
            onBlur={flush}
            title={t('notes.couleurTitre')}
            style={{
              width: 26, height: 26, padding: 0, border: `1px solid ${SECTION_BORDER}`, borderRadius: 4,
              background: 'transparent', cursor: 'pointer',
            }}
          />
          {couleur && (
            <button
              onClick={() => { setCouleur(''); onSave({ couleur: undefined }) }}
              title={t('notes.couleurEffacer')}
              style={{ background: 'transparent', border: 'none', color: 'rgba(245,236,215,0.4)', cursor: 'pointer', fontSize: 12, padding: 0, lineHeight: 1 }}
            >
              ✕
            </button>
          )}
        </div>
        {campagneNom && (
          <span style={{ fontSize: 12, color: GOLD, opacity: 0.8, flexShrink: 0 }}>📁 {campagneNom}</span>
        )}
        {tagsActuels.map(tag => (
          <span key={tag} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(201,168,76,0.12)',
            border: `1px solid ${SECTION_BORDER}`, borderRadius: 12, padding: '2px 8px', fontSize: 13, color: GOLD, flexShrink: 0,
          }}>
            #{tag}
            <button onClick={() => retirerTag(tag)} style={{ background: 'transparent', border: 'none', color: 'rgba(245,236,215,0.5)', cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1 }}>
              ✕
            </button>
          </span>
        ))}
        <input
          list="tags-existants"
          value={nouveauTag}
          onChange={e => setNouveauTag(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); ajouterTag(nouveauTag) } }}
          onBlur={() => ajouterTag(nouveauTag)}
          placeholder={t('notes.ajouterTag')}
          style={{ ...metaInputStyle, width: 90, flexShrink: 0 }}
        />
        <datalist id="tags-existants">
          {tagsExistants.map(tag => <option key={tag} value={tag} />)}
        </datalist>
        <input ref={imageInputRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFile(f); e.target.value = '' }} />
        <button type="button" onClick={() => imageInputRef.current?.click()} style={toolbarBtnStyle}>
          🖼️ {t('notes.boutonImage')}
        </button>
        <button
          onClick={() => setAideOuverte(true)}
          title={t('notes.aideBouton')}
          style={{
            marginLeft: 'auto', background: 'transparent', border: `1px solid ${SECTION_BORDER}`, borderRadius: '50%',
            color: 'rgba(245,236,215,0.7)', cursor: 'pointer', fontSize: 13, width: 24, height: 24,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0,
          }}
        >
          ?
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ position: 'relative', flex: 1, minHeight: 0, background: 'rgba(0,0,0,0.25)', borderRadius: 4 }}>
          {/* Boutons de page dans le bandeau neutre de part et d'autre de la page — repris ici en grand
              (plutôt que seulement les ‹ › de l'en-tête) puisque cette zone est sinon vide sur un
              panneau large. Mêmes actions que l'en-tête (flush avant de changer de page). */}
          <button
            onClick={() => { flush(); onPrevPage() }}
            disabled={pageActive === 0}
            title={t('notes.pageAide')}
            style={{
              position: 'absolute', left: 4, top: '50%', transform: 'translateY(-50%)', zIndex: 2,
              background: 'transparent', border: 'none', cursor: pageActive === 0 ? 'default' : 'pointer',
              color: pageActive === 0 ? 'rgba(245,236,215,0.15)' : 'rgba(245,236,215,0.5)', fontSize: 32, lineHeight: 1, padding: 8,
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => { if (pageActive !== 0) e.currentTarget.style.color = GOLD }}
            onMouseLeave={e => { e.currentTarget.style.color = pageActive === 0 ? 'rgba(245,236,215,0.15)' : 'rgba(245,236,215,0.5)' }}
          >
            ‹
          </button>
          <button
            onClick={() => { flush(); onNextPage() }}
            title={t('notes.pageAide')}
            style={{
              position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', zIndex: 2,
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'rgba(245,236,215,0.5)', fontSize: 32, lineHeight: 1, padding: 8,
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = GOLD }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(245,236,215,0.5)' }}
          >
            ›
          </button>
          {/* « Page » à l'aspect exact de l'image (portrait) — sa largeur se déduit automatiquement de
              la hauteur disponible (aspectRatio + height:100%) et elle reste centrée horizontalement
              (margin:auto) : l'image ne montre donc jamais qu'une partie de son cadre, ni découpée ni
              recomposée, quitte à laisser un bandeau neutre de chaque côté sur une zone très large. */}
          <div
            onMouseEnter={() => setPageHover(true)}
            onMouseLeave={() => setPageHover(false)}
            style={{
              position: 'relative', height: '100%', minHeight: 300, maxWidth: '100%', aspectRatio: '2480 / 3508', margin: '0 auto',
              backgroundImage: `url(${noteParchmentBg})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat',
              border: `1px solid ${SECTION_BORDER}`, borderRadius: 4,
            }}
          >
            {/* Supprime la page active — posé directement sur l'image de la page (coin haut-droit)
                plutôt que dans l'en-tête, pour qu'il soit sans ambiguïté sur QUELLE page il agit.
                Masqué s'il n'y a qu'une seule page (une note ne peut pas en avoir zéro), et invisible
                tant que la souris n'est pas sur le fond de la page (pageHover). */}
            {pageCount > 1 && (
              <button
                onClick={() => { flush(); onDeletePage() }}
                title={t('notes.supprimerPage')}
                style={{
                  position: 'absolute', top: 23, right: 18, zIndex: 3,
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: '#ff2020', fontSize: 24, padding: 4, lineHeight: 1, fontWeight: 700,
                  opacity: pageHover ? 1 : 0, pointerEvents: pageHover ? 'auto' : 'none',
                  transition: 'opacity 0.15s',
                }}
              >
                ✕
              </button>
            )}
            {/* Zone de texte — décalée des bords de la page pour rester hors de la bordure ornée de
                l'image (marges calées à la main sur l'image, voir le repère visuel utilisé pour les
                déterminer : ~89/214px haut/bas et ~103/215px gauche/droite sur l'image 2480×3508).
                top/bottom en % se calculent contre la HAUTEUR du conteneur ici (positionnement absolu),
                left/right contre la LARGEUR — contrairement à un padding, dont les % seraient TOUS
                calculés contre la largeur (source d'un bug si on avait gardé ces marges en padding). */}
            <div style={{ position: 'absolute', top: '2.54%', right: '10.17%', bottom: '6.10%', left: '5%' }}>
              <div
                ref={editableRef}
                contentEditable
                suppressContentEditableWarning
                onInput={() => { if (!composingRef.current) resyncDepuisDom(true) }}
                onBlur={flush}
                onKeyDown={handleKeyDown}
                onKeyUp={() => resyncDepuisDom(false)}
                onMouseUp={() => resyncDepuisDom(false)}
                onCompositionStart={() => { composingRef.current = true }}
                onCompositionEnd={() => { composingRef.current = false; resyncDepuisDom(true) }}
                style={{
                  // "hidden" et non "auto" : la pagination automatique doit garantir qu'on ne reste
                  // jamais assez longtemps en situation de dépassement pour qu'une scrollbar soit utile —
                  // "auto" ne faisait qu'exposer visuellement l'instant (un cycle de rendu) entre le
                  // dépassement réel et la bascule vers la page suivante, ce qui donnait l'impression que
                  // du texte s'ajoutait sous la zone visible. "hidden" rend ce court instant invisible.
                  width: '100%', height: '100%', boxSizing: 'border-box', overflowY: 'hidden',
                  color: ENCRE, fontSize: 16, fontFamily: 'inherit', lineHeight: 1.6,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word', outline: 'none',
                }}
              >
                {/* eslint-disable-next-line react-hooks/refs -- handleHoverStart/handleHoverEnd ne lisent leurs
                    refs que dans des gestionnaires d'événements différés (onMouseEnter/onMouseLeave...), jamais
                    pendant ce rendu ; renderLiveContent est une fonction pure (pas un composant), le compilateur
                    ne peut pas voir à travers son appel que l'usage est bien différé. */}
                {renderLiveContent(contenu, selection, onLien, noteImages, handleHoverStart, handleHoverEnd, true)}
              </div>
              {/* Icônes d'ancre : petit repère décoratif au-dessus du point exact du texte où chaque
                  ancre de paragraphe de cette page est posée (voir ancresPositions) — pas dans le
                  contentEditable lui-même (casserait les calculs de décalage de caractère utilisés
                  partout ailleurs), juste une superposition en lecture seule par-dessus. Un SVG plutôt
                  que l'emoji ⚓ : la plupart des systèmes le dessinent en emoji couleur, qui ignore
                  totalement la couleur CSS — un noir garanti demande un tracé qu'on maîtrise. */}
              {ancresPositions.map(a => (
                <svg
                  key={a.id}
                  width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth={2.5}
                  strokeLinecap="round" strokeLinejoin="round"
                  style={{ position: 'absolute', top: a.top, left: a.left, transform: 'translate(-50%, -60%)', pointerEvents: 'none' }}
                >
                  <title>{t('notes.ancrePresente')}</title>
                  <circle cx="12" cy="5" r="3" />
                  <line x1="12" y1="8" x2="12" y2="21" />
                  <path d="M5 12H2a10 10 0 0 0 20 0h-3" />
                </svg>
              ))}
              {/* Suggestions de liens [[...]] — ancrées juste sous le curseur. */}
              {/* Sans la branche "!estListeSpeciale" : sans elle, une recherche de note qui ne matche
                  encore rien (ex. titre tout juste commencé à taper) n'affichait AUCUN menu — donc pas
                  d'endroit où cliquer "créer une note vide" non plus, alors que c'est justement le cas
                  où on en a le plus besoin. */}
              {lienQuery !== null && (suggestions.length > 0 || !estListeSpeciale) && caretPos && (
                <div style={{
                  position: 'absolute', top: caretPos.top + caretPos.ligneHauteur, left: caretPos.left,
                  minWidth: 160, maxWidth: 320, zIndex: 10,
                  background: 'rgba(15,12,8,0.98)', border: `1px solid ${SECTION_BORDER}`, borderRadius: 6,
                  boxShadow: '0 6px 20px rgba(0,0,0,0.5)', overflow: 'hidden', maxHeight: 220, overflowY: 'auto',
                }}>
                  {suggestions.map(s => (
                    <button
                      key={s.key}
                      type="button"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => choisirSuggestion(s.titre)}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none',
                        color: PARCHMENT, cursor: 'pointer', fontSize: 14, padding: '7px 12px', fontFamily: 'inherit',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(201,168,76,0.12)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                    >
                      {s.type === 'creature' ? '🐉 ' : s.type === 'rencontre' ? '⚔ ' : ''}{s.titre}
                      {'sousLabel' in s && s.sousLabel && (
                        <span style={{ opacity: 0.5, fontSize: 12 }}> · {s.sousLabel}</span>
                      )}
                    </button>
                  ))}
                  {!estListeSpeciale && (
                    <button
                      type="button"
                      onMouseDown={e => e.preventDefault()}
                      onClick={creerNoteVideEtLier}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none',
                        borderTop: suggestions.length > 0 ? `1px solid ${SECTION_BORDER}` : 'none',
                        color: GOLD, cursor: 'pointer', fontSize: 14, padding: '7px 12px', fontFamily: 'inherit', fontWeight: 600,
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(201,168,76,0.12)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                    >
                      ＋ {t('notes.creerNoteVide')}
                    </button>
                  )}
                </div>
              )}
              {/* Barre d'outils flottante au-dessus d'une sélection de texte (voir bulleFormatPos) —
                  onMouseDown avec preventDefault sur tout le bloc (même motif que les boutons de
                  suggestion ci-dessus) : sans ça, cliquer un bouton déplacerait le focus hors du
                  contentEditable AVANT le clic, perdant la sélection dont ces actions ont besoin. */}
              {bulleFormatPos && (
                <div
                  onMouseDown={e => e.preventDefault()}
                  style={{
                    position: 'absolute', top: bulleFormatPos.top - 40, left: bulleFormatPos.left,
                    transform: 'translateX(-50%)', display: 'flex', gap: 2, zIndex: 20,
                    background: 'rgba(15,12,8,0.98)', border: `1px solid ${SECTION_BORDER}`, borderRadius: 6,
                    padding: 3, boxShadow: '0 6px 20px rgba(0,0,0,0.5)',
                  }}
                >
                  <button type="button" title={t('notes.formatGras')} onClick={() => appliquerFormatage('**')}
                    style={{ ...bulleFormatBtnStyle, fontWeight: 700 }}>G</button>
                  <button type="button" title={t('notes.formatItalique')} onClick={() => appliquerFormatage('*')}
                    style={{ ...bulleFormatBtnStyle, fontStyle: 'italic' }}>I</button>
                  <button type="button" title={t('notes.formatLien')} onClick={ouvrirLienDepuisSelection}
                    style={bulleFormatBtnStyle}>🔗</button>
                  <button type="button" title={t('notes.formatImage')} onClick={() => imageInputRef.current?.click()}
                    style={bulleFormatBtnStyle}>🖼️</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {/* Aperçu au survol d'un lien de note (lecture seule) ou d'une image — position=fixed puisque
          previewRect vient directement de getBoundingClientRect(), pas besoin de le recaler par
          rapport à un ancêtre positionné. */}
      {preview && previewRect && (
        <div
          onMouseEnter={annulerFermetureSurvol}
          onMouseLeave={programmerFermetureSurvol}
          style={{
            position: 'fixed', top: previewRect.top, left: previewRect.left,
            width: 320, maxHeight: 400, overflowY: 'auto', zIndex: 50,
            background: 'rgba(15,12,8,0.98)', border: `1px solid ${SECTION_BORDER}`, borderRadius: 8,
            boxShadow: '0 10px 30px rgba(0,0,0,0.6)', padding: 14,
          }}
        >
          {preview.type === 'image' ? (
            <img src={apercuSrc ?? undefined} alt={preview.image.nom} style={{ display: 'block', maxWidth: '100%', maxHeight: 340, margin: '0 auto', borderRadius: 4 }} />
          ) : (() => {
            const cible = resoudreLien(preview.titre, notes, bestiaire, rencontres)
            if (cible.type === 'note') {
              const noteLiee = cible.note
              return (
                <>
                  <div style={{ fontSize: 16, fontWeight: 700, color: GOLD, marginBottom: 8, fontFamily: "'Cinzel', serif" }}>
                    {noteLiee.titre.trim() || t('notes.sansTitre')}
                  </div>
                  <div style={{ fontSize: 14, color: PARCHMENT, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {noteLiee.contenu.trim()
                      ? renderLiveContent(noteLiee.contenu, null, () => {}, noteImages, () => {}, () => {})
                      : <span style={{ opacity: 0.4 }}>{t('notes.contenuVide')}</span>}
                  </div>
                  <button
                    onClick={() => { onLien(preview.titre); setPreview(null) }}
                    style={{ ...toolbarBtnStyle, marginTop: 10 }}
                  >
                    {t('notes.allerNote')} →
                  </button>
                </>
              )
            }
            if (cible.type === 'creature') {
              const c = cible.creature
              return (
                <>
                  <div style={{ fontSize: 16, fontWeight: 700, color: GOLD, marginBottom: 8, fontFamily: "'Cinzel', serif" }}>
                    🐉 {c.nom}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 12, marginBottom: 8 }}>
                    <span style={{ opacity: 0.7 }}>NC {c.nc}</span>
                    {c.def !== undefined && <span style={{ opacity: 0.7 }}>DEF {c.def}</span>}
                    {c.pv !== undefined && <span style={{ opacity: 0.7 }}>PV {c.pv}</span>}
                    {c.rd !== undefined && <span style={{ opacity: 0.7 }}>RD {c.rd}</span>}
                    {c.init !== undefined && <span style={{ opacity: 0.7 }}>INIT {c.init}</span>}
                  </div>
                  {c.description && (
                    <div style={{ fontSize: 13, color: PARCHMENT, lineHeight: 1.5, opacity: 0.85 }}>
                      {c.description.length > 240 ? `${c.description.slice(0, 240)}…` : c.description}
                    </div>
                  )}
                  {onOpenCreature && (
                    <button
                      onClick={() => { onOpenCreature(c.nom); setPreview(null) }}
                      style={{ ...toolbarBtnStyle, marginTop: 10 }}
                    >
                      {t('notes.allerCreature')} →
                    </button>
                  )}
                </>
              )
            }
            if (cible.type === 'rencontre') {
              const r = cible.rencontre
              const composition = new Map<string, number>()
              for (const a of r.adversaires) {
                if (a.creatureNom) composition.set(a.creatureNom, (composition.get(a.creatureNom) ?? 0) + 1)
              }
              return (
                <>
                  <div style={{ fontSize: 16, fontWeight: 700, color: GOLD, marginBottom: 8, fontFamily: "'Cinzel', serif" }}>
                    ⚔ {r.nom}
                  </div>
                  <div style={{ fontSize: 13, color: PARCHMENT, lineHeight: 1.7 }}>
                    {composition.size === 0
                      ? <span style={{ opacity: 0.4 }}>{t('notes.rencontreVide')}</span>
                      : [...composition.entries()].map(([nom, n]) => (
                        <div key={nom}>{nom}{n > 1 ? ` ×${n}` : ''}</div>
                      ))}
                  </div>
                  {onEditRencontre && (
                    <button
                      onClick={() => { onEditRencontre(r.id); setPreview(null) }}
                      style={{ ...toolbarBtnStyle, marginTop: 10 }}
                    >
                      {t('notes.modifierRencontre')}
                    </button>
                  )}
                </>
              )
            }
            return <span style={{ fontSize: 14, opacity: 0.5 }}>{t('notes.sansTitre')}</span>
          })()}
        </div>
      )}
    </div>
  )
}

interface Props {
  mobile?: boolean
  // Levée dans App.tsx (plutôt que locale) pour que le graphe de liaisons affiché à côté (NotesGraph)
  // puisse ouvrir une note d'un clic sur son nœud.
  selectedId: string | null
  onSelectId: (id: string | null) => void
  // Données injectées par l'appelant (plutôt que lues directement via useGameData ici) pour que le même
  // composant serve à la fois les notes joueur (App.tsx) et les notes MJ (GMDashboard.tsx), deux
  // bibliothèques distinctes qui ne doivent jamais se mélanger.
  notes: Note[]
  setNotes: Dispatch<SetStateAction<Note[]>>
  campagnes: Campaign[]
  setCampagnes: Dispatch<SetStateAction<Campaign[]>>
  noteImages: NoteImage[]
  setNoteImages: Dispatch<SetStateAction<NoteImage[]>>
  // Capacité MJ (voir NoteEditorProps ci-dessus) — transmise telle quelle, absente côté joueur.
  bestiaire?: BestiaireEntry[]
  rencontres?: RencontreSauvegardee[]
  onOpenCreature?: (nom: string) => void
  onEditRencontre?: (id: string) => void
  onPlayRencontre?: (rencontre: RencontreSauvegardee) => void
}

export default function NotesTab({
  mobile, selectedId, onSelectId, notes, setNotes, campagnes, setCampagnes, noteImages, setNoteImages,
  bestiaire, rencontres, onOpenCreature, onEditRencontre, onPlayRencontre,
}: Props) {
  const { t } = useTranslation()
  // onOpenCreature n'existe que côté MJ (voir Props) : sert à distinguer les notes joueur (Notes/) des
  // notes MJ (Maitre de jeu/) — même composant, deux bibliothèques et deux dossiers d'export distincts.
  const dossierExport = onOpenCreature ? 'Maitre de jeu' : 'Notes'
  const [search, setSearch] = useState('')
  const [nouvelleCampagneOuverte, setNouvelleCampagneOuverte] = useState(false)
  const [nouvelleCampagneNom, setNouvelleCampagneNom] = useState('')
  const [sectionSurvolee, setSectionSurvolee] = useState<string | null>(null)
  // Repliage des sections : préférence d'affichage locale (pas une donnée de jeu), donc dans
  // localStorage plutôt que dans les fichiers sauvegardés — même choix déjà fait pour le zoom de la
  // fiche (voir App.tsx) — pour survivre à un redémarrage de l'app.
  const [sectionsReduites, setSectionsReduites] = useState<Set<string>>(() => {
    try {
      const brut = localStorage.getItem('tdr-notes-sections-reduites')
      return brut ? new Set(JSON.parse(brut)) : new Set()
    } catch {
      return new Set()
    }
  })
  const toggleReduite = (cle: string) => {
    const next = new Set(sectionsReduites)
    if (next.has(cle)) next.delete(cle); else next.add(cle)
    setSectionsReduites(next)
    localStorage.setItem('tdr-notes-sections-reduites', JSON.stringify([...next]))
  }

  const [renommageId, setRenommageId] = useState<string | null>(null)
  const [renommageNom, setRenommageNom] = useState('')
  const commencerRenommage = (id: string, nomActuel: string) => {
    setRenommageId(id)
    setRenommageNom(nomActuel)
  }
  const validerRenommage = () => {
    const nom = renommageNom.trim()
    if (nom && renommageId) {
      setCampagnes(prev => prev.map(c => c.id === renommageId ? { ...c, nom } : c))
    }
    setRenommageId(null)
  }

  // Supprimer un groupe laisse par défaut ses notes intactes : leur campagneId pointe alors vers un id
  // inexistant, ce que `sections` (voir plus bas) traite comme "sans groupe" — elles redeviennent
  // simplement visibles dans cette section. L'utilisateur peut aussi demander leur suppression, geste
  // irréversible qui exige donc un choix explicite plutôt qu'une simple confirmation.
  const [groupeASupprimer, setGroupeASupprimer] = useState<string | null>(null)
  const supprimerGroupe = (id: string, avecNotes: boolean) => {
    if (avecNotes) setNotes(prev => prev.filter(n => n.campagneId !== id))
    setCampagnes(prev => prev.filter(c => c.id !== id))
    setGroupeASupprimer(null)
  }

  // Notes groupées par campagne (dans l'ordre de création des campagnes) + une section "sans
  // campagne" en tête — une note dont la campagne référencée a été supprimée retombe aussi ici, pour
  // ne jamais disparaître silencieusement de la liste.
  const sections = useMemo(() => {
    const brut = search.trim()
    const q = brut.length >= SEUIL_RECHERCHE ? brut.toLowerCase() : ''
    // Recherche dans le titre, les tags, le CONTENU (mots dans le texte de la note — le \f de
    // séparation des pages n'y gêne pas, une simple sous-chaîne) et le nom des marque-pages/ancres.
    const correspond = (n: Note) => !q
      || n.titre.toLowerCase().includes(q)
      || (n.tags ?? []).some(tag => tag.toLowerCase().includes(q))
      || n.contenu.toLowerCase().includes(q)
      || (n.marques ?? []).some(m => m.nom.toLowerCase().includes(q))
    const tri = (a: Note, b: Note) => b.modifieLe.localeCompare(a.modifieLe)

    const sansCampagne: Note[] = []
    const parCampagne = new Map<string, Note[]>()
    for (const n of notes) {
      if (!correspond(n)) continue
      if (n.campagneId && campagnes.some(c => c.id === n.campagneId)) {
        const liste = parCampagne.get(n.campagneId) ?? []
        liste.push(n)
        parCampagne.set(n.campagneId, liste)
      } else {
        sansCampagne.push(n)
      }
    }
    sansCampagne.sort(tri)
    parCampagne.forEach(liste => liste.sort(tri))
    return { sansCampagne, parCampagne }
  }, [notes, search, campagnes])

  const selected = notes.find(n => n.id === selectedId) ?? null

  const creerNote = (campagneId: string | undefined, titre = '') => {
    const maintenant = new Date().toISOString()
    const note: Note = { id: genId(), titre, contenu: '', creeLe: maintenant, modifieLe: maintenant, campagneId }
    setNotes(prev => [...prev, note])
    onSelectId(note.id)
  }

  const creerCampagne = () => {
    const nom = nouvelleCampagneNom.trim()
    if (!nom) return
    setCampagnes(prev => [...prev, { id: genId(), nom }])
    setNouvelleCampagneNom('')
    setNouvelleCampagneOuverte(false)
  }

  // Exporte toutes les notes d'une section (groupe ou "sans groupe") en un seul fichier, avec les
  // images que ces notes référencent — même format qu'un export mono-note ({note, images}), juste au
  // pluriel ({groupe, notes, images}), pour qu'importerFichier gère les deux indifféremment.
  const [exportMsg, setExportMsg] = useState<string | null>(null)
  const exporterGroupe = async (nomGroupe: string | null, notesDuGroupe: Note[]) => {
    if (notesDuGroupe.length === 0) return
    const nomsRef = new Set<string>()
    notesDuGroupe.forEach(n => imagesReferencees(n.contenu).forEach(nom => nomsRef.add(nom)))
    const imagesLiees = noteImages.filter(img => nomsRef.has(img.nom.toLowerCase()))
    const contenuExport = {
      type: 'notes-groupe' as const,
      groupe: nomGroupe ?? undefined,
      notes: notesDuGroupe.map(n => ({ titre: n.titre, contenu: n.contenu, date: n.date, tags: n.tags, couleur: n.couleur })),
      images: await imagesAutonomes(imagesLiees),
    }
    const jsonContent = JSON.stringify(contenuExport, null, 2)
    const filename = nomFichierExport(nomGroupe ?? 'export-notes', 'export-notes')
    const chemin = `${dossierExport}/${filename}`
    if (isTauri) {
      await saveDataFile(chemin, jsonContent)
      setExportMsg(t('notes.exporteVers', { filename: chemin }))
      setTimeout(() => setExportMsg(null), 3000)
    } else {
      const blob = new Blob([jsonContent], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = filename; a.click()
      URL.revokeObjectURL(url)
    }
  }

  // Import : reconnaît un export mono-note ({note, images}) ou de groupe ({notes, images}). Les
  // images reçues sont ajoutées à la bibliothèque en dédupliquant leur nom (comme à l'import depuis le
  // sélecteur de fichier) ; si un nom est renommé pour éviter une collision, les références ![[...]]
  // des notes importées sont réécrites en conséquence pour ne jamais pointer vers la mauvaise image.
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const campagneImportCibleRef = useRef<string | undefined>(undefined)
  const declencherImport = (campagneId: string | undefined) => {
    campagneImportCibleRef.current = campagneId
    importInputRef.current?.click()
  }
  const importerFichier = async (file: File) => {
    let data: unknown
    try {
      data = JSON.parse(await file.text())
    } catch {
      setImportMsg(t('notes.importInvalide'))
      setTimeout(() => setImportMsg(null), 3000)
      return
    }
    const d = data as { groupe?: string; note?: Partial<Note>; notes?: Partial<Note>[]; images?: NoteImage[] }
    const items = d.notes ?? (d.note ? [d.note] : [])
    const imagesImportees = d.images ?? []
    if (items.length === 0) {
      // Fichier reconnu comme un autre type d'export (personnage, créature, ...) : message précis
      // plutôt que le générique "fichier invalide" quand on peut identifier de quoi il s'agit vraiment.
      const type = detecterTypeFichier(data)
      setImportMsg(type ? messageMauvaisType(t, 'note', type) : t('notes.importInvalide'))
      setTimeout(() => setImportMsg(null), 3000)
      return
    }

    // Un export de groupe retrouve automatiquement son groupe d'origine (recréé s'il n'existe plus,
    // réutilisé par nom sinon) — peu importe le bouton ↑ cliqué pour déclencher l'import, pour ne pas
    // obliger à recréer le groupe à la main avant d'importer. Un export mono-note (sans nom de groupe)
    // continue d'utiliser le groupe ciblé par le bouton cliqué.
    let campagneCibleId = campagneImportCibleRef.current
    const nomGroupe = d.groupe?.trim()
    if (nomGroupe) {
      const existant = campagnes.find(c => c.nom.trim().toLowerCase() === nomGroupe.toLowerCase())
      if (existant) {
        campagneCibleId = existant.id
      } else {
        const nouveauId = genId()
        setCampagnes(prev => [...prev, { id: nouveauId, nom: nomGroupe }])
        campagneCibleId = nouveauId
      }
    }

    const mapping = new Map<string, string>()
    const nouvellesImages: NoteImage[] = []
    for (const img of imagesImportees) {
      if (!img?.nom || !img.data) continue
      let nom = img.nom
      let n = 2
      while (
        noteImages.some(x => x.nom.toLowerCase() === nom.toLowerCase())
        || nouvellesImages.some(x => x.nom.toLowerCase() === nom.toLowerCase())
      ) {
        nom = `${img.nom} (${n})`
        n++
      }
      mapping.set(img.nom.toLowerCase(), nom)
      nouvellesImages.push({ id: genId(), nom, data: await importerImage('note', img.data) })
    }
    if (nouvellesImages.length > 0) setNoteImages(prev => [...prev, ...nouvellesImages])

    const maintenant = new Date().toISOString()
    const nouvellesNotes: Note[] = items.map(item => {
      let contenu = item.contenu ?? ''
      mapping.forEach((nouveau, ancien) => { contenu = renommerReferenceImage(contenu, ancien, nouveau) })
      return {
        id: genId(), titre: item.titre ?? '', contenu, date: item.date, tags: item.tags, couleur: item.couleur,
        campagneId: campagneCibleId,
        creeLe: maintenant, modifieLe: maintenant,
      }
    })
    setNotes(prev => [...prev, ...nouvellesNotes])
    if (nouvellesNotes.length === 1) onSelectId(nouvellesNotes[0].id)
    setImportMsg(t('notes.importReussi', { count: nouvellesNotes.length }))
    setTimeout(() => setImportMsg(null), 3000)
  }

  const updateNoteById = (id: string, patch: Partial<Note>) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, ...patch, modifieLe: new Date().toISOString() } : n))
  }

  // Pagination — la note reste UNE seule chaîne (note.contenu) : les pages sont juste délimitées par
  // un caractère form feed ('\f'), invisible partout ailleurs dans l'app (recherche, liens, export...).
  // NoteEditor n'édite qu'une page à la fois, remonté (key différente) à chaque changement de page.
  const pages = useMemo(() => (selected?.contenu ?? '').split('\f'), [selected?.contenu])
  const [pageActive, setPageActive] = useState(0)
  // Compteur inclus dans la key de NoteEditor (voir plus bas) pour forcer un remontage même quand
  // pageActive ne change pas — ex. cliquer sur une 2e occurrence d'un mot trouvée sur la page déjà
  // affichée : sans ça, curseurInitial changerait bien mais l'effet qui l'applique (au montage
  // seulement) ne se redéclencherait pas, et le mot ne serait jamais (re)sélectionné.
  const [navigationSeq, setNavigationSeq] = useState(0)
  // Revient à la première page à l'ouverture d'une AUTRE note (comparaison sur l'id seul, pas sur
  // selected.contenu qui change à chaque frappe) — et n'accorde le focus automatique (voir plus bas)
  // qu'aux changements de page déclenchés explicitement par une navigation, jamais à ce cas-ci.
  const [dernierSelectedId, setDernierSelectedId] = useState<string | null>(null)
  const [pageVientDeNaviguer, setPageVientDeNaviguer] = useState(false)
  // Position (ou plage, pour sélectionner un mot trouvé par la recherche) de curseur à restaurer une
  // fois la page affichée — utilisé pour amener précisément sur une ancre de paragraphe ou surligner
  // un résultat de recherche en texte (voir allerA), pas seulement amener sur la bonne page.
  const [curseurCible, setCurseurCible] = useState<{ debut: number; fin: number } | null>(null)
  // Page/ancre/occurrence visée par un clic dans les résultats de recherche : posé juste avant
  // onSelectId (qui peut viser une AUTRE note), consommé au prochain changement de sélection ci-dessous
  // plutôt que remis à zéro comme d'habitude. En state (pas en ref) : le compilateur React interdit de
  // lire/écrire une ref pendant le rendu, y compris dans ce genre de bloc d'ajustement d'état.
  const [cibleApresSelection, setCibleApresSelection] = useState<{ noteId: string; page: number; decalage?: number; longueur?: number } | null>(null)
  if (selectedId !== dernierSelectedId) {
    setDernierSelectedId(selectedId)
    if (cibleApresSelection && cibleApresSelection.noteId === selectedId) {
      setCibleApresSelection(null)
      setPageActive(cibleApresSelection.page)
      setCurseurCible(cibleApresSelection.decalage !== undefined
        ? { debut: cibleApresSelection.decalage, fin: cibleApresSelection.decalage + (cibleApresSelection.longueur ?? 0) }
        : null)
      setPageVientDeNaviguer(true)
    } else {
      setPageActive(0)
      setCurseurCible(null)
      setPageVientDeNaviguer(false)
    }
  }

  const allerPage = (index: number, decalage?: number, longueur?: number) => {
    setPageActive(index)
    setCurseurCible(decalage !== undefined ? { debut: decalage, fin: decalage + (longueur ?? 0) } : null)
    setPageVientDeNaviguer(true)
    setNavigationSeq(s => s + 1)
  }
  // Clic sur un marque-page ou sur une occurrence trouvée par la recherche en texte (liste de
  // recherche, ou dans le panneau de la note ouverte) : bascule sur la bonne note si besoin (via
  // cibleApresSelection, consommé ci-dessus) puis sur la bonne page. longueur sélectionne le mot trouvé
  // (recherche en texte) au lieu d'un simple curseur (marque-page/ancre).
  const allerA = (noteId: string, page: number, decalage?: number, longueur?: number) => {
    if (noteId === selectedId) {
      allerPage(page, decalage, longueur)
    } else {
      setCibleApresSelection({ noteId, page, decalage, longueur })
      onSelectId(noteId)
    }
  }
  const allerAuMarque = (noteId: string, m: NoteMarque) => allerA(noteId, m.page, m.decalage)
  const ajouterPageEtAller = () => {
    if (!selected) return
    updateNoteById(selected.id, { contenu: [...pages, ''].join('\f') })
    allerPage(pages.length)
  }
  const pagePrecedente = () => { if (pageActive > 0) allerPage(pageActive - 1) }
  const pageSuivante = () => { if (pageActive < pages.length - 1) allerPage(pageActive + 1); else ajouterPageEtAller() }
  // Supprime la page active — jamais la dernière restante (le bouton est de toute façon masqué dans ce
  // cas, voir NoteEditor). En supprimant, l'index actif reste identique quand ce n'était pas la
  // dernière page (on atterrit alors sur ce qui était la page suivante) ou recule d'un cran sinon.
  const supprimerPage = () => {
    if (!selected || pages.length <= 1) return
    const nouvellesPages = pages.filter((_, i) => i !== pageActive)
    updateNoteById(selected.id, { contenu: nouvellesPages.join('\f') })
    allerPage(Math.min(pageActive, nouvellesPages.length - 1))
  }
  // Dépassement détecté par NoteEditor (voir trouverPointDeCoupure) : insère une page contenant
  // texteReporte juste APRÈS la page active, dont le contenu est remplacé par texteGarde — un vrai
  // découpage, jamais seulement une page vide en fin de note, pour qu'un gros collage qui dépasse
  // largement la page ne perde pas sa fin. Ça marche aussi en reprenant l'écriture sur une page déjà
  // revisitée (via ‹) même si d'autres pages existent déjà plus loin — la nouvelle page s'insère juste
  // après, décalant les suivantes. texteGarde/texteReporte (mesurés au moment précis du dépassement)
  // remplacent la version potentiellement pas encore sauvegardée dans `pages` — sinon les toutes
  // dernières frappes qui ont causé le dépassement seraient perdues.
  const pageDebordee = (texteGarde: string, texteReporte: string) => {
    if (!selected) return
    const nouvellesPages = pages.slice()
    nouvellesPages[pageActive] = texteGarde
    nouvellesPages.splice(pageActive + 1, 0, texteReporte)
    updateNoteById(selected.id, { contenu: nouvellesPages.join('\f') })
    allerPage(pageActive + 1)
  }

  // Marque-pages : signet de page (decalage absent) ou ancre de paragraphe (decalage = position dans
  // le texte de cette page) — voir NoteMarque. Champ note-level, pas besoin de passer par la logique
  // de découpage en pages ci-dessus.
  const ajouterMarque = (noteId: string, nom: string, page: number, decalage?: number) => {
    const n = notes.find(x => x.id === noteId)
    if (!n || !nom.trim()) return
    const marque: NoteMarque = { id: genId(), nom: nom.trim(), page, decalage }
    updateNoteById(noteId, { marques: [...(n.marques ?? []), marque] })
  }
  const supprimerMarque = (noteId: string, marqueId: string) => {
    const n = notes.find(x => x.id === noteId)
    if (!n) return
    updateNoteById(noteId, { marques: (n.marques ?? []).filter(m => m.id !== marqueId) })
  }

  const supprimerNote = (id: string) => {
    setNotes(prev => prev.filter(n => n.id !== id))
    if (selectedId === id) onSelectId(null)
  }

  // Clic sur un lien [[Titre]] : ouvre la note existante (recherche insensible à la casse/aux espaces),
  // sinon — capacité MJ uniquement — saute vers la créature ou lance la rencontre du même nom, sinon
  // crée une note vide portant ce titre, rattachée à la même campagne que la note d'où part le lien.
  const suivreLien = (titre: string) => {
    const cible = resoudreLien(titre, notes, bestiaire, rencontres)
    if (cible.type === 'note') {
      onSelectId(cible.note.id)
    } else if (cible.type === 'creature') {
      onOpenCreature?.(cible.creature.nom)
    } else if (cible.type === 'rencontre') {
      onPlayRencontre?.(cible.rencontre)
    } else {
      creerNote(selected?.campagneId, titre)
    }
  }

  // Crée une note vide pour ce titre si elle n'existe pas déjà — appelé dès qu'un lien [[Titre]] est
  // refermé pendant la frappe, sans changer la sélection (contrairement à suivreLien) pour ne pas
  // interrompre l'écriture de la note en cours. Ne crée rien si le titre désigne déjà une créature ou
  // une rencontre (capacité MJ) : ce lien-là n'est pas censé devenir une note.
  const assurerNote = (titre: string) => {
    const cible = resoudreLien(titre, notes, bestiaire, rencontres)
    if (cible.type === 'aucun') {
      const maintenant = new Date().toISOString()
      setNotes(prev => [...prev, { id: genId(), titre, contenu: '', creeLe: maintenant, modifieLe: maintenant, campagneId: selected?.campagneId }])
    }
  }

  // Glisser-déposer une note vers une autre section la réassigne à cette campagne (ou l'en détache
  // si déposée sur "Sans campagne", campagneId undefined).
  const deposerNote = (e: React.DragEvent, campagneId: string | undefined) => {
    e.preventDefault()
    setSectionSurvolee(null)
    const noteId = e.dataTransfer.getData('text/plain')
    if (noteId) updateNoteById(noteId, { campagneId })
  }

  const renderSection = (cleSection: string, titreSection: string, notesSection: Note[], campagneId: string | undefined) => {
    // Une recherche active force l'affichage du contenu même si la section a été repliée manuellement
    // au préalable — sinon les résultats correspondants restent invisibles derrière le repli, ce qui
    // ressemble à tort à une recherche qui ne trouve rien.
    const reduite = sectionsReduites.has(cleSection) && search.trim().length < SEUIL_RECHERCHE
    return (
    <div
      key={cleSection}
      onDragOver={e => { e.preventDefault(); setSectionSurvolee(cleSection) }}
      onDragLeave={() => setSectionSurvolee(prev => prev === cleSection ? null : prev)}
      onDrop={e => deposerNote(e, campagneId)}
      style={{
        border: `1px solid ${sectionSurvolee === cleSection ? GOLD : SECTION_BORDER}`, borderRadius: 6,
        background: sectionSurvolee === cleSection ? 'rgba(201,168,76,0.06)' : 'transparent',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
        borderBottom: !reduite && notesSection.length > 0 ? `1px solid ${SECTION_BORDER}` : 'none',
      }}>
        <button
          onClick={() => toggleReduite(cleSection)}
          title={reduite ? t('notes.deplierCampagne') : t('notes.reduireCampagne')}
          style={{
            ...groupeIconBtnStyle, color: GOLD, fontSize: 15,
            transform: reduite ? 'rotate(-90deg)' : 'none',
          }}
        >
          ▾
        </button>
        {campagneId && renommageId === campagneId ? (
          <input
            autoFocus
            value={renommageNom}
            onChange={e => setRenommageNom(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') validerRenommage(); if (e.key === 'Escape') setRenommageId(null) }}
            onBlur={validerRenommage}
            onClick={e => e.stopPropagation()}
            style={{ ...metaInputStyle, flex: 1, fontSize: 13, padding: '2px 6px' }}
          />
        ) : (
          <span
            onClick={() => toggleReduite(cleSection)}
            style={{ flex: 1, fontSize: 13, fontWeight: 700, color: GOLD, textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'pointer' }}
          >
            {titreSection} <span style={{ fontSize: 13, fontWeight: 400, opacity: 0.5, textTransform: 'none', letterSpacing: 'normal' }}>({notesSection.length})</span>
          </span>
        )}
        {campagneId && renommageId !== campagneId && (
          <button
            onClick={() => commencerRenommage(campagneId, titreSection)}
            title={t('notes.renommerGroupe')}
            style={{ ...groupeIconBtnStyle, color: 'rgba(245,236,215,0.5)', fontSize: 17 }}
          >
            ✎
          </button>
        )}
        {campagneId && renommageId !== campagneId && (
          <button
            onClick={() => setGroupeASupprimer(campagneId)}
            title={t('notes.supprimerGroupe')}
            style={{ ...groupeIconBtnStyle, color: 'rgba(255,110,110,0.7)', fontSize: 15 }}
          >
            ✕
          </button>
        )}
        <button
          onClick={() => declencherImport(campagneId)}
          title={t('notes.importer')}
          style={{ ...groupeIconBtnStyle, color: 'rgba(245,236,215,0.5)', fontSize: 17 }}
        >
          ↑
        </button>
        <button
          onClick={() => exporterGroupe(campagneId ? titreSection : null, notesSection)}
          title={t('notes.exporterGroupe')}
          style={{
            ...groupeIconBtnStyle, fontSize: 17,
            color: notesSection.length ? 'rgba(245,236,215,0.5)' : 'rgba(245,236,215,0.2)',
            cursor: notesSection.length ? 'pointer' : 'default',
          }}
          disabled={notesSection.length === 0}
        >
          ↓
        </button>
        <button
          onClick={() => creerNote(campagneId)}
          title={t('notes.nouvelleNote')}
          style={{ ...groupeIconBtnStyle, color: GOLD, fontSize: 20, marginLeft: 6 }}
        >
          +
        </button>
      </div>
      {!reduite && notesSection.map((n, i) => {
        const isSelected = n.id === selectedId
        // Marque-pages de cette note dont le nom correspond à la recherche en cours — affichés en
        // sous-lignes cliquables, pour retrouver directement le bon signet/ancre sans d'abord ouvrir
        // la note puis chercher soi-même la bonne page.
        const brut = search.trim()
        const q = brut.length >= SEUIL_RECHERCHE ? brut.toLowerCase() : ''
        const marquesCorrespondants = q ? (n.marques ?? []).filter(m => m.nom.toLowerCase().includes(q)) : []
        // Occurrences du mot cherché DANS LE TEXTE (pas juste titre/tags) : une sous-ligne par
        // occurrence (pas juste par page), pour amener directement dessus — sinon trouver une note
        // dans la liste ne dit pas sur quelle page, ni à quelle répétition (potentiellement plusieurs
        // sur la même page), se trouve le mot recherché.
        const occurrencesContenu = q ? n.contenu.split('\f').flatMap((page, indexPage) => {
          const pageMinuscule = page.toLowerCase()
          const decalages: number[] = []
          let depuis = 0
          for (;;) {
            const decalage = pageMinuscule.indexOf(q, depuis)
            if (decalage === -1) break
            decalages.push(decalage)
            depuis = decalage + q.length
          }
          return decalages.map((decalage, indexSurPage) => ({ page: indexPage, decalage, indexSurPage, totalSurPage: decalages.length }))
        }) : []
        const nbSousLignes = marquesCorrespondants.length + occurrencesContenu.length
        return (
          <div key={n.id}>
            <div
              draggable
              onDragStart={e => e.dataTransfer.setData('text/plain', n.id)}
              onClick={() => onSelectId(n.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', cursor: 'grab',
                background: isSelected ? 'rgba(201,168,76,0.12)' : 'transparent',
                borderLeft: isSelected ? `2px solid ${GOLD}` : '2px solid transparent',
                // Repère de couleur (voir Note.couleur) — même principe que le trait doré de sélection à
                // gauche, mais à droite et dans la couleur choisie pour la note (même couleur que sa
                // pastille dans NotesGraph). Rien si aucune couleur n'a été choisie.
                borderRight: n.couleur ? `3px solid ${n.couleur}` : 'none',
                borderBottom: nbSousLignes === 0 && i < notesSection.length - 1 ? `1px solid ${SECTION_BORDER}` : 'none',
              }}
            >
              <span style={{ flex: 1, fontSize: 15, color: isSelected ? GOLD : PARCHMENT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {n.titre.trim() || t('notes.sansTitre')}
              </span>
              {n.date && <span style={{ fontSize: 12, opacity: 0.45, flexShrink: 0 }}>{n.date}</span>}
              {(n.tags ?? []).slice(0, 2).map(tag => (
                <span
                  key={tag}
                  onClick={e => { e.stopPropagation(); setSearch(tag) }}
                  title={t('notes.filtrerParTag', { tag })}
                  style={{ fontSize: 12, color: GOLD, opacity: 0.6, cursor: 'pointer', flexShrink: 0 }}
                >
                  #{tag}
                </span>
              ))}
            </div>
            {marquesCorrespondants.map((m, mi) => (
              <div
                key={m.id}
                onClick={e => { e.stopPropagation(); allerAuMarque(n.id, m) }}
                style={{
                  padding: '5px 12px 5px 30px', cursor: 'pointer', fontSize: 12, color: GOLD, opacity: 0.8,
                  borderBottom: (mi < nbSousLignes - 1 || i < notesSection.length - 1) ? `1px solid ${SECTION_BORDER}` : 'none',
                }}
              >
                {m.decalage !== undefined ? '⚓' : '📌'} {m.nom} <span style={{ opacity: 0.6 }}>· {t('notes.pageAbrege', { page: m.page + 1 })}</span>
              </div>
            ))}
            {occurrencesContenu.map((o, oi) => (
              <div
                key={`occ-${o.page}-${o.indexSurPage}`}
                onClick={e => { e.stopPropagation(); allerA(n.id, o.page, o.decalage, brut.length) }}
                style={{
                  padding: '5px 12px 5px 30px', cursor: 'pointer', fontSize: 12, color: 'rgba(245,236,215,0.75)', opacity: 0.8,
                  borderBottom: (marquesCorrespondants.length + oi < nbSousLignes - 1 || i < notesSection.length - 1) ? `1px solid ${SECTION_BORDER}` : 'none',
                }}
              >
                🔎 « {brut} » <span style={{ opacity: 0.6 }}>
                  · {t('notes.pageAbrege', { page: o.page + 1 })}
                  {o.totalSurPage > 1 ? ` ${t('notes.occurrenceIndex', { index: o.indexSurPage + 1, total: o.totalSurPage })}` : ''}
                </span>
              </div>
            ))}
          </div>
        )
      })}
    </div>
    )
  }

  const listPanel = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: mobile ? '100%' : 360, flexShrink: 0, minHeight: 0, height: '100%', boxSizing: 'border-box' }}>
      <input ref={importInputRef} type="file" accept="application/json,.json" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) importerFichier(f); e.target.value = '' }} />
      {(exportMsg || importMsg) && (
        <span style={{ fontSize: 11, color: GOLD }}>{exportMsg ?? importMsg}</span>
      )}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder={t('notes.rechercher')}
        style={{
          padding: '8px 12px', borderRadius: 6, border: `1px solid ${SECTION_BORDER}`,
          background: 'rgba(255,255,255,0.03)', color: PARCHMENT, fontSize: 15,
        }}
      />
      {nouvelleCampagneOuverte ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            autoFocus
            value={nouvelleCampagneNom}
            onChange={e => setNouvelleCampagneNom(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') creerCampagne(); if (e.key === 'Escape') setNouvelleCampagneOuverte(false) }}
            onBlur={() => { if (!nouvelleCampagneNom.trim()) setNouvelleCampagneOuverte(false) }}
            placeholder={t('notes.nomCampagne')}
            style={{ ...metaInputStyle, flex: 1, fontSize: 13 }}
          />
          <button onClick={creerCampagne} style={{ ...metaInputStyle, color: GOLD, cursor: 'pointer', flexShrink: 0 }}>
            {t('notes.creer')}
          </button>
        </div>
      ) : (
        <button onClick={() => setNouvelleCampagneOuverte(true)} style={{
          background: 'transparent', border: '1px dashed rgba(201,168,76,0.5)', borderRadius: 4,
          color: GOLD, cursor: 'pointer', fontSize: 13, padding: '6px 10px', alignSelf: 'flex-start',
        }}>
          + {t('notes.nouvelleCampagne')}
        </button>
      )}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {renderSection('sans-campagne', t('notes.sansCampagne'), sections.sansCampagne, undefined)}
        {campagnes.map(c => renderSection(c.id, c.nom, sections.parCampagne.get(c.id) ?? [], c.id))}
      </div>
    </div>
  )

  const detailPanel = selected ? (
    <NoteEditor
      key={`${selected.id}:${pageActive}:${navigationSeq}`}
      note={{ ...selected, contenu: pages[pageActive] ?? '' }}
      notes={notes}
      campagnes={campagnes}
      noteImages={noteImages}
      setNoteImages={setNoteImages}
      mobile={mobile}
      bestiaire={bestiaire}
      rencontres={rencontres}
      onOpenCreature={onOpenCreature}
      onEditRencontre={onEditRencontre}
      onSave={patch => {
        if (patch.contenu !== undefined) {
          const nouvellesPages = pages.slice()
          nouvellesPages[pageActive] = patch.contenu
          updateNoteById(selected.id, { ...patch, contenu: nouvellesPages.join('\f') })
        } else {
          updateNoteById(selected.id, patch)
        }
      }}
      onBack={() => onSelectId(null)}
      onDelete={() => supprimerNote(selected.id)}
      onLien={suivreLien}
      onEnsureNote={assurerNote}
      pageActive={pageActive}
      pageCount={pages.length}
      onPrevPage={pagePrecedente}
      onNextPage={pageSuivante}
      onDeletePage={supprimerPage}
      onOverflow={pageDebordee}
      autoFocus={pageVientDeNaviguer}
      curseurInitial={curseurCible}
      onGoToPage={(page, decalage) => allerPage(page, decalage)}
      onAjouterMarque={(nom, page, decalage) => ajouterMarque(selected.id, nom, page, decalage)}
      onSupprimerMarque={marqueId => supprimerMarque(selected.id, marqueId)}
    />
  ) : (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${SECTION_BORDER}`, borderRadius: 6, opacity: 0.4, fontSize: 14 }}>
      {t('notes.aucuneSelection')}
    </div>
  )

  if (mobile) {
    return (
      <div style={{ height: '100%', padding: 8, boxSizing: 'border-box' }}>
        {selected ? detailPanel : listPanel}
      </div>
    )
  }

  // Suppression d'un groupe : choix explicite entre conserver et supprimer les notes qu'il contient,
  // cette seconde option étant irréversible.
  const dialogueSuppressionGroupe = groupeASupprimer && (() => {
    const groupe = campagnes.find(c => c.id === groupeASupprimer)
    const nbNotes = notes.filter(n => n.campagneId === groupeASupprimer).length
    return (
      <div
        onClick={() => setGroupeASupprimer(null)}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <div onClick={e => e.stopPropagation()} style={{
          background: 'rgba(20,15,8,0.98)', border: '1px solid rgba(201,168,76,0.5)', borderRadius: 6,
          padding: '18px 22px', maxWidth: 420, boxShadow: '0 6px 28px rgba(0,0,0,0.8)',
        }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--tdr-gold)', marginBottom: 8 }}>
            {t('notes.supprimerGroupeTitre', { nom: groupe?.nom ?? '' })}
          </div>
          <div style={{ fontSize: 13, color: 'rgba(245,236,215,0.7)', marginBottom: 16, lineHeight: 1.5 }}>
            {nbNotes === 0 ? t('notes.groupeVide') : t('notes.groupeContient', { count: nbNotes })}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button onClick={() => supprimerGroupe(groupeASupprimer, false)} style={{
              padding: '7px 14px', borderRadius: 4, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
              border: '1px solid rgba(201,168,76,0.5)', background: 'rgba(201,168,76,0.12)', color: 'var(--tdr-gold)',
            }}>{t('notes.supprimerGroupeSeul')}</button>
            {nbNotes > 0 && (
              <button onClick={() => supprimerGroupe(groupeASupprimer, true)} style={{
                padding: '7px 14px', borderRadius: 4, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                border: '1px solid rgba(220,80,80,0.6)', background: 'rgba(220,80,80,0.12)', color: '#e87070',
              }}>{t('notes.supprimerGroupeEtNotes', { count: nbNotes })}</button>
            )}
            <button onClick={() => setGroupeASupprimer(null)} style={{
              padding: '7px 14px', borderRadius: 4, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
              border: '1px solid rgba(245,236,215,0.15)', background: 'transparent', color: 'rgba(245,236,215,0.55)',
            }}>{t('notes.annuler')}</button>
          </div>
        </div>
      </div>
    )
  })()

  return (
    <div style={{ display: 'flex', gap: 16, height: '100%', flex: 1, minWidth: 0, padding: 16, boxSizing: 'border-box' }}>
      {listPanel}
      {detailPanel}
      {dialogueSuppressionGroupe}
    </div>
  )
}
