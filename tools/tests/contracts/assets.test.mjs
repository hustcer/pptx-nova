import assert from 'node:assert/strict'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { runNode, runNodeStatus, skillPath, skillUrl, writeJson } from '../helpers/common.mjs'
import { cartesianImageContent } from '../helpers/asset-fixtures.mjs'

test('cartesian image stats keeps the crossed shell when no asset is bound', async () => {
  const { createDeck } = await import(skillUrl('assets/deckkits/cartesian/cartesian.kit.mjs'))
  const result = createDeck(cartesianImageContent())
  const connectors = result.patch.ops.filter((op) => op.op === 'add-connector')
  const images = result.patch.ops.filter((op) => op.op === 'add-image')

  assert.equal(connectors.length, 2)
  assert.equal(images.length, 0)
})

test('core image crop builder emits the canonical set-image operation', async () => {
  const { createOps } = await import(skillUrl('assets/deckkits/shared/core-primitives.kit.mjs'))
  const builder = createOps()
  builder.setImageCrop(2, 'Hero', { left: 0.08, right: 0.12, top: 0.03 })

  assert.deepEqual(builder.ops, [
    {
      op: 'set-image',
      slide: 2,
      shape: { name: 'Hero' },
      crop: { left: 0.08, right: 0.12, top: 0.03 },
    },
  ])
})

test('cartesian image stats injects a manifest-relative image with contain geometry', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-cartesian-assets-'))
  const assetsDir = join(root, 'assets')
  const contentPath = join(root, 'content.json')
  const manifestPath = join(root, 'assets_manifest.json')
  const patchPath = join(root, 'patch.json')
  const qualityPath = join(root, 'quality.json')
  mkdirSync(assetsDir, { recursive: true })
  writeFileSync(
    join(assetsDir, 'editorial.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><rect width="1600" height="900" fill="#665D56"/></svg>',
  )
  writeJson(contentPath, cartesianImageContent({ 'image.editorial': 'editorial_reference' }))
  writeJson(manifestPath, {
    schemaVersion: 'pptx-nova-assets-manifest/v1',
    assetRoot: 'assets',
    entries: [
      {
        id: 'editorial_reference',
        kind: 'image',
        status: 'generated',
        path: 'editorial.svg',
        pptxUse: {
          slotId: 'image.editorial',
          ratio: '16:9',
          fitPolicy: 'contain',
        },
      },
    ],
  })

  runNode([
    skillPath('scripts/cli/create/build.mjs'),
    '--deckkit',
    'cartesian',
    '--assets',
    manifestPath,
    contentPath,
    '-o',
    patchPath,
    '--quality-json',
    qualityPath,
  ])
  const patch = JSON.parse(readFileSync(patchPath, 'utf8'))
  const image = patch.ops.find((op) => op.op === 'add-image')
  const crop = patch.ops.find((op) => op.op === 'set-image')
  const connectors = patch.ops.filter((op) => op.op === 'add-connector')

  assert.ok(image)
  assert.deepEqual(image.assetSource, {
    path: 'assets/editorial.svg',
    mimeType: 'image/svg+xml',
  })
  assert.deepEqual(
    { x: image.x, y: image.y, w: image.w, h: image.h },
    { x: '0.61in', y: '2.16375in', w: '5.64in', h: '3.1725in' },
  )
  assert.equal(crop, undefined)
  assert.equal(connectors.length, 0)
})

test('build and asset context preserve POSIX symlink parent traversal', async (t) => {
  if (process.platform === 'win32') return t.skip('POSIX filesystem contract')
  const root = mkdtempSync(join(tmpdir(), 'nova-build-path-'))
  const actual = join(root, 'real')
  mkdirSync(join(actual, 'child'), { recursive: true })
  symlinkSync(join(actual, 'child'), join(root, 'link'))
  writeFileSync(
    join(actual, 'image.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"/>',
  )
  const manifest = {
    schemaVersion: 'pptx-nova-assets-manifest/v1',
    entries: [{ id: 'picture', kind: 'image', path: 'image.svg', pptxUse: { ratio: '16:9' } }],
  }
  writeJson(join(actual, 'assets.json'), manifest)
  writeJson(join(actual, 'content.json'), cartesianImageContent({ 'image.editorial': 'picture' }))
  const parent = `${root}/link/..`
  runNode([
    skillPath('scripts/cli/create/build.mjs'),
    `${parent}/content.json`,
    '--assets',
    `${parent}/assets.json`,
    '-o',
    `${parent}/new/patch.json`,
  ])
  assert.equal(existsSync(join(root, 'new')), false)
  const patch = JSON.parse(readFileSync(join(actual, 'new', 'patch.json'), 'utf8'))
  assert.equal(patch.ops.find((op) => op.op === 'add-image').assetSource.path, 'image.svg')
  const { createAssetContext } = await import(skillUrl('scripts/lib/assets/asset-manifest.mjs'))
  const asset = createAssetContext(manifest, `${parent}/assets.json`).get('picture')
  assert.deepEqual(readFileSync(asset.absolutePath), readFileSync(join(actual, 'image.svg')))
})

test('cartesian image stats gives a self-repairing error when assets are omitted', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-cartesian-assets-missing-'))
  const contentPath = join(root, 'content.json')
  const patchPath = join(root, 'patch.json')
  writeJson(contentPath, cartesianImageContent({ 'image.editorial': 'editorial_reference' }))

  const result = runNodeStatus(
    [
      skillPath('scripts/cli/create/build.mjs'),
      '--deckkit',
      'cartesian',
      contentPath,
      '-o',
      patchPath,
    ],
    1,
  )
  assert.match(
    result.stderr,
    /no assets manifest was provided; pass --assets assets_manifest\.json/,
  )
})

test('asset manifest ignores unrelated non-image entries and blocks paths outside assetRoot', async () => {
  const { createAssetContext } = await import(skillUrl('scripts/lib/assets/asset-manifest.mjs'))
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-assets-manifest-'))
  const assetsDir = join(root, 'assets')
  const outsidePath = join(root, 'outside.svg')
  const manifestPath = join(root, 'assets_manifest.json')
  mkdirSync(assetsDir, { recursive: true })
  writeFileSync(join(assetsDir, 'editorial.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
  writeFileSync(outsidePath, '<svg xmlns="http://www.w3.org/2000/svg"/>')
  const context = createAssetContext(
    {
      schemaVersion: 'pptx-nova-assets-manifest/v1',
      assetRoot: 'assets',
      entries: [
        { id: 'formula-1', kind: 'formula', status: 'rendered', path: 'formula.svg' },
        {
          id: 'editorial',
          kind: 'image',
          path: 'editorial.svg',
          pptxUse: { ratio: '16:9', fitPolicy: 'contain' },
        },
      ],
    },
    manifestPath,
  )
  assert.equal(
    context.resolveImageSlot({ imageSlots: { 'image.editorial': 'editorial' } }, 'image.editorial')
      .path,
    'assets/editorial.svg',
  )

  assert.throws(
    () =>
      createAssetContext(
        {
          schemaVersion: 'pptx-nova-assets-manifest/v1',
          assetRoot: 'assets',
          entries: [
            {
              id: 'escape',
              kind: 'image',
              path: '../outside.svg',
              pptxUse: { ratio: '16:9', fitPolicy: 'contain' },
            },
          ],
        },
        manifestPath,
      ).resolveImageSlot({ imageSlots: { 'image.editorial': 'escape' } }, 'image.editorial'),
    /outside the manifest assetRoot/,
  )
})
