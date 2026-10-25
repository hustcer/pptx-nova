import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

const repository = resolve('.')
const gateScript = join(repository, 'pptx-nova/scripts/cli/review/visual-evidence-gate.mjs')

function writeManifest(root, action, assurance, policyOutcome, checkOverrides = {}) {
  const path = join(root, `${action}.json`)
  const checks = [
    { id: 'input-integrity', required: true, outcome: 'pass' },
    { id: 'static-layout', required: true, outcome: 'pass' },
    { id: 'pdf-final-layout', required: true, outcome: 'pass' },
    { id: 'pdfium-raster', required: true, outcome: 'pass' },
    { id: 'pixel-diff', required: true, outcome: 'pass' },
    { id: 'ocr-overflow', required: false, outcome: 'skipped' },
    { id: 'font-resolution', required: false, outcome: 'skipped' },
    { id: 'region-attribution', required: false, outcome: 'skipped' },
    { id: 'independent-reference', required: false, outcome: 'skipped' },
    { id: 'policy', required: true, outcome: policyOutcome },
  ].map((check) => ({
    ...check,
    ...(checkOverrides[check.id] ? { outcome: checkOverrides[check.id] } : {}),
  }))
  writeFileSync(
    path,
    `${JSON.stringify(
      {
        schemaVersion: 'pptx-visual-evidence/v1',
        status: 'success',
        checks,
        decision: { action, assurance, reasons: [] },
      },
      null,
      2,
    )}\n`,
  )
  return path
}

function runGate(manifest, expectedStatus, output = '') {
  const args = [gateScript, '--manifest', manifest, '--json']
  if (output) args.push('--output', output)
  const result = spawnSync(process.execPath, args, {
    cwd: repository,
    encoding: 'utf8',
  })
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout)
  return JSON.parse(result.stdout)
}

test('visual evidence consumer authorizes only canonical proceed decisions', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-visual-gate-'))
  const output = join(root, 'gate.json')
  const proceed = runGate(
    writeManifest(root, 'proceed', 'same-renderer-regression', 'pass'),
    0,
    output,
  )
  assert.equal(proceed.status, 'passed')
  assert.equal(proceed.deliveryAuthorized, true)
  assert.deepEqual(JSON.parse(readFileSync(output, 'utf8')), proceed)

  const stopped = runGate(
    writeManifest(root, 'stop', 'content-blocked', 'fail', {
      'static-layout': 'fail',
    }),
    4,
  )
  assert.equal(stopped.status, 'blocked')
  assert.equal(stopped.deliveryAuthorized, false)

  const review = runGate(
    writeManifest(root, 'require-human-confirmation', 'candidate-only', 'inconclusive'),
    5,
  )
  assert.equal(review.status, 'review-required')
  assert.equal(review.deliveryAuthorized, false)

  const reviewWithRequiredFinding = runGate(
    writeManifest(
      root,
      'require-human-confirmation',
      'same-renderer-change-detected',
      'inconclusive',
      { 'static-layout': 'fail' },
    ),
    5,
  )
  assert.equal(reviewWithRequiredFinding.status, 'review-required')
  assert.equal(reviewWithRequiredFinding.deliveryAuthorized, false)
})

test('visual evidence consumer rejects inconsistent manifests fail closed', () => {
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-visual-gate-invalid-'))
  const invalid = writeManifest(root, 'proceed', 'same-renderer-regression', 'pass', {
    'pdfium-raster': 'skipped',
  })
  const report = runGate(invalid, 3)
  assert.equal(report.status, 'invalid')
  assert.equal(report.deliveryAuthorized, false)
  assert.ok(report.errors.some((error) => error.includes('required check pdfium-raster')))

  const incompleteRegistry = writeManifest(
    root,
    'require-human-confirmation',
    'candidate-only',
    'inconclusive',
  )
  const incomplete = JSON.parse(readFileSync(incompleteRegistry, 'utf8'))
  incomplete.checks = incomplete.checks.filter((check) => check.id !== 'font-resolution')
  writeFileSync(incompleteRegistry, `${JSON.stringify(incomplete, null, 2)}\n`)
  const incompleteReport = runGate(incompleteRegistry, 3)
  assert.ok(incompleteReport.errors.some((error) => error.includes('check registry')))
})
