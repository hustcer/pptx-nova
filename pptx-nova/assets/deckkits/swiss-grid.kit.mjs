// swiss-grid.kit.mjs - Swiss International Typographic Style DeckKit
// version: 0.1.0
import {
  createOps,
  estimateDeckTextLineCount,
  grid,
  labelDuplicatesAutoIndex,
  nm,
  normalizeHex,
} from './core-primitives.kit.mjs'

const C = {
  red: 'E2231A',
  green: '15803D',
  amber: 'B45309',
  black: '111111',
  text: '171717',
  text2: '3A3A3A',
  muted: '666666',
  faint: '767676',
  hair: 'D8D8D8',
  grid: 'C9C9C9',
  gridLite: 'E7E7E7',
  panel: 'F4F4F4',
  white: 'FFFFFF',
}

const ACCENTS = [C.red, C.black, C.muted]
const FONT_CN = 'Arial'
const FONT_EN = 'Arial'
const MX = 0.65
const TEXT_INSET = 0.1
const FULL_GRID_W = 13.325
const FULL_GRID_H = 7.492
const TITLE_W = 6.8
const TITLE_H = 0.38
const TITLE_Y = 0.36
const TITLE_SUBTITLE_EXTRA_GAP = 3 / 96
const SUBTITLE_Y = 0.78 + TITLE_SUBTITLE_EXTRA_GAP
const SUBTITLE_W = 6.8
const SUBTITLE_FONT_PT = 11
const SUBTITLE_MIN_H = 0.3
const SUBTITLE_RULE_GAP = 0.12

const pad2 = (value) => String(value).padStart(2, '0')
const asLines = (value) => (Array.isArray(value) ? value.join('\n') : String(value ?? ''))
const limitItems = (items, max, path = 'items') => {
  const list = items ?? []
  if (!Array.isArray(list)) return []
  if (list.length > max) {
    throw new Error(`${path}: ${list.length} items exceeds layout limit ${max}`)
  }
  return list
}
const roundIn = (value) => Number(value.toFixed(3))
const explicitLineCount = (value) =>
  Math.max(
    1,
    asLines(value)
      .split('\n')
      .filter((line) => line.trim().length > 0).length,
  )
const textLineCount = (value, fontPt, widthIn) =>
  Math.max(
    explicitLineCount(value),
    estimateDeckTextLineCount(
      String(value ?? ''),
      fontPt,
      Math.max(0, widthIn - TEXT_INSET * 2) * 72,
    ),
  )
const textVisualBottom = (textY, fontPt, lines, bottomPad = 0.015) =>
  roundIn(textY + (Math.max(1, lines) * fontPt * 1.2) / 72 + bottomPad)
const ruleHeightToTextBottom = (ruleY, textBottom, minHeight = 0.12) =>
  roundIn(Math.max(minHeight, textBottom - ruleY))
const brandKey = (name) =>
  String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
const font = (size, color = C.text, bold = false, name = FONT_CN) => ({
  name,
  size: `${size}pt`,
  color,
  ...(bold ? { bold: true } : {}),
})
const textArray = (value) =>
  (Array.isArray(value) ? value : value ? [value] : [])
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
const highlightedRuns = (text, highlights, baseFont, emphasisFont) => {
  const source = String(text ?? '')
  const terms = textArray(highlights)
  if (!source || terms.length === 0) return [{ text: source, font: baseFont }]

  const matches = []
  for (const term of terms) {
    let cursor = 0
    while (cursor < source.length) {
      const start = source.indexOf(term, cursor)
      if (start < 0) break
      matches.push({ start, end: start + term.length })
      cursor = start + term.length
    }
  }
  matches.sort((a, b) => a.start - b.start || b.end - a.end)

  const runs = []
  let cursor = 0
  for (const match of matches) {
    if (match.start < cursor) continue
    if (match.start > cursor) runs.push({ text: source.slice(cursor, match.start), font: baseFont })
    runs.push({ text: source.slice(match.start, match.end), font: emphasisFont })
    cursor = match.end
  }
  if (cursor < source.length) runs.push({ text: source.slice(cursor), font: baseFont })
  return runs.length > 0 ? runs : [{ text: source, font: baseFont }]
}

const TABLE_TONE_COLORS = {
  success: C.green,
  good: C.green,
  green: C.green,
  ok: C.green,
  warning: C.amber,
  caution: C.amber,
  amber: C.amber,
  risk: C.red,
  critical: C.red,
  red: C.red,
  neutral: C.faint,
  gray: C.faint,
  grey: C.faint,
  black: C.black,
}

const inferTableColumns = (rows) => {
  const first = rows.find((row) => row && typeof row === 'object')
  if (Array.isArray(first)) {
    return first.map((_, i) => ({ key: `c${i + 1}`, label: `COL ${i + 1}` }))
  }
  if (first && typeof first === 'object') {
    const keys = Object.keys(first).filter((key) => key !== 'cells')
    if (keys.length > 0) return keys.map((key) => ({ key, label: key }))
  }
  return [
    { key: 'item', label: 'Item', align: 'left', width: 1.7 },
    { key: 'score', label: 'Score', align: 'center', width: 0.8 },
    { key: 'status', label: 'Status', align: 'left', kind: 'status', width: 1.2 },
  ]
}

const normalizeTableColumns = (data, rows, path = 'columns') => {
  const raw =
    Array.isArray(data.columns) && data.columns.length > 0 ? data.columns : inferTableColumns(rows)
  return limitItems(raw, 6, path).map((column, i) => {
    const source = typeof column === 'string' ? { key: column, label: column } : (column ?? {})
    const key = String(source.key ?? source.id ?? source.label ?? `c${i + 1}`)
    const widthValue = Number(source.width ?? source.weight)
    const kind =
      source.kind ??
      (key.toLowerCase().includes('status') || key.toLowerCase().includes('state')
        ? 'status'
        : 'text')
    const align = ['left', 'center', 'right'].includes(source.align)
      ? source.align
      : i === 0 || kind === 'status'
        ? 'left'
        : 'center'
    return {
      key,
      label: String(source.label ?? source.title ?? key),
      align,
      kind,
      width:
        Number.isFinite(widthValue) && widthValue > 0
          ? widthValue
          : i === 0
            ? 1.65
            : kind === 'status'
              ? 1.2
              : 1,
    }
  })
}

const tableCellValue = (row, column, index) => {
  if (Array.isArray(row)) return row[index]
  if (row && typeof row === 'object') {
    if (column.key in row) return row[column.key]
    if (column.label in row) return row[column.label]
    if (Array.isArray(row.cells)) return row.cells[index]
  }
  return ''
}

const tableCellText = (value) => {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return asLines(value)
  if (typeof value === 'object') {
    return String(value.label ?? value.text ?? value.value ?? value.status ?? '')
  }
  return String(value)
}

const tableToneColor = (value) => {
  if (!value || typeof value !== 'object') return C.black
  const explicit = normalizeHex(value.color)
  if (explicit) return explicit
  const key = String(value.tone ?? value.status ?? value.kind ?? '').toLowerCase()
  return TABLE_TONE_COLORS[key] ?? C.black
}

const BRAND_LOGOS = {
  airbnb: {
    path: 'M12.001 18.275c-1.353-1.697-2.148-3.184-2.413-4.457-.263-1.027-.16-1.848.291-2.465.477-.71 1.188-1.056 2.121-1.056s1.643.345 2.12 1.063c.446.61.558 1.432.286 2.465-.291 1.298-1.085 2.785-2.412 4.458zm9.601 1.14c-.185 1.246-1.034 2.28-2.2 2.783-2.253.98-4.483-.583-6.392-2.704 3.157-3.951 3.74-7.028 2.385-9.018-.795-1.14-1.933-1.695-3.394-1.695-2.944 0-4.563 2.49-3.927 5.382.37 1.565 1.352 3.343 2.917 5.332-.98 1.085-1.91 1.856-2.732 2.333-.636.344-1.245.558-1.828.609-2.679.399-4.778-2.2-3.825-4.88.132-.345.395-.98.845-1.961l.025-.053c1.464-3.178 3.242-6.79 5.285-10.795l.053-.132.58-1.116c.45-.822.635-1.19 1.351-1.643.346-.21.77-.315 1.246-.315.954 0 1.698.558 2.016 1.007.158.239.345.557.582.953l.558 1.089.08.159c2.041 4.004 3.821 7.608 5.279 10.794l.026.025.533 1.22.318.764c.243.613.294 1.222.213 1.858zm1.22-2.39c-.186-.583-.505-1.271-.9-2.094v-.03c-1.889-4.006-3.642-7.608-5.307-10.844l-.111-.163C15.317 1.461 14.468 0 12.001 0c-2.44 0-3.476 1.695-4.535 3.898l-.081.16c-1.669 3.236-3.421 6.843-5.303 10.847v.053l-.559 1.22c-.21.504-.317.768-.345.847C-.172 20.74 2.611 24 5.98 24c.027 0 .132 0 .265-.027h.372c1.75-.213 3.554-1.325 5.384-3.317 1.829 1.989 3.635 3.104 5.382 3.317h.372c.133.027.239.027.265.027 3.37.003 6.152-3.261 4.802-6.975z',
  },
  apple: {
    path: 'M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701',
  },
  google: {
    path: 'M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z',
  },
  ibm: {
    h: 0.28,
    path: 'M23.544 15.993c.038 0 .06-.017.06-.053v-.036c0-.035-.022-.052-.06-.052h-.09v.14zm-.09.262h-.121v-.498h.225c.112 0 .169.066.169.157 0 .079-.036.129-.09.15l.111.19h-.133l-.092-.17h-.07zm.434-.222v-.062c0-.2-.157-.357-.363-.357a.355.355 0 00-.363.357v.062c0 .2.156.358.363.358a.355.355 0 00.363-.358zm-.838-.03c0-.28.212-.492.475-.492.264 0 .475.213.475.491 0 .279-.211.491-.475.491a.477.477 0 01-.475-.49zM16.21 8.13l-.216-.624h-3.56v.624zm.413 1.19l-.216-.623h-3.973v.624zm2.65 7.147h3.107v-.624h-3.108zm0-1.192h3.107v-.623h-3.108zm0-1.19h1.864v-.624h-1.865zm0-1.191h1.864v-.624h-1.865zm0-1.191h1.864v-.624h-3.555l-.175.504-.175-.504h-3.555v.624h1.865v-.574l.2.574h3.33l.2-.574zm1.864-1.815h-3.142l-.217.624h3.359zm-7.46 3.006h1.865v-.624h-1.865zm0 1.19h1.865v-.623h-1.865zm-1.243 1.191h3.108v-.623h-3.108zm0 1.192h3.108v-.624h-3.108zm6.386-8.961l-.216.624h3.776v-.624zm-.629 1.815h4.19v-.624h-3.974zm-4.514 1.19h3.359l-.216-.623h-3.143zm2.482 2.383h2.496l.218-.624h-2.932zm.417 1.19h1.662l.218-.623h-2.098zm.416 1.191h.83l.218-.623h-1.266zm.414 1.192l.217-.624h-.432zm-12.433-.006l4.578.006c.622 0 1.18-.237 1.602-.624h-6.18zm4.86-3v.624h2.092c0-.216-.03-.425-.083-.624zm-3.616.624h1.865v-.624H6.217zm3.617-3.573h2.008c.053-.199.083-.408.083-.624H9.834zm-3.617 0h1.865v-.624H6.217zM9.55 7.507H4.973v.624h6.18a2.36 2.36 0 00-1.602-.624zm2.056 1.191H4.973v.624h6.884a2.382 2.382 0 00-.25-.624zm-5.39 2.382v.624h4.87c.207-.176.382-.387.519-.624zm4.87 1.191h-4.87v.624h5.389a2.39 2.39 0 00-.519-.624zm-6.114 3.006h6.634c.11-.193.196-.402.25-.624H4.973zM0 8.13h4.352v-.624H0zm0 1.191h4.352v-.624H0zm1.243 1.191h1.865v-.624H1.243zm0 1.191h1.865v-.624H1.243zm0 1.19h1.865v-.623H1.243zm0 1.192h1.865v-.624H1.243zM0 15.276h4.352v-.623H0zm0 1.192h4.352v-.624H0Z',
    w: 0.46,
    yOffset: 0.03,
  },
  lufthansa: {
    path: 'M24,12c0-6.648-5.352-12-12-12C5.376,0,0,5.352,0,12c0,6.624,5.376,12,12,12C18.648,24,24,18.624,24,12z M23.136,12c0,6.12-4.992,11.136-11.136,11.136C5.88,23.136,0.864,18.121,0.864,12C0.864,5.856,5.88,0.864,12,0.864 C18.144,0.864,23.136,5.856,23.136,12z M16.248,11.28c-0.264,0-0.6,0-1.032,0.024l0.312-0.528h0.504c1.8,0,3.144,0.096,4.368,0.312 l0.552-0.528c-1.368-0.24-3.024-0.384-4.704-0.384H15.84l0.264-0.504h0.456c1.752,0,3.336,0.144,4.872,0.432l0.576-0.552 c-1.728-0.336-3.576-0.503-5.568-0.503c-0.849,0.003-1.698,0.043-2.544,0.12c-0.96,2.063-2.496,3.264-4.224,3.24 C9,12.384,8.159,12.097,7.08,11.52l-1.008-0.576l0.312-0.288l2.328,1.008l0.504-0.384L4.512,9.144l-0.72,0.552L2.112,9l0.024,0.696 c2.256,1.032,3.192,1.608,5.568,3.312c3.096,2.208,5.856,3.408,9.696,4.176l1.008-0.96h-0.24c-2.544,0-4.824-0.84-6.144-2.256 c1.104-0.672,2.471-0.983,4.368-0.983c0.504,0,1.224,0.047,1.896,0.119l0.576-0.552c-0.9-0.11-1.805-0.166-2.712-0.168 c-0.609-0.001-1.217,0.023-1.824,0.072l0.432-0.528c0.511-0.03,1.024-0.046,1.536-0.048c1.272,0,2.112,0.048,3.072,0.192 l0.552-0.528C18.912,11.377,17.52,11.28,16.248,11.28z',
  },
  spotify: {
    path: 'M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z',
  },
}

function makeSwissOps() {
  const p = createOps({ textbox: { marginTop: '0in', marginBottom: '0in' } })

  const line = (s, name, x, y, w, h, color = C.black) =>
    p.box(s, name, 'rectangle', x, y, w, h, color)
  const hRule = (s, name, x, y, w, color = C.black, h = 0.016) => line(s, name, x, y, w, h, color)
  const vRule = (s, name, x, y, h, color = C.black, w = 0.016) => line(s, name, x, y, w, h, color)
  const strokeRect = (s, name, x, y, w, h, lineColor = C.grid, fillColor = C.white) => {
    p.shape(s, name, 'rectangle', x, y, w, h)
    p.fill(s, name, fillColor)
    p.setLine(s, name, lineColor, '0.75pt')
  }
  const dot = (s, name, x, y, d, color = C.red) => p.box(s, name, 'oval', x, y, d, d, color)
  const rotate = (s, name, degrees) =>
    p.ops.push({ op: 'set-shape', slide: s, shape: { name }, rotation: degrees })
  const brandLogo = (s, name, key, x, y, color = C.black) => {
    const logo = BRAND_LOGOS[key]
    if (!logo) return false
    const fill = normalizeHex(color) ?? C.black
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#${fill}" d="${logo.path}"/></svg>`
    p.ops.push({
      op: 'add-image',
      slide: s,
      name,
      x: `${x}in`,
      y: `${y + (logo.yOffset ?? 0)}in`,
      w: `${logo.w ?? 0.34}in`,
      h: `${logo.h ?? 0.34}in`,
      bytesBase64: Buffer.from(svg).toString('base64'),
      mime: 'image/svg+xml',
    })
    return true
  }
  const richTx = (s, name, x, y, w, h, runs, align) => {
    const safeRuns = runs.filter((run) => run.text)
    if (safeRuns.length === 0) return p.tx(s, name, x, y, w, h, '', font(9, C.text), align)
    p.textbox(s, name, x, y, w, h)
    p.setText(s, name, safeRuns[0].text)
    p.runFont(s, name, safeRuns[0].font, 0, 0)
    safeRuns.slice(1).forEach((run) => p.addRun(s, name, 0, run.text, run.font))
    if (align) p.pAlign(s, name, align, 0)
    return name
  }

  return { ...p, line, hRule, vRule, strokeRect, dot, rotate, brandLogo, richTx }
}

function makeChrome(p, total) {
  const pageMark = (s, label = `P · ${pad2(s + 1)}`) => {
    p.tx(s, nm(s, 'PageMark'), MX, 0.4, 1.3, 0.18, label, font(7.8, C.faint, true, FONT_EN))
    p.tx(
      s,
      nm(s, 'PageNum'),
      11.72,
      6.92,
      1.0,
      0.18,
      `${pad2(s + 1)} / ${pad2(total)}`,
      font(7.6, C.faint, false, FONT_EN),
      'right',
    )
  }

  const coverFooter = (s, label = `${pad2(s + 1)} / ${pad2(total)}`) => {
    p.tx(
      s,
      nm(s, 'Foot'),
      11.42,
      6.92,
      1.05,
      0.16,
      label,
      font(7.5, C.faint, false, FONT_EN),
      'right',
    )
  }

  const title = (s, data, options = {}) => {
    const y = options.y ?? 0.68
    const kicker = data.eyebrow ?? `P · ${pad2(s + 1)}`
    if (!/^P · \d{2}$/.test(kicker)) {
      p.tx(s, nm(s, 'Kicker'), MX, y, 3.0, 0.18, kicker, {
        ...font(7.8, C.faint, true, FONT_EN),
      })
    }
    p.tx(s, nm(s, 'Title'), MX, y + TITLE_Y, TITLE_W, TITLE_H, data.title, font(27, C.text, false))
    let subtitleBottom = y + SUBTITLE_Y
    if (data.subtitle) {
      const subtitleLines = estimateDeckTextLineCount(
        String(data.subtitle),
        SUBTITLE_FONT_PT,
        (SUBTITLE_W - TEXT_INSET * 2) * 72,
      )
      const subtitleH = Math.max(
        SUBTITLE_MIN_H,
        Number(((subtitleLines * SUBTITLE_FONT_PT * 1.2) / 72 + 0.1).toFixed(2)),
      )
      p.tx(
        s,
        nm(s, 'Subtitle'),
        MX,
        y + SUBTITLE_Y,
        SUBTITLE_W,
        subtitleH,
        data.subtitle,
        font(SUBTITLE_FONT_PT, C.muted, false, FONT_EN),
      )
      subtitleBottom = y + SUBTITLE_Y + subtitleH
    }
    const ruleY = data.subtitle ? Math.max(y + 1.08, subtitleBottom + SUBTITLE_RULE_GAP) : y + 1.08
    p.hRule(s, nm(s, 'KickerRule'), MX + TEXT_INSET, ruleY, 0.58, C.red, 0.026)
    return ruleY + 0.44
  }

  return { pageMark, coverFooter, title }
}

function modularGrid(p, s, name, x, y, w, h, cols, rows, color = C.grid) {
  const colW = w / cols
  const rowH = h / rows
  for (let i = 0; i <= cols; i += 1) {
    p.vRule(s, nm(s, `${name}V${i}`), x + i * colW, y, h, color, 0.008)
  }
  for (let i = 0; i <= rows; i += 1) {
    p.hRule(s, nm(s, `${name}H${i}`), x, y + i * rowH, w, color, 0.008)
  }
}

function tinyGrid(p, s, name, x, y, w, h, cols, rows, options = {}) {
  p.strokeRect(s, nm(s, `${name}Frame`), x, y, w, h, options.line ?? C.grid)
  const colW = w / cols
  const rowH = h / rows
  for (let i = 1; i < cols; i += 1)
    p.vRule(s, nm(s, `${name}V${i}`), x + i * colW, y, h, options.line ?? C.grid, 0.012)
  for (let i = 1; i < rows; i += 1)
    p.hRule(s, nm(s, `${name}H${i}`), x, y + i * rowH, w, options.line ?? C.grid, 0.012)
  for (const [cx, cy, cw, ch, color] of options.blocks ?? []) {
    p.box(
      s,
      nm(s, `${name}B${cx}_${cy}`),
      'rectangle',
      x + cx * colW,
      y + cy * rowH,
      cw * colW,
      ch * rowH,
      color,
    )
  }
}

function makePageTypes(p, chrome) {
  function swissCoverSlide(s, data) {
    p.addSlide(s)
    modularGrid(p, s, 'CoverGrid', 0.0, 0.0, FULL_GRID_W, FULL_GRID_H, 10, 8, C.grid)
    p.tx(
      s,
      nm(s, 'Eyebrow'),
      0.62,
      0.8,
      2.4,
      0.2,
      data.eyebrow ?? '',
      font(10.5, C.muted, false, FONT_EN),
    )
    p.hRule(s, nm(s, 'EyebrowRule'), 0.62 + TEXT_INSET, 1.04, 1.24, C.black, 0.012)
    p.dot(s, nm(s, 'RedDot'), 9.52, 0.98, 0.64, C.red)
    p.tx(s, nm(s, 'Title'), 0.62, 4.5, 6.8, 0.95, data.title, font(48, C.text, false))
    p.tx(
      s,
      nm(s, 'Subtitle'),
      0.62,
      5.62,
      5.8,
      0.44,
      data.subtitle,
      font(24, C.text, true, FONT_EN),
    )
    const tagY = 6.16
    const tagW = 4.8
    const tagLines = textLineCount(data.tag, 10, tagW)
    const tagRuleY = 6.2
    p.vRule(
      s,
      nm(s, 'RedRule'),
      0.62,
      tagRuleY,
      ruleHeightToTextBottom(tagRuleY, textVisualBottom(tagY, 10, tagLines)),
      C.red,
      0.026,
    )
    p.tx(s, nm(s, 'Tag'), 0.82, tagY, tagW, 0.7, data.tag, font(10, C.muted, false, FONT_EN))
    chrome.coverFooter(s, data.footer)
  }

  function swissQuoteSlide(s, data) {
    p.addSlide(s)
    chrome.pageMark(s)
    p.tx(
      s,
      nm(s, 'QuoteMark'),
      1.02,
      1.48,
      1.28,
      1.24,
      data.mark ?? '«',
      font(74, C.red, true, FONT_EN),
    )
    p.tx(
      s,
      nm(s, 'Quote'),
      3.28,
      1.58,
      4.9,
      0.95,
      asLines(data.quote),
      font(25, C.text, false, FONT_EN),
    )
    p.tx(
      s,
      nm(s, 'Body'),
      3.28,
      3.1,
      4.98,
      2.04,
      asLines(data.body),
      font(15.2, C.muted, false, FONT_EN),
    )
    p.hRule(s, nm(s, 'AuthorRule'), 3.28 + TEXT_INSET, 5.58, 0.62, C.black, 0.016)
    p.tx(s, nm(s, 'Author'), 3.28, 5.82, 3.2, 0.26, data.author, font(13.2, C.text, true, FONT_EN))
    p.tx(
      s,
      nm(s, 'Source'),
      3.28,
      6.12,
      3.7,
      0.22,
      data.source,
      font(10.4, C.muted, false, FONT_EN),
    )
  }

  function swissTimelineSlide(s, data) {
    p.addSlide(s)
    chrome.pageMark(s)
    chrome.title(s, data)
    const steps = data.steps ?? []
    const cols = grid(Math.max(steps.length, 1), 0.28, 1.25, 10.25)
    const lineCenterY = 3.12
    const lineH = 0.008
    const lineX = 1.35
    const arrowX = 12.36
    const arrowW = 0.18
    const arrowH = 0.14
    p.hRule(
      s,
      nm(s, 'TimelineLine'),
      lineX,
      lineCenterY - lineH / 2,
      arrowX - lineX + 0.006,
      C.black,
      lineH,
    )
    const arrowName = nm(s, 'TimelineArrowHead')
    p.box(s, arrowName, 'triangle', arrowX, lineCenterY - arrowH / 2, arrowW, arrowH, C.black)
    p.rotate(s, arrowName, 90)
    steps.forEach((step, i) => {
      const col = cols[i]
      const accent = step.accent ?? (i === steps.length - 1 ? C.red : C.black)
      const dotD = accent === C.red ? 0.3 : 0.17
      const dotX = col.x + col.w / 2 - dotD / 2
      const dotY = lineCenterY - dotD / 2
      p.vRule(s, nm(s, `StepConnector${i}`), col.x + col.w / 2, 2.5, dotY - 2.5, C.gridLite, 0.01)
      p.dot(s, nm(s, `StepDot${i}`), dotX, dotY, dotD, accent)
      p.tx(
        s,
        nm(s, `Year${i}`),
        col.x,
        2.16,
        col.w,
        0.28,
        step.year,
        font(18, accent, true, FONT_EN),
        'center',
      )
      p.tx(
        s,
        nm(s, `Head${i}`),
        col.x,
        lineCenterY + 0.45,
        col.w,
        0.28,
        step.title,
        font(10.5, C.text, true, FONT_EN),
        'center',
      )
      p.tx(
        s,
        nm(s, `Body${i}`),
        col.x + 0.06,
        lineCenterY + 0.83,
        col.w - 0.12,
        0.95,
        asLines(step.body),
        font(9.2, C.muted),
        'center',
      )
    })
    if (data.calloutTitle) {
      const callout = String(data.callout ?? '')
      const calloutRuleY = 5.92
      p.vRule(
        s,
        nm(s, 'CalloutRule'),
        MX,
        calloutRuleY,
        ruleHeightToTextBottom(
          calloutRuleY,
          textVisualBottom(6.08, 8.4, textLineCount(callout, 8.4, 5.8)),
        ),
        C.red,
        0.024,
      )
      p.tx(
        s,
        nm(s, 'CalloutTitle'),
        MX + 0.18,
        5.84,
        2.5,
        0.2,
        data.calloutTitle,
        font(8.4, C.text, true),
      )
      const parts = highlightedRuns(
        callout,
        data.calloutHighlights ?? data.calloutEmphasis,
        font(8.4, C.muted),
        font(8.4, C.text, true),
      )
      p.richTx(s, nm(s, 'Callout'), MX + 0.18, 6.08, 5.8, 0.28, parts)
    }
  }

  function swissPrinciplesSlide(s, data) {
    p.addSlide(s)
    chrome.pageMark(s)
    const startY = chrome.title(s, data, { y: 0.68 })
    const items = data.items ?? []
    const cols = grid(4, 0.38, 0.7, 11.9)
    items.forEach((item, i) => {
      const row = Math.floor(i / 4)
      const col = cols[i % 4]
      const y = startY + row * 2.18
      const accent = item.accent ?? C.black
      p.hRule(
        s,
        nm(s, `CardRule${i}`),
        col.x,
        y + 0.54,
        col.w,
        accent === C.red ? C.red : C.black,
        0.015,
      )
      p.tx(
        s,
        nm(s, `Num${i}`),
        col.x,
        y,
        col.w,
        0.58,
        item.num,
        font(31, accent === C.red ? C.red : C.faint, true, FONT_EN),
      )
      p.tx(s, nm(s, `Head${i}`), col.x, y + 0.68, col.w, 0.26, item.title, font(9.4, C.text, true))
      p.tx(
        s,
        nm(s, `Sub${i}`),
        col.x,
        y + 0.98,
        col.w,
        0.18,
        item.subtitle,
        font(6.8, C.muted, true, FONT_EN),
      )
      p.tx(
        s,
        nm(s, `Body${i}`),
        col.x,
        y + 1.27,
        col.w - 0.12,
        0.5,
        asLines(item.body),
        font(7.2, C.muted),
      )
    })
  }

  function swissPeopleGridSlide(s, data) {
    p.addSlide(s)
    chrome.pageMark(s)
    const top = chrome.title(s, data, { y: 0.68 })
    const people = data.people ?? []
    const cols = grid(4, 0.42, 0.72, 11.82)
    people.forEach((person, i) => {
      const row = Math.floor(i / 4)
      const col = cols[i % 4]
      const y = top + 0.18 + row * 2.08
      const accent = person.accent ?? C.black
      p.tx(
        s,
        nm(s, `PersonNum${i}`),
        col.x,
        y,
        0.4,
        0.2,
        pad2(i + 1),
        font(8.6, C.red, false, FONT_EN),
      )
      p.tx(
        s,
        nm(s, `PersonName${i}`),
        col.x,
        y + 0.34,
        col.w,
        0.3,
        person.name,
        font(15.5, accent, true, FONT_EN),
      )
      p.tx(
        s,
        nm(s, `PersonYears${i}`),
        col.x,
        y + 0.68,
        col.w,
        0.2,
        person.years,
        font(10.2, C.muted, false, FONT_EN),
      )
      p.hRule(s, nm(s, `PersonRule${i}`), col.x + TEXT_INSET, y + 0.98, 0.58, accent, 0.014)
      p.tx(
        s,
        nm(s, `PersonBody${i}`),
        col.x,
        y + 1.25,
        col.w - 0.06,
        0.7,
        asLines(person.body),
        font(8.9, C.muted),
      )
    })
  }

  function swissProfileSlide(s, data) {
    p.addSlide(s)
    chrome.pageMark(s)
    chrome.title(s, data, { y: 0.68 })
    p.tx(
      s,
      nm(s, 'Initials'),
      0.78,
      2.35,
      2.1,
      0.75,
      data.initials ?? '',
      font(35, C.text, true, FONT_EN),
    )
    p.hRule(s, nm(s, 'InitialRule'), 0.78, 3.23, 1.5, C.black, 0.018)
    p.tx(s, nm(s, 'Name'), 0.78, 3.5, 2.7, 0.2, data.name, font(7.8, C.text, true, FONT_EN))
    p.tx(s, nm(s, 'Bio'), 0.78, 3.85, 3.0, 1.05, asLines(data.bio), font(7.4, C.muted))
    p.tx(s, nm(s, 'Meta'), 0.78, 5.25, 2.6, 0.5, asLines(data.meta), font(7.2, C.faint))
    const items = data.events ?? []
    const x = 4.62
    const y0 = 1.95
    const step = 0.66
    if (items.length > 1) {
      const firstDotCenterY = y0 + 0.095
      const lastDotCenterY = y0 + (items.length - 1) * step + 0.095
      p.vRule(
        s,
        nm(s, 'LifeLine'),
        x + 0.78,
        roundIn(firstDotCenterY),
        roundIn(lastDotCenterY - firstDotCenterY),
        C.black,
        0.015,
      )
    }
    items.forEach((event, i) => {
      const y = y0 + i * step
      const accent = event.accent ?? C.black
      p.tx(
        s,
        nm(s, `EventYear${i}`),
        x,
        y,
        0.55,
        0.18,
        event.year,
        font(7.6, accent, true, FONT_EN),
        'right',
      )
      const dotD = accent === C.red ? 0.17 : 0.13
      p.dot(s, nm(s, `EventDot${i}`), x + 0.785 - dotD / 2, y + 0.095 - dotD / 2, dotD, accent)
      p.tx(
        s,
        nm(s, `EventTitle${i}`),
        x + 1.08,
        y - 0.04,
        4.9,
        0.2,
        event.title,
        font(8.0, accent, true),
      )
      p.tx(s, nm(s, `EventBody${i}`), x + 1.08, y + 0.18, 5.0, 0.27, event.body, font(7.0, C.muted))
    })
  }

  function swissTypefaceSlide(s, data, ctx = {}) {
    p.addSlide(s)
    chrome.pageMark(s)
    chrome.title(s, data, { y: 0.68 })
    const cards = limitItems(data.cards, 3, `${ctx.path ?? 'data'}.cards`)
    const cols = grid(3, 0.5, 0.75, 11.82)
    cards.forEach((card, i) => {
      const col = cols[i]
      const accent = card.accent ?? C.black
      p.hRule(s, nm(s, `TypeRule${i}`), col.x, 2.0, col.w, accent, 0.016)
      p.tx(
        s,
        nm(s, `TypeLabel${i}`),
        col.x,
        2.22,
        1.2,
        0.18,
        `CARD · ${pad2(i + 1)}`,
        font(7.2, C.faint, true, FONT_EN),
      )
      p.tx(
        s,
        nm(s, `TypeName${i}`),
        col.x,
        2.62,
        col.w,
        0.28,
        card.name,
        font(11.5, accent, true, FONT_EN),
      )
      p.tx(
        s,
        nm(s, `TypeMeta${i}`),
        col.x,
        2.94,
        col.w,
        0.2,
        card.meta,
        font(7.1, C.muted, false, FONT_EN),
      )
      p.tx(
        s,
        nm(s, `TypeAa${i}`),
        col.x,
        3.55,
        col.w,
        0.95,
        card.sampleText ?? data.sampleText ?? '',
        font(54, accent, true, FONT_EN),
      )
      p.hRule(
        s,
        nm(s, `TypeAaRule${i}`),
        col.x + TEXT_INSET,
        5.18,
        0.58,
        accent === C.red ? C.red : C.black,
        0.014,
      )
      p.tx(
        s,
        nm(s, `TypeWeight${i}`),
        col.x,
        5.42,
        col.w,
        0.2,
        card.weight,
        font(7.8, accent, true, FONT_EN),
      )
      const bodyLines = asLines(card.body).split('\n')
      p.tx(
        s,
        nm(s, `TypeBodyLead${i}`),
        col.x,
        5.72,
        col.w - 0.05,
        0.42,
        bodyLines.slice(0, 2).join('\n'),
        font(8.8, accent === C.red ? C.red : C.text, true),
      )
      p.tx(
        s,
        nm(s, `TypeBodyRest${i}`),
        col.x,
        6.18,
        col.w - 0.05,
        0.62,
        bodyLines.slice(2).join('\n'),
        font(8.1, C.faint),
      )
    })
  }

  function swissGridTypesSlide(s, data, ctx = {}) {
    p.addSlide(s)
    chrome.pageMark(s)
    chrome.title(s, data, { y: 0.68 })
    const items = limitItems(data.items, 4, `${ctx.path ?? 'data'}.items`)
    p.hRule(s, nm(s, 'GridCrossH'), 0.68, 4.52, 12.0, C.gridLite, 0.012)
    p.vRule(s, nm(s, 'GridCrossV'), 6.66, 2.08, 4.78, C.gridLite, 0.012)
    const rows = [
      { y: 2.34, titleY: 2.6, subY: 2.96, bodyY: 3.38, diagramY: 2.3 },
      { y: 4.82, titleY: 5.08, subY: 5.44, bodyY: 5.86, diagramY: 4.76 },
    ]
    items.forEach((item, i) => {
      const left = i % 2 === 0
      const row = rows[Math.floor(i / 2)]
      const x = left ? 0.82 : 6.86
      const dX = left ? 4.58 : 10.62
      const accent = item.accent ?? C.black
      p.tx(
        s,
        nm(s, `GridNum${i}`),
        x,
        row.y,
        1.4,
        0.24,
        item.num,
        font(10.5, accent === C.red ? C.red : C.faint, false, FONT_EN),
      )
      p.tx(
        s,
        nm(s, `GridTitle${i}`),
        x,
        row.titleY,
        3.2,
        0.32,
        item.title,
        font(15.5, accent, false),
      )
      p.tx(
        s,
        nm(s, `GridSub${i}`),
        x,
        row.subY,
        2.6,
        0.24,
        item.subtitle,
        font(11, C.muted, false, FONT_EN),
      )
      p.tx(
        s,
        nm(s, `GridBody${i}`),
        x,
        row.bodyY,
        3.5,
        0.62,
        asLines(item.body),
        font(10.2, C.muted),
      )
      // diagram 未指定时按 index 轮换四种图形，避免同页装饰完全重复
      const diagram = item.diagram ?? ['mosaic', 'columns', 'manuscript', 'modular'][i % 4]
      if (diagram === 'manuscript')
        tinyGrid(p, s, `Diag${i}`, dX, row.diagramY, 1.68, 1.88, 1, 8, {
          blocks: [[0.12, 0.12, 0.76, 0.78, C.panel]],
        })
      else if (diagram === 'columns')
        tinyGrid(p, s, `Diag${i}`, dX, row.diagramY, 1.68, 1.88, 3, 1, {
          blocks: [
            [0.18, 0.12, 0.68, 0.78, C.panel],
            [1.16, 0.12, 0.68, 0.78, C.panel],
            [2.14, 0.12, 0.68, 0.78, C.panel],
          ],
        })
      else if (diagram === 'modular')
        tinyGrid(p, s, `Diag${i}`, dX, row.diagramY, 1.68, 1.88, 4, 5, {
          line: C.red,
          blocks: [
            [0, 0, 2, 1, 'F7D8D5'],
            [1, 2, 1, 2, C.text2],
            [3, 3, 1, 1, C.faint],
          ],
        })
      else
        tinyGrid(p, s, `Diag${i}`, dX, row.diagramY, 1.68, 1.88, 3, 4, {
          line: C.grid,
          blocks: [
            [0, 0, 3, 1, C.hair],
            [0, 1, 2, 2, C.panel],
            [2, 1, 1, 1, C.gridLite],
            [2, 2, 1, 1, C.hair],
            [0, 3, 1, 1, 'F7D8D5'],
            [1, 3, 2, 1, C.panel],
          ],
        })
    })
  }

  function swissSystemSlide(s, data) {
    p.addSlide(s)
    chrome.pageMark(s)
    chrome.title(s, data, { y: 0.68 })
    p.tx(
      s,
      nm(s, 'BaseLabel'),
      0.65,
      2.34,
      1.8,
      0.2,
      data.baseLabel ?? '',
      font(11, C.muted, false, FONT_EN),
    )
    p.tx(
      s,
      nm(s, 'BaseValue'),
      0.65,
      2.55,
      1.9,
      0.7,
      data.baseValue ?? '',
      font(36, C.red, true, FONT_EN),
    )
    p.tx(s, nm(s, 'BaseNote'), 0.65, 3.22, 2.5, 0.24, data.baseNote ?? '', font(10, C.faint))
    p.hRule(s, nm(s, 'BaseRule'), 0.65 + TEXT_INSET, 3.55, 3.2, C.black, 0.012)
    const bodyLines = asLines(data.body).split('\n')
    p.tx(
      s,
      nm(s, 'BaseBodyTitle'),
      0.65,
      4.02,
      3.7,
      0.22,
      bodyLines[0] ?? '',
      font(10.2, C.muted, false, FONT_EN),
    )
    bodyLines.slice(1).forEach((lineText, i) => {
      const match = lineText.match(/^(.*?)(\d+\s+px)(.*)$/)
      const runs = match
        ? [
            { text: match[1], font: font(10.5, C.text2, false, FONT_EN) },
            { text: match[2], font: font(10.5, C.text, true, FONT_EN) },
            { text: match[3], font: font(10.5, C.text2, false, FONT_EN) },
          ]
        : [{ text: lineText, font: font(10.5, C.text2, false, FONT_EN) }]
      p.richTx(s, nm(s, `BaseFormula${i}`), 0.65, 4.42 + i * 0.32, 3.85, 0.2, runs)
    })
    p.hRule(s, nm(s, 'BaseBottomRule'), 0.65 + TEXT_INSET, 6.28, 3.2, C.red, 0.012)
    p.tx(s, nm(s, 'BaseCallout'), 0.65, 6.52, 3.2, 0.44, asLines(data.callout), font(10.4, C.text))
    const x = 5.0
    const y = 2.18
    const cellW = 1.85
    const cellH = 0.72
    for (let i = 0; i < 4; i += 1) {
      p.hRule(s, nm(s, `Measure${i}`), x + i * cellW, y - 0.22, cellW - 0.18, C.grid, 0.008)
      p.tx(
        s,
        nm(s, `MeasureLabel${i}`),
        x + i * cellW + 0.44,
        y - 0.39,
        0.5,
        0.16,
        data.measureLabels?.[i] ?? data.measureLabel ?? '',
        font(7.5, C.muted, false, FONT_EN),
        'center',
      )
    }
    tinyGrid(p, s, 'SystemGrid', x, y, cellW * 4, cellH * 5, 4, 5, {
      line: C.black,
      blocks: [
        [1, 1, 2, 2, 'FBE3E1'],
        [0, 2, 1, 1, C.panel],
      ],
    })
    p.tx(
      s,
      nm(s, 'ImageLabel'),
      x + cellW,
      y + cellH * 2 - 0.1,
      cellW * 2,
      0.18,
      data.labels?.image ?? 'IMAGE 2x2',
      font(7.1, 'C01812', true, FONT_EN),
      'center',
    )
    p.tx(
      s,
      nm(s, 'TextLabel'),
      x + 0.14,
      y + cellH * 3 + 0.12,
      cellW - 0.2,
      0.18,
      data.labels?.text ?? 'TEXT 1x2',
      font(7.1, C.text2, true, FONT_EN),
      'center',
    )
    p.tx(
      s,
      nm(s, 'HeadlineLabel'),
      x + 0.14,
      y + 0.16,
      cellW * 4 - 0.2,
      0.18,
      data.labels?.headline ?? 'HEADLINE 4x1',
      font(7.1, C.muted, true, FONT_EN),
    )
  }

  function swissStatementSlide(s, data) {
    p.addSlide(s)
    chrome.pageMark(s)
    p.dot(s, nm(s, 'Dot'), 3.72, 2.18, 0.5, C.red)
    const label = data.label ?? ''
    const labelRuleY = 1.28
    p.vRule(
      s,
      nm(s, 'RedRule'),
      7.82,
      labelRuleY,
      ruleHeightToTextBottom(
        labelRuleY,
        textVisualBottom(1.45, 8.6, textLineCount(label, 8.6, 1.5)),
      ),
      C.red,
      0.026,
    )
    p.tx(s, nm(s, 'Label'), 8.0, 1.45, 1.5, 0.18, label, font(8.6, C.text2, false, FONT_EN))
    p.tx(
      s,
      nm(s, 'Title'),
      7.82,
      1.88,
      4.2,
      0.74,
      data.title ?? data.statement,
      font(39, C.text, false),
    )
    p.tx(
      s,
      nm(s, 'Subtitle'),
      7.82,
      2.72,
      5.0,
      0.32,
      data.subtitle,
      font(15.2, C.text, true, FONT_EN),
    )
    p.hRule(s, nm(s, 'Rule'), 10.24, 5.9, 1.48, C.black, 0.014)
    const bodyLines = asLines(data.body).split('\n')
    p.tx(
      s,
      nm(s, 'BodyCn'),
      7.82,
      6.42,
      2.8,
      0.42,
      bodyLines.slice(0, 2).join('\n'),
      font(11.4, C.muted),
    )
    p.tx(
      s,
      nm(s, 'BodyEn'),
      7.82,
      6.88,
      3.85,
      0.18,
      bodyLines.slice(2).join('\n'),
      font(8.6, C.muted, false, FONT_EN),
    )
  }

  function swissColumnSlide(s, data, ctx = {}) {
    p.addSlide(s)
    chrome.pageMark(s)
    chrome.title(s, data, { y: 0.68 })
    const items = limitItems(data.items, 4, `${ctx.path ?? 'data'}.items`)
    const cols = grid(4, 0.48, 0.75, 11.8)
    items.forEach((item, i) => {
      const col = cols[i]
      const accent = item.accent ?? C.black
      p.tx(
        s,
        nm(s, `ColNum${i}`),
        col.x,
        2.18,
        0.4,
        0.18,
        pad2(i + 1),
        font(7.2, accent, true, FONT_EN),
      )
      p.hRule(
        s,
        nm(s, `ColRule${i}`),
        col.x,
        2.52,
        col.w,
        accent === C.red ? C.red : C.black,
        0.012,
      )
      p.tx(s, nm(s, `ColTitle${i}`), col.x, 2.83, col.w, 0.23, item.title, font(9.4, C.text, true))
      p.tx(
        s,
        nm(s, `ColSub${i}`),
        col.x,
        3.12,
        col.w,
        0.18,
        item.subtitle,
        font(7.1, C.muted, true, FONT_EN),
      )
      p.tx(
        s,
        nm(s, `ColBody${i}`),
        col.x,
        3.54,
        col.w - 0.08,
        0.7,
        asLines(item.body),
        font(7.2, C.muted),
      )
      p.tx(
        s,
        nm(s, `ColExamples${i}`),
        col.x,
        4.78,
        col.w - 0.08,
        0.65,
        asLines(item.examples),
        font(7.1, C.faint),
      )
    })
  }

  function swissProgressSlide(s, data) {
    p.addSlide(s)
    chrome.pageMark(s)
    chrome.title(s, data, { y: 0.68 })
    const steps = data.steps ?? []
    const cols = grid(Math.max(steps.length, 1), 0.5, 0.9, 11.3)
    p.hRule(s, nm(s, 'ProgressLine'), 0.9, 4.05, 11.05, C.black, 0.016)
    steps.forEach((step, i) => {
      const col = cols[i]
      const accent = step.accent ?? C.faint
      p.tx(
        s,
        nm(s, `ProgNum${i}`),
        col.x,
        1.9,
        col.w,
        0.72,
        pad2(i + 1),
        font(34, accent, true, FONT_EN),
        'center',
      )
      const yearLabel = labelDuplicatesAutoIndex(step.year, i) ? '' : step.year
      if (yearLabel) {
        p.tx(
          s,
          nm(s, `ProgYear${i}`),
          col.x,
          3.15,
          col.w,
          0.2,
          yearLabel,
          font(8.1, C.red, false, FONT_EN),
          'center',
        )
      }
      const dotD = accent === C.red ? 0.18 : 0.11
      p.dot(
        s,
        nm(s, `ProgDot${i}`),
        col.x + col.w / 2 - dotD / 2,
        4.05 - dotD / 2,
        dotD,
        accent === C.faint ? C.black : accent,
      )
      p.tx(
        s,
        nm(s, `ProgTitle${i}`),
        col.x,
        4.45,
        col.w,
        0.22,
        step.title,
        font(8.2, accent === C.red ? C.red : C.text, true),
        'center',
      )
      p.tx(
        s,
        nm(s, `ProgBody${i}`),
        col.x + 0.05,
        4.82,
        col.w - 0.1,
        0.58,
        asLines(step.body),
        font(7.2, C.muted),
        'center',
      )
    })
    if (data.callout || data.calloutTitle) {
      const calloutLines = asLines(data.callout ?? '')
        .split('\n')
        .filter((line) => line.trim() !== '')
      const headText = data.calloutTitle ? String(data.calloutTitle) : (calloutLines[0] ?? '')
      const bodyLines = data.calloutTitle ? calloutLines : calloutLines.slice(1)
      const progressBody = bodyLines.join('\n')
      const progressRuleY = 6.08
      const progressBottom =
        bodyLines.length > 0
          ? textVisualBottom(6.3, 7.7, textLineCount(progressBody, 7.7, 7.6))
          : textVisualBottom(6.02, 8.2, textLineCount(headText, 8.2, 6.5))
      p.vRule(
        s,
        nm(s, 'ProgressCalloutRule'),
        MX,
        progressRuleY,
        ruleHeightToTextBottom(progressRuleY, progressBottom),
        C.red,
        0.024,
      )
      p.tx(
        s,
        nm(s, 'ProgressCalloutHead'),
        MX + 0.18,
        6.02,
        6.5,
        0.22,
        headText,
        font(8.2, C.text, true),
      )
      if (bodyLines.length > 0) {
        p.tx(
          s,
          nm(s, 'ProgressCalloutBody'),
          MX + 0.18,
          6.3,
          7.6,
          0.24,
          progressBody,
          font(7.7, C.faint),
        )
      }
    }
  }

  function swissBrandGridSlide(s, data) {
    p.addSlide(s)
    chrome.pageMark(s)
    chrome.title(s, data, { y: 0.68 })
    const brands = data.brands ?? []
    const cols = grid(3, 0.55, 0.82, 11.68)
    brands.forEach((brand, i) => {
      const row = Math.floor(i / 3)
      const col = cols[i % 3]
      const y = 2.05 + row * 2.1
      const accent = brand.accent ?? C.black
      const logoKey = brand.logo ?? brandKey(brand.name)
      const hasLogo = p.brandLogo(s, nm(s, `BrandIcon${i}`), logoKey, col.x, y, accent)
      if (!hasLogo) {
        p.icon(s, nm(s, `BrandIcon${i}`), brand.icon ?? 'layout-grid', col.x, y, 0.34, 0.34, {
          color: accent,
        })
      }
      p.tx(
        s,
        nm(s, `BrandName${i}`),
        col.x + 0.5,
        y + 0.02,
        col.w - 0.5,
        0.24,
        brand.name,
        font(12, accent, true, FONT_EN),
      )
      p.tx(
        s,
        nm(s, `BrandMeta${i}`),
        col.x + 0.5,
        y + 0.33,
        col.w - 0.5,
        0.18,
        brand.meta,
        font(7.1, C.muted, true, FONT_EN),
      )
      p.hRule(
        s,
        nm(s, `BrandRule${i}`),
        col.x,
        y + 0.75,
        col.w,
        accent === C.red ? C.red : C.black,
        0.012,
      )
      p.tx(
        s,
        nm(s, `BrandBody${i}`),
        col.x,
        y + 1.0,
        col.w - 0.08,
        0.62,
        asLines(brand.body),
        font(7.2, C.muted),
      )
    })
  }

  function swissTableSlide(s, data, ctx = {}) {
    p.addSlide(s)
    chrome.pageMark(s)
    const startY = chrome.title(s, data, { y: 0.68 })
    const sourceRows = Array.isArray(data.rows)
      ? data.rows
      : Array.isArray(data.items)
        ? data.items
        : []
    const rows = limitItems(sourceRows, 11, `${ctx.path ?? 'data'}.rows`)
    const columns = normalizeTableColumns(data, rows, `${ctx.path ?? 'data'}.columns`)
    const tableX = 0.75
    const tableY = Math.max(2.08, startY - 0.04)
    const tableW = 11.86
    const hasSource = Boolean(data.source)
    const hasNote = Boolean(data.note)
    const tableBottom = hasSource && hasNote ? 6.34 : hasSource || hasNote ? 6.5 : 6.68
    const tableH = tableBottom - tableY
    const headerH = rows.length > 9 ? 0.36 : 0.4
    const bodyH = Math.max(0.3, tableH - headerH)
    const rowH = bodyH / Math.max(rows.length, 1)
    const bodyFontPt = rowH < 0.35 ? 7.0 : rows.length > 9 ? 7.25 : 7.8
    const headerFontPt = columns.length > 4 ? 7.6 : 8.2
    const totalWeight = columns.reduce((sum, column) => sum + column.width, 0) || columns.length
    const colWidths = columns.map((column) => (tableW * column.width) / totalWeight)
    const colXs = []
    colWidths.reduce((x, w) => {
      colXs.push(x)
      return x + w
    }, tableX)

    p.hRule(s, nm(s, 'TableTopRule'), tableX, tableY, tableW, C.black, 0.012)
    columns.forEach((column, i) => {
      const x = colXs[i]
      const w = colWidths[i]
      const align =
        column.align === 'right' ? 'right' : column.align === 'center' ? 'center' : undefined
      const headerX = align ? x : x + 0.1
      const headerW = align ? w : Math.max(0.1, w - 0.16)
      p.tx(
        s,
        nm(s, `TableHead${i}`),
        headerX,
        tableY + 0.1,
        headerW,
        0.18,
        column.label,
        font(headerFontPt, C.text, true, FONT_EN),
        align,
      )
      if (i > 0) {
        p.vRule(s, nm(s, `TableColRule${i}`), x, tableY, tableH, C.gridLite, 0.008)
      }
    })
    const headerRuleY = tableY + headerH
    p.hRule(s, nm(s, 'TableHeaderRule'), tableX, headerRuleY, tableW, C.black, 0.018)

    rows.forEach((row, r) => {
      const rowY = headerRuleY + r * rowH
      columns.forEach((column, c) => {
        const x = colXs[c]
        const w = colWidths[c]
        const rawValue = tableCellValue(row, column, c)
        const align =
          column.align === 'right' ? 'right' : column.align === 'center' ? 'center' : undefined
        const textH = Math.min(0.24, Math.max(0.17, rowH - 0.1))
        const textY = rowY + Math.max(0.055, (rowH - textH) / 2)
        if (
          column.kind === 'status' ||
          (rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue))
        ) {
          const dotD = Math.min(0.078, Math.max(0.056, rowH * 0.18))
          const dotX = x + 0.13
          const dotY = rowY + rowH / 2 - dotD / 2
          p.dot(s, nm(s, `TableStatusDot${r}_${c}`), dotX, dotY, dotD, tableToneColor(rawValue))
          p.tx(
            s,
            nm(s, `TableCell${r}_${c}`),
            x + 0.3,
            textY,
            Math.max(0.1, w - 0.36),
            textH,
            tableCellText(rawValue),
            font(bodyFontPt, C.text2, false, FONT_CN),
          )
          return
        }
        const pad = align ? 0.06 : 0.12
        p.tx(
          s,
          nm(s, `TableCell${r}_${c}`),
          x + pad,
          textY,
          Math.max(0.1, w - pad * 2),
          textH,
          tableCellText(rawValue),
          font(bodyFontPt, c === 0 ? C.text : C.text2, c === 0, FONT_CN),
          align,
        )
      })
      p.hRule(
        s,
        nm(s, `TableRowRule${r + 1}`),
        tableX,
        headerRuleY + (r + 1) * rowH,
        tableW,
        r === rows.length - 1 ? C.grid : C.gridLite,
        r === rows.length - 1 ? 0.01 : 0.008,
      )
    })

    if (hasNote) {
      p.tx(
        s,
        nm(s, 'TableNote'),
        tableX,
        tableBottom + (hasSource ? 0.13 : 0.15),
        7.8,
        0.18,
        data.note,
        font(7.2, C.muted, false, FONT_CN),
      )
    }
    if (hasSource) {
      p.tx(
        s,
        nm(s, 'TableSource'),
        tableX,
        tableBottom + (hasNote ? 0.37 : 0.15),
        7.8,
        0.18,
        data.source,
        font(7.2, C.faint, false, FONT_EN),
      )
    }
  }

  function swissClosingSlide(s, data) {
    p.addSlide(s)
    modularGrid(p, s, 'ClosingGridFine', 0, 0, FULL_GRID_W, FULL_GRID_H, 80, 45, C.gridLite)
    modularGrid(p, s, 'ClosingGridMajor', 0, 0, FULL_GRID_W, FULL_GRID_H, 8, 9, C.grid)
    p.tx(
      s,
      nm(s, 'ClosingMark'),
      0.65,
      0.55,
      1.6,
      0.2,
      data.closingMark ?? `P · ${pad2(s + 1)} · CLOSING`,
      font(8.5, C.faint, false, FONT_EN),
    )
    p.hRule(s, nm(s, 'ClosingMarkRule'), 0.65, 0.77, 1.2, C.black, 0.012)
    for (const [x, y] of data.dots ?? [])
      p.dot(s, nm(s, `Dot${Math.round(x * 100)}_${Math.round(y * 100)}`), x, y, 0.085, C.red)
    const closingTitleW = 6.8
    p.tx(
      s,
      nm(s, 'TitleA'),
      0.45,
      3.08,
      closingTitleW,
      0.9,
      data.titleA ?? '',
      font(54, C.text, false),
    )
    p.tx(
      s,
      nm(s, 'TitleB'),
      0.45,
      4.15,
      closingTitleW,
      0.9,
      data.titleB ?? '',
      font(54, C.red, false),
    )
    const closingSubtitleW = 6.8
    const closingSubtitleFontPt = 13
    const closingSubtitleLines = estimateDeckTextLineCount(
      String(data.subtitle ?? ''),
      closingSubtitleFontPt,
      (closingSubtitleW - TEXT_INSET * 2) * 72,
    )
    const closingSubtitleH = Math.max(
      0.34,
      Number(((closingSubtitleLines * closingSubtitleFontPt * 1.2) / 72 + 0.05).toFixed(2)),
    )
    p.tx(
      s,
      nm(s, 'Subtitle'),
      0.45,
      5.23,
      closingSubtitleW,
      closingSubtitleH,
      data.subtitle,
      font(closingSubtitleFontPt, C.text, true, FONT_EN),
    )
    const footRuleY = 6.35
    p.vRule(
      s,
      nm(s, 'FootRule'),
      0.65,
      footRuleY,
      ruleHeightToTextBottom(
        footRuleY,
        textVisualBottom(6.46, 10, textLineCount(data.footerL ?? '', 10, 3.2)),
      ),
      C.black,
      0.018,
    )
    p.tx(
      s,
      nm(s, 'FootL'),
      0.85,
      6.46,
      3.2,
      0.22,
      data.footerL ?? '',
      font(10, C.text, false, FONT_EN),
    )
    p.tx(
      s,
      nm(s, 'FootR'),
      0.85,
      6.72,
      1.8,
      0.18,
      data.footerR ?? '',
      font(8.4, C.muted, false, FONT_EN),
    )
    p.tx(
      s,
      nm(s, 'ThankYou'),
      11.3,
      6.9,
      1.2,
      0.18,
      '— THANK YOU —',
      font(8.6, C.text, false, FONT_EN),
      'right',
    )
  }

  return {
    swissCoverSlide,
    swissQuoteSlide,
    swissTimelineSlide,
    swissPrinciplesSlide,
    swissPeopleGridSlide,
    swissProfileSlide,
    swissTypefaceSlide,
    swissGridTypesSlide,
    swissSystemSlide,
    swissStatementSlide,
    swissColumnSlide,
    swissProgressSlide,
    swissBrandGridSlide,
    swissTableSlide,
    swissClosingSlide,
  }
}

export function createDeck(content) {
  const slides = content.slides ?? []
  const total = slides.length
  const p = makeSwissOps()
  const chrome = makeChrome(p, total)
  const dispatch = makePageTypes(p, chrome)
  const warnings = []

  slides.forEach((slide, s) => {
    const fn = dispatch[slide.type]
    if (!fn) {
      warnings.push(`Unknown slide type "${slide.type}" at index ${s}`)
      return
    }
    fn(s, slide.data ?? {}, { path: `slides[${s}].data`, slideType: slide.type })
  })

  return { patch: { schemaVersion: 'pptx-patch/v1', ops: p.ops }, warnings }
}

export { ACCENTS, C, FONT_CN, FONT_EN }
