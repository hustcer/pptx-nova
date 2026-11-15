import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, writeFileSync, readFileSync, symlinkSync, linkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  createNativeArtwork,
  createNativeArtworkPatch,
  NATIVE_ARTWORK_KINDS,
  ARTWORK_PATH_NAMES,
} from '../../../pptx-nova/assets/deckkits/shared/native-artwork.mjs'

test('shared native artwork adapts to unrelated palettes, aspect ratios and object owners', () => {
  for (const frame of [
    [1, 1, 2, 3],
    [0.5, 2, 5, 1.4],
  ])
    for (const palette of [
      { surface: 'EFEBE5', ink: '246B81', accent: 'F8AA98', secondary: 'F8DFD7' },
      { surface: 'FFFFFF', ink: '203D2C', accent: 'D89A31', secondary: 'E3EBDD' },
    ])
      for (const kind of NATIVE_ARTWORK_KINDS) {
        const spec = { slide: 2, frame, kind, palette, prefix: 'ExampleOwner' }
        const patch = createNativeArtworkPatch(spec)
        assert.deepEqual(patch, createNativeArtworkPatch(structuredClone(spec)))
        assert.ok(patch.ops.length >= 6)
        assert.ok(
          patch.ops.every((op) => op.slide === 2 && ['add-freeform', 'set-shape'].includes(op.op)),
        )
        for (const op of patch.ops.filter((op) => op.op === 'set-shape')) {
          for (const color of [op.fill.color, op.line.color].filter(Boolean))
            assert.ok(Object.values(palette).includes(color))
        }
        const cs = createNativeArtwork({ frame, kind })
        assert.equal(new Set(cs.map((c) => c.name)).size, cs.length)
        assert.ok(cs.every((c) => ARTWORK_PATH_NAMES.has(c.name)))
        for (const c of cs) {
          assert.deepEqual(c.frame, frame)
          for (const cmd of c.path.commands)
            for (const [key, value] of Object.entries(cmd))
              if (key !== 'type')
                assert.ok(Number.isInteger(value) && value >= 0 && value <= 100000)
        }
      }
})

test('shared native artwork rejects invalid geometry, styling and patch targets', () => {
  const valid = {
    slide: 0,
    frame: [1, 1, 3, 2],
    kind: 'documents',
    palette: { surface: 'FFFFFF', ink: '112233', accent: 'AABBCC', secondary: 'DDEEFF' },
  }
  for (const change of [
    { slide: -1 },
    { slide: 1.2 },
    { kind: 'photograph' },
    { frame: [0, 0, 0, 2] },
    { frame: [0, NaN, 2, 2] },
    { linePt: 0 },
    { accentPt: Infinity },
    { palette: {} },
    { prefix: 'bad/name' },
  ])
    assert.throws(() => createNativeArtworkPatch({ ...valid, ...change }))
})

test('shared artwork components support multiple illustration regions on the same slide', () => {
  const all = ['LeftArt_', 'RightArt_'].flatMap((prefix) =>
    createNativeArtwork({ frame: [1, 1, 2, 2], kind: 'documents', prefix }),
  )
  assert.equal(new Set(all.map((c) => c.name)).size, all.length)
})

test('shared artwork CLI works without a selected DeckKit and preserves occupied output paths', () => {
  const root = mkdtempSync(join(tmpdir(), 'native-artwork-')),
    spec = join(root, 'spec.json'),
    output = join(root, 'patch.json')
  writeFileSync(
    spec,
    JSON.stringify({
      slide: 0,
      frame: [1, 1, 3, 2],
      kind: 'connections',
      palette: { surface: 'FFFFFF', ink: '112233', accent: 'AABBCC', secondary: 'DDEEFF' },
    }),
  )
  const args = [
    'pptx-nova/scripts/cli/assets/native-artwork.mjs',
    '--spec',
    spec,
    '--output',
    output,
  ]
  const first = spawnSync(process.execPath, args, { encoding: 'utf8' })
  assert.equal(first.status, 0, first.stderr)
  const before = readFileSync(output)
  assert.ok(JSON.parse(before).ops.length > 0)
  assert.equal(spawnSync(process.execPath, args, { encoding: 'utf8' }).status, 1)
  assert.deepEqual(readFileSync(output), before)
})

test('shared artwork CLI refuses an output symlink that aliases its input', (t) => {
  if (process.platform === 'win32') return t.skip('POSIX symlink test')
  const root = mkdtempSync(join(tmpdir(), 'native-artwork-alias-')),
    spec = join(root, 'spec.json'),
    output = join(root, 'alias.json')
  const original = '{"slide":0}'
  writeFileSync(spec, original)
  symlinkSync(spec, output)
  const result = spawnSync(
    process.execPath,
    [
      'pptx-nova/scripts/cli/assets/native-artwork.mjs',
      '--spec',
      spec,
      '--output',
      output,
      '--overwrite',
    ],
    { encoding: 'utf8' },
  )
  assert.equal(result.status, 1)
  assert.match(result.stderr, /alias/)
  assert.equal(readFileSync(spec, 'utf8'), original)
})

test('shared artwork CLI refuses an output hard link that aliases its input', () => {
  const root = mkdtempSync(join(tmpdir(), 'native-artwork-hardlink-')),
    spec = join(root, 'spec.json'),
    output = join(root, 'alias.json')
  const original = JSON.stringify({
    slide: 0,
    frame: [1, 1, 3, 2],
    kind: 'documents',
    palette: { surface: 'FFFFFF', ink: '112233', accent: 'AABBCC', secondary: 'DDEEFF' },
  })
  writeFileSync(spec, original)
  linkSync(spec, output)
  const result = spawnSync(
    process.execPath,
    [
      'pptx-nova/scripts/cli/assets/native-artwork.mjs',
      '--spec',
      spec,
      '--output',
      output,
      '--overwrite',
    ],
    { encoding: 'utf8' },
  )
  assert.equal(result.status, 1)
  assert.match(result.stderr, /alias/)
  assert.equal(readFileSync(spec, 'utf8'), original)
  assert.equal(readFileSync(output, 'utf8'), original)
})
