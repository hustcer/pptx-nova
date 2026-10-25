import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createDeck,
  DESIGN,
} from '../../../pptx-nova/assets/deckkits/sky-compass/sky-compass.kit.mjs'
import { readFileSync } from 'node:fs'
const fixture = () =>
  JSON.parse(
    readFileSync(
      new URL(
        '../../../pptx-nova/assets/deckkits/sky-compass/examples/content.json',
        import.meta.url,
      ),
    ),
  )
test('sky-compass registers a native editable twelve-role design', () => {
  const c = fixture(),
    b = createDeck(c)
  assert.equal(Object.keys(DESIGN.sky.families).length, 12)
  assert.equal(b.designCheck.status, 'pass')
  assert.equal(b.patch.ops.filter((o) => o.op === 'add-slide').length, 12)
  assert.equal(
    b.patch.ops.some((o) => o.op === 'add-image'),
    false,
  )
  assert.ok(b.patch.ops.some((o) => o.op === 'add-chart'))
  assert.ok(b.patch.ops.some((o) => o.op === 'add-table'))
})
import {
  assertDesignContract,
  checkDesignPatch,
} from '../../../pptx-nova/assets/deckkits/shared/design-contract.mjs'
import { validateDeckkitContent } from '../../../pptx-nova/assets/deckkits/shared/validate-deckkit.mjs'
import { skySpecimen } from '../../../pptx-nova/assets/deckkits/sky-compass/registry.mjs'
const excerpt = (slides) => ({ meta: { deckkit: 'sky-compass', designScope: 'excerpt' }, slides })
function specimen(type, maximum) {
  const schema = JSON.parse(
    readFileSync(
      new URL(
        `../../../pptx-nova/assets/deckkits/sky-compass/schemas/${type}.schema.json`,
        import.meta.url,
      ),
    ),
  )
  const d = skySpecimen(schema, 0, maximum)
  if (d.issues) d.gap = d.issues.reduce((a, v) => a + v.attribution, 0)
  if (d.drivers) d.closing = d.opening + d.drivers.reduce((a, v) => a + v.value, 0)
  if (d.rows) d.rows.forEach((v) => (v.length = d.columns.length))
  return d
}
for (const type of Object.keys(DESIGN.sky.families))
  test(`sky-compass ${type}: minimum/maximum, nonreference and every real layout`, () => {
    for (const maximum of [false, true]) {
      const data = specimen(type, maximum),
        frames = []
      for (const layoutId of Object.keys(DESIGN.sky.families[type].variants)) {
        const c = excerpt([{ type, layoutId, data }]),
          v = validateDeckkitContent(c, { mode: 'delivery' })
        assert.equal(v.valid, true, JSON.stringify(v.errors))
        const b = createDeck(c)
        assert.equal(b.designCheck.status, 'pass')
        assert.deepEqual(b, createDeck(structuredClone(c)))
        assert.doesNotMatch(
          JSON.stringify(b.patch),
          /Community support|Requests accepted|Service lead|Coordination Office|One-Stop Services|Party Leadership|senior access/i,
        )
        frames.push(b.designPlan.layouts[0].fingerprint)
      }
      assert.equal(new Set(frames).size, frames.length, 'actual component geometry must differ')
    }
  })
test('sky-compass retains reference micro-details as registered components', () => {
  const b = createDeck(fixture()),
    names = b.patch.ops.filter((o) => o.name).map((o) => o.name)
  for (const pattern of [
    /CoverNavigationDot/,
    /CoverMastheadRule/,
    /CoverReportLabel/,
    /CoverUnderline/,
    /StatusAccent/,
    /MeasureTrack/,
    /RankBaseline/,
    /RankDelta/,
    /RankDetail/,
    /ProcessTarget/,
    /MonthTick/,
    /ActionDependency/,
    /ProjectArc4/,
  ])
    assert.ok(
      names.some((n) => pattern.test(n)),
      String(pattern),
    )
  const underline = b.patch.ops.find(
    (o) => o.op === 'add-shape' && o.name.endsWith('CoverUnderline'),
  )
  assert.equal(parseFloat(underline.h), 0.055)
  const axis = b.designPlan.layouts[6].components.filter((c) => /ActionNumber/.test(c.name))
  assert.ok(
    axis[1].frame[0] - axis[0].frame[0] > axis[2].frame[0] - axis[1].frame[0],
    'real dates control time spacing',
  )
})
test('sky-compass rejects incomplete, excess, unknown, numerical and date counterexamples', () => {
  const mutations = [
    (c) => delete c.slides[0].data.source,
    (c) => delete c.slides[0].data.masthead,
    (c) => delete c.slides[2].data.unit,
    (c) => delete c.slides[5].data.issues[0].owner,
    (c) => delete c.slides[6].data.items[0].dependency,
    (c) => c.slides[2].data.points.forEach((v) => (v.value = 0)),
    (c) => (c.slides[2].data.points[0].value = -1),
    (c) => (c.slides[1].data.metrics[0].target = 0),
    (c) => c.slides[5].data.gap++,
    (c) => c.slides[9].data.closing++,
    (c) => (c.slides[4].data.steps[0].duration = -1),
    (c) => c.slides[4].data.steps.forEach((v) => (v.duration = 0)),
    (c) => (c.slides[3].data.focusIndex = 1.5),
    (c) => (c.slides[3].data.focusIndex = 99),
    (c) => (c.slides[3].data.points[0].value = null),
    (c) => (c.slides[2].data.notes[0].measure.value = 101),
    (c) => (c.slides[2].data.notes[0].measure.total = 0),
    (c) => (c.slides[7].data.progress = 101),
    (c) => (c.slides[8].data.boundaryIndex = 99),
    (c) => (c.slides[6].data.items[0].date = '2026-02-30'),
    (c) => (c.slides[6].data.items[1].date = c.slides[6].data.items[0].date),
    (c) => (c.slides[6].data.startDate = c.slides[6].data.endDate),
    (c) => (c.slides[6].data.ticks[0].date = '2025-01-01'),
    (c) => c.slides[10].data.rows[0].pop(),
    (c) => c.slides[10].data.rows.push(...c.slides[10].data.rows),
    (c) => (c.slides[11].data.items[0].rationale += '\nSecond paragraph'),
    (c) => (c.slides[0].data.title = 'W'.repeat(250)),
    (c) => (c.slides[3].layoutId = 'invented'),
    (c) => (c.slides[2].data.extra = 'unknown'),
    (c) => (c.slides[3].data.secondFocus = 3),
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
test('sky-compass raw signed/zero/tiny evidence and reconciled geometry remain truthful', () => {
  const c = fixture()
  c.slides[3].data.points = [
    { label: 'A', value: -1, baseline: -0.5, detail: 'Signed decrease' },
    { label: 'B', value: 0, baseline: 0, detail: 'Zero remains zero' },
    { label: 'C', value: 1e-7, baseline: 0, detail: 'Tiny positive observation' },
  ]
  const b = createDeck(excerpt([c.slides[3]]))
  const cs = b.designPlan.layouts[0].components
  assert.equal(
    cs.some((c) => c.name === 'RankBar1'),
    false,
  )
  assert.equal(cs.find((c) => c.name === 'RankValue2').numericSource.value, 1e-7)
  assert.equal(
    cs.some((c) => c.name === 'RankBar2'),
    false,
    'sub-EMU width is omitted with its exact numeric label, never a fake minimum',
  )
  assert.ok(cs.find((c) => c.name === 'RankBar0').frame[2] > 0)
  assert.ok(cs.some((c) => c.text === '0'))
})
test('sky-compass checkers reject wrong colors/fonts/effects and unregistered paths', () => {
  assert.doesNotThrow(() => assertDesignContract(DESIGN))
  for (const mutate of [
    (d) => d.rules.push({ id: 'unknown', check: 'unknown' }),
    (d) => (d.colors.paper = 'EEEEEE'),
    (d) => (d.sky.styles.body.italic = true),
    (d) => (d.sky.families.skyCoverageSlide.variants.plotLeft.regions.extra = [1, 1, 1, 1]),
  ]) {
    const d = structuredClone(DESIGN)
    mutate(d)
    assert.throws(() => assertDesignContract(d))
  }
  const base = createDeck(fixture())
  for (const op of [
    {
      op: 'add-text-box',
      slide: 0,
      name: 'Bad',
      x: '1in',
      y: '1in',
      w: '1in',
      h: '1in',
      text: 'bad',
      font: { name: 'Comic Sans MS', size: '12pt', color: 'FF00FF' },
    },
    {
      op: 'set-shape',
      slide: 0,
      shape: { name: 'S0_CoverCompassArc0' },
      fill: { type: 'gradient', stops: [] },
    },
    {
      op: 'set-shape',
      slide: 0,
      shape: { name: 'S0_CoverCompassArc0' },
      fill: { type: 'solid', color: DESIGN.colors.gray },
    },
    {
      op: 'add-freeform',
      slide: 0,
      name: 'Unregistered',
      x: '1in',
      y: '1in',
      w: '1in',
      h: '1in',
      path: { width: 100, height: 100, commands: [] },
    },
  ]) {
    assert.equal(
      checkDesignPatch(
        DESIGN,
        { ...base.patch, ops: [...base.patch.ops, op] },
        base.designPlan.layouts,
      ).status,
      'fail',
    )
  }
})
test('sky-compass cover compass arcs stay open and preserve the full navy scope strip', () => {
  const source = fixture().slides[0]
  for (const layoutId of Object.keys(DESIGN.sky.families.skyCoverSlide.variants)) {
    const b = createDeck(excerpt([{ ...source, layoutId }]))
    const arcs = b.designPlan.layouts[0].components.filter((c) => /^CoverCompassArc/.test(c.name))
    assert.equal(arcs.length, DESIGN.sky.compass.arcCount)
    const bandTop = DESIGN.sky.chrome.coverScope[1]
    for (const arc of arcs) {
      assert.equal(arc.fill, undefined, 'compass linework must not become a solid sector')
      assert.equal(
        arc.path.commands.some((c) => c.type === 'close'),
        false,
      )
      assert.ok(Math.abs(arc.frame[1] + arc.frame[3] - bandTop) < 1e-8)
    }
    assert.equal(
      b.designPlan.layouts[0].components.some((c) => c.fill === 'gray'),
      false,
    )
    const band = b.patch.ops.find((o) => o.op === 'add-shape' && o.name.endsWith('CoverScopeBand'))
    assert.equal(parseFloat(band.w), DESIGN.canvas.widthIn)
    const scope = b.designPlan.layouts[0].components.find((c) => c.name === 'CoverPeriod')
    assert.ok(scope.frame[1] + scope.frame[3] <= DESIGN.canvas.heightIn - 0.399)
  }
})
test('sky-compass renders planned table typography and separates level and delta units', () => {
  const built = createDeck(fixture())
  for (const layout of built.designPlan.layouts) {
    for (const table of layout.components.filter((c) => c.kind === 'table')) {
      const op = built.patch.ops.find(
        (o) => o.op === 'set-table' && o.shape.name.endsWith('_' + table.name),
      )
      op.cells.forEach((cell, i) =>
        assert.equal(cell.style.font.size, table.bindings[i].style.sizePt + 'pt'),
      )
      assert.ok(table.bindings.some((b) => b.style.sizePt === 11.5))
    }
  }
  const bridge = built.designPlan.layouts[9].components
  assert.equal(bridge.find((c) => c.name === 'BridgeValue0').text, '94 %')
  assert.equal(bridge.find((c) => c.name === 'BridgeValue1').text, '+1.2 pp')
  assert.equal(bridge.find((c) => c.name === 'BridgeValue3').text, '96 %')
})
test('sky-compass zero bridge drivers retain a level connector without a fake bar', () => {
  const s = fixture().slides[9]
  s.data.drivers = [
    { label: 'No change', value: 0 },
    { label: 'Recovery', value: 2 },
  ]
  s.data.closing = s.data.opening + 2
  const cs = createDeck(excerpt([s])).designPlan.layouts[0].components
  assert.equal(
    cs.some((c) => c.name === 'BridgeBar1'),
    false,
  )
  assert.ok(cs.some((c) => c.name === 'BridgeZeroStep1'))
})
import { skyStressBusiness } from '../fixtures/sky-compass-fixtures.mjs'
import { fitTextPlan } from '../../../pptx-nova/assets/deckkits/shared/text-layout.mjs'
test('sky-compass performance values and Chinese units stay on one line in both layouts', () => {
  const slide = skyStressBusiness().slides[1]
  for (const layoutId of Object.keys(DESIGN.sky.families.skyPerformanceSlide.variants)) {
    const table = createDeck(
      excerpt([{ ...slide, layoutId }]),
    ).designPlan.layouts[0].components.find((c) => c.name === 'Performance')
    for (let row = 1; row < table.cells.length; row++) {
      for (const column of [1, 2, 3]) {
        const binding = table.bindings[row * table.columns.length + column]
        assert.equal(
          fitTextPlan(table.cells[row][column], binding.frame, binding.style, 'numeric/unit')
            .estimatedLines,
          1,
        )
      }
    }
  }
})
test('sky-compass decision owner and Chinese date fit together at the documented font floor', () => {
  const slide = skyStressBusiness().slides[11]
  for (const layoutId of Object.keys(DESIGN.sky.families.skyDecisionsSlide.variants)) {
    const t = createDeck(excerpt([{ ...slide, layoutId }])).designPlan.layouts[0].components.find(
      (c) => c.name === 'Decisions',
    )
    const binding = t.bindings[t.columns.length + 2]
    assert.equal(
      fitTextPlan(t.cells[1][2], binding.frame, binding.style, 'owner/date').estimatedLines,
      1,
    )
    assert.equal(binding.style.sizePt, 10.5)
  }
})
