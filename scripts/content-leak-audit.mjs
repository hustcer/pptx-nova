#!/usr/bin/env node

import { readFileSync } from 'node:fs'

function usage() {
  console.error(`Usage:
  node scripts/content-leak-audit.mjs --patch patch.json --denylist terms.txt [--json]

Checks visible text emitted by set-text, add-run, and add-textbox ops for forbidden
reference-deck business terms. The denylist is one term per line; blank lines and
lines starting with # are ignored.`)
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
}

function collectVisibleText(patch) {
  const ops = Array.isArray(patch?.ops) ? patch.ops : []
  const texts = []
  for (const [index, op] of ops.entries()) {
    if (!['set-text', 'add-run', 'add-textbox'].includes(op?.op)) continue
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

function findMatches(texts, terms) {
  return texts.flatMap((entry) => {
    const textLower = entry.text.toLowerCase()
    return terms
      .filter((term) => {
        const termLower = term.toLowerCase()
        return entry.text.includes(term) || textLower.includes(termLower)
      })
      .map((term) => ({ ...entry, term }))
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
  console.log(JSON.stringify(result, null, 2))
} else if (matches.length === 0) {
  console.log(
    `content-leak-audit ok: ${texts.length} visible text ops checked, ${terms.length} deny terms`,
  )
} else {
  console.error(`content-leak-audit failed: ${matches.length} match(es)`)
  for (const match of matches) {
    console.error(
      `- op#${match.index} ${match.op} ${match.shape ?? '(unknown)'} matched "${match.term}": ${match.text}`,
    )
  }
}

process.exit(matches.length === 0 ? 0 : 2)
