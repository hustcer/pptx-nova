#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync, realpathSync, statSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { buildProofVisibilityReport } from '../../lib/review/proof-visibility.mjs'

const usage = `Usage:
  node <skill-root>/scripts/cli/review/proof-visibility-gate.mjs --source source.pptx --candidate candidate.pptx --proof-map proof-objects.json [options]

Options:
  --source <path>      Read-only original PPTX.
  --candidate <path>   Current candidate PPTX.
  --proof-map <path>   JSON with sourceSha256 and nonempty proofObjects[{slideNumber,shapeId,role,kind?}].
  --output <path>      Report path. Defaults to proof-visibility-gate.json.
  --overwrite         Replace an existing current-run report.
  --json              Print the complete report.
  --help              Show this help.

kind defaults to shape; table checks native frame/column-grid/row-height consistency.
Shape checks cover direct bounds and fill/line contrast for unadjusted rect/roundRect/ellipse.
Hidden proofs fail. Other geometry, effects and inherited/grouped paint require separate
review, never an automatic pass. Text fit, apparent size, readability,
pixel occlusion and animation playback need separate evidence.
`
try {
  const args = { output: resolve('proof-visibility-gate.json') }
  const flags = {
    '--source': 'source',
    '--candidate': 'candidate',
    '--proof-map': 'proofMap',
    '--output': 'output',
  }
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    if (flag === '--help') {
      process.stdout.write(usage)
      process.exit(0)
    }
    if (['--json', '--overwrite'].includes(flag)) {
      args[flag.slice(2)] = true
      continue
    }
    if (!flags[flag] || !argv[i + 1] || argv[i + 1].startsWith('--'))
      throw new Error(`Invalid argument: ${flag}`)
    args[flags[flag]] = resolve(argv[++i])
  }
  if (!args.source || !args.candidate || !args.proofMap)
    throw new Error('--source, --candidate and --proof-map are required')
  if (existsSync(args.output) && !args.overwrite) throw new Error(`Output exists: ${args.output}`)
  if (
    [args.source, args.candidate, args.proofMap].some(
      (input) =>
        input === args.output ||
        (existsSync(args.output) &&
          (realpathSync(input) === realpathSync(args.output) ||
            (statSync(input).dev === statSync(args.output).dev &&
              statSync(input).ino === statSync(args.output).ino))),
    )
  )
    throw new Error('Report must not replace an input')
  const report = buildProofVisibilityReport({
    source: args.source,
    candidate: args.candidate,
    proofMap: JSON.parse(readFileSync(args.proofMap, 'utf8')),
  })
  mkdirSync(dirname(args.output), { recursive: true })
  writeFileSync(args.output, JSON.stringify(report, null, 2) + '\n')
  process.stdout.write(
    args.json ? JSON.stringify(report, null, 2) + '\n' : `${report.status}: ${args.output}\n`,
  )
  process.exitCode = report.status === 'pass' ? 0 : 1
} catch (error) {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 2
}
