import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  createDeck,
  DESIGN,
} from '../../../pptx-nova/assets/deckkits/blue-research/blue-research.kit.mjs'
import { researchSpecimen } from '../../../pptx-nova/assets/deckkits/blue-research/registry.mjs'
import { compileResearchLayout } from '../../../pptx-nova/assets/deckkits/blue-research/layouts.mjs'
import {
  assertDesignContract,
  checkDesignPatch,
} from '../../../pptx-nova/assets/deckkits/shared/design-contract.mjs'
import { validateDeckkitContent } from '../../../pptx-nova/assets/deckkits/shared/validate-deckkit.mjs'
const file = (p) =>
  JSON.parse(
    readFileSync(new URL(`../../../pptx-nova/assets/deckkits/blue-research/${p}`, import.meta.url)),
  )
const fixture = () => file('examples/content.json')
const excerpt = (slides) => ({ meta: { deckkit: 'blue-research', designScope: 'excerpt' }, slides })
const valid = (c) => validateDeckkitContent(c, { mode: 'delivery' })
test('blue-research: native signatures, complete contract and no reference images', () => {
  const b = createDeck(fixture())
  assert.equal(b.designCheck.status, 'pass')
  assert.equal(b.patch.ops.filter((o) => o.op === 'add-slide').length, 10)
  assert.equal(b.patch.ops.filter((o) => o.op === 'add-chart').length, 1)
  assert.equal(b.patch.ops.filter((o) => o.op === 'add-table').length, 3)
  assert.ok(!b.patch.ops.some((o) => ['add-image', 'add-group'].includes(o.op)))
  for (const name of [
    'CoverSpine',
    'MetricCapsule2',
    'EvidenceCapsule',
    'HeatMatrix',
    'QuoteMark',
    'BridgeConnector3',
    'TierMicrobar5',
    'EventNumber3',
    'StepTop2',
    'FindingEmphasis2',
  ])
    assert.ok(
      b.patch.ops.some((o) => o.name?.endsWith(name)),
      name,
    )
  for (const o of b.patch.ops.filter((o) => o.op === 'set-run')) assert.equal(o.font.italic, false)
})
for (const [type, f] of Object.entries(DESIGN.research.families))
  test(`blue-research ${type}: distinct compositions, bounded extremes, deterministic content`, () => {
    const schema = file(`schemas/${type}.schema.json`),
      original = fixture().slides.find((s) => s.type === type),
      fingerprints = []
    for (const id of Object.keys(f.variants)) {
      const c = excerpt([{ ...original, layoutId: id }])
      assert.equal(valid(c).valid, true, JSON.stringify(valid(c).errors))
      const b = createDeck(c)
      fingerprints.push(b.designPlan.layouts[0].fingerprint)
      assert.deepEqual(b, createDeck(structuredClone(c)))
    }
    assert.equal(new Set(fingerprints).size, 2, 'real geometry must differ')
    for (const maximum of [false, true]) {
      const c = excerpt([{ type, layoutId: 'auto', data: researchSpecimen(schema, 0, maximum) }])
      assert.equal(valid(c).valid, true, JSON.stringify(valid(c).errors))
      const b = createDeck(c)
      assert.doesNotMatch(
        JSON.stringify(b.patch),
        /Hailan|instant.retail|Western County|RMB|crowdsourcing/i,
      )
    }
    // A different subject must reach every page type without renderer policy.
    const alternate = file('examples/conservation-content.json').slides.find((s) => s.type === type)
    const c = excerpt([alternate])
    assert.equal(valid(c).valid, true, JSON.stringify(valid(c).errors))
    assert.match(JSON.stringify(createDeck(c).patch), /conservation|Museum/i)
  })
test('blue-research: native data retain negatives, zero, tiny values and every stacked series', () => {
  const slide = fixture().slides.find((s) => s.type === 'researchEvidenceSlide')
  delete slide.data.chart.forecastFrom
  slide.data.chart.series[0].values = [-2, 0, 1e-8, 1.25, 3]
  const b = createDeck(excerpt([slide])),
    ch = b.patch.ops.find((o) => o.op === 'add-chart')
  assert.deepEqual(ch.data.series[0].values, [-2, 0, 1e-8, 1.25, 3])
  assert.equal(b.patch.ops.find((o) => o.op === 'set-chart').dataLabels[0].numberFormat, '0.00E+00')
  slide.data.chart.kind = 'stacked'
  slide.data.chart.series = [
    { name: 'Care A', values: [1, 2, 3, 4, 5] },
    { name: 'Care B', values: [5, 4, 3, 2, 1] },
  ]
  const stackedBuild = createDeck(excerpt([slide]))
  const stacked = stackedBuild.patch.ops.find((o) => o.op === 'add-chart')
  assert.equal(stacked.variant, 'stacked')
  assert.equal(stacked.data.series.length, 2)
  assert.equal(stackedBuild.patch.ops.find((o) => o.op === 'set-chart').plot.overlap, 100)
})
test('blue-research: source identity depends on hierarchy and relative geometry', () => {
  const b = createDeck(fixture())
  const component = (slide, name) =>
    b.designPlan.layouts[slide].components.find((c) => c.name === name)
  const cover = component(0, 'CoverTitle'),
    spine = component(0, 'CoverSpine')
  assert.equal(cover.style.sizePt, 42)
  assert.ok(spine.frame[0] < cover.frame[0])
  assert.ok(component(0, 'CoverEyebrow').frame[1] < cover.frame[1])
  assert.ok(component(0, 'Masthead').frame[1] < component(0, 'CoverEyebrow').frame[1])
  const tops = [0, 1, 2].map((i) => component(7, 'StepTop' + i).frame[1])
  assert.ok(tops[0] > tops[1] && tops[1] > tops[2], 'stages visibly ascend')
  assert.ok(tops[0] - tops[2] >= 0.75)
  assert.ok(component(7, 'AcceptanceAxis').frame[1] < tops[2])
  assert.ok(component(7, 'AcceptanceContent').frame[0] > component(7, 'StepTop2').frame[0])
  assert.ok(component(8, 'FindingsField'))
  assert.ok(component(8, 'FindingEvidence3'))
  assert.ok(component(9, 'ReaderActionMatrix'))
  assert.ok(component(9, 'DependencyArrow1'))
})
test('blue-research: measured large-title paragraph advance rejects overflow', () => {
  const d = structuredClone(DESIGN)
  d.research.styles.hero.lineHeight = 1.42
  const c = excerpt([fixture().slides[0]])
  const f = d.research.families.researchCoverSlide
  assert.throws(
    () => compileResearchLayout(d, f, 'spine', f.variants.spine, c.slides[0].data),
    /line spacing/i,
  )
})
test('blue-research: cross-field and nonblank counterexamples fail before rendering', () => {
  const sample = (type) => structuredClone(fixture().slides.find((s) => s.type === type))
  const bad = (type, mutate, rx) => {
    const s = sample(type)
    mutate(s.data)
    const c = excerpt([s])
    assert.equal(valid(c).valid, false)
    assert.throws(() => createDeck(c), rx)
  }
  bad('researchBridgeSlide', (d) => (d.closing += 1), /must equal closing/)
  bad('researchMatrixSlide', (d) => d.rows[0].cells.pop(), /few items|every column/)
  bad('researchMatrixSlide', (d) => (d.columns[0].weight = 0), /exceed|minimum/)
  bad('researchTimelineSlide', (d) => (d.events[1].elapsed = 0), /ordered distinct/)
  bad('researchTimelineSlide', (d) => (d.events[3].elapsed = 100), /inside positive range/)
  bad('researchEvidenceSlide', (d) => d.chart.series[0].values.pop(), /match every category/)
  bad('researchEvidenceSlide', (d) => (d.chart.forecastFrom = 20), /Forecast boundary/)
  bad('researchEvidenceSlide', (d) => (d.chart.unit = ' '), /format|nonblank/)
  bad('researchEvidenceSlide', (d) => (d.chart.kind = 'combo'), /expected one/)
  bad('researchTiersSlide', (d) => (d.rows[0].value = -1), /minimum|nonnegative/)
  bad('researchScorecardSlide', (d) => (d.steps[0].owner = '   '), /format|nonblank/)
  bad('researchOverviewSlide', (d) => d.claims.push(d.claims[0]), /many items/)
  const missing = sample('researchFindingsSlide')
  delete missing.data.source
  assert.equal(valid(excerpt([missing])).valid, false)
  const long = sample('researchOverviewSlide')
  long.data.title = '长'.repeat(180)
  assert.equal(valid(excerpt([long])).valid, false)
  const op = sample('researchTiersSlide')
  op.customOps = []
  assert.equal(valid(excerpt([op])).valid, false)
  const unknown = sample('researchMatrixSlide')
  unknown.layoutId = 'invented'
  assert.equal(valid(excerpt([unknown])).valid, false)
  assert.throws(() => createDeck(excerpt([unknown])), /No layout fits/)
})
test('blue-research: wrong color, font, rule, effect, second orange focus are blocked', () => {
  const b = createDeck(fixture()),
    mutate = (fn) => {
      const p = structuredClone(b.patch)
      fn(p)
      assert.equal(checkDesignPatch(DESIGN, p).status, 'fail')
    }
  mutate((p) => (p.ops.find((o) => o.op === 'set-run').font.name = 'Unregistered Font'))
  mutate((p) => (p.ops.find((o) => o.op === 'set-shape' && o.fill?.color).fill.color = 'FF00FF'))
  mutate((p) => (p.ops.find((o) => o.op === 'set-run').font.italic = true))
  mutate((p) =>
    p.ops.push({
      op: 'set-shape',
      slide: 6,
      shape: { name: 'S6_EventNumber2' },
      fill: { type: 'solid', color: DESIGN.colors.orange },
    }),
  )
  mutate((p) =>
    p.ops.push({
      op: 'set-shape',
      slide: 2,
      shape: { name: 'S2_Background' },
      fill: { type: 'solid', color: DESIGN.colors.orange },
    }),
  )
  const d = structuredClone(DESIGN)
  d.rules.push({ id: 'unknown', check: 'unregistered-rule' })
  assert.throws(() => assertDesignContract(d), /Unknown design checker/)
})
test('blue-research: numeric-derived zero geometry is honest and composition failures are explicit', () => {
  const slide = fixture().slides.find((s) => s.type === 'researchTiersSlide')
  slide.data.rows.forEach((v) => (v.value = 0))
  const b = createDeck(excerpt([slide]))
  assert.ok(!b.patch.ops.some((o) => o.name?.includes('TierMicrobar')))
  const s = fixture().slides.find((s) => s.type === 'researchScorecardSlide')
  s.layoutId = 'register'
  s.data.steps.forEach((v) => (v.actions = ['One', 'Two', 'Three']))
  assert.equal(valid(excerpt([s])).valid, false)
  s.layoutId = 'steps'
  assert.equal(valid(excerpt([s])).valid, true)
  const t = fixture().slides.find((s) => s.type === 'researchTimelineSlide')
  t.layoutId = 'horizontal'
  t.data.events[1].elapsed = 0.01
  t.data.events[2].elapsed = 0.01
  assert.equal(valid(excerpt([t])).valid, false)
  t.layoutId = 'vertical'
  assert.equal(valid(excerpt([t])).valid, true)
})
