#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fallbackFor, luminance } from './pptx-nova-refurbish-style.mjs'

const SKILL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CATALOG_PATH = join(SKILL_ROOT, 'assets/deckkits/catalog.json')

const usage = `Usage:
  node <skill-root>/scripts/pptx-nova-refurbish-fallback-patch.mjs --deckkit <id> --inspect reference-inspect.json [options]

Options:
  --deckkit <id>       Target DeckKit id
  --inspect <path>     xdoc pptx inspect JSON for the source deck
  --source <path>      Source PPTX path recorded in generated artifacts
  --output <path>      Candidate/final PPTX path recorded in generated artifacts
  --catalog <path>     DeckKit catalog path. Defaults to <skill-root>/assets/deckkits/catalog.json
  --chrome-detect <path>
                       Optional xdoc pptx chrome-detect JSON report
  --patch <path>       Output patch JSON. Defaults to patch.json
  --lock <path>        Output deck_lock JSON. Defaults to deck_lock.json
  --audit <path>       Output content-audit JSON. Defaults to content-audit.json
  --map <path>         Output reference-map JSON. Defaults to reference-map.json
  --json               Print machine-readable summary
  --help               Show this help
`

function parseArgs(argv) {
  const args = {
    deckkit: '',
    inspect: '',
    source: 'source.pptx',
    output: 'candidate.pptx',
    catalog: CATALOG_PATH,
    chromeDetect: '',
    patch: 'patch.json',
    lock: 'deck_lock.json',
    audit: 'content-audit.json',
    map: 'reference-map.json',
    json: false,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(usage)
      process.exit(0)
    } else if (arg === '--json') {
      args.json = true
    } else if (arg in flagSet) {
      args[flagSet[arg]] = valueAfter(argv, i, arg)
      i += 1
    } else {
      throw new Error(`Unknown option: ${arg}\n\n${usage}`)
    }
  }
  if (!args.deckkit) throw new Error(`--deckkit is required.\n\n${usage}`)
  if (!args.inspect) throw new Error(`--inspect is required.\n\n${usage}`)
  args.catalog = resolve(args.catalog)
  return args
}

const flagSet = {
  '--deckkit': 'deckkit',
  '--inspect': 'inspect',
  '--source': 'source',
  '--output': 'output',
  '--catalog': 'catalog',
  '--chrome-detect': 'chromeDetect',
  '--patch': 'patch',
  '--lock': 'lock',
  '--audit': 'audit',
  '--map': 'map',
}

function valueAfter(argv, index, flag) {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function readChromeDetect(path) {
  if (!path) return null
  const report = readJson(path)
  if (report?.schemaVersion !== 'pptx-chrome-detect/v1') {
    throw new Error(`--chrome-detect must point to a pptx-chrome-detect/v1 report: ${path}`)
  }
  return report
}

function fontForShape(shape, fallback) {
  const name = shape.name ?? ''
  const text = (shape.textPreview ?? '').trim()
  const isTitle = /(^|_)Title$|_Title|title/i.test(name)
  const isLabel = /Eyebrow|Kicker|Foot|PageNum|Label|Badge/i.test(name)
  const isMetric = /Val|Num|Score|Pct|Metric/i.test(name) || /^[0-9.→+\-%年]+$/.test(text)
  if (isTitle) return { name: fallback.fonts.heading, color: fallback.palette.text, bold: true }
  if (isMetric) return { name: fallback.fonts.heading, color: fallback.palette.text, bold: true }
  if (isLabel) return { name: fallback.fonts.label, color: fallback.palette.secondary, bold: true }
  return { name: fallback.fonts.body, color: fallback.palette.text }
}

function fillForShape(shape, fallback) {
  const original = shape.fillColor ?? ''
  if (!original) return null
  const lum = luminance(original)
  const text = (shape.textPreview ?? '').trim()
  if (!text && /Dot|Tick|Rule|Line/i.test(shape.name ?? '')) return fallback.palette.accent
  if (lum < 0.28) return fallback.palette.accent
  if (lum > 0.86) return fallback.palette.surface
  if (lum > 0.65) return fallback.palette.softAccent
  return fallback.palette.softAccent
}

function chromeKey(slide, shapeId) {
  return `${Number(slide)}:${String(shapeId ?? '')}`
}

function chromeShapeId(candidate) {
  return candidate?.shapeId ?? candidate?.patchSelector?.shape?.id
}

function summarizeChromeCandidate(candidate) {
  return {
    slide: candidate.slide,
    role: candidate.role,
    confidence: candidate.confidence,
    shapeId: chromeShapeId(candidate),
    shapeName: candidate.shapeName ?? '',
    patchSelector: candidate.patchSelector ?? {
      slide: candidate.slide,
      shape: { id: chromeShapeId(candidate) },
    },
  }
}

function chromeModelFrom(report) {
  if (!report) {
    return {
      status: 'not-provided',
      summary: null,
      candidates: [],
      duplicateRoles: [],
      byShape: new Map(),
      warnings: [
        'No chrome-detect report was provided; existing header/footer/page-number/rule chrome was not classified.',
      ],
    }
  }
  const highConfidence = (Array.isArray(report.candidates) ? report.candidates : [])
    .filter((candidate) => Number(candidate.confidence) >= 0.75)
    .map(summarizeChromeCandidate)
  const byShape = new Map()
  const bySlideRole = new Map()
  for (const candidate of highConfidence) {
    const key = chromeKey(candidate.slide, candidate.shapeId)
    const current = byShape.get(key)
    if (!current || Number(candidate.confidence) > Number(current.confidence))
      byShape.set(key, candidate)

    const slideRole = `${candidate.slide}:${candidate.role}`
    const entries = bySlideRole.get(slideRole) ?? []
    entries.push(candidate)
    bySlideRole.set(slideRole, entries)
  }
  const duplicateRoles = [...bySlideRole.entries()]
    .filter(([, entries]) => entries.length > 1)
    .map(([key, entries]) => {
      const [slide, role] = key.split(':')
      return {
        slide: Number(slide),
        role,
        count: entries.length,
        shapeIds: entries.map((entry) => entry.shapeId),
      }
    })
  const warnings = duplicateRoles.map(
    (item) =>
      `Slide ${item.slide} has ${item.count} high-confidence ${item.role} chrome candidates; fallback restyles them but does not remove duplicates.`,
  )
  return {
    status: 'loaded',
    summary: report.summary ?? null,
    candidates: highConfidence,
    duplicateRoles,
    byShape,
    warnings,
  }
}

function chromeCandidateForShape(model, slideIndex, shape) {
  return model.byShape.get(chromeKey(slideIndex, shape.id))
}

function chromeCandidatesForSlide(model, slideIndex) {
  return model.candidates.filter((candidate) => Number(candidate.slide) === Number(slideIndex))
}

function duplicateChromeForSlide(model, slideIndex) {
  return model.duplicateRoles.filter((item) => Number(item.slide) === Number(slideIndex))
}

function chromeOutput(model) {
  return {
    status: model.status,
    summary: model.summary,
    highConfidenceCount: model.candidates.length,
    duplicateRoles: model.duplicateRoles,
    warnings: model.warnings,
  }
}

function chromeFontFor(role, fallback) {
  return {
    name: fallback.fonts.label,
    color: role === 'header' ? fallback.palette.text : fallback.palette.secondary,
    bold: role === 'header' || role === 'page-number',
  }
}

function appendChromeRestyleOps(ops, slideIndex, shape, candidate, fallback) {
  const selector = candidate.patchSelector?.shape ?? { id: shape.id }
  if (shape.hasText || (shape.textPreview ?? '').trim()) {
    ops.push({
      op: 'set-text-style',
      slide: slideIndex,
      shape: selector,
      font: chromeFontFor(candidate.role, fallback),
    })
  }
  if (candidate.role === 'rule') {
    ops.push({
      op: 'set-shape-line',
      slide: slideIndex,
      shape: selector,
      width: '0.5pt',
      color: fallback.palette.rule,
    })
  }
}

function buildArtifacts(args) {
  const catalog = readJson(args.catalog)
  const entry = catalog.entries.find((candidate) => candidate.id === args.deckkit)
  if (!entry) throw new Error(`DeckKit "${args.deckkit}" is missing from catalog`)
  const inspect = readJson(args.inspect)
  const chromeDetect = readChromeDetect(args.chromeDetect)
  const chrome = chromeModelFrom(chromeDetect)
  const fallback = fallbackFor(entry)
  const warnings = [...(fallback.derivationWarnings ?? []), ...chrome.warnings]
  const ops = []
  const palette = fallback.palette

  const themeColors = {
    dk1: palette.text,
    lt1: palette.background,
    dk2: palette.rule,
    lt2: palette.surface,
    accent1: palette.accent,
    accent2: palette.text,
    accent3: palette.softAccent,
    accent4: palette.secondary,
    accent5: palette.rule,
    accent6: palette.surface,
    hlink: palette.text,
    folHlink: palette.secondary,
  }
  for (const [scheme, value] of Object.entries(themeColors)) {
    ops.push({ op: 'set-theme-color', scheme, value })
  }
  ops.push({
    op: 'set-theme-font',
    kind: 'majorFont',
    typeface: fallback.fonts.heading,
    ea: fallback.fonts.cjk,
    latin: fallback.fonts.heading,
  })
  ops.push({
    op: 'set-theme-font',
    kind: 'minorFont',
    typeface: fallback.fonts.body,
    ea: fallback.fonts.cjk,
    latin: fallback.fonts.body,
  })
  ops.push({ op: 'set-master-bg', fill: { kind: 'solid', color: palette.background } })
  ops.push({
    op: 'set-presentation-default-text-style',
    level: 0,
    font: { name: fallback.fonts.body },
    color: palette.text,
    alignment: 'left',
  })

  const slides = Array.isArray(inspect.slides) ? inspect.slides : []
  const auditSlides = []
  const mapSlides = []
  for (const slide of slides) {
    const slideIndex = slide.index
    const stats = slide.semantic?.elementStats ?? {}
    ops.push({
      op: 'set-slide-background',
      slide: slideIndex,
      fill: { kind: 'solid', color: palette.background },
      followMaster: false,
    })
    mapSlides.push({
      sourceSlide: slideIndex,
      outputSlides: [slideIndex],
      reuse: 'preserve-and-restyle',
      notes: '1:1 mapping; source editable objects are retained and restyled in place.',
    })
    auditSlides.push({
      sourceSlide: slideIndex,
      outputSlides: [slideIndex],
      status: 'preserved',
      text: { count: stats.text ?? 0, status: 'preserved' },
      tables: { count: stats.table ?? 0, status: 'preserved' },
      charts: { count: stats.chart ?? 0, status: 'preserved' },
      smartArtOrDiagrams: { count: slide.hasSmartArt ? 1 : 0, status: 'preserved' },
      imagesAndMedia: { count: (stats.picture ?? 0) + (stats.media ?? 0), status: 'preserved' },
      groupsAndShapes: {
        count: stats.total ?? 0,
        status: 'preserved',
        note: 'Native objects retained; eligible text, fill, and line styling is remapped.',
      },
      notes: { count: slide.hasNotes ? 1 : 0, status: 'preserved' },
      unsupportedObjects: {
        count: Array.isArray(slide.preserveOnly) ? slide.preserveOnly.length : 0,
        status:
          Array.isArray(slide.preserveOnly) && slide.preserveOnly.length ? 'blocked' : 'preserved',
      },
      chrome: {
        status: chrome.status === 'loaded' ? 'classified-and-restyled' : 'not-classified',
        policy: fallback.chromePolicy,
        candidates: chromeCandidatesForSlide(chrome, slideIndex),
        duplicateRoles: duplicateChromeForSlide(chrome, slideIndex),
      },
    })
    for (const shape of slide.shapes ?? []) {
      const selector = { id: shape.id }
      const chromeCandidate = chromeCandidateForShape(chrome, slideIndex, shape)
      if (chromeCandidate) {
        appendChromeRestyleOps(ops, slideIndex, shape, chromeCandidate, fallback)
        continue
      }
      if (shape.hasText && (shape.textPreview ?? '').trim()) {
        ops.push({
          op: 'set-text-style',
          slide: slideIndex,
          shape: selector,
          font: fontForShape(shape, fallback),
        })
      }
      if (shape.shapeType === 'autoShape' && shape.fillColor) {
        const color = fillForShape(shape, fallback)
        if (color) {
          ops.push({
            op: 'set-shape-fill',
            slide: slideIndex,
            shape: selector,
            fill: { kind: 'solid', color },
          })
        }
        if (!shape.lineNoFill) {
          ops.push({
            op: 'set-shape-line',
            slide: slideIndex,
            shape: selector,
            width: '0.5pt',
            color: palette.rule,
          })
        }
      }
    }
  }

  const patch = {
    schemaVersion: 1,
    metadata: {
      deckkit: entry.id,
      strategy: fallback.strategy,
      fallbackSource: fallback.source,
      chromeDetection: chromeOutput(chrome),
      source: args.source,
      output: args.output,
      warnings,
      notes: [
        'Generated by pptx-nova-refurbish-fallback-patch.mjs.',
        'This fallback preserves source slides and editable objects; it does not rasterize source slides.',
      ],
    },
    ops,
  }
  const deckLock = {
    schemaVersion: 'pptx-nova-deck-lock/v1',
    mode: 'Refurbish Existing Deck',
    source: args.source,
    output: args.output,
    deckkit: entry.id,
    readiness: {
      readiness: entry.readiness ?? '',
      nativeSkinning: Boolean(entry.nativeSkinning),
      fallbackSource: fallback.source,
      fallbackStrategy: fallback.strategy,
    },
    chromeDetection: chromeOutput(chrome),
    visualTarget: {
      palette,
      typography: fallback.fonts,
      chromePolicy: fallback.chromePolicy,
      contentPolicy: fallback.contentPolicy,
    },
    assumptions: [
      'No factual content is added or rewritten by the fallback patch generator.',
      'content-audit.json is a pre-apply preservation baseline; content-audit-final.json from xdoc pptx refurbish-audit remains required before delivery.',
      ...warnings.map((warning) => `Fallback warning: ${warning}`),
    ],
    slides: slides.map((slide) => ({
      index: slide.index,
      sourceSlide: slide.index,
      outputSlide: slide.index,
      layoutIntent: 'preserve source layout and restyle editable objects',
      contentStatus: 'preserved',
    })),
  }
  const audit = {
    schemaVersion: 'pptx-nova-content-audit/v1',
    phase: 'pre-apply-baseline',
    finalAuditRequired: true,
    source: args.source,
    final: args.output,
    strategy: fallback.strategy,
    deckkit: entry.id,
    fallbackSource: fallback.source,
    chromeDetection: chromeOutput(chrome),
    warnings,
    slides: auditSlides,
  }
  const referenceMap = {
    schemaVersion: 'pptx-nova-reference-map/v1',
    source: args.source,
    strategy: 'one-to-one editable-object restyle fallback',
    approvedChanges: [],
    slides: mapSlides,
  }
  return {
    patch,
    deckLock,
    audit,
    referenceMap,
    summary: {
      deckkit: entry.id,
      fallback,
      chromeDetection: chromeOutput(chrome),
      warnings,
      slideCount: slides.length,
      ops: ops.length,
    },
  }
}

try {
  const args = parseArgs(process.argv.slice(2))
  const artifacts = buildArtifacts(args)
  writeFileSync(args.patch, `${JSON.stringify(artifacts.patch, null, 2)}\n`)
  writeFileSync(args.lock, `${JSON.stringify(artifacts.deckLock, null, 2)}\n`)
  writeFileSync(args.audit, `${JSON.stringify(artifacts.audit, null, 2)}\n`)
  writeFileSync(args.map, `${JSON.stringify(artifacts.referenceMap, null, 2)}\n`)
  const result = {
    schemaVersion: 'pptx-nova-refurbish-fallback-patch-report/v1',
    status: 'success',
    outputs: {
      patch: args.patch,
      lock: args.lock,
      audit: args.audit,
      map: args.map,
    },
    summary: artifacts.summary,
  }
  if (args.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  else {
    process.stdout.write(
      `Generated fallback patch for ${result.summary.deckkit}: ${result.summary.ops} ops across ${result.summary.slideCount} slides\n`,
    )
  }
} catch (error) {
  process.stderr.write(`[error] ${error.message}\n`)
  process.exit(1)
}
