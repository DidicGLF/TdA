import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useGameData } from '../../context/GameDataContext'
import CreatureDetail from './CreatureDetail'
import AdversiteTab from './AdversiteTab'
import BatailleTab from './BatailleTab'
import NotesTab from '../NotesTab'
import NotesGraph from '../NotesGraph'
import bestiaireIllustration from '../../assets/bestiaire-gold.png'
import { saveDataFileToBundle } from '../../utils/tauriStorage'
import type { BestiaireEntry, RencontreSauvegardee } from '../../types/gameData'
import type { BatailleSessionSauvegardee } from '../../utils/bataille'

const GOLD = '#c9a84c'
const PARCHMENT = '#f5ecd7'
const SECTION_BORDER = 'rgba(201,168,76,0.2)'

type Tab = 'bestiaire' | 'adversite' | 'bataille' | 'notes'

interface Props {
  onBack: () => void
}

export default function GMDashboard({ onBack }: Props) {
  const { t } = useTranslation()
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
        {(['bestiaire', 'adversite', 'bataille', 'notes'] as Tab[]).map(tb => (
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
            <NotesGraph selectedId={notesSelectedId} onOpenNote={setNotesSelectedId} notes={gmNotes} />
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          {tab === 'bestiaire' && <BestiaireTab forcerNom={bestiaireForcerNom} />}
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

function BestiaireTab({ forcerNom }: { forcerNom?: string | null }) {
  const { t } = useTranslation()
  const { bestiaire, setBestiaire } = useGameData()
  const [search, setSearch] = useState('')
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [confirmSauvegarderBundle, setConfirmSauvegarderBundle] = useState(false)

  // Sélection forcée depuis une note liée (voir NotesTab « → Aller à la créature ») : appliquée
  // pendant le rendu plutôt que dans un effet (pattern « ajuster l'état pendant le rendu » recommandé
  // par React pour réagir à un changement de prop), pour ne s'appliquer qu'au changement de nom
  // demandé — pas à chaque re-render, sinon impossible de changer manuellement de créature ensuite
  // sans revenir par une note.
  const [dernierForcerNom, setDernierForcerNom] = useState<string | null | undefined>(undefined)
  if (forcerNom !== dernierForcerNom) {
    setDernierForcerNom(forcerNom)
    if (forcerNom) {
      const idx = bestiaire.findIndex(c => c.nom === forcerNom)
      if (idx !== -1) setSelectedIdx(idx)
    }
  }

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
    <>
    <div style={{ display: 'flex', gap: 16, height: '100%' }}>
      {/* Liste — colonne gauche */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 420, flexShrink: 0, minHeight: 0 }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('gmMode.bestiaireRecherche')}
          style={{
            padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(201,168,76,0.4)',
            background: 'rgba(255,255,255,0.03)', color: PARCHMENT, fontSize: 14,
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 14, opacity: 0.5 }}>
            {t('gmMode.bestiaireCompte', { count: filtered.length })}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            {import.meta.env.DEV && (
              <button
                onClick={() => setConfirmSauvegarderBundle(true)}
                style={{
                  background: 'transparent', border: '1px solid rgba(100,200,120,0.5)', borderRadius: 4,
                  color: 'rgba(100,200,120,0.8)', cursor: 'pointer', fontSize: 14, padding: '3px 8px',
                }}
              >
                {t('gmMode.bestiaireSauvegarderBundle')}
              </button>
            )}
            <button onClick={addCreature} style={{
              background: 'transparent', border: '1px dashed rgba(201,168,76,0.5)', borderRadius: 4,
              color: GOLD, cursor: 'pointer', fontSize: 14, padding: '3px 8px',
            }}>
              + {t('gmMode.creatureDetail.nouvelleCreature')}
            </button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', border: `1px solid ${SECTION_BORDER}`, borderRadius: 6 }}>
          {filtered.map(({ c, idx }, i) => {
            const isSelected = selectedIdx === idx
            return (
              <div key={idx} onClick={() => setSelectedIdx(idx)} style={{
                // Marge droite un peu plus large que les autres côtés : la scrollbar (overlay, s'épaissit
                // au survol) sinon passe par-dessus le score de NC, collé trop près du bord.
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 18px 8px 12px', cursor: 'pointer',
                background: isSelected ? 'rgba(201,168,76,0.12)' : 'transparent',
                borderLeft: isSelected ? `2px solid ${GOLD}` : '2px solid transparent',
                borderBottom: i < filtered.length - 1 ? `1px solid ${SECTION_BORDER}` : 'none',
              }}>
                <span style={{ flex: 1, fontSize: 16, color: isSelected ? GOLD : PARCHMENT }}>{c.nom || t('gmMode.creatureDetail.nouvelleCreature')}</span>
                <span style={{ fontSize: 14, color: GOLD, fontWeight: 700, minWidth: 24, textAlign: 'right' }}>{c.nc}</span>
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
                await saveDataFileToBundle('bestiaire.json', bestiaire)
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
    </>
  )
}
