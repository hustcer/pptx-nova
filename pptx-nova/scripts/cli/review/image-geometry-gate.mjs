#!/usr/bin/env node
import { readFileSync, realpathSync, existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { buildImageGeometryReport } from '../../lib/review/image-geometry.mjs'
import { writeJsonOutput } from '../../lib/runtime/output-files.mjs'
import { resolveFilesystemPath } from '../../lib/runtime/filesystem-paths.mjs'

const usage = `Usage:
  node <skill-root>/scripts/cli/review/image-geometry-gate.mjs --source source.pptx --candidate candidate.pptx [options]

Options:
  --output <path>   Report path; defaults to image-geometry-gate.json.
  --xdoc-bin <path> xdoc executable; defaults to xdoc.
  --overwrite       Replace an existing current-run report.
  --json            Print the report as JSON.
  --help            Show this help.

Freshly inspects both inputs and binds their file hashes. Checks original slide-local
pictures for uniform scaling, unchanged crop and mask; allows movement. Does not prove
media-byte, color/effect, grouped-transform, or PowerPoint visual preservation.
Custom or undisclosed masks fail as unverified; equal null presets do not prove unchanged geometry.
`

function main() {
  const args = { output: resolve('image-geometry-gate.json'), xdocBin: 'xdoc' }
  const flags = {
    '--source': 'source',
    '--candidate': 'candidate',
    '--output': 'output',
    '--xdoc-bin': 'xdocBin',
  }
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    if (flag === '--help' || flag === '-h') {
      process.stdout.write(usage)
      return
    }
    if (flag === '--json' || flag === '--overwrite') {
      args[flag.slice(2)] = true
      continue
    }
    const key = flags[flag],
      value = argv[++i]
    if (!key || !value || value.startsWith('--'))
      throw new Error(`Unknown option or missing value: ${flag}`)
    args[key] = value
  }
  if (!args.source || !args.candidate) throw new Error('--source and --candidate are required')
  args.source = realpathSync.native(resolveFilesystemPath(args.source))
  args.candidate = realpathSync.native(resolveFilesystemPath(args.candidate))
  args.output = resolveFilesystemPath(args.output)
  if (existsSync(args.output)) {
    const outputStat = statSync(args.output)
    if (
      [args.source, args.candidate].some((file) => {
        const inputStat = statSync(file)
        return (
          realpathSync.native(args.output) === file ||
          (inputStat.ino === outputStat.ino && inputStat.dev === outputStat.dev)
        )
      })
    )
      throw new Error('Report output must differ from both input PPTX files')
  }
  const identity = (file) => {
    const bytes = readFileSync(file)
    return {
      path: resolve(file),
      byteLength: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    }
  }
  const source = identity(args.source),
    candidate = identity(args.candidate)
  const inspect = (file) => {
    const result = spawnSync(args.xdocBin, ['pptx', 'inspect', resolve(file), '--json'], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      timeout: 60000,
    })
    if (result.error || result.status !== 0)
      throw new Error(result.error?.message ?? result.stderr ?? 'xdoc inspect failed')
    const report = JSON.parse(result.stdout)
    if (report.status !== 'success' || !Array.isArray(report.slides))
      throw new Error('xdoc inspect did not disclose a successful slide inventory')
    return report
  }
  const report = buildImageGeometryReport({
    sourceInspect: inspect(source.path),
    candidateInspect: inspect(candidate.path),
    source,
    candidate,
  })
  if (
    identity(source.path).sha256 !== source.sha256 ||
    identity(candidate.path).sha256 !== candidate.sha256
  )
    throw new Error('Input bytes changed during image inspection')
  writeJsonOutput(resolve(args.output), report, { overwrite: Boolean(args.overwrite) })
  process.stdout.write(
    args.json
      ? JSON.stringify(report, null, 2) + '\n'
      : `Image geometry: ${report.status}; ${report.summary.picturesChecked} picture(s), ${report.summary.issueCount} issue(s).\n`,
  )
  if (report.status === 'fail') process.exitCode = 1
}

try {
  main()
} catch (error) {
  process.stderr.write(`Error: ${error.message}\n`)
  process.exitCode = 1
}
