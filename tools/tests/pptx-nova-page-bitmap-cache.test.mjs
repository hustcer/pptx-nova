import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { deflateSync } from 'node:zlib'
import {
  createPageBitmapCacheBinding,
  pageBitmapCacheMetrics,
  pageBitmapCachePath,
  snapshotPageBitmapCache,
} from '../../pptx-nova/scripts/lib/page-bitmap-cache.mjs'

function crc32(buffer) {
  let value = 0xffffffff
  for (const byte of buffer) {
    value ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
  }
  return (value ^ 0xffffffff) >>> 0
}

function writeRgbCache(path, binding, slide, rgb = Buffer.from([1, 2, 3])) {
  const compressed = deflateSync(rgb)
  const header = Buffer.alloc(68)
  header.write('XDRGB03\n', 0, 'ascii')
  header.writeUInt32LE(1, 8)
  header.writeUInt32LE(1, 12)
  header.writeUInt32LE(rgb.length, 16)
  header.writeUInt32LE(compressed.length, 20)
  header.writeUInt32LE(crc32(rgb), 24)
  header.writeUInt32LE(binding.dpi, 28)
  header.writeUInt32LE(slide, 32)
  Buffer.from(binding.identity, 'hex').copy(header, 36)
  writeFileSync(path, Buffer.concat([header, compressed]))
}

test('page bitmap cache key binds PPTX bytes, DPI, renderer bytes, and slide', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-page-cache-'))
  const cacheDir = join(root, 'cache')
  const deck = join(root, 'deck.pptx')
  const xdoc = join(root, 'xdoc')
  writeFileSync(deck, 'deck-v1')
  writeFileSync(xdoc, 'renderer-v1')

  const first = createPageBitmapCacheBinding({ cacheDir, pptxPath: deck, dpi: 192, xdocBin: xdoc })
  const same = createPageBitmapCacheBinding({ cacheDir, pptxPath: deck, dpi: 192, xdocBin: xdoc })
  const differentDpi = createPageBitmapCacheBinding({
    cacheDir,
    pptxPath: deck,
    dpi: 144,
    xdocBin: xdoc,
  })
  assert.equal(first.prefix, same.prefix)
  assert.notEqual(first.prefix, differentDpi.prefix)
  assert.match(pageBitmapCachePath(first, 9), /page-slide-000009\.rgbz$/)

  writeFileSync(xdoc, 'renderer-v2')
  const differentRenderer = createPageBitmapCacheBinding({
    cacheDir,
    pptxPath: deck,
    dpi: 192,
    xdocBin: xdoc,
  })
  assert.notEqual(first.rendererVersion, differentRenderer.rendererVersion)
  assert.notEqual(first.prefix, differentRenderer.prefix)

  writeFileSync(deck, 'deck-v2')
  const differentDeck = createPageBitmapCacheBinding({
    cacheDir,
    pptxPath: deck,
    dpi: 192,
    xdocBin: xdoc,
  })
  assert.notEqual(differentRenderer.pptxSha256, differentDeck.pptxSha256)
  assert.notEqual(differentRenderer.prefix, differentDeck.prefix)
})

test('page bitmap cache metrics distinguish existing hits from newly populated misses', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-page-cache-metrics-'))
  const deck = join(root, 'deck.pptx')
  const xdoc = join(root, 'xdoc')
  writeFileSync(deck, 'deck')
  writeFileSync(xdoc, 'renderer')
  const binding = createPageBitmapCacheBinding({
    cacheDir: join(root, 'cache'),
    pptxPath: deck,
    dpi: 192,
    xdocBin: xdoc,
  })
  writeRgbCache(pageBitmapCachePath(binding, 1), binding, 1)
  writeFileSync(pageBitmapCachePath(binding, 2), 'corrupt')
  const before = snapshotPageBitmapCache(binding, [1, 2])
  writeRgbCache(pageBitmapCachePath(binding, 2), binding, 2, Buffer.from([4, 5, 6]))
  const after = snapshotPageBitmapCache(binding, [1, 2])
  assert.deepEqual(pageBitmapCacheMetrics(binding, before, after), {
    schemaVersion: 'pptx-nova-page-bitmap-cache-key/v1',
    pptxSha256: binding.pptxSha256,
    dpi: 192,
    rendererVersion: binding.rendererVersion,
    requestedPageCount: 2,
    hitCount: 1,
    missCount: 1,
    populatedCount: 1,
    complete: true,
  })
})
