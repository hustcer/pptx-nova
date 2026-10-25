import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { auditExamplesLayout } from '../../lib/examples-layout.mjs'
import { selectGoldenCases } from '../../update-pptx-nova-deckkit-examples.mjs'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

test('golden showcase selection matches the committed manifest without dropping regression cases', () => {
  const root = join(repo, 'pptx-nova')
  const index = JSON.parse(readFileSync(join(root, 'benchmarks/visual/index.json'), 'utf8'))
  const manifest = JSON.parse(
    readFileSync(join(root, 'assets/examples/deckkits/manifest.json'), 'utf8'),
  )
  assert.deepEqual(
    selectGoldenCases(index)
      .map((c) => c.id)
      .sort(),
    manifest.examples.map((e) => e.caseId).sort(),
  )
  assert.ok(index.cases.some((c) => c.id === 'cartesian.native-exhibits'))
})
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'examples-layout-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return root
}

test('examples follow scenario ownership and every deck catalog path resolves', () => {
  const skill = join(repo, 'pptx-nova')
  assert.deepEqual(auditExamplesLayout(skill), [])
  const catalogRoot = join(skill, 'assets/decks')
  const catalog = JSON.parse(readFileSync(join(catalogRoot, 'catalog.json'), 'utf8'))
  for (const entry of catalog.entries)
    for (const key of ['path', 'preview', 'content', 'summary']) {
      if (entry[key]) assert.ok(existsSync(resolve(catalogRoot, entry[key])), `${entry.id}.${key}`)
    }
})

test('examples audit rejects files placed back at the root', (t) => {
  const root = fixture(t)
  const base = join(root, 'assets/examples')
  mkdirSync(base, { recursive: true })
  writeFileSync(join(base, 'README.md'), '')
  writeFileSync(join(base, 'orphan.patch.json'), '{}')
  assert.ok(auditExamplesLayout(root).some((i) => i.path.endsWith('orphan.patch.json')))
})

test('copied generator and adjacent themes build the same patch from another cwd', (t) => {
  const root = fixture(t)
  const run = join(root, 'run with spaces')
  mkdirSync(run)
  const source = join(repo, 'pptx-nova/assets/examples/generator')
  copyFileSync(join(source, 'deck-generator-template.mjs'), join(run, 'generate.mjs'))
  copyFileSync(join(source, 'theme-packs.generated.mjs'), join(run, 'theme-packs.generated.mjs'))
  const build = (file) => {
    const result = spawnSync(
      process.execPath,
      [file, '--layout', 'data-room', '--theme', 'minimal-mono'],
      { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
    )
    assert.equal(result.status, 0, result.stderr)
    return JSON.parse(result.stdout)
  }
  assert.deepEqual(
    build(join(run, 'generate.mjs')),
    build(join(source, 'deck-generator-template.mjs')),
  )
})

test('Justfile dispatcher forwards flags and spaced paths for every mode', (t) => {
  const root = fixture(t)
  const just = readFileSync(join(repo, 'Justfile'), 'utf8')
  const start = just.indexOf('    #!/usr/bin/env nu', just.indexOf('deckkit-examples *args:'))
  const end = just.indexOf('# Plugins', start)
  assert.ok(start >= 0 && end > start)
  const script = join(root, 'recipe.nu')
  writeFileSync(script, just.slice(start, end).replace(/^    /gm, ''))
  const parsed = spawnSync(
    'nu',
    ['--no-config-file', '-c', 'nu-check --debug $env.EXAMPLE_RECIPE'],
    { cwd: repo, env: { ...process.env, EXAMPLE_RECIPE: script }, encoding: 'utf8' },
  )
  assert.equal(parsed.status, 0, parsed.stderr)
  for (const mode of [[], ['update'], ['check']]) {
    const result = spawnSync(
      'nu',
      [
        '--no-config-file',
        script,
        ...mode,
        '-d',
        'unknown kit',
        '--tmp',
        join(root, 'scratch with spaces'),
        '--no-clean',
      ],
      { cwd: repo, encoding: 'utf8' },
    )
    assert.equal(result.status, 1)
    assert.match(result.stderr, /No golden case found for DeckKit "unknown kit"/)
    assert.ok(!existsSync(join(root, 'scratch with spaces')))
  }
  const benchmark = spawnSync(
    'nu',
    [
      '--no-config-file',
      script,
      'all',
      '-d',
      'unknown kit',
      '--out',
      join(root, 'benchmark with spaces'),
      '--json',
    ],
    { cwd: repo, encoding: 'utf8' },
  )
  assert.equal(benchmark.status, 1)
  assert.match(benchmark.stderr, /No benchmark cases matched the provided filters/)
})
