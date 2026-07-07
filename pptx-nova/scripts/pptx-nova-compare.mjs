#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'

const usage = `Usage:
  node <skill-root>/scripts/pptx-nova-compare.mjs --source <source.pptx> --candidate <candidate.pptx> --run-dir <run-dir> [options]

Options:
  --source <path>           Read-only source PPTX before the workflow.
  --candidate <path>        Candidate/final PPTX after the workflow.
  --run-dir <path>          Run directory used for compare evidence.
  --kind <name>             Compare kind, e.g. translation or refurbish. Defaults to compare.
  --output <path>           Output PNG. Defaults to run-dir/<kind>-compare.png.
  --report <path>           Output JSON report. Defaults to run-dir/<kind>-compare.json.
  --slides <selector>       Optional 1-based slide selector, e.g. 1,3-5.
  --dpi <number>            PNG render DPI. Defaults to 192.
  --xdoc-bin <path>         xdoc executable. Defaults to xdoc.
  --source-label <text>     Deprecated; xdoc contact-diff owns contact sheet labels.
  --candidate-label <text>  Deprecated; xdoc contact-diff owns contact sheet labels.
  --overwrite               Allow replacing existing output/report files.
  --json                    Print the xdoc contact-diff report to stdout.
  --help                    Show this help.

The helper delegates before/after visual comparison to xdoc pptx contact-diff,
which renders a side-by-side contact sheet and emits a pptx-contact-diff/v1 JSON
report used by pptx-nova-compare-gate.mjs.
`

const valueFlags = {
  '--source': 'source',
  '--candidate': 'candidate',
  '--run-dir': 'runDir',
  '--kind': 'kind',
  '--output': 'output',
  '--report': 'report',
  '--slides': 'slides',
  '--dpi': 'dpi',
  '--xdoc-bin': 'xdocBin',
  '--source-label': 'sourceLabel',
  '--candidate-label': 'candidateLabel',
}

function parseArgs(argv) {
  const args = {
    source: '',
    candidate: '',
    runDir: '',
    kind: 'compare',
    output: '',
    report: '',
    slides: '',
    dpi: 192,
    xdocBin: 'xdoc',
    sourceLabel: '',
    candidateLabel: '',
    overwrite: false,
    json: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(usage)
      process.exit(0)
    }
    if (arg === '--overwrite') {
      args.overwrite = true
      continue
    }
    if (arg === '--json') {
      args.json = true
      continue
    }
    const key = valueFlags[arg]
    if (!key) throw new Error(`Unknown option: ${arg}\n\n${usage}`)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`)
    args[key] = key === 'dpi' ? Number(value) : value
    index += 1
  }

  if (!args.source) throw new Error(`--source is required.\n\n${usage}`)
  if (!args.candidate) throw new Error(`--candidate is required.\n\n${usage}`)
  if (!args.runDir) throw new Error(`--run-dir is required.\n\n${usage}`)
  if (!Number.isInteger(args.dpi) || args.dpi < 72 || args.dpi > 600) {
    throw new Error('--dpi must be an integer between 72 and 600')
  }

  args.source = resolve(args.source)
  args.candidate = resolve(args.candidate)
  args.runDir = resolve(args.runDir)
  args.kind = normalizeKind(args.kind)
  const defaultStem = `${args.kind}-compare`
  args.output = resolve(args.output || join(args.runDir, `${defaultStem}.png`))
  args.report = resolve(args.report || join(args.runDir, `${defaultStem}.json`))
  return args
}

function normalizeKind(kind) {
  const normalized = String(kind || 'compare')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || 'compare'
}

function commandText(bin, args) {
  return [bin, ...args].map((value) => (/\s/.test(value) ? JSON.stringify(value) : value)).join(' ')
}

function commandInvocation(bin, args) {
  const scriptExts = new Set(['.cjs', '.js', '.mjs'])
  const ext = extname(bin).toLowerCase()
  if (scriptExts.has(ext) && (bin.includes('/') || bin.includes('\\') || existsSync(bin))) {
    return { bin: process.execPath, args: [bin, ...args] }
  }
  return { bin, args }
}

function run(bin, args, options = {}) {
  const command = commandInvocation(bin, args)
  const result = spawnSync(command.bin, command.args, {
    cwd: options.cwd,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  })
  if (result.error) {
    throw new Error(
      `${commandText(command.bin, command.args)} failed to start: ${result.error.message}`,
    )
  }
  if (result.status !== 0) {
    throw new Error(
      `${commandText(command.bin, command.args)} failed with exit ${result.status}\n${result.stderr || result.stdout}`,
    )
  }
  return result
}

function ensureInputFile(path, label) {
  if (!existsSync(path)) throw new Error(`${label} does not exist: ${path}`)
  const stat = statSync(path)
  if (!stat.isFile()) throw new Error(`${label} is not a file: ${path}`)
}

function ensureWritable(path, overwrite) {
  if (existsSync(path) && !overwrite) {
    throw new Error(`Refusing to overwrite existing file without --overwrite: ${path}`)
  }
  mkdirSync(dirname(path), { recursive: true })
}

function parseJsonReport(stdout) {
  try {
    return JSON.parse(stdout)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`xdoc contact-diff did not return valid JSON: ${message}`)
  }
}

function reportImagePath(report) {
  return (
    report.outputPath || report.output || report.render?.path || report.contactSheet?.path || ''
  )
}

function runContactDiff(args) {
  const commandArgs = [
    'pptx',
    'contact-diff',
    '--source',
    args.source,
    '--candidate',
    args.candidate,
    '--output',
    args.output,
    '--dpi',
    String(args.dpi),
    '--json',
  ]
  if (args.slides) commandArgs.push('--slides', args.slides)
  if (args.overwrite) commandArgs.push('--overwrite')

  const result = run(args.xdocBin, commandArgs)
  const report = parseJsonReport(result.stdout)
  const outputPath = reportImagePath(report)
  if (outputPath && resolve(outputPath) !== args.output) {
    throw new Error(`xdoc contact-diff reported a different output path: ${outputPath}`)
  }
  if (!existsSync(args.output) || statSync(args.output).size <= 0) {
    throw new Error(`xdoc contact-diff did not create a non-empty output PNG: ${args.output}`)
  }
  return report
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  ensureInputFile(args.source, 'source PPTX')
  ensureInputFile(args.candidate, 'candidate PPTX')
  ensureWritable(args.output, args.overwrite)
  ensureWritable(args.report, args.overwrite)
  mkdirSync(args.runDir, { recursive: true })

  const report = runContactDiff(args)
  writeFileSync(args.report, `${JSON.stringify(report, null, 2)}\n`)
  if (args.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  else {
    const pairCount = report.agentGate?.pairCount ?? report.summary?.pairCount ?? 'unknown'
    process.stdout.write(
      `${args.kind} compare image written: ${args.output} (${basename(args.source)} vs ${basename(args.candidate)}, ${pairCount} slide pairs, ${args.dpi} dpi)\n`,
    )
  }
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`${message}\n`)
  process.exit(1)
}
