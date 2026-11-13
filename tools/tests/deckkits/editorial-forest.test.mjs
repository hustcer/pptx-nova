import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  createDeck,
  DESIGN,
} from '../../../pptx-nova/assets/deckkits/editorial-forest/editorial-forest.kit.mjs'
import { forestSpecimen } from '../../../pptx-nova/assets/deckkits/editorial-forest/registry.mjs'
import {
  assertDesignContract,
  checkDesignPatch,
} from '../../../pptx-nova/assets/deckkits/shared/design-contract.mjs'
import { validateDeckkitContent } from '../../../pptx-nova/assets/deckkits/shared/validate-deckkit.mjs'
const file = (p) =>
  JSON.parse(
    readFileSync(
      new URL(`../../../pptx-nova/assets/deckkits/editorial-forest/${p}`, import.meta.url),
    ),
  )
const example = () => file('examples/content.json')
const excerpt = (slides) => ({ meta: { deckkit: DESIGN.id, designScope: 'excerpt' }, slides })
const single = (type) => excerpt([structuredClone(example().slides.find((s) => s.type === type))])
const reject = (c, re) => {
  const v = validateDeckkitContent(c, { mode: 'delivery' })
  assert.equal(v.valid, false, JSON.stringify(v))
  assert.throws(() => createDeck(c), re)
}
for (const [type, f] of Object.entries(DESIGN.forest.families))
  test(`editorial-forest ${type}: smallest and largest legal counts, stable distinct geometry`, () => {
    for (const maximum of [false, true]) {
      const schema = file(`schemas/${type}.schema.json`),
        fingerprints = []
      for (const layoutId of Object.keys(f.variants)) {
        const data = forestSpecimen(schema, 0, maximum)
        if (type === 'forestIndexSlide' && layoutId === 'mosaic')
          data.items = Array.from({ length: 5 }, () => ({ title: 'x', tag: 'x' }))
        const c = excerpt([{ type, layoutId, data }]),
          v = validateDeckkitContent(c, { mode: 'delivery' })
        assert.equal(v.valid, true, JSON.stringify(v.errors))
        const b = createDeck(c)
        assert.equal(b.designCheck.status, 'pass')
        assert.deepEqual(b, createDeck(structuredClone(c)))
        assert.doesNotMatch(
          JSON.stringify(b.patch),
          /Quarterly|revenue|Name Placeholder|active accounts|Indexed to plan/i,
        )
        fingerprints.push(b.designPlan.layouts[0].fingerprint)
      }
      assert.equal(new Set(fingerprints).size, 2, 'Actual component geometry must differ')
    }
  })
test('editorial-forest: every supplied visible field survives English, alternative and unrelated Chinese content', () => {
  const normalize = (s) => s.replaceAll('\\n', '').replace(/\s+/gu, '')
  const strings = (v, key = '') =>
    typeof v === 'string'
      ? ['align'].includes(key)
        ? []
        : [v]
      : Array.isArray(v)
        ? v.flatMap((v) => strings(v))
        : v && typeof v === 'object'
          ? Object.entries(v).flatMap(([k, v]) => strings(v, k))
          : []
  for (const name of ['content', 'alternate-content', 'community-content']) {
    const c = file(`examples/${name}.json`),
      b = createDeck(c),
      text = normalize(JSON.stringify(b.patch))
    assert.equal(validateDeckkitContent(c, { mode: 'delivery' }).valid, true)
    for (const s of c.slides)
      for (const value of strings(s.data))
        assert.ok(text.includes(normalize(value).replaceAll('\n', '')), value)
  }
  const text = JSON.stringify(createDeck(file('examples/community-content.json')).patch)
  assert.doesNotMatch(
    text,
    /Quarterly|revenue|Name Placeholder|retention|active accounts|indexed to plan/i,
  )
})
test('editorial-forest: identity, owned stamp, tracked chrome, rounded paper paths and native evidence remain structural', () => {
  const b = createDeck(example()),
    ops = b.patch.ops
  assert.equal(ops.filter((o) => o.op === 'add-slide').length, 9)
  assert.equal(ops.filter((o) => o.op === 'add-chart').length, 1)
  assert.equal(ops.filter((o) => o.op === 'add-table').length, 1)
  assert.equal(
    ops.some((o) => ['add-image', 'add-group'].includes(o.op)),
    false,
  )
  const anchor = ops.find(
    (o) => o.op === 'set-text-frame' && o.frame && o.shape.name.endsWith('Monogram'),
  )
  assert.equal(anchor.frame.verticalAnchor, 'middle')
  assert.ok(
    ops.some(
      (o) =>
        o.op === 'set-paragraph' &&
        o.shape.name.endsWith('Monogram') &&
        o.format.alignment === 'center',
    ),
  )
  assert.ok(
    ops.some(
      (o) =>
        o.op === 'set-run' && o.font.name === 'JetBrains Mono' && o.font.letterSpacing === '1pt',
    ),
  )
  assert.ok(
    ops.some(
      (o) =>
        o.op === 'add-freeform' &&
        o.name.endsWith('TopicTile0') &&
        o.path.commands.some((c) => c.type === 'cubic'),
    ),
  )
  const suffixes = ops.filter((o) => o.op === 'add-run')
  assert.deepEqual(
    suffixes.map((o) => o.text),
    ['%', '%', 'M'],
  )
  assert.ok(suffixes.every((o) => o.paragraph === 0 && o.font.size === '36pt'))
  const chart = ops.find((o) => o.op === 'add-chart')
  assert.deepEqual(chart.data.series[0].values, [62, 74, 81, 88, 92])
  assert.deepEqual(ops.find((o) => o.op === 'set-chart').plot, { gapWidth: 160, overlap: -20 })
})
test('editorial-forest: both topic orientations keep light-green small text readable', () => {
  const c = single('forestIndexSlide')
  for (const layoutId of ['mosaic', 'rows']) {
    c.slides[0].layoutId = layoutId
    const p = createDeck(c).patch
    for (const suffix of ['TopicNumber3', 'TopicTag3'])
      assert.equal(
        p.ops.find((o) => o.op === 'set-run' && o.shape.name.endsWith(suffix)).font.color,
        DESIGN.colors.paper,
      )
  }
})
test('editorial-forest: mixed numeral suffix fit uses each run size without modifying input', () => {
  const c = single('forestStatsSlide')
  c.slides[0].data.stats[2] = {
    label: '周期',
    value: '3.1',
    unit: '周',
    body: 'Synthetic duration / 合成周期',
  }
  const before = structuredClone(c),
    b = createDeck(c)
  assert.deepEqual(c, before)
  assert.equal(
    b.patch.ops.find((o) => o.op === 'add-run' && o.shape.name.endsWith('StatNumber2')).text,
    '周',
  )
})
test('editorial-forest: blank fields, excess arrays, numeric inconsistencies and undeclared payload fail closed', () => {
  for (const slide of example().slides) {
    const c = excerpt([slide])
    c.slides[0].data.source = '  '
    reject(c, /invalid format/)
  }
  for (const type of Object.keys(DESIGN.forest.families)) {
    const c = single(type)
    const schema = file(`schemas/${type}.schema.json`)
    for (const [key, node] of Object.entries(schema.properties))
      if (node.type === 'array') {
        const bad = structuredClone(c)
        while (bad.slides[0].data[key].length <= node.maxItems)
          bad.slides[0].data[key].push(structuredClone(bad.slides[0].data[key][0]))
        reject(bad, /too many items/)
      }
    const bad = structuredClone(c)
    bad.slides[0].data.unused = 'must not vanish'
    reject(bad, /unknown field unused/)
  }
  let c = single('forestChartSlide')
  c.slides[0].data.series[0].values.pop()
  reject(c, /match all categories/)
  c = single('forestChartSlide')
  c.slides[0].data.series[0].values[0] = NaN
  reject(c, /finite number/)
  c = single('forestChartSlide')
  c.slides[0].data.series[0].values[0] = Number.MAX_VALUE
  reject(c, /finite range/)
  c = single('forestMatrixSlide')
  c.slides[0].data.rows[0].pop()
  reject(c, /match all columns/)
  c = single('forestMatrixSlide')
  c.slides[0].data.focusColumn = 1.5
  reject(c, /focusColumn outside/)
  c = single('forestMatrixSlide')
  c.slides[0].data.columns[0].weight = 0
  reject(c, /must exceed 0/)
  c = single('forestProcessSlide')
  c.slides[0].data.steps[0].owner = ' '
  reject(c, /invalid format/)
  c = single('forestCoverSlide')
  c.slides[0].data.monogram = 'ABCD'
  reject(c, /three glyphs/)
  c = single('forestFeatureSlide')
  c.slides[0].imageSlots = { visual: { assetId: 'photo' } }
  reject(c, /image ingestion/)
  c = single('forestQuoteSlide')
  c.slides[0].customOps = []
  reject(c, /custom operations/)
  c = single('forestIndexSlide')
  c.slides[0].layoutId = 'mosaic'
  c.slides[0].data.items.pop()
  reject(c, /Mosaic requires five/)
  c = single('forestCoverSlide')
  c.slides[0].data.title = 'W'.repeat(200)
  reject(c, /token exceeds width|No layout fits/)
})
test('editorial-forest: unknown rules, foreign colours/fonts/effects and invalid frame facts are rejected', () => {
  let d = structuredClone(DESIGN)
  d.rules.push({ id: 'bogus', check: 'not-registered' })
  assert.throws(() => assertDesignContract(d), /Unknown design checker/)
  d = structuredClone(DESIGN)
  d.colors.accent = 'FF00FF'
  assert.throws(() => assertDesignContract(d), /Forest identity/)
  d = structuredClone(DESIGN)
  d.fonts.display.latin = 'Arial'
  assert.throws(() => assertDesignContract(d), /font pair/)
  d = structuredClone(DESIGN)
  d.forest.families.forestCoverSlide.variants.hanging.regions.hero[0] = -1
  assert.throws(() => assertDesignContract(d), /frame|bounds|outside/i)
  const b = createDeck(example()),
    p = structuredClone(b.patch)
  p.ops.find((o) => o.op === 'set-run').font.italic = true
  assert.equal(checkDesignPatch(DESIGN, p).status, 'fail')
})
test('editorial-forest: complete/excerpt intent and deterministic cadence are enforced', () => {
  const c = single('forestQuoteSlide')
  delete c.meta.designScope
  reject(c, /Complete decks/)
  const slide = example().slides.find((s) => s.type === 'forestQuoteSlide')
  reject(
    excerpt([structuredClone(slide), structuredClone(slide), structuredClone(slide)]),
    /cadence/,
  )
  const auto = excerpt(
    Array.from({ length: 4 }, () => ({ ...structuredClone(slide), layoutId: 'auto' })),
  )
  assert.equal(createDeck(auto).designPlan.layouts.length, 4)
})

test('editorial-forest: tiny values retain native data and a readable exact-value register', () => {
  const c = single('forestChartSlide'),
    s = c.slides[0]
  s.data.title = 'Observed change'
  s.data.categories = ['A', 'B', 'C', 'D', 'E', 'F']
  s.data.series = [
    { name: 'OBSERVED', values: [-12, 0, 1e-6, 32, 64, 96] },
    { name: 'REFERENCE', values: [-6, 0, 2e-6, 28, 52, 82] },
  ]
  const original = structuredClone(s.data)
  for (const layoutId of ['full', 'rail']) {
    s.layoutId = layoutId
    const b = createDeck(c),
      chart = b.patch.ops.find((o) => o.op === 'add-chart'),
      table = b.patch.ops.find((o) => o.op === 'add-table')
    assert.deepEqual(chart.data.series, s.data.series)
    assert.equal(b.patch.ops.find((o) => o.op === 'set-chart').dataLabels[0].showValue, false)
    assert.deepEqual(table.data[1], ['OBSERVED', '-12', '0', '1.00e-6', '32', '64', '96'])
    assert.deepEqual(table.data[2], ['REFERENCE', '-6', '0', '2.00e-6', '28', '52', '82'])
    assert.ok(parseFloat(chart.y) + parseFloat(chart.h) < parseFloat(table.y))
    assert.ok(
      b.patch.ops
        .filter((o) => o.op === 'set-table')
        .every((o) =>
          o.cells.every(
            (c) => c.style.font.size === '11pt' && c.style.font.color === DESIGN.colors.paper,
          ),
        ),
    )
  }
  assert.deepEqual(s.data, original)
})
