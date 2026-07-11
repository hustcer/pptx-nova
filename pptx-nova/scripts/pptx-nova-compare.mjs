#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
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
  --slide-count <number>    Full source slide count. Enables automatic multipart output.
  --compare-chunk-size <n>  Slides per multipart PNG. Defaults to 20.
  --dpi <number>            PNG render DPI. Defaults to 192.
  --fallback-dpi <number>   Retry DPI for a retryable RenderError. Defaults to 144.
  --xdoc-bin <path>         xdoc executable. Defaults to xdoc.
  --source-label <text>     Deprecated; xdoc contact-diff owns contact sheet labels.
  --candidate-label <text>  Deprecated; xdoc contact-diff owns contact sheet labels.
  --overwrite               Allow replacing existing output/report files.
  --json                    Print the xdoc contact-diff report to stdout.
  --help                    Show this help.

The helper delegates before/after visual comparison to xdoc pptx contact-diff,
which renders a side-by-side contact sheet and emits a pptx-contact-diff/v1 JSON
report used by pptx-nova-compare-gate.mjs. Full-deck compares larger than the
chunk size are emitted as numbered PNGs plus a pptx-nova-compare-manifest/v1.
`

const valueFlags = {
  '--source': 'source',
  '--candidate': 'candidate',
  '--run-dir': 'runDir',
  '--kind': 'kind',
  '--output': 'output',
  '--report': 'report',
  '--slides': 'slides',
  '--slide-count': 'slideCount',
  '--compare-chunk-size': 'chunkSize',
  '--dpi': 'dpi',
  '--fallback-dpi': 'fallbackDpi',
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
    slideCount: 0,
    chunkSize: 20,
    dpi: 192,
    fallbackDpi: 144,
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
    args[key] = ['dpi', 'fallbackDpi', 'slideCount', 'chunkSize'].includes(key)
      ? Number(value)
      : value
    index += 1
  }

  if (!args.source) throw new Error(`--source is required.\n\n${usage}`)
  if (!args.candidate) throw new Error(`--candidate is required.\n\n${usage}`)
  if (!args.runDir) throw new Error(`--run-dir is required.\n\n${usage}`)
  if (!Number.isInteger(args.dpi) || args.dpi < 72 || args.dpi > 600) {
    throw new Error('--dpi must be an integer between 72 and 600')
  }
  if (!Number.isInteger(args.fallbackDpi) || args.fallbackDpi < 72 || args.fallbackDpi > 600) {
    throw new Error('--fallback-dpi must be an integer between 72 and 600')
  }
  if (!args.slides && args.slideCount > 0 && args.fallbackDpi >= args.dpi) {
    throw new Error('--fallback-dpi must be lower than --dpi')
  }
  if (!Number.isInteger(args.slideCount) || args.slideCount < 0) {
    throw new Error('--slide-count must be a non-negative integer')
  }
  if (!Number.isInteger(args.chunkSize) || args.chunkSize <= 0) {
    throw new Error('--compare-chunk-size must be a positive integer')
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
  return { ...result, command: commandText(command.bin, command.args) }
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

function parseJsonReportSafe(stdout) {
  try {
    return JSON.parse(stdout || '')
  } catch {
    return null
  }
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function numberedPath(path, partNumber, width) {
  const extension = extname(path)
  const base = path.slice(0, -extension.length)
  return `${base}-${String(partNumber).padStart(width, '0')}${extension}`
}

function slideChunks(slideCount, chunkSize) {
  const chunks = []
  for (let start = 1; start <= slideCount; start += chunkSize) {
    const end = Math.min(start + chunkSize - 1, slideCount)
    chunks.push({
      start,
      end,
      selector: `${start}-${end}`,
      slides: Array.from({ length: end - start + 1 }, (_, index) => start + index),
    })
  }
  return chunks
}

function failureDetails(report, result) {
  const error = report?.error ?? {}
  return {
    kind: error.kind ?? error.code ?? 'CommandFailure',
    code: error.code ?? error.kind ?? 'CommandFailure',
    stage: error.stage ?? null,
    retryable: error.retryable === true,
    requestedDpi: error.requestedDpi ?? null,
    pairCount: error.pairCount ?? null,
    reason: error.reason ?? null,
    message: error.message ?? result.stderr?.trim() ?? `xdoc exited ${result.status}`,
  }
}

function isRetryableRenderError(error) {
  return error.retryable === true && (error.kind === 'RenderError' || error.code === 'RenderError')
}

function reportImagePath(report) {
  return (
    report.outputPath || report.output || report.render?.path || report.contactSheet?.path || ''
  )
}

function runContactDiff(args, { output = args.output, slides = args.slides, dpi = args.dpi } = {}) {
  const commandArgs = [
    'pptx',
    'contact-diff',
    '--source',
    args.source,
    '--candidate',
    args.candidate,
    '--output',
    output,
    '--dpi',
    String(dpi),
    '--json',
  ]
  if (slides) commandArgs.push('--slides', slides)
  if (args.overwrite || existsSync(output)) commandArgs.push('--overwrite')

  const result = run(args.xdocBin, commandArgs)
  const report = parseJsonReportSafe(result.stdout)
  if (result.status !== 0 || report?.status === 'error') {
    return { status: 'failed', result, report, error: failureDetails(report, result) }
  }
  if (!report) parseJsonReport(result.stdout)
  const outputPath = reportImagePath(report)
  if (outputPath && resolve(outputPath) !== output) {
    throw new Error(`xdoc contact-diff reported a different output path: ${outputPath}`)
  }
  if (!existsSync(output) || statSync(output).size <= 0) {
    throw new Error(`xdoc contact-diff did not create a non-empty output PNG: ${output}`)
  }
  return { status: 'success', result, report }
}

function runSingleCompare(args) {
  const attempts = []
  let attempt = runContactDiff(args)
  if (attempt.status === 'failed') {
    attempts.push({ dpi: args.dpi, status: 'failed', error: attempt.error })
    rmSync(args.output, { force: true })
    if (!args.slides && args.slideCount > 0 && isRetryableRenderError(attempt.error)) {
      attempt = runContactDiff(args, { dpi: args.fallbackDpi })
    }
  }
  if (attempt.status !== 'success') {
    rmSync(args.output, { force: true })
    rmSync(args.report, { force: true })
    throw new Error(
      `${attempt.result.command} failed with exit ${attempt.result.status}: ${attempt.error.message}`,
    )
  }
  const effectiveDpi = Number(attempt.report?.render?.dpi ?? attempt.report?.summary?.dpi)
  attempts.push({ dpi: effectiveDpi, status: 'success' })
  const report = {
    ...attempt.report,
    pptxNovaCompare: {
      mode: 'single',
      requestedDpi: args.dpi,
      fallbackDpi: args.fallbackDpi,
      attempts,
    },
  }
  writeFileSync(args.report, `${JSON.stringify(report, null, 2)}\n`)
  return report
}

function cleanupMultipart(paths) {
  for (const path of paths) rmSync(path, { force: true })
}

function coverageFor(parts, slideCount) {
  const counts = new Map()
  for (const part of parts) {
    for (const slide of part.slides) counts.set(slide, (counts.get(slide) ?? 0) + 1)
  }
  const expected = Array.from({ length: slideCount }, (_, index) => index + 1)
  return {
    expectedSlides: expected,
    coveredSlides: expected.filter((slide) => counts.has(slide)),
    missingSlides: expected.filter((slide) => !counts.has(slide)),
    duplicateSlides: expected.filter((slide) => (counts.get(slide) ?? 0) > 1),
    outOfRangeSlides: [...counts.keys()]
      .filter((slide) => slide < 1 || slide > slideCount)
      .sort((a, b) => a - b),
  }
}

function runMultipartCompare(args) {
  const chunks = slideChunks(args.slideCount, args.chunkSize)
  const numberWidth = Math.max(2, String(chunks.length).length)
  const cleanupPaths = [args.report]
  const parts = []
  try {
    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index]
      const output = numberedPath(args.output, index + 1, numberWidth)
      const partReportPath = numberedPath(args.report, index + 1, numberWidth)
      cleanupPaths.push(output, partReportPath)
      const attempts = []
      let attemptedDpi = args.dpi
      let attempt = runContactDiff(args, { output, slides: chunk.selector, dpi: args.dpi })
      if (attempt.status === 'failed') {
        attempts.push({ dpi: args.dpi, status: 'failed', error: attempt.error })
        rmSync(output, { force: true })
        if (isRetryableRenderError(attempt.error)) {
          attemptedDpi = args.fallbackDpi
          attempt = runContactDiff(args, {
            output,
            slides: chunk.selector,
            dpi: args.fallbackDpi,
          })
        }
      }
      if (attempt.status === 'failed') {
        if (attempts.length === 0 || attempts.at(-1)?.dpi !== attemptedDpi) {
          attempts.push({
            dpi: attemptedDpi,
            status: 'failed',
            error: attempt.error,
          })
        }
        throw new Error(
          `contact-diff part ${index + 1}/${chunks.length} (${chunk.selector}) failed: ${attempt.error.message}`,
        )
      }
      const effectiveDpi = Number(attempt.report?.render?.dpi ?? attempt.report?.summary?.dpi)
      attempts.push({ dpi: effectiveDpi, status: 'success' })
      writeFileSync(partReportPath, `${JSON.stringify(attempt.report, null, 2)}\n`)
      const imageStat = statSync(output)
      parts.push({
        partNumber: index + 1,
        selector: chunk.selector,
        slides: chunk.slides,
        pairCount: Number(
          attempt.report?.agentGate?.pairCount ?? attempt.report?.summary?.pairCount,
        ),
        dpi: effectiveDpi,
        width: Number(attempt.report?.render?.width),
        height: Number(attempt.report?.render?.height),
        path: output,
        reportPath: partReportPath,
        byteLength: imageStat.size,
        sha256: sha256(output),
        agentGate: attempt.report?.agentGate ?? null,
        attempts,
      })
    }
    const coverage = coverageFor(parts, args.slideCount)
    const passed =
      coverage.missingSlides.length === 0 &&
      coverage.duplicateSlides.length === 0 &&
      coverage.outOfRangeSlides.length === 0 &&
      parts.every(
        (part) =>
          part.pairCount === part.slides.length &&
          (part.agentGate?.passed === true || part.agentGate?.status === 'pass'),
      )
    if (!passed) throw new Error('multipart contact-diff coverage or part gate is incomplete')
    const manifest = {
      schemaVersion: 'pptx-nova-compare-manifest/v1',
      status: 'success',
      kind: args.kind,
      source: { path: args.source, sha256: sha256(args.source) },
      candidate: { path: args.candidate, sha256: sha256(args.candidate) },
      slideCount: args.slideCount,
      chunkSize: args.chunkSize,
      requestedDpi: args.dpi,
      fallbackDpi: args.fallbackDpi,
      parts,
      coverage,
      agentGate: {
        passed,
        status: passed ? 'pass' : 'fail',
        pairCount: parts.reduce((sum, part) => sum + part.pairCount, 0),
        partCount: parts.length,
        requiresHumanReview: true,
      },
    }
    writeFileSync(args.report, `${JSON.stringify(manifest, null, 2)}\n`)
    return manifest
  } catch (error) {
    cleanupMultipart(cleanupPaths)
    throw error
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  ensureInputFile(args.source, 'source PPTX')
  ensureInputFile(args.candidate, 'candidate PPTX')
  ensureWritable(args.report, args.overwrite)
  mkdirSync(args.runDir, { recursive: true })

  const multipart = !args.slides && args.slideCount > args.chunkSize
  if (!multipart) ensureWritable(args.output, args.overwrite)
  const report = multipart ? runMultipartCompare(args) : runSingleCompare(args)
  if (args.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  else {
    const pairCount = report.agentGate?.pairCount ?? report.summary?.pairCount ?? 'unknown'
    const artifact = multipart ? `${report.parts.length} numbered PNGs` : args.output
    process.stdout.write(
      `${args.kind} compare written: ${artifact} (${basename(args.source)} vs ${basename(args.candidate)}, ${pairCount} slide pairs)\n`,
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
