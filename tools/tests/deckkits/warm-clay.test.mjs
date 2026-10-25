import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { createDeck, DESIGN } from '../../../pptx-nova/assets/deckkits/warm-clay/warm-clay.kit.mjs'
import {
  assertDesignContract,
  checkDesignPatch,
  checkDesignReadback,
} from '../../../pptx-nova/assets/deckkits/shared/design-contract.mjs'
import { validateDeckkitContent } from '../../../pptx-nova/assets/deckkits/shared/validate-deckkit.mjs'
const read = (p) => JSON.parse(readFileSync(new URL('../../../' + p, import.meta.url), 'utf8'))
const fixture = () => read('pptx-nova/assets/deckkits/warm-clay/examples/content.json')
const excerpt = (slides) => ({ meta: { deckkit: 'warm-clay', designScope: 'excerpt' }, slides })
function minimal(s, index = 0, key = '') {
  if (s['x-slotProbeSequence'])
    return s['x-slotProbeSequence'][index % s['x-slotProbeSequence'].length]
  if (s['x-slotProbeValue'] !== undefined) return s['x-slotProbeValue']
  if (s.enum) return s.enum[0]
  if (s.type === 'object')
    return Object.fromEntries(
      Object.entries(s.properties)
        .filter(([k]) => s.required.includes(k))
        .map(([k, v]) => [k, minimal(v, index, k)]),
    )
  if (s.type === 'array')
    return Array.from({ length: s.minItems }, (_, i) => minimal(s.items, i, key))
  if (s.type === 'number') return 1
  return ['value', 'baseline', 'target'].includes(key) ? '2' : key === 'unit' ? 'kg' : 'Archive'
}
const deny =
  /low-altitude|carbon intensity|drone|2025 impact|workshop|ceramics|cohort|participants|synthetic participant quotation/i
for (const type of Object.keys(DESIGN.clay.families))
  test(`warm-clay minimal nonreference ${type} validates and builds every registered composition`, () => {
    const schema = read(`pptx-nova/assets/deckkits/warm-clay/schemas/${type}.schema.json`),
      data = minimal(schema),
      frames = []
    for (const layoutId of Object.keys(DESIGN.clay.families[type].variants)) {
      const c = excerpt([{ type, layoutId, data }]),
        v = validateDeckkitContent(c, { mode: 'delivery' })
      assert.equal(v.valid, true, JSON.stringify(v.errors))
      const a = createDeck(c)
      assert.equal(a.designCheck.status, 'pass')
      assert.equal(deny.test(JSON.stringify(a.patch)), false)
      assert.ok(JSON.stringify(a.patch).includes('Archive'))
      assert.deepEqual(a, createDeck(structuredClone(c)))
      frames.push(a.designPlan.layouts[0].fingerprint)
      if (type === 'clayChartSlide')
        assert.deepEqual(
          a.patch.ops.find((o) => o.op === 'add-chart').data.series[0].values,
          [1, 1],
        )
      if (type === 'clayStatusSlide')
        assert.equal(a.patch.ops.find((o) => o.op === 'add-table').data.length, 3)
    }
    assert.equal(new Set(frames).size, frames.length, 'legal variants must change actual geometry')
  })
test('warm-clay rejects missing and overfull data, unknown layouts, second focus and invalid status columns', () => {
  const mutations = [
    (c) => delete c.slides[2].data.unit,
    (c) => delete c.slides[0].data.source,
    (c) => c.slides[1].data.findings.push(...c.slides[1].data.findings),
    (c) => (c.slides[2].data.points[0].value = null),
    (c) => (c.slides[0].data.metrics[0].focus = true),
    (c) => (c.slides[0].data.title = 'W'.repeat(200)),
    (c) => (c.slides[4].layoutId = 'unknown'),
    (c) => (c.slides[3].data.focusColumn = 1.5),
    (c) => c.slides[3].data.rows[0].cells.pop(),
    (c) => (c.slides[6].data.columns[0].kind = 'status'),
    (c) => (c.slides[0].customOps = [{ op: 'add-image' }]),
    (c) => (c.slides[0].data.unregistered = 'no'),
    (c) => c.slides.pop(),
  ]
  for (const mutate of mutations) {
    const c = fixture()
    mutate(c)
    assert.equal(validateDeckkitContent(c, { mode: 'delivery' }).valid, false)
    assert.throws(() => createDeck(c))
  }
})
test('warm-clay chart retains zero, negative and tiny raw values in both geometries', () => {
  const s = fixture().slides[2]
  s.data.points = [
    { label: 'Negative', value: -2 },
    { label: 'Zero', value: 0 },
    { label: 'Tiny', value: 0.00002 },
    { label: 'Positive', value: 3 },
  ]
  for (const layoutId of ['chartLeft', 'chartRight']) {
    const r = createDeck(excerpt([{ ...s, layoutId }])),
      chart = r.patch.ops.find((o) => o.op === 'add-chart')
    assert.deepEqual(chart.data.series[0].values, [-2, 0, 0.00002, 3])
    assert.equal(
      r.patch.ops.find((o) => o.op === 'set-chart').dataLabels[0].position,
      'outside-end',
    )
  }
})
test('warm-clay contracts reject unknown rules, cool palette, invalid styles and regions', () => {
  for (const mutate of [
    (d) => (d.rules[0].check = 'unknown'),
    (d) => (d.colors.accent = '0000FF'),
    (d) => (d.clay.styles.title.italic = true),
    (d) => (d.clay.families.clayCoverSlide.variants.portrait.regions.hero[2] = 50),
    (d) => (d.clay.styles.body.sizePt = 8),
  ]) {
    const d = structuredClone(DESIGN)
    mutate(d)
    assert.throws(() => assertDesignContract(d))
  }
  for (const op of [
    { op: 'set-run', font: { color: '0000FF' } },
    { op: 'set-run', font: { name: 'Comic Sans MS', size: '12pt' } },
    { op: 'set-run', font: { italic: true } },
    { op: 'add-chart', kind: 'pie', data: { series: [{}] } },
    { op: 'set-shape', fill: { type: 'gradient' } },
    { op: 'add-image' },
    { op: 'add-text-box', x: '13in', y: '1in', w: '2in', h: '1in' },
  ])
    assert.equal(checkDesignPatch(DESIGN, { ops: [op] }).status, 'fail')
})
test('warm-clay respects KPI variant capacity and reports repeat composition', () => {
  const s = fixture().slides[5]
  assert.throws(() => createDeck(excerpt([{ ...s, layoutId: 'rail' }])))
  s.data.metrics = s.data.metrics.slice(0, 3)
  assert.equal(createDeck(excerpt([{ ...s, layoutId: 'rail' }])).designCheck.status, 'pass')
  assert.ok(
    createDeck(
      excerpt(Array.from({ length: 3 }, () => ({ ...s, layoutId: 'strip' }))),
    ).warnings.some((w) => w.includes('repeated')),
  )
})
test('warm-clay native object readback rejects missing chart/table data and changed binding', () => {
  const r = createDeck(fixture())
  const check = checkDesignReadback(r.designPlan, r.patch, { slides: [] }, { slides: [] })
  assert.equal(check.status, 'fail')
  assert.ok(check.issues.length > 0)
  const changed = structuredClone(r.patch)
  changed.ops.push({ op: 'add-slide' })
  assert.equal(checkDesignReadback(r.designPlan, changed, { slides: [] }).status, 'fail')
})
test('warm-clay source image is not embedded and owned labels use explicit alignment', () => {
  const r = createDeck(fixture())
  assert.equal(
    r.patch.ops.some((o) => o.op === 'add-image'),
    false,
  )
  const chips = r.patch.ops.filter(
    (o) => o.op === 'set-text-frame' && /Chip/.test(o.shape?.name ?? '') && o.frame,
  )
  assert.ok(chips.length >= 8)
  assert.ok(chips.every((o) => o.frame.verticalAnchor === 'middle'))
  for (const p of [
    'warm-clay/components.mjs',
    'warm-clay/layouts.mjs',
    'warm-clay/warm-clay.kit.mjs',
    'warm-clay/examples/content.json',
  ])
    assert.equal(
      /5e3b594c0d532372|warm-clay-works\.jpg|drone|Carbon intensity/i.test(
        readFileSync(new URL('../../../pptx-nova/assets/deckkits/' + p, import.meta.url), 'utf8'),
      ),
      false,
    )
})
test('warm-clay projections stay in sync', () => {
  const r = spawnSync(
    process.execPath,
    ['tools/generate-pptx-design-projections.mjs', 'warm-clay', '--check'],
    { encoding: 'utf8' },
  )
  assert.equal(r.status, 0, r.stderr)
})

test('warm-clay native labels avoid dangling decimal points for integers and scientific data', () => {
  const s = fixture().slides[2]
  const format = () =>
    createDeck(excerpt([s])).patch.ops.find((o) => o.op === 'set-chart').dataLabels[0].numberFormat
  assert.equal(format(), '0')
  s.data.points[0].value = 48.5
  assert.equal(format(), '0.0#####')
  s.data.points[0].value = 0.00002
  assert.equal(format(), '0.00E+00')
})
