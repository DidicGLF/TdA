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
      { re: /==((?:[^=]|=[^=])+)==/, gold: true },
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

// Matches stat modifiers, niveau, rang, and dice effect stats (DM_*)
const BRACKET_TOKEN_RE = /(?:Mod\.\s+(?:(?:de|d')\s*)?(FOR|DEX|CON|INT|SAG|CHA)(?!\s+du\b))|(niveau\s+du\s+PJ|niveau\b)|(DM_[A-Z_]+)|(rang\b)/g

function evalArithmetic(expr: string): number | null {
  if (/\d+\s*d\s*\d+/i.test(expr)) return null
  if (/[^0-9+\-\s]/.test(expr.trim())) return null
  const parts = expr.replace(/\s+/g, '').match(/[+-]?\d+/g)
  if (!parts) return null
  return parts.reduce((sum, p) => sum + parseInt(p), 0)
}

function resolveBracket(inner: string, character: Character, descriptions: DescMap, rang?: number): { node: React.ReactNode; total?: number } {
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
        : m[4]
          ? (rang ?? '?')
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

type InlineNode =
  | { type: 'text'; text: string; bold: boolean; italic: boolean; gold: boolean }
  | { type: 'bracket'; inner: string; gold: boolean }

function tokenizeAll(text: string): InlineNode[] {
  const nodes: InlineNode[] = []

  const process = (src: string, bold: boolean, italic: boolean, gold: boolean) => {
    const patterns: Array<{ re: RegExp; nextBold?: boolean; nextItalic?: boolean; nextGold?: boolean; isBracket?: boolean }> = [
      { re: /\*\*\*([^*]+)\*\*\*/, nextBold: true,  nextItalic: true  },
      { re: /\*\*([^*]+)\*\*/,     nextBold: true,  nextItalic: false },
      { re: /\*([^*]+)\*/,         nextBold: false, nextItalic: true  },
      { re: /==((?:[^=]|=[^=])+)==/, nextGold: true                     },
      { re: /\[([^\]]+)\]/,        isBracket: true                    },
    ]

    let remaining = src
    while (remaining.length > 0) {
      let earliest: { index: number; match: RegExpMatchArray; nextBold?: boolean; nextItalic?: boolean; nextGold?: boolean; isBracket?: boolean } | null = null

      for (const p of patterns) {
        const m = remaining.match(p.re)
        if (m && m.index !== undefined) {
          if (!earliest || m.index < earliest.index) {
            earliest = { index: m.index, match: m, nextBold: p.nextBold, nextItalic: p.nextItalic, nextGold: p.nextGold, isBracket: p.isBracket }
          }
        }
      }

      if (!earliest) {
        nodes.push({ type: 'text', text: remaining, bold, italic, gold })
        break
      }

      if (earliest.index > 0) {
        nodes.push({ type: 'text', text: remaining.slice(0, earliest.index), bold, italic, gold })
      }

      const inner = earliest.match[1]
      if (earliest.isBracket) {
        nodes.push({ type: 'bracket', inner, gold })
      } else {
        process(inner, bold || !!earliest.nextBold, italic || !!earliest.nextItalic, gold || !!earliest.nextGold)
      }

      remaining = remaining.slice(earliest.index + earliest.match[0].length)
    }
  }

  process(text, false, false, false)
  return nodes
}

function parseInline(text: string, character?: Character, descriptions?: DescMap, rang?: number): React.ReactNode {
  const nodes = tokenizeAll(text)
  return (
    <>
      {nodes.map((node, i) => {
        if (node.type === 'bracket') {
          if (character) {
            const { node: bracketNode, total } = resolveBracket(node.inner, character, descriptions ?? {}, rang)
            const n = (
              <span title={`[${node.inner}]`} style={{ cursor: 'help' }}>
                [{bracketNode}]{total !== undefined && <span style={{ color: 'var(--tdr-stat)', fontWeight: 700 }}> = {total}</span>}
              </span>
            )
            return node.gold
              ? <span key={i} style={{ color: 'var(--tdr-gold)' }}>{n}</span>
              : <React.Fragment key={i}>{n}</React.Fragment>
          }
          return <React.Fragment key={i}>[{node.inner}]</React.Fragment>
        }
        const k = _key++
        let el: React.ReactNode = node.text
        if (node.gold) el = <span style={{ color: 'var(--tdr-gold)' }}>{el}</span>
        if (node.italic) el = <em>{el}</em>
        if (node.bold) el = <strong>{el}</strong>
        return <React.Fragment key={k}>{el}</React.Fragment>
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

export function parseDesc(text: string, character?: Character, descriptions?: DescMap, rang?: number): React.ReactNode {
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
                {parseInline(line, character, descriptions, rang)}
              </React.Fragment>
            ))}
            {content === '' && null}
          </React.Fragment>
        )
      })}
    </>
  )
}
