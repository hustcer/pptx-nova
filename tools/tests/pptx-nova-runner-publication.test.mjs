import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  buildAgentResult,
  createRunnerRuntime,
  summarizePhaseError,
} from '../../pptx-nova/scripts/lib/runner-runtime.mjs'

for (const exitCode of [0, 9]) {
  test(`runner retains partial publication and stops on failure JSON (exit ${exitCode})`, () => {
    const runDir = mkdtempSync(join(tmpdir(), 'nova-publication-'))
    const report = {
      schemaVersion: 'pptx-error/v1',
      status: 'error',
      error: { code: 'output_error' },
      primaryOutputPublished: true,
      outputUntouched: false,
      output: join(runDir, 'candidate.pptx'),
      blockedOutput: join(runDir, 'candidate.pptx.xdoc.json'),
    }
    const summary = { runDir, phases: [], gates: [], status: 'failed', deliveryReady: false }
    assert.throws(
      () =>
        createRunnerRuntime().runJsonPhase(summary, {
          name: 'apply',
          bin: process.execPath,
          args: [
            '-e',
            `process.stdout.write(${JSON.stringify(JSON.stringify(report))}); process.exit(${exitCode})`,
          ],
          artifact: join(runDir, 'apply.json'),
        }),
      (error) => {
        summary.error = summarizePhaseError(error)
        assert.match(error.message, /primary PPTX was published/)
        return true
      },
    )
    assert.deepEqual(JSON.parse(readFileSync(join(runDir, 'apply.json'), 'utf8')), report)
    assert.equal(summary.phases.length, 1)
    assert.equal(summary.phases[0].status, 'failed')
    const compact = buildAgentResult(summary)
    assert.equal(compact.deliveryReady, false)
    for (const key of ['primaryOutputPublished', 'outputUntouched', 'output', 'blockedOutput']) {
      assert.equal(summary.phases[0][key], report[key])
      assert.equal(compact.error[key], report[key])
    }
  })
}

test('runner does not invent publication facts for legacy or pre-publication errors', () => {
  const summary = summarizePhaseError(new Error('transport failed'))
  assert.equal('outputUntouched' in summary, false)
  assert.equal('primaryOutputPublished' in summary, false)
  const explicit = summarizePhaseError({
    report: { primaryOutputPublished: false, outputUntouched: true },
  })
  assert.equal(explicit.primaryOutputPublished, false)
  assert.equal(explicit.outputUntouched, true)
})
