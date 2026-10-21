import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  recordCreateInputs,
  verifyCreateInputs,
} from '../../pptx-nova/scripts/lib/create-delivery.mjs'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { createDeck, DESIGN } from '../../pptx-nova/assets/deckkits/biennale-yellow.kit.mjs'
import {
  assertDesignContract,
  checkDesignPatch,
  checkDesignReadback,
  resolveEvidenceLayout,
} from '../../pptx-nova/assets/deckkits/design-contract.mjs'
import { validateDeckkitContent } from '../../pptx-nova/assets/deckkits/validate-deckkit.mjs'
import { wrapCjkText } from '../../pptx-nova/assets/deckkits/design-text.mjs'
import { renderEvidence } from '../../pptx-nova/assets/deckkits/evidence-components.mjs'
import { createOps } from '../../pptx-nova/assets/deckkits/core-primitives.kit.mjs'

const read = (path) => JSON.parse(readFileSync(new URL('../../' + path, import.meta.url), 'utf8'))
const fixture = () =>
  read('pptx-nova/assets/deckkits/examples/biennale-yellow-evidence-content.json')

test('legacy content still builds, uses a native theme and meets the new readability floor', () => {
  const content = read('pptx-nova/assets/deckkits/examples/biennale-yellow-content.json')
  assert.equal(validateDeckkitContent(content, { mode: 'delivery' }).valid, true)
  const a = createDeck(content)
  assert.deepEqual(a, createDeck(structuredClone(content)))
  assert.equal(a.patch.ops.filter((o) => o.op === 'add-slide').length, 8)
  assert.ok(a.patch.ops.some((o) => o.op === 'set-theme'))
  assert.ok(a.patch.ops.filter((o) => o.font?.size).every((o) => parseFloat(o.font.size) >= 10))
  assert.equal(a.designCheck.status, 'pass')
})

test('generated projections match the runtime geometry and are idempotent', () => {
  const result = spawnSync(
    process.execPath,
    ['tools/generate-pptx-design-projections.mjs', 'biennale-yellow', '--check'],
    { encoding: 'utf8' },
  )
  assert.equal(result.status, 0, result.stderr)
  const schema = read(
    'pptx-nova/assets/deckkits/schemas/biennale-yellow/biennaleDataSlide.schema.json',
  )
  const slot = DESIGN.legacyLayouts.biennaleDataSlide.slots.Title
  assert.equal(schema.properties.title['x-slotBudget'].fontPt, slot.font.sizePt)
  assert.equal(schema.properties.title['x-slotBudget'].widthIn, slot.frames[0][2])
})

test('contract rejects typos, unknown rules, invalid tokens and invalid geometry', () => {
  for (const mutate of [
    (d) => {
      d.typo = true
    },
    (d) => {
      d.rules[0].check = 'imaginary-checker'
    },
    (d) => {
      d.rules.push(structuredClone(d.rules[0]))
    },
    (d) => {
      d.theme.colors.accent1 = 'missing-token'
    },
    (d) => {
      d.evidence.layouts['chart-left'].chart[2] = 100
    },
    (d) => {
      d.evidence.statComponents['chart-left'].description.role = 'missing-font'
    },
    (d) => {
      d.evidence.statComponents['chart-left'].description.h = 100
    },
  ]) {
    const d = structuredClone(DESIGN)
    mutate(d)
    assert.throws(() => assertDesignContract(d))
  }
})

test('style checks reject forbidden color, font, effect, operation and out-of-bounds objects', () => {
  for (const op of [
    { op: 'set-run', font: { color: 'FF0000' } },
    { op: 'set-theme', colors: { accent1: 'FF0000' } },
    { op: 'set-run', font: { name: 'Comic Sans MS', size: '12pt' } },
    { op: 'set-run', font: { size: '8pt' } },
    { op: 'set-shape', effect: { shadow: {} } },
    { op: 'add-image' },
    { op: 'add-text-box', x: '13in', y: '1in', w: '2in', h: '1in' },
  ])
    assert.equal(checkDesignPatch(DESIGN, { ops: [op] }).status, 'fail', JSON.stringify(op))
})

test('same evidence retains native numeric data in three genuinely different compositions', () => {
  const content = fixture()
  const { patch, designPlan } = createDeck(content)
  assert.equal(new Set(designPlan.layouts.map((l) => l.fingerprint)).size, 3)
  const charts = patch.ops.filter((o) => o.op === 'add-chart')
  assert.equal(charts.length, 3)
  assert.deepEqual(charts[0].data, charts[1].data)
  assert.deepEqual(charts[0].data, charts[2].data)
  assert.equal(
    patch.ops.some((o) => o.op === 'add-image'),
    false,
  )
})

test('shared evidence components consume semantic roles rather than Biennale color names', () => {
  const d = structuredClone(DESIGN)
  d.colors = { canvas: 'FFFDF8', charcoal: '171717', gold: 'C99820' }
  d.roles = {
    surface: 'canvas',
    text: 'charcoal',
    rule: 'charcoal',
    series: 'charcoal',
    focus: 'gold',
  }
  const slide = fixture().slides[0]
  const p = createOps({ textbox: d.textFrame })
  renderEvidence(p, d, 0, slide, resolveEvidenceLayout(d, slide), 1)
  assert.equal(checkDesignPatch(d, { ops: p.ops }).status, 'pass')
  assert.equal(p.ops.find((o) => o.op === 'set-slide-background').fill.color, 'FFFDF8')
  assert.equal(p.ops.find((o) => o.op === 'set-chart').series[0].points[0].fill.color, 'C99820')
})

test('automatic layout choice is deterministic and avoids repeated resolved geometry', () => {
  const content = fixture()
  content.slides.forEach((s) => {
    s.layoutId = 'auto'
  })
  const a = createDeck(content)
  assert.deepEqual(a, createDeck(content))
  assert.deepEqual(
    a.designPlan.layouts.map((l) => l.layoutId),
    ['chart-left', 'chart-wide', 'chart-top'],
  )
  const d = structuredClone(DESIGN)
  d.evidence.layouts['chart-wide'] = structuredClone(d.evidence.layouts['chart-left'])
  d.evidence.statComponents['chart-wide'] = structuredClone(d.evidence.statComponents['chart-left'])
  const first = resolveEvidenceLayout(d, content.slides[0])
  const next = resolveEvidenceLayout(d, content.slides[0], [first, first])
  assert.equal(
    next.layoutId,
    'chart-top',
    'renaming identical geometry must not bypass repetition handling',
  )
})

test('long evidence-only decks use resolved diversity without inventing editorial content', () => {
  const content = fixture()
  content.slides = Array.from({ length: 8 }, () => ({
    ...structuredClone(content.slides[0]),
    layoutId: 'auto',
  }))
  const result = validateDeckkitContent(content, { mode: 'delivery' })
  assert.equal(result.valid, true, JSON.stringify(result.errors))
  assert.equal(result.designDiversity.uniqueCompositions, 3)
  assert.ok(result.designDiversity.replacedLegacyCodes.length > 0)
  assert.equal(result.warnings.length, 0)
  const built = createDeck(content)
  assert.equal(new Set(built.designPlan.layouts.map((r) => r.fingerprint)).size, 3)
})

test('explicit repeated compositions are disclosed and legacy diversity gates remain intact', () => {
  const content = fixture()
  content.slides = Array.from({ length: 8 }, () => structuredClone(content.slides[0]))
  const repeated = validateDeckkitContent(content, { mode: 'delivery' })
  assert.equal(repeated.valid, true)
  assert.ok(repeated.warnings.some((w) => w.diagnostic?.code === 'design.diversity.repeated'))
  const legacy = read('pptx-nova/assets/deckkits/examples/biennale-yellow-content.json')
  legacy.slides = Array.from({ length: 8 }, () => structuredClone(legacy.slides[0]))
  const checked = validateDeckkitContent(legacy, { mode: 'delivery' })
  assert.equal(checked.valid, false)
  assert.ok(checked.errors.some((e) => e.type === 'diversity'))
})

test('layout fitting responds to long CJK labels and KPI copy rather than arbitrary coordinates', () => {
  const slide = fixture().slides[0]
  slide.layoutId = 'auto'
  slide.data.points[0].label = '展'.repeat(28)
  assert.equal(resolveEvidenceLayout(DESIGN, slide).layoutId, 'chart-top')
  slide.layoutId = 'chart-left'
  assert.throws(() => resolveEvidenceLayout(DESIGN, slide), /no layout fits/)
  slide.layoutId = 'auto'
  slide.data.points[0].label = '2022'
  slide.data.stats[0].label = '展'.repeat(24)
  assert.notEqual(resolveEvidenceLayout(DESIGN, slide).layoutId, 'chart-left')
})

test('missing, nonfinite, excessive and ambiguous data fail without numeric coercion', () => {
  for (const mutate of [
    (d) => {
      d.points[0].value = null
    },
    (d) => {
      d.points[0].value = '42'
    },
    (d) => {
      d.points[0].value = NaN
    },
    (d) => {
      d.points[0].value = Infinity
    },
    (d) => {
      d.points.push(...Array.from({ length: 10 }, () => ({ label: 'x', value: 1 })))
    },
    (d) => {
      d.points[0].emphasis = true
      d.points[1].emphasis = true
    },
    (d) => {
      d.source = ''
    },
    (d) => {
      d.stats[0].description = '长'.repeat(150)
    },
  ]) {
    const slide = fixture().slides[0]
    mutate(slide.data)
    assert.throws(() => resolveEvidenceLayout(DESIGN, slide))
  }
})

test('zero, negative and fractional native values preserve exact input numbers', () => {
  const content = fixture()
  content.slides = content.slides.slice(0, 1)
  const values = [0, -12.5, 0.000001, 1234567890123, 1.23456789012345]
  content.slides[0].data.points.forEach((p, i) => {
    p.value = values[i]
  })
  const chart = createDeck(content).patch.ops.find((o) => o.op === 'add-chart')
  assert.deepEqual(chart.data.series[0].values, values)
  const style = createDeck(content).patch.ops.find((o) => o.op === 'set-chart')
  assert.equal(style.series[0].invertIfNegative, false)
  assert.equal(style.axes.find((a) => a.axis === 'category').ticks.labelPosition, 'low')
  content.slides[0].data.kind = 'line'
  assert.equal(
    createDeck(content).patch.ops.find((o) => o.op === 'set-chart').series[0].smooth,
    false,
  )
  assert.equal(
    Object.hasOwn(
      createDeck(content).patch.ops.find((o) => o.op === 'set-chart').series[0],
      'invertIfNegative',
    ),
    false,
  )
  assert.equal(createDeck(content).designPlan.layouts[0].numberFormat, '0.00E+00')
  const legacy = read('pptx-nova/assets/deckkits/examples/biennale-yellow-content.json')
  legacy.slides[4].data.bars[0].pct = 0
  assert.equal(
    createDeck(legacy).patch.ops.some((o) => o.op === 'add-shape' && o.name === 'S4_Bar0'),
    false,
  )
})

test('CJK layout breaks preserve input characters and avoid punctuation-only lines', () => {
  const text = '回访者继续参与公共活动与跨学科讨论。'
  const wrapped = wrapCjkText(text, 16)
  assert.equal(wrapped.replaceAll('\n', ''), text)
  assert.ok(wrapped.includes('\n'))
  assert.ok(wrapped.split('\n').every((line) => !/^[，。！？、；：]/u.test(line)))
})

test('readback rejects tampered patches, missing native objects and changed chart numbers', () => {
  const built = createDeck(fixture())
  const inspect = {
    slides: [0, 1, 2].map((index) => ({
      index,
      shapes: built.designPlan.objects
        .filter((o) => o.slide === index)
        .map((o) => ({
          name: o.name,
          contentKind: o.kind === 'add-chart' ? 'chart' : 'text',
          bbox: Object.fromEntries(
            ['xEmu', 'yEmu', 'wEmu', 'hEmu'].map((k, i) => [k, Math.round(o.frame[i] * 914400)]),
          ),
        })),
    })),
  }
  for (const slide of inspect.slides) {
    for (const shape of slide.shapes) {
      const text = built.patch.ops.find(
        (o) =>
          o.slide === slide.index &&
          o.shape?.name === shape.name &&
          o.op === 'set-text-frame' &&
          typeof o.text === 'string',
      )?.text
      if (text !== undefined) {
        shape.fontFacts = text.split('\n').map((text, paragraph) => ({
          scope: 'textRun',
          paragraph,
          run: 0,
          text,
        }))
      }
    }
  }
  const model = {
    presentation: {
      slides: [0, 1, 2].map((index) => ({
        elements: built.patch.ops
          .filter((o) => o.slide === index && o.op === 'add-chart')
          .map((o) => ({
            kind: 'chart',
            chart: {
              type: o.kind,
              series: o.data.series.map((s) => ({
                name: s.name,
                points: s.values.map((v, i) => ({ x: o.data.categories[i], y: v })),
              })),
            },
          })),
      })),
    },
  }
  assert.equal(checkDesignReadback(built.designPlan, built.patch, inspect, model).status, 'pass')
  const changed = structuredClone(model)
  changed.presentation.slides[0].elements[0].chart.series[0].points[0].y++
  assert.equal(checkDesignReadback(built.designPlan, built.patch, inspect, changed).status, 'fail')
  assert.equal(checkDesignReadback(built.designPlan, built.patch, inspect).status, 'fail')
  const missing = structuredClone(inspect)
  missing.slides[0].shapes.pop()
  assert.equal(checkDesignReadback(built.designPlan, built.patch, missing, model).status, 'fail')
  const patch = structuredClone(built.patch)
  patch.ops.push({ op: 'add-slide' })
  assert.equal(checkDesignReadback(built.designPlan, patch, inspect, model).status, 'fail')
})

test('finalization binds design reports and rejects a stale design contract', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nova-design-binding-'))
  const args = { output: join(dir, 'final.pptx') }
  const artifacts = {
    binding: join(dir, 'binding.json'),
    designPlan: join(dir, 'plan.json'),
    designReadback: join(dir, 'readback.json'),
  }
  const plan = createDeck(fixture()).designPlan
  writeFileSync(artifacts.designPlan, JSON.stringify(plan))
  writeFileSync(artifacts.designReadback, '{"status":"pass"}')
  writeFileSync(artifacts.binding, JSON.stringify(recordCreateInputs(args, artifacts)))
  verifyCreateInputs(args, artifacts)
  writeFileSync(artifacts.designReadback, '{"status":"fail"}')
  assert.throws(() => verifyCreateInputs(args, artifacts), /inputs or machine evidence changed/)
  plan.contractHash = 'stale'
  writeFileSync(artifacts.designPlan, JSON.stringify(plan))
  writeFileSync(artifacts.binding, JSON.stringify(recordCreateInputs(args, artifacts)))
  assert.throws(() => verifyCreateInputs(args, artifacts), /Design contract changed/)
})
