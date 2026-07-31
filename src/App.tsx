import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation, Trans } from 'react-i18next'
import { useLocaleContext } from './context/LocaleContext'
import { loadDataFileDossier, saveDataFile } from './utils/tauriStorage'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type { Character, CompagnonOverride } from './types/character'
import { defaultCharacter, getGolemVoieRang, hasVoieEtheree, hasCristauxVoie } from './types/character'
import type { SavedEntry } from './components/SaveLoadPanel'
import CharacterSheetRecto from './components/CharacterSheetRecto'
import CharacterSheetVerso from './components/CharacterSheetVerso'
import CharacterSheetVoies from './components/CharacterSheetVoies'
import CharacterSheetCompagnons from './components/CharacterSheetCompagnons'
import CharacterSheetGolem from './components/CharacterSheetGolem'
import CharacterSheetRunes from './components/CharacterSheetRunes'
import CharacterSheetRunesFull from './components/CharacterSheetRunesFull'
import CharacterSheetCristaux from './components/CharacterSheetCristaux'
import CreationWizard, { STEP_COUNT } from './components/CreationWizard'
import ModeSelector from './components/ModeSelector'
import GMDashboard from './components/GMMode/GMDashboard'
import SaveLoadPanel from './components/SaveLoadPanel'
import DescriptionsEditor from './components/DescriptionsEditor'
import TranslationEditor from './components/TranslationEditor'
import LevelUpModal from './components/LevelUpModal'
import GameModePanel from './components/GameMode/GameModePanel'
import NotesTab from './components/NotesTab'
import NotesGraph from './components/NotesGraph'
import SaveStatusIndicator from './components/SaveStatusIndicator'
import { findTrait } from './data/peuples'
import { GameDataProvider, useGameData } from './context/GameDataContext'
import type { ObjetMagiqueEntry } from './types/gameData'
import { patchPossessionObjetMagique } from './utils/objetsMagiquesPerso'
import { getCompagnonsDisponibles } from './utils/compagnons'
import { ModeImpressionContext } from './hooks/useChampsFiche'
import { saveDataFileToBundle } from './utils/tauriStorage'
import { MASQUAGE_MOT_DE_PASSE } from './utils/motDePasse'
import type { SheetPage } from './context/GameDataContext'
import { FIELD_POSITIONS_LIVRE } from './context/GameDataContext'
import { autoAssignCompagnons } from './utils/compagnons'

// Fiche à afficher pour chaque étape du wizard de création (voir wizard.stepNames dans les locales :
// Identité, Peuple & Culture, Caractéristiques, Profil & Voies, Scores dérivés, Spécialisation &
// équipement, Psychologie, Les derniers détails, Finalisation) — suivi automatiquement que ce soit via
// Suivant/Précédent ou un clic direct sur une étape du fil d'ariane (StepIndicator/onGoTo dans
// CreationWizard.tsx, qui ne font tous les deux que changer `step`). Constante de module (pas recréée
// à chaque rendu) : les valeurs ne dépendent d'aucun état.
const SHEET_PAGE_PAR_ETAPE: ('recto' | 'verso' | 'voies')[] = [
  'recto', 'recto', 'recto', 'voies', 'recto', 'recto', 'verso', 'verso', 'verso',
]

export default function App() {
  return <GameDataProvider><AppContent /></GameDataProvider>
}

function AppContent() {
  const { t, i18n } = useTranslation()
  const { languages } = useLocaleContext()
  const {
    data: descriptions, fieldPositions, setFieldPositions, sheetImages, setSheetImages,
    notes, setNotes, campagnes, setCampagnes, noteImages, setNoteImages, setObjetsMagiques,
  } = useGameData()
  const [character, setCharacter] = useState<Character>(() => ({
    ...defaultCharacter(),
    inventaire: t('wizard.step7.inventaireDefault'),
  }))

  // Synchronise compagnonsActifs dès qu'un rang de voie change, quelle que soit l'origine
  useEffect(() => {
    const newActifs = autoAssignCompagnons(character, descriptions)
    const cur = character.compagnonsActifs ?? [null, null]
    if (newActifs[0] !== (cur[0] ?? null) || newActifs[1] !== (cur[1] ?? null)) {
      setCharacter(prev => ({ ...prev, compagnonsActifs: newActifs }))
    }
  }, [character.voiePeuple, character.voieCulturelle, character.voie1, character.voie2, character.voie3, character.voiePrestige, character.voieSangMele])

  // F11 bascule la fenêtre Tauri en plein écran (no-op hors contexte Tauri, ex. navigateur en npm run dev)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'F11') return
      e.preventDefault()
      if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return
      const win = getCurrentWindow()
      win.isFullscreen().then(current => win.setFullscreen(!current))
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const [appMode, setAppMode] = useState<'joueur' | 'mj' | null>(null)
  const [step, setStep] = useState(0)
  const [maxStep, setMaxStep] = useState(0)
  const [sheetPage, setSheetPage] = useState<'recto' | 'verso' | 'voies' | 'compagnons' | 'golem' | 'runes' | 'cristaux' | 'notes'>('recto')
  // Note actuellement ouverte dans l'onglet Notes — levé ici (plutôt que gardé local à NotesTab) pour
  // que le graphe de liaisons (NotesGraph, affiché à côté) puisse ouvrir une note d'un clic sur son nœud.
  const [notesSelectedId, setNotesSelectedId] = useState<string | null>(null)
  const [runesDivin, setRunesDivin] = useState<string | null>(null)
  const runesDivinesUnlocked = character.voiePrestige.nom === 'Voie des runes divines' && character.voiePrestige.rangs.some(Boolean)
  const RUNES_FULL_MIN_WIDTH = 1740
  const showGolemTab = getGolemVoieRang(character) >= 2
  const showRunesTab = hasVoieEtheree(character)
  const showCristauxTab = hasCristauxVoie(character)
  // L'onglet compagnons n'apparaît que si une voie du personnage en a effectivement octroyé un.
  const showCompagnonsTab = getCompagnonsDisponibles(character, descriptions).length > 0
  useEffect(() => {
    if (!showGolemTab && sheetPage === 'golem') setSheetPage('recto')
    if (!showRunesTab && sheetPage === 'runes') setSheetPage('recto')
    if (!showCristauxTab && sheetPage === 'cristaux') setSheetPage('recto')
    if (!showCompagnonsTab && sheetPage === 'compagnons') setSheetPage('recto')
  }, [showGolemTab, showRunesTab, showCristauxTab, showCompagnonsTab])
  const [zoom, setZoom] = useState(() => {
    const saved = localStorage.getItem('tdr-zoom')
    return saved ? parseInt(saved) : 60
  })
  const [calibrate, setCalibrate] = useState(false)
  // Prépare l'impression : la fiche affiche une pastille par champ pour choisir ce qui figure sur
  // la version papier, avant de lancer réellement l'impression.
  const [modeImpression, setModeImpression] = useState(false)
  const [calibrageSauve, setCalibrageSauve] = useState<'ok' | 'erreur' | null>(null)
  // Le calibrage est réservé à l'auteur du jeu : il conditionne l'alignement des champs sur les fonds
  // livrés, qu'un utilisateur final n'a aucune raison de modifier (et qu'il casserait sans le vouloir).
  const [calibrageDeverrouille, setCalibrageDeverrouille] = useState(false)
  const [demandeMotDePasse, setDemandeMotDePasse] = useState(false)
  const [motDePasseSaisi, setMotDePasseSaisi] = useState('')
  const [motDePasseErreur, setMotDePasseErreur] = useState(false)
  const validerMotDePasse = () => {
    if (motDePasseSaisi === MASQUAGE_MOT_DE_PASSE) {
      setCalibrageDeverrouille(true); setDemandeMotDePasse(false)
      setMotDePasseSaisi(''); setMotDePasseErreur(false)
      setCalibrate(true); setShowGestion(false)
    } else setMotDePasseErreur(true)
  }
  // Conteneur DOM de la réserve de calibrage (option A) — affiché à la place du wizard en mode
  // calibrage ; les champs "reserved" s'y portalent depuis CharacterSheetRecto/Verso.
  const [reserveEl, setReserveEl] = useState<HTMLDivElement | null>(null)
  const [showSave, setShowSave] = useState(false)
  const [showDescEditor, setShowDescEditor] = useState(false)
  const [showTranslationEditor, setShowTranslationEditor] = useState(false)
  const [showGameMode, setShowGameMode] = useState(false)
  // Copie de session créée à l'ouverture du Mode de jeu : toutes les mutations de la partie (PV, PM, PR, effets
  // temporaires...) se font dessus, jamais sur `character`. Fermer le Mode de jeu la jette (setGameCharacter(null)) —
  // la fiche d'origine n'est donc jamais altérée par une session de jeu.
  const [gameCharacter, setGameCharacter] = useState<Character | null>(null)
  const openGameMode = () => setGameCharacter(JSON.parse(JSON.stringify(character)))
  const closeGameMode = () => { setShowGameMode(false); setGameCharacter(null) }
  const gameOnChange = (patch: Partial<Character>) => setGameCharacter(prev => prev ? { ...prev, ...patch } : prev)
  // Réception réseau d'un objet magique (voir 'objet-magique-mj' dans reseauProtocole.ts et
  // GameModePanel.tsx) : DOIT écrire sur `character` (setCharacter), pas seulement sur `gameCharacter`
  // comme gameOnChange — sinon l'objet reçu disparaît en fermant le Mode de jeu (gameCharacter est jeté,
  // voir la note ci-dessus), alors qu'un objet transmis par le MJ doit rester acquis. Répercuté aussi sur
  // gameCharacter s'il existe, pour que le joueur le voie tout de suite sans avoir à rouvrir le Mode de
  // jeu. Chaque objet a son propre calcul de patch (armes/armures synthétisées) car `character` et
  // `gameCharacter` peuvent avoir divergé pendant la session (armes déjà changées en jeu).
  const recevoirObjetMagiqueReseau = (objet: ObjetMagiqueEntry) => {
    setObjetsMagiques(prev => [...prev.filter(o => o.id !== objet.id), objet])
    setCharacter(prev => {
      if ((prev.objetsMagiquesPossedes ?? []).includes(objet.id)) return prev
      return { ...prev, objetsMagiquesPossedes: [...(prev.objetsMagiquesPossedes ?? []), objet.id], ...patchPossessionObjetMagique(prev, objet, true) }
    })
    setGameCharacter(prev => {
      if (!prev || (prev.objetsMagiquesPossedes ?? []).includes(objet.id)) return prev
      return { ...prev, objetsMagiquesPossedes: [...(prev.objetsMagiquesPossedes ?? []), objet.id], ...patchPossessionObjetMagique(prev, objet, true) }
    })
  }
  const isAndroid = /android/i.test(navigator.userAgent)
  const [showLevelUp, setShowLevelUp] = useState(false)
  const [ficheLocked, setFicheLocked] = useState(true)
  const [showUnlockConfirm, setShowUnlockConfirm] = useState(false)
  const [showGestion, setShowGestion] = useState(false)
  const gestionRef = useRef<HTMLDivElement>(null)
  const [showMobileGestion, setShowMobileGestion] = useState(false)
  const mobileGestionRef = useRef<HTMLDivElement>(null)
  const rectoInputRef = useRef<HTMLInputElement>(null)
  const versoInputRef = useRef<HTMLInputElement>(null)
  const [library, setLibrary] = useState<SavedEntry[]>([])
  const [libraryLoaded, setLibraryLoaded] = useState(false)
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null)
  const [pinned, setPinned] = useState<{ x: number; y: number } | null>(null)
  const [lastMoved, setLastMoved] = useState<{ label: string; top: number; left: number; width?: number; height?: number } | null>(null)
  const sheetRef = useRef<HTMLDivElement>(null)

  const [screenWidth, setScreenWidth] = useState(() => window.innerWidth)
  // showFullRunes = conteneur plein écran : runes divines large OU runes étroites (mobile layout)
  const showFullRunes = sheetPage === 'runes' && (runesDivinesUnlocked || screenWidth < RUNES_FULL_MIN_WIDTH)
  const [mobileTab, setMobileTab] = useState<'fiche' | 'creation' | 'jeu'>('fiche')

  const onChange = (patch: Partial<Character>) =>
    setCharacter(prev => ({ ...prev, ...patch }))

  // Pendant une session de Mode de jeu, la fiche recto affichée montre la copie de session (PV/PM/PR/DEF en
  // temps réel) au lieu de l'original — jamais l'inverse.
  const sheetCharacter = (showGameMode && gameCharacter) ? gameCharacter : character
  const sheetOnChange = (showGameMode && gameCharacter) ? gameOnChange : onChange

  const importSheetImage = (side: SheetPage, file: File) => {
    const reader = new FileReader()
    reader.onload = e => {
      const dataUrl = e.target?.result as string
      setSheetImages(prev => ({ ...prev, [side]: dataUrl }))
    }
    reader.readAsDataURL(file)
  }

  // Voir SHEET_PAGE_PAR_ETAPE. Le garde-fou ci-dessous évite de basculer la fiche quand handleLoad
  // restaure step d'un coup à savedMaxStep (8 pour un personnage terminé) : sans lui, charger
  // n'importe quel personnage sauvegardé atterrissait systématiquement sur le verso au lieu du recto.
  const skipAutoSheetPage = useRef(false)
  useEffect(() => {
    if (skipAutoSheetPage.current) { skipAutoSheetPage.current = false; return }
    setSheetPage(SHEET_PAGE_PAR_ETAPE[step] ?? 'recto')
  }, [step])

  useEffect(() => {
    const onResize = () => setScreenWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!showGestion) return
    const handler = (e: MouseEvent) => {
      if (gestionRef.current && !gestionRef.current.contains(e.target as Node))
        setShowGestion(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showGestion])


  useEffect(() => {
    const BASE_PT = 12
    const MIN_PT = 5
    const before = () => {
      const printContainer = document.querySelector<HTMLElement>('.print-only')
      if (!printContainer) return
      const rectoEl = printContainer.querySelector<HTMLElement>('.print-page-recto')
      const versoEl = printContainer.querySelector<HTMLElement>('.print-page-verso')

      // Rendre visible hors-écran avec les dimensions d'impression pour mesurer
      printContainer.style.cssText = 'display:block;position:fixed;top:-10000px;left:0;'
      if (rectoEl) rectoEl.style.cssText = 'width:210mm;height:297mm;overflow:hidden;position:relative;'
      if (versoEl) versoEl.style.cssText = 'width:210mm;height:297mm;overflow:hidden;position:relative;'
      printContainer.getBoundingClientRect() // force reflow

      printContainer.querySelectorAll<HTMLElement>('.tdr-field').forEach(el => {
        // Recalcule le line-height des textareas pour les dimensions d'impression (297mm)
        if (el.tagName === 'TEXTAREA') {
          const lhPct = parseFloat((el as HTMLElement).dataset.lhPct ?? '0')
          const ptPct = parseFloat((el as HTMLElement).dataset.ptPct ?? '0')
          if (lhPct) el.style.lineHeight = `${(lhPct / 100 * 297).toFixed(2)}mm`
          if (ptPct) el.style.paddingTop = `${(ptPct / 100 * 297).toFixed(2)}mm`
        }

        el.style.setProperty('font-size', `${BASE_PT}pt`, 'important')
        const w = el.clientWidth
        if (!w) return
        let size = BASE_PT
        while (el.scrollWidth > w + 1 && size > MIN_PT) {
          size = +(size - 0.5).toFixed(1)
          el.style.setProperty('font-size', `${size}pt`, 'important')
        }
        if (el.tagName === 'TEXTAREA') {
          const h = el.clientHeight
          if (h) {
            while (el.scrollHeight > h + 1 && size > MIN_PT) {
              size = +(size - 0.5).toFixed(1)
              el.style.setProperty('font-size', `${size}pt`, 'important')
            }
          }
        }
      })

      // Recalcule le transform portrait : scale uniquement si les tx/ty sont d'anciennes valeurs pixels
      printContainer.querySelectorAll<HTMLElement>('.portrait-img').forEach(el => {
        const s  = parseFloat(el.dataset.scale ?? '1') || 1
        const tx = parseFloat(el.dataset.tx ?? '0')
        const ty = parseFloat(el.dataset.ty ?? '0')
        const safeTx = Math.abs(tx) > 3 ? 0 : tx
        const safeTy = Math.abs(ty) > 3 ? 0 : ty
        el.style.setProperty('transform', `scale(${s}) translate(${safeTx / s * 100}%, ${safeTy / s * 100}%)`, 'important')
      })

      // Restaurer — le CSS @media print prendra le relais
      printContainer.style.cssText = ''
      if (rectoEl) rectoEl.style.cssText = ''
      if (versoEl) versoEl.style.cssText = ''
    }
    window.addEventListener('beforeprint', before)
    return () => window.removeEventListener('beforeprint', before)
  }, [])

  // Chargement initial de la bibliothèque
  useEffect(() => {
    async function load() {
      try {
        const raw = await loadDataFileDossier('Personnage/library.json', 'library.json')
        if (raw) {
          const parsed: SavedEntry[] = JSON.parse(raw)
          const portraitsRaw = await loadDataFileDossier('Personnage/portraits.json', 'portraits.json')
          const portraits: Record<string, string> = portraitsRaw ? JSON.parse(portraitsRaw) : {}
          setLibrary(parsed.map(e => ({ ...e, character: { ...e.character, portrait: portraits[e.id] ?? e.character.portrait ?? '' } })))
        }
      } catch {
        // Fallback localStorage (migration depuis ancienne version)
        try {
          const saved = localStorage.getItem('tdr-library')
          if (saved) {
            const parsed: SavedEntry[] = JSON.parse(saved)
            const portraits: Record<string, string> = JSON.parse(localStorage.getItem('tdr-portraits') ?? '{}')
            setLibrary(parsed.map(e => ({ ...e, character: { ...e.character, portrait: portraits[e.id] ?? e.character.portrait ?? '' } })))
          }
        } catch { /* ignore */ }
      }
      setLibraryLoaded(true)
    }
    load()
  }, [])

  // Persistance de la bibliothèque (portraits séparés pour limites de taille)
  const saveLibrary = useCallback(async (lib: SavedEntry[]) => {
    try {
      const portraits: Record<string, string> = {}
      const compact = lib.map(e => {
        if (e.character.portrait) portraits[e.id] = e.character.portrait
        return { ...e, character: { ...e.character, portrait: '' } }
      })
      await saveDataFile('Personnage/library.json', JSON.stringify(compact))
      try {
        await saveDataFile('Personnage/portraits.json', JSON.stringify(portraits))
      } catch { /* portrait trop grand */ }
    } catch { /* quota dépassé */ }
  }, [])

  useEffect(() => {
    if (!libraryLoaded) return
    saveLibrary(library)
  }, [library, libraryLoaded, saveLibrary])

  const getCoords = (e: React.MouseEvent) => {
    const rect = sheetRef.current!.getBoundingClientRect()
    return {
      x: +((e.clientX - rect.left) / rect.width  * 100).toFixed(1),
      y: +((e.clientY - rect.top)  / rect.height * 100).toFixed(1),
    }
  }

  // 700px ne couvrait que les téléphones — une vraie tablette Android en paysage (ex. 1138px de large,
  // observé en test) restait en mise en page desktop malgré un usage tactile. 1200 reste sous les
  // résolutions courantes d'ordinateur portable (1366+), donc ne bascule pas un petit écran d'ordi.
  const isMobile = screenWidth < 1200
  // Distinct de isMobile : sert UNIQUEMENT à bloquer l'accès au mode MJ (voir plus bas), pas les mises
  // en page. Une tablette (700-1200px) doit rester bloquée par un accueil tactile plus petit qu'un
  // ordinateur mais garder accès au mode MJ pour tester ses écrans adaptés (tiroirs, etc.) — seul un
  // téléphone (< 700px) est jugé trop petit pour le mode MJ.
  const isPhone = screenWidth < 700

  const handleLoad = (c: Character, savedMaxStep: number) => {
    const tm = c.talentMagique
    // Migration : compagnonsOverrides (legacy, par position) est remplacé par compagnonsFiches (par
    // nom) — voir FicheCompagnon.tsx. Recopié une seule fois si absent du nouveau format, puis le
    // champ legacy est omis (undefined) du personnage normalisé : plus jamais réécrit.
    const legacyOverrides = (c as Character & { compagnonsOverrides?: [CompagnonOverride | null, CompagnonOverride | null] }).compagnonsOverrides
    const compagnonsFichesMigre = { ...(c.compagnonsFiches ?? {}) }
    if (legacyOverrides) {
      for (const slot of [0, 1] as const) {
        const nom = c.compagnonsActifs?.[slot]
        if (nom && !compagnonsFichesMigre[nom] && legacyOverrides[slot]) {
          compagnonsFichesMigre[nom] = legacyOverrides[slot]!
        }
      }
    }
    // Migration : tresorerie (legacy, texte libre "5 pièces d'or") remplacée par piecesOr/piecesArgent/
    // piecesCuivre/gemmes — voir normaliserTresorerie (types/character.ts). Le nombre en tête du texte
    // devient piecesOr ; le texte d'origine n'est recopié dans gemmes que s'il contient autre chose
    // qu'un simple montant en or (ex. "5 pièces d'or, une bague en argent") — filet de sécurité pour ne
    // rien perdre, sans dupliquer "5 pièces d'or" dans un champ qui n'a plus rien à voir avec l'or.
    // Jamais appliqué si le personnage a déjà le nouveau format (piecesOr défini).
    const legacyTresorerie = (c as Character & { tresorerie?: string }).tresorerie
    const legacyEstMontantOrSeul = legacyTresorerie !== undefined
      && /^\s*\d+\s*(pi[eè]ces?\s+d['’]or|po)?\s*\.?\s*$/i.test(legacyTresorerie)
    const tresorerieMigree = legacyTresorerie !== undefined && c.piecesOr === undefined
      ? { piecesOr: parseInt(legacyTresorerie) || 0, piecesArgent: 0, piecesCuivre: 0, gemmes: c.gemmes ?? (legacyEstMontantOrSeul ? '' : legacyTresorerie) }
      : {}
    const normalized = {
      ...c,
      ...tresorerieMigree,
      tresorerie: undefined,
      compagnonsFiches: compagnonsFichesMigre,
      compagnonsOverrides: undefined,
      talentMagique: typeof tm === 'string' ? { nom: tm, desc: '' } : (tm ?? { nom: '', desc: '' }),
      portrait: c.portrait ?? '',
      portraitScale: c.portraitScale ?? 1,
      // Migration : anciennes valeurs en pixels (|val|>3) → reset à 0 (fraction du container)
      portraitTx: Math.abs(c.portraitTx ?? 0) > 3 ? 0 : (c.portraitTx ?? 0),
      portraitTy: Math.abs(c.portraitTy ?? 0) > 3 ? 0 : (c.portraitTy ?? 0),
      portraitFit: c.portraitFit ?? 'cover',
      traitPeupleDesc: c.traitPeupleDesc ?? findTrait(c.peuple, c.culture)?.desc ?? '',
      armuresEquipees: c.armuresEquipees ?? [],
      bonusDefense: c.bonusDefense ?? 0,
      enchantementEncombrement: c.enchantementEncombrement ?? 0,
      arme1: c.arme1 ?? '',
      arme2: c.arme2 ?? '',
      dmArme1: c.dmArme1 ?? '',
      dmArme2: c.dmArme2 ?? '',
    }
    setCharacter(normalized)
    skipAutoSheetPage.current = true
    setStep(savedMaxStep)
    setMaxStep(savedMaxStep)
    setSheetPage('recto')
  }

  const printContainer = (
    <div className="print-only" style={{ '--portrait-scale': character.portraitScale ?? 1 } as React.CSSProperties}>
      {/* fieldPositions/sheetImage doivent être passés ici aussi, sinon l'impression ignore tout le
          calibrage — et depuis que les champs portent une page, un champ déplacé s'imprimerait sur
          sa fiche d'origine au lieu de celle où il a été posé. */}
      <div className="print-page-recto">
        <CharacterSheetRecto character={character} onChange={() => {}} activeStep={-1}
          fieldPositions={fieldPositions} sheetImage={sheetImages.recto || undefined} />
      </div>
      <div className="print-page-verso">
        <CharacterSheetVerso character={character} onChange={() => {}} activeStep={-1}
          fieldPositions={fieldPositions} sheetImage={sheetImages.verso || undefined} />
      </div>
      <div className="print-page-voies">
        <CharacterSheetVoies character={character} onChange={() => {}} activeStep={-1}
          fieldPositions={fieldPositions} sheetImage={sheetImages.voies || undefined} />
      </div>
      {/* Une fiche A5 par compagnon débloqué (voir CharacterSheetCompagnons/FicheCompagnon), chacune
          déjà wrappée dans .print-page-compagnon par le composant lui-même — toutesLesPages sort
          toutes les fiches d'un coup plutôt que la seule page actuellement affichée à l'écran.
          Rendu conditionnel : sans compagnon débloqué, le composant affiche un message "aucun
          compagnon" qu'il ne faut pas imprimer (voir showCompagnonsTab, même condition que l'onglet). */}
      {showCompagnonsTab && (
        <CharacterSheetCompagnons character={character} onChange={() => {}}
          fieldPositions={fieldPositions} toutesLesPages />
      )}
    </div>
  )

  const modals = (
    <>
      <input ref={rectoInputRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) importSheetImage('recto', f); e.target.value = '' }} />
      <input ref={versoInputRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) importSheetImage('verso', f); e.target.value = '' }} />

      {showLevelUp && (
        <LevelUpModal character={character} onConfirm={onChange} onClose={() => setShowLevelUp(false)} />
      )}


      {/* ── Bottom sheet Gestion (mobile) ── */}
      {showMobileGestion && (
        <>
          <div onClick={() => setShowMobileGestion(false)} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.55)' }} />
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 201,
            background: 'rgba(18,14,9,0.99)', borderTop: '1px solid rgba(201,168,76,0.3)',
            borderRadius: '12px 12px 0 0', boxShadow: '0 -4px 30px rgba(0,0,0,0.8)',
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 2px' }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(201,168,76,0.3)' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <button onClick={() => { setAppMode(null); setShowMobileGestion(false) }} style={{
                padding: '14px 20px', background: 'transparent', border: 'none',
                borderBottom: '1px solid rgba(201,168,76,0.1)',
                color: 'rgba(245,236,215,0.8)', cursor: 'pointer', textAlign: 'left', fontSize: 15,
              }}>
                {t('gmMode.changerMode')}
              </button>
              <button onClick={() => { setShowDescEditor(d => !d); setShowMobileGestion(false) }} style={{
                padding: '14px 20px', background: 'transparent', border: 'none',
                borderBottom: '1px solid rgba(201,168,76,0.1)',
                color: 'rgba(245,236,215,0.8)', cursor: 'pointer', textAlign: 'left', fontSize: 15,
              }}>
                {t('menuGestion.donneesJeu')}
              </button>
              <button onClick={() => {
                if (ficheLocked) { setShowUnlockConfirm(true); setShowMobileGestion(false) }
                else { setFicheLocked(true); setShowMobileGestion(false) }
              }} style={{
                padding: '14px 20px', background: ficheLocked ? 'transparent' : 'rgba(255,160,50,0.08)',
                border: 'none', borderBottom: '1px solid rgba(201,168,76,0.1)',
                color: ficheLocked ? 'rgba(245,236,215,0.8)' : 'rgba(255,180,60,0.95)',
                cursor: 'pointer', textAlign: 'left', fontSize: 15,
              }}>
                {ficheLocked ? t('menuGestion.deverrouiller') : t('menuGestion.verrouiller')}
              </button>
              <div style={{ padding: '10px 20px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 11, color: 'rgba(245,236,215,0.4)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  {t('menuGestion.feuilles')}
                </span>
                {(['recto', 'verso', 'voies'] as const).map(side => (
                  <div key={side} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => { (side === 'recto' ? rectoInputRef : versoInputRef).current?.click(); setShowMobileGestion(false) }} style={{
                      flex: 1, padding: '8px 12px', background: 'transparent',
                      border: '1px solid rgba(201,168,76,0.25)', borderRadius: 4,
                      color: 'rgba(245,236,215,0.75)', cursor: 'pointer', fontSize: 13, textAlign: 'left',
                    }}>
                      {sheetImages[side] ? t('menuGestion.feuillePersonnalisee', { side: side.toUpperCase() }) : t('menuGestion.importerFeuille', { side: side.toUpperCase() })}
                    </button>
                    {sheetImages[side] && (
                      <button onClick={() => setSheetImages(prev => ({ ...prev, [side]: '' }))} title={t('menuGestion.reinitFeuille')} style={{
                        padding: '6px 10px', background: 'transparent',
                        border: '1px solid rgba(255,80,80,0.3)', borderRadius: 4,
                        color: 'rgba(255,110,110,0.7)', cursor: 'pointer', fontSize: 13,
                      }}>✕</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
      {showDescEditor && <DescriptionsEditor onClose={() => setShowDescEditor(false)} />}
      {showTranslationEditor && !isAndroid && <TranslationEditor onClose={() => setShowTranslationEditor(false)} />}

      {showUnlockConfirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)',
        }}>
          <div style={{ background: 'rgba(22,17,11,0.99)', border: '1px solid rgba(255,160,50,0.5)',
            borderRadius: 10, padding: '28px 28px 24px', maxWidth: 420, width: '90vw',
            boxShadow: '0 8px 40px rgba(0,0,0,0.9)', display: 'flex', flexDirection: 'column', gap: 18,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 28 }}>🔓</span>
              <span style={{ fontSize: 17, fontWeight: 700, color: 'rgba(255,180,60,0.95)', fontFamily: "'Cinzel', serif" }}>
                {t('modalDeverrouiller.titre')}
              </span>
            </div>
            <div style={{ fontSize: 14, color: 'rgba(245,236,215,0.85)', lineHeight: 1.6 }}>
              <Trans
                i18nKey="modalDeverrouiller.description"
                components={{ highlight: <strong style={{ color: 'rgba(255,180,60,0.9)' }} /> }}
              />
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,150,50,0.8)', lineHeight: 1.6,
              background: 'rgba(255,120,30,0.08)', border: '1px solid rgba(255,120,30,0.25)',
              borderRadius: 6, padding: '10px 14px',
            }}>
              <Trans
                i18nKey="modalDeverrouiller.avertissement"
                components={{ strong: <strong /> }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button onClick={() => setShowUnlockConfirm(false)} style={{
                padding: '8px 20px', borderRadius: 5, cursor: 'pointer', fontSize: 14,
                border: '1px solid rgba(245,236,215,0.2)', background: 'transparent',
                color: 'rgba(245,236,215,0.55)', fontFamily: 'inherit',
              }}>{t('modalDeverrouiller.annuler')}</button>
              <button onClick={() => { setFicheLocked(false); setShowUnlockConfirm(false) }} style={{
                padding: '8px 20px', borderRadius: 5, cursor: 'pointer', fontSize: 14, fontWeight: 700,
                border: '1px solid rgba(255,160,50,0.6)', background: 'rgba(255,160,50,0.15)',
                color: 'rgba(255,180,60,0.95)', fontFamily: 'inherit',
              }}>{t('modalDeverrouiller.confirmer')}</button>
            </div>
          </div>
        </div>
      )}
      {showSave && (
        <SaveLoadPanel
          character={character}
          maxStep={maxStep}
          library={library}
          onLibraryChange={setLibrary}
          onLoad={handleLoad}
          onNew={() => {
            setCharacter({ ...defaultCharacter(), inventaire: t('wizard.step7.inventaireDefault') })
            setStep(0)
            setMaxStep(0)
          }}
          onClose={() => setShowSave(false)}
        />
      )}
    </>
  )

  // ─── Layout mobile (< 1200px) ───────────────────────────────────────────
  const mobileToolbarButtons = (
    <>
      {(['recto', 'verso', 'voies', ...(showCompagnonsTab ? ['compagnons'] : []), ...(showGolemTab ? ['golem'] : []), ...(showRunesTab ? ['runes'] : []), ...(showCristauxTab ? ['cristaux'] : []), 'notes'] as ('recto' | 'verso' | 'voies' | 'compagnons' | 'golem' | 'runes' | 'cristaux' | 'notes')[]).map(p => (
        <button key={p} onClick={() => setSheetPage(p)} style={{
          flexShrink: 0,
          padding: '6px 14px', borderRadius: '4px 4px 0 0',
          border: '1px solid rgba(201,168,76,0.4)',
          borderBottom: sheetPage === p ? '2px solid var(--tdr-gold)' : '1px solid transparent',
          background: sheetPage === p ? 'rgba(201,168,76,0.1)' : 'transparent',
          color: sheetPage === p ? 'var(--tdr-gold)' : 'rgba(245,236,215,0.5)',
          cursor: 'pointer', fontSize: 15,
          fontFamily: "'Cinzel', serif", letterSpacing: '0.05em',
        }}>
          {t(`fiche.${p}`)}
        </button>
      ))}
      <button onClick={() => { openGameMode(); setShowGameMode(true); setMobileTab('jeu') }} style={{
        flexShrink: 0, padding: '6px 12px', borderRadius: 4,
        border: '1px solid rgba(160,120,255,0.6)', background: 'rgba(140,100,255,0.25)',
        color: 'rgba(210,185,255,0.95)', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap',
      }}>{t('toolbar.jouer')}</button>
      <button onClick={() => setShowSave(true)} style={{
        flexShrink: 0, padding: '6px 12px', borderRadius: 4,
        border: '1px solid rgba(201,168,76,0.4)', background: 'transparent',
        color: 'rgba(245,236,215,0.7)', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap',
      }}>{t('toolbar.personnages')}</button>
      <button onClick={() => setShowLevelUp(true)} style={{
        flexShrink: 0, padding: '6px 12px', borderRadius: 4,
        border: '1px solid rgba(201,168,76,0.5)', background: 'transparent',
        color: 'rgba(245,236,215,0.85)', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap',
      }}>{t('toolbar.niveau', { niveau: character.niveau })}{character.niveau >= 20 ? ' ★' : ' →'}</button>
      <div ref={mobileGestionRef} style={{ flexShrink: 0 }}>
        <button onClick={() => setShowMobileGestion(g => !g)} style={{
          padding: '6px 12px', borderRadius: 4, whiteSpace: 'nowrap',
          border: `1px solid ${showMobileGestion ? 'var(--tdr-gold)' : 'rgba(201,168,76,0.4)'}`,
          background: showMobileGestion ? 'rgba(201,168,76,0.1)' : 'transparent',
          color: showMobileGestion ? 'var(--tdr-gold)' : 'rgba(245,236,215,0.7)',
          cursor: 'pointer', fontSize: 13,
        }}>
          {t('toolbar.gestion')}
        </button>
      </div>
    </>
  )

  // Mode MJ trop complexe pour un téléphone : si aucun mode n'est choisi, ou si la fenêtre est
  // redescendue sous le seuil téléphone alors qu'on était déjà en MJ, on (re)montre le sélecteur avec
  // la carte MJ désactivée plutôt que de laisser l'interface MJ s'afficher sur un si petit écran.
  // Une tablette (isMobile mais pas isPhone) garde l'accès, pour tester les écrans MJ adaptés au tactile.
  if (!appMode || (appMode === 'mj' && isPhone)) {
    return (
      <>
        <ModeSelector
          onSelect={setAppMode} mjDisabled={isPhone}
          languages={languages} currentLanguage={i18n.language}
          onChangeLanguage={code => { i18n.changeLanguage(code); localStorage.setItem('tda-lang', code) }}
          onOpenTranslations={isAndroid ? undefined : () => setShowTranslationEditor(true)}
        />
        {showTranslationEditor && !isAndroid && <TranslationEditor onClose={() => setShowTranslationEditor(false)} />}
      </>
    )
  }

  if (appMode === 'mj') {
    return <GMDashboard onBack={() => setAppMode(null)} />
  }

  if (isMobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden', background: 'var(--tdr-dark)', paddingTop: 'env(safe-area-inset-top)', paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }}>
        {printContainer}

        {/* Zone de contenu — Fiche et Création/Jeu restent montés (display seul change) pour ne pas perdre l'état du mode de jeu en changeant d'onglet */}
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>

          <div style={{ display: mobileTab === 'fiche' ? 'block' : 'none', height: '100%' }}>
            {sheetPage === 'runes' ? (
              /* Runes : toolbar fixe + composant 3 zones */
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#111', overflow: 'hidden' }}>
                <div style={{
                  flexShrink: 0, display: 'flex', alignItems: 'center', flexWrap: 'nowrap', gap: 6, padding: '8px',
                  zIndex: 35, background: '#111', borderBottom: '1px solid rgba(201,168,76,0.15)',
                  overflowX: 'auto', WebkitOverflowScrolling: 'touch' as const,
                }}>
                  {mobileToolbarButtons}
                </div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <CharacterSheetRunes character={character} divin={runesDivin} onDivinChange={setRunesDivin} mobile screenWidth={screenWidth} />
                </div>
              </div>
            ) : sheetPage === 'notes' ? (
              /* Notes : toolbar fixe + panneau plein écran (gère son propre scroll interne) */
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#111', overflow: 'hidden' }}>
                <div style={{
                  flexShrink: 0, display: 'flex', alignItems: 'center', flexWrap: 'nowrap', gap: 6, padding: '8px',
                  zIndex: 35, background: '#111', borderBottom: '1px solid rgba(201,168,76,0.15)',
                  overflowX: 'auto', WebkitOverflowScrolling: 'touch' as const,
                }}>
                  {mobileToolbarButtons}
                </div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <NotesTab
                    mobile selectedId={notesSelectedId} onSelectId={setNotesSelectedId}
                    notes={notes} setNotes={setNotes} campagnes={campagnes} setCampagnes={setCampagnes}
                    noteImages={noteImages} setNoteImages={setNoteImages}
                  />
                </div>
              </div>
            ) : (
              /* Autres pages : toolbar sticky + scroll classique */
              <div style={{ height: '100%', overflowY: 'auto', background: '#111' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', flexWrap: 'nowrap', gap: 6, padding: '8px',
                  position: 'sticky', top: 0, zIndex: 35, background: '#111',
                  borderBottom: '1px solid rgba(201,168,76,0.15)',
                  overflowX: 'auto', WebkitOverflowScrolling: 'touch' as const,
                }}>
                  {mobileToolbarButtons}
                </div>
                <div style={{ padding: '0 4px 80px' }}>
                  {sheetPage === 'recto' ? (
                    <CharacterSheetRecto character={sheetCharacter} onChange={sheetOnChange} activeStep={step} />
                  ) : sheetPage === 'verso' ? (
                    <CharacterSheetVerso character={character} onChange={onChange} activeStep={step} />
                  ) : sheetPage === 'compagnons' ? (
                    <CharacterSheetCompagnons character={character} onChange={onChange} fieldPositions={fieldPositions} />
                  ) : sheetPage === 'voies' ? (
                    <CharacterSheetVoies character={character} onChange={onChange} activeStep={step}
                      fieldPositions={fieldPositions} sheetImage={sheetImages.voies || undefined} />
                  ) : sheetPage === 'cristaux' ? (
                    <CharacterSheetCristaux character={character} onChange={onChange} />
                  ) : (
                    <CharacterSheetGolem character={character} onChange={onChange} />
                  )}
                </div>
              </div>
            )}
          </div>

          <div style={{ display: mobileTab === 'fiche' ? 'none' : 'flex', flexDirection: 'column', height: '100%', background: 'rgba(20,16,10,0.98)' }}>
            {showGameMode ? (
              <GameModePanel character={gameCharacter ?? character} descriptions={descriptions} onChange={gameOnChange} onObjetMagiqueRecu={recevoirObjetMagiqueReseau} onClose={() => { closeGameMode(); setMobileTab('creation') }} screenWidth={screenWidth} />
            ) : (
              <>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(201,168,76,0.15)', textAlign: 'center', flexShrink: 0 }}>
                  <div style={{ fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.5 }}>
                    {t('app.titre')}
                  </div>
                  <div style={{ fontSize: 17, fontFamily: "'Cinzel', serif", fontWeight: 700, color: 'var(--tdr-gold)', letterSpacing: '0.05em' }}>
                    {t('app.sousTitre')}
                  </div>
                </div>
                <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <CreationWizard
                    step={step} maxStep={maxStep} character={character} onChange={onChange}
                    onNext={() => { const n = Math.min(step + 1, STEP_COUNT - 1); setStep(n); setMaxStep(m => Math.max(m, n)) }}
                    onPrev={() => setStep(s => Math.max(s - 1, 0))}
                    onGoTo={(s) => { setStep(s); setMaxStep(m => Math.max(m, s)) }}
                    onSave={() => setShowSave(true)}
                    onPlay={() => { openGameMode(); setShowGameMode(true); setMobileTab('jeu') }}
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Barre de navigation basse */}
        <div style={{ flexShrink: 0, background: 'rgba(15,12,8,0.98)', borderTop: '1px solid rgba(201,168,76,0.25)' }}>
          <div style={{ display: 'flex', height: 56 }}>
            {(['fiche', showGameMode ? 'jeu' : 'creation'] as const).map(tab => (
              <button key={tab} onClick={() => setMobileTab(tab)} style={{
                flex: 1, border: 'none', background: 'transparent',
                color: mobileTab === tab ? 'var(--tdr-gold)' : 'rgba(245,236,215,0.45)',
                fontSize: 15, fontFamily: "'Cinzel', serif", letterSpacing: '0.05em',
                borderTop: mobileTab === tab ? '2px solid var(--tdr-gold)' : '2px solid transparent',
                cursor: 'pointer',
              }}>{tab === 'fiche' ? t('mobile.ongletFiche') : tab === 'jeu' ? t('gameMode.title') : t('mobile.ongletCreation')}</button>
            ))}
          </div>
          <div style={{ height: 'env(safe-area-inset-bottom)' }} />
        </div>

        {modals}
      </div>
    )
  }

  // ─── Layout desktop / tablette (>= 700px) ───────────────────────────────
  return (
    <ModeImpressionContext.Provider value={modeImpression}>
    <div className="app-root" style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--tdr-dark)' }}>

      <SaveStatusIndicator />

      {/* Déverrouillage du calibrage — même mot de passe que les voies masquées. */}
      {demandeMotDePasse && (
        <div
          onClick={() => { setDemandeMotDePasse(false); setMotDePasseSaisi(''); setMotDePasseErreur(false) }}
          className="no-print"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div onClick={e => e.stopPropagation()} style={{
            background: 'rgba(20,15,8,0.98)', border: '1px solid rgba(201,168,76,0.5)', borderRadius: 6,
            padding: '18px 22px', width: 380, boxShadow: '0 6px 28px rgba(0,0,0,0.8)',
            display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--tdr-gold)' }}>
              {t('menuGestion.calibrageVerrouille')}
            </div>
            <div style={{ fontSize: 13, color: 'rgba(245,236,215,0.65)', lineHeight: 1.5 }}>
              {t('menuGestion.calibrageVerrouilleDesc')}
            </div>
            <input
              type="password" autoFocus value={motDePasseSaisi}
              onChange={e => { setMotDePasseSaisi(e.target.value); setMotDePasseErreur(false) }}
              onKeyDown={e => e.key === 'Enter' && validerMotDePasse()}
              placeholder={t('descEditor.motDePasse')}
              style={{
                padding: '8px 12px', borderRadius: 4, fontSize: 14, fontFamily: 'inherit', outline: 'none',
                border: `1px solid ${motDePasseErreur ? '#c05050' : 'rgba(201,168,76,0.3)'}`,
                background: 'rgba(255,255,255,0.05)', color: 'rgba(245,236,215,0.9)',
              }}
            />
            {motDePasseErreur && <div style={{ fontSize: 12, color: '#c05050' }}>{t('descEditor.motDePasseIncorrect')}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => { setDemandeMotDePasse(false); setMotDePasseSaisi(''); setMotDePasseErreur(false) }} style={{
                padding: '7px 16px', borderRadius: 4, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                border: '1px solid rgba(245,236,215,0.15)', background: 'transparent', color: 'rgba(245,236,215,0.5)',
              }}>{t('descEditor.annuler')}</button>
              <button onClick={validerMotDePasse} style={{
                padding: '7px 16px', borderRadius: 4, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                border: '1px solid rgba(201,168,76,0.5)', background: 'rgba(201,168,76,0.12)', color: 'var(--tdr-gold)',
              }}>{t('descEditor.confirmer')}</button>
            </div>
          </div>
        </div>
      )}

      {calibrageSauve && (
        <div className="no-print" style={{
          position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 900,
          padding: '8px 18px', borderRadius: 5, fontSize: 13,
          background: calibrageSauve === 'ok' ? 'rgba(30,80,30,0.96)' : 'rgba(90,25,25,0.96)',
          border: `1px solid ${calibrageSauve === 'ok' ? 'rgba(120,200,120,0.7)' : 'rgba(220,90,90,0.7)'}`,
          color: calibrageSauve === 'ok' ? 'rgba(190,240,190,0.95)' : 'rgba(255,180,180,0.95)',
        }}>
          {calibrageSauve === 'ok' ? t('menuGestion.calibrageSauve') : t('menuGestion.calibrageErreur')}
        </div>
      )}

      {/* Barre du mode « préparer l'impression » : chaque champ de la fiche porte alors une pastille
          🖨 / 🚫 pour décider s'il figure sur la version papier. Le choix est enregistré avec les
          positions, donc valable pour tous les personnages. */}
      {modeImpression && (
        <div className="no-print" style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 500,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14,
          padding: '8px 16px', background: 'rgba(18,14,9,0.97)',
          borderBottom: '1px solid rgba(201,168,76,0.4)', boxShadow: '0 2px 12px rgba(0,0,0,0.6)',
        }}>
          <span style={{ fontSize: 13, color: 'rgba(245,236,215,0.75)' }}>
            {t('impression.consigne')}
          </span>
          <button onClick={() => { document.body.removeAttribute('data-print'); window.print() }}
            style={{ padding: '5px 16px', borderRadius: 4, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              border: '1px solid rgba(201,168,76,0.6)', background: 'rgba(201,168,76,0.15)', color: 'var(--tdr-gold)', fontFamily: 'inherit' }}>
            {t('impression.lancer')}
          </button>
          <button onClick={() => setModeImpression(false)}
            style={{ padding: '5px 14px', borderRadius: 4, fontSize: 13, cursor: 'pointer',
              border: '1px solid rgba(245,236,215,0.2)', background: 'transparent', color: 'rgba(245,236,215,0.6)', fontFamily: 'inherit' }}>
            {t('impression.fermer')}
          </button>
        </div>
      )}

      {printContainer}

      {import.meta.env.DEV && (
        <div style={{ position: 'fixed', bottom: 8, right: 8, zIndex: 9999, background: 'rgba(0,0,0,0.75)', color: 'rgba(201,168,76,0.9)', fontSize: 11, fontFamily: 'monospace', padding: '3px 8px', borderRadius: 4, pointerEvents: 'none' }}>
          {screenWidth}px · {sheetPage === 'runes' ? (runesDivinesUnlocked && screenWidth >= RUNES_FULL_MIN_WIDTH ? 'RunesFull' : `RunesMobile (<${RUNES_FULL_MIN_WIDTH})`) : sheetPage}
        </div>
      )}

      {/* === FEUILLE (gauche, ou plein écran si runes full) === */}
      <div className="no-print"
        onWheel={e => {
          // Ctrl+molette = zoom (comme un navigateur), pas le défilement habituel — sans preventDefault,
          // le navigateur zoomerait toute la page en plus de notre propre zoom sur la feuille.
          if (!e.ctrlKey) return
          e.preventDefault()
          const n = Math.min(82, Math.max(30, zoom - Math.sign(e.deltaY) * 5))
          localStorage.setItem('tdr-zoom', String(n))
          setZoom(n)
        }}
        style={{
          width: showFullRunes ? '100%' : `${zoom}%`, height: showFullRunes ? '100%' : undefined,
          flexShrink: 0, minWidth: 280, overflowY: showFullRunes ? 'hidden' : 'auto',
          display: 'flex', flexDirection: 'column', background: '#111',
          // Les tailles de police des champs de la feuille sont exprimées en vw (relatif à TOUTE la
          // fenêtre), pas en % de ce conteneur — dézoomer (réduire zoom%) réduit donc la largeur du
          // conteneur (et des champs, positionnés/dimensionnés en %) sans réduire le texte, qui déborde
          // ou paraît disproportionné. --zoom-scale (1 à zoom par défaut = 60) est multiplié dans les
          // calc() de police de SheetField/SheetTextarea/DraggableRangDesc/DraggableCheckboxRow pour que
          // le texte suive la même mise à l'échelle que la boîte qui le contient.
          '--zoom-scale': zoom / 60,
        } as React.CSSProperties}>

        {/* Toolbar — outer sticky shell (contenant block pour le dropdown Gestion) */}
        <div ref={gestionRef} style={{
          position: 'sticky', top: 0, zIndex: 35, background: '#111',
        }}>
          {/* Inner scrollable */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 8px 0',
            overflowX: 'auto', WebkitOverflowScrolling: 'touch' as const,
          }}>
            {(['recto', 'verso', 'voies', ...(showCompagnonsTab ? ['compagnons'] : []), ...(showGolemTab ? ['golem'] : []), ...(showRunesTab ? ['runes'] : []), ...(showCristauxTab ? ['cristaux'] : []), 'notes'] as ('recto' | 'verso' | 'voies' | 'compagnons' | 'golem' | 'runes' | 'cristaux' | 'notes')[]).map(p => (
              <button key={p} onClick={() => setSheetPage(p)} style={{
                padding: '4px 16px', borderRadius: '4px 4px 0 0',
                border: '1px solid rgba(201,168,76,0.4)',
                borderBottom: sheetPage === p ? '2px solid var(--tdr-gold)' : '1px solid transparent',
                background: sheetPage === p ? 'rgba(201,168,76,0.1)' : 'transparent',
                color: sheetPage === p ? 'var(--tdr-gold)' : 'rgba(245,236,215,0.5)',
                cursor: 'pointer', fontSize: 15, flexShrink: 0,
                fontFamily: "'Cinzel', serif", letterSpacing: '0.05em',
                whiteSpace: 'nowrap',
              }}>
                {t(`fiche.${p}`)}
              </button>
            ))}

            <div style={{ flex: 1, minWidth: 16 }} />

            {/* Sauvegarde */}
            <button
              onClick={() => setShowSave(true)}
              style={{
                marginBottom: 4, padding: '3px 12px', borderRadius: 4,
                border: '1px solid rgba(201,168,76,0.4)',
                background: 'transparent',
                color: 'rgba(245,236,215,0.7)',
                cursor: 'pointer', letterSpacing: '0.04em', fontSize: 14,
                whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >
              {t('toolbar.personnages')}
            </button>

            {/* Niveau */}
            <button
              onClick={() => setShowLevelUp(true)}
              title={character.niveau >= 20 ? t('toolbar.niveauMax') : t('toolbar.niveauSuivant', { suivant: character.niveau + 1 })}
              style={{
                marginBottom: 4, padding: '3px 12px', borderRadius: 4,
                border: '1px solid rgba(201,168,76,0.5)',
                background: 'transparent',
                color: 'rgba(245,236,215,0.85)',
                cursor: 'pointer', letterSpacing: '0.03em', fontSize: 14,
                whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >
              {t('toolbar.niveau', { niveau: character.niveau })}{character.niveau >= 20 ? ' ★' : ' →'}
            </button>

            {/* Imprimer */}
            <button
              onClick={() => { setModeImpression(true); setCalibrate(false) }}
              style={{
                marginBottom: 4, padding: '3px 12px', borderRadius: 4,
                border: '1px solid rgba(201,168,76,0.3)',
                background: 'transparent',
                color: 'rgba(245,236,215,0.65)',
                cursor: 'pointer', letterSpacing: '0.03em', fontSize: 14,
                whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >
              {t('toolbar.imprimer')}
            </button>

            {/* Jouer */}
            <button
              onClick={() => { openGameMode(); setShowGameMode(true) }}
              style={{
                marginBottom: 4, padding: '3px 12px', borderRadius: 4,
                border: '1px solid rgba(160,120,255,0.6)',
                background: 'rgba(140,100,255,0.25)',
                color: 'rgba(210,185,255,0.95)',
                cursor: 'pointer', letterSpacing: '0.04em', fontSize: 14,
                whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >
              {t('toolbar.jouer')}
            </button>

            {/* Zoom */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 4, flexShrink: 0 }}>
              <button onClick={() => setZoom(z => { const n = Math.max(30, z - 5); localStorage.setItem('tdr-zoom', String(n)); return n })}
                style={{ color: 'var(--tdr-gold)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>−</button>
              <span style={{ fontSize: 14, color: 'rgba(245,236,215,0.6)', minWidth: 36, textAlign: 'center' }}>{zoom}%</span>
              <button onClick={() => setZoom(z => { const n = Math.min(82, z + 5); localStorage.setItem('tdr-zoom', String(n)); return n })}
                style={{ color: 'var(--tdr-gold)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>+</button>
            </div>

            {/* Bouton Gestion (dans le scroll) */}
            <button
              onClick={() => setShowGestion(g => !g)}
              style={{
                marginBottom: 4, padding: '3px 12px', borderRadius: 4,
                border: `1px solid ${showGestion ? 'var(--tdr-gold)' : 'rgba(201,168,76,0.4)'}`,
                background: showGestion ? 'rgba(201,168,76,0.1)' : 'transparent',
                color: showGestion ? 'var(--tdr-gold)' : 'rgba(245,236,215,0.7)',
                cursor: 'pointer', letterSpacing: '0.04em', fontSize: 14,
                whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >
              {t('toolbar.gestion')}
            </button>
          </div>

          {/* Dropdown Gestion — hors du scroll, positionné par rapport au sticky shell */}
          {showGestion && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 100,
              background: 'rgba(18,14,9,0.99)', border: '1px solid rgba(201,168,76,0.3)',
              borderRadius: 6, boxShadow: '0 4px 20px rgba(0,0,0,0.7)',
              minWidth: 220, display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}>
              {/* Changer de mode */}
              <button onClick={() => { setAppMode(null); setShowGestion(false) }} style={{
                padding: '10px 16px', background: 'transparent', border: 'none',
                borderBottom: '1px solid rgba(201,168,76,0.1)',
                color: 'rgba(245,236,215,0.8)', cursor: 'pointer', textAlign: 'left', fontSize: 14,
              }}>
                {t('gmMode.changerMode')}
              </button>

              {/* Données du jeu */}
              <button onClick={() => { setShowDescEditor(d => !d); setShowGestion(false) }} style={{
                padding: '10px 16px', background: 'transparent', border: 'none',
                borderBottom: '1px solid rgba(201,168,76,0.1)',
                color: 'rgba(245,236,215,0.8)', cursor: 'pointer', textAlign: 'left', fontSize: 14,
              }}>
                {t('menuGestion.donneesJeu')}
              </button>

              {/* Déverrouiller la fiche */}
              <button onClick={() => {
                if (ficheLocked) { setShowUnlockConfirm(true); setShowGestion(false) }
                else { setFicheLocked(true); setShowGestion(false) }
              }} style={{
                padding: '10px 16px', background: ficheLocked ? 'transparent' : 'rgba(255,160,50,0.1)',
                border: 'none', borderBottom: '1px solid rgba(201,168,76,0.1)',
                color: ficheLocked ? 'rgba(245,236,215,0.8)' : 'rgba(255,180,60,0.95)',
                cursor: 'pointer', textAlign: 'left', fontSize: 14,
              }}>
                {ficheLocked ? t('menuGestion.deverrouiller') : t('menuGestion.verrouiller')}
              </button>

              {/* Feuilles personnalisées */}
              <div style={{ borderTop: '1px solid rgba(201,168,76,0.1)', padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, color: 'rgba(245,236,215,0.4)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  {t('menuGestion.feuilles')}
                </span>
                {(['recto', 'verso', 'voies'] as const).map(side => (
                  <div key={side} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button onClick={() => (side === 'recto' ? rectoInputRef : versoInputRef).current?.click()} style={{
                      flex: 1, padding: '5px 8px', background: 'transparent',
                      border: '1px solid rgba(201,168,76,0.25)', borderRadius: 3,
                      color: 'rgba(245,236,215,0.75)', cursor: 'pointer', fontSize: 12, textAlign: 'left',
                    }}>
                      {sheetImages[side] ? t('menuGestion.feuillePersonnalisee', { side: side.toUpperCase() }) : t('menuGestion.importerFeuille', { side: side.toUpperCase() })}
                    </button>
                    {sheetImages[side] && (
                      <button onClick={() => setSheetImages(prev => ({ ...prev, [side]: '' }))} title={t('menuGestion.reinitFeuille')} style={{
                        padding: '4px 6px', background: 'transparent',
                        border: '1px solid rgba(255,80,80,0.3)', borderRadius: 3,
                        color: 'rgba(255,110,110,0.7)', cursor: 'pointer', fontSize: 11,
                      }}>✕</button>
                    )}
                  </div>
                ))}
              </div>

              {/* Calibrage */}
              <button onClick={() => { if (!calibrageDeverrouille && !calibrate) { setDemandeMotDePasse(true); return } setCalibrate(c => !c); setPinned(null); setLastMoved(null); setShowGestion(false) }} style={{
                padding: '10px 16px', background: calibrate ? 'rgba(201,168,76,0.15)' : 'transparent',
                border: 'none',
                color: calibrate ? 'var(--tdr-gold)' : 'rgba(245,236,215,0.8)',
                cursor: 'pointer', textAlign: 'left', fontSize: 14,
              }}>
                {calibrate ? t('menuGestion.calibrageOn') : t('menuGestion.calibrage')}
              </button>
              {/* Le calibrage n'est fait que par le développeur : il doit être embarqué dans l'app,
                  sinon les utilisateurs finaux reçoivent des fiches sans positions (tous les champs
                  retombent alors sur les valeurs par défaut du code). Disponible en dev uniquement,
                  l'écriture dans src/data passant par le serveur de développement. */}
              {import.meta.env.DEV && (
                <button onClick={async () => {
                  setShowGestion(false)
                  try {
                    await saveDataFileToBundle('field-positions.json', fieldPositions)
                    setCalibrageSauve('ok')
                  } catch (e) {
                    console.error(e)
                    setCalibrageSauve('erreur')
                  }
                  setTimeout(() => setCalibrageSauve(null), 4000)
                }} style={{
                  padding: '10px 16px', background: 'transparent', border: 'none',
                  color: 'rgba(245,236,215,0.8)', cursor: 'pointer', textAlign: 'left', fontSize: 14,
                }}>
                  {t('menuGestion.sauverCalibrage')}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Feuille + overlay calibrage */}
        {showFullRunes ? (
          runesDivinesUnlocked && screenWidth >= RUNES_FULL_MIN_WIDTH
            ? <CharacterSheetRunesFull character={character} divin={runesDivin} onDivinChange={setRunesDivin} />
            : <div style={{ flex: 1, overflow: 'hidden' }}>
                <CharacterSheetRunes character={character} divin={runesDivin} onDivinChange={setRunesDivin} mobile screenWidth={screenWidth} />
              </div>
        ) : sheetPage === 'notes' ? (
          /* Notes n'est pas une page de la feuille physique (pas de calibrage/positions de champs/impression) —
             elle remplace tout le panneau plutôt que de s'insérer dans le conteneur sheetRef ci-dessous. */
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
            <NotesTab
              selectedId={notesSelectedId} onSelectId={setNotesSelectedId}
              notes={notes} setNotes={setNotes} campagnes={campagnes} setCampagnes={setCampagnes}
              noteImages={noteImages} setNoteImages={setNoteImages}
            />
          </div>
        ) : (
        <div style={{ padding: '0 8px 16px' }}>
          <div
            ref={sheetRef}
            style={{ width: '100%', minWidth: 320, cursor: calibrate ? 'crosshair' : 'auto', position: 'relative' }}
            onMouseMove={e => { if (calibrate) setHover(getCoords(e)) }}
            onMouseLeave={() => setHover(null)}
            onClick={calibrate ? e => { e.stopPropagation(); setPinned(getCoords(e)) } : undefined}
          >
            {sheetPage === 'recto' ? (
              <CharacterSheetRecto character={sheetCharacter} onChange={sheetOnChange} activeStep={step}
                calibrate={calibrate} locked={ficheLocked} fieldPositions={fieldPositions} sheetImage={sheetImages.recto || undefined}
                reservePortalTarget={reserveEl}
                onReserveToggle={(l, r, pos) => setFieldPositions(prev => ({ ...prev, [l]: { ...prev[l], ...pos, reserved: r } }))}
                onCheckboxRowMoved={(l, t, lf, perRow, sx, sy) => setFieldPositions(prev => ({ ...prev, [l]: { ...prev[l], top: t, left: lf, width: sx, height: sy, perRow } }))}
                onFieldMoved={(l, t, lf, w, h) => { setLastMoved({ label: l, top: t, left: lf, width: w, height: h }); setFieldPositions(prev => ({ ...prev, [l]: { ...prev[l], top: t, left: lf, ...(w !== undefined ? { width: w } : {}), ...(h !== undefined ? { height: h } : {}) } })) }} />
            ) : sheetPage === 'verso' ? (
              <CharacterSheetVerso character={character} onChange={onChange} activeStep={step}
                calibrate={calibrate} locked={ficheLocked} fieldPositions={fieldPositions} sheetImage={sheetImages.verso || undefined}
                reservePortalTarget={reserveEl}
                onReserveToggle={(l, r, pos) => setFieldPositions(prev => ({ ...prev, [l]: { ...prev[l], ...pos, reserved: r } }))}
                onCheckboxRowMoved={(l, t, lf, perRow, sx, sy) => setFieldPositions(prev => ({ ...prev, [l]: { ...prev[l], top: t, left: lf, width: sx, height: sy, perRow } }))}
                onFieldMoved={(l, t, lf, w, h) => { setLastMoved({ label: l, top: t, left: lf, width: w, height: h }); setFieldPositions(prev => ({ ...prev, [l]: { ...prev[l], top: t, left: lf, ...(w !== undefined ? { width: w } : {}), ...(h !== undefined ? { height: h } : {}) } })) }} />
            ) : sheetPage === 'voies' ? (
              <CharacterSheetVoies character={character} onChange={onChange} activeStep={step}
                calibrate={calibrate} locked={ficheLocked} fieldPositions={fieldPositions} sheetImage={sheetImages.voies || undefined}
                reservePortalTarget={reserveEl}
                onReserveToggle={(l, r, pos) => setFieldPositions(prev => ({ ...prev, [l]: { ...prev[l], ...pos, reserved: r } }))}
                onCheckboxRowMoved={(l, t, lf, perRow, sx, sy) => setFieldPositions(prev => ({ ...prev, [l]: { ...prev[l], top: t, left: lf, width: sx, height: sy, perRow } }))}
                onFieldMoved={(l, t, lf, w, h) => { setLastMoved({ label: l, top: t, left: lf, width: w, height: h }); setFieldPositions(prev => ({ ...prev, [l]: { ...prev[l], top: t, left: lf, ...(w !== undefined ? { width: w } : {}), ...(h !== undefined ? { height: h } : {}) } })) }} />
            ) : sheetPage === 'compagnons' ? (
              <CharacterSheetCompagnons character={character} onChange={onChange}
                calibrate={calibrate} locked={ficheLocked} fieldPositions={fieldPositions}
                reservePortalTarget={reserveEl}
                onReserveToggle={(l, r, pos) => setFieldPositions(prev => ({ ...prev, [l]: { ...prev[l], ...pos, reserved: r } }))}
                onFieldMoved={(l, t, lf, w, h) => { setLastMoved({ label: l, top: t, left: lf, width: w, height: h }); setFieldPositions(prev => ({ ...prev, [l]: { ...prev[l], top: t, left: lf, ...(w !== undefined ? { width: w } : {}), ...(h !== undefined ? { height: h } : {}) } })) }} />
            ) : sheetPage === 'runes' ? (
              <CharacterSheetRunes character={character} divin={runesDivin} onDivinChange={setRunesDivin} />
            ) : sheetPage === 'cristaux' ? (
              <CharacterSheetCristaux character={character} onChange={onChange} />
            ) : (
              <CharacterSheetGolem character={character} onChange={onChange} />
            )}

            {/* Tooltip coordonnées au survol (suit le curseur) */}
            {calibrate && hover && (
              <div style={{
                position: 'absolute',
                top: `${hover.y}%`,
                left: `${hover.x}%`,
                transform: 'translate(10px, -28px)',
                background: 'rgba(0,0,0,0.88)',
                color: '#7fff7f',
                padding: '2px 8px',
                borderRadius: 4,
                fontSize: 11,
                fontFamily: 'monospace',
                pointerEvents: 'none',
                zIndex: 30,
                whiteSpace: 'nowrap',
                boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
              }}>
                top={hover.y} left={hover.x}
              </div>
            )}

            {/* Marqueur rouge au dernier clic */}
            {calibrate && pinned && (
              <div style={{
                position: 'absolute',
                top: `${pinned.y}%`,
                left: `${pinned.x}%`,
                transform: 'translate(-50%, -50%)',
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: '#ff4444',
                border: '2px solid white',
                zIndex: 31,
                pointerEvents: 'none',
                boxShadow: '0 0 4px rgba(255,68,68,0.8)',
              }} />
            )}
          </div>
        </div>
        )}
      </div>

      {/* HUD coordonnées (fixe en bas à gauche, toujours visible) */}
      {calibrate && (
        <div className="no-print" style={{
          position: 'fixed', bottom: 0, left: 0,
          right: 360,
          zIndex: 50,
          padding: '8px 16px',
          background: 'rgba(15,12,8,0.97)',
          borderTop: '1px solid rgba(201,168,76,0.4)',
          fontFamily: 'monospace', fontSize: 12, color: 'var(--tdr-parchment)',
          display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap',
        }}>
          <span style={{ color: 'rgba(245,236,215,0.5)' }}>
            {t('calibrage.survol')}{' '}
            <span style={{ color: 'var(--tdr-gold)' }}>
              {hover ? `top=${hover.y}  left=${hover.x}` : '—'}
            </span>
          </span>
          {lastMoved ? (
            <span>
              <span style={{ color: 'rgba(245,236,215,0.6)' }}>{lastMoved.label} : </span>
              <span style={{ color: '#7fff7f', fontWeight: 700 }}>
                top={lastMoved.top}  left={lastMoved.left}
                {lastMoved.width  !== undefined && `  width={${lastMoved.width}}`}
                {lastMoved.height !== undefined && `  height={${lastMoved.height}}`}
              </span>
              <button
                onClick={() => navigator.clipboard.writeText(
                  `${lastMoved.label}  top={${lastMoved.top}} left={${lastMoved.left}}` +
                  (lastMoved.width  !== undefined ? ` width={${lastMoved.width}}`   : '') +
                  (lastMoved.height !== undefined ? ` height={${lastMoved.height}}` : '')
                )}
                style={{
                  marginLeft: 8, padding: '1px 6px', fontSize: 10, borderRadius: 3,
                  border: '1px solid rgba(201,168,76,0.4)', background: 'transparent',
                  color: 'var(--tdr-gold)', cursor: 'pointer',
                }}
              >
                {t('calibrage.copier')}
              </button>
            </span>
          ) : (
            <span style={{ color: 'rgba(245,236,215,0.35)', fontSize: 11 }}>
              {t('calibrage.glisser')}
            </span>
          )}
          <button
            onClick={() => setFieldPositions(FIELD_POSITIONS_LIVRE)}
            style={{
              marginLeft: 'auto', padding: '2px 10px', fontSize: 11, borderRadius: 3,
              border: '1px solid rgba(255,80,80,0.4)', background: 'transparent',
              color: 'rgba(255,110,110,0.8)', cursor: 'pointer',
            }}
          >
            {t('calibrage.reinitialiser')}
          </button>
        </div>
      )}

      {modals}

      {/* === PANNEAU DROIT (wizard ou mode jeu) — masqué en mode runes full === */}
      {!showFullRunes && (
      <>
        {/* Barre de séparation glissable : pilote directement `zoom` (même état/persistance que le
            zoom Ctrl+molette ci-dessus, mêmes bornes 30-82) — la feuille est déjà en `${zoom}%`, le
            panneau de droite en `flex: 1` (le reste), donc juste re-router zoom vers la souris suffit,
            aucun nouvel état de largeur à introduire. Glisser vers la gauche réduit zoom% → agrandit ce
            panneau (flex: 1 prend l'espace libéré) ; vers la droite, l'inverse. */}
        <div
          className="no-print"
          onMouseDown={e => {
            e.preventDefault()
            const onMove = (ev: MouseEvent) => {
              const n = Math.min(82, Math.max(30, Math.round(ev.clientX / window.innerWidth * 100)))
              localStorage.setItem('tdr-zoom', String(n))
              setZoom(n)
            }
            const onUp = () => {
              document.removeEventListener('mousemove', onMove)
              document.removeEventListener('mouseup', onUp)
            }
            document.addEventListener('mousemove', onMove)
            document.addEventListener('mouseup', onUp)
          }}
          style={{ width: 6, flexShrink: 0, cursor: 'col-resize', background: 'rgba(201,168,76,0.2)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(201,168,76,0.5)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(201,168,76,0.2)' }}
        />
      <div className="no-print" style={{
        flex: 1, minWidth: 300,
        display: 'flex', flexDirection: 'column',
        background: 'rgba(20,16,10,0.98)',
        overflow: 'hidden',
      }}>
        {sheetPage === 'notes' ? (
          <>
            {/* Le Wizard/Mode de jeu n'a pas de sens pendant la prise de notes — ce panneau montre
                plutôt le graphe des liaisons [[...]] entre notes tant que l'onglet Notes est ouvert. */}
            <div style={{ padding: '16px', borderBottom: '1px solid rgba(201,168,76,0.15)', textAlign: 'center' }}>
              <div style={{ fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.5 }}>
                {t('app.titre')}
              </div>
              <div style={{ fontSize: 18, fontFamily: "'Cinzel', serif", fontWeight: 700, color: 'var(--tdr-gold)', letterSpacing: '0.05em' }}>
                {t('notes.graphe')}
              </div>
            </div>
            <NotesGraph selectedId={notesSelectedId} onOpenNote={setNotesSelectedId} notes={notes}
              onSetRelation={(sourceId, targetId, type) => setNotes(prev => prev.map(n => n.id !== sourceId ? n : {
                ...n,
                relations: type
                  ? [...(n.relations ?? []).filter(r => r.versId !== targetId), { versId: targetId, type }]
                  : (n.relations ?? []).filter(r => r.versId !== targetId),
                modifieLe: new Date().toISOString(),
              }))}
            />
          </>
        ) : calibrate ? (
          <>
            {/* Réserve de calibrage (option A) : les champs sans position placée (ou envoyés ici
                manuellement) atterrissent dans ce panneau plutôt que sur la feuille — cliquer dessus
                les replace sur la feuille en cours (recto ou verso selon sheetPage). */}
            <div style={{ padding: '16px', borderBottom: '1px solid rgba(160,90,230,0.25)', textAlign: 'center' }}>
              <div style={{ fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.5 }}>
                {t('app.titre')}
              </div>
              <div style={{ fontSize: 18, fontFamily: "'Cinzel', serif", fontWeight: 700, color: 'rgba(190,150,255,0.95)', letterSpacing: '0.05em' }}>
                {t('calibrage.reserve')}
              </div>
              <div style={{ fontSize: 12, opacity: 0.5, marginTop: 4 }}>
                {t('calibrage.reserveAide')}
              </div>
            </div>
            <div
              ref={setReserveEl}
              style={{ flex: 1, overflow: 'auto', padding: 14, display: 'flex', flexWrap: 'wrap', alignContent: 'flex-start', gap: 8 }}
            />
          </>
        ) : showGameMode ? (
          <GameModePanel character={gameCharacter ?? character} descriptions={descriptions} onChange={gameOnChange} onObjetMagiqueRecu={recevoirObjetMagiqueReseau} onClose={closeGameMode} screenWidth={screenWidth} />
        ) : (
          <>
            <div style={{ padding: '16px', borderBottom: '1px solid rgba(201,168,76,0.15)', textAlign: 'center' }}>
              <div style={{ fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.5 }}>
                {t('app.titre')}
              </div>
              <div style={{ fontSize: 18, fontFamily: "'Cinzel', serif", fontWeight: 700, color: 'var(--tdr-gold)', letterSpacing: '0.05em' }}>
                {t('app.sousTitre')}
              </div>
            </div>
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <CreationWizard
                step={step} maxStep={maxStep} character={character} onChange={onChange}
                onNext={() => { const n = Math.min(step + 1, STEP_COUNT - 1); setStep(n); setMaxStep(m => Math.max(m, n)) }}
                onPrev={() => setStep(s => Math.max(s - 1, 0))}
                onGoTo={(s) => { setStep(s); setMaxStep(m => Math.max(m, s)) }}
                onSave={() => setShowSave(true)}
                onPrint={() => { setModeImpression(true); setCalibrate(false) }}
                onPlay={() => { openGameMode(); setShowGameMode(true) }}
              />
            </div>
          </>
        )}
      </div>
      </>
      )}
    </div>
    </ModeImpressionContext.Provider>
  )
}
