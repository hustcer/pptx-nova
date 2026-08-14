// cartesian.kit.mjs - Minimal editorial geometry DeckKit
// version: 0.2.0
import { createOps, fitImageRect, nm } from './core-primitives.kit.mjs'

export const C = {
  bg: 'EDE8E0',
  bg2: 'E2DBD1',
  ink: '1A1A1A',
  chartPrimary: '555555',
  body: '5A5A5A',
  accent: '665D56',
  line: 'B8B0A4',
  card: 'F5F2ED',
  ring30: 'DED8D2',
  ring20: 'E3DED9',
}

export const FONT_DISPLAY = 'Playfair Display'
export const FONT_BODY = 'Inter'

const SLIDE_W = 13.333
const MX = 0.533
const CW = SLIDE_W - MX * 2
const EDITORIAL_IMAGE_SLOT = 'image.editorial'
const IMAGE_FRAME_PADDING = 0.08

const f = (size, color = C.body, extra = {}) => ({
  name: extra.name ?? FONT_BODY,
  size: `${size}pt`,
  color,
  ...(extra.bold ? { bold: true } : {}),
})
const d = (size, color = C.ink) => f(size, color, { name: FONT_DISPLAY })
const labelFont = (size = 9) => f(size, C.accent, { bold: true })
const upper = (value) => String(value ?? '').toUpperCase()
const roman = ['I', 'II', 'III', 'IV']

function makeCartesianOps(options = {}) {
  const p = createOps({
    textbox: {
      marginTop: '0in',
      marginBottom: '0in',
      marginLeft: '0.02in',
      marginRight: '0.02in',
    },
  })

  const rawShape = (s, base, shape, x, y, w, h) => {
    const name = nm(s, base)
    p.ops.push({
      op: 'add-shape',
      slide: s,
      kind: shape,
      name,
      x: `${x}in`,
      y: `${y}in`,
      w: `${w}in`,
      h: `${h}in`,
    })
    return name
  }
  const fillOp = (s, name, color) => ({
    op: 'set-shape',
    slide: s,
    shape: { name },
    fill: { type: 'solid', color },
  })
  const noFillOp = (s, name) => ({
    op: 'set-shape',
    slide: s,
    shape: { name },
    fill: { type: 'none' },
  })
  const lineOp = (s, name, color = C.line, width = '0.75pt', dash) => ({
    op: 'set-shape',
    slide: s,
    shape: { name },
    line: { width, color, ...(dash ? { dash } : {}) },
  })
  const rect = (s, base, x, y, w, h, color) => p.box(s, nm(s, base), 'rectangle', x, y, w, h, color)
  const tx = (s, base, x, y, w, h, text, font, align) =>
    p.tx(s, nm(s, base), x, y, w, h, String(text ?? ''), font, align)
  const rule = (s, base, x, y, w, color = C.line, h = 0.01) => rect(s, base, x, y, w, h, color)
  const outline = (s, base, shape, x, y, w, h, color = C.line, width = '0.75pt', dash) => {
    const name = rawShape(s, base, shape, x, y, w, h)
    p.ops.push(noFillOp(s, name), lineOp(s, name, color, width, dash))
    return name
  }
  const ring = (s, base, x, y, diameter, color, inner = 0.78) => {
    const outer = outline(s, `${base}Outer`, 'oval', x, y, diameter, diameter, color, '0.5pt')
    p.ops.push(fillOp(s, outer, C.bg))
    const inset = (diameter * (1 - inner)) / 2
    const innerName = outline(
      s,
      `${base}Inner`,
      'oval',
      x + inset,
      y + inset,
      diameter * inner,
      diameter * inner,
      color,
      '0.5pt',
      'dash',
    )
    p.ops.push(fillOp(s, innerName, C.bg))
  }
  const label = (s, base, x, y, w, text, align) =>
    tx(s, base, x, y, w, 0.2, upper(text), labelFont(), align)
  const slideBase = (s) => p.addSlide(s, C.bg)

  return {
    p,
    rawShape,
    rect,
    tx,
    rule,
    outline,
    ring,
    label,
    slideBase,
    fillOp,
    lineOp,
    assets: options.assets ?? null,
  }
}

function drawImageFrame(ctx, s, x, y, w, h) {
  const { p, rawShape, fillOp, lineOp } = ctx
  const shell = rawShape(s, 'ImageShell', 'rectangle', x, y, w, h)
  p.ops.push(fillOp(s, shell, C.bg2), lineOp(s, shell, C.line, '0.75pt'))
}

function drawImageShell(ctx, s, x, y, w, h, label) {
  const { p, lineOp } = ctx
  drawImageFrame(ctx, s, x, y, w, h)

  const cx = x + w / 2
  const cy = y + h / 2
  p.ops.push({
    op: 'add-connector',
    slide: s,
    kind: 'straight',
    begin: { x: `${x}in`, y: `${y}in` },
    end: { x: `${x + w}in`, y: `${y + h}in` },
    name: nm(s, 'ImageDiagA'),
  })
  p.ops.push(lineOp(s, nm(s, 'ImageDiagA'), C.line, '0.75pt'))
  p.ops.push({
    op: 'add-connector',
    slide: s,
    kind: 'straight',
    begin: { x: `${x}in`, y: `${y + h}in` },
    end: { x: `${x + w}in`, y: `${y}in` },
    name: nm(s, 'ImageDiagB'),
  })
  p.ops.push(lineOp(s, nm(s, 'ImageDiagB'), C.line, '0.75pt'))
  ctx.tx(s, 'ImageLabel', cx - 0.95, cy - 0.08, 1.9, 0.18, upper(label), f(9.5, C.accent), 'center')
}

function drawImageAsset(ctx, s, x, y, w, h, label, asset) {
  drawImageFrame(ctx, s, x, y, w, h)
  const fitted = fitImageRect(
    x + IMAGE_FRAME_PADDING,
    y + IMAGE_FRAME_PADDING,
    w - IMAGE_FRAME_PADDING * 2,
    h - IMAGE_FRAME_PADDING * 2,
    asset.ratio,
    asset.fitPolicy,
  )
  const imageName = nm(s, 'ImageAsset')
  ctx.p.addImage(s, imageName, fitted.x, fitted.y, fitted.w, fitted.h, {
    path: asset.path,
    mime: asset.mime,
  })
  ctx.p.setImageCrop(s, imageName, fitted.crop)
  ctx.tx(s, 'ImageLabel', x, y - 0.27, w, 0.18, upper(label), f(8.5, C.accent))
}

function resolveEditorialImage(ctx, slide) {
  const slots = slide?.imageSlots
  if (!slots || typeof slots !== 'object' || Array.isArray(slots)) return null
  const slotIds = Object.keys(slots)
  const unsupported = slotIds.filter((slotId) => slotId !== EDITORIAL_IMAGE_SLOT)
  if (unsupported.length > 0) {
    throw new Error(
      `cartesianImageStatsSlide supports only image slot "${EDITORIAL_IMAGE_SLOT}", got ${unsupported.join(', ')}`,
    )
  }
  if (!(EDITORIAL_IMAGE_SLOT in slots)) return null
  if (!ctx.assets) {
    throw new Error(
      `cartesianImageStatsSlide references "${EDITORIAL_IMAGE_SLOT}" but no assets manifest was provided; pass --assets assets_manifest.json`,
    )
  }
  return ctx.assets.resolveImageSlot(slide, EDITORIAL_IMAGE_SLOT)
}

function chartBase(ctx, s, name, data, x, y, w, h, kind) {
  const { p } = ctx
  p.ops.push({
    op: 'add-chart',
    slide: s,
    kind,
    variant: kind === 'line' ? 'markers' : 'clustered',
    x: `${x}in`,
    y: `${y}in`,
    w: `${w}in`,
    h: `${h}in`,
    name: nm(s, name),
    legend: 'bottom',
    data,
  })
  p.ops.push({
    op: 'set-chart',
    slide: s,
    shape: { name: nm(s, name) },
    style: 4,
  })
  p.ops.push({
    op: 'set-chart',
    slide: s,
    shape: { name: nm(s, name) },
    legend: {
      position: 'bottom',
      includeInLayout: false,
      font: f(8.5, C.body),
    },
  })
  p.ops.push({
    op: 'set-chart',
    slide: s,
    shape: { name: nm(s, name) },
    axes: [{ axis: 'value', line: { color: C.bg2, width: '0.5pt' } }],
  })
  p.ops.push({
    op: 'set-chart',
    slide: s,
    shape: { name: nm(s, name) },
    axes: [{ axis: 'value', gridlines: { color: C.bg2, width: '0.5pt' } }],
  })
}

function renderSlide(ctx, s, slide) {
  const { p, tx, rule, outline, ring, label, slideBase, fillOp } = ctx
  const data = slide.data ?? {}
  slideBase(s)

  if (slide.type === 'cartesianCoverSlide') {
    ring(s, 'HeroRing', 8.66, 2.74, 4.0, C.ring30, 0.8)
    label(s, 'Label', MX, 2.74, 3.4, data.label)
    tx(s, 'Title', MX, 3.02, 8.7, 1.05, data.title, d(65, C.ink))
    tx(s, 'Description', MX, 4.18, 5.4, 0.7, data.subtitle, f(15.5, C.body))
    return
  }

  if (slide.type === 'cartesianAgendaSlide') {
    label(s, 'Label', MX, 3.05, 4.4, data.label)
    tx(s, 'Title', MX, 3.31, 4.9, 0.55, data.title, d(36, C.ink))
    tx(s, 'Body', MX, 4.0, 4.0, 0.65, data.body, f(13, C.body))
    const rowX = 7.06
    const rowW = 5.74
    ;(data.items ?? []).forEach((item, i) => {
      const source = typeof item === 'string' ? { text: item } : (item ?? {})
      const y = 2.42 + i * 0.664
      rule(s, `AgendaRule${i}`, rowX, y + 0.654, rowW, C.line, 0.01)
      tx(
        s,
        `AgendaNum${i}`,
        rowX,
        y + 0.14,
        0.5,
        0.36,
        source.number ?? String(i + 1).padStart(2, '0'),
        d(18, C.accent),
      )
      tx(s, `AgendaText${i}`, rowX + 0.72, y + 0.18, rowW - 0.72, 0.28, source.text, f(13, C.body))
    })
    return
  }

  if (slide.type === 'cartesianStatementSlide') {
    ring(s, 'SideRing', 0.0, 0.88, 3.8, C.ring20, 0.8)
    tx(s, 'QuoteMark', 6.37, 2.25, 0.6, 1.0, data.quoteMark ?? '"', d(52, C.accent), 'center')
    tx(s, 'Quote', 2.2, 3.38, 8.9, 1.85, data.quote, d(36, C.ink), 'center')
    tx(s, 'Attribution', 5.55, 5.48, 2.25, 0.2, upper(data.attribution), f(10, C.accent), 'center')
    return
  }

  if (slide.type === 'cartesianBarChartSlide') {
    label(s, 'Label', MX, 2.98, 4.5, data.label)
    tx(s, 'Title', MX, 3.25, 5.3, 0.55, data.title, d(36, C.ink))
    tx(s, 'Body', MX, 3.88, 4.5, 0.85, data.body, f(13, C.body))
    chartBase(ctx, s, 'Chart', data.chart, 5.84, 1.68, 6.96, 4.15, 'column')
    p.ops.push({
      op: 'set-chart',
      slide: s,
      shape: { name: nm(s, 'Chart') },
      series: [
        {
          series: 0,
          fill: { type: 'solid', color: C.chartPrimary },
          line: { width: '0.5pt', color: C.chartPrimary },
        },
      ],
    })
    p.ops.push({
      op: 'set-chart',
      slide: s,
      shape: { name: nm(s, 'Chart') },
      series: [
        {
          series: 1,
          fill: { type: 'none' },
          line: { width: '1pt', color: C.line, dash: 'dash' },
        },
      ],
    })
    return
  }

  if (slide.type === 'cartesianImageStatsSlide') {
    const imageAsset = resolveEditorialImage(ctx, slide)
    if (imageAsset) drawImageAsset(ctx, s, MX, 1.5, 5.8, 4.5, data.imageLabel, imageAsset)
    else drawImageShell(ctx, s, MX, 1.5, 5.8, 4.5, data.imageLabel)
    label(s, 'Label', 7.0, 2.07, 4.2, data.label)
    tx(s, 'Title', 7.0, 2.34, 5.8, 0.55, data.title, d(36, C.ink))
    ;(data.paragraphs ?? []).forEach((para, i) => {
      tx(s, `Paragraph${i}`, 7.0, 2.98 + i * 0.9, 5.8, 0.65, para, f(13, C.body))
    })
    rule(s, 'StatsRule', 7.0, 4.56, 5.8, C.line, 0.01)
    ;(data.stats ?? []).forEach((stat, i) => {
      const x = 7.0 + i * 1.48
      tx(s, `StatValue${i}`, x, 4.78, 1.3, 0.46, stat.value, d(24, C.ink))
      tx(s, `StatLabel${i}`, x, 5.24, 1.35, 0.18, upper(stat.label), f(7.6, C.accent))
    })
    return
  }

  if (slide.type === 'cartesianCardsSlide') {
    label(s, 'Label', MX, 2.06, CW, data.label, 'center')
    tx(s, 'Title', MX, 2.33, CW, 0.55, data.title, d(36, C.ink), 'center')
    const cells = [
      { x: 0.533, w: 3.822 },
      { x: 4.755, w: 3.822 },
      { x: 8.977, w: 3.822 },
    ]
    ;(data.cards ?? []).forEach((card, i) => {
      const cell = cells[i]
      if (!cell) return
      outline(s, `Card${i}`, 'rectangle', cell.x, 3.22, cell.w, 2.22, C.line, '0.75pt')
      p.ops.push(fillOp(s, nm(s, `Card${i}`), C.card))
      outline(s, `CardIcon${i}`, 'oval', cell.x + 0.276, 3.53, 0.37, 0.37, C.line, '0.75pt')
      p.ops.push(fillOp(s, nm(s, `CardIcon${i}`), C.card))
      tx(
        s,
        `CardIconText${i}`,
        cell.x + 0.276,
        3.61,
        0.37,
        0.16,
        card.marker ?? roman[i] ?? String(i + 1),
        f(9, C.accent),
        'center',
      )
      tx(s, `CardTitle${i}`, cell.x + 0.276, 4.08, 3.25, 0.28, card.title, d(15.5, C.ink))
      tx(s, `CardBody${i}`, cell.x + 0.276, 4.5, 3.25, 0.78, card.body, f(10.8, C.body))
    })
    return
  }

  if (slide.type === 'cartesianLineChartSlide') {
    label(s, 'Label', MX, 0.48, 3.8, data.label)
    tx(s, 'Title', MX, 0.78, 5.5, 0.72, data.title, d(36, C.ink))
    tx(s, 'Body', 9.45, 0.55, 3.35, 0.78, data.body, f(13, C.body), 'right')
    chartBase(ctx, s, 'Chart', data.chart, MX, 1.62, CW, 5.58, 'line')
    p.ops.push({
      op: 'set-chart',
      slide: s,
      shape: { name: nm(s, 'Chart') },
      axes: [
        {
          axis: 'value',
          scale: {
            min: 0,
            max: data.valueAxis?.max ?? 60,
            majorUnit: data.valueAxis?.majorUnit ?? 10,
          },
        },
      ],
    })
    p.ops.push({
      op: 'set-chart',
      slide: s,
      shape: { name: nm(s, 'Chart') },
      series: [
        {
          series: 0,
          line: { width: '1.5pt', color: C.ink },
          marker: {
            symbol: 'circle',
            size: 5,
            fill: C.ink,
            line: C.bg,
          },
          smooth: true,
        },
      ],
    })
    p.ops.push({
      op: 'set-chart',
      slide: s,
      shape: { name: nm(s, 'Chart') },
      series: [
        {
          series: 1,
          line: { width: '1.2pt', color: C.line, dash: 'dash' },
          marker: {
            symbol: 'circle',
            size: 4,
            fill: C.line,
            line: C.line,
          },
          smooth: true,
        },
      ],
    })
    return
  }

  if (slide.type === 'cartesianTimelineSlide') {
    label(s, 'Label', MX, 2.59, CW, data.label)
    tx(s, 'Title', MX, 2.86, CW, 0.55, data.title, d(36, C.ink))
    rule(s, 'TimelineRule', MX, 3.67, CW, C.line, 0.01)
    ;(data.items ?? []).forEach((item, i) => {
      const x = MX + i * 3.066
      tx(s, `Phase${i}`, x, 3.9, 2.65, 0.18, upper(item.phase), f(9, C.accent))
      tx(s, `StepTitle${i}`, x, 4.18, 2.65, 0.3, item.title, d(14.5, C.ink))
      tx(s, `StepBody${i}`, x, 4.51, 2.65, 0.5, item.body, f(10.5, C.body))
    })
    return
  }

  if (slide.type === 'cartesianTeamSlide') {
    label(s, 'Label', MX, 2.1, CW, data.label, 'center')
    tx(s, 'Title', MX, 2.37, CW, 0.55, data.title, d(36, C.ink), 'center')
    ;(data.members ?? []).forEach((member, i) => {
      const x = 2.667 + i * 2.133
      outline(s, `Photo${i}`, 'oval', x, 3.18, 1.6, 1.6, C.line, '0.75pt')
      p.ops.push(fillOp(s, nm(s, `Photo${i}`), C.bg2))
      tx(s, `Initial${i}`, x, 3.73, 1.6, 0.5, member.initial, d(24, C.accent), 'center')
      tx(s, `Name${i}`, x - 0.05, 4.93, 1.7, 0.28, member.name, d(14.5, C.ink), 'center')
      tx(
        s,
        `RoleLabel${i}`,
        x - 0.2,
        5.24,
        2.0,
        0.18,
        upper(member.role),
        f(7.8, C.accent),
        'center',
      )
    })
    return
  }

  if (slide.type === 'cartesianClosingSlide') {
    ring(s, 'ClosingRing', 3.333, 0.417, 6.667, C.ring30, 0.7)
    label(s, 'Label', 5.1, 2.87, 3.14, data.label, 'center')
    tx(s, 'Title', 4.47, 3.16, 4.4, 0.82, data.title, d(54, C.ink), 'center')
    tx(s, 'Cta', 5.1, 4.55, 3.14, 0.24, upper(data.cta), f(10.8, C.accent), 'center')
    tx(s, 'Contact', 5.1, 4.96, 3.14, 0.24, data.contact, f(10, C.accent), 'center')
  }
}

export function createDeck(content, options = {}) {
  const ctx = makeCartesianOps(options)
  const warnings = []
  ;(content.slides ?? []).forEach((slide, index) => {
    if (!slide.type?.startsWith('cartesian')) {
      warnings.push(`Unknown slide type "${slide.type}" at index ${index}`)
      return
    }
    renderSlide(ctx, index, slide)
  })
  return { patch: { schemaVersion: 'pptx-patch/v1', ops: ctx.p.ops }, warnings }
}
