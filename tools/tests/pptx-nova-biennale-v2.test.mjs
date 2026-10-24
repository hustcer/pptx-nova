import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createDeck, DESIGN } from '../../pptx-nova/assets/deckkits/biennale-yellow.kit.mjs'
import { assertDesignContract } from '../../pptx-nova/assets/deckkits/design-contract.mjs'
import { validateDeckkitContent } from '../../pptx-nova/assets/deckkits/validate-deckkit.mjs'
const read = (p) =>
  JSON.parse(readFileSync(new URL('../../pptx-nova/assets/deckkits/' + p, import.meta.url)))
const fixture = () => read('examples/biennale-yellow-content.json')
const excerpt = (slide) => ({
  meta: { deckkit: 'biennale-yellow', designScope: 'excerpt' },
  slides: [slide],
})

test('failed editorial fit reports the design error without obsolete legacy diversity blockers', () => {
  const content = fixture()
  content.slides[0].data.footerItems[3].text = 'Overflowing credit '.repeat(100)
  const result = validateDeckkitContent(content, { mode: 'delivery' })
  assert.equal(result.valid, false)
  assert.ok(
    result.errors.some(
      (error) => error.type === 'design' && /footerItems\[3\]/.test(error.message),
    ),
  )
  assert.equal(
    result.errors.some((error) => error.type === 'diversity'),
    false,
  )
  assert.equal(
    result.warnings.some((warning) => warning.type === 'diversity'),
    false,
  )
  assert.equal(
    result.fitDiagnostics.some((diagnostic) => diagnostic.code?.startsWith('diversity.')),
    false,
  )
})

test('every page has a registered plan; native chart and all calendar cells retain source data', () => {
  const c = fixture(),
    evidence = read('examples/biennale-yellow-evidence-content.json').slides
  c.slides.splice(-1, 0, ...evidence)
  const b = createDeck(c)
  assert.equal(b.designPlan.layouts.length, c.slides.length)
  assert.equal(new Set(b.designPlan.layouts.map((l) => l.slideType)).size, 9)
  assert.deepEqual(
    b.designPlan.layouts.map((l) => l.slideIndex),
    c.slides.map((_, i) => i),
  )
  const chart = b.patch.ops.find((o) => o.name === 'S4_DataChart' && o.op === 'add-chart')
  assert.deepEqual(
    chart.data.series[0].values,
    c.slides[4].data.bars.map((p) => p.value),
  )
  assert.ok(chart.data.series[0].name.includes(c.slides[4].data.unit))
  const table = b.patch.ops.find((o) => o.op === 'add-table')
  assert.deepEqual(table.data, [
    c.slides[6].data.columns,
    ...c.slides[6].data.rows.map((r) => [r.date, r.title, r.venue, r.length]),
  ])
  assert.equal(table.columns, 4)
  assert.equal(b.designCheck.status, 'pass')
})

test('all registered editorial layouts execute, with deterministic auto and long-title selection', () => {
  for (const slide of fixture().slides.filter((s) => DESIGN.biennale.families[s.type]))
    for (const layoutId of Object.keys(DESIGN.biennale.families[slide.type].variants)) {
      const c = excerpt({ ...structuredClone(slide), layoutId })
      assert.equal(createDeck(c).designPlan.layouts[0].layoutId, layoutId)
      assert.deepEqual(createDeck(c), createDeck(structuredClone(c)))
    }
  const s = fixture().slides[0]
  s.data.title = 'A longer editorial\nprogramme for\nshared public spaces'
  const c = excerpt(s)
  assert.equal(createDeck(c).designPlan.layouts[0].layoutId, 'wide')
  s.layoutId = 'poster'
  assert.throws(() => createDeck(c), /No layout fits/)
})

test('actual composed fields, repeating rows and unknown input fail before rendering', () => {
  for (const [index, mutate, pattern] of [
    [0, (d) => (d.footerItems[3].text = 'long '.repeat(200)), /footerItems\[3\]/],
    [0, (d) => (d.title = 'W'.repeat(100)), /title/],
    [2, (d) => (d.strands[4].body = 'long '.repeat(180)), /strands/],
    [3, (d) => (d.lede = '长'.repeat(300)), /lede/],
    [4, (d) => (d.stats[0].suffix = 'W'.repeat(30)), /value\+suffix/],
    [5, (d) => (d.author = 'author '.repeat(50)), /author/],
    [6, (d) => (d.rows[7].venue = '场馆'.repeat(80)), /rows/],
    [6, (d) => d.columns.push('DROPPED'), /too many items/],
    [8, (d) => (d.footerItems[2].text = 'credit '.repeat(150)), /footerItems/],
    [1, (d) => (d.quote = 'text '.repeat(500)), /quote/],
    [4, (d) => (d.unit = '   '), /unit/],
    [4, (d) => (d.source = '   '), /source/],
    [
      4,
      (d) => {
        d.bars[0].pct = 0.3
      },
      /2.0 replaces pct/,
    ],
    [
      4,
      (d) => {
        d.bars[0].value = '76,400'
      },
      /2.0 replaces pct/,
    ],
    [
      4,
      (d) => {
        delete d.unit
      },
      /missing unit/,
    ],
    [
      4,
      (d) => {
        delete d.source
      },
      /missing source/,
    ],
    [
      4,
      (d) => {
        d.bars[0].value = NaN
      },
      /finite/,
    ],
    [
      4,
      (d) => {
        d.bars[0].accent = true
        d.bars[1].accent = true
      },
      /at most one/,
    ],
    [
      1,
      (d) => {
        d.color = 'FF0000'
      },
      /unknown field/,
    ],
  ]) {
    const s = fixture().slides[index]
    mutate(s.data)
    assert.throws(() => createDeck(excerpt(s)), pattern)
  }
  const s = fixture().slides[1]
  s.layoutId = 'unknown'
  assert.throws(() => createDeck(excerpt(s)), /No layout fits/)
  s.type = 'unregistered'
  assert.throws(() => createDeck(excerpt(s)), /unregistered/)
})

test('native data retains zero, negative, tiny and large numbers without minimum-width shapes', () => {
  const s = fixture().slides[4],
    values = [0, -12.5, 0.000001, 1234567890123, 1.23456789012345, 2]
  s.data.bars = values.map((value, i) => ({ label: `P${i}`, value, accent: i === 0 }))
  delete s.data.numberFormat
  const b = createDeck(excerpt(s)),
    chart = b.patch.ops.find((o) => o.op === 'add-chart')
  assert.deepEqual(chart.data.series[0].values, values)
  assert.equal(b.patch.ops.find((o) => o.op === 'set-chart').dataLabels[0].numberFormat, '0.00E+00')
  assert.equal(
    b.patch.ops.some((o) => o.op === 'add-shape' && /Bar\d/.test(o.name)),
    false,
  )
})

test('supported item boundaries retain every row and field; short excerpts need no invented anchors', () => {
  for (const count of [3, 5]) {
    const s = fixture().slides[2]
    s.data.strands = s.data.strands.slice(0, count)
    assert.equal(validateDeckkitContent(excerpt(s)).valid, true)
  }
  for (const count of [4, 8]) {
    const s = fixture().slides[6]
    s.data.rows = s.data.rows.slice(0, count)
    assert.equal(createDeck(excerpt(s)).patch.ops.find((o) => o.op === 'add-table').rows, count + 1)
  }
  const c = excerpt(fixture().slides[1])
  c.slides = Array.from({ length: 8 }, () => structuredClone(c.slides[0]))
  const a = createDeck(c)
  assert.equal(new Set(a.designPlan.layouts.map((l) => l.layoutId)).size, 2)
  c.meta.designScope = 'complete'
  assert.throws(() => createDeck(c), /requires cover and colophon/)
})

test('retired slots cannot be restored and contracts reject invalid registration/geometry', () => {
  for (const mutate of [
    (d) => (d.legacyLayouts = {}),
    (d) => (d.biennale.families.biennaleCoverSlide.variants.poster.regions.typo = [1, 1, 1, 1]),
    (d) => (d.biennale.families.biennaleCoverSlide.variants.poster.titleStyle = 'missing'),
    (d) => (d.biennale.styles.body.role = 'missing'),
    (d) => (d.biennale.families.biennaleQuoteSlide.variants.margin.decorations[0].frame[2] = 100),
  ]) {
    const d = structuredClone(DESIGN)
    mutate(d)
    assert.throws(() => assertDesignContract(d))
  }
  assert.equal(DESIGN.version, '2.0.0')
  const kit = readFileSync(
    new URL('../../pptx-nova/assets/deckkits/biennale-yellow.kit.mjs', import.meta.url),
    'utf8',
  )
  assert.doesNotMatch(kit, /makePageTypes|writeDesignText|resolveDesignSlot|legacyLayouts/)
})
