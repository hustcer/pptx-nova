import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'
import { auditDeckkitLayout } from '../../lib/deckkit-layout.mjs'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'deckkit-layout-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const base = join(root, 'assets/deckkits')
  const write = (path, content = '') => {
    const target = join(base, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content)
  }
  for (const path of [
    'README.md',
    'validate-content.mjs',
    'schemas/content.schema.json',
    'schemas/design.schema.json',
    'shared/helper.mjs',
    'sample/sample.kit.mjs',
    'sample/design.json',
    'sample/intent.md',
    'sample/layouts.mjs',
    'sample/schemas/sampleSlide.schema.json',
    'sample/examples/content.json',
    'sample/examples/build.mjs',
  ])
    write(path)
  const catalog = {
    entries: [
      {
        id: 'sample',
        path: 'sample/sample.kit.mjs',
        designContract: 'sample/design.json',
        supportedSlideTypes: ['sampleSlide'],
        examples: ['sample/examples/content.json'],
      },
    ],
  }
  const saveCatalog = () => write('catalog.json', JSON.stringify(catalog))
  saveCatalog()
  return { root, write, catalog, saveCatalog }
}

test('all bundled DeckKits follow the directory policy', () => {
  assert.deepEqual(auditDeckkitLayout(join(repo, 'pptx-nova')), [])
})

test('showcase provenance uses live source paths and manifest hashes match bundled files', () => {
  const base = join(repo, 'pptx-nova/assets/examples/deckkits')
  const manifest = JSON.parse(readFileSync(join(base, 'manifest.json'), 'utf8'))
  for (const entry of manifest.examples) {
    for (const file of Object.values(entry.files)) {
      const bytes = readFileSync(join(base, file.path))
      assert.equal(bytes.length, file.bytes, file.path)
      assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.path)
    }
    const summary = JSON.parse(readFileSync(join(base, entry.files.summary.path), 'utf8'))
    for (const source of Object.values(summary.source)) readFileSync(resolve(repo, source))
  }
})

test('all example CLIs resolve adjacent content from an unrelated working directory', async (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'deckkit-example-cli-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  const base = join(repo, 'pptx-nova/assets/deckkits')
  const catalog = JSON.parse(readFileSync(join(base, 'catalog.json'), 'utf8'))
  for (const entry of catalog.entries) {
    const result = spawnSync(process.execPath, [join(base, entry.id, 'examples/build.mjs')], {
      cwd,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    })
    assert.equal(result.status, 0, `${entry.id}: ${result.stderr}`)
    const content = JSON.parse(readFileSync(join(base, entry.id, 'examples/content.json'), 'utf8'))
    const { createDeck } = await import(pathToFileURL(join(base, entry.path)))
    assert.deepEqual(JSON.parse(result.stdout), createDeck(content).patch, entry.id)
  }
})

test('directory audit rejects scattered modules and schemas', (t) => {
  const f = fixture(t)
  assert.deepEqual(auditDeckkitLayout(f.root), [])
  f.write('sample-components.mjs')
  f.write('schemas/sample/sampleSlide.schema.json')
  f.write('sample/sample-layouts.mjs')
  assert.equal(auditDeckkitLayout(f.root).length, 3)
})

test('directory audit rejects stale catalog locations and missing suite schemas', (t) => {
  const f = fixture(t)
  f.catalog.entries[0].path = 'sample.kit.mjs'
  f.catalog.entries[0].examples = ['examples/sample-content.json']
  f.catalog.entries[0].supportedSlideTypes.push('missingSlide')
  f.saveCatalog()
  const issues = auditDeckkitLayout(f.root)
  assert.equal(issues.length, 3)
  assert.ok(issues.some((i) => i.path.endsWith('missingSlide.schema.json')))
})

test('suite helpers cannot import another suite directly', (t) => {
  const f = fixture(t)
  f.catalog.entries.push({
    ...f.catalog.entries[0],
    id: 'other',
    path: 'other/other.kit.mjs',
    designContract: 'other/design.json',
    examples: [],
  })
  f.saveCatalog()
  f.write('sample/layouts.mjs', "import { helper } from '../other/layouts.mjs'\n")
  assert.ok(auditDeckkitLayout(f.root).some((i) => i.message.includes('not import another suite')))
})
