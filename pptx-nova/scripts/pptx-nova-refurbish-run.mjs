#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { createProgressReporter } from './pptx-nova-progress.mjs'
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
const COMPARE_SCRIPT = join(SCRIPT_DIR, 'pptx-nova-compare.mjs')
const COMPARE_GATE_SCRIPT = join(SCRIPT_DIR, 'pptx-nova-compare-gate.mjs')
const AGENT_SUMMARY_SCHEMA_VERSION = 'pptx-nova-agent-summary/v1'
const AGENT_RESULT_SCHEMA_VERSION = 'pptx-nova-refurbish-result/v1'
let progressReporter = createProgressReporter({ mode: 'off' })

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

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
  --review-policy <path>  Optional hash-bound pptx-nova-review-policy/v1 document
  --explicit              User explicitly named a non-production/default DeckKit
  --contact-diff          Materialize contact-diff aliases from the final refurbish comparison
  --compare-chunk-size <n>
                          Maximum slides per compare PNG. Defaults to 20.
  --overwrite             Allow replacing an existing final output after all machine gates pass
  --progress <mode>       Progress stream: auto|jsonl|text|off. Defaults to auto.
  --json                  Print the compact Agent result; the full summary is always saved in the run directory
  --json-full             Print the complete run summary for debugging
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
    reviewPolicy: '',
    explicit: false,
    contactDiff: false,
    compareChunkSize: 20,
    overwrite: false,
    progress: 'auto',
    json: false,
    jsonFull: false,
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
    } else if (arg === '--json-full') {
      args.json = true
      args.jsonFull = true
    } else if (arg in valueFlags) {
      const key = valueFlags[arg]
      const value = valueAfter(argv, i, arg)
      args[key] = key === 'compareChunkSize' ? Number(value) : value
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
  if (!Number.isInteger(args.compareChunkSize) || args.compareChunkSize <= 0) {
    throw new Error('--compare-chunk-size must be a positive integer')
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
  '--review-policy': 'reviewPolicy',
  '--compare-chunk-size': 'compareChunkSize',
  '--progress': 'progress',
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

function commandInvocation(bin, args) {
  const scriptExts = new Set(['.cjs', '.js', '.mjs'])
  const ext = extname(bin).toLowerCase()
  if (scriptExts.has(ext) && (bin.includes('/') || bin.includes('\\') || existsSync(bin))) {
    return { bin: process.execPath, args: [bin, ...args] }
  }
  return { bin, args }
}

function saveStream(runDir, phase, kind, value) {
  if (!value?.trim()) return null
  const path = join(runDir, `${phase}.${kind}.txt`)
  writeFileSync(path, value)
  return path
}

function jsonStatusFailure(report) {
  const status = typeof report?.status === 'string' ? report.status.toLowerCase() : ''
  return ['error', 'fail', 'failed', 'blocked'].includes(status)
}

function jsonStatusFailureKind(report) {
  return report?.error?.kind ?? report?.error?.code ?? report?.status ?? 'JsonStatusFailure'
}

function runJsonPhase(summary, options) {
  const { name, bin, args, artifact, cwd = summary.runDir } = options
  const start = performance.now()
  const command = commandInvocation(bin, args)
  progressReporter.emit('phase-start', {
    phase: name,
    executable: basename(command.bin),
    argumentCount: command.args.length,
  })
  const result = spawnSync(command.bin, command.args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    env: options.forwardProgress ? { ...process.env, PPTX_NOVA_PROGRESS_FD: '3' } : process.env,
    stdio: options.forwardProgress
      ? ['ignore', 'pipe', 'pipe', process.stderr]
      : ['ignore', 'pipe', 'pipe'],
  })
  if (result.error) {
    summary.phases.push({
      name,
      status: 'failed',
      exitCode: null,
      signal: null,
      durationMs: durationMs(start),
      command: commandText(command.bin, command.args),
      artifact: relativeArtifact(summary.runDir, artifact),
      stderr: null,
      spawnError: result.error.message,
    })
    progressReporter.emit('phase-complete', {
      phase: name,
      status: 'failed',
      durationMs: durationMs(start),
      error: result.error.message,
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
    status: result.status === 0 && !parseError && !jsonStatusFailure(report) ? 'passed' : 'failed',
    exitCode: result.status,
    signal: result.signal ?? null,
    durationMs: durationMs(start),
    command: commandText(command.bin, command.args),
    artifact: relativeArtifact(summary.runDir, artifact),
    stderr: relativeArtifact(summary.runDir, stderrPath),
  }
  summary.phases.push(phase)
  progressReporter.emit('phase-complete', {
    phase: name,
    status: phase.status,
    durationMs: phase.durationMs,
    exitCode: phase.exitCode,
    artifact: phase.artifact,
  })

  if (parseError) {
    throw new PhaseFailure(name, `${name} did not emit valid JSON: ${parseError.message}`, {
      exitCode: result.status,
      report,
    })
  }
  if (result.status !== 0) {
    const kind = jsonStatusFailureKind(report)
    throw new PhaseFailure(
      name,
      `${name} failed with exit code ${result.status}${kind ? ` (${kind})` : ''}`,
      { exitCode: result.status, kind, report },
    )
  }
  if (jsonStatusFailure(report)) {
    const kind = jsonStatusFailureKind(report)
    throw new PhaseFailure(
      name,
      `${name} emitted failure JSON status ${JSON.stringify(report.status)}${kind ? ` (${kind})` : ''}`,
      { exitCode: result.status, kind, report },
    )
  }
  return report
}

function runPlainPhase(summary, options) {
  const { name, bin, args, cwd = summary.runDir } = options
  const start = performance.now()
  const command = commandInvocation(bin, args)
  progressReporter.emit('phase-start', {
    phase: name,
    executable: basename(command.bin),
    argumentCount: command.args.length,
  })
  const result = spawnSync(command.bin, command.args, {
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
      command: commandText(command.bin, command.args),
      artifact: null,
      stdout: null,
      stderr: null,
      spawnError: result.error.message,
    })
    progressReporter.emit('phase-complete', {
      phase: name,
      status: 'failed',
      durationMs: durationMs(start),
      error: result.error.message,
    })
    throw new PhaseFailure(name, `${name} could not start: ${result.error.message}`, {
      kind: result.error.code ?? 'SpawnError',
    })
  }
  const stdoutPath = saveStream(summary.runDir, name, 'stdout', result.stdout ?? '')
  const stderrPath = saveStream(summary.runDir, name, 'stderr', result.stderr ?? '')
  const phase = {
    name,
    status: result.status === 0 ? 'passed' : 'failed',
    exitCode: result.status,
    signal: result.signal ?? null,
    durationMs: durationMs(start),
    command: commandText(command.bin, command.args),
    artifact: null,
    stdout: relativeArtifact(summary.runDir, stdoutPath),
    stderr: relativeArtifact(summary.runDir, stderrPath),
  }
  summary.phases.push(phase)
  progressReporter.emit('phase-complete', {
    phase: name,
    status: phase.status,
    durationMs: phase.durationMs,
    exitCode: phase.exitCode,
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
  progressReporter.emit('phase-complete', { phase: name, status, ...details })
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

function gateByName(summary, name) {
  return summary.gates.find((gate) => gate.name === name) ?? null
}

function gateStatus(gate) {
  if (!gate) return 'not-run'
  return gate.passed ? 'passed' : 'failed'
}

function artifactSet(summary, keys) {
  return Object.fromEntries(keys.map((key) => [key, summary.artifacts?.[key] ?? null]))
}

function buildAgentLayoutSummary(layout) {
  if (!layout) return null
  return {
    status: layout.status ?? null,
    riskCount: layout.riskCount ?? 0,
    actionableRiskCount: layout.actionableRiskCount ?? 0,
    informationalRiskCount: layout.informationalRiskCount ?? 0,
    actionableSlideCount: layout.actionableSlideCount ?? 0,
    actionableSlideNumbers: layout.actionableSlideNumbers ?? [],
    actionablePreviewFiles: layout.actionablePreviewFiles ?? [],
    topActionable: layout.topActionable ?? [],
    reviewedRiskCount: layout.reviewedRiskCount ?? 0,
    reviewPolicyStatus: layout.reviewPolicyStatus ?? null,
  }
}

function buildAgentSummary(summary) {
  const visionDiff = gateByName(summary, 'vision-diff')
  const audit = gateByName(summary, 'refurbish-audit')
  const fidelity = gateByName(summary, 'fidelity-gate')
  const semanticDiff = gateByName(summary, 'pptx-semantic-diff')
  const preview = gateByName(summary, 'png-previews')
  const compare = gateByName(summary, 'refurbish-compare-delivery')
  const route = summary.route?.executed || summary.route?.planned || summary.route?.requested || ''
  const decision = summary.machineGatesPassed
    ? summary.needsHumanReview
      ? 'continue-to-human-review'
      : 'deliver'
    : 'stop-and-fix'

  return {
    schemaVersion: AGENT_SUMMARY_SCHEMA_VERSION,
    mode: 'refurbish',
    status: summary.status,
    machineGatesPassed: Boolean(summary.machineGatesPassed),
    deliveryReady: Boolean(summary.deliveryReady),
    needsHumanReview: Boolean(summary.needsHumanReview),
    decision,
    deckkit: summary.deckkit,
    route,
    layout: buildAgentLayoutSummary(summary.layout),
    slides: {
      source: fidelity?.sourceSlides ?? null,
      final: fidelity?.finalSlides ?? null,
      mapped: fidelity?.mappedSlides ?? null,
    },
    gates: {
      visionDiff: {
        status: visionDiff?.status ?? null,
        gate: gateStatus(visionDiff),
        newHigh: visionDiff?.new?.high ?? null,
        newMedium: visionDiff?.new?.medium ?? null,
        changedHigh: visionDiff?.changed?.high ?? null,
      },
      refurbishAudit: {
        status: audit?.status ?? null,
        gate: gateStatus(audit),
        errors: audit?.errorCount ?? null,
        warnings: audit?.warningCount ?? null,
      },
      fidelityGate: {
        status: fidelity?.status ?? null,
        gate: gateStatus(fidelity),
        errors: fidelity?.errors ?? null,
        warnings: fidelity?.warnings ?? null,
        declaredReviews: fidelity?.declaredReviews ?? null,
        appliedReviews: fidelity?.appliedReviews ?? null,
        reviewedFindings: fidelity?.reviewedFindings ?? null,
        remainingActionableFindings: fidelity?.remainingActionableFindings ?? null,
      },
      semanticDiff: {
        status: semanticDiff?.status ?? null,
        gate: gateStatus(semanticDiff),
        semanticStatus: semanticDiff?.semanticStatus ?? null,
        reliableChanges: semanticDiff?.reliableChanges ?? null,
        uncertainChanges: semanticDiff?.uncertainChanges ?? null,
        unsupportedRegions: semanticDiff?.unsupportedRegions ?? null,
      },
      preview: {
        gate: gateStatus(preview),
        mode: preview?.mode ?? null,
        pages: preview?.count ?? null,
        expectedPages: preview?.expectedCount ?? null,
        contactSheetBytes: preview?.contactSheetBytes ?? null,
      },
      compare: {
        gate: gateStatus(compare),
        partCount: compare?.partCount ?? null,
      },
    },
    artifacts: artifactSet(summary, [
      'summary',
      'visionDiff',
      'contentAuditFinal',
      'fidelityGate',
      'pptxDiff',
      'contactSheet',
      'contactDiffParts',
      'refurbishCompare',
      'refurbishCompareParts',
      'refurbishCompareGate',
      'layoutFinal',
    ]),
    warnings: summary.warnings,
    error: summary.error
      ? {
          phase: summary.error.phase,
          message: summary.error.message,
          kind: summary.error.kind ?? null,
        }
      : null,
  }
}

function buildPerformanceSummary(summary, totalMs) {
  const measured = summary.phases
    .filter((phase) => Number.isFinite(phase.durationMs) && phase.durationMs > 0)
    .map((phase) => ({ name: phase.name, durationMs: phase.durationMs }))
  const renderNames = new Set([
    'preview-render',
    'preview-render-fallback-convert',
    'contact-diff',
    'refurbish-compare',
  ])
  const renderMs = measured
    .filter((phase) => renderNames.has(phase.name))
    .reduce((sum, phase) => sum + phase.durationMs, 0)
  const comparePhase = summary.phases.find((phase) => phase.name === 'refurbish-compare')
  const compareRenderInvocations = Number(comparePhase?.renderInvocations ?? 0)
  const comparePartCount = Number(comparePhase?.partCount ?? 0)
  const compareRetryInvocations = Math.max(0, compareRenderInvocations - comparePartCount)
  const renderInvocationsSaved = Number(
    summary.review?.contactDiffReuse?.renderInvocationsSaved ?? 0,
  )
  const estimatedRenderedPixels = Number(comparePhase?.estimatedRenderedPixels ?? 0)
  const baselineEstimatedPixels = Number(comparePhase?.baselineEstimatedPixels ?? 0)
  return {
    schemaVersion: 'pptx-nova-performance/v1',
    totalMs,
    measuredPhaseMs: Number(measured.reduce((sum, phase) => sum + phase.durationMs, 0).toFixed(2)),
    renderMs: Number(renderMs.toFixed(2)),
    renderShare: totalMs > 0 ? Number((renderMs / totalMs).toFixed(4)) : 0,
    compareRenderInvocations,
    comparePartCount,
    compareRetryInvocations,
    estimatedRenderedPixels,
    renderInvocationsSaved,
    renderBudget: {
      baselineInvocations: comparePartCount,
      actualInvocations: compareRenderInvocations,
      withinBaseline: compareRenderInvocations <= comparePartCount,
      maximumRetryInvocations: comparePartCount,
      maximumTotalInvocations: comparePartCount * 2,
      withinRetryBudget: compareRetryInvocations <= comparePartCount,
      baselineEstimatedPixels,
      actualEstimatedPixels: estimatedRenderedPixels,
      withinPixelBaseline: estimatedRenderedPixels <= baselineEstimatedPixels,
      maximumRetryEstimatedPixels: Math.round(baselineEstimatedPixels * 1.5625),
      withinPixelRetryBudget:
        estimatedRenderedPixels <= Math.round(baselineEstimatedPixels * 1.5625),
    },
    contactDiffRequested: Boolean(summary.review?.contactDiffRequested),
    contactDiffReused: summary.review?.contactDiffReuse?.status === 'reused',
    topPhases: [...measured].sort((left, right) => right.durationMs - left.durationMs).slice(0, 5),
  }
}

function buildAgentResult(summary) {
  return {
    schemaVersion: AGENT_RESULT_SCHEMA_VERSION,
    status: summary.status,
    machineGatesPassed: Boolean(summary.machineGatesPassed),
    deliveryReady: Boolean(summary.deliveryReady),
    needsHumanReview: Boolean(summary.needsHumanReview),
    runDir: summary.runDir ?? null,
    output: summary.output ?? null,
    performance: summary.performance ?? null,
    agentSummary: summary.agentSummary ?? null,
    error: summary.error ?? null,
  }
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
    reviewPolicy: args.reviewPolicy ? resolve(cwd, args.reviewPolicy) : '',
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
  if (
    args.reviewPolicy &&
    (!existsSync(args.reviewPolicy) || !statSync(args.reviewPolicy).isFile())
  ) {
    throw new Error(`review policy does not exist or is not a file: ${args.reviewPolicy}`)
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
    sourceSnapshot: join(runDir, 'source.pptx'),
    capabilities: join(runDir, 'xdoc-capabilities.json'),
    plan: join(runDir, 'refurbish-plan.json'),
    readiness: join(runDir, 'catalog-readiness.json'),
    deliveryReadiness: join(runDir, 'delivery-readiness.json'),
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
    reviewPolicy: join(runDir, 'review-policy.json'),
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
    contactDiffParts: [],
    contactDiffReport: join(runDir, 'contact-diff.json'),
    refurbishCompare: join(runDir, 'refurbish-compare.png'),
    refurbishCompareParts: [],
    refurbishCompareReport: join(runDir, 'refurbish-compare.json'),
    refurbishCompareGate: join(runDir, 'refurbish-compare-gate.json'),
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
        'Review contact-sheet.png, the complete refurbish-compare PNG set listed by the compare gate, and suspicious full-size PNGs. Confirm the target DeckKit is visibly applied and source content remains intact.',
    },
    warnings: [],
    layout: null,
    error: null,
  }
}

function finalizeArtifactPaths(summary, summaryPath) {
  summary.artifacts = Object.fromEntries(
    Object.entries(summary.artifacts).map(([key, value]) => {
      if (Array.isArray(value)) {
        return [key, value.filter((path) => typeof path === 'string' && existsSync(path))]
      }
      return [key, key === 'summary' || existsSync(value) ? value : null]
    }),
  )
  summary.artifacts.summary = summaryPath
}

function persistCatalogReadiness(summary, plan, args, artifacts) {
  const standardReadiness = ['production', 'default'].includes(plan.readiness)
  const explicitException = ['experimental', 'candidate'].includes(plan.readiness) && args.explicit
  const benchmarkPassed = plan.catalog?.benchmarkPassed
  const readinessPassed = standardReadiness || explicitException
  const benchmarkGatePassed = benchmarkPassed !== false
  const report = {
    schemaVersion: 'pptx-nova-catalog-readiness/v1',
    status: readinessPassed && benchmarkGatePassed ? 'pass' : 'fail',
    deckkit: args.deckkit,
    catalogPath: args.catalog,
    readiness: plan.readiness,
    explicit: args.explicit,
    explicitException,
    catalog: {
      found: plan.catalog?.found === true,
      id: plan.catalog?.id ?? args.deckkit,
      kitPath: plan.catalog?.path ?? '',
      benchmarkPassed,
    },
    agentGate: {
      passed: readinessPassed && benchmarkGatePassed,
      readinessPassed,
      benchmarkAvailable: benchmarkPassed !== null,
      benchmarkEvidencePassed: benchmarkPassed,
      benchmarkGatePassed,
      nextAction:
        readinessPassed && benchmarkGatePassed
          ? 'continue'
          : 'fix DeckKit readiness or use an allowed explicit selection before continuing',
    },
  }
  writeJson(artifacts.readiness, report)
  addInternalPhase(
    summary,
    'catalog-readiness-evidence',
    report.status === 'pass' ? 'passed' : 'failed',
    {
      artifact: relativeArtifact(summary.runDir, artifacts.readiness),
      readiness: plan.readiness,
      benchmarkPassed,
    },
  )
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
    artifact: artifacts.deliveryReadiness,
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
    '--source-pptx',
    artifacts.sourceSnapshot,
    '--candidate-pptx',
    artifacts.candidate,
    '--final-audit',
    artifacts.contentAuditFinal,
    '--vision-diff',
    artifacts.visionDiff,
    '--layout-snapshot',
    artifacts.layoutFinal,
  ]
  if (existsSync(artifacts.referenceMap)) {
    gateArgs.push('--reference-map', artifacts.referenceMap)
  }
  if (existsSync(artifacts.contentAuditBaseline)) {
    gateArgs.push('--content-audit', artifacts.contentAuditBaseline)
  }
  if (existsSync(artifacts.reviewPolicy)) {
    gateArgs.push('--review-policy', artifacts.reviewPolicy)
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
    declaredReviews: Number(report?.summary?.declaredReviews ?? 0),
    appliedReviews: Number(report?.summary?.appliedReviews ?? 0),
    reviewedFindings: Number(report?.summary?.reviewedFindings ?? 0),
    remainingActionableFindings: Number(report?.summary?.remainingActionableFindings ?? 0),
    message:
      'fidelity-gate must pass or warn using final audit, vision diff, and available reference-map evidence',
  })
  if (summary.layout) {
    const remaining = Array.isArray(report?.reviewPolicy?.remainingActionable)
      ? report.reviewPolicy.remainingActionable
      : []
    const remainingSlideIndexes = [
      ...new Set(
        remaining
          .map((finding) => Number(finding?.slideIndex ?? finding?.slide))
          .filter((value) => Number.isInteger(value) && value >= 0),
      ),
    ].sort((a, b) => a - b)
    const remainingByCode = new Map()
    for (const finding of remaining) {
      const code = String(finding?.code ?? 'layout-finding')
      remainingByCode.set(code, (remainingByCode.get(code) ?? 0) + 1)
    }
    summary.layout.rawActionableRiskCount = summary.layout.actionableRiskCount
    summary.layout.rawActionableSlideCount = summary.layout.actionableSlideCount
    summary.layout.rawActionableSlideIndexes = summary.layout.actionableSlideIndexes
    summary.layout.rawActionableSlideNumbers = summary.layout.actionableSlideNumbers
    summary.layout.rawActionablePreviewFiles = summary.layout.actionablePreviewFiles
    summary.layout.rawTopActionable = summary.layout.topActionable
    summary.layout.reviewedRiskCount = Number(report?.summary?.reviewedFindings ?? 0)
    summary.layout.actionableRiskCount = Number(
      report?.summary?.remainingActionableFindings ?? summary.layout.actionableRiskCount,
    )
    summary.layout.actionableSlideCount = remainingSlideIndexes.length
    summary.layout.actionableSlideIndexes = remainingSlideIndexes
    summary.layout.actionableSlideNumbers = remainingSlideIndexes.map((index) => index + 1)
    summary.layout.actionablePreviewFiles = remainingSlideIndexes.map(
      (index) => `slide-${String(index + 1).padStart(3, '0')}.png`,
    )
    summary.layout.topActionable = [...remainingByCode.entries()]
      .map(([code, count]) => ({ code, classification: 'actionable', count }))
      .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code))
      .slice(0, 5)
    summary.layout.reviewPolicyStatus = report?.reviewPolicy?.status ?? null
    summary.layout.appliedReviews = report?.reviewPolicy?.applied ?? []
  }
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
  const actionableRiskCount = Number(snapshot?.summary?.actionableRiskCount ?? riskCount)
  const informationalRiskCount = Number(snapshot?.summary?.informationalRiskCount ?? 0)
  const topActionable = Array.isArray(snapshot?.summary?.topActionable)
    ? snapshot.summary.topActionable
    : []
  summary.layout = {
    status: snapshot?.status ?? null,
    riskCount,
    actionableRiskCount,
    informationalRiskCount,
    slideIndexBase: Number(snapshot?.summary?.slideIndexBase ?? 0),
    slideNumberBase: Number(snapshot?.summary?.slideNumberBase ?? 1),
    affectedSlideCount: Number(snapshot?.summary?.affectedSlideCount ?? 0),
    actionableSlideCount: Number(snapshot?.summary?.actionableSlideCount ?? 0),
    actionableSlideIndexes: snapshot?.summary?.actionableSlideIndexes ?? [],
    actionableSlideNumbers: snapshot?.summary?.actionableSlideNumbers ?? [],
    actionablePreviewFiles: snapshot?.summary?.actionablePreviewFiles ?? [],
    topActionable,
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

function numberedArtifactPath(path, partNumber, partCount) {
  const extension = extname(path)
  const stem = path.slice(0, -extension.length)
  const width = Math.max(2, String(partCount).length)
  return `${stem}-${String(partNumber).padStart(width, '0')}${extension}`
}

function materializeContactDiff(summary, args, artifacts, compareReport) {
  if (!args.contactDiff) return
  const multipart = compareReport?.schemaVersion === 'pptx-nova-compare-manifest/v1'
  let report
  let partCount = 1
  if (multipart) {
    partCount = compareReport.parts?.length ?? 0
    const parts = compareReport.parts.map((part, index) => {
      const partNumber = index + 1
      const path = numberedArtifactPath(artifacts.contactDiff, partNumber, partCount)
      const reportPath = numberedArtifactPath(artifacts.contactDiffReport, partNumber, partCount)
      copyFileSync(part.path, path)
      const sourcePartReport = JSON.parse(readFileSync(part.reportPath, 'utf8'))
      writeJson(reportPath, {
        ...sourcePartReport,
        outputPath: path,
        output: path,
        render: sourcePartReport?.render
          ? { ...sourcePartReport.render, path }
          : sourcePartReport?.render,
        reuse: {
          status: 'reused',
          sourceReport: part.reportPath,
          sourcePath: part.path,
        },
      })
      return {
        ...part,
        path,
        reportPath,
        byteLength: statSync(path).size,
        sha256: sha256(path),
        reusedFrom: { path: part.path, reportPath: part.reportPath },
      }
    })
    report = {
      ...compareReport,
      kind: 'contact',
      parts,
      reuse: {
        status: 'reused',
        sourceKind: compareReport.kind,
        sourceReport: artifacts.refurbishCompareReport,
        renderInvocationsSaved: partCount,
      },
    }
    summary.artifacts.contactDiffParts = parts.map((part) => part.path)
  } else {
    copyFileSync(artifacts.refurbishCompare, artifacts.contactDiff)
    report = {
      ...compareReport,
      outputPath: artifacts.contactDiff,
      output: artifacts.contactDiff,
      render: compareReport?.render
        ? { ...compareReport.render, path: artifacts.contactDiff }
        : compareReport?.render,
      reuse: {
        status: 'reused',
        sourceKind: 'refurbish',
        sourceReport: artifacts.refurbishCompareReport,
        sourcePath: artifacts.refurbishCompare,
        renderInvocationsSaved: 1,
      },
    }
  }
  writeJson(artifacts.contactDiffReport, report)
  const aliasEvidenceValid = multipart
    ? partCount > 0 &&
      report.parts.every((part) => {
        if (
          !existsSync(part.path) ||
          statSync(part.path).size <= 0 ||
          !existsSync(part.reportPath)
        ) {
          return false
        }
        const partReport = JSON.parse(readFileSync(part.reportPath, 'utf8'))
        return (
          part.sha256 === sha256(part.path) &&
          part.byteLength === statSync(part.path).size &&
          partReport.outputPath === part.path &&
          partReport.render?.path === part.path
        )
      })
    : existsSync(artifacts.contactDiff) &&
      statSync(artifacts.contactDiff).size > 0 &&
      existsSync(artifacts.contactDiffReport) &&
      sha256(artifacts.contactDiff) === sha256(artifacts.refurbishCompare) &&
      report.outputPath === artifacts.contactDiff &&
      report.render?.path === artifacts.contactDiff
  summary.review.contactDiffReuse = report.reuse
  requireGate(
    summary,
    'contact-diff-artifact',
    report?.status === 'success' && aliasEvidenceValid,
    {
      status: report?.status ?? '',
      partCount,
      reused: true,
      renderInvocationsSaved: report.reuse.renderInvocationsSaved,
      message: 'Requested contact-diff aliases were not materialized from final compare evidence',
    },
  )
  addInternalPhase(summary, 'contact-diff-reuse', 'passed', {
    artifact: relativeArtifact(args.runDir, artifacts.contactDiffReport),
    partCount,
    renderInvocationsSaved: report.reuse.renderInvocationsSaved,
  })
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

function runRefurbishCompare(summary, args, artifacts, inspect) {
  const report = runJsonPhase(summary, {
    name: 'refurbish-compare',
    bin: process.execPath,
    args: [
      COMPARE_SCRIPT,
      '--source',
      artifacts.sourceSnapshot,
      '--candidate',
      artifacts.candidate,
      '--run-dir',
      args.runDir,
      '--kind',
      'refurbish',
      '--output',
      artifacts.refurbishCompare,
      '--report',
      artifacts.refurbishCompareReport,
      '--slide-count',
      String(expectedSlideCount(inspect)),
      '--compare-chunk-size',
      String(args.compareChunkSize),
      '--dpi',
      '192',
      '--fallback-dpi',
      '144',
      '--xdoc-bin',
      args.xdocBin,
      '--progress',
      args.progress,
      '--overwrite',
      '--json',
    ],
    artifact: artifacts.refurbishCompareReport,
    forwardProgress: true,
  })
  const parts =
    report?.schemaVersion === 'pptx-nova-compare-manifest/v1' ? (report.parts ?? []) : [report]
  const renderMetrics = parts.reduce(
    (metrics, part) => {
      const partReport = part?.reportPath ? JSON.parse(readFileSync(part.reportPath, 'utf8')) : part
      const attemptReports = Array.isArray(part?.attempts)
        ? part.attempts
        : Array.isArray(partReport?.pptxNovaCompare?.attempts)
          ? partReport.pptxNovaCompare.attempts
          : []
      const attempts = Math.max(1, attemptReports.length)
      const width = Number(partReport?.render?.width ?? 0)
      const height = Number(partReport?.render?.height ?? 0)
      const finalDpi = Number(partReport?.render?.dpi ?? 0)
      metrics.renderInvocations += attempts
      if (width > 0 && height > 0) {
        const pixelsAtDpi = (dpi) => {
          const scale = finalDpi > 0 && dpi > 0 ? dpi / finalDpi : 1
          return Math.round(width * height * scale * scale)
        }
        metrics.baselineEstimatedPixels += pixelsAtDpi(192)
        metrics.estimatedRenderedPixels += (
          attemptReports.length ? attemptReports : [{ dpi: finalDpi }]
        ).reduce((pixels, attempt) => pixels + pixelsAtDpi(Number(attempt?.dpi ?? finalDpi)), 0)
      }
      return metrics
    },
    { renderInvocations: 0, estimatedRenderedPixels: 0, baselineEstimatedPixels: 0 },
  )
  const phase = summary.phases.findLast((item) => item.name === 'refurbish-compare')
  if (phase) {
    phase.partCount = parts.length
    phase.renderInvocations = renderMetrics.renderInvocations
    phase.estimatedRenderedPixels = renderMetrics.estimatedRenderedPixels
    phase.baselineEstimatedPixels = renderMetrics.baselineEstimatedPixels
  }
  return report
}

function runRefurbishCompareGate(summary, args, artifacts) {
  const report = runJsonPhase(summary, {
    name: 'refurbish-compare-delivery',
    bin: process.execPath,
    args: [
      COMPARE_GATE_SCRIPT,
      '--run-dir',
      args.runDir,
      '--final-pptx',
      args.output,
      '--final-pptx-source',
      artifacts.candidate,
      '--kind',
      'refurbish',
      '--publish',
      '--overwrite',
      '--json',
    ],
    artifact: artifacts.refurbishCompareGate,
  })
  const siblingPaths = report?.agentSummary?.siblingPaths ?? []
  summary.artifacts.refurbishCompareParts = siblingPaths.length > 1 ? siblingPaths : []
  requireGate(summary, 'refurbish-compare-delivery', report?.status === 'pass', {
    status: report?.status ?? '',
    finalBinding: report?.finalBinding?.status ?? null,
    finalSha256: report?.finalBinding?.publishedFinal?.sha256 ?? null,
    siblingPath: report?.agentSummary?.siblingPath ?? null,
    siblingPaths,
    partCount: report?.parts?.length || 1,
    message:
      'The final PPTX and complete refurbish compare PNG set must be SHA-256-bound to the compared candidate',
  })
  requireGate(
    summary,
    'published-output-binding',
    report?.finalBinding?.status === 'bound' &&
      report?.finalBinding?.publishedFinal?.path === args.output &&
      existsSync(args.output) &&
      statSync(args.output).size === report?.finalBinding?.publishedFinal?.byteLength &&
      sha256(args.output) === report?.finalBinding?.publishedFinal?.sha256,
    {
      output: args.output,
      bytes: existsSync(args.output) ? statSync(args.output).size : 0,
      sha256: report?.finalBinding?.publishedFinal?.sha256 ?? null,
      message: 'Published output is not bound to the compared candidate',
    },
  )
}

function runRefurbish(inputArgs) {
  const runStarted = performance.now()
  const args = normalizeArgs(inputArgs)
  validatePaths(args)
  mkdirSync(args.runDir, { recursive: true })
  const artifacts = artifactPaths(args.runDir)
  const summary = initialSummary(args, artifacts)

  try {
    copyFileSync(args.source, artifacts.sourceSnapshot)
    addInternalPhase(summary, 'source-snapshot', 'passed', {
      artifact: relativeArtifact(args.runDir, artifacts.sourceSnapshot),
      bytes: statSync(artifacts.sourceSnapshot).size,
    })
    if (args.reviewPolicy) {
      copyFileSync(args.reviewPolicy, artifacts.reviewPolicy)
      addInternalPhase(summary, 'review-policy-snapshot', 'passed', {
        artifact: relativeArtifact(args.runDir, artifacts.reviewPolicy),
        bytes: statSync(artifacts.reviewPolicy).size,
        sha256: sha256(artifacts.reviewPolicy),
      })
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
    persistCatalogReadiness(summary, plan, args, artifacts)
    if (plan.status === 'blocked') {
      throw new PhaseFailure('refurbish-plan', plan.blockers.join('; ') || 'refurbish plan blocked')
    }
    summary.route.planned = plan.route
    runCatalogGate(summary, plan, args)
    runOptionalReadiness(summary, args, artifacts)

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
          plan.requiredReferences = [
            ...(plan.requiredReferences ?? []),
            {
              path: 'references/reference-create.md',
              section: '6. Refurbish Existing Deck',
              reason:
                'Native skinning returned UnsupportedComplexity; the runner selected the catalog-driven fallback contract.',
            },
          ]
          writeJson(artifacts.plan, plan)
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

    runLayoutSnapshot(summary, args, artifacts)
    runFidelityGate(summary, artifacts)
    runPreviews(summary, args, artifacts, inspect)
    runSemanticDiff(summary, args, artifacts)
    const compareReport = runRefurbishCompare(summary, args, artifacts, inspect)
    materializeContactDiff(summary, args, artifacts, compareReport)
    runRefurbishCompareGate(summary, args, artifacts)

    summary.status = 'needs-human-review'
    summary.machineGatesPassed = true
    summary.deliveryReady = false
    finalizeArtifactPaths(summary, artifacts.summary)
    summary.performance = buildPerformanceSummary(summary, durationMs(runStarted))
    summary.agentSummary = buildAgentSummary(summary)
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
    summary.performance = buildPerformanceSummary(summary, durationMs(runStarted))
    summary.agentSummary = buildAgentSummary(summary)
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
  progressReporter = createProgressReporter({
    mode: parsedArgs.progress,
    jsonOutput: parsedArgs.json,
    context: { tool: 'pptx-nova-refurbish-run', deckkit: parsedArgs.deckkit },
  })
  const summary = runRefurbish(parsedArgs)
  if (parsedArgs.json) {
    const output = parsedArgs.jsonFull ? summary : buildAgentResult(summary)
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
  } else printHuman(summary)
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
  if (parsedArgs?.json) {
    const output = parsedArgs.jsonFull ? summary : buildAgentResult(summary)
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
  } else if (summary.runDir) printHuman(summary)
  else process.stderr.write(`[error] ${summary.error.phase}: ${summary.error.message}\n`)
  process.exitCode = 1
}
