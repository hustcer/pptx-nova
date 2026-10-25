import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { rightExitPosition } from '../../../pptx-nova/scripts/cli/animation/examples.mjs'

test('right exit clears every rotated corner across landscape and portrait sizes', () => {
  for (const [slideWidth, w, h] of [
    [12000000, 3000000, 1700000],
    [7000000, 2100000, 4200000],
  ]) {
    for (const rotation of [0, 18, 45, 90, 135, 180, 270, -32]) {
      const margin = slideWidth * 0.02
      const result = rightExitPosition({ slideWidth, x: 100, y: 200, w, h, rotation, margin })
      const rad = (rotation * Math.PI) / 180
      const center = result.x + w / 2
      for (const dx of [-w / 2, w / 2])
        for (const dy of [-h / 2, h / 2]) {
          const cornerX = center + dx * Math.cos(rad) - dy * Math.sin(rad)
          assert.ok(cornerX >= slideWidth + margin - 0.001, `${rotation}: ${cornerX}`)
        }
      assert.equal(result.y, 200)
    }
  }
})

test('example refuses an existing run before calling xdoc or altering evidence', (t) => {
  const run = mkdtempSync(join(tmpdir(), 'morph-example-test-'))
  t.after(() => rmSync(run, { recursive: true, force: true }))
  writeFileSync(join(run, 'evidence.json'), 'keep')
  const result = spawnSync(
    process.execPath,
    [
      'pptx-nova/scripts/cli/animation/examples.mjs',
      '--example',
      'exit',
      '--run-dir',
      run,
      '--xdoc',
      'not-a-real-xdoc',
    ],
    { encoding: 'utf8' },
  )
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /EEXIST/)
  assert.equal(readFileSync(join(run, 'evidence.json'), 'utf8'), 'keep')
})

test('exit geometry rejects non-finite or non-positive dimensions', () => {
  for (const patch of [{ w: 0 }, { slideWidth: -1 }, { margin: 0 }, { rotation: NaN }]) {
    assert.throws(() =>
      rightExitPosition({
        slideWidth: 1000,
        x: 0,
        y: 0,
        w: 100,
        h: 200,
        rotation: 0,
        margin: 20,
        ...patch,
      }),
    )
  }
})
