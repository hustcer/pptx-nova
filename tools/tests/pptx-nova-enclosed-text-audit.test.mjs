import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

test('rendered diagnostic accepts thin strokes while rejecting missing, escaped and off-center ink', (t) => {
  if (spawnSync('magick', ['-version']).status !== 0) return t.skip('ImageMagick unavailable')
  const dir = mkdtempSync(join(tmpdir(), 'enclosed-text-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const ops = []
  for (const [i, name] of [
    'vertical',
    'horizontal',
    'missing',
    'escaped',
    'off-center',
  ].entries()) {
    ops.push(
      {
        op: 'add-shape',
        slide: 0,
        name,
        kind: 'oval',
        x: `${1 + i * 2}in`,
        y: '1in',
        w: '1in',
        h: '1in',
      },
      { op: 'set-text-frame', slide: 0, shape: { name }, text: 'I' },
      { op: 'set-run', slide: 0, shape: { name }, font: { color: '000000' } },
    )
  }
  // Pixel-only fixtures test the diagnostic, independently of PPTX layout/rendering.
  execFileSync('magick', [
    '-size',
    '1920x1080',
    'xc:white',
    '-fill',
    'black',
    '-draw',
    'rectangle 216,210 216,222 rectangle 498,216 510,216 rectangle 1157,210 1157,222 rectangle 1400,210 1400,222',
    join(dir, 'slide-1.png'),
  ])
  writeFileSync(join(dir, 'patch.json'), JSON.stringify({ schemaVersion: 'pptx-patch/v1', ops }))
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL('../pptx-nova-enclosed-text-audit.mjs', import.meta.url)),
      '--patch',
      join(dir, 'patch.json'),
      '--previews',
      dir,
      '--out',
      join(dir, 'report.json'),
    ],
    { encoding: 'utf8' },
  )
  assert.equal(result.status, 1, result.stderr)
  assert.ok(existsSync(join(dir, 'report.json')), result.stderr)
  const report = JSON.parse(readFileSync(join(dir, 'report.json')))
  assert.deepEqual(
    report.checks.map((c) => c.passed),
    [true, true, false, false, false],
    JSON.stringify(report),
  )
  assert.equal(report.checks[3].contained, false)
  assert.equal(report.checks[4].centered, false)
})
