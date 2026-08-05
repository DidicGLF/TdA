import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useGameData } from '../../context/GameDataContext'
import { saveDataFile } from '../../utils/tauriStorage'
import { desenvelopper, messageMauvaisType } from '../../utils/importTypage'
import { envoyerATousReseau, envoyerAClientReseau, ecouterReseau } from '../../utils/reseau'
import type { EvenementReseau } from '../../utils/reseau'
import { encoderMessage, decoderMessage } from '../../utils/reseauProtocole'
import { importerImage } from '../../utils/imageStore'
import { useImage } from '../../hooks/useImage'
import NumberField from '../NumberField'
import type { Character } from '../../types/character'
import type { Compagnie, CodeCompagnie, DomaineCapacite, FonctionMembre } from '../../utils/compagnie'
import {
  TAILLES_COMPAGNIE, FONCTIONS_MEMBRE, DEVISE_CODE, DESCRIPTION_CODE,
  VOIE_COMPAGNIE, capaciteAuRang, capacitesActives, niveauDepuisRenommee,
  descriptionCapacite, capacitesDisponiblesAnarchique, SEUILS_RENOMMEE, COMPAGNIE_PAR_DEFAUT,
} from '../../utils/compagnie'
import type { MissionCompagnie, StatutMission, TypeMission } from '../../utils/missions'
import { MISSION_VIDE, TYPES_MISSION, peutSePorterVolontaire } from '../../utils/missions'

const GOLD = '#c9a84c'
const PARCHMENT = '#f5ecd7'
const SECTION_BORDER = 'rgba(201,168,76,0.2)'
const COULEUR_DOMAINE: Record<DomaineCapacite, string> = {
  arsenal: '#c67a3d', influence: '#a98ff0', tactique: '#5fb0a8',
}
const COULEUR_STATUT: Record<StatutMission, string> = {
  proposee: 'rgba(245,236,215,0.5)',
  enCours: 'rgba(160,120,255,0.9)',
  reussie: 'rgba(120,220,140,0.9)',
  echouee: 'rgba(230,110,110,0.9)',
}

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

const sectionTitreStyle: React.CSSProperties = {
  fontSize: 16, fontWeight: 700, color: GOLD, textTransform: 'uppercase',
  letterSpacing: '0.08em', marginBottom: 10, fontFamily: "'Cinzel', serif",
}
const panelStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)', border: `1px solid ${SECTION_BORDER}`,
  borderRadius: 8, padding: '16px 18px', marginBottom: 14,
}
const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)', border: `1px solid ${SECTION_BORDER}`, borderRadius: 4,
  color: PARCHMENT, fontSize: 15, padding: '8px 11px', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
}
const fieldLabelStyle: React.CSSProperties = {
  fontSize: 12.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(245,236,215,0.45)', marginBottom: 4,
}
const btnStyle: React.CSSProperties = {
  padding: '7px 14px', borderRadius: 4, fontSize: 14, cursor: 'pointer',
  border: '1px solid rgba(201,168,76,0.4)', background: 'transparent', color: GOLD, fontFamily: 'inherit',
}
const removeBtnStyle: React.CSSProperties = {
  padding: '5px 10px', borderRadius: 4, fontSize: 13, cursor: 'pointer',
  border: '1px solid rgba(255,80,80,0.3)', background: 'transparent', color: 'rgba(255,110,110,0.8)', fontFamily: 'inherit',
}

function MissionIllustration({ cle }: { cle?: string }) {
  const src = useImage(cle)
  if (!src) return null
  return <img src={src} alt="" style={{ width: '100%', maxHeight: 160, objectFit: 'cover', borderRadius: 6, marginBottom: 10 }} />
}

export default function CompagnieTab() {
  const { t } = useTranslation()
  const { compagnie, setCompagnie } = useGameData()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const membreFileInputRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [ajoutRenommee, setAjoutRenommee] = useState('')

  const update = (patch: Partial<Compagnie>) => setCompagnie(prev => ({ ...prev, ...patch, modifieLe: new Date().toISOString() }))

  const niveau = niveauDepuisRenommee(compagnie.renommee)
  const actives = capacitesActives(compagnie)

  const appliquerAjoutRenommee = () => {
    const delta = parseInt(ajoutRenommee, 10)
    if (!delta) return
    update({ renommee: Math.max(0, compagnie.renommee + delta) })
    setAjoutRenommee('')
  }

  const nomPourFonction = (fonction: FonctionMembre) => compagnie.membres.find(m => m.fonction === fonction)?.nom ?? ''
  const setNomFonction = (fonction: FonctionMembre, nom: string) => {
    const ancienTitulaire = compagnie.membres.find(m => m.fonction === fonction)
    const autres = compagnie.membres.filter(m => m.fonction !== fonction)
    if (nom.trim()) {
      update({ membres: [...autres, { fonction, nom: nom.trim() }] })
    } else if (ancienTitulaire) {
      // Champ vidé : l'ancien titulaire redevient membre général plutôt que de disparaître de la
      // compagnie — seul un glisser-déposer vers cet emplacement peut le remplacer, il n'y a pas de
      // sens inverse (glisser un champ de fonction vers la liste des membres), donc vider le champ est
      // le seul moyen de désaffecter quelqu'un ; symétrique de assignerMembreAFonction ci-dessus, qui
      // fait déjà ça lors d'un remplacement par glisser-déposer.
      update({ membres: [...autres, { nom: ancienTitulaire.nom }] })
    } else {
      update({ membres: autres })
    }
  }

  const membresGeneraux = compagnie.membres.filter(m => !m.fonction)
  const retirerMembre = (nom: string) => update({ membres: compagnie.membres.filter(m => m.nom !== nom) })

  // Glisser un membre général sur un emplacement de fonction, plutôt que taper son nom — le drag-and-
  // drop HTML5 natif (draggable/dragover/drop) n'est pas fiable dans la webview Linux (WebKitGTK), voir
  // CombatTab.tsx : suivi au pointeur à la place, même principe (seuil de 5px, aperçu flottant en
  // portail, cible survolée détectée via elementFromPoint plutôt qu'un index de liste — les 5
  // emplacements de fonction sont des cibles distinctes, pas une liste réordonnable).
  const pointerDragMembreRef = useRef<{
    nom: string; width: number; height: number; startX: number; startY: number
    started: boolean; hoverFonction: FonctionMembre | null
  } | null>(null)
  const [dragMembreApercu, setDragMembreApercu] = useState<{ nom: string; width: number; height: number; x: number; y: number } | null>(null)
  const [hoverFonction, setHoverFonction] = useState<FonctionMembre | null>(null)

  const handleMembrePointerDown = (nom: string) => (e: React.PointerEvent<HTMLSpanElement>) => {
    if (e.button !== 0) return
    // Empêche la sélection de texte que le navigateur déclencherait sinon en suivant le pointeur
    // pendant le glisser (même précaution que handleCompagnonPointerDown dans CreationWizard.tsx).
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    pointerDragMembreRef.current = {
      nom, width: rect.width, height: rect.height, startX: e.clientX, startY: e.clientY,
      started: false, hoverFonction: null,
    }
  }

  // Retire l'entrée générale du membre glissé (il occupe désormais l'emplacement) ; l'ancien titulaire
  // de l'emplacement, s'il y en avait un, redevient membre général plutôt que d'être supprimé — glisser
  // un remplaçant ne doit jamais faire disparaître l'ancien titulaire de la compagnie.
  const assignerMembreAFonction = useCallback((nom: string, fonction: FonctionMembre) => {
    setCompagnie(prev => {
      const ancienTitulaire = prev.membres.find(m => m.fonction === fonction)
      const reste = prev.membres.filter(m => m.fonction !== fonction && m.nom !== nom)
      const membres = ancienTitulaire && ancienTitulaire.nom !== nom
        ? [...reste, { nom: ancienTitulaire.nom }, { fonction, nom }]
        : [...reste, { fonction, nom }]
      return { ...prev, membres, modifieLe: new Date().toISOString() }
    })
  }, [setCompagnie])

  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      const drag = pointerDragMembreRef.current
      if (!drag) return
      if (!drag.started) {
        if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 5) return
        drag.started = true
      }
      setDragMembreApercu({ nom: drag.nom, width: drag.width, height: drag.height, x: e.clientX, y: e.clientY })
      const cible = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-fonction-slot]')
      const fonction = (cible?.dataset.fonctionSlot as FonctionMembre | undefined) ?? null
      drag.hoverFonction = fonction
      setHoverFonction(fonction)
    }
    const handleUp = () => {
      const drag = pointerDragMembreRef.current
      if (drag?.started && drag.hoverFonction) assignerMembreAFonction(drag.nom, drag.hoverFonction)
      pointerDragMembreRef.current = null
      setDragMembreApercu(null)
      setHoverFonction(null)
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
  }, [assignerMembreAFonction])

  // Combobox des emplacements de fonction : la saisie libre reste possible (un PNJ sans fiche importée
  // n'a pas d'entrée dans compagnie.membres), mais une liste de suggestions s'ouvre en dessous dès que
  // le champ a le focus, filtrée par ce qui est tapé — complément du glisser-déposer ci-dessus, pas un
  // remplacement. Un seul champ à la fois est ouvert (fonctionFocus), donc une seule ref/position
  // suffisent, même principe que le champ d'ajout de tag dans SaveLoadPanel.tsx. Rendue dans un portail
  // en coordonnées d'écran (pas relatives au champ) pour ne jamais être rognée par un conteneur à
  // défilement, même raison que SaveLoadPanel.
  const fonctionInputRefs = useRef<Partial<Record<FonctionMembre, HTMLInputElement | null>>>({})
  const [fonctionFocus, setFonctionFocus] = useState<FonctionMembre | null>(null)
  const [cadreFonction, setCadreFonction] = useState<DOMRect | null>(null)

  const majPositionFonction = useCallback(() => {
    setCadreFonction(fonctionFocus ? fonctionInputRefs.current[fonctionFocus]?.getBoundingClientRect() ?? null : null)
  }, [fonctionFocus])

  useEffect(() => {
    if (!fonctionFocus) return
    majPositionFonction()
    window.addEventListener('scroll', majPositionFonction, true)
    window.addEventListener('resize', majPositionFonction)
    return () => {
      window.removeEventListener('scroll', majPositionFonction, true)
      window.removeEventListener('resize', majPositionFonction)
    }
  }, [fonctionFocus, majPositionFonction])

  // Choisir une suggestion route par assignerMembreAFonction (pas setNomFonction) : si le membre choisi
  // occupe déjà un AUTRE emplacement de fonction, setNomFonction se contenterait d'ajouter une seconde
  // entrée pour ce nom (doublon) au lieu de l'en retirer — assignerMembreAFonction gère déjà ce
  // remplacement croisé pour le glisser-déposer, la combobox réutilise la même logique.
  const choisirSuggestionFonction = (fonction: FonctionMembre, nom: string) => {
    assignerMembreAFonction(nom, fonction)
    setFonctionFocus(null)
  }
  // Un membre général n'a besoin que du nom du personnage — importer sa fiche complète (plutôt que de
  // le taper à la main, comme pour les fonctions) évite les fautes de frappe qui casseraient le
  // rattachement par nom (voir showCompagnieTab dans App.tsx, seul mécanisme de correspondance).
  const ajouterMembresDepuisFichiers = async (files: FileList) => {
    const noms: string[] = []
    const rejets: string[] = []
    for (const file of Array.from(files)) {
      try {
        const brut = JSON.parse(await file.text())
        const { type, contenu } = desenvelopper(brut)
        if (type && type !== 'personnage') { rejets.push(messageMauvaisType(t, 'personnage', type)); continue }
        const c = contenu as { character?: Character; caracteristiques?: unknown } | undefined
        const character: Character | undefined = c?.character ?? (c?.caracteristiques ? (c as Character) : undefined)
        if (character?.nomPersonnage?.trim()) noms.push(character.nomPersonnage.trim())
      } catch { /* fichier invalide, ignoré */ }
    }
    if (rejets.length > 0) { setMsg(rejets.join(' ')); setTimeout(() => setMsg(null), 5000) }
    if (noms.length === 0) return
    const existants = new Set(compagnie.membres.map(m => m.nom.trim().toLowerCase()))
    const aAjouter = [...new Set(noms)].filter(n => !existants.has(n.toLowerCase()))
    if (aAjouter.length > 0) update({ membres: [...compagnie.membres, ...aAjouter.map(nom => ({ nom }))] })
  }

  const choisirCapaciteAnarchique = (rang: number, capaciteNom: string) => {
    const cap = capacitesDisponiblesAnarchique(rang).find(c => c.nom === capaciteNom)
    if (!cap) return
    update({ choixAnarchique: { ...compagnie.choixAnarchique, [rang]: cap } })
  }

  // Missions de compagnie (voir utils/missions.ts) — créées/gérées ici même, diffusion en deux temps :
  // la donnée voyage hors-ligne avec le reste de la compagnie (export/import ci-dessous), et chaque
  // mutation diffuse en plus 'compagnie-missions-maj' à tous les joueurs actuellement connectés.
  // Volontariat/dialogue de mission (voir l'écoute réseau juste en dessous) : reçus ICI, indépendamment
  // de ReseauTab.tsx qui les traite aussi de son côté (même principe que CombatTab.tsx/ReseauTab.tsx,
  // chacun sa propre écoute réseau pour ses propres besoins) — sans ça, un MJ resté sur l'onglet
  // Compagnie (précisément où il gère ses missions) ne verrait jamais un volontariat arriver tant qu'il
  // n'a pas basculé sur Réseau, signalé par Didic.
  const [missionEnEdition, setMissionEnEdition] = useState<MissionCompagnie | null>(null)
  const [confirmDeleteMissionId, setConfirmDeleteMissionId] = useState<string | null>(null)
  const [renommeeAResoudre, setRenommeeAResoudre] = useState<Record<string, string>>({})
  const [messageMissionInput, setMessageMissionInput] = useState<Record<string, string>>({})
  const fichierIllustrationRef = useRef<HTMLInputElement>(null)
  // Trace du dialogue de chaque mission en cours (voir 'message-mission' plus bas) — pour que le MJ
  // puisse suivre la mission depuis cet onglet même, sans avoir besoin de basculer sur Réseau juste pour
  // ça (le relais aux autres volontaires, lui, se fait de toute façon indépendamment de cet affichage).
  const [dialogueMissions, setDialogueMissions] = useState<Record<string, { nom: string; texte: string }[]>>({})

  // dialoguesCoupesRef n'existe pas ici (pas de bouton de modération dans cet onglet) — les messages de
  // mission sont donc toujours relayés, jamais bloqués depuis cette écoute.
  const compagnieRef = useRef(compagnie)
  useEffect(() => { compagnieRef.current = compagnie }, [compagnie])
  // Correspondance connexion → identité de PJ, reconstruite ICI comme dans ReseauTab.tsx/CombatTab.tsx
  // (pas de state partagé entre les écoutes réseau indépendantes de chaque onglet, voir leur note).
  // useRef (pas une variable locale à l'effet) : envoyerMessageMissionMJ, déclenché par un clic sur le
  // bouton d'envoi, a besoin de la lire aussi, en dehors de l'écoute réseau elle-même.
  const identitesRef = useRef<Record<number, { nom: string; idPJ: string }>>({})

  useEffect(() => {
    let annule = false
    const gerer = (e: EvenementReseau) => {
      if (e.type === 'deconnexion') {
        delete identitesRef.current[e.id]
      } else if (e.type === 'message') {
        const message = decoderMessage(e.contenu)
        if (message?.type === 'identification') {
          identitesRef.current[e.id] = { nom: message.nom, idPJ: message.idPJ }
          // Synchronise les missions dès l'identification — sans ça, un PJ qui se (re)connecte alors que
          // des missions existent déjà ne les verrait qu'à la prochaine mutation faite par le MJ (voir la
          // même correction dans ReseauTab.tsx).
          envoyerAClientReseau(e.id, encoderMessage({ type: 'compagnie-missions-maj', missions: compagnieRef.current.missions }))
        } else if (message?.type === 'mission-volontaire') {
          const nom = identitesRef.current[e.id]?.nom
          if (!nom) return
          const mission = compagnieRef.current.missions.find(m => m.id === message.missionId)
          if (mission && peutSePorterVolontaire(mission, nom)) {
            const maintenant = new Date().toISOString()
            const missionsMaj = compagnieRef.current.missions.map(m =>
              m.id === mission.id ? { ...m, volontaires: [...m.volontaires, nom], modifieLe: maintenant } : m
            )
            setCompagnie(prev => ({ ...prev, missions: missionsMaj, modifieLe: maintenant }))
            envoyerATousReseau(encoderMessage({ type: 'compagnie-missions-maj', missions: missionsMaj }))
          }
        } else if (message?.type === 'message-mission') {
          const nom = identitesRef.current[e.id]?.nom
          if (!nom) return
          const mission = compagnieRef.current.missions.find(m => m.id === message.missionId)
          if (!mission) return
          const volontairesMinuscule = new Set(mission.volontaires.map(v => v.toLowerCase()))
          const contenu = encoderMessage({ type: 'message-mission-recu', missionId: mission.id, expediteurNom: nom, texte: message.texte })
          for (const [idStr, identite] of Object.entries(identitesRef.current)) {
            const id = Number(idStr)
            if (id !== e.id && volontairesMinuscule.has(identite.nom.toLowerCase())) envoyerAClientReseau(id, contenu)
          }
          setDialogueMissions(prev => ({
            ...prev,
            [mission.id]: [...(prev[mission.id] ?? []), { nom, texte: message.texte }].slice(-100),
          }))
        }
      }
    }
    let desabonner = () => {}
    ecouterReseau(gerer).then(fn => {
      if (annule) { fn(); return }
      desabonner = fn
      // Redemande à tous les clients déjà connectés de se réidentifier (voir le même correctif dans
      // ReseauTab.tsx/CombatTab.tsx) : identitesRef vient d'être recréé vide par ce montage, alors que
      // leur connexion WebSocket, elle, est restée ouverte depuis un potentiel précédent passage par un
      // autre onglet MJ.
      envoyerATousReseau(encoderMessage({ type: 'qui-etes-vous' }))
    })
    return () => { annule = true; desabonner() }
  }, [setCompagnie])

  const diffuserMissions = (missions: MissionCompagnie[]) => {
    envoyerATousReseau(encoderMessage({ type: 'compagnie-missions-maj', missions }))
  }
  const enregistrerMissions = (missions: MissionCompagnie[]) => {
    update({ missions })
    diffuserMissions(missions)
  }

  const nouvelleMission = () => setMissionEnEdition(MISSION_VIDE())
  const editerMission = (m: MissionCompagnie) => setMissionEnEdition({ ...m })
  const annulerEditionMission = () => setMissionEnEdition(null)

  const enregistrerEditionMission = () => {
    if (!missionEnEdition || !missionEnEdition.nom.trim()) return
    const maintenant = new Date().toISOString()
    const mission = { ...missionEnEdition, nom: missionEnEdition.nom.trim(), modifieLe: maintenant }
    const dejaPresente = compagnie.missions.some(m => m.id === mission.id)
    const missions = dejaPresente
      ? compagnie.missions.map(m => m.id === mission.id ? mission : m)
      : [...compagnie.missions, mission]
    enregistrerMissions(missions)
    setMissionEnEdition(null)
  }

  const supprimerMission = (id: string) => {
    enregistrerMissions(compagnie.missions.filter(m => m.id !== id))
    setConfirmDeleteMissionId(null)
  }

  const lancerMission = (id: string) => {
    const maintenant = new Date().toISOString()
    enregistrerMissions(compagnie.missions.map(m => m.id === id ? { ...m, statut: 'enCours', modifieLe: maintenant } : m))
  }

  // Repasse la mission à "proposée" — les volontaires restent (pas besoin de se reproposer), le MJ peut
  // relancer avec le même bouton "Lancer la mission" qui réapparaît alors. Ferme aussi la modale côté PJ
  // (voir missionsActives dans GameModePanel.tsx, filtré sur statut === 'enCours').
  const stopperMission = (id: string) => {
    const maintenant = new Date().toISOString()
    enregistrerMissions(compagnie.missions.map(m => m.id === id ? { ...m, statut: 'proposee', modifieLe: maintenant } : m))
  }

  // Le MJ participe aussi au dialogue de mission (pas seulement un relais entre PJ) — diffusé à tous
  // les volontaires actuellement connectés (identitesRef, voir l'écoute réseau plus haut), avec un écho
  // local dans dialogueMissions pour que le MJ voie tout de suite son propre message dans le fil.
  const envoyerMessageMissionMJ = (missionId: string) => {
    const texte = (messageMissionInput[missionId] ?? '').trim()
    if (!texte) return
    const mission = compagnie.missions.find(m => m.id === missionId)
    if (!mission) return
    const nomMJ = t('gmMode.missions.mjLabel')
    const volontairesMinuscule = new Set(mission.volontaires.map(v => v.toLowerCase()))
    const contenu = encoderMessage({ type: 'message-mission-recu', missionId, expediteurNom: nomMJ, texte })
    for (const [idStr, identite] of Object.entries(identitesRef.current)) {
      if (volontairesMinuscule.has(identite.nom.toLowerCase())) envoyerAClientReseau(Number(idStr), contenu)
    }
    setDialogueMissions(prev => ({
      ...prev,
      [missionId]: [...(prev[missionId] ?? []), { nom: nomMJ, texte }].slice(-100),
    }))
    setMessageMissionInput(prev => ({ ...prev, [missionId]: '' }))
  }

  // Réussie : ajoute la renommée saisie (pré-remplie avec la récompense de la mission, modifiable avant
  // validation) à compagnie.renommee — même geste que l'ajustement manuel ci-dessus. Échouée : change
  // seulement le statut, sans perte automatique (voir la règle du livre citée dans utils/missions.ts —
  // un échec isolé n'en fait pas perdre).
  const resoudreMission = (id: string, statut: 'reussie' | 'echouee') => {
    const maintenant = new Date().toISOString()
    const mission = compagnie.missions.find(m => m.id === id)
    if (!mission) return
    const missions = compagnie.missions.map(m => m.id === id ? { ...m, statut, modifieLe: maintenant } : m)
    if (statut === 'reussie') {
      const gagnee = parseInt(renommeeAResoudre[id] ?? String(mission.recompenseRenommee), 10)
      const delta = Number.isFinite(gagnee) ? gagnee : 0
      setCompagnie(prev => ({ ...prev, missions, renommee: Math.max(0, prev.renommee + delta), modifieLe: maintenant }))
      diffuserMissions(missions)
    } else {
      enregistrerMissions(missions)
    }
  }

  const ajouterButMission = () => setMissionEnEdition(prev => prev && {
    ...prev, buts: [...prev.buts, { id: crypto.randomUUID(), texte: '' }],
  })
  const modifierButMission = (butId: string, texte: string) => setMissionEnEdition(prev => prev && {
    ...prev, buts: prev.buts.map(b => b.id === butId ? { ...b, texte } : b),
  })
  const retirerButMission = (butId: string) => setMissionEnEdition(prev => prev && {
    ...prev, buts: prev.buts.filter(b => b.id !== butId),
  })

  const choisirIllustrationMission = (file: File) => {
    const reader = new FileReader()
    reader.onload = async () => {
      const data = reader.result
      if (typeof data !== 'string') return
      const cle = await importerImage('mission', data)
      setMissionEnEdition(prev => prev && { ...prev, illustration: cle })
    }
    reader.readAsDataURL(file)
  }

  const exporter = async () => {
    const content = JSON.stringify({ type: 'compagnie', data: compagnie }, null, 2)
    const safe = (compagnie.nom || 'compagnie').replace(/[^a-zA-Z0-9À-ÿ _-]/g, '').trim().replace(/\s+/g, '-') || 'compagnie'
    const chemin = `Maitre de jeu/${safe}.json`
    if (isTauri) {
      await saveDataFile(chemin, content)
      setMsg(t('gmMode.compagnie.exporteVers', { filename: chemin }))
      setTimeout(() => setMsg(null), 3000)
    } else {
      const blob = new Blob([content], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${safe}.json`; a.click()
      URL.revokeObjectURL(url)
    }
  }

  const importer = async (fichier: File) => {
    try {
      const brut = JSON.parse(await fichier.text())
      const { type, contenu } = desenvelopper(brut)
      if (type && type !== 'compagnie') {
        setMsg(messageMauvaisType(t, 'compagnie', type))
      } else {
        // Fusionné sur COMPAGNIE_PAR_DEFAUT (pas casté tel quel) : un export d'une version antérieure à
        // un champ ajouté depuis (ex. `membres`) planterait sinon tout accès direct à ce champ ailleurs
        // dans l'appli (voir la même précaution au chargement disque dans GameDataContext).
        setCompagnie({ ...COMPAGNIE_PAR_DEFAUT(), ...(contenu as Partial<Compagnie>) })
        setMsg(t('gmMode.compagnie.importReussi'))
      }
    } catch {
      setMsg(t('saveLoad.fichierInvalide'))
    }
    setTimeout(() => setMsg(null), 4000)
  }

  const rangArsenalFixe = compagnie.code && compagnie.code !== 'anarchique'
    ? (() => { const i = VOIE_COMPAGNIE[compagnie.code as Exclude<CodeCompagnie, 'anarchique'>].findIndex(c => c.domaine === 'arsenal'); return i === -1 ? null : i + 1 })()
    : null
  const capacitesArsenalActives = actives.filter(c => c.domaine === 'arsenal')

  return (
    <div style={{ maxWidth: 1020, margin: '0 auto' }}>

      {/* Identité */}
      <div style={panelStyle}>
        <div style={sectionTitreStyle}>{t('gmMode.compagnie.identite')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 14, marginBottom: 12 }}>
          <div>
            <div style={fieldLabelStyle}>{t('gmMode.compagnie.nomLabel')}</div>
            <input style={inputStyle} value={compagnie.nom} placeholder={t('gmMode.compagnie.nomPlaceholder')}
              onChange={e => update({ nom: e.target.value })} />
          </div>
          <div>
            <div style={fieldLabelStyle}>{t('gmMode.compagnie.siegeLabel')}</div>
            <input style={inputStyle} value={compagnie.siege} placeholder={t('gmMode.compagnie.siegePlaceholder')}
              onChange={e => update({ siege: e.target.value })} />
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={fieldLabelStyle}>{t('gmMode.compagnie.tailleLabel')}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {TAILLES_COMPAGNIE.map(taille => (
              <button key={taille} onClick={() => update({ taille })} style={{
                ...btnStyle, borderRadius: 999,
                background: compagnie.taille === taille ? 'rgba(201,168,76,0.18)' : 'transparent',
                borderColor: compagnie.taille === taille ? GOLD : 'rgba(201,168,76,0.3)',
              }}>
                {t(`gmMode.compagnie.taille.${taille}`)}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div style={fieldLabelStyle}>{t('gmMode.compagnie.histoireLabel')}</div>
          <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={compagnie.histoire}
            placeholder={t('gmMode.compagnie.histoirePlaceholder')} onChange={e => update({ histoire: e.target.value })} />
        </div>
      </div>

      {/* Renommée & niveau */}
      <div style={panelStyle}>
        <div style={sectionTitreStyle}>{t('gmMode.compagnie.renommeeTitre')}</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 38, fontWeight: 700, color: PARCHMENT, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {compagnie.renommee}
              <span style={{ fontSize: 14, fontWeight: 400, color: 'rgba(245,236,215,0.45)', marginLeft: 6 }}>
                {t('gmMode.compagnie.renommeeUnite')}
              </span>
            </div>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(201,168,76,0.1)',
            border: `1px solid ${GOLD}`, borderRadius: 6, padding: '6px 14px',
          }}>
            <span style={{ fontSize: 25, fontWeight: 700, color: GOLD, fontFamily: "'Cinzel', serif" }}>{niveau}</span>
            <span style={{ fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(245,236,215,0.5)' }}>
              {t('gmMode.compagnie.niveauLabel')}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="number" value={ajoutRenommee} onChange={e => setAjoutRenommee(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') appliquerAjoutRenommee() }}
              placeholder={t('gmMode.compagnie.ajouterRenommeePlaceholder')}
              style={{ ...inputStyle, width: 100 }} />
            <button style={btnStyle} onClick={appliquerAjoutRenommee}>{t('gmMode.compagnie.ajouterRenommee')}</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          {SEUILS_RENOMMEE.map((seuil, i) => (
            <div key={seuil} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{
                height: 5, borderRadius: 3, marginBottom: 4,
                background: compagnie.renommee >= seuil ? GOLD : 'rgba(255,255,255,0.08)',
              }} />
              <div style={{ fontSize: 12, color: 'rgba(245,236,215,0.4)', fontVariantNumeric: 'tabular-nums' }}>
                {seuil}{i === SEUILS_RENOMMEE.length - 1 ? '+' : ''}
              </div>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(245,236,215,0.3)' }}>
                {t('gmMode.compagnie.niveauAbrege', { n: i })}
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 14, color: 'rgba(245,236,215,0.45)', lineHeight: 1.5, borderTop: `1px dashed ${SECTION_BORDER}`, paddingTop: 10 }}>
          {t('gmMode.compagnie.renommeeAide')}
        </div>
      </div>

      {/* Code */}
      <div style={panelStyle}>
        <div style={sectionTitreStyle}>{t('gmMode.compagnie.codeTitre')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 10 }}>
          {(['altruiste', 'anarchique', 'autoritaire', 'solidaire'] as CodeCompagnie[]).map(code => (
            <button key={code} onClick={() => update({ code })} style={{
              textAlign: 'left', padding: '10px 12px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
              border: `1px solid ${compagnie.code === code ? GOLD : SECTION_BORDER}`,
              background: compagnie.code === code ? 'rgba(201,168,76,0.08)' : 'rgba(255,255,255,0.015)',
            }}>
              <div style={{ fontFamily: "'Cinzel', serif", fontSize: 16, fontWeight: 700, color: compagnie.code === code ? GOLD : PARCHMENT, marginBottom: 4 }}>
                {t(`gmMode.compagnie.code.${code}`)}
              </div>
              <div style={{ fontSize: 13, fontStyle: 'italic', color: 'rgba(245,236,215,0.55)', marginBottom: 6, minHeight: 32 }}>
                {DEVISE_CODE[code]}
              </div>
              <div style={{ fontSize: 12.5, color: 'rgba(245,236,215,0.4)', lineHeight: 1.4 }}>
                {DESCRIPTION_CODE[code]}
              </div>
            </button>
          ))}
        </div>
        <div style={{ fontSize: 13.5, color: 'rgba(245,236,215,0.4)' }}>{t('gmMode.compagnie.codeAide')}</div>
      </div>

      {/* Voie de compagnie */}
      <div style={panelStyle}>
        <div style={sectionTitreStyle}>{t('gmMode.compagnie.voieTitre')}</div>
        {!compagnie.code ? (
          <div style={{ fontSize: 14, color: 'rgba(245,236,215,0.4)', fontStyle: 'italic' }}>{t('gmMode.compagnie.voieAideCode')}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[1, 2, 3, 4, 5].map(rang => {
              const debloque = rang <= niveau
              const cap = capaciteAuRang(compagnie, rang)
              const estAnarchique = compagnie.code === 'anarchique'
              return (
                <div key={rang} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 6,
                  border: `1px solid ${debloque ? 'rgba(201,168,76,0.3)' : SECTION_BORDER}`,
                  background: debloque ? 'rgba(201,168,76,0.05)' : 'rgba(255,255,255,0.015)',
                  opacity: debloque ? 1 : 0.55,
                }}>
                  <span style={{ fontSize: 13, color: 'rgba(245,236,215,0.5)', width: 64, flexShrink: 0 }}>
                    {t('gmMode.compagnie.rangLabel', { n: rang })}
                  </span>
                  {estAnarchique ? (
                    <div style={{ flex: 1 }}>
                      <select
                        value={cap?.nom ?? ''}
                        onChange={e => choisirCapaciteAnarchique(rang, e.target.value)}
                        style={{ ...inputStyle, width: 'auto', background: 'var(--tdr-dark)' }}
                      >
                        <option value="" style={{ background: 'var(--tdr-dark)', color: PARCHMENT }}>{t('gmMode.compagnie.choisirCapacite')}</option>
                        {capacitesDisponiblesAnarchique(rang).map(c => (
                          <option key={c.nom} value={c.nom} style={{ background: 'var(--tdr-dark)', color: PARCHMENT }}>{c.nom}</option>
                        ))}
                      </select>
                      {cap && <div style={{ fontSize: 13, color: 'rgba(245,236,215,0.5)', marginTop: 4, lineHeight: 1.4 }}>{descriptionCapacite(cap.nom, compagnie.code)}</div>}
                    </div>
                  ) : cap ? (
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: COULEUR_DOMAINE[cap.domaine], flexShrink: 0 }} />
                        <span style={{ fontSize: 15, fontWeight: 600, color: debloque ? GOLD : PARCHMENT }}>{cap.nom}</span>
                      </div>
                      <div style={{ fontSize: 13, color: 'rgba(245,236,215,0.45)', marginTop: 3, lineHeight: 1.4 }}>
                        {descriptionCapacite(cap.nom, compagnie.code)}
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 12, fontSize: 12.5, color: 'rgba(245,236,215,0.4)' }}>
          {(['arsenal', 'influence', 'tactique'] as DomaineCapacite[]).map(d => (
            <span key={d} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: COULEUR_DOMAINE[d] }} />
              {t(`gmMode.compagnie.domaine.${d}`)}
            </span>
          ))}
        </div>
      </div>

      {/* Capacités actives */}
      {actives.length > 0 && (
        <div style={panelStyle}>
          <div style={sectionTitreStyle}>{t('gmMode.compagnie.capacitesActivesTitre')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {actives.map(cap => (
              <div key={cap.nom} style={{
                display: 'flex', gap: 10, padding: '8px 12px', borderRadius: 5,
                background: 'rgba(255,255,255,0.02)', border: `1px solid ${SECTION_BORDER}`,
                borderLeft: `3px solid ${COULEUR_DOMAINE[cap.domaine]}`,
              }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: PARCHMENT }}>{cap.nom}</div>
                  <div style={{ fontSize: 13.5, color: 'rgba(245,236,215,0.5)', marginTop: 2, lineHeight: 1.5 }}>
                    {descriptionCapacite(cap.nom, compagnie.code)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Membres & fonctions — un personnage dont le nom figure dans l'une ou l'autre des deux listes
          ci-dessous (membre général ou emplacement de fonction) voit alors un onglet Compagnie
          apparaître sur sa propre fiche (voir showCompagnieTab dans App.tsx), avec un aperçu simplifié
          de cette page. */}
      <div style={panelStyle}>
        <div style={sectionTitreStyle}>{t('gmMode.compagnie.membresTitre')}</div>

        <div style={{ marginBottom: 16 }}>
          <div style={fieldLabelStyle}>{t('gmMode.compagnie.membresGenerauxLabel')}</div>
          {membresGeneraux.length === 0 ? (
            <div style={{ fontSize: 14, color: 'rgba(245,236,215,0.4)', fontStyle: 'italic', marginBottom: 8 }}>
              {t('gmMode.compagnie.aucunMembre')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
              {membresGeneraux.map(m => (
                <span key={m.nom}
                  onPointerDown={handleMembrePointerDown(m.nom)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 999,
                    border: `1px solid ${SECTION_BORDER}`, background: 'rgba(255,255,255,0.02)', fontSize: 14.5, color: PARCHMENT,
                    cursor: 'grab', touchAction: 'none', userSelect: 'none', opacity: dragMembreApercu?.nom === m.nom ? 0.35 : 1,
                  }}
                >
                  {m.nom}
                  <button onClick={() => retirerMembre(m.nom)} onPointerDown={e => e.stopPropagation()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,110,110,0.7)', fontSize: 14, padding: 0, lineHeight: 1 }}>✕</button>
                </span>
              ))}
            </div>
          )}
          <button style={btnStyle} onClick={() => membreFileInputRef.current?.click()}>{t('gmMode.compagnie.importerMembre')}</button>
          <input ref={membreFileInputRef} type="file" accept=".json" multiple style={{ display: 'none' }}
            onChange={e => { if (e.target.files) ajouterMembresDepuisFichiers(e.target.files); e.target.value = '' }} />
          <div style={{ fontSize: 13, color: 'rgba(245,236,215,0.4)', marginTop: 6, lineHeight: 1.5 }}>
            {t('gmMode.compagnie.membresAide')}
          </div>
        </div>

        <div style={fieldLabelStyle}>{t('gmMode.compagnie.fonctionsLabel')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 10 }}>
          {FONCTIONS_MEMBRE.map(fonction => (
            <div key={fonction} data-fonction-slot={fonction} style={{
              border: `1px solid ${hoverFonction === fonction ? GOLD : SECTION_BORDER}`, borderRadius: 6, padding: '9px 11px',
              background: hoverFonction === fonction ? 'rgba(201,168,76,0.12)' : 'rgba(255,255,255,0.02)',
              transition: 'background 0.1s, border-color 0.1s',
            }}>
              <div style={fieldLabelStyle}>{t(`gmMode.compagnie.fonction.${fonction}`)}</div>
              <input
                ref={el => { fonctionInputRefs.current[fonction] = el }}
                style={inputStyle} value={nomPourFonction(fonction)} placeholder={t('gmMode.compagnie.vacant')}
                onChange={e => setNomFonction(fonction, e.target.value)}
                onFocus={() => setFonctionFocus(fonction)}
                onBlur={() => setFonctionFocus(null)}
              />
            </div>
          ))}
        </div>
        <div style={{ fontSize: 13, color: 'rgba(245,236,215,0.4)', marginTop: 8, lineHeight: 1.5 }}>
          {t('gmMode.compagnie.glisserMembreAide')}
        </div>
      </div>

      {/* Suggestions de la combobox de fonction : membres existants correspondant à la saisie (ou tous
          si le champ est vide), routées par assignerMembreAFonction — voir sa raison d'être plus haut. */}
      {fonctionFocus && cadreFonction && (() => {
        const occupantActuel = compagnie.membres.find(m => m.fonction === fonctionFocus)
        const saisie = nomPourFonction(fonctionFocus).trim().toLowerCase()
        const suggestions = compagnie.membres
          .filter(m => m !== occupantActuel)
          .filter(m => !saisie || m.nom.toLowerCase().includes(saisie))
          .slice(0, 6)
        if (suggestions.length === 0) return null
        const placeDessous = window.innerHeight - cadreFonction.bottom
        const versLeHaut = placeDessous < 180 && cadreFonction.top > placeDessous
        return createPortal(
          <div style={{
            position: 'fixed', left: cadreFonction.left, width: Math.max(cadreFonction.width, 140), zIndex: 2000,
            ...(versLeHaut
              ? { bottom: window.innerHeight - cadreFonction.top + 2, maxHeight: Math.max(120, cadreFonction.top - 12) }
              : { top: cadreFonction.bottom + 2, maxHeight: Math.max(120, placeDessous - 12) }),
            background: 'var(--tdr-dark)', border: '1px solid rgba(201,168,76,0.35)', borderRadius: 4,
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)', overflowY: 'auto',
          }}>
            {suggestions.map(m => (
              <div
                key={m.nom}
                // onMouseDown (pas onClick) + preventDefault : le blur du champ (déclenché par le
                // déplacement du focus) ne doit pas fermer la liste avant que le clic n'ait pu s'exécuter.
                onMouseDown={ev => { ev.preventDefault(); choisirSuggestionFonction(fonctionFocus, m.nom) }}
                style={{ padding: '6px 12px', fontSize: 14.5, color: PARCHMENT, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                {m.nom}
                {m.fonction && (
                  <span style={{ fontSize: 12.5, color: 'rgba(245,236,215,0.4)', marginLeft: 6 }}>
                    ({t(`gmMode.compagnie.fonction.${m.fonction}`)})
                  </span>
                )}
              </div>
            ))}
          </div>,
          document.body
        )
      })()}

      {dragMembreApercu && createPortal(
        <div style={{
          position: 'fixed', zIndex: 2000, pointerEvents: 'none',
          left: dragMembreApercu.x - dragMembreApercu.width / 2, top: dragMembreApercu.y - dragMembreApercu.height / 2,
          width: dragMembreApercu.width, padding: '6px 12px', borderRadius: 999,
          border: `1px solid ${GOLD}`, background: 'rgba(30,24,15,0.98)', fontSize: 14.5, color: GOLD,
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)', textAlign: 'center', whiteSpace: 'nowrap',
        }}>
          {dragMembreApercu.nom}
        </div>,
        document.body
      )}

      {/* Missions — diffusées aux PJ via l'onglet Compagnie côté joueur (CharacterCompagnieTab.tsx),
          visibles hors-ligne (voyagent avec le reste de la compagnie via export/import ci-dessous) ;
          se porter volontaire et dialoguer pendant la mission nécessitent en revanche une connexion au
          réseau local (voir ReseauTab.tsx pour la réception). */}
      <div style={panelStyle}>
        <div style={sectionTitreStyle}>{t('gmMode.missions.titre')}</div>
        <div style={{ fontSize: 13, color: 'rgba(245,236,215,0.45)', marginBottom: 14, lineHeight: 1.5 }}>
          {t('gmMode.missions.intro')}
        </div>

        {missionEnEdition ? (
          <div style={{ border: `1px solid ${SECTION_BORDER}`, borderRadius: 6, padding: '14px 16px', marginBottom: 14 }}>
            <div style={{ ...sectionTitreStyle, fontSize: 14, marginBottom: 12 }}>
              {compagnie.missions.some(m => m.id === missionEnEdition.id) ? t('gmMode.missions.modifierTitre') : t('gmMode.missions.nouvelleMission')}
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={fieldLabelStyle}>{t('gmMode.missions.nomLabel')}</div>
              <input style={inputStyle} value={missionEnEdition.nom} placeholder={t('gmMode.missions.nomPlaceholder')}
                onChange={e => setMissionEnEdition(prev => prev && { ...prev, nom: e.target.value })} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={fieldLabelStyle}>{t('gmMode.missions.descriptionLabel')}</div>
              <textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }} value={missionEnEdition.description}
                placeholder={t('gmMode.missions.descriptionPlaceholder')}
                onChange={e => setMissionEnEdition(prev => prev && { ...prev, description: e.target.value })} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <div style={fieldLabelStyle}>{t('gmMode.missions.typeLabel')}</div>
                <select
                  value={missionEnEdition.type}
                  onChange={e => setMissionEnEdition(prev => prev && { ...prev, type: e.target.value as TypeMission })}
                  style={{ ...inputStyle, background: 'var(--tdr-dark)' }}
                >
                  {TYPES_MISSION.map(tp => (
                    <option key={tp} value={tp} style={{ background: 'var(--tdr-dark)', color: PARCHMENT }}>
                      {t(`gmMode.missions.type.${tp}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div style={fieldLabelStyle}>{t('gmMode.missions.participantsLabel')}</div>
                <NumberField min={1} value={missionEnEdition.nombreParticipants}
                  onChange={n => setMissionEnEdition(prev => prev && { ...prev, nombreParticipants: n ?? 1 })} style={inputStyle} />
              </div>
              <div>
                <div style={fieldLabelStyle}>{t('gmMode.missions.recompenseLabel')}</div>
                <NumberField min={0} value={missionEnEdition.recompenseRenommee}
                  onChange={n => setMissionEnEdition(prev => prev && { ...prev, recompenseRenommee: n ?? 0 })} style={inputStyle} />
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={fieldLabelStyle}>{t('gmMode.missions.illustrationLabel')}</div>
              <MissionIllustration cle={missionEnEdition.illustration} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={btnStyle} onClick={() => fichierIllustrationRef.current?.click()}>
                  🖼️ {t('gmMode.missions.importerIllustration')}
                </button>
                {missionEnEdition.illustration && (
                  <button style={removeBtnStyle} onClick={() => setMissionEnEdition(prev => prev && { ...prev, illustration: undefined })}>
                    {t('gmMode.missions.retirerIllustration')}
                  </button>
                )}
                <input ref={fichierIllustrationRef} type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) choisirIllustrationMission(f); e.target.value = '' }} />
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={fieldLabelStyle}>{t('gmMode.missions.butsLabel')}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                {missionEnEdition.buts.map(but => (
                  <div key={but.id} style={{ display: 'flex', gap: 8 }}>
                    <input style={inputStyle} value={but.texte} placeholder={t('gmMode.missions.butPlaceholder')}
                      onChange={e => modifierButMission(but.id, e.target.value)} />
                    <button onClick={() => retirerButMission(but.id)} style={removeBtnStyle}>✕</button>
                  </div>
                ))}
              </div>
              <button style={btnStyle} onClick={ajouterButMission}>+ {t('gmMode.missions.ajouterBut')}</button>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ ...btnStyle, borderColor: GOLD, background: 'rgba(201,168,76,0.12)' }} onClick={enregistrerEditionMission}>
                {t('gmMode.missions.enregistrer')}
              </button>
              <button style={btnStyle} onClick={annulerEditionMission}>{t('gmMode.missions.annuler')}</button>
            </div>
          </div>
        ) : (
          <button style={{ ...btnStyle, marginBottom: 14 }} onClick={nouvelleMission}>
            + {t('gmMode.missions.nouvelleMission')}
          </button>
        )}

        {compagnie.missions.length === 0 ? (
          <div style={{ fontSize: 14, color: 'rgba(245,236,215,0.4)', fontStyle: 'italic', textAlign: 'center', padding: '10px 0' }}>
            {t('gmMode.missions.aucuneMission')}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {compagnie.missions.map(mission => (
              <div key={mission.id} style={{ border: `1px solid ${SECTION_BORDER}`, borderRadius: 6, padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: PARCHMENT, fontFamily: "'Cinzel', serif" }}>{mission.nom}</div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                        color: COULEUR_STATUT[mission.statut], border: `1px solid ${COULEUR_STATUT[mission.statut]}`,
                        borderRadius: 10, padding: '2px 8px',
                      }}>
                        {t(`gmMode.missions.statut.${mission.statut}`)}
                      </span>
                      <span style={{ fontSize: 12.5, color: 'rgba(245,236,215,0.5)' }}>{t(`gmMode.missions.type.${mission.type}`)}</span>
                      <span style={{ fontSize: 12.5, color: 'rgba(245,236,215,0.5)' }}>
                        {t('gmMode.missions.slotsLabel', { n: mission.volontaires.length, total: mission.nombreParticipants })}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button style={btnStyle} onClick={() => editerMission(mission)}>✎ {t('gmMode.missions.modifier')}</button>
                    {confirmDeleteMissionId === mission.id ? (
                      <button style={removeBtnStyle} onClick={() => supprimerMission(mission.id)}>{t('gmMode.missions.confirmerSuppression')}</button>
                    ) : (
                      <button style={removeBtnStyle} onClick={() => setConfirmDeleteMissionId(mission.id)}>✕</button>
                    )}
                  </div>
                </div>

                <MissionIllustration cle={mission.illustration} />

                {mission.description && (
                  <div style={{ fontSize: 13.5, color: 'rgba(245,236,215,0.65)', lineHeight: 1.5, marginBottom: 10 }}>
                    {mission.description}
                  </div>
                )}

                <div style={{ fontSize: 13, color: 'rgba(245,236,215,0.5)', marginBottom: 10 }}>
                  🏅 {t('gmMode.missions.recompenseRenommee', { n: mission.recompenseRenommee })}
                </div>

                {mission.buts.length > 0 && (
                  <ul style={{ margin: '0 0 10px', paddingLeft: 20, fontSize: 13, color: 'rgba(245,236,215,0.6)' }}>
                    {mission.buts.map(but => <li key={but.id}>{but.texte}</li>)}
                  </ul>
                )}

                <div style={{ marginBottom: 10 }}>
                  <div style={fieldLabelStyle}>{t('gmMode.missions.volontairesLabel')}</div>
                  {mission.volontaires.length === 0 ? (
                    <div style={{ fontSize: 12.5, color: 'rgba(245,236,215,0.35)', fontStyle: 'italic' }}>
                      {t('gmMode.missions.aucunVolontaire')}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {mission.volontaires.map(nom => (
                        <span key={nom} style={{
                          fontSize: 12.5, padding: '3px 10px', borderRadius: 999,
                          border: `1px solid ${SECTION_BORDER}`, color: PARCHMENT,
                        }}>
                          {nom}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {mission.statut === 'proposee' && mission.volontaires.length > 0 && (
                  <button style={{ ...btnStyle, borderColor: 'rgba(160,120,255,0.6)', background: 'rgba(140,100,255,0.15)', color: 'rgba(210,185,255,0.95)' }}
                    onClick={() => lancerMission(mission.id)}>
                    ▶ {t('gmMode.missions.lancerMission')}
                  </button>
                )}

                {mission.statut === 'enCours' && (
                  <>
                    {/* Dialogue de mission — le MJ y participe aussi (pas qu'un relais entre PJ), voir
                        envoyerMessageMissionMJ. Les PJ le voient dans la modale de leur Mode de jeu
                        (voir GameModePanel.tsx), avec les mêmes lignes (jets de dé compris, postés comme
                        un message formaté — voir posterJetMission). */}
                    <div style={{ borderTop: `1px dashed ${SECTION_BORDER}`, paddingTop: 8, marginBottom: 10 }}>
                      <div style={fieldLabelStyle}>{t('gmMode.missions.dialogueTitre')}</div>
                      <div style={{
                        maxHeight: 140, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3,
                        fontSize: 12.5, color: 'rgba(245,236,215,0.75)', marginBottom: 6,
                      }}>
                        {(dialogueMissions[mission.id]?.length ?? 0) === 0
                          ? <span style={{ opacity: 0.4, fontStyle: 'italic' }}>{t('gmMode.missions.dialogueVide')}</span>
                          : dialogueMissions[mission.id].map((l, i) => <div key={i}><strong>{l.nom}</strong> : {l.texte}</div>)}
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input
                          style={inputStyle} value={messageMissionInput[mission.id] ?? ''}
                          onChange={e => setMessageMissionInput(prev => ({ ...prev, [mission.id]: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') envoyerMessageMissionMJ(mission.id) }}
                          placeholder={t('gmMode.missions.dialoguePlaceholder')}
                        />
                        <button style={btnStyle} onClick={() => envoyerMessageMissionMJ(mission.id)}>
                          {t('gmMode.missions.envoyer')}
                        </button>
                      </div>
                    </div>

                    <div style={{ borderTop: `1px dashed ${SECTION_BORDER}`, paddingTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <button style={btnStyle} onClick={() => stopperMission(mission.id)}>
                        ⏸ {t('gmMode.missions.stopperMission')}
                      </button>
                      <span style={fieldLabelStyle}>{t('gmMode.missions.resoudreTitre')}</span>
                      <NumberField min={0} value={parseInt(renommeeAResoudre[mission.id] ?? String(mission.recompenseRenommee), 10)}
                        onChange={n => setRenommeeAResoudre(prev => ({ ...prev, [mission.id]: String(n ?? 0) }))}
                        style={{ ...inputStyle, width: 90 }} />
                      <button style={{ ...btnStyle, borderColor: 'rgba(120,220,140,0.5)', color: 'rgba(120,220,140,0.95)' }}
                        onClick={() => resoudreMission(mission.id, 'reussie')}>
                        ✓ {t('gmMode.missions.reussie')}
                      </button>
                      <button style={{ ...btnStyle, borderColor: 'rgba(230,110,110,0.5)', color: 'rgba(230,110,110,0.95)' }}
                        onClick={() => resoudreMission(mission.id, 'echouee')}>
                        ✕ {t('gmMode.missions.echouee')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Arsenal */}
      <div style={panelStyle}>
        <div style={sectionTitreStyle}>{t('gmMode.compagnie.arsenalTitre')}</div>
        {!compagnie.code ? (
          <div style={{ fontSize: 14, color: 'rgba(245,236,215,0.4)', fontStyle: 'italic' }}>{t('gmMode.compagnie.arsenalAucunCode')}</div>
        ) : capacitesArsenalActives.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {capacitesArsenalActives.map(cap => (
              <div key={cap.nom} style={{ fontSize: 14.5, color: 'rgba(245,236,215,0.7)', lineHeight: 1.5 }}>
                <strong style={{ color: GOLD }}>{cap.nom}</strong> — {descriptionCapacite(cap.nom, compagnie.code)}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 14, color: 'rgba(245,236,215,0.4)' }}>
            🔒 {rangArsenalFixe
              ? t('gmMode.compagnie.arsenalVerrouilleRang', { n: rangArsenalFixe })
              : t('gmMode.compagnie.arsenalVerrouille')}
          </div>
        )}
      </div>

      {/* Export / Import */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button style={btnStyle} onClick={() => fileInputRef.current?.click()}>{t('gmMode.compagnie.importer')}</button>
        <button style={btnStyle} onClick={exporter}>{t('gmMode.compagnie.exporter')}</button>
        <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) importer(f); e.target.value = '' }} />
        {msg && <span style={{ fontSize: 14, color: GOLD }}>✓ {msg}</span>}
      </div>
    </div>
  )
}
