#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { prepareDesignContext } from '../../lib/design/context.mjs'
import { writeJsonOutput } from '../../lib/runtime/output-files.mjs'

const usage = `Usage:
  node <skill-root>/scripts/cli/design/context.mjs --workflow create|edit|refurbish [options]

Options:
  --brief <text>         User task; used as data, never as executable instructions.
  --brief-file <path>    Read the task from a UTF-8 file instead of --brief.
  --deckkit <id>         Explicit target kit for Create/Refurbish; never silently substituted.
  --scenario <name>      Explicit topic routing takes priority over brief inference.
  --language <code>      Required kit language coverage.
  --density <level>      Required kit density coverage.
  --slide-types <list>   Required registered slide types, comma separated.
  --target <level>       delivery|default|candidate; defaults to delivery.
  --intent <name>        polish|bolder|quieter|distill|typeset; defaults to polish.
  --slides <expression>  One-based edit/review scope, e.g. 2,4-5.
  --inspect <path>       Existing source inspect JSON for scoped object facts.
  --catalog <path>       Optional explicit DeckKit catalog.
  --output <path>        Optional report path; existing output is preserved by default.
  --overwrite           Replace an explicitly selected current-run report.
  --json                Print the report as JSON (default).
  --help                Show this help.

Read-only design preparation. No authoring, rendering, approval or delivery certification.
Use actual samples and renders; continue through the existing workflow gates.
`

function parseSlides(value) {
  const slides = []
  for (const part of value.split(',')) {
    const match = part.trim().match(/^([1-9]\d*)(?:-([1-9]\d*))?$/)
    if (!match) throw new Error('Invalid one-based slide scope')
    const first = Number(match[1])
    const last = Number(match[2] ?? first)
    if (!Number.isSafeInteger(last) || last < first || last > 10000)
      throw new Error('Invalid slide range')
    for (let slide = first; slide <= last; slide++) slides.push(slide)
  }
  return slides
}

try {
  const args = {}
  const valueFlags = new Map([
    ['workflow', 'workflow'],
    ['brief', 'brief'],
    ['brief-file', 'briefFile'],
    ['deckkit', 'deckkit'],
    ['scenario', 'scenario'],
    ['language', 'language'],
    ['density', 'density'],
    ['slide-types', 'slideTypes'],
    ['target', 'target'],
    ['intent', 'intent'],
    ['slides', 'slides'],
    ['inspect', 'inspectPath'],
    ['catalog', 'catalog'],
    ['output', 'output'],
  ])
  for (let index = 2; index < process.argv.length; index++) {
    const arg = process.argv[index]
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(usage)
      process.exit(0)
    }
    if (arg === '--json') continue
    if (arg === '--overwrite') {
      args.overwrite = true
      continue
    }
    const key = valueFlags.get(arg.slice(2))
    const value = process.argv[index + 1]
    if (
      !arg.startsWith('--') ||
      !key ||
      !value ||
      value.startsWith('--') ||
      args[key] !== undefined
    )
      throw new Error(`Unknown, repeated or incomplete argument: ${arg}`)
    args[key] = value
    index++
  }
  if (args.brief && args.briefFile) throw new Error('Choose --brief or --brief-file')
  if (args.briefFile) {
    const bytes = readFileSync(resolve(args.briefFile))
    if (bytes.length > 131072) throw new Error('Brief exceeds 128 KiB')
    args.brief = bytes.toString('utf8')
  }
  if (args.slides) args.slides = parseSlides(args.slides)
  if (args.slideTypes)
    args.slideTypes = args.slideTypes
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  if (args.inspectPath) args.inspect = JSON.parse(readFileSync(resolve(args.inspectPath), 'utf8'))
  const report = prepareDesignContext(args)
  if (args.output)
    writeJsonOutput(resolve(args.output), report, {
      overwrite: args.overwrite,
      label: 'design context',
    })
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
} catch (error) {
  process.stderr.write(`[error] ${error.message}\n`)
  process.exitCode = 1
}
