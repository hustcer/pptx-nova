#!/usr/bin/env node
import { existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { verifyMultiColumnEvidence } from '../../lib/review/multi-column-evidence.mjs'

const SCHEMA_VERSION = 'pptx-nova-multi-column-review-gate/v1'

const usage = `Usage:
  node <skill-root>/scripts/cli/review/multi-column-gate.mjs [options]

Options:
  --candidate <path>    Final candidate PPTX reviewed by the human.
  --vision-diff <path>  Final xdoc pptx vision-diff JSON for that candidate.
  --review <path>       Structured pptx-nova-multi-column-review/v1 record.
  --output <path>       Optional report output path.
  --overwrite           Allow replacing an existing output report.
  --json                Print the report as JSON.
  --help                Show this help.

The gate may close only multi-column-text-layout-review findings. Every other
new or worsened high/medium vision issue remains a blocker.
`

function parseArgs(argv) {
  const args = {
    candidate: '',
    visionDiff: '',
    review: '',
    output: '',
    overwrite: false,
    json: false,
  }
  const flags = {
    '--candidate': 'candidate',
    '--vision-diff': 'visionDiff',
    '--review': 'review',
    '--output': 'output',
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(usage)
      process.exit(0)
    }
    if (arg === '--json') {
      args.json = true
      continue
    }
    if (arg === '--overwrite') {
      args.overwrite = true
      continue
    }
    const key = flags[arg]
    if (!key) throw new Error(`Unknown option: ${arg}\n\n${usage}`)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`)
    args[key] = resolve(value)
    index += 1
  }
  for (const key of ['candidate', 'visionDiff', 'review']) {
    if (!args[key]) throw new Error(`--${key === 'visionDiff' ? 'vision-diff' : key} is required`)
  }
  return args
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const report = verifyMultiColumnEvidence(args)
  if (report.status === 'error') throw new Error(report.error.message)

  const output = `${JSON.stringify(report, null, 2)}\n`
  if (args.output) {
    if (existsSync(args.output) && !args.overwrite)
      throw new Error(`Output already exists: ${args.output}`)
    writeFileSync(args.output, output)
  }
  if (args.json || !args.output) process.stdout.write(output)
  else process.stdout.write(`Multi-column review gate: ${report.status}\n`)
  process.exitCode = report.agentGate.passed ? 0 : 2
}

try {
  main()
} catch (error) {
  const failure = {
    schemaVersion: SCHEMA_VERSION,
    status: 'error',
    error: { code: 'multi-column-review-gate-error', message: error.message },
    agentGate: { passed: false, status: 'error', blockerCount: 1 },
  }
  process.stderr.write(`${JSON.stringify(failure, null, 2)}\n`)
  process.exitCode = 1
}
