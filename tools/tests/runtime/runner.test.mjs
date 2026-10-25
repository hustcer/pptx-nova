import assert from 'node:assert/strict'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { skillUrl } from '../helpers/common.mjs'

test('shared runner runtime fails closed on invalid JSON and spawn errors without leaking commands to progress', async () => {
  const { createRunnerRuntime, PhaseFailure } = await import(
    skillUrl('scripts/lib/runtime/runner-runtime.mjs')
  )
  const root = mkdtempSync(join(tmpdir(), 'pptx-nova-runtime-'))
  const events = []
  const runtime = createRunnerRuntime({
    getProgressReporter: () => ({ emit: (event, details) => events.push({ event, ...details }) }),
  })
  const invalidSummary = { runDir: root, phases: [], gates: [] }
  assert.throws(
    () =>
      runtime.runJsonPhase(invalidSummary, {
        name: 'invalid-json',
        bin: process.execPath,
        args: ['-e', "process.stdout.write('not json')"],
        artifact: join(root, 'invalid.json'),
      }),
    (error) => error instanceof PhaseFailure && error.phase === 'invalid-json',
  )
  assert.equal(existsSync(join(root, 'invalid-json.stdout.txt')), true)
  assert.equal(invalidSummary.phases[0].status, 'failed')

  const spawnSummary = { runDir: root, phases: [], gates: [] }
  assert.throws(
    () =>
      runtime.runPlainPhase(spawnSummary, {
        name: 'spawn-failure',
        bin: join(root, 'missing-executable'),
        args: ['secret-argument'],
      }),
    (error) => error instanceof PhaseFailure && error.phase === 'spawn-failure',
  )
  assert.equal(spawnSummary.phases[0].status, 'failed')
  assert.equal(
    events.some((event) => 'command' in event || JSON.stringify(event).includes('secret-argument')),
    false,
  )
})
