import React from 'react'
import type { Character, Caracteristique } from '../types/character'
import { getMod } from '../types/character'
import { computeEffects, computeDiceEffects, sumStat } from './computeEffects'
import type { DescMap } from '../types/gameData'

type Segment = { text: string; bold?: boolean; italic?: boolean; gold?: boolean }

function tokenize(text: string): Segment[] {
  const segments: Segment[] = []

  const process = (src: string, bold: boolean, italic: boolean, gold: boolean) => {
    const patterns = [
      { re: /\*\*\*([^*]+)\*\*\*/, nextBold: true, nextItalic: true },
      { re: /\*\*([^*]+)\*\*/,     nextBold: true,  nextItalic: false },
      { re: /\*([^*]+)\*/,         nextBold: false, nextItalic: true },
      { re: /==([^=]+)==/,         gold: true },
    ]

    let remaining = src
    while (remaining.length > 0) {
      let earliest: { index: number; match: RegExpMatchArray; bold: boolean; italic: boolean; isGold: boolean } | null = null

      for (const p of patterns) {
        const m = remaining.match(p.re)
        if (m && m.index !== undefined) {
          if (!earliest || m.index < earliest.index) {
            earliest = {
              index: m.index,
              match: m,
              bold: 'nextBold' in p ? p.nextBold! : bold,
              italic: 'nextItalic' in p ? p.nextItalic! : italic,
              isGold: 'gold' in p ? true : false,
            }
          }
        }
      }

      if (!earliest) {
        segments.push({ text: remaining, bold, italic, gold })
        break
      }

      if (earliest.index > 0) {
        segments.push({ text: remaining.slice(0, earliest.index), bold, italic, gold })
      }

      const inner = earliest.match[1]
      process(inner, earliest.bold, earliest.italic, earliest.isGold ? true : gold)

      remaining = remaining.slice(earliest.index + earliest.match[0].length)
    }
  }

  process(text, false, false, false)
  return segments
}

let _key = 0

function renderSegments(segments: Segment[]): React.ReactNode {
  return (
    <>
      {segments.map(({ text, bold, italic, gold }) => {
        const k = _key++
        let node: React.ReactNode = text
        if (gold) node = <span key={k} style={{ color: 'var(--tdr-gold)' }}>{node}</span>
        if (italic) node = <em key={k}>{node}</em>
        if (bold) node = <strong key={k}>{node}</strong>
        if (!bold && !italic && !gold) return <React.Fragment key={k}>{node}</React.Fragment>
        return node
      })}
    </>
  )
}

// Matches stat modifiers, niveau, and dice effect stats (DM_*)
const BRACKET_TOKEN_RE = /(?:Mod\.\s+(?:(?:de|d')\s*)?(FOR|DEX|CON|INT|SAG|CHA)(?!\s+du\b))|(niveau\s+du\s+PJ|niveau\b)|(DM_[A-Z_]+)/g

function evalArithmetic(expr: string): number | null {
  if (/\d+\s*d\s*\d+/i.test(expr)) return null
  if (/[^0-9+\-\s]/.test(expr.trim())) return null
  const parts = expr.replace(/\s+/g, '').match(/[+-]?\d+/g)
  if (!parts) return null
  return parts.reduce((sum, p) => sum + parseInt(p), 0)
}

function resolveBracket(inner: string, character: Character, descriptions: DescMap): { node: React.ReactNode; total?: number } {
  const effects = computeEffects(character, descriptions)
  const diceEffects = computeDiceEffects(character, descriptions)
  const effectiveMod = (stat: Caracteristique) => {
    const bonus = sumStat(effects[stat] ?? [])
    return getMod(character.caracteristiques[stat].valeur + bonus)
  }

  type TokenInfo = { index: number; match: string; value: number | string }
  const re = new RegExp(BRACKET_TOKEN_RE.source, 'g')
  const tokens: TokenInfo[] = []
  let m: RegExpExecArray | null

  while ((m = re.exec(inner)) !== null) {
    const value = m[1]
      ? effectiveMod(m[1] as Caracteristique)
      : m[3]
        ? (diceEffects[m[3]]?.diceStr ?? m[3])
        : character.niveau
    tokens.push({ index: m.index, match: m[0], value })
  }

  // Compute total only when all tokens are numeric AND there are fixed parts alongside
  let computedTotal: number | null = null
  if (tokens.length > 0 && tokens.every(t => typeof t.value === 'number')) {
    const withoutTokens = tokens.reduce((s, { index, match }) =>
      s.slice(0, index) + ' '.repeat(match.length) + s.slice(index + match.length), inner
    ).trim()
    if (withoutTokens.length > 0) {
      let evalExpr = inner
      let offset = 0
      for (const { index, match, value } of tokens) {
        const repl = (value as number) >= 0 ? `+${value}` : `${value}`
        evalExpr = evalExpr.slice(0, index + offset) + repl + evalExpr.slice(index + offset + match.length)
        offset += repl.length - match.length
      }
      computedTotal = evalArithmetic(evalExpr)
    }
  }

  // Build display nodes
  const parts: React.ReactNode[] = []
  let lastIdx = 0

  for (const { index, match, value } of tokens) {
    if (index > lastIdx) parts.push(inner.slice(lastIdx, index))

    if (computedTotal !== null) {
      parts.push(<React.Fragment key={index}>{match}</React.Fragment>)
    } else {
      const fmtValue = typeof value === 'number'
        ? (value >= 0 ? `+${value}` : `${value}`)
        : value
      parts.push(
        <span key={index}>
          {match}<span style={{ color: 'var(--tdr-stat)', fontWeight: 700 }}>({fmtValue})</span>
        </span>
      )
    }
    lastIdx = index + match.length
  }
  if (lastIdx < inner.length) parts.push(inner.slice(lastIdx))

  const node = <>{parts.map((p, i) => <React.Fragment key={i}>{p}</React.Fragment>)}</>
  return { node, total: computedTotal ?? undefined }
}

function parseInline(text: string, character?: Character, descriptions?: DescMap): React.ReactNode {
  const bracketRe = /\[([^\]]+)\]/g
  const parts: Array<{ type: 'text'; content: string } | { type: 'bracket'; inner: string }> = []
  let lastIdx = 0
  let m: RegExpExecArray | null

  while ((m = bracketRe.exec(text)) !== null) {
    if (m.index > lastIdx) parts.push({ type: 'text', content: text.slice(lastIdx, m.index) })
    parts.push({ type: 'bracket', inner: m[1] })
    lastIdx = m.index + m[0].length
  }
  if (lastIdx < text.length) parts.push({ type: 'text', content: text.slice(lastIdx) })

  return (
    <>
      {parts.map((part, i) => {
        if (part.type === 'text') {
          return <React.Fragment key={i}>{renderSegments(tokenize(part.content))}</React.Fragment>
        }
        if (character) {
          const { node, total } = resolveBracket(part.inner, character, descriptions ?? {})
          return (
            <span key={i} title={`[${part.inner}]`} style={{ cursor: 'help' }}>
              [{node}]{total !== undefined && (
                <span style={{ color: 'var(--tdr-stat)', fontWeight: 700 }}> = {total}</span>
              )}
            </span>
          )
        }
        return <React.Fragment key={i}>[{part.inner}]</React.Fragment>
      })}
    </>
  )
}

function renderTable(lines: string[]): React.ReactNode {
  const rows = lines.map(line =>
    line.split('|').slice(1, -1).map(cell => cell.trim())
  )
  const sepIdx = rows.findIndex(row => row.every(cell => /^[-:\s]+$/.test(cell)))
  const headers = sepIdx > 0 ? rows.slice(0, sepIdx) : []
  const body = sepIdx >= 0 ? rows.slice(sepIdx + 1) : rows

  const cellStyle: React.CSSProperties = {
    border: '1px solid rgba(201,168,76,0.25)',
    padding: '3px 10px',
    textAlign: 'left',
  }
  return (
    <table style={{ borderCollapse: 'collapse', fontSize: '0.9em', margin: '6px 0', width: '100%' }}>
      {headers.length > 0 && (
        <thead>
          {headers.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <th key={j} style={{ ...cellStyle, color: 'var(--tdr-gold)', background: 'rgba(201,168,76,0.07)' }}>
                  {renderSegments(tokenize(cell))}
                </th>
              ))}
            </tr>
          ))}
        </thead>
      )}
      <tbody>
        {body.map((row, i) => (
          <tr key={i} style={{ background: i % 2 === 1 ? 'rgba(201,168,76,0.04)' : 'transparent' }}>
            {row.map((cell, j) => (
              <td key={j} style={cellStyle}>
                {renderSegments(tokenize(cell))}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function parseDesc(text: string, character?: Character, descriptions?: DescMap): React.ReactNode {
  if (!text) return null
  _key = 0

  const lines = text.split('\n')
  const blocks: Array<{ type: 'table'; lines: string[] } | { type: 'text'; lines: string[] }> = []

  let i = 0
  while (i < lines.length) {
    if (lines[i].trimStart().startsWith('|')) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].trimStart().startsWith('|')) {
        tableLines.push(lines[i])
        i++
      }
      blocks.push({ type: 'table', lines: tableLines })
    } else {
      const textLines: string[] = []
      while (i < lines.length && !lines[i].trimStart().startsWith('|')) {
        textLines.push(lines[i])
        i++
      }
      blocks.push({ type: 'text', lines: textLines })
    }
  }

  return (
    <>
      {blocks.map((block, bi) => {
        if (block.type === 'table') {
          return <React.Fragment key={bi}>{renderTable(block.lines)}</React.Fragment>
        }
        const content = block.lines.join('\n')
        return (
          <React.Fragment key={bi}>
            {block.lines.map((line, li) => (
              <React.Fragment key={li}>
                {li > 0 && <br />}
                {parseInline(line, character, descriptions)}
              </React.Fragment>
            ))}
            {content === '' && null}
          </React.Fragment>
        )
      })}
    </>
  )
}
