// mckinsey-blue.kit.mjs — white + McKinsey-blue consulting DeckKit
// version: 0.1.0
import { createOps, grid, nm, SLIDE_W } from './core-primitives.kit.mjs'

// Palette extracted from the local McKinsey-style loyalty reference deck.
const C = {
  navy: '0C2744',
  deep: '18345E',
  primary: '005587',
  blue: '0076A8',
  sky: '38BDF8',
  teal: '4A90A4',
  red: 'DC2626',
  amber: 'F59E0B',
  green: '059669',
  slate: '64748B',
  muted: '94A3B8',
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
const FONT_EN = 'Arial'
const FONT_CN = 'Arial'
const MX = 0.45
const CW = SLIDE_W - MX * 2

const asLines = (value) => (Array.isArray(value) ? value.join('\n') : value)
const pct = (value) => Number(String(value).replace('%', ''))

function createMckOps() {
  const builders = createOps()
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
  }
}

function makeChrome({ tx, box, fillText }) {
  const topRule = (s, color = C.blue) =>
    box(s, nm(s, 'TopRule'), 'rectangle', 0, 0, SLIDE_W, 0.04, color)

  const header = (s, title, subtitle) => {
    topRule(s)
    tx(s, nm(s, 'Title'), MX, 0.25, CW, 0.45, title, {
      name: FONT_EN,
      size: '14pt',
      bold: true,
      color: C.text,
    })
    box(s, nm(s, 'SubtitleBar'), 'rectangle', MX, 0.72, CW, 0.38, C.deep)
    tx(s, nm(s, 'Subtitle'), MX + 0.18, 0.78, CW - 0.36, 0.3, subtitle, {
      name: FONT_EN,
      size: '8pt',
      bold: true,
      color: C.white,
    })
    return 1.18
  }

  const footer = (s, total, source) => {
    box(s, nm(s, 'FootLine'), 'rectangle', MX, 6.82, CW, 0.012, C.grid)
    tx(s, nm(s, 'Source'), MX, 6.92, 4.8, 0.14, source ?? '', {
      name: FONT_EN,
      size: '6.6pt',
      color: C.muted,
    })
    tx(
      s,
      nm(s, 'Confidential'),
      4.95,
      6.92,
      3.9,
      0.14,
      'STRICTLY CONFIDENTIAL | NOT FOR DISTRIBUTION',
      { name: FONT_EN, size: '6.6pt', color: C.muted },
      'center',
    )
    tx(
      s,
      nm(s, 'PageNum'),
      12.45,
      6.92,
      0.45,
      0.14,
      String(s + 1),
      { name: FONT_EN, size: '6.6pt', color: C.muted },
      'right',
    )
  }

  const sectionLabel = (s, name, x, y, w, label, color = C.muted) => {
    tx(s, name, x, y, w, 0.15, label, {
      name: FONT_EN,
      size: '6.8pt',
      bold: true,
      color,
    })
  }

  const noteBox = (s, base, x, y, w, h, title, body, color = C.blue, bg = C.blueTint) => {
    box(s, nm(s, `${base}Bg`), 'rectangle', x, y, w, h, bg)
    box(s, nm(s, `${base}Rule`), 'rectangle', x, y, 0.04, h, color)
    tx(s, nm(s, `${base}T`), x + 0.18, y + 0.12, w - 0.3, 0.18, title, {
      name: FONT_EN,
      size: '8.6pt',
      bold: true,
      color,
    })
    tx(s, nm(s, `${base}B`), x + 0.18, y + 0.35, w - 0.3, h - 0.44, asLines(body), {
      name: FONT_EN,
      size: '8.2pt',
      color: C.text2,
    })
  }

  const cardCaption = (s, name, x, y, w, text, color = C.muted) => {
    fillText(s, name, text, { name: FONT_EN, size: '7.5pt', bold: true, color }, 'center')
    box(s, `${name}Line`, 'rectangle', x, y + 0.26, w, 0.01, C.grid)
  }

  return { topRule, header, footer, sectionLabel, noteBox, cardCaption }
}

function makeComponents({ tx, box, card, icon, fillText, setLine }) {
  const metricCard = (s, base, x, y, w, h, item) => {
    const accent = item.accent ?? C.blue
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
      color: accent,
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
        color: accent,
      })
    }
  }

  const hBar = (s, base, x, y, w, h, value, max, color, label, sub, valueLabel) => {
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
    box(s, nm(s, `${base}Bar`), 'rectangle', x + 2.05, y, fillW, h, color)
    tx(
      s,
      nm(s, `${base}Val`),
      x + 2.05 + Math.min(fillW - 0.48, w - 0.52),
      y + 0.08,
      0.42,
      0.18,
      valueLabel ?? `${value}%`,
      { name: FONT_EN, size: '8pt', bold: true, color: C.white },
      'right',
    )
  }

  const miniBar = (s, base, x, y, w, label, value, note, color = C.primary) => {
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
      color,
    )
    tx(s, nm(s, `${base}V`), x + w - 0.44, y, 0.42, 0.17, value, {
      name: FONT_EN,
      size: '8pt',
      bold: true,
      color,
    })
    if (note) {
      tx(s, nm(s, `${base}N`), x + 1.5, y + 0.26, w - 1.5, 0.14, note, {
        name: FONT_EN,
        size: '6.5pt',
        color: C.muted,
      })
    }
  }

  const pillarCard = (s, base, x, y, w, h, item, i) => {
    const accent = item.accent ?? ACCENTS[i % ACCENTS.length]
    box(s, nm(s, `${base}Top`), 'rectangle', x, y, w, 0.36, accent)
    tx(
      s,
      nm(s, `${base}Idx`),
      x,
      y + 0.06,
      w,
      0.26,
      item.index,
      {
        name: FONT_EN,
        size: '12pt',
        bold: true,
        color: C.white,
      },
      'center',
    )
    box(s, nm(s, `${base}Bg`), 'rectangle', x, y + 0.36, w, h - 0.36, C.white)
    setLine(s, nm(s, `${base}Bg`), C.grid, '0.7pt')
    if (item.icon)
      icon(s, nm(s, `${base}Icon`), item.icon, x + w / 2 - 0.18, y + 0.67, 0.36, 0.36, {
        color: accent,
        strokeWidth: 2,
      })
    tx(
      s,
      nm(s, `${base}Title`),
      x + 0.18,
      y + 1.08,
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
    box(s, nm(s, `${base}Rule1`), 'rectangle', x + 0.28, y + 1.62, w - 0.56, 0.012, C.grid)
    tx(
      s,
      nm(s, `${base}Body`),
      x + 0.24,
      y + 1.78,
      w - 0.48,
      0.78,
      asLines(item.body),
      {
        name: FONT_EN,
        size: '8.2pt',
        color: C.text2,
      },
      'center',
    )
    box(s, nm(s, `${base}Rule2`), 'rectangle', x + 0.28, y + 2.72, w - 0.56, 0.012, C.grid)
    tx(s, nm(s, `${base}OutLab`), x + 0.24, y + 2.9, w - 0.48, 0.14, 'BUSINESS OUTCOME:', {
      name: FONT_EN,
      size: '6.3pt',
      bold: true,
      color: C.muted,
    })
    tx(s, nm(s, `${base}Out`), x + 0.24, y + 3.12, w - 0.48, 0.36, asLines(item.outcome), {
      name: FONT_EN,
      size: '8pt',
      bold: true,
      color: C.primary,
    })
    box(s, nm(s, `${base}Rule3`), 'rectangle', x + 0.28, y + 3.66, w - 0.56, 0.012, C.grid)
    tx(s, nm(s, `${base}KpiLab`), x + 0.24, y + 3.84, w - 0.48, 0.14, 'KPI TARGET', {
      name: FONT_EN,
      size: '6.3pt',
      bold: true,
      color: C.muted,
    })
    tx(s, nm(s, `${base}Kpi`), x + 0.24, y + 4.1, w - 0.48, 0.42, asLines(item.kpi), {
      name: FONT_EN,
      size: '12pt',
      bold: true,
      color: item.kpiColor ?? C.amber,
    })
    tx(
      s,
      nm(s, `${base}Time`),
      x + 0.24,
      y + 4.58,
      w - 0.48,
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
    box(s, nm(s, `${base}Bg`), 'rectangle', x, y, w, h, C.surface)
    box(s, nm(s, `${base}Top`), 'rectangle', x, y, w, 0.05, color)
    tx(s, nm(s, `${base}Title`), x + 0.16, y + 0.18, w - 0.32, 0.17, title, {
      name: FONT_EN,
      size: '7.5pt',
      bold: true,
      color,
    })
    tx(s, nm(s, `${base}Text`), x + 0.16, y + 0.36, w - 0.32, h - 0.4, asLines(lines), {
      name: FONT_EN,
      size: '7.3pt',
      color: C.text2,
    })
  }

  return { metricCard, hBar, miniBar, pillarCard, smallInfo, card, tx, box, icon, fillText }
}

function makePageTypes(builders, chrome, components, total) {
  const { tx, box, card, icon, fillText, addSlide, setLine } = builders
  const { topRule, header, footer, sectionLabel, noteBox, cardCaption } = chrome
  const { metricCard, hBar, miniBar, pillarCard, smallInfo } = components

  function mckCoverSlide(s, data) {
    addSlide(s)
    box(s, nm(s, 'HeroBg'), 'rectangle', 0, 0, SLIDE_W, 3.04, C.primary)
    box(s, nm(s, 'HeroDeep'), 'rectangle', 0, 0, 7.8, 3.04, C.navy)
    box(s, nm(s, 'HeroBlue'), 'rectangle', 7.8, 0, 5.53, 3.04, C.blue)
    ;[
      [8.65, 0.05, 3.85, '0E4F7E'],
      [9.45, 0.42, 2.55, '116A9E'],
      [10.12, 0.82, 1.36, '2A7FAF'],
      [10.53, 1.18, 0.64, '3B8CBC'],
    ].forEach(([x, y, d, color], i) => box(s, nm(s, `Ring${i}`), 'oval', x, y, d, d, color))
    tx(s, nm(s, 'Eyebrow'), 0.82, 0.42, 3.4, 0.16, data.eyebrow, {
      name: FONT_EN,
      size: '6.8pt',
      color: C.muted,
    })
    box(s, nm(s, 'EyebrowRule'), 'rectangle', 0.83, 0.66, 4.95, 0.012, C.teal)
    tx(s, nm(s, 'Title1'), 0.78, 1.08, 5.75, 0.46, data.title[0], {
      name: FONT_EN,
      size: '26pt',
      bold: true,
      color: C.white,
    })
    tx(s, nm(s, 'Title2'), 0.78, 1.66, 5.75, 0.46, data.title[1], {
      name: FONT_EN,
      size: '26pt',
      bold: true,
      color: C.white,
    })
    box(s, nm(s, 'Accent'), 'rectangle', 0.83, 2.26, 0.56, 0.035, C.sky)
    tx(s, nm(s, 'Subtitle'), 0.82, 2.34, 7.1, 0.2, data.subtitle, {
      name: FONT_EN,
      size: '9pt',
      color: C.line,
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
      color: C.amber,
    })
    footer(s, total, data.source)
  }

  function mckCrisisSnapshotSlide(s, data) {
    addSlide(s)
    header(s, data.title, data.subtitle)
    const cards = data.metrics ?? []
    const cells = grid(3, 0.22, MX, CW)
    cards.forEach((item, i) =>
      metricCard(s, `Metric${i}`, cells[i].x, 1.34, cells[i].w, 1.52, {
        ...item,
        bg: item.bg ?? [C.redTint, C.amberTint, C.redTint][i],
      }),
    )
    sectionLabel(s, nm(s, 'FateLabel'), MX, 3.02, 4.4, data.cohortTitle)
    const x = MX
    const y = 3.25
    const w = CW
    const h = 0.42
    let cursor = x
    ;(data.cohort ?? []).forEach((item, i) => {
      const segW = w * (item.value / 100)
      box(s, nm(s, `Cohort${i}`), 'rectangle', cursor, y, segW, h, item.color)
      tx(
        s,
        nm(s, `CohortVal${i}`),
        cursor,
        y + 0.12,
        segW,
        0.16,
        String(item.value),
        {
          name: FONT_EN,
          size: '8.8pt',
          bold: true,
          color: item.color === C.line ? C.slate : C.white,
        },
        'center',
      )
      tx(
        s,
        nm(s, `CohortLab${i}`),
        cursor,
        y + 0.62,
        segW,
        0.2,
        item.label,
        {
          name: FONT_EN,
          size: '7pt',
          bold: true,
          color: item.color,
        },
        'center',
      )
      if (item.note) {
        tx(
          s,
          nm(s, `CohortNote${i}`),
          cursor,
          y + 0.82,
          segW,
          0.18,
          item.note,
          {
            name: FONT_EN,
            size: '6.5pt',
            color: item.color,
          },
          'center',
        )
      }
      cursor += segW
    })
    box(s, nm(s, 'CohortRule'), 'rectangle', 5.38, 4.45, 3.0, 0.02, C.red)
    tx(
      s,
      nm(s, 'CohortSum'),
      5.0,
      4.55,
      4.1,
      0.16,
      data.cohortSum,
      {
        name: FONT_EN,
        size: '7.4pt',
        bold: true,
        color: C.red,
      },
      'center',
    )
    noteBox(
      s,
      'Imp',
      MX,
      4.98,
      CW,
      0.72,
      data.implication.title,
      data.implication.body,
      C.blue,
      C.blueTint,
    )
    smallInfo(s, 'Gap', MX, 5.92, 4.4, 0.68, data.gap.title, data.gap.body, C.amber)
    smallInfo(s, 'Lever', 8.6, 5.92, 4.32, 0.68, data.lever.title, data.lever.body, C.green)
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
    box(s, nm(s, 'InterestBg'), 'rectangle', rightX, 4.28, 6.1, 1.56, C.surface)
    tx(s, nm(s, 'InterestRank'), rightX + 0.18, 4.45, 2.8, 0.14, 'RANKED BY CUSTOMER IMPORTANCE', {
      name: FONT_EN,
      size: '6.5pt',
      bold: true,
      color: C.muted,
    })
    ;(data.interests ?? []).forEach(([rank, interest, angle], i) => {
      const y = 4.68 + i * 0.22
      box(s, nm(s, `Rank${i}`), 'rectangle', rightX + 0.18, y, 0.18, 0.16, C.primary)
      tx(
        s,
        nm(s, `RankT${i}`),
        rightX + 0.18,
        y + 0.02,
        0.18,
        0.1,
        String(rank),
        {
          name: FONT_EN,
          size: '6pt',
          bold: true,
          color: C.white,
        },
        'center',
      )
      tx(s, nm(s, `Interest${i}`), rightX + 0.48, y, 1.7, 0.14, interest, {
        name: FONT_EN,
        size: '7.5pt',
        bold: true,
        color: C.text,
      })
      tx(s, nm(s, `Angle${i}`), rightX + 2.45, y, 3.3, 0.14, `→ ${angle}`, {
        name: FONT_EN,
        size: '7.1pt',
        color: C.teal,
      })
    })
    tx(s, nm(s, 'InterestNote'), rightX + 0.18, 5.88, 5.7, 0.14, data.interestNote, {
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
      box(s, nm(s, `Bubble${i}`), 'oval', x - d / 2, y - d / 2, d, d, b.color)
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
          color: C.white,
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
      box(s, nm(s, `LegDot${i}`), 'oval', legendX, y, 0.18, 0.18, color)
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
    const chartX = MX
    const chartY = 1.72
    const chartW = 7.85
    ;(data.drivers ?? []).forEach((item, i) => {
      hBar(
        s,
        `Driver${i}`,
        chartX,
        chartY + i * 0.72,
        chartW - 2.25,
        0.34,
        item.value,
        75,
        item.color,
        item.label,
        item.sub,
        `${item.value}%`,
      )
      if (item.tag) {
        box(
          s,
          nm(s, `DriverTag${i}`),
          'rectangle',
          chartX + 6.35,
          chartY + i * 0.72 + 0.03,
          1.25,
          0.25,
          item.tagBg ?? C.redTint,
        )
        tx(
          s,
          nm(s, `DriverTagT${i}`),
          chartX + 6.4,
          chartY + i * 0.72 + 0.1,
          1.14,
          0.1,
          item.tag,
          {
            name: FONT_EN,
            size: '6pt',
            bold: true,
            color: item.tagColor ?? item.color,
          },
          'center',
        )
      }
      if (item.action) {
        const actionX = item.tag ? chartX + 6.4 : chartX + 4.95
        const actionW = item.tag ? 1.95 : 3.3
        tx(
          s,
          nm(s, `DriverAct${i}`),
          actionX,
          chartY + i * 0.72 + 0.3,
          actionW,
          0.14,
          item.action,
          {
            name: FONT_EN,
            size: '6.6pt',
            color: item.color,
          },
        )
      }
    })
    box(s, nm(s, 'ControllableBracket'), 'rectangle', chartX, chartY + 0.42, 0.02, 1.05, C.red)
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
        color: C.muted,
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
        color: C.amber,
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
      0.42,
      asLines(data.summary.eq),
      {
        name: FONT_EN,
        size: '7.5pt',
        color: C.line,
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
      C.slate,
    )
    noteBox(
      s,
      'Pareto',
      MX,
      6.0,
      8.5,
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
    const cells = grid(4, 0.08, MX, CW)
    ;(data.pillars ?? []).forEach((item, i) =>
      pillarCard(s, `Pillar${i}`, cells[i].x, 1.32, cells[i].w, 5.6, item, i),
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
      const accent = item.accent ?? ACCENTS[i]
      box(s, nm(s, `Init${i}Bg`), 'rectangle', x, 1.55, w, 5.35, C.white)
      setLine(s, nm(s, `Init${i}Bg`), C.grid, '0.7pt')
      box(s, nm(s, `Init${i}Top`), 'rectangle', x, 1.55, w, 0.06, accent)
      tx(s, nm(s, `Init${i}Idx`), x + 0.12, 1.72, 0.38, 0.18, item.index, {
        name: FONT_EN,
        size: '11pt',
        bold: true,
        color: accent,
      })
      tx(
        s,
        nm(s, `Init${i}Tag`),
        x + 0.78,
        1.74,
        w - 0.9,
        0.12,
        item.tag,
        {
          name: FONT_EN,
          size: '6pt',
          bold: true,
          color: accent,
        },
        'right',
      )
      if (item.icon)
        icon(s, nm(s, `Init${i}Icon`), item.icon, x + w / 2 - 0.17, 2.1, 0.34, 0.34, {
          color: accent,
          strokeWidth: 2,
        })
      tx(
        s,
        nm(s, `Init${i}Title`),
        x + 0.18,
        2.56,
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
      box(s, nm(s, `Init${i}Rule1`), 'rectangle', x + 0.18, 3.2, w - 0.36, 0.012, C.grid)
      tx(
        s,
        nm(s, `Init${i}Body`),
        x + 0.18,
        3.38,
        w - 0.36,
        0.78,
        asLines(item.body),
        {
          name: FONT_EN,
          size: '7.6pt',
          color: C.text2,
        },
        'center',
      )
      const labels = [
        ['COST LEVEL', item.cost],
        ['STRATEGIC PILLARS', item.pillars],
        ['PROPOSED BY', item.owner],
      ]
      labels.forEach(([label, value], j) => {
        const y = 4.38 + j * 0.46
        tx(s, nm(s, `Init${i}Lab${j}`), x + 0.18, y, w - 0.36, 0.12, label, {
          name: FONT_EN,
          size: '6.1pt',
          bold: true,
          color: C.muted,
        })
        tx(s, nm(s, `Init${i}Val${j}`), x + 0.18, y + 0.16, w - 0.36, 0.16, value, {
          name: FONT_EN,
          size: '7.6pt',
          bold: true,
          color: j === 0 ? C.text : accent,
        })
      })
      box(s, nm(s, `Init${i}Rule2`), 'rectangle', x + 0.18, 5.9, w - 0.36, 0.012, C.grid)
      tx(s, nm(s, `Init${i}Foot`), x + 0.18, 6.1, w - 0.36, 0.44, asLines(item.footer), {
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
      const accent = phase.accent ?? [C.navy, C.primary, C.blue, C.teal][i]
      box(s, nm(s, `Phase${i}Top`), 'rectangle', x, 1.32, w, 0.42, accent)
      tx(
        s,
        nm(s, `Phase${i}Title`),
        x + 0.05,
        1.43,
        w - 0.1,
        0.2,
        phase.title,
        {
          name: FONT_EN,
          size: '7.2pt',
          bold: true,
          color: C.white,
        },
        'center',
      )
      box(s, nm(s, `Phase${i}Bg`), 'rectangle', x, 1.74, w, 1.24, C.surface)
      tx(
        s,
        nm(s, `Phase${i}Sub`),
        x + 0.12,
        1.88,
        w - 0.24,
        0.14,
        phase.sub,
        {
          name: FONT_EN,
          size: '6.8pt',
          color: C.slate,
        },
        'center',
      )
      ;(phase.items ?? []).forEach(([name, desc, iconName], j) => {
        const y = 2.08 + j * 0.34
        if (iconName)
          icon(s, nm(s, `Phase${i}Icon${j}`), iconName, x + 0.16, y - 0.01, 0.16, 0.16, {
            color: accent,
            strokeWidth: 2,
          })
        tx(s, nm(s, `Phase${i}Item${j}`), x + 0.42, y, w - 0.54, 0.14, name, {
          name: FONT_EN,
          size: '7.5pt',
          bold: true,
          color: C.text,
        })
        tx(s, nm(s, `Phase${i}Desc${j}`), x + 0.42, y + 0.16, w - 0.54, 0.12, desc, {
          name: FONT_EN,
          size: '6.5pt',
          color: C.slate,
        })
      })
      tx(s, nm(s, `Phase${i}Cost`), x + 0.12, 2.76, w - 0.24, 0.14, phase.cost, {
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
    tx(s, nm(s, 'End'), 12.45, axisY - 0.03, 0.36, 0.12, 'END', {
      name: FONT_EN,
      size: '6pt',
      color: C.blue,
    })

    const metrics = data.metrics ?? []
    const metricCells = grid(3, 0.18, MX, CW)
    metrics.forEach((m, i) => {
      const { x, w } = metricCells[i]
      box(s, nm(s, `RoadM${i}Bg`), 'rectangle', x, 3.78, w, 1.42, C.white)
      setLine(s, nm(s, `RoadM${i}Bg`), C.grid, '0.7pt')
      box(s, nm(s, `RoadM${i}Top`), 'rectangle', x, 3.78, w, 0.05, m.accent)
      tx(s, nm(s, `RoadM${i}Lab`), x + 0.2, 4.02, 1.9, 0.12, m.label, {
        name: FONT_EN,
        size: '6.6pt',
        color: C.muted,
      })
      tx(s, nm(s, `RoadM${i}Val`), x + 0.22, 4.28, 1.35, 0.34, m.value, {
        name: FONT_EN,
        size: '22pt',
        bold: true,
        color: m.accent,
      })
      box(s, nm(s, `RoadM${i}Sep`), 'rectangle', x + 1.75, 4.12, 0.012, 0.72, C.grid)
      tx(s, nm(s, `RoadM${i}Target`), x + 1.95, 4.12, w - 2.16, 0.28, m.target, {
        name: FONT_EN,
        size: '8pt',
        bold: true,
        color: C.text2,
      })
      tx(s, nm(s, `RoadM${i}By`), x + 1.95, 4.48, w - 2.16, 0.14, m.by, {
        name: FONT_EN,
        size: '6.6pt',
        color: C.slate,
      })
      tx(s, nm(s, `RoadM${i}Note`), x + 0.22, 4.86, w - 0.44, 0.16, m.note, {
        name: FONT_EN,
        size: '7pt',
        color: C.text2,
      })
    })

    box(s, nm(s, 'GovernanceBg'), 'rectangle', MX, 5.62, CW, 0.92, C.deep)
    tx(
      s,
      nm(s, 'GovTitle'),
      MX,
      5.82,
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
        6.1,
        w,
        0.12,
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
        6.27,
        w,
        0.12,
        primary,
        {
          name: FONT_EN,
          size: '7.5pt',
          bold: true,
          color: i === 1 ? C.amber : C.white,
        },
        'center',
      )
      tx(
        s,
        nm(s, `GovSec${i}`),
        x,
        6.43,
        w,
        0.12,
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
