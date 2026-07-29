import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { test } from 'node:test'

const ROOT = resolve(import.meta.dirname, '..', '..')
const TOOL = resolve(ROOT, 'pptx-nova/scripts/pptx-nova-powerpoint-snapshot.nu')

function classify({ afterProcess = 'Microsoft PowerPoint', pixelWidth = 200, pixelHeight = 100 }) {
  const command = `
source ${JSON.stringify(TOOL)}
let canvas = {left: 10 top: 20 width: 100 height: 50 right: 110 bottom: 70}
let before = {
  ok: true
  frontmost_process: 'Microsoft PowerPoint'
  window_title: 'deck - PowerPoint'
  presentation_name: 'deck.pptx'
  presentation_path: '/tmp/deck.pptx'
  slide: 3
  canvas: $canvas
}
let after = ($before | upsert frontmost_process ${JSON.stringify(afterProcess)})
validate-window-capture-state '/tmp/deck.pptx' 3 $canvas $before $after {
  pixel_width: ${pixelWidth}
  pixel_height: ${pixelHeight}
} | to json --raw
`
  const result = spawnSync('nu', ['-c', command], { cwd: ROOT, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return JSON.parse(result.stdout)
}

test('pptx snapshot window guard accepts a stable PowerPoint Retina capture', () => {
  assert.deepEqual(classify({}), { ok: true, issues: [], scale: 2 })
})

test('pptx snapshot window guard rejects a different frontmost application', () => {
  const result = classify({ afterProcess: 'AFFiNE' })
  assert.equal(result.ok, false)
  assert.ok(result.issues.some((issue) => issue.code === 'frontmost-process-mismatch'))
})

test('pptx snapshot window guard rejects image dimensions unrelated to the canvas', () => {
  const result = classify({ pixelWidth: 200, pixelHeight: 140 })
  assert.equal(result.ok, false)
  assert.ok(result.issues.some((issue) => issue.code === 'image-canvas-scale-mismatch'))
})
