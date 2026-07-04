#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { buildRefurbishPlan } from './pptx-nova-refurbish-plan.mjs'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const SKILL_ROOT = resolve(SCRIPT_DIR, '..')
const CATALOG_PATH = join(SKILL_ROOT, 'assets/deckkits/catalog.json')
const READINESS_SCRIPT = join(SCRIPT_DIR, 'pptx-nova-deckkit-readiness.mjs')
const FALLBACK_PATCH_SCRIPT = join(SCRIPT_DIR, 'pptx-nova-refurbish-fallback-patch.mjs')
const CHECK_LOCK_SCRIPT = join(SCRIPT_DIR, 'pptx-nova-check-lock.mjs')
const CAPABILITY_PROBE_SCRIPT = join(SCRIPT_DIR, 'pptx-nova-probe.mjs')
const FIDELITY_GATE_SCRIPT = join(SCRIPT_DIR, 'pptx-nova-fidelity-gate.mjs')
const LAYOUT_SNAPSHOT_SCRIPT = join(SCRIPT_DIR, 'pptx-nova-layout-snapshot.mjs')

const usage = `Usage:
  node <skill-root>/scripts/pptx-nova-refurbish-run.mjs --deckkit <id> --source <source.pptx> --output <output.pptx> [options]

Options:
  --deckkit <id>          Target DeckKit id
  --source <path>         Read-only source PPTX
  --output <path>         Final PPTX published only after machine gates pass
  --run-dir <path>        New, empty, or pre-probed run directory. Defaults to <cwd>/.pptx-nova/refurbish-<deckkit>-<timestamp>
  --catalog <path>        DeckKit catalog. Defaults to <skill-root>/assets/deckkits/catalog.json
  --route <route>         auto|native|fallback. Defaults to auto
  --xdoc-bin <path>       xdoc executable. Defaults to xdoc
  --readiness-out <path>  Optional benchmark output for a full delivery readiness audit
  --explicit              User explicitly named a non-production/default DeckKit
  --contact-diff          Generate source/candidate contact-diff artifacts for manual review
  --overwrite             Allow replacing an existing final output after all machine gates pass
  --json                  Print machine-readable run summary
  --help                  Show this help

The runner never marks manual PNG/contact review complete. A successful run exits 0 with
status "needs-human-review", publishes the machine-validated candidate, and records all
artifacts in the run directory.
`

class PhaseFailure extends Error {
  constructor(phase, message, details = {}) {
    super(message)
    this.name = 'PhaseFailure'
    this.phase = phase
    Object.assign(this, details)
  }
}

function parseArgs(argv) {
  const args = {
    deckkit: '',
    source: '',
    output: '',
    runDir: '',
    catalog: CATALOG_PATH,
    route: 'auto',
    xdocBin: 'xdoc',
    readinessOut: '',
    explicit: false,
    contactDiff: false,
    overwrite: false,
    json: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(usage)
      process.exit(0)
    } else if (arg === '--explicit') {
      args.explicit = true
    } else if (arg === '--contact-diff') {
      args.contactDiff = true
    } else if (arg === '--overwrite') {
      args.overwrite = true
    } else if (arg === '--json') {
      args.json = true
    } else if (arg in valueFlags) {
      args[valueFlags[arg]] = valueAfter(argv, i, arg)
      i += 1
    } else {
      throw new Error(`Unknown option: ${arg}\n\n${usage}`)
    }
  }

  if (!args.deckkit) throw new Error(`--deckkit is required.\n\n${usage}`)
  if (!args.source) throw new Error(`--source is required.\n\n${usage}`)
  if (!args.output) throw new Error(`--output is required.\n\n${usage}`)
  if (!['auto', 'native', 'fallback'].includes(args.route)) {
    throw new Error('--route must be one of auto|native|fallback')
  }
  return args
}

const valueFlags = {
  '--deckkit': 'deckkit',
  '--source': 'source',
  '--output': 'output',
  '--run-dir': 'runDir',
  '--catalog': 'catalog',
  '--route': 'route',
  '--xdoc-bin': 'xdocBin',
  '--readiness-out': 'readinessOut',
}

function valueAfter(argv, index, flag) {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

function timestamp(now = new Date()) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

function safeSlug(value) {
  return (
    String(value)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'deck'
  )
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function relativeArtifact(runDir, path) {
  return path ? relative(runDir, path) || '.' : null
}

function durationMs(start) {
  return Number((performance.now() - start).toFixed(2))
}

function commandText(bin, args) {
  return [bin, ...args]
    .map((value) => (/[\s"']/.test(value) ? JSON.stringify(value) : value))
    .join(' ')
}

function saveStream(runDir, phase, kind, value) {
  if (!value?.trim()) return null
  const path = join(runDir, `${phase}.${kind}.txt`)
  writeFileSync(path, value)
  return path
}

function runJsonPhase(summary, options) {
  const { name, bin, args, artifact, cwd = summary.runDir } = options
  const start = performance.now()
  const result = spawnSync(bin, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  })
  if (result.error) {
    summary.phases.push({
      name,
      status: 'failed',
      exitCode: null,
      signal: null,
      durationMs: durationMs(start),
      command: commandText(bin, args),
      artifact: relativeArtifact(summary.runDir, artifact),
      stderr: null,
      spawnError: result.error.message,
    })
    throw new PhaseFailure(name, `${name} could not start: ${result.error.message}`, {
      kind: result.error.code ?? 'SpawnError',
    })
  }
  const stderrPath = saveStream(summary.runDir, name, 'stderr', result.stderr ?? '')
  let report = null
  let parseError = null
  try {
    report = JSON.parse(result.stdout || '')
    if (artifact) writeJson(artifact, report)
  } catch (error) {
    parseError = error
    saveStream(summary.runDir, name, 'stdout', result.stdout ?? '')
  }

  const phase = {
    name,
    status: result.status === 0 && !parseError ? 'passed' : 'failed',
    exitCode: result.status,
    signal: result.signal ?? null,
    durationMs: durationMs(start),
    command: commandText(bin, args),
    artifact: relativeArtifact(summary.runDir, artifact),
    stderr: relativeArtifact(summary.runDir, stderrPath),
  }
  summary.phases.push(phase)

  if (parseError) {
    throw new PhaseFailure(name, `${name} did not emit valid JSON: ${parseError.message}`, {
      exitCode: result.status,
      report,
    })
  }
  if (result.status !== 0) {
    const kind = report?.error?.kind ?? report?.error?.code ?? ''
    throw new PhaseFailure(
      name,
      `${name} failed with exit code ${result.status}${kind ? ` (${kind})` : ''}`,
      { exitCode: result.status, kind, report },
    )
  }
  return report
}

function runPlainPhase(summary, options) {
  const { name, bin, args, cwd = summary.runDir } = options
  const start = performance.now()
  const result = spawnSync(bin, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  })
  if (result.error) {
    summary.phases.push({
      name,
      status: 'failed',
      exitCode: null,
      signal: null,
      durationMs: durationMs(start),
      command: commandText(bin, args),
      artifact: null,
      stdout: null,
      stderr: null,
      spawnError: result.error.message,
    })
    throw new PhaseFailure(name, `${name} could not start: ${result.error.message}`, {
      kind: result.error.code ?? 'SpawnError',
    })
  }
  const stdoutPath = saveStream(summary.runDir, name, 'stdout', result.stdout ?? '')
  const stderrPath = saveStream(summary.runDir, name, 'stderr', result.stderr ?? '')
  summary.phases.push({
    name,
    status: result.status === 0 ? 'passed' : 'failed',
    exitCode: result.status,
    signal: result.signal ?? null,
    durationMs: durationMs(start),
    command: commandText(bin, args),
    artifact: null,
    stdout: relativeArtifact(summary.runDir, stdoutPath),
    stderr: relativeArtifact(summary.runDir, stderrPath),
  })
  if (result.status !== 0) {
    throw new PhaseFailure(name, `${name} failed with exit code ${result.status}`, {
      exitCode: result.status,
    })
  }
}

function addInternalPhase(summary, name, status, details = {}) {
  summary.phases.push({
    name,
    status,
    exitCode: null,
    signal: null,
    durationMs: 0,
    command: null,
    artifact: details.artifact ?? null,
    details,
  })
}

function requireGate(summary, name, passed, details = {}) {
  const { message, ...publicDetails } = details
  const gate = {
    name,
    passed: Boolean(passed),
    ...publicDetails,
    ...(message ? { policy: message } : {}),
  }
  summary.gates.push(gate)
  if (!gate.passed) {
    throw new PhaseFailure(name, message ?? `${name} gate failed`, { report: details })
  }
  return gate
}

function visionCounts(report, classification) {
  const counts = report?.summary?.byClass?.[classification] ?? {}
  return {
    high: Number(counts.high ?? 0),
    medium: Number(counts.medium ?? 0),
    low: Number(counts.low ?? 0),
  }
}

function gateVisionDiff(summary, report) {
  const schemaValid = report?.schemaVersion === 'pptx-vision-diff/v1'
  const statusValid = report?.status === 'success'
  const fresh = visionCounts(report, 'new')
  const changed = visionCounts(report, 'changed')
  return requireGate(
    summary,
    'vision-diff',
    schemaValid && statusValid && fresh.high === 0 && fresh.medium === 0 && changed.high === 0,
    {
      schemaVersion: report?.schemaVersion ?? '',
      status: report?.status ?? '',
      new: fresh,
      changed,
      message:
        'vision-diff requires valid v1 output, no new high/medium issues, and no changed issue ending at high severity',
    },
  )
}

function gateAudit(summary, report) {
  return requireGate(
    summary,
    'refurbish-audit',
    report?.schemaVersion === 'pptx-refurbish-audit/v1' &&
      report?.status === 'passed' &&
      Number(report?.summary?.errorCount ?? 0) === 0,
    {
      schemaVersion: report?.schemaVersion ?? '',
      status: report?.status ?? '',
      errorCount: Number(report?.summary?.errorCount ?? 0),
      warningCount: Number(report?.summary?.warningCount ?? 0),
      message: 'refurbish-audit must pass with zero errors',
    },
  )
}

function gateSemanticDiff(summary, report) {
  return requireGate(
    summary,
    'pptx-semantic-diff',
    report?.schemaVersion === 'pptx-diff/v1' && report?.status === 'success',
    {
      schemaVersion: report?.schemaVersion ?? '',
      status: report?.status ?? '',
      semanticStatus: report?.agentGate?.semanticStatus ?? null,
      reliableChanges: Number(report?.summary?.reliableChanges ?? 0),
      uncertainChanges: Number(report?.summary?.uncertainChanges ?? 0),
      unsupportedRegions: Number(report?.summary?.unsupportedRegions ?? 0),
      message: 'pptx semantic diff must emit successful pptx-diff/v1 output',
    },
  )
}

function defaultRunDir(args, cwd) {
  const sourceStem = basename(args.source, extname(args.source))
  const slug = safeSlug(`${sourceStem}-${args.deckkit}`)
  return join(cwd, '.pptx-nova', `refurbish-${slug}-${timestamp()}`)
}

function normalizeArgs(args) {
  const cwd = process.cwd()
  const normalized = {
    ...args,
    source: resolve(cwd, args.source),
    output: resolve(cwd, args.output),
    catalog: resolve(cwd, args.catalog),
    readinessOut: args.readinessOut ? resolve(cwd, args.readinessOut) : '',
  }
  normalized.runDir = args.runDir ? resolve(cwd, args.runDir) : defaultRunDir(normalized, cwd)
  return normalized
}

function validatePaths(args) {
  if (!existsSync(args.source) || !statSync(args.source).isFile()) {
    throw new Error(`source PPTX does not exist or is not a file: ${args.source}`)
  }
  if (extname(args.source).toLowerCase() !== '.pptx') {
    throw new Error(`--source must be a .pptx file: ${args.source}`)
  }
  if (extname(args.output).toLowerCase() !== '.pptx') {
    throw new Error(`--output must be a .pptx file: ${args.output}`)
  }
  if (!existsSync(args.catalog) || !statSync(args.catalog).isFile()) {
    throw new Error(`DeckKit catalog does not exist: ${args.catalog}`)
  }
  if (!existsSync(dirname(args.output))) {
    throw new Error(`final output directory does not exist: ${dirname(args.output)}`)
  }
  if (existsSync(args.runDir)) {
    if (!statSync(args.runDir).isDirectory()) {
      throw new Error(`run directory path already exists and is not a directory: ${args.runDir}`)
    }
    const entries = readdirSync(args.runDir)
    const allowedEntries = new Set(['xdoc-capabilities.json'])
    const unexpectedEntries = entries.filter((name) => !allowedEntries.has(name))
    if (unexpectedEntries.length > 0) {
      throw new Error(
        `run directory already exists and is not empty/pre-probed: ${args.runDir}; unexpected entries: ${unexpectedEntries.join(', ')}`,
      )
    }
    const capabilityPath = join(args.runDir, 'xdoc-capabilities.json')
    if (existsSync(capabilityPath) && !statSync(capabilityPath).isFile()) {
      throw new Error(`pre-probed capability artifact is not a file: ${capabilityPath}`)
    }
  }
  if (existsSync(args.output) && !args.overwrite) {
    throw new Error(
      `final output already exists; pass --overwrite only when replacement is intended: ${args.output}`,
    )
  }
  if (args.source === args.output && !args.overwrite) {
    throw new Error(
      'in-place refurbishment requires --overwrite and still validates through the run directory',
    )
  }
}

function artifactPaths(runDir) {
  return {
    capabilities: join(runDir, 'xdoc-capabilities.json'),
    plan: join(runDir, 'refurbish-plan.json'),
    readiness: join(runDir, 'readiness.json'),
    inspect: join(runDir, 'reference-inspect.json'),
    nativeReport: join(runDir, 'refurbish-skin.json'),
    chromeDetect: join(runDir, 'chrome-detect.json'),
    fallbackReport: join(runDir, 'fallback-patch-report.json'),
    patch: join(runDir, 'patch.json'),
    deckLock: join(runDir, 'deck_lock.json'),
    contentAuditBaseline: join(runDir, 'content-audit.json'),
    referenceMap: join(runDir, 'reference-map.json'),
    lockCheck: join(runDir, 'check-lock.json'),
    dryRun: join(runDir, 'dry-run.json'),
    apply: join(runDir, 'apply.json'),
    visionDiff: join(runDir, 'vision-diff.json'),
    contentAuditFinal: join(runDir, 'content-audit-final.json'),
    fidelityGate: join(runDir, 'fidelity-gate.json'),
    pptxDiff: join(runDir, 'pptx-diff.json'),
    finalInspect: join(runDir, 'candidate-inspect.json'),
    layoutFinal: join(runDir, 'layout-final.json'),
    candidate: join(runDir, 'candidate.pptx'),
    previews: join(runDir, 'previews'),
    previewReport: join(runDir, 'preview.json'),
    convertReport: join(runDir, 'convert-report.json'),
    contactSheet: join(runDir, 'previews', 'contact-sheet.png'),
    contactDiff: join(runDir, 'contact-diff.png'),
    contactDiffReport: join(runDir, 'contact-diff.json'),
    summary: join(runDir, 'refurbish-run-summary.json'),
  }
}

function initialSummary(args, artifacts) {
  return {
    schemaVersion: 'pptx-nova-refurbish-run/v1',
    status: 'running',
    machineGatesPassed: false,
    deliveryReady: false,
    needsHumanReview: true,
    deckkit: args.deckkit,
    source: args.source,
    output: args.output,
    runDir: args.runDir,
    route: {
      requested: args.route,
      planned: '',
      executed: '',
      fallbackReason: '',
    },
    artifacts: Object.fromEntries(Object.entries(artifacts).map(([key, path]) => [key, path])),
    phases: [],
    gates: [],
    review: {
      required: true,
      completed: false,
      contactDiffRequested: args.contactDiff,
      instructions:
        'Review contact-sheet.png and suspicious full-size PNGs. Confirm the target DeckKit is visibly applied and source content remains intact.',
    },
    warnings: [],
    error: null,
  }
}

function finalizeArtifactPaths(summary, summaryPath) {
  summary.artifacts = Object.fromEntries(
    Object.entries(summary.artifacts).map(([key, path]) => [
      key,
      key === 'summary' || existsSync(path) ? path : null,
    ]),
  )
  summary.artifacts.summary = summaryPath
}

function runCatalogGate(summary, plan, args) {
  const standardReadiness = ['production', 'default'].includes(plan.readiness)
  const explicitException = ['experimental', 'candidate'].includes(plan.readiness) && args.explicit
  const benchmarkPassed = plan.catalog?.benchmarkPassed
  requireGate(summary, 'catalog-readiness', standardReadiness || explicitException, {
    readiness: plan.readiness,
    explicit: args.explicit,
    message:
      'DeckKit must be production/default or explicitly selected when candidate/experimental',
  })
  requireGate(summary, 'catalog-benchmark-summary', benchmarkPassed !== false, {
    available: benchmarkPassed !== null,
    passed: benchmarkPassed,
    message: 'Catalog benchmark summary explicitly reports failure',
  })
  if (benchmarkPassed === null) {
    summary.warnings.push(
      'Catalog does not include a quality benchmark summary; catalog readiness was used without a live benchmark audit.',
    )
  }
}

function runOptionalReadiness(summary, args, artifacts) {
  if (!args.readinessOut) return
  const readinessArgs = [
    READINESS_SCRIPT,
    '--deckkit',
    args.deckkit,
    '--target',
    'delivery',
    '--catalog',
    args.catalog,
    '--out',
    args.readinessOut,
    '--json',
  ]
  if (args.explicit) readinessArgs.push('--explicit')
  const report = runJsonPhase(summary, {
    name: 'delivery-readiness',
    bin: process.execPath,
    args: readinessArgs,
    artifact: artifacts.readiness,
  })
  requireGate(summary, 'delivery-readiness', report?.passed === true, {
    readiness: report?.catalog?.readiness ?? '',
    message: 'Full delivery readiness audit did not pass',
  })
}

function runInspect(summary, args, artifacts) {
  const report = runJsonPhase(summary, {
    name: 'source-inspect',
    bin: args.xdocBin,
    args: ['pptx', 'inspect', args.source, '--json'],
    artifact: artifacts.inspect,
  })
  requireGate(
    summary,
    'source-inspect',
    report?.schemaVersion === 'pptx-inspect/v1' && expectedSlideCount(report) > 0,
    {
      schemaVersion: report?.schemaVersion ?? '',
      slideCount: expectedSlideCount(report),
      message: 'source inspect must be pptx-inspect/v1 with at least one slide',
    },
  )
  return report
}

function validateNativeReport(summary, report, artifacts) {
  requireGate(
    summary,
    'refurbish-skin-report',
    report?.schemaVersion === 'pptx-refurbish-skin/v1' &&
      report?.status === 'passed' &&
      report?.gate?.passed === true &&
      Number(report?.gate?.newHighIssues ?? 0) === 0 &&
      Number(report?.gate?.newMediumIssues ?? 0) === 0,
    {
      schemaVersion: report?.schemaVersion ?? '',
      status: report?.status ?? '',
      gate: report?.gate ?? null,
      message: 'refurbish-skin report must pass with no new high/medium issues',
    },
  )
  if (!report?.reports?.visionDiff || !report?.reports?.audit) {
    throw new PhaseFailure(
      'refurbish-skin-report',
      'refurbish-skin report is missing embedded visionDiff or audit evidence',
    )
  }
  writeJson(artifacts.visionDiff, report.reports.visionDiff)
  writeJson(artifacts.contentAuditFinal, report.reports.audit)
  gateVisionDiff(summary, report.reports.visionDiff)
  gateAudit(summary, report.reports.audit)
}

function runNative(summary, args, artifacts) {
  const report = runJsonPhase(summary, {
    name: 'native-refurbish-skin',
    bin: args.xdocBin,
    args: [
      'pptx',
      'refurbish-skin',
      '--source',
      args.source,
      '--deckkit',
      args.deckkit,
      '--output',
      artifacts.candidate,
      '--json',
    ],
    artifact: artifacts.nativeReport,
  })
  validateNativeReport(summary, report, artifacts)
}

function runFallback(summary, args, artifacts) {
  rmSync(artifacts.candidate, { force: true })
  const chromeDetect = runJsonPhase(summary, {
    name: 'chrome-detect',
    bin: args.xdocBin,
    args: ['pptx', 'chrome-detect', args.source, '--json'],
    artifact: artifacts.chromeDetect,
  })
  requireGate(
    summary,
    'chrome-detect',
    chromeDetect?.schemaVersion === 'pptx-chrome-detect/v1' && chromeDetect?.status !== 'failed',
    {
      schemaVersion: chromeDetect?.schemaVersion ?? '',
      status: chromeDetect?.status ?? '',
      message: 'chrome-detect must emit a successful pptx-chrome-detect/v1 report',
    },
  )

  const fallbackReport = runJsonPhase(summary, {
    name: 'fallback-patch',
    bin: process.execPath,
    args: [
      FALLBACK_PATCH_SCRIPT,
      '--deckkit',
      args.deckkit,
      '--source',
      args.source,
      '--inspect',
      artifacts.inspect,
      '--chrome-detect',
      artifacts.chromeDetect,
      '--output',
      artifacts.candidate,
      '--catalog',
      args.catalog,
      '--patch',
      artifacts.patch,
      '--lock',
      artifacts.deckLock,
      '--audit',
      artifacts.contentAuditBaseline,
      '--map',
      artifacts.referenceMap,
      '--json',
    ],
    artifact: artifacts.fallbackReport,
  })
  requireGate(
    summary,
    'fallback-patch-report',
    fallbackReport?.schemaVersion === 'pptx-nova-refurbish-fallback-patch-report/v1' &&
      fallbackReport?.status === 'success' &&
      Number(fallbackReport?.summary?.slideCount ?? 0) > 0 &&
      Number(fallbackReport?.summary?.ops ?? 0) > 0,
    {
      slideCount: Number(fallbackReport?.summary?.slideCount ?? 0),
      ops: Number(fallbackReport?.summary?.ops ?? 0),
      message: 'Fallback patch report must contain at least one slide and one patch op',
    },
  )
  for (const warning of fallbackReport?.summary?.warnings ?? []) {
    summary.warnings.push(`fallback-patch: ${warning}`)
  }

  const lockCheck = runJsonPhase(summary, {
    name: 'check-lock',
    bin: process.execPath,
    args: [CHECK_LOCK_SCRIPT, '--lock', artifacts.deckLock, '--patch', artifacts.patch, '--json'],
    artifact: artifacts.lockCheck,
  })
  requireGate(summary, 'check-lock', lockCheck?.valid === true, {
    errors: Number(lockCheck?.summary?.errors ?? 0),
    warnings: Number(lockCheck?.summary?.warnings ?? 0),
    message: 'Generated fallback deck_lock and patch did not pass check-lock',
  })
  for (const warning of lockCheck?.warnings ?? []) {
    summary.warnings.push(`check-lock ${warning.code ?? 'warning'}: ${warning.message ?? warning}`)
  }

  const dryRun = runJsonPhase(summary, {
    name: 'dry-run',
    bin: args.xdocBin,
    args: [
      'pptx',
      'apply',
      '-p',
      artifacts.patch,
      '-i',
      args.source,
      '-o',
      artifacts.candidate,
      '--dry-run',
      '--json',
    ],
    artifact: artifacts.dryRun,
  })
  requireGate(
    summary,
    'dry-run',
    dryRun?.schemaVersion === 'pptx-dry-run/v1' && dryRun?.status === 'success',
    {
      schemaVersion: dryRun?.schemaVersion ?? '',
      status: dryRun?.status ?? '',
      message: 'xdoc dry-run reported failure',
    },
  )

  const apply = runJsonPhase(summary, {
    name: 'apply',
    bin: args.xdocBin,
    args: [
      'pptx',
      'apply',
      '-p',
      artifacts.patch,
      '-i',
      args.source,
      '-o',
      artifacts.candidate,
      '--overwrite',
      '--json',
    ],
    artifact: artifacts.apply,
  })
  requireGate(
    summary,
    'apply',
    apply?.schemaVersion === 'pptx-apply/v1' &&
      apply?.status === 'success' &&
      existsSync(artifacts.candidate),
    {
      schemaVersion: apply?.schemaVersion ?? '',
      status: apply?.status ?? '',
      outputExists: existsSync(artifacts.candidate),
      message: 'xdoc apply did not produce a successful pptx-apply/v1 candidate',
    },
  )

  const visionDiff = runJsonPhase(summary, {
    name: 'vision-diff-command',
    bin: args.xdocBin,
    args: [
      'pptx',
      'vision-diff',
      '--source',
      args.source,
      '--candidate',
      artifacts.candidate,
      '--json',
    ],
    artifact: artifacts.visionDiff,
  })
  gateVisionDiff(summary, visionDiff)

  const audit = runJsonPhase(summary, {
    name: 'refurbish-audit-command',
    bin: args.xdocBin,
    args: [
      'pptx',
      'refurbish-audit',
      '--source',
      args.source,
      '--final',
      artifacts.candidate,
      '--map',
      artifacts.referenceMap,
      '--json',
    ],
    artifact: artifacts.contentAuditFinal,
  })
  gateAudit(summary, audit)
}

function runFidelityGate(summary, artifacts) {
  const gateArgs = [
    FIDELITY_GATE_SCRIPT,
    '--mode',
    'refurbish',
    '--source-inspect',
    artifacts.inspect,
    '--final-audit',
    artifacts.contentAuditFinal,
    '--vision-diff',
    artifacts.visionDiff,
  ]
  if (existsSync(artifacts.referenceMap)) {
    gateArgs.push('--reference-map', artifacts.referenceMap)
  }
  if (existsSync(artifacts.contentAuditBaseline)) {
    gateArgs.push('--content-audit', artifacts.contentAuditBaseline)
  }
  gateArgs.push('--json')

  const report = runJsonPhase(summary, {
    name: 'fidelity-gate',
    bin: process.execPath,
    args: gateArgs,
    artifact: artifacts.fidelityGate,
  })
  requireGate(summary, 'fidelity-gate', report?.status !== 'fail', {
    status: report?.status ?? '',
    errors: Number(report?.summary?.errors ?? 0),
    warnings: Number(report?.summary?.warnings ?? 0),
    sourceSlides: report?.summary?.sourceSlides ?? null,
    finalSlides: report?.summary?.finalSlides ?? null,
    mappedSlides: report?.summary?.mappedSlides ?? null,
    message:
      'fidelity-gate must pass or warn using final audit, vision diff, and available reference-map evidence',
  })
  for (const warning of report?.warnings ?? []) {
    summary.warnings.push(`fidelity-gate ${warning.code ?? 'warning'}: ${warning.message ?? ''}`)
  }
}

function runLayoutSnapshot(summary, args, artifacts) {
  runJsonPhase(summary, {
    name: 'final-inspect',
    bin: args.xdocBin,
    args: ['pptx', 'inspect', artifacts.candidate, '--json'],
    artifact: artifacts.finalInspect,
  })
  const snapshot = runJsonPhase(summary, {
    name: 'layout-snapshot',
    bin: process.execPath,
    args: [
      LAYOUT_SNAPSHOT_SCRIPT,
      '--inspect',
      artifacts.finalInspect,
      '--output',
      artifacts.layoutFinal,
      '--json',
    ],
    artifact: artifacts.layoutFinal,
  })
  const riskCount = Number(snapshot?.summary?.riskCount ?? 0)
  if (riskCount > 0) {
    summary.warnings.push(
      `layout-snapshot: ${riskCount} structural layout risk(s) recorded in layout-final.json`,
    )
  }
}

function listPngFiles(dir, excludedNames = new Set()) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => /\.png$/i.test(name) && !excludedNames.has(name))
    .sort((a, b) => a.localeCompare(b, 'en'))
    .map((name) => {
      const path = join(dir, name)
      return { name, path, bytes: statSync(path).size }
    })
}

function expectedSlideCount(inspect) {
  const count = Number(inspect?.presentation?.slideCount)
  if (Number.isInteger(count) && count >= 0) return count
  return Array.isArray(inspect?.slides) ? inspect.slides.length : null
}

function runPreviews(summary, args, artifacts, inspect) {
  let mode = 'pptx-preview'
  let previewReport = null
  try {
    previewReport = runJsonPhase(summary, {
      name: 'preview-render',
      bin: args.xdocBin,
      args: [
        'pptx',
        'preview',
        artifacts.candidate,
        '--output-dir',
        artifacts.previews,
        '--contact-sheet',
        artifacts.contactSheet,
        '--overwrite',
        '--json',
      ],
      artifact: artifacts.previewReport,
    })
  } catch (error) {
    const phase = summary.phases.findLast((item) => item.name === 'preview-render')
    if (phase) {
      phase.status = 'recovered'
      phase.recoveredBy = 'preview-render-fallback-convert'
    }
    mode = 'convert-fallback'
    summary.warnings.push(
      `xdoc pptx preview failed; used xdoc convert PNG fallback for visual review artifacts. ${error.message}`,
    )
    mkdirSync(artifacts.previews, { recursive: true })
    runPlainPhase(summary, {
      name: 'preview-render-fallback-convert',
      bin: args.xdocBin,
      args: [
        'convert',
        artifacts.candidate,
        '--to',
        'png',
        '--output',
        artifacts.previews,
        '--overwrite',
        '--quiet',
        '--report',
        artifacts.convertReport,
        '--contact-sheet',
        '--contact-output',
        artifacts.contactSheet,
      ],
    })
  }
  const contactSheetName = basename(artifacts.contactSheet)
  const files = listPngFiles(artifacts.previews, new Set([contactSheetName]))
  const expectedCount = expectedSlideCount(inspect)
  const contactBytes = existsSync(artifacts.contactSheet)
    ? statSync(artifacts.contactSheet).size
    : 0
  const manifestPages = Array.isArray(previewReport?.pages) ? previewReport.pages.length : null
  requireGate(
    summary,
    'png-previews',
    (mode === 'convert-fallback' || previewReport?.status === 'success') &&
      expectedCount !== null &&
      files.length === expectedCount &&
      files.length > 0 &&
      files.every((file) => file.bytes > 0) &&
      contactBytes > 0,
    {
      mode,
      manifestStatus: previewReport?.status ?? null,
      manifestPages,
      count: files.length,
      expectedCount,
      allNonEmpty: files.every((file) => file.bytes > 0),
      contactSheetBytes: contactBytes,
      files: files.map((file) => ({ name: file.name, bytes: file.bytes })),
      message:
        'PNG preview count must match source slides and all preview/contact artifacts must be non-empty',
    },
  )
}

function runContactDiff(summary, args, artifacts) {
  if (!args.contactDiff) return
  const report = runJsonPhase(summary, {
    name: 'contact-diff',
    bin: args.xdocBin,
    args: [
      'pptx',
      'contact-diff',
      '--source',
      args.source,
      '--candidate',
      artifacts.candidate,
      '--output',
      artifacts.contactDiff,
      '--json',
    ],
    artifact: artifacts.contactDiffReport,
  })
  requireGate(
    summary,
    'contact-diff-artifact',
    report?.status !== 'failed' &&
      existsSync(artifacts.contactDiff) &&
      statSync(artifacts.contactDiff).size > 0,
    {
      status: report?.status ?? '',
      bytes: existsSync(artifacts.contactDiff) ? statSync(artifacts.contactDiff).size : 0,
      message: 'Requested contact-diff artifact was not generated',
    },
  )
}

function runSemanticDiff(summary, args, artifacts) {
  const report = runJsonPhase(summary, {
    name: 'pptx-semantic-diff',
    bin: args.xdocBin,
    args: [
      'pptx',
      'diff',
      '--source',
      args.source,
      '--candidate',
      artifacts.candidate,
      '--detail',
      'summary',
      '--json',
    ],
    artifact: artifacts.pptxDiff,
  })
  gateSemanticDiff(summary, report)
}

function publishCandidate(summary, args, artifacts) {
  if (!existsSync(artifacts.candidate) || statSync(artifacts.candidate).size === 0) {
    throw new PhaseFailure('publish', 'candidate PPTX is missing or empty')
  }
  const tempOutput = join(
    dirname(args.output),
    `.${basename(args.output)}.pptx-nova-${process.pid}-${Date.now()}.tmp`,
  )
  const start = performance.now()
  try {
    copyFileSync(artifacts.candidate, tempOutput)
    renameSync(tempOutput, args.output)
  } finally {
    rmSync(tempOutput, { force: true })
  }
  addInternalPhase(summary, 'publish', 'passed', {
    durationMs: durationMs(start),
    output: args.output,
    bytes: statSync(args.output).size,
  })
  requireGate(summary, 'published-output', statSync(args.output).size > 0, {
    output: args.output,
    bytes: statSync(args.output).size,
    message: 'Published output is empty',
  })
}

function runRefurbish(inputArgs) {
  const args = normalizeArgs(inputArgs)
  validatePaths(args)
  mkdirSync(args.runDir, { recursive: true })
  const artifacts = artifactPaths(args.runDir)
  const summary = initialSummary(args, artifacts)

  try {
    const capabilityReport = runJsonPhase(summary, {
      name: 'xdoc-capability-probe',
      bin: process.execPath,
      args: [
        CAPABILITY_PROBE_SCRIPT,
        '--xdoc-bin',
        args.xdocBin,
        '--require-command',
        'pptx.refurbish-skin',
        '--require-native-deckkit',
        args.deckkit,
        '--json',
      ],
      artifact: artifacts.capabilities,
    })
    if (capabilityReport.status !== 'ready') {
      summary.warnings.push(
        'xdoc capability schema is degraded; the runner will continue with its existing plan, command errors, and fallback gates instead of assuming missing capabilities are unsupported.',
      )
    }
    if (capabilityReport.requirements?.status === 'attention') {
      summary.warnings.push(
        'One or more refurbish capabilities are undisclosed by the runtime schema. This is audit evidence only and does not disable native or fallback execution.',
      )
    }

    const plan = buildRefurbishPlan({
      deckkit: args.deckkit,
      source: args.source,
      output: artifacts.candidate,
      catalog: args.catalog,
      explicit: args.explicit,
    })
    writeJson(artifacts.plan, plan)
    addInternalPhase(summary, 'refurbish-plan', plan.status === 'blocked' ? 'failed' : 'passed', {
      artifact: relativeArtifact(args.runDir, artifacts.plan),
      status: plan.status,
      route: plan.route ?? '',
    })
    if (plan.status === 'blocked') {
      throw new PhaseFailure('refurbish-plan', plan.blockers.join('; ') || 'refurbish plan blocked')
    }
    summary.route.planned = plan.route
    runCatalogGate(summary, plan, args)
    runOptionalReadiness(summary, args, artifacts)
    const inspect = runInspect(summary, args, artifacts)

    const nativeSupported = plan.nativeSkinning?.supported === true
    if (args.route === 'native' && !nativeSupported) {
      throw new PhaseFailure(
        'route-selection',
        `DeckKit "${args.deckkit}" does not declare native skinning support`,
      )
    }

    const tryNative = args.route === 'native' || (args.route === 'auto' && nativeSupported)
    let useFallback = args.route === 'fallback' || !tryNative
    if (tryNative) {
      try {
        runNative(summary, args, artifacts)
        summary.route.executed = 'native-skin-first'
      } catch (error) {
        const unsupportedComplexity =
          error instanceof PhaseFailure && error.kind === 'UnsupportedComplexity'
        if (args.route === 'auto' && unsupportedComplexity) {
          const phase = summary.phases.findLast((item) => item.name === 'native-refurbish-skin')
          if (phase) {
            phase.status = 'recovered'
            phase.recoveredBy = 'fallback-patch'
          }
          summary.route.fallbackReason = 'native refurbish-skin returned UnsupportedComplexity'
          summary.warnings.push(
            'Native refurbish-skin exceeded its current complexity limit; runner continued with the catalog-driven fallback patch route.',
          )
          useFallback = true
        } else {
          throw error
        }
      }
    }

    if (useFallback) {
      runFallback(summary, args, artifacts)
      summary.route.executed = 'fallback-patch'
    }

    runFidelityGate(summary, artifacts)
    runLayoutSnapshot(summary, args, artifacts)
    runPreviews(summary, args, artifacts, inspect)
    runContactDiff(summary, args, artifacts)
    runSemanticDiff(summary, args, artifacts)
    publishCandidate(summary, args, artifacts)

    summary.status = 'needs-human-review'
    summary.machineGatesPassed = true
    summary.deliveryReady = false
    finalizeArtifactPaths(summary, artifacts.summary)
    writeJson(artifacts.summary, summary)
    return summary
  } catch (error) {
    summary.status = 'failed'
    summary.machineGatesPassed = false
    summary.deliveryReady = false
    summary.error = {
      phase: error.phase ?? 'runner',
      kind: error.kind ?? error.name ?? 'Error',
      message: error.message,
      exitCode: error.exitCode ?? null,
    }
    finalizeArtifactPaths(summary, artifacts.summary)
    writeJson(artifacts.summary, summary)
    error.summary = summary
    throw error
  }
}

function printHuman(summary) {
  process.stdout.write(`PPTX refurbish run: ${summary.status}\n`)
  process.stdout.write(
    `- route: ${summary.route.executed || summary.route.planned || 'not-started'}\n`,
  )
  process.stdout.write(`- run dir: ${summary.runDir}\n`)
  process.stdout.write(`- output: ${summary.output}\n`)
  process.stdout.write(`- machine gates: ${summary.machineGatesPassed ? 'passed' : 'failed'}\n`)
  process.stdout.write(`- manual review: ${summary.needsHumanReview ? 'required' : 'complete'}\n`)
  if (summary.error)
    process.stdout.write(`- error: ${summary.error.phase}: ${summary.error.message}\n`)
}

let parsedArgs = null
try {
  parsedArgs = parseArgs(process.argv.slice(2))
  const summary = runRefurbish(parsedArgs)
  if (parsedArgs.json) process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
  else printHuman(summary)
} catch (error) {
  const summary = error.summary ?? {
    schemaVersion: 'pptx-nova-refurbish-run/v1',
    status: 'failed',
    error: {
      phase: error.phase ?? 'preflight',
      kind: error.kind ?? error.name ?? 'Error',
      message: error.message,
      exitCode: error.exitCode ?? null,
    },
  }
  if (parsedArgs?.json) process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
  else if (summary.runDir) printHuman(summary)
  else process.stderr.write(`[error] ${summary.error.phase}: ${summary.error.message}\n`)
  process.exitCode = 1
}
