import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useGameData } from '../../context/GameDataContext'
import CreatureDetail from './CreatureDetail'
import AdversiteTab from './AdversiteTab'
import bestiaireIllustration from '../../assets/bestiaire-gold.png'
import type { BestiaireEntry } from '../../types/gameData'

const GOLD = '#c9a84c'
const PARCHMENT = '#f5ecd7'
const SECTION_BORDER = 'rgba(201,168,76,0.2)'

type Tab = 'bestiaire' | 'adversite' | 'bataille'

interface Props {
  onBack: () => void
}

export default function GMDashboard({ onBack }: Props) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('bestiaire')

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
        {(['bestiaire', 'adversite', 'bataille'] as Tab[]).map(tb => (
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
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {tab === 'bestiaire' && <BestiaireTab />}
        {tab === 'adversite' && <AdversiteTab />}
        {tab === 'bataille' && <PlaceholderTab label={t('gmMode.tabs.bataille')} />}
      </div>
    </div>
  )
}

function PlaceholderTab({ label }: { label: string }) {
  const { t } = useTranslation()
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.5, fontSize: 14, textAlign: 'center' }}>
      {t('gmMode.aVenir', { outil: label })}
    </div>
  )
}

function BestiaireTab() {
  const { t } = useTranslation()
  const { bestiaire, setBestiaire } = useGameData()
  const [search, setSearch] = useState('')
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return bestiaire
      .map((c, idx) => ({ c, idx }))
      .filter(({ c }) => !q || c.nom.toLowerCase().includes(q))
  }, [search, bestiaire])

  const selected = selectedIdx !== null ? bestiaire[selectedIdx] : null

  const addCreature = () => {
    const nouvelle: BestiaireEntry = { nom: t('gmMode.creatureDetail.nouvelleCreature'), nc: 1, livres: [] }
    setBestiaire(prev => [...prev, nouvelle])
    setSelectedIdx(bestiaire.length)
  }

  const updateSelected = (patch: Partial<BestiaireEntry>) => {
    if (selectedIdx === null) return
    setBestiaire(prev => prev.map((c, i) => i === selectedIdx ? { ...c, ...patch } : c))
  }

  const deleteSelected = () => {
    if (selectedIdx === null) return
    setBestiaire(prev => prev.filter((_, i) => i !== selectedIdx))
    setSelectedIdx(null)
  }

  return (
    <div style={{ display: 'flex', gap: 16, height: '100%' }}>
      {/* Liste — colonne gauche */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 320, flexShrink: 0, minHeight: 0 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('gmMode.bestiaireRecherche')}
          style={{
            padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(201,168,76,0.4)',
            background: 'rgba(255,255,255,0.03)', color: PARCHMENT, fontSize: 14,
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, opacity: 0.5 }}>
            {t('gmMode.bestiaireCompte', { count: filtered.length })}
          </span>
          <button onClick={addCreature} style={{
            background: 'transparent', border: '1px dashed rgba(201,168,76,0.5)', borderRadius: 4,
            color: GOLD, cursor: 'pointer', fontSize: 12, padding: '3px 8px',
          }}>
            + {t('gmMode.creatureDetail.nouvelleCreature')}
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', border: `1px solid ${SECTION_BORDER}`, borderRadius: 6 }}>
          {filtered.map(({ c, idx }, i) => {
            const isSelected = selectedIdx === idx
            return (
              <div key={idx} onClick={() => setSelectedIdx(idx)} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', cursor: 'pointer',
                background: isSelected ? 'rgba(201,168,76,0.12)' : 'transparent',
                borderLeft: isSelected ? `2px solid ${GOLD}` : '2px solid transparent',
                borderBottom: i < filtered.length - 1 ? `1px solid ${SECTION_BORDER}` : 'none',
              }}>
                <span style={{ flex: 1, fontSize: 14, color: isSelected ? GOLD : PARCHMENT }}>{c.nom || t('gmMode.creatureDetail.nouvelleCreature')}</span>
                <span style={{ fontSize: 12, color: GOLD, fontWeight: 700, minWidth: 24, textAlign: 'right' }}>{c.nc}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Détail — colonne droite */}
      <div style={{ flex: 1, minWidth: 0, border: `1px solid ${SECTION_BORDER}`, borderRadius: 6, padding: 20, overflowY: 'auto' }}>
        {selected ? <CreatureDetail creature={selected} onChange={updateSelected} onDelete={deleteSelected} /> : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, height: '100%', minHeight: 0 }}>
            <div style={{ flex: '1 1 0', minHeight: 0, minWidth: 0, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img src={bestiaireIllustration} alt="" style={{ maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto', objectFit: 'contain', opacity: 0.15, userSelect: 'none', pointerEvents: 'none' }} />
            </div>
            <span style={{ flexShrink: 0, opacity: 0.4, fontSize: 14 }}>{t('gmMode.creatureDetail.aucuneSelection')}</span>
          </div>
        )}
      </div>
    </div>
  )
}
