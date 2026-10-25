import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { resolveFilesystemPath } from '../../../pptx-nova/scripts/lib/runtime/filesystem-paths.mjs'

test('filesystem paths select the OS target and preserve literal POSIX backslashes', (t) => {
  if (process.platform === 'win32') return t.skip('POSIX filesystem contract')
  const root = mkdtempSync(join(tmpdir(), 'nova-filesystem-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(join(root, 'real', 'child'), { recursive: true })
  symlinkSync(join(root, 'real', 'child'), join(root, 'link'))
  writeFileSync(join(root, 'file'), 'decoy')
  writeFileSync(join(root, 'real', 'file'), 'expected')
  assert.equal(readFileSync(resolveFilesystemPath('link/../file', root), 'utf8'), 'expected')
  const output = resolveFilesystemPath('link/../new/literal\\output.pptx', root)
  mkdirSync(join(root, 'real', 'new'))
  writeFileSync(output, 'candidate')
  assert.equal(readFileSync(join(root, 'real', 'new', 'literal\\output.pptx'), 'utf8'), 'candidate')
  for (const path of ['missing/../file', 'missing/child/../../file', 'file/../new'])
    assert.throws(() => resolveFilesystemPath(path, root), {
      code: path.startsWith('file/') ? 'ENOTDIR' : 'ENOENT',
    })
})
