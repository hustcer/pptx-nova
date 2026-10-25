import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import {
  createDeck,
  DESIGN,
} from '../../../pptx-nova/assets/deckkits/long-table/long-table.kit.mjs'
import {
  assertDesignContract,
  checkDesignPatch,
  checkDesignReadback,
  designHash,
} from '../../../pptx-nova/assets/deckkits/shared/design-contract.mjs'
import { validateDeckkitContent } from '../../../pptx-nova/assets/deckkits/shared/validate-deckkit.mjs'
import { LONG_TABLE_LAYOUTS } from '../../../pptx-nova/assets/deckkits/long-table/registry.mjs'

const fixture = JSON.parse(
  readFileSync(
    new URL('../../../pptx-nova/assets/deckkits/long-table/examples/content.json', import.meta.url),
  ),
)
const excerpt = (slides) => ({
  meta: { deckkit: 'long-table', designScope: 'excerpt' },
  slides: structuredClone(slides),
})
const texts = (patch) =>
  patch.ops.flatMap((o) =>
    o.op === 'add-table' ? o.data.flat() : typeof o.text === 'string' ? [o.text] : [],
  )
function strings(value) {
  return typeof value === 'string'
    ? [value]
    : Array.isArray(value)
      ? value.flatMap(strings)
      : value && typeof value === 'object'
        ? Object.values(value).flatMap(strings)
        : []
}

test('Long Table routes every role through a complete, deterministic plan', () => {
  const a = createDeck(fixture),
    b = createDeck(fixture)
  assert.equal(DESIGN.version, '2.0.0')
  assert.equal(a.designCheck.status, 'pass')
  assert.equal(a.designPlan.layouts.length, 8)
  assert.equal(designHash(a.patch), designHash(b.patch))
  assert.equal(designHash(a.designPlan), designHash(b.designPlan))
  assert.ok(a.patch.ops.some((o) => o.op === 'add-table' && o.columns === 5))
  assert.ok(!a.patch.ops.some((o) => ['add-image', 'add-chart'].includes(o.op)))
  assert.ok(validateDeckkitContent(fixture, { deckkit: 'long-table', mode: 'delivery' }).valid)
})

test('all fifteen explicit compositions preserve the same supplied content with real geometry changes', () => {
  let count = 0
  for (const slide of fixture.slides) {
    const family = DESIGN.longTable.families[slide.type],
      fingerprints = []
    assert.deepEqual(Object.keys(family.variants), Object.keys(LONG_TABLE_LAYOUTS[family.role]))
    for (const id of Object.keys(family.variants)) {
      const content = excerpt([{ ...slide, layoutId: id }]),
        result = createDeck(content),
        visible = texts(result.patch).join('\n')
      for (const value of strings(slide.data))
        assert.ok(visible.includes(value), `${slide.type}.${id} dropped ${value}`)
      fingerprints.push(result.designPlan.layouts[0].fingerprint)
      count++
    }
    assert.equal(
      new Set(fingerprints).size,
      fingerprints.length,
      `${slide.type} variants share geometry`,
    )
  }
  assert.equal(count, 15)
})

test('every minimum visible input is emitted without showcase defaults', () => {
  const map = (value, key = '') => {
    if (typeof value === 'string') return key === 'edition' || key === 'mark' ? '1' : 'z'
    if (Array.isArray(value)) return value.map((v) => map(v))
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, map(v, k)]))
  }
  const content = excerpt(fixture.slides.map((s) => ({ ...s, data: map(s.data) })))
  const result = createDeck(content),
    visible = texts(result.patch).join(' ')
  for (const phrase of ['Lisbon', 'Iris', 'Brooklyn', 'December', 'Long Table', 'soup', 'guest'])
    assert.ok(!visible.toLowerCase().includes(phrase.toLowerCase()))
  for (const [i, l] of result.designPlan.layouts.entries())
    assert.ok(l.components.length, `missing plan ${i}`)
})

test('optional cover fields are independent and every supported sparse collection builds', () => {
  const cjk = structuredClone(fixture.slides[0])
  cjk.data.pills = ['开放报名', '台北 Taipei']
  assert.ok(texts(createDeck(excerpt([cjk])).patch).includes('开放报名'))
  for (const field of ['bigEdition', 'bigLabel', 'bigMeta']) {
    const slide = structuredClone(fixture.slides[0])
    for (const key of ['bigEdition', 'bigLabel', 'bigMeta']) delete slide.data[key]
    slide.data[field] = 'Independent'
    if (field === 'bigEdition') slide.data[field] = '01'
    assert.ok(texts(createDeck(excerpt([slide])).patch).includes(slide.data[field]))
  }
  for (const [index, key] of [
    [1, 'paragraphs'],
    [2, 'cards'],
    [3, 'details'],
    [4, 'items'],
    [6, 'rows'],
    [7, 'footer'],
  ]) {
    const slide = structuredClone(fixture.slides[index])
    slide.data[key] = slide.data[key].slice(0, 1)
    const result = createDeck(excerpt([slide]))
    assert.equal(result.designCheck.status, 'pass')
    const components = result.designPlan.layouts[0].components
    if (key === 'details') assert.ok(components.find((c) => c.name === 'InfoCard').frame[3] < 2)
    if (key === 'rows') assert.ok(components.find((c) => c.kind === 'table').frame[3] < 2)
    if (key === 'items') assert.ok(components.find((c) => c.name === 'RowRule0').frame[1] < 4)
    if (key === 'cards') {
      const boundary = components.find((c) => c.name === 'Card0' || c.name === 'CardBottom0')
      assert.ok(boundary && boundary.frame[1] + boundary.frame[3] < 5.4)
    }
  }
})

test('invalid fields, tuples, counts, layout ids and overflowing labels fail with context', () => {
  const fail = (index, mutate, pattern) => {
    const slide = structuredClone(fixture.slides[index])
    mutate(slide)
    assert.throws(() => createDeck(excerpt([slide])), pattern)
  }
  fail(0, (s) => (s.data.extra = 'x'), /unknown field extra/)
  fail(0, (s) => (s.data.title = ' '), /invalid format|nonblank/)
  fail(0, (s) => (s.layoutId = 'unregistered'), /No layout fits/)
  fail(0, (s) => (s.data.pills[0] = 'W'.repeat(80)), /pills|width/)
  fail(0, (s) => (s.data.title = 'W'.repeat(80)), /title|width/)
  fail(2, (s) => s.data.cards.push(s.data.cards[0]), /too many items/)
  fail(3, (s) => s.data.details[0].pop(), /too few items/)
  fail(4, (s) => s.data.items[0].push('ignored'), /too many items/)
  fail(6, (s) => s.data.columns.pop(), /too few items/)
  fail(6, (s) => (s.data.rows[0][4] = 'W'.repeat(50)), /rows|width|lines/)
  fail(7, (s) => (s.imageSlots = { image: 'bad' }), /no registered/)
  assert.throws(
    () => createDeck({ ...fixture, slides: fixture.slides.slice(0, -1) }),
    /cover and closing/,
  )
})

test('registered identity rules block a second text color, tilted display, pattern fills and heavy rules', () => {
  const result = createDeck(fixture)
  const reject = (op) =>
    assert.equal(
      checkDesignPatch(DESIGN, { ...result.patch, ops: [...result.patch.ops, op] }).status,
      'fail',
    )
  reject({
    op: 'set-run',
    slide: 0,
    shape: { name: 'S0_Title' },
    font: { name: 'Arial Black', bold: true, color: '0000FF', size: '54pt' },
  })
  reject({
    op: 'set-run',
    slide: 0,
    shape: { name: 'S0_Title' },
    font: { name: 'Arial Black', bold: true, italic: true, color: DESIGN.colors.ink, size: '54pt' },
  })
  reject({
    op: 'set-slide-background',
    slide: 0,
    fill: {
      type: 'pattern',
      pattern: 'pct5',
      foregroundColor: DESIGN.colors.ink,
      backgroundColor: DESIGN.colors.paper,
    },
  })
  reject({
    op: 'set-shape',
    slide: 0,
    shape: { name: 'S0_Title' },
    line: { width: '3pt', color: DESIGN.colors.ink },
  })
  reject({
    op: 'add-chart',
    slide: 0,
    name: 'invented',
    kind: 'column',
    x: '1in',
    y: '1in',
    w: '3in',
    h: '3in',
  })
  const broken = structuredClone(DESIGN)
  broken.longTable.table.weights[0] = 0.5
  assert.throws(() => assertDesignContract(broken), /sum to one/)
  const unknown = structuredClone(DESIGN)
  unknown.rules.push({ id: 'unknown', check: 'unknown' })
  assert.throws(() => assertDesignContract(unknown), /Unknown design checker/)
})

test('table, text and shape-owned text participate in native readback instead of object-count-only checks', () => {
  const result = createDeck(fixture),
    plan = result.designPlan
  assert.equal(checkDesignReadback(plan, result.patch, { slides: [] }).status, 'fail')
  const badge = result.patch.ops.find(
    (o) => o.op === 'set-text-frame' && o.shape?.name === 'S0_EditionBadge' && o.text,
  )
  assert.equal(badge.text, fixture.slides[0].data.edition)
  assert.ok(
    result.patch.ops.some(
      (o) =>
        o.op === 'set-text-frame' &&
        o.shape?.name === 'S0_EditionBadge' &&
        o.frame?.verticalAnchor === 'middle',
    ),
  )
  const table = result.patch.ops.find((o) => o.op === 'add-table')
  assert.deepEqual(table.data, [fixture.slides[6].data.columns, ...fixture.slides[6].data.rows])
})

test('design projections preserve registered refurbishment metadata and remain synchronized', () => {
  const catalog = JSON.parse(
      readFileSync(new URL('../../../pptx-nova/assets/deckkits/catalog.json', import.meta.url)),
    ),
    entry = catalog.entries.find((e) => e.id === 'long-table')
  assert.ok(entry.refurbishProfile?.fallback?.fonts)
  assert.equal(entry.refurbishProfile.fallback.fonts.display, DESIGN.fonts.display.latin)
  assert.equal(entry.refurbishProfile.fallback.fonts.heading, DESIGN.fonts.display.latin)
  assert.equal(entry.refurbishProfile.fallback.fonts.body, DESIGN.fonts.body.latin)
  assert.equal(entry.refurbishProfile.fallback.fonts.label, DESIGN.fonts.body.latin)
  const coverSchema = JSON.parse(
    readFileSync(
      new URL(
        '../../../pptx-nova/assets/deckkits/long-table/schemas/longTableCoverSlide.schema.json',
        import.meta.url,
      ),
    ),
  )
  assert.ok(
    coverSchema.properties.pills.items['x-slotBudget'].widthIn > 2,
    'public pill capacity must describe available space, not a tiny sentinel',
  )
  const check = spawnSync(
    process.execPath,
    ['tools/generate-pptx-design-projections.mjs', 'long-table', '--check'],
    { cwd: new URL('../../../', import.meta.url), encoding: 'utf8' },
  )
  assert.equal(check.status, 0, check.stderr)
})
