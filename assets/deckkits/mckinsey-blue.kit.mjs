// mckinsey-blue.kit.mjs — white + McKinsey-blue consulting DeckKit
// version: 0.1.0
import {
  contrastRatio,
  createOps,
  grid,
  nm,
  normalizeHex,
  SLIDE_W,
} from './core-primitives.kit.mjs'

// Palette extracted from the local McKinsey-style loyalty reference deck.
const C = {
  navy: '0C2744',
  deep: '18345E',
  primary: '005587',
  blue: '0076A8',
  sky: '38BDF8',
  teal: '0E7490',
  red: 'B91C1C',
  redBright: 'DC2626',
  amber: 'F59E0B',
  amberText: '92400E',
  amberBright: 'F59E0B',
  green: '047857',
  greenBright: '059669',
  slate: '475569',
  muted: '475569',
  line: 'CBD5E1',
  grid: 'E2E8F0',
  pageBg: 'FFFFFF',
  surface: 'F8FAFC',
  surface2: 'F1F5F9',
  blueTint: 'EFF6FF',
  redTint: 'FEF2F2',
  amberTint: 'FFFBEB',
  greenTint: 'F0FDF4',
  text: '0F172A',
  text2: '334155',
  white: 'FFFFFF',
}

const ACCENTS = [C.red, C.amber, C.blue, C.teal, C.slate]
const LEGACY_TONES = new Map([
  ['DC2626', C.redBright],
  ['F59E0B', C.amber],
  ['059669', C.greenBright],
  ['4A90A4', C.teal],
  ['64748B', C.slate],
  ['94A3B8', C.muted],
])
const FONT_EN = 'Arial'
const FONT_CN = 'Arial'
const MX = 0.45
const CW = SLIDE_W - MX * 2
const CARD_SHADOW = {
  color: '000000',
  alpha: 0.11,
  blur: '12pt',
  distance: '3.75pt',
  angle: 180,
}

const asLines = (value) => (Array.isArray(value) ? value.join('\n') : value)
const pct = (value) => Number(String(value).replace('%', ''))
const tone = (value) => LEGACY_TONES.get(normalizeHex(value) ?? '') ?? value
const accentText = (value) => {
  const color = tone(value)
  if (color === C.amber || color === C.amberBright) return C.amberText
  if (color === C.green || color === C.greenBright) return '065F46'
  if (color === C.red || color === C.redBright) return '991B1B'
  return readableInk(color)
}
const readableInk = (value, background = C.white) => {
  const color = tone(value)
  return contrastRatio(color, background) >= 4.5 ? color : C.slate
}
const displayInk = (value, background = C.white) => {
  const color = tone(value)
  if (color === C.amber || color === C.amberBright) return C.amberBright
  if (color === C.green || color === C.greenBright) return C.greenBright
  if (color === C.redBright) return C.redBright
  return readableInk(color, background)
}
const textOnTone = (value) => {
  const background = tone(value)
  return contrastRatio(C.white, background) >= 4.5 ? C.white : C.text
}

function createMckOps() {
  const builders = createOps({
    textbox: {
      marginLeft: '0.02in',
      marginRight: '0.02in',
      marginTop: '0in',
      marginBottom: '0in',
    },
  })
  const applyRunFont = (slide, name, font, paragraph = 0, run = 0) =>
    builders.ops.push({
      op: 'set-run',
      slide,
      shape: { name },
      paragraph,
      run,
      font,
    })
  const applyAlign = (slide, name, alignment, paragraph = 0) =>
    builders.ops.push({
      op: 'set-paragraph-format',
      slide,
      shape: { name },
      paragraph,
      alignment,
    })
  const applyCardShadow = (slide, name) =>
    builders.ops.push({
      op: 'set-shape-effect',
      slide,
      shape: { name },
      effect: { shadow: { ...CARD_SHADOW } },
    })
  return {
    ...builders,
    tx(slide, name, x, y, w, h, text, font, align) {
      builders.textbox(slide, name, x, y, w, h)
      builders.setText(slide, name, text)
      const paragraphCount = String(text).split(/\r\n|\r|\n/).length
      for (let p = 0; p < paragraphCount; p += 1) applyRunFont(slide, name, font, p)
      if (align) for (let p = 0; p < paragraphCount; p += 1) applyAlign(slide, name, align, p)
      return name
    },
    fillText(slide, name, text, font, align) {
      builders.setText(slide, name, text)
      const paragraphCount = String(text).split(/\r\n|\r|\n/).length
      for (let p = 0; p < paragraphCount; p += 1) applyRunFont(slide, name, font, p)
      if (align) for (let p = 0; p < paragraphCount; p += 1) applyAlign(slide, name, align, p)
    },
    rotate(slide, name, degrees) {
      builders.ops.push({ op: 'set-shape-rotation', slide, shape: { name }, degrees })
    },
    applyCardShadow,
    cardPanel(slide, name, x, y, w, h, fill = C.white) {
      builders.box(slide, name, 'rectangle', x, y, w, h, fill)
      applyCardShadow(slide, name)
      return name
    },
  }
}

function makeChrome({ tx, box, fillText }) {
  const topRule = (s, color = C.blue) =>
    box(s, nm(s, 'TopRule'), 'rectangle', 0, 0, SLIDE_W, 0.04, color)

  const header = (s, title, subtitle) => {
    topRule(s)
    tx(s, nm(s, 'Title'), MX, 0.16, CW, 0.42, title, {
      name: FONT_EN,
      size: '14pt',
      bold: true,
      color: C.text,
    })
    box(s, nm(s, 'SubtitleBar'), 'rectangle', MX, 0.58, CW, 0.46, C.deep)
    box(s, nm(s, 'SubtitleAccent'), 'rectangle', MX, 0.58, 0.05, 0.46, C.sky)
    tx(s, nm(s, 'Subtitle'), MX + 0.18, 0.75, CW - 0.36, 0.22, subtitle, {
      name: FONT_EN,
      size: '8pt',
      bold: true,
      color: C.white,
    })
    return 1.18
  }

  const footer = (s, total, source) => {
    box(s, nm(s, 'FooterBg'), 'rectangle', 0, 7.23, SLIDE_W, 0.27, C.surface)
    box(s, nm(s, 'FootLine'), 'rectangle', 0, 7.23, SLIDE_W, 0.012, C.grid)
    tx(s, nm(s, 'Source'), MX, 7.32, 4.8, 0.17, source ?? '', {
      name: FONT_EN,
      size: '6.6pt',
      color: C.muted,
    })
    tx(
      s,
      nm(s, 'Confidential'),
      4.95,
      7.32,
      3.9,
      0.17,
      'STRICTLY CONFIDENTIAL | NOT FOR DISTRIBUTION',
      { name: FONT_EN, size: '6.6pt', color: C.muted },
      'center',
    )
    tx(
      s,
      nm(s, 'PageNum'),
      12.45,
      7.32,
      0.45,
      0.17,
      String(s + 1),
      { name: FONT_EN, size: '6.6pt', color: C.muted },
      'right',
    )
  }

  const sectionLabel = (s, name, x, y, w, label, color = C.muted) => {
    const accent = tone(color)
    tx(s, name, x, y, w, 0.15, label, {
      name: FONT_EN,
      size: '6.8pt',
      bold: true,
      color: readableInk(accent),
    })
  }

  const noteBox = (s, base, x, y, w, h, title, body, color = C.blue, bg = C.blueTint) => {
    const accent = tone(color)
    box(s, nm(s, `${base}Bg`), 'rectangle', x, y, w, h, bg)
    box(s, nm(s, `${base}Rule`), 'rectangle', x, y, 0.04, h, accent)
    tx(s, nm(s, `${base}T`), x + 0.18, y + 0.12, w - 0.3, 0.18, title, {
      name: FONT_EN,
      size: '8.6pt',
      bold: true,
      color: readableInk(accent, bg),
    })
    tx(s, nm(s, `${base}B`), x + 0.18, y + 0.35, w - 0.3, h - 0.4, asLines(body), {
      name: FONT_EN,
      size: '8.2pt',
      color: C.text2,
    })
  }

  const cardCaption = (s, name, x, y, w, text, color = C.muted) => {
    fillText(
      s,
      name,
      text,
      { name: FONT_EN, size: '7.5pt', bold: true, color: readableInk(color) },
      'center',
    )
    box(s, `${name}Line`, 'rectangle', x, y + 0.26, w, 0.01, C.grid)
  }

  return { topRule, header, footer, sectionLabel, noteBox, cardCaption }
}

function makeComponents({ tx, box, card, icon, fillText, setLine, rotate, cardPanel }) {
  const metricCard = (s, base, x, y, w, h, item) => {
    const accent = tone(item.accent ?? C.blue)
    box(s, nm(s, `${base}Bg`), 'rectangle', x, y, w, h, item.bg ?? C.surface)
    box(s, nm(s, `${base}Top`), 'rectangle', x, y, w, 0.06, accent)
    box(s, nm(s, `${base}Side`), 'rectangle', x, y, 0.035, h, accent)
    tx(s, nm(s, `${base}Lab`), x + 0.18, y + 0.19, w - 0.36, 0.16, item.label, {
      name: FONT_EN,
      size: '7.5pt',
      bold: true,
      color: C.slate,
    })
    tx(s, nm(s, `${base}Val`), x + 0.14, y + 0.39, w - 0.3, 0.58, item.value, {
      name: FONT_EN,
      size: item.value.length > 3 ? '27pt' : '30pt',
      bold: true,
      color: displayInk(accent, item.bg ?? C.surface),
    })
    if (item.sub) {
      tx(s, nm(s, `${base}Sub`), x + 0.18, y + 1.02, w - 0.36, 0.2, item.sub, {
        name: FONT_EN,
        size: '7.5pt',
        color: C.slate,
      })
    }
    if (item.note) {
      tx(s, nm(s, `${base}Note`), x + 0.18, y + 1.26, w - 0.36, 0.2, item.note, {
        name: FONT_EN,
        size: '7.2pt',
        bold: true,
        color: accentText(accent),
      })
    }
  }

  const compactMetricCard = (s, base, x, y, w, h, item) => {
    const accent = tone(item.accent ?? C.blue)
    const bg = item.bg ?? C.surface
    box(s, nm(s, `${base}Bg`), 'rectangle', x, y, w, h, bg)
    box(s, nm(s, `${base}Side`), 'rectangle', x, y, 0.05, h, accent)
    tx(s, nm(s, `${base}Lab`), x + 0.28, y + 0.29, w - 0.56, 0.18, item.label, {
      name: FONT_EN,
      size: '7.5pt',
      color: C.muted,
    })
    tx(s, nm(s, `${base}Val`), x + 0.24, y + 0.46, Math.min(1.28, w - 0.6), 0.48, item.value, {
      name: FONT_EN,
      size: item.value.length > 3 ? '27pt' : '30pt',
      bold: true,
      color: displayInk(accent, bg),
    })
    if (item.sub) {
      tx(s, nm(s, `${base}Sub`), x + Math.min(1.72, w - 2.05), y + 0.75, 1.4, 0.18, item.sub, {
        name: FONT_EN,
        size: '7.5pt',
        color: C.muted,
      })
    }
    if (item.note) {
      tx(s, nm(s, `${base}Note`), x + 0.28, y + 0.94, w - 0.5, 0.16, item.note, {
        name: FONT_EN,
        size: '7.2pt',
        bold: true,
        color: accentText(accent),
      })
    }
  }

  const hBar = (s, base, x, y, w, h, value, max, color, label, sub, valueLabel) => {
    const accent = tone(color)
    tx(s, nm(s, `${base}Label`), x, y - 0.04, 1.9, 0.18, label, {
      name: FONT_EN,
      size: '8.2pt',
      bold: true,
      color: C.text,
    })
    if (sub) {
      tx(s, nm(s, `${base}Sub`), x, y + 0.15, 1.9, 0.16, sub, {
        name: FONT_EN,
        size: '6.9pt',
        color: C.slate,
      })
    }
    box(s, nm(s, `${base}Track`), 'rectangle', x + 2.05, y, w, h, C.surface2)
    const fillW = Math.max(0.05, (w * value) / max)
    box(s, nm(s, `${base}Bar`), 'rectangle', x + 2.05, y, fillW, h, accent)
    const valueW = 0.68
    const valueX = x + 2.05 + Math.max(0, Math.min(fillW - valueW - 0.08, w - valueW - 0.08))
    tx(
      s,
      nm(s, `${base}Val`),
      valueX,
      y + 0.08,
      valueW,
      0.18,
      valueLabel ?? `${value}%`,
      { name: FONT_EN, size: '8pt', bold: true, color: textOnTone(accent) },
      'right',
    )
  }

  const miniBar = (s, base, x, y, w, label, value, note, color = C.primary) => {
    const accent = tone(color)
    tx(s, nm(s, `${base}L`), x, y, 1.35, 0.17, label, {
      name: FONT_EN,
      size: '8pt',
      bold: true,
      color: C.text,
    })
    box(s, nm(s, `${base}Track`), 'rectangle', x + 1.5, y + 0.02, w - 2.7, 0.18, C.surface2)
    box(
      s,
      nm(s, `${base}Fill`),
      'rectangle',
      x + 1.5,
      y + 0.02,
      (w - 2.7) * (pct(value) / 100),
      0.18,
      accent,
    )
    tx(
      s,
      nm(s, `${base}V`),
      x + w - 0.72,
      y,
      0.68,
      0.2,
      value,
      {
        name: FONT_EN,
        size: '8pt',
        bold: true,
        color: readableInk(accent),
      },
      'right',
    )
    if (note) {
      tx(s, nm(s, `${base}N`), x + 1.5, y + 0.26, w - 1.5, 0.14, note, {
        name: FONT_EN,
        size: '6.5pt',
        color: C.muted,
      })
    }
  }

  const pillarCard = (s, base, x, y, w, h, item, i) => {
    const accent = tone(item.accent ?? ACCENTS[i % ACCENTS.length])
    const topH = 0.64
    cardPanel(s, nm(s, `${base}Bg`), x, y, w, h)
    box(s, nm(s, `${base}Top`), 'rectangle', x, y, w, topH, accent)
    tx(
      s,
      nm(s, `${base}Idx`),
      x,
      y + 0.14,
      w,
      0.36,
      item.index,
      {
        name: FONT_EN,
        size: '20pt',
        bold: true,
        color: textOnTone(accent),
      },
      'center',
    )
    if (item.icon)
      icon(s, nm(s, `${base}Icon`), item.icon, x + w / 2 - 0.22, y + 0.92, 0.44, 0.44, {
        color: accent,
      })
    tx(
      s,
      nm(s, `${base}Title`),
      x + 0.18,
      y + 1.42,
      w - 0.36,
      0.42,
      asLines(item.title),
      {
        name: FONT_EN,
        size: '10pt',
        bold: true,
        color: C.text,
      },
      'center',
    )
    box(s, nm(s, `${base}Rule1`), 'rectangle', x + 0.16, y + 2.18, w - 0.32, 0.012, C.grid)
    tx(s, nm(s, `${base}Body`), x + 0.16, y + 2.36, w - 0.32, 0.82, asLines(item.body), {
      name: FONT_EN,
      size: '8.3pt',
      color: C.text2,
    })
    box(s, nm(s, `${base}Rule2`), 'rectangle', x + 0.16, y + 3.38, w - 0.32, 0.012, C.grid)
    tx(s, nm(s, `${base}OutLab`), x + 0.16, y + 3.56, w - 0.32, 0.14, 'BUSINESS OUTCOME:', {
      name: FONT_EN,
      size: '6.3pt',
      bold: true,
      color: C.muted,
    })
    tx(s, nm(s, `${base}Out`), x + 0.16, y + 3.8, w - 0.32, 0.34, asLines(item.outcome), {
      name: FONT_EN,
      size: '8pt',
      bold: true,
      color: C.primary,
    })
    box(s, nm(s, `${base}Rule3`), 'rectangle', x + 0.16, y + 4.36, w - 0.32, 0.012, C.grid)
    tx(s, nm(s, `${base}KpiLab`), x + 0.16, y + 4.56, w - 0.32, 0.14, 'KPI TARGET', {
      name: FONT_EN,
      size: '6.3pt',
      bold: true,
      color: C.muted,
    })
    const kpiLines = String(item.kpi ?? '').split(/\r?\n/)
    tx(s, nm(s, `${base}Kpi`), x + 0.16, y + 5.02, w - 0.32, 0.34, kpiLines[0] ?? '', {
      name: FONT_EN,
      size: '20pt',
      bold: true,
      color: displayInk(item.kpiColor ?? C.amber),
    })
    const kpiRest = kpiLines.slice(1).join('\n')
    if (kpiRest != '') {
      tx(s, nm(s, `${base}KpiSub`), x + 0.16, y + 5.42, w - 0.32, 0.24, kpiRest, {
        name: FONT_EN,
        size: '7.8pt',
        color: C.text2,
      })
    }
    tx(
      s,
      nm(s, `${base}Time`),
      x + 0.16,
      y + 5.74,
      w - 0.32,
      0.14,
      item.time ?? 'within 12 months',
      {
        name: FONT_EN,
        size: '6.5pt',
        color: C.slate,
      },
    )
  }

  const smallInfo = (s, base, x, y, w, h, title, lines, color = C.blue) => {
    const accent = tone(color)
    const bg =
      accent === C.amber || accent === C.amberBright
        ? C.amberTint
        : accent === C.green || accent === C.greenBright
          ? C.greenTint
          : accent === C.primary || accent === C.blue
            ? C.blueTint
            : C.surface
    box(s, nm(s, `${base}Bg`), 'rectangle', x, y, w, h, bg)
    box(s, nm(s, `${base}Rule`), 'rectangle', x, y, 0.05, h, accent)
    tx(s, nm(s, `${base}Title`), x + 0.2, y + 0.14, w - 0.36, 0.17, title, {
      name: FONT_EN,
      size: '7.5pt',
      bold: true,
      color: accentText(accent),
    })
    tx(s, nm(s, `${base}Text`), x + 0.2, y + 0.33, w - 0.36, h - 0.36, asLines(lines), {
      name: FONT_EN,
      size: '7.3pt',
      color: C.text2,
    })
  }

  const dashedHArrow = (s, base, x1, y, x2, color = C.redBright) => {
    const dashW = 0.045
    const gap = 0.045
    const h = 0.012
    let x = x1 + 0.12
    let i = 0
    while (x + dashW < x2 - 0.12) {
      box(s, nm(s, `${base}Dash${i}`), 'rectangle', x, y, dashW, h, color)
      x += dashW + gap
      i += 1
    }
    const headW = 0.08
    const headH = 0.09
    const left = nm(s, `${base}Left`)
    const right = nm(s, `${base}Right`)
    box(s, left, 'triangle', x1 - headW / 2, y - headH / 2 + h / 2, headW, headH, color)
    rotate(s, left, 270)
    box(s, right, 'triangle', x2 - headW / 2, y - headH / 2 + h / 2, headW, headH, color)
    rotate(s, right, 90)
  }

  const dashedVLine = (s, base, x, y1, y2, color = C.grid) => {
    const dashH = 0.12
    const gap = 0.08
    let y = y1
    let i = 0
    while (y + dashH < y2) {
      box(s, nm(s, `${base}${i}`), 'rectangle', x, y, 0.01, dashH, color)
      y += dashH + gap
      i += 1
    }
  }

  return {
    metricCard,
    compactMetricCard,
    hBar,
    miniBar,
    pillarCard,
    smallInfo,
    dashedHArrow,
    dashedVLine,
    card,
    tx,
    box,
    icon,
    fillText,
  }
}

function makePageTypes(builders, chrome, components, total) {
  const { ops, tx, box, icon, addSlide, setLine, cardPanel } = builders
  const { header, footer, sectionLabel, noteBox } = chrome
  const {
    metricCard,
    compactMetricCard,
    hBar,
    miniBar,
    pillarCard,
    smallInfo,
    dashedHArrow,
    dashedVLine,
  } = components

  function mckCoverSlide(s, data) {
    addSlide(s)
    box(s, nm(s, 'HeroBg'), 'rectangle', 0, 0, SLIDE_W, 3.04, C.primary)
    ops.push({
      op: 'set-shape-fill',
      slide: s,
      shape: { name: nm(s, 'HeroBg') },
      fill: {
        type: 'gradient',
        angle: 0,
        stops: [
          { pos: 0, color: '001B35' },
          { pos: 0.55, color: '00387A' },
          { pos: 1, color: '0063A8' },
        ],
      },
    })
    box(s, nm(s, 'HeroCut'), 'right-triangle', 0, 2.625, SLIDE_W, 0.417, C.white)
    ops.push({
      op: 'set-shape-flip',
      slide: s,
      shape: { name: nm(s, 'HeroCut') },
      horizontal: true,
    })
    ;[
      [8.48, 0.0, 4.74, 0.022],
      [9.26, 0.48, 3.16, 0.028],
      [9.94, 0.98, 1.78, 0.038],
      [10.42, 1.42, 0.74, 0.05],
    ].forEach(([x, y, d, alpha], i) => {
      box(s, nm(s, `Ring${i}`), 'oval', x, y, d, d, C.white)
      ops.push({
        op: 'set-shape-fill',
        slide: s,
        shape: { name: nm(s, `Ring${i}`) },
        fill: { type: 'solid', color: C.white, alpha },
      })
    })
    ;[
      [0.82, 2.64, 0.11],
      [1.1, 2.64, 0.11],
      [1.38, 2.64, 0.11],
      [0.82, 2.4, 0.07],
      [1.1, 2.4, 0.07],
      [1.38, 2.4, 0.07],
    ].forEach(([x, y, alpha], i) => {
      box(s, nm(s, `HeroDot${i}`), 'oval', x, y, 0.045, 0.045, C.white)
      ops.push({
        op: 'set-shape-fill',
        slide: s,
        shape: { name: nm(s, `HeroDot${i}`) },
        fill: { type: 'solid', color: C.white, alpha },
      })
    })
    tx(s, nm(s, 'Eyebrow'), 0.82, 0.44, 3.9, 0.18, data.eyebrow, {
      name: FONT_EN,
      size: '8.25pt',
      color: C.white,
    })
    box(s, nm(s, 'EyebrowRule'), 'rectangle', 0.83, 0.66, 4.95, 0.012, C.white)
    ops.push({
      op: 'set-shape-fill',
      slide: s,
      shape: { name: nm(s, 'EyebrowRule') },
      fill: { type: 'solid', color: C.white, alpha: 0.2 },
    })
    tx(s, nm(s, 'Title1'), 0.78, 1.1, 5.85, 0.58, data.title[0], {
      name: FONT_EN,
      size: '34.5pt',
      bold: true,
      color: C.white,
    })
    tx(s, nm(s, 'Title2'), 0.78, 1.72, 5.85, 0.58, data.title[1], {
      name: FONT_EN,
      size: '34.5pt',
      bold: true,
      color: C.white,
    })
    box(s, nm(s, 'Accent'), 'rectangle', 0.83, 2.34, 0.56, 0.035, C.sky)
    tx(s, nm(s, 'Subtitle'), 0.82, 2.43, 7.1, 0.24, data.subtitle, {
      name: FONT_EN,
      size: '9pt',
      color: C.white,
    })

    sectionLabel(s, nm(s, 'ProjectLabel'), 0.82, 3.55, 2.0, 'PROJECT DETAILS')
    box(s, nm(s, 'ProjectLine'), 'rectangle', 0.83, 3.76, 5.6, 0.012, C.line)
    box(s, nm(s, 'ProjectRule'), 'rectangle', 0.83, 3.92, 0.04, 1.18, C.primary)
    ;(data.details ?? []).forEach(([label, value], i) => {
      const y = 4.05 + i * 0.29
      tx(s, nm(s, `DtlL${i}`), 1.02, y, 0.85, 0.16, label, {
        name: FONT_EN,
        size: '7.4pt',
        bold: true,
        color: C.text,
      })
      tx(s, nm(s, `DtlV${i}`), 2.02, y, 4.5, 0.16, value, {
        name: FONT_EN,
        size: '7.2pt',
        color: C.text2,
      })
    })

    metricCard(s, 'CoverM0', 7.86, 3.42, 2.36, 2.42, {
      label: data.primaryMetric.label,
      value: data.primaryMetric.value,
      sub: data.primaryMetric.sub,
      note: data.primaryMetric.note,
      accent: C.red,
      bg: C.white,
    })
    box(s, nm(s, 'CoverM0Sep'), 'rectangle', 8.13, 4.94, 1.95, 0.012, C.grid)
    tx(s, nm(s, 'CoverM0Extra'), 8.12, 5.28, 1.85, 0.16, data.primaryMetric.extra, {
      name: FONT_EN,
      size: '7.2pt',
      bold: true,
      color: C.blue,
    })
    metricCard(s, 'CoverM1', 10.42, 3.42, 2.36, 2.42, {
      label: data.lossMetric.label,
      value: data.lossMetric.value,
      sub: data.lossMetric.sub,
      note: '',
      accent: C.amber,
      bg: C.white,
    })
    tx(s, nm(s, 'CoverM1Sub2'), 10.68, 4.84, 1.8, 0.3, data.lossMetric.value2, {
      name: FONT_EN,
      size: '20pt',
      bold: true,
      color: C.amber,
    })
    tx(s, nm(s, 'CoverM1Sub3'), 10.7, 5.16, 1.8, 0.14, data.lossMetric.sub2, {
      name: FONT_EN,
      size: '7.2pt',
      color: C.text2,
    })
    tx(s, nm(s, 'CoverM1Note2'), 10.7, 5.44, 1.9, 0.16, data.lossMetric.note, {
      name: FONT_EN,
      size: '7.2pt',
      bold: true,
      color: C.amberText,
    })
    footer(s, total, data.source)
  }

  function mckCrisisSnapshotSlide(s, data) {
    addSlide(s)
    header(s, data.title, data.subtitle)
    const cards = data.metrics ?? []
    const metricLayout =
      cards.length === 3
        ? [
            { x: MX, w: 3.85 },
            { x: 4.48, w: 3.85 },
            { x: 8.54, w: 4.38 },
          ]
        : grid(Math.max(cards.length, 1), 0.22, MX, CW)
    cards.forEach((item, i) => {
      const cell = metricLayout[i]
      compactMetricCard(s, `Metric${i}`, cell.x, 1.38, cell.w, 1.15, {
        ...item,
        bg: item.bg ?? [C.redTint, C.amberTint, C.redTint][i],
      })
    })
    sectionLabel(s, nm(s, 'FateLabel'), MX, 2.72, 4.4, data.cohortTitle)
    const x = MX
    const y = 2.92
    const w = CW
    const h = 0.54
    let cursor = x
    ;(data.cohort ?? []).forEach((item, i) => {
      const color = tone(item.color)
      const segW = w * (item.value / 100)
      box(s, nm(s, `Cohort${i}`), 'rectangle', cursor, y, segW, h, color)
      tx(
        s,
        nm(s, `CohortVal${i}`),
        cursor,
        y + 0.16,
        segW,
        0.16,
        String(item.value),
        {
          name: FONT_EN,
          size: '8.8pt',
          bold: true,
          color: textOnTone(color),
        },
        'center',
      )
      tx(
        s,
        nm(s, `CohortLab${i}`),
        cursor,
        y + 0.8,
        segW,
        0.14,
        item.label,
        {
          name: FONT_EN,
          size: '7pt',
          bold: true,
          color: readableInk(color),
        },
        'center',
      )
      if (item.note) {
        tx(
          s,
          nm(s, `CohortNote${i}`),
          cursor,
          y + 0.98,
          segW,
          0.14,
          item.note,
          {
            name: FONT_EN,
            size: '6.5pt',
            color: readableInk(color),
          },
          'center',
        )
      }
      cursor += segW
    })
    ;[15, 67, 93].forEach((value, i) => {
      const sepX = x + (CW * value) / 100
      box(s, nm(s, `CohortSep${i}`), 'rectangle', sepX, y - 0.04, 0.01, h + 0.08, C.white)
    })
    dashedHArrow(s, 'CohortArrow', 2.29, 4.22, 12.04, C.redBright)
    tx(
      s,
      nm(s, 'CohortSum'),
      5.65,
      4.1,
      4.1,
      0.16,
      data.cohortSum,
      {
        name: FONT_EN,
        size: '7.4pt',
        bold: true,
        color: C.redBright,
      },
      'center',
    )
    noteBox(
      s,
      'Imp',
      MX,
      4.42,
      CW,
      0.85,
      data.implication.title,
      data.implication.body,
      C.blue,
      C.blueTint,
    )
    const infoGap = 0.31
    const infoW = (CW - infoGap) / 2
    smallInfo(s, 'Gap', MX, 5.48, infoW, 0.63, data.gap.title, data.gap.body, C.amber)
    smallInfo(
      s,
      'Lever',
      MX + infoW + infoGap,
      5.48,
      infoW,
      0.63,
      data.lever.title,
      data.lever.body,
      C.greenBright,
    )
    footer(s, total, data.source)
  }

  function mckDemographicProfileSlide(s, data) {
    addSlide(s)
    header(s, data.title, data.subtitle)
    const leftW = 5.95
    const rightX = 6.82
    sectionLabel(s, nm(s, 'AgeLabel'), MX, 1.28, 2.4, 'AGE DISTRIBUTION')
    ;(data.age ?? []).forEach(([label, value, note], i) =>
      miniBar(
        s,
        `Age${i}`,
        MX + 0.42,
        1.58 + i * 0.38,
        leftW - 0.5,
        label,
        value,
        note,
        i === 0 ? C.blue : C.teal,
      ),
    )
    noteBox(
      s,
      'AgeNote',
      MX,
      3.05,
      leftW,
      0.82,
      data.ageNote.title,
      data.ageNote.body,
      C.blue,
      C.blueTint,
    )
    sectionLabel(s, nm(s, 'OccLabel'), MX, 4.04, 2.4, 'OCCUPATION')
    ;(data.occupation ?? []).forEach(([label, value], i) =>
      miniBar(
        s,
        `Occ${i}`,
        MX + 0.42,
        4.36 + i * 0.32,
        leftW - 0.5,
        label,
        value,
        '',
        i === 0 ? C.primary : C.teal,
      ),
    )
    tx(s, nm(s, 'OccNote'), MX, 5.78, leftW, 0.18, data.occupationNote, {
      name: FONT_EN,
      size: '7.5pt',
      color: C.slate,
    })

    sectionLabel(s, nm(s, 'IncomeLabel'), rightX, 1.28, 2.6, 'INCOME DISTRIBUTION')
    ;(data.income ?? []).forEach(([label, value, note], i) =>
      miniBar(
        s,
        `Inc${i}`,
        rightX + 0.42,
        1.58 + i * 0.34,
        5.7,
        label,
        value,
        note,
        i === 0 ? C.blue : C.teal,
      ),
    )
    noteBox(
      s,
      'IncomeNote',
      rightX,
      2.8,
      6.1,
      0.9,
      data.incomeNote.title,
      data.incomeNote.body,
      C.blue,
      C.blueTint,
    )
    sectionLabel(
      s,
      nm(s, 'InterestLabel'),
      rightX,
      4.04,
      4.8,
      'TOP CUSTOMER INTERESTS & PROGRAMME ALIGNMENT',
    )
    box(s, nm(s, 'InterestBg'), 'rectangle', rightX, 4.28, 6.1, 1.78, C.surface)
    tx(s, nm(s, 'InterestRank'), rightX + 0.18, 4.45, 2.8, 0.14, 'RANKED BY CUSTOMER IMPORTANCE', {
      name: FONT_EN,
      size: '6.5pt',
      bold: true,
      color: C.muted,
    })
    const rankBoxSize = 0.22
    const rankTextH = 0.15
    const rankTextYOffset = (rankBoxSize - rankTextH) / 2 + 0.005
    ;(data.interests ?? []).forEach(([rank, interest, angle], i) => {
      const y = 4.66 + i * 0.28
      box(s, nm(s, `Rank${i}`), 'rectangle', rightX + 0.18, y, rankBoxSize, rankBoxSize, C.primary)
      tx(
        s,
        nm(s, `RankT${i}`),
        rightX + 0.14,
        y + rankTextYOffset,
        0.3,
        rankTextH,
        String(rank),
        {
          name: FONT_EN,
          size: '7pt',
          bold: true,
          color: C.white,
        },
        'center',
      )
      tx(s, nm(s, `Interest${i}`), rightX + 0.58, y + 0.03, 1.7, 0.14, interest, {
        name: FONT_EN,
        size: '7.5pt',
        bold: true,
        color: C.text,
      })
      tx(s, nm(s, `Angle${i}`), rightX + 2.55, y + 0.03, 3.3, 0.14, `→ ${angle}`, {
        name: FONT_EN,
        size: '7.1pt',
        color: C.teal,
      })
    })
    tx(s, nm(s, 'InterestNote'), rightX + 0.18, 6.08, 5.7, 0.14, data.interestNote, {
      name: FONT_EN,
      size: '6.8pt',
      color: C.slate,
    })
    footer(s, total, data.source)
  }

  function mckPriorityMatrixSlide(s, data) {
    addSlide(s)
    header(s, data.title, data.subtitle)
    const mx = 1.85
    const my = 1.35
    const mw = 7.1
    const mh = 4.75
    box(s, nm(s, 'QBg'), 'rectangle', mx, my, mw, mh, C.white)
    box(s, nm(s, 'QTopLeft'), 'rectangle', mx, my, mw / 2, mh / 2, C.surface)
    box(s, nm(s, 'QTopRight'), 'rectangle', mx + mw / 2, my, mw / 2, mh / 2, C.greenTint)
    box(s, nm(s, 'QBottomRight'), 'rectangle', mx + mw / 2, my + mh / 2, mw / 2, mh / 2, C.redTint)
    box(s, nm(s, 'QBottomLeft'), 'rectangle', mx, my + mh / 2, mw / 2, mh / 2, C.surface)
    box(s, nm(s, 'QMidV'), 'rectangle', mx + mw / 2, my, 0.012, mh, C.line)
    box(s, nm(s, 'QMidH'), 'rectangle', mx, my + mh / 2, mw, 0.012, C.line)
    tx(
      s,
      nm(s, 'Maintain'),
      mx + 0.5,
      my + 0.14,
      1.1,
      0.14,
      'MAINTAIN',
      { name: FONT_EN, size: '6pt', color: C.muted },
      'center',
    )
    tx(
      s,
      nm(s, 'Protect'),
      mx + 4.45,
      my + 0.14,
      1.1,
      0.14,
      'PROTECT ✔',
      { name: FONT_EN, size: '6pt', bold: true, color: C.green },
      'center',
    )
    tx(
      s,
      nm(s, 'Deprior'),
      mx + 0.35,
      my + mh - 0.32,
      1.45,
      0.14,
      'DE-PRIORITISE',
      { name: FONT_EN, size: '6pt', color: C.muted },
      'center',
    )
    tx(
      s,
      nm(s, 'Invest'),
      mx + 4.4,
      my + mh - 0.32,
      1.65,
      0.14,
      'INVEST / FIX ⚠',
      { name: FONT_EN, size: '6pt', bold: true, color: C.red },
      'center',
    )
    tx(
      s,
      nm(s, 'AxisX'),
      mx + 1.75,
      my + mh + 0.28,
      3.5,
      0.14,
      '← Lower Priority  CUSTOMER PRIORITY  Higher Priority →',
      { name: FONT_EN, size: '6.4pt', color: C.slate },
      'center',
    )
    tx(
      s,
      nm(s, 'AxisY'),
      mx - 0.75,
      my + 2.0,
      0.5,
      0.5,
      'Worse ↓\nPERFORMANCE\n↑ Better',
      { name: FONT_EN, size: '6.4pt', color: C.slate },
      'center',
    )
    ;(data.bubbles ?? []).forEach((b, i) => {
      const x = mx + b.x * mw
      const y = my + b.y * mh
      const d = b.size ?? 0.48
      box(s, nm(s, `Bubble${i}`), 'oval', x - d / 2, y - d / 2, d, d, tone(b.color))
      tx(
        s,
        nm(s, `BubbleText${i}`),
        x - d / 2 + 0.04,
        y - 0.15,
        d - 0.08,
        0.36,
        asLines(b.label),
        {
          name: FONT_EN,
          size: b.size > 0.62 ? '6.4pt' : '5.8pt',
          bold: true,
          color: textOnTone(b.color),
        },
        'center',
      )
    })
    box(s, nm(s, 'CalloutLine'), 'rectangle', mx + 5.35, my + 3.68, 1.48, 0.012, C.red)
    const legendX = 9.38
    sectionLabel(
      s,
      nm(s, 'LegendLabel'),
      legendX,
      1.35,
      3.3,
      'LEGEND — BUBBLE SIZE = RELATIVE PRIORITY',
    )
    ;(data.legend ?? []).forEach(([color, label], i) => {
      const y = 1.68 + i * 0.32
      box(s, nm(s, `LegDot${i}`), 'oval', legendX, y, 0.18, 0.18, tone(color))
      tx(s, nm(s, `LegText${i}`), legendX + 0.28, y + 0.02, 3.2, 0.14, label, {
        name: FONT_EN,
        size: '7pt',
        color: C.text2,
      })
    })
    box(s, nm(s, 'FindingBg'), 'rectangle', legendX, 3.45, 3.55, 2.24, C.redTint)
    box(s, nm(s, 'FindingRule'), 'rectangle', legendX, 3.45, 0.04, 2.24, C.red)
    tx(s, nm(s, 'FindingLab'), legendX + 0.18, 3.65, 2.5, 0.14, data.finding.label, {
      name: FONT_EN,
      size: '6.4pt',
      bold: true,
      color: C.red,
    })
    tx(s, nm(s, 'FindingT'), legendX + 0.18, 3.9, 2.5, 0.2, data.finding.title, {
      name: FONT_EN,
      size: '9pt',
      bold: true,
      color: C.text,
    })
    tx(s, nm(s, 'FindingRank'), legendX + 0.18, 4.28, 2.6, 0.3, asLines(data.finding.rank), {
      name: FONT_EN,
      size: '7.5pt',
      color: C.text2,
    })
    tx(s, nm(s, 'FindingVal'), legendX + 0.18, 4.72, 1.15, 0.46, data.finding.value, {
      name: FONT_EN,
      size: '24pt',
      bold: true,
      color: C.red,
    })
    tx(s, nm(s, 'FindingText'), legendX + 1.38, 4.78, 1.8, 0.42, asLines(data.finding.body), {
      name: FONT_EN,
      size: '7pt',
      color: C.text2,
    })
    tx(s, nm(s, 'FindingMust'), legendX + 0.18, 5.42, 2.0, 0.14, data.finding.must, {
      name: FONT_EN,
      size: '7.2pt',
      bold: true,
      color: C.green,
    })
    footer(s, total, data.source)
  }

  function mckLossDriverSlide(s, data) {
    addSlide(s)
    header(s, data.title, data.subtitle)
    sectionLabel(s, nm(s, 'BarLabel'), MX, 1.28, 6.8, data.chartTitle)
    const labelX = MX
    const labelW = 2.48
    const barX = 3.02
    const barW = 6.38
    const barH = 0.38
    const axisTop = 1.4
    const axisBottom = 5.79
    ;[
      [2.98, 'DriverGrid0', false],
      [4.61, 'DriverGrid25', true],
      [6.21, 'DriverGrid50', true],
      [7.8, 'DriverGrid75', true],
    ].forEach(([x, base, dashed]) => {
      if (dashed) dashedVLine(s, base, x, axisTop, axisBottom, C.grid)
      else box(s, nm(s, base), 'rectangle', x, axisTop, 0.01, axisBottom - axisTop, C.grid)
    })
    ;[
      [2.9, '0%'],
      [4.51, '25%'],
      [6.1, '50%'],
      [7.69, '75%'],
    ].forEach(([x, label], i) =>
      tx(s, nm(s, `AxisTick${i}`), x, 5.89, 0.28, 0.17, label, {
        name: FONT_EN,
        size: '6.6pt',
        color: C.muted,
      }),
    )
    const rowBarY = [1.49, 2.3, 3.24, 4.07, 4.91]
    ;(data.drivers ?? []).forEach((item, i) => {
      const color = tone(item.color)
      const y = rowBarY[i] ?? 1.49 + i * 0.82
      const labelBg = i === 0 ? C.redTint : i === 1 ? C.amberTint : null
      if (labelBg)
        box(s, nm(s, `DriverLabelBg${i}`), 'rectangle', labelX, y - 0.03, labelW, 0.71, labelBg)
      tx(
        s,
        nm(s, `Driver${i}Label`),
        labelX + 0.78,
        y + 0.08,
        labelW - 0.84,
        0.22,
        item.label,
        {
          name: FONT_EN,
          size: '8.6pt',
          bold: true,
          color: C.text,
        },
        'right',
      )
      tx(
        s,
        nm(s, `Driver${i}Sub`),
        labelX + 0.78,
        y + 0.31,
        labelW - 0.84,
        0.17,
        item.sub,
        {
          name: FONT_EN,
          size: '7pt',
          color: C.muted,
        },
        'right',
      )
      const track = i === 0 ? 'FEE2E2' : i === 1 ? 'FEF3C7' : i === 2 ? C.surface2 : C.surface2
      box(s, nm(s, `Driver${i}Track`), 'rectangle', barX, y, barW, barH, track)
      const fillW = Math.max(0.05, barW * (item.value / 100))
      box(s, nm(s, `Driver${i}Fill`), 'rectangle', barX, y, fillW, barH, color)
      const valueInside = i < 2
      tx(
        s,
        nm(s, `Driver${i}Val`),
        valueInside ? barX + Math.max(0.08, fillW - 0.48) : barX + fillW + 0.08,
        y + 0.1,
        0.38,
        0.18,
        `${item.value}%`,
        {
          name: FONT_EN,
          size: '8pt',
          bold: true,
          color: valueInside ? textOnTone(color) : C.slate,
        },
        'right',
      )
      if (item.tag) {
        const tagBg =
          item.tagBg ?? (color === C.redBright || color === C.red ? 'FECACA' : C.amberTint)
        const tagX = barX + fillW + 0.18
        box(s, nm(s, `DriverTag${i}`), 'rectangle', tagX, y + 0.06, 1.46, 0.25, tagBg)
        tx(s, nm(s, `DriverTagT${i}`), tagX + 0.07, y + 0.055, 1.26, 0.14, item.tag, {
          name: FONT_EN,
          size: '6pt',
          bold: true,
          color: accentText(item.tagColor ?? color),
        })
        tx(s, nm(s, `DriverAct${i}`), tagX + 0.07, y + 0.19, 1.35, 0.13, item.action, {
          name: FONT_EN,
          size: '6.4pt',
          color: accentText(color),
        })
      } else if (item.action) {
        tx(s, nm(s, `DriverAct${i}`), barX + fillW + 0.52, y + 0.1, 3.4, 0.14, item.action, {
          name: FONT_EN,
          size: '6.6pt',
          color: C.muted,
        })
      }
    })
    box(s, nm(s, 'ControllableBracketV'), 'rectangle', MX, 2.13, 0.015, 0.96, C.redBright)
    box(s, nm(s, 'ControllableBracketT'), 'rectangle', MX, 2.13, 0.13, 0.012, C.redBright)
    box(s, nm(s, 'ControllableBracketB'), 'rectangle', MX, 3.08, 0.13, 0.012, C.redBright)
    tx(s, nm(s, 'ControllablePct'), MX + 0.15, 2.51, 0.42, 0.14, '78%', {
      name: FONT_EN,
      size: '7pt',
      bold: true,
      color: C.redBright,
    })
    tx(s, nm(s, 'ControllableText'), MX + 0.15, 2.69, 0.58, 0.32, 'control-\nlable', {
      name: FONT_EN,
      size: '6.7pt',
      color: C.redBright,
    })
    box(s, nm(s, 'Summary'), 'rectangle', 9.65, 1.52, 2.95, 2.8, C.deep)
    tx(
      s,
      nm(s, 'SummaryLab'),
      9.98,
      1.82,
      2.3,
      0.16,
      data.summary.label,
      {
        name: FONT_EN,
        size: '7pt',
        color: C.line,
      },
      'center',
    )
    tx(
      s,
      nm(s, 'SummaryVal'),
      10.35,
      2.18,
      1.4,
      0.5,
      data.summary.value,
      {
        name: FONT_EN,
        size: '30pt',
        bold: true,
        color: C.amberBright,
      },
      'center',
    )
    tx(
      s,
      nm(s, 'SummaryText'),
      10.0,
      2.78,
      2.2,
      0.45,
      asLines(data.summary.text),
      {
        name: FONT_EN,
        size: '8.4pt',
        color: C.white,
      },
      'center',
    )
    box(s, nm(s, 'SummaryRule'), 'rectangle', 10.05, 3.38, 2.15, 0.012, C.teal)
    tx(
      s,
      nm(s, 'SummaryEq'),
      10.05,
      3.58,
      2.15,
      0.36,
      asLines(
        String(data.summary.eq ?? '')
          .split(/\r?\n/)
          .slice(0, 2),
      ),
      {
        name: FONT_EN,
        size: '7.5pt',
        color: C.line,
      },
      'center',
    )
    tx(
      s,
      nm(s, 'SummaryGreen'),
      10.05,
      4.02,
      2.15,
      0.24,
      asLines(
        String(data.summary.eq ?? '')
          .split(/\r?\n/)
          .slice(2),
      ),
      {
        name: FONT_EN,
        size: '7.2pt',
        bold: true,
        color: '4ADE80',
      },
      'center',
    )
    smallInfo(
      s,
      'Unctrl',
      9.65,
      4.52,
      2.95,
      1.0,
      data.uncontrollable.title,
      data.uncontrollable.body,
      C.primary,
    )
    noteBox(
      s,
      'Pareto',
      MX,
      6.12,
      8.98,
      0.66,
      data.pareto.title,
      data.pareto.body,
      C.primary,
      C.surface,
    )
    footer(s, total, data.source)
  }

  function mckPillarsSlide(s, data) {
    addSlide(s)
    header(s, data.title, data.subtitle)
    const cells = grid(4, 0.12, MX, CW)
    ;(data.pillars ?? []).forEach((item, i) =>
      pillarCard(s, `Pillar${i}`, cells[i].x, 1.22, cells[i].w, 5.86, item, i),
    )
    footer(s, total, data.source)
  }

  function mckInitiativeRankingSlide(s, data) {
    addSlide(s)
    header(s, data.title, data.subtitle)
    sectionLabel(s, nm(s, 'InitiativeLabel'), MX, 1.26, 7.6, data.sectionTitle)
    const cells = grid(5, 0.08, MX, CW)
    ;(data.initiatives ?? []).forEach((item, i) => {
      const { x, w } = cells[i]
      const accent = tone(item.accent ?? ACCENTS[i])
      const cardY = 1.36
      const cardH = 5.68
      cardPanel(s, nm(s, `Init${i}Bg`), x, cardY, w, cardH)
      box(s, nm(s, `Init${i}Top`), 'rectangle', x, cardY, w, 0.08, accent)
      tx(s, nm(s, `Init${i}Idx`), x + 0.12, 1.56, 0.38, 0.22, item.index, {
        name: FONT_EN,
        size: '13.5pt',
        bold: true,
        color: accentText(accent),
      })
      tx(
        s,
        nm(s, `Init${i}Tag`),
        x + 0.78,
        1.58,
        w - 0.9,
        0.12,
        item.tag,
        {
          name: FONT_EN,
          size: '6pt',
          bold: true,
          color: accentText(accent),
        },
        'right',
      )
      if (item.icon)
        icon(s, nm(s, `Init${i}Icon`), item.icon, x + w / 2 - 0.2, 1.94, 0.4, 0.4, {
          color: accent,
        })
      tx(
        s,
        nm(s, `Init${i}Title`),
        x + 0.18,
        2.54,
        w - 0.36,
        0.52,
        asLines(item.title),
        {
          name: FONT_EN,
          size: '10pt',
          bold: true,
          color: C.text,
        },
        'center',
      )
      box(s, nm(s, `Init${i}Rule1`), 'rectangle', x + 0.16, 3.2, w - 0.32, 0.012, C.grid)
      tx(s, nm(s, `Init${i}Body`), x + 0.16, 3.34, w - 0.32, 0.78, asLines(item.body), {
        name: FONT_EN,
        size: '7.6pt',
        color: C.text2,
      })
      const labels = [
        ['COST LEVEL', item.cost],
        ['STRATEGIC PILLARS', item.pillars],
        ['PROPOSED BY', item.owner],
      ]
      labels.forEach(([label, value], j) => {
        const y = 4.38 + j * 0.46
        tx(s, nm(s, `Init${i}Lab${j}`), x + 0.16, y, w - 0.32, 0.12, label, {
          name: FONT_EN,
          size: '6.1pt',
          bold: true,
          color: C.muted,
        })
        tx(s, nm(s, `Init${i}Val${j}`), x + 0.16, y + 0.16, w - 0.32, 0.16, value, {
          name: FONT_EN,
          size: '7.6pt',
          bold: true,
          color: j === 0 ? C.text : accentText(accent),
        })
      })
      box(s, nm(s, `Init${i}Rule2`), 'rectangle', x + 0.16, 5.9, w - 0.32, 0.012, C.grid)
      tx(s, nm(s, `Init${i}Foot`), x + 0.16, 6.1, w - 0.32, 0.44, asLines(item.footer), {
        name: FONT_EN,
        size: '7pt',
        color: C.text2,
      })
    })
    footer(s, total, data.source)
  }

  function mckRoadmapSlide(s, data) {
    addSlide(s)
    header(s, data.title, data.subtitle)
    const cells = grid(4, 0.08, MX, CW)
    ;(data.phases ?? []).forEach((phase, i) => {
      const { x, w } = cells[i]
      const accent = tone(phase.accent ?? [C.navy, C.primary, C.blue, C.teal][i])
      const phaseY = 1.22
      const phaseH = 1.94
      const phaseTopH = 0.52
      cardPanel(s, nm(s, `Phase${i}Bg`), x, phaseY, w, phaseH)
      box(s, nm(s, `Phase${i}Top`), 'rectangle', x, phaseY, w, phaseTopH, accent)
      tx(
        s,
        nm(s, `Phase${i}Title`),
        x + 0.05,
        1.38,
        w - 0.1,
        0.2,
        phase.title,
        {
          name: FONT_EN,
          size: '7.2pt',
          bold: true,
          color: textOnTone(accent),
        },
        'center',
      )
      tx(
        s,
        nm(s, `Phase${i}Sub`),
        x + 0.12,
        1.59,
        w - 0.24,
        0.14,
        phase.sub,
        {
          name: FONT_EN,
          size: '6.8pt',
          color: C.white,
        },
        'center',
      )
      ;(phase.items ?? []).forEach(([name, desc, iconName], j) => {
        const y = 1.92 + j * 0.45
        if (iconName)
          icon(s, nm(s, `Phase${i}Icon${j}`), iconName, x + 0.18, y - 0.01, 0.17, 0.17, {
            color: accent,
          })
        tx(s, nm(s, `Phase${i}Item${j}`), x + 0.45, y, w - 0.58, 0.14, name, {
          name: FONT_EN,
          size: '7.5pt',
          bold: true,
          color: C.text,
        })
        tx(s, nm(s, `Phase${i}Desc${j}`), x + 0.45, y + 0.16, w - 0.58, 0.12, desc, {
          name: FONT_EN,
          size: '6.5pt',
          color: C.slate,
        })
      })
      tx(s, nm(s, `Phase${i}Cost`), x + 0.12, 2.89, w - 0.24, 0.14, phase.cost, {
        name: FONT_EN,
        size: '6.5pt',
        color: C.slate,
      })
    })

    const axisY = 3.34
    box(s, nm(s, 'TimelineBase'), 'rectangle', MX, axisY, CW, 0.04, C.line)
    cells.forEach(({ x, w }, i) => {
      const cx = x + w / 2
      box(
        s,
        nm(s, `TimelineDot${i}`),
        'oval',
        cx - 0.06,
        axisY - 0.04,
        0.12,
        0.12,
        [C.navy, C.primary, C.blue, C.amber][i],
      )
    })
    tx(
      s,
      nm(s, 'End'),
      12.28,
      axisY - 0.04,
      0.64,
      0.16,
      'END',
      {
        name: FONT_EN,
        size: '6pt',
        color: C.blue,
      },
      'right',
    )

    const metrics = data.metrics ?? []
    const metricCells = grid(3, 0.18, MX, CW)
    metrics.forEach((m, i) => {
      const { x, w } = metricCells[i]
      const accent = tone(m.accent ?? ACCENTS[i % ACCENTS.length])
      cardPanel(s, nm(s, `RoadM${i}Bg`), x, 3.56, w, 1.46)
      setLine(s, nm(s, `RoadM${i}Bg`), C.grid, '0.7pt')
      box(s, nm(s, `RoadM${i}Top`), 'rectangle', x, 3.56, w, 0.05, accent)
      tx(s, nm(s, `RoadM${i}Lab`), x + 0.2, 3.79, 1.9, 0.12, m.label, {
        name: FONT_EN,
        size: '6.6pt',
        color: C.muted,
      })
      tx(s, nm(s, `RoadM${i}Val`), x + 0.22, 3.99, 1.35, 0.34, m.value, {
        name: FONT_EN,
        size: '22pt',
        bold: true,
        color: displayInk(accent),
      })
      box(s, nm(s, `RoadM${i}Sep`), 'rectangle', x + 1.75, 3.83, 0.012, 1.06, C.grid)
      tx(s, nm(s, `RoadM${i}Target`), x + 1.95, 3.98, w - 2.16, 0.28, m.target, {
        name: FONT_EN,
        size: '8pt',
        bold: true,
        color: C.text2,
      })
      tx(s, nm(s, `RoadM${i}By`), x + 1.95, 4.48, w - 2.16, 0.14, m.by, {
        name: FONT_EN,
        size: '6.6pt',
        color: accentText(accent),
      })
      tx(s, nm(s, `RoadM${i}Note`), x + 0.22, 4.67, w - 0.44, 0.16, m.note, {
        name: FONT_EN,
        size: '7pt',
        color: C.text2,
      })
    })

    box(s, nm(s, 'GovernanceBg'), 'rectangle', MX, 5.23, CW, 1.15, C.deep)
    tx(
      s,
      nm(s, 'GovTitle'),
      MX,
      5.42,
      CW,
      0.14,
      data.governance.title,
      {
        name: FONT_EN,
        size: '7.5pt',
        bold: true,
        color: C.white,
      },
      'center',
    )
    const govCells = grid(3, 0.12, MX + 0.45, CW - 0.9)
    ;(data.governance.items ?? []).forEach(([label, primary, secondary], i) => {
      const { x, w } = govCells[i]
      tx(
        s,
        nm(s, `GovLab${i}`),
        x,
        5.81,
        w,
        0.15,
        label,
        {
          name: FONT_EN,
          size: '6.5pt',
          color: C.line,
        },
        'center',
      )
      tx(
        s,
        nm(s, `GovPri${i}`),
        x,
        6.03,
        w,
        0.16,
        primary,
        {
          name: FONT_EN,
          size: '7.5pt',
          bold: true,
          color: i === 1 ? C.amberBright : C.white,
        },
        'center',
      )
      tx(
        s,
        nm(s, `GovSec${i}`),
        x,
        6.22,
        w,
        0.16,
        secondary,
        {
          name: FONT_EN,
          size: '6.5pt',
          color: C.line,
        },
        'center',
      )
    })
    footer(s, total, data.source)
  }

  return {
    mckCoverSlide,
    mckCrisisSnapshotSlide,
    mckDemographicProfileSlide,
    mckPriorityMatrixSlide,
    mckLossDriverSlide,
    mckPillarsSlide,
    mckInitiativeRankingSlide,
    mckRoadmapSlide,
  }
}

export function createDeck(content) {
  const slides = content.slides ?? []
  const total = slides.length
  const builders = createMckOps()
  const chrome = makeChrome(builders)
  const components = makeComponents(builders)
  const dispatch = makePageTypes(builders, chrome, components, total)
  const warnings = []

  slides.forEach((slide, s) => {
    const fn = dispatch[slide.type]
    if (!fn) {
      warnings.push(`Unknown slide type "${slide.type}" at index ${s}`)
      return
    }
    fn(s, slide.data ?? {})
  })

  return { patch: { schemaVersion: 1, ops: builders.ops }, warnings }
}

export { ACCENTS, C, FONT_CN, FONT_EN }
