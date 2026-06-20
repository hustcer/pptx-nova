#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeVisionLowBuckets } from './pptx-nova-vision-baseline.mjs'

const SKILL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const WORK_ROOT = process.cwd()
const VISUAL_ROOT = join(SKILL_ROOT, 'benchmarks/visual')
const CATALOG_PATH = join(SKILL_ROOT, 'assets/deckkits/catalog.json')
const DEFAULT_OUT = join(WORK_ROOT, '.tmp/pptx-nova-visual')
const MINIMUM_REQUIRED_KINDS = ['golden']
const PREFERRED_KIND_ORDER = ['golden', 'stress', 'mixed-language']
const READINESS = ['experimental', 'candidate', 'production', 'default']
const VISUAL_GRAMMAR_SCHEMA_VERSION = 'pptx-nova-visual-grammar/v1'
const REQUIRED_VISUAL_GRAMMAR_ARRAYS = [
  'mood',
  'layoutPrinciples',
  'signatureElements',
  'compositionRules',
  'avoid',
]
const REQUIRED_VISUAL_GRAMMAR_OBJECTS = ['typography', 'colorSystem', 'slideRhythm']

const usage = `Usage:
  node <skill-root>/scripts/pptx-nova-deckkit-readiness.mjs --deckkit <id> [options]

Options:
  --deckkit <id>          DeckKit id to audit
  --out <dir>             Benchmark output directory. Defaults to <cwd>/.tmp/pptx-nova-visual
  --catalog <path>        Catalog path. Defaults to <skill-root>/assets/deckkits/catalog.json
  --visual-index <path>   Visual benchmark index path. Defaults to <skill-root>/benchmarks/visual/index.json
  --target <level>        candidate|delivery|default. Defaults to candidate
  --explicit              User explicitly named this DeckKit; allow explicit-only continuation gates
  --json                  Print machine-readable audit result
  --help                  Show this help

Run the benchmark first:
  node <skill-root>/scripts/pptx-nova-deckkit-benchmark.mjs --deckkit consulting-dark --all --repeat 3 --clean
`

function parseArgs(argv) {
  const args = {
    deckkit: '',
    out: DEFAULT_OUT,
    catalog: CATALOG_PATH,
    visualIndex: join(VISUAL_ROOT, 'index.json'),
    target: 'candidate',
    explicit: false,
    json: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(usage)
      process.exit(0)
    } else if (arg === '--json') {
      args.json = true
    } else if (arg === '--explicit') {
      args.explicit = true
    } else if (arg === '--deckkit') {
      args.deckkit = valueAfter(argv, i, arg)
      i += 1
    } else if (arg === '--out') {
      args.out = resolve(valueAfter(argv, i, arg))
      i += 1
    } else if (arg === '--catalog') {
      args.catalog = resolve(valueAfter(argv, i, arg))
      i += 1
    } else if (arg === '--visual-index') {
      args.visualIndex = resolve(valueAfter(argv, i, arg))
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

function kindRank(kind) {
  const rank = PREFERRED_KIND_ORDER.indexOf(kind)
  return rank === -1 ? PREFERRED_KIND_ORDER.length : rank
}

function orderedBenchmarkCases(deckkitCases) {
  return [...deckkitCases].sort((a, b) => {
    const rankDiff = kindRank(a.kind) - kindRank(b.kind)
    if (rankDiff !== 0) return rankDiff
    return a.id.localeCompare(b.id, 'en')
  })
}

function uniqueKinds(deckkitCases) {
  return [...new Set(orderedBenchmarkCases(deckkitCases).map((benchCase) => benchCase.kind))]
}

function countFitErrors(summary) {
  return (summary?.validation?.fitDiagnostics ?? []).filter((d) => d.severity === 'error').length
}

function visionLowBuckets(summary) {
  return normalizeVisionLowBuckets(summary?.vision?.lowBuckets)
}

function artifactBytes(path) {
  if (!path || typeof path !== 'string') return 0
  const absolutePath = resolve(WORK_ROOT, path)
  if (!existsSync(absolutePath)) return 0
  return statSync(absolutePath).size
}

function stringArray(value) {
  return (Array.isArray(value) ? value : []).filter(
    (item) => typeof item === 'string' && item.trim(),
  )
}

function hasNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function auditVisualGrammar(grammar) {
  const blockers = []
  const warnings = []

  if (!isPlainObject(grammar)) {
    blockers.push('catalog.visualGrammar is missing')
    return {
      present: false,
      schemaVersion: '',
      positioning: '',
      mood: [],
      layoutPrinciples: [],
      signatureElements: [],
      compositionRules: [],
      avoid: [],
      blockers,
      warnings,
    }
  }

  if (grammar.schemaVersion !== VISUAL_GRAMMAR_SCHEMA_VERSION) {
    blockers.push(`catalog.visualGrammar.schemaVersion must be ${VISUAL_GRAMMAR_SCHEMA_VERSION}`)
  }
  if (!hasNonEmptyString(grammar.positioning)) {
    blockers.push('catalog.visualGrammar.positioning is missing')
  }
  for (const field of REQUIRED_VISUAL_GRAMMAR_ARRAYS) {
    if (stringArray(grammar[field]).length === 0) {
      blockers.push(`catalog.visualGrammar.${field} must be a non-empty string array`)
    }
  }
  for (const field of REQUIRED_VISUAL_GRAMMAR_OBJECTS) {
    if (!isPlainObject(grammar[field])) {
      blockers.push(`catalog.visualGrammar.${field} must be an object`)
    }
  }

  return {
    present: true,
    schemaVersion: grammar.schemaVersion ?? '',
    positioning: grammar.positioning ?? '',
    mood: stringArray(grammar.mood),
    layoutPrinciples: stringArray(grammar.layoutPrinciples),
    signatureElements: stringArray(grammar.signatureElements),
    compositionRules: stringArray(grammar.compositionRules),
    avoid: stringArray(grammar.avoid),
    blockers,
    warnings,
  }
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
  const indexedKinds = uniqueKinds(deckkitCases)

  for (const kind of MINIMUM_REQUIRED_KINDS) {
    if (!indexedKinds.includes(kind)) {
      benchmarkBlockers.push(`missing ${kind} case in visual benchmark index`)
      cases.push({ kind, caseId: '', summaryPath: '', exists: false, passed: false })
    }
  }

  for (const benchCase of orderedBenchmarkCases(deckkitCases)) {
    const summaryPath = summaryPathFor(outDir, benchCase)
    if (!existsSync(summaryPath)) {
      benchmarkBlockers.push(`missing summary for ${benchCase.id}; run benchmark first`)
      cases.push({
        kind: benchCase.kind,
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
    const lowBuckets = visionLowBuckets(summary)

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
      kind: benchCase.kind,
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
      vision: summary.vision
        ? {
            ...summary.vision,
            lowBuckets,
          }
        : null,
      previews,
      contactSheet,
      patchOps: summary.patch?.ops ?? 0,
      p50TotalMs: summary.timing?.p50?.totalMs ?? null,
    })
  }

  return {
    minimumRequiredKinds: MINIMUM_REQUIRED_KINDS,
    gatedKinds: indexedKinds,
    cases,
    benchmarkBlockers,
  }
}

function auditCatalog(entry) {
  const blockers = []
  const warnings = []
  const readiness = entry?.readiness ?? ''
  const quality = entry?.quality ?? {}
  const knownBlockingLimits = quality.knownBlockingLimits
  const visualGrammar = auditVisualGrammar(entry?.visualGrammar)
  const nativeSkinning = auditNativeSkinning(entry?.nativeSkinning)
  const refurbishProfile = auditRefurbishProfile(entry?.refurbishProfile, nativeSkinning)

  if (!entry) {
    blockers.push('DeckKit is missing from catalog.json')
    return {
      readiness,
      quality,
      knownBlockingLimits: [],
      visualGrammar,
      nativeSkinning,
      refurbishProfile,
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
  warnings.push(...visualGrammar.warnings)
  warnings.push(...visualGrammar.blockers)
  warnings.push(...nativeSkinning.warnings)
  warnings.push(...refurbishProfile.warnings)

  return {
    readiness,
    quality,
    knownBlockingLimits: Array.isArray(knownBlockingLimits) ? knownBlockingLimits : [],
    visualGrammar,
    nativeSkinning,
    refurbishProfile,
    blockers,
    warnings,
  }
}

function auditNativeSkinning(value) {
  if (!isPlainObject(value)) {
    return {
      supported: false,
      themePack: '',
      stylePack: '',
      chromeSource: '',
      commands: [],
      warnings: [],
    }
  }
  const warnings = []
  if (!hasNonEmptyString(value.themePack))
    warnings.push('catalog.nativeSkinning.themePack is missing')
  if (!hasNonEmptyString(value.stylePack))
    warnings.push('catalog.nativeSkinning.stylePack is missing')
  if (!hasNonEmptyString(value.chromeSource)) {
    warnings.push('catalog.nativeSkinning.chromeSource is missing')
  }
  return {
    supported: warnings.length === 0,
    themePack: value.themePack ?? '',
    stylePack: value.stylePack ?? '',
    chromeSource: value.chromeSource ?? '',
    commands: ['refurbish-skin', 'chrome-apply', 'remap-theme'],
    warnings,
  }
}

function auditRefurbishProfile(value, nativeSkinning) {
  if (!isPlainObject(value)) {
    return {
      present: false,
      mode: '',
      nativeSkinning,
      fallback: null,
      requiredGates: [],
      warnings: [],
    }
  }
  const warnings = []
  const requiredGates = stringArray(value.requiredGates)
  if (value.schemaVersion !== 'pptx-nova-refurbish-profile/v1') {
    warnings.push('catalog.refurbishProfile.schemaVersion must be pptx-nova-refurbish-profile/v1')
  }
  if (!hasNonEmptyString(value.mode)) {
    warnings.push('catalog.refurbishProfile.mode is missing')
  }
  if (requiredGates.length === 0) {
    warnings.push('catalog.refurbishProfile.requiredGates must be a non-empty string array')
  }
  return {
    present: true,
    mode: value.mode ?? '',
    nativeSkinning: isPlainObject(value.nativeSkinning)
      ? {
          supported: value.nativeSkinning.supported === true,
          themePack: value.nativeSkinning.themePack ?? nativeSkinning.themePack,
          stylePack: value.nativeSkinning.stylePack ?? nativeSkinning.stylePack,
          commands: stringArray(value.nativeSkinning.commands),
        }
      : nativeSkinning,
    fallback: isPlainObject(value.fallback) ? value.fallback : null,
    requiredGates,
    notes: stringArray(value.notes),
    warnings,
  }
}

function defaultExplicitGates() {
  return [
    'record-readiness-exception',
    'dry-run',
    'vision-check',
    'png-contact-review',
    'content-audit',
  ]
}

function buildExplicitSelection({ requested, target, catalogAudit, targetEligibility }) {
  const readiness = catalogAudit.readiness
  const profile = catalogAudit.refurbishProfile
  const canUseException =
    requested &&
    ['experimental', 'candidate'].includes(readiness) &&
    (profile.present ? ['explicit-only', 'explicit-exception'].includes(profile.mode) : true)
  const requiredGates =
    profile.requiredGates.length > 0 ? profile.requiredGates : defaultExplicitGates()
  return {
    requested,
    canContinue: canUseException,
    passedByExplicitException: canUseException && !targetEligibility.ready,
    mode: profile.mode || (canUseException ? 'explicit-exception' : ''),
    target,
    readiness,
    nativeSkinning: profile.nativeSkinning ?? catalogAudit.nativeSkinning,
    fallback: profile.fallback,
    requiredGates: canUseException ? requiredGates : [],
    notes: profile.notes ?? [],
    blockers: targetEligibility.blockers,
  }
}

function buildEligibility({ catalogAudit, benchmarkAudit }) {
  const candidateBlockers = [...catalogAudit.blockers, ...benchmarkAudit.benchmarkBlockers]

  const deliveryBlockers = [...candidateBlockers]
  const defaultBlockers = [...candidateBlockers]
  const readiness = catalogAudit.readiness
  const quality = catalogAudit.quality
  const knownBlockingLimits = catalogAudit.knownBlockingLimits
  const visualGrammarBlockers = catalogAudit.visualGrammar?.blockers ?? []

  if (['production', 'default'].includes(readiness)) {
    candidateBlockers.push(...visualGrammarBlockers)
  }

  if (!['production', 'default'].includes(readiness)) {
    deliveryBlockers.push(
      `catalog.readiness is "${readiness || 'missing'}"; delivery requires production/default`,
    )
  }
  deliveryBlockers.push(...visualGrammarBlockers)
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
  if ((quality.benchmark?.vision?.lowBuckets?.new ?? 0) !== 0) {
    deliveryBlockers.push('catalog.quality.benchmark.vision.lowBuckets.new must be 0')
  }
  if ((quality.benchmark?.vision?.lowBuckets?.changed ?? 0) !== 0) {
    deliveryBlockers.push('catalog.quality.benchmark.vision.lowBuckets.changed must be 0')
  }
  if ((quality.benchmark?.vision?.lowBuckets?.baselineUnavailableCases ?? 0) !== 0) {
    deliveryBlockers.push('catalog.quality.benchmark vision low baselines must be available')
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

  const newLowCases = benchmarkAudit.cases.filter(
    (benchCase) => (benchCase.vision?.lowBuckets?.new ?? 0) > 0,
  )
  if (newLowCases.length > 0) {
    deliveryBlockers.push('benchmark vision has new low issues that need review')
  }

  const changedLowCases = benchmarkAudit.cases.filter(
    (benchCase) => (benchCase.vision?.lowBuckets?.changed ?? 0) > 0,
  )
  if (changedLowCases.length > 0) {
    deliveryBlockers.push('benchmark vision has changed low issues that need review')
  }

  const missingBaselineCases = benchmarkAudit.cases.filter(
    (benchCase) => benchCase.vision?.lowBuckets?.baselineUnavailable === true,
  )
  if (missingBaselineCases.length > 0) {
    deliveryBlockers.push('benchmark vision low baselines are missing')
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
  if (result.catalog.visualGrammar?.present) {
    process.stdout.write(`- visual grammar: ${result.catalog.visualGrammar.positioning}\n`)
    if (result.catalog.visualGrammar.signatureElements.length > 0) {
      process.stdout.write(
        `  - signatures: ${result.catalog.visualGrammar.signatureElements.slice(0, 4).join('; ')}\n`,
      )
    }
    if (result.catalog.visualGrammar.avoid.length > 0) {
      process.stdout.write(
        `  - avoid: ${result.catalog.visualGrammar.avoid.slice(0, 4).join('; ')}\n`,
      )
    }
  }
  if (result.explicitSelection?.requested) {
    process.stdout.write(
      `- explicit selection: ${result.explicitSelection.canContinue ? 'CAN CONTINUE' : 'BLOCKED'} mode=${result.explicitSelection.mode || 'n/a'}\n`,
    )
    if (result.explicitSelection.requiredGates.length > 0) {
      process.stdout.write(
        `  - required gates: ${result.explicitSelection.requiredGates.join(', ')}\n`,
      )
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
      ? `, vision=H${benchCase.vision.bySeverity.high}/M${benchCase.vision.bySeverity.medium}/L${benchCase.vision.bySeverity.low} new=${benchCase.vision.lowBuckets.new} changed=${benchCase.vision.lowBuckets.changed}`
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
  const catalog = readJson(args.catalog)
  const index = readJson(args.visualIndex)
  const entry = catalog.entries.find((candidate) => candidate.id === args.deckkit)
  const catalogAudit = auditCatalog(entry)
  const benchmarkAudit = auditBenchmarkCases({
    index,
    outDir: args.out,
    deckkit: args.deckkit,
  })
  const eligibility = buildEligibility({ catalogAudit, benchmarkAudit })
  const explicitSelection = buildExplicitSelection({
    requested: args.explicit,
    target: args.target,
    catalogAudit,
    targetEligibility: eligibility[args.target],
  })
  const passed = eligibility[args.target].ready || explicitSelection.passedByExplicitException
  const result = {
    schemaVersion: 'pptx-nova-deckkit-readiness-audit/v1',
    deckkit: args.deckkit,
    target: args.target,
    explicit: args.explicit,
    passed,
    paths: {
      catalog: relative(SKILL_ROOT, args.catalog),
      visualIndex: relative(SKILL_ROOT, args.visualIndex),
      benchmarkOut: relative(WORK_ROOT, args.out),
    },
    catalog: {
      found: Boolean(entry),
      readiness: catalogAudit.readiness,
      nativeSkinning: catalogAudit.nativeSkinning,
      refurbishProfile: catalogAudit.refurbishProfile,
      visualGrammar: catalogAudit.visualGrammar,
      quality: entry?.quality ?? null,
      warnings: catalogAudit.warnings,
    },
    benchmark: benchmarkAudit,
    eligibility,
    explicitSelection,
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
