import { createOps, nm } from './core-primitives.kit.mjs'

export const C = {
  paper: 'FAF1E2',
  paperD: 'F2E5CF',
  paperVD: 'E8D7B6',
  ink: 'B53D2A',
  inkDeep: '8E2D1F',
  ruleSoft: 'DEC0A5',
  rulePale: 'EBD8BD',
}

const FONT_DISPLAY = 'Bricolage Grotesque'
const FONT_BODY = 'Fraunces'

const f = (size, color = C.ink, extra = {}) => ({
  name: extra.name ?? FONT_BODY,
  size: `${size}pt`,
  color,
  ...(extra.bold ? { bold: true } : {}),
  ...(extra.italic ? { italic: true } : {}),
})
const d = (size, color = C.ink, extra = {}) =>
  f(size, color, { name: FONT_DISPLAY, bold: true, ...extra })
const serif = (size, color = C.ink, extra = {}) => f(size, color, { italic: true, ...extra })

function makeOps() {
  const p = createOps({
    textbox: { marginTop: '0in', marginBottom: '0in', marginLeft: '0in', marginRight: '0in' },
  })

  const tx = (s, base, x, y, w, h, text, font, align) =>
    p.tx(s, nm(s, base), x, y, w, h, String(text ?? ''), font, align)
  const paragraph = (s, base, format, paragraphIndex = 0) =>
    p.ops.push({
      op: 'set-paragraph-format',
      slide: s,
      shape: { name: nm(s, base) },
      paragraph: paragraphIndex,
      ...format,
    })
  const rect = (s, base, x, y, w, h, fill = C.paper, line = C.ink, width = '1pt') => {
    p.shape(s, nm(s, base), 'rectangle', x, y, w, h)
    p.fill(s, nm(s, base), fill)
    if (line) p.setLine(s, nm(s, base), line, width)
    else p.noLine(s, nm(s, base))
  }
  const oval = (s, base, x, y, w, h, fill = C.paper, line = C.ink, width = '1pt') => {
    p.shape(s, nm(s, base), 'oval', x, y, w, h)
    p.fill(s, nm(s, base), fill)
    p.setLine(s, nm(s, base), line, width)
  }
  const rule = (s, base, x, y, w, color = C.ink) => rect(s, base, x, y, w, 0.015, color, null)
  const pill = (s, base, x, y, w, text, size = 13) => {
    p.shape(s, nm(s, `${base}Box`), 'rounded-rectangle', x, y, w, 0.38)
    p.fill(s, nm(s, `${base}Box`), C.paper)
    p.setLine(s, nm(s, `${base}Box`), C.ink, '1pt')
    tx(s, `${base}Text`, x + 0.06, y + 0.085, w - 0.12, 0.22, text, serif(size), 'center')
  }
  const tag = (s, base, x, y, w, text, size = 12) => {
    rect(s, `${base}Box`, x, y, w, 0.34, C.paper, C.ink, '1pt')
    tx(s, `${base}Text`, x + 0.06, y + 0.08, w - 0.12, 0.2, text, serif(size), 'center')
  }
  const pageNum = (s, total) =>
    tx(
      s,
      'PageNum',
      11.78,
      6.82,
      0.9,
      0.18,
      `${String(s + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`,
      serif(10.5),
      'right',
    )
  const texture = () => {}
  const chrome = (s, total) => {
    texture(s)
    pageNum(s, total)
  }
  return { p, tx, paragraph, rect, oval, rule, pill, tag, chrome }
}

function renderCover(ctx, s, data, total) {
  const { tx, paragraph, oval, pill, rule, chrome } = ctx
  tx(s, 'EditionLabel', 0.96, 0.75, 0.38, 0.28, data.edition, serif(12), 'center')
  oval(s, 'EditionBadge', 0.88, 0.63, 0.44, 0.44)
  tx(s, 'EditionText', 1.48, 0.72, 2.65, 0.32, data.editionLabel, serif(15.5))
  tx(s, 'Title', 0.86, 1.16, 7.25, 1.68, data.title, d(48))
  paragraph(s, 'Title', { lineSpacing: 1.12 })
  pill(s, 'Pill0', 0.9, 2.9, 1.16, data.pills[0])
  tx(s, 'PillDivider', 2.16, 2.95, 0.2, 0.24, '|', serif(14), 'center')
  pill(s, 'Pill1', 2.42, 2.9, 1.52, data.pills[1])
  tx(s, 'Stats', 0.9, 3.6, 4.05, 0.68, `${data.stat}\n${data.statNote}`, serif(13.2))
  tx(s, 'Tagline', 0.9, 4.62, 3.4, 0.32, data.tagline, serif(17))
  tx(s, 'Desc', 0.9, 5.04, 4.7, 0.76, data.description, serif(12.8))
  if (data.bigEdition) {
    tx(s, 'BigEdition', 8.55, 1.92, 3.42, 1.05, data.bigEdition, serif(72), 'right')
    if (data.bigLabel)
      tx(s, 'BigLabel', 8.72, 3.18, 3.35, 0.25, data.bigLabel.toUpperCase(), d(11.2), 'right')
    if (data.bigLabel || data.bigMeta) rule(s, 'BigRule', 8.78, 3.68, 3.28, C.ink)
    if (data.bigMeta) tx(s, 'BigMeta', 8.25, 3.96, 3.8, 0.72, data.bigMeta, serif(13.5), 'right')
  }
  chrome(s, total)
}

function renderManifesto(ctx, s, data, total) {
  const { tx, rule, chrome } = ctx
  tx(s, 'Mark', 1.0, 0.78, 0.28, 0.28, data.mark, serif(18), 'center')
  tx(s, 'Eyebrow', 1.35, 0.82, 2.6, 0.18, data.eyebrow, serif(10.5))
  tx(s, 'Title', 0.98, 1.42, 5.35, 2.28, data.title, d(48))
  rule(s, 'TopRule', 6.25, 1.28, 5.75, C.ink)
  data.paragraphs.forEach((para, i) =>
    tx(s, `Para${i}`, 6.18, 1.58 + i * 1.18, 5.86, 0.92, para, serif(14.4)),
  )
  rule(s, 'SigRule', 6.25, 5.18, 5.75, C.ruleSoft)
  tx(s, 'Signature', 6.25, 5.42, 1.9, 0.24, data.signature, serif(15.5))
  tx(s, 'Source', 6.25, 5.75, 4.7, 0.22, data.source, serif(10.5))
  chrome(s, total)
}

function renderIndex(ctx, s, data, total) {
  const { tx, rect, rule, chrome } = ctx
  tx(s, 'Title', 0.78, 0.72, 7.7, 0.64, data.title, d(37))
  tx(s, 'Subtitle', 9.4, 0.88, 2.6, 0.18, data.subtitle, serif(10.5), 'right')
  const cards = [
    { x: 0.78, y: 1.72, w: 3.72 },
    { x: 4.8, y: 1.72, w: 3.72 },
    { x: 8.82, y: 1.72, w: 3.72 },
  ]
  data.cards.forEach((card, i) => {
    const g = cards[i]
    rect(s, `Card${i}`, g.x, g.y, g.w, 4.52, C.paper, C.ink, '1pt')
    tx(s, `CardNo${i}`, g.x + 0.25, g.y + 0.28, 0.8, 0.16, card.no, serif(10.5))
    tx(s, `CardCity${i}`, g.x + g.w - 1.5, g.y + 0.28, 1.2, 0.16, card.city, serif(10.5), 'right')
    rule(s, `CardRule${i}`, g.x + 0.25, g.y + 0.7, g.w - 0.5, C.ruleSoft)
    tx(s, `CardTitle${i}`, g.x + 0.25, g.y + 1.06, g.w - 0.5, 0.92, card.title, d(24))
    tx(s, `CardText${i}`, g.x + 0.25, g.y + 2.15, g.w - 0.52, 1.25, card.text, serif(11.1))
    rule(s, `CardBottomRule${i}`, g.x + 0.25, g.y + 3.78, g.w - 0.5, C.ruleSoft)
    tx(s, `CardMeta0${i}`, g.x + 0.25, g.y + 4.05, 1.2, 0.16, card.meta[0], serif(10.2))
    tx(
      s,
      `CardMeta1${i}`,
      g.x + g.w - 1.65,
      g.y + 4.05,
      1.4,
      0.16,
      card.meta[1],
      serif(10.2),
      'right',
    )
  })
  chrome(s, total)
}

function renderFeatured(ctx, s, data, total) {
  const { tx, oval, pill, rect, rule, chrome } = ctx
  oval(s, 'EditionBadge', 0.9, 0.77, 0.44, 0.44)
  tx(s, 'EditionText', 0.98, 0.86, 0.28, 0.24, data.edition, serif(12), 'center')
  tx(s, 'Eyebrow', 1.54, 0.91, 2.7, 0.16, data.eyebrow, serif(10.5))
  tx(s, 'Title', 0.86, 1.56, 5.4, 1.42, data.title, d(51))
  tx(s, 'Body', 0.92, 3.28, 5.1, 1.08, data.body, serif(14.3))
  pill(s, 'Pill0', 0.92, 4.72, 2.1, data.pills[0], 11.5)
  pill(s, 'Pill1', 3.25, 4.72, 1.72, data.pills[1], 11.5)
  rect(s, 'InfoCard', 7.25, 1.12, 4.88, 4.78, C.paper, C.ink, '1pt')
  data.details.forEach((row, i) => {
    const y = 1.45 + i * 0.82
    tx(s, `InfoKey${i}`, 7.58, y, 1.18, 0.16, row[0].toUpperCase(), serif(9.3, C.inkDeep))
    tx(s, `InfoValue${i}`, 8.72, y - 0.04, 3.05, 0.4, row[1], d(i === 4 ? 20 : 14.2))
    if (i < data.details.length - 1) rule(s, `InfoRule${i}`, 7.58, y + 0.48, 4.23, C.ruleSoft)
  })
  chrome(s, total)
}

function renderMenu(ctx, s, data, total) {
  const { tx, rule, chrome } = ctx
  tx(s, 'Title', 0.85, 0.63, 8.2, 0.72, data.title, d(31))
  tx(s, 'Subtitle', 10.0, 0.85, 2.15, 0.18, data.subtitle, serif(10.5), 'right')
  rule(s, 'TopRule', 0.86, 1.5, 11.42, C.ink)
  data.items.forEach((item, i) => {
    const y = 1.78 + i * 0.92
    tx(s, `No${i}`, 0.9, y + 0.05, 0.45, 0.18, item[0], serif(11.5))
    tx(s, `Name${i}`, 1.65, y, 3.55, 0.34, item[1], d(15.5))
    tx(s, `Desc${i}`, 5.15, y + 0.02, 4.6, 0.34, item[2], serif(10.9))
    tx(s, `Pairing${i}`, 10.6, y + 0.04, 1.45, 0.18, item[3], serif(10.3), 'right')
    rule(s, `RowRule${i}`, 0.86, y + 0.66, 11.42, C.ruleSoft)
  })
  chrome(s, total)
}

function renderQuote(ctx, s, data, total) {
  const { tx, tag, rule, chrome } = ctx
  tag(s, 'QuoteTag', 5.48, 1.18, 2.35, data.label, 11)
  tx(s, 'Quote', 1.72, 2.02, 9.9, 2.42, data.quote, d(36), 'center')
  rule(s, 'QuoteRule', 5.08, 4.58, 3.2, C.ink)
  tx(s, 'Author', 5.25, 4.94, 2.85, 0.22, data.author, serif(13.2), 'center')
  tx(s, 'Role', 4.7, 5.26, 3.9, 0.18, data.role, serif(10.4), 'center')
  chrome(s, total)
}

function renderCalendar(ctx, s, data, total) {
  const { tx, rect, rule, chrome } = ctx
  tx(s, 'Title', 0.85, 0.7, 5.2, 0.58, data.title, d(37))
  tx(s, 'Subtitle', 8.9, 0.88, 3.2, 0.18, data.subtitle, serif(10.5), 'right')
  const x = [0.9, 1.78, 3.18, 7.52, 9.72]
  const w = [0.72, 1.18, 3.98, 1.86, 1.72]
  rule(s, 'HeaderRuleTop', 0.9, 1.52, 11.35, C.ink)
  data.columns.forEach((col, i) =>
    tx(s, `Head${i}`, x[i], 1.74, w[i], 0.16, col, serif(9.5, C.inkDeep)),
  )
  rule(s, 'HeaderRule', 0.9, 2.04, 11.35, C.ruleSoft)
  data.rows.forEach((row, r) => {
    const y = 2.28 + r * 0.63
    row.forEach((cell, i) => {
      if (i === 4) {
        rect(s, `StatusBox${r}`, x[i], y - 0.04, 1.44, 0.32, C.paper, C.ink, '0.75pt')
        tx(s, `Cell${r}_${i}`, x[i] + 0.06, y + 0.03, 1.32, 0.16, cell, serif(8.5), 'center')
      } else {
        tx(
          s,
          `Cell${r}_${i}`,
          x[i],
          y - 0.02,
          w[i],
          i === 2 ? 0.34 : 0.22,
          cell,
          i === 0 ? d(12) : serif(9.2),
        )
      }
    })
    rule(s, `RowRule${r}`, 0.9, y + 0.42, 11.35, C.ruleSoft)
  })
  chrome(s, total)
}

function renderClosing(ctx, s, data, total) {
  const { tx, pill, rule, chrome } = ctx
  tx(s, 'Mark', 1.0, 0.78, 0.28, 0.28, data.mark, serif(18), 'center')
  tx(s, 'Eyebrow', 1.35, 0.82, 2.6, 0.18, data.eyebrow, serif(10.5))
  tx(s, 'Title', 0.92, 1.62, 6.2, 1.78, data.title, d(49))
  tx(s, 'Body', 0.96, 3.45, 6.0, 0.8, data.body, serif(14.1))
  tx(s, 'Site', 0.96, 4.68, 1.7, 0.22, data.site, serif(13))
  pill(s, 'Cta', 3.0, 4.55, 1.92, data.cta, 11.5)
  rule(s, 'FooterRule', 0.92, 5.78, 11.2, C.ink)
  data.footer.forEach((item, i) => {
    const x = 0.96 + i * 3.85
    tx(s, `FooterLabel${i}`, x, 6.08, 1.2, 0.16, item[0], serif(9.7, C.inkDeep))
    tx(s, `FooterValue${i}`, x, 6.34, 3.1, 0.35, item[1], serif(9.7))
  })
  chrome(s, total)
}

const renderers = {
  longTableCoverSlide: renderCover,
  longTableManifestoSlide: renderManifesto,
  longTableIndexSlide: renderIndex,
  longTableFeaturedSlide: renderFeatured,
  longTableMenuSlide: renderMenu,
  longTableQuoteSlide: renderQuote,
  longTableCalendarSlide: renderCalendar,
  longTableClosingSlide: renderClosing,
}

export function createDeck(input) {
  const ctx = makeOps()
  const warnings = []
  const slides = input.slides ?? []
  const total = slides.length

  slides.forEach((slide, index) => {
    const renderer = renderers[slide.type]
    if (!renderer) {
      warnings.push(`Unknown long-table slide type "${slide.type}" at index ${index}`)
      return
    }
    ctx.p.addSlide(index, C.paper)
    renderer(ctx, index, slide.data ?? {}, total)
  })

  return { patch: { schemaVersion: 1, ops: ctx.p.ops }, warnings }
}
