import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import CreatureImage from './CreatureImage'
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

interface Props {
  creature: BestiaireEntry
  onChange: (patch: Partial<BestiaireEntry>) => void
  onDelete: () => void
}

export default function CreatureDetail({ creature, onChange, onDelete }: Props) {
  const { t } = useTranslation()
  const { capacitesBibliotheque, setCapacitesBibliotheque } = useGameData()
  const [exportMsg, setExportMsg] = useState<string | null>(null)
  const [biblioMsg, setBiblioMsg] = useState<string | null>(null)

  const caracs = creature.caracteristiques ?? { FOR: '', DEX: '', CON: '', INT: '', SAG: '', CHA: '' }
  const setCarac = (key: typeof CARACS[number], value: string) =>
    onChange({ caracteristiques: { ...caracs, [key]: value } })

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

  const exporterCreature = async () => {
    const content = JSON.stringify(creature, null, 2)
    const safe = creature.nom.replace(/[^a-zA-Z0-9À-ÿ _-]/g, '').trim().replace(/\s+/g, '-') || 'creature'
    const filename = `${safe}.json`
    if (isTauri) {
      await saveDataFile(filename, content)
      setExportMsg(t('gmMode.creatureDetail.exporteVers', { filename }))
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
        <input
          value={creature.nom}
          onChange={e => onChange({ nom: e.target.value })}
          style={{ ...inputStyle, fontSize: 20, fontWeight: 700, color: GOLD, fontFamily: "'Cinzel', serif", letterSpacing: '0.03em' }}
        />
        {/* Grille 4 colonnes (NC / Taille / Aperçue dans / Image) : la colonne Image chevauche les 3
            lignes de gauche (NC-row / Description / Caractéristiques-StatsCombat), ce qui aligne son
            label "Image" avec NC/Taille/Aperçue dans tout en lui donnant toute la hauteur disponible —
            sans espaceur artificiel, la grille calcule ça nativement. */}
        <div style={{ display: 'grid', gridTemplateColumns: '70px 110px 1fr 80px auto', gridAutoRows: 'auto', columnGap: 20, rowGap: 10 }}>
          <div style={{ gridColumn: 1, gridRow: 1 }}>
            <span style={labelStyle}>{t('gmMode.creatureDetail.nc')}</span>
            <input type="number" step="0.5" value={creature.nc}
              onChange={e => onChange({ nc: parseFloat(e.target.value) || 0 })} style={inputStyle} />
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
                  <span style={{ ...labelStyle, marginBottom: 0, width: 32, flexShrink: 0 }}>DEF</span>
                  <input type="number" value={creature.def ?? ''} onChange={e => onChange({ def: e.target.value === '' ? undefined : parseInt(e.target.value) })} style={{ ...inputStyle, width: 56, flexShrink: 0 }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ ...labelStyle, marginBottom: 0, width: 32, flexShrink: 0 }}>PV</span>
                  <input type="number" value={creature.pv ?? ''} onChange={e => onChange({ pv: e.target.value === '' ? undefined : parseInt(e.target.value) })} style={{ ...inputStyle, width: 56, flexShrink: 0 }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ ...labelStyle, marginBottom: 0, width: 32, flexShrink: 0 }}>Init.</span>
                  <input type="number" value={creature.init ?? ''} onChange={e => onChange({ init: e.target.value === '' ? undefined : parseInt(e.target.value) })} style={{ ...inputStyle, width: 56, flexShrink: 0 }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ ...labelStyle, marginBottom: 0, width: 32, flexShrink: 0 }}>RD</span>
                  <input type="number" value={creature.rd ?? ''} onChange={e => onChange({ rd: e.target.value === '' ? undefined : parseInt(e.target.value) })} style={{ ...inputStyle, width: 56, flexShrink: 0 }} />
                </div>
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

          {/* Image : chevauche les 3 lignes de gauche, largeur dérivée de sa hauteur (voir CreatureImage) */}
          <div style={{ gridColumn: 5, gridRow: '1 / span 3', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={labelStyle}>{t('gmMode.creatureDetail.image')}</span>
            <div style={{ flex: 1, minHeight: 0 }}>
              <CreatureImage
                value={creature.image ?? ''}
                scale={creature.imageScale}
                tx={creature.imageTx}
                ty={creature.imageTy}
                fit={creature.imageFit}
                locked={creature.imageLocked}
                onChange={image => onChange({ image })}
                onTransformChange={(imageScale, imageTx, imageTy) => onChange({ imageScale, imageTx, imageTy })}
                onFitChange={imageFit => onChange({ imageFit })}
                onLockedChange={imageLocked => onChange({ imageLocked })}
              />
            </div>
          </div>
        </div>
      </div>

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
        {voies.map((v, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8, border: `1px solid ${SECTION_BORDER}`, borderRadius: 6, padding: 10 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <input value={v.nom} onChange={e => setVoies(voies.map((x, j) => j === i ? { ...x, nom: e.target.value } : x))}
                placeholder={t('gmMode.creatureDetail.voieNom')} style={{ ...inputStyle, flex: 2 }} />
              <input type="number" value={v.rang} onChange={e => setVoies(voies.map((x, j) => j === i ? { ...x, rang: parseInt(e.target.value) || 0 } : x))}
                placeholder={t('gmMode.creatureDetail.voieRang')} style={{ ...inputStyle, width: 70 }} />
              <input value={v.reference ?? ''} onChange={e => setVoies(voies.map((x, j) => j === i ? { ...x, reference: e.target.value } : x))}
                placeholder={t('gmMode.creatureDetail.voieRef')} style={{ ...inputStyle, flex: 1 }} />
              <button onClick={() => setVoies(voies.filter((_, j) => j !== i))} style={removeBtnStyle}>✕</button>
            </div>

            {v.rangs.map((r, k) => (
              <div key={k} style={{ display: 'flex', gap: 6, paddingLeft: 16 }}>
                <input type="number" value={r.rang} onChange={e => setVoies(voies.map((x, j) => j === i ? { ...x, rangs: x.rangs.map((y, l) => l === k ? { ...y, rang: parseInt(e.target.value) || 0 } : y) } : x))}
                  style={{ ...inputStyle, width: 50 }} />
                <input value={r.nom} onChange={e => setVoies(voies.map((x, j) => j === i ? { ...x, rangs: x.rangs.map((y, l) => l === k ? { ...y, nom: e.target.value } : y) } : x))}
                  placeholder={t('gmMode.creatureDetail.rangNom')} style={{ ...inputStyle, flex: 1 }} />
                <input value={r.desc} onChange={e => setVoies(voies.map((x, j) => j === i ? { ...x, rangs: x.rangs.map((y, l) => l === k ? { ...y, desc: e.target.value } : y) } : x))}
                  placeholder={t('gmMode.creatureDetail.rangDesc')} style={{ ...inputStyle, flex: 2 }} />
                <button onClick={() => setVoies(voies.map((x, j) => j === i ? { ...x, rangs: x.rangs.filter((_, l) => l !== k) } : x))} style={removeBtnStyle}>✕</button>
              </div>
            ))}
            <button
              onClick={() => setVoies(voies.map((x, j) => j === i ? { ...x, rangs: [...x.rangs, { rang: x.rangs.length + 1, nom: '', desc: '' }] } : x))}
              style={{ ...addBtnStyle, marginLeft: 16 }}
            >
              + {t('gmMode.creatureDetail.ajouterRang')}
            </button>
          </div>
        ))}
        <button onClick={() => setVoies([...voies, { nom: '', rang: 1, rangs: [] }])} style={addBtnStyle}>
          + {t('gmMode.creatureDetail.ajouterVoie')}
        </button>
      </div>

      {/* Export & Suppression */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={exporterCreature} style={{ ...addBtnStyle, alignSelf: undefined, padding: '6px 12px' }}>
          {t('gmMode.creatureDetail.exporter')}
        </button>
        <button onClick={onDelete} style={{ ...removeBtnStyle, alignSelf: 'flex-start', padding: '6px 12px' }}>
          {t('gmMode.creatureDetail.supprimer')}
        </button>
        {exportMsg && <span style={{ fontSize: 12, opacity: 0.7, color: GOLD }}>{exportMsg}</span>}
      </div>
    </div>
  )
}
