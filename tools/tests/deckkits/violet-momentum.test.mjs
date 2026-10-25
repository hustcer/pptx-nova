import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  createDeck,
  DESIGN,
} from '../../../pptx-nova/assets/deckkits/violet-momentum/violet-momentum.kit.mjs'
import {
  assertDesignContract,
  checkDesignPatch,
} from '../../../pptx-nova/assets/deckkits/shared/design-contract.mjs'
import { validateDeckkitContent } from '../../../pptx-nova/assets/deckkits/shared/validate-deckkit.mjs'
import { violetSpecimen } from '../../../pptx-nova/assets/deckkits/violet-momentum/registry.mjs'
import {
  violetGolden,
  violetDifferentDomain,
  violetStress,
} from '../fixtures/violet-momentum-fixtures.mjs'
const excerpt = (slides) => ({
  meta: { deckkit: 'violet-momentum', designScope: 'excerpt' },
  slides,
})
const validate = (c) => validateDeckkitContent(c, { deckkit: 'violet-momentum', mode: 'delivery' })
for (const [type, f] of Object.entries(DESIGN.violet.families))
  test(`violet-momentum ${type}: minimal input, every real layout, different domain`, () => {
    const schema = JSON.parse(
      readFileSync(
        new URL(
          `../../../pptx-nova/assets/deckkits/violet-momentum/schemas/${type}.schema.json`,
          import.meta.url,
        ),
      ),
    )
    const data = violetSpecimen(schema),
      fingerprints = []
    for (const layoutId of Object.keys(f.variants)) {
      const c = excerpt([{ type, layoutId, data }])
      assert.equal(validate(c).valid, true, JSON.stringify(validate(c).errors))
      const b = createDeck(c)
      assert.equal(b.designCheck.status, 'pass')
      assert.deepEqual(b, createDeck(structuredClone(c)))
      fingerprints.push(b.designPlan.layouts[0].fingerprint)
    }
    assert.equal(
      new Set(fingerprints).size,
      fingerprints.length,
      'alternative layouts must have distinct actual geometry',
    )
    const s = violetDifferentDomain().slides.find((s) => s.type === type),
      c = excerpt([s])
    assert.equal(validate(c).valid, true, JSON.stringify(validate(c).errors))
    assert.doesNotMatch(
      JSON.stringify(createDeck(c).patch),
      /Fleet operations|Tongzhou|Linwan|Yishan|Dispatch rollout|Q4 Action|RMB\/order|Maintenance|Battery replacement/,
    )
  })
test('violet-momentum golden and maximum-density inputs build without dropping fields', () => {
  for (const c of [violetGolden(), violetStress()]) {
    const v = validate(c)
    assert.equal(v.valid, true, JSON.stringify(v.errors))
    assert.equal(createDeck(c).designPlan.layouts.length, c.slides.length)
  }
  const p = createDeck(violetStress()).patch.ops
  assert.equal(p.filter((o) => o.op === 'add-chart')[0].data.series[0].values[0], -12)
  assert.equal(p.filter((o) => o.op === 'add-chart')[0].data.series[0].values[2], 0.000001)
  const fill = p.filter((o) => o.op === 'add-shape' && /ProjectFill/.test(o.name))
  assert.equal(fill.length, 2, 'zero progress has no invented minimum fill')
})
test('violet-momentum rejects missing, excess, invalid, unknown and contradictory evidence', () => {
  const mutations = [
    (c) => delete c.slides[0].data.source,
    (c) => delete c.slides[2].data.metrics[0].unit,
    (c) => delete c.slides[7].data.projects[0].owner,
    (c) => c.slides[5].data.total++,
    (c) => (c.slides[4].data.points[0].value = null),
    (c) => (c.slides[4].data.boundaryIndex = 99),
    (c) => (c.slides[4].data.events[1].index = c.slides[4].data.events[0].index),
    (c) => (c.slides[7].data.projects[0].progress = 101),
    (c) => (c.slides[8].data.ratings[0].position = 1.5),
    (c) => c.slides[3].data.rows[0].pop(),
    (c) => c.slides[3].data.rows.push(...c.slides[3].data.rows),
    (c) => (c.slides[0].data.title = 'W'.repeat(300)),
    (c) => (c.slides[1].data.index = 1.5),
    (c) => (c.slides[4].data.secondFocus = 1),
    (c) => (c.slides[0].layoutId = 'invented'),
    (c) => (c.slides[0].customOps = []),
    (c) => c.slides.pop(),
  ]
  for (const mutate of mutations) {
    const c = violetGolden()
    mutate(c)
    assert.equal(validate(c).valid, false, mutate.toString())
    assert.throws(() => createDeck(c), undefined, mutate.toString())
  }
})
test('violet-momentum checks identity, unknown rules, typography and actual chart color', () => {
  for (const mutate of [
    (d) => d.rules.push({ id: 'unknown', check: 'unknown' }),
    (d) => (d.colors.accent = 'FF0000'),
    (d) => (d.fonts.body.latin = 'Georgia'),
  ]) {
    const d = structuredClone(DESIGN)
    mutate(d)
    assert.throws(() => assertDesignContract(d))
  }
  const b = createDeck(violetGolden())
  for (const mutate of [
    (p) =>
      p.ops.push({
        op: 'set-shape',
        slide: 0,
        shape: { name: 'X' },
        fill: { type: 'solid', color: 'FF0000' },
      }),
    (p) =>
      p.ops.push({
        op: 'set-run',
        slide: 0,
        shape: { name: 'X' },
        font: { name: 'Georgia', size: '9pt', italic: true },
      }),
    (p) => (p.ops.find((o) => o.op === 'set-chart').series[0].fill.color = DESIGN.colors.ink),
  ]) {
    const p = structuredClone(b.patch)
    mutate(p)
    assert.equal(checkDesignPatch(DESIGN, p, b.designPlan.layouts).status, 'fail')
  }
})
test('violet-momentum owned total holds mixed-size paragraphs in one native shape', () => {
  const b = createDeck(violetGolden()),
    shape = b.patch.ops.find((o) => o.op === 'add-shape' && o.name.endsWith('TotalBubble'))
  assert.equal(shape.kind, 'ellipse')
  const frames = b.patch.ops.filter(
    (o) => o.op === 'set-text-frame' && o.shape?.name === shape.name,
  )
  assert.ok(frames.some((o) => o.frame?.verticalAnchor === 'middle'))
  const fonts = b.patch.ops.filter((o) => o.op === 'set-run' && o.shape?.name === shape.name)
  assert.ok(fonts.some((o) => o.paragraph === 0 && o.font.size === '28pt'))
  assert.ok(fonts.some((o) => o.paragraph === 1 && o.font.size === '11.5pt'))
})

test('violet-momentum uses uniform native series fill without redundant point overrides', () => {
  const p = createDeck(violetStress()).patch
  const s = p.ops.find((o) => o.op === 'set-chart').series[0]
  assert.equal(s.fill.color, DESIGN.colors.accent)
  assert.equal(s.invertIfNegative, false)
  assert.equal(s.points, undefined)
})

test('violet-momentum emits no reference image or rasterized evidence', () => {
  for (const c of [violetGolden(), violetStress(), violetDifferentDomain('mixed')]) {
    const patch = createDeck(c).patch
    assert.equal(
      patch.ops.some((o) => /image|picture/i.test(o.op)),
      false,
    )
    assert.doesNotMatch(JSON.stringify(patch), /electric-violet-business|open-kimi-ppt|\/Users\//)
  }
})

test('violet-momentum invalid evidence identifies the failing field and bound', () => {
  const c = violetGolden()
  c.slides[7].data.projects[0].progress = 101
  const v = validate(c)
  assert.equal(v.valid, false)
  assert.ok(
    v.errors.some((e) => /slides\[7\]\.data\.projects\[0\]\.progress: maximum 100/.test(e.message)),
  )
})

test('violet-momentum table fit and native cell styles share readable gutters and actual emphasis', () => {
  const b = createDeck(violetGolden())
  for (const [name, column] of [
    ['SummaryTable', 1],
    ['Scorecard', 2],
  ]) {
    const op = b.patch.ops.find((o) => o.op === 'set-table' && o.shape.name.endsWith(name))
    const cells = op.cells.filter((c) => c.row > 0)
    assert.ok(cells.length > 0)
    for (const c of cells) {
      assert.equal(c.style.marginLeft, '0.12in')
      assert.equal(c.style.marginRight, '0.12in')
      assert.equal(c.style.font.size, '11.5pt')
      assert.equal(
        c.style.font.color,
        c.column === column ? DESIGN.colors.accent : DESIGN.colors.ink,
      )
      assert.equal(c.style.font.bold, c.column === column)
    }
    assert.ok(
      cells.filter((c) => [1, 2, 3].includes(c.column)).every((c) => c.style.alignment === 'right'),
    )
  }
})

test('violet-momentum separates quantity and units and closes a three-metric cover grid', () => {
  const c = violetGolden(),
    slide = c.slides[0]
  slide.data.metrics.pop()
  const b = createDeck(excerpt([slide])),
    p = b.patch.ops
  const text = (suffix) =>
    p.find(
      (o) => o.op === 'set-text-frame' && o.shape.name.endsWith(suffix) && o.text !== undefined,
    )?.text
  assert.equal(text('Metric0Value'), String(slide.data.metrics[0].actual))
  assert.equal(
    text('Metric0Label'),
    `${slide.data.metrics[0].label} · ${slide.data.metrics[0].unit}`,
  )
  const components = b.designPlan.layouts[0].components
  assert.equal(components.find((c) => c.name === 'Metric2Value').frame[2], 3.55)
  assert.ok(components.find((c) => c.name === 'MetricGridV').frame[3] < 2)
})

test('violet-momentum labels completion and position without changing risk or filling cumulative dots', () => {
  const c = violetGolden()
  c.slides[7].data.progressLabel = '交付完成度'
  c.slides[8].data.scaleLabel = '成熟度位置 · 1–10'
  const p = createDeck(c).patch.ops
  const texts = p.filter((o) => o.op === 'set-text-frame').map((o) => o.text)
  assert.ok(texts.includes('交付完成度'))
  assert.ok(texts.includes('成熟度位置 · 1–10'))
  assert.ok(texts.includes('Watch'))
  for (let i = 0; i < 3; i++) {
    assert.equal(
      p.filter((o) => o.op === 'add-shape' && o.name.includes(`Rating${i}Dot`)).length,
      1,
    )
    assert.ok(
      p.some(
        (o) =>
          o.op === 'set-text-frame' && o.shape.name.endsWith(`RatingMinimum${i}`) && o.text === '1',
      ),
    )
    assert.ok(
      p.some(
        (o) =>
          o.op === 'set-text-frame' &&
          o.shape.name.endsWith(`RatingMaximum${i}`) &&
          o.text === '10',
      ),
    )
  }
})
