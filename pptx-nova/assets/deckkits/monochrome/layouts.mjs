import { designHash, selectDesignLayout } from '../shared/design-contract.mjs'
import { fitTextPlan } from '../shared/text-layout.mjs'

export function compileMonochromeLayout(design, family, layoutId, variant, d, path = 'data') {
  const b = design.monochrome,
    r = variant.regions,
    cs = [],
    gap = b.spacing.gap
  const tx = (name, frame, value, key = 'body', field = name, extra = {}) => {
    const paths = (Array.isArray(field) ? field : [field]).map((k) => `${path}.${k}`)
    const c = {
      ...fitTextPlan(value, frame, { ...b.styles[key], ...extra }, paths[0]),
      name,
      paths,
    }
    // Keep the allocated height as an honest text owner; never shrink the font or omit a field.
    cs.push(c)
    return c
  }
  const box = (name, frame, color = 'ink') => cs.push({ kind: 'box', name, frame, color })
  const rule = (name, x, y, w, vertical = false) =>
    box(name, vertical ? [x, y, b.spacing.ruleIn, w] : [x, y, w, b.spacing.ruleIn])
  const cells = (f, n, vertical = false, g = gap) =>
    Array.from({ length: n }, (_, i) =>
      vertical
        ? [f[0], f[1] + (i * (f[3] + g)) / n, f[2], (f[3] - g * (n - 1)) / n]
        : [f[0] + (i * (f[2] + g)) / n, f[1], (f[2] - g * (n - 1)) / n, f[3]],
    )
  const bullets = (f, values, prefix, name = 'Bullet', style = 'lead') => {
    cells(f, values.length, true, 0.12).forEach(([x, y, w, h], i) => {
      tx(name + 'Mark' + i, [x, y, 0.24, h], '—', 'label', `structural.${name}${i}`)
      tx(name + i, [x + 0.34, y, w - 0.34, h], values[i], style, `${prefix}[${i}]`)
    })
  }
  const role = family.role
  const plain =
    ['cover', 'quote', 'closing'].includes(role) || (role === 'opening' && layoutId === 'chapter')
  if (!plain) {
    tx('Section', b.chrome.section, d.section, 'label', 'section')
    rule('HeaderRule', ...b.chrome.headerRule)
    rule('FooterRule', ...b.chrome.footerRule)
    tx('Source', b.chrome.source, d.source, 'small', 'source')
    if (role !== 'opening') tx('Title', r.title ?? b.chrome.title, d.title, 'title', 'title')
  }
  if (role === 'cover') {
    tx('Section', r.section, d.section, 'label', 'section', { alignment: 'right' })
    tx('Title', r.title, d.title, 'hero', 'title')
    rule('ShortRule', r.body[0], r.body[1] - 0.24, b.spacing.shortRule)
    tx('Body', r.body, d.body, 'lead', 'body')
    rule('CoverRule', ...b.chrome.footerRule)
    tx('Source', b.chrome.source, d.source, 'small', 'source')
  } else if (role === 'opening') {
    if (plain) tx('Section', r.section, d.section, 'label', 'section')
    rule('ShortRule', r.title[0], r.title[1] - 0.18, b.spacing.shortRule)
    tx('Title', r.title, d.title, layoutId === 'chapter' ? 'chapter' : 'statement', 'title')
    tx('Body', r.body, d.body, 'lead', 'body')
    if (plain) tx('Source', b.chrome.source, d.source, 'small', 'source')
  } else if (role === 'split') {
    tx('Body', r.body, d.body, 'lead', 'body')
    bullets(r.items, d.items, 'items')
    // Native editable shell only. No hidden image or reference-asset fallback.
    const [x, y, w, h] = r.asset
    const pathCommands = [
      { type: 'move', x: 0, y: 0 },
      { type: 'line', x: 1000, y: 0 },
      { type: 'line', x: 1000, y: 1000 },
      { type: 'line', x: 0, y: 1000 },
      { type: 'close' },
    ]
    cs.push({
      kind: 'path',
      name: 'AssetShell',
      frame: r.asset,
      fill: 'pale',
      line: 'ink',
      linePt: b.spacing.rulePt,
      path: { width: 1000, height: 1000, commands: pathCommands },
    })
    tx(
      'AssetLabel',
      [x + 0.2, y + h / 2 - 0.2, w - 0.4, 0.4],
      d.assetLabel,
      'label',
      'assetLabel',
      { alignment: 'center' },
    )
    tx('AssetCaption', r.caption, d.assetCaption, 'small', 'assetCaption')
  } else if (role === 'metrics') {
    cells(r.metrics, d.metrics.length, layoutId === 'rail', 0.26).forEach(([x, y, w, h], i) => {
      const m = d.metrics[i],
        p = `metrics[${i}]`
      rule('MetricRule' + i, x, y, w)
      tx(
        'MetricValue' + i,
        [x, y + 0.15, layoutId === 'rail' ? w * 0.31 : w, layoutId === 'rail' ? h - 0.2 : 1.1],
        m.value,
        'number',
        p + '.value',
      )
      tx(
        'MetricDescription' + i,
        layoutId === 'rail' ? [x + w * 0.35, y + 0.18, w * 0.4, h - 0.25] : [x, y + 1.4, w, 1.0],
        m.label,
        'body',
        p + '.label',
      )
      tx(
        'MetricNote' + i,
        layoutId === 'rail'
          ? [x + w * 0.78, y + 0.18, w * 0.22, h - 0.25]
          : [x, y + 2.65, w, h - 2.65],
        m.note,
        'small',
        p + '.note',
      )
    })
  } else if (role === 'list') {
    tx('Body', r.body, d.body, 'body', 'body')
    bullets(r.items, d.items, 'items')
  } else if (role === 'comparison') {
    const vertical = layoutId === 'stacked'
    const panels = cells(r.panels, 2, vertical, 0.6)
    if (!vertical)
      rule('PanelDivider', r.panels[0] + r.panels[2] / 2, r.panels[1], r.panels[3], true)
    panels.forEach(([x, y, w, h], i) => {
      const v = d.panels[i],
        p = `panels[${i}]`
      if (vertical) {
        rule('PanelRule' + i, x, y, w)
        tx('PanelLabel' + i, [x, y + 0.12, 3.0, 0.32], v.label, 'label', p + '.label')
        tx('PanelTitle' + i, [x, y + 0.62, 3.0, h - 0.68], v.title, 'heading', p + '.title')
        tx('PanelBody' + i, [x + 3.5, y + 0.12, w - 3.5, 0.58], v.body, 'body', p + '.body')
        bullets(
          [x + 3.5, y + 0.84, w - 3.5, h - 0.84],
          v.items,
          p + '.items',
          'Panel' + i + 'Bullet',
          'compact',
        )
        return
      }
      tx('PanelLabel' + i, [x, y, w, 0.35], v.label, 'label', p + '.label')
      rule('PanelRule' + i, x, y + 0.46, w)
      tx('PanelTitle' + i, [x, y + 0.64, w, 0.65], v.title, 'heading', p + '.title')
      tx('PanelBody' + i, [x, y + 1.43, w, vertical ? 0.56 : 1.15], v.body, 'body', p + '.body')
      bullets(
        [x, y + (vertical ? 2.08 : 2.74), w, h - (vertical ? 2.08 : 2.74)],
        v.items,
        p + '.items',
        'Panel' + i + 'Bullet',
        'body',
      )
    })
  } else if (role === 'quote') {
    tx('Section', r.section, d.section, 'label', 'section')
    tx('Quote', r.title, d.title, 'quote', 'title')
    tx('Attribution', r.body, d.body, 'label', 'body')
    tx('Source', r.source, d.source, 'small', 'source')
  } else if (role === 'analysis') {
    cells(r.blocks, d.blocks.length, false, 0.3).forEach(([x, y, w, h], i) => {
      const v = d.blocks[i],
        p = `blocks[${i}]`,
        card = layoutId === 'insights'
      if (card) {
        // Source 16px corners map to about .15in, independent of the panel height.
        // Preset roundRect scales its radius with the shape and becomes far too round.
        const radius = Math.min(gap / 3, w / 2, h / 2),
          rx = Math.round((radius / w) * 10000),
          ry = Math.round((radius / h) * 10000),
          k = 0.55228475
        cs.push({
          kind: 'path',
          name: 'InsightSurface' + i,
          frame: [x, y, w, h],
          fill: i % 2 ? 'warm' : 'pale',
          path: {
            width: 10000,
            height: 10000,
            commands: [
              { type: 'move', x: rx, y: 0 },
              { type: 'line', x: 10000 - rx, y: 0 },
              {
                type: 'cubic',
                x1: Math.round(10000 - rx + k * rx),
                y1: 0,
                x2: 10000,
                y2: Math.round(ry - k * ry),
                x: 10000,
                y: ry,
              },
              { type: 'line', x: 10000, y: 10000 - ry },
              {
                type: 'cubic',
                x1: 10000,
                y1: Math.round(10000 - ry + k * ry),
                x2: Math.round(10000 - rx + k * rx),
                y2: 10000,
                x: 10000 - rx,
                y: 10000,
              },
              { type: 'line', x: rx, y: 10000 },
              {
                type: 'cubic',
                x1: Math.round(rx - k * rx),
                y1: 10000,
                x2: 0,
                y2: Math.round(10000 - ry + k * ry),
                x: 0,
                y: 10000 - ry,
              },
              { type: 'line', x: 0, y: ry },
              {
                type: 'cubic',
                x1: 0,
                y1: Math.round(ry - k * ry),
                x2: Math.round(rx - k * rx),
                y2: 0,
                x: rx,
                y: 0,
              },
              { type: 'close' },
            ],
          },
        })
      } else rule('AnalysisRule' + i, x, y + 0.55, w)
      const inset = card ? 0.22 : 0
      tx(
        'BlockTitle' + i,
        [x + inset, y + (card ? 0.25 : 0), w - 2 * inset, card ? 1.35 : 0.42],
        v.title,
        card ? 'serif' : 'label',
        p + '.title',
      )
      tx(
        'BlockBody' + i,
        [x + inset, y + (card ? 1.95 : 0.78), w - 2 * inset, h - (card ? 2.2 : 0.78)],
        v.body,
        card ? 'body' : 'compact',
        p + '.body',
      )
    })
  } else if (role === 'chart') {
    const ring = d.kind === 'doughnut',
      values = d.points.map((p) => p.value)
    if (values.some((v) => !Number.isFinite(v)))
      throw Error(`${path}.points: finite numeric values required`)
    if (ring && (values.some((v) => v < 0) || values.reduce((a, v) => a + v, 0) <= 0))
      throw Error(`${path}.points: doughnut needs nonnegative values and positive total`)
    if (ring && layoutId === 'wide')
      throw Error(`${path}: wide is column-only; choose left or right`)
    const lo = Math.min(0, ...values),
      hi = Math.max(0, ...values),
      span = hi - lo || 1
    const format = values.some((v) => v !== 0 && (Math.abs(v) < 0.001 || Math.abs(v) >= 1e7))
      ? '0.##E+00'
      : values.every(Number.isInteger)
        ? '0'
        : '0.00'
    cs.push({
      kind: 'chart',
      name: 'EvidenceChart',
      frame: ring ? r.ring : r.chart,
      chartKind: d.kind,
      data: { categories: d.points.map((p) => p.label), series: [{ name: d.seriesName, values }] },
      minimum: lo < 0 ? lo - span * 0.2 : 0,
      maximum: hi + span * 0.25,
      numberFormat: format,
      showValues: !ring,
      holeSize: 56,
      ...(ring
        ? { pointTones: b.chartTones.slice(0, values.length) }
        : { uniformSeriesTone: 'ink' }),
    })
    tx('SeriesHead', r.head, `${d.seriesName} · ${d.unit}`, 'label', ['seriesName', 'unit'])
    if (ring) {
      cells(r.legend, d.points.length, true, 0.08).forEach(([x, y, w, h], i) => {
        box('Swatch' + i, [x, y + 0.08, 0.12, 0.12], b.chartTones[i])
        tx(
          'PointLabel' + i,
          [x + 0.27, y, w * 0.62 - 0.27, h],
          d.points[i].label,
          'body',
          `points[${i}].label`,
        )
        tx(
          'PointValue' + i,
          [x + w * 0.65, y, w * 0.35, h],
          String(values[i]),
          'small',
          `points[${i}].value`,
          { alignment: 'right' },
        )
      })
    } else {
      // Metadata must be visibly owned as well as present in the chart cache.
      d.points.forEach((v, i) =>
        fitTextPlan(
          v.label,
          [0, 0, r.chart[2] / values.length, 0.5],
          b.styles.small,
          `${path}.points[${i}].label`,
        ),
      )
    }
    tx('ChartNote', r.note, d.note, 'small', 'note')
  } else if (role === 'process') {
    if (layoutId === 'cycle' && d.steps.length !== 4)
      throw Error(`${path}.steps: cycle requires exactly four steps`)
    if (layoutId === 'sequence' && d.steps.length > 4)
      throw Error(`${path}.steps: sequence supports at most four steps`)
    let frames
    if (layoutId === 'cycle') {
      const f = cells(r.steps, 2, false, 0.65)
      frames = [...cells(f[0], 2, true, 0.55), ...cells(f[1], 2, true, 0.55)]
      frames = [frames[0], frames[2], frames[3], frames[1]]
    } else
      frames = cells(
        r.steps,
        d.steps.length,
        layoutId === 'timeline',
        layoutId === 'timeline' ? gap / 4 : 0.2,
      )
    if (layoutId === 'timeline')
      rule('TimelineSpine', r.steps[0] + 1.42, r.steps[1] + 0.16, r.steps[3] - 0.44, true)
    frames.forEach(([x, y, w, h], i) => {
      const v = d.steps[i],
        p = `steps[${i}]`,
        timeline = layoutId === 'timeline',
        cycle = layoutId === 'cycle'
      if (timeline) {
        tx(
          'StepDate' + i,
          [x, y, 1.18, h],
          v.date ?? String(i + 1).padStart(2, '0'),
          'label',
          v.date ? p + '.date' : `structural.number${i}`,
        )
        cs.push({
          kind: 'circle',
          name: 'TimelineDot' + i,
          frame: [x + 1.375, y + 0.12, 0.09, 0.09],
          color: 'ink',
        })
        tx('StepTitle' + i, [x + 1.65, y, w - 1.65, 0.42], v.title, 'heading', p + '.title')
        tx('StepBody' + i, [x + 1.65, y + 0.49, w - 1.65, h - 0.49], v.body, 'body', p + '.body')
      } else {
        rule('StepRule' + i, x, y, w)
        tx(
          'StepNumber' + i,
          [x, y + 0.12, w, cycle ? 0.32 : 0.76],
          String(i + 1).padStart(2, '0') + (v.date ? ' · ' + v.date : ''),
          cycle ? 'label' : 'step',
          v.date ? p + '.date' : `structural.number${i}`,
        )
        tx(
          'StepTitle' + i,
          [x, y + (cycle ? 0.52 : 0.99), w, 0.55],
          v.title,
          'heading',
          p + '.title',
        )
        tx(
          'StepBody' + i,
          [x, y + (cycle ? 1.12 : 1.65), w, h - (cycle ? 1.12 : 1.65)],
          v.body,
          'body',
          p + '.body',
        )
      }
    })
    if (layoutId === 'cycle') {
      const [x, y, w, h] = r.steps
      for (const [i, glyph, f] of [
        [0, '→', [x + w / 2 - 0.2, y + 0.7, 0.4, 0.45]],
        [1, '↓', [x + w * 0.76, y + h / 2 - 0.22, 0.4, 0.45]],
        [2, '←', [x + w / 2 - 0.2, y + h * 0.77, 0.4, 0.45]],
        [3, '↑', [x + w * 0.23, y + h / 2 - 0.22, 0.4, 0.45]],
      ])
        tx('CycleArrow' + i, f, glyph, 'heading', `structural.arrow${i}`, { alignment: 'center' })
    }
  } else if (role === 'hierarchy') {
    tx('Body', r.body, d.body, 'lead', 'body')
    const n = d.levels.length,
      [x, y, w, h] = r.levels,
      rowH = (h - (n - 1) * 0.06) / n
    d.levels.forEach((value, i) => {
      const ratio = 0.36 + (0.64 * i) / (n - 1),
        width = layoutId === 'pyramid' ? w * ratio : w * (0.65 + (0.35 * i) / (n - 1)),
        xx = layoutId === 'pyramid' ? x + (w - width) / 2 : x
      const color = b.hierarchyTones[Math.round((i * (b.hierarchyTones.length - 1)) / (n - 1))]
      const f = [xx, y + i * (rowH + 0.06), width, rowH]
      const c = fitTextPlan(
        value,
        [0, 0, width - 0.24, rowH - 0.08],
        { ...b.styles.body, color: i < 2 ? 'paper' : 'ink' },
        `${path}.levels[${i}]`,
      )
      cs.push({
        ...c,
        kind: 'owned',
        shapeKind: 'rectangle',
        name: 'HierarchyLevel' + i,
        frame: f,
        color,
        style: { ...c.style, alignment: 'center' },
        path: `${path}.levels[${i}]`,
      })
      rule('HierarchyAnchor' + i, xx - 0.018, f[1], rowH, true)
    })
  } else if (role === 'closing') {
    tx('Section', r.section, d.section, 'label', 'section', {
      alignment: layoutId === 'center' ? 'center' : 'left',
    })
    rule(
      'ShortRule',
      r.title[0] + (layoutId === 'center' ? (r.title[2] - b.spacing.shortRule) / 2 : 0),
      r.title[1] - 0.22,
      b.spacing.shortRule,
    )
    tx('Title', r.title, d.title, 'chapter', 'title', {
      alignment: layoutId === 'center' ? 'center' : 'left',
    })
    tx('Body', r.body, d.body, 'lead', 'body', {
      alignment: layoutId === 'center' ? 'center' : 'left',
    })
    tx('Source', r.source, d.source, 'small', 'source', {
      alignment: layoutId === 'center' ? 'center' : 'left',
    })
  } else throw Error(`Unregistered monochrome role ${role}`)
  return cs
}

export function resolveMonochromeDeck(design, content, { validateData } = {}) {
  if (content.meta?.deckkit !== design.id) throw Error('Content DeckKit identity mismatch')
  if (!content.slides?.length) throw Error('At least one slide required')
  if (
    (content.meta.designScope ?? 'complete') === 'complete' &&
    (content.slides[0].type !== 'monoCoverSlide' ||
      content.slides.at(-1).type !== 'monoClosingSlide')
  )
    throw Error(
      'Complete Monochrome decks open with cover and end with closing; use designScope excerpt for extracts',
    )
  const layouts = [],
    warnings = []
  for (const [s, slide] of content.slides.entries()) {
    const f = design.monochrome.families[slide.type]
    if (!f) throw Error(`slides[${s}]: unregistered monochrome type`)
    if (slide.customOps) throw Error(`slides[${s}]: customOps forbidden`)
    validateData?.(slide.type, slide.data, `slides[${s}].data`)
    const failures = [],
      candidates = Object.entries(f.variants).flatMap(([layoutId, v]) => {
        try {
          const components = compileMonochromeLayout(
            design,
            f,
            layoutId,
            v,
            slide.data,
            `slides[${s}].data`,
          )
          if (
            !['cover', 'closing', 'quote'].includes(f.role) &&
            !(f.role === 'opening' && layoutId === 'chapter')
          )
            components.push({
              ...fitTextPlan(
                String(s + 1).padStart(2, '0'),
                design.monochrome.chrome.page,
                { ...design.monochrome.styles.label, alignment: 'right' },
                'structural.page',
              ),
              name: 'Page',
            })
          for (const c of components) {
            const [x, y, w, h] = c.frame
            if (
              [x, y, w, h].some((v) => !Number.isFinite(v)) ||
              Math.min(x, y, w, h) < 0 ||
              x + w > design.canvas.widthIn + 0.002 ||
              y + h > design.canvas.heightIn + 0.002
            )
              throw Error(`${c.name}: outside canvas`)
          }
          return [
            {
              layoutId,
              role: f.role,
              components,
              surface: f.role === 'analysis' && layoutId === 'insights' ? 'warm' : 'paper',
              fingerprint: designHash({
                role: f.role,
                frames: components.map((c) => [c.kind, c.frame]),
              }),
            },
          ]
        } catch (e) {
          failures.push(`${layoutId}: ${e.message}`)
          return []
        }
      })
    let selected
    try {
      selected = selectDesignLayout(
        candidates,
        slide.layoutId ?? 'auto',
        layouts,
        design.monochrome.rhythm.maxConsecutive,
      )
    } catch (e) {
      throw Error(`slides[${s}]: ${e.message}; ${failures.join('; ')}`)
    }
    Object.assign(selected, {
      slideIndex: s,
      slideType: slide.type,
      candidates: candidates.map((c) => c.layoutId),
      reason: slide.layoutId && slide.layoutId !== 'auto' ? 'explicit' : 'fit-and-rhythm',
    })
    layouts.push(selected)
    if (selected.repeated) warnings.push(`slides[${s}]: repeated composition`)
  }
  return { layouts, warnings }
}
