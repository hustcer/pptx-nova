#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const SKILL_ROOT = resolve(SCRIPT_DIR, '..')
const VALIDATE_CONTENT_SCRIPT = join(SKILL_ROOT, 'assets/deckkits/validate-content.mjs')
const BUILD_SCRIPT = join(SCRIPT_DIR, 'pptx-nova-build.mjs')
const CHECK_LOCK_SCRIPT = join(SCRIPT_DIR, 'pptx-nova-check-lock.mjs')
const CAPABILITY_PROBE_SCRIPT = join(SCRIPT_DIR, 'pptx-nova-probe.mjs')
const AGENT_SUMMARY_SCHEMA_VERSION = 'pptx-nova-agent-summary/v1'

const usage = `Usage:
  node <skill-root>/scripts/pptx-nova-create-run.mjs --deckkit <id> --content <content.json> --lock <deck_lock.json> --output <output.pptx> [options]

Options:
  --deckkit <id>          DeckKit id. Defaults to content.meta.deckkit when omitted.
  --content <path>        DeckKit content JSON.
  --lock <path>           deck_lock.json for drift checks.
  --assets <path>         Optional assets_manifest.json.
  --output <path>         Final PPTX published only after machine gates pass.
  --run-dir <path>        Run artifact directory. Defaults to <cwd>/.pptx-nova/create-<deckkit>-<timestamp>.
  --xdoc-bin <path>       xdoc executable. Defaults to xdoc.
  --overwrite             Allow replacing an existing final output after all machine gates pass.
  --json                  Print machine-readable run summary.
  --help                  Show this help.

The runner executes validate-content, build, check-lock, dry-run, apply, vision-check,
and PNG/contact-sheet preview. It keeps all intermediate artifacts in the run directory,
overwrites only current-run candidate artifacts, and still requires human/Agent visual
review of the contact sheet before final delivery confidence.
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
    content: '',
    lock: '',
    assets: '',
    output: '',
    runDir: '',
    xdocBin: 'xdoc',
    overwrite: false,
    json: false,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(usage)
      process.exit(0)
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
  if (!args.content) throw new Error(`--content is required.\n\n${usage}`)
  if (!args.lock) throw new Error(`--lock is required.\n\n${usage}`)
  if (!args.output) throw new Error(`--output is required.\n\n${usage}`)
  return args
}

const valueFlags = {
  '--deckkit': 'deckkit',
  '--content': 'content',
  '--lock': 'lock',
  '--assets': 'assets',
  '--output': 'output',
  '--run-dir': 'runDir',
  '--xdoc-bin': 'xdocBin',
}

function valueAfter(argv, index, flag) {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

function timestamp(now = new Date()) {
  const pad = (value) => String(value).padStart(2, '0')
  const millis = String(now.getMilliseconds()).padStart(3, '0')
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}${millis}`
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

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function durationMs(start) {
  return Number((performance.now() - start).toFixed(2))
}

function relativeArtifact(runDir, path) {
  return path ? relative(runDir, path) || '.' : null
}

function commandText(bin, args) {
  return [bin, ...args]
    .map((value) => (/[\s"']/.test(value) ? JSON.stringify(value) : value))
    .join(' ')
}

function commandInvocation(bin, args) {
  const ext = extname(bin).toLowerCase()
  if (['.cjs', '.js', '.mjs'].includes(ext) && (bin.includes('/') || existsSync(bin))) {
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

function runJsonPhase(summary, { name, bin, args, artifact, cwd = summary.runDir }) {
  const start = performance.now()
  const command = commandInvocation(bin, args)
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
      durationMs: durationMs(start),
      command: commandText(command.bin, command.args),
      artifact: relativeArtifact(summary.runDir, artifact),
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

  const passed = result.status === 0 && !parseError && !jsonStatusFailure(report)
  summary.phases.push({
    name,
    status: passed ? 'passed' : 'failed',
    exitCode: result.status,
    signal: result.signal ?? null,
    durationMs: durationMs(start),
    command: commandText(command.bin, command.args),
    artifact: relativeArtifact(summary.runDir, artifact),
    stderr: relativeArtifact(summary.runDir, stderrPath),
  })

  if (parseError) {
    throw new PhaseFailure(name, `${name} did not emit valid JSON: ${parseError.message}`, {
      exitCode: result.status,
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

function runPlainPhase(summary, { name, bin, args, cwd = summary.runDir }) {
  const start = performance.now()
  const command = commandInvocation(bin, args)
  const result = spawnSync(command.bin, command.args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  })
  const stdoutPath = saveStream(summary.runDir, name, 'stdout', result.stdout ?? '')
  const stderrPath = saveStream(summary.runDir, name, 'stderr', result.stderr ?? '')
  summary.phases.push({
    name,
    status: result.status === 0 && !result.error ? 'passed' : 'failed',
    exitCode: result.status,
    signal: result.signal ?? null,
    durationMs: durationMs(start),
    command: commandText(command.bin, command.args),
    stdout: relativeArtifact(summary.runDir, stdoutPath),
    stderr: relativeArtifact(summary.runDir, stderrPath),
    spawnError: result.error?.message ?? null,
  })
  if (result.error) {
    throw new PhaseFailure(name, `${name} could not start: ${result.error.message}`, {
      kind: result.error.code ?? 'SpawnError',
    })
  }
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
    durationMs: details.durationMs ?? 0,
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

function gateByName(summary, name) {
  return summary.gates.find((gate) => gate.name === name) ?? null
}

function gateStatus(gate) {
  if (!gate) return 'not-run'
  return gate.passed ? 'passed' : 'failed'
}

function countArray(value) {
  return Array.isArray(value) ? value.length : 0
}

function countSeverity(items, severity) {
  return (Array.isArray(items) ? items : []).filter((item) => item.severity === severity).length
}

function severityCounts(value) {
  return {
    high: Number(value?.high ?? 0),
    medium: Number(value?.medium ?? 0),
    low: Number(value?.low ?? 0),
  }
}

function summarizeApplyReport(report) {
  const visualRisks = report?.visualRisks ?? []
  return {
    status: report?.status ?? '',
    warnings: countArray(report?.warnings),
    changedParts: countArray(report?.changedParts),
    opResults: countArray(report?.opResults),
    visualRisks: {
      high: countSeverity(visualRisks, 'high'),
      medium: countSeverity(visualRisks, 'medium'),
      low: countSeverity(visualRisks, 'low'),
      total: countArray(visualRisks),
    },
    output: report?.output ?? null,
    sidecar: report?.sidecar ?? null,
    wouldWrite: report?.wouldWrite ?? null,
  }
}

function summarizeVisionReport(report) {
  const bySeverity = severityCounts(report?.summary?.bySeverity ?? report?.bySeverity)
  return {
    status: report?.status ?? '',
    issueCount: Number(report?.summary?.issueCount ?? report?.issues?.length ?? 0),
    bySeverity,
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

function previewPageBytes(page) {
  return Number(page?.byteLength ?? page?.file?.byteLength ?? 0)
}

function hasPathSeparator(value) {
  const text = String(value ?? '')
  return text.includes('/') || text.includes('\\')
}

function normalizeExecutablePath(value, cwd) {
  return hasPathSeparator(value) ? resolve(cwd, value) : value
}

function defaultRunDir(args, cwd) {
  const deckkit = args.deckkit || 'deckkit'
  const root = join(cwd, '.pptx-nova')
  const slug = safeSlug(deckkit)
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const entropy = `${process.pid.toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    const suffix = attempt === 0 ? entropy : `${entropy}-${attempt + 1}`
    const candidate = join(root, `create-${slug}-${timestamp()}-${suffix}`)
    if (!existsSync(candidate)) return candidate
  }
  throw new Error(`could not allocate a unique run directory under ${root}`)
}

function normalizeArgs(inputArgs) {
  const cwd = process.cwd()
  const content = resolve(cwd, inputArgs.content)
  const contentJson = readJson(content)
  const deckkit = inputArgs.deckkit || contentJson?.meta?.deckkit || ''
  const args = {
    ...inputArgs,
    deckkit,
    content,
    lock: resolve(cwd, inputArgs.lock),
    assets: inputArgs.assets ? resolve(cwd, inputArgs.assets) : '',
    output: resolve(cwd, inputArgs.output),
    xdocBin: normalizeExecutablePath(inputArgs.xdocBin, cwd),
  }
  args.runDir = inputArgs.runDir ? resolve(cwd, inputArgs.runDir) : defaultRunDir(args, cwd)
  return { args, contentJson }
}

function validatePaths(args) {
  if (!args.deckkit) throw new Error('--deckkit is required when content.meta.deckkit is missing')
  for (const [label, path] of [
    ['content', args.content],
    ['deck lock', args.lock],
    ...(args.assets ? [['assets manifest', args.assets]] : []),
  ]) {
    if (!existsSync(path) || !statSync(path).isFile()) {
      throw new Error(`${label} does not exist or is not a file: ${path}`)
    }
  }
  if (extname(args.output).toLowerCase() !== '.pptx') {
    throw new Error(`--output must be a .pptx file: ${args.output}`)
  }
  if (!existsSync(dirname(args.output))) {
    throw new Error(`final output directory does not exist: ${dirname(args.output)}`)
  }
  if (existsSync(args.output) && !args.overwrite) {
    throw new Error(
      `final output already exists; pass --overwrite only when replacement is intended: ${args.output}`,
    )
  }
}

function artifactPaths(runDir) {
  return {
    capabilities: join(runDir, 'xdoc-capabilities.json'),
    validation: join(runDir, 'validate-content.json'),
    patch: join(runDir, 'patch.json'),
    quality: join(runDir, 'quality.json'),
    lockCheck: join(runDir, 'check-lock.json'),
    dryRun: join(runDir, 'dry-run.json'),
    apply: join(runDir, 'apply.json'),
    vision: join(runDir, 'vision.json'),
    candidate: join(runDir, 'candidate.pptx'),
    previews: join(runDir, 'previews'),
    previewReport: join(runDir, 'preview.json'),
    contactSheet: join(runDir, 'previews', 'contact-sheet.png'),
    summary: join(runDir, 'create-run-summary.json'),
  }
}

function initialSummary(args, content, artifacts) {
  return {
    schemaVersion: 'pptx-nova-create-run/v1',
    status: 'running',
    mode: 'create',
    machineGatesPassed: false,
    deliveryReady: false,
    needsHumanReview: true,
    deckkit: args.deckkit,
    content: args.content,
    deckLock: args.lock,
    assetsManifest: args.assets || null,
    output: args.output,
    runDir: args.runDir,
    slideCount: Array.isArray(content?.slides) ? content.slides.length : null,
    artifacts: Object.fromEntries(Object.entries(artifacts).map(([key, path]) => [key, path])),
    phases: [],
    gates: [],
    review: {
      required: true,
      completed: false,
      instructions:
        'Review contact-sheet.png and suspicious full-size PNGs before treating the deck as visually delivered.',
    },
    warnings: [],
    error: null,
  }
}

function finalizeArtifactPaths(summary, summaryPath) {
  summary.artifacts = Object.fromEntries(
    Object.entries(summary.artifacts).map(([key, path]) => [
      key,
      key === 'summary' || (path && existsSync(path)) ? path : null,
    ]),
  )
  summary.artifacts.summary = summaryPath
}

function buildAgentSummary(summary) {
  const validate = gateByName(summary, 'validate-content')
  const build = gateByName(summary, 'build')
  const checkLock = gateByName(summary, 'check-lock')
  const dryRun = gateByName(summary, 'dry-run')
  const apply = gateByName(summary, 'apply')
  const vision = gateByName(summary, 'vision-check')
  const preview = gateByName(summary, 'png-previews')
  return {
    schemaVersion: AGENT_SUMMARY_SCHEMA_VERSION,
    mode: 'create',
    status: summary.status,
    machineGatesPassed: Boolean(summary.machineGatesPassed),
    deliveryReady: Boolean(summary.deliveryReady),
    needsHumanReview: Boolean(summary.needsHumanReview),
    decision: summary.machineGatesPassed ? 'continue-to-human-review' : 'stop-and-fix',
    deckkit: summary.deckkit,
    slideCount: summary.slideCount,
    gates: {
      validateContent: { gate: gateStatus(validate), errors: validate?.errors ?? null },
      build: { gate: gateStatus(build), patchOps: build?.patchOps ?? null },
      checkLock: {
        gate: gateStatus(checkLock),
        errors: checkLock?.errors ?? null,
        warnings: checkLock?.warnings ?? null,
      },
      dryRun: {
        gate: gateStatus(dryRun),
        status: dryRun?.status ?? null,
        high: dryRun?.visualRisks?.high ?? null,
        medium: dryRun?.visualRisks?.medium ?? null,
      },
      apply: {
        gate: gateStatus(apply),
        status: apply?.status ?? null,
        outputExists: apply?.outputExists ?? null,
      },
      vision: {
        gate: gateStatus(vision),
        status: vision?.status ?? null,
        high: vision?.bySeverity?.high ?? null,
        medium: vision?.bySeverity?.medium ?? null,
      },
      preview: {
        gate: gateStatus(preview),
        pages: preview?.count ?? null,
        expectedPages: preview?.expectedCount ?? null,
        contactSheetBytes: preview?.contactSheetBytes ?? null,
      },
    },
    artifacts: {
      summary: summary.artifacts.summary,
      candidate: summary.artifacts.candidate,
      patch: summary.artifacts.patch,
      quality: summary.artifacts.quality,
      dryRun: summary.artifacts.dryRun,
      apply: summary.artifacts.apply,
      vision: summary.artifacts.vision,
      previewReport: summary.artifacts.previewReport,
      contactSheet: summary.artifacts.contactSheet,
    },
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

function runCapabilityProbe(summary, args, artifacts) {
  const report = runJsonPhase(summary, {
    name: 'xdoc-capability-probe',
    bin: process.execPath,
    args: [
      CAPABILITY_PROBE_SCRIPT,
      '--xdoc-bin',
      args.xdocBin,
      '--require-command',
      'pptx.apply',
      '--require-command',
      'pptx.vision-check',
      '--require-command',
      'pptx.preview',
      '--json',
    ],
    artifact: artifacts.capabilities,
  })
  if (report.status !== 'ready') {
    summary.warnings.push(
      'xdoc capability schema is degraded; runner continued and will rely on direct command results as gate evidence.',
    )
  }
}

function runValidation(summary, args, artifacts) {
  const report = runJsonPhase(summary, {
    name: 'validate-content',
    bin: process.execPath,
    args: [
      VALIDATE_CONTENT_SCRIPT,
      args.content,
      '--deckkit',
      args.deckkit,
      '--mode',
      'delivery',
      '--json',
    ],
    artifact: artifacts.validation,
  })
  requireGate(summary, 'validate-content', report?.valid === true, {
    errors: countArray(report?.errors),
    warnings: countArray(report?.warnings),
    fitDiagnostics: countArray(report?.fitDiagnostics),
    message: 'content validation must pass in delivery mode',
  })
  for (const warning of report?.warnings ?? []) {
    summary.warnings.push(`validate-content ${warning.type ?? 'warning'}: ${warning.message ?? ''}`)
  }
}

function runBuild(summary, args, artifacts) {
  runPlainPhase(summary, {
    name: 'build',
    bin: process.execPath,
    args: [
      BUILD_SCRIPT,
      '--deckkit',
      args.deckkit,
      args.content,
      '-o',
      artifacts.patch,
      '--quality-json',
      artifacts.quality,
    ],
  })
  const patch = readJson(artifacts.patch)
  const quality = readJson(artifacts.quality)
  requireGate(summary, 'build', Array.isArray(patch?.ops) && patch.ops.length > 0, {
    patchOps: patch?.ops?.length ?? 0,
    qualityStatus: quality?.status ?? null,
    message: 'DeckKit build must emit a patch with at least one op',
  })
  requireGate(summary, 'build-quality', quality?.status !== 'error', {
    status: quality?.status ?? null,
    errors: countArray(quality?.errors),
    warnings: countArray(quality?.warnings),
    message: 'Deck quality assessment must not be error',
  })
  for (const warning of quality?.warnings ?? []) {
    summary.warnings.push(`build-quality: ${warning.message ?? warning}`)
  }
}

function runCheckLock(summary, args, artifacts) {
  const checkArgs = [
    CHECK_LOCK_SCRIPT,
    '--lock',
    args.lock,
    '--content',
    args.content,
    '--patch',
    artifacts.patch,
    '--json',
  ]
  if (args.assets) checkArgs.push('--assets', args.assets)
  const report = runJsonPhase(summary, {
    name: 'check-lock',
    bin: process.execPath,
    args: checkArgs,
    artifact: artifacts.lockCheck,
  })
  requireGate(summary, 'check-lock', report?.valid === true, {
    errors: Number(report?.summary?.errors ?? report?.errors?.length ?? 0),
    warnings: Number(report?.summary?.warnings ?? report?.warnings?.length ?? 0),
    message: 'deck_lock/content/patch drift check must pass',
  })
  for (const warning of report?.warnings ?? []) {
    summary.warnings.push(`check-lock ${warning.code ?? 'warning'}: ${warning.message ?? ''}`)
  }
}

function runDryRun(summary, args, artifacts) {
  const report = runJsonPhase(summary, {
    name: 'dry-run',
    bin: args.xdocBin,
    args: [
      'pptx',
      'apply',
      '-p',
      artifacts.patch,
      '-o',
      artifacts.candidate,
      '--overwrite',
      '--dry-run',
      '--json',
    ],
    artifact: artifacts.dryRun,
  })
  const dryRun = summarizeApplyReport(report)
  requireGate(
    summary,
    'dry-run',
    report?.schemaVersion === 'pptx-dry-run/v1' &&
      dryRun.status === 'success' &&
      dryRun.visualRisks.high === 0 &&
      dryRun.visualRisks.medium === 0,
    {
      schemaVersion: report?.schemaVersion ?? '',
      ...dryRun,
      message: 'dry-run must succeed with no high/medium visual risks',
    },
  )
}

function runApply(summary, args, artifacts) {
  rmSync(artifacts.candidate, { force: true })
  const report = runJsonPhase(summary, {
    name: 'apply',
    bin: args.xdocBin,
    args: [
      'pptx',
      'apply',
      '-p',
      artifacts.patch,
      '-o',
      artifacts.candidate,
      '--overwrite',
      '--json',
    ],
    artifact: artifacts.apply,
  })
  const apply = summarizeApplyReport(report)
  const outputBytes = existsSync(artifacts.candidate) ? statSync(artifacts.candidate).size : 0
  requireGate(
    summary,
    'apply',
    report?.schemaVersion === 'pptx-apply/v1' &&
      apply.status === 'success' &&
      apply.visualRisks.high === 0 &&
      apply.visualRisks.medium === 0 &&
      outputBytes > 0,
    {
      schemaVersion: report?.schemaVersion ?? '',
      ...apply,
      outputExists: outputBytes > 0,
      outputBytes,
      message:
        'apply must succeed, keep high/medium visual risks at zero, and write candidate.pptx',
    },
  )
}

function runVision(summary, args, artifacts) {
  const report = runJsonPhase(summary, {
    name: 'vision-check',
    bin: args.xdocBin,
    args: ['pptx', 'vision-check', artifacts.candidate, '--json'],
    artifact: artifacts.vision,
  })
  const vision = summarizeVisionReport(report)
  requireGate(
    summary,
    'vision-check',
    report?.schemaVersion === 'pptx-vision/v1' &&
      (vision.status === 'pass' || vision.status === 'success') &&
      vision.bySeverity.high === 0 &&
      vision.bySeverity.medium === 0,
    {
      schemaVersion: report?.schemaVersion ?? '',
      ...vision,
      message: 'vision-check must pass with high=0 and medium=0',
    },
  )
}

function runPreview(summary, args, artifacts) {
  const report = runJsonPhase(summary, {
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
  const contactSheetName = basename(artifacts.contactSheet)
  const files = listPngFiles(artifacts.previews, new Set([contactSheetName]))
  const contactSheetBytes = existsSync(artifacts.contactSheet)
    ? statSync(artifacts.contactSheet).size
    : 0
  const manifestPages = Array.isArray(report?.pages) ? report.pages.length : 0
  const manifestPagesNonEmpty =
    !Array.isArray(report?.pages) || report.pages.every((page) => previewPageBytes(page) > 0)
  requireGate(
    summary,
    'png-previews',
    report?.schemaVersion === 'pptx-preview/v1' &&
      report?.status === 'success' &&
      summary.slideCount !== null &&
      files.length === summary.slideCount &&
      files.length > 0 &&
      files.every((file) => file.bytes > 0) &&
      manifestPages === summary.slideCount &&
      manifestPagesNonEmpty &&
      contactSheetBytes > 0,
    {
      manifestStatus: report?.status ?? null,
      count: files.length,
      expectedCount: summary.slideCount,
      manifestPages,
      allNonEmpty: files.every((file) => file.bytes > 0),
      manifestPagesNonEmpty,
      contactSheetBytes,
      files: files.map((file) => ({ name: file.name, bytes: file.bytes })),
      message:
        'preview must emit a successful manifest, one non-empty PNG per slide, and a non-empty contact sheet',
    },
  )
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
  const bytes = statSync(args.output).size
  addInternalPhase(summary, 'publish', 'passed', {
    durationMs: durationMs(start),
    output: args.output,
    bytes,
  })
  requireGate(summary, 'published-output', bytes > 0, {
    output: args.output,
    bytes,
    message: 'Published output is empty',
  })
}

function runCreate(inputArgs) {
  const { args, contentJson } = normalizeArgs(inputArgs)
  validatePaths(args)
  mkdirSync(args.runDir, { recursive: true })
  const artifacts = artifactPaths(args.runDir)
  const summary = initialSummary(args, contentJson, artifacts)

  try {
    runCapabilityProbe(summary, args, artifacts)
    runValidation(summary, args, artifacts)
    runBuild(summary, args, artifacts)
    runCheckLock(summary, args, artifacts)
    runDryRun(summary, args, artifacts)
    runApply(summary, args, artifacts)
    runVision(summary, args, artifacts)
    runPreview(summary, args, artifacts)
    publishCandidate(summary, args, artifacts)

    summary.status = 'needs-human-review'
    summary.machineGatesPassed = true
    summary.deliveryReady = false
    finalizeArtifactPaths(summary, artifacts.summary)
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
    summary.agentSummary = buildAgentSummary(summary)
    writeJson(artifacts.summary, summary)
    error.summary = summary
    throw error
  }
}

function printHuman(summary) {
  process.stdout.write(`PPTX create run: ${summary.status}\n`)
  process.stdout.write(`- deckkit: ${summary.deckkit}\n`)
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
  const summary = runCreate(parsedArgs)
  if (parsedArgs.json) process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
  else printHuman(summary)
} catch (error) {
  const summary = error.summary ?? {
    schemaVersion: 'pptx-nova-create-run/v1',
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
