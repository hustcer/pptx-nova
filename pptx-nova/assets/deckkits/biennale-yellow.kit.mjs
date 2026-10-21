// biennale-yellow.kit.mjs - Editorial biennale yellow DeckKit
// version: 0.2.0
import { SLIDE_H, SLIDE_W, createOps, nm } from './core-primitives.kit.mjs'
import {
  loadDesignContract,
  writeDesignText,
  designTheme,
  resolveEvidenceLayout,
  finishDesign,
} from './design-contract.mjs'
import { renderEvidence } from './evidence-components.mjs'

export const DESIGN = loadDesignContract('biennale-yellow')
export const C = DESIGN.colors

export const FONT_DISPLAY = DESIGN.fonts.display.latin
export const FONT_BODY = DESIGN.fonts.body.latin
export const FONT_MONO = DESIGN.fonts.mono.latin

const str = (value) => String(value ?? '')
const list = (value) => (Array.isArray(value) ? value : value ? [value] : [])
const objectList = (value, max, path) => {
  const values = Array.isArray(value) ? value : []
  if (values.length > max)
    throw new Error(`${path}: ${values.length} items exceeds layout limit ${max}`)
  return values
}
const pad2 = (value) => String(value).padStart(2, '0')

function makeOps() {
  const p = createOps({ textbox: DESIGN.textFrame })

  let pageType
  const setPageType = (type) => {
    pageType = type
  }
  const text = (s, base, value) => writeDesignText(p, DESIGN, pageType, s, base, str(value))

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

  const pageNum = (s, total) => text(s, 'PageNum', `${pad2(s + 1)} / ${pad2(total)}`)

  const footerBand = (s, items) => {
    const layout = DESIGN.legacyLayouts[pageType]
    const y = layout.footer.ruleY
    objectList(items, 4, 'footerItems').forEach((item, i) => {
      const [x, , w] = layout.slots['FootLabel{i}'].frames[i]
      line(s, `FootRule${i}`, x, y, w, 0.008, C.ink)
      text(s, `FootLabel${i}`, item.label)
      text(s, `FootText${i}`, item.text)
    })
  }

  const add = (s) => p.addSlide(s, C.paper)

  return {
    p,
    setPageType,
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
    text(s, 'DateRail', data.dateRange)
    text(s, 'Title', data.title)
    text(s, 'Subline', data.subline)
    footerBand(s, data.footerItems)
    pageNum(s, total)
  }

  const manifesto = (s, data) => {
    add(s)
    hazeOval(s, 'Haze', 6.75, 3.75, 8.8, 4.3, C.sunSoft, 0.14)
    emberBloom(s, 'Ember', 1.3, 6.65, 2.6, 1.4, 0.06)
    text(s, 'Quote', data.quote)
    text(s, 'Attribution', data.attribution)
    pageNum(s, total)
  }

  const programme = (s, data) => {
    add(s)
    p.box(s, nm(s, 'LeftPanel'), 'rectangle', 0, 0, SLIDE_W / 2, SLIDE_H, C.sun)
    text(s, 'Kicker', data.kicker)
    text(s, 'Word', data.word)
    text(s, 'Description', data.description)
    text(s, 'Head', data.headLabel)
    line(s, 'HeadRule', 7.23, 0.82, 5.6, 0.008, C.ink)
    objectList(data.strands, 5, 'strands').forEach((item, i) => {
      const y = 0.92 + i * 1.05
      text(s, `StrandNum${i}`, item.num)
      text(s, `StrandTitle${i}`, item.title)
      text(s, `StrandBody${i}`, item.body)
      line(
        s,
        `StrandRule${i}`,
        7.23,
        y + DESIGN.legacyLayouts.biennaleProgrammeSlide.rowRuleOffset,
        5.55,
        0.006,
        C.ink,
        0.2,
      )
    })
    pageNum(s, total)
  }

  const chapter = (s, data) => {
    add(s)
    hazeOval(s, 'CornerSun', 0.7, 0.55, 2.9, 1.6, C.sunSoft, 0.12)
    emberBloom(s, 'CornerEmber', 11.2, 6.05, 2.0, 1.0, 0.04)
    text(s, 'Rail', data.rail)
    text(s, 'Number', data.number)
    text(s, 'Title', data.title)
    text(s, 'Lede', data.lede)
    pageNum(s, total)
  }

  const dataSlide = (s, data) => {
    add(s)
    hazeOval(s, 'TopBloom', 11.6, 0.85, 3.5, 1.8, C.sunSoft, 0.1)
    text(s, 'Title', data.title)
    text(s, 'Label', data.label)
    line(s, 'HeadRule', 0.53, 1.12, 12.27, 0.008, C.ink)
    objectList(data.stats, 2, 'stats').forEach((item, i) => {
      text(s, `Stat${i}`, `${str(item.value)}${str(item.suffix)}`)
      text(s, `StatLabel${i}`, item.label)
      text(s, `StatDesc${i}`, item.description)
    })
    objectList(data.bars, 6, 'bars').forEach((item, i) => {
      const y = 3.62 + i * 0.22
      const pct = Number(item.pct)
      if (!Number.isFinite(pct) || pct < 0 || pct > 1)
        throw new Error(`bars[${i}].pct must be 0..1`)
      text(s, `BarYear${i}`, item.label)
      if (pct === 0) {
        /* zero remains a label with no bar */
      } else if (item.accent) strokeRect(s, `Bar${i}`, 6.55, y, 5.35 * pct, 0.13, C.sun)
      else p.box(s, nm(s, `Bar${i}`), 'rectangle', 6.55, y, 5.35 * pct, 0.13, C.ink)
      text(s, `BarVal${i}`, item.value)
    })
    pageNum(s, total)
  }

  const quote = (s, data) => {
    add(s)
    p.box(s, nm(s, 'YellowPanel'), 'rectangle', 10.4, 0, 2.93, SLIDE_H, C.sun)
    hazeOval(s, 'LeftBloom', 1.1, 6.6, 3.2, 1.7, C.sunSoft, 0.08)
    text(s, 'Kicker', data.kicker)
    text(s, 'Quote', data.quote)
    line(s, 'AttrRule', 0.53, 5.18, 8.0, 0.008, C.ink)
    text(s, 'Author', data.author)
    text(s, 'Role', data.role)
    p.box(s, nm(s, 'DotA'), 'oval', 11.85, 6.33, 0.08, 0.08, C.ink)
    p.box(s, nm(s, 'DotB'), 'oval', 12.0, 6.33, 0.08, 0.08, C.ink)
    pageNum(s, total)
  }

  const calendar = (s, data) => {
    add(s)
    hazeOval(s, 'TopBloom', 12.0, 0.2, 3.4, 1.7, C.sunSoft, 0.08)
    text(s, 'Title', data.title)
    text(s, 'Label', data.label)
    line(s, 'HeadRule', 0.53, 1.14, 12.27, 0.008, C.ink)
    list(data.columns)
      .slice(0, 4)
      .forEach((label, i) => {
        text(s, `Col${i}`, label)
      })
    line(s, 'ColRule', 0.53, 1.62, 12.27, 0.008, C.ink)
    objectList(data.rows, 8, 'rows').forEach((row, i) => {
      const y = 1.74 + i * 0.45
      text(s, `Date${i}`, row.date)
      text(s, `Event${i}`, row.title)
      text(s, `Venue${i}`, row.venue)
      text(s, `Length${i}`, row.length)
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
    text(s, 'Kicker', data.kicker)
    text(s, 'Title', data.title)
    footerBand(s, data.footerItems)
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
  const layouts = []
  const evidenceHistory = []
  api.p.ops.push(designTheme(DESIGN))

  slides.forEach((slide, s) => {
    if (slide.type === DESIGN.evidence.slideType) {
      const resolved = resolveEvidenceLayout(DESIGN, slide, evidenceHistory)
      renderEvidence(api.p, DESIGN, s, slide, resolved, slides.length)
      evidenceHistory.push({ layoutId: resolved.layoutId, fingerprint: resolved.fingerprint })
      layouts.push({ slide: s, slideType: slide.type, ...resolved })
      return
    }
    const fn = dispatch[slide.type]
    if (!fn) {
      throw new Error(`Unknown slide type "${slide.type}" at index ${s}`)
    }
    api.setPageType(slide.type)
    fn(s, slide.data ?? {}, { path: `slides[${s}].data`, slideType: slide.type })
  })

  return finishDesign(DESIGN, content, { schemaVersion: 'pptx-patch/v1', ops: api.p.ops }, layouts)
}
