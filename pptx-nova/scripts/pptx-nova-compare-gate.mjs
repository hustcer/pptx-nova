#!/usr/bin/env node
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createHash } from 'node:crypto'
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

function multipartSiblingPattern(finalPptx, compareStem) {
  return new RegExp(
    `^${escapeRegex(stem(finalPptx))}-${escapeRegex(compareStem)}-(\\d{10})-(\\d{2,})\\.png$`,
  )
}

function makeMultipartSiblingPaths(args, partCount) {
  let timestamp = args.timestamp || timestampNow()
  if (!validateTimestamp(timestamp))
    throw new Error(`--timestamp must use MMDDhhmmss: ${timestamp}`)
  const width = Math.max(2, String(partCount).length)
  const dir = dirname(args.finalPptx)
  const base = stem(args.finalPptx)
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const paths = Array.from({ length: partCount }, (_, index) =>
      join(
        dir,
        `${base}-${args.compareStem}-${timestamp}-${String(index + 1).padStart(width, '0')}.png`,
      ),
    )
    if (args.overwrite || paths.every((path) => !existsSync(path))) return { timestamp, paths }
    timestamp = addSecond(timestamp)
  }
  throw new Error('Could not find a collision-free timestamp for multipart sibling paths')
}

function findMultipartSiblings(args, partCount) {
  const dir = dirname(args.finalPptx)
  if (!existsSync(dir)) return { timestamp: null, paths: [] }
  const pattern = multipartSiblingPattern(args.finalPptx, args.compareStem)
  const groups = new Map()
  for (const name of readdirSync(dir)) {
    const match = name.match(pattern)
    if (!match || !validateTimestamp(match[1])) continue
    const group = groups.get(match[1]) ?? []
    group.push({ number: Number(match[2]), path: join(dir, name) })
    groups.set(match[1], group)
  }
  const timestamp = [...groups.keys()].sort().at(-1) ?? null
  if (!timestamp) return { timestamp: null, paths: [] }
  const paths = groups
    .get(timestamp)
    .sort((a, b) => a.number - b.number)
    .map((item) => item.path)
  return paths.length === partCount ? { timestamp, paths } : { timestamp, paths: [] }
}

function publishMultipartParts(partStates, siblingPaths) {
  const staged = siblingPaths.map(
    (path, index) => `${path}.pptx-nova-${process.pid}-${Date.now()}-${index + 1}.tmp`,
  )
  try {
    for (let index = 0; index < partStates.length; index += 1) {
      copyFileSync(partStates[index].path, staged[index])
    }
    for (let index = 0; index < staged.length; index += 1) {
      renameSync(staged[index], siblingPaths[index])
    }
  } catch (error) {
    for (const path of [...staged, ...siblingPaths]) rmSync(path, { force: true })
    throw error
  }
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

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function coverageFromParts(parts, slideCount) {
  const counts = new Map()
  for (const part of parts) {
    for (const slide of Array.isArray(part.slides) ? part.slides : []) {
      counts.set(slide, (counts.get(slide) ?? 0) + 1)
    }
  }
  const expected = Array.from({ length: slideCount }, (_, index) => index + 1)
  return {
    missingSlides: expected.filter((slide) => !counts.has(slide)),
    duplicateSlides: expected.filter((slide) => (counts.get(slide) ?? 0) > 1),
    outOfRangeSlides: [...counts.keys()].filter((slide) => slide < 1 || slide > slideCount),
  }
}

function validateMultipartManifest(report, blockers) {
  if (report.status !== 'success') blockers.push('multipart compare manifest status is not success')
  if (!Number.isInteger(report.slideCount) || report.slideCount <= 0) {
    blockers.push('multipart compare manifest slideCount is missing or invalid')
  }
  if (!Array.isArray(report.parts) || report.parts.length < 2) {
    blockers.push('multipart compare manifest must contain at least two parts')
    return []
  }
  for (const [label, endpoint] of [
    ['source', report.source],
    ['candidate', report.candidate],
  ]) {
    const path = typeof endpoint?.path === 'string' ? resolve(endpoint.path) : ''
    const state = fileState(path || join(process.cwd(), '__missing__'))
    if (!state.exists || !state.isFile) blockers.push(`multipart ${label} file is missing: ${path}`)
    else if (endpoint.sha256 !== sha256(path)) {
      blockers.push(`multipart ${label} SHA-256 does not match manifest`)
    }
  }
  const states = report.parts.map((part, index) => {
    const label = `multipart part ${index + 1}`
    const path = typeof part.path === 'string' ? resolve(part.path) : ''
    const state = fileState(path || join(process.cwd(), '__missing__'))
    if (!path) blockers.push(`${label} path is missing`)
    else if (!state.exists || !state.isFile || state.byteLength <= 0) {
      blockers.push(`${label} PNG is missing or empty: ${path}`)
    }
    if (state.exists && part.byteLength !== state.byteLength) {
      blockers.push(`${label} byteLength does not match manifest`)
    }
    if (state.exists && part.sha256 !== sha256(path)) {
      blockers.push(`${label} SHA-256 does not match manifest`)
    }
    if (!Array.isArray(part.slides) || part.slides.length === 0) {
      blockers.push(`${label} slides are missing`)
    }
    if (part.pairCount !== part.slides?.length) {
      blockers.push(`${label} pairCount does not match its slide coverage`)
    }
    if (![192, 144].includes(part.dpi)) blockers.push(`${label} DPI must be 192 or 144`)
    if (part.agentGate?.passed !== true && part.agentGate?.status !== 'pass') {
      blockers.push(`${label} agent gate did not pass`)
    }
    const partReportPath = typeof part.reportPath === 'string' ? resolve(part.reportPath) : ''
    const partReportState = fileState(partReportPath || join(process.cwd(), '__missing__'))
    if (!partReportState.exists || !partReportState.isFile) {
      blockers.push(`${label} JSON report is missing: ${partReportPath || '(unset)'}`)
    } else {
      const partReport = readJson(partReportPath)
      if (partReport.schemaVersion !== 'pptx-contact-diff/v1' || partReport.status !== 'success') {
        blockers.push(`${label} JSON report is not a successful pptx-contact-diff/v1 report`)
      }
      for (const outputPath of reportImagePaths(partReport)) {
        if (resolve(outputPath) !== path)
          blockers.push(`${label} JSON output path does not match PNG`)
      }
      const reportPairCount = reportNumber(
        partReport.agentGate?.pairCount,
        partReport.summary?.pairCount,
      )
      if (reportPairCount !== part.pairCount) {
        blockers.push(`${label} JSON pairCount does not match manifest`)
      }
      const reportDpi = reportNumber(partReport.render?.dpi, partReport.summary?.dpi)
      if (reportDpi !== part.dpi) blockers.push(`${label} JSON DPI does not match manifest`)
      if (
        !Array.isArray(partReport.scope?.slides) ||
        JSON.stringify(partReport.scope.slides) !== JSON.stringify(part.slides)
      ) {
        blockers.push(`${label} JSON scope does not match manifest slides`)
      }
    }
    const attempts = Array.isArray(part.attempts) ? part.attempts : []
    if (
      part.dpi === 192 &&
      !(attempts.length === 1 && attempts[0]?.dpi === 192 && attempts[0]?.status === 'success')
    ) {
      blockers.push(`${label} attempt history is invalid for a 192 DPI part`)
    }
    if (
      part.dpi === 144 &&
      !(
        attempts.length === 2 &&
        attempts[0]?.dpi === 192 &&
        attempts[0]?.status === 'failed' &&
        attempts[0]?.error?.retryable === true &&
        (attempts[0]?.error?.kind === 'RenderError' ||
          attempts[0]?.error?.code === 'RenderError') &&
        attempts[1]?.dpi === 144 &&
        attempts[1]?.status === 'success'
      )
    ) {
      blockers.push(`${label} attempt history does not prove an allowed 192 to 144 retry`)
    }
    return {
      ...state,
      partNumber: part.partNumber,
      selector: part.selector,
      dpi: part.dpi,
      sha256: part.sha256,
    }
  })
  if (Number.isInteger(report.slideCount) && report.slideCount > 0) {
    const coverage = coverageFromParts(report.parts, report.slideCount)
    if (coverage.missingSlides.length > 0) {
      blockers.push(`multipart coverage has missing slides: ${coverage.missingSlides.join(',')}`)
    }
    if (coverage.duplicateSlides.length > 0) {
      blockers.push(
        `multipart coverage has duplicate slides: ${coverage.duplicateSlides.join(',')}`,
      )
    }
    if (coverage.outOfRangeSlides.length > 0) {
      blockers.push(
        `multipart coverage has out-of-range slides: ${coverage.outOfRangeSlides.join(',')}`,
      )
    }
  }
  if (report.agentGate?.passed !== true && report.agentGate?.status !== 'pass') {
    blockers.push('multipart compare manifest agent gate did not pass')
  }
  return states
}

function reportNumber(...values) {
  for (const value of values) {
    if (Number.isFinite(value)) return value
  }
  return null
}

function reportImagePaths(report) {
  const paths = [report.output, report.outputPath, report.render?.path, report.contactSheet?.path]
    .filter((path) => typeof path === 'string' && path.trim())
    .map((path) => path.trim())
  return [...new Set(paths)]
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

function validateXdocContactDiffReport(report, compareState, blockers) {
  if (report.status !== 'success') blockers.push('contact-diff report status is not success')
  const gate = report.agentGate ?? {}
  if (gate.passed !== true && gate.status !== 'pass') {
    blockers.push('contact-diff agent gate did not pass')
  }
  const scopeMode = gate.scopeMode ?? report.summary?.scopeMode
  if (scopeMode !== 'all-slides') {
    blockers.push(
      scopeMode
        ? 'contact-diff report was generated with a scoped slide selection'
        : 'contact-diff scopeMode is missing; final delivery requires all-slides contact-diff',
    )
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
  const outputPaths = reportImagePaths(report)
  if (outputPaths.length === 0) {
    blockers.push('contact-diff output path is missing')
  }
  for (const outputPath of outputPaths) {
    if (resolve(outputPath) !== compareState.path) {
      blockers.push(`contact-diff output differs from checked compare path: ${outputPath}`)
    }
  }
  const dpi = reportNumber(report.render?.dpi, report.summary?.dpi)
  if (![192, 144].includes(dpi)) blockers.push('contact-diff DPI must be 192 or 144')
  const attempts = report.pptxNovaCompare?.attempts
  if (Array.isArray(attempts)) {
    const valid192 =
      dpi === 192 &&
      attempts.length === 1 &&
      attempts[0]?.dpi === 192 &&
      attempts[0]?.status === 'success'
    const valid144 =
      dpi === 144 &&
      attempts.length === 2 &&
      attempts[0]?.dpi === 192 &&
      attempts[0]?.status === 'failed' &&
      attempts[0]?.error?.retryable === true &&
      (attempts[0]?.error?.kind === 'RenderError' || attempts[0]?.error?.code === 'RenderError') &&
      attempts[1]?.dpi === 144 &&
      attempts[1]?.status === 'success'
    if (!valid192 && !valid144)
      blockers.push('contact-diff attempt history does not prove an allowed DPI policy')
  }
}

function validateReport(args, report, compareState, blockers, warnings) {
  if (report.__parseError) {
    blockers.push(`compare report is not valid JSON: ${report.__parseError}`)
    return
  }
  if (report.schemaVersion === 'pptx-contact-diff/v1') {
    validateXdocContactDiffReport(report, compareState, blockers)
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
  if (!reportState.exists) blockers.push(`compare report is missing: ${args.report}`)
  else if (!reportState.isFile) blockers.push(`compare report is not a file: ${args.report}`)

  const compareReport = reportState.exists && reportState.isFile ? readJson(args.report) : null
  const multipart = compareReport?.schemaVersion === 'pptx-nova-compare-manifest/v1'
  let partStates = []
  let sibling = ''
  let siblingState = fileState(join(dirname(args.finalPptx), '__missing__'))
  let siblingPaths = []
  let siblingStates = []
  let timestamp = null
  if (multipart) {
    partStates = validateMultipartManifest(compareReport, blockers)
    const selection = args.publish
      ? makeMultipartSiblingPaths(args, partStates.length)
      : findMultipartSiblings(args, partStates.length)
    timestamp = selection.timestamp
    siblingPaths = selection.paths
    if (!timestamp || siblingPaths.length !== partStates.length) {
      blockers.push(
        `no complete multipart sibling set found matching ${stem(args.finalPptx)}-${args.compareStem}-<MMDDhhmmss>-<part>.png`,
      )
    }
    if (args.publish && blockers.length === 0) {
      mkdirSync(dirname(args.finalPptx), { recursive: true })
      publishMultipartParts(partStates, siblingPaths)
    }
    siblingStates = siblingPaths.map((path, index) => {
      const state = fileState(path)
      if (!state.exists || !state.isFile || state.byteLength <= 0) {
        blockers.push(`multipart sibling ${index + 1} is missing or empty: ${path}`)
      } else if (state.byteLength !== partStates[index]?.byteLength) {
        blockers.push(`multipart sibling ${index + 1} byteLength does not match run evidence`)
      } else if (sha256(path) !== partStates[index]?.sha256) {
        blockers.push(`multipart sibling ${index + 1} SHA-256 does not match run evidence`)
      }
      return { ...state, partNumber: index + 1, sha256: state.exists ? sha256(path) : null }
    })
    sibling = siblingPaths[0] || ''
    siblingState = siblingStates[0] ?? siblingState
  } else {
    if (!compareState.exists) blockers.push(`run-directory compare PNG is missing: ${args.compare}`)
    else if (!compareState.isFile) blockers.push(`compare PNG is not a file: ${args.compare}`)
    else if (compareState.byteLength <= 0) blockers.push('compare PNG is empty')
    if (compareReport) validateReport(args, compareReport, compareState, blockers, warnings)
    sibling = args.publish ? makeSiblingPath(args) : findSibling(args)
    if (args.publish && blockers.length === 0) {
      if (existsSync(sibling) && !args.overwrite) {
        blockers.push(`sibling compare PNG already exists: ${sibling}`)
      } else {
        mkdirSync(dirname(sibling), { recursive: true })
        copyFileSync(args.compare, sibling)
      }
    }
    siblingState = sibling
      ? fileState(sibling)
      : fileState(join(dirname(args.finalPptx), '__missing__'))
    const pattern = siblingPattern(args.finalPptx, args.compareStem)
    const siblingBase = sibling ? basename(sibling) : ''
    timestamp = siblingBase.match(pattern)?.[1] || null
    if (!sibling) {
      blockers.push(
        `no sibling compare PNG found next to final PPTX matching ${stem(args.finalPptx)}-${args.compareStem}-<MMDDhhmmss>.png`,
      )
    } else {
      if (dirname(sibling) !== dirname(args.finalPptx))
        blockers.push('sibling compare PNG is not next to final PPTX')
      if (!pattern.test(siblingBase))
        blockers.push(`sibling compare PNG has invalid name: ${siblingBase}`)
      if (!siblingState.exists || !siblingState.isFile || siblingState.byteLength <= 0) {
        blockers.push(`sibling compare PNG is missing or empty: ${sibling}`)
      } else if (!sameSize(compareState, siblingState)) {
        blockers.push('sibling compare PNG byteLength does not match run-directory compare PNG')
      }
    }
  }
  const reportSummary = multipart
    ? {
        schemaVersion: compareReport.schemaVersion,
        status: compareReport.status,
        pageCount: compareReport.slideCount,
        partCount: compareReport.parts?.length ?? 0,
        slideSelector: null,
        width: null,
        height: null,
        byteLength: null,
      }
    : compareReportSummary(compareReport)

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
    parts: partStates,
    compareReport: {
      path: args.report,
      exists: reportState.exists,
      ...reportSummary,
    },
    sibling: {
      ...siblingState,
      requiredPattern: multipart
        ? `${stem(args.finalPptx)}-${args.compareStem}-<MMDDhhmmss>-<part>.png`
        : `${stem(args.finalPptx)}-${args.compareStem}-<MMDDhhmmss>.png`,
      timestamp,
    },
    siblings: siblingStates,
    blockers,
    warnings,
    agentSummary: {
      status,
      siblingPath: sibling || siblingPaths[0] || null,
      siblingPaths: siblingPaths.length > 0 ? siblingPaths : sibling ? [sibling] : [],
      message:
        status === 'pass'
          ? multipart
            ? 'The complete numbered compare PNG set is published next to the final PPTX and matches run evidence.'
            : 'Compare PNG is published next to the final PPTX and matches run evidence.'
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
