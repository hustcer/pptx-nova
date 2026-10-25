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
import { dirname, join } from 'node:path'
import test from 'node:test'
import { repoRoot, skillRoot } from '../helpers/common.mjs'

const script = join(repoRoot, 'tools/list-deckkits.nu')
const examples = 'pptx-nova/assets/examples/deckkits'

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'deckkit list '))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const write = (file, value) => {
    const path = join(root, file)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value))
  }
  return { root, write }
}

function run(file, cwd, args = ['--json']) {
  const parsed = spawnSync('nu', ['--no-config-file', '-c', 'nu-check --debug $env.LIST_SCRIPT'], {
    cwd,
    env: { ...process.env, LIST_SCRIPT: file },
    encoding: 'utf8',
  })
  assert.equal(parsed.status, 0, parsed.stderr)
  const result = spawnSync('nu', ['--no-config-file', file, ...args], { cwd, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout
}

test('DeckKit listing joins the live catalog and showcase manifest from another cwd', (t) => {
  const { root } = fixture(t)
  const rows = JSON.parse(run(script, root))
  const catalog = JSON.parse(readFileSync(join(skillRoot, 'assets/deckkits/catalog.json')))
  const manifest = JSON.parse(readFileSync(join(repoRoot, examples, 'manifest.json')))
  assert.deepEqual(
    rows.map((row) => row.id),
    catalog.entries.map((entry) => entry.id).sort(),
  )
  for (const entry of catalog.entries) {
    const row = rows.find((item) => item.id === entry.id)
    const example = manifest.examples.find((item) => item.deckkit === entry.id)
    const asset = (kind) =>
      example?.files?.[kind]?.path ? join(examples, example.files[kind].path) : null
    assert.equal(row.readiness, entry.readiness)
    assert.equal(row.version, entry.version)
    assert.equal(row.slide_types, entry.supportedSlideTypes.length)
    assert.equal(row.pptx, asset('deck'))
    assert.equal(row.preview, asset('contactSheet'))
    assert.equal(row.content, asset('content'))
    assert.equal(
      row.example_status,
      !row.pptx ? 'unregistered' : existsSync(join(repoRoot, row.pptx)) ? 'available' : 'missing',
    )
  }
})

test('DeckKit listing retains candidates and defaults and discloses absent examples', (t) => {
  const { root, write } = fixture(t)
  const copied = join(root, 'tools/list-deckkits.nu')
  write('tools/list-deckkits.nu', '')
  copyFileSync(script, copied)
  write('pptx-nova/assets/deckkits/catalog.json', {
    entries: [
      { id: 'candidate-kit', readiness: 'candidate', version: '0.1.0' },
      { id: 'default-kit', readiness: 'default', version: '2.0.0', supportedSlideTypes: ['cover'] },
      { id: 'missing-kit', readiness: 'production', version: '1.0.0' },
    ],
  })
  write(`${examples}/manifest.json`, {
    examples: [
      {
        deckkit: 'default-kit',
        readiness: 'candidate',
        files: { deck: { path: 'folder with spaces/sample.pptx' } },
      },
      { deckkit: 'missing-kit', files: { deck: { path: 'missing/deck.pptx' } } },
    ],
  })
  write(`${examples}/folder with spaces/sample.pptx`, '')
  const rows = JSON.parse(run(copied, tmpdir()))
  assert.deepEqual(
    rows.map((row) => row.example_status),
    ['unregistered', 'available', 'missing'],
  )
  assert.equal(rows[0].readiness, 'candidate')
  assert.equal(rows[0].pptx, null)
  assert.equal(rows[0].slide_types, 0)
  assert.equal(rows[1].readiness, 'default')
  assert.equal(rows[1].slide_types, 1)
  assert.equal(rows[1].pptx, join(examples, 'folder with spaces/sample.pptx'))
  assert.equal(rows[1].preview, null)
  assert.equal(rows[1].content, null)
  const table = run(copied, tmpdir(), [])
  assert.match(table, /not registered/)
  assert.match(table, /missing:/)
})

test('just list forwards JSON arguments and preserves failures', (t) => {
  if (spawnSync('just', ['--version']).status !== 0) return t.skip('just unavailable')
  const { root } = fixture(t)
  const invoke = (args) =>
    spawnSync('just', ['--justfile', join(repoRoot, 'Justfile'), 'list', ...args], {
      cwd: root,
      encoding: 'utf8',
    })
  const result = invoke(['--json'])
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout), JSON.parse(run(script, root)))
  assert.notEqual(invoke(['--unknown-option']).status, 0)
})
