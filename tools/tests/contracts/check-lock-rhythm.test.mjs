import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const repoRoot = resolve('.')
const checkLockScript = join(repoRoot, 'pptx-nova', 'scripts', 'cli/create/check-lock.mjs')

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function checkSlide(overrides) {
  const dir = mkdtempSync(join(tmpdir(), 'pptx-nova-rhythm-'))
  const lockPath = join(dir, 'deck_lock.json')
  writeJson(lockPath, {
    schemaVersion: 'pptx-nova-deck-lock/v1',
    mode: 'studio',
    canvas: { format: 'ppt169' },
    deckkit: { id: 'cartesian' },
    typography: { body: 'Arial, sans-serif' },
    colors: { text: '111111' },
    deckProfile: { primary: 'general-business' },
    slides: [
      {
        slideType: 'cartesianStatementSlide',
        title: 'A supported claim',
        claimTitle: 'A supported claim',
        proofObject: { kind: 'statement' },
        rhythm: 'anchor',
        layoutIntent: 'statement',
        ...overrides,
      },
    ],
  })

  const result = spawnSync(process.execPath, [checkLockScript, '--lock', lockPath, '--json'], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 10000,
  })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return JSON.parse(result.stdout)
}

test('check-lock unknown rhythm reports the complete allowed vocabulary', () => {
  const report = checkSlide({ rhythm: 'structured' })
  const warning = report.warnings.find((item) => item.code === 'lock-slide-rhythm-unknown')

  assert.deepEqual(warning.allowedValues, ['anchor', 'dense', 'breathing', 'appendix'])
  assert.match(warning.message, /allowed values: anchor, dense, breathing, appendix/)
})

test('check-lock density warning supplies valid repair choices without rejecting the lock', () => {
  for (const field of ['visualDensity', 'density']) {
    const report = checkSlide({ [field]: 'structured' })
    const warning = report.warnings.find((item) => item.code === 'lock-slide-density-unknown')

    assert.deepEqual(warning.allowedValues, ['low', 'medium', 'high'])
    assert.match(warning.message, /allowed values: low, medium, high/)
    assert.deepEqual(report.errors, [])

    for (const value of warning.allowedValues) {
      const repaired = checkSlide({ [field]: value })
      assert.equal(
        repaired.warnings.some((item) => item.code === 'lock-slide-density-unknown'),
        false,
        `${field}=${value} should be accepted as a suggested repair`,
      )
    }
  }
})
