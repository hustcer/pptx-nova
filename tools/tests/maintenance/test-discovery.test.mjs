import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { discoverTests, selectTests } from '../../run-tests.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'nested-test-discovery-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const file of [
    'alpha/one.test.mjs',
    'alpha/nested/two.test.mjs',
    'beta/three.test.mjs',
    'fixtures/ignored.test.mjs',
    'helpers/ignored.test.mjs',
    '.scratch/ignored.test.mjs',
    'alpha/helper.mjs',
  ]) {
    const path = join(root, file)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, '')
  }
  return root
}

test('test discovery includes nested suites and excludes support directories', (t) => {
  const root = fixture(t)
  assert.deepEqual(
    discoverTests(root),
    ['alpha/one.test.mjs', 'alpha/nested/two.test.mjs', 'beta/three.test.mjs']
      .map((p) => join(root, p))
      .sort(),
  )
})

test('test selectors filter groups or exact files without duplication', (t) => {
  const root = fixture(t)
  assert.equal(selectTests(root, ['alpha']).length, 2)
  assert.equal(selectTests(root, ['alpha', 'alpha/nested/two.test.mjs']).length, 2)
  assert.deepEqual(selectTests(root, ['beta/three.test.mjs']), [join(root, 'beta/three.test.mjs')])
})

test('test selectors reject traversal, nonexistent files and support-only matches', (t) => {
  const root = fixture(t)
  assert.throws(() => selectTests(root, ['../']), /must stay under/)
  assert.throws(() => selectTests(root, ['missing.test.mjs']))
  assert.throws(() => selectTests(root, ['fixtures']), /No test files matched/)
})

test('test runner discovery works from another cwd', (t) => {
  const cwd = fixture(t)
  const result = spawnSync(
    process.execPath,
    [join(repoRoot, 'tools/run-tests.mjs'), '--list', 'workflows'],
    { cwd, encoding: 'utf8' },
  )
  assert.equal(result.status, 0, result.stderr)
  const files = result.stdout.trim().split('\n')
  assert.ok(files.length > 0)
  assert.ok(files.every((p) => p.startsWith('tools/tests/workflows/') && p.endsWith('.test.mjs')))
})
