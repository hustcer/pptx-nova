import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createDeck, DESIGN } from '../../pptx-nova/assets/deckkits/swiss-grid.kit.mjs'
import { checkDesignPatch, designHash } from '../../pptx-nova/assets/deckkits/design-contract.mjs'
import { validateDeckkitContent } from '../../pptx-nova/assets/deckkits/validate-deckkit.mjs'
import { SWISS_LAYOUTS } from '../../pptx-nova/assets/deckkits/swiss-registry.mjs'

const fixture = JSON.parse(
  readFileSync(
    new URL('../../pptx-nova/assets/deckkits/examples/swiss-grid-content.json', import.meta.url),
  ),
)
const excerpt = (slides) => ({
  meta: { deckkit: 'swiss-grid', designScope: 'excerpt' },
  slides: structuredClone(slides),
})
const visible = (patch) =>
  patch.ops
    .flatMap((o) =>
      o.op === 'add-table' ? o.data.flat() : typeof o.text === 'string' ? [o.text] : [],
    )
    .join('\n')
const normalized = (s) => s.replace(/\s+/gu, '')
const strings = (v, k = '') =>
  typeof v === 'string'
    ? ['specimenStyle', 'icon', 'diagram', 'align'].includes(k)
      ? []
      : [v]
    : Array.isArray(v)
      ? v.flatMap((x) => strings(x, k))
      : v && typeof v === 'object'
        ? Object.entries(v).flatMap(([key, x]) => (key === 'rowTones' ? [] : strings(x, key)))
        : []

test('Swiss Grid has one deterministic registered plan for every public responsibility', () => {
  const a = createDeck(fixture),
    b = createDeck(fixture)
  assert.equal(DESIGN.version, '2.0.0')
  assert.equal(a.designCheck.status, 'pass')
  assert.equal(a.designPlan.layouts.length, 15)
  assert.equal(designHash(a.patch), designHash(b.patch))
  assert.equal(designHash(a.designPlan), designHash(b.designPlan))
  assert.ok(validateDeckkitContent(fixture, { deckkit: 'swiss-grid', mode: 'delivery' }).valid)
  assert.ok(a.patch.ops.some((o) => o.op === 'add-table' && o.rows === 12 && o.columns === 3))
  assert.equal(a.patch.ops.filter((o) => o.op === 'add-image').length, 6)
  assert.ok(a.designPlan.layouts.every((l) => l.components.length && l.fingerprint))
})

test('all registered compositions render full information with genuinely different frames', () => {
  let count = 0
  for (const source of fixture.slides) {
    const slide = structuredClone(source),
      family = DESIGN.swiss.families[slide.type],
      fingerprints = []
    // Text is unchanged; explicit paragraph breaks are reflowed for a vertical register.
    if (['timeline', 'progress'].includes(family.role))
      slide.data.steps.forEach((a) => (a.body = a.body.replaceAll('\n', ' ')))
    assert.deepEqual(Object.keys(family.variants), Object.keys(SWISS_LAYOUTS[family.role]))
    for (const layoutId of Object.keys(family.variants)) {
      const result = createDeck(excerpt([{ ...slide, layoutId }])),
        text = normalized(visible(result.patch))
      for (const value of strings(slide.data))
        assert.ok(text.includes(normalized(value)), `${slide.type}.${layoutId} dropped ${value}`)
      fingerprints.push(result.designPlan.layouts[0].fingerprint)
      count++
    }
    assert.equal(new Set(fingerprints).size, fingerprints.length)
  }
  assert.equal(count, 24)
})

test('every minimum role builds without reference prose or copied source media', () => {
  const control = new Set(['specimenStyle', 'icon', 'diagram', 'align', 'rowTones']),
    map = (v, k = '') => {
      if (control.has(k)) return v
      if (typeof v === 'string') return 'z'
      if (Array.isArray(v)) return v.map((x) => map(x, k))
      if (v && typeof v === 'object')
        return Object.fromEntries(Object.entries(v).map(([key, x]) => [key, map(x, key)]))
      return v
    }
  const slides = fixture.slides.map((s) => ({ ...s, data: map(s.data) }))
  for (const s of slides) {
    if (s.data.calloutHighlights) s.data.calloutHighlights = ['z']
    for (const k of ['items', 'people', 'events', 'cards', 'steps', 'brands', 'rows'])
      if (s.data[k]) s.data[k] = s.data[k].slice(0, 1)
    if (s.data.rowTones) s.data.rowTones = ['neutral']
  }
  for (const s of slides) {
    const result = createDeck(excerpt([s])),
      text = visible(result.patch).toLowerCase()
    for (const term of [
      'müller',
      'helvetica',
      'univers',
      'ibm',
      'swiss international',
      'grid systems in graphic design',
      'thank you',
    ])
      assert.ok(!text.includes(term), `${s.type}: leaked ${term}`)
  }
})

test('control fields affect rendering and legal optional fields never disappear', () => {
  const cover = structuredClone(fixture.slides[0])
  cover.data.footer = 'User supplied footer'
  assert.ok(visible(createDeck(excerpt([cover])).patch).includes(cover.data.footer))
  const face = structuredClone(fixture.slides[6])
  face.data.cards[0].sampleText = 'Zz'
  const p = createDeck(excerpt([face])).patch
  assert.ok(
    p.ops.some(
      (o) => o.op === 'set-text-frame' && o.shape.name === 'S0_Specimen0' && o.text === 'Zz',
    ),
  )
  const fonts = p.ops
    .filter((o) => o.op === 'set-run' && /Specimen/.test(o.shape.name))
    .map((o) => o.font)
  assert.equal(fonts[0].name, 'Arial Black')
  assert.equal(fonts[0].bold, false)
  assert.equal(fonts[1].bold, true)
  assert.equal(fonts[2].bold, false)
  const rich = createDeck(excerpt([fixture.slides[2]])).patch
  assert.ok(
    rich.ops.some(
      (o) =>
        ['set-run', 'add-run'].includes(o.op) &&
        o.text === fixture.slides[2].data.calloutHighlights[0] &&
        o.font.bold,
    ),
  )
  const system = createDeck(excerpt([fixture.slides[8]]))
  assert.equal(system.designPlan.layouts[0].components.filter((c) => c.kind === 'owned').length, 3)
  for (const c of system.designPlan.layouts[0].components.filter((c) => c.kind === 'owned'))
    assert.equal(c.style.verticalAnchor, 'middle')
  const focus = createDeck(excerpt([fixture.slides[13]])).patch.ops.find(
    (o) => o.op === 'set-table',
  )
  assert.ok(focus.cells.some((c) => c.row === 9 && c.style.font.color === DESIGN.colors.red))
})

test('one numeric source drives system labels and geometry including zero gutter', () => {
  const slide = structuredClone(fixture.slides[8])
  slide.data.model.baseUnit = 8
  slide.data.model.columnUnits = 12
  slide.data.model.gapUnits = 0
  const result = createDeck(excerpt([slide])),
    text = visible(result.patch)
  assert.ok(text.includes('96px'))
  assert.ok(text.includes('Gutter 0px'))
  assert.ok(!text.includes('256px'))
  const c = result.designPlan.layouts[0].components,
    measure = c.filter((c) => /^Measure\d+$/.test(c.name))
  assert.equal(measure.length, 4)
  assert.equal(measure[0].frame[0] + measure[0].frame[2], measure[1].frame[0])
})

test('unknown fields, old geometry, missing facts, overflow and invalid controls fail with context', () => {
  const fail = (i, mutate, pattern) => {
    const s = structuredClone(fixture.slides[i])
    mutate(s)
    assert.throws(() => createDeck(excerpt([s])), pattern)
  }
  fail(0, (s) => (s.data.extra = 'ignored'), /unknown field extra/)
  fail(0, (s) => (s.layoutId = 'unregistered'), /No layout fits/)
  fail(0, (s) => (s.data.title = 'W'.repeat(200)), /title|width/)
  fail(2, (s) => (s.data.calloutHighlights = ['missing']), /calloutHighlights/)
  fail(3, (s) => s.data.items.push(s.data.items[0]), /too many items/)
  fail(8, (s) => delete s.data.model.unit, /missing unit/)
  fail(8, (s) => (s.data.model.rows = 5.5), /integer required/)
  fail(8, (s) => (s.data.model.baseUnit = -1), /must exceed/)
  fail(12, (s) => (s.data.brands[0].icon = 'missing-icon'), /unknown Tabler icon/)
  fail(13, (s) => s.data.rows[0].pop(), /expected 3 cells/)
  fail(
    13,
    (s) => (s.data.rows[0][0] = 'W'.repeat(100)),
    /slides\[0\]\.data\.rows\[0\]\[0\]: word exceeds width/,
  )
  fail(13, (s) => s.data.rowTones.pop(), /one tone per row/)
  fail(14, (s) => (s.data.dots = [[8, 1]]), /unknown field dots/)
  assert.throws(
    () => createDeck({ ...fixture, slides: fixture.slides.slice(0, -1) }),
    /cover and closing/,
  )
})

test('Swiss identity checks reject color leakage, tilted text, non-flat surfaces and thick rules', () => {
  const p = createDeck(fixture).patch,
    reject = (op) =>
      assert.equal(checkDesignPatch(DESIGN, { ...p, ops: [...p.ops, op] }).status, 'fail')
  reject({
    op: 'set-run',
    slide: 0,
    shape: { name: 'S0_Title' },
    font: { name: 'Helvetica', size: '64pt', color: '0000FF' },
  })
  reject({
    op: 'set-run',
    slide: 0,
    shape: { name: 'S0_Title' },
    font: {
      name: 'Helvetica',
      size: '64pt',
      color: DESIGN.colors.ink,
      italic: true,
    },
  })
  reject({
    op: 'set-shape',
    slide: 0,
    shape: { name: 'S0_Title' },
    line: { width: '4pt', color: DESIGN.colors.ink },
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
})

test('slot discovery uses legal numeric/icon controls and nested specimen fallback', () => {
  const r = spawnSync(
    process.execPath,
    [
      'pptx-nova/scripts/pptx-nova-deckkit-slot-consistency.mjs',
      '--deckkit',
      'swiss-grid',
      '--json',
    ],
    { encoding: 'utf8' },
  )
  assert.equal(r.status, 0, r.stdout + r.stderr)
  const report = JSON.parse(r.stdout)
  assert.ok(report.ok)
  assert.equal(report.results[0].slideTypes.length, 15)
})
