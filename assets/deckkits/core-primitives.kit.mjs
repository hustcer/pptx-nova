// core-primitives.kit.mjs — 几何安全 + op 生成（所有 DeckKit 共用）
// version: 0.1.0
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { addTablerIconPicture } from './icon-assets.kit.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))

export const SLIDE_W = 13.333
export const SLIDE_H = 7.5
export const BOUNDS_EPS = 0.002

export const nm = (s, base) => `S${s}_${base}`

export const parseFontPt = (v) => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const m = String(v ?? '').match(/^([0-9]+(?:\.[0-9]+)?)pt$/i)
  return m ? Number.parseFloat(m[1]) : null
}

export const fontSizeValue = (pt) => {
  const r = Number(pt.toFixed(2))
  return `${Number.isInteger(r) ? r.toFixed(0) : r}pt`
}

export const withFontFloor = (font, floorPt = 9) => {
  if (!font || typeof font !== 'object') return font
  const cur = parseFontPt(font.size)
  if (cur === null || cur >= floorPt) return font
  return { ...font, size: fontSizeValue(floorPt) }
}

export const normalizeHex = (value) => {
  const hex = String(value ?? '')
    .replace(/^#/, '')
    .toUpperCase()
  return /^[0-9A-F]{6}$/.test(hex) ? hex : null
}

const channelToLinear = (ch) => {
  const v = ch / 255
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

const luminance = (value) => {
  const hex = normalizeHex(value)
  if (!hex) return null
  const r = channelToLinear(Number.parseInt(hex.slice(0, 2), 16))
  const g = channelToLinear(Number.parseInt(hex.slice(2, 4), 16))
  const b = channelToLinear(Number.parseInt(hex.slice(4, 6), 16))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export const contrastRatio = (fg, bg) => {
  const fgL = luminance(fg)
  const bgL = luminance(bg)
  if (fgL === null || bgL === null) return 0
  const lighter = Math.max(fgL, bgL)
  const darker = Math.min(fgL, bgL)
  return (lighter + 0.05) / (darker + 0.05)
}

export const isDarkColor = (value) => {
  const lum = luminance(value)
  return lum !== null && lum < 0.35
}

export const readableTextOn = (background, preferred, candidates = []) => {
  const bg = normalizeHex(background)
  const pref = normalizeHex(preferred)
  const MIN_CONTRAST = 4.5
  if (!bg) return pref ?? '111827'
  if (pref && contrastRatio(pref, bg) >= MIN_CONTRAST) return pref
  for (const c of candidates.map(normalizeHex).filter(Boolean)) {
    if (contrastRatio(c, bg) >= MIN_CONTRAST) return c
  }
  return contrastRatio('111827', bg) >= contrastRatio('FFFFFF', bg) ? '111827' : 'FFFFFF'
}

export const assertWithinSlide = (name, x, y, w, h) => {
  if (
    x < -BOUNDS_EPS ||
    y < -BOUNDS_EPS ||
    x + w > SLIDE_W + BOUNDS_EPS ||
    y + h > SLIDE_H + BOUNDS_EPS
  ) {
    throw new Error(
      `OOB ${name}: x=${x} y=${y} w=${w} h=${h} right=${(x + w).toFixed(3)} bottom=${(y + h).toFixed(3)}`,
    )
  }
}

export const grid = (cols, gap = 0.3, startX = 0.7, contentW = SLIDE_W - startX * 2) => {
  const w = (contentW - gap * (cols - 1)) / cols
  return Array.from({ length: cols }, (_, i) => ({ x: startX + i * (w + gap), w }))
}

export const txH = (sizePt, lines = 1) => {
  const inches = (sizePt / 72) * 1.5 * lines
  return Number(inches.toFixed(2))
}

// --- Op builders ---
export function createOps() {
  const ops = []

  const shape = (s, name, kind, x, y, w, h) => {
    assertWithinSlide(name, x, y, w, h)
    ops.push({
      op: 'add-shape',
      slide: s,
      shape: kind,
      name,
      x: `${x}in`,
      y: `${y}in`,
      w: `${w}in`,
      h: `${h}in`,
    })
    return name
  }
  const fill = (s, name, color) =>
    ops.push({ op: 'set-shape-fill', slide: s, shape: { name }, fill: { kind: 'solid', color } })
  const noLine = (s, name) =>
    ops.push({ op: 'set-shape-line', slide: s, shape: { name }, line: { noLine: true } })
  const setLine = (s, name, color, width = '0.75pt') =>
    ops.push({ op: 'set-shape-line', slide: s, shape: { name }, line: { width, color } })

  const box = (s, name, kind, x, y, w, h, color) => {
    shape(s, name, kind, x, y, w, h)
    fill(s, name, color)
    noLine(s, name)
    return name
  }

  const card = (s, name, x, y, w, h, color, line) => {
    shape(s, name, 'rounded-rectangle', x, y, w, h)
    fill(s, name, color)
    if (line) setLine(s, name, line, '0.75pt')
    else noLine(s, name)
    return name
  }

  const textbox = (s, name, x, y, w, h) => {
    assertWithinSlide(name, x, y, w, h)
    ops.push({
      op: 'add-textbox',
      slide: s,
      name,
      x: `${x}in`,
      y: `${y}in`,
      w: `${w}in`,
      h: `${h}in`,
    })
    return name
  }

  const setText = (s, name, text) => ops.push({ op: 'set-text', slide: s, shape: { name }, text })

  const runFont = (s, name, font, paragraph = 0, run = 0) =>
    ops.push({
      op: 'set-run',
      slide: s,
      shape: { name },
      paragraph,
      run,
      font: withFontFloor(font),
    })

  const addRun = (s, name, paragraph, text, font) =>
    ops.push({
      op: 'add-run',
      slide: s,
      shape: { name },
      paragraph,
      text,
      ...(font ? { font: withFontFloor(font) } : {}),
    })

  const pAlign = (s, name, alignment, paragraph = 0) =>
    ops.push({ op: 'set-paragraph-format', slide: s, shape: { name }, paragraph, alignment })

  const tx = (s, name, x, y, w, h, text, font, align) => {
    textbox(s, name, x, y, w, h)
    setText(s, name, text)
    const n = String(text).split(/\r\n|\r|\n/).length
    for (let p = 0; p < n; p++) runFont(s, name, font, p)
    if (align) for (let p = 0; p < n; p++) pAlign(s, name, align, p)
    return name
  }

  const fillText = (s, name, text, font, align) => {
    setText(s, name, text)
    const n = String(text).split(/\r\n|\r|\n/).length
    for (let p = 0; p < n; p++) runFont(s, name, font, p)
    if (align) for (let p = 0; p < n; p++) pAlign(s, name, align, p)
  }

  const addSlide = (s, bg) => {
    ops.push({ op: 'add-slide', layout: 'blank' })
    if (bg) ops.push({ op: 'set-slide-background', slide: s, fill: { type: 'solid', color: bg } })
  }

  const icon = (s, name, iconName, x, y, w, h, options) =>
    addTablerIconPicture(ops, s, name, iconName, x, y, w, h, options)

  return {
    ops,
    shape,
    fill,
    noLine,
    setLine,
    box,
    card,
    textbox,
    setText,
    runFont,
    addRun,
    pAlign,
    tx,
    fillText,
    addSlide,
    icon,
  }
}

// --- Content loading ---
export async function loadContent(path) {
  if (path.endsWith('.mjs') || path.endsWith('.js')) {
    const mod = await import(join(process.cwd(), path))
    return mod.default ?? mod
  }
  return JSON.parse(readFileSync(path, 'utf8'))
}

// --- Content validation ---
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))

export function loadCatalog() {
  return readJson(join(__dirname, 'catalog.json'))
}

const loadSchema = (name) => readJson(join(__dirname, 'schemas', name))

const makeIssue = (type, message, extra = {}) => ({ type, message, ...extra })

const makeFitDiagnostic = ({
  slideIndex,
  slideType,
  severity,
  code,
  path,
  value,
  limit,
  message,
  suggestedActions,
  blocking,
}) => ({
  slideIndex,
  slideType,
  severity,
  code,
  path,
  value,
  limit,
  message,
  suggestedActions,
  blocking: blocking ?? severity === 'error',
})

const countText = (value) => (typeof value === 'string' ? value.length : 0)

const arrayValue = (value) => (Array.isArray(value) ? value : null)

const tupleValue = (value, index) => (Array.isArray(value) ? value[index] : undefined)

const LATIN_TOKEN_RE = /[A-Za-z0-9][A-Za-z0-9._:/-]{8,}/g

function longestLatinToken(value, path) {
  let longest = null
  const visit = (node, nodePath) => {
    if (typeof node === 'string') {
      for (const token of node.match(LATIN_TOKEN_RE) ?? []) {
        if (!longest || token.length > longest.value.length) {
          longest = { value: token, path: nodePath, length: token.length }
        }
      }
      return
    }
    if (Array.isArray(node)) {
      node.forEach((item, i) => visit(item, `${nodePath}[${i}]`))
      return
    }
    if (node && typeof node === 'object') {
      for (const [key, item] of Object.entries(node)) {
        visit(item, `${nodePath}.${key}`)
      }
    }
  }
  visit(value, path)
  return longest
}

const checkType = (value, type) => {
  if (!type) return true
  if (Array.isArray(type)) return type.some((t) => checkType(value, t))
  if (type === 'array') return Array.isArray(value)
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value)
  return typeof value === type
}

const describeType = (type) => (Array.isArray(type) ? type.join('|') : type)

function validateValueAgainstSchema(value, schema, path, errors) {
  if (!schema) return

  if (schema.type && !checkType(value, schema.type)) {
    errors.push(
      makeIssue('field', `${path}: expected ${describeType(schema.type)}`, {
        path,
        expected: schema.type,
      }),
    )
    return
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(
      makeIssue('field', `${path}: expected one of ${schema.enum.join(', ')}`, {
        path,
        expected: schema.enum,
        value,
      }),
    )
    return
  }

  if (Array.isArray(value)) {
    validateArrayAgainstSchema(value, schema, path, errors)
    return
  }

  if (value && typeof value === 'object') {
    validateObjectAgainstSchema(value, schema, path, errors)
  }
}

function validateArrayAgainstSchema(value, schema, path, errors) {
  if (schema.minItems !== undefined && value.length < schema.minItems) {
    errors.push(
      makeIssue('field', `${path}: ${value.length} items below min ${schema.minItems}`, {
        path,
        value: value.length,
        limit: schema.minItems,
      }),
    )
  }
  if (schema.maxItems !== undefined && value.length > schema.maxItems) {
    errors.push(
      makeIssue('field', `${path}: ${value.length} items exceeds max ${schema.maxItems}`, {
        path,
        value: value.length,
        limit: schema.maxItems,
      }),
    )
  }

  const itemSchema = schema.items
  if (!itemSchema) return
  if (Array.isArray(itemSchema)) {
    itemSchema.forEach((tupleSchema, i) => {
      if (i < value.length)
        validateValueAgainstSchema(value[i], tupleSchema, `${path}[${i}]`, errors)
    })
    return
  }
  value.forEach((item, i) => validateValueAgainstSchema(item, itemSchema, `${path}[${i}]`, errors))
}

function validateObjectAgainstSchema(value, schema, path, errors) {
  if (!schema || !schema.properties || !value || typeof value !== 'object') return

  for (const req of schema.required ?? []) {
    if (!(req in value)) {
      errors.push(makeIssue('field', `${path}: missing required field "${req}"`, { path }))
    }
  }

  if (schema.additionalProperties === false) {
    for (const key of Object.keys(value)) {
      if (!(key in schema.properties)) {
        errors.push(
          makeIssue('field', `${path}: unknown field "${key}"`, { path: `${path}.${key}` }),
        )
      }
    }
  }

  for (const [key, propSchema] of Object.entries(schema.properties)) {
    if (!(key in value)) continue
    const fieldPath = `${path}.${key}`
    validateValueAgainstSchema(value[key], propSchema, fieldPath, errors)
  }
}

function pushFitLimitDiagnostic({
  errors,
  warnings,
  fitDiagnostics,
  ignoreSoftLimits,
  slideIndex,
  slideType,
  field,
  path,
  value,
  softLimit,
  hardLimit,
  unit,
  codeBase,
  suggestedActions,
}) {
  if (value === null || value === undefined) return
  if (hardLimit !== undefined && value > hardLimit) {
    const message = `${path}: ${value} ${unit} exceeds hard limit ${hardLimit}`
    const diagnostic = makeFitDiagnostic({
      slideIndex,
      slideType,
      severity: 'error',
      code: `${codeBase}.hardLimit`,
      path,
      value,
      limit: hardLimit,
      message,
      suggestedActions,
    })
    fitDiagnostics.push(diagnostic)
    errors.push(makeIssue('fit', message, { path, field, diagnostic }))
  } else if (softLimit !== undefined && value > softLimit && !ignoreSoftLimits) {
    const message = `${path}: ${value} ${unit} exceeds soft limit ${softLimit}`
    const diagnostic = makeFitDiagnostic({
      slideIndex,
      slideType,
      severity: 'warning',
      code: `${codeBase}.softLimit`,
      path,
      value,
      limit: softLimit,
      message,
      suggestedActions,
    })
    fitDiagnostics.push(diagnostic)
    warnings.push(makeIssue('fit', message, { path, field, diagnostic }))
  }
}

function slideValidationContext({
  slide,
  slideIndex,
  soft,
  hard,
  errors,
  warnings,
  fitDiagnostics,
  ignoreSoftLimits,
}) {
  return {
    slide,
    data: slide.data ?? {},
    slideIndex,
    slideType: slide.type,
    prefix: `slides[${slideIndex}].data`,
    soft,
    hard,
    errors,
    warnings,
    fitDiagnostics,
    ignoreSoftLimits,
  }
}

function pushLimit(ctx, config) {
  pushFitLimitDiagnostic({
    errors: ctx.errors,
    warnings: ctx.warnings,
    fitDiagnostics: ctx.fitDiagnostics,
    ignoreSoftLimits: ctx.ignoreSoftLimits,
    slideIndex: ctx.slideIndex,
    slideType: ctx.slideType,
    ...config,
  })
}

function pushTextLimit(ctx, field, { softLimit, hardLimit, codeBase, suggestedActions }) {
  pushLimit(ctx, {
    field,
    path: `${ctx.prefix}.${field}`,
    value: countText(ctx.data[field]),
    softLimit,
    hardLimit,
    unit: 'chars',
    codeBase,
    suggestedActions,
  })
}

function pushArrayLimit(ctx, field, { value, softLimit, hardLimit, codeBase, suggestedActions }) {
  pushLimit(ctx, {
    field,
    path: `${ctx.prefix}.${field}`,
    value: value?.length,
    softLimit,
    hardLimit,
    unit: 'items',
    codeBase,
    suggestedActions,
  })
}

function checkCommonTitle(ctx, codeBase = `${ctx.slideType}.title`) {
  pushTextLimit(ctx, 'title', {
    softLimit: ctx.soft.titleMaxChars,
    hardLimit: ctx.hard.titleMaxChars,
    codeBase,
    suggestedActions: ['shorten-copy', 'split-title', 'switch-layout'],
  })
}

function checkHeroSlide(ctx) {
  checkCommonTitle(ctx, 'hero.title')
  pushTextLimit(ctx, 'sub', {
    softLimit: 90,
    hardLimit: 150,
    codeBase: 'hero.subtitle',
    suggestedActions: ['shorten-copy', 'move-copy-to-body-slide', 'split-slide'],
  })
  pushTextLimit(ctx, 'tag', {
    softLimit: 96,
    hardLimit: 140,
    codeBase: 'hero.tag',
    suggestedActions: ['shorten-copy', 'move-copy-to-notes'],
  })
}

function checkKpiRowSlide(ctx) {
  checkCommonTitle(ctx, 'kpi.title')
  const items = arrayValue(ctx.data.items)
  pushArrayLimit(ctx, 'items', {
    value: items,
    softLimit: Math.min(ctx.soft.kpisMax ?? 4, 4),
    hardLimit: 4,
    codeBase: 'kpi.items',
    suggestedActions: ['split-slide', 'switch-layout', 'remove-item'],
  })
  items?.forEach((item, i) => {
    pushLimit(ctx, {
      field: 'itemBody',
      path: `${ctx.prefix}.items[${i}][3]`,
      value: countText(tupleValue(item, 3)),
      softLimit: 72,
      hardLimit: 120,
      unit: 'chars',
      codeBase: 'kpi.itemBody',
      suggestedActions: ['shorten-copy', 'split-item', 'move-detail-to-notes'],
    })
  })
}

function checkMultiCardSlide(ctx) {
  checkCommonTitle(ctx, 'cards.title')
  const cards = arrayValue(ctx.data.cards)
  pushArrayLimit(ctx, 'cards', {
    value: cards,
    softLimit: ctx.soft.cardsMax,
    hardLimit: ctx.hard.cardsMax,
    codeBase: 'cards.count',
    suggestedActions: ['split-slide', 'switch-layout', 'remove-card'],
  })
  cards?.forEach((card, i) => {
    pushLimit(ctx, {
      field: 'cardTitle',
      path: `${ctx.prefix}.cards[${i}][2]`,
      value: countText(tupleValue(card, 2)),
      softLimit: 24,
      hardLimit: 42,
      unit: 'chars',
      codeBase: 'cards.titleText',
      suggestedActions: ['shorten-copy', 'split-card-title'],
    })
    const items = tupleValue(card, 3)
    pushLimit(ctx, {
      field: 'cardItems',
      path: `${ctx.prefix}.cards[${i}][3]`,
      value: Array.isArray(items) ? items.length : undefined,
      softLimit: ctx.soft.bulletsPerCardMax,
      hardLimit: ctx.hard.bulletsPerCardMax,
      unit: 'items',
      codeBase: 'cards.items',
      suggestedActions: ['shorten-copy', 'split-card', 'remove-bullet'],
    })
  })
}

function checkBenchmarkSlide(ctx) {
  checkCommonTitle(ctx, 'table.title')
  const rows = arrayValue(ctx.data.tableRows ?? ctx.data.rows)
  pushArrayLimit(ctx, ctx.data.tableRows ? 'tableRows' : 'rows', {
    value: rows,
    softLimit: ctx.soft.tableRowsMax,
    hardLimit: ctx.hard.tableRowsMax,
    codeBase: 'table.rows',
    suggestedActions: ['split-slide', 'switch-layout', 'shorten-table'],
  })
  if (rows?.[0]) {
    pushLimit(ctx, {
      field: 'tableColumns',
      path: `${ctx.prefix}.${ctx.data.tableRows ? 'tableRows' : 'rows'}[0]`,
      value: Array.isArray(rows[0]) ? rows[0].length : undefined,
      softLimit: 4,
      hardLimit: 5,
      unit: 'columns',
      codeBase: 'table.columns',
      suggestedActions: ['remove-column', 'split-table', 'switch-layout'],
    })
  }
}

function checkTimelineSlide(ctx) {
  checkCommonTitle(ctx, 'timeline.title')
  const steps = arrayValue(ctx.data.steps)
  pushArrayLimit(ctx, 'steps', {
    value: steps,
    softLimit: ctx.soft.timelineStepsMax,
    hardLimit: ctx.hard.timelineStepsMax,
    codeBase: 'timeline.steps',
    suggestedActions: ['split-slide', 'shorten-copy', 'remove-step'],
  })
  steps?.forEach((step, i) => {
    pushLimit(ctx, {
      field: 'stepDescription',
      path: `${ctx.prefix}.steps[${i}][3]`,
      value: countText(tupleValue(step, 3)),
      softLimit: 32,
      hardLimit: 60,
      unit: 'chars',
      codeBase: 'timeline.stepDescription',
      suggestedActions: ['shorten-copy', 'split-step', 'move-detail-to-notes'],
    })
  })
}

function checkAskSlide(ctx) {
  checkCommonTitle(ctx, 'ask.title')
  pushTextLimit(ctx, 'sub', {
    softLimit: 80,
    hardLimit: 130,
    codeBase: 'ask.subtitle',
    suggestedActions: ['shorten-copy', 'split-slide'],
  })
  const asks = arrayValue(ctx.data.asks)
  pushArrayLimit(ctx, 'asks', {
    value: asks,
    softLimit: 4,
    hardLimit: 5,
    codeBase: 'ask.items',
    suggestedActions: ['split-slide', 'remove-ask', 'switch-layout'],
  })
  asks?.forEach((ask, i) => {
    pushLimit(ctx, {
      field: 'askDescription',
      path: `${ctx.prefix}.asks[${i}][2]`,
      value: countText(tupleValue(ask, 2)),
      softLimit: 30,
      hardLimit: 56,
      unit: 'chars',
      codeBase: 'ask.description',
      suggestedActions: ['shorten-copy', 'split-ask', 'move-detail-to-notes'],
    })
  })
}

function checkGenericSlideDensity(ctx) {
  checkCommonTitle(ctx)
}

function checkTextTokenRisk(ctx) {
  const longest = longestLatinToken(ctx.data, ctx.prefix)
  pushLimit(ctx, {
    field: 'longLatinToken',
    path: longest?.path ?? ctx.prefix,
    value: longest?.length,
    softLimit: 34,
    hardLimit: 52,
    unit: 'chars',
    codeBase: 'text.longLatinToken',
    suggestedActions: ['insert-break-opportunity', 'shorten-token', 'switch-layout'],
  })
}

const SLIDE_FIT_CHECKERS = {
  heroSlide: checkHeroSlide,
  kpiRowSlide: checkKpiRowSlide,
  multiCardSlide: checkMultiCardSlide,
  benchmarkSlide: checkBenchmarkSlide,
  timelineSlide: checkTimelineSlide,
  askSlide: checkAskSlide,
}

function checkSlideDensity(args) {
  const ctx = slideValidationContext(args)
  const check = SLIDE_FIT_CHECKERS[ctx.slideType] ?? checkGenericSlideDensity
  check(ctx)
  checkTextTokenRisk(ctx)
}

export function validateContent(
  content,
  { deckkit, throwOnError = false, ignoreSoftLimits = false, mode = 'draft' } = {},
) {
  const catalog = loadCatalog()
  const contentSchema = loadSchema('content.schema.json')
  const requestedDeckkit = deckkit || content?.meta?.deckkit
  const entry = catalog.entries.find((e) => e.id === requestedDeckkit)
  const errors = []
  const warnings = []
  const fitDiagnostics = []

  if (!content || typeof content !== 'object') {
    errors.push(makeIssue('structure', 'Content must be an object'))
  }
  if (!content?.meta || typeof content.meta !== 'object') {
    errors.push(makeIssue('structure', 'Missing or invalid "meta" field', { path: 'meta' }))
  }
  if (!Array.isArray(content?.slides) || content.slides.length === 0) {
    errors.push(makeIssue('structure', '"slides" must be a non-empty array', { path: 'slides' }))
  }

  if (errors.length === 0) {
    validateObjectAgainstSchema(content.meta, contentSchema.properties.meta, 'meta', errors)
  }

  if (!content?.meta?.deckkit) {
    errors.push(makeIssue('meta', 'meta.deckkit is required', { path: 'meta.deckkit' }))
  }
  if (!entry) {
    errors.push(
      makeIssue('meta', `DeckKit "${requestedDeckkit}" not found in catalog`, {
        path: 'meta.deckkit',
        available: catalog.entries.map((e) => e.id),
      }),
    )
  }
  if (deckkit && content?.meta?.deckkit && content.meta.deckkit !== deckkit) {
    errors.push(
      makeIssue(
        'meta',
        `content.meta.deckkit "${content.meta.deckkit}" does not match --deckkit "${deckkit}"`,
        { path: 'meta.deckkit' },
      ),
    )
  }
  if (mode === 'delivery' && entry && !['production', 'default'].includes(entry.readiness)) {
    const message = `DeckKit "${entry.id}" readiness is "${entry.readiness ?? 'unspecified'}"; delivery mode requires production/default readiness`
    const diagnostic = makeFitDiagnostic({
      slideIndex: null,
      slideType: null,
      severity: 'warning',
      code: 'catalog.readiness.delivery',
      path: 'catalog.readiness',
      value: entry.readiness ?? null,
      limit: 'production|default',
      message,
      suggestedActions: ['promote-deckkit-after-release-gate', 'use-production-deckkit'],
    })
    fitDiagnostics.push(diagnostic)
    warnings.push(
      makeIssue('catalog', message, {
        path: 'catalog.readiness',
        readiness: entry.readiness,
        diagnostic,
      }),
    )
  }

  const supportedTypes =
    entry?.supportedSlideTypes ?? contentSchema.properties.slides.items.properties.type.enum ?? []
  const soft = entry?.density?.soft ?? {}
  const hard = entry?.density?.hard ?? {}

  if (Array.isArray(content?.slides)) {
    content.slides.forEach((slide, i) => {
      const prefix = `slides[${i}]`

      if (!slide || typeof slide !== 'object') {
        errors.push(makeIssue('slide', `${prefix}: slide must be an object`, { path: prefix }))
        return
      }

      validateObjectAgainstSchema(slide, contentSchema.properties.slides.items, prefix, errors)

      if (!slide.type) {
        errors.push(makeIssue('slide', `${prefix}: missing "type"`, { path: `${prefix}.type` }))
        return
      }
      if (!supportedTypes.includes(slide.type)) {
        errors.push(
          makeIssue(
            'slide',
            `${prefix}: unknown type "${slide.type}". Supported: ${supportedTypes.join(', ')}`,
            {
              path: `${prefix}.type`,
              supported: supportedTypes,
            },
          ),
        )
        return
      }
      if (!slide.data || typeof slide.data !== 'object' || Array.isArray(slide.data)) {
        errors.push(
          makeIssue('slide', `${prefix}: missing or invalid "data"`, { path: `${prefix}.data` }),
        )
        return
      }

      try {
        const schema = loadSchema(`${slide.type}.schema.json`)
        validateObjectAgainstSchema(slide.data, schema, `${prefix}.data`, errors)
      } catch {
        // Schema coverage is intentionally progressive.
      }

      checkSlideDensity({
        slide,
        slideIndex: i,
        soft,
        hard,
        errors,
        warnings,
        fitDiagnostics,
        ignoreSoftLimits,
      })
    })
  }

  if (throwOnError && errors.length > 0) {
    throw new Error(
      `Content validation failed:\n${errors.map((e) => `  [${e.type}] ${e.message}`).join('\n')}`,
    )
  }

  return {
    errors,
    warnings,
    fitDiagnostics,
    valid: errors.length === 0,
    entry,
    normalizedContent: content,
  }
}
