// coral.kit.mjs - Coral editorial poster DeckKit
// version: 0.1.0
import { createOps, grid, nm } from './core-primitives.kit.mjs'

export const C = {
  coral: 'E85D5D',
  coralDark: 'D44A4A',
  coralText: '9D2727',
  cream: 'F5F0E8',
  creamDark: 'E8E0D4',
  ink: '1A1A1A',
  gray: '6B6B6B',
  lightGray: 'B0B0B0',
  white: 'FFFFFF',
}

export const FONT_DISPLAY = 'Bebas Neue'
export const FONT_BODY = 'Inter'

const f = (size, color = C.ink, extra = {}) => ({
  name: extra.name ?? FONT_BODY,
  size: `${size}pt`,
  color,
  ...(extra.bold ? { bold: true } : {}),
})
const d = (size, color = C.ink) => f(size, color, { name: FONT_DISPLAY })
const label = (size = 9, color = C.gray) => f(size, color, { bold: true })

function makeCoralOps() {
  const p = createOps({ textbox: { marginTop: '0in', marginBottom: '0in' } })
  const rect = (s, base, x, y, w, h, color) => p.box(s, nm(s, base), 'rectangle', x, y, w, h, color)
  const tx = (s, base, x, y, w, h, text, font, align) =>
    p.tx(s, nm(s, base), x, y, w, h, String(text ?? ''), font, align)
  const rotate = (s, base, degrees) =>
    p.ops.push({ op: 'set-shape-rotation', slide: s, shape: { name: nm(s, base) }, degrees })
  const outline = (s, base, color = C.ink, width = '1pt') => p.setLine(s, nm(s, base), color, width)

  const hatch = (s, prefix, x, y, w, h, angle = 45, color = C.coralDark, count = 10) => {
    for (let i = 0; i < count; i++) {
      const base = `${prefix}${i}`
      rect(s, base, x + i * (w / count), y + 0.08, 0.08, Math.max(0.1, h - 0.16), color)
      rotate(s, base, angle)
    }
  }

  const zigzag = (s, prefix, x, y, w, h, count = 6) => {
    const step = w / count
    for (let i = 0; i < count; i++) {
      const cx = x + i * step
      rect(s, `${prefix}A${i}`, cx + step * 0.22, y + h * 0.18, 0.08, h * 0.75, C.coralDark)
      rotate(s, `${prefix}A${i}`, 28)
      rect(s, `${prefix}B${i}`, cx + step * 0.5, y + h * 0.18, 0.08, h * 0.75, C.coralDark)
      rotate(s, `${prefix}B${i}`, -28)
    }
  }

  const badge = (s, base, x, y, text, fill = C.coral, color = C.ink) => {
    rect(s, `${base}Bg`, x, y, 0.4, 0.36, fill)
    tx(s, `${base}Txt`, x + 0.05, y + 0.06, 0.3, 0.26, text, label(9, color), 'center')
  }

  return { p, rect, tx, outline, hatch, zigzag, badge }
}

function renderSlide(ctx, s, slide) {
  const { p, rect, tx, outline, hatch, zigzag, badge } = ctx
  const data = slide.data ?? {}
  p.addSlide(s, C.cream)

  if (slide.type === 'coralCoverSlide') {
    rect(s, 'Top', 0, 0, 13.333, 2.4, C.coral)
    zigzag(s, 'Zig', 0.2, 0.05, 12.1, 2.2, 6)
    tx(s, 'Brand', 1.1, 0.42, 1.0, 0.18, data.brand, label(8.5, C.ink))
    tx(s, 'Title', 0.92, 2.66, 8.0, 2.55, data.title, d(58, C.ink))
    rect(s, 'Rule', 0.92, 5.55, 11.5, 0.03, C.creamDark)
    tx(s, 'LocationLabel', 1.1, 6.35, 1.2, 0.15, data.locationLabel, label(8.5, C.gray))
    tx(s, 'Location', 1.1, 6.52, 2.1, 0.55, data.location, d(24, C.ink))
    tx(s, 'DateLabel', 10.1, 6.35, 1.55, 0.15, data.dateLabel, label(8.5, C.gray), 'right')
    tx(s, 'Year', 11.15, 6.52, 1.05, 0.55, data.year, d(24, C.ink), 'right')
    return
  }

  if (slide.type === 'coralStatementSlide') {
    tx(s, 'Section', 6.05, 0.45, 1.6, 0.18, data.section, label(8.5, C.coralText))
    tx(s, 'Title', 6.05, 0.8, 5.8, 2.25, data.title, d(40, C.ink))
    tx(s, 'Body', 6.05, 3.15, 4.7, 1.1, data.body, f(10.8, C.gray))
    rect(s, 'Accent', 6.05, 5.92, 0.55, 0.04, C.coral)
    return
  }

  if (slide.type === 'coralPillarsSplitSlide') {
    rect(s, 'Left', 0, 0, 6.67, 7.5, C.coral)
    rect(s, 'Right', 6.67, 0, 6.663, 7.5, C.ink)
    hatch(s, 'Hatch', 2.35, 0.0, 3.25, 7.5, 45, C.coralDark, 12)
    tx(s, 'Number', 0.55, 0.58, 1.35, 0.75, data.number, d(40, C.ink))
    tx(s, 'Title', 0.55, 5.05, 1.9, 1.35, data.title, d(28, C.ink))
    ;(data.items ?? []).forEach((item, i) => {
      const y = 2.35 + i * 1.2
      tx(s, `ItemLabel${i}`, 7.0, y, 1.4, 0.16, item.label, label(9, C.coral))
      tx(s, `ItemText${i}`, 7.0, y + 0.23, 5.0, 0.46, item.text, f(10.5, C.white))
    })
    return
  }

  if (slide.type === 'coralMetricsChartSlide') {
    tx(s, 'Section', 0.92, 0.45, 1.6, 0.18, data.section, label(8.5, C.coralText))
    tx(s, 'Title', 0.92, 0.78, 4.7, 0.72, data.title, d(32, C.ink))
    tx(s, 'Stat', 10.85, 0.5, 1.5, 0.75, data.stat, d(32, C.coral), 'right')
    tx(s, 'StatLabel', 10.95, 1.25, 1.4, 0.16, data.statLabel, label(9, C.gray), 'right')
    p.ops.push({
      op: 'add-chart',
      slide: s,
      kind: 'column',
      variant: 'clustered',
      x: '0.9in',
      y: '2.0in',
      w: '7.0in',
      h: '4.3in',
      name: nm(s, 'Chart'),
      legend: 'top',
      data: data.chart,
    })
    p.ops.push({
      op: 'set-chart-series-style',
      slide: s,
      shape: { name: nm(s, 'Chart') },
      series: 0,
      fill: { kind: 'solid', color: C.coral },
    })
    p.ops.push({
      op: 'set-chart-series-style',
      slide: s,
      shape: { name: nm(s, 'Chart') },
      series: 1,
      fill: { kind: 'solid', color: C.ink },
    })
    ;(data.metrics ?? []).forEach((metric, i) => {
      const y = 2.7 + i * 0.75
      rect(s, `Metric${i}`, 9.35, y, 3.0, 0.55, C.white)
      rect(s, `MetricRule${i}`, 9.35, y, 0.05, 0.55, C.coral)
      tx(s, `MetricValue${i}`, 9.58, y + 0.07, 1.0, 0.28, metric.value, d(18, C.ink))
      tx(s, `MetricLabel${i}`, 9.58, y + 0.33, 2.0, 0.2, metric.label, label(9, C.gray))
    })
    return
  }

  if (slide.type === 'coralImpactPosterSlide') {
    rect(s, 'Visual', 0, 0, 13.333, 6.25, C.coral)
    for (let i = 0; i < 18; i++) rect(s, `Stripe${i}`, i * 0.74, 0, 0.02, 6.25, C.coralDark)
    tx(s, 'Word', 4.25, 2.8, 4.9, 0.7, data.word, d(44, C.ink), 'center')
    tx(s, 'BarTitle', 1.1, 6.28, 4.4, 0.7, data.title, d(18, C.ink))
    tx(s, 'BarMeta', 10.25, 6.55, 1.5, 0.28, data.meta?.[0], label(9, C.gray), 'right')
    tx(s, 'BarMeta2', 11.78, 6.55, 1.1, 0.28, data.meta?.[1], label(9, C.gray), 'right')
    return
  }

  if (slide.type === 'coralObjectiveCardsSlide') {
    tx(s, 'Title', 0.92, 0.78, 4.8, 0.92, data.title, d(32, C.ink))
    tx(s, 'Subtitle', 0.92, 1.82, 4.9, 0.34, data.subtitle, f(10.5, C.gray))
    grid(3, 0.32, 0.92, 11.5).forEach((cell, i) => {
      const card = data.cards?.[i] ?? {}
      rect(s, `Card${i}`, cell.x, 2.2, cell.w, 3.9, C.white)
      rect(s, `CardTop${i}`, cell.x, 2.2, cell.w, 0.04, C.coral)
      badge(s, `Badge${i}`, cell.x + 0.25, 2.55, card.marker)
      tx(s, `CardTitle${i}`, cell.x + 0.25, 2.95, cell.w - 0.5, 0.35, card.title, d(18, C.ink))
      tx(s, `CardText${i}`, cell.x + 0.25, 3.43, cell.w - 0.5, 0.9, card.text, f(10.5, C.gray))
      tx(s, `CardStat${i}`, cell.x + 0.25, 5.55, 1.1, 0.35, card.stat, d(22, C.coral))
    })
    return
  }

  if (slide.type === 'coralQuoteSplitSlide') {
    rect(s, 'Left', 0, 0, 5.45, 7.5, C.coral)
    rect(s, 'Right', 5.45, 0, 7.883, 7.5, C.ink)
    hatch(s, 'QuoteHatch', 0.15, 0, 3.9, 7.5, -45, C.coralDark, 10)
    tx(s, 'Mark', 2.4, 3.05, 0.75, 0.75, data.mark, d(38, C.ink), 'center')
    rect(s, 'Accent', 6.35, 3.0, 0.6, 0.035, C.coral)
    tx(s, 'Quote', 6.35, 3.35, 5.2, 1.2, data.quote, f(16, C.white))
    tx(s, 'Author', 6.35, 5.05, 2.2, 0.16, data.author, label(8.5, C.coral))
    tx(s, 'Role', 6.35, 5.25, 2.2, 0.16, data.role, f(9, C.lightGray))
    return
  }

  if (slide.type === 'coralTimelineSlide') {
    tx(s, 'Section', 0.92, 0.45, 1.4, 0.18, data.section, label(8.5, C.coralText))
    tx(s, 'Title', 0.92, 0.68, 5.0, 1.02, data.title, d(30, C.ink))
    rect(s, 'Axis', 2.0, 4.05, 9.5, 0.025, C.ink)
    ;(data.steps ?? []).forEach((step, i) => {
      const x = 2.0 + i * (9.5 / 4)
      const up = i % 2 === 0
      p.box(s, nm(s, `Node${i}`), 'oval', x - 0.22, 3.82, 0.44, 0.44, C.coral)
      outline(s, `Node${i}`, C.ink, '1pt')
      tx(s, `Phase${i}`, x - 0.2, 3.92, 0.4, 0.24, step.phase, label(9, C.ink), 'center')
      tx(
        s,
        `StepTitle${i}`,
        x - 0.65,
        up ? 3.05 : 4.62,
        1.3,
        0.22,
        step.title,
        label(9, C.coralText),
        'center',
      )
      tx(
        s,
        `StepDesc${i}`,
        x - 0.85,
        up ? 3.27 : 4.84,
        1.7,
        0.58,
        step.desc,
        f(9, C.gray),
        'center',
      )
    })
    return
  }

  if (slide.type === 'coralTeamGridSlide') {
    p.ops.push({ op: 'set-slide-background', slide: s, fill: { type: 'solid', color: C.ink } })
    tx(s, 'Title', 0.92, 0.5, 3.6, 0.95, data.title, d(30, C.white))
    tx(s, 'Subtitle', 0.92, 1.48, 3.2, 0.22, data.subtitle, f(9.5, C.lightGray))
    grid(4, 0.28, 0.92, 11.5).forEach((cell, i) => {
      const person = data.people?.[i] ?? {}
      rect(s, `Member${i}`, cell.x, 2.05, cell.w, 4.6, '232323')
      p.box(s, nm(s, `Avatar${i}`), 'oval', cell.x + cell.w / 2 - 0.25, 2.55, 0.5, 0.5, C.coral)
      tx(
        s,
        `Initials${i}`,
        cell.x + cell.w / 2 - 0.22,
        2.68,
        0.44,
        0.26,
        person.initials,
        label(9, C.ink),
        'center',
      )
      tx(
        s,
        `Name${i}`,
        cell.x + 0.35,
        3.35,
        cell.w - 0.7,
        0.2,
        person.name,
        f(9, C.white, { bold: true }),
        'center',
      )
      tx(
        s,
        `Role${i}`,
        cell.x + 0.35,
        3.58,
        cell.w - 0.7,
        0.2,
        person.role,
        f(9, C.lightGray),
        'center',
      )
    })
    return
  }

  if (slide.type === 'coralClosingSlide') {
    rect(s, 'LeftPanel', 0, 0, 7.1, 7.5, C.coral)
    tx(s, 'Title', 0.92, 2.72, 2.9, 1.25, data.title, d(38, C.ink))
    tx(s, 'Subtitle', 0.92, 4.25, 3.8, 0.6, data.subtitle, f(10.5, C.ink))
    zigzag(s, 'BottomZig', 0.0, 6.85, 7.1, 0.65, 7)
    ;(data.contacts ?? []).forEach((contact, i) => {
      const y = 1.9 + i * 1.15
      tx(s, `ContactLabel${i}`, 8.1, y, 1.2, 0.16, contact.label, label(8.5, C.gray))
      tx(s, `ContactValue${i}`, 8.1, y + 0.25, 3.05, 0.42, contact.value, d(17, C.ink))
    })
    ;(data.socials ?? []).forEach((soc, i) => {
      rect(s, `Social${i}`, 8.1 + i * 0.45, 5.7, 0.32, 0.32, C.cream)
      outline(s, `Social${i}`, C.ink, '0.75pt')
      tx(s, `SocialText${i}`, 8.13 + i * 0.45, 5.72, 0.3, 0.3, soc, label(9, C.ink), 'center')
    })
  }
}

export function createDeck(content) {
  const ctx = makeCoralOps()
  const warnings = []
  ;(content.slides ?? []).forEach((slide, index) => {
    if (!slide.type?.startsWith('coral')) {
      warnings.push(`Unknown slide type "${slide.type}" at index ${index}`)
      return
    }
    renderSlide(ctx, index, slide)
  })
  return { patch: { schemaVersion: 1, ops: ctx.p.ops }, warnings }
}
