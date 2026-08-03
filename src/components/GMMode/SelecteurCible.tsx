import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { CombatEntiteInfo } from '../../utils/combat'

const PARCHMENT = '#f5ecd7'
const PURPLE = 'rgba(200,170,255,0.9)'
// Alliés (même côté du plateau) et adversaires, du point de vue de celui qui agit.
const ALLIE = 'rgba(130,220,140,0.95)'
const ENNEMI = 'rgba(255,130,130,0.95)'

interface Props {
  value: string | null
  onChange: (id: string | null) => void
  cibles: CombatEntiteInfo[]
  // Camp de celui qui choisit : ses alliés s'affichent en vert, les autres en rouge.
  monCamp: 'creature' | 'pj'
  labelAucune: string
  bordure: string
}

// Liste de cibles déroulante, écrite à la main plutôt qu'avec <select> : les navigateurs délèguent le
// rendu des <option> au système, qui ignore les couleurs — impossible d'y distinguer alliés et
// adversaires. Ce menu reproduit l'apparence du select tout en gardant la main sur le style.
export default function SelecteurCible({ value, onChange, cibles, monCamp, labelAucune, bordure }: Props) {
  const { t } = useTranslation()
  const [ouvert, setOuvert] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const boutonRef = useRef<HTMLButtonElement>(null)
  const listeRef = useRef<HTMLDivElement>(null)
  // Position à l'écran du bouton : la liste est rendue dans un portail (voir plus bas), donc placée
  // en coordonnées absolues d'écran plutôt que relativement au bouton.
  const [cadre, setCadre] = useState<DOMRect | null>(null)

  const majPosition = useCallback(() => {
    setCadre(boutonRef.current?.getBoundingClientRect() ?? null)
  }, [])

  useEffect(() => {
    if (!ouvert) return
    majPosition()
    const handler = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return
      if (listeRef.current?.contains(e.target as Node)) return
      setOuvert(false)
    }
    // capture : suivre aussi les défilements des conteneurs internes (la carte, la colonne…)
    document.addEventListener('mousedown', handler)
    window.addEventListener('scroll', majPosition, true)
    window.addEventListener('resize', majPosition)
    return () => {
      document.removeEventListener('mousedown', handler)
      window.removeEventListener('scroll', majPosition, true)
      window.removeEventListener('resize', majPosition)
    }
  }, [ouvert, majPosition])


  const couleur = (c: CombatEntiteInfo) => c.camp === monCamp ? ALLIE : ENNEMI
  const choisie = cibles.find(c => c.id === value) ?? null

  return (
    <div ref={ref} style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <button
        ref={boutonRef}
        onClick={() => setOuvert(o => !o)}
        style={{
          width: '100%', textAlign: 'left', fontSize: 13, padding: '5px 8px', borderRadius: 4,
          background: 'var(--tdr-dark)', cursor: 'pointer', fontFamily: 'inherit',
          border: `1px solid ${value ? PURPLE : bordure}`,
          color: choisie ? couleur(choisie) : PARCHMENT,
          display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {choisie ? <>{choisie.nom}{choisie.pvActuels <= 0 && ' 💀'}</> : labelAucune}
        </span>
        <span style={{ opacity: 0.5, fontSize: 10 }}>▼</span>
      </button>

      {/* Rendue dans un portail : à l'intérieur de la carte, la liste était rognée dès que celle-ci
          n'était pas assez haute (conteneurs à débordement masqué). */}
      {ouvert && cadre && createPortal((() => {
        const placeDessous = window.innerHeight - cadre.bottom
        const versLeHaut = placeDessous < 180 && cadre.top > placeDessous
        return (
        <div ref={listeRef} style={{
          position: 'fixed', left: cadre.left, width: cadre.width, zIndex: 2000,
          ...(versLeHaut
            ? { bottom: window.innerHeight - cadre.top + 2, maxHeight: Math.max(120, cadre.top - 12) }
            : { top: cadre.bottom + 2, maxHeight: Math.max(120, placeDessous - 12) }),
          background: 'rgba(18,14,9,0.99)', border: `1px solid ${bordure}`, borderRadius: 4,
          boxShadow: '0 6px 20px rgba(0,0,0,0.8)', overflowY: 'auto',
        }}>
          <button
            onClick={() => { onChange(null); setOuvert(false) }}
            style={{
              width: '100%', textAlign: 'left', padding: '6px 9px', fontSize: 13, cursor: 'pointer',
              background: 'transparent', border: 'none', color: PARCHMENT, fontFamily: 'inherit', opacity: 0.7,
            }}
          >{labelAucune}</button>
          {cibles.map(c => {
            // Une créature morte reste visible dans la liste (le 💀 informe de son sort), mais ne peut
            // plus être choisie comme NOUVELLE cible (demande de Didic — on continuait à pouvoir
            // l'attaquer). Voir aussi le blocage symétrique côté résolution d'attaque dans CombatTab.tsx
            // (couvre le cas où une cible déjà choisie meurt entre-temps sous un autre coup).
            const morte = c.pvActuels <= 0
            return (
              <button
                key={c.id}
                onClick={() => { if (morte) return; onChange(c.id); setOuvert(false) }}
                disabled={morte}
                title={morte ? t('gmMode.bataille.cibleMorteTitle') : undefined}
                style={{
                  width: '100%', textAlign: 'left', padding: '6px 9px', fontSize: 13, cursor: morte ? 'not-allowed' : 'pointer',
                  background: c.id === value ? 'rgba(200,170,255,0.12)' : 'transparent',
                  border: 'none', color: couleur(c), fontFamily: 'inherit', opacity: morte ? 0.4 : 1,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nom}{morte && ' 💀'}</span>
                <span style={{ opacity: 0.6, fontSize: 11, flexShrink: 0 }}>{c.pvActuels} PV</span>
              </button>
            )
          })}
        </div>
        )
      })(), document.body)}
    </div>
  )
}
