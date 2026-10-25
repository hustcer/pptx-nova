import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  createDeck,
  DESIGN,
} from '../../../pptx-nova/assets/deckkits/pink-script/pink-script.kit.mjs'
import { pinkSpecimen } from '../../../pptx-nova/assets/deckkits/pink-script/registry.mjs'
import {
  assertDesignContract,
  checkDesignPatch,
} from '../../../pptx-nova/assets/deckkits/shared/design-contract.mjs'
import { validateDeckkitContent } from '../../../pptx-nova/assets/deckkits/shared/validate-deckkit.mjs'
import { createAssetContext } from '../../../pptx-nova/scripts/lib/assets/asset-manifest.mjs'
const file = (p) =>
  JSON.parse(
    readFileSync(new URL('../../../pptx-nova/assets/deckkits/pink-script/' + p, import.meta.url)),
  )
const assetPath = new URL(
  '../../../pptx-nova/assets/examples/deckkits/pink-script/assets_manifest.json',
  import.meta.url,
)
const assets = createAssetContext(JSON.parse(readFileSync(assetPath)), assetPath.pathname)
const fixture = () => file('examples/content.json')
const excerpt = (slides) => ({ meta: { deckkit: 'pink-script', designScope: 'excerpt' }, slides })
test('pink-script: source grammar and explicit no-frame / QR-only refinements', () => {
  const b = createDeck(fixture(), { assets })
  assert.equal(b.designCheck.status, 'pass')
  assert.equal(b.patch.ops.filter((o) => o.op === 'add-slide').length, 9)
  const chart = b.patch.ops.find((o) => o.op === 'add-chart')
  assert.equal(chart.kind, 'line')
  assert.equal(chart.data.series.length, 2)
  assert.equal(b.patch.ops.filter((o) => o.op === 'add-table').length, 1)
  const images = b.patch.ops.filter((o) => o.op === 'add-image')
  assert.equal(images.length, 1)
  assert.match(images[0].name, /_ContactQR$/)
  assert.ok(images[0].bytesBase64)
  assert.doesNotMatch(
    JSON.stringify(b.patch),
    /InteriorFrame|OuterFrame|TicketLabel|ContactPlate|Scan to reserve/,
  )
  assert.ok(b.patch.ops.some((o) => o.shape?.name === 'S0_CoverTitle' && o.effect?.glow))
  assert.ok(b.patch.ops.some((o) => o.name === 'S5_StepArrow3'))
  assert.deepEqual(createDeck(fixture(), { assets }), b)
})
for (const [type, f] of Object.entries(DESIGN.pink.families))
  test(`pink-script ${type}: min/max and all real geometries`, () => {
    for (const maximum of [false, true]) {
      const data = pinkSpecimen(file(`schemas/${type}.schema.json`), 0, maximum),
        fingerprints = []
      for (const layoutId of Object.keys(f.variants)) {
        const c = excerpt([{ type, layoutId, data }]),
          v = validateDeckkitContent(c, { mode: 'delivery' })
        assert.equal(v.valid, true, JSON.stringify(v.errors))
        const b = createDeck(c)
        assert.equal(b.designCheck.status, 'pass')
        fingerprints.push(b.designPlan.layouts[0].fingerprint)
        assert.doesNotMatch(
          JSON.stringify(b.patch),
          /Maison Nocturne|Marchetti|Atelier Throughput|Vault programme|Camille Aubry|Le Soir|structurify\.io/,
        )
      }
      assert.equal(new Set(fingerprints).size, 2)
    }
  })
test('pink-script: both compositions preserve every visible string and casing', () => {
  for (const name of ['content', 'alternate-content', 'community-content']) {
    const c = file(`examples/${name}.json`),
      text = JSON.stringify(createDeck(c, { assets }).patch)
        .replaceAll('\\n', '')
        .replace(/\s/g, '')
    const walk = (v, key = '') => {
      if (typeof v === 'string' && key !== 'state')
        assert.ok(
          text.includes(JSON.stringify(v).slice(1, -1).replaceAll('\\n', '').replace(/\s/g, '')),
          v,
        )
      else if (Array.isArray(v)) v.forEach((x) => walk(x, key))
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, k)
    }
    for (const s of c.slides) walk(s.data)
  }
})
test('pink-script: negative/zero/tiny raw values and every native table cell stay unchanged', () => {
  const c = file('examples/community-content.json'),
    b = createDeck(c)
  const chart = b.patch.ops.find((o) => o.op === 'add-chart'),
    table = b.patch.ops.find((o) => o.op === 'add-table')
  assert.deepEqual(chart.data.series, c.slides[4].data.series)
  assert.deepEqual(chart.data.series[0].values.slice(0, 3), [0, -2, 0.000001])
  assert.deepEqual(table.data, [
    c.slides[6].data.columns.map((v) => v.label),
    ...c.slides[6].data.rows,
  ])
  const st = b.patch.ops.find((o) => o.op === 'set-chart')
  assert.equal(st.series[1].line.dash, 'dash')
  assert.ok(st.series.every((v) => !Object.hasOwn(v, 'invertIfNegative')))
  assert.ok(st.axes.find((a) => a.axis === 'value').scale.min < 0)
})
test('pink-script: upright CJK bold display and regular Latin display are explicit', () => {
  const b = createDeck(file('examples/community-content.json'))
  assert.ok(
    b.patch.ops.some(
      (o) =>
        o.op === 'set-run' &&
        o.shape?.name === 'S0_CoverTitle' &&
        o.font.name === 'Songti SC' &&
        o.font.bold &&
        !o.font.italic,
    ),
  )
  const latin = createDeck(fixture(), { assets }).patch.ops.find(
    (o) => o.op === 'set-run' && o.shape?.name === 'S0_CoverTitle',
  )
  assert.equal(latin.font.name, 'DM Serif Display')
  assert.equal(latin.font.bold, false)
  assert.equal(latin.font.italic, false)
})
test('pink-script: QR optional / square / uncropped; no fabricated fallback', () => {
  const c = fixture()
  assert.throws(() => createDeck(c), /requires --assets/)
  delete c.slides.at(-1).imageSlots
  assert.equal(createDeck(c).patch.ops.filter((o) => o.op === 'add-image').length, 0)
  c.slides.at(-1).imageSlots = { 'contact.qr': 'probe' }
  for (const a of [
    { ratio: '16:9', fitPolicy: 'contain' },
    { ratio: '1:1', fitPolicy: 'cover' },
  ])
    assert.throws(
      () => createDeck(c, { assets: { resolveImageSlot: () => a } }),
      /square uncropped/,
    )
  c.slides.at(-1).imageSlots = { unknown: 'probe' }
  assert.throws(() => createDeck(c), /Only closing contact.qr/)
})
test('pink-script: missing, long, excess, unknown and coupled counterexamples fail accurately', () => {
  const mutations = [
    [(c) => delete c.slides[0].data.source, /source/],
    [(c) => c.slides[1].data.items.push(...c.slides[1].data.items), /items/],
    [(c) => c.slides[4].data.series[0].values.pop(), /complete named series/],
    [(c) => (c.slides[4].data.series[0].values[0] = null), /number/],
    [(c) => (c.slides[4].data.focusIndex = 0.5), /focusIndex/],
    [(c) => (c.slides[4].data.focusIndex = 99), /focusIndex/],
    [(c) => (c.slides[6].data.focusColumn = 9), /focusColumn/],
    [(c) => c.slides[6].data.rows[0].pop(), /match all columns/],
    [(c) => (c.slides[6].data.columns[0].weight = 0), /weight/],
    [
      (c) => (c.slides[6].data.statuses[1] = { ...c.slides[6].data.statuses[0] }),
      /Duplicate status/,
    ],
    [(c) => (c.slides[6].data.statuses[0].row = 99), /outside table/],
    [(c) => (c.slides[6].data.rows[0][0] = 'line\nbreak'), /one paragraph/],
    [(c) => (c.slides[0].data.title = '界'.repeat(80)), /fit|width|exceed/],
    [(c) => (c.slides[5].data.steps[0].description = 'W'.repeat(100)), /fit|width|exceed/],
    [(c) => (c.slides[0].data.domainPolicy = 'reference business rule'), /domainPolicy/],
    [(c) => (c.slides[0].customOps = [{ op: 'add-slide' }]), /customOps|registered/],
    [(c) => (c.slides[0].layoutId = 'unknown'), /layout/i],
    [(c) => c.slides.shift(), /cover/],
  ]
  for (const [mutate, pattern] of mutations) {
    const c = fixture()
    mutate(c)
    const v = validateDeckkitContent(c, { mode: 'delivery' })
    assert.equal(v.valid, false, String(mutate))
    assert.match(JSON.stringify(v.errors), pattern)
  }
})
test('pink-script: design rejects outer borders, wrong fonts, colors and effects', () => {
  for (const mutate of [
    (d) => (d.colors.accent = 'FF0000'),
    (d) => (d.fonts.display.latin = 'Arial'),
    (d) => (d.pink.styles.hero.italic = true),
    (d) => (d.pink.styles.hero.lineHeight = 1.12),
    (d) => delete d.pink.families.pinkSectionSlide,
  ]) {
    const d = structuredClone(DESIGN)
    mutate(d)
    assert.throws(() => assertDesignContract(d))
  }
  const b = createDeck(fixture(), { assets })
  for (const op of [
    {
      op: 'add-shape',
      slide: 0,
      name: 'Border',
      kind: 'rectangle',
      x: '0.2in',
      y: '0.2in',
      w: '12.9in',
      h: '7.1in',
    },
    {
      op: 'set-shape',
      slide: 0,
      shape: { name: 'S0_CoverTitle' },
      effect: { shadow: { color: '000000', blur: '5pt' } },
    },
    {
      op: 'set-run',
      slide: 0,
      shape: { name: 'S0_CoverTitle' },
      font: { name: 'Comic Sans MS', size: '7pt', italic: true, color: '00FF00' },
    },
  ])
    assert.equal(checkDesignPatch(DESIGN, { ...b.patch, ops: [...b.patch.ops, op] }).status, 'fail')
})
