#!/usr/bin/env node

import { readFileSync } from 'node:fs'

function usage() {
  process.stderr.write(`Usage:
  node scripts/content-leak-audit.mjs --patch patch.json --denylist terms.txt [--json]

Checks visible text emitted by set-text-frame, add-text-box, add-paragraph,
set-paragraph, add-run, set-run, native table cells and classic chart category/
series text for forbidden reference-deck business terms. Does not inspect binary
PPTX parts or arbitrary raw XML. The denylist is one term per line; blank lines and
lines starting with # are ignored.

Denylist entry modes:
  proprietary phrase         Defaults to word matching for single words, phrase matching otherwise
  word:Strategy              Match Strategy as a whole token, not StrategyMap
  phrase:Acme 2026 plan      Match the whitespace-normalized phrase
  contains:AcmeStrategy      Match any case-insensitive substring
  regex:\\bAcme\\s+2026\\b    Match a JavaScript regular expression with i/u flags
`)
}

function parseArgs(argv) {
  const args = { json: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--json') {
      args.json = true
      continue
    }
    if (arg === '--patch' || arg === '--denylist') {
      const value = argv[i + 1]
      if (!value) {
        usage()
        process.exit(1)
      }
      args[arg.slice(2)] = value
      i += 1
      continue
    }
    usage()
    process.exit(1)
  }
  if (!args.patch || !args.denylist) {
    usage()
    process.exit(1)
  }
  return args
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function loadTerms(path) {
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map(parseTerm)
}

function collectVisibleText(patch) {
  const ops = Array.isArray(patch?.ops) ? patch.ops : []
  const texts = []
  for (const [index, op] of ops.entries()) {
    const remember = (text, path) => {
      if (typeof text === 'string' && text.length)
        texts.push({ index, op: op.op, shape: op.shape?.name ?? op.name ?? null, path, text })
    }
    if (['add-table', 'set-table-data'].includes(op?.op)) {
      const matrix = Array.isArray(op.data) ? op.data : op.data?.values
      if (Array.isArray(matrix))
        matrix.forEach((row, r) => {
          if (Array.isArray(row)) row.forEach((cell, c) => remember(cell, `data[${r}][${c}]`))
        })
      if (typeof op.data?.text === 'string') remember(op.data.text, 'data.text')
    }
    if (op?.op === 'set-table')
      (op.cells ?? []).forEach((cell, i) => remember(cell.text, `cells[${i}].text`))
    if (['add-chart', 'set-chart-data'].includes(op?.op)) {
      ;(op.data?.categories ?? []).forEach((text, i) => remember(text, `data.categories[${i}]`))
      ;(op.data?.series ?? []).forEach((series, i) =>
        remember(series.name, `data.series[${i}].name`),
      )
    }
    if (
      ![
        'set-text-frame',
        'add-text-box',
        'add-paragraph',
        'set-paragraph',
        'add-run',
        'set-run',
      ].includes(op?.op)
    )
      continue
    if (typeof op.text !== 'string' || op.text.length === 0) continue
    texts.push({
      index,
      op: op.op,
      shape: op.shape?.name ?? op.name ?? null,
      text: op.text,
    })
  }
  return texts
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeSpaces(value) {
  return String(value).replace(/\s+/g, ' ').trim()
}

function parseTerm(line) {
  const match = /^(word|phrase|contains|regex):(.*)$/i.exec(line)
  const mode = match ? match[1].toLowerCase() : line.includes(' ') ? 'phrase' : 'word'
  const value = match ? match[2].trim() : line
  if (!value) throw new Error(`denylist entry "${line}" has no value`)
  if (mode === 'regex') {
    return {
      raw: line,
      mode,
      value,
      pattern: new RegExp(value, 'iu'),
    }
  }
  if (mode === 'word') {
    return {
      raw: line,
      mode,
      value,
      pattern: new RegExp(`(^|[^\\p{L}\\p{N}_])${escapeRegExp(value)}(?=$|[^\\p{L}\\p{N}_])`, 'iu'),
    }
  }
  return {
    raw: line,
    mode,
    value: normalizeSpaces(value),
  }
}

function termMatches(text, textLower, normalizedTextLower, term) {
  if (term.mode === 'regex' || term.mode === 'word') return term.pattern.test(text)
  if (term.mode === 'contains') return textLower.includes(term.value.toLowerCase())
  return normalizedTextLower.includes(term.value.toLowerCase())
}

function findMatches(texts, terms) {
  return texts.flatMap((entry) => {
    const textLower = entry.text.toLowerCase()
    const normalizedTextLower = normalizeSpaces(entry.text).toLowerCase()
    return terms
      .filter((term) => termMatches(entry.text, textLower, normalizedTextLower, term))
      .map((term) => ({ ...entry, term: term.value, mode: term.mode, rawTerm: term.raw }))
  })
}

const args = parseArgs(process.argv.slice(2))
const patch = loadJson(args.patch)
const terms = loadTerms(args.denylist)
const texts = collectVisibleText(patch)
const matches = findMatches(texts, terms)
const result = {
  ok: matches.length === 0,
  textCount: texts.length,
  termCount: terms.length,
  matchCount: matches.length,
  matches,
}

if (args.json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
} else if (matches.length === 0) {
  process.stdout.write(
    `content-leak-audit ok: ${texts.length} visible text ops checked, ${terms.length} deny terms`,
  )
  process.stdout.write('\n')
} else {
  process.stderr.write(`content-leak-audit failed: ${matches.length} match(es)\n`)
  for (const match of matches) {
    process.stderr.write(
      `- op#${match.index} ${match.op} ${match.shape ?? '(unknown)'} matched ${match.mode}:${JSON.stringify(match.term)}: ${match.text}\n`,
    )
  }
}

process.exit(matches.length === 0 ? 0 : 2)
