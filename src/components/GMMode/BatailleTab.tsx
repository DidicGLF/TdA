import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useGameData } from '../../context/GameDataContext'
import { saveDataFile } from '../../utils/tauriStorage'
import batailleBg from '../../assets/bataille-gold.png'
import {
  DES_ADVERSITE, appliquerRecuperation, appliquerResultatAttaque, appliquerResultatEvenement, appliquerTestDefense,
  ajusterPointsBataille, bonusAttaque, bonusPosition, creerBataille, definirPosition, deltaSuccesAttaque,
  importerPionPJ, jouerEvenement, retirerEvenementDeJeu, retirerPion, seuilSucces, tailleDepuisNombreUnites,
  terrainPourPosition, tourSuivant, victoireAtteinte,
} from '../../utils/bataille'
import type {
  BatailleSession, BatailleSessionSauvegardee, BatailleTemplate, DeAdversite, EffetEvenement, EtatAttaque,
  EvenementBataille, PionPJ, PositionBataille, ResultatTestDefense, TerrainBataille, TypeAttaque, TypeEffetEvenement,
} from '../../utils/bataille'
import type { Character } from '../../types/character'
import type { BestiaireEntry, RencontreSauvegardee } from '../../types/gameData'

const GOLD = '#c9a84c'
const PARCHMENT = '#f5ecd7'
const SECTION_BORDER = 'rgba(201,168,76,0.2)'
// Couleur du bonus/malus de position affiché sur le bloc PJ (voir PionCard) — bascule vert/rouge
// selon son signe, pour le distinguer des scores de base (DEF/ATQ) qui restent en ton neutre.
const BONUS_POSITIF = 'rgba(120,220,140,0.9)'
const BONUS_NEGATIF = 'rgba(230,110,110,0.9)'
// Couleurs du détail du jet de défense (voir dernierTestDefense dans PionCard) : chaque terme de la
// formule a sa propre teinte pour repérer d'où vient chaque nombre en un coup d'œil.
const DEF_COLOR = 'rgba(120,170,230,0.9)'
const DIFF_COLOR = 'rgba(190,150,230,0.9)'

// Tailles augmentées à la demande sur la page des paramètres (constructeur avant lancement) — inputStyle/
// selectStyle/sectionTitleStyle/removeBtnStyle n'y sont utilisés que là (leurs rares usages ailleurs,
// comme le select de type d'attaque dans PionCard, ont déjà leur propre fontSize explicite qui l'emporte).
const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 4,
  color: PARCHMENT, fontSize: 16, padding: '7px 10px', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
}
// Fond opaque : sur Windows, la liste déroulante d'un <select> est un popup natif hors de la
// page — un fond translucide (comme sur inputStyle) y est composité sur blanc au lieu du thème sombre.
const selectStyle: React.CSSProperties = { ...inputStyle, background: 'var(--tdr-dark)' }
const optionStyle: React.CSSProperties = { background: 'var(--tdr-dark)', color: PARCHMENT }
// labelStyle reste inchangé : utilisé aussi dans les Compteurs de la session active (hors page des
// paramètres) — voir builderLabelStyle ci-dessous pour la variante agrandie réservée au constructeur.
const labelStyle: React.CSSProperties = {
  fontSize: 11, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4, display: 'block',
}
const builderLabelStyle: React.CSSProperties = { ...labelStyle, fontSize: 14 }
const sectionTitleStyle: React.CSSProperties = {
  fontSize: 17, fontWeight: 700, color: GOLD, fontFamily: "'Cinzel', serif", letterSpacing: '0.04em',
  borderBottom: `1px solid ${SECTION_BORDER}`, paddingBottom: 6, marginBottom: 12,
}
const btnStyle: React.CSSProperties = {
  background: 'transparent', border: '1px solid rgba(201,168,76,0.4)', borderRadius: 4,
  color: 'rgba(245,236,215,0.8)', cursor: 'pointer', fontSize: 15, padding: '6px 12px',
}
const removeBtnStyle: React.CSSProperties = {
  background: 'transparent', border: '1px solid rgba(255,80,80,0.3)', borderRadius: 4,
  color: 'rgba(255,110,110,0.8)', cursor: 'pointer', fontSize: 14, padding: '4px 8px', flexShrink: 0,
}
// Petits boutons +/- pour l'ajustement manuel des PV par le MJ (voir PionCard) — mêmes proportions que
// les boutons +/- de Points de bataille déjà présents dans l'en-tête d'une session active.
const pvBtnStyle: React.CSSProperties = {
  background: 'transparent', border: `1px solid ${SECTION_BORDER}`, borderRadius: 4,
  color: 'rgba(245,236,215,0.7)', cursor: 'pointer', fontSize: 14, padding: '1px 7px', lineHeight: 1.4,
}
// Bouton d'état d'attaque (voir PionCard) — vert pour les 2 issues qui font gagner des succès,
// rouge pour les 2 qui en font perdre ou n'en rapportent aucun, cohérent avec BONUS_POSITIF/NEGATIF.
const etatAttaqueBtnStyle = (positif: boolean, verrouille: boolean): React.CSSProperties => ({
  background: 'transparent', borderRadius: 4, cursor: verrouille ? 'default' : 'pointer', fontSize: 14,
  padding: '5px 4px', textAlign: 'center', opacity: verrouille ? 0.35 : 1,
  border: `1px solid ${positif ? 'rgba(120,220,140,0.4)' : 'rgba(230,110,110,0.4)'}`,
  color: positif ? BONUS_POSITIF : BONUS_NEGATIF,
})

const genId = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : String(Date.now())

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

const POSITIONS: PositionBataille[] = ['premiereLigne', 'tenirLeRang', 'enRetrait', 'arriere']
const TERRAINS: TerrainBataille[] = ['aucun', 'leger', 'lourd']
const EFFETS: TypeEffetEvenement[] = ['points', 'intensite', 'soins']

interface Props {
  // Bouton « Lancer la rencontre » d'un événement combat (menu de la session active) : absent (donc
  // masqué) si l'appelant n'a pas de quoi basculer vers l'onglet Adversité. Contrairement au
  // onPlayRencontre partagé par NotesTab (liens [[Rencontre]], simple navigation sans retour), celui-ci
  // reçoit aussi l'instantané de bataille tout juste sauvegardé — GMDashboard s'en souvient pour ramener
  // le MJ ici (reprendreAuto ci-dessous) une fois le combat terminé, plutôt que vers le générateur
  // d'adversité comme pour une rencontre lancée normalement.
  onPlayRencontre?: (r: RencontreSauvegardee, snapshot: BatailleSessionSauvegardee) => void
  // Bataille à reprendre automatiquement au retour d'un combat lancé depuis un de ses événements (voir
  // onPlayRencontre ci-dessus et GMDashboard) — absent en usage normal.
  reprendreAuto?: BatailleSessionSauvegardee | null
  // Prévient GMDashboard que reprendreAuto vient d'être appliqué, pour qu'il l'efface de son côté —
  // sinon, un retour ultérieur et sans rapport sur cet onglet (l'instantané n'a jamais été réinitialisé
  // par le parent) rechargerait cette même bataille à chaque fois, écrasant toute progression entre
  // temps. Notifié après coup via useEffect plutôt que pendant le rendu : modifier l'état d'un composant
  // PARENT pendant le rendu d'un enfant est interdit par React (seul son PROPRE état peut l'être, voir
  // dernierReprendreAuto ci-dessous).
  onReprendreAutoConsomme?: () => void
}

export default function BatailleTab({ onPlayRencontre, reprendreAuto, onReprendreAutoConsomme }: Props) {
  const { t } = useTranslation()
  const {
    data: descriptions, bestiaire, rencontres, batailles, setBatailles, batailleTemplates, setBatailleTemplates,
  } = useGameData()

  // ── Paramètres du constructeur (avant de lancer la bataille) ──
  const [nom, setNom] = useState('')
  const [nombreUnitesArmeePJ, setNombreUnitesArmeePJ] = useState(100)
  const [nombreUnitesArmeeEnnemie, setNombreUnitesArmeeEnnemie] = useState(100)
  const tailleArmeePJ = tailleDepuisNombreUnites(nombreUnitesArmeePJ)
  const tailleArmeeEnnemie = tailleDepuisNombreUnites(nombreUnitesArmeeEnnemie)
  const [adversite, setAdversite] = useState<DeAdversite>(6)
  const [defEnnemieMoyenne, setDefEnnemieMoyenne] = useState(14)
  const [bonusAtqEnnemiMoyen, setBonusAtqEnnemiMoyen] = useState(4)
  const [creatureTypeNom, setCreatureTypeNom] = useState('')
  // Terrain par position plutôt qu'un seul champ global — une barricade légère "tenant le rang" et
  // une lourde "en retrait" (ou l'inverse) peuvent coexister, voir terrainPourPosition dans bataille.ts.
  const [terrainTenirLeRang, setTerrainTenirLeRang] = useState<TerrainBataille>('aucun')
  const [terrainEnRetrait, setTerrainEnRetrait] = useState<TerrainBataille>('aucun')
  const [intensiteDepart, setIntensiteDepart] = useState(5)
  // Condition de victoire : l'intensité à 0 gagne toujours (pas de champ à saisir, voir victoireAtteinte
  // dans bataille.ts) — victoirePointsActive/victoirePointsSeuil ajoutent une voie de victoire
  // additionnelle optionnelle par points de bataille, séparés en 2 states pour garder la valeur saisie
  // même quand la case est décochée (évite de perdre le réglage du MJ en cochant/décochant).
  const [victoirePointsActive, setVictoirePointsActive] = useState(false)
  const [victoirePointsSeuil, setVictoirePointsSeuil] = useState(10)
  // Événements de la bataille : combat (renvoie vers une rencontre déjà créée dans le générateur
  // d'adversité) ou narratif (nom + description libres) — voir EvenementBataille dans bataille.ts.
  // Un effet (type + valeur) est configuré séparément pour le succès et pour l'échec — voir EffetEvenement.
  const [evenements, setEvenements] = useState<EvenementBataille[]>([])
  // Id de l'événement en cours de modification (voir modifierEvenement) — null tant qu'aucune édition
  // n'est en cours, auquel cas les deux formulaires d'ajout ci-dessous créent un nouvel événement au
  // lieu de mettre celui-ci à jour.
  const [editingEvenementId, setEditingEvenementId] = useState<string | null>(null)
  const [nouvelEvenementRencontreId, setNouvelEvenementRencontreId] = useState('')
  const [nouvelEvenementCombatEffetSucces, setNouvelEvenementCombatEffetSucces] = useState<EffetEvenement>({ type: 'points', valeur: 1 })
  const [nouvelEvenementCombatEffetEchec, setNouvelEvenementCombatEffetEchec] = useState<EffetEvenement>({ type: 'points', valeur: 0 })
  const [nouvelEvenementNom, setNouvelEvenementNom] = useState('')
  const [nouvelEvenementDescription, setNouvelEvenementDescription] = useState('')
  const [nouvelEvenementNarratifEffetSucces, setNouvelEvenementNarratifEffetSucces] = useState<EffetEvenement>({ type: 'points', valeur: 1 })
  const [nouvelEvenementNarratifEffetEchec, setNouvelEvenementNarratifEffetEchec] = useState<EffetEvenement>({ type: 'points', valeur: 0 })
  const [limiterRecuperation, setLimiterRecuperation] = useState(false)
  const [pionsEnConstruction, setPionsEnConstruction] = useState<PionPJ[]>([])
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // ── Session active ──
  const [session, setSession] = useState<BatailleSession | null>(null)
  const [snapshotId, setSnapshotId] = useState<string | null>(null)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [confirmDeleteTemplateId, setConfirmDeleteTemplateId] = useState<string | null>(null)
  const [colonneSurvolee, setColonneSurvolee] = useState<PositionBataille | null>(null)
  // Fermeture manuelle de l'overlay de victoire (voir rendu de la session active) — remis à false à
  // chaque nouvelle session (lancerBataille/reprendre/jouerTemplate) pour qu'il puisse réapparaître.
  const [victoireOverlayFermee, setVictoireOverlayFermee] = useState(false)
  // Menu des cartes événement (réserve + résolues) — voir jouerEvenement/retirerEvenementDeJeu dans
  // bataille.ts pour le cycle de vie complet d'une carte.
  const [menuEvenementsOuvert, setMenuEvenementsOuvert] = useState(false)

  const creaturesTriees = useMemo(
    () => [...bestiaire].sort((a, b) => a.nom.localeCompare(b.nom)),
    [bestiaire],
  )

  // Bonus d'attaque "moyen" tiré d'une créature du bestiaire : le plus haut bonus parmi ses attaques
  // (même logique que le style de combat privilégié d'un PJ importé, voir importerPionPJ) — les bonus
  // y sont au format texte signé ("+22"), jamais garanti présent ni numérique.
  const bonusAttaqueCreature = (attaques: BestiaireEntry['attaques']): number | null => {
    if (!attaques || attaques.length === 0) return null
    const bonus = attaques
      .map(a => (a.bonus ? parseInt(a.bonus.replace(/\s/g, '')) : NaN))
      .filter(n => !Number.isNaN(n))
    return bonus.length > 0 ? Math.max(...bonus) : null
  }

  const selectionnerCreatureType = (nom: string) => {
    setCreatureTypeNom(nom)
    const creature = bestiaire.find(c => c.nom === nom)
    if (!creature) return
    if (creature.def !== undefined) setDefEnnemieMoyenne(creature.def)
    const bonus = bonusAttaqueCreature(creature.attaques)
    if (bonus !== null) setBonusAtqEnnemiMoyen(bonus)
  }

  const handleFiles = async (files: FileList) => {
    const nouveaux: PionPJ[] = []
    for (const file of Array.from(files)) {
      try {
        const text = await file.text()
        const parsed = JSON.parse(text)
        const entries = Array.isArray(parsed) ? parsed : [parsed]
        for (const entry of entries) {
          const character: Character | undefined = entry?.character ?? (entry?.caracteristiques ? entry : undefined)
          if (character) nouveaux.push(importerPionPJ(character, descriptions))
        }
      } catch { /* fichier invalide, ignoré */ }
    }
    if (nouveaux.length > 0) setPionsEnConstruction(prev => [...prev, ...nouveaux])
  }

  // editingEvenementId ne déclenche une mise à jour que si l'événement visé est bien du type de ce
  // formulaire — sinon (édition en cours dans l'AUTRE formulaire) ce bouton crée un nouvel événement
  // comme d'habitude, sans perturber l'édition en cours ailleurs.
  const ajouterEvenementCombat = () => {
    if (!nouvelEvenementRencontreId) return
    const evenementEnEdition = evenements.find(e => e.id === editingEvenementId && e.type === 'combat')
    if (evenementEnEdition) {
      setEvenements(prev => prev.map(e => e.id === editingEvenementId
        ? {
            id: e.id, resultat: e.resultat, enJeu: e.enJeu, type: 'combat', rencontreId: nouvelEvenementRencontreId,
            effetSucces: nouvelEvenementCombatEffetSucces, effetEchec: nouvelEvenementCombatEffetEchec,
          }
        : e))
      setEditingEvenementId(null)
    } else {
      setEvenements(prev => [...prev, {
        id: genId(), resultat: null, enJeu: false, type: 'combat', rencontreId: nouvelEvenementRencontreId,
        effetSucces: nouvelEvenementCombatEffetSucces, effetEchec: nouvelEvenementCombatEffetEchec,
      }])
    }
    setNouvelEvenementRencontreId('')
    setNouvelEvenementCombatEffetSucces({ type: 'points', valeur: 1 })
    setNouvelEvenementCombatEffetEchec({ type: 'points', valeur: 0 })
  }

  const ajouterEvenementNarratif = () => {
    if (!nouvelEvenementNom.trim()) return
    const evenementEnEdition = evenements.find(e => e.id === editingEvenementId && e.type === 'narratif')
    if (evenementEnEdition) {
      setEvenements(prev => prev.map(e => e.id === editingEvenementId
        ? {
            id: e.id, resultat: e.resultat, enJeu: e.enJeu, type: 'narratif',
            nom: nouvelEvenementNom.trim(), description: nouvelEvenementDescription.trim(),
            effetSucces: nouvelEvenementNarratifEffetSucces, effetEchec: nouvelEvenementNarratifEffetEchec,
          }
        : e))
      setEditingEvenementId(null)
    } else {
      setEvenements(prev => [...prev, {
        id: genId(), resultat: null, enJeu: false, type: 'narratif',
        nom: nouvelEvenementNom.trim(), description: nouvelEvenementDescription.trim(),
        effetSucces: nouvelEvenementNarratifEffetSucces, effetEchec: nouvelEvenementNarratifEffetEchec,
      }])
    }
    setNouvelEvenementNom('')
    setNouvelEvenementDescription('')
    setNouvelEvenementNarratifEffetSucces({ type: 'points', valeur: 1 })
    setNouvelEvenementNarratifEffetEchec({ type: 'points', valeur: 0 })
  }

  const modifierEvenement = (ev: EvenementBataille) => {
    setEditingEvenementId(ev.id)
    if (ev.type === 'combat') {
      setNouvelEvenementRencontreId(ev.rencontreId)
      setNouvelEvenementCombatEffetSucces(ev.effetSucces)
      setNouvelEvenementCombatEffetEchec(ev.effetEchec)
    } else {
      setNouvelEvenementNom(ev.nom)
      setNouvelEvenementDescription(ev.description)
      setNouvelEvenementNarratifEffetSucces(ev.effetSucces)
      setNouvelEvenementNarratifEffetEchec(ev.effetEchec)
    }
  }

  const annulerModificationEvenement = () => {
    setEditingEvenementId(null)
    setNouvelEvenementRencontreId('')
    setNouvelEvenementCombatEffetSucces({ type: 'points', valeur: 1 })
    setNouvelEvenementCombatEffetEchec({ type: 'points', valeur: 0 })
    setNouvelEvenementNom('')
    setNouvelEvenementDescription('')
    setNouvelEvenementNarratifEffetSucces({ type: 'points', valeur: 1 })
    setNouvelEvenementNarratifEffetEchec({ type: 'points', valeur: 0 })
  }

  const supprimerEvenement = (id: string) => {
    setEvenements(prev => prev.filter(e => e.id !== id))
    if (editingEvenementId === id) annulerModificationEvenement()
  }

  const lancerBataille = () => {
    if (!nom.trim() || pionsEnConstruction.length === 0) return
    setSession(creerBataille({
      nom: nom.trim(), tailleArmeePJ, tailleArmeeEnnemie, adversite, defEnnemieMoyenne, bonusAtqEnnemiMoyen,
      terrainParPosition: { tenirLeRang: terrainTenirLeRang, enRetrait: terrainEnRetrait },
      intensite: intensiteDepart, seuilVictoirePoints: victoirePointsActive ? victoirePointsSeuil : null,
      evenements, limiterRecuperation, pions: pionsEnConstruction,
    }))
    setSnapshotId(null)
    setVictoireOverlayFermee(false)
  }

  // Export générique (fichier local via Tauri, sinon téléchargement navigateur) — partagé par les
  // instantanés de session (exporter) et les gabarits de bataille (exporterTemplate) ci-dessous.
  const exporterJSON = async (contenu: unknown, nomPourFichier: string) => {
    const content = JSON.stringify(contenu, null, 2)
    const safe = nomPourFichier.replace(/[^a-zA-Z0-9À-ÿ _-]/g, '').trim().replace(/\s+/g, '-') || 'bataille'
    const filename = `${safe}.json`
    if (isTauri) {
      await saveDataFile(filename, content)
      setSaveMsg(t('gmMode.batailleMasse.exporteVers', { filename }))
      setTimeout(() => setSaveMsg(null), 3000)
    } else {
      const blob = new Blob([content], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = filename; a.click()
      URL.revokeObjectURL(url)
    }
  }

  const sauvegarderSnapshot = () => {
    if (!session) return
    const id = snapshotId ?? genId()
    const entry: BatailleSessionSauvegardee = { ...session, id, creeLe: new Date().toISOString() }
    setBatailles(prev => snapshotId ? prev.map(b => b.id === id ? entry : b) : [...prev, entry])
    setSnapshotId(id)
    setSaveMsg(t('gmMode.batailleMasse.instantaneEnregistre'))
    setTimeout(() => setSaveMsg(null), 2500)
  }

  const reprendre = (b: BatailleSessionSauvegardee) => {
    setSession(JSON.parse(JSON.stringify(b)) as BatailleSession)
    setSnapshotId(b.id)
    setVictoireOverlayFermee(false)
  }

  // Reprise automatique au retour d'un combat lancé depuis un événement (voir Props.reprendreAuto) —
  // ajusté pendant le rendu plutôt que dans un effet (même pattern que demarrerAuto dans AdversiteTab)
  // pour ne réagir qu'au changement d'instantané transmis, pas à chaque re-render.
  const [dernierReprendreAuto, setDernierReprendreAuto] = useState<BatailleSessionSauvegardee | null | undefined>(undefined)
  if (reprendreAuto !== dernierReprendreAuto) {
    setDernierReprendreAuto(reprendreAuto)
    if (reprendreAuto) reprendre(reprendreAuto)
  }
  useEffect(() => {
    if (reprendreAuto) onReprendreAutoConsomme?.()
    // Ne doit réagir qu'au changement de reprendreAuto lui-même, pas à onReprendreAutoConsomme (identité
    // potentiellement instable côté parent d'un render à l'autre, ce qui redéclencherait l'effet sans
    // rapport avec une vraie reprise).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reprendreAuto])

  const supprimer = (id: string) => {
    setBatailles(prev => prev.filter(b => b.id !== id))
    setConfirmDeleteId(null)
  }

  const exporter = (b: BatailleSessionSauvegardee) => exporterJSON(b, b.nom)

  // ── Gabarits de bataille : configuration réutilisable (voir BatailleTemplate), distincte des
  // instantanés ci-dessus qui figent une bataille déjà lancée. Même principe que les rencontres du
  // générateur d'adversité (créer/modifier/jouer/exporter/supprimer). ──
  const sauvegarderTemplate = () => {
    if (!nom.trim() || pionsEnConstruction.length === 0) return
    const id = editingTemplateId ?? genId()
    const entry: BatailleTemplate = {
      id, nom: nom.trim(), nombreUnitesArmeePJ, nombreUnitesArmeeEnnemie, creatureTypeNom,
      adversite, defEnnemieMoyenne, bonusAtqEnnemiMoyen,
      terrainParPosition: { tenirLeRang: terrainTenirLeRang, enRetrait: terrainEnRetrait }, intensiteDepart,
      seuilVictoirePoints: victoirePointsActive ? victoirePointsSeuil : null, evenements,
      limiterRecuperation, pions: pionsEnConstruction, creeLe: new Date().toISOString(),
    }
    setBatailleTemplates(prev => editingTemplateId ? prev.map(b => b.id === id ? entry : b) : [...prev, entry])
    setEditingTemplateId(id)
    setSaveMsg(t('gmMode.batailleMasse.templateEnregistre'))
    setTimeout(() => setSaveMsg(null), 2500)
  }

  const modifierTemplate = (tpl: BatailleTemplate) => {
    setNom(tpl.nom)
    setNombreUnitesArmeePJ(tpl.nombreUnitesArmeePJ)
    setNombreUnitesArmeeEnnemie(tpl.nombreUnitesArmeeEnnemie)
    setCreatureTypeNom(tpl.creatureTypeNom)
    setAdversite(tpl.adversite)
    setDefEnnemieMoyenne(tpl.defEnnemieMoyenne)
    setBonusAtqEnnemiMoyen(tpl.bonusAtqEnnemiMoyen)
    setTerrainTenirLeRang(tpl.terrainParPosition.tenirLeRang)
    setTerrainEnRetrait(tpl.terrainParPosition.enRetrait)
    setIntensiteDepart(tpl.intensiteDepart)
    setVictoirePointsActive(tpl.seuilVictoirePoints !== null)
    if (tpl.seuilVictoirePoints !== null) setVictoirePointsSeuil(tpl.seuilVictoirePoints)
    setEvenements(tpl.evenements.map(e => ({ ...e })))
    setLimiterRecuperation(tpl.limiterRecuperation)
    setPionsEnConstruction(tpl.pions.map(p => ({ ...p })))
    setEditingTemplateId(tpl.id)
    annulerModificationEvenement()
  }

  const nouvelleBataille = () => {
    setEditingTemplateId(null)
    setNom('')
    setEvenements([])
    setPionsEnConstruction([])
    annulerModificationEvenement()
  }

  const supprimerTemplate = (id: string) => {
    setBatailleTemplates(prev => prev.filter(b => b.id !== id))
    if (editingTemplateId === id) nouvelleBataille()
    setConfirmDeleteTemplateId(null)
  }

  const exporterTemplate = (tpl: BatailleTemplate) => exporterJSON(tpl, tpl.nom)

  const jouerTemplate = (tpl: BatailleTemplate) => {
    setSession(creerBataille({
      nom: tpl.nom, tailleArmeePJ: tailleDepuisNombreUnites(tpl.nombreUnitesArmeePJ),
      tailleArmeeEnnemie: tailleDepuisNombreUnites(tpl.nombreUnitesArmeeEnnemie),
      adversite: tpl.adversite, defEnnemieMoyenne: tpl.defEnnemieMoyenne, bonusAtqEnnemiMoyen: tpl.bonusAtqEnnemiMoyen,
      terrainParPosition: tpl.terrainParPosition, intensite: tpl.intensiteDepart, seuilVictoirePoints: tpl.seuilVictoirePoints,
      evenements: tpl.evenements.map(e => ({ ...e })),
      limiterRecuperation: tpl.limiterRecuperation, pions: JSON.parse(JSON.stringify(tpl.pions)) as PionPJ[],
    }))
    setSnapshotId(null)
    setVictoireOverlayFermee(false)
  }

  // ── Actions sur la session active ──
  const deposerPion = (e: React.DragEvent, position: PositionBataille) => {
    e.preventDefault()
    setColonneSurvolee(null)
    const pionId = e.dataTransfer.getData('text/plain')
    if (pionId) setSession(s => s && definirPosition(s, pionId, position))
  }

  const changerTypeAttaque = (pionId: string, typeAttaque: TypeAttaque) => {
    setSession(s => s && { ...s, pions: s.pions.map(p => p.id === pionId ? { ...p, typeAttaque } : p) })
  }

  const enregistrerResultatAttaque = (pionId: string, etat: EtatAttaque) => {
    setSession(s => s && appliquerResultatAttaque(s, pionId, etat))
  }

  const testerDefenseSur = (pionId: string) => {
    setSession(s => s ? appliquerTestDefense(s, pionId).session : s)
  }

  const recupererSur = (pionId: string) => {
    setSession(s => s && appliquerRecuperation(s, pionId, 5))
  }

  const retirerPionActif = (pionId: string) => {
    setSession(s => s && retirerPion(s, pionId))
  }

  const resoudreEvenement = (evenementId: string, resultat: 'succes' | 'echec') => {
    setSession(s => s && appliquerResultatEvenement(s, evenementId, resultat))
  }

  const jouerCarteEvenement = (evenementId: string) => {
    setSession(s => s && jouerEvenement(s, evenementId))
  }

  const retirerCarteDeJeu = (evenementId: string) => {
    setSession(s => s && retirerEvenementDeJeu(s, evenementId))
  }

  // Bouton « Lancer la rencontre » d'un événement combat : joue la carte (comme jouerCarteEvenement),
  // sauvegarde un instantané de la bataille dans son état actuel (même logique que sauvegarderSnapshot,
  // mais sur l'état déjà mis à jour — pas celui, périmé, encore dans la closure via l'updater de
  // setSession) puis bascule sur l'onglet Adversité pour démarrer le combat. L'instantané transmis à
  // onPlayRencontre permet à GMDashboard de ramener automatiquement le MJ ici, cette bataille reprise,
  // une fois le combat terminé (voir reprendreAuto) — la carte déjà en jeu, prête à résoudre.
  const lancerRencontreEvenement = (evenement: EvenementBataille & { type: 'combat' }) => {
    if (!session || !onPlayRencontre) return
    const rencontre = rencontres.find(r => r.id === evenement.rencontreId)
    if (!rencontre) return
    const sessionMiseAJour = jouerEvenement(session, evenement.id)
    setSession(sessionMiseAJour)
    const id = snapshotId ?? genId()
    const entry: BatailleSessionSauvegardee = { ...sessionMiseAJour, id, creeLe: new Date().toISOString() }
    setBatailles(prev => snapshotId ? prev.map(b => b.id === id ? entry : b) : [...prev, entry])
    setSnapshotId(id)
    onPlayRencontre(rencontre, entry)
  }

  const ajusterPV = (pionId: string, delta: number) => {
    setSession(s => s && {
      ...s,
      pions: s.pions.map(p => p.id === pionId ? { ...p, pvActuels: Math.max(0, Math.min(p.pvMax, p.pvActuels + delta)) } : p),
    })
  }

  // Fond décoratif — même traitement que les autres onglets MJ (Adversité, Bestiaire), plus
  // backgroundAttachment: 'fixed' : sans ça, "cover" recalcule sa mise à l'échelle à chaque fois que ce
  // conteneur grandit (ajout d'un événement, d'un PJ...) puisque son propre cadre est ce qu'il "couvre" —
  // l'image semblait alors sauter/zoomer à chaque ajout. "fixed" ancre le calcul de "cover" au viewport
  // (toujours stable) plutôt qu'au cadre grandissant de ce panneau ; le calque reste position:absolute
  // (pas position:fixed) donc continue de défiler avec le contenu comme avant, seule l'image sous-jacente
  // ne rescale plus.
  const backgroundLayer = (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 0,
      backgroundImage: `url(${batailleBg})`, backgroundSize: 'cover', backgroundRepeat: 'no-repeat',
      backgroundPosition: 'center', backgroundAttachment: 'fixed', opacity: 0.08, pointerEvents: 'none', userSelect: 'none',
    }} />
  )

  if (!session) {
    const editionCombatEnCours = evenements.some(e => e.id === editingEvenementId && e.type === 'combat')
    const editionNarratifEnCours = evenements.some(e => e.id === editingEvenementId && e.type === 'narratif')
    return (
      <div style={{ position: 'relative', minHeight: '100%' }}>
        {backgroundLayer}
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 780, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ fontSize: 15, opacity: 0.5, textAlign: 'center', lineHeight: 1.5 }}>
            {t('gmMode.batailleMasse.intro')}
          </div>

          <div>
            <div style={sectionTitleStyle}>{t('gmMode.batailleMasse.parametres')}</div>
            <div style={{ marginBottom: 12 }}>
              <span style={builderLabelStyle}>{t('gmMode.batailleMasse.nom')}</span>
              <input value={nom} onChange={e => setNom(e.target.value)} placeholder={t('gmMode.batailleMasse.nomPlaceholder')} style={inputStyle} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              <div>
                <span style={builderLabelStyle}>{t('gmMode.batailleMasse.nombreUnitesPJ')}</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="number" min={1} value={nombreUnitesArmeePJ}
                    onChange={e => setNombreUnitesArmeePJ(Math.max(1, parseInt(e.target.value) || 1))} style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
                  <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    border: '1px solid rgba(201,168,76,0.35)', borderRadius: 4, background: 'rgba(201,168,76,0.08)',
                    padding: '2px 10px', minWidth: 92, flexShrink: 0,
                  }}>
                    <span style={{ fontSize: 17, fontWeight: 700, color: GOLD, lineHeight: 1.3 }}>
                      {t('gmMode.batailleMasse.tailleLabel', { taille: tailleArmeePJ })}
                    </span>
                    <span style={{ fontSize: 16, opacity: 0.65, lineHeight: 1.2, textAlign: 'center' }}>
                      {t(`gmMode.batailleMasse.echelleTaille.${tailleArmeePJ}`)}
                    </span>
                  </div>
                </div>
              </div>
              <div>
                <span style={builderLabelStyle}>{t('gmMode.batailleMasse.nombreUnitesEnnemie')}</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="number" min={1} value={nombreUnitesArmeeEnnemie}
                    onChange={e => setNombreUnitesArmeeEnnemie(Math.max(1, parseInt(e.target.value) || 1))} style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
                  <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    border: '1px solid rgba(201,168,76,0.35)', borderRadius: 4, background: 'rgba(201,168,76,0.08)',
                    padding: '2px 10px', minWidth: 92, flexShrink: 0,
                  }}>
                    <span style={{ fontSize: 17, fontWeight: 700, color: GOLD, lineHeight: 1.3 }}>
                      {t('gmMode.batailleMasse.tailleLabel', { taille: tailleArmeeEnnemie })}
                    </span>
                    <span style={{ fontSize: 16, opacity: 0.65, lineHeight: 1.2, textAlign: 'center' }}>
                      {t(`gmMode.batailleMasse.echelleTaille.${tailleArmeeEnnemie}`)}
                    </span>
                  </div>
                </div>
              </div>
              <div>
                <span style={builderLabelStyle}>{t('gmMode.batailleMasse.adversite')}</span>
                <select value={adversite} onChange={e => setAdversite(parseInt(e.target.value) as DeAdversite)} style={selectStyle}>
                  {DES_ADVERSITE.map(d => <option key={d} value={d} style={optionStyle}>d{d}</option>)}
                </select>
              </div>
              <div>
                <span style={builderLabelStyle}>{t('gmMode.batailleMasse.intensiteDepart')}</span>
                <input type="number" min={1} max={10} value={intensiteDepart}
                  onChange={e => setIntensiteDepart(Math.min(10, Math.max(1, parseInt(e.target.value) || 1)))} style={inputStyle} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <span style={builderLabelStyle}>{t('gmMode.batailleMasse.creatureType')}</span>
                <select value={creatureTypeNom} onChange={e => selectionnerCreatureType(e.target.value)} style={selectStyle}>
                  <option value="" style={optionStyle}>{t('gmMode.batailleMasse.creatureTypeManuelle')}</option>
                  {creaturesTriees.map(c => <option key={c.nom} value={c.nom} style={optionStyle}>{c.nom}</option>)}
                </select>
              </div>
              <div>
                <span style={builderLabelStyle}>{t('gmMode.batailleMasse.defEnnemie')}</span>
                <input type="number" value={defEnnemieMoyenne}
                  onChange={e => setDefEnnemieMoyenne(parseInt(e.target.value) || 0)} style={inputStyle} />
              </div>
              <div>
                <span style={builderLabelStyle}>{t('gmMode.batailleMasse.bonusAtqEnnemi')}</span>
                <input type="number" value={bonusAtqEnnemiMoyen}
                  onChange={e => setBonusAtqEnnemiMoyen(parseInt(e.target.value) || 0)} style={inputStyle} />
              </div>
              <div>
                <span style={builderLabelStyle}>{t('gmMode.batailleMasse.terrainTenirLeRang')}</span>
                <select value={terrainTenirLeRang} onChange={e => setTerrainTenirLeRang(e.target.value as TerrainBataille)} style={selectStyle}>
                  {TERRAINS.map(tr => <option key={tr} value={tr} style={optionStyle}>{t(`gmMode.batailleMasse.terrains.${tr}`)}</option>)}
                </select>
              </div>
              <div>
                <span style={builderLabelStyle}>{t('gmMode.batailleMasse.terrainEnRetrait')}</span>
                <select value={terrainEnRetrait} onChange={e => setTerrainEnRetrait(e.target.value as TerrainBataille)} style={selectStyle}>
                  {TERRAINS.map(tr => <option key={tr} value={tr} style={optionStyle}>{t(`gmMode.batailleMasse.terrains.${tr}`)}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 6 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, cursor: 'pointer' }}>
                  <input type="checkbox" checked={limiterRecuperation} onChange={e => setLimiterRecuperation(e.target.checked)} />
                  {t('gmMode.batailleMasse.limiterRecuperation')}
                </label>
              </div>
            </div>
          </div>

          {/* Condition de victoire : l'intensité à 0 gagne toujours la bataille (règle fixe, voir
              victoireAtteinte dans bataille.ts), le seuil de points de bataille est une voie de
              victoire additionnelle optionnelle — on peut gagner par les points bien avant d'avoir
              réduit l'intensité à 0. */}
          <div>
            <div style={sectionTitleStyle}>{t('gmMode.batailleMasse.conditionVictoire')}</div>
            <div style={{ fontSize: 15, opacity: 0.6, marginBottom: 10 }}>
              {t('gmMode.batailleMasse.victoireIntensiteInfo')}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, cursor: 'pointer' }}>
              <input type="checkbox" checked={victoirePointsActive} onChange={e => setVictoirePointsActive(e.target.checked)} />
              {t('gmMode.batailleMasse.victoirePointsActive')}
            </label>
            {victoirePointsActive && (
              <div style={{ maxWidth: 220, marginTop: 10 }}>
                <span style={builderLabelStyle}>{t('gmMode.batailleMasse.victoirePointsSeuil')}</span>
                <input type="number" min={1} value={victoirePointsSeuil}
                  onChange={e => setVictoirePointsSeuil(Math.max(1, parseInt(e.target.value) || 1))} style={inputStyle} />
              </div>
            )}
          </div>

          {/* Événements de la bataille : combat (lie une rencontre déjà créée/sauvegardée dans le
              générateur d'adversité) ou narratif (nom + description libres) — voir EvenementBataille. */}
          <div>
            <div style={sectionTitleStyle}>{t('gmMode.batailleMasse.evenements')}</div>
            {evenements.length === 0 ? (
              <div style={{ fontSize: 15, opacity: 0.4, textAlign: 'center', padding: '10px 0' }}>
                {t('gmMode.batailleMasse.aucunEvenement')}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                {evenements.map(ev => (
                  <div key={ev.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                    border: `1px solid ${ev.id === editingEvenementId ? GOLD : SECTION_BORDER}`, borderRadius: 6,
                  }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                      padding: '2px 8px', borderRadius: 10, flexShrink: 0,
                      color: ev.type === 'combat' ? 'rgba(210,185,255,0.95)' : GOLD,
                      border: `1px solid ${ev.type === 'combat' ? 'rgba(160,120,255,0.5)' : SECTION_BORDER}`,
                    }}>
                      {t(`gmMode.batailleMasse.typeEvenement.${ev.type}`)}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {ev.type === 'combat' ? (
                        <span style={{ fontSize: 16, color: PARCHMENT }}>
                          {rencontres.find(r => r.id === ev.rencontreId)?.nom ?? t('gmMode.batailleMasse.rencontreIntrouvable')}
                        </span>
                      ) : (
                        <>
                          <div style={{ fontSize: 16, color: PARCHMENT, fontWeight: 700 }}>{ev.nom}</div>
                          {ev.description && <div style={{ fontSize: 13, opacity: 0.6 }}>{ev.description}</div>}
                        </>
                      )}
                      <div style={{ fontSize: 12, opacity: 0.5, marginTop: 2 }}>
                        {t('gmMode.batailleMasse.effetResume', { succes: resumeEffet(ev.effetSucces, t), echec: resumeEffet(ev.effetEchec, t) })}
                      </div>
                    </div>
                    <button onClick={() => modifierEvenement(ev)} style={{ ...btnStyle, fontSize: 14, flexShrink: 0 }}>
                      ✎ {t('gmMode.batailleMasse.modifier')}
                    </button>
                    <button onClick={() => supprimerEvenement(ev.id)} style={removeBtnStyle}>✕</button>
                  </div>
                ))}
              </div>
            )}

            {/* Ajout d'un événement combat — l'effet de succès/échec est défini ici par le MJ, pas de
                valeur ni de type fixe imposé (voir EvenementBataille.effetSucces/effetEchec). Liseré doré
                + bouton Mettre à jour/Annuler quand ce formulaire édite un événement existant (voir
                modifierEvenement) au lieu d'en créer un nouveau. */}
            <div style={{ border: `1px solid ${editionCombatEnCours ? GOLD : SECTION_BORDER}`, borderRadius: 6, padding: 10, marginBottom: 10 }}>
              <select value={nouvelEvenementRencontreId} onChange={e => setNouvelEvenementRencontreId(e.target.value)} style={{ ...selectStyle, marginBottom: 8 }}>
                <option value="" style={optionStyle}>{t('gmMode.batailleMasse.choisirRencontre')}</option>
                {rencontres.map(r => <option key={r.id} value={r.id} style={optionStyle}>{r.nom}</option>)}
              </select>
              <div style={{ display: 'flex', gap: 8 }}>
                <EffetInput label={t('gmMode.batailleMasse.effetSiSucces')} effet={nouvelEvenementCombatEffetSucces} onChange={setNouvelEvenementCombatEffetSucces} />
                <EffetInput label={t('gmMode.batailleMasse.effetSiEchec')} effet={nouvelEvenementCombatEffetEchec} onChange={setNouvelEvenementCombatEffetEchec} />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  onClick={ajouterEvenementCombat} disabled={!nouvelEvenementRencontreId}
                  style={{ ...btnStyle, fontSize: 16, opacity: nouvelEvenementRencontreId ? 1 : 0.4 }}
                >
                  {editionCombatEnCours ? t('gmMode.batailleMasse.mettreAJour') : `+ ${t('gmMode.batailleMasse.ajouterCombat')}`}
                </button>
                {editionCombatEnCours && (
                  <button onClick={annulerModificationEvenement} style={{ ...btnStyle, fontSize: 16 }}>
                    {t('gmMode.batailleMasse.annulerModification')}
                  </button>
                )}
              </div>
            </div>

            {/* Ajout d'un événement narratif — même principe d'effet configurable et de bascule édition. */}
            <div style={{ border: `1px solid ${editionNarratifEnCours ? GOLD : SECTION_BORDER}`, borderRadius: 6, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input value={nouvelEvenementNom} onChange={e => setNouvelEvenementNom(e.target.value)}
                placeholder={t('gmMode.batailleMasse.nomEvenementPlaceholder')} style={inputStyle} />
              <textarea value={nouvelEvenementDescription} onChange={e => setNouvelEvenementDescription(e.target.value)}
                placeholder={t('gmMode.batailleMasse.descriptionEvenementPlaceholder')} rows={2}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <EffetInput label={t('gmMode.batailleMasse.effetSiSucces')} effet={nouvelEvenementNarratifEffetSucces} onChange={setNouvelEvenementNarratifEffetSucces} />
                <EffetInput label={t('gmMode.batailleMasse.effetSiEchec')} effet={nouvelEvenementNarratifEffetEchec} onChange={setNouvelEvenementNarratifEffetEchec} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={ajouterEvenementNarratif} disabled={!nouvelEvenementNom.trim()}
                  style={{ ...btnStyle, fontSize: 16, alignSelf: 'flex-start', opacity: nouvelEvenementNom.trim() ? 1 : 0.4 }}
                >
                  {editionNarratifEnCours ? t('gmMode.batailleMasse.mettreAJour') : `+ ${t('gmMode.batailleMasse.ajouterNarratif')}`}
                </button>
                {editionNarratifEnCours && (
                  <button onClick={annulerModificationEvenement} style={{ ...btnStyle, fontSize: 16, alignSelf: 'flex-start' }}>
                    {t('gmMode.batailleMasse.annulerModification')}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ ...sectionTitleStyle, marginBottom: 0, border: 'none', paddingBottom: 0 }}>
                {t('gmMode.batailleMasse.pjEngages')}
              </div>
              <button onClick={() => fileRef.current?.click()} style={{ ...btnStyle, fontSize: 16 }}>
                📂 {t('gmMode.batailleMasse.importerPJ')}
              </button>
              <input ref={fileRef} type="file" accept=".json" multiple style={{ display: 'none' }}
                onChange={e => { if (e.target.files) handleFiles(e.target.files); e.target.value = '' }} />
            </div>
            {pionsEnConstruction.length === 0 ? (
              <div style={{ fontSize: 15, opacity: 0.4, textAlign: 'center', padding: '10px 0' }}>
                {t('gmMode.batailleMasse.aucunPJ')}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                {pionsEnConstruction.map(p => (
                  <div key={p.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                    border: `1px solid ${SECTION_BORDER}`, borderRadius: 6,
                  }}>
                    <span style={{ flex: 1, fontSize: 18, color: PARCHMENT }}>{p.nom}</span>
                    <span style={{ fontSize: 16, opacity: 0.5 }}>DEF {p.def}</span>
                    <span style={{ fontSize: 16, opacity: 0.5 }}>PV {p.pvMax}</span>
                    <button onClick={() => setPionsEnConstruction(prev => prev.filter(x => x.id !== p.id))} style={removeBtnStyle}>✕</button>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={lancerBataille}
              disabled={!nom.trim() || pionsEnConstruction.length === 0}
              style={{
                ...btnStyle, marginTop: 12, borderColor: 'rgba(160,120,255,0.6)', background: 'rgba(140,100,255,0.2)',
                color: 'rgba(210,185,255,0.95)', opacity: (!nom.trim() || pionsEnConstruction.length === 0) ? 0.4 : 1, fontSize: 17,
              }}
            >
              ▶ {t('gmMode.batailleMasse.lancerBataille')}
            </button>
          </div>

          {/* Sauvegarde d'un gabarit (config réutilisable, pas encore lancée) — même principe que la
              sauvegarde d'une rencontre dans le générateur d'adversité. */}
          {pionsEnConstruction.length > 0 && (
            <div style={{ border: `1px solid ${SECTION_BORDER}`, borderRadius: 8, padding: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
              <button onClick={sauvegarderTemplate} disabled={!nom.trim()} style={{ ...btnStyle, opacity: nom.trim() ? 1 : 0.4, fontSize: 16 }}>
                💾 {editingTemplateId ? t('gmMode.batailleMasse.mettreAJour') : t('gmMode.batailleMasse.enregistrer')}
              </button>
              {editingTemplateId && (
                <button onClick={nouvelleBataille} style={{ ...btnStyle, fontSize: 16 }}>{t('gmMode.batailleMasse.nouvelle')}</button>
              )}
              {saveMsg && <span style={{ fontSize: 16, color: GOLD }}>{saveMsg}</span>}
            </div>
          )}

          <div>
            <div style={sectionTitleStyle}>{t('gmMode.batailleMasse.bataillesEnregistrees')}</div>
            {batailleTemplates.length === 0 ? (
              <div style={{ fontSize: 15, opacity: 0.4, textAlign: 'center', padding: '10px 0' }}>
                {t('gmMode.batailleMasse.aucuneBatailleEnregistree')}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {batailleTemplates.map(tpl => (
                  <div key={tpl.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                    border: `1px solid ${tpl.id === editingTemplateId ? 'rgba(201,168,76,0.5)' : SECTION_BORDER}`,
                    borderRadius: 6, background: 'rgba(15,12,8,0.9)',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 18, color: PARCHMENT, fontWeight: 700 }}>{tpl.nom}</div>
                      <div style={{ fontSize: 13, opacity: 0.5 }}>
                        {t('gmMode.batailleMasse.resumeTemplate', { nb: tpl.pions.length, intensite: tpl.intensiteDepart })}
                      </div>
                    </div>
                    <button
                      onClick={() => jouerTemplate(tpl)}
                      style={{ ...btnStyle, borderColor: 'rgba(160,120,255,0.6)', background: 'rgba(140,100,255,0.15)', color: 'rgba(210,185,255,0.95)', fontSize: 16 }}
                    >
                      ▶ {t('gmMode.batailleMasse.jouer')}
                    </button>
                    <button onClick={() => modifierTemplate(tpl)} style={{ ...btnStyle, fontSize: 16 }}>{t('gmMode.batailleMasse.modifier')}</button>
                    <button onClick={() => exporterTemplate(tpl)} style={{ ...btnStyle, fontSize: 16 }}>{t('gmMode.batailleMasse.exporter')}</button>
                    {confirmDeleteTemplateId === tpl.id ? (
                      <button onClick={() => supprimerTemplate(tpl.id)} style={{ ...removeBtnStyle, fontSize: 16 }}>{t('gmMode.batailleMasse.confirmerSuppression')}</button>
                    ) : (
                      <button onClick={() => setConfirmDeleteTemplateId(tpl.id)} style={removeBtnStyle}>✕</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div style={sectionTitleStyle}>{t('gmMode.batailleMasse.bataillesSauvegardees')}</div>
            {saveMsg && <div style={{ fontSize: 16, color: GOLD, marginBottom: 8 }}>{saveMsg}</div>}
            {batailles.length === 0 ? (
              <div style={{ fontSize: 15, opacity: 0.4, textAlign: 'center', padding: '10px 0' }}>
                {t('gmMode.batailleMasse.aucuneBatailleSauvegardee')}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {batailles.map(b => (
                  <div key={b.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                    border: `1px solid ${SECTION_BORDER}`, borderRadius: 6, background: 'rgba(15,12,8,0.9)',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 18, color: PARCHMENT, fontWeight: 700 }}>{b.nom}</div>
                      <div style={{ fontSize: 13, opacity: 0.5 }}>
                        {t('gmMode.batailleMasse.resume', { tour: b.tour, nb: b.pions.length, intensite: b.intensite })}
                      </div>
                    </div>
                    <button
                      onClick={() => reprendre(b)}
                      style={{ ...btnStyle, borderColor: 'rgba(160,120,255,0.6)', background: 'rgba(140,100,255,0.15)', color: 'rgba(210,185,255,0.95)', fontSize: 16 }}
                    >
                      ▶ {t('gmMode.batailleMasse.reprendre')}
                    </button>
                    <button onClick={() => exporter(b)} style={{ ...btnStyle, fontSize: 16 }}>{t('gmMode.batailleMasse.exporter')}</button>
                    {confirmDeleteId === b.id ? (
                      <button onClick={() => supprimer(b.id)} style={{ ...removeBtnStyle, fontSize: 16 }}>{t('gmMode.batailleMasse.confirmerSuppression')}</button>
                    ) : (
                      <button onClick={() => setConfirmDeleteId(b.id)} style={removeBtnStyle}>✕</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  const seuil = seuilSucces(session)
  // Cartes du menu (voir en-tête) : tout sauf celles actuellement en jeu sur le panneau. cartesEnReserve
  // isole celles jouables (pas encore résolues) pour le badge de compteur sur le bouton du menu.
  const cartesMenu = session.evenements.filter(e => !e.enJeu)
  const cartesEnReserve = cartesMenu.filter(e => e.resultat === null)
  const cartesEnJeu = session.evenements.filter(e => e.enJeu)

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      {backgroundLayer}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
        {/* En-tête */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: GOLD, fontFamily: "'Cinzel', serif" }}>{session.nom}</div>
            <div style={{ fontSize: 14, opacity: 0.5 }}>{t('gmMode.batailleMasse.tourLabel', { tour: session.tour })}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {saveMsg && <span style={{ fontSize: 14, color: GOLD }}>{saveMsg}</span>}
            {/* Menu des cartes événement : réserve (pas encore jouées) + résolues (de retour du
                panneau, voir Zone de jeu ci-dessous) — les cartes en jeu n'y figurent pas, elles sont
                seules sur le panneau tant qu'elles ne sont pas résolues. */}
            {session.evenements.length > 0 && (
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <button
                  onClick={() => setMenuEvenementsOuvert(o => !o)}
                  style={{
                    padding: '6px 14px', borderRadius: 4,
                    border: `1px solid ${menuEvenementsOuvert ? GOLD : SECTION_BORDER}`,
                    background: menuEvenementsOuvert ? 'rgba(201,168,76,0.12)' : 'transparent',
                    color: 'rgba(245,236,215,0.8)', cursor: 'pointer', fontSize: 15,
                  }}
                >
                  🃏 {t('gmMode.batailleMasse.menuEvenements')}
                  {cartesEnReserve.length > 0 && ` (${cartesEnReserve.length})`}
                </button>
                {menuEvenementsOuvert && (
                  <div style={{
                    position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 20, width: 320,
                    maxHeight: 420, overflowY: 'auto', background: 'rgba(15,12,8,0.98)', border: `1px solid ${SECTION_BORDER}`,
                    borderRadius: 6, boxShadow: '0 6px 20px rgba(0,0,0,0.5)', padding: 10,
                    display: 'flex', flexDirection: 'column', gap: 8,
                  }}>
                    {cartesMenu.length === 0 ? (
                      <div style={{ fontSize: 14, opacity: 0.4, textAlign: 'center', padding: '10px 0' }}>
                        {t('gmMode.batailleMasse.toutesCartesEnJeu')}
                      </div>
                    ) : cartesMenu.map(ev => (
                      <div key={ev.id} style={{
                        display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 10px',
                        border: `1px solid ${ev.resultat ? (ev.resultat === 'succes' ? 'rgba(120,220,140,0.4)' : 'rgba(230,110,110,0.4)') : SECTION_BORDER}`,
                        borderRadius: 6,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{
                            fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                            padding: '2px 6px', borderRadius: 10, flexShrink: 0,
                            color: ev.type === 'combat' ? 'rgba(210,185,255,0.95)' : GOLD,
                            border: `1px solid ${ev.type === 'combat' ? 'rgba(160,120,255,0.5)' : SECTION_BORDER}`,
                          }}>
                            {t(`gmMode.batailleMasse.typeEvenement.${ev.type}`)}
                          </span>
                          <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: PARCHMENT, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {ev.type === 'combat' ? (rencontres.find(r => r.id === ev.rencontreId)?.nom ?? t('gmMode.batailleMasse.rencontreIntrouvable')) : ev.nom}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.5 }}>
                          {t('gmMode.batailleMasse.effetResume', { succes: resumeEffet(ev.effetSucces, t), echec: resumeEffet(ev.effetEchec, t) })}
                        </div>
                        {ev.resultat === null ? (
                          ev.type === 'combat' && onPlayRencontre ? (
                            <button onClick={() => { lancerRencontreEvenement(ev); setMenuEvenementsOuvert(false) }} style={{
                              ...btnStyle, fontSize: 14, alignSelf: 'flex-start',
                              borderColor: 'rgba(160,120,255,0.6)', background: 'rgba(140,100,255,0.15)', color: 'rgba(210,185,255,0.95)',
                            }}>
                              ⚔ {t('gmMode.batailleMasse.lancerRencontre')}
                            </button>
                          ) : (
                            <button onClick={() => { jouerCarteEvenement(ev.id); setMenuEvenementsOuvert(false) }} style={{ ...btnStyle, fontSize: 14, alignSelf: 'flex-start' }}>
                              ▶ {t('gmMode.batailleMasse.jouerCarte')}
                            </button>
                          )
                        ) : (
                          <div style={{
                            fontSize: 13, fontWeight: 700,
                            color: ev.resultat === 'succes' ? BONUS_POSITIF : BONUS_NEGATIF,
                          }}>
                            {ev.resultat === 'succes' ? '✓ ' + t('gmMode.batailleMasse.resoudreSucces') : '✗ ' + t('gmMode.batailleMasse.resoudreEchec')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button onClick={() => setSession(s => s && tourSuivant(s))} style={{
              padding: '6px 14px', borderRadius: 4, border: '1px solid rgba(201,168,76,0.5)',
              background: 'rgba(201,168,76,0.12)', color: GOLD, cursor: 'pointer', fontSize: 15,
            }}>
              ⏭ {t('gmMode.batailleMasse.tourSuivant')}
            </button>
            <button onClick={sauvegarderSnapshot} style={{
              padding: '6px 14px', borderRadius: 4, border: '1px solid rgba(100,200,120,0.5)',
              background: 'rgba(100,200,120,0.12)', color: 'rgba(120,220,140,0.95)', cursor: 'pointer', fontSize: 15,
            }}>
              💾 {t('gmMode.batailleMasse.sauvegarder')}
            </button>
            <button onClick={() => { setSession(null); setSnapshotId(null) }} style={{
              padding: '6px 14px', borderRadius: 4, border: `1px solid ${SECTION_BORDER}`,
              background: 'transparent', color: 'rgba(245,236,215,0.6)', cursor: 'pointer', fontSize: 15,
            }}>
              {t('gmMode.batailleMasse.terminer')}
            </button>
          </div>
        </div>

        {/* Compteurs — Intensité occupe la majorité de la largeur (c'est la valeur qui pilote le calcul
            des DM, elle mérite la place principale), Succès cumulés et Points de bataille se partagent
            un sixième chacun (ratio 10:1:1). */}
        <div style={{ display: 'flex', gap: 16, flexShrink: 0 }}>
          <div style={{ flex: 10, border: `1px solid ${SECTION_BORDER}`, borderRadius: 6, padding: '8px 14px' }}>
            <span style={labelStyle}>{t('gmMode.batailleMasse.intensiteLabel')}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: GOLD, fontFamily: "'Cinzel', serif", flexShrink: 0 }}>
                {session.intensite} / 10
              </div>
              {/* Barre graduée : même code couleur que les tables papier de référence (voir
                  couleurIntensite) — un cran par valeur d'intensité de 0 à 10, celui en cours
                  ressort (opacité pleine + liseré doré), les autres restent en arrière-plan. Crans
                  épaissis pour loger le chiffre à l'intérieur plutôt que juste au survol. */}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'flex-end', gap: 3, height: 34 }}>
                {ECHELLE_INTENSITE.map(n => {
                  const actif = n === session.intensite
                  const { fond, texte } = couleurIntensite(n)
                  return (
                    <div
                      key={n}
                      title={String(n)}
                      style={{
                        flex: 1, height: actif ? '100%' : '70%', borderRadius: 3, background: fond,
                        border: actif ? `2px solid ${GOLD}` : 'none', boxSizing: 'border-box',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: actif ? 20 : 15, fontWeight: 700, color: texte, lineHeight: 1,
                      }}
                    >
                      {n}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0, border: `1px solid ${SECTION_BORDER}`, borderRadius: 6, padding: '8px 14px' }}>
            <span style={labelStyle}>{t('gmMode.batailleMasse.succesLabel')}</span>
            <div style={{ fontSize: 22, fontWeight: 700, color: PARCHMENT }}>{session.succesCumules} / {seuil}</div>
          </div>
          <div style={{ flex: 1, minWidth: 0, border: `1px solid ${SECTION_BORDER}`, borderRadius: 6, padding: '8px 14px' }}>
            <span style={labelStyle}>{t('gmMode.batailleMasse.pointsBatailleLabel')}</span>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: PARCHMENT }}>{session.pointsBataille}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setSession(s => s && ajusterPointsBataille(s, -1))} style={{ ...btnStyle, padding: '4px 10px' }}>-</button>
                <button onClick={() => setSession(s => s && ajusterPointsBataille(s, 1))} style={{ ...btnStyle, padding: '4px 10px' }}>+</button>
              </div>
            </div>
          </div>
        </div>

        {/* Colonnes de position — position: relative pour que l'overlay de victoire ci-dessous se
            plaque exactement sur ce champ de bataille, sans déborder sur l'en-tête ni les compteurs.
            Colonne row (flex) puis, en dessous, la ligne des événements (flex-direction column ici). */}
        <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 12 }}>
            {POSITIONS.map(position => (
              <div
                key={position}
                onDragOver={e => { e.preventDefault(); setColonneSurvolee(position) }}
                onDragLeave={() => setColonneSurvolee(prev => prev === position ? null : prev)}
                onDrop={e => deposerPion(e, position)}
                style={{
                  flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8,
                  border: `1px solid ${colonneSurvolee === position ? GOLD : SECTION_BORDER}`, borderRadius: 6,
                  background: colonneSurvolee === position ? 'rgba(201,168,76,0.06)' : 'transparent',
                  padding: 10, overflowY: 'auto',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: GOLD, textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center', flexShrink: 0 }}>
                  {t(`gmMode.batailleMasse.positions.${position}`)}
                </div>
                {/* Badge de terrain — seules tenirLeRang/enRetrait peuvent en avoir un (voir
                    terrainPourPosition), affiché seulement quand ce n'est pas "aucun". */}
                {(() => {
                  const terrainPos = terrainPourPosition(session.terrainParPosition, position)
                  if (terrainPos === 'aucun') return null
                  return (
                    <div style={{ fontSize: 14, textAlign: 'center', color: BONUS_POSITIF, opacity: 0.85, flexShrink: 0 }}>
                      {t(`gmMode.batailleMasse.fortifications.${terrainPos}`)} ({terrainPos === 'leger' ? -1 : -2})
                    </div>
                  )
                })()}
                {session.pions.filter(p => p.position === position).map(pion => (
                  <PionCard
                    key={pion.id}
                    pion={pion}
                    onChangerTypeAttaque={type => changerTypeAttaque(pion.id, type)}
                    onResultatAttaque={etat => enregistrerResultatAttaque(pion.id, etat)}
                    onTestDefense={() => testerDefenseSur(pion.id)}
                    onRecuperer={() => recupererSur(pion.id)}
                    onRetirer={() => retirerPionActif(pion.id)}
                    onAjusterPV={delta => ajusterPV(pion.id, delta)}
                    limiterRecuperation={session.limiterRecuperation}
                  />
                ))}
              </div>
            ))}
          </div>

          {/* Zone de jeu, sous les colonnes de position plutôt qu'une 5e colonne — n'affiche que les
              cartes actuellement en jeu (jouées depuis le menu, voir en-tête), chacune avec ses
              boutons Succès/Échec (resoudreEvenement, qui la fait ressortir de la zone de jeu vers le
              menu) et un bouton pour la retirer sans la résoudre en cas d'erreur (retirerCarteDeJeu).
              N'apparaît que s'il y a au moins une carte en jeu, pour ne pas gaspiller de place sinon. */}
          {cartesEnJeu.length > 0 && (
            <div style={{ flexShrink: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: GOLD, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                {t('gmMode.batailleMasse.zoneDeJeu')}
              </div>
              <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
                {cartesEnJeu.map(ev => (
                  <div key={ev.id} style={{
                    minWidth: 240, flexShrink: 0, background: 'rgba(15,12,8,0.95)', border: `1px solid ${GOLD}`,
                    borderRadius: 6, padding: 10, display: 'flex', flexDirection: 'column', gap: 6,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                        padding: '2px 8px', borderRadius: 10, flexShrink: 0,
                        color: ev.type === 'combat' ? 'rgba(210,185,255,0.95)' : GOLD,
                        border: `1px solid ${ev.type === 'combat' ? 'rgba(160,120,255,0.5)' : SECTION_BORDER}`,
                      }}>
                        {t(`gmMode.batailleMasse.typeEvenement.${ev.type}`)}
                      </span>
                      <button
                        onClick={() => retirerCarteDeJeu(ev.id)}
                        title={t('gmMode.batailleMasse.retirerDeJeu')}
                        style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: 'rgba(245,236,215,0.5)', cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1 }}
                      >
                        ↩
                      </button>
                    </div>
                    {ev.type === 'combat' ? (
                      <span style={{ fontSize: 14, color: PARCHMENT, fontWeight: 700 }}>
                        {rencontres.find(r => r.id === ev.rencontreId)?.nom ?? t('gmMode.batailleMasse.rencontreIntrouvable')}
                      </span>
                    ) : (
                      <>
                        <div style={{ fontSize: 14, color: PARCHMENT, fontWeight: 700 }}>{ev.nom}</div>
                        {ev.description && <div style={{ fontSize: 12, opacity: 0.6 }}>{ev.description}</div>}
                      </>
                    )}
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => resoudreEvenement(ev.id, 'succes')} style={{ ...etatAttaqueBtnStyle(true, false), flex: 1 }}>
                        {t('gmMode.batailleMasse.resoudreSucces')}
                      </button>
                      <button onClick={() => resoudreEvenement(ev.id, 'echec')} style={{ ...etatAttaqueBtnStyle(false, false), flex: 1 }}>
                        {t('gmMode.batailleMasse.resoudreEchec')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Overlay de victoire — pointerEvents:none pour laisser le MJ continuer à interagir avec
              les cartes en dessous (ajuster PV, terminer la bataille...) malgré le bandeau affiché ;
              le bouton de fermeture repasse en pointerEvents:auto pour rester cliquable. */}
          {victoireAtteinte(session) && !victoireOverlayFermee && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(10,8,4,0.72)', borderRadius: 6, pointerEvents: 'none',
            }}>
              <button
                onClick={() => setVictoireOverlayFermee(true)}
                style={{
                  position: 'absolute', top: 10, right: 10, background: 'transparent', border: 'none',
                  color: PARCHMENT, opacity: 0.7, cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 4,
                  pointerEvents: 'auto',
                }}
              >
                ✕
              </button>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 56, lineHeight: 1 }}>🏆</div>
                <div style={{
                  fontSize: 34, fontWeight: 700, color: GOLD, fontFamily: "'Cinzel', serif",
                  letterSpacing: '0.06em', marginTop: 8, textShadow: '0 2px 12px rgba(0,0,0,0.6)',
                }}>
                  {t('gmMode.batailleMasse.victoireAtteinte')}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Détail des dés de dégâts d'un test de défense (ex. "[4+5]+2=11") — reprend les jets individuels
// (ResultatTestDefense.detailDes) plutôt que seulement le total, pour vérifier le calcul à vue :
// le modificateur fixe éventuel (table "Mod. de DM") se déduit de la différence dm - somme des dés.
function formatDetailDegats(resultat: ResultatTestDefense): string {
  if (resultat.detailDes.length === 0) return String(resultat.dm)
  const somme = resultat.detailDes.reduce((a, b) => a + b, 0)
  const modFixe = resultat.dm - somme
  return `[${resultat.detailDes.join('+')}]${modFixe !== 0 ? (modFixe > 0 ? `+${modFixe}` : modFixe) : ''}=${resultat.dm}`
}

// Couleur de la cellule Intensité du mini-tableau — même code couleur que les tables papier de
// référence (voir Table_des_DM_*.jpg) : vert (Négative) → jaune → orange → rouge → brun plus l'intensité
// modifiée grimpe, plafonné visuellement à 14 comme sur les tables (au-delà, reste au brun le plus sombre).
function couleurIntensite(intensite: number): { fond: string; texte: string } {
  if (intensite < 0) return { fond: 'hsla(100, 55%, 45%, 0.75)', texte: '#14100a' }
  const n = Math.min(14, Math.max(0, intensite))
  const teinte = n <= 10 ? 100 - (n / 10) * 100 : 0
  const luminosite = n <= 10 ? 55 : 45 - ((n - 10) / 4) * 20
  return { fond: `hsla(${teinte}, 70%, ${luminosite}%, 0.8)`, texte: luminosite >= 40 ? '#14100a' : PARCHMENT }
}

// Échelle de la barre d'intensité de l'en-tête de session — de 0 à 10, un cran par valeur entière
// (le cran "Négative" a été retiré : l'intensité de base ne descend jamais sous 0, voir bataille.ts).
const ECHELLE_INTENSITE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

// Icône de la stat ATQ selon le type d'attaque choisi — épée (contact), arc (distance), baguette (magique).
function iconeTypeAttaque(type: TypeAttaque): string {
  return type === 'contact' ? '⚔️' : type === 'distance' ? '🏹' : '🪄'
}

// Effet configuré par le MJ pour une issue d'événement (succès ou échec) : type (points de bataille /
// intensité / soins, voir EffetEvenement dans bataille.ts) + valeur signée, sur une seule ligne.
function EffetInput({ label, effet, onChange }: {
  label: string
  effet: EffetEvenement
  onChange: (effet: EffetEvenement) => void
}) {
  const { t } = useTranslation()
  return (
    <div style={{ flex: 1 }}>
      <span style={builderLabelStyle}>{label}</span>
      <div style={{ display: 'flex', gap: 6 }}>
        <select
          value={effet.type}
          onChange={e => onChange({ ...effet, type: e.target.value as TypeEffetEvenement })}
          style={{ ...selectStyle, flex: 1, minWidth: 0 }}
        >
          {EFFETS.map(ty => <option key={ty} value={ty} style={optionStyle}>{t(`gmMode.batailleMasse.typeEffet.${ty}`)}</option>)}
        </select>
        <input
          type="number" value={effet.valeur}
          onChange={e => onChange({ ...effet, valeur: parseInt(e.target.value) || 0 })}
          style={{ ...inputStyle, width: 70, flexShrink: 0 }}
        />
      </div>
    </div>
  )
}

// Résumé lisible d'un effet ("+2 Points de bataille", "-1 Intensité"...) — repris à la fois dans la
// liste du constructeur et dans le menu de cartes de la session active.
function resumeEffet(effet: EffetEvenement, t: (key: string) => string): string {
  const signe = effet.valeur >= 0 ? '+' : ''
  return `${signe}${effet.valeur} ${t(`gmMode.batailleMasse.typeEffet.${effet.type}`)}`
}

function PionCard({
  pion, onChangerTypeAttaque, onResultatAttaque, onTestDefense, onRecuperer, onRetirer, onAjusterPV, limiterRecuperation,
}: {
  pion: PionPJ
  onChangerTypeAttaque: (type: TypeAttaque) => void
  onResultatAttaque: (etat: EtatAttaque) => void
  onTestDefense: () => void
  onRecuperer: () => void
  onRetirer: () => void
  onAjusterPV: (delta: number) => void
  limiterRecuperation: boolean
}) {
  const { t } = useTranslation()
  const atq = bonusAttaque(pion)
  const posBonus = bonusPosition(pion.position)
  const enCombat = pion.position !== 'arriere'
  // Soin manuel : autre méthode que les points de récupération ci-dessous (montant libre saisi par le
  // MJ, pas de charge consommée) — réutilise onAjusterPV, déjà plafonné à pvMax côté appelant.
  const [montantSoin, setMontantSoin] = useState('')

  return (
    <div
      draggable
      onDragStart={e => e.dataTransfer.setData('text/plain', pion.id)}
      style={{
        background: 'rgba(15,12,8,0.95)', border: `1px solid ${SECTION_BORDER}`, borderRadius: 6,
        padding: 10, cursor: 'grab', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0,
      }}
    >
      {/* Nom + stats sur une même ligne : PV/DEF/ATQ repérés par un pictogramme (❤️ 🛡️ ⚔️) plutôt qu'une
          étiquette texte. La vie seule est modifiable par le MJ (+/-), DEF et ATQ restent des valeurs
          dérivées de la fiche. Le sélecteur de type d'attaque est accolé à la stat ATQ qu'il détermine. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ minWidth: 0, flexShrink: 1, fontSize: 16, fontWeight: 700, color: PARCHMENT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {pion.nom}
        </span>

        {/* Stats centrées dans l'espace restant entre le nom et le ✕, plutôt que collées à droite. */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 18, color: PARCHMENT, opacity: 0.85, display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <button onClick={() => onAjusterPV(-1)} style={pvBtnStyle}>-</button>
            ❤️ {pion.pvActuels} / {pion.pvMax}
            <button onClick={() => onAjusterPV(1)} style={pvBtnStyle}>+</button>
          </span>
          <span style={{ fontSize: 18, color: PARCHMENT, opacity: 0.85, display: 'inline-flex', alignItems: 'baseline', gap: 4, flexShrink: 0 }}>
            🛡️ {pion.def}
            {enCombat && posBonus.def !== 0 && (
              <span style={{ fontSize: 18, fontWeight: 700, color: posBonus.def > 0 ? BONUS_POSITIF : BONUS_NEGATIF }}>
                ({posBonus.def > 0 ? '+' : ''}{posBonus.def})
              </span>
            )}
          </span>
          {enCombat && (
            <span style={{ fontSize: 18, color: PARCHMENT, opacity: 0.85, display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {iconeTypeAttaque(pion.typeAttaque)} {atq >= 0 ? '+' : ''}{atq}
              {posBonus.atq !== 0 && (
                <span style={{ fontSize: 18, fontWeight: 700, color: posBonus.atq > 0 ? BONUS_POSITIF : BONUS_NEGATIF }}>
                  ({posBonus.atq > 0 ? '+' : ''}{posBonus.atq})
                </span>
              )}
              <select value={pion.typeAttaque} onChange={e => onChangerTypeAttaque(e.target.value as TypeAttaque)} style={{ ...selectStyle, width: 'auto', minWidth: 0, fontSize: 13, padding: '2px 4px' }}>
                <option value="contact" style={optionStyle}>{t('gmMode.batailleMasse.typeAttaque.contact')} ({pion.bonusContact >= 0 ? '+' : ''}{pion.bonusContact})</option>
                <option value="distance" style={optionStyle}>{t('gmMode.batailleMasse.typeAttaque.distance')} ({pion.bonusDistance >= 0 ? '+' : ''}{pion.bonusDistance})</option>
                <option value="magique" style={optionStyle}>{t('gmMode.batailleMasse.typeAttaque.magique')} ({pion.bonusMagique >= 0 ? '+' : ''}{pion.bonusMagique})</option>
              </select>
            </span>
          )}
        </div>

        <button onClick={onRetirer} style={{ background: 'transparent', border: 'none', color: 'rgba(255,110,110,0.7)', cursor: 'pointer', fontSize: 15, padding: 0, lineHeight: 1, flexShrink: 0 }}>✕</button>
      </div>

      {/* Marges négatives : la carte a un padding de 10px, sans ça le filet s'arrêterait avant les
          bords réels de la carte au lieu d'aller "jusqu'au bout". */}
      <div style={{ borderTop: `1px dashed ${SECTION_BORDER}`, margin: '0 -10px' }} />

      {pion.position !== 'arriere' ? (
        <>
          {/* Deux colonnes séparées par un filet pointillé : attaque à gauche (bouton + résultat),
              défense à droite (bouton + résultat + mini-tableau) — les deux actions sont indépendantes
              l'une de l'autre, ce découpage évite de mélanger leurs résultats sur la carte. */}
          <div style={{ display: 'flex' }}>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6, paddingRight: 8 }}>
              {/* Simple mention (pas un bouton : le jet d'attaque est fait à la table par le joueur, pas
                  par l'app) — alignée sur le bouton Défense d'en face pour bien distinguer les deux
                  colonnes malgré l'absence d'action ici. */}
              <div style={{ ...btnStyle, fontSize: 14, padding: '5px 6px', textAlign: 'center', cursor: 'default' }}>
                {iconeTypeAttaque(pion.typeAttaque)} {t('gmMode.batailleMasse.attaqueLabel')}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                <button onClick={() => onResultatAttaque('critiqueReussite')} disabled={pion.aAttaqueCeTour} style={etatAttaqueBtnStyle(true, pion.aAttaqueCeTour)}>
                  {t('gmMode.batailleMasse.etatsAttaque.critiqueReussite')}
                </button>
                <button onClick={() => onResultatAttaque('reussite')} disabled={pion.aAttaqueCeTour} style={etatAttaqueBtnStyle(true, pion.aAttaqueCeTour)}>
                  {t('gmMode.batailleMasse.etatsAttaque.reussite')}
                </button>
                <button onClick={() => onResultatAttaque('echec')} disabled={pion.aAttaqueCeTour} style={etatAttaqueBtnStyle(false, pion.aAttaqueCeTour)}>
                  {t('gmMode.batailleMasse.etatsAttaque.echec')}
                </button>
                <button onClick={() => onResultatAttaque('critiqueEchec')} disabled={pion.aAttaqueCeTour} style={etatAttaqueBtnStyle(false, pion.aAttaqueCeTour)}>
                  {t('gmMode.batailleMasse.etatsAttaque.critiqueEchec')}
                </button>
              </div>
              {pion.dernierEtatAttaque && (() => {
                const delta = deltaSuccesAttaque(pion.dernierEtatAttaque)
                return (
                  <div style={{ fontSize: 14, lineHeight: 1.6, textAlign: 'center' }}>
                    <span style={{ color: delta >= 0 ? BONUS_POSITIF : BONUS_NEGATIF, fontWeight: 700 }}>
                      {delta >= 0 ? '+' : ''}{delta} {t('gmMode.batailleMasse.succesAbrege')}
                    </span>
                  </div>
                )
              })()}
            </div>

            <div style={{ borderLeft: `1px dashed ${SECTION_BORDER}`, margin: '0 8px' }} />

            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button onClick={onTestDefense} style={{ ...btnStyle, fontSize: 14, padding: '5px 6px' }}>🛡 {t('gmMode.batailleMasse.testDefense')}</button>
              {pion.dernierTestDefense && (
                <>
                  <div style={{ fontSize: 14, lineHeight: 1.6, textAlign: 'center' }}>
                    🛡 <span style={{ color: GOLD, fontWeight: 700 }}>{t('gmMode.batailleMasse.jetLabel')} {pion.dernierTestDefense.total}</span>
                    {' '}(<span style={{ opacity: 0.7 }}>d20 {pion.dernierTestDefense.jet}</span> + <span style={{ color: DEF_COLOR, fontWeight: 700 }}>{t('gmMode.batailleMasse.defAbrege')} {pion.def}-10</span>)
                    {' · '}<span style={{ color: DIFF_COLOR, fontWeight: 700 }}>{t('gmMode.batailleMasse.diffLabel')} {pion.dernierTestDefense.difficulte}</span>
                    {pion.dernierTestDefense.critique && (
                      <span style={{ color: pion.dernierTestDefense.reussite ? BONUS_POSITIF : BONUS_NEGATIF }}>
                        {' · '}{t(`gmMode.batailleMasse.critique.${pion.dernierTestDefense.critique}`)}
                      </span>
                    )}
                  </div>
                  {/* Mini-tableau reprenant la logique de la table du livre (position en en-tête, intensité
                      modifiée à gauche, dégâts dans la cellule) — juste sous la ligne du jet, alignés sur
                      le même bord gauche que le reste de cette colonne. */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', fontSize: 14, width: 'fit-content', alignSelf: 'center' }}>
                    {/* Cellule vide (coin position/intensité) : volontairement sans bordure haut ni gauche —
                        seule sa bordure basse (partagée avec la cellule Intensité) reste, le trait vertical
                        avec la cellule Position étant porté par cette dernière (borderLeft ci-dessous). */}
                    <div style={{ padding: '3px 8px', borderBottom: `1px solid ${SECTION_BORDER}` }} />
                    <div style={{
                      padding: '3px 8px', borderTop: `1px solid ${SECTION_BORDER}`, borderRight: `1px solid ${SECTION_BORDER}`,
                      borderBottom: `1px solid ${SECTION_BORDER}`, borderLeft: `1px solid ${SECTION_BORDER}`,
                      borderTopRightRadius: 4, fontWeight: 700, color: GOLD, textAlign: 'center',
                    }}>
                      {t(`gmMode.batailleMasse.positions.${pion.position}`)}
                    </div>
                    {(() => {
                      const { fond, texte } = couleurIntensite(pion.dernierTestDefense.intensiteModifiee)
                      return (
                        <div style={{
                          padding: '3px 8px', borderLeft: `1px solid ${SECTION_BORDER}`, borderBottom: `1px solid ${SECTION_BORDER}`,
                          borderBottomLeftRadius: 4, whiteSpace: 'nowrap', fontWeight: 700, background: fond, color: texte,
                        }}>
                          {t('gmMode.batailleMasse.intensiteLabel')} {pion.dernierTestDefense.intensiteModifiee}
                        </div>
                      )
                    })()}
                    <div style={{
                      padding: '3px 8px', borderLeft: `1px solid ${SECTION_BORDER}`, borderRight: `1px solid ${SECTION_BORDER}`,
                      borderBottom: `1px solid ${SECTION_BORDER}`, borderBottomRightRadius: 4, textAlign: 'center', whiteSpace: 'nowrap',
                      fontWeight: 700, color: pion.dernierTestDefense.reussite ? BONUS_POSITIF : BONUS_NEGATIF,
                    }}>
                      {formatDetailDegats(pion.dernierTestDefense)} {t('gmMode.batailleMasse.dmAbrege')}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Filet vertical positionné à 50% en absolu (centré indépendamment de la largeur inégale des
              boutons de chaque côté, voir plus haut) mais sur ce conteneur englobant les DEUX lignes
              (titres puis boutons) plutôt que sur la seule ligne de boutons — pour qu'il parte du bas du
              bloc jusqu'à quasiment toucher le filet horizontal au-dessus (sous le nom), comme celui des
              colonnes Attaque/Défense des autres positions. */}
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, transform: 'translateX(-50%)', borderLeft: `1px dashed ${SECTION_BORDER}` }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, opacity: 0.6, marginBottom: 6 }}>
              <span>{t('gmMode.batailleMasse.recuperationLabel')} {pion.pointsRecuperationActuels} / {pion.pointsRecuperationMax}</span>
              <span>{t('gmMode.batailleMasse.autreSoin')}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
              <button
                onClick={onRecuperer}
                disabled={pion.pointsRecuperationActuels <= 0 || (limiterRecuperation && pion.aRecupereCeTour)}
                style={{
                  ...btnStyle, fontSize: 14, padding: '5px 6px', flexShrink: 0,
                  opacity: (pion.pointsRecuperationActuels <= 0 || (limiterRecuperation && pion.aRecupereCeTour)) ? 0.4 : 1,
                }}
              >
                💚 {t('gmMode.batailleMasse.recuperer')}
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <input
                  type="number" value={montantSoin} placeholder={t('gmMode.batailleMasse.montantSoin')}
                  onChange={e => setMontantSoin(e.target.value)}
                  style={{ ...inputStyle, fontSize: 14, padding: '5px 6px', width: 76, flexShrink: 0, textAlign: 'center' }}
                />
                <button
                  onClick={() => { const montant = parseInt(montantSoin) || 0; if (montant > 0) { onAjusterPV(montant); setMontantSoin('') } }}
                  disabled={!(parseInt(montantSoin) > 0)}
                  style={{ ...btnStyle, fontSize: 14, padding: '5px 6px', opacity: parseInt(montantSoin) > 0 ? 1 : 0.4, flexShrink: 0 }}
                >
                  💚 {t('gmMode.batailleMasse.soigner')}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
