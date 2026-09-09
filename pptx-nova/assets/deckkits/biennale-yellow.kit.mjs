// biennale-yellow.kit.mjs - Editorial biennale yellow DeckKit
// version: 0.1.0
import { SLIDE_H, SLIDE_W, createOps, nm } from './core-primitives.kit.mjs'

export const C = {
  paper: 'E9E5DB',
  paperDeep: 'DCD6C4',
  sun: 'F1EE2E',
  sunSoft: 'F8F39B',
  haze: 'F0DA7C',
  ink: '1B2566',
  ember: 'E26B4A',
}

export const FONT_DISPLAY = 'Times New Roman'
export const FONT_BODY = 'Arial'
export const FONT_MONO = 'Courier New'

const str = (value) => String(value ?? '')
const list = (value) => (Array.isArray(value) ? value : value ? [value] : [])
const objectList = (value, max, path) => {
  const values = Array.isArray(value) ? value : []
  if (values.length > max)
    throw new Error(`${path}: ${values.length} items exceeds layout limit ${max}`)
  return values
}
const pad2 = (value) => String(value).padStart(2, '0')
const font = (size, color = C.ink, name = FONT_BODY, extra = {}) => ({
  name,
  size: `${size}pt`,
  color,
  ...extra,
})

function makeOps() {
  const p = createOps({
    textbox: {
      marginLeft: '0.02in',
      marginRight: '0.02in',
      marginTop: '0in',
      marginBottom: '0in',
    },
  })

  const text = (s, base, x, y, w, h, value, textFont, options = {}) => {
    const name = nm(s, base)
    p.textbox(s, name, x, y, w, h)
    p.setText(s, name, str(value))
    const paragraphs = str(value).split(/\r\n|\r|\n/).length
    for (let i = 0; i < paragraphs; i += 1) {
      p.runFont(s, name, textFont, i)
      const paragraph = { op: 'set-paragraph', slide: s, shape: { name }, paragraph: i }
      const format = {}
      if (options.align) format.alignment = options.align
      if (options.lineSpacing) format.lineSpacing = options.lineSpacing
      if (options.spaceAfter !== undefined) format.spaceAfter = options.spaceAfter
      if (options.spaceBefore !== undefined) format.spaceBefore = options.spaceBefore
      if (Object.keys(format).length > 0) paragraph.format = format
      if (Object.keys(paragraph).length > 4) p.ops.push(paragraph)
    }
    if (options.autoSize) {
      p.ops.push({
        op: 'set-text-frame',
        slide: s,
        shape: { name },
        frame: { autofit: { mode: options.autoSize } },
      })
    }
    return name
  }

  const alphaFill = (s, name, color, alpha) =>
    p.ops.push({
      op: 'set-shape',
      slide: s,
      shape: { name },
      fill: { type: 'solid', color, alpha },
    })

  const alphaBox = (s, base, x, y, w, h, color, alpha) => {
    const name = nm(s, base)
    p.box(s, name, 'rectangle', x, y, w, h, color)
    alphaFill(s, name, color, alpha)
  }

  const line = (s, base, x, y, w, h = 0.008, color = C.ink, alpha = 1) => {
    const name = nm(s, base)
    p.box(s, name, 'rectangle', x, y, w, h, color)
    if (alpha !== 1) alphaFill(s, name, color, alpha)
  }

  const strokeRect = (s, base, x, y, w, h, fill, stroke = C.ink) => {
    const name = nm(s, base)
    p.shape(s, name, 'rectangle', x, y, w, h)
    p.fill(s, name, fill)
    p.setLine(s, name, stroke, '0.75pt')
  }

  const softOval = (s, base, x, y, w, h, color, alpha, radius = '20pt') => {
    const nx = Math.max(0, x)
    const ny = Math.max(0, y)
    const nw = Math.min(w - (nx - x), SLIDE_W - nx)
    const nh = Math.min(h - (ny - y), SLIDE_H - ny)
    if (nw <= 0 || nh <= 0) return
    const name = nm(s, base)
    p.box(s, name, 'oval', nx, ny, nw, nh, color)
    alphaFill(s, name, color, alpha)
    p.ops.push({
      op: 'set-shape',
      slide: s,
      shape: { name },
      effect: { softEdge: { radius } },
    })
  }

  const sunBloom = (s, base, cx, cy, w, h, alpha = 0.38) => {
    const name = nm(s, base)
    p.shape(s, name, 'oval', cx - w / 2, cy - h / 2, w, h)
    p.ops.push({
      op: 'set-shape',
      slide: s,
      shape: { name },
      fill: {
        type: 'gradient',
        path: 'circle',
        fillToRect: { left: 0.5, top: 0.5, right: 0.5, bottom: 0.5 },
        stops: [
          { position: 0, color: { rgb: C.sun, alpha: alpha * 0.95 } },
          { position: 0.46, color: { rgb: C.sunSoft, alpha: alpha * 0.62 } },
          { position: 0.76, color: { rgb: C.haze, alpha: alpha * 0.3 } },
          { position: 1, color: { rgb: C.haze, alpha: 0 } },
        ],
      },
    })
    p.ops.push({
      op: 'set-shape',
      slide: s,
      shape: { name },
      line: { noLine: true },
    })
  }

  const hazeOval = (s, base, cx, cy, w, h, color = C.sunSoft, alpha = 0.12) =>
    softOval(s, base, cx - w / 2, cy - h / 2, w, h, color, alpha, '48pt')

  const emberBloom = (s, base, cx, cy, w, h, alpha = 0.16) =>
    softOval(s, base, cx - w / 2, cy - h / 2, w, h, C.ember, alpha, '38pt')

  const pageNum = (s, total) =>
    text(
      s,
      'PageNum',
      12.45,
      7.14,
      0.58,
      0.18,
      `${pad2(s + 1)} / ${pad2(total)}`,
      font(9, C.ink, FONT_MONO),
      { align: 'right' },
    )

  const footerBand = (s, y, items, widths = [2.26, 2.06, 2.88, 4.11]) => {
    const xs = [0.53, 3.11, 5.49, 8.69]
    objectList(items, 4, 'footerItems').forEach((item, i) => {
      const lineCount = str(item.text).split(/\r\n|\r|\n/).length
      const textY = y + 0.31
      const textH = Math.min(lineCount > 2 ? 0.56 : 0.42, SLIDE_H - textY - 0.02)
      line(s, `FootRule${i}`, xs[i], y, widths[i], 0.008, C.ink)
      text(
        s,
        `FootLabel${i}`,
        xs[i],
        y + 0.11,
        widths[i],
        0.16,
        item.label,
        font(9, C.ink, FONT_BODY, { bold: true }),
      )
      text(
        s,
        `FootText${i}`,
        xs[i],
        textY,
        widths[i],
        textH,
        item.text,
        font(9, C.ink, FONT_BODY),
        { lineSpacing: 1.15, spaceAfter: '0pt' },
      )
    })
  }

  const add = (s) => p.addSlide(s, C.paper)

  return {
    p,
    add,
    alphaBox,
    line,
    strokeRect,
    sunBloom,
    emberBloom,
    text,
    pageNum,
    footerBand,
    hazeOval,
  }
}

function makePageTypes(api, total) {
  const {
    p,
    add,
    alphaBox,
    line,
    strokeRect,
    sunBloom,
    emberBloom,
    hazeOval,
    text,
    pageNum,
    footerBand,
  } = api

  const cover = (s, data) => {
    add(s)
    const col = SLIDE_W / 4
    const row = SLIDE_H / 8
    alphaBox(s, 'Tile1', 0, row * 2, col, row * 3, C.sun, 0.55)
    alphaBox(s, 'Tile2', col * 3, 0, col, row * 3, C.sun, 0.4)
    alphaBox(s, 'Tile3', 0, row * 5, col * 2, row * 3, C.sun, 0.7)
    alphaBox(s, 'Tile4', col * 2, row * 5, col * 2, row * 2, C.sun, 0.45)
    sunBloom(s, 'Sun', 6.95, 3.45, 5.7, 3.15, 0.32)
    emberBloom(s, 'Ember', 11.9, 1.05, 2.7, 2.1, 0.16)
    text(s, 'DateRail', 9.72, 0.48, 2.86, 1.25, data.dateRange, font(42, C.ink, FONT_DISPLAY), {
      align: 'right',
      lineSpacing: 0.9,
      spaceAfter: '0pt',
      autoSize: 'text',
    })
    text(s, 'Title', 0.53, 2.08, 7.25, 2.95, data.title, font(92, C.ink, FONT_DISPLAY), {
      lineSpacing: 0.86,
      spaceAfter: '0pt',
      autoSize: 'text',
    })
    text(
      s,
      'Subline',
      0.53,
      6.12,
      3.7,
      0.18,
      data.subline,
      font(9, C.ink, FONT_BODY, { bold: true }),
    )
    footerBand(s, 6.67, data.footerItems, [2.26, 2.06, 2.88, 3.45])
    pageNum(s, total)
  }

  const manifesto = (s, data) => {
    add(s)
    hazeOval(s, 'Haze', 6.75, 3.75, 8.8, 4.3, C.sunSoft, 0.14)
    emberBloom(s, 'Ember', 1.3, 6.65, 2.6, 1.4, 0.06)
    text(
      s,
      'Quote',
      0.92,
      2.05,
      11.65,
      2.7,
      data.quote,
      font(56, C.ink, FONT_DISPLAY, { italic: true }),
      {
        lineSpacing: 1.04,
        spaceAfter: '0pt',
        autoSize: 'text',
      },
    )
    text(
      s,
      'Attribution',
      0.53,
      6.42,
      4.8,
      0.18,
      data.attribution,
      font(9, C.ink, FONT_BODY, { bold: true }),
    )
    pageNum(s, total)
  }

  const programme = (s, data) => {
    add(s)
    p.box(s, nm(s, 'LeftPanel'), 'rectangle', 0, 0, SLIDE_W / 2, SLIDE_H, C.sun)
    text(s, 'Kicker', 0.53, 0.52, 3.5, 0.18, data.kicker, font(9, C.ink, FONT_BODY, { bold: true }))
    text(s, 'Word', 0.53, 3.05, 6.05, 1.25, data.word, font(84, C.ink, FONT_DISPLAY), {
      lineSpacing: 0.86,
      spaceAfter: '0pt',
      autoSize: 'text',
    })
    text(s, 'Description', 0.65, 6.28, 5.7, 0.55, data.description, font(10.5, C.ink, FONT_BODY), {
      lineSpacing: 1.35,
      spaceAfter: '0pt',
    })
    text(s, 'Head', 7.23, 0.55, 5.6, 0.2, data.headLabel, font(9, C.ink, FONT_BODY, { bold: true }))
    line(s, 'HeadRule', 7.23, 0.82, 5.6, 0.008, C.ink)
    objectList(data.strands, 5, 'strands').forEach((item, i) => {
      const y = 0.92 + i * 1.05
      text(s, `StrandNum${i}`, 7.23, y, 0.5, 0.35, item.num, font(18, C.ink, FONT_DISPLAY))
      text(
        s,
        `StrandTitle${i}`,
        7.92,
        y - 0.01,
        4.6,
        0.28,
        item.title,
        font(18, C.ink, FONT_DISPLAY),
      )
      text(
        s,
        `StrandBody${i}`,
        7.92,
        y + 0.34,
        4.55,
        0.66,
        item.body,
        font(10.5, C.ink, FONT_BODY),
        {
          lineSpacing: 1.25,
          spaceAfter: '0pt',
        },
      )
      line(s, `StrandRule${i}`, 7.23, y + 0.9, 5.55, 0.006, C.ink, 0.2)
    })
    pageNum(s, total)
  }

  const chapter = (s, data) => {
    add(s)
    hazeOval(s, 'CornerSun', 0.7, 0.55, 2.9, 1.6, C.sunSoft, 0.12)
    emberBloom(s, 'CornerEmber', 11.2, 6.05, 2.0, 1.0, 0.04)
    text(s, 'Rail', 0.53, 0.52, 3.75, 0.18, data.rail, font(9, C.ink, FONT_BODY, { bold: true }))
    text(s, 'Number', 1.55, 0.75, 5.0, 3.3, data.number, font(195, C.ink, FONT_DISPLAY), {
      lineSpacing: 0.84,
      spaceAfter: '0pt',
    })
    text(s, 'Title', 1.55, 4.22, 9.3, 1.28, data.title, font(38, C.ink, FONT_DISPLAY))
    text(s, 'Lede', 1.55, 5.58, 6.25, 0.9, data.lede, font(10.5, C.ink, FONT_BODY), {
      lineSpacing: 1.25,
      spaceAfter: '0pt',
    })
    pageNum(s, total)
  }

  const dataSlide = (s, data) => {
    add(s)
    hazeOval(s, 'TopBloom', 11.6, 0.85, 3.5, 1.8, C.sunSoft, 0.1)
    text(s, 'Title', 0.53, 0.48, 5.6, 0.75, data.title, font(34, C.ink, FONT_DISPLAY), {
      autoSize: 'text',
    })
    text(s, 'Label', 10.3, 0.83, 2.5, 0.18, data.label, font(9, C.ink, FONT_BODY, { bold: true }), {
      align: 'right',
    })
    line(s, 'HeadRule', 0.53, 1.12, 12.27, 0.008, C.ink)
    objectList(data.stats, 2, 'stats').forEach((item, i) => {
      const y = i === 0 ? 2.45 : 4.82
      text(
        s,
        `Stat${i}`,
        0.53,
        y,
        2.8,
        0.85,
        `${str(item.value)}${str(item.suffix)}`,
        font(62, C.ink, FONT_DISPLAY),
        {
          lineSpacing: 0.9,
          spaceAfter: '0pt',
          autoSize: 'text',
        },
      )
      text(
        s,
        `StatLabel${i}`,
        0.53,
        y + 0.92,
        2.8,
        0.16,
        item.label,
        font(9, C.ink, FONT_BODY, { bold: true }),
      )
      text(
        s,
        `StatDesc${i}`,
        0.53,
        y + 1.14,
        3.1,
        i === 0 ? 1.0 : 0.7,
        item.description,
        font(10.5, C.ink, FONT_BODY),
        {
          lineSpacing: 1.25,
          spaceAfter: '0pt',
        },
      )
    })
    objectList(data.bars, 6, 'bars').forEach((item, i) => {
      const y = 3.62 + i * 0.22
      const pct = Math.max(0.04, Math.min(1, Number(item.pct) || 0))
      text(s, `BarYear${i}`, 5.8, y - 0.03, 0.56, 0.16, item.label, font(9, C.ink, FONT_MONO))
      if (item.accent) strokeRect(s, `Bar${i}`, 6.55, y, 5.35 * pct, 0.13, C.sun)
      else p.box(s, nm(s, `Bar${i}`), 'rectangle', 6.55, y, 5.35 * pct, 0.13, C.ink)
      text(s, `BarVal${i}`, 12.05, y - 0.03, 0.75, 0.16, item.value, font(9, C.ink, FONT_MONO), {
        align: 'right',
      })
    })
    pageNum(s, total)
  }

  const quote = (s, data) => {
    add(s)
    p.box(s, nm(s, 'YellowPanel'), 'rectangle', 10.4, 0, 2.93, SLIDE_H, C.sun)
    hazeOval(s, 'LeftBloom', 1.1, 6.6, 3.2, 1.7, C.sunSoft, 0.08)
    text(s, 'Kicker', 0.53, 2.18, 4.0, 0.18, data.kicker, font(9, C.ink, FONT_BODY, { bold: true }))
    text(s, 'Quote', 0.53, 2.72, 8.5, 2.25, data.quote, font(34, C.ink, FONT_DISPLAY), {
      lineSpacing: 1.02,
      spaceAfter: '0pt',
      autoSize: 'text',
    })
    line(s, 'AttrRule', 0.53, 5.18, 8.0, 0.008, C.ink)
    text(s, 'Author', 0.53, 5.3, 1.6, 0.15, data.author, font(9, C.ink, FONT_BODY, { bold: true }))
    text(s, 'Role', 2.25, 5.3, 6.25, 0.15, data.role, font(9, C.ink, FONT_BODY))
    p.box(s, nm(s, 'DotA'), 'oval', 11.85, 6.33, 0.08, 0.08, C.ink)
    p.box(s, nm(s, 'DotB'), 'oval', 12.0, 6.33, 0.08, 0.08, C.ink)
    pageNum(s, total)
  }

  const calendar = (s, data) => {
    add(s)
    hazeOval(s, 'TopBloom', 12.0, 0.2, 3.4, 1.7, C.sunSoft, 0.08)
    text(s, 'Title', 0.53, 0.48, 5.5, 0.75, data.title, font(38, C.ink, FONT_DISPLAY), {
      autoSize: 'text',
    })
    text(
      s,
      'Label',
      10.25,
      0.9,
      2.55,
      0.18,
      data.label,
      font(9, C.ink, FONT_BODY, { bold: true }),
      {
        align: 'right',
      },
    )
    line(s, 'HeadRule', 0.53, 1.14, 12.27, 0.008, C.ink)
    const cols = [
      { x: 0.53, w: 0.86, align: 'left' },
      { x: 1.57, w: 6.15, align: 'left' },
      { x: 8.23, w: 3.4, align: 'left' },
      { x: 12.06, w: 0.74, align: 'right' },
    ]
    list(data.columns)
      .slice(0, 4)
      .forEach((label, i) => {
        const col = cols[i]
        text(
          s,
          `Col${i}`,
          col.x,
          1.38,
          col.w,
          0.16,
          label,
          font(9, C.ink, FONT_BODY, { bold: true }),
          {
            align: col.align,
          },
        )
      })
    line(s, 'ColRule', 0.53, 1.62, 12.27, 0.008, C.ink)
    objectList(data.rows, 8, 'rows').forEach((row, i) => {
      const y = 1.74 + i * 0.45
      text(s, `Date${i}`, 0.53, y, 0.86, 0.18, row.date, font(9.8, C.ink, FONT_MONO))
      text(s, `Event${i}`, 1.57, y - 0.03, 6.25, 0.28, row.title, font(17.2, C.ink, FONT_DISPLAY))
      text(s, `Venue${i}`, 8.23, y, 3.45, 0.18, row.venue, font(10.5, C.ink, FONT_BODY))
      text(s, `Length${i}`, 12.05, y, 0.75, 0.18, row.length, font(9, C.ink, FONT_MONO), {
        align: 'right',
      })
      line(s, `RowRule${i}`, 0.53, y + 0.31, 12.27, 0.006, C.ink, 0.2)
    })
    pageNum(s, total)
  }

  const colophon = (s, data) => {
    add(s)
    const col = SLIDE_W / 4
    const row = SLIDE_H / 8
    alphaBox(s, 'Tile1', 0, 0, col * 2, row * 2, C.sun, 0.55)
    alphaBox(s, 'Tile2', col * 3, row * 4, col, row * 3, C.sun, 0.4)
    hazeOval(s, 'BottomBloom', 6.8, 7.25, 7.3, 2.4, C.sunSoft, 0.16)
    emberBloom(s, 'Ember', 1.4, 1.1, 2.4, 1.6, 0.06)
    text(s, 'Kicker', 0.65, 0.45, 3.6, 0.18, data.kicker, font(9, C.ink, FONT_BODY, { bold: true }))
    text(s, 'Title', 0.53, 1.1, 6.3, 4.75, data.title, font(76, C.ink, FONT_DISPLAY), {
      lineSpacing: 0.86,
      spaceAfter: '0pt',
    })
    footerBand(s, 6.12, data.footerItems, [2.65, 2.45, 2.25, 3.0])
    pageNum(s, total)
  }

  return {
    biennaleCoverSlide: cover,
    biennaleManifestoSlide: manifesto,
    biennaleProgrammeSlide: programme,
    biennaleChapterSlide: chapter,
    biennaleDataSlide: dataSlide,
    biennaleQuoteSlide: quote,
    biennaleCalendarSlide: calendar,
    biennaleColophonSlide: colophon,
  }
}

export function createDeck(content) {
  const slides = content.slides ?? []
  const api = makeOps()
  const dispatch = makePageTypes(api, slides.length)
  const warnings = []

  slides.forEach((slide, s) => {
    const fn = dispatch[slide.type]
    if (!fn) {
      warnings.push(`Unknown slide type "${slide.type}" at index ${s}`)
      return
    }
    fn(s, slide.data ?? {}, { path: `slides[${s}].data`, slideType: slide.type })
  })

  return { patch: { schemaVersion: 'pptx-patch/v1', ops: api.p.ops }, warnings }
}
