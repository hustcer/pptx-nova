import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const repoRoot = resolve('.')
const gateScript = join(repoRoot, 'pptx-nova/scripts/pptx-nova-copy-size-gate.mjs')

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function fixture({ mismatch = false, stale = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'pptx-nova-copy-size-gate-test-'))
  const target = join(dir, 'target.pptx')
  const donor = join(dir, mismatch ? 'donor-mismatch.pptx' : 'donor-same.pptx')
  const copyReport = join(dir, 'copy-report.json')
  const fakeXdoc = join(dir, 'xdoc-fixture.mjs')
  writeFileSync(target, 'target-deck-bytes')
  writeFileSync(donor, mismatch ? 'mismatch-donor-bytes' : 'same-donor-bytes')
  writeFileSync(
    fakeXdoc,
    `#!/usr/bin/env node
const deck = process.argv[4] ?? ''
const mismatch = deck.includes('donor-mismatch')
process.stdout.write(JSON.stringify({
  status: 'success',
  presentation: {
    slideSize: mismatch
      ? { wEmu: 13439775, hEmu: 7559675 }
      : { wEmu: 12192000, hEmu: 6858000 },
  },
}))
`,
  )
  writeJson(copyReport, {
    schemaVersion: 'pptx-copy-from/v2',
    status: 'ready',
    transaction: {
      rollbackBoundary: 'entire-copy-batch',
      sourceSlides: [2],
      targetSlideCountBefore: 10,
      targetSlideCountAfter: 11,
    },
    preflight: {
      ready: true,
      readOnly: true,
      strategy: { template: 'register-source', slideSize: 'require-match' },
      templates: [
        {
          sourceSlides: [2],
          outcome: 'reused-source',
          layout: {
            sourcePartName: 'ppt/slideLayouts/slideLayout1.xml',
            targetPartName: 'ppt/slideLayouts/slideLayout1.xml',
            fingerprint: 'c'.repeat(64),
            registrationId: null,
            relationshipId: null,
          },
          master: {
            sourcePartName: 'ppt/slideMasters/slideMaster1.xml',
            targetPartName: 'ppt/slideMasters/slideMaster1.xml',
            fingerprint: 'd'.repeat(64),
            registrationId: null,
            relationshipId: null,
          },
          theme: {
            sourcePartName: 'ppt/theme/theme1.xml',
            targetPartName: 'ppt/theme/theme1.xml',
            fingerprint: 'e'.repeat(64),
          },
          rollbackBoundary: 'entire-copy-batch',
        },
      ],
      blockers: [],
      risks: [],
      preserveOnlyRisks: [],
      sourceFileSha256: stale ? '0'.repeat(64) : sha256(donor),
      targetFileSha256: sha256(target),
      sourceFingerprint: 'a'.repeat(64),
      targetFingerprint: 'b'.repeat(64),
    },
  })
  return { target, donor, copyReport, fakeXdoc }
}

function runGate(input, expectedStatus) {
  const result = spawnSync(
    process.execPath,
    [
      gateScript,
      '--target',
      input.target,
      '--donor',
      input.donor,
      '--copy-report',
      input.copyReport,
      '--xdoc-bin',
      input.fakeXdoc,
      '--json',
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  )
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout)
  return JSON.parse(result.stdout)
}

test('copy size gate passes current same-size inputs', () => {
  const report = runGate(fixture(), 0)

  assert.equal(report.status, 'pass')
  assert.equal(report.agentGate.passed, true)
  assert.equal(report.agentGate.nextAction, 'continue-copy-from')
  assert.equal(report.slideSizeComparison.matches, true)
  assert.equal(report.copyReport.templateStrategy, 'register-source')
  assert.equal(report.copyReport.slideSizeStrategy, 'require-match')
  assert.equal(report.copyReport.templatePlanCount, 1)
})

test('copy size gate blocks different slide sizes without an explicit strategy', () => {
  const report = runGate(fixture({ mismatch: true }), 3)

  assert.equal(report.status, 'fail')
  assert.equal(report.agentGate.nextAction, 'choose-explicit-slide-size-strategy')
  assert.equal(
    report.agentGate.failures.some((failure) => failure.code === 'slide-size-mismatch'),
    true,
  )
})

test('copy size gate rejects a dry-run report bound to stale donor bytes', () => {
  const report = runGate(fixture({ stale: true }), 3)

  assert.equal(report.status, 'fail')
  assert.equal(report.agentGate.nextAction, 'refresh-copy-from-preflight')
  assert.equal(
    report.agentGate.failures.some((failure) => failure.code === 'donor-file-sha256-mismatch'),
    true,
  )
})

test('copy size gate rejects an incomplete template closure mapping', () => {
  const input = fixture()
  const report = JSON.parse(readFileSync(input.copyReport, 'utf8'))
  delete report.preflight.templates[0].master.targetPartName
  writeJson(input.copyReport, report)

  const result = runGate(input, 3)

  assert.equal(result.status, 'fail')
  assert.equal(
    result.agentGate.failures.some((failure) => failure.code === 'copy-template-plan-invalid'),
    true,
  )
})
