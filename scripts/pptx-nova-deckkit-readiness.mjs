#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SKILL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const WORK_ROOT = process.cwd()
const VISUAL_ROOT = join(SKILL_ROOT, 'benchmarks/visual')
const CATALOG_PATH = join(SKILL_ROOT, 'assets/deckkits/catalog.json')
const DEFAULT_OUT = join(WORK_ROOT, '.tmp/pptx-nova-visual')
const REQUIRED_KINDS = ['golden', 'stress', 'mixed-language']
const READINESS = ['experimental', 'candidate', 'production', 'default']

const usage = `Usage:
  node <skill-root>/scripts/pptx-nova-deckkit-readiness.mjs --deckkit <id> [options]

Options:
  --deckkit <id>          DeckKit id to audit
  --out <dir>             Benchmark output directory. Defaults to <cwd>/.tmp/pptx-nova-visual
  --target <level>        candidate|delivery|default. Defaults to candidate
  --json                  Print machine-readable audit result
  --help                  Show this help

Run the benchmark first:
  node <skill-root>/scripts/pptx-nova-deckkit-benchmark.mjs --deckkit consulting-dark --all --repeat 3 --clean
`

function parseArgs(argv) {
  const args = {
    deckkit: '',
    out: DEFAULT_OUT,
    target: 'candidate',
    json: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(usage)
      process.exit(0)
    } else if (arg === '--json') {
      args.json = true
    } else if (arg === '--deckkit') {
      args.deckkit = valueAfter(argv, i, arg)
      i += 1
    } else if (arg === '--out') {
      args.out = resolve(valueAfter(argv, i, arg))
      i += 1
    } else if (arg === '--target') {
      args.target = valueAfter(argv, i, arg)
      i += 1
    } else {
      throw new Error(`Unknown option: ${arg}\n\n${usage}`)
    }
  }

  if (!args.deckkit) throw new Error(`--deckkit is required.\n\n${usage}`)
  if (!['candidate', 'delivery', 'default'].includes(args.target)) {
    throw new Error('--target must be one of candidate|delivery|default')
  }
  return args
}

function valueAfter(argv, index, flag) {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function caseSlug(benchCase) {
  return benchCase.id.includes('.') ? benchCase.id.split('.').slice(1).join('.') : benchCase.id
}

function summaryPathFor(outDir, benchCase) {
  return join(outDir, benchCase.deckkit, caseSlug(benchCase), 'summary.json')
}

function countFitErrors(summary) {
  return (summary?.validation?.fitDiagnostics ?? []).filter((d) => d.severity === 'error').length
}

function artifactBytes(path) {
  if (!path || typeof path !== 'string') return 0
  const absolutePath = resolve(WORK_ROOT, path)
  if (!existsSync(absolutePath)) return 0
  return statSync(absolutePath).size
}

function auditPreviewArtifacts(summary) {
  const previews = summary.previews
  if (!previews || typeof previews !== 'object') return null
  const files = Array.isArray(previews.files) ? previews.files : []
  const artifactFiles = files.map((file) => {
    const path = typeof file === 'string' ? file : file.path
    const bytes = artifactBytes(path)
    return {
      path,
      exists: bytes > 0,
      bytes,
    }
  })
  return {
    ...previews,
    artifactCount: artifactFiles.length,
    artifactFilesExist: artifactFiles.length > 0 && artifactFiles.every((file) => file.exists),
    artifactFilesNonEmpty:
      artifactFiles.length > 0 && artifactFiles.every((file) => file.bytes > 0),
    artifactFiles,
  }
}

function auditContactSheetArtifact(summary) {
  const contactSheet = summary.contactSheet
  if (!contactSheet || typeof contactSheet !== 'object') return null
  const bytes = artifactBytes(contactSheet.path)
  return {
    ...contactSheet,
    artifactExists: bytes > 0,
    artifactBytes: bytes,
    artifactNonEmpty: bytes > 0,
  }
}

function auditBenchmarkCases({ index, outDir, deckkit }) {
  const deckkitCases = index.cases.filter((benchCase) => benchCase.deckkit === deckkit)
  const cases = []
  const benchmarkBlockers = []

  for (const kind of REQUIRED_KINDS) {
    const benchCase = deckkitCases.find((candidate) => candidate.kind === kind)
    if (!benchCase) {
      benchmarkBlockers.push(`missing ${kind} case in visual benchmark index`)
      cases.push({ kind, caseId: '', summaryPath: '', exists: false, passed: false })
      continue
    }

    const summaryPath = summaryPathFor(outDir, benchCase)
    if (!existsSync(summaryPath)) {
      benchmarkBlockers.push(`missing summary for ${benchCase.id}; run benchmark first`)
      cases.push({
        kind,
        caseId: benchCase.id,
        summaryPath: relative(WORK_ROOT, summaryPath),
        exists: false,
        passed: false,
      })
      continue
    }

    const summary = readJson(summaryPath)
    const passed = summary.gate?.passed === true
    const errors = summary.validation?.errors?.length ?? 0
    const warnings = summary.validation?.warnings?.length ?? 0
    const fitDiagnostics = summary.validation?.fitDiagnostics?.length ?? 0
    const fitErrors = countFitErrors(summary)
    const skipped = summary.skipped ?? {}
    const previews = auditPreviewArtifacts(summary)
    const contactSheet = auditContactSheetArtifact(summary)

    if (!passed) benchmarkBlockers.push(`${benchCase.id} gate did not pass`)
    if (errors > 0) benchmarkBlockers.push(`${benchCase.id} has ${errors} validation error(s)`)
    if (fitErrors > 0) benchmarkBlockers.push(`${benchCase.id} has ${fitErrors} fit error(s)`)
    if (!previews?.enabled) {
      benchmarkBlockers.push(`${benchCase.id} PNG preview gate is missing or disabled`)
    } else {
      if (previews.countEqualsSlides !== true) {
        benchmarkBlockers.push(`${benchCase.id} PNG preview count does not match slide count`)
      }
      if (previews.artifactFilesNonEmpty !== true) {
        benchmarkBlockers.push(`${benchCase.id} PNG preview artifact(s) are missing or empty`)
      }
    }
    if (!contactSheet?.enabled) {
      benchmarkBlockers.push(`${benchCase.id} contact-sheet gate is missing or disabled`)
    } else if (contactSheet.artifactNonEmpty !== true) {
      benchmarkBlockers.push(`${benchCase.id} contact sheet is missing or empty`)
    }

    cases.push({
      kind,
      caseId: benchCase.id,
      summaryPath: relative(WORK_ROOT, summaryPath),
      exists: true,
      passed,
      errors,
      warnings,
      fitDiagnostics,
      fitErrors,
      skipped: {
        dryRun: skipped.dryRun === true,
        apply: skipped.apply === true,
        vision: skipped.vision === true,
        previews: skipped.previews === true,
        contactSheet: skipped.contactSheet === true,
      },
      dryRun: summary.dryRun ?? null,
      apply: summary.apply ?? null,
      vision: summary.vision ?? null,
      previews,
      contactSheet,
      patchOps: summary.patch?.ops ?? 0,
      p50TotalMs: summary.timing?.p50?.totalMs ?? null,
    })
  }

  return { cases, benchmarkBlockers }
}

function auditCatalog(entry) {
  const blockers = []
  const warnings = []
  const readiness = entry?.readiness ?? ''
  const quality = entry?.quality ?? {}
  const knownBlockingLimits = quality.knownBlockingLimits

  if (!entry) {
    blockers.push('DeckKit is missing from catalog.json')
    return {
      readiness,
      quality,
      knownBlockingLimits: [],
      blockers,
      warnings,
    }
  }

  if (!READINESS.includes(readiness)) {
    blockers.push(`catalog.readiness "${readiness || 'missing'}" is not valid`)
  }
  if (!quality || typeof quality !== 'object') {
    warnings.push('catalog.quality is missing')
  }
  if (!quality.lastBenchmark) {
    warnings.push('catalog.quality.lastBenchmark is not set')
  }
  if (!Array.isArray(knownBlockingLimits)) {
    warnings.push('catalog.quality.knownBlockingLimits is missing or not an array')
  }

  return {
    readiness,
    quality,
    knownBlockingLimits: Array.isArray(knownBlockingLimits) ? knownBlockingLimits : [],
    blockers,
    warnings,
  }
}

function buildEligibility({ catalogAudit, benchmarkAudit }) {
  const candidateBlockers = [...catalogAudit.blockers, ...benchmarkAudit.benchmarkBlockers]

  const deliveryBlockers = [...candidateBlockers]
  const defaultBlockers = [...candidateBlockers]
  const readiness = catalogAudit.readiness
  const quality = catalogAudit.quality
  const knownBlockingLimits = catalogAudit.knownBlockingLimits

  if (!['production', 'default'].includes(readiness)) {
    deliveryBlockers.push(
      `catalog.readiness is "${readiness || 'missing'}"; delivery requires production/default`,
    )
  }
  if (!quality.lastBenchmark) {
    deliveryBlockers.push('catalog.quality.lastBenchmark must be set for delivery')
  }
  if (quality.manualHardDefects !== 0) {
    deliveryBlockers.push('catalog.quality.manualHardDefects must be 0 for delivery')
  }
  if (knownBlockingLimits.length > 0) {
    deliveryBlockers.push('catalog.quality.knownBlockingLimits must be empty for delivery')
  }
  if ((quality.vision?.high ?? null) !== 0 || (quality.vision?.medium ?? null) !== 0) {
    deliveryBlockers.push('catalog.quality.vision high/medium must both be 0 for delivery')
  }

  const skippedDryRunCases = benchmarkAudit.cases.filter(
    (benchCase) => benchCase.exists && benchCase.skipped?.dryRun,
  )
  if (skippedDryRunCases.length > 0) {
    deliveryBlockers.push('benchmark dry-run gates are still skipped')
  }

  const skippedApplyCases = benchmarkAudit.cases.filter(
    (benchCase) => benchCase.exists && benchCase.skipped?.apply,
  )
  if (skippedApplyCases.length > 0) {
    deliveryBlockers.push('benchmark apply gates are still skipped')
  }

  const skippedVisionCases = benchmarkAudit.cases.filter(
    (benchCase) => benchCase.exists && benchCase.skipped?.vision,
  )
  if (skippedVisionCases.length > 0) {
    deliveryBlockers.push('benchmark vision gates are still skipped')
  }

  const skippedPngCases = benchmarkAudit.cases.filter(
    (benchCase) =>
      benchCase.exists && (benchCase.skipped?.previews || benchCase.skipped?.contactSheet),
  )
  if (skippedPngCases.length > 0) {
    deliveryBlockers.push('benchmark PNG/contact-sheet gates are still skipped')
  }

  defaultBlockers.push(...deliveryBlockers.filter((item) => !defaultBlockers.includes(item)))
  if (readiness !== 'default') {
    defaultBlockers.push(
      `catalog.readiness is "${readiness || 'missing'}"; default requires default`,
    )
  }

  return {
    candidate: {
      ready: candidateBlockers.length === 0,
      blockers: candidateBlockers,
    },
    delivery: {
      ready: deliveryBlockers.length === 0,
      blockers: deliveryBlockers,
    },
    default: {
      ready: defaultBlockers.length === 0,
      blockers: defaultBlockers,
    },
  }
}

function printHuman(result) {
  process.stdout.write(`DeckKit readiness audit: ${result.deckkit}\n`)
  for (const target of ['candidate', 'delivery', 'default']) {
    const gate = result.eligibility[target]
    process.stdout.write(`- ${target}: ${gate.ready ? 'PASS' : 'FAIL'}\n`)
    for (const blocker of gate.blockers) {
      process.stdout.write(`  - ${blocker}\n`)
    }
  }
  if (result.catalog.warnings.length > 0) {
    process.stdout.write('- catalog warnings:\n')
    for (const warning of result.catalog.warnings) {
      process.stdout.write(`  - ${warning}\n`)
    }
  }
  process.stdout.write('- benchmark cases:\n')
  for (const benchCase of result.benchmark.cases) {
    const status = benchCase.passed ? 'PASS' : 'FAIL'
    const skipped = benchCase.skipped
    const skippedText = skipped
      ? [
          `dryRun=${skipped.dryRun}`,
          `apply=${skipped.apply}`,
          `vision=${skipped.vision}`,
          `png=${skipped.previews || skipped.contactSheet}`,
        ].join(', ')
      : ''
    const dryRun = benchCase.dryRun
      ? `, dryRun=H${benchCase.dryRun.visualRisks.high}/M${benchCase.dryRun.visualRisks.medium}`
      : ''
    const vision = benchCase.vision
      ? `, vision=H${benchCase.vision.bySeverity.high}/M${benchCase.vision.bySeverity.medium}`
      : ''
    const previews = benchCase.previews
      ? `, png=${benchCase.previews.count}/${benchCase.previews.expectedCount ?? '?'}`
      : ''
    const contactSheet = benchCase.contactSheet
      ? `, contactSheet=${benchCase.contactSheet.artifactNonEmpty ? 'ok' : 'missing'}`
      : ''
    const skippedSuffix = skippedText ? `, skipped: ${skippedText}` : ''
    process.stdout.write(
      `  - ${status} ${benchCase.kind}: ${benchCase.caseId || 'missing'}${dryRun}${vision}${previews}${contactSheet}${skippedSuffix}\n`,
    )
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const catalog = readJson(CATALOG_PATH)
  const index = readJson(join(VISUAL_ROOT, 'index.json'))
  const entry = catalog.entries.find((candidate) => candidate.id === args.deckkit)
  const catalogAudit = auditCatalog(entry)
  const benchmarkAudit = auditBenchmarkCases({
    index,
    outDir: args.out,
    deckkit: args.deckkit,
  })
  const eligibility = buildEligibility({ catalogAudit, benchmarkAudit })
  const result = {
    schemaVersion: 'pptx-nova-deckkit-readiness-audit/v1',
    deckkit: args.deckkit,
    target: args.target,
    passed: eligibility[args.target].ready,
    paths: {
      catalog: relative(SKILL_ROOT, CATALOG_PATH),
      visualIndex: relative(SKILL_ROOT, join(VISUAL_ROOT, 'index.json')),
      benchmarkOut: relative(WORK_ROOT, args.out),
    },
    catalog: {
      found: Boolean(entry),
      readiness: catalogAudit.readiness,
      quality: entry?.quality ?? null,
      warnings: catalogAudit.warnings,
    },
    benchmark: benchmarkAudit,
    eligibility,
  }

  if (args.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  else printHuman(result)
  if (!result.passed) process.exit(1)
}

try {
  main()
} catch (error) {
  process.stderr.write(`[error] ${error.message}\n`)
  process.exit(1)
}
