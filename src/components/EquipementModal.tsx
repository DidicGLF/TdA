import { useState, useRef, Fragment } from 'react'
import { useTranslation, Trans } from 'react-i18next'
import type { Character } from '../types/character'
import { useGameData } from '../context/GameDataContext'
import { useModalBackButton } from '../hooks/useModalBackButton'
import { useEquipementName } from '../hooks/useContentTranslation'
import { patchPossessionObjetMagique } from '../utils/objetsMagiquesPerso'

type EntreeArme   = { nom: string; dm: string; mod: string; prix: string; portee?: string; deuxMains?: boolean }
type EntreeArmure = { nom: string; def: number; prix: string }
type CatArme      = { categorie: string; entrees: EntreeArme[]; notes?: string }
type CatArmure    = { categorie: string; entrees: EntreeArmure[]; notes?: string }
type GroupeArme   = { groupe: string; categories: CatArme[] }

interface Props {
  // Optionnels : quand absents (ex. ouverture depuis la modale "Données du jeu", hors contexte personnage),
  // la modale s'ouvre en pur éditeur de catalogue — aucune section liée à l'équipement d'un personnage
  // (armes/armures déjà possédées, emplacements équipés) n'est affichée.
  character?: Character
  onChange?: (patch: Partial<Character>) => void
  onClose: () => void
}

const S = {
  gold: 'var(--tdr-gold)',
  parchment: 'var(--tdr-parchment)',
  border: 'rgba(201,168,76,0.25)',
  bg: 'rgba(15,12,8,0.92)',
  // Violet déjà utilisé dans ce fichier pour "Mode édition" — repris ici pour distinguer visuellement les
  // objets magiques (doré = armes/armures) des autres sections plutôt qu'inventer une nouvelle couleur.
  magic: 'rgba(180,130,255,0.9)',
}

const cell: React.CSSProperties = {
  padding: '5px 8px', fontSize: 15,
  borderBottom: '1px solid rgba(201,168,76,0.1)',
  color: 'var(--tdr-parchment)',
  verticalAlign: 'middle',
}

const headCell: React.CSSProperties = {
  ...cell,
  color: 'var(--tdr-gold)', fontWeight: 600,
  fontSize: 14, letterSpacing: '0.06em', textTransform: 'uppercase',
  borderBottom: '1px solid rgba(201,168,76,0.3)',
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(201,168,76,0.3)', borderRadius: 3,
  color: 'var(--tdr-parchment)', fontSize: 14,
  padding: '2px 5px', outline: 'none',
}

function exportJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

const ARMES_NOTES_FR   = "¹ Arme tenue à deux mains.\n² Critique sur 19 ou 20.\n³ Règles spéciales, voir ci-dessous.\n⁴ Score minimum en FOR requis : 12 pour l'arc long, 14 pour le composite.\n⁵ Nécessite une action limitée pour ajouter le Mod. de Carac. aux DM.\n⁶ Nécessite une action d'attaque pour être rechargée.\n⁷ Nécessite une action limitée pour être rechargée.\n* Nécessite une capacité pour être maîtrisée."
const ARMURES_NOTES_FR = "¹ Encombrantes, ces armures annulent le bonus de DEX à la DEF.\n² Fabriquée sur mesure, nécessite la capacité Armure lourde (voie du bastion) pour être portée."

// Niveau de magie total CONSEILLÉ par niveau de PJ (Livre du meneur p.183) — purement indicatif, pas un
// plafond dur (le livre le présente comme un repère pour le MJ, pas une règle bloquante). Index 0 =
// niveau de PJ 1.
const NIVEAU_MAGIE_CONSEILLE = [0, 0, 1, 2, 3, 4, 6, 8, 10, 12, 15, 18, 21, 24, 27, 30, 33, 36, 40, 45]

const isDistance = (groupe: string) => groupe.toLowerCase().includes('distance')

// Même ordre/regroupement que le reste de la modale (armes/armures : sections par catégorie avec table
// Nom/DM/+Mod/Prix) plutôt qu'une liste plate — voir gmMode.objetMagiqueDetail.categorie pour les libellés.
const OBJETS_MAGIQUES_CATEGORIES = ['traditionnel', 'focalisateur', 'legendaire'] as const

const stripExposants = (s: string) => s.replace(/[¹²³⁴⁵⁶⁷*]\s*/g, '').trim()

type DragSrc =
  | { type: 'groupe'; gi: number }
  | { type: 'cat'; gi: number; ci: number }

export default function EquipementModal({ character, onChange, onClose }: Props) {
  const { t } = useTranslation()
  const eqName = useEquipementName()
  const fmtPrix = (prix: string) => prix.replace(/\bpa\b/g, t('currency.pa'))
  // Sans personnage (ouverture depuis "Données du jeu"), la modale n'a aucune utilité hors édition du
  // catalogue : on démarre directement en mode édition et le bouton pour en sortir est masqué.
  const catalogueSeul = !character
  const [section,      setSection]      = useState<'armes' | 'armures' | 'objetsMagiques'>('armes')
  const [editMode,     setEditMode]     = useState(catalogueSeul)
  const [exported,     setExported]     = useState(false)
  const [activeKey,    setActiveKey]    = useState('0-0')
  const [dragOver,     setDragOver]     = useState<string | null>(null)
  // Même seuil que App.tsx (voir sa note) : 1200, pas 700, pour couvrir les tablettes en paysage.
  const isMobile = window.innerWidth < 1200
  const [mobileCatKey, setMobileCatKey] = useState('0-0')
  const [mobileView, setMobileView] = useState<'catalogue' | 'equipe'>('catalogue')
  // Sur petit écran, la colonne des types deviendrait illisible à côté de la liste des armes : on la
  // replie dans un menu flottant pour rendre tout l'écran à la liste.
  const [menuTypesOuvert, setMenuTypesOuvert] = useState(false)
  // Objets magiques : id de l'objet dont la liste d'enchantements est dépliée (un seul à la fois).
  const [expandedObjet, setExpandedObjet] = useState<string | null>(null)

  const { armes: armesCtx, setArmes: saveArmes, armures: armuresCtx, setArmures: saveArmures, objetsMagiques } = useGameData()
  const [groupes,      setGroupes]      = useState<GroupeArme[]> (() => JSON.parse(JSON.stringify(armesCtx.groupes)))
  const [armures,      setArmures]      = useState<CatArmure[]>  (() => JSON.parse(JSON.stringify(armuresCtx.categories)))
  const [armesNotes,   setArmesNotes]   = useState<string>(() => {
    const s = armesCtx.notes ?? ''
    return (s === '' || s === ARMES_NOTES_FR) ? t('equipement.armesNotesDef') : s
  })
  const [armuresNotes, setArmuresNotes] = useState<string>(() => {
    const s = armuresCtx.notes ?? ''
    return (s === '' || s === ARMURES_NOTES_FR) ? t('equipement.armuresNotesDef') : s
  })

  const sectionRefs = useRef<(HTMLDivElement | null)[]>([])
  const dragSrc     = useRef<DragSrc | null>(null)

  const scrollTo = (key: string, flatIdx: number) => {
    setActiveKey(key)
    sectionRefs.current[flatIdx]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  /* ── réorganisation ── */
  const reorderGroupes = (toGi: number) => {
    if (!dragSrc.current || dragSrc.current.type !== 'groupe') return
    const fromGi = dragSrc.current.gi
    if (fromGi === toGi) return
    setGroupes(prev => {
      const next = [...prev]
      const [item] = next.splice(fromGi, 1)
      next.splice(toGi, 0, item)
      return next
    })
    setExported(false)
  }

  const reorderCats = (toGi: number, toCi: number) => {
    if (!dragSrc.current || dragSrc.current.type !== 'cat') return
    const { gi: fromGi, ci: fromCi } = dragSrc.current
    if (fromGi === toGi && fromCi === toCi) return
    setGroupes(prev => {
      const next = prev.map(g => ({ ...g, categories: [...g.categories] }))
      const [item] = next[fromGi].categories.splice(fromCi, 1)
      next[toGi].categories.splice(toCi, 0, item)
      return next
    })
    setExported(false)
  }

  /* ── édition groupes ── */
  const renameGroupe = (gi: number, groupe: string) => {
    setGroupes(prev => prev.map((g, i) => i !== gi ? g : { ...g, groupe }))
    setExported(false)
  }
  const removeGroupe = (gi: number) => {
    setGroupes(prev => prev.filter((_, i) => i !== gi))
    setExported(false)
  }
  const addGroupe = () => {
    setGroupes(prev => [...prev, { groupe: t('equipement.nouveauGroupe'), categories: [] }])
    setExported(false)
  }

  /* ── édition catégories armes ── */
  const renameCatArme = (gi: number, ci: number, categorie: string) => {
    setGroupes(prev => prev.map((g, i) => i !== gi ? g : {
      ...g, categories: g.categories.map((c, j) => j !== ci ? c : { ...c, categorie }),
    }))
    setExported(false)
  }
  const removeCatArme = (gi: number, ci: number) => {
    setGroupes(prev => prev.map((g, i) => i !== gi ? g : {
      ...g, categories: g.categories.filter((_, j) => j !== ci),
    }))
    setExported(false)
  }
  const addCatArme = (gi: number) => {
    setGroupes(prev => prev.map((g, i) => i !== gi ? g : {
      ...g, categories: [...g.categories, { categorie: t('equipement.nouvelleCategorie'), entrees: [] }],
    }))
    setExported(false)
  }

  /* ── édition entrées armes ── */
  const updateArme = (gi: number, ci: number, ei: number, patch: Partial<EntreeArme>) => {
    setGroupes(prev => prev.map((g, i) => i !== gi ? g : {
      ...g, categories: g.categories.map((c, j) => j !== ci ? c : {
        ...c, entrees: c.entrees.map((e, k) => k !== ei ? e : { ...e, ...patch }),
      }),
    }))
    setExported(false)
  }
  const addArmeEntry = (gi: number, ci: number) => {
    const dist = isDistance(groupes[gi].groupe)
    const entry: EntreeArme = dist
      ? { nom: '', dm: '', mod: '', portee: '', prix: '' }
      : { nom: '', dm: '', mod: 'FOR', prix: '' }
    setGroupes(prev => prev.map((g, i) => i !== gi ? g : {
      ...g, categories: g.categories.map((c, j) => j !== ci ? c : {
        ...c, entrees: [...c.entrees, entry],
      }),
    }))
    setExported(false)
  }
  const removeArmeEntry = (gi: number, ci: number, ei: number) => {
    setGroupes(prev => prev.map((g, i) => i !== gi ? g : {
      ...g, categories: g.categories.map((c, j) => j !== ci ? c : {
        ...c, entrees: c.entrees.filter((_, k) => k !== ei),
      }),
    }))
    setExported(false)
  }
  const updateArmeNotes = (gi: number, ci: number, notes: string) => {
    setGroupes(prev => prev.map((g, i) => i !== gi ? g : {
      ...g, categories: g.categories.map((c, j) => j !== ci ? c : { ...c, notes }),
    }))
    setExported(false)
  }

  /* ── édition armures ── */
  const renameCatArmure = (ci: number, categorie: string) => {
    setArmures(prev => prev.map((c, i) => i !== ci ? c : { ...c, categorie }))
    setExported(false)
  }
  const removeCatArmure = (ci: number) => {
    setArmures(prev => prev.filter((_, i) => i !== ci))
    setExported(false)
  }
  const addCatArmure = () => {
    setArmures(prev => [...prev, { categorie: t('equipement.nouvelleCategorie'), entrees: [] }])
    setExported(false)
  }
  const updateArmure = (ci: number, ei: number, patch: Partial<EntreeArmure>) => {
    setArmures(prev => prev.map((c, i) => i !== ci ? c : {
      ...c, entrees: c.entrees.map((e, j) => j !== ei ? e : { ...e, ...patch }),
    }))
    setExported(false)
  }
  const addArmureEntry = (ci: number) => {
    setArmures(prev => prev.map((c, i) => i !== ci ? c : {
      ...c, entrees: [...c.entrees, { nom: '', def: 0, prix: '' }],
    }))
    setExported(false)
  }
  const removeArmureEntry = (ci: number, ei: number) => {
    setArmures(prev => prev.map((c, i) => i !== ci ? c : {
      ...c, entrees: c.entrees.filter((_, j) => j !== ei),
    }))
    setExported(false)
  }
  const updateArmureNotes = (ci: number, notes: string) => {
    setArmures(prev => prev.map((c, i) => i !== ci ? c : { ...c, notes }))
    setExported(false)
  }

  /* ── sélection personnage (no-op en mode catalogue seul, sans personnage) ── */
  const appendInv = (nom: string) => {
    if (!character) return nom
    const inv = character.inventaire.trim()
    return inv ? `${inv}, ${nom}` : nom
  }
  const removeInv = (nom: string) => {
    if (!character) return ''
    let inv = character.inventaire
    if (inv.includes(`, ${nom}`)) inv = inv.replace(`, ${nom}`, '')
    else if (inv.includes(`${nom}, `)) inv = inv.replace(`${nom}, `, '')
    else inv = inv.replace(nom, '')
    return inv.trim()
  }

  const addArme = (e: EntreeArme) => {
    if (!character || !onChange) return
    onChange({
      armes: [...character.armes, { nom: e.nom, dm: e.dm, attaque: e.mod, special: '', prix: e.prix, portee: e.portee, deuxMains: e.deuxMains }],
      inventaire: appendInv(stripExposants(e.nom)),
    })
  }
  const removeArme = (idx: number) => {
    if (!character || !onChange) return
    const a = character.armes[idx]
    const stripped = stripExposants(a.nom)
    const isEquipped = stripExposants(character.arme1) === stripped || stripExposants(character.arme2) === stripped || stripExposants(character.arme3) === stripped
    const patch: Partial<Character> = {
      armes: character.armes.filter((_, i) => i !== idx),
      inventaire: removeInv(isEquipped ? `${stripped} (Équipé(e))` : stripped),
    }
    if (stripExposants(character.arme1) === stripped) { patch.arme1 = ''; patch.dmArme1 = '' }
    if (stripExposants(character.arme2) === stripped) { patch.arme2 = ''; patch.dmArme2 = '' }
    if (stripExposants(character.arme3) === stripped) { patch.arme3 = ''; patch.dmArme3 = '' }
    onChange(patch)
  }

  // Arme à 2 mains : même détection que dans le wizard de création (CreationWizard.tsx) — flag explicite
  // pour les armes personnalisées (nom hors convention), sinon le nom pour le catalogue officiel.
  const is2H = (nom: string) => {
    if (character?.armes.find(a => a.nom === nom)?.deuxMains) return true
    const n = nom.toLowerCase()
    return n.includes('deux mains') || n.includes('arc')
  }
  // Emplacement 3 : indépendant des mains (voir CreationWizard.tsx, même règle) — ni bloqué par une arme
  // à 2 mains en emplacement 1, ni en conflit avec le bouclier ; compte néanmoins comme une arme équipée
  // partout ailleurs (malus sans formation, Mode de jeu).
  const equipeArmeSlot = (nom: string | null, slot: 1 | 2 | 3) => {
    if (!character || !onChange) return
    // Une arme à 2 mains occupe les deux mains : rien ne peut aller en emplacement 2 tant que
    // l'emplacement 1 en tient une.
    if (slot === 2 && character.arme1 && is2H(character.arme1)) return
    const arme = nom ? character.armes.find(a => a.nom === nom) : null
    const prevNom = slot === 1 ? character.arme1 : slot === 2 ? character.arme2 : character.arme3
    const stripped = nom ? stripExposants(nom) : null
    let inv = character.inventaire
    if (prevNom) inv = unmarkEquipe(inv, prevNom)
    if (nom)     inv = markEquipe(inv, nom)
    // arme.attaque est une clé de stat brute ('FOR'/'DEX', voir addArme) : l'écrire ici sous la forme
    // "Mod.FOR" reconnue par rollDmFormula (Mode de jeu), pas telle quelle — sinon le jet ignore
    // silencieusement ce token non numérique et ne lance que le dé (voir ChampsRecto.tsx pour le même
    // souci côté affichage de la fiche).
    const dm = arme ? `${arme.dm}${arme.attaque ? ` Mod.${arme.attaque}` : ''}` : ''
    const patch: Partial<Character> = slot === 1
      ? { arme1: stripped ?? '', dmArme1: dm }
      : slot === 2
      ? { arme2: stripped ?? '', dmArme2: dm }
      : { arme3: stripped ?? '', dmArme3: dm }
    // Poser une arme à 2 mains en emplacement 1 libère l'emplacement 2 (plus de main disponible) ; poser
    // une arme (n'importe laquelle) en emplacement 2, ou une arme à 2 mains en emplacement 1, prend la
    // main que le bouclier porté occupait — il est donc déséquipé (cf. equipeBouclier, même logique
    // inverse : l'équiper libère l'emplacement 2). L'emplacement 3 n'entre jamais dans ces échanges de main.
    if (slot === 1 && nom && is2H(nom)) {
      if (character.arme2) inv = unmarkEquipe(inv, character.arme2)
      patch.arme2 = ''
      patch.dmArme2 = ''
    }
    if (nom && (slot === 2 || (slot === 1 && is2H(nom))) && bouclierPorte) {
      patch.armuresEquipees = character.armuresEquipees.map(a => isBouclier(a.nom) ? { ...a, equipe: false } : a)
    }
    patch.inventaire = inv
    onChange(patch)
  }
  // Valeur d'un emplacement d'arme par numéro — évite de répéter le ternaire 1/2/3 dans les deux blocs
  // d'affichage dupliqués (desktop et footer récap) ci-dessous.
  const armeSlotValue = (slot: 1 | 2 | 3) => (slot === 1 ? character?.arme1 : slot === 2 ? character?.arme2 : character?.arme3) ?? ''
  const addArmure = (e: EntreeArmure) => {
    if (!character || !onChange) return
    onChange({
      armuresEquipees: [...character.armuresEquipees, { nom: e.nom, def: e.def, prix: e.prix, equipe: false }],
      inventaire: appendInv(e.nom),
    })
  }
  const removeArmure = (idx: number) => {
    if (!character || !onChange) return
    const a = character.armuresEquipees[idx]
    const invNom = a.equipe ? `${a.nom} (Équipé(e))` : a.nom
    onChange({
      armuresEquipees: character.armuresEquipees.filter((_, i) => i !== idx),
      inventaire: removeInv(invNom),
    })
  }

  const isBouclier = (nom: string) => nom.toLowerCase().includes('bouclier')

  const markEquipe = (inv: string, nom: string) => {
    const s = stripExposants(nom)
    if (inv.includes(nom)) return inv.replace(nom, `${s} (Équipé(e))`)
    if (inv.includes(s))   return inv.replace(s,   `${s} (Équipé(e))`)
    return inv
  }
  const unmarkEquipe = (inv: string, nom: string) => {
    const s = stripExposants(nom)
    if (inv.includes(`${s} (Équipé(e))`))   return inv.replace(`${s} (Équipé(e))`, s)
    if (inv.includes(`${nom} (Équipé(e))`)) return inv.replace(`${nom} (Équipé(e))`, s)
    return inv
  }

  const equipeArmure = (nom: string | null) => {
    if (!character || !onChange) return
    let inv = character.inventaire
    if (armurePortee) inv = unmarkEquipe(inv, armurePortee)
    if (nom)          inv = markEquipe(inv, nom)
    onChange({
      armuresEquipees: character.armuresEquipees.map(a =>
        isBouclier(a.nom) ? a : { ...a, equipe: a.nom === nom }
      ),
      inventaire: inv,
    })
  }
  const equipeBouclier = (nom: string | null) => {
    if (!character || !onChange) return
    // Le bouclier prend une main, comme une arme : pas de main libre si l'emplacement 1 tient une arme
    // à 2 mains (voir equipeArmeSlot, symétrique).
    if (nom && character.arme1 && is2H(character.arme1)) return
    let inv = character.inventaire
    if (bouclierPorte) inv = unmarkEquipe(inv, bouclierPorte)
    if (nom)           inv = markEquipe(inv, nom)
    const patch: Partial<Character> = {
      armuresEquipees: character.armuresEquipees.map(a =>
        !isBouclier(a.nom) ? a : { ...a, equipe: a.nom === nom }
      ),
    }
    // Équiper le bouclier prend la main que l'emplacement 2 occupait — le libère (cf. equipeArmeSlot,
    // même logique inverse).
    if (nom && character.arme2) {
      inv = unmarkEquipe(inv, character.arme2)
      patch.arme2 = ''
      patch.dmArme2 = ''
    }
    patch.inventaire = inv
    onChange(patch)
  }

  const armuresSeules  = character?.armuresEquipees.filter(a => !isBouclier(a.nom)) ?? []
  const boucliersSeuls = character?.armuresEquipees.filter(a =>  isBouclier(a.nom)) ?? []
  const armurePortee   = armuresSeules.find(a => a.equipe)?.nom ?? null
  const bouclierPorte  = boucliersSeuls.find(a => a.equipe)?.nom ?? null

  const handleExport = () => {
    if (section === 'armes') {
      saveArmes({ notes: armesNotes, groupes } as typeof armesCtx)
      exportJson({ notes: armesNotes, groupes }, 'armes.json')
    } else {
      saveArmures({ notes: armuresNotes, categories: armures } as typeof armuresCtx)
      exportJson({ notes: armuresNotes, categories: armures }, 'armures.json')
    }
    setExported(true)
  }

  const renderArmeTable = (cat: CatArme, gi: number, ci: number, withPortee: boolean) => {
    const cols = (withPortee ? 6 : 5) + (editMode ? 1 : 0)
    return (
      <table style={{ width: '100%', minWidth: 380, borderCollapse: 'collapse' }}>
        <thead><tr>
          <th style={{ ...headCell, textAlign: 'left' }}>{t('equipement.colArme')}</th>
          <th style={{ ...headCell, textAlign: 'center', width: 70 }}>DM</th>
          <th style={{ ...headCell, textAlign: 'center', width: 70 }}>+ Mod</th>
          {withPortee && <th style={{ ...headCell, textAlign: 'center', width: 80 }}>{t('equipement.colPortee')}</th>}
          <th style={{ ...headCell, textAlign: 'center', width: 70 }}>{t('equipement.colPrix')}</th>
          {editMode && <th style={{ ...headCell, textAlign: 'center', width: 60 }}>{t('equipement.colDeuxMains')}</th>}
          <th style={{ ...headCell, width: editMode ? 50 : 80, textAlign: 'center' }}>{!editMode && t('equipement.colAjouter')}</th>
        </tr></thead>
        <tbody>
          {cat.entrees.length === 0 && !editMode && (
            <tr><td colSpan={cols} style={{ ...cell, opacity: 0.4, fontStyle: 'italic', textAlign: 'center' }}>
              {t('equipement.aucuneEntree')}
            </td></tr>
          )}
          {cat.entrees.map((e, ei) => (
            <tr key={ei}>
              <td style={cell}>
                {editMode ? <input value={e.nom} onChange={ev => updateArme(gi, ci, ei, { nom: ev.target.value })} style={inputStyle} /> : eqName(e.nom)}
              </td>
              <td style={{ ...cell, textAlign: 'center' }}>
                {editMode ? <input value={e.dm} onChange={ev => updateArme(gi, ci, ei, { dm: ev.target.value })} style={{ ...inputStyle, textAlign: 'center' }} /> : e.dm}
              </td>
              <td style={{ ...cell, textAlign: 'center', color: S.gold }}>
                {editMode ? <input value={e.mod} onChange={ev => updateArme(gi, ci, ei, { mod: ev.target.value })} style={{ ...inputStyle, textAlign: 'center', color: S.gold }} /> : t(`stats.${e.mod}`, e.mod)}
              </td>
              {withPortee && (
                <td style={{ ...cell, textAlign: 'center' }}>
                  {editMode ? <input value={e.portee ?? ''} onChange={ev => updateArme(gi, ci, ei, { portee: ev.target.value })} style={{ ...inputStyle, textAlign: 'center' }} /> : (e.portee ?? '—')}
                </td>
              )}
              <td style={{ ...cell, textAlign: 'center', opacity: editMode ? 1 : 0.6 }}>
                {editMode ? <input value={e.prix} onChange={ev => updateArme(gi, ci, ei, { prix: ev.target.value })} style={{ ...inputStyle, textAlign: 'center' }} /> : fmtPrix(e.prix)}
              </td>
              {editMode && (
                <td style={{ ...cell, textAlign: 'center' }}>
                  <input type="checkbox" checked={!!e.deuxMains} onChange={ev => updateArme(gi, ci, ei, { deuxMains: ev.target.checked })} style={{ width: 16, height: 16, accentColor: S.gold }} />
                </td>
              )}
              <td style={{ ...cell, textAlign: 'center' }}>
                {editMode
                  ? <button onClick={() => removeArmeEntry(gi, ci, ei)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(220,80,80,0.7)', fontSize: 14, padding: 0 }}>✕</button>
                  : <button onClick={() => addArme(e)} style={{ padding: '2px 10px', borderRadius: 3, fontSize: 14, cursor: 'pointer', border: `1px solid ${S.gold}`, background: 'rgba(201,168,76,0.1)', color: S.gold }}>+</button>
                }
              </td>
            </tr>
          ))}
          {editMode && (
            <tr>
              <td colSpan={cols} style={cell}>
                <button onClick={() => addArmeEntry(gi, ci)} style={{
                  width: '100%', padding: '4px', borderRadius: 3, fontSize: 14, cursor: 'pointer',
                  border: `1px dashed ${S.border}`, background: 'transparent', color: S.gold,
                }}>{t('equipement.nouvelleEntree')}</button>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    )
  }

  const renderArmureTable = (cat: CatArmure, ci: number) => (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead><tr>
        <th style={{ ...headCell, textAlign: 'left' }}>{t('equipement.colArmure')}</th>
        <th style={{ ...headCell, textAlign: 'center', width: 70 }}>DEF</th>
        <th style={{ ...headCell, textAlign: 'center', width: 70 }}>{t('equipement.colPrix')}</th>
        <th style={{ ...headCell, width: editMode ? 50 : 80, textAlign: 'center' }}>{!editMode && t('equipement.colAjouter')}</th>
      </tr></thead>
      <tbody>
        {cat.entrees.length === 0 && !editMode && (
          <tr><td colSpan={4} style={{ ...cell, opacity: 0.4, fontStyle: 'italic', textAlign: 'center' }}>
            {t('equipement.aucuneEntree')}
          </td></tr>
        )}
        {cat.entrees.map((e, ei) => (
          <tr key={ei}>
            <td style={cell}>
              {editMode ? <input value={e.nom} onChange={ev => updateArmure(ci, ei, { nom: ev.target.value })} style={inputStyle} /> : eqName(e.nom)}
            </td>
            <td style={{ ...cell, textAlign: 'center', color: S.gold }}>
              {editMode ? <input type="number" value={e.def} onChange={ev => updateArmure(ci, ei, { def: parseInt(ev.target.value) || 0 })} style={{ ...inputStyle, textAlign: 'center', color: S.gold, width: 60 }} /> : `+${e.def}`}
            </td>
            <td style={{ ...cell, textAlign: 'center', opacity: editMode ? 1 : 0.6 }}>
              {editMode ? <input value={e.prix} onChange={ev => updateArmure(ci, ei, { prix: ev.target.value })} style={{ ...inputStyle, textAlign: 'center' }} /> : fmtPrix(e.prix)}
            </td>
            <td style={{ ...cell, textAlign: 'center' }}>
              {editMode
                ? <button onClick={() => removeArmureEntry(ci, ei)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(220,80,80,0.7)', fontSize: 14, padding: 0 }}>✕</button>
                : <button onClick={() => addArmure(e)} style={{ padding: '2px 10px', borderRadius: 3, fontSize: 14, cursor: 'pointer', border: `1px solid ${S.gold}`, background: 'rgba(201,168,76,0.1)', color: S.gold }}>+</button>
              }
            </td>
          </tr>
        ))}
        {editMode && (
          <tr>
            <td colSpan={4} style={cell}>
              <button onClick={() => addArmureEntry(ci)} style={{
                width: '100%', padding: '4px', borderRadius: 3, fontSize: 14, cursor: 'pointer',
                border: `1px dashed ${S.border}`, background: 'transparent', color: S.gold,
              }}>+ Nouvelle entrée</button>
            </td>
          </tr>
        )}
      </tbody>
    </table>
  )

  // Index plats pour les refs de scroll
  let flatCounter = 0
  const flatIndex = groupes.map(g => g.categories.map(() => flatCounter++))

  const handleStyle: React.CSSProperties = {
    cursor: 'grab', opacity: 0.35, fontSize: 13, flexShrink: 0,
    userSelect: 'none', paddingRight: 4,
  }

  useModalBackButton(onClose)

  // ── Objets magiques ────────────────────────────────────────────────────
  // Rendu séparé de l'éditeur armes/armures ci-dessous (jamais le même arbre de rendu) : ce dernier
  // suppose `section` binaire ('armes' | 'armures') dans plusieurs ternaires, une troisième valeur y
  // tomberait dans la mauvaise branche. Retour anticipé, avant même la branche mobile, pour couvrir les
  // deux tailles d'écran avec une seule mise en page (pas besoin d'une variante mobile dédiée ici).
  if (section === 'objetsMagiques' && character && onChange) {
    const possedes = character.objetsMagiquesPossedes ?? []
    const equipes = character.objetsMagiquesEquipes ?? []
    const niveauMagieEquipe = objetsMagiques
      .filter(o => equipes.includes(o.id))
      .reduce((s, o) => s + o.niveauMagie, 0)
    const conseille = NIVEAU_MAGIE_CONSEILLE[Math.min(character.niveau, NIVEAU_MAGIE_CONSEILLE.length) - 1] ?? 0

    const togglePossede = (id: string) => {
      const objet = objetsMagiques.find(o => o.id === id)
      const enPossession = possedes.includes(id)
      const patch: Partial<Character> = {
        objetsMagiquesPossedes: enPossession ? possedes.filter(x => x !== id) : [...possedes, id],
        // Retirer un objet de la possession le déséquipe aussi, sans quoi ses bonus resteraient actifs.
        objetsMagiquesEquipes: enPossession ? equipes.filter(x => x !== id) : equipes,
        // Synthétise/retire une Arme ou ArmureEquipee classique correspondante, pour que l'objet apparaisse
        // dans la liste d'armes/armures et soit plaçable dans un emplacement comme n'importe quelle arme
        // "hors catalogue" (voir patchPossessionObjetMagique, partagée avec la réception réseau).
        ...(objet ? patchPossessionObjetMagique(character, objet, !enPossession) : {}),
      }
      // Un objet magique possédé est un objet comme un autre : il doit apparaître dans le texte libre
      // d'inventaire (appendInv/removeInv, déjà utilisés par addArme/removeArme) — pas seulement les
      // objets de slot arme/armure/bouclier qui, eux, ont en plus un emplacement dédié (voir
      // patchPossessionObjetMagique ci-dessus) ; un focalisateur/accessoire n'a AUCUN autre moyen
      // d'apparaître sur la fiche une fois possédé.
      if (objet) {
        if (enPossession) {
          const stripped = stripExposants(objet.nom)
          const estSlotte = stripExposants(character.arme1) === stripped || stripExposants(character.arme2) === stripped
            || stripExposants(character.arme3) === stripped
            || character.armuresEquipees.some(a => a.nom === objet.nom && a.equipe)
          patch.inventaire = removeInv(estSlotte ? `${stripped} (Équipé(e))` : stripped)
        } else {
          patch.inventaire = appendInv(stripExposants(objet.nom))
        }
      }
      onChange(patch)
    }
    const toggleEquipe = (id: string) => {
      onChange({ objetsMagiquesEquipes: equipes.includes(id) ? equipes.filter(x => x !== id) : [...equipes, id] })
    }

    // Mêmes catégories que la colonne de gauche des armes/armures (ancres cliquables qui font défiler
    // jusqu'à la table correspondante à droite, via le même scrollTo/sectionRefs/activeKey déjà utilisés
    // par ces deux sections) — seules celles ayant au moins un objet apparaissent, pour que la colonne de
    // gauche corresponde toujours exactement à ce qui est ancré à droite.
    const catsAvecObjets = OBJETS_MAGIQUES_CATEGORIES.filter(cat => objetsMagiques.some(o => o.categorie === cat))

    return (
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 750, background: 'rgba(0,0,0,0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}
        onClick={e => { if (e.target === e.currentTarget) onClose() }}
      >
        <div style={{ background: 'rgba(18,14,9,0.99)', border: `1px solid ${S.border}`,
          borderRadius: 8, width: '90vw', maxWidth: 1040, maxHeight: '85vh',
          display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,0.9)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 20px', borderBottom: `1px solid ${S.border}`, flexShrink: 0, gap: 10 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['armes', 'armures', 'objetsMagiques'] as const).map(s => {
                const magic = s === 'objetsMagiques'
                return (
                  <button key={s} onClick={() => { setSection(s); setActiveKey(magic ? '0' : '0-0') }} style={{
                    padding: '4px 14px', borderRadius: 4, fontSize: 15, cursor: 'pointer',
                    border: `1px solid ${magic ? S.magic : S.gold}`,
                    background: section === s ? (magic ? 'rgba(180,130,255,0.2)' : 'rgba(201,168,76,0.2)') : 'transparent',
                    color: magic ? S.magic : S.gold, fontWeight: section === s ? 700 : 400,
                  }}>
                    {t(`equipement.${s}`)}
                  </button>
                )
              })}
            </div>
            <button onClick={onClose} style={{
              background: 'none', border: 'none', color: S.parchment,
              opacity: 0.5, cursor: 'pointer', fontSize: 20, lineHeight: 1,
            }}>✕</button>
          </div>

          <div style={{ padding: '10px 20px', borderBottom: `1px solid ${S.border}`, flexShrink: 0, fontSize: 14, display: 'flex', gap: 8, alignItems: 'baseline' }}>
            <span style={{ color: S.parchment, opacity: 0.7 }}>{t('equipement.niveauMagieEquipe')}</span>
            <span style={{ color: niveauMagieEquipe > conseille ? '#e08080' : S.gold, fontWeight: 700, fontSize: 17 }}>{niveauMagieEquipe}</span>
            <span style={{ color: S.parchment, opacity: 0.5 }}>/ {conseille} {t('equipement.conseilleNiveau', { n: character.niveau })}</span>
          </div>

          {/* ── Corps : même structure que les armes/armures (colonne de catégories à gauche, tables à
              droite) plutôt qu'une mise en page différente — cohérence entre les 3 sections. */}
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>

            {/* Menu ancres */}
            {isMobile && !menuTypesOuvert ? null : (
            <div style={isMobile ? {
              position: 'absolute', top: 0, bottom: 0, left: 0, zIndex: 20,
              width: 'min(76vw, 300px)', background: 'rgba(18,14,9,0.99)',
              borderRight: `1px solid ${S.border}`, boxShadow: '4px 0 24px rgba(0,0,0,0.7)',
              display: 'flex', flexDirection: 'column', overflowY: 'auto',
            } : { width: 'clamp(90px, 28vw, 210px)', flexShrink: 0, borderRight: `1px solid ${S.border}`,
              display: 'flex', flexDirection: 'column', overflowY: 'auto' }}
              onClick={isMobile ? () => setMenuTypesOuvert(false) : undefined}>
              <div style={{ flex: 1 }}>
                {catsAvecObjets.map((cat, idx) => (
                  <div key={cat} onClick={() => scrollTo(`${idx}`, idx)} style={{
                    padding: '8px 12px', fontSize: 14, cursor: 'pointer',
                    color: activeKey === `${idx}` ? S.gold : S.parchment,
                    background: activeKey === `${idx}` ? 'rgba(201,168,76,0.1)' : 'transparent',
                    borderLeft: activeKey === `${idx}` ? `3px solid ${S.gold}` : '3px solid transparent',
                    transition: 'all 0.1s', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {t(`gmMode.objetMagiqueDetail.categorie.${cat}`)}
                  </div>
                ))}
              </div>
            </div>
            )}

            {/* Voile de fermeture du tiroir */}
            {isMobile && menuTypesOuvert && (
              <div onClick={() => setMenuTypesOuvert(false)}
                style={{ position: 'absolute', inset: 0, zIndex: 15, background: 'rgba(0,0,0,0.5)' }} />
            )}

            {/* Toutes les tables */}
            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', padding: isMobile ? '0 10px 24px' : '0 18px 24px', minWidth: 0 }}>
              {isMobile && (
                <button onClick={() => setMenuTypesOuvert(true)} style={{
                  position: 'sticky', top: 8, zIndex: 10, marginTop: 8,
                  padding: '6px 14px', borderRadius: 5, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                  border: `1px solid ${S.border}`, background: 'rgba(30,24,16,0.97)', color: S.gold,
                }}>☰ {t('equipement.types')}</button>
              )}
              {objetsMagiques.length === 0 && (
                <div style={{ padding: 20, textAlign: 'center', opacity: 0.5, fontSize: 14 }}>{t('equipement.aucunObjetMagique')}</div>
              )}
              {/* DM/+Mod ne sont renseignés que pour un objet de slot arme (sinon DEF dérivé pour
                  armure/bouclier, "—" pour focalisateur/accessoire). Les enchantements appliqués se
                  déplient en cliquant sur le nom (évite une colonne de plus dans une table déjà dense). */}
              {catsAvecObjets.map((cat, idx) => {
                const items = objetsMagiques.filter(o => o.categorie === cat)
                return (
                  <div key={cat} ref={el => { sectionRefs.current[idx] = el }} style={{
                    paddingTop: idx === 0 ? 16 : 24, paddingBottom: 16, marginBottom: 8,
                    borderTop: idx > 0 ? `2px solid rgba(201,168,76,0.2)` : 'none',
                  }}>
                    <div style={{ fontFamily: "'Cinzel', serif", fontSize: 15, color: S.gold, marginBottom: 8 }}>
                      {t(`gmMode.objetMagiqueDetail.categorie.${cat}`)}
                    </div>
                    <table style={{ width: '100%', minWidth: 560, borderCollapse: 'collapse' }}>
                      <thead><tr>
                        <th style={{ ...headCell, textAlign: 'left' }}>{t('equipement.colArme')}</th>
                        <th style={{ ...headCell, textAlign: 'center', width: 70 }}>DM</th>
                        <th style={{ ...headCell, textAlign: 'center', width: 65 }}>+ Mod</th>
                        <th style={{ ...headCell, textAlign: 'center', width: 100, whiteSpace: 'nowrap' }}>{t('gmMode.objetMagiqueDetail.niveauMagieSection')}</th>
                        <th style={{ ...headCell, textAlign: 'center', width: 70 }}>{t('equipement.colPrix')}</th>
                        <th style={{ ...headCell, width: 150, textAlign: 'center' }} />
                      </tr></thead>
                      <tbody>
                        {items.map(o => {
                          const possede = possedes.includes(o.id)
                          const equipe = equipes.includes(o.id)
                          const expanded = expandedObjet === o.id
                          const defDerive = o.slot === 'armure' || o.slot === 'bouclier'
                            ? o.enchantements.reduce((s, e) => s + (e.effets ?? []).filter(ef => ef.stat === 'DEF').reduce((s2, ef) => s2 + (parseInt(ef.valeur) || 0), 0), 0)
                            : null
                          const dmCol = o.slot === 'arme' ? (o.armeDm || '—') : defDerive !== null && defDerive > 0 ? `DEF +${defDerive}` : '—'
                          const modCol = o.slot === 'arme' && o.armeAttaque ? t(`stats.${o.armeAttaque}`) : '—'
                          return (
                            <Fragment key={o.id}>
                              <tr>
                                <td style={cell}>
                                  <button
                                    onClick={() => setExpandedObjet(expanded ? null : o.id)}
                                    disabled={o.enchantements.length === 0}
                                    style={{
                                      background: 'none', border: 'none', padding: 0,
                                      cursor: o.enchantements.length ? 'pointer' : 'default',
                                      color: S.parchment, fontSize: 15, textAlign: 'left',
                                      display: 'flex', alignItems: 'center', gap: 6,
                                    }}
                                  >
                                    {o.enchantements.length > 0 && (
                                      <span style={{ color: S.gold, fontSize: 11, display: 'inline-block',
                                        transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▸</span>
                                    )}
                                    {o.nom}
                                  </button>
                                </td>
                                <td style={{ ...cell, textAlign: 'center' }}>{dmCol}</td>
                                <td style={{ ...cell, textAlign: 'center', color: S.gold }}>{modCol}</td>
                                <td style={{ ...cell, textAlign: 'center' }}>{o.niveauMagie}</td>
                                <td style={{ ...cell, textAlign: 'center', opacity: 0.6 }}>{o.valeur} po</td>
                                <td style={{ ...cell, textAlign: 'center' }}>
                                  <div style={{ display: 'flex', gap: 5, justifyContent: 'center' }}>
                                    <button onClick={() => togglePossede(o.id)} style={{
                                      padding: '3px 9px', borderRadius: 4, fontSize: 12, cursor: 'pointer',
                                      border: `1px solid ${possede ? 'rgba(120,200,140,0.6)' : S.border}`,
                                      background: possede ? 'rgba(120,200,140,0.15)' : 'transparent',
                                      color: possede ? 'rgba(140,215,160,0.9)' : S.parchment,
                                    }}>
                                      {possede ? t('equipement.possede') : t('equipement.ajouter')}
                                    </button>
                                    <button onClick={() => toggleEquipe(o.id)} disabled={!possede} style={{
                                      padding: '3px 9px', borderRadius: 4, fontSize: 12, cursor: possede ? 'pointer' : 'default',
                                      border: `1px solid ${equipe ? S.gold : S.border}`,
                                      background: equipe ? 'rgba(201,168,76,0.2)' : 'transparent',
                                      color: equipe ? S.gold : S.parchment, opacity: possede ? 1 : 0.35,
                                    }}>
                                      {equipe ? t('equipement.equipe') : t('equipement.equiper')}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                              {expanded && o.enchantements.length > 0 && (
                                <tr>
                                  <td colSpan={6} style={{ ...cell, background: 'rgba(255,255,255,0.03)' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '2px 0 2px 20px' }}>
                                      {o.enchantements.map((e, i) => (
                                        <div key={i} style={{ fontSize: 13 }}>
                                          <span style={{ color: S.gold }}>{e.nom}</span>
                                          {e.texte && <span style={{ color: 'rgba(245,236,215,0.6)' }}> — {e.texte}</span>}
                                        </div>
                                      ))}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Layout mobile ──────────────────────────────────────────────────────
  // Sans personnage (mode catalogue seul), la vue mobile ci-dessous ne sert qu'à parcourir + ajouter à un
  // personnage — inutile ici, et elle n'offre aucun moyen d'éditer le catalogue. On garde alors l'éditeur
  // desktop (avec renommage/ajout/suppression) même sur petit écran.
  if (isMobile && character) {
    // Liste plate des catégories armes
    const mobileCatsArmes: { key: string; label: string; gi: number; ci: number }[] = []
    groupes.forEach((g, gi) => g.categories.forEach((c, ci) => {
      mobileCatsArmes.push({ key: `${gi}-${ci}`, label: `${eqName(g.groupe)} — ${eqName(c.categorie)}`, gi, ci })
    }))
    const mobileCatsArmures = armures.map((c, ci) => ({ key: `${ci}`, label: eqName(c.categorie), ci }))

    const [mgi, mci] = mobileCatKey.split('-').map(Number)
    const mobileCatArme  = section === 'armes'   ? groupes[mgi]?.categories[mci]   : null
    const mobileCatArmure = section === 'armures' ? armures[Number(mobileCatKey)]   : null
    const withPortee = section === 'armes' && mobileCatArme ? isDistance(groupes[mgi].groupe) : false

    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 750, background: 'rgba(18,14,9,0.99)',
        display: 'flex', flexDirection: 'column',
        paddingTop: 'env(safe-area-inset-top)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px',
          borderBottom: `1px solid ${S.border}`, flexShrink: 0 }}>
          {(['catalogue', 'equipe'] as const).map(v => (
            <button key={v} onClick={() => setMobileView(v)} style={{
              padding: '6px 16px', borderRadius: 4, fontSize: 15, cursor: 'pointer',
              border: `1px solid ${S.gold}`,
              background: mobileView === v ? 'rgba(201,168,76,0.2)' : 'transparent',
              color: S.gold, fontWeight: mobileView === v ? 700 : 400,
            }}>{t(`equipement.${v}`)}</button>
          ))}
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: 'none', border: 'none',
            color: S.parchment, opacity: 0.6, cursor: 'pointer', fontSize: 22 }}>✕</button>
        </div>

        {mobileView === 'catalogue' ? (<>
          {/* Sélecteur armes/armures + catégorie */}
          <div style={{ padding: '10px 16px', borderBottom: `1px solid ${S.border}`, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['armes', 'armures'] as const).map(s => (
                <button key={s} onClick={() => { setSection(s); setMobileCatKey(s === 'armes' ? '0-0' : '0') }} style={{
                  flex: 1, padding: '6px', borderRadius: 4, fontSize: 14, cursor: 'pointer',
                  border: `1px solid ${S.border}`,
                  background: section === s ? 'rgba(201,168,76,0.15)' : 'transparent',
                  color: section === s ? S.gold : S.parchment,
                }}>{t(`equipement.${s}`)}</button>
              ))}
              <button onClick={() => setSection('objetsMagiques')} style={{
                flex: 1, padding: '6px', borderRadius: 4, fontSize: 14, cursor: 'pointer',
                border: `1px solid ${S.magic}`, background: 'rgba(180,130,255,0.1)', color: S.magic,
              }}>{t('equipement.objetsMagiques')}</button>
            </div>
            <select
              value={mobileCatKey}
              onChange={e => setMobileCatKey(e.target.value)}
              style={{ width: '100%', background: 'rgba(15,12,8,0.92)', border: `1px solid ${S.border}`,
                borderRadius: 4, color: S.parchment, fontSize: 15, padding: '8px 10px' }}
            >
              {section === 'armes'
                ? mobileCatsArmes.map(c => <option key={c.key} value={c.key}>{c.label}</option>)
                : mobileCatsArmures.map(c => <option key={c.key} value={c.key}>{c.label}</option>)
              }
            </select>
          </div>

          {/* Liste des entrées */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
            {section === 'armes' && mobileCatArme && mobileCatArme.entrees.map((e, ei) => (
              <div key={ei} style={{ display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 16px', borderBottom: `1px solid rgba(201,168,76,0.08)` }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, color: S.parchment }}>{eqName(e.nom)}</div>
                  <div style={{ fontSize: 13, color: 'rgba(245,236,215,0.5)', marginTop: 2 }}>
                    {e.dm}{e.mod ? ` + ${e.mod}` : ''}{withPortee && e.portee ? ` · ${e.portee}` : ''}
                    {e.prix ? ` · ${fmtPrix(e.prix)}` : ''}{e.deuxMains ? ` · ${t('equipement.colDeuxMains')}` : ''}
                  </div>
                </div>
                <button onClick={() => addArme(e)} style={{
                  flexShrink: 0, padding: '8px 16px', borderRadius: 4, fontSize: 15,
                  border: `1px solid ${S.gold}`, background: 'rgba(201,168,76,0.1)',
                  color: S.gold, cursor: 'pointer',
                }}>+</button>
              </div>
            ))}
            {section === 'armures' && mobileCatArmure && mobileCatArmure.entrees.map((e, ei) => (
              <div key={ei} style={{ display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 16px', borderBottom: `1px solid rgba(201,168,76,0.08)` }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, color: S.parchment }}>{eqName(e.nom)}</div>
                  <div style={{ fontSize: 13, color: 'rgba(245,236,215,0.5)', marginTop: 2 }}>
                    DEF +{e.def}{e.prix ? ` · ${fmtPrix(e.prix)}` : ''}
                  </div>
                </div>
                <button onClick={() => addArmure(e)} style={{
                  flexShrink: 0, padding: '8px 16px', borderRadius: 4, fontSize: 15,
                  border: `1px solid ${S.gold}`, background: 'rgba(201,168,76,0.1)',
                  color: S.gold, cursor: 'pointer',
                }}>+</button>
              </div>
            ))}
          </div>
        </>) : (
          /* Vue Équipé */
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>

            {/* Armes */}
            {character.armes.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: S.gold, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>{t('equipement.armes')}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  {character.armes.map((a, i) => {
                    const slot = stripExposants(character.arme1) === stripExposants(a.nom) ? 1 : stripExposants(character.arme2) === stripExposants(a.nom) ? 2 : stripExposants(character.arme3) === stripExposants(a.nom) ? 3 : null
                    return (
                      <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '4px 10px', borderRadius: 3, fontSize: 14,
                        background: slot ? 'rgba(100,160,255,0.12)' : 'rgba(201,168,76,0.12)',
                        border: `1px solid ${slot ? 'rgba(100,160,255,0.3)' : S.border}`,
                        color: slot ? 'rgba(100,160,255,0.9)' : S.parchment }}>
                        {slot && <span style={{ fontSize: 11, opacity: 0.7 }}>E{slot} · </span>}
                        {eqName(a.nom)} <span style={{ opacity: 0.5 }}>{a.dm}</span>
                        <button onClick={() => removeArme(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(220,80,80,0.7)', fontSize: 16, padding: 0, lineHeight: 1 }}>✕</button>
                      </span>
                    )
                  })}
                </div>
                {([1, 2, 3] as const).map(slot => {
                  const current = armeSlotValue(slot)
                  const color = 'rgba(100,160,255,0.8)'
                  // Emplacement 2 entièrement indisponible si l'emplacement 1 tient une arme à 2 mains
                  // (plus de main libre) — cf. equipeArmeSlot. L'emplacement 3 n'est jamais bloqué : il
                  // ne se dispute pas les mains avec 1/2 (voir equipeArmeSlot).
                  const slotBloque = slot === 2 && !!character.arme1 && is2H(character.arme1)
                  return (
                    <div key={slot} style={{ marginBottom: 12, opacity: slotBloque ? 0.4 : 1 }}>
                      <div style={{ fontSize: 12, color, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>{t('equipement.emplacement', { n: slot })}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, cursor: 'pointer', color: S.parchment }}>
                          <input type="radio" name={`arme-slot-${slot}`} checked={!current} onChange={() => equipeArmeSlot(null, slot)} style={{ accentColor: color, width: 18, height: 18 }} />
                          {t('equipement.aucune')}
                        </label>
                        {character.armes.map((a, i) => {
                          const takenByOther = ([1, 2, 3] as const)
                            .filter(s => s !== slot)
                            .some(s => stripExposants(armeSlotValue(s)) === stripExposants(a.nom))
                          const isCurrent = stripExposants(current) === stripExposants(a.nom)
                          // Une arme à 2 mains ne peut jamais aller en emplacement 2 (elle occupe les
                          // deux mains, donc toujours placée en emplacement 1 — cf. wizard de création).
                          const disabled = takenByOther || slotBloque || (slot === 2 && is2H(a.nom))
                          return (
                            <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15,
                              cursor: disabled ? 'not-allowed' : 'pointer',
                              opacity: disabled && !takenByOther ? 0.4 : 1,
                              color: isCurrent ? color : S.parchment }}>
                              <input type="radio" name={`arme-slot-${slot}`}
                                checked={isCurrent} disabled={disabled}
                                onChange={() => equipeArmeSlot(a.nom, slot)}
                                style={{ accentColor: color, width: 18, height: 18 }} />
                              {eqName(a.nom)} <span style={{ opacity: 0.5, fontSize: 13 }}>{a.dm}</span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Armure portée */}
            {armuresSeules.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: 'rgba(100,160,255,0.8)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>{t('equipement.armurePortee')}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, cursor: 'pointer', color: S.parchment }}>
                    <input type="radio" name="armure-portee" checked={armurePortee === null} onChange={() => equipeArmure(null)} style={{ accentColor: 'rgba(100,160,255,0.8)', width: 18, height: 18 }} />
                    {t('equipement.aucune')}
                  </label>
                  {armuresSeules.map((a, i) => (
                    <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, cursor: 'pointer',
                      color: armurePortee === a.nom ? 'rgba(100,160,255,0.9)' : S.parchment }}>
                      <input type="radio" name="armure-portee" checked={armurePortee === a.nom} onChange={() => equipeArmure(a.nom)} style={{ accentColor: 'rgba(100,160,255,0.8)', width: 18, height: 18 }} />
                      {eqName(a.nom)} <span style={{ opacity: 0.5, fontSize: 13 }}>DEF +{a.def}</span>
                      <button onClick={() => removeArmure(character.armuresEquipees.indexOf(a))} style={{ marginLeft: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(220,80,80,0.7)', fontSize: 16, padding: 0 }}>✕</button>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Bouclier porté — occupe une main, comme une arme : indisponible si l'emplacement 1 tient
                une arme à 2 mains (cf. equipeBouclier). */}
            {boucliersSeuls.length > 0 && (() => {
              const boucliersBloques = !!character.arme1 && is2H(character.arme1)
              return (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: 'rgba(100,160,255,0.8)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>{t('equipement.bouclierPorte')}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, cursor: 'pointer', color: S.parchment }}>
                    <input type="radio" name="bouclier-porte" checked={bouclierPorte === null} onChange={() => equipeBouclier(null)} style={{ accentColor: 'rgba(100,160,255,0.8)', width: 18, height: 18 }} />
                    {t('equipement.aucun')}
                  </label>
                  {boucliersSeuls.map((a, i) => (
                    <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15,
                      cursor: boucliersBloques ? 'not-allowed' : 'pointer',
                      opacity: boucliersBloques && bouclierPorte !== a.nom ? 0.4 : 1,
                      color: bouclierPorte === a.nom ? 'rgba(100,160,255,0.9)' : S.parchment }}>
                      <input type="radio" name="bouclier-porte" checked={bouclierPorte === a.nom} disabled={boucliersBloques}
                        onChange={() => equipeBouclier(a.nom)} style={{ accentColor: 'rgba(100,160,255,0.8)', width: 18, height: 18 }} />
                      {eqName(a.nom)} <span style={{ opacity: 0.5, fontSize: 13 }}>DEF +{a.def}</span>
                      <button onClick={() => removeArmure(character.armuresEquipees.indexOf(a))} style={{ marginLeft: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(220,80,80,0.7)', fontSize: 16, padding: 0 }}>✕</button>
                    </label>
                  ))}
                </div>
              </div>
              )
            })()}

            {character.armes.length === 0 && character.armuresEquipees.length === 0 && (
              <div style={{ color: 'rgba(245,236,215,0.35)', fontSize: 15, textAlign: 'center', marginTop: 40 }}>
                {t('equipement.ajouterDepuisCatalogue')}
              </div>
            )}
          </div>
        )}

        {/* Bouton Fermer */}
        <div style={{ borderTop: `1px solid ${S.border}`, flexShrink: 0 }}>
          <div style={{ padding: '12px 16px' }}>
            <button onClick={onClose} style={{
              width: '100%', padding: '12px', borderRadius: 6, fontSize: 16,
              border: `1px solid ${S.border}`, background: 'rgba(245,236,215,0.07)',
              color: S.parchment, cursor: 'pointer', letterSpacing: '0.05em',
            }}>{t('equipement.fermer')}</button>
          </div>
          <div style={{ height: 'env(safe-area-inset-bottom)' }} />
        </div>
      </div>
    )
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 750, background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'rgba(18,14,9,0.99)', border: `1px solid ${S.border}`,
        borderRadius: 8, width: '90vw', maxWidth: 900, maxHeight: '85vh',
        display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,0.9)', overflow: 'hidden' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 20px', borderBottom: `1px solid ${S.border}`, flexShrink: 0, gap: 10 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['armes', 'armures'] as const).map(s => (
              <button key={s} onClick={() => { setSection(s); setActiveKey('0-0'); setExported(false) }} style={{
                padding: '4px 14px', borderRadius: 4, fontSize: 15, cursor: 'pointer',
                border: `1px solid ${S.gold}`,
                background: section === s ? 'rgba(201,168,76,0.2)' : 'transparent',
                color: S.gold, fontWeight: section === s ? 700 : 400,
              }}>
                {t(`equipement.${s}`)}
              </button>
            ))}
            {!catalogueSeul && (
              <button onClick={() => setSection('objetsMagiques')} style={{
                padding: '4px 14px', borderRadius: 4, fontSize: 15, cursor: 'pointer',
                border: `1px solid ${S.magic}`, background: 'rgba(180,130,255,0.1)', color: S.magic,
              }}>
                {t('equipement.objetsMagiques')}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {editMode && (
              <button onClick={handleExport} style={{
                padding: '4px 12px', borderRadius: 4, fontSize: 14, cursor: 'pointer',
                border: `1px solid ${S.gold}`,
                background: exported ? 'rgba(201,168,76,0.2)' : 'rgba(201,168,76,0.08)',
                color: S.gold, fontWeight: 600,
              }}>
                {exported ? t('equipement.exporte') : t('equipement.exporterJson', { filename: `${section}.json` })}
              </button>
            )}
            {!catalogueSeul && (
              <button onClick={() => { setEditMode(m => !m); setExported(false) }} style={{
                padding: '4px 12px', borderRadius: 4, fontSize: 14, cursor: 'pointer',
                border: `1px solid ${editMode ? 'rgba(180,130,255,0.6)' : S.border}`,
                background: editMode ? 'rgba(180,130,255,0.15)' : 'transparent',
                color: editMode ? 'rgba(210,180,255,0.9)' : S.parchment,
              }}>
                {editMode ? t('equipement.modeEdition') : t('equipement.editer')}
              </button>
            )}
            <button onClick={onClose} style={{
              background: 'none', border: 'none', color: S.parchment,
              opacity: 0.5, cursor: 'pointer', fontSize: 20, lineHeight: 1,
            }}>✕</button>
          </div>
        </div>

        {/* ── Corps ── */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>

          {/* Menu ancres — panneau fixe sur grand écran, tiroir flottant sur mobile */}
          {isMobile && !menuTypesOuvert ? null : (
          <div style={isMobile ? {
            position: 'absolute', top: 0, bottom: 0, left: 0, zIndex: 20,
            width: 'min(76vw, 300px)', background: 'rgba(18,14,9,0.99)',
            borderRight: `1px solid ${S.border}`, boxShadow: '4px 0 24px rgba(0,0,0,0.7)',
            display: 'flex', flexDirection: 'column', overflowY: 'auto',
          } : { width: 'clamp(90px, 28vw, 210px)', flexShrink: 0, borderRight: `1px solid ${S.border}`,
            display: 'flex', flexDirection: 'column', overflowY: 'auto' }}
            onClick={isMobile ? () => setMenuTypesOuvert(false) : undefined}>
            <div style={{ flex: 1 }}>
              {section === 'armes'
                ? groupes.map((g, gi) => (
                  <div key={gi}>
                    {/* En-tête de groupe */}
                    <div
                      draggable={editMode}
                      onDragStart={() => { dragSrc.current = { type: 'groupe', gi } }}
                      onDragOver={e => { e.preventDefault(); setDragOver(`g-${gi}`) }}
                      onDragLeave={() => setDragOver(null)}
                      onDrop={() => { reorderGroupes(gi); setDragOver(null) }}
                      style={{
                        display: 'flex', alignItems: 'center',
                        padding: '8px 12px 4px', fontSize: 11, fontWeight: 700,
                        letterSpacing: '0.1em', textTransform: 'uppercase',
                        color: dragOver === `g-${gi}` ? S.gold : 'rgba(201,168,76,0.55)',
                        borderTop: gi > 0 ? `1px solid ${S.border}` : 'none',
                        marginTop: gi > 0 ? 4 : 0,
                        cursor: editMode ? 'grab' : 'default',
                        background: dragOver === `g-${gi}` ? 'rgba(201,168,76,0.08)' : 'transparent',
                      }}
                    >
                      {editMode && <span style={handleStyle}>⠿</span>}
                      {editMode ? g.groupe : eqName(g.groupe)}
                    </div>
                    {g.categories.map((c, ci) => {
                      const fi = flatIndex[gi][ci]
                      const key = `${gi}-${ci}`
                      return (
                        <div
                          key={ci}
                          draggable={editMode}
                          onDragStart={() => { dragSrc.current = { type: 'cat', gi, ci } }}
                          onDragOver={e => { e.preventDefault(); setDragOver(`c-${gi}-${ci}`) }}
                          onDragLeave={() => setDragOver(null)}
                          onDrop={() => { reorderCats(gi, ci); setDragOver(null) }}
                          onClick={() => scrollTo(key, fi)}
                          style={{
                            display: 'flex', alignItems: 'center',
                            padding: '6px 12px 6px 18px', fontSize: 14,
                            cursor: editMode ? 'grab' : 'pointer',
                            color: activeKey === key ? S.gold : S.parchment,
                            background: dragOver === `c-${gi}-${ci}`
                              ? 'rgba(201,168,76,0.12)'
                              : activeKey === key ? 'rgba(201,168,76,0.1)' : 'transparent',
                            borderLeft: activeKey === key ? `3px solid ${S.gold}` : '3px solid transparent',
                            transition: 'background 0.1s',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}
                        >
                          {editMode && <span style={handleStyle}>⠿</span>}
                          {editMode ? c.categorie : eqName(c.categorie)}
                        </div>
                      )
                    })}
                    {editMode && (
                      <div style={{ padding: '4px 12px 4px 18px' }}>
                        <button onClick={() => addCatArme(gi)} style={{
                          width: '100%', padding: '3px', borderRadius: 3, fontSize: 12, cursor: 'pointer',
                          border: `1px dashed ${S.border}`, background: 'transparent', color: S.gold,
                        }}>{t('equipement.ajouterCategorie')}</button>
                      </div>
                    )}
                  </div>
                ))
                : armures.map((c, ci) => (
                  <div key={ci} onClick={() => scrollTo(`${ci}`, ci)} style={{
                    padding: '8px 12px', fontSize: 14, cursor: 'pointer',
                    color: activeKey === `${ci}` ? S.gold : S.parchment,
                    background: activeKey === `${ci}` ? 'rgba(201,168,76,0.1)' : 'transparent',
                    borderLeft: activeKey === `${ci}` ? `3px solid ${S.gold}` : '3px solid transparent',
                    transition: 'all 0.1s', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {eqName(c.categorie)}
                  </div>
                ))
              }
            </div>
            {editMode && (
              <div style={{ padding: '8px 10px', borderTop: `1px solid ${S.border}`, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {section === 'armes' && (
                  <button onClick={addGroupe} style={{
                    width: '100%', padding: '5px', borderRadius: 4, fontSize: 13, cursor: 'pointer',
                    border: `1px dashed rgba(180,130,255,0.4)`, background: 'transparent',
                    color: 'rgba(210,180,255,0.8)',
                  }}>{t('equipement.ajouterGroupe')}</button>
                )}
                {section === 'armures' && (
                  <button onClick={addCatArmure} style={{
                    width: '100%', padding: '5px', borderRadius: 4, fontSize: 13, cursor: 'pointer',
                    border: `1px dashed rgba(180,130,255,0.4)`, background: 'transparent',
                    color: 'rgba(210,180,255,0.8)',
                  }}>+ Catégorie</button>
                )}
              </div>
            )}
          </div>
          )}

          {/* Voile de fermeture du tiroir */}
          {isMobile && menuTypesOuvert && (
            <div onClick={() => setMenuTypesOuvert(false)}
              style={{ position: 'absolute', inset: 0, zIndex: 15, background: 'rgba(0,0,0,0.5)' }} />
          )}

          {/* Toutes les tables */}
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', padding: isMobile ? '0 10px 24px' : '0 18px 24px', minWidth: 0 }}>
            {/* Sur mobile, la liste occupe tout l'écran : ce bouton rappelle le menu des types. */}
            {isMobile && (
              <button onClick={() => setMenuTypesOuvert(true)} style={{
                position: 'sticky', top: 8, zIndex: 10, marginTop: 8,
                padding: '6px 14px', borderRadius: 5, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                border: `1px solid ${S.border}`, background: 'rgba(30,24,16,0.97)', color: S.gold,
              }}>☰ {t('equipement.types')}</button>
            )}
            {section === 'armes'
              ? groupes.map((g, gi) => (
                <div key={gi}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8,
                    paddingTop: gi === 0 ? 16 : 24, paddingBottom: 8,
                    borderTop: gi > 0 ? `2px solid rgba(201,168,76,0.2)` : 'none',
                  }}>
                    {editMode
                      ? <input value={g.groupe} onChange={e => renameGroupe(gi, e.target.value)}
                          style={{ ...inputStyle, fontSize: 16, color: S.gold, fontFamily: "'Cinzel', serif", fontWeight: 700, flex: 1 }} />
                      : <div style={{ fontFamily: "'Cinzel', serif", fontSize: 16, color: S.gold, fontWeight: 700, flex: 1 }}>{eqName(g.groupe)}</div>
                    }
                    {editMode && (
                      <button onClick={() => removeGroupe(gi)}
                        style={{ background: 'none', border: '1px solid rgba(220,80,80,0.4)', borderRadius: 3,
                          cursor: 'pointer', color: 'rgba(220,80,80,0.7)', fontSize: 12, padding: '2px 7px', flexShrink: 0 }}>
                        {t('equipement.supprimerGroupe')}
                      </button>
                    )}
                  </div>

                  {g.categories.map((cat, ci) => {
                    const fi = flatIndex[gi][ci]
                    const withPortee = isDistance(g.groupe)
                    return (
                      <div key={ci} ref={el => { sectionRefs.current[fi] = el }}
                        style={{ paddingBottom: 16, marginBottom: 16,
                          borderBottom: ci < g.categories.length - 1 ? `1px solid ${S.border}` : 'none' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          {editMode
                            ? <input value={cat.categorie} onChange={e => renameCatArme(gi, ci, e.target.value)}
                                style={{ ...inputStyle, fontSize: 14, color: S.gold, flex: 1 }} />
                            : <div style={{ fontSize: 14, color: S.gold, fontStyle: 'italic', flex: 1 }}>
                                {eqName(cat.categorie)}
                              </div>
                          }
                          {editMode && (
                            <button onClick={() => removeCatArme(gi, ci)}
                              style={{ background: 'none', border: '1px solid rgba(220,80,80,0.4)', borderRadius: 3,
                                cursor: 'pointer', color: 'rgba(220,80,80,0.7)', fontSize: 11, padding: '1px 6px', flexShrink: 0 }}>
                              ✕
                            </button>
                          )}
                        </div>
                        {renderArmeTable(cat, gi, ci, withPortee)}
                        {editMode && (
                          <textarea value={cat.notes ?? ''} onChange={e => updateArmeNotes(gi, ci, e.target.value)}
                            placeholder={t('equipement.notesBasPage')}
                            style={{ marginTop: 6, width: '100%', minHeight: 50, background: 'rgba(255,255,255,0.04)',
                              border: '1px solid rgba(201,168,76,0.2)', borderRadius: 4, resize: 'vertical',
                              color: S.parchment, fontSize: 13, padding: '6px 8px', outline: 'none',
                              fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box' }} />
                        )}
                        {!editMode && cat.notes && (
                          <div style={{ marginTop: 6, fontSize: 13, color: 'rgba(245,236,215,0.5)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                            {cat.notes}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))
              : armures.map((cat, ci) => {
                return (
                <div key={ci} ref={el => { sectionRefs.current[ci] = el }}
                  style={{ paddingTop: 20, paddingBottom: 20,
                    borderBottom: ci < armures.length - 1 ? `1px solid ${S.border}` : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    {editMode
                      ? <input value={cat.categorie} onChange={e => renameCatArmure(ci, e.target.value)}
                          style={{ ...inputStyle, fontSize: 15, color: S.gold, fontFamily: "'Cinzel', serif", fontWeight: 700, flex: 1 }} />
                      : <div style={{ fontFamily: "'Cinzel', serif", fontSize: 15, color: S.gold, flex: 1 }}>
                          {eqName(cat.categorie)}
                        </div>
                    }
                    {editMode && (
                      <button onClick={() => removeCatArmure(ci)}
                        style={{ background: 'none', border: '1px solid rgba(220,80,80,0.4)', borderRadius: 3,
                          cursor: 'pointer', color: 'rgba(220,80,80,0.7)', fontSize: 12, padding: '2px 7px' }}>✕</button>
                    )}
                  </div>
                  {renderArmureTable(cat, ci)}
                  {editMode && (
                    <textarea value={cat.notes ?? ''} onChange={e => updateArmureNotes(ci, e.target.value)}
                      placeholder={t('equipement.notesBasPage')}
                      style={{ marginTop: 8, width: '100%', minHeight: 60, background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(201,168,76,0.2)', borderRadius: 4, resize: 'vertical',
                        color: S.parchment, fontSize: 13, padding: '6px 8px', outline: 'none',
                        fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box' }} />
                  )}
                  {!editMode && cat.notes && (
                    <div style={{ marginTop: 8, fontSize: 13, color: 'rgba(245,236,215,0.5)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                      {cat.notes}
                    </div>
                  )}
                </div>
              )})
            }

            {/* Notes globales */}
            {editMode && (
              <div style={{ paddingTop: 20, borderTop: `1px solid ${S.border}` }}>
                <div style={{ fontSize: 13, color: S.gold, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
                  {t('equipement.notesPage')}
                </div>
                <textarea
                  value={section === 'armes' ? armesNotes : armuresNotes}
                  onChange={e => section === 'armes' ? setArmesNotes(e.target.value) : setArmuresNotes(e.target.value)}
                  placeholder={t('equipement.notesSection')}
                  style={{ width: '100%', minHeight: 80, background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(201,168,76,0.2)', borderRadius: 4, resize: 'vertical',
                    color: S.parchment, fontSize: 13, padding: '6px 8px', outline: 'none',
                    fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box' }}
                />
              </div>
            )}
            {!editMode && (section === 'armes' ? armesNotes : armuresNotes) && (
              <div style={{ paddingTop: 16, borderTop: `1px solid ${S.border}`,
                fontSize: 13, color: 'rgba(245,236,215,0.5)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                {section === 'armes' ? armesNotes : armuresNotes}
              </div>
            )}
          </div>
        </div>

        {/* ── Footer récap ── */}
        {!editMode && character && (character.armes.length > 0 || character.armuresEquipees.length > 0) && (
          <div style={{ borderTop: `1px solid ${S.border}`, padding: '10px 20px',
            flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 200, overflowY: 'auto' }}>

            {/* Armes */}
            {character.armes.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: S.gold, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>{t('equipement.armes')}</div>
                {/* Tags avec ✕ */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                  {character.armes.map((a, i) => {
                    const slot = stripExposants(character.arme1) === stripExposants(a.nom) ? 1 : stripExposants(character.arme2) === stripExposants(a.nom) ? 2 : stripExposants(character.arme3) === stripExposants(a.nom) ? 3 : null
                    return (
                      <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '2px 8px', borderRadius: 3, fontSize: 14,
                        background: slot ? 'rgba(100,160,255,0.12)' : 'rgba(201,168,76,0.12)',
                        border: `1px solid ${slot ? 'rgba(100,160,255,0.3)' : S.border}`,
                        color: slot ? 'rgba(100,160,255,0.9)' : S.parchment }}>
                        {slot && <span style={{ fontSize: 11, opacity: 0.7 }}>E{slot} ·</span>}
                        {a.nom} <span style={{ opacity: 0.5 }}>{a.dm}</span>
                        <button onClick={() => removeArme(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(220,80,80,0.7)', fontSize: 14, padding: 0, lineHeight: 1 }}>✕</button>
                      </span>
                    )
                  })}
                </div>
                {/* Slots d'équipement */}
                {([1, 2, 3] as const).map(slot => {
                  const current = armeSlotValue(slot)
                  const label   = t('equipement.emplacement', { n: slot })
                  const color   = 'rgba(100,160,255,0.8)'
                  const slotBloque = slot === 2 && !!character.arme1 && is2H(character.arme1)
                  return (
                    <div key={slot} style={{ marginBottom: 4, opacity: slotBloque ? 0.4 : 1 }}>
                      <div style={{ fontSize: 11, color, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer', color: S.parchment }}>
                          <input type="radio" name={`arme-slot-${slot}`} checked={!current} onChange={() => equipeArmeSlot(null, slot)} style={{ accentColor: color }} />
                          {t('equipement.aucune')}
                        </label>
                        {character.armes.map((a, i) => {
                          const takenByOther = ([1, 2, 3] as const)
                            .filter(s => s !== slot)
                            .some(s => stripExposants(armeSlotValue(s)) === stripExposants(a.nom))
                          const isCurrent   = stripExposants(current) === stripExposants(a.nom)
                          const disabled = takenByOther || slotBloque || (slot === 2 && is2H(a.nom))
                          return (
                            <label key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13,
                              cursor: disabled ? 'not-allowed' : 'pointer',
                              opacity: disabled && !takenByOther ? 0.4 : 1,
                              color: isCurrent ? color : S.parchment }}>
                              <input type="radio" name={`arme-slot-${slot}`}
                                checked={isCurrent}
                                disabled={disabled}
                                onChange={() => equipeArmeSlot(a.nom, slot)}
                                style={{ accentColor: color }} />
                              {a.nom} <span style={{ opacity: 0.5, fontSize: 12 }}>{a.dm}</span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Armure portée */}
            {armuresSeules.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: 'rgba(100,160,255,0.8)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>{t('equipement.armurePortee')}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer', color: S.parchment }}>
                    <input type="radio" name="armure-portee" checked={armurePortee === null} onChange={() => equipeArmure(null)} style={{ accentColor: 'rgba(100,160,255,0.8)' }} />
                    {t('equipement.aucune')}
                  </label>
                  {armuresSeules.map((a, i) => (
                    <label key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer',
                      color: armurePortee === a.nom ? 'rgba(100,160,255,0.9)' : S.parchment }}>
                      <input type="radio" name="armure-portee" checked={armurePortee === a.nom} onChange={() => equipeArmure(a.nom)} style={{ accentColor: 'rgba(100,160,255,0.8)' }} />
                      {a.nom} <span style={{ opacity: 0.5, fontSize: 12 }}>DEF +{a.def}</span>
                      <button onClick={() => removeArmure(character.armuresEquipees.indexOf(a))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(220,80,80,0.7)', fontSize: 12, padding: 0, lineHeight: 1 }}>✕</button>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Bouclier porté */}
            {boucliersSeuls.length > 0 && (() => {
              const boucliersBloques = !!character.arme1 && is2H(character.arme1)
              return (
              <div>
                <div style={{ fontSize: 11, color: 'rgba(100,160,255,0.8)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>{t('equipement.bouclierPorte')}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer', color: S.parchment }}>
                    <input type="radio" name="bouclier-porte" checked={bouclierPorte === null} onChange={() => equipeBouclier(null)} style={{ accentColor: 'rgba(100,160,255,0.8)' }} />
                    {t('equipement.aucun')}
                  </label>
                  {boucliersSeuls.map((a, i) => (
                    <label key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13,
                      cursor: boucliersBloques ? 'not-allowed' : 'pointer',
                      opacity: boucliersBloques && bouclierPorte !== a.nom ? 0.4 : 1,
                      color: bouclierPorte === a.nom ? 'rgba(100,160,255,0.9)' : S.parchment }}>
                      <input type="radio" name="bouclier-porte" checked={bouclierPorte === a.nom} disabled={boucliersBloques}
                        onChange={() => equipeBouclier(a.nom)} style={{ accentColor: 'rgba(100,160,255,0.8)' }} />
                      {a.nom} <span style={{ opacity: 0.5, fontSize: 12 }}>DEF +{a.def}</span>
                      <button onClick={() => removeArmure(character.armuresEquipees.indexOf(a))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(220,80,80,0.7)', fontSize: 12, padding: 0, lineHeight: 1 }}>✕</button>
                    </label>
                  ))}
                </div>
              </div>
              )
            })()}
          </div>
        )}

        {/* ── Footer édition ── */}
        {editMode && (
          <div style={{ borderTop: `1px solid ${S.border}`, padding: '8px 20px', flexShrink: 0,
            fontSize: 11, color: 'rgba(245,236,215,0.35)' }}>
            <Trans i18nKey="equipement.infoEdition" values={{ section }} components={{ code: <code /> }} />
          </div>
        )}
      </div>
    </div>
  )
}
