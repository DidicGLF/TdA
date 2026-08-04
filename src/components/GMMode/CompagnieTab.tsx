import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useGameData } from '../../context/GameDataContext'
import { saveDataFile } from '../../utils/tauriStorage'
import { desenvelopper, messageMauvaisType } from '../../utils/importTypage'
import type { Compagnie, CodeCompagnie, DomaineCapacite, FonctionMembre } from '../../utils/compagnie'
import {
  TAILLES_COMPAGNIE, FONCTIONS_MEMBRE, DEVISE_CODE, DESCRIPTION_CODE,
  VOIE_COMPAGNIE, capaciteAuRang, capacitesActives, niveauDepuisRenommee,
  descriptionCapacite, capacitesDisponiblesAnarchique, SEUILS_RENOMMEE,
} from '../../utils/compagnie'

const GOLD = '#c9a84c'
const PARCHMENT = '#f5ecd7'
const SECTION_BORDER = 'rgba(201,168,76,0.2)'
const COULEUR_DOMAINE: Record<DomaineCapacite, string> = {
  arsenal: '#c67a3d', influence: '#a98ff0', tactique: '#5fb0a8',
}

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

const sectionTitreStyle: React.CSSProperties = {
  fontSize: 13, fontWeight: 700, color: GOLD, textTransform: 'uppercase',
  letterSpacing: '0.08em', marginBottom: 10, fontFamily: "'Cinzel', serif",
}
const panelStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)', border: `1px solid ${SECTION_BORDER}`,
  borderRadius: 8, padding: '16px 18px', marginBottom: 14,
}
const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)', border: `1px solid ${SECTION_BORDER}`, borderRadius: 4,
  color: PARCHMENT, fontSize: 13, padding: '6px 9px', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
}
const fieldLabelStyle: React.CSSProperties = {
  fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(245,236,215,0.45)', marginBottom: 4,
}
const btnStyle: React.CSSProperties = {
  padding: '5px 12px', borderRadius: 4, fontSize: 12, cursor: 'pointer',
  border: '1px solid rgba(201,168,76,0.4)', background: 'transparent', color: GOLD, fontFamily: 'inherit',
}

export default function CompagnieTab() {
  const { t } = useTranslation()
  const { compagnie, setCompagnie } = useGameData()
  const fileInputRef = useRef<HTMLInputElement>(null)
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
    const autres = compagnie.membres.filter(m => m.fonction !== fonction)
    update({ membres: nom.trim() ? [...autres, { fonction, nom: nom.trim() }] : autres })
  }

  const choisirCapaciteAnarchique = (rang: number, capaciteNom: string) => {
    const cap = capacitesDisponiblesAnarchique(rang).find(c => c.nom === capaciteNom)
    if (!cap) return
    update({ choixAnarchique: { ...compagnie.choixAnarchique, [rang]: cap } })
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
        setCompagnie(contenu as Compagnie)
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
    <div style={{ maxWidth: 900, margin: '0 auto' }}>

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
            <div style={{ fontSize: 34, fontWeight: 700, color: PARCHMENT, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {compagnie.renommee}
              <span style={{ fontSize: 12, fontWeight: 400, color: 'rgba(245,236,215,0.45)', marginLeft: 6 }}>
                {t('gmMode.compagnie.renommeeUnite')}
              </span>
            </div>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(201,168,76,0.1)',
            border: `1px solid ${GOLD}`, borderRadius: 6, padding: '6px 14px',
          }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: GOLD, fontFamily: "'Cinzel', serif" }}>{niveau}</span>
            <span style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(245,236,215,0.5)' }}>
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
              <div style={{ fontSize: 10, color: 'rgba(245,236,215,0.4)', fontVariantNumeric: 'tabular-nums' }}>
                {seuil}{i === SEUILS_RENOMMEE.length - 1 ? '+' : ''}
              </div>
              <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(245,236,215,0.3)' }}>
                {t('gmMode.compagnie.niveauAbrege', { n: i })}
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12, color: 'rgba(245,236,215,0.45)', lineHeight: 1.5, borderTop: `1px dashed ${SECTION_BORDER}`, paddingTop: 10 }}>
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
              <div style={{ fontFamily: "'Cinzel', serif", fontSize: 14, fontWeight: 700, color: compagnie.code === code ? GOLD : PARCHMENT, marginBottom: 4 }}>
                {t(`gmMode.compagnie.code.${code}`)}
              </div>
              <div style={{ fontSize: 11, fontStyle: 'italic', color: 'rgba(245,236,215,0.55)', marginBottom: 6, minHeight: 28 }}>
                {DEVISE_CODE[code]}
              </div>
              <div style={{ fontSize: 10.5, color: 'rgba(245,236,215,0.4)', lineHeight: 1.4 }}>
                {DESCRIPTION_CODE[code]}
              </div>
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11.5, color: 'rgba(245,236,215,0.4)' }}>{t('gmMode.compagnie.codeAide')}</div>
      </div>

      {/* Voie de compagnie */}
      <div style={panelStyle}>
        <div style={sectionTitreStyle}>{t('gmMode.compagnie.voieTitre')}</div>
        {!compagnie.code ? (
          <div style={{ fontSize: 12, color: 'rgba(245,236,215,0.4)', fontStyle: 'italic' }}>{t('gmMode.compagnie.voieAideCode')}</div>
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
                  <span style={{ fontSize: 11, color: 'rgba(245,236,215,0.5)', width: 56, flexShrink: 0 }}>
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
                      {cap && <div style={{ fontSize: 11, color: 'rgba(245,236,215,0.5)', marginTop: 4, lineHeight: 1.4 }}>{descriptionCapacite(cap.nom, compagnie.code)}</div>}
                    </div>
                  ) : cap ? (
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: COULEUR_DOMAINE[cap.domaine], flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: debloque ? GOLD : PARCHMENT }}>{cap.nom}</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(245,236,215,0.45)', marginTop: 3, lineHeight: 1.4 }}>
                        {descriptionCapacite(cap.nom, compagnie.code)}
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 12, fontSize: 10.5, color: 'rgba(245,236,215,0.4)' }}>
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
                  <div style={{ fontSize: 13, fontWeight: 600, color: PARCHMENT }}>{cap.nom}</div>
                  <div style={{ fontSize: 11.5, color: 'rgba(245,236,215,0.5)', marginTop: 2, lineHeight: 1.5 }}>
                    {descriptionCapacite(cap.nom, compagnie.code)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Membres & fonctions */}
      <div style={panelStyle}>
        <div style={sectionTitreStyle}>{t('gmMode.compagnie.membresTitre')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 }}>
          {FONCTIONS_MEMBRE.map(fonction => (
            <div key={fonction} style={{ border: `1px solid ${SECTION_BORDER}`, borderRadius: 6, padding: '9px 11px', background: 'rgba(255,255,255,0.02)' }}>
              <div style={fieldLabelStyle}>{t(`gmMode.compagnie.fonction.${fonction}`)}</div>
              <input style={inputStyle} value={nomPourFonction(fonction)} placeholder={t('gmMode.compagnie.vacant')}
                onChange={e => setNomFonction(fonction, e.target.value)} />
            </div>
          ))}
        </div>
      </div>

      {/* Arsenal */}
      <div style={panelStyle}>
        <div style={sectionTitreStyle}>{t('gmMode.compagnie.arsenalTitre')}</div>
        {!compagnie.code ? (
          <div style={{ fontSize: 12, color: 'rgba(245,236,215,0.4)', fontStyle: 'italic' }}>{t('gmMode.compagnie.arsenalAucunCode')}</div>
        ) : capacitesArsenalActives.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {capacitesArsenalActives.map(cap => (
              <div key={cap.nom} style={{ fontSize: 12.5, color: 'rgba(245,236,215,0.7)', lineHeight: 1.5 }}>
                <strong style={{ color: GOLD }}>{cap.nom}</strong> — {descriptionCapacite(cap.nom, compagnie.code)}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'rgba(245,236,215,0.4)' }}>
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
        {msg && <span style={{ fontSize: 12, color: GOLD }}>✓ {msg}</span>}
      </div>
    </div>
  )
}
