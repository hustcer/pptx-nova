// broadside.kit.mjs - Protest-poster editorial DeckKit
// version: 0.1.0
import { SLIDE_H, SLIDE_W, createOps, grid, nm, txH } from './core-primitives.kit.mjs'

const C = {
  ink: '111111',
  inkAlt: '1A1A18',
  orange: 'E85D26',
  cream: 'F0ECE5',
  muted: 'B8B8AE',
  hint: 'A8A8A0',
  border: '282826',
  orangeMuted: '2A1008',
  orangeHint: '111111',
  orangeLine: '7A2B12',
  dark2: '3A3A38',
  dark3: '555550',
}

const FONT_DISPLAY = 'Barlow'
const FONT_MONO = 'IBM Plex Mono'
const FONT_CN = 'Noto Sans SC'
const MX = 0.73
const MY = 0.42
const BODY_TOP = 1.08
const FOOT_Y = 7.05

const pad2 = (value) => String(value).padStart(2, '0')
const str = (value) => String(value ?? '')
const clean = (value) => str(value).trim()
const list = (value) =>
  (Array.isArray(value) ? value : value ? [value] : []).map(clean).filter(Boolean)
const limit = (items, max, path) => {
  const values = list(items)
  if (values.length > max)
    throw new Error(`${path}: ${values.length} items exceeds layout limit ${max}`)
  return values
}
const objectList = (value, max, path) => {
  const values = Array.isArray(value) ? value : []
  if (values.length > max)
    throw new Error(`${path}: ${values.length} items exceeds layout limit ${max}`)
  return values
}
const font = (size, color = C.cream, options = {}) => ({
  name: options.mono ? FONT_MONO : FONT_DISPLAY,
  size: `${size}pt`,
  color,
  ...(options.bold === false ? {} : { bold: true }),
})
const mono = (size = 9, color = C.hint, options = {}) =>
  font(size, color, { ...options, mono: true })

function makeOps() {
  const p = createOps({
    textbox: {
      marginTop: '0.02in',
      marginBottom: '0.02in',
      marginLeft: '0.02in',
      marginRight: '0.02in',
    },
  })

  const line = (s, name, x, y, w, h, color) => p.box(s, name, 'rectangle', x, y, w, h, color)
  const hRule = (s, name, x, y, w, color = C.border, h = 0.01) => line(s, name, x, y, w, h, color)
  const vRule = (s, name, x, y, h, color = C.border, w = 0.01) => line(s, name, x, y, w, h, color)
  const tx = (s, name, x, y, w, h, text, textFont, align) =>
    p.tx(s, name, x, y, w, h, text, textFont, align)

  const add = (s, bg) => p.addSlide(s, bg)

  const chrome = (s, data, index, total, variant = 'dark') => {
    const isOrange = variant === 'orange'
    const labelColor = isOrange ? C.orangeHint : C.hint
    const ruleColor = isOrange ? C.orangeLine : C.border
    const left = clean(data.section ?? data.kicker ?? 'Broadside')
    const right = clean(data.page ?? pad2(index + 1))
    tx(s, nm(s, 'ChromeL'), MX, MY, 4.8, 0.18, left, mono(9, labelColor, { bold: false }))
    tx(
      s,
      nm(s, 'ChromeR'),
      SLIDE_W - MX - 2.2,
      MY,
      2.2,
      0.18,
      right,
      mono(9, labelColor, { bold: false }),
      'right',
    )
    hRule(s, nm(s, 'ChromeRule'), MX, 0.68, SLIDE_W - MX * 2, ruleColor)
    tx(
      s,
      nm(s, 'FootL'),
      MX,
      FOOT_Y,
      4.8,
      0.18,
      clean(data.footerLeft ?? 'Broadside'),
      mono(9, labelColor, { bold: false }),
    )
    tx(
      s,
      nm(s, 'FootR'),
      SLIDE_W - MX - 3.2,
      FOOT_Y,
      3.2,
      0.18,
      clean(data.footerRight ?? data.author ?? ''),
      mono(9, labelColor, { bold: false }),
      'right',
    )
    hRule(s, nm(s, 'FootRule'), MX, 6.92, SLIDE_W - MX * 2, ruleColor)
  }

  const topCatalogue = (s, data, idx, variant = 'orange') => {
    const color = variant === 'orange' ? C.orangeHint : C.hint
    tx(s, nm(s, 'TopNum'), MX, MY, 1.3, 0.2, clean(data.number ?? pad2(idx + 1)), mono(9, color))
    tx(
      s,
      nm(s, 'TopLabel'),
      SLIDE_W - MX - 2.4,
      MY,
      2.4,
      0.2,
      clean(data.label ?? 'Broadside'),
      mono(9, color, { bold: false }),
      'right',
    )
  }

  const bottomMeta = (s, data, variant = 'orange') => {
    const color = variant === 'orange' ? C.orangeHint : C.hint
    const rule = variant === 'orange' ? C.orangeLine : C.border
    hRule(s, nm(s, 'MetaRule'), MX, 6.62, SLIDE_W - MX * 2, rule)
    tx(
      s,
      nm(s, 'MetaL'),
      MX,
      6.77,
      4.2,
      0.2,
      clean(data.author ?? ''),
      mono(9, color, { bold: false }),
    )
    tx(
      s,
      nm(s, 'MetaR'),
      SLIDE_W - MX - 4.2,
      6.77,
      4.2,
      0.2,
      clean(data.context ?? data.year ?? ''),
      mono(9, color, { bold: false }),
      'right',
    )
  }

  const kicker = (s, name, x, y, text, variant = 'dark') =>
    tx(
      s,
      name,
      x,
      y,
      3.6,
      0.2,
      clean(text),
      mono(9, variant === 'orange' ? C.orangeHint : C.orange),
    )

  const shortRule = (s, name, x, y, variant = 'dark') =>
    hRule(s, name, x, y, 0.34, variant === 'orange' ? C.ink : C.orange, 0.02)

  const bullets = (s, name, x, y, w, items, variant = 'dark', size = 13, gap = 0.42) => {
    const values = limit(items, 4, `${name}.items`)
    values.forEach((item, i) => {
      const yy = y + i * gap
      tx(
        s,
        nm(s, `${name}Slash${i}`),
        x,
        yy,
        0.18,
        0.2,
        '/',
        mono(11, variant === 'orange' ? C.orangeHint : C.orange),
      )
      tx(
        s,
        nm(s, `${name}Text${i}`),
        x + 0.28,
        yy - 0.02,
        w - 0.28,
        0.34,
        item,
        font(size, variant === 'orange' ? C.ink : C.cream, { bold: false }),
      )
    })
  }

  return { p, add, tx, hRule, vRule, chrome, topCatalogue, bottomMeta, kicker, shortRule, bullets }
}

function makePageTypes(api, total) {
  const { p, add, tx, hRule, vRule, chrome, topCatalogue, bottomMeta, kicker, shortRule, bullets } =
    api

  const cover = (s, data) => {
    add(s, C.orange)
    topCatalogue(s, data, s, 'orange')
    tx(s, nm(s, 'Title'), MX, 1.95, 11.6, 2.45, clean(data.title), font(76, C.ink))
    tx(
      s,
      nm(s, 'Lead'),
      MX,
      4.55,
      9.1,
      0.6,
      clean(data.subtitle),
      font(14, C.orangeMuted, { bold: false }),
    )
    bottomMeta(s, data, 'orange')
  }

  const chapter = (s, data) => {
    add(s, C.orange)
    tx(
      s,
      nm(s, 'ChapterNum'),
      MX,
      2.1,
      3.8,
      0.22,
      clean(data.number ?? `${pad2(s + 1)} / Chapter`),
      mono(9, C.orangeHint),
    )
    tx(s, nm(s, 'Title'), MX, 2.52, 8.5, 2.15, clean(data.title), font(54, C.ink))
    tx(
      s,
      nm(s, 'Lead'),
      MX,
      4.85,
      6.2,
      0.55,
      clean(data.lead ?? ''),
      font(15, C.orangeMuted, { bold: false }),
    )
  }

  const statement = (s, data) => {
    add(s, C.ink)
    chrome(s, data, s, total)
    kicker(s, nm(s, 'Kicker'), MX, 2.2, data.kicker)
    shortRule(s, nm(s, 'Rule'), MX, 2.55)
    tx(s, nm(s, 'Title'), MX, 2.88, 8.8, 1.8, clean(data.title), font(52, C.orange))
  }

  const split = (s, data) => {
    add(s, C.ink)
    chrome(s, data, s, total)
    kicker(s, nm(s, 'Kicker'), MX, 1.45, data.kicker)
    shortRule(s, nm(s, 'Rule'), MX, 1.76)
    tx(s, nm(s, 'Title'), MX, 2.0, 4.2, 1.62, clean(data.title), font(28, C.cream))
    tx(s, nm(s, 'Lead'), MX, 3.62, 4.4, 0.7, clean(data.lead), font(14, C.muted, { bold: false }))
    bullets(s, 'Bullet', MX, 4.62, 4.5, data.bullets, 'dark', 11, 0.34)
    p.shape(s, nm(s, 'ImageSlot'), 'rectangle', 7.2, 1.55, 5.2, 3.95)
    p.fill(s, nm(s, 'ImageSlot'), C.inkAlt)
    p.setLine(s, nm(s, 'ImageSlot'), C.border, '0.75pt')
    tx(
      s,
      nm(s, 'ImageText'),
      8.45,
      3.28,
      2.7,
      0.22,
      clean(data.imageLabel ?? 'IMAGE PLACEHOLDER'),
      mono(9, C.muted),
    )
    tx(
      s,
      nm(s, 'Caption'),
      7.2,
      5.68,
      5.2,
      0.26,
      clean(data.caption ?? ''),
      mono(9, C.hint, { bold: false }),
    )
  }

  const stats = (s, data) => {
    add(s, C.orange)
    chrome(s, data, s, total, 'orange')
    const items = objectList(data.items, 4, 'stats.items')
    const cells = grid(items.length || 3, 0, MX, SLIDE_W - MX * 2)
    items.forEach((item, i) => {
      const c = cells[i]
      hRule(s, nm(s, `StatRule${i}`), c.x, 2.55, c.w - 0.15, C.orangeLine)
      tx(s, nm(s, `StatValue${i}`), c.x, 2.77, c.w - 0.1, 0.75, clean(item.value), font(40, C.ink))
      tx(
        s,
        nm(s, `StatLabel${i}`),
        c.x,
        3.62,
        c.w - 0.22,
        0.55,
        clean(item.label),
        font(11.5, C.orangeMuted, { bold: false }),
      )
      tx(
        s,
        nm(s, `StatNote${i}`),
        c.x,
        4.35,
        c.w - 0.22,
        0.22,
        clean(item.note),
        mono(9, C.orangeHint, { bold: false }),
      )
    })
  }

  const fadeList = (s, data) => {
    add(s, C.orange)
    tx(s, nm(s, 'Num'), MX, MY, 1.2, 0.2, clean(data.number ?? pad2(s + 1)), mono(9, C.orangeHint))
    const items = limit(data.items, 3, 'fadelist.items')
    const opColors = [C.ink, C.orangeMuted, C.orangeHint]
    items.forEach((item, i) =>
      tx(
        s,
        nm(s, `Item${i}`),
        8.0,
        1.6 + i * 0.66,
        3.8,
        0.7,
        item,
        font(40, opColors[i] ?? C.orangeHint),
      ),
    )
    tx(s, nm(s, 'Title'), 7.45, 3.9, 4.6, 2.45, clean(data.title), font(58, C.ink), 'right')
    bottomMeta(s, data, 'orange')
  }

  const listSlide = (s, data) => {
    add(s, C.ink)
    chrome(s, data, s, total)
    kicker(s, nm(s, 'Kicker'), MX, 2.25, data.kicker)
    tx(s, nm(s, 'Title'), MX, 2.72, 4.4, 1.15, clean(data.title), font(34, C.cream))
    bullets(s, 'List', 5.75, 2.45, 6.7, data.items, 'dark', 12, 0.55)
  }

  const quote = (s, data) => {
    add(s, C.ink)
    kicker(s, nm(s, 'Kicker'), MX + 0.1, 1.35, data.kicker)
    tx(s, nm(s, 'Quote'), MX + 0.1, 2.08, 9.6, 2.15, clean(data.quote), font(36, C.cream))
    tx(s, nm(s, 'Author'), MX + 0.1, 4.88, 4.8, 0.2, clean(data.author), mono(9, C.orange))
    tx(
      s,
      nm(s, 'Source'),
      MX + 0.1,
      5.18,
      4.8,
      0.2,
      clean(data.source),
      mono(9, C.hint, { bold: false }),
    )
  }

  const compare = (s, data) => {
    add(s, C.ink)
    chrome(s, data, s, total)
    const left = data.left ?? {}
    const right = data.right ?? {}
    const mid = 6.6
    vRule(s, nm(s, 'Divider'), mid, 1.22, 5.2, C.border)
    p.box(s, nm(s, 'RightPanel'), 'rectangle', mid + 0.22, 1.22, 5.98, 5.2, C.orange)
    tx(s, nm(s, 'LeftLabel'), MX, 1.55, 3, 0.22, clean(left.label ?? 'Before'), mono(9, C.hint))
    hRule(s, nm(s, 'LeftRule'), MX, 1.88, 4.9, C.border)
    tx(s, nm(s, 'LeftTitle'), MX, 2.22, 4.8, 0.7, clean(left.title), font(24, C.cream))
    tx(
      s,
      nm(s, 'LeftBody'),
      MX,
      3.08,
      4.9,
      0.72,
      clean(left.body),
      font(13, C.muted, { bold: false }),
    )
    bullets(s, 'LeftBullet', MX, 4.08, 4.9, left.bullets, 'dark', 10.5, 0.34)
    tx(
      s,
      nm(s, 'RightLabel'),
      mid + 0.55,
      1.55,
      3,
      0.22,
      clean(right.label ?? 'After'),
      mono(9, C.orangeHint),
    )
    hRule(s, nm(s, 'RightRule'), mid + 0.55, 1.88, 5.1, C.orangeLine)
    tx(s, nm(s, 'RightTitle'), mid + 0.55, 2.22, 4.9, 0.7, clean(right.title), font(24, C.ink))
    tx(
      s,
      nm(s, 'RightBody'),
      mid + 0.55,
      3.08,
      4.9,
      0.72,
      clean(right.body),
      font(13, C.orangeMuted, { bold: false }),
    )
    bullets(s, 'RightBullet', mid + 0.55, 4.08, 4.9, right.bullets, 'orange', 10.5, 0.34)
  }

  const barChart = (s, data) => {
    add(s, C.ink)
    chrome(s, data, s, total)
    tx(s, nm(s, 'Title'), MX, 1.35, 5.4, 0.55, clean(data.title), font(32, C.cream))
    tx(
      s,
      nm(s, 'Caption'),
      9.4,
      1.48,
      3,
      0.2,
      clean(data.caption),
      mono(9, C.hint, { bold: false }),
      'right',
    )
    const items = objectList(data.bars, 6, 'bars')
    const max = Math.max(...items.map((item) => Number(item.value) || 0), 1)
    const cells = grid(items.length || 4, 0.35, 3.25, 6.4)
    hRule(s, nm(s, 'Baseline'), 3.15, 5.38, 7.5, C.border)
    vRule(s, nm(s, 'YAxis'), 3.15, 2.75, 2.63, C.border)
    items.forEach((item, i) => {
      const c = cells[i]
      const h = 0.45 + ((Number(item.value) || 0) / max) * 1.8
      const y = 5.38 - h
      const accent = item.accent === true || i === items.length - 1
      tx(
        s,
        nm(s, `BarVal${i}`),
        c.x,
        y - 0.32,
        c.w,
        0.2,
        clean(item.display ?? item.value),
        font(10, accent ? C.orange : C.muted),
      )
      p.box(s, nm(s, `Bar${i}`), 'rectangle', c.x, y, c.w, h, accent ? C.orange : C.hint)
      tx(
        s,
        nm(s, `BarLabel${i}`),
        c.x,
        5.55,
        c.w,
        0.2,
        clean(item.label),
        mono(9, C.hint, { bold: false }),
      )
    })
    tx(s, nm(s, 'Source'), MX, 6.05, 8, 0.22, clean(data.source), mono(9, C.hint, { bold: false }))
  }

  const flow = (s, data) => {
    add(s, C.orange)
    chrome(s, data, s, total, 'orange')
    tx(s, nm(s, 'Title'), MX, 1.38, 5.6, 1.05, clean(data.title), font(30, C.ink))
    const steps = objectList(data.steps, 4, 'steps')
    const cells = grid(4, 0.25, MX, SLIDE_W - MX * 2)
    steps.forEach((step, i) => {
      const c = cells[i]
      tx(
        s,
        nm(s, `StepNum${i}`),
        c.x,
        3.0,
        0.7,
        0.48,
        clean(step.num ?? pad2(i + 1)),
        font(28, C.orangeHint),
      )
      tx(s, nm(s, `StepTitle${i}`), c.x, 3.55, c.w - 0.12, 0.34, clean(step.title), font(20, C.ink))
      tx(
        s,
        nm(s, `StepBody${i}`),
        c.x,
        4.02,
        c.w - 0.12,
        0.95,
        clean(step.body),
        font(10.5, C.orangeMuted, { bold: false }),
      )
      if (i < steps.length - 1)
        tx(
          s,
          nm(s, `Arrow${i}`),
          c.x + c.w - 0.18,
          3.38,
          0.35,
          0.3,
          '→',
          font(16, C.orangeHint, { bold: false }),
        )
    })
  }

  const donut = (s, data) => {
    add(s, C.ink)
    chrome(s, data, s, total)
    tx(s, nm(s, 'Title'), MX, 1.35, 7, 0.62, clean(data.title), font(32, C.cream))
    p.box(s, nm(s, 'DonutOuter'), 'oval', 4.1, 2.45, 2.05, 2.05, C.orange)
    p.box(s, nm(s, 'DonutMid'), 'oval', 4.45, 2.8, 1.35, 1.35, C.dark2)
    p.box(s, nm(s, 'DonutInner'), 'oval', 4.83, 3.18, 0.6, 0.6, C.ink)
    const items = objectList(data.items, 5, 'items')
    items.forEach((item, i) => {
      const y = 2.25 + i * 0.43
      p.box(
        s,
        nm(s, `Swatch${i}`),
        'rectangle',
        8.0,
        y + 0.06,
        0.12,
        0.12,
        item.color ?? [C.orange, C.dark2, C.dark3, C.border, C.hint][i],
      )
      tx(
        s,
        nm(s, `LegendLabel${i}`),
        8.28,
        y,
        2.4,
        0.22,
        clean(item.label),
        font(11, C.cream, { bold: false }),
      )
      tx(
        s,
        nm(s, `LegendValue${i}`),
        11.35,
        y,
        0.75,
        0.22,
        clean(item.value),
        mono(9, C.orange),
        'right',
      )
    })
    hRule(s, nm(s, 'TotalRule'), 8.0, 4.55, 4.1, C.border)
    tx(s, nm(s, 'Total'), 8.0, 4.78, 4.2, 0.24, clean(data.total), mono(9, C.hint, { bold: false }))
    tx(s, nm(s, 'Source'), MX, 6.05, 8, 0.22, clean(data.source), mono(9, C.hint, { bold: false }))
  }

  const pyramid = (s, data) => {
    add(s, C.ink)
    chrome(s, data, s, total)
    tx(s, nm(s, 'Title'), MX, 1.35, 6.4, 0.62, clean(data.title), font(32, C.cream))
    const items = objectList(data.levels, 5, 'levels')
    const widths = [3.2, 4.6, 6.0, 7.5, 9.0]
    items.forEach((item, i) => {
      const w = widths[i] ?? 9
      const x = (SLIDE_W - w) / 2
      const y = 2.18 + i * 0.62
      const fillColor = [C.orange, '8F3D20', '65301E', '45251B', C.inkAlt][i] ?? C.inkAlt
      const textColor = i === 0 ? C.ink : C.cream
      const descColor = i === 0 ? C.ink : C.cream
      p.box(s, nm(s, `Level${i}`), 'rectangle', x, y, w, 0.56, fillColor)
      tx(
        s,
        nm(s, `LevelName${i}`),
        x + 0.18,
        y + 0.05,
        w - 0.36,
        0.24,
        clean(item.name),
        font(13, textColor),
      )
      tx(
        s,
        nm(s, `LevelDesc${i}`),
        x + 0.18,
        y + 0.31,
        w - 0.36,
        0.2,
        clean(item.desc),
        font(9, descColor, { bold: false }),
        'right',
      )
    })
  }

  const timeline = (s, data) => {
    add(s, C.ink)
    chrome(s, data, s, total)
    tx(s, nm(s, 'Title'), MX, 1.18, 6.8, 0.62, clean(data.title), font(32, C.cream))
    hRule(s, nm(s, 'TitleRule'), MX, 1.9, SLIDE_W - MX * 2, C.border)
    const items = objectList(data.events, 5, 'events')
    const compact = items.length > 4
    const stepGap = compact ? 0.86 : 1.16
    const titlePt = compact ? 12 : 14
    const bodyPt = compact ? 9 : 9.5
    const bodyH = compact ? 0.28 : 0.36
    vRule(s, nm(s, 'Spine'), 3.1, 2.25, 3.8, C.border)
    items.forEach((item, i) => {
      const y = 2.05 + i * stepGap
      tx(
        s,
        nm(s, `Date${i}`),
        MX,
        y,
        1.65,
        0.2,
        clean(item.date),
        mono(9, C.hint, { bold: false }),
        'right',
      )
      p.box(s, nm(s, `Tick${i}`), 'rectangle', 3.05, y + 0.03, 0.1, 0.1, C.orange)
      tx(
        s,
        nm(s, `EventTitle${i}`),
        3.45,
        y - 0.04,
        3.5,
        0.3,
        clean(item.title),
        font(titlePt, C.cream),
      )
      tx(
        s,
        nm(s, `EventBody${i}`),
        3.45,
        y + 0.3,
        6.7,
        bodyH,
        clean(item.body),
        font(bodyPt, C.muted, { bold: false }),
      )
    })
  }

  const cycle = (s, data) => {
    add(s, C.ink)
    chrome(s, data, s, total)
    tx(s, nm(s, 'Title'), MX, 1.2, 7, 0.62, clean(data.title), font(32, C.cream))
    const steps = objectList(data.steps, 4, 'steps')
    const pos = [
      [MX, 2.35],
      [7.05, 2.35],
      [7.05, 4.55],
      [MX, 4.55],
    ]
    steps.forEach((step, i) => {
      const [x, y] = pos[i]
      hRule(s, nm(s, `StepRule${i}`), x, y, 5.1, C.orange, 0.02)
      tx(
        s,
        nm(s, `StepNum${i}`),
        x,
        y + 0.24,
        0.85,
        0.44,
        clean(step.num ?? pad2(i + 1)),
        font(20, C.orange),
      )
      tx(s, nm(s, `StepTitle${i}`), x, y + 0.72, 2.4, 0.42, clean(step.title), font(18, C.cream))
      tx(
        s,
        nm(s, `StepBody${i}`),
        x,
        y + 1.12,
        4.8,
        0.52,
        clean(step.body),
        font(10.5, C.muted, { bold: false }),
      )
    })
    tx(s, nm(s, 'Arrow1'), 6.15, 3.06, 0.36, 0.34, '→', font(14, C.hint, { bold: false }))
    tx(s, nm(s, 'Arrow2'), 9.55, 4.02, 0.36, 0.34, '↓', font(14, C.hint, { bold: false }))
    tx(s, nm(s, 'Arrow3'), 6.15, 5.26, 0.36, 0.34, '←', font(14, C.hint, { bold: false }))
  }

  const end = (s, data) => {
    add(s, C.orange)
    topCatalogue(s, data, s, 'orange')
    tx(s, nm(s, 'Title'), MX, 1.95, 6.5, 2.65, clean(data.title), font(68, C.ink))
    tx(
      s,
      nm(s, 'Contact'),
      MX,
      5.02,
      5.8,
      0.45,
      clean(data.contact),
      font(14, C.orangeMuted, { bold: false }),
    )
    bottomMeta(s, data, 'orange')
  }

  return {
    broadsideCoverSlide: cover,
    broadsideChapterSlide: chapter,
    broadsideStatementSlide: statement,
    broadsideSplitSlide: split,
    broadsideStatsSlide: stats,
    broadsideFadeListSlide: fadeList,
    broadsideListSlide: listSlide,
    broadsideQuoteSlide: quote,
    broadsideCompareSlide: compare,
    broadsideBarChartSlide: barChart,
    broadsideFlowSlide: flow,
    broadsideDonutSlide: donut,
    broadsidePyramidSlide: pyramid,
    broadsideTimelineSlide: timeline,
    broadsideCycleSlide: cycle,
    broadsideEndSlide: end,
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

  return { patch: { schemaVersion: 1, ops: api.p.ops }, warnings }
}

export { C, FONT_CN, FONT_DISPLAY, FONT_MONO }
