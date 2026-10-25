import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  createDeck,
  DESIGN,
} from '../../../pptx-nova/assets/deckkits/teal-journal/teal-journal.kit.mjs'
import { journalSpecimen } from '../../../pptx-nova/assets/deckkits/teal-journal/registry.mjs'
import { chartNumberFormat } from '../../../pptx-nova/assets/deckkits/teal-journal/layouts.mjs'
import {
  assertDesignContract,
  checkDesignPatch,
} from '../../../pptx-nova/assets/deckkits/shared/design-contract.mjs'
import { validateDeckkitContent } from '../../../pptx-nova/assets/deckkits/shared/validate-deckkit.mjs'
const file = (p) =>
  JSON.parse(
    readFileSync(new URL(`../../../pptx-nova/assets/deckkits/teal-journal/${p}`, import.meta.url)),
  )
const fixture = () => file('examples/content.json')
const excerpt = (slides) => ({ meta: { deckkit: 'teal-journal', designScope: 'excerpt' }, slides })
test('teal-journal: registered source signatures and native evidence remain editable', () => {
  const b = createDeck(fixture())
  assert.equal(b.designCheck.status, 'pass')
  assert.equal(b.patch.ops.filter((o) => o.op === 'add-slide').length, 8)
  assert.equal(b.patch.ops.filter((o) => o.op === 'add-chart').length, 1)
  assert.equal(b.patch.ops.filter((o) => o.op === 'add-table').length, 1)
  assert.equal(
    b.patch.ops.some((o) => ['add-image', 'add-group'].includes(o.op)),
    false,
  )
  for (const name of [
    'CoverAngularField',
    'CoverCoralEdge',
    'CoverSquare',
    'SeasonSquare3',
    'CalendarEndTick',
    'PhaseDot3Inner',
    'JourneySegment2',
    'LeaderDot5',
    'SampleCTA',
    'KPIField',
    'RoadmapSection2',
    'AllocationSegment3',
  ])
    assert.ok(
      b.patch.ops.some((o) => o.name?.endsWith(name)),
      name,
    )
  const cta = b.patch.ops.find(
    (o) => o.op === 'set-text-frame' && o.frame && o.shape.name.endsWith('SampleCTA'),
  )
  assert.equal(cta.frame.verticalAnchor, 'middle')
  assert.equal(cta.frame.marginLeft, '0.12in')
})
for (const [type, f] of Object.entries(DESIGN.journal.families))
  test(`teal-journal ${type}: minimum/maximum, nonreference and distinct real layouts`, () => {
    for (const max of [false, true]) {
      const data = journalSpecimen(file(`schemas/${type}.schema.json`), 0, max),
        fingerprints = []
      for (const layoutId of Object.keys(f.variants)) {
        const c = excerpt([{ type, layoutId, data }]),
          v = validateDeckkitContent(c, { mode: 'delivery' })
        assert.equal(v.valid, true, JSON.stringify(v.errors))
        const b = createDeck(c)
        assert.equal(b.designCheck.status, 'pass')
        assert.deepEqual(b, createDeck(structuredClone(c)))
        assert.doesNotMatch(JSON.stringify(b.patch), /Jiangnan|overnight|merchant|canal|RMB|2026/i)
        fingerprints.push(b.designPlan.layouts[0].fingerprint)
      }
      assert.equal(new Set(fingerprints).size, 2, 'layout geometry must differ')
    }
  })
test('teal-journal: alternate and mixed community inputs preserve every supplied string', () => {
  for (const name of ['content', 'alternate-content', 'community-content']) {
    const c = file(`examples/${name}.json`),
      v = validateDeckkitContent(c, { mode: 'delivery' })
    assert.equal(v.valid, true, JSON.stringify(v.errors))
    const text = JSON.stringify(createDeck(c).patch)
    const collect = (v) => {
      if (typeof v === 'string') return [v]
      if (Array.isArray(v)) return v.flatMap(collect)
      if (v && typeof v === 'object')
        return Object.entries(v)
          .filter(([k]) => !['align', 'status'].includes(k))
          .flatMap(([, x]) => collect(x))
      return []
    }
    for (const s of c.slides)
      for (const value of collect(s.data))
        assert.ok(
          text.includes(JSON.stringify(value).slice(1, -1)) ||
            text
              .replaceAll('\\n', '')
              .includes(JSON.stringify(value).slice(1, -1).replaceAll('\\n', '')),
          value,
        )
  }
  const other = JSON.stringify(createDeck(file('examples/community-content.json')).patch)
  assert.doesNotMatch(other, /Jiangnan|overnight|merchant|canal|RMB/i)
})
test('teal-journal: malformed, missing, excess and cadence counterexamples fail closed', () => {
  const mutations = [
    (c) => delete c.slides[0].data.source,
    (c) => delete c.slides[1].data.unit,
    (c) => delete c.slides[4].data.unit,
    (c) => delete c.slides[5].data.sample.cta,
    (c) => c.slides[2].data.rows[0].pop(),
    (c) => c.slides[2].data.rows.push(...Array(3).fill(c.slides[2].data.rows[0])),
    (c) => (c.slides[2].data.focusColumn = 9),
    (c) => c.slides[3].data.allocation.forEach((v) => (v.value = 0)),
    (c) => (c.slides[3].data.allocation[0].value = -1),
    (c) => (c.slides[3].data.phases[1].start = 1),
    (c) => (c.slides[4].data.steps[0].end = 6),
    (c) => (c.slides[4].data.steps[2].end = 25),
    (c) => c.slides[5].data.annotations.pop(),
    (c) => c.slides[5].data.comparison.forEach((v) => (v.value = 0)),
    (c) => (c.slides[1].data.points[0].value = null),
    (c) => (c.slides[0].data.title = '界'.repeat(150)),
    (c) => (c.slides[0].data.markers[0] = '预约登记'),
    (c) => (c.slides[0].customOps = [{ op: 'add-shape', name: 'SecondFocus' }]),
    (c) => (c.slides[0].data.businessPolicy = 'reference policy'),
    (c) => (c.slides[7].data.actions[0].owner = ' '),
    (c) => (c.slides[0].layoutId = 'unknown'),
    (c) => (c.slides = Array.from({ length: 3 }, () => structuredClone(c.slides[1]))),
  ]
  for (const mutate of mutations) {
    const c = fixture()
    mutate(c)
    const v = validateDeckkitContent(c, { mode: 'delivery' })
    assert.equal(v.valid, false, String(mutate))
    assert.ok(v.errors.length)
  }
})
test('teal-journal: rules, palette, font, shapes and source photo leakage are guarded', () => {
  for (const mutate of [
    (d) => d.rules.push({ id: 'unregistered', check: 'unknown-check' }),
    (d) => (d.colors.paper = 'FFFFFF'),
    (d) =>
      (d.journal.families.journalCoverSlide.variants.extra =
        d.journal.families.journalCoverSlide.variants.inset),
  ]) {
    const d = structuredClone(DESIGN)
    mutate(d)
    assert.throws(() => assertDesignContract(d))
  }
  const b = createDeck(fixture())
  for (const extra of [
    {
      op: 'add-text-box',
      slide: 0,
      name: 'Rogue',
      x: '1in',
      y: '1in',
      w: '1in',
      h: '1in',
      font: { name: 'Comic Sans MS', size: '5pt', color: 'FF0000' },
    },
    { op: 'set-slide-background', slide: 0, fill: { type: 'solid', color: 'FFFFFF' } },
    {
      op: 'add-shape',
      slide: 0,
      name: 'Card',
      kind: 'roundRect',
      x: '1in',
      y: '1in',
      w: '1in',
      h: '1in',
    },
  ])
    assert.equal(
      checkDesignPatch(DESIGN, { ...b.patch, ops: [...b.patch.ops, extra] }).status,
      'fail',
    )
  for (const name of [
    'teal-journal.kit.mjs',
    'components.mjs',
    'layouts.mjs',
    'registry.mjs',
    'examples/content.json',
    'examples/community-content.json',
  ])
    assert.doesNotMatch(
      readFileSync(
        new URL(`../../../pptx-nova/assets/deckkits/teal-journal/${name}`, import.meta.url),
        'utf8',
      ),
      /travel-green-handbook\.jpg|3562cb89fb6f3d26|\/Users\//,
    )
})
test('teal-journal: finite raw values, zero/negative/tiny signs and proportional geometry', () => {
  const c = fixture()
  c.slides[1].data.points = [
    { label: 'negative', value: -2 },
    { label: 'zero', value: 0 },
    { label: 'tiny', value: 1e-7 },
    { label: 'positive', value: 5 },
  ]
  const b = createDeck(c),
    chart = b.patch.ops.find((o) => o.op === 'add-chart')
  assert.deepEqual(chart.data.series[0].values, [-2, 0, 1e-7, 5])
  assert.equal(chartNumberFormat([-2, 0, 1e-7, 5]), '0.00E+00')
  const chartStyle = b.patch.ops.find((o) => o.op === 'set-chart')
  assert.equal(chartStyle.dataLabels[0].numberFormat, '0.00E+00')
  assert.ok(chartStyle.axes.find((a) => a.axis === 'value').scale.min < -2)
  assert.equal(chartNumberFormat([48, 64]), '0')
  const p = b.designPlan.layouts[3].components.filter((c) => /^AllocationSegment/.test(c.name))
  assert.ok(Math.abs(p[1].frame[2] / p[0].frame[2] - 5.25 / 4.2) < 1e-9)
  c.slides[3].data.allocation[0].value = 0
  assert.doesNotThrow(() => createDeck(c))
  c.slides[5].data.comparison[0].value = -6.8
  const negative = createDeck(c).designPlan.layouts[5].components.find(
    (c) => c.name === 'ComparisonBar0',
  )
  assert.ok(negative.frame[2] > 0)
})
