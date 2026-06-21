#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SCHEMA_VERSION = 'pptx-nova-layout-snapshot/v1'
const EMU_PER_INCH = 914400
const DEFAULT_TEXT_RE =
  /^(click to add|click to add title|click to add subtitle|title goes here|subtitle goes here|name goes here|date|footer|slide number|单击此处|单击添加|添加标题|添加副标题|页脚|日期|幻灯片编号)$/i

const usage = `Usage:
  node <skill-root>/scripts/pptx-nova-layout-snapshot.mjs --inspect final-inspect.json [options]

Options:
  --inspect <path>  Required xdoc pptx inspect JSON for the final deck.
  --output <path>   Optional output path. Defaults to stdout only.
  --json            Print machine-readable layout snapshot.
  --help            Show this help.

This script normalizes inspect JSON into layout-final.json. It reports structural
layout risks as warnings but does not act as a hard quality gate.
`

function parseArgs(argv) {
  const args = {
    inspect: '',
    output: '',
    json: false,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(usage)
      process.exit(0)
    } else if (arg === '--json') {
      args.json = true
    } else if (arg === '--inspect') {
      args.inspect = resolve(valueAfter(argv, i, arg))
      i += 1
    } else if (arg === '--output') {
      args.output = resolve(valueAfter(argv, i, arg))
      i += 1
    } else {
      throw new Error(`Unknown option: ${arg}\n\n${usage}`)
    }
  }
  if (!args.inspect) throw new Error(`--inspect is required\n\n${usage}`)
  return args
}

function valueAfter(argv, index, flag) {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

function readJson(path, label) {
  if (!existsSync(path)) throw new Error(`${label} does not exist: ${path}`)
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`Failed to read ${label} at ${path}: ${error.message}`)
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function numberOrNull(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function compact(values) {
  return values.filter((value) => value !== null && value !== undefined && value !== '')
}

function unique(values) {
  return [...new Set(values)]
}

function pushRisk(list, severity, code, message, details = {}) {
  list.push({ severity, code, message, ...details })
}

function slideCountOf(inspect) {
  const count = numberOrNull(inspect?.presentation?.slideCount)
  if (Number.isInteger(count) && count >= 0) return count
  return asArray(inspect?.slides).length
}

function parseDimensionToEmu(value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const text = String(value).trim()
  const match = text.match(/^(-?\d+(?:\.\d+)?)(in|inch|cm|mm|pt|px|emu)?$/i)
  if (!match) return null
  const amount = Number(match[1])
  if (!Number.isFinite(amount)) return null
  const unit = (match[2] ?? 'emu').toLowerCase()
  if (unit === 'in' || unit === 'inch') return amount * EMU_PER_INCH
  if (unit === 'cm') return (amount / 2.54) * EMU_PER_INCH
  if (unit === 'mm') return (amount / 25.4) * EMU_PER_INCH
  if (unit === 'pt') return (amount / 72) * EMU_PER_INCH
  if (unit === 'px') return (amount / 96) * EMU_PER_INCH
  return amount
}

function presentationSize(inspect) {
  const size = inspect?.presentation?.size ?? inspect?.presentation?.slideSize ?? inspect?.slideSize
  const widthEmu =
    numberOrNull(size?.wEmu ?? size?.cxEmu ?? size?.widthEmu) ??
    parseDimensionToEmu(size?.width ?? size?.w ?? size?.cx)
  const heightEmu =
    numberOrNull(size?.hEmu ?? size?.cyEmu ?? size?.heightEmu) ??
    parseDimensionToEmu(size?.height ?? size?.h ?? size?.cy)
  return {
    width: size?.width ?? size?.w ?? null,
    height: size?.height ?? size?.h ?? null,
    widthEmu,
    heightEmu,
  }
}

function slideSize(slide, fallback) {
  const size = slide?.size ?? slide?.slideSize
  const widthEmu =
    numberOrNull(size?.wEmu ?? size?.cxEmu ?? size?.widthEmu) ??
    parseDimensionToEmu(size?.width ?? size?.w ?? size?.cx) ??
    fallback.widthEmu
  const heightEmu =
    numberOrNull(size?.hEmu ?? size?.cyEmu ?? size?.heightEmu) ??
    parseDimensionToEmu(size?.height ?? size?.h ?? size?.cy) ??
    fallback.heightEmu
  return {
    width: size?.width ?? size?.w ?? fallback.width,
    height: size?.height ?? size?.h ?? fallback.height,
    widthEmu,
    heightEmu,
  }
}

function bboxOf(shape) {
  const box = shape?.bbox ?? shape?.bounds ?? shape?.frame ?? shape?.position
  if (!isPlainObject(box)) return null
  return {
    xEmu: numberOrNull(box.xEmu ?? box.x ?? box.left),
    yEmu: numberOrNull(box.yEmu ?? box.y ?? box.top),
    wEmu: numberOrNull(box.wEmu ?? box.w ?? box.width ?? box.cx),
    hEmu: numberOrNull(box.hEmu ?? box.h ?? box.height ?? box.cy),
  }
}

function textPreviewOf(shape) {
  return String(shape?.textPreview ?? shape?.text ?? shape?.plainText ?? '').trim()
}

function hasText(shape, textPreview) {
  if (shape?.hasText === true) return true
  if (shape?.hasText === false && !textPreview) return false
  return Boolean(textPreview || asArray(shape?.runs).length || asArray(shape?.textRuns).length)
}

function shapeKind(shape, textPreview) {
  const raw = String(shape?.shapeType ?? shape?.type ?? shape?.kind ?? '').trim()
  const lower = raw.toLowerCase()
  if (shape?.chart || shape?.hasChart || lower.includes('chart')) return 'chart'
  if (shape?.table || shape?.hasTable || lower.includes('table')) return 'table'
  if (shape?.image || shape?.picture || lower.includes('picture') || lower.includes('image')) {
    return 'image'
  }
  if (hasText(shape, textPreview)) return 'text'
  return raw || 'shape'
}

function placeholderOf(shape) {
  const placeholder = shape?.placeholder ?? shape?.ph ?? null
  if (!placeholder) return null
  if (typeof placeholder === 'string') return { type: placeholder, status: null }
  if (!isPlainObject(placeholder)) return { type: String(placeholder), status: null }
  return {
    type: placeholder.type ?? placeholder.kind ?? null,
    idx: placeholder.idx ?? placeholder.index ?? null,
    status: placeholder.status ?? null,
  }
}

function collectRuns(shape) {
  const directRuns = asArray(shape?.runs).concat(asArray(shape?.textRuns))
  const textRuns = asArray(shape?.text?.runs)
  const paragraphs = asArray(shape?.paragraphs ?? shape?.text?.paragraphs)
  const paragraphRuns = paragraphs.flatMap((paragraph) =>
    asArray(paragraph?.runs ?? paragraph?.textRuns),
  )
  return [...directRuns, ...textRuns, ...paragraphRuns]
}

function fontOf(shape) {
  const runs = collectRuns(shape)
  const families = unique(
    compact([
      shape?.fontFamily,
      shape?.fontName,
      shape?.font?.name,
      ...runs.map((run) => run?.fontFamily ?? run?.fontName ?? run?.font?.name),
    ]).map(String),
  )
  const sizesPt = unique(
    compact([
      numberOrNull(shape?.fontSizePt ?? shape?.fontPt),
      fontSizeToPt(shape?.fontSize ?? shape?.font?.size),
      ...runs.map(
        (run) => numberOrNull(run?.fontSizePt ?? run?.fontPt) ?? fontSizeToPt(run?.fontSize),
      ),
    ]),
  )
  const colors = unique(
    compact([
      normalizeColor(shape?.fontColor ?? shape?.color ?? shape?.font?.color),
      ...runs.map((run) => normalizeColor(run?.fontColor ?? run?.color ?? run?.font?.color)),
    ]),
  )
  return { families, sizesPt, colors }
}

function fontSizeToPt(value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const text = String(value).trim()
  const match = text.match(/^(-?\d+(?:\.\d+)?)(pt|px)?$/i)
  if (!match) return null
  const amount = Number(match[1])
  if (!Number.isFinite(amount)) return null
  return (match[2] ?? 'pt').toLowerCase() === 'px' ? amount * 0.75 : amount
}

function normalizeColor(value) {
  if (value === null || value === undefined || value === '') return null
  const text = String(value).trim().replace(/^#/, '')
  return /^[0-9a-f]{6}$/i.test(text) ? `#${text.toUpperCase()}` : String(value)
}

function fillOf(shape) {
  return normalizeColor(shape?.fillColor ?? shape?.fill?.color ?? shape?.fill)
}

function lineOf(shape) {
  if (shape?.lineNoFill === true) return { color: null, width: null, noFill: true }
  const color = normalizeColor(shape?.lineColor ?? shape?.line?.color ?? shape?.strokeColor)
  const width = shape?.lineWidth ?? shape?.line?.width ?? shape?.strokeWidth ?? null
  return color || width ? { color, width, noFill: false } : null
}

function zOrderOf(shape, fallbackIndex) {
  return numberOrNull(shape?.zOrder ?? shape?.z ?? shape?.order ?? shape?.zIndex) ?? fallbackIndex
}

function normalizeShape(shape, slideIndex, shapeIndex, size) {
  const textPreview = textPreviewOf(shape)
  const type = shapeKind(shape, textPreview)
  const bbox = bboxOf(shape)
  const font = fontOf(shape)
  const placeholder = placeholderOf(shape)
  const risks = []
  validateObject({
    risks,
    bbox,
    size,
    type,
    textPreview,
    font,
    placeholder,
    slideIndex,
    shapeIndex,
  })
  return {
    id: shape?.id ?? shape?.shapeId ?? null,
    name: shape?.name ?? shape?.shapeName ?? null,
    type,
    rawType: shape?.shapeType ?? shape?.type ?? shape?.kind ?? null,
    zOrder: zOrderOf(shape, shapeIndex),
    bbox,
    textPreview,
    font,
    fill: fillOf(shape),
    line: lineOf(shape),
    placeholder,
    risks,
  }
}

function validateObject({ risks, bbox, size, type, textPreview, font, placeholder, slideIndex }) {
  if (!bbox) {
    pushRisk(risks, 'warning', 'bbox-missing', 'Object is missing bbox in final inspect', {
      slide: slideIndex,
    })
  } else if (
    bbox.xEmu === null ||
    bbox.yEmu === null ||
    bbox.wEmu === null ||
    bbox.hEmu === null ||
    bbox.wEmu <= 0 ||
    bbox.hEmu <= 0
  ) {
    pushRisk(
      risks,
      'warning',
      'bbox-invalid',
      'Object bbox is missing values or has non-positive size',
      {
        slide: slideIndex,
        bbox,
      },
    )
  } else if (
    Number.isFinite(size.widthEmu) &&
    Number.isFinite(size.heightEmu) &&
    (bbox.xEmu + bbox.wEmu <= 0 ||
      bbox.yEmu + bbox.hEmu <= 0 ||
      bbox.xEmu >= size.widthEmu ||
      bbox.yEmu >= size.heightEmu)
  ) {
    pushRisk(
      risks,
      'warning',
      'bbox-off-canvas',
      'Object bbox is completely outside the slide canvas',
      {
        slide: slideIndex,
        bbox,
      },
    )
  }

  if (placeholder && !textPreview) {
    pushRisk(risks, 'warning', 'empty-placeholder', 'Placeholder object is empty in final layout', {
      slide: slideIndex,
      placeholder,
    })
  }
  if (textPreview && DEFAULT_TEXT_RE.test(textPreview)) {
    pushRisk(
      risks,
      'warning',
      'default-placeholder-text',
      'Object still contains default placeholder text',
      {
        slide: slideIndex,
        textPreview,
      },
    )
  }
  if (type === 'text' && font.families.length === 0) {
    pushRisk(risks, 'warning', 'font-family-missing', 'Text object has no disclosed font family', {
      slide: slideIndex,
    })
  }
  if (type === 'text' && font.sizesPt.length === 0) {
    pushRisk(risks, 'warning', 'font-size-missing', 'Text object has no disclosed font size', {
      slide: slideIndex,
    })
  }
  for (const sizePt of font.sizesPt) {
    if (sizePt > 0 && sizePt < 6) {
      pushRisk(
        risks,
        'warning',
        'font-size-too-small',
        'Text object discloses a font size below 6pt',
        {
          slide: slideIndex,
          sizePt,
        },
      )
    }
  }
}

function normalizeSlide(slide, fallbackSize) {
  const index = numberOrNull(slide?.index ?? slide?.slide) ?? 0
  const size = slideSize(slide, fallbackSize)
  const rawObjects = asArray(slide?.shapes ?? slide?.objects ?? slide?.elements)
  const objects = rawObjects.map((shape, shapeIndex) =>
    normalizeShape(shape, index, shapeIndex, size),
  )
  const risks = []
  const seenIds = new Set()
  const seenNames = new Set()
  for (const object of objects) {
    if (object.id !== null && object.id !== undefined) {
      const key = String(object.id)
      if (seenIds.has(key)) {
        pushRisk(risks, 'warning', 'duplicate-object-id', 'Slide has duplicate object ids', {
          slide: index,
          id: object.id,
        })
      }
      seenIds.add(key)
    }
    if (object.name) {
      const key = String(object.name)
      if (seenNames.has(key)) {
        pushRisk(risks, 'warning', 'duplicate-object-name', 'Slide has duplicate object names', {
          slide: index,
          name: object.name,
        })
      }
      seenNames.add(key)
    }
  }
  return {
    index,
    size,
    objectCount: objects.length,
    objects: objects.sort((a, b) => Number(a.zOrder ?? 0) - Number(b.zOrder ?? 0)),
    risks,
  }
}

function flattenRisks(slides) {
  const risks = []
  for (const slide of slides) {
    for (const risk of slide.risks) risks.push(risk)
    for (const object of slide.objects) {
      for (const risk of object.risks) {
        risks.push({
          ...risk,
          objectId: object.id,
          objectName: object.name,
          objectType: object.type,
        })
      }
    }
  }
  return risks
}

function countBySeverity(risks) {
  const counts = { error: 0, warning: 0, info: 0 }
  for (const risk of risks) {
    const severity = risk.severity in counts ? risk.severity : 'warning'
    counts[severity] += 1
  }
  return counts
}

function buildSnapshot(inspect, inspectPath) {
  const size = presentationSize(inspect)
  const slides = asArray(inspect?.slides).map((slide) => normalizeSlide(slide, size))
  const objects = slides.flatMap((slide) => slide.objects)
  const risks = flattenRisks(slides)
  return {
    schemaVersion: SCHEMA_VERSION,
    status: risks.length > 0 ? 'warn' : 'pass',
    source: inspectPath,
    summary: {
      slideCount: slideCountOf(inspect),
      objectCount: objects.length,
      textObjectCount: objects.filter((object) => object.type === 'text').length,
      placeholderCount: objects.filter((object) => object.placeholder).length,
      chartCount: objects.filter((object) => object.type === 'chart').length,
      tableCount: objects.filter((object) => object.type === 'table').length,
      imageCount: objects.filter((object) => object.type === 'image').length,
      riskCount: risks.length,
      bySeverity: countBySeverity(risks),
    },
    slides,
    risks,
  }
}

function printHuman(snapshot) {
  process.stdout.write(`pptx-nova layout snapshot: ${snapshot.status}\n`)
  process.stdout.write(`- slides: ${snapshot.summary.slideCount}\n`)
  process.stdout.write(`- objects: ${snapshot.summary.objectCount}\n`)
  process.stdout.write(`- risks: ${snapshot.summary.riskCount}\n`)
}

let args = null
try {
  args = parseArgs(process.argv.slice(2))
  const inspect = readJson(args.inspect, 'inspect JSON')
  const snapshot = buildSnapshot(inspect, args.inspect)
  if (args.output) writeFileSync(args.output, `${JSON.stringify(snapshot, null, 2)}\n`)
  if (args.json) process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`)
  else printHuman(snapshot)
} catch (error) {
  const failure = {
    schemaVersion: SCHEMA_VERSION,
    status: 'fail',
    source: args?.inspect ?? '',
    summary: {
      slideCount: 0,
      objectCount: 0,
      textObjectCount: 0,
      placeholderCount: 0,
      chartCount: 0,
      tableCount: 0,
      imageCount: 0,
      riskCount: 1,
      bySeverity: { error: 1, warning: 0, info: 0 },
    },
    slides: [],
    risks: [
      {
        severity: 'error',
        code: 'layout-snapshot-error',
        message: error.message,
      },
    ],
  }
  if (args?.output) writeFileSync(args.output, `${JSON.stringify(failure, null, 2)}\n`)
  if (args?.json) process.stdout.write(`${JSON.stringify(failure, null, 2)}\n`)
  else printHuman(failure)
  process.exitCode = 1
}
