#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'

import {
  buildTranslationMemory,
  expandReviewInventory,
  materializeTranslations,
  mergeTranslationMemoryRepairs,
} from './lib/translation-memory.mjs'
import { createProgressReporter } from './pptx-nova-progress.mjs'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const PROBE_SCRIPT = join(SCRIPT_DIR, 'pptx-nova-probe.mjs')
const CLASSIFY_SCRIPT = join(SCRIPT_DIR, 'pptx-nova-i18n-classify-review-units.mjs')
const SUMMARY_SCHEMA = 'pptx-nova-translation-prepare/v1'
const RESULT_SCHEMA = 'pptx-nova-translation-prepare-result/v1'

const usage = `Usage:
  node <skill-root>/scripts/pptx-nova-translation-prepare.mjs --source <source.pptx> --source-lang <multi|zh|en> --target-lang <lang> --run-dir <run-dir> [options]

Options:
  --review-decisions <path>  Optional bound language-review decisions.
  --memory <path>            Translation memory to consume; defaults to run-dir/translation-memory.json.
  --expand-review <name>     Persist one lazy review partition: languageUncertain,
                             shared, embeddedWorkbook, or other.
  --output-candidate <path>  Prepared stable candidate; defaults to run-dir/candidate-prepared.pptx.
  --apply                    Materialize translations, plan, dry-run, and apply all generated artifacts.
  --xdoc-bin <path>          xdoc executable. Defaults to xdoc.
  --overwrite                Replace current-run generated outputs intentionally.
  --progress <mode>          Progress stream: auto|jsonl|text|off. Defaults to auto.
  --json                     Print compact Agent result.
  --json-full                Print the complete persisted run summary.
  --help                     Show this help.

Without --apply the runner scans/classifies and creates a deduplicated translation-memory template.
After filling targetText and required per-unit review overrides, rerun the same run directory with --apply.
`

const valueFlags = {
  '--source': 'source',
  '--source-lang': 'sourceLang',
  '--target-lang': 'targetLang',
  '--run-dir': 'runDir',
  '--review-decisions': 'reviewDecisions',
  '--memory': 'memory',
  '--expand-review': 'expandReview',
  '--output-candidate': 'outputCandidate',
  '--xdoc-bin': 'xdocBin',
  '--progress': 'progress',
}

function parseArgs(argv) {
  const args = {
    source: '',
    sourceLang: '',
    targetLang: '',
    runDir: '',
    reviewDecisions: '',
    memory: '',
    expandReview: '',
    outputCandidate: '',
    xdocBin: 'xdoc',
    apply: false,
    overwrite: false,
    progress: 'auto',
    json: false,
    jsonFull: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(usage)
      process.exit(0)
    }
    if (arg === '--apply') args.apply = true
    else if (arg === '--overwrite') args.overwrite = true
    else if (arg === '--json') args.json = true
    else if (arg === '--json-full') {
      args.json = true
      args.jsonFull = true
    } else {
      const key = valueFlags[arg]
      if (!key) throw new Error(`Unknown option: ${arg}\n\n${usage}`)
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`)
      args[key] = value
      index += 1
    }
  }
  for (const key of ['source', 'sourceLang', 'targetLang', 'runDir']) {
    if (!args[key])
      throw new Error(`--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)} is required`)
  }
  if (!['multi', 'zh', 'en'].includes(args.sourceLang)) {
    throw new Error('--source-lang must be multi, zh, or en')
  }
  if (
    args.expandReview &&
    !['languageUncertain', 'shared', 'embeddedWorkbook', 'other'].includes(args.expandReview)
  ) {
    throw new Error('--expand-review must be languageUncertain, shared, embeddedWorkbook, or other')
  }
  const cwd = process.cwd()
  args.source = resolve(cwd, args.source)
  args.runDir = resolve(cwd, args.runDir)
  args.reviewDecisions = args.reviewDecisions ? resolve(cwd, args.reviewDecisions) : ''
  args.memory = args.memory
    ? resolve(cwd, args.memory)
    : join(args.runDir, 'translation-memory.json')
  args.outputCandidate = args.outputCandidate
    ? resolve(cwd, args.outputCandidate)
    : join(args.runDir, 'candidate-prepared.pptx')
  args.xdocBin = /[\\/]/.test(args.xdocBin) ? resolve(cwd, args.xdocBin) : args.xdocBin
  return args
}

function artifactsFor(args) {
  return {
    capabilities: join(args.runDir, 'xdoc-capabilities.json'),
    scan: join(args.runDir, 'i18n-scan-source.json'),
    reviewDecisionsTemplate: join(args.runDir, 'i18n-review-decisions.template.json'),
    classifiedScan: join(args.runDir, 'i18n-scan-classified.json'),
    classificationReport: join(args.runDir, 'i18n-review-classification.json'),
    memory: args.memory,
    reviewInventory: args.expandReview
      ? join(args.runDir, `review-inventory-${args.expandReview}.json`)
      : null,
    memoryRepair: join(args.runDir, 'translation-memory.repair.json'),
    translations: join(args.runDir, 'translations.json'),
    plan: join(args.runDir, 'i18n-plan.json'),
    textPlan: join(args.runDir, 'i18n-text-plan-input.json'),
    replaceText: join(args.runDir, 'replace-text-input.json'),
    replaceChartText: join(args.runDir, 'replace-chart-text-input.json'),
    patch: join(args.runDir, 'patch.json'),
    chartDryRun: join(args.runDir, 'replace-chart-text-dry-run.json'),
    chartApply: join(args.runDir, 'replace-chart-text.json'),
    replaceTextReport: join(args.runDir, 'replace-text.json'),
    patchDryRun: join(args.runDir, 'patch-dry-run.json'),
    patchApply: join(args.runDir, 'patch-apply.json'),
    candidate: args.outputCandidate,
    summary: join(args.runDir, 'translation-prepare-summary.json'),
  }
}

function sha256(path) {
  return `sha256:${createHash('sha256').update(readFileSync(path)).digest('hex')}`
}

function readJson(path, label) {
  if (!existsSync(path)) throw new Error(`${label} does not exist: ${path}`)
  return JSON.parse(readFileSync(path, 'utf8'))
}

function writeJson(path, value, overwrite = false) {
  if (existsSync(path) && !overwrite) throw new Error(`Output already exists: ${path}`)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function executable(bin, args) {
  if (['.js', '.mjs', '.cjs'].includes(extname(bin).toLowerCase()) && existsSync(bin)) {
    return { bin: process.execPath, args: [bin, ...args] }
  }
  return { bin, args }
}

function runCommand(bin, args, { allowFailure = false } = {}) {
  const command = executable(bin, args)
  const result = spawnSync(command.bin, command.args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  if (result.error) throw result.error
  const stdout = result.stdout ?? ''
  const stderr = result.stderr ?? ''
  let json = null
  if (stdout.trim()) {
    try {
      json = JSON.parse(stdout)
    } catch (error) {
      throw new Error(`${basename(command.bin)} returned invalid JSON: ${error.message}`)
    }
  }
  if (!allowFailure && result.status !== 0) {
    throw new Error(
      stderr.trim() || json?.error?.message || `${basename(command.bin)} exited ${result.status}`,
    )
  }
  return { status: result.status, json, stderr }
}

function phase(summary, reporter, name, action) {
  const started = performance.now()
  reporter.emit('phase-start', { phase: name })
  try {
    const value = action()
    summary.phases.push({
      name,
      status: 'pass',
      durationMs: Math.round(performance.now() - started),
    })
    reporter.emit('phase-complete', { phase: name, status: 'pass' })
    return value
  } catch (error) {
    summary.phases.push({
      name,
      status: 'error',
      durationMs: Math.round(performance.now() - started),
      message: error.message,
    })
    error.phase = name
    throw error
  }
}

function runProbe(args, artifacts, summary, reporter) {
  phase(summary, reporter, 'xdoc-probe', () =>
    runCommand(process.execPath, [
      PROBE_SCRIPT,
      '--xdoc-bin',
      args.xdocBin,
      '--output',
      artifacts.capabilities,
      ...(existsSync(artifacts.capabilities) ? ['--overwrite'] : []),
      '--json',
    ]),
  )
}

function runXdocReport(
  args,
  reportPath,
  commandArgs,
  { allowFailure = false, expectedSchema } = {},
) {
  const temporary = `${reportPath}.${process.pid}.${randomUUID()}.tmp`
  const flags = [...commandArgs, '--output', temporary, '--json']
  try {
    const result = runCommand(args.xdocBin, flags, { allowFailure })
    if (!existsSync(temporary)) {
      throw new Error(`xdoc did not persist a current report: ${reportPath}`)
    }
    const full = readJson(temporary, 'current xdoc report')
    if (expectedSchema && full?.schemaVersion !== expectedSchema) {
      throw new Error(
        `xdoc current report schema must be ${expectedSchema}, got ${full?.schemaVersion ?? 'missing'}`,
      )
    }
    mkdirSync(dirname(reportPath), { recursive: true })
    renameSync(temporary, reportPath)
    const compact = result.json ? { ...result.json, report: reportPath } : result.json
    return { compact, full, status: result.status }
  } finally {
    rmSync(temporary, { force: true })
  }
}

function requiredReference(path, section, reason) {
  return { path, section, reason }
}

function languageReviewUnits(scan) {
  return (scan?.i18nUnits?.units ?? []).filter(
    (unit) =>
      unit.action === 'review' &&
      unit.requiresReview === true &&
      ['visibleBody', 'visibleTextAttr', 'chartVisibleCache'].includes(unit.category) &&
      unit.notes?.includes?.('language-classification-uncertain'),
  )
}

function writeReviewDecisionTemplate(scanPath, scan, output, overwrite) {
  const decisions = languageReviewUnits(scan).map((unit) => ({
    unitId: unit.unitId,
    sourceHash: unit.sourceHash,
    sourceText: unit.sourceText,
    decision: null,
    reason: '',
    context: {
      category: unit.category,
      part: unit.part ?? null,
      slide: unit.slide ?? null,
      detectedLangs: unit.detectedLangs ?? [],
    },
  }))
  writeJson(
    output,
    {
      schemaVersion: 'pptx-nova-i18n-review-decisions/v1',
      scanSha256: sha256(scanPath),
      decisions,
    },
    overwrite,
  )
  return decisions.length
}

function classifyIfNeeded(args, artifacts, scan, summary, reporter) {
  const reviewCount = languageReviewUnits(scan).length
  if (reviewCount === 0) return { path: artifacts.scan, scan }
  if (!args.reviewDecisions) {
    if (
      args.apply &&
      existsSync(artifacts.classifiedScan) &&
      existsSync(artifacts.classificationReport)
    ) {
      const prior = readJson(artifacts.classificationReport, 'review classification')
      if (
        prior?.agentGate?.passed === true &&
        prior.scanSha256 === sha256(artifacts.scan) &&
        resolve(prior.output) === artifacts.classifiedScan
      ) {
        return {
          path: artifacts.classifiedScan,
          scan: readJson(artifacts.classifiedScan, 'classified scan'),
        }
      }
    }
    phase(summary, reporter, 'review-decisions-template', () =>
      writeReviewDecisionTemplate(
        artifacts.scan,
        scan,
        artifacts.reviewDecisionsTemplate,
        args.overwrite,
      ),
    )
    return { path: null, scan: null, reviewCount }
  }
  const result = phase(summary, reporter, 'classify-review-units', () =>
    runCommand(process.execPath, [
      CLASSIFY_SCRIPT,
      '--scan',
      artifacts.scan,
      '--decisions',
      args.reviewDecisions,
      '--output',
      artifacts.classifiedScan,
      '--report',
      artifacts.classificationReport,
      '--overwrite',
      '--json',
    ]),
  )
  if (result.json?.agentGate?.passed !== true) throw new Error('review classification did not pass')
  return {
    path: artifacts.classifiedScan,
    scan: readJson(artifacts.classifiedScan, 'classified scan'),
  }
}

function initialSummary(args, artifacts) {
  return {
    schemaVersion: SUMMARY_SCHEMA,
    status: 'running',
    source: { path: args.source, sha256: sha256(args.source) },
    sourceLang: args.sourceLang,
    targetLang: args.targetLang,
    runDir: args.runDir,
    mode: args.apply ? 'apply' : 'inventory',
    artifacts,
    phases: [],
    inventory: null,
    memory: null,
    plan: null,
    candidate: null,
    nextAction: null,
    resumeStage: null,
    requiredReferences: [],
    error: null,
  }
}

function prepareInventory(args, artifacts, summary, reporter) {
  const scanResult = phase(summary, reporter, 'i18n-scan-source', () =>
    runXdocReport(
      args,
      artifacts.scan,
      [
        'pptx',
        'i18n-scan',
        '--source',
        args.source,
        '--source-lang',
        args.sourceLang,
        '--mode',
        'source',
      ],
      { expectedSchema: 'pptx-i18n-scan/v1' },
    ),
  )
  const scan = scanResult.full
  if (args.expandReview) {
    phase(summary, reporter, 'expand-review-inventory', () =>
      writeJson(
        artifacts.reviewInventory,
        {
          ...expandReviewInventory(scan, args.expandReview),
          source: summary.source,
          scan: { path: artifacts.scan, sha256: sha256(artifacts.scan) },
        },
        args.overwrite,
      ),
    )
  }
  const classified = classifyIfNeeded(args, artifacts, scan, summary, reporter)
  if (!classified.path) {
    summary.status = 'needs-review-decisions'
    summary.resumeStage = 'review-decisions'
    summary.inventory = scanResult.compact?.inventory ?? null
    summary.nextAction =
      'Fill the bound review decisions template, then rerun this command with --review-decisions.'
    summary.requiredReferences = [
      requiredReference(
        'references/translation-mode.md',
        'Chart And Table Coverage',
        'Classify the bound language-review partition before translation.',
      ),
    ]
    return null
  }
  return classified
}

function buildMemory(args, artifacts, summary, classified, reporter) {
  const memory = buildTranslationMemory(classified.scan, {
    sourceSha256: summary.source.sha256,
    unitsSha256: sha256(classified.path),
    targetLang: args.targetLang,
  })
  phase(summary, reporter, 'translation-memory', () =>
    writeJson(artifacts.memory, memory, args.overwrite),
  )
  summary.memory = memory.summary
  summary.inventory = memory.reviewPartitions
  summary.status = 'needs-translations'
  summary.nextAction =
    'Fill entries[].targetText and required unitOverrides, then rerun the same command with --apply.'
  summary.requiredReferences = [
    requiredReference(
      'references/translation-mode.md',
      'Translation Quality Rules',
      'Fill unique target text and only the necessary unit-level overrides.',
    ),
  ]
  return memory
}

function validateMemoryBinding(args, classified, memory, summary) {
  if (memory?.source?.sha256 !== summary.source.sha256) {
    throw new Error('translation memory source SHA-256 does not match the current source')
  }
  const unitsHash = sha256(classified.path)
  if (memory?.units?.sha256 !== unitsHash) {
    throw new Error('translation memory units SHA-256 does not match the current classified scan')
  }
  if (memory.sourceLang !== classified.scan.sourceLang || memory.targetLang !== args.targetLang) {
    throw new Error('translation memory language contract does not match the current run')
  }
}

function materializePlanArtifacts(plan, artifacts, overwrite) {
  writeJson(artifacts.textPlan, plan.textPlan, overwrite)
  writeJson(artifacts.replaceText, plan.replaceText, overwrite)
  writeJson(artifacts.replaceChartText, plan.replaceChartText, overwrite)
  writeJson(artifacts.patch, plan.patch, overwrite)
}

function countItems(value, key) {
  return Array.isArray(value?.[key]) ? value[key].length : 0
}

function runJsonArtifact(bin, commandArgs, artifact, overwrite) {
  if (existsSync(artifact) && !overwrite) throw new Error(`Output already exists: ${artifact}`)
  const result = runCommand(bin, commandArgs)
  writeJson(artifact, result.json, overwrite)
  return result.json
}

function applyPlan(args, artifacts, summary, classified, memory, reporter) {
  validateMemoryBinding(args, classified, memory, summary)
  const translations = phase(summary, reporter, 'materialize-translations', () => {
    const value = materializeTranslations(classified.scan, memory)
    writeJson(artifacts.translations, value, args.overwrite)
    return value
  })
  const planResult = phase(summary, reporter, 'i18n-plan', () =>
    runXdocReport(
      args,
      artifacts.plan,
      [
        'pptx',
        'i18n-plan',
        '--source',
        args.source,
        '--units',
        classified.path,
        '--data',
        artifacts.translations,
      ],
      { allowFailure: true, expectedSchema: 'pptx-i18n-plan/v1' },
    ),
  )
  summary.plan = {
    status: planResult.full.status,
    summary: planResult.full.summary,
    applyGate: planResult.full.applyGate,
  }
  if (planResult.full?.applyGate?.passed !== true) {
    const repairedMemory = mergeTranslationMemoryRepairs(memory, planResult.full)
    if (repairedMemory.repairScaffold.unitCount > 0) {
      phase(summary, reporter, 'target-segments-repair-scaffold', () =>
        writeJson(artifacts.memoryRepair, repairedMemory, args.overwrite),
      )
      summary.status = 'needs-target-segments'
      summary.nextAction = repairedMemory.repairScaffold.instructions
    } else {
      summary.status = 'needs-plan-repair'
      summary.nextAction =
        planResult.compact?.nextAction ?? 'Repair the blocking plan items and rerun.'
    }
    summary.requiredReferences = [
      requiredReference(
        'references/translation-mode.md',
        'I18n Plan Gate',
        'Repair only the blocker class emitted by the current bound plan.',
      ),
    ]
    return
  }
  phase(summary, reporter, 'materialize-plan-artifacts', () =>
    materializePlanArtifacts(planResult.full, artifacts, args.overwrite),
  )

  let current = join(args.runDir, 'candidate-00-source.pptx')
  phase(summary, reporter, 'copy-source-candidate', () => {
    if (existsSync(current) && !args.overwrite) throw new Error(`Output already exists: ${current}`)
    copyFileSync(args.source, current)
  })
  let stage = 1
  const nextCandidate = (label) =>
    join(args.runDir, `candidate-${String(stage++).padStart(2, '0')}-${label}.pptx`)

  if (countItems(planResult.full.replaceChartText, 'replacements') > 0) {
    const output = nextCandidate('chart')
    phase(summary, reporter, 'replace-chart-text-dry-run', () =>
      runJsonArtifact(
        args.xdocBin,
        [
          'pptx',
          'replace-chart-text',
          '--source',
          current,
          '--data',
          artifacts.replaceChartText,
          '--output',
          output,
          '--visible-cache-only',
          '--dry-run',
          '--json',
        ],
        artifacts.chartDryRun,
        args.overwrite,
      ),
    )
    phase(summary, reporter, 'replace-chart-text-apply', () =>
      runJsonArtifact(
        args.xdocBin,
        [
          'pptx',
          'replace-chart-text',
          '--source',
          current,
          '--data',
          artifacts.replaceChartText,
          '--output',
          output,
          '--visible-cache-only',
          ...(args.overwrite ? ['--overwrite'] : []),
          '--json',
        ],
        artifacts.chartApply,
        args.overwrite,
      ),
    )
    current = output
  }

  if (countItems(planResult.full.replaceText, 'replacements') > 0) {
    const output = nextCandidate('replace-text')
    phase(summary, reporter, 'replace-text-apply', () =>
      runJsonArtifact(
        args.xdocBin,
        [
          'pptx',
          'replace-text',
          '--source',
          current,
          '--data',
          artifacts.replaceText,
          '--output',
          output,
          ...(args.overwrite ? ['--overwrite'] : []),
          '--json',
        ],
        artifacts.replaceTextReport,
        args.overwrite,
      ),
    )
    current = output
  }

  if (countItems(planResult.full.patch, 'ops') > 0) {
    const output = nextCandidate('patch')
    phase(summary, reporter, 'patch-dry-run', () =>
      runJsonArtifact(
        args.xdocBin,
        [
          'pptx',
          'apply',
          '--input',
          current,
          '--patch',
          artifacts.patch,
          '--output',
          output,
          '--dry-run',
          '--json',
        ],
        artifacts.patchDryRun,
        args.overwrite,
      ),
    )
    phase(summary, reporter, 'patch-apply', () =>
      runJsonArtifact(
        args.xdocBin,
        [
          'pptx',
          'apply',
          '--input',
          current,
          '--patch',
          artifacts.patch,
          '--output',
          output,
          ...(args.overwrite ? ['--overwrite'] : []),
          '--json',
        ],
        artifacts.patchApply,
        args.overwrite,
      ),
    )
    current = output
  }

  phase(summary, reporter, 'publish-prepared-candidate', () => {
    if (existsSync(artifacts.candidate) && !args.overwrite) {
      throw new Error(`Output already exists: ${artifacts.candidate}`)
    }
    mkdirSync(dirname(artifacts.candidate), { recursive: true })
    copyFileSync(current, artifacts.candidate)
  })
  summary.candidate = {
    path: artifacts.candidate,
    sha256: sha256(artifacts.candidate),
    byteLength: statSync(artifacts.candidate).size,
  }
  summary.status = 'prepared'
  summary.nextAction = 'Run the standard translation finalizer with this stable candidate.'
  summary.requiredReferences = [
    requiredReference(
      'references/translation-runner.md',
      'Standard command',
      'Finalize and publish the stable prepared candidate with delivery gates.',
    ),
  ]
  summary.translationCount = translations.translations.length
}

function compactResult(summary) {
  const phasePassed = (name) =>
    summary.phases?.some((entry) => entry.name === name && entry.status === 'pass') === true
  return {
    schemaVersion: RESULT_SCHEMA,
    status: summary.status,
    runDir: summary.runDir,
    source: summary.source,
    summary: {
      memory: summary.memory,
      inventory: summary.inventory,
      plan: summary.plan,
      translationCount: summary.translationCount ?? null,
    },
    artifacts: {
      summary: summary.artifacts.summary,
      scan:
        phasePassed('i18n-scan-source') && existsSync(summary.artifacts.scan)
          ? summary.artifacts.scan
          : null,
      reviewInventory:
        phasePassed('expand-review-inventory') &&
        summary.artifacts.reviewInventory &&
        existsSync(summary.artifacts.reviewInventory)
          ? summary.artifacts.reviewInventory
          : null,
      classifiedScan:
        phasePassed('classify-review-units') && existsSync(summary.artifacts.classifiedScan)
          ? summary.artifacts.classifiedScan
          : null,
      reviewDecisionsTemplate:
        phasePassed('review-decisions-template') &&
        existsSync(summary.artifacts.reviewDecisionsTemplate)
          ? summary.artifacts.reviewDecisionsTemplate
          : null,
      memory:
        (phasePassed('translation-memory') || (summary.mode === 'apply' && summary.memory)) &&
        existsSync(summary.artifacts.memory)
          ? summary.artifacts.memory
          : null,
      memoryRepair:
        phasePassed('target-segments-repair-scaffold') && existsSync(summary.artifacts.memoryRepair)
          ? summary.artifacts.memoryRepair
          : null,
      translations:
        phasePassed('materialize-translations') && existsSync(summary.artifacts.translations)
          ? summary.artifacts.translations
          : null,
      plan:
        phasePassed('i18n-plan') && summary.plan && existsSync(summary.artifacts.plan)
          ? summary.artifacts.plan
          : null,
      candidate:
        summary.status === 'prepared' &&
        summary.candidate?.path === summary.artifacts.candidate &&
        existsSync(summary.artifacts.candidate)
          ? summary.artifacts.candidate
          : null,
    },
    nextAction: summary.nextAction,
    requiredReferences: summary.requiredReferences,
    error: summary.error,
  }
}

function validateRun(args, artifacts) {
  if (!existsSync(args.source) || !statSync(args.source).isFile()) {
    throw new Error(`source does not exist or is not a file: ${args.source}`)
  }
  if (extname(args.source).toLowerCase() !== '.pptx') throw new Error('--source must be .pptx')
  if (extname(args.outputCandidate).toLowerCase() !== '.pptx') {
    throw new Error('--output-candidate must be .pptx')
  }
  if (extname(args.memory).toLowerCase() !== '.json') {
    throw new Error('--memory must be .json')
  }
  const pathIdentity = (path) => {
    const resolved = resolve(path)
    if (!existsSync(resolved)) return { path: resolved, device: null, inode: null }
    const state = statSync(resolved)
    return { path: realpathSync(resolved), device: state.dev, inode: state.ino }
  }
  const sameIdentity = (left, right) =>
    left.path === right.path ||
    (left.device !== null &&
      right.device !== null &&
      left.device === right.device &&
      left.inode === right.inode)
  if (args.apply) {
    if (!existsSync(args.runDir) || !statSync(args.runDir).isDirectory()) {
      throw new Error('--apply requires the existing preparation run directory')
    }
    if (!existsSync(artifacts.summary)) {
      throw new Error('--apply requires the prior preparation summary')
    }
    const prior = readJson(artifacts.summary, 'prior preparation summary')
    if (
      prior.schemaVersion !== SUMMARY_SCHEMA ||
      prior.source?.sha256 !== sha256(args.source) ||
      prior.sourceLang !== args.sourceLang ||
      prior.targetLang !== args.targetLang ||
      resolve(prior.runDir ?? '') !== args.runDir
    ) {
      throw new Error(
        '--apply source, languages, and run directory must match the prior preparation run',
      )
    }
  }
  const readOnlyInputs = [
    ['source', args.source],
    ...(args.reviewDecisions ? [['reviewDecisions', args.reviewDecisions]] : []),
    ...(args.apply ? [['memory', args.memory]] : []),
  ]
  const writableArtifacts = Object.entries(artifacts).filter(
    ([label, path]) =>
      typeof path === 'string' &&
      !(args.apply && label === 'memory') &&
      !(args.reviewDecisions && label === 'reviewDecisionsTemplate'),
  )
  for (const [outputLabel, outputPath] of writableArtifacts) {
    for (const [inputLabel, inputPath] of readOnlyInputs) {
      if (sameIdentity(pathIdentity(inputPath), pathIdentity(outputPath))) {
        throw new Error(
          `${outputLabel} output must not resolve to the read-only ${inputLabel} input`,
        )
      }
    }
  }
  for (let left = 0; left < writableArtifacts.length; left += 1) {
    for (let right = left + 1; right < writableArtifacts.length; right += 1) {
      const [leftLabel, leftPath] = writableArtifacts[left]
      const [rightLabel, rightPath] = writableArtifacts[right]
      if (sameIdentity(pathIdentity(leftPath), pathIdentity(rightPath))) {
        throw new Error(`${leftLabel} and ${rightLabel} outputs must be distinct`)
      }
    }
  }
  if (!args.apply && existsSync(args.runDir) && readdirSync(args.runDir).length > 0) {
    if (!args.reviewDecisions || !existsSync(artifacts.summary)) {
      throw new Error('inventory run directory must be new or a bound review-decision resume')
    }
    const prior = readJson(artifacts.summary, 'prior preparation summary')
    if (
      !(prior.status === 'needs-review-decisions' || prior.resumeStage === 'review-decisions') ||
      prior.source?.sha256 !== sha256(args.source) ||
      prior.sourceLang !== args.sourceLang ||
      prior.targetLang !== args.targetLang
    ) {
      throw new Error('review-decision resume does not match the prior preparation run')
    }
  } else {
    mkdirSync(args.runDir, { recursive: true })
  }
}

async function main(args, reporter) {
  const artifacts = artifactsFor(args)
  validateRun(args, artifacts)
  const summary = initialSummary(args, artifacts)
  const started = performance.now()
  try {
    runProbe(args, artifacts, summary, reporter)
    const classified = prepareInventory(args, artifacts, summary, reporter)
    if (classified) {
      if (args.apply) {
        const memory = readJson(artifacts.memory, 'translation memory')
        summary.memory = memory.summary ?? null
        summary.inventory = memory.reviewPartitions ?? null
        applyPlan(args, artifacts, summary, classified, memory, reporter)
      } else {
        buildMemory(args, artifacts, summary, classified, reporter)
      }
    }
  } catch (error) {
    summary.status = 'error'
    if (!args.apply && args.reviewDecisions) summary.resumeStage = 'review-decisions'
    summary.error = { phase: error.phase ?? null, message: error.message }
    summary.nextAction =
      'Inspect the persisted summary and the named phase artifact before retrying.'
  }
  summary.durationMs = Math.round(performance.now() - started)
  writeJson(artifacts.summary, summary, true)
  const output = args.jsonFull ? summary : compactResult(summary)
  if (args.json) process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
  else
    process.stdout.write(
      `Translation preparation ${summary.status}: ${artifacts.summary}${summary.candidate ? `\nCandidate: ${summary.candidate.path}` : ''}\n`,
    )
  if (summary.status === 'error') process.exitCode = 1
}

let args = null
try {
  args = parseArgs(process.argv.slice(2))
  const reporter = createProgressReporter({
    mode: args.progress,
    jsonOutput: args.json,
    context: { tool: 'pptx-nova-translation-prepare' },
  })
  await main(args, reporter)
} catch (error) {
  const failure = {
    schemaVersion: RESULT_SCHEMA,
    status: 'error',
    error: { phase: null, message: error.message },
  }
  if (args?.json || process.argv.includes('--json') || process.argv.includes('--json-full')) {
    process.stdout.write(`${JSON.stringify(failure, null, 2)}\n`)
  } else {
    process.stderr.write(`${error.message}\n`)
  }
  process.exitCode = 1
}
