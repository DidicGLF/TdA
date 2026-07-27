import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { demarrerServeurReseau, arreterServeurReseau, etatServeurReseau, ecouterReseau } from '../../utils/reseau'
import type { EvenementReseau } from '../../utils/reseau'

const GOLD = '#c9a84c'
const PARCHMENT = '#f5ecd7'
const SECTION_BORDER = 'rgba(201,168,76,0.2)'

const isTauri = () =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

interface LigneJournal {
  id: number
  texte: string
}

// Écran de test de la plomberie réseau (voir src-tauri/src/reseau.rs et src/utils/reseau.ts) : démarrer/
// arrêter le serveur, voir les connexions et les messages bruts reçus. Pas de protocole de jeu ici —
// c'est la première étape du chantier réseau (branche feature/reseau-local), avant le code de partie,
// la découverte réseau côté joueur et l'échange de jets/dégâts.
export default function ReseauTab() {
  const { t } = useTranslation()
  const [demarre, setDemarre] = useState(false)
  const [port, setPort] = useState<number | null>(null)
  const [clients, setClients] = useState(0)
  const [journal, setJournal] = useState<LigneJournal[]>([])
  const prochainIdJournal = useRef(0)

  const ajouterJournal = (texte: string) => {
    prochainIdJournal.current += 1
    setJournal(prev => [{ id: prochainIdJournal.current, texte }, ...prev].slice(0, 200))
  }

  useEffect(() => {
    etatServeurReseau().then(etat => { setDemarre(etat.demarre); setPort(etat.port); setClients(etat.clients) })
  }, [])

  useEffect(() => {
    let annule = false
    const gerer = (e: EvenementReseau) => {
      if (e.type === 'connexion') { setClients(c => c + 1); ajouterJournal(t('gmMode.reseau.connexionEvt', { id: e.id })) }
      else if (e.type === 'deconnexion') { setClients(c => Math.max(0, c - 1)); ajouterJournal(t('gmMode.reseau.deconnexionEvt', { id: e.id })) }
      else { ajouterJournal(t('gmMode.reseau.messageEvt', { id: e.id, contenu: e.contenu })) }
    }
    let desabonner = () => {}
    ecouterReseau(gerer).then(fn => { if (annule) fn(); else desabonner = fn })
    return () => { annule = true; desabonner() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleServeur = async () => {
    if (demarre) {
      await arreterServeurReseau()
      setDemarre(false)
      setPort(null)
      setClients(0)
    } else {
      const p = await demarrerServeurReseau()
      setDemarre(p !== null)
      setPort(p)
    }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ fontSize: 18, fontFamily: "'Cinzel', serif", fontWeight: 700, color: GOLD, marginBottom: 6 }}>
        {t('gmMode.reseau.titre')}
      </div>
      <div style={{ fontSize: 13, color: 'rgba(245,236,215,0.6)', marginBottom: 16 }}>
        {t('gmMode.reseau.intro')}
      </div>

      {!isTauri() ? (
        <div style={{ padding: 12, borderRadius: 6, border: `1px solid ${SECTION_BORDER}`, color: 'rgba(245,236,215,0.5)', fontSize: 13 }}>
          {t('gmMode.reseau.horsTauri')}
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <button onClick={toggleServeur} style={{
              padding: '8px 16px', borderRadius: 4, cursor: 'pointer', fontSize: 14,
              border: `1px solid ${demarre ? 'rgba(220,80,80,0.5)' : 'rgba(120,220,140,0.5)'}`,
              background: demarre ? 'rgba(220,80,80,0.12)' : 'rgba(120,220,140,0.12)',
              color: demarre ? 'rgba(255,150,150,0.95)' : 'rgba(120,220,140,0.95)',
            }}>
              {demarre ? t('gmMode.reseau.arreter') : t('gmMode.reseau.demarrer')}
            </button>
            <span style={{ fontSize: 13, color: PARCHMENT }}>
              {demarre && port !== null ? t('gmMode.reseau.demarre', { port }) : t('gmMode.reseau.arrete')}
            </span>
          </div>

          {demarre && (
            <div style={{ fontSize: 13, color: GOLD, marginBottom: 12 }}>
              {t('gmMode.reseau.clients', { count: clients })}
            </div>
          )}

          <div style={{ fontSize: 12, fontWeight: 700, color: GOLD, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            {t('gmMode.reseau.journal')}
          </div>
          <div style={{
            border: `1px solid ${SECTION_BORDER}`, borderRadius: 6, padding: 10, maxHeight: 320,
            overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4,
            background: 'rgba(0,0,0,0.2)', fontFamily: 'monospace', fontSize: 12,
          }}>
            {journal.length === 0
              ? <span style={{ opacity: 0.4 }}>{t('gmMode.reseau.journalVide')}</span>
              : journal.map(l => <div key={l.id} style={{ color: 'rgba(245,236,215,0.85)' }}>{l.texte}</div>)}
          </div>
        </>
      )}
    </div>
  )
}
