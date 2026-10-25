import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { createDeck, DESIGN } from '../../../pptx-nova/assets/deckkits/broadside/broadside.kit.mjs'
import {
  assertDesignContract,
  checkDesignPatch,
  designHash,
} from '../../../pptx-nova/assets/deckkits/shared/design-contract.mjs'
import { validateDeckkitContent } from '../../../pptx-nova/assets/deckkits/shared/validate-deckkit.mjs'
import { broadsideProbeData } from '../../../pptx-nova/assets/deckkits/broadside/registry.mjs'

const root = new URL('../../../pptx-nova/assets/deckkits/', import.meta.url)
const read = (path) => JSON.parse(readFileSync(new URL(path, root)))
const fixture = () => read('broadside/examples/content.json')
const excerpt = (slide) => ({
  meta: { deckkit: 'broadside', designScope: 'excerpt' },
  slides: [slide],
})
const text = (patch) =>
  patch.ops
    .filter((op) => op.op === 'set-text-frame')
    .map((op) => op.text ?? '')
    .join('\n')

// Every retained responsibility must compile through the plan, including explicit alternatives.
test('Broadside resolves all 16 responsibilities and 28 genuinely different compositions', () => {
  let count = 0
  for (const slide of fixture().slides) {
    const hashes = new Set()
    for (const layoutId of Object.keys(DESIGN.broadside.families[slide.type].variants)) {
      const content = excerpt({ ...structuredClone(slide), layoutId }),
        built = createDeck(content)
      assert.equal(built.designCheck.status, 'pass')
      assert.equal(built.designPlan.layouts[0].layoutId, layoutId)
      assert.deepEqual(built, createDeck(structuredClone(content)))
      assert.equal(built.designPlan.patchHash, designHash(built.patch))
      hashes.add(built.designPlan.layouts[0].fingerprint)
      const identities = built.designPlan.objects.map((o) => `${o.slide}:${o.name}`)
      assert.equal(new Set(identities).size, identities.length)
      count++
    }
    assert.equal(hashes.size, Object.keys(DESIGN.broadside.families[slide.type].variants).length)
  }
  assert.equal(count, 28)
})
function minimal(schema) {
  if (schema.type === 'object')
    return Object.fromEntries(
      (schema.required ?? []).map((key) => [key, minimal(schema.properties[key])]),
    )
  if (schema.type === 'array')
    return Array.from({ length: schema.minItems ?? 1 }, () => minimal(schema.items))
  if (schema.type === 'number') return Math.max(schema.minimum ?? 1, 1)
  if (schema.type === 'boolean') return false
  return schema.enum?.[0] ?? 'x'
}
for (const [type, family] of Object.entries(DESIGN.broadside.families)) {
  test(`${type}: minimum content and maximum-count alternate-theme input retain their content`, () => {
    const data = minimal(read(`broadside/schemas/${type}.schema.json`)),
      content = excerpt({ type, data })
    assert.equal(
      validateDeckkitContent(content, { deckkit: 'broadside', mode: 'delivery' }).valid,
      true,
    )
    const built = createDeck(content)
    assert.doesNotMatch(
      JSON.stringify(built.patch),
      /Field Studio|public ideas|market share|Internal finance|Series E|Author Name|App Store/,
    )
    assert.match(text(built.patch), /x/)
    const maximum = broadsideProbeData(DESIGN, family)
    const alternate = excerpt({ type, data: maximum })
    assert.equal(
      validateDeckkitContent(alternate, { deckkit: 'broadside', mode: 'delivery' }).valid,
      true,
    )
    assert.doesNotThrow(() => createDeck(alternate))
  })
}

test('bar values stay native and exact, with no fabricated zero height or automatic accent', () => {
  const slide = fixture().slides.find((s) => s.type === 'broadsideBarChartSlide')
  slide.data.bars = [0, 1e-8, 1.23456789012345, 1e12].map((value, i) => ({
    label: String(i),
    value,
  }))
  slide.data.numberFormat = '0.00E+00'
  const { patch } = createDeck(excerpt(slide)),
    chart = patch.ops.find((o) => o.op === 'add-chart'),
    style = patch.ops.find((o) => o.op === 'set-chart')
  assert.deepEqual(chart.data.series[0].values, [0, 1e-8, 1.23456789012345, 1e12])
  assert.equal(style.axes.find((a) => a.axis === 'value').scale.min, 0)
  assert.equal(style.dataLabels[0].numberFormat, '0.00E+00')
  assert.ok(style.series[0].points.every((p) => p.fill.color === DESIGN.colors.gray1))
  slide.data.bars[1].accent = true
  const focused = createDeck(excerpt(slide)).patch.ops.find((o) => o.op === 'set-chart')
  assert.deepEqual(
    focused.series[0].points.map((p) => p.fill.color),
    [DESIGN.colors.gray1, DESIGN.colors.orange, DESIGN.colors.gray1, DESIGN.colors.gray1],
  )
})

test('doughnut source quantities and independent legend share one numeric model', () => {
  const slide = fixture().slides.find((s) => s.type === 'broadsideDonutSlide')
  slide.data.items = [
    { label: 'A', value: 0 },
    { label: 'B', value: 1e-8 },
    { label: 'C', value: 2 },
  ]
  const { patch } = createDeck(excerpt(slide)),
    chart = patch.ops.find((o) => o.op === 'add-chart')
  assert.equal(chart.kind, 'doughnut')
  assert.deepEqual(chart.data.series[0].values, [0, 1e-8, 2])
  assert.match(text(patch), /0 hours/)
  assert.match(text(patch), /1\.00e-8 hours/)
  assert.equal(
    patch.ops.some((o) => o.op === 'add-freeform'),
    false,
  )
})

test('complete decks require both bookends while excerpts preserve independent responsibilities', () => {
  const content = fixture()
  content.meta.designScope = 'complete'
  content.slides.shift()
  assert.throws(() => createDeck(content), /cover first/)
  content.meta.designScope = 'excerpt'
  assert.doesNotThrow(() => createDeck(content))
  const missingEnd = fixture()
  missingEnd.meta.designScope = 'complete'
  missingEnd.slides.pop()
  assert.throws(() => createDeck(missingEnd), /closing/)
  const repeatedCover = fixture()
  repeatedCover.slides.splice(2, 0, structuredClone(repeatedCover.slides[0]))
  assert.throws(() => createDeck(repeatedCover), /cover first/)
})

test('CJK headings explicitly use bold and open line spacing while body stays upright regular', () => {
  const slide = fixture().slides.find((s) => s.type === 'broadsideSplitSlide')
  Object.assign(slide.data, {
    title: '让证据\n走进生活',
    lead: '常规正文 with regular Latin',
    bullets: ['第一项', '第二项', '第三项'],
  })
  const { patch } = createDeck(excerpt(slide)),
    title = patch.ops.find((o) => o.op === 'set-run' && o.shape?.name === 'S0_Title'),
    body = patch.ops.find((o) => o.op === 'set-run' && o.shape?.name === 'S0_Lead')
  assert.equal(title.font.bold, true)
  assert.equal(title.font.eastAsian, DESIGN.fonts.display.eastAsian)
  assert.equal(body.font.bold, false)
  assert.notEqual(title.font.italic, true)
  assert.equal(
    patch.ops.find((o) => o.op === 'set-paragraph' && o.shape?.name === 'S0_Title').format
      .lineSpacing,
    1.2,
  )
})

test('bad data, ambiguous 1.x fields, excessive content and unsupported controls fail before operations', () => {
  const examples = fixture().slides
  for (const [type, mutate, pattern] of [
    ['Cover', (d) => (d.title = 'W'.repeat(200)), /title/],
    ['BarChart', (d) => delete d.unit, /missing unit/],
    ['BarChart', (d) => delete d.source, /missing source/],
    ['BarChart', (d) => (d.bars[0].display = '9M'), /unknown field display/],
    ['BarChart', (d) => (d.bars[0].value = -1), /minimum/],
    ['BarChart', (d) => (d.bars[0].value = Infinity), /finite/],
    ['BarChart', (d) => (d.bars[0].value = Number.MAX_VALUE), /finite native chart range/],
    ['BarChart', (d) => (d.bars[0].accent = true), /one orange/],
    ['Donut', (d) => (d.items[0].value = '40%'), /expected number/],
    ['Donut', (d) => d.items.forEach((i) => (i.value = 0)), /positive total/],
    [
      'Donut',
      (d) => d.items.forEach((i) => (i.value = Number.MAX_VALUE)),
      /finite native chart range/,
    ],
    ['Donut', (d) => (d.items[0].color = 'FF0000'), /unknown field color/],
    ['Stats', (d) => d.items.push(...d.items), /too many items/],
    ['Timeline', (d) => d.events.push(...d.events), /too many items/],
    ['Cycle', (d) => d.steps.pop(), /too few items/],
  ]) {
    const slide = structuredClone(examples.find((s) => s.type === `broadside${type}Slide`))
    mutate(slide.data)
    assert.throws(() => createDeck(excerpt(slide)), pattern)
    assert.equal(
      validateDeckkitContent(excerpt(slide), { deckkit: 'broadside', mode: 'delivery' }).valid,
      false,
    )
  }
  const slide = structuredClone(examples[0])
  assert.throws(() => createDeck(excerpt({ ...slide, layoutId: 'imaginary' })), /unknown layoutId/)
  assert.throws(
    () => createDeck(excerpt({ ...slide, customOps: [{ op: 'add-slide' }] })),
    /customOps/,
  )
  const split = structuredClone(examples[3])
  split.imageSlots = { 'image.split': 'reference-image' }
  assert.throws(() => createDeck(excerpt(split)), /placeholder shell/)
  assert.throws(() => createDeck({ meta: { deckkit: 'cartesian' }, slides: [slide] }), /must match/)
})

test('contract and language checks block unknown rules, colors, fonts, effects, cream pages and extra focus', () => {
  const mutated = structuredClone(DESIGN)
  mutated.rules.push({ id: 'unknown', check: 'imaginary-checker' })
  assert.throws(() => assertDesignContract(mutated), /Unknown design checker/)
  const badRegion = structuredClone(DESIGN)
  badRegion.broadside.families.broadsideCoverSlide.variants.poster.regions.bad = [0, 0, 1, 1]
  assert.throws(() => assertDesignContract(badRegion), /unregistered composition/)
  const base = createDeck(excerpt(fixture().slides[0])).patch
  for (const op of [
    {
      op: 'set-shape',
      slide: 0,
      shape: { name: 'S0_Title' },
      fill: { type: 'solid', color: '0000FF' },
    },
    {
      op: 'set-run',
      slide: 0,
      shape: { name: 'S0_Title' },
      font: { name: 'Comic Sans MS', size: '30pt' },
    },
    { op: 'set-run', slide: 0, shape: { name: 'S0_Title' }, font: { name: 'Arial', size: '9pt' } },
    { op: 'set-shape', slide: 0, shape: { name: 'S0_Title' }, effect: { shadow: {} } },
    { op: 'set-slide-background', slide: 0, fill: { type: 'solid', color: DESIGN.colors.cream } },
    {
      op: 'add-shape',
      slide: 0,
      name: 'Circle',
      kind: 'oval',
      x: '1in',
      y: '1in',
      w: '1in',
      h: '1in',
    },
    {
      op: 'set-chart',
      slide: 0,
      shape: { name: 'Chart' },
      series: [
        {
          series: 0,
          points: [
            { point: 0, fill: { type: 'solid', color: DESIGN.colors.orange } },
            { point: 1, fill: { type: 'solid', color: DESIGN.colors.orange } },
          ],
        },
      ],
    },
  ])
    assert.equal(
      checkDesignPatch(DESIGN, { ...base, ops: [...base.ops, op] }).status,
      'fail',
      JSON.stringify(op),
    )
})
