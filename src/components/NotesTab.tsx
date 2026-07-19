import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useGameData } from '../context/GameDataContext'
import { saveDataFile } from '../utils/tauriStorage'
import type { Note, Campaign, NoteImage } from '../types/gameData'

const GOLD = '#c9a84c'
const PARCHMENT = '#f5ecd7'
const SECTION_BORDER = 'rgba(201,168,76,0.2)'

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

// Noms de fichiers déjà utilisés par les sauvegardes internes de l'app (voir GameDataContext) — un
// export ne doit JAMAIS pouvoir en réutiliser un : sur Tauri, saveDataFile écrit directement dans
// Documents/TdA/ au nom donné, ce qui écraserait silencieusement la vraie sauvegarde correspondante.
// Comparaison insensible à la casse : Windows/macOS traitent "Notes.json" et "notes.json" comme le
// même fichier même si Linux les distingue.
const NOMS_FICHIERS_RESERVES = new Set([
  'descriptions', 'traits-magiques', 'peuples', 'armes', 'armures', 'voies', 'compagnons',
  'traits-raciaux', 'field-positions', 'sheet-images', 'hidden-voies', 'hidden-peuples',
  'hidden-cultures', 'hidden-compagnons', 'bestiaire', 'rencontres-sauvegardees',
  'combats-sauvegardes', 'capacites-bibliotheque', 'notes', 'campagnes', 'note-images',
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

// Aperçu au survol d'un lien de note ou d'une image — la modale elle-même (contenu affiché, aller à
// la note...) est gérée par l'appelant (NoteEditor), renderLiveContent se contente de signaler quoi
// survoler et où l'ancrer.
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
): ReactNode[] {
  const nodes: ReactNode[] = []
  let key = 0
  let pos = 0
  const chevauche = (debut: number, fin: number) => !!selection && selection.debut <= fin && selection.fin >= debut

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
              style={{ color: GOLD, textDecoration: 'underline', textUnderlineOffset: 2, cursor: 'text' }}
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
            <span key={key++} style={{ color: 'rgba(255,150,150,0.85)', fontStyle: 'italic', textDecoration: 'underline', textDecorationStyle: 'dashed', textUnderlineOffset: 2 }}>
              {texteAffiche}
            </span>
          )
          nodes.push(<span key={key++} style={{ display: 'none' }}>{']]'}</span>)
        }
      } else if (chevauche(debutAbs, finAbs)) {
        nodes.push(<span key={key++}>{jeton}</span>)
      } else if (jeton.startsWith('[[')) {
        const titreLien = jeton.slice(2, -2).trim()
        nodes.push(<span key={key++} style={{ display: 'none' }}>{'[['}</span>)
        nodes.push(
          <span
            key={key++}
            onMouseDown={e => { e.preventDefault(); onLien(titreLien) }}
            onMouseEnter={e => onHoverStart({ type: 'lien', titre: titreLien }, e.currentTarget.getBoundingClientRect())}
            onMouseLeave={onHoverEnd}
            style={{ color: GOLD, textDecoration: 'underline', textUnderlineOffset: 2, cursor: 'pointer' }}
          >
            {titreLien}
          </span>
        )
        nodes.push(<span key={key++} style={{ display: 'none' }}>{']]'}</span>)
      } else if (jeton.startsWith('**')) {
        nodes.push(<span key={key++} style={{ display: 'none' }}>{'**'}</span>)
        nodes.push(<strong key={key++}>{jeton.slice(2, -2)}</strong>)
        nodes.push(<span key={key++} style={{ display: 'none' }}>{'**'}</span>)
      } else {
        nodes.push(<span key={key++} style={{ display: 'none' }}>{'*'}</span>)
        nodes.push(<em key={key++}>{jeton.slice(1, -1)}</em>)
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
  mobile?: boolean
  onSave: (patch: Partial<Note>) => void
  onBack: () => void
  onDelete: () => void
  onLien: (titre: string) => void
  onEnsureNote: (titre: string) => void
}

const toolbarBtnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)', border: `1px solid ${SECTION_BORDER}`, borderRadius: 4,
  color: 'rgba(245,236,215,0.75)', cursor: 'pointer', fontSize: 13, padding: '4px 10px', fontFamily: 'inherit',
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
function NoteEditor({ note, notes, campagnes, mobile, onSave, onBack, onDelete, onLien, onEnsureNote }: NoteEditorProps) {
  const { t } = useTranslation()
  const { noteImages, setNoteImages } = useGameData()
  const [titre, setTitre] = useState(note.titre)
  const [contenu, setContenu] = useState(note.contenu)
  const [date, setDate] = useState(note.date ?? '')
  const [selection, setSelection] = useState<{ debut: number; fin: number } | null>(null)
  const [lienQuery, setLienQuery] = useState<string | null>(null)
  const [caretPos, setCaretPos] = useState<{ top: number; left: number; ligneHauteur: number } | null>(null)
  const [preview, setPreview] = useState<HoverInfo | null>(null)
  const [previewRect, setPreviewRect] = useState<{ top: number; left: number } | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editableRef = useRef<HTMLDivElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const hoverShowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoverHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
      note: { titre, contenu, date: date || undefined, tags: tagsActuels.length ? tagsActuels : undefined },
      images: imagesLiees,
    }
    const jsonContent = JSON.stringify(contenuExport, null, 2)
    const filename = nomFichierExport(titre, 'note')
    if (isTauri) {
      await saveDataFile(filename, jsonContent)
      setExportMsg(t('notes.exporteVers', { filename }))
      setTimeout(() => setExportMsg(null), 3000)
    } else {
      const blob = new Blob([jsonContent], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = filename; a.click()
      URL.revokeObjectURL(url)
    }
  }

  // Un seul minuteur de sauvegarde partagé titre/contenu/date : chaque appel ne fournit que le champ
  // qui vient de changer, les autres sont complétés depuis l'état courant — sinon changer de champ
  // avant l'expiration du délai perdrait le changement précédent. La campagne n'y figure jamais : ne
  // pas l'inclure dans le patch la laisse intacte (fusion superficielle côté appelant).
  const scheduleSave = (patch: Partial<Note>) => {
    const complet: Partial<Note> = {
      titre: patch.titre ?? titre,
      contenu: patch.contenu ?? contenu,
      date: 'date' in patch ? patch.date : (date || undefined),
    }
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => onSave(complet), SAVE_DEBOUNCE_MS)
  }

  const flush = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    onSave({ titre, contenu, date: date || undefined })
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
    reader.onload = () => {
      const data = reader.result
      if (typeof data !== 'string') return
      const base = file.name.replace(/\.[^./]+$/, '').trim() || 'image'
      let nom = base
      let n = 2
      while (noteImages.some(img => img.nom.toLowerCase() === nom.toLowerCase())) {
        nom = `${base} (${n})`
        n++
      }
      setNoteImages(prev => [...prev, { id: genId(), nom, data }])
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
  }

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

  // Boutons de mise en forme : entoure la sélection courante (ou un texte-repère déjà sélectionné, prêt
  // à être écrasé en tapant) avec la syntaxe demandée.
  const entourerSelection = (avant: string, apres: string, repere: string) => {
    const el = editableRef.current
    if (!el) return
    const sel = lireSelection(el) ?? { debut: contenu.length, fin: contenu.length }
    const selectionTexte = contenu.slice(sel.debut, sel.fin) || repere
    const next = contenu.slice(0, sel.debut) + avant + selectionTexte + apres + contenu.slice(sel.fin)
    setContenu(next)
    scheduleSave({ contenu: next })
    const nouveauDebut = sel.debut + avant.length
    setSelection({ debut: nouveauDebut, fin: nouveauDebut + selectionTexte.length })
    requestAnimationFrame(() => el.focus())
  }

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

  const suggestions = lienQuery === null ? [] : notes
    .filter(n => n.id !== note.id && n.titre.trim() && n.titre.toLowerCase().includes(lienQuery.toLowerCase()))
    .slice(0, 8)

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
      {/* Métadonnées : date libre (in-fiction ou réelle, aucun format imposé) + rappel en lecture seule
          de la campagne rattachée — l'assigner se fait désormais par glisser-déposer dans la liste. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: `1px solid ${SECTION_BORDER}` }}>
        <input
          value={date}
          onChange={e => { setDate(e.target.value); scheduleSave({ date: e.target.value || undefined }) }}
          onBlur={flush}
          placeholder={t('notes.datePlaceholder')}
          style={{ ...metaInputStyle, width: 140, flexShrink: 0 }}
        />
        {campagneNom && (
          <span style={{ fontSize: 12, color: GOLD, opacity: 0.8 }}>📁 {campagneNom}</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, padding: '8px 14px', borderBottom: `1px solid ${SECTION_BORDER}` }}>
        {tagsActuels.map(tag => (
          <span key={tag} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(201,168,76,0.12)',
            border: `1px solid ${SECTION_BORDER}`, borderRadius: 12, padding: '2px 8px', fontSize: 13, color: GOLD,
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
          style={{ ...metaInputStyle, width: 110 }}
        />
        <datalist id="tags-existants">
          {tagsExistants.map(tag => <option key={tag} value={tag} />)}
        </datalist>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Rappel de syntaxe toujours visible — cliquer entoure la sélection courante avec le marqueur
            correspondant. Le résultat s'affiche directement mis en forme au fil de la frappe. */}
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button type="button" onClick={() => entourerSelection('**', '**', t('notes.repereGras'))} style={toolbarBtnStyle}>
            **{t('notes.boutonGras')}**
          </button>
          <button type="button" onClick={() => entourerSelection('*', '*', t('notes.repereItalique'))} style={{ ...toolbarBtnStyle, fontStyle: 'italic' }}>
            *{t('notes.boutonItalique')}*
          </button>
          <button type="button" onClick={() => entourerSelection('[[', ']]', t('notes.repereLien'))} style={toolbarBtnStyle}>
            [[{t('notes.boutonLien')}]]
          </button>
          <input ref={imageInputRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFile(f); e.target.value = '' }} />
          <button type="button" onClick={() => imageInputRef.current?.click()} style={toolbarBtnStyle}>
            🖼️ {t('notes.boutonImage')}
          </button>
        </div>
        <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
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
            data-placeholder={t('notes.contenuPlaceholder')}
            style={{
              width: '100%', height: '100%', minHeight: 300, boxSizing: 'border-box', overflowY: 'auto',
              background: 'rgba(255,255,255,0.03)', border: `1px solid ${SECTION_BORDER}`, borderRadius: 4,
              color: PARCHMENT, fontSize: 16, fontFamily: 'inherit', lineHeight: 1.6, padding: 12,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word', outline: 'none',
            }}
          >
            {/* eslint-disable-next-line react-hooks/refs -- handleHoverStart/handleHoverEnd ne lisent leurs
                refs que dans des gestionnaires d'événements différés (onMouseEnter/onMouseLeave...), jamais
                pendant ce rendu ; renderLiveContent est une fonction pure (pas un composant), le compilateur
                ne peut pas voir à travers son appel que l'usage est bien différé. */}
            {renderLiveContent(contenu, selection, onLien, noteImages, handleHoverStart, handleHoverEnd)}
          </div>
          {contenu === '' && (
            <div style={{ position: 'absolute', top: 12, left: 12, right: 12, color: 'rgba(245,236,215,0.3)', fontSize: 16, pointerEvents: 'none' }}>
              {t('notes.contenuPlaceholder')}
            </div>
          )}
          {/* Suggestions de liens [[...]] — ancrées juste sous le curseur. */}
          {lienQuery !== null && suggestions.length > 0 && caretPos && (
            <div style={{
              position: 'absolute', top: caretPos.top + caretPos.ligneHauteur, left: caretPos.left,
              minWidth: 160, maxWidth: 320, zIndex: 10,
              background: 'rgba(15,12,8,0.98)', border: `1px solid ${SECTION_BORDER}`, borderRadius: 6,
              boxShadow: '0 6px 20px rgba(0,0,0,0.5)', overflow: 'hidden', maxHeight: 220, overflowY: 'auto',
            }}>
              {suggestions.map(s => (
                <button
                  key={s.id}
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
                  {s.titre}
                </button>
              ))}
            </div>
          )}
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
            <img src={preview.image.data} alt={preview.image.nom} style={{ display: 'block', maxWidth: '100%', maxHeight: 340, margin: '0 auto', borderRadius: 4 }} />
          ) : (() => {
            const noteLiee = notes.find(n => n.titre.trim().toLowerCase() === preview.titre.trim().toLowerCase())
            return noteLiee ? (
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
            ) : (
              <span style={{ fontSize: 14, opacity: 0.5 }}>{t('notes.sansTitre')}</span>
            )
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
}

export default function NotesTab({ mobile, selectedId, onSelectId }: Props) {
  const { t } = useTranslation()
  const { notes, setNotes, campagnes, setCampagnes, noteImages, setNoteImages } = useGameData()
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

  // Notes groupées par campagne (dans l'ordre de création des campagnes) + une section "sans
  // campagne" en tête — une note dont la campagne référencée a été supprimée retombe aussi ici, pour
  // ne jamais disparaître silencieusement de la liste.
  const sections = useMemo(() => {
    const q = search.trim().toLowerCase()
    const correspond = (n: Note) => !q
      || n.titre.toLowerCase().includes(q)
      || (n.tags ?? []).some(tag => tag.toLowerCase().includes(q))
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
      groupe: nomGroupe ?? undefined,
      notes: notesDuGroupe.map(n => ({ titre: n.titre, contenu: n.contenu, date: n.date, tags: n.tags })),
      images: imagesLiees,
    }
    const jsonContent = JSON.stringify(contenuExport, null, 2)
    const filename = nomFichierExport(nomGroupe ?? 'export-notes', 'export-notes')
    if (isTauri) {
      await saveDataFile(filename, jsonContent)
      setExportMsg(t('notes.exporteVers', { filename }))
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
    const d = data as { note?: Partial<Note>; notes?: Partial<Note>[]; images?: NoteImage[] }
    const items = d.notes ?? (d.note ? [d.note] : [])
    const imagesImportees = d.images ?? []
    if (items.length === 0) {
      setImportMsg(t('notes.importInvalide'))
      setTimeout(() => setImportMsg(null), 3000)
      return
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
      nouvellesImages.push({ id: genId(), nom, data: img.data })
    }
    if (nouvellesImages.length > 0) setNoteImages(prev => [...prev, ...nouvellesImages])

    const maintenant = new Date().toISOString()
    const nouvellesNotes: Note[] = items.map(item => {
      let contenu = item.contenu ?? ''
      mapping.forEach((nouveau, ancien) => { contenu = renommerReferenceImage(contenu, ancien, nouveau) })
      return {
        id: genId(), titre: item.titre ?? '', contenu, date: item.date, tags: item.tags,
        campagneId: campagneImportCibleRef.current,
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

  const supprimerNote = (id: string) => {
    setNotes(prev => prev.filter(n => n.id !== id))
    if (selectedId === id) onSelectId(null)
  }

  // Clic sur un lien [[Titre]] : ouvre la note existante (recherche insensible à la casse/aux espaces)
  // ou en crée une vide portant ce titre, rattachée à la même campagne que la note d'où part le lien
  // — c'est le cœur du système de liens entre notes.
  const suivreLien = (titre: string) => {
    const existante = notes.find(n => n.titre.trim().toLowerCase() === titre.trim().toLowerCase())
    if (existante) {
      onSelectId(existante.id)
    } else {
      creerNote(selected?.campagneId, titre)
    }
  }

  // Crée une note vide pour ce titre si elle n'existe pas déjà — appelé dès qu'un lien [[Titre]] est
  // refermé pendant la frappe, sans changer la sélection (contrairement à suivreLien) pour ne pas
  // interrompre l'écriture de la note en cours.
  const assurerNote = (titre: string) => {
    const existante = notes.find(n => n.titre.trim().toLowerCase() === titre.trim().toLowerCase())
    if (!existante) {
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
    const reduite = sectionsReduites.has(cleSection)
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
        return (
          <div
            key={n.id}
            draggable
            onDragStart={e => e.dataTransfer.setData('text/plain', n.id)}
            onClick={() => onSelectId(n.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', cursor: 'grab',
              background: isSelected ? 'rgba(201,168,76,0.12)' : 'transparent',
              borderLeft: isSelected ? `2px solid ${GOLD}` : '2px solid transparent',
              borderBottom: i < notesSection.length - 1 ? `1px solid ${SECTION_BORDER}` : 'none',
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
      key={selected.id}
      note={selected}
      notes={notes}
      campagnes={campagnes}
      mobile={mobile}
      onSave={patch => updateNoteById(selected.id, patch)}
      onBack={() => onSelectId(null)}
      onDelete={() => supprimerNote(selected.id)}
      onLien={suivreLien}
      onEnsureNote={assurerNote}
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

  return (
    <div style={{ display: 'flex', gap: 16, height: '100%', width: '100%', padding: 16, boxSizing: 'border-box' }}>
      {listPanel}
      {detailPanel}
    </div>
  )
}
