import { useState, useMemo, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useGameData, BESTIAIRE_LIVRE } from '../../context/GameDataContext'
import { illustrationDe, publierBestiaireLivre, CHAMPS_ILLUSTRATION, cleCreature, sluggifierNom } from '../../utils/bestiairePerso'
import { publierCapacitesBibliothequeLivre } from '../../utils/cataloguePerso'
import CreatureDetail from './CreatureDetail'
import ObjetsMagiquesTab from './ObjetsMagiquesTab'
import { importerImage } from '../../utils/imageStore'
import AdversiteTab from './AdversiteTab'
import BatailleTab from './BatailleTab'
import NotesTab from '../NotesTab'
import NotesGraph from '../NotesGraph'
import bestiaireIllustration from '../../assets/bestiaire-gold.png'
import { saveDataFileToBundle } from '../../utils/tauriStorage'
import { NC_DISPONIBLES, VARIANTES_COMBATTANT, genererPNJCombattant } from '../../utils/pnjCombattant'
import type { VarianteCombattantId } from '../../utils/pnjCombattant'
import { VARIANTES_AVENTURIER, genererPNJAventurier } from '../../utils/pnjAventurier'
import type { VarianteAventurierId } from '../../utils/pnjAventurier'
import { VARIANTES_MYSTIQUE, genererPNJMystique } from '../../utils/pnjMystique'
import type { VarianteMystiqueId } from '../../utils/pnjMystique'
import type { BestiaireEntry, RencontreSauvegardee } from '../../types/gameData'
import type { BatailleSessionSauvegardee } from '../../utils/bataille'
import { desenvelopper, messageMauvaisType } from '../../utils/importTypage'

const GOLD = '#c9a84c'
const PARCHMENT = '#f5ecd7'
const SECTION_BORDER = 'rgba(201,168,76,0.2)'
// Titre de section dans l'aperçu du générateur de PNJ (voir modaleGenererOuverte) — sépare
// caractéristiques / statistiques de combat / attaques / capacités plutôt qu'un seul bloc continu.
const pnjSectionTitreStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: GOLD, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6,
}

type Tab = 'bestiaire' | 'adversite' | 'bataille' | 'objetsMagiques' | 'notes'

// Générateur de PNJ (voir BestiaireTab) — une catégorie = une table de stats par NC (voir utils/pnj*.ts)
// partagée par plusieurs variantes ; ce lookup permet au formulaire de rester générique face aux 3
// catégories sans dupliquer sa mise en page pour chacune. Les casts sur varianteId sont sûrs : le
// <select> de variante n'affiche jamais que les id de VARIANTES_<CATEGORIE> correspondants.
type CategoriePNJId = 'combattant' | 'aventurier' | 'mystique'
const CATEGORIES_PNJ: Record<CategoriePNJId, {
  nom: string
  variantes: { id: string; nom: string }[]
  generer: (varianteId: string, nc: number, nom: string) => BestiaireEntry
}> = {
  combattant: {
    nom: 'Combattant', variantes: VARIANTES_COMBATTANT,
    generer: (id, nc, nom) => genererPNJCombattant(id as VarianteCombattantId, nc, nom),
  },
  aventurier: {
    nom: 'Aventurier', variantes: VARIANTES_AVENTURIER,
    generer: (id, nc, nom) => genererPNJAventurier(id as VarianteAventurierId, nc, nom),
  },
  mystique: {
    nom: 'Mystique', variantes: VARIANTES_MYSTIQUE,
    generer: (id, nc, nom) => genererPNJMystique(id as VarianteMystiqueId, nc, nom),
  },
}

interface Props {
  onBack: () => void
}

export default function GMDashboard({ onBack }: Props) {
  const { t } = useTranslation()
  // Même seuil/mécanisme que côté joueur (voir App.tsx) : GMDashboard est monté sans aucune info de
  // largeur d'écran transmise par son parent, donc reprise ici plutôt que remontée depuis App.tsx —
  // ce tableau de bord n'a aucune raison de dépendre de l'état de la fiche de personnage.
  const [screenWidth, setScreenWidth] = useState(() => window.innerWidth)
  useEffect(() => {
    const onResize = () => setScreenWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  // Même seuil que App.tsx (voir sa note) : 1200, pas 700, pour couvrir les tablettes en paysage.
  const mobile = screenWidth < 1200
  const [tab, setTab] = useState<Tab>('bestiaire')
  // Note actuellement ouverte dans l'onglet Notes — levé ici (comme côté joueur dans App.tsx) pour que
  // le graphe de liaisons affiché à côté puisse ouvrir une note d'un clic sur son nœud.
  const [notesSelectedId, setNotesSelectedId] = useState<string | null>(null)
  // Bibliothèque de notes du MJ — volontairement DISTINCTE de celle du joueur (gmNotes/gmCampagnes/
  // gmNoteImages plutôt que notes/campagnes/noteImages) : un MJ prépare des notes de scénario qui ne
  // doivent jamais apparaître côté joueur, et inversement.
  const { gmNotes, setGmNotes, gmCampagnes, setGmCampagnes, gmNoteImages, setGmNoteImages, bestiaire, rencontres } = useGameData()
  // Créature à sélectionner automatiquement en arrivant sur l'onglet Bestiaire (déclenché par un lien
  // [[Créature]] dans une note) — consommé par BestiaireTab, voir plus bas.
  const [bestiaireForcerNom, setBestiaireForcerNom] = useState<string | null>(null)
  const onOpenCreature = (nom: string) => { setBestiaireForcerNom(nom); setTab('bestiaire') }
  // « Modifier » depuis l'aperçu d'un lien rencontre : les rencontres sont une simple liste d'actions
  // dans l'onglet Adversité (pas de panneau de détail à sélectionner) — on se contente donc d'amener
  // le MJ sur l'onglet, sans cibler une ligne précise.
  const onEditRencontre = () => setTab('adversite')
  // Cliquer directement le lien [[Rencontre]] (plutôt que « Modifier » dans l'aperçu) lance le combat
  // correspondant — consommé par AdversiteTab, voir plus bas.
  const [rencontreADemarrer, setRencontreADemarrer] = useState<RencontreSauvegardee | null>(null)
  const onPlayRencontre = (r: RencontreSauvegardee) => { setRencontreADemarrer(r); setTab('adversite') }
  // « Lancer la rencontre » depuis un événement de bataille (BatailleTab) : même navigation que
  // onPlayRencontre ci-dessus, mais on retient en plus l'instantané de bataille tout juste sauvegardé
  // pour y ramener automatiquement le MJ (reprendreAuto, consommé par BatailleTab) une fois le combat
  // terminé (onCombatTermine, consommé par AdversiteTab) — jamais déclenché pour une rencontre lancée
  // normalement (lien de note ou clic direct dans Adversité), qui continue de renvoyer là-bas.
  const [batailleARepredre, setBatailleARepredre] = useState<BatailleSessionSauvegardee | null>(null)
  const onPlayRencontreDepuisBataille = (r: RencontreSauvegardee, snapshot: BatailleSessionSauvegardee) => {
    setBatailleARepredre(snapshot)
    setRencontreADemarrer(r)
    setTab('adversite')
  }
  const onCombatTermine = () => { if (batailleARepredre) setTab('bataille') }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', background: 'var(--tdr-dark)', color: PARCHMENT }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', borderBottom: `1px solid ${SECTION_BORDER}`, flexShrink: 0, gap: 10 }}>
        <button onClick={onBack} style={{
          background: 'transparent', border: '1px solid rgba(201,168,76,0.4)', borderRadius: 4,
          color: 'rgba(245,236,215,0.7)', cursor: 'pointer', fontSize: 13, padding: '4px 10px',
        }}>
          {t('gmMode.changerMode')}
        </button>
        <span style={{ fontSize: 18, fontWeight: 700, color: GOLD, flex: 1, textAlign: 'center', fontFamily: "'Cinzel', serif", letterSpacing: '0.05em' }}>
          {t('gmMode.titre')}
        </span>
        <div style={{ width: 90 }} />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 16px', borderBottom: `1px solid ${SECTION_BORDER}`, flexShrink: 0, overflowX: 'auto' }}>
        {(['bestiaire', 'adversite', 'bataille', 'objetsMagiques', 'notes'] as Tab[]).map(tb => (
          <button key={tb} onClick={() => setTab(tb)} style={{
            padding: '6px 16px', borderRadius: '4px 4px 0 0',
            border: '1px solid rgba(201,168,76,0.4)',
            borderBottom: tab === tb ? '2px solid var(--tdr-gold)' : '1px solid transparent',
            background: tab === tb ? 'rgba(201,168,76,0.1)' : 'transparent',
            color: tab === tb ? GOLD : 'rgba(245,236,215,0.5)',
            cursor: 'pointer', fontSize: 14, whiteSpace: 'nowrap',
            fontFamily: "'Cinzel', serif", letterSpacing: '0.04em',
          }}>
            {t(`gmMode.tabs.${tb}`)}
          </button>
        ))}
      </div>

      {/* Contenu */}
      {tab === 'notes' ? (
        // Pas de padding/scroll global ici : Notes gère elle-même le défilement de ses deux panneaux
        // (liste+éditeur, puis graphe), exactement comme côté joueur dans App.tsx.
        <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
          {/* Partage 60/40 avec le graphe, comme côté joueur (App.tsx) où le panneau de gauche prend
              zoom% — 60 par défaut — de la largeur et le graphe se contente du reste. Sans ça (les deux
              flex:1, donc 50/50), le graphe s'affichait visiblement plus large qu'en mode joueur. */}
          <div style={{ flex: '3 1 0%', minWidth: 0, display: 'flex', overflow: 'hidden' }}>
            <NotesTab
              selectedId={notesSelectedId} onSelectId={setNotesSelectedId}
              notes={gmNotes} setNotes={setGmNotes} campagnes={gmCampagnes} setCampagnes={setGmCampagnes}
              noteImages={gmNoteImages} setNoteImages={setGmNoteImages}
              bestiaire={bestiaire} rencontres={rencontres}
              onOpenCreature={onOpenCreature} onEditRencontre={onEditRencontre} onPlayRencontre={onPlayRencontre}
            />
          </div>
          {/* Grille (pas flex imbriqué) pour la ligne titre / zone du graphe : un track "1fr" se
              calcule de façon fiable contre la hauteur de la grille, alors qu'un enchaînement de
              plusieurs niveaux flex + minHeight:0 s'est avéré ne pas s'afficher de façon fiable ici. */}
          <div style={{ flex: '2 1 0%', minWidth: 300, borderLeft: `1px solid ${SECTION_BORDER}`, display: 'grid', gridTemplateRows: 'auto 1fr' }}>
            {/* En-tête identique à celui du graphe côté joueur (App.tsx, même sous-titre + titre) —
                sinon un en-tête plus court ici laisse plus de hauteur au graphe que côté joueur, ce
                qui rendait la zone de graphe visiblement plus grande en mode MJ. */}
            <div style={{ padding: '16px', borderBottom: `1px solid ${SECTION_BORDER}`, textAlign: 'center' }}>
              <div style={{ fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.5, color: PARCHMENT }}>
                {t('app.titre')}
              </div>
              <div style={{ fontSize: 18, fontFamily: "'Cinzel', serif", fontWeight: 700, color: GOLD, letterSpacing: '0.05em' }}>
                {t('notes.graphe')}
              </div>
            </div>
            <NotesGraph selectedId={notesSelectedId} onOpenNote={setNotesSelectedId} notes={gmNotes}
              onSetRelation={(sourceId, targetId, type) => setGmNotes(prev => prev.map(n => n.id !== sourceId ? n : {
                ...n,
                relations: type
                  ? [...(n.relations ?? []).filter(r => r.versId !== targetId), { versId: targetId, type }]
                  : (n.relations ?? []).filter(r => r.versId !== targetId),
                modifieLe: new Date().toISOString(),
              }))}
            />
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          {tab === 'bestiaire' && <BestiaireTab forcerNom={bestiaireForcerNom} mobile={mobile} />}
          {tab === 'objetsMagiques' && <ObjetsMagiquesTab mobile={mobile} />}
          {tab === 'adversite' && <AdversiteTab demarrerAuto={rencontreADemarrer} onCombatTermine={onCombatTermine} />}
          {tab === 'bataille' && (
            <BatailleTab
              onPlayRencontre={onPlayRencontreDepuisBataille}
              reprendreAuto={batailleARepredre}
              onReprendreAutoConsomme={() => setBatailleARepredre(null)}
            />
          )}
        </div>
      )}
    </div>
  )
}

function BestiaireTab({ forcerNom, mobile }: { forcerNom?: string | null; mobile: boolean }) {
  const { t } = useTranslation()
  // Sur mobile, la liste devient un menu flottant (tiroir du bas, même principe que le tiroir
  // « Gestion » côté joueur) qu'on ouvre à la demande ; le détail occupe alors toute la largeur au
  // lieu de partager l'espace avec une colonne de liste permanente.
  const [mobileListeOuverte, setMobileListeOuverte] = useState(false)
  // Le bestiaire livré est en lecture seule (voir la séparation livré/perso dans GameDataContext) :
  // toute modification part soit dans les créatures perso, soit dans le calque d'illustrations, soit
  // dans la liste des masquées. La sélection se fait par nom, l'identifiant des créatures partout
  // ailleurs (rencontres, batailles, liens de notes) — un index dans la liste fusionnée désignerait
  // une autre créature dès qu'on masque ou ajoute quelque chose.
  const {
    bestiaire, bestiairePerso, setBestiairePerso,
    bestiaireIllustrations, setBestiaireIllustrations,
    hiddenBestiaire, setHiddenBestiaire, capacitesBibliotheque,
  } = useGameData()
  const [search, setSearch] = useState('')
  const [selectedNom, setSelectedNom] = useState<string | null>(null)
  // Le bestiaire livré contient un doublon de nom (« Orc (guerrier) », NC 4 et NC 0.5 : deux fiches
  // distinctes que l'auteur a choisi de ne pas renommer). Le nom seul ne suffit donc pas à identifier
  // LA fiche cliquée — sans ce compteur, cliquer sur l'une des deux sélectionnait toujours la même
  // (la première trouvée). C'est la position parmi les homonymes, dans l'ordre stable de `bestiaire`
  // (indépendant du tri/recherche de la liste), qui distingue les deux.
  const [selectedOccurrence, setSelectedOccurrence] = useState(0)
  const [afficherMasquees, setAfficherMasquees] = useState(false)
  // Sauvegarde à la fois le bestiaire ET la bibliothèque de capacités (voir CreatureDetail, bouton
  // Bibliothèque) : les deux vivent dans Documents/TdA en dev et ne rejoignent src/data/ (la base
  // livrée à tout le monde) que via ce bouton — la bibliothèque est intimement liée au bestiaire
  // (capacités des créatures), pas la peine d'un bouton séparé.
  const [confirmSauvegarderBundle, setConfirmSauvegarderBundle] = useState(false)
  // Générateur de PNJ (voir CATEGORIES_PNJ) — un aperçu en direct des stats/capacités selon
  // catégorie+variante+NC choisis, ajouté au bestiaire tel quel en cliquant Ajouter (devient ensuite une
  // fiche de bestiaire normale, éditable/modifiable comme les autres).
  const [modaleGenererOuverte, setModaleGenererOuverte] = useState(false)
  const [pnjNom, setPnjNom] = useState('')
  const [pnjCategorie, setPnjCategorie] = useState<CategoriePNJId>('combattant')
  const [pnjVariante, setPnjVariante] = useState<string>(VARIANTES_COMBATTANT[0].id)
  const [pnjNC, setPnjNC] = useState(1)
  const [tri, setTri] = useState<{ champ: 'nom' | 'nc'; sens: 'asc' | 'desc' }>({ champ: 'nom', sens: 'asc' })
  const toggleTri = (champ: 'nom' | 'nc') => {
    setTri(prev => prev.champ === champ ? { champ, sens: prev.sens === 'asc' ? 'desc' : 'asc' } : { champ, sens: 'asc' })
  }

  // Sélection forcée depuis une note liée (voir NotesTab « → Aller à la créature ») : appliquée
  // pendant le rendu plutôt que dans un effet (pattern « ajuster l'état pendant le rendu » recommandé
  // par React pour réagir à un changement de prop), pour ne s'appliquer qu'au changement de nom
  // demandé — pas à chaque re-render, sinon impossible de changer manuellement de créature ensuite
  // sans revenir par une note.
  const [dernierForcerNom, setDernierForcerNom] = useState<string | null | undefined>(undefined)
  if (forcerNom !== dernierForcerNom) {
    setDernierForcerNom(forcerNom)
    if (forcerNom && bestiaire.some(c => c.nom === forcerNom)) { setSelectedNom(forcerNom); setSelectedOccurrence(0) }
  }

  // Identité (nom, NC) : le bestiaire livré comporte volontairement plusieurs fiches de même nom à des
  // NC différents (même base de PNJ déclinée à chaque niveau, ex. « Orc (guerrier) » de NC 0,5 à 20).
  // Le nom seul ne distingue donc rien ; voir cleCreature dans bestiairePerso.ts.
  const clesPerso = useMemo(() => new Set(bestiairePerso.map(cleCreature)), [bestiairePerso])
  const clesLivre = useMemo(() => new Set(BESTIAIRE_LIVRE.map(cleCreature)), [])
  const masquees = useMemo(() => new Set(hiddenBestiaire), [hiddenBestiaire])

  // Les créatures livrées masquées ne sont pas dans `bestiaire` : on les rajoute en fin de liste
  // (le tri les replacera) quand l'utilisateur demande à les revoir, pour pouvoir les restaurer.
  const listeComplete = useMemo(() => {
    if (!afficherMasquees) return bestiaire
    const visibles = new Set(bestiaire.map(cleCreature))
    return [...bestiaire, ...BESTIAIRE_LIVRE.filter(c => !visibles.has(cleCreature(c)))]
  }, [bestiaire, afficherMasquees])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const liste = listeComplete.filter(c => !q || c.nom.toLowerCase().includes(q))
    const signe = tri.sens === 'asc' ? 1 : -1
    liste.sort((a, b) => tri.champ === 'nc' ? (a.nc - b.nc) * signe : a.nom.localeCompare(b.nom) * signe)
    return liste
  }, [search, listeComplete, tri])

  const homonymesSelection = useMemo(
    () => selectedNom !== null ? listeComplete.filter(c => c.nom === selectedNom) : [],
    [listeComplete, selectedNom],
  )
  const selected = homonymesSelection[selectedOccurrence] ?? homonymesSelection[0] ?? null
  const selectionLivree = selected !== null && !clesPerso.has(cleCreature(selected))
  // En dev, l'application tourne chez l'auteur du jeu : c'est là qu'il ÉCRIT le contenu livré. Lui
  // doit donc pouvoir corriger une fiche livrée sur place — le passage obligé par un clone renommé
  // n'a de sens que pour l'utilisateur final, qui ne peut pas publier. Même condition que le bouton
  // « Sauvegarder dans le projet », qui est l'autre moitié de ce circuit.
  const modeAuteur = import.meta.env.DEV
  const selectionVerrouillee = selectionLivree && !modeAuteur

  // Deux créatures de même (nom, NC) seraient indiscernables l'une de l'autre — mais le même nom à
  // des NC différents est un usage normal (voir plus haut), donc on ne renomme QUE sur une collision
  // exacte des deux, pas sur le nom seul.
  const cleLibre = (nom: string, nc: number) => {
    const pris = new Set(listeComplete.map(cleCreature))
    let n = nom
    for (let i = 2; pris.has(cleCreature({ nom: n, nc })); i++) n = `${nom} ${i}`
    return n
  }

  const addCreature = () => {
    const nom = cleLibre(t('gmMode.creatureDetail.nouvelleCreature'), 1)
    setBestiairePerso(prev => [...prev, { nom, nc: 1, livres: [] } as BestiaireEntry])
    setSelectedNom(nom)
    setSelectedOccurrence(0)
  }

  // Recopie une créature livrée pour pouvoir la modifier : le livré reste intact et continue de
  // recevoir les mises à jour de l'application, la copie appartient à l'utilisateur. Le NC de la
  // copie reste celui de l'original (seul le nom change, pour ne pas entrer en collision avec lui) ;
  // le modifier ensuite pour en faire une variante à un autre NC est un geste normal et volontaire.
  const clonerSelected = () => {
    if (!selected) return
    const nom = cleLibre(`${selected.nom} (copie)`, selected.nc)
    setBestiairePerso(prev => [...prev, { ...JSON.parse(JSON.stringify(selected)), nom }])
    setSelectedNom(nom)
    setSelectedOccurrence(0)
  }

  const restaurerSelected = () => {
    if (!selected) return
    const cle = cleCreature(selected)
    setHiddenBestiaire(prev => prev.filter(c => c !== cle))
  }

  // Import de créatures partagées : le fichier produit par « Exporter » contient l'illustration en
  // clair (voir CreatureDetail), on la range dans images/ et l'entrée ne garde qu'une clé — même
  // traitement que pour les créatures créées sur place.
  const fichierImportRef = useRef<HTMLInputElement>(null)
  const [messageImport, setMessageImport] = useState<string | null>(null)

  const importerCreatures = async (fichiers: FileList) => {
    const ajoutees: BestiaireEntry[] = []
    const rejets: string[] = []
    for (const fichier of Array.from(fichiers)) {
      try {
        const brut = JSON.parse(await fichier.text())
        // Tolère un fichier contenant une créature seule ou une liste.
        const entrees: unknown[] = Array.isArray(brut) ? brut : [brut]
        for (const entree of entrees) {
          // Un fichier reconnu comme un autre type d'export (personnage, rencontre, ...) est signalé
          // précisément plutôt que d'être accepté silencieusement comme une créature difforme.
          const { type, contenu } = desenvelopper(entree)
          if (type && type !== 'creature') {
            rejets.push(messageMauvaisType(t, 'creature', type))
            continue
          }
          const e = contenu as BestiaireEntry
          if (!e || typeof e.nom !== 'string') continue
          const image = typeof e.image === 'string' && e.image.startsWith('data:')
            ? await importerImage('img', e.image, `${sluggifierNom(e.nom)}_nc${e.nc}`)
            : e.image
          ajoutees.push({ ...e, ...(image ? { image } : {}) })
        }
      } catch {
        // Fichier illisible : on l'ignore et on le signale par le décompte final.
      }
    }
    if (ajoutees.length > 0) {
      // Une créature importée qui porte le nom d'une créature livrée la remplace (l'utilisateur
      // partage sa version) ; c'est la règle générale de fusion, voir GameDataContext.
      setBestiairePerso(prev => [...prev, ...ajoutees])
      setSelectedNom(ajoutees[0].nom)
      setSelectedOccurrence(0)
    }
    const message = [
      ajoutees.length > 0 || rejets.length === 0 ? t('gmMode.creatureDetail.importResultat', { count: ajoutees.length }) : null,
      ...rejets,
    ].filter(Boolean).join(' ')
    setMessageImport(message)
    setTimeout(() => setMessageImport(null), 5000)
  }

  // Import en masse d'images depuis un dossier — chaque joueur fournit les siennes (le bestiaire livré
  // n'en a pas, pour des raisons de taille ET de licence). Convention : img_<slug-du-nom>.ext (ex.
  // img_orc_guerrier.png), éventuellement img_<slug>_nc<NC>.ext pour ne viser qu'un NC précis parmi des
  // homonymes — sans suffixe, l'image s'applique à toutes leurs variantes, gratuit grâce à la
  // déduplication par empreinte de importerImage (voir imageStore.ts).
  const dossierImagesRef = useRef<HTMLInputElement>(null)

  const lireFichierEnDataUrl = (fichier: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const lecteur = new FileReader()
      lecteur.onload = () => resolve(lecteur.result as string)
      lecteur.onerror = () => reject(lecteur.error)
      lecteur.readAsDataURL(fichier)
    })

  // Même routage que updateSelected (livrée → calque d'illustrations, perso → surcharge), mais pour une
  // créature arbitraire plutôt que celle actuellement sélectionnée dans l'éditeur.
  const appliquerImageCreature = (creature: BestiaireEntry, image: string) => {
    const cle = cleCreature(creature)
    if (clesPerso.has(cle)) {
      setBestiairePerso(prev => prev.map(c => cleCreature(c) === cle ? { ...c, image } : c))
    } else {
      setBestiaireIllustrations(prev => ({ ...prev, [cle]: { ...prev[cle], image } }))
    }
  }

  const importerImagesDossier = async (fichiers: FileList) => {
    const parSlug = new Map<string, BestiaireEntry[]>()
    for (const c of bestiaire) {
      const slug = sluggifierNom(c.nom)
      parSlug.set(slug, [...(parSlug.get(slug) ?? []), c])
    }
    let importees = 0
    const nonReconnus: string[] = []
    for (const fichier of Array.from(fichiers)) {
      const nomFichier = fichier.name.replace(/\.[^.]+$/, '')
      if (!nomFichier.toLowerCase().startsWith('img_')) continue
      const reste = nomFichier.slice(4)
      const matchNC = reste.match(/^(.+)_nc([\d.]+)$/i)
      const slug = sluggifierNom(matchNC ? matchNC[1] : reste)
      const ncCible = matchNC ? Number(matchNC[2]) : null
      let cibles = parSlug.get(slug) ?? []
      if (ncCible !== null) cibles = cibles.filter(c => c.nc === ncCible)
      if (cibles.length === 0) { nonReconnus.push(fichier.name); continue }
      try {
        const dataUrl = await lireFichierEnDataUrl(fichier)
        const cleNommee = ncCible !== null ? `${slug}_nc${ncCible}` : slug
        const cle = await importerImage('img', dataUrl, cleNommee)
        for (const cible of cibles) appliquerImageCreature(cible, cle)
        importees++
      } catch {
        nonReconnus.push(fichier.name)
      }
    }
    const message = [
      t('gmMode.bestiaireImagesResultat', { count: importees }),
      ...(nonReconnus.length > 0 ? [t('gmMode.bestiaireImagesNonReconnues', { liste: nonReconnus.join(', ') })] : []),
    ].join(' ')
    setMessageImport(message)
    setTimeout(() => setMessageImport(null), 8000)
  }

  const updateSelected = (patch: Partial<BestiaireEntry>) => {
    if (!selected) return
    if (!selectionLivree) {
      setBestiairePerso(prev => prev.map(c => c.nom === selected.nom ? { ...c, ...patch } : c))
      if (patch.nom !== undefined && patch.nom !== selected.nom) { setSelectedNom(patch.nom); setSelectedOccurrence(0) }
      return
    }
    // Créature livrée. Une retouche qui ne porte QUE sur l'illustration part dans le calque à part —
    // en mode auteur comme pour l'utilisateur final : chacun ses images, et poser la sienne ne doit
    // pas compter comme une modification de la fiche.
    const champsContenu = Object.keys(patch).filter(k => !(CHAMPS_ILLUSTRATION as readonly string[]).includes(k))
    if (champsContenu.length === 0) {
      const illu = illustrationDe(patch)
      if (Object.keys(illu).length === 0) return
      const cle = cleCreature(selected)
      setBestiaireIllustrations(prev => ({ ...prev, [cle]: { ...prev[cle], ...illu } }))
      return
    }
    if (modeAuteur) {
      // Première vraie retouche d'une fiche livrée par l'auteur : on la recopie dans les surcharges
      // SOUS LE MÊME NOM (pas un clone renommé — il corrige la fiche, il n'en crée pas une deuxième).
      // Elle porte alors la pastille MODIFIÉE ; « Sauvegarder dans le projet » la replie dans le livré
      // et vide les surcharges. Les retouches suivantes passent par la branche du dessus, la créature
      // n'étant alors plus « livrée ».
      setBestiairePerso(prev => [...prev, { ...selected, ...patch }])
      if (patch.nom !== undefined && patch.nom !== selected.nom) {
        // Renommer change l'identité (nom, NC) : la surcharge ci-dessus atterrit sous une clé
        // DIFFÉRENTE de l'originale livrée, qui resterait donc visible à côté sans ce masquage —
        // même correctif que renameVoie pour les voies.
        const cleAncienne = cleCreature(selected)
        setHiddenBestiaire(prev => prev.includes(cleAncienne) ? prev : [...prev, cleAncienne])
        setSelectedNom(patch.nom)
        setSelectedOccurrence(0)
      }
      return
    }
    // Utilisateur final : le reste est ignoré ici plutôt que d'être seulement grisé dans l'UI — c'est
    // le garde-fou qui garantit qu'aucun widget ne passe au travers.
  }

  const deleteSelected = () => {
    if (!selected) return
    if (!selectionLivree) {
      const cle = cleCreature(selected)
      setBestiairePerso(prev => prev.filter(c => cleCreature(c) !== cle))
      // Supprimer une surcharge perso redonne la créature livrée d'origine, pas rien du tout — sauf
      // si le NC a été changé en cours d'édition : la fiche est alors une variante à part entière,
      // sans original livré à retrouver sous cette clé.
      setSelectedNom(clesLivre.has(cle) ? selected.nom : null)
      setSelectedOccurrence(0)
      return
    }
    // Le livré n'est jamais supprimé, seulement masqué : il est en lecture seule, et la remettre
    // doit rester possible (bouton « afficher les masquées »).
    const cle = cleCreature(selected)
    setHiddenBestiaire(prev => prev.includes(cle) ? prev : [...prev, cle])
    setSelectedNom(null)
  }

  const pnjApercu = CATEGORIES_PNJ[pnjCategorie].generer(pnjVariante, pnjNC, pnjNom.trim() || t('gmMode.creatureDetail.nouvelleCreature'))

  const ajouterPNJGenere = () => {
    // Sur (nom, NC) et non sur le nom seul : construire une série de PNJ partageant un nom de base à
    // des NC croissants (le cas d'usage qui a motivé cette identité) ne doit PAS renommer chaque
    // nouvelle variante — seule une collision exacte (même nom ET même NC) force un suffixe.
    const nom = cleLibre(pnjApercu.nom, pnjApercu.nc)
    setBestiairePerso(prev => [...prev, { ...pnjApercu, nom }])
    setSelectedNom(nom)
    setSelectedOccurrence(0)
    setModaleGenererOuverte(false)
    setPnjNom('')
  }

  return (
    <>
    <div style={{ display: 'flex', gap: mobile ? 0 : 16, height: '100%', position: 'relative' }}>
      {/* Liste — colonne gauche en desktop, tiroir flottant (bas d'écran) ouvert à la demande en mobile.
          Le contenu (recherche, boutons, tableau) est identique dans les deux cas, seule l'enveloppe
          change de forme/position. */}
      {mobile && mobileListeOuverte && (
        <div onClick={() => setMobileListeOuverte(false)} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.55)' }} />
      )}
      {(!mobile || mobileListeOuverte) && (
      <div style={mobile ? {
        display: 'flex', flexDirection: 'column', gap: 12,
        position: 'fixed', left: 0, right: 0, bottom: 0, maxHeight: '80vh', zIndex: 201,
        background: 'rgba(18,14,9,0.99)', borderTop: '1px solid rgba(201,168,76,0.3)',
        borderRadius: '12px 12px 0 0', boxShadow: '0 -4px 30px rgba(0,0,0,0.8)',
        padding: 12, paddingBottom: 'calc(12px + env(safe-area-inset-bottom))', boxSizing: 'border-box',
      } : { display: 'flex', flexDirection: 'column', gap: 12, width: 520, flexShrink: 0, minHeight: 0 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('gmMode.bestiaireRecherche')}
          style={{
            padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(201,168,76,0.4)',
            background: 'rgba(255,255,255,0.03)', color: PARCHMENT, fontSize: 14,
          }}
        />
        {/* Boutons sous le champ de recherche, alignés à gauche ; flexWrap car ils dépassaient sur la
            colonne de droite. Le compteur est descendu juste au-dessus de la liste (voir plus bas). */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', minWidth: 0 }}>
            {import.meta.env.DEV && (
              <button
                onClick={() => setConfirmSauvegarderBundle(true)}
                style={{
                  background: 'transparent', border: '1px solid rgba(100,200,120,0.5)', borderRadius: 4,
                  color: 'rgba(100,200,120,0.8)', cursor: 'pointer', fontSize: 14, padding: '3px 8px', whiteSpace: 'nowrap',
                }}
              >
                {t('gmMode.bestiaireSauvegarderBundle')}
              </button>
            )}
            <button onClick={addCreature} style={{
              background: 'transparent', border: '1px dashed rgba(201,168,76,0.5)', borderRadius: 4,
              color: GOLD, cursor: 'pointer', fontSize: 14, padding: '3px 8px', whiteSpace: 'nowrap',
            }}>
              + {t('gmMode.creatureDetail.nouvelleCreature')}
            </button>
            <button onClick={() => fichierImportRef.current?.click()} style={{
              background: 'transparent', border: '1px dashed rgba(201,168,76,0.5)', borderRadius: 4,
              color: GOLD, cursor: 'pointer', fontSize: 14, padding: '3px 8px', whiteSpace: 'nowrap',
            }}>
              {t('gmMode.creatureDetail.importer')}
            </button>
            <input ref={fichierImportRef} type="file" accept=".json" multiple style={{ display: 'none' }}
              onChange={e => { if (e.target.files?.length) importerCreatures(e.target.files); e.target.value = '' }} />
            <button onClick={() => dossierImagesRef.current?.click()} style={{
              background: 'transparent', border: '1px dashed rgba(201,168,76,0.5)', borderRadius: 4,
              color: GOLD, cursor: 'pointer', fontSize: 14, padding: '3px 8px', whiteSpace: 'nowrap',
            }}>
              🖼 {t('gmMode.bestiaireImporterImages')}
            </button>
            <input ref={dossierImagesRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
              {...({ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
              onChange={e => { if (e.target.files?.length) importerImagesDossier(e.target.files); e.target.value = '' }} />
            {messageImport && (
              <span style={{ fontSize: 12, color: 'rgba(130,220,140,0.95)', whiteSpace: 'nowrap' }}>{messageImport}</span>
            )}
            <button onClick={() => setModaleGenererOuverte(true)} style={{
              background: 'transparent', border: '1px dashed rgba(201,168,76,0.5)', borderRadius: 4,
              color: GOLD, cursor: 'pointer', fontSize: 14, padding: '3px 8px', whiteSpace: 'nowrap',
            }}>
              🛠 {t('gmMode.genererPNJ')}
            </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, opacity: 0.5 }}>
            {t('gmMode.bestiaireCompte', { count: filtered.length })}
          </span>
          {hiddenBestiaire.length > 0 && (
            <button onClick={() => setAfficherMasquees(v => !v)} style={{
              background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 13, textDecoration: 'underline',
              color: afficherMasquees ? GOLD : 'rgba(245,236,215,0.45)',
            }}>
              {afficherMasquees
                ? t('gmMode.bestiaireCacherMasquees')
                : t('gmMode.bestiaireVoirMasquees', { count: hiddenBestiaire.length })}
            </button>
          )}
        </div>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', border: `1px solid ${SECTION_BORDER}`, borderRadius: 6 }}>
          {/* En-tête de colonnes triable — même marge droite que les lignes ci-dessous (voir plus bas)
              pour rester aligné avec le score de NC malgré la scrollbar. */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '6px 18px 6px 12px', flexShrink: 0,
            borderBottom: `1px solid ${SECTION_BORDER}`,
          }}>
            <button onClick={() => toggleTri('nom')} style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none',
              cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.04em', padding: 0, textAlign: 'left', color: tri.champ === 'nom' ? GOLD : 'rgba(245,236,215,0.5)',
            }}>
              {t('gmMode.bestiaireTriNom')} {tri.champ === 'nom' && (tri.sens === 'asc' ? '▲' : '▼')}
            </button>
            <button onClick={() => toggleTri('nc')} style={{
              minWidth: 24, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4,
              background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12,
              fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', padding: 0,
              color: tri.champ === 'nc' ? GOLD : 'rgba(245,236,215,0.5)',
            }}>
              {t('gmMode.creatureDetail.nc')} {tri.champ === 'nc' && (tri.sens === 'asc' ? '▲' : '▼')}
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {filtered.map((c, i) => {
              // Comparaison par référence, pas par nom : le bestiaire livré contient un doublon de
              // nom (« Orc (guerrier) », deux fiches distinctes) — comparer par nom sélectionnerait
              // les deux lignes à la fois.
              const isSelected = c === selected
              const cleC = cleCreature(c)
              const estPerso = clesPerso.has(cleC)
              const estMasquee = masquees.has(cleC)
              return (
                // Clé sur la position, pas sur le nom, pour la même raison : une clé React non unique
                // fait perdre à React le fil de qui est qui au tri/filtrage — deux lignes s'affichaient
                // l'une à la place de l'autre.
                <div key={i} onClick={() => {
                  setSelectedNom(c.nom)
                  // Laquelle des fiches de même nom a été cliquée, dans l'ordre stable de `bestiaire`
                  // (indépendant du tri/recherche affichés) : c'est ce qui distingue les deux Orcs.
                  setSelectedOccurrence(listeComplete.filter(x => x.nom === c.nom).indexOf(c))
                  if (mobile) setMobileListeOuverte(false)
                }} style={{
                  // Marge droite un peu plus large que les autres côtés : la scrollbar (overlay, s'épaissit
                  // au survol) sinon passe par-dessus le score de NC, collé trop près du bord.
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 18px 8px 12px', cursor: 'pointer',
                  background: isSelected ? 'rgba(201,168,76,0.12)' : 'transparent',
                  borderLeft: isSelected ? `2px solid ${GOLD}` : '2px solid transparent',
                  borderBottom: i < filtered.length - 1 ? `1px solid ${SECTION_BORDER}` : 'none',
                }}>
                  <span style={{
                    flex: 1, fontSize: 16, color: isSelected ? GOLD : PARCHMENT,
                    opacity: estMasquee ? 0.4 : 1, textDecoration: estMasquee ? 'line-through' : 'none',
                  }}>{c.nom || t('gmMode.creatureDetail.nouvelleCreature')}</span>
                  {/* Distingue d'un coup d'œil ce qui appartient à l'utilisateur (modifiable) de ce
                      qui est livré avec l'application (lecture seule, mis à jour à chaque version). */}
                  {/* En mode auteur, une surcharge portant le nom d'une créature livrée n'est pas un
                      ajout mais une correction en attente de « Sauvegarder dans le projet » — le dire
                      évite de prendre ses propres retouches pour des créatures ajoutées. */}
                  {estPerso && (
                    <span title={modeAuteur && clesLivre.has(cleC) ? t('gmMode.bestiaireModifieeTitre') : t('gmMode.bestiairePersoTitre')} style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', padding: '1px 5px',
                      borderRadius: 3, border: '1px solid rgba(120,200,140,0.45)',
                      color: 'rgba(140,215,160,0.9)', flexShrink: 0,
                    }}>{modeAuteur && clesLivre.has(cleC) ? t('gmMode.bestiaireModifiee') : t('gmMode.bestiairePerso')}</span>
                  )}
                  <span style={{ fontSize: 14, color: GOLD, fontWeight: 700, minWidth: 24, textAlign: 'right' }}>{c.nc}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      )}

      {/* Détail — colonne droite en desktop, pleine largeur en mobile (le menu de liste ci-dessus
          n'occupe alors plus d'espace en permanence, voir le bouton flottant pour l'ouvrir). */}
      <div style={{ flex: mobile ? undefined : 1, width: mobile ? '100%' : undefined, minWidth: 0, border: `1px solid ${SECTION_BORDER}`, borderRadius: 6, padding: mobile ? 12 : 20, overflowY: 'auto', position: 'relative' }}>
        {mobile && (
          <button onClick={() => setMobileListeOuverte(true)} style={{
            position: 'fixed', bottom: 16, left: 16, zIndex: 150,
            display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 20,
            background: 'rgba(15,12,8,0.95)', border: `1px solid ${GOLD}`, color: GOLD,
            cursor: 'pointer', fontSize: 14, fontWeight: 700, boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
          }}>
            🐾 {t('gmMode.bestiaireCompte', { count: filtered.length })}
          </button>
        )}
        {selected ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Bandeau des créatures livrées. Deux cas seulement : la fiche est verrouillée (on dit
                pourquoi, sinon elle passe pour une panne), ou elle est masquée (on offre de la
                réafficher). En mode auteur sur une fiche visible, il n'y a rien à annoncer. */}
            {selectionLivree && (selectionVerrouillee || masquees.has(cleCreature(selected))) && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                border: `1px solid ${SECTION_BORDER}`, borderRadius: 6, padding: '10px 14px',
                background: 'rgba(201,168,76,0.05)',
              }}>
                <span style={{ flex: 1, minWidth: 200, fontSize: 13, lineHeight: 1.45, color: 'rgba(245,236,215,0.7)' }}>
                  {masquees.has(cleCreature(selected)) ? t('gmMode.bestiaireLivreeMasquee') : t('gmMode.bestiaireLivreeInfo')}
                </span>
                {/* Copier n'a de sens que sur une fiche visible et verrouillée : sur une fiche
                    masquée, la seule action attendue est de la réafficher. */}
                {selectionVerrouillee && !masquees.has(cleCreature(selected)) && (
                  <button onClick={clonerSelected} style={{
                    background: 'transparent', border: '1px dashed rgba(201,168,76,0.5)', borderRadius: 4,
                    color: GOLD, cursor: 'pointer', fontSize: 14, padding: '4px 10px', whiteSpace: 'nowrap',
                    fontFamily: 'inherit',
                  }}>
                    ⎘ {t('gmMode.bestiaireClonerPourModifier')}
                  </button>
                )}
                {masquees.has(cleCreature(selected)) && (
                  <button onClick={restaurerSelected} style={{
                    background: 'transparent', border: '1px solid rgba(120,200,140,0.5)', borderRadius: 4,
                    color: 'rgba(140,215,160,0.9)', cursor: 'pointer', fontSize: 14, padding: '4px 10px',
                    whiteSpace: 'nowrap', fontFamily: 'inherit',
                  }}>
                    {t('gmMode.bestiaireRestaurer')}
                  </button>
                )}
              </div>
            )}
            <CreatureDetail
              creature={selected}
              onChange={updateSelected}
              onDelete={deleteSelected}
              lectureSeule={selectionVerrouillee}
              masquageAuLieuDeSuppression={selectionLivree}
              suppressionDesactivee={selectionLivree && masquees.has(cleCreature(selected))}
            />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, height: '100%', minHeight: 0 }}>
            <div style={{ flex: '1 1 0', minHeight: 0, minWidth: 0, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img src={bestiaireIllustration} alt="" style={{ maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto', objectFit: 'contain', opacity: 0.08, userSelect: 'none', pointerEvents: 'none' }} />
            </div>
            <span style={{ flexShrink: 0, opacity: 0.4, fontSize: 14 }}>{t('gmMode.creatureDetail.aucuneSelection')}</span>
          </div>
        )}
      </div>
    </div>
    {confirmSauvegarderBundle && (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          background: 'rgba(22,17,11,0.99)', border: '1px solid rgba(201,168,76,0.5)',
          borderRadius: 8, padding: '24px 28px', maxWidth: 420, width: '90vw',
          boxShadow: '0 8px 40px rgba(0,0,0,0.9)',
          display: 'flex', flexDirection: 'column', gap: 20,
        }}>
          <div style={{ fontSize: 15, color: '#f5ecd7', lineHeight: 1.5 }}>{t('gmMode.bestiaireConfirmSauvegarderBundle')}</div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              onClick={() => setConfirmSauvegarderBundle(false)}
              style={{
                padding: '6px 18px', borderRadius: 5, cursor: 'pointer', fontSize: 14,
                border: '1px solid rgba(245,236,215,0.2)', background: 'transparent',
                color: 'rgba(245,236,215,0.55)', fontFamily: 'inherit',
              }}
            >{t('gmMode.annuler')}</button>
            <button
              onClick={async () => {
                setConfirmSauvegarderBundle(false)
                await Promise.all([
                  // Le bestiaire livré ne transporte pas d'illustrations : elles pesaient 92 % du
                  // fichier (2,4 Mo pour 6 images distinctes) et chacun utilise les siennes. Les
                  // images restent bien sûr dans les données locales de l'utilisateur.
                  saveDataFileToBundle('bestiaire.json', bestiaire.map(c => {
                    const reste: Record<string, unknown> = { ...c }
                    for (const champ of ['image', 'imageScale', 'imageTx', 'imageTy', 'imageFit', 'imageLocked']) delete reste[champ]
                    return reste
                  })),
                  saveDataFileToBundle('capacites-bibliotheque.json', capacitesBibliotheque),
                ])
                // Ce qui vient d'être publié EST le livré : sans cette remise à zéro, chaque créature
                // (et chaque capacité) perso resterait en surcharge d'elle-même et ne recevrait plus
                // jamais de mise à jour.
                await Promise.all([
                  publierBestiaireLivre(bestiaire, bestiaireIllustrations),
                  publierCapacitesBibliothequeLivre(),
                ])
                window.location.reload()
              }}
              style={{
                padding: '6px 18px', borderRadius: 5, cursor: 'pointer', fontSize: 14, fontWeight: 600,
                border: '1px solid rgba(100,200,120,0.6)', background: 'rgba(100,200,120,0.12)',
                color: 'rgba(120,220,140,0.95)', fontFamily: 'inherit',
              }}
            >{t('gmMode.sauvegarder')}</button>
          </div>
        </div>
      </div>
    )}
    {modaleGenererOuverte && (
      <div
        onClick={() => setModaleGenererOuverte(false)}
        style={{
          position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.65)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            background: 'rgba(22,17,11,0.99)', border: `1px solid ${SECTION_BORDER}`, borderRadius: 8,
            padding: '24px 28px', maxWidth: 560, width: '90vw', maxHeight: '85vh', overflowY: 'auto',
            boxShadow: '0 8px 40px rgba(0,0,0,0.9)', display: 'flex', flexDirection: 'column', gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: GOLD, fontFamily: "'Cinzel', serif" }}>
              {t('gmMode.genererPNJ')}
            </span>
            <button
              onClick={() => setModaleGenererOuverte(false)}
              style={{ background: 'transparent', border: 'none', color: 'rgba(245,236,215,0.6)', cursor: 'pointer', fontSize: 20, padding: 0, lineHeight: 1 }}
            >
              ✕
            </button>
          </div>

          <div style={{ fontSize: 15, opacity: 0.5 }}>{t('gmMode.genererPNJIntro')}</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>
                {t('gmMode.genererPNJNom')}
              </label>
              <input
                value={pnjNom} onChange={e => setPnjNom(e.target.value)}
                placeholder={t('gmMode.creatureDetail.nouvelleCreature')}
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: 4,
                  border: '1px solid rgba(201,168,76,0.3)', background: 'rgba(255,255,255,0.03)', color: PARCHMENT, fontSize: 16,
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>
                {t('gmMode.genererPNJCategorie')}
              </label>
              <select
                value={pnjCategorie}
                onChange={e => {
                  const categorie = e.target.value as CategoriePNJId
                  setPnjCategorie(categorie)
                  setPnjVariante(CATEGORIES_PNJ[categorie].variantes[0].id)
                }}
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: 4,
                  border: '1px solid rgba(201,168,76,0.3)', background: 'var(--tdr-dark)', color: PARCHMENT, fontSize: 16,
                }}
              >
                {(Object.keys(CATEGORIES_PNJ) as CategoriePNJId[]).map(id => (
                  <option key={id} value={id} style={{ background: 'var(--tdr-dark)', color: PARCHMENT }}>{CATEGORIES_PNJ[id].nom}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>
                {t('gmMode.genererPNJVariante')}
              </label>
              <select
                value={pnjVariante} onChange={e => setPnjVariante(e.target.value)}
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: 4,
                  border: '1px solid rgba(201,168,76,0.3)', background: 'var(--tdr-dark)', color: PARCHMENT, fontSize: 16,
                }}
              >
                {CATEGORIES_PNJ[pnjCategorie].variantes.map(v => <option key={v.id} value={v.id} style={{ background: 'var(--tdr-dark)', color: PARCHMENT }}>{v.nom}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>
                {t('gmMode.creatureDetail.nc')}
              </label>
              <select
                value={pnjNC} onChange={e => setPnjNC(parseFloat(e.target.value))}
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: 4,
                  border: '1px solid rgba(201,168,76,0.3)', background: 'var(--tdr-dark)', color: PARCHMENT, fontSize: 16,
                }}
              >
                {NC_DISPONIBLES.map(nc => <option key={nc} value={nc} style={{ background: 'var(--tdr-dark)', color: PARCHMENT }}>{nc}</option>)}
              </select>
            </div>
          </div>

          {/* Aperçu en direct — recalculé à chaque changement de variante/NC (pnjApercu), rien n'est
              encore ajouté au bestiaire tant que le MJ n'a pas cliqué Ajouter ci-dessous. Sections
              nommées (caractéristiques / statistiques de combat / attaques / capacités) séparées par un
              filet pointillé, plutôt qu'un seul bloc continu — mêmes libellés que la fiche de bestiaire
              (CreatureDetail) pour rester cohérent. */}
          <div style={{ border: `1px solid ${SECTION_BORDER}`, borderRadius: 6, padding: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 14, opacity: 0.6, fontStyle: 'italic' }}>{pnjApercu.description}</div>

            <div>
              <div style={pnjSectionTitreStyle}>{t('gmMode.creatureDetail.caracteristiques')}</div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 16 }}>
                <span>FOR {pnjApercu.caracteristiques?.FOR}</span>
                <span>DEX {pnjApercu.caracteristiques?.DEX}</span>
                <span>CON {pnjApercu.caracteristiques?.CON}</span>
                <span>INT {pnjApercu.caracteristiques?.INT}</span>
                <span>SAG {pnjApercu.caracteristiques?.SAG}</span>
                <span>CHA {pnjApercu.caracteristiques?.CHA}</span>
              </div>
            </div>

            <div style={{ borderTop: `1px dashed ${SECTION_BORDER}` }} />

            <div>
              <div style={pnjSectionTitreStyle}>{t('gmMode.creatureDetail.statsCombat')}</div>
              <div style={{ display: 'flex', gap: 16, fontSize: 16, fontWeight: 700, color: GOLD }}>
                <span>DEF {pnjApercu.def}</span>
                <span>PV {pnjApercu.pv}</span>
                <span>Init. {pnjApercu.init}</span>
                {pnjApercu.rd !== undefined && <span>RD {pnjApercu.rd}</span>}
              </div>
            </div>

            <div style={{ borderTop: `1px dashed ${SECTION_BORDER}` }} />

            <div>
              <div style={pnjSectionTitreStyle}>{t('gmMode.creatureDetail.attaques')}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 16 }}>
                {pnjApercu.attaques?.map((a, i) => (
                  <span key={i}>{a.nom} {a.bonus}, DM {a.dm}</span>
                ))}
              </div>
            </div>

            <div style={{ borderTop: `1px dashed ${SECTION_BORDER}` }} />

            <div>
              <div style={pnjSectionTitreStyle}>{t('gmMode.creatureDetail.capacites')}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {pnjApercu.capacites?.map((c, i) => (
                  <div key={i} style={{ fontSize: 15 }}>
                    <span style={{ color: GOLD, fontWeight: 700 }}>{c.nom}</span>
                    <span style={{ opacity: 0.7 }}> — {c.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              onClick={() => setModaleGenererOuverte(false)}
              style={{
                padding: '6px 18px', borderRadius: 5, cursor: 'pointer', fontSize: 16,
                border: '1px solid rgba(245,236,215,0.2)', background: 'transparent',
                color: 'rgba(245,236,215,0.55)', fontFamily: 'inherit',
              }}
            >{t('gmMode.annuler')}</button>
            <button
              onClick={ajouterPNJGenere}
              style={{
                padding: '6px 18px', borderRadius: 5, cursor: 'pointer', fontSize: 16, fontWeight: 600,
                border: '1px solid rgba(100,200,120,0.6)', background: 'rgba(100,200,120,0.12)',
                color: 'rgba(120,220,140,0.95)', fontFamily: 'inherit',
              }}
            >{t('gmMode.genererPNJAjouter')}</button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
