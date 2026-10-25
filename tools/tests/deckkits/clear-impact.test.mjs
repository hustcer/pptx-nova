import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runNode, skillPath, skillUrl } from '../helpers/common.mjs'

test('clear-impact builds every minimum role and all registered layout variants without reference content', async () => {
  const { createDeck, DESIGN } = await import(
    skillUrl('assets/deckkits/clear-impact/clear-impact.kit.mjs')
  )
  const { validateDeckkitContent } = await import(
    skillUrl('assets/deckkits/shared/validate-deckkit.mjs')
  )
  function specimen(s, key = '') {
    if (s['x-slotProbeValue'] !== undefined) return s['x-slotProbeValue']
    if (s.enum) return s.enum[0]
    if (s.type === 'object')
      return Object.fromEntries((s.required ?? []).map((k) => [k, specimen(s.properties[k], k)]))
    if (s.type === 'array')
      return Array.from({ length: s.minItems ?? 1 }, () => specimen(s.items, key))
    if (s.type === 'number') return key === 'weight' || key === 'target' ? 1 : 0
    return ['value', 'baseline', 'target'].includes(key) ? '1' : key === 'unit' ? 'u' : 'Proof'
  }
  for (const [type, family] of Object.entries(DESIGN.impact.families)) {
    const schema = JSON.parse(
      readFileSync(skillPath(`assets/deckkits/clear-impact/schemas/${type}.schema.json`)),
    )
    for (const layoutId of Object.keys(family.variants)) {
      const data = specimen(schema)
      if (family.role === 'scorecard') data.columns.at(-1).kind = 'status'
      const content = { meta: { deckkit: 'clear-impact' }, slides: [{ type, layoutId, data }] }
      const validation = validateDeckkitContent(content, {
        deckkit: 'clear-impact',
        mode: 'delivery',
      })
      assert.equal(
        validation.valid,
        true,
        `${type}/${layoutId}: ${JSON.stringify(validation.errors)}`,
      )
      const result = createDeck(content),
        text = JSON.stringify(result.patch)
      assert.equal(result.designCheck.status, 'pass')
      assert.doesNotMatch(
        text,
        /Low-altitude|Carbon intensity|Urban Logistics|Gen 3|2025 Impact|Material recovery|2026 Targets/,
      )
      assert.equal(
        result.patch.ops.some((op) => op.op === 'add-image'),
        false,
      )
      assert.equal(result.designPlan.layouts[0].layoutId, layoutId)
    }
  }
})

test('clear-impact preserves numeric evidence and rejects unsafe or inconsistent content', async () => {
  const { createDeck } = await import(skillUrl('assets/deckkits/clear-impact/clear-impact.kit.mjs'))
  const { validateDeckkitContent } = await import(
    skillUrl('assets/deckkits/shared/validate-deckkit.mjs')
  )
  const sample = JSON.parse(
    readFileSync(skillPath('assets/deckkits/clear-impact/examples/content.json')),
  )
  const one = (type) => ({
    meta: { deckkit: 'clear-impact' },
    slides: [structuredClone(sample.slides.find((s) => s.type === type))],
  })
  const chart = one('impactChartSlide')
  chart.slides[0].data.points = [
    { label: 'Loss', value: -2 },
    { label: 'Zero', value: 0 },
    { label: 'Small', value: 0.00001 },
  ]
  const built = createDeck(chart),
    op = built.patch.ops.find((o) => o.op === 'add-chart')
  assert.deepEqual(op.data.series[0].values, [-2, 0, 0.00001])
  assert.equal(
    built.patch.ops.find((o) => o.op === 'set-chart').dataLabels[0].numberFormat,
    '0.00E+00',
  )
  const integerChart = createDeck(one('impactChartSlide')).patch.ops.find(
    (o) => o.op === 'set-chart',
  )
  assert.equal(integerChart.dataLabels[0].numberFormat, '0')
  const decimal = one('impactChartSlide')
  decimal.slides[0].data.points[0].value = 96.25
  assert.equal(
    createDeck(decimal).patch.ops.find((o) => o.op === 'set-chart').dataLabels[0].numberFormat,
    'General',
  )
  const a = structuredClone(chart),
    b = structuredClone(chart)
  a.slides[0].layoutId = 'chartLeft'
  b.slides[0].layoutId = 'chartRight'
  assert.notDeepEqual(
    createDeck(a).designPlan.objects.map((o) => o.frame),
    createDeck(b).designPlan.objects.map((o) => o.frame),
  )
  assert.deepEqual(
    createDeck(a).patch.ops.find((o) => o.op === 'add-chart').data,
    createDeck(b).patch.ops.find((o) => o.op === 'add-chart').data,
  )
  const bad = []
  const noUnit = one('impactChartSlide')
  delete noUnit.slides[0].data.unit
  bad.push(noUnit)
  const noSource = one('impactChartSlide')
  delete noSource.slides[0].data.source
  bad.push(noSource)
  const focus = one('impactChartSlide')
  focus.slides[0].data.points[0].focus = true
  bad.push(focus)
  const excess = one('impactChartSlide')
  excess.slides[0].data.points = Array.from({ length: 7 }, () => ({ label: 'x', value: 1 }))
  bad.push(excess)
  const unknown = one('impactChartSlide')
  unknown.slides[0].data.policy = 'hidden'
  bad.push(unknown)
  const target = one('impactProgressSlide')
  target.slides[0].data.items[0].target = 0
  bad.push(target)
  const negative = one('impactProgressSlide')
  negative.slides[0].data.items[0].actual = -1
  bad.push(negative)
  const bridge = one('impactVarianceSlide')
  bridge.slides[0].data.end = 99
  bad.push(bridge)
  const cell = one('impactScorecardSlide')
  cell.slides[0].data.rows[0].cells.pop()
  bad.push(cell)
  const long = one('impactReviewSlide')
  long.slides[0].data.title = 'W'.repeat(300)
  bad.push(long)
  const ops = one('impactChartSlide')
  ops.slides[0].customOps = []
  bad.push(ops)
  for (const input of bad)
    assert.equal(
      validateDeckkitContent(input, { deckkit: 'clear-impact', mode: 'delivery' }).valid,
      false,
    )
  const repeat = one('impactChartSlide')
  repeat.slides[0].layoutId = 'chartLeft'
  repeat.slides = Array.from({ length: 3 }, () => structuredClone(repeat.slides[0]))
  assert.ok(createDeck(repeat).warnings.some((w) => w.includes('repeated')))
})

test('clear-impact enforces design rules and exposes numeric probe values without hiding text slots', async () => {
  const { createDeck, DESIGN } = await import(
    skillUrl('assets/deckkits/clear-impact/clear-impact.kit.mjs')
  )
  const { checkDesignPatch, assertDesignContract } = await import(
    skillUrl('assets/deckkits/shared/design-contract.mjs')
  )
  const content = JSON.parse(
      readFileSync(skillPath('assets/deckkits/clear-impact/examples/content.json')),
    ),
    patch = createDeck(content).patch
  for (const mutation of [
    {
      op: 'set-shape',
      slide: 0,
      shape: { name: 'S0_Title' },
      fill: { type: 'solid', color: 'FF00FF' },
    },
    {
      op: 'set-run',
      slide: 0,
      shape: { name: 'S0_Title' },
      paragraph: 0,
      run: 0,
      font: { name: 'Georgia', size: '9pt', italic: true },
    },
    {
      op: 'set-shape',
      slide: 0,
      shape: { name: 'S0_Title' },
      fill: {
        type: 'gradient',
        stops: [
          { position: 0, color: 'FFFFFF' },
          { position: 1, color: '002A12' },
        ],
      },
    },
    { op: 'add-group', slide: 0, name: 'Unsupported' },
    {
      op: 'set-shape',
      slide: 0,
      shape: { name: 'SecondFocus' },
      fill: { type: 'solid', color: DESIGN.colors.spring },
    },
  ])
    assert.equal(
      checkDesignPatch(DESIGN, { ...patch, ops: [...patch.ops, mutation] }).status,
      'fail',
    )
  const design = structuredClone(DESIGN)
  design.rules.push({ id: 'unknown', check: 'not-a-checker' })
  assert.throws(() => assertDesignContract(design), /Unknown design checker/)
  const result = JSON.parse(
    runNode([
      skillPath('scripts/cli/deckkits/slot-consistency.mjs'),
      '--deckkit',
      'clear-impact',
      '--json',
    ]).stdout,
  )
  assert.equal(result.ok, true)
  assert.equal(result.results[0].slideTypes.length, 12)
  assert.ok(result.results[0].slideTypes.every((s) => s.ghosts.length === 0))
})
