import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

export const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))

export const skillRoot = join(repoRoot, 'pptx-nova')

export function runNode(args, options = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    ...options,
  })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return result
}

export function runNodeStatus(args, expectedStatus, options = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    ...options,
  })
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout)
  return result
}

export function skillPath(path) {
  return join(skillRoot, path)
}

export function skillUrl(path) {
  return pathToFileURL(skillPath(path)).href
}

export function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

export function fileIdentity(path) {
  const bytes = readFileSync(path)
  return {
    path,
    byteLength: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }
}
