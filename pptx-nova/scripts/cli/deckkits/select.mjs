#!/usr/bin/env node
import { resolve } from 'node:path'
import { CATALOG_PATH, VALID_TARGETS, selectDeckKit } from '../../lib/deckkits/selection.mjs'

const usage = `Usage:
  node <skill-root>/scripts/cli/deckkits/select.mjs [options]

Options:
  --scenario <name>          Target scenario, e.g. roadshow or executive consulting
  --brief <text>             Infer a known scenario from a short brief; explicit --scenario wins
  --language <code>          Language coverage requirement, e.g. zh|en|mixed
  --density <level>          Density coverage requirement, e.g. normal|dense
  --slide-types <list>       Comma-separated required slide types
  --target <level>           candidate|delivery|default. Defaults to delivery
  --catalog <path>           Catalog path. Defaults to <skill-root>/assets/deckkits/catalog.json
  --json                     Print machine-readable selection result
  --help                     Show this help

Example:
  node <skill-root>/scripts/cli/deckkits/select.mjs \\
    --scenario roadshow \\
    --language mixed \\
    --density dense \\
    --slide-types heroSlide,multiCardSlide,benchmarkSlide,timelineSlide,askSlide \\
    --target delivery \\
    --json
`

function parseArgs(argv) {
  const args = {
    scenario: '',
    brief: '',
    language: '',
    density: '',
    slideTypes: [],
    target: 'delivery',
    catalog: CATALOG_PATH,
    json: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(usage)
      process.exit(0)
    } else if (arg === '--json') {
      args.json = true
    } else if (arg === '--scenario') {
      args.scenario = valueAfter(argv, i, arg)
      i += 1
    } else if (arg === '--brief') {
      args.brief = valueAfter(argv, i, arg)
      i += 1
    } else if (arg === '--language') {
      args.language = valueAfter(argv, i, arg)
      i += 1
    } else if (arg === '--density') {
      args.density = valueAfter(argv, i, arg)
      i += 1
    } else if (arg === '--slide-types') {
      args.slideTypes = splitList(valueAfter(argv, i, arg))
      i += 1
    } else if (arg === '--target') {
      args.target = valueAfter(argv, i, arg)
      i += 1
    } else if (arg === '--catalog') {
      args.catalog = resolve(valueAfter(argv, i, arg))
      i += 1
    } else {
      throw new Error(`Unknown option: ${arg}\n\n${usage}`)
    }
  }

  if (!VALID_TARGETS.includes(args.target)) {
    throw new Error(`--target must be one of ${VALID_TARGETS.join('|')}`)
  }
  return args
}

function valueAfter(argv, index, flag) {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

function splitList(value) {
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function stringArray(value) {
  return (Array.isArray(value) ? value : []).filter(
    (item) => typeof item === 'string' && item.trim(),
  )
}

function previewList(values, limit = 4) {
  const items = stringArray(values).slice(0, limit)
  return items.length > 0 ? items.join('; ') : ''
}

function printHuman(result) {
  for (const warning of result.warnings) process.stdout.write(`Warning: ${warning}\n`)
  if (result.selected) {
    process.stdout.write(`Selected DeckKit: ${result.selected.id}\n`)
    process.stdout.write(`- readiness: ${result.selected.readiness}\n`)
    process.stdout.write(`- score: ${result.selected.score}\n`)
    process.stdout.write(`- path: ${result.selected.path}\n`)
    if (result.selected.visualGrammar) {
      const grammar = result.selected.visualGrammar
      process.stdout.write(`- visual: ${grammar.positioning || 'missing'}\n`)
      const signatures = previewList(grammar.signatureElements)
      if (signatures) process.stdout.write(`- signatures: ${signatures}\n`)
      const avoid = previewList(grammar.avoid)
      if (avoid) process.stdout.write(`- avoid: ${avoid}\n`)
    }
  } else {
    process.stdout.write('No eligible DeckKit found.\n')
  }
  if (result.rejected.length > 0) {
    process.stdout.write('Rejected DeckKits:\n')
    for (const entry of result.rejected) {
      process.stdout.write(`- ${entry.id}: ${entry.blockers.join('; ')}\n`)
    }
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const result = selectDeckKit(args)
  if (args.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  else printHuman(result)
  if (!result.passed) process.exit(1)
}

try {
  main()
} catch (error) {
  process.stderr.write(`[error] ${error.message}\n`)
  process.exit(1)
}
