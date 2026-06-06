// core-primitives.lib.mjs — 几何安全 + op 生成（所有风格库共用）
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

// --- Content validation (delegates to validate-content logic) ---
export function validateContent(content, { lib, throwOnError = false } = {}) {
  const catalog = JSON.parse(readFileSync(join(__dirname, 'catalog.json'), 'utf8'))
  const entry = catalog.entries.find((e) => e.id === lib)
  const errors = []
  const warnings = []

  if (!content?.meta?.theme) errors.push({ type: 'meta', message: 'meta.theme is required' })
  if (lib && content?.meta?.theme && content.meta.theme !== lib) {
    errors.push({
      type: 'meta',
      message: `meta.theme "${content.meta.theme}" does not match lib "${lib}"`,
    })
  }
  if (!entry) errors.push({ type: 'meta', message: `lib "${lib}" not found in catalog` })

  if (!Array.isArray(content?.slides) || content.slides.length === 0) {
    errors.push({ type: 'structure', message: 'slides must be a non-empty array' })
  }

  if (entry && Array.isArray(content?.slides)) {
    const supported = entry.supportedSlideTypes
    const soft = entry.density?.soft ?? {}
    const hard = entry.density?.hard ?? {}
    for (let i = 0; i < content.slides.length; i++) {
      const { type, data } = content.slides[i]
      if (!supported.includes(type)) {
        errors.push({ type: 'slide', message: `slides[${i}]: unsupported type "${type}"` })
      }
      if (data?.title && hard.titleMaxChars && data.title.length > hard.titleMaxChars) {
        errors.push({
          type: 'density',
          message: `slides[${i}].title: ${data.title.length} chars > hard ${hard.titleMaxChars}`,
        })
      } else if (data?.title && soft.titleMaxChars && data.title.length > soft.titleMaxChars) {
        warnings.push({
          type: 'density',
          message: `slides[${i}].title: ${data.title.length} chars > soft ${soft.titleMaxChars}`,
        })
      }
    }
  }

  if (throwOnError && errors.length > 0) {
    throw new Error(
      `Content validation failed:\n${errors.map((e) => `  [${e.type}] ${e.message}`).join('\n')}`,
    )
  }
  return { errors, warnings, valid: errors.length === 0 }
}
