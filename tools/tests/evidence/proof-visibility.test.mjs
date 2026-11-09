import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { proofPptx } from '../helpers/proof-fixtures.mjs'
import { buildProofVisibilityReport } from '../../../pptx-nova/scripts/lib/review/proof-visibility.mjs'
import { contactDiffReport } from '../helpers/compare-fixtures.mjs'
import { skillPath, writeJson } from '../helpers/common.mjs'

const hash = (p) => createHash('sha256').update(readFileSync(p)).digest('hex')
function fixture(t, paint, options) {
  const dir = mkdtempSync(join(tmpdir(), 'nova-proof-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const file = join(dir, 'deck.pptx')
  writeFileSync(file, proofPptx(paint, options))
  return file
}
const solid = (color, alpha = '') =>
  `<a:solidFill><a:srgbClr val="${color}">${alpha}</a:srgbClr></a:solidFill>`
const none = '<a:ln><a:noFill/></a:ln>'
function report(source, candidate, overrides = {}) {
  return buildProofVisibilityReport({
    source,
    candidate,
    proofMap: {
      sourceSha256: hash(source),
      proofObjects: [{ slideNumber: 1, shapeId: 7, role: 'milestone-node' }],
      ...overrides,
    },
  })
}
test('the same native object and text fail when its silhouette disappears into the background', (t) => {
  const source = fixture(t, solid('0000FF') + none)
  const candidate = fixture(t, solid('FFFFFF') + none)
  const r = report(source, candidate)
  assert.equal(r.status, 'fail')
  assert(r.results[0].issues.some((x) => x.code === 'proof-not-discernible'))
})
test('a target-colored outline preserves a white proof shape', (t) => {
  const source = fixture(t, solid('0000FF') + none)
  const candidate = fixture(t, solid('FFFFFF') + '<a:ln w="8255">' + solid('53695D') + '</a:ln>')
  assert.equal(report(source, candidate).status, 'pass')
})
test('an outline with undisclosed thickness cannot prove a background-matched shape is visible', (t) => {
  const source = fixture(t, solid('0000FF') + none)
  const candidate = fixture(t, solid('FFFFFF') + '<a:ln>' + solid('53695D') + '</a:ln>')
  const r = report(source, candidate)
  assert.equal(r.status, 'review-required')
  assert(r.results[0].issues.some((x) => x.code === 'proof-paint-unresolved'))
})
test('hidden native shapes and tables cannot pass positive bounds and paint checks', (t) => {
  const source = fixture(t, solid('0000FF') + none)
  for (const hidden of ['1', 'true', ' true ']) {
    const r = report(source, fixture(t, solid('002A12') + none, { hidden }))
    assert.equal(r.status, 'fail')
    assert(r.results[0].issues.some((x) => x.code === 'proof-hidden'))
  }
  const table = fixture(t, '', { tableGridWidth: 500000 })
  const r = report(table, fixture(t, '', { tableGridWidth: 500000, hidden: '1' }), {
    proofObjects: [{ slideNumber: 1, shapeId: 7, kind: 'table', role: 'evidence-table' }],
  })
  assert.equal(r.status, 'fail')
  assert(r.results[0].issues.some((x) => x.code === 'proof-hidden'))
  assert.equal(report(source, fixture(t, solid('002A12') + none, { hidden: '0' })).status, 'pass')
  assert.equal(
    report(source, fixture(t, solid('002A12') + none, { hidden: 'invalid' })).status,
    'review-required',
  )
})
test('fill color cannot prove unsupported, open or non-painting geometry exists visibly', (t) => {
  const source = fixture(t, solid('0000FF') + none)
  for (const geometry of [
    '',
    '<a:prstGeom prst="line"/>',
    '<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="l" t="t" r="r" b="b"/><a:pathLst><a:path fill="none" stroke="0"/></a:pathLst></a:custGeom>',
    '<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 0"/></a:avLst></a:prstGeom>',
  ]) {
    const r = report(source, fixture(t, solid('002A12') + none, { geometry }))
    assert.equal(r.status, 'review-required')
    assert(r.results[0].issues.some((x) => x.code === 'proof-shape-geometry-unverified'))
  }
  for (const preset of ['rect', 'roundRect', 'ellipse'])
    assert.equal(
      report(
        source,
        fixture(t, solid('002A12') + none, {
          geometry: `<a:prstGeom prst="${preset}"><a:avLst/></a:prstGeom>`,
        }),
      ).status,
      'pass',
    )
})
test('unresolved opacity effects and background-fill overrides cannot pass base paint checks', (t) => {
  const source = fixture(t, solid('0000FF') + none)
  for (const options of [
    { effects: '<a:effectDag><a:alphaRepl a="0"/></a:effectDag>' },
    { style: '<p:style><a:effectRef idx="1"><a:srgbClr val="000000"/></a:effectRef></p:style>' },
    { shapeAttrs: 'useBgFill="1"' },
  ])
    assert.equal(
      report(source, fixture(t, solid('002A12') + none, options)).status,
      'review-required',
    )
})
test('background effects cannot be ignored when comparing proof paint to its background', (t) => {
  const source = fixture(t, solid('0000FF') + none)
  const candidate = fixture(t, solid('0000FF') + none, {
    backgroundEffects:
      '<a:effectDag><a:clrRepl><a:srgbClr val="0000FF"/></a:clrRepl></a:effectDag>',
  })
  const r = report(source, candidate)
  assert.equal(r.status, 'review-required')
  assert(r.results[0].issues.some((x) => x.code === 'proof-background-unresolved'))
})
test('fully transparent paint and off-slide or zero-size proofs do not pass', (t) => {
  const source = fixture(t, solid('0000FF') + none)
  for (const candidate of [
    fixture(t, solid('002A12', '<a:alpha val="0"/>') + none),
    fixture(t, solid('002A12') + none, { x: 9200000 }),
    fixture(t, solid('002A12') + none, { width: 0 }),
  ])
    assert.equal(report(source, candidate).status, 'fail')
})
test('unresolved inherited background requires review instead of an invented white background', (t) => {
  const source = fixture(t, solid('0000FF') + none)
  const candidate = fixture(t, solid('002A12') + none, { background: false })
  assert.equal(report(source, candidate).status, 'review-required')
})
test('stale, empty and unresolved proof declarations cannot produce a pass', (t) => {
  const source = fixture(t, solid('0000FF') + none),
    candidate = fixture(t, solid('002A12') + none)
  for (const map of [
    { sourceSha256: '0'.repeat(64) },
    { proofObjects: [] },
    { proofObjects: [null] },
    { proofObjects: [{ slideNumber: 1, shapeId: 99, role: 'animation-target' }] },
  ])
    assert.notEqual(report(source, candidate, map).status, 'pass')
})
test('the published CLI emits real evidence and refuses to overwrite its PPTX input', (t) => {
  const source = fixture(t, solid('0000FF') + none),
    candidate = fixture(t, solid('002A12') + none)
  const map = candidate + '.map.json',
    output = candidate + '.report.json'
  writeFileSync(
    map,
    JSON.stringify({
      sourceSha256: hash(source),
      proofObjects: [{ slideNumber: 1, shapeId: 7, role: 'animation-target' }],
    }),
  )
  const cli = fileURLToPath(
    new URL('../../../pptx-nova/scripts/cli/review/proof-visibility-gate.mjs', import.meta.url),
  )
  const args = [cli, '--source', source, '--candidate', candidate, '--proof-map', map, '--output']
  const ok = spawnSync(process.execPath, [...args, output, '--json'], { encoding: 'utf8' })
  assert.equal(ok.status, 0, ok.stderr)
  assert.equal(JSON.parse(readFileSync(output)).status, 'pass')
  const before = hash(source)
  const refused = spawnSync(process.execPath, [...args, source, '--overwrite'], {
    encoding: 'utf8',
  })
  assert.equal(refused.status, 2)
  assert.equal(hash(source), before)
})
test('resizing only a native table frame cannot pass while its column grid or row heights stay small', (t) => {
  const source = fixture(t, '', { tableGridWidth: 500000 })
  const declarations = {
    proofObjects: [{ slideNumber: 1, shapeId: 7, kind: 'table', role: 'evidence-table' }],
  }
  const badWidth = report(
    source,
    fixture(t, '', { width: 1000000, tableGridWidth: 500000 }),
    declarations,
  )
  assert.equal(badWidth.status, 'fail')
  assert(badWidth.results[0].issues.some((x) => x.code === 'table-grid-frame-width-mismatch'))
  const badHeight = report(
    source,
    fixture(t, '', { tableGridWidth: 500000, tableRowHeight: 200000 }),
    declarations,
  )
  assert.equal(badHeight.status, 'fail')
  assert(badHeight.results[0].issues.some((x) => x.code === 'table-rows-frame-height-mismatch'))
  assert.equal(
    report(source, fixture(t, '', { width: 1000000, tableGridWidth: 1000000 }), declarations)
      .status,
    'pass',
  )
})
test('publication recomputes current proof geometry and paint instead of trusting a saved pass', (t) => {
  const source = fixture(t, solid('0000FF') + none)
  for (const { paint, options, expected } of [
    { paint: solid('002A12') + none, expected: 'pass' },
    { paint: solid('FFFFFF') + none, expected: 'fail' },
    {
      paint: solid('002A12') + none,
      options: { geometry: '<a:prstGeom prst="line"/>' },
      expected: 'review-required',
    },
  ]) {
    const candidate = fixture(t, paint, options)
    const runDir = dirname(candidate),
      delivery = join(runDir, 'delivery.pptx'),
      compare = join(runDir, 'refurbish-compare.png')
    writeFileSync(compare, 'compare png')
    writeJson(
      join(runDir, 'refurbish-compare.json'),
      contactDiffReport({ compare, sourcePptx: source, finalPptx: candidate }),
    )
    writeJson(join(runDir, 'proof-objects.json'), {
      sourceSha256: hash(source),
      proofObjects: [{ slideNumber: 1, shapeId: 7, role: 'milestone-node' }],
    })
    writeJson(join(runDir, 'proof-visibility-gate.json'), { status: 'pass' })
    const result = spawnSync(
      process.execPath,
      [
        skillPath('scripts/cli/review/compare-gate.mjs'),
        '--run-dir',
        runDir,
        '--final-pptx',
        delivery,
        '--final-pptx-source',
        candidate,
        '--kind',
        'refurbish',
        '--publish',
        '--timestamp',
        '0101000000',
        '--json',
      ],
      { encoding: 'utf8' },
    )
    assert.equal(result.status, expected === 'pass' ? 0 : 2, result.stderr || result.stdout)
    const gate = JSON.parse(result.stdout)
    assert.equal(gate.proofVisibility.status, expected)
    assert.equal(existsSync(delivery), expected === 'pass')
    assert.equal(
      readdirSync(runDir).filter((name) => name.startsWith('delivery-refurbish-compare-')).length,
      expected === 'pass' ? 1 : 0,
    )
    if (expected === 'pass') assert.equal(hash(delivery), hash(candidate))
  }
})
