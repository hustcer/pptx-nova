import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  createDeck,
  DESIGN,
} from '../../../pptx-nova/assets/deckkits/monochrome/monochrome.kit.mjs'
import { monochromeSpecimen } from '../../../pptx-nova/assets/deckkits/monochrome/registry.mjs'
import {
  assertDesignContract,
  checkDesignPatch,
} from '../../../pptx-nova/assets/deckkits/shared/design-contract.mjs'
import { validateDeckkitContent } from '../../../pptx-nova/assets/deckkits/shared/validate-deckkit.mjs'
import { renderNativeEvidencePlan } from '../../../pptx-nova/assets/deckkits/shared/native-evidence-plan.mjs'
const file = (p) =>
  JSON.parse(
    readFileSync(new URL('../../../pptx-nova/assets/deckkits/monochrome/' + p, import.meta.url)),
  )
const excerpt = (slides) => ({ meta: { deckkit: 'monochrome', designScope: 'excerpt' }, slides })
const fixture = () => file('examples/content.json')
const visible = (patch) =>
  patch.ops
    .flatMap((o) => [
      ...(typeof o.text === 'string' ? [o.text] : []),
      ...(o.data?.categories ?? []),
      ...(o.data?.series ?? []).map((s) => s.name),
    ])
    .join('\n')
    .replace(/\s/g, '')
const strings = (v, key = '') =>
  typeof v === 'string'
    ? key === 'kind'
      ? []
      : [v]
    : Array.isArray(v)
      ? v.flatMap((x) => strings(x, key))
      : v && typeof v === 'object'
        ? Object.entries(v).flatMap(([k, x]) => strings(x, k))
        : []

test('monochrome: complete examples preserve all authored strings and real alternative geometries', () => {
  const main = createDeck(fixture()),
    alt = createDeck(file('examples/alternate-content.json'))
  assert.equal(main.designCheck.status, 'pass')
  assert.equal(main.designPlan.layouts.length, 16)
  assert.equal(
    main.patch.ops.some((o) => o.op === 'add-image'),
    false,
  )
  for (let i = 0; i < fixture().slides.length; i++) {
    const primary = fixture().slides[i],
      alternative = file('examples/alternate-content.json').slides[i]
    assert.deepEqual(primary.data, alternative.data)
    if (primary.layoutId !== alternative.layoutId)
      assert.notEqual(main.designPlan.layouts[i].fingerprint, alt.designPlan.layouts[i].fingerprint)
  }
  assert.ok(fixture().slides.some((s) => s.data.kind === 'doughnut'))
  assert.deepEqual(
    fixture()
      .slides.filter((s) => s.type === 'monoProcessSlide')
      .map((s) => s.layoutId),
    ['sequence', 'timeline', 'cycle'],
  )
  for (const f of ['content', 'alternate-content', 'community-content']) {
    const c = file('examples/' + f + '.json'),
      v = validateDeckkitContent(c, { mode: 'delivery' })
    assert.equal(v.valid, true, JSON.stringify(v.errors))
    const b = createDeck(c),
      text = visible(b.patch)
    for (const s of c.slides)
      for (const value of strings(s.data)) assert.ok(text.includes(value.replace(/\s/g, '')), value)
    assert.doesNotMatch(
      text,
      /UserResearchSynthesis|onboarding|Participant14|Cohortanalysis|90-dayretention/,
    )
  }
  assert.deepEqual(createDeck(fixture()), main)
})
for (const [type, f] of Object.entries(DESIGN.monochrome.families))
  test(`monochrome ${type}: minimal/max item count, real layouts and blank/unknown rejection`, () => {
    const schema = file('schemas/' + type + '.schema.json')
    for (const maximum of [false, true]) {
      const data = monochromeSpecimen(schema, 0, maximum)
      for (const layoutId of Object.keys(f.variants)) {
        const d = structuredClone(data)
        if (f.role === 'process') {
          if (layoutId === 'cycle')
            d.steps = Array.from({ length: 4 }, () => structuredClone(data.steps[0]))
          else if (layoutId === 'sequence') d.steps = d.steps.slice(0, 4)
        }
        const c = excerpt([{ type, layoutId, data: d }]),
          v = validateDeckkitContent(c, { mode: 'delivery' })
        assert.equal(v.valid, true, JSON.stringify(v.errors))
        assert.equal(createDeck(c).designCheck.status, 'pass')
      }
    }
    for (const key of ['title', 'section', 'source']) {
      const d = monochromeSpecimen(schema)
      d[key] = '  '
      assert.throws(() => createDeck(excerpt([{ type, data: d }])))
    }
    const d = monochromeSpecimen(schema)
    d.unused = 'must not disappear'
    assert.throws(() => createDeck(excerpt([{ type, data: d }])), /unknown field/)
    const arrays = Object.entries(schema.properties).filter(([, s]) => s.type === 'array')
    for (const [key, s] of arrays) {
      const d = monochromeSpecimen(schema)
      d[key] = Array.from({ length: s.maxItems + 1 }, () => structuredClone(d[key][0]))
      assert.throws(() => createDeck(excerpt([{ type, data: d }])), /too many items/)
    }
  })
test('monochrome: native signed/zero/tiny values and unit strings are not rescaled', () => {
  const c = file('examples/community-content.json'),
    b = createDeck(c),
    chart = b.patch.ops.find((o) => o.op === 'add-chart')
  assert.deepEqual(chart.data.series[0].values, [0, -2, 0.000001, 4])
  assert.ok(visible(b.patch).includes('次/visits'))
  const st = b.patch.ops.find((o) => o.op === 'set-chart')
  assert.equal(st.series[0].invertIfNegative, false)
  assert.equal(st.series[0].points, undefined)
  for (const values of [
    [0, 0],
    [-1, 2],
  ]) {
    const d = {
      ...c.slides[8].data,
      kind: 'doughnut',
      points: values.map((value, i) => ({ label: 'P' + i, value })),
    }
    assert.throws(
      () => createDeck(excerpt([{ type: 'monoChartSlide', layoutId: 'left', data: d }])),
      /positive total|nonnegative/,
    )
  }
  for (const value of [NaN, Infinity, '8']) {
    const d = structuredClone(c.slides.find((s) => s.type === 'monoChartSlide'))
    d.data.points[0].value = value
    assert.throws(() => createDeck(excerpt([d])), /finite|expected/)
  }
})
test('monochrome: legal layout capacities reject real overflow rather than truncating', () => {
  const c = fixture()
  c.slides[0].data.title = 'W'.repeat(250)
  assert.throws(() => createDeck(c), /width|No layout fits/)
  const process = structuredClone(c.slides.find((s) => s.type === 'monoProcessSlide'))
  process.layoutId = 'cycle'
  process.data.steps.pop()
  assert.throws(() => createDeck(excerpt([process])), /exactly four/)
  const chart = structuredClone(c.slides.find((s) => s.type === 'monoChartSlide'))
  chart.layoutId = 'wide'
  chart.data.kind = 'doughnut'
  assert.throws(() => createDeck(excerpt([chart])), /column-only/)
  const unknown = structuredClone(c.slides[1])
  unknown.layoutId = 'invented'
  assert.throws(() => createDeck(excerpt([unknown])))
  c.slides[0].customOps = []
  assert.throws(() => createDeck(c), /customOps/)
  assert.throws(
    () => createDeck({ meta: { deckkit: 'monochrome' }, slides: [fixture().slides[1]] }),
    /open with|open.*cover/,
  )
})
test('monochrome: insight corners retain a small physical radius on tall native surfaces', () => {
  const slide = fixture().slides.find((s) => s.type === 'monoAnalysisSlide')
  const deck = createDeck(excerpt([{ ...slide, layoutId: 'insights' }]))
  const surfaces = deck.designPlan.layouts[0].components.filter((c) =>
    c.name.startsWith('InsightSurface'),
  )
  assert.equal(surfaces.length, 2)
  for (const c of surfaces) {
    assert.equal(c.kind, 'path')
    const horizontalRadius = (c.path.commands[0].x / c.path.width) * c.frame[2]
    const verticalRadius = (c.path.commands[2].y / c.path.height) * c.frame[3]
    assert.ok(horizontalRadius >= 0.14 && horizontalRadius <= 0.16)
    assert.ok(Math.abs(horizontalRadius - verticalRadius) < 0.002)
  }
})
test('monochrome: contract language rejects arbitrary color/font/effects and unsupported objects', () => {
  assert.doesNotThrow(() => assertDesignContract(DESIGN))
  const d = structuredClone(DESIGN)
  d.monochrome.styles.hero.bold = true
  assert.throws(() => assertDesignContract(d), /light/)
  for (const op of [
    {
      op: 'set-run',
      slide: 0,
      shape: { name: 'S0_Title' },
      font: { name: 'Comic Sans MS', color: 'FF0000', size: '30pt' },
    },
    { op: 'add-image', slide: 0, name: 'Bad', x: '1in', y: '1in', w: '1in', h: '1in' },
    { op: 'set-slide-background', slide: 0, fill: { type: 'gradient' } },
  ])
    assert.equal(
      checkDesignPatch(DESIGN, { schemaVersion: 'pptx-patch/v1', ops: [op] }).status,
      'fail',
    )
})
test('monochrome: CJK quotes remain upright and native multiline empty paragraphs have no nonexistent runs', () => {
  const c = file('examples/community-content.json'),
    b = createDeck(c),
    quote = b.patch.ops.filter((o) => o.op === 'set-run' && o.shape?.name === 'S6_Quote')
  assert.ok(quote.length)
  assert.ok(quote.every((o) => !o.font.italic))
  const latin = createDeck(fixture()).patch.ops.find(
    (o) => o.op === 'set-run' && o.shape?.name?.endsWith('_Quote'),
  )
  assert.equal(latin.font.italic, true)
  const p = renderNativeEvidencePlan(
    DESIGN,
    [
      {
        components: [
          {
            kind: 'text',
            name: 'Body',
            frame: [1, 1, 6, 3],
            text: 'First\n\nSecond',
            style: DESIGN.monochrome.styles.body,
          },
        ],
      },
    ],
    DESIGN.monochrome,
  )
  assert.deepEqual(
    p.ops.filter((o) => o.op === 'set-run').map((o) => o.paragraph),
    [0, 2],
  )
  assert.deepEqual(
    p.ops.filter((o) => o.op === 'set-paragraph').map((o) => o.paragraph),
    [0, 1, 2],
  )
  assert.equal(
    p.ops.find((o) => o.op === 'set-text-frame' && typeof o.text === 'string').text,
    'First\n\nSecond',
  )
})
