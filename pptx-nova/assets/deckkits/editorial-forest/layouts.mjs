import { fitTextPlan } from '../shared/text-layout.mjs'
import { designHash, selectDesignLayout, textUnits } from '../shared/design-contract.mjs'
export const number = (n) => {
  if (!Number.isFinite(n)) throw Error('Finite value required')
  return n !== 0 && (Math.abs(n) < 0.001 || Math.abs(n) >= 1e7)
    ? n.toExponential(2)
    : String(Number(n.toPrecision(9)))
}
export const numberFormat = (values) =>
  values.some((v) => v && (Math.abs(v) < 0.001 || Math.abs(v) >= 1e7))
    ? '0.00E+00'
    : values.every(Number.isInteger)
      ? '0'
      : '0.00'
export function compileForestLayout(d, role, id, r, data, path = 'data') {
  const cs = [],
    b = d.forest,
    dark = ['cover', 'chart', 'stats', 'closing'].includes(role),
    surface = dark ? 'ink' : role === 'quote' ? 'accent' : 'paper',
    fg = dark ? 'paper' : role === 'quote' ? 'deep' : 'ink',
    label = dark ? 'accent' : fg
  const tx = (name, frame, value, key = 'body', fields = name, extra = {}) => {
    const paths = (Array.isArray(fields) ? fields : [fields]).map((k) => `${path}.${k}`)
    const c = {
      ...fitTextPlan(value, frame, { ...b.styles[key], ...extra }, paths[0]),
      name,
      paths,
    }
    cs.push(c)
    return c
  }
  const box = (name, frame, color, kind = 'box') => cs.push({ kind, name, frame, color })
  const rule = (name, x, y, w, color = label) => box(name, [x, y, w, 1 / 72], color)
  const cells = (f, n, vertical = false, g = b.spacing.gap) =>
    Array.from({ length: n }, (_, i) =>
      vertical
        ? [f[0], f[1] + (i * (f[3] + g)) / n, f[2], (f[3] - g * (n - 1)) / n]
        : [f[0] + (i * (f[2] + g)) / n, f[1], (f[2] - g * (n - 1)) / n, f[3]],
    )
  const rounded = (name, f, tone, border) => {
    const rad = 0.045,
      rx = (rad / f[2]) * 100000,
      ry = (rad / f[3]) * 100000,
      k = 0.55228475,
      W = 100000,
      H = W
    cs.push({
      kind: 'path',
      name,
      frame: f,
      fill: tone,
      line: border,
      linePt: 1,
      path: {
        width: W,
        height: H,
        commands: [
          { type: 'move', x: rx, y: 0 },
          { type: 'line', x: W - rx, y: 0 },
          { type: 'cubic', x1: W - rx + k * rx, y1: 0, x2: W, y2: ry - k * ry, x: W, y: ry },
          { type: 'line', x: W, y: H - ry },
          {
            type: 'cubic',
            x1: W,
            y1: H - ry + k * ry,
            x2: W - rx + k * rx,
            y2: H,
            x: W - rx,
            y: H,
          },
          { type: 'line', x: rx, y: H },
          { type: 'cubic', x1: rx - k * rx, y1: H, x2: 0, y2: H - ry + k * ry, x: 0, y: H - ry },
          { type: 'line', x: 0, y: ry },
          { type: 'cubic', x1: 0, y1: ry - k * ry, x2: rx - k * rx, y2: 0, x: rx, y: 0 },
          { type: 'close' },
        ].map((v) =>
          Object.fromEntries(
            Object.entries(v).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v) : v]),
          ),
        ),
      },
    })
  }
  tx('Eyebrow', b.chrome.eyebrow, data.eyebrow, 'label', 'eyebrow', { color: label })
  if (data.corner)
    tx('Corner', b.chrome.corner, data.corner, 'small', 'corner', {
      color: label,
      alignment: 'right',
    })
  tx(
    'Source',
    role === 'cover' ? [...b.chrome.source.slice(0, 2), 7.2, b.chrome.source[3]] : b.chrome.source,
    data.source,
    'small',
    'source',
    { color: label },
  )
  if (role === 'cover') {
    if ([...data.monogram].length > 3) throw Error('Monogram accepts at most three glyphs')
    const c = tx('Monogram', r.stamp, data.monogram, 'small', 'monogram', {
      color: 'accent',
      alignment: 'center',
    })
    Object.assign(c, {
      kind: 'owned',
      shapeKind: 'ellipse',
      color: surface,
      outline: 'accent',
      anchor: 'middle',
    })
    tx('CoverTitle', r.hero, data.title, 'hero', 'title')
    tx('Byline', r.byline, data.byline, 'label', 'byline', { color: 'accent', alignment: 'right' })
  } else if (role === 'index') {
    if (id === 'mosaic' && data.items.length !== 5)
      throw Error('Mosaic requires five topics; use rows for three or four')
    tx('Title', r.title, data.title, 'title', 'title')
    const f = r.tiles,
      count = data.items.length
    const small = cells([f[0] + f[2] * 0.4 + 0.1, f[1], f[2] * 0.6 - 0.1, f[3]], 2).map((c) =>
      cells(c, 2, true),
    )
    const fs =
      id === 'mosaic'
        ? [[f[0], f[1], f[2] * 0.4 - 0.1, f[3]], small[0][0], small[1][0], small[0][1], small[1][1]]
        : cells(f, count, true, 0.16)
    data.items.forEach((v, i) => {
      const [x, y, w, h] = fs[i],
        tone = ['ink', 'accent', 'pale', 'light', 'accent'][i],
        color = ['ink', 'light'].includes(tone) ? 'accent' : tone === 'accent' ? 'deep' : 'ink'
      rounded('TopicTile' + i, fs[i], tone, tone === 'pale' ? 'ink' : undefined)
      if (id === 'mosaic') {
        tx(
          'TopicNumber' + i,
          [x + 0.22, y + 0.2, w - 0.44, 0.3],
          String(i + 1).padStart(2, '0'),
          'small',
          'structural.number',
          { color: tone === 'light' ? 'paper' : color },
        )
        tx(
          'TopicTitle' + i,
          [x + 0.22, y + 0.6, w - 0.44, h - 1.1],
          v.title,
          i === 0 ? 'lead' : 'tile',
          `items[${i}].title`,
          { color },
        )
        tx(
          'TopicTag' + i,
          [x + 0.22, y + h - 0.48, w - 0.44, 0.28],
          v.tag,
          'small',
          `items[${i}].tag`,
          { color: tone === 'light' ? 'paper' : color },
        )
      } else {
        tx(
          'TopicNumber' + i,
          [x + 0.22, y + 0.16, 0.5, h - 0.25],
          String(i + 1).padStart(2, '0'),
          'small',
          'structural.number',
          { color: tone === 'light' ? 'paper' : color },
        )
        tx(
          'TopicTitle' + i,
          [x + 1, y + 0.12, w * 0.65, h - 0.2],
          v.title,
          'tile',
          `items[${i}].title`,
          { color },
        )
        tx(
          'TopicTag' + i,
          [x + w * 0.78, y + 0.2, w * 0.2 - 0.15, h - 0.3],
          v.tag,
          'small',
          `items[${i}].tag`,
          { color: tone === 'light' ? 'paper' : color, alignment: 'right' },
        )
      }
    })
  } else if (role === 'quote') {
    tx('Quote', r.quote, data.title, id === 'broad' ? 'statement' : 'title', 'title')
    tx('Attribution', r.attribution, data.attribution, 'tile', 'attribution', { color: 'deep' })
    tx('AttributionRole', r.details, data.role, 'label', 'role', { color: 'deep' })
  } else if (role === 'feature') {
    rounded('FeatureShell', r.shell, 'ink')
    const [x, y, w, h] = r.shell
    tx(
      'AssetCaption',
      [x + 0.3, y + h * 0.42, w - 0.6, 1.15],
      data.assetCaption,
      'tile',
      'assetCaption',
      { color: 'accent', alignment: 'center' },
    )
    tx(
      'AssetLabel',
      [x + 0.25, y + h - 0.65, w - 0.5, 0.38],
      data.assetLabel,
      'small',
      'assetLabel',
      { color: 'accent' },
    )
    tx('Title', r.title, data.title, 'title', 'title')
    cells(r.body, data.paragraphs.length, true, 0.12).forEach((f, i) =>
      tx('Body' + i, f, data.paragraphs[i], 'body', `paragraphs[${i}]`),
    )
    rule('MetaRule', r.meta[0], r.meta[1], r.meta[2], 'ink')
    cells(r.meta, data.metadata.length, false, 0.2).forEach(([x, y, w, h], i) => {
      tx(
        'MetaLabel' + i,
        [x, y + 0.12, w, 0.26],
        data.metadata[i].label,
        'small',
        `metadata[${i}].label`,
      )
      tx(
        'MetaValue' + i,
        [x, y + 0.43, w, h - 0.43],
        data.metadata[i].value,
        'body',
        `metadata[${i}].value`,
      )
    })
  } else if (role === 'chart') {
    if (data.series.some((v) => v.values.length !== data.categories.length))
      throw Error('Every series must match all categories')
    tx('Title', r.title, data.title, id === 'rail' ? 'tile' : 'title', 'title', { color: 'paper' })
    const f = r.legend
    cells(f, data.series.length, false, 0.18).forEach(([x, y, w, h], i) => {
      box('LegendSwatch' + i, [x, y + 0.07, 0.16, 0.16], i ? 'paper' : 'accent')
      tx(
        'SeriesLabel' + i,
        [x + 0.25, y, w - 0.25, h],
        data.series[i].name,
        'small',
        `series[${i}].name`,
        { color: 'paper' },
      )
    })
    tx('Unit', r.unit, data.unit, 'small', 'unit', { color: 'paper' })
    const vs = data.series.flatMap((v) => v.values),
      lo = Math.min(0, ...vs),
      hi = Math.max(0, ...vs),
      span = hi - lo || 1
    if (!Number.isFinite(lo - span * 0.2) || !Number.isFinite(hi + span * 0.22))
      throw Error('Numeric chart domain exceeds finite range')
    const exact = vs.some((v) => (v !== 0 && Math.abs(v) < 0.001) || number(v).length > 5)
    const plotFrame = [...r.plot]
    if (exact) plotFrame[3] -= 1.35
    cs.push({
      kind: 'chart',
      name: 'Evidence',
      frame: plotFrame,
      chartKind: 'column',
      data: { categories: data.categories, series: data.series },
      minimum: lo < 0 ? lo - span * 0.2 : 0,
      maximum: hi + span * 0.22,
      uniformSeriesTone: 'accent',
      numberFormat: numberFormat(vs),
      showValues: !exact,
      inputPaths: [
        ...data.categories.map((_, i) => `${path}.categories[${i}]`),
        ...data.series.flatMap((v, i) =>
          v.values.map((_, j) => `${path}.series[${i}].values[${j}]`),
        ),
      ],
    })
    if (exact) {
      const frame = [r.plot[0], r.plot[1] + r.plot[3] - 1.1, r.plot[2], 1.1]
      const all = [
        ['', ...data.categories],
        ...data.series.map((v) => [v.name, ...v.values.map(number)]),
      ]
      const widths = Array.from(
        { length: data.categories.length + 1 },
        () => frame[2] / (data.categories.length + 1),
      )
      const rh = frame[3] / all.length,
        bindings = []
      all.forEach((row, i) => {
        let x = frame[0]
        row.forEach((value, j) => {
          const st = { ...b.styles.small, color: 'paper' }
          const f = [x + 0.075, frame[1] + i * rh + 0.055, widths[j] - 0.15, rh - 0.11]
          if (value) fitTextPlan(value, f, st, `${path}.exactValues[${i}][${j}]`)
          const paths =
            i === 0
              ? j
                ? [`${path}.categories[${j - 1}]`]
                : []
              : [
                  j === 0
                    ? `${path}.series[${i - 1}].name`
                    : `${path}.series[${i - 1}].values[${j - 1}]`,
                ]
          bindings.push({ paths, frame: f, style: st })
          x += widths[j]
        })
      })
      cs.push({
        kind: 'table',
        name: 'ExactValues',
        frame,
        cells: all,
        columns: widths.map(() => ({ align: 'left' })),
        widths,
        rowHeights: all.map(() => rh),
        focusColumn: -1,
        bindings,
        useBindingStyles: true,
        cellTones: all.map((row) => row.map(() => 'paper')),
        dark: true,
      })
    }
  } else if (role === 'process') {
    tx('Title', r.title, data.title, 'title', 'title')
    cells(r.steps, data.steps.length, id === 'rows', 0.22).forEach(([x, y, w, h], i) => {
      const tone = ['paper', 'accent', 'ink', 'paper'][i],
        color = tone === 'ink' ? 'paper' : tone === 'accent' ? 'deep' : 'ink'
      rounded('StepTile' + i, [x, y, w, h], tone, tone === 'accent' ? 'roseEdge' : 'ink')
      if (id === 'columns') {
        tx(
          'StepNumber' + i,
          [x + 0.21, y + 0.2, w - 0.42, 0.3],
          String(i + 1).padStart(2, '0'),
          'small',
          'structural.number',
          { color },
        )
        tx(
          'StepTitle' + i,
          [x + 0.21, y + 0.7, w - 0.42, 0.65],
          data.steps[i].title,
          'tile',
          `steps[${i}].title`,
          { color: tone === 'ink' ? 'accent' : color },
        )
        tx(
          'StepBody' + i,
          [x + 0.21, y + 1.56, w - 0.42, h - 2.45],
          data.steps[i].body,
          'card',
          `steps[${i}].body`,
          { color },
        )
        rule('StepRule' + i, x + 0.21, y + h - 0.74, w - 0.42, color)
        tx(
          'StepMarker' + i,
          [x + 0.21, y + h - 0.56, w - 0.42, 0.35],
          `${data.steps[i].period} · ${data.steps[i].owner}`,
          'small',
          [`steps[${i}].period`, `steps[${i}].owner`],
          { color },
        )
      } else {
        tx(
          'StepTitle' + i,
          [x + 0.2, y + 0.14, w * 0.26, h - 0.23],
          `${i + 1} ${data.steps[i].title}`,
          'tile',
          `steps[${i}].title`,
          { color },
        )
        tx(
          'StepBody' + i,
          [x + w * 0.3, y + 0.16, w * 0.44, h - 0.25],
          data.steps[i].body,
          'card',
          `steps[${i}].body`,
          { color },
        )
        tx(
          'StepMarker' + i,
          [x + w * 0.77, y + 0.18, w * 0.21, h - 0.25],
          `${data.steps[i].period}\n${data.steps[i].owner}`,
          'small',
          [`steps[${i}].period`, `steps[${i}].owner`],
          { color },
        )
      }
    })
  } else if (role === 'stats') {
    tx('Title', r.title, data.title, 'title', 'title', { color: 'paper' })
    rule('StatsRule', r.stats[0], r.stats[1], r.stats[2])
    cells(r.stats, data.stats.length, id === 'rows', 0.45).forEach(([x, y, w, h], i) => {
      const v = data.stats[i]
      if (id === 'band') {
        tx('StatTag' + i, [x, y + 0.25, w, 0.32], v.label, 'small', `stats[${i}].label`, {
          color: 'accent',
        })
        const unitWidth = (textUnits(v.unit) * b.styles.unit.sizePt) / 72 + 0.1
        fitTextPlan(
          v.unit,
          [x, y + 0.82, unitWidth, 1.75],
          b.styles.unit,
          `${path}.stats[${i}].unit`,
        )
        fitTextPlan(
          v.value,
          [x, y + 0.82, w - unitWidth, 1.75],
          b.styles.metric,
          `${path}.stats[${i}].value`,
        )
        const c = tx('StatNumber' + i, [x, y + 0.82, w, 1.75], v.value, 'metric', [
          `stats[${i}].value`,
          `stats[${i}].unit`,
        ])
        c.text = v.value + v.unit
        c.runs = [
          { text: v.value, style: b.styles.metric },
          { text: v.unit, style: b.styles.unit },
        ]
        tx('StatBody' + i, [x, y + 2.8, w, h - 2.8], v.body, 'body', `stats[${i}].body`, {
          color: 'paper',
        })
      } else {
        tx('StatTag' + i, [x, y + 0.12, w * 0.18, h - 0.2], v.label, 'small', `stats[${i}].label`, {
          color: 'accent',
        })
        tx(
          'StatNumber' + i,
          [x + w * 0.21, y + 0.05, w * 0.3, h - 0.12],
          v.value,
          'lead',
          `stats[${i}].value`,
        )
        tx(
          'StatUnit' + i,
          [x + w * 0.52, y + 0.1, w * 0.1, h - 0.15],
          v.unit,
          'tile',
          `stats[${i}].unit`,
          { color: 'paper' },
        )
        tx(
          'StatBody' + i,
          [x + w * 0.65, y + 0.12, w * 0.35, h - 0.2],
          v.body,
          'body',
          `stats[${i}].body`,
          { color: 'paper' },
        )
      }
    })
  } else if (role === 'matrix') {
    tx('Title', r.title, data.title, 'title', 'title')
    if (!Number.isInteger(data.focusColumn) || data.focusColumn >= data.columns.length)
      throw Error('focusColumn outside columns')
    if (data.rows.some((row) => row.length !== data.columns.length))
      throw Error('Every table row must match all columns')
    const total = data.columns.reduce((a, v) => a + v.weight, 0)
    if (!Number.isFinite(total)) throw Error('Column weight total must remain finite')
    const widths = data.columns.map((v) => (r.table[2] * v.weight) / total),
      all = [data.columns.map((v) => v.label), ...data.rows],
      rh = r.table[3] / all.length,
      bindings = []
    all.forEach((row, i) => {
      let x = r.table[0]
      row.forEach((v, j) => {
        if (/[\r\n]/u.test(v)) throw Error('Native table cells require a single paragraph')
        const frame = [x + 0.08, r.table[1] + i * rh + 0.06, widths[j] - 0.16, rh - 0.12],
          style = { ...b.styles[i ? 'table' : 'small'], bold: i === 0 || j === data.focusColumn }
        const p = `${path}.${i ? `rows[${i - 1}][${j}]` : `columns[${j}].label`}`
        fitTextPlan(v, frame, style, p)
        bindings.push({ paths: [p], frame, style })
        x += widths[j]
      })
    })
    cs.push({
      kind: 'table',
      name: 'Register',
      frame: r.table,
      cells: all,
      columns: data.columns,
      widths,
      rowHeights: all.map(() => rh),
      focusColumn: data.focusColumn,
      focusTone: 'pale',
      bindings,
      useBindingStyles: true,
    })
    tx('MethodNote', r.note, data.note, 'small', 'note')
  } else if (role === 'closing') {
    tx('ClosingTitle', r.title, data.title, id === 'broad' ? 'hero' : 'statement', 'title', {
      color: 'accent',
    })
    rule('ClosingRule', r.items[0], r.items[1], r.items[2])
    cells(r.items, data.items.length, id === 'rail', 0.4).forEach(([x, y, w, h], i) => {
      tx(
        'TakeawayLabel' + i,
        [x, y + 0.2, w, 0.35],
        data.items[i].label,
        'label',
        `items[${i}].label`,
        { color: 'accent' },
      )
      tx(
        'TakeawayBody' + i,
        [x, y + 0.7, w, h - 0.7],
        data.items[i].body,
        'body',
        `items[${i}].body`,
        { color: 'paper' },
      )
    })
  }
  return { role, layoutId: id, surface, components: cs }
}
export function resolveForestDeck(design, content, { validateData } = {}) {
  if (content.meta?.deckkit !== design.id) throw Error('Content DeckKit identity mismatch')
  const b = design.forest,
    layouts = [],
    warnings = []
  if (!content.slides?.length) throw Error('At least one slide required')
  if (
    content.meta.designScope !== 'excerpt' &&
    (content.slides[0].type !== 'forestCoverSlide' ||
      content.slides.at(-1).type !== 'forestClosingSlide')
  )
    throw Error(
      'Complete decks open with cover and end with closing; use excerpt scope for extracts',
    )
  for (const [s, slide] of content.slides.entries()) {
    const family = b.families[slide.type]
    if (!family) throw Error(`slides[${s}]: unregistered type`)
    if (slide.customOps || slide.imageSlots)
      throw Error(
        'Forest accepts registered content only; image ingestion and custom operations are not registered',
      )
    validateData?.(slide.type, slide.data, `slides[${s}].data`)
    const failures = [],
      candidates = Object.entries(family.variants).flatMap(([id, v]) => {
        try {
          const l = compileForestLayout(
            design,
            family.role,
            id,
            v.regions,
            slide.data,
            `slides[${s}].data`,
          )
          if (family.role !== 'cover')
            l.components.push({
              ...fitTextPlan(
                `${String(s + 1).padStart(2, '0')} / ${String(content.slides.length).padStart(2, '0')}`,
                b.chrome.page,
                { ...b.styles.small, color: l.surface === 'ink' ? 'accent' : 'ink' },
                'structural.page',
              ),
              name: 'Page',
            })
          for (const c of l.components) {
            const [x, y, w, h] = c.frame
            if (
              [x, y, w, h].some((v) => !Number.isFinite(v)) ||
              Math.min(x, y) < 0 ||
              Math.min(w, h) <= 0 ||
              x + w > design.canvas.widthIn + 0.001 ||
              y + h > design.canvas.heightIn + 0.001
            )
              throw Error(`${c.name}: invalid canvas geometry`)
          }
          return [
            {
              ...l,
              fingerprint: designHash({
                role: family.role,
                frames: l.components.map((c) => [c.kind, c.frame]),
              }),
            },
          ]
        } catch (e) {
          failures.push(`${id}: ${e.message}`)
          return []
        }
      })
    let chosen
    try {
      chosen = selectDesignLayout(
        candidates,
        slide.layoutId ?? 'auto',
        layouts,
        b.rhythm.maxConsecutive,
      )
    } catch (e) {
      throw Error(`slides[${s}]: ${e.message}; ${failures.join('; ')}`)
    }
    Object.assign(chosen, {
      slideIndex: s,
      slideType: slide.type,
      candidates: candidates.map((v) => v.layoutId),
      reason: slide.layoutId && slide.layoutId !== 'auto' ? 'explicit' : 'fit-and-rhythm',
    })
    if (chosen.repeated)
      throw Error(`slides[${s}]: repeated composition exceeds registered cadence`)
    layouts.push(chosen)
  }
  return { layouts, warnings }
}
