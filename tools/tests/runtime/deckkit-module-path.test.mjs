import assert from 'node:assert/strict'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { deckkitModulePath } from '../../../pptx-nova/scripts/lib/deckkits/module-path.mjs'
import { skillPath } from '../helpers/common.mjs'

const entry = { id: 'sample', path: 'sample/sample.kit.mjs' }

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'nova-module-path-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const root = join(dir, 'deckkits')
  mkdirSync(join(root, 'sample'), { recursive: true })
  return { dir, root, module: join(root, 'sample', 'sample.kit.mjs') }
}

function symlink(t, target, link, type = 'file') {
  try {
    symlinkSync(target, link, process.platform === 'win32' && type === 'dir' ? 'junction' : type)
    return true
  } catch (error) {
    if (process.platform === 'win32' && error.code === 'EPERM') {
      t.skip('Symlink creation requires Windows developer mode or elevation')
      return false
    }
    throw error
  }
}

test('all registered DeckKit entry modules remain loadable through the path guard', () => {
  const root = skillPath('assets/deckkits')
  const catalog = JSON.parse(readFileSync(join(root, 'catalog.json'), 'utf8'))
  for (const item of catalog.entries)
    assert.equal(deckkitModulePath(item), realpathSync.native(join(root, item.path)), item.id)
})

test('module path rejects unregistered shapes, URL imports and traversal before file access', (t) => {
  const f = fixture(t)
  for (const id of [
    '',
    '../sample',
    '/sample',
    'sample/other',
    'file:sample',
    'sample\\other',
    'Sample',
  ])
    assert.throws(() => deckkitModulePath({ ...entry, id }, f.root), /kebab-case/)
  for (const path of [
    '../outside.mjs',
    '/outside.mjs',
    'sample/../outside.mjs',
    'sample/other.kit.mjs',
    'https://example.invalid/kit.mjs',
    'data:text/javascript,export default 1',
    'sample\\sample.kit.mjs',
  ])
    assert.throws(() => deckkitModulePath({ ...entry, path }, f.root), /module path must be/)
  assert.throws(() => deckkitModulePath(null, f.root), /registered/)
})

test('module must exist and be a regular file', (t) => {
  const f = fixture(t)
  assert.throws(() => deckkitModulePath(entry, f.root), { code: 'ENOENT' })
  mkdirSync(f.module)
  assert.throws(() => deckkitModulePath(entry, f.root), /regular file/)
})

test('module symlinks cannot leave the owning kit, including sibling kit prefixes', (t) => {
  const f = fixture(t)
  const sibling = join(f.root, 'sample-extra')
  mkdirSync(sibling)
  const outside = join(sibling, 'outside.mjs')
  writeFileSync(outside, 'throw new Error("This fixture must never be imported")')
  if (!symlink(t, outside, f.module)) return
  assert.throws(() => deckkitModulePath(entry, f.root), /inside its bundled directory/)
})

test('kit directory symlinks cannot escape the installed DeckKit root', (t) => {
  const f = fixture(t)
  const outside = join(f.dir, 'outside')
  mkdirSync(outside)
  writeFileSync(join(outside, 'alias.kit.mjs'), '')
  if (!symlink(t, outside, join(f.root, 'alias'), 'dir')) return
  assert.throws(
    () => deckkitModulePath({ id: 'alias', path: 'alias/alias.kit.mjs' }, f.root),
    /inside its bundled directory/,
  )
})

test('installed root aliases and module links inside the same kit remain supported', (t) => {
  const f = fixture(t)
  const actual = join(f.root, 'sample', 'implementation.mjs')
  writeFileSync(actual, 'export const createDeck = () => ({ ops: [] })')
  if (!symlink(t, actual, f.module)) return
  const alias = join(f.dir, 'installed-skill-alias')
  if (!symlink(t, f.root, alias, 'dir')) return
  assert.equal(deckkitModulePath(entry, alias), realpathSync.native(actual))
})
