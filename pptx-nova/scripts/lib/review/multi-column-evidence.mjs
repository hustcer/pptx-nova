import { spawnSync } from 'node:child_process'
import { cliPath } from '../runtime/skill-paths.mjs'

// Recompute the existing gate against actual bytes; never trust a saved pass flag.
export function verifyMultiColumnEvidence({ candidate, visionDiff, review }) {
  const result = spawnSync(
    process.execPath,
    [
      cliPath('review/multi-column-gate.mjs'),
      '--candidate',
      candidate,
      '--vision-diff',
      visionDiff,
      '--review',
      review,
      '--json',
    ],
    { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 60_000 },
  )
  let report
  try {
    report = JSON.parse(result.stdout || result.stderr)
    if (report?.schemaVersion !== 'pptx-nova-multi-column-review-gate/v1')
      throw new Error('Unexpected multi-column gate report')
  } catch {
    return {
      schemaVersion: 'pptx-nova-multi-column-review-gate/v1',
      status: 'error',
      error: {
        code: 'multi-column-review-gate-error',
        message:
          result.error?.message ||
          result.stderr?.trim() ||
          'Multi-column gate did not emit a valid report',
      },
      agentGate: { passed: false },
    }
  }
  return result.status === 0
    ? report
    : { ...report, agentGate: { ...report.agentGate, passed: false } }
}
