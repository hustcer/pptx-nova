import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createDeck, DESIGN } from '../../pptx-nova/assets/deckkits/green-slate.kit.mjs'
import { createStrategyDeck } from '../../pptx-nova/assets/deckkits/strategy-components.mjs'
import { validateDeckkitContent } from '../../pptx-nova/assets/deckkits/validate-deckkit.mjs'
import {
  assertDesignContract,
  checkDesignPatch,
  checkDesignReadback,
} from '../../pptx-nova/assets/deckkits/design-contract.mjs'

const original = JSON.parse(
  readFileSync(
    new URL('../../pptx-nova/assets/deckkits/examples/green-slate-content.json', import.meta.url),
  ),
)
const excerpt = (slides) => ({ meta: { deckkit: 'green-slate', designScope: 'excerpt' }, slides })
const clone = structuredClone
const valid = (c) => validateDeckkitContent(c, { deckkit: 'green-slate', mode: 'delivery' })
const allText = (patch) =>
  patch.ops
    .flatMap((o) => [
      o.text,
      ...(o.data?.categories ?? []),
      ...(o.data?.series ?? []).map((s) => s.name),
      ...(Array.isArray(o.data) ? o.data.flat() : []),
    ])
    .filter((v) => typeof v === 'string')
    .join('\n')
const byType = (type) => clone(original.slides.find((s) => s.type === type))

test('Green Slate: every family builds minimum unrelated content without source leakage', () => {
  for (const type of Object.keys(DESIGN.strategy.families)) {
    const slide = byType(type),
      schema = JSON.parse(
        readFileSync(
          new URL(
            `../../pptx-nova/assets/deckkits/schemas/green-slate/${type}.schema.json`,
            import.meta.url,
          ),
        ),
      )
    let count = 0
    const replace = (value, node) => {
      if (node.enum) return value
      if (node.type === 'string') return `Z${++count}`
      if (Array.isArray(value))
        return value.slice(0, node.minItems ?? value.length).map((v) => replace(v, node.items))
      if (value && typeof value === 'object')
        return Object.fromEntries(
          Object.entries(value)
            .filter(([key]) => node.required.includes(key))
            .map(([key, v]) => [key, replace(v, node.properties[key])]),
        )
      return value
    }
    slide.data = replace(slide.data, schema)
    // Range arrays and variable matrix dimensions stay synchronized after taking schema minima.
    const content = excerpt([slide]),
      validation = valid(content)
    assert.equal(validation.valid, true, JSON.stringify(validation.errors))
    const result = createDeck(content)
    assert.equal(result.designCheck.status, 'pass')
    const text = allText(result.patch)
    for (let i = 1; i <= count; i++)
      assert.ok(text.includes(`Z${i}`), `${type}: missing supplied field Z${i}`)
    assert.doesNotMatch(text, /procurement|GenAI|RMB|Management Consulting|Service transformation/i)
    assert.equal(
      result.patch.ops.some((o) => o.op === 'add-image'),
      false,
    )
  }
})

test('Green Slate: deterministic planning gives real alternative chart and flow geometry', () => {
  const r = byType('slateRangeSlide')
  r.data.notes = [
    { heading: 'Plan', body: 'Keep a lower case' },
    { heading: 'Test', body: 'Validate the upside' },
  ]
  const f = byType('slateFlowSlide')
  f.data.steps = f.data.steps.map((v, i) => ({
    heading: `Step ${i + 1}`,
    body: 'Retain a clear owner',
  }))
  f.data.notes = [
    { heading: 'Record', body: 'Keep evidence' },
    { heading: 'Review', body: 'Verify outcomes' },
  ]
  for (const [slide, ids, name] of [
    [r, ['rail', 'wide'], 'Range'],
    [f, ['vertical', 'horizontal'], 'StepNode1'],
  ]) {
    const results = ids.map((layoutId) => createDeck(excerpt([{ ...clone(slide), layoutId }])))
    assert.deepEqual(results[0], createDeck(excerpt([{ ...clone(slide), layoutId: ids[0] }])))
    const objects = results.map((b) => b.patch.ops.find((o) => o.name === `S0_${name}`))
    assert.notDeepEqual(objects[0], objects[1])
    if (name === 'Range') assert.deepEqual(objects[0].data, objects[1].data)
  }
  const long = excerpt(Array.from({ length: 8 }, () => ({ ...clone(r), layoutId: 'auto' })))
  const layouts = createDeck(long).designPlan.layouts
  assert.equal(new Set(layouts.map((l) => l.fingerprint)).size, 2)
  for (let i = 2; i < layouts.length; i++)
    assert.ok(new Set(layouts.slice(i - 2, i + 1).map((l) => l.fingerprint)).size > 1)
})

test('Green Slate: semantic color token renaming leaves output unchanged', () => {
  const renamed = clone(DESIGN),
    names = Object.fromEntries(Object.keys(renamed.colors).map((k, i) => [k, `token${i}`]))
  renamed.colors = Object.fromEntries(Object.entries(renamed.colors).map(([k, v]) => [names[k], v]))
  for (const map of [renamed.roles, renamed.theme.colors, renamed.refurbish.palette])
    for (const k of Object.keys(map)) map[k] = names[map[k]]
  assertDesignContract(renamed)
  assert.deepEqual(createStrategyDeck(renamed, original).patch, createDeck(original).patch)
})

test('Green Slate: invalid evidence is rejected before patch creation', () => {
  for (const change of [
    (d) => d.range.high.pop(),
    (d) => (d.range.low[0] = -1),
    (d) => (d.range.high[0] = 1),
    (d) => (d.range.low[0] = NaN),
    (d) => (d.range.unit = ''),
    (d) => (d.range.low[0] = null),
  ]) {
    const c = excerpt([byType('slateRangeSlide')])
    change(c.slides[0].data)
    assert.equal(valid(c).valid, false)
    assert.throws(() => createDeck(c))
  }
  const c = excerpt([byType('slateValueSlide')])
  c.slides[0].data.chart.series[0].values.pop()
  assert.equal(valid(c).valid, false)
  assert.throws(() => createDeck(c))
})

test('Green Slate: capacity, matrix dimensions and phase alignment fail closed', () => {
  const mutations = [
    ['slateMatrixSlide', (d) => d.rows.push(...clone(d.rows))],
    ['slateMatrixSlide', (d) => d.rows[0].cells.pop()],
    ['slateMatrixSlide', (d) => (d.columns[0].weight = 0)],
    ['slateMatrixSlide', (d) => (d.rows[0].cells[0].text = 'one\ntwo')],
    ['slateMatrixSlide', (d) => (d.rows[0].cells[0].text = 'Long text '.repeat(80))],
    ['slateRoadmapSlide', (d) => (d.phases[0].duration = 0)],
    ['slateRoadmapSlide', (d) => d.tracks[0].activities.pop()],
    ['slateFlowSlide', (d) => (d.steps[0].body = 'Word '.repeat(200))],
  ]
  for (const [type, change] of mutations) {
    const c = excerpt([byType(type)])
    change(c.slides[0].data)
    assert.equal(valid(c).valid, false, `${type}: mutation accepted`)
    assert.throws(() => createDeck(c))
  }
  const unknown = excerpt([byType('slateCoverSlide')])
  unknown.slides[0].data.unknown = 'ghost'
  assert.equal(valid(unknown).valid, false)
})

test('Green Slate: exact tiny intervals and literal table values survive generation', () => {
  const r = byType('slateRangeSlide')
  r.layoutId = 'rail'
  Object.assign(r.data.range, {
    categories: ['A', 'B', 'C', 'D'],
    low: [0, 1e-12, 1, 2],
    high: [0, 2e-12, 1, 4],
  })
  const result = createDeck(excerpt([r])),
    chart = result.patch.ops.find((o) => o.op === 'add-chart')
  assert.deepEqual(chart.data.series[0].values, [0, 1e-12, 1, 2])
  assert.deepEqual(chart.data.series[1].values, [0, 1e-12, 0, 2])
  assert.match(allText(result.patch), /1e-12–2e-12/)
  const m = byType('slateMatrixSlide')
  m.data.rows[0].cells[1].text = '-0.00000000000001'
  const table = createDeck(excerpt([m])).patch.ops.find((o) => o.op === 'add-table')
  assert.equal(table.data[1][1], '-0.00000000000001')
})

test('Green Slate: enclosed text invariants reject the user-reported centering and label defects', () => {
  const b = createDeck(original),
    bad = clone(b.patch)
  const frame = bad.ops.find((o) => o.op === 'set-text-frame' && o.shape?.name === 'S7_StepNode0')
  frame.frame.verticalAnchor = 'top'
  assert.ok(
    checkDesignPatch(DESIGN, bad).issues.some((i) =>
      /centered horizontally and vertically/.test(i.message),
    ),
  )
  const overlay = clone(b.patch)
  const tab = overlay.ops.find((o) => o.name === 'S1_Tab')
  overlay.ops.push(
    {
      op: 'add-text-box',
      slide: 1,
      name: 'S1_UnboundLabel',
      x: tab.x,
      y: tab.y,
      w: '3in',
      h: tab.h,
    },
    {
      op: 'set-text-frame',
      slide: 1,
      shape: { name: 'S1_UnboundLabel' },
      text: 'EXECUTIVE SUMMARY',
    },
  )
  assert.ok(
    checkDesignPatch(DESIGN, overlay).issues.some((i) => /shape-owned text/.test(i.message)),
  )
  assert.equal(
    b.patch.ops.some((o) => o.op === 'add-text-box' && /StepNumber|_Label$/.test(o.name)),
    false,
  )
})

test('Green Slate: every roadmap gate has real clearance below the track rule', () => {
  for (const count of [3, 4]) {
    const s = byType('slateRoadmapSlide')
    s.data.unit = 'months'
    s.data.phases = Array.from({ length: count }, (_, i) => ({
      label: `Stage ${i + 1}`,
      duration: 6,
      gate: `Gate ${i + 1} / ready`,
    }))
    for (const t of s.data.tracks)
      t.activities = Array.from({ length: count }, () => 'Verify evidence')
    const ops = createDeck(excerpt([s])).patch.ops
    const bottom = Math.max(
      ...ops
        .filter((o) => o.op === 'add-shape' && o.name.includes('TrackRule'))
        .map((o) => parseFloat(o.y) + parseFloat(o.h)),
    )
    const gates = ops.filter((o) => o.op === 'add-text-box' && /S0_Gate\d+$/.test(o.name))
    assert.equal(gates.length, count)
    for (const gate of gates)
      assert.ok(parseFloat(gate.y) - bottom >= 0.2, 'Gate caption touches the track rule')
    for (const line of ops.filter((o) => o.op === 'add-shape' && o.name.includes('GateLine')))
      assert.ok(parseFloat(line.y) + parseFloat(line.h) <= bottom + 0.001)
  }
})

test('Green Slate: design schema rejects unknown renderers/regions and invalid style operations', () => {
  for (const mutate of [
    (d) => (d.strategy.renderer = 'unknown'),
    (d) => (d.strategy.families.slateCoverSlide.variants.standard.regions.ghost = [1, 1, 1, 1]),
    (d) => (d.strategy.coverZone[2] = 99),
    (d) => (d.strategy.chrome.tab[3] = 0),
    (d) => (d.roles.header = 'missing'),
  ]) {
    const d = clone(DESIGN)
    mutate(d)
    assert.throws(() => assertDesignContract(d))
  }
  const good = createDeck(original).patch
  for (const op of [
    { op: 'set-slide-background', slide: 0, fill: { type: 'solid', color: DESIGN.colors.white } },
    { op: 'add-chart', slide: 0, kind: 'pie' },
    { op: 'set-chart', slide: 0, view3D: { rotationX: 20 } },
    { op: 'set-shape', slide: 0, fill: { type: 'gradient', stops: [] } },
  ])
    assert.equal(checkDesignPatch(DESIGN, { ...good, ops: [...good.ops, op] }).status, 'fail')
})

test('Green Slate: applied readback includes shape-owned text and its vertical anchoring', () => {
  const b = createDeck(excerpt([byType('slateFlowSlide')])),
    inspect = { slides: [{ index: 0, shapes: [] }] }
  for (const o of b.designPlan.objects) {
    const text = b.patch.ops.find(
        (p) => p.op === 'set-text-frame' && p.shape?.name === o.name && p.text !== undefined,
      ),
      frame = b.patch.ops.find(
        (p) => p.op === 'set-text-frame' && p.shape?.name === o.name && p.frame,
      )?.frame
    inspect.slides[0].shapes.push({
      name: o.name,
      bbox: Object.fromEntries(
        ['xEmu', 'yEmu', 'wEmu', 'hEmu'].map((k, i) => [k, o.frame[i] * 914400]),
      ),
      fontFacts: text
        ? String(text.text)
            .split('\n')
            .map((text, paragraph) => ({ scope: 'textRun', paragraph, text }))
        : [],
      textFrame: frame ?? {},
    })
  }
  assert.equal(checkDesignReadback(b.designPlan, b.patch, inspect).status, 'pass')
  const tampered = clone(inspect),
    node = tampered.slides[0].shapes.find((s) => s.name === 'S0_StepNode0')
  node.fontFacts[0].text = '9'
  assert.equal(checkDesignReadback(b.designPlan, b.patch, tampered).status, 'fail')
  node.fontFacts[0].text = '1'
  node.textFrame.verticalAnchor = 'top'
  assert.ok(
    checkDesignReadback(b.designPlan, b.patch, tampered).issues.some((i) =>
      /verticalAnchor/.test(i.message),
    ),
  )
})
