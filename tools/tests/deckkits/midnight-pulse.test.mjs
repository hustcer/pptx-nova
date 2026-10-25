import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  DESIGN,
  createDeck,
} from '../../../pptx-nova/assets/deckkits/midnight-pulse/midnight-pulse.kit.mjs'
import {
  assertDesignContract,
  checkDesignPatch,
  checkDesignReadback,
  designHash,
} from '../../../pptx-nova/assets/deckkits/shared/design-contract.mjs'
import { validateDeckkitContent } from '../../../pptx-nova/assets/deckkits/shared/validate-deckkit.mjs'
import { clippedPulseEllipse } from '../../../pptx-nova/assets/deckkits/midnight-pulse/atmosphere.mjs'
import { textUnits } from '../../../pptx-nova/assets/deckkits/shared/design-contract.mjs'
import { pulseVariants, pulseStress, pulseLibrary } from '../fixtures/midnight-pulse-fixtures.mjs'
const content = JSON.parse(
  readFileSync(
    new URL(
      '../../../pptx-nova/assets/deckkits/midnight-pulse/examples/content.json',
      import.meta.url,
    ),
  ),
)

test('midnight-pulse ring text fits the rendered hole and mirrored rays meet the target', () => {
  const built = createDeck(pulseVariants())
  const gauges = built.designPlan.layouts[1].components.filter((c) => c.kind === 'gauge')
  const values = built.designPlan.layouts[1].components.filter((c) => /^GaugeValue/.test(c.name))
  for (let i = 0; i < gauges.length; i++) {
    assert.ok(
      gauges[i].frame[2] * 0.7 >= (textUnits(values[i].text) * values[i].style.sizePt) / 72,
      'ratio must fit inside the native plot padding and hole',
    )
    assert.equal(
      values[i].style.sizePt,
      DESIGN.pulse.styles.gauge.sizePt,
      'do not fix by shrinking text',
    )
  }
  const target = DESIGN.pulse.families.pulseAttributionSlide.variants.targetLeft.regions.target
  for (const ray of built.designPlan.layouts[4].components.filter((c) =>
    /^ConvergingRay/.test(c.name),
  )) {
    const [x, y, w, h] = ray.frame,
      [px, py] = ray.points.at(-1)
    assert.ok(Math.abs(x + px * w - (target[0] + target[2])) < 1e-8)
    assert.ok(Math.abs(y + py * h - (target[1] + target[3] / 2)) < 1e-8)
  }
})

test('design readback follows paragraph replacement before appended emphasis runs', () => {
  const patch = {
    ops: [
      { op: 'add-slide' },
      { op: 'add-text-box', slide: 0, name: 'Title' },
      { op: 'set-text-frame', slide: 0, shape: { name: 'Title' }, text: 'Alpha Beta' },
      { op: 'set-paragraph', slide: 0, shape: { name: 'Title' }, paragraph: 0, text: 'Alpha ' },
      { op: 'add-run', slide: 0, shape: { name: 'Title' }, paragraph: 0, text: 'Beta' },
    ],
  }
  const plan = {
    patchHash: designHash(patch),
    objects: [{ slide: 0, name: 'Title', kind: 'add-text-box', frame: [1, 1, 4, 1] }],
  }
  const inspect = {
    slides: [
      {
        index: 0,
        shapes: [
          {
            name: 'Title',
            bbox: { xEmu: 914400, yEmu: 914400, wEmu: 3657600, hEmu: 914400 },
            fontFacts: [
              { scope: 'textRun', paragraph: 0, text: 'Alpha ' },
              { scope: 'textRun', paragraph: 0, text: 'Beta' },
            ],
          },
        ],
      },
    ],
  }
  assert.equal(checkDesignReadback(plan, patch, inspect).status, 'pass')
  inspect.slides[0].shapes[0].fontFacts[1].text = 'Dropped'
  assert.equal(
    checkDesignReadback(plan, patch, inspect).status,
    'fail',
    'real text loss must still block',
  )
})

test('midnight-pulse retains the layered atmosphere on every reference responsibility', () => {
  const { patch } = createDeck(content)
  const counts = [2, 3, 2, 2, 2, 2, 1, 2]
  for (let slide = 0; slide < counts.length; slide++) {
    const atmosphere = patch.ops.filter(
      (o) => o.op === 'add-freeform' && o.slide === slide && /_Atmosphere\d+$/.test(o.name),
    )
    assert.equal(
      atmosphere.length,
      counts[slide],
      `slide ${slide + 1} loses the reference atmosphere`,
    )
    const firstText = patch.ops.findIndex((o) => o.slide === slide && o.op === 'add-text-box')
    assert.ok(
      atmosphere.every((o) => patch.ops.indexOf(o) < firstText),
      'atmosphere must stay behind the evidence',
    )
  }
})

const excerpt = (s) => ({
  meta: { deckkit: 'midnight-pulse', designScope: 'excerpt' },
  slides: [s],
})
const visible = (patch) =>
  patch.ops
    .flatMap((o) => [
      o.text,
      ...(o.op === 'add-table' ? o.data.flat() : []),
      ...(o.op === 'add-chart' ? [o.data.series[0].name, ...o.data.categories] : []),
    ])
    .filter((v) => typeof v === 'string')
    .join('\n')

test('midnight-pulse every registered layout builds and changes actual geometry for identical content', () => {
  for (const slide of content.slides) {
    const results = Object.keys(DESIGN.pulse.families[slide.type].variants).map((layoutId) =>
      createDeck(excerpt({ ...slide, layoutId })),
    )
    assert.equal(results.length, 2)
    assert.notEqual(
      results[0].designPlan.layouts[0].fingerprint,
      results[1].designPlan.layouts[0].fingerprint,
    )
    for (const r of results) assert.equal(r.designCheck.status, 'pass')
  }
  assert.deepEqual(
    createDeck(content).patch,
    createDeck(content).patch,
    'selection must be deterministic',
  )
})

test('midnight-pulse minimum schema-valid inputs build without example fallbacks', () => {
  for (const s of pulseLibrary().slides) {
    const schema = JSON.parse(
      readFileSync(
        new URL(
          `../../../pptx-nova/assets/deckkits/midnight-pulse/schemas/${s.type}.schema.json`,
          import.meta.url,
        ),
      ),
    )
    function minimum(v, node) {
      if (node.type === 'array')
        return v.slice(0, node.minItems ?? 0).map((x) => minimum(x, node.items))
      if (node.type === 'object')
        return Object.fromEntries(
          Object.entries(v)
            .filter(([k]) => node.required.includes(k))
            .map(([k, x]) => [k, minimum(x, node.properties[k])]),
        )
      return v
    }
    const slide = { type: s.type, data: minimum(s.data, schema) }
    if (s.type === 'pulseAttributionSlide')
      slide.data.actual = slide.data.target + slide.data.factors.reduce((a, v) => a + v.value, 0)
    const c = excerpt(slide),
      validation = validateDeckkitContent(c, { deckkit: 'midnight-pulse', mode: 'delivery' })
    assert.equal(validation.valid, true, JSON.stringify(validation.errors))
    assert.ok(createDeck(c).patch.ops.length > 0)
  }
})

test('midnight-pulse different domain, CJK/mixed and maximum density preserve all registered content', () => {
  for (const c of [pulseVariants(), pulseStress(), pulseLibrary(), pulseLibrary({ mixed: true })]) {
    const validation = validateDeckkitContent(c, { deckkit: 'midnight-pulse', mode: 'delivery' })
    assert.equal(validation.valid, true, JSON.stringify(validation.errors))
    const built = createDeck(c)
    assert.equal(built.designCheck.status, 'pass')
    assert.equal(built.designPlan.layouts.length, 8)
  }
  for (const mixed of [false, true]) {
    const c = pulseLibrary({ mixed }),
      text = visible(createDeck(c).patch)
    assert.doesNotMatch(
      text,
      /Tongzhou|Linwan|Yishan|Fleet Operations|O&M labor|battery swaps|autonomous vehicles|RMB 18\.6m/i,
    )
    for (const s of c.slides) assert.ok(text.includes(s.data.title), `lost title ${s.data.title}`)
    for (const r of c.slides[2].data.rows)
      for (const field of ['label', 'target', 'actual', 'variance', 'status', 'detail'])
        assert.ok(text.includes(r[field]), `lost table ${field}`)
  }
})

test('midnight-pulse content controls reject undefined ratios, unreconciled evidence and overflow', () => {
  const bad = [
    [
      0,
      (d) => {
        d.metrics[0].target = 0
      },
    ],
    [
      1,
      (d) => {
        d.metrics[1].actual = 0
      },
    ],
    [
      1,
      (d) => {
        d.metrics[0].actual = -1
      },
    ],
    [
      2,
      (d) => {
        d.rows.push(...d.rows)
      },
    ],
    [
      3,
      (d) => {
        d.points.push(...d.points)
      },
    ],
    [
      3,
      (d) => {
        d.events[0].index = 0.5
      },
    ],
    [
      3,
      (d) => {
        d.boundary = 99
      },
    ],
    [
      4,
      (d) => {
        d.actual = 8
      },
    ],
    [
      4,
      (d) => {
        d.factors[0].group = 7
      },
    ],
    [
      5,
      (d) => {
        d.subjects[0].target = 0
      },
    ],
    [
      6,
      (d) => {
        d.projects[0].progress = 101
      },
    ],
    [
      7,
      (d) => {
        d.decisions[0].consequence = 'W'.repeat(500)
      },
    ],
  ]
  for (const [i, mutate] of bad) {
    const s = structuredClone(content.slides[i])
    mutate(s.data)
    assert.throws(() => createDeck(excerpt(s)), undefined, `invalid slide ${i + 1} accepted`)
  }
  for (const s of content.slides) {
    const copy = structuredClone(s)
    delete copy.data.source
    assert.throws(() => createDeck(excerpt(copy)), /source/)
    assert.throws(() => createDeck(excerpt({ ...s, layoutId: 'unregistered' })), /layout|Layout/)
    assert.throws(
      () => createDeck(excerpt({ ...s, data: { ...s.data, policy: 'hidden business policy' } })),
      /unknown field/,
    )
  }
  const s = structuredClone(content.slides[3])
  delete s.data.unit
  assert.throws(() => createDeck(excerpt(s)), /unit/)
})

test('midnight-pulse exact numeric sources drive gauges and progress, including zero', () => {
  const c = pulseStress(),
    built = createDeck(c),
    chart = built.patch.ops.find((o) => o.op === 'add-chart' && o.name.endsWith('TrendChart'))
  assert.deepEqual(
    chart.data.series[0].values,
    c.slides[3].data.points.map((p) => p.value),
  )
  assert.ok(!built.patch.ops.some((o) => o.op === 'add-shape' && o.name === 'S6_ProgressFill0'))
  const track = built.patch.ops.find((o) => o.op === 'add-shape' && o.name === 'S6_ProgressTrack1')
  const fill = built.patch.ops.find((o) => o.op === 'add-shape' && o.name === 'S6_ProgressFill1')
  assert.equal(fill.w, track.w)
  const ring = built.patch.ops.find((o) => o.op === 'add-chart' && o.name === 'S1_Gauge0')
  assert.deepEqual(ring.data.series[0].values, [100, 0])
  assert.match(visible(built.patch), /105\.2%/)
  const firstEvent = built.designPlan.layouts[3].components.find((c) => c.name === 'ChartEvent0')
  assert.ok(
    Math.abs(firstEvent.frame[0] + firstEvent.frame[2] / 2 - 4.51) < 0.03,
    'first category marker must match the measured native plot, not the outer chart frame',
  )
})

test('midnight-pulse style rules block wrong fonts, second focal blocks and ornamental status colors', () => {
  const source = createDeck(content).patch
  const cases = [
    (p) => {
      const op = p.ops.find((o) => o.font)
      assert.ok(op?.font)
      op.font.name = 'Comic Sans MS'
    },
    (p) => {
      p.ops.find((o) => o.op === 'set-slide-background').fill.color = 'FFFFFF'
    },
    (p) => {
      p.ops.push({
        op: 'set-shape',
        slide: 0,
        shape: { name: 'SecondFocus' },
        fill: { type: 'solid', color: DESIGN.colors.ice },
      })
    },
    (p) => {
      p.ops.find(
        (o) => o.op === 'set-chart' && o.shape.name.endsWith('Gauge0'),
      ).series[0].fill.color = DESIGN.colors.green
    },
    (p) => {
      p.ops.find(
        (o) => o.op === 'set-chart' && o.shape.name.endsWith('TrendChart'),
      ).series[0].fill.color = DESIGN.colors.amber
    },
    (p) => {
      p.ops.push({
        op: 'set-shape',
        slide: 0,
        shape: { name: 'Decoration' },
        fill: { type: 'gradient', stops: [{ position: 0, color: DESIGN.colors.accent }] },
      })
    },
  ]
  for (const mutate of cases) {
    const p = structuredClone(source)
    mutate(p)
    assert.equal(checkDesignPatch(DESIGN, p).status, 'fail')
  }
  const d = structuredClone(DESIGN)
  d.rules.push({ id: 'unknown', check: 'unknown-checker' })
  assert.throws(() => assertDesignContract(d), /Unknown design checker/)
  const b = structuredClone(DESIGN)
  b.pulse.atmosphere.overview.pop()
  assert.throws(() => assertDesignContract(b), /atmosphere/)
})

test('midnight-pulse clipping keeps editable atmosphere inside canvas without flattening', () => {
  for (const ellipses of Object.values(DESIGN.pulse.atmosphere))
    for (const e of ellipses) {
      const {
        frame: [x, y, w, h],
        points,
      } = clippedPulseEllipse(e, DESIGN.canvas)
      assert.ok(
        x >= 0 &&
          y >= 0 &&
          x + w <= DESIGN.canvas.widthIn + 1e-9 &&
          y + h <= DESIGN.canvas.heightIn + 1e-9,
      )
      assert.ok(points.length >= 3 && points.every((p) => p.every((v) => v >= 0 && v <= 1)))
    }
  assert.equal(
    createDeck(content).patch.ops.filter((o) => o.op === 'add-image').length,
    0,
    'reference image must never become a slide background',
  )
  assert.ok(
    createDeck(content).patch.ops.some(
      (o) => o.op === 'set-table' && o.cells.some((c) => c.style.font.name === 'Georgia'),
    ),
  )
  const patch = createDeck(pulseLibrary({ mixed: true })).patch
  assert.ok(patch.ops.some((o) => o.font?.bold === true && o.font.eastAsian === 'Noto Sans SC'))
  assert.ok(patch.ops.some((o) => o.font?.bold === false && o.font.eastAsian === 'Noto Sans SC'))
})

test('midnight-pulse cover units are native runs at half the numeral size', () => {
  const { patch } = createDeck(content)
  for (let i = 0; i < 3; i++) {
    const run = patch.ops.find((o) => o.op === 'add-run' && o.shape?.name === `S0_MetricValue${i}`)
    assert.ok(run, 'unit must have an independently editable native run')
    assert.equal(run.text, ` ${content.slides[0].data.metrics[i].unit}`)
    assert.equal(parseFloat(run.font.size), DESIGN.pulse.styles.number.sizePt / 2)
  }
})

test('midnight-pulse six-driver boundary keeps both groups and every explanation', () => {
  const slide = structuredClone(content.slides[4])
  slide.data.target = 0
  slide.data.actual = 6
  slide.data.factors = Array.from({ length: 6 }, (_, i) => ({
    label: `Driver ${i + 1}`,
    value: 1,
    group: i < 3 ? 0 : 1,
    note: `Evidence ${i + 1}`,
  }))
  for (const layoutId of ['targetRight', 'targetLeft']) {
    const { patch } = createDeck({
      meta: { deckkit: 'midnight-pulse', designScope: 'excerpt' },
      slides: [{ ...slide, layoutId }],
    })
    for (let i = 1; i <= 6; i++) assert.ok(patch.ops.some((o) => o.text === `Evidence ${i}`))
  }
})
