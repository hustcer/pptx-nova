import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const ROOT = resolve(import.meta.dirname, '../../..')
const TOOL = resolve(ROOT, 'pptx-nova/scripts/cli/office/powerpoint-snapshot.nu')

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

function cleanupOwnedTempDir(root, target) {
  const command = `
source ${JSON.stringify(TOOL)}
cleanup-owned-temp-dir ${JSON.stringify(root)} ${JSON.stringify(target)} | to json --raw
`
  const result = spawnSync('nu', ['-c', command], { cwd: ROOT, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return JSON.parse(result.stdout)
}

function makeTimedTempDir(template) {
  const command = `
source ${JSON.stringify(TOOL)}
make-temp-dir-with-timeout ${JSON.stringify(template)} | to json --raw
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

test('pptx snapshot cleanup removes only its validated direct child', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-snapshot-cleanup-'))
  const owned = join(root, 'pptx-snapshot.ABC123')
  const sibling = join(root, 'keep-me')
  mkdirSync(owned)
  mkdirSync(sibling)

  try {
    // `path expand` in Nushell canonicalizes like realpathSync.native; the JS realpathSync keeps
    // Windows 8.3 short names such as `C:\Users\RUNNER~1` instead of resolving them.
    const expandedOwned = realpathSync.native(owned)
    assert.deepEqual(cleanupOwnedTempDir(root, owned), { removed: [expandedOwned], failed: [] })
    assert.equal(existsSync(owned), false)
    assert.equal(existsSync(sibling), true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('pptx snapshot cleanup rejects paths outside its root', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-snapshot-cleanup-root-'))
  const outsideRoot = mkdtempSync(join(tmpdir(), 'pptx-snapshot-cleanup-outside-'))
  const outside = join(outsideRoot, 'pptx-snapshot.ABC123')
  mkdirSync(outside)

  try {
    const result = cleanupOwnedTempDir(root, outside)
    assert.deepEqual(result.removed, [])
    assert.equal(result.failed.length, 1)
    assert.equal(existsSync(outside), true)
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(outsideRoot, { recursive: true, force: true })
  }
})

test('pptx snapshot bounded mktemp returns an owned directory', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-snapshot-mktemp-'))
  try {
    const result = makeTimedTempDir(join(root, 'pptx-snapshot.XXXXXX'))
    assert.equal(result.exit_code, 0)
    assert.equal(result.timed_out, false)
    assert.match(result.stdout.trim(), /pptx-snapshot\.[A-Za-z0-9]+$/)
    assert.equal(existsSync(result.stdout.trim()), true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('pptx snapshot never enumerates the PowerPoint temporary root', () => {
  const source = readFileSync(TOOL, 'utf8')
  assert.doesNotMatch(source, /list-powerpoint-temp-items/)
  assert.doesNotMatch(source, /cleanup-powerpoint-snapshot-temp-dirs/)
  assert.doesNotMatch(source, /ls \$tmp_root/)
  assert.match(source, /job recv --tag \$tag --timeout 3sec/)
})

test('pptx snapshot window fallback opens and closes only a tool-owned copy', () => {
  const source = readFileSync(TOOL, 'utf8')
  assert.match(source, /def stage-pptx-for-window-capture/)
  assert.match(source, /let source_sha256 = \(file-sha256 \$pptx_path\)/)
  assert.match(source, /let staged_sha256 = \(file-sha256 \$staged_path\)/)
  assert.match(source, /open-powerpoint-via-launch-services \$staged_path \$open_delay/)
  assert.match(source, /close-powerpoint-presentation \$prepared\.staged_path/)
  assert.doesNotMatch(source, /open-powerpoint-via-launch-services \$pptx_path \$open_delay/)
  assert.doesNotMatch(source, /close-powerpoint-presentation \$pptx_path/)
})
