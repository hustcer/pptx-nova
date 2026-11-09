import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, writeFileSync, readFileSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { skillUrl, skillPath } from '../helpers/common.mjs'

const { buildImageGeometryReport } = await import(skillUrl('scripts/lib/review/image-geometry.mjs'))

function deck({ w = 4000000, h = 6000000, x = 0, crop = null, maskPreset = null } = {}) {
  return {
    slides: [
      {
        index: 0,
        partName: 'ppt/slides/slide7.xml',
        shapes: [
          {
            id: 9,
            shapeType: 'picture',
            bbox: { xEmu: x, yEmu: 0, wEmu: w, hEmu: h },
            image: { crop, maskPreset },
          },
        ],
      },
    ],
  }
}

const report = (source, candidate) =>
  buildImageGeometryReport({ sourceInspect: source, candidateInspect: candidate })

test('picture geometry allows translation and uniform scaling with EMU rounding', () => {
  const r = report(deck(), deck({ w: 2000000, h: 3000001, x: 900000 }))
  assert.equal(r.status, 'pass')
  assert.equal(r.summary.picturesChecked, 1)
  assert.equal(r.pictures[0].moved, true)
})

test('unchanged media or crop cannot excuse nonuniform image scaling', () => {
  const r = report(deck(), deck({ w: 4000000, h: 4700000 }))
  assert.equal(r.status, 'fail')
  assert.ok(r.issues.some((i) => i.code === 'picture-nonuniform-scale'))
})

test('uniformly scaled frames still fail changed source crop or mask', () => {
  for (const candidate of [deck({ crop: { left: 0.1 } }), deck({ maskPreset: 'ellipse' })]) {
    assert.equal(report(deck(), candidate).status, 'fail')
  }
})

test('missing and ambiguous original identities fail without guessed remapping', () => {
  const missing = deck()
  missing.slides[0].shapes = []
  assert.equal(report(deck(), missing).status, 'fail')
  const ambiguous = deck()
  ambiguous.slides[0].shapes.push(ambiguous.slides[0].shapes[0])
  assert.equal(report(deck(), ambiguous).status, 'fail')
  const noId = deck()
  delete noId.slides[0].shapes[0].id
  assert.equal(report(noId, noId).status, 'fail')
})

test('missing geometry or crop disclosure is not a preservation pass', () => {
  const missing = deck()
  delete missing.slides[0].shapes[0].image
  assert.equal(report(deck(), missing).status, 'fail')
  const invalid = deck({ w: 0 })
  assert.equal(report(deck(), invalid).status, 'fail')
})

test('candidate-only pictures do not alter the source-picture preservation scope', () => {
  const candidate = deck()
  candidate.slides[0].shapes.push({ ...candidate.slides[0].shapes[0], id: 10 })
  const r = report(deck(), candidate)
  assert.equal(r.status, 'pass')
  assert.equal(r.summary.picturesChecked, 1)
})

test('an input without pictures is explicitly not applicable', () => {
  assert.equal(report({ slides: [] }, { slides: [] }).status, 'not-applicable')
})

test('CLI refuses overwriting input bytes through the report path or an alias', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pptx-image-gate-'))
  const source = join(dir, 'source.pptx'),
    candidate = join(dir, 'candidate.pptx')
  writeFileSync(source, 'Source bytes')
  writeFileSync(candidate, 'Candidate bytes')
  const alias = join(dir, 'report.json')
  symlinkSync(source, alias)
  for (const output of [source, candidate, alias]) {
    const result = spawnSync(
      process.execPath,
      [
        skillPath('scripts/cli/review/image-geometry-gate.mjs'),
        '--source',
        source,
        '--candidate',
        candidate,
        '--output',
        output,
        '--overwrite',
      ],
      { encoding: 'utf8' },
    )
    assert.equal(result.status, 1)
    assert.match(result.stderr, /must differ/)
  }
  assert.equal(readFileSync(source, 'utf8'), 'Source bytes')
  assert.equal(readFileSync(candidate, 'utf8'), 'Candidate bytes')
})
