import { useState, type CSSProperties } from 'react'
import { useImage } from '../../hooks/useImage'
import { importerImage, oublierImage, estCleImage, chargerImage } from '../../utils/imageStore'
import { imageEncoreUtilisee } from '../../utils/bestiairePerso'
import { useTranslation } from 'react-i18next'
import CreatureImage from './CreatureImage'
import NumberField from '../NumberField'
import { saveDataFile } from '../../utils/tauriStorage'
import { useGameData } from '../../context/GameDataContext'
import type { BestiaireEntry, CreatureAttaque, CreatureCapacite, CreatureVoie, CapaciteEffet } from '../../types/gameData'

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

const GOLD = '#c9a84c'
const PARCHMENT = '#f5ecd7'
const SECTION_BORDER = 'rgba(201,168,76,0.2)'
const CARACS = ['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA'] as const
// Tailles définies par le Livre du Meneur — liste fermée plutôt qu'un champ libre.
const TAILLES = ['Minuscule', 'Très petite', 'Petite', 'Moyenne', 'Grande', 'Énorme', 'Colossale'] as const
// Statistiques modifiables par un effet de capacité — les mêmes identifiants que ceux déjà utilisés
// par les ajustements manuels du MJ en combat (voir stat= sur StatCell dans CombatCard/PJCard).
const EFFET_STATS = [...CARACS, 'DEF', 'RD', 'INIT', 'ATK', 'DM'] as const
// Types de dégâts auxquels une RD peut être limitée (ex. "RD 5 (Feu, Froid)" dans le livre) — mêmes
// codes et icônes que DAMAGE_TYPES/DAMAGE_TYPE_ICONS dans GameModePanel, dupliqués ici car locaux à
// ce fichier (pas d'export partagé pour l'instant).
const TYPES_DEGATS = ['FEU', 'FROID', 'FOUDRE', 'ACIDE', 'POISON', 'NECROTIQUE', 'TENEBRES', 'LUMIERE', 'MENTAL', 'TRANCHANT', 'PERFORANT', 'CONTONDANT'] as const
const ICONES_TYPES_DEGATS: Record<string, string> = {
  FEU: '🔥', FROID: '❄️', FOUDRE: '⚡', ACIDE: '🧪', POISON: '☠️', NECROTIQUE: '🪦',
  TENEBRES: '🌑', LUMIERE: '☀️', MENTAL: '🧠', TRANCHANT: '🗡️', PERFORANT: '🏹', CONTONDANT: '🔨',
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 4,
  color: PARCHMENT, fontSize: 13, padding: '5px 8px', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
}
// Fond opaque : sur Windows, la liste déroulante d'un <select> est un popup natif hors de la
// page — un fond translucide y est composité sur blanc au lieu du thème sombre.
const selectStyle: React.CSSProperties = { ...inputStyle, background: 'var(--tdr-dark)' }
const optionStyle: React.CSSProperties = { background: 'var(--tdr-dark)', color: PARCHMENT }
const labelStyle: React.CSSProperties = {
  fontSize: 11, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4, display: 'block',
}
const sectionTitleStyle: React.CSSProperties = {
  fontSize: 14, fontWeight: 700, color: GOLD, fontFamily: "'Cinzel', serif", letterSpacing: '0.04em',
  borderBottom: `1px solid ${SECTION_BORDER}`, paddingBottom: 6, marginBottom: 10,
}
const removeBtnStyle: React.CSSProperties = {
  background: 'transparent', border: '1px solid rgba(255,80,80,0.3)', borderRadius: 4,
  color: 'rgba(255,110,110,0.8)', cursor: 'pointer', fontSize: 12, padding: '4px 8px', flexShrink: 0,
}
const addBtnStyle: React.CSSProperties = {
  background: 'transparent', border: '1px dashed rgba(201,168,76,0.4)', borderRadius: 4,
  color: 'rgba(201,168,76,0.8)', cursor: 'pointer', fontSize: 12, padding: '6px 10px', alignSelf: 'flex-start',
}

const genId = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : String(Date.now())

// Retire les retours à la ligne de mise en page (typiquement un copier-coller depuis un PDF en 2
// colonnes, où chaque ligne visuelle de la colonne devient un vrai saut de ligne) sans perdre les
// VRAIS sauts de paragraphe : une ligne vide (2 sauts consécutifs ou plus) est préservée en tant que
// paragraphe, un saut isolé devient un simple espace.
const MARQUEUR_PARAGRAPHE = '\u0001'
function nettoyerTextePDF(texte: string): string {
  return texte
    .replace(/\r\n/g, '\n')
    .replace(/\n{2,}/g, MARQUEUR_PARAGRAPHE)
    .replace(/\n/g, ' ')
    .split(MARQUEUR_PARAGRAPHE).join('\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

// Colle le texte nettoyé (voir nettoyerTextePDF) à la position du curseur d'un <textarea> contrôlé —
// remplace la sélection courante comme un collage normal, contourné via preventDefault car on ne veut
// pas des retours à la ligne bruts du presse-papiers.
function collerTexteNettoye(e: React.ClipboardEvent<HTMLTextAreaElement>, valeurActuelle: string, onValeur: (v: string) => void) {
  e.preventDefault()
  const texte = nettoyerTextePDF(e.clipboardData.getData('text/plain'))
  const { selectionStart, selectionEnd } = e.currentTarget
  onValeur(valeurActuelle.slice(0, selectionStart) + texte + valeurActuelle.slice(selectionEnd))
}

interface Props {
  creature: BestiaireEntry
  onChange: (patch: Partial<BestiaireEntry>) => void
  onDelete: () => void
  // Créature livrée avec l'application : la fiche n'est pas modifiable (pour la changer, l'utilisateur
  // la clone), **sauf son illustration** — chacun met la sienne, et ça ne doit pas figer les
  // statistiques de la fiche. Voir la séparation livré/perso dans GameDataContext.
  lectureSeule?: boolean
  // Créature livrée : elle n'est jamais supprimée, seulement masquée — y compris quand elle reste
  // modifiable (mode auteur), d'où un drapeau distinct de lectureSeule.
  masquageAuLieuDeSuppression?: boolean
  // Créature livrée déjà masquée : le bouton de suppression n'aurait plus rien à faire.
  suppressionDesactivee?: boolean
}

// display:contents fait disparaître le fieldset de la mise en page (ses enfants restent des enfants
// directs de la grille/flexbox qui l'entoure), alors que l'attribut disabled continue de désactiver
// tous les champs qu'il contient — c'est ce qui permet de rendre la fiche non modifiable sans
// toucher à sa disposition ni ajouter un `disabled` sur la cinquantaine de champs qu'elle contient.
const fieldsetStyle: CSSProperties = { display: 'contents', border: 'none', margin: 0, padding: 0, minWidth: 0 }

export default function CreatureDetail({ creature, onChange, onDelete, lectureSeule = false, masquageAuLieuDeSuppression = false, suppressionDesactivee = false }: Props) {
  const { t } = useTranslation()
  const { capacitesBibliotheque, setCapacitesBibliotheque, data: descriptions, bestiaire, bestiaireIllustrations } = useGameData()
  const imageSrc = useImage(creature.image)
  const [exportMsg, setExportMsg] = useState<string | null>(null)
  const [biblioMsg, setBiblioMsg] = useState<string | null>(null)

  const caracs = creature.caracteristiques ?? { FOR: '', DEX: '', CON: '', INT: '', SAG: '', CHA: '' }
  const setCarac = (key: typeof CARACS[number], value: string) =>
    onChange({ caracteristiques: { ...caracs, [key]: value } })

  const rdTypes = creature.rdTypes ?? []
  const toggleRdType = (type: string) =>
    onChange({ rdTypes: rdTypes.includes(type) ? rdTypes.filter(x => x !== type) : [...rdTypes, type] })

  const attaques = creature.attaques ?? []
  const setAttaques = (next: CreatureAttaque[]) => onChange({ attaques: next })

  const capacites = creature.capacites ?? []
  const setCapacites = (next: CreatureCapacite[]) => onChange({ capacites: next })

  // Taper un nom qui correspond exactement à une capacité de la bibliothèque copie sa description et
  // son effet — seulement si la capacité en cours est encore vide, pour ne jamais écraser une capacité
  // déjà personnalisée qui porterait par coïncidence le même nom.
  const setCapaciteNom = (i: number, nom: string) => {
    const c = capacites[i]
    const match = capacitesBibliotheque.find(cb => cb.nom === nom)
    if (match && !c.desc.trim() && !(c.effets && c.effets.length)) {
      setCapacites(capacites.map((x, j) => j === i
        ? { ...x, nom, desc: match.desc, effets: match.effets?.map(ef => ({ ...ef })) }
        : x))
    } else {
      setCapacites(capacites.map((x, j) => j === i ? { ...x, nom } : x))
    }
  }

  const setCapaciteEffets = (i: number, effets: CapaciteEffet[]) =>
    setCapacites(capacites.map((x, j) => j === i ? { ...x, effets } : x))

  // Enregistre (ou met à jour, si le nom existe déjà) cette capacité dans la bibliothèque partagée,
  // pour pouvoir la réutiliser directement sur une autre créature sans la retaper.
  const ajouterALaBibliotheque = (c: CreatureCapacite) => {
    if (!c.nom.trim()) return
    const existante = capacitesBibliotheque.find(cb => cb.nom === c.nom)
    const entry = { id: existante?.id ?? genId(), nom: c.nom, desc: c.desc, effets: c.effets }
    setCapacitesBibliotheque(prev => existante ? prev.map(cb => cb.id === entry.id ? entry : cb) : [...prev, entry])
    setBiblioMsg(existante ? t('gmMode.creatureDetail.biblioMiseAJour') : t('gmMode.creatureDetail.biblioAjoutee'))
    setTimeout(() => setBiblioMsg(null), 2500)
  }

  const voies = creature.voies ?? []
  const setVoies = (next: CreatureVoie[]) => onChange({ voies: next })

  // Récupère les rangs (nom + description) d'une voie déjà connue (celles des PJ, voir descriptions.json)
  // plutôt que de les retaper à la main — seulement si le nom saisi correspond exactement à une voie
  // existante, jusqu'au rang atteint par la créature (v.rang). Remplace les rangs déjà présents.
  const recupererRangsVoie = (i: number) => {
    const v = voies[i]
    const rangsSource = descriptions[v.nom]
    if (!rangsSource) return
    const nouveauxRangs = rangsSource.slice(0, v.rang).map((r, k) => ({ rang: k + 1, nom: r.nom, desc: r.desc }))
    setVoies(voies.map((x, j) => j === i ? { ...x, rangs: nouveauxRangs } : x))
  }

  const exporterCreature = async () => {
    // L'illustration vit dans images/ et la créature n'en garde qu'une clé : on la réincorpore, sans
    // quoi le fichier partagé pointerait vers un fichier absent de la machine du destinataire.
    const aExporter = estCleImage(creature.image)
      ? { ...creature, image: (await chargerImage(creature.image!)) ?? '' }
      : creature
    const content = JSON.stringify({ type: 'creature', data: aExporter }, null, 2)
    const safe = creature.nom.replace(/[^a-zA-Z0-9À-ÿ _-]/g, '').trim().replace(/\s+/g, '-') || 'creature'
    const filename = `${safe}.json`
    const chemin = `Maitre de jeu/${filename}`
    if (isTauri) {
      await saveDataFile(chemin, content)
      setExportMsg(t('gmMode.creatureDetail.exporteVers', { filename: chemin }))
      setTimeout(() => setExportMsg(null), 3000)
    } else {
      const blob = new Blob([content], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = filename; a.click()
      URL.revokeObjectURL(url)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {/* Identité */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <fieldset disabled={lectureSeule} style={fieldsetStyle}>
          <input
            value={creature.nom}
            onChange={e => onChange({ nom: e.target.value })}
            style={{ ...inputStyle, fontSize: 20, fontWeight: 700, color: GOLD, fontFamily: "'Cinzel', serif", letterSpacing: '0.03em' }}
          />
        </fieldset>
        {/* Grille 4 colonnes (NC / Taille / Aperçue dans / Image) : la colonne Image chevauche les 3
            lignes de gauche (NC-row / Description / Caractéristiques-StatsCombat), ce qui aligne son
            label "Image" avec NC/Taille/Aperçue dans tout en lui donnant toute la hauteur disponible —
            sans espaceur artificiel, la grille calcule ça nativement. */}
        <div style={{ display: 'grid', gridTemplateColumns: '70px 110px 1fr 80px auto', gridAutoRows: 'auto', columnGap: 20, rowGap: 10 }}>
          {/* Tout sauf l'image : c'est la seule chose qu'on laisse modifier sur une créature livrée. */}
          <fieldset disabled={lectureSeule} style={fieldsetStyle}>
          <div style={{ gridColumn: 1, gridRow: 1 }}>
            <span style={labelStyle}>{t('gmMode.creatureDetail.nc')}</span>
            <NumberField parseAs="float" value={creature.nc}
              onChange={n => onChange({ nc: n ?? 0 })} style={inputStyle} />
          </div>
          <div style={{ gridColumn: 2, gridRow: 1 }}>
            <span style={labelStyle}>{t('gmMode.creatureDetail.taille')}</span>
            <select value={creature.taille ?? ''} onChange={e => onChange({ taille: e.target.value || undefined })} style={selectStyle}>
              <option value="" style={optionStyle}>{t('gmMode.creatureDetail.tailleAucune')}</option>
              {TAILLES.map(taille => (
                <option key={taille} value={taille} style={optionStyle}>{taille}</option>
              ))}
            </select>
          </div>
          <div style={{ gridColumn: 3, gridRow: 1, minWidth: 0 }}>
            <span style={labelStyle}>{t('gmMode.creatureDetail.apercuDans')}</span>
            <input
              value={creature.livres.join(', ')}
              onChange={e => onChange({ livres: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
              placeholder={t('gmMode.creatureDetail.livresPlaceholder')}
              style={inputStyle}
            />
          </div>
          <div style={{ gridColumn: 4, gridRow: 1 }}>
            <span style={labelStyle}>{t('gmMode.creatureDetail.page')}</span>
            <input
              value={creature.page ?? ''}
              onChange={e => onChange({ page: e.target.value })}
              placeholder={t('gmMode.creatureDetail.pagePlaceholder')}
              style={inputStyle}
            />
          </div>

          <div style={{ gridColumn: '1 / span 4', gridRow: 2 }}>
            <span style={labelStyle}>{t('gmMode.creatureDetail.description')}</span>
            <textarea
              value={creature.description ?? ''}
              onChange={e => onChange({ description: e.target.value })}
              onPaste={e => collerTexteNettoye(e, creature.description ?? '', description => onChange({ description }))}
              rows={6}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
            />
          </div>

          <div style={{ gridColumn: '1 / span 4', gridRow: 3, display: 'flex', gap: 24 }}>
            {/* Caractéristiques */}
            <div style={{ flexShrink: 0 }}>
              <div style={sectionTitleStyle}>{t('gmMode.creatureDetail.caracteristiques')}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {CARACS.map(key => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ ...labelStyle, marginBottom: 0, width: 32, flexShrink: 0 }}>{key}</span>
                    <input value={caracs[key]} onChange={e => setCarac(key, e.target.value)} maxLength={4} style={{ ...inputStyle, width: 56, flexShrink: 0 }} />
                  </div>
                ))}
              </div>
            </div>

            {/* Stats de combat */}
            <div style={{ flexShrink: 0 }}>
              <div style={sectionTitleStyle}>{t('gmMode.creatureDetail.statsCombat')}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ ...labelStyle, marginBottom: 0, width: 32, flexShrink: 0 }}>PV</span>
                  <NumberField allowUndefined value={creature.pv} onChange={n => onChange({ pv: n })} style={{ ...inputStyle, width: 56, flexShrink: 0 }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ ...labelStyle, marginBottom: 0, width: 32, flexShrink: 0 }}>Init.</span>
                  <NumberField allowUndefined value={creature.init} onChange={n => onChange({ init: n })} style={{ ...inputStyle, width: 56, flexShrink: 0 }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ ...labelStyle, marginBottom: 0, width: 32, flexShrink: 0 }}>DEF</span>
                  <NumberField allowUndefined value={creature.def} onChange={n => onChange({ def: n })} style={{ ...inputStyle, width: 56, flexShrink: 0 }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ ...labelStyle, marginBottom: 0, width: 32, flexShrink: 0 }}>RD</span>
                  <NumberField allowUndefined value={creature.rd} onChange={n => onChange({ rd: n })} style={{ ...inputStyle, width: 56, flexShrink: 0 }} />
                </div>
                {/* Types de dégâts auxquels la RD ci-dessus est limitée (ex. "RD 5 (Feu, Froid)") —
                    vide = RD générale (tous types). Purement informatif pour le MJ. */}
                {creature.rd !== undefined && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, maxWidth: 160 }} title={t('gmMode.creatureDetail.rdTypesTitle')}>
                    {TYPES_DEGATS.map(type => {
                      const actif = rdTypes.includes(type)
                      return (
                        <button
                          key={type}
                          onClick={() => toggleRdType(type)}
                          title={t(`gameMode.dmType${type}`)}
                          style={{
                            width: 22, height: 22, padding: 0, fontSize: 12, lineHeight: '20px',
                            background: actif ? 'rgba(201,168,76,0.25)' : 'transparent',
                            border: `1px solid ${actif ? GOLD : 'rgba(201,168,76,0.25)'}`,
                            borderRadius: 4, cursor: 'pointer', opacity: actif ? 1 : 0.4,
                          }}
                        >
                          {ICONES_TYPES_DEGATS[type]}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Attaques — occupe la place restante de la ligne */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={sectionTitleStyle}>{t('gmMode.creatureDetail.attaques')}</div>
              {attaques.length > 0 && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <span style={{ ...labelStyle, flex: 2, marginBottom: 0 }}>{t('gmMode.creatureDetail.attNom')}</span>
                  <span style={{ ...labelStyle, flex: 1, marginBottom: 0 }}>{t('gmMode.creatureDetail.attBonus')}</span>
                  <span style={{ ...labelStyle, flex: 1, marginBottom: 0 }}>{t('gmMode.creatureDetail.attDm')}</span>
                  <span style={{ ...labelStyle, flex: 1, marginBottom: 0 }}>{t('gmMode.creatureDetail.attZone')}</span>
                  <span style={{ width: 28, flexShrink: 0 }} />
                </div>
              )}
              {attaques.map((a, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input value={a.nom} onChange={e => setAttaques(attaques.map((x, j) => j === i ? { ...x, nom: e.target.value } : x))}
                    placeholder={t('gmMode.creatureDetail.attNom')} style={{ ...inputStyle, flex: 2 }} />
                  <input value={a.bonus ?? ''} onChange={e => setAttaques(attaques.map((x, j) => j === i ? { ...x, bonus: e.target.value } : x))}
                    placeholder={t('gmMode.creatureDetail.attBonus')} style={{ ...inputStyle, flex: 1 }} />
                  <input value={a.dm ?? ''} onChange={e => setAttaques(attaques.map((x, j) => j === i ? { ...x, dm: e.target.value } : x))}
                    placeholder={t('gmMode.creatureDetail.attDm')} style={{ ...inputStyle, flex: 1 }} />
                  <input value={a.zone ?? ''} onChange={e => setAttaques(attaques.map((x, j) => j === i ? { ...x, zone: e.target.value } : x))}
                    placeholder={t('gmMode.creatureDetail.attZone')} style={{ ...inputStyle, flex: 1 }} />
                  <button onClick={() => setAttaques(attaques.filter((_, j) => j !== i))} style={removeBtnStyle}>✕</button>
                </div>
              ))}
              <button onClick={() => setAttaques([...attaques, { nom: '' }])} style={addBtnStyle}>
                + {t('gmMode.creatureDetail.ajouterAttaque')}
              </button>
            </div>
          </div>
          </fieldset>

          {/* Image : chevauche les 3 lignes de gauche, largeur dérivée de sa hauteur (voir CreatureImage) */}
          <div style={{ gridColumn: 5, gridRow: '1 / span 3', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={labelStyle}>{t('gmMode.creatureDetail.image')}</span>
            <div style={{ flex: 1, minHeight: 0 }}>
              <CreatureImage
                value={imageSrc ?? ''}
                scale={creature.imageScale}
                tx={creature.imageTx}
                ty={creature.imageTy}
                fit={creature.imageFit}
                locked={creature.imageLocked}
                // L'image part dans images/ ; la créature ne garde qu'une clé, pour que le
                // bestiaire cesse de charrier des mégaoctets de base64.
                onChange={async dataUrl => {
                  const ancienne = estCleImage(creature.image) ? creature.image : null
                  // On ne libère l'ancien fichier que s'il ne sert plus à personne d'autre : la même
                  // image partagée par plusieurs créatures est UN seul fichier (empreinte de contenu),
                  // et l'effacer ici les priverait toutes de leur illustration.
                  const libererAncienne = async (remplacantePar?: string) => {
                    if (!ancienne || ancienne === remplacantePar) return
                    if (imageEncoreUtilisee(ancienne, creature, bestiaire, bestiaireIllustrations)) return
                    await oublierImage(ancienne)
                  }
                  if (!dataUrl) {
                    await libererAncienne()
                    onChange({ image: '' })
                    return
                  }
                  const cle = await importerImage('bestiaire', dataUrl)
                  await libererAncienne(cle)
                  onChange({ image: cle })
                }}
                onTransformChange={(imageScale, imageTx, imageTy) => onChange({ imageScale, imageTx, imageTy })}
                onFitChange={imageFit => onChange({ imageFit })}
                onLockedChange={imageLocked => onChange({ imageLocked })}
              />
            </div>
          </div>
        </div>
      </div>

      <fieldset disabled={lectureSeule} style={fieldsetStyle}>
      {/* Capacités */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <div style={{ ...sectionTitleStyle, flex: 1 }}>{t('gmMode.creatureDetail.capacites')}</div>
          {biblioMsg && <span style={{ fontSize: 12, color: GOLD }}>{biblioMsg}</span>}
        </div>
        <datalist id="capacites-bibliotheque-datalist">
          {capacitesBibliotheque.map(cb => <option key={cb.id} value={cb.nom} />)}
        </datalist>
        {capacites.map((c, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4, border: `1px solid ${SECTION_BORDER}`, borderRadius: 6, padding: 10 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <input value={c.nom} onChange={e => setCapaciteNom(i, e.target.value)} list="capacites-bibliotheque-datalist"
                placeholder={t('gmMode.creatureDetail.capNom')} style={{ ...inputStyle, flex: 1, fontWeight: 700 }} />
              <button onClick={() => ajouterALaBibliotheque(c)} title={t('gmMode.creatureDetail.ajouterBiblioTitle')} style={{ ...removeBtnStyle, borderColor: 'rgba(201,168,76,0.4)', color: GOLD }}>
                💾 {t('gmMode.creatureDetail.ajouterBiblio')}
              </button>
              <button onClick={() => setCapacites(capacites.filter((_, j) => j !== i))} style={removeBtnStyle}>✕</button>
            </div>
            <textarea value={c.desc} onChange={e => setCapacites(capacites.map((x, j) => j === i ? { ...x, desc: e.target.value } : x))}
              onPaste={e => collerTexteNettoye(e, c.desc, desc => setCapacites(capacites.map((x, j) => j === i ? { ...x, desc } : x)))}
              placeholder={t('gmMode.creatureDetail.capDesc')} rows={3} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} />

            {/* Effet(s) : bonus/malus préréglés qu'un bouton "Activer" appliquera d'un clic sur la carte de combat */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 4 }}>
              {(c.effets ?? []).map((ef, k) => (
                <div key={k} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <select value={ef.stat}
                    onChange={e => setCapaciteEffets(i, (c.effets ?? []).map((y, l) => l === k ? { ...y, stat: e.target.value } : y))}
                    style={{ ...selectStyle, flex: 1 }}>
                    <option value="" style={optionStyle}>{t('gmMode.creatureDetail.effetStat')}</option>
                    {EFFET_STATS.map(stat => (
                      <option key={stat} value={stat} style={optionStyle}>{stat}</option>
                    ))}
                  </select>
                  <input value={ef.valeur}
                    onChange={e => setCapaciteEffets(i, (c.effets ?? []).map((y, l) => l === k ? { ...y, valeur: e.target.value } : y))}
                    placeholder={t('gmMode.creatureDetail.effetValeurPlaceholder')} style={{ ...inputStyle, width: 80 }} />
                  <button onClick={() => setCapaciteEffets(i, (c.effets ?? []).filter((_, l) => l !== k))} style={removeBtnStyle}>✕</button>
                </div>
              ))}
              <button onClick={() => setCapaciteEffets(i, [...(c.effets ?? []), { stat: '', valeur: '' }])} style={{ ...addBtnStyle, fontSize: 11, padding: '4px 8px' }}>
                + {t('gmMode.creatureDetail.ajouterEffet')}
              </button>
            </div>
          </div>
        ))}
        <button onClick={() => setCapacites([...capacites, { nom: '', desc: '' }])} style={addBtnStyle}>
          + {t('gmMode.creatureDetail.ajouterCapacite')}
        </button>
      </div>

      {/* Voies */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={sectionTitleStyle}>{t('gmMode.creatureDetail.voies')}</div>
        {/* Autocomplétion sur les voies des PJ (voir descriptions.json) — permet de repérer un nom qui
            correspond exactement à une voie existante, pour ensuite en récupérer les rangs d'un clic
            (voir recupererRangsVoie) plutôt que de les retaper à la main. */}
        <datalist id="voies-datalist">
          {Object.keys(descriptions).map(nom => <option key={nom} value={nom} />)}
        </datalist>
        {voies.map((v, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8, border: `1px solid ${SECTION_BORDER}`, borderRadius: 6, padding: 10 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <input value={v.nom} onChange={e => setVoies(voies.map((x, j) => j === i ? { ...x, nom: e.target.value } : x))}
                list="voies-datalist" placeholder={t('gmMode.creatureDetail.voieNom')} style={{ ...inputStyle, flex: 2 }} />
              <NumberField value={v.rang} onChange={n => setVoies(voies.map((x, j) => j === i ? { ...x, rang: n ?? 0 } : x))}
                placeholder={t('gmMode.creatureDetail.voieRang')} style={{ ...inputStyle, width: 70 }} />
              <input value={v.reference ?? ''} onChange={e => setVoies(voies.map((x, j) => j === i ? { ...x, reference: e.target.value } : x))}
                placeholder={t('gmMode.creatureDetail.voieRef')} style={{ ...inputStyle, flex: 1 }} />
              {descriptions[v.nom] && (
                <button onClick={() => recupererRangsVoie(i)} title={t('gmMode.creatureDetail.recupererRangs')} style={{ ...removeBtnStyle, borderColor: 'rgba(201,168,76,0.4)', color: GOLD }}>
                  ↓
                </button>
              )}
              <button onClick={() => setVoies(voies.filter((_, j) => j !== i))} style={removeBtnStyle}>✕</button>
            </div>

            {v.rangs.map((r, k) => (
              <div key={k} style={{ display: 'flex', gap: 6, paddingLeft: 16 }}>
                <NumberField value={r.rang} onChange={n => setVoies(voies.map((x, j) => j === i ? { ...x, rangs: x.rangs.map((y, l) => l === k ? { ...y, rang: n ?? 0 } : y) } : x))}
                  style={{ ...inputStyle, width: 50 }} />
                <input value={r.nom} onChange={e => setVoies(voies.map((x, j) => j === i ? { ...x, rangs: x.rangs.map((y, l) => l === k ? { ...y, nom: e.target.value } : y) } : x))}
                  placeholder={t('gmMode.creatureDetail.rangNom')} style={{ ...inputStyle, flex: 1 }} />
                <input value={r.desc} onChange={e => setVoies(voies.map((x, j) => j === i ? { ...x, rangs: x.rangs.map((y, l) => l === k ? { ...y, desc: e.target.value } : y) } : x))}
                  placeholder={t('gmMode.creatureDetail.rangDesc')} style={{ ...inputStyle, flex: 2 }} />
                <button onClick={() => setVoies(voies.map((x, j) => j === i ? { ...x, rangs: x.rangs.filter((_, l) => l !== k) } : x))} style={removeBtnStyle}>✕</button>
              </div>
            ))}
            {/* Un rang de plus que v.rang (le rang atteint par la créature, voir ci-dessus) n'aurait pas
                de sens — même logique qu'un PJ qui ne peut pas débloquer un rang au-delà de celui de sa
                voie. */}
            <button
              onClick={() => setVoies(voies.map((x, j) => j === i ? { ...x, rangs: [...x.rangs, { rang: x.rangs.length + 1, nom: '', desc: '' }] } : x))}
              disabled={v.rangs.length >= v.rang}
              title={v.rangs.length >= v.rang ? t('gmMode.creatureDetail.rangMaxAtteint') : undefined}
              style={{ ...addBtnStyle, marginLeft: 16, opacity: v.rangs.length >= v.rang ? 0.4 : 1, cursor: v.rangs.length >= v.rang ? 'default' : 'pointer' }}
            >
              + {t('gmMode.creatureDetail.ajouterRang')}
            </button>
          </div>
        ))}
        <button onClick={() => setVoies([...voies, { nom: '', rang: 1, rangs: [] }])} style={addBtnStyle}>
          + {t('gmMode.creatureDetail.ajouterVoie')}
        </button>
      </div>
      </fieldset>

      {/* Export & Suppression — hors des fieldsets ci-dessus : exporter une créature livrée reste
          utile, et sur celles-ci « Supprimer » devient « Masquer » (le livré n'est pas modifiable). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={exporterCreature} style={{ ...addBtnStyle, alignSelf: undefined, padding: '6px 12px' }}>
          {t('gmMode.creatureDetail.exporter')}
        </button>
        {!suppressionDesactivee && (
          <button onClick={onDelete} style={{ ...removeBtnStyle, alignSelf: 'flex-start', padding: '6px 12px' }}>
            {masquageAuLieuDeSuppression ? t('gmMode.creatureDetail.masquer') : t('gmMode.creatureDetail.supprimer')}
          </button>
        )}
        {exportMsg && <span style={{ fontSize: 12, opacity: 0.7, color: GOLD }}>{exportMsg}</span>}
      </div>
    </div>
  )
}
