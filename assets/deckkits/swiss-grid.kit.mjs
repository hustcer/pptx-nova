// swiss-grid.kit.mjs - Swiss International Typographic Style DeckKit
// version: 0.1.0
import { createOps, grid, nm, SLIDE_W } from './core-primitives.kit.mjs'

const C = {
  red: 'E2231A',
  redDk: 'B91C16',
  black: '111111',
  nearBlack: '1D1D1B',
  text: '171717',
  text2: '3A3A3A',
  muted: '777777',
  faint: 'BDBDBD',
  hair: 'D8D8D8',
  grid: 'C9C9C9',
  gridLite: 'E7E7E7',
  panel: 'F4F4F4',
  pageBg: 'FFFFFF',
  white: 'FFFFFF',
}

const ACCENTS = [C.red, C.black, C.muted]
const FONT_CN = 'Arial'
const FONT_EN = 'Arial'
const MX = 0.65
const CW = SLIDE_W - MX * 2

const pad2 = (value) => String(value).padStart(2, '0')
const asLines = (value) => (Array.isArray(value) ? value.join('\n') : String(value ?? ''))
const font = (size, color = C.text, bold = false, name = FONT_CN) => ({
  name,
  size: `${size}pt`,
  color,
  ...(bold ? { bold: true } : {}),
})

function makeSwissOps() {
  const p = createOps()

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

  return { ...p, line, hRule, vRule, strokeRect, dot, richTx }
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

  const title = (s, data, options = {}) => {
    const y = options.y ?? 0.68
    const kicker = data.eyebrow ?? `P · ${pad2(s + 1)}`
    if (!/^P · \d{2}$/.test(kicker)) {
      p.tx(s, nm(s, 'Kicker'), MX, y, 3.0, 0.18, kicker, {
        ...font(7.8, C.faint, true, FONT_EN),
      })
    }
    p.tx(s, nm(s, 'Title'), MX, y + 0.36, 6.8, 0.38, data.title, font(27, C.text, false))
    if (data.subtitle) {
      p.tx(
        s,
        nm(s, 'Subtitle'),
        MX,
        y + 0.78,
        5.8,
        0.3,
        data.subtitle,
        font(11, C.muted, false, FONT_EN),
      )
    }
    p.hRule(s, nm(s, 'KickerRule'), MX, y + 1.08, 0.58, C.red, 0.026)
    return y + 1.52
  }

  const frame = (s) => {
    p.hRule(s, nm(s, 'FrameTop'), MX, 6.72, CW, C.gridLite, 0.012)
  }

  return { pageMark, title, frame }
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
    modularGrid(p, s, 'CoverGrid', 0.0, 0.0, 13.325, 7.492, 10, 8, C.grid)
    p.tx(
      s,
      nm(s, 'Eyebrow'),
      0.62,
      0.8,
      1.5,
      0.18,
      data.eyebrow ?? 'A LECTURE · 2026',
      font(10.5, C.muted, false, FONT_EN),
    )
    p.hRule(s, nm(s, 'EyebrowRule'), 0.62, 1.02, 1.24, C.black, 0.012)
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
    p.vRule(s, nm(s, 'RedRule'), 0.62, 6.2, 0.46, C.red, 0.026)
    p.tx(s, nm(s, 'Tag'), 0.82, 6.16, 4.8, 0.5, data.tag, font(10, C.muted, false, FONT_EN))
    p.tx(
      s,
      nm(s, 'Foot'),
      11.42,
      6.92,
      1.05,
      0.16,
      data.footer ?? '01 / 14',
      font(7.5, C.faint, false, FONT_EN),
      'right',
    )
  }

  function swissQuoteSlide(s, data) {
    p.addSlide(s)
    chrome.pageMark(s)
    p.tx(
      s,
      nm(s, 'QuoteMark'),
      1.02,
      1.16,
      0.9,
      0.8,
      data.mark ?? '«',
      font(42, C.red, true, FONT_EN),
    )
    p.tx(
      s,
      nm(s, 'Quote'),
      4.25,
      1.3,
      4.7,
      1.05,
      asLines(data.quote),
      font(14, C.text, true, FONT_EN),
    )
    p.tx(
      s,
      nm(s, 'Body'),
      4.25,
      2.65,
      4.45,
      0.95,
      asLines(data.body),
      font(8.5, C.muted, false, FONT_EN),
    )
    p.tx(s, nm(s, 'Author'), 4.25, 4.1, 2.8, 0.22, data.author, font(8, C.text, true, FONT_EN))
    p.tx(s, nm(s, 'Source'), 4.25, 4.34, 3.4, 0.2, data.source, font(7.6, C.muted, false, FONT_EN))
  }

  function swissTimelineSlide(s, data) {
    p.addSlide(s)
    chrome.pageMark(s)
    chrome.title(s, data)
    const steps = data.steps ?? []
    const cols = grid(Math.max(steps.length, 1), 0.28, 1.25, 10.25)
    const lineCenterY = 3.12
    const lineH = 0.018
    const lineX = 1.35
    const arrowX = 12.47
    p.hRule(
      s,
      nm(s, 'TimelineLine'),
      lineX,
      lineCenterY - lineH / 2,
      arrowX - lineX,
      C.black,
      lineH,
    )
    p.box(
      s,
      nm(s, 'TimelineArrow'),
      'right-arrow',
      arrowX - 0.02,
      lineCenterY - 0.075,
      0.28,
      0.15,
      C.black,
    )
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
        font(accent === C.red ? 18 : 18, accent, true, FONT_EN),
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
      p.vRule(s, nm(s, 'CalloutRule'), MX, 5.92, 0.46, C.red, 0.024)
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
      const callout = String(data.callout ?? '')
      const emphasis = '字体 · 学校 · 教学'
      const parts = callout.includes(emphasis)
        ? [
            { text: callout.slice(0, callout.indexOf(emphasis)), font: font(8.4, C.muted) },
            { text: emphasis, font: font(8.4, C.text, true) },
            {
              text: callout.slice(callout.indexOf(emphasis) + emphasis.length),
              font: font(8.4, C.muted),
            },
          ]
        : [{ text: callout, font: font(8.4, C.muted) }]
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
        0.42,
        item.num,
        font(22, accent === C.red ? C.red : C.faint, true, FONT_EN),
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
        font(7.5, accent, true, FONT_EN),
      )
      p.hRule(s, nm(s, `PersonRule${i}`), col.x, y + 0.32, 0.46, accent, 0.018)
      p.tx(
        s,
        nm(s, `PersonName${i}`),
        col.x,
        y + 0.6,
        col.w,
        0.25,
        person.name,
        font(9.2, accent, true, FONT_EN),
      )
      p.tx(
        s,
        nm(s, `PersonYears${i}`),
        col.x,
        y + 0.92,
        col.w,
        0.18,
        person.years,
        font(7.2, C.muted, false, FONT_EN),
      )
      p.tx(
        s,
        nm(s, `PersonBody${i}`),
        col.x,
        y + 1.18,
        col.w - 0.06,
        0.55,
        asLines(person.body),
        font(7.0, C.muted),
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
      data.initials ?? 'JMB',
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
    p.vRule(s, nm(s, 'LifeLine'), x + 0.78, y0 + 0.18, 4.22, C.black, 0.015)
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
      p.dot(s, nm(s, `EventDot${i}`), x + 0.72, y + 0.03, 0.13, accent)
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

  function swissTypefaceSlide(s, data) {
    p.addSlide(s)
    chrome.pageMark(s)
    chrome.title(s, data, { y: 0.68 })
    const cards = data.cards ?? []
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
      p.tx(s, nm(s, `TypeAa${i}`), col.x, 3.55, col.w, 0.95, 'Aa', font(54, accent, true, FONT_EN))
      p.tx(
        s,
        nm(s, `TypeWeight${i}`),
        col.x,
        4.72,
        col.w,
        0.2,
        card.weight,
        font(7.8, accent, true, FONT_EN),
      )
      p.tx(
        s,
        nm(s, `TypeBody${i}`),
        col.x,
        5.08,
        col.w - 0.05,
        0.9,
        asLines(card.body),
        font(7.2, C.muted),
      )
    })
  }

  function swissGridTypesSlide(s, data) {
    p.addSlide(s)
    chrome.pageMark(s)
    chrome.title(s, data, { y: 0.68 })
    const items = data.items ?? []
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
      if (item.diagram === 'manuscript')
        tinyGrid(p, s, `Diag${i}`, dX, row.diagramY, 1.68, 1.88, 1, 8, {
          blocks: [[0.12, 0.12, 0.76, 0.78, C.panel]],
        })
      else if (item.diagram === 'columns')
        tinyGrid(p, s, `Diag${i}`, dX, row.diagramY, 1.68, 1.88, 3, 1, {
          blocks: [
            [0.18, 0.12, 0.68, 0.78, C.panel],
            [1.16, 0.12, 0.68, 0.78, C.panel],
            [2.14, 0.12, 0.68, 0.78, C.panel],
          ],
        })
      else if (item.diagram === 'modular')
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
          line: C.black,
          blocks: [
            [0, 0, 3, 1, C.text2],
            [0, 1, 2, 2, C.hair],
            [2, 1, 1, 1, C.faint],
            [2, 2, 1, 1, C.hair],
            [0, 3, 1, 1, C.faint],
            [1, 3, 2, 1, C.hair],
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
      data.baseLabel ?? 'BASE UNIT',
      font(11, C.muted, false, FONT_EN),
    )
    p.tx(
      s,
      nm(s, 'BaseValue'),
      0.65,
      2.55,
      1.9,
      0.7,
      data.baseValue ?? '16px',
      font(36, C.red, true, FONT_EN),
    )
    p.tx(s, nm(s, 'BaseNote'), 0.65, 3.22, 2.5, 0.24, '所有距离的最小公因子', font(10, C.faint))
    p.hRule(s, nm(s, 'BaseRule'), 0.65, 3.55, 3.3, C.black, 0.012)
    p.tx(
      s,
      nm(s, 'BaseBody'),
      0.65,
      4.02,
      3.7,
      1.55,
      asLines(data.body),
      font(11.2, C.text2, false, FONT_EN),
    )
    p.hRule(s, nm(s, 'BaseBottomRule'), 0.65, 6.28, 3.3, C.red, 0.012)
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
        y - 0.32,
        0.5,
        0.16,
        '264',
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
      font(7.1, C.red, true, FONT_EN),
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
    chrome.pageMark(s, data.eyebrow ?? 'ARGUMENT · 07')
    p.dot(s, nm(s, 'Dot'), 3.35, 2.3, 0.38, C.red)
    p.vRule(s, nm(s, 'RedRule'), 6.92, 2.22, 0.82, C.red, 0.024)
    p.tx(
      s,
      nm(s, 'Label'),
      7.1,
      2.2,
      1.5,
      0.18,
      data.label ?? 'ARGUMENT · 07',
      font(7.2, C.muted, true, FONT_EN),
    )
    p.tx(s, nm(s, 'Title'), 7.1, 2.62, 3.6, 0.45, data.title, font(20, C.text, true))
    p.tx(
      s,
      nm(s, 'Subtitle'),
      7.1,
      3.08,
      4.2,
      0.24,
      data.subtitle,
      font(8.2, C.text, true, FONT_EN),
    )
    p.hRule(s, nm(s, 'Rule'), 9.32, 5.78, 1.0, C.black, 0.012)
    p.tx(s, nm(s, 'Body'), 7.1, 6.06, 3.6, 0.55, asLines(data.body), font(7.2, C.muted))
  }

  function swissColumnSlide(s, data) {
    p.addSlide(s)
    chrome.pageMark(s)
    chrome.title(s, data, { y: 0.68 })
    const items = data.items ?? []
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
        2.05,
        col.w,
        0.44,
        pad2(i + 1),
        font(23, accent, true, FONT_EN),
        'center',
      )
      p.tx(
        s,
        nm(s, `ProgYear${i}`),
        col.x,
        3.15,
        col.w,
        0.2,
        step.year,
        font(7.2, C.text, true, FONT_EN),
        'center',
      )
      p.dot(
        s,
        nm(s, `ProgDot${i}`),
        col.x + col.w / 2 - 0.055,
        4.0,
        0.11,
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
    if (data.callout) {
      p.vRule(s, nm(s, 'ProgressCalloutRule'), MX, 6.08, 0.46, C.red, 0.024)
      p.tx(
        s,
        nm(s, 'ProgressCallout'),
        MX + 0.18,
        6.02,
        6.5,
        0.34,
        data.callout,
        font(8.2, C.text, true),
      )
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
      p.icon(s, nm(s, `BrandIcon${i}`), brand.icon ?? 'layout-grid', col.x, y, 0.34, 0.34, {
        color: accent,
        strokeWidth: 1.8,
      })
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

  function swissClosingSlide(s, data) {
    p.addSlide(s)
    modularGrid(p, s, 'ClosingGridFine', 0, 0, 13.325, 7.492, 80, 45, C.gridLite)
    modularGrid(p, s, 'ClosingGridMajor', 0, 0, 13.325, 7.492, 8, 9, C.grid)
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
    p.tx(
      s,
      nm(s, 'TitleA'),
      0.45,
      3.08,
      5.0,
      0.9,
      data.titleA ?? '网格不是限制',
      font(54, C.text, false),
    )
    p.tx(
      s,
      nm(s, 'TitleB'),
      0.45,
      4.15,
      5.3,
      0.9,
      data.titleB ?? '是自由的语法',
      font(54, C.red, false),
    )
    p.tx(s, nm(s, 'Subtitle'), 0.45, 5.23, 5.9, 0.3, data.subtitle, font(13, C.text, true, FONT_EN))
    p.vRule(s, nm(s, 'FootRule'), 0.65, 6.35, 0.55, C.black, 0.018)
    p.tx(
      s,
      nm(s, 'FootL'),
      0.85,
      6.46,
      3.2,
      0.22,
      data.footerL ?? 'SWISS GRID SYSTEMS · A LECTURE',
      font(10, C.text, false, FONT_EN),
    )
    p.tx(
      s,
      nm(s, 'FootR'),
      0.85,
      6.72,
      1.8,
      0.18,
      data.footerR ?? 'END · 14 / 14 · 2026',
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
    fn(s, slide.data ?? {})
  })

  return { patch: { schemaVersion: 1, ops: p.ops }, warnings }
}

export { ACCENTS, C, FONT_CN, FONT_EN }
