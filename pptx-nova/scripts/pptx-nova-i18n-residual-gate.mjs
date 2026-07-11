#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const SCHEMA_VERSION = 'pptx-nova-i18n-residual-gate/v1'

const usage = `Usage:
  node <skill-root>/scripts/pptx-nova-i18n-residual-gate.mjs --run-dir <dir> [options]

Detect exact untranslated source units in a translated candidate without
treating valid target-language Latin text as source-language leakage.

Options:
  --run-dir <dir>          Current translation run directory.
  --source-scan <path>     Source i18n scan. Defaults to run-dir/i18n-scan-source.json.
  --candidate-scan <path>  Candidate i18n scan. Defaults to run-dir/i18n-scan-candidate.json.
  --translations <path>    Translation data. Defaults to run-dir/translations.json.
  --output <path>          Gate report. Defaults to run-dir/i18n-residual-gate.json.
  --overwrite              Replace an existing report.
  --strict                 Exit 2 when exact source residuals remain.
  --json                   Print the report to stdout.
  --help                   Show this help.
`

function valueAfter(argv, index, flag) {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

function parseArgs(argv) {
  const args = {
    runDir: '',
    sourceScan: '',
    candidateScan: '',
    translations: '',
    output: '',
    overwrite: false,
    strict: false,
    json: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(usage)
      process.exit(0)
    } else if (arg === '--run-dir') {
      args.runDir = valueAfter(argv, index, arg)
      index += 1
    } else if (arg === '--source-scan') {
      args.sourceScan = valueAfter(argv, index, arg)
      index += 1
    } else if (arg === '--candidate-scan') {
      args.candidateScan = valueAfter(argv, index, arg)
      index += 1
    } else if (arg === '--translations') {
      args.translations = valueAfter(argv, index, arg)
      index += 1
    } else if (arg === '--output' || arg === '-o') {
      args.output = valueAfter(argv, index, arg)
      index += 1
    } else if (arg === '--overwrite') {
      args.overwrite = true
    } else if (arg === '--strict') {
      args.strict = true
    } else if (arg === '--json') {
      args.json = true
    } else {
      throw new Error(`Unknown option: ${arg}\n\n${usage}`)
    }
  }

  if (!args.runDir) throw new Error(`--run-dir is required\n\n${usage}`)
  args.runDir = resolve(args.runDir)
  args.sourceScan = resolve(args.sourceScan || join(args.runDir, 'i18n-scan-source.json'))
  args.candidateScan = resolve(args.candidateScan || join(args.runDir, 'i18n-scan-candidate.json'))
  args.translations = resolve(args.translations || join(args.runDir, 'translations.json'))
  args.output = resolve(args.output || join(args.runDir, 'i18n-residual-gate.json'))
  return args
}

function readJson(path, label) {
  if (!existsSync(path)) throw new Error(`${label} does not exist: ${path}`)
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${label} is not valid JSON: ${message}`)
  }
}

function unitsOf(scan, label) {
  const units = scan?.i18nUnits?.units
  if (!Array.isArray(units)) throw new Error(`${label} does not contain i18nUnits.units[]`)
  return units
}

function translationsOf(data) {
  if (!Array.isArray(data?.translations)) {
    throw new Error('translations data does not contain translations[]')
  }
  return data.translations
}

function indexByUnitId(units, label) {
  const index = new Map()
  for (const unit of units) {
    if (!unit?.unitId) continue
    if (index.has(unit.unitId))
      throw new Error(`${label} contains duplicate unitId: ${unit.unitId}`)
    index.set(unit.unitId, unit)
  }
  return index
}

function nativeBlockers(scan) {
  return Array.isArray(scan?.blockers) ? scan.blockers : []
}

function buildReport(args) {
  const sourceScan = readJson(args.sourceScan, 'source scan')
  const candidateScan = readJson(args.candidateScan, 'candidate scan')
  const translationData = readJson(args.translations, 'translations data')
  const sourceUnits = unitsOf(sourceScan, 'source scan')
  const candidateUnits = unitsOf(candidateScan, 'candidate scan')
  const translations = translationsOf(translationData)
  if (
    translationData.sourceLang &&
    sourceScan.sourceLang &&
    translationData.sourceLang !== sourceScan.sourceLang
  ) {
    throw new Error(
      `translations sourceLang ${translationData.sourceLang} does not match source scan ${sourceScan.sourceLang}`,
    )
  }
  if (
    translationData.sourceLang &&
    candidateScan.sourceLang &&
    translationData.sourceLang !== candidateScan.sourceLang
  ) {
    throw new Error(
      `translations sourceLang ${translationData.sourceLang} does not match candidate scan ${candidateScan.sourceLang}`,
    )
  }
  const sourceById = indexByUnitId(sourceUnits, 'source scan')
  const candidateById = indexByUnitId(candidateUnits, 'candidate scan')
  const residuals = []
  const missingSourceUnits = []
  const approvedUnchanged = []

  for (const translation of translations) {
    const unitId = translation?.unitId
    if (!unitId) throw new Error('every translation record must contain unitId')
    if (typeof translation.sourceText !== 'string') {
      throw new Error(`translation sourceText must be a string: ${unitId}`)
    }
    if (typeof translation.targetText !== 'string') {
      throw new Error(`translation targetText must be a string: ${unitId}`)
    }
    const sourceUnit = sourceById.get(unitId)
    if (!sourceUnit) {
      missingSourceUnits.push(unitId)
      continue
    }
    if (
      translation.sourceText !== sourceUnit.sourceText ||
      (translation.sourceHash && translation.sourceHash !== sourceUnit.sourceHash)
    ) {
      throw new Error(`translation source guard does not match source scan unit: ${unitId}`)
    }
    if (translation.targetText === translation.sourceText) {
      approvedUnchanged.push(unitId)
      continue
    }

    const candidateUnit = candidateById.get(unitId)
    if (!candidateUnit) continue
    const sameHash = Boolean(
      translation.sourceHash && candidateUnit.sourceHash === translation.sourceHash,
    )
    const sameText = candidateUnit.sourceText === translation.sourceText
    if (!sameHash && !sameText) continue

    residuals.push({
      unitId,
      category: sourceUnit.category ?? null,
      slide: sourceUnit.slide ?? null,
      part: sourceUnit.part ?? sourceUnit.origin?.part ?? null,
      sourceText: translation.sourceText,
      sourceHash: translation.sourceHash ?? sourceUnit.sourceHash ?? null,
      targetText: translation.targetText ?? null,
      matchedBy: sameHash ? 'sourceHash' : 'sourceText',
    })
  }

  if (missingSourceUnits.length > 0) {
    throw new Error(
      `translations reference ${missingSourceUnits.length} unit(s) missing from source scan: ${missingSourceUnits.slice(0, 5).join(', ')}`,
    )
  }

  const blockers = nativeBlockers(candidateScan)
  const status = residuals.length > 0 ? 'fail' : 'pass'
  return {
    schemaVersion: SCHEMA_VERSION,
    observedAt: new Date().toISOString(),
    status,
    sourceLang: translationData.sourceLang ?? sourceScan.sourceLang ?? null,
    targetLang: translationData.targetLang ?? null,
    inputs: {
      sourceScan: args.sourceScan,
      candidateScan: args.candidateScan,
      translations: args.translations,
    },
    policy: {
      authoritativeSignal: 'exact-source-unit-residuals',
      nativeCandidateClassification: 'diagnostic-only',
      rationale:
        'Target languages may legitimately share scripts with source languages; a planned-to-change unit that still has its original unitId plus sourceText/sourceHash is the delivery blocker.',
    },
    summary: {
      translationCount: translations.length,
      plannedChangeCount: translations.length - approvedUnchanged.length,
      approvedUnchangedCount: approvedUnchanged.length,
      sourceUnitCount: sourceUnits.length,
      candidateUnitCount: candidateUnits.length,
      exactResidualCount: residuals.length,
      nativeCandidateBlockerCount: blockers.length,
      diagnosticOnlyBlockerCount: blockers.length,
    },
    exactResiduals: residuals,
    approvedUnchangedUnitIds: approvedUnchanged,
    nativeCandidateGate: candidateScan.agentGate ?? null,
    nativeCandidateBlockerSample: blockers.slice(0, 20),
    nativeCandidateBlockersTruncated: blockers.length > 20,
    agentGate: {
      passed: status === 'pass',
      blockerCount: residuals.length,
      message:
        status === 'pass'
          ? 'No exact untranslated source units remain; native script-classification hits are diagnostic only.'
          : `${residuals.length} exact untranslated source unit(s) remain in the candidate.`,
    },
  }
}

function writeReport(args, report) {
  if (existsSync(args.output) && !args.overwrite) {
    throw new Error(`output already exists: ${args.output}; use --overwrite to replace it`)
  }
  mkdirSync(dirname(args.output), { recursive: true })
  const text = `${JSON.stringify(report, null, 2)}\n`
  writeFileSync(args.output, text)
  if (args.json) process.stdout.write(text)
  else {
    process.stdout.write(`i18n residual gate: ${report.status}\n`)
    process.stdout.write(`${report.agentGate.message}\n`)
    process.stdout.write(`report: ${args.output}\n`)
  }
}

try {
  const args = parseArgs(process.argv.slice(2))
  const report = buildReport(args)
  writeReport(args, report)
  if (args.strict && report.status === 'fail') process.exit(2)
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`[error] ${message}\n`)
  process.exit(1)
}
