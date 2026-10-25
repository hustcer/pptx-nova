import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  createDeck,
  DESIGN,
} from '../../pptx-nova/assets/deckkits/mckinsey-blue/mckinsey-blue.kit.mjs'
import {
  checkDesignPatch,
  designHash,
} from '../../pptx-nova/assets/deckkits/shared/design-contract.mjs'
import { validateDeckkitContent } from '../../pptx-nova/assets/deckkits/shared/validate-deckkit.mjs'
const golden = JSON.parse(
  readFileSync(
    new URL('../../pptx-nova/assets/deckkits/mckinsey-blue/examples/content.json', import.meta.url),
  ),
)
const excerpt = (i) => ({
  meta: { deckkit: 'mckinsey-blue', designScope: 'excerpt' },
  slides: [structuredClone(golden.slides[i])],
})
const visible = (patch) =>
  patch.ops
    .flatMap((o) => [
      ...([
        'set-text-frame',
        'add-text-box',
        'add-run',
        'set-run',
        'add-paragraph',
        'set-paragraph',
      ].includes(o.op) && typeof o.text === 'string'
        ? [o.text]
        : []),
      ...(o.op === 'add-chart' ? [...o.data.categories, ...o.data.series.map((s) => s.name)] : []),
      ...(o.op === 'add-table' ? o.data.flat() : []),
    ])
    .join(' ')
    .replace(/\s+/gu, '')
function assertVisible(content, patch) {
  const text = visible(patch)
  const walk = (v, key = '') => {
    if (['tone', 'icon'].includes(key)) return
    if (typeof v === 'string') {
      assert.ok(text.includes(v.replace(/\s+/gu, '')), `Lost visible field ${key}: ${v}`)
    } else if (Array.isArray(v)) v.forEach((x) => walk(x, key))
    else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => walk(x, k))
  }
  content.slides.forEach((s) => walk(s.data))
}

test('McKinsey 2.0 resolves every role and every registered layout without losing supplied text', () => {
  const first = createDeck(golden),
    secondContent = structuredClone(golden)
  secondContent.slides.forEach(
    (s) => (s.layoutId = Object.keys(DESIGN.mck.families[s.type].variants)[1]),
  )
  const second = createDeck(secondContent)
  assert.equal(first.designPlan.layouts.length, 8)
  assert.equal(second.designPlan.layouts.length, 8)
  assertVisible(golden, first.patch)
  assertVisible(secondContent, second.patch)
  first.designPlan.layouts.forEach((v, i) =>
    assert.notEqual(v.fingerprint, second.designPlan.layouts[i].fingerprint),
  )
  assert.deepEqual(first.patch, createDeck(golden).patch)
  assert.equal(first.designPlan.patchHash, designHash(first.patch))
  assert.equal(first.patch.ops.filter((o) => o.op === 'add-chart').length, 4)
  assert.equal(second.patch.ops.filter((o) => o.op === 'add-table').length, 1)
  const table = second.patch.ops.find((o) => o.op === 'add-table')
  assert.equal(table.rows, 5)
  assert.equal(table.columns, 4)
})

test('McKinsey 2.0 fails closed on missing, non-finite, string and out-of-range percentages', () => {
  for (const value of [undefined, NaN, Infinity, -0.1, 100.1, '52%']) {
    const c = excerpt(4)
    if (value === undefined) delete c.slides[0].data.drivers[0].value
    else c.slides[0].data.drivers[0].value = value
    assert.throws(() => createDeck(c), /value|finite|number|minimum|maximum/)
  }
  const missing = excerpt(4)
  delete missing.slides[0].data.unit
  assert.throws(() => createDeck(missing), /missing unit/)
  const extra = excerpt(5)
  extra.slides[0].data.pillars[0].accent = 'FF00FF'
  assert.throws(() => createDeck(extra), /unknown field accent/)
  const unknown = excerpt(5)
  unknown.slides[0].data.pillars[0].icon = 'not-a-real-icon'
  assert.throws(() => createDeck(unknown), /unknown Tabler icon/)
  const wrong = excerpt(1)
  wrong.slides[0].layoutId = 'unregistered'
  assert.throws(() => createDeck(wrong), /No layout fits/)
  const custom = excerpt(1)
  custom.slides[0].customOps = []
  assert.throws(() => createDeck(custom), /customOps/)
})

test('native percentage series preserve zero and tiny values and select adequate display precision', () => {
  const c = excerpt(4)
  c.slides[0].data.drivers[0].value = 0
  c.slides[0].data.drivers[1].value = 0.0001
  const result = createDeck(c),
    chart = result.patch.ops.find((o) => o.op === 'add-chart'),
    style = result.patch.ops.find((o) => o.op === 'set-chart')
  assert.equal(chart.data.series[0].values[0], 0)
  assert.equal(chart.data.series[0].values[1], 0.0001)
  assert.equal(style.dataLabels[0].numberFormat, '0.0000"%"')
  c.slides[0].data.drivers[1].value = 1e-9
  const tiny = createDeck(c)
  assert.equal(tiny.patch.ops.find((o) => o.op === 'add-chart').data.series[0].values[1], 1e-9)
  assert.equal(
    tiny.patch.ops.find((o) => o.op === 'set-chart').dataLabels[0].numberFormat,
    'General',
  )
})

test('cohort lengths and matrix circle areas derive from their single numeric source', () => {
  const c = excerpt(1)
  c.slides[0].data.cohort[0].value = 0
  const b = createDeck(c),
    segments = b.designPlan.layouts[0].components.filter((o) => o.name.startsWith('CohortSegment'))
  assert.equal(
    segments.some((o) => o.name === 'CohortSegment0'),
    false,
  )
  assert.equal(b.designPlan.layouts[0].components.find((o) => o.name === 'CohortValue0').text, '0')
  const sum = c.slides[0].data.cohort.reduce((n, v) => n + v.value, 0),
    expected = c.slides[0].data.cohort[1].value / sum
  assert.ok(
    Math.abs(
      segments[0].frame[2] /
        DESIGN.mck.families.mckCrisisSnapshotSlide.variants.stacked.regions.cohort[2] -
        expected,
    ) < 1e-12,
  )
  const matrix = createDeck(excerpt(3)).designPlan.layouts[0].components.filter(
    (c) => c.kind === 'circle',
  )
  const inputs = golden.slides[3].data.bubbles
  assert.ok(
    Math.abs((matrix[0].frame[2] / matrix[1].frame[2]) ** 2 - inputs[0].weight / inputs[1].weight) <
      1e-12,
  )
  const bad = excerpt(3)
  bad.slides[0].data.bubbles[0].weight = 0
  assert.throws(() => createDeck(bad), /exceed 0/)
  bad.slides[0].data.bubbles[0].weight = 1
  bad.slides[0].data.bubbles[0].x = 0
  assert.throws(() => createDeck(bad), /exceeds plot/)
})

test('input capacity and style rules reject overflow, lost semantics and foreign visual grammar', () => {
  const overflow = excerpt(5)
  overflow.slides[0].data.pillars[0].body = '容量'.repeat(250)
  assert.throws(() => createDeck(overflow), /No layout fits/)
  const tooMany = excerpt(4)
  while (tooMany.slides[0].data.drivers.length <= DESIGN.mck.capacity.drivers[1]) {
    tooMany.slides[0].data.drivers.push(structuredClone(tooMany.slides[0].data.drivers[0]))
  }
  assert.throws(() => createDeck(tooMany), /too many/)
  const p = createDeck(golden).patch,
    chart = structuredClone(p)
  chart.ops.find((o) => o.op === 'add-chart').kind = 'pie'
  assert.equal(checkDesignPatch(DESIGN, chart).status, 'fail')
  const foreign = structuredClone(p)
  foreign.ops.find((o) => o.op === 'set-run').font.name = 'Comic Sans MS'
  assert.equal(checkDesignPatch(DESIGN, foreign).status, 'fail')
  const v = validateDeckkitContent(golden, { deckkit: 'mckinsey-blue', mode: 'delivery' })
  assert.equal(v.valid, true)
  assert.equal(v.designCapacity.length, 8)
})

test('indexed control probes build legal distinct positions and reject invalid annotations', async () => {
  const fs = await import('node:fs'),
    { tmpdir } = await import('node:os'),
    { join } = await import('node:path'),
    { spawnSync } = await import('node:child_process')
  const root = fs.mkdtempSync(join(tmpdir(), 'mck-probe-sequence-'))
  try {
    const deck = join(root, 'assets/deckkits'),
      schemas = join(deck, 'probe/schemas')
    fs.mkdirSync(schemas, { recursive: true })
    fs.mkdirSync(join(root, 'scripts'))
    const script = join(root, 'scripts/check.mjs')
    fs.copyFileSync(
      new URL('../../pptx-nova/scripts/pptx-nova-deckkit-slot-consistency.mjs', import.meta.url),
      script,
    )
    fs.writeFileSync(
      join(deck, 'catalog.json'),
      JSON.stringify({
        entries: [{ id: 'probe', path: 'probe.mjs', supportedSlideTypes: ['page'] }],
      }),
    )
    fs.writeFileSync(
      join(deck, 'probe.mjs'),
      `export const createDeck=c=>{const a=c.slides[0].data.items;if(a&&a[0].position===a[1].position)throw Error('overlapping position probe');return c}`,
    )
    for (const [field, outer, exit] of [
      [{ type: 'number', 'x-slotRole': 'control', 'x-slotProbeSequence': [0.25, 0.75] }, false, 0],
      [{ type: 'number', 'x-slotRole': 'control', 'x-slotProbeSequence': [] }, false, 1],
      [{ type: 'string', 'x-slotProbeSequence': ['A', 'B'] }, false, 1],
      [
        {
          type: 'number',
          'x-slotRole': 'control',
          'x-slotProbeSequence': [1, 2],
          'x-slotProbeValue': 1,
        },
        false,
        1,
      ],
      [{ type: 'number', 'x-slotRole': 'control', 'x-slotProbeSequence': [1, 2] }, true, 1],
    ]) {
      const schema = {
        type: 'object',
        properties: outer
          ? { position: field }
          : {
              items: {
                type: 'array',
                minItems: 2,
                maxItems: 2,
                items: {
                  type: 'object',
                  properties: { position: field, label: { type: 'string' } },
                },
              },
            },
      }
      fs.writeFileSync(join(schemas, 'page.schema.json'), JSON.stringify(schema))
      const r = spawnSync(process.execPath, [script, '--json'], { encoding: 'utf8' })
      assert.equal(r.status, exit, r.stdout + r.stderr)
      const j = JSON.parse(r.stdout)
      assert.equal(j.results[0].slideTypes[0].status, exit ? 'probe-config-error' : 'ok')
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('ledger capacity rejects overlong cells and auto preserves the same content in columns', () => {
  const c = excerpt(6)
  c.slides[0].layoutId = 'ledger'
  c.slides[0].data.initiatives[0].body = 'word '.repeat(16).trim()
  assert.ok(createDeck(c).patch.ops.some((o) => o.op === 'add-table'))
  c.slides[0].data.initiatives[0].body = 'word '.repeat(17).trim()
  assert.throws(() => createDeck(c), /table cell exceeds 80 characters/)
  c.slides[0].layoutId = 'auto'
  const result = createDeck(c)
  assert.equal(result.designPlan.layouts[0].layoutId, 'columns')
  assertVisible(c, result.patch)
})
