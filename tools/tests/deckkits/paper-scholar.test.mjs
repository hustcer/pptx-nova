import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  createDeck,
  DESIGN,
} from '../../../pptx-nova/assets/deckkits/paper-scholar/paper-scholar.kit.mjs'
import { scholarSpecimen } from '../../../pptx-nova/assets/deckkits/paper-scholar/registry.mjs'
import {
  assertDesignContract,
  checkDesignPatch,
} from '../../../pptx-nova/assets/deckkits/shared/design-contract.mjs'
import { validateDeckkitContent } from '../../../pptx-nova/assets/deckkits/shared/validate-deckkit.mjs'
const read = (p) =>
  JSON.parse(
    readFileSync(new URL(`../../../pptx-nova/assets/deckkits/paper-scholar/${p}`, import.meta.url)),
  )
const fixture = () => read('examples/content.json')
const excerpt = (slides) => ({ meta: { deckkit: 'paper-scholar', designScope: 'excerpt' }, slides })
const valid = (c) => validateDeckkitContent(c, { deckkit: 'paper-scholar', mode: 'delivery' })
const visible = (patch) =>
  patch.ops
    .flatMap((o) => [
      o.text,
      ...(o.data?.categories ?? []),
      ...(o.data?.series ?? []).map((s) => s.name),
      ...(Array.isArray(o.data) ? o.data.flat() : []),
    ])
    .filter((v) => typeof v === 'string')
    .join(' ')
    .replace(/\s/g, '')

test('paper-scholar: explicit excerpt repetition and icon-inset overflow fail closed', () => {
  const s = fixture().slides[3]
  const repeated = valid(excerpt(Array.from({ length: 3 }, () => structuredClone(s))))
  assert.equal(repeated.valid, false)
  assert.match(JSON.stringify(repeated.errors), /repeated|cadence/)
  const table = createDeck(excerpt([fixture().slides[5]])).designPlan.layouts[0].components.find(
    (c) => c.kind === 'table',
  )
  assert.equal(table.bindings[table.columns.length].frame[0], table.frame[0] + 0.52)
  assert.equal(table.bindings[table.columns.length].frame[2], table.widths[0] - 0.59)
})
for (const [type, f] of Object.entries(DESIGN.scholar.families))
  test(`paper-scholar ${type}: all layouts preserve minimum and maximum nonreference inputs`, () => {
    for (const maximum of [false, true]) {
      const data = scholarSpecimen(read(`schemas/${type}.schema.json`), 0, maximum),
        fingerprints = []
      for (const layoutId of Object.keys(f.variants)) {
        const c = excerpt([{ type, layoutId, data }]),
          v = valid(c)
        assert.equal(v.valid, true, JSON.stringify(v.errors))
        const b = createDeck(c)
        assert.equal(b.designCheck.status, 'pass')
        assert.deepEqual(b, createDeck(structuredClone(c)))
        assert.doesNotMatch(visible(b.patch), /Lumen|Microlearning|RCT|90-Day|2026/)
        fingerprints.push(b.designPlan.layouts[0].fingerprint)
      }
      assert.equal(new Set(fingerprints).size, 2, 'distinct resolved geometry required')
    }
  })
test('paper-scholar: same actual content has distinct complete geometric variants', () => {
  for (const s of fixture().slides) {
    const variants = Object.keys(DESIGN.scholar.families[s.type].variants),
      a = createDeck(excerpt([{ ...s, layoutId: variants[0] }])),
      b = createDeck(excerpt([{ ...s, layoutId: variants[1] }]))
    assert.notEqual(a.designPlan.layouts[0].fingerprint, b.designPlan.layouts[0].fingerprint)
    assert.deepEqual([...visible(a.patch)].sort(), [...visible(b.patch)].sort(), s.type)
  }
})
test('paper-scholar: signatures and native objects survive abstraction', () => {
  const b = createDeck(fixture())
  assert.equal(b.patch.ops.filter((o) => o.op === 'add-chart').length, 1)
  assert.equal(b.patch.ops.filter((o) => o.op === 'add-table').length, 1)
  for (const name of [
    'CoverArch',
    'CoverContour16',
    'CoverStudyPath',
    'CoverTick4',
    'StudyBadge',
    'StepNumber3',
    'StepArrow2',
    'TriangulationTop',
    'RetentionDot9',
    'RetentionPartial6',
    'EvidenceChart',
    'DecayCurve1',
    'CurveLabel1',
    'ModelAxisArrow',
    'SegmentIconBack3',
    'CaseImageShell',
    'CaseHeaderBand',
    'ActionBand2',
    'NextReviewRule',
  ])
    assert.ok(
      b.patch.ops.some((o) => o.name?.endsWith(name)),
      name,
    )
  const curve = b.patch.ops.find(
    (o) => o.op === 'add-freeform' && o.name.endsWith('CoverStudyPath'),
  )
  assert.ok(curve.path.commands.some((c) => c.type === 'cubic'))
  for (const o of b.patch.ops.filter(
    (o) =>
      o.op === 'set-text-frame' && o.frame && /_(StepNumber|ActionNumber)\d+$/.test(o.shape.name),
  ))
    assert.equal(o.frame.verticalAnchor, 'middle')
  assert.ok(
    b.patch.ops
      .filter((o) => o.op === 'add-image')
      .every((o) => o.mimeType === 'image/svg+xml' && /_(SegmentIcon|ActionIcon)\d+$/.test(o.name)),
  )
})
test('paper-scholar: narrow English review heading has explicit, bounded lines', () => {
  const s = fixture().slides[7]
  s.layoutId = 'ledger'
  const b = createDeck(excerpt([s])),
    heading = b.designPlan.layouts[0].components.find((c) => c.name === 'NextReviewLabel')
  assert.ok(heading.text.includes('\n'))
  assert.equal(heading.text.replace(/\s/g, ''), s.data.reviewLabel.replace(/\s/g, ''))
  assert.ok(heading.requiredHeight <= heading.frame[3])
})
test('paper-scholar: fractions, model parameters and signed raw values stay authoritative', () => {
  for (const value of [0, 5, 65, 100]) {
    const s = fixture().slides[2]
    s.data.metric.value = value
    const b = createDeck(excerpt([s]))
    const comps = b.designPlan.layouts[0].components
    assert.equal(
      comps.filter((c) => c.name.startsWith('RetentionPartial')).length,
      value % 10 ? 1 : 0,
    )
    assert.equal(
      comps.filter((c) => /^RetentionDot\d+$/.test(c.name) && c.fill === 'ink').length,
      Math.floor(value / 10),
    )
  }
  const s = fixture().slides[4]
  s.data.maxTime = 12
  s.data.ticks = [2, 6, 12]
  s.data.series[0].halfLife = 6
  const b = createDeck(excerpt([s])),
    c = b.designPlan.layouts[0].components.find((c) => c.name === 'DecayCurve0')
  assert.equal(c.path.commands[40].y, 50000, 'half-life must halve retention at t=h')
  assert.ok(visible(b.patch).includes('Comparison:h=6'))
  s.data.maxTime = 1e308
  s.data.series[0].halfLife = 1e308
  const largeCurve = createDeck(excerpt([s])).designPlan.layouts[0].components.find(
    (c) => c.name === 'DecayCurve0',
  )
  assert.equal(largeCurve.path.commands[40].y, Math.round((1 - Math.pow(2, -0.5)) * 100000))
  const chart = fixture().slides[3]
  chart.data.points = [
    { label: 'N', value: -2 },
    { label: 'Z', value: 0 },
    { label: 'T', value: 1e-7 },
  ]
  const p = createDeck(excerpt([chart])).patch
  assert.deepEqual(p.ops.find((o) => o.op === 'add-chart').data.series[0].values, [-2, 0, 1e-7])
  const st = p.ops.find((o) => o.op === 'set-chart')
  assert.equal(st.series[0].invertIfNegative, false)
  assert.equal(st.series[0].points, undefined)
  assert.deepEqual(st.dataLabels[0].scope, { series: 0 })
  for (const label of st.dataLabels) {
    assert.equal(label.showValue, true)
    assert.equal(label.showCategoryName, false)
    assert.equal(label.showSeriesName, false)
    assert.equal(label.numberFormat, st.dataLabels[0].numberFormat)
    assert.deepEqual(label.font, st.dataLabels[0].font)
  }
  assert.equal(st.dataLabels.length, 1)
  assert.equal(st.dataLabels[0].position, 'outside-end')
  chart.data.points = [
    { label: 'Zero', value: 0 },
    { label: 'Tiny', value: 1e-7 },
  ]
  const tiny = createDeck(excerpt([chart])).patch.ops.find((o) => o.op === 'set-chart')
  assert.ok(tiny.axes.find((a) => a.axis === 'value').scale.max >= 0.15)
  assert.equal(tiny.dataLabels.length, 1)
  assert.equal(tiny.dataLabels[0].position, 'outside-end')
  chart.data.points = [
    { label: 'A', value: 1e8 },
    { label: 'B', value: 2e8 },
  ]
  assert.match(
    createDeck(excerpt([chart])).patch.ops.find((o) => o.op === 'set-chart').dataLabels[0]
      .numberFormat,
    /^0\.00E\+00/,
  )
  chart.data.points = [
    { label: 'A', value: -Number.MAX_VALUE },
    { label: 'B', value: Number.MAX_VALUE },
  ]
  const overflow = valid(excerpt([chart]))
  assert.equal(overflow.valid, false)
  assert.match(JSON.stringify(overflow.errors), /axis range must remain finite/)
})

test(
  'paper-scholar: serialized outside labels keep one complete series scope',
  {
    skip: process.env.XDOC_TEST_BIN
      ? false
      : 'Set XDOC_TEST_BIN to run real xdoc integration tests',
  },
  () => {
    const dir = mkdtempSync(join(tmpdir(), 'paper-scholar-labels-'))
    try {
      const slide = fixture().slides[3]
      slide.data.points = [
        { label: 'Positive', value: 4 },
        { label: 'Zero', value: 0 },
        { label: 'Negative', value: -2 },
      ]
      const patch = join(dir, 'patch.json'),
        output = join(dir, 'labels.pptx')
      writeFileSync(patch, JSON.stringify(createDeck(excerpt([slide])).patch))
      for (const dry of [true, false]) {
        const result = spawnSync(
          process.env.XDOC_TEST_BIN,
          ['pptx', 'apply', '-p', patch, '-o', output, ...(dry ? ['--dry-run'] : []), '--json'],
          { encoding: 'utf8' },
        )
        assert.equal(result.status, 0, result.stderr)
        assert.deepEqual(JSON.parse(result.stdout).semanticIssues, [])
      }
      const xml = spawnSync('unzip', ['-p', output, 'ppt/charts/chart1.xml'], { encoding: 'utf8' })
      assert.equal(xml.status, 0, xml.stderr)
      const series = xml.stdout.match(/<c:ser>[\s\S]*?<\/c:ser>/)?.[0]
      assert.match(series, /<c:dLbls>[\s\S]*?<c:showVal val="1"\/>/)
      assert.doesNotMatch(series, /<c:dLbl>/)
      assert.match(series, /<c:dLblPos val="outEnd"\/>/)
      assert.match(series, /<c:showCatName val="0"\/>/)
      assert.match(series, /<c:showSerName val="0"\/>/)
      assert.match(series, /<c:numFmt formatCode=/)
      assert.match(series, /<c:txPr>/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  },
)
test('paper-scholar: malformed content and capacity counterexamples are blocked', () => {
  const mutations = [
    (c) => delete c.slides[0].data.source,
    (c) => delete c.slides[3].data.unit,
    (c) => (c.slides[2].data.metric.value = 101),
    (c) => (c.slides[4].data.series[0].halfLife = 0),
    (c) => (c.slides[4].data.ticks = [8, 2]),
    (c) => (c.slides[4].data.ticks = [2, 2]),
    (c) => (c.slides[4].data.ticks = [2, 20]),
    (c) => c.slides[5].data.rows[0].cells.pop(),
    (c) => (c.slides[5].data.rows[0].emphasisColumn = 1.5),
    (c) => (c.slides[5].data.rows[0].emphasisColumn = 5),
    (c) => c.slides[5].data.rows.push(...Array(3).fill(c.slides[5].data.rows[0])),
    (c) => (c.slides[7].data.actions[0].why = ' '),
    (c) => c.slides[1].data.steps.push(c.slides[1].data.steps[0]),
    (c) => (c.slides[0].data.title = '界'.repeat(300)),
    (c) => (c.slides[3].data.points[0].value = null),
    (c) => (c.slides[0].customOps = [{ op: 'add-shape', name: 'SecondFocus' }]),
    (c) => (c.slides[6].imageSlots = { photo: 'source.jpg' }),
    (c) => (c.slides[0].data.policy = 'reference-policy'),
    (c) => (c.slides[0].layoutId = 'unknown'),
    (c) => (c.slides = Array.from({ length: 3 }, () => structuredClone(c.slides[3]))),
  ]
  for (const mutate of mutations) {
    const c = fixture()
    mutate(c)
    const v = valid(c)
    assert.equal(v.valid, false, String(mutate))
    assert.ok(v.errors.length)
  }
})
test('paper-scholar: unknown rules, wrong style and second focal number are rejected', () => {
  for (const mutate of [
    (d) => d.rules.push({ id: 'unknown', check: 'unknown-check' }),
    (d) => (d.colors.ink = '123456'),
    (d) => (d.fonts.body.latin = 'Georgia'),
    (d) =>
      (d.scholar.families.scholarCoverSlide.variants.extra =
        d.scholar.families.scholarCoverSlide.variants.inset),
  ]) {
    const d = structuredClone(DESIGN)
    mutate(d)
    assert.throws(() => assertDesignContract(d))
  }
  const b = createDeck(fixture())
  for (const extra of [
    { op: 'set-slide-background', slide: 0, fill: { type: 'solid', color: DESIGN.colors.accent } },
    {
      op: 'set-run',
      slide: 2,
      shape: { name: 'SecondFocal' },
      paragraph: 0,
      run: 0,
      font: { name: 'Arial', size: '110pt', color: DESIGN.colors.ink },
    },
    {
      op: 'set-run',
      slide: 1,
      shape: { name: 'WrongFont' },
      paragraph: 0,
      run: 0,
      font: { name: 'Comic Sans MS', size: '14pt', color: 'FF0000' },
    },
    {
      op: 'set-run',
      slide: 1,
      shape: { name: 'Italic' },
      paragraph: 0,
      run: 0,
      font: { name: 'Arial', size: '14pt', italic: true },
    },
    {
      op: 'add-image',
      slide: 0,
      name: 'ReferencePhoto',
      path: 'source.jpg',
      x: '1in',
      y: '1in',
      w: '1in',
      h: '1in',
    },
  ])
    assert.equal(
      checkDesignPatch(DESIGN, { ...b.patch, ops: [...b.patch.ops, extra] }).status,
      'fail',
    )
  for (const p of [
    'paper-scholar.kit.mjs',
    'layouts.mjs',
    'components.mjs',
    'registry.mjs',
    'examples/content.json',
  ])
    assert.doesNotMatch(
      readFileSync(
        new URL(`../../../pptx-nova/assets/deckkits/paper-scholar/${p}`, import.meta.url),
        'utf8',
      ),
      /Lumen|Microlearning Habits|paper-white-courseware\.jpg|9bc51d231319af09/,
    )
})
