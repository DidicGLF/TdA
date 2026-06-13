import React, { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { Character, GolemState, GolemRole } from '../types/character'
import { defaultGolemState, getGolemVoieRang } from '../types/character'
import { GOLEM_AMELIORATIONS_LIST, GOLEM_BASE } from '../data/golem'

interface Props {
  character: Character
  onChange: (patch: Partial<Character>) => void
}

const ROLES: GolemRole[] = ['soldat', 'gardien', 'gladiateur']

const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`)

function slotsDisponibles(rang: number, niveau: number): number {
  let s = 0
  if (rang >= 4) s++
  if (niveau >= 9) s++
  if (niveau >= 13) s++
  if (niveau >= 17) s++
  return s
}

function computeStats(golem: GolemState, rang: number, niveau: number) {
  const a = golem.ameliorationsChoisies
  const forMod = GOLEM_BASE.forMod + (a.includes('puissant') ? 2 : 0) + (a.includes('tailleSuperieure') ? 1 : 0)
  const dexMod = GOLEM_BASE.dexMod + (a.includes('formeBestiale') ? 3 : 0)
  const def = GOLEM_BASE.def + (a.includes('armureRenforcee') ? 4 : 0) + (a.includes('formeBestiale') ? 3 : 0)
  const pv = niveau * 4 + (a.includes('tailleSuperieure') ? 10 : 0)
  const baseDM = golem.role === 'soldat' ? '1d10' : a.includes('arme2mains') ? '1d8' : '1d6'
  const dm = `${baseDM}${fmt(forMod)}`
  return { forMod, dexMod, def, pv, dm }
}

const SECTION: React.CSSProperties = { marginBottom: 24 }
const SECTION_TITLE: React.CSSProperties = {
  fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase',
  color: 'rgba(201,168,76,0.7)', fontFamily: "'Cinzel', serif",
  marginBottom: 10, borderBottom: '1px solid rgba(201,168,76,0.15)', paddingBottom: 4,
  display: 'flex', alignItems: 'center', gap: 8,
}
const CARD: React.CSSProperties = {
  fontSize: 13, lineHeight: 1.7, color: 'rgba(245,236,215,0.75)',
  background: 'rgba(201,168,76,0.05)', border: '1px solid rgba(201,168,76,0.12)',
  borderRadius: 6, padding: '10px 14px',
}
const BADGE: React.CSSProperties = {
  fontSize: 10, color: 'rgba(255,160,50,0.65)', fontFamily: 'inherit',
  textTransform: 'none', letterSpacing: 0, fontWeight: 600,
}

export default function CharacterSheetGolem({ character, onChange }: Props) {
  const { t } = useTranslation()
  const golem = character.golem

  // Auto-initialise le golem dès que l'onglet est monté (rang ≥ 2 garanti par App.tsx)
  useEffect(() => {
    if (!golem) onChange({ golem: defaultGolemState() })
  }, [])

  const setGolem = (patch: Partial<GolemState>) =>
    onChange({ golem: { ...(golem ?? defaultGolemState()), ...patch } })

  if (!golem) return null

  const rang = getGolemVoieRang(character)
  const { role, ameliorationsChoisies } = golem
  const slots = slotsDisponibles(rang, character.niveau)
  const stats = computeStats(golem, rang, character.niveau)
  const dimmed = (condition: boolean): React.CSSProperties => condition ? { opacity: 0.38 } : {}

  const toggleAmel = (cle: string) => {
    if (ameliorationsChoisies.includes(cle)) {
      setGolem({ ameliorationsChoisies: ameliorationsChoisies.filter(c => c !== cle) })
    } else if (ameliorationsChoisies.length < slots) {
      setGolem({ ameliorationsChoisies: [...ameliorationsChoisies, cle] })
    }
  }

  const statCells = [
    { label: 'FOR', val: stats.forMod, base: GOLEM_BASE.forMod },
    { label: 'DEX', val: stats.dexMod, base: GOLEM_BASE.dexMod },
    { label: 'CON', val: GOLEM_BASE.conMod, base: GOLEM_BASE.conMod },
    { label: 'INT', val: GOLEM_BASE.intMod, base: GOLEM_BASE.intMod },
    { label: 'SAG', val: GOLEM_BASE.sagMod, base: GOLEM_BASE.sagMod },
    { label: 'CHA', val: GOLEM_BASE.chaMod, base: GOLEM_BASE.chaMod },
  ]

  const derivedCells = [
    { label: 'INIT', val: String(GOLEM_BASE.init), modified: false },
    { label: 'DEF', val: String(stats.def), modified: stats.def !== GOLEM_BASE.def },
    { label: 'PV', val: String(stats.pv), modified: ameliorationsChoisies.includes('tailleSuperieure') },
    { label: 'ATK', val: `+${character.niveau}`, modified: false },
    { label: 'DM', val: stats.dm, modified: role === 'soldat' || ameliorationsChoisies.includes('arme2mains') },
  ]

  return (
    <div style={{ padding: '20px 24px', maxWidth: 680, margin: '0 auto', color: 'rgba(245,236,215,0.85)', fontFamily: 'inherit' }}>

      {/* En-tête */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontFamily: "'Cinzel', serif", fontWeight: 700, color: 'var(--tdr-gold)', letterSpacing: '0.08em' }}>
          {t('golem.titre')}
        </div>
        <button
          onClick={() => onChange({ golem: defaultGolemState() })}
          style={{
            padding: '3px 10px', borderRadius: 3, fontSize: 12, cursor: 'pointer',
            border: '1px solid rgba(255,80,80,0.3)', background: 'transparent',
            color: 'rgba(255,110,110,0.6)', fontFamily: 'inherit',
          }}
        >
          {t('golem.reinitialiser')}
        </button>
      </div>

      {/* Rôle */}
      <div style={{ ...SECTION, ...dimmed(rang < 2) }}>
        <div style={SECTION_TITLE}>
          {t('golem.role')}
          {rang < 2 && <span style={BADGE}>{t('golem.roleIndisponible')}</span>}
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {ROLES.map(r => (
            <button
              key={r}
              onClick={() => { if (rang >= 2) setGolem({ role: r }) }}
              style={{
                padding: '7px 18px', borderRadius: 5, cursor: rang >= 2 ? 'pointer' : 'default',
                border: `1px solid ${role === r ? 'var(--tdr-gold)' : 'rgba(201,168,76,0.3)'}`,
                background: role === r ? 'rgba(201,168,76,0.15)' : 'transparent',
                color: role === r ? 'var(--tdr-gold)' : 'rgba(245,236,215,0.6)',
                fontFamily: "'Cinzel', serif", fontSize: 13, letterSpacing: '0.04em',
                fontWeight: role === r ? 700 : 400,
              }}
            >
              {t(`golem.roles.${r}`)}
            </button>
          ))}
        </div>
        {role && rang >= 2 && (
          <div style={CARD}>
            <strong style={{ color: 'rgba(245,236,215,0.95)', display: 'block', marginBottom: 4, fontSize: 14 }}>
              {t(`golem.roles.${role}`)}
            </strong>
            {t(`golem.roleDesc.${role}`)}
          </div>
        )}
      </div>

      {/* Spécialisation rang 3 */}
      <div style={{ ...SECTION, ...dimmed(rang < 3 || !role) }}>
        <div style={SECTION_TITLE}>
          {t('golem.specialisation')}
          {rang < 3 && <span style={BADGE}>{t('golem.specialisationIndisponible')}</span>}
          {rang >= 3 && !role && <span style={BADGE}>{t('golem.specialisationAucunRole')}</span>}
        </div>
        {role ? (
          <div style={CARD}>{t(`golem.specialisationDesc.${role}`)}</div>
        ) : (
          <div style={{ fontSize: 13, color: 'rgba(245,236,215,0.3)', fontStyle: 'italic' }}>
            {t('golem.specialisationAucunRole')}
          </div>
        )}
      </div>

      {/* Caractéristiques calculées */}
      <div style={SECTION}>
        <div style={SECTION_TITLE}>{t('golem.statsGolem')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6, marginBottom: 8 }}>
          {statCells.map(({ label, val, base }) => {
            const modified = val !== base
            return (
              <div
                key={label}
                style={{
                  textAlign: 'center', padding: '8px 4px',
                  background: modified ? 'rgba(201,168,76,0.1)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${modified ? 'rgba(201,168,76,0.3)' : 'rgba(255,255,255,0.07)'}`,
                  borderRadius: 4,
                }}
              >
                <div style={{ fontSize: 10, color: 'rgba(245,236,215,0.38)', letterSpacing: '0.1em', marginBottom: 3 }}>
                  {label}
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: modified ? 'var(--tdr-gold)' : 'rgba(245,236,215,0.85)' }}>
                  {fmt(val)}
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
          {derivedCells.map(({ label, val, modified }) => (
            <div
              key={label}
              style={{
                textAlign: 'center', padding: '8px 4px',
                background: modified ? 'rgba(201,168,76,0.1)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${modified ? 'rgba(201,168,76,0.3)' : 'rgba(255,255,255,0.07)'}`,
                borderRadius: 4,
              }}
            >
              <div style={{ fontSize: 10, color: 'rgba(245,236,215,0.38)', letterSpacing: '0.1em', marginBottom: 3 }}>
                {label}
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: modified ? 'var(--tdr-gold)' : 'rgba(245,236,215,0.85)' }}>
                {val}
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(245,236,215,0.3)', marginTop: 8, fontStyle: 'italic' }}>
          {t('golem.statsNote', { niveau: character.niveau })}
        </div>
      </div>

      {/* Améliorations */}
      <div style={SECTION}>
        <div style={SECTION_TITLE}>
          {t('golem.ameliorations')}
          {slots > 0 ? (
            <span style={{
              ...BADGE,
              color: ameliorationsChoisies.length >= slots ? 'rgba(255,160,50,0.9)' : 'rgba(201,168,76,0.7)',
            }}>
              {ameliorationsChoisies.length}/{slots}
            </span>
          ) : (
            <span style={BADGE}>{t('golem.ameliorationsIndisponibles')}</span>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, ...dimmed(slots === 0) }}>
          {GOLEM_AMELIORATIONS_LIST.map(({ cle, type }) => {
            const checked = ameliorationsChoisies.includes(cle)
            const full = !checked && ameliorationsChoisies.length >= slots
            const disabled = slots === 0 || full
            return (
              <label
                key={cle}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  cursor: disabled ? 'default' : 'pointer',
                  opacity: disabled ? 0.4 : 1,
                  padding: '7px 10px',
                  background: checked ? 'rgba(201,168,76,0.08)' : 'transparent',
                  borderRadius: 5, border: `1px solid ${checked ? 'rgba(201,168,76,0.25)' : 'transparent'}`,
                  transition: 'background 0.12s',
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => toggleAmel(cle)}
                  style={{ marginTop: 3, accentColor: 'var(--tdr-gold)', cursor: 'inherit', flexShrink: 0 }}
                />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(245,236,215,0.9)' }}>
                    {t(`golem.ameliorationLabels.${cle}`)}
                    {type === 'texte' && (
                      <span style={{
                        marginLeft: 7, fontSize: 10, color: 'rgba(255,160,50,0.65)',
                        background: 'rgba(255,160,50,0.1)', padding: '1px 5px',
                        borderRadius: 3, verticalAlign: 'middle',
                      }}>
                        {t('golem.textuel')}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(245,236,215,0.5)', marginTop: 1 }}>
                    {t(`golem.ameliorationDescs.${cle}`)}
                  </div>
                </div>
              </label>
            )
          })}
        </div>
      </div>

    </div>
  )
}
