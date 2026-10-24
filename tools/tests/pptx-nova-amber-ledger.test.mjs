import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createDeck, DESIGN } from '../../pptx-nova/assets/deckkits/amber-ledger.kit.mjs'
import {
  assertDesignContract,
  checkDesignPatch,
} from '../../pptx-nova/assets/deckkits/design-contract.mjs'
import { validateDeckkitContent } from '../../pptx-nova/assets/deckkits/validate-deckkit.mjs'
const read = (p) => JSON.parse(readFileSync(new URL('../../' + p, import.meta.url)))
const fixture = () => read('pptx-nova/assets/deckkits/examples/amber-ledger-content.json')
const excerpt = (slides) => ({ meta: { deckkit: 'amber-ledger', designScope: 'excerpt' }, slides })
function specimen(s, maximum = false) {
  if (s['x-slotProbeValue'] !== undefined) return s['x-slotProbeValue']
  if (s.enum) return s.enum[0]
  if (s.type === 'object')
    return Object.fromEntries(s.required.map((k) => [k, specimen(s.properties[k], maximum)]))
  if (s.type === 'array')
    return Array.from({ length: maximum ? s.maxItems : s.minItems }, () =>
      specimen(s.items, maximum),
    )
  if (s.type === 'number') return 1
  if (s.type === 'boolean') return false
  return 'Archive'
}
for (const type of Object.keys(DESIGN.amber.families))
  test(`amber-ledger ${type}: minimal and maximum nonreference content, every real layout`, () => {
    const schema = read(`pptx-nova/assets/deckkits/schemas/amber-ledger/${type}.schema.json`)
    for (const maximum of [false, true]) {
      const data = specimen(schema, maximum),
        frames = []
      for (const layoutId of Object.keys(DESIGN.amber.families[type].variants)) {
        const c = excerpt([{ type, layoutId, data }]),
          v = validateDeckkitContent(c, { mode: 'delivery' })
        assert.equal(v.valid, true, JSON.stringify(v.errors))
        const built = createDeck(c)
        assert.equal(built.designCheck.status, 'pass')
        assert.deepEqual(built, createDeck(structuredClone(c)))
        assert.doesNotMatch(
          JSON.stringify(built.patch),
          /Northline|Xinglan|ridership|train-km|Phase III|TBM|fare-indexation|annual operations|synthetic validation dataset/i,
        )
        assert.match(JSON.stringify(built.patch), /Archive/)
        frames.push(built.designPlan.layouts[0].fingerprint)
      }
      assert.equal(new Set(frames).size, frames.length, 'layouts must change actual frames')
    }
  })
test('amber-ledger rejects incomplete, oversized, unknown and numerically inconsistent content', () => {
  const mutations = [
    (c) => delete c.slides[0].data.source,
    (c) => delete c.slides[2].data.unit,
    (c) => delete c.slides[3].data.period,
    (c) => delete c.slides[5].data.projects[0].owner,
    (c) => c.slides[2].data.segments.forEach((v) => (v.value = 0)),
    (c) => (c.slides[2].data.segments[0].value = -1),
    (c) => (c.slides[3].data.points[0].value = null),
    (c) => c.slides[3].data.points.push(...c.slides[3].data.points),
    (c) => (c.slides[3].data.annotation.to = 12),
    (c) => (c.slides[3].data.annotation.from = 1.5),
    (c) => (c.slides[3].data.annotation.from = 7),
    (c) => (c.slides[4].data.end += 1),
    (c) => (c.slides[4].data.steps[1].focus = true),
    (c) => (c.slides[4].data.baseline = 40),
    (c) => (c.slides[5].data.projects[0].actual = 101),
    (c) => (c.slides[5].data.projects[0].plan = -1),
    (c) => (c.slides[6].data.focusColumn = 1.5),
    (c) => (c.slides[6].data.focusColumn = 10),
    (c) => c.slides[6].data.rows[0].pop(),
    (c) => c.slides[6].data.rows.push(...c.slides[6].data.rows),
    (c) => c.slides[7].data.items.push(...c.slides[7].data.items),
    (c) => (c.slides[0].data.title = 'W'.repeat(250)),
    (c) => (c.slides[2].layoutId = 'invented'),
    (c) => (c.slides[1].data.unregistered = 'silently ignore this'),
    (c) => (c.slides[1].customOps = [{ op: 'add-shape' }]),
    (c) => c.slides.pop(),
  ]
  for (const mutate of mutations) {
    const c = fixture()
    mutate(c)
    assert.equal(validateDeckkitContent(c, { mode: 'delivery' }).valid, false, mutate.toString())
    assert.throws(() => createDeck(c), undefined, mutate.toString())
  }
})
test('amber-ledger preserves zero, signed and tiny evidence; progress and bridge geometry use raw numbers', () => {
  const c = fixture()
  c.slides[2].data.history = [
    { label: 'A', value: -1e-7 },
    { label: 'B', value: 0 },
    { label: 'C', value: 2 },
  ]
  c.slides[3].data.points = [
    { label: 'A', value: -1e-7 },
    { label: 'B', value: 0 },
    { label: 'C', value: 1e-7 },
  ]
  c.slides[3].data.annotation = { from: 0, to: 2, text: 'Signed tiny observations' }
  c.slides[4].data.start = 0
  c.slides[4].data.baseline = -2
  c.slides[4].data.steps = [
    { label: 'Reduction', value: -1, focus: true },
    { label: 'Flat', value: 0, focus: false },
    { label: 'Recovery', value: 0.5, focus: false },
  ]
  c.slides[4].data.end = -0.5
  c.slides[5].data.projects[0].actual = 0
  c.slides[5].data.projects[0].plan = 0
  const built = createDeck(c),
    charts = built.patch.ops.filter((o) => o.op === 'add-chart')
  assert.deepEqual(charts[0].data.series[0].values, [-1e-7, 0, 2])
  const micro = built.designPlan.layouts[3].components.find((v) => v.kind === 'microLine')
  assert.deepEqual(micro.numericSource, [-1e-7, 0, 1e-7])
  assert.equal(built.patch.ops.filter((o) => o.op === 'add-freeform').length, 1)
  assert.ok(micro.points[0][1] > micro.points[1][1] && micro.points[1][1] > micro.points[2][1])
  assert.equal(
    built.patch.ops.some((o) => o.op === 'add-shape' && o.name === 'S5_ActualProgress0'),
    false,
    'zero progress has no fake minimum bar',
  )
  const marker = built.patch.ops.find((o) => o.op === 'add-shape' && o.name === 'S5_PlanTick0')
  assert.equal(parseFloat(marker.x), 4.2)
  assert.ok(built.patch.ops.some((o) => o.op === 'set-text-frame' && o.text === '-0.5'))
})
test('amber-ledger identity checkers block style and rule counterexamples', () => {
  assert.doesNotThrow(() => assertDesignContract(DESIGN))
  for (const mutate of [
    (d) => d.rules.push({ id: 'bad', check: 'invented-check' }),
    (d) => (d.colors.paper = 'FFFFFF'),
    (d) => (d.amber.styles.body.italic = true),
    (d) => (d.amber.families.amberTrendSlide.variants.chartRail.regions.extra = [1, 1, 1, 1]),
  ]) {
    const d = structuredClone(DESIGN)
    mutate(d)
    assert.throws(() => assertDesignContract(d))
  }
  const patch = createDeck(fixture()).patch
  for (const op of [
    {
      op: 'set-run',
      slide: 0,
      shape: { name: 'S0_Title' },
      font: { color: '00FF00', name: 'Unregistered font', size: '8pt', italic: true },
    },
    {
      op: 'add-chart',
      slide: 0,
      name: 'BadChart',
      kind: 'pie',
      x: '1in',
      y: '1in',
      w: '2in',
      h: '2in',
      data: { categories: ['x'], series: [{ name: 'y', values: [1] }] },
    },
    { op: 'set-slide-background', slide: 0, fill: { type: 'solid', color: DESIGN.colors.accent } },
    {
      op: 'set-chart',
      slide: 3,
      shape: { name: 'S3_TrendChart' },
      series: [{ series: 0, smooth: true }],
    },
    { op: 'set-shape', slide: 0, shape: { name: 'S0_Title' }, fill: { type: 'gradient' } },
    {
      op: 'set-table',
      slide: 6,
      shape: { name: 'S6_ScenarioTable' },
      style: { horizontalBanding: true },
    },
  ])
    assert.equal(
      checkDesignPatch(DESIGN, { ...patch, ops: [...patch.ops, op] }).status,
      'fail',
      JSON.stringify(op),
    )
})
test('amber-ledger retains literal business fields and has no reference bitmap dependency', () => {
  const c = fixture(),
    b = createDeck(c),
    json = JSON.stringify(b.patch)
  for (const slide of c.slides)
    for (const field of ['title', 'section', 'source', 'verdict'])
      assert.ok(json.includes(slide.data[field].replaceAll('\n', '\\n')))
  assert.equal(
    b.patch.ops.some((o) => o.op === 'add-image'),
    false,
  )
  for (const name of [
    'amber-ledger.kit.mjs',
    'amber-layouts.mjs',
    'amber-components.mjs',
    'amber-registry.mjs',
  ])
    assert.doesNotMatch(
      readFileSync(new URL('../../pptx-nova/assets/deckkits/' + name, import.meta.url), 'utf8'),
      /warm-jade-annual-report\.jpg|5f31718068ada221|XINGLAN|RMB|TBM|fare-indexation/i,
    )
})
test('amber-ledger scopes native series properties to their OOXML chart family', () => {
  const ops = createDeck(fixture()).patch.ops
  const kinds = new Map(
    ops.filter((o) => o.op === 'add-chart').map((o) => [`${o.slide}:${o.name}`, o.kind]),
  )
  for (const op of ops.filter((o) => o.op === 'set-chart')) {
    const kind = kinds.get(`${op.slide}:${op.shape.name}`)
    for (const series of op.series ?? []) {
      if (Object.hasOwn(series, 'smooth')) assert.equal(kind, 'line')
      if (Object.hasOwn(series, 'invertIfNegative')) assert.equal(kind, 'column')
    }
  }
})
