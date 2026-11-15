#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { readFileSync, realpathSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { cliPath } from '../../lib/runtime/skill-paths.mjs'
import { prepareEvidenceOutputs } from '../../lib/runtime/evidence-output.mjs'
import { fileSha256 } from '../../lib/review/canonical-visual-evidence.mjs'
import { acceptScopedEditVisuals } from '../../lib/edit/visual-acceptance.mjs'

const usage = `Usage:
  node <skill-root>/scripts/cli/edit/finalize.mjs --contract <path> --candidate <pptx> --manifest <path> --review <path> --output <pptx> --report <path> [--json]

Replays the existing Edit Contract gate from its current run evidence, verifies the exact
source/candidate scoped PNG/PDF artifacts and actual bound Edit review, then publishes those bytes.
Edits to retained objects use complete semantic comparison. The explicit native-artwork profile
also permits declared, bounded text-free freeforms after independent source-XML preservation checks;
every other OPC part must remain byte-identical. Raw native oracle
decisions stay intact. Failed machine checks, environment uncertainty and stale reviews still stop.
Output and report must be fresh paths. No overwrite switch or implicit user confirmation.
`
try {
  const args = {},
    allowed = new Set(['contract', 'candidate', 'manifest', 'review', 'output', 'report'])
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i]
    if (arg === '--help') {
      process.stdout.write(usage)
      process.exit(0)
    }
    if (arg === '--json') continue
    const key = arg.slice(2),
      value = process.argv[++i]
    if (!arg.startsWith('--') || !allowed.has(key) || args[key] || !value || value.startsWith('--'))
      throw new Error(`Invalid, repeated or missing argument: ${arg}`)
    args[key] = resolve(value)
  }
  for (const key of allowed) if (!args[key]) throw new Error(`--${key} is required`)
  const contract = JSON.parse(readFileSync(args.contract, 'utf8'))
  const publisher = prepareEvidenceOutputs(contract.source.pptx, {
    output: args.output,
    report: args.report,
  })
  const inputPaths = [args.contract, args.candidate, args.manifest, args.review]
  const identities = inputPaths.map((path) => [realpathSync(path), fileSha256(path)])
  // Preserve every previous report and replay under a unique current-run name.
  const replay = join(
    dirname(args.contract),
    `edit-contract-final-${Date.now()}-${process.pid}.json`,
  )
  const result = spawnSync(
    process.execPath,
    [
      cliPath('edit/contract-gate.mjs'),
      '--contract',
      args.contract,
      '--candidate',
      args.candidate,
      '--output',
      replay,
      '--strict',
      '--json',
    ],
    { encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024 },
  )
  if (result.status !== 0)
    throw new Error(`Edit Contract replay failed: ${result.stderr || result.stdout}`)
  const gate = JSON.parse(result.stdout)
  const acceptance = acceptScopedEditVisuals({ ...args, gate })
  if (identities.some(([path, sha]) => fileSha256(path) !== sha))
    throw new Error('Edit inputs changed during finalization')
  const candidateBytes = readFileSync(args.candidate)
  if (fileSha256(args.candidate) !== acceptance.acceptance.candidateSha256)
    throw new Error('Candidate changed before publication')
  if (realpathSync(args.candidate) === args.output)
    throw new Error('Final output must differ from the candidate')
  const published = publisher.publish('output', candidateBytes)
  const report = {
    ...acceptance,
    schemaVersion: 'pptx-nova-edit-finalization/v1',
    status: 'delivered',
    output: published,
    replay,
    outputSha256: fileSha256(published),
  }
  publisher.publish('report', JSON.stringify(report, null, 2) + '\n')
  process.stdout.write(JSON.stringify(report, null, 2) + '\n')
} catch (error) {
  process.stderr.write(`[error] ${error.message}\n`)
  process.exitCode = 1
}
