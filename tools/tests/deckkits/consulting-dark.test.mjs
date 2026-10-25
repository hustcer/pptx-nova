import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  createDeck,
  DESIGN,
} from '../../../pptx-nova/assets/deckkits/consulting-dark/consulting-dark.kit.mjs'
import {
  assertDesignContract,
  checkDesignPatch,
  designHash,
} from '../../../pptx-nova/assets/deckkits/shared/design-contract.mjs'
import { validateDeckkitContent } from '../../../pptx-nova/assets/deckkits/shared/validate-deckkit.mjs'
import { consultingProjectedBudgets } from '../../../pptx-nova/assets/deckkits/consulting-dark/registry.mjs'
const golden = JSON.parse(
  readFileSync(
    new URL(
      '../../../pptx-nova/assets/deckkits/consulting-dark/examples/content.json',
      import.meta.url,
    ),
  ),
)
const excerpt = (i) => ({
  meta: { deckkit: 'consulting-dark', designScope: 'excerpt' },
  slides: [structuredClone(golden.slides[i])],
})
const visible = (patch) =>
  patch.ops
    .flatMap((o) => [
      ...(typeof o.text === 'string' ? [o.text] : []),
      ...(o.op === 'add-chart' ? [...o.data.categories, ...o.data.series.map((s) => s.name)] : []),
      ...(o.op === 'add-table' ? o.data.flat() : []),
    ])
    .join(' ')
    .replace(/\s+/gu, '')
const assertVisible = (content, patch) => {
  const text = visible(patch)
  const walk = (v) => {
    if (typeof v === 'string') assert.ok(text.includes(v.replace(/\s+/gu, '')), `Lost field: ${v}`)
    else if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') Object.values(v).forEach(walk)
  }
  content.slides.forEach((s) => walk(s.data))
}

test('Consulting Dark covers all ten roles with deterministic complete plans and native evidence', () => {
  const a = createDeck(golden),
    b = createDeck(golden)
  assert.equal(DESIGN.version, '2.1.0')
  assert.equal(Object.keys(DESIGN.consulting.families).length, 10)
  assert.equal(designHash(a), designHash(b))
  assert.equal(a.designPlan.layouts.length, 10)
  assertVisible(golden, a.patch)
  assert.equal(a.patch.ops.filter((o) => o.op === 'add-chart').length, 1)
  assert.equal(a.patch.ops.filter((o) => o.op === 'add-table').length, 1)
  const table = a.patch.ops.find((o) => o.op === 'add-table')
  assert.equal(table.rows, table.data.length)
  assert.equal(table.columns, table.data[0].length)
  const validation = validateDeckkitContent(golden, {
    deckkit: 'consulting-dark',
    mode: 'delivery',
  })
  assert.equal(validation.valid, true, JSON.stringify(validation.errors))
  assert.equal(validation.designCapacity.length, 10)
})

test('all twenty explicit compositions preserve identical content and change actual geometry', () => {
  for (const [i, s] of golden.slides.entries()) {
    const ids = Object.keys(DESIGN.consulting.families[s.type].variants),
      results = ids.map((id) => {
        const c = excerpt(i)
        c.slides[0].layoutId = id
        const r = createDeck(c)
        assertVisible(c, r.patch)
        return r
      })
    assert.notEqual(
      results[0].designPlan.layouts[0].fingerprint,
      results[1].designPlan.layouts[0].fingerprint,
      s.type,
    )
    assert.notEqual(designHash(results[0].patch), designHash(results[1].patch), s.type)
  }
})

test('numeric chart data preserve negative, zero and tiny values without a shape substitute', () => {
  const c = excerpt(7),
    d = c.slides[0].data
  d.chartData = {
    categories: ['A', 'B', 'C', 'D'],
    series: [{ name: 'Observed change', values: [-12, 0, 0.0001, 100] }],
  }
  const p = createDeck(c).patch,
    chart = p.ops.find((o) => o.op === 'add-chart')
  assert.deepEqual(chart.data, d.chartData)
  assert.equal(chart.kind, 'bar')
  const settings = p.ops.find((o) => o.op === 'set-chart')
  assert.equal(settings.axes.find((a) => a.axis === 'value').scale.min, -42)
  const zero = structuredClone(c)
  zero.slides[0].data.chartData.series[0].values.fill(0)
  assert.equal(
    createDeck(zero).patch.ops.find((o) => o.op === 'set-chart').axes[1].scale,
    undefined,
  )
  for (const v of [NaN, Infinity, -Infinity]) {
    const bad = structuredClone(c)
    bad.slides[0].data.chartData.series[0].values[0] = v
    assert.throws(() => createDeck(bad), /finite/)
  }
  const mismatch = structuredClone(c)
  mismatch.slides[0].data.chartData.categories.pop()
  assert.throws(() => createDeck(mismatch), /categories and values/)
})

test('unknown fields, missing provenance, old tuples, custom operations and overflow fail closed', () => {
  const missing = excerpt(0)
  delete missing.slides[0].data.source
  assert.throws(() => createDeck(missing), /missing source/)
  const old = excerpt(3)
  old.slides[0].data.kpis[0] = ['C8583A', '96%', 'Legacy', 'Old tuple']
  assert.throws(() => createDeck(old), /expected object/)
  const field = excerpt(7)
  field.slides[0].data.tableWidth = 8
  assert.throws(() => createDeck(field), /unknown field/)
  const custom = excerpt(0)
  custom.slides[0].customOps = []
  assert.throws(() => createDeck(custom), /customOps/)
  const layout = excerpt(0)
  layout.slides[0].layoutId = 'invented'
  assert.throws(() => createDeck(layout), /No layout fits/)
  const many = excerpt(5)
  while (many.slides[0].data.cards.length < 6)
    many.slides[0].data.cards.push(structuredClone(many.slides[0].data.cards[0]))
  assert.throws(() => createDeck(many), /too many/)
  const overflow = excerpt(3)
  overflow.slides[0].data.kpis[0].note = 'Unbounded text '.repeat(200)
  assert.throws(() => createDeck(overflow), /No layout fits/)
  const table = excerpt(7)
  table.slides[0].data.tableRows[1].pop()
  assert.throws(() => createDeck(table), /rectangular/)
})

test('the style gate rejects rounded cap containers, foreign colors, fonts and effects', () => {
  const base = createDeck(golden).patch
  for (const mutate of [
    (p) => (p.ops.find((o) => o.op === 'add-shape').kind = 'rounded-rectangle'),
    (p) => (p.ops.find((o) => o.op === 'set-run').font.color = 'FF00FF'),
    (p) => (p.ops.find((o) => o.op === 'set-run').font.name = 'Comic Sans MS'),
    (p) => (p.ops.find((o) => o.op === 'set-run').font.italic = true),
    (p) => (p.ops.find((o) => o.op === 'set-shape').fill = { type: 'gradient', stops: [] }),
    (p) => (p.ops.find((o) => o.op === 'add-chart').kind = 'pie'),
    (p) => p.ops.push({ op: 'add-freeform', name: 'LegacySurface' }),
    (p) => (p.ops.find((o) => o.op === 'set-slide-background').fill.color = DESIGN.colors.paper),
  ]) {
    const p = structuredClone(base)
    mutate(p)
    assert.equal(checkDesignPatch(DESIGN, p).status, 'fail')
  }
  const d = structuredClone(DESIGN)
  d.rules.push({ id: 'invented', check: 'unknown-check' })
  assert.throws(() => assertDesignContract(d), /Unknown design checker/)
  const region = structuredClone(DESIGN)
  region.consulting.families.heroSlide.variants.split.regions.unknown = [0, 0, 1, 1]
  assert.throws(() => assertDesignContract(region), /unregistered regions/)
})

test('a different theme never receives reference business text or policy from the renderer', () => {
  const walk = (v) =>
    typeof v === 'string'
      ? 'Lib'
      : Array.isArray(v)
        ? v.map(walk)
        : v && typeof v === 'object'
          ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]))
          : v
  const c = structuredClone(golden)
  c.slides = c.slides.map((s) => ({ ...s, data: walk(s.data) }))
  const p = createDeck(c).patch
  assertVisible(c, p)
  assert.doesNotMatch(
    visible(p),
    /StrategyLab|October|hustcer|xdoc|Thankyou|96%|Syntheticdemonstration/,
  )
})

test('cover and decision retain native circles with varied sizes in every layout', () => {
  for (const i of [0, 9])
    for (const layoutId of Object.keys(
      DESIGN.consulting.families[golden.slides[i].type].variants,
    )) {
      const c = excerpt(i)
      c.slides[0].layoutId = layoutId
      const orbs = createDeck(c).patch.ops.filter(
        (o) => o.op === 'add-shape' && o.name.includes('AnchorOrb'),
      )
      assert.equal(orbs.length, 7)
      assert.ok(orbs.every((o) => o.kind === 'oval'))
      assert.ok(new Set(orbs.map((o) => o.w)).size >= 5)
    }
})

test('every composition groups peers without folded corners or arbitrary first-item fills', () => {
  for (const [i, slide] of golden.slides.entries())
    for (const layoutId of Object.keys(DESIGN.consulting.families[slide.type].variants)) {
      const c = excerpt(i)
      c.slides[0].layoutId = layoutId
      const { patch, designPlan } = createDeck(c)
      assert.equal(
        patch.ops.some((o) => o.op === 'add-freeform'),
        false,
        slide.type,
      )
      assert.ok(
        patch.ops
          .filter((o) => o.op === 'set-slide-background')
          .every((o) => o.fill.color === DESIGN.colors.navy),
      )
      assert.equal(designPlan.layouts[0].mode, 'dark')
      const components = designPlan.layouts[0].components
      const surfaces = components.filter((x) => x.name.includes('Surface'))
      assert.ok(surfaces.every((x) => /^(Position|Engine|Output)Surface/.test(x.name)))
      if (slide.type === 'previewProductSlide') {
        const values = components.filter((x) => /^Kpi\d+Value$/.test(x.name))
        assert.equal(new Set(values.map((x) => x.style.color)).size, 1)
      }
    }
})

test('the flow connection owns the output group and its guides survive node fill ordering', () => {
  for (const layoutId of ['horizontal', 'vertical']) {
    const content = excerpt(6)
    content.slides[0].layoutId = layoutId
    const { designPlan } = createDeck(content)
    const cs = designPlan.layouts[0].components
    const outputs = cs.filter((x) => /^OutputSurface/.test(x.name))
    const guides = cs.filter((x) => /^OutputGroup/.test(x.name))
    assert.equal(outputs.length, 4)
    assert.equal(guides.length, 3)
    assert.ok(guides.every((g) => cs.indexOf(g) > Math.max(...outputs.map((x) => cs.indexOf(x)))))
    const top = guides.find((x) => x.name === 'OutputGroupTop').frame
    const bottom = guides.find(
      (x) => x.name === (layoutId === 'horizontal' ? 'OutputGroupBottom' : 'OutputGroupRight'),
    ).frame
    for (const output of outputs) {
      assert.ok(output.frame[0] >= top[0])
      assert.ok(output.frame[0] + output.frame[2] <= top[0] + top[2] + 0.001)
      assert.ok(output.frame[1] >= top[1] - 0.001)
      assert.ok(output.frame[1] + output.frame[3] <= bottom[1] + bottom[3] + 0.001)
    }
  }
})

test('chart capacity and refurbishment aliases use the current dark contract', () => {
  const budgets = consultingProjectedBudgets(DESIGN, DESIGN.consulting.families.benchmarkSlide)
  assert.equal(budgets['chartData.categories[]'].fontPt, DESIGN.consulting.chart.fontPt)
  const catalog = JSON.parse(
    readFileSync(new URL('../../../pptx-nova/assets/deckkits/catalog.json', import.meta.url)),
  )
  const fallback = catalog.entries.find((e) => e.id === DESIGN.id).refurbishProfile.fallback
  for (const [alias, role] of Object.entries({
    background: 'navy',
    text: 'paper',
    accent: 'warm',
    softAccent: 'deep',
    surface: 'deep',
    secondary: 'pale',
    muted: 'pale',
    rule: 'darkRule',
    line: 'darkRule',
  }))
    assert.equal(fallback.palette[alias], DESIGN.colors[role], alias)
  for (const role of ['heading', 'label', 'body', 'display'])
    assert.equal(fallback.fonts[role], DESIGN.fonts.body.latin, role)
  assert.equal(fallback.fonts.cjk, DESIGN.fonts.body.eastAsian)
})
