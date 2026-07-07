#!/usr/bin/env node
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'

const SCHEMA_VERSION = 'pptx-nova-compare-gate/v1'

const usage = `Usage:
  node <skill-root>/scripts/pptx-nova-compare-gate.mjs --run-dir <dir> --final-pptx <path> [options]

Validate and optionally publish the final before/after compare PNG next to the
delivered PPTX.

Options:
  --run-dir <dir>          Required current pptx-nova run directory.
  --final-pptx <path>      Required final PPTX path.
  --final-pptx-source <path>
                           Optional staged PPTX to validate when final path is pending.
  --kind <name>            Compare kind, e.g. translation or refurbish. Defaults to compare.
  --compare-stem <stem>    Artifact/published stem. Defaults to <kind>-compare.
  --compare <path>         Run-directory compare PNG. Defaults to <run-dir>/<compare-stem>.png.
  --report <path>          Run-directory compare JSON. Defaults to <run-dir>/<compare-stem>.json.
  --sibling <path>         Expected/published sibling PNG path.
  --publish                Copy --compare next to --final-pptx before checking.
  --timestamp <MMDDhhmmss> Timestamp suffix to use with --publish.
  --output <path>          Write gate JSON. Defaults to <run-dir>/<compare-stem>-gate.json.
  --overwrite              Allow replacing --output and, with --publish, --sibling.
  --json                   Print the gate JSON to stdout.
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
    finalPptx: '',
    finalPptxSource: '',
    kind: 'compare',
    compareStem: '',
    compare: '',
    report: '',
    sibling: '',
    publish: false,
    timestamp: '',
    output: '',
    overwrite: false,
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
    } else if (arg === '--final-pptx') {
      args.finalPptx = valueAfter(argv, index, arg)
      index += 1
    } else if (arg === '--final-pptx-source') {
      args.finalPptxSource = valueAfter(argv, index, arg)
      index += 1
    } else if (arg === '--kind') {
      args.kind = valueAfter(argv, index, arg)
      index += 1
    } else if (arg === '--compare-stem') {
      args.compareStem = valueAfter(argv, index, arg)
      index += 1
    } else if (arg === '--compare') {
      args.compare = valueAfter(argv, index, arg)
      index += 1
    } else if (arg === '--report') {
      args.report = valueAfter(argv, index, arg)
      index += 1
    } else if (arg === '--sibling') {
      args.sibling = valueAfter(argv, index, arg)
      index += 1
    } else if (arg === '--timestamp') {
      args.timestamp = valueAfter(argv, index, arg)
      index += 1
    } else if (arg === '--output' || arg === '-o') {
      args.output = valueAfter(argv, index, arg)
      index += 1
    } else if (arg === '--publish') {
      args.publish = true
    } else if (arg === '--overwrite') {
      args.overwrite = true
    } else if (arg === '--json') {
      args.json = true
    } else {
      throw new Error(`Unknown option: ${arg}\n\n${usage}`)
    }
  }

  if (!args.runDir) throw new Error(`--run-dir is required\n\n${usage}`)
  if (!args.finalPptx) throw new Error(`--final-pptx is required\n\n${usage}`)

  args.runDir = resolve(args.runDir)
  args.finalPptx = resolve(args.finalPptx)
  if (args.finalPptxSource) args.finalPptxSource = resolve(args.finalPptxSource)
  args.kind = normalizeSlug(args.kind || 'compare')
  args.compareStem = normalizeSlug(args.compareStem || `${args.kind}-compare`)
  args.compare = resolve(args.compare || join(args.runDir, `${args.compareStem}.png`))
  args.report = resolve(args.report || join(args.runDir, `${args.compareStem}.json`))
  args.output = resolve(args.output || join(args.runDir, `${args.compareStem}-gate.json`))
  if (args.sibling) args.sibling = resolve(args.sibling)
  return args
}

function normalizeSlug(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || 'compare'
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    return {
      __parseError: error instanceof Error ? error.message : String(error),
    }
  }
}

function fileState(path) {
  if (!existsSync(path)) return { path, exists: false, isFile: false, byteLength: 0 }
  const stat = statSync(path)
  return { path, exists: true, isFile: stat.isFile(), byteLength: stat.size, mtimeMs: stat.mtimeMs }
}

function stem(path) {
  const name = basename(path)
  const ext = extname(name)
  return ext ? name.slice(0, -ext.length) : name
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function timestampNow() {
  const date = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

function validateTimestamp(value) {
  if (!/^\d{10}$/.test(value)) return false
  const month = Number(value.slice(0, 2))
  const day = Number(value.slice(2, 4))
  const hour = Number(value.slice(4, 6))
  const minute = Number(value.slice(6, 8))
  const second = Number(value.slice(8, 10))
  return (
    month >= 1 && month <= 12 && day >= 1 && day <= 31 && hour <= 23 && minute <= 59 && second <= 59
  )
}

function addSecond(timestamp) {
  const month = Number(timestamp.slice(0, 2))
  const day = Number(timestamp.slice(2, 4))
  const hour = Number(timestamp.slice(4, 6))
  const minute = Number(timestamp.slice(6, 8))
  const second = Number(timestamp.slice(8, 10))
  const date = new Date(2000, month - 1, day, hour, minute, second + 1)
  const pad = (value) => String(value).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

function siblingPattern(finalPptx, compareStem) {
  return new RegExp(`^${escapeRegex(stem(finalPptx))}-${escapeRegex(compareStem)}-(\\d{10})\\.png$`)
}

function makeSiblingPath(args) {
  if (args.sibling) return args.sibling
  let timestamp = args.timestamp || timestampNow()
  if (!validateTimestamp(timestamp))
    throw new Error(`--timestamp must use MMDDhhmmss: ${timestamp}`)
  const dir = dirname(args.finalPptx)
  const base = stem(args.finalPptx)
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const candidate = join(dir, `${base}-${args.compareStem}-${timestamp}.png`)
    if (!existsSync(candidate) || args.overwrite) return candidate
    timestamp = addSecond(timestamp)
  }
  throw new Error('Could not find a collision-free timestamped sibling path')
}

function findSibling(args) {
  if (args.sibling) return args.sibling
  const dir = dirname(args.finalPptx)
  if (!existsSync(dir)) return ''
  const pattern = siblingPattern(args.finalPptx, args.compareStem)
  const matches = readdirSync(dir)
    .map((name) => {
      const match = name.match(pattern)
      if (!match) return null
      const path = join(dir, name)
      const timestamp = match[1]
      return validateTimestamp(timestamp) ? { path, timestamp, state: fileState(path) } : null
    })
    .filter(Boolean)
    .filter((item) => item.state.isFile && item.state.byteLength > 0)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp) || b.state.mtimeMs - a.state.mtimeMs)
  return matches[0]?.path || ''
}

function sameSize(left, right) {
  return left.exists && right.exists && left.byteLength === right.byteLength
}

function reportNumber(...values) {
  for (const value of values) {
    if (Number.isFinite(value)) return value
  }
  return null
}

function reportImagePath(report) {
  return report.output || report.outputPath || report.render?.path || ''
}

function validateNativeCompareReport(args, report, compareState, blockers, warnings) {
  if (report.status !== 'success') blockers.push('compare report status is not success')
  if (report.kind !== args.kind) {
    blockers.push(`compare report kind ${JSON.stringify(report.kind)} does not match ${args.kind}`)
  }
  if (report.slideSelector !== null && report.slideSelector !== undefined) {
    blockers.push(
      'compare report was generated with --slides; final delivery requires full-deck compare',
    )
  }
  if (!Number.isInteger(report.pageCount) || report.pageCount <= 0) {
    blockers.push('compare report pageCount is missing or invalid')
  }
  if (
    !Number.isFinite(report.width) ||
    report.width <= 0 ||
    !Number.isFinite(report.height) ||
    report.height <= 0
  ) {
    blockers.push('compare report image dimensions are missing or invalid')
  }
  if (!Number.isFinite(report.byteLength) || report.byteLength <= 0) {
    blockers.push('compare report byteLength is missing or invalid')
  } else if (compareState.exists && report.byteLength !== compareState.byteLength) {
    blockers.push('compare report byteLength does not match compare PNG')
  }
  if (report.output && resolve(report.output) !== compareState.path) {
    warnings.push(`compare report output differs from checked compare path: ${report.output}`)
  }
}

function validateXdocContactDiffReport(report, compareState, blockers, warnings) {
  if (report.status !== 'success') blockers.push('contact-diff report status is not success')
  const gate = report.agentGate ?? {}
  if (gate.passed !== true && gate.status !== 'pass') {
    blockers.push('contact-diff agent gate did not pass')
  }
  const scopeMode = gate.scopeMode ?? report.summary?.scopeMode ?? ''
  if (scopeMode && scopeMode !== 'all-slides') {
    blockers.push('contact-diff report was generated with a scoped slide selection')
  }
  const pairCount = reportNumber(gate.pairCount, report.summary?.pairCount)
  if (!Number.isInteger(pairCount) || pairCount <= 0) {
    blockers.push('contact-diff pairCount is missing or invalid')
  }
  const width = reportNumber(report.render?.width)
  const height = reportNumber(report.render?.height)
  if (!width || width <= 0 || !height || height <= 0) {
    blockers.push('contact-diff render dimensions are missing or invalid')
  }
  const outputPath = reportImagePath(report)
  if (outputPath && resolve(outputPath) !== compareState.path) {
    warnings.push(`contact-diff output differs from checked compare path: ${outputPath}`)
  }
}

function validateReport(args, report, compareState, blockers, warnings) {
  if (report.__parseError) {
    blockers.push(`compare report is not valid JSON: ${report.__parseError}`)
    return
  }
  if (report.schemaVersion === 'pptx-contact-diff/v1') {
    validateXdocContactDiffReport(report, compareState, blockers, warnings)
    return
  }
  validateNativeCompareReport(args, report, compareState, blockers, warnings)
}

function compareReportSummary(report) {
  if (!report || report.__parseError) {
    return {
      schemaVersion: null,
      status: report?.status ?? null,
      pageCount: null,
      slideSelector: null,
      width: null,
      height: null,
      byteLength: null,
    }
  }
  if (report.schemaVersion === 'pptx-contact-diff/v1') {
    const scopeMode = report.agentGate?.scopeMode ?? report.summary?.scopeMode ?? null
    return {
      schemaVersion: report.schemaVersion,
      status: report.status ?? null,
      pageCount: reportNumber(report.agentGate?.pairCount, report.summary?.pairCount),
      slideSelector: scopeMode === 'all-slides' ? null : scopeMode,
      width: reportNumber(report.render?.width),
      height: reportNumber(report.render?.height),
      byteLength: null,
    }
  }
  return {
    schemaVersion: report.schemaVersion ?? null,
    status: report.status ?? null,
    pageCount: report.pageCount ?? null,
    slideSelector: report.slideSelector ?? null,
    width: report.width ?? null,
    height: report.height ?? null,
    byteLength: report.byteLength ?? null,
  }
}

function buildReport(args) {
  const blockers = []
  const warnings = []
  const finalState = fileState(args.finalPptx)
  const finalSourceState = args.finalPptxSource ? fileState(args.finalPptxSource) : null
  const compareState = fileState(args.compare)
  const reportState = fileState(args.report)

  if (finalSourceState) {
    if (!finalSourceState.exists) {
      blockers.push(`staged final PPTX source is missing: ${args.finalPptxSource}`)
    } else if (!finalSourceState.isFile) {
      blockers.push(`staged final PPTX source is not a file: ${args.finalPptxSource}`)
    } else if (finalSourceState.byteLength <= 0) {
      blockers.push('staged final PPTX source is empty')
    }
    if (finalState.exists && !finalState.isFile) {
      blockers.push(`final PPTX path is not a file: ${args.finalPptx}`)
    }
  } else {
    if (!finalState.exists) blockers.push(`final PPTX is missing: ${args.finalPptx}`)
    else if (!finalState.isFile) blockers.push(`final PPTX is not a file: ${args.finalPptx}`)
  }
  if (!compareState.exists) blockers.push(`run-directory compare PNG is missing: ${args.compare}`)
  else if (!compareState.isFile) blockers.push(`compare PNG is not a file: ${args.compare}`)
  else if (compareState.byteLength <= 0) blockers.push('compare PNG is empty')
  if (!reportState.exists) blockers.push(`compare report is missing: ${args.report}`)
  else if (!reportState.isFile) blockers.push(`compare report is not a file: ${args.report}`)

  const compareReport = reportState.exists && reportState.isFile ? readJson(args.report) : null
  if (compareReport) validateReport(args, compareReport, compareState, blockers, warnings)
  const reportSummary = compareReportSummary(compareReport)

  let sibling = args.publish ? makeSiblingPath(args) : findSibling(args)
  if (args.publish && blockers.length === 0) {
    if (existsSync(sibling) && !args.overwrite) {
      blockers.push(`sibling compare PNG already exists: ${sibling}`)
    } else {
      mkdirSync(dirname(sibling), { recursive: true })
      copyFileSync(args.compare, sibling)
    }
  }

  const siblingState = sibling
    ? fileState(sibling)
    : fileState(join(dirname(args.finalPptx), '__missing__'))
  const pattern = siblingPattern(args.finalPptx, args.compareStem)
  const siblingBase = sibling ? basename(sibling) : ''
  const timestamp = siblingBase.match(pattern)?.[1] || null

  if (!sibling) {
    blockers.push(
      `no sibling compare PNG found next to final PPTX matching ${stem(args.finalPptx)}-${args.compareStem}-<MMDDhhmmss>.png`,
    )
  } else {
    if (dirname(sibling) !== dirname(args.finalPptx)) {
      blockers.push('sibling compare PNG is not in the same directory as the final PPTX')
    }
    if (!pattern.test(siblingBase)) {
      blockers.push(`sibling compare PNG does not match required filename pattern: ${siblingBase}`)
    }
    if (timestamp && !validateTimestamp(timestamp)) {
      blockers.push(`sibling compare PNG timestamp is invalid: ${timestamp}`)
    }
    if (!siblingState.exists) blockers.push(`sibling compare PNG is missing: ${sibling}`)
    else if (!siblingState.isFile) blockers.push(`sibling compare PNG is not a file: ${sibling}`)
    else if (siblingState.byteLength <= 0) blockers.push('sibling compare PNG is empty')
    else if (!sameSize(compareState, siblingState)) {
      blockers.push('sibling compare PNG byteLength does not match run-directory compare PNG')
    }
  }

  const status = blockers.length === 0 ? 'pass' : 'fail'
  return {
    schemaVersion: SCHEMA_VERSION,
    observedAt: new Date().toISOString(),
    status,
    mode: args.publish ? 'publish-and-check' : 'check',
    kind: args.kind,
    compareStem: args.compareStem,
    runDir: args.runDir,
    finalPptx: finalState,
    finalPptxSource: finalSourceState,
    compare: compareState,
    compareReport: {
      path: args.report,
      exists: reportState.exists,
      ...reportSummary,
    },
    sibling: {
      ...siblingState,
      requiredPattern: `${stem(args.finalPptx)}-${args.compareStem}-<MMDDhhmmss>.png`,
      timestamp,
    },
    blockers,
    warnings,
    agentSummary: {
      status,
      siblingPath: sibling || null,
      message:
        status === 'pass'
          ? 'Compare PNG is published next to the final PPTX and matches run evidence.'
          : `Compare delivery gate failed with ${blockers.length} blocker(s).`,
    },
  }
}

function writeReport(args, report) {
  if (existsSync(args.output) && !args.overwrite) {
    throw new Error(
      `output already exists: ${args.output}; use --overwrite for a current-run gate artifact`,
    )
  }
  mkdirSync(dirname(args.output), { recursive: true })
  const text = `${JSON.stringify(report, null, 2)}\n`
  writeFileSync(args.output, text)
  if (args.json) process.stdout.write(text)
  else {
    process.stdout.write(`${report.compareStem} gate: ${report.status}\n`)
    process.stdout.write(`${report.agentSummary.message}\n`)
    process.stdout.write(`report: ${args.output}\n`)
  }
}

try {
  const args = parseArgs(process.argv.slice(2))
  const report = buildReport(args)
  writeReport(args, report)
  if (report.status === 'fail') process.exit(2)
} catch (error) {
  process.stderr.write(`[error] ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}
