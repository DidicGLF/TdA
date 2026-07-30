import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import NumberField from '../NumberField'
import { saveDataFile } from '../../utils/tauriStorage'
import { flushAllSaves } from '../../utils/saveManager'
import { useGameData } from '../../context/GameDataContext'
import ENCHANTEMENTS_RAW from '../../data/enchantements-magiques.json'
import type {
  ObjetMagiqueEntry, ObjetMagiqueCategorie, ObjetMagiqueSlot, TraditionPeuple, EnchantementApplique, CapaciteEffet,
} from '../../types/gameData'

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

const GOLD = '#c9a84c'
const PARCHMENT = '#f5ecd7'
const SECTION_BORDER = 'rgba(201,168,76,0.2)'
const CARACS = ['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA'] as const
const TRADITIONS: TraditionPeuple[] = ['elfe', 'nain', 'orc', 'gobelin', 'ogre']
const CATEGORIES: ObjetMagiqueCategorie[] = ['traditionnel', 'focalisateur', 'legendaire']
const SLOTS: ObjetMagiqueSlot[] = ['arme', 'armure', 'bouclier', 'focalisateur', 'accessoire']

// Plafond de niveau de magie total par catégorie (Livre du meneur p.183-190) : 5 pour un objet
// traditionnel ou un focalisateur, 15 pour un objet légendaire.
const PLAFOND: Record<ObjetMagiqueCategorie, number> = { traditionnel: 5, focalisateur: 5, legendaire: 15 }

type RefEnchantement = {
  nom?: string
  degre?: number
  niveauMagie: number
  effets: CapaciteEffet[] | null
  texte: string
  necessiteChoixDegats?: boolean
  choixDegatsOptions?: string[]
  choixDegatsValeur?: string
}
type EnchantementsData = {
  traditions: Record<TraditionPeuple, Partial<Record<'arme' | 'armure' | 'bouclier', RefEnchantement[]>>>
  focalisateur: RefEnchantement[]
  supplementaires: { arme: RefEnchantement[]; armure: RefEnchantement[]; focalisateur: RefEnchantement[] }
  legendaires: { arme: RefEnchantement[]; armure: RefEnchantement[]; focalisateur: RefEnchantement[] }
}
const ENCHANTEMENTS = ENCHANTEMENTS_RAW as unknown as EnchantementsData

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 4,
  color: PARCHMENT, fontSize: 13, padding: '5px 8px', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
}
const selectStyle: React.CSSProperties = { ...inputStyle, background: 'var(--tdr-dark)' }
const optionStyle: React.CSSProperties = { background: 'var(--tdr-dark)', color: PARCHMENT }
const labelStyle: React.CSSProperties = {
  fontSize: 11, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4, display: 'block',
}
const sectionTitleStyle: React.CSSProperties = {
  fontSize: 14, fontWeight: 700, color: GOLD, fontFamily: "'Cinzel', serif", letterSpacing: '0.04em',
  borderBottom: `1px solid ${SECTION_BORDER}`, paddingBottom: 6, marginBottom: 10,
}
const columnTitleStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, color: 'rgba(245,236,215,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em',
}
const removeBtnStyle: React.CSSProperties = {
  background: 'transparent', border: '1px solid rgba(255,80,80,0.3)', borderRadius: 4,
  color: 'rgba(255,110,110,0.8)', cursor: 'pointer', fontSize: 12, padding: '4px 8px', flexShrink: 0,
}
const addBtnStyle: React.CSSProperties = {
  background: 'transparent', border: '1px dashed rgba(201,168,76,0.4)', borderRadius: 4,
  color: 'rgba(201,168,76,0.8)', cursor: 'pointer', fontSize: 12, padding: '6px 10px', alignSelf: 'flex-start',
}

function refVersApplique(ref: RefEnchantement, nomAffiche: string, choixDegats?: string): EnchantementApplique {
  const effets = ref.necessiteChoixDegats && choixDegats
    ? [{ stat: `RD_${choixDegats}`, valeur: ref.choixDegatsValeur ?? '0' }]
    : (ref.effets ?? undefined)
  return { nom: nomAffiche, niveauMagie: ref.niveauMagie, effets, texte: ref.texte }
}

interface Props {
  objet: ObjetMagiqueEntry
  onChange: (patch: Partial<ObjetMagiqueEntry>) => void
  onDelete: () => void
  lectureSeule?: boolean
}

export default function ObjetMagiqueDetail({ objet, onChange, onDelete, lectureSeule = false }: Props) {
  const { t } = useTranslation()
  const { data: descriptions } = useGameData()
  const [exportMsg, setExportMsg] = useState<string | null>(null)
  const [forgeMsg, setForgeMsg] = useState<string | null>(null)
  const [plafondMsg, setPlafondMsg] = useState<string | null>(null)
  const [choixDegatsArme, setChoixDegatsArme] = useState<string>('FEU')
  const [choixDegatsArmure, setChoixDegatsArmure] = useState<string>('FEU')
  const [choixDegatsFocalisateur, setChoixDegatsFocalisateur] = useState<string>('FEU')
  const [puissanceCarac, setPuissanceCarac] = useState<typeof CARACS[number]>('FOR')
  const [puissanceBonus, setPuissanceBonus] = useState(1)
  const [pouvoirNom, setPouvoirNom] = useState('')
  const [pouvoirNiveau, setPouvoirNiveau] = useState(1)
  const [pouvoirTexte, setPouvoirTexte] = useState('')
  // Pré-remplissage optionnel depuis un rang de voie existant (nom + description) — le livre du meneur
  // (p.190) donne un rang de voie comme premier exemple d'enchantement de pouvoir. On ne préremplit QUE
  // nom/niveau/texte, jamais l'effet chiffré (les rangs stockent leurs effets dans un format différent,
  // lié à un personnage précis) — l'inventer librement en dessous reste toujours possible et prioritaire.
  const [pouvoirVoieNom, setPouvoirVoieNom] = useState('')
  const [pouvoirRangIdx, setPouvoirRangIdx] = useState('')
  const rangsPourVoiePouvoir = descriptions[pouvoirVoieNom] ?? []
  const utiliserRangPouvoir = () => {
    const rang = rangsPourVoiePouvoir[parseInt(pouvoirRangIdx)]
    if (!rang) return
    setPouvoirNom(rang.nom)
    setPouvoirTexte(rang.desc)
    setPouvoirNiveau(parseInt(pouvoirRangIdx) + 1)
  }

  const enchantements = objet.enchantements
  const setEnchantements = (next: EnchantementApplique[]) => {
    const niveauMagie = (objet.niveauMagieBase ?? 0) + next.reduce((s, e) => s + e.niveauMagie, 0)
    onChange({ enchantements: next, niveauMagie, valeur: niveauMagie * niveauMagie * 200 })
  }

  const plafond = PLAFOND[objet.categorie]
  const totalActuel = enchantements.reduce((s, e) => s + e.niveauMagie, 0) + (objet.niveauMagieBase ?? 0)
  // Avertissement affiché quand une action est bloquée par le plafond de niveau de magie — avant, ces
  // actions ne faisaient simplement rien de visible, ce qui passait pour un bug (signalé par Didic).
  const avertirPlafond = () => {
    setPlafondMsg(t('gmMode.objetMagiqueDetail.plafondAtteint', { plafond }))
    setTimeout(() => setPlafondMsg(null), 3000)
  }

  // L'enchantement de base (tradition ou focalisateur, degré de qualité) est un enchantement comme un
  // autre dans `enchantements` (voir la note sur ObjetMagiqueEntry.enchantements) — repéré par ce nom
  // conventionnel, unique par construction (un seul choisi à la fois).
  const NOM_BASE = 'Base tradition/focalisateur'
  const baseActuelle = enchantements.find(e => e.nom === NOM_BASE)

  const setBase = (ref: RefEnchantement | null) => {
    const reste = enchantements.filter(e => e.nom !== NOM_BASE)
    if (ref) {
      const resteTotal = reste.reduce((s, e) => s + e.niveauMagie, 0) + (objet.niveauMagieBase ?? 0)
      if (resteTotal + ref.niveauMagie > plafond) { avertirPlafond(); return }
    }
    setEnchantements(ref ? [refVersApplique(ref, NOM_BASE, undefined), ...reste] : reste)
  }

  const toggleSupplementaire = (ref: RefEnchantement, choixDegats?: string) => {
    const nomAffiche = ref.nom!
    const dejaPresent = enchantements.find(e => e.nom === nomAffiche)
    if (dejaPresent) {
      setEnchantements(enchantements.filter(e => e.nom !== nomAffiche))
      return
    }
    if (totalActuel + ref.niveauMagie > plafond) { avertirPlafond(); return }
    setEnchantements([...enchantements, refVersApplique(ref, nomAffiche, choixDegats)])
  }

  // Préfixes utilisés pour distinguer, dans `enchantements`, ce qui vient du picker (légendaires/
  // supplémentaires), de la puissance ou du pouvoir — sert à répartir la colonne "objet fini" en trois
  // listes distinctes (voir le rendu plus bas).
  const prefixPuissance = t('gmMode.objetMagiqueDetail.puissance')
  const prefixPouvoir = `${t('gmMode.objetMagiqueDetail.pouvoir')}: `

  const ajouterPuissance = () => {
    const niveauMagie = puissanceBonus + 1
    if (totalActuel + niveauMagie > plafond) { avertirPlafond(); return }
    const nom = `${prefixPuissance} (${puissanceCarac} +${puissanceBonus})`
    setEnchantements([...enchantements.filter(e => !e.nom.startsWith(prefixPuissance)), {
      nom, niveauMagie, effets: [{ stat: puissanceCarac, valeur: String(puissanceBonus) }],
      texte: `+${puissanceBonus} ${puissanceCarac}`,
    }])
  }

  const ajouterPouvoir = () => {
    if (!pouvoirNom.trim()) return
    if (totalActuel + pouvoirNiveau > plafond) { avertirPlafond(); return }
    setEnchantements([...enchantements.filter(e => !e.nom.startsWith(prefixPouvoir)), {
      nom: `${prefixPouvoir}${pouvoirNom.trim()}`, niveauMagie: pouvoirNiveau, texte: pouvoirTexte.trim() || undefined,
    }])
    setPouvoirNom(''); setPouvoirNiveau(1); setPouvoirTexte('')
  }

  const retirerEnchantement = (nom: string) => setEnchantements(enchantements.filter(e => e.nom !== nom))

  const enchLegendairesAppliques = enchantements.filter(e => e.nom !== NOM_BASE && !e.nom.startsWith(prefixPuissance) && !e.nom.startsWith(prefixPouvoir))
  const enchPuissanceAppliques = enchantements.filter(e => e.nom.startsWith(prefixPuissance))
  const enchPouvoirAppliques = enchantements.filter(e => e.nom.startsWith(prefixPouvoir))

  const degresDisponibles: RefEnchantement[] = objet.categorie === 'focalisateur'
    ? ENCHANTEMENTS.focalisateur
    : objet.categorie === 'traditionnel' && objet.tradition && (objet.slot === 'arme' || objet.slot === 'armure' || objet.slot === 'bouclier')
      ? ENCHANTEMENTS.traditions[objet.tradition][objet.slot] ?? []
      : []

  const supplementairesDisponibles: RefEnchantement[] =
    objet.slot === 'arme' ? ENCHANTEMENTS.supplementaires.arme
      : objet.slot === 'armure' ? ENCHANTEMENTS.supplementaires.armure
        : objet.slot === 'focalisateur' ? ENCHANTEMENTS.supplementaires.focalisateur
          : []
  const legendairesDisponibles: RefEnchantement[] =
    objet.slot === 'arme' ? ENCHANTEMENTS.legendaires.arme
      : objet.slot === 'armure' ? ENCHANTEMENTS.legendaires.armure
        : objet.slot === 'focalisateur' ? ENCHANTEMENTS.legendaires.focalisateur
          : []

  const exporterObjet = async () => {
    const content = JSON.stringify({ type: 'objet-magique', data: objet }, null, 2)
    const safe = objet.nom.replace(/[^a-zA-Z0-9À-ÿ _-]/g, '').trim().replace(/\s+/g, '-') || 'objet-magique'
    const filename = `${safe}.json`
    const chemin = `Maitre de jeu/${filename}`
    if (isTauri) {
      await saveDataFile(chemin, content)
      setExportMsg(t('gmMode.objetMagiqueDetail.exporteVers', { filename: chemin }))
      setTimeout(() => setExportMsg(null), 3000)
    } else {
      const blob = new Blob([content], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = filename; a.click()
      URL.revokeObjectURL(url)
    }
  }

  // Chaque modification part déjà en écriture disque automatiquement (comme le reste de l'app —
  // bestiaire, capacités...), mais en différé de 500ms (voir saveManager.DEBOUNCE_MS) : "Forger" force
  // cette écriture immédiatement au lieu d'attendre, avec une vraie confirmation une fois le fichier
  // effectivement sur le disque — un bouton "Sauvegarder" à part n'aurait rien fait de plus.
  const forger = async () => {
    setForgeMsg(t('gmMode.objetMagiqueDetail.forgeEnCours'))
    await flushAllSaves()
    setForgeMsg(t('gmMode.objetMagiqueDetail.forgeConfirmation'))
    setTimeout(() => setForgeMsg(null), 2500)
  }

  const fieldsetStyle: React.CSSProperties = { display: 'contents', border: 'none', margin: 0, padding: 0, minWidth: 0 }
  const enchRow = (e: EnchantementApplique) => (
    <div key={e.nom} style={{ display: 'flex', flexDirection: 'column', gap: 2, border: `1px solid ${SECTION_BORDER}`, borderRadius: 6, padding: '6px 10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontWeight: 700, flex: 1 }}>{e.nom}</span>
        <span style={{ fontSize: 11, opacity: 0.6 }}>({t('gmMode.objetMagiqueDetail.niveauAbrege', { n: e.niveauMagie })})</span>
        <button onClick={() => retirerEnchantement(e.nom)} style={removeBtnStyle}>✕</button>
      </div>
      {e.texte && <span style={{ fontSize: 14, opacity: 0.75 }}>{e.texte}</span>}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 28 }}>

        {/* ── Colonne gauche : possibilités de création ── */}
        <fieldset disabled={lectureSeule} style={fieldsetStyle}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            <div style={columnTitleStyle}>{t('gmMode.objetMagiqueDetail.colonneCreation')}</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', gap: 20 }}>
                <div style={{ flex: 1 }}>
                  <span style={labelStyle}>{t('gmMode.objetMagiqueDetail.categorieLabel')}</span>
                  <select value={objet.categorie} style={selectStyle} onChange={e => {
                    const categorie = e.target.value as ObjetMagiqueCategorie
                    // La base tradition/focalisateur ne s'applique qu'aux catégories concernées — on la
                    // retire si elle devient incohérente avec la nouvelle catégorie.
                    const enchantementsNettoyes = categorie === 'focalisateur' || categorie === 'traditionnel'
                      ? enchantements
                      : enchantements.filter(x => x.nom !== NOM_BASE)
                    const niveauMagie = (objet.niveauMagieBase ?? 0) + enchantementsNettoyes.reduce((s, x) => s + x.niveauMagie, 0)
                    onChange({
                      categorie,
                      slot: categorie === 'focalisateur' ? 'focalisateur' : objet.slot,
                      tradition: categorie === 'traditionnel' ? objet.tradition : undefined,
                      enchantements: enchantementsNettoyes, niveauMagie, valeur: niveauMagie * niveauMagie * 200,
                    })
                  }}>
                    {CATEGORIES.map(c => <option key={c} value={c} style={optionStyle}>{t(`gmMode.objetMagiqueDetail.categorie.${c}`)}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <span style={labelStyle}>{t('gmMode.objetMagiqueDetail.slotLabel')}</span>
                  <select value={objet.slot} disabled={objet.categorie === 'focalisateur'} style={selectStyle}
                    onChange={e => onChange({ slot: e.target.value as ObjetMagiqueSlot })}>
                    {SLOTS.filter(s => objet.categorie !== 'focalisateur' || s === 'focalisateur').map(s => (
                      <option key={s} value={s} style={optionStyle}>{t(`gmMode.objetMagiqueDetail.slot.${s}`)}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Niveau de magie : base tradition/focalisateur + narratif — même style de titre que les
                  autres sous-sections (Enchantements.../Puissance/Pouvoir) pour rester bien visible :
                  labelStyle (11px, terne) rendait ce bloc trop discret, au point de sembler vide. */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={sectionTitleStyle}>{t('gmMode.objetMagiqueDetail.niveauMagieSection')}</div>
                {objet.categorie === 'traditionnel' && (
                  <div style={{ display: 'flex', gap: 20 }}>
                    <div style={{ flex: 1 }}>
                      <span style={labelStyle}>{t('gmMode.objetMagiqueDetail.traditionLabel')}</span>
                      <select value={objet.tradition ?? ''} style={selectStyle}
                        onChange={e => { onChange({ tradition: (e.target.value || undefined) as TraditionPeuple | undefined }); setBase(null) }}>
                        <option value="" style={optionStyle}>—</option>
                        {TRADITIONS.map(tr => <option key={tr} value={tr} style={optionStyle}>{t(`gmMode.objetMagiqueDetail.tradition.${tr}`)}</option>)}
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <span style={labelStyle}>{t('gmMode.objetMagiqueDetail.degreQualite')}</span>
                      <select
                        value={baseActuelle ? String(degresDisponibles.findIndex(d => d.niveauMagie === baseActuelle.niveauMagie)) : ''}
                        disabled={degresDisponibles.length === 0}
                        style={selectStyle}
                        onChange={e => setBase(e.target.value === '' ? null : degresDisponibles[parseInt(e.target.value)])}
                      >
                        <option value="" style={optionStyle}>—</option>
                        {degresDisponibles.map((d, i) => (
                          <option key={i} value={i} style={optionStyle}>{t(`gmMode.objetMagiqueDetail.degre${d.degre}`)} ({t('gmMode.objetMagiqueDetail.niveauAbrege', { n: d.niveauMagie })})</option>
                        ))}
                      </select>
                      {degresDisponibles.length === 0 && objet.tradition && (
                        <span style={{ fontSize: 11, opacity: 0.6 }}>{t('gmMode.objetMagiqueDetail.combinaisonIndisponible')}</span>
                      )}
                    </div>
                  </div>
                )}
                {objet.categorie === 'focalisateur' && (
                  <div>
                    <span style={labelStyle}>{t('gmMode.objetMagiqueDetail.degreQualite')}</span>
                    <select
                      value={baseActuelle ? String(ENCHANTEMENTS.focalisateur.findIndex(d => d.niveauMagie === baseActuelle.niveauMagie)) : ''}
                      style={{ ...selectStyle, maxWidth: 260 }}
                      onChange={e => setBase(e.target.value === '' ? null : ENCHANTEMENTS.focalisateur[parseInt(e.target.value)])}
                    >
                      <option value="" style={optionStyle}>—</option>
                      {ENCHANTEMENTS.focalisateur.map((d, i) => (
                        <option key={i} value={i} style={optionStyle}>{t(`gmMode.objetMagiqueDetail.degre${d.degre}`)} ({t('gmMode.objetMagiqueDetail.niveauAbrege', { n: d.niveauMagie })})</option>
                      ))}
                    </select>
                  </div>
                )}
                {baseActuelle?.texte && <div style={{ fontSize: 12, opacity: 0.75, fontStyle: 'italic' }}>{baseActuelle.texte}</div>}

                {/* Niveau de magie narratif (accessoire, pouvoir inédit...) */}
                <div style={{ maxWidth: 260 }}>
                  <span style={labelStyle}>{t('gmMode.objetMagiqueDetail.niveauMagieBase')}</span>
                  <NumberField value={objet.niveauMagieBase ?? 0} onChange={n => {
                    const base = n ?? 0
                    const niveauMagie = base + enchantements.reduce((s, e) => s + e.niveauMagie, 0)
                    onChange({ niveauMagieBase: base, niveauMagie, valeur: niveauMagie * niveauMagie * 200 })
                  }} style={inputStyle} />
                </div>
              </div>
            </div>

            {/* Enchantements légendaires/supplémentaires (picker) */}
            {(objet.categorie === 'traditionnel' || objet.categorie === 'focalisateur') && supplementairesDisponibles.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={sectionTitleStyle}>{t('gmMode.objetMagiqueDetail.enchantementsSupplementaires')}</div>
                {supplementairesDisponibles.map(ref => {
                  const coche = enchantements.some(e => e.nom === ref.nom)
                  // Volontairement PAS un vrai `disabled` HTML : un checkbox désactivé n'émet plus
                  // d'onChange, donc plus aucun moyen d'avertir pourquoi le clic ne fait rien (signalé
                  // par Didic) — la case reste cliquable, toggleSupplementaire affiche l'avertissement.
                  const depasserait = !coche && totalActuel + ref.niveauMagie > plafond
                  return (
                    <div key={ref.nom} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, opacity: depasserait ? 0.4 : 1 }}
                        title={depasserait ? t('gmMode.objetMagiqueDetail.plafondAtteint', { plafond }) : undefined}>
                        <input type="checkbox" checked={coche}
                          onChange={() => toggleSupplementaire(ref,
                            ref.necessiteChoixDegats ? (objet.slot === 'arme' ? choixDegatsArme : objet.slot === 'armure' ? choixDegatsArmure : choixDegatsFocalisateur) : undefined)} />
                        <span style={{ fontWeight: 700 }}>{ref.nom}</span>
                        <span style={{ fontSize: 11, opacity: 0.6 }}>({t('gmMode.objetMagiqueDetail.niveauAbrege', { n: ref.niveauMagie })})</span>
                        <span style={{ fontSize: 14, opacity: 0.75, flex: 1 }}>{ref.texte}</span>
                      </label>
                      {ref.necessiteChoixDegats && (
                        <select value={objet.slot === 'arme' ? choixDegatsArme : objet.slot === 'armure' ? choixDegatsArmure : choixDegatsFocalisateur}
                          disabled={coche} style={{ ...selectStyle, width: 100 }}
                          onChange={e => (objet.slot === 'arme' ? setChoixDegatsArme : objet.slot === 'armure' ? setChoixDegatsArmure : setChoixDegatsFocalisateur)(e.target.value)}>
                          {(ref.choixDegatsOptions ?? []).map(opt => <option key={opt} value={opt} style={optionStyle}>{t(`gameMode.dmType${opt}`, opt)}</option>)}
                        </select>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            {objet.categorie === 'legendaire' && legendairesDisponibles.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={sectionTitleStyle}>{t('gmMode.objetMagiqueDetail.enchantementsLegendaires')}</div>
                {legendairesDisponibles.map(ref => {
                  const coche = enchantements.some(e => e.nom === ref.nom)
                  // Volontairement PAS un vrai `disabled` HTML : un checkbox désactivé n'émet plus
                  // d'onChange, donc plus aucun moyen d'avertir pourquoi le clic ne fait rien (signalé
                  // par Didic) — la case reste cliquable, toggleSupplementaire affiche l'avertissement.
                  const depasserait = !coche && totalActuel + ref.niveauMagie > plafond
                  return (
                    <div key={ref.nom} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, opacity: depasserait ? 0.4 : 1 }}
                        title={depasserait ? t('gmMode.objetMagiqueDetail.plafondAtteint', { plafond }) : undefined}>
                        <input type="checkbox" checked={coche}
                          onChange={() => toggleSupplementaire(ref,
                            ref.necessiteChoixDegats ? (objet.slot === 'arme' ? choixDegatsArme : objet.slot === 'armure' ? choixDegatsArmure : choixDegatsFocalisateur) : undefined)} />
                        <span style={{ fontWeight: 700 }}>{ref.nom}</span>
                        <span style={{ fontSize: 11, opacity: 0.6 }}>({t('gmMode.objetMagiqueDetail.niveauAbrege', { n: ref.niveauMagie })})</span>
                        <span style={{ fontSize: 14, opacity: 0.75, flex: 1 }}>{ref.texte}</span>
                      </label>
                      {ref.necessiteChoixDegats && (
                        <select value={objet.slot === 'arme' ? choixDegatsArme : objet.slot === 'armure' ? choixDegatsArmure : choixDegatsFocalisateur}
                          disabled={coche} style={{ ...selectStyle, width: 100 }}
                          onChange={e => (objet.slot === 'arme' ? setChoixDegatsArme : objet.slot === 'armure' ? setChoixDegatsArmure : setChoixDegatsFocalisateur)(e.target.value)}>
                          {(ref.choixDegatsOptions ?? []).map(opt => <option key={opt} value={opt} style={optionStyle}>{t(`gameMode.dmType${opt}`, opt)}</option>)}
                        </select>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Puissance (+Mod.Carac) et Pouvoir (réplique une capacité) : sur mesure par nature (voir
                la note sur ObjetMagiqueEntry), un seul de chaque à la fois. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={sectionTitleStyle}>{t('gmMode.objetMagiqueDetail.puissance')}</div>
              <div style={{ fontSize: 13, opacity: 0.55, fontStyle: 'italic' }}>{t('gmMode.objetMagiqueDetail.puissanceHint')}</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select value={puissanceCarac} style={{ ...selectStyle, width: 90 }} onChange={e => setPuissanceCarac(e.target.value as typeof CARACS[number])}>
                  {CARACS.map(c => <option key={c} value={c} style={optionStyle}>{c}</option>)}
                </select>
                <span>+</span>
                <NumberField value={puissanceBonus} min={1} onChange={n => setPuissanceBonus(n ?? 1)} style={{ ...inputStyle, width: 60 }} />
                <button onClick={ajouterPuissance} style={addBtnStyle}>
                  + {t('gmMode.objetMagiqueDetail.ajouter')} ({t('gmMode.objetMagiqueDetail.niveauAbrege', { n: puissanceBonus + 1 })})
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={sectionTitleStyle}>{t('gmMode.objetMagiqueDetail.pouvoir')}</div>
              <div style={{ fontSize: 13, opacity: 0.55, fontStyle: 'italic' }}>{t('gmMode.objetMagiqueDetail.pouvoirHint')}</div>

              {/* Pré-remplissage optionnel depuis un rang de voie (nom+description) — n'importe quand
                  librement écrasable dans les champs juste en dessous. */}
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={pouvoirVoieNom} onChange={e => { setPouvoirVoieNom(e.target.value); setPouvoirRangIdx('') }}
                  list="pouvoir-voies-datalist" placeholder={t('gmMode.objetMagiqueDetail.pouvoirVoiePlaceholder')} style={{ ...inputStyle, flex: 2 }} />
                <datalist id="pouvoir-voies-datalist">
                  {Object.keys(descriptions).map(nom => <option key={nom} value={nom} />)}
                </datalist>
                <select value={pouvoirRangIdx} disabled={rangsPourVoiePouvoir.length === 0} style={{ ...selectStyle, width: 200 }}
                  onChange={e => setPouvoirRangIdx(e.target.value)}>
                  <option value="" style={optionStyle}>{t('gmMode.objetMagiqueDetail.pouvoirRangPlaceholder')}</option>
                  {rangsPourVoiePouvoir.map((r, i) => (
                    <option key={i} value={i} style={optionStyle}>{t('recto.rangLabel', { n: i + 1 })} — {r.nom}</option>
                  ))}
                </select>
                <button onClick={utiliserRangPouvoir} disabled={pouvoirRangIdx === ''} style={addBtnStyle}>
                  ↓ {t('gmMode.objetMagiqueDetail.pouvoirUtiliserRang')}
                </button>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <input value={pouvoirNom} onChange={e => setPouvoirNom(e.target.value)}
                  placeholder={t('gmMode.objetMagiqueDetail.pouvoirNomPlaceholder')} style={{ ...inputStyle, flex: 2 }} />
                <NumberField value={pouvoirNiveau} min={1} onChange={n => setPouvoirNiveau(n ?? 1)} style={{ ...inputStyle, width: 60 }} />
                <button onClick={ajouterPouvoir} disabled={!pouvoirNom.trim()} style={addBtnStyle}>
                  + {t('gmMode.objetMagiqueDetail.ajouter')}
                </button>
              </div>
              <textarea value={pouvoirTexte} onChange={e => setPouvoirTexte(e.target.value)}
                placeholder={t('gmMode.objetMagiqueDetail.pouvoirTextePlaceholder')} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
          </div>
        </fieldset>

        {/* ── Colonne droite : l'objet fini ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22, borderLeft: '1px dashed rgba(201,168,76,0.4)', paddingLeft: 28 }}>
          <div style={columnTitleStyle}>{t('gmMode.objetMagiqueDetail.colonneResultat')}</div>

          <fieldset disabled={lectureSeule} style={fieldsetStyle}>
            <input
              value={objet.nom}
              onChange={e => onChange({ nom: e.target.value })}
              style={{ ...inputStyle, fontSize: 20, fontWeight: 700, color: GOLD, fontFamily: "'Cinzel', serif", letterSpacing: '0.03em' }}
            />
          </fieldset>

          <div>
            <span style={labelStyle}>{t('gmMode.objetMagiqueDetail.description')}</span>
            <fieldset disabled={lectureSeule} style={fieldsetStyle}>
              <textarea value={objet.description ?? ''} onChange={e => onChange({ description: e.target.value })}
                rows={4} style={{ ...inputStyle, fontSize: 15, resize: 'vertical', lineHeight: 1.5 }} />
            </fieldset>
          </div>

          {enchLegendairesAppliques.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={sectionTitleStyle}>{t('gmMode.objetMagiqueDetail.enchantementsLegendairesAppliques')}</div>
              <fieldset disabled={lectureSeule} style={{ ...fieldsetStyle, display: 'contents' }}>
                {enchLegendairesAppliques.map(enchRow)}
              </fieldset>
            </div>
          )}
          {enchPuissanceAppliques.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={sectionTitleStyle}>{t('gmMode.objetMagiqueDetail.enchantementsPuissanceAppliques')}</div>
              <fieldset disabled={lectureSeule} style={{ ...fieldsetStyle, display: 'contents' }}>
                {enchPuissanceAppliques.map(enchRow)}
              </fieldset>
            </div>
          )}
          {enchPouvoirAppliques.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={sectionTitleStyle}>{t('gmMode.objetMagiqueDetail.enchantementsPouvoirAppliques')}</div>
              <fieldset disabled={lectureSeule} style={{ ...fieldsetStyle, display: 'contents' }}>
                {enchPouvoirAppliques.map(enchRow)}
              </fieldset>
            </div>
          )}
          {enchLegendairesAppliques.length === 0 && enchPuissanceAppliques.length === 0 && enchPouvoirAppliques.length === 0 && (
            <div style={{ fontSize: 13, opacity: 0.4, fontStyle: 'italic' }}>{t('gmMode.objetMagiqueDetail.aucunEnchantement')}</div>
          )}

          {plafondMsg && (
            <div style={{ fontSize: 13, color: '#e08080', border: '1px solid rgba(224,128,128,0.4)', borderRadius: 6, padding: '6px 10px' }}>
              ⚠ {plafondMsg}
            </div>
          )}
          <div style={{ display: 'flex', gap: 24, padding: 12, border: `1px solid ${SECTION_BORDER}`, borderRadius: 6 }}>
            <div>
              <span style={labelStyle}>{t('gmMode.objetMagiqueDetail.niveauMagieTotal')}</span>
              <span style={{ fontSize: 20, fontWeight: 700, color: totalActuel > plafond ? '#e08080' : GOLD }}>
                {objet.niveauMagie} / {plafond}
              </span>
            </div>
            <div>
              <span style={labelStyle}>{t('gmMode.objetMagiqueDetail.valeur')}</span>
              <span style={{ fontSize: 20, fontWeight: 700, color: GOLD }}>{objet.valeur} po</span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={forger} style={{
              padding: '10px 20px', borderRadius: 6, fontSize: 15, fontWeight: 700, cursor: 'pointer',
              border: `1px solid ${GOLD}`, background: 'rgba(201,168,76,0.15)', color: GOLD,
              fontFamily: "'Cinzel', serif", letterSpacing: '0.05em',
            }}>
              🔨 {t('gmMode.objetMagiqueDetail.forger')}
            </button>
            {forgeMsg && <span style={{ fontSize: 13, color: 'rgba(140,215,160,0.95)' }}>{forgeMsg}</span>}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderTop: `1px solid ${SECTION_BORDER}`, paddingTop: 16 }}>
        <button onClick={exporterObjet} style={{ ...addBtnStyle, alignSelf: undefined, padding: '6px 12px', fontSize: 15 }}>
          {t('gmMode.objetMagiqueDetail.exporter')}
        </button>
        <button onClick={onDelete} style={{ ...removeBtnStyle, alignSelf: 'flex-start', padding: '6px 12px', fontSize: 15 }}>
          {t('gmMode.objetMagiqueDetail.supprimer')}
        </button>
        {exportMsg && <span style={{ fontSize: 12, opacity: 0.7, color: GOLD }}>{exportMsg}</span>}
      </div>
    </div>
  )
}
