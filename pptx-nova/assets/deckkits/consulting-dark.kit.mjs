// consulting-dark.kit.mjs — 深墨蓝咨询风格 DeckKit
// version: 0.1.0
import {
  createOps,
  nm,
  grid,
  SLIDE_W,
  normalizeHex,
  readableTextOn,
} from './core-primitives.kit.mjs'

// ── Palette ──────────────────────────────────────────────────
const C = {
  primary: 'C8583A',
  primaryDk: 'A4452C',
  primaryDp: '7E3420',
  secondary: '2E7C8A',
  blue: '3C6FA6',
  green: '3E9D6E',
  purple: '7B6AAE',
  amber: 'CF9B43',
  amberDk: '8A621F',
  warn: 'BE4632',
  heroAccent: 'F2A36E',
  heroBg: '0E2638',
  heroPanel: '15334A',
  heroLine: '20435E',
  heroDot: '193A53',
  textPri: '1C2733',
  textSec: '55636F',
  textMut: '93A1AD',
  pageBg: 'FFFFFF',
  surface: 'F5F6F7',
  surfaceAlt: 'ECEEF1',
  divider: 'E3E6E9',
  onHero: 'FFFFFF',
  heroMut: 'AEC0CE',
  heroMut2: '7C92A4',
  posBg: 'E7F2EC',
  posTxt: '2E7D4F',
  negBg: 'F7E8E3',
  negTxt: 'B4472F',
  white: 'FFFFFF',
}
const ACCENTS = [C.primary, C.blue, C.green, C.purple, C.amber, C.secondary]
const FONT_CN = 'PingFang SC'
const FONT_EN = 'Inter'
const MX = 0.7
const CW = SLIDE_W - MX * 2

const ACCESSIBLE_ACCENT = {
  [C.primary]: C.primaryDk,
  [C.secondary]: '256B78',
  [C.green]: C.posTxt,
  [C.amber]: C.amberDk,
}

function accessibleAccent(accent) {
  const key = normalizeHex(accent)
  return key ? (ACCESSIBLE_ACCENT[key] ?? key) : C.primaryDk
}

function accentTextOnLight(accent, background = C.white) {
  return readableTextOn(background, accessibleAccent(accent), [C.textPri, C.textSec])
}

function accentBadge(accent) {
  const fill = accessibleAccent(accent)
  return { fill, text: readableTextOn(fill, C.white, [C.textPri, C.heroBg]) }
}

// ── Chrome helpers ────────────────────────────────────────────
function makeChrome({ tx, box }) {
  const pageHeader = (s, eyebrow, title) => {
    tx(s, nm(s, 'Eyebrow'), MX, 0.52, 9, 0.3, eyebrow, {
      name: FONT_EN,
      size: '12pt',
      bold: true,
      color: C.primaryDk,
    })
    tx(s, nm(s, 'Title'), MX, 0.9, CW, 0.68, title, {
      name: FONT_CN,
      size: '29pt',
      bold: true,
      color: C.textPri,
    })
    box(s, nm(s, 'Rule'), 'rectangle', MX, 1.66, CW, 0.016, C.divider)
    box(s, nm(s, 'RuleAccent'), 'rectangle', MX, 1.655, 1.05, 0.028, C.primary)
    return 1.98
  }
  const pageFooter = (s, total, footerLeft = '') => {
    tx(s, nm(s, 'FootL'), MX, 6.84, 4.5, 0.24, footerLeft, {
      name: FONT_CN,
      size: '10pt',
      color: C.textSec,
    })
    tx(
      s,
      nm(s, 'PageNum'),
      5.5,
      6.84,
      2.333,
      0.24,
      `${String(s + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`,
      { name: FONT_EN, size: '10pt', color: C.textSec },
      'center',
    )
  }
  const heroDots = (s) => {
    const dots = [
      [11.7, 0.6, 0.16, C.primary],
      [12.5, 1.5, 0.4, C.heroDot],
      [10.6, 1.0, 0.22, C.heroDot],
      [0.8, 6.0, 0.5, C.heroDot],
      [0.7, 0.55, 0.18, C.primary],
      [12.2, 5.6, 0.55, C.heroDot],
      [11.4, 6.6, 0.2, C.heroDot],
      [9.6, 0.4, 0.1, C.secondary],
    ]
    dots.forEach(([x, y, d, col], i) => box(s, nm(s, `Dot${i}`), 'oval', x, y, d, d, col))
  }
  return { pageHeader, pageFooter, heroDots }
}

// ── Component helpers ─────────────────────────────────────────
function makeComponents({ tx, box, card }) {
  // Body copy uses a wider text box than short title anchors in dense cards.
  const cardBodyTextBox = (w) => {
    const sideInset = w < 2 ? 0.14 : 0.18
    return { xInset: sideInset, wInset: sideInset + 0.12 }
  }

  const kpiCard = (s, base, x, y, w, h, accent, value, label, note) => {
    const valueColor = accentTextOnLight(accent, C.surface)
    card(s, nm(s, `${base}Bg`), x, y, w, h, C.surface)
    box(s, nm(s, `${base}Top`), 'rounded-rectangle', x, y, w, 0.09, accent)
    tx(s, nm(s, `${base}Val`), x + 0.28, y + 0.32, w - 0.56, 0.72, value, {
      name: FONT_EN,
      size: '40pt',
      bold: true,
      color: valueColor,
    })
    tx(s, nm(s, `${base}Lab`), x + 0.28, y + 1.12, w - 0.56, 0.34, label, {
      name: FONT_CN,
      size: '13pt',
      bold: true,
      color: C.textPri,
    })
    tx(s, nm(s, `${base}Note`), x + 0.28, y + 1.48, w - 0.5, 0.42, note, {
      name: FONT_CN,
      size: '10.5pt',
      color: C.textSec,
    })
  }
  const custCard = (s, base, x, y, w, h, accent, idx, name, items) => {
    const body = cardBodyTextBox(w)
    const badge = accentBadge(accent)
    card(s, nm(s, `${base}Bg`), x, y, w, h, C.surface)
    box(s, nm(s, `${base}Top`), 'rounded-rectangle', x, y, w, 0.09, accent)
    box(s, nm(s, `${base}Dot`), 'oval', x + 0.28, y + 0.34, 0.5, 0.5, badge.fill)
    tx(
      s,
      nm(s, `${base}Num`),
      x + 0.28,
      y + 0.42,
      0.5,
      0.36,
      idx,
      { name: FONT_EN, size: '15pt', bold: true, color: badge.text },
      'center',
    )
    tx(s, nm(s, `${base}Name`), x + 0.28, y + 1.0, w - 0.56, 0.66, name, {
      name: FONT_CN,
      size: '14.5pt',
      bold: true,
      color: C.textPri,
    })
    tx(
      s,
      nm(s, `${base}Items`),
      x + body.xInset,
      y + 1.74,
      w - body.wInset,
      h - 1.95,
      items.map((t) => `· ${t}`).join('\n'),
      { name: FONT_CN, size: '11pt', color: C.textSec },
    )
  }
  return { kpiCard, custCard, cardBodyTextBox }
}

// ── Page-type functions ───────────────────────────────────────
function makePageTypes(
  { ops, tx, box, card, fillText, addSlide },
  { pageHeader, pageFooter, heroDots },
  { kpiCard, custCard, cardBodyTextBox },
  total,
  meta = {},
) {
  const footerLeft = (data) => data.footerLeft ?? meta.footerLeft ?? ''

  // slide 0: cover (deep hero)
  function heroSlide(s, data) {
    addSlide(s, C.heroBg)
    heroDots(s)
    tx(s, nm(s, 'Eyebrow'), 1.0, 1.62, 9, 0.34, data.eyebrow ?? '', {
      name: FONT_EN,
      size: '13pt',
      bold: true,
      color: C.heroAccent,
    })
    box(s, nm(s, 'Tick'), 'rectangle', 1.02, 2.06, 0.62, 0.045, C.primary)
    tx(s, nm(s, 'Title'), 1.0, 2.4, 11.3, 2.15, data.title, {
      name: FONT_CN,
      size: '40pt',
      bold: true,
      color: C.onHero,
    })
    tx(s, nm(s, 'Sub'), 1.0, 4.75, 11.2, 0.78, data.sub, {
      name: FONT_CN,
      size: '18pt',
      color: C.heroMut,
    })
    tx(s, nm(s, 'Tag'), 1.0, 5.62, 11.2, 0.4, data.tag, {
      name: FONT_CN,
      size: '13pt',
      color: C.heroMut2,
    })
    box(s, nm(s, 'Divider'), 'rectangle', 1.0, 6.42, 11.333, 0.014, C.heroLine)
    tx(s, nm(s, 'InfoL'), 1.0, 6.55, 6.0, 0.3, data.infoL, {
      name: FONT_CN,
      size: '11pt',
      color: C.heroMut,
    })
    tx(
      s,
      nm(s, 'InfoR'),
      7.333,
      6.55,
      5.0,
      0.3,
      data.infoR,
      { name: FONT_EN, size: '10.5pt', bold: true, color: C.heroMut2 },
      'right',
    )
  }

  // slide 1: profile (timeline + highlight cards)
  function profileTableSlide(s, data) {
    addSlide(s)
    pageHeader(s, data.eyebrow, data.title)
    pageFooter(s, total, footerLeft(data))
    const rows = data.rows
    const lineX = 1.02
    const top = 2.34
    const step = 0.92
    box(
      s,
      nm(s, 'TLine'),
      'rectangle',
      lineX,
      top + 0.06,
      0.024,
      step * (rows.length - 1),
      C.divider,
    )
    rows.forEach(([year, comp, role], i) => {
      const y = top + i * step
      box(
        s,
        nm(s, `Dot${i}`),
        'oval',
        lineX - 0.085,
        y,
        0.2,
        0.2,
        i === 0 ? C.primary : C.secondary,
      )
      tx(s, nm(s, `Yr${i}`), 1.5, y - 0.04, 2.05, 0.3, year, {
        name: FONT_EN,
        size: '12pt',
        bold: true,
        color: C.primaryDk,
      })
      tx(s, nm(s, `Co${i}`), 3.62, y - 0.06, 3.45, 0.32, comp, {
        name: FONT_CN,
        size: '14.5pt',
        bold: true,
        color: C.textPri,
      })
      tx(s, nm(s, `Ro${i}`), 3.62, y + 0.3, 3.45, 0.3, role, {
        name: FONT_CN,
        size: '11pt',
        color: C.textSec,
      })
    })
    const cx = 7.65
    const cw = 4.97
    const hiH = 1.08
    const hiStep = 1.2
    ;(data.cards ?? []).forEach(([accent, num, label, desc], i) => {
      const y = 2.1 + i * hiStep
      card(s, nm(s, `Hi${i}Bg`), cx, y, cw, hiH)
      box(s, nm(s, `Hi${i}Rule`), 'rectangle', cx, y + 0.14, 0.07, hiH - 0.28, accent)
      tx(s, nm(s, `Hi${i}Num`), cx + 0.32, y + 0.23, 1.85, 0.56, num, {
        name: FONT_EN,
        size: '29pt',
        bold: true,
        color: accentTextOnLight(accent),
      })
      tx(s, nm(s, `Hi${i}Lab`), cx + 2.15, y + 0.24, cw - 2.45, 0.32, label, {
        name: FONT_CN,
        size: '13pt',
        bold: true,
        color: C.textPri,
      })
      tx(s, nm(s, `Hi${i}Desc`), cx + 2.15, y + 0.6, cw - 2.45, 0.34, desc, {
        name: FONT_CN,
        size: '9.5pt',
        color: C.textSec,
      })
    })
  }

  // slide 2: value/achievement (2×2 cards)
  function kpiRowSlide(s, data) {
    addSlide(s)
    pageHeader(s, data.eyebrow, data.title)
    pageFooter(s, total, footerLeft(data))
    const items = data.items
    const cells = grid(2, 0.35)
    const cardH = 1.92
    items.forEach(([accent, idx, title, body, badge], i) => {
      const { x, w } = cells[i % 2]
      const y = 2.05 + Math.floor(i / 2) * (cardH + 0.16)
      const badgeStyle = accentBadge(accent)
      card(s, nm(s, `A${i}Bg`), x, y, w, cardH)
      box(s, nm(s, `A${i}Top`), 'rounded-rectangle', x, y, w, 0.09, accent)
      box(s, nm(s, `A${i}Dot`), 'oval', x + 0.32, y + 0.36, 0.56, 0.56, badgeStyle.fill)
      tx(
        s,
        nm(s, `A${i}Num`),
        x + 0.32,
        y + 0.46,
        0.56,
        0.4,
        idx,
        { name: FONT_EN, size: '17pt', bold: true, color: badgeStyle.text },
        'center',
      )
      tx(s, nm(s, `A${i}T`), x + 1.08, y + 0.42, badge ? w - 3.0 : w - 1.35, 0.45, title, {
        name: FONT_CN,
        size: '17pt',
        bold: true,
        color: C.textPri,
      })
      tx(s, nm(s, `A${i}B`), x + 0.34, y + 1.04, w - 0.68, 0.8, body, {
        name: FONT_CN,
        size: '11.5pt',
        color: C.textSec,
      })
      if (badge)
        tx(
          s,
          nm(s, `A${i}Badge`),
          x + w - 1.7,
          y + 0.34,
          1.4,
          0.6,
          badge,
          { name: FONT_EN, size: '24pt', bold: true, color: accentTextOnLight(accent) },
          'right',
        )
    })
  }

  // slide 3: preview/product KPI row + feature panel
  function previewProductSlide(s, data) {
    addSlide(s)
    pageHeader(s, data.eyebrow, data.title)
    pageFooter(s, total, footerLeft(data))
    card(s, nm(s, 'Banner'), MX, 1.98, CW, 0.6, C.surfaceAlt, null)
    box(s, nm(s, 'BannerRule'), 'rectangle', MX, 2.08, 0.07, 0.4, C.primary)
    tx(s, nm(s, 'BannerTxt'), MX + 0.3, 2.12, CW - 0.6, 0.34, data.banner, {
      name: FONT_CN,
      size: '13.5pt',
      bold: true,
      color: C.textPri,
    })
    const cells = grid(4, 0.3)
    const ky = 2.78
    const kh = 1.95
    ;(data.kpis ?? []).forEach(([accent, val, lab, note], i) => {
      const { x, w } = cells[i]
      kpiCard(s, `K${i}`, x, ky, w, kh, accent, val, lab, note)
    })
    const py = 4.98
    card(s, nm(s, 'Cap'), MX, py, CW, 1.62, C.surface)
    box(s, nm(s, 'CapTop'), 'rounded-rectangle', MX, py, CW, 0.09, C.secondary)
    tx(s, nm(s, 'CapH'), MX + 0.32, py + 0.22, 5, 0.32, data.capHeader ?? '', {
      name: FONT_CN,
      size: '13pt',
      bold: true,
      color: accentTextOnLight(C.secondary, C.surface),
    })
    tx(
      s,
      nm(s, 'CapL'),
      MX + 0.32,
      py + 0.62,
      5.6,
      0.92,
      (data.capLeft ?? []).map((t) => `· ${t}`).join('\n'),
      { name: FONT_CN, size: '11pt', color: C.textSec },
    )
    tx(
      s,
      nm(s, 'CapR'),
      MX + 6.1,
      py + 0.62,
      5.5,
      0.92,
      (data.capRight ?? []).map((t) => `· ${t}`).join('\n'),
      { name: FONT_CN, size: '11pt', color: C.textSec },
    )
  }

  // slide 4: landscape (competitor cards + diff banner)
  function landscapeSlide(s, data) {
    addSlide(s)
    pageHeader(s, data.eyebrow, data.title)
    pageFooter(s, total, footerLeft(data))
    card(s, nm(s, 'Us'), MX, 2.0, CW, 1.2, C.heroBg, null)
    box(s, nm(s, 'UsRule'), 'rectangle', MX, 2.14, 0.08, 0.92, C.primary)
    tx(s, nm(s, 'UsLab'), MX + 0.34, 2.18, 4, 0.3, data.usLabel, {
      name: FONT_CN,
      size: '12pt',
      bold: true,
      color: C.heroAccent,
    })
    tx(s, nm(s, 'UsTitle'), MX + 0.34, 2.5, CW - 0.7, 0.4, data.usTitle, {
      name: FONT_CN,
      size: '15pt',
      bold: true,
      color: C.onHero,
    })
    tx(s, nm(s, 'UsSub'), MX + 0.34, 2.9, CW - 0.7, 0.28, data.usSub, {
      name: FONT_CN,
      size: '11pt',
      color: C.heroMut,
    })
    const cells = grid(3, 0.34)
    const cy = 3.45
    const ch = 2.55
    ;(data.comps ?? []).forEach(([accent, name, tag, pro, con], i) => {
      const { x, w } = cells[i]
      card(s, nm(s, `Cm${i}Bg`), x, cy, w, ch)
      box(s, nm(s, `Cm${i}Top`), 'rounded-rectangle', x, cy, w, 0.09, accent)
      tx(s, nm(s, `Cm${i}Name`), x + 0.28, cy + 0.3, w - 0.56, 0.5, name, {
        name: FONT_CN,
        size: '15pt',
        bold: true,
        color: C.textPri,
      })
      card(s, nm(s, `Cm${i}Tag`), x + 0.28, cy + 0.88, 1.9, 0.36, C.surfaceAlt, null)
      fillText(
        s,
        nm(s, `Cm${i}Tag`),
        tag,
        { name: FONT_CN, size: '10pt', bold: true, color: C.textSec },
        'center',
      )
      tx(s, nm(s, `Cm${i}Pro`), x + 0.28, cy + 1.36, w - 0.56, 0.34, `✓ ${pro}`, {
        name: FONT_CN,
        size: '11pt',
        bold: true,
        color: accentTextOnLight(C.green),
      })
      tx(s, nm(s, `Cm${i}Con`), x + 0.28, cy + 1.74, w - 0.5, 0.7, `局限：${con}`, {
        name: FONT_CN,
        size: '10.5pt',
        color: C.textSec,
      })
    })
    card(s, nm(s, 'Concl'), MX, 6.18, CW, 0.56, C.surfaceAlt, null)
    fillText(
      s,
      nm(s, 'Concl'),
      data.conclusion,
      { name: FONT_CN, size: '12.5pt', bold: true, color: C.primaryDk },
      'center',
    )
  }

  // slide 5/7/9: multi-card customer slide (N cols, generic)
  function multiCardSlide(s, data) {
    addSlide(s)
    pageHeader(s, data.eyebrow, data.title)
    pageFooter(s, total, footerLeft(data))
    tx(s, nm(s, 'Intro'), MX, 1.98, CW, 0.34, data.intro, {
      name: FONT_CN,
      size: '13pt',
      color: C.textSec,
    })
    const cols = data.cards.length
    const gap = cols === 5 ? 0.26 : 0.3
    const cells = grid(cols, gap)
    const cy = 2.5
    const ch = cols === 5 ? 3.9 : 3.85
    data.cards.forEach(([accent, idx, name, items], i) => {
      const { x, w } = cells[i]
      if (cols === 5) {
        const body = cardBodyTextBox(w)
        const badge = accentBadge(accent)
        card(s, nm(s, `Cu${i}Bg`), x, cy, w, ch, C.surface)
        box(s, nm(s, `Cu${i}Top`), 'rounded-rectangle', x, cy, w, 0.09, accent)
        box(s, nm(s, `Cu${i}Dot`), 'oval', x + 0.24, cy + 0.32, 0.46, 0.46, badge.fill)
        tx(
          s,
          nm(s, `Cu${i}Num`),
          x + 0.17,
          cy + 0.39,
          0.6,
          0.34,
          idx,
          { name: FONT_EN, size: '14pt', bold: true, color: badge.text },
          'center',
        )
        tx(s, nm(s, `Cu${i}Name`), x + 0.22, cy + 0.94, w - 0.44, 0.62, name, {
          name: FONT_CN,
          size: '13.5pt',
          bold: true,
          color: C.textPri,
        })
        tx(
          s,
          nm(s, `Cu${i}Items`),
          x + body.xInset,
          cy + 1.62,
          w - body.wInset,
          ch - 1.8,
          items.map((t) => `· ${t}`).join('\n'),
          { name: FONT_CN, size: '10.5pt', color: C.textSec },
        )
      } else {
        custCard(s, `Cu${i}`, x, cy, w, ch, accent, idx, name, items)
      }
    })
  }

  // slide 6: convert flow (source → engine → 4 outputs + feature panel)
  function convertFlowSlide(s, data) {
    addSlide(s)
    pageHeader(s, data.eyebrow, data.title)
    pageFooter(s, total, footerLeft(data))
    const fy = 2.35
    card(s, nm(s, 'Src'), MX, fy, 2.5, 2.05, C.heroBg, null)
    tx(
      s,
      nm(s, 'SrcT'),
      MX,
      fy + 0.55,
      2.5,
      0.6,
      data.srcLabel ?? '',
      { name: FONT_EN, size: '30pt', bold: true, color: C.onHero },
      'center',
    )
    tx(
      s,
      nm(s, 'SrcS'),
      MX,
      fy + 1.25,
      2.5,
      0.4,
      data.srcSub ?? '',
      { name: FONT_CN, size: '12pt', color: C.heroMut },
      'center',
    )
    box(s, nm(s, 'Arr1'), 'right-arrow', 3.4, fy + 0.78, 0.85, 0.5, C.primary)
    card(s, nm(s, 'Eng'), 4.45, fy, 2.85, 2.05, C.primaryDk, null)
    tx(
      s,
      nm(s, 'EngT'),
      4.45,
      fy + 0.42,
      2.85,
      0.5,
      data.engTitle ?? '',
      { name: FONT_CN, size: '19pt', bold: true, color: C.white },
      'center',
    )
    tx(
      s,
      nm(s, 'EngS'),
      4.55,
      fy + 1.0,
      2.65,
      0.85,
      data.engSub ?? '',
      { name: FONT_CN, size: '11.5pt', color: C.onHero },
      'center',
    )
    box(s, nm(s, 'Arr2'), 'right-arrow', 7.45, fy + 0.78, 0.85, 0.5, C.primary)
    const outs = data.outputs ?? []
    const ox = 8.5,
      ow = 2.0,
      oh = 0.95
    outs.forEach(([accent, t, d], i) => {
      const x = ox + (i % 2) * (ow + 0.13)
      const y = fy + Math.floor(i / 2) * (oh + 0.15)
      card(s, nm(s, `O${i}Bg`), x, y, ow, oh)
      box(s, nm(s, `O${i}Rule`), 'rectangle', x, y + 0.12, 0.06, oh - 0.24, accent)
      tx(s, nm(s, `O${i}T`), x + 0.22, y + 0.16, ow - 0.34, 0.36, t, {
        name: FONT_EN,
        size: '16pt',
        bold: true,
        color: accentTextOnLight(accent),
      })
      tx(s, nm(s, `O${i}D`), x + 0.22, y + 0.56, ow - 0.34, 0.3, d, {
        name: FONT_CN,
        size: '10pt',
        color: C.textSec,
      })
    })
    const py = 4.78
    card(s, nm(s, 'Feat'), MX, py, CW, 1.78, C.surface)
    box(s, nm(s, 'FeatTop'), 'rounded-rectangle', MX, py, CW, 0.09, C.secondary)
    tx(s, nm(s, 'FeatH'), MX + 0.32, py + 0.22, 6, 0.32, data.featHeader ?? '', {
      name: FONT_CN,
      size: '13pt',
      bold: true,
      color: accentTextOnLight(C.secondary, C.surface),
    })
    tx(
      s,
      nm(s, 'FeatL'),
      MX + 0.32,
      py + 0.64,
      5.6,
      1.0,
      (data.featLeft ?? []).map((t) => `· ${t}`).join('\n'),
      { name: FONT_CN, size: '11pt', color: C.textSec },
    )
    tx(
      s,
      nm(s, 'FeatR'),
      MX + 6.1,
      py + 0.64,
      5.5,
      1.0,
      (data.featRight ?? []).map((t) => `· ${t}`).join('\n'),
      { name: FONT_CN, size: '11pt', color: C.textSec },
    )
  }

  // slide 8: benchmark (table + bar chart + callout)
  function benchmarkSlide(s, data) {
    addSlide(s)
    pageHeader(s, data.eyebrow, data.title)
    pageFooter(s, total, footerLeft(data))
    const tableName = data.tableName ?? 'BenchTable'
    const tw = data.tableWidth ?? 7.7
    const rowsData = data.tableRows ?? data.rows
    ops.push({
      op: 'add-table',
      slide: s,
      rows: rowsData.length,
      cols: rowsData[0].length,
      name: tableName,
      x: `${MX}in`,
      y: '2.1in',
      w: `${tw}in`,
      h: '4.45in',
      data: rowsData,
    })
    styleBenchTable(s, tableName, rowsData.length, rowsData[0].length)
    const chX = MX + tw + 0.35
    const chW = SLIDE_W - MX - chX
    const chartName = data.chartName ?? 'BenchChart'
    card(s, nm(s, 'ChartPanel'), chX, 2.1, chW, 2.7, C.white)
    box(s, nm(s, 'ChartTop'), 'rounded-rectangle', chX, 2.1, chW, 0.09, C.primary)
    tx(s, nm(s, 'ChartH'), chX + 0.26, 2.28, chW - 0.5, 0.3, data.chartTitle ?? '', {
      name: FONT_CN,
      size: '12pt',
      bold: true,
      color: C.textPri,
    })
    ops.push({
      op: 'add-chart',
      slide: s,
      kind: 'column',
      variant: 'clustered',
      x: `${chX + 0.2}in`,
      y: '2.66in',
      w: `${chW - 0.4}in`,
      h: '2.0in',
      name: chartName,
      data: data.chartData,
    })
    ops.push({
      op: 'set-chart',
      slide: s,
      shape: { name: chartName },
      series: [
        {
          series: 0,
          fill: { type: 'solid', color: C.primary },
        },
      ],
      dataLabels: [
        {
          scope: { series: 0 },
          showValue: true,
          position: 'outside-end',
        },
      ],
      axes: [
        {
          axis: 'category',
          line: { color: C.textSec, width: '0.75pt' },
        },
      ],
    })
    card(s, nm(s, 'Take'), chX, 4.95, chW, 1.6, C.heroBg, null)
    tx(s, nm(s, 'TakeNum'), chX + 0.28, 5.18, chW - 0.56, 0.7, data.calloutNum ?? data.takeNum, {
      name: FONT_EN,
      size: '40pt',
      bold: true,
      color: C.primary,
    })
    tx(s, nm(s, 'TakeTxt'), chX + 0.28, 5.96, chW - 0.56, 0.5, data.calloutText ?? data.takeTxt, {
      name: FONT_CN,
      size: '11pt',
      color: C.onHero,
    })
  }

  function styleBenchTable(s, name, rows, cols) {
    const cells = []
    const rowSpecs = []
    ops.push({
      op: 'set-table',
      slide: s,
      shape: { name },
      style: {
        firstRow: true,
        lastRow: false,
        horizontalBanding: true,
        verticalBanding: false,
      },
      rows: rowSpecs,
      cells,
    })
    for (let r = 0; r < rows; r++) {
      rowSpecs.push({ row: r, height: r === 0 ? '0.5in' : '0.55in' })
      for (let c = 0; c < cols; c++) {
        const isHeader = r === 0,
          isFirst = c === 0,
          isUs = c === 1 && !isHeader
        const fillColor = isHeader
          ? C.heroBg
          : isUs
            ? 'FBEDE8'
            : isFirst
              ? C.surfaceAlt
              : r % 2 === 0
                ? C.surface
                : C.white
        const fontColor = isHeader ? C.white : isUs ? C.primaryDk : isFirst ? C.textPri : C.textSec
        cells.push({
          row: r,
          col: c,
          style: {
            fill: { type: 'solid', color: fillColor },
            font: {
              name: c === 0 ? FONT_CN : FONT_EN,
              size: isHeader ? '12pt' : '12.5pt',
              bold: isHeader || isFirst || isUs,
              color: fontColor,
            },
            alignment: c === 0 ? 'left' : 'center',
          },
        })
      }
    }
  }

  // slide 10: roadmap (horizontal timeline, alternating up/down)
  function timelineSlide(s, data) {
    addSlide(s)
    pageHeader(s, data.eyebrow, data.title)
    pageFooter(s, total, footerLeft(data))
    const axisY = 4.2
    box(s, nm(s, 'Axis'), 'rectangle', MX, axisY, CW, 0.02, C.divider)
    const steps = data.steps
    const cells = grid(steps.length, 0.28)
    steps.forEach(([accent, idx, title, desc, status], i) => {
      const { x, w } = cells[i]
      const cx = x + w / 2
      const up = i % 2 === 0
      const cardY = up ? 2.25 : 4.55
      const ch = 1.7
      box(s, nm(s, `N${i}`), 'oval', cx - 0.11, axisY - 0.095, 0.22, 0.22, accent)
      if (up)
        box(
          s,
          nm(s, `L${i}`),
          'rectangle',
          cx - 0.008,
          cardY + ch,
          0.016,
          axisY - (cardY + ch),
          C.divider,
        )
      else
        box(
          s,
          nm(s, `L${i}`),
          'rectangle',
          cx - 0.008,
          axisY + 0.02,
          0.016,
          cardY - (axisY + 0.02),
          C.divider,
        )
      card(s, nm(s, `R${i}Bg`), x, cardY, w, ch)
      box(s, nm(s, `R${i}Top`), 'rounded-rectangle', x, cardY, w, 0.08, accent)
      tx(s, nm(s, `R${i}Num`), x + 0.24, cardY + 0.2, 0.62, 0.42, idx, {
        name: FONT_EN,
        size: '20pt',
        bold: true,
        color: accentTextOnLight(accent),
      })
      const isNow = status === '进行中'
      card(
        s,
        nm(s, `R${i}St`),
        x + w - 0.92,
        cardY + 0.24,
        0.82,
        0.32,
        isNow ? C.posBg : C.surfaceAlt,
        null,
      )
      fillText(
        s,
        nm(s, `R${i}St`),
        status,
        {
          name: FONT_CN,
          size: '10pt',
          bold: true,
          color: readableTextOn(isNow ? C.posBg : C.surfaceAlt, isNow ? C.posTxt : C.textSec, [
            C.textPri,
          ]),
        },
        'center',
      )
      tx(s, nm(s, `R${i}T`), x + 0.24, cardY + 0.66, w - 0.48, 0.48, title, {
        name: FONT_CN,
        size: '13.5pt',
        bold: true,
        color: C.textPri,
      })
      tx(s, nm(s, `R${i}D`), x + 0.24, cardY + 1.14, w - 0.42, 0.48, desc, {
        name: FONT_CN,
        size: '10pt',
        color: C.textSec,
      })
    })
  }

  // slide 11: ask/closing (deep hero + ask cards)
  function askSlide(s, data) {
    addSlide(s, C.heroBg)
    heroDots(s)
    tx(s, nm(s, 'Eyebrow'), 1.0, 1.5, 9, 0.34, data.eyebrow, {
      name: FONT_EN,
      size: '13pt',
      bold: true,
      color: C.heroAccent,
    })
    box(s, nm(s, 'Tick'), 'rectangle', 1.02, 1.94, 0.62, 0.045, C.primary)
    tx(s, nm(s, 'Title'), 1.0, 2.25, 11.3, 0.9, data.title, {
      name: FONT_CN,
      size: '44pt',
      bold: true,
      color: C.onHero,
    })
    tx(s, nm(s, 'Sub'), 1.0, 3.3, 11.3, 0.45, data.sub, {
      name: FONT_CN,
      size: '16pt',
      color: C.heroMut,
    })
    const asks = data.asks
    const cells = grid(asks.length, 0.3)
    const cy = 4.1
    const ch = 2.1
    asks.forEach(([accent, title, desc], i) => {
      const { x, w } = cells[i]
      const badge = accentBadge(accent)
      card(s, nm(s, `Ask${i}Bg`), x, cy, w, ch, C.heroPanel, C.heroLine)
      box(s, nm(s, `Ask${i}Top`), 'rounded-rectangle', x, cy, w, 0.09, accent)
      box(s, nm(s, `Ask${i}Dot`), 'oval', x + 0.3, cy + 0.34, 0.5, 0.5, badge.fill)
      tx(
        s,
        nm(s, `Ask${i}Num`),
        x + 0.3,
        cy + 0.42,
        0.5,
        0.36,
        `0${i + 1}`,
        { name: FONT_EN, size: '14pt', bold: true, color: badge.text },
        'center',
      )
      tx(s, nm(s, `Ask${i}T`), x + 0.3, cy + 1.0, w - 0.6, 0.44, title, {
        name: FONT_CN,
        size: '15pt',
        bold: true,
        color: C.onHero,
      })
      tx(s, nm(s, `Ask${i}D`), x + 0.3, cy + 1.48, w - 0.56, 0.54, desc, {
        name: FONT_CN,
        size: '10.5pt',
        color: C.heroMut,
      })
    })
    box(s, nm(s, 'Divider'), 'rectangle', 1.0, 6.6, 11.333, 0.014, C.heroLine)
    tx(s, nm(s, 'Thx'), 1.0, 6.78, 6.0, 0.3, data.closing ?? data.thankYou ?? 'Thank you', {
      name: FONT_EN,
      size: '11pt',
      bold: true,
      color: C.heroMut,
    })
    tx(
      s,
      nm(s, 'End'),
      7.333,
      6.78,
      5.0,
      0.3,
      data.closingR ?? data.tagline ?? '',
      { name: FONT_EN, size: '10pt', color: C.heroMut2 },
      'right',
    )
  }

  const DISPATCH = {
    heroSlide,
    profileTableSlide,
    kpiRowSlide,
    previewProductSlide,
    landscapeSlide,
    multiCardSlide,
    convertFlowSlide,
    benchmarkSlide,
    timelineSlide,
    askSlide,
  }

  return DISPATCH
}

// ── createDeck export ─────────────────────────────────────────
export function createDeck(content) {
  const slides = content.slides ?? []
  const total = slides.length
  const builders = createOps()
  const { ops } = builders
  const chrome = makeChrome(builders)
  const components = makeComponents(builders)
  const dispatch = makePageTypes(builders, chrome, components, total, content.meta ?? {})
  const warnings = []

  slides.forEach((slide, s) => {
    const fn = dispatch[slide.type]
    if (!fn) {
      warnings.push(`Unknown slide type "${slide.type}" at index ${s}`)
      return
    }
    fn(s, slide.data ?? {})
  })

  return { patch: { schemaVersion: 'pptx-patch/v1', ops }, warnings }
}

export { C, ACCENTS, FONT_CN, FONT_EN }
