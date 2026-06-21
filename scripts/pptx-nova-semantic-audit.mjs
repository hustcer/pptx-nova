#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SCHEMA_VERSION = 'pptx-nova-semantic-audit/v1'
const CHART_OPS_WITH_DATA = new Set(['add-chart', 'replace-chart-data'])
const TABLE_OPS_WITH_DATA = new Set(['add-table', 'set-table-data', 'import-table-data'])
const CHART_SHAPE_TYPES = new Set(['chart', 'graphicFrameChart'])
const TABLE_SHAPE_TYPES = new Set(['table', 'graphicFrameTable'])
const SCATTER_KINDS = new Set(['scatter', 'bubble', 'bubble3d'])
const PIE_KINDS = new Set(['pie', 'pie3d', 'doughnut'])
const STOCK_KINDS = new Set(['stock'])

const usage =
  'Usage:\n' +
  '  node <skill-root>/scripts/pptx-nova-semantic-audit.mjs [options]\n\n' +
  'Options:\n' +
  '  --deck-lock <path>      Optional deck_lock.json for slide intent and source metadata.\n' +
  '  --lock <path>           Alias for --deck-lock.\n' +
  '  --patch <path>          Required patch.json containing chart/table ops.\n' +
  '  --final-inspect <path>  Optional final xdoc pptx inspect JSON.\n' +
  '  --inspect <path>        Alias for --final-inspect.\n' +
  '  --output <path>         Optional output path. Defaults to semantic-audit.json in cwd.\n' +
  '  --json                  Print the report to stdout.\n' +
  '  --help                  Show this help.\n\n' +
  'This lightweight audit validates common chart/table data-shape mistakes,\n' +
  'source/claim disclosure, and final native object presence. It intentionally\n' +
  'does not perform full OOXML chart XML equivalence.\n'

function parseArgs(argv) {
  const args = {
    deckLock: '',
    patch: '',
    finalInspect: '',
    output: resolve('semantic-audit.json'),
    json: false,
  }
  const flags = {
    '--deck-lock': 'deckLock',
    '--lock': 'deckLock',
    '--patch': 'patch',
    '--final-inspect': 'finalInspect',
    '--inspect': 'finalInspect',
    '--output': 'output',
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
    if (!key) throw new Error('Unknown option: ' + arg + '\n\n' + usage)
    if (!value || value.startsWith('--')) throw new Error(arg + ' requires a value')
    args[key] = resolve(value)
    index += 1
  }
  if (!args.patch) throw new Error('--patch is required\n\n' + usage)
  return args
}

function readJson(path, label) {
  if (!path) return null
  if (!existsSync(path)) throw new Error(label + ' does not exist: ' + path)
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(label + ' is not valid JSON: ' + error.message)
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function issue(target, level, code, message, details = {}) {
  const item = { severity: level, code, message, ...details }
  target[level === 'error' ? 'errors' : 'warnings'].push(item)
}

function hasText(value) {
  return typeof value === 'string' ? value.trim().length > 0 : value !== null && value !== undefined
}

function slideIndexOf(op) {
  const value = op?.slide ?? op?.slideIndex
  return Number.isInteger(value) ? value : null
}

function slideIntent(lock, slideIndex) {
  if (!lock || !Number.isInteger(slideIndex) || !Array.isArray(lock.slides)) return null
  return lock.slides[slideIndex] ?? null
}

function sourceOf(intent, kind, op) {
  const scoped = intent?.[kind]
  return (
    op?.source ??
    op?.dataSource ??
    op?.data?.source ??
    scoped?.source ??
    scoped?.dataSource ??
    intent?.source ??
    null
  )
}

function sourceStatus(source) {
  if (!source) return 'missing'
  if (typeof source === 'string') return source.trim() ? 'declared' : 'missing'
  if (!isPlainObject(source)) return 'declared'
  if (
    hasText(source.kind) ||
    hasText(source.path) ||
    hasText(source.description) ||
    hasText(source.url) ||
    hasText(source.id)
  ) {
    return 'declared'
  }
  return 'missing'
}

function chartDataOf(op) {
  return op?.data ?? op?.chart?.data ?? null
}

function tableRowsOf(op) {
  if (Array.isArray(op.data)) return op.data
  if (Array.isArray(op.json)) {
    if (op.json.every((row) => isPlainObject(row))) {
      const headers = Object.keys(op.json[0] ?? {})
      return [headers, ...op.json.map((row) => headers.map((header) => row[header]))]
    }
    return op.json
  }
  return []
}

function dataSeriesValues(series) {
  if (!isPlainObject(series)) return []
  if (Array.isArray(series.values)) return series.values
  if (Array.isArray(series.points)) return series.points
  return []
}

function numericLike(value) {
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'string') return value.trim() !== '' && Number.isFinite(Number(value))
  return false
}

function pointNumeric(point, fields) {
  if (!isPlainObject(point)) return false
  return fields.every((field) => numericLike(point[field]))
}

function shapeNameOf(op) {
  return op?.name ?? op?.shape?.name ?? op?.target?.name ?? ''
}

function inspectSlides(inspect) {
  return Array.isArray(inspect?.slides) ? inspect.slides : []
}

function inspectShapes(inspect, slideIndex) {
  const slides = inspectSlides(inspect)
  const slide =
    slides.find((item) => item?.index === slideIndex || item?.slideIndex === slideIndex) ??
    slides[slideIndex] ??
    null
  return Array.isArray(slide?.shapes) ? slide.shapes : []
}

function normalizedShapeType(shape) {
  return String(shape?.shapeType ?? shape?.type ?? '').trim()
}

function findNativeShape(inspect, slideIndex, expectedTypes, name) {
  if (!inspect || !Number.isInteger(slideIndex)) return { status: 'not-checked', shape: null }
  const shapes = inspectShapes(inspect, slideIndex)
  const matchingType = shapes.filter((shape) => expectedTypes.has(normalizedShapeType(shape)))
  if (name) {
    const exact = matchingType.find((shape) => shape?.name === name)
    if (exact) return { status: 'found', shape: exact }
    const anyName = shapes.find((shape) => shape?.name === name)
    if (anyName) return { status: 'wrong-type', shape: anyName }
  }
  if (matchingType.length > 0) return { status: 'found-by-type', shape: matchingType[0] }
  return { status: 'missing', shape: null }
}

function addCheck(item, name, status, details = {}) {
  item.checks[name] = { status, ...details }
}

function finalizeItem(item) {
  item.status = item.errors.length > 0 ? 'fail' : item.warnings.length > 0 ? 'warn' : 'pass'
}

function auditChartOp(op, index, lock, inspect) {
  const slideIndex = slideIndexOf(op)
  const intent = slideIntent(lock, slideIndex)
  const source = sourceOf(intent, 'chart', op)
  const item = {
    opIndex: index,
    op: op.op,
    slide: slideIndex,
    shape: shapeNameOf(op) || null,
    kind: op.kind ?? intent?.chart?.kind ?? null,
    source: source ?? null,
    status: 'pass',
    checks: {},
    errors: [],
    warnings: [],
  }
  const kind = String(item.kind ?? '').toLowerCase()
  const data = chartDataOf(op)
  const series = Array.isArray(data?.series) ? data.series : []
  const categories = Array.isArray(data?.categories) ? data.categories : null

  if (!data) {
    issue(item, 'warning', 'chart-data-missing', 'chart op has no disclosed data object')
    addCheck(item, 'dataShape', 'warning')
  } else {
    let dataShape = 'passed'
    if (series.length === 0 && !STOCK_KINDS.has(kind)) {
      issue(item, 'error', 'chart-series-missing', 'chart must disclose at least one data series')
      dataShape = 'failed'
    }
    if (categories && series.length > 0) {
      for (const [seriesIndex, seriesItem] of series.entries()) {
        if (Array.isArray(seriesItem?.values) && seriesItem.values.length !== categories.length) {
          issue(
            item,
            'error',
            'chart-series-category-mismatch',
            'series[' +
              seriesIndex +
              '] has ' +
              seriesItem.values.length +
              ' value(s), categories has ' +
              categories.length,
          )
          dataShape = 'failed'
        }
      }
    }
    if (SCATTER_KINDS.has(kind)) {
      for (const [seriesIndex, seriesItem] of series.entries()) {
        if (!Array.isArray(seriesItem?.points)) {
          issue(
            item,
            'error',
            'chart-points-required',
            kind + ' series[' + seriesIndex + '] must use points[] instead of categories/values',
          )
          dataShape = 'failed'
        } else {
          const fields = kind.startsWith('bubble') ? ['x', 'y', 'size'] : ['x', 'y']
          seriesItem.points.forEach((point, pointIndex) => {
            if (!pointNumeric(point, fields)) {
              issue(
                item,
                'error',
                'chart-point-nonnumeric',
                kind +
                  ' series[' +
                  seriesIndex +
                  '].points[' +
                  pointIndex +
                  '] must disclose numeric ' +
                  fields.join('/'),
              )
              dataShape = 'failed'
            }
          })
        }
      }
    }
    if (PIE_KINDS.has(kind) && series.length > 1) {
      issue(item, 'warning', 'chart-pie-multi-series', kind + ' usually expects one series')
      if (dataShape === 'passed') dataShape = 'warning'
    }
    if (STOCK_KINDS.has(kind)) {
      const length = Array.isArray(data?.categories) ? data.categories.length : null
      for (const field of ['open', 'high', 'low', 'close']) {
        if (field === 'open' && !Array.isArray(data?.open)) continue
        if (!Array.isArray(data?.[field])) {
          issue(
            item,
            'error',
            'chart-stock-field-missing',
            'stock chart must disclose ' + field + '[]',
          )
          dataShape = 'failed'
        } else if (Number.isInteger(length) && data[field].length !== length) {
          issue(
            item,
            'error',
            'chart-stock-field-length-mismatch',
            'stock ' +
              field +
              '[] has ' +
              data[field].length +
              ' value(s), categories has ' +
              length,
          )
          dataShape = 'failed'
        }
      }
    }
    for (const [seriesIndex, seriesItem] of series.entries()) {
      if (!hasText(seriesItem?.name)) {
        issue(
          item,
          'warning',
          'chart-series-name-missing',
          'series[' + seriesIndex + '] has no readable name',
        )
        if (dataShape === 'passed') dataShape = 'warning'
      }
      for (const [valueIndex, value] of dataSeriesValues(seriesItem).entries()) {
        if (isPlainObject(value)) continue
        if (typeof value === 'string' && value.includes('%')) {
          issue(
            item,
            'warning',
            'chart-percent-string-value',
            'series[' + seriesIndex + '] value[' + valueIndex + '] is a percent string',
          )
          if (dataShape === 'passed') dataShape = 'warning'
        } else if (!numericLike(value)) {
          issue(
            item,
            'error',
            'chart-value-nonnumeric',
            'series[' + seriesIndex + '] value[' + valueIndex + '] is not numeric',
          )
          dataShape = 'failed'
        }
      }
    }
    addCheck(item, 'dataShape', dataShape)
  }

  const sourceDeclared = sourceStatus(source) === 'declared'
  if (!sourceDeclared) {
    issue(
      item,
      'warning',
      'chart-source-missing',
      'chart should disclose source.kind/path/description',
    )
  }
  addCheck(item, 'source', sourceDeclared ? 'passed' : 'warning')

  const supportsClaim = hasText(intent?.claimTitle) || isPlainObject(intent?.proofObject)
  if (!supportsClaim) {
    issue(
      item,
      'warning',
      'chart-claim-support-missing',
      'chart slide should disclose claimTitle or proofObject',
    )
  }
  addCheck(item, 'claimSupport', supportsClaim ? 'passed' : 'warning')

  const native = findNativeShape(inspect, slideIndex, CHART_SHAPE_TYPES, item.shape)
  if (native.status === 'wrong-type' || native.status === 'missing') {
    issue(
      item,
      'error',
      'chart-native-object-missing',
      'final inspect does not show a native chart object',
      {
        inspectStatus: native.status,
        shapeType: normalizedShapeType(native.shape) || null,
      },
    )
    addCheck(item, 'finalNativeObject', 'failed', { inspectStatus: native.status })
  } else if (native.status === 'not-checked') {
    addCheck(item, 'finalNativeObject', 'not-checked')
  } else {
    addCheck(item, 'finalNativeObject', 'passed', { inspectStatus: native.status })
  }

  finalizeItem(item)
  return item
}

function auditTableOp(op, index, lock, inspect) {
  const slideIndex = slideIndexOf(op)
  const intent = slideIntent(lock, slideIndex)
  const source = sourceOf(intent, 'table', op)
  const rows = tableRowsOf(op)
  const item = {
    opIndex: index,
    op: op.op,
    slide: slideIndex,
    shape: shapeNameOf(op) || null,
    source: source ?? null,
    status: 'pass',
    checks: {},
    errors: [],
    warnings: [],
  }

  let rowColumnStatus = 'passed'
  if (op.op === 'add-table') {
    if (!Number.isInteger(op.rows) || op.rows <= 0) {
      issue(item, 'error', 'table-rows-invalid', 'add-table must declare positive rows')
      rowColumnStatus = 'failed'
    }
    if (!Number.isInteger(op.cols) || op.cols <= 0) {
      issue(item, 'error', 'table-cols-invalid', 'add-table must declare positive cols')
      rowColumnStatus = 'failed'
    }
  }
  if (rows.length > 0) {
    const width = Array.isArray(rows[0]) ? rows[0].length : null
    rows.forEach((row, rowIndex) => {
      if (!Array.isArray(row)) {
        issue(item, 'error', 'table-row-invalid', 'data row ' + rowIndex + ' is not an array')
        rowColumnStatus = 'failed'
      } else if (Number.isInteger(width) && row.length !== width) {
        issue(
          item,
          'error',
          'table-row-width-mismatch',
          'data row ' + rowIndex + ' has ' + row.length + ' cell(s), expected ' + width,
        )
        rowColumnStatus = 'failed'
      }
    })
    if (op.cols && Number.isInteger(width) && width !== op.cols && op.resize !== true) {
      issue(
        item,
        'error',
        'table-data-cols-mismatch',
        'data has ' + width + ' column(s), table has ' + op.cols + '; set resize=true or fix data',
      )
      rowColumnStatus = 'failed'
    }
    if (op.rows && rows.length !== op.rows && op.resize !== true) {
      issue(
        item,
        'error',
        'table-data-rows-mismatch',
        'data has ' +
          rows.length +
          ' row(s), table has ' +
          op.rows +
          '; set resize=true or fix data',
      )
      rowColumnStatus = 'failed'
    }
  } else if (TABLE_OPS_WITH_DATA.has(op.op)) {
    issue(item, 'warning', 'table-data-missing', 'table op has no disclosed rows to validate')
    if (rowColumnStatus === 'passed') rowColumnStatus = 'warning'
  }
  addCheck(item, 'rowColumnShape', rowColumnStatus)

  const header = rows.find((row) => Array.isArray(row) && row.some((cell) => hasText(cell)))
  const headerValues = Array.isArray(header) ? header.map((cell) => String(cell ?? '').trim()) : []
  const hasHeader = headerValues.length > 0 && headerValues.some(Boolean)
  const duplicateHeaders = headerValues.filter(
    (cell, index) => cell && headerValues.indexOf(cell) !== index,
  )
  if (!hasHeader)
    issue(item, 'warning', 'table-header-missing', 'table should disclose a readable header row')
  if (duplicateHeaders.length > 0) {
    issue(item, 'warning', 'table-header-duplicate', 'table has duplicate header labels', {
      duplicateHeaders: [...new Set(duplicateHeaders)],
    })
  }
  addCheck(
    item,
    'headerPresence',
    hasHeader ? (duplicateHeaders.length > 0 ? 'warning' : 'passed') : 'warning',
  )

  const sourceDeclared = sourceStatus(source) === 'declared'
  if (!sourceDeclared) {
    issue(
      item,
      'warning',
      'table-source-missing',
      'table should disclose source.kind/path/description',
    )
  }
  addCheck(item, 'source', sourceDeclared ? 'passed' : 'warning')

  const hasUnitOrTime =
    hasText(intent?.table?.unit) ||
    hasText(intent?.table?.timeRange) ||
    hasText(intent?.unit) ||
    hasText(intent?.timeRange) ||
    rows
      .flat()
      .some((cell) => /[%$€¥]|q[1-4]|fy\d{2,4}|20\d{2}|单位|unit/i.test(String(cell ?? '')))
  if (!hasUnitOrTime) {
    issue(
      item,
      'warning',
      'table-unit-time-missing',
      'table should disclose unit or time range when applicable',
    )
  }
  addCheck(item, 'unitOrTimeContext', hasUnitOrTime ? 'passed' : 'warning')

  const native = findNativeShape(inspect, slideIndex, TABLE_SHAPE_TYPES, item.shape)
  if (native.status === 'wrong-type' || native.status === 'missing') {
    issue(
      item,
      'error',
      'table-native-object-missing',
      'final inspect does not show a native table object',
      {
        inspectStatus: native.status,
        shapeType: normalizedShapeType(native.shape) || null,
      },
    )
    addCheck(item, 'finalNativeObject', 'failed', { inspectStatus: native.status })
  } else if (native.status === 'not-checked') {
    addCheck(item, 'finalNativeObject', 'not-checked')
  } else {
    addCheck(item, 'finalNativeObject', 'passed', { inspectStatus: native.status })
  }

  finalizeItem(item)
  return item
}

function finishReport(report) {
  report.summary.errors = report.errors.length
  report.summary.warnings = report.warnings.length
  report.status = report.errors.length > 0 ? 'fail' : report.warnings.length > 0 ? 'warn' : 'pass'
  return report
}

function makeReport(args, lock, patch, inspect) {
  const report = {
    schemaVersion: SCHEMA_VERSION,
    status: 'pass',
    artifacts: {
      deckLock: args.deckLock || null,
      patch: args.patch,
      finalInspect: args.finalInspect || null,
    },
    summary: {
      charts: 0,
      tables: 0,
      errors: 0,
      warnings: 0,
    },
    charts: [],
    tables: [],
    errors: [],
    warnings: [],
  }

  if (patch?.schemaVersion !== 1) {
    issue(report, 'error', 'patch-schema-version', 'patch.json schemaVersion must be 1')
  }
  if (!Array.isArray(patch?.ops)) {
    issue(report, 'error', 'patch-ops-missing', 'patch.json must contain ops[]')
    return finishReport(report)
  }
  if (inspect && inspect?.status !== 'success') {
    issue(report, 'error', 'final-inspect-failed', 'final inspect did not succeed', {
      status: inspect?.status ?? null,
    })
  }

  patch.ops.forEach((op, index) => {
    if (!isPlainObject(op)) return
    if (CHART_OPS_WITH_DATA.has(op.op)) report.charts.push(auditChartOp(op, index, lock, inspect))
    if (TABLE_OPS_WITH_DATA.has(op.op)) report.tables.push(auditTableOp(op, index, lock, inspect))
  })

  report.summary.charts = report.charts.length
  report.summary.tables = report.tables.length
  if (report.charts.length === 0 && report.tables.length === 0) {
    issue(
      report,
      'warning',
      'semantic-audit-no-chart-table-ops',
      'patch has no chart/table data ops to audit',
    )
  }
  for (const item of [...report.charts, ...report.tables]) {
    for (const error of item.errors)
      report.errors.push({ ...error, opIndex: item.opIndex, slide: item.slide })
    for (const warning of item.warnings) {
      report.warnings.push({ ...warning, opIndex: item.opIndex, slide: item.slide })
    }
  }

  return finishReport(report)
}

try {
  const args = parseArgs(process.argv.slice(2))
  const lock = args.deckLock ? readJson(args.deckLock, 'deck_lock.json') : null
  const patch = readJson(args.patch, 'patch.json')
  const inspect = args.finalInspect ? readJson(args.finalInspect, 'final inspect') : null
  const report = makeReport(args, lock, patch, inspect)
  writeFileSync(args.output, JSON.stringify(report, null, 2) + '\n')
  if (args.json) process.stdout.write(JSON.stringify(report, null, 2) + '\n')
  else {
    process.stdout.write('pptx-nova semantic audit: ' + report.status + '\n')
    process.stdout.write('- charts: ' + report.summary.charts + '\n')
    process.stdout.write('- tables: ' + report.summary.tables + '\n')
    process.stdout.write('- errors: ' + report.summary.errors + '\n')
    process.stdout.write('- warnings: ' + report.summary.warnings + '\n')
    process.stdout.write('- report: ' + args.output + '\n')
  }
  if (report.status === 'fail') process.exitCode = 1
} catch (error) {
  process.stderr.write(error.message + '\n')
  process.exitCode = 1
}
