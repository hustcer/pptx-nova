import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createDeck, DESIGN } from '../../pptx-nova/assets/deckkits/cartesian/cartesian.kit.mjs'
import { validateContent } from '../../pptx-nova/assets/deckkits/shared/core-primitives.kit.mjs'
import { validateDeckkitContent } from '../../pptx-nova/assets/deckkits/shared/validate-deckkit.mjs'
import {
  assertDesignContract,
  checkDesignPatch,
  checkDesignReadback,
  designHash,
} from '../../pptx-nova/assets/deckkits/shared/design-contract.mjs'
import { execFileSync } from 'node:child_process'

const assetRoot = new URL('../../pptx-nova/assets/deckkits/', import.meta.url)
const readJson = (path) => JSON.parse(readFileSync(new URL(path, assetRoot), 'utf8'))

function fontSizes(value, path = '$') {
  if (!value || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([key, child]) => {
    const childPath = `${path}.${key}`
    if (key === 'font' && child?.size) return [{ path: childPath, size: parseFloat(child.size) }]
    if (key === 'fontPt') return [{ path: childPath, size: child }]
    return fontSizes(child, childPath)
  })
}

const fixture = () => readJson('cartesian/examples/content.json')
const excerpt = (slide) => ({
  meta: { deckkit: 'cartesian', designScope: 'excerpt' },
  slides: [slide],
})

test('Cartesian 2.0 resolves every page and all 18 real compositions deterministically', () => {
  const content = fixture(),
    built = createDeck(content)
  assert.equal(built.designPlan.layouts.length, 10)
  assert.equal(built.designCheck.status, 'pass')
  let layouts = 0
  for (const slide of content.slides) {
    const fingerprints = new Set()
    for (const layoutId of Object.keys(DESIGN.cartesian.families[slide.type].variants)) {
      const sample = excerpt({ ...structuredClone(slide), layoutId })
      const result = createDeck(sample)
      assert.equal(result.designPlan.layouts[0].layoutId, layoutId)
      assert.deepEqual(result, createDeck(structuredClone(sample)))
      fingerprints.add(result.designPlan.layouts[0].fingerprint)
      layouts++
    }
    assert.equal(
      fingerprints.size,
      Object.keys(DESIGN.cartesian.families[slide.type].variants).length,
    )
  }
  assert.equal(layouts, 18)
})

test('source numbers remain raw native chart data; authored domains cannot clip them', () => {
  const slide = fixture().slides[6]
  const values = [0, -12.5, 1e-8, 1.23456789012345, 1234567890123, 7]
  slide.data.chart.series[0].values = values
  slide.data.numberFormat = '0.00E+00'
  const { patch } = createDeck(excerpt(slide))
  assert.deepEqual(patch.ops.find((o) => o.op === 'add-chart').data.series[0].values, values)
  assert.equal(patch.ops.filter((o) => o.op === 'add-chart').length, 1)
  const style = patch.ops.find((o) => o.op === 'set-chart')
  assert.equal(style.axes.find((a) => a.axis === 'value').scale, undefined)
  assert.equal(style.axes.find((a) => a.axis === 'value').ticks.numberFormat, '0.00E+00')
  slide.data.valueAxis = { max: 60 }
  assert.throws(() => createDeck(excerpt(slide)), /clips data/)
  slide.data.valueAxis = { min: -13, max: 2e12, majorUnit: 1e11 }
  assert.doesNotThrow(() => createDeck(excerpt(slide)))
})

test('invalid, ambiguous and excessive content fails before rendering', () => {
  for (const [index, mutate, pattern] of [
    [0, (d) => (d.title = 'W'.repeat(200)), /title/],
    [1, (d) => d.items.push(...d.items), /too many items/],
    [1, (d) => (d.items[0].level = 1), /requires textLayout/],
    [3, (d) => delete d.unit, /missing unit/],
    [3, (d) => (d.source = ' '), /source/],
    [3, (d) => d.chart.series[0].values.pop(), /match every category/],
    [3, (d) => (d.chart.series[0].values[0] = '2'), /expected number/],
    [3, (d) => (d.chart.series[0].values[0] = NaN), /finite/],
    [3, (d) => (d.valueAxis = { min: 10, max: 1 }), /clips data|invalid range/],
    [3, (d) => (d.valueAxis = { majorUnit: 0 }), /must exceed|positive/],
    [4, (d) => (d.paragraphs[1] = 'Long '.repeat(200)), /paragraphs/],
    [5, (d) => d.cards.push(d.cards[0]), /too many items/],
    [5, (d) => (d.cards[0].body = 'Long '.repeat(200)), /cards/],
    [7, (d) => (d.items[0].title = '长'.repeat(100)), /items/],
    [8, (d) => (d.members[0].role = 'Long '.repeat(100)), /members/],
    [9, (d) => (d.contact = 'Long '.repeat(100)), /contact/],
  ]) {
    const slide = fixture().slides[index]
    mutate(slide.data)
    assert.throws(() => createDeck(excerpt(slide)), pattern)
    assert.equal(validateDeckkitContent(excerpt(slide), { mode: 'delivery' }).valid, false)
  }
  const slide = fixture().slides[0]
  slide.layoutId = 'unregistered'
  assert.throws(() => createDeck(excerpt(slide)), /No layout fits/)
  delete slide.layoutId
  slide.data.unknown = 'DROPPED'
  assert.throws(() => createDeck(excerpt(slide)), /unknown field/)
  slide.type = 'cartesianUnknownSlide'
  assert.throws(() => createDeck(excerpt(slide)), /unregistered/)
})

test('minimum and maximum supported item counts retain every native text field', () => {
  for (const [index, field, key] of [
    [1, 'items', 'agenda'],
    [4, 'paragraphs', 'paragraphs'],
    [4, 'stats', 'stats'],
    [5, 'cards', 'cards'],
    [7, 'items', 'timeline'],
    [8, 'members', 'team'],
  ]) {
    for (const count of DESIGN.cartesian.capacity[key]) {
      const slide = fixture().slides[index]
      slide.data[field] = Array.from({ length: count }, (_, i) =>
        structuredClone(slide.data[field][i % slide.data[field].length]),
      )
      const result = createDeck(excerpt(slide))
      assert.equal(result.designPlan.layouts.length, 1)
      const components = result.designPlan.layouts[0].components.filter((c) =>
        c.path?.includes(`.${field}[`),
      )
      assert.ok(components.some((c) => c.path.includes(`[${count - 1}]`)))
    }
  }
  const c = fixture()
  c.slides[0].data.title = 'A considered framework\nfor shared public life'
  assert.equal(createDeck(c).designPlan.layouts[0].layoutId, 'wide')
})

test('native medallions own centered text; the asset contract and projections stay intact', () => {
  const { patch } = createDeck(fixture())
  for (const name of ['S5_CardIcon0', 'S8_Initial0']) {
    assert.equal(patch.ops.find((o) => o.name === name).kind, 'oval')
    assert.ok(patch.ops.some((o) => o.shape?.name === name && o.frame?.verticalAnchor === 'middle'))
    assert.ok(patch.ops.some((o) => o.shape?.name === name && o.format?.alignment === 'center'))
  }
  const catalog = readJson('catalog.json').entries.find((e) => e.id === 'cartesian')
  assert.equal(
    catalog.layoutContract.slideTypes.cartesianImageStatsSlide.assetSlots['image.editorial']
      .acceptsAsset,
    true,
  )
  execFileSync(process.execPath, [
    'tools/generate-pptx-design-projections.mjs',
    'cartesian',
    '--check',
  ])
  execFileSync(process.execPath, [
    'tools/generate-pptx-design-projections.mjs',
    'biennale-yellow',
    '--check',
  ])
})

test('registered language rejects style and contract counterexamples', () => {
  for (const op of [
    { op: 'add-shape', kind: 'rounded-rectangle' },
    { op: 'add-chart', kind: 'pie' },
    { op: 'set-shape', line: { width: '4pt', color: DESIGN.colors.line } },
    { op: 'set-shape', fill: { type: 'gradient' } },
    { op: 'set-shape', effect: { shadow: {} } },
    { op: 'set-run', font: { name: 'Inter', color: 'FF0000', size: '13pt' } },
    { op: 'set-run', font: { name: 'Unapproved', size: '13pt' } },
    { op: 'set-run', font: { name: 'Playfair Display', bold: true, size: '36pt' } },
    { op: 'set-chart', series: [{ series: 0, smooth: true }] },
    { op: 'set-chart', series: [{ series: 1, line: { dash: 'solid' } }] },
  ])
    assert.equal(checkDesignPatch(DESIGN, { ops: [op] }).status, 'fail', JSON.stringify(op))
  for (const mutate of [
    (d) =>
      (d.cartesian.families.cartesianCoverSlide.variants.typo =
        d.cartesian.families.cartesianCoverSlide.variants.hero),
    (d) => (d.cartesian.families.cartesianCoverSlide.variants.hero.regions.title[0] = -1),
    (d) => (d.cartesian.styles.body.color = 'missing'),
    (d) => (d.cartesian.capacity.agenda = [5, 3]),
    (d) => d.rules.push({ id: 'typo', check: 'unknown' }),
  ]) {
    const d = structuredClone(DESIGN)
    mutate(d)
    assert.throws(() => assertDesignContract(d))
  }
})

test('minimum unrelated content retains every visible field without reference-copy fallback', () => {
  let counter = 0
  const tokens = []
  const fill = (schema, field = '') => {
    if (schema['x-slotRole'] === 'control') return undefined
    if (schema.enum) return schema.enum[0]
    if (schema.type === 'string') {
      const token = `Q${(++counter).toString(32).toUpperCase().padStart(2, '0')}`
      tokens.push(token)
      return token
    }
    if (schema.type === 'number') return 1
    if (schema.type === 'array')
      return Array.from({ length: schema.minItems ?? 1 }, () => fill(schema.items, field))
    if (schema.type === 'object')
      return Object.fromEntries(
        Object.entries(schema.properties).flatMap(([key, child]) => {
          const value = fill(child, key)
          return value === undefined ? [] : [[key, value]]
        }),
      )
  }
  const content = {
    meta: { deckkit: 'cartesian' },
    slides: Object.keys(DESIGN.cartesian.families)
      .filter((type) => DESIGN.cartesian.families[type].role !== 'exhibit')
      .map((type) => ({
        type,
        data: fill(readJson(`cartesian/schemas/${type}.schema.json`)),
      })),
  }
  const validation = validateDeckkitContent(content, { mode: 'delivery' })
  assert.equal(validation.valid, true, JSON.stringify(validation.errors))
  const text = JSON.stringify(createDeck(content).patch)
  for (const token of tokens) assert.ok(text.includes(token), `Missing visible field ${token}`)
  for (const phrase of [
    'Quarterly Metrics',
    'Revenue Impact',
    'Market Share',
    'Alex Morgan',
    'Precision in approach',
  ])
    assert.equal(text.includes(phrase), false)
})

test('picture readback rejects a missing picture, moved frame or changed native crop', () => {
  const patch = {
    ops: [
      { op: 'add-slide' },
      { op: 'add-image', slide: 0, name: 'S0_ImageAsset', x: '1in', y: '2in', w: '3in', h: '4in' },
      {
        op: 'set-image',
        slide: 0,
        shape: { name: 'S0_ImageAsset' },
        crop: { left: 0.1, right: 0.1 },
      },
    ],
  }
  const plan = {
    patchHash: designHash(patch),
    objects: [{ slide: 0, name: 'S0_ImageAsset', kind: 'add-image', frame: [1, 2, 3, 4] }],
  }
  const inspect = {
    slides: [
      {
        index: 0,
        shapes: [
          {
            name: 'S0_ImageAsset',
            shapeType: 'picture',
            image: { crop: { left: 0.1, right: 0.1, top: 0, bottom: 0 } },
            bbox: { xEmu: 914400, yEmu: 1828800, wEmu: 2743200, hEmu: 3657600 },
          },
        ],
      },
    ],
  }
  assert.equal(checkDesignReadback(plan, patch, inspect).status, 'pass')
  for (const mutate of [
    (s) => (s.shapeType = 'textBox'),
    (s) => (s.image.crop.left = 0.2),
    (s) => (s.bbox.xEmu += 91440),
  ]) {
    const bad = structuredClone(inspect)
    mutate(bad.slides[0].shapes[0])
    assert.equal(checkDesignReadback(plan, patch, bad).status, 'fail')
  }
})

test('Cartesian stock text and chart legends meet the canonical 10 pt readability floor', () => {
  const content = readJson('cartesian/examples/content.json')
  const { patch } = createDeck(content)
  const fonts = fontSizes(patch)
  assert.ok(fonts.length > 40, 'exercise all stock slide types')
  assert.deepEqual(
    fonts.filter(({ size }) => size < 10),
    [],
  )
})

test('Cartesian slot budgets describe readable fonts for all registered slide types', () => {
  const names = readdirSync(new URL('cartesian/schemas/', assetRoot)).filter((name) =>
    name.endsWith('.json'),
  )
  assert.equal(names.length, Object.keys(DESIGN.cartesian.families).length)
  const fonts = names.flatMap((name) => fontSizes(readJson(`cartesian/schemas/${name}`), name))
  assert.ok(fonts.length > 30)
  assert.deepEqual(
    fonts.filter(({ size }) => size < 10),
    [],
  )
})

for (const count of [3, 5]) {
  test(`Cartesian native paragraph Agenda keeps ${count} Chinese mixed-level items in one animation target`, () => {
    const content = {
      meta: { deckkit: 'cartesian' },
      slides: [
        {
          type: 'cartesianAgendaSlide',
          data: {
            label: 'Animation / By level',
            title: '分层进入',
            body: '逐次点击，观察段落层级。',
            textLayout: 'paragraphs',
            items: Array.from({ length: count }, (_, i) => ({
              text: `第${i + 1}段：验证段落动画`,
              level: i % 2,
            })),
          },
        },
      ],
    }
    assert.equal(validateContent(content, { mode: 'delivery' }).errors.length, 0)
    const { patch } = createDeck(content)
    const text = patch.ops.find(
      (op) => op.op === 'set-text-frame' && op.shape?.name === 'S0_AgendaParagraphs' && op.text,
    )
    assert.equal(text?.text.split('\n').length, count)
    const paragraphs = patch.ops.filter(
      (op) => op.op === 'set-paragraph' && op.shape?.name === 'S0_AgendaParagraphs',
    )
    assert.deepEqual(
      paragraphs.filter((op) => 'level' in op.format).map((op) => op.format.level),
      content.slides[0].data.items.map((item) => item.level),
    )
    assert.equal(
      patch.ops.some((op) => /^S0_AgendaRule[0-9]/.test(op.name ?? '')),
      false,
    )
    assert.equal(
      patch.ops.some((op) => op.name === 'S0_AgendaRule'),
      true,
    )
  })
}

test('native exhibit rejects executable payloads, bad stage geometry and unregistered charts', () => {
  const data = {
    label: 'NATIVE OBJECTS',
    title: 'Retain the difficult detail',
    body: 'A bounded editable specimen',
    source: 'Synthetic demonstration',
    specimen: { kind: 'nodes', nodes: [{ text: 'QX7', x: 0.1, y: 0.1, w: 0.2, h: 0.7 }] },
  }
  const sample = () =>
    excerpt({ type: 'cartesianExhibitSlide', layoutId: 'wide', data: structuredClone(data) })
  const patch = createDeck(sample()).patch
  assert.ok(JSON.stringify(patch).includes('QX7'))
  assert.equal(
    patch.ops.some((op) => op.op === 'patch-ooxml'),
    false,
  )
  for (const mutate of [
    (d) => (d.specimen.customOps = []),
    (d) => (d.specimen.nodes[0].x = 0.95),
    (d) => (d.specimen.nodes[0].shape = 'unknown'),
    (d) => (d.specimen.nodes[0].text = 'W'.repeat(200)),
  ]) {
    const input = sample()
    mutate(input.slides[0].data)
    assert.throws(() => createDeck(input))
  }
})

test('single and paired native exhibits retain chart values and 3D camera declarations', () => {
  for (const type of [
    'cartesianAnalyticalSlide',
    'cartesianComparisonSlide',
    'cartesianSceneSlide',
  ]) {
    const charts = Array.from({ length: type === 'cartesianComparisonSlide' ? 2 : 1 }, (_, i) => ({
      kind: 'column-3d',
      variant: 'clustered',
      caption: 'QX native chart ' + i,
      data: { categories: ['X', 'Y'], series: [{ name: 'Sample ' + i, values: [-3.25, 7.125] }] },
      view3D: { rotX: 25, rotY: 35, perspective: 40, rightAngleAxes: false },
    }))
    const input = excerpt({
      type,
      layoutId: 'rail',
      data: {
        label: 'NATIVE CHART',
        title: 'Data keeps its identity',
        body: 'Synthetic values expose projection details',
        source: 'Synthetic demonstration',
        specimen: { kind: 'charts', charts },
      },
    })
    const { patch, designCheck } = createDeck(input)
    assert.equal(designCheck.status, 'pass')
    const native = patch.ops.filter((o) => o.op === 'add-chart')
    assert.equal(native.length, charts.length)
    native.forEach((o) => assert.deepEqual(o.data.series[0].values, [-3.25, 7.125]))
    assert.ok(patch.ops.some((o) => o.op === 'set-chart' && o.view3D?.perspective === 40))
    assert.equal(
      patch.ops.some((o) => o.op === 'add-image'),
      false,
    )
  }
})

const exhibit = (specimen, layoutId = 'wide') =>
  excerpt({
    type: 'cartesianExhibitSlide',
    layoutId,
    data: {
      label: 'EXHIBIT',
      title: 'A bounded specimen',
      body: 'Synthetic test',
      source: 'Synthetic',
      specimen,
    },
  })

test('exhibit preflight rejects rotated bounds and accepts a contained rotation', () => {
  const node = { text: 'X', shape: 'rectangle', x: 0, y: 0, w: 1, h: 1, rotation: 45 }
  const content = exhibit({ kind: 'nodes', nodes: [node] })
  assert.throws(() => createDeck(content), /rotated|outside stage/)
  assert.equal(validateDeckkitContent(content, { mode: 'delivery' }).valid, false)
  assert.doesNotThrow(() =>
    createDeck(exhibit({ kind: 'nodes', nodes: [{ ...node, x: 0.4, y: 0.3, w: 0.1, h: 0.4 }] })),
  )
})

test('specimen discriminants require their payload and reject inactive branches', () => {
  for (const specimen of [
    { kind: 'equations' },
    { kind: 'charts' },
    { kind: 'nodes', equations: [{ caption: 'Must show', latex: 'x^2' }] },
    { kind: 'equations', equations: [{ caption: 'Math', latex: 'x^2' }], nodes: [] },
  ]) {
    const content = exhibit(specimen)
    assert.throws(() => createDeck(content), /specimen|missing|branch/)
    assert.equal(validateDeckkitContent(content, { mode: 'delivery' }).valid, false)
  }
  assert.doesNotThrow(() => createDeck(exhibit({ kind: 'nodes', nodes: [] })))
})

test('all specimen text is capacity checked during content preflight', () => {
  for (const specimen of [
    { kind: 'nodes', nodes: [], paragraphs: ['Long '.repeat(500)] },
    { kind: 'nodes', nodes: [], wordArt: 'Long '.repeat(500) },
    { kind: 'equations', equations: [{ caption: 'Long '.repeat(500), latex: 'x^2' }] },
    {
      kind: 'charts',
      charts: [
        {
          kind: 'column',
          caption: 'Long '.repeat(500),
          data: { categories: ['A'], series: [{ name: 'Sample', values: [1] }] },
        },
      ],
    },
  ]) {
    assert.throws(() => createDeck(exhibit(specimen)), /specimen|width|lines/)
    assert.equal(validateDeckkitContent(exhibit(specimen), { mode: 'delivery' }).valid, false)
  }
})

test('node text renders the same CJK wrapping that passed preflight', () => {
  const content = exhibit({
    kind: 'nodes',
    nodes: [{ text: '中文字需要可靠换行', x: 0.1, y: 0.1, w: 0.1, h: 0.8 }],
  })
  const patch = createDeck(content).patch
  const text = patch.ops.find(
    (op) => op.shape?.name === 'S0_ExhibitNode0' && typeof op.text === 'string',
  ).text
  assert.ok(text.includes('\n'))
  assert.equal(text.replaceAll('\n', ''), content.slides[0].data.specimen.nodes[0].text)
})

test('published exhibit copies match their canonical schema and layout source', () => {
  execFileSync(process.execPath, [
    fileURLToPath(new URL('../update-pptx-nova-cartesian-exhibits.mjs', import.meta.url)),
  ])
})

test('ChartEx labels are retained and unsupported display options are rejected', () => {
  const chart = {
    kind: 'histogram',
    caption: 'Histogram',
    dataEx: { values: [1, 2, 3], binCount: 2 },
    labels: [{ scope: { plot: 0 }, showValue: true, showCategoryName: true }],
  }
  const content = exhibit({ kind: 'charts', charts: [chart] })
  const set = createDeck(content).patch.ops.find((op) => op.op === 'set-chart')
  assert.deepEqual(set.dataLabels, chart.labels)
  for (const [key, value] of Object.entries({
    legend: 'bottom',
    xScale: { min: 0 },
    yScale: { min: 0 },
    view3D: { rotX: 10 },
    plot: { gapWidth: 30 },
    seriesStyles: [{}],
  })) {
    const invalid = structuredClone(content)
    invalid.slides[0].data.specimen.charts[0][key] = value
    assert.throws(() => createDeck(invalid), /branch/)
    assert.equal(validateDeckkitContent(invalid, { mode: 'delivery' }).valid, false)
  }
})
