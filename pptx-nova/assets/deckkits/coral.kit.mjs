// coral.kit.mjs - Coral editorial poster DeckKit
// version: 0.1.0
import { createOps, grid, nm } from './core-primitives.kit.mjs'

export const C = {
  coral: 'E85D5D',
  coralDark: 'D44A4A',
  coralStripe: 'C94A4A',
  coralShadow: '9D2727',
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
  const outline = (s, base, color = C.ink, width = '1pt') => p.setLine(s, nm(s, base), color, width)
  const svg = (s, base, x, y, w, h, markup) =>
    p.ops.push({
      op: 'add-image',
      slide: s,
      name: nm(s, base),
      x: `${x}in`,
      y: `${y}in`,
      w: `${w}in`,
      h: `${h}in`,
      bytesBase64: Buffer.from(markup, 'utf8').toString('base64'),
      mimeType: 'image/svg+xml',
    })

  const hatchSvg = (s, base, x, y, w, h, angle = 45) => {
    const rotation = angle < 0 ? -45 : 45
    const stripes = Array.from({ length: 56 }, (_, i) => {
      const stripeX = -1100 + i * 48
      return `<rect x="${stripeX}" y="-1000" width="20" height="2600" fill="#${C.ink}" opacity="0.1"/>`
    }).join('')
    svg(
      s,
      base,
      x,
      y,
      w,
      h,
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800" preserveAspectRatio="none">
        <rect width="600" height="800" fill="#${C.coral}"/>
        <g transform="rotate(${rotation} 300 400)">${stripes}</g>
      </svg>`,
    )
  }

  const coverTopZigzag = (s, base, x, y, w, h) => {
    const zigzag = (low, high, strokeWidth, opacity) => {
      const points = Array.from(
        { length: 15 },
        (_, i) => `${-50 + i * 100},${i % 2 === 0 ? low : high}`,
      ).join(' ')
      return `<polyline points="${points}" fill="none" stroke="#${C.ink}" stroke-width="${strokeWidth}" stroke-linejoin="miter" stroke-linecap="butt" opacity="${opacity}"/>`
    }

    svg(
      s,
      base,
      x,
      y,
      w,
      h,
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 400" preserveAspectRatio="none">
        <rect width="1200" height="400" fill="#${C.coral}"/>
        ${zigzag(320, 120, 18, 0.22)}
        ${zigzag(380, 180, 14, 0.16)}
        ${zigzag(350, 150, 8, 0.11)}
      </svg>`,
    )
  }

  const bottomZigzag = (s, base, x, y, w, h) => {
    svg(
      s,
      base,
      x,
      y,
      w,
      h,
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 60" preserveAspectRatio="none">
        <path d="M0,30 L40,10 L80,30 L120,10 L160,30 L200,10 L240,30 L280,10 L320,30 L360,10 L400,30 L400,60 L0,60 Z"
          fill="#1A1A1A" opacity="0.2"/>
      </svg>`,
    )
  }

  const badge = (s, base, x, y, text, fill = C.coral, color = C.white) => {
    rect(s, `${base}Bg`, x, y, 0.46, 0.46, fill)
    tx(s, `${base}Txt`, x, y + 0.07, 0.46, 0.34, text, d(18, color), 'center')
  }

  return { p, rect, tx, outline, hatchSvg, coverTopZigzag, bottomZigzag, badge }
}

function renderSlide(ctx, s, slide) {
  const { p, rect, tx, outline, hatchSvg, coverTopZigzag, bottomZigzag, badge } = ctx
  const data = slide.data ?? {}
  p.addSlide(s, C.cream)

  if (slide.type === 'coralCoverSlide') {
    coverTopZigzag(s, 'TopZigzag', 0, 0, 13.333, 2.4)
    tx(s, 'Brand', 0.92, 0.42, 1.25, 0.24, data.brand, label(9, C.ink))
    tx(s, 'Title', 0.92, 2.78, 7.4, 3.02, data.title, d(58, C.ink))
    rect(s, 'Rule', 0.92, 5.56, 11.5, 0.025, C.creamDark)
    tx(s, 'LocationLabel', 0.92, 5.88, 1.4, 0.16, data.locationLabel, label(8.5, C.gray))
    tx(s, 'Location', 0.92, 6.06, 2.65, 1.0, data.location, d(30, C.ink))
    tx(s, 'DateLabel', 10.0, 5.88, 2.05, 0.16, data.dateLabel, label(8.5, C.gray), 'right')
    tx(s, 'Year', 10.95, 6.06, 1.25, 1.0, data.year, d(30, C.ink), 'right')
    return
  }

  if (slide.type === 'coralStatementSlide') {
    tx(s, 'Section', 0.92, 0.48, 1.8, 0.18, data.section, label(9, C.coralText))
    tx(s, 'Title', 0.92, 0.9, 11.6, 2.72, data.title, d(62, C.ink))
    tx(s, 'Body', 0.92, 3.72, 5.95, 1.62, data.body, f(15, C.gray))
    rect(s, 'Accent', 0.92, 7.02, 0.74, 0.04, C.coral)
    return
  }

  if (slide.type === 'coralPillarsSplitSlide') {
    rect(s, 'Left', 0, 0, 6.67, 7.5, C.coral)
    rect(s, 'Right', 6.67, 0, 6.663, 7.5, C.ink)
    hatchSvg(s, 'Hatch', 3.33, 0, 3.34, 7.5, 45)
    tx(s, 'Number', 0.55, 0.5, 2.05, 3.5, data.number, d(105, C.coralShadow))
    tx(s, 'Title', 0.55, 5.32, 2.3, 1.75, data.title, d(42, C.ink))
    ;(data.items ?? []).forEach((item, i) => {
      const y = 2.68 + i * 0.78
      tx(
        s,
        `ItemLabel${i}`,
        7.2,
        y,
        1.7,
        0.16,
        String(item.label ?? '').toUpperCase(),
        label(9, C.coral),
      )
      tx(s, `ItemText${i}`, 7.2, y + 0.24, 5.15, 0.42, item.text, f(13.5, C.white))
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
      op: 'set-chart',
      slide: s,
      shape: { name: nm(s, 'Chart') },
      series: [{ series: 0, fill: { type: 'solid', color: C.coral } }],
    })
    p.ops.push({
      op: 'set-chart',
      slide: s,
      shape: { name: nm(s, 'Chart') },
      series: [{ series: 1, fill: { type: 'solid', color: C.ink } }],
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
    tx(s, 'Word', 3.55, 2.05, 6.2, 3.25, data.word, d(112, C.ink), 'center')
    tx(s, 'BarTitle', 0.92, 6.36, 7.55, 0.7, data.title, d(34, C.ink))
    tx(s, 'BarMeta', 9.55, 6.52, 2.6, 0.52, (data.meta ?? []).join('\n'), label(9, C.gray), 'right')
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
      tx(s, `CardTitle${i}`, cell.x + 0.25, 3.08, cell.w - 0.5, 0.35, card.title, d(18, C.ink))
      tx(s, `CardText${i}`, cell.x + 0.25, 3.43, cell.w - 0.5, 0.9, card.text, f(10.5, C.gray))
      tx(s, `CardStat${i}`, cell.x + 0.25, 5.42, 1.45, 0.55, card.stat, d(34, C.coral))
    })
    return
  }

  if (slide.type === 'coralQuoteSplitSlide') {
    rect(s, 'Left', 0, 0, 5.33, 7.5, C.coral)
    rect(s, 'Right', 5.33, 0, 8.003, 7.5, C.ink)
    hatchSvg(s, 'QuoteHatch', 0, 0, 5.33, 7.5, -45)
    tx(s, 'Mark', 1.95, 2.22, 1.65, 2.34, data.mark, d(140, C.coralShadow), 'center')
    rect(s, 'Accent', 6.25, 2.48, 0.55, 0.04, C.coral)
    tx(s, 'Quote', 6.25, 2.88, 5.8, 1.78, data.quote, f(22, C.cream))
    tx(
      s,
      'Author',
      6.25,
      4.72,
      2.1,
      0.18,
      String(data.author ?? '').toUpperCase(),
      label(10.5, C.coral),
    )
    tx(s, 'Role', 6.25, 4.92, 2.2, 0.16, data.role, f(9, C.lightGray))
    return
  }

  if (slide.type === 'coralTimelineSlide') {
    tx(s, 'Section', 0.92, 0.48, 1.6, 0.18, data.section, label(9, C.coralText))
    tx(s, 'Title', 0.92, 0.78, 7.0, 1.88, data.title, d(56, C.ink))
    const axisY = 4.48
    const bubble = 0.92
    rect(s, 'Axis', 0.92, axisY, 11.5, 0.035, C.ink)
    ;(data.steps ?? []).forEach((step, i) => {
      const x = 1.95 + i * 2.36
      const up = i % 2 === 0
      const bubbleY = up ? axisY - bubble + 0.02 : axisY + 0.02
      p.box(s, nm(s, `Node${i}`), 'oval', x - bubble / 2, bubbleY, bubble, bubble, C.coral)
      outline(s, `Node${i}`, C.ink, '1pt')
      tx(s, `Phase${i}`, x - 0.38, bubbleY + 0.26, 0.76, 0.34, step.phase, d(22, C.white), 'center')
      tx(
        s,
        `StepTitle${i}`,
        x - 0.85,
        up ? axisY + 0.22 : axisY - 1.0,
        1.3,
        0.22,
        String(step.title ?? '').toUpperCase(),
        label(9, C.coralText),
        'center',
      )
      tx(
        s,
        `StepDesc${i}`,
        x - 0.85,
        up ? axisY + 0.47 : axisY - 0.75,
        1.7,
        0.76,
        step.desc,
        f(10.5, C.gray),
        'center',
      )
    })
    return
  }

  if (slide.type === 'coralTeamGridSlide') {
    p.ops.push({ op: 'set-slide-background', slide: s, fill: { type: 'solid', color: C.ink } })
    tx(s, 'Title', 0.92, 0.5, 6.4, 1.28, data.title, d(56, C.cream))
    tx(s, 'Subtitle', 0.92, 1.86, 3.9, 0.26, data.subtitle, f(10.5, C.lightGray))
    grid(4, 0.28, 0.92, 11.5).forEach((cell, i) => {
      const person = data.people?.[i] ?? {}
      rect(s, `Member${i}`, cell.x, 2.05, cell.w, 4.6, '232323')
      outline(s, `Member${i}`, '3A3A3A', '0.75pt')
      p.box(s, nm(s, `Avatar${i}`), 'oval', cell.x + cell.w / 2 - 0.46, 2.25, 0.92, 0.92, C.coral)
      tx(
        s,
        `Initials${i}`,
        cell.x + cell.w / 2 - 0.4,
        2.5,
        0.8,
        0.42,
        person.initials,
        d(26, C.white),
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
        f(12, C.cream, { bold: true }),
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
    rect(s, 'LeftPanel', 0, 0, 7.33, 7.5, C.coral)
    tx(s, 'Title', 0.74, 2.1, 5.0, 2.48, data.title, d(70, C.ink))
    tx(s, 'Subtitle', 0.74, 4.62, 5.85, 0.78, data.subtitle, f(15, C.ink))
    bottomZigzag(s, 'BottomZig', 0, 6.94, 7.33, 0.56)
    ;(data.contacts ?? []).forEach((contact, i) => {
      const y = 2.02 + i * 1.16
      tx(s, `ContactLabel${i}`, 8.07, y, 1.2, 0.16, contact.label, label(9, C.gray))
      tx(s, `ContactValue${i}`, 8.07, y + 0.26, 4.2, 0.58, contact.value, d(28, C.ink))
    })
    ;(data.socials ?? []).forEach((soc, i) => {
      const x = 8.07 + i * 0.55
      rect(s, `Social${i}`, x, 5.92, 0.41, 0.41, C.cream)
      outline(s, `Social${i}`, C.ink, '0.75pt')
      tx(s, `SocialText${i}`, x, 6.03, 0.41, 0.16, soc, label(8.5, C.ink), 'center')
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
  return { patch: { schemaVersion: 'pptx-patch/v1', ops: ctx.p.ops }, warnings }
}
