import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { auditScriptsLayout } from '../../lib/scripts-layout.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'script-layout-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const write = (file, source = '') => {
    const path = join(root, 'scripts', file)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, source)
  }
  for (const file of ['README.md', 'cli/runtime/probe.mjs', 'lib/runtime/state.mjs']) write(file)
  return { root, write }
}

test('published CLI and library directories follow the runtime layout policy', () => {
  assert.deepEqual(auditScriptsLayout(join(repoRoot, 'pptx-nova')), [])
})

test('test files stay in domain groups and all repository entry points use recursive discovery', () => {
  const root = join(repoRoot, 'tools/tests')
  const allowed = new Set([
    'contracts',
    'deckkits',
    'evidence',
    'maintenance',
    'runtime',
    'workflows',
    'helpers',
    'fixtures',
  ])
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    assert.ok(
      entry.isDirectory() ? allowed.has(entry.name) : entry.name === 'README.md',
      entry.name,
    )
  }
  for (const file of ['.github/workflows/ci.yml', 'Justfile', 'CONTRIBUTING.md']) {
    const source = readFileSync(join(repoRoot, file), 'utf8')
    assert.ok(source.includes('node tools/run-tests.mjs'), file)
    assert.ok(!source.includes('tools/tests/*.test.mjs'), file)
  }
})

test('runtime audit rejects ungrouped scripts and legacy name prefixes', (t) => {
  const f = fixture(t)
  assert.deepEqual(auditScriptsLayout(f.root), [])
  f.write('old.mjs')
  f.write('cli/runtime/pptx-nova-old.mjs')
  assert.equal(auditScriptsLayout(f.root).length, 2)
})

test('runtime audit rejects library CLI execution, CLI dependencies and broken imports', (t) => {
  const f = fixture(t)
  f.write(
    'lib/runtime/state.mjs',
    "import '../../cli/runtime/probe.mjs'\nimport { absent } from './missing.mjs'\nif (process.argv[1]) {}\n",
  )
  const issues = auditScriptsLayout(f.root)
  assert.ok(issues.some((i) => i.message.includes('must not execute')))
  assert.ok(issues.some((i) => i.message.includes('does not exist')))
  // Use a named import to exercise the same static-import seam as real modules.
  f.write('lib/runtime/state.mjs', "import { probe } from '../../cli/runtime/probe.mjs'\n")
  assert.ok(auditScriptsLayout(f.root).some((i) => i.message.includes('must not depend')))
})
