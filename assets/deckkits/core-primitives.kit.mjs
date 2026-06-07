// core-primitives.kit.mjs — 几何安全 + op 生成（所有 DeckKit 共用）
// version: 0.1.0
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

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
    pAlign,
    tx,
    fillText,
    addSlide,
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
})

const countText = (value) => (typeof value === 'string' ? value.length : 0)

const arrayValue = (value) => (Array.isArray(value) ? value : null)

const checkType = (value, type) => {
  if (!type) return true
  if (Array.isArray(type)) return type.some((t) => checkType(value, t))
  if (type === 'array') return Array.isArray(value)
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value)
  return typeof value === type
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
    const fieldValue = value[key]

    if (propSchema.type && !checkType(fieldValue, propSchema.type)) {
      errors.push(
        makeIssue('field', `${fieldPath}: expected ${propSchema.type}`, {
          path: fieldPath,
          expected: propSchema.type,
        }),
      )
      continue
    }

    if (Array.isArray(fieldValue)) {
      if (propSchema.minItems && fieldValue.length < propSchema.minItems) {
        errors.push(
          makeIssue(
            'field',
            `${fieldPath}: ${fieldValue.length} items below min ${propSchema.minItems}`,
            {
              path: fieldPath,
              value: fieldValue.length,
              limit: propSchema.minItems,
            },
          ),
        )
      }
      if (propSchema.maxItems && fieldValue.length > propSchema.maxItems) {
        errors.push(
          makeIssue(
            'field',
            `${fieldPath}: ${fieldValue.length} items exceeds max ${propSchema.maxItems}`,
            {
              path: fieldPath,
              value: fieldValue.length,
              limit: propSchema.maxItems,
            },
          ),
        )
      }

      const itemSchema = propSchema.items
      if (itemSchema) {
        fieldValue.forEach((item, i) => {
          const itemPath = `${fieldPath}[${i}]`
          if (itemSchema.type && !checkType(item, itemSchema.type)) {
            errors.push(
              makeIssue('field', `${itemPath}: expected ${itemSchema.type}`, {
                path: itemPath,
                expected: itemSchema.type,
              }),
            )
            return
          }
          if (Array.isArray(item)) {
            if (itemSchema.minItems && item.length < itemSchema.minItems) {
              errors.push(
                makeIssue(
                  'field',
                  `${itemPath}: ${item.length} items below min ${itemSchema.minItems}`,
                  {
                    path: itemPath,
                    value: item.length,
                    limit: itemSchema.minItems,
                  },
                ),
              )
            }
            if (itemSchema.maxItems && item.length > itemSchema.maxItems) {
              errors.push(
                makeIssue(
                  'field',
                  `${itemPath}: ${item.length} items exceeds max ${itemSchema.maxItems}`,
                  {
                    path: itemPath,
                    value: item.length,
                    limit: itemSchema.maxItems,
                  },
                ),
              )
            }
          }
        })
      }
    }
  }
}

function pushDensityDiagnostic({
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
  if (hardLimit && value > hardLimit) {
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
    errors.push(makeIssue('density', message, { path, field, diagnostic }))
  } else if (softLimit && value > softLimit && !ignoreSoftLimits) {
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
    warnings.push(makeIssue('density', message, { path, field, diagnostic }))
  }
}

function checkSlideDensity({
  slide,
  slideIndex,
  soft,
  hard,
  errors,
  warnings,
  fitDiagnostics,
  ignoreSoftLimits,
}) {
  const data = slide.data ?? {}
  const slideType = slide.type
  const prefix = `slides[${slideIndex}].data`

  pushDensityDiagnostic({
    errors,
    warnings,
    fitDiagnostics,
    ignoreSoftLimits,
    slideIndex,
    slideType,
    field: 'title',
    path: `${prefix}.title`,
    value: countText(data.title),
    softLimit: soft.titleMaxChars,
    hardLimit: hard.titleMaxChars,
    unit: 'chars',
    codeBase: 'text.title',
    suggestedActions: ['shorten-copy', 'split-title', 'switch-layout'],
  })

  const kpis = arrayValue(data.kpis ?? data.items)
  pushDensityDiagnostic({
    errors,
    warnings,
    fitDiagnostics,
    ignoreSoftLimits,
    slideIndex,
    slideType,
    field: 'kpis/items',
    path: data.kpis ? `${prefix}.kpis` : `${prefix}.items`,
    value: kpis?.length,
    softLimit: soft.kpisMax,
    hardLimit: hard.kpisMax,
    unit: 'items',
    codeBase: 'array.kpis',
    suggestedActions: ['split-slide', 'switch-layout', 'remove-item'],
  })

  const cards = arrayValue(data.cards)
  pushDensityDiagnostic({
    errors,
    warnings,
    fitDiagnostics,
    ignoreSoftLimits,
    slideIndex,
    slideType,
    field: 'cards',
    path: `${prefix}.cards`,
    value: cards?.length,
    softLimit: soft.cardsMax,
    hardLimit: hard.cardsMax,
    unit: 'items',
    codeBase: 'array.cards',
    suggestedActions: ['split-slide', 'switch-layout', 'remove-card'],
  })

  const steps = arrayValue(data.steps)
  pushDensityDiagnostic({
    errors,
    warnings,
    fitDiagnostics,
    ignoreSoftLimits,
    slideIndex,
    slideType,
    field: 'steps',
    path: `${prefix}.steps`,
    value: steps?.length,
    softLimit: soft.timelineStepsMax,
    hardLimit: hard.timelineStepsMax,
    unit: 'items',
    codeBase: 'array.timelineSteps',
    suggestedActions: ['split-slide', 'shorten-copy', 'remove-step'],
  })

  const rows = arrayValue(data.rows ?? data.tableRows)
  pushDensityDiagnostic({
    errors,
    warnings,
    fitDiagnostics,
    ignoreSoftLimits,
    slideIndex,
    slideType,
    field: 'rows',
    path: data.rows ? `${prefix}.rows` : `${prefix}.tableRows`,
    value: rows?.length,
    softLimit: slideType === 'benchmarkSlide' ? soft.tableRowsMax : soft.profileRowsMax,
    hardLimit: slideType === 'benchmarkSlide' ? hard.tableRowsMax : hard.profileRowsMax,
    unit: 'items',
    codeBase: 'array.rows',
    suggestedActions: ['split-slide', 'switch-layout', 'shorten-table'],
  })

  if (cards) {
    cards.forEach((card, j) => {
      const items = Array.isArray(card) ? card[3] : card?.items
      pushDensityDiagnostic({
        errors,
        warnings,
        fitDiagnostics,
        ignoreSoftLimits,
        slideIndex,
        slideType,
        field: 'cardItems',
        path: `${prefix}.cards[${j}].items`,
        value: Array.isArray(items) ? items.length : undefined,
        softLimit: soft.bulletsPerCardMax,
        hardLimit: hard.bulletsPerCardMax,
        unit: 'items',
        codeBase: 'array.cardBullets',
        suggestedActions: ['shorten-copy', 'split-card', 'remove-bullet'],
      })
    })
  }
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
    warnings.push(
      makeIssue(
        'catalog',
        `DeckKit "${entry.id}" readiness is "${entry.readiness ?? 'unspecified'}"; delivery mode requires production/default readiness`,
        { path: 'catalog.readiness', readiness: entry.readiness },
      ),
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
