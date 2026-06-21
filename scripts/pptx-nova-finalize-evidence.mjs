#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCHEMA_VERSION = 'pptx-nova-finalize-evidence/v1'
const LAYOUT_SCHEMA_VERSION = 'pptx-nova-layout-snapshot/v1'
const FIDELITY_SCHEMA_VERSION = 'pptx-nova-fidelity-gate/v1'
const SEMANTIC_AUDIT_SCHEMA_VERSION = 'pptx-nova-semantic-audit/v1'
const VISUAL_REVIEW_SCHEMA_VERSION = 'pptx-nova-visual-review/v1'
const STRUCTURE_CHECK_SCHEMA_VERSION = 'pptx-nova-structure-check/v1'
const LAYOUT_SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'pptx-nova-layout-snapshot.mjs')
const DISCLOSURE_ONLY_LAYOUT_CODES = new Set(['font-family-missing', 'font-size-missing'])
const MODES = {
  'studio-create': { vision: true, clearVision: true, fidelity: false },
  'reference-create': { vision: true, clearVision: true, fidelity: false },
  'structural-edit': { vision: true, clearVision: false, fidelity: false },
  'template-following': { vision: true, clearVision: false, fidelity: true },
  refurbish: { vision: false, clearVision: false, fidelity: true },
}

const usage = `Usage:
  node <skill-root>/scripts/pptx-nova-finalize-evidence.mjs [options]

Options:
  --mode <mode>             Required: studio-create, reference-create,
                            structural-edit, template-following, or refurbish.
  --run-dir <path>          Required existing current-run directory.
  --final-inspect <path>    Required final xdoc pptx inspect JSON.
  --vision <path>           vision.json. Required except for refurbish.
  --fidelity-gate <path>    Required for template-following and refurbish.
  --semantic-audit <path>   Optional chart/table semantic-audit.json. If omitted,
                            run-dir/semantic-audit.json is consumed when present.
  --visual-review <path>    Optional visual_review.json. If omitted,
                            run-dir/visual_review.json is consumed when present.
  --structure-check <path>  Optional structure-check.json. If omitted,
                            run-dir/structure-check.json is consumed when present.
  --json                    Print evidence-summary.json to stdout.
  --help                    Show this help.

Writes layout-final.json and evidence-summary.json inside --run-dir. This helper
does not run xdoc, replace mode-specific gates, judge visual taste, or apply to
Micro Edit.
`

function parseArgs(argv) {
  const args = {
    mode: '',
    runDir: '',
    finalInspect: '',
    vision: '',
    fidelityGate: '',
    semanticAudit: '',
    visualReview: '',
    structureCheck: '',
    json: false,
  }
  const flags = {
    '--mode': 'mode',
    '--run-dir': 'runDir',
    '--final-inspect': 'finalInspect',
    '--vision': 'vision',
    '--fidelity-gate': 'fidelityGate',
    '--semantic-audit': 'semanticAudit',
    '--visual-review': 'visualReview',
    '--structure-check': 'structureCheck',
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
    const key = flags[arg]
    const value = argv[index + 1]
    if (!key) throw new Error(`Unknown option: ${arg}\n\n${usage}`)
    if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`)
    args[key] = key === 'mode' ? value : resolve(value)
    index += 1
  }
  if (!Object.hasOwn(MODES, args.mode)) {
    throw new Error(`--mode must name a supported high-risk route\n\n${usage}`)
  }
  if (!args.runDir) throw new Error(`--run-dir is required\n\n${usage}`)
  if (!existsSync(args.runDir)) throw new Error(`--run-dir does not exist: ${args.runDir}`)
  if (!args.finalInspect) throw new Error(`--final-inspect is required\n\n${usage}`)
  if (!args.semanticAudit) {
    const defaultSemanticAudit = join(args.runDir, 'semantic-audit.json')
    if (existsSync(defaultSemanticAudit)) args.semanticAudit = defaultSemanticAudit
  }
  if (!args.visualReview) {
    const defaultVisualReview = join(args.runDir, 'visual_review.json')
    if (existsSync(defaultVisualReview)) args.visualReview = defaultVisualReview
  }
  if (!args.structureCheck) {
    const defaultStructureCheck = join(args.runDir, 'structure-check.json')
    if (existsSync(defaultStructureCheck)) args.structureCheck = defaultStructureCheck
  }
  return args
}

function makeReport(args) {
  return {
    schemaVersion: SCHEMA_VERSION,
    mode: args.mode,
    risk: 'high',
    status: 'pass',
    artifacts: {
      finalInspect: args.finalInspect,
      layoutFinal: join(args.runDir, 'layout-final.json'),
      vision: args.vision || null,
      fidelityGate: args.fidelityGate || null,
      semanticAudit: args.semanticAudit || null,
      visualReview: args.visualReview || null,
      structureCheck: args.structureCheck || null,
    },
    summary: {
      slideCount: null,
      objectCount: null,
      layoutRisks: { total: null, actionable: null, disclosureOnly: null },
      vision: null,
      semanticAudit: null,
      visualReview: null,
      structureCheck: null,
      errors: 0,
      warnings: 0,
    },
    checks: [],
    errors: [],
    warnings: [],
  }
}

function issue(report, level, code, message, details = {}) {
  report[level === 'error' ? 'errors' : 'warnings'].push({
    severity: level,
    code,
    message,
    ...details,
  })
}

function check(report, name, status, details = {}) {
  report.checks.push({ name, status, ...details })
}

function readJson(report, path, label) {
  if (!path || !existsSync(path)) {
    issue(report, 'error', `${label}-missing`, `${label} does not exist`, { path: path || null })
    return null
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    issue(report, 'error', `${label}-invalid`, `${label} is not valid JSON`, {
      path,
      error: error.message,
    })
    return null
  }
}

function number(value) {
  const result = Number(value)
  return Number.isFinite(result) ? result : null
}

function validateInspect(args, report) {
  const inspect = readJson(report, args.finalInspect, 'final-inspect')
  if (!inspect) return false
  const declared = number(inspect?.presentation?.slideCount)
  const slideCount = Number.isInteger(declared)
    ? declared
    : Array.isArray(inspect?.slides)
      ? inspect.slides.length
      : null
  const failed = inspect?.status !== 'success' || !Number.isInteger(slideCount) || slideCount <= 0
  if (inspect?.status !== 'success') {
    issue(report, 'error', 'final-inspect-failed', 'final inspect did not succeed', {
      status: inspect?.status ?? null,
    })
  }
  if (!Number.isInteger(slideCount) || slideCount <= 0) {
    issue(report, 'error', 'final-inspect-empty', 'final inspect has no slides', { slideCount })
  }
  if (inspect?.schemaVersion !== 'pptx-inspect/v1') {
    issue(
      report,
      'warning',
      'final-inspect-schema-undisclosed',
      'final inspect schema is unrecognized; disclosed structural fields were still consumed',
      { schemaVersion: inspect?.schemaVersion ?? null },
    )
  }
  check(report, 'final-inspect', failed ? 'failed' : 'passed', {
    schemaVersion: inspect?.schemaVersion ?? null,
    slideCount,
  })
  report.summary.slideCount = slideCount
  return !failed
}

function generateLayout(args, report) {
  const output = report.artifacts.layoutFinal
  const result = spawnSync(
    process.execPath,
    [LAYOUT_SCRIPT, '--inspect', args.finalInspect, '--output', output, '--json'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  )
  let layout = null
  try {
    layout = JSON.parse(result.stdout)
  } catch {
    issue(
      report,
      'error',
      'layout-snapshot-output-invalid',
      'layout snapshot returned invalid JSON',
      {
        exitCode: result.status,
        stderr: result.stderr.trim(),
      },
    )
  }
  const failed =
    result.status !== 0 ||
    layout?.status === 'fail' ||
    layout?.schemaVersion !== LAYOUT_SCHEMA_VERSION
  if (failed) {
    issue(report, 'error', 'layout-snapshot-failed', 'layout snapshot failed', {
      exitCode: result.status,
      schemaVersion: layout?.schemaVersion ?? null,
    })
  }
  const risks = Array.isArray(layout?.risks) ? layout.risks : []
  const total = number(layout?.summary?.riskCount) ?? risks.length
  const disclosureOnly = risks.filter((risk) => DISCLOSURE_ONLY_LAYOUT_CODES.has(risk?.code)).length
  const actionable = Math.max(0, total - disclosureOnly)
  if (actionable > 0) {
    issue(
      report,
      'warning',
      'layout-risks-recorded',
      'layout snapshot recorded actionable structural warnings for review',
      { total, actionable, disclosureOnly },
    )
  }
  check(report, 'layout-snapshot', failed ? 'failed' : actionable > 0 ? 'warning' : 'passed', {
    schemaVersion: layout?.schemaVersion ?? null,
    objectCount: layout?.summary?.objectCount ?? null,
    riskCount: total,
    actionableRiskCount: actionable,
    disclosureRiskCount: disclosureOnly,
  })
  report.summary.objectCount = layout?.summary?.objectCount ?? null
  report.summary.layoutRisks = { total, actionable, disclosureOnly }
}

function validateVision(args, config, report) {
  if (!args.vision) {
    if (config.vision) {
      issue(report, 'error', 'vision-evidence-missing', 'vision.json is required for this mode')
      check(report, 'vision-evidence', 'failed', { required: true })
    }
    return
  }
  const vision = readJson(report, args.vision, 'vision-evidence')
  if (!vision) return
  const counts = {
    high: number(vision?.summary?.bySeverity?.high),
    medium: number(vision?.summary?.bySeverity?.medium),
    low: number(vision?.summary?.bySeverity?.low),
  }
  let status = 'passed'
  if (Object.values(counts).some((value) => value === null || value < 0)) {
    status = 'failed'
    issue(
      report,
      'error',
      'vision-severity-counts-invalid',
      'vision report must disclose non-negative high, medium, and low counts',
      counts,
    )
  } else if (vision?.status !== 'success') {
    status = 'failed'
    issue(report, 'error', 'vision-report-failed', 'vision report did not succeed', {
      status: vision?.status ?? null,
    })
  } else if (config.clearVision && (counts.high > 0 || counts.medium > 0)) {
    status = 'failed'
    issue(
      report,
      'error',
      'vision-create-blocker',
      'new-deck workflows require zero high and medium vision issues',
      counts,
    )
  } else if (counts.high > 0 || counts.medium > 0) {
    status = 'warning'
    issue(
      report,
      'warning',
      'vision-residual-risk',
      'high/medium issues require changed-slide or inherited-risk review',
      counts,
    )
  }
  if (vision?.schemaVersion !== 'pptx-vision/v1') {
    issue(
      report,
      'warning',
      'vision-schema-undisclosed',
      'vision schema is unrecognized; disclosed status and severity fields were still consumed',
      { schemaVersion: vision?.schemaVersion ?? null },
    )
  }
  check(report, 'vision-evidence', status, {
    required: config.vision,
    schemaVersion: vision?.schemaVersion ?? null,
    ...counts,
  })
  report.summary.vision = counts
}

function validateFidelity(args, config, report) {
  if (!args.fidelityGate) {
    if (config.fidelity) {
      issue(
        report,
        'error',
        'fidelity-evidence-missing',
        'fidelity-gate.json is required for this mode',
      )
      check(report, 'fidelity-evidence', 'failed', { required: true })
    }
    return
  }
  const gate = readJson(report, args.fidelityGate, 'fidelity-evidence')
  if (!gate) return
  const expectedMode = args.mode === 'template-following' ? 'template-following' : 'refurbish'
  const validStatus = ['pass', 'warn', 'fail'].includes(gate?.status)
  const failed =
    gate?.schemaVersion !== FIDELITY_SCHEMA_VERSION ||
    !validStatus ||
    gate.status === 'fail' ||
    (config.fidelity && gate?.mode !== expectedMode)
  if (failed) {
    issue(report, 'error', 'fidelity-gate-invalid', 'fidelity gate is incompatible or failed', {
      schemaVersion: gate?.schemaVersion ?? null,
      mode: gate?.mode ?? null,
      status: gate?.status ?? null,
    })
  } else if (gate.status === 'warn') {
    issue(report, 'warning', 'fidelity-gate-warning', 'fidelity gate passed with warnings')
  }
  check(
    report,
    'fidelity-evidence',
    failed ? 'failed' : gate.status === 'warn' ? 'warning' : 'passed',
    {
      required: config.fidelity,
      schemaVersion: gate?.schemaVersion ?? null,
      mode: gate?.mode ?? null,
      gateStatus: gate?.status ?? null,
    },
  )
}

function validateSemanticAudit(args, report) {
  if (!args.semanticAudit) {
    check(report, 'chart-table-semantic-audit', 'not-run', { required: false })
    return
  }
  const audit = readJson(report, args.semanticAudit, 'semantic-audit')
  if (!audit) return
  const validStatus = ['pass', 'warn', 'fail'].includes(audit?.status)
  const counts = {
    charts: number(audit?.summary?.charts) ?? 0,
    tables: number(audit?.summary?.tables) ?? 0,
    errors: number(audit?.summary?.errors) ?? 0,
    warnings: number(audit?.summary?.warnings) ?? 0,
  }
  const failed =
    audit?.schemaVersion !== SEMANTIC_AUDIT_SCHEMA_VERSION ||
    !validStatus ||
    audit.status === 'fail' ||
    counts.errors > 0
  if (failed) {
    issue(
      report,
      'error',
      'semantic-audit-failed',
      'chart/table semantic audit failed or is incompatible',
      {
        schemaVersion: audit?.schemaVersion ?? null,
        status: audit?.status ?? null,
        ...counts,
      },
    )
  } else if (audit.status === 'warn' || counts.warnings > 0) {
    issue(
      report,
      'warning',
      'semantic-audit-warning',
      'chart/table semantic audit passed with warnings',
      {
        schemaVersion: audit?.schemaVersion ?? null,
        status: audit.status,
        ...counts,
      },
    )
  }
  check(
    report,
    'chart-table-semantic-audit',
    failed ? 'failed' : audit.status === 'warn' ? 'warning' : 'passed',
    {
      required: false,
      schemaVersion: audit?.schemaVersion ?? null,
      auditStatus: audit?.status ?? null,
      ...counts,
    },
  )
  report.summary.semanticAudit = counts
}

function validateVisualReview(args, report) {
  if (!args.visualReview) {
    check(report, 'structured-visual-review', 'not-run', { required: false })
    return
  }
  const review = readJson(report, args.visualReview, 'visual-review')
  if (!review) return
  const validStatus = ['pass', 'warn', 'fail'].includes(review?.status)
  const counts = {
    slidesReviewed: number(review?.summary?.slidesReviewed) ?? 0,
    checks: number(review?.summary?.checks?.total) ?? 0,
    errors: number(review?.summary?.errors) ?? 0,
    warnings: number(review?.summary?.warnings) ?? 0,
    issues: number(review?.summary?.issueCount) ?? 0,
  }
  const failed =
    review?.schemaVersion !== VISUAL_REVIEW_SCHEMA_VERSION ||
    !validStatus ||
    review.status === 'fail' ||
    counts.errors > 0
  if (failed) {
    issue(
      report,
      'error',
      'visual-review-failed',
      'structured visual review failed or is incompatible',
      {
        schemaVersion: review?.schemaVersion ?? null,
        status: review?.status ?? null,
        ...counts,
      },
    )
  } else if (review.status === 'warn' || counts.warnings > 0) {
    issue(
      report,
      'warning',
      'visual-review-warning',
      'structured visual review passed with warnings',
      {
        schemaVersion: review?.schemaVersion ?? null,
        status: review.status,
        ...counts,
      },
    )
  }
  check(
    report,
    'structured-visual-review',
    failed ? 'failed' : review.status === 'warn' ? 'warning' : 'passed',
    {
      required: false,
      schemaVersion: review?.schemaVersion ?? null,
      reviewStatus: review?.status ?? null,
      ...counts,
    },
  )
  report.summary.visualReview = counts
}

function validateStructureCheck(args, report) {
  if (!args.structureCheck) {
    check(report, 'pptx-xml-structure-check', 'not-run', { required: false })
    return
  }
  const structure = readJson(report, args.structureCheck, 'structure-check')
  if (!structure) return
  const validStatus = ['pass', 'warn', 'fail'].includes(structure?.status)
  const counts = {
    xmlFiles: number(structure?.summary?.xmlFiles) ?? 0,
    expectedFonts: number(structure?.summary?.expectedFonts) ?? 0,
    expectedColors: number(structure?.summary?.expectedColors) ?? 0,
    placeholderResidue: number(structure?.summary?.placeholders?.emptyOrDefaultText) ?? 0,
    errors: number(structure?.summary?.errors) ?? 0,
    warnings: number(structure?.summary?.warnings) ?? 0,
  }
  const failed =
    structure?.schemaVersion !== STRUCTURE_CHECK_SCHEMA_VERSION ||
    !validStatus ||
    structure.status === 'fail' ||
    counts.errors > 0
  if (failed) {
    issue(
      report,
      'error',
      'structure-check-failed',
      'PPTX XML structure check failed or is incompatible',
      {
        schemaVersion: structure?.schemaVersion ?? null,
        status: structure?.status ?? null,
        ...counts,
      },
    )
  } else if (structure.status === 'warn' || counts.warnings > 0) {
    issue(
      report,
      'warning',
      'structure-check-warning',
      'PPTX XML structure check passed with warnings',
      {
        schemaVersion: structure?.schemaVersion ?? null,
        status: structure.status,
        ...counts,
      },
    )
  }
  check(
    report,
    'pptx-xml-structure-check',
    failed ? 'failed' : structure.status === 'warn' ? 'warning' : 'passed',
    {
      required: false,
      schemaVersion: structure?.schemaVersion ?? null,
      checkStatus: structure?.status ?? null,
      ...counts,
    },
  )
  report.summary.structureCheck = counts
}

function finish(args, report) {
  report.summary.errors = report.errors.length
  report.summary.warnings = report.warnings.length
  report.status = report.errors.length > 0 ? 'fail' : report.warnings.length > 0 ? 'warn' : 'pass'
  const output = join(args.runDir, 'evidence-summary.json')
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
  if (args.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  else {
    process.stdout.write(`pptx-nova final evidence: ${report.status}\n`)
    process.stdout.write(`- mode: ${report.mode}\n`)
    process.stdout.write(`- slides: ${report.summary.slideCount}\n`)
    process.stdout.write(`- actionable layout risks: ${report.summary.layoutRisks.actionable}\n`)
    process.stdout.write(`- summary: ${output}\n`)
  }
  if (report.status === 'fail') process.exitCode = 1
}

try {
  const args = parseArgs(process.argv.slice(2))
  const report = makeReport(args)
  if (validateInspect(args, report)) generateLayout(args, report)
  validateVision(args, MODES[args.mode], report)
  validateFidelity(args, MODES[args.mode], report)
  validateSemanticAudit(args, report)
  validateVisualReview(args, report)
  validateStructureCheck(args, report)
  finish(args, report)
} catch (error) {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 1
}
