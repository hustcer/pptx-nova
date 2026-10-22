import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDeck, DESIGN } from '../../pptx-nova/assets/deckkits/clear-value.kit.mjs'
import {
  createAnnualDeck,
  annualNumber,
} from '../../pptx-nova/assets/deckkits/annual-components.mjs'
import { validateDeckkitContent } from '../../pptx-nova/assets/deckkits/validate-deckkit.mjs'
import {
  assertDesignContract,
  checkDesignPatch,
  checkDesignReadback,
} from '../../pptx-nova/assets/deckkits/design-contract.mjs'
const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url))),
  source = read('../../pptx-nova/assets/deckkits/examples/clear-value-content.json'),
  clone = structuredClone,
  excerpt = (slides) => ({ meta: { deckkit: 'clear-value', designScope: 'excerpt' }, slides })
function minimal(slide) {
  const s = clone(slide)
  let n = 0
  const schema = read(`../../pptx-nova/assets/deckkits/schemas/clear-value/${s.type}.schema.json`)
  function transform(v, node) {
    if (node['x-slotRole'] === 'control') return v
    if (typeof v === 'string') return `V${++n}Q`
    if (Array.isArray(v)) return v.map((x) => transform(x, node.items))
    if (v && typeof v === 'object')
      return Object.fromEntries(
        Object.entries(v).map(([k, x]) => [k, transform(x, node.properties[k])]),
      )
    return v
  }
  s.data = transform(s.data, schema)
  if (s.data.charts) {
    s.data.charts = s.data.charts.slice(0, 1)
    s.data.charts[0].categories = s.data.charts[0].categories.slice(0, 2)
    s.data.charts[0].series = s.data.charts[0].series.slice(0, 1)
    s.data.charts[0].series[0].values = [3, 4]
    delete s.data.charts[0].focus
    delete s.data.charts[0].variant
    delete s.data.charts[0].forecastFrom
    s.layoutId = 'auto'
    if (s.type === 'valueEvidenceSlide')
      s.data.notes = [{ heading: 'FIELD NOTE', body: 'Record the same survey method' }]
  }
  if (s.data.rows) s.data.rows = s.data.rows.slice(0, 3)
  if (s.data.metrics) s.data.metrics = s.data.metrics.slice(0, 3)
  if (s.data.phases) s.data.phases = s.data.phases.slice(0, 2)
  if (s.type === 'valueDecisionSlide') s.data.items = s.data.items.slice(0, 3)
  return s
}
const types = [...new Set(source.slides.map((x) => x.type))]
for (const type of types)
  test(`Clear Value: minimum unrelated ${type} validates and renders`, () => {
    const s = minimal(source.slides.find((x) => x.type === type)),
      content = excerpt([s])
    const v = validateDeckkitContent(content, { deckkit: 'clear-value', mode: 'delivery' })
    assert.equal(v.valid, true, JSON.stringify(v.errors))
    const r = createDeck(content),
      text = JSON.stringify(r.patch)
    assert.equal(r.designCheck.status, 'pass')
    assert.ok(!/Yuanxiu|Sovereign|Investment Outlook|Global equity|12\.0%/.test(text))
    assert.ok(!r.patch.ops.some((x) => x.op === 'add-image'))
    assert.ok(text.includes(s.data.title))
  })
test('Clear Value: deterministic rail/wide and argument split layouts change actual geometry', () => {
  const s = minimal(source.slides[8])
  s.data.notes = [{ heading: 'Basis', body: 'Keep the source stable' }]
  const a = createDeck(excerpt([{ ...clone(s), layoutId: 'rail' }])),
    b = createDeck(excerpt([{ ...clone(s), layoutId: 'wide' }]))
  assert.notDeepEqual(a.designPlan.objects, b.designPlan.objects)
  assert.deepEqual(a.patch, createDeck(excerpt([{ ...clone(s), layoutId: 'rail' }])).patch)
  const q = minimal(source.slides[11])
  assert.notDeepEqual(
    createDeck(excerpt([{ ...q, layoutId: 'column' }])).patch,
    createDeck(excerpt([{ ...q, layoutId: 'split' }])).patch,
  )
})
test('Clear Value: invalid chart structure, focus, forecasts and nonfinite numbers fail closed', () => {
  for (const mutate of [
    (s) => s.data.charts[0].series[0].values.pop(),
    (s) => (s.data.charts[0].series[0].values[0] = NaN),
    (s) => (s.data.charts[0].focus = 20),
    (s) => (s.data.charts[0].focus = 0.5),
    (s) => (s.data.charts[0].forecastFrom = 0),
    (s) => Object.assign(s.data.charts[0], { kind: 'line', focus: 0 }),
    (s) => {
      const ch = s.data.charts[0]
      ch.focus = 0
      ch.series.push(clone(ch.series[0]))
    },
  ]) {
    const s = minimal(source.slides[2])
    mutate(s)
    assert.throws(() => createDeck(excerpt([s])))
  }
})
test('Clear Value: matrix dimensions, weights, duration and overflow rejected before operations', () => {
  for (const [index, mutate] of [
    [3, (s) => s.data.rows[0].cells.pop()],
    [3, (s) => (s.data.columns[0].weight = 0)],
    [6, (s) => (s.data.phases[0].duration = 0)],
    [2, (s) => (s.data.notes = [{ heading: 'Long', body: 'overflow '.repeat(500) }])],
    [0, (s) => (s.data.metrics[0].value = 'W'.repeat(100))],
  ]) {
    const s = clone(source.slides[index])
    mutate(s)
    assert.throws(() => createDeck(excerpt([s])))
  }
})
test('Clear Value: white surface, flat palette and conclusion-only terracotta are executable', () => {
  const r = createDeck(excerpt([minimal(source.slides[2])])),
    bad = clone(r.patch)
  bad.ops.push({
    op: 'set-slide-background',
    slide: 0,
    fill: { type: 'solid', color: DESIGN.colors.ink },
  })
  assert.equal(checkDesignPatch(DESIGN, bad).status, 'fail')
  const chart = bad.ops.find((o) => o.op === 'set-chart')
  chart.series[0].fill.color = DESIGN.colors.terracotta
  assert.ok(checkDesignPatch(DESIGN, bad).issues.some((x) => /Conclusion color/.test(x.message)))
  const d = clone(DESIGN)
  d.annual.renderer = 'unknown'
  assert.throws(() => assertDesignContract(d))
  const x = clone(DESIGN)
  x.annual.families.valueEvidenceSlide.variants.rail.regions.rogue = [0, 0, 1, 1]
  assert.throws(() => assertDesignContract(x))
})
test('Clear Value: renamed physical tokens preserve semantic output', () => {
  const renamed = clone(DESIGN)
  renamed.colors = Object.fromEntries(Object.entries(renamed.colors).map(([k, v]) => [`r_${k}`, v]))
  for (const obj of [
    renamed.roles,
    renamed.theme.colors,
    renamed.refurbish.palette,
    renamed.annual.palette,
  ])
    for (const k of Object.keys(obj)) obj[k] = `r_${obj[k]}`
  const c = excerpt([minimal(source.slides[2])])
  assert.deepEqual(createAnnualDeck(renamed, c).patch, createDeck(c).patch)
})
test('Clear Value: raw series and literal tiny matrix strings remain exact', () => {
  assert.equal(annualNumber(-1e-8), '-1e-8')
  const s = minimal(source.slides[3])
  s.data.rows[0].cells[1].text = '-0.00000001'
  const p = createDeck(excerpt([s])).patch
  assert.equal(p.ops.find((o) => o.op === 'add-table').data[1][1], '-0.00000001')
  const q = minimal(source.slides[8])
  q.data.charts[0].series[0].values = [-1e-8, 0]
  assert.deepEqual(
    createDeck(excerpt([q])).patch.ops.find((o) => o.op === 'add-chart').data.series[0].values,
    [-1e-8, 0],
  )
})
test('Clear Value: circles use area ratios, retain zero labels and native forecast outlines', () => {
  const s = clone(source.slides[10])
  const p = createDeck(excerpt([s])).patch,
    cs = p.ops.filter((o) => o.op === 'add-shape' && o.kind === 'oval')
  assert.ok(Math.abs((parseFloat(cs[1].w) / parseFloat(cs[0].w)) ** 2 - 0.36) < 0.00001)
  const q = clone(s)
  q.data.charts[1].series[0].values = [100, 0]
  assert.equal(
    createDeck(excerpt([q])).patch.ops.filter((o) => o.op === 'add-shape' && o.kind === 'oval')
      .length,
    1,
  )
  const f = createDeck(excerpt([source.slides[9]])).patch.ops.find((o) => o.op === 'set-chart')
  assert.equal(f.series[0].points[4].line.dash, 'dash')
  assert.equal(f.series[0].points[3].line.dash, undefined)
})
test('Clear Value: no line-label density clutter and no reference bitmaps', () => {
  const p = createDeck(source).patch
  const lines = p.ops.filter((o) => o.op === 'add-chart' && o.kind === 'line')
  for (const line of lines) {
    const style = p.ops.find(
      (o) => o.op === 'set-chart' && o.slide === line.slide && o.shape.name === line.name,
    )
    assert.equal(style.dataLabels[0].showValue, false)
  }
  const txt = JSON.stringify(p)
  assert.ok(!txt.includes('b17d302dccacbb72a2d0d677952a07e8f39ba1177b90343394db21c2778c186c'))
  assert.ok(!p.ops.some((o) => o.op === 'add-image'))
})
test('Clear Value: native ring alias still rejects pie or changed data', () => {
  const r = createDeck(excerpt([source.slides[10]]))
  const inspect = {
    slides: [
      {
        index: 0,
        shapes: r.designPlan.objects.map((o) => ({
          name: o.name,
          contentKind: o.kind === 'add-chart' ? 'chart' : 'shape',
          bbox: Object.fromEntries(
            ['xEmu', 'yEmu', 'wEmu', 'hEmu'].map((k, i) => [k, o.frame[i] * 914400]),
          ),
          textFrame: { paragraphs: [] },
        })),
      },
    ],
  }
  const chart = r.patch.ops.find((o) => o.op === 'add-chart')
  const model = {
    presentation: {
      slides: [
        {
          elements: [
            {
              kind: 'chart',
              chart: {
                type: 'pie',
                series: chart.data.series.map((ss) => ({
                  name: ss.name,
                  points: ss.values.map((y, i) => ({ x: chart.data.categories[i], y })),
                })),
              },
            },
          ],
        },
      ],
    },
  }
  assert.ok(
    checkDesignReadback(r.designPlan, r.patch, inspect, model).issues.some((x) =>
      /chart structure/.test(x.message),
    ),
  )
  model.presentation.slides[0].elements[0].chart.type = 'ring'
  assert.ok(
    !checkDesignReadback(r.designPlan, r.patch, inspect, model).issues.some((x) =>
      /chart structure/.test(x.message),
    ),
  )
  model.presentation.slides[0].elements[0].chart.series[0].points[0].y += 1
  assert.ok(
    checkDesignReadback(r.designPlan, r.patch, inspect, model).issues.some((x) =>
      /values or series/.test(x.message),
    ),
  )
})

test('Clear Value: composed chart heads, table captions and multiline cells fail before rendering', () => {
  for (const [index, mutate] of [
    [8, (s) => (s.data.charts[0].series[0].name = 'Wide series '.repeat(40))],
    [3, (s) => (s.data.tableName = 'Caption '.repeat(100))],
    [3, (s) => (s.data.rows[0].cells[0].text = 'one\ntwo')],
    [2, (s) => (s.data.charts[0].label = 'FIGURE '.repeat(10))],
  ]) {
    const s = clone(source.slides[index])
    mutate(s)
    assert.throws(() => createDeck(excerpt([s])))
  }
})

test('Slot probes omit only optional controls and configuration failures exit nonzero', () => {
  const root = fs.mkdtempSync(join(tmpdir(), 'nova-slot-control-'))
  try {
    const deck = join(root, 'assets/deckkits'),
      schemas = join(deck, 'schemas/probe')
    fs.mkdirSync(schemas, { recursive: true })
    fs.mkdirSync(join(root, 'scripts'))
    const script = join(root, 'scripts/check.mjs')
    fs.copyFileSync(
      new URL('../../pptx-nova/scripts/pptx-nova-deckkit-slot-consistency.mjs', import.meta.url),
      script,
    )
    fs.writeFileSync(
      join(deck, 'catalog.json'),
      JSON.stringify({
        entries: [{ id: 'probe', path: 'probe.mjs', supportedSlideTypes: ['page'] }],
      }),
    )
    fs.writeFileSync(join(deck, 'probe.mjs'), 'export const createDeck = c => c')
    for (const c of [
      { role: 'control', required: false, exit: 0 },
      { role: 'control', required: true, exit: 1 },
      { role: 'visible', required: false, exit: 1 },
    ]) {
      fs.writeFileSync(
        join(schemas, 'page.schema.json'),
        JSON.stringify({
          type: 'object',
          required: c.required ? ['value'] : [],
          properties: { value: { type: 'string', 'x-slotRole': c.role, 'x-slotProbeOmit': true } },
        }),
      )
      const r = spawnSync(process.execPath, [script, '--json'], { encoding: 'utf8' })
      assert.equal(r.status, c.exit, r.stdout + r.stderr)
      const report = JSON.parse(r.stdout)
      assert.equal(report.ok, !c.exit)
      assert.equal(report.results[0].slideTypes[0].status, c.exit ? 'probe-config-error' : 'ok')
    }
    // A dropped short token must not be found inside a later, longer token.
    fs.writeFileSync(
      join(schemas, 'page.schema.json'),
      JSON.stringify({
        type: 'object',
        properties: Object.fromEntries(
          Array.from({ length: 72 }, (_, i) => [`v${i}`, { type: 'string' }]),
        ),
      }),
    )
    fs.writeFileSync(
      join(deck, 'probe.mjs'),
      'export const createDeck = c => { delete c.slides[0].data.v0; return c }',
    )
    const dropped = spawnSync(process.execPath, [script, '--json'], { encoding: 'utf8' })
    assert.equal(dropped.status, 1)
    assert.deepEqual(JSON.parse(dropped.stdout).results[0].slideTypes[0].ghosts, ['data.v0'])
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
test('Clear Value: doughnut labels omit explicit position while preserving native labels', () => {
  const patch = createDeck(source).patch
  const rings = patch.ops.filter((o) => o.op === 'add-chart' && o.kind === 'doughnut')
  assert.ok(rings.length)
  for (const ring of rings) {
    const style = patch.ops.find(
      (o) => o.op === 'set-chart' && o.slide === ring.slide && o.shape.name === ring.name,
    )
    assert.ok(style.dataLabels.every((l) => !Object.hasOwn(l, 'position')))
    assert.equal(style.dataLabels[0].showValue, true)
    assert.equal(style.dataLabels[0].showCategoryName, true)
    assert.ok(style.dataLabels[0].font)
    assert.equal(style.dataLabels[0].numberFormat, 'General')
  }
})
