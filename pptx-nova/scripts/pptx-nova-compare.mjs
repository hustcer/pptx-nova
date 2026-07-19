#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { basename, delimiter, dirname, extname, join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { createProgressReporter, progressHeartbeatMs } from './pptx-nova-progress.mjs'
import {
  createPageBitmapCacheBinding,
  pageBitmapCacheMetrics,
  snapshotPageBitmapCache,
} from './lib/page-bitmap-cache.mjs'

const MAX_COMMAND_BUFFER = 20 * 1024 * 1024

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
  --cache-dir <path>        Shared content-addressed render cache. Defaults beside run-dir.
  --no-cache                Disable render cache reads and writes.
  --source-label <text>     Deprecated; xdoc contact-diff owns contact sheet labels.
  --candidate-label <text>  Deprecated; xdoc contact-diff owns contact sheet labels.
  --overwrite               Allow replacing existing output/report files.
  --progress <mode>         Progress stream: auto|jsonl|text|off. Defaults to auto.
  --json                    Print the xdoc contact-diff report to stdout.
  --help                    Show this help.

The helper delegates before/after visual comparison to xdoc pptx contact-diff,
which renders a side-by-side contact sheet and emits a pptx-contact-diff/v1 JSON
report whose source/candidate SHA-256 identities are used by
pptx-nova-compare-gate.mjs. Full-deck compares larger than the chunk size are
emitted as numbered PNGs plus a pptx-nova-compare-manifest/v1.
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
  '--cache-dir': 'cacheDir',
  '--source-label': 'sourceLabel',
  '--candidate-label': 'candidateLabel',
  '--progress': 'progress',
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
    cacheDir: '',
    cache: true,
    sourceLabel: '',
    candidateLabel: '',
    overwrite: false,
    progress: 'auto',
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
    if (arg === '--no-cache') {
      args.cache = false
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
  args.cacheDir = resolve(args.cacheDir || join(dirname(args.runDir), '.render-cache'))
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
  const commandLabel = commandText(command.bin, command.args)
  const reporter = options.reporter
  const started = performance.now()
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command.bin, command.args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let stdoutBytes = 0
    let stderrBytes = 0
    let bufferError = null
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout += chunk
      stdoutBytes += Buffer.byteLength(chunk)
      if (!bufferError && stdoutBytes > MAX_COMMAND_BUFFER) {
        bufferError = new Error(`${commandLabel} exceeded the stdout buffer limit`)
        child.kill('SIGTERM')
      }
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
      stderrBytes += Buffer.byteLength(chunk)
      if (!bufferError && stderrBytes > MAX_COMMAND_BUFFER) {
        bufferError = new Error(`${commandLabel} exceeded the stderr buffer limit`)
        child.kill('SIGTERM')
      }
    })
    const heartbeat = reporter?.enabled
      ? setInterval(() => {
          reporter.emit('command-heartbeat', {
            executable: basename(command.bin),
            argumentCount: command.args.length,
            elapsedMs: Math.round(performance.now() - started),
            ...options.progressDetails,
          })
        }, progressHeartbeatMs())
      : null
    child.once('error', (error) => {
      if (heartbeat) clearInterval(heartbeat)
      reject(new Error(`${commandLabel} failed to start: ${error.message}`))
    })
    child.once('close', (status, signal) => {
      if (heartbeat) clearInterval(heartbeat)
      if (bufferError) {
        reject(bufferError)
        return
      }
      resolvePromise({ status, signal, stdout, stderr, command: commandLabel })
    })
  })
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

function fileIdentity(path) {
  return {
    path,
    byteLength: statSync(path).size,
    sha256: sha256(path),
  }
}

function resolveExecutable(bin) {
  if (bin.includes('/') || bin.includes('\\')) return resolve(bin)
  for (const directory of String(process.env.PATH ?? '').split(delimiter)) {
    if (!directory) continue
    const candidate = join(directory, bin)
    if (existsSync(candidate) && statSync(candidate).isFile()) return resolve(candidate)
  }
  return bin
}

function xdocIdentity(bin) {
  const path = resolveExecutable(bin)
  if (!existsSync(path) || !statSync(path).isFile()) return { path, sha256: null, byteLength: null }
  return fileIdentity(path)
}

function cacheDescriptor(args, { slides, dpi }) {
  const source = fileIdentity(args.source)
  const candidate = fileIdentity(args.candidate)
  const xdoc = xdocIdentity(args.xdocBin)
  const descriptor = {
    schemaVersion: 'pptx-nova-contact-diff-cache-key/v1',
    source,
    candidate,
    slides: slides || 'all',
    dpi,
    xdoc,
  }
  const keyMaterial = {
    ...descriptor,
    source: { byteLength: source.byteLength, sha256: source.sha256 },
    candidate: { byteLength: candidate.byteLength, sha256: candidate.sha256 },
    xdoc: {
      byteLength: xdoc.byteLength,
      sha256: xdoc.sha256,
      fallback: xdoc.sha256 ? null : xdoc.path,
    },
  }
  const key = createHash('sha256').update(JSON.stringify(keyMaterial)).digest('hex')
  return { key, descriptor }
}

function cacheEntryPaths(args, key) {
  const directory = join(args.cacheDir, 'contact-diff-v1', key.slice(0, 2), key)
  return {
    directory,
    image: join(directory, 'contact-diff.png'),
    report: join(directory, 'contact-diff.json'),
    metadata: join(directory, 'metadata.json'),
  }
}

function sameCacheDescriptor(left, right) {
  const projection = (value) => ({
    schemaVersion: value?.schemaVersion ?? null,
    slides: value?.slides ?? null,
    dpi: value?.dpi ?? null,
    source: {
      byteLength: value?.source?.byteLength ?? null,
      sha256: value?.source?.sha256 ?? null,
    },
    candidate: {
      byteLength: value?.candidate?.byteLength ?? null,
      sha256: value?.candidate?.sha256 ?? null,
    },
    xdoc: {
      byteLength: value?.xdoc?.byteLength ?? null,
      sha256: value?.xdoc?.sha256 ?? null,
      fallback: value?.xdoc?.sha256 ? null : (value?.xdoc?.path ?? null),
    },
  })
  return JSON.stringify(projection(left)) === JSON.stringify(projection(right))
}

function writeJsonAtomic(path, value) {
  const temporary = `${path}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`)
  renameSync(temporary, path)
}

function retargetContactDiffReport(report, args, output, descriptor) {
  return {
    ...report,
    source: { ...report.source, ...descriptor.source, path: args.source },
    candidate: { ...report.candidate, ...descriptor.candidate, path: args.candidate },
    outputPath: output,
    output,
    render: report?.render ? { ...report.render, path: output } : report?.render,
    contactSheet: report?.contactSheet
      ? { ...report.contactSheet, path: output }
      : report?.contactSheet,
  }
}

function readCachedContactDiff(args, output, cache) {
  const paths = cacheEntryPaths(args, cache.key)
  if (!existsSync(paths.metadata) || !existsSync(paths.report) || !existsSync(paths.image)) {
    return null
  }
  try {
    const metadata = JSON.parse(readFileSync(paths.metadata, 'utf8'))
    if (
      metadata?.schemaVersion !== 'pptx-nova-contact-diff-cache-entry/v1' ||
      metadata?.key !== cache.key ||
      !sameCacheDescriptor(metadata?.descriptor, cache.descriptor) ||
      metadata?.image?.byteLength !== statSync(paths.image).size ||
      metadata?.image?.sha256 !== sha256(paths.image)
    ) {
      return null
    }
    const cachedReport = JSON.parse(readFileSync(paths.report, 'utf8'))
    if (
      cachedReport?.schemaVersion !== 'pptx-contact-diff/v1' ||
      cachedReport?.status !== 'success' ||
      cachedReport?.scope?.requested !== cache.descriptor.slides ||
      Number(cachedReport?.render?.dpi ?? cachedReport?.summary?.dpi) !== cache.descriptor.dpi ||
      cachedReport?.source?.sha256 !== cache.descriptor.source.sha256 ||
      cachedReport?.candidate?.sha256 !== cache.descriptor.candidate.sha256
    ) {
      return null
    }
    mkdirSync(dirname(output), { recursive: true })
    copyFileSync(paths.image, output)
    const report = retargetContactDiffReport(cachedReport, args, output, cache.descriptor)
    const identities = validateContactDiffInputIdentities(report, args)
    return {
      status: 'success',
      result: { status: 0, stdout: '', stderr: '', command: 'render-cache' },
      report,
      identities,
      cache: {
        status: 'hit',
        key: cache.key,
        directory: paths.directory,
        imageSha256: metadata.image.sha256,
      },
    }
  } catch {
    return null
  }
}

function writeCachedContactDiff(args, output, report, cache) {
  const paths = cacheEntryPaths(args, cache.key)
  mkdirSync(paths.directory, { recursive: true })
  copyFileSync(output, paths.image)
  writeJsonAtomic(paths.report, report)
  const image = fileIdentity(paths.image)
  writeJsonAtomic(paths.metadata, {
    schemaVersion: 'pptx-nova-contact-diff-cache-entry/v1',
    key: cache.key,
    descriptor: cache.descriptor,
    image: { byteLength: image.byteLength, sha256: image.sha256 },
  })
  return {
    status: 'miss',
    key: cache.key,
    directory: paths.directory,
    imageSha256: image.sha256,
  }
}

const SHA256_PATTERN = /^[0-9a-f]{64}$/

function validateContactDiffInputIdentity(identity, expectedPath, label) {
  if (!identity || typeof identity !== 'object') {
    throw new Error(`xdoc contact-diff ${label} identity is missing`)
  }
  const reportedPath = typeof identity.path === 'string' ? resolve(identity.path) : ''
  if (reportedPath !== expectedPath) {
    throw new Error(`xdoc contact-diff ${label} path does not match the requested input`)
  }
  if (!Number.isInteger(identity.byteLength) || identity.byteLength <= 0) {
    throw new Error(`xdoc contact-diff ${label} byteLength is missing or invalid`)
  }
  if (typeof identity.sha256 !== 'string' || !SHA256_PATTERN.test(identity.sha256)) {
    throw new Error(`xdoc contact-diff ${label} SHA-256 is missing or invalid`)
  }
  const state = statSync(expectedPath)
  if (state.size !== identity.byteLength) {
    throw new Error(`xdoc contact-diff ${label} byteLength no longer matches the input file`)
  }
  if (sha256(expectedPath) !== identity.sha256) {
    throw new Error(`xdoc contact-diff ${label} SHA-256 no longer matches the input file`)
  }
  return {
    path: expectedPath,
    byteLength: identity.byteLength,
    sha256: identity.sha256,
  }
}

function validateContactDiffInputIdentities(report, args) {
  return {
    source: validateContactDiffInputIdentity(report.source, args.source, 'source'),
    candidate: validateContactDiffInputIdentity(report.candidate, args.candidate, 'candidate'),
  }
}

function sameInputIdentity(left, right) {
  return (
    left?.path === right?.path &&
    left?.byteLength === right?.byteLength &&
    left?.sha256 === right?.sha256
  )
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

function selectedSlides(selector, slideCount) {
  if (!selector) {
    return slideCount > 0 ? Array.from({ length: slideCount }, (_, index) => index + 1) : []
  }
  const slides = new Set()
  for (const token of selector.split(',')) {
    const match = token.trim().match(/^(\d+)(?:-(\d+))?$/)
    if (!match) continue
    const start = Number(match[1])
    const end = Number(match[2] ?? match[1])
    for (let slide = start; slide <= end; slide += 1) slides.add(slide)
  }
  return [...slides].sort((left, right) => left - right)
}

function pageCacheAttempt(args, { slides, dpi }) {
  if (!args.cache) return null
  const requestedSlides = selectedSlides(slides, args.slideCount)
  const source = createPageBitmapCacheBinding({
    cacheDir: args.cacheDir,
    pptxPath: args.source,
    dpi,
    xdocBin: args.xdocBin,
  })
  const candidate = createPageBitmapCacheBinding({
    cacheDir: args.cacheDir,
    pptxPath: args.candidate,
    dpi,
    xdocBin: args.xdocBin,
  })
  return {
    source,
    candidate,
    requestedSlides,
    sourceBefore: snapshotPageBitmapCache(source, requestedSlides),
    candidateBefore: snapshotPageBitmapCache(candidate, requestedSlides),
  }
}

function finishPageCacheAttempt(attempt) {
  if (!attempt) return null
  const sourceAfter = snapshotPageBitmapCache(attempt.source, attempt.requestedSlides)
  const candidateAfter = snapshotPageBitmapCache(attempt.candidate, attempt.requestedSlides)
  return {
    schemaVersion: 'pptx-nova-page-bitmap-cache-attempt/v1',
    source: pageBitmapCacheMetrics(attempt.source, attempt.sourceBefore, sourceAfter),
    candidate: pageBitmapCacheMetrics(attempt.candidate, attempt.candidateBefore, candidateAfter),
  }
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

async function runContactDiff(
  args,
  {
    output = args.output,
    slides = args.slides,
    dpi = args.dpi,
    reporter,
    partNumber,
    partCount,
  } = {},
) {
  const pageCache = pageCacheAttempt(args, { slides, dpi })
  const cache = args.cache ? cacheDescriptor(args, { slides, dpi }) : null
  if (cache) {
    const hit = readCachedContactDiff(args, output, cache)
    if (hit) return { ...hit, pageCache: finishPageCacheAttempt(pageCache) }
  }
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

  const result = await run(args.xdocBin, commandArgs, {
    reporter,
    progressDetails: { partNumber, partCount, slides, dpi },
    env: pageCache
      ? {
          ...process.env,
          XDOC_SOURCE_PAGE_CACHE_PREFIX: pageCache.source.prefix,
          XDOC_CANDIDATE_PAGE_CACHE_PREFIX: pageCache.candidate.prefix,
        }
      : process.env,
  })
  const report = parseJsonReportSafe(result.stdout)
  if (result.status !== 0 || report?.status === 'error') {
    return {
      status: 'failed',
      result,
      report,
      error: failureDetails(report, result),
      pageCache: finishPageCacheAttempt(pageCache),
    }
  }
  if (!report) parseJsonReport(result.stdout)
  const outputPath = reportImagePath(report)
  if (outputPath && resolve(outputPath) !== output) {
    throw new Error(`xdoc contact-diff reported a different output path: ${outputPath}`)
  }
  if (!existsSync(output) || statSync(output).size <= 0) {
    throw new Error(`xdoc contact-diff did not create a non-empty output PNG: ${output}`)
  }
  const identities = validateContactDiffInputIdentities(report, args)
  const cacheState = cache
    ? writeCachedContactDiff(args, output, report, cache)
    : { status: 'disabled', key: null, directory: null, imageSha256: sha256(output) }
  return {
    status: 'success',
    result,
    report,
    identities,
    cache: cacheState,
    pageCache: finishPageCacheAttempt(pageCache),
  }
}

async function runSingleCompare(args, reporter) {
  const attempts = []
  reporter.emit('compare-part-start', {
    partNumber: 1,
    partCount: 1,
    slides: args.slides || (args.slideCount > 0 ? `1-${args.slideCount}` : 'all'),
    dpi: args.dpi,
  })
  let attempt = await runContactDiff(args, { reporter, partNumber: 1, partCount: 1 })
  if (attempt.status === 'failed') {
    attempts.push({
      dpi: args.dpi,
      status: 'failed',
      error: attempt.error,
      pageBitmapCache: attempt.pageCache,
    })
    rmSync(args.output, { force: true })
    if (!args.slides && args.slideCount > 0 && isRetryableRenderError(attempt.error)) {
      reporter.emit('compare-part-retry', {
        partNumber: 1,
        partCount: 1,
        dpi: args.fallbackDpi,
        reason: attempt.error.reason ?? attempt.error.kind,
      })
      attempt = await runContactDiff(args, {
        dpi: args.fallbackDpi,
        reporter,
        partNumber: 1,
        partCount: 1,
      })
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
  attempts.push({
    dpi: effectiveDpi,
    status: attempt.cache?.status === 'hit' ? 'cache-hit' : 'success',
    pageBitmapCache: attempt.pageCache,
  })
  const report = {
    ...attempt.report,
    pptxNovaCompare: {
      mode: 'single',
      requestedDpi: args.dpi,
      fallbackDpi: args.fallbackDpi,
      attempts,
      cache: attempt.cache,
      pageBitmapCache: attempt.pageCache,
      pageBitmapCacheAttempts: attempts.map(({ dpi, status, pageBitmapCache }) => ({
        dpi,
        status,
        pageBitmapCache: pageBitmapCache ?? null,
      })),
    },
  }
  writeFileSync(args.report, `${JSON.stringify(report, null, 2)}\n`)
  reporter.emit('compare-part-complete', {
    partNumber: 1,
    partCount: 1,
    pairCount: Number(report?.agentGate?.pairCount ?? report?.summary?.pairCount),
    dpi: effectiveDpi,
    output: args.output,
  })
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

async function runMultipartCompare(args, reporter) {
  const chunks = slideChunks(args.slideCount, args.chunkSize)
  const numberWidth = Math.max(2, String(chunks.length).length)
  const cleanupPaths = [args.report]
  const parts = []
  let sourceIdentity = null
  let candidateIdentity = null
  try {
    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index]
      const output = numberedPath(args.output, index + 1, numberWidth)
      const partReportPath = numberedPath(args.report, index + 1, numberWidth)
      cleanupPaths.push(output, partReportPath)
      const attempts = []
      let attemptedDpi = args.dpi
      reporter.emit('compare-part-start', {
        partNumber: index + 1,
        partCount: chunks.length,
        slides: chunk.selector,
        dpi: args.dpi,
      })
      let attempt = await runContactDiff(args, {
        output,
        slides: chunk.selector,
        dpi: args.dpi,
        reporter,
        partNumber: index + 1,
        partCount: chunks.length,
      })
      if (attempt.status === 'failed') {
        attempts.push({
          dpi: args.dpi,
          status: 'failed',
          error: attempt.error,
          pageBitmapCache: attempt.pageCache,
        })
        rmSync(output, { force: true })
        if (isRetryableRenderError(attempt.error)) {
          attemptedDpi = args.fallbackDpi
          reporter.emit('compare-part-retry', {
            partNumber: index + 1,
            partCount: chunks.length,
            slides: chunk.selector,
            dpi: args.fallbackDpi,
            reason: attempt.error.reason ?? attempt.error.kind,
          })
          attempt = await runContactDiff(args, {
            output,
            slides: chunk.selector,
            dpi: args.fallbackDpi,
            reporter,
            partNumber: index + 1,
            partCount: chunks.length,
          })
        }
      }
      if (attempt.status === 'failed') {
        if (attempts.length === 0 || attempts.at(-1)?.dpi !== attemptedDpi) {
          attempts.push({
            dpi: attemptedDpi,
            status: 'failed',
            error: attempt.error,
            pageBitmapCache: attempt.pageCache,
          })
        }
        throw new Error(
          `contact-diff part ${index + 1}/${chunks.length} (${chunk.selector}) failed: ${attempt.error.message}`,
        )
      }
      const effectiveDpi = Number(attempt.report?.render?.dpi ?? attempt.report?.summary?.dpi)
      if (!sourceIdentity) {
        sourceIdentity = attempt.identities.source
        candidateIdentity = attempt.identities.candidate
      } else if (
        !sameInputIdentity(sourceIdentity, attempt.identities.source) ||
        !sameInputIdentity(candidateIdentity, attempt.identities.candidate)
      ) {
        throw new Error('multipart contact-diff parts were rendered from different PPTX bytes')
      }
      attempts.push({
        dpi: effectiveDpi,
        status: attempt.cache?.status === 'hit' ? 'cache-hit' : 'success',
        pageBitmapCache: attempt.pageCache,
      })
      const partReport = {
        ...attempt.report,
        pptxNovaCompare: {
          mode: 'multipart-part',
          requestedDpi: args.dpi,
          fallbackDpi: args.fallbackDpi,
          attempts,
          cache: attempt.cache,
          pageBitmapCache: attempt.pageCache,
          pageBitmapCacheAttempts: attempts.map(({ dpi, status, pageBitmapCache }) => ({
            dpi,
            status,
            pageBitmapCache: pageBitmapCache ?? null,
          })),
        },
      }
      writeFileSync(partReportPath, `${JSON.stringify(partReport, null, 2)}\n`)
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
        cache: attempt.cache,
        pageBitmapCache: attempt.pageCache,
        pageBitmapCacheAttempts: attempts.map(({ dpi, status, pageBitmapCache }) => ({
          dpi,
          status,
          pageBitmapCache: pageBitmapCache ?? null,
        })),
      })
      reporter.emit('compare-part-complete', {
        partNumber: index + 1,
        partCount: chunks.length,
        slides: chunk.selector,
        pairCount: parts.at(-1).pairCount,
        dpi: effectiveDpi,
        output,
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
      source: sourceIdentity,
      candidate: candidateIdentity,
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

async function main(args, reporter) {
  ensureInputFile(args.source, 'source PPTX')
  ensureInputFile(args.candidate, 'candidate PPTX')
  ensureWritable(args.report, args.overwrite)
  mkdirSync(args.runDir, { recursive: true })

  const multipart = !args.slides && args.slideCount > args.chunkSize
  if (!multipart) ensureWritable(args.output, args.overwrite)
  reporter.emit('compare-start', {
    source: args.source,
    candidate: args.candidate,
    slideCount: args.slideCount || null,
    chunkSize: args.chunkSize,
    dpi: args.dpi,
    cache: args.cache ? args.cacheDir : null,
  })
  const report = multipart
    ? await runMultipartCompare(args, reporter)
    : await runSingleCompare(args, reporter)
  reporter.emit('compare-complete', {
    partCount: multipart ? report.parts.length : 1,
    pairCount: report.agentGate?.pairCount ?? report.summary?.pairCount ?? null,
    report: args.report,
  })
  if (args.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  else {
    const pairCount = report.agentGate?.pairCount ?? report.summary?.pairCount ?? 'unknown'
    const artifact = multipart ? `${report.parts.length} numbered PNGs` : args.output
    process.stdout.write(
      `${args.kind} compare written: ${artifact} (${basename(args.source)} vs ${basename(args.candidate)}, ${pairCount} slide pairs)\n`,
    )
  }
}

let parsedArgs = null
let reporter = createProgressReporter({ mode: 'off' })
try {
  parsedArgs = parseArgs(process.argv.slice(2))
  reporter = createProgressReporter({
    mode: parsedArgs.progress,
    jsonOutput: parsedArgs.json,
    context: { tool: 'pptx-nova-compare', kind: parsedArgs.kind },
  })
  await main(parsedArgs, reporter)
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  const errorReport = {
    schemaVersion: 'pptx-nova-compare-error/v1',
    status: 'error',
    kind: error?.kind ?? error?.name ?? 'Error',
    message,
  }
  reporter.emit('compare-failed', { kind: errorReport.kind, message })
  if (parsedArgs?.json || process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(errorReport, null, 2)}\n`)
  } else if (!reporter.enabled) {
    process.stderr.write(`${message}\n`)
  }
  process.exitCode = 1
}
