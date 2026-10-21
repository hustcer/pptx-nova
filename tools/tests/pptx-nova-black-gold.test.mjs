import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createDeck, DESIGN } from '../../pptx-nova/assets/deckkits/black-gold.kit.mjs'
import {
  createEditorialDeck,
  ledgerNumber,
} from '../../pptx-nova/assets/deckkits/editorial-components.mjs'
import {
  assertDesignContract,
  checkDesignPatch,
  checkDesignReadback,
} from '../../pptx-nova/assets/deckkits/design-contract.mjs'
import { validateDeckkitContent } from '../../pptx-nova/assets/deckkits/validate-deckkit.mjs'
const fixture = () =>
  JSON.parse(
    fs.readFileSync(
      new URL('../../pptx-nova/assets/deckkits/examples/black-gold-content.json', import.meta.url),
    ),
  )
const excerpt = (...slides) => ({
  meta: { deckkit: 'black-gold', designScope: 'excerpt' },
  slides: structuredClone(slides),
})

test('Black Gold shares the contract pipeline, six page families and exact deterministic authoring', () => {
  const content = fixture(),
    a = createDeck(content)
  assert.equal(validateDeckkitContent(content, { mode: 'delivery' }).valid, true)
  assert.deepEqual(a, createDeck(content))
  assert.equal(new Set(a.designPlan.layouts.map((l) => l.role)).size, 6)
  assert.deepEqual(a.designPlan.rhythm.counts, { dark: 2, light: 6 })
  assert.equal(a.patch.ops.filter((o) => o.op === 'add-chart').length, 6)
  assert.equal(a.patch.ops.filter((o) => o.op === 'add-table').length, 1)
  assert.equal(
    a.patch.ops.some((o) => o.op === 'add-image'),
    false,
  )
  assert.equal(a.designCheck.status, 'pass')
  const projection = spawnSync(
    process.execPath,
    ['tools/generate-pptx-design-projections.mjs', 'black-gold', '--check'],
    { encoding: 'utf8' },
  )
  assert.equal(projection.status, 0, projection.stdout + projection.stderr)
})

test('same trend and ranking inputs produce genuinely different legal geometries', () => {
  for (const [index, ids] of [
    [2, ['wide', 'rail']],
    [5, ['rail', 'wide']],
  ]) {
    const source = fixture().slides[index]
    delete source.data.secondary
    const c = excerpt(...ids.map((layoutId) => ({ ...structuredClone(source), layoutId })))
    const built = createDeck(c)
    assert.equal(new Set(built.designPlan.layouts.map((l) => l.fingerprint)).size, 2)
    const charts = built.patch.ops.filter((o) => o.op === 'add-chart')
    assert.deepEqual(charts[0].data, charts[1].data)
    assert.notDeepEqual(
      [charts[0].x, charts[0].y, charts[0].w, charts[0].h],
      [charts[1].x, charts[1].y, charts[1].w, charts[1].h],
    )
  }
})

test('long evidence excerpts need no invented financial narrative or dark stages', () => {
  const slide = fixture().slides[5]
  const content = excerpt(...Array.from({ length: 10 }, () => slide))
  const r = validateDeckkitContent(content, { mode: 'delivery' })
  assert.equal(r.valid, true, JSON.stringify(r.errors))
  const built = createDeck(content)
  assert.deepEqual(built.designPlan.rhythm.counts, { dark: 0, light: 10 })
  assert.equal(new Set(built.designPlan.layouts.map((l) => l.fingerprint)).size, 2)
  content.meta.designScope = 'complete'
  assert.throws(() => createDeck(content), /requires cover/)
})

test('identity tokens can be renamed without copying or editing the shared renderer', () => {
  const d = structuredClone(DESIGN)
  const rename = (k) => 'token_' + k
  d.colors = Object.fromEntries(Object.entries(d.colors).map(([k, v]) => [rename(k), v]))
  for (const target of [d.roles, d.theme.colors, d.refurbish.palette, d.editorial.contrast])
    for (const k of Object.keys(target)) target[k] = rename(target[k])
  assertDesignContract(d)
  const built = createEditorialDeck(d, fixture())
  assert.equal(built.designCheck.status, 'pass')
  assert.deepEqual(built.patch, createDeck(fixture()).patch)
})

test('missing, mismatched or invalid native evidence fails without coercion', () => {
  const mutations = [
    (c) => {
      c.slides[2].data.chart.values[0] = null
    },
    (c) => {
      c.slides[2].data.chart.values[0] = Infinity
    },
    (c) => {
      c.slides[2].data.chart.categories.pop()
    },
    (c) => {
      c.slides[2].data.secondary.categories = ['different']
    },
    (c) => {
      c.slides[2].data.chart.focus = 100
    },
    (c) => {
      c.slides[2].data.secondary.focus = 0
    },
    (c) => {
      c.slides[3].data.rows[0].share = 101
    },
    (c) => {
      c.slides[3].data.rows[0].representative = 'Two\nparagraphs'
    },
    (c) => {
      c.slides[5].data.chart.focus = 0
    },
    (c) => {
      c.slides[0].data.metrics[1].focus = true
    },
    (c) => {
      c.slides[0].data.source = ''
    },
  ]
  for (const mutate of mutations) {
    const c = fixture()
    mutate(c)
    assert.throws(() => createDeck(c))
  }
})

test('declarative regions, dark role legality, typography and capacity fail closed', () => {
  for (const mutate of [
    (d) => {
      d.editorial.families.ledgerTrendSlide.mode = 'dark'
    },
    (d) => {
      d.editorial.families.ledgerTrendSlide.variants.wide.regions.unknownRegion = [1, 1, 1, 1]
    },
    (d) => {
      delete d.editorial.families.ledgerTrendSlide.variants.wide.regions.main
    },
    (d) => {
      d.editorial.contrast.primary = 'missing-token'
    },
    (d) => {
      d.editorial.typography.body = 8
    },
    (d) => {
      d.theme.colors.dark1 = 'ink'
    },
    (d) => {
      delete d.fonts.body
    },
  ]) {
    const d = structuredClone(DESIGN)
    mutate(d)
    assert.throws(() => assertDesignContract(d))
  }
  const c = excerpt(fixture().slides[2])
  delete c.slides[0].data.secondary
  c.slides[0].data.notes[0].body = '文'.repeat(100)
  assert.throws(() => createDeck(c), /capacity|No layout fits/)
  c.slides[0].data.title = '文'.repeat(80)
  assert.throws(() => createDeck(c), /capacity/)
})

test('structural gold focus and editorial chart/table prohibitions inspect actual operations', () => {
  const ops = [
    { op: 'add-chart', kind: 'pie' },
    { op: 'set-chart', axes: [{ axis: 'value', ticks: { visible: true } }] },
    { op: 'set-chart', axes: [{ axis: 'value', gridlines: { width: '1pt' } }] },
    { op: 'set-table', style: { horizontalBanding: true } },
    { op: 'set-table', cells: [{ style: { borders: { left: { width: '1pt' } } } }] },
    { op: 'set-shape', fill: { type: 'gradient', stops: [] } },
  ]
  for (const op of ops) assert.equal(checkDesignPatch(DESIGN, { ops: [op] }).status, 'fail')
  const gold = DESIGN.colors[DESIGN.roles.focus]
  const patch = {
    ops: [
      { op: 'set-run', slide: 0, shape: { name: 'First' }, font: { color: gold } },
      { op: 'set-run', slide: 0, shape: { name: 'Second' }, font: { color: gold } },
    ],
  }
  assert.equal(checkDesignPatch(DESIGN, patch).status, 'fail')
  assert.equal(
    checkDesignPatch(DESIGN, {
      ops: [
        {
          op: 'set-chart',
          slide: 0,
          shape: { name: 'Chart' },
          series: [
            {
              series: 0,
              points: [
                { point: 0, fill: { color: gold } },
                { point: 1, fill: { color: gold } },
              ],
            },
          ],
        },
      ],
    }).status,
    'fail',
  )
})

test('table numbers retain zero, small precision, signs and editable cell text', () => {
  assert.equal(ledgerNumber(0), '0')
  assert.equal(ledgerNumber(-1234.5), '(1,234.5)')
  assert.equal(ledgerNumber(0.000001), '0.000001')
  const c = excerpt(fixture().slides[3])
  c.slides[0].data.rows[0].amount = -0.000001
  c.slides[0].data.rows[0].share = 0
  const built = createDeck(c)
  const table = built.patch.ops.find((o) => o.op === 'add-table')
  assert.equal(table.data[1][1], '(0.000001)')
  assert.equal(table.data[1][2], '0%')
  assert.equal(
    built.patch.ops.some((o) => o.name === 'S0_ShareBar0'),
    false,
  )
})

test('native table readback rejects changed cells, missing objects and incomplete projections', () => {
  const c = excerpt(fixture().slides[3])
  const built = createDeck(c),
    plan = built.designPlan
  const inspect = {
    slides: [
      {
        index: 0,
        shapes: plan.objects.map((o) => ({
          name: o.name,
          contentKind: o.kind === 'add-table' ? 'table' : 'shape',
          bbox: Object.fromEntries(
            ['xEmu', 'yEmu', 'wEmu', 'hEmu'].map((key, i) => [
              key,
              Math.round(o.frame[i] * 914400),
            ]),
          ),
          fontFacts: built.patch.ops
            .filter(
              (op) =>
                op.op === 'set-text-frame' &&
                op.shape?.name === o.name &&
                typeof op.text === 'string',
            )
            .flatMap((op) =>
              op.text.split('\n').map((text, paragraph) => ({ scope: 'textRun', text, paragraph })),
            ),
        })),
      },
    ],
  }
  const table = built.patch.ops.find((o) => o.op === 'add-table')
  const model = {
    presentation: {
      slides: [
        {
          elements: [
            {
              kind: 'table',
              table: {
                rows: table.rows,
                columns: table.columns,
                cells: structuredClone(table.data),
              },
            },
          ],
        },
      ],
    },
  }
  assert.equal(checkDesignReadback(plan, built.patch, inspect, model).status, 'pass')
  model.presentation.slides[0].elements[0].table.cells[1][1] = '999'
  assert.equal(checkDesignReadback(plan, built.patch, inspect, model).status, 'fail')
  assert.equal(checkDesignReadback(plan, built.patch, inspect).status, 'fail')
  model.presentation.slides[0].elements[0].table.cells = structuredClone(table.data)
  inspect.slides[0].shapes.find((o) => o.contentKind === 'table').contentKind = 'shape'
  assert.equal(checkDesignReadback(plan, built.patch, inspect, model).status, 'fail')
})

test('prose/image source helper records immutable provenance and refuses output overwrite', () => {
  const dir = fs.mkdtempSync(join(tmpdir(), 'deckkit-source-'))
  const design = join(dir, 'design.md'),
    image = join(dir, 'reference.png'),
    out = join(dir, 'source')
  fs.writeFileSync(design, '# Example identity\nGray evidence with one focus.\n')
  const bytes = Buffer.alloc(24)
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes)
  bytes.writeUInt32BE(1920, 16)
  bytes.writeUInt32BE(2160, 20)
  fs.writeFileSync(image, bytes)
  const script = resolve('deckkit-maker/scripts/analyze-design-source.mjs')
  const args = [
    script,
    '--id',
    'sample',
    '--design',
    design,
    '--image',
    image,
    '--panels',
    '2',
    '--out',
    out,
  ]
  let r = spawnSync(process.execPath, args, { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  const m = JSON.parse(r.stdout)
  assert.equal(m.images[0].panels.length, 2)
  assert.equal(m.images[0].panels[0].aspectRatio, 16 / 9)
  assert.equal(m.interpretation.status, 'not-performed')
  assert.deepEqual(fs.readFileSync(image), bytes)
  r = spawnSync(process.execPath, args, { encoding: 'utf8' })
  assert.equal(r.status, 1)
  assert.match(r.stderr, /must be new/)
})

test('slot probing covers mutually exclusive optional evidence without omitting declared fields', () => {
  const r = spawnSync(
    process.execPath,
    ['pptx-nova/scripts/pptx-nova-deckkit-slot-consistency.mjs', '--json'],
    { encoding: 'utf8' },
  )
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const result = JSON.parse(r.stdout)
  const trend = result.results
    .find((x) => x.deckkit === 'black-gold')
    .slideTypes.find((x) => x.slideType === 'ledgerTrendSlide')
  assert.equal(trend.status, 'ok')
  assert.equal(trend.probeVariants, 2)
})

test('content leak audit checks native cells and chart text in addition to text boxes', () => {
  const dir = fs.mkdtempSync(join(tmpdir(), 'deckkit-leak-')),
    patch = join(dir, 'patch.json'),
    deny = join(dir, 'deny.txt')
  fs.writeFileSync(
    patch,
    JSON.stringify({
      ops: [
        { op: 'add-table', name: 'Table', data: [['ReferenceEntity']] },
        { op: 'set-table', cells: [{ row: 0, column: 0, text: 'ReferenceEntity' }] },
        {
          op: 'add-chart',
          data: {
            categories: ['ReferenceEntity'],
            series: [{ name: 'ReferenceEntity', values: [1] }],
          },
        },
      ],
    }),
  )
  fs.writeFileSync(deny, 'ReferenceEntity\n')
  const r = spawnSync(
    process.execPath,
    [
      'deckkit-maker/scripts/content-leak-audit.mjs',
      '--patch',
      patch,
      '--denylist',
      deny,
      '--json',
    ],
    { encoding: 'utf8' },
  )
  assert.equal(r.status, 2, r.stderr)
  const audit = JSON.parse(r.stdout)
  assert.equal(audit.matchCount, 4)
  assert.ok(audit.matches.some((m) => m.path === 'data[0][0]'))
  assert.ok(audit.matches.some((m) => m.path === 'data.series[0].name'))
})
